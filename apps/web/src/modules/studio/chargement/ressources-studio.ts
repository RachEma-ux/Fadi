/**
 * Gestionnaire des ressources d'exécution de la session Studio (singleton) et ses chargeurs (B.3-01 à B.3-05).
 *
 * - `coquille-studio` est déjà là : ce module fait partie de la coquille de Studio (démarrage léger, B.3-02).
 * - `planche-2d` : l'éditeur de variante, importé à l'ouverture d'une planche (B.3-03).
 * - `rendu-3d` : la vue 3D (three.js), importée au premier usage d'un outil 3D ou de la vue 3D (B.3-04).
 * - `calcul` : moteur passif — le groupe partagé de Workers (`taches/pool-studio.ts`) signale sa première création
 *   et ses tâches ; sa libération arrête les Workers (recréés à la demande suivante, D.3-02).
 *
 * Exposé à la recette et au script de mesure : `globalThis.__fadiRessources` (états, journal).
 */
import { GestionnaireRessources } from "./gestionnaire-ressources";
import { echantillonMemoire, perfStudio } from "./perf";

let liberateurCalcul: (() => void) | null = null;
/** Le groupe de Workers déclare comment se libérer (appelé une fois, à sa création). */
export function enregistrerLiberationCalcul(f: () => void): void { liberateurCalcul = f; }

export const ressourcesStudio = new GestionnaireRessources({
  dejaCharges: ["coquille-studio"],
  chargeurs: {
    "planche-2d": { charger: () => import("../VariantWorkspace") },
    "rendu-3d": { charger: () => import("../vue3d/Vue3DStudio") },
    calcul: { liberer: () => { liberateurCalcul?.(); echantillonMemoire("liberation-calcul"); } },
  },
  enLigne: () => (typeof navigator === "undefined" ? true : navigator.onLine !== false),
  surActivation: (m) => {
    perfStudio.enregistrer("PERF-02", m.dureeMs, "ms", { outil: m.outil, nature: m.nature, moteurs: m.moteursCharges.join(",") || "aucun" });
    echantillonMemoire(`outil:${m.outil}`);
  },
});

(globalThis as { __fadiRessources?: unknown }).__fadiRessources = {
  etats: () => ressourcesStudio.instantaneEtats(),
  journal: ressourcesStudio.journal,
  liberer: (id: Parameters<GestionnaireRessources["liberer"]>[0]) => ressourcesStudio.liberer(id),
};
