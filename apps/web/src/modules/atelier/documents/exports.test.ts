import { describe, expect, it } from "vitest";
import { estNonEvaluee, type EtatModele } from "@parcours/atelier-model";
import { creerRegistres } from "../socle";
import { TIRET } from "./annotations";
import { installerAvec } from "./installer";
import { calculerMetre, csvMetre, metrePerime, nomCsvMetre, type LigneMetre } from "./metre";
import { construireDxf, lireDxf, texteDxf } from "./exports/dxf";
import { echelleImpression, pageImpression } from "./exports/impression";
import { dimensionsPng, dimensionsPngVue } from "./exports/png";
import { cadreSvg, construireSvg } from "./exports/svg";
import { nomExport, preparerVue } from "./exports/vue";
import { banc, cmd, effetsEspions, etatDeTest, lot, m, P, appui } from "./__tests__/banc";
import { DESSINATEUR_TEST } from "./__tests__/repli-test";

const DATE = new Date("2026-10-04T12:00:00Z");
const t = { niveauId: "rdc", calqueId: "C2" };

/** Rez : deux murs (types « non-type » et « cloison »), une porte, une fenêtre, une dalle trouée, une pièce, un escalier, un poteau ; une cote et un texte. */
function etatComplet(): EtatModele {
  return etatDeTest(
    cmd("type.definir", { definition: { id: "cloison", classe: "mur", nom: "Cloison", categorie: "intérieur", proprietes: [], provenance: "saisie", statut: "declaree" } }),
    cmd("mur.tracer", { id: "M1", ...t, a: P(0, 0), b: P(4, 0), epaisseur: m(0.2), hauteur: m(3), alignement: "axe", typeId: "non-type", exterieur: true }),
    cmd("mur.tracer", { id: "M2", ...t, a: P(0, 0), b: P(0, 2.5), epaisseur: m(0.1), hauteur: m(2.5), alignement: "axe", typeId: "cloison", exterieur: false }),
    cmd("ouverture.poser", { id: "PO1", ...t, classe: "porte", murHoteId: "M1", position: { t: 0.5 }, largeur: m(0.9), hauteur: m(2.1), allege: m(0), typeId: "non-type" }),
    cmd("ouverture.poser", { id: "FE1", ...t, classe: "fenetre", murHoteId: "M2", position: { t: 0.5 }, largeur: m(1), hauteur: m(1), allege: m(1), typeId: "non-type" }),
    cmd("dalle.creer", { id: "D1", ...t, contour: [P(0, 0), P(10, 0), P(10, 8), P(0, 8)], trous: [{ id: "tr", polygone: [P(1, 1), P(3, 1), P(3, 3), P(1, 3)] }], epaisseur: m(0.25), decalageBase: m(-0.25) }),
    cmd("piece.creer", { id: "R1", ...t, polygones: [{ contour: [P(0, 0), P(4, 0), P(4, 3), P(0, 3)], trous: [] }], nom: "Séjour", code: "R01" }),
    cmd("escalier.creer", { id: "E1", ...t, axe: { a: P(1, 1), b: P(4, 1) }, largeur: m(1), hauteurAFranchir: m(3), marches: 17, contremarches: 18, epaisseurPaillasse: m(0.2), decalageBase: m(0), referencePlanSeulement: false }),
    cmd("poteau.creer", { id: "X1", ...t, point: P(2, 2), formeId: "basic-square", largeur: m(0.3), profondeur: m(0.3), hauteur: m(3), angle: { value: 0, unit: "°" } }),
    cmd("cotation.creer", { id: "K1", niveauId: "rdc", calqueId: "C1", a: P(0, 0), b: P(4.5, 0), decalage: m(0.6), references: [] }),
    cmd("texte.creer", { id: "T1", niveauId: "rdc", calqueId: "C1", position: P(2, 3), texte: "A&B <1> é" }),
  );
}

const ligne = (l: readonly LigneMetre[], rubrique: string, grandeur: string, groupe: string | null = null) => l.find((x) => x.rubrique === rubrique && x.grandeur === grandeur && x.groupe === groupe);

