import fs from "node:fs/promises";
import crypto from "node:crypto";
import admin from "firebase-admin";
import {
  buildDeterministicDocId,
  chunkArray,
  csvLine,
  log,
  recordError,
  sleep,
  stableHash,
} from "./email-export-runtime.mjs";

export async function persistOutputs(context, admin) {
  const outputs = {
    files: {},
    integrations: {},
  };

  if (context.dryRun) {
    log(context, "info", "DRY_RUN", "Skipping writes and external syncs", {
      eligible: context.report.all.length,
    });
    return outputs;
  }

  outputs.files = await writeCsvOutputs(context);

  if (context.config.output.firestoreCollection) {
    outputs.files.firestoreCollection = await safeOutputStep(
      context,
      "normalized-firestore",
      () => writeContactsToFirestore(context, admin)
    );
  }

  if (context.config.integrations.mailchimp?.enabled) {
    outputs.integrations.mailchimp = await safeOutputStep(
      context,
      "mailchimp",
      () => syncToMailchimp(context)
    );
  }

  if (context.config.integrations.brevo?.enabled) {
    outputs.integrations.brevo = await safeOutputStep(
      context,
      "brevo",
      () => syncToBrevo(context)
    );
  }

  if (context.config.integrations.triggerEmail?.enabled) {
    outputs.integrations.triggerEmail = await safeOutputStep(
      context,
      "triggerEmail",
      () => enqueueTriggerEmails(context, admin)
    );
  }

  if (context.config.output.writeSummaryJson) {
    outputs.files.summaryFile = await writeSummaryJson(context, outputs);
  }

  return outputs;
}

async function safeOutputStep(context, scope, action) {
  try {
    return await action();
  } catch (error) {
    recordError(context, scope, error);
    if (context.config.limits.stopOnFirstError) {
      throw error;
    }
    return {
      failed: true,
      message: error?.message || String(error),
    };
  }
}

export function printSummary(context, outputs) {
  log(context, "info", "SUMMARY", "Run finished", {
    totalAnalyzed: context.metrics.totalAnalyzed,
    valid: context.metrics.valid,
    invalid: context.metrics.invalid,
    duplicates: context.metrics.duplicates,
    consented: context.metrics.consented,
    reviewRequired: context.metrics.reviewRequired,
    suppressed: context.metrics.suppressed,
    exported: context.metrics.exported,
    scannedFirestoreDocs: context.metrics.scannedFirestoreDocs,
    scannedRtdbNodes: context.metrics.scannedRtdbNodes,
    syncSkippedAsDuplicate: context.metrics.syncSkippedAsDuplicate,
    dryRun: context.dryRun,
    partial: context.partial,
    durationMs: Date.now() - context.startedAt,
    outputs,
  });
}

export function selectContactsForIntegration(context, integrationConfig) {
  if (integrationConfig.purpose === "marketing") {
    return context.report.consented;
  }
  return context.report.all.filter((contact) => contact.deliveryClassification !== "transactional_only");
}

async function writeCsvOutputs(context) {
  const outputDirectory = context.config.output.directory;
  await fs.mkdir(outputDirectory, { recursive: true });

  const base = `${context.config.output.csvBaseName}-${context.runId}`;
  const consentedFile = `${outputDirectory}\\${base}-consented.csv`;
  const reviewFile = `${outputDirectory}\\${base}-review-required.csv`;

  await fs.writeFile(consentedFile, buildCsv(context.report.consented), "utf8");
  await fs.writeFile(reviewFile, buildCsv(context.report.reviewRequired), "utf8");

  context.metrics.exported += context.report.consented.length + context.report.reviewRequired.length;

  const files = {
    consentedFile,
    reviewFile,
  };

  if (context.config.output.writeSuppressedCsv) {
    const suppressedFile = `${outputDirectory}\\${base}-transactional-only.csv`;
    await fs.writeFile(suppressedFile, buildCsv(context.report.suppressed), "utf8");
    files.suppressedFile = suppressedFile;
    context.metrics.exported += context.report.suppressed.length;
  }

  return files;
}

