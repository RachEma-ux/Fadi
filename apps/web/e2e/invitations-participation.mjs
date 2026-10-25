#!/usr/bin/env node
/**
 * Recette des invitations acceptées liées à une participation (Issue #262, phase 3, OP-D2 a) — API réelle, base de la
 * recette (horloge simulée) et navigateur.
 *
 *   1. Aperçu de l'accès avant envoi (rôles par portée, échéances indépendantes) ; envoi 202 pour un compte existant
 *      (plus aucun ajout direct) ; renvoi sans doublon ; notification dans l'application ; aucun accès avant acceptation.
 *   2. Cas v2.2 : lien transféré (autre compte), adresse non vérifiée depuis la notification, acceptation, double
 *      soumission (séquentielle et simultanée) sans effet, refus (déclin), invitation expirée, annulée, invitant révoqué
 *      entre l'envoi et l'acceptation, fiche liée entre-temps à un autre compte (mauvais compte), participation terminée
 *      depuis l'envoi, nouvel utilisateur (activation), accès expiré puis rétabli, compte déjà membre (rôle changé).
 *   3. Journal : invitation.*, participation.*, sans adresse.
 *   4. Interface : formulaire avec aperçu (Ctrl+Alt+Maj+'), invitations en attente aux états distincts, « Invitations
 *      reçues » (acceptation au clavier Ctrl+Alt+Maj+\ et entrée dans le projet) ; axe-core bureau et téléphone ; passe
 *      anglaise.
 *
 * BASE_URL=http://localhost:3001 DATABASE_URL=postgresql://… (locale, jetable) MAILPIT_URL=… | API_LOG=…
 *   node apps/web/e2e/invitations-participation.mjs
 */
