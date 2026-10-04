/**
 * Projection pure du modèle typé vers l'entrée d'analyse consommée par `packages/domain-model`
 * (`analyseModel` : niveaux + `floorDesign`-like + parcelle + emprise) — cahier des charges, section 5.6. Les
 * autres modules (bilan Harmonie, étapes, aperçu conceptuel, documents, contrôles) ne changent que leur source.
 * Les identifiants natifs sont conservés : les liaisons Programmation ↔ pièces (`niveau|idPiece`) restent valides.
 */
import type { ModeleAtelier, OccurrenceQuelconque, Propriete } from "../modele.js";
import { niveauxOrdonnes } from "../modele.js";
import type { Point2 } from "../unites.js";
import { RANG_NATIF } from "../import/natif.js";

/** Ordre de lecture : rang natif d'abord (ordre de l'exemple importé), puis les objets créés ensuite, par identifiant. */
const rangDe = (o: { proprietes: Record<string, Propriete> }) => {
  const v = o.proprietes[RANG_NATIF]?.valeur;
  return typeof v === "number" ? v : Number.POSITIVE_INFINITY;
};

type Paire = [number, number];
const paire = (p: Point2): Paire => [p.x, p.y];
const trous = (t: Point2[][]) => t.map((h) => ({ kind: "poly", poly: h.map(paire) }));

function natif(o: { proprietes: Record<string, Propriete> }): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o.proprietes)) if (k.startsWith("natif:") && !k.includes(".") && k !== RANG_NATIF) out[k.slice(6)] = v.valeur;
  return out;
}

export interface NiveauAnalyse {
  id: string;
  name: string;
  elevation: number;
  /** Hauteur absente du modèle = non évaluée : la clé est omise (le consommateur la traite comme inconnue). */
  height?: number;
  [k: string]: unknown;
}

export interface EntreeAnalyse {
  nativeId: string;
  levels: NiveauAnalyse[];
  floor: { levels: Record<string, Record<string, unknown>>; meta: Record<string, unknown>; layers: Record<string, unknown> };
  parcel: Record<string, unknown> | null;
  footprint: Paire[];
}

export function projeterPourAnalyse(etat: ModeleAtelier, nativeId = "modele-type"): EntreeAnalyse {
  const levels: NiveauAnalyse[] = niveauxOrdonnes(etat).map((n) => (n.hauteur === null ? { id: n.id, name: n.nom, elevation: n.elevation } : { id: n.id, name: n.nom, elevation: n.elevation, height: n.hauteur }));
  const floorLevels: Record<string, Record<string, unknown>> = {};
  for (const n of levels) floorLevels[n.id] = { walls: [], doors: [], windows: [], stairs: [], columns: [], rooms: [], paths: [], dims: [], texts: [], exteriorWallIds: [] as string[] };
  const push = (niveauId: string | null, famille: string, valeur: unknown) => {
    if (!niveauId || !floorLevels[niveauId]) return;
    (floorLevels[niveauId]![famille] as unknown[]).push(valeur);
  };
  const objets = Object.values(etat.objets).sort((a, b) => rangDe(a) - rangDe(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const o of objets) projeterObjet(o, push, floorLevels);
  const meta: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(etat.proprietes)) if (k.startsWith("natif:meta.")) meta[k.slice("natif:meta.".length)] = v.valeur;
  if (etat.site.structure) meta["structure"] = etat.site.structure;
  meta["assumptions"] = etat.site.hypotheses.map((h) => [h.id, h.domaine, h.texte]);
  meta["sources"] = etat.site.sources.map((s) => s.champs);
  const layers: Record<string, unknown> = {};
  for (const c of Object.values(etat.calques).sort((a, b) => a.ordre - b.ordre)) layers[c.id] = { color: c.couleur, fill: c.remplissage, visible: c.visible, locked: c.verrouille };
  const parcelle = etat.site.parcelle;
  const parcel = parcelle
    ? {
        ...parcelle.champs,
        vertices: parcelle.sommets.map((s) => [s.cadastral.x, s.cadastral.y] as Paire),
        vertexIds: parcelle.sommets.map((s) => s.id),
        crs: parcelle.crs,
        sourceCrs: parcelle.sourceCrs,
        area: parcelle.aire?.value ?? null,
        officialArea: parcelle.aireOfficielle?.value ?? null,
        centroid: [parcelle.origineLocale.x, parcelle.origineLocale.y] as Paire,
      }
    : null;
  const footprint = etat.site.emprise ? etat.site.emprise.sommetsCadastraux.map((c) => [c.x, c.y] as Paire) : [];
  return { nativeId, levels, floor: { levels: floorLevels, meta, layers }, parcel, footprint };
}

