/**
 * Passage `EtatModele` (@parcours/atelier-model) ⇄ lignes des tables `atelier_*` (cahier des charges §5.5, L2.1).
 *
 * Deux couches :
 * - fonctions pures (`objetVersLignes`, `etatVersLignes`, `lignesVersEtat`, `diffEtats`) : aucune E/S, testées
 *   sans base ; l'aller-retour état → lignes → état est sans perte (même empreinte `atelier-empreinte/1`) ;
 * - accès à la base (`chargerEtat`, `chargerNiveau`, `ecrireEtat`, `ecrireDiff`) : à appeler dans la transaction du
 *   service de commandes, **après** `SELECT … FOR UPDATE` sur la ligne du projet (règle existante, §5.4). Ces
 *   fonctions ne touchent ni `projects.model_revision` (le service l'avance), ni le journal, ni la boîte de sortie.
 *
 * Règles de stockage (voir la section `atelier` de init.sql) :
 * - la révision de l'état chargé est `projects.model_revision` (elle fait autorité) ; l'empreinte est celle de la
 *   tête `atelier_models`, écrite avec le dernier état (option `verifierEmpreinte` pour la recalculer) ;
 * - répartition des objets par classe : `atelier_layers` (calque), `atelier_site` (parcelle, emprise, hypothèse,
 *   source, structure déclarée), `atelier_objects` (le reste) ; propriétés et représentations dans leurs tables,
 *   dans leur ordre ; tout champ d'objet sans colonne va dans `extra` (rien n'est perdu) ;
 * - `supprimes` : l'objet supprimé garde sa ligne (`deleted_at`, `deleted_rank` croissant = ordre de la liste) ; un
 *   identifiant supprimé sans contenu connu (créé puis supprimé dans le même lot) est une trace sans contenu ;
 * - relations : ensemble (l'ordre n'est pas une donnée, l'empreinte les trie) ; relues dans l'ordre canonique.
 */
import { sql, type SQL } from "drizzle-orm";
import {
  jsonCanonique,
  calculerEmpreinte,
  type Classification,
  type ClasseObjet,
  type DefinitionType,
  type EtatModele,
  type IdObjet,
  type ObjetModele,
  type Ontologie,
  type Propriete,
  type Provenance,
  type Relation,
  type Representation,
  type Statut,
  type Tracabilite,
  type TypeRelation,
  type ValeurPropriete,
} from "@parcours/atelier-model";
import type { db } from "../db/client.js";

// ---------------------------------------------------------------------------
// Répartition des classes
// ---------------------------------------------------------------------------

export const TABLES_OBJETS = ["atelier_objects", "atelier_layers", "atelier_site"] as const;
export type TableObjets = (typeof TABLES_OBJETS)[number];

/** Classes rangées dans `atelier_layers` (contrainte SQL identique, vérifiée par test). */
export const CLASSES_CALQUES = ["calque"] as const satisfies readonly ClasseObjet[];
/** Classes rangées dans `atelier_site` (contrainte SQL identique, vérifiée par test). */
export const CLASSES_SITE = ["parcelle", "emprise", "hypothese", "source", "structureDeclaree"] as const satisfies readonly ClasseObjet[];

export function tableDeClasse(classe: ClasseObjet): TableObjets {
  if ((CLASSES_CALQUES as readonly string[]).includes(classe)) return "atelier_layers";
  if ((CLASSES_SITE as readonly string[]).includes(classe)) return "atelier_site";
  return "atelier_objects";
}

// ---------------------------------------------------------------------------
// Lignes (noms de colonnes SQL)
// ---------------------------------------------------------------------------

type Json = Record<string, unknown>;

/** Ligne d'objet vivant (commune aux trois tables ; `phase` reste nulle au lot 2). */
export interface LigneObjet {
  readonly table: TableObjets;
  readonly id: IdObjet;
  readonly ontology: Ontologie;
  readonly class: ClasseObjet;
  readonly level_id: string | null;
  readonly definition_id: string | null;
  readonly params: ObjetModele["params"];
  readonly layer_id: string | null;
  readonly group_id: string | null;
  readonly provenance: Provenance;
  readonly status: Statut;
  readonly source_id: string | null;
  readonly note: string | null;
  readonly classifications: readonly Classification[] | null;
  readonly annotations: Readonly<Partial<Record<string, Tracabilite>>> | null;
  /** Champs de l'objet sans colonne ; nul si aucun. */
  readonly extra: Json | null;
}

/** Propriété d'un objet (`object_id`) ou du projet (`object_id` nul). */
export interface LignePropriete {
  readonly object_id: IdObjet | null;
  readonly position: number;
  readonly name: string;
  readonly value: ValeurPropriete;
  readonly unit: string | null;
  readonly provenance: Provenance;
  readonly status: Statut;
  readonly source_id: string | null;
  readonly note: string | null;
  readonly extra: Json | null;
}

export interface LigneRelation {
  readonly type: TypeRelation;
  readonly source_id: IdObjet;
  readonly target_id: IdObjet;
  readonly role: string | null;
  readonly derived: boolean;
  readonly extra: Json | null;
}

export interface LigneRepresentation {
  readonly object_id: IdObjet;
  readonly position: number;
  readonly usage: Representation["usage"];
  readonly authority: Representation["autorite"];
  readonly engine: string;
  readonly engine_version: string;
  readonly inputs_hash: string;
  readonly extra: Json | null;
}

