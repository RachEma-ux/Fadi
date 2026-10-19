/**
 * Points de mesure PERF de la planche (X.1-09) : petites fonctions appelées aux endroits mesurés, sans changer leur
 * comportement (la valeur rendue est toujours celle de l'opération mesurée ; une exception se propage telle quelle).
 */
import { mesurerJusquALaTrame, perfStudio } from "./perf";

/** PERF-06 : application au brouillon d'un lot contenant une commande d'architecture (application complète). */
export function mesurerCommandes<T>(commandes: readonly { toolId: string }[], appliquer: () => T): T {
  const architecture = commandes.find((c) => c.toolId.startsWith("studio.architecture."));
  if (!architecture) return appliquer();
  const m = perfStudio.debut("PERF-06", { outil: architecture.toolId, commandes: commandes.length });
  const r = appliquer();
  m.fin();
  return r;
}

/** PERF-04 : résolution de l'accrochage au point posé ou survolé. */
export function mesurerAccrochage<T>(objets: number, resoudre: () => T): T {
  const t0 = perfStudio.maintenant();
  const r = resoudre();
  perfStudio.enregistrer("PERF-04", perfStudio.maintenant() - t0, "ms", { objets, accroche: r ? 1 : 0 }, t0);
  return r;
}

/** PERF-03 : du pointeur à la trame qui suit l'aperçu (`debut` : instant de l'événement, ms depuis l'origine). */
export function mesurerApercu(debut: number, objets: number): void {
  mesurerJusquALaTrame("PERF-03", "apercu-2d", debut > 0 ? debut : perfStudio.maintenant(), { objets });
}

/** PERF-05 (2D) : d'un changement de cadrage (zoom, panoramique) à la trame suivante. */
export function mesurerCadrage(): void {
  mesurerJusquALaTrame("PERF-05", "cadre-2d", perfStudio.maintenant(), { vue: "2d" });
}

/** PERF-05 (3D) : durée CPU de `renderer.render()` (jamais assimilée au coût GPU, EX-097). */
export function mesurerRendu3d(rendre: () => void): void {
  const t0 = perfStudio.maintenant();
  rendre();
  perfStudio.enregistrer("PERF-05", perfStudio.maintenant() - t0, "ms", { vue: "3d", mesure: "cpu-render" }, t0);
}
