import { describe, expect, it } from "vitest";
import {
  appliquerAjustementsEnregistres, appliquerAjustementsQuantites, etatCibleQuantite, evaluerAjustementsQuantites, newStudioDocument, quantitesStudio,
  type AjustementQuantiteEnregistre, type CibleAjustementQuantite, type StudioDocument,
} from "@parcours/atelier-model";
import { BOM, celluleCsv, csvQuantites, ENTETES_CSV, nomFichierCsvQuantites, nombreCsv } from "./csv-quantites";
import { filtrerQuantites, FILTRE_INITIAL, lienCsvExportable, lireNombre } from "./quantites-vue";

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
    expect(celluleCsv("-x")).toBe("'-x");
    expect(celluleCsv("-1+2")).toBe("'-1+2");
    expect(celluleCsv("-1e3")).toBe("'-1e3");
    // Nombres écrits par nombreCsv (négatifs compris) : lisibles comme nombres, jamais préfixés.
    expect(celluleCsv("-0.05")).toBe("-0.05");
    expect(celluleCsv("-12")).toBe("-12");
    expect(celluleCsv("-0,05")).toBe('-0,05');
  });

  it("total général partiel quand un total de calque non évalué est ajusté (revue M2)", () => {
    const d: StudioDocument = { ...newStudioDocument("d"), layers: [{ id: "A", name: "A", visible: true, locked: false }, { id: "B", name: "B", visible: true, locked: false }], objects: [
      { id: "a1", type: "line", layerId: "A", start: { x: 0, y: 0 }, end: { x: 3, y: 0 } },
      { id: "b1", type: "rectangle", layerId: "B", origin: { x: 0, y: 0 }, width: 1, height: 5, extrusion: { base: 0, height: 1 } },
    ] };
    const q = quantitesStudio(d);
    const de = (id: string, valeur: number, sequence: number): AjustementQuantiteEnregistre => {
      const e = etatCibleQuantite(d, q, { type: "calque", id }, "volume");
      if ("refus" in e) throw new Error(e.refus);
      return { id: `a${sequence}`, sequence, revisionId: "rev-1", cible: { type: "calque", id }, grandeur: "volume", unite: "m3", valeur, motif: "Relevé", derivee: e.derivee, etatCible: e.etat, auteur: "u1", date: "2026-10-19T09:00:00.000Z" };
    };
    const l = lignes(csvQuantites(appliquerAjustementsEnregistres(q, evaluerAjustementsQuantites(d, q, [de("A", 10, 1), de("B", 7, 2)])), { decimal: "." }));
    expect(l.find((x) => x.startsWith(";;TOTAL GÉNÉRAL;;;Volume"))).toBe(";;TOTAL GÉNÉRAL;;;Volume;m³;5;;7;;;;partiel : 1 non évalué(s), 1 ajusté(s), partiel : 1 ajustement(s) sur des valeurs non évaluées, quantités brutes, déductions non déclarées;2;;;");
  });

  it("écart négatif d'un ajustement exporté comme nombre (revue M1)", () => {
    const q = quantitesStudio(doc);
    const e = etatCibleQuantite(doc, q, { type: "objet", id: "l" }, "longueur");
    if ("refus" in e) throw new Error(e.refus);
    const a: AjustementQuantiteEnregistre = { id: "a1", sequence: 1, revisionId: "rev-1", cible: { type: "objet", id: "l" }, grandeur: "longueur", unite: "m", valeur: 0.05, motif: "Relevé", derivee: e.derivee, etatCible: e.etat, auteur: "u1", date: "2026-10-19T09:00:00.000Z" };
    const l = lignes(csvQuantites(appliquerAjustementsEnregistres(q, evaluerAjustementsQuantites(doc, q, [a])), { decimal: "." }));
    expect(l).toContain("Calque par défaut;non;l;line;Ligne;Longueur;m;0.1;0.05;0.05;Relevé;u1;2026-10-19T09:00:00.000Z;;-0.05;en vigueur;rev-1;");
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
    expect(l).toContain("Calque par défaut;non;l;line;Ligne;Longueur;m;0,1;;0,1;;;;;;;;");
    expect(l).toContain("Calque par défaut;non;l;line;Ligne;Volume;m³;non évalué;;non évalué;;;;dérivée non évaluée : non extrudé;;;;");
    // Nom de calque échappé, identifiant de formule neutralisé, calque masqué signalé.
    expect(l).toContain('"Murs; ""porteurs""";oui;\'=mur;line;Mur (ligne extrudée avec épaisseur);Volume;m³;2;;2;;;;;;;;');
    expect(l).toContain('"Murs; ""porteurs""";oui;TOTAL DU CALQUE;;;Volume;m³;2;;2;;;;partiel : 1 non évalué(s);;;;');
    expect(l).toContain(";;TOTAL GÉNÉRAL;;;Longueur;m;4,1;;4,1;;;;quantités brutes, déductions non déclarées;;;;");
    expect(l).toContain(";;TOTAL GÉNÉRAL;;;Surface;m²;0,02;;0,02;;;;quantités brutes, déductions non déclarées;;;;");
    expect(l.some((x) => x.includes("Hauteur") && x.includes("TOTAL"))).toBe(false);
  });

  it("ajustement : dérivée, ajustée et retenue côte à côte, avec motif, auteur et date ; totaux retenus", () => {
    const q = appliquerAjustementsQuantites(quantitesStudio(doc), [
      { objetId: "l", grandeur: "longueur", valeur: 0.15, motif: "Relevé; site", auteur: "A. B.", date: "2026-10-18T10:00:00.000Z" },
    ]);
    const l = lignes(csvQuantites(q, { decimal: "." }));
    expect(l).toContain('Calque par défaut;non;l;line;Ligne;Longueur;m;0.1;0.15;0.15;"Relevé; site";A. B.;2026-10-18T10:00:00.000Z;;;;;');
    expect(l).toContain(";;TOTAL GÉNÉRAL;;;Longueur;m;4.1;;4.15;;;;1 ajusté(s), quantités brutes, déductions non déclarées;;;;");
  });

  it("ajustements enregistrés (E.3-05) : écart, statut, révision ; à revoir non retenu ; cible absente sur sa ligne ; total de calque", () => {
    const q0 = quantitesStudio(doc);
    const de = (d: StudioDocument, cible: CibleAjustementQuantite, grandeur: AjustementQuantiteEnregistre["grandeur"], valeur: number | null, sequence: number, motif: string): AjustementQuantiteEnregistre => {
      const e = etatCibleQuantite(d, quantitesStudio(d), cible, grandeur);
      if ("refus" in e) throw new Error(e.refus);
      return { id: `a${sequence}`, sequence, revisionId: "rev-1", cible, grandeur, unite: grandeur === "surface" ? "m2" : grandeur === "volume" ? "m3" : "m", valeur, motif, derivee: e.derivee, etatCible: e.etat, auteur: "u1", auteurEmail: "a@b.test", date: "2026-10-19T09:00:00.000Z" };
    };
    const journal = [
      de(doc, { type: "objet", id: "l" }, "longueur", 0.15, 1, "Relevé"),
      de(doc, { type: "calque", id: "m" }, "volume", 2.5, 2, "Métré du calque"),
      de(doc, { type: "objet", id: "r" }, "surface", 0.03, 3, "Ancien"),
    ];
    // Révision suivante : r modifié (à revoir), l inchangé (en vigueur), le calque m change donc aussi pour la surface,
    // mais l'ajustement du calque porte sur le volume (inchangé).
    const doc2: StudioDocument = { ...doc, objects: doc.objects.map((o) => (o.id === "r" ? { ...o, width: 0.3 } : o)) };
    const q2 = quantitesStudio(doc2);
    const l = lignes(csvQuantites(appliquerAjustementsEnregistres(q2, evaluerAjustementsQuantites(doc2, q2, journal)), { decimal: "." }));
    expect(l[0]!.split(";").slice(14)).toEqual(["Écart d’ajustement", "Statut de l’ajustement", "Révision de l’ajustement", "Valeur à revoir (non retenue)"]);
    expect(l).toContain("Calque par défaut;non;l;line;Ligne;Longueur;m;0.1;0.15;0.15;Relevé;a@b.test;2026-10-19T09:00:00.000Z;;0.05;en vigueur;rev-1;");
    expect(l).toContain('"Murs; ""porteurs""";oui;r;rectangle;Rectangle;Surface;m²;0.03;;0.03;Ancien;a@b.test;2026-10-19T09:00:00.000Z;;;à revoir : cible modifiée depuis sa révision;rev-1;0.03');
    expect(l).toContain('"Murs; ""porteurs""";oui;TOTAL DU CALQUE;;;Volume;m³;2;2.5;2.5;Métré du calque;a@b.test;2026-10-19T09:00:00.000Z;partiel : 1 non évalué(s), 1 ajusté(s);0.5;en vigueur;rev-1;');
    expect(l.find((x) => x.startsWith(";;TOTAL GÉNÉRAL;;;Volume"))).toBe(";;TOTAL GÉNÉRAL;;;Volume;m³;2;;2.5;;;;partiel : 2 non évalué(s), 1 ajusté(s), quantités brutes, déductions non déclarées;0.5;;;");
    // Cible supprimée : l'ajustement à revoir a sa ligne, jamais omis.
    const doc3: StudioDocument = { ...doc, objects: doc.objects.filter((o) => o.id !== "l") };
    const q3 = quantitesStudio(doc3);
    const l3 = lignes(csvQuantites(appliquerAjustementsEnregistres(q3, evaluerAjustementsQuantites(doc3, q3, journal)), { decimal: "," }));
    expect(l3).toContain(";;l;;;Longueur;m;;;;Relevé;a@b.test;2026-10-19T09:00:00.000Z;objet absent de cette révision;;à revoir : cible absente de cette révision;rev-1;0,15");
    expect(q0.objets.length).toBe(3);
  });

  it("type inconnu : une ligne non évaluée, et chaque total partiel", () => {
    const inconnu = { ...doc, objects: [...doc.objects, { id: "c", type: "ellipse" }] } as unknown as StudioDocument;
    const l = lignes(csvQuantites(appliquerAjustementsQuantites(quantitesStudio(inconnu), []), { decimal: "," }));
    expect(l).toContain("Calque par défaut;non;c;ellipse;Type non pris en charge;;;non évalué;;non évalué;;;;type non pris en charge par le métré;;;;");
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
    // « Exporter en CSV » : désactivé (pas d'adresse) tant que le métré ne correspond pas à la révision affichée.
    expect(lienCsvExportable("blob:csv", false)).toBeNull();
    expect(lienCsvExportable("blob:csv", true)).toBe("blob:csv");
  });
});
