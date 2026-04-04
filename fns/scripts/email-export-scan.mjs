import {
  RuntimeLimitError,
  assertWithinLimits,
  canonicalizeForInternalUse,
  isPlainObject,
  joinPath,
  log,
  maybeLogProgress,
  normalizeRtdbPath,
} from "./email-export-scan-helpers.mjs";

const EMAIL_REGEX =
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

const EMAIL_FIELD_HINTS = new Set([
  "email",
  "emails",
  "correo",
  "mail",
  "contactemail",
  "emailaddress",
  "useremail",
  "customeremail",
  "owneremail",
  "billingemail",
  "loginemail",
  "primaryemail",
]);

let runtimeConsentConfig = null;

export async function scanSources(context, admin) {
  runtimeConsentConfig = context.config.consent;

  if (context.config.sources.firestore?.enabled) {
    await collectFromFirestore(context, admin);
  }

  if (context.config.sources.realtimeDatabase?.enabled) {
    await collectFromRealtimeDatabase(context, admin);
  }
}

export function finalizeContacts(context) {
  const consented = [];
  const reviewRequired = [];
  const suppressed = [];

  for (const contact of context.dedupeMap.values()) {
    contact.primarySource = contact.sources[0] || { source: "unknown", path: "" };
    contact.deliveryClassification = classifyContact(contact, context.config);
    contact.marketingEligible = contact.deliveryClassification === "marketing";

    if (contact.deliveryClassification === "marketing") {
      consented.push(contact);
      continue;
    }
    if (contact.deliveryClassification === "review_required") {
      reviewRequired.push(contact);
      continue;
    }
    suppressed.push(contact);
  }

  consented.sort((left, right) => left.email.localeCompare(right.email));
  reviewRequired.sort((left, right) => left.email.localeCompare(right.email));
  suppressed.sort((left, right) => left.email.localeCompare(right.email));

  context.report = {
    consented,
    reviewRequired,
    suppressed,
    all: [...consented, ...reviewRequired, ...suppressed],
  };

  context.metrics.valid = context.dedupeMap.size;
  context.metrics.consented = consented.length;
  context.metrics.reviewRequired = reviewRequired.length;
  context.metrics.suppressed = suppressed.length;
}

function classifyContact(contact, config) {
  if (contact.consent.status === "granted" && contact.consent.scope === "marketing") {
    return "marketing";
  }
  if (contact.consent.status === "denied") {
    return "transactional_only";
  }
  if (contact.consent.status === "transactional_only") {
    return "transactional_only";
  }
  if (!config.consent.required && contact.consent.status === "unknown") {
    return "review_required";
  }
  return "review_required";
}

async function collectFromFirestore(context, admin) {
  const db = admin.firestore();
  const settings = context.config.sources.firestore;
  const rootCollections = settings.rootCollections.length
    ? settings.rootCollections
    : (await db.listCollections())
        .map((collectionRef) => collectionRef.id)
        .filter((name) => shouldIncludeCollectionName(name, settings));

  log(context, "info", "FIRESTORE", "Starting recursive scan", {
    rootCollections,
    pageSize: settings.pageSize,
    maxDocuments: settings.maxDocuments,
  });

  for (const collectionName of rootCollections) {
    if (context.stopRequested) {
      return;
    }
    if (!shouldIncludeCollectionName(collectionName, settings)) {
      continue;
    }
    await walkCollection(context, admin, db.collection(collectionName), 0);
  }
}

