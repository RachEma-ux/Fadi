/** Aides de test des machines de formes (importées par les *.test.ts seulement). */
import { type Modele, aire, modeleVide } from "../geometrie-libre.js";
import { type Vec3, v3 } from "../vecteur.js";
import type { ContexteOutil, EvenementOutil, MachineOutil, Rayon, Touche, VueOutil } from "./machine.js";

export const TOLERANCE = 0.01;

/** Rayon vertical descendant visant (x, y, 0). */
export const rayonV = (x: number, y: number): Rayon => ({ origine: v3(x, y, 10), direction: v3(0, 0, -1) });

export const survol = (x: number, y: number): EvenementOutil => ({ genre: "survol", rayon: rayonV(x, y), tolerance: TOLERANCE });
export const clic = (x: number, y: number, double = false): EvenementOutil => ({
  genre: "clic",
  rayon: rayonV(x, y),
  tolerance: TOLERANCE,
  ...(double ? { double: true } : {}),
});
export const saisie = (texte: string): EvenementOutil => ({ genre: "saisie", texte });
export const touche = (t: Touche, etat: "enfoncee" | "relachee" = "enfoncee"): EvenementOutil => ({ genre: "touche", touche: t, etat });
export const echap: EvenementOutil = { genre: "echap" };

export interface Partie<E> {
  etat: E;
  modele: Modele;
  /** Historique simulé : chaque opération empile, `remplaceDernier` remplace le sommet. */
  historique: Modele[];
  operations: string[];
  separateurDecimal: "." | ",";
  jouer(...evs: EvenementOutil[]): Partie<E>;
  vue(): VueOutil;
  ctx(): ContexteOutil;
}

export function partie<E>(machine: MachineOutil<E>, modele: Modele = modeleVide(), separateurDecimal: "." | "," = "."): Partie<E> {
  const p: Partie<E> = {
    etat: machine.initial(),
    modele,
    historique: [modele],
    operations: [],
    separateurDecimal,
    ctx: () => ({ modele: p.modele, selection: [], separateurDecimal: p.separateurDecimal }),
    jouer(...evs) {
      for (const ev of evs) {
        const t = machine.traiter(p.etat, ev, p.ctx());
        p.etat = t.etat;
        if (t.modele) {
          if (t.remplaceDernier) {
            p.historique[p.historique.length - 1] = t.modele;
            p.operations[p.operations.length - 1] = `${t.operation ?? ""} (corrigé)`;
          } else {
            p.historique.push(t.modele);
            p.operations.push(t.operation ?? "");
          }
          p.modele = t.modele;
        }
      }
      return p;
    },
    vue: () => machine.vue(p.etat, p.ctx()),
  };
  return p;
}

export const sommets = (m: Modele): Vec3[] => Object.values(m.racine.sommets).map((s) => s.position);
export const faces = (m: Modele) => Object.values(m.racine.faces);
export const aretes = (m: Modele) => Object.values(m.racine.aretes);
export const courbes = (m: Modele) => Object.values(m.racine.courbes);
export const aireTotale = (m: Modele): number => faces(m).reduce((s, f) => s + aire(m, f.id), 0);

export function contientPoint(pts: readonly Vec3[], q: Vec3, tol = 1e-9): boolean {
  return pts.some((p) => Math.abs(p.x - q.x) <= tol && Math.abs(p.y - q.y) <= tol && Math.abs(p.z - q.z) <= tol);
}
