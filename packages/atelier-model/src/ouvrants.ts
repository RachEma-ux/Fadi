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
  /**
   * Nature du vantail (D-047) : battante (absent), double (deux vantaux battants, la charnière est sans objet),
   * coulissante (le vantail glisse vers la charnière — début ou fin —, côté de pose = `cote`).
   */
  type?: "battante" | "double" | "coulissante";
}

export const OUVRANT_CONVENTION: Readonly<OuvrantPorte> = { charniere: "debut", cote: "gauche" };

/** Lecture validée de `params.ouvrant` (absent ou null : non renseigné). */
export function lireOuvrant(brut: unknown, chemin = "params.ouvrant"): OuvrantPorte | null {
  if (brut === undefined || brut === null) return null;
  const b = brut as Record<string, unknown>;
  if (typeof brut !== "object" || Array.isArray(brut) || (b["charniere"] !== "debut" && b["charniere"] !== "fin") || (b["cote"] !== "gauche" && b["cote"] !== "droite") || (b["type"] !== undefined && b["type"] !== "battante" && b["type"] !== "double" && b["type"] !== "coulissante")) {
    throw new ErreurCommande("invalide", chemin, "ouvrant : { charniere: « debut » | « fin », cote: « gauche » | « droite », type?: « battante » | « double » | « coulissante » } ou null");
  }
  const type = b["type"] as OuvrantPorte["type"];
  return { charniere: b["charniere"], cote: b["cote"], ...(type && type !== "battante" ? { type } : {}) };
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

/**
 * Symbole en plan d'une porte (D-047) : traits (polylignes, repère local) selon la nature du vantail — battante
 * (vantail ouvert à 90° et arc), double (deux demi-vantaux et deux arcs), coulissante (vantail le long du mur,
 * décalé du côté de pose, et flèche vers la charnière). `arcs` sont les traits à dessiner en trait fin.
 */
export function symbolePorte(etat: ModeleAtelier, porte: Occurrence<"porte">): { vantaux: Vec[][]; arcs: Vec[][]; explicite: boolean } | null {
  const b = battantPorte(etat, porte);
  if (!b) return null;
  const arc = (centre: Vec, r: number, a0: number) => {
    const out: Vec[] = [];
    for (let k = 0; k <= 16; k++) {
      const t = ((a0 + (90 * k) / 16) * Math.PI) / 180;
      out.push({ x: centre.x + r * Math.cos(t), y: centre.y + r * Math.sin(t) });
    }
    return out;
  };
  const deg = (v: Vec) => (Math.atan2(v.y, v.x) * 180) / Math.PI;
  const type = b.ouvrant.type ?? "battante";
  if (type === "double") {
    const w = b.largeur / 2;
    const autre = add(b.charniere, mul(b.ferme, b.largeur));
    const v1 = [b.charniere, add(b.charniere, mul(b.ouvert, w))];
    const v2 = [autre, add(autre, mul(b.ouvert, w))];
    const ferme2 = mul(b.ferme, -1);
    const a1 = cross(b.ferme, b.ouvert) > 0 ? deg(b.ferme) : deg(b.ouvert);
    const a2 = cross(ferme2, b.ouvert) > 0 ? deg(ferme2) : deg(b.ouvert);
    return { vantaux: [v1, v2], arcs: [arc(b.charniere, w, a1), arc(autre, w, a2)], explicite: b.explicite };
  }
  if (type === "coulissante") {
    // Vantail : le long de la baie, légèrement en retrait de la face de pose ; flèche vers la charnière (sens d'ouverture).
    const retrait = mul(b.ouvert, -0.03);
    const debut = add(b.charniere, retrait);
    const fin = add(debut, mul(b.ferme, b.largeur));
    const milieu = add(debut, mul(b.ferme, b.largeur / 2));
    const pointe = add(milieu, mul(b.ferme, -b.largeur / 4));
    const aile = (s: number) => add(add(pointe, mul(b.ferme, b.largeur / 12)), mul(b.ouvert, (s * b.largeur) / 16));
    return { vantaux: [[debut, fin]], arcs: [[milieu, pointe], [aile(1), pointe, aile(-1)]], explicite: b.explicite };
  }
  return { vantaux: [[b.charniere, add(b.charniere, mul(b.ouvert, b.largeur))]], arcs: [arc(b.charniere, b.largeur, b.arc[0])], explicite: b.explicite };
}

