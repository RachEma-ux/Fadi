import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CATALOGUE } from "../messages";
import { InformationsPlancheVue, formaterTaille, lignesInspection, type InformationsPlanche } from "./informations-planche";
import { indexInitial } from "./registre-planches";

const SRC = readFileSync(new URL("./menu-planche.tsx", import.meta.url), "utf8");
const stats = (p: Partial<InformationsPlanche> = {}): InformationsPlanche => ({ octets: 2048, objets: 2, faces: 14, aretes: 30, annotations: 0, aretesLibres: 0, nonEtanches: 0, pasAnnulables: 3, ...p });

describe("menu de la Planche de Sandbox — entrées demandées", () => {
  it("dans l'ordre : Ouvrir, Nouvelle | Enregistrer, Enregistrer sous, Renommer | Supprimer | Partager, Exporter, Importer | Informations, PNG", () => {
    const cles = [...SRC.matchAll(/\{item\("([a-z-]+)"/g)].map((m) => m[1]);
    expect(cles).toEqual(["ouvrir", "nouvelle", "enregistrer", "enregistrer-sous", "renommer", "supprimer", "partager", "exporter", "importer", "informations", "png"]);
    // Les séparateurs tombent entre les groupes demandés (4 : après Nouvelle, Renommer, Supprimer, Importer).
    expect(SRC.match(/className="avec-separateur" aria-hidden="true"/g)).toHaveLength(4);
    const ordre = SRC.split("\n").filter((l) => /\{item\(|avec-separateur/.test(l)).map((l) => (l.includes("avec-separateur") ? "|" : /\{item\("([a-z-]+)"/.exec(l)![1]));
    expect(ordre.join(",")).toBe("ouvrir,nouvelle,|,enregistrer,enregistrer-sous,renommer,|,supprimer,|,partager,exporter,importer,|,informations,png");
  });
  it("Exporter et Importer proposent exactement IFC, OBJ et STL ; le pictogramme du bouton est le hamburger Tabler", () => {
    expect(SRC).toContain('FORMATS_ECHANGE: readonly FormatEchange[] = ["ifc", "obj", "stl"]');
    expect(SRC).toContain('<IconeSandbox nom="fichier"');
    expect(readFileSync(new URL("../pictogrammes/interface.ts", import.meta.url), "utf8")).toContain('fichier: "menu-2"');
  });
  it("chaque libellé du menu existe en français et en anglais, sans texte écrit en dur", () => {
    for (const cle of ["ouvrir", "nouvelle", "enregistrer", "enregistrer-sous", "renommer", "supprimer", "partager", "exporter", "importer", "informations"]) {
      expect(CATALOGUE.fr[`planche.sb.${cle}` as keyof typeof CATALOGUE.fr]).toBeTruthy();
      expect(CATALOGUE.en[`planche.sb.${cle}` as keyof typeof CATALOGUE.en]).toBeTruthy();
    }
    expect(Object.keys(CATALOGUE.fr).filter((k) => k.startsWith("planche.sb.")).sort()).toEqual(Object.keys(CATALOGUE.en).filter((k) => k.startsWith("planche.sb.")).sort());
  });
});

describe("page Informations (style Excel)", () => {
  const rendre = (s: InformationsPlanche) => {
    const i = indexInitial(new Date("2026-10-21T10:00:00Z"));
    return renderToStaticMarkup(createElement(InformationsPlancheVue, { info: { ...i.planches[0]!, altitudeRef: 3.2 }, total: 1, stats: s, etat: "enregistre", nomAffiche: "Brouillon Sandbox", onFermer() {}, onRenommer() {}, onInspecter() {}, onEnregistrer() {}, onPartager() {}, onSupprimer() {} }));
  };
  it("cartes « bouton + titre + texte » à gauche, propriétés à droite", () => {
    const h = rendre(stats());
    for (const c of ["nom", "inspecter", "gerer", "partager", "supprimer"]) expect(h).toContain(`data-planche-info-carte="${c}"`);
    expect(h).toContain("Propriétés");
    expect(h).toContain("Dates associées");
    expect(h).toContain("Niveau de référence");
    expect(h).toContain("3,2 m");
    expect(h).toContain("2,0 Ko");
    expect(h).toContain("Enregistré dans ce navigateur");
    expect(h).toContain('role="dialog"');
  });
  it("l'inspection ne signale que ce qui existe, sinon « aucun problème »", () => {
    expect(lignesInspection(stats())).toHaveLength(2);
    expect(lignesInspection(stats()).at(-1)).toContain("Aucun problème");
    const l = lignesInspection(stats({ annotations: 4, aretesLibres: 2, nonEtanches: 1 }));
    expect(l).toHaveLength(4);
    expect(l.join(" ")).toContain("4 annotation(s)");
    expect(l.join(" ")).toContain("2 arête(s) libre(s)");
    expect(l.join(" ")).toContain("1 objet(s) non étanche(s)");
  });
  it("taille lisible", () => {
    expect(formaterTaille(512, "fr")).toBe("512 o");
    expect(formaterTaille(2048, "fr")).toBe("2,0 Ko");
    expect(formaterTaille(2048, "en")).toBe("2.0 KB");
    expect(formaterTaille(5 * 1024 * 1024, "fr")).toBe("5,0 Mo");
  });
});
