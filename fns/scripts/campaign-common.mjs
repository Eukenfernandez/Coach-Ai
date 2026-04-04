import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import crypto from "node:crypto";
import admin from "firebase-admin";

const CWD = process.cwd();
const IS_FNS_DIR = path.basename(CWD).toLowerCase() === "fns";

export const FNS_DIR = IS_FNS_DIR ? CWD : path.join(CWD, "fns");
export const WORKSPACE_ROOT = IS_FNS_DIR ? path.dirname(CWD) : CWD;
export const OUTPUT_DIR = path.join(FNS_DIR, "output");
export const DEFAULT_ENV_PATH = path.join(FNS_DIR, ".env.campaign");
export const DEFAULT_PROJECT_ID = "entrenamientos-bfac2";

export const CAMPAIGN_SUBJECT =
  "La diferencia entre repetir y mejorar está en ver lo que antes no veías";
export const CAMPAIGN_PREVIEW =
  "CoachAI te ayuda a entender tu técnica con más claridad, control y confianza.";

const ADMIN_APP_NAME = "coachai-campaign-scripts";
const FIREBASE_TOOLS_CONFIG = path.join(
  process.env.USERPROFILE || process.env.HOME || "",
  ".config",
  "configstore",
  "firebase-tools.json"
);

const MARKETING_POSITIVE_KEYS = [
  "marketingConsent",
  "acceptedMarketing",
  "newsletterOptIn",
  "newsletterAccepted",
  "emailMarketingConsent",
  "promotions",
  "promotionEmails",
  "marketing",
  "newsletter",
  "communications.marketing",
  "preferences.marketing",
];

const MARKETING_NEGATIVE_KEYS = [
  "unsubscribe",
  "unsubscribed",
  "marketingBlocked",
  "doNotEmail",
  "optOut",
  "optedOut",
  "suppressed",
  "emailBlacklisted",
  "blocked",
];

const AMBIGUOUS_CONSENT_KEYS = [
  "consent",
  "acceptedTerms",
  "termsAccepted",
  "privacyAccepted",
  "optIn",
  "subscribed",
  "subscriptionStatus",
];

const BOOLEAN_TRUE = new Set([
  "true",
  "1",
  "yes",
  "y",
  "accepted",
  "granted",
  "subscribed",
  "active",
  "enabled",
  "optedin",
]);

const BOOLEAN_FALSE = new Set([
  "false",
  "0",
  "no",
  "n",
  "rejected",
  "denied",
  "unsubscribed",
  "inactive",
  "disabled",
  "optedout",
]);

const SUSPICIOUS_NAME_TOKENS = new Set([
  "test",
  "tester",
  "testing",
  "demo",
  "fake",
  "sample",
  "qa",
  "dev",
  "tmp",
  "prueba",
  "codex",
]);

export function parseArgs(argv = process.argv.slice(2)) {
  const flags = new Set();
  const values = new Map();

  for (const arg of argv) {
    if (!arg.startsWith("--")) {
      continue;
    }

    const trimmed = arg.slice(2);
    const separator = trimmed.indexOf("=");
    if (separator === -1) {
      flags.add(trimmed);
      continue;
    }

    const key = trimmed.slice(0, separator);
    const value = trimmed.slice(separator + 1);
    values.set(key, value);
  }

  return {
    flags,
    values,
    argv,
  };
}

export function hasFlag(args, name) {
  return args.flags.has(name);
}

export function getArg(args, name, fallback = "") {
  return args.values.has(name) ? args.values.get(name) : fallback;
}

export function splitCsv(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function loadEnvFile(envPath = DEFAULT_ENV_PATH) {
  if (!fs.existsSync(envPath)) {
    return envPath;
  }

  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const equals = trimmed.indexOf("=");
    if (equals === -1) {
      continue;
    }

    const key = trimmed.slice(0, equals).trim();
    let value = trimmed.slice(equals + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }

  return envPath;
}

export function log(level, code, message, meta = null) {
  const stamp = new Date().toISOString();
  const suffix = meta ? ` ${JSON.stringify(meta)}` : "";
  console.log(`[${stamp}] [${level.toUpperCase()}] [${code}] ${message}${suffix}`);
}

export function stableHash(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function csvEscape(value) {
  const stringValue = value == null ? "" : String(value);
  return `"${stringValue.replace(/"/g, '""')}"`;
}

export function csvLine(values) {
  return values.map(csvEscape).join(",");
}

export async function writeCsv(filePath, headers, rows) {
  const lines = [headers, ...rows].map(csvLine).join("\n");
  await fsp.writeFile(filePath, lines, "utf8");
}

export async function readJsonIfExists(filePath, fallback = null) {
  try {
    const raw = await fsp.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return fallback;
    }
    throw error;
  }
}

export async function writeJson(filePath, value) {
  await fsp.writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
}

export async function ensureOutputDir() {
  await fsp.mkdir(OUTPUT_DIR, { recursive: true });
}

export function normalizeEmail(value) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(normalized)) {
    return null;
  }

  return normalized;
}

