import { beforeEach, describe, expect, it, vi } from "vitest";
/**
 * Réserve G1 (ADR-STUDIO-PILOTE-01 P-11) — contrats versionnés des routes de l'API Studio, exécutés de bout en bout sur
 * le routeur Express réel, base simulée en mémoire (`testing/studio-base-simulee.ts` ; garde DB fermée, aucune base ni
 * serveur). Un cas par route déclarée (et par action notable) : la réponse de succès est conforme au schéma de son
 * contrat (`lib/studio-contrats-routes.ts`, strict au premier niveau), son statut est l'un des statuts déclarés, et
 * l'en-tête `X-Studio-Contrat` porte l'identifiant versionné. Une version demandée incompatible est refusée (400
 * `contrat_incompatible`) avant tout contrôle d'accès, sans écriture ; la version exacte demandée est servie. Enfin,
 * chaque route du routeur porte son contrat (inventaire à l'exécution, sous-routeurs compris).
 *
 * Rangée sous `routes/` comme la matrice des droits : supertest ouvre une socket de boucle locale, que les sentinelles
 * réseau de `vitest.guard.config.ts` refusent ; aucune base n'est touchée.
 */
vi.mock("../db/client.js", async () => ({ db: (await import("../testing/studio-base-simulee.js")).baseSimulee() }));
vi.mock("../middleware/require-auth.js", async () => (await import("../testing/studio-base-simulee.js")).authSimulee());
vi.mock("../lib/owned-project.js", async (original) => (await import("../testing/studio-base-simulee.js")).accesSimule(await original<typeof import("../lib/owned-project.js")>()));
vi.mock("../lib/step-rows.js", () => ({ lockProject: vi.fn(async () => undefined) }));
vi.mock("../lib/atelier-exact.js", () => ({ TYPE_CREER_EXACT: "solideExact.creer", revaliderSolidesExacts: vi.fn() }));
vi.mock("../lib/atelier-events.js", () => ({ EVENEMENT_COMMANDE_VALIDEE: "atelier.commande.validee", enregistrerEvenement: vi.fn() }));
vi.mock("../lib/atelier-modele.js", () => ({ chargerModele: vi.fn(), creerModeleVide: vi.fn(), persisterDifferentiel: vi.fn() }));
vi.mock("../lib/atelier-refexterne.js", () => ({ controlerRattachements: vi.fn() }));

import { readFileSync } from "node:fs";
import express from "express";
import request from "supertest";
import { STUDIO_CONTRACT, studioExporterBcf, studioSujetsBcf } from "@parcours/atelier-model";
import { projects } from "../db/schema.js";
import { STUDIO_CONTRAT_ENTETE, studioReponseRefus, type StudioContratRoute, type StudioGestionnaireContrat } from "../lib/studio-contrats.js";
import * as C from "../lib/studio-contrats-routes.js";
import { STUDIO_EXEMPLE_P118 } from "../lib/studio-exemple.js";
import { studioProvenanceRendu } from "@parcours/atelier-model";
import { creerJetonAgent, proposerCommandes } from "../lib/studio-agents.js";
import { ecrirePng } from "../lib/studio-png.js";
import { studioRouter } from "./studio.js";
import { banc, initialiserProjet, verdicts, type Acteur } from "../testing/studio-base-simulee.js";

const app = express();
app.use("/projects/:projectId/studio", studioRouter);
app.use((err: unknown, _req: unknown, res: { status: (n: number) => { json: (b: unknown) => void } }, _next: unknown) => {
  res.status(500).json({ error: "erreur", message: String((err as Error)?.message ?? err) });
});

type Contexte = Record<string, string>;
type Methode = "get" | "post" | "put" | "patch" | "delete";
interface Cas {
  /** Libellé du contrôle (écrit tel quel : cité comme preuve). */
  libelle: string;
  contrat: StudioContratRoute;
  route: string;
  url: (c: Contexte) => string;
  corps?: (c: Contexte) => unknown;
  preparer?: () => Promise<Contexte>;
  acteur?: Acteur;
}

const S = "/projects/p/studio";
const V = `${S}/studies/s/variants/v`;
const PUB = "/studies/:studyId/publications/:publicationId";
const OBS = "/studies/:studyId/variants/:variantId/observations";
const COM = "/studies/:studyId/variants/:variantId/comments";
const MX = "/studies/:studyId/variants/:variantId/modeles-externes";
const comme = (a: Acteur, r: request.Test) => r.set("x-acteur", a);
const appel = (a: Acteur, m: Methode, url: string, corps?: unknown) => {
  const r = comme(a, request(app)[m](url));
  return corps === undefined ? r : r.send(corps as object);
};
async function creer(url: string, body: unknown, lireId: (b: Record<string, any>) => unknown = (b) => b?.id, acteur: Acteur = "proprietaire"): Promise<string> {
  const res = await appel(acteur, "post", url, body);
  const id = lireId(res.body);
  if (res.status >= 300 || typeof id !== "string") throw new Error(`préparation ${url} : ${res.status} ${JSON.stringify(res.body).slice(0, 300)}`);
  return id;
}
async function exiger(m: Methode, url: string, body?: unknown, acteur: Acteur = "proprietaire"): Promise<Record<string, any>> {
  const res = await appel(acteur, m, url, body);
  if (res.status >= 300) throw new Error(`préparation ${m} ${url} : ${res.status} ${JSON.stringify(res.body).slice(0, 300)}`);
  return res.body;
}

