import { studioDxfLayerNames } from "../export.js";
import { STUDIO_DEFAULT_LAYER_ID } from "../noyau/limites.js";
import { validateStudioDocument } from "../noyau/document.js";
import type { StudioAnnotation, StudioDocument, StudioShape } from "../noyau/types.js";
import type { StudioDimension } from "../objets/cote.js";
import type { StudioSolid } from "../objets-3d/solides.js";
import type { StudioArchitectureItem } from "../architecture/types.js";
import type { StudioPropriete } from "../exigences/proprietes.js";
import type { StudioElementVisualisation } from "../scenes/scenes.js";

/**
 * Rapport de fidélité d'un export Studio (E.6-03) : pour un document et un format (SVG, DXF, IFC), ce qui est exporté
 * **exactement**, ce qui est **approché** (arcs discrétisés en IFC, cotes éclatées en DXF, texte échappé, extrusion non
 * portée en 2D…) et ce qui n'est **pas couvert** (annotations hors IFC, solides hors SVG / DXF, objets non extrudés en
 * IFC), compté par type et par raison, avec le traitement des calques masqués et des noms de calque réécrits.
 *
 * Source unique : la table `STUDIO_CAPACITES_EXPORT` décrit, pour chaque type d'élément du document et chaque format, le
 * sort de l'élément ; elle suit les écrivains (`export.ts`, `ifc.ts`, `objets/<type>.ts`). Un test exige une entrée pour
 * chaque type du schéma du document (`STUDIO_DOCUMENT_SCHEMA`) : un type ajouté sans entrée fait échouer la recette. Une
 * liste du document qu'aucune catégorie ne connaît est comptée « non couverte » (`type-sans-capacite`), jamais omise.
 * Pur et déterministe ; aucune donnée n'est inventée : le rapport ne fait que lire le document et la table.
 */

export const STUDIO_RAPPORT_FIDELITE_SCHEMA = "studio-rapport-fidelite/1" as const;
export const STUDIO_FORMATS_ECHANGE = Object.freeze(["svg", "dxf", "ifc"] as const);
export type StudioFormatEchange = (typeof STUDIO_FORMATS_ECHANGE)[number];

export type StudioStatutFidelite = "exact" | "approche" | "non-couvert";
export const STUDIO_STATUTS_FIDELITE: readonly StudioStatutFidelite[] = Object.freeze(["exact", "approche", "non-couvert"] as const);

/** Raisons (codes stables ; libellés affichés par l'interface, traduits par son dictionnaire). */
export const STUDIO_RAISONS_FIDELITE = Object.freeze([
  // Exact
  "trace-exact", "arcs-exacts", "renflements-exacts", "cote-tracee", "texte-exact", "extrusion-exacte", "profil-exact", "ouverture-evidee",
  // Approché
  "extrusion-non-portee", "arcs-discretises", "cote-eclatee", "texte-police-generique", "texte-ascii-echappe", "texte-remplace", "texte-tronque",
  "ouverture-en-lacune",
  // Non couvert
  "non-extrude", "cote-hors-ifc", "annotation-hors-ifc", "solide-hors-2d", "visualisation-hors-export", "type-sans-capacite",
  // Propriétés BIM déclarées (E.1-01) : jeu de projet `Fadi_ProprietesDeclarees` en IFC ; ni SVG ni DXF ; une propriété
  // sans valeur (« non évaluée ») n'est écrite nulle part.
  "propriete-non-exportee", "propriete-en-pset", "propriete-non-evaluee",
] as const);
export type StudioRaisonFidelite = (typeof STUDIO_RAISONS_FIDELITE)[number];

/** Catégorie = liste du document qui porte l'élément. */
export type StudioCategorieEchange = "objets" | "cotes" | "annotations" | "solides" | "architecture" | "proprietes" | "scenes" | "inconnue";
/** Liste du document de chaque catégorie connue (clé de `StudioDocument`). */
export const STUDIO_LISTES_ECHANGE = Object.freeze({ objets: "objects", cotes: "dimensions", annotations: "annotations", solides: "solides", architecture: "architecture", proprietes: "proprietes", scenes: "scenes" } as const);

