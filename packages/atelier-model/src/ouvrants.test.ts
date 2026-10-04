import { describe, expect, it } from "vitest";
import { CONTRAT_COMMANDES, appliquerLot, type Commande } from "./commandes/index.js";
import { genererVue, type ParamsVue } from "./documents/vues.js";
import { exporterIfc } from "./echanges/ifc.js";
import { modeleVide, type ModeleAtelier, type Occurrence } from "./modele.js";
import { battantPorte } from "./ouvrants.js";
import { m, pt } from "./unites.js";

const lot = (commands: Commande[], id = "r") => ({ requestId: id, baseRevision: 0, contract: CONTRAT_COMMANDES, label: id, commands });
const base = (ouvrant?: unknown): ModeleAtelier =>
  appliquerLot(modeleVide(), lot([
    { type: "niveau.creer", params: { id: "n0", nom: "Rez", elevation: 0, hauteur: 3 } },
    { type: "mur.tracer", params: { id: "w", niveauId: "n0", a: pt(0, 0), b: pt(4, 0), epaisseur: m(0.2), hauteur: m(3) } },
    { type: "ouverture.poser", params: { id: "p", classe: "porte", murHoteId: "w", position: 0.5, largeur: m(1), hauteur: m(2.1), ...(ouvrant === undefined ? {} : { ouvrant }) } },
  ])).etat;
const P = (e: ModeleAtelier) => e.objets["p"] as Occurrence<"porte">;
const proche = (v: { x: number; y: number }, x: number, y: number) => Math.abs(v.x - x) < 1e-9 && Math.abs(v.y - y) < 1e-9;

