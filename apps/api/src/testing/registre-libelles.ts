/**
 * Libellés de contrôle cités par le registre Studio (X.3-02) : pour chaque preuve dont le `fichier` est un test ou une
 * recette (`estTestOuRecette`), les champs `controle`, `controles` et `libelle`. Chaque libellé doit être écrit dans ce
 * fichier, mot pour mot, ou couvert par un gabarit admis (règle de `libelles-sources.ts`) ; un nom complet Vitest
 * « bloc > test » est admis si chacun de ses maillons l'est. Pur : lecture de fichiers.
 */
import { existsSync, readFileSync } from "node:fs";
import { estTestOuRecette, libellesDuFichier, trouverLibelle, type LibellesFichier } from "./libelles-sources.js";

export interface PreuveRegistre { readonly type?: string; readonly fichier?: string; readonly controle?: string; readonly controles?: readonly string[]; readonly libelle?: string }
export interface TacheRegistre { readonly id: string; readonly preuves?: readonly PreuveRegistre[] }

export interface LibelleCite {
  readonly id: string;
  /** Rang de la preuve dans `preuves` (à partir de 0). */
  readonly index_preuve: number;
  readonly fichier: string;
  readonly champ: "controle" | "controles" | "libelle";
  readonly libelle: string;
}

export function libellesCites(taches: readonly TacheRegistre[]): LibelleCite[] {
  const out: LibelleCite[] = [];
  for (const t of taches) {
    (t.preuves ?? []).forEach((p, index_preuve) => {
      const fichier = p.fichier;
      if (!fichier || !estTestOuRecette(fichier)) return;
      if (typeof p.controle === "string") out.push({ id: t.id, index_preuve, fichier, champ: "controle", libelle: p.controle });
      for (const l of p.controles ?? []) out.push({ id: t.id, index_preuve, fichier, champ: "controles", libelle: l });
      if (typeof p.libelle === "string") out.push({ id: t.id, index_preuve, fichier, champ: "libelle", libelle: p.libelle });
    });
  }
  return out;
}

export interface LibelleVerifie extends LibelleCite {
  readonly resultat: "exact" | "gabarit" | "introuvable" | "fichier-absent";
  readonly gabarit?: string;
}

/** Vérifie chaque libellé cité contre son fichier (racine du dépôt terminée par `/`). */
export function verifierLibelles(taches: readonly TacheRegistre[], racine: string): LibelleVerifie[] {
  const cache = new Map<string, LibellesFichier | null>();
  const lire = (f: string) => {
    if (!cache.has(f)) cache.set(f, existsSync(`${racine}${f}`) ? libellesDuFichier(f, readFileSync(`${racine}${f}`, "utf8")) : null);
    return cache.get(f)!;
  };
  return libellesCites(taches).map((c) => {
    const l = lire(c.fichier);
    if (!l) return { ...c, resultat: "fichier-absent" as const };
    const r = trouverLibelle(l, c.libelle);
    if (r) return r.mode === "exact" ? { ...c, resultat: "exact" as const } : { ...c, resultat: "gabarit" as const, gabarit: r.gabarit };
    // Nom complet Vitest « bloc > test » : chaque maillon doit être écrit dans le fichier (exact ou gabarit admis).
    const maillons = c.libelle.split(" > ");
    if (maillons.length > 1) {
      const trouves = maillons.map((m) => trouverLibelle(l, m));
      if (trouves.every((t) => t !== null)) {
        const g = trouves.find((t) => t!.mode === "gabarit");
        return g && g.mode === "gabarit" ? { ...c, resultat: "gabarit" as const, gabarit: g.gabarit } : { ...c, resultat: "exact" as const };
      }
    }
    return { ...c, resultat: "introuvable" as const };
  });
}