export interface LigneDefinition {
  readonly key: string;
  readonly definition_id: string;
  readonly class: string;
  readonly catalogue_version: number;
  readonly content: DefinitionType;
}

/** Tête du modèle (`atelier_models`). */
export interface LigneTete {
  readonly model_revision: number;
  readonly fingerprint: string;
  readonly ontology_version: number;
  readonly catalogue_version: number;
}

/** Trace de suppression : identifiant réservé et rang dans `supprimes`. */
export interface LigneSupprime {
  readonly id: IdObjet;
  readonly deleted_rank: number;
}

/** Lignes complètes d'un modèle (contenu vivant + traces de suppression). */
export interface LignesModele {
  readonly projetId: string;
  readonly tete: LigneTete;
  readonly objets: readonly LigneObjet[];
  readonly supprimes: readonly LigneSupprime[];
  readonly proprietes: readonly LignePropriete[];
  readonly relations: readonly LigneRelation[];
  readonly representations: readonly LigneRepresentation[];
  readonly definitions: readonly LigneDefinition[];
}

export class ErreurLignesAtelier extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErreurLignesAtelier";
  }
}

// ---------------------------------------------------------------------------
// Fonctions pures : objet ⇄ lignes
// ---------------------------------------------------------------------------

const CHAMPS_OBJET = new Set([
  "id",
  "classe",
  "ontologie",
  "params",
  "niveauId",
  "calqueId",
  "groupeId",
  "definitionId",
  "proprietes",
  "classifications",
  "annotations",
  "representations",
  "provenance",
  "statut",
  "sourceId",
  "note",
]);
const CHAMPS_PROPRIETE = new Set(["nom", "valeur", "unite", "provenance", "statut", "sourceId", "note"]);
const CHAMPS_RELATION = new Set(["type", "sourceId", "cibleId", "role", "derivee"]);
const CHAMPS_REPRESENTATION = new Set(["usage", "autorite", "moteur", "versionMoteur", "empreinteEntrees"]);

/** Champs non retenus par `connus` ; `null` s'il n'y en a pas (champs `undefined` ignorés, comme dans l'empreinte). */
function reste(o: object, connus: ReadonlySet<string>): Json | null {
  let r: Json | null = null;
  for (const [k, v] of Object.entries(o)) {
    if (connus.has(k) || v === undefined) continue;
    (r ??= {})[k] = v;
  }
  return r;
}

const ouNul = <T>(v: T | undefined): T | null => (v === undefined ? null : v);

/** Lignes d'une propriété (de l'objet `objetId`, ou du projet si `null`). */
export function proprieteVersLigne(objetId: IdObjet | null, p: Propriete, position: number): LignePropriete {
  return {
    object_id: objetId,
    position,
    name: p.nom,
    value: p.valeur,
    unit: ouNul(p.unite),
    provenance: p.provenance,
    status: p.statut,
    source_id: ouNul(p.sourceId),
    note: ouNul(p.note),
    extra: reste(p, CHAMPS_PROPRIETE),
  };
}

export function ligneVersPropriete(l: LignePropriete): Propriete {
  const p: Json = { ...(l.extra ?? {}), nom: l.name, valeur: l.value, provenance: l.provenance, statut: l.status };
  if (l.unit !== null) p["unite"] = l.unit;
  if (l.source_id !== null) p["sourceId"] = l.source_id;
  if (l.note !== null) p["note"] = l.note;
  return p as unknown as Propriete;
}

export function relationVersLigne(r: Relation): LigneRelation {
  return { type: r.type, source_id: r.sourceId, target_id: r.cibleId, role: ouNul(r.role), derived: r.derivee, extra: reste(r, CHAMPS_RELATION) };
}

export function ligneVersRelation(l: LigneRelation): Relation {
  const r: Json = { ...(l.extra ?? {}), type: l.type, sourceId: l.source_id, cibleId: l.target_id, derivee: l.derived };
  if (l.role !== null) r["role"] = l.role;
  return r as unknown as Relation;
}

/** Ligne d'objet, propriétés et représentations d'un objet vivant. */
export function objetVersLignes(o: ObjetModele): { objet: LigneObjet; proprietes: LignePropriete[]; representations: LigneRepresentation[] } {
  const extra = reste(o, CHAMPS_OBJET) ?? {};
  // Représentations : table dédiée quand il y en a ; un tableau vide (ou une valeur inattendue) reste tel quel dans `extra`.
  const reps = Array.isArray(o.representations) && o.representations.length > 0 ? o.representations : null;
  if (o.representations !== undefined && reps === null) extra["representations"] = o.representations;
  if (!Array.isArray(o.proprietes)) throw new ErreurLignesAtelier(`Objet ${o.id} : liste de propriétés absente.`);
  const objet: LigneObjet = {
    table: tableDeClasse(o.classe),
    id: o.id,
    ontology: o.ontologie,
    class: o.classe,
    level_id: ouNul(o.niveauId),
    definition_id: ouNul(o.definitionId),
    params: o.params,
    layer_id: ouNul(o.calqueId),
    group_id: ouNul(o.groupeId),
    provenance: o.provenance,
    status: o.statut,
    source_id: ouNul(o.sourceId),
    note: ouNul(o.note),
    classifications: ouNul(o.classifications),
    annotations: ouNul(o.annotations),
    extra: Object.keys(extra).length > 0 ? extra : null,
  };
  return {
    objet,
    proprietes: o.proprietes.map((p, i) => proprieteVersLigne(o.id, p, i)),
    representations: (reps ?? []).map((r, i) => ({
      object_id: o.id,
      position: i,
      usage: r.usage,
      authority: r.autorite,
      engine: r.moteur,
      engine_version: r.versionMoteur,
      inputs_hash: r.empreinteEntrees,
      extra: reste(r, CHAMPS_REPRESENTATION),
    })),
  };
}

