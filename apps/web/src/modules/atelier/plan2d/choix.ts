/**
 * Sélection dans le plan (L3a.2) : objet sous le pointeur, lasso rectangulaire, filtre par classe. Fonctions
 * pures sur les `DessinPlan` du niveau ; le magasin de sélection reste celui du socle (`SelectionAtelier`).
 */
import { CLASSES_ESQUISSE, type EtatModele, type IdObjet } from "@parcours/atelier-model";
import type { DessinPlan, ModeSelection } from "../socle";
import { pointsDeForme } from "./dessinateurs";
import { coinsRectangle, dansRectangle, distanceSegment, pointDansPolygone, rectangleDe, segmentsDe, segmentToucheRectangle, type Rectangle, type Vec } from "./geometrie";

const RANG_COUCHE: Record<DessinPlan["couche"], number> = { annotation: 0, objet: 1, fond: 2 };

/**
 * Objet touché en `p` (m) : distance aux segments ≤ `tolerance` (aux traits des formes pour un dessin sans
 * contour), ou intérieur du contour. Le plus proche
 * l'emporte ; à égalité, la couche du dessus (annotation, objet, fond), puis l'identifiant.
 */
export function objetSousPointeur(dessins: readonly DessinPlan[], p: Vec, tolerance: number, admis?: (id: IdObjet) => boolean): IdObjet | null {
  let meilleur: { id: IdObjet; d: number; rang: number } | null = null;
  for (const d of dessins) {
    if (admis && !admis(d.objetId)) continue;
    let dist = Infinity;
    for (const s of d.segments) dist = Math.min(dist, distanceSegment(s, p));
    for (const q of d.points) dist = Math.min(dist, Math.hypot(q.x - p.x, q.y - p.y));
    // Un dessin qui déclare un contour se touche par ses segments, ses points et son intérieur : les traits de
    // ses formes (bord d'une pièce, sur l'axe des murs) ne doivent pas voler le clic à l'objet voisin.
    if (dist > tolerance && !d.contour) dist = Math.min(dist, distanceFormes(d, p));
    if (dist > tolerance && d.contour && d.contour.length >= 3 && pointDansPolygone(p, d.contour)) dist = tolerance;
    if (dist > tolerance) continue;
    const rang = RANG_COUCHE[d.couche];
    if (!meilleur || dist < meilleur.d - 1e-12 || (Math.abs(dist - meilleur.d) <= 1e-12 && (rang < meilleur.rang || (rang === meilleur.rang && d.objetId < meilleur.id)))) meilleur = { id: d.objetId, d: dist, rang };
  }
  return meilleur?.id ?? null;
}

/** Distance aux traits dessinés (courbes sans segments d'accrochage : arcs, cercles, splines). */
function distanceFormes(d: DessinPlan, p: Vec): number {
  let dist = Infinity;
  for (const f of d.formes) {
    if (f.forme === "texte") continue;
    const { points, ferme } = pointsDeForme(f);
    for (const s of segmentsDe(points, ferme)) dist = Math.min(dist, distanceSegment(s, p));
  }
  return dist;
}

function sommetsDe(d: DessinPlan): Vec[] {
  return [...d.segments.flatMap((s) => [s.a, s.b]), ...d.points, ...(d.contour ?? []), ...d.formes.flatMap((f) => pointsDeForme(f).points)];
}

/** Entièrement inclus dans le rectangle (lasso de gauche à droite). */
export function inclusDans(d: DessinPlan, r: Rectangle): boolean {
  const s = sommetsDe(d);
  return s.length > 0 && s.every((p) => dansRectangle(r, p));
}

/** Touché par le rectangle (lasso de droite à gauche) : un segment ou un point dedans, ou le rectangle dans le contour. */
export function toucheParRectangle(d: DessinPlan, r: Rectangle): boolean {
  if (d.segments.some((s) => segmentToucheRectangle(r, s))) return true;
  if (d.points.some((p) => dansRectangle(r, p))) return true;
  if (d.formes.some((f) => f.forme !== "texte" && segmentsDe(pointsDeForme(f).points, pointsDeForme(f).ferme).some((s) => segmentToucheRectangle(r, s)))) return true;
  const c = d.contour;
  if (c && c.length >= 3) {
    if (c.some((p) => dansRectangle(r, p))) return true;
    if (coinsRectangle(r).some((p) => pointDansPolygone(p, c))) return true;
  }
  return false;
}

