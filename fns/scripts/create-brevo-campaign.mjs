import {
  brevoRequest,
  ensureBrevoFolder,
  ensureBrevoList,
  ensureOutputDir,
  getExistingBrevoCampaign,
  loadState,
  log,
  readJsonIfExists,
  resolveCampaignConfig,
  saveState,
  stableHash,
  writeJson,
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
  if (!recipients.length) {
    const result = {
      generatedAt: new Date().toISOString(),
      dryRun,
      created: false,
      reason: "No hay contactos campaign_safe. Revisa campaign_review_required.csv antes de crear la campaña.",
    };
    await saveState(config.output.brevoCampaignResult, result);
    log("warn", "BREVO_CAMPAIGN_EMPTY", result.reason);
    return;
  }

  const syncState = await loadState(config.output.brevoSyncState, {
    list: null,
    contacts: {},
  });
  const campaignState = await loadState(config.output.brevoCampaignState, {});
  const folder = await ensureBrevoFolder(config, dryRun);
  const list = await ensureBrevoList(config, folder, dryRun);

  const payload = buildCampaignPayload(config, prepared, list);
  const fingerprint = stableHash(payload);
  await writeJson(config.output.brevoCampaignPayload, {
    generatedAt: new Date().toISOString(),
    dryRun,
    fingerprint,
    payload,
  });

  const currentState = {
    ...campaignState,
    listId: list.id || syncState.list?.id || null,
    fingerprint,
    dryRun,
  };

  if (
    campaignState.fingerprint === fingerprint &&
    campaignState.campaignId &&
    campaignState.status !== "sent"
  ) {
    const result = {
      generatedAt: new Date().toISOString(),
      dryRun,
      created: false,
      skippedAsDuplicate: true,
      campaignId: campaignState.campaignId,
      listId: currentState.listId,
    };
    await saveState(config.output.brevoCampaignResult, result);
    log("info", "BREVO_CAMPAIGN_SKIP", "Existing draft matches current fingerprint", result);
    return;
  }

  if (dryRun) {
    const result = {
      generatedAt: new Date().toISOString(),
      dryRun: true,
      created: false,
      wouldCreate: true,
      listId: currentState.listId,
      recipientCount: recipients.length,
      campaignName: payload.name,
    };
    await saveState(config.output.brevoCampaignResult, result);
    log("info", "BREVO_CAMPAIGN_DRY", "Campaign payload prepared in dry-run", result);
    return;
  }

  if (!config.brevo.senderEmail) {
    throw new Error("BREVO_SENDER_EMAIL es obligatorio para crear la campaña.");
  }

  const remoteExisting = await getExistingBrevoCampaign(config, campaignState);
  if (remoteExisting?.campaignId && campaignState.fingerprint === fingerprint) {
    const result = {
      generatedAt: new Date().toISOString(),
      dryRun: false,
      created: false,
      skippedAsDuplicate: true,
      campaignId: remoteExisting.campaignId,
      listId: currentState.listId,
    };
    await saveState(config.output.brevoCampaignResult, result);
    log("info", "BREVO_CAMPAIGN_SKIP", "Remote campaign already exists", result);
    return;
  }

  const created = await brevoRequest(config, "POST", "/emailCampaigns", payload);
  const state = {
    campaignId: created.id,
    listId: currentState.listId,
    fingerprint,
    status: "draft",
    createdAt: new Date().toISOString(),
    campaignName: payload.name,
    tag: payload.tag,
  };

  const result = {
    generatedAt: new Date().toISOString(),
    dryRun: false,
    created: true,
    campaignId: created.id,
    listId: currentState.listId,
    recipientCount: recipients.length,
    campaignName: payload.name,
  };

  await saveState(config.output.brevoCampaignState, state);
  await saveState(config.output.brevoCampaignResult, result);
  log("info", "BREVO_CAMPAIGN_CREATED", "Brevo campaign draft created", result);
}

main().catch((error) => {
  log("error", "BREVO_CAMPAIGN_FAILED", error?.message || String(error));
  process.exit(1);
});

function buildCampaignPayload(config, prepared, list) {
  const payload = {
    name: config.brevo.campaignName,
    tag: config.brevo.campaignTag,
    subject: prepared.campaign.subject,
    previewText: prepared.campaign.previewText,
    htmlContent: prepared.campaign.htmlContent,
    sender: {
      name: config.brevo.senderName,
      email: config.brevo.senderEmail,
    },
    replyTo: config.brevo.replyTo || config.brevo.senderEmail,
    recipients: {
      listIds: list.id ? [list.id] : [],
    },
    mirrorActive: true,
    inlineImageActivation: false,
  };

  if (config.brevo.unsubscribePageId) {
    payload.unsubscriptionPageId = config.brevo.unsubscribePageId;
  }
  if (config.brevo.updateFormId) {
    payload.updateFormId = config.brevo.updateFormId;
  }

  return payload;
}