/** Objet du modèle depuis sa ligne, ses propriétés et ses représentations (déjà triées par `position`). */
export function lignesVersObjet(l: LigneObjet, proprietes: readonly LignePropriete[], representations: readonly LigneRepresentation[]): ObjetModele {
  const o: Json = { ...(l.extra ?? {}), id: l.id, classe: l.class, ontologie: l.ontology, params: l.params, provenance: l.provenance, statut: l.status };
  if (l.level_id !== null) o["niveauId"] = l.level_id;
  if (l.layer_id !== null) o["calqueId"] = l.layer_id;
  if (l.group_id !== null) o["groupeId"] = l.group_id;
  if (l.definition_id !== null) o["definitionId"] = l.definition_id;
  if (l.source_id !== null) o["sourceId"] = l.source_id;
  if (l.note !== null) o["note"] = l.note;
  if (l.classifications !== null) o["classifications"] = l.classifications;
  if (l.annotations !== null) o["annotations"] = l.annotations;
  o["proprietes"] = proprietes.map(ligneVersPropriete);
  if (representations.length > 0) {
    o["representations"] = representations.map((r) => ({
      ...(r.extra ?? {}),
      usage: r.usage,
      autorite: r.authority,
      moteur: r.engine,
      versionMoteur: r.engine_version,
      empreinteEntrees: r.inputs_hash,
    }));
  }
  return o as unknown as ObjetModele;
}

export function teteDeEtat(etat: EtatModele): LigneTete {
  return { model_revision: etat.revision, fingerprint: etat.empreinte, ontology_version: etat.versionOntologie, catalogue_version: etat.catalogue.version };
}

function definitionVersLigne(cle: string, d: DefinitionType): LigneDefinition {
  return { key: cle, definition_id: d.id, class: d.classe, catalogue_version: d.versionCatalogue, content: d };
}

// ---------------------------------------------------------------------------
// Fonctions pures : état ⇄ lignes
// ---------------------------------------------------------------------------

/** Contrôle de cohérence d'un état avant écriture : un identifiant est vivant ou supprimé, jamais les deux. */
function controlerEtat(etat: EtatModele): void {
  const vus = new Set<string>();
  for (const id of etat.supprimes) {
    if (Object.prototype.hasOwnProperty.call(etat.objets, id)) throw new ErreurLignesAtelier(`Objet ${id} : présent à la fois parmi les objets et parmi les supprimés.`);
    if (vus.has(id)) throw new ErreurLignesAtelier(`Objet ${id} : répété dans la liste des supprimés.`);
    vus.add(id);
  }
  for (const [id, o] of Object.entries(etat.objets)) if (o.id !== id) throw new ErreurLignesAtelier(`Objet rangé sous ${id} : identifiant ${o.id} différent.`);
}

/** Toutes les lignes d'un état (écriture complète). */
export function etatVersLignes(etat: EtatModele): LignesModele {
  controlerEtat(etat);
  const objets: LigneObjet[] = [];
  const proprietes: LignePropriete[] = [];
  const representations: LigneRepresentation[] = [];
  for (const o of Object.values(etat.objets)) {
    const l = objetVersLignes(o);
    objets.push(l.objet);
    proprietes.push(...l.proprietes);
    representations.push(...l.representations);
  }
  proprietes.push(...etat.proprietesProjet.map((p, i) => proprieteVersLigne(null, p, i)));
  return {
    projetId: etat.projetId,
    tete: teteDeEtat(etat),
    objets,
    supprimes: etat.supprimes.map((id, i) => ({ id, deleted_rank: i })),
    proprietes,
    relations: etat.relations.map(relationVersLigne),
    representations,
    definitions: Object.entries(etat.catalogue.definitions).map(([cle, d]) => definitionVersLigne(cle, d)),
  };
}

const parPosition = (a: { position: number }, b: { position: number }) => a.position - b.position;

/**
 * État depuis ses lignes. `revision` : `projects.model_revision` (fait autorité). Relations dans l'ordre canonique,
 * supprimés par rang croissant, propriétés et représentations par position.
 */
export function lignesVersEtat(l: LignesModele, revision: number = l.tete.model_revision): EtatModele {
  const propsParObjet = new Map<string, LignePropriete[]>();
  const proprietesProjet: LignePropriete[] = [];
  for (const p of l.proprietes) {
    if (p.object_id === null) proprietesProjet.push(p);
    else {
      const liste = propsParObjet.get(p.object_id);
      if (liste) liste.push(p);
      else propsParObjet.set(p.object_id, [p]);
    }
  }
  const repsParObjet = new Map<string, LigneRepresentation[]>();
  for (const r of l.representations) {
    const liste = repsParObjet.get(r.object_id);
    if (liste) liste.push(r);
    else repsParObjet.set(r.object_id, [r]);
  }
  const objets: Record<IdObjet, ObjetModele> = {};
  for (const o of l.objets) {
    objets[o.id] = lignesVersObjet(o, (propsParObjet.get(o.id) ?? []).sort(parPosition), (repsParObjet.get(o.id) ?? []).sort(parPosition));
  }
  const relations = l.relations
    .map(ligneVersRelation)
    .map((r) => [jsonCanonique(r), r] as const)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([, r]) => r);
  const definitions: Record<string, DefinitionType> = {};
  for (const d of l.definitions) definitions[d.key] = d.content;
  return {
    projetId: l.projetId,
    revision,
    empreinte: l.tete.fingerprint,
    versionOntologie: l.tete.ontology_version,
    objets,
    relations,
    catalogue: { version: l.tete.catalogue_version, definitions },
    proprietesProjet: proprietesProjet.sort(parPosition).map(ligneVersPropriete),
    supprimes: [...l.supprimes].sort((a, b) => a.deleted_rank - b.deleted_rank || (a.id < b.id ? -1 : 1)).map((s) => s.id),
  };
}