export function normalizeHumanName(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.replace(/\s+/g, " ").trim();
}

export function canonicalToken(value) {
  return normalizeHumanName(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

export function isLikelyHumanName(value) {
  const normalized = normalizeHumanName(value);
  if (!normalized || normalized.includes("@")) {
    return false;
  }

  const canonical = canonicalToken(normalized);
  if (!canonical || SUSPICIOUS_NAME_TOKENS.has(canonical)) {
    return false;
  }

  if (/^\d+$/.test(canonical) || canonical.length <= 1) {
    return false;
  }

  if (/^(.)\1{1,}$/u.test(canonical)) {
    return false;
  }

  return /^[a-záéíóúñü' -]+$/iu.test(normalized);
}

export function extractFirstToken(value) {
  const normalized = normalizeHumanName(value);
  if (!normalized) {
    return "";
  }
  return normalized.split(" ")[0] || "";
}

export function extractRemainingTokens(value) {
  const normalized = normalizeHumanName(value);
  if (!normalized) {
    return "";
  }
  const parts = normalized.split(" ").filter(Boolean);
  return parts.slice(1).join(" ");
}

export function buildNameFingerprint(firstName, lastName) {
  const first = canonicalToken(firstName);
  const last = canonicalToken(lastName);
  if (!first && !last) {
    return "";
  }
  return `${first}|${last}`;
}

export function buildCampaignContent(senderName, baseUrl) {
  const safeSenderName = senderName || "Equipo CoachAI";
  const htmlContent = `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${CAMPAIGN_SUBJECT}</title>
  </head>
  <body style="margin:0;padding:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#17202a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f5f7;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border-radius:16px;overflow:hidden;">
            <tr>
              <td style="background:#111827;padding:28px 32px;color:#ffffff;">
                <div style="font-size:12px;letter-spacing:0.14em;text-transform:uppercase;opacity:0.72;">CoachAI</div>
                <h1 style="margin:12px 0 0;font-size:28px;line-height:1.2;font-weight:700;">${CAMPAIGN_SUBJECT}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <p style="margin:0 0 20px;font-size:18px;line-height:1.6;">
                  {% if contact.FIRSTNAME %}Hola {{ contact.FIRSTNAME }},{% else %}Hola,{% endif %}
                </p>
                <p style="margin:0 0 16px;font-size:16px;line-height:1.7;">Hay momentos en el entrenamiento en los que sientes que estás trabajando mucho... pero no sabes exactamente qué cambiar para dar el salto.</p>
                <p style="margin:0 0 16px;font-size:16px;line-height:1.7;">CoachAI nace para eso.</p>
                <p style="margin:0 0 16px;font-size:16px;line-height:1.7;">Para que puedas mirar tu técnica con otros ojos.<br />Para detectar detalles que normalmente se escapan.<br />Para entender mejor cada gesto, cada fase y cada error que te está frenando.<br />Y para que entrenar no sea solo repetir, sino mejorar con claridad y confianza.</p>
                <p style="margin:0 0 16px;font-size:16px;line-height:1.7;">Subes tu vídeo, revisas los momentos clave y empiezas a ver tu técnica de una forma mucho más precisa. No se trata solo de analizar un movimiento. Se trata de sentir que por fin entiendes qué está pasando y qué puedes hacer para rendir mejor.</p>
                <p style="margin:0 0 16px;font-size:16px;line-height:1.7;">Si entrenas de verdad, sabes lo valioso que es eso: tener más control, más seguridad y más certeza sobre tu progreso.</p>
                <p style="margin:24px 0;"><a href="${baseUrl}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:14px 22px;border-radius:10px;font-weight:700;">Ver CoachAI</a></p>
                <p style="margin:0 0 16px;font-size:16px;line-height:1.7;">Me encantará que le eches un vistazo.</p>
                <p style="margin:0 0 24px;font-size:16px;line-height:1.7;">Un saludo,<br />${safeSenderName}</p>
                <p style="margin:0;font-size:13px;line-height:1.6;color:#5b6470;">Si prefieres no recibir más mensajes, puedes <a href="{{ unsubscribe }}" style="color:#111827;">darte de baja aquí</a>.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const textContent = `{% if contact.FIRSTNAME %}Hola {{ contact.FIRSTNAME }},{% else %}Hola,{% endif %}

Hay momentos en el entrenamiento en los que sientes que estás trabajando mucho... pero no sabes exactamente qué cambiar para dar el salto.

CoachAI nace para eso.

Para que puedas mirar tu técnica con otros ojos.
Para detectar detalles que normalmente se escapan.
Para entender mejor cada gesto, cada fase y cada error que te está frenando.
Y para que entrenar no sea solo repetir, sino mejorar con claridad y confianza.

Subes tu video, revisas los momentos clave y empiezas a ver tu tecnica de una forma mucho mas precisa. No se trata solo de analizar un movimiento. Se trata de sentir que por fin entiendes que esta pasando y que puedes hacer para rendir mejor.

Si entrenas de verdad, sabes lo valioso que es eso: tener mas control, mas seguridad y mas certeza sobre tu progreso.

Puedes verlo aqui: ${baseUrl}

Me encantara que le eches un vistazo.

Un saludo,
${safeSenderName}

Si prefieres no recibir mas mensajes, usa este enlace de baja: {{ unsubscribe }}`;

  return {
    subject: CAMPAIGN_SUBJECT,
    previewText: CAMPAIGN_PREVIEW,
    htmlContent,
    textContent,
  };
}

export function resolveCampaignConfig(args = parseArgs()) {
  const envPath = getArg(args, "env", DEFAULT_ENV_PATH);
  loadEnvFile(envPath);

  const inputCandidates = [
    getArg(args, "input", ""),
    process.env.CAMPAIGN_INPUT_FILE || "",
    path.join(OUTPUT_DIR, "live-all-emails.json"),
    path.join(OUTPUT_DIR, "all-registered-emails-live.json"),
  ].filter(Boolean);

  const inputFile = inputCandidates.find((candidate) => fs.existsSync(candidate)) || inputCandidates[0];
  const authExportFile = getArg(
    args,
    "auth-export",
    process.env.CAMPAIGN_AUTH_EXPORT_FILE || path.join(OUTPUT_DIR, "auth-users.json")
  );

  const projectId =
    getArg(args, "project-id", "") ||
    process.env.FIREBASE_PROJECT_ID ||
    process.env.CAMPAIGN_FIREBASE_PROJECT_ID ||
    DEFAULT_PROJECT_ID;

  const today = new Date().toISOString().slice(0, 10);
  const senderName = process.env.BREVO_SENDER_NAME || "Equipo CoachAI";
  const baseUrl = process.env.COACHAI_BASE_URL || "https://coachai.es";

  return {
    args,
    envPath,
    projectId,
    inputFile,
    authExportFile,
    output: {
      recipientsCsv: path.join(OUTPUT_DIR, "campaign_recipients.csv"),
      recipientsJson: path.join(OUTPUT_DIR, "campaign_recipients.json"),
      reviewCsv: path.join(OUTPUT_DIR, "campaign_review_required.csv"),
      rejectedCsv: path.join(OUTPUT_DIR, "campaign_rejected.csv"),
      summaryJson: path.join(OUTPUT_DIR, "campaign_summary.json"),
      brevoSyncState: path.join(OUTPUT_DIR, "brevo_sync_state.json"),
      brevoSyncResult: path.join(OUTPUT_DIR, "brevo_sync_result.json"),
      brevoCampaignState: path.join(OUTPUT_DIR, "brevo_campaign_state.json"),
      brevoCampaignPayload: path.join(OUTPUT_DIR, "brevo_campaign_payload.json"),
      brevoCampaignResult: path.join(OUTPUT_DIR, "brevo_campaign_result.json"),
    },
    campaign: {
      senderName,
      baseUrl,
      listName: process.env.BREVO_LIST_NAME || `CoachAI - Promo ${today}`,
      campaignName: process.env.BREVO_CAMPAIGN_NAME || `CoachAI - Promo ${today}`,
      campaignTag: process.env.BREVO_CAMPAIGN_TAG || `coachai-promo-${today}`,
      ...buildCampaignContent(senderName, baseUrl),
    },
    brevo: {
      apiKey: process.env.BREVO_API_KEY || "",
      senderEmail: process.env.BREVO_SENDER_EMAIL || "",
      senderName,
      replyTo: process.env.BREVO_REPLY_TO || process.env.BREVO_SENDER_EMAIL || "",
      folderId: parseInteger(process.env.BREVO_FOLDER_ID),
      folderName: process.env.BREVO_FOLDER_NAME || "CoachAI",
      listId: parseInteger(process.env.BREVO_LIST_ID),
      listName: process.env.BREVO_LIST_NAME || `CoachAI - Promo ${today}`,
      campaignName: process.env.BREVO_CAMPAIGN_NAME || `CoachAI - Promo ${today}`,
      campaignTag: process.env.BREVO_CAMPAIGN_TAG || `coachai-promo-${today}`,
      unsubscribePageId: process.env.BREVO_UNSUBSCRIBE_PAGE_ID || "",
      updateFormId: process.env.BREVO_UPDATE_FORM_ID || "",
      rateLimitMs: parseInteger(process.env.BREVO_RATE_LIMIT_MS) || 350,
      batchSize: parseInteger(process.env.BREVO_BATCH_SIZE) || 50,
      testEmails: splitCsv(process.env.BREVO_TEST_EMAILS || ""),
    },
    execution: {
      execute: hasFlag(args, "execute"),
      send: hasFlag(args, "send"),
    },
  };
}

function parseInteger(value) {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function loadRegisteredEmailRows(config) {
  if (!config.inputFile || !fs.existsSync(config.inputFile)) {
    throw new Error(`Email export file not found: ${config.inputFile}`);
  }

  const raw = JSON.parse(await fsp.readFile(config.inputFile, "utf8"));
  const rows = Array.isArray(raw) ? raw : Array.isArray(raw.rows) ? raw.rows : [];

  return rows
    .map((row) => ({
      email: normalizeEmail(row.email),
      source: normalizeSourceString(row.source),
      sourcePath: String(row.sourcePath || ""),
      uid: String(row.uid || ""),
      notes: String(row.notes || ""),
    }))
    .filter((row) => row.email);
}

function normalizeSourceString(value) {
  return splitSourceList(value).join("|");
}

export function splitSourceList(value) {
  return String(value || "")
    .split(/[|,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export async function loadAuthUsers(config) {
  if (fs.existsSync(config.authExportFile)) {
    const raw = JSON.parse(await fsp.readFile(config.authExportFile, "utf8"));
    return Array.isArray(raw.users) ? raw.users : [];
  }

  const app = tryInitAdmin(config);
  if (!app) {
    return [];
  }

  const users = [];
  let pageToken;
  do {
    const page = await app.auth().listUsers(1000, pageToken);
    users.push(...page.users.map((entry) => entry.toJSON()));
    pageToken = page.pageToken;
  } while (pageToken);

  return users;
}

export async function loadFirestoreCollections(config, collections) {
  const app = tryInitAdmin(config);
  if (app) {
    return loadFirestoreCollectionsWithAdmin(app, collections);
  }

  const token = await getFirebaseCliAccessToken();
  if (!token) {
    throw new Error(
      "No Firebase service account and no firebase-tools login token available. Firestore enrichment cannot continue."
    );
  }

  return loadFirestoreCollectionsWithRest(token, config.projectId, collections);
}

function tryInitAdmin(config) {
  const existing = admin.apps.find((entry) => entry.name === ADMIN_APP_NAME) || admin.apps[0];
  if (existing) {
    return existing;
  }

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "";
  const serviceAccountPath =
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH ||
    "";

  try {
    if (serviceAccountJson) {
      const credentials = JSON.parse(serviceAccountJson);
      return admin.initializeApp(
        {
          credential: admin.credential.cert(credentials),
          projectId: config.projectId,
        },
        ADMIN_APP_NAME
      );
    }

    if (serviceAccountPath && fs.existsSync(serviceAccountPath)) {
      const credentials = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));
      return admin.initializeApp(
        {
          credential: admin.credential.cert(credentials),
          projectId: config.projectId,
        },
        ADMIN_APP_NAME
      );
    }
  } catch (error) {
    log("warn", "ADMIN_INIT_FAILED", "Falling back to firebase-tools session", {
      message: error?.message || String(error),
    });
  }

  return null;
}

async function loadFirestoreCollectionsWithAdmin(app, collections) {
  const db = app.firestore();
  const result = {};

  for (const collection of collections) {
    const snapshot = await db.collection(collection).get();
    result[collection] = snapshot.docs.map((doc) => ({
      id: doc.id,
      path: `${collection}/${doc.id}`,
      data: doc.data(),
    }));
  }

  return result;
}

async function loadFirestoreCollectionsWithRest(token, projectId, collections) {
  const result = {};

  for (const collection of collections) {
    result[collection] = await fetchFirestoreCollectionRest(token, projectId, collection);
  }

  return result;
}

async function fetchFirestoreCollectionRest(token, projectId, collectionName) {
  const documents = [];
  let pageToken = "";

  do {
    const url = new URL(
      `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collectionName}`
    );
    url.searchParams.set("pageSize", "250");
    if (pageToken) {
      url.searchParams.set("pageToken", pageToken);
    }

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Firestore REST read failed for ${collectionName}: ${response.status} ${body}`
      );
    }

    const json = await response.json();
    for (const document of json.documents || []) {
      documents.push({
        id: document.name.split("/").pop(),
        path: document.name.split("/documents/")[1],
        data: unmarshalFirestoreDocument(document),
      });
    }

    pageToken = json.nextPageToken || "";
  } while (pageToken);

  return documents;
}