describe("métré du niveau actif", () => {
  it("chaque quantité, par type, exacte, marquée de la révision et de l'empreinte", () => {
    const etat = etatComplet();
    const mt = calculerMetre(etat, "rdc");
    expect(mt).toMatchObject({ niveauId: "rdc", niveauNom: "Rez", revision: etat.revision, empreinte: etat.empreinte, regle: "quantites/1" });
    const l = mt.lignes;
    expect(ligne(l, "murs", "nombre", "non-type")).toMatchObject({ valeur: 1, objets: ["M1"] });
    expect(ligne(l, "murs", "nombre", "cloison")).toMatchObject({ valeur: 1, objets: ["M2"] });
    expect(ligne(l, "murs", "longueur d'axe", "non-type")).toMatchObject({ valeur: 4, unite: "m", statut: "calculee" });
    expect(ligne(l, "murs", "longueur d'axe", "cloison")?.valeur).toBe(2.5);
    expect(ligne(l, "murs", "aire brute d'une face", "non-type")?.valeur).toBe(12);
    expect(ligne(l, "murs", "aire nette d'une face", "non-type")?.valeur).toBe(12 - 0.9 * 2.1);
    expect(ligne(l, "murs", "volume net", "non-type")?.valeur).toBe(4 * 0.2 * 3 - 0.9 * 2.1 * 0.2);
    expect(ligne(l, "portes", "nombre", "non-type")?.valeur).toBe(1);
    expect(ligne(l, "fenetres", "nombre", "non-type")?.valeur).toBe(1);
    expect(ligne(l, "portes", "aire de baie", "non-type")).toMatchObject({ valeur: 0.9 * 2.1, unite: "m²" });
    expect(ligne(l, "dalles", "aire nette", "sans type")?.valeur).toBe(76);
    expect(ligne(l, "dalles", "volume", "sans type")).toMatchObject({ valeur: 19, unite: "m³" });
    expect(ligne(l, "pieces", "aire calculée", "R01 · Séjour")?.valeur).toBe(12);
    expect(ligne(l, "pieces", "aire calculée (total)")?.valeur).toBe(12);
    expect(ligne(l, "escaliers", "nombre")?.valeur).toBe(1);
    expect(ligne(l, "escaliers", "nombre de marches")).toMatchObject({ valeur: 17, unite: "unite" });
    expect(ligne(l, "poteaux", "nombre")?.valeur).toBe(1);
    expect(ligne(l, "poteaux", "volume")?.valeur).toBeCloseTo(0.27, 12);
    // Cotations et textes n'entrent dans aucune quantité.
    expect(l.some((x) => x.objets.includes("K1") || x.objets.includes("T1"))).toBe(false);
    // Reproductible ; périmé après une commande.
    expect(calculerMetre(etat, "rdc")).toEqual(mt);
    expect(metrePerime(mt, etat)).toBe(false);
    const r = lot(etat, [cmd("mur.modifier", { modifications: { hauteur: m(2.8) } }, ["M1"])]);
    expect(r.ok && metrePerime(mt, r.etat)).toBe(true);
  });

  it("classes absentes : zéro ligne, pas d'erreur ; marches non évaluées propagées (jamais 0)", () => {
    expect(calculerMetre(etatDeTest(), "rdc").lignes).toEqual([]);
    expect(calculerMetre(etatDeTest(), "inconnu").lignes).toEqual([]);
    const etat = etatDeTest(cmd("escalier.creer", { id: "E2", ...t, axe: { a: P(1, 1), b: P(4, 1) }, largeur: m(1), hauteurAFranchir: m(3), marches: { nonEvaluee: true, motif: "source muette" }, contremarches: 18, epaisseurPaillasse: m(0.2), decalageBase: m(0), referencePlanSeulement: false }));
    const marches = ligne(calculerMetre(etat, "rdc").lignes, "escaliers", "nombre de marches");
    expect(marches && estNonEvaluee(marches.valeur)).toBe(true);
    expect(marches).toMatchObject({ statut: "non-evaluee", partiel: { somme: 0, nonEvalues: ["E2"] } });
  });

  it("CSV : BOM, métadonnées, `;`, valeurs exactes, cellules protégées, nom porteur de la révision", () => {
    const etat = etatComplet();
    const mt = calculerMetre(etat, "rdc");
    const csv = csvMetre(mt, DATE);
    expect(csv.startsWith("﻿")).toBe(true);
    const lignes = csv.slice(1).split("\r\n");
    expect(lignes.slice(0, 7)).toEqual([`"projet";"p"`, `"niveau";"Rez"`, `"niveau_id";"rdc"`, `"revision";${etat.revision}`, `"empreinte";"${etat.empreinte}"`, `"regles";"quantites/1"`, `"date";"2026-10-04T12:00:00.000Z"`]);
    expect(lignes).toContain(`"Murs";"non-type";"volume net";${String(4 * 0.2 * 3 - 0.9 * 2.1 * 0.2)};"m³";"calculee";"M1";""`);
    expect(nomCsvMetre(mt)).toBe(`p_Rez_r${etat.revision}_metre.csv`);
  });
});