// ---------------------------------------------------------------------------
// Fonction pure : différence entre deux états
// ---------------------------------------------------------------------------

/** Changements de lignes entre deux états d'un même projet (écriture incrémentale). */
export interface DiffEtat {
  readonly projetId: string;
  /** Objets créés, modifiés ou restaurés : ligne réécrite (et retirée des autres tables), propriétés et représentations remplacées. */
  readonly objetsEcrits: readonly ObjetModele[];
  /** Objets disparus sans trace de suppression (annulation d'une création) : lignes effacées. */
  readonly objetsEffaces: readonly IdObjet[];
  /** Identifiants ajoutés à `supprimes`, dans l'ordre de la liste. */
  readonly supprimesAjoutes: readonly IdObjet[];
  /** Identifiants retirés de `supprimes` (restauration). */
  readonly supprimesRetires: readonly IdObjet[];
  readonly relationsAjoutees: readonly Relation[];
  readonly relationsRetirees: readonly Relation[];
  readonly definitionsEcrites: readonly LigneDefinition[];
  readonly definitionsEffacees: readonly string[];
  /** Propriétés de projet à réécrire entièrement ; `null` = inchangées. */
  readonly proprietesProjet: readonly Propriete[] | null;
  readonly tete: LigneTete;
  /** Aucun changement de contenu (la tête peut tout de même changer : révision, empreinte). */
  readonly vide: boolean;
}

export function diffEtats(avant: EtatModele, apres: EtatModele): DiffEtat {
  if (avant.projetId !== apres.projetId) throw new ErreurLignesAtelier(`Projets différents : ${avant.projetId} et ${apres.projetId}.`);
  controlerEtat(apres);
  const objetsEcrits: ObjetModele[] = [];
  for (const [id, o] of Object.entries(apres.objets)) {
    const a = Object.prototype.hasOwnProperty.call(avant.objets, id) ? avant.objets[id] : undefined;
    if (a === o) continue;
    if (a === undefined || jsonCanonique(a) !== jsonCanonique(o)) objetsEcrits.push(o);
  }
  const supAvant = new Set(avant.supprimes);
  const supApres = new Set(apres.supprimes);
  const objetsEffaces = Object.keys(avant.objets).filter((id) => !Object.prototype.hasOwnProperty.call(apres.objets, id) && !supApres.has(id));
  const supprimesAjoutes = apres.supprimes.filter((id) => !supAvant.has(id));
  const supprimesRetires = avant.supprimes.filter((id) => !supApres.has(id));

  const cles = (rs: readonly Relation[]) => new Map(rs.map((r) => [jsonCanonique(r), r] as const));
  const relAvant = cles(avant.relations);
  const relApres = cles(apres.relations);
  const relationsAjoutees = [...relApres].filter(([k]) => !relAvant.has(k)).map(([, r]) => r);
  const relationsRetirees = [...relAvant].filter(([k]) => !relApres.has(k)).map(([, r]) => r);

  const defAvant = avant.catalogue.definitions;
  const defApres = apres.catalogue.definitions;
  const definitionsEcrites: LigneDefinition[] = [];
  for (const [cle, d] of Object.entries(defApres)) {
    const a = defAvant[cle];
    if (a !== d && (a === undefined || jsonCanonique(a) !== jsonCanonique(d))) definitionsEcrites.push(definitionVersLigne(cle, d));
  }
  const definitionsEffacees = Object.keys(defAvant).filter((cle) => !Object.prototype.hasOwnProperty.call(defApres, cle));

  const proprietesProjet = avant.proprietesProjet === apres.proprietesProjet || jsonCanonique(avant.proprietesProjet) === jsonCanonique(apres.proprietesProjet) ? null : apres.proprietesProjet;

  const vide =
    objetsEcrits.length === 0 &&
    objetsEffaces.length === 0 &&
    supprimesAjoutes.length === 0 &&
    supprimesRetires.length === 0 &&
    relationsAjoutees.length === 0 &&
    relationsRetirees.length === 0 &&
    definitionsEcrites.length === 0 &&
    definitionsEffacees.length === 0 &&
    proprietesProjet === null;
  return {
    projetId: apres.projetId,
    objetsEcrits,
    objetsEffaces,
    supprimesAjoutes,
    supprimesRetires,
    relationsAjoutees,
    relationsRetirees,
    definitionsEcrites,
    definitionsEffacees,
    proprietesProjet,
    tete: teteDeEtat(apres),
    vide,
  };
}

// ---------------------------------------------------------------------------
// Accès à la base
// ---------------------------------------------------------------------------

/** Base ou transaction Drizzle (node-postgres). */
export type Executeur = Pick<typeof db, "execute">;

const TAILLE_PAQUET = 1000;

async function lignes<T>(ex: Executeur, requete: SQL): Promise<T[]> {
  const r = await ex.execute(requete);
  return r.rows as unknown as T[];
}