export interface StudioJugementFidelite { statut: StudioStatutFidelite; raison: StudioRaisonFidelite }
type Juge<T> = (item: T) => StudioJugementFidelite;
type ParFormat<T> = { readonly [F in StudioFormatEchange]: Juge<T> };

const exact = (raison: StudioRaisonFidelite): StudioJugementFidelite => ({ statut: "exact", raison });
const approche = (raison: StudioRaisonFidelite): StudioJugementFidelite => ({ statut: "approche", raison });
const nonCouvert = (raison: StudioRaisonFidelite): StudioJugementFidelite => ({ statut: "non-couvert", raison });

/** SVG / DXF : le tracé 2D est exact ; une extrusion déclarée n'y est pas portée (2D seulement). */
const trace2d = (raison: StudioRaisonFidelite) => (o: StudioShape): StudioJugementFidelite => (o.extrusion ? approche("extrusion-non-portee") : exact(raison));
/** IFC : seul un objet extrudé devient un élément 3D. */
const ifc3d = (siExtrude: (o: StudioShape) => StudioJugementFidelite) => (o: StudioShape): StudioJugementFidelite => (o.extrusion ? siExtrude(o) : nonCouvert("non-extrude"));
const aRenflement = (o: { bulges?: readonly number[] }): boolean => (o.bulges ?? []).some((b) => b !== 0);

/**
 * Texte DXF (R12, ASCII strict, `dxfText`) : hors ASCII échappé en `\U+XXXX`, hors plan multilingue de base remplacé par
 * « ? », 250 caractères au plus après échappement.
 */
function texteDxf(content: string): StudioJugementFidelite {
  let longueur = 0, horsAscii = false, remplace = false;
  for (const ch of content) {
    const code = ch.codePointAt(0)!;
    if (code < 0x80) longueur += 1;
    else if (code <= 0xffff) { longueur += 7; horsAscii = true; }
    else { longueur += 1; remplace = true; }
  }
  if (longueur > 250) return approche("texte-tronque");
  if (remplace) return approche("texte-remplace");
  return horsAscii ? approche("texte-ascii-echappe") : exact("texte-exact");
}

/**
 * Table des capacités d'export, par catégorie, type et format. Elle décrit les écrivains actuels :
 * - SVG : lignes, rectangles, cercles exacts ; arcs et renflements en arcs elliptiques exacts (`<path>`) ; cotes tracées
 *   (ligne, attaches, valeur) ; texte en police générique (`sans-serif`, corps = hauteur) ; solides libres absents ;
 * - DXF R12 : LINE, POLYLINE fermée, CIRCLE, ARC exacts, renflements en code 42 ; cotes éclatées en LINE + TEXT (non
 *   associatives, hauteur du texte = réglage d'export) ; TEXT à la hauteur saisie, ASCII échappé ; solides absents ;
 * - IFC : objets extrudés seulement (non extrudés : non couverts) ; cercle en profil exact ; arcs et renflements
 *   discrétisés (`STUDIO_SEGMENTS_PAR_TOUR`) ; cotes et annotations non écrites ; solides libres en profils exacts ;
 * - architecture (A.4) : mur en SVG / DXF tracé en plan (contour, lacunes aux ouvertures) sans sa hauteur ni sa base
 *   (approché, comme une extrusion déclarée), extrusion exacte en IFC
 *   (`IfcWall`) ; ouverture en SVG / DXF : simple lacune du mur quelle que soit son allège (approchée), en IFC :
 *   `IfcOpeningElement` + `IfcRelVoidsElement` exacts (`IfcDoor` / `IfcWindow` seulement si le type est déclaré) ;
 * - propriétés déclarées (E.1-01) : `IfcPropertySingleValue` d'un jeu de projet `Fadi_ProprietesDeclarees` en IFC,
 *   exactes (valeur, unité et source déclarées, `exigences/ifc.ts`) quand elles ont une valeur ; sans valeur : non
 *   couvertes (`propriete-non-evaluee`) ; SVG et DXF ne les portent pas ;
 * - visualisation (lot E.5) : scènes et apparences d'affichage ne sont écrites dans aucun format (réglages de vue, pas
 *   des données du modèle) : non couvertes.
 */
