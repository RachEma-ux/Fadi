/**
 * Extrusions avec dépouille et extrusions obliques (D-148, DA-04-01) d'un solide fermé. Dépouille : la face haute
 * est le contour décalé vers l'intérieur de h·tan(a) (a > 0 : se resserre, a < 0 : s'évase), joints en onglet, sans
 * trou. Inclinaison : l'axe d'extrusion penche de `angle` vers `direction` ; la face haute est la face basse
 * translatée de h·tan(angle). Valeurs saisies, jamais supposées ; géométrie pure (ni React ni DOM).
 */
import { decalerContour, type Vec } from "./geometrie.js";
import type { ParamsSolide } from "./modele.js";

/** Le solide a-t-il une face haute différente de sa face basse ? */
export function formeLibre(p: Pick<ParamsSolide, "depouille" | "inclinaison">): boolean {
  return !!p.depouille || !!p.inclinaison;
}

/** Face haute (contour et trous) d'un solide fermé ; null si la dépouille retourne le contour. */
export function faceHauteSolide(p: Pick<ParamsSolide, "contour" | "trous" | "hauteur" | "depouille" | "inclinaison">): { contour: Vec[]; trous: Vec[][] } | null {
  const h = p.hauteur?.value ?? 0;
  let contour: Vec[] = [...p.contour];
  let trous: Vec[][] = p.trous.map((t) => [...t]);
  if (p.depouille) {
    const d = decalerContour(p.contour, -h * Math.tan((p.depouille.value * Math.PI) / 180));
    if (!d) return null;
    contour = d;
  }
  if (p.inclinaison) {
    const r = h * Math.tan((p.inclinaison.angle.value * Math.PI) / 180);
    const a = (p.inclinaison.direction.value * Math.PI) / 180;
    const dx = r * Math.cos(a);
    const dy = r * Math.sin(a);
    const tr = (q: Vec): Vec => ({ x: Math.round((q.x + dx) * 1e9) / 1e9, y: Math.round((q.y + dy) * 1e9) / 1e9 });
    contour = contour.map(tr);
    trous = trous.map((t) => t.map(tr));
  }
  return { contour, trous };
}
