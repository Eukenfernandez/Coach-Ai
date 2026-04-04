import {
  canonicalToken,
  computeRepeatedNameStats,
  detectConsent,
  ensureOutputDir,
  extractFirstToken,
  extractRemainingTokens,
  groupByEmail,
  indexByEmail,
  indexByUid,
  isLikelyHumanName,
  loadAuthUsers,
  loadFirestoreCollections,
  loadRegisteredEmailRows,
  log,
  normalizeEmail,
  normalizeHumanName,
  parseArgs,
  resolveCampaignConfig,
  splitSourceList,
  stableHash,
  writeCsv,
  writeJson,
  buildNameFingerprint,
} from "./campaign-common.mjs";

const EXACT_REJECT_EMAILS = new Set(["musikart01@yahoo.es"]);
const REJECT_DOMAINS = new Set([
  "example.com",
  "example.org",
  "example.net",
  "test.com",
  "gamail.com",
]);
const TRUSTED_DOMAINS = new Set([
  "gmail.com",
  "hotmail.com",
  "outlook.com",
  "icloud.com",
  "yahoo.com",
  "yahoo.es",
  "elisava.net",
]);
const ASCII_ONLY_MAILBOX_DOMAINS = new Set([
  "gmail.com",
  "hotmail.com",
  "outlook.com",
  "icloud.com",
  "yahoo.com",
  "yahoo.es",
]);
const REJECT_LOCAL_SUBSTRINGS = ["test", "prueba", "codex", "demo", "fake", "sample"];
const REJECT_LOCAL_TOKEN_PATTERNS = [/^qa\d*$/i, /^dev\d*$/i, /^tmp\d*$/i];

async function main() {
  const args = parseArgs();
  const config = resolveCampaignConfig(args);
  await ensureOutputDir();

  log("info", "PREPARE", "Preparing campaign recipients", {
    inputFile: config.inputFile,
    projectId: config.projectId,
  });

  const baseRows = await loadRegisteredEmailRows(config);
  const authUsers = await loadAuthUsers(config);
  const firestore = await loadFirestoreCollections(config, [
    "users",
    "requests",
    "customers",
    "userdata",
  ]);

  const prepared = prepareRecipients({
    config,
    baseRows,
    authUsers,
    firestore,
  });

  await writeOutputs(config, prepared);

  log("info", "SUMMARY", "Campaign recipients prepared", prepared.summary.metrics);
}

main().catch((error) => {
  log("error", "PREPARE_FAILED", error?.message || String(error));
  process.exit(1);
});