export const STUDIO_CAPACITES_EXPORT: {
  readonly objets: { readonly [K in StudioShape["type"]]: ParFormat<Extract<StudioShape, { type: K }>> };
  readonly cotes: { readonly dimension: ParFormat<StudioDimension> };
  readonly annotations: { readonly [K in StudioAnnotation["type"]]: ParFormat<Extract<StudioAnnotation, { type: K }>> };
  readonly solides: { readonly [K in StudioSolid["type"]]: ParFormat<Extract<StudioSolid, { type: K }>> };
  readonly architecture: { readonly [K in StudioArchitectureItem["type"]]: ParFormat<Extract<StudioArchitectureItem, { type: K }>> };
  /** Propriétés déclarées (E.1-01) : sans discriminant de type, un seul type « propriete ». */
  readonly proprietes: { readonly propriete: ParFormat<StudioPropriete> };
  readonly scenes: { readonly [K in StudioElementVisualisation["type"]]: ParFormat<Extract<StudioElementVisualisation, { type: K }>> };
} = Object.freeze({
  objets: {
    line: { svg: trace2d("trace-exact"), dxf: trace2d("trace-exact"), ifc: ifc3d(() => exact("extrusion-exacte")) },
    rectangle: { svg: trace2d("trace-exact"), dxf: trace2d("trace-exact"), ifc: ifc3d(() => exact("extrusion-exacte")) },
    circle: { svg: trace2d("trace-exact"), dxf: trace2d("trace-exact"), ifc: ifc3d(() => exact("profil-exact")) },
    arc: { svg: trace2d("arcs-exacts"), dxf: trace2d("arcs-exacts"), ifc: ifc3d(() => approche("arcs-discretises")) },
    polyline: {
      svg: (o) => trace2d(aRenflement(o) ? "arcs-exacts" : "trace-exact")(o),
      dxf: (o) => trace2d(aRenflement(o) ? "renflements-exacts" : "trace-exact")(o),
      ifc: (o) => ifc3d(() => (aRenflement(o) ? approche("arcs-discretises") : exact("extrusion-exacte")))(o),
    },
  },
  cotes: {
    dimension: { svg: () => exact("cote-tracee"), dxf: () => approche("cote-eclatee"), ifc: () => nonCouvert("cote-hors-ifc") },
  },
  annotations: {
    "angular-dimension": { svg: () => exact("cote-tracee"), dxf: () => approche("cote-eclatee"), ifc: () => nonCouvert("annotation-hors-ifc") },
    text: { svg: () => approche("texte-police-generique"), dxf: (t) => texteDxf(t.content), ifc: () => nonCouvert("annotation-hors-ifc") },
  },
  solides: {
    box: { svg: () => nonCouvert("solide-hors-2d"), dxf: () => nonCouvert("solide-hors-2d"), ifc: () => exact("profil-exact") },
    prism: { svg: () => nonCouvert("solide-hors-2d"), dxf: () => nonCouvert("solide-hors-2d"), ifc: () => exact("profil-exact") },
  },
  architecture: {
    wall: { svg: () => approche("extrusion-non-portee"), dxf: () => approche("extrusion-non-portee"), ifc: () => exact("extrusion-exacte") },
    opening: { svg: () => approche("ouverture-en-lacune"), dxf: () => approche("ouverture-en-lacune"), ifc: () => exact("ouverture-evidee") },
  },
  // Propriétés déclarées : ni le SVG ni le DXF ne les portent ; l'IFC écrit celles qui ont une valeur.
  proprietes: {
    propriete: {
      svg: () => nonCouvert("propriete-non-exportee"), dxf: () => nonCouvert("propriete-non-exportee"),
      ifc: (p) => (p.valeur === undefined ? nonCouvert("propriete-non-evaluee") : exact("propriete-en-pset")),
    },
  },
  scenes: {
    scene: { svg: () => nonCouvert("visualisation-hors-export"), dxf: () => nonCouvert("visualisation-hors-export"), ifc: () => nonCouvert("visualisation-hors-export") },
    appearance: { svg: () => nonCouvert("visualisation-hors-export"), dxf: () => nonCouvert("visualisation-hors-export"), ifc: () => nonCouvert("visualisation-hors-export") },
  },
});

