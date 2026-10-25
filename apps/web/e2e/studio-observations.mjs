#!/usr/bin/env node
/**
 * Recette Studio — workflow d'observation (E.2-01 à E.2-05), par l'API et l'interface réelles (même origine, base migrée :
 * tables `studio_observation_*` dans init.sql). Comptes (propriétaire, éditeur, lecteur, autre compte) et projet
 * synthétiques créés par les vraies routes ; le dessin est posé par des enveloppes de commandes ; l'exigence et sa source
 * sont des données de recette déclarées, jamais des valeurs réglementaires.
 *   1. E.2-01 identité unique : une observation ouverte depuis une exigence (et son contrôle) suit aussi une ligne de
 *      métré, un objet et une revue ; un même élément n'est jamais suivi deux fois (409 `deja_suivie`, identifiant
 *      réemployé) ; la recherche par domaine relit la même identité ; liens invalides refusés ;
 *   2. E.2-02 contexte (étude, variante, révision, objets, vue) et responsable (propriétaire ou éditeur seulement) ;
 *   3. E.2-03 tâches attribuées (cycle, droits, journal append-only, rejeu) et décisions distinctes (un éditeur propose,
 *      le propriétaire décide) ;
 *   4. E.2-04 / E.2-05 correction → recontrôle → décision de clôture : propriétaire seul (refus serveur de l'éditeur),
 *      motivée, sans tâche à faire, consignée au journal des décisions ; observation clôturée figée ;
 *   5. notifications (tâche confiée, proposition) ; autre compte et anonyme refusés ;
 *   6. interface : panneau « Observations » (identité réemployée signalée, ouverture depuis une exigence, tâche, décision,
 *      correction, recontrôle, clôture motivée).
 *
 * BASE_URL=http://localhost:3001 node apps/web/e2e/studio-observations.mjs
 */
import { chromium } from "playwright";
import { appelPlaywright, inviterEtAccepter } from "./lib-invitations.mjs";
import { randomBytes, randomUUID } from "node:crypto";

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
    return { status: res.status, body: json, headers: res.headers };
  };
}
const credentials = (n) => ({ email: `studio-obs-${n}-${randomUUID().replaceAll("-", "").slice(0, 16)}@example.test`, password: randomBytes(18).toString("hex") });
const rid = () => `recette-${randomUUID()}`;
const j = (v) => JSON.stringify(v);

const owner = client(), editor = client(), reader = client(), foreign = client(), anonymous = client();
const cOwner = credentials("p"), cEditor = credentials("e"), cReader = credentials("l");
for (const [c, cred] of [[owner, cOwner], [editor, cEditor], [reader, cReader], [foreign, credentials("x")]]) check(`compte créé (${cred.email.split("-")[2]})`, (await c("POST", "/auth/register", cred)).status === 201);
const ids = {};
for (const [k, c] of [["owner", owner], ["editor", editor], ["reader", reader]]) ids[k] = (await c("GET", "/auth/me")).body?.user?.id ?? (await c("GET", "/auth/me")).body?.id;
const project = await owner("POST", "/projects", { code: `SO_${randomUUID().slice(0, 8)}`, name: "Studio — observations (recette synthétique)" });
check("projet créé", project.status === 201, String(project.status));
const projectId = project.body?.id;
check("éditeur et lecteur invités, invitations acceptées (phase 3)", (await inviterEtAccepter(owner, editor, projectId, cEditor.email, "editeur")).ok
  && (await inviterEtAccepter(owner, reader, projectId, cReader.email, "lecteur")).ok);
const root = `/projects/${projectId}/studio/studies`;
const created = await owner("POST", root, { name: "Étude observations" });
const studyId = created.body?.study?.id, variantId = created.body?.variant?.id;
const vp = `${root}/${studyId}/variants/${variantId}`;
const envoi = (base, commands) => owner("POST", `${vp}/commands`, { contractVersion: "studio-commands/1", requestId: rid(), baseRevisionId: base, commands });
const c1 = await envoi(created.body?.revision?.id, [
  { toolId: "studio.architecture.mur", params: { id: "mur-1", type: "wall", axis: [{ x: 0, y: 0 }, { x: 6, y: 0 }], thickness: 0.2, height: 3, base: 0, justification: "center" } },
  { toolId: "studio.dessin.ligne", params: { id: "ligne-1", type: "line", start: { x: 0, y: 2 }, end: { x: 4, y: 2 } } },
]);
const r1 = c1.body?.revision?.id;
const r2 = (await envoi(r1, [{ toolId: "studio.dessin.deplacer", params: { id: "ligne-1", dx: 1, dy: 0 } }])).body?.revision?.id;
const r3 = (await envoi(r2, [{ toolId: "studio.dessin.deplacer", params: { id: "ligne-1", dx: 1, dy: 0 } }])).body?.revision?.id;
check("préparation : étude, mur, ligne et trois révisions", created.status === 201 && Boolean(r1 && r2 && r3));