function vueDe(etat: EtatModele, masques: readonly string[] = []) {
  const r = creerRegistres();
  installerAvec({ effets: effetsEspions() })(r);
  r.dessinateurs.enregistrer(DESSINATEUR_TEST);
  const v = preparerVue({ dessinateurs: r.dessinateurs, etat, niveauId: "rdc", calquesMasques: masques, date: DATE });
  if (!v.ok) throw new Error(v.erreur.message);
  return v.vue;
}

describe("vue exportée", () => {
  it("construite par dessinerNiveau : calques masqués exclus ; niveau vide refusé", () => {
    const etat = etatComplet();
    const v = vueDe(etat);
    expect(v.dessins.map((d) => d.objetId)).toEqual(["D1", "M1", "M2", "X1", "K1", "T1"]);
    expect(v.calques.get("M1")).toEqual({ id: "C2", nom: "Murs & cloisons", couleur: "#aa0000" });
    expect(vueDe(etat, ["C2"]).dessins.map((d) => d.objetId)).toEqual(["K1", "T1"]);
    const r = creerRegistres();
    const vide = preparerVue({ dessinateurs: r.dessinateurs, etat: etatDeTest(), niveauId: "rdc", calquesMasques: [], date: DATE });
    expect(vide.ok).toBe(false);
    expect(nomExport(v.meta, "svg")).toBe(`p_Rez_plan_r${etat.revision}.svg`);
  });
});

describe("SVG", () => {
  it("viewBox = emprise × 100 + marge, y retourné, textes échappés, métadonnées, un groupe par calque", () => {
    const etat = etatComplet();
    const v = vueDe(etat);
    const svg = construireSvg(v);
    const c = cadreSvg(v);
    // Le tiret oblique de la cote en a = (0, 0) dépasse à gauche de TIRET / √2.
    expect(v.emprise).toMatchObject({ minX: -TIRET / Math.SQRT2, maxX: 10, maxY: 8 });
    expect(svg).toContain(`viewBox="0 0 ${c.largeur} ${c.hauteur}"`);
    expect(c.vers({ x: v.emprise.minX, y: 8 })).toEqual({ x: 100, y: 100 });
    expect(svg).toContain("<tspan");
    expect(svg).toContain("A&amp;B &lt;1&gt; é");
    expect(svg).not.toContain("<1>");
    expect(svg).toContain(">4,50 m<");
    expect(svg).toContain(`<fadi:revision>${etat.revision}</fadi:revision>`);
    expect(svg).toContain("<fadi:mention>vue de travail, sans échelle</fadi:mention>");
    expect(svg).toContain(`data-calque="Murs &amp; cloisons"`);
    expect(svg).toContain(`data-calque="Cotations"`);
    expect(svg.match(/<circle /g)).toHaveLength(1);
    expect(svg).not.toMatch(/<script|href=/);
    // XML bien formé au sens minimal : balises équilibrées.
    const ouvertes = (svg.match(/<(g|svg|text|tspan|metadata|title)[\s>]/g) ?? []).length;
    const fermees = (svg.match(/<\/(g|svg|text|tspan|metadata|title)>/g) ?? []).length;
    expect(ouvertes).toBe(fermees);
  });
});

