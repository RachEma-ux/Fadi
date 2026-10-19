import { describe, expect, it } from "vitest";
import { applyStudioCommands, newStudioDocument, validateStudioDocument, type StudioCommand, type StudioDocument } from "../document-2d.js";
import { STUDIO_COMMAND_TOOL_IDS, STUDIO_DOCUMENT_SCHEMA, STUDIO_TOOLS } from "../registry.js";
import { studioRapportFidelite } from "../../index.js";
import {
  accepterExigence, controlerExigences, exigenceUtilisable, mesurerMetrique, preparerVersion, proprietesDe, validerExigence, validerExigences,
  valeurPropriete, type ExigenceStudio,
} from "../facade-exigences.js";
import { quantitesStudio } from "../quantites.js";
import { exportStudioIfc, studioIfcSummary } from "../ifc.js";

const unchecked = (c: unknown) => c as StudioCommand[];

/** Mur de 10 m × 0,2 m × 2,5 m (centré), une fenêtre 1,2 × 1, un rectangle extrudé et une ligne non extrudée. */
function base(): StudioDocument {
  return applyStudioCommands(newStudioDocument("doc-e1"), unchecked([
    { toolId: "studio.calque.creer", params: { id: "murs", name: "Murs", visible: true, locked: false } },
    { toolId: "studio.architecture.mur", params: { id: "m1", type: "wall", layerId: "murs", axis: [{ x: 0, y: 0 }, { x: 10, y: 0 }], thickness: 0.2, height: 2.5, base: 0, justification: "center" } },
    { toolId: "studio.architecture.ouverture", params: { id: "f1", type: "opening", hostId: "m1", position: 2, width: 1.2, height: 1, sill: 1, kind: "fenetre" } },
    { toolId: "studio.dessin.rectangle", params: { id: "r1", type: "rectangle", origin: { x: 0, y: 5 }, width: 2, height: 3 } },
    { toolId: "studio.objet.extruder", params: { ids: ["r1"], base: 0, height: 3 } },
    { toolId: "studio.dessin.ligne", params: { id: "l1", type: "line", start: { x: 0, y: 10 }, end: { x: 1, y: 10 } } },
  ]));
}
const definir = (params: Record<string, unknown>) => ({ toolId: "studio.propriete.definir", params });

