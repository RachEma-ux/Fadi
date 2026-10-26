/**
 * Gestionnaire des ressources d'exécution de la session Studio (singleton) et ses chargeurs (B.3-01 à B.3-05).
 *
 * - `coquille-studio` est déjà là : ce module fait partie de la coquille de Studio (démarrage léger, B.3-02).
 * - `planche-2d` : l'éditeur de variante, importé à l'ouverture d'une planche (B.3-03).
 * - `rendu-3d` : la vue 3D (three.js), importée au premier usage d'un outil 3D ou de la vue 3D (B.3-04).
 * - `noyau-exact` (lot F2) : le noyau exact OCCT, importé et chargé (Worker dédié, `.wasm` séparé) à l'activation de
 *   l'outil « Booléen exact » ; sa libération arrête ce Worker (rechargé à la demande suivante).
 * - `calcul` : moteur passif — le groupe partagé de Workers (`taches/pool-studio.ts`) signale sa première création
 *   et ses tâches ; sa libération arrête les Workers (recréés à la demande suivante, D.3-02).
 *
 * Exposé à la recette et au script de mesure : `globalThis.__fadiRessources` (états, journal).
 */
import { GestionnaireRessources } from "./gestionnaire-ressources";
import { echantillonMemoire, perfStudio } from "./perf";

/**
 * Politique documentée de conservation / libération (D.3-02, EX-040, EX-062) — choix de Fadi, réversible :
 * - `noyau-exact` : conservé tant qu'il sert, puis **libéré après 5 minutes sans usage** (Worker arrêté, instance
 *   WebAssembly relâchée ; ~20 Mo de binaire décodé et la mémoire linéaire d'OCCT). Cinq minutes couvrent une séance
 *   de booléens successifs sans recompilation ; au-delà, la mémoire est rendue et le prochain usage recharge le noyau
 *   (le binaire reste dans le cache HTTP et le cache du service worker).
 * - `calcul` (Workers partagés, sans WebAssembly) et les modules (`planche-2d`, `rendu-3d`) : conservés pour la
 *   session (coût de maintien faible, réinitialisation coûteuse à chaque frappe) ; libération manuelle seulement.
 */
export const POLITIQUES_LIBERATION = Object.freeze({
  "noyau-exact": Object.freeze({ inactiviteMs: 300_000, motif: "noyau WebAssembly : mémoire rendue après 5 minutes sans usage" }),
});

let liberateurCalcul: (() => void) | null = null;
/** Le groupe de Workers déclare comment se libérer (appelé une fois, à sa création). */
export function enregistrerLiberationCalcul(f: () => void): void { liberateurCalcul = f; }

export const ressourcesStudio = new GestionnaireRessources({
  dejaCharges: ["coquille-studio"],
  chargeurs: {
    "planche-2d": { charger: () => import("../VariantWorkspace") },
    "rendu-3d": { charger: () => import("../vue3d/Vue3DStudio") },
    calcul: { liberer: () => { liberateurCalcul?.(); echantillonMemoire("liberation-calcul"); } },
    "noyau-exact": {
      // Code (module et Worker) puis initialisation du noyau (.wasm) : un échec de cette seconde étape est un « échec du noyau ».
      charger: () => import("../exact/noyau-studio"),
      initialiser: (m) => (m as typeof import("../exact/noyau-studio")).chargerNoyauExactStudio(),
      liberer: () => { void import("../exact/noyau-studio").then((m) => m.noyauExactStudio.arreter()); echantillonMemoire("liberation-noyau-exact"); },
    },
  },
  enLigne: () => (typeof navigator === "undefined" ? true : navigator.onLine !== false),
  politiques: POLITIQUES_LIBERATION,
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
