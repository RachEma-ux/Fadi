#!/usr/bin/env node
/**
 * Recette du corpus S6 (X.1-06, REF-02 §18.2 « étude avec plusieurs variantes, révisions, dossiers et contrôles ») :
 * crée par l'API l'étude synthétique du plan `packages/atelier-model/src/studio/corpus/fixtures/s6-plan.json` (généré
 * et contrôlé par `corpus.test.ts`) puis vérifie chaque tête contre l'oracle indépendant joint au plan :
 * 1. variante A : A1 pose le plan de niveau synthétique (100 primitives), A2 ajoute une fenêtre au mur `s6-0-mur-h`
 *    (REC-A-03 : net 3,180 m³ puis 3,096 m³), A3 déplace un texte ; un rejeu de A2 (même requestId) ne crée rien ;
 * 2. variante B dérivée de A à la révision A1 (B1 supprime un mur avec sa fenêtre, B2 ajoute une ligne), variante C
 *    dérivée de la tête de A (C1 ajoute deux lignes) ;
 * 3. comptes par type de chaque tête = oracle ; révisions ajoutées par variante = nombre d'enveloppes ;
 * 4. comparaison de révisions A ↔ B : la ligne de B ajoutée, le texte déplacé en A3 ; la comparaison ne couvre pas
 *    l'architecture, la suppression du mur `s6-1-mur-v` (et de sa fenêtre) est donc vérifiée sur les têtes lues ;
 *    feuille et dossier de conception sur la tête de A, sources identifiées ;
 * 5. exigences de recette (source synthétique, sans valeur réglementaire) contrôlées par le serveur sur chaque tête :
 *    statuts (comparés sans dépendre de l'ordre des écarts) et conclusions attendus, mesures serveur = oracle (volume
 *    net des murs ; REC-A-03 : mur `s6-0-mur-h` mesuré 3,180 m³ sur B et 3,096 m³ sur A et C) ;
 * 6. fusion F1 (lot W3-D) : B fusionnée dans C depuis l'ancêtre commun A1 — conflit de collision d'identifiant sans choix
 *    par défaut (409 tant qu'il n'est pas tranché), choix explicite, une révision `variant-merge` de C conforme à l'oracle
 *    (comptes, ligne gardée, suppressions reprises, volume net mesuré par le serveur), rejeu, annulation.
 * Une étape dont dépend la suite (inscription, étude, enveloppe, feuille…) arrête la recette dès son échec, sans
 * erreur en cascade. Géométrie synthétique, aucune donnée de projet réelle. API seule (aucun navigateur).
 *
 * BASE_URL=http://localhost:3001 node apps/web/e2e/studio-corpus-s6.mjs
 */
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const ICI = dirname(fileURLToPath(import.meta.url));
const { plan, oracle } = JSON.parse(readFileSync(join(ICI, "../../../packages/atelier-model/src/studio/corpus/fixtures/s6-plan.json"), "utf8"));

