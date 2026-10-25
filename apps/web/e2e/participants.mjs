#!/usr/bin/env node
/**
 * Recette « Équipe et participants » (Issue #262, phase 2) par l'API et l'interface réelles. Comptes (propriétaire,
 * éditeur, lecteur, compte étranger) et projet synthétiques créés par les vraies routes.
 *   1. Annuaire : propriétaire et membres repris comme participations actives ; contact sans compte (statut `contact`)
 *      créé SANS AUCUN DROIT ; recherche d'existant et refus 409 d'un doublon (aucune fusion) ; organisation ; coordonnées
 *      visibles des seuls responsables (OP-D9) ; écritures refusées à un non-propriétaire.
 *   2. Bascule de l'accès (OP-D3 c) : aucun membre existant ne perd son accès ; suspendre retire l'accès à la requête
 *      suivante (projet, liste des projets) et réactiver le rend ; un rôle Approbateur / Diffuseur attribué à un lecteur
 *      lui ouvre l'approbation et la diffusion Studio, sans droit de modification ; une participation active sans rôle
 *      de projet ne donne rien ; terminer retire l'accès et la ligne de partage, un retour ne restaure aucun droit.
 *   3. Effacement d'un contact sur demande, clôture déclarative du projet (aucun droit changé) et, avec DATABASE_URL,
 *      tâche de conservation à horloge simulée (2 ans après la clôture) et journal sans adresse.
 *   4. Interface : onglets Participants et Équipe, états distincts (compte, participation, invitation), formulaire de
 *      contact, rôles par portée, suspension avec aperçu d'impact ; règle d'or (icône, raccourci affiché et déclaré,
 *      raccourcis exercés au clavier) ; axe-core bureau et téléphone ; passe anglaise (aucun texte resté en français).
 *
 * BASE_URL=http://localhost:3001 [DATABASE_URL=…] node apps/web/e2e/participants.mjs
 */
import { chromium } from "playwright";
import { appelPlaywright, inviterEtAccepter } from "./lib-invitations.mjs";
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { createRequire } from "node:module";

