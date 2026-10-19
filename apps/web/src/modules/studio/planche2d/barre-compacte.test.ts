/** Barre compacte de la planche 2D : familles, disposition en une rangée, navigation clavier, position des menus. */
import { describe, expect, it } from "vitest";
import { disposerBarre, ELEMENTS_FAMILLE, familleDeOutil, FAMILLES_STUDIO, indexNavigation, placementMenu, type IdFamille, type MesureFamille } from "./barre-compacte";

/** Mesures types : bouton « ▾ » 56 px, élément 44 px (icône seule, écart compris). */
const mesures = (menu = 56, element = 44): MesureFamille[] =>
  FAMILLES_STUDIO.map((f) => ({ id: f.id, menu, elements: (ELEMENTS_FAMILLE.get(f.id) ?? []).map(() => element) }));
const largeurRangee = (d: ReturnType<typeof disposerBarre>, m: MesureFamille[], plus = 52, sep = 13) =>
  d.rangee.reduce((s, e) => {
    const f = m.find((x) => x.id === e.id)!;
    return s + (e.menu ? f.menu : sep) + f.elements.slice(0, e.enLigne).reduce((a, b) => a + b, 0);
  }, 0) + (d.plus.length ? plus : 0);
const disposer = (largeur: number, active: IdFamille = "selection", m = mesures()) => disposerBarre({ largeur, familles: m, active, plus: 52, separateur: 13 });

describe("Barre compacte — familles", () => {
  it("chaque famille garde ses outils les plus utilisés en tête ; Courbes et Annotation sortent de Dessin", () => {
    expect(ELEMENTS_FAMILLE.get("dessin")?.map((e) => e.id)).toEqual(["studio.dessin.ligne", "studio.dessin.rectangle", "studio.dessin.cercle"]);
    expect(ELEMENTS_FAMILLE.get("courbes")?.map((e) => e.id)).toEqual(["studio.dessin.arc", "studio.dessin.polyligne", "terminer-polyligne", "fermer-polyligne"]);
    expect(ELEMENTS_FAMILLE.get("annotation")?.map((e) => e.id)).toEqual(["studio.dessin.cote", "studio.dessin.cote-angulaire", "studio.dessin.texte"]);
    expect(ELEMENTS_FAMILLE.get("selection")?.map((e) => e.id)).toEqual(["studio.dessin.selection", "tout-selectionner"]);
    expect(ELEMENTS_FAMILLE.get("vue")?.map((e) => e.id)).toContain("accrochage-grille");
    expect(ELEMENTS_FAMILLE.get("echanges")?.map((e) => e.id)).toEqual(["importer-dxf", "exporter-svg", "exporter-dxf", "exporter-ifc", "echanges"]);
    expect(familleDeOutil("studio.dessin.cote")).toBe("annotation");
    expect(familleDeOutil("studio.objet.extruder")).toBe("volume");
  });
});