describe("Propriétés BIM déclarées (E.1-01)", () => {
  it("se déclarent sur un mur, une ouverture et un objet extrudé ; une valeur absente est « non évaluée »", () => {
    const doc = applyStudioCommands(base(), unchecked([
      definir({ cibleId: "m1", nom: "Résistance au feu", valeur: "EI 60", source: "CCTP lot 02, art. 3.1" }),
      definir({ cibleId: "f1", nom: "Uw", valeur: 1.3, unite: "W/m2.K" }),
      definir({ cibleId: "r1", nom: "Matériau" }),
    ]));
    expect(doc.proprietes).toEqual([
      { cibleId: "m1", nom: "Résistance au feu", valeur: "EI 60", source: "CCTP lot 02, art. 3.1" },
      { cibleId: "f1", nom: "Uw", valeur: 1.3, unite: "W/m2.K" },
      { cibleId: "r1", nom: "Matériau" },
    ]);
    expect(valeurPropriete(proprietesDe(doc.proprietes, "r1")[0])).toBeNull();
    expect(validateStudioDocument(doc)).toEqual(doc);
  });

  it("champ additif : un document sans propriété reste identique (forme canonique, champ absent)", () => {
    const doc = base();
    expect(doc).not.toHaveProperty("proprietes");
    const avec = applyStudioCommands(doc, unchecked([definir({ cibleId: "m1", nom: "Code" , valeur: "M-01" })]));
    const sans = applyStudioCommands(avec, unchecked([{ toolId: "studio.propriete.retirer", params: { cibleId: "m1", nom: "Code" } }]));
    expect(sans).toEqual(doc);
  });

  it("redéclarer la même clé remplace la propriété ; retirer une propriété absente est refusé", () => {
    const a = applyStudioCommands(base(), unchecked([definir({ cibleId: "m1", nom: "Code", valeur: "M-01" }), definir({ cibleId: "m1", nom: "Code", valeur: "M-02" })]));
    expect(a.proprietes).toEqual([{ cibleId: "m1", nom: "Code", valeur: "M-02" }]);
    expect(() => applyStudioCommands(a, unchecked([{ toolId: "studio.propriete.retirer", params: { cibleId: "m1", nom: "Autre" } }]))).toThrow(/propriété introuvable/);
  });

  it("refuse une cible hors périmètre, un nombre sans unité, une valeur non finie, un champ inconnu", () => {
    expect(() => applyStudioCommands(base(), unchecked([definir({ cibleId: "l1", nom: "x" })]))).toThrow(/objet non extrudé : l1/);
    expect(() => applyStudioCommands(base(), unchecked([definir({ cibleId: "zz", nom: "x" })]))).toThrow(/objet introuvable : zz/);
    expect(() => applyStudioCommands(base(), unchecked([definir({ cibleId: "m1", nom: "x", valeur: 2 })]))).toThrow(/unité déclarée attendue/);
    expect(() => applyStudioCommands(base(), unchecked([definir({ cibleId: "m1", nom: "x", valeur: Number.NaN, unite: "m" })]))).toThrow(/nombre fini/);
    expect(() => applyStudioCommands(base(), unchecked([definir({ cibleId: "m1", nom: " x" })]))).toThrow(/espace de bord/);
    expect(() => applyStudioCommands(base(), unchecked([definir({ cibleId: "m1", nom: "x", defaut: 1 })]))).toThrow(/champs absents ou inconnus/);
  });

  it("calque verrouillé : refusé, y compris pour l'ouverture qui suit son mur", () => {
    const verrou = applyStudioCommands(base(), unchecked([{ toolId: "studio.calque.modifier", params: { id: "murs", name: "Murs", visible: true, locked: true } }]));
    expect(() => applyStudioCommands(verrou, unchecked([definir({ cibleId: "m1", nom: "x" })]))).toThrow(/calque verrouillé/);
    expect(() => applyStudioCommands(verrou, unchecked([definir({ cibleId: "f1", nom: "x" })]))).toThrow(/calque verrouillé/);
  });

  it("suit son objet : supprimé avec lui (mur et ouvertures en cascade) ; un aplatissement est refusé", () => {
    const doc = applyStudioCommands(base(), unchecked([definir({ cibleId: "m1", nom: "a" }), definir({ cibleId: "f1", nom: "b" }), definir({ cibleId: "r1", nom: "c" })]));
    const sansMur = applyStudioCommands(doc, unchecked([{ toolId: "studio.architecture.supprimer", params: { ids: ["m1"], cascade: true } }]));
    expect(sansMur.proprietes).toEqual([{ cibleId: "r1", nom: "c" }]);
    expect(() => applyStudioCommands(doc, unchecked([{ toolId: "studio.objet.aplatir", params: { ids: ["r1"] } }]))).toThrow(/objet non extrudé : r1/);
    // Lot tout ou rien : le document d'entrée n'est pas modifié.
    expect(doc.proprietes).toHaveLength(3);
  });

  it("registre : deux commandes de mutation, famille propre, schéma du document additif", () => {
    const outils = STUDIO_TOOLS.filter((t) => t.groupe === "proprietes");
    expect(outils.map((t) => [t.toolId, t.raccourci, t.iconeSymbolique])).toEqual([
      ["studio.propriete.definir", "K", "studio-property-set"], ["studio.propriete.retirer", "G", "studio-property-remove"],
    ]);
    expect(STUDIO_COMMAND_TOOL_IDS).toContain("studio.propriete.definir");
    expect(STUDIO_DOCUMENT_SCHEMA.properties.proprietes.type).toBe("array");
  });

  it("rapport de fidélité : exacte en IFC si valuée, non évaluée sinon ; non couverte en SVG et DXF, jamais omise", () => {
    const doc = applyStudioCommands(base(), unchecked([definir({ cibleId: "m1", nom: "Code", valeur: "M-01" }), definir({ cibleId: "r1", nom: "Matériau" })]));
    for (const f of ["svg", "dxf"] as const) {
      const l = studioRapportFidelite(doc, f).lignes.find((x) => x.categorie === "proprietes");
      expect(l).toMatchObject({ type: "propriete", statut: "non-couvert", raison: "propriete-non-exportee", nombre: 2, ids: ["m1#Code", "r1#Matériau"] });
    }
    expect(studioRapportFidelite(doc, "ifc").lignes.filter((x) => x.categorie === "proprietes")).toEqual([
      { categorie: "proprietes", type: "propriete", statut: "exact", raison: "propriete-en-pset", nombre: 1, ids: ["m1#Code"] },
      { categorie: "proprietes", type: "propriete", statut: "non-couvert", raison: "propriete-non-evaluee", nombre: 1, ids: ["r1#Matériau"] },
    ]);
  });

  const meta = { studyName: "E", variantName: "V", timestamp: "2026-10-19T00:00:00" };
  const numero = (l: string) => l.slice(0, l.indexOf("="));
  /** Jeu `Fadi_ProprietesDeclarees` relié à l'entité de la ligne `entite`, et ses propriétés (lignes). */
  const jeuDe = (lignes: string[], entite: string): string[] => {
    const e = numero(entite);
    const set = lignes.find((p) => p.includes("'Fadi_ProprietesDeclarees'") && lignes.some((r) => r.includes("IFCRELDEFINESBYPROPERTIES") && r.endsWith(`,(${e}),${numero(p)});`)));
    if (!set) return [];
    const refs = set.slice(set.lastIndexOf("(")).match(/#\d+/g) ?? [];
    return refs.map((r) => lignes.find((l) => l.startsWith(`${r}=`))!);
  };

  it("IFC : jeu de projet Fadi_ProprietesDeclarees sur l'entité de chaque objet, valeur typée, source en description", () => {
    const doc = applyStudioCommands(base(), unchecked([
      definir({ cibleId: "m1", nom: "Résistance au feu", valeur: "EI 60", source: "CCTP lot 02" }),
      definir({ cibleId: "m1", nom: "Longueur déclarée", valeur: 10, unite: "m", source: "Relevé" }),
      definir({ cibleId: "f1", nom: "Uw", valeur: 1.3, unite: "W/m2.K" }),
      definir({ cibleId: "f1", nom: "Surface vitrée", valeur: 0.9, unite: "m2" }),
      definir({ cibleId: "r1", nom: "Volume déclaré", valeur: 18, unite: "m³" }),
      definir({ cibleId: "r1", nom: "Matériau" }),
      definir({ cibleId: "r1", nom: "Note", valeur: "x".repeat(300) }),
    ]));
    const lignes = exportStudioIfc(doc, meta).split("\n");
    const entite = (prefixe: string) => lignes.find((l) => l.includes(`=${prefixe}(`))!;
    const corps = (l: string) => l.slice(l.indexOf("=") + 1);
    expect(jeuDe(lignes, entite("IFCWALL")).map(corps)).toEqual([
      "IFCPROPERTYSINGLEVALUE('R\\X2\\00E9\\X0\\sistance au feu','Source d\\X2\\00E9\\X0\\clar\\X2\\00E9\\X0\\e : CCTP lot 02',IFCLABEL('EI 60'),$);",
      "IFCPROPERTYSINGLEVALUE('Longueur d\\X2\\00E9\\X0\\clar\\X2\\00E9\\X0\\e','Source d\\X2\\00E9\\X0\\clar\\X2\\00E9\\X0\\e : Relev\\X2\\00E9\\X0\\',IFCLENGTHMEASURE(10.),$);",
    ]);
    // Fenêtre déclarée : les propriétés de l'ouverture vont à son IfcWindow.
    expect(jeuDe(lignes, entite("IFCWINDOW")).map(corps)).toEqual([
      "IFCPROPERTYSINGLEVALUE('Uw','Unit\\X2\\00E9\\X0\\ d\\X2\\00E9\\X0\\clar\\X2\\00E9\\X0\\e : W/m2.K',IFCREAL(1.3),$);",
      "IFCPROPERTYSINGLEVALUE('Surface vitr\\X2\\00E9\\X0\\e',$,IFCAREAMEASURE(0.9),$);",
    ]);
    expect(jeuDe(lignes, entite("IFCOPENINGELEMENT"))).toEqual([]);
    const proxy = jeuDe(lignes, entite("IFCBUILDINGELEMENTPROXY")).map(corps);
    expect(proxy).toHaveLength(2);
    expect(proxy[0]).toBe("IFCPROPERTYSINGLEVALUE('Volume d\\X2\\00E9\\X0\\clar\\X2\\00E9\\X0\\',$,IFCVOLUMEMEASURE(18.),$);");
    expect(proxy[1]).toMatch(/^IFCPROPERTYSINGLEVALUE\('Note',\$,IFCTEXT\('x{300}'\),\$\);$/);
    // Non évaluée : jamais écrite, comptée.
    expect(lignes.some((l) => l.includes("Mat\\X2\\00E9\\X0\\riau"))).toBe(false);
    expect(lignes.filter((l) => l.includes("'Fadi_ProprietesDeclarees'"))).toHaveLength(3);
    expect(lignes.some((l) => l.endsWith("=IFCPROPERTYSINGLEVALUE('DeclaredPropertiesExported',$,IFCINTEGER(6),$);"))).toBe(true);
    expect(lignes.some((l) => l.endsWith("=IFCPROPERTYSINGLEVALUE('DeclaredPropertiesNotEvaluated',$,IFCINTEGER(1),$);"))).toBe(true);
    expect(studioIfcSummary(doc).proprietes).toEqual({ exported: 6, notEvaluated: 1 });
    expect(studioIfcSummary(base()).proprietes).toBeUndefined();
    expect(exportStudioIfc(base(), meta)).not.toMatch(/DeclaredProperties|Fadi_ProprietesDeclarees/);
  });

  it("IFC : une ouverture sans type déclaré porte ses propriétés sur son IfcOpeningElement", () => {
    const doc = applyStudioCommands(base(), unchecked([
      { toolId: "studio.architecture.ouverture", params: { id: "b1", type: "opening", hostId: "m1", position: 6, width: 1, height: 1, sill: 1 } },
      definir({ cibleId: "b1", nom: "Repère", valeur: "B-01" }),
    ]));
    const lignes = exportStudioIfc(doc, meta).split("\n");
    const ouverture = lignes.find((l) => l.includes("=IFCOPENINGELEMENT(") && l.includes(",'b1',"))!;
    expect(jeuDe(lignes, ouverture)).toEqual([expect.stringContaining("IFCLABEL('B-01')")]);
  });
});

const exigence = (e: Partial<ExigenceStudio> & Pick<ExigenceStudio, "id" | "metrique" | "comparaison" | "valeur" | "unite">): ExigenceStudio =>
  ({ libelle: `Exigence ${e.id}`, source: "Programme du maître d’ouvrage, version saisie", ...e });

describe("Exigences versionnées (E.1-02, E.1-04, E.1-06)", () => {
  it("valident métrique, comparaison, unité de la métrique (sans conversion) et source déclarée", () => {
    expect(validerExigence(exigence({ id: "e1", metrique: { type: "total", grandeur: "volume-net" }, comparaison: "<=", valeur: 10, unite: "m3" }), "e")).toMatchObject({ unite: "m3" });
    expect(() => validerExigence(exigence({ id: "e1", metrique: { type: "total", grandeur: "volume-net" }, comparaison: "<=", valeur: 10, unite: "l" }), "e")).toThrow(/unité m3 attendue/);
    expect(() => validerExigence(exigence({ id: "e1", metrique: { type: "nombre" }, comparaison: "<=", valeur: 10, unite: "m" }), "e")).toThrow(/unité u attendue/);
    expect(() => validerExigence({ ...exigence({ id: "e1", metrique: { type: "nombre" }, comparaison: "<=", valeur: 1, unite: "u" }), source: "" }, "e")).toThrow(/source non vide/);
    expect(() => validerExigence(exigence({ id: "e1", metrique: { type: "nombre" }, comparaison: "<=", valeur: 1, unite: "u", tolerance: 1 }), "e")).toThrow(/tolérance admise pour la comparaison =/);
    expect(() => validerExigences([exigence({ id: "e1", metrique: { type: "nombre" }, comparaison: "<", valeur: 1, unite: "u" }), exigence({ id: "e1", metrique: { type: "nombre" }, comparaison: "<", valeur: 2, unite: "u" })], "x")).toThrow(/dupliqué/);
    // Aucun jeu par défaut : une liste vide est valide et c'est l'état initial.
    expect(validerExigences([], "x")).toEqual([]);
  });

  it("une nouvelle version : acceptation conservée si le contenu est inchangé, jamais forgée par le client", () => {
    const partenaire = exigence({ id: "p1", metrique: { type: "nombre", nature: "ouverture" }, comparaison: ">=", valeur: 1, unite: "u", origine: { reference: "Référentiel partenaire R-12" } });
    const v1 = [partenaire];
    const acceptee = accepterExigence(v1, "p1", { par: "u1", parEmail: "a@exemple.fr", le: "2026-10-19T08:00:00.000Z" });
    if (!("exigences" in acceptee)) throw new Error("refus inattendu");
    expect(exigenceUtilisable(v1[0]!)).toBe(false);
    expect(exigenceUtilisable(acceptee.exigences[0]!)).toBe(true);
    expect(accepterExigence(acceptee.exigences, "p1", { par: "u1", le: "2026-10-19T08:00:00.000Z" })).toEqual({ refus: "deja-acceptee" });
    // Le client renvoie la liste sans l'acceptation : elle est conservée tant que le contenu ne change pas.
    const ajout = exigence({ id: "e2", metrique: { type: "total", grandeur: "surface-ouverture" }, comparaison: "<=", valeur: 5, unite: "m2" });
    const v3 = preparerVersion(acceptee.exigences, [partenaire, ajout]);
    expect(v3).toEqual({ exigences: [acceptee.exigences[0], ajout] });
    // Contenu modifié : l'acceptation tombe ; une acceptation ajoutée par le client est refusée.
    const modifiee = { ...partenaire, valeur: 2 };
    expect(preparerVersion(acceptee.exigences, [modifiee])).toEqual({ exigences: [modifiee] });
    expect(preparerVersion(acceptee.exigences, [{ ...modifiee, origine: acceptee.exigences[0]!.origine! }])).toEqual({ refus: "acceptation-forgee", exigenceId: "p1" });
    expect(preparerVersion(v1, [{ ...partenaire, origine: { reference: "Référentiel partenaire R-12", acceptation: { par: "x", le: "2026-10-19T08:00:00.000Z" } } }])).toEqual({ refus: "acceptation-forgee", exigenceId: "p1" });
    expect(preparerVersion(v1, v1)).toEqual({ refus: "inchangee" });
  });
});

describe("Écarts calculés, jamais réécrits (E.1-03, E.1-05)", () => {
  const doc = () => applyStudioCommands(base(), unchecked([definir({ cibleId: "f1", nom: "Uw", valeur: 1.3, unite: "W/m2.K" }), definir({ cibleId: "m1", nom: "Indice", unite: "dB" })]));

  it("satisfaite / non satisfaite / non évaluée, avec la mesure et l'écart signé", () => {
    const q = quantitesStudio(doc());
    const netMur = mesurerMetrique({ type: "objet", objetId: "m1", grandeur: "volume-net" }, q, doc());
    expect(netMur.valeur).toBeCloseTo(10 * 0.2 * 2.5 - 1.2 * 1 * 0.2, 9);
    const jeu = {
      version: 3,
      exigences: [
        exigence({ id: "volume", metrique: { type: "total", grandeur: "volume-net" }, comparaison: "<=", valeur: 4.5, unite: "m3" }),
        exigence({ id: "baies", metrique: { type: "total", grandeur: "surface-ouverture" }, comparaison: ">=", valeur: 2, unite: "m2" }),
        exigence({ id: "nombre", metrique: { type: "nombre", nature: "ouverture" }, comparaison: "=", valeur: 1, unite: "u" }),
        exigence({ id: "calque", metrique: { type: "total", grandeur: "surface", calqueId: "inconnu" }, comparaison: "<=", valeur: 1, unite: "m2" }),
        exigence({ id: "uw", metrique: { type: "propriete", cibleId: "f1", nom: "Uw" }, comparaison: "<=", valeur: 1.4, unite: "W/m2.K" }),
        exigence({ id: "indice", metrique: { type: "propriete", cibleId: "m1", nom: "Indice" }, comparaison: ">=", valeur: 50, unite: "dB" }),
        exigence({ id: "unite", metrique: { type: "propriete", cibleId: "f1", nom: "Uw" }, comparaison: "<=", valeur: 1.4, unite: "W/(m2.K)" }),
      ],
    };
    const r = controlerExigences("etude", "rev-7", doc(), jeu);
    expect(r).toMatchObject({ studyId: "etude", revisionId: "rev-7", version: 3, execution: "execute", conclusion: "non-satisfaite" });
    const statut = Object.fromEntries(r.ecarts.map((e) => [e.exigenceId, [e.statut, e.mesure?.motif]]));
    expect(statut).toEqual({
      // Volume net : celui du seul mur, 4,76 m³ (le rectangle extrudé n'a pas de volume net : volume brut seulement).
      volume: ["non-satisfaite", undefined],
      baies: ["non-satisfaite", undefined],
      nombre: ["satisfaite", undefined],
      calque: ["non-evaluee", "metrique-absente"],
      uw: ["satisfaite", undefined],
      indice: ["non-evaluee", "metrique-non-evaluee"],
      unite: ["non-evaluee", "unite-incompatible"],
    });
    expect(r.ecarts.find((e) => e.exigenceId === "baies")!.ecart).toBeCloseTo(1.2 - 2, 9);
    expect(r.compte).toEqual({ satisfaite: 2, "non-satisfaite": 2, "non-evaluee": 3, "non-utilisee": 0 });
    // L'exigence n'est jamais réécrite.
    expect(jeu.exigences[0]).toEqual(exigence({ id: "volume", metrique: { type: "total", grandeur: "volume-net" }, comparaison: "<=", valeur: 4.5, unite: "m3" }));
  });

  it("état d'exécution distinct de la conclusion : aucun jeu, aucune exigence utilisable, document illisible", () => {
    expect(controlerExigences("e", "r", doc(), null)).toMatchObject({ execution: "non-execute", motifExecution: "aucun-jeu", conclusion: null, version: null });
    expect(controlerExigences("e", "r", doc(), { version: 1, exigences: [] })).toMatchObject({ execution: "non-execute", motifExecution: "aucune-exigence-utilisable", conclusion: null, version: 1 });
    const partenaire = exigence({ id: "p", metrique: { type: "nombre" }, comparaison: ">=", valeur: 1, unite: "u", origine: { reference: "R" } });
    const nonAcceptee = controlerExigences("e", "r", doc(), { version: 2, exigences: [partenaire] });
    expect(nonAcceptee).toMatchObject({ execution: "non-execute", motifExecution: "aucune-exigence-utilisable", conclusion: null });
    expect(nonAcceptee.ecarts).toEqual([{ exigenceId: "p", statut: "non-utilisee", comparaison: ">=", valeurExigee: 1, unite: "u" }]);
    const erreur = controlerExigences("e", "r", { id: "x" }, { version: 2, exigences: [partenaire] });
    expect(erreur).toMatchObject({ execution: "erreur", motifExecution: "document-illisible", conclusion: null });
    expect(erreur.messageErreur).toMatch(/champs absents ou inconnus/);
  });

  it("une référence acceptée est utilisée ; un total partiel ne conclut pas", () => {
    const acceptee = exigence({ id: "p", metrique: { type: "nombre", nature: "mur-architectural" }, comparaison: "=", valeur: 1, unite: "u", origine: { reference: "R", acceptation: { par: "u1", le: "2026-10-19T08:00:00.000Z" } } });
    expect(controlerExigences("e", "r", doc(), { version: 4, exigences: [acceptee] })).toMatchObject({ execution: "execute", conclusion: "satisfaite" });
    // Ligne non extrudée : la surface verticale du document n'a pas d'entrée pour elle, mais le volume est partiel.
    const partiel = applyStudioCommands(base(), unchecked([{ toolId: "studio.dessin.ligne", params: { id: "l2", type: "line", start: { x: 0, y: 20 }, end: { x: 3, y: 20 } } }, { toolId: "studio.objet.extruder", params: { ids: ["l2"], base: 0, height: 1 } }]));
    const r = controlerExigences("e", "r", partiel, { version: 1, exigences: [exigence({ id: "v", metrique: { type: "total", grandeur: "volume" }, comparaison: "<=", valeur: 1000, unite: "m3" })] });
    expect(r.ecarts[0]).toMatchObject({ statut: "non-evaluee", mesure: { motif: "total-partiel" } });
    expect(r.conclusion).toBe("non-evaluee");
  });
});