describe("DXF", () => {
  it("se relit ligne à ligne : en-tête mètres, calques du modèle, entités LINE / LWPOLYLINE / CIRCLE / ARC / TEXT", () => {
    const etat = etatComplet();
    const r0 = lot(etat, [cmd("esquisse.arc", { id: "A1", niveauId: "rdc", calqueId: "C2", centre: P(5, 5), rayon: m(1), angleDebut: { value: 0, unit: "°" }, angleFin: { value: 90, unit: "°" }, sens: "trigo" })]);
    if (!r0.ok) throw new Error(JSON.stringify(r0.erreurs));
    const dxf = construireDxf(vueDe(r0.etat));
    const p = lireDxf(dxf);
    const valeurApres = (variable: string) => p[p.findIndex((x) => x.code === 9 && x.valeur === variable) + 1];
    expect(valeurApres("$ACADVER")).toEqual({ code: 1, valeur: "AC1015" });
    expect(valeurApres("$INSUNITS")).toEqual({ code: 70, valeur: "6" });
    expect(valeurApres("$MEASUREMENT")).toEqual({ code: 70, valeur: "1" });
    expect(p.at(-1)).toEqual({ code: 0, valeur: "EOF" });
    // Calques : un par calque du modèle (noms nettoyés), couleur vraie.
    const calques = p.filter((x, i) => x.code === 2 && p.slice(0, i).reverse().find((y) => y.code === 0)?.valeur === "LAYER").map((x) => x.valeur);
    expect(calques).toEqual(["Murs & cloisons", "Cotations"]);
    expect(p.some((x) => x.code === 420 && x.valeur === String(0xaa0000))).toBe(true);
    // Entités par type et par calque.
    const debut = p.findIndex((x) => x.code === 2 && x.valeur === "ENTITIES");
    const entites: { type: string; calque: string; paires: typeof p }[] = [];
    for (const x of p.slice(debut + 1)) {
      if (x.code === 0) entites.push({ type: x.valeur, calque: "", paires: [] });
      else {
        const e = entites.at(-1);
        if (e) {
          e.paires.push(x);
          if (x.code === 8) e.calque = x.valeur;
        }
      }
    }
    const types = entites.filter((e) => !["ENDSEC", "EOF"].includes(e.type));
    const compte = (type: string, calque: string) => types.filter((e) => e.type === type && e.calque === calque).length;
    expect(compte("LWPOLYLINE", "Murs & cloisons")).toBe(1); // dalle
    expect(compte("LINE", "Murs & cloisons")).toBe(2); // deux murs
    expect(compte("CIRCLE", "Murs & cloisons")).toBe(1); // poteau
    expect(compte("ARC", "Murs & cloisons")).toBe(1);
    expect(compte("LINE", "Cotations")).toBe(5); // ligne de cote, deux attaches, deux tirets
    expect(compte("TEXT", "Cotations")).toBe(2); // valeur de la cote, texte
    const arc = types.find((e) => e.type === "ARC");
    expect(arc?.paires.filter((x) => [10, 20, 40, 50, 51].includes(x.code)).map((x) => x.valeur)).toEqual(["5", "5", "1", "0", "90"]);
    const mur = types.find((e) => e.type === "LINE" && e.calque === "Murs & cloisons");
    expect(mur?.paires.filter((x) => [10, 20, 11, 21].includes(x.code)).map((x) => Number(x.valeur))).toEqual([0, 0, 4, 0]);
    const textes = types.filter((e) => e.type === "TEXT").map((e) => e.paires.find((x) => x.code === 1)?.valeur);
    expect(textes).toEqual(["4,50 m", "A&B <1> \\U+00E9"]);
    // Poignées uniques.
    const poignees = p.filter((x) => x.code === 5).map((x) => x.valeur);
    expect(new Set(poignees).size).toBe(poignees.length);
    expect(texteDxf("Étage")).toBe("\\U+00C9tage");
  });
});