/** Une ligne du rapport : les éléments d'un même type, d'un même sort et d'une même raison. */
export interface StudioLigneFidelite {
  categorie: StudioCategorieEchange;
  type: string;
  statut: StudioStatutFidelite;
  raison: StudioRaisonFidelite;
  nombre: number;
  /** Identifiants Studio des éléments, dans l'ordre du document. */
  ids: string[];
}

/** Traitement des calques masqués par le format. */
export type StudioTraitementCalquesMasques = "contenu-masque" | "calque-eteint";

export interface StudioRapportFidelite {
  schema: typeof STUDIO_RAPPORT_FIDELITE_SCHEMA;
  format: StudioFormatEchange;
  documentId: string;
  totaux: { elements: number; exact: number; approche: number; nonCouvert: number };
  lignes: StudioLigneFidelite[];
  calques: {
    /** Calques du document (le calque implicite non matérialisé n'est pas compté). */
    total: number;
    masques: number;
    verrouilles: number;
    /** Éléments (toutes catégories) posés sur un calque masqué. */
    elementsSurCalquesMasques: number;
    /**
     * SVG : contenu conservé sous `display="none"`, hors du cadrage ; DXF : calque éteint (couleur négative) ; IFC :
     * `IfcPresentationLayerWithStyle` éteint (`LayerOn = .F.`), éléments exportés.
     */
    traitementMasques: StudioTraitementCalquesMasques;
    /** Noms de calque réécrits par le format (DXF R12 : ASCII, 31 caractères, suffixes de collision). */
    renommes: { id: string; nom: string; nomExporte: string }[];
  };
}

const TRAITEMENT_MASQUES: Readonly<Record<StudioFormatEchange, StudioTraitementCalquesMasques>> = Object.freeze({ svg: "contenu-masque", dxf: "calque-eteint", ifc: "calque-eteint" });
const CLES_CONNUES = new Set<string>(["id", "schemaVersion", "units", "frame", "layers", ...Object.values(STUDIO_LISTES_ECHANGE)]);