async function walkCollection(context, admin, collectionRef, depth) {
  const settings = context.config.sources.firestore;
  if (depth > settings.maxDepth) {
    log(context, "warn", "FIRESTORE", "Max subcollection depth reached", {
      collectionPath: collectionRef.path,
      depth,
      maxDepth: settings.maxDepth,
    });
    return;
  }

  if (!shouldTraverseFirestorePath(collectionRef.path, settings)) {
    return;
  }

  let lastDocumentId = null;
  while (!context.stopRequested) {
    assertWithinLimits(context);
    if (settings.maxDocuments > 0 && context.metrics.scannedFirestoreDocs >= settings.maxDocuments) {
      throw new RuntimeLimitError(
        `Firestore maxDocuments limit reached (${settings.maxDocuments}).`,
        "firestore-max-documents"
      );
    }

    let query = collectionRef
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(settings.pageSize);
    if (lastDocumentId) {
      query = query.startAfter(lastDocumentId);
    }

    const snapshot = await query.get();
    if (snapshot.empty) {
      return;
    }

    for (const doc of snapshot.docs) {
      assertWithinLimits(context);
      context.metrics.scannedFirestoreDocs += 1;
      maybeLogProgress(context, "FIRESTORE", {
        scannedFirestoreDocs: context.metrics.scannedFirestoreDocs,
        analyzed: context.metrics.totalAnalyzed,
      });

      if (shouldProcessFirestoreDocument(doc.ref.path, settings)) {
        processUnknownNode(context, doc.data(), "firestore", doc.ref.path, []);
      }

      const subcollections = await doc.ref.listCollections();
      for (const subcollection of subcollections) {
        if (!shouldIncludeCollectionName(subcollection.id, settings)) {
          continue;
        }
        await walkCollection(context, admin, subcollection, depth + 1);
      }

      lastDocumentId = doc.id;
      if (context.stopRequested) {
        return;
      }
    }
  }
}

async function collectFromRealtimeDatabase(context, admin) {
  const db = admin.database();
  const settings = context.config.sources.realtimeDatabase;

  log(context, "info", "RTDB", "Starting recursive scan", {
    paths: settings.paths,
    maxNodes: settings.maxNodes,
  });

  for (const rootPath of settings.paths) {
    const normalizedPath = normalizeRtdbPath(rootPath);
    if (!shouldTraverseRtdbPath(normalizedPath, settings)) {
      continue;
    }

    const snapshot = await db.ref(normalizedPath).get();
    if (!snapshot.exists()) {
      log(context, "warn", "RTDB", "Configured path does not exist", {
        rootPath: normalizedPath,
      });
      continue;
    }

    walkRtdbNode(context, snapshot.val(), normalizedPath, 0);
  }
}

function walkRtdbNode(context, value, currentPath, depth) {
  const settings = context.config.sources.realtimeDatabase;
  assertWithinLimits(context);

  if (depth > settings.maxDepth) {
    return;
  }
  if (!shouldTraverseRtdbPath(currentPath, settings)) {
    return;
  }

  context.metrics.scannedRtdbNodes += 1;
  maybeLogProgress(context, "RTDB", {
    scannedRtdbNodes: context.metrics.scannedRtdbNodes,
    analyzed: context.metrics.totalAnalyzed,
  });

  if (settings.maxNodes > 0 && context.metrics.scannedRtdbNodes > settings.maxNodes) {
    throw new RuntimeLimitError(
      `Realtime Database maxNodes limit reached (${settings.maxNodes}).`,
      "rtdb-max-nodes"
    );
  }

  processUnknownNode(context, value, "rtdb", currentPath, [], depth);
}