describe("sens d'ouverture des portes (D-037)", () => {
  it("non renseigné : convention de l'Atelier (charnière au début, côté gauche), dite comme telle", () => {
    const e = base();
    expect(P(e).params.ouvrant).toBeUndefined();
    const b = battantPorte(e, P(e))!;
    expect(b.explicite).toBe(false);
    expect(proche(b.charniere, 1.5, 0.1)).toBe(true);
    expect(proche(b.ouvert, 0, 1)).toBe(true);
    expect(b.arc).toEqual([0, 90]);
  });

  it("renseigné : charnière à la fin, ouverture côté droit ; validé ; modifiable et effaçable", () => {
    const e = base({ charniere: "fin", cote: "droite" });
    const b = battantPorte(e, P(e))!;
    expect(b.explicite).toBe(true);
    expect(proche(b.charniere, 2.5, -0.1)).toBe(true);
    expect(proche(b.ouvert, 0, -1)).toBe(true);
    expect(proche(b.ferme, -1, 0)).toBe(true);
    // L'arc va du battant ouvert (−90°) au battant fermé (180°) dans le sens direct : de 180° à 270°.
    expect(b.arc[0]).toBeCloseTo(180, 9);
    expect(() => base({ charniere: "milieu", cote: "droite" })).toThrow(/ouvrant/);
    const mod = appliquerLot(e, lot([{ type: "ouverture.modifier", params: { id: "p", params: { ouvrant: { charniere: "debut", cote: "droite" } } } }], "m")).etat;
    expect(P(mod).params.ouvrant).toEqual({ charniere: "debut", cote: "droite" });
    const efface = appliquerLot(mod, lot([{ type: "ouverture.modifier", params: { id: "p", params: { ouvrant: null } } }], "x")).etat;
    expect(P(efface).params.ouvrant).toBeUndefined();
  });

  it("miroir du mur (en place ou en copie) : le côté d'ouverture change ; inverse exact", () => {
    const e = base({ charniere: "debut", cote: "gauche" });
    const r = appliquerLot(e, lot([{ type: "transformer.miroir", params: { a: pt(0, 5), b: pt(4, 5) }, cibles: ["w"] }], "mi"));
    expect(P(r.etat).params.ouvrant).toEqual({ charniere: "debut", cote: "droite" });
    // Le battant reste du côté miroir : avant y > 0, après y < 10 − 0 (symétrique par rapport à y = 5).
    expect(battantPorte(r.etat, P(r.etat))!.charniere.y).toBeCloseTo(9.9, 9);
    expect(appliquerLot(r.etat, lot([r.inverse], "inv")).etat).toEqual(e);
    const copie = appliquerLot(e, lot([{ type: "transformer.miroir", params: { a: pt(0, 5), b: pt(4, 5), copie: true }, cibles: ["w"] }], "mc")).etat;
    const portes = Object.values(copie.objets).filter((o): o is Occurrence<"porte"> => o.classe === "porte" && o.id !== "p");
    expect(portes).toHaveLength(1);
    expect(portes[0]!.params.ouvrant?.cote).toBe("droite");
  });

  it("documents et IFC : sens renseigné suivi (sans avertissement, OperationType écrit), sinon dit", () => {
    const vue: ParamsVue = { type: "plan", titre: "Rez", echelle: 50, niveauId: "n0" } as ParamsVue;
    const sans = genererVue(base(), vue);
    expect(sans.avertissements.some((a) => /Sens d'ouverture non renseigné pour 1 porte/.test(a))).toBe(true);
    const avec = genererVue(base({ charniere: "fin", cote: "droite" }), vue);
    expect(avec.avertissements.some((a) => /Sens d'ouverture/.test(a))).toBe(false);
    const opt = { projet: { id: "p", nom: "Essai", code: "E" }, revision: 1, horodatage: "2026-10-04T00:00:00" };
    expect(exporterIfc(base(), opt).contenu).toMatch(/IFCDOOR\([^;]*\.DOOR\.,\$,\$\);/);
    // Mur a → b selon +x, ouverture côté droit (−y) : vu dans le sens −y, +X vaut −x ; l'autre tableau (début, x = 1,5)
    // est du côté +X de la charnière (x = 2,5) : charnière à gauche.
    expect(exporterIfc(base({ charniere: "fin", cote: "droite" }), opt).contenu).toMatch(/IFCDOOR\([^;]*\.DOOR\.,\.SINGLE_SWING_LEFT\.,\$\);/);
    expect(exporterIfc(base({ charniere: "debut", cote: "droite" }), opt).contenu).toMatch(/\.SINGLE_SWING_RIGHT\./);
  });

  it("changer d'hôte : la porte passe sur un autre mur (niveau suivi, emprise contrôlée) ; inverse exact", () => {
    const e = appliquerLot(base({ charniere: "debut", cote: "gauche" }), lot([
      { type: "niveau.creer", params: { id: "n1", nom: "Étage", elevation: 3, hauteur: 3 } },
      { type: "mur.tracer", params: { id: "w2", niveauId: "n1", a: pt(0, 3), b: pt(6, 3), epaisseur: m(0.2), hauteur: m(3) } },
      { type: "mur.tracer", params: { id: "court", niveauId: "n0", a: pt(0, 6), b: pt(0.5, 6), epaisseur: m(0.2), hauteur: m(3) } },
    ], "w2")).etat;
    const r = appliquerLot(e, lot([{ type: "ouverture.modifier", params: { id: "p", params: { murHoteId: "w2" } } }], "h"));
    expect(P(r.etat).params.murHoteId).toBe("w2");
    expect(P(r.etat).niveauId).toBe("n1");
    expect(P(r.etat).params.ouvrant).toEqual({ charniere: "debut", cote: "gauche" });
    expect(battantPorte(r.etat, P(r.etat))!.charniere.y).toBeCloseTo(3.1, 9);
    expect(appliquerLot(r.etat, lot([r.inverse], "inv")).etat).toEqual(e);
    expect(() => appliquerLot(e, lot([{ type: "ouverture.modifier", params: { id: "p", params: { murHoteId: "court" } } }], "c"))).toThrow(/emprise/);
  });
});
