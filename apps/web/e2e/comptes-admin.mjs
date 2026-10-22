#!/usr/bin/env node
/**
 * Recette navigateur de la gestion des comptes (docs/workstreams/users-management, phase 5) sur l'API réelle qui sert
 * l'application construite (même origine, base migrée, `FADI_ADMIN_ENABLED=true`, `FADI_ENCRYPTION_KEY` posée) :
 *
 *  - administrateur amorcé par `apps/api/scripts/create-admin.mjs`, refusé sur /admin/utilisateurs sans double
 *    authentification, enrôlement TOTP dans Mon compte (code calculé ici, RFC 6238), codes de secours ;
 *  - connexion en deux étapes (code de secours), page /admin/utilisateurs (tableau, filtres, fiche) ;
 *  - invitation : garde-fou de courriel atteint → « lien à copier » ; activation du compte invité par ce lien ;
 *  - mot de passe oublié / réinitialisation (lien lu dans Mailpit ou dans le journal du transport console) ;
 *  - A se connecte → sa session est révoquée → B se connecte dans le même navigateur → aucune donnée de A visible ;
 *  - axe-core sans violation critique ni sérieuse sur chaque nouvel écran, bureau et téléphone (390 × 844).
 *
 *   BASE_URL=http://localhost:3001 DATABASE_URL=… [MAILPIT_URL=http://localhost:8025 | MAIL_LOG=api.log] \
 *     node apps/web/e2e/comptes-admin.mjs
 */
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const AXE_SCRIPT = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const CREATE_ADMIN = fileURLToPath(new URL("../../api/scripts/create-admin.mjs", import.meta.url));
let failures = 0;
function check(label, ok, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${label}${!ok && detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}
const uid = () => randomUUID().replaceAll("-", "").slice(0, 12);
const email = (role) => `comptes-${role}-${uid()}@example.test`;
const password = () => `phrase de passe ${randomBytes(6).toString("hex")}`;

// --- TOTP (RFC 6238, SHA-1, 6 chiffres, 30 s) -------------------------------------------------------------------
function base32(text) {
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0, value = 0; const out = [];
  for (const ch of text.replace(/[\s=]/g, "").toUpperCase()) { value = (value << 5) | A.indexOf(ch); bits += 5; if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; } }
  return Buffer.from(out);
}
function totp(secret, step = Math.floor(Date.now() / 30_000)) {
  const msg = Buffer.alloc(8); msg.writeBigUInt64BE(BigInt(step));
  const mac = createHmac("sha1", base32(secret)).update(msg).digest();
  const o = mac[mac.length - 1] & 15;
  return String((((mac[o] & 127) << 24) | (mac[o + 1] << 16) | (mac[o + 2] << 8) | mac[o + 3]) % 1_000_000).padStart(6, "0");
}

// --- Courriels : Mailpit (CI) ou journal du transport console (local) ----------------------------------------------
async function mailLink(to, path) {
  for (let i = 0; i < 40; i++) {
    if (process.env.MAILPIT_URL) {
      const base = process.env.MAILPIT_URL.replace(/\/$/, "");
      const list = await fetch(`${base}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`).then((r) => r.json()).catch(() => null);
      for (const m of list?.messages ?? []) {
        const full = await fetch(`${base}/api/v1/message/${m.ID}`).then((r) => r.json()).catch(() => null);
        const hit = (full?.Text ?? "").match(new RegExp(`https?://\\S*${path}#jeton=[\\w%-]+`));
        if (hit) return hit[0];
      }
    }
    for (const file of (process.env.MAIL_LOG ?? "").split(",").filter(Boolean)) {
      if (!existsSync(file)) continue;
      const lines = readFileSync(file, "utf8").split("\n").filter((l) => l.includes('"mail (console)"') && l.includes(to)).reverse();
      for (const l of lines) {
        const hit = (JSON.parse(l).text ?? "").match(new RegExp(`https?://\\S*${path}#jeton=[\\w%-]+`));
        if (hit) return hit[0];
      }
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return null;
}

async function axe(page, nom) {
  await page.addScriptTag({ path: AXE_SCRIPT });
  const graves = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] } }))
    .violations.filter((v) => ["critical", "serious"].includes(v.impact)).map((v) => `${v.id} (${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")})`));
  check(`axe-core ${nom} : aucune violation critique ou sérieuse`, graves.length === 0, graves.join(", "));
}

