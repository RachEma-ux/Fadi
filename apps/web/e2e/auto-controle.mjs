#!/usr/bin/env node
/**
 * Recette du lot OP-AUTOCONTROLE (décision OP-6 du 2026-10-25, Issue #262) — séparation des responsabilités, par l'API
 * réelle qui sert l'application construite (base locale jetable migrée, `FADI_ADMIN_ENABLED=true`) :
 *
 *  - option « Auto-contrôle » activée par défaut (fiche d'administration, `selfControlAllowed`) ;
 *  - aperçu `GET …/controle-approbation` : révisions produites, soumission, décision ; refusé à qui n'approuve pas ;
 *  - interface d'approbation : avertissement et case de confirmation avant d'approuver son propre dossier ;
 *  - administration : interrupteur « Auto-contrôle » (icône propre, raccourci Alt+Maj+A, groupe « Autorisations »),
 *    confirmation, audit `admin.user.self_control_changed` (from / to), jamais sur soi-même ;
 *  - option désactivée : 422 `self_approval_forbidden` avec les autres approbateurs nommés, bouton « Approuver »
 *    désactivé avec l'explication ; rien n'est écrit ;
 *  - option rétablie : approbation enregistrée et marquée (vue, évènement, audit, historique du projet), manifeste et
 *    empreintes inchangés ; le diffuseur n'est pas concerné ;
 *  - axe-core sans violation critique ni sérieuse, bureau et téléphone (390 × 844) sans défilement horizontal ;
 *  - interface en anglais : avertissement, marque et interrupteur traduits.
 *
 *   BASE_URL=http://localhost:3001 DATABASE_URL=postgresql://… [MAILPIT_URL=… | API_LOG=api.log] [CHROMIUM_PATH=…] node apps/web/e2e/auto-controle.mjs
 */
import { randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { chromium } from "playwright";
import { appelPlaywright, inviterEtAccepter } from "./lib-invitations.mjs";

const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
// Base : promotion de l'administrateur (`create-admin.mjs`) et LECTURE du journal d'audit ; aucune autre écriture directe
// (les droits passent par les invitations acceptées et les routes), comme journal-activite.mjs.
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL requise (promotion de l'administrateur, lecture du journal)");
const sql = new pg.Client({ connectionString: process.env.DATABASE_URL });
await sql.connect();
const AXE_SCRIPT = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const CREATE_ADMIN = fileURLToPath(new URL("../../api/scripts/create-admin.mjs", import.meta.url));

let failures = 0;
function check(label, ok, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${label}${!ok && detail ? ` — ${typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 400)}` : ""}`);
  if (!ok) failures += 1;
}
const uid = () => randomUUID().replaceAll("-", "").slice(0, 12);
const short = (x) => JSON.stringify(x).slice(0, 300);

async function axe(page, nom) {
  await page.addScriptTag({ path: AXE_SCRIPT });
  const graves = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] } }))
    .violations.filter((v) => ["critical", "serious"].includes(v.impact)).map((v) => `${v.id} (${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")})`));
  check(`axe-core ${nom} : aucune violation critique ou sérieuse`, graves.length === 0, graves.join(", "));
}
const sansDefilement = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
/** Éléments qui dépassent la largeur de la fenêtre (diagnostic d'un défilement horizontal). */
const debordements = (page) => page.evaluate(() => [...document.querySelectorAll("body *")]
  .filter((el) => el.getBoundingClientRect().right > document.documentElement.clientWidth + 1 && !el.closest(".table-scroll"))
  .slice(0, 6).map((el) => `${el.tagName.toLowerCase()}${el.className && typeof el.className === "string" ? `.${el.className.split(" ").join(".")}` : ""} (${Math.round(el.getBoundingClientRect().right)} px)`).join(", "));

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined) });
const desktop = { viewport: { width: 1440, height: 900 } };
const phone = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };
const pageErrors = [];

