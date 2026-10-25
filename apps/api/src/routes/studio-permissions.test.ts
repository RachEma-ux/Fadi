import { beforeEach, describe, expect, it, vi } from "vitest";
/**
 * X.2-02 — matrice rôle × route Studio × attendu, exécutée de bout en bout sur le routeur Express réel
 * (`routes/studio.ts` et ses sous-routeurs), sans base ni serveur (garde DB fermée) : la base est simulée en mémoire
 * (`testing/studio-base-simulee.ts` : lignes par table, conditions drizzle évaluées, jointures, transactions par un `tx`
 * distinct, unicités et déclencheurs relus dans `db/init.sql` ; ses limites sont déclarées dans son en-tête). Le rôle
 * est lu dans la base simulée (`projects.ownerId`, `project_members`) ; le contrôle d'accès (`projectAccessRefusal`) est
 * le vrai, enveloppé d'un espion qui relève chaque verdict.
 *
 * Acteurs : non-membre, lecteur, éditeur, éditeur pendant le verrou d'édition d'un autre compte, propriétaire,
 * propriétaire pendant le verrou d'édition d'un autre compte, propriétaire d'un projet de référence protégé. Attendus
 * (`attendu`) : `404` (non-membre : aucune fuite), `403` (rôle insuffisant), `403-reference` (projet de référence
 * protégé), `423` (édition réservée par un autre compte), `admis` (aucun refus de droit : le traitement suit — 2xx, ou
 * refus métier 400 / 404 / 409 d'une ressource). Une cellule « à arbitrer » est exécutée et épinglée telle quelle (le
 * comportement observé n'est pas changé) mais attend une décision du maître d'ouvrage. Chaque refus est vérifié sans
 * écriture. La liste des routes est comparée aux déclarations des routeurs (aucune route Studio hors matrice ; une forme
 * de déclaration non reconnue — appel chaîné, `.route()`, `.all()` — fait échouer l'inventaire), les routes hors Studio
 * qui touchent des données Studio sont déclarées « non couvertes » (liste vérifiée), et la matrice publiée
 * (`docs/ai-team/reports/claude-v9-x2/PERMISSIONS.md`) est régénérée et comparée à l'octet près
 * (`STUDIO_TRACABILITE_ECRIRE=1` la réécrit). Rangée sous `routes/` et non sous `testing/` : supertest
 * ouvre une socket de boucle locale, que les sentinelles réseau de `vitest.guard.config.ts` refusent à juste titre ; la
 * suite ne touche aucune base (client simulé) et tourne avec les suites API ordinaires (`check-api-tests-db3.mjs`).
 */
vi.mock("../db/client.js", async () => ({ db: (await import("../testing/studio-base-simulee.js")).baseSimulee() }));
vi.mock("../middleware/require-auth.js", async () => (await import("../testing/studio-base-simulee.js")).authSimulee());
vi.mock("../lib/owned-project.js", async (original) => (await import("../testing/studio-base-simulee.js")).accesSimule(await original<typeof import("../lib/owned-project.js")>()));
vi.mock("../lib/step-rows.js", () => ({ lockProject: vi.fn(async () => undefined) }));
vi.mock("../lib/atelier-exact.js", () => ({ TYPE_CREER_EXACT: "solideExact.creer", revaliderSolidesExacts: vi.fn() }));
vi.mock("../lib/atelier-events.js", () => ({ EVENEMENT_COMMANDE_VALIDEE: "atelier.commande.validee", enregistrerEvenement: vi.fn() }));
vi.mock("../lib/atelier-modele.js", () => ({ chargerModele: vi.fn(), creerModeleVide: vi.fn(), persisterDifferentiel: vi.fn() }));
vi.mock("../lib/atelier-refexterne.js", () => ({ controlerRattachements: vi.fn() }));

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import express from "express";
import request from "supertest";
import { STUDIO_CONTRACT } from "@parcours/atelier-model";
import { studioRouter } from "./studio.js";
import { ACTEURS, banc, initialiserProjet, verdicts, type Acteur } from "../testing/studio-base-simulee.js";

const app = express();
app.use("/projects/:projectId/studio", studioRouter);
app.use((err: unknown, _req: unknown, res: { status: (n: number) => { json: (b: unknown) => void } }, _next: unknown) => {
  res.status(500).json({ error: "erreur", message: String((err as Error)?.message ?? err) });
});

const LIBELLE_ACTEUR: Record<Acteur, string> = {
  etranger: "non-membre", lecteur: "lecteur", editeur: "éditeur", "editeur-verrou": "éditeur (verrou d'un autre)",
  proprietaire: "propriétaire", "proprietaire-verrou": "propriétaire (verrou d'un autre)", "proprietaire-reference": "propriétaire (projet de référence)",
};

const initialiser = initialiserProjet;
beforeEach(initialiser);

type Methode = "get" | "post" | "put" | "patch" | "delete";
/** Besoin de droit déclaré par la route (commentaires des routeurs et règles des `lib/studio-*.ts`). */
type Besoin = "lecture" | "commentaire" | "ecriture" | "modification" | "proprietaire" | "acteur";
type Attendu = "admis" | "404" | "403" | "403-reference" | "423";
type Contexte = Record<string, string>;
interface Route {
  /** Route telle que déclarée par le routeur (sous `/projects/:projectId/studio`). */
  route: string;
  besoin: Besoin;
  url: (c: Contexte) => string;
  body?: unknown;
  /** Préparation faite par le propriétaire (ressource à créer d'abord) ; rend les identifiants des URL. */
  preparer?: () => Promise<Contexte>;
  /** Attendus par acteur pour une règle d'acteur (auteur, responsable) au-delà du rôle. */
  acteurs?: Partial<Record<Acteur, Attendu>>;
  /** Cellules exécutées telles quelles mais « à arbitrer » (décision du maître d'ouvrage attendue). */
  arbitrer?: Acteur[];
  /** Corps calculé d'après la préparation (sinon `body`). */
  corps?: (c: Contexte) => unknown;
  note?: string;
}

