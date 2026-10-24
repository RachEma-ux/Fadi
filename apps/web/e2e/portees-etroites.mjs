#!/usr/bin/env node
/**
 * Recette « Portées étroites » (Issue #262, reliquat de la phase 2 ;
 * docs/workstreams/organisations-participation/portees-etroites.md) par l'API et l'interface réelles.
 *   1. Attribution contrôlée : l'élément désigné (étude, variante, révision, documents) doit exister dans CE projet ;
 *      la réponse décrit la capacité ajoutée.
 *   2. Règle directrice : une portée étroite SEULE n'ouvre rien (404 partout : projet, liste, Studio, Documents,
 *      participants) — exige DATABASE_URL pour retirer le rôle de portée projet d'une participation active.
 *   3. Capacité ajoutée dans le périmètre, refusée hors périmètre : Concepteur de l'étude X (écrit X, pas Y ; n'archive
 *      pas X) ; Concepteur de la variante (contenu de V seul) ; Approbateur de la variante, Diffuseur de l'étude, Approbateur
 *      de la révision (dossier de cette révision seulement ; un dossier coordonné échappe aux portées variante et révision) ;
 *      Relecteur de la variante (recontrôle l'observation de V, pas celle de W) ; portée documents (ce dessin, pas un autre ;
 *      la famille des paquets Studio).
 *   4. Aucune régression des rôles de portée projet (éditeur, lecteur, propriétaire).
 *   5. Interface (onglet Participants) : sélecteur de l'élément, capacité résultante, attribution, libellé de l'élément ;
 *      axe-core bureau et téléphone ; passe anglaise.
 *
 * BASE_URL=http://localhost:3001 [DATABASE_URL=…] [CHROMIUM_PATH=…] node apps/web/e2e/portees-etroites.mjs
 */
