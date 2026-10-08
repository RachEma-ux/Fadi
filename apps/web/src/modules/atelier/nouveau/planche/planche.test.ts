import { describe, expect, it } from "vitest";
import { OUTILS, ajouterRectangle, modeleVide, outilParId, v3, type Outil } from "@parcours/planche-model";
import { annuler, enregistrer, historiqueInitial, operationAAnnuler, operationARetablir, PAS_MAX, retablir } from "./historique";
import { FORMAT_BROUILLON, cleBrouillon, lireBrouillon, serialiserBrouillon } from "./brouillon";
import { commenceSaisie, disponibilite, estRecherche, lotPrevu, outilDuClavier, outilsBarre, raccourciClavier, sectionsGrille, titreOutil, toucheEtat } from "./outils-planche";
import { trianglesFace } from "./vue-planche";

const outil = (id: string): Outil => {
  const o = outilParId(id);
  if (!o) throw new Error(`outil ${id} absent du catalogue`);
  return o;
};
const cle = (key: string, mods: Partial<{ ctrlKey: boolean; shiftKey: boolean; altKey: boolean; code: string }> = {}) => ({ key, ctrlKey: false, shiftKey: false, altKey: false, ...mods });

describe("Planche — historique local (annuler / rétablir)", () => {
  const m0 = modeleVide();
  const m1 = ajouterRectangle(m0, v3(0, 0, 0), v3(4, 0, 0), v3(0, 3, 0)).modele;
  const m2 = ajouterRectangle(m1, v3(10, 0, 0), v3(1, 0, 0), v3(0, 1, 0)).modele;

  it("une opération = un pas ; annuler puis rétablir rend les modèles exacts", () => {
    let h = enregistrer(historiqueInitial(m0), m1, "Rectangle");
    h = enregistrer(h, m2, "Rectangle");
    expect(h.passe).toHaveLength(2);
    expect(operationAAnnuler(h)).toBe("Rectangle");
    const a = annuler(h)!;
    expect(a.present.modele).toBe(m1);
    expect(operationARetablir(a)).toBe("Rectangle");
    expect(retablir(a)!.present.modele).toBe(m2);
    expect(annuler(annuler(a)!)).toBeNull();
  });

  it("remplaceDernier (correction au champ Mesures) remplace le pas au lieu d'en ajouter", () => {
    const h = enregistrer(enregistrer(historiqueInitial(m0), m1, "Rectangle"), m2, "Rectangle", true);
    expect(h.passe).toHaveLength(1);
    expect(h.present.modele).toBe(m2);
    expect(annuler(h)!.present.modele).toBe(m0);
  });

  it("remplaceDernier sans pas précédent empile (l'état de départ n'est jamais perdu)", () => {
    const h = enregistrer(historiqueInitial(m0), m1, "Ligne", true);
    expect(annuler(h)!.present.modele).toBe(m0);
  });

  it("un nouveau pas vide le futur ; l'historique est borné", () => {
    const a = annuler(enregistrer(historiqueInitial(m0), m1, "Rectangle"))!;
    expect(enregistrer(a, m2, "Rectangle").futur).toHaveLength(0);
    let h = historiqueInitial(m0);
    for (let i = 0; i < PAS_MAX + 5; i++) h = enregistrer(h, i % 2 ? m1 : m2, "Rectangle");
    expect(h.passe).toHaveLength(PAS_MAX);
  });
});

describe("Planche — brouillon local", () => {
  it("relit exactement le modèle sérialisé ; refuse un autre format ou un texte illisible", () => {
    const m = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(4, 0, 0), v3(0, 3, 0)).modele;
    expect(lireBrouillon(serialiserBrouillon(m))).toEqual(m);
    expect(lireBrouillon(null)).toBeNull();
    expect(lireBrouillon("{")).toBeNull();
    expect(lireBrouillon(JSON.stringify({ format: "autre/1", modele: m }))).toBeNull();
    expect(lireBrouillon(JSON.stringify({ format: FORMAT_BROUILLON, modele: { racine: {} } }))).toBeNull();
    expect(cleBrouillon("p1")).toBe("planche-brouillon:p1");
  });
});

