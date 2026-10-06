/**
 * Baies cintrées (D-141, DA-07-04) : le haut d'une porte, d'une fenêtre ou d'une baie libre peut être un arc.
 * `hauteur` reste la hauteur totale de la baie (de l'allège à la clé) ; la flèche `f` est la montée de l'arc
 * au-dessus des naissances (à `hauteur − f`).
 *
 * - plein cintre : demi-cercle, f = largeur / 2 ;
 * - surbaissé : arc de cercle de flèche saisie, 0 < f < largeur / 2 ;
 * - ogive (arc brisé équilatéral) : deux arcs de rayon la largeur, f = largeur × √3 / 2.
 *
 * Aucune valeur par défaut : sans cintre, la baie est rectangulaire. Géométrie pure (ni React ni DOM).
 */
import { ErreurCommande } from "./commandes/base.js";
import type { Longueur } from "./unites.js";

export const TYPES_CINTRE = ["plein-cintre", "surbaisse", "ogive"] as const;
export type TypeCintre = (typeof TYPES_CINTRE)[number];
export interface Cintre {
  type: TypeCintre;
  /** Surbaissé seulement : montée de l'arc au-dessus des naissances (m). */
  fleche?: Longueur;
}

export const LIBELLES_CINTRE: Record<TypeCintre, string> = { "plein-cintre": "plein cintre", surbaisse: "surbaissé", ogive: "ogive" };

/** Montée de l'arc (m). */
export function flecheCintre(c: Cintre, largeur: number): number {
  if (c.type === "plein-cintre") return largeur / 2;
  if (c.type === "ogive") return (largeur * Math.sqrt(3)) / 2;
  return c.fleche?.value ?? 0;
}

/** Lecture et contrôle : null ou absent = baie rectangulaire. */
export function lireCintre(v: unknown, largeur: number, hauteur: number): Cintre | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== "object") throw new ErreurCommande("invalide", "cintre", "cintre : objet { type, fleche? } attendu");
  const b = v as Record<string, unknown>;
  const type = b["type"];
  if (typeof type !== "string" || !(TYPES_CINTRE as readonly string[]).includes(type)) throw new ErreurCommande("invalide", "cintre.type", `type de cintre inconnu : ${String(type)} (plein-cintre, surbaisse, ogive)`);
  let c: Cintre = { type: type as TypeCintre };
  if (type === "surbaisse") {
    const f = b["fleche"] as Longueur | undefined;
    if (!f || typeof f !== "object" || f.unit !== "m" || typeof f.value !== "number" || !Number.isFinite(f.value)) throw new ErreurCommande("invalide", "cintre.fleche", "arc surbaissé : flèche { value, unit: \"m\" } requise");
    if (!(f.value > 0) || !(f.value < largeur / 2)) throw new ErreurCommande("invalide", "cintre.fleche", `arc surbaissé : flèche entre 0 et la demi-largeur (${largeur / 2} m) exclues`);
    c = { type: "surbaisse", fleche: { value: f.value, unit: "m" } };
  } else if (b["fleche"] !== undefined && b["fleche"] !== null) throw new ErreurCommande("invalide", "cintre.fleche", "flèche réservée à l'arc surbaissé (plein cintre et ogive : flèche déduite de la largeur)");
  const f = flecheCintre(c, largeur);
  if (f > hauteur + 1e-9) throw new ErreurCommande("invalide", "cintre", `la montée de l'arc (${Math.round(f * 1000) / 1000} m) dépasse la hauteur de la baie (${hauteur} m)`);
  return c;
}

/** Points de l'arc, de la naissance droite (s = largeur) à la naissance gauche (s = 0) ; s le long de la baie, z depuis l'allège. */
export function arcCintre(c: Cintre, largeur: number, hauteur: number, pas = 24): { s: number; z: number }[] {
  const w = largeur;
  const f = flecheCintre(c, w);
  const zn = hauteur - f;
  const pts: { s: number; z: number }[] = [];
  if (c.type === "ogive") {
    // Moitié droite : centre à la naissance gauche, rayon w, de 0° à 60° ; moitié gauche symétrique.
    const n = Math.max(2, Math.round(pas / 2));
    for (let k = 0; k <= n; k++) {
      const a = ((Math.PI / 3) * k) / n;
      pts.push({ s: w * Math.cos(a), z: zn + w * Math.sin(a) });
    }
    for (let k = n - 1; k >= 0; k--) {
      const a = ((Math.PI / 3) * k) / n;
      pts.push({ s: w - w * Math.cos(a), z: zn + w * Math.sin(a) });
    }
    return pts;
  }
  // Arc de cercle de corde w et de flèche f : rayon R = (w²/4 + f²) / 2f, centre sous la clé.
  const R = (w * w) / 4 / (2 * f) + f / 2;
  const zc = hauteur - R;
  const a0 = Math.atan2(zn - zc, w / 2);
  for (let k = 0; k <= pas; k++) {
    const a = a0 + ((Math.PI - 2 * a0) * k) / pas;
    pts.push({ s: w / 2 + R * Math.cos(a), z: zc + R * Math.sin(a) });
  }
  pts[0] = { s: w, z: zn };
  pts[pts.length - 1] = { s: 0, z: zn };
  return pts;
}

/** Profil fermé de la baie en élévation (sens trigonométrique) : allège, tableaux jusqu'aux naissances, arc. */
export function profilBaie(c: Cintre | null | undefined, largeur: number, hauteur: number): { s: number; z: number }[] {
  if (!c) return [{ s: 0, z: 0 }, { s: largeur, z: 0 }, { s: largeur, z: hauteur }, { s: 0, z: hauteur }];
  // Arc qui naît à l'allège (montée = hauteur) : les naissances confondues avec les coins sont retirées.
  const brut = [{ s: 0, z: 0 }, { s: largeur, z: 0 }, ...arcCintre(c, largeur, hauteur)];
  return brut.filter((p, i, l) => { const q = l[(i + l.length - 1) % l.length]!; return Math.hypot(p.s - q.s, p.z - q.z) > 1e-12; });
}

/** Aire de la baie en élévation (m²). */
export function aireBaie(c: Cintre | null | undefined, largeur: number, hauteur: number): number {
  const p = profilBaie(c, largeur, hauteur);
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const q = p[i]!;
    const r = p[(i + 1) % p.length]!;
    a += q.s * r.z - r.s * q.z;
  }
  return Math.abs(a) / 2;
}