const AXE_SCRIPT = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
let echecs = 0;
function check(nom, ok, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${nom}${!ok && detail ? ` — ${detail}` : ""}`);
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
const short = (v) => JSON.stringify(v ?? null).slice(0, 300);
const credentials = (n) => ({ email: `participants-${n}-${randomUUID().replaceAll("-", "").slice(0, 12)}@example.test`, password: randomBytes(18).toString("hex") });
const owner = client(), editor = client(), reader = client(), foreign = client();
const cOwner = credentials("p"), cEditor = credentials("e"), cReader = credentials("l"), cForeign = credentials("x");
for (const [c, cred] of [[owner, cOwner], [editor, cEditor], [reader, cReader], [foreign, cForeign]]) check(`compte créé (${cred.email.split("-")[1]})`, (await c("POST", "/auth/register", cred)).status === 201);
const idOf = async (c) => { const me = (await c("GET", "/auth/me")).body; return me?.user?.id ?? me?.id; };
const ids = { owner: await idOf(owner), editor: await idOf(editor), reader: await idOf(reader) };
const project = await owner("POST", "/projects", { code: `PA_${randomUUID().slice(0, 6)}`, name: "Équipe et participants (recette synthétique)" });
const pid = project.body?.id;
check("projet créé", project.status === 201, String(project.status));
check("éditeur et lecteur invités, invitations acceptées (phase 3)", (await inviterEtAccepter(owner, editor, pid, cEditor.email, "editeur")).ok
  && (await inviterEtAccepter(owner, reader, pid, cReader.email, "lecteur")).ok);
const P = `/projects/${pid}/participants`;
const list = async (c = owner) => (await c("GET", P)).body;
const partOf = (v, userId) => v?.participants?.find((p) => p.person?.account?.userId === userId && p.status !== "terminee");

// ---------------------------------------------------------------------------
// 1. Annuaire.
let v = await list();
check("annuaire : propriétaire, éditeur et lecteur actifs, rôles du partage", partOf(v, ids.owner)?.isOwner && partOf(v, ids.editor)?.roles?.[0]?.role === "concepteur"
  && partOf(v, ids.reader)?.roles?.[0]?.role === "lecteur" && partOf(v, ids.reader)?.status === "active", short(v?.participants));
check("annuaire : accès effectif lu de la seule source (éditeur → modification, lecteur → lecture)", partOf(v, ids.editor)?.access?.role === "editeur" && partOf(v, ids.reader)?.access?.role === "lecteur");
check("aucune perte d'accès des membres existants (projet lisible, éditeur écrit)", (await reader("GET", `/projects/${pid}`)).status === 200 && (await editor("GET", `/projects/${pid}`)).status === 200
  && (await reader("GET", "/projects")).body?.some?.((p) => p.id === pid && p.role === "lecteur") && (await editor("GET", "/projects")).body?.some?.((p) => p.id === pid && p.role === "editeur"));
check("compte étranger : annuaire introuvable (404)", (await foreign("GET", P)).status === 404);

const CONTACT = { kind: "personne", displayName: "Ingénieure structure de recette", jobTitle: "Ingénieure structure", workEmail: `contact-${randomUUID().slice(0, 8)}@example.test`, workPhone: "+33 1 23 45 67 89", representedOrganizationName: `Bureau d'études recette ${randomUUID().slice(0, 4)}`, businessRole: "ingénieur structure", responsibilities: ["verifier"] };
const contact = await owner("POST", `${P}/contacts`, CONTACT);
check("contact sans compte créé en statut « contact »", contact.status === 201 && contact.body?.status === "contact", short(contact.body));
check("doublon de nom refusé (409 existing, fiche proche renvoyée, aucune fusion)", (await owner("POST", `${P}/contacts`, { kind: "personne", displayName: "ingénieure STRUCTURE de recette" })).body?.error === "existing");
check("doublon d'adresse dans le projet refusé même confirmé (409 bloquant)", (await owner("POST", `${P}/contacts`, { kind: "personne", displayName: "Autre nom", workEmail: CONTACT.workEmail, confirmDistinct: true })).body?.blocking === true);
const recherche = await owner("GET", `${P}/search?q=${encodeURIComponent("structure de recette")}`);
check("recherche d'existant par le nom (casse ignorée) : la fiche du contact", recherche.body?.people?.some((p) => p.participationId === contact.body?.id), short(recherche.body));
const etranger = await owner("GET", `${P}/search?q=&email=${encodeURIComponent(cForeign.email)}`);
check("recherche par adresse d'un compte hors de ses projets : existence seulement, aucune fiche ni identité", etranger.body?.accountExists === true && etranger.body?.people?.length === 0 && !JSON.stringify(etranger.body).includes(cForeign.email), short(etranger.body));
check("adresse d'un compte existant : 409 (le partage, pas un contact)", (await owner("POST", `${P}/contacts`, { kind: "personne", displayName: "Éditeur en contact", workEmail: cEditor.email })).body?.matches?.accountExists === true);
const org = await owner("POST", `${P}/contacts`, { kind: "organisation", name: `Maîtrise d'ouvrage recette ${randomUUID().slice(0, 4)}`, businessRole: "client" });
check("organisation ajoutée à l'annuaire (contact, sans droit)", org.status === 201 && org.body?.status === "contact");
check("non-propriétaire : création refusée (403)", (await editor("POST", `${P}/contacts`, { kind: "personne", displayName: "X" })).status === 403);
v = await list();
const vc = v.participants.find((p) => p.id === contact.body?.id);
check("propriétaire (responsable) : coordonnées du contact visibles", vc?.person?.workEmail === CONTACT.workEmail.toLowerCase() && vc?.person?.workPhone === CONTACT.workPhone && vc?.representedOrganization?.name === CONTACT.representedOrganizationName);
const vr = (await list(reader)).participants.find((p) => p.id === contact.body?.id);
check("lecteur : contact listé, coordonnées masquées (OP-D9)", vr && vr.person.workEmail === null && vr.person.workPhone === null && vr.person.displayName === CONTACT.displayName);
check("contact : aucun accès, aucun rôle attribuable sans compte (422)", vc?.access === null && (await owner("POST", `${P}/${contact.body?.id}/roles`, { role: "lecteur" })).status === 422);
check("vue Équipe : le contact « vérifier » y figure, l'organisation sans responsabilité non", (await owner("GET", `${P}/team`)).body?.team?.some((p) => p.id === contact.body?.id) && !(await owner("GET", `${P}/team`)).body?.team?.some((p) => p.id === org.body?.id));
const upd = await owner("PATCH", `${P}/${partOf(v, ids.editor).id}`, { businessRole: "architecte", responsibilities: ["produire", "diriger"] });
check("modification : rôle métier et responsabilités", upd.status === 200 && upd.body?.fields?.includes("responsibilities"), short(upd.body));

// ---------------------------------------------------------------------------
// 2. Bascule de l'accès.
const rp = partOf(v, ids.reader).id;
const impact = await owner("GET", `${P}/${rp}/impact?change=suspendre`);
check("aperçu d'impact de la suspension : accès retiré, rôles listés", impact.body?.accessWithdrawn === true && impact.body?.roles?.length === 1, short(impact.body));
check("suspension du lecteur", (await owner("POST", `${P}/${rp}/status`, { change: "suspendre" })).body?.status === "suspendue");
check("suspendu : le projet est introuvable à la requête suivante (404) et quitte sa liste", (await reader("GET", `/projects/${pid}`)).status === 404 && !(await reader("GET", "/projects")).body?.some?.((p) => p.id === pid));
check("suspendu : un changement de partage ne le réactive pas", (await owner("PATCH", `/projects/${pid}/members/${ids.reader}`, { canExport: true })).status === 200 && (await reader("GET", `/projects/${pid}`)).status === 404);
check("réactivation : l'accès revient, export accordé conservé", (await owner("POST", `${P}/${rp}/status`, { change: "reactiver" })).body?.status === "active"
  && (await reader("GET", `/projects/${pid}/archive`)).status === 200);
check("le propriétaire ne se suspend pas (409)", (await owner("POST", `${P}/${partOf(v, ids.owner).id}/status`, { change: "suspendre" })).status === 409);

// Approbateur et Diffuseur (OP-D3 c) : approbation et diffusion Studio sans droit de modification.
const root = `/projects/${pid}/studio`;
const study = await owner("POST", `${root}/studies`, { name: "Étude participants" });
const studyId = study.body?.study?.id, variantId = study.body?.variant?.id;
const pubs = `${root}/studies/${studyId}/publications`;
const pub = await editor("POST", `${root}/studies/${studyId}/variants/${variantId}/publications`, { title: "Dossier participants" });
const examined = (p) => ({ manifestHash: p.manifestHash, revisionId: p.revisionId, documentHash: p.documentHash });
check("éditeur : dossier préparé et soumis", pub.status === 201 && (await editor("POST", `${pubs}/${pub.body?.id}/soumettre`, {})).status === 200, short(pub.body));
check("lecteur sans rôle Approbateur : approbation refusée (403)", (await reader("POST", `${pubs}/${pub.body?.id}/approuver`, examined(pub.body))).status === 403);
const ra = await owner("POST", `${P}/${rp}/roles`, { role: "approbateur", scopeType: "projet" });
check("rôle Approbateur attribué (origine attribution)", ra.status === 201 && ra.body?.origin === "attribution", short(ra.body));
check("rôle de portée étude enregistré", (await owner("POST", `${P}/${rp}/roles`, { role: "relecteur", scopeType: "etude", scopeId: studyId })).status === 201);
const approved = await reader("POST", `${pubs}/${pub.body?.id}/approuver`, examined(pub.body));
check("Approbateur (lecteur) : approbation Studio acceptée", approved.status === 200 && approved.body?.workStatus === "approuve", short(approved.body));
check("Approbateur : toujours sans modification (403) ni diffusion (403)", (await reader("POST", `${root}/studies`, { name: "X" })).status === 403 && (await reader("POST", `${pubs}/${pub.body?.id}/diffuser`, {})).status === 403);
const rd = await owner("POST", `${P}/${rp}/roles`, { role: "diffuseur", scopeType: "projet" });
check("Diffuseur : diffusion acceptée", rd.status === 201 && (await reader("POST", `${pubs}/${pub.body?.id}/diffuser`, {})).status === 200);
check("rôle du partage non retirable ici (422)", (await owner("DELETE", `${P}/${rp}/roles/${partOf(await list(), ids.reader).roles.find((r) => r.origin === "acces").id}`)).status === 422);
check("retrait du rôle Approbateur", (await owner("DELETE", `${P}/${rp}/roles/${ra.body?.id}`)).status === 200);

// Fin de participation et retour.
const ep = partOf(await list(), ids.editor).id;
const endImpact = await owner("GET", `${P}/${ep}/impact?change=terminer`);
check("aperçu de fin : accès retiré, responsabilités affichées", endImpact.body?.accessWithdrawn === true && endImpact.body?.responsibilities?.includes("diriger"));
check("fin de participation de l'éditeur", (await owner("POST", `${P}/${ep}/status`, { change: "terminer" })).body?.status === "terminee");
check("terminée : accès retiré à la requête suivante (404), retiré des membres", (await editor("GET", `/projects/${pid}`)).status === 404 && !(await owner("GET", `/projects/${pid}/members`)).body?.members?.some((m) => m.userId === ids.editor));
const back = await owner("POST", `${P}/${ep}/return`);
check("retour : nouvelle participation « contact », anciens droits non restaurés", back.status === 201 && back.body?.status === "contact" && (await editor("GET", `/projects/${pid}`)).status === 404, short(back.body));
v = await list();
check("historique : l'ancienne participation reste terminée et datée", v.participants.some((p) => p.id === ep && p.status === "terminee" && p.endsOn));
check("réaccès par le partage : la nouvelle participation devient active, sans les anciennes responsabilités", (await inviterEtAccepter(owner, editor, pid, cEditor.email, "lecteur")).ok
  && (await editor("GET", `/projects/${pid}`)).status === 200 && (await list()).participants.find((p) => p.id === back.body?.id)?.responsibilities?.length === 0);

// ---------------------------------------------------------------------------
// 3. Effacement, clôture, conservation.
const contact2 = await owner("POST", `${P}/contacts`, { kind: "personne", displayName: "Contact conservation recette", workEmail: `conservation-${randomUUID().slice(0, 8)}@example.test` });
check("lecteur : effacement refusé (403)", (await reader("POST", `${P}/${contact.body?.id}/erase`)).status === 403);
check("effacement sur demande par le propriétaire", (await owner("POST", `${P}/${contact.body?.id}/erase`)).body?.erased === true);
const erased = (await list()).participants.find((p) => p.id === contact.body?.id);
check("contact effacé : nom remplacé, coordonnées et fonction supprimées, participation terminée", erased?.person?.erased && !erased.person.workEmail && !erased.person.jobTitle && erased.status === "terminee", short(erased));
const closure = await owner("PUT", `${P}/closure`, { closed: true });
check("clôture du projet (déclarative)", Boolean(closure.body?.closedAt) && (await reader("GET", `/projects/${pid}`)).status === 200);
check("non-propriétaire : clôture refusée (403)", (await reader("PUT", `${P}/closure`, { closed: false })).status === 403);

let browserOk = true;
// ---------------------------------------------------------------------------
// 4. Interface.
async function axe(page, nom) {
  await page.addScriptTag({ path: AXE_SCRIPT });
  const graves = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] } }))
    .violations.filter((x) => ["critical", "serious"].includes(x.impact)).map((x) => `${x.id} (${x.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")})`));
  check(`axe-core ${nom} : aucune violation critique ou sérieuse`, graves.length === 0, graves.join(", "));
}
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });
const erreurs = [];
async function session(cred, viewport = { width: 1280, height: 900 }, langue = "fr") {
  const ctx = await browser.newContext({ viewport });
  await ctx.addInitScript((l) => { try { localStorage.setItem("fadi.langue", l); } catch { /* stockage indisponible */ } }, langue);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => erreurs.push(e.message));
  const r = await page.request.post(`${BASE}/auth/login`, { data: cred, headers: { origin: BASE } });
  check(`interface : connexion (${cred.email.split("-")[1]}, ${langue}, ${viewport.width} px)`, r.status() === 200, String(r.status()));
  await page.goto(`${BASE}/projets/${pid}?module=collaboration`);
  await page.waitForSelector("[data-participants] table", { timeout: 20000 });
  return page;
}
try {
  const page = await session(cOwner);
  const section = page.locator("[data-participants]");
  check("interface : onglets Participants et Équipe", (await section.locator("[role=tab]").count()) === 2);
  check("interface : états distincts compte / participation / invitation", (await section.locator("[data-etat-compte]").count()) > 0 && (await section.locator("[data-etat-participation]").count()) > 0 && (await section.locator("[data-etat-invitation]").count()) > 0);
  check("interface : projet affiché clos, commande « Rouvrir le projet »", (await section.locator("[data-cloture]").getAttribute("data-cloture")) === "clos" && (await section.locator('[data-commande-collaboration="rouvrir-projet"]').count()) === 1);
  check("règle d'or : chaque commande visible porte son icône, son raccourci affiché et déclaré",
    await page.evaluate(() => [...document.querySelectorAll("[data-participants] [data-commande-collaboration]")].every((el) => el.getAttribute("aria-keyshortcuts")?.startsWith("Control+Alt+Shift+") && el.querySelector(".collab-icon") && el.querySelector(".collab-raccourci")))
    && (await section.locator("[data-commande-collaboration]").count()) >= 5);
  await section.locator('[data-commande-collaboration="rouvrir-projet"]').focus();
  await page.keyboard.press("Control+Alt+Shift+Equal");
  await page.waitForFunction(() => document.querySelector("[data-cloture]")?.getAttribute("data-cloture") === "ouvert", null, { timeout: 10000 });
  check("raccourci Ctrl+Alt+Maj+= : projet rouvert", (await owner("GET", P)).body?.project?.closedAt === null);
  // Nouveau contact au clavier, puis formulaire.
  await section.locator("[role=tab]").first().focus();
  await page.keyboard.press("Control+Alt+Shift+Digit6");
  await page.waitForSelector("[data-formulaire-contact]", { timeout: 5000 });
  check("raccourci Ctrl+Alt+Maj+6 : formulaire de contact ouvert", true);
  await axe(page, "Équipe et participants — formulaire de contact (bureau)");
  const form = page.locator("[data-formulaire-contact]");
  await form.locator('[data-champ="nom"]').fill("Contact interface recette");
  await form.locator('[data-champ="fonction"]').fill("Économiste");
  await form.locator('[data-champ="email"]').fill(`interface-${randomUUID().slice(0, 8)}@example.test`);
  await form.locator('[data-champ="role-metier"]').fill("économiste");
  await form.getByLabel("Produire").check();
  await form.locator("button[type=submit]").click();
  await page.waitForSelector('tr[data-participant="Contact interface recette"]', { timeout: 10000 });
  const ligne = page.locator('tr[data-participant="Contact interface recette"]');
  check("interface : contact créé, « Contact, sans accès », sans compte, aucun accès", (await ligne.locator("[data-etat-participation]").getAttribute("data-etat-participation")) === "contact"
    && (await ligne.locator("[data-etat-compte]").getAttribute("data-etat-compte")) === "aucun" && (await ligne.locator("[data-acces]").getAttribute("data-acces")) === "aucun");
  // Suspension avec aperçu d'impact, au clavier depuis la ligne du lecteur.
  const ligneLecteur = page.locator(`tr[data-participant="${cReader.email}"]`);
  await ligneLecteur.locator('[data-commande-collaboration="suspendre-participation"]').focus();
  await page.keyboard.press("Control+Alt+Shift+Digit9");
  await page.waitForSelector('[data-impact="suspendre"]', { timeout: 10000 });
  check("raccourci Ctrl+Alt+Maj+9 : aperçu d'impact de la suspension affiché", (await page.locator('[data-impact="suspendre"] li').count()) >= 3);
  await axe(page, "Équipe et participants — aperçu d'impact (bureau)");
  await page.locator("[data-confirm]").click();
  await page.waitForFunction((email) => document.querySelector(`tr[data-participant="${email}"] [data-etat-participation]`)?.getAttribute("data-etat-participation") === "suspendue", cReader.email, { timeout: 10000 });
  check("interface : lecteur suspendu, accès retiré à la requête suivante", (await reader("GET", `/projects/${pid}`)).status === 404);
  await ligneLecteur.locator('[data-commande-collaboration="reactiver-participation"]').click();
  await page.locator("[data-confirm]").click();
  await page.waitForFunction((email) => document.querySelector(`tr[data-participant="${email}"] [data-etat-participation]`)?.getAttribute("data-etat-participation") === "active", cReader.email, { timeout: 10000 });
  check("interface : réactivation, accès rendu", (await reader("GET", `/projects/${pid}`)).status === 200);
  // Rôles par portée au clavier.
  await ligneLecteur.locator('[data-commande-collaboration="attribuer-role"]').focus();
  await page.keyboard.press("Control+Alt+Shift+Digit8");
  const roles = page.locator("[data-formulaire-roles]");
  await roles.waitFor({ timeout: 5000 });
  await roles.locator('[data-champ="role"]').selectOption("relecteur");
  await roles.locator("button[type=submit]").click();
  await page.waitForFunction((email) => document.querySelector(`tr[data-participant="${email}"] [data-role="relecteur:projet"]`), cReader.email, { timeout: 10000 });
  check("interface : rôle Relecteur (projet) attribué", true);
  // Onglet Équipe.
  await section.locator("#tab-equipe").click();
  await page.waitForSelector("[data-responsabilite=produire] [data-membre-equipe]", { timeout: 5000 });
  check("onglet Équipe : vue des responsabilités (le contact « Produire » y figure)", (await page.locator('[data-responsabilite=produire] [data-membre-equipe="Contact interface recette"]').count()) === 1);
  await axe(page, "Équipe et participants — onglet Équipe (bureau)");
  await page.context().close();

  // Téléphone : lecteur (sans coordonnées) et propriétaire.
  const phone = await session(cOwner, { width: 390, height: 844 });
  await axe(phone, "Équipe et participants — téléphone (propriétaire)");
  // La section ne déborde pas (ses tableaux défilent dans leur propre région) ; le reste de la page n'est pas l'objet ici.
  const debord = await phone.evaluate(() => [...document.querySelectorAll("[data-participants] *")]
    .filter((el) => !el.closest(".table-scroll") && el.getBoundingClientRect().right > window.innerWidth + 1).map((el) => el.tagName));
  check("téléphone : la section Équipe et participants ne déborde pas horizontalement", debord.length === 0, debord.slice(0, 5).join(","));
  await phone.context().close();
  const lecteur = await session(cReader, { width: 390, height: 844 });
  check("lecteur : aucune coordonnée affichée, aucune commande de gestion", (await lecteur.locator("[data-participants] [data-coordonnee]").count()) === 0 && (await lecteur.locator("[data-participants] [data-commande-collaboration]").count()) === 0);
  await axe(lecteur, "Équipe et participants — téléphone (lecteur)");
  await lecteur.context().close();

  // Passe anglaise : aucun texte d'interface resté en français dans la section (données marquées translate="no").
  const en = await session(cOwner, { width: 1280, height: 900 }, "en");
  await en.locator("[data-participants] [data-commande-collaboration=nouveau-contact]").click();
  await en.waitForSelector("[data-formulaire-contact]");
  const FR = /[éèêàùçœ«»]|\b(le|la|les|des|du|une|est|sont|pour|avec|aucun|aucune|sans|dans|sur|au|aux|et|ou|ce|cette|vos|votre|projet)\b/i;
  const releve = async () => en.evaluate((src) => {
    const re = new RegExp(src, "i");
    const out = new Set();
    const racine = document.querySelector("[data-participants]");
    const exclu = (n) => { for (let e = n.parentElement; e; e = e.parentElement) if (e.getAttribute("translate") === "no" || ["OPTION", "TEXTAREA"].includes(e.tagName)) return true; return false; };
    const w = document.createTreeWalker(racine, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) { const t = (n.nodeValue ?? "").replace(/\s+/g, " ").trim(); if (t.length > 1 && re.test(t) && !exclu(n)) out.add(t); }
    for (const el of racine.querySelectorAll("[aria-label],[title],[placeholder]")) for (const a of ["aria-label", "title", "placeholder"]) { const x = el.getAttribute(a); if (x && re.test(x) && !el.closest('[translate="no"]')) out.add(x); }
    return [...out];
  }, FR.source);
  const donnees = [CONTACT.displayName, "Contact interface recette", "Économiste", "économiste", "architecte", "Équipe et participants (recette synthétique)"];
  const restes = (await releve()).filter((t) => !donnees.some((d) => t.includes(d)));
  check("passe anglaise : aucun texte de la section resté en français", restes.length === 0, restes.slice(0, 12).join(" | "));
  // Aperçu d'impact et formulaire des rôles, en anglais.
  await en.locator(`tr[data-participant="${cReader.email}"] [data-commande-collaboration="terminer-participation"]`).click();
  await en.waitForSelector('[data-impact="terminer"]', { timeout: 10000 });
  const restesImpact = (await releve()).filter((t) => !donnees.some((d) => t.includes(d)));
  check("passe anglaise : aperçu d'impact sans texte en français", restesImpact.length === 0, restesImpact.slice(0, 12).join(" | "));
  await en.locator(".confirm-dialog button.button-secondary").first().click();
  await en.locator(`tr[data-participant="${cReader.email}"] [data-commande-collaboration="attribuer-role"]`).click();
  await en.waitForSelector("[data-formulaire-roles]");
  const restesRoles = (await releve()).filter((t) => !donnees.some((d) => t.includes(d)));
  check("passe anglaise : formulaire des rôles sans texte en français", restesRoles.length === 0, restesRoles.slice(0, 12).join(" | "));
  await en.locator("#tab-equipe").click();
  const restesEquipe = (await releve()).filter((t) => !donnees.some((d) => t.includes(d)));
  check("passe anglaise : onglet Équipe sans texte en français", restesEquipe.length === 0, restesEquipe.slice(0, 12).join(" | "));
  await en.context().close();
  check("interface : aucune erreur de page", erreurs.length === 0, erreurs.join(" | "));
} catch (err) {
  browserOk = false;
  check("interface : déroulé sans exception", false, String(err?.message ?? err).slice(0, 400));
} finally {
  await browser.close();
}