describe("Barre compacte — disposition en une rangée", () => {
  it("assez de place : tout dans la rangée, aucun menu, pas de « Plus »", () => {
    const d = disposer(Number.POSITIVE_INFINITY);
    expect(d.plus).toEqual([]);
    expect(d.rangee.every((e) => !e.menu && e.enLigne === ELEMENTS_FAMILLE.get(e.id)!.length)).toBe(true);
    expect(d.rangee.map((e) => e.id)).toEqual(FAMILLES_STUDIO.map((f) => f.id));
  });

  it("bureau (≈ 1 300 px) : rangée unique sans débordement, famille active dépliée, les autres repliées dans « ▾ »", () => {
    for (const active of ["selection", "dessin", "modification", "vue", "echanges"] as IdFamille[]) {
      const m = mesures();
      const d = disposer(1300, active, m);
      expect(largeurRangee(d, m), active).toBeLessThanOrEqual(1300);
      const a = d.rangee.find((e) => e.id === active)!;
      // « Vue / Accrochage » (vue, 3D, accrochages aux objets, repérage) dépasse la place : ses premiers éléments en
      // rangée, le reste dans son menu « ▾ » ; les autres familles actives se déplient entièrement.
      if (active === "vue") expect(a.menu && a.enLigne > 0 && a.enLigne < ELEMENTS_FAMILLE.get(active)!.length, active).toBe(true);
      else expect(a.enLigne, active).toBe(ELEMENTS_FAMILLE.get(active)!.length);
      expect(d.plus, active).toEqual([]);
      // L'ordre affiché ne change pas avec la famille active.
      expect(d.rangee.map((e) => e.id)).toEqual(FAMILLES_STUDIO.map((f) => f.id));
    }
  });

  it("téléphone (≈ 340 px) : familles de faible priorité dans « Plus », jamais l'active, l'édition ni le catalogue", () => {
    for (const active of ["selection", "dessin", "echanges", "presentation"] as IdFamille[]) {
      const m = mesures(48, 44);
      const d = disposer(340, active, m);
      expect(largeurRangee(d, m), active).toBeLessThanOrEqual(340);
      expect(d.plus.length, active).toBeGreaterThan(0);
      for (const f of [active, "edition", "catalogue"] as IdFamille[]) expect(d.rangee.some((e) => e.id === f), `${active} : ${f}`).toBe(true);
      // Chaque famille est soit dans la rangée, soit dans « Plus », une seule fois, dans l'ordre affiché.
      expect([...d.rangee.map((e) => e.id), ...d.plus].sort()).toEqual(FAMILLES_STUDIO.map((f) => f.id).sort());
      expect(d.plus).toEqual(FAMILLES_STUDIO.map((f) => f.id).filter((id) => d.plus.includes(id)));
    }
  });

  it("la famille active trop longue montre ses premiers éléments et garde les autres dans son menu", () => {
    const m = mesures(56, 120);
    const d = disposer(900, "vue", m);
    const vue = d.rangee.find((e) => e.id === "vue")!;
    expect(vue.menu).toBe(true);
    expect(vue.enLigne).toBeGreaterThan(0);
    expect(vue.enLigne).toBeLessThan(ELEMENTS_FAMILLE.get("vue")!.length);
    expect(largeurRangee(d, m)).toBeLessThanOrEqual(900);
  });

  it("famille absente (profil) : ni bouton ni place", () => {
    const m = mesures().filter((f) => f.id !== "volume");
    const d = disposer(Number.POSITIVE_INFINITY, "selection", m);
    expect(d.rangee.some((e) => e.id === "volume")).toBe(false);
  });
});

describe("Barre compacte — clavier et menus", () => {
  it("flèches, Début et Fin parcourent la liste en boucle", () => {
    expect(indexNavigation("ArrowDown", -1, 4)).toBe(0);
    expect(indexNavigation("ArrowDown", 3, 4)).toBe(0);
    expect(indexNavigation("ArrowUp", 0, 4)).toBe(3);
    expect(indexNavigation("ArrowRight", 1, 4)).toBe(2);
    expect(indexNavigation("ArrowLeft", -1, 4)).toBe(3);
    expect(indexNavigation("Home", 2, 4)).toBe(0);
    expect(indexNavigation("End", 0, 4)).toBe(3);
    expect(indexNavigation("a", 0, 4)).toBeNull();
    expect(indexNavigation("ArrowDown", 0, 0)).toBeNull();
  });

  it("menu sous son bouton, ramené dans la fenêtre, hauteur bornée", () => {
    expect(placementMenu({ left: 100, bottom: 50 }, 240, { largeur: 1440, hauteur: 1000 })).toEqual({ left: 100, top: 54, hauteurMax: 938 });
    expect(placementMenu({ left: 300, bottom: 50 }, 240, { largeur: 390, hauteur: 844 }).left).toBe(142);
    expect(placementMenu({ left: -20, bottom: 50 }, 240, { largeur: 390, hauteur: 844 }).left).toBe(8);
    expect(placementMenu({ left: 10, bottom: 800 }, 240, { largeur: 390, hauteur: 844 }).hauteurMax).toBe(120);
  });
});
