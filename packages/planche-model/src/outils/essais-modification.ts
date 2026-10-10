/** Aides de test des machines de modification (lot 3), importées par les *.test.ts seulement. */
import { type Id, type Modele, aire, ajouterRectangle, contexte, modeleVide, pousserTirer } from "../geometrie-libre.js";
import { type Vec3, normalize, scale, add, v3 } from "../vecteur.js";
import type { ContexteOutil, EvenementOutil, MachineOutil, Rayon, Touche, VueOutil } from "./machine.js";

export const TOLERANCE = 0.01;

/** Rayon qui arrive sur `p` depuis la direction `depuis` (vecteur dont `p` est le but). */
export const rayonVers = (p: Vec3, depuis: Vec3 = v3(0, 0, 1)): Rayon => ({ origine: add(p, scale(normalize(depuis), 20)), direction: scale(normalize(depuis), -1) });

export const survolVers = (p: Vec3, depuis?: Vec3): EvenementOutil => ({ genre: "survol", rayon: rayonVers(p, depuis), tolerance: TOLERANCE, ecran: { x: 0, y: 0 } });
export const clicVers = (p: Vec3, depuis?: Vec3, double = false): EvenementOutil => ({
  genre: "clic",
  rayon: rayonVers(p, depuis),
  tolerance: TOLERANCE,
  ...(double ? { double: true } : {}),
});
export const appuiVers = (p: Vec3, depuis: Vec3 | undefined, ecran: { x: number; y: number }): EvenementOutil => ({ genre: "appui", rayon: rayonVers(p, depuis), tolerance: TOLERANCE, ecran });
export const glisserVers = (p: Vec3, depuis: Vec3 | undefined, ecran: { x: number; y: number }): EvenementOutil => ({ genre: "glisser", rayon: rayonVers(p, depuis), tolerance: TOLERANCE, ecran });
export const relacheVers = (p: Vec3, depuis: Vec3 | undefined, ecran: { x: number; y: number }): EvenementOutil => ({ genre: "relache", rayon: rayonVers(p, depuis), tolerance: TOLERANCE, ecran });
export const saisie = (texte: string): EvenementOutil => ({ genre: "saisie", texte });
export const touche = (t: Touche, etat: "enfoncee" | "relachee" = "enfoncee"): EvenementOutil => ({ genre: "touche", touche: t, etat });
export const echap: EvenementOutil = { genre: "echap" };

export interface Partie<E> {
  etat: E;
  modele: Modele;
  selection: readonly string[];
  /** Historique simulé : chaque opération empile, `remplaceDernier` remplace le sommet. */
  historique: Modele[];
  operations: string[];
  outilDemande: string | undefined;
  separateurDecimal: "." | ",";
  jouer(...evs: EvenementOutil[]): Partie<E>;
  /** (Lot 8) Choix d'une option, comme un bouton de la barre d'options. */
  configurer(option: string, valeur: string): Partie<E>;
  vue(): VueOutil;
  ctx(): ContexteOutil;
}

export function partie<E>(machine: MachineOutil<E>, modele: Modele = modeleVide(), selection: readonly string[] = [], separateurDecimal: "." | "," = "."): Partie<E> {
  const p: Partie<E> = {
    etat: machine.initial(),
    modele,
    selection,
    historique: [modele],
    operations: [],
    outilDemande: undefined,
    separateurDecimal,
    ctx: () => ({ modele: p.modele, selection: p.selection, separateurDecimal: p.separateurDecimal }),
    jouer(...evs) {
      for (const ev of evs) {
        const t = machine.traiter(p.etat, ev, p.ctx());
        p.etat = t.etat;
        if (t.selection) p.selection = t.selection;
        if (t.outil) p.outilDemande = t.outil;
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
    configurer(option, valeur) {
      if (machine.configurer) p.etat = machine.configurer(p.etat, option, valeur, p.ctx()).etat;
      return p;
    },
    vue: () => machine.vue(p.etat, p.ctx()),
  };
  return p;
}

export const racine = (m: Modele) => contexte(m);
export const sommets = (m: Modele): Vec3[] => Object.values(m.racine.sommets).map((s) => s.position);
export const faces = (m: Modele) => Object.values(m.racine.faces);
export const aretes = (m: Modele) => Object.values(m.racine.aretes);
export const aireTotale = (m: Modele): number => faces(m).reduce((s, f) => s + aire(m, f.id), 0);
export const toutSelectionner = (m: Modele): Id[] => [...Object.keys(m.racine.faces), ...Object.keys(m.racine.aretes)];

export function contientPoint(pts: readonly Vec3[], q: Vec3, tol = 1e-9): boolean {
  return pts.some((p) => Math.abs(p.x - q.x) <= tol && Math.abs(p.y - q.y) <= tol && Math.abs(p.z - q.z) <= tol);
}

/** Boîte x ∈ [0 ; a], y ∈ [0 ; b], z ∈ [0 ; h] (rectangle au sol puis tirage). */
export function boite(a: number, b: number, h: number): Modele {
  const r = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(a, 0, 0), v3(0, b, 0)).modele;
  const f = Object.keys(r.racine.faces)[0] as Id;
  return pousserTirer(r, f, h).modele;
}

export const emprise = (m: Modele): { min: Vec3; max: Vec3 } => {
  const s = sommets(m);
  return {
    min: v3(Math.min(...s.map((p) => p.x)), Math.min(...s.map((p) => p.y)), Math.min(...s.map((p) => p.z))),
    max: v3(Math.max(...s.map((p) => p.x)), Math.max(...s.map((p) => p.y)), Math.max(...s.map((p) => p.z))),
  };
};

/** Volume par la divergence : Σ aire · (n · p) / 3, normales supposées sortantes ; valeur absolue. */
export function volumeAbsolu(m: Modele): number {
  let v = 0;
  const c = contexte(m);
  for (const f of Object.values(c.faces)) {
    const p = (c.sommets[f.exterieur[0] as Id] as { position: Vec3 }).position;
    v += (aire(m, f.id) * (f.normale.x * p.x + f.normale.y * p.y + f.normale.z * p.z)) / 3;
  }
  return Math.abs(v);
}

