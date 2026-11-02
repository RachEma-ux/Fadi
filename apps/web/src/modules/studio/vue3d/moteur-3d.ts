/**
 * Moteur de la vue 3D de Studio (EX-056, TR-EX-056) : WebGL2 par défaut (`STUDIO_MOTEURS_PAR_DEFAUT`), WebGPU seulement
 * en option, avec un **repli WebGL2 déclaré** (jamais silencieux). WebGPU est retenu seulement si les trois conditions
 * tiennent, contrôlées dans cet ordre, la première qui manque donnant la raison du repli :
 *
 * 1. le navigateur expose WebGPU (`navigator.gpu`) et rend un adaptateur (`requestAdapter`) ;
 * 2. la règle F.1-01 l'autorise : rapport de comparaison WebGL2 / WebGPU qualifiant, **mesuré sur appareil réel**
 *    (`studioEvaluerAcceleration("webgpu-vue3d", …)`) — aucun aujourd'hui ;
 * 3. la vue sait rendre avec ce moteur (`MOTEURS_RENDUS_PAR_LA_VUE` : la vue Studio rend en WebGL2 ; le moteur WebGPU de
 *    three.js est celui de l'Atelier, non intégré à la vue Studio tant que la règle ne l'a pas qualifié).
 *
 * Pur : l'accès au GPU est injecté (`navigator.gpu` ou un double de test).
 */
import { STUDIO_MOTEURS_PAR_DEFAUT, STUDIO_RAPPORTS_ACCELERATION, studioEvaluerAcceleration, type StudioRapportAcceleration } from "@parcours/atelier-model";
import { motifsVerdict } from "../planche2d/rendus/motifs-acceleration";

export type Moteur3d = "webgl2" | "webgpu";
/** Moteurs que la vue 3D de Studio sait rendre aujourd'hui. */
export const MOTEURS_RENDUS_PAR_LA_VUE: ReadonlySet<Moteur3d> = new Set<Moteur3d>(["webgl2"]);

export type RaisonRepli3d = "webgpu-absent" | "adaptateur-absent" | "erreur-webgpu" | "regle-f101" | "moteur-non-rendu";
export interface ChoixMoteur3d {
  demande: Moteur3d;
  moteur: Moteur3d;
  /** Repli déclaré (WebGPU demandé, WebGL2 retenu) ; null sans repli. */
  repli: { raison: RaisonRepli3d; detail: string } | null;
}

/** Accès minimal à WebGPU (sous-ensemble de `navigator.gpu`). */
export interface AccesGpu { requestAdapter(): Promise<unknown | null> }

export async function choisirMoteur3d(demande: Moteur3d, gpu: AccesGpu | undefined | null, rapport: StudioRapportAcceleration | null = STUDIO_RAPPORTS_ACCELERATION.find((r) => r.acceleration === "webgpu-vue3d") ?? null, rendus: ReadonlySet<Moteur3d> = MOTEURS_RENDUS_PAR_LA_VUE): Promise<ChoixMoteur3d> {
  const defaut = STUDIO_MOTEURS_PAR_DEFAUT["vue-3d"];
  if (demande === defaut) return { demande, moteur: defaut, repli: null };
  const repli = (raison: RaisonRepli3d, detail: string): ChoixMoteur3d => ({ demande, moteur: defaut, repli: { raison, detail } });
  if (!gpu) return repli("webgpu-absent", "navigator.gpu absent");
  let adaptateur: unknown = null;
  try { adaptateur = await gpu.requestAdapter(); } catch (e) { return repli("erreur-webgpu", e instanceof Error ? e.message : String(e)); }
  if (!adaptateur) return repli("adaptateur-absent", "requestAdapter() → null");
  const v = studioEvaluerAcceleration("webgpu-vue3d", rapport);
  if (!v.autorisee) return repli("regle-f101", motifsVerdict(v));
  if (!rendus.has(demande)) return repli("moteur-non-rendu", demande);
  return { demande, moteur: demande, repli: null };
}

const RAISONS: Readonly<Record<RaisonRepli3d, string>> = Object.freeze({
  "webgpu-absent": "WebGPU indisponible dans ce navigateur",
  "adaptateur-absent": "aucun adaptateur WebGPU",
  "erreur-webgpu": "erreur à l’ouverture de WebGPU",
  "regle-f101": "WebGPU non qualifié (règle F.1-01)",
  "moteur-non-rendu": "moteur WebGPU non intégré à la vue Studio",
});

/** Texte d'état du moteur 3D (rôle `status`) : moteur retenu et, s'il y a repli, sa raison. */
export function texteMoteur3d(c: ChoixMoteur3d): string {
  if (!c.repli) return c.moteur === "webgpu" ? "Moteur 3D : WebGPU" : "Moteur 3D : WebGL2";
  return c.repli.raison === "regle-f101" ? `Moteur 3D : WebGL2 (repli) — ${RAISONS[c.repli.raison]} : ${c.repli.detail}` : `Moteur 3D : WebGL2 (repli) — ${RAISONS[c.repli.raison]}`;
}
