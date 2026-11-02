/**
 * EX-047 — historique hybride : instantanés exacts pour annuler / rétablir, et cas « historique volumineux » signalé
 * explicitement. Au-delà de la borne de l'historique local (`STUDIO_HISTORY_LIMIT`), les lots les plus anciens ne
 * s'annulent plus : ils restent des commandes en attente (rien n'est perdu ni envoyé à part) et la barre d'état le dit
 * (`data-studio-historique-borne`), au lieu d'un bornage silencieux.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { newStudioDocument, STUDIO_HISTORY_LIMIT, type StudioCommand } from "@parcours/atelier-model";
import { annulerBrouillon, appliquerBrouillon, commandesEnAttente, creerBrouillon, documentBrouillon, pasHorsHistorique, peutAnnuler, retablirBrouillon, type Brouillon } from "./brouillon";
import { BarreEtat } from "../espace/EspaceStudio";

const lot = (i: number): StudioCommand[] => [{ toolId: "studio.dessin.ligne", params: { id: `l${i}`, type: "line", start: { x: i, y: 0 }, end: { x: i, y: 1 } } } as StudioCommand];
const barre = (b: Brouillon) => renderToStaticMarkup(createElement(BarreEtat, {
  aide: "", coordonnees: null, accrochages: [], pas: 1, pasAffiche: "1", planche: "Plan", sousTitre: "", enAttente: commandesEnAttente(b).length, horsHistorique: pasHorsHistorique(b), etat: "", lectureSeule: false, revision: "rev-1",
}));

describe("historique local borné : refus explicite, aucune perte masquée (EX-047)", () => {
  it("annuler / rétablir rend l'état exact ; sous la borne, aucun avertissement", () => {
    let b = creerBrouillon(newStudioDocument("d"));
    const etats = [JSON.stringify(documentBrouillon(b))];
    for (let i = 0; i < 3; i++) { b = appliquerBrouillon(b, lot(i)); etats.push(JSON.stringify(documentBrouillon(b))); }
    b = annulerBrouillon(annulerBrouillon(b));
    expect(JSON.stringify(documentBrouillon(b))).toBe(etats[1]);
    b = retablirBrouillon(b);
    expect(JSON.stringify(documentBrouillon(b))).toBe(etats[2]);
    expect(pasHorsHistorique(b)).toBe(0);
    expect(barre(b)).not.toContain("data-studio-historique-borne");
  });

  it(`au-delà de ${STUDIO_HISTORY_LIMIT} lots : les plus anciens ne s'annulent plus, restent en attente, et la barre d'état le dit`, () => {
    let b = creerBrouillon(newStudioDocument("d"));
    const n = STUDIO_HISTORY_LIMIT + 3;
    for (let i = 0; i < n; i++) b = appliquerBrouillon(b, lot(i));
    expect(pasHorsHistorique(b)).toBe(3);
    const html = barre(b);
    expect(html).toContain('data-studio-historique-borne="3"');
    expect(html).toContain("Historique local borné : 3 modification(s) plus ancienne(s) ne s’annulent plus (toujours à enregistrer)");
    expect(html).toContain('role="status"');
    // On annule tout ce qui peut l'être : il reste les 3 lots hors historique, toujours en attente, et le refus est net.
    let k = 0;
    while (peutAnnuler(b)) { b = annulerBrouillon(b); k += 1; }
    expect(k).toBe(STUDIO_HISTORY_LIMIT);
    expect(b.pas).toHaveLength(3);
    expect(commandesEnAttente(b).map((c) => (c.params as { id: string }).id)).toEqual(["l0", "l1", "l2"]);
    expect(annulerBrouillon(b)).toBe(b);
    expect(documentBrouillon(b).objects.map((o) => o.id)).toEqual(["l0", "l1", "l2"]);
    expect(barre(b)).toContain('data-studio-historique-borne="3"');
  });
});
