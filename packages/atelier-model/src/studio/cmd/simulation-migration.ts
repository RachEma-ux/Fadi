import type { StudioDocument } from "../composition/types.js";
import { studioRelations } from "./effets.js";
import { studioMigrerDocumentV1V2, studioMigrerDocumentV2V1, studioRestaurerSourceV1, STUDIO_SCHEMA_DOCUMENT_V1, STUDIO_SCHEMA_DOCUMENT_V2 } from "./migration-document.js";

/**
 * Simulation d'une migration non destructrice (EX-091) : pour chaque révision d'une étude, la migration
 * `studio-document/1` → `/2` est jouée en mémoire et son résultat comparé à la source, catégorie par catégorie :
 * identifiants documentaires (document et éléments), propriétés déclarées, cotes (géométrie et liens), associations
 * (relations du document), historique (révisions et filiation) et accès (instantané fourni avant / après). Chaque
 * écart est listé avec son élément ; un élément non convertible est **conservé** (`conserves`) et rapporté, jamais
 * supprimé pour améliorer un taux. Le verdict n'autorise rien : l'application exige un accord explicite et garde un
 * point de retour (têtes des variantes), voir `apps/api/src/lib/studio-migrations.ts`. Pur.
 */
export type StudioCategorieMigration = "identifiants" | "proprietes" | "cotes" | "associations" | "historique" | "acces";
export const STUDIO_CATEGORIES_MIGRATION: readonly StudioCategorieMigration[] = Object.freeze(["identifiants", "proprietes", "cotes", "associations", "historique", "acces"] as const);

export interface StudioEcartMigration {
  categorie: StudioCategorieMigration;
  revisionId: string | null;
  element: string;
  /** `conserve-rapporte` : absent du contenu migré mais conservé dans `conserves` ; `perte` : disparu sans trace. */
  nature: "conserve-rapporte" | "perte" | "modifie";
  detail: string;
}

export interface StudioRevisionSimulee { id: string; parentRevisionId: string | null; document: unknown }

export interface StudioRapportSimulationMigration {
  schema: "studio-simulation-migration/1";
  de: typeof STUDIO_SCHEMA_DOCUMENT_V1;
  vers: typeof STUDIO_SCHEMA_DOCUMENT_V2;
  revisions: { id: string; parentRevisionId: string | null; migree: boolean; motif: string | null; conserves: number; allerRetourExact: boolean }[];
  comptes: Record<StudioCategorieMigration, { compares: number; ecarts: number }>;
  ecarts: StudioEcartMigration[];
  /** `sans-perte` ; `conserves-rapportes` (accord requis) ; `refusee` (perte sans trace ou révision non migrable). */
  verdict: "sans-perte" | "conserves-rapportes" | "refusee";
}

const stable = (v: unknown): string => {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).sort().filter((k) => o[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stable(o[k])}`).join(",")}}`;
};

const LISTES = ["objects", "layers", "dimensions", "solides", "exacts", "annotations", "architecture", "scenes", "nonNatifs", "niveaux", "composants", "occurrences"] as const;
function identites(doc: Record<string, unknown>): Set<string> {
  const s = new Set<string>();
  for (const l of LISTES) for (const x of (doc[l] as { id?: unknown }[] | undefined) ?? []) if (x && typeof x.id === "string") s.add(`${l}:${x.id}`);
  return s;
}
function proprietes(doc: Record<string, unknown>): Map<string, string> {
  return new Map(((doc["proprietes"] as Record<string, unknown>[] | undefined) ?? []).map((p) => [`${String(p["cibleId"])}#${String(p["nom"])}`, stable(p)]));
}
function cotes(doc: Record<string, unknown>): Map<string, string> {
  const m = new Map<string, string>();
  for (const c of (doc["dimensions"] as Record<string, unknown>[] | undefined) ?? []) m.set(String(c["id"]), stable(c));
  for (const c of (doc["annotations"] as Record<string, unknown>[] | undefined) ?? []) if (c["type"] === "angular-dimension") m.set(String(c["id"]), stable(c));
  return m;
}