describe("PNG et impression (parties pures)", () => {
  it("dimensions : proportions conservées, facteur 2, plafond 4 096 px signalé", () => {
    expect(dimensionsPng(1200, 1000)).toEqual({ largeur: 2400, hauteur: 2000, pixelsParMetre: 200, reduit: false });
    const d = dimensionsPng(4000, 1000);
    expect(d).toEqual({ largeur: 4096, hauteur: 1024, pixelsParMetre: 102.4, reduit: true });
    const v = vueDe(etatComplet());
    const dv = dimensionsPngVue(v);
    expect(dv.largeur / dv.hauteur).toBeCloseTo(cadreSvg(v).largeur / cadreSvg(v).hauteur, 3);
  });

  it("impression : échelle ronde déclarée qui tient en A3, cartouche (projet, niveau, révision, date, échelle)", () => {
    const etat = etatComplet();
    const v = vueDe(etat);
    expect(echelleImpression(v)).toBe(50); // ≈ 12,05 m × 10 m → ≈ 241 × 200 mm à 1:50
    const html = pageImpression(v, construireSvg(v));
    expect(html).toContain("@page { size: A3 landscape");
    expect(html).toContain("1:50 sur A3 paysage");
    expect(html).toContain(`<th scope="row">Révision</th><td>${etat.revision}</td>`);
    expect(html).toMatch(/width="241\.06\d*mm" height="200mm"/);
    expect(echelleImpression({ emprise: { minX: 0, minY: 0, maxX: 1e6, maxY: 1 } })).toBeNull();
  });
});

describe("commandes d'export (outils Partager)", () => {
  it("SVG, DXF, PNG, CSV téléchargés et enregistrés au catalogue avec la révision rendue ; aucune commande", async () => {
    const etat = etatComplet();
    const b = banc(etat);
    for (const id of ["partager.exporter-svg", "partager.exporter-dxf", "partager.exporter-png", "partager.exporter-metre"]) {
      expect(b.pilote.activer(id)).toEqual({ ok: true });
      await new Promise((r) => setTimeout(r, 0));
      expect(b.pilote.apercu().consigne).toMatch(/enregistré au catalogue/);
      await b.jouer(appui(0, 0));
      expect(b.pilote.outilActif()).toBeNull();
    }
    expect(b.effets.telecharges.map((x) => x.nom)).toEqual([`p_Rez_plan_r${etat.revision}.svg`, `p_Rez_plan_r${etat.revision}.dxf`, `p_Rez_plan_r${etat.revision}.png`, `p_Rez_r${etat.revision}_metre.csv`]);
    expect(b.effets.enregistres.map((e) => [e.kind, e.levelId, e.view.revision])).toEqual([
      ["svg", "rdc", etat.revision],
      ["dxf", "rdc", etat.revision],
      ["png", "rdc", etat.revision],
      ["csv", "rdc", etat.revision],
    ]);
    expect(await b.effets.telecharges[0]?.contenu.text()).toContain("<svg");
    expect(b.valides).toEqual([]);
    expect(b.essais).toEqual([]);
  });

  it("calques masqués de la vue respectés ; lecture seule : téléchargé, pas de catalogue ; niveau vide refusé ; impression", async () => {
    const b = banc(etatComplet(), { ecriture: false });
    b.vue.modifier({ calquesMasques: ["C2"] });
    b.pilote.activer("partager.exporter-svg");
    const svg = await b.effets.telecharges[0]?.contenu.text();
    expect(svg).not.toContain("data-calque=\"Murs");
    expect(b.pilote.apercu().consigne).toMatch(/non enregistré au catalogue \(lecture seule\)/);
    expect(b.effets.enregistres).toEqual([]);
    b.pilote.activer("partager.imprimer");
    expect(b.effets.impressions[0]).toContain("Cartouche");
    b.vue.modifier({ niveauActifId: "r1" });
    b.pilote.activer("partager.exporter-dxf");
    expect(b.pilote.apercu().erreurs[0]?.cause).toMatch(/rien à exporter/);
    expect(b.effets.telecharges).toHaveLength(1);
  });
});
