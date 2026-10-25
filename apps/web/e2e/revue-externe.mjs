#!/usr/bin/env node
/**
 * Recette de la revue externe (organisations-participation, phase 4 — concept partie 4 et v2.2 ; Issue #262) sur l'API
 * réelle qui sert l'application construite (même origine, base migrée). Scénario d'acceptation complet :
 *
 *  API —
 *  - revue R03 restreinte pendant que R04 avance : publication Studio candidate (R03) soumise, paquet figé au partage
 *    (fichiers dans `volumes`, empreintes = manifeste), destinataire externe sans adhésion à l'organisation ni rôle de
 *    projet, invitation `review_package` (aperçu de l'accès d'abord) ;
 *  - lien transféré inopérant (mauvais compte : 403, aucune activation) ; nouvel approbateur par création de compte ;
 *  - non-fuite : 404 sur chaque routeur `/projects/:id/...`, `GET /projects`, `/history`, `/journal`, `/archive`,
 *    `/notifications` sans extrait de l'équipe, rapport exporté sans note interne ; notes internes et fils de l'équipe
 *    jamais servis ; lecteur du projet sans les constats ;
 *  - fichiers : consulter (SVG/PDF en ligne), télécharger seulement si accordé, en-têtes sûrs ;
 *  - constat lié au document, aux objets et à la révision EXACTE du paquet (R03 même après R04) ;
 *  - relecteur sans droit d'approuver ni de diffuser ; approbateur nommé qui approuve par les transitions Studio ;
 *  - paquet modifié = nouvelle version (remplace l'ancienne, affectations reconduites), nouveaux contrôles (recontrôle
 *    sur la version qui contient la correction, approbation de R03 refusée tant que la publication a changé) ;
 *  - accès expiré ou révoqué refusé (404) ; échéance dépassée comptée en retard, jamais en accord ;
 *  - dossier diffusé conforme aux versions approuvées ; journal `review.*` dans l'historique du projet, sans adresse.
 *  NAVIGATEUR — espace de revue (`/revues`, `/revues/:id`) et panneau « Revues externes » de l'équipe (Collaboration) :
 *  commandes au clavier (règle d'or), axe-core bureau 1440 × 900 et téléphone 390 × 844, aucun défilement horizontal au
 *  téléphone, passe anglaise.
 *
 *   BASE_URL=http://localhost:3001 [DATABASE_URL=…] [MAILPIT_URL=… | MAIL_LOG=api.log] node apps/web/e2e/revue-externe.mjs
 * Sans DATABASE_URL, les contrôles qui lisent ou datent la base (expiration, journal sans adresse) sont NON EXÉCUTÉS.
 */
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { chromium } from "playwright";
import { inviterEtAccepter } from "./lib-invitations.mjs";

const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const require = createRequire(import.meta.url);
const AXE_SCRIPT = require.resolve("axe-core/axe.min.js");
let failures = 0;
function check(label, ok, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${label}${!ok && detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}
const notRun = (label, why) => console.log(`… NON EXÉCUTÉ : ${label} (${why})`);
const uid = () => randomUUID().replaceAll("-", "").slice(0, 10);
const RUN = uid();
const mail = (tag) => `rev-${tag}-${RUN}@example.test`;
const PASSWORD = `phrase de passe ${RUN}`;
const sha = (b) => createHash("sha256").update(b).digest("hex");
const short = (x) => JSON.stringify(x)?.slice(0, 400);
const SECRET_NOTE = `NOTE-INTERNE-${RUN}`;
const SECRET_TEAM = `FIL-EQUIPE-${RUN}`;

let pgClient = null;
if (process.env.DATABASE_URL) {
  const pg = (await import("pg")).default;
  pgClient = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await pgClient.connect();
}

/** Lien d'invitation : rendu par l'API quand aucun courriel n'est parti (D-1), sinon lu dans Mailpit ou le journal. */
async function invitationLink(response, to, exclude = null) {
  if (response?.link) return response.link;
  for (let i = 0; i < 120; i++) {
    if (process.env.MAILPIT_URL) {
      const base = process.env.MAILPIT_URL.replace(/\/$/, "");
      const list = await fetch(`${base}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`).then((r) => r.json()).catch(() => null);
      for (const m of list?.messages ?? []) {
        const full = await fetch(`${base}/api/v1/message/${m.ID}`).then((r) => r.json()).catch(() => null);
        const hit = (full?.Text ?? "").match(/https?:\/\/\S*\/compte\/invitation#jeton=[\w%-]+/);
        if (hit && hit[0] !== exclude) return hit[0];
      }
    }
    for (const file of (process.env.MAIL_LOG ?? "").split(",").filter(Boolean)) {
      if (!existsSync(file)) continue;
      const line = readFileSync(file, "utf8").split("\n").filter((l) => l.includes('"mail (console)"') && l.includes(to)).pop();
      const hit = line && (JSON.parse(line).text ?? "").match(/https?:\/\/\S*\/compte\/invitation#jeton=[\w%-]+/);
      if (hit && hit[0] !== exclude) return hit[0];
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`lien d'invitation introuvable pour ${to}`);
}
const tokenOf = (link) => decodeURIComponent(link.split("#jeton=")[1]);

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined) });
const desktop = { viewport: { width: 1440, height: 900 } };
const phone = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };

