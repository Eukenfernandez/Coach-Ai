import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import crypto from "node:crypto";

export const DEFAULT_CONFIG = {
  execution: {
    dryRun: false,
    logLevel: process.env.EMAIL_EXPORT_LOG_LEVEL || "info",
    progressEvery: 1000,
  },
  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID || "",
    databaseURL: process.env.FIREBASE_DATABASE_URL || "",
    serviceAccountPath: process.env.GOOGLE_APPLICATION_CREDENTIALS || "",
    serviceAccountJson: process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "",
  },
  sources: {
    firestore: {
      enabled: true,
      rootCollections: [],
      includeCollectionNames: [],
      excludeCollectionNames: [],
      includePathPrefixes: [],
      excludePathPrefixes: [],
      pageSize: 250,
      maxDocuments: 50000,
      maxDepth: 8,
    },
    realtimeDatabase: {
      enabled: true,
      paths: [],
      includePathPrefixes: [],
      excludePathPrefixes: [],
      maxNodes: 50000,
      maxDepth: 20,
    },
  },
  limits: {
    maxCandidates: 200000,
    maxUniqueEmails: 100000,
    maxMatchesPerString: 25,
    maxStringLength: 12000,
    maxRuntimeMs: 15 * 60 * 1000,
    allowPartialResults: false,
    stopOnFirstError: false,
  },
  output: {
    directory: "",
    csvBaseName: "marketing-contacts",
    firestoreCollection: "marketing_contacts",
    syncStateCollection: "marketing_sync_state",
    triggerEmailCollection: "mail",
    writeSuppressedCsv: true,
    writeSummaryJson: true,
  },
  consent: {
    required: true,
    ancestorSearchDepth: 4,
    objectSearchDepth: 4,
    genericPositiveIsConsent: false,
    marketingPositiveKeys: [
      "marketingConsent",
      "acceptedMarketing",
      "newsletterOptIn",
      "newsletterAccepted",
      "emailMarketingConsent",
      "marketing.optIn",
      "preferences.marketing",
      "communications.marketing",
      "newsletter",
      "marketing",
    ],
    marketingNegativeKeys: [
      "unsubscribe",
      "unsubscribed",
      "marketingBlocked",
      "doNotEmail",
      "optOut",
      "marketing.optOut",
      "emailBlacklisted",
      "suppressed",
      "blocked",
    ],
    ambiguousPositiveKeys: [
      "consent",
      "optIn",
      "subscribed",
      "subscriptionStatus",
      "emailAllowed",
    ],
    transactionalOnlyKeys: [
      "acceptedTerms",
      "termsAccepted",
      "privacyAccepted",
      "serviceNotifications",
      "accountNotifications",
      "billingEmails",
      "receiptEmails",
    ],
    positiveValues: [
      "true",
      "yes",
      "y",
      "1",
      "accepted",
      "granted",
      "subscribed",
      "optedin",
      "optedinmarketing",
      "active",
      "enabled",
    ],
    negativeValues: [
      "false",
      "no",
      "n",
      "0",
      "rejected",
      "denied",
      "unsubscribed",
      "optedout",
      "inactive",
      "disabled",
    ],
  },
  integrations: {
    mailchimp: {
      enabled: false,
      purpose: "marketing",
      apiKey: process.env.MAILCHIMP_API_KEY || "",
      audienceId: process.env.MAILCHIMP_AUDIENCE_ID || "",
      tags: ["firebase-export"],
      statusIfConsented: "subscribed",
      statusIfNoConsent: "skip",
      batchSize: 100,
      rateLimitMs: 300,
      maxPerRun: 5000,
      maxRetries: 3,
      retryBaseMs: 1000,
      syncNamespace: "default-mailchimp-audience",
    },
    brevo: {
      enabled: false,
      purpose: "marketing",
      apiKey: process.env.BREVO_API_KEY || "",
      listIds: [],
      updateEnabled: true,
      emailBlacklistedIfNoConsent: true,
      batchSize: 100,
      rateLimitMs: 300,
      maxPerRun: 5000,
      maxRetries: 3,
      retryBaseMs: 1000,
      syncNamespace: "default-brevo-list",
    },
    triggerEmail: {
      enabled: false,
      purpose: "transactional",
      campaignKey: "firebase-trigger-email-default",
      subject: "Campaign from Firebase",
      text: "This message was prepared automatically from Firebase.",
      html: "<p>This message was prepared automatically from Firebase.</p>",
      onlyConsented: true,
      batchSize: 100,
      maxPerRun: 5000,
      syncNamespace: "default-trigger-email",
    },
  },
};

