/**
 * Groupe partagé de Workers de Studio et ordonnanceur de la session (D.1-03, D.3-04).
 *
 * - Un seul groupe pour toute la session, de `CONCURRENCE_DEFAUT` emplacements (2) : un hôte (`HoteWorker`) par
 *   emplacement, créé paresseusement (aucun Worker avant la première tâche) puis réutilisé d'une tâche à l'autre.
 *   Jamais un Worker par cœur logique.
 * - Chaque hôte garde ses conventions : redémarrage du Worker à la demande suivante après un plantage, repli direct
 *   (fil principal) après trois échecs consécutifs, copie des charges (jamais de transfert vers le Worker).
 * - Les erreurs de l'hôte deviennent des `ErreurTache` : interrompu / illisible → `plantage` (reprise unique par
 *   l'ordonnanceur), délai → `delai`, annulée → `annulee`, indisponible → `indisponible`, calcul → `calcul`.
 * - Journal borné des événements de tâches (`journalTaches`), lisible par la recette (`globalThis.__fadiTaches`).
 */
import { ErreurHote, HoteWorker } from "../workers/hote-worker";
import { executerDirectement } from "../workers/protocole";
import { TRAITEMENTS_STUDIO } from "../workers/traitements";
import { CONCURRENCE_DEFAUT, CONCURRENCE_FOND_DEFAUT, ErreurTache, Ordonnanceur, type CodeEchec, type EvenementTache, type Executeur } from "./ordonnanceur";

/** Délai par défaut d'une tâche — borne de sûreté choisie par Fadi, pas une mesure. */
export const DELAI_TACHE_MS = 30_000;
/** Délai d'une lecture DXF (5 Mo au plus) — borne de sûreté choisie par Fadi, pas une mesure. */
export const DELAI_LECTURE_DXF_MS = 60_000;
const TAILLE_JOURNAL = 200;

export function versErreurTache(e: unknown): ErreurTache {
  if (e instanceof ErreurTache) return e;
  if (e instanceof ErreurHote) {
    const code: CodeEchec = e.code === "interrompu" || e.code === "illisible" ? "plantage"
      : e.code === "annulee" || e.code === "remplacee" ? "annulee"
        : e.code;
    return new ErreurTache(code, e.message);
  }
  return new ErreurTache("calcul", e instanceof Error ? e.message : String(e));
}

/** Exécuteur sur un groupe d'hôtes : l'emplacement désigne toujours le même hôte, donc le même Worker. */
export function executeurHotes(hotes: readonly HoteWorker[]): Executeur {
  return ({ nature, charge, emplacement, signal, delaiMs, reprise, surProgression }) => {
    const h = hotes[emplacement % hotes.length]!;
    // Une reprise après plantage ne compte pas un second échec : une soumission coûte au plus un échec à l'hôte.
    return h.demander(nature, charge, { signal, delaiMs, surProgression, compterEchec: !reprise }).catch((e: unknown) => { throw versErreurTache(e); });
  };
}

let hotes: HoteWorker[] | null = null;
export function hotesStudio(): readonly HoteWorker[] {
  return (hotes ??= Array.from({ length: CONCURRENCE_DEFAUT }, (_, i) => new HoteWorker({
    creer: () => new Worker(new URL("../workers/studio.worker.ts", import.meta.url), { type: "module", name: `fadi-studio-${i + 1}` }),
    delaiMs: DELAI_TACHE_MS,
    direct: executerDirectement(TRAITEMENTS_STUDIO),
  })));
}

export const journalTaches: EvenementTache[] = [];
function noter(e: EvenementTache): void {
  journalTaches.push(e);
  if (journalTaches.length > TAILLE_JOURNAL) journalTaches.splice(0, journalTaches.length - TAILLE_JOURNAL);
}

let ordonnanceur: Ordonnanceur | null = null;
export function ordonnanceurStudio(): Ordonnanceur {
  if (!ordonnanceur) {
    ordonnanceur = new Ordonnanceur({
      executer: executeurHotes(hotesStudio()), delaiMs: DELAI_TACHE_MS,
      concurrence: CONCURRENCE_DEFAUT, concurrenceFond: CONCURRENCE_FOND_DEFAUT, surEvenement: noter,
    });
    (globalThis as { __fadiTaches?: unknown }).__fadiTaches = { journal: journalTaches };
  }
  return ordonnanceur;
}

/** Un hôte a abandonné son Worker après trois échecs : ses calculs se font sur le fil principal. */
export const groupeEnRepli = (): boolean => hotes !== null && hotes.some((h) => h.indisponible && h.repli);
