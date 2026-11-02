/**
 * BD-9.6 : contrôle des fichiers sources des catalogues (pur, sans base) — les fichiers livrés sont lus tels quels,
 * aucun contenu n'est réécrit ; un fichier illisible est refusé avant toute écriture. Le chargement en base lui-même
 * est éprouvé par la migration (`db:migrate`, CI) et sur base jetable.
 */
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { CLES_CATALOGUES } from "../lib/catalogues.js";
import { controlerFichierCatalogue, empreinteCatalogue, lireFichierCatalogue, ligneBilanCatalogues } from "./catalogues-chargement.js";

describe("BD-9.6 — fichiers sources des catalogues", () => {
  it("chaque fichier livré est un JSON de la forme attendue, rendu tel quel avec son empreinte SHA-256", () => {
    for (const cle of CLES_CATALOGUES) {
      const f = lireFichierCatalogue(cle);
      expect(f.source).toBe(`apps/api/src/data/${f.fichier}`);
      expect(controlerFichierCatalogue(cle, f.octets)).toBe(f.octets.toString("utf8"));
      expect(empreinteCatalogue(f.octets)).toBe(createHash("sha256").update(f.octets).digest("hex"));
    }
  });

  it("refuse un JSON invalide, un tableau, des clés manquantes ou un UTF-8 invalide", () => {
    expect(() => controlerFichierCatalogue("programme-repartition", Buffer.from("{"))).toThrow(/JSON invalide/);
    expect(() => controlerFichierCatalogue("programme-repartition", Buffer.from("[]"))).toThrow(/objet JSON attendu/);
    expect(() => controlerFichierCatalogue("programme-repartition", Buffer.from('{"defaults":{}}'))).toThrow(/clés absentes/);
    expect(() => controlerFichierCatalogue("programme-repartition", Buffer.from([0x7b, 0xff, 0x7d]))).toThrow();
  });

  it("bilan lisible", () => {
    expect(ligneBilanCatalogues([{ cle: "harmonie-moteur", resultat: "inchangee", version: 1, empreinte: "0".repeat(64), taille: 2 }])).toBe("Catalogues : harmonie-moteur v1 inchangée.");
  });
});
