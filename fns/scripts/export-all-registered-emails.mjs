import fs from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import admin from "firebase-admin";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_CONFIG = {
  execution: {
    dryRun: false,
    logLevel: "info",
    progressEvery: 500,
  },
  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID || "",
    databaseURL: process.env.FIREBASE_DATABASE_URL || "",
    serviceAccountPath: process.env.GOOGLE_APPLICATION_CREDENTIALS || "",
    serviceAccountJson: process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "",
  },
  audit: {
    includeAuth: true,
    includeFirestore: true,
    includeRealtimeDatabase: false,
  },
  firestore: {
    rootCollections: ["users", "requests", "customers", "userdata"],
    includeCollectionNames: [],
    excludeCollectionNames: ["ai_analysis_logs", "quota_counters", "account_enforcement", "mail"],
    includePathPrefixes: [],
    excludePathPrefixes: [],
    pageSize: 250,
    maxDocuments: 50000,
    maxDepth: 8,
  },
  rtdb: {
    paths: [],
    includePathPrefixes: [],
    excludePathPrefixes: [],
    maxNodes: 25000,
    maxDepth: 12,
  },
  extraction: {
    emailFieldHints: [
      "email",
      "emails",
      "userEmail",
      "contactEmail",
      "emailAddress",
      "owner.email",
      "profile.email",
      "contact.email",
      "athleteEmail",
      "username"
    ],
    includeUsernameAsEmailFallback: true,
    maxStringLength: 8000,
    maxMatchesPerString: 20,
  },
  output: {
    directory: path.resolve(__dirname, "../output/email-audit"),
    csvBaseName: "all-registered-emails",
    summaryBaseName: "all-registered-emails-summary",
  },
};

const EMAIL_REGEX =
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

async function main() {
  const config = await loadConfig();
  validateConfig(config);

  const context = createContext(config);
  log(context, "info", "BOOT", "Starting unified email audit", {
    dryRun: context.dryRun,
    config: redactConfig(config),
  });

  initializeFirebase(config.firebase, context);

  if (config.audit.includeAuth) {
    await collectFromAuth(context);
  }

  if (config.audit.includeFirestore) {
    await collectFromFirestore(context);
  }

  if (config.audit.includeRealtimeDatabase) {
    await collectFromRealtimeDatabase(context);
  }

  const outputs = await writeOutputs(context);

  log(context, "info", "SUMMARY", "Email audit completed", {
    discoveredSources: context.auditSummary.detectedSources,
    totalCandidates: context.metrics.totalCandidates,
    validUnique: context.metrics.validUnique,
    invalid: context.metrics.invalid,
    empty: context.metrics.empty,
    duplicates: context.metrics.duplicates,
    authCandidates: context.metrics.auth,
    firestoreCandidates: context.metrics.firestore,
    rtdbCandidates: context.metrics.rtdb,
    authUsersScanned: context.metrics.authUsersScanned,
    firestoreDocsScanned: context.metrics.firestoreDocsScanned,
    rtdbNodesScanned: context.metrics.rtdbNodesScanned,
    csv: outputs.csvPath,
    summary: outputs.summaryPath,
    durationMs: Date.now() - context.startedAt,
  });
}

async function loadConfig() {
  const args = process.argv.slice(2);
  const configArg = args.find((arg) => arg.startsWith("--config="));
  const cliOverrides = parseCliOverrides(args);

  let fileConfig = {};
  if (configArg) {
    const configPath = path.resolve(process.cwd(), configArg.slice("--config=".length));
    const raw = await fs.readFile(configPath, "utf8");
    fileConfig = JSON.parse(raw);
  }

  return deepMerge(deepMerge(DEFAULT_CONFIG, fileConfig), cliOverrides);
}

function parseCliOverrides(args) {
  const overrides = {};

  for (const arg of args) {
    if (arg === "--dry-run") {
      setPathValue(overrides, "execution.dryRun", true);
      continue;
    }
    if (arg.startsWith("--firestore-root-collections=")) {
      setPathValue(
        overrides,
        "firestore.rootCollections",
        splitCsv(arg.slice("--firestore-root-collections=".length))
      );
      continue;
    }
    if (arg.startsWith("--firestore-include-prefixes=")) {
      setPathValue(
        overrides,
        "firestore.includePathPrefixes",
        splitCsv(arg.slice("--firestore-include-prefixes=".length))
      );
      continue;
    }
    if (arg.startsWith("--rtdb-paths=")) {
      setPathValue(
        overrides,
        "rtdb.paths",
        splitCsv(arg.slice("--rtdb-paths=".length))
      );
      continue;
    }
  }

  return overrides;
}