function projeterObjet(o: OccurrenceQuelconque, push: (niveauId: string | null, famille: string, valeur: unknown) => void, floorLevels: Record<string, Record<string, unknown>>): void {
  const base = { ...natif(o), id: o.id, layer: o.calqueId ?? undefined };
  switch (o.classe) {
    case "mur": {
      push(o.niveauId, "walls", { ...base, kind: "wall", a: paire(o.params.a), b: paire(o.params.b), thickness: o.params.epaisseur.value, height: o.params.hauteur?.value ?? 0, name: o.params.nom ?? undefined, type: o.definitionId === "non-type" ? undefined : o.definitionId ?? undefined });
      if (o.params.exterieur && o.niveauId && floorLevels[o.niveauId]) (floorLevels[o.niveauId]!["exteriorWallIds"] as string[]).push(o.id);
      return;
    }
    case "porte":
    case "fenetre":
    case "ouverture":
      push(o.niveauId, o.classe === "fenetre" ? "windows" : "doors", { ...base, kind: o.classe === "fenetre" ? "window" : "door", hostWallId: o.params.murHoteId, t: o.params.position, width: o.params.largeur.value, height: o.params.hauteur.value, sill: o.params.allege?.value ?? undefined, mark: o.params.repere ?? undefined });
      return;
    case "escalier":
      push(o.niveauId, "stairs", { ...base, kind: "stairs", name: o.params.nom ?? undefined, a: paire(o.params.a), b: paire(o.params.b), width: o.params.largeur.value, height: o.params.hauteurAFranchir.value, baseOffset: o.params.decalageBase.value, steps: o.params.marches ?? undefined, risers: o.params.contremarches ?? undefined, waistThickness: o.params.epaisseurPaillasse?.value ?? undefined, stairGroup: o.params.groupe ?? undefined, targetLevel: o.params.niveauArriveeId ?? undefined, planReferenceOnly: o.params.referencePlanSeulement, sourceLevel: o.params.niveauDepartId });
      return;
    case "poteau":
      push(o.niveauId, "columns", { ...base, kind: "column", name: o.params.nom ?? undefined, p: paire(o.params.point), shapeId: o.params.formeId, width: o.params.largeur.value, depth: o.params.profondeur.value, height: o.params.hauteur?.value ?? undefined, angle: o.params.angle.value, designStatus: o.params.statutConception ?? undefined });
      return;
    case "espace":
      push(o.niveauId, "rooms", { ...natif(o), level: o.niveauId, code: o.params.code ?? undefined, name: o.params.nom, area: o.params.aireDeclaree?.value ?? undefined, category: o.params.categorie ?? undefined, notes: o.params.notes ?? undefined, polygons: o.params.polygones.map((pg) => ({ points: pg.contour.map(paire), holes: pg.trous.map((h) => h.map(paire)) })), label: o.params.etiquette ? paire(o.params.etiquette) : undefined });
      return;
    case "piece":
      push(o.niveauId, "paths", { ...base, kind: "path", name: o.params.code ? `${o.params.code} · ${o.params.nom}` : o.params.nom, points: o.params.contour.map(paire), holes: trous(o.params.trous), closed: true, cadSolid: true, role: "room" });
      return;
    case "dalle":
      push(o.niveauId, "paths", { ...base, kind: "path", name: o.params.nom ?? undefined, points: o.params.contour.map(paire), holes: trous(o.params.trous), closed: true, cadSolid: true, height: o.params.epaisseur.value, baseOffset: o.params.decalageBase.value, role: "floor-slab" });
      return;
    case "toiture":
      push(o.niveauId, "paths", { ...base, kind: "path", name: o.params.nom ?? undefined, points: o.params.contour.map(paire), holes: trous(o.params.trous), closed: true, cadSolid: true, height: o.params.epaisseur.value, baseOffset: o.params.decalageBase.value, role: "roof-slab" });
      return;
    case "zone":
      push(o.niveauId, "paths", { ...base, kind: "path", name: o.params.nom, points: o.params.contour.map(paire), holes: trous(o.params.trous), closed: true, cadSolid: true, role: "core-zone" });
      return;
    case "reference-plan":
      push(o.niveauId, "paths", { ...base, kind: "path", name: o.params.nom ?? undefined, points: o.params.contour.map(paire), holes: trous(o.params.trous), closed: true, cadSolid: true, role: "plan-reference" });
      return;
    case "solide":
      push(o.niveauId, "paths", { ...base, kind: "path", name: o.params.nom ?? undefined, points: o.params.contour.map(paire), holes: trous(o.params.trous), closed: o.params.ferme, cadSolid: true, height: o.params.hauteur?.value ?? undefined, baseOffset: o.params.decalageBase.value, thickness: o.params.epaisseur?.value ?? undefined, role: o.params.role, color: o.params.couleur ?? undefined });
      return;
    case "cotation":
      push(o.niveauId, "dims", { ...base, kind: "dim", a: paire(o.params.a), b: paire(o.params.b), offset: o.params.decalage.value });
      return;
    case "texte":
      push(o.niveauId, "texts", { ...base, kind: "text", x: o.params.position.x, y: o.params.position.y, text: o.params.texte });
      return;
    case "etiquette":
      push(o.niveauId, "texts", { ...base, kind: "text", x: o.params.position.x, y: o.params.position.y, text: o.params.texte, objectId: o.params.objetId ?? undefined });
      return;
    case "esquisse":
      push(o.niveauId, "paths", { ...base, kind: "path", role: `esquisse:${o.params.forme}`, points: o.params.points.map(paire), holes: [], closed: o.params.ferme, cadSolid: false });
      return;
    case "bloc-occurrence":
      return;
  }
}