/** Compte neuf dans son propre contexte de navigateur (cookies partagés entre `call` et les pages). */
async function compte(tag, options = desktop, anglais = false) {
  const ctx = await browser.newContext(options);
  if (anglais) await ctx.addInitScript(() => { try { localStorage.setItem("fadi.langue", "en"); } catch { /* indisponible */ } });
  const call = appelPlaywright(ctx.request, BASE);
  const email = `auto-${tag}-${uid()}@example.test`, password = `phrase de passe ${randomBytes(6).toString("hex")}`;
  const r = await call("POST", "/auth/register", { email, password });
  if (r.status !== 201) throw new Error(`inscription ${tag} : ${r.status}`);
  return { ctx, call, email, password, id: r.body.id };
}
async function ouvrir(acct, path) {
  const page = await acct.ctx.newPage();
  page.on("pageerror", (e) => pageErrors.push(e.message));
  await page.goto(`${BASE}${path}`);
  return page;
}

try {
  // --- Comptes, projet, droits ---------------------------------------------------------------------------------------
  const admin = await compte("admin");
  execFileSync(process.execPath, [CREATE_ADMIN, admin.email], { env: { ...process.env }, encoding: "utf8" });
  // La promotion ferme les sessions : reconnexion, puis double authentification (exigée par l'administration).
  check("administrateur : reconnexion après promotion", (await admin.call("POST", "/auth/login", { email: admin.email, password: admin.password })).status === 200);
  const setup = await admin.call("POST", "/auth/me/mfa/setup");
  const { createHmac } = await import("node:crypto");
  const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const b32 = (s) => { let bits = 0, v = 0; const out = []; for (const ch of s.replace(/=+$/, "")) { v = (v << 5) | B32.indexOf(ch); bits += 5; if (bits >= 8) { out.push((v >>> (bits - 8)) & 255); bits -= 8; } } return Buffer.from(out); };
  const totp = (secret) => { const m = Buffer.alloc(8); m.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000))); const h = createHmac("sha1", b32(secret)).update(m).digest(); const o = h[h.length - 1] & 15; return String((((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1e6).padStart(6, "0"); };
  const enabled = await admin.call("POST", "/auth/me/mfa/enable", { code: totp(setup.body.secret) });
  check("administrateur : double authentification activée", enabled.status === 200, short(enabled.body));

  const owner = await compte("proprio");
  const eve = await compte("eve");
  const project = await owner.call("POST", "/projects", { code: `AC_${uid().slice(0, 6)}`, name: "Auto-contrôle (recette synthétique)" });
  check("projet créé", project.status === 201, String(project.status));
  const pid = project.body.id;
  const invitee = await inviterEtAccepter(owner.call, eve.call, pid, eve.email, "editeur");
  check("Eve invitée comme éditrice, invitation acceptée", invitee.ok, short(invitee.accept?.body ?? invitee.invite?.body));
  const part = invitee.accept?.body?.participationId;
  check("Eve : Concepteur et Approbatrice de portée projet", (await owner.call("POST", `/projects/${pid}/participants/${part}/roles`, { role: "approbateur", scopeType: "projet" })).status === 201);
  const study = await owner.call("POST", `/projects/${pid}/studio/studies`, { name: "Étude auto-contrôle" });
  const studyId = study.body.study.id, variantId = study.body.variant.id;
  const vp = `/projects/${pid}/studio/studies/${studyId}/variants/${variantId}`;
  const pubs = `/projects/${pid}/studio/studies/${studyId}/publications`;
  let head = study.body.revision.id;
  async function draw(id) {
    const r = await eve.call("POST", `${vp}/commands`, { contractVersion: "studio-commands/1", requestId: `ac-${uid()}`, baseRevisionId: head, commands: [{ toolId: "studio.dessin.ligne", params: { id, type: "line", start: { x: 0, y: 0 }, end: { x: 5, y: 2 } } }] });
    if (r.status === 200) head = r.body.revision.id;
    return r.status;
  }
  async function dossier(title) {
    const p = await eve.call("POST", `${vp}/publications`, { title });
    const s = await eve.call("POST", `${pubs}/${p.body.id}/soumettre`, {});
    return s.body;
  }
  const examine = (p) => ({ manifestHash: p.manifestHash, revisionId: p.revisionId, documentHash: p.documentHash });
  check("Eve : révision dessinée", (await draw("l1")) === 200);
  const d1 = await dossier("Dossier auto 1");
  check("Eve : dossier préparé et soumis", d1?.workStatus === "en-revue", short(d1));

  // --- Option par défaut et aperçu ---------------------------------------------------------------------------------
  const fiche = await admin.call("GET", `/admin/users/${eve.id}`);
  check("option « Auto-contrôle » activée par défaut (fiche d'administration)", fiche.status === 200 && fiche.body.user.selfControlAllowed === true, short(fiche.body?.user));
  const apercu = await eve.call("GET", `${pubs}/${d1.id}/controle-approbation`);
  check("aperçu : Eve a produit 1 révision et soumis le dossier ; approbation permise et signalée",
    JSON.stringify(apercu.body) === JSON.stringify({ autoControle: true, revisionsAuteur: 1, soumisParLui: true, autorise: true, approvers: [] }), short(apercu.body));
  const apercuProprio = await owner.call("GET", `${pubs}/${d1.id}/controle-approbation`);
  check("aperçu du propriétaire : initialisation vide non comptée, pas d'auto-contrôle", apercuProprio.body?.autoControle === false && apercuProprio.body.revisionsAuteur === 0, short(apercuProprio.body));
  const lecteur = await compte("lecteur");
  check("lecteur invité, invitation acceptée", (await inviterEtAccepter(owner.call, lecteur.call, pid, lecteur.email, "lecteur")).ok);
  check("aperçu refusé à un lecteur (403, même règle que l'approbation)", (await lecteur.call("GET", `${pubs}/${d1.id}/controle-approbation`)).status === 403);

  // --- Interface d'approbation : avertissement et confirmation -------------------------------------------------------
  const studioPath = `/studio/projets/${pid}/etudes/${studyId}`;
  const ep = await ouvrir(eve, studioPath);
  const carte = ep.locator(`li[data-studio-publication="${d1.id}"]`);
  await carte.waitFor({ timeout: 30_000 });
  await carte.locator('[data-studio-publication-action="approuver"]').click();
  const avert = carte.locator("[data-auto-controle-avertissement]");
  check("approbation : avertissement « auto-contrôle » affiché avant de confirmer", await avert.waitFor({ timeout: 10_000 }).then(() => true, () => false));
  check("avertissement : motifs relevés (1 révision, soumis)", (await avert.textContent())?.includes("Vous avez produit 1 révision(s) de ce dossier et vous l’avez soumis : cette approbation sera marquée auto-contrôle."), await avert.textContent());
  const confirmer = carte.locator(".studio-publication-confirmer button", { hasText: "Confirmer" });
  check("« Confirmer » inactif tant que l'auto-contrôle n'est pas confirmé", await confirmer.isDisabled());
  await carte.locator("[data-auto-controle-confirmer]").check();
  check("case cochée : « Confirmer » actif", await confirmer.isEnabled());
  await axe(ep, "approbation avec avertissement d'auto-contrôle (bureau)");
  await carte.locator(".studio-publication-confirmer button", { hasText: "Annuler" }).click();

  // --- Administration : interrupteur, raccourci, confirmation, audit --------------------------------------------------
  const ap = await ouvrir(admin, "/admin/utilisateurs");
  await ap.locator("[data-admin-accounts]").waitFor({ timeout: 30_000 });
  const hide = ap.locator("[data-hide-test]");
  if (await hide.isChecked()) await hide.uncheck();
  await ap.fill('input[name="q"]', eve.email);
  await ap.getByRole("button", { name: "Rechercher", exact: true }).click();
  await ap.locator(`[data-admin-user="${eve.email}"] button`).click();
  await ap.locator(`[data-admin-detail="${eve.email}"]`).waitFor();
  const inter = ap.locator("[data-admin-autorisations] [data-self-control]");
  check("fiche : interrupteur « Auto-contrôle » activé par défaut, rôle switch, raccourci Alt+Shift+A, icône propre",
    await inter.isChecked() && (await inter.getAttribute("role")) === "switch" && (await inter.getAttribute("aria-keyshortcuts")) === "Alt+Shift+A"
      && (await ap.locator("[data-admin-autorisations] svg[data-icone-admin=auto-controle]").count()) === 1);
  await axe(ap, "administration — autorisations d'un compte (bureau)");
  await ap.keyboard.press("Alt+Shift+KeyA");
  const dialogue = ap.locator(".confirm-dialog");
  check("Alt+Maj+A : confirmation demandée", await dialogue.waitFor({ timeout: 10_000 }).then(() => true, () => false));
  check("confirmation : conséquence expliquée (refus et autres approbateurs ; rien de rétroactif)", ((await dialogue.textContent()) ?? "").includes("Les approbations passées ne changent pas."));
  await dialogue.locator("[data-confirm]").click();
  await ap.locator("[data-admin-message]").waitFor();
  check("interrupteur désactivé après confirmation", await ap.waitForFunction(() => document.querySelector("[data-self-control]")?.checked === false, null, { timeout: 10_000 }).then(() => true, () => false));
  const audit = (await sql.query("SELECT actor_id, metadata FROM admin.audit_log WHERE action = 'admin.user.self_control_changed' AND target_id = $1", [eve.id])).rows;
  check("audit admin.user.self_control_changed (from true, to false) par l'administrateur", audit.length === 1 && audit[0].actor_id === admin.id && audit[0].metadata.from === true && audit[0].metadata.to === false, short(audit));
  check("jamais sur soi-même (422 self_action)", (await admin.call("PATCH", `/admin/users/${admin.id}/self-control`, { allowed: false })).body?.error === "self_action");
  check("non-administrateur : 404", (await owner.call("PATCH", `/admin/users/${eve.id}/self-control`, { allowed: false })).status === 404);

  // --- Option désactivée : 422, bouton désactivé, autres approbateurs ------------------------------------------------
  const refus = await eve.call("POST", `${pubs}/${d1.id}/approuver`, examine(d1));
  check("approbation de son propre dossier refusée (422 self_approval_forbidden)", refus.status === 422 && refus.body?.error === "self_approval_forbidden" && refus.body.revisionsAuteur === 1 && refus.body.soumisParLui === true, short(refus.body));
  check("refus : autres approbateurs nommés (le propriétaire)", JSON.stringify(refus.body?.approvers) === JSON.stringify([{ name: owner.email, role: "proprietaire" }]), short(refus.body?.approvers));
  check("refus : rien n'est écrit (dossier en revue, aucune approbation)", (await owner.call("GET", `${pubs}/${d1.id}`)).body?.workStatus === "en-revue");
  await ep.reload();
  await carte.waitFor({ timeout: 30_000 });
  const bouton = carte.locator('[data-studio-publication-action="approuver"]');
  check("interface : « Approuver » désactivé avec l'explication", await carte.locator("[data-auto-controle-refus]").waitFor({ timeout: 10_000 }).then(() => true, () => false) && await bouton.isDisabled());
  check("interface : approbateurs possibles listés", (await carte.locator("[data-auto-controle-approbateurs] li").count()) === 1 && ((await carte.locator("[data-auto-controle-approbateurs]").textContent()) ?? "").includes(owner.email));
  await axe(ep, "approbation refusée (bureau)");

  // Téléphone : même carte, sans défilement horizontal.
  const eveTel = { ...eve, ctx: await browser.newContext(phone) };
  await eveTel.ctx.addCookies(await eve.ctx.cookies());
  const tp = await ouvrir(eveTel, studioPath);
  await tp.locator(`li[data-studio-publication="${d1.id}"] [data-auto-controle-refus]`).waitFor({ timeout: 30_000 });
  check("téléphone : refus expliqué, aucun défilement horizontal", await sansDefilement(tp), await debordements(tp));
  await axe(tp, "approbation refusée (téléphone)");
  const adminTel = { ...admin, ctx: await browser.newContext(phone) };
  await adminTel.ctx.addCookies(await admin.ctx.cookies());
  const atp = await ouvrir(adminTel, "/admin/utilisateurs");
  await atp.locator("[data-admin-accounts]").waitFor({ timeout: 30_000 });
  if (await atp.locator("[data-hide-test]").isChecked()) await atp.locator("[data-hide-test]").uncheck();
  await atp.fill('input[name="q"]', eve.email);
  await atp.getByRole("button", { name: "Rechercher", exact: true }).click();
  await atp.locator(`[data-admin-user="${eve.email}"] button`).click();
  await atp.locator("[data-admin-autorisations]").waitFor();
  check("téléphone : autorisations de la fiche sans défilement horizontal", await sansDefilement(atp), await debordements(atp));
  await axe(atp, "administration — autorisations (téléphone)");

  // --- Un autre approbateur : approbation non marquée -----------------------------------------------------------------
  const okProprio = await owner.call("POST", `${pubs}/${d1.id}/approuver`, examine(d1));
  check("propriétaire : approbation enregistrée sans marque (ni produit ni soumis)", okProprio.status === 200 && okProprio.body.approvedSelfControl === false, short(okProprio.body));

  // --- Option rétablie : approbation signalée, empreintes inchangées ---------------------------------------------------
  check("option rétablie par l'administration", (await admin.call("PATCH", `/admin/users/${eve.id}/self-control`, { allowed: true })).body?.user?.selfControlAllowed === true);
  check("rien de rétroactif : l'approbation passée reste non marquée", (await owner.call("GET", `${pubs}/${d1.id}`)).body?.approvedSelfControl === false);
  check("Eve : nouvelle révision", (await draw("l2")) === 200);
  const d2 = await dossier("Dossier auto 2");
  check("aperçu : périmètre depuis la dernière révision approuvée (1 révision)", (await eve.call("GET", `${pubs}/${d2.id}/controle-approbation`)).body?.revisionsAuteur === 1);
  const avant = d2.manifestHash;
  const okEve = await eve.call("POST", `${pubs}/${d2.id}/approuver`, examine(d2));
  check("Eve : approbation de son dossier enregistrée et marquée auto-contrôle", okEve.status === 200 && okEve.body.approvedSelfControl === true && okEve.body.events.some((e) => e.action === "approuver" && e.selfControl === true), short(okEve.body));
  check("manifeste et empreinte approuvée inchangés par la marque", okEve.body?.manifestHash === avant && okEve.body.approval.manifestHash === avant);
  const journal = await owner.call("GET", `/projects/${pid}/journal`);
  const marques = (journal.body?.entries ?? []).filter((e) => e.action === "review.approval.recorded").map((e) => e.details.selfControl);
  check("historique du projet : approbations journalisées avec leur marque", JSON.stringify(marques) === JSON.stringify([true, false]), short(marques));
  const diff = await owner.call("POST", `${pubs}/${d2.id}/diffuser`, {});
  check("diffusion par le propriétaire : non concernée, paquet sous le manifeste approuvé", diff.status === 200 && diff.body.diffusion.manifestHash === avant, short(diff.body));

  // Interface : marque sur la publication approuvée et dans son journal ; historique de la participation.
  await ep.reload();
  const carte2 = ep.locator(`li[data-studio-publication="${d2.id}"]`);
  await carte2.waitFor({ timeout: 30_000 });
  check("interface : marque « Auto-contrôle » visible sur la publication approuvée", await carte2.locator("[data-studio-publication-auto-controle]").isVisible());
  await carte2.locator(".studio-publication-journal-bouton").click();
  const evenement = carte2.locator('[data-studio-publication-evenement="approuver"][data-auto-controle]');
  check("journal de la publication : « Approbation (auto-contrôle) »", await evenement.waitFor({ timeout: 10_000 }).then(async () => (await evenement.textContent())?.trim() === "Approbation (auto-contrôle)", () => false));
  check("interface : la publication approuvée par le propriétaire n'est pas marquée", (await ep.locator(`li[data-studio-publication="${d1.id}"] [data-studio-publication-auto-controle]`).count()) === 0);
  await axe(ep, "publication approuvée en auto-contrôle (bureau)");

  // --- Anglais ---------------------------------------------------------------------------------------------------------
  check("Eve : troisième révision", (await draw("l3")) === 200);
  const d3 = await dossier("Dossier auto 3");
  const eveEn = { ...eve, ctx: await browser.newContext(desktop) };
  await eveEn.ctx.addInitScript(() => { try { localStorage.setItem("fadi.langue", "en"); } catch { /* indisponible */ } });
  await eveEn.ctx.addCookies(await eve.ctx.cookies());
  const en = await ouvrir(eveEn, studioPath);
  await en.waitForFunction(() => document.documentElement.lang === "en", null, { timeout: 30_000 });
  const carteEn = en.locator(`li[data-studio-publication="${d3.id}"]`);
  await carteEn.waitFor({ timeout: 30_000 });
  await carteEn.locator('[data-studio-publication-action="approuver"]').click();
  const avertEn = carteEn.locator("[data-auto-controle-avertissement]");
  await avertEn.waitFor({ timeout: 10_000 });
  await en.waitForTimeout(300);
  const texteEn = (await avertEn.textContent()) ?? "";
  check("anglais : avertissement traduit", texteEn.includes("You produced 1 revision(s) of this package and submitted it: this approval will be marked as self-checking.") && texteEn.includes("I confirm approving as self-checking"), texteEn);
  check("anglais : marque traduite sur la publication approuvée", ((await en.locator(`li[data-studio-publication="${d2.id}"] [data-studio-publication-auto-controle]`).textContent()) ?? "").trim() === "Self-checking");
  const adminEn = { ...admin, ctx: await browser.newContext(desktop) };
  await adminEn.ctx.addInitScript(() => { try { localStorage.setItem("fadi.langue", "en"); } catch { /* indisponible */ } });
  await adminEn.ctx.addCookies(await admin.ctx.cookies());
  const aen = await ouvrir(adminEn, "/admin/utilisateurs");
  await aen.locator("[data-admin-accounts]").waitFor({ timeout: 30_000 });
  if (await aen.locator("[data-hide-test]").isChecked()) await aen.locator("[data-hide-test]").uncheck();
  await aen.fill('input[name="q"]', eve.email);
  await aen.locator('form[role="search"] button[type="submit"]').click();
  await aen.locator(`[data-admin-user="${eve.email}"] button`).click();
  const autorisationsEn = aen.locator("[data-admin-autorisations]");
  await autorisationsEn.waitFor();
  await aen.waitForTimeout(300);
  const texteAdminEn = (await autorisationsEn.textContent()) ?? "";
  check("anglais : interrupteur et explication traduits", texteAdminEn.includes("Permissions") && texteAdminEn.includes("Self-checking") && texteAdminEn.includes("Enabled (default)") && !/Activé|Autorisations|Auto-contrôle/.test(texteAdminEn), texteAdminEn);

  check("aucune erreur JavaScript dans les pages", pageErrors.length === 0, pageErrors.join(" | "));
} catch (e) {
  failures += 1;
  console.log(`✗ recette interrompue — ${e instanceof Error ? e.stack : String(e)}`);
} finally {
  await browser.close();
  await sql.end();
}
console.log(failures ? `\n${failures} échec(s).` : "\nRecette auto-contrôle (OP-6) : tout est conforme.");
process.exit(failures ? 1 : 0);
