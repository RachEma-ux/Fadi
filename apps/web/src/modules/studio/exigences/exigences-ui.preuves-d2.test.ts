/**
 * Preuves du groupe D2 (point 2 du rapprochement Studio) — INV-004 : une exigence approuvée reste distincte du résultat
 * de conception. Cas prescrit (fiche M004 INV-004) : exigence 28 m² et dessin 26 m² : afficher l'écart −2 m² et
 * conserver l'exigence versionnée ; modifier la surface dessinée ne réécrit pas la cible.
 *
 * Le panneau réel (`PanneauExigences`) est rendu avec un jeu d'exigences servi (cache de requêtes prérempli, comme la
 * réponse de `GET …/exigences`) : l'aperçu des écarts est calculé sur le dessin affiché.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { applyStudioCommands, newStudioDocument, type ExigenceStudio, type StudioCommand, type StudioDocument } from "@parcours/atelier-model";
import { PanneauExigences } from "./PanneauExigences";
import type { LectureExigences } from "./api-exigences";

const exigence: ExigenceStudio = { id: "e-surface", libelle: "Surface du séjour", metrique: { type: "total", grandeur: "surface" }, comparaison: "=", valeur: 28, unite: "m2", source: "Programme saisi (essai)" };
const lecture = (): LectureExigences => ({
  studyId: "s",
  courante: { studyId: "s", version: 1, exigences: [structuredClone(exigence)], auteur: "u1", auteurEmail: null, creeLe: "2026-10-25T08:00:00.000Z" } as unknown as LectureExigences["courante"],
  versions: [{ version: 1, nombre: 1, auteur: "u1", auteurEmail: null, creeLe: "2026-10-25T08:00:00.000Z", motif: null }],
});
/** Dessin : un rectangle de `largeur` × 2 m. */
const dessin = (largeur: number): StudioDocument => applyStudioCommands(newStudioDocument("inv-004"), [
  { toolId: "studio.dessin.rectangle", params: { id: "r1", type: "rectangle", origin: { x: 0, y: 0 }, width: largeur, height: 2 } } as StudioCommand,
]);
function rendre(doc: StudioDocument, jeu: LectureExigences): string {
  const client = new QueryClient();
  client.setQueryData(["studio-exigences", "p", "s"], jeu);
  client.setQueryData(["studio-controles", "p", "s", "v"], { controles: [] });
  return renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(PanneauExigences, {
    projectId: "p", studyId: "s", variantId: "v", revisionId: "r", doc, cibleId: null, modifiable: true, ecriture: true, nonEnregistre: true, surCommandes: () => true, surErreur: () => {},
  })));
}
/** Ligne d'écart de l'aperçu : cellules texte (Exigence, Exigé, Mesuré, Écart, Statut). */
function ligneEcart(html: string): string[] {
  const apercu = html.slice(html.indexOf("data-studio-ecarts-apercu"));
  const tr = /<tr data-studio-ecart="e-surface" data-statut="([^"]+)">([\s\S]*?)<\/tr>/.exec(apercu);
  if (!tr) throw new Error("ligne d'écart absente");
  return [tr[1]!, ...[...tr[2]!.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((m) => m[1]!.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim())];
}

describe("INV-004 — une exigence approuvée reste distincte du résultat de conception (preuves D2)", () => {
  it("INV-004 [+] exigence 28 m², dessin 26 m² : le panneau affiche l'écart −2 m² et l'exigence versionnée v1 à 28 m²", () => {
    const jeu = lecture();
    const html = rendre(dessin(13), jeu);
    const [statut, libelle, exige, mesure, ecart] = ligneEcart(html);
    expect(libelle).toBe("Surface du séjour");
    expect(exige).toMatch(/28 m²/);
    expect(mesure).toMatch(/^26 m²$/);
    expect(ecart).toMatch(/^[-−‑]2$/);
    expect(statut).toBe("non-satisfaite");
    expect(html).toContain('data-studio-exigences-version="1"');
    expect(html).toMatch(/data-studio-exigence="e-surface"[\s\S]*?Surface du séjour[\s\S]*?28/);
  });
  it("INV-004 [−] la surface dessinée modifiée (26 → 27 m²) ne réécrit pas la cible : exigence toujours 28 m² en v1, écart −1 m² recalculé", () => {
    const jeu = lecture();
    const avant = structuredClone(jeu);
    rendre(dessin(13), jeu);
    const html = rendre(dessin(13.5), jeu);
    const [, , exige, mesure, ecart] = ligneEcart(html);
    expect(exige).toMatch(/28 m²/);
    expect(mesure).toMatch(/^27 m²$/);
    expect(ecart).toMatch(/^[-−‑]1$/);
    expect(jeu).toEqual(avant);
    expect(html).toContain('data-studio-exigences-version="1"');
    // La valeur exigée n'est jamais remplacée par la mesure.
    expect(html).not.toMatch(/data-studio-exigence="e-surface"[^<]*<strong[^>]*>Surface du séjour<\/strong>[^<]*<span>[^<]*<\/span>[^<]*<span translate="no">27/);
  });
});
