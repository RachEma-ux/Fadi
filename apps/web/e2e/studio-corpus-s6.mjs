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
 * 4. comparaison de révisions A ↔ B ; feuille et dossier de conception sur la tête de A, sources identifiées ;
 * 5. exigences de recette (source synthétique, sans valeur réglementaire) contrôlées par le serveur sur chaque tête :
 *    statuts et conclusions attendus, mesures serveur = oracle (volume net des murs, mur `s6-0-mur-h`).
 * Géométrie synthétique, aucune donnée de projet réelle. API seule (aucun navigateur).
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
const court = (x) => JSON.stringify(x)?.slice(0, 400);
const proche = (a, b, tol = 1e-9) => typeof a === "number" && Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));

let cookie = "";
async function api(method, path, body) {
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
}

check("plan S6 synthétique (fixture du corpus)", plan.scene === "S6" && plan.synthetique === true && /synthétique/.test(plan.licence));
const compte = { email: `corpus-s6-${randomUUID().slice(0, 8)}@example.test`, password: randomBytes(18).toString("hex") };
check("compte inscrit", (await api("POST", "/auth/register", compte)).status === 201);
const projet = (await api("POST", "/projects", { code: `P.S6.${randomUUID().slice(0, 6)}`, name: "Corpus S6 (synthétique)" })).body;
const racine = `/projects/${projet.id}/studio/studies`;
const etude = (await api("POST", racine, { name: plan.etude })).body;
const studyId = etude.study.id;
const chemin = (variantId) => `${racine}/${studyId}/variants/${variantId}`;
const nbRevisions = async (variantId) => (await api("GET", `${chemin(variantId)}/revisions`)).body.revisions.length;

const variantes = new Map([["A", { id: etude.variant.id, tete: etude.revision.id, initiales: await nbRevisions(etude.variant.id) }]]);
const apresEtape = new Map();
let enveloppeA2 = null;
for (const e of plan.etapes) {
  if (!variantes.has(e.variante)) {
    const v = plan.variantes.find((x) => x.cle === e.variante);
    const source = variantes.get(v.depuis.variante);
    const cree = await api("POST", `${racine}/${studyId}/variants`, { name: v.nom, fromVariantId: source.id, fromRevisionId: apresEtape.get(v.depuis.apresEtape) });
    check(`variante ${v.cle} dérivée de ${v.depuis.variante} après ${v.depuis.apresEtape}`, cree.status === 201 && cree.body?.variant?.id, court(cree.body));
    variantes.set(v.cle, { id: cree.body.variant.id, tete: cree.body.revision.id, initiales: await nbRevisions(cree.body.variant.id) });
  }
  const v = variantes.get(e.variante);
  const enveloppe = { contractVersion: "studio-commands/1", requestId: `s6-${e.cle}-${randomUUID()}`, baseRevisionId: v.tete, commands: e.commandes };
  const r = await api("POST", `${chemin(v.id)}/commands`, enveloppe);
  check(`${e.cle} : ${e.libelle} (${e.commandes.length} commande(s))`, r.status === 200 && r.body?.revision?.id && r.body.replayed === false, court(r.body));
  v.tete = r.body.revision.id;
  apresEtape.set(e.cle, v.tete);
  if (e.cle === "A2") enveloppeA2 = enveloppe;
}

// Rejeu : la même enveloppe (même requestId) ne crée aucune révision.
const avantRejeu = await nbRevisions(variantes.get("A").id);
const rejeu = await api("POST", `${chemin(variantes.get("A").id)}/commands`, enveloppeA2);
check("rejeu de A2 (même requestId) : rejoué, aucune révision en double", rejeu.status === 200 && rejeu.body.replayed === true && (await nbRevisions(variantes.get("A").id)) === avantRejeu, court(rejeu.body));