function validateConfig(config) {
  if (!config.firebase.serviceAccountPath && !config.firebase.serviceAccountJson) {
    throw new Error(
      "Missing Firebase credentials. Set firebase.serviceAccountPath or firebase.serviceAccountJson."
    );
  }

  if (config.audit.includeRealtimeDatabase) {
    if (!config.firebase.databaseURL) {
      throw new Error("Realtime Database audit enabled but firebase.databaseURL is missing.");
    }
    if (!config.rtdb.paths.length) {
      throw new Error("Realtime Database audit enabled but rtdb.paths is empty.");
    }
  }
}

function createContext(config) {
  return {
    config,
    dryRun: Boolean(config.execution.dryRun),
    startedAt: Date.now(),
    dedupe: new Map(),
    records: [],
    metrics: {
      totalCandidates: 0,
      validUnique: 0,
      invalid: 0,
      empty: 0,
      duplicates: 0,
      authUsersScanned: 0,
      firestoreDocsScanned: 0,
      rtdbNodesScanned: 0,
      auth: 0,
      firestore: 0,
      rtdb: 0,
    },
    auditSummary: {
      detectedSources: {
        auth: false,
        firestore: false,
        rtdb: false,
      },
      firestoreCollectionsScanned: [],
      rtdbPathsScanned: [],
      notes: [],
    },
  };
}

function initializeFirebase(firebaseConfig, context) {
  if (admin.apps.length > 0) {
    return;
  }

  const credentials = firebaseConfig.serviceAccountJson
    ? JSON.parse(firebaseConfig.serviceAccountJson)
    : JSON.parse(readUtf8File(firebaseConfig.serviceAccountPath));

  admin.initializeApp({
    credential: admin.credential.cert(credentials),
    projectId: firebaseConfig.projectId || credentials.project_id,
    databaseURL: firebaseConfig.databaseURL || undefined,
  });

  log(context, "info", "FIREBASE", "Admin SDK initialized", {
    projectId: firebaseConfig.projectId || credentials.project_id,
    databaseURL: firebaseConfig.databaseURL || null,
  });
}

async function collectFromAuth(context) {
  log(context, "info", "AUTH", "Scanning Firebase Authentication users");

  let pageToken = undefined;
  do {
    const result = await admin.auth().listUsers(1000, pageToken);

    for (const userRecord of result.users) {
      context.metrics.authUsersScanned += 1;
      const email = normalizeEmail(userRecord.email);
      registerCandidate(context, {
        rawEmail: email.original,
        source: "auth",
        sourcePath: `auth/users/${userRecord.uid}`,
        uid: userRecord.uid,
        notes: "Firebase Authentication email",
      });
    }

    pageToken = result.pageToken;
  } while (pageToken);

  context.auditSummary.detectedSources.auth = context.metrics.authUsersScanned > 0;
}

async function collectFromFirestore(context) {
  const db = admin.firestore();
  const settings = context.config.firestore;

  const rootCollections = settings.rootCollections.length
    ? settings.rootCollections
    : (await db.listCollections()).map((entry) => entry.id);

  for (const collectionName of rootCollections) {
    if (!shouldIncludeCollectionName(collectionName, settings)) {
      continue;
    }

    context.auditSummary.firestoreCollectionsScanned.push(collectionName);
    await walkCollection(context, db.collection(collectionName), 0);
  }

  context.auditSummary.detectedSources.firestore = context.metrics.firestoreDocsScanned > 0;
}

async function walkCollection(context, collectionRef, depth) {
  const settings = context.config.firestore;
  if (depth > settings.maxDepth) {
    return;
  }
  if (!shouldTraversePath(collectionRef.path, settings.includePathPrefixes, settings.excludePathPrefixes, false)) {
    return;
  }

  let lastDocId = null;

  while (true) {
    if (settings.maxDocuments > 0 && context.metrics.firestoreDocsScanned >= settings.maxDocuments) {
      context.auditSummary.notes.push(`Firestore maxDocuments reached at ${settings.maxDocuments}`);
      return;
    }

    let query = collectionRef
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(settings.pageSize);

    if (lastDocId) {
      query = query.startAfter(lastDocId);
    }

    const snapshot = await query.get();
    if (snapshot.empty) {
      return;
    }

    for (const doc of snapshot.docs) {
      context.metrics.firestoreDocsScanned += 1;
      maybeLogProgress(context, "FIRESTORE", context.metrics.firestoreDocsScanned);

      if (shouldTraversePath(doc.ref.path, settings.includePathPrefixes, settings.excludePathPrefixes, true)) {
        scanUnknownNode(context, doc.data(), "firestore", doc.ref.path, {
          docId: doc.id,
          docPath: doc.ref.path,
        });
      }

      const subcollections = await doc.ref.listCollections();
      for (const subcollection of subcollections) {
        if (!shouldIncludeCollectionName(subcollection.id, settings)) {
          continue;
        }
        await walkCollection(context, subcollection, depth + 1);
      }

      lastDocId = doc.id;
    }
  }
}