/** Rapport de fidélité de l'export `format` du document (validé d'abord, comme l'export lui-même). */
export function studioRapportFidelite(input: StudioDocument, format: StudioFormatEchange): StudioRapportFidelite {
  if (!(STUDIO_FORMATS_ECHANGE as readonly string[]).includes(format)) throw new RangeError(`format d'échange inconnu : ${String(format)}`);
  const doc = validateStudioDocument(input);
  const groupes = new Map<string, StudioLigneFidelite>();
  const poser = (categorie: StudioCategorieEchange, type: string, j: StudioJugementFidelite, id: string) => {
    const cle = `${categorie}|${type}|${j.statut}|${j.raison}`;
    const g = groupes.get(cle);
    if (g) { g.nombre++; g.ids.push(id); } else groupes.set(cle, { categorie, type, ...j, nombre: 1, ids: [id] });
  };
  const masques = new Set((doc.layers ?? []).filter((l) => !l.visible).map((l) => l.id));
  let surMasques = 0;
  const compterCalque = (o: { layerId?: string }) => { if (masques.has(o.layerId ?? STUDIO_DEFAULT_LAYER_ID)) surMasques++; };
  const juger = <T>(table: Record<string, ParFormat<T>>, o: T & { type: string }): StudioJugementFidelite | null => {
    const entree = Object.hasOwn(table, o.type) ? table[o.type] : undefined;
    return entree ? entree[format](o) : null;
  };
  const parcourir = <T extends { id: string; type: string; layerId?: string }>(categorie: Exclude<StudioCategorieEchange, "inconnue">, items: readonly T[] | undefined) => {
    for (const o of items ?? []) {
      compterCalque(o);
      const j = juger(STUDIO_CAPACITES_EXPORT[categorie] as unknown as Record<string, ParFormat<T>>, o);
      poser(categorie, o.type, j ?? nonCouvert("type-sans-capacite"), o.id);
    }
  };
  parcourir("objets", doc.objects);
  parcourir("cotes", doc.dimensions);
  parcourir("annotations", doc.annotations);
  parcourir("solides", doc.solides);
  // Une ouverture n'a pas de calque propre : elle suit celui de son mur hôte.
  const avecCalque = (layerId: string | undefined): { layerId?: string } => (layerId === undefined ? {} : { layerId });
  const calqueMur = new Map((doc.architecture ?? []).filter((e) => e.type === "wall").map((m) => [m.id, (m as { layerId?: string }).layerId]));
  parcourir("architecture", (doc.architecture ?? []).map((e) => (e.type === "opening" ? { ...e, ...avecCalque(calqueMur.get(e.hostId)) } : e)));
  // Propriétés déclarées : identifiées par « cible#nom » ; elles n'ont pas de calque propre (non comptées sur les calques).
  for (const p of doc.proprietes ?? []) poser("proprietes", "propriete", STUDIO_CAPACITES_EXPORT.proprietes.propriete[format](p), `${p.cibleId}#${p.nom}`);
  // Scènes et apparences : sans calque propre (une apparence de calque ne pose rien sur ce calque).
  for (const s of doc.scenes ?? []) poser("scenes", s.type, STUDIO_CAPACITES_EXPORT.scenes[s.type][format](s as never), s.id);
  // Liste du document qu'aucune catégorie ne connaît : comptée non couverte, jamais omise.
  for (const [cle, valeur] of Object.entries(doc as unknown as Record<string, unknown>)) {
    if (CLES_CONNUES.has(cle) || !Array.isArray(valeur)) continue;
    valeur.forEach((v, i) => {
      const o = (v ?? {}) as { id?: unknown; type?: unknown; layerId?: string };
      compterCalque(o);
      poser("inconnue", `${cle}:${typeof o.type === "string" ? o.type : "?"}`, nonCouvert("type-sans-capacite"), typeof o.id === "string" ? o.id : `${cle}[${i}]`);
    });
  }
  const lignes = [...groupes.values()];
  const totaux = { elements: 0, exact: 0, approche: 0, nonCouvert: 0 };
  for (const l of lignes) {
    totaux.elements += l.nombre;
    if (l.statut === "exact") totaux.exact += l.nombre;
    else if (l.statut === "approche") totaux.approche += l.nombre;
    else totaux.nonCouvert += l.nombre;
  }
  const layers = doc.layers ?? [];
  const nomsDxf = format === "dxf" ? studioDxfLayerNames(doc) : {};
  const renommes = format === "dxf"
    ? layers.filter((l) => nomsDxf[l.id] !== undefined && nomsDxf[l.id] !== l.name).map((l) => ({ id: l.id, nom: l.name, nomExporte: nomsDxf[l.id]! }))
    : [];
  return {
    schema: STUDIO_RAPPORT_FIDELITE_SCHEMA, format, documentId: doc.id, totaux, lignes,
    calques: {
      total: layers.length, masques: masques.size, verrouilles: layers.filter((l) => l.locked).length,
      elementsSurCalquesMasques: surMasques, traitementMasques: TRAITEMENT_MASQUES[format], renommes,
    },
  };
}