export const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

export class RuntimeLimitError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "RuntimeLimitError";
    this.code = code;
  }
}

export async function loadConfig(defaultOutputDirectory) {
  const overrides = parseCliOverrides(process.argv.slice(2));
  let fileConfig = {};

  if (overrides.configPath) {
    const configPath = path.resolve(process.cwd(), overrides.configPath);
    const raw = await fs.readFile(configPath, "utf8");
    fileConfig = JSON.parse(raw);
  }

  const merged = deepMerge(DEFAULT_CONFIG, fileConfig);
  const withOutputDir = deepMerge(merged, {
    output: {
      directory: defaultOutputDirectory,
    },
  });

  return deepMerge(withOutputDir, overrides.configOverrides);
}

export function validateConfig(config) {
  if (!config.firebase.serviceAccountPath && !config.firebase.serviceAccountJson) {
    throw new Error(
      "Missing Firebase credentials. Set firebase.serviceAccountPath or firebase.serviceAccountJson."
    );
  }

  if (config.sources.realtimeDatabase.enabled) {
    if (!config.firebase.databaseURL) {
      throw new Error(
        "Realtime Database is enabled but firebase.databaseURL is empty."
      );
    }
    if (!config.sources.realtimeDatabase.paths.length) {
      throw new Error(
        "Realtime Database is enabled but no paths were configured. Use narrow paths instead of '/'."
      );
    }
  }
}

export function createRunContext(config) {
  return {
    config,
    dryRun: Boolean(config.execution.dryRun),
    runId: `${new Date().toISOString().replace(/[:.]/g, "-")}-${shortHash(crypto.randomUUID())}`,
    startedAt: Date.now(),
    partial: false,
    stopRequested: false,
    summary: {
      warnings: [],
      errors: [],
    },
    metrics: {
      scannedFirestoreDocs: 0,
      scannedRtdbNodes: 0,
      totalAnalyzed: 0,
      valid: 0,
      invalid: 0,
      empty: 0,
      duplicates: 0,
      consented: 0,
      reviewRequired: 0,
      suppressed: 0,
      exported: 0,
      syncSkippedAsDuplicate: 0,
      integrationCalls: 0,
    },
    dedupeMap: new Map(),
    syncStateCache: new Map(),
    report: {
      consented: [],
      reviewRequired: [],
      suppressed: [],
      all: [],
    },
  };
}

export function parseCliOverrides(args) {
  const configOverrides = {};
  let configPath = "";

  for (const arg of args) {
    if (arg === "--dry-run") {
      setPathValue(configOverrides, "execution.dryRun", true);
      continue;
    }
    if (arg.startsWith("--config=")) {
      configPath = arg.slice("--config=".length);
      continue;
    }
    if (arg.startsWith("--firestore-root-collections=")) {
      setPathValue(
        configOverrides,
        "sources.firestore.rootCollections",
        splitCsvArg(arg.slice("--firestore-root-collections=".length))
      );
      continue;
    }
    if (arg.startsWith("--firestore-include-prefixes=")) {
      setPathValue(
        configOverrides,
        "sources.firestore.includePathPrefixes",
        splitCsvArg(arg.slice("--firestore-include-prefixes=".length))
      );
      continue;
    }
    if (arg.startsWith("--firestore-exclude-prefixes=")) {
      setPathValue(
        configOverrides,
        "sources.firestore.excludePathPrefixes",
        splitCsvArg(arg.slice("--firestore-exclude-prefixes=".length))
      );
      continue;
    }
    if (arg.startsWith("--rtdb-paths=")) {
      setPathValue(
        configOverrides,
        "sources.realtimeDatabase.paths",
        splitCsvArg(arg.slice("--rtdb-paths=".length))
      );
    }
  }

  return { configPath, configOverrides };
}