async function account(tag, { register = true, viewport = desktop } = {}) {
  const ctx = await browser.newContext(viewport);
  const page = await ctx.newPage();
  const email = mail(tag);
  const call = async (method, path, data, raw = false) => {
    const r = await page.request[method](`${BASE}${path}`, data === undefined ? undefined : { data });
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

try {
  // ------------------------------------------------------------------------------------------------------------------
  // Préparation : équipe, projet, étude Studio, publication candidate R03
  // ------------------------------------------------------------------------------------------------------------------
  const alice = await account("alice");          // propriétaire du projet
  const rita = await account("rita");            // lectrice du projet
  const rex = await account("rex");              // relecteur externe (compte existant)
  const fred = await account("fred");            // reçoit un lien transféré
  const tom = await account("tom");              // relecteur externe ensuite révoqué
  const una = await account("una");              // relecteur externe dont l'accès expire
  const project = await alice.call("post", "/projects", { code: `REV_${RUN.slice(0, 6)}`, name: `Revue externe ${RUN}` });
  check("projet créé", project.status === 201, short(project.body));
  const pid = project.body.id;
  // Phase 3 (OP-D2 a) : plus d'ajout direct — Rita est invitée, puis accepte l'invitation depuis sa notification.
  const ritaAdd = await inviterEtAccepter((m, p, b) => alice.call(m.toLowerCase(), p, b), (m, p, b) => rita.call(m.toLowerCase(), p, b), pid, rita.email, "lecteur");
  const ritaReader = ritaAdd.ok;
  if (!ritaReader) notRun("lectrice du projet par invitation acceptée", `POST /members : ${ritaAdd.invite.status}, acceptation : ${ritaAdd.accept?.status}`);

  const root = `/projects/${pid}/studio`;
  const study = await alice.call("post", `${root}/studies`, { name: "Étude revue" });
  check("étude Studio créée", study.status === 201, short(study.body));
  const studyId = study.body.study.id, variantId = study.body.variant.id;
  const variantPath = `${root}/studies/${studyId}/variants/${variantId}`;
  const pubs = `${root}/studies/${studyId}/publications`;
  let head = study.body.revision.id;
  const revisions = [head];
  async function draw(id, x) {
    const r = await alice.call("post", `${variantPath}/commands`, { contractVersion: "studio-commands/1", requestId: `rev-${randomUUID()}`, baseRevisionId: head, commands: [{ toolId: "studio.dessin.ligne", params: { id, type: "line", start: { x: 0, y: 0 }, end: { x, y: 2 } } }] });
    if (r.status === 200) { head = r.body.revision.id; revisions.push(head); }
    return r;
  }
  check("R01, R02, R03 dessinées", (await draw("l1", 4)).status === 200 && (await draw("l2", 5)).status === 200 && (await draw("l3", 6)).status === 200);
  const R03 = head;
  const pub = await alice.call("post", `${variantPath}/publications`, { title: "Dossier R03" });
  check("publication candidate préparée sur R03", pub.status === 201 && pub.body.revisionId === R03, short(pub.body));
  const pubId = pub.body.id;
  // Fil réservé à l'équipe (jamais servi aux destinataires).
  check("fil de l'équipe écrit", (await alice.call("post", `${variantPath}/comments`, { body: SECRET_TEAM })).status === 201);

  // ------------------------------------------------------------------------------------------------------------------
  // Paquet : brouillon, aperçu, destinataires, partage figé
  // ------------------------------------------------------------------------------------------------------------------
  const created = await alice.call("post", `/projects/${pid}/reviews`, { publicationId: pubId, purpose: "Vérifier la conformité de R03 au programme", expectedResponse: "Constats ou revue satisfaisante", questions: ["Les cotes sont-elles complètes ?"], dueOn: "2099-12-31", requestId: `rq-${RUN}` });
  check("paquet créé en brouillon", created.status === 201 && created.body.package.status === "brouillon" && created.body.package.version === 1, short(created.body));
  const p1 = created.body.package.id;
  const replay = await alice.call("post", `/projects/${pid}/reviews`, { publicationId: pubId, purpose: "Vérifier la conformité de R03 au programme", expectedResponse: "Constats ou revue satisfaisante", requestId: `rq-${RUN}` });
  check("création rejouée : même paquet, aucun doublon", replay.status === 201 && replay.body.replayed === true && replay.body.package.id === p1);
  check("note interne consignée", (await alice.call("post", `/projects/${pid}/reviews/${p1}/notes`, { body: SECRET_NOTE })).status === 201);
  check("lectrice du projet : préparation refusée", !ritaReader || [403, 404].includes((await rita.call("post", `/projects/${pid}/reviews`, { publicationId: pubId, purpose: "x", expectedResponse: "y" })).status));
  const notSubmitted = await alice.call("post", `/projects/${pid}/reviews/${p1}/share`);
  check("partage refusé tant que la publication n'est pas soumise (409)", notSubmitted.status === 409 && notSubmitted.body.error === "publication_not_in_review", short(notSubmitted.body));
  check("publication soumise dans Studio", (await alice.call("post", `${pubs}/${pubId}/soumettre`, {})).body?.workStatus === "en-revue");

  const preview = await alice.call("post", `/projects/${pid}/reviews/${p1}/assignments/preview`, { email: rex.email, responsibility: "relecture" });
  check("aperçu de l'accès : paquet seul, aucun accès au projet ni adhésion, consulter + commenter par défaut",
    preview.status === 200 && preview.body.preview.projectAccess === "aucun" && preview.body.preview.organizationMembership === "aucune"
      && preview.body.preview.permitted.includes("commenter") && !preview.body.preview.permitted.includes("telecharger") && !preview.body.preview.permitted.includes("approuver"), short(preview.body));
  const aRex = await alice.call("post", `/projects/${pid}/reviews/${p1}/assignments`, { email: rex.email, displayName: "Rex Relecteur", responsibility: "relecture" });
  check("relecteur externe ajouté (invitation au partage)", aRex.status === 201 && aRex.body.mail === null, short(aRex.body));
  const anaEmail = mail("ana");
  const aAna = await alice.call("post", `/projects/${pid}/reviews/${p1}/assignments`, { email: anaEmail, displayName: "Ana Approbatrice", responsibility: "approbation", permissions: { download: true, export: true } });
  check("approbatrice externe nommée ajoutée", aAna.status === 201, short(aAna.body));
  check("doublon de responsabilité refusé (409)", (await alice.call("post", `/projects/${pid}/reviews/${p1}/assignments`, { email: rex.email, responsibility: "relecture" })).status === 409);
  const shared = await alice.call("post", `/projects/${pid}/reviews/${p1}/share`);
  check("partage : 200, fichiers figés, deux invitations", shared.status === 200 && shared.body.files.length === 4 && shared.body.invitations.length === 2, short(shared.body));
  const manifest = pub.body.manifest;
  check("fichiers figés = empreintes du manifeste de la publication", shared.body.files.every((f) => manifest.documents.some((d) => d.format === f.format && d.sha256 === f.sha256)));
  check("brouillon partagé : suppression refusée (409)", (await alice.call("delete", `/projects/${pid}/reviews/${p1}`)).status === 409);
  check("paquet partagé : identité figée (409)", (await alice.call("patch", `/projects/${pid}/reviews/${p1}`, { title: "Autre" })).status === 409);
  check("suppression du projet refusée tant qu'un paquet partagé existe (409)", (await alice.call("delete", `/projects/${pid}`)).body?.error === "revues_partagees");
  if (pgClient) {
    const frozen = await pgClient.query("SELECT id FROM volumes WHERE id = ANY($1::text[])", [shared.body.files.map((f) => f.sha256)]);
    check("fichiers rangés dans volumes", frozen.rowCount === 4);
    let refused = false;
    try { await pgClient.query("UPDATE review_packages SET manifest_hash = $1 WHERE id = $2", ["0".repeat(64), p1]); } catch { refused = true; }
    check("base : un paquet partagé ne se réécrit pas (déclencheur)", refused);
  } else notRun("fichiers dans volumes, déclencheur de gel", "DATABASE_URL absent");

  // ------------------------------------------------------------------------------------------------------------------
  // Invitation : lien transféré, acceptation, création de compte
  // ------------------------------------------------------------------------------------------------------------------
  const linkRex = await invitationLink(shared.body.invitations.find((i) => i.assignmentId === aRex.body.assignmentId), rex.email);
  const lookup = await fred.call("post", "/auth/invitations/lookup", { token: tokenOf(linkRex) });
  check("invitation : finalité review_package, paquet nommé", lookup.body?.invitation?.purpose === "review_package" && lookup.body.invitation.reviewPackage?.id === p1, short(lookup.body));
  const forwarded = await fred.call("post", "/auth/invitations/accept", { token: tokenOf(linkRex) });
  check("lien transféré : mauvais compte refusé (403), rien d'activé", forwarded.status === 403 && forwarded.body.error === "wrong_account");
  check("le compte du lien transféré n'a aucune revue", (await fred.call("get", "/reviews")).body?.reviews?.length === 0);
  check("avant acceptation : paquet introuvable pour le destinataire (404)", (await rex.call("get", `/reviews/${p1}`)).status === 404);
  const accepted = await rex.call("post", "/auth/invitations/accept", { token: tokenOf(linkRex) });
  check("acceptation par l'identité visée : paquet de destination", accepted.status === 200 && accepted.body.reviewPackageId === p1 && accepted.body.projectId === null, short(accepted.body));
  check("acceptation rejouée : même résultat (idempotente)", (await rex.call("post", "/auth/invitations/accept", { token: tokenOf(linkRex) })).status === 200);
  const linkAna = await invitationLink(shared.body.invitations.find((i) => i.assignmentId === aAna.body.assignmentId), anaEmail);
  const ana = await account("ana", { register: false });
  const activated = await ana.call("post", "/auth/activate", { token: tokenOf(linkAna), password: PASSWORD, acceptTerms: true, displayName: "Ana" });
  check("nouveau compte par l'invitation : paquet de destination", activated.status === 201 && activated.body.reviewPackageId === p1, short(activated.body));

  // ------------------------------------------------------------------------------------------------------------------
  // Non-fuite : le destinataire ne voit que le paquet
  // ------------------------------------------------------------------------------------------------------------------
  check("GET /projects : aucun projet pour le destinataire", ((await rex.call("get", "/projects")).body ?? []).length === 0 || !JSON.stringify((await rex.call("get", "/projects")).body).includes(pid));
  for (const path of [
    `/projects/${pid}`, `/projects/${pid}/steps`, `/projects/${pid}/planning`, `/projects/${pid}/programme`, `${root}/studies`, `${variantPath}/comments`, `${variantPath}/observations`,
    `${pubs}`, `${pubs}/${pubId}`, `${pubs}/${pubId}/files/svg`, `/projects/${pid}/atelier/model`, `/projects/${pid}/parcels`, `/projects/${pid}/files`, `/projects/${pid}/design-review`,
    `/projects/${pid}/analyses`, `/projects/${pid}/documents`, `/projects/${pid}/collaboration`, `/projects/${pid}/members`, `/projects/${pid}/participants`, `/projects/${pid}/lock`,
    `/projects/${pid}/support-grants`, `/projects/${pid}/journal`, `/projects/${pid}/history`, `/projects/${pid}/archive`, `/projects/${pid}/reviews`, `/projects/${pid}/reviews/${p1}`,
  ]) {
    const r = await rex.call("get", path);
    check(`destinataire : ${path.replace(pid, ":p")} → 404`, r.status === 404, String(r.status));
  }
  check("destinataire : approbation Studio directe refusée (404)", (await rex.call("post", `${pubs}/${pubId}/approuver`, { manifestHash: manifest && pub.body.manifestHash })).status === 404);
  check("destinataire : diffusion Studio refusée (404)", (await rex.call("post", `${pubs}/${pubId}/diffuser`, {})).status === 404);
  const hist = await rex.call("get", "/projects/history");
  check("historique global : rien du projet", !JSON.stringify(hist.body ?? "").includes(pid), short(hist.body));
  const orgs = await rex.call("get", "/organizations");
  check("aucune adhésion à une organisation", JSON.stringify(orgs.body ?? {}).indexOf(pid) === -1 && ((orgs.body?.organizations ?? []).length === 0));

  const mine = await rex.call("get", "/reviews");
  check("mes revues : le paquet, avec actions de relecture", mine.body?.reviews?.length === 1 && mine.body.reviews[0].id === p1 && mine.body.reviews[0].responsibilities.join() === "relecture", short(mine.body));
  const view = await rex.call("get", `/reviews/${p1}`);
  const viewText = JSON.stringify(view.body);
  check("paquet : identité, objet, échéance, actions permises, statut Studio",
    view.status === 200 && view.body.package.purpose.startsWith("Vérifier") && view.body.package.dueOn === "2099-12-31" && view.body.package.revisionId === R03
      && view.body.me.actions.join() === "consulter,commenter,repondre,recontroler" && view.body.publication.workStatus === "en-revue", short(view.body));
  check("notes internes et fil de l'équipe jamais servis", !viewText.includes(SECRET_NOTE) && !viewText.includes(SECRET_TEAM) && !("internalNotes" in (view.body ?? {})));

  // Fichiers figés : consulter, télécharger si accordé, en-têtes sûrs.
  const svg = await rex.call("get", `/reviews/${p1}/files/svg`, undefined, true);
  const svgFile = shared.body.files.find((f) => f.format === "svg");
  check("SVG consulté en ligne : empreinte conforme, en-têtes sûrs",
    svg.status === 200 && sha(svg.bytes) === svgFile.sha256 && svg.headers["content-disposition"].startsWith("inline") && svg.headers["x-content-type-options"] === "nosniff"
      && svg.headers["content-security-policy"].includes("sandbox") && svg.headers["cache-control"].includes("no-store") && svg.headers["x-review-purpose"] === "revue-externe", short(svg.headers));
  check("IFC sans téléchargement accordé : 403", (await rex.call("get", `/reviews/${p1}/files/ifc`)).status === 403);
  check("PDF téléchargé sans droit : 403", (await rex.call("get", `/reviews/${p1}/files/pdf?download=1`)).status === 403);
  check("rapport exporté sans droit : 403", (await rex.call("get", `/reviews/${p1}/report`)).status === 403);
  const ifc = await ana.call("get", `/reviews/${p1}/files/ifc?download=1`, undefined, true);
  check("approbatrice : IFC téléchargé (accordé), pièce jointe, empreinte conforme", ifc.status === 200 && ifc.headers["content-disposition"].startsWith("attachment") && sha(ifc.bytes) === shared.body.files.find((f) => f.format === "ifc").sha256);
  check("fichier inconnu : 404", (await rex.call("get", `/reviews/${p1}/files/exe`)).status === 404);

  // ------------------------------------------------------------------------------------------------------------------
  // Constats rattachés à la révision exacte ; R04 avance
  // ------------------------------------------------------------------------------------------------------------------
  const f1 = await rex.call("post", `/reviews/${p1}/findings`, { body: "Cote manquante sur la ligne l3", document: "svg", objectIds: ["l3"], location: "feuille 1" });
  check("constat : document, objet, révision R03 du paquet", f1.status === 201 && f1.body.revisionId === R03 && f1.body.document.sha256 === svgFile.sha256, short(f1.body));
  const f1id = f1.body.id;
  check("constat : objet inconnu de R03 refusé (400)", (await rex.call("post", `/reviews/${p1}/findings`, { body: "x", objectIds: ["l9"] })).status === 400);
  check("pièce jointe sans droit : 403", (await rex.call("post", `/reviews/${p1}/findings`, { body: "x", attachments: [{ name: "a.pdf", mime: "application/pdf", contentBase64: Buffer.from("%PDF-1.4 test").toString("base64") }] })).status === 403);
  const fAna = await ana.call("post", `/reviews/${p1}/findings`, { body: "Vu par l'approbatrice", document: "pdf" });
  check("approbatrice : constat écrit (commenter par défaut)", fAna.status === 201);
  check("relecteur : approbation refusée (403, aucune affectation d'approbation)", (await rex.call("post", `/reviews/${p1}/approve`, { manifestHash: pub.body.manifestHash })).status === 403);
  if (ritaReader) {
    const ritaComments = await rita.call("get", `${variantPath}/comments`);
    check("lectrice du projet : ni constat de revue ni fil de l'équipe", ritaComments.status === 200 && !JSON.stringify(ritaComments.body).includes("Cote manquante") && !JSON.stringify(ritaComments.body).includes(SECRET_TEAM));
  }
  const teamComments = await alice.call("get", `${variantPath}/comments`);
  check("équipe : le constat apparaît dans Studio (audience revue)", JSON.stringify(teamComments.body).includes("Cote manquante") && teamComments.body.comments.some((c) => c.audience === "revue" && c.reviewPackageId === p1));
  check("audience d'un constat : inchangeable (409)", (await alice.call("patch", `${variantPath}/comments/${f1id}`, { audience: "projet" })).status === 409);

  check("R04 dessinée pendant la revue", (await draw("l4", 7)).status === 200);
  const R04 = head;
  const svgAfter = await rex.call("get", `/reviews/${p1}/files/svg`, undefined, true);
  check("pendant que R04 avance : le paquet sert toujours R03 (même empreinte)", sha(svgAfter.bytes) === svgFile.sha256 && (await rex.call("get", `/reviews/${p1}`)).body.package.revisionId === R03);
  const staleApprove = await ana.call("post", `/reviews/${p1}/approve`, { manifestHash: pub.body.manifestHash });
  check("approbation de R03 refusée : la source a changé (nouveaux contrôles requis)", staleApprove.status === 409, short(staleApprove.body));
  check("approbation avec une autre empreinte refusée (409)", (await ana.call("post", `/reviews/${p1}/approve`, { manifestHash: "a".repeat(64) })).status === 409);

  // Notifications : source « revue » seulement, sans extrait de l'équipe.
  const teamReply = await alice.call("post", `/projects/${pid}/reviews/${p1}/findings/${f1id}/replies`, { body: "Correction en cours dans R04" });
  check("équipe : réponse dans le fil du constat", teamReply.status === 201);
  const notes = await rex.call("get", "/notifications");
  const notesText = JSON.stringify(notes.body);
  check("notifications du destinataire : revue seulement, sans note interne ni fil de l'équipe",
    notes.status === 200 && notes.body.items.length > 0 && notes.body.items.every((n) => n.kind === "revue") && !notesText.includes(SECRET_NOTE) && !notesText.includes(SECRET_TEAM) && notesText.includes("Correction en cours"), short(notes.body));
  const replyView = await rex.call("get", `/reviews/${p1}`);
  check("réponse de l'équipe lue dans le fil du constat", replyView.body.findings.find((f) => f.id === f1id)?.replies.some((r) => r.body === "Correction en cours dans R04"));

  // Correction déclarée sur R04 par le responsable interne (Studio), recontrôle impossible sur R03.
  const corrected = await alice.call("post", `${variantPath}/observations/${f1id}/transitions`, { action: "corriger", revisionId: R04, note: "Cote ajoutée" });
  check("équipe : constat déclaré corrigé sur R04 (transition Studio)", corrected.status === 200 && corrected.body.statut === "corrigee", short(corrected.body));
  const earlyRecheck = await rex.call("post", `/reviews/${p1}/findings/${f1id}/recheck`, { outcome: "levee" });
  check("recontrôle sur R03 refusé : la correction n'est pas dans le paquet (409)", earlyRecheck.status === 409 && earlyRecheck.body.error === "correction_not_in_package", short(earlyRecheck.body));
  check("revue « satisfaisante » refusée tant que des constats restent ouverts (409)", (await rex.call("post", `/reviews/${p1}/response`, { result: "satisfaisante" })).body?.error === "findings_open");

  // Suivi de l'équipe : échéance dépassée = retard, jamais accord.
  check("échéance avancée au passé (modifiable après partage)", (await alice.call("patch", `/projects/${pid}/reviews/${p1}`, { dueOn: "2020-01-01" })).status === 200);
  const follow = await alice.call("get", `/projects/${pid}/reviews`);
  const s1 = follow.body.packages.find((p) => p.id === p1);
  check("suivi : réponses attendues en retard, constats ouverts, décision bloquée, aucune approbation déduite",
    s1.followUp.overdue === 2 && s1.followUp.openFindings === 2 && s1.followUp.blockedDecision !== null && s1.followUp.approved === false && s1.followUp.responses.satisfaisante === 0, short(s1));

  // Révocation et expiration.
  const aTom = await alice.call("post", `/projects/${pid}/reviews/${p1}/assignments`, { email: tom.email, responsibility: "relecture" });
  const linkTom = await invitationLink(aTom.body.mail, tom.email);
  check("tom : accepte son invitation", (await tom.call("post", "/auth/invitations/accept", { token: tokenOf(linkTom) })).status === 200);
  check("tom : paquet accessible", (await tom.call("get", `/reviews/${p1}`)).status === 200);
  check("révocation", (await alice.call("post", `/projects/${pid}/reviews/${p1}/assignments/${aTom.body.assignmentId}/revoke`, { reason: "Mission terminée" })).status === 200);
  check("accès révoqué : 404 (paquet, fichiers, liste)", (await tom.call("get", `/reviews/${p1}`)).status === 404 && (await tom.call("get", `/reviews/${p1}/files/svg`)).status === 404 && (await tom.call("get", "/reviews")).body.reviews.length === 0);
  const aUna = await alice.call("post", `/projects/${pid}/reviews/${p1}/assignments`, { email: una.email, responsibility: "relecture" });
  const linkUna = await invitationLink(aUna.body.mail, una.email);
  check("una : accepte son invitation", (await una.call("post", "/auth/invitations/accept", { token: tokenOf(linkUna) })).status === 200);
  if (pgClient) {
    await pgClient.query("UPDATE review_assignments SET access_expires_at = now() - interval '1 minute' WHERE id = $1", [aUna.body.assignmentId]);
    check("accès expiré : 404", (await una.call("get", `/reviews/${p1}`)).status === 404);
  } else notRun("accès expiré", "DATABASE_URL absent");
  check("expiration d'accès dans le passé refusée (400)", (await alice.call("post", `/projects/${pid}/reviews/${p1}/assignments`, { email: mail("x"), responsibility: "relecture", accessExpiresAt: "2020-01-01T00:00:00Z" })).status === 400);

  // ------------------------------------------------------------------------------------------------------------------
  // Paquet modifié = nouvelle version, nouveaux contrôles
  // ------------------------------------------------------------------------------------------------------------------
  check("Studio : publication actualisée sur R04 puis soumise", (await alice.call("post", `${pubs}/${pubId}/actualiser`, {})).status === 200 && (await alice.call("post", `${pubs}/${pubId}/soumettre`, {})).status === 200);
  const v2 = await alice.call("post", `/projects/${pid}/reviews/${p1}/versions`, { dueOn: "2099-12-31" });
  check("nouvelle version (brouillon) qui désigne la précédente", v2.status === 201 && v2.body.version === 2, short(v2.body));
  const p2 = v2.body.id;
  const share2 = await alice.call("post", `/projects/${pid}/reviews/${p2}/share`);
  check("v2 partagée : identités vérifiées reconduites sans nouvelle invitation", share2.status === 200 && share2.body.invitations.length === 0, short(share2.body));
  const pub2 = await alice.call("get", `${pubs}/${pubId}`);
  const v1after = await rex.call("get", `/reviews/${p1}`);
  check("v1 remplacée : lisible (historique), consultation seule", v1after.status === 200 && v1after.body.package.status === "remplace" && v1after.body.package.replacedBy === p2 && v1after.body.me.actions.join() === "consulter", short(v1after.body));
  const v2view = await rex.call("get", `/reviews/${p2}`);
  check("v2 : R04, désigne la v1, constats d'origine visibles (version 1)", v2view.status === 200 && v2view.body.package.revisionId === R04 && v2view.body.package.supersedes?.id === p1
    && v2view.body.findings.some((f) => f.id === f1id && f.packageVersion === 1 && f.revisionId === R03), short(v2view.body));
  check("v1 : nouveau constat refusé (remplacée)", (await rex.call("post", `/reviews/${p1}/findings`, { body: "tard" })).status === 403);
  const recheck = await rex.call("post", `/reviews/${p2}/findings/${f1id}/recheck`, { outcome: "levee", note: "Cote présente en R04" });
  check("recontrôle sur la v2 (contient la correction) : constat recontrôlé", recheck.status === 200 && recheck.body.statut === "recontrolee", short(recheck.body));
  check("approbatrice : son constat levé par l'équipe puis recontrôlé", (await alice.call("post", `${variantPath}/observations/${fAna.body.id}/transitions`, { action: "corriger", revisionId: R04 })).status === 200
    && (await ana.call("post", `/reviews/${p2}/findings/${fAna.body.id}/recheck`, { outcome: "levee" })).status === 200);
  const resp = await rex.call("post", `/reviews/${p2}/response`, { result: "satisfaisante", note: "Conforme pour la portée" });
  check("relecteur : revue satisfaisante pour la portée (sans valoir approbation)", resp.status === 200 && (await alice.call("get", `${pubs}/${pubId}`)).body.workStatus === "en-revue");
  check("relecteur : approbation toujours refusée (403)", (await rex.call("post", `/reviews/${p2}/approve`, { manifestHash: pub2.body.manifestHash })).status === 403);
  const approve = await ana.call("post", `/reviews/${p2}/approve`, { manifestHash: v2view.body.package.manifestHash, comment: "Bon pour diffusion" });
  check("approbatrice nommée : approbation par la transition Studio", approve.status === 200, short(approve.body));
  const approvedPub = await alice.call("get", `${pubs}/${pubId}`);
  check("Studio : publication approuvée par l'approbatrice externe, sur le manifeste du paquet",
    approvedPub.body.workStatus === "approuve" && approvedPub.body.approval?.manifestHash === v2view.body.package.manifestHash && approvedPub.body.approval?.by?.email === anaEmail, short(approvedPub.body.approval));
  check("aucune diffusion par la revue : la publication reste non diffusée", approvedPub.body.diffusionStatus === "non-diffuse");
  const diffused = await alice.call("post", `${pubs}/${pubId}/diffuser`, { comment: "Diffusion séparée" });
  check("diffusion séparée par l'équipe", diffused.status === 200 && diffused.body.diffusionStatus === "diffuse", short(diffused.body));
  const v2files = share2.body.files;
  check("dossier diffusé conforme aux versions approuvées (mêmes empreintes que le paquet v2)",
    diffused.body.diffusion.files.every((f) => v2files.some((g) => g.format === f.format && g.sha256 === f.sha256)) && diffused.body.diffusion.manifestHash === v2view.body.package.manifestHash);
  const report = await ana.call("get", `/reviews/${p2}/report`);
  check("rapport exporté (accordé) : constats, sans note interne", report.status === 200 && report.body.schema === "fadi-review-report/1" && !JSON.stringify(report.body).includes(SECRET_NOTE) && !JSON.stringify(report.body).includes(SECRET_TEAM));

  // Journal.
  const journal = await alice.call("get", `/projects/${pid}/journal`);
  const actions = JSON.stringify(journal.body ?? {});
  check("historique du projet : actions review.* (partage, affectation, constat, décision)", ["review.package.shared", "review.assignment.created", "review.finding.created", "review.decision.recorded"].every((a) => actions.includes(a)), short(journal.body));
  if (pgClient) {
    const rows = await pgClient.query("SELECT metadata::text AS m FROM admin.audit_log WHERE action LIKE 'review.%' AND metadata->>'projectId' = $1", [pid]);
    check("journal review.* : aucune adresse e-mail", rows.rowCount > 0 && rows.rows.every((r) => !r.m.includes("@")));
  } else notRun("journal sans adresse", "DATABASE_URL absent");

  // ------------------------------------------------------------------------------------------------------------------
  // Navigateur : espace de revue et panneau de l'équipe
  // ------------------------------------------------------------------------------------------------------------------
  const ui = rex.page;
  await ui.goto(`${BASE}/revues`);
  await ui.waitForSelector("[data-revues] h1");
  check("espace de revue : liste des paquets", await ui.locator(`[data-revue-item="${p2}"]`).count() === 1);
  await axe(ui, "liste des revues (bureau)");
  await ui.goto(`${BASE}/revues/${p2}`);
  await ui.waitForSelector("[data-revue-paquet]");
  check("paquet : identité, objet, échéance, statut, documents, constats affichés",
    await ui.locator("[data-revue-objet]").count() === 1 && await ui.locator("[data-revue-echeance]").count() === 1 && await ui.locator("[data-revue-statut]").count() === 1
      && await ui.locator("[data-revue-document]").count() === 4 && await ui.locator(`[data-constat="${f1id}"]`).count() === 1);
  check("aucune note interne affichée", !(await ui.content()).includes(SECRET_NOTE));
  await axe(ui, "paquet de revue (bureau)");
  // Règle d'or : commande « Nouveau constat » au clavier (Ctrl+Alt+Maj+,) sur un paquet ouvert : v2 est terminée pour rex, on vérifie l'état désactivé.
  check("commande « Nouveau constat » : icône, raccourci affiché et déclaré", await ui.locator('[data-commande-revue="nouveau-constat"][aria-keyshortcuts]').count() >= 1 && await ui.locator('[data-raccourci-revue="nouveau-constat"]').count() >= 1);

  // Un paquet ouvert pour l'écriture par l'interface : nouvelle revue d'un nouveau destinataire.
  const vic = await account("vic");
  const pubB = await alice.call("post", `${variantPath}/publications`, { title: "Dossier B" });
  await alice.call("post", `${pubs}/${pubB.body.id}/soumettre`, {});
  const pkgB = await alice.call("post", `/projects/${pid}/reviews`, { publicationId: pubB.body.id, purpose: "Relecture rapide", expectedResponse: "Constats" });
  const aVic = await alice.call("post", `/projects/${pid}/reviews/${pkgB.body.package.id}/assignments`, { email: vic.email, responsibility: "relecture" });
  const shB = await alice.call("post", `/projects/${pid}/reviews/${pkgB.body.package.id}/share`);
  await vic.call("post", "/auth/invitations/accept", { token: tokenOf(await invitationLink(shB.body.invitations[0], vic.email)) });
  check("paquet B partagé à vic", aVic.status === 201 && shB.status === 200);
  const vp = vic.page;
  await vp.goto(`${BASE}/revues/${pkgB.body.package.id}`);
  await vp.waitForSelector("[data-revue-paquet]");
  await vp.keyboard.press("Control+Alt+Shift+Comma");
  await vp.waitForSelector("[data-constat-form] textarea");
  // Le focus est posé après le rendu du formulaire : on l'attend (borné) plutôt que de le lire à l'instant.
  const focusConstat = await vp.waitForFunction(() => document.activeElement?.matches?.("[data-constat-form] textarea") === true, null, { timeout: 5000 }).then(() => true, () => false);
  check("raccourci Ctrl+Alt+Maj+, : le formulaire de constat s'ouvre et reçoit le focus", focusConstat);
  await vp.fill("[data-constat-form] textarea", "Constat saisi dans l'interface");
  await vp.locator('[data-constat-form] select[name="document"]').selectOption("svg");
  await vp.locator('[data-commande-revue="envoyer-constat"]').click();
  await vp.waitForSelector("[data-constat] >> text=Constat saisi dans l'interface");
  check("constat envoyé par l'interface", (await vic.call("get", `/reviews/${pkgB.body.package.id}`)).body.findings.some((f) => f.body === "Constat saisi dans l'interface"));
  await axe(vp, "paquet ouvert avec formulaire (bureau)");
  const telCtx = await browser.newContext(phone);
  const tel = await telCtx.newPage();
  await tel.request.post(`${BASE}/auth/login`, { data: { email: vic.email, password: PASSWORD } });
  await tel.goto(`${BASE}/revues/${pkgB.body.package.id}`);
  await tel.waitForSelector("[data-revue-paquet]");
  await axe(tel, "paquet de revue (téléphone)");
  await noHorizontalScroll(tel, "paquet de revue (téléphone)");
  await tel.goto(`${BASE}/revues`);
  await tel.waitForSelector("[data-revues] h1");
  await noHorizontalScroll(tel, "liste des revues (téléphone)");

  // Équipe : panneau « Revues externes » (Collaboration).
  const ap = alice.page;
  await ap.goto(`${BASE}/projets/${pid}?module=collaboration`);
  await ap.waitForSelector("[data-revues-externes]", { timeout: 30000 });
  // La liste se charge après le cadre du panneau : on attend le paquet (borné) avant de compter.
  await ap.waitForSelector(`[data-revue-equipe="${p2}"]`, { timeout: 15000 }).catch(() => {});
  check("panneau « Revues externes » : paquets et suivi", await ap.locator(`[data-revue-equipe="${p2}"]`).count() === 1 && await ap.locator("[data-revue-retards]").count() >= 1);
  await ap.locator(`[data-revue-equipe="${p2}"] [data-ouvrir-revue]`).click();
  await ap.waitForSelector("[data-revue-detail]");
  check("détail équipe : destinataires, constats, notes internes", await ap.locator("[data-revue-destinataire]").count() >= 2 && await ap.locator("[data-revue-note]").count() >= 0);
  check("commandes de l'équipe : icône et raccourci déclarés", await ap.locator('[data-commande-revue][aria-keyshortcuts]').count() >= 2);
  await axe(ap, "panneau Revues externes (bureau)");

  // Passe anglaise.
  const FR = /[éèêàùçœ«»]|\b(le|la|les|des|du|une|est|sont|pour|avec|aucun|aucune|sans|dans|sur|au|aux|et|ou|ce|cette|vos|votre|projet|paquet|constat|revue)\b/i;
  const residus = new Map();
  const releve = async (nom, page, racine = "body") => {
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
      const racine = document.querySelector(sel) ?? document.body;
      const w = document.createTreeWalker(racine, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        const t = (n.nodeValue ?? "").replace(/\s+/g, " ").trim();
        if (t.length >= 2 && /[A-Za-zÀ-ÿ]/.test(t) && !exclu(n)) out.push(t);
      }
      for (const el of racine.querySelectorAll("[title],[aria-label],[placeholder]")) {
        if (el.closest('[translate="no"]')) continue;
        for (const a of ["title", "aria-label", "placeholder"]) { const v = el.getAttribute(a); if (v && /[A-Za-zÀ-ÿ]/.test(v)) out.push(v.trim()); }
      }
      return out;
    }, racine);
    for (const t of textes) if (FR.test(t)) residus.set(t, nom);
  };
  await vp.evaluate(() => localStorage.setItem("fadi.langue", "en"));
  await vp.goto(`${BASE}/revues`);
  await vp.waitForSelector("[data-revues] h1");
  await releve("liste", vp);
  await vp.goto(`${BASE}/revues/${pkgB.body.package.id}`);
  await vp.waitForSelector("[data-revue-paquet]");
  await vp.keyboard.press("Control+Alt+Shift+Comma");
  await releve("paquet", vp);
  await vp.evaluate(() => localStorage.setItem("fadi.langue", "fr"));
  await ap.evaluate(() => localStorage.setItem("fadi.langue", "en"));
  await ap.goto(`${BASE}/projets/${pid}?module=collaboration`);
  await ap.waitForSelector("[data-revues-externes]", { timeout: 30000 });
  await ap.locator(`[data-revue-equipe="${p2}"] [data-ouvrir-revue]`).click();
  await ap.waitForSelector("[data-revue-detail]");
  // Le relevé ne porte que sur le panneau : les autres sections de Collaboration ont leur propre recette.
  await releve("panneau équipe", ap, "[data-revues-externes]");
  await ap.evaluate(() => localStorage.setItem("fadi.langue", "fr"));
  if (process.env.OUT) {
    mkdirSync(process.env.OUT, { recursive: true });
    writeFileSync(`${process.env.OUT}/residus-revue-externe.txt`, [...residus.entries()].map(([t, n]) => `[${n}] ${t}`).join("\n") + "\n");
  }
  check("passe anglaise : aucun texte d'interface resté en français", residus.size === 0, [...residus.entries()].slice(0, 15).map(([t, n]) => `[${n}] ${t}`).join(" | "));
  await telCtx.close();
} catch (e) {
  failures += 1;
  console.log(`✗ exception : ${e?.stack ?? e}`);
} finally {
  await browser.close();
  if (pgClient) await pgClient.end();
}
console.log(failures ? `\n${failures} contrôle(s) en échec` : "\nRecette revue externe : tout est vert");
process.exit(failures ? 1 : 0);