/** Paquets de taille bornée (une requête par paquet, un seul paramètre JSON). */
function paquets<T>(liste: readonly T[]): T[][] {
  const r: T[][] = [];
  for (let i = 0; i < liste.length; i += TAILLE_PAQUET) r.push(liste.slice(i, i + TAILLE_PAQUET));
  return r;
}

const json = (v: unknown) => sql`${JSON.stringify(v)}::jsonb`;
const idsDe = (ids: readonly string[]) => sql`(SELECT jsonb_array_elements_text(${JSON.stringify(ids)}::jsonb))`;
const table = (t: TableObjets) => sql.raw(t);

const COLONNES_OBJET_SQL = sql.raw(
  `id, ontology, "class", level_id, definition_id, params, layer_id, group_id, provenance, status, source_id, note, classifications, annotations, extra, model_revision`,
);
const RECORDSET_OBJET = sql.raw(
  `x(id text, ontology text, "class" text, level_id text, definition_id text, params jsonb, layer_id text, group_id text, provenance text, status text, source_id text, note text, classifications jsonb, annotations jsonb, extra jsonb)`,
);

async function insererObjets(ex: Executeur, projetId: string, revision: number, t: TableObjets, objets: readonly LigneObjet[]): Promise<void> {
  for (const p of paquets(objets)) {
    await ex.execute(sql`
      INSERT INTO ${table(t)} (project_id, ${COLONNES_OBJET_SQL})
      SELECT ${projetId}::text, x.id, x.ontology, x."class", x.level_id, x.definition_id, x.params, x.layer_id, x.group_id, x.provenance, x.status, x.source_id, x.note, x.classifications, x.annotations, x.extra, ${revision}::integer
      FROM jsonb_to_recordset(${json(p)}) AS ${RECORDSET_OBJET}
      ON CONFLICT (project_id, id) DO UPDATE SET
        ontology = EXCLUDED.ontology, "class" = EXCLUDED."class", level_id = EXCLUDED.level_id, definition_id = EXCLUDED.definition_id,
        params = EXCLUDED.params, layer_id = EXCLUDED.layer_id, group_id = EXCLUDED.group_id, provenance = EXCLUDED.provenance,
        status = EXCLUDED.status, source_id = EXCLUDED.source_id, note = EXCLUDED.note, classifications = EXCLUDED.classifications,
        annotations = EXCLUDED.annotations, extra = EXCLUDED.extra, model_revision = EXCLUDED.model_revision,
        updated_at = now(), deleted_at = NULL, deleted_rank = NULL`);
  }
}

async function insererProprietes(ex: Executeur, projetId: string, revision: number, proprietes: readonly LignePropriete[]): Promise<void> {
  // `value` passe enveloppée (`{"v": …}`) : un JSON `null` reste un JSON `null`, jamais une absence SQL.
  for (const p of paquets(proprietes.map((x) => ({ ...x, value: { v: x.value } })))) {
    await ex.execute(sql`
      INSERT INTO atelier_properties (project_id, object_id, "position", name, value, unit, provenance, status, source_id, note, extra, model_revision)
      SELECT ${projetId}::text, x.object_id, x."position", x.name, x.value -> 'v', x.unit, x.provenance, x.status, x.source_id, x.note, x.extra, ${revision}::integer
      FROM jsonb_to_recordset(${json(p)}) AS x(object_id text, "position" integer, name text, value jsonb, unit text, provenance text, status text, source_id text, note text, extra jsonb)`);
  }
}

async function insererRepresentations(ex: Executeur, projetId: string, revision: number, reps: readonly LigneRepresentation[]): Promise<void> {
  for (const p of paquets(reps)) {
    await ex.execute(sql`
      INSERT INTO atelier_representations (project_id, object_id, "position", usage, authority, engine, engine_version, inputs_hash, extra, model_revision)
      SELECT ${projetId}::text, x.object_id, x."position", x.usage, x.authority, x.engine, x.engine_version, x.inputs_hash, x.extra, ${revision}::integer
      FROM jsonb_to_recordset(${json(p)}) AS x(object_id text, "position" integer, usage text, authority text, engine text, engine_version text, inputs_hash text, extra jsonb)`);
  }
}

async function insererRelations(ex: Executeur, projetId: string, revision: number, relations: readonly LigneRelation[]): Promise<void> {
  for (const p of paquets(relations)) {
    await ex.execute(sql`
      INSERT INTO atelier_relations (project_id, type, source_id, target_id, role, derived, extra, model_revision)
      SELECT ${projetId}::text, x.type, x.source_id, x.target_id, x.role, x.derived, x.extra, ${revision}::integer
      FROM jsonb_to_recordset(${json(p)}) AS x(type text, source_id text, target_id text, role text, derived boolean, extra jsonb)`);
  }
}

async function ecrireDefinitions(ex: Executeur, projetId: string, revision: number, defs: readonly LigneDefinition[]): Promise<void> {
  for (const p of paquets(defs)) {
    await ex.execute(sql`
      INSERT INTO atelier_definitions (project_id, key, definition_id, "class", catalogue_version, content, model_revision)
      SELECT ${projetId}::text, x.key, x.definition_id, x."class", x.catalogue_version, x.content, ${revision}::integer
      FROM jsonb_to_recordset(${json(p)}) AS x(key text, definition_id text, "class" text, catalogue_version integer, content jsonb)
      ON CONFLICT (project_id, key) DO UPDATE SET definition_id = EXCLUDED.definition_id, "class" = EXCLUDED."class",
        catalogue_version = EXCLUDED.catalogue_version, content = EXCLUDED.content, model_revision = EXCLUDED.model_revision, updated_at = now()`);
  }
}

