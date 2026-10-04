/**
 * Tracé d'un contour fermé point par point, commun aux outils dalle (mode « contour ») et espace : sommets
 * successifs, fermeture sur le premier point (ou Entrée dès trois sommets), retour arrière, saisie de précision
 * longueur / angle du segment courant, aperçu du polygone, de la cote et de l'aire.
 */
import { TOLERANCES } from "@parcours/atelier-model";
import type { ChampSaisie, ErreurLisible, FormeApercu, StyleApercu } from "../../socle";
import { champsSegment, contraindrePolaire, coteSegment, lisible, type Verrous } from "../../plan2d/outils/commun";
import { formaterValeur } from "../../plan2d/saisie";
import { distance, versPoint, type Vec } from "../../plan2d/geometrie";
import { aireContour } from "../geometrie";

export const confondus = (a: Vec, b: Vec) => distance(a, b) <= TOLERANCES.tolCoincidence;

export interface TraceContour {
  readonly points: () => readonly Vec[];
  /** Pointeur en mouvement (point brut, la contrainte polaire est appliquée ici). */
  survoler(p: Vec): void;
  /** Appui : « ferme » si le contour se ferme (au moins trois sommets), « pose » sinon, ou une erreur lisible. */
  poser(p: Vec): "ferme" | "pose" | ErreurLisible;
  retirerDernier(): void;
  /** Saisie de précision du segment courant (`longueur`, `angle`). */
  verrouiller(champ: string, valeur: number): ErreurLisible | null;
  vider(): void;
  formes(style: StyleApercu): FormeApercu[];
  champs(): ChampSaisie[];
}

export function traceContour(objet: string): TraceContour {
  let points: Vec[] = [];
  let curseur: Vec | null = null;
  let brut: Vec | null = null;
  let verrous: Verrous = {};
  const contraindre = (p: Vec) => contraindrePolaire(points.at(-1) ?? null, p, verrous);
  return {
    points: () => points,
    survoler(p) {
      brut = p;
      curseur = contraindre(p);
    },
    poser(brutAppui) {
      const p = contraindre(brutAppui);
      const premier = points[0];
      const dernier = points.at(-1);
      if (premier && points.length >= 3 && confondus(p, premier)) return "ferme";
      if (dernier && confondus(p, dernier)) return points.length >= 3 ? "ferme" : lisible(objet, "point confondu avec le précédent", "poser un point distinct");
      points = [...points, p];
      verrous = {};
      curseur = p;
      return "pose";
    },
    retirerDernier() {
      points = points.slice(0, -1);
      verrous = {};
    },
    verrouiller(champ, valeur) {
      if (champ === "longueur" && !(valeur > 0)) return lisible("Longueur", "valeur nulle ou négative", "taper une longueur positive (l'angle donne le sens)");
      verrous = { ...verrous, [champ]: valeur };
      if (brut) curseur = contraindre(brut);
      return null;
    },
    vider() {
      points = [];
      verrous = {};
    },
    formes(style) {
      if (points.length === 0) return [];
      const dernier = points.at(-1) as Vec;
      const tous = curseur && !confondus(curseur, dernier) ? [...points, curseur] : points;
      const formes: FormeApercu[] = [tous.length >= 3 ? { forme: "polygone", points: tous.map(versPoint), style } : { forme: "polyligne", points: tous.map(versPoint), fermee: false, style }];
      if (curseur) formes.push(coteSegment(dernier, curseur));
      if (tous.length >= 3) formes.push({ forme: "texte", position: versPoint(tous[0] as Vec), texte: `${formaterValeur(aireContour(tous), "")} m²`, style: "cote" });
      return formes;
    },
    champs: () => (points.length > 0 ? champsSegment(points.at(-1) as Vec, curseur, verrous) : []),
  };
}
