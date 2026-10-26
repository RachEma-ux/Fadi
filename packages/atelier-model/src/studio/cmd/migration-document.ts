import { validateStudioDocument } from "../composition/document.js";
import type { StudioDocument } from "../composition/types.js";
import { StudioValidationError } from "../noyau/validation.js";

/**
 * Évolutivité du schéma du document Studio (EX-019, P-12 / REC-A-01) : migration documentée `studio-document/1` →
 * `studio-document/2`, son inverse, la récupération exacte de la source et le rapport de chaque donnée inconnue.
 *
 * `studio-document/2` (version suivante du schéma) = le contenu de `studio-document/1`, inchangé, plus une liste
 * facultative `conserves` : les données qu'un lecteur `/1` ne sait pas interpréter (champ inconnu d'un objet, élément
 * d'une liste refusé par le validateur) y sont **conservées** avec leur chemin d'origine, leur valeur et le motif du
 * refus, au lieu d'être refusées en bloc (lecteur `/1`) ou perdues en silence. Transformation (`STUDIO_MIGRATIONS_DOCUMENT`) :
 *
 * 1. `/1` → `/2` (`studioMigrerDocumentV1V2`) : lire la source ; tant que le validateur `/1` la refuse pour un champ
 *    inconnu, le retirer et le conserver ; pour un élément de liste invalide, le retirer et le conserver ; tout autre refus
 *    (en-tête, unité, repère, contrôle entre éléments sans élément désigné) rend la migration **impossible** : la source
 *    est rendue telle quelle avec le motif, rien n'est perdu. Puis `schemaVersion` devient `/2`.
 * 2. `/2` → `/1` (`studioMigrerDocumentV2V1`, retour arrière) : le contenu revient en `/1` ; ce que `/1` ne peut pas
 *    représenter (`conserves`) est listé un à un dans le **rapport des pertes** (jamais perdu en silence).
 * 3. Récupération (`studioRestaurerSourceV1`) : réinsère les données conservées à leur place, dans l'ordre inverse de
 *    leur retrait : la source `/1` d'origine est reconstruite exactement (aller-retour contrôlé par test sur le corpus).
 *
 * Le document persistant du serveur reste `studio-document/1` (contrainte de `studio_revisions`) tant que la bascule
 * vers `/2` n'est pas décidée : la migration d'une étude se simule, s'accorde et se retire (`apps/api`, EX-091). Pur.
 */
export const STUDIO_SCHEMA_DOCUMENT_V1 = "studio-document/1";
export const STUDIO_SCHEMA_DOCUMENT_V2 = "studio-document/2";

export interface StudioDonneeConservee {
  /** Rang du retrait (0, 1, …) : la récupération les réinsère dans l'ordre inverse. */
  ordre: number;
  /** Chemin de l'objet (champ inconnu) ou de l'élément (élément refusé) au moment du retrait. */
  chemin: string;
  /** Nom du champ inconnu, ou null pour un élément entier. */
  cle: string | null;
  valeur: unknown;
  motif: string;
  depuis: typeof STUDIO_SCHEMA_DOCUMENT_V1;
}

export type StudioDocumentV2 = Omit<StudioDocument, "schemaVersion"> & { schemaVersion: typeof STUDIO_SCHEMA_DOCUMENT_V2; conserves?: StudioDonneeConservee[] };

export interface StudioRapportMigrationDocument {
  de: string;
  vers: string;
  documentId: string | null;
  /** Éléments du document migré par liste (identités conservées une à une). */
  elements: Record<string, number>;
  conserves: { chemin: string; cle: string | null; motif: string }[];
  pertes: { chemin: string; cle: string | null; motif: string }[];
}

export type StudioResultatMigrationDocument =
  | { ok: true; document: StudioDocumentV2; rapport: StudioRapportMigrationDocument }
  | { ok: false; motif: string; source: unknown; rapport: StudioRapportMigrationDocument };

/** Migrations déclarées, chaînées version par version. */
export const STUDIO_MIGRATIONS_DOCUMENT = Object.freeze([
  Object.freeze({
    de: STUDIO_SCHEMA_DOCUMENT_V1, vers: STUDIO_SCHEMA_DOCUMENT_V2,
    transformation: "Contenu /1 inchangé (identités, propriétés, cotes, associations) ; champs inconnus et éléments refusés retirés et conservés dans `conserves` (chemin, valeur, motif) ; schemaVersion → studio-document/2.",
    inverse: "Contenu rendu en studio-document/1 ; chaque donnée conservée est rapportée comme perte (non représentable en /1).",
    recuperation: "studioRestaurerSourceV1 : réinsertion des données conservées dans l'ordre inverse de leur retrait — source /1 exacte.",
    impossible: "En-tête invalide (unité, repère, version) ou refus sans élément désigné : migration refusée, source rendue intacte avec le motif.",
  }),
]);

