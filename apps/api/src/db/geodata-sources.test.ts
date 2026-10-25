/**
 * Fiches de source qualifiées livrées (`docs/geodata/sources`, D-GD-04, D-GD-12) : chaque fiche est complète (licence,
 * attribution, droits par usage connus) et, quand ses données sont livrées avec elle, le fichier existe, son empreinte
 * est celle de la fiche, il passe la validation partagée sous la borne d'une couche V1 et ses codes sont uniques.
 * Sans base de données.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { OBJETS_PAR_COUCHE, USAGES, validerGeoJSON } from "@parcours/geodata-model";
import { codesDesObjets } from "../lib/geodata/versions.js";
import type { FicheSource } from "./geodata-reference.js";

const DOSSIER = fileURLToPath(new URL("../../../../docs/geodata/sources/", import.meta.url));
const fiches = readdirSync(DOSSIER).filter((f) => f.endsWith(".json")).sort();

describe("fiches de source GeoData livrées", () => {
  it("au moins les limites geoBoundaries et une source ouverte à données livrées", () => {
    expect(fiches).toContain("geoboundaries-mar-adm1.json");
    expect(fiches.some((f) => f.startsWith("osm-mar-"))).toBe(true);
  });

  for (const nom of fiches) {
    it(nom, () => {
      const fiche = JSON.parse(readFileSync(join(DOSSIER, nom), "utf8")) as FicheSource;
      expect(`${fiche.cle}.json`).toBe(nom);
      expect(fiche.version.licence.length).toBeGreaterThan(5);
      expect(fiche.version.attribution.length).toBeGreaterThan(5);
      expect(fiche.version.synthetique).toBe(false);
      for (const u of USAGES) expect(["autorise", "refuse", "inconnu"]).toContain(fiche.version.droits[u]);
      expect(fiche.version.url || fiche.version.fichier).toBeTruthy();
      if (!fiche.version.fichier) return;
      expect(fiche.version.fichier).toMatch(/^donnees\/[a-z0-9-]+\.geojson$/);
      const octets = readFileSync(join(DOSSIER, fiche.version.fichier));
      expect(createHash("sha256").update(octets).digest("hex")).toBe(fiche.version.empreinte);
      const v = validerGeoJSON(JSON.parse(octets.toString("utf8")), { octets: 200 * 1024 * 1024, objets: OBJETS_PAR_COUCHE, sommets: 20_000_000, proprietes: 200, longueurTexte: 2000 });
      expect(v.ok).toBe(true);
      if (!v.ok) return;
      const { doublons, manquants } = codesDesObjets(v.objets, fiche.couche.champCode);
      expect(doublons).toEqual([]);
      expect(manquants).toBe(0);
    });
  }
});
