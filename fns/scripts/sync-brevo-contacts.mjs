import {
  brevoRequest,
  chunkArray,
  ensureBrevoFolder,
  ensureBrevoList,
  ensureOutputDir,
  loadState,
  log,
  readJsonIfExists,
  resolveCampaignConfig,
  saveState,
  sleep,
  stableHash,
} from "./campaign-common.mjs";

async function main() {
  const config = resolveCampaignConfig();
  const dryRun = !config.execution.execute;
  await ensureOutputDir();

  const prepared = await readJsonIfExists(config.output.recipientsJson, null);
  if (!prepared) {
    throw new Error(
      "campaign_recipients.json no existe. Ejecuta antes prepare-campaign-recipients."
    );
  }

  const recipients = Array.isArray(prepared.recipients) ? prepared.recipients : [];
  const state = await loadState(config.output.brevoSyncState, {
    updatedAt: null,
    list: null,
    contacts: {},
  });

  const folder = await ensureBrevoFolder(config, dryRun);
  const list = await ensureBrevoList(config, folder, dryRun);

  let totalSynced = 0;
  let totalSkipped = 0;
  let totalWouldSync = 0;

  for (const batch of chunkArray(recipients, config.brevo.batchSize)) {
    log("info", "BREVO_SYNC", "Processing contacts batch", {
      batchSize: batch.length,
      dryRun,
    });

    for (const contact of batch) {
      const payload = buildContactPayload(contact, list);
      const fingerprint = stableHash(payload);
      const previous = state.contacts[contact.email];
      if (
        previous &&
        previous.fingerprint === fingerprint &&
        previous.status === "synced"
      ) {
        totalSkipped += 1;
        continue;
      }

      if (dryRun) {
        totalWouldSync += 1;
        state.contacts[contact.email] = {
          email: contact.email,
          listId: list.id,
          listName: list.name,
          fingerprint,
          status: "dry_run",
          syncedAt: new Date().toISOString(),
        };
        continue;
      }

      await brevoRequest(config, "POST", "/contacts", payload);
      state.contacts[contact.email] = {
        email: contact.email,
        listId: list.id,
        listName: list.name,
        fingerprint,
        status: "synced",
        syncedAt: new Date().toISOString(),
      };
      totalSynced += 1;
      await sleep(config.brevo.rateLimitMs);
    }
  }

  state.updatedAt = new Date().toISOString();
  state.list = {
    id: list.id,
    name: list.name,
    folderId: list.folderId || folder.id || null,
    folderName: folder.name || null,
    dryRun,
  };

  const result = {
    generatedAt: new Date().toISOString(),
    dryRun,
    totalRecipientsRead: recipients.length,
    totalWouldSync,
    totalSynced,
    totalSkipped,
    list: state.list,
  };

  await saveState(config.output.brevoSyncState, state);
  await saveState(config.output.brevoSyncResult, result);

  log("info", "BREVO_SYNC_DONE", "Brevo contacts sync finished", result);
}

main().catch((error) => {
  log("error", "BREVO_SYNC_FAILED", error?.message || String(error));
  process.exit(1);
});

function buildContactPayload(contact, list) {
  const attributes = {};
  if (contact.first_name) {
    attributes.FIRSTNAME = contact.first_name;
  }
  if (contact.last_name) {
    attributes.LASTNAME = contact.last_name;
  }

  return {
    email: contact.email,
    listIds: list.id ? [list.id] : [],
    updateEnabled: true,
    emailBlacklisted: false,
    attributes,
  };
}