const S = "/projects/p/studio";
const V = `${S}/studies/s/variants/v`;
const comme = (acteur: Acteur) => (r: request.Test) => r.set("x-acteur", acteur);
async function creer(url: string, body: unknown, lireId: (b: Record<string, any>) => unknown = (b) => b?.id): Promise<string> {
  const res = await comme("proprietaire")(request(app).post(url)).send(body as object);
  const id = lireId(res.body);
  if (res.status >= 300 || typeof id !== "string") throw new Error(`préparation ${url} : ${res.status} ${JSON.stringify(res.body).slice(0, 300)}`);
  return id;
}
const exigence = { id: "e1", libelle: "Exigence e1", metrique: { type: "nombre" }, comparaison: "<=", valeur: 10, unite: "u", source: "Programme saisi (essai)" };
const publication = async () => ({ pub: await creer(`${V}/publications`, { title: "Dossier d'essai", contenu: "dessin-2d" }) });
// Audience « projet » (écart E1) : le lecteur voit l'observation, les cellules jugent donc son rôle (403), pas son audience (404).
const observation = async () => ({ obs: await creer(`${V}/observations`, { body: "Observation d'essai", responsableId: "editeur", audience: "projet" }) });
/** Délégation d'approbation (EX-085) du propriétaire à l'éditeur, portée projet, période en cours. */
const DELEGATION = { delegateId: "editeur", scopeType: "projet", startsAt: new Date(Date.now() - 3_600_000).toISOString(), endsAt: new Date(Date.now() + 30 * 86_400_000).toISOString(), reason: "Absence du propriétaire (essai)" };
const delegation = async () => ({ dl: await creer(`${S}/delegations`, DELEGATION) });
const feuille = async () => ({ f: await creer(`${V}/sheets`, { number: "A-01", title: "Plan", format: "A3", orientation: "paysage", scale: "ajuster" }) });
const dossier = async () => { const { f } = await feuille(); return { f, d: await creer(`${S}/studies/s/dossiers`, { title: "Dossier", sheetIds: [f] }) }; };

/**
 * Règles d'acteur des observations (`lib/studio-observations.ts`), l'observation étant ouverte par le propriétaire
 * avec l'éditeur pour responsable : elles se jugent sur l'identité et le rôle (`roleAllows`), pas sur le verrou
 * d'édition ; « éditeur (verrou d'un autre) » est un autre compte éditeur, ni auteur ni responsable.
 */
