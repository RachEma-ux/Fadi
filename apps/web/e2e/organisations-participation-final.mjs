#!/usr/bin/env node
/**
 * Recette finale du chantier organisations-participation (Issue #262, phase 6 — PLAN.md « Recette et préparation »).
 * Elle déroule, sur l'API réelle qui sert l'application construite (même origine, base migrée), le scénario final du
 * concept (`docs/workstreams/users-management/concept.md`, « Development sequence and completion » : « an organization
 * forms a project team, an external participant reviews identified material, authorized contributors resolve findings,
 * an approver accepts a dossier and a publisher releases its approved versions ») pour le périmètre livré :
 *
 *  1. Organisation — création rejouable, adhésions par invitation ACCEPTÉE (aperçu de l'invitation avant acceptation,
 *     lien transféré refusé) ; une adhésion n'ouvre aucun projet.
 *  2. Projet — partie propriétaire déclarée (OP-D1 a), sans aucun droit changé.
 *  3. Équipe — contact sans compte (aucun accès), invitations avec aperçu de l'accès résultant, acceptées par l'identité
 *     visée ; rôles par portée (Concepteur, Lecteur + Coordinateur, Lecteur + Concepteur ÉTROIT sur une étude) ;
 *     échéance d'accès (recopiée, puis expirée = 404) ; vue Équipe ; responsables du projet.
 *  4. Revue externe — paquet figé d'une publication Studio candidate (R03), relecteur externe hors organisation et
 *     approbatrice externe nommée (nouveau compte), lien transféré inopérant, 404 sur un échantillon de routes du projet,
 *     constat sur la révision EXACTE, notes internes jamais servies.
 *  5. Boucle de correction — correction déclarée par l'équipe sur R04, recontrôle refusé sur R03, nouvelle version du
 *     paquet (R04), recontrôle, revue satisfaisante, relecteur sans approbation, approbation par l'approbatrice nommée
 *     (transition Studio).
 *  6. Diffusion — refusée au destinataire externe (404) et à un concepteur sans rôle Diffuseur (403) ; diffusion par
 *     l'équipe, dossier conforme au paquet approuvé.
 *  7. Fin de participation — aperçu des conséquences, accès retiré à la requête suivante, adhésion intacte.
 *  8. Journal — chaque étape visible de la bonne audience : administrateur (tout), utilisateur (Mon historique : ses
 *     actes seulement), responsable du projet (historique du projet ; non-responsable 403, externe 404) ; métadonnées
 *     sans adresse en clair.
 *  9. Navigateur — écrans clés (organisation, Collaboration, espace de revue, Mon historique, journal d'administration) :
 *     axe-core bureau 1440 × 900 et téléphone 390 × 844, aucun défilement horizontal au téléphone ; passe anglaise.
 *
 *   BASE_URL=http://localhost:3001 DATABASE_URL=… [MAILPIT_URL=… | API_LOG=api.log] node apps/web/e2e/organisations-participation-final.mjs
 *
 * DATABASE_URL (base locale jetable, `fadi_app` suffit) sert à l'expiration d'accès simulée, à la promotion de
 * l'administrateur (`apps/api/scripts/create-admin.mjs`) et à la relecture du journal ; sans elle, ces contrôles sont
 * déclarés NON EXÉCUTÉS (jamais réputés réussis). Courriels : Mailpit (CI) ou transport console + `API_LOG` (poste local).
 */
import { createHash, createHmac, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const AXE_SCRIPT = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const CREATE_ADMIN = fileURLToPath(new URL("../../api/scripts/create-admin.mjs", import.meta.url));
const MAILPIT = process.env.MAILPIT_URL?.replace(/\/$/, "");
const MAIL_LOGS = [process.env.API_LOG, ...(process.env.MAIL_LOG ?? "").split(",")].filter(Boolean);

let failures = 0;
let passed = 0;
function check(label, ok, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${label}${!ok && detail ? ` — ${typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 400)}` : ""}`);
  if (ok) passed += 1; else failures += 1;
}
const notRun = (label, why) => console.log(`… NON EXÉCUTÉ : ${label} (${why})`);
const RUN = randomUUID().replaceAll("-", "").slice(0, 10);
const mail = (tag) => `opf-${tag}-${RUN}@example.test`;
const PASSWORD = `phrase de passe ${RUN}`;
const sha = (b) => createHash("sha256").update(b).digest("hex");
const short = (x) => JSON.stringify(x)?.slice(0, 400);
const day = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
// Données synthétiques sans accent ni mot français : la passe anglaise relève les textes d'interface restés en français.
const SECRET_NOTE = `INTERNAL-NOTE-${RUN}`;
const SECRET_TEAM = `TEAM-THREAD-${RUN}`;
const ORG_NAME = `Northfield Studio ${RUN}`;
const PROJECT_NAME = `OPF ${RUN}`;

let pgClient = null;
if (process.env.DATABASE_URL) {
  const host = new URL(process.env.DATABASE_URL).hostname;
  if (!["localhost", "127.0.0.1", "::1"].includes(host)) throw new Error("DATABASE_URL doit désigner une base locale jetable");
  const pg = (await import("pg")).default;
  pgClient = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await pgClient.connect();
}

// ---------------------------------------------------------------------------------------------------------------------
// Courriels : liens d'invitation lus dans Mailpit (CI) ou dans le journal de l'API (transport console). La file part
// toutes les 5 s : on attend un lien qui n'a pas encore servi (un compte reçoit plusieurs invitations dans la recette).
// ---------------------------------------------------------------------------------------------------------------------
const usedLinks = new Set();
async function linksTo(to, path) {
  let texts = [];
  if (MAILPIT) {
    const list = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`).then((r) => r.json()).catch(() => null);
    for (const m of list?.messages ?? []) texts.push((await fetch(`${MAILPIT}/api/v1/message/${m.ID}`).then((r) => r.json()).catch(() => null))?.Text ?? "");
  }
  for (const file of MAIL_LOGS) {
    if (!existsSync(file)) continue;
    texts = texts.concat(readFileSync(file, "utf8").split("\n").filter((l) => l.includes(to)).map((l) => { try { return JSON.parse(l).text ?? ""; } catch { return ""; } }));
  }
  return texts.flatMap((t) => [...t.matchAll(/https?:\/\/\S+#jeton=[A-Za-z0-9_%-]+/g)].map((m) => m[0])).filter((l) => l.includes(path));
}
async function newLink(to, path = "/compte/invitation", rendered = null) {
  if (!MAILPIT && MAIL_LOGS.length === 0 && !rendered) throw new Error("MAILPIT_URL ou API_LOG requis pour lire les courriels de la recette");
  if (rendered && !usedLinks.has(rendered)) { usedLinks.add(rendered); return rendered; }
  for (let i = 0; i < 120; i++) {
    const fresh = (await linksTo(to, path)).find((l) => !usedLinks.has(l));
    if (fresh) { usedLinks.add(fresh); return fresh; }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`aucun nouveau lien ${path} pour ${to}`);
}
const tokenOf = (link) => decodeURIComponent(link.split("#jeton=")[1]);

// ---------------------------------------------------------------------------------------------------------------------
// Navigateur, comptes, accessibilité
// ---------------------------------------------------------------------------------------------------------------------
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined) });
const desktop = { viewport: { width: 1440, height: 900 } };
const phone = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };
const pageErrors = [];