async function collectFromRealtimeDatabase(context) {
  const db = admin.database();
  const settings = context.config.rtdb;

  for (const rawPath of settings.paths) {
    const rootPath = normalizeRtdbPath(rawPath);
    context.auditSummary.rtdbPathsScanned.push(rootPath);

    const snapshot = await db.ref(rootPath).get();
    if (!snapshot.exists()) {
      context.auditSummary.notes.push(`RTDB path not found: ${rootPath}`);
      continue;
    }

    walkRtdbNode(context, snapshot.val(), rootPath, 0);
  }

  context.auditSummary.detectedSources.rtdb = context.metrics.rtdbNodesScanned > 0;
}

function walkRtdbNode(context, node, currentPath, depth) {
  const settings = context.config.rtdb;
  if (settings.maxDepth >= 0 && depth > settings.maxDepth) {
    return;
  }
  if (settings.maxNodes > 0 && context.metrics.rtdbNodesScanned >= settings.maxNodes) {
    context.auditSummary.notes.push(`RTDB maxNodes reached at ${settings.maxNodes}`);
    return;
  }
  if (!shouldTraversePath(currentPath, settings.includePathPrefixes, settings.excludePathPrefixes, true, true)) {
    return;
  }

  context.metrics.rtdbNodesScanned += 1;
  maybeLogProgress(context, "RTDB", context.metrics.rtdbNodesScanned);
  scanUnknownNode(context, node, "rtdb", currentPath, {
    docId: "",
    docPath: currentPath,
  });
}

function scanUnknownNode(context, node, source, sourcePath, docMeta, ancestors = []) {
  if (node === null || node === undefined) {
    return;
  }

  if (typeof node === "string") {
    extractEmailsFromString(node, context.config.extraction.maxMatchesPerString).forEach((email) => {
      registerCandidate(context, {
        rawEmail: email,
        source,
        sourcePath,
        uid: inferUid(source, docMeta, node),
        notes: buildNotes(source, sourcePath, "string-match"),
      });
    });
    return;
  }

  if (Array.isArray(node)) {
    node.forEach((entry, index) => {
      const nextPath = `${sourcePath}[${index}]`;
      if (source === "rtdb") {
        walkRtdbNode(context, entry, nextPath, ancestors.length + 1);
      } else {
        scanUnknownNode(context, entry, source, nextPath, docMeta, [node, ...ancestors]);
      }
    });
    return;
  }

  if (!isPlainObject(node)) {
    return;
  }

  for (const [key, value] of Object.entries(node)) {
    const childPath = source === "rtdb" ? joinRtdbPath(sourcePath, key) : `${sourcePath}.${key}`;
    const normalizedKey = normalizeKey(key);

    if (typeof value === "string" && looksLikeEmailField(normalizedKey, context.config.extraction.emailFieldHints)) {
      registerCandidate(context, {
        rawEmail: value,
        source,
        sourcePath: childPath,
        uid: inferUid(source, docMeta, node),
        notes: buildNotes(source, childPath, `field:${key}`),
      });
      continue;
    }

    if (
      typeof value === "string" &&
      normalizedKey === "username" &&
      context.config.extraction.includeUsernameAsEmailFallback &&
      EMAIL_REGEX.test(value.trim())
    ) {
      registerCandidate(context, {
        rawEmail: value,
        source,
        sourcePath: childPath,
        uid: inferUid(source, docMeta, node),
        notes: buildNotes(source, childPath, "username-email-fallback"),
      });
      continue;
    }

    if (typeof value === "string" && value.length <= context.config.extraction.maxStringLength) {
      extractEmailsFromString(value, context.config.extraction.maxMatchesPerString).forEach((email) => {
        registerCandidate(context, {
          rawEmail: email,
          source,
          sourcePath: childPath,
          uid: inferUid(source, docMeta, node),
          notes: buildNotes(source, childPath, `embedded-string:${key}`),
        });
      });
    }

    if (source === "rtdb") {
      walkRtdbNode(context, value, childPath, ancestors.length + 1);
    } else {
      scanUnknownNode(context, value, source, childPath, docMeta, [node, ...ancestors]);
    }
  }
}