function unmarshalFirestoreDocument(document) {
  const result = {};
  for (const [key, value] of Object.entries(document.fields || {})) {
    result[key] = unmarshalFirestoreValue(value);
  }
  return result;
}

function unmarshalFirestoreValue(value) {
  if (!value || typeof value !== "object") {
    return null;
  }
  if ("stringValue" in value) {
    return value.stringValue;
  }
  if ("booleanValue" in value) {
    return value.booleanValue;
  }
  if ("integerValue" in value) {
    return Number(value.integerValue);
  }
  if ("doubleValue" in value) {
    return Number(value.doubleValue);
  }
  if ("timestampValue" in value) {
    return value.timestampValue;
  }
  if ("nullValue" in value) {
    return null;
  }
  if ("arrayValue" in value) {
    return (value.arrayValue.values || []).map(unmarshalFirestoreValue);
  }
  if ("mapValue" in value) {
    const mapped = {};
    for (const [key, entry] of Object.entries(value.mapValue.fields || {})) {
      mapped[key] = unmarshalFirestoreValue(entry);
    }
    return mapped;
  }
  return null;
}

async function getFirebaseCliAccessToken() {
  if (process.env.FIREBASE_TOOLS_TOKEN) {
    return process.env.FIREBASE_TOOLS_TOKEN;
  }

  if (!fs.existsSync(FIREBASE_TOOLS_CONFIG)) {
    return "";
  }

  try {
    const config = JSON.parse(fs.readFileSync(FIREBASE_TOOLS_CONFIG, "utf8"));
    const refreshToken = config?.tokens?.refresh_token || "";
    if (!refreshToken) {
      return config?.tokens?.access_token || "";
    }

    const params = new URLSearchParams({
      client_id:
        "563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com",
      client_secret: "j9iVZfS8kkCEFUPaAeJV0sAi",
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    });

    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    if (!response.ok) {
      return config?.tokens?.access_token || "";
    }

    const refreshed = await response.json();
    return refreshed.access_token || config?.tokens?.access_token || "";
  } catch {
    return "";
  }
}

