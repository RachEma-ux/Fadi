import { describe, expect, it } from "vitest";
import { CONTRAT_COMMANDES, appliquerLot, type Commande } from "./commandes/index.js";
import { genererVue, type ParamsVue } from "./documents/vues.js";
import { exporterIfc } from "./echanges/ifc.js";
import { corpsMenuiserie, traitsMenuiseriePlan } from "./menuiserie.js";
import { modeleVide, type Occurrence } from "./modele.js";
import { maillageObjet } from "./projection/maillage.js";
import { m, pt } from "./unites.js";

const lot = (commands: Commande[], id = "r") => ({ requestId: id, baseRevision: 0, contract: CONTRAT_COMMANDES, label: id, commands });
const base = () =>
  appliquerLot(modeleVide(), lot([
    { type: "niveau.creer", params: { id: "n", nom: "R", elevation: 0, hauteur: 3 } },
    { type: "mur.tracer", params: { id: "w", niveauId: "n", a: pt(0, 0), b: pt(6, 0), epaisseur: m(0.3), hauteur: m(3) } },
    { type: "ouverture.poser", params: { id: "f", classe: "fenetre", murHoteId: "w", position: 0.5, largeur: m(1.4), hauteur: m(1.2), allege: m(0.9) } },
  ])).etat;
const menuiserie = { dormant: { largeur: m(0.06), epaisseur: m(0.07) }, vitrage: { epaisseur: m(0.024), composition: "4/16/4" }, vantaux: 2 };

describe("menuiserie paramétrée d'une fenêtre (D-101, DA-07-03)", () => {
  it("corps : quatre pièces de dormant, un montant, deux vitrages de même largeur", () => {
    const c = corpsMenuiserie(1.4, 1.2, { dormant: { largeur: m(0.06), epaisseur: m(0.07) }, vantaux: 2 }, 0.03);
    expect(c.filter((k) => k.role === "dormant")).toHaveLength(4);
    expect(c.filter((k) => k.role === "montant")).toEqual([{ role: "montant", s0: 0.67, s1: 0.73, z0: 0.06, z1: 1.14, e: 0.07 }].map((x) => expect.objectContaining({ ...x, s0: expect.closeTo(x.s0, 9), s1: expect.closeTo(x.s1, 9), z1: expect.closeTo(x.z1, 9) })));
    const v = c.filter((k) => k.role === "vitrage");
    expect(v).toHaveLength(2);
    expect(v[0]!.s1 - v[0]!.s0).toBeCloseTo(0.61, 9);
    expect(v[0]!.e).toBe(0.03);
    expect(corpsMenuiserie(1.4, 1.2, { vitrage: { epaisseur: m(0.02), composition: null } }, 0.03)).toEqual([{ role: "vitrage", s0: 0, s1: 1.4, z0: 0, z1: 1.2, e: 0.02 }]);
    expect(traitsMenuiseriePlan(pt(0, 0), { x: 1, y: 0 }, { x: 0, y: 1 }, 1.4, { dormant: { largeur: m(0.06), epaisseur: m(0.07) }, vantaux: 2 })).toHaveLength(3);
  });

  it("saisie validée : dormant trop large, plus profond que le mur, vantaux sans dormant refusés ; retrait par null", () => {
    const e = base();
    const pose = (mn: unknown) => appliquerLot(e, lot([{ type: "objet.modifier", params: { id: "f", params: { menuiserie: mn } } }], "m"));
    const r = pose(menuiserie);
    expect((r.etat.objets["f"] as Occurrence<"fenetre">).params.menuiserie).toEqual(menuiserie);
    expect(() => pose({ dormant: { largeur: m(0.7), epaisseur: m(0.07) } })).toThrow(/moitié de la baie/);
    expect(() => pose({ dormant: { largeur: m(0.06), epaisseur: m(0.35) } })).toThrow(/épaisseur du mur/);
    expect(() => pose({ vantaux: 2 })).toThrow(/dormant/);
    expect(() => pose({ dormant: { largeur: m(0.06), epaisseur: m(0.07) }, vitrage: { epaisseur: m(0.08), composition: null } })).toThrow(/profondeur du dormant/);
    expect((pose(null).etat.objets["f"] as Occurrence<"fenetre">).params.menuiserie).toBeUndefined();
    expect(appliquerLot(r.etat, lot([r.inverse], "inv")).etat).toEqual(e);
  });

  it("3D, IFC (corps et propriétés saisies seulement) et plan : la menuiserie est dessinée", () => {
    const e = appliquerLot(base(), lot([{ type: "objet.modifier", params: { id: "f", params: { menuiserie } } }], "m")).etat;
    const simple = maillageObjet(base(), base().objets["f"]!)!;
    const detail = maillageObjet(e, e.objets["f"]!)!;
    expect(detail.indices.length).toBe(simple.indices.length * 7); // 4 dormants + 1 montant + 2 vitrages
    const ifc = exporterIfc(e, { projet: { id: "p", nom: "t", code: "T" }, revision: 1, horodatage: "2026-10-05T00:00:00" }).contenu;
    expect(ifc).toMatch(/'Fadi_Menuiserie'/);
    expect(ifc).toMatch(/'VitrageComposition',\$,IFCLABEL\('4\/16\/4'\)/);
    expect(exporterIfc(base(), { projet: { id: "p", nom: "t", code: "T" }, revision: 1, horodatage: "2026-10-05T00:00:00" }).contenu).not.toMatch(/Fadi_Menuiserie/);
    const v = appliquerLot(e, lot([{ type: "vue.creer", params: { id: "v", type: "plan", titre: "R", echelle: 50, niveauId: "n" } }], "v")).etat;
    const avec = genererVue(v, v.definitions["v"]!.params as unknown as ParamsVue, "v").primitives.filter((p) => (p as { objetId?: string }).objetId === "f").length;
    const v0 = appliquerLot(base(), lot([{ type: "vue.creer", params: { id: "v", type: "plan", titre: "R", echelle: 50, niveauId: "n" } }], "v")).etat;
    const sans = genererVue(v0, v0.definitions["v"]!.params as unknown as ParamsVue, "v").primitives.filter((p) => (p as { objetId?: string }).objetId === "f").length;
    expect(avec).toBeGreaterThan(sans);
  });
});

