/**
 * Barres d'opérations de la Planche (D-198, demande du maître d'ouvrage du 10 octobre 2026) : la liste « Outils ▾ »
 * range les outils du catalogue par famille ; chaque outil y déplie sa **barre d'opérations**, trois sections toujours
 * dans le même ordre — ① Créer (façons de créer ce genre de géométrie, variantes), ② Modifier (opérations applicables à
 * cette géométrie), ③ Mesurer / annoter. Chaque opération est un outil EXISTANT du catalogue (aucun outil inventé) ;
 * l'activer revient exactement à le choisir dans la barre de gauche.
 *
 * Construction : chaque outil est rattaché à un **objet** (arêtes, surfaces, volumes, sélection, solides, matière,
 * guides de mesure, annotations, caméra) ; les outils d'un même objet partagent la même barre. Une opération garde donc
 * partout le même pictogramme et le même raccourci (ceux de `outils-planche.ts`). Pur : ni DOM, ni React.
 */
import { OUTILS, normaliserTexte, outilParId, type FamilleOutil, type Outil } from "@parcours/planche-model";
import { t, type CleMessage } from "../messages";
import { afficherRaccourci, nomOutil, raccourciOutil } from "./outils-planche";

/** Ordre des familles dans la liste : celui de la déclaration `FamilleOutil` du catalogue (sélection, dessin…). */
export const FAMILLES: readonly { id: FamilleOutil; cle: CleMessage }[] = [
  { id: "selection", cle: "outils.famille.selection" },
  { id: "dessin", cle: "outils.famille.dessin" },
  { id: "modification", cle: "outils.famille.modification" },
  { id: "mesure", cle: "outils.famille.mesure" },
  { id: "annotation", cle: "outils.famille.annotation" },
  { id: "camera", cle: "outils.famille.camera" },
  { id: "solide", cle: "outils.famille.solide" },
  { id: "materiau", cle: "outils.famille.materiau" },
];

export type CleSection = "creer" | "modifier" | "mesurer";
/** Sections ①②③ ; libellés au catalogue de messages (`t`, français et anglais). */
export const SECTIONS: readonly { cle: CleSection; numero: string; message: CleMessage }[] = [
  { cle: "creer", numero: "①", message: "outils.section.creer" },
  { cle: "modifier", numero: "②", message: "outils.section.modifier" },
  { cle: "mesurer", numero: "③", message: "outils.section.mesurer" },
];

export type ObjetBarre = "aretes" | "surfaces" | "volumes" | "selection" | "solides" | "matiere" | "guides" | "annotations" | "camera";

/** Contenu des barres, par objet (identifiants du catalogue). */
export const BARRES: Readonly<Record<ObjetBarre, Readonly<Record<CleSection, readonly string[]>>>> = {
  aretes: {
    creer: ["ligne", "main-levee", "arc-2-points", "arc", "arc-3-points"],
    modifier: ["deplacer", "pousser-tirer", "decalage", "diviser", "faire-pivoter", "echelle", "retourner", "suivez-moi", "gomme"],
    mesurer: ["metre", "cotation", "rapporteur", "texte"],
  },
  surfaces: {
    creer: ["rectangle", "rectangle-pivote", "cercle", "polygone", "secteur"],
    modifier: ["pousser-tirer", "suivez-moi", "decalage", "deplacer", "faire-pivoter", "echelle", "retourner", "peinture", "gomme"],
    mesurer: ["metre", "cotation", "rapporteur", "texte"],
  },
  volumes: {
    creer: ["pousser-tirer", "suivez-moi", "texte-3d"],
    modifier: ["deplacer", "faire-pivoter", "echelle", "retourner", "decalage", "peinture", "gomme"],
    mesurer: ["metre", "cotation", "plan-de-coupe", "texte"],
  },
  selection: {
    creer: ["selection", "lasso"],
    modifier: ["deplacer", "faire-pivoter", "echelle", "retourner", "peinture", "gomme"],
    mesurer: ["metre", "rapporteur", "cotation", "texte", "balise"],
  },
  solides: {
    creer: ["union", "soustraction", "intersection", "enveloppe-exterieure"],
    modifier: ["ajuster", "scinder", "pousser-tirer", "deplacer", "faire-pivoter", "echelle", "retourner"],
    mesurer: ["metre", "cotation", "plan-de-coupe", "texte"],
  },
  matiere: {
    creer: ["peinture", "echantillon-matiere"],
    modifier: ["selection", "lasso"],
    mesurer: ["metre", "texte", "balise"],
  },
  guides: {
    creer: ["metre", "rapporteur", "axes"],
    modifier: ["deplacer", "faire-pivoter", "gomme"],
    mesurer: ["cotation", "texte", "plan-de-coupe", "balise"],
  },
  annotations: {
    creer: ["cotation", "texte", "plan-de-coupe", "balise"],
    modifier: ["deplacer", "faire-pivoter", "gomme"],
    mesurer: ["metre", "rapporteur", "axes"],
  },
  camera: {
    creer: ["positionner-camera", "regarder-autour", "marcher"],
    modifier: ["orbite", "panoramique", "zoom", "zoom-fenetre", "zoom-etendu"],
    mesurer: ["metre", "plan-de-coupe"],
  },
};