function prepareRecipients(context) {
  const users = context.firestore.users || [];
  const requests = context.firestore.requests || [];
  const customers = context.firestore.customers || [];
  const userdata = context.firestore.userdata || [];

  const usersByUid = indexByUid(users, (entry) => entry.data?.uid || entry.id);
  const usersByEmail = indexByEmail(users, (entry) => entry.data?.email);
  const authByUid = indexByUid(
    context.authUsers,
    (entry) => entry.localId || entry.uid
  );
  const authByEmail = indexByEmail(context.authUsers, (entry) => entry.email);
  const customersByEmail = groupByEmail(customers, (entry) => entry.data?.email);
  const requestsByEmail = groupByEmail(requests, (entry) => entry.data?.athleteEmail);
  const userdataByUid = indexByUid(userdata, (entry) => entry.id);
  const nameStats = computeRepeatedNameStats(users);
  const internalSeeds = buildInternalSeeds(nameStats);

  const summary = {
    generatedAt: new Date().toISOString(),
    projectId: context.config.projectId,
    inputFile: context.config.inputFile,
    warnings: [],
    metrics: {
      totalRead: 0,
      totalExcluded: 0,
      totalReviewRequired: 0,
      totalCampaignSafe: 0,
      explicitConsentGranted: 0,
      explicitConsentDenied: 0,
      implicitExistingUser: 0,
    },
    rejectionReasonCounts: {},
    reviewReasonCounts: {},
  };

  const campaignSafe = [];
  const reviewRequired = [];
  const rejected = [];
  let explicitConsentSeen = false;

  for (const row of dedupeRows(context.baseRows)) {
    summary.metrics.totalRead += 1;

    const meta = buildRecipientMeta({
      row,
      usersByUid,
      usersByEmail,
      authByUid,
      authByEmail,
      customersByEmail,
      requestsByEmail,
      userdataByUid,
      nameStats,
      internalSeeds,
    });

    const classified = classifyRecipient(meta);
    if (classified.consent_status === "explicit_marketing") {
      explicitConsentSeen = true;
      summary.metrics.explicitConsentGranted += 1;
    }
    if (classified.consent_status === "denied") {
      summary.metrics.explicitConsentDenied += 1;
    }
    if (classified.consent_status === "implicit_existing_user") {
      summary.metrics.implicitExistingUser += 1;
    }

    if (classified.segment === "campaign_safe") {
      campaignSafe.push(classified);
    } else if (classified.segment === "review_required") {
      reviewRequired.push(classified);
      addReasonCounts(summary.reviewReasonCounts, classified.review_reasons);
    } else {
      rejected.push(classified);
      addReasonCounts(summary.rejectionReasonCounts, classified.rejection_reasons);
    }
  }

  campaignSafe.sort((left, right) => left.email.localeCompare(right.email));
  reviewRequired.sort((left, right) => left.email.localeCompare(right.email));
  rejected.sort((left, right) => left.email.localeCompare(right.email));

  summary.metrics.totalCampaignSafe = campaignSafe.length;
  summary.metrics.totalReviewRequired = reviewRequired.length;
  summary.metrics.totalExcluded = rejected.length;

  if (!explicitConsentSeen) {
    summary.warnings.push(
      "No se detectaron flags explícitos de marketing/newsletter en Firebase. campaign_safe usa una heurística conservadora sobre cuentas registradas reales."
    );
  }

  return {
    campaignSafe,
    reviewRequired,
    rejected,
    campaign: {
      subject: context.config.campaign.subject,
      previewText: context.config.campaign.previewText,
      htmlContent: context.config.campaign.htmlContent,
      textContent: context.config.campaign.textContent,
      senderName: context.config.campaign.senderName,
      baseUrl: context.config.campaign.baseUrl,
      brevoListName: context.config.brevo.listName,
      brevoCampaignName: context.config.brevo.campaignName,
      brevoCampaignTag: context.config.brevo.campaignTag,
    },
    summary,
  };
}

function dedupeRows(rows) {
  const map = new Map();
  for (const row of rows) {
    const email = normalizeEmail(row.email);
    if (!email) {
      continue;
    }
    const existing = map.get(email);
    if (!existing) {
      map.set(email, { ...row, email });
      continue;
    }
    const mergedSources = new Set([
      ...splitSourceList(existing.source),
      ...splitSourceList(row.source),
    ]);
    const mergedPaths = [existing.sourcePath, row.sourcePath].filter(Boolean).join(" | ");
    const mergedNotes = [existing.notes, row.notes].filter(Boolean).join(" | ");
    map.set(email, {
      email,
      source: [...mergedSources].join("|"),
      sourcePath: mergedPaths,
      uid: existing.uid || row.uid || "",
      notes: mergedNotes,
    });
  }
  return [...map.values()];
}

