/**
 * Terrain (TER-02) sans base : stockage adressé par empreinte et lecture d'en-tête, sur fixtures synthétiques « test
 * seulement ».
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { controlerTerrain, validerDeclarationTerrain } from "@parcours/geodata-model";
import { ErreurStockage, StockageTerrain, empreinteFichier } from "./stockage.js";
import { FichierIllisible, lireEnTete, signatureTiff } from "./entete.js";
import { ecrireFixture, ficheSynthetique } from "./fixtures-synthetiques.js";

let racine: string;
let s: StockageTerrain;
beforeEach(async () => {
  racine = mkdtempSync(join(tmpdir(), "fadi-terrain-"));
  s = new StockageTerrain(racine);
  await s.preparer();
});
afterEach(() => rmSync(racine, { recursive: true, force: true }));

describe("stockage du terrain (TER-D5)", () => {
  it("refuse tout chemin dans un nom de dépôt et toute clé hors du volume", () => {
    for (const nom of ["../x.tif", "a/b.tif", ".cache", "", "x\0.tif"]) expect(() => s.cheminDepot(nom)).toThrow(ErreurStockage);
    for (const cle of ["../etc/passwd", "originaux/../../x", "/abs", "depot/x"]) expect(() => s.chemin(cle)).toThrow(ErreurStockage);
    expect(s.chemin(`originaux/${"a".repeat(64)}`)).toBe(join(racine, "originaux", "a".repeat(64)));
  });

  it("archive par empreinte, en lecture seule, sans réécrire ni perdre le dépôt", async () => {
    const src = s.cheminDepot("plan.tif");
    const octets = ecrireFixture(src);
    const { empreinte, taille } = await empreinteFichier(src);
    expect(empreinte).toBe(createHash("sha256").update(octets).digest("hex"));
    expect(taille).toBe(octets.length);
    const a = await s.archiverOriginal(src, empreinte);
    expect(a).toEqual({ cle: `originaux/${empreinte}`, deja: false });
    expect(statSync(s.chemin(a.cle)).mode & 0o222).toBe(0);
    expect(existsSync(src)).toBe(true);
    expect((await s.archiverOriginal(src, empreinte)).deja).toBe(true);
    await s.retirerDuDepot("plan.tif");
    expect(existsSync(src)).toBe(false);
    expect(await s.utilisation()).toBe(octets.length);
  });

  it("refuse un original altéré au lieu de le remplacer", async () => {
    const src = s.cheminDepot("plan.tif");
    ecrireFixture(src);
    const { empreinte } = await empreinteFichier(src);
    const a = await s.archiverOriginal(src, empreinte);
    chmodSync(s.chemin(a.cle), 0o644);
    writeFileSync(s.chemin(a.cle), "altéré");
    await expect(s.archiverOriginal(src, empreinte)).rejects.toThrow(/altéré/);
    expect(readFileSync(s.chemin(a.cle), "utf8")).toBe("altéré");
  });

  it("refuse une copie dont l'empreinte ne correspond pas", async () => {
    const src = s.cheminDepot("plan.tif");
    ecrireFixture(src);
    await expect(s.archiverOriginal(src, "b".repeat(64))).rejects.toThrow(/empreinte/);
    expect(existsSync(s.chemin(`originaux/${"b".repeat(64)}`))).toBe(false);
  });
});

describe("en-tête d'un GeoTIFF de terrain", () => {
  it("lit repère, pas, NoData, type et référence verticale tels que déclarés par le fichier", async () => {
    const p = join(racine, "a.tif");
    ecrireFixture(p, { verticalEpsg: 5728, nodata: -9999 });
    const e = await lireEnTete(p);
    expect(e).toMatchObject({ crsHorizontal: "EPSG:2056", geographique: false, verticalEpsg: 5728, uniteVerticaleEpsg: 9001, uniteHorizontaleEpsg: 9001, pas: [0.25, 0.25], nodata: -9999, typeEchantillon: "flottant", bits: 32, pixel: "aire", largeur: 40, hauteur: 30 });
    expect(e.bornes).toEqual([2662500, 1210500 - 30 * 0.25, 2662500 + 40 * 0.25, 1210500]);
  });

  it("refuse un fichier qui n'est pas un TIFF (signature)", async () => {
    const p = join(racine, "faux.tif");
    writeFileSync(p, "<html>pas un GeoTIFF</html>");
    expect(await signatureTiff(p)).toBe(false);
    await expect(lireEnTete(p)).rejects.toBeInstanceOf(FichierIllisible);
  });

  it("chaîne complète sans base : fixture conforme → prête au traitement ; datum incompatible → quarantaine", async () => {
    const p = join(racine, "b.tif");
    ecrireFixture(p);
    const d = validerDeclarationTerrain(ficheSynthetique());
    if (!d.ok) throw new Error(d.erreurs.join());
    expect(controlerTerrain(await lireEnTete(p), d.declaration).etat).toBe("traitement");
    ecrireFixture(p, { verticalEpsg: 3855 });
    const v = controlerTerrain(await lireEnTete(p), d.declaration);
    expect(v.etat).toBe("quarantaine");
    expect(v.motifs.map((m) => m.code)).toEqual(["datum-incompatible"]);
  });
});