const LISTES = ["objects", "layers", "dimensions", "solides", "exacts", "annotations", "architecture", "proprietes", "scenes", "nonNatifs"] as const;
const MAX_ETAPES = 100_000;

type Segment = string | number;
function segments(chemin: string): Segment[] | null {
  const out: Segment[] = [];
  const re = /([A-Za-z_$][\w$-]*)|\[(\d+)\]|\./gy;
  let m: RegExpExecArray | null, fin = 0;
  while ((m = re.exec(chemin)) !== null) {
    if (m[1] !== undefined) out.push(m[1]); else if (m[2] !== undefined) out.push(Number(m[2]));
    fin = re.lastIndex;
    if (fin === chemin.length) break;
  }
  if (fin !== chemin.length) return null;
  if (out[0] !== "document" && out[0] !== "studioDocument") return null;
  return out.slice(1);
}
function resoudre(racine: unknown, segs: readonly Segment[]): unknown {
  let x: unknown = racine;
  for (const s of segs) {
    if (x === null || typeof x !== "object") return undefined;
    x = (x as Record<string | number, unknown>)[s];
  }
  return x;
}
const cheminDe = (segs: readonly Segment[]) => "studioDocument" + segs.map((s) => (typeof s === "number" ? `[${s}]` : `.${s}`)).join("");

function compter(doc: Record<string, unknown>): Record<string, number> {
  return Object.fromEntries(LISTES.map((l) => [l, Array.isArray(doc[l]) ? (doc[l] as unknown[]).length : 0]));
}

/** `/1` → `/2` : voir l'en-tête. La source n'est jamais modifiée. */
export function studioMigrerDocumentV1V2(source: unknown): StudioResultatMigrationDocument {
  const brut = structuredClone(source) as Record<string, unknown>;
  const conserves: StudioDonneeConservee[] = [];
  const rapport = (doc: Record<string, unknown> | null): StudioRapportMigrationDocument => ({
    de: STUDIO_SCHEMA_DOCUMENT_V1, vers: STUDIO_SCHEMA_DOCUMENT_V2,
    documentId: typeof brut?.["id"] === "string" ? (brut["id"] as string) : null,
    elements: doc ? compter(doc) : {},
    conserves: conserves.map((c) => ({ chemin: c.chemin, cle: c.cle, motif: c.motif })), pertes: [],
  });
  const impossible = (motif: string): StudioResultatMigrationDocument => ({ ok: false, motif, source: structuredClone(source), rapport: { ...rapport(null), conserves: [] } });
  if (!brut || typeof brut !== "object" || Array.isArray(brut)) return impossible("document : objet attendu");
  if (brut["schemaVersion"] !== STUDIO_SCHEMA_DOCUMENT_V1) return impossible(`document : version ${String(brut["schemaVersion"])} non migrable par ${STUDIO_SCHEMA_DOCUMENT_V1} → ${STUDIO_SCHEMA_DOCUMENT_V2}`);
  for (let etape = 0; etape < MAX_ETAPES; etape++) {
    let valide: StudioDocument;
    try { valide = validateStudioDocument(brut); }
    catch (e) {
      if (!(e instanceof StudioValidationError)) return impossible(e instanceof Error ? e.message : String(e));
      const segs = segments(e.path);
      if (!segs) return impossible(e.message);
      if (e.inconnus?.length) {
        const cible = resoudre(brut, segs) as Record<string, unknown> | undefined;
        if (!cible || typeof cible !== "object") return impossible(e.message);
        for (const cle of e.inconnus) {
          conserves.push({ ordre: conserves.length, chemin: cheminDe(segs), cle, valeur: cible[cle], motif: `champ inconnu de ${STUDIO_SCHEMA_DOCUMENT_V1}`, depuis: STUDIO_SCHEMA_DOCUMENT_V1 });
          delete cible[cle];
        }
        continue;
      }
      const [liste, index] = segs;
      if (typeof liste === "string" && (LISTES as readonly string[]).includes(liste) && typeof index === "number" && Array.isArray(brut[liste]) && index < (brut[liste] as unknown[]).length) {
        const l = brut[liste] as unknown[];
        conserves.push({ ordre: conserves.length, chemin: cheminDe([liste, index]), cle: null, valeur: l[index], motif: e.message, depuis: STUDIO_SCHEMA_DOCUMENT_V1 });
        l.splice(index, 1);
        continue;
      }
      return impossible(e.message);
    }
    const document: StudioDocumentV2 = { ...valide, schemaVersion: STUDIO_SCHEMA_DOCUMENT_V2, ...(conserves.length ? { conserves } : {}) };
    return { ok: true, document, rapport: rapport(valide as unknown as Record<string, unknown>) };
  }
  return impossible("document : trop de données à conserver");
}