export function indexByEmail(items, selector) {
  const map = new Map();
  for (const item of items) {
    const email = normalizeEmail(selector(item));
    if (email) {
      map.set(email, item);
    }
  }
  return map;
}

export function indexByUid(items, selector) {
  const map = new Map();
  for (const item of items) {
    const uid = String(selector(item) || "").trim();
    if (uid) {
      map.set(uid, item);
    }
  }
  return map;
}

export function groupByEmail(items, selector) {
  const map = new Map();
  for (const item of items) {
    const email = normalizeEmail(selector(item));
    if (!email) {
      continue;
    }
    const bucket = map.get(email) || [];
    bucket.push(item);
    map.set(email, bucket);
  }
  return map;
}

export function computeRepeatedNameStats(userDocuments) {
  const stats = new Map();

  for (const entry of userDocuments) {
    const profile = entry.data?.profile || {};
    const firstName = normalizeHumanName(profile.firstName || entry.data?.firstName || "");
    const lastName = normalizeHumanName(profile.lastName || entry.data?.lastName || "");
    const fingerprint = buildNameFingerprint(firstName, lastName);
    if (!fingerprint) {
      continue;
    }

    const record = stats.get(fingerprint) || {
      firstName,
      lastName,
      emails: new Set(),
      roles: new Set(),
      count: 0,
    };

    record.count += 1;
    if (entry.data?.email) {
      record.emails.add(normalizeEmail(entry.data.email));
    }
    if (entry.data?.role || entry.data?.profile?.role) {
      record.roles.add(String(entry.data.role || entry.data.profile.role));
    }
    stats.set(fingerprint, record);
  }

  return stats;
}