export function log(context, level, scope, message, meta) {
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

export function assertWithinLimits(context) {
  if (Date.now() - context.startedAt > context.config.limits.maxRuntimeMs) {
    throw new RuntimeLimitError(
      `Runtime exceeded ${context.config.limits.maxRuntimeMs} ms.`,
      "max-runtime"
    );
  }
}

export function maybeLogProgress(context, scope, payload) {
  const every = context.config.execution.progressEvery || 0;
  const marker =
    payload.analyzed ||
    payload.scannedFirestoreDocs ||
    payload.scannedRtdbNodes ||
    0;
  if (every > 0 && marker > 0 && marker % every === 0) {
    log(context, "info", scope, "Progress", payload);
  }
}

export function recordError(context, scope, error) {
  const entry = {
    scope,
    message: error?.message || String(error),
  };
  context.summary.errors.push(entry);
  log(context, "error", "ERROR", "Operation failed", entry);
}

export function handleLimitError(context, error) {
  context.partial = true;
  context.stopRequested = true;
  context.summary.warnings.push({
    code: error.code,
    message: error.message,
  });
  log(context, "warn", "LIMIT", error.message, {
    code: error.code,
    allowPartialResults: context.config.limits.allowPartialResults,
  });
}

export function redactSecrets(config) {
  const cloned = JSON.parse(JSON.stringify(config));
  if (cloned.firebase.serviceAccountPath) {
    cloned.firebase.serviceAccountPath = "***redacted-path***";
  }
  if (cloned.firebase.serviceAccountJson) {
    cloned.firebase.serviceAccountJson = "***redacted***";
  }
  if (cloned.integrations.mailchimp.apiKey) {
    cloned.integrations.mailchimp.apiKey = "***redacted***";
  }
  if (cloned.integrations.brevo.apiKey) {
    cloned.integrations.brevo.apiKey = "***redacted***";
  }
  return cloned;
}

export function splitCsvArg(value) {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function normalizeRtdbPath(value) {
  if (!value || value === "/") {
    return "/";
  }
  return `/${String(value).replace(/^\/+|\/+$/g, "")}`;
}

export function joinPath(base, key) {
  if (base === "/") {
    return `/${key}`;
  }
  return `${base}.${key}`;
}

export function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function sleep(ms) {
  if (!ms || ms <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function deepMerge(base, override) {
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

export function setPathValue(target, dottedPath, value) {
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

export function csvLine(values) {
  return values
    .map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`)
    .join(",");
}

export function chunkArray(items, chunkSize) {
  const chunks = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
}

export function stableHash(value) {
  return crypto.createHash("sha256").update(stableStringify(value)).digest("hex");
}

export function buildDeterministicDocId(value) {
  return stableHash(value);
}

export function shortHash(value) {
  return stableHash(value).slice(0, 8);
}

export function stableStringify(value) {
  return JSON.stringify(sortObjectDeep(value));
}

export function sortObjectDeep(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => sortObjectDeep(entry));
  }
  if (!isPlainObject(value)) {
    return value;
  }
  return Object.keys(value)
    .sort()
    .reduce((accumulator, key) => {
      accumulator[key] = sortObjectDeep(value[key]);
      return accumulator;
    }, {});
}

export function requireUtf8File(filePath) {
  if (!filePath) {
    throw new Error("Service account path is empty.");
  }
  try {
    return readFileSync(filePath, "utf8");
  } catch (error) {
    throw new Error(`Unable to read service account file at ${filePath}: ${error.message}`);
  }
}