// Données de recette déclarées (pas une valeur réglementaire) : une exigence, un contrôle de r1, une publication.
const exigence = (id, libelle) => ({ id, libelle, metrique: { type: "nombre", nature: "mur-architectural" }, comparaison: ">=", valeur: 1, unite: "u", source: "Donnée de recette synthétique (non réglementaire)" });
const jeu = await owner("POST", `${root}/${studyId}/exigences`, { baseVersion: 0, exigences: [exigence("exi-1", "Murs présents"), exigence("exi-2", "Murs posés")], requestId: rid() });
const controle = await owner("POST", `${vp}/controles`, { revisionId: r1, requestId: rid() });
const publication = await owner("POST", `${vp}/publications`, { title: "Dossier de revue (recette)", requestId: rid() });
check("préparation : jeu d'exigences, contrôle de r1 et publication", jeu.status === 201 && controle.status === 201 && publication.status === 201, `${jeu.status} ${controle.status} ${publication.status}`);
const controleId = controle.body?.id, publicationId = publication.body?.id;

const obsPath = `${vp}/observations`;
const one = (o) => `${obsPath}/${o}`;

// ---------------------------------------------------------------------------
// E.2-01 / E.2-02 — ouverture depuis un domaine, identité réemployée, contexte et responsable.
const ouvRequest = rid();
// Audience « projet » (écart E1) : le lecteur de la recette lit et tente d'agir sur cette observation.
const ouverture = { body: "Écart sur l'exigence des murs", responsableId: ids.editor, vue: { mode: "exigences" }, liens: [{ domaine: "exigence", ref: "exi-1", controleId }], requestId: ouvRequest, audience: "projet" };
const opened = await owner("POST", obsPath, ouverture);
const O = opened.body?.id;
check("E.2-01 ouverture depuis une exigence et son contrôle (201) : lien lié à la révision du contrôle", opened.status === 201 && opened.body?.liens?.length === 1
  && opened.body.liens[0].domaine === "exigence" && opened.body.liens[0].controleId === controleId && opened.body.liens[0].revisionId === r1, j(opened.body).slice(0, 400));
const replay = await owner("POST", obsPath, ouverture);
check("E.2-01 rejeu du même requestId : même observation, rien de doublé", replay.status === 201 && replay.body?.id === O && replay.headers.get("idempotent-replayed") === "true");
const conflit = await owner("POST", obsPath, { ...ouverture, requestId: rid(), body: "Second constat sur la même exigence" });
check("E.2-01 un élément déjà suivi n'ouvre pas une seconde observation (409 deja_suivie, identifiant réemployé)", conflit.status === 409 && conflit.body?.error === "deja_suivie" && conflit.body?.observationId === O, j(conflit.body));
const comments = await owner("GET", `${vp}/comments`);
check("E.2-01 une seule identité : l'observation est le commentaire d'origine de même identifiant", comments.body?.comments?.filter((c) => c.observation).length === 1 && comments.body.comments.find((c) => c.id === O)?.observation?.id === O);
for (const [domaine, ref] of [["metre", "mur-1#volume-net"], ["objet", "mur-1"], ["revue", publicationId]]) {
  const lien = await editor("POST", `${one(O)}/liens`, { domaine, ref, requestId: rid() });
  check(`E.2-01 la même observation suit aussi ${domaine} (201, par son responsable éditeur)`, lien.status === 201 && lien.body?.id === O && lien.body.liens.some((l) => l.domaine === domaine && l.ref === ref), `${lien.status} ${j(lien.body).slice(0, 200)}`);
}
const relu = await reader("GET", `${obsPath}?domaine=metre&ref=${encodeURIComponent("mur-1#volume-net")}`);
check("E.2-01 recherche par domaine (lecteur) : la même identité, une seule", relu.status === 200 && relu.body?.observations?.length === 1 && relu.body.observations[0].id === O);
check("E.2-01 élément déjà lié à cette observation → 409 deja_liee", (await owner("POST", `${one(O)}/liens`, { domaine: "objet", ref: "mur-1", requestId: rid() })).body?.error === "deja_liee");
const invalides = await Promise.all([
  owner("POST", `${one(O)}/liens`, { domaine: "objet", ref: "inconnu" }), owner("POST", `${one(O)}/liens`, { domaine: "metre", ref: "mur-1#surface" }),
  owner("POST", `${one(O)}/liens`, { domaine: "exigence", ref: "exi-9" }), owner("POST", `${one(O)}/liens`, { domaine: "revue", ref: "publication-inconnue" }),
  owner("POST", `${one(O)}/liens`, { domaine: "metre", ref: "ligne-1" }),
]);
check("E.2-01 liens invalides refusés (objet, grandeur, exigence, publication inconnus ; métré sans grandeur) → 400 lien_invalide", invalides.every((r) => r.status === 400 && r.body?.code === "lien_invalide"), invalides.map((r) => `${r.status}:${r.body?.code}`).join(" "));
check("E.2-01 un lecteur ni auteur ni responsable ne lie pas (403)", (await reader("POST", `${one(O)}/liens`, { domaine: "objet", ref: "ligne-1" })).status === 403);

