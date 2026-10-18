import { describe, expect, it } from "vitest";
import { appliquerAjustementsQuantites, newStudioDocument, quantitesStudio, type StudioDocument } from "@parcours/atelier-model";
import { BOM, celluleCsv, csvQuantites, ENTETES_CSV, nomFichierCsvQuantites, nombreCsv } from "./csv-quantites";
import { filtrerQuantites, FILTRE_INITIAL, lireNombre } from "./quantites-vue";

const doc: StudioDocument = {
  ...newStudioDocument("étude 1"),
  layers: [{ id: "m", name: "Murs; \"porteurs\"", visible: false, locked: false }],
  objects: [
    { id: "l", type: "line", start: { x: 0, y: 0 }, end: { x: 0.1, y: 0 } },
    { id: "=mur", type: "line", layerId: "m", start: { x: 0, y: 0 }, end: { x: 4, y: 0 }, extrusion: { base: 0, height: 2.5, thickness: 0.2 } },
    { id: "r", type: "rectangle", layerId: "m", origin: { x: 0, y: 0 }, width: 0.2, height: 0.1 },
  ],
};
const lignes = (csv: string) => csv.slice(BOM.length).split("\r\n").filter(Boolean);

describe("CSV du métré Studio", () => {
  it("échappement : séparateur, guillemets, retours, espaces de bord, formules", () => {
    expect(celluleCsv("simple")).toBe("simple");
    expect(celluleCsv("a;b")).toBe('"a;b"');
    expect(celluleCsv('il a dit "oui"')).toBe('"il a dit ""oui"""');
    expect(celluleCsv("deux\nlignes")).toBe('"deux\nlignes"');
    expect(celluleCsv(" bord")).toBe('" bord"');
    expect(celluleCsv("=SOMME(A1)")).toBe("'=SOMME(A1)");
    expect(celluleCsv("+33;x")).toBe("\"'+33;x\"");
    expect(celluleCsv("@x")).toBe("'@x");
  });

  it("nombres : virgule ou point, 6 décimales au plus, jamais d'entier tronqué", () => {
    expect(nombreCsv(10, ",")).toBe("10");
    expect(nombreCsv(0.1 + 0.2, ",")).toBe("0,3");
    expect(nombreCsv(2.5, ".")).toBe("2.5");
    expect(nombreCsv(1200, ".")).toBe("1200");
    expect(nombreCsv(-0.0000001, ",")).toBe("0");
  });

  it("BOM UTF-8, point-virgule, CRLF, en-têtes, non évalué en toutes lettres, totaux", () => {
    const csv = csvQuantites(appliquerAjustementsQuantites(quantitesStudio(doc), []), { decimal: "," });
    expect(csv.startsWith(BOM)).toBe(true);
    expect(csv.endsWith("\r\n")).toBe(true);
    const l = lignes(csv);
    expect(l[0]).toBe(ENTETES_CSV.join(";"));
    expect(l).toContain("Calque par défaut;non;l;line;Ligne;Longueur;m;0,1;;0,1;;;;");
    expect(l).toContain("Calque par défaut;non;l;line;Ligne;Volume;m³;non évalué;;non évalué;;;;dérivée non évaluée : non extrudé");
    // Nom de calque échappé, identifiant de formule neutralisé, calque masqué signalé.
    expect(l).toContain('"Murs; ""porteurs""";oui;\'=mur;line;Mur (ligne extrudée avec épaisseur);Volume;m³;2;;2;;;;');
    expect(l).toContain('"Murs; ""porteurs""";oui;TOTAL DU CALQUE;;;Volume;m³;2;;2;;;;partiel : 1 non évalué(s)');
    expect(l).toContain(";;TOTAL GÉNÉRAL;;;Longueur;m;4,1;;4,1;;;;quantités brutes, déductions non déclarées");
    expect(l).toContain(";;TOTAL GÉNÉRAL;;;Surface;m²;0,02;;0,02;;;;quantités brutes, déductions non déclarées");
    expect(l.some((x) => x.includes("Hauteur") && x.includes("TOTAL"))).toBe(false);
  });

  it("ajustement : dérivée, ajustée et retenue côte à côte, avec motif, auteur et date ; totaux retenus", () => {
    const q = appliquerAjustementsQuantites(quantitesStudio(doc), [
      { objetId: "l", grandeur: "longueur", valeur: 0.15, motif: "Relevé; site", auteur: "A. B.", date: "2026-10-18T10:00:00.000Z" },
    ]);
    const l = lignes(csvQuantites(q, { decimal: "." }));
    expect(l).toContain('Calque par défaut;non;l;line;Ligne;Longueur;m;0.1;0.15;0.15;"Relevé; site";A. B.;2026-10-18T10:00:00.000Z;');
    expect(l).toContain(";;TOTAL GÉNÉRAL;;;Longueur;m;4.1;;4.15;;;;1 ajusté(s), quantités brutes, déductions non déclarées");
  });

  it("type inconnu : une ligne non évaluée, et chaque total partiel", () => {
    const inconnu = { ...doc, objects: [...doc.objects, { id: "c", type: "circle" }] } as unknown as StudioDocument;
    const l = lignes(csvQuantites(appliquerAjustementsQuantites(quantitesStudio(inconnu), []), { decimal: "," }));
    expect(l).toContain("Calque par défaut;non;c;circle;Type non pris en charge;;;non évalué;;non évalué;;;;type non pris en charge par le métré");
    expect(l.find((x) => x.startsWith(";;TOTAL GÉNÉRAL;;;Longueur"))).toContain("partiel : 1 non évalué(s)");
  });

  it("nom de fichier sûr", () => {
    expect(nomFichierCsvQuantites("étude 1/../x")).toBe("quantites-_tude_1_x.csv");
  });
});

describe("filtres et saisie du métré", () => {
  const q = quantitesStudio(doc);
  it("filtre par calque, par nature, sans calques masqués ; totaux recalculés", () => {
    const m = filtrerQuantites(q, { ...FILTRE_INITIAL, calqueId: "m" });
    expect(m.calques.map((c) => c.calqueId)).toEqual(["m"]);
    expect(m.totaux.find((t) => t.grandeur === "longueur")!.valeur).toBe(4);
    const sansMasques = filtrerQuantites(q, { ...FILTRE_INITIAL, masques: false });
    expect(sansMasques.objets.map((o) => o.objetId)).toEqual(["l"]);
    const murs = filtrerQuantites(q, { ...FILTRE_INITIAL, nature: "mur" });
    expect(murs.totaux.find((t) => t.grandeur === "volume")).toMatchObject({ valeur: 2, nonEvalues: 0 });
  });
  it("saisie décimale à virgule ou point ; refus du reste", () => {
    expect(lireNombre("2,5")).toBe(2.5);
    expect(lireNombre(" 3.75 ")).toBe(3.75);
    expect(lireNombre("-1")).toBeNull();
    expect(lireNombre("abc")).toBeNull();
    expect(lireNombre("")).toBeNull();
  });
});
