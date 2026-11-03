/**
 * Terrain TER-03 — travailleur GDAL sans base, sur fixtures synthétiques « test seulement ». Exige GDAL (`gdal-bin`,
 * installé dans la CI et dans l'image du travailleur) ; sans GDAL, ces tests sont déclarés non exécutés.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { fromFile } from "geotiff";
import { calculerDerives } from "./derives.js";
import { ecrireFixture } from "./fixtures-synthetiques.js";

const gdal = (() => { try { return execFileSync("gdalinfo", ["--version"]).toString().trim(); } catch { return null; } })();
const dossier = mkdtempSync(join(tmpdir(), "terrain-gdal-"));
afterAll(() => rmSync(dossier, { recursive: true, force: true }));

async function bande(chemin: string): Promise<ArrayLike<number>> {
  const t = await fromFile(chemin);
  try { return ((await (await t.getImage()).readRasters({ samples: [0] })) as unknown as [ArrayLike<number>])[0]; } finally { await t.close?.(); }
}
const info = (chemin: string) => JSON.parse(execFileSync("gdalinfo", ["-json", chemin], { maxBuffer: 64 * 1024 * 1024 }).toString()) as { geoTransform: number[]; coordinateSystem: { wkt: string }; metadata: Record<string, Record<string, string>>; bands: { noDataValue?: number }[] };

describe.skipIf(!gdal)(`travailleur terrain (${gdal ?? "GDAL absent : non exécuté"})`, () => {
  it("plan incliné connu : COG identique à l'original, géoréférence recopiée, pente exacte, courbes droites", async () => {
    const original = join(dossier, "plan.tif");
    // z = 500 + 1 × colonne (pas 0,25 m) : pente = atan(1 / 0,25) ; une colonne NoData au milieu.
    ecrireFixture(original, { largeur: 60, hauteur: 40, valeur: (c) => (c === 30 ? -9999 : 500 + c) });
    const r = await calculerDerives(original, join(dossier, "d1"), { geographique: false, nodata: -9999, equidistance: 10 });
    expect(r.fichiers.map((f) => f.nature)).toEqual(["altitude", "pente", "ombrage"]);
    const [alt, pen, omb] = r.fichiers.map((f) => f.chemin) as [string, string, string];
    for (const f of [alt, pen, omb]) {
      const i = info(f);
      expect(i.metadata["IMAGE_STRUCTURE"]!["LAYOUT"]).toBe("COG");
      expect(i.geoTransform).toEqual(info(original).geoTransform);
      expect(i.coordinateSystem.wkt).toBe(info(original).coordinateSystem.wkt);
    }
    expect(Array.from(await bande(alt))).toEqual(Array.from(await bande(original)));
    const p = await bande(pen);
    const attendue = (Math.atan(1 / 0.25) * 180) / Math.PI;
    expect(p[10 * 60 + 10]).toBeCloseTo(attendue, 3);
    expect(p[10 * 60 + 30]).toBe(-9999);
    expect(p[10 * 60 + 29]).toBe(-9999);
    expect(p[0]).toBe(-9999);
    expect(info(pen).bands[0]!.noDataValue).toBe(-9999);
    expect((await bande(omb))[0]).toBe(0);
    expect(r.cellulesValides).toBe(60 * 40 - 40);
    expect(r.rectangles).toHaveLength(2);
    for (const k of r.courbes) for (const l of k.lignes) { const xs = l.map(([x]) => x); expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(1e-6); }
    // 530 m tombe exactement dans la colonne NoData (colonne 30) : aucune courbe inventée à travers le trou.
    expect(r.courbes.map((k) => k.altitude)).toEqual([510, 520, 540, 550]);
    const c510 = r.courbes[0]!.lignes[0]![0]![0];
    expect(c510).toBeCloseTo(2662500 + (10 + 0.5) * 0.25, 6);
  });

  it("refuse un original illisible au lieu de produire un dérivé", async () => {
    const faux = join(dossier, "faux.tif");
    execFileSync("sh", ["-c", `printf 'pas un tiff' > ${faux}`]);
    await expect(calculerDerives(faux, join(dossier, "d2"), { geographique: false, nodata: null, equidistance: 10 })).rejects.toThrow();
  });
});