const exigence = { id: "e1", libelle: "Exigence e1", metrique: { type: "nombre" }, comparaison: "<=", valeur: 10, unite: "u", source: "Programme saisi (essai)" };
const jeu = async () => { await creer(`${S}/studies/s/exigences`, { baseVersion: 0, exigences: [exigence] }, (b) => String(b?.version)); return {}; };
/** Jeu dont une exigence est reprise d'une référence partenaire (seule une telle exigence s'accepte). */
const jeuReference = async () => { await creer(`${S}/studies/s/exigences`, { baseVersion: 0, exigences: [{ ...exigence, id: "p1", libelle: "Exigence reprise", origine: { reference: "R-1" } }] }, (b) => String(b?.version)); return {}; };
const publication = async () => ({ pub: await creer(`${V}/publications`, { title: "Dossier d'essai", contenu: "dessin-2d" }) });
const soumise = async () => {
  const { pub } = await publication();
  const v = await exiger("post", `${S}/studies/s/publications/${pub}/soumettre`, {});
  return { pub, manifestHash: v["manifestHash"], revisionId: v["revisionId"], documentHash: v["documentHash"] };
};
const approuvee = async () => {
  const c = await soumise();
  await exiger("post", `${S}/studies/s/publications/${c.pub}/approuver`, { manifestHash: c.manifestHash, revisionId: c.revisionId, documentHash: c.documentHash });
  return c;
};
const diffusee = async () => { const c = await approuvee(); await exiger("post", `${S}/studies/s/publications/${c.pub}/diffuser`, {}); return c; };
const observation = async () => ({ obs: await creer(`${V}/observations`, { body: "Observation d'essai", responsableId: "editeur", audience: "projet" }) });
const observationDuFil = async () => { await creer(`${V}/comments/c1/observation`, { responsableId: "editeur" }); return {}; };
const DELEGATION = { delegateId: "editeur", scopeType: "projet", startsAt: new Date(Date.now() - 3_600_000).toISOString(), endsAt: new Date(Date.now() + 30 * 86_400_000).toISOString(), reason: "Absence du propriétaire (essai)" };
const delegation = async () => ({ dl: await creer(`${S}/delegations`, DELEGATION) });
const FEUILLE = { number: "A-01", title: "Plan", format: "A3", orientation: "paysage", scale: "ajuster" };
const feuille = async () => ({ f: await creer(`${V}/sheets`, FEUILLE) });
const dossier = async () => { const { f } = await feuille(); return { f, d: await creer(`${S}/studies/s/dossiers`, { title: "Dossier", sheetIds: [f] }) }; };
const IFC_RECETTE = readFileSync(new URL("../../../../packages/atelier-model/src/studio/import-ifc/fixtures/recette-ifc2x3.ifc", import.meta.url), "utf8");
const RECEPTION = { reference: "Architecte — bâtiment A", auteur: "Cabinet partenaire", discipline: "architecture", format: "ifc", version: "B", uniteDeclaree: "mm", transformation: null, nomFichier: "recette.ifc", contenu: IFC_RECETTE };
const modeleExterne = async () => ({ mx: await creer(`${V}/modeles-externes`, RECEPTION) });
// Lot F : illustration (rendu du modèle portant sa provenance), jeton et proposition d'agent.
const IL = "/studies/:studyId/variants/:variantId/illustrations";
const renduSource = () => {
  const rgba = new Uint8Array(4 * 4 * 4).fill(200);
  const prov = studioProvenanceRendu({ etude: { id: "s", nom: "Étude" }, variante: { id: "v", nom: "Variante" }, revisionId: "r1", scene: null, date: new Date("2026-10-25T09:00:00Z"), camera: { projection: "perspective", position: { x: 5, y: -5, z: 4 }, target: { x: 0, y: 0, z: 0 }, fov: 45 } , auteur: { id: "proprietaire", email: null } });
  return ecrirePng({ largeur: 4, hauteur: 4, rgba }, { "fadi:rendu": JSON.stringify(prov) }).toString("base64");
};
const CORPS_ILLUSTRATION = () => ({ requestId: "illu-c", fournisseur: "local-derive", image: renduSource(), parametres: { style: "trait", intensite: 0.5 } });
const illustration = async () => ({ il: await creer(`${V}/illustrations`, CORPS_ILLUSTRATION()) });
const jetonAgent = async () => ({ jt: await creer(`${S}/agents/jetons`, { nom: "Agent" }) });
const propositionAgent = async () => {
  const j = await creerJetonAgent("p", "proprietaire", "Agent");
  const r = await proposerCommandes({ projectId: "p", userId: "proprietaire", tokenId: j.id }, { studyId: "s", variantId: "v", requestId: "agent-c", baseRevisionId: "r1", commands: [{ toolId: "studio.dessin.ligne", params: { id: "ag", type: "line", start: { x: 0, y: 3 }, end: { x: 1, y: 3 } } }] });
  return { pr: r.proposition.id };
};
const projetExemple = async () => { banc.lignes.get(projects)!.find((x) => x["id"] === "p")!["sourceExampleId"] = STUDIO_EXEMPLE_P118.exampleId; return {}; };
const variante2 = async () => ({ v2: await creer(`${S}/studies/s/variants`, { name: "Variante 2" }, (b) => b?.variant?.id) });
const commande = async () => {
  const r = await exiger("post", `${V}/commands`, { contractVersion: STUDIO_CONTRACT, requestId: "q1", baseRevisionId: "r1", commands: [{ toolId: "studio.dessin.ligne", params: { id: "b", type: "line", start: { x: 0, y: 1 }, end: { x: 1, y: 1 } } }] });
  return { r2: r["revision"]["id"] as string };
};
const ENVELOPPE = { contractVersion: STUDIO_CONTRACT, requestId: "q1", baseRevisionId: "r1", commands: [{ toolId: "studio.dessin.ligne", params: { id: "b", type: "line", start: { x: 0, y: 1 }, end: { x: 1, y: 1 } } }] };
const fixe = (v: unknown) => () => v;
const essaiCmd = async () => ({ job: await creer(`${V}/essais`, { ...ENVELOPPE, requestId: "essai-1" }) });
const migrationCmd = async () => ({ mig: await creer(`${S}/studies/s/migrations`, { cible: "studio-document/2" }) });
const migrationAppliqueeCmd = async () => { const c = await migrationCmd(); for (const p of ["accorder", "appliquer"]) await exiger("post", `${S}/studies/s/migrations/${c.mig}/${p}`); return c; };
const basculePreparee = async () => { await exiger("post", `${S}/bascule/preparer`, { studyId: "s" }); return {}; };
// Lot PUB : vue de coupe, observation avec pièce justificative, fichier BCF d'essai.
const VUE_COUPE = { nom: "Coupe AA", niveau: { repere: "local-3d", z: 1 }, cadrage: { xMin: -1, yMin: -1, xMax: 5, yMax: 5 }, echelle: 50, styles: { trait: "fort", hachure: "diagonale" }, annotations: [{ id: "a1", type: "texte", position: { x: 0, y: 0 }, texte: "Note" }] };
const vueCoupe = async () => ({ vc: await creer(`${V}/section-views`, { definition: VUE_COUPE }) });
const PNG = "iVBORw0KGgo=";
const observationPiece = async () => {
  const b = await exiger("post", `${V}/observations`, { body: "Observation avec pièce", responsableId: "editeur", audience: "projet", categorie: "coordination", gravite: "majeure", pieces: [{ name: "releve.png", mime: "image/png", contentBase64: PNG }] });
  return { obs: b["id"] as string, sha: b["pieces"][0]["sha256"] as string };
};
const BCF = Buffer.from(studioExporterBcf(studioSujetsBcf([{ issueId: "x1", titre: "Sujet", description: "Description", statut: "Open", categorie: "coordination", gravite: "mineure", creeLe: "2026-10-25T08:00:00.000Z", auteur: "a@x", responsable: null, objets: [], journal: [] }]), { id: "partenaire", nom: "Partenaire" })).toString("base64");