// ---------------------------------------------------------------------------
// 5. Base (quand elle est donnée) : journal sans adresse, tâche de conservation à horloge simulée.
if (process.env.DATABASE_URL) {
  const pg = (await import("pg")).default;
  const sql = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await sql.connect();
  const journal = (await sql.query("SELECT action, metadata::text AS m FROM admin.audit_log WHERE target_type = 'project' AND target_id = $1 ORDER BY id", [pid])).rows;
  const actions = new Set(journal.map((r) => r.action));
  for (const a of ["participation.created", "participation.updated", "participation.status_changed", "participation.role_assigned", "participation.role_removed", "person.contact_created", "person.contact_erased", "organization.created", "project.closed", "project.reopened"]) {
    check(`journal : ${a}`, actions.has(a));
  }
  check("journal : aucune adresse ni coordonnée dans les métadonnées", journal.every((r) => !r.m.includes("@") && !r.m.includes("+33")), journal.filter((r) => r.m.includes("@")).map((r) => r.action).join(","));
  // Conservation (OP-2) : le projet est clos ; 2 ans et 1 jour plus tard, le contact sans compte est effacé.
  check("re-clôture du projet", Boolean((await owner("PUT", `${P}/closure`, { closed: true })).body?.closedAt));
  const avant = await sql.query("SELECT erased_at FROM people WHERE id = (SELECT person_id FROM project_participations WHERE id = $1)", [contact2.body?.id]);
  check("conservation : contact intact avant l'échéance", avant.rows[0]?.erased_at === null);
  const now = new Date(Date.now() + (2 * 366 + 1) * 24 * 3600 * 1000).toISOString();
  try {
    const out = execFileSync("npm", ["run", "-s", "db:account-jobs", "--workspace=@fadi/api", "--", `--now=${now}`, "--contacts-seulement"], { encoding: "utf8", env: process.env });
    check("tâche de conservation exécutée (horloge simulée)", /"contacts":\{"erased":\d+\}/.test(out), out.slice(-200));
  } catch (err) { check("tâche de conservation exécutée (horloge simulée)", false, String(err?.message ?? err).slice(0, 300)); }
  const apres = await sql.query("SELECT erased_at, work_email, display_name FROM people WHERE id = (SELECT person_id FROM project_participations WHERE id = $1)", [contact2.body?.id]);
  check("conservation : contact effacé 2 ans après la clôture (nom remplacé, adresse supprimée)", apres.rows[0]?.erased_at !== null && apres.rows[0]?.work_email === null && apres.rows[0]?.display_name === "Contact effacé");
  await sql.end();
} else {
  console.log("— journal et tâche de conservation : NON EXÉCUTÉS (DATABASE_URL absente)");
}

console.log(echecs ? `\n${echecs} échec(s)${browserOk ? "" : " (interface interrompue)"}` : "\nRecette Équipe et participants : tout est vert.");
process.exit(echecs ? 1 : 0);