describe("Planche — barre, grille et disponibilité (R20)", () => {
  it("la barre suit l'ordre relevé et ne contient que les outils « barre » du catalogue", () => {
    const ids = outilsBarre().map((o) => o.id);
    expect(ids.slice(0, 4)).toEqual(["selection", "gomme", "ligne", "rectangle"]);
    expect(new Set(ids)).toEqual(new Set(OUTILS.filter((o) => o.emplacement === "barre").map((o) => o.id)));
  });

  it("la grille regroupe tous les outils « grille » par section, sans doublon", () => {
    const sans = () => false;
    const ids = sectionsGrille(OUTILS, sans).flatMap((s) => s.outils.map((o) => o.id));
    expect(ids.sort()).toEqual(OUTILS.filter((o) => o.emplacement === "grille").map((o) => o.id).sort());
    expect(sectionsGrille().map((s) => s.libelle)).toContain("Dessin");
  });

  it("lot 3 : Diviser (menu contextuel, lot 5) est aussi offert dans la grille dès que sa machine existe", () => {
    expect(outil("diviser").emplacement).toBe("menu-contextuel");
    const avec = sectionsGrille().flatMap((s) => s.outils.map((o) => o.id));
    expect(avec).toContain("diviser");
    expect(sectionsGrille(OUTILS, () => false).flatMap((s) => s.outils.map((o) => o.id))).not.toContain("diviser");
    expect(new Set(avec).size).toBe(avec.length);
  });

  it("lot 3 : les 8 outils de modification ont une machine d'états et sont disponibles ; en lecture seule ils sont refusés", () => {
    for (const id of ["pousser-tirer", "deplacer", "faire-pivoter", "echelle", "decalage", "suivez-moi", "retourner", "diviser"]) {
      expect(disponibilite(outil(id), { lecture: false }), id).toBeNull();
      expect(disponibilite(outil(id), { lecture: true }), id).toContain("lecture seule");
    }
  });

  it("lots 4 à 6 : les 20 outils « prévus » ont une machine (ou sont des caméras) et sont disponibles ; Mètre et caméras restent permis en lecture seule", () => {
    const lot4 = ["metre", "cotation", "rapporteur", "axes", "texte", "plan-de-coupe", "zoom-etendu", "zoom-fenetre", "positionner-camera", "regarder-autour", "marcher"];
    const lot5 = ["peinture", "echantillon-matiere", "balise", "texte-3d"];
    const lot6 = ["enveloppe-exterieure", "union", "soustraction", "ajuster", "intersection", "scinder"];
    expect([...lot4, ...lot5, ...lot6]).toHaveLength(21);
    for (const id of [...lot4, ...lot5, ...lot6]) expect(disponibilite(outil(id), { lecture: false }), id).toBeNull();
    for (const id of ["metre", "zoom-etendu", "zoom-fenetre", "positionner-camera", "regarder-autour", "marcher"]) expect(disponibilite(outil(id), { lecture: true }), id).toBeNull();
    for (const id of ["cotation", "peinture", "balise", "texte-3d", "union"]) expect(disponibilite(outil(id), { lecture: true }), id).toContain("lecture seule");
    // Plus aucun outil de la grille n'est grisé.
    expect(sectionsGrille().flatMap((s) => s.outils).filter((o) => disponibilite(o, { lecture: false }))).toEqual([]);
  });

  it("un outil sans machine d'états est indisponible avec son lot ; les caméras de l'interface restent actives", () => {
    const sans = { lecture: false, aMachine: () => false };
    expect(disponibilite(outil("ligne"), sans)).toBe("Ligne : prévu au lot 2.");
    expect(disponibilite(outil("pousser-tirer"), sans)).toBe("Pousser/Tirer : prévu au lot 3.");
    expect(disponibilite(outil("metre"), sans)).toContain("lot 4");
    expect(disponibilite(outil("peinture"), sans)).toContain("lot 5");
    expect(disponibilite(outil("enveloppe-exterieure"), sans)).toContain("lot 6");
    expect(disponibilite(outil("orbite"), sans)).toBeNull();
    expect(disponibilite(outil("zoom"), sans)).toBeNull();
    expect(lotPrevu(outil("gomme"))).toBe("2");
    expect(disponibilite(outil("ligne"), { lecture: false, aMachine: () => true })).toBeNull();
    expect(titreOutil(outil("ligne"), null)).toBe("Ligne (L)");
  });

  it("lecture seule : navigation et sélection seulement", () => {
    const avec = { lecture: true, aMachine: () => true };
    expect(disponibilite(outil("selection"), avec)).toBeNull();
    expect(disponibilite(outil("orbite"), avec)).toBeNull();
    expect(disponibilite(outil("ligne"), avec)).toContain("lecture seule");
  });
});

