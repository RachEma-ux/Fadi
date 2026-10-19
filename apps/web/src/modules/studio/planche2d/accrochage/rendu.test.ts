/** Repères d'accrochage affichés (symbole, nom, ligne guide) et champ « Mesures ». */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CADRE_INITIAL } from "../geometrie-2d";
import { Apercu } from "../rendus/apercu";
import { ChampMesures } from "./ChampMesures";
import { LIBELLES_REPERE, MODES_ACCROCHAGE, type Repere } from "./moteur";

const apercu = (repere: Repere) => renderToStaticMarkup(createElement(Apercu, {
  cadre: CADRE_INITIAL, outil: "studio.dessin.ligne", trace: { point: { x: 0, y: 0 }, accroche: null }, survol: { point: repere.point, accroche: repere.ancre, repere }, rectangle: null, sommetsPoses: [],
}));

describe("Repères d'accrochage", () => {
  it("chaque mode a son symbole et son nom ; un sommet nommé garde son attribut de lien", () => {
    const symboles = new Set<string>();
    for (const genre of MODES_ACCROCHAGE) {
      const html = apercu({ genre, point: { x: 2, y: 3 }, objets: ["l"], ancre: null, distance: 0 });
      expect(html).toContain(`data-studio-accroche-mode="${genre}"`);
      expect(html).toContain(`data-studio-accroche-point="2 3"`);
      expect(html).toContain(`>${LIBELLES_REPERE[genre]}</text>`);
      symboles.add(/data-studio-accroche-objets="l">(.*?)<text/.exec(html)![1]!);
    }
    expect(symboles.size, "symbole partagé").toBe(MODES_ACCROCHAGE.length);
    expect(apercu({ genre: "extremite", point: { x: 4, y: 0 }, objets: ["l"], ancre: { objectId: "l", anchor: "end", point: { x: 4, y: 0 } }, distance: 0 })).toContain('data-studio-accroche="l:end"');
  });
  it("repérage polaire : ligne guide depuis le dernier point et angle dans le nom", () => {
    const html = apercu({ genre: "polaire", point: { x: 1, y: 1 }, objets: [], ancre: null, distance: 0, angle: Math.PI / 4, guide: { de: { x: 0, y: 0 }, vers: { x: 1, y: 1 } } });
    expect(html).toContain('class="studio-guide" x1="0" y1="0"');
    expect(html).toContain(">Polaire 45°</text>");
  });
});

describe("Champ Mesures", () => {
  it("affiche longueur et angle du segment en cours, le pas polaire et l'aide de saisie", () => {
    const html = renderToStaticMarkup(createElement(ChampMesures, { base: { x: 0, y: 0 }, survol: { x: 3, y: 4 }, direction: Math.atan2(4, 3), verrou: null, pasPolaire: 45, surPasPolaire: () => {}, surSaisie: () => null }));
    expect(html).toContain('data-studio-mesures-longueur="5"');
    expect(html).toContain("5,00 m");
    expect(html).toContain('data-studio-mesures-angle="53.13"');
    expect(html).toContain("<span>Mesures</span>");
    expect(html).toMatch(/<option value="45" selected="">45°<\/option>/);
    const impose = renderToStaticMarkup(createElement(ChampMesures, { base: { x: 0, y: 0 }, survol: null, direction: null, verrou: 30, pasPolaire: 15, surPasPolaire: () => {}, surSaisie: () => null }));
    expect(impose).toContain("<span>Angle imposé</span>");
    expect(impose).toContain(">30°</output>");
  });
});