describe("menuiserie de porte, porte-fenêtre (D-113, DA-05-15)", () => {
  it("porte : pas d'appui, seuil s'il est renseigné ; vantaux pleins, ou vitrés (porte-fenêtre) ; seuil refusé sur une fenêtre", () => {
    const sansVitrage = corpsMenuiserie(1.6, 2.2, { dormant: { largeur: m(0.06), epaisseur: m(0.07) }, vantaux: 2 }, 0.04, true);
    expect(sansVitrage.filter((k) => k.role === "dormant")).toHaveLength(3); // montants et traverse haute
    expect(sansVitrage.filter((k) => k.role === "vantail").map((k) => k.z0)).toEqual([0, 0]);
    const pf = corpsMenuiserie(1.6, 2.2, { dormant: { largeur: m(0.06), epaisseur: m(0.07) }, vitrage: { epaisseur: m(0.024), composition: null }, vantaux: 2, seuil: m(0.02) }, 0.04, true);
    expect(pf.filter((k) => k.role === "dormant")).toHaveLength(4);
    expect(pf.filter((k) => k.role === "vitrage").every((k) => k.z0 === 0.02)).toBe(true);
    const e = appliquerLot(base(), lot([{ type: "ouverture.poser", params: { id: "p", classe: "porte", murHoteId: "w", position: 0.2, largeur: m(1.6), hauteur: m(2.2) } }], "p")).etat;
    const r = appliquerLot(e, lot([{ type: "objet.modifier", params: { id: "p", params: { menuiserie: { dormant: { largeur: m(0.06), epaisseur: m(0.07) }, vitrage: { epaisseur: m(0.024), composition: "4/16/4" }, vantaux: 2, seuil: m(0.02) } } } }], "m")).etat;
    expect((r.objets["p"] as Occurrence<"porte">).params.menuiserie?.seuil?.value).toBe(0.02);
    expect(() => appliquerLot(e, lot([{ type: "objet.modifier", params: { id: "f", params: { menuiserie: { dormant: { largeur: m(0.06), epaisseur: m(0.07) }, seuil: m(0.02) } } } }], "x"))).toThrow(/seuil réservé aux portes/);
    expect(() => appliquerLot(e, lot([{ type: "objet.modifier", params: { id: "p", params: { menuiserie: { seuil: m(0.02) } } } }], "y"))).toThrow(/renseigner le dormant/);
    const simple = maillageObjet(e, e.objets["p"]!)!;
    const detail = maillageObjet(r, r.objets["p"]!)!;
    expect(detail.indices.length).toBe(simple.indices.length * 7); // 4 dormants + 1 montant + 2 vitrages
    const ifc = exporterIfc(r, { projet: { id: "p", nom: "t", code: "T" }, revision: 1, horodatage: "2026-10-06T00:00:00" }).contenu;
    expect(ifc).toMatch(/'PorteFenetre',\$,IFCBOOLEAN\(\.T\.\)/);
    expect(ifc).toMatch(/'Seuil',\$,IFCPOSITIVELENGTHMEASURE\(0\.02\)/);
  });
});