export function detectConsent(objects) {
  const signals = [];

  for (const objectValue of objects.filter(Boolean)) {
    collectConsentSignals(objectValue, "", 0, signals);
  }

  const denied = signals.find((signal) => signal.status === "denied");
  if (denied) {
    return denied;
  }

  const granted = signals.find((signal) => signal.status === "granted");
  if (granted) {
    return granted;
  }

  const review = signals.find((signal) => signal.status === "review_required");
  if (review) {
    return review;
  }

  return {
    status: "unknown",
    reason: "missing",
    path: "",
  };
}

function collectConsentSignals(value, prefix, depth, signals) {
  if (depth > 4 || value == null) {
    return;
  }

  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      collectConsentSignals(value[index], `${prefix}[${index}]`, depth + 1, signals);
    }
    return;
  }

  if (typeof value !== "object") {
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    const pathValue = prefix ? `${prefix}.${key}` : key;
    const normalizedPath = canonicalToken(pathValue);
    const scalar = normalizeBooleanLike(child);

    if (scalar !== null) {
      if (matchesAnyConsentKey(normalizedPath, MARKETING_NEGATIVE_KEYS)) {
        signals.push({
          status: scalar ? "denied" : "review_required",
          reason: scalar ? "explicit_marketing_opt_out" : "negative_flag_disabled",
          path: pathValue,
        });
      } else if (matchesAnyConsentKey(normalizedPath, MARKETING_POSITIVE_KEYS)) {
        signals.push({
          status: scalar ? "granted" : "denied",
          reason: scalar ? "explicit_marketing_opt_in" : "explicit_marketing_opt_out",
          path: pathValue,
        });
      } else if (matchesAnyConsentKey(normalizedPath, AMBIGUOUS_CONSENT_KEYS)) {
        signals.push({
          status: scalar ? "review_required" : "denied",
          reason: scalar ? "ambiguous_positive_consent" : "ambiguous_negative_consent",
          path: pathValue,
        });
      } else if (
        normalizedPath.includes("marketing") ||
        normalizedPath.includes("newsletter") ||
        normalizedPath.includes("promo")
      ) {
        signals.push({
          status: scalar ? "granted" : "denied",
          reason: scalar ? "heuristic_marketing_opt_in" : "heuristic_marketing_opt_out",
          path: pathValue,
        });
      }
    }

    collectConsentSignals(child, pathValue, depth + 1, signals);
  }
}

