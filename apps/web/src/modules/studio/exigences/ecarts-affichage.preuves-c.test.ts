/**
 * E.1-03 — affichage des écarts dans le panneau « Propriétés et exigences » avec un jeu d'exigences : l'aperçu sur le
 * brouillon et le contrôle enregistré montrent, pour chaque exigence, valeur exigée, mesure, écart signé et statut ;
 * l'exigence affichée et le jeu lu restent ceux du serveur (aucune réécriture de l'exigence par le calcul).
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { applyStudioCommands, controlerExigences, newStudioDocument, type ExigenceStudio, type StudioCommand, type StudioDocument } from "@parcours/atelier-model";
import { PanneauExigences } from "./PanneauExigences";
import type { ControleLu, LectureExigences } from "./api-exigences";

const doc = (largeur = 4): StudioDocument => applyStudioCommands(newStudioDocument("d"), [
  { toolId: "studio.dessin.ligne", params: { id: "l1", type: "line", start: { x: 0, y: 0 }, end: { x: largeur, y: 0 } } },
  { toolId: "studio.dessin.ligne", params: { id: "l2", type: "line", start: { x: 0, y: 3 }, end: { x: 1, y: 3 } } },
] as StudioCommand[]);

const exigences: ExigenceStudio[] = [
  { id: "e-long", libelle: "Longueur de l1", metrique: { type: "objet", objetId: "l1", grandeur: "longueur" }, comparaison: "<=", valeur: 3, unite: "m", source: "Programme déclaré (essai)" },
  { id: "e-nombre", libelle: "Nombre d'objets", metrique: { type: "nombre" }, comparaison: ">=", valeur: 2, unite: "u", source: "Programme déclaré (essai)" },
];

function rendre(d: StudioDocument, jeu: LectureExigences, controles: ControleLu[]) {
  const client = new QueryClient();
  client.setQueryData(["studio-exigences", "p", "s"], jeu);
  client.setQueryData(["studio-controles", "p", "s", "v"], { controles });
  return renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(PanneauExigences, {
    projectId: "p", studyId: "s", variantId: "v", revisionId: "r1", doc: d, cibleId: null, modifiable: true, ecriture: true, nonEnregistre: false, surCommandes: () => true, surErreur: () => {},
  })));
}
const ligne = (html: string, bloc: string, id: string): string => {
  const i = html.indexOf(bloc);
  expect(i).toBeGreaterThanOrEqual(0);
  const j = html.indexOf(`data-studio-ecart="${id}"`, i);
  expect(j).toBeGreaterThan(i);
  return html.slice(j, html.indexOf("</tr>", j));
};

describe("Écarts affichés sans réécriture de l'exigence (E.1-03)", () => {
  it("aperçu du brouillon et contrôle enregistré : exigé, mesuré, écart signé et statut par exigence ; exigence inchangée", () => {
    const jeuCourant = { studyId: "s", version: 1, exigences, auteur: "u1", auteurEmail: null, creeLe: "2026-10-25T10:00:00.000Z" };
    const figee = JSON.stringify(jeuCourant);
    const enregistre = controlerExigences("s", "r1", doc(4), jeuCourant);
    const controle: ControleLu = { id: "c1", studyId: "s", variantId: "v", revisionId: "r1", version: 1, execution: enregistre.execution, conclusion: enregistre.conclusion,
      documentHash: "h", auteur: "u1", auteurEmail: null, creeLe: "2026-10-25T10:05:00.000Z", resultat: enregistre };
    // Le brouillon a changé depuis le contrôle enregistré : l1 mesure 2,5 m (satisfaite) contre 4 m (non satisfaite).
    const html = rendre(doc(2.5), { studyId: "s", courante: jeuCourant, versions: [{ version: 1, nombre: 2, auteur: "u1", auteurEmail: null, creeLe: jeuCourant.creeLe, motif: null }] }, [controle]);

    const apercuLong = ligne(html, "data-studio-ecarts-apercu", "e-long");
    expect(apercuLong).toContain('data-statut="satisfaite"');
    expect(apercuLong).toContain("≤");
    expect(apercuLong).toContain(">3<");
    expect(apercuLong).toContain(">2,5<");
    expect(apercuLong).toContain(">-0,5<");
    expect(apercuLong).toContain("Satisfaite");

    const enregLong = ligne(html, 'data-studio-controle="c1"', "e-long");
    expect(enregLong).toContain('data-statut="non-satisfaite"');
    expect(enregLong).toContain(">4<");
    expect(enregLong).toContain(">+1<");
    expect(enregLong).toContain("Non satisfaite");
    const enregNombre = ligne(html, 'data-studio-controle="c1"', "e-nombre");
    expect(enregNombre).toContain('data-statut="satisfaite"');
    expect(enregNombre).toContain(">0<");

    // L'exigence affichée reste celle du jeu : valeur 3 m, jamais remplacée par la mesure ; le jeu lu n'est pas modifié.
    expect(html).toContain('data-studio-exigence="e-long"');
    const exigenceAffichee = html.slice(html.indexOf('data-studio-exigence="e-long"'), html.indexOf("</li>", html.indexOf('data-studio-exigence="e-long"')));
    expect(exigenceAffichee).toContain(">3<");
    expect(exigenceAffichee).not.toContain(">2,5<");
    expect(exigenceAffichee).not.toContain(">4<");
    expect(JSON.stringify(jeuCourant)).toBe(figee);
    expect(enregistre.ecarts.find((e) => e.exigenceId === "e-long")).toMatchObject({ valeurExigee: 3, comparaison: "<=", ecart: 1 });
  });
});
