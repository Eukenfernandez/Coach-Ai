import path from "node:path";
import { fileURLToPath } from "node:url";
import admin from "firebase-admin";
import {
  RuntimeLimitError,
  createRunContext,
  handleLimitError,
  loadConfig,
  log,
  recordError,
  redactSecrets,
  requireUtf8File,
  validateConfig,
} from "./email-export-runtime.mjs";
import { persistOutputs, printSummary } from "./email-export-outputs.mjs";
import { finalizeContacts, scanSources } from "./email-export-scan.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const outputDirectory = path.resolve(__dirname, "../output/email-exports");
  const config = await loadConfig(outputDirectory);
  validateConfig(config);

  const context = createRunContext(config);
  log(context, "info", "BOOT", "Starting email export", {
    runId: context.runId,
    dryRun: context.dryRun,
    config: redactSecrets(config),
  });

  initializeFirebase(config.firebase, context);

  try {
    await scanSources(context, admin);
  } catch (error) {
    if (error instanceof RuntimeLimitError) {
      handleLimitError(context, error);
      if (!context.config.limits.allowPartialResults) {
        throw error;
      }
    } else {
      recordError(context, "scan", error);
      if (context.config.limits.stopOnFirstError) {
        throw error;
      }
    }
  }

  finalizeContacts(context);
  const outputs = await persistOutputs(context, admin);
  printSummary(context, outputs);
}

function initializeFirebase(firebaseConfig, context) {
  if (admin.apps.length > 0) {
    return;
  }

  const credentials = firebaseConfig.serviceAccountJson
    ? JSON.parse(firebaseConfig.serviceAccountJson)
    : JSON.parse(requireUtf8File(firebaseConfig.serviceAccountPath));

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

main().catch((error) => {
  console.error(`[${new Date().toISOString()}] [FATAL] ${error.stack || error.message}`);
  process.exitCode = 1;
});
