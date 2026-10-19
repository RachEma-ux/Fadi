import { beforeEach, describe, expect, it, vi } from "vitest";
/**
 * X.2-02 — matrice rôle × route Studio × attendu, exécutée de bout en bout sur le routeur Express réel
 * (`routes/studio.ts` et ses sous-routeurs), sans base ni serveur (garde DB fermée) : la base est simulée en mémoire
 * (lignes par table ; conditions drizzle rendues par le dialecte réel `PgDialect.sqlToQuery`, une ligne répond si
 * chacun des paramètres est l'une de ses valeurs ; jointures par produit des fixtures d'une ligne). Le contrôle d'accès
 * (`projectAccessRefusal`) est le vrai, enveloppé d'un espion qui relève chaque verdict.
 *
 * Acteurs : non-membre, lecteur, éditeur, éditeur pendant le verrou d'édition d'un autre compte, propriétaire,
 * propriétaire d'un projet de référence protégé. Attendus (`attendu`) : `404` (non-membre : aucune fuite), `403`
 * (rôle insuffisant), `403-reference` (projet de référence protégé), `423` (édition réservée par un autre compte),
 * `admis` (aucun refus de droit : le traitement suit — 2xx, ou refus métier 400 / 404 / 409 d'une ressource).
 * Chaque refus est vérifié sans écriture. La liste des routes est comparée aux déclarations des routeurs (aucune route
 * Studio hors matrice) et la matrice publiée (`docs/ai-team/reports/claude-v9-x2/PERMISSIONS.md`) est régénérée et
 * comparée à l'octet près (`STUDIO_TRACABILITE_ECRIRE=1` la réécrit). Rangée sous `routes/` et non sous `testing/` : supertest
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
  proprietaire: "propriétaire", "proprietaire-reference": "propriétaire (projet de référence)",
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
const observation = async () => ({ obs: await creer(`${V}/observations`, { body: "Observation d'essai", responsableId: "editeur" }) });
const feuille = async () => ({ f: await creer(`${V}/sheets`, { number: "A-01", title: "Plan", format: "A3", orientation: "paysage", scale: "ajuster" }) });
const dossier = async () => { const { f } = await feuille(); return { f, d: await creer(`${S}/studies/s/dossiers`, { title: "Dossier", sheetIds: [f] }) }; };

/**
 * Règles d'acteur des observations (`lib/studio-observations.ts`), l'observation étant ouverte par le propriétaire
 * avec l'éditeur pour responsable : elles se jugent sur l'identité et le rôle (`roleAllows`), pas sur le verrou
 * d'édition ; « éditeur (verrou d'un autre) » est un autre compte éditeur, ni auteur ni responsable.
 */
