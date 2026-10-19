/**
 * Trois axes distincts, jamais confondus (#166, B.2-06) :
 *
 * 1. **visibilité** dans les barres — préférences du compte (`planche2d/profils.ts`) ;
 * 2. **disponibilité** dans le contexte — sélection, vue, tracé (`disponibilite.ts`) ;
 * 3. **droit réel d'exécution** — verdict du serveur (`canWrite` de la variante, motif du catalogue autorisé
 *    `GET …/studio/preferences/catalogue`), révision historique.
 *
 * Un outil visible mais non autorisé reste montré, **désactivé avec sa raison** (`raisonEntree`). Aucune préférence
 * n'entre ici : changer de profil ne change ni la disponibilité, ni le droit (B.2-07, essai `droits.test.ts`). Pur.
 */
import type { StudioDroitOutil } from "@parcours/atelier-model";

export interface EtatDroit {
  /** Droit d'écriture de la variante affichée selon le serveur (`context.canWrite`) ; null tant qu'inconnu. */
  canWrite: boolean | null;
  /** Révision historique affichée : lecture seule. */
  historique: boolean;
  /**
   * Motif du refus d'écriture sur le projet (catalogue autorisé du serveur) : null = le projet est modifiable par ce
   * compte ; undefined = catalogue pas encore lu.
   */
  motif?: "role" | "reference-protegee" | "verrou" | null;
  /** Écriture suspendue localement (enregistrement en cours, conflit à résoudre). */
  suspendue: boolean;
}

export type RaisonIndisponible =
  | "droit-role" | "droit-reference" | "droit-verrou" | "droit-variante" | "droit"
  | "historique" | "enregistrement" | "contexte";

/** Libellés français (traduits par `en.json`) ; « Non autorisé » = droit réel, « Indisponible » = contexte. */
export const LIBELLES_RAISON: Readonly<Record<RaisonIndisponible, string>> = Object.freeze({
  "droit-role": "Non autorisé : votre rôle sur ce projet ne permet pas de modifier.",
  "droit-reference": "Non autorisé : projet de référence protégé.",
  "droit-verrou": "Non autorisé : édition réservée par un autre compte.",
  "droit-variante": "Non autorisé : variante ou étude archivée, en lecture seule.",
  droit: "Non autorisé : le serveur refuse l’écriture sur cette variante.",
  historique: "Non autorisé : révision historique en lecture seule.",
  enregistrement: "Indisponible : enregistrement en cours.",
  contexte: "Indisponible dans ce contexte (sélection, vue ou tracé).",
});

export const estRefusDeDroit = (r: RaisonIndisponible | null): boolean => r !== null && (r === "historique" || r.startsWith("droit"));

/** Droit réel d'exécution : une lecture est toujours permise ; une écriture seulement si le serveur l'accorde. */
export function autoriseParDroit(droit: StudioDroitOutil, s: EtatDroit): boolean {
  return droit === "lecture" || (s.canWrite === true && !s.historique);
}

/**
 * Raison pour laquelle une entrée (outil ou commande) ne peut pas être lancée, ou null si elle le peut. Le droit
 * passe d'abord (c'est lui qui explique la plupart des refus), puis l'enregistrement en cours, puis le contexte.
 */
export function raisonEntree(droit: StudioDroitOutil, disponible: boolean, s: EtatDroit): RaisonIndisponible | null {
  if (droit === "ecriture") {
    if (s.historique) return "historique";
    if (s.canWrite === false) {
      if (s.motif === "role") return "droit-role";
      if (s.motif === "reference-protegee") return "droit-reference";
      if (s.motif === "verrou") return "droit-verrou";
      return s.motif === null ? "droit-variante" : "droit";
    }
    if (!disponible && s.suspendue) return "enregistrement";
  }
  return disponible ? null : "contexte";
}
