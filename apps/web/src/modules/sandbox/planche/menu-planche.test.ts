import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CATALOGUE } from "../messages";
import { MenuPlanche, pastilleExtensions, type ExtensionAffichee } from "./menu-planche";
import { InformationsPlancheVue, formaterTaille, lignesInspection, type InformationsPlanche } from "./informations-planche";
import { indexInitial } from "./registre-planches";

const SRC = readFileSync(new URL("./menu-planche.tsx", import.meta.url), "utf8");
const stats = (p: Partial<InformationsPlanche> = {}): InformationsPlanche => ({ octets: 2048, objets: 2, faces: 14, aretes: 30, annotations: 0, aretesLibres: 0, nonEtanches: 0, pasAnnulables: 3, chronologie: [], ...p });

describe("menu de la Planche de Sandbox — entrées demandées", () => {
  it("dans l'ordre : Ouvrir, Nouvelle | Enregistrer, Enregistrer sous, Renommer | Supprimer | Partager, Partager un lien, Exporter, Importer, Importer un fond | Informations, PNG | Extensions", () => {
    const cles = [...SRC.matchAll(/\{item\("([a-z-]+)"/g)].map((m) => m[1]);
    expect(cles).toEqual(["ouvrir", "nouvelle", "enregistrer", "enregistrer-sous", "renommer", "supprimer", "partager", "partager-lien", "exporter", "importer", "importer-fond", "informations", "png", "extensions"]);
    // Les séparateurs tombent entre les groupes demandés (5 : après Nouvelle, Renommer, Supprimer, Importer, PNG —
    // Extensions, ajoutée le 25 novembre 2026, forme son propre groupe en bas du menu).
    expect(SRC.match(/className="avec-separateur" aria-hidden="true"/g)).toHaveLength(5);
    const ordre = SRC.split("\n").filter((l) => /\{item\(|avec-separateur/.test(l)).map((l) => (l.includes("avec-separateur") ? "|" : /\{item\("([a-z-]+)"/.exec(l)![1]));
    expect(ordre.join(",")).toBe("ouvrir,nouvelle,|,enregistrer,enregistrer-sous,renommer,|,supprimer,|,partager,partager-lien,exporter,importer,importer-fond,|,informations,png,|,extensions");
  });
  it("Exporter et Importer proposent exactement IFC, OBJ et STL ; le pictogramme du bouton est le hamburger Tabler", () => {
    expect(SRC).toContain('FORMATS_ECHANGE: readonly FormatEchange[] = ["ifc", "obj", "stl"]');
    expect(SRC).toContain('<IconeSandbox nom="fichier"');
    expect(readFileSync(new URL("../pictogrammes/interface.ts", import.meta.url), "utf8")).toContain('fichier: "menu-2"');
  });
  it("chaque libellé du menu existe en français et en anglais, sans texte écrit en dur", () => {
    for (const cle of ["ouvrir", "nouvelle", "enregistrer", "enregistrer-sous", "renommer", "supprimer", "partager", "exporter", "importer", "informations", "extensions"]) {
      expect(CATALOGUE.fr[`planche.sb.${cle}` as keyof typeof CATALOGUE.fr]).toBeTruthy();
      expect(CATALOGUE.en[`planche.sb.${cle}` as keyof typeof CATALOGUE.en]).toBeTruthy();
    }
    expect(Object.keys(CATALOGUE.fr).filter((k) => k.startsWith("planche.sb.")).sort()).toEqual(Object.keys(CATALOGUE.en).filter((k) => k.startsWith("planche.sb.")).sort());
  });
});

describe("page Informations (style Excel)", () => {
  const rendre = (s: InformationsPlanche) => {
    const i = indexInitial(new Date("2026-10-21T10:00:00Z"));
    return renderToStaticMarkup(createElement(InformationsPlancheVue, { info: { ...i.planches[0]!, altitudeRef: 3.2 }, total: 1, stats: s, etat: "enregistre", nomAffiche: "Brouillon Sandbox", onFermer() {}, onRenommer() {}, onInspecter() {}, onHistorique() {}, onEnregistrer() {}, onPartager() {}, onSupprimer() {} }));
  };
  it("cartes « bouton + titre + texte » à gauche, propriétés à droite", () => {
    const h = rendre(stats());
    for (const c of ["nom", "inspecter", "historique", "gerer", "partager", "supprimer"]) expect(h).toContain(`data-planche-info-carte="${c}"`);
    expect(h).toContain("Propriétés");
    expect(h).toContain("Dates associées");
    expect(h).toContain("Niveau de référence");
    expect(h).toContain("3,2 m");
    expect(h).toContain("2,0 Ko");
    expect(h).toContain("Enregistré dans ce navigateur");
    expect(h).toContain('role="dialog"');
  });
  it("carte Historique : titre « Modification », entrées « jj.mm.aaaa hh.mm, auteur, description », 5 au plus", () => {
    const vide = rendre(stats());
    expect(vide).toContain("Aucune modification enregistrée.");
    const e = (i: number) => ({ a: new Date(2026, 9, 21, 15, i).toISOString(), auteur: "Vous", description: `Opération ${i}` });
    const h = rendre(stats({ chronologie: [0, 1, 2, 3, 4, 5, 6].map(e) }));
    expect(h).toContain("Historique");
    expect(h).toContain("Modification");
    expect(h).toContain("21.10.2026 15.00</time>, Vous, Opération 0");
    expect((h.match(/<li><time/g) ?? []).length).toBe(5);
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

describe("fenêtre « Extensions » du menu (25 novembre 2026)", () => {
  const picto = { source: "tabler", nom: "box", teinte: "modification" } as const;
  const ext = (id: string, active: boolean): ExtensionAffichee => ({ id, nom: id, description: "", picto, contenu: "", active });

  it("pastille : nombre d'extensions actives, au singulier, au pluriel, ou aucune", () => {
    expect(pastilleExtensions([ext("a", true), ext("b", true)])).toBe("2 actives");
    expect(pastilleExtensions([ext("a", true), ext("b", false)])).toBe("1 active");
    expect(pastilleExtensions([ext("a", false)])).toBe("aucune active");
  });

  it("la fenêtre remplace la liste sous le menu : un interrupteur nommé par extension, état d'enregistrement annoncé", () => {
    expect(SRC).toContain('role="switch"');
    expect(SRC).toContain("aria-checked={x.active}");
    expect(SRC).toContain("aria-labelledby={`planche-extension-${x.id}`}");
    expect(SRC).toContain("onClick={() => extensions.basculer(x.id, !x.active)}");
    expect(SRC).toContain('role="status" data-planche-extensions-etat');
    // Échap revient au menu avant de le fermer ; la fenêtre et la liste ne sont jamais affichées ensemble.
    expect(SRC).toContain("else if (fenetreExtensions) setFenetreExtensions(false);");
    expect(SRC).toContain("{ouvert && !(fenetreExtensions && extensions) && (");
  });

  it("menu fermé : seul le bouton est rendu, sans fenêtre ni liste", () => {
    const i = indexInitial(new Date("2026-11-25T01:00:00Z"));
    const h = renderToStaticMarkup(createElement(MenuPlanche, { planches: i.planches, courante: i.planches[0]!, etat: "enregistre", actions: {} as never, extensions: { liste: [ext("bois", true)], basculer() {}, enAttente: false } }));
    expect(h).toContain("data-planche-menu-ouvrir");
    expect(h).not.toContain("data-planche-extensions");
  });

  it("textes de la fenêtre et des extensions livrées : en français et en anglais (« Add-ons »)", () => {
    const cles = Object.keys(CATALOGUE.fr).filter((k) => k.startsWith("extensions.") || k.startsWith("extension."));
    expect(cles.length).toBeGreaterThan(10);
    for (const k of cles) expect(CATALOGUE.en[k as keyof typeof CATALOGUE.en], k).toBeTruthy();
    expect(CATALOGUE.fr["extensions.titre"]).toBe("Extensions");
    expect(CATALOGUE.en["extensions.titre"]).toBe("Add-ons");
    expect(CATALOGUE.en["planche.sb.extensions"]).toBe("Add-ons");
  });
});
