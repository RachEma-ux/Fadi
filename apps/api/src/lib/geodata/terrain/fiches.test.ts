// Liste fermée des fiches de terrain (TER-D10, TER-D7 révisée) : terrain-import n'accepte que les fiches livrées, par leur
// nom, et jamais une adresse ni (en production) un chemin. Sans base ni réseau.
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fichesLivrees, lireFiche } from "./fiches.js";

const LISTE = ["copernicus-glo30-n33-w008", "gedtm30-v1-2-benslimane", "lucerne-dom2024-mns-1150337", "lucerne-dtm2024-mnt-1150337"];

describe("fiches de terrain livrées (liste fermée)", () => {
  it("la liste fermée compte exactement les 4 fiches livrées", () => {
    expect(fichesLivrees()).toEqual(LISTE);
  });

  it("chaque fiche de la liste est lue par son nom, en mode livré, avec l'adresse relue de la fiche", () => {
    for (const nom of LISTE) {
      const d = lireFiche(nom, true);
      expect(d.cle).toBe(nom);
      expect(d.acquisition.methode === "depot" || d.acquisition.url.startsWith("https://")).toBe(true);
    }
  });

  it("refuse toute adresse libre, en téléchargement comme en import de production", () => {
    for (const url of ["https://exemple.test/a.tif", "http://169.254.169.254/latest", "file:///etc/passwd", "s3://seau/a.tif"]) {
      expect(() => lireFiche(url, true)).toThrow(/Fiche livrée attendue/);
      expect(() => lireFiche(url, false)).toThrow(/Fiche introuvable/);
    }
  });

  it("refuse un nom hors de la liste et, en mode livré, tout chemin (même vers une fiche valide)", () => {
    expect(() => lireFiche("fiche-inconnue", true)).toThrow(/Fiche introuvable/);
    expect(() => lireFiche("../sources/x", true)).toThrow(/Fiche livrée attendue/);
    const d = mkdtempSync(join(tmpdir(), "fiche-"));
    const chemin = join(d, "f.json");
    writeFileSync(chemin, "{}");
    expect(() => lireFiche(chemin, true)).toThrow(/Fiche livrée attendue/);
  });
});