function buildRecipientMeta(indices) {
  const { row } = indices;
  const authUser =
    indices.authByUid.get(row.uid) || indices.authByEmail.get(row.email) || null;
  const userDoc =
    indices.usersByUid.get(row.uid) || indices.usersByEmail.get(row.email) || null;
  const userdataDoc =
    indices.userdataByUid.get(row.uid) ||
    (userDoc?.id ? indices.userdataByUid.get(userDoc.id) : null) ||
    null;
  const customerDocs = indices.customersByEmail.get(row.email) || [];
  const requestDocs = indices.requestsByEmail.get(row.email) || [];
  const sourceSet = new Set(splitSourceList(row.source));

  const nameInfo = pickName(authUser, userDoc);
  const role = normalizeHumanName(
    userDoc?.data?.role || userDoc?.data?.profile?.role || ""
  ).toLowerCase();
  const consent = detectConsent(
    [userDoc?.data, userDoc?.data?.profile, userdataDoc?.data, ...customerDocs.map((doc) => doc.data)]
      .filter(Boolean)
  );
  const nameFingerprint = buildNameFingerprint(nameInfo.first_name, nameInfo.last_name);
  const repeatedNameRecord = nameFingerprint
    ? indices.nameStats.get(nameFingerprint) || null
    : null;

  return {
    email: row.email,
    uid: row.uid || userDoc?.data?.uid || authUser?.localId || authUser?.uid || "",
    source: row.source,
    sourcePath: row.sourcePath,
    sourceSet,
    notes: row.notes,
    authUser,
    userDoc,
    userdataDoc,
    customerDocs,
    requestDocs,
    first_name: nameInfo.first_name,
    last_name: nameInfo.last_name,
    name_source: nameInfo.name_source,
    hasReliableName: Boolean(nameInfo.first_name),
    role,
    consent,
    repeatedNameRecord,
    internalSeeds: indices.internalSeeds,
    requestOnlyLead:
      !sourceSet.has("auth") &&
      !userDoc &&
      !customerDocs.length &&
      requestDocs.length > 0,
    fromAuth: sourceSet.has("auth") || Boolean(authUser),
    hasUsersDoc: Boolean(userDoc),
    hasCustomerDoc: customerDocs.length > 0,
  };
}

function pickName(authUser, userDoc) {
  const profile = userDoc?.data?.profile || {};
  const fullNameCandidates = [
    profile.name,
    userDoc?.data?.name,
    userDoc?.data?.displayName,
    authUser?.displayName,
  ].filter(Boolean);

  const firstCandidates = [
    { value: profile.firstName, source: "users.profile.firstName" },
    { value: userDoc?.data?.firstName, source: "users.firstName" },
  ];

  for (const candidate of fullNameCandidates) {
    firstCandidates.push({
      value: extractFirstToken(candidate),
      source: "derived.firstToken",
    });
  }

  let firstName = "";
  let firstNameSource = "";
  for (const candidate of firstCandidates) {
    if (isLikelyHumanName(candidate.value)) {
      firstName = formatName(candidate.value);
      firstNameSource = candidate.source;
      break;
    }
  }

  const lastCandidates = [
    { value: profile.lastName, source: "users.profile.lastName" },
    { value: userDoc?.data?.lastName, source: "users.lastName" },
  ];

  for (const candidate of fullNameCandidates) {
    lastCandidates.push({
      value: extractRemainingTokens(candidate),
      source: "derived.remainingTokens",
    });
  }

  let lastName = "";
  for (const candidate of lastCandidates) {
    if (isLikelyHumanName(candidate.value)) {
      lastName = formatName(candidate.value);
      break;
    }
  }

  return {
    first_name: firstName,
    last_name: lastName,
    name_source: firstNameSource,
  };
}

