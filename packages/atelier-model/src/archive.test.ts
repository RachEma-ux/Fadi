import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { verifierModele } from "./archive.js";
import { importerModeleNatif, type JeuNatif, commandesParcelleNative } from "./import/natif.js";
import { appliquerLot, CONTRAT_COMMANDES } from "./commandes/index.js";
import { projeterPourAnalyse } from "./projection/analyse.js";

const JEU = JSON.parse(readFileSync(new URL("../../../apps/api/src/data/examples/p118-native-model.json", import.meta.url), "utf8")) as JeuNatif;

describe("relecture d'un modèle d'archive", () => {
  const { modele } = importerModeleNatif(JEU);

  it("le P.118 importé, passé par JSON, est relu à l'identique", () => {
    const r = verifierModele(JSON.parse(JSON.stringify(modele)));
    if (!r.ok) throw new Error(r.erreurs.slice(0, 5).join("\n"));
    expect(r.modele).toEqual(JSON.parse(JSON.stringify(modele)));
  });

  it("refuse en entier une archive avec une grandeur sans unité, un niveau inconnu ou une classe inconnue", () => {
    const brut = JSON.parse(JSON.stringify(modele));
    const murId = Object.keys(brut.objets).find((k) => brut.objets[k].classe === "mur")!;
    brut.objets[murId].params.epaisseur = 0.2;
    const autre = Object.keys(brut.objets).find((k) => k !== murId)!;
    brut.objets[autre].niveauId = "inexistant";
    brut.objets["x"] = { id: "x", classe: "soucoupe", params: {} };
    const r = verifierModele(brut);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.erreurs.some((e) => e.includes(murId) && e.includes("epaisseur"))).toBe(true);
      expect(r.erreurs.some((e) => e.includes("inexistant"))).toBe(true);
      expect(r.erreurs.some((e) => e.includes("soucoupe"))).toBe(true);
    }
    expect(verifierModele({ version: 2 }).ok).toBe(false);
  });
});

describe("transmission de la parcelle en commandes", () => {
  const { modele } = importerModeleNatif(JEU);
  const np = (JEU.domains as Record<string, unknown>)["nativeParcel"] as Record<string, unknown>;

  it("rejouer la parcelle d'origine ne déplace pas le repère local et projette la même parcelle", () => {
    const fp = ((JEU.domains as Record<string, unknown>)["buildingFootprint"] as { vertices: unknown[] }).vertices;
    const cmds = commandesParcelleNative(np, fp, modele);
    const apres = appliquerLot(modele, { requestId: "p", baseRevision: 0, contract: CONTRAT_COMMANDES, label: "", commands: cmds }).etat;
    expect(apres.site.parcelle!.origineLocale).toEqual(modele.site.parcelle!.origineLocale);
    expect(projeterPourAnalyse(apres).parcel).toEqual(projeterPourAnalyse(modele).parcel);
    expect(projeterPourAnalyse(apres).footprint).toEqual(projeterPourAnalyse(modele).footprint);
  });
});

describe("exports de travail d'un niveau", () => {
  const { modele } = importerModeleNatif(JEU);
  it("DXF R12 : en-tête, calques, entités du niveau, origine cadastrale en commentaire", async () => {
    const { dxfNiveau, csvQuantites } = await import("./echanges/plan.js");
    const dxf = dxfNiveau(modele, "mezz");
    expect(dxf.startsWith("999\r\nFadi · Atelier · niveau Mezzanine")).toBe(true);
    expect(dxf).toContain("AC1009");
    expect(dxf).toMatch(/Origine du repère local = \(\d+(\.\d+)? ; \d+(\.\d+)?\) en EPSG:26191/);
    expect(dxf.match(/\r\nPOLYLINE\r\n/g)!.length).toBeGreaterThan(20);
    expect(dxf.trimEnd().endsWith("EOF")).toBe(true);
    const csv = csvQuantites(modele);
    expect(csv.startsWith("﻿\"Niveau\";")).toBe(true);
    expect(csv).toContain("Mezzanine");
    expect(csv.split("\r\n").filter((l) => l.includes('"pièce"')).length).toBe(74);
  });
});
