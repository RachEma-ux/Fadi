/**
 * Liaisons React du cycle des outils et des ressources (B.3-01, B.3-03, B.3-04, PERF-01, PERF-02, PERF-09).
 *
 * - `useCycleOutils` (planche) : chaque changement d'outil passe par le gestionnaire (moteurs chargés au besoin, puis
 *   marqués actifs ; l'outil précédent désactivé) ; la fermeture de la planche désactive l'outil courant. La première
 *   planche prête clôt la mesure PERF-01 de l'ouverture de la variante.
 * - `useUsageMoteur` : un composant qui emploie un moteur (vue 3D montée) le garde actif tant qu'il est monté.
 * - `useOuvertureVariante` (route d'une variante) : début de PERF-01 — début de la navigation si la page a été
 *   ouverte directement sur une variante, sinon l'entrée sur la route de la variante (jamais le montage de la coquille).
 */
import { useEffect, useSyncExternalStore } from "react";
import { STUDIO_TOOLS } from "@parcours/atelier-model";
import { lireRouteStudio } from "../routes-studio";
import type { EtatMoteur } from "./gestionnaire-ressources";
import type { IdMoteur } from "./moteurs";
import { echantillonMemoire, perfStudio } from "./perf";
import { ressourcesStudio } from "./ressources-studio";

export const useEtatsRessources = (): readonly EtatMoteur[] =>
  useSyncExternalStore(ressourcesStudio.abonner, ressourcesStudio.instantaneEtats, ressourcesStudio.instantaneEtats);

export type OrigineOuverture = "navigation" | "route";
let ouverture: { t0: number; depuis: OrigineOuverture; fini: boolean } | null = null;
/** Une variante a déjà été ouverte dans cette page : les entrées suivantes se mesurent depuis l'entrée sur la route. */
let varianteDejaOuverte = false;

/**
 * Origine de la mesure PERF-01 : le début de la navigation seulement si la page s'est ouverte directement sur une
 * adresse de variante et qu'aucune variante n'a encore été ouverte ; sinon l'entrée sur la route de la variante.
 */
export function origineOuverture(urlNavigation: string | null, premiereVariante: boolean): OrigineOuverture {
  if (!premiereVariante || !urlNavigation) return "route";
  try {
    const u = new URL(urlNavigation);
    return lireRouteStudio(u.pathname, u.search).vue === "variante" ? "navigation" : "route";
  } catch {
    return "route";
  }
}

function adresseNavigation(): string | null {
  try {
    return (performance.getEntriesByType?.("navigation")[0] as PerformanceNavigationTiming | undefined)?.name ?? null;
  } catch {
    return null; // environnement sans Navigation Timing
  }
}

/** Début de PERF-01 à l'entrée sur la route d'une variante (idempotent tant que la mesure court). */
export function debutOuverture(url: string | null = adresseNavigation()): void {
  if (ouverture) return;
  const depuis = origineOuverture(url, !varianteDejaOuverte);
  varianteDejaOuverte = true;
  ouverture = { t0: depuis === "navigation" ? 0 : perfStudio.maintenant(), depuis, fini: false };
}

/** Sortie de la variante : une mesure non close est abandonnée (jamais relevée). */
export function quitterVariante(): void { ouverture = null; }

export function finOuverture(objets: number): void {
  if (!ouverture || ouverture.fini) return;
  ouverture.fini = true;
  perfStudio.enregistrer("PERF-01", perfStudio.maintenant() - ouverture.t0, "ms", { depuis: ouverture.depuis, objets }, ouverture.t0);
  echantillonMemoire("planche-prete");
}

/** Pour les tests : aucune variante ouverte dans la page. */
export function _reinitialiserOuverture(): void { ouverture = null; varianteDejaOuverte = false; }

/**
 * Route d'une variante (planche différée, montée à chaque entrée sur une variante) : début de PERF-01 ; la sortie
 * abandonne une mesure non close et la prochaine entrée en rouvre une.
 */
export function useOuvertureVariante(): void {
  useEffect(() => {
    debutOuverture();
    return quitterVariante;
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