async function account(tag, { register = true } = {}) {
  const ctx = await browser.newContext(desktop);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => pageErrors.push(`${tag}: ${e.message}`));
  const email = mail(tag);
  const call = async (method, path, data, raw = false) => {
    const r = await page.request[method](`${BASE}${path}`, { headers: { origin: BASE }, ...(data === undefined ? {} : { data }) });
    if (raw) return { status: r.status(), bytes: await r.body(), headers: r.headers() };
    return { status: r.status(), body: await r.json().catch(() => null), headers: r.headers() };
  };
  if (register) {
    const r = await call("post", "/auth/register", { email, password: PASSWORD });
    if (r.status !== 201) throw new Error(`inscription ${tag} : ${r.status}`);
  }
  const me = register ? (await call("get", "/auth/me")).body : null;
  return { tag, email, ctx, page, call, id: me?.id ?? me?.user?.id ?? null };
}

async function axe(page, nom) {
  await page.addScriptTag({ path: AXE_SCRIPT });
  const graves = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] } }))
    .violations.filter((v) => ["critical", "serious"].includes(v.impact)).map((v) => `${v.id} (${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")})`));
  check(`axe-core ${nom} : aucune violation critique ou sérieuse`, graves.length === 0, graves.join(", "));
}
const noHorizontalScroll = async (page, nom) => {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(`${nom} : aucun défilement horizontal`, over <= 1, `${over}px`);
};
/** Ouvre une page dans le contexte du compte (bureau ou téléphone), langue posée avant le chargement (D-163). */
async function open(who, path, { langue = "fr", viewport = desktop.viewport } = {}) {
  const page = await who.ctx.newPage();
  await page.setViewportSize(viewport);
  await page.addInitScript((l) => { try { localStorage.setItem("fadi.langue", l); } catch { /* stockage indisponible */ } }, langue);
  page.on("pageerror", (e) => pageErrors.push(`${who.tag}: ${e.message}`));
  await page.goto(`${BASE}${path}`);
  return page;
}

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

// Passe anglaise : relevé des textes d'interface (texte visible, title, aria-label, placeholder) restés en français.
const FR = /[éèêàùçœ«»]|\b(le|la|les|des|du|une|est|sont|pour|avec|aucun|aucune|sans|dans|sur|au|aux|et|ou|ce|cette|vos|votre|projet|paquet|constat|revue|historique)\b/i;
// (« organisation », « participants » : aussi de l'anglais britannique — non relevés.)
const residus = new Map();
async function releve(nom, page, racine = "body") {
  await page.waitForTimeout(700);
  const textes = await page.evaluate((sel) => {
    const out = [];
    const exclu = (n) => {
      for (let e = n.parentElement; e; e = e.parentElement) {
        if (e.getAttribute("translate") === "no" || ["SCRIPT", "STYLE", "TEXTAREA", "CODE", "PRE", "OPTION"].includes(e.tagName)) return true;
        const s = getComputedStyle(e);
        if (s.display === "none" || s.visibility === "hidden") return true;
      }
      return false;
    };
    for (const r of document.querySelectorAll(sel)) {
      const w = document.createTreeWalker(r, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        const t = (n.nodeValue ?? "").replace(/\s+/g, " ").trim();
        if (t.length >= 2 && /[A-Za-zÀ-ÿ]/.test(t) && !exclu(n)) out.push(t);
      }
      for (const el of r.querySelectorAll("[title],[aria-label],[placeholder]")) {
        if (el.closest('[translate="no"]')) continue;
        for (const a of ["title", "aria-label", "placeholder"]) { const v = el.getAttribute(a); if (v && /[A-Za-zÀ-ÿ]/.test(v)) out.push(v.trim()); }
      }
    }
    return out;
  }, racine);
  for (const t of textes) if (FR.test(t)) residus.set(t, nom);
}