const detail = await reader("GET", one(O));
check("E.2-02 contexte relu : étude, variante, vue citée, responsable éditeur", detail.status === 200 && detail.body?.contexte?.studyId === studyId && detail.body.contexte.variantId === variantId
  && detail.body.vue?.mode === "exigences" && detail.body.responsableId === ids.editor, j(detail.body).slice(0, 300));
const ancre = await reader("POST", obsPath, { body: "Ligne trop courte", objectIds: ["ligne-1"], responsableId: ids.editor, vue: { mode: "3d", ref: "orbite" }, requestId: rid() });
check("E.2-02 un lecteur ouvre une observation ancrée (objets, révision de tête, vue 3D), confiée à l'éditeur", ancre.status === 201 && j(ancre.body?.contexte?.objectIds) === '["ligne-1"]' && ancre.body.contexte.revisionId === r3 && ancre.body.vue?.ref === "orbite", j(ancre.body).slice(0, 300));
check("E.2-02 responsable lecteur refusé (400 responsable_invalide)", (await owner("POST", obsPath, { body: "x", responsableId: ids.reader, requestId: rid() })).body?.code === "responsable_invalide");
const remarque = await reader("POST", `${vp}/comments`, { body: "Remarque à suivre" });
const promue = await reader("POST", `${vp}/comments/${remarque.body?.id}/observation`, { responsableId: ids.owner, vue: { mode: "plan" } });
check("E.2-02 promotion d'un commentaire avec sa vue (fil des commentaires, même identité)", promue.status === 201 && promue.body?.id === remarque.body?.id && promue.body.vue?.mode === "plan");

// ---------------------------------------------------------------------------
// E.2-03 — tâches attribuées et décisions distinctes.
const tache = (c, body) => c("POST", `${one(O)}/taches`, { requestId: rid(), ...body });
const t1 = await tache(editor, { libelle: "Reprendre le mur au droit de l'écart", assigneeId: ids.editor });
const T1 = t1.body?.taches?.[0]?.id;
check("E.2-03 le responsable (éditeur) crée une tâche (201, à faire, journal créé)", t1.status === 201 && t1.body.taches[0].statut === "a-faire" && t1.body.taches[0].journal?.[0]?.action === "creer");
check("E.2-03 un lecteur ne crée pas de tâche (403) ; une tâche ne se confie pas à un lecteur (400)", (await tache(reader, { libelle: "x", assigneeId: ids.editor })).status === 403
  && (await tache(owner, { libelle: "x", assigneeId: ids.reader })).body?.code === "responsable_invalide");