async function ecrireTete(ex: Executeur, projetId: string, t: LigneTete): Promise<void> {
  await ex.execute(sql`
    INSERT INTO atelier_models (project_id, model_revision, fingerprint, ontology_version, catalogue_version)
    VALUES (${projetId}, ${t.model_revision}, ${t.fingerprint}, ${t.ontology_version}, ${t.catalogue_version})
    ON CONFLICT (project_id) DO UPDATE SET model_revision = EXCLUDED.model_revision, fingerprint = EXCLUDED.fingerprint,
      ontology_version = EXCLUDED.ontology_version, catalogue_version = EXCLUDED.catalogue_version, updated_at = now()`);
}

/** Pose les traces de suppression (rangs `rangDepart`, `rangDepart + 1`…) ; trace sans contenu si l'objet n'a pas de ligne. */
async function marquerSupprimes(ex: Executeur, projetId: string, revision: number, ids: readonly IdObjet[], rangDepart: number): Promise<void> {
  if (ids.length === 0) return;
  const rangs = json(ids.map((id, i) => ({ id, rang: rangDepart + i })));
  for (const t of TABLES_OBJETS) {
    await ex.execute(sql`
      UPDATE ${table(t)} o SET deleted_at = now(), deleted_rank = x.rang, model_revision = ${revision}, updated_at = now()
      FROM jsonb_to_recordset(${rangs}) AS x(id text, rang integer)
      WHERE o.project_id = ${projetId} AND o.id = x.id`);
  }
  await ex.execute(sql`
    INSERT INTO atelier_objects (project_id, id, model_revision, deleted_at, deleted_rank)
    SELECT ${projetId}::text, x.id, ${revision}::integer, now(), x.rang
    FROM jsonb_to_recordset(${rangs}) AS x(id text, rang integer)
    WHERE NOT EXISTS (SELECT 1 FROM atelier_objects o WHERE o.project_id = ${projetId} AND o.id = x.id)
      AND NOT EXISTS (SELECT 1 FROM atelier_layers o WHERE o.project_id = ${projetId} AND o.id = x.id)
      AND NOT EXISTS (SELECT 1 FROM atelier_site o WHERE o.project_id = ${projetId} AND o.id = x.id)`);
}

/** Efface les lignes (objet, propriétés, représentations) des identifiants donnés, dans les trois tables. */
async function effacerObjets(ex: Executeur, projetId: string, ids: readonly IdObjet[], tables: readonly TableObjets[] = TABLES_OBJETS): Promise<void> {
  if (ids.length === 0) return;
  for (const t of tables) await ex.execute(sql`DELETE FROM ${table(t)} WHERE project_id = ${projetId} AND id IN ${idsDe(ids)}`);
}

async function effacerDependances(ex: Executeur, projetId: string, ids: readonly IdObjet[]): Promise<void> {
  if (ids.length === 0) return;
  await ex.execute(sql`DELETE FROM atelier_properties WHERE project_id = ${projetId} AND object_id IN ${idsDe(ids)}`);
  await ex.execute(sql`DELETE FROM atelier_representations WHERE project_id = ${projetId} AND object_id IN ${idsDe(ids)}`);
}

const TABLES_MODELE = ["atelier_objects", "atelier_layers", "atelier_site", "atelier_properties", "atelier_relations", "atelier_representations", "atelier_definitions"] as const;

/**
 * Écrit l'état complet d'un projet (import, réinitialisation) : remplace toutes les lignes de modèle du projet
 * (le journal et la boîte de sortie ne sont pas touchés) et la tête. Les lignes portent `etat.revision`.
 */
export async function ecrireEtat(ex: Executeur, etat: EtatModele): Promise<void> {
  const l = etatVersLignes(etat);
  const projetId = etat.projetId;
  for (const t of TABLES_MODELE) await ex.execute(sql`DELETE FROM ${sql.raw(t)} WHERE project_id = ${projetId}`);
  for (const t of TABLES_OBJETS) {
    await insererObjets(
      ex,
      projetId,
      etat.revision,
      t,
      l.objets.filter((o) => o.table === t),
    );
  }
  await marquerSupprimes(ex, projetId, etat.revision, etat.supprimes, 0);
  await insererProprietes(ex, projetId, etat.revision, l.proprietes);
  await insererRepresentations(ex, projetId, etat.revision, l.representations);
  await insererRelations(ex, projetId, etat.revision, l.relations);
  await ecrireDefinitions(ex, projetId, etat.revision, l.definitions);
  await ecrireTete(ex, projetId, l.tete);
}

/**
 * Écrit la différence `avant` → `apres` (état chargé puis état rendu par `appliquerLot`). `avant` doit être
 * l'état actuellement en base. Les lignes écrites portent `apres.revision` ; la tête prend l'empreinte, la
 * révision et les versions de `apres`. Rend la différence appliquée.
 */