const comptes = (doc) => {
  const c = {};
  for (const x of [...doc.objects, ...(doc.dimensions ?? []), ...(doc.annotations ?? []), ...(doc.architecture ?? [])]) c[x.type] = (c[x.type] ?? 0) + 1;
  return c;
};
for (const cle of ["A", "B", "C"]) {
  const v = variantes.get(cle), attendu = oracle.variantes[cle];
  const lu = (await api("GET", chemin(v.id))).body;
  const c = comptes(lu.revision.document);
  const obtenu = { wall: c.wall, opening: c.opening, line: c.line, dimension: c.dimension, text: c.text };
  const voulu = { wall: attendu.wall, opening: attendu.opening, line: attendu.line, dimension: attendu.dimension, text: attendu.text };
  check(`tête ${cle} : comptes par type = oracle`, JSON.stringify(obtenu) === JSON.stringify(voulu), `${court(obtenu)} au lieu de ${court(voulu)}`);
  check(`tête ${cle} : tête lue = dernière révision écrite`, lu.revision.id === v.tete);
  const ajoutees = (await nbRevisions(v.id)) - v.initiales;
  check(`variante ${cle} : ${oracle.revisionsAjoutees[cle]} révision(s) ajoutée(s)`, ajoutees === oracle.revisionsAjoutees[cle], String(ajoutees));
}
const pose = (await api("GET", `${chemin(variantes.get("A").id)}/revisions/${apresEtape.get("A1")}`)).body;
// L'identifiant du document est celui que le serveur donne à la variante ; tout le reste est le plan, à l'octet.
const sansId = ({ id: _id, ...reste }) => JSON.stringify(reste);
check("A1 : le document posé est exactement le plan de base du corpus (hors identifiant du document)", sansId(pose.revision.document) === sansId(plan.base), `${pose.revision.document.id} / ${plan.base.id}`);

const comparaison = await api("GET", `${racine}/${studyId}/compare?from=${variantes.get("A").id}&to=${variantes.get("B").id}`);
check("comparaison A ↔ B (lecture seule)", comparaison.status === 200, String(comparaison.status));

// Feuille et dossier de conception sur la tête de A.
const { variante: _v, ...feuille } = plan.feuille;
const f = await api("POST", `${chemin(variantes.get("A").id)}/sheets`, feuille);
check("feuille créée sur la tête de A", f.status === 201 && f.body?.revisionId === variantes.get("A").tete, court(f.body));
const d = await api("POST", `${racine}/${studyId}/dossiers`, { title: plan.dossier.title, sheetIds: [f.body.id] });
check("dossier de conception créé", d.status === 201, court(d.body));
const dossier = (await api("GET", `${racine}/${studyId}/dossiers/${d.body.id}`)).body;
check("dossier : une feuille, source = tête de A", dossier.assembly?.feuilles?.length === 1 && dossier.assembly.sources?.[0]?.revisionId === variantes.get("A").tete, court(dossier.assembly?.sources));

// Exigences de recette et contrôles serveur sur chaque tête.
const exigences = plan.exigences.map((e) => ({ ...e, valeur: oracle.exigences.valeurs[e.id] }));
const jeu = await api("POST", `${racine}/${studyId}/exigences`, { baseVersion: 0, exigences, motif: "Recette du corpus S6 (synthétique)" });
check("exigences de recette enregistrées (version 1)", jeu.status === 201 && jeu.body?.version === 1, court(jeu.body));
for (const cle of ["A", "B", "C"]) {
  const ctl = await api("POST", `${chemin(variantes.get(cle).id)}/controles`, {});
  const statuts = Object.fromEntries((ctl.body?.resultat?.ecarts ?? []).map((e) => [e.exigenceId, e.statut]));
  check(`contrôle ${cle} : exécuté, conclusion ${oracle.exigences.conclusions[cle]}`, ctl.status === 201 && ctl.body.execution === "execute" && ctl.body.conclusion === oracle.exigences.conclusions[cle], court(ctl.body));
  check(`contrôle ${cle} : statut de chaque exigence = oracle`, JSON.stringify(statuts) === JSON.stringify(oracle.exigences.statuts[cle]), court(statuts));
  const mesure = (id) => ctl.body?.resultat?.ecarts?.find((e) => e.exigenceId === id)?.mesure?.valeur;
  check(`contrôle ${cle} : volume net des murs mesuré par le serveur = oracle`, proche(mesure("s6-volume-net"), oracle.variantes[cle].murs.net), String(mesure("s6-volume-net")));
}
const ctlB = await api("GET", `${chemin(variantes.get("B").id)}/controles`);
const murB = ctlB.body.controles[0]?.resultat?.ecarts?.find((e) => e.exigenceId === "s6-mur-0")?.mesure?.valeur;
check("REC-A-03 : s6-0-mur-h net 3,180 m³ sur B (avant la fenêtre), 3,096 m³ exigé sur A", proche(murB, oracle.premierMur.avant.net) && proche(oracle.exigences.valeurs["s6-mur-0"], 3.096), String(murB));

console.log(echecs ? `\n${echecs} échec(s)` : "\nRecette du corpus S6 : tout est conforme à l'oracle.");
process.exit(echecs ? 1 : 0);
