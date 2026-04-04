import {
  brevoRequest,
  getArg,
  hasFlag,
  loadState,
  log,
  resolveCampaignConfig,
  saveState,
  splitCsv,
} from "./campaign-common.mjs";

async function main() {
  const config = resolveCampaignConfig();
  if (!config.execution.send) {
    throw new Error("Envio bloqueado. Usa --send para enviar la campaña.");
  }

  const campaignState = await loadState(config.output.brevoCampaignState, {});
  if (!campaignState.campaignId) {
    throw new Error(
      "No hay campaignId guardado. Ejecuta antes create-brevo-campaign."
    );
  }

  if (campaignState.status === "sent" && !hasFlag(config.args, "force")) {
    log("info", "BREVO_SEND_SKIP", "Campaign already marked as sent", {
      campaignId: campaignState.campaignId,
    });
    return;
  }

  const testEmails = splitCsv(getArg(config.args, "test-emails", ""));
  if (testEmails.length) {
    await brevoRequest(
      config,
      "POST",
      `/emailCampaigns/${campaignState.campaignId}/sendTest`,
      { emailTo: testEmails }
    );
    log("info", "BREVO_SEND_TEST", "Test campaign sent", {
      campaignId: campaignState.campaignId,
      testEmails,
    });
    return;
  }

  await brevoRequest(
    config,
    "POST",
    `/emailCampaigns/${campaignState.campaignId}/sendNow`
  );

  const nextState = {
    ...campaignState,
    status: "sent",
    sentAt: new Date().toISOString(),
  };
  await saveState(config.output.brevoCampaignState, nextState);

  log("info", "BREVO_SEND_DONE", "Campaign queued for send", {
    campaignId: campaignState.campaignId,
  });
}

main().catch((error) => {
  log("error", "BREVO_SEND_FAILED", error?.message || String(error));
  process.exit(1);
});