async function apiOf(page, method, path, data) {
  const r = await page.request[method](`${BASE}${path}`, data === undefined ? undefined : { data });
  return { status: r.status(), body: await r.json().catch(() => null) };
}

async function uiLogin(page, mail, pass) {
  await page.goto(`${BASE}/connexion`);
  await page.fill('input[name="email"]', mail);
  await page.fill('input[name="password"]', pass);
  await page.click('button[type="submit"]');
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined) });
const desktop = { viewport: { width: 1440, height: 900 } };
const phone = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };
const pageErrors = [];
const track = (page) => page.on("pageerror", (e) => pageErrors.push(e.message));

try {
  // 1. Administrateur amorcé : inscription, promotion par le script d'exploitation.
  const adminMail = email("admin"), adminPass = password();
  const adminCtx = await browser.newContext(desktop);
  const admin = await adminCtx.newPage(); track(admin);
  await admin.goto(`${BASE}/inscription`);
  await admin.fill('input[name="email"]', adminMail);
  await admin.fill('input[name="password"]', "court");
  check("inscription : indicateur de robustesse affiché", (await admin.locator(".pw-meter[data-strength='trop-court']").count()) === 1);
  await admin.click('button[type="submit"]');
  check("inscription : moins de 12 caractères refusé côté interface", await admin.locator("p[role=alert]").isVisible());
  await axe(admin, "inscription (bureau)");
  await admin.fill('input[name="password"]', adminPass);
  await admin.click('button[type="submit"]');
  await admin.waitForURL(/\/accueil/);
  const out = execFileSync(process.execPath, [CREATE_ADMIN, adminMail], { env: { ...process.env, DATABASE_URL: process.env.CREATE_ADMIN_DATABASE_URL ?? process.env.DATABASE_URL }, encoding: "utf8" });
  check("create-admin.mjs : compte promu, aucun secret affiché", /promu administrateur/.test(out) && !/jeton|#jeton|password/i.test(out), out.trim());

  // La promotion ferme les sessions : reconnexion ; sans double authentification, l'administration est refusée.
  await uiLogin(admin, adminMail, adminPass);
  await admin.waitForURL(/\/accueil/);
  check("entrée « Administration » visible pour un administrateur", await admin.locator("[data-nav-admin]").waitFor({ timeout: 10_000 }).then(() => true, () => false));
  await admin.goto(`${BASE}/admin/utilisateurs`);
  await admin.locator("[data-admin-mfa-required]").waitFor();
  check("administration sans double authentification : renvoi vers l'enrôlement", true);
  await axe(admin, "administration — double authentification exigée (bureau)");

  // 2. Mon compte : enrôlement TOTP.
  await admin.goto(`${BASE}/parametres`);
  await admin.locator("[data-mon-compte]").waitFor();
  await axe(admin, "Paramètres — Mon compte (bureau)");
  await admin.getByRole("button", { name: "Activer la double authentification" }).click();
  const secret = (await admin.locator("[data-mfa-secret]").textContent()).trim();
  check("enrôlement : QR code affiché", await admin.locator("img.mfa-qr").isVisible());
  await axe(admin, "Mon compte — enrôlement TOTP (bureau)");
  await admin.fill("#mfa-code", totp(secret));
  await admin.getByRole("button", { name: "Confirmer l’activation" }).click();
  await admin.locator("[data-recovery-codes]").waitFor();
  const recovery = (await admin.locator(".recovery-codes li").allTextContents()).map((s) => s.trim());
  check("10 codes de secours affichés une fois", recovery.length === 10, String(recovery.length));
  await admin.locator("[data-mfa-state='on']").waitFor();

  // 3. Connexion en deux étapes (code de secours : le code TOTP de l'enrôlement ne peut pas être rejoué).
  await admin.goto(`${BASE}/parametres`);
  await admin.locator('[data-mon-compte] button:has-text("Se déconnecter"), .settings-section button:has-text("Se déconnecter")').first().click();
  await admin.waitForURL(/\/connexion/);
  await uiLogin(admin, adminMail, adminPass);
  await admin.locator("[data-login-mfa]").waitFor();
  check("connexion : étape « code » après le mot de passe", true);
  await axe(admin, "connexion — saisie du code (bureau)");
  await admin.getByRole("button", { name: "Utiliser un code de secours" }).click();
  await admin.fill("#login-code", recovery[0]);
  await admin.click('[data-login-mfa] button[type="submit"]');
  await admin.waitForURL(/\/accueil/);
  check("connexion en deux étapes réussie (code de secours)", true);
  // Le même code de secours ne sert qu'une fois.
  const reuseCtx = await browser.newContext(desktop);
  const reuse = await reuseCtx.newPage();
  await uiLogin(reuse, adminMail, adminPass);
  await reuse.locator("[data-login-mfa]").waitFor();
  await reuse.getByRole("button", { name: "Utiliser un code de secours" }).click();
  await reuse.fill("#login-code", recovery[0]);
  await reuse.click('[data-login-mfa] button[type="submit"]');
  await reuse.locator("[data-login-mfa] p[role=alert]").waitFor();
  check("code de secours réutilisé : refusé", true);
  await reuseCtx.close();

  // 4. Administration : tableau, filtres, fiche.
  await admin.goto(`${BASE}/admin/utilisateurs`);
  await admin.locator("[data-admin-users] table").waitFor();
  check("administration : tableau des comptes", (await admin.locator("[data-admin-user]").count()) >= 1);
  await axe(admin, "administration — utilisateurs (bureau)");
  await admin.fill('input[name="q"]', adminMail);
  await admin.getByRole("button", { name: "Rechercher", exact: true }).click();
  await admin.locator(`[data-admin-user="${adminMail}"]`).waitFor();
  await admin.waitForFunction(() => document.querySelectorAll("[data-admin-user]").length === 1, null, { timeout: 10_000 }).catch(() => undefined);
  check("recherche par adresse", (await admin.locator("[data-admin-user]").count()) === 1);
  await admin.locator(`[data-admin-user="${adminMail}"] button`).click();
  await admin.locator(`[data-admin-detail="${adminMail}"]`).waitFor();
  check("fiche : historique d'audit présent", (await admin.locator("[data-admin-detail] .admin-table tbody tr").count()) > 0);
  await axe(admin, "administration — fiche utilisateur (bureau)");

  // 5. Invitation : 5 courriels à la même adresse en une heure, le 6ᵉ bascule vers le lien à copier (garde-fou D-1).
  const invitee = email("invite");
  for (let i = 0; i < 5; i++) await apiOf(admin, "post", "/admin/users/invitations", { email: invitee });
  await admin.fill('input[name="inviteEmail"]', invitee);
  await admin.getByRole("button", { name: "Envoyer l’invitation" }).click();
  await admin.locator("[data-copy-link]").waitFor();
  const link = (await admin.locator("[data-copy-link] code").textContent()).trim();
  check("garde-fou de courriel atteint : lien à copier affiché", /\/compte\/invitation#jeton=/.test(link), link);
  await axe(admin, "administration — lien à copier (bureau)");

  // 6. Activation du compte invité par ce lien (autre navigateur).
  const invCtx = await browser.newContext(desktop);
  const inv = await invCtx.newPage(); track(inv);
  await inv.goto(link.replace(/^https?:\/\/[^/]+/, BASE));
  await inv.locator("[data-activate]").waitFor();
  await axe(inv, "invitation — activation (bureau)");
  const invPass = password();
  await inv.fill("#inv-password", invPass);
  await inv.check('input[name="acceptTerms"]');
  await inv.click('[data-activate] button[type="submit"]');
  await inv.waitForURL(/\/accueil/);
  check("invitation activée : compte créé et connecté", true);
  await invCtx.close();

  // 7. Mot de passe oublié → lien reçu → réinitialisation.
  const resetCtx = await browser.newContext(desktop);
  const reset = await resetCtx.newPage(); track(reset);
  // Compte neuf : l'adresse invitée a déjà atteint la limite de 5 courriels par heure (elle ne recevrait rien, à juste titre).
  const forgetful = email("oubli");
  check("compte neuf pour la réinitialisation", (await apiOf(reset, "post", "/auth/register", { email: forgetful, password: password() })).status === 201);
  await apiOf(reset, "post", "/auth/logout");
  await reset.goto(`${BASE}/compte/mot-de-passe-oublie`);
  await axe(reset, "mot de passe oublié (bureau)");
  await reset.fill('input[name="email"]', forgetful);
  await reset.click('button[type="submit"]');
  await reset.locator("p[role=status]").waitFor();
  const resetLink = await mailLink(forgetful, "/compte/reinitialiser");
  check("lien de réinitialisation reçu", !!resetLink);
  if (resetLink) {
    await reset.goto(resetLink.replace(/^https?:\/\/[^/]+/, BASE));
    await axe(reset, "réinitialisation (bureau)");
    await reset.fill("#reset-password", password());
    await reset.click('button[type="submit"]');
    await reset.locator("p[role=status]").waitFor();
    check("mot de passe réinitialisé", true);
  }
  await resetCtx.close();

  // 8. A puis B sur le même navigateur : la session de A est révoquée ; B ne voit rien de A.
  const shared = await browser.newContext(desktop);
  const tab = await shared.newPage(); track(tab);
  const aMail = email("a"), aPass = password(), bMail = email("b"), bPass = password();
  await tab.goto(`${BASE}/inscription`);
  await tab.fill('input[name="email"]', aMail); await tab.fill('input[name="password"]', aPass);
  await tab.click('button[type="submit"]'); await tab.waitForURL(/\/accueil/);
  const secretName = `Secret de A ${uid()}`;
  const created = await apiOf(tab, "post", "/projects", { code: "A-01", name: secretName });
  check("A crée un projet", created.status === 201, String(created.status));
  await tab.goto(`${BASE}/projets`);
  await tab.getByText(secretName).first().waitFor();
  // Révocation de la session du navigateur depuis un autre appareil de A.
  const other = await browser.newContext(desktop);
  const otherPage = await other.newPage();
  await uiLogin(otherPage, aMail, aPass); await otherPage.waitForURL(/\/accueil/);
  const revoked = await apiOf(otherPage, "delete", "/auth/me/sessions");
  check("A révoque ses autres sessions", revoked.status === 200 && revoked.body?.revoked >= 1, JSON.stringify(revoked.body));
  await other.close();
  await tab.goto(`${BASE}/projets`);
  await tab.waitForURL(/\/connexion/);
  check("session révoquée : retour à la connexion", true);
  check("après 401 : utilisateur mémorisé oublié", (await tab.evaluate(() => localStorage.getItem("fadi.lastUser"))) === null);
  await tab.goto(`${BASE}/inscription`);
  await tab.fill('input[name="email"]', bMail); await tab.fill('input[name="password"]', bPass);
  await tab.click('button[type="submit"]'); await tab.waitForURL(/\/accueil/);
  await tab.goto(`${BASE}/projets`);
  await tab.waitForLoadState("networkidle");
  check("B connecté sur le même navigateur : aucune donnée de A visible", (await tab.getByText(secretName).count()) === 0);
  const leaked = await tab.evaluate(async (needle) => new Promise((resolve) => {
    const req = indexedDB.open("fadi-local");
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("keyValue")) return resolve(false);
      const all = db.transaction("keyValue").objectStore("keyValue").getAll();
      all.onsuccess = () => resolve(JSON.stringify(all.result).includes(needle));
      all.onerror = () => resolve(false);
    };
    req.onerror = () => resolve(false);
  }), secretName);
  check("B : le cache persistant (IndexedDB) ne contient rien de A", leaked === false);
  await shared.close();

  // 8 bis. Projet → Membres : invitation d'une adresse sans compte, accès support accordé à l'administrateur.
  const ownerCtx = await browser.newContext(desktop);
  const owner = await ownerCtx.newPage(); track(owner);
  const oMail = email("proprio"), oPass = password();
  await owner.goto(`${BASE}/inscription`);
  await owner.fill('input[name="email"]', oMail); await owner.fill('input[name="password"]', oPass);
  await owner.click('button[type="submit"]'); await owner.waitForURL(/\/accueil/);
  const proj = (await apiOf(owner, "post", "/projects", { code: "SUP-01", name: `Projet support ${uid()}` })).body;
  await owner.goto(`${BASE}/projets/${proj.id}?module=collaboration`);
  await owner.locator(".members-invite input[type=email]").fill(email("sans-compte"));
  await owner.locator(".members-invite button[type=submit]").click();
  await owner.locator("[data-project-invitations] li").first().waitFor();
  check("membres : invitation en attente affichée pour une adresse sans compte", true);
  await owner.locator("[data-support-panel] select").selectOption({ label: adminMail });
  await owner.locator("[data-support-panel] textarea").fill("Diagnostic de la recette");
  await owner.getByRole("button", { name: "Accorder l’accès support" }).click();
  await owner.locator("[data-confirm]").click();
  await owner.locator("[data-support-grant=active]").waitFor();
  check("accès support accordé et listé", true);
  await axe(owner, "projet — membres et accès support (bureau)");
  await admin.goto(`${BASE}/projets/${proj.id}?module=collaboration`);
  await admin.locator("[data-support-banner]").waitFor();
  check("administrateur : bandeau « Accès support jusqu'au … »", /jusqu’au/.test(await admin.locator("[data-support-banner]").textContent()));
  check("accès support : aucun formulaire de commentaire", (await admin.locator("form.comment-form").count()) === 0);
  await ownerCtx.close();

  // 9. Téléphone (390 × 844) : écrans publics, Mon compte, administration.
  const mobileCtx = await browser.newContext(phone);
  const mobile = await mobileCtx.newPage(); track(mobile);
  await mobile.goto(`${BASE}/connexion`);
  await axe(mobile, "connexion (téléphone)");
  await mobile.goto(`${BASE}/compte/mot-de-passe-oublie`);
  await axe(mobile, "mot de passe oublié (téléphone)");
  const invitee2 = email("invite2");
  const inv2 = await apiOf(admin, "post", "/admin/users/invitations", { email: invitee2 });
  const link2 = inv2.body?.mail?.link ?? await mailLink(invitee2, "/compte/invitation");
  check("deuxième invitation : lien obtenu (courriel ou lien à copier)", !!link2);
  if (link2) {
    await mobile.goto(link2.replace(/^https?:\/\/[^/]+/, BASE));
    await mobile.locator("[data-activate]").waitFor();
    await axe(mobile, "invitation — activation (téléphone)");
  }
  await uiLogin(mobile, adminMail, adminPass);
  await mobile.locator("[data-login-mfa]").waitFor();
  await axe(mobile, "connexion — saisie du code (téléphone)");
  await mobile.getByRole("button", { name: "Utiliser un code de secours" }).click();
  await mobile.fill("#login-code", recovery[1]);
  await mobile.click('[data-login-mfa] button[type="submit"]');
  await mobile.waitForURL(/\/accueil/);
  await mobile.goto(`${BASE}/parametres`);
  await mobile.locator("[data-mon-compte]").waitFor();
  await axe(mobile, "Paramètres — Mon compte (téléphone)");
  await mobile.goto(`${BASE}/admin/utilisateurs`);
  await mobile.locator("[data-admin-users] table").waitFor();
  await axe(mobile, "administration — utilisateurs (téléphone)");
  await mobileCtx.close();
  await adminCtx.close();

  check("aucune erreur de page", pageErrors.length === 0, pageErrors.join(" | "));
} catch (err) {
  failures += 1;
  console.error(`✗ recette interrompue : ${err.message}`);
} finally {
  await browser.close();
}
if (failures) {
  console.error(`${failures} vérification(s) en échec`);
  process.exit(1);
}
console.log("✅ recette comptes et administration réussie");