export async function ecrireDiff(ex: Executeur, avant: EtatModele, apres: EtatModele): Promise<DiffEtat> {
  const d = diffEtats(avant, apres);
  const projetId = d.projetId;
  const rev = apres.revision;

  // 1. Disparitions sans trace (annulation d'une création) et identifiants rendus sans objet : effacés.
  const vivants = new Set(Object.keys(apres.objets));
  const aEffacer = [...d.objetsEffaces, ...d.supprimesRetires.filter((id) => !vivants.has(id))];
  await effacerObjets(ex, projetId, aEffacer);
  await effacerDependances(ex, projetId, aEffacer);

  // 2. Objets créés, modifiés, restaurés : une seule ligne, dans la table de leur classe.
  if (d.objetsEcrits.length > 0) {
    const ecrits = d.objetsEcrits.map(objetVersLignes);
    const ids = ecrits.map((e) => e.objet.id);
    await effacerDependances(ex, projetId, ids);
    for (const t of TABLES_OBJETS) {
      const deTable = ecrits.filter((e) => e.objet.table === t).map((e) => e.objet);
      const autres = TABLES_OBJETS.filter((x) => x !== t);
      await effacerObjets(
        ex,
        projetId,
        deTable.map((o) => o.id),
        autres,
      );
      await insererObjets(ex, projetId, rev, t, deTable);
    }
    await insererProprietes(
      ex,
      projetId,
      rev,
      ecrits.flatMap((e) => e.proprietes),
    );
    await insererRepresentations(
      ex,
      projetId,
      rev,
      ecrits.flatMap((e) => e.representations),
    );
  }

  // 3. Nouvelles traces de suppression, à la suite des rangs existants (ordre de `supprimes` conservé).
  if (d.supprimesAjoutes.length > 0) {
    const r = await lignes<{ rang: number | null }>(
      ex,
      sql`SELECT max(m) AS rang FROM (
        SELECT max(deleted_rank) AS m FROM atelier_objects WHERE project_id = ${projetId}
        UNION ALL SELECT max(deleted_rank) FROM atelier_layers WHERE project_id = ${projetId}
        UNION ALL SELECT max(deleted_rank) FROM atelier_site WHERE project_id = ${projetId}) s`,
    );
    const depart = r[0]?.rang === null || r[0]?.rang === undefined ? 0 : Number(r[0].rang) + 1;
    await marquerSupprimes(ex, projetId, rev, d.supprimesAjoutes, depart);
  }

  // 4. Relations (ensemble) : retraits d'abord, puis ajouts.
  if (d.relationsRetirees.length > 0) {
    for (const p of paquets(d.relationsRetirees.map(relationVersLigne))) {
      await ex.execute(sql`
        DELETE FROM atelier_relations r USING jsonb_to_recordset(${json(p)}) AS x(type text, source_id text, target_id text, role text)
        WHERE r.project_id = ${projetId} AND r.type = x.type AND r.source_id = x.source_id AND r.target_id = x.target_id
          AND coalesce(r.role, '') = coalesce(x.role, '')`);
    }
  }
  await insererRelations(ex, projetId, rev, d.relationsAjoutees.map(relationVersLigne));

  // 5. Catalogue de types.
  if (d.definitionsEffacees.length > 0) {
    await ex.execute(sql`DELETE FROM atelier_definitions WHERE project_id = ${projetId} AND key IN ${idsDe(d.definitionsEffacees)}`);
  }
  await ecrireDefinitions(ex, projetId, rev, d.definitionsEcrites);

  // 6. Propriétés de projet (réécrites ensemble : leur ordre est une donnée).
  if (d.proprietesProjet !== null) {
    await ex.execute(sql`DELETE FROM atelier_properties WHERE project_id = ${projetId} AND object_id IS NULL`);
    await insererProprietes(
      ex,
      projetId,
      rev,
      d.proprietesProjet.map((p, i) => proprieteVersLigne(null, p, i)),
    );
  }

  await ecrireTete(ex, projetId, d.tete);
  return d;
}

interface LigneObjetBrute extends Omit<LigneObjet, "table"> {
  readonly table: TableObjets;
  readonly deleted_rank: number | null;
}

const SELECT_OBJETS = (projetId: string, filtre: SQL) => sql`
  SELECT * FROM (
    SELECT 'atelier_objects' AS "table", ${COLONNES_OBJET_SQL}, deleted_rank FROM atelier_objects WHERE project_id = ${projetId}
    UNION ALL SELECT 'atelier_layers', ${COLONNES_OBJET_SQL}, deleted_rank FROM atelier_layers WHERE project_id = ${projetId}
    UNION ALL SELECT 'atelier_site', ${COLONNES_OBJET_SQL}, deleted_rank FROM atelier_site WHERE project_id = ${projetId}
  ) o WHERE ${filtre}`;

const COLONNES_PROPRIETE_SQL = sql.raw(`object_id, "position", name, value, unit, provenance, status, source_id, note, extra`);
const COLONNES_REPRESENTATION_SQL = sql.raw(`object_id, "position", usage, authority, engine, engine_version, inputs_hash, extra`);
const COLONNES_RELATION_SQL = sql.raw(`type, source_id, target_id, role, derived, extra`);

function sansMeta(o: LigneObjetBrute): LigneObjet {
  const { deleted_rank: _r, model_revision: _m, ...reste } = o as LigneObjetBrute & { model_revision?: unknown };
  return reste;
}

/**
 * Charge l'état typé d'un projet. `null` si le projet n'existe pas ou n'a pas encore de modèle (`atelier_models`).
 * Dans une transaction de commande, verrouiller d'abord la ligne du projet (`SELECT … FOR UPDATE`).
 * `verifierEmpreinte` : recalcule l'empreinte et lève une erreur si elle diffère de celle de la tête.
 */