function ajouterEcartsMap(cat: StudioCategorieMigration, rev: string, a: Map<string, string>, aNette: Map<string, string>, b: Map<string, string>, conservees: Set<string>, ecarts: StudioEcartMigration[]): number {
  for (const [k] of a) {
    const v = aNette.get(k), w = b.get(k);
    if (w === undefined) ecarts.push({ categorie: cat, revisionId: rev, element: k, nature: conservees.has(k) ? "conserve-rapporte" : "perte", detail: conservees.has(k) ? "élément conservé dans `conserves`, rapporté" : "élément absent du document migré" });
    else if (w !== v) ecarts.push({ categorie: cat, revisionId: rev, element: k, nature: "modifie", detail: "valeur différente après migration" });
  }
  return a.size;
}

/**
 * Simule la migration de toutes les révisions données (une étude : toutes ses variantes). `acces` : instantanés des
 * accès avant et après (la migration ne doit pas en changer) ; absent, la catégorie est « non évaluée » (0 comparé).
 */
export function studioSimulerMigration(revisions: readonly StudioRevisionSimulee[], acces?: { avant: unknown; apres: unknown }): StudioRapportSimulationMigration {
  const ecarts: StudioEcartMigration[] = [];
  const comptes = Object.fromEntries(STUDIO_CATEGORIES_MIGRATION.map((c) => [c, { compares: 0, ecarts: 0 }])) as StudioRapportSimulationMigration["comptes"];
  const lignes: StudioRapportSimulationMigration["revisions"] = [];
  let refusee = false;
  const migrees = new Map<string, { parent: string | null }>();
  for (const r of revisions) {
    const m = studioMigrerDocumentV1V2(r.document);
    if (!m.ok) {
      refusee = true;
      lignes.push({ id: r.id, parentRevisionId: r.parentRevisionId, migree: false, motif: m.motif, conserves: 0, allerRetourExact: false });
      ecarts.push({ categorie: "identifiants", revisionId: r.id, element: `revision:${r.id}`, nature: "conserve-rapporte", detail: `migration impossible (${m.motif}) : révision source conservée telle quelle` });
      continue;
    }
    const src = r.document as Record<string, unknown>;
    const retour = studioMigrerDocumentV2V1(m.document).document as unknown as Record<string, unknown>;
    const restauree = studioRestaurerSourceV1(m.document);
    const allerRetourExact = stable(restauree) === stable(src);
    const conserves = m.document.conserves ?? [];
    // Source sans les données conservées (retraits rejoués dans leur ordre) : base de comparaison des valeurs.
    const nette = structuredClone(src);
    for (const c of conserves) {
      const p = /^studioDocument((?:\.[\w$-]+|\[\d+\])*)$/.exec(c.chemin)?.[1] ?? "";
      const segs = [...p.matchAll(/\.([\w$-]+)|\[(\d+)\]/g)].map((x) => (x[1] !== undefined ? x[1] : Number(x[2])));
      if (c.cle !== null) {
        let o: unknown = nette;
        for (const sg of segs) o = (o as Record<string | number, unknown>)?.[sg];
        if (o && typeof o === "object") delete (o as Record<string, unknown>)[c.cle];
      } else {
        const l = nette[segs[0] as string];
        if (Array.isArray(l)) l.splice(segs[1] as number, 1);
      }
    }
    // Éléments entiers conservés, par clé de comparaison (liste:id, cible#nom).
    const conservees = new Set<string>();
    for (const c of conserves) {
      if (c.cle !== null) continue;
      const liste = /^studioDocument\.(\w+)\[/.exec(c.chemin)?.[1] ?? "";
      const v = c.valeur as Record<string, unknown> | null;
      if (v && typeof v === "object") {
        if (typeof v["id"] === "string") { conservees.add(`${liste}:${v["id"]}`); conservees.add(String(v["id"])); }
        if (liste === "proprietes") conservees.add(`${String(v["cibleId"])}#${String(v["nom"])}`);
      }
    }
    // Identifiants : document, puis chaque élément.
    comptes.identifiants.compares += 1;
    if (retour["id"] !== src["id"]) ecarts.push({ categorie: "identifiants", revisionId: r.id, element: `document:${String(src["id"])}`, nature: "perte", detail: "identifiant du document changé" });
    const ia = identites(src), ib = identites(retour);
    comptes.identifiants.compares += ia.size;
    for (const k of ia) if (!ib.has(k)) ecarts.push({ categorie: "identifiants", revisionId: r.id, element: k, nature: conservees.has(k) ? "conserve-rapporte" : "perte", detail: conservees.has(k) ? "élément conservé dans `conserves`, rapporté" : "identifiant absent du document migré" });
    for (const c of conserves) if (c.cle !== null) ecarts.push({ categorie: "identifiants", revisionId: r.id, element: `${c.chemin}.${c.cle}`, nature: "conserve-rapporte", detail: c.motif });
    comptes.proprietes.compares += ajouterEcartsMap("proprietes", r.id, proprietes(src), proprietes(nette), proprietes(retour), conservees, ecarts);
    comptes.cotes.compares += ajouterEcartsMap("cotes", r.id, cotes(src), cotes(nette), cotes(retour), conservees, ecarts);
    // Associations : relations du document source relu par le validateur (une source invalide est comparée sur ce qui a été lu).
    const relSrc = (() => { try { return studioRelations(studioMigrerDocumentV2V1(m.document).document); } catch { return []; } })();
    const relB = new Set(studioRelations(retour as unknown as StudioDocument).map((x) => `${x.nature}|${x.de}|${x.vers}`));
    comptes.associations.compares += relSrc.length;
    for (const x of relSrc) if (!relB.has(`${x.nature}|${x.de}|${x.vers}`)) ecarts.push({ categorie: "associations", revisionId: r.id, element: `${x.de}→${x.vers}`, nature: "perte", detail: x.nature });
    // Associations de la source que la migration a mises de côté (élément conservé portant une relation).
    for (const c of conserves) if (c.cle === null && c.valeur && typeof c.valeur === "object" && ("links" in (c.valeur as object) || "hostId" in (c.valeur as object))) {
      ecarts.push({ categorie: "associations", revisionId: r.id, element: String((c.valeur as Record<string, unknown>)["id"]), nature: "conserve-rapporte", detail: "association portée par un élément conservé" });
    }
    migrees.set(r.id, { parent: r.parentRevisionId });
    lignes.push({ id: r.id, parentRevisionId: r.parentRevisionId, migree: true, motif: null, conserves: conserves.length, allerRetourExact });
    if (!allerRetourExact) ecarts.push({ categorie: "identifiants", revisionId: r.id, element: `revision:${r.id}`, nature: "perte", detail: "récupération de la source inexacte" });
  }
  // Historique : chaque révision migrée garde son identifiant et sa filiation (parent présent dans l'ensemble ou nul).
  const ids = new Set(revisions.map((r) => r.id));
  for (const r of revisions) {
    comptes.historique.compares += 1;
    const m = migrees.get(r.id);
    if (!m) ecarts.push({ categorie: "historique", revisionId: r.id, element: `revision:${r.id}`, nature: "conserve-rapporte", detail: "révision non migrée, conservée en studio-document/1" });
    else if (m.parent !== null && !ids.has(m.parent)) ecarts.push({ categorie: "historique", revisionId: r.id, element: `revision:${r.id}`, nature: "perte", detail: `révision parente ${m.parent} absente de la simulation` });
  }
  if (acces) {
    comptes.acces.compares += 1;
    if (stable(acces.avant) !== stable(acces.apres)) ecarts.push({ categorie: "acces", revisionId: null, element: "acces", nature: "perte", detail: "accès différents avant / après" });
  }
  for (const e of ecarts) comptes[e.categorie].ecarts += 1;
  const pertes = ecarts.some((e) => e.nature !== "conserve-rapporte");
  return {
    schema: "studio-simulation-migration/1", de: STUDIO_SCHEMA_DOCUMENT_V1, vers: STUDIO_SCHEMA_DOCUMENT_V2,
    revisions: lignes, comptes, ecarts,
    verdict: refusee || pertes ? "refusee" : ecarts.length ? "conserves-rapportes" : "sans-perte",
  };
}
