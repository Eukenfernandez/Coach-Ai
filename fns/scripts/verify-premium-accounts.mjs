// The server only grants the PREMIUM_EMAILS bypass (fns/src/quota.ts) to Auth
// accounts whose email is verified, and email/password sign-up never verifies
// it. Run this once after deploying, and again whenever an address is added
// to the list.
//
// 1. List the accounts and check each one really belongs to that person
//    (creation date, last sign-in):
//      PowerShell: $env:GOOGLE_APPLICATION_CREDENTIALS="C:\ruta\service-account.json"; npm run premium:verify
//      bash:       GOOGLE_APPLICATION_CREDENTIALS=/ruta/service-account.json npm run premium:verify
// 2. Mark them as verified:
//      npm run premium:verify -- --apply

import { getAuth } from "firebase-admin/auth";
import { PREMIUM_EMAILS } from "../lib/quota.js";

const apply = process.argv.includes("--apply");
const auth = getAuth();

for (const email of PREMIUM_EMAILS) {
  let user;
  try {
    user = await auth.getUserByEmail(email);
  } catch (error) {
    if (error?.code === "auth/user-not-found") {
      console.log(`${email}: sin cuenta. Quien la registre tendrá que verificar el email para ser premium.`);
      continue;
    }
    throw error;
  }

  const summary =
    `${email}: uid=${user.uid} creada=${user.metadata.creationTime} ` +
    `último acceso=${user.metadata.lastSignInTime} verificado=${user.emailVerified}`;

  if (user.emailVerified || !apply) {
    console.log(summary);
    continue;
  }

  await auth.updateUser(user.uid, { emailVerified: true });
  console.log(`${summary} -> marcado como verificado`);
}

if (!apply) {
  console.log("\nSolo lectura. Si todas las cuentas son legítimas, repite con --apply.");
}