function processUnknownNode(context, node, source, location, ancestors, depth = 0) {
  if (node === null || node === undefined) {
    return;
  }

  if (typeof node === "string") {
    processStringValue(context, node, location, source, ancestors[0] || null, ancestors);
    return;
  }

  if (Array.isArray(node)) {
    for (let index = 0; index < node.length; index += 1) {
      if (source === "rtdb") {
        walkRtdbNode(context, node[index], `${location}[${index}]`, depth + 1);
      } else {
        processUnknownNode(
          context,
          node[index],
          source,
          `${location}[${index}]`,
          [node, ...ancestors].slice(0, context.config.consent.ancestorSearchDepth),
          depth + 1
        );
      }
    }
    return;
  }

  if (!isPlainObject(node)) {
    return;
  }

  for (const [key, child] of Object.entries(node)) {
    const childPath = joinPath(location, key);

    if (typeof child === "string" && looksLikeEmailField(key)) {
      registerCandidate(context, {
        rawEmail: child,
        source,
        path: childPath,
        consent: detectConsent(node, ancestors),
      });
      continue;
    }

    if (Array.isArray(child) && looksLikeEmailField(key)) {
      for (let index = 0; index < child.length; index += 1) {
        const entry = child[index];
        if (typeof entry === "string") {
          registerCandidate(context, {
            rawEmail: entry,
            source,
            path: `${childPath}[${index}]`,
            consent: detectConsent(node, ancestors),
          });
        }
      }
      continue;
    }

    if (typeof child === "string") {
      processStringValue(context, child, childPath, source, node, ancestors);
      continue;
    }

    if (source === "rtdb") {
      walkRtdbNode(context, child, childPath, depth + 1);
    } else {
      processUnknownNode(
        context,
        child,
        source,
        childPath,
        [node, ...ancestors].slice(0, context.config.consent.ancestorSearchDepth),
        depth + 1
      );
    }
  }
}

function processStringValue(context, rawValue, pathValue, source, contextObject, ancestors) {
  if (!rawValue || rawValue.length > context.config.limits.maxStringLength) {
    return;
  }

  const extracted = extractEmailsFromString(rawValue, context.config.limits.maxMatchesPerString);
  if (!extracted.length) {
    return;
  }

  const consent = detectConsent(contextObject, ancestors);
  for (const email of extracted) {
    registerCandidate(context, {
      rawEmail: email,
      source,
      path: pathValue,
      consent,
    });
  }
}