describe("Planche — clavier", () => {
  it("raccourcis du catalogue lus sur le caractère", () => {
    expect(raccourciClavier(cle(" "))).toBe("Espace");
    expect(raccourciClavier(cle(" ", { shiftKey: true }))).toBe("Maj+Espace");
    expect(outilDuClavier(cle(" "))?.id).toBe("selection");
    expect(outilDuClavier(cle(" ", { shiftKey: true }))?.id).toBe("lasso");
    expect(outilDuClavier(cle("l"))?.id).toBe("ligne");
    expect(outilDuClavier(cle("r"))?.id).toBe("rectangle");
    expect(outilDuClavier(cle("c"))?.id).toBe("cercle");
    expect(outilDuClavier(cle("a"))?.id).toBe("arc-2-points");
    expect(outilDuClavier(cle("e"))?.id).toBe("gomme");
    expect(outilDuClavier(cle("o"))?.id).toBe("orbite");
    expect(outilDuClavier(cle("E", { ctrlKey: true, shiftKey: true }))?.id).toBe("zoom-etendu");
    expect(outilDuClavier(cle("Enter"))).toBeNull();
  });

  it("Maj + - ouvre la recherche (AZERTY par le code de touche)", () => {
    expect(estRecherche(cle("_", { shiftKey: true, code: "Minus" }))).toBe(true);
    expect(estRecherche(cle("6", { shiftKey: true, code: "Digit6" }))).toBe(false);
    expect(estRecherche(cle("-", { code: "Minus" }))).toBe(false);
  });

  it("touches d'état et début de saisie au champ Mesures", () => {
    expect(toucheEtat("Shift")).toBe("Maj");
    expect(toucheEtat("Control")).toBe("Ctrl");
    expect(toucheEtat("Alt")).toBe("Alt");
    expect(toucheEtat("ArrowRight")).toBe("FlecheDroite");
    expect(toucheEtat("l")).toBeNull();
    for (const k of ["4", ",", ";", "-", "[", "<", "x", "/"]) expect(commenceSaisie(k)).toBe(true);
    for (const k of ["l", "r", " ", "s"]) expect(commenceSaisie(k)).toBe(false);
  });
});

describe("Planche — triangulation des faces", () => {
  it("face trouée : triangles orientés selon la normale, aire conservée", () => {
    const carre = [v3(0, 0, 0), v3(4, 0, 0), v3(4, 4, 0), v3(0, 4, 0)];
    const trou = [v3(1, 1, 0), v3(1, 2, 0), v3(2, 2, 0), v3(2, 1, 0)];
    for (const n of [v3(0, 0, 1), v3(0, 0, -1)]) {
      const t = trianglesFace({ id: "f", exterieur: n.z > 0 ? carre : [...carre].reverse(), trous: [trou], normale: n });
      let aire = 0;
      for (let i = 0; i < t.length; i += 3) {
        const [a, b, c] = [t[i]!, t[i + 1]!, t[i + 2]!];
        const z = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
        expect(Math.sign(z)).toBe(Math.sign(n.z));
        aire += Math.abs(z) / 2;
      }
      expect(aire).toBeCloseTo(15, 9);
    }
  });
});