const RESPONSABLE: Partial<Record<Acteur, Attendu>> = { etranger: "404", lecteur: "403", editeur: "admis", "editeur-verrou": "403", proprietaire: "403", "proprietaire-reference": "403" };
const AUTEUR_RESPONSABLE_PROPRIETAIRE: Partial<Record<Acteur, Attendu>> = { etranger: "404", lecteur: "403", editeur: "admis", "editeur-verrou": "403", proprietaire: "admis", "proprietaire-reference": "admis" };
const PUB = "/studies/:studyId/publications/:publicationId";
const OBS = "/studies/:studyId/variants/:variantId/observations";
const COM = "/studies/:studyId/variants/:variantId/comments";
export const ROUTES: Route[] = [
  { route: "GET /studies", besoin: "lecture", url: () => `${S}/studies` },
  { route: "POST /studies", besoin: "modification", url: () => `${S}/studies`, body: { name: "Nouvelle" } },
  { route: "GET /studies/:studyId", besoin: "lecture", url: () => `${S}/studies/s` },
  { route: "PATCH /studies/:studyId", besoin: "modification", url: () => `${S}/studies/s`, body: { name: "Renommée" } },
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
    acteurs: { etranger: "404", lecteur: "403", editeur: "admis", "editeur-verrou": "403", proprietaire: "403", "proprietaire-reference": "403" },
  },
  {
    route: `POST ${COM}/:commentId/observation`, besoin: "acteur", url: () => `${V}/comments/c1/observation`, body: { responsableId: "editeur" },
    note: "auteur du commentaire (c1 : éditeur) ou propriétaire",
    acteurs: { etranger: "404", lecteur: "403", editeur: "admis", "editeur-verrou": "403", proprietaire: "admis", "proprietaire-reference": "admis" },
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
  { route: "GET /studies/:studyId/publications", besoin: "lecture", url: () => `${S}/studies/s/publications` },
  { route: "POST /studies/:studyId/variants/:variantId/publications", besoin: "ecriture", url: () => `${V}/publications`, body: { title: "Dossier", contenu: "dessin-2d" } },
  { route: `GET ${PUB}`, besoin: "lecture", preparer: publication, url: (c) => `${S}/studies/s/publications/${c["pub"]}` },
  { route: `GET ${PUB}/verification`, besoin: "lecture", preparer: publication, url: (c) => `${S}/studies/s/publications/${c["pub"]}/verification` },
  { route: `GET ${PUB}/files/:format`, besoin: "lecture", preparer: publication, url: (c) => `${S}/studies/s/publications/${c["pub"]}/files/svg` },
  ...([["soumettre", "ecriture"], ["actualiser", "ecriture"], ["approuver", "proprietaire"], ["refuser", "proprietaire"], ["diffuser", "proprietaire"], ["retirer", "proprietaire"]] as const).map(([action, besoin]): Route => ({
    route: `POST ${PUB}/:action`, besoin, preparer: publication, url: (c) => `${S}/studies/s/publications/${c["pub"]}/${action}`, body: { comment: "Motif" }, note: `action ${action}`,
  })),
  { route: "GET /studies/:studyId/exigences", besoin: "lecture", url: () => `${S}/studies/s/exigences` },
  {
    route: "GET /studies/:studyId/exigences/versions/:version", besoin: "lecture", url: () => `${S}/studies/s/exigences/versions/1`,
    preparer: async () => { await creer(`${S}/studies/s/exigences`, { baseVersion: 0, exigences: [exigence] }).catch(() => ""); return {}; },
  },
  { route: "POST /studies/:studyId/exigences", besoin: "modification", url: () => `${S}/studies/s/exigences`, body: { baseVersion: 0, exigences: [exigence] } },
  { route: "POST /studies/:studyId/exigences/acceptations", besoin: "proprietaire", url: () => `${S}/studies/s/exigences/acceptations`, body: { baseVersion: 1, exigenceId: "e1" } },
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
  "POST /studies/:studyId/variants/:variantId/archive": "400 initial_variant",
  "POST /studies/:studyId/variants/:variantId/comments": "201", "POST /studies/:studyId/variants/:variantId/comments/:commentId/observation": "201",
  "POST /studies/:studyId/variants/:variantId/comments/:commentId/observation/transitions": "403 forbidden",
  "DELETE /studies/:studyId/variants/:variantId/comments/:commentId": "403 forbidden",
  "GET /steps/:stepNumber/studies": "400 invalid_input",
  "POST /studies/:studyId/variants/:variantId/publications": "201",
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
  switch (r.besoin) {
    case "lecture": case "commentaire": case "acteur": return "admis";
    case "ecriture": return a === "lecteur" ? "403" : a === "editeur-verrou" ? "423" : "admis";
    case "modification": return a === "lecteur" ? "403" : a === "editeur-verrou" ? "423" : a === "proprietaire-reference" ? "403-reference" : "admis";
    case "proprietaire": return a === "proprietaire" || a === "proprietaire-reference" ? "admis" : "403";
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
const corpsDe = (r: Route, c: Contexte): unknown => (r.route === "POST /studies/:studyId/dossiers" ? { title: "Dossier", sheetIds: [c["f"]] } : r.body);

describe("X.2-02 — matrice rôle × route Studio × attendu (routeur réel, base simulée)", () => {
  it("chaque route déclarée par les routeurs Studio figure dans la matrice, et réciproquement", () => {
    expect(new Set(ROUTES.map((r) => r.route))).toEqual(new Set(routesDeclarees()));
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
  const dossier = fileURLToPath(new URL("../routes/", import.meta.url));
  const out: string[] = [];
  for (const nom of readdirSync(dossier).filter((f) => /^studio.*\.ts$/.test(f) && !f.endsWith(".test.ts"))) {
    const source = readFileSync(`${dossier}${nom}`, "utf8");
    const constantes = new Map([...source.matchAll(/^const (\w+) = ["`]([^"`$]*)["`];/gm)].map((m) => [m[1]!, m[2]!]));
    const prefixe = nom === "studio-preferences.ts" ? "/preferences" : "";
    for (const m of source.matchAll(/^\s*studio\w*Router\.(get|post|put|patch|delete)\((?:(["`])(.*?)\2|(\w+))\s*,/gm)) {
      let chemin = m[4] ? constantes.get(m[4]) ?? `?${m[4]}` : m[3]!;
      chemin = chemin.replace(/\$\{(\w+)\}/g, (_x, k: string) => constantes.get(k) ?? `\${${k}}`);
      const chemins = chemin.includes("${action}") ? ["archive", "unarchive"].map((a) => chemin.replace("${action}", a)) : [chemin];
      for (const c of chemins) out.push(`${m[1]!.toUpperCase()} ${prefixe}${c}`);
    }
  }
  return out;
}

const SYMBOLE: Record<Attendu, string> = { admis: "admis", "404": "404", "403": "403", "403-reference": "403 réf.", "423": "423" };
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
  for (const r of ROUTES) lignes.push(`| \`${r.route}\` | ${r.besoin} | ${ACTEURS.map((a) => SYMBOLE[attendu(r, a)]).join(" | ")} | ${reponseProprietaire(r)} | ${r.note ?? ""} |`);
  lignes.push("");
  return lignes.join("\n");
}
