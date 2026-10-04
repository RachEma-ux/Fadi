/**
 * Grille d'axes numérotée — trame (D-046), pure. Depuis une origine, des entraxes en x et en y (saisis, jamais
 * supposés) : une ligne de construction par axe, dépassant la grille d'une longueur saisie, et un repère texte à
 * chaque extrémité basse ou gauche (x : 1, 2, 3… ; y : A, B, C… — ou l'inverse au choix). Le tout dans un groupe.
 */
import type { Commande } from "../commandes/index.js";
import { pt, type Point2 } from "../unites.js";

export interface OptionsTrame {
  niveauId: string;
  origine: Point2;
  entraxesX: number[];
  entraxesY: number[];
  depassement: number;
  reperesX: "chiffres" | "lettres";
  calqueId?: string | null;
  nom?: string;
}

const lettre = (k: number): string => (k < 26 ? String.fromCharCode(65 + k) : lettre(Math.floor(k / 26) - 1) + String.fromCharCode(65 + (k % 26)));

export function commandesTrame(o: OptionsTrame, idBase: string): Commande[] {
  if (!o.entraxesX.length && !o.entraxesY.length) throw new Error("Renseignez au moins un entraxe.");
  if (!(o.depassement >= 0)) throw new Error("Dépassement : longueur positive ou nulle.");
  const xs = [0, ...o.entraxesX.map((_, i) => o.entraxesX.slice(0, i + 1).reduce((s, d) => s + d, 0))];
  const ys = [0, ...o.entraxesY.map((_, i) => o.entraxesY.slice(0, i + 1).reduce((s, d) => s + d, 0))];
  const r = (v: number) => Math.round(v * 1e9) / 1e9;
  const P = (x: number, y: number) => pt(r(o.origine.x + x), r(o.origine.y + y));
  const L = xs[xs.length - 1]!;
  const H = ys[ys.length - 1]!;
  const d = o.depassement;
  const commandes: Commande[] = [];
  const ids: string[] = [];
  const base = { niveauId: o.niveauId, ...(o.calqueId ? { calqueId: o.calqueId } : {}) };
  const ajouter = (type: string, params: Record<string, unknown>) => {
    const id = `${idBase}-${ids.length + 1}`;
    ids.push(id);
    commandes.push({ type, params: { id, ...base, ...params } });
  };
  const repereX = (k: number) => (o.reperesX === "chiffres" ? String(k + 1) : lettre(k));
  const repereY = (k: number) => (o.reperesX === "chiffres" ? lettre(k) : String(k + 1));
  // Axes verticaux (à x constant) si des entraxes y existent, sinon sur la hauteur du dépassement seul.
  xs.forEach((x, k) => {
    ajouter("esquisse.construction", { points: [P(x, -d), P(x, H + d)] });
    ajouter("texte.creer", { position: P(x, -d - 0.4), texte: repereX(k) });
  });
  ys.forEach((y, k) => {
    ajouter("esquisse.construction", { points: [P(-d, y), P(L + d, y)] });
    ajouter("texte.creer", { position: P(-d - 0.4, y), texte: repereY(k) });
  });
  commandes.push({ type: "groupe.creer", params: { id: `${idBase}-groupe`, nom: o.nom ?? "Trame", cibles: ids } });
  return commandes;
}