function classifyRecipient(meta) {
  const rejectionReasons = [];
  const reviewReasons = [];
  const notes = [];
  const [localPart, domain] = meta.email.split("@");
  const canonicalLocal = canonicalToken(localPart);

  if (EXACT_REJECT_EMAILS.has(meta.email)) {
    rejectionReasons.push("manual_exclusion");
  }

  if (REJECT_DOMAINS.has(domain)) {
    rejectionReasons.push("rejected_domain");
  }

  if (REJECT_LOCAL_SUBSTRINGS.some((token) => canonicalLocal.includes(token))) {
    rejectionReasons.push("test_pattern");
  }

  if (REJECT_LOCAL_TOKEN_PATTERNS.some((pattern) => pattern.test(localPart))) {
    rejectionReasons.push("test_pattern");
  }

  if (isInternalSeedLocalPart(canonicalLocal, meta.internalSeeds)) {
    rejectionReasons.push("internal_name_variant");
  }

  if (looksKeyboardMashLocalPart(canonicalLocal)) {
    rejectionReasons.push("keyboard_mash_local_part");
  }

  if (/[^\x00-\x7F]/.test(localPart) && ASCII_ONLY_MAILBOX_DOMAINS.has(domain)) {
    rejectionReasons.push("non_ascii_local_part");
  }

  if (/^\d{1,6}$/.test(localPart)) {
    rejectionReasons.push("short_numeric_local_part");
  }

  if (canonicalLocal.length <= 2) {
    rejectionReasons.push("too_short_local_part");
  }

  if (new Set(canonicalLocal).size <= 2 && canonicalLocal.length <= 4) {
    rejectionReasons.push("low_entropy_local_part");
  }

  if (isSuspiciousNameCluster(meta.repeatedNameRecord)) {
    rejectionReasons.push("repeated_internal_profile_identity");
  }

  if (looksSuspiciousProfileName(meta.first_name, meta.last_name)) {
    rejectionReasons.push("suspicious_profile_name");
  }

  if (meta.role === "coach") {
    reviewReasons.push("coach_account");
  }

  if (!meta.hasReliableName) {
    reviewReasons.push("missing_reliable_name");
  }

  if (meta.requestOnlyLead) {
    reviewReasons.push("request_only_lead");
  }

  if (looksRandomishLocalPart(localPart) && !meta.hasReliableName) {
    reviewReasons.push("random_like_local_part");
  }

  if (looksRandomishLocalPart(localPart) && !TRUSTED_DOMAINS.has(domain)) {
    rejectionReasons.push("untrusted_random_domain");
  }

  if (meta.consent.status === "denied") {
    rejectionReasons.push(meta.consent.reason || "consent_denied");
  }

  let qualityScore = 0;
  if (meta.fromAuth) qualityScore += 2;
  if (meta.hasUsersDoc) qualityScore += 2;
  if (meta.hasCustomerDoc) qualityScore += 1;
  if (meta.hasReliableName) qualityScore += 1;
  if (meta.role === "athlete") qualityScore += 1;
  if (meta.role === "coach") qualityScore -= 1;
  if (meta.requestOnlyLead) qualityScore -= 2;
  if (!meta.hasReliableName) qualityScore -= 1;
  if (looksRandomishLocalPart(localPart) && !meta.hasReliableName) qualityScore -= 1;

  let segment = "review_required";
  let consentStatus = "review_required";
  if (rejectionReasons.length) {
    segment = "rejected";
    consentStatus = meta.consent.status === "denied" ? "denied" : "rejected";
  } else if (meta.consent.status === "granted") {
    segment = "campaign_safe";
    consentStatus = "explicit_marketing";
    notes.push(`consent:${meta.consent.reason}`);
  } else if (
    qualityScore >= 5 &&
    meta.hasReliableName &&
    !reviewReasons.includes("coach_account") &&
    !reviewReasons.includes("request_only_lead")
  ) {
    segment = "campaign_safe";
    consentStatus = "implicit_existing_user";
    notes.push("consent:implicit_existing_contact");
  } else {
    reviewReasons.push("manual_consent_review");
    notes.push("consent:review_required");
  }

  if (meta.hasReliableName && meta.name_source) {
    notes.push(`name:${meta.name_source}`);
  }
  if (meta.role) {
    notes.push(`role:${meta.role}`);
  }
  if (meta.notes) {
    notes.push(meta.notes);
  }

  return {
    email: meta.email,
    first_name: meta.first_name,
    last_name: meta.last_name,
    source: meta.source,
    uid: meta.uid,
    consent_status: consentStatus,
    language: "es",
    notes: uniqueJoin(notes),
    segment,
    review_reasons: uniqueList(reviewReasons),
    rejection_reasons: uniqueList(rejectionReasons),
    quality_score: qualityScore,
    source_path: meta.sourcePath,
    source_hash: stableHash({
      email: meta.email,
      source: meta.source,
      uid: meta.uid,
    }),
  };
}

function looksSuspiciousProfileName(firstName, lastName) {
  const first = canonicalToken(firstName);
  const last = canonicalToken(lastName);
  if (!first && !last) {
    return false;
  }

  if ((first && first.length <= 1) || (last && last.length <= 1)) {
    return true;
  }

  const both = [first, last].filter(Boolean);
  return both.some((value) => /^([a-z0-9])\1+$/.test(value));
}

function isSuspiciousNameCluster(record) {
  return Boolean(record && record.count >= 4);
}

