#!/usr/bin/env node
/**
 * Recette de l'espace d'organisation (organisations, phase 5 — concept partie 5 ; Issue #262) sur l'API réelle qui sert
 * l'application construite (même origine, base migrée) :
 *
 *  API —
 *  - création rejouable (clé de création : une organisation), créateur administrateur ;
 *  - invitation `organization_membership` : compte existant et nouveau compte, mauvais compte refusé, lien renouvelé
 *    (l'ancien ne vaut plus rien), acceptation idempotente, invitant revalidé à l'acceptation ;
 *  - annuaire interne distinct : adresses réservées aux administrateurs, 404 pour un non-membre (participant de projet
 *    compris) et pour l'administrateur de la plateforme (aucun droit par son seul rôle) ;
 *  - groupes et adhésion sans droit de projet (le projet reste 404 pour le membre) ;
 *  - organisation partie au projet, partie propriétaire déclarée sans changement de droits ;
 *  - mandat proposé, accepté par le représentant seul ; remplacement par un nouveau mandat accepté (jamais d'office) ;
 *  - gabarit versionné : nouvelle version sans effet rétroactif, aperçu puis application (fiches contact, aucun accès),
 *    rejeu sans doublon ;
 *  - départ : conséquences affichées, mandat terminé, participations de projet intactes ; garde du dernier administrateur ;
 *  - organisation suspendue : opérations refusées sauf réactivation ; journal `organization.*` sans adresse ;
 *  NAVIGATEUR — entrée « Organisations » de la barre latérale, création par le formulaire, onglets au clavier, mandat
 *  accepté dans l'interface, axe-core (bureau 1440 × 900 et téléphone 390 × 844) sans violation critique ni sérieuse,
 *  aucun défilement horizontal au téléphone, passe anglaise (aucun texte d'interface resté en français).
 *
 *   BASE_URL=http://localhost:3001 [DATABASE_URL=…] [MAILPIT_URL=… | MAIL_LOG=api.log] node apps/web/e2e/organisations.mjs
 * Sans DATABASE_URL, les contrôles qui lisent la base (administrateur plateforme, journal) sont déclarés NON EXÉCUTÉS.
 */
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { chromium } from "playwright";

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
const mail = (tag) => `org-${tag}-${RUN}@example.test`;
const PASSWORD = `phrase de passe ${RUN}`;

let pgClient = null;
if (process.env.DATABASE_URL) {
  const pg = (await import("pg")).default;
  pgClient = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await pgClient.connect();
}

/** Lien d'invitation : rendu par l'API quand aucun courriel n'est parti (D-1), sinon lu dans Mailpit ou le journal. */
async function invitationLink(response, to) {
  if (response.mail?.link) return response.mail.link;
  for (let i = 0; i < 120; i++) {
    if (process.env.MAILPIT_URL) {
      const base = process.env.MAILPIT_URL.replace(/\/$/, "");
      const list = await fetch(`${base}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`).then((r) => r.json()).catch(() => null);
      for (const m of list?.messages ?? []) {
        const full = await fetch(`${base}/api/v1/message/${m.ID}`).then((r) => r.json()).catch(() => null);
        const hit = (full?.Text ?? "").match(/https?:\/\/\S*\/compte\/invitation#jeton=[\w%-]+/);
        if (hit) return hit[0];
      }
    }
    for (const file of (process.env.MAIL_LOG ?? "").split(",").filter(Boolean)) {
      if (!existsSync(file)) continue;
      const line = readFileSync(file, "utf8").split("\n").filter((l) => l.includes('"mail (console)"') && l.includes(to)).pop();
      const hit = line && (JSON.parse(line).text ?? "").match(/https?:\/\/\S*\/compte\/invitation#jeton=[\w%-]+/);
      if (hit) return hit[0];
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`lien d'invitation introuvable pour ${to}`);
}
const tokenOf = (link) => decodeURIComponent(link.split("#jeton=")[1]);

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined) });
const desktop = { viewport: { width: 1440, height: 900 } };
const phone = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };

/** Un compte (inscrit, ou session seule pour un compte créé par invitation) et son client HTTP de navigateur. */
async function account(tag, { register = true, viewport = desktop } = {}) {
  const ctx = await browser.newContext(viewport);
  const page = await ctx.newPage();
  const email = mail(tag);
  const call = async (method, path, data) => {
    const r = await page.request[method](`${BASE}${path}`, data === undefined ? undefined : { data });
    return { status: r.status(), body: await r.json().catch(() => null) };
  };
  if (register) {
    const r = await call("post", "/auth/register", { email, password: PASSWORD });
    if (r.status !== 201) throw new Error(`inscription ${tag} : ${r.status}`);
  }
  const me = register ? (await call("get", "/auth/me")).body : null;
  return { tag, email, ctx, page, call, id: me?.id ?? null };
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
  // API
  // ------------------------------------------------------------------------------------------------------------------
  const alice = await account("alice");
  const bob = await account("bob");
  const dave = await account("dave");
  const key = `cle-${RUN}`;
  const created = await alice.call("post", "/organizations", { name: `Atelier Nord ${RUN}`, kind: "Agence d'architecture", creationKey: key });
  check("création : 201, le créateur est administrateur", created.status === 201, JSON.stringify(created.body));
  const orgId = created.body.organization.id;
  const replay = await alice.call("post", "/organizations", { name: `Atelier Nord ${RUN}`, creationKey: key });
  check("double soumission (même clé) : la même organisation, aucun doublon", replay.status === 200 && replay.body.organization.id === orgId && replay.body.replayed === true);
  const mine = await alice.call("get", "/organizations");
  check("mes organisations : une seule, rôle administrateur", mine.body.memberships.filter((m) => m.organization.id === orgId).length === 1 && mine.body.memberships.find((m) => m.organization.id === orgId).membership.role === "administrateur");
  const fiche = await alice.call("get", `/organizations/${orgId}`);
  check("fiche : l'administrateur gère", fiche.status === 200 && fiche.body.you.can.manage === true);

  // Invitations d'adhésion.
  const invBob = await alice.call("post", `/organizations/${orgId}/invitations`, { email: bob.email, role: "membre", jobTitle: "Architecte" });
  check("invitation d'un compte existant : 202, aucune adhésion avant acceptation", invBob.status === 202 && invBob.body.invitation.purpose === "organization_membership");
  check("avant acceptation : bob n'a pas accès à l'organisation (404)", (await bob.call("get", `/organizations/${orgId}`)).status === 404);
  const firstToken = tokenOf(await invitationLink(invBob.body, bob.email));
  const invBob2 = await alice.call("post", `/organizations/${orgId}/invitations`, { email: bob.email, role: "membre", jobTitle: "Architecte" });
  check("renvoi : la même invitation, renouvelée", invBob2.body.resent === true && invBob2.body.invitation.id === invBob.body.invitation.id);
  check("renvoi : l'ancien lien est inopérant (404)", (await bob.call("post", "/auth/invitations/lookup", { token: firstToken })).status === 404);
  // Lien du renvoi : rendu par l'API, sinon le DERNIER courriel (Mailpit ou journal).
  const tokenForBob = tokenOf(await invitationLink(invBob2.body, bob.email));
  const look = await bob.call("post", "/auth/invitations/lookup", { token: tokenForBob });
  check("lecture de l'invitation : organisation et rôle proposés", look.body?.invitation?.organizationName === `Atelier Nord ${RUN}` && look.body.invitation.organizationRole === "membre");
  const wrong = await dave.call("post", "/auth/invitations/accept", { token: tokenForBob });
  check("lien transféré : mauvais compte refusé (403), aucune adhésion", wrong.status === 403 && wrong.body.error === "wrong_account");
  const acc = await bob.call("post", "/auth/invitations/accept", { token: tokenForBob });
  check("acceptation par l'identité visée : adhésion créée, entrée dans l'organisation", acc.status === 200 && acc.body.organizationId === orgId, JSON.stringify(acc.body));
  const acc2 = await bob.call("post", "/auth/invitations/accept", { token: tokenForBob });
  check("acceptation rejouée : même résultat, aucune seconde adhésion", acc2.status === 200);
  check("déjà membre : nouvelle invitation refusée (409)", (await alice.call("post", `/organizations/${orgId}/invitations`, { email: bob.email, role: "membre" })).status === 409);

  // Nouveau compte créé depuis l'invitation.
  const carol = await account("carol", { register: false });
  const invCarol = await alice.call("post", `/organizations/${orgId}/invitations`, { email: carol.email, role: "membre", jobTitle: "Ingénieure structure" });
  const act = await carol.call("post", "/auth/activate", { token: tokenOf(await invitationLink(invCarol.body, carol.email)), password: PASSWORD, acceptTerms: true, displayName: "Carol" });
  check("nouveau compte depuis l'invitation : compte et adhésion", act.status === 201 && act.body.organizationId === orgId, JSON.stringify(act.body));
  carol.id = act.body.user?.id ?? null;

  // Annuaire interne.
  const dirBob = await bob.call("get", `/organizations/${orgId}/directory`);
  const dirAlice = await alice.call("get", `/organizations/${orgId}/directory`);
  check("annuaire : trois membres", dirAlice.body.members.length === 3);
  check("annuaire vu par un membre : aucune adresse", dirBob.body.members.every((m) => !("email" in m)));
  check("annuaire vu par l'administrateur : adresses de gestion", dirAlice.body.members.every((m) => typeof m.email === "string"));
  const memberOf = (who) => dirAlice.body.members.find((m) => m.email === who.email);
  const mBob = memberOf(bob), mCarol = memberOf(carol), mAlice = memberOf(alice);
  check("non-membre : organisation, annuaire et groupes introuvables (404)",
    (await dave.call("get", `/organizations/${orgId}`)).status === 404 && (await dave.call("get", `/organizations/${orgId}/directory`)).status === 404 && (await dave.call("get", `/organizations/${orgId}/groups`)).status === 404);
  const patchByMember = await bob.call("patch", `/organizations/${orgId}`, { name: "Piratage" });
  check("membre : gestion refusée avec motif (403 not_admin)", patchByMember.status === 403 && patchByMember.body.error === "not_admin");

  // Groupes sans droit implicite ; projet de l'administratrice.
  const project = await alice.call("post", "/projects", { code: `ORG-${RUN}`, name: "Projet de l'agence" });
  const pid = project.body.id;
  const group = await alice.call("post", `/organizations/${orgId}/groups`, { name: "Structure" });
  check("groupe créé, sans accès de projet", group.status === 201 && group.body.projectAccess === "aucun");
  check("nom de groupe actif en double refusé (409)", (await alice.call("post", `/organizations/${orgId}/groups`, { name: " structure " })).status === 409);
  const addBob = await alice.call("put", `/organizations/${orgId}/groups/${group.body.group.id}/members/${mBob.membershipId}`);
  check("ajout au groupe : aucun accès de projet accordé", addBob.status === 201 && addBob.body.projectAccess === "aucun");
  check("adhésion + groupe : le projet reste introuvable pour le membre (404)", (await bob.call("get", `/projects/${pid}`)).status === 404);

  // Organisation partie au projet, partie propriétaire.
  const part = await alice.call("put", `/organizations/${orgId}/projects/${pid}/participation`, {});
  check("organisation enregistrée comme partie (propriétaire du projet + administratrice)", part.status === 201);
  check("enregistrement rejoué : la même participation", (await alice.call("put", `/organizations/${orgId}/projects/${pid}/participation`, {})).body.participationId === part.body.participationId);
  const own = await alice.call("put", `/organizations/${orgId}/projects/${pid}/owner`);
  check("partie propriétaire déclarée, aucun droit changé", own.status === 200 && own.body.accessChanged === false);
  check("partie propriétaire : le membre n'a toujours aucun accès (404)", (await bob.call("get", `/projects/${pid}`)).status === 404);
  const daveProject = await dave.call("post", "/projects", { code: `DAV-${RUN}`, name: "Projet de Dave" });
  check("projet d'autrui : aucune déclaration possible (404)", (await alice.call("put", `/organizations/${orgId}/projects/${daveProject.body.id}/owner`)).status === 404);

  // Mandats.
  const prop = await alice.call("post", `/organizations/${orgId}/mandates`, { projectId: pid, membershipId: mBob.membershipId, responsibilities: ["coordonner"], note: "Projet de l'agence" });
  check("mandat proposé, sans accès", prop.status === 201 && prop.body.grantsAccess === false && prop.body.mandate.status === "propose");
  check("mandat : seul le représentant répond (404 pour un autre)", (await carol.call("post", `/organizations/mandates/${prop.body.mandate.id}/accept`)).status === 404);
  const bobMandates = (await bob.call("get", "/organizations")).body.mandates;
  check("le représentant voit sa proposition, nom du projet masqué (aucun accès)", bobMandates.some((m) => m.id === prop.body.mandate.id && m.projectName === null));
  const okMandate = await bob.call("post", `/organizations/mandates/${prop.body.mandate.id}/accept`);
  check("mandat accepté par le représentant", okMandate.status === 200 && okMandate.body.status === "actif");
  check("mandat actif : toujours aucun accès au projet (404)", (await bob.call("get", `/projects/${pid}`)).status === 404);
  check("second mandat sans remplacement explicite refusé (409)", (await alice.call("post", `/organizations/${orgId}/mandates`, { projectId: pid, membershipId: mCarol.membershipId })).status === 409);
  const repl = await alice.call("post", `/organizations/${orgId}/mandates`, { projectId: pid, membershipId: mCarol.membershipId, replacesMandateId: prop.body.mandate.id });
  check("remplacement proposé : reprend les responsabilités, l'actuel reste mandaté", repl.status === 201 && repl.body.mandate.responsibilities.join() === "coordonner");
  let view = (await alice.call("get", `/organizations/${orgId}/projects`)).body.projects.find((p) => p.projectId === pid);
  check("avant acceptation du remplaçant : bob reste le représentant actif", view.mandates.find((m) => m.status === "actif")?.membershipId === mBob.membershipId);
  check("remplacement accepté par la remplaçante", (await carol.call("post", `/organizations/mandates/${repl.body.mandate.id}/accept`)).body.status === "actif");
  view = (await alice.call("get", `/organizations/${orgId}/projects`)).body.projects.find((p) => p.projectId === pid);
  check("après remplacement : une seule représentante active, l'ancien mandat terminé", view.mandates.length === 1 && view.mandates[0].membershipId === mCarol.membershipId && view.name !== null);

  // Gabarits versionnés.
  const tpl = await alice.call("post", `/organizations/${orgId}/templates`, { name: "Équipe type", entries: [
    { label: "Ingénieur structure", businessRole: "ingénieur structure", responsibilities: ["produire"], proposedRoles: ["concepteur"] },
    { label: "Contrôleur", businessRole: null, responsibilities: ["verifier"], proposedRoles: ["relecteur"] },
  ] });
  check("gabarit créé en version 1", tpl.status === 201 && tpl.body.template.versions[0].version === 1);
  check("gabarit invalide refusé (400)", (await alice.call("post", `/organizations/${orgId}/templates`, { name: "Vide", entries: [] })).status === 400);
  const tid = tpl.body.template.id;
  const assignments = { "0": mBob.personId };
  const prev = await alice.call("post", `/organizations/${orgId}/templates/${tid}/versions/1/preview`, { projectId: pid, assignments });
  check("aperçu : une fiche contact proposée, une ligne non attribuée, aucun accès", prev.status === 200 && prev.body.plan.map((l) => l.outcome).join() === "creer,non-attribue" && prev.body.grantsAccess === false);
  const ap = await alice.call("post", `/organizations/${orgId}/templates/${tid}/versions/1/apply`, { projectId: pid, assignments });
  check("application : fiche contact créée", ap.status === 201 && ap.body.application.plan[0].outcome === "creer");
  check("application rejouée : aucun doublon", (await alice.call("post", `/organizations/${orgId}/templates/${tid}/versions/1/apply`, { projectId: pid, assignments })).body.replayed === true);
  check("fiche contact : toujours aucun accès au projet (404)", (await bob.call("get", `/projects/${pid}`)).status === 404);
  check("application par un non-propriétaire du projet refusée", (await alice.call("post", `/organizations/${orgId}/templates/${tid}/versions/1/preview`, { projectId: daveProject.body.id, assignments })).status === 404);
  const v2 = await alice.call("post", `/organizations/${orgId}/templates/${tid}/versions`, { entries: [{ label: "Ingénieur structure", businessRole: "ingénieur structure principal", responsibilities: ["produire", "coordonner"], proposedRoles: ["concepteur"] }] });
  check("nouvelle version 2, sans application rétroactive", v2.status === 201 && v2.body.version.version === 2 && v2.body.retroactive === false);
  const versions = (await alice.call("get", `/organizations/${orgId}/templates`)).body.templates[0].versions;
  check("versions conservées : la 1 inchangée, appliquée une fois ; la 2 jamais appliquée",
    versions.length === 2 && versions[0].entries[0].businessRole === "ingénieur structure" && versions[0].applications.length === 1 && versions[1].applications.length === 0);
  const prev2 = await alice.call("post", `/organizations/${orgId}/templates/${tid}/versions/2/preview`, { projectId: pid, assignments });
  check("version 2 sur le même projet : la participation existante reste inchangée", prev2.body.plan[0].outcome === "deja-present");

  // Départ.
  const depPrev = await alice.call("get", `/organizations/${orgId}/memberships/${mCarol.membershipId}/departure`);
  check("départ : conséquences affichées (mandat à terminer), aucun accès de projet modifié", depPrev.status === 200 && depPrev.body.impact.mandates.length === 1 && depPrev.body.impact.projectAccessChanged === false);
  const ended = await carol.call("post", `/organizations/${orgId}/memberships/${mCarol.membershipId}/end`, {});
  check("départ de la personne elle-même", ended.status === 200 && ended.body.ended === true);
  view = (await alice.call("get", `/organizations/${orgId}/projects`)).body.projects.find((p) => p.projectId === pid);
  check("après le départ : plus aucun représentant actif (un nouveau mandat est nécessaire)", view.mandates.length === 0);
  check("après le départ : l'organisation reste partie au projet", view.participation !== null);
  const carolOrg = await carol.call("get", `/organizations/${orgId}`);
  check("ancienne membre : résumé seulement, annuaire refusé", carolOrg.status === 200 && carolOrg.body.you.can.read === false && (await carol.call("get", `/organizations/${orgId}/directory`)).status === 403);
  const lastAdmin = await alice.call("post", `/organizations/${orgId}/memberships/${mAlice.membershipId}/end`, {});
  check("garde du dernier administrateur : départ refusé (409)", lastAdmin.status === 409 && lastAdmin.body.error === "last_admin");
  check("garde du dernier administrateur : rétrogradation refusée (409)", (await alice.call("patch", `/organizations/${orgId}/memberships/${mAlice.membershipId}`, { role: "membre" })).status === 409);

  // Invitant revalidé à l'acceptation.
  await alice.call("patch", `/organizations/${orgId}/memberships/${mBob.membershipId}`, { role: "administrateur" });
  const erin = await account("erin");
  const invErin = await alice.call("post", `/organizations/${orgId}/invitations`, { email: erin.email, role: "membre" });
  const erinToken = tokenOf(await invitationLink(invErin.body, erin.email));
  check("bob, devenu administrateur, retire le rôle d'alice", (await bob.call("patch", `/organizations/${orgId}/memberships/${mAlice.membershipId}`, { role: "membre" })).status === 200);
  const erinAcc = await erin.call("post", "/auth/invitations/accept", { token: erinToken });
  check("invitant qui a perdu son autorité : acceptation refusée (409 inviter_not_authorized)", erinAcc.status === 409 && erinAcc.body.error === "inviter_not_authorized");
  check("refus : aucune adhésion créée", (await erin.call("get", `/organizations/${orgId}`)).status === 404);
  check("alice renommée administratrice", (await bob.call("patch", `/organizations/${orgId}/memberships/${mAlice.membershipId}`, { role: "administrateur" })).status === 200);

  // Organisation suspendue.
  check("suspension par un administrateur", (await bob.call("post", `/organizations/${orgId}/status`, { status: "suspendue" })).status === 200);
  const blocked = await bob.call("post", `/organizations/${orgId}/groups`, { name: "Fluides" });
  check("organisation suspendue : opérations refusées (403 organization_suspended)", blocked.status === 403 && blocked.body.error === "organization_suspended");
  check("réactivation", (await bob.call("post", `/organizations/${orgId}/status`, { status: "active" })).status === 200);
  check("clôture sans confirmation du nom refusée (422)", (await bob.call("post", `/organizations/${orgId}/status`, { status: "close" })).status === 422);

  // Base : administrateur de la plateforme sans droit implicite ; journal sans adresse.
  if (pgClient) {
    await pgClient.query("UPDATE users SET platform_role = 'admin' WHERE id = $1", [dave.id]);
    check("administrateur de la plateforme : organisation introuvable (404, aucun droit par son rôle)", (await dave.call("get", `/organizations/${orgId}`)).status === 404);
    await pgClient.query("UPDATE users SET platform_role = 'user' WHERE id = $1", [dave.id]);
    const rows = (await pgClient.query("SELECT action, metadata::text AS m FROM admin.audit_log WHERE target_type = 'organization' AND target_id = $1", [orgId])).rows;
    const actions = new Set(rows.map((r) => r.action));
    for (const a of ["organization.created", "organization.membership.created", "organization.group.created", "organization.group.member_added", "organization.mandate.proposed",
      "organization.mandate.accepted", "organization.mandate.ended", "organization.template.created", "organization.template.version_created", "organization.template.applied",
      "organization.membership.ended", "organization.status_changed", "organization.project.owner_declared", "organization.project.participation_recorded"]) {
      check(`journal : ${a}`, actions.has(a));
    }
    check("journal : aucune adresse dans les métadonnées", rows.every((r) => !r.m.includes("@")));
  } else {
    notRun("administrateur de la plateforme sans droit implicite ; journal organization.*", "DATABASE_URL absente");
  }

  // ------------------------------------------------------------------------------------------------------------------
  // Navigateur
  // ------------------------------------------------------------------------------------------------------------------
  const ui = alice.page;
  await ui.goto(`${BASE}/accueil`);
  const nav = ui.locator("[data-nav-organisations]");
  await nav.waitFor();
  check("barre latérale : entrée « Organisations » avec son icône", (await nav.count()) === 1 && (await nav.locator("svg").count()) === 1);
  await nav.click();
  await ui.waitForSelector("[data-organisations] h1");
  check("page Organisations : l'organisation est listée", (await ui.locator(`[data-organisation="${orgId}"]`).count()) === 1);
  await axe(ui, "liste des organisations (bureau)");
  await ui.fill('input[name="orgName"]', `Bureau Sud ${RUN}`);
  await ui.fill('input[name="orgKind"]', "Bureau d'études");
  await ui.click("[data-create-organisation]");
  await ui.getByText("Organisation créée : vous en êtes administrateur.").waitFor();
  check("création par le formulaire", (await alice.call("get", "/organizations")).body.memberships.some((m) => m.organization.name === `Bureau Sud ${RUN}`));
  await ui.goto(`${BASE}/organisations/${orgId}`);
  await ui.waitForSelector(`[data-organisation-page="${orgId}"] [role="tablist"]`);
  await axe(ui, "fiche de l'organisation (bureau)");
  await ui.locator("#org-tab-fiche").focus();
  for (const id of ["membres", "groupes", "gabarits", "projets"]) {
    await ui.keyboard.press("ArrowRight");
    await ui.waitForSelector(`#org-panel-${id}`);
    check(`onglet « ${id} » atteint au clavier (flèche droite)`, await ui.evaluate((x) => document.activeElement?.id === `org-tab-${x}`, id));
    await ui.waitForTimeout(300);
    await axe(ui, `onglet ${id} (bureau)`);
  }
  await ui.locator("#org-tab-gabarits").click();
  await ui.locator("[data-apply-version]").last().click();
  await ui.waitForSelector("[data-apply-template]");
  await axe(ui, "application d'un gabarit (bureau)");

  // Mandat accepté dans l'interface par un nouveau membre (fred, invité par bob).
  const fred = await account("fred");
  const invFred = await bob.call("post", `/organizations/${orgId}/invitations`, { email: fred.email, role: "membre" });
  await fred.call("post", "/auth/invitations/accept", { token: tokenOf(await invitationLink(invFred.body, fred.email)) });
  const mFred = (await bob.call("get", `/organizations/${orgId}/directory`)).body.members.find((m) => m.email === fred.email);
  const propFred = await bob.call("post", `/organizations/${orgId}/mandates`, { projectId: pid, membershipId: mFred.membershipId, note: "Projet de l'agence" });
  check("mandat proposé à un nouveau membre", propFred.status === 201);
  await fred.page.goto(`${BASE}/organisations`);
  await fred.page.waitForSelector(`[data-mandate="${propFred.body.mandate.id}"]`);
  await axe(fred.page, "mandat à accepter (bureau)");
  await fred.page.click(`[data-mandate="${propFred.body.mandate.id}"] [data-accept-mandate]`);
  await fred.page.waitForSelector('[role="status"]:has-text("Mandat accepté")');
  check("mandat accepté dans l'interface", (await bob.call("get", `/organizations/${orgId}/projects`)).body.projects.find((p) => p.projectId === pid).mandates.some((m) => m.id === propFred.body.mandate.id && m.status === "actif"));

  // Téléphone.
  const tel = await browser.newContext(phone);
  const telPage = await tel.newPage();
  await telPage.request.post(`${BASE}/auth/login`, { data: { email: bob.email, password: PASSWORD } });
  await telPage.goto(`${BASE}/organisations`);
  await telPage.waitForSelector("[data-organisations] h1");
  await axe(telPage, "liste des organisations (téléphone)");
  await noHorizontalScroll(telPage, "liste des organisations (téléphone)");
  await telPage.goto(`${BASE}/organisations/${orgId}`);
  await telPage.waitForSelector('[role="tablist"]');
  for (const id of ["fiche", "membres", "groupes", "gabarits", "projets"]) {
    await telPage.locator(`#org-tab-${id}`).click();
    await telPage.waitForTimeout(400);
    await axe(telPage, `onglet ${id} (téléphone)`);
    await noHorizontalScroll(telPage, `onglet ${id} (téléphone)`);
  }

  // Passe anglaise : aucun texte d'interface resté en français (données marquées translate="no" exclues).
  const FR = /[éèêàùçœ«»]|\b(le|la|les|des|du|une|est|sont|pour|avec|aucun|aucune|sans|dans|sur|au|aux|et|ou|ce|cette|vos|votre|projet|membre|groupe|adhésion)\b/i;
  await ui.evaluate(() => localStorage.setItem("fadi.langue", "en"));
  const residus = new Map();
  const releve = async (nom, page = ui) => {
    await page.waitForTimeout(700);
    const textes = await page.evaluate(() => {
      const out = [];
      const exclu = (n) => {
        for (let e = n.parentElement; e; e = e.parentElement) {
          if (e.getAttribute("translate") === "no" || ["SCRIPT", "STYLE", "TEXTAREA", "CODE", "PRE", "OPTION"].includes(e.tagName)) return true;
          const s = getComputedStyle(e);
          if (s.display === "none" || s.visibility === "hidden") return true;
        }
        return false;
      };
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        const t = (n.nodeValue ?? "").replace(/\s+/g, " ").trim();
        if (t.length >= 2 && /[A-Za-zÀ-ÿ]/.test(t) && !exclu(n)) out.push(t);
      }
      for (const el of document.querySelectorAll("[title],[aria-label],[placeholder]")) {
        if (el.closest('[translate="no"]')) continue;
        for (const a of ["title", "aria-label", "placeholder"]) { const v = el.getAttribute(a); if (v && /[A-Za-zÀ-ÿ]/.test(v)) out.push(v.trim()); }
      }
      return out;
    });
    for (const t of textes) if (FR.test(t)) residus.set(t, nom);
  };
  await ui.goto(`${BASE}/organisations`);
  await ui.waitForSelector("[data-organisations] h1");
  check("passe anglaise : titre traduit", (await ui.locator("[data-organisations] h1").textContent())?.trim() === "Organisations" && await ui.evaluate(() => document.documentElement.lang) === "en");
  await releve("liste");
  await ui.goto(`${BASE}/organisations/${orgId}`);
  await ui.waitForSelector('[role="tablist"]');
  for (const id of ["fiche", "membres", "groupes", "gabarits", "projets"]) {
    await ui.locator(`#org-tab-${id}`).click();
    if (id === "gabarits") { await ui.locator("[data-apply-version]").last().click(); await ui.locator('select[name="applyProject"]').selectOption(pid); await ui.click("[data-preview-template]"); await ui.waitForSelector("[data-template-plan]"); }
    if (id === "membres") { await ui.locator(`[data-end-membership="${mFred.membershipId}"]`).click(); await ui.waitForSelector("[data-departure-impact]"); }
    await releve(id);
    if (id === "membres") await ui.keyboard.press("Escape");
  }
  // Un remplacement proposé à bob : sa liste montre la proposition, en anglais.
  const propBob = await alice.call("post", `/organizations/${orgId}/mandates`, { projectId: pid, membershipId: mBob.membershipId, replacesMandateId: propFred.body.mandate.id, note: "Relève" });
  check("remplacement proposé pour la passe anglaise", propBob.status === 201);
  await bob.page.goto(`${BASE}/accueil`);
  await bob.page.evaluate(() => localStorage.setItem("fadi.langue", "en"));
  await bob.page.goto(`${BASE}/organisations`);
  await bob.page.waitForSelector(`[data-mandate="${propBob.body.mandate.id}"]`);
  await releve("mandats", bob.page);
  await bob.page.evaluate(() => localStorage.setItem("fadi.langue", "fr"));
  if (process.env.OUT) {
    mkdirSync(process.env.OUT, { recursive: true });
    writeFileSync(`${process.env.OUT}/residus-organisations.txt`, [...residus.entries()].map(([t, n]) => `[${n}] ${t}`).join("\n") + "\n");
  }
  check("passe anglaise : aucun texte d'interface resté en français", residus.size === 0, [...residus.entries()].slice(0, 15).map(([t, n]) => `[${n}] ${t}`).join(" | "));
  await ui.evaluate(() => localStorage.setItem("fadi.langue", "fr"));
  await tel.close();
} catch (e) {
  check("déroulé sans erreur inattendue", false, e.stack ?? String(e));
} finally {
  await browser.close();
  await pgClient?.end();
}

if (failures) {
  console.log(`✗ ${failures} contrôle(s) en échec`);
  process.exit(1);
}
console.log("✓ recette de l'espace d'organisation réussie");