import { chromium } from "playwright";
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
  return async (method, path, body, headers = {}) => {
    const raw = body instanceof Uint8Array;
    const res = await fetch(`${BASE}${path}`, {
      method, headers: { ...(raw ? {} : { "content-type": "application/json" }), origin: BASE, ...(cookie ? { cookie } : {}), ...headers },
      body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
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
const credentials = (n) => ({ email: `portees-${n}-${randomUUID().replaceAll("-", "").slice(0, 12)}@example.test`, password: randomBytes(18).toString("hex") });
const owner = client(), editor = client(), lea = client(), remi = client(), nora = client(), plain = client(), foreign = client();
const cOwner = credentials("p"), cEditor = credentials("e"), cLea = credentials("l"), cRemi = credentials("r"), cNora = credentials("n"), cPlain = credentials("s"), cForeign = credentials("x");
for (const [c, cred] of [[owner, cOwner], [editor, cEditor], [lea, cLea], [remi, cRemi], [nora, cNora], [plain, cPlain], [foreign, cForeign]]) {
  check(`compte créé (${cred.email.split("-")[1]})`, (await c("POST", "/auth/register", cred)).status === 201);
}
const idOf = async (c) => { const me = (await c("GET", "/auth/me")).body; return me?.user?.id ?? me?.id; };
const project = await owner("POST", "/projects", { code: `PE_${randomUUID().slice(0, 6)}`, name: "Portées étroites (recette synthétique)" });
const pid = project.body?.id;
check("projet créé", project.status === 201, String(project.status));
for (const [cred, role] of [[cEditor, "editeur"], [cLea, "lecteur"], [cRemi, "lecteur"], [cNora, "lecteur"], [cPlain, "lecteur"]]) {
  check(`partage ${role} (${cred.email.split("-")[1]})`, (await owner("POST", `/projects/${pid}/members`, { email: cred.email, role })).status === 201);
}
const P = `/projects/${pid}/participants`;
const ids = { owner: await idOf(owner), lea: await idOf(lea), remi: await idOf(remi), nora: await idOf(nora) };
const partOf = async (userId) => (await owner("GET", P)).body?.participants?.find((p) => p.person?.account?.userId === userId && p.status !== "terminee")?.id;
const assign = (part, role, scopeType, scopeId) => owner("POST", `${P}/${part}/roles`, { role, scopeType, scopeId });

// Studio : étude X (variantes VX, VX2), étude Y (VY).
const root = `/projects/${pid}/studio`;
const sx = await owner("POST", `${root}/studies`, { name: "Étude X" });
const sy = await owner("POST", `${root}/studies`, { name: "Étude Y" });
const X = sx.body?.study?.id, VX = sx.body?.variant?.id, Y = sy.body?.study?.id, VY = sy.body?.variant?.id;
const vx2 = await owner("POST", `${root}/studies/${X}/variants`, { name: "Variante X2" });
const VX2 = vx2.body?.variant?.id;
check("études X et Y, variantes VX, VX2 et VY", Boolean(X && Y && VX && VY && VX2), short([sx.body, vx2.body]));
const heads = { [VX]: sx.body?.revision?.id, [VY]: sy.body?.revision?.id, [VX2]: vx2.body?.revision?.id };
const vpath = (s, v) => `${root}/studies/${s}/variants/${v}`;
async function draw(c, s, v, x = 3) {
  const r = await c("POST", `${vpath(s, v)}/commands`, { contractVersion: "studio-commands/1", requestId: `pe-${randomUUID()}`, baseRevisionId: heads[v], commands: [{ toolId: "studio.dessin.ligne", params: { id: `l-${randomUUID().slice(0, 8)}`, type: "line", start: { x: 0, y: 0 }, end: { x, y: 2 } } }] });
  if (r.status === 200) heads[v] = r.body?.revision?.id;
  return r;
}
check("propriétaire : dessin dans VX et VY", (await draw(owner, X, VX)).status === 200 && (await draw(owner, Y, VY)).status === 200);

// ---------------------------------------------------------------------------
// 1. Attribution contrôlée.
const pLea = await partOf(ids.lea), pRemi = await partOf(ids.remi), pNora = await partOf(ids.nora);
const other = await foreign("POST", "/projects", { code: `PX_${randomUUID().slice(0, 6)}`, name: "Autre projet" });
const otherStudy = (await foreign("POST", `/projects/${other.body?.id}/studio/studies`, { name: "Étude étrangère" })).body?.study?.id;
check("attribution refusée : étude inconnue (422 scope_rule)", (await assign(pLea, "concepteur", "etude", "etude-inconnue")).body?.error === "scope_rule");
check("attribution refusée : étude d'un autre projet (422)", (await assign(pLea, "concepteur", "etude", otherStudy)).status === 422);
check("attribution refusée : variante passée pour une étude (422)", (await assign(pLea, "concepteur", "etude", VX)).status === 422);
check("attribution refusée : l'archive du projet entier n'est pas un document désignable (422)", (await assign(pLea, "lecteur", "documents", "archive-projet")).status === 422);
check("attribution refusée : portée sans élément (422)", (await assign(pLea, "concepteur", "variante", "")).status === 422);
const aLea = await assign(pLea, "concepteur", "etude", X);
check("Concepteur de l'étude X attribué ; capacité décrite (modifier)", aLea.status === 201 && JSON.stringify(aLea.body?.capacites) === '["modifier"]', short(aLea.body));

// ---------------------------------------------------------------------------
// 2. Portée étroite seule : rien.
let narrowOnly = false;
if (process.env.DATABASE_URL) {
  const pg = (await import("pg")).default;
  const sql = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await sql.connect();
  await sql.query("DELETE FROM project_role_assignments WHERE participation_id = $1 AND scope_type = 'projet'", [pNora]);
  await sql.end();
  narrowOnly = true;
  check("participation active sans rôle de projet : portée étroite attribuée (Concepteur X, Approbateur VX, documents)",
    (await assign(pNora, "concepteur", "etude", X)).status === 201 && (await assign(pNora, "approbateur", "variante", VX)).status === 201 && (await assign(pNora, "lecteur", "documents", "dessins")).status === 201);
  const refus = [
    ["GET", `/projects/${pid}`], ["GET", `${root}/studies`], ["GET", `${root}/studies/${X}`], ["GET", `${vpath(X, VX)}`], ["GET", `${vpath(X, VX)}/comments`],
    ["GET", `/projects/${pid}/documents`], ["GET", P], ["GET", `/projects/${pid}/members`],
  ];
  const statuts = [];
  for (const [m, u] of refus) statuts.push((await nora(m, u)).status);
  statuts.push((await draw(nora, X, VX)).status);
  statuts.push((await nora("POST", `${root}/studies/${X}/variants`, { name: "Intrusion" })).status);
  check("portée étroite seule : 404 partout (projet, Studio, commandes, Documents, participants)", statuts.every((s) => s === 404), statuts.join(","));
  check("portée étroite seule : le projet n'apparaît pas dans sa liste", !(await nora("GET", "/projects")).body?.some?.((p) => p.id === pid));
} else {
  console.log("— portée étroite seule (404 partout) : NON EXÉCUTÉ (DATABASE_URL absente)");
}

// ---------------------------------------------------------------------------
// 3a. Concepteur de l'étude X (lecteur du projet).
check("Lea (Concepteur de X) : dessine dans VX", (await draw(lea, X, VX)).status === 200);
check("Lea : dessine dans VX2 (même étude)", (await draw(lea, X, VX2)).status === 200);
check("Lea : refusée dans VY (étude Y, 403)", (await draw(lea, Y, VY)).status === 403);
const leaX = await lea("GET", `${root}/studies/${X}`), leaY = await lea("GET", `${root}/studies/${Y}`);
check("Lea : étude X écrivable, non administrable ; étude Y en lecture", leaX.body?.canWrite === true && leaX.body?.canManage === false && leaY.body?.canWrite === false);
check("Lea : contexte VX écrivable, VY non", (await lea("GET", vpath(X, VX))).body?.canWrite === true && (await lea("GET", vpath(Y, VY))).body?.canWrite === false);
check("Lea : nouvelle variante dans X (201), pas dans Y (403)", (await lea("POST", `${root}/studies/${X}/variants`, { name: "Variante de Lea" })).status === 201
  && (await lea("POST", `${root}/studies/${Y}/variants`, { name: "Non" })).status === 403);
check("Lea : renomme X (200), pas Y (403)", (await lea("PATCH", `${root}/studies/${X}`, { name: "Étude X" })).status === 200 && (await lea("PATCH", `${root}/studies/${Y}`, { name: "Non" })).status === 403);
check("Lea : n'archive pas X (403) ; ne crée pas d'étude (403)", (await lea("POST", `${root}/studies/${X}/archive`)).status === 403 && (await lea("POST", `${root}/studies`, { name: "Non" })).status === 403);
check("Lea : n'approuve rien, n'exporte rien (droits inchangés hors capacité)", (await lea("GET", `${vpath(X, VX)}/export?format=svg`)).status === 403);
const pubLea = await lea("POST", `${vpath(X, VX)}/publications`, { title: "Dossier de Lea" });
check("Lea : prépare un dossier de VX (201) ; un dossier de VY refusé (403)", pubLea.status === 201 && (await lea("POST", `${vpath(Y, VY)}/publications`, { title: "Non" })).status === 403, short(pubLea.body));

// 3b. Concepteur de la variante VX2 (Rémi) : contenu de VX2 seul.
check("Concepteur de la variante VX2 attribué", (await assign(pRemi, "concepteur", "variante", VX2)).status === 201);
check("Rémi : dessine dans VX2 (200), pas dans VX (403)", (await draw(remi, X, VX2)).status === 200 && (await draw(remi, X, VX)).status === 403);
check("Rémi : ne crée pas de variante dans X (hors périmètre, 403)", (await remi("POST", `${root}/studies/${X}/variants`, { name: "Non" })).status === 403);
check("Rémi : dossier coordonné VX2 + VX refusé (403)", (await remi("POST", `${vpath(X, VX2)}/publications`, { title: "Coordonné", coordinatedVariantIds: [VX] })).status === 403);

// 3c. Approbation, diffusion, révision.
const pubs = (s) => `${root}/studies/${s}/publications`;
const examined = (p) => ({ manifestHash: p.manifestHash, revisionId: p.revisionId, documentHash: p.documentHash });
const submit = async (s, v, title, extra = {}) => {
  const p = await owner("POST", `${vpath(s, v)}/publications`, { title, ...extra });
  const sub = await owner("POST", `${pubs(s)}/${p.body?.id}/soumettre`, {});
  return sub.status === 200 ? sub.body : null;
};
const pVX = await submit(X, VX, "Dossier VX"), pVY = await submit(Y, VY, "Dossier VY"), pCoord = await submit(X, VX, "Dossier coordonné", { coordinatedVariantIds: [VX2] });
check("dossiers VX, VY et coordonné (VX + VX2) soumis", Boolean(pVX && pVY && pCoord));
check("Rémi sans rôle : approbation refusée (403)", (await remi("POST", `${pubs(X)}/${pVX?.id}/approuver`, examined(pVX))).status === 403);
check("Approbateur de la variante VX attribué", (await assign(pRemi, "approbateur", "variante", VX)).status === 201);
const readVX = await remi("GET", `${pubs(X)}/${pVX?.id}`);
check("Rémi : « approuver » proposé sur le dossier VX (transitions permises du serveur)", readVX.body?.allowed?.includes?.("approuver"), short(readVX.body?.allowed));
check("Rémi : dossier coordonné hors portée variante (403)", (await remi("POST", `${pubs(X)}/${pCoord?.id}/approuver`, examined(pCoord))).status === 403);
const appVX = await remi("POST", `${pubs(X)}/${pVX?.id}/approuver`, examined(pVX));
check("Rémi (Approbateur de VX) : approuve le dossier VX", appVX.status === 200 && appVX.body?.workStatus === "approuve", short(appVX.body));
check("Rémi : ne diffuse pas (403) ; n'approuve pas le dossier VY (403)", (await remi("POST", `${pubs(X)}/${pVX?.id}/diffuser`, {})).status === 403
  && (await remi("POST", `${pubs(Y)}/${pVY?.id}/approuver`, examined(pVY))).status === 403);
check("Diffuseur de l'étude X attribué", (await assign(pRemi, "diffuseur", "etude", X)).status === 201);
check("Rémi (Diffuseur de X) : diffuse le dossier VX", (await remi("POST", `${pubs(X)}/${pVX?.id}/diffuser`, {})).status === 200);
check("Approbateur de la révision du dossier VY attribué", (await assign(pRemi, "approbateur", "revision", pVY?.revisionId)).status === 201);
const appVY = await remi("POST", `${pubs(Y)}/${pVY?.id}/approuver`, examined(pVY));
check("Rémi (Approbateur de la révision) : approuve le dossier de cette révision", appVY.status === 200, short(appVY.body));
check("Rémi : ne diffuse pas le dossier VY (hors étude X, 403)", (await remi("POST", `${pubs(Y)}/${pVY?.id}/diffuser`, {})).status === 403);

// 3d. Relecteur de la variante VX : recontrôle l'observation de VX, pas celle de VY.
async function observation(s, v) {
  const c = await owner("POST", `${vpath(s, v)}/comments`, { body: `Constat ${randomUUID().slice(0, 6)}`, audience: "projet" });
  const o = await owner("POST", `${vpath(s, v)}/comments/${c.body?.id}/observation`, { responsableId: ids.owner });
  const cor = await owner("POST", `${vpath(s, v)}/comments/${c.body?.id}/observation/transitions`, { action: "corriger", revisionId: heads[v] });
  return o.status === 201 && cor.status === 200 ? c.body.id : null;
}
const oVX = await observation(X, VX), oVY = await observation(Y, VY);
check("observations de VX et VY ouvertes et corrigées", Boolean(oVX && oVY));
check("Rémi sans rôle Relecteur : recontrôle refusé (403)", (await remi("POST", `${vpath(X, VX)}/comments/${oVX}/observation/transitions`, { action: "recontroler", revisionId: heads[VX] })).status === 403);
check("Relecteur de la variante VX attribué", (await assign(pRemi, "relecteur", "variante", VX)).status === 201);
const obsList = await remi("GET", `${vpath(X, VX)}/comments`);
check("Rémi : « recontrôler » proposé sur l'observation de VX", obsList.body?.comments?.find?.((c) => c.id === oVX)?.observation?.possibles?.includes("recontroler"), short(obsList.body?.comments?.[0]?.observation?.possibles));
check("Rémi (Relecteur de VX) : recontrôle l'observation de VX", (await remi("POST", `${vpath(X, VX)}/comments/${oVX}/observation/transitions`, { action: "recontroler", revisionId: heads[VX] })).status === 200);
check("Rémi : ne recontrôle pas l'observation de VY (403) ; ne clôture pas (403)", (await remi("POST", `${vpath(Y, VY)}/comments/${oVY}/observation/transitions`, { action: "recontroler", revisionId: heads[VY] })).status === 403
  && (await remi("POST", `${vpath(X, VX)}/comments/${oVX}/observation/transitions`, { action: "cloturer", note: "non" })).status === 403);

// 3e. Portée documents.
const upload = async (name) => owner("POST", `/projects/${pid}/documents/dessins`, new TextEncoder().encode(`<svg xmlns="http://www.w3.org/2000/svg"><title>${name}</title></svg>`), { "x-file-name": `${name}.svg`, "x-export-kind": "svg", "x-file-type": "image/svg+xml" });
const d1 = await upload("plan-a"), d2 = await upload("plan-b");
check("deux dessins enregistrés par le propriétaire", d1.status === 201 && d2.status === 201);
check("Lea (lecteur sans export) : téléchargement refusé (403)", (await lea("GET", `/projects/${pid}/documents/dessins/${d1.body?.id}`)).status === 403);
check("portée documents « dessin:… » attribuée à Lea", (await assign(pLea, "lecteur", "documents", `dessin:${d1.body?.id}`)).status === 201);
check("Lea : télécharge CE dessin (200), pas l'autre (403)", (await lea("GET", `/projects/${pid}/documents/dessins/${d1.body?.id}`)).status === 200
  && (await lea("GET", `/projects/${pid}/documents/dessins/${d2.body?.id}`)).status === 403);
check("Lea : l'archive du projet reste refusée (403)", (await lea("GET", `/projects/${pid}/archive`)).status === 403);
const fileVX = `${pubs(X)}/${pVX?.id}/files/svg`;
check("Lea : fichier du paquet Studio refusé (403)", (await lea("GET", fileVX)).status === 403);
check("portée documents « studio » (famille des paquets) attribuée", (await assign(pLea, "lecteur", "documents", "studio")).status === 201);
check("Lea : fichier du paquet Studio servi (200)", (await lea("GET", fileVX)).status === 200);
if (narrowOnly) check("Nora (portée documents seule) : dessin introuvable (404)", (await nora("GET", `/projects/${pid}/documents/dessins/${d1.body?.id}`)).status === 404);

// ---------------------------------------------------------------------------
// 4. Aucune régression des rôles de portée projet.
check("éditeur : écrit partout (X et Y)", (await draw(editor, X, VX)).status === 200 && (await draw(editor, Y, VY)).status === 200);
{
  const s = [(await plain("GET", `${root}/studies/${X}`)).status, (await draw(plain, X, VX)).status, (await plain("POST", `${pubs(X)}/${pCoord?.id}/approuver`, examined(pCoord))).status];
  check("lecteur sans portée : lecture (200), écriture refusée (403), approbation refusée (403)", s.join() === "200,403,403", s.join());
}
check("compte étranger : 404", (await foreign("GET", `${root}/studies/${X}`)).status === 404);
check("retrait du rôle : la capacité cesse à la requête suivante", (await owner("DELETE", `${P}/${pLea}/roles/${aLea.body?.id}`)).status === 200 && (await draw(lea, X, VX)).status === 403);

// ---------------------------------------------------------------------------
// 5. Interface.
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
  check(`interface : connexion (${langue}, ${viewport.width} px)`, r.status() === 200, String(r.status()));
  await page.goto(`${BASE}/projets/${pid}?module=collaboration`);
  await page.waitForSelector("[data-participants] table", { timeout: 20000 });
  return page;
}
async function ouvrirRoles(page, email) {
  await page.locator(`tr[data-participant="${email}"] [data-commande-collaboration="attribuer-role"]`).click();
  await page.waitForSelector("[data-formulaire-roles]");
  return page.locator("[data-formulaire-roles]");
}
try {
  const page = await session(cOwner);
  const roles = await ouvrirRoles(page, cLea.email);
  check("interface : l'attribution existante affiche le libellé de l'élément et sa capacité", (await roles.locator(`[data-element-portee="dessin:${d1.body?.id}"]`).count()) === 1
    && (await roles.locator("[data-capacite-role]").count()) >= 1);
  await roles.locator('[data-champ="role"]').selectOption("concepteur");
  await roles.locator('[data-champ="portee"]').selectOption("etude");
  await page.waitForFunction(() => document.querySelectorAll('[data-formulaire-roles] [data-champ="element-portee"] option').length >= 3, null, { timeout: 15000 });
  const options = await roles.locator('[data-champ="element-portee"] option').allTextContents();
  check("interface : sélecteur d'étude (X et Y proposées)", options.includes("Étude X") && options.includes("Étude Y"), options.join(" | "));
  check("interface : capacité résultante « modifier » affichée avant l'attribution", (await roles.locator("[data-capacite-resultante]").getAttribute("data-capacite-resultante")) === "modifier");
  await roles.locator('[data-champ="role"]').selectOption("lecteur");
  check("interface : rôle sans effet à cette portée signalé", (await roles.locator("[data-capacite-resultante]").getAttribute("data-capacite-resultante")) === "aucune");
  await roles.locator('[data-champ="role"]').selectOption("concepteur");
  await roles.locator('[data-champ="element-portee"]').selectOption(X);
  await axe(page, "Portées étroites — formulaire des rôles (bureau)");
  await roles.locator("button[type=submit]").click();
  await page.waitForFunction(() => document.querySelectorAll('[data-formulaire-roles] [data-role="concepteur:etude"]').length === 1, null, { timeout: 15000 }).catch(() => {});
  check("interface : rôle attribué depuis le sélecteur, libellé « Étude X »", (await page.locator('[data-formulaire-roles] [data-role="concepteur:etude"] [data-element-portee]').textContent())?.trim() === "Étude X");
  check("interface : la capacité est réelle (Lea redessine dans VX)", (await draw(lea, X, VX)).status === 200);
  // Révision : variante puis révision.
  await roles.locator('[data-champ="portee"]').selectOption("revision");
  await roles.locator('[data-champ="variante-revision"]').selectOption(VY);
  await page.waitForFunction(() => document.querySelectorAll('[data-formulaire-roles] [data-champ="element-portee"] option').length >= 2, null, { timeout: 15000 });
  check("interface : révisions de la variante choisie proposées", (await roles.locator('[data-champ="element-portee"] option').count()) >= 2);
  // Documents : familles et documents identifiés.
  await roles.locator('[data-champ="portee"]').selectOption("documents");
  await page.waitForFunction(() => document.querySelectorAll('[data-formulaire-roles] [data-champ="element-portee"] optgroup').length === 2, null, { timeout: 15000 });
  const docValues = await roles.locator('[data-champ="element-portee"] option').evaluateAll((os) => os.map((o) => o.value));
  check("interface : documents — familles et dessins proposés, archive exclue", docValues.includes("dessins") && docValues.includes(`dessin:${d2.body?.id}`) && !docValues.includes("archive-projet"), docValues.join(","));
  check("interface : capacité « télécharger » pour la portée documents", (await roles.locator("[data-capacite-resultante]").getAttribute("data-capacite-resultante")) === "telecharger");
  await page.context().close();

  const phone = await session(cOwner, { width: 390, height: 844 });
  const rp = await ouvrirRoles(phone, cRemi.email);
  await rp.locator('[data-champ="portee"]').selectOption("variante");
  await phone.waitForFunction(() => document.querySelectorAll('[data-formulaire-roles] [data-champ="element-portee"] option').length >= 3, null, { timeout: 15000 });
  await axe(phone, "Portées étroites — formulaire des rôles (téléphone)");
  const debord = await phone.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check("téléphone : aucun débordement horizontal de la page", debord <= 0, String(debord));
  await phone.context().close();

  // Passe anglaise : formulaire des rôles avec une portée étroite.
  const en = await session(cOwner, { width: 1280, height: 900 }, "en");
  const re = await ouvrirRoles(en, cRemi.email);
  await re.locator('[data-champ="role"]').selectOption("approbateur");
  await re.locator('[data-champ="portee"]').selectOption("variante");
  await en.waitForSelector("[data-capacite-resultante]");
  const FR = /[éèêàùçœ«»]|\b(le|la|les|des|du|une|est|sont|pour|avec|aucun|aucune|sans|dans|sur|au|aux|et|ou|ce|cette|vos|votre|projet)\b/i;
  const restes = await en.evaluate((src) => {
    const rx = new RegExp(src, "i");
    const out = new Set();
    const racine = document.querySelector("[data-formulaire-roles]");
    const exclu = (n) => { for (let e = n.parentElement; e; e = e.parentElement) if (e.getAttribute("translate") === "no" || ["OPTION", "TEXTAREA"].includes(e.tagName)) return true; return false; };
    const w = document.createTreeWalker(racine, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) { const t = (n.nodeValue ?? "").replace(/\s+/g, " ").trim(); if (t.length > 1 && rx.test(t) && !exclu(n)) out.add(t); }
    return [...out];
  }, FR.source);
  const donnees = [cRemi.email];
  const vrais = restes.filter((t) => !donnees.some((d) => t.includes(d)));
  check("passe anglaise : formulaire des rôles (portée étroite) sans texte en français", vrais.length === 0, vrais.slice(0, 12).join(" | "));
  check("passe anglaise : capacité résultante traduite", ((await en.locator("[data-capacite-resultante]").textContent()) ?? "").includes("Added capability"));
  await en.context().close();
  check("interface : aucune erreur de page", erreurs.length === 0, erreurs.join(" | "));
} catch (err) {
  check("interface : déroulé sans exception", false, String(err?.message ?? err).slice(0, 400));
} finally {
  await browser.close();
}

console.log(echecs ? `\n${echecs} échec(s).` : "\nPortées étroites : tout est vert.");
process.exit(echecs ? 1 : 0);
