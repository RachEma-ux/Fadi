/**
 * Dessinateurs de plan des annotations (`cotation`, `texte`, `etiquette`), couche `annotation` (contrat
 * `DessinateurPlan`). Tout est **dérivé à l'affichage** depuis les paramètres canoniques, jamais stocké (R15).
 *
 * Cotation (DA-15-02, rendu du prototype) : ligne de cote décalée de `decalage` (signé, côté gauche de a→b
 * positif : n = (−dy, dx) / L), deux traits d'attache depuis `a` et `b`, deux tirets obliques à 45°, valeur au
 * milieu (`texteRemplacement` sinon la valeur exacte ‖b − a‖). Accrochage : la ligne de cote (segment) et les
 * points `a`, `b`.
 * Texte (DA-15-04) : `position` = coin bas-gauche de la première ligne ; plusieurs lignes (D-019) vers le bas ;
 * hauteur de dessin fixe `HAUTEUR_TEXTE` (le prototype dessinait à taille d'écran constante ; la taille « papier »
 * est au lot 5). Contour approché pour la sélection.
 * Étiquette (DA-15-05, lot 5 pour l'outil) : texte s'il y en a, sinon un repère circulaire ; trait de rappel vers
 * l'objet étiqueté quand celui-ci a un point d'insertion simple.
 */
import type { EtatModele, ObjetModele, PointLocal } from "@parcours/atelier-model";
import type { DessinateurPlan, DessinPlan, FormeDessin } from "../socle";
import { distance, fois, milieu, plus, pt, sous, versPoint, type Vec } from "../plan2d/geometrie";
import { texteCote } from "./format";

/** Hauteur de dessin d'un texte d'annotation (m) — choix d'outil, comme le repli de `plan2d`. */
export const HAUTEUR_TEXTE = 0.25;
/** Interligne relatif d'un texte de plusieurs lignes. */
export const INTERLIGNE = 1.2;
/** Largeur moyenne d'un caractère, relative à la hauteur (contour de sélection approché). */
export const CHASSE = 0.6;
/** Demi-longueur des tirets obliques et dépassement des traits d'attache (m). */
export const TIRET = 0.075;
export const DEPASSEMENT_ATTACHE = 0.1;
/** Écart entre la ligne de cote et sa valeur (m). */
export const ECART_VALEUR = 0.08;

export const CLASSES_ANNOTATION = ["cotation", "texte", "etiquette"] as const;

/** Géométrie dérivée d'une cote : normale gauche, ligne de cote, valeur. */
export interface GeometrieCote {
  readonly longueur: number;
  readonly normale: Vec;
  readonly a2: Vec;
  readonly b2: Vec;
  readonly texte: string;
  readonly positionTexte: Vec;
}

export function geometrieCote(a: Vec, b: Vec, decalage: number, texteRemplacement?: string): GeometrieCote | null {
  const l = distance(a, b);
  if (!(l > 0)) return null;
  const n = { x: -(b.y - a.y) / l, y: (b.x - a.x) / l };
  const a2 = plus(a, fois(n, decalage));
  const b2 = plus(b, fois(n, decalage));
  const cote = { a2, b2 };
  return { longueur: l, normale: n, ...cote, texte: texteRemplacement ?? texteCote(l), positionTexte: plus(milieu(a2, b2), fois(n, decalage < 0 ? -ECART_VALEUR - HAUTEUR_TEXTE : ECART_VALEUR)) };
}

/** Formes d'une cote (ligne de cote, attaches, tirets, valeur). */
export function formesCote(a: Vec, b: Vec, decalage: number, texteRemplacement?: string): FormeDessin[] {
  const g = geometrieCote(a, b, decalage, texteRemplacement);
  if (!g) return [];
  const u = { x: (b.x - a.x) / g.longueur, y: (b.y - a.y) / g.longueur };
  const P = (v: Vec): PointLocal => versPoint(v);
  const formes: FormeDessin[] = [{ forme: "polyligne", points: [P(g.a2), P(g.b2)], fermee: false, style: "annotation" }];
  if (decalage !== 0) {
    const s = Math.sign(decalage);
    for (const [p, q] of [
      [a, g.a2],
      [b, g.b2],
    ] as const)
      formes.push({ forme: "polyligne", points: [P(p), P(plus(q, fois(g.normale, s * DEPASSEMENT_ATTACHE)))], fermee: false, style: "fin" });
  }
  const oblique = fois(plus(u, g.normale), TIRET / Math.SQRT2);
  for (const q of [g.a2, g.b2]) formes.push({ forme: "polyligne", points: [P(sous(q, oblique)), P(plus(q, oblique))], fermee: false, style: "annotation" });
  formes.push({ forme: "texte", position: P(g.positionTexte), texte: g.texte, hauteur: HAUTEUR_TEXTE, style: "annotation" });
  return formes;
}