function looksRandomishLocalPart(value) {
  const normalized = canonicalToken(value);
  if (!normalized) {
    return false;
  }

  const digitCount = [...normalized].filter((char) => /\d/.test(char)).length;
  if (digitCount >= 3 && normalized.length >= 8) {
    return true;
  }

  return /^[a-z]{2,4}\d{1,3}$/i.test(value);
}

function looksKeyboardMashLocalPart(canonicalLocal) {
  if (canonicalLocal.length < 8) {
    return false;
  }
  const vowelCount = [...canonicalLocal].filter((char) => "aeiou".includes(char)).length;
  const digitCount = [...canonicalLocal].filter((char) => /\d/.test(char)).length;
  return vowelCount <= 1 && digitCount === 0;
}

function buildInternalSeeds(nameStats) {
  const seeds = new Set();
  for (const record of nameStats.values()) {
    if (record.count < 4) {
      continue;
    }
    const first = canonicalToken(record.firstName);
    if (first.length >= 4) {
      seeds.add(first);
    }
  }
  return [...seeds];
}

function isInternalSeedLocalPart(localPart, seeds) {
  return seeds.some((seed) => {
    if (localPart.includes(seed)) {
      return true;
    }

    const regex = new RegExp(seed.split("").map((char) => `${char}+`).join(""));
    if (regex.test(localPart)) {
      return true;
    }

    return levenshtein(localPart, seed) <= 2;
  });
}

function levenshtein(left, right) {
  if (left === right) {
    return 0;
  }
  if (!left.length) {
    return right.length;
  }
  if (!right.length) {
    return left.length;
  }

  const matrix = Array.from({ length: left.length + 1 }, () =>
    Array(right.length + 1).fill(0)
  );
  for (let row = 0; row <= left.length; row += 1) {
    matrix[row][0] = row;
  }
  for (let column = 0; column <= right.length; column += 1) {
    matrix[0][column] = column;
  }

  for (let row = 1; row <= left.length; row += 1) {
    for (let column = 1; column <= right.length; column += 1) {
      const cost = left[row - 1] === right[column - 1] ? 0 : 1;
      matrix[row][column] = Math.min(
        matrix[row - 1][column] + 1,
        matrix[row][column - 1] + 1,
        matrix[row - 1][column - 1] + cost
      );
    }
  }

  return matrix[left.length][right.length];
}

function uniqueList(values) {
  return [...new Set(values.filter(Boolean))];
}

function uniqueJoin(values) {
  return uniqueList(values).join(" | ");
}

function formatName(value) {
  return normalizeHumanName(value)
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function addReasonCounts(target, reasons) {
  for (const reason of uniqueList(reasons)) {
    target[reason] = (target[reason] || 0) + 1;
  }
}

async function writeOutputs(config, prepared) {
  await writeCsv(
    config.output.recipientsCsv,
    ["email", "first_name", "source", "uid", "consent_status", "language", "notes"],
    prepared.campaignSafe.map((item) => [
      item.email,
      item.first_name,
      item.source,
      item.uid,
      item.consent_status,
      item.language,
      item.notes,
    ])
  );

  await writeCsv(
    config.output.reviewCsv,
    [
      "email",
      "first_name",
      "source",
      "uid",
      "consent_status",
      "language",
      "review_reasons",
      "notes",
    ],
    prepared.reviewRequired.map((item) => [
      item.email,
      item.first_name,
      item.source,
      item.uid,
      item.consent_status,
      item.language,
      item.review_reasons.join("|"),
      item.notes,
    ])
  );

  await writeCsv(
    config.output.rejectedCsv,
    [
      "email",
      "source",
      "uid",
      "consent_status",
      "rejection_reasons",
      "notes",
    ],
    prepared.rejected.map((item) => [
      item.email,
      item.source,
      item.uid,
      item.consent_status,
      item.rejection_reasons.join("|"),
      item.notes,
    ])
  );

  await writeJson(config.output.recipientsJson, {
    generatedAt: prepared.summary.generatedAt,
    projectId: prepared.summary.projectId,
    campaign: prepared.campaign,
    summary: prepared.summary,
    recipients: prepared.campaignSafe,
  });

  await writeJson(config.output.summaryJson, prepared.summary);
}
