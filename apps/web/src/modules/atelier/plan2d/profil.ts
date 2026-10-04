/**
 * Indicateur de profil de l'éditeur d'esquisse (DA-01-09) : « ouvert », « fermé », « auto-intersection »,
 * « fermé avec N trous », « profils sécants ». Calcul d'aperçu seulement, aucune commande (R10).
 */
import type { EtatModele, IdObjet } from "@parcours/atelier-model";
import type { DessinPlan } from "../socle";
import { intersectionSegments, segmentsDe, type Vec } from "./geometrie";
import { analyserProfil } from "./outils/esquisse";

/** Un contour fermé se recoupe-t-il (segments non adjacents sécants) ? */
export function seRecoupe(points: readonly Vec[], ferme: boolean): boolean {
  const s = segmentsDe(points, ferme);
  const n = s.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (ferme && i === 0 && j === n - 1) continue;
      if (intersectionSegments(s[i] as { a: Vec; b: Vec }, s[j] as { a: Vec; b: Vec })) return true;
    }
  }
  return false;
}

export function indicateurProfil(etat: EtatModele | null, ids: readonly IdObjet[], dessins: readonly DessinPlan[]): string | null {
  if (!etat || ids.length === 0) return null;
  const objets = ids.map((id) => etat.objets[id]).filter((o) => o !== undefined && o.classe.startsWith("esquisse."));
  if (objets.length === 0 || objets.length !== ids.length) return null;
  if (objets.length === 1) {
    const o = objets[0];
    if (!o) return null;
    if (o.classe === "esquisse.polyligne" || o.classe === "esquisse.spline") {
      if (!o.params.ferme) return "ouvert";
      return o.classe === "esquisse.polyligne" && seRecoupe(o.params.points, true) ? "auto-intersection" : "fermé";
    }
    if (["esquisse.rectangle", "esquisse.polygone", "esquisse.cercle", "esquisse.hachure"].includes(o.classe)) return "fermé";
    return "ouvert";
  }
  const parId = new Map(dessins.map((d) => [d.objetId, d]));
  const contours = ids.map((id) => ({ id, contour: parId.get(id)?.contour ?? null }));
  if (contours.some((c) => c.contour === null)) return "ouvert";
  const p = analyserProfil(
    contours.map((c) => ({ id: c.id, contour: c.contour as readonly Vec[] })),
    null,
  );
  if (!p) return null;
  return p.sources.length === ids.length ? `fermé avec ${p.trous.length} trou${p.trous.length > 1 ? "s" : ""}` : "profils sécants";
}