const t2 = await tache(owner, { libelle: "Vérifier la révision corrigée", assigneeId: ids.owner, echeance: "2026-12-15" });
const T2 = t2.body?.taches?.find((t) => t.libelle === "Vérifier la révision corrigée")?.id;
const t3 = await tache(owner, { libelle: "Mettre à jour le métré", assigneeId: ids.editor });
const T3 = t3.body?.taches?.find((t) => t.libelle === "Mettre à jour le métré")?.id;
check("E.2-03 le propriétaire crée et confie des tâches (échéance facultative)", t2.status === 201 && t3.status === 201 && t2.body.taches.find((t) => t.id === T2)?.echeance === "2026-12-15");
const passe = (c, t, body) => c("POST", `${one(O)}/taches/${t}/transitions`, { requestId: rid(), ...body });
check("E.2-03 l'éditeur ne déclare pas faite la tâche d'un autre (403)", (await passe(editor, T2, { action: "terminer" })).status === 403);
const faiteReq = rid();
const faite = await editor("POST", `${one(O)}/taches/${T1}/transitions`, { action: "terminer", note: "Mur repris", requestId: faiteReq });
const rejouee = await editor("POST", `${one(O)}/taches/${T1}/transitions`, { action: "terminer", note: "Mur repris", requestId: faiteReq });
check("E.2-03 la personne chargée la déclare faite ; rejeu idempotent", faite.status === 200 && faite.body.taches.find((t) => t.id === T1)?.statut === "faite" && rejouee.headers.get("idempotent-replayed") === "true");
check("E.2-03 passage invalide (déjà faite) → 409 ; rouvrir par l'éditeur → 403", (await passe(editor, T1, { action: "terminer" })).body?.error === "invalid_transition" && (await passe(editor, T1, { action: "rouvrir" })).status === 403);
check("E.2-03 le propriétaire rouvre, le créateur (éditeur) annule", (await passe(owner, T1, { action: "rouvrir" })).status === 200 && (await passe(editor, T1, { action: "annuler" })).status === 200);
const reat = await passe(owner, T3, { action: "reattribuer", assigneeId: ids.owner });
check("E.2-03 réattribution par le propriétaire (même personne → 409 same_assignee)", reat.status === 200 && reat.body.taches.find((t) => t.id === T3)?.assigneeId === ids.owner && (await passe(owner, T3, { action: "reattribuer", assigneeId: ids.owner })).body?.error === "same_assignee");
const journalT1 = (await owner("GET", one(O))).body?.taches?.find((t) => t.id === T1)?.journal ?? [];
check("E.2-03 journal de la tâche append-only, ordonné (créer, terminer, rouvrir, annuler)", j(journalT1.map((e) => e.seq)) === "[1,2,3,4]" && j(journalT1.map((e) => e.action)) === '["creer","terminer","rouvrir","annuler"]', j(journalT1));

const decide = (c, body) => c("POST", `${one(O)}/decisions`, { requestId: rid(), ...body });
check("E.2-03 un lecteur ne propose pas (403)", (await decide(reader, { nature: "proposition", portee: "autre", texte: "x" })).status === 403);
const prop = await decide(editor, { nature: "proposition", portee: "cloture", texte: "Écart repris : je propose la clôture.", revisionId: r2 });
check("E.2-03 / E.2-05 l'éditeur propose la clôture (201, rôle éditeur consigné) — la proposition ne clôt rien", prop.status === 201 && prop.body.decisions.at(-1)?.actorRole === "editeur" && prop.body.statut === "ouverte");
check("E.2-05 l'éditeur ne décide pas (403)", (await decide(editor, { nature: "decision", portee: "autre", texte: "Je décide" })).status === 403);
const dec = await decide(owner, { nature: "decision", portee: "autre", texte: "Maintenir l'épaisseur du mur." });
check("E.2-03 le propriétaire consigne une décision distincte (201)", dec.status === 201 && dec.body.decisions.at(-1)?.nature === "decision" && dec.body.decisions.at(-1)?.actorRole === "proprietaire");
check("E.2-04 une décision de clôture ne s'écrit pas hors du passage (400 cloture_par_passage)", (await decide(owner, { nature: "decision", portee: "cloture", texte: "Clos" })).body?.code === "cloture_par_passage");
const journalAvant = (await owner("GET", one(O))).body;
check("E.2-03 décisions et passages sont deux journaux distincts", j(journalAvant.decisions.map((d) => d.seq)) === "[1,2]" && journalAvant.journal.length === 1 && journalAvant.journal[0].action === "ouvrir");