/** Validation d'un document `/2` : contenu `/1` valide et données conservées bien formées. Renvoie une copie. */
export function studioValiderDocumentV2(value: unknown): StudioDocumentV2 {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new StudioValidationError("studioDocument", "objet attendu");
  const { conserves, schemaVersion, ...reste } = value as Record<string, unknown>;
  if (schemaVersion !== STUDIO_SCHEMA_DOCUMENT_V2) throw new StudioValidationError("studioDocument.schemaVersion", "version non prise en charge");
  const contenu = validateStudioDocument({ ...reste, schemaVersion: STUDIO_SCHEMA_DOCUMENT_V1 });
  const liste: StudioDonneeConservee[] = [];
  if (conserves !== undefined) {
    if (!Array.isArray(conserves)) throw new StudioValidationError("studioDocument.conserves", "tableau attendu");
    conserves.forEach((c, i) => {
      const o = c as Record<string, unknown>;
      if (!o || typeof o !== "object" || o["ordre"] !== i || typeof o["chemin"] !== "string" || !(o["cle"] === null || typeof o["cle"] === "string") || typeof o["motif"] !== "string" || o["depuis"] !== STUDIO_SCHEMA_DOCUMENT_V1 || !("valeur" in o)) {
        throw new StudioValidationError(`studioDocument.conserves[${i}]`, "donnée conservée mal formée");
      }
      liste.push(structuredClone(o) as unknown as StudioDonneeConservee);
    });
  }
  return { ...contenu, schemaVersion: STUDIO_SCHEMA_DOCUMENT_V2, ...(liste.length ? { conserves: liste } : {}) };
}

/** `/2` → `/1` (retour arrière) : contenu `/1` et rapport des pertes (données conservées non représentables). */
export function studioMigrerDocumentV2V1(value: unknown): { document: StudioDocument; rapport: StudioRapportMigrationDocument } {
  const v2 = studioValiderDocumentV2(value);
  const { conserves = [], schemaVersion: _v, ...reste } = v2;
  const lu = validateStudioDocument({ ...reste, schemaVersion: STUDIO_SCHEMA_DOCUMENT_V1 });
  return {
    document: lu,
    rapport: {
      de: STUDIO_SCHEMA_DOCUMENT_V2, vers: STUDIO_SCHEMA_DOCUMENT_V1, documentId: lu.id, elements: compter(lu as unknown as Record<string, unknown>), conserves: [],
      pertes: conserves.map((c) => ({ chemin: c.chemin, cle: c.cle, motif: `non représentable en ${STUDIO_SCHEMA_DOCUMENT_V1} : ${c.motif}` })),
    },
  };
}

/** Récupération : la source `/1` exacte (données conservées réinsérées à leur place). Non validée : elle peut être refusée par `/1`. */
export function studioRestaurerSourceV1(value: unknown): Record<string, unknown> {
  const v2 = studioValiderDocumentV2(value);
  const { conserves = [], schemaVersion: _v, ...reste } = v2;
  const doc = structuredClone({ ...reste, schemaVersion: STUDIO_SCHEMA_DOCUMENT_V1 }) as Record<string, unknown>;
  for (const c of [...conserves].sort((a, b) => b.ordre - a.ordre)) {
    const segs = segments(c.chemin);
    if (!segs) throw new StudioValidationError(c.chemin, "chemin de donnée conservée illisible");
    if (c.cle !== null) {
      const cible = resoudre(doc, segs) as Record<string, unknown> | undefined;
      if (!cible || typeof cible !== "object") throw new StudioValidationError(c.chemin, "objet de la donnée conservée introuvable");
      cible[c.cle] = structuredClone(c.valeur);
    } else {
      const [liste, index] = segs as [string, number];
      const l = (doc[liste] as unknown[] | undefined) ?? (doc[liste] = []) as unknown[];
      l.splice(index, 0, structuredClone(c.valeur));
    }
  }
  return doc;
}

/** Lecture versionnée : un document `/1` est migré vers `/2`, un `/2` est validé ; toute autre version est refusée. */
export function studioLireDocumentVersionne(value: unknown): StudioResultatMigrationDocument {
  const v = (value as Record<string, unknown> | null)?.["schemaVersion"];
  if (v === STUDIO_SCHEMA_DOCUMENT_V2) {
    const v2 = studioValiderDocumentV2(value);
    return { ok: true, document: v2, rapport: { de: STUDIO_SCHEMA_DOCUMENT_V2, vers: STUDIO_SCHEMA_DOCUMENT_V2, documentId: v2.id, elements: compter(v2 as unknown as Record<string, unknown>), conserves: (v2.conserves ?? []).map((c) => ({ chemin: c.chemin, cle: c.cle, motif: c.motif })), pertes: [] } };
  }
  return studioMigrerDocumentV1V2(value);
}