function registerCandidate(context, candidate) {
  assertWithinLimits(context);
  context.metrics.totalAnalyzed += 1;

  if (context.config.limits.maxCandidates > 0 && context.metrics.totalAnalyzed > context.config.limits.maxCandidates) {
    throw new RuntimeLimitError(
      `Candidate limit reached (${context.config.limits.maxCandidates}).`,
      "max-candidates"
    );
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

  const existing = context.dedupeMap.get(normalized.normalized);
  if (existing) {
    existing.duplicateCount += 1;
    context.metrics.duplicates += 1;
    if (existing.sources.length < 10) {
      existing.sources.push({
        source: candidate.source,
        path: candidate.path,
      });
    }
    existing.consent = mergeConsentResults(existing.consent, normalizeConsentResult(candidate.consent));
    return;
  }

  if (context.config.limits.maxUniqueEmails > 0 && context.dedupeMap.size >= context.config.limits.maxUniqueEmails) {
    throw new RuntimeLimitError(
      `Unique email limit reached (${context.config.limits.maxUniqueEmails}).`,
      "max-unique-emails"
    );
  }

  context.dedupeMap.set(normalized.normalized, {
    email: normalized.cleanedEmail,
    dedupeKey: normalized.normalized,
    sources: [
      {
        source: candidate.source,
        path: candidate.path,
      },
    ],
    duplicateCount: 1,
    consent: normalizeConsentResult(candidate.consent),
  });
}

function detectConsent(contextObject, ancestors) {
  const objectsToInspect = [];
  if (isPlainObject(contextObject)) {
    objectsToInspect.push(contextObject);
  }
  for (const ancestor of ancestors.slice(0, runtimeConsentConfig.ancestorSearchDepth)) {
    if (isPlainObject(ancestor)) {
      objectsToInspect.push(ancestor);
    }
  }

  const signals = [];
  for (const objectValue of objectsToInspect) {
    signals.push(...collectConsentSignals(objectValue, 0, ""));
  }

  if (!signals.length) {
    return { status: "unknown", scope: "none", reason: "missing", path: "", confidence: "low" };
  }

  signals.sort((left, right) => right.score - left.score);
  const negative = signals.find((signal) => signal.status === "denied");
  if (negative) {
    return { status: "denied", scope: negative.scope, reason: negative.reason, path: negative.path, confidence: negative.confidence };
  }
  const marketing = signals.find((signal) => signal.status === "granted" && signal.scope === "marketing");
  if (marketing) {
    return { status: "granted", scope: "marketing", reason: marketing.reason, path: marketing.path, confidence: marketing.confidence };
  }
  const ambiguous = signals.find((signal) => signal.status === "granted" && signal.scope === "ambiguous");
  if (ambiguous) {
    return runtimeConsentConfig.genericPositiveIsConsent
      ? { status: "granted", scope: "marketing", reason: "generic-positive-promoted", path: ambiguous.path, confidence: ambiguous.confidence }
      : { status: "ambiguous", scope: "ambiguous", reason: ambiguous.reason, path: ambiguous.path, confidence: ambiguous.confidence };
  }
  const transactional = signals.find((signal) => signal.scope === "transactional");
  if (transactional) {
    return { status: "transactional_only", scope: "transactional", reason: transactional.reason, path: transactional.path, confidence: transactional.confidence };
  }
  return { status: "unknown", scope: "none", reason: "missing", path: "", confidence: "low" };
}

function collectConsentSignals(objectValue, depth, prefix) {
  if (!isPlainObject(objectValue) || depth > runtimeConsentConfig.objectSearchDepth) {
    return [];
  }

  const signals = [];
  for (const [key, value] of Object.entries(objectValue)) {
    const currentPath = prefix ? `${prefix}.${key}` : key;
    const scalarValue = normalizeConsentScalar(value);
    if (scalarValue !== null) {
      const signal = buildConsentSignal(currentPath, scalarValue);
      if (signal) {
        signals.push(signal);
      }
    }
    if (isPlainObject(value)) {
      signals.push(...collectConsentSignals(value, depth + 1, currentPath));
    }
  }
  return signals;
}

function buildConsentSignal(pathValue, scalarValue) {
  const normalizedPath = canonicalizeForInternalUse(pathValue);

  if (matchesConsentPath(normalizedPath, runtimeConsentConfig.marketingNegativeKeys)) {
    return {
      status: scalarValue ? "denied" : "granted",
      scope: "marketing",
      reason: scalarValue ? "explicit-marketing-opt-out" : "negative-flag-disabled",
      path: pathValue,
      score: scalarValue ? 120 : 75,
      confidence: "high",
    };
  }
  if (matchesConsentPath(normalizedPath, runtimeConsentConfig.marketingPositiveKeys)) {
    return {
      status: scalarValue ? "granted" : "denied",
      scope: "marketing",
      reason: scalarValue ? "explicit-marketing-opt-in" : "explicit-marketing-opt-out",
      path: pathValue,
      score: scalarValue ? 110 : 115,
      confidence: "high",
    };
  }
  if (matchesConsentPath(normalizedPath, runtimeConsentConfig.ambiguousPositiveKeys)) {
    return {
      status: scalarValue ? "granted" : "denied",
      scope: "ambiguous",
      reason: scalarValue ? "generic-opt-in" : "generic-opt-out",
      path: pathValue,
      score: scalarValue ? 65 : 95,
      confidence: scalarValue ? "medium" : "high",
    };
  }
  if (matchesConsentPath(normalizedPath, runtimeConsentConfig.transactionalOnlyKeys)) {
    return {
      status: scalarValue ? "granted" : "denied",
      scope: "transactional",
      reason: scalarValue ? "transactional-only-consent" : "transactional-disabled",
      path: pathValue,
      score: 40,
      confidence: "medium",
    };
  }
  if (normalizedPath.includes("marketing") || normalizedPath.includes("newsletter")) {
    return {
      status: scalarValue ? "granted" : "denied",
      scope: "marketing",
      reason: scalarValue ? "heuristic-marketing-opt-in" : "heuristic-marketing-opt-out",
      path: pathValue,
      score: scalarValue ? 90 : 100,
      confidence: "medium",
    };
  }
  return null;
}

function normalizeConsentScalar(value) {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (value === 1) {
      return true;
    }
    if (value === 0) {
      return false;
    }
  }
  if (typeof value === "string") {
    const normalized = canonicalizeForInternalUse(value);
    if (runtimeConsentConfig.positiveValues.some((entry) => canonicalizeForInternalUse(entry) === normalized)) {
      return true;
    }
    if (runtimeConsentConfig.negativeValues.some((entry) => canonicalizeForInternalUse(entry) === normalized)) {
      return false;
    }
  }
  return null;
}