// ---------------------------------------------------------------------------
// E.2-04 / E.2-05 — correction → recontrôle → décision de clôture (propriétaire seul).
const transition = (c, body) => c("POST", `${one(O)}/transitions`, { requestId: rid(), ...body });
check("E.2-04 clôturer une observation ouverte → 409 invalid_transition", (await transition(owner, { action: "cloturer", note: "trop tôt" })).body?.error === "invalid_transition");
const corrigee = await transition(editor, { action: "corriger", revisionId: r2, note: "Corrigé en r2" });
check("E.2-04 le responsable déclare la correction contre r2 (≥ révision du contrôle)", corrigee.status === 200 && corrigee.body?.statut === "corrigee" && corrigee.body.correctionRevisionId === r2);
check("E.2-04 le recontrôle porte sur la correction ou une révision postérieure (409 revision_anterieure)", (await transition(owner, { action: "recontroler", revisionId: r1 })).body?.error === "revision_anterieure");
const recontrolee = await transition(owner, { action: "recontroler", revisionId: r3 });
check("E.2-04 l'auteur (propriétaire) recontrôle contre r3", recontrolee.status === 200 && recontrolee.body?.statut === "recontrolee" && recontrolee.body.recontroleRevisionId === r3);
const refusEditeur = await transition(editor, { action: "cloturer", note: "Je clôture" });
check("E.2-05 refus serveur : l'éditeur responsable ne clôt pas (403)", refusEditeur.status === 403 && refusEditeur.body?.error === "forbidden", j(refusEditeur.body));
check("E.2-05 refus serveur : le lecteur ne clôt pas (403)", (await transition(reader, { action: "cloturer", note: "x" })).status === 403);
check("E.2-04 décision de clôture non motivée → 400 motif_exige", (await transition(owner, { action: "cloturer" })).body?.code === "motif_exige");
const attente = await transition(owner, { action: "cloturer", note: "Recontrôle conforme" });
check("E.2-04 clôture refusée tant qu'une tâche reste à faire (409 taches_ouvertes)", attente.status === 409 && attente.body?.error === "taches_ouvertes" && attente.body?.count === 2, j(attente.body));
check("E.2-03 le propriétaire termine et annule les tâches restantes", (await passe(owner, T2, { action: "terminer" })).status === 200 && (await passe(owner, T3, { action: "annuler" })).status === 200);
const close = await transition(owner, { action: "cloturer", note: "Recontrôle conforme en r3" });
const derniere = close.body?.decisions?.at(-1);
check("E.2-04 / E.2-05 le propriétaire clôt : décision de clôture consignée (motif, rôle, révision recontrôlée)", close.status === 200 && close.body.statut === "cloturee"
  && derniere?.nature === "decision" && derniere?.portee === "cloture" && derniere?.actorRole === "proprietaire" && derniere?.texte === "Recontrôle conforme en r3" && derniere?.revisionId === r3, j(close.body?.decisions));
check("E.2-04 journal des passages ordonné (ouvrir, corriger, recontrôler, clôturer)", j(close.body?.journal?.map((e) => e.action)) === '["ouvrir","corriger","recontroler","cloturer"]');
const fige = await Promise.all([tache(owner, { libelle: "x", assigneeId: ids.owner }), owner("POST", `${one(O)}/liens`, { domaine: "objet", ref: "ligne-1" }), decide(owner, { nature: "proposition", portee: "autre", texte: "x" })]);
check("E.2-04 observation clôturée figée : ni tâche, ni lien, ni décision (409 observation_cloturee)", fige.every((r) => r.status === 409 && r.body?.error === "observation_cloturee"), fige.map((r) => r.status).join(" "));
check("E.2-04 rien n'est proposé sur une observation clôturée (possibles, peut)", j(close.body?.peut) === j({ lier: false, creerTache: false, proposer: false, decider: false }) && j(close.body?.possibles) === '["rouvrir"]');
const reouv = await transition(reader, { action: "rouvrir" });
check("E.2-04 rouvrir réservé à l'auteur ou au propriétaire (lecteur non auteur → 403) ; le propriétaire rouvre", reouv.status === 403 && (await transition(owner, { action: "rouvrir", note: "Nouvel écart" })).body?.statut === "rouverte");
check("E.2-04 l'élément reste suivi par la même identité après réouverture", (await owner("GET", `${obsPath}?domaine=exigence&ref=exi-1`)).body?.observations?.[0]?.id === O);