function registerCandidate(context, candidate) {
  context.metrics.totalCandidates += 1;
  if (candidate.source === "auth") {
    context.metrics.auth += 1;
  } else if (candidate.source === "firestore") {
    context.metrics.firestore += 1;
  } else if (candidate.source === "rtdb") {
    context.metrics.rtdb += 1;
  }

  const normalized = normalizeEmail(candidate.rawEmail);
  if (!normalized.original) {
    context.metrics.empty += 1;
    return;
  }
  if (!normalized.isValid) {
    context.metrics.invalid += 1;
    return;
  }

  const dedupeKey = normalized.cleanedEmail;
  const existing = context.dedupe.get(dedupeKey);
  if (existing) {
    context.metrics.duplicates += 1;
    existing.notes = mergeNotes(existing.notes, candidate.notes);
    existing.source = mergeSource(existing.source, candidate.source);
    existing.sourcePath = mergeSourcePath(existing.sourcePath, candidate.sourcePath);
    if (!existing.uid && candidate.uid) {
      existing.uid = candidate.uid;
    }
    return;
  }

  const record = {
    email: dedupeKey,
    source: candidate.source,
    sourcePath: candidate.sourcePath,
    uid: candidate.uid || "",
    notes: candidate.notes || "",
  };

  context.dedupe.set(dedupeKey, record);
  context.records.push(record);
}

async function writeOutputs(context) {
  await fs.mkdir(context.config.output.directory, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const csvPath = path.join(
    context.config.output.directory,
    `${context.config.output.csvBaseName}-${stamp}.csv`
  );
  const summaryPath = path.join(
    context.config.output.directory,
    `${context.config.output.summaryBaseName}-${stamp}.json`
  );

  context.records.sort((left, right) => left.email.localeCompare(right.email));
  context.metrics.validUnique = context.records.length;

  const csv = [
    ["email", "source", "sourcePath", "uid", "notes"],
    ...context.records.map((item) => [item.email, item.source, item.sourcePath, item.uid, item.notes]),
  ]
    .map((row) => row.map(csvEscape).join(","))
    .join("\n");

  const summary = {
    generatedAt: new Date().toISOString(),
    dryRun: context.dryRun,
    metrics: context.metrics,
    auditSummary: context.auditSummary,
  };

  if (!context.dryRun) {
    await fs.writeFile(csvPath, csv, "utf8");
    await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2), "utf8");
  }

  return { csvPath, summaryPath };
}

function inferUid(source, docMeta, objectValue) {
  if (source === "auth") {
    return docMeta?.docId || "";
  }
  if (objectValue && typeof objectValue === "object" && typeof objectValue.uid === "string") {
    return objectValue.uid;
  }
  if (docMeta?.docPath?.startsWith("users/")) {
    return docMeta.docId;
  }
  if (docMeta?.docPath?.startsWith("userdata/")) {
    return docMeta.docId;
  }
  if (docMeta?.docPath?.startsWith("customers/")) {
    return docMeta.docId;
  }
  return "";
}

function buildNotes(source, sourcePath, reason) {
  if (source === "auth") {
    return "Firebase Authentication";
  }
  return `${source}:${reason}`;
}

function normalizeEmail(rawEmail) {
  const original = typeof rawEmail === "string" ? sanitizeEmail(rawEmail) : "";
  const cleanedEmail = original.toLowerCase();
  return {
    original,
    cleanedEmail,
    isValid: EMAIL_REGEX.test(cleanedEmail),
  };
}