const RESPONSABLE: Partial<Record<Acteur, Attendu>> = { etranger: "404", lecteur: "403", editeur: "admis", "editeur-verrou": "403", proprietaire: "403", "proprietaire-verrou": "403", "proprietaire-reference": "403" };
const AUTEUR_RESPONSABLE_PROPRIETAIRE: Partial<Record<Acteur, Attendu>> = { etranger: "404", lecteur: "403", editeur: "admis", "editeur-verrou": "403", proprietaire: "admis", "proprietaire-verrou": "admis", "proprietaire-reference": "admis" };
const PUB = "/studies/:studyId/publications/:publicationId";
const OBS = "/studies/:studyId/variants/:variantId/observations";
const COM = "/studies/:studyId/variants/:variantId/comments";
export const ROUTES: Route[] = [
  { route: "GET /studies", besoin: "lecture", url: () => `${S}/studies` },
  { route: "POST /studies", besoin: "modification", url: () => `${S}/studies`, body: { name: "Nouvelle" } },
  { route: "GET /studies/:studyId", besoin: "lecture", url: () => `${S}/studies/s` },
  { route: "PATCH /studies/:studyId", besoin: "modification", url: () => `${S}/studies/s`, body: { name: "Renommée" } },
  { route: "PATCH /studies/:studyId/workflow", besoin: "modification", url: () => `${S}/studies/s/workflow`, body: { phase: "controler" }, note: "phase déclarée du workflow (REF-01 §06) : propriétaire ou éditeur ; aucune donnée de conception modifiée" },
  {
    route: "POST /exemple", besoin: "proprietaire", url: () => `${S}/exemple`, acteurs: { "proprietaire-verrou": "admis" },
    note: "étude exemple P.118 : écriture système du propriétaire, admise dans la référence protégée ; projet hors exemple → 409 exemple_indisponible avant tout verrou ; le verrou d'édition d'un autre compte (423) ne s'oppose qu'à une installation qui écrit, jamais à la lecture d'une étude exemple complète (lib/studio-exemple.test.ts)",
  },
  { route: "POST /studies/:studyId/archive", besoin: "modification", url: () => `${S}/studies/s/archive` },
  { route: "POST /studies/:studyId/unarchive", besoin: "modification", url: () => `${S}/studies/s/unarchive` },
  { route: "GET /studies/:studyId/compare", besoin: "lecture", url: () => `${S}/studies/s/compare?from=v&to=v` },
  { route: "GET /studies/:studyId/variants", besoin: "lecture", url: () => `${S}/studies/s/variants` },
  { route: "POST /studies/:studyId/variants", besoin: "modification", url: () => `${S}/studies/s/variants`, body: { name: "Variante 2" } },
  { route: "PATCH /studies/:studyId/variants/:variantId", besoin: "modification", url: () => V, body: { name: "Renommée" } },
  { route: "POST /studies/:studyId/variants/:variantId/archive", besoin: "modification", url: () => `${V}/archive`, note: "variante initiale : 400 initial_variant après le contrôle de droit" },
  { route: "POST /studies/:studyId/variants/:variantId/unarchive", besoin: "modification", url: () => `${V}/unarchive` },
  { route: "GET /studies/:studyId/variants/:variantId", besoin: "lecture", url: () => V },
  { route: "GET /studies/:studyId/variants/:variantId/revisions", besoin: "lecture", url: () => `${V}/revisions` },
  { route: "GET /studies/:studyId/variants/:variantId/revisions/:revisionId", besoin: "lecture", url: () => `${V}/revisions/r1` },
  { route: "GET /studies/:studyId/variants/:variantId/revisions/:revisionId/changes", besoin: "lecture", url: () => `${V}/revisions/r1/changes` },
  { route: "GET /studies/:studyId/variants/:variantId/export", besoin: "lecture", url: () => `${V}/export?format=svg` },
  { route: "GET /studies/:studyId/variants/:variantId/export/rapport", besoin: "lecture", url: () => `${V}/export/rapport?format=svg` },
  {
    route: "POST /studies/:studyId/variants/:variantId/commands", besoin: "modification", url: () => `${V}/commands`,
    body: { contractVersion: STUDIO_CONTRACT, requestId: "q1", baseRevisionId: "r1", commands: [{ toolId: "studio.dessin.ligne", params: { id: "b", type: "line", start: { x: 0, y: 1 }, end: { x: 1, y: 1 } } }] },
  },
  { route: `GET ${COM}`, besoin: "lecture", url: () => `${V}/comments` },
  { route: `POST ${COM}`, besoin: "commentaire", url: () => `${V}/comments`, body: { body: "Texte" } },
  {
    route: `DELETE ${COM}/:commentId`, besoin: "acteur", url: () => `${V}/comments/c1`, note: "auteur seul (c1 : éditeur)",
    acteurs: { etranger: "404", lecteur: "403", editeur: "admis", "editeur-verrou": "403", proprietaire: "403", "proprietaire-verrou": "403", "proprietaire-reference": "403" },
  },
  {
    route: `PATCH ${COM}/:commentId`, besoin: "acteur", url: () => `${V}/comments/c1`, body: { audience: "projet" },
    note: "audience du fil (écart E1) : son auteur (c1 : éditeur) ou le propriétaire, tous deux de l'équipe ; le verrou d'édition ne s'y applique pas",
    acteurs: { etranger: "404", lecteur: "403", editeur: "admis", "editeur-verrou": "403", proprietaire: "admis", "proprietaire-verrou": "admis", "proprietaire-reference": "admis" },
  },
  {
    route: `POST ${COM}/:commentId/observation`, besoin: "acteur", url: () => `${V}/comments/c1/observation`, body: { responsableId: "editeur" },
    note: "auteur du commentaire (c1 : éditeur) ou propriétaire",
    acteurs: { etranger: "404", lecteur: "403", editeur: "admis", "editeur-verrou": "403", proprietaire: "admis", "proprietaire-verrou": "admis", "proprietaire-reference": "admis" },
  },
  {
    route: `POST ${COM}/:commentId/observation/transitions`, besoin: "acteur", url: () => `${V}/comments/c1/observation/transitions`, body: { action: "corriger", revisionId: "r1" },
    preparer: async () => { await creer(`${V}/comments/c1/observation`, { responsableId: "editeur" }); return {}; },
    note: "corriger : le responsable (éditeur) avec le droit d'écrire, seul", acteurs: RESPONSABLE,
  },
  { route: "GET /studies/:studyId/steps", besoin: "lecture", url: () => `${S}/studies/s/steps` },
  { route: "PUT /studies/:studyId/steps", besoin: "modification", url: () => `${S}/studies/s/steps`, body: { steps: [] } },
  { route: "GET /steps/:stepNumber/studies", besoin: "lecture", url: () => `${S}/steps/1/studies` },
  { route: "GET /preferences/outils", besoin: "lecture", url: () => `${S}/preferences/outils`, note: "préférences du compte : aucune écriture du projet" },
  { route: "PUT /preferences/outils", besoin: "lecture", url: () => `${S}/preferences/outils`, body: { profil: "standard", favoris: ["studio.dessin.ligne"], personnel: [] }, note: "préférences du compte (INV-009) : lecture du projet suffit" },
  { route: "GET /preferences/catalogue", besoin: "lecture", url: () => `${S}/preferences/catalogue` },
  { route: "GET /publications", besoin: "lecture", url: () => `${S}/publications` },
  { route: "GET /delegations", besoin: "lecture", url: () => `${S}/delegations`, note: "délégations d'approbation (EX-085) : toutes pour le propriétaire, sinon celles dont on est délégant ou délégué" },
  {
    route: "POST /delegations", besoin: "proprietaire", url: () => `${S}/delegations`, body: DELEGATION, acteurs: { "proprietaire-verrou": "admis" },
    note: "délégation d'approbation (EX-085) : qui détient le droit d'approuver sur la portée ; elle ne modifie aucun contenu, la réservation d'édition ne s'y oppose pas (elle s'oppose à son emploi)",
  },
  {
    route: "POST /delegations/:delegationId/revoquer", besoin: "acteur", preparer: delegation, url: (c) => `${S}/delegations/${c["dl"]}/revoquer`, body: { reason: "Retour du propriétaire" },
    note: "révocation motivée : le délégant (propriétaire) ou le propriétaire du projet ; le délégué ne révoque pas",
    acteurs: { etranger: "404", lecteur: "403", editeur: "403", "editeur-verrou": "403", proprietaire: "admis", "proprietaire-verrou": "admis", "proprietaire-reference": "admis" },
  },
  { route: "GET /studies/:studyId/publications", besoin: "lecture", url: () => `${S}/studies/s/publications` },
  { route: "POST /studies/:studyId/variants/:variantId/publications", besoin: "ecriture", url: () => `${V}/publications`, body: { title: "Dossier", contenu: "dessin-2d" } },
  { route: `GET ${PUB}`, besoin: "lecture", preparer: publication, url: (c) => `${S}/studies/s/publications/${c["pub"]}` },
  { route: `GET ${PUB}/verification`, besoin: "lecture", preparer: publication, url: (c) => `${S}/studies/s/publications/${c["pub"]}/verification` },
  { route: `GET ${PUB}/files/:format`, besoin: "lecture", preparer: publication, url: (c) => `${S}/studies/s/publications/${c["pub"]}/files/svg` },
  {
    route: `GET ${PUB}/controle-approbation`, besoin: "proprietaire", preparer: publication, url: (c) => `${S}/studies/s/publications/${c["pub"]}/controle-approbation`,
    note: "aperçu de l'auto-contrôle (OP-6) : même accès que l'approbation (rôle, puis réservation d'édition d'un autre compte) ; lecture seule",
  },
  ...([["soumettre", "ecriture"], ["actualiser", "ecriture"], ["approuver", "proprietaire"], ["refuser", "proprietaire"], ["diffuser", "proprietaire"], ["retirer", "proprietaire"]] as const).map(([action, besoin]): Route => ({
    route: `POST ${PUB}/:action`, besoin, preparer: publication, url: (c) => `${S}/studies/s/publications/${c["pub"]}/${action}`, body: { comment: "Motif" }, note: `action ${action}`,
  })),
  {
    // Transition sur un état valide : publication soumise, ensemble présenté exact → 200 pour le propriétaire.
    route: `POST ${PUB}/:action`, besoin: "proprietaire", note: "action approuver (publication soumise)",
    preparer: async () => {
      const pub = await creer(`${V}/publications`, { title: "Dossier d'essai", contenu: "dessin-2d" });
      const v = await comme("proprietaire")(request(app).post(`${S}/studies/s/publications/${pub}/soumettre`)).send({});
      if (v.status !== 200) throw new Error(`préparation soumettre : ${v.status}`);
      return { pub, manifestHash: v.body.manifestHash, revisionId: v.body.revisionId, documentHash: v.body.documentHash };
    },
    url: (c) => `${S}/studies/s/publications/${c["pub"]}/approuver`,
    corps: (c) => ({ manifestHash: c["manifestHash"], revisionId: c["revisionId"], documentHash: c["documentHash"] }),
  },
  { route: "GET /studies/:studyId/exigences", besoin: "lecture", url: () => `${S}/studies/s/exigences` },
  {
    route: "GET /studies/:studyId/exigences/versions/:version", besoin: "lecture", url: () => `${S}/studies/s/exigences/versions/1`,
    preparer: async () => { await creer(`${S}/studies/s/exigences`, { baseVersion: 0, exigences: [exigence] }).catch(() => ""); return {}; },
  },
  { route: "POST /studies/:studyId/exigences", besoin: "modification", url: () => `${S}/studies/s/exigences`, body: { baseVersion: 0, exigences: [exigence] } },
  {
    route: "POST /studies/:studyId/exigences/acceptations", besoin: "proprietaire", url: () => `${S}/studies/s/exigences/acceptations`, body: { baseVersion: 1, exigenceId: "e1" },
    acteurs: { "proprietaire-verrou": "admis" }, arbitrer: ["proprietaire-verrou", "proprietaire-reference"],
    note: "à arbitrer (maître d'ouvrage) : l'acceptation n'est refusée ni par le verrou d'édition d'un autre compte ni par la référence protégée (comportement actuel épinglé, non changé)",
  },
  { route: "GET /studies/:studyId/variants/:variantId/controles", besoin: "lecture", url: () => `${V}/controles` },
  {
    route: "GET /studies/:studyId/variants/:variantId/controles/:checkId", besoin: "lecture", url: (c) => `${V}/controles/${c["k"]}`,
    preparer: async () => { await creer(`${S}/studies/s/exigences`, { baseVersion: 0, exigences: [exigence] }).catch(() => ""); return { k: await creer(`${V}/controles`, {}) }; },
  },
  { route: "POST /studies/:studyId/variants/:variantId/controles", besoin: "ecriture", url: () => `${V}/controles`, body: {} },
  { route: "GET /studies/:studyId/variants/:variantId/ajustements-quantites", besoin: "lecture", url: () => `${V}/ajustements-quantites` },
  {
    route: "POST /studies/:studyId/variants/:variantId/ajustements-quantites", besoin: "modification", url: () => `${V}/ajustements-quantites`,
    body: { baseSequence: 0, revisionId: "r1", cible: { type: "objet", id: "a" }, grandeur: "longueur", unite: "m", valeur: 4.05, motif: "Relevé sur place (essai)" },
  },
  { route: `GET ${OBS}`, besoin: "lecture", url: () => `${V}/observations` },
  { route: `POST ${OBS}`, besoin: "commentaire", url: () => `${V}/observations`, body: { body: "Observation", responsableId: "editeur" } },
  { route: `GET ${OBS}/:observationId`, besoin: "lecture", preparer: observation, url: (c) => `${V}/observations/${c["obs"]}` },
  { route: `GET ${OBS}/rapprochements`, besoin: "lecture", preparer: observation, url: () => `${V}/observations/rapprochements`, note: "rapprochements consignés (EX-086), audience du fil respectée" },
  {
    route: `POST ${OBS}/rapprochements`, besoin: "ecriture", preparer: observation, url: () => `${V}/observations/rapprochements`, body: {},
    note: "rapprochement sur demande avec la tête (EX-086) : propriétaire ou éditeur ; aucun statut d'observation modifié",
  },
  {
    route: `POST ${OBS}/:observationId/transitions`, besoin: "acteur", preparer: observation, url: (c) => `${V}/observations/${c["obs"]}/transitions`, body: { action: "corriger", revisionId: "r1" },
    note: "corriger : le responsable (éditeur) avec le droit d'écrire, seul", acteurs: RESPONSABLE,
  },
  {
    route: `POST ${OBS}/:observationId/liens`, besoin: "acteur", preparer: observation, url: (c) => `${V}/observations/${c["obs"]}/liens`, body: { domaine: "objet", ref: "a", revisionId: "r1" },
    note: "droit d'écrire et auteur (propriétaire), responsable (éditeur) ou propriétaire", acteurs: AUTEUR_RESPONSABLE_PROPRIETAIRE,
  },
  {
    route: `POST ${OBS}/:observationId/taches`, besoin: "acteur", preparer: observation, url: (c) => `${V}/observations/${c["obs"]}/taches`, body: { libelle: "Reprendre", assigneeId: "editeur" },
    note: "propriétaire, ou responsable (éditeur) avec le droit d'écrire", acteurs: AUTEUR_RESPONSABLE_PROPRIETAIRE,
  },
  {
    route: `POST ${OBS}/:observationId/taches/:taskId/transitions`, besoin: "acteur", url: (c) => `${V}/observations/${c["obs"]}/taches/${c["t"]}/transitions`, body: { action: "terminer" },
    preparer: async () => { const { obs } = await observation(); return { obs, t: await creer(`${V}/observations/${obs}/taches`, { libelle: "Reprendre", assigneeId: "editeur" }, (b) => b?.taches?.at(-1)?.id) }; },
    note: "terminer : personne chargée (éditeur) avec le droit d'écrire, ou propriétaire", acteurs: AUTEUR_RESPONSABLE_PROPRIETAIRE,
  },
  {
    route: `POST ${OBS}/:observationId/decisions`, besoin: "acteur", preparer: observation, url: (c) => `${V}/observations/${c["obs"]}/decisions`, body: { nature: "proposition", portee: "autre", texte: "Proposition" },
    note: "proposition : droit d'écrire (rôle ; le verrou d'édition ne s'y applique pas)", acteurs: { etranger: "404", lecteur: "403" },
  },
  { route: "GET /dossiers", besoin: "lecture", url: () => `${S}/dossiers` },
  { route: "GET /studies/:studyId/sheets", besoin: "lecture", url: () => `${S}/studies/s/sheets` },
  { route: "POST /studies/:studyId/variants/:variantId/sheets", besoin: "modification", url: () => `${V}/sheets`, body: { number: "A-02", title: "Plan", format: "A3", orientation: "paysage", scale: "ajuster" } },
  { route: "PATCH /studies/:studyId/sheets/:sheetId", besoin: "modification", preparer: feuille, url: (c) => `${S}/studies/s/sheets/${c["f"]}`, body: { title: "Plan 2" } },
  { route: "DELETE /studies/:studyId/sheets/:sheetId", besoin: "modification", preparer: feuille, url: (c) => `${S}/studies/s/sheets/${c["f"]}` },
  { route: "GET /studies/:studyId/sheets/:sheetId/files/:format", besoin: "lecture", preparer: feuille, url: (c) => `${S}/studies/s/sheets/${c["f"]}/files/svg` },
  { route: "GET /studies/:studyId/dossiers", besoin: "lecture", url: () => `${S}/studies/s/dossiers` },
  { route: "POST /studies/:studyId/dossiers", besoin: "modification", preparer: feuille, url: () => `${S}/studies/s/dossiers`, body: undefined },
  { route: "GET /studies/:studyId/dossiers/:dossierId", besoin: "lecture", preparer: dossier, url: (c) => `${S}/studies/s/dossiers/${c["d"]}` },
  { route: "PATCH /studies/:studyId/dossiers/:dossierId", besoin: "modification", preparer: dossier, url: (c) => `${S}/studies/s/dossiers/${c["d"]}`, body: { title: "Dossier 2" } },
  { route: "GET /studies/:studyId/dossiers/:dossierId/files/:format", besoin: "lecture", preparer: dossier, url: (c) => `${S}/studies/s/dossiers/${c["d"]}/files/json` },
];