function buildCsv(items) {
  const headers = [
    "email",
    "deliveryClassification",
    "marketingEligible",
    "consentStatus",
    "consentScope",
    "consentReason",
    "consentPath",
    "primarySource",
    "primarySourcePath",
    "duplicateCount",
    "sourceCount",
  ];

  const rows = items.map((item) => [
    item.email,
    item.deliveryClassification,
    String(item.marketingEligible),
    item.consent.status,
    item.consent.scope,
    item.consent.reason,
    item.consent.path,
    item.primarySource.source,
    item.primarySource.path,
    String(item.duplicateCount),
    String(item.sources.length),
  ]);

  return [headers, ...rows].map(csvLine).join("\n");
}

async function writeContactsToFirestore(context, admin) {
  const db = admin.firestore();
  const batchSize = 400;
  const collectionName = context.config.output.firestoreCollection;
  let batch = db.batch();
  let staged = 0;
  let written = 0;

  for (const contact of context.report.all) {
    const ref = db.collection(collectionName).doc(contact.dedupeKey);
    batch.set(
      ref,
      {
        email: contact.email,
        marketingEligible: contact.marketingEligible,
        deliveryClassification: contact.deliveryClassification,
        consent: contact.consent,
        primarySource: contact.primarySource,
        sources: contact.sources,
        duplicateCount: contact.duplicateCount,
        lastExportRunId: context.runId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    staged += 1;
    written += 1;
    if (staged >= batchSize) {
      await batch.commit();
      batch = db.batch();
      staged = 0;
    }
  }

  if (staged > 0) {
    await batch.commit();
  }

  return { collectionName, written };
}

async function syncToMailchimp(context) {
  const config = context.config.integrations.mailchimp;
  if (!config.apiKey || !config.audienceId) {
    throw new Error("Mailchimp enabled but apiKey or audienceId is missing.");
  }

  const contacts = selectContactsForIntegration(context, config).slice(0, config.maxPerRun || Infinity);
  const [, server] = config.apiKey.split("-");
  if (!server) {
    throw new Error("Mailchimp API key must include the datacenter suffix, e.g. key-us21.");
  }

  return await processIntegrationBatches(context, {
    integrationName: "mailchimp",
    purpose: config.purpose,
    contacts,
    batchSize: config.batchSize,
    rateLimitMs: config.rateLimitMs,
    maxRetries: config.maxRetries,
    retryBaseMs: config.retryBaseMs,
    namespace: config.syncNamespace || config.audienceId,
    buildPayload: (contact) => ({
      email_address: contact.email,
      status_if_new: contact.marketingEligible ? config.statusIfConsented : config.statusIfNoConsent,
      status: contact.marketingEligible ? config.statusIfConsented : config.statusIfNoConsent,
      tags: config.tags || [],
    }),
    shouldSkipPayload: (payload) => payload.status === "skip",
    execute: async (contact, payload) => {
      const subscriberHash = crypto.createHash("md5").update(contact.email).digest("hex");
      const endpoint = `https://${server}.api.mailchimp.com/3.0/lists/${config.audienceId}/members/${subscriberHash}`;
      const response = await fetch(endpoint, {
        method: "PUT",
        headers: {
          Authorization: `Basic ${Buffer.from(`anystring:${config.apiKey}`).toString("base64")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Mailchimp sync failed for ${contact.email}: ${response.status} ${body}`);
      }
    },
  });
}

async function syncToBrevo(context) {
  const config = context.config.integrations.brevo;
  if (!config.apiKey) {
    throw new Error("Brevo enabled but apiKey is missing.");
  }

  const contacts = selectContactsForIntegration(context, config).slice(0, config.maxPerRun || Infinity);
  return await processIntegrationBatches(context, {
    integrationName: "brevo",
    purpose: config.purpose,
    contacts,
    batchSize: config.batchSize,
    rateLimitMs: config.rateLimitMs,
    maxRetries: config.maxRetries,
    retryBaseMs: config.retryBaseMs,
    namespace: config.syncNamespace || JSON.stringify(config.listIds || []),
    buildPayload: (contact) => ({
      email: contact.email,
      listIds: config.listIds || [],
      updateEnabled: config.updateEnabled !== false,
      emailBlacklisted: contact.marketingEligible ? false : config.emailBlacklistedIfNoConsent !== false,
    }),
    execute: async (contact, payload) => {
      const response = await fetch("https://api.brevo.com/v3/contacts", {
        method: "POST",
        headers: {
          "api-key": config.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const body = await response.text();
        if (response.status === 400 && body.includes("duplicate_parameter")) {
          return;
        }
        throw new Error(`Brevo sync failed for ${contact.email}: ${response.status} ${body}`);
      }
    },
  });
}

async function enqueueTriggerEmails(context, admin) {
  const config = context.config.integrations.triggerEmail;
  const contacts = selectTriggerEmailContacts(context, config).slice(0, config.maxPerRun || Infinity);
  const db = admin.firestore();
  const collectionName = context.config.output.triggerEmailCollection;
  let created = 0;
  let skipped = 0;

  for (const batch of chunkArray(contacts, config.batchSize || 100)) {
    const writeBatch = db.batch();
    const pendingStateWrites = [];
    let batchHasWrites = false;

    for (const contact of batch) {
      const namespace = config.syncNamespace || config.campaignKey;
      const payloadFingerprint = stableHash({
        purpose: config.purpose,
        campaignKey: config.campaignKey,
        email: contact.email,
        subject: config.subject,
        text: config.text,
        html: config.html,
      });
      const state = await getSyncState(context, "triggerEmail", namespace, contact.email);
      if (state && state.fingerprint === payloadFingerprint && state.status === "success") {
        skipped += 1;
        context.metrics.syncSkippedAsDuplicate += 1;
        continue;
      }

      const docRef = db.collection(collectionName).doc(
        buildDeterministicDocId(`triggerEmail:${namespace}:${config.purpose}:${contact.email}`)
      );
      const existingDoc = await docRef.get();
      if (existingDoc.exists) {
        skipped += 1;
        context.metrics.syncSkippedAsDuplicate += 1;
        await persistSyncState(context, "triggerEmail", namespace, contact.email, {
          fingerprint: payloadFingerprint,
          status: "success",
          purpose: config.purpose,
        });
        continue;
      }

      writeBatch.set(docRef, {
        to: [contact.email],
        message: {
          subject: config.subject,
          text: config.text,
          html: config.html,
        },
        metadata: {
          purpose: config.purpose,
          campaignKey: config.campaignKey,
          deliveryClassification: contact.deliveryClassification,
          marketingEligible: contact.marketingEligible,
          consentStatus: contact.consent.status,
          source: contact.primarySource.source,
          sourcePath: contact.primarySource.path,
        },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      pendingStateWrites.push(
        persistSyncState(context, "triggerEmail", namespace, contact.email, {
          fingerprint: payloadFingerprint,
          status: "success",
          purpose: config.purpose,
        })
      );
      created += 1;
      batchHasWrites = true;
    }

    if (batchHasWrites) {
      await writeBatch.commit();
      await Promise.all(pendingStateWrites);
    }
  }

  return {
    created,
    skippedAsDuplicate: skipped,
    purpose: config.purpose,
  };
}

function selectTriggerEmailContacts(context, config) {
  if (config.purpose === "marketing") {
    return context.report.consented;
  }
  if (config.onlyConsented !== false) {
    return context.report.consented;
  }
  return context.report.all.filter((contact) => contact.deliveryClassification !== "transactional_only");
}

async function processIntegrationBatches(context, options) {
  const {
    integrationName,
    purpose,
    contacts,
    batchSize,
    rateLimitMs,
    maxRetries,
    retryBaseMs,
    namespace,
    buildPayload,
    shouldSkipPayload,
    execute,
  } = options;

  let synced = 0;
  let skipped = 0;
  let failed = 0;

  for (const batch of chunkArray(contacts, batchSize || 100)) {
    log(context, "info", integrationName.toUpperCase(), "Processing batch", {
      batchSize: batch.length,
      purpose,
      namespace,
    });
    for (const contact of batch) {
      const payload = buildPayload(contact);
      if (shouldSkipPayload && shouldSkipPayload(payload)) {
        skipped += 1;
        continue;
      }

      const fingerprint = stableHash({ namespace, purpose, payload });
      const state = await getSyncState(context, integrationName, namespace, contact.email);
      if (state && state.fingerprint === fingerprint && state.status === "success") {
        skipped += 1;
        context.metrics.syncSkippedAsDuplicate += 1;
        continue;
      }

      try {
        await runWithRetry(() => execute(contact, payload), maxRetries, retryBaseMs);
        await persistSyncState(context, integrationName, namespace, contact.email, {
          fingerprint,
          status: "success",
          purpose,
        });
        synced += 1;
        context.metrics.integrationCalls += 1;
      } catch (error) {
        failed += 1;
        recordError(context, `${integrationName}:${contact.email}`, error);
        if (context.config.limits.stopOnFirstError) {
          throw error;
        }
      }

      await sleep(rateLimitMs);
    }
  }

  return { synced, skippedAsDuplicate: skipped, failed, purpose };
}

async function runWithRetry(fn, maxRetries, retryBaseMs) {
  let attempt = 0;
  while (attempt <= maxRetries) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxRetries || !isRetryableError(error)) {
        throw error;
      }
      await sleep(retryBaseMs * 2 ** attempt);
      attempt += 1;
    }
  }
}

function isRetryableError(error) {
  const message = String(error?.message || "");
  return (
    message.includes("429") ||
    message.includes("500") ||
    message.includes("502") ||
    message.includes("503") ||
    message.includes("504") ||
    message.includes("ECONNRESET") ||
    message.includes("ETIMEDOUT")
  );
}

async function getSyncState(context, integrationName, namespace, email) {
  const cacheKey = `${integrationName}:${namespace}:${email}`;
  if (context.syncStateCache.has(cacheKey)) {
    return context.syncStateCache.get(cacheKey);
  }
  const snapshot = await admin
    .firestore()
    .collection(context.config.output.syncStateCollection)
    .doc(buildDeterministicDocId(cacheKey))
    .get();
  const state = snapshot.exists ? snapshot.data() : null;
  context.syncStateCache.set(cacheKey, state);
  return state;
}

async function persistSyncState(context, integrationName, namespace, email, data) {
  const cacheKey = `${integrationName}:${namespace}:${email}`;
  const payload = {
    integrationName,
    namespace,
    email,
    fingerprint: data.fingerprint,
    status: data.status,
    purpose: data.purpose,
    runId: context.runId,
  };
  await admin
    .firestore()
    .collection(context.config.output.syncStateCollection)
    .doc(buildDeterministicDocId(cacheKey))
    .set(payload, { merge: true });
  context.syncStateCache.set(cacheKey, payload);
}

async function writeSummaryJson(context, outputs) {
  const summaryFile = `${context.config.output.directory}\\${context.config.output.csvBaseName}-${context.runId}-summary.json`;
  await fs.writeFile(
    summaryFile,
    JSON.stringify(
      {
        runId: context.runId,
        dryRun: context.dryRun,
        partial: context.partial,
        metrics: context.metrics,
        reportSizes: {
          consented: context.report.consented.length,
          reviewRequired: context.report.reviewRequired.length,
          suppressed: context.report.suppressed.length,
        },
        outputs,
        warnings: context.summary.warnings,
        errors: context.summary.errors,
      },
      null,
      2
    ),
    "utf8"
  );
  return summaryFile;
}