export const CAS: Cas[] = [
  // Études et variantes.
  { libelle: "studio-api-etudes-lister/1 — GET /studies : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_ETUDES_LISTER, route: "GET /studies", url: () => `${S}/studies` },
  { libelle: "studio-api-etudes-lister/1 — GET /studies (projet issu de l'exemple : état de l'exemple) : réponse conforme", contrat: C.CONTRAT_ETUDES_LISTER, route: "GET /studies", url: () => `${S}/studies`, preparer: projetExemple },
  { libelle: "studio-api-etude-creer/1 — POST /studies : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_ETUDE_CREER, route: "POST /studies", url: () => `${S}/studies`, corps: fixe({ name: "Nouvelle" }) },
  { libelle: "studio-api-etude-lire/1 — GET /studies/:studyId : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_ETUDE_LIRE, route: "GET /studies/:studyId", url: () => `${S}/studies/s` },
  { libelle: "studio-api-etude-renommer/1 — PATCH /studies/:studyId : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_ETUDE_RENOMMER, route: "PATCH /studies/:studyId", url: () => `${S}/studies/s`, corps: fixe({ name: "Renommée" }) },
  { libelle: "studio-api-etude-phase/1 — PATCH /studies/:studyId/workflow : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_ETUDE_PHASE, route: "PATCH /studies/:studyId/workflow", url: () => `${S}/studies/s/workflow`, corps: fixe({ phase: "controler" }) },
  { libelle: "studio-api-exemple-installer/1 — POST /exemple : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_EXEMPLE_INSTALLER, route: "POST /exemple", url: () => `${S}/exemple`, preparer: projetExemple },
  { libelle: "studio-api-etude-archivage/1 — POST /studies/:studyId/archive : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_ETUDE_ARCHIVAGE, route: "POST /studies/:studyId/archive", url: () => `${S}/studies/s/archive` },
  {
    libelle: "studio-api-etude-archivage/1 — POST /studies/:studyId/unarchive : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_ETUDE_ARCHIVAGE, route: "POST /studies/:studyId/unarchive",
    url: () => `${S}/studies/s/unarchive`, preparer: async () => { await exiger("post", `${S}/studies/s/archive`); return {}; },
  },
  { libelle: "studio-api-variantes-comparer/1 — GET /studies/:studyId/compare : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_VARIANTES_COMPARER, route: "GET /studies/:studyId/compare", url: (c) => `${S}/studies/s/compare?from=v:r1&to=v:${c["r2"]}`, preparer: commande },
  { libelle: "studio-api-variantes-lister/1 — GET /studies/:studyId/variants : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_VARIANTES_LISTER, route: "GET /studies/:studyId/variants", url: () => `${S}/studies/s/variants` },
  { libelle: "studio-api-variante-creer/1 — POST /studies/:studyId/variants : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_VARIANTE_CREER, route: "POST /studies/:studyId/variants", url: () => `${S}/studies/s/variants`, corps: fixe({ name: "Variante 2" }) },
  { libelle: "studio-api-variante-creer/1 — POST /studies/:studyId/variants (dérivée d'une révision) : réponse conforme", contrat: C.CONTRAT_VARIANTE_CREER, route: "POST /studies/:studyId/variants", url: () => `${S}/studies/s/variants`, corps: fixe({ name: "Dérivée", fromVariantId: "v", fromRevisionId: "r1" }) },
  { libelle: "studio-api-variante-creer/1 — POST /studies/:studyId/variants (copie indépendante) : réponse conforme", contrat: C.CONTRAT_VARIANTE_CREER, route: "POST /studies/:studyId/variants", url: () => `${S}/studies/s/variants`, corps: fixe({ name: "Copie", fromVariantId: "v", mode: "copie" }) },
  { libelle: "studio-api-variante-renommer/1 — PATCH /studies/:studyId/variants/:variantId : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_VARIANTE_RENOMMER, route: "PATCH /studies/:studyId/variants/:variantId", url: () => V, corps: fixe({ name: "Renommée" }) },
  { libelle: "studio-api-variante-archivage/1 — POST /studies/:studyId/variants/:variantId/archive : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_VARIANTE_ARCHIVAGE, route: "POST /studies/:studyId/variants/:variantId/archive", url: (c) => `${S}/studies/s/variants/${c["v2"]}/archive`, preparer: variante2 },
  {
    libelle: "studio-api-variante-archivage/1 — POST /studies/:studyId/variants/:variantId/unarchive : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_VARIANTE_ARCHIVAGE, route: "POST /studies/:studyId/variants/:variantId/unarchive",
    url: (c) => `${S}/studies/s/variants/${c["v2"]}/unarchive`, preparer: async () => { const c = await variante2(); await exiger("post", `${S}/studies/s/variants/${c.v2}/archive`); return c; },
  },
  { libelle: "studio-api-variante-lire/1 — GET /studies/:studyId/variants/:variantId : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_VARIANTE_LIRE, route: "GET /studies/:studyId/variants/:variantId", url: () => V },
  { libelle: "studio-api-revisions-lister/1 — GET /studies/:studyId/variants/:variantId/revisions : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_REVISIONS_LISTER, route: "GET /studies/:studyId/variants/:variantId/revisions", url: () => `${V}/revisions`, preparer: commande },
  { libelle: "studio-api-revision-lire/1 — GET /studies/:studyId/variants/:variantId/revisions/:revisionId : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_REVISION_LIRE, route: "GET /studies/:studyId/variants/:variantId/revisions/:revisionId", url: () => `${V}/revisions/r1` },
  { libelle: "studio-api-revision-changements/1 — GET …/revisions/:revisionId/changes : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_REVISION_CHANGEMENTS, route: "GET /studies/:studyId/variants/:variantId/revisions/:revisionId/changes", url: (c) => `${V}/revisions/${c["r2"]}/changes`, preparer: commande },
  { libelle: "studio-api-variante-exporter/1 — GET /studies/:studyId/variants/:variantId/export : fichier, en-tête X-Studio-Contrat", contrat: C.CONTRAT_VARIANTE_EXPORTER, route: "GET /studies/:studyId/variants/:variantId/export", url: () => `${V}/export?format=svg` },
  { libelle: "studio-api-export-rapport/1 — GET /studies/:studyId/variants/:variantId/export/rapport : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_EXPORT_RAPPORT, route: "GET /studies/:studyId/variants/:variantId/export/rapport", url: () => `${V}/export/rapport?format=dxf` },
  { libelle: "studio-api-commandes/1 — POST /studies/:studyId/variants/:variantId/commands : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_COMMANDES, route: "POST /studies/:studyId/variants/:variantId/commands", url: () => `${V}/commands`, corps: fixe(ENVELOPPE) },
  // Commentaires, observations du fil, étapes.
  { libelle: "studio-api-commentaires-lister/1 — GET …/comments : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_COMMENTAIRES_LISTER, route: `GET ${COM}`, url: () => `${V}/comments`, preparer: observationDuFil },
  { libelle: "studio-api-commentaire-creer/1 — POST …/comments : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_COMMENTAIRE_CREER, route: `POST ${COM}`, url: () => `${V}/comments`, corps: fixe({ body: "Texte" }) },
  { libelle: "studio-api-commentaire-audience/1 — PATCH …/comments/:commentId : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_COMMENTAIRE_AUDIENCE, route: `PATCH ${COM}/:commentId`, url: () => `${V}/comments/c1`, corps: fixe({ audience: "projet" }) },
  { libelle: "studio-api-commentaire-supprimer/1 — DELETE …/comments/:commentId : 204 sans corps, en-tête X-Studio-Contrat", contrat: C.CONTRAT_COMMENTAIRE_SUPPRIMER, route: `DELETE ${COM}/:commentId`, url: () => `${V}/comments/c1`, acteur: "editeur" },
  { libelle: "studio-api-commentaire-observation/1 — POST …/comments/:commentId/observation : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_COMMENTAIRE_OBSERVATION, route: `POST ${COM}/:commentId/observation`, url: () => `${V}/comments/c1/observation`, corps: fixe({ responsableId: "editeur" }) },
  {
    libelle: "studio-api-commentaire-observation-transition/1 — POST …/comments/:commentId/observation/transitions : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_COMMENTAIRE_OBSERVATION_TRANSITION,
    route: `POST ${COM}/:commentId/observation/transitions`, url: () => `${V}/comments/c1/observation/transitions`, corps: fixe({ action: "corriger", revisionId: "r1" }), preparer: observationDuFil, acteur: "editeur",
  },
  { libelle: "studio-api-etapes-lire/1 — GET /studies/:studyId/steps : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_ETAPES_LIRE, route: "GET /studies/:studyId/steps", url: () => `${S}/studies/s/steps`, preparer: async () => { await exiger("put", `${S}/studies/s/steps`, { steps: [1] }); return {}; } },
  { libelle: "studio-api-etapes-remplacer/1 — PUT /studies/:studyId/steps : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_ETAPES_REMPLACER, route: "PUT /studies/:studyId/steps", url: () => `${S}/studies/s/steps`, corps: fixe({ steps: [1, 3] }) },
  { libelle: "studio-api-etape-etudes/1 — GET /steps/:stepNumber/studies : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_ETAPE_ETUDES, route: "GET /steps/:stepNumber/studies", url: () => `${S}/steps/1/studies`, preparer: async () => { await exiger("put", `${S}/studies/s/steps`, { steps: [1] }); return {}; } },
  // Préférences.
  { libelle: "studio-api-preferences-lire/1 — GET /preferences/outils : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_PREFERENCES_LIRE, route: "GET /preferences/outils", url: () => `${S}/preferences/outils` },
  { libelle: "studio-api-preferences-ecrire/1 — PUT /preferences/outils : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_PREFERENCES_ECRIRE, route: "PUT /preferences/outils", url: () => `${S}/preferences/outils`, corps: fixe({ profil: "standard", favoris: ["studio.dessin.ligne"], personnel: [] }) },
  { libelle: "studio-api-catalogue-outils/1 — GET /preferences/catalogue : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_CATALOGUE_OUTILS, route: "GET /preferences/catalogue", url: () => `${S}/preferences/catalogue` },
  // Publications et délégations.
  { libelle: "studio-api-paquets-lister/1 — GET /publications : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_PAQUETS_LISTER, route: "GET /publications", url: () => `${S}/publications`, preparer: diffusee },
  { libelle: "studio-api-publications-lister/1 — GET /studies/:studyId/publications : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_PUBLICATIONS_LISTER, route: "GET /studies/:studyId/publications", url: () => `${S}/studies/s/publications`, preparer: diffusee },
  { libelle: "studio-api-publication-creer/1 — POST …/variants/:variantId/publications : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_PUBLICATION_CREER, route: "POST /studies/:studyId/variants/:variantId/publications", url: () => `${V}/publications`, corps: fixe({ title: "Dossier", contenu: "dessin-2d" }) },
  { libelle: "studio-api-publication-lire/1 — GET /studies/:studyId/publications/:publicationId : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_PUBLICATION_LIRE, route: `GET ${PUB}`, url: (c) => `${S}/studies/s/publications/${c["pub"]}`, preparer: diffusee },
  { libelle: "studio-api-publication-controle-approbation/1 — GET …/controle-approbation : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_PUBLICATION_CONTROLE_APPROBATION, route: `GET ${PUB}/controle-approbation`, url: (c) => `${S}/studies/s/publications/${c["pub"]}/controle-approbation`, preparer: soumise },
  { libelle: "studio-api-publication-verification/1 — GET …/verification : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_PUBLICATION_VERIFICATION, route: `GET ${PUB}/verification`, url: (c) => `${S}/studies/s/publications/${c["pub"]}/verification`, preparer: diffusee },
  { libelle: "studio-api-publication-fichier/1 — GET …/files/:format : fichier figé, en-tête X-Studio-Contrat", contrat: C.CONTRAT_PUBLICATION_FICHIER, route: `GET ${PUB}/files/:format`, url: (c) => `${S}/studies/s/publications/${c["pub"]}/files/svg`, preparer: diffusee },
  { libelle: "studio-api-delegations-lister/1 — GET /delegations : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_DELEGATIONS_LISTER, route: "GET /delegations", url: () => `${S}/delegations`, preparer: delegation },
  { libelle: "studio-api-delegation-creer/1 — POST /delegations : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_DELEGATION_CREER, route: "POST /delegations", url: () => `${S}/delegations`, corps: fixe(DELEGATION) },
  { libelle: "studio-api-delegation-revoquer/1 — POST /delegations/:delegationId/revoquer : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_DELEGATION_REVOQUER, route: "POST /delegations/:delegationId/revoquer", url: (c) => `${S}/delegations/${c["dl"]}/revoquer`, corps: fixe({ reason: "Retour du propriétaire" }), preparer: delegation },
  { libelle: "studio-api-publication-transition/1 — POST …/:action (soumettre) : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_PUBLICATION_TRANSITION, route: `POST ${PUB}/:action`, url: (c) => `${S}/studies/s/publications/${c["pub"]}/soumettre`, corps: fixe({}), preparer: publication },
  {
    libelle: "studio-api-publication-transition/1 — POST …/:action (approuver l'ensemble présenté) : réponse conforme", contrat: C.CONTRAT_PUBLICATION_TRANSITION, route: `POST ${PUB}/:action`,
    url: (c) => `${S}/studies/s/publications/${c["pub"]}/approuver`, corps: (c) => ({ manifestHash: c["manifestHash"], revisionId: c["revisionId"], documentHash: c["documentHash"] }), preparer: soumise,
  },
  { libelle: "studio-api-publication-transition/1 — POST …/:action (diffuser) : réponse conforme", contrat: C.CONTRAT_PUBLICATION_TRANSITION, route: `POST ${PUB}/:action`, url: (c) => `${S}/studies/s/publications/${c["pub"]}/diffuser`, corps: fixe({}), preparer: approuvee },
  // Exigences et contrôles.
  { libelle: "studio-api-exigences-lire/1 — GET /studies/:studyId/exigences : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_EXIGENCES_LIRE, route: "GET /studies/:studyId/exigences", url: () => `${S}/studies/s/exigences`, preparer: jeu },
  { libelle: "studio-api-exigences-version/1 — GET /studies/:studyId/exigences/versions/:version : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_EXIGENCES_VERSION, route: "GET /studies/:studyId/exigences/versions/:version", url: () => `${S}/studies/s/exigences/versions/1`, preparer: jeu },
  { libelle: "studio-api-exigences-enregistrer/1 — POST /studies/:studyId/exigences : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_EXIGENCES_ENREGISTRER, route: "POST /studies/:studyId/exigences", url: () => `${S}/studies/s/exigences`, corps: fixe({ baseVersion: 0, exigences: [exigence] }) },
  { libelle: "studio-api-exigences-accepter/1 — POST /studies/:studyId/exigences/acceptations : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_EXIGENCES_ACCEPTER, route: "POST /studies/:studyId/exigences/acceptations", url: () => `${S}/studies/s/exigences/acceptations`, corps: fixe({ baseVersion: 1, exigenceId: "p1" }), preparer: jeuReference },
  { libelle: "studio-api-controles-lister/1 — GET …/controles : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_CONTROLES_LISTER, route: "GET /studies/:studyId/variants/:variantId/controles", url: () => `${V}/controles`, preparer: async () => { await jeu(); await creer(`${V}/controles`, {}); return {}; } },
  { libelle: "studio-api-controle-lire/1 — GET …/controles/:checkId : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_CONTROLE_LIRE, route: "GET /studies/:studyId/variants/:variantId/controles/:checkId", url: (c) => `${V}/controles/${c["k"]}`, preparer: async () => { await jeu(); return { k: await creer(`${V}/controles`, {}) }; } },
  { libelle: "studio-api-controle-executer/1 — POST …/controles : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_CONTROLE_EXECUTER, route: "POST /studies/:studyId/variants/:variantId/controles", url: () => `${V}/controles`, corps: fixe({}), preparer: jeu },
  // Ajustements du métré.
  {
    libelle: "studio-api-ajustements-lister/1 — GET …/ajustements-quantites : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_AJUSTEMENTS_LISTER, route: "GET /studies/:studyId/variants/:variantId/ajustements-quantites", url: () => `${V}/ajustements-quantites`,
    preparer: async () => { await creer(`${V}/ajustements-quantites`, { baseSequence: 0, revisionId: "r1", cible: { type: "objet", id: "a" }, grandeur: "longueur", unite: "m", valeur: 4.05, motif: "Relevé sur place (essai)" }); return {}; },
  },
  {
    libelle: "studio-api-ajustement-creer/1 — POST …/ajustements-quantites : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_AJUSTEMENT_CREER, route: "POST /studies/:studyId/variants/:variantId/ajustements-quantites", url: () => `${V}/ajustements-quantites`,
    corps: fixe({ baseSequence: 0, revisionId: "r1", cible: { type: "objet", id: "a" }, grandeur: "longueur", unite: "m", valeur: 4.05, motif: "Relevé sur place (essai)" }),
  },
  // Observations.
  { libelle: "studio-api-observations-lister/1 — GET …/observations : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_OBSERVATIONS_LISTER, route: `GET ${OBS}`, url: () => `${V}/observations`, preparer: observation },
  { libelle: "studio-api-observation-creer/1 — POST …/observations : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_OBSERVATION_CREER, route: `POST ${OBS}`, url: () => `${V}/observations`, corps: fixe({ body: "Observation", responsableId: "editeur" }) },
  {
    libelle: "studio-api-rapprochements-lister/1 — GET …/observations/rapprochements : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_RAPPROCHEMENTS_LISTER, route: `GET ${OBS}/rapprochements`, url: () => `${V}/observations/rapprochements`,
    preparer: async () => { const c = await observation(); await exiger("post", `${V}/observations/rapprochements`, {}); return c; },
  },
  { libelle: "studio-api-rapprochement-demander/1 — POST …/observations/rapprochements : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_RAPPROCHEMENT_DEMANDER, route: `POST ${OBS}/rapprochements`, url: () => `${V}/observations/rapprochements`, corps: fixe({}), preparer: observation },
  { libelle: "studio-api-observation-lire/1 — GET …/observations/:observationId : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_OBSERVATION_LIRE, route: `GET ${OBS}/:observationId`, url: (c) => `${V}/observations/${c["obs"]}`, preparer: observation },
  { libelle: "studio-api-observation-transition/1 — POST …/observations/:observationId/transitions : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_OBSERVATION_TRANSITION, route: `POST ${OBS}/:observationId/transitions`, url: (c) => `${V}/observations/${c["obs"]}/transitions`, corps: fixe({ action: "corriger", revisionId: "r1" }), preparer: observation, acteur: "editeur" },
  { libelle: "studio-api-observation-lier/1 — POST …/observations/:observationId/liens : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_OBSERVATION_LIER, route: `POST ${OBS}/:observationId/liens`, url: (c) => `${V}/observations/${c["obs"]}/liens`, corps: fixe({ domaine: "objet", ref: "a", revisionId: "r1" }), preparer: observation },
  { libelle: "studio-api-observation-tache-creer/1 — POST …/observations/:observationId/taches : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_OBSERVATION_TACHE_CREER, route: `POST ${OBS}/:observationId/taches`, url: (c) => `${V}/observations/${c["obs"]}/taches`, corps: fixe({ libelle: "Reprendre", assigneeId: "editeur" }), preparer: observation },
  {
    libelle: "studio-api-observation-tache-transition/1 — POST …/taches/:taskId/transitions : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_OBSERVATION_TACHE_TRANSITION, route: `POST ${OBS}/:observationId/taches/:taskId/transitions`,
    url: (c) => `${V}/observations/${c["obs"]}/taches/${c["t"]}/transitions`, corps: fixe({ action: "terminer" }),
    preparer: async () => { const { obs } = await observation(); return { obs, t: await creer(`${V}/observations/${obs}/taches`, { libelle: "Reprendre", assigneeId: "editeur" }, (b) => b?.taches?.at(-1)?.id) }; },
  },
  { libelle: "studio-api-observation-decision/1 — POST …/observations/:observationId/decisions : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_OBSERVATION_DECISION, route: `POST ${OBS}/:observationId/decisions`, url: (c) => `${V}/observations/${c["obs"]}/decisions`, corps: fixe({ nature: "proposition", portee: "autre", texte: "Proposition" }), preparer: observation },
  // Observations, lot PUB (IF-010) : BCF et pièces justificatives.
  { libelle: "studio-api-observations-bcf-exporter/1 — GET …/observations/bcf : fichier BCF, en-tête X-Studio-Contrat", contrat: C.CONTRAT_OBSERVATIONS_BCF_EXPORTER, route: `GET ${OBS}/bcf`, url: () => `${V}/observations/bcf`, preparer: observation },
  { libelle: "studio-api-observations-bcf-importer/1 — POST …/observations/bcf : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_OBSERVATIONS_BCF_IMPORTER, route: `POST ${OBS}/bcf`, url: () => `${V}/observations/bcf`, corps: fixe({ fichierBase64: BCF }) },
  { libelle: "studio-api-observation-piece/1 — GET …/observations/:observationId/pieces/:sha256 : fichier, en-tête X-Studio-Contrat", contrat: C.CONTRAT_OBSERVATION_PIECE, route: `GET ${OBS}/:observationId/pieces/:sha256`, url: (c) => `${V}/observations/${c["obs"]}/pieces/${c["sha"]}`, preparer: observationPiece },
  // Résultats quantitatifs (IF-008).
  { libelle: "studio-api-resultats-quantitatifs/1 — GET …/resultats-quantitatifs : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_RESULTATS_QUANTITATIFS, route: "GET /studies/:studyId/variants/:variantId/resultats-quantitatifs", url: () => `${V}/resultats-quantitatifs` },
  // Vues de coupe (EX-075).
  { libelle: "studio-api-vues-coupe-lister/1 — GET /studies/:studyId/section-views : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_VUES_COUPE_LISTER, route: "GET /studies/:studyId/section-views", url: () => `${S}/studies/s/section-views`, preparer: vueCoupe },
  { libelle: "studio-api-vue-coupe-creer/1 — POST …/variants/:variantId/section-views : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_VUE_COUPE_CREER, route: "POST /studies/:studyId/variants/:variantId/section-views", url: () => `${V}/section-views`, corps: fixe({ definition: VUE_COUPE }) },
  { libelle: "studio-api-vue-coupe-lire/1 — GET /studies/:studyId/section-views/:viewId : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_VUE_COUPE_LIRE, route: "GET /studies/:studyId/section-views/:viewId", url: (c) => `${S}/studies/s/section-views/${c["vc"]}`, preparer: vueCoupe },
  { libelle: "studio-api-vue-coupe-modifier/1 — PATCH /studies/:studyId/section-views/:viewId : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_VUE_COUPE_MODIFIER, route: "PATCH /studies/:studyId/section-views/:viewId", url: (c) => `${S}/studies/s/section-views/${c["vc"]}`, corps: fixe({ annotation: { op: "retirer", id: "a1" } }), preparer: vueCoupe },
  { libelle: "studio-api-vue-coupe-supprimer/1 — DELETE /studies/:studyId/section-views/:viewId : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_VUE_COUPE_SUPPRIMER, route: "DELETE /studies/:studyId/section-views/:viewId", url: (c) => `${S}/studies/s/section-views/${c["vc"]}`, preparer: vueCoupe },
  // Feuilles et dossiers.
  { libelle: "studio-api-dossiers-projet/1 — GET /dossiers : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_DOSSIERS_PROJET, route: "GET /dossiers", url: () => `${S}/dossiers`, preparer: dossier },
  { libelle: "studio-api-feuilles-lister/1 — GET /studies/:studyId/sheets : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_FEUILLES_LISTER, route: "GET /studies/:studyId/sheets", url: () => `${S}/studies/s/sheets`, preparer: feuille },
  { libelle: "studio-api-feuille-creer/1 — POST …/variants/:variantId/sheets : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_FEUILLE_CREER, route: "POST /studies/:studyId/variants/:variantId/sheets", url: () => `${V}/sheets`, corps: fixe({ ...FEUILLE, number: "A-02" }) },
  { libelle: "studio-api-feuille-modifier/1 — PATCH /studies/:studyId/sheets/:sheetId : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_FEUILLE_MODIFIER, route: "PATCH /studies/:studyId/sheets/:sheetId", url: (c) => `${S}/studies/s/sheets/${c["f"]}`, corps: fixe({ title: "Plan 2" }), preparer: feuille },
  { libelle: "studio-api-feuille-supprimer/1 — DELETE /studies/:studyId/sheets/:sheetId : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_FEUILLE_SUPPRIMER, route: "DELETE /studies/:studyId/sheets/:sheetId", url: (c) => `${S}/studies/s/sheets/${c["f"]}`, preparer: feuille },
  { libelle: "studio-api-feuille-fichier/1 — GET …/sheets/:sheetId/files/:format : fichier, en-tête X-Studio-Contrat", contrat: C.CONTRAT_FEUILLE_FICHIER, route: "GET /studies/:studyId/sheets/:sheetId/files/:format", url: (c) => `${S}/studies/s/sheets/${c["f"]}/files/svg`, preparer: feuille },
  { libelle: "studio-api-dossiers-lister/1 — GET /studies/:studyId/dossiers : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_DOSSIERS_LISTER, route: "GET /studies/:studyId/dossiers", url: () => `${S}/studies/s/dossiers`, preparer: dossier },
  { libelle: "studio-api-dossier-creer/1 — POST /studies/:studyId/dossiers : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_DOSSIER_CREER, route: "POST /studies/:studyId/dossiers", url: () => `${S}/studies/s/dossiers`, corps: (c) => ({ title: "Dossier", sheetIds: [c["f"]] }), preparer: feuille },
  { libelle: "studio-api-dossier-lire/1 — GET /studies/:studyId/dossiers/:dossierId : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_DOSSIER_LIRE, route: "GET /studies/:studyId/dossiers/:dossierId", url: (c) => `${S}/studies/s/dossiers/${c["d"]}`, preparer: dossier },
  { libelle: "studio-api-dossier-modifier/1 — PATCH /studies/:studyId/dossiers/:dossierId : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_DOSSIER_MODIFIER, route: "PATCH /studies/:studyId/dossiers/:dossierId", url: (c) => `${S}/studies/s/dossiers/${c["d"]}`, corps: fixe({ title: "Dossier 2" }), preparer: dossier },
  { libelle: "studio-api-dossier-fichier/1 — GET …/dossiers/:dossierId/files/:format : fichier, en-tête X-Studio-Contrat", contrat: C.CONTRAT_DOSSIER_FICHIER, route: "GET /studies/:studyId/dossiers/:dossierId/files/:format", url: (c) => `${S}/studies/s/dossiers/${c["d"]}/files/json`, preparer: dossier },
  // Lot CMD : contexte, essais, jobs, journal, migrations, bascule.
  { libelle: "studio-api-etude-contexte/1 — GET /studies/:studyId/contexte : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_ETUDE_CONTEXTE, route: "GET /studies/:studyId/contexte", url: () => `${S}/studies/s/contexte` },
  { libelle: "studio-api-essai-creer/1 — POST …/essais : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_ESSAI_CREER, route: "POST /studies/:studyId/variants/:variantId/essais", url: () => `${V}/essais`, corps: fixe(ENVELOPPE) },
  { libelle: "studio-api-essai-abandon/1 — POST …/essais/:jobId/abandon : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_ESSAI_ABANDON, route: "POST /studies/:studyId/variants/:variantId/essais/:jobId/abandon", url: (c) => `${V}/essais/${c["job"]}/abandon`, preparer: essaiCmd },
  { libelle: "studio-api-essai-confirmer/1 — POST …/essais/:jobId/confirmer : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_ESSAI_CONFIRMER, route: "POST /studies/:studyId/variants/:variantId/essais/:jobId/confirmer", url: (c) => `${V}/essais/${c["job"]}/confirmer`, preparer: essaiCmd },
  { libelle: "studio-api-job-lire/1 — GET /jobs/:jobId : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_JOB_LIRE, route: "GET /jobs/:jobId", url: (c) => `${S}/jobs/${c["job"]}`, preparer: essaiCmd },
  { libelle: "studio-api-journal-revisions/1 — GET …/journal : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_JOURNAL_REVISIONS, route: "GET /studies/:studyId/variants/:variantId/journal", url: () => `${V}/journal`, preparer: async () => { await commande(); return {}; } },
  { libelle: "studio-api-migration-simuler/1 — POST /studies/:studyId/migrations : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_MIGRATION_SIMULER, route: "POST /studies/:studyId/migrations", url: () => `${S}/studies/s/migrations`, corps: fixe({ cible: "studio-document/2" }) },
  { libelle: "studio-api-migrations-lister/1 — GET /studies/:studyId/migrations : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_MIGRATIONS_LISTER, route: "GET /studies/:studyId/migrations", url: () => `${S}/studies/s/migrations`, preparer: migrationCmd },
  { libelle: "studio-api-migration-lire/1 — GET /studies/:studyId/migrations/:migrationId : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_MIGRATION_LIRE, route: "GET /studies/:studyId/migrations/:migrationId", url: (c) => `${S}/studies/s/migrations/${c["mig"]}`, preparer: migrationCmd },
  { libelle: "studio-api-migration-passage/1 — POST …/migrations/:migrationId/accorder : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_MIGRATION_PASSAGE, route: "POST /studies/:studyId/migrations/:migrationId/accorder", url: (c) => `${S}/studies/s/migrations/${c["mig"]}/accorder`, preparer: migrationCmd },
  { libelle: "studio-api-migration-passage/1 — POST …/migrations/:migrationId/appliquer : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_MIGRATION_PASSAGE, route: "POST /studies/:studyId/migrations/:migrationId/appliquer", url: (c) => `${S}/studies/s/migrations/${c["mig"]}/appliquer`, preparer: async () => { const c = await migrationCmd(); await exiger("post", `${S}/studies/s/migrations/${c.mig}/accorder`); return c; } },
  { libelle: "studio-api-migration-passage/1 — POST …/migrations/:migrationId/retour-arriere : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_MIGRATION_PASSAGE, route: "POST /studies/:studyId/migrations/:migrationId/retour-arriere", url: (c) => `${S}/studies/s/migrations/${c["mig"]}/retour-arriere`, preparer: migrationAppliqueeCmd },
  { libelle: "studio-api-migration-document/1 — GET …/migrations/:migrationId/documents/:revisionId : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_MIGRATION_DOCUMENT, route: "GET /studies/:studyId/migrations/:migrationId/documents/:revisionId", url: (c) => `${S}/studies/s/migrations/${c["mig"]}/documents/r1`, preparer: migrationAppliqueeCmd },
  { libelle: "studio-api-bascule-lire/1 — GET /bascule : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_BASCULE_LIRE, route: "GET /bascule", url: () => `${S}/bascule`, preparer: basculePreparee },
  { libelle: "studio-api-bascule-passage/1 — POST /bascule/preparer : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_BASCULE_PASSAGE, route: "POST /bascule/preparer", url: () => `${S}/bascule/preparer`, corps: fixe({ studyId: "s" }) },
  { libelle: "studio-api-bascule-passage/1 — POST /bascule/basculer : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_BASCULE_PASSAGE, route: "POST /bascule/basculer", url: () => `${S}/bascule/basculer`, preparer: basculePreparee },
  { libelle: "studio-api-bascule-passage/1 — POST /bascule/retour-arriere : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_BASCULE_PASSAGE, route: "POST /bascule/retour-arriere", url: () => `${S}/bascule/retour-arriere`, preparer: async () => { await basculePreparee(); await exiger("post", `${S}/bascule/basculer`); return {}; } },
  // Modèles externes.
  { libelle: "studio-api-modeles-externes-lister/1 — GET …/modeles-externes : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_MODELES_EXTERNES_LISTER, route: `GET ${MX}`, url: () => `${V}/modeles-externes`, preparer: modeleExterne },
  { libelle: "studio-api-modele-externe-recevoir/1 — POST …/modeles-externes : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_MODELE_EXTERNE_RECEVOIR, route: `POST ${MX}`, url: () => `${V}/modeles-externes`, corps: fixe(RECEPTION) },
  { libelle: "studio-api-modele-externe-lire/1 — GET …/modeles-externes/:modelId : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_MODELE_EXTERNE_LIRE, route: `GET ${MX}/:modelId`, url: (c) => `${V}/modeles-externes/${c["mx"]}`, preparer: modeleExterne },
  { libelle: "studio-api-modele-externe-provenance/1 — GET …/modeles-externes/:modelId/provenance : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_MODELE_EXTERNE_PROVENANCE, route: `GET ${MX}/:modelId/provenance`, url: (c) => `${V}/modeles-externes/${c["mx"]}/provenance`, preparer: modeleExterne },
  { libelle: "studio-api-modele-externe-contenu/1 — GET …/modeles-externes/:modelId/contenu : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_MODELE_EXTERNE_CONTENU, route: `GET ${MX}/:modelId/contenu`, url: (c) => `${V}/modeles-externes/${c["mx"]}/contenu`, preparer: modeleExterne },
  { libelle: "studio-api-modele-externe-action/1 — POST …/modeles-externes/:modelId/:action (comparer) : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_MODELE_EXTERNE_ACTION, route: `POST ${MX}/:modelId/:action`, url: (c) => `${V}/modeles-externes/${c["mx"]}/comparer`, corps: fixe({}), preparer: modeleExterne },
  { libelle: "studio-api-modele-externe-action/1 — POST …/modeles-externes/:modelId/:action (accepter, motivé) : réponse conforme", contrat: C.CONTRAT_MODELE_EXTERNE_ACTION, route: `POST ${MX}/:modelId/:action`, url: (c) => `${V}/modeles-externes/${c["mx"]}/accepter`, corps: fixe({ motif: "Motif d'essai" }), preparer: modeleExterne },
  // Lot F : illustrations, agents (MCP) et extensions.
  { libelle: "studio-api-illustrations-fournisseurs/1 — GET …/illustrations/fournisseurs : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_ILLUSTRATIONS_FOURNISSEURS, route: `GET ${IL}/fournisseurs`, url: () => `${V}/illustrations/fournisseurs` },
  { libelle: "studio-api-illustrations-lister/1 — GET …/illustrations : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_ILLUSTRATIONS_LISTER, route: `GET ${IL}`, url: () => `${V}/illustrations`, preparer: illustration },
  { libelle: "studio-api-illustration-creer/1 — POST …/illustrations : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_ILLUSTRATION_CREER, route: `POST ${IL}`, url: () => `${V}/illustrations`, corps: CORPS_ILLUSTRATION },
  { libelle: "studio-api-illustration-image/1 — GET …/illustrations/:illustrationId/image : fichier, en-tête X-Studio-Contrat", contrat: C.CONTRAT_ILLUSTRATION_IMAGE, route: `GET ${IL}/:illustrationId/image`, url: (c) => `${V}/illustrations/${c["il"]}/image`, preparer: illustration },
  { libelle: "studio-api-agents-jetons-lister/1 — GET /agents/jetons : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_AGENTS_JETONS_LISTER, route: "GET /agents/jetons", url: () => `${S}/agents/jetons`, preparer: jetonAgent },
  { libelle: "studio-api-agents-jeton-creer/1 — POST /agents/jetons : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_AGENTS_JETON_CREER, route: "POST /agents/jetons", url: () => `${S}/agents/jetons`, corps: fixe({ nom: "Agent" }) },
  { libelle: "studio-api-agents-jeton-revoquer/1 — POST /agents/jetons/:tokenId/revoquer : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_AGENTS_JETON_REVOQUER, route: "POST /agents/jetons/:tokenId/revoquer", url: (c) => `${S}/agents/jetons/${c["jt"]}/revoquer`, corps: fixe({}), preparer: jetonAgent },
  { libelle: "studio-api-agents-propositions/1 — GET /agents/propositions : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_AGENTS_PROPOSITIONS, route: "GET /agents/propositions", url: () => `${S}/agents/propositions`, preparer: propositionAgent },
  { libelle: "studio-api-agents-proposition-confirmer/1 — POST /agents/propositions/:proposalId/confirmer : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_AGENTS_PROPOSITION_CONFIRMER, route: "POST /agents/propositions/:proposalId/confirmer", url: (c) => `${S}/agents/propositions/${c["pr"]}/confirmer`, corps: fixe({}), preparer: propositionAgent },
  { libelle: "studio-api-agents-proposition-refuser/1 — POST /agents/propositions/:proposalId/refuser : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_AGENTS_PROPOSITION_REFUSER, route: "POST /agents/propositions/:proposalId/refuser", url: (c) => `${S}/agents/propositions/${c["pr"]}/refuser`, corps: fixe({}), preparer: propositionAgent },
  { libelle: "studio-api-agents-journal/1 — GET /agents/journal : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_AGENTS_JOURNAL, route: "GET /agents/journal", url: () => `${S}/agents/journal`, preparer: propositionAgent },
  { libelle: "studio-api-extensions-lister/1 — GET /extensions : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_EXTENSIONS_LISTER, route: "GET /extensions", url: () => `${S}/extensions` },
  { libelle: "studio-api-extension-evaluer/1 — POST /extensions/evaluer : réponse conforme, en-tête X-Studio-Contrat", contrat: C.CONTRAT_EXTENSION_EVALUER, route: "POST /extensions/evaluer", url: () => `${S}/extensions/evaluer`, corps: fixe({ declaration: { schema: "studio-extension/1", id: "x" } }) },
];

const methodeDe = (route: string) => route.split(" ")[0]!.toLowerCase() as Methode;
/** Écarts au schéma, lisibles (chemin : message). */
const ecartsSchema = (schema: NonNullable<StudioContratRoute["reponse"]>, corps: unknown): string[] => {
  const r = schema.safeParse(corps);
  return r.success ? [] : r.error.issues.map((i) => `${i.path.join(".") || "(racine)"} : ${i.message}`);
};

beforeEach(initialiserProjet);

describe("Contrats versionnés des routes Studio (réserve G1, P-11)", () => {
  for (const cas of CAS) {
    it(cas.libelle, async () => {
      const c = cas.preparer ? await cas.preparer() : {};
      const res = await appel(cas.acteur ?? "proprietaire", methodeDe(cas.route), cas.url(c), cas.corps?.(c));
      expect(cas.contrat.statuts, `${res.status} ${JSON.stringify(res.body).slice(0, 400)}`).toContain(res.status);
      expect(res.headers[STUDIO_CONTRAT_ENTETE.toLowerCase()]).toBe(cas.contrat.id);
      if (cas.contrat.corps === "json") {
        expect(res.headers["content-type"]).toMatch(/^application\/json/);
        expect(ecartsSchema(cas.contrat.reponse!, res.body)).toEqual([]);
      } else if (cas.contrat.corps === "fichier") {
        expect(res.headers["content-type"]).toBeTruthy();
        expect(Buffer.byteLength(res.text ?? "") || (res.body as Buffer)?.length).toBeGreaterThan(0);
      } else {
        expect(res.text ?? "").toBe("");
      }
    }, 60_000);
  }

  it("chaque contrat déclaré a au moins un cas ; chaque route qu'il sert a son cas", () => {
    const contrats = Object.values(C) as StudioContratRoute[];
    const routesSansCas = contrats.flatMap((k) => k.routes.filter((r) => !CAS.some((x) => x.contrat === k && x.route === r)).map((r) => `${k.id} : ${r}`));
    expect(routesSansCas).toEqual([]);
    expect(CAS.filter((x) => !x.contrat.routes.includes(x.route)).map((x) => x.libelle)).toEqual([]);
  });

  it("le schéma versionné rejette une réponse altérée : champ retiré, champ inconnu, type changé", () => {
    const etude = { studies: [{ id: "s", name: "Étude", initialVariantId: "v", createdAt: "t", updatedAt: null, workflowPhase: null, archived: false }], exemple: null };
    expect(ecartsSchema(C.CONTRAT_ETUDES_LISTER.reponse!, etude)).toEqual([]);
    expect(ecartsSchema(C.CONTRAT_ETUDES_LISTER.reponse!, { studies: etude.studies })).not.toEqual([]);
    expect(ecartsSchema(C.CONTRAT_ETUDES_LISTER.reponse!, { ...etude, inconnu: 1 })).not.toEqual([]);
    expect(ecartsSchema(C.CONTRAT_ETUDES_LISTER.reponse!, { ...etude, studies: [{ ...etude.studies[0], archived: "non" }] })).not.toEqual([]);
    // Document Studio relu par le validateur de studio-document/1 : une forme approchée est refusée.
    expect(ecartsSchema(C.CONTRAT_VARIANTE_LIRE.reponse!, { study: { id: "s", name: "É", projectId: "p" }, variant: { id: "v", name: "V", studyId: "s", headRevisionId: "r1" }, revision: { id: "r1", parentRevisionId: null, document: { id: "doc" } }, canWrite: true, archived: false, derivedFrom: null })).not.toEqual([]);
  });

  it("version incompatible demandée (X-Studio-Contrat) : 400 contrat_incompatible avant tout accès, rien d'écrit, sur chaque route", async () => {
    const ecarts: string[] = [];
    for (const cas of CAS) {
      initialiserProjet();
      const c = cas.preparer ? await cas.preparer() : {};
      const ecrituresAvant = banc.ecritures;
      verdicts.length = 0;
      const autre = cas.contrat.id.replace(/\/\d+$/, "/99");
      let r = comme(cas.acteur ?? "proprietaire", request(app)[methodeDe(cas.route)](cas.url(c))).set(STUDIO_CONTRAT_ENTETE, autre);
      const corps = cas.corps?.(c);
      if (corps !== undefined) r = r.send(corps as object);
      const res = await r;
      const conforme = res.status === 400 && res.body?.error === "contrat_incompatible" && res.body?.attendu === cas.contrat.id && res.body?.recu === autre
        && res.headers[STUDIO_CONTRAT_ENTETE.toLowerCase()] === cas.contrat.id && studioReponseRefus.safeParse(res.body).success
        && banc.ecritures === ecrituresAvant && verdicts.length === 0;
      if (!conforme) ecarts.push(`${cas.libelle} : ${res.status} ${JSON.stringify(res.body).slice(0, 200)} écritures ${banc.ecritures - ecrituresAvant} accès ${verdicts.length}`);
    }
    expect(ecarts).toEqual([]);
  }, 180_000);

  it("version exacte demandée (X-Studio-Contrat) : la route la sert", async () => {
    for (const cas of CAS.filter((x) => !x.preparer && methodeDe(x.route) === "get")) {
      initialiserProjet();
      const res = await comme("proprietaire", request(app).get(cas.url({}))).set(STUDIO_CONTRAT_ENTETE, cas.contrat.id);
      expect(cas.contrat.statuts, cas.libelle).toContain(res.status);
      expect(res.headers[STUDIO_CONTRAT_ENTETE.toLowerCase()]).toBe(cas.contrat.id);
    }
  });

  it("chaque route du routeur Studio porte son contrat (inventaire à l'exécution, sous-routeurs compris)", () => {
    const vus = inventaireExecution(studioRouter);
    expect(vus.filter((v) => !v.contrat).map((v) => v.route)).toEqual([]);
    const contrats = Object.values(C) as StudioContratRoute[];
    // Chaque route servie par un contrat est déclarée une fois, et porte ce contrat-là.
    for (const k of contrats) {
      for (const r of k.routes) {
        const [m, chemin] = r.split(" ");
        const portes = vus.filter((v) => v.methode === m && chemin!.endsWith(v.chemin) && (v.chemin === chemin || chemin!.startsWith("/preferences")));
        expect(portes.map((v) => v.contrat?.id), r).toEqual([k.id]);
      }
    }
    expect(vus.length).toBe(contrats.reduce((n, k) => n + k.routes.length, 0));
  });
});

interface CoucheExpress { route?: { path: string; methods: Record<string, boolean>; stack: { handle: unknown }[] }; handle?: { stack?: CoucheExpress[] } }
/** Routes déclarées dans un routeur Express (récursif) et le contrat posé sur chacune. */
function inventaireExecution(routeur: unknown): { route: string; methode: string; chemin: string; contrat: StudioContratRoute | null }[] {
  const out: { route: string; methode: string; chemin: string; contrat: StudioContratRoute | null }[] = [];
  const visiter = (pile: CoucheExpress[]): void => {
    for (const couche of pile) {
      if (couche.route) {
        const contrat = couche.route.stack.map((s) => (s.handle as Partial<StudioGestionnaireContrat>).contrat).find((x) => x) ?? null;
        for (const m of Object.keys(couche.route.methods).filter((x) => couche.route!.methods[x])) out.push({ route: `${m.toUpperCase()} ${couche.route.path}`, methode: m.toUpperCase(), chemin: couche.route.path, contrat });
      } else if (couche.handle?.stack) visiter(couche.handle.stack);
    }
  };
  visiter((routeur as { stack: CoucheExpress[] }).stack);
  return out;
}