/**
 * Réponse du propriétaire (statut et code d'erreur métier), épinglée : le traitement après le contrôle de droit.
 * Clé : route, suivie de l'action d'une transition de publication ; absente : 200.
 */
const REPONSES: Readonly<Record<string, string>> = {
  "POST /studies": "201", "POST /studies/:studyId/variants": "201",
  "POST /exemple": "409 exemple_indisponible",
  "POST /studies/:studyId/variants/:variantId/archive": "400 initial_variant",
  "POST /studies/:studyId/variants/:variantId/comments": "201", "POST /studies/:studyId/variants/:variantId/comments/:commentId/observation": "201",
  "POST /studies/:studyId/variants/:variantId/comments/:commentId/observation/transitions": "403 forbidden",
  "DELETE /studies/:studyId/variants/:variantId/comments/:commentId": "403 forbidden",
  "POST /studies/:studyId/variants/:variantId/publications": "201",
  "POST /delegations": "201",
  "GET /studies/:studyId/publications/:publicationId/verification": "404 not_found",
  "GET /studies/:studyId/publications/:publicationId/files/:format": "404 not_found",
  "POST /studies/:studyId/publications/:publicationId/:action actualiser": "409 manifest_current",
  "POST /studies/:studyId/publications/:publicationId/:action approuver": "409 invalid_transition",
  "POST /studies/:studyId/publications/:publicationId/:action refuser": "409 invalid_transition",
  "POST /studies/:studyId/publications/:publicationId/:action diffuser": "409 invalid_transition",
  "POST /studies/:studyId/exigences": "201", "POST /studies/:studyId/exigences/acceptations": "409 version_perimee",
  "POST /studies/:studyId/variants/:variantId/controles": "201", "POST /studies/:studyId/variants/:variantId/ajustements-quantites": "201",
  "POST /studies/:studyId/variants/:variantId/observations": "201",
  "POST /studies/:studyId/variants/:variantId/observations/:observationId/transitions": "403 forbidden",
  "POST /studies/:studyId/variants/:variantId/observations/:observationId/liens": "201",
  "POST /studies/:studyId/variants/:variantId/observations/:observationId/taches": "201",
  "POST /studies/:studyId/variants/:variantId/observations/:observationId/decisions": "201",
  "POST /studies/:studyId/variants/:variantId/sheets": "201", "POST /studies/:studyId/dossiers": "201",
};
const cleReponse = (r: Route) => `${r.route}${r.note?.startsWith("action ") ? ` ${r.note.slice(7)}` : ""}`;
export const reponseProprietaire = (r: Route): string => REPONSES[cleReponse(r)] ?? "200";