const contexts = [];
try {
  // ===================================================================================================================
  // 1. Une organisation se crée ; ses membres adhèrent par invitation acceptée
  // ===================================================================================================================
  const alice = await account("alice");   // administratrice de l'organisation, propriétaire du projet
  const bob = await account("bob");       // membre — Concepteur du projet
  const dan = await account("dan");       // membre — Lecteur + Coordinateur (responsable du projet)
  const carol = await account("carol");   // membre — Lecteur + Concepteur d'une seule étude, échéance d'accès ; part ensuite
  const eli = await account("eli");       // Lecteur dont l'accès expire
  const rex = await account("rex");       // relecteur externe (compte existant, hors organisation)
  const fred = await account("fred");     // reçoit des liens transférés
  const admin = await account("admin");   // administrateur de la plateforme
  contexts.push(alice, bob, dan, carol, eli, rex, fred, admin);

  const creationKey = `opf-${RUN}`;
  const org = await alice.call("post", "/organizations", { name: ORG_NAME, kind: "Architecture firm", creationKey });
  check("organisation créée, la créatrice en est administratrice", org.status === 201 && org.body.organization.name === ORG_NAME, short(org.body));
  const orgId = org.body.organization.id;
  const orgReplay = await alice.call("post", "/organizations", { name: ORG_NAME, creationKey });
  check("création rejouée (même clé) : la même organisation, aucun doublon", orgReplay.status === 200 && orgReplay.body.organization.id === orgId && orgReplay.body.replayed === true);

  for (const who of [bob, dan, carol]) {
    const inv = await alice.call("post", `/organizations/${orgId}/invitations`, { email: who.email, role: "membre", jobTitle: "Architect" });
    check(`adhésion de ${who.tag} : invitation 202, aucune adhésion avant acceptation`, inv.status === 202 && inv.body.invitation.purpose === "organization_membership" && (await who.call("get", `/organizations/${orgId}`)).status === 404, short(inv.body));
    const token = tokenOf(await newLink(who.email, "/compte/invitation", inv.body.mail?.link ?? null));
    const look = await who.call("post", "/auth/invitations/lookup", { token });
    check(`adhésion de ${who.tag} : aperçu avant acceptation (organisation, rôle proposé)`, look.status === 200 && look.body.invitation.organizationName === ORG_NAME && look.body.invitation.organizationRole === "membre", short(look.body));
    if (who === bob) check("adhésion : lien transféré refusé (403 wrong_account), aucune adhésion", (await fred.call("post", "/auth/invitations/accept", { token })).body?.error === "wrong_account" && (await fred.call("get", `/organizations/${orgId}`)).status === 404);
    const acc = await who.call("post", "/auth/invitations/accept", { token });
    check(`adhésion de ${who.tag} : acceptée par l'identité visée, entrée dans l'organisation`, acc.status === 200 && acc.body.organizationId === orgId, short(acc.body));
  }
  const directory = await alice.call("get", `/organizations/${orgId}/directory`);
  check("annuaire interne : quatre membres actifs", directory.status === 200 && directory.body.members.length === 4, short(directory.body));
  check("externe : organisation et annuaire introuvables (404)", (await rex.call("get", `/organizations/${orgId}`)).status === 404 && (await rex.call("get", `/organizations/${orgId}/directory`)).status === 404);

  // ===================================================================================================================
  // 2. Un projet déclare son organisation propriétaire (aucun droit changé)
  // ===================================================================================================================
  const project = await alice.call("post", "/projects", { code: `OPF_${RUN.slice(0, 6)}`, name: PROJECT_NAME });
  check("projet créé par l'administratrice", project.status === 201, short(project.body));
  const pid = project.body.id;
  check("organisation enregistrée comme partie du projet", (await alice.call("put", `/organizations/${orgId}/projects/${pid}/participation`, {})).status === 201);
  const owner = await alice.call("put", `/organizations/${orgId}/projects/${pid}/owner`);
  check("partie propriétaire déclarée, aucun droit changé", owner.status === 200 && owner.body.accessChanged === false, short(owner.body));
  const header = await alice.call("get", `/projects/${pid}`);
  check("en-tête du projet : partie propriétaire = l'organisation", header.body?.owningOrganization?.id === orgId && header.body.owningOrganization.name === ORG_NAME, short(header.body?.owningOrganization));
  check("adhésion seule : le projet reste introuvable pour un membre (404)", (await bob.call("get", `/projects/${pid}`)).status === 404);

  // ===================================================================================================================
  // 3. L'équipe se forme : contacts, invitations acceptées avec aperçu, rôles par portée, échéance d'accès
  // ===================================================================================================================
  const P = `/projects/${pid}/participants`;
  const M = `/projects/${pid}/members`;
  const contact = await alice.call("post", `${P}/contacts`, { kind: "personne", displayName: `Structural engineer ${RUN}`, workEmail: mail("contact"), businessRole: "Structural engineer" });
  check("contact sans compte enregistré, sans aucun accès", contact.status === 201 && (await alice.call("get", P)).body?.participants?.some((p) => p.id === contact.body.id && p.status === "contact" && p.access === null), short(contact.body));

  const root = `/projects/${pid}/studio`;
  const s1 = await alice.call("post", `${root}/studies`, { name: "S1" });
  const s2 = await alice.call("post", `${root}/studies`, { name: "S2" });
  check("deux études Studio créées", s1.status === 201 && s2.status === 201);
  const studyId = s1.body.study.id, variantId = s1.body.variant.id;
  const variantPath = `${root}/studies/${studyId}/variants/${variantId}`;
  const variant2Path = `${root}/studies/${s2.body.study.id}/variants/${s2.body.variant.id}`;
  const pubs = `${root}/studies/${studyId}/publications`;
  let head = s1.body.revision.id;
  let head2 = s2.body.revision.id;
  const draw = async (who, path, base, id, x) => who.call("post", `${path}/commands`, { contractVersion: "studio-commands/1", requestId: `opf-${randomUUID()}`, baseRevisionId: base, commands: [{ toolId: "studio.dessin.ligne", params: { id, type: "line", start: { x: 0, y: 0 }, end: { x, y: 2 } } }] });

  // Aperçu de l'accès résultant avant l'envoi (rien n'est écrit), puis invitation et acceptation par l'identité visée.
  const carolBody = { email: carol.email, roles: [{ role: "lecteur" }, { role: "concepteur", scopeType: "etude", scopeId: studyId }], accessExpiresAt: day(60), invitationDays: 10 };
  const preview = await alice.call("post", `${M}/preview`, carolBody);
  const pv = preview.body?.preview;
  check("aperçu de l'accès : Lecteur du projet, portée étroite signalée, échéances indépendantes",
    preview.status === 200 && pv.accountExists === true && pv.access?.role === "lecteur" && pv.access.canExport === false && pv.narrowScopes?.length === 1
      && pv.accessExpiresAt?.startsWith(day(60)) && pv.invitationExpiresAt?.startsWith(day(10)) && !pv.blocking, short(pv));
  if (pgClient) check("aperçu : aucune invitation écrite", (await pgClient.query("SELECT count(*)::int AS c FROM auth.invitations WHERE project_id = $1", [pid])).rows[0].c === 0);
  else notRun("aperçu sans écriture relu en base", "DATABASE_URL absent");

  async function inviteAndAccept(who, body, label) {
    const inv = await alice.call("post", M, body);
    const sent = inv.status === 202 && inv.body.accountExists === true;
    check(`${label} : invitation envoyée (202, aucun ajout direct)`, sent, short(inv.body));
    check(`${label} : aucun accès avant acceptation (404)`, (await who.call("get", `/projects/${pid}`)).status === 404);
    const token = tokenOf(await newLink(who.email, "/compte/invitation", inv.body?.mail?.link ?? null));
    const look = await who.call("post", "/auth/invitations/lookup", { token });
    check(`${label} : le destinataire voit le projet et les rôles proposés avant d'accepter`, look.status === 200 && look.body.invitation.projectName?.includes(PROJECT_NAME) && look.body.invitation.roles?.length === body.roles.length, short(look.body));
    const acc = await who.call("post", "/auth/invitations/accept", { token });
    check(`${label} : acceptée, entrée dans le projet`, acc.status === 200 && acc.body.projectId === pid, short(acc.body));
    return { inv, token };
  }
  const carolInv = await inviteAndAccept(carol, carolBody, "Carol (Lecteur + Concepteur de l'étude S1)");
  check("lien de Carol transféré après acceptation : inopérant pour un autre compte", [403, 409].includes((await fred.call("post", "/auth/invitations/accept", { token: carolInv.token })).status) && (await fred.call("get", `/projects/${pid}`)).status === 404);
  await inviteAndAccept(bob, { email: bob.email, roles: [{ role: "concepteur" }] }, "Bob (Concepteur)");
  await inviteAndAccept(dan, { email: dan.email, roles: [{ role: "lecteur" }, { role: "coordinateur" }] }, "Dan (Lecteur + Coordinateur)");
  await inviteAndAccept(eli, { email: eli.email, roles: [{ role: "lecteur" }], accessExpiresAt: day(30) }, "Eli (Lecteur, accès borné)");

  // Portée étroite : Carol modifie S1 seulement.
  const carolDraw = await draw(carol, variantPath, head, "c1", 3);
  check("portée étroite : Carol (Concepteur de S1) modifie S1", carolDraw.status === 200, short(carolDraw.body));
  if (carolDraw.status === 200) head = carolDraw.body.revision.id;
  check("portée étroite : Carol ne modifie pas S2 (403)", (await draw(carol, variant2Path, head2, "c2", 3)).status === 403);
  const members = (await alice.call("get", M)).body?.members ?? [];
  check("échéance d'accès recopiée sur le membre", members.find((m) => m.userId === carol.id)?.accessExpiresAt?.startsWith(day(60)) && members.find((m) => m.userId === eli.id)?.accessExpiresAt?.startsWith(day(30)), short(members));
  if (pgClient) {
    await pgClient.query("UPDATE project_participations pp SET access_expires_at = now() - interval '1 minute' FROM people pe WHERE pe.id = pp.person_id AND pe.user_id = $1 AND pp.project_id = $2 AND pp.status = 'active'", [eli.id, pid]);
    check("échéance d'accès dépassée : 404 à la requête suivante, membre marqué expiré", (await eli.call("get", `/projects/${pid}`)).status === 404 && (await alice.call("get", M)).body?.members?.find((m) => m.userId === eli.id)?.accessExpired === true);
  } else notRun("échéance d'accès dépassée", "DATABASE_URL absent");

  const participants = (await alice.call("get", P)).body?.participants ?? [];
  const partOf = (who) => participants.find((p) => p.person?.account?.userId === who.id && p.status !== "terminee");
  check("annuaire : rôles par portée (Carol : Lecteur + Concepteur étude S1 ; Dan : Coordinateur)",
    partOf(carol)?.roles?.some((r) => r.role === "concepteur" && r.scopeType === "etude" && r.scopeId === studyId) && partOf(dan)?.roles?.some((r) => r.role === "coordinateur" && r.scopeType === "projet"), short(partOf(carol)?.roles));
  check("responsabilités d'équipe déclarées (Bob produit, Dan coordonne)", (await alice.call("patch", `${P}/${partOf(bob)?.id}`, { responsibilities: ["produire"] })).status === 200
    && (await alice.call("patch", `${P}/${partOf(dan)?.id}`, { responsibilities: ["coordonner"] })).status === 200);
  const team = await dan.call("get", `${P}/team`);
  check("vue Équipe : les participations qui portent une responsabilité", team.status === 200 && [bob, dan].every((w) => team.body.team.some((t) => t.person?.account?.userId === w.id)), short(team.body));
  const danView = await dan.call("get", P);
  check("Dan (Coordinateur) est responsable du projet ; Bob (Concepteur) ne l'est pas", danView.body?.you?.responsible === true && (await bob.call("get", P)).body?.you?.responsible === false);

  // ===================================================================================================================
  // 4. Un participant externe revoit un paquet identifié, sans voir le reste du projet
  // ===================================================================================================================
  for (const [id, x] of [["l1", 4], ["l2", 5], ["l3", 6]]) {
    const r = await draw(alice, variantPath, head, id, x);
    if (r.status === 200) head = r.body.revision.id;
  }
  const R03 = head;
  const pub = await alice.call("post", `${variantPath}/publications`, { title: "Dossier R03" });
  check("publication Studio candidate préparée sur R03", pub.status === 201 && pub.body.revisionId === R03, short(pub.body));
  const pubId = pub.body.id;
  check("publication soumise dans Studio (en revue)", (await alice.call("post", `${pubs}/${pubId}/soumettre`, {})).body?.workStatus === "en-revue");
  check("fil réservé à l'équipe écrit", (await alice.call("post", `${variantPath}/comments`, { body: SECRET_TEAM })).status === 201);

  const R = `/projects/${pid}/reviews`;
  const created = await alice.call("post", R, { publicationId: pubId, purpose: "Check R03 against the brief", expectedResponse: "Findings or satisfactory review", questions: ["Are dimensions complete?"], dueOn: "2099-12-31", requestId: `opf-${RUN}` });
  check("paquet de revue créé en brouillon", created.status === 201 && created.body.package.status === "brouillon", short(created.body));
  const p1 = created.body.package.id;
  check("note interne consignée", (await alice.call("post", `${R}/${p1}/notes`, { body: SECRET_NOTE })).status === 201);
  const rprev = await alice.call("post", `${R}/${p1}/assignments/preview`, { email: rex.email, responsibility: "relecture" });
  check("aperçu du destinataire : paquet seul, aucun accès au projet ni adhésion, consulter + commenter",
    rprev.status === 200 && rprev.body.preview.projectAccess === "aucun" && rprev.body.preview.organizationMembership === "aucune" && rprev.body.preview.permitted.includes("commenter") && !rprev.body.preview.permitted.includes("approuver"), short(rprev.body));
  const aRex = await alice.call("post", `${R}/${p1}/assignments`, { email: rex.email, displayName: "Rex", responsibility: "relecture" });
  const anaEmail = mail("ana");
  const aAna = await alice.call("post", `${R}/${p1}/assignments`, { email: anaEmail, displayName: "Ana", responsibility: "approbation", permissions: { download: true, export: true } });
  check("destinataires nommés : relecteur et approbatrice externes", aRex.status === 201 && aAna.status === 201, short([aRex.body, aAna.body]));
  const shared = await alice.call("post", `${R}/${p1}/share`);
  check("partage : paquet figé (fichiers = manifeste de la publication), deux invitations", shared.status === 200 && shared.body.invitations.length === 2
    && shared.body.files.every((f) => pub.body.manifest.documents.some((d) => d.format === f.format && d.sha256 === f.sha256)), short(shared.body));
  check("paquet partagé : identité figée (409)", (await alice.call("patch", `${R}/${p1}`, { title: "Other" })).status === 409);

  const rexLink = await newLink(rex.email, "/compte/invitation", shared.body.invitations.find((i) => i.assignmentId === aRex.body.assignmentId)?.link ?? null);
  const rexLook = await fred.call("post", "/auth/invitations/lookup", { token: tokenOf(rexLink) });
  check("invitation de revue : finalité review_package, paquet nommé", rexLook.body?.invitation?.purpose === "review_package" && rexLook.body.invitation.reviewPackage?.id === p1, short(rexLook.body));
  check("lien de revue transféré : refusé (403 wrong_account), rien d'activé", (await fred.call("post", "/auth/invitations/accept", { token: tokenOf(rexLink) })).body?.error === "wrong_account" && (await fred.call("get", "/reviews")).body?.reviews?.length === 0);
  const rexAcc = await rex.call("post", "/auth/invitations/accept", { token: tokenOf(rexLink) });
  check("relecteur : acceptation, entrée dans le paquet (aucun projet)", rexAcc.status === 200 && rexAcc.body.reviewPackageId === p1 && rexAcc.body.projectId === null, short(rexAcc.body));
  const anaLink = await newLink(anaEmail, "/compte/invitation", shared.body.invitations.find((i) => i.assignmentId === aAna.body.assignmentId)?.link ?? null);
  const ana = await account("ana", { register: false });
  contexts.push(ana);
  const anaAct = await ana.call("post", "/auth/activate", { token: tokenOf(anaLink), password: PASSWORD, acceptTerms: true, displayName: "Ana" });
  check("approbatrice : compte créé depuis l'invitation, entrée dans le paquet", anaAct.status === 201 && anaAct.body.reviewPackageId === p1, short(anaAct.body));

  // Échantillon de routes du projet : 404 pour le destinataire externe (rien n'est révélé).
  for (const path of [`/projects/${pid}`, `/projects/${pid}/steps`, `${root}/studies`, `${variantPath}/comments`, `${pubs}/${pubId}`, `${pubs}/${pubId}/files/svg`,
    `/projects/${pid}/documents`, `/projects/${pid}/members`, P, `/projects/${pid}/journal`, `/projects/${pid}/archive`, R, `${R}/${p1}`]) {
    const r = await rex.call("get", path);
    check(`externe : ${path.replace(pid, ":p").replace(studyId, ":s").replace(variantId, ":v").replace(pubId, ":pub").replace(p1, ":pkg")} → 404`, r.status === 404, String(r.status));
  }
  check("externe : aucun projet listé, aucune adhésion", !JSON.stringify((await rex.call("get", "/projects")).body ?? []).includes(pid) && ((await rex.call("get", "/organizations")).body?.memberships ?? []).length === 0);
  const view1 = await rex.call("get", `/reviews/${p1}`);
  check("espace de revue : identité, objet, échéance, révision R03, actions de relecture", view1.status === 200 && view1.body.package.revisionId === R03 && view1.body.package.dueOn === "2099-12-31"
    && view1.body.me.actions.includes("commenter") && !view1.body.me.actions.includes("approuver"), short(view1.body));
  check("notes internes et fil de l'équipe jamais servis", !JSON.stringify(view1.body).includes(SECRET_NOTE) && !JSON.stringify(view1.body).includes(SECRET_TEAM));
  const svgFile = shared.body.files.find((f) => f.format === "svg");
  const svg = await rex.call("get", `/reviews/${p1}/files/svg`, undefined, true);
  check("document figé consulté : empreinte conforme au manifeste", svg.status === 200 && sha(svg.bytes) === svgFile.sha256);
  check("téléchargement non accordé au relecteur : 403", (await rex.call("get", `/reviews/${p1}/files/pdf?download=1`)).status === 403);

  // ===================================================================================================================
  // 5. Boucle de correction : constat sur la révision exacte, correction, nouvelle version, recontrôle, approbation
  // ===================================================================================================================
  const f1 = await rex.call("post", `/reviews/${p1}/findings`, { body: "Missing dimension on l3", document: "svg", objectIds: ["l3"], location: "sheet 1" });
  check("constat rattaché au document, à l'objet et à la révision R03", f1.status === 201 && f1.body.revisionId === R03 && f1.body.document.sha256 === svgFile.sha256, short(f1.body));
  const f1id = f1.body.id;
  const r4 = await draw(alice, variantPath, head, "l4", 7);
  if (r4.status === 200) head = r4.body.revision.id;
  const R04 = head;
  check("R04 avance pendant la revue ; le paquet sert toujours R03", r4.status === 200 && (await rex.call("get", `/reviews/${p1}`)).body.package.revisionId === R03);
  check("équipe : réponse dans le fil du constat", (await alice.call("post", `${R}/${p1}/findings/${f1id}/replies`, { body: "Fixed in R04" })).status === 201);
  const corrected = await alice.call("post", `${variantPath}/observations/${f1id}/transitions`, { action: "corriger", revisionId: R04, note: "Dimension added" });
  check("équipe : constat déclaré corrigé sur R04 (transition Studio)", corrected.status === 200 && corrected.body.statut === "corrigee", short(corrected.body));
  check("recontrôle refusé sur R03 : la correction n'est pas dans le paquet (409)", (await rex.call("post", `/reviews/${p1}/findings/${f1id}/recheck`, { outcome: "levee" })).body?.error === "correction_not_in_package");
  check("approbation de R03 refusée : la source a changé (409)", (await ana.call("post", `/reviews/${p1}/approve`, { manifestHash: pub.body.manifestHash })).status === 409);
  check("Studio : publication actualisée sur R04 puis soumise", (await alice.call("post", `${pubs}/${pubId}/actualiser`, {})).status === 200 && (await alice.call("post", `${pubs}/${pubId}/soumettre`, {})).status === 200);
  const v2 = await alice.call("post", `${R}/${p1}/versions`, { dueOn: "2099-12-31" });
  check("nouvelle version du paquet (v2) qui remplace la v1", v2.status === 201 && v2.body.version === 2, short(v2.body));
  const p2 = v2.body.id;
  const share2 = await alice.call("post", `${R}/${p2}/share`);
  check("v2 partagée : identités vérifiées reconduites sans nouvelle invitation", share2.status === 200 && share2.body.invitations.length === 0, short(share2.body));
  const v2view = await rex.call("get", `/reviews/${p2}`);
  check("v2 : R04, désigne la v1, constat d'origine conservé (version 1, R03)", v2view.body?.package?.revisionId === R04 && v2view.body.package.supersedes?.id === p1
    && v2view.body.findings.some((f) => f.id === f1id && f.packageVersion === 1 && f.revisionId === R03), short(v2view.body));
  check("v1 remplacée : consultation seule", (await rex.call("get", `/reviews/${p1}`)).body?.package?.status === "remplace");
  const recheck = await rex.call("post", `/reviews/${p2}/findings/${f1id}/recheck`, { outcome: "levee", note: "Present in R04" });
  check("recontrôle sur la v2 : constat recontrôlé", recheck.status === 200 && recheck.body.statut === "recontrolee", short(recheck.body));
  const resp = await rex.call("post", `/reviews/${p2}/response`, { result: "satisfaisante", note: "Satisfactory for the stated scope" });
  check("relecteur : revue satisfaisante pour la portée, sans valoir approbation", resp.status === 200 && (await alice.call("get", `${pubs}/${pubId}`)).body?.workStatus === "en-revue");
  check("relecteur : approbation refusée (403, aucune affectation d'approbation)", (await rex.call("post", `/reviews/${p2}/approve`, { manifestHash: v2view.body.package.manifestHash })).status === 403);
  const approve = await ana.call("post", `/reviews/${p2}/approve`, { manifestHash: v2view.body.package.manifestHash, comment: "Approved for release" });
  check("approbatrice externe nommée : approbation par la transition Studio", approve.status === 200, short(approve.body));
  const approved = await alice.call("get", `${pubs}/${pubId}`);
  check("Studio : publication approuvée sur le manifeste exact du paquet v2, par l'approbatrice", approved.body?.workStatus === "approuve" && approved.body.approval?.manifestHash === v2view.body.package.manifestHash && approved.body.approval?.by?.email === anaEmail, short(approved.body?.approval));

  // ===================================================================================================================
  // 6. La diffusion reste une action de l'équipe
  // ===================================================================================================================
  check("aucune diffusion par la revue : publication non diffusée", approved.body?.diffusionStatus === "non-diffuse");
  check("diffusion refusée au relecteur et à l'approbatrice externes (404)", (await rex.call("post", `${pubs}/${pubId}/diffuser`, {})).status === 404 && (await ana.call("post", `${pubs}/${pubId}/diffuser`, {})).status === 404);
  check("diffusion refusée à un Concepteur sans rôle Diffuseur (403)", (await bob.call("post", `${pubs}/${pubId}/diffuser`, {})).status === 403);
  const diffused = await alice.call("post", `${pubs}/${pubId}/diffuser`, { comment: "Separate release" });
  check("diffusion séparée par l'équipe", diffused.status === 200 && diffused.body.diffusionStatus === "diffuse", short(diffused.body));
  check("dossier diffusé conforme au paquet approuvé (empreintes et manifeste)", diffused.body?.diffusion?.manifestHash === v2view.body.package.manifestHash
    && diffused.body.diffusion.files.every((f) => share2.body.files.some((g) => g.format === f.format && g.sha256 === f.sha256)));

  // ===================================================================================================================
  // 7. Une participation se termine : accès retiré à la requête suivante
  // ===================================================================================================================
  const carolPart = partOf(carol);
  check("Carol lit encore le projet avant la fin", (await carol.call("get", `/projects/${pid}`)).status === 200);
  const impact = await alice.call("get", `${P}/${carolPart?.id}/impact?change=terminer`);
  check("aperçu des conséquences de la fin : accès retiré, rôles listés", impact.status === 200 && impact.body.accessWithdrawn === true && impact.body.roles?.length >= 2, short(impact.body));
  const ended = await alice.call("post", `${P}/${carolPart?.id}/status`, { change: "terminer" });
  check("participation de Carol terminée", ended.status === 200 && ended.body.status === "terminee", short(ended.body));
  check("accès retiré à la requête suivante : projet, étude, commandes (404)", (await carol.call("get", `/projects/${pid}`)).status === 404 && (await carol.call("get", `${root}/studies`)).status === 404
    && (await draw(carol, variantPath, head, "c3", 2)).status === 404);
  check("l'adhésion de Carol à l'organisation reste intacte (membership ≠ participation)", (await carol.call("get", `/organizations/${orgId}`)).status === 200);
  check("historique : l'ancienne participation reste, terminée et datée", ((await alice.call("get", P)).body?.participants ?? []).some((p) => p.id === carolPart?.id && p.status === "terminee" && p.endsOn));

  // ===================================================================================================================
  // 8. Le journal montre chaque étape à la bonne audience, sans adresse en clair
  // ===================================================================================================================
  const journal = await dan.call("get", `/projects/${pid}/journal?limit=100`);
  const jActions = new Set((journal.body?.entries ?? []).map((e) => e.action));
  const expectedProject = ["invitation.created", "invitation.accepted", "participation.created", "participation.status_changed", "person.contact_created", "review.package.shared", "review.finding.created", "review.decision.recorded"];
  check("responsable du projet (Coordinateur) : historique de la participation et de la revue", journal.status === 200 && expectedProject.every((a) => jActions.has(a)), `${journal.status} manquantes : ${expectedProject.filter((a) => !jActions.has(a)).join(",")}`);
  check("historique du projet : jamais d'adresse IP", (journal.body?.entries ?? []).every((e) => !("ip" in e)));
  const bobJ = await bob.call("get", `/projects/${pid}/journal`);
  check("non-responsable (Concepteur) : 403 responsable-requis", bobJ.status === 403 && bobJ.body?.motif === "responsable-requis", short(bobJ.body));
  check("externe et participante terminée : historique introuvable (404)", (await rex.call("get", `/projects/${pid}/journal`)).status === 404 && (await carol.call("get", `/projects/${pid}/journal`)).status === 404);

  const rexHist = await rex.call("get", "/auth/me/history?limit=100");
  const rexText = JSON.stringify(rexHist.body ?? {});
  check("Mon historique (externe) : ses propres actes de revue", rexHist.status === 200 && ["review.finding.created"].every((a) => (rexHist.body?.entries ?? []).some((e) => e.action === a)), short(rexHist.body));
  check("Mon historique (externe) : ni les actes de l'équipe, ni leurs adresses, ni note interne",
    (rexHist.body?.entries ?? []).every((e) => e.actor?.kind !== "autre" || !e.actor?.email) && !rexText.includes(alice.email) && !rexText.includes(anaEmail) && !rexText.includes(SECRET_NOTE)
      && !(rexHist.body?.entries ?? []).some((e) => ["participation.status_changed", "review.decision.recorded", "invitation.created"].includes(e.action)), short(rexHist.body));
  check("Mon historique : jamais d'adresse IP", (rexHist.body?.entries ?? []).every((e) => !("ip" in e)));
  check("journal d'administration : 404 pour un utilisateur", (await alice.call("get", "/admin/audit")).status === 404);

  let adminReady = false;
  if (pgClient) {
    execFileSync(process.execPath, [CREATE_ADMIN, admin.email], { env: { ...process.env, DATABASE_URL: process.env.CREATE_ADMIN_DATABASE_URL ?? process.env.DATABASE_URL }, encoding: "utf8" });
    const login = await admin.call("post", "/auth/login", { email: admin.email, password: PASSWORD });
    const setup = await admin.call("post", "/auth/me/mfa/setup");
    const enabled = await admin.call("post", "/auth/me/mfa/enable", { code: totp(setup.body?.secret ?? "") });
    adminReady = login.status === 200 && enabled.status === 200;
    check("administrateur promu, double authentification activée depuis sa session (UM-18)", adminReady, `${login.status} ${setup.status} ${enabled.status}`);
  } else notRun("journal d'administration", "DATABASE_URL absent (promotion par create-admin.mjs)");
  if (adminReady) {
    const aProj = await admin.call("get", `/admin/audit?targetId=${pid}&limit=100`);
    const aActions = new Set((aProj.body?.entries ?? []).map((e) => e.action));
    check("administrateur : toutes les étapes du projet (participation, revue, décision)", aProj.status === 200 && ["participation.status_changed", "review.package.shared", "review.decision.recorded", "project.member.added"].every((a) => aActions.has(a)), [...aActions].join(","));
    const aOrg = await admin.call("get", `/admin/audit?targetId=${orgId}&limit=100`);
    check("administrateur : la création de l'organisation et ses adhésions", aOrg.status === 200 && (aOrg.body?.entries ?? []).some((e) => e.action === "organization.created") && (aOrg.body?.entries ?? []).some((e) => e.action.startsWith("organization.member")), (aOrg.body?.entries ?? []).map((e) => e.action).join(","));
    check("administrateur : export du journal déclaré indisponible (UM-20)", aProj.body?.export?.available === false);
  }
  if (pgClient) {
    const rows = await pgClient.query(`SELECT action, metadata::text AS m FROM admin.audit_log
      WHERE target_id = ANY($1::text[]) OR metadata->>'projectId' = $2 OR metadata->>'organizationId' = $3`, [[pid, orgId], pid, orgId]);
    const leaks = rows.rows.filter((r) => r.m?.includes("@"));
    check(`journal relu en base (${rows.rowCount} entrées du projet et de l'organisation) : aucune adresse en clair dans les métadonnées`, rows.rowCount > 20 && leaks.length === 0, leaks.slice(0, 3).map((r) => r.action).join(","));
  } else notRun("journal relu en base", "DATABASE_URL absent");

  // ===================================================================================================================
  // 9. Navigateur : écrans clés, bureau puis téléphone ; passe anglaise
  // ===================================================================================================================
  for (const [nom, viewport] of [["bureau", desktop.viewport], ["téléphone", phone.viewport]]) {
    const tel = nom === "téléphone";
    const o = await open(alice, `/organisations/${orgId}`, { viewport });
    await o.waitForSelector('[role="tablist"]');
    await o.locator("#org-tab-membres").click();
    await o.waitForSelector("#org-panel-membres");
    check(`organisation (${nom}) : onglet Membres affiché`, (await o.locator("#org-panel-membres").count()) === 1);
    await axe(o, `espace d'organisation — Membres (${nom})`);
    if (tel) await noHorizontalScroll(o, "espace d'organisation (téléphone)");
    await o.close();

    const c = await open(alice, `/projets/${pid}?module=collaboration`, { viewport });
    await c.waitForSelector("[data-participants] table", { timeout: 30000 });
    await c.waitForSelector("[data-revues-externes]", { timeout: 30000 });
    await c.waitForSelector("[data-historique-projet] [data-journal-table]", { timeout: 30000 });
    check(`Collaboration (${nom}) : participants, organisations du projet, revues externes et historique`,
      (await c.locator(`[data-organisations-projet] [data-partie-proprietaire="${orgId}"]`).count()) === 1 && (await c.locator(`[data-revue-equipe="${p2}"]`).count()) === 1
        && (await c.locator('[data-historique-projet] [data-journal-entry="participation.status_changed"]').count()) >= 1);
    await axe(c, `Collaboration — équipe, revues, historique (${nom})`);
    if (tel) await noHorizontalScroll(c, "Collaboration (téléphone)");
    await c.close();

    const d = await open(dan, `/projets/${pid}?module=collaboration`, { viewport });
    await d.waitForSelector("[data-historique-projet] [data-journal-table]", { timeout: 30000 });
    check(`Collaboration (${nom}) : le Coordinateur voit l'historique du projet`, (await d.locator("[data-historique-projet] [data-journal-entry]").count()) > 0);
    await d.close();
    const b = await open(bob, `/projets/${pid}?module=collaboration`, { viewport });
    await b.waitForSelector("[data-participants]", { timeout: 30000 });
    await b.waitForLoadState("networkidle").catch(() => undefined);
    check(`Collaboration (${nom}) : aucune section Historique pour un non-responsable`, (await b.locator("[data-historique-projet]").count()) === 0);
    await b.close();

    const rv = await open(rex, `/revues/${p2}`, { viewport });
    await rv.waitForSelector("[data-revue-paquet]");
    check(`espace de revue (${nom}) : objet, échéance, statut, documents et constat`, (await rv.locator("[data-revue-objet]").count()) === 1 && (await rv.locator("[data-revue-statut]").count()) === 1
      && (await rv.locator("[data-revue-document]").count()) >= 1 && (await rv.locator(`[data-constat="${f1id}"]`).count()) === 1);
    check(`espace de revue (${nom}) : aucune note interne`, !(await rv.content()).includes(SECRET_NOTE));
    await axe(rv, `espace de revue externe (${nom})`);
    if (tel) await noHorizontalScroll(rv, "espace de revue (téléphone)");
    await rv.close();

    const h = await open(rex, "/parametres", { viewport });
    await h.locator("[data-account-history] [data-journal-table]").waitFor({ timeout: 30000 });
    check(`Mon historique (${nom}) : constat du relecteur listé`, (await h.locator('[data-account-history] [data-journal-entry="review.finding.created"]').count()) >= 1);
    await axe(h, `Mon compte — Mon historique (${nom})`);
    if (tel) await noHorizontalScroll(h, "Mon compte (téléphone)");
    await h.close();

    if (adminReady) {
      const a = await open(admin, "/admin/journal", { viewport });
      await a.locator("[data-admin-journal] [data-journal-table]").waitFor({ timeout: 30000 });
      check(`journal d'administration (${nom}) : entrées affichées`, (await a.locator("[data-journal-entry]").count()) > 0);
      await axe(a, `administration — journal d'activité (${nom})`);
      await a.close();
    }
  }

  // Passe anglaise (D-163) : mêmes écrans, textes d'interface relevés.
  const enOrg = await open(alice, `/organisations/${orgId}`, { langue: "en" });
  await enOrg.waitForSelector('[role="tablist"]');
  check("anglais : html lang=en", (await enOrg.evaluate(() => document.documentElement.lang)) === "en");
  for (const id of ["fiche", "membres", "projets"]) {
    await enOrg.locator(`#org-tab-${id}`).click();
    await enOrg.waitForSelector(`#org-panel-${id}`);
    await releve(`organisation — ${id}`, enOrg, `#org-panel-${id}`);
  }
  await enOrg.close();
  const enCol = await open(alice, `/projets/${pid}?module=collaboration`, { langue: "en" });
  await enCol.waitForSelector("[data-revues-externes]", { timeout: 30000 });
  await enCol.waitForSelector("[data-historique-projet] [data-journal-table]", { timeout: 30000 });
  await releve("Collaboration — organisations du projet, revues externes", enCol, "[data-organisations-projet], [data-revues-externes]");
  const enHist = await enCol.locator("[data-historique-projet]").innerText();
  check("anglais : historique du projet traduit (« History », « Invitation sent »)", /History/.test(enHist) && enHist.includes("Invitation sent") && !enHist.includes("Invitation envoyée"), enHist.slice(0, 200));
  await enCol.close();
  const enRev = await open(rex, `/revues/${p2}`, { langue: "en" });
  await enRev.waitForSelector("[data-revue-paquet]");
  await releve("espace de revue", enRev, "[data-revue-paquet]");
  await enRev.close();
  const enMe = await open(rex, "/parametres", { langue: "en" });
  await enMe.locator("[data-account-history] [data-journal-table]").waitFor({ timeout: 30000 });
  const enMeText = await enMe.locator("[data-account-history]").innerText();
  check("anglais : « My history » traduit", enMeText.includes("My history") && !enMeText.includes("Mon historique"), enMeText.slice(0, 200));
  await enMe.close();
  if (adminReady) {
    const enAdm = await open(admin, "/admin/journal", { langue: "en" });
    await enAdm.locator("[data-admin-journal] [data-journal-table]").waitFor({ timeout: 30000 });
    check("anglais : journal d'administration traduit", (await enAdm.locator("[data-admin-journal]").innerText()).includes("Administration — activity log"));
    await enAdm.close();
  }
  if (process.env.OUT) {
    mkdirSync(process.env.OUT, { recursive: true });
    writeFileSync(`${process.env.OUT}/residus-organisations-participation-final.txt`, [...residus.entries()].map(([t, n]) => `[${n}] ${t}`).join("\n") + "\n");
  }
  check("passe anglaise : aucun texte d'interface resté en français", residus.size === 0, [...residus.entries()].slice(0, 15).map(([t, n]) => `[${n}] ${t}`).join(" | "));
  check("aucune erreur JavaScript dans les pages", pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
} catch (e) {
  failures += 1;
  console.log(`✗ exception : ${e?.stack ?? e}`);
} finally {
  for (const c of contexts) await c.ctx.close().catch(() => undefined);
  await browser.close();
  if (pgClient) await pgClient.end();
}
console.log(failures ? `\n${failures} contrôle(s) en échec (${passed} réussis)` : `\nRecette finale organisations-participation : tout est vert (${passed} contrôles)`);
process.exit(failures ? 1 : 0);
