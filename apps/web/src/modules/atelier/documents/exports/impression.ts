/**
 * Impression de la vue courante (D-019) : page HTML autonome pour la fenêtre d'impression du navigateur
 * (« Enregistrer en PDF » au choix de l'utilisateur ; Fadi ne produit pas de PDF avant le lot 5). Feuille A3
 * paysage (`@page`), plan à une **échelle ronde déclarée** (la plus grande de `ECHELLES` qui fait tenir le plan
 * et sa marge dans la zone de dessin), cartouche minimal : projet, niveau, révision, date, échelle, mention
 * « vue de travail ». Le plan est le SVG exporté (mêmes dessins). Module pur.
 */
import { echapperXml, MARGE } from "./svg";
import type { VueExport } from "./vue";

/** Zone de dessin d'une feuille A3 paysage, marges et cartouche déduits (mm). */
export const ZONE_A3 = { largeur: 396, hauteur: 245 } as const;
export const ECHELLES = [1, 2, 5, 10, 20, 25, 50, 75, 100, 125, 200, 250, 500, 1000, 2000, 2500, 5000, 10000] as const;

/** Plus petite échelle 1:n (plan le plus grand) qui fait tenir l'emprise et sa marge dans la zone ; `null` si aucune. */
export function echelleImpression(v: Pick<VueExport, "emprise">, zone: { largeur: number; hauteur: number } = ZONE_A3): number | null {
  const l = (v.emprise.maxX - v.emprise.minX + 2 * MARGE) * 1000;
  const h = (v.emprise.maxY - v.emprise.minY + 2 * MARGE) * 1000;
  return ECHELLES.find((n) => l / n <= zone.largeur && h / n <= zone.hauteur) ?? null;
}

/** Page d'impression : SVG mis à l'échelle (taille en mm) et cartouche. */
export function pageImpression(v: VueExport, svg: string): string {
  const m = v.meta;
  const n = echelleImpression(v);
  const l = (v.emprise.maxX - v.emprise.minX + 2 * MARGE) * 1000;
  const h = (v.emprise.maxY - v.emprise.minY + 2 * MARGE) * 1000;
  const taille = n === null ? `width="${ZONE_A3.largeur}mm" height="${ZONE_A3.hauteur}mm" preserveAspectRatio="xMidYMid meet"` : `width="${l / n}mm" height="${h / n}mm"`;
  const echelle = n === null ? "ajustée à la page (plan trop grand pour 1:10000)" : `1:${n} sur A3 paysage`;
  const plan = svg.replace(/^<\?xml[^>]*>\s*/, "").replace(/<svg ([^>]*?) width="[^"]*" height="[^"]*"/, `<svg $1 ${taille}`);
  const ligne = (k: string, val: string) => `<tr><th scope="row">${k}</th><td>${echapperXml(val)}</td></tr>`;
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>${echapperXml(`Plan ${m.niveauNom} — révision ${m.revision}`)}</title>
<style>
@page { size: A3 landscape; margin: 10mm; }
html, body { margin: 0; background: #fff; color: #111; font: 10pt sans-serif; }
main { display: flex; flex-direction: column; gap: 4mm; }
.plan { height: ${ZONE_A3.hauteur}mm; display: flex; align-items: center; justify-content: center; overflow: hidden; }
table.cartouche { border-collapse: collapse; align-self: flex-end; }
.cartouche th, .cartouche td { border: 0.3mm solid #111; padding: 1mm 2mm; text-align: left; }
.cartouche th { font-weight: 600; }
@media screen { body { padding: 16px; } }
</style></head>
<body><main>
<div class="plan" role="img" aria-label="${echapperXml(`Plan du niveau ${m.niveauNom}`)}">${plan}</div>
<table class="cartouche" aria-label="Cartouche"><tbody>
${ligne("Projet", m.projetId)}
${ligne("Niveau", m.niveauNom)}
${ligne("Révision", String(m.revision))}
${ligne("Date", m.date.toLocaleString("fr-CH"))}
${ligne("Échelle", echelle)}
${ligne("Mention", "Vue de travail — coordonnées en mètres, repère local du projet")}
</tbody></table>
</main></body></html>
`;
}