/** Attendu d'une cellule d'après le besoin de la route (`projectAccessRefusal` : 404 / 403 / 423, référence protégée). */
export function attendu(r: Pick<Route, "besoin" | "acteurs">, a: Acteur): Attendu {
  if (r.acteurs?.[a]) return r.acteurs[a]!;
  if (a === "etranger") return "404";
  const verrou = a === "editeur-verrou" || a === "proprietaire-verrou";
  switch (r.besoin) {
    case "lecture": case "commentaire": case "acteur": return "admis";
    case "ecriture": return a === "lecteur" ? "403" : verrou ? "423" : "admis";
    case "modification": return a === "lecteur" ? "403" : verrou ? "423" : a === "proprietaire-reference" ? "403-reference" : "admis";
    // Actions du propriétaire : rôle d'abord (403), puis verrou d'édition d'un autre compte (423).
    case "proprietaire": return a === "proprietaire" || a === "proprietaire-reference" ? "admis" : a === "proprietaire-verrou" ? "423" : "403";
  }
}

interface Observe { status: number; error: unknown; motif: unknown; refus404: boolean; ecrit: boolean; message: unknown }
async function executer(r: Route, a: Acteur, contexte: Contexte, corps: unknown): Promise<Observe> {
  verdicts.length = 0;
  const ecritesAvant = banc.ecritures;
  const m = r.route.split(" ")[0]!.toLowerCase() as Methode;
  let req = comme(a)(request(app)[m](r.url(contexte)));
  if (corps !== undefined) req = req.send(corps as object);
  const res = await req;
  return {
    status: res.status, error: res.body?.error, motif: res.body?.motif, message: res.body?.message,
    refus404: verdicts.some((x) => x.status === 404), ecrit: banc.ecritures > ecritesAvant,
  };
}
function conforme(o: Observe, att: Attendu): boolean {
  switch (att) {
    case "404": return o.status === 404 && o.error === "not_found" && !o.ecrit;
    case "403": return o.status === 403 && o.error === "forbidden" && o.motif !== "reference-protegee" && !o.ecrit;
    case "403-reference": return o.status === 403 && o.motif === "reference-protegee" && !o.ecrit;
    case "423": return o.status === 423 && o.error === "locked" && !o.ecrit;
    case "admis": return o.status < 500 && o.status !== 401 && o.status !== 403 && o.status !== 423 && !(o.status === 404 && o.refus404);
  }
}