function normalizeConsentResult(consent) {
  return {
    status: consent?.status || "unknown",
    scope: consent?.scope || "none",
    reason: consent?.reason || "missing",
    path: consent?.path || "",
    confidence: consent?.confidence || "low",
  };
}

function mergeConsentResults(current, incoming) {
  const score = {
    denied: 5,
    granted: 4,
    ambiguous: 3,
    transactional_only: 2,
    unknown: 1,
  };
  if ((score[incoming.status] || 0) > (score[current.status] || 0)) {
    return incoming;
  }
  return current;
}

function normalizeEmail(rawEmail) {
  const original = sanitizeEmail(rawEmail);
  const cleanedEmail = original.toLowerCase();
  return {
    original,
    cleanedEmail,
    normalized: cleanedEmail,
    isValid: EMAIL_REGEX.test(cleanedEmail),
  };
}

function sanitizeEmail(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value
    .trim()
    .replace(/^mailto:/i, "")
    .replace(/^[<("'\[]+/, "")
    .replace(/[>)"'\].,;:]+$/, "")
    .trim();
}

function extractEmailsFromString(value, maxMatchesPerString) {
  const matches = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  return matches.slice(0, maxMatchesPerString).map((entry) => sanitizeEmail(entry));
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

function shouldTraverseFirestorePath(pathValue, settings) {
  if (settings.excludePathPrefixes.some((prefix) => pathValue.startsWith(prefix))) {
    return false;
  }
  if (!settings.includePathPrefixes.length) {
    return true;
  }
  return settings.includePathPrefixes.some(
    (prefix) => pathValue.startsWith(prefix) || prefix.startsWith(pathValue)
  );
}

function shouldProcessFirestoreDocument(pathValue, settings) {
  if (settings.excludePathPrefixes.some((prefix) => pathValue.startsWith(prefix))) {
    return false;
  }
  if (!settings.includePathPrefixes.length) {
    return true;
  }
  return settings.includePathPrefixes.some((prefix) => pathValue.startsWith(prefix));
}

function shouldTraverseRtdbPath(pathValue, settings) {
  if (settings.excludePathPrefixes.some((prefix) => pathValue.startsWith(normalizeRtdbPath(prefix)))) {
    return false;
  }
  if (!settings.includePathPrefixes.length) {
    return true;
  }
  return settings.includePathPrefixes.some((prefix) => {
    const normalizedPrefix = normalizeRtdbPath(prefix);
    return pathValue.startsWith(normalizedPrefix) || normalizedPrefix.startsWith(pathValue);
  });
}

function looksLikeEmailField(key) {
  const normalized = canonicalizeForInternalUse(key);
  if (EMAIL_FIELD_HINTS.has(normalized)) {
    return true;
  }
  return normalized.includes("email") || normalized.includes("correo");
}

function matchesConsentPath(normalizedPath, candidates) {
  return candidates.some((entry) => {
    const normalizedEntry = canonicalizeForInternalUse(entry);
    return normalizedPath === normalizedEntry || normalizedPath.endsWith(normalizedEntry);
  });
}
