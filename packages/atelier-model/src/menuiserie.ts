/**
 * Menuiserie paramétrée d'une fenêtre (D-101, DA-07-03) : dormant (profil vu de face × profondeur), vitrage
 * (épaisseur, composition déclarée) et nombre de vantaux séparés par des montants de la largeur du dormant.
 * Toutes les valeurs sont saisies : aucune n'a de défaut ; absente, la fenêtre reste un panneau simple (« non évaluée »).
 * Pur : lecture validée, corps 3D (boîtes en abscisse le long de la baie, altitude et profondeur) et traits du plan.
 */
import type { Vec } from "./geometrie.js";
import { ErreurCommande, lire } from "./commandes/base.js";
import type { Longueur } from "./unites.js";

type Brut = Record<string, unknown>;

export interface Menuiserie {
  /** Dormant : largeur du profil vue de face et profondeur (épaisseur dans le mur). */
  dormant?: { largeur: Longueur; epaisseur: Longueur };
  /** Vitrage : épaisseur totale et composition déclarée (« 4/16/4 »), ou null. */
  vitrage?: { epaisseur: Longueur; composition: string | null };
  /** Nombre de vantaux (1 à 6) ; plus d'un : exige un dormant (largeur des montants). */
  vantaux?: number;
}

/** Lecture validée ; `null` / absent : pas de menuiserie paramétrée. */
export function lireMenuiserie(brut: unknown, c: { largeur: number; hauteur: number; epaisseurMur: number }): Menuiserie | null {
  if (brut === undefined || brut === null) return null;
  if (typeof brut !== "object" || Array.isArray(brut)) throw new ErreurCommande("invalide", "menuiserie", "menuiserie : objet { dormant, vitrage, vantaux }");
  const p = brut as Brut;
  const out: Menuiserie = {};
  if (p["dormant"] !== undefined && p["dormant"] !== null) {
    const d = p["dormant"] as Brut;
    const largeur = lire.longueur(d, "largeur", { strict: true })!;
    const epaisseur = lire.longueur(d, "epaisseur", { strict: true })!;
    if (!(largeur.value > 0) || 2 * largeur.value >= Math.min(c.largeur, c.hauteur)) throw new ErreurCommande("invalide", "menuiserie.dormant.largeur", `profil du dormant entre 0 et la moitié de la baie (${c.largeur} × ${c.hauteur} m)`);
    if (!(epaisseur.value > 0) || epaisseur.value > c.epaisseurMur + 1e-9) throw new ErreurCommande("invalide", "menuiserie.dormant.epaisseur", `profondeur du dormant entre 0 et l'épaisseur du mur (${c.epaisseurMur} m)`);
    out.dormant = { largeur, epaisseur };
  }
  if (p["vitrage"] !== undefined && p["vitrage"] !== null) {
    const v = p["vitrage"] as Brut;
    const epaisseur = lire.longueur(v, "epaisseur", { strict: true })!;
    const limite = out.dormant?.epaisseur.value ?? c.epaisseurMur;
    if (!(epaisseur.value > 0) || epaisseur.value > limite + 1e-9) throw new ErreurCommande("invalide", "menuiserie.vitrage.epaisseur", `épaisseur du vitrage entre 0 et ${limite} m (${out.dormant ? "profondeur du dormant" : "épaisseur du mur"})`);
    const brutComposition = v["composition"];
    const composition = typeof brutComposition === "string" && brutComposition.trim() ? brutComposition.trim() : null;
    if (composition && composition.length > 40) throw new ErreurCommande("invalide", "menuiserie.vitrage.composition", "composition : 40 caractères au plus");
    out.vitrage = { epaisseur, composition };
  }
  if (p["vantaux"] !== undefined && p["vantaux"] !== null) {
    const n = lire.nombre(p, "vantaux", { entier: true, min: 1, max: 6 })!;
    if (n > 1) {
      if (!out.dormant) throw new ErreurCommande("precondition", "menuiserie.vantaux", "plusieurs vantaux : renseigner le dormant (largeur des montants)");
      const l = out.dormant.largeur.value;
      const w = (c.largeur - 2 * l - (n - 1) * l) / n;
      if (!(w > 0.05)) throw new ErreurCommande("precondition", "menuiserie.vantaux", `vantaux trop étroits (${Math.round(w * 1000) / 1000} m chacun)`);
    }
    out.vantaux = n;
  }
  return Object.keys(out).length ? out : null;
}

/** Boîte de menuiserie : abscisse le long de la baie [s0, s1], altitude depuis le bas de la baie [z0, z1], profondeur ±e/2. */
export interface BoiteMenuiserie {
  role: "dormant" | "montant" | "vitrage";
  s0: number;
  s1: number;
  z0: number;
  z1: number;
  e: number;
}

/** Corps de la fenêtre : dormant (montants, appui, traverse haute), montants entre vantaux, un vitrage par vantail. */
export function corpsMenuiserie(largeur: number, hauteur: number, m: Menuiserie, epaisseurPanneau: number): BoiteMenuiserie[] {
  const out: BoiteMenuiserie[] = [];
  const ev = m.vitrage?.epaisseur.value ?? epaisseurPanneau;
  if (!m.dormant) {
    out.push({ role: "vitrage", s0: 0, s1: largeur, z0: 0, z1: hauteur, e: ev });
    return out;
  }
  const l = m.dormant.largeur.value;
  const e = m.dormant.epaisseur.value;
  out.push({ role: "dormant", s0: 0, s1: l, z0: 0, z1: hauteur, e }, { role: "dormant", s0: largeur - l, s1: largeur, z0: 0, z1: hauteur, e });
  out.push({ role: "dormant", s0: l, s1: largeur - l, z0: 0, z1: l, e }, { role: "dormant", s0: l, s1: largeur - l, z0: hauteur - l, z1: hauteur, e });
  const n = m.vantaux ?? 1;
  const w = (largeur - 2 * l - (n - 1) * l) / n;
  for (let i = 0; i < n; i++) {
    const s0 = l + i * (w + l);
    out.push({ role: "vitrage", s0, s1: s0 + w, z0: l, z1: hauteur - l, e: ev });
    if (i + 1 < n) out.push({ role: "montant", s0: s0 + w, s1: s0 + w + l, z0: l, z1: hauteur - l, e });
  }
  return out;
}

/**
 * Traits du plan (vue de dessus) : rectangles des montants du dormant et des montants entre vantaux, dans la
 * profondeur du dormant, centrés sur `centre` (point de l'axe médian du mur au début de la baie), `u` le long du mur,
 * `n` en travers. Vide sans dormant.
 */
export function traitsMenuiseriePlan(centre: Vec, u: Vec, n: Vec, largeur: number, m: Menuiserie): Vec[][] {
  if (!m.dormant) return [];
  const e = m.dormant.epaisseur.value / 2;
  const at = (s: number, o: number): Vec => ({ x: centre.x + u.x * s + n.x * o, y: centre.y + u.y * s + n.y * o });
  // Montants du dormant et entre vantaux (l'appui et la traverse haute ne se voient pas en coupe horizontale).
  return corpsMenuiserie(largeur, 1, m, 0)
    .filter((b) => b.role === "montant" || (b.role === "dormant" && (b.s0 === 0 || b.s1 === largeur)))
    .map((b) => [at(b.s0, -e), at(b.s1, -e), at(b.s1, e), at(b.s0, e)]);
}