function normalizeBooleanLike(value) {
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
    return null;
  }

  if (typeof value === "string") {
    const normalized = canonicalToken(value);
    if (BOOLEAN_TRUE.has(normalized)) {
      return true;
    }
    if (BOOLEAN_FALSE.has(normalized)) {
      return false;
    }
  }

  return null;
}

function matchesAnyConsentKey(normalizedPath, candidates) {
  const normalizedCandidates = candidates.map((entry) => canonicalToken(entry));
  return normalizedCandidates.some(
    (candidate) =>
      normalizedPath === candidate ||
      normalizedPath.endsWith(candidate) ||
      normalizedPath.includes(candidate)
  );
}

export async function loadState(filePath, fallback) {
  const state = await readJsonIfExists(filePath, fallback);
  return state == null ? fallback : state;
}

export async function saveState(filePath, state) {
  await writeJson(filePath, state);
}

export async function sleep(ms) {
  if (!ms || ms <= 0) {
    return;
  }
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export function chunkArray(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export async function brevoRequest(config, method, resourcePath, body = null) {
  if (!config.brevo.apiKey) {
    throw new Error("BREVO_API_KEY is missing.");
  }

  const response = await fetch(`https://api.brevo.com/v3${resourcePath}`, {
    method,
    headers: {
      "api-key": config.brevo.apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body == null ? undefined : JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${method} ${resourcePath} failed: ${response.status} ${text}`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

export async function listBrevoFolders(config) {
  const folders = [];
  let offset = 0;
  while (true) {
    const page = await brevoRequest(
      config,
      "GET",
      `/contacts/folders?limit=50&offset=${offset}&sort=desc`
    );
    const batch = page?.folders || [];
    folders.push(...batch);
    if (batch.length < 50) {
      break;
    }
    offset += batch.length;
  }
  return folders;
}

export async function ensureBrevoFolder(config, dryRun) {
  if (config.brevo.folderId) {
    return {
      id: config.brevo.folderId,
      name: config.brevo.folderName,
      reused: true,
      dryRun,
    };
  }

  if (dryRun && !config.brevo.apiKey) {
    return {
      id: null,
      name: config.brevo.folderName,
      reused: false,
      dryRun: true,
    };
  }

  const folders = await listBrevoFolders(config);
  const existing = folders.find(
    (folder) => canonicalToken(folder.name) === canonicalToken(config.brevo.folderName)
  );
  if (existing) {
    return {
      id: existing.id,
      name: existing.name,
      reused: true,
      dryRun,
    };
  }

  if (dryRun) {
    return {
      id: null,
      name: config.brevo.folderName,
      reused: false,
      dryRun: true,
    };
  }

  const created = await brevoRequest(config, "POST", "/contacts/folders", {
    name: config.brevo.folderName,
  });
  return {
    id: created.id,
    name: config.brevo.folderName,
    reused: false,
    dryRun: false,
  };
}

export async function listBrevoLists(config) {
  const lists = [];
  let offset = 0;
  while (true) {
    const page = await brevoRequest(
      config,
      "GET",
      `/contacts/lists?limit=50&offset=${offset}&sort=desc`
    );
    const batch = page?.lists || [];
    lists.push(...batch);
    if (batch.length < 50) {
      break;
    }
    offset += batch.length;
  }
  return lists;
}

export async function ensureBrevoList(config, folder, dryRun) {
  if (config.brevo.listId) {
    return {
      id: config.brevo.listId,
      name: config.brevo.listName,
      folderId: folder?.id || config.brevo.folderId || null,
      reused: true,
      dryRun,
    };
  }

  if (dryRun && !config.brevo.apiKey) {
    return {
      id: null,
      name: config.brevo.listName,
      folderId: folder?.id || null,
      reused: false,
      dryRun: true,
    };
  }

  const lists = await listBrevoLists(config);
  const existing = lists.find(
    (entry) => canonicalToken(entry.name) === canonicalToken(config.brevo.listName)
  );
  if (existing) {
    return {
      id: existing.id,
      name: existing.name,
      folderId: existing.folderId || folder?.id || null,
      reused: true,
      dryRun,
    };
  }

  if (dryRun) {
    return {
      id: null,
      name: config.brevo.listName,
      folderId: folder?.id || null,
      reused: false,
      dryRun: true,
    };
  }

  if (!folder?.id) {
    throw new Error("Cannot create Brevo list without a folder id.");
  }

  const created = await brevoRequest(config, "POST", "/contacts/lists", {
    folderId: folder.id,
    name: config.brevo.listName,
  });

  return {
    id: created.id,
    name: config.brevo.listName,
    folderId: folder.id,
    reused: false,
    dryRun: false,
  };
}

export async function getExistingBrevoCampaign(config, campaignState) {
  if (campaignState?.campaignId) {
    return campaignState;
  }

  if (!config.brevo.apiKey) {
    return null;
  }

  const response = await brevoRequest(
    config,
    "GET",
    "/emailCampaigns?limit=50&offset=0&sort=desc"
  );
  const campaigns = response?.campaigns || [];
  const match = campaigns.find(
    (campaign) =>
      canonicalToken(campaign.name) === canonicalToken(config.brevo.campaignName) &&
      canonicalToken(campaign.tag || "") === canonicalToken(config.brevo.campaignTag || "")
  );

  if (!match) {
    return null;
  }

  return {
    campaignId: match.id,
    status: match.status || "unknown",
    name: match.name,
    tag: match.tag || "",
  };
}