/**
 * Lasso de `depart` à `arrivee` (m). De gauche à droite (`arrivee.x ≥ depart.x`) : objets entièrement inclus ;
 * de droite à gauche : objets touchés (conventions habituelles des logiciels de DAO).
 */
export function lasso(dessins: readonly DessinPlan[], depart: Vec, arrivee: Vec, admis?: (id: IdObjet) => boolean): IdObjet[] {
  const r = rectangleDe(depart, arrivee);
  const fenetre = arrivee.x >= depart.x;
  return dessins.filter((d) => (!admis || admis(d.objetId)) && (fenetre ? inclusDans(d, r) : toucheParRectangle(d, r))).map((d) => d.objetId);
}

export const sensLasso = (depart: Vec, arrivee: Vec): "inclus" | "touches" => (arrivee.x >= depart.x ? "inclus" : "touches");

/** Mode de sélection d'un clic : Maj = ajouter (cahier : « Maj = ajouter »), Ctrl = basculer. */
export function modeClic(m: { readonly maj: boolean; readonly ctrl: boolean }): ModeSelection {
  return m.maj ? "ajouter" : m.ctrl ? "basculer" : "remplacer";
}

// ---------------------------------------------------------------------------------------------------------------
// Filtre par classe
// ---------------------------------------------------------------------------------------------------------------

/** Groupes proposés par le filtre : toutes les esquisses ensemble (filtre « Esquisse », DA-01-09), le reste par classe. */
export const GROUPE_ESQUISSE = "esquisse";

export const LIBELLES_CLASSE: Readonly<Record<string, string>> = {
  [GROUPE_ESQUISSE]: "Esquisses",
  mur: "Murs",
  porte: "Portes",
  fenetre: "Fenêtres",
  ouverture: "Ouvertures",
  dalle: "Dalles",
  toiture: "Toitures",
  escalier: "Escaliers",
  poteau: "Poteaux",
  piece: "Pièces",
  espace: "Espaces",
  zone: "Zones",
  solide: "Solides",
  "reference-plan": "Références de plan",
  cotation: "Cotations",
  texte: "Textes",
  etiquette: "Étiquettes",
};

export const groupeDeClasse = (classe: string): string => ((CLASSES_ESQUISSE as readonly string[]).includes(classe) ? GROUPE_ESQUISSE : classe);

/** Filtre : `null` = toutes les classes ; sinon les groupes admis. */
export type FiltreClasses = ReadonlySet<string> | null;

/** Groupes présents parmi les dessins du niveau, triés par libellé. */
export function groupesPresents(dessins: readonly DessinPlan[], etat: EtatModele): string[] {
  const g = new Set<string>();
  for (const d of dessins) {
    const o = etat.objets[d.objetId];
    if (o) g.add(groupeDeClasse(o.classe));
  }
  return [...g].sort((a, b) => (LIBELLES_CLASSE[a] ?? a).localeCompare(LIBELLES_CLASSE[b] ?? b, "fr"));
}

/** Prédicat d'admission d'un objet par le filtre. */
export function admisParFiltre(etat: EtatModele, filtre: FiltreClasses): (id: IdObjet) => boolean {
  if (filtre === null) return () => true;
  return (id) => {
    const o = etat.objets[id];
    return o !== undefined && filtre.has(groupeDeClasse(o.classe));
  };
}

/** Garde les identifiants admis par le filtre (ordre conservé). */
export function filtrerParClasse(ids: readonly IdObjet[], etat: EtatModele, filtre: FiltreClasses): IdObjet[] {
  const admis = admisParFiltre(etat, filtre);
  return ids.filter(admis);
}

/** Bascule un groupe dans le filtre ; un filtre qui admettrait tous les groupes présents redevient `null`. */
export function basculerGroupe(filtre: FiltreClasses, groupe: string, presents: readonly string[]): FiltreClasses {
  const s = new Set(filtre ?? presents);
  if (s.has(groupe)) s.delete(groupe);
  else s.add(groupe);
  return presents.every((g) => s.has(g)) ? null : s;
}