/** Objet de chaque outil du catalogue (tous les outils de la Planche ; test : aucun oublié, aucun inconnu). */
export const OBJET_DE: Readonly<Record<string, ObjetBarre>> = {
  selection: "selection",
  lasso: "selection",
  deplacer: "selection",
  "faire-pivoter": "selection",
  echelle: "selection",
  retourner: "selection",
  ligne: "aretes",
  "main-levee": "aretes",
  arc: "aretes",
  "arc-2-points": "aretes",
  "arc-3-points": "aretes",
  diviser: "aretes",
  gomme: "aretes",
  rectangle: "surfaces",
  "rectangle-pivote": "surfaces",
  cercle: "surfaces",
  polygone: "surfaces",
  secteur: "surfaces",
  decalage: "surfaces",
  "pousser-tirer": "volumes",
  "suivez-moi": "volumes",
  "texte-3d": "volumes",
  "enveloppe-exterieure": "solides",
  intersection: "solides",
  union: "solides",
  soustraction: "solides",
  ajuster: "solides",
  scinder: "solides",
  peinture: "matiere",
  "echantillon-matiere": "matiere",
  metre: "guides",
  rapporteur: "guides",
  axes: "guides",
  cotation: "annotations",
  texte: "annotations",
  "plan-de-coupe": "annotations",
  balise: "annotations",
  orbite: "camera",
  panoramique: "camera",
  zoom: "camera",
  "zoom-etendu": "camera",
  "zoom-fenetre": "camera",
  "positionner-camera": "camera",
  "regarder-autour": "camera",
  marcher: "camera",
};

export interface SectionBarre {
  cle: CleSection;
  numero: string;
  libelle: string;
  outils: Outil[];
}

/** Barre d'opérations d'un outil : trois sections ①②③ (outils du catalogue), ou `null` pour un identifiant inconnu. */
export function barreDe(id: string): SectionBarre[] | null {
  const objet = OBJET_DE[id];
  if (!objet) return null;
  const b = BARRES[objet];
  return SECTIONS.map((s) => ({ cle: s.cle, numero: s.numero, libelle: t(s.message), outils: b[s.cle].map((x) => outilParId(x)).filter((o): o is Outil => o !== null) }));
}

/**
 * Libellé d'une opération : « Nom — raccourci » (même texte dans la liste, les barres flottantes et les infobulles),
 * dans la langue de l'interface (nom de référence et `Shift` en anglais).
 */
export function libelleOperation(o: Outil): string {
  const r = raccourciOutil(o);
  return r ? `${nomOutil(o)} — ${afficherRaccourci(r)}` : nomOutil(o);
}

export interface GroupeFamille {
  famille: FamilleOutil;
  libelle: string;
  outils: Outil[];
}

/**
 * Groupes de la liste, une famille par groupe, dans l'ordre de `FAMILLES` ; les outils dans l'ordre du catalogue.
 * Avec une requête : seuls les outils dont le libellé (français ou de référence), l'identifiant ou le raccourci
 * contient tous les mots ; une famille sans outil retenu disparaît.
 */
export function groupesOutils(requete = "", catalogue: readonly Outil[] = OUTILS): GroupeFamille[] {
  const q = normaliserTexte(requete);
  const mots = q === "" ? [] : q.split(" ");
  const retenu = (o: Outil) => {
    if (!mots.length) return true;
    const r = raccourciOutil(o);
    const tout = [o.libelle, o.libelleSketchUp, o.id.replace(/-/g, " "), r ?? ""].map(normaliserTexte).join(" ");
    return mots.every((m) => tout.includes(m));
  };
  return FAMILLES.map((f) => ({ famille: f.id, libelle: t(f.cle), outils: catalogue.filter((o) => o.famille === f.id && retenu(o)) })).filter((g) => g.outils.length > 0);
}

/** Premier outil retenu par une requête (Entrée dans le champ de recherche), ou `null`. */
export function premierOutil(requete: string, catalogue: readonly Outil[] = OUTILS): Outil | null {
  const q = normaliserTexte(requete);
  if (q === "") return null;
  const ordre = groupesOutils(requete, catalogue).flatMap((g) => g.outils);
  // Correspondance exacte, puis début de libellé, puis l'ordre de la liste (celui qu'on voit).
  const note = (o: Outil) => {
    const libelles = [o.libelle, o.libelleSketchUp, o.id.replace(/-/g, " ")].map(normaliserTexte);
    return libelles.some((l) => l === q) ? 0 : libelles.some((l) => l.startsWith(q)) ? 1 : 2;
  };
  return ordre.map((o, rang) => ({ o, n: note(o), rang })).sort((a, b) => a.n - b.n || a.rang - b.rang)[0]?.o ?? null;
}