let echecs = 0;
function check(nom, ok, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${nom}${!ok && detail ? ` — ${detail}` : ""}`);
  if (!ok) echecs++;
}
/** Étape dont dépend la suite : à l'échec, arrêt propre (aucune lecture d'un corps absent, aucun TypeError en cascade). */
function exiger(nom, ok, detail = "") {
  check(nom, ok, detail);
  if (!ok) {
    console.log(`\nArrêt : « ${nom} » a échoué et les étapes suivantes en dépendent (${echecs} échec(s)).`);
    process.exit(1);
  }
}
const court = (x) => JSON.stringify(x)?.slice(0, 400);
/** Statuts par exigence, triés par identifiant : la comparaison ne dépend pas de l'ordre des écarts rendus. */
const statutsTries = (o) => JSON.stringify(Object.entries(o ?? {}).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
const proche = (a, b, tol = 1e-9) => typeof a === "number" && Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));

let cookie = "";
async function api(method, path, body) {
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method, headers: { "content-type": "application/json", origin: BASE, ...(cookie ? { cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (e) {
    // API injoignable : un statut 0 que les étapes exigées transforment en arrêt propre.
    return { status: 0, body: { erreur: `${method} ${path} : ${e?.cause?.code ?? e?.message ?? e}` } };
  }
  const set = res.headers.getSetCookie?.() ?? [];
  if (set.length) cookie = set.map((c) => c.split(";")[0]).join("; ");
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, body: json };
}

check("plan S6 synthétique (fixture du corpus)", plan.scene === "S6" && plan.synthetique === true && /synthétique/.test(plan.licence));
const compte = { email: `corpus-s6-${randomUUID().slice(0, 8)}@example.test`, password: randomBytes(18).toString("hex") };
const inscrit = await api("POST", "/auth/register", compte);
exiger("compte inscrit", inscrit.status === 201, `${inscrit.status} ${court(inscrit.body)}`);
const projetCree = await api("POST", "/projects", { code: `P.S6.${randomUUID().slice(0, 6)}`, name: "Corpus S6 (synthétique)" });
exiger("projet créé", projetCree.status === 201 && projetCree.body?.id, `${projetCree.status} ${court(projetCree.body)}`);
const racine = `/projects/${projetCree.body.id}/studio/studies`;
const etudeCreee = await api("POST", racine, { name: plan.etude });
exiger("étude créée (variante initiale A)", etudeCreee.status === 201 && etudeCreee.body?.study?.id && etudeCreee.body?.variant?.id && etudeCreee.body?.revision?.id, `${etudeCreee.status} ${court(etudeCreee.body)}`);
const etude = etudeCreee.body;
const studyId = etude.study.id;
const chemin = (variantId) => `${racine}/${studyId}/variants/${variantId}`;
const nbRevisions = async (variantId) => {
  const r = await api("GET", `${chemin(variantId)}/revisions`);
  if (!(r.status === 200 && Array.isArray(r.body?.revisions))) exiger(`révisions de ${variantId} lues`, false, `${r.status} ${court(r.body)}`);
  return r.body.revisions.length;
};
/** Lecture d'une ressource dont la suite dépend : 200 exigé. */
async function lire(nom, path) {
  const r = await api("GET", path);
  exiger(nom, r.status === 200 && r.body, `${r.status} ${court(r.body)}`);
  return r.body;
}

const variantes = new Map([["A", { id: etude.variant.id, tete: etude.revision.id, initiales: await nbRevisions(etude.variant.id) }]]);
const apresEtape = new Map();
let enveloppeA2 = null;
for (const e of plan.etapes) {
  if (!variantes.has(e.variante)) {
    const v = plan.variantes.find((x) => x.cle === e.variante);
    const source = variantes.get(v.depuis.variante);
    const cree = await api("POST", `${racine}/${studyId}/variants`, { name: v.nom, fromVariantId: source.id, fromRevisionId: apresEtape.get(v.depuis.apresEtape) });
    exiger(`variante ${v.cle} dérivée de ${v.depuis.variante} après ${v.depuis.apresEtape}`, cree.status === 201 && cree.body?.variant?.id && cree.body?.revision?.id, court(cree.body));
    variantes.set(v.cle, { id: cree.body.variant.id, tete: cree.body.revision.id, initiales: await nbRevisions(cree.body.variant.id) });
  }
  const v = variantes.get(e.variante);
  const enveloppe = { contractVersion: "studio-commands/1", requestId: `s6-${e.cle}-${randomUUID()}`, baseRevisionId: v.tete, commands: e.commandes };
  const r = await api("POST", `${chemin(v.id)}/commands`, enveloppe);
  exiger(`${e.cle} : ${e.libelle} (${e.commandes.length} commande(s))`, r.status === 200 && r.body?.revision?.id && r.body.replayed === false, court(r.body));
  v.tete = r.body.revision.id;
  apresEtape.set(e.cle, v.tete);
  if (e.cle === "A2") enveloppeA2 = enveloppe;
}

// Rejeu : la même enveloppe (même requestId) ne crée aucune révision.
const avantRejeu = await nbRevisions(variantes.get("A").id);
const rejeu = await api("POST", `${chemin(variantes.get("A").id)}/commands`, enveloppeA2);
check("rejeu de A2 (même requestId) : rejoué, aucune révision en double", rejeu.status === 200 && rejeu.body?.replayed === true && (await nbRevisions(variantes.get("A").id)) === avantRejeu, court(rejeu.body));

const comptes = (doc) => {
  const c = {};
  for (const x of [...doc.objects, ...(doc.dimensions ?? []), ...(doc.annotations ?? []), ...(doc.architecture ?? [])]) c[x.type] = (c[x.type] ?? 0) + 1;
  return c;
};
const tetes = new Map();
for (const cle of ["A", "B", "C"]) {
  const v = variantes.get(cle), attendu = oracle.variantes[cle];
  const lu = await lire(`tête ${cle} lue`, chemin(v.id));
  exiger(`tête ${cle} : document présent`, lu.revision?.document, court(lu));
  tetes.set(cle, lu.revision.document);
  const c = comptes(lu.revision.document);
  const obtenu = { wall: c.wall, opening: c.opening, line: c.line, dimension: c.dimension, text: c.text };
  const voulu = { wall: attendu.wall, opening: attendu.opening, line: attendu.line, dimension: attendu.dimension, text: attendu.text };
  check(`tête ${cle} : comptes par type = oracle`, JSON.stringify(obtenu) === JSON.stringify(voulu), `${court(obtenu)} au lieu de ${court(voulu)}`);
  check(`tête ${cle} : tête lue = dernière révision écrite`, lu.revision.id === v.tete);
  const ajoutees = (await nbRevisions(v.id)) - v.initiales;
  check(`variante ${cle} : ${oracle.revisionsAjoutees[cle]} révision(s) ajoutée(s)`, ajoutees === oracle.revisionsAjoutees[cle], String(ajoutees));
}
const pose = await lire("révision A1 lue", `${chemin(variantes.get("A").id)}/revisions/${apresEtape.get("A1")}`);
// L'identifiant du document est celui que le serveur donne à la variante ; tout le reste est le plan, à l'octet.
const sansId = ({ id: _id, ...reste }) => JSON.stringify(reste);
check("A1 : le document posé est exactement le plan de base du corpus (hors identifiant du document)", sansId(pose.revision.document) === sansId(plan.base), `${pose.revision.document.id} / ${plan.base.id}`);

const comparaison = await api("GET", `${racine}/${studyId}/compare?from=${variantes.get("A").id}&to=${variantes.get("B").id}`);
exiger("comparaison A ↔ B (lecture seule)", comparaison.status === 200 && comparaison.body?.difference, `${comparaison.status} ${court(comparaison.body)}`);
const diff = comparaison.body.difference;
const etatDe = (famille, id) => (diff[famille] ?? []).find((x) => x.id === id)?.etat;
check("comparaison A ↔ B : têtes comparées = têtes écrites", comparaison.body.from?.revisionId === variantes.get("A").tete && comparaison.body.to?.revisionId === variantes.get("B").tete, court({ from: comparaison.body.from, to: comparaison.body.to }));
check("comparaison A ↔ B : la ligne s6-b-ligne de B est « ajoutée »", etatDe("objets", "s6-b-ligne") === "ajoute", String(etatDe("objets", "s6-b-ligne")));
const texte = (diff.annotations ?? []).find((x) => x.id === "s6-0-piece");
check("comparaison A ↔ B : le texte s6-0-piece (déplacé en A3, pas dans B) est « modifié », translation de −0,5 / −0,5", texte?.etat === "modifie" && proche(texte?.deplacement?.dx, -0.5) && proche(texte?.deplacement?.dy, -0.5), court(texte));
check("comparaison A ↔ B : résumé exact (un objet ajouté, une annotation modifiée, aucune cote touchée)",
  diff.resume?.objets?.ajoute === 1 && diff.resume.objets.supprime === 0 && diff.resume.objets.modifie === 0 && diff.resume.annotations?.modifie === 1 && diff.resume.cotes?.ajoute + diff.resume.cotes?.supprime + diff.resume.cotes?.modifie === 0,
  court(diff.resume));
// La comparaison ne porte pas sur l'architecture : la suppression du mur s6-1-mur-v (B1) est vérifiée sur les têtes.
const archi = (cle) => new Set((tetes.get(cle).architecture ?? []).map((x) => x.id));
check("B1 : s6-1-mur-v et sa fenêtre présents dans A, supprimés dans B (cascade), seuls éléments architecturaux en moins (hors fenêtre ajoutée en A2)",
  archi("A").has("s6-1-mur-v") && archi("A").has("s6-1-fenetre") && !archi("B").has("s6-1-mur-v") && !archi("B").has("s6-1-fenetre")
    && JSON.stringify([...archi("A")].filter((id) => !archi("B").has(id)).sort()) === JSON.stringify(["s6-0-fenetre-ajoutee", "s6-1-fenetre", "s6-1-mur-v"]),
  court([...archi("A")].filter((id) => !archi("B").has(id))));
console.log("  (la comparaison de révisions ne couvre pas l'architecture : suppression du mur contrôlée sur les têtes lues)");

// Feuille et dossier de conception sur la tête de A.
const { variante: _v, ...feuille } = plan.feuille;
const f = await api("POST", `${chemin(variantes.get("A").id)}/sheets`, feuille);
exiger("feuille créée sur la tête de A", f.status === 201 && f.body?.id && f.body?.revisionId === variantes.get("A").tete, court(f.body));
const d = await api("POST", `${racine}/${studyId}/dossiers`, { title: plan.dossier.title, sheetIds: [f.body.id] });
exiger("dossier de conception créé", d.status === 201 && d.body?.id, court(d.body));
const dossier = await lire("dossier lu", `${racine}/${studyId}/dossiers/${d.body.id}`);
check("dossier : une feuille, source = tête de A", dossier.assembly?.feuilles?.length === 1 && dossier.assembly.sources?.[0]?.revisionId === variantes.get("A").tete, court(dossier.assembly?.sources));

// Exigences de recette et contrôles serveur sur chaque tête.
const exigences = plan.exigences.map((e) => ({ ...e, valeur: oracle.exigences.valeurs[e.id] }));
const jeu = await api("POST", `${racine}/${studyId}/exigences`, { baseVersion: 0, exigences, motif: "Recette du corpus S6 (synthétique)" });
exiger("exigences de recette enregistrées (version 1)", jeu.status === 201 && jeu.body?.version === 1, court(jeu.body));
const murServeur = new Map();
for (const cle of ["A", "B", "C"]) {
  const ctl = await api("POST", `${chemin(variantes.get(cle).id)}/controles`, {});
  exiger(`contrôle ${cle} : exécuté`, ctl.status === 201 && ctl.body?.execution === "execute" && Array.isArray(ctl.body?.resultat?.ecarts), `${ctl.status} ${court(ctl.body)}`);
  const ecarts = ctl.body.resultat.ecarts;
  const statuts = Object.fromEntries(ecarts.map((e) => [e.exigenceId, e.statut]));
  check(`contrôle ${cle} : conclusion ${oracle.exigences.conclusions[cle]}`, ctl.body.conclusion === oracle.exigences.conclusions[cle], court(ctl.body.conclusion));
  check(`contrôle ${cle} : statut de chaque exigence = oracle (indépendant de l'ordre)`, ecarts.length === Object.keys(oracle.exigences.statuts[cle]).length && statutsTries(statuts) === statutsTries(oracle.exigences.statuts[cle]), court(statuts));
  const mesure = (id) => ecarts.find((e) => e.exigenceId === id)?.mesure?.valeur;
  check(`contrôle ${cle} : volume net des murs mesuré par le serveur = oracle`, proche(mesure("s6-volume-net"), oracle.variantes[cle].murs.net), String(mesure("s6-volume-net")));
  murServeur.set(cle, mesure("s6-mur-0"));
}
// REC-A-03 : mesure serveur du mur s6-0-mur-h comparée à l'oracle sur chaque tête (et non seulement la valeur exigée).
check("REC-A-03 : s6-0-mur-h mesuré par le serveur 3,180 m³ net sur B (avant la fenêtre de A2)", proche(murServeur.get("B"), 3.18) && proche(murServeur.get("B"), oracle.premierMur.avant.net), String(murServeur.get("B")));
check("REC-A-03 : s6-0-mur-h mesuré par le serveur 3,096 m³ net sur A et sur C (après la fenêtre de A2)",
  ["A", "C"].every((cle) => proche(murServeur.get(cle), 3.096) && proche(murServeur.get(cle), oracle.premierMur.apres.net)) && proche(oracle.exigences.valeurs["s6-mur-0"], 3.096),
  court(Object.fromEntries(murServeur)));
const ctlB = await lire("contrôles de B relus", `${chemin(variantes.get("B").id)}/controles`);
const murB = ctlB.controles?.[0]?.resultat?.ecarts?.find((e) => e.exigenceId === "s6-mur-0")?.mesure?.valeur;
check("contrôle de B relu : même mesure serveur de s6-0-mur-h (3,180 m³)", proche(murB, murServeur.get("B")), String(murB));

// 6. Fusion de variantes (lot W3-D, X.1-06) : F1 — B fusionnée dans C depuis leur ancêtre commun (A1), conflit tranché
// explicitement, une révision `variant-merge` de C, puis annulation (révision `variant-merge-undo`).
for (const f of plan.fusions ?? []) {
  const attendu = oracle.fusions[f.cle];
  const src = variantes.get(f.source), cib = variantes.get(f.cible);
  const fusion = `${chemin(cib.id)}/fusion`;
  const ap = await api("POST", `${fusion}/apercu`, { sourceVariantId: src.id });
  exiger(`${f.cle} : aperçu de la fusion ${f.source} → ${f.cible} lu`, ap.status === 200 && ap.body?.apercu?.schema === "studio-fusion/1", `${ap.status} ${court(ap.body)}`);
  check(`${f.cle} : ancêtre commun = révision ${attendu.ancetre} (dérivation de ${f.source})`, ap.body.ancetre?.revisionId === apresEtape.get(attendu.ancetre), court(ap.body.ancetre));
  check(`${f.cle} : conflits attendus, sans aucun choix par défaut`, JSON.stringify(ap.body.apercu.conflits.map((c) => c.id)) === JSON.stringify(attendu.conflits) && ap.body.apercu.conflits.every((c) => c.resolution === null)
    && JSON.stringify(ap.body.apercu.nonResolus) === JSON.stringify(attendu.conflits), court(ap.body.apercu.conflits));
  const avant = await nbRevisions(cib.id);
  const sansChoix = await api("POST", fusion, { requestId: `s6-${f.cle}-sans`, sourceVariantId: src.id, sourceRevisionId: ap.body.source.revisionId, baseRevisionId: ap.body.cible.revisionId, empreinte: ap.body.apercu.empreinte ?? "0".repeat(64) });
  check(`${f.cle} : sans choix explicite, refus 409 conflits_non_resolus et rien n'est écrit`, sansChoix.status === 409 && sansChoix.body?.error === "conflits_non_resolus" && (await nbRevisions(cib.id)) === avant, `${sansChoix.status} ${court(sansChoix.body)}`);
  const choisi = await api("POST", `${fusion}/apercu`, { sourceVariantId: src.id, resolutions: f.resolutions });
  exiger(`${f.cle} : aperçu avec les choix — valide, aucun conflit ouvert`, choisi.status === 200 && choisi.body.apercu.valide && choisi.body.apercu.nonResolus.length === 0 && choisi.body.apercu.aFusionner, court(choisi.body?.apercu));
  const corps = { requestId: `s6-${f.cle}-${randomUUID()}`, sourceVariantId: src.id, sourceRevisionId: choisi.body.source.revisionId, baseRevisionId: choisi.body.cible.revisionId, empreinte: choisi.body.apercu.empreinte, resolutions: f.resolutions };
  const ecrite = await api("POST", fusion, corps);
  exiger(`${f.cle} : fusion appliquée en une révision de ${f.cible}`, ecrite.status === 200 && ecrite.body?.revision?.id && ecrite.body.fusion?.type === "fusion", `${ecrite.status} ${court(ecrite.body)}`);
  const revisions = await lire(`${f.cle} : révisions de ${f.cible} relues`, `${chemin(cib.id)}/revisions`);
  const r = revisions.revisions.find((x) => x.id === ecrite.body.revision.id);
  check(`${f.cle} : une seule révision ajoutée, source variant-merge, parent = tête de ${f.cible} avant fusion`, revisions.revisions.length === avant + 1 && r?.source === "variant-merge" && r?.parentRevisionId === corps.baseRevisionId, court(r));
  check(`${f.cle} : provenance consignée (source, ancêtre, choix)`, ecrite.body.fusion.sourceRevisionId === src.tete && ecrite.body.fusion.ancetreRevisionId === apresEtape.get(attendu.ancetre) && JSON.stringify(ecrite.body.fusion.resolutions) === JSON.stringify(f.resolutions), court(ecrite.body.fusion));
  const lu = await lire(`${f.cle} : tête fusionnée lue`, chemin(cib.id));
  const c = comptes(lu.revision.document), t = attendu.tete;
  check(`${f.cle} : comptes par type de la tête fusionnée = oracle`, JSON.stringify({ wall: c.wall, opening: c.opening, line: c.line, dimension: c.dimension, text: c.text }) === JSON.stringify({ wall: t.wall, opening: t.opening, line: t.line, dimension: t.dimension, text: t.text }), court(c));
  const gardee = lu.revision.document.objects.find((o) => o.id === attendu.ligneGardee.id);
  check(`${f.cle} : ligne ${attendu.ligneGardee.id} = version choisie (source), y = ${attendu.ligneGardee.y}`, gardee?.start?.y === attendu.ligneGardee.y, court(gardee));
  const archiF = new Set((lu.revision.document.architecture ?? []).map((x) => x.id));
  check(`${f.cle} : suppressions de ${f.source} reprises (mur s6-1-mur-v et sa fenêtre) ; fenêtre de A2 conservée`, attendu.supprimes.every((k) => !archiF.has(k.slice(k.indexOf(":") + 1))) && archiF.has("s6-0-fenetre-ajoutee"), court([...archiF]));
  const ctl = await api("POST", `${chemin(cib.id)}/controles`, {});
  const net = ctl.body?.resultat?.ecarts?.find((e) => e.exigenceId === "s6-volume-net")?.mesure?.valeur;
  check(`${f.cle} : volume net des murs de la tête fusionnée mesuré par le serveur = oracle`, ctl.status === 201 && proche(net, t.murs.net), String(net));
  const rejeu = await api("POST", fusion, corps);
  check(`${f.cle} : rejeu (même requestId) — réponse d'origine, aucune révision en double`, rejeu.status === 200 && rejeu.body?.replayed === true && rejeu.body.revision?.id === ecrite.body.revision.id && (await nbRevisions(cib.id)) === avant + 1, court(rejeu.body));
  const annulee = await api("POST", `${fusion}/annulation`, { requestId: `s6-${f.cle}-annule-${randomUUID()}`, revisionId: ecrite.body.revision.id });
  check(`${f.cle} : annulation — nouvelle révision variant-merge-undo au document d'avant la fusion`, annulee.status === 200 && annulee.body?.fusion?.type === "annulation"
    && JSON.stringify(annulee.body.revision.document) === JSON.stringify(tetes.get(f.cible)), `${annulee.status} ${court(annulee.body?.fusion)}`);
  const encore = await api("POST", `${fusion}/apercu`, { sourceVariantId: src.id });
  check(`${f.cle} : après l'annulation, la même fusion se propose de nouveau (ancêtre ${attendu.ancetre}, mêmes conflits)`, encore.status === 200 && encore.body.ancetre?.revisionId === apresEtape.get(attendu.ancetre) && JSON.stringify(encore.body.apercu.nonResolus) === JSON.stringify(attendu.conflits), court(encore.body?.ancetre));
}

console.log(echecs ? `\n${echecs} échec(s)` : "\nRecette du corpus S6 : tout est conforme à l'oracle.");
process.exit(echecs ? 1 : 0);
