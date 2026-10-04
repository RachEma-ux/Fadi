/**
 * Composition des parois (D-026) : un type de mur (définition de classe `mur`) peut porter ses couches, de la face
 * gauche à la face droite du mur (sens a → b). Chaque couche a un matériau nommé par l'utilisateur et une épaisseur ;
 * rien n'est supposé (R3) : sans couches, la composition est « non renseignée ».
 *
 * Une composition est **cohérente** avec un mur quand la somme des couches égale son épaisseur (± 1 mm) ; sinon le
 * mur est signalé (« composition incohérente »), jamais corrigé en silence, et ni ses séparations de couches ni son
 * jeu de matériaux IFC ne sont produits.
 */
import { ErreurCommande } from "./commandes/base.js";
import { add, mul, normalise, perp, sub, type Vec } from "./geometrie.js";
import type { ModeleAtelier, Occurrence } from "./modele.js";
import { raccordMur } from "./raccords.js";
import type { Longueur } from "./unites.js";

export const FONCTIONS_COUCHE = ["porteur", "isolant", "etancheite", "parement", "lame-air", "autre"] as const;
export type FonctionCouche = (typeof FONCTIONS_COUCHE)[number];

export interface CoucheParoi {
  materiau: string;
  epaisseur: Longueur;
  fonction: FonctionCouche | null;
}

export const TOLERANCE_COMPOSITION = 0.001;

/** Lecture validée des couches d'un type de mur (`params.couches`) ; null quand elles sont absentes. */
export function lireCouches(brut: unknown, chemin = "params.couches"): CoucheParoi[] | null {
  if (brut === undefined || brut === null) return null;
  if (!Array.isArray(brut) || brut.length < 1 || brut.length > 12) throw new ErreurCommande("invalide", chemin, "couches : liste de 1 à 12 couches { materiau, epaisseur, fonction }");
  return brut.map((c, i) => {
    const b = (c ?? {}) as Record<string, unknown>;
    const materiau = typeof b["materiau"] === "string" ? b["materiau"].trim() : "";
    if (!materiau || materiau.length > 80) throw new ErreurCommande("invalide", `${chemin}[${i}].materiau`, "matériau requis (80 caractères au plus)");
    const e = b["epaisseur"] as { value?: unknown; unit?: unknown } | undefined;
    if (!e || typeof e.value !== "number" || !Number.isFinite(e.value) || e.value <= 0 || e.value > 2 || (e.unit !== undefined && e.unit !== "m")) throw new ErreurCommande("invalide", `${chemin}[${i}].epaisseur`, "épaisseur en mètres, strictement positive, 2 m au plus");
    const f = b["fonction"];
    if (f !== undefined && f !== null && !(FONCTIONS_COUCHE as readonly string[]).includes(f as string)) throw new ErreurCommande("invalide", `${chemin}[${i}].fonction`, `fonction : ${FONCTIONS_COUCHE.join(", ")}`);
    return { materiau, epaisseur: { value: e.value, unit: "m" }, fonction: (f as FonctionCouche | undefined) ?? null };
  });
}

export interface CompositionMur {
  typeId: string;
  typeNom: string;
  couches: CoucheParoi[];
  total: number;
  coherente: boolean;
  /** Épaisseur du mur moins la somme des couches (m). */
  ecart: number;
}

/** Composition du type d'un mur, avec sa cohérence ; null si le mur n'a pas de type composé. */
export function compositionMur(etat: ModeleAtelier, mur: Occurrence<"mur">): CompositionMur | null {
  const d = mur.definitionId ? etat.definitions[mur.definitionId] : undefined;
  if (!d || d.classe !== "mur") return null;
  let couches: CoucheParoi[] | null;
  try {
    couches = lireCouches(d.params["couches"]);
  } catch {
    return null;
  }
  if (!couches) return null;
  const total = Math.round(couches.reduce((s, c) => s + c.epaisseur.value, 0) * 1e6) / 1e6;
  const ecart = Math.round((mur.params.epaisseur.value - total) * 1e6) / 1e6;
  return { typeId: d.id, typeNom: d.nom, couches, total, coherente: Math.abs(ecart) <= TOLERANCE_COMPOSITION, ecart };
}

/**
 * Séparations entre couches d'un mur cohérent (segments en repère local, sens a → b), aux extrémités raccordées :
 * chaque séparation va de l'extrémité de la face gauche à celle de la face droite, interpolée selon sa position.
 */
export function separationsCouches(etat: ModeleAtelier, mur: Occurrence<"mur">, vides: readonly [number, number][] = []): { a: Vec; b: Vec }[] {
  const c = compositionMur(etat, mur);
  if (!c || !c.coherente || c.couches.length < 2) return [];
  const { a, b, epaisseur, alignement } = mur.params;
  const L = Math.hypot(b.x - a.x, b.y - a.y);
  if (L < 1e-9) return [];
  const u = normalise(sub(b, a));
  const n = perp(u);
  const e = epaisseur.value;
  const oG = alignement === "axe" ? e / 2 : alignement === "gauche" ? 0 : e;
  const r = raccordMur(etat, mur) ?? { gauche: [0, L], droite: [0, L] };
  const out: { a: Vec; b: Vec }[] = [];
  let cumul = 0;
  for (let i = 0; i + 1 < c.couches.length; i++) {
    cumul += c.couches[i]!.epaisseur.value;
    const t = cumul / e; // 0 = face gauche, 1 = face droite
    const o = oG - cumul;
    const s0 = r.gauche[0] + (r.droite[0] - r.gauche[0]) * t;
    const s1 = r.gauche[1] + (r.droite[1] - r.gauche[1]) * t;
    // Morceaux hors des vides (abscisses le long de l'axe, baies coupées par le plan de la vue).
    let morceaux: [number, number][] = [[s0, s1]];
    for (const [v0, v1] of vides) {
      const suite: [number, number][] = [];
      for (const [x0, x1] of morceaux) {
        if (v1 <= x0 || v0 >= x1) suite.push([x0, x1]);
        else {
          if (v0 > x0) suite.push([x0, v0]);
          if (v1 < x1) suite.push([v1, x1]);
        }
      }
      morceaux = suite;
    }
    for (const [x0, x1] of morceaux) if (x1 - x0 > 1e-6) out.push({ a: add(add(a, mul(u, x0)), mul(n, o)), b: add(add(a, mul(u, x1)), mul(n, o)) });
  }
  return out;
}