export async function chargerEtat(ex: Executeur, projetId: string, options: { readonly verifierEmpreinte?: boolean } = {}): Promise<EtatModele | null> {
  const projet = (await lignes<{ model_revision: number }>(ex, sql`SELECT model_revision FROM projects WHERE id = ${projetId}`))[0];
  if (!projet) return null;
  const tete = (await lignes<LigneTete>(ex, sql`SELECT model_revision, fingerprint, ontology_version, catalogue_version FROM atelier_models WHERE project_id = ${projetId}`))[0];
  if (!tete) return null;
  const objets = await lignes<LigneObjetBrute>(ex, SELECT_OBJETS(projetId, sql`true`));
  const vivants = objets.filter((o) => o.deleted_rank === null);
  const supprimes = objets.filter((o) => o.deleted_rank !== null).map((o) => ({ id: o.id, deleted_rank: Number(o.deleted_rank) }));
  // Propriétés et représentations des objets vivants et du projet (celles d'un objet supprimé restent en base pour l'historique).
  const vivantsIds = new Set(vivants.map((o) => o.id));
  const proprietes = (await lignes<LignePropriete>(ex, sql`SELECT ${COLONNES_PROPRIETE_SQL} FROM atelier_properties WHERE project_id = ${projetId}`)).filter(
    (p) => p.object_id === null || vivantsIds.has(p.object_id),
  );
  const representations = (await lignes<LigneRepresentation>(ex, sql`SELECT ${COLONNES_REPRESENTATION_SQL} FROM atelier_representations WHERE project_id = ${projetId}`)).filter((r) =>
    vivantsIds.has(r.object_id),
  );
  const relations = await lignes<LigneRelation>(ex, sql`SELECT ${COLONNES_RELATION_SQL} FROM atelier_relations WHERE project_id = ${projetId}`);
  const definitions = await lignes<LigneDefinition>(ex, sql`SELECT key, definition_id, "class", catalogue_version, content FROM atelier_definitions WHERE project_id = ${projetId}`);
  const etat = lignesVersEtat(
    {
      projetId,
      tete: { ...tete, model_revision: Number(tete.model_revision) },
      objets: vivants.map(sansMeta),
      supprimes,
      proprietes,
      relations,
      representations,
      definitions,
    },
    Number(projet.model_revision),
  );
  if (options.verifierEmpreinte) {
    const calculee = calculerEmpreinte(etat);
    if (calculee !== etat.empreinte) throw new ErreurLignesAtelier(`Projet ${projetId} : empreinte relue ${calculee}, attendue ${etat.empreinte}.`);
  }
  return etat;
}

/** Instantané d'un niveau (chargement par niveau, `GET /model/niveaux/:id`). */
export interface InstantaneNiveau {
  readonly projetId: string;
  readonly revision: number;
  readonly empreinte: string;
  readonly niveau: ObjetModele;
  /** Objets vivants dont `niveauId` est ce niveau. */
  readonly objets: readonly ObjetModele[];
  /** Relations dont la source ou la cible est le niveau ou l'un de ses objets (ordre canonique). */
  readonly relations: readonly Relation[];
}

/** `null` si le projet, son modèle ou le niveau (vivant, de classe `niveau`) n'existe pas. */
export async function chargerNiveau(ex: Executeur, projetId: string, niveauId: string): Promise<InstantaneNiveau | null> {
  const tete = (
    await lignes<{ fingerprint: string; model_revision: number }>(
      ex,
      sql`SELECT m.fingerprint, p.model_revision FROM atelier_models m JOIN projects p ON p.id = m.project_id WHERE m.project_id = ${projetId}`,
    )
  )[0];
  if (!tete) return null;
  const brutes = await lignes<LigneObjetBrute>(ex, SELECT_OBJETS(projetId, sql`o.deleted_rank IS NULL AND (o.id = ${niveauId} OR o.level_id = ${niveauId})`));
  const ligneNiveau = brutes.find((o) => o.id === niveauId && o.class === "niveau");
  if (!ligneNiveau) return null;
  const ids = brutes.map((o) => o.id);
  const proprietes = await lignes<LignePropriete>(ex, sql`SELECT ${COLONNES_PROPRIETE_SQL} FROM atelier_properties WHERE project_id = ${projetId} AND object_id IN ${idsDe(ids)}`);
  const representations = await lignes<LigneRepresentation>(
    ex,
    sql`SELECT ${COLONNES_REPRESENTATION_SQL} FROM atelier_representations WHERE project_id = ${projetId} AND object_id IN ${idsDe(ids)}`,
  );
  const relations = await lignes<LigneRelation>(
    ex,
    sql`SELECT ${COLONNES_RELATION_SQL} FROM atelier_relations WHERE project_id = ${projetId} AND (source_id IN ${idsDe(ids)} OR target_id IN ${idsDe(ids)})`,
  );
  const etat = lignesVersEtat(
    {
      projetId,
      tete: { model_revision: Number(tete.model_revision), fingerprint: tete.fingerprint, ontology_version: 0, catalogue_version: 0 },
      objets: brutes.map(sansMeta),
      supprimes: [],
      proprietes,
      relations,
      representations,
      definitions: [],
    },
    Number(tete.model_revision),
  );
  const niveau = etat.objets[niveauId];
  if (!niveau) return null;
  return {
    projetId,
    revision: etat.revision,
    empreinte: etat.empreinte,
    niveau,
    objets: Object.values(etat.objets).filter((o) => o.id !== niveauId),
    relations: etat.relations,
  };
}