import { chromium } from "playwright";
import { randomBytes, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import pg from "pg";
import { jetonDuCourriel, verifierAdresse } from "./lib-invitations.mjs";

const AXE_SCRIPT = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const dbUrl = process.env.DATABASE_URL ?? "";
if (!["localhost", "127.0.0.1"].includes(new URL(dbUrl || "postgresql://x@invalid/x").hostname)) throw new Error("DATABASE_URL doit désigner une base locale jetable");
const sql = new pg.Client({ connectionString: dbUrl });
await sql.connect();

let echecs = 0;
function check(nom, ok, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${nom}${!ok && detail ? ` — ${typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 400)}` : ""}`);
  if (!ok) echecs += 1;
}
function client() {
  let cookie = "";
  return async (method, path, body) => {
    const res = await fetch(`${BASE}${path}`, {
      method, headers: { "content-type": "application/json", origin: BASE, ...(cookie ? { cookie } : {}) },
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
const uid = () => randomUUID().replaceAll("-", "").slice(0, 12);
const adresse = (n) => `invitations-${n}-${uid()}@example.test`;
const credentials = (n) => ({ email: adresse(n), password: randomBytes(18).toString("hex") });
async function compte(n, { verifie = true } = {}) {
  const c = client(), cred = credentials(n);
  check(`compte créé (${n})`, (await c("POST", "/auth/register", cred)).status === 201);
  if (verifie) check(`adresse vérifiée (${n})`, (await verifierAdresse(c, cred.email)).status === 200);
  const me = (await c("GET", "/auth/me")).body;
  return { call: c, ...cred, id: me?.user?.id ?? me?.id };
}
const accept = (c, id) => c("POST", `/notifications/invitations/${encodeURIComponent(id)}/accept`, {});
const jour = (d) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);

try {
  // ---------------------------------------------------------------------------------------------------------------
  // 1. Aperçu, envoi, renvoi, notification.
  const owner = await compte("proprio");
  const x = await compte("existant", { verifie: false });
  const autre = await compte("autre");
  const project = await owner.call("POST", "/projects", { code: `INV_${uid().slice(0, 6)}`, name: "Invitations acceptées (recette synthétique)" });
  const pid = project.body?.id;
  check("projet créé", project.status === 201, String(project.status));
  const M = `/projects/${pid}/members`;
  // Portée étroite : une étude réelle du projet (un élément inconnu est refusé, comme pour l'attribution directe).
  const ETUDE = (await owner.call("POST", `/projects/${pid}/studio/studies`, { name: "Étude des invitations" })).body?.study?.id;
  check("étude Studio créée (portée étroite)", !!ETUDE);
  const inconnue = { email: x.email, roles: [{ role: "lecteur" }, { role: "relecteur", scopeType: "etude", scopeId: "etude-inconnue" }] };
  check("portée vers un élément inconnu : envoi refusé (422 scope_rule), aperçu bloquant", (await owner.call("POST", M, inconnue)).body?.error === "scope_rule"
    && !!(await owner.call("POST", `${M}/preview`, inconnue)).body?.preview?.blocking);
  const corps = { email: x.email, roles: [{ role: "lecteur" }, { role: "approbateur" }, { role: "relecteur", scopeType: "etude", scopeId: ETUDE }], accessExpiresAt: jour(60), invitationDays: 10 };
  check("aperçu : non-propriétaire refusé (403/404)", [403, 404].includes((await autre.call("POST", `${M}/preview`, corps)).status));
  check("aperçu : au moins un rôle de portée projet exigé (400)", (await owner.call("POST", `${M}/preview`, { email: x.email, roles: [{ role: "relecteur", scopeType: "etude", scopeId: "E" }] })).status === 400);
  check("aperçu : échéance d'accès passée refusée (400)", (await owner.call("POST", `${M}/preview`, { ...corps, accessExpiresAt: "2020-01-01" })).status === 400);
  const ap = await owner.call("POST", `${M}/preview`, corps);
  const p = ap.body?.preview;
  check("aperçu : compte existant, fiche à créer, aucune invitation en attente", ap.status === 200 && p.accountExists === true && p.target.kind === "nouvelle-fiche" && p.pendingInvitation === null, ap.body);
  check("aperçu : accès résultant = lecteur + approbation, sans export ni diffusion", p?.access?.role === "lecteur" && p.access.canApprove === true && p.access.canExport === false && p.access.canPublish === false, p?.access);
  check("aperçu : portée étroite signalée (élément désigné seulement), échéances indépendantes", p?.narrowScopes?.length === 1 && p.warnings.some((w) => /élément désigné/.test(w)) && p.accessExpiresAt?.startsWith(jour(60)) && p.invitationExpiresAt?.startsWith(jour(10)), p);
  check("aperçu : rien n'est écrit", (await sql.query("SELECT count(*)::int AS c FROM auth.invitations WHERE project_id = $1", [pid])).rows[0].c === 0);
  const inv = await owner.call("POST", M, corps);
  check("envoi : compte existant → invitation 202 (aucun ajout direct)", inv.status === 202 && inv.body.accountExists === true && inv.body.invitation.projectRole === "lecteur" && inv.body.invitation.roles?.length === 3, inv.body);
  const invId = inv.body?.invitation?.id;
  const again = await owner.call("POST", M, corps);
  check("renvoi : même invitation, nouveau lien, aucun doublon", again.status === 202 && again.body.resent === true && again.body.invitation.id === invId
    && (await sql.query("SELECT count(*)::int AS c FROM auth.invitations WHERE project_id = $1 AND status = 'pending'", [pid])).rows[0].c === 1);
  const ap2 = (await owner.call("POST", `${M}/preview`, corps)).body?.preview;
  check("aperçu suivant : invitation en attente annoncée (renvoi) et fiche existante réutilisée", ap2?.pendingInvitation?.id === invId && ap2.target.kind === "participation");
  check("annuaire : la fiche est un contact, sans droit", (await owner.call("GET", `/projects/${pid}/participants`)).body?.participants?.some((q) => q.id === inv.body.participationId && q.status === "contact" && q.access === null));
  check("avant acceptation : aucun accès (404)", (await x.call("GET", `/projects/${pid}`)).status === 404);
  const notif = (await x.call("GET", "/notifications")).body?.items?.find((i) => i.invitation?.id === invId);
  check("notification « invitation en attente » pour le compte visé", !!notif && notif.kind === "acces" && /vous invite à rejoindre/.test(notif.text), notif);
  check("liste des invitations reçues", (await x.call("GET", "/notifications/invitations")).body?.invitations?.some((i) => i.id === invId && i.roles.length === 3));
  check("propriétaire : état « en attente d'acceptation »", (await owner.call("GET", M)).body?.invitations?.find((i) => i.id === invId)?.awaiting === "acceptation");

  // ---------------------------------------------------------------------------------------------------------------
  // 2. Acceptation et ses refus.
  check("autre compte : invitation non révélée par identifiant (404)", (await accept(autre.call, invId)).status === 404);
  const token = await jetonDuCourriel(x.email, "/compte/invitation", { minimum: 2 }); // envoi puis renvoi : le lien du renvoi
  const transfere = await autre.call("POST", "/auth/invitations/accept", { token });
  check("lien transféré à un autre compte : 403 wrong_account, aucun accès", transfere.status === 403 && transfere.body?.error === "wrong_account" && (await autre.call("GET", `/projects/${pid}`)).status === 404, transfere.body);
  const nonVerifie = await accept(x.call, invId);
  check("notification : adresse non vérifiée refusée (403 email_unverified)", nonVerifie.status === 403 && nonVerifie.body?.error === "email_unverified", nonVerifie.body);
  check("adresse du compte vérifiée", (await verifierAdresse(x.call, x.email)).status === 200);
  // Double soumission simultanée : une seule activation, l'autre rejoue le même résultat.
  const [a1, a2] = await Promise.all([accept(x.call, invId), accept(x.call, invId)]);
  check("double soumission simultanée : deux 200, une seule activation", a1.status === 200 && a2.status === 200 && [a1.body.replay, a2.body.replay].sort().join() === "false,true", [a1.body, a2.body]);
  check("acceptation : entrée dans le projet, travail en attente", a1.body?.projectId === pid && typeof a1.body?.pendingWork?.openTasks === "number");
  const rejeu = await x.call("POST", "/auth/invitations/accept", { token });
  check("rejeu par le lien : même résultat, aucun nouvel effet", rejeu.status === 200 && rejeu.body.projectId === pid
    && (await sql.query("SELECT count(*)::int AS c FROM admin.audit_log WHERE action = 'invitation.accepted' AND target_id = $1", [invId])).rows[0].c === 1
    && (await sql.query("SELECT count(*)::int AS c FROM project_participations pp JOIN people pe ON pe.id = pp.person_id WHERE pp.project_id = $1 AND pe.user_id = $2 AND pp.status <> 'terminee'", [pid, x.id])).rows[0].c === 1);
  check("accès ouvert (lecteur)", (await x.call("GET", `/projects/${pid}`)).status === 200);
  const fiche = (await owner.call("GET", `/projects/${pid}/participants`)).body?.participants?.find((q) => q.person?.account?.userId === x.id);
  check("participation active liée au compte, rôles proposés posés (Lecteur du partage + Approbateur + Relecteur d'étude)", fiche?.status === "active" && fiche.id === inv.body.participationId
    && fiche.roles.some((r) => r.role === "lecteur" && r.origin === "acces") && fiche.roles.some((r) => r.role === "approbateur" && r.origin === "attribution")
    && fiche.roles.some((r) => r.role === "relecteur" && r.scopeType === "etude" && r.scopeId === ETUDE) && fiche.access?.canApprove === true, fiche);
  check("notification retirée après acceptation", !(await x.call("GET", "/notifications")).body?.items?.some((i) => i.invitation));
  // Accès expiré : la participation ne donne plus rien ; le propriétaire le rétablit.
  check("échéance d'accès recopiée sur le membre", (await owner.call("GET", M)).body?.members?.find((m) => m.userId === x.id)?.accessExpiresAt?.startsWith(jour(60)));
  await sql.query("UPDATE project_participations SET access_expires_at = now() - interval '1 minute' WHERE id = $1", [fiche.id]);
  check("accès expiré : plus aucun accès (404), membre marqué expiré", (await x.call("GET", `/projects/${pid}`)).status === 404 && (await owner.call("GET", M)).body?.members?.find((m) => m.userId === x.id)?.accessExpired === true);
  check("accès expiré : échéance passée refusée (400)", (await owner.call("PATCH", `${M}/${x.id}`, { accessExpiresAt: "2020-01-01" })).status === 400);
  const retabli = await owner.call("PATCH", `${M}/${x.id}`, { accessExpiresAt: null });
  check("propriétaire : échéance retirée, accès rétabli", retabli.status === 200 && retabli.body?.accessExpired === false && (await x.call("GET", `/projects/${pid}`)).status === 200, retabli.body);
  // Compte déjà membre : changement de rôle direct (seule écriture directe qui reste).
  const role = await owner.call("POST", M, { email: x.email, role: "editeur" });
  check("compte déjà membre : rôle changé directement (200), sans invitation", role.status === 200 && role.body?.role === "editeur"
    && (await sql.query("SELECT count(*)::int AS c FROM auth.invitations WHERE project_id = $1 AND status = 'pending'", [pid])).rows[0].c === 0, role.body);

  // Déclin, expiration, annulation.
  const d = await compte("decline");
  const dInv = (await owner.call("POST", M, { email: d.email, role: "lecteur" })).body?.invitation?.id;
  check("déclin depuis la notification", (await d.call("POST", `/notifications/invitations/${dInv}/decline`, {})).body?.declined === true);
  check("invitation déclinée : acceptation refusée (404 hors attente)", [404, 409].includes((await accept(d.call, dInv)).status) && (await d.call("GET", `/projects/${pid}`)).status === 404);
  const e = await compte("expire");
  const eInv = (await owner.call("POST", M, { email: e.email, role: "lecteur" })).body?.invitation?.id;
  await sql.query("UPDATE auth.invitations SET expires_at = now() - interval '1 minute' WHERE id = $1", [eInv]);
  const eRes = await accept(e.call, eInv);
  check("invitation expirée : 409 expired, aucun accès", eRes.status === 409 && eRes.body?.error === "expired" && (await e.call("GET", `/projects/${pid}`)).status === 404, eRes.body);
  const c = await compte("annulee");
  const cInv = (await owner.call("POST", M, { email: c.email, role: "lecteur" })).body?.invitation?.id;
  check("annulation par le propriétaire", (await owner.call("DELETE", `${M}/invitations/${cInv}`)).status === 204);
  const cRes = await accept(c.call, cInv);
  check("invitation annulée : 409 cancelled", cRes.status === 409 && cRes.body?.error === "cancelled", cRes.body);
  // Participation terminée depuis l'envoi.
  const t = await compte("terminee");
  const tSent = (await owner.call("POST", M, { email: t.email, role: "lecteur" })).body;
  await sql.query("UPDATE project_participations SET status = 'terminee', ends_on = current_date WHERE id = $1", [tSent.participationId]);
  const tRes = await accept(t.call, tSent.invitation.id);
  check("participation terminée depuis l'envoi : 409 participation_unavailable", tRes.status === 409 && tRes.body?.error === "participation_unavailable", tRes.body);
  // Échéance d'accès passée entre l'envoi et l'acceptation.
  const ax = await compte("acces-passe");
  const axInv = (await owner.call("POST", M, { email: ax.email, role: "lecteur", accessExpiresAt: jour(5) })).body?.invitation?.id;
  await sql.query("UPDATE auth.invitations SET access_expires_at = now() - interval '1 minute' WHERE id = $1", [axInv]);
  const axRes = await accept(ax.call, axInv);
  check("accès proposé déjà expiré : 409 access_expired", axRes.status === 409 && axRes.body?.error === "access_expired", axRes.body);

  // Mauvais compte : la fiche visée est liée entre-temps à un autre compte.
  const nAdresse = adresse("nouveau");
  const nInv = (await owner.call("POST", M, { email: nAdresse, roles: [{ role: "concepteur" }], displayName: "Nouvelle personne" })).body;
  check("adresse sans compte : fiche contact créée (nom saisi), invitation 202", nInv?.accountExists === false && !!nInv.participationId);
  const q = await compte("mauvaise-fiche");
  const qInv = await owner.call("POST", M, { email: q.email, role: "lecteur", participationId: nInv.participationId });
  check("fiche de l'annuaire choisie pour un autre compte : invitation 202", qInv.status === 202 && qInv.body.participationId === nInv.participationId, qInv.body);
  const nToken = await jetonDuCourriel(nAdresse, "/compte/invitation");
  const n = client();
  const act = await n("POST", "/auth/activate", { token: nToken, password: randomBytes(18).toString("hex"), acceptTerms: true, displayName: "Nouvelle personne" });
  check("nouvel utilisateur : compte créé et entrée dans le projet (Concepteur → éditeur)", act.status === 201 && act.body?.projectId === pid && (await n("GET", `/projects/${pid}`)).status === 200, act.body);
  const qRes = await accept(q.call, qInv.body.invitation.id);
  check("fiche liée entre-temps à un autre compte : 403 wrong_person, aucun accès", qRes.status === 403 && qRes.body?.error === "wrong_person" && (await q.call("GET", `/projects/${pid}`)).status === 404, qRes.body);

  // Invitant révoqué entre l'envoi et l'acceptation : la propriété est transférée.
  const p2 = (await owner.call("POST", "/projects", { code: `INR_${uid().slice(0, 6)}`, name: "Invitant révoqué (recette synthétique)" })).body?.id;
  const y = await compte("revoque");
  const yInv = (await owner.call("POST", `/projects/${p2}/members`, { email: y.email, role: "lecteur" })).body?.invitation?.id;
  const xInv2 = (await owner.call("POST", `/projects/${p2}/members`, { email: x.email, role: "lecteur" })).body?.invitation?.id;
  check("second projet : x accepte", (await accept(x.call, xInv2)).status === 200);
  check("transfert de propriété à x", (await owner.call("POST", `/projects/${p2}/members/${x.id}/propriete`)).status === 200);
  const yRes = await accept(y.call, yInv);
  check("invitant révoqué (plus propriétaire) : 409 inviter_not_authorized, aucun accès", yRes.status === 409 && yRes.body?.error === "inviter_not_authorized" && (await y.call("GET", `/projects/${p2}`)).status === 404, yRes.body);

  // ---------------------------------------------------------------------------------------------------------------
  // 3. Journal.
  const journal = (await sql.query("SELECT action, metadata::text AS m FROM admin.audit_log WHERE (target_type = 'project' AND target_id = $1) OR (target_type = 'invitation' AND target_id IN (SELECT id FROM auth.invitations WHERE project_id = $1)) ORDER BY id", [pid])).rows;
  const actions = new Set(journal.map((r) => r.action));
  for (const a of ["invitation.created", "invitation.resent", "invitation.accepted", "invitation.declined", "invitation.cancelled", "invitation.refused", "participation.created", "participation.activated", "participation.linked", "participation.role_assigned", "participation.access_expiry_changed", "project.member.added"]) check(`journal : ${a}`, actions.has(a));
  check("journal : aucune adresse dans les métadonnées", journal.every((r) => !r.m.includes("@")), journal.filter((r) => r.m.includes("@")).map((r) => r.action).join(","));
  const histo = await owner.call("GET", `/projects/${pid}/journal?family=participation`);
  check("historique du projet : participation.* visibles du responsable", histo.status === 200 && histo.body.entries.some((e2) => e2.action === "participation.activated"));

  // ---------------------------------------------------------------------------------------------------------------
  // 4. Interface.
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });
  const erreurs = [];
  // `zone` : sélecteur de la partie contrôlée (la page entière par défaut).
  async function axe(page, nom, zone = null) {
    await page.addScriptTag({ path: AXE_SCRIPT });
    const graves = await page.evaluate(async (z) => (await window.axe.run(z ? document.querySelector(z) : document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] } }))
      .violations.filter((v) => ["critical", "serious"].includes(v.impact)).map((v) => `${v.id} (${v.nodes.slice(0, 3).map((nn) => nn.target.join(" ")).join(" | ")})`), zone);
    check(`axe-core ${nom} : aucune violation critique ou sérieuse`, graves.length === 0, graves.join(", "));
  }
  async function session(cred, chemin, viewport = { width: 1280, height: 900 }, langue = "fr") {
    const ctx = await browser.newContext({ viewport });
    await ctx.addInitScript((l) => { try { localStorage.setItem("fadi.langue", l); } catch { /* stockage indisponible */ } }, langue);
    const page = await ctx.newPage();
    page.on("pageerror", (err) => erreurs.push(err.message));
    const r = await page.request.post(`${BASE}/auth/login`, { data: { email: cred.email, password: cred.password }, headers: { origin: BASE } });
    check(`interface : connexion (${langue}, ${viewport.width} px)`, r.status() === 200, String(r.status()));
    await page.goto(`${BASE}${chemin}`);
    return page;
  }
  const debordement = (page, sel) => page.evaluate((s) => [...document.querySelectorAll(`${s} *`)]
    .filter((el) => !el.closest(".table-scroll") && el.getBoundingClientRect().right > window.innerWidth + 1).map((el) => el.tagName), sel);
  try {
    const invite = await compte("interface");
    const page = await session(owner, `/projets/${pid}?module=collaboration`);
    const form = page.locator("[data-invitation-form]");
    await form.waitFor({ timeout: 20000 });
    check("formulaire : « Envoyer l'invitation » inactif avant l'aperçu", await form.locator('button[type="submit"]').isDisabled());
    await form.locator('input[type="email"]').fill(invite.email);
    await form.locator(".invitation-extra-roles label", { hasText: "Coordinateur" }).locator("input").check();
    // Règle d'or : Ctrl+Alt+Maj+' calcule l'aperçu depuis le champ.
    await form.locator('input[type="email"]').press("Control+Alt+Shift+Quote");
    await page.waitForSelector("[data-invitation-apercu]", { timeout: 10000 });
    const apercu = await page.locator("[data-invitation-apercu]").textContent();
    check("formulaire : aperçu au clavier, compte existant, Lecteur · Coordinateur", /compte existant/.test(apercu) && /Coordinateur/.test(apercu) && /lecteur · export non/.test(apercu), apercu);
    check("formulaire : icône et raccourci de l'aperçu affichés", (await form.locator('[data-icone-collaboration="apercu-invitation"]').count()) === 1 && /Ctrl\+Alt\+Maj\+'/.test(await form.locator('[data-raccourci-collaboration="apercu-invitation"]').textContent()));
    await axe(page, "Collaboration — invitation et aperçu (bureau)");
    await form.locator('button[type="submit"]').click();
    await page.waitForSelector(`[data-project-invitations] li[data-invitation="${invite.email}"]`, { timeout: 10000 });
    check("invitations en attente : état « En attente d'acceptation » distinct", (await page.locator(`[data-project-invitations] li[data-invitation="${invite.email}"]`).getAttribute("data-invitation-etat")) === "acceptation");
    await page.context().close();

    const phone = await session(owner, `/projets/${pid}?module=collaboration`, { width: 390, height: 844 });
    await phone.locator("[data-invitation-form]").waitFor({ timeout: 20000 });
    // Zone du partage seulement : le panneau Communication voisin relève de sa propre recette (communication.mjs).
    await axe(phone, "Collaboration — partage et invitation (téléphone)", ".members-panel");
    const deb = await debordement(phone, "[data-invitation-form]");
    check("téléphone : le formulaire d'invitation ne déborde pas", deb.length === 0, deb.slice(0, 5).join(","));
    await phone.context().close();

    const recu = await session(invite, "/projets", { width: 390, height: 844 });
    const carte = recu.locator("[data-invitations-recues] li").first();
    await carte.waitFor({ timeout: 20000 });
    check("Invitations reçues : projet, accès proposé et rôles", /Coordinateur/.test(await carte.textContent()));
    await axe(recu, "Mes projets — invitations reçues (téléphone)");
    const debR = await debordement(recu, "[data-invitations-recues]");
    check("téléphone : « Invitations reçues » ne déborde pas", debR.length === 0, debR.slice(0, 5).join(","));
    // Règle d'or : Ctrl+Alt+Maj+\ accepte depuis la carte où se trouve le focus.
    await carte.locator('[data-commande-collaboration="accepter-invitation"]').focus();
    await recu.keyboard.press("Control+Alt+Shift+Backslash");
    await recu.waitForURL(new RegExp(`/projets/${pid}`), { timeout: 15000 });
    check("acceptation au clavier : entrée dans le projet", recu.url().includes(`/projets/${pid}`));
    check("après acceptation : accès lecteur", (await invite.call("GET", `/projects/${pid}`)).status === 200);
    await recu.context().close();

    // Passe anglaise : formulaire, aperçu et invitations reçues sans texte resté en français.
    const en2 = await compte("anglais");
    check("invitation pour la passe anglaise", (await owner.call("POST", M, { email: en2.email, role: "lecteur", accessExpiresAt: jour(30) })).status === 202);
    const FR = /[éèêàùçœ«»]|\b(le|la|les|des|du|une|est|sont|pour|avec|aucun|aucune|sans|dans|sur|au|aux|et|ou|ce|cette|vos|votre|projet)\b/i;
    const releve = (page, sel) => page.evaluate(([src, s]) => {
      const re = new RegExp(src, "i");
      const out = new Set();
      for (const racine of document.querySelectorAll(s)) {
        const exclu = (nn) => { for (let el = nn.parentElement; el; el = el.parentElement) if (el.getAttribute("translate") === "no" || ["OPTION", "TEXTAREA"].includes(el.tagName)) return true; return false; };
        const w = document.createTreeWalker(racine, NodeFilter.SHOW_TEXT);
        for (let nn = w.nextNode(); nn; nn = w.nextNode()) { const tx = (nn.nodeValue ?? "").replace(/\s+/g, " ").trim(); if (tx.length > 1 && re.test(tx) && !exclu(nn)) out.add(tx); }
      }
      return [...out];
    }, [FR.source, sel]);
    const enOwner = await session(owner, `/projets/${pid}?module=collaboration`, { width: 1280, height: 900 }, "en");
    const enForm = enOwner.locator("[data-invitation-form]");
    await enForm.waitFor({ timeout: 20000 });
    await enForm.locator('input[type="email"]').fill(adresse("apercu-en"));
    await enForm.locator('[data-commande-collaboration="apercu-invitation"]').click();
    await enOwner.waitForSelector("[data-invitation-apercu]", { timeout: 10000 });
    const donnees = ["@example.test", "Invitations acceptées (recette synthétique)"];
    const restes = (await releve(enOwner, "[data-invitation-form], [data-project-invitations]")).filter((tx) => !donnees.some((dd) => tx.includes(dd)));
    check("passe anglaise : formulaire, aperçu et invitations en attente sans texte en français", restes.length === 0, restes.slice(0, 12).join(" | "));
    check("passe anglaise : « Access preview »", /Access preview/.test(await enForm.textContent()));
    await enOwner.context().close();
    const enRecu = await session(en2, "/projets", { width: 1280, height: 900 }, "en");
    await enRecu.locator("[data-invitations-recues] li").first().waitFor({ timeout: 20000 });
    const restesR = (await releve(enRecu, "[data-invitations-recues]")).filter((tx) => !donnees.some((dd) => tx.includes(dd)));
    check("passe anglaise : « Invitations received » sans texte en français", /Invitations received/.test(await enRecu.locator("[data-invitations-recues]").textContent()) && restesR.length === 0, restesR.slice(0, 12).join(" | "));
    await axe(enRecu, "Invitations reçues — anglais (bureau)");
    await enRecu.context().close();
    check("interface : aucune erreur de page", erreurs.length === 0, erreurs.join(" | "));
  } catch (err) {
    check("interface : déroulé sans exception", false, String(err?.message ?? err).slice(0, 400));
  } finally {
    await browser.close();
  }
} catch (err) {
  check("recette menée à son terme", false, String(err?.stack ?? err).slice(0, 600));
} finally {
  await sql.end();
}
console.log(echecs ? `\n${echecs} contrôle(s) en échec` : "\nRecette des invitations acceptées : tout est vert.");
process.exit(echecs ? 1 : 0);