/** Corps d'un POST de dossier : la feuille préparée. */
const corpsDe = (r: Route, c: Contexte): unknown => (r.corps ? r.corps(c) : r.route === "POST /studies/:studyId/dossiers" ? { title: "Dossier", sheetIds: [c["f"]] } : r.body);

describe("X.2-02 — matrice rôle × route Studio × attendu (routeur réel, base simulée)", () => {
  it("chaque route déclarée par les routeurs Studio figure dans la matrice, et réciproquement", () => {
    expect(new Set(ROUTES.map((r) => r.route))).toEqual(new Set(routesDeclarees()));
  });

  it("une déclaration de route hors de la forme reconnue (chaînée, .route(), .all(), autre routeur) fait échouer l'inventaire", () => {
    expect(declarationsNonReconnues(`studioRouter.get("/a", h);\nstudioRouter.post(\`\${base}/b\`, h);`)).toBeNull();
    expect(declarationsNonReconnues(`studioRouter.get("/a", h).post("/b", h);`)).toMatch(/1 appel/);
    expect(declarationsNonReconnues(`studioRouter\n  .get("/a", h);`)).toMatch(/1 appel/);
    expect(declarationsNonReconnues(`studioRouter.route("/a").get(h);`)).toMatch(/route/);
    expect(declarationsNonReconnues(`studioRouter.all("/a", h);`)).toMatch(/all/);
    expect(declarationsNonReconnues(`autreRouter.get("/a", h);`)).toMatch(/1 appel/);
  });

  it("les routes hors Studio qui touchent des données Studio sont toutes déclarées « non couvertes »", () => {
    expect(routesHorsStudioTouchantStudio()).toEqual(HORS_MATRICE.map((h) => h.fichier).sort());
  });

  it("chaque cellule rend l'attendu ; aucun refus n'écrit quoi que ce soit", async () => {
    const ecarts: string[] = [];
    for (const r of ROUTES) {
      for (const a of ACTEURS) {
        initialiser();
        const contexte = r.preparer ? await r.preparer() : {};
        const o = await executer(r, a, contexte, corpsDe(r, contexte));
        const att = attendu(r, a);
        const vu = `${o.status}${o.status >= 300 && o.error ? ` ${String(o.error)}` : ""}`;
        if (a === "proprietaire" && vu !== reponseProprietaire(r)) ecarts.push(`${cleReponse(r)} × proprietaire : réponse attendue ${reponseProprietaire(r)}, observée ${vu}`);
        if (!conforme(o, att)) ecarts.push(`${r.route}${r.note ? ` (${r.note})` : ""} × ${a} : attendu ${att}, observé ${o.status} ${String(o.error ?? "")} ${String(o.motif ?? "")} ${o.status >= 500 ? String(o.message) : ""}`);
      }
    }
    expect(ecarts).toEqual([]);
  }, 120_000);

  it("sans session : 401 sur toute route Studio, avant tout accès", async () => {
    for (const r of ROUTES.filter((x) => !x.preparer)) {
      verdicts.length = 0;
      const res = await request(app)[r.route.split(" ")[0]!.toLowerCase() as Methode](r.url({}));
      expect(res.status, r.route).toBe(401);
      expect(verdicts).toEqual([]);
    }
  });

  it("phase déclarée du workflow : une phase inconnue, un champ en plus ou une valeur absente sont refusés (400) avant tout accès", async () => {
    for (const corps of [{ phase: "inconnue" }, { phase: "Contrôler" }, { phase: "controler", autre: 1 }, {}, { phase: 3 }]) {
      verdicts.length = 0;
      const res = await comme("proprietaire")(request(app).patch(`${S}/studies/s/workflow`)).send(corps);
      expect(res.status, JSON.stringify(corps)).toBe(400);
      expect(res.body.error).toBe("invalid_input");
      expect(verdicts).toEqual([]);
    }
  });

  it("la matrice publiée est celle que ce test vérifie (régénérée, comparée à l'octet près)", () => {
    const md = matriceMarkdown();
    if (process.env["STUDIO_TRACABILITE_ECRIRE"] === "1") writeFileSync(FICHIER_MATRICE, md);
    expect(readFileSync(FICHIER_MATRICE, "utf8")).toBe(md);
  });
});