function sanitizeEmail(value) {
  return String(value || "")
    .trim()
    .replace(/^mailto:/i, "")
    .replace(/^[<("'\[]+/, "")
    .replace(/[>)"'\].,;:]+$/, "")
    .trim();
}

function extractEmailsFromString(value, maxMatches) {
  const matches = String(value || "").match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  return matches.slice(0, maxMatches).map((entry) => sanitizeEmail(entry));
}

function shouldIncludeCollectionName(name, settings) {
  if (settings.includeCollectionNames.length && !settings.includeCollectionNames.includes(name)) {
    return false;
  }
  if (settings.excludeCollectionNames.includes(name)) {
    return false;
  }
  return true;
}

function shouldTraversePath(pathValue, includePrefixes, excludePrefixes, requireDocMatch, isRtdb = false) {
  const normalizedPath = isRtdb ? normalizeRtdbPath(pathValue) : pathValue;

  if (excludePrefixes.some((prefix) => normalizedPath.startsWith(isRtdb ? normalizeRtdbPath(prefix) : prefix))) {
    return false;
  }

  if (!includePrefixes.length) {
    return true;
  }

  return includePrefixes.some((prefix) => {
    const normalizedPrefix = isRtdb ? normalizeRtdbPath(prefix) : prefix;
    if (requireDocMatch) {
      return normalizedPath.startsWith(normalizedPrefix);
    }
    return normalizedPath.startsWith(normalizedPrefix) || normalizedPrefix.startsWith(normalizedPath);
  });
}

function looksLikeEmailField(normalizedKey, hints) {
  if (normalizedKey.includes("email") || normalizedKey.includes("correo")) {
    return true;
  }
  return hints.some((hint) => normalizeKey(hint) === normalizedKey || normalizedKey.endsWith(normalizeKey(hint)));
}

function normalizeKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[\s_-]/g, "")
    .replace(/\.+/g, ".");
}

function joinRtdbPath(base, key) {
  if (base === "/") {
    return `/${key}`;
  }
  return `${base}/${key}`;
}

function mergeSource(current, incoming) {
  if (current === incoming) {
    return current;
  }
  const parts = new Set(`${current},${incoming}`.split(",").map((entry) => entry.trim()).filter(Boolean));
  return [...parts].sort().join(",");
}

function mergeSourcePath(current, incoming) {
  if (!current) return incoming;
  if (!incoming || current === incoming) return current;

  const parts = new Set(`${current} | ${incoming}`.split(" | ").map((entry) => entry.trim()).filter(Boolean));
  return [...parts].slice(0, 5).join(" | ");
}

function mergeNotes(current, incoming) {
  if (!current) return incoming || "";
  if (!incoming || current === incoming) return current;

  const parts = new Set(`${current}; ${incoming}`.split("; ").map((entry) => entry.trim()).filter(Boolean));
  return [...parts].slice(0, 5).join("; ");
}

function maybeLogProgress(context, scope, value) {
  const every = context.config.execution.progressEvery || 0;
  if (every > 0 && value > 0 && value % every === 0) {
    log(context, "info", scope, "Progress", { value });
  }
}

function csvEscape(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function redactConfig(config) {
  const clone = JSON.parse(JSON.stringify(config));
  if (clone.firebase.serviceAccountPath) {
    clone.firebase.serviceAccountPath = "***redacted-path***";
  }
  if (clone.firebase.serviceAccountJson) {
    clone.firebase.serviceAccountJson = "***redacted***";
  }
  return clone;
}

function readUtf8File(filePath) {
  if (!filePath) {
    throw new Error("Service account path is empty.");
  }
  return readFileSync(filePath, "utf8");
}

function splitCsv(value) {
  return String(value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function setPathValue(target, dottedPath, value) {
  const parts = dottedPath.split(".");
  let current = target;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const key = parts[index];
    if (!isPlainObject(current[key])) {
      current[key] = {};
    }
    current = current[key];
  }
  current[parts[parts.length - 1]] = value;
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepMerge(base, override) {
  if (override === undefined) {
    return base;
  }
  if (Array.isArray(base) && Array.isArray(override)) {
    return override.slice();
  }
  if (!isPlainObject(base) || !isPlainObject(override)) {
    return override;
  }

  const merged = { ...base };
  for (const [key, value] of Object.entries(override)) {
    merged[key] = deepMerge(base[key], value);
  }
  return merged;
}

function log(context, level, scope, message, meta) {
  const configured = LOG_LEVELS[context?.config?.execution?.logLevel] ?? LOG_LEVELS.info;
  if ((LOG_LEVELS[level] ?? LOG_LEVELS.info) > configured) {
    return;
  }

  const suffix = meta ? ` ${JSON.stringify(meta)}` : "";
  const line = `[${new Date().toISOString()}] [${level.toUpperCase()}] [${scope}] ${message}${suffix}`;
  if (level === "error") {
    console.error(line);
    return;
  }
  if (level === "warn") {
    console.warn(line);
    return;
  }
  console.log(line);
}

main().catch((error) => {
  console.error(`[${new Date().toISOString()}] [FATAL] ${error.stack || error.message}`);
  process.exitCode = 1;
});