// ---------------------------------------------------------------------------
// EX-086 — réexamen : le contrôle d'une nouvelle révision rapproche les observations par identité/source/règle ;
// un objet disparu est marqué, jamais clos.
const obsLigne = await owner("POST", obsPath, { body: "Ligne à reprendre (recette)", responsableId: ids.editor, revisionId: r3, objectIds: ["ligne-1"], liens: [{ domaine: "objet", ref: "ligne-1", revisionId: r3 }], requestId: rid(), audience: "projet" });
const OL = obsLigne.body?.id;
check("EX-086 préparation : observation ancrée sur ligne-1 (r3)", obsLigne.status === 201 && Boolean(OL), j(obsLigne.body).slice(0, 300));
const r4 = (await envoi(r3, [{ toolId: "studio.dessin.supprimer", params: { ids: ["ligne-1"] } }])).body?.revision?.id;
const ctl4 = await owner("POST", `${vp}/controles`, { revisionId: r4, requestId: rid() });
const rapLigne = ctl4.body?.rapprochements?.find((x) => x.observationId === OL);
check("EX-086 contrôle de r4 : l'observation est rapprochée, objet disparu marqué, statut inchangé (ouverte)", ctl4.status === 201 && rapLigne?.suivi === "objet-disparu" && rapLigne.statut === "ouverte", j(ctl4.body?.rapprochements));
const rapO = ctl4.body?.rapprochements?.find((x) => x.observationId === O);
check("EX-086 l'observation rouverte (exigence, mur) est rapprochée par règle et identité, sans changer de statut", rapO?.statut === "rouverte" && ["persiste", "a-recontroler"].includes(rapO.suivi), j(rapO));
const relueLigne = (await owner("GET", one(OL))).body;
check("EX-086 aucune fermeture automatique : observation toujours ouverte, journal inchangé (ouvrir seul)", relueLigne?.statut === "ouverte" && j(relueLigne.journal?.map((e) => e.action)) === '["ouvrir"]', j(relueLigne?.journal));
const consignes = (await reader("GET", `${obsPath}/rapprochements`)).body?.rapprochements ?? [];
check("EX-086 le lecteur lit le rapprochement consigné (révision, contrôle, éléments)", consignes.some((x) => x.observationId === OL && x.revisionId === r4 && x.checkId === ctl4.body?.id && x.suivi === "objet-disparu"
  && x.elements.some((e) => e.domaine === "objet" && e.ref === "ligne-1" && e.issue === "disparu")), j(consignes).slice(0, 400));
check("EX-086 le lecteur ne lance pas de rapprochement (403)", (await reader("POST", `${obsPath}/rapprochements`, {})).status === 403);
const surR3 = await editor("POST", `${obsPath}/rapprochements`, { revisionId: r3 });
check("EX-086 sur r3 (objet présent) : l'objet est retrouvé, à recontrôler", surR3.status === 200 && surR3.body?.resultats?.find((x) => x.observationId === OL)?.suivi === "a-recontroler", j(surR3.body).slice(0, 300));

// ---------------------------------------------------------------------------
// Notifications et refus d'accès.
const notes = async (c, prefix) => ((await c("GET", "/notifications")).body?.items ?? []).filter((n) => String(n.id).startsWith(prefix));
// Observation rouverte : une nouvelle tâche confiée à l'éditeur par le propriétaire.
check("E.2-03 une observation rouverte reçoit de nouveau des tâches", (await tache(owner, { libelle: "Reprendre le nouvel écart", assigneeId: ids.editor })).status === 201);
const tachesEditeur = await notes(editor, "tache-studio:");
// Destinataires : la personne chargée ACTUELLE et le créateur (T3, réattribuée au propriétaire, ne le concerne plus).
check("notifications : l'éditeur est prévenu des passages, faits par d'autres, des tâches qu'il a créées ou qui lui sont confiées",
  tachesEditeur.length === 2 && tachesEditeur.some((n) => n.text.includes("a rouvert la tâche « Reprendre le mur au droit de l'écart »"))
  && tachesEditeur.some((n) => n.text.includes("a créé la tâche « Reprendre le nouvel écart »")) && !tachesEditeur.some((n) => n.text.includes("Mettre à jour le métré")), j(tachesEditeur.map((n) => n.text)));
const decisionsOwner = await notes(owner, "decision-studio:");
check("notifications : le propriétaire (auteur) est prévenu de la proposition de clôture de l'éditeur", decisionsOwner.length === 1 && decisionsOwner[0].text.includes("a proposé de clôturer l’observation"), j(decisionsOwner.map((n) => n.text)));
check("autre compte refusé (403/404), anonyme 401", [403, 404].includes((await foreign("GET", obsPath)).status) && [403, 404].includes((await foreign("POST", `${one(O)}/decisions`, { nature: "proposition", portee: "autre", texte: "x" })).status)
  && (await anonymous("GET", obsPath)).status === 401);
check("filtre de recherche incomplet refusé (400)", (await owner("GET", `${obsPath}?domaine=exigence`)).status === 400);

