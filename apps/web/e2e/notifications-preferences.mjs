#!/usr/bin/env node
/**
 * Recette des préférences de notification sur l'API réelle et l'application construite (même origine, base migrée) :
 * un type masqué disparaît de `GET /notifications` (et du compte des non lues), un projet mis en sourdine aussi,
 * les préférences et l'état « lu » survivent à une nouvelle session ; puis, dans le navigateur, Paramètres
 * (interrupteur par type, relu après rechargement, projets en sourdine réactivables) et la cloche d'un projet
 * (« Mettre ce projet en sourdine », relu après rechargement). Comptes et projets synthétiques créés par les routes.
 *
 * BASE_URL=http://localhost:3001 node apps/web/e2e/notifications-preferences.mjs
 */
import { randomBytes, randomUUID } from "node:crypto";
import { appelPlaywright, inviterEtAccepter } from "./lib-invitations.mjs";
import { chromium } from "playwright";

const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
let failures = 0;
function check(label, ok, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${label}${!ok && detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}
function client() {
  let cookie = "";
  return async (method, path, body) => {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: { "content-type": "application/json", origin: BASE, ...(cookie ? { cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.getSetCookie?.() ?? [];
    if (set.length) cookie = set.map((c) => c.split(";")[0]).join("; ");
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = text; }
    return { status: res.status, body: json };
  };
}
const credentials = (n) => ({ email: `notif-${n}-${randomUUID().replaceAll("-", "").slice(0, 12)}@example.test`, password: randomBytes(18).toString("hex") });
const kinds = (r) => (r.body?.items ?? []).map((i) => i.kind);
const ofProject = (r, id) => (r.body?.items ?? []).filter((i) => i.projectId === id);

const owner = client(), member = client(), stranger = client(), anonymous = client();
const ownerC = credentials("a"), memberC = credentials("b");
check("comptes créés par l'API", (await owner("POST", "/auth/register", ownerC)).status === 201 && (await member("POST", "/auth/register", memberC)).status === 201 && (await stranger("POST", "/auth/register", credentials("c"))).status === 201);
const tag = randomUUID().slice(0, 6);
const p1 = (await owner("POST", "/projects", { code: `NP1_${tag}`, name: "Notifications — projet un" })).body;
const p2 = (await owner("POST", "/projects", { code: `NP2_${tag}`, name: "Notifications — projet deux" })).body;
const pS = (await stranger("POST", "/projects", { code: `NPS_${tag}`, name: "Projet d'un autre compte" })).body;
check("projets créés", !!p1?.id && !!p2?.id && !!pS?.id);
for (const p of [p1, p2]) check(`membre invité sur ${p.code}, invitation acceptée (phase 3)`, (await inviterEtAccepter(owner, member, p.id, memberC.email, "editeur")).ok);
check("commentaires du propriétaire", (await owner("POST", `/projects/${p1.id}/collaboration/comments`, { body: "Avis sur l'étape 3", stepNumber: 3 })).status === 201 && (await owner("POST", `/projects/${p2.id}/collaboration/comments`, { body: "Avis général" })).status === 201);

// État initial : tout est affiché, rien n'est lu.
let n = await member("GET", "/notifications");
check("notifications reçues : 2 accès et 2 commentaires, non lues", n.status === 200 && kinds(n).filter((k) => k === "acces").length === 2 && kinds(n).filter((k) => k === "commentaire").length === 2 && n.body.items.every((i) => i.unread) && n.body.masquees === 0, JSON.stringify(n.body).slice(0, 300));
let prefs = await member("GET", "/preferences/notifications");
check("préférences par défaut : rien de masqué, dix types listés (dont message et demande, Communication, et revue, phase 4)", prefs.status === 200 && prefs.body.typesMasques.length === 0 && prefs.body.projetsMuets.length === 0 && prefs.body.types.length === 10 && prefs.body.types.includes("commentaire-studio") && prefs.body.types.includes("message") && prefs.body.types.includes("demande") && prefs.body.types.includes("revue"), JSON.stringify(prefs.body));
check("préférences refusées sans session", (await anonymous("GET", "/preferences/notifications")).status === 401);
check("type inconnu refusé (400)", (await member("PUT", "/preferences/notifications", { typesMasques: ["courriel"] })).status === 400);

// Type masqué → notification cachée.
prefs = await member("PUT", "/preferences/notifications", { typesMasques: ["commentaire"] });
check("type « commentaire » masqué", prefs.status === 200 && JSON.stringify(prefs.body.typesMasques) === '["commentaire"]');
n = await member("GET", "/notifications");
check("plus aucun commentaire affiché ; 2 masquées", !kinds(n).includes("commentaire") && kinds(n).filter((k) => k === "acces").length === 2 && n.body.masquees === 2, JSON.stringify(n.body).slice(0, 300));
check("le propriétaire n'est pas affecté (préférences par compte)", (await owner("GET", "/preferences/notifications")).body?.typesMasques?.length === 0);

// Projet en sourdine.
check("sourdine refusée sur un projet non partagé (404)", (await member("PUT", `/preferences/notifications/projets/${pS.id}`, { muet: true })).status === 404);
prefs = await member("PUT", `/preferences/notifications/projets/${p2.id}`, { muet: true });
check("projet deux mis en sourdine, nommé dans la vue", prefs.status === 200 && prefs.body.projetsMuets.includes(p2.id) && prefs.body.projets.some((p) => p.id === p2.id && p.code === p2.code) && JSON.stringify(prefs.body.typesMasques) === '["commentaire"]');
n = await member("GET", "/notifications");
check("aucune notification du projet en sourdine", ofProject(n, p2.id).length === 0 && ofProject(n, p1.id).length === 1 && n.body.masquees === 3, JSON.stringify(n.body).slice(0, 300));

// État « lu » et préférences relus par une nouvelle session.
check("tout marqué comme consulté", (await member("POST", "/notifications/seen")).status === 200);
const member2 = client();
check("nouvelle session du membre", (await member2("POST", "/auth/login", memberC)).status === 200);
n = await member2("GET", "/notifications");
check("après reconnexion : aucune non lue", n.status === 200 && n.body.items.length > 0 && n.body.items.every((i) => !i.unread) && !!n.body.seenAt);
prefs = await member2("GET", "/preferences/notifications");
check("après reconnexion : préférences conservées", JSON.stringify(prefs.body.typesMasques) === '["commentaire"]' && JSON.stringify(prefs.body.projetsMuets) === JSON.stringify([p2.id]));

// Réactiver : les notifications réapparaissent, déjà lues.
await member2("PUT", "/preferences/notifications", { typesMasques: [] });
n = await member2("GET", "/notifications");
check("type réactivé : commentaire du projet un de retour, lu", ofProject(n, p1.id).some((i) => i.kind === "commentaire" && !i.unread) && ofProject(n, p2.id).length === 0);
await member2("PUT", `/preferences/notifications/projets/${p2.id}`, { muet: false });
n = await member2("GET", "/notifications");
check("projet réactivé : ses notifications de retour", ofProject(n, p2.id).length === 2 && n.body.masquees === 0);

// Navigateur : Paramètres et cloche du projet.
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });
const erreurs = [];
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on("pageerror", (e) => erreurs.push(e.message));
  await page.goto(`${BASE}/connexion`);
  await page.fill('input[name="email"]', memberC.email);
  await page.fill('input[name="password"]', memberC.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(accueil|projets)$/);

  await page.goto(`${BASE}/parametres`);
  const section = page.locator("[data-settings-notifications]");
  await section.locator("li[data-kind]").first().waitFor();
  check("Paramètres : un interrupteur par type (10)", (await section.locator("li[data-kind] input[type=checkbox]").count()) === 10);
  const acces = section.locator('li[data-kind="acces"] input[type=checkbox]');
  check("Paramètres : « Accès » affiché par défaut", await acces.isChecked());
  await Promise.all([page.waitForResponse((r) => r.url().endsWith("/preferences/notifications") && r.request().method() === "PUT" && r.ok()), acces.click()]);
  await page.reload();
  // Le cache local peut afficher l'état précédent un instant : l'état relu du serveur doit s'imposer.
  const relu = await section.locator('li[data-kind="acces"] input[type=checkbox]:not(:checked)').waitFor({ timeout: 10000 }).then(() => true, () => false);
  check("Paramètres : « Accès » masqué, relu après rechargement", relu);
  n = await member2("GET", "/notifications");
  check("serveur : plus aucune notification d'accès", !kinds(n).includes("acces") && kinds(n).includes("commentaire"));

  await page.goto(`${BASE}/projets/${p1.id}`);
  const bell = page.locator(".notification-bell > button");
  await bell.click();
  const mute = page.locator(".notification-mute");
  await mute.locator("button:not([disabled])").waitFor();
  check("cloche : projet non muet au départ", (await mute.getAttribute("data-project-muted")) === "false");
  await Promise.all([page.waitForResponse((r) => r.url().includes(`/preferences/notifications/projets/${p1.id}`) && r.ok()), mute.locator("button").click()]);
  await page.locator('.notification-mute[data-project-muted="true"]').waitFor();
  const retirees = await page.locator(".notification-incoming li[data-kind]", { hasText: p1.code }).first().waitFor({ state: "detached", timeout: 10000 }).then(() => true, () => false);
  check("cloche : projet mis en sourdine, ses notifications retirées", retirees && (await page.locator(".notification-incoming li[data-kind]", { hasText: p2.code }).count()) > 0);
  await page.reload();
  await page.locator(".notification-bell > button").click();
  await page.locator('.notification-mute[data-project-muted="true"]').waitFor();
  check("cloche : sourdine relue après rechargement", true);

  await page.goto(`${BASE}/parametres`);
  const muted = page.locator(`[data-muted-project="${p1.id}"]`);
  await muted.waitFor();
  check("Paramètres : projet en sourdine listé", (await muted.innerText()).includes(p1.code));
  await Promise.all([page.waitForResponse((r) => r.url().includes(`/preferences/notifications/projets/${p1.id}`) && r.ok()), muted.locator("button").click()]);
  await muted.waitFor({ state: "detached" });
  prefs = await member2("GET", "/preferences/notifications");
  check("Paramètres : projet réactivé côté serveur", prefs.body.projetsMuets.length === 0 && JSON.stringify(prefs.body.typesMasques) === '["acces"]');
  check("aucune erreur de page", erreurs.length === 0, erreurs.join(" | "));
} catch (e) {
  check("parcours navigateur", false, e instanceof Error ? e.message : String(e));
} finally {
  await browser.close();
}

console.log(failures ? `✗ ${failures} contrôle(s) en échec` : "✓ préférences de notification : tous les contrôles passent");
process.exit(failures ? 1 : 0);