/** Lignes d'un texte (D-019 : plusieurs lignes). */
export const lignesTexte = (t: string): string[] => t.split(/\r\n|\r|\n/);

/** Contour approché d'un texte posé en `position` (coin bas-gauche de la première ligne). */
export function contourTexte(position: Vec, texte: string, hauteur = HAUTEUR_TEXTE): PointLocal[] {
  const lignes = lignesTexte(texte);
  const largeur = Math.max(1, ...lignes.map((l) => [...l].length)) * hauteur * CHASSE;
  const bas = position.y - (lignes.length - 1) * hauteur * INTERLIGNE;
  return [pt(position.x, bas), pt(position.x + largeur, bas), pt(position.x + largeur, position.y + hauteur), pt(position.x, position.y + hauteur)];
}

const estPoint = (x: unknown): x is PointLocal => typeof x === "object" && x !== null && typeof (x as PointLocal).x === "number" && typeof (x as PointLocal).y === "number";

export function dessinerCotation(o: ObjetModele): DessinPlan | null {
  if (o.classe !== "cotation") return null;
  const { a, b, decalage, texteRemplacement } = o.params;
  if (!estPoint(a) || !estPoint(b)) return null;
  const d = typeof decalage?.value === "number" ? decalage.value : 0;
  const formes = formesCote(a, b, d, texteRemplacement);
  const g = geometrieCote(a, b, d, texteRemplacement);
  if (!g) return null;
  return { objetId: o.id, couche: "annotation", formes, segments: [{ a: versPoint(g.a2), b: versPoint(g.b2) }], points: [a, b], contour: null };
}

export function dessinerTexte(o: ObjetModele): DessinPlan | null {
  if (o.classe !== "texte" || !estPoint(o.params.position) || typeof o.params.texte !== "string") return null;
  const { position, texte } = o.params;
  return { objetId: o.id, couche: "annotation", formes: [{ forme: "texte", position, texte, hauteur: HAUTEUR_TEXTE, style: "annotation" }], segments: [], points: [position], contour: contourTexte(position, texte) };
}

/** Point d'insertion simple d'un objet étiqueté (poteau, texte, étiquette de pièce), s'il en a un. */
function pointCible(etat: EtatModele, id: string | undefined): PointLocal | null {
  const c = id ? etat.objets[id] : undefined;
  if (!c) return null;
  const p = c.params as unknown as Record<string, unknown>;
  for (const k of ["point", "position", "etiquette", "centre"]) if (estPoint(p[k])) return p[k];
  return null;
}

export function dessinerEtiquette(o: ObjetModele, etat: EtatModele): DessinPlan | null {
  if (o.classe !== "etiquette" || !estPoint(o.params.position)) return null;
  const { position, texte } = o.params;
  const formes: FormeDessin[] = [];
  const cible = pointCible(etat, o.params.objetId);
  if (cible && distance(cible, position) > 0) formes.push({ forme: "polyligne", points: [cible, position], fermee: false, style: "fin" });
  if (texte) formes.push({ forme: "texte", position, texte, hauteur: HAUTEUR_TEXTE, style: "annotation" });
  else formes.push({ forme: "cercle", centre: position, rayon: HAUTEUR_TEXTE / 2, style: "annotation" });
  return { objetId: o.id, couche: "annotation", formes, segments: [], points: [position], contour: texte ? contourTexte(position, texte) : null };
}

export const DESSINATEUR_ANNOTATIONS: DessinateurPlan = {
  classes: [...CLASSES_ANNOTATION],
  dessiner(o, etat) {
    switch (o.classe) {
      case "cotation":
        return dessinerCotation(o);
      case "texte":
        return dessinerTexte(o);
      case "etiquette":
        return dessinerEtiquette(o, etat);
      default:
        return null;
    }
  },
};
