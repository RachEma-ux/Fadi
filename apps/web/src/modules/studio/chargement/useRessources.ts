/**
 * Liaisons React du cycle des outils et des ressources (B.3-01, B.3-03, B.3-04, PERF-01, PERF-02, PERF-09).
 *
 * - `useCycleOutils` (planche) : chaque changement d'outil passe par le gestionnaire (moteurs chargés au besoin, puis
 *   marqués actifs ; l'outil précédent désactivé) ; la fermeture de la planche désactive l'outil courant. La première
 *   planche prête clôt la mesure PERF-01 de l'ouverture de Studio.
 * - `useUsageMoteur` : un composant qui emploie un moteur (vue 3D montée) le garde actif tant qu'il est monté.
 * - `useOuvertureStudio` (coquille) : début de PERF-01 — début de la navigation si la page a été ouverte sur une
 *   adresse Studio, sinon premier affichage de la coquille.
 */
import { useEffect, useSyncExternalStore } from "react";
import { STUDIO_TOOLS } from "@parcours/atelier-model";
import type { EtatMoteur } from "./gestionnaire-ressources";
import type { IdMoteur } from "./moteurs";
import { echantillonMemoire, perfStudio } from "./perf";
import { ressourcesStudio } from "./ressources-studio";

export const useEtatsRessources = (): readonly EtatMoteur[] =>
  useSyncExternalStore(ressourcesStudio.abonner, ressourcesStudio.instantaneEtats, ressourcesStudio.instantaneEtats);

let ouverture: { t0: number; depuis: "navigation" | "coquille"; fini: boolean } | null = null;
/** Studio a déjà été quitté dans cette page : une nouvelle entrée se mesure depuis la coquille. */
let sessionDejaNaviguee = false;

function debutOuverture(): void {
  if (ouverture) return;
  let depuis: "navigation" | "coquille" = "coquille";
  try {
    const nav = performance.getEntriesByType?.("navigation")[0] as PerformanceNavigationTiming | undefined;
    // Ouverture directe sur une adresse Studio, sans navigation interne depuis : la mesure part du début de la page.
    if (nav && new URL(nav.name).pathname.startsWith("/studio") && !sessionDejaNaviguee) depuis = "navigation";
  } catch { /* environnement sans Navigation Timing */ }
  ouverture = { t0: depuis === "navigation" ? 0 : perfStudio.maintenant(), depuis, fini: false };
}

function finOuverture(objets: number): void {
  if (!ouverture || ouverture.fini) return;
  ouverture.fini = true;
  perfStudio.enregistrer("PERF-01", perfStudio.maintenant() - ouverture.t0, "ms", { depuis: ouverture.depuis, objets }, ouverture.t0);
  echantillonMemoire("planche-prete");
}

/** Coquille de Studio : début de PERF-01 ; la sortie de Studio rouvre une mesure à la prochaine entrée. */
export function useOuvertureStudio(): void {
  useEffect(() => {
    debutOuverture();
    return () => { ouverture = null; sessionDejaNaviguee = true; };
  }, []);
}

const groupeDe = (toolId: string): string | null => STUDIO_TOOLS.find((t) => t.toolId === toolId)?.groupe ?? null;

export function useCycleOutils({ outil, pret, objets }: { outil: string; pret: boolean; objets: number }): void {
  useEffect(() => { if (pret) finOuverture(objets); }, [pret, objets]);
  useEffect(() => {
    if (!pret) return;
    const groupe = groupeDe(outil);
    if (groupe) void ressourcesStudio.activerOutil(outil, groupe).catch(() => undefined);
  }, [outil, pret]);
  useEffect(() => () => ressourcesStudio.desactiverOutil(), []);
}

export function useUsageMoteur(id: IdMoteur, par: string): void {
  useEffect(() => {
    const fin = ressourcesStudio.utiliser(id, par);
    echantillonMemoire(`monte:${par}`);
    return () => { fin(); echantillonMemoire(`demonte:${par}`); };
  }, [id, par]);
}