// ---------------------------------------------------------------------------
// Interface : panneau « Observations ».
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });
const erreurs = [];
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on("pageerror", (e) => erreurs.push(e.message));
  const login = await page.request.post(`${BASE}/auth/login`, { data: cOwner, headers: { origin: BASE } });
  check("interface : propriétaire connecté", login.status() === 200, String(login.status()));
  await page.goto(`${BASE}/studio/projets/${projectId}/etudes/${studyId}/variantes/${variantId}?commentaires=ouverts`);
  const panneau = page.locator("[data-studio-observations]");
  await panneau.waitFor();
  await panneau.locator(`[data-studio-suivi="${O}"]`).waitFor();
  check("interface : l'observation suivie est listée avec ses quatre domaines", (await panneau.locator(`[data-studio-suivi="${O}"] [data-studio-suivi-liens] li`).count()) === 4);
  // EX-086 : le dernier rapprochement est affiché ; « Rapprocher » (icône, raccourci) ne ferme rien.
  await panneau.locator(`[data-studio-suivi="${OL}"] [data-studio-suivi-rapprochement]`).waitFor();
  check("interface : rapprochement affiché « objet disparu », observation toujours ouverte", (await panneau.locator(`[data-studio-suivi="${OL}"]`).getAttribute("data-statut")) === "ouverte"
    && (await panneau.locator(`[data-studio-suivi="${OL}"] [data-studio-suivi-rapprochement]`).getAttribute("data-studio-suivi-rapprochement")) === "objet-disparu");
  const rapprocher = panneau.locator("[data-studio-suivi-rapprocher]");
  check("interface : commande « Rapprocher » avec icône et raccourci déclaré", (await rapprocher.locator("[data-icone-collaboration=\"rapprocher-observations\"]").count()) === 1
    && (await rapprocher.getAttribute("aria-keyshortcuts")) === "Control+Alt+Shift+M");
  await rapprocher.click();
  await panneau.locator("[data-studio-suivi-rapprochement-message]").waitFor();
  check("interface : rapprochement sur demande annoncé, aucune observation close", /aucune n’est close/.test(await panneau.locator("[data-studio-suivi-rapprochement-message]").innerText())
    && (await panneau.locator(`[data-studio-suivi="${OL}"]`).getAttribute("data-statut")) === "ouverte");

  // Identité réemployée : choisir une exigence déjà suivie la signale et bloque une seconde ouverture.
  await panneau.locator("[data-studio-suivi-ouvrir]").click();
  const form = panneau.locator("[data-studio-suivi-ouverture]");
  await form.locator("textarea").fill("Écart constaté sur la seconde exigence");
  await form.locator("[data-studio-suivi-responsable]").selectOption({ label: cOwner.email });
  await form.locator("[data-studio-suivi-domaine]").selectOption("exigence");
  await form.locator("[data-studio-suivi-ref]").selectOption("exi-1");
  await form.locator(`[data-studio-suivi-deja="${O}"]`).waitFor();
  check("interface : un élément déjà suivi est signalé et l'ouverture bloquée (identité réemployée)", await form.locator("[data-studio-suivi-envoyer]").isDisabled());
  await form.locator("[data-studio-suivi-ref]").selectOption("exi-2");
  check("interface : un élément libre rouvre l'envoi", await form.locator("[data-studio-suivi-envoyer]").isEnabled());
  await form.locator("[data-studio-suivi-envoyer]").click();
  const carte = panneau.locator('[data-studio-suivi]:has([data-domaine="exigence"][data-ref="exi-2"])');
  await carte.waitFor();
  check("interface : observation ouverte depuis l'exigence exi-2, vue plan citée", (await carte.locator('[data-studio-suivi-vue="plan"]').count()) === 1);

  // Tâche : ajout, puis « Déclarer faite ».
  await carte.locator('[data-studio-suivi-geste="tache"]').click();
  await carte.locator("[data-studio-suivi-tache-form] input:not([type])").fill("Contrôler la seconde exigence");
  await carte.locator("[data-studio-suivi-tache-form] button[type=submit]").click();
  const tacheUi = carte.locator("[data-studio-suivi-tache]").first();
  await tacheUi.waitFor();
  check("interface : tâche ajoutée, à faire", (await tacheUi.getAttribute("data-statut")) === "a-faire");
  await tacheUi.locator('[data-studio-tache-passage="terminer"]').click();
  await carte.locator('[data-studio-tache-passage-form="terminer"] button[type=submit]').click();
  await carte.locator('[data-studio-suivi-tache][data-statut="faite"]').waitFor();
  check("interface : tâche déclarée faite", true);

  // Décision distincte du propriétaire.
  await carte.locator('[data-studio-suivi-geste="decision"]').click();
  await carte.locator("[data-studio-decision-nature]").selectOption("decision");
  await carte.locator("[data-studio-suivi-decision-form] textarea").fill("Conserver la seconde exigence telle quelle.");
  await carte.locator("[data-studio-suivi-decision-form] button[type=submit]").click();
  await carte.locator('[data-studio-suivi-decisions] li[data-nature="decision"][data-portee="autre"]').waitFor();
  check("interface : décision consignée au journal des décisions", true);

  // Correction → recontrôle → clôture motivée (le propriétaire est ici responsable et auteur).
  const passer = async (action, motif) => {
    await carte.locator(`[data-studio-passage="${action}"]`).click();
    const f = carte.locator(`[data-studio-passage-form="${action}"]`);
    if (motif !== undefined) {
      check("interface : la clôture exige un motif (envoi bloqué sans lui)", await f.locator("button[type=submit]").isDisabled());
      await f.locator("[data-studio-passage-note]").fill(motif);
    }
    await f.locator("button[type=submit]").click();
  };
  await passer("corriger");
  await page.waitForFunction(() => document.querySelector('[data-studio-observations] [data-studio-suivi][data-statut="corrigee"]') !== null);
  await passer("recontroler");
  await page.waitForFunction(() => document.querySelector('[data-studio-observations] [data-studio-suivi][data-statut="recontrolee"]') !== null);
  await passer("cloturer", "Seconde exigence recontrôlée");
  const cloturee = panneau.locator('[data-studio-suivi][data-statut="cloturee"]:has([data-ref="exi-2"])');
  await cloturee.waitFor();
  check("interface : correction, recontrôle et clôture motivée ; décision de clôture affichée", (await cloturee.locator('[data-studio-suivi-decisions] li[data-portee="cloture"][data-nature="decision"]').count()) === 1
    && (await cloturee.locator("[data-studio-suivi-gestes] button").count()) === 0);
  check("interface : aucune erreur de page", erreurs.length === 0, erreurs.join(" | "));

  // Interface en anglais : le panneau ne laisse aucun texte d'interface en français (les données restent telles quelles).
  await page.evaluate(() => localStorage.setItem("fadi.langue", "en"));
  await page.reload();
  await page.locator(`[data-studio-observations] [data-studio-suivi="${O}"]`).waitFor();
  await page.locator(`[data-studio-observations] [data-studio-suivi="${O}"] [data-studio-suivi-geste="decision"]`).click().catch(() => {});
  await page.waitForTimeout(800);
  const residus = await page.evaluate(() => {
    const FR = /[éèêàùçœ«»]|\b(le|la|les|des|du|une|est|sont|pour|avec|aucun|aucune|sans|dans|sur|au|aux|et|ou|ce|cette|vos|votre)\b/i;
    const out = [];
    const racine = document.querySelector("[data-studio-observations]");
    const exclu = (n) => { for (let e = n.parentElement; e && e !== racine.parentElement; e = e.parentElement) if (e.getAttribute("translate") === "no" || ["TEXTAREA", "OPTION"].includes(e.tagName)) return true; return false; };
    const w = document.createTreeWalker(racine, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const t = (n.nodeValue ?? "").replace(/\s+/g, " ").trim();
      if (t.length >= 2 && /[A-Za-zÀ-ÿ]/.test(t) && !exclu(n) && FR.test(t)) out.push(t);
    }
    return out;
  });
  const anglais = await page.locator("[data-studio-observations]").innerText();
  check("interface en anglais : panneau traduit (domaines, tâches, décisions)", /Tracked domains \(4\)/.test(anglais) && /Tasks \(\d+\)/.test(anglais) && /Decisions \(\d+\)/.test(anglais), anglais.slice(0, 300));
  check("interface en anglais : aucun texte d'interface du panneau resté en français", residus.length === 0, [...new Set(residus)].join(" | "));
  await page.evaluate(() => localStorage.setItem("fadi.langue", "fr"));
} finally {
  await browser.close();
}

console.log(echecs ? `\n${echecs} échec(s)` : "\nRecette observations Studio : tout est vert.");
process.exit(echecs ? 1 : 0);