// --- Inventaire des routes déclarées ------------------------------------------------------------------------------

const RACINE = fileURLToPath(new URL("../../../../", import.meta.url));
const FICHIER_MATRICE = `${RACINE}docs/ai-team/reports/claude-v9-x2/PERMISSIONS.md`;

/**
 * Routes déclarées par `routes/studio*.ts` : `<routeur>.<méthode>(chemin, …)`, constantes de chemin du fichier
 * substituées, boucle archive / désarchive de `studio.ts` développée, préférences montées sous `/preferences`.
 */
export function routesDeclarees(): string[] {
  return routesDeclareesDans(fileURLToPath(new URL("../routes/", import.meta.url)));
}
const sansCommentairesTs = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
/**
 * Toute forme de déclaration autre que `studioXRouter.méthode(chemin, …)` en début de ligne (`.route()`, `.all()`,
 * appel chaîné, routeur d'un autre nom) ferait échapper une route à la matrice : elle est signalée (texte du motif),
 * et l'inventaire échoue plutôt que de l'ignorer. Null si toutes les déclarations sont reconnues.
 */
export function declarationsNonReconnues(source: string): string | null {
  const reconnues = [...source.matchAll(/^\s*studio\w*Router\.(get|post|put|patch|delete)\(/gm)].length;
  const appels = [...source.matchAll(/\.\s*(get|post|put|patch|delete|all)\(\s*(?:["'`]\/|`\$\{|\w+\s*,)/g)].length;
  const formes = [...source.matchAll(/\.\s*route\(/g), ...source.matchAll(/\.\s*all\(/g)].map((m) => m[0]);
  if (formes.length) return formes.join(", ");
  return appels !== reconnues ? `${appels - reconnues} appel(s) hors forme \`studioXRouter.méthode(chemin, …)\`` : null;
}
function routesDeclareesDans(dossier: string): string[] {
  const out: string[] = [];
  for (const nom of readdirSync(dossier).filter((f) => /^studio.*\.ts$/.test(f) && !f.endsWith(".test.ts"))) {
    const source = readFileSync(`${dossier}${nom}`, "utf8");
    const constantes = new Map([...source.matchAll(/^const (\w+) = ["`]([^"`$]*)["`];/gm)].map((m) => [m[1]!, m[2]!]));
    const prefixe = nom === "studio-preferences.ts" ? "/preferences" : "";
    const sansCommentaires = sansCommentairesTs(source);
    const ecart = declarationsNonReconnues(sansCommentaires);
    if (ecart) throw new Error(`routes/${nom} : déclaration de route non reconnue par l'inventaire (${ecart})`);
    for (const m of sansCommentaires.matchAll(/^\s*studio\w*Router\.(get|post|put|patch|delete)\((?:(["`])(.*?)\2|(\w+))\s*,/gm)) {
      let chemin = m[4] ? constantes.get(m[4]) ?? `?${m[4]}` : m[3]!;
      chemin = chemin.replace(/\$\{(\w+)\}/g, (_x, k: string) => constantes.get(k) ?? `\${${k}}`);
      const chemins = chemin.includes("${action}") ? ["archive", "unarchive"].map((a) => chemin.replace("${action}", a)) : [chemin];
      for (const c of chemins) out.push(`${m[1]!.toUpperCase()} ${prefixe}${c}`);
    }
  }
  return out;
}

/**
 * Routes HORS Studio qui lisent ou écrivent des données Studio : non couvertes par cette matrice (leurs droits sont ceux
 * de leur routeur, contrôlés par leurs propres suites, base réelle) — suites DB-3. La liste des fichiers est vérifiée.
 */
export const HORS_MATRICE: { fichier: string; routes: string; donnees: string }[] = [
  { fichier: "routes/auth.ts", routes: "GET /auth/me/export", donnees: "commentaires Studio rédigés par le compte, dans l'export de ses données personnelles (D-5, gestion des comptes) — lecture de ses propres lignes seulement" },
  { fichier: "routes/examples.ts", routes: "POST /examples/:exampleId/import", donnees: "étude exemple Studio du P.118 installée après l'import validé (`lib/studio-exemple.ts`, contrat de commandes ; un échec n'annule pas l'import)" },
  { fichier: "routes/com.ts", routes: "POST /projects/:projectId/com/messages/:messageId/actions (type observation-studio) ; GET /projects/:projectId/com/plan ; POST …/com/conversations/:conversationId/messages (épingle) ; GET …/com/activite, …/com/revues", donnees: "observation Studio ouverte depuis un message par `openStudioObservation` (mêmes droits et refus que la route Studio d'ouverture directe, révision et objets de l'épingle repris) ; plan SVG et validation d'une épingle par `readStudioContext` (droit `read` de Studio) ; activité et revues relues sans écriture. La Communication ne garde que des liens (COM-R7, Issue #280, lot COM-13)" },
  { fichier: "routes/documents.ts", routes: "GET /projects/:projectId/documents", donnees: "`studioPackages` (paquets diffusés ou retirés), `studioDossiers` (dossiers de conception)" },
  { fichier: "routes/notifications.ts", routes: "GET /notifications", donnees: "commentaires Studio des projets du compte, passages des observations, tâches et décisions" },
  { fichier: "routes/reviews.ts", routes: "/reviews/* (destinataire), /projects/:projectId/reviews/* (équipe)", donnees: "revue externe (phase 4) : publication Studio candidate figée dans un paquet, constats = observations Studio d'audience `revue`, approbation par un approbateur nommé via les transitions Studio — garde `loadReviewAccess` (destinataire) ou droits de l'équipe, jamais la matrice des rôles Studio" },
  { fichier: "routes/projects.ts", routes: "GET /projects/:projectId/archive, POST /projects/import, POST /projects/:projectId/copies, DELETE /projects/:projectId", donnees: "section Studio de l'archive (export, import validé), copie sans Studio, suppression refusée si une publication est diffusée ou retirée" },
];
/** Fichiers `routes/*.ts` hors Studio qui citent une table, une bibliothèque ou un routeur Studio. */
export function routesHorsStudioTouchantStudio(): string[] {
  const dossier = fileURLToPath(new URL("../routes/", import.meta.url));
  return readdirSync(dossier).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && !/^studio/.test(f))
    .filter((f) => /\bstudio[A-Z]\w*|lib\/studio-|from "\.\/studio/.test(readFileSync(`${dossier}${f}`, "utf8"))).map((f) => `routes/${f}`).sort();
}

const SYMBOLE: Record<Attendu, string> = { admis: "admis", "404": "404", "403": "403", "403-reference": "403 réf.", "423": "423" };
const symbole = (r: Route, a: Acteur) => `${SYMBOLE[attendu(r, a)]}${r.arbitrer?.includes(a) ? " (à arbitrer)" : ""}`;
export function matriceMarkdown(): string {
  const lignes = [
    "# Matrice rôle × route Studio × attendu (X.2-02)",
    "",
    "Fichier **généré et vérifié** par `apps/api/src/routes/studio-permissions.test.ts` (ne pas éditer à la main : le test",
    "échoue si ce fichier diffère de la matrice qu'il exécute ; `STUDIO_TRACABILITE_ECRIRE=1` le régénère). Chaque cellule",
    "est exécutée sur le routeur Express réel, base simulée en mémoire (garde DB fermée, aucune base ni serveur).",
    "",
    "Attendus : `404` non-membre, aucune fuite (même réponse qu'une ressource absente) ; `403` rôle insuffisant ;",
    "`403 réf.` projet de référence protégé (`motif: reference-protegee`) ; `423` édition réservée par un autre compte ;",
    "`admis` aucun refus de droit (le traitement suit : 2xx ou refus métier 400 / 404 / 409). Chaque refus est vérifié sans",
    "aucune écriture. Sans session : 401 sur toute route, avant tout accès.",
    "",
    "Besoins : `lecture` (tout membre), `commentaire` (tout membre, verrou sans effet), `ecriture` (propriétaire, éditeur ;",
    "verrou → 423 ; la référence protégée ne s'applique qu'à `modification`), `modification` (propriétaire, éditeur ;",
    "verrou → 423 ; référence → 403), `proprietaire` (propriétaire seul), `acteur` (règle d'acteur : auteur, responsable,",
    "chargé de tâche — rôle vérifié ensuite par `lib/studio-observations.ts`, testé par `studio-observations.test.ts`).",
    "",
    `| Route | Besoin | ${ACTEURS.map((a) => LIBELLE_ACTEUR[a]).join(" | ")} | Réponse du propriétaire | Note |`,
    `|---|---|${ACTEURS.map(() => "---").join("|")}|---|---|`,
  ];
  for (const r of ROUTES) lignes.push(`| \`${r.route}\` | ${r.besoin} | ${ACTEURS.map((a) => symbole(r, a)).join(" | ")} | ${reponseProprietaire(r)} | ${r.note ?? ""} |`);
  lignes.push(
    "",
    "« (à arbitrer) » : cellule exécutée et épinglée telle que le serveur répond aujourd'hui, sans changement de",
    "comportement ; la règle attend une décision du maître d'ouvrage.",
    "",
    "## Routes hors Studio touchant des données Studio — non couvertes par la matrice (suites DB-3)",
    "",
    "Leurs droits sont ceux de leur routeur (propriétaire ou membre du projet), contrôlés par leurs propres suites sur base",
    "réelle ; la liste des fichiers est vérifiée par ce test (tout nouveau fichier de `routes/` citant Studio la fait échouer).",
    "",
    "| Fichier | Routes | Données Studio |",
    "|---|---|---|",
    ...HORS_MATRICE.map((h) => `| \`${h.fichier}\` | ${h.routes} | ${h.donnees} |`),
    "",
  );
  return lignes.join("\n");
}
