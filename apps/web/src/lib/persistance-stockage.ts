/**
 * BD-7.2 (chantier base-donnees, constat A3) : persistance du stockage demandée pour toutes les files locales en attente
 * (lots de l'Atelier, mutations en pause dans le cache des requêtes, photos COM), et plus seulement pour Studio
 * (`modules/studio/chargement/hors-connexion-studio.ts`). Sans elle, le navigateur peut évincer IndexedDB sous pression
 * de stockage et perdre le travail non synchronisé.
 *
 * Idempotent : une seule demande par chargement de page (le navigateur mémorise sa réponse ; la répéter n'apporte rien).
 * Un échec ou une API absente n'est jamais une erreur : la file reste écrite, seule sa protection n'est pas obtenue.
 */
type GestionnaireStockage = Pick<StorageManager, "persist" | "persisted">;

let demande: Promise<boolean> | null = null;

function gestionnaire(): Partial<GestionnaireStockage> | undefined {
  try {
    return typeof navigator !== "undefined" ? (navigator.storage as StorageManager | undefined) : undefined;
  } catch {
    return undefined;
  }
}

/** Vrai si le stockage est (ou devient) persistant ; faux s'il est refusé, indisponible ou en échec. */
export function demanderPersistanceStockage(storage: Partial<GestionnaireStockage> | undefined = gestionnaire()): Promise<boolean> {
  if (demande) return demande;
  demande = (async () => {
    try {
      if (!storage?.persist) return false;
      if (storage.persisted && (await storage.persisted())) return true;
      return await storage.persist();
    } catch {
      return false;
    }
  })();
  return demande;
}

/** Tests seulement : oublie la demande déjà faite. */
export function reinitialiserPersistanceStockage(): void {
  demande = null;
}
