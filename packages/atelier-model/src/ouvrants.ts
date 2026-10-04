/**
 * Sens d'ouverture des portes (D-037). Une porte peut porter `ouvrant` : la **charnière** au début (côté a du mur
 * hôte) ou à la fin (côté b) de la baie, et le **côté** du mur vers lequel le battant s'ouvre (face gauche ou face
 * droite du mur, sens a → b). Sans `ouvrant`, le sens n'est pas renseigné : les dessins suivent la convention de
 * l'Atelier (charnière au début, ouverture côté gauche) et le disent ; l'IFC n'écrit pas d'`OperationType`.
 *
 * Géométrie pure, en repère local du projet ; rien ne dépend de React ni du DOM.
 */
import { ErreurCommande } from "./commandes/base.js";
import { add, cross, facesMur, mul, normalise, perp, sub, type Vec } from "./geometrie.js";
import type { ModeleAtelier, Occurrence } from "./modele.js";

export interface OuvrantPorte {
  charniere: "debut" | "fin";
  cote: "gauche" | "droite";
}

export const OUVRANT_CONVENTION: Readonly<OuvrantPorte> = { charniere: "debut", cote: "gauche" };

/** Lecture validée de `params.ouvrant` (absent ou null : non renseigné). */
export function lireOuvrant(brut: unknown, chemin = "params.ouvrant"): OuvrantPorte | null {
  if (brut === undefined || brut === null) return null;
  const b = brut as Record<string, unknown>;
  if (typeof brut !== "object" || Array.isArray(brut) || (b["charniere"] !== "debut" && b["charniere"] !== "fin") || (b["cote"] !== "gauche" && b["cote"] !== "droite")) {
    throw new ErreurCommande("invalide", chemin, "ouvrant : { charniere: « debut » | « fin », cote: « gauche » | « droite » } ou null");
  }
  return { charniere: b["charniere"], cote: b["cote"] };
}

export interface BattantPorte {
  /** Point de rotation (sur la face du côté de l'ouverture). */
  charniere: Vec;
  /** Direction du battant fermé (vers l'autre tableau) et du battant ouvert à 90°. */
  ferme: Vec;
  ouvert: Vec;
  largeur: number;
  /** Arc de débattement : angles (degrés) de début et de fin, sens direct, 90° d'ouverture. */
  arc: [number, number];
  /** Faux quand le sens n'est pas renseigné (convention de l'Atelier appliquée). */
  explicite: boolean;
  ouvrant: OuvrantPorte;
}

/** Battant d'une porte dans le plan (null si le mur hôte est introuvable ou de longueur nulle). */
export function battantPorte(etat: ModeleAtelier, porte: Occurrence<"porte">): BattantPorte | null {
  const hote = etat.objets[porte.params.murHoteId];
  if (!hote || hote.classe !== "mur") return null;
  const { a, b, epaisseur, alignement } = hote.params;
  if (Math.hypot(b.x - a.x, b.y - a.y) < 1e-9) return null;
  const u = normalise(sub(b, a));
  const n = perp(u);
  const f = facesMur(a, b, epaisseur.value, alignement);
  const ouvrant = porte.params.ouvrant ?? OUVRANT_CONVENTION;
  const w = porte.params.largeur.value;
  const c = add(a, mul(sub(b, a), porte.params.position));
  const jambage = add(c, mul(u, ouvrant.charniere === "debut" ? -w / 2 : w / 2));
  // Décalage de la face du côté de l'ouverture, depuis l'axe du mur (selon n).
  const face = ouvrant.cote === "gauche" ? f.gauche[0] : f.droite[0];
  const o = (face.x - a.x) * n.x + (face.y - a.y) * n.y;
  const charniere = add(jambage, mul(n, o));
  const ferme = ouvrant.charniere === "debut" ? u : mul(u, -1);
  const ouvert = ouvrant.cote === "gauche" ? n : mul(n, -1);
  const deg = (v: Vec) => ((((Math.atan2(v.y, v.x) * 180) / Math.PI) % 360) + 360) % 360;
  const debut = cross(ferme, ouvert) > 0 ? deg(ferme) : deg(ouvert);
  return { charniere, ferme, ouvert, largeur: w, arc: [debut, debut + 90], explicite: !!porte.params.ouvrant, ouvrant };
}
