/**
 * Libellés du rapport de fidélité d'un export (E.6-03) : statuts, raisons, types et traitement des calques masqués,
 * écrits en français (traduits à l'affichage par `en.json`). Adresse du rapport servi par l'API. Pur : ni React ni DOM.
 */
import type { StudioFormatEchange, StudioRaisonFidelite, StudioRapportFidelite, StudioStatutFidelite, StudioTraitementCalquesMasques } from "@parcours/atelier-model";

export const LIBELLES_STATUT_FIDELITE: Readonly<Record<StudioStatutFidelite, string>> = Object.freeze({
  exact: "Exact", approche: "Approché", "non-couvert": "Non couvert",
});

export const LIBELLES_RAISON_FIDELITE: Readonly<Record<StudioRaisonFidelite, string>> = Object.freeze({
  "trace-exact": "Tracé exact",
  "arcs-exacts": "Arcs exacts",
  "renflements-exacts": "Renflements exacts (code 42)",
  "cote-tracee": "Cote tracée (ligne, attaches, valeur)",
  "texte-exact": "Texte exact",
  "extrusion-exacte": "Extrusion exacte",
  "profil-exact": "Profil exact",
  "surface-exacte": "Surface verticale exacte (sans solide)",
  "ouverture-evidee": "Ouverture évidée dans le mur (porte / fenêtre si déclarée)",
  "extrusion-non-portee": "Extrusion non portée (2D seulement)",
  "arcs-discretises": "Arcs discrétisés en segments",
  "cote-eclatee": "Cote éclatée en lignes et texte, non associative",
  "texte-police-generique": "Police générique, corps égal à la hauteur saisie",
  "texte-ascii-echappe": "Caractères accentués échappés en ASCII",
  "texte-remplace": "Caractères hors plan de base remplacés par « ? »",
  "texte-tronque": "Texte tronqué à 250 caractères",
  "ouverture-en-lacune": "Ouverture tracée en lacune du mur, allège non représentée",
  "non-extrude": "Objet non extrudé, absent de l’IFC",
  "cote-hors-ifc": "Cote non écrite en IFC",
  "solide-exact-hors-ifc": "Solide exact (brep du noyau) non traduit dans ce format",
  "annotation-hors-ifc": "Annotation non écrite en IFC",
  "solide-hors-2d": "Solide 3D absent du fichier 2D",
  "visualisation-hors-export": "Réglage de visualisation (scène, apparence d’affichage), jamais exporté",
  "type-sans-capacite": "Type sans capacité déclarée, non exporté",
  "non-natif-hors-export": "Élément non natif (import sans équivalent natif), jamais exporté",
  "spline-decoupee": "Spline découpée en polyligne (16 segments par morceau de Bézier)",
  "transparence-non-portee": "Transparence non portée par ce format (déclarée)",
  "graphisme-hors-ifc": "Graphisme 2D (spline, hachure, symbole) hors IFC",
  "provenance-hors-dessin": "Provenance d’une source importée, exportée à part (studio-provenance/1)",
  "propriete-non-exportee": "Propriété déclarée non écrite dans le fichier",
  "propriete-en-pset": "Propriété déclarée écrite dans le jeu de propriétés du projet",
  "propriete-non-evaluee": "Propriété déclarée sans valeur (non évaluée), non écrite",
});

/** Types d'éléments du document ; un type inconnu de cette table s'affiche tel quel (jamais masqué). */
export const LIBELLES_TYPE_ELEMENT: Readonly<Record<string, string>> = Object.freeze({
  line: "Ligne", rectangle: "Rectangle", circle: "Cercle", arc: "Arc", polyline: "Polyligne",
  dimension: "Cote", "angular-dimension": "Cote angulaire", text: "Texte", box: "Boîte", prism: "Prisme", exact: "Solide exact",
  wall: "Mur", opening: "Ouverture", ladder: "Échelle d’accès", propriete: "Propriété", scene: "Scène", appearance: "Apparence d’affichage", "non-native": "Élément non natif",
  spline: "Spline", hachure: "Hachure", symbole: "Symbole", source: "Source importée",
});
export const libelleType = (type: string): string => (Object.hasOwn(LIBELLES_TYPE_ELEMENT, type) ? LIBELLES_TYPE_ELEMENT[type]! : type);

export const LIBELLES_TRAITEMENT_MASQUES: Readonly<Record<StudioTraitementCalquesMasques, string>> = Object.freeze({
  "contenu-masque": "Contenu conservé masqué, hors du cadrage",
  "calque-eteint": "Calque éteint, contenu exporté",
});

/** Lignes du rapport, les moins fidèles d'abord (non couvert, approché, exact), puis dans l'ordre du rapport. */
export function lignesTriees(r: Pick<StudioRapportFidelite, "lignes">): StudioRapportFidelite["lignes"] {
  const rang: Record<StudioStatutFidelite, number> = { "non-couvert": 0, approche: 1, exact: 2 };
  return r.lignes.map((l, i) => ({ l, i })).sort((a, b) => rang[a.l.statut] - rang[b.l.statut] || a.i - b.i).map(({ l }) => l);
}

/** Adresse JSON du rapport, dérivée de l'adresse d'export (même révision, même format). */
export function urlRapportExport(urlExport: string): string {
  return urlExport.replace("/export?", "/export/rapport?");
}

export const FORMATS_RAPPORT: Readonly<Record<string, StudioFormatEchange>> = Object.freeze({ "exporter-svg": "svg", "exporter-dxf": "dxf", "exporter-ifc": "ifc" });
