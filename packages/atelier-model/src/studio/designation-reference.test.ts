/**
 * TR-AC-011 (préparation, lot G5) — ce que la désignation du build et du profil de charge de référence exigera. Rien
 * n'est désigné (DEC-13, décision du maître d'ouvrage) : `DESIGNATION_CONFORMITE` reste null ; on contrôle la forme
 * qu'une désignation devra avoir, les profils de charge que le dépôt sait exécuter, et qu'une désignation valide rendrait
 * bien un outil « conforme » par la règle existante — jamais une désignation mal formée.
 */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  APPAREILS_RECETTE, DESIGNATION_CONFORMITE, evaluerFicheOutil, FORME_BUILD_DESIGNE, PREUVES_EXECUTION_OUTILS, preuveRecevable, PROFILS_CHARGE_CANDIDATS,
  STUDIO_FICHES_OUTILS, validerDesignation, type DemandeDesignation,
} from "./fiches-outils.js";

const RACINE = fileURLToPath(new URL("../../../../", import.meta.url));
const BUILD = `${"a".repeat(40)}+sha256:${"b".repeat(64)}`;
const valide: DemandeDesignation = { build: BUILD, profilsCharge: ["profil-20-outils-chromium-bureau-ci", "S3-chromium-bureau-ci"], decision: "D-999", date: "2026-11-02" };

describe("TR-AC-011 — préparation de la désignation du build et du profil de charge de référence", () => {
  it("aucune désignation n'est prise à la place du maître d'ouvrage ; les preuves enregistrées, s'il en vient, devront être recevables", () => {
    expect(DESIGNATION_CONFORMITE).toBeNull();
    for (const p of PREUVES_EXECUTION_OUTILS) expect(preuveRecevable(p)).toEqual([]);
  });

  it("profils de charge candidats : jeux de données et recettes existants au dépôt, appareils de DEC-13, réseau « non évalué »", () => {
    expect(PROFILS_CHARGE_CANDIDATS.map((p) => p.id)).toEqual([
      "profil-20-outils-chromium-bureau-ci", "profil-20-outils-chromium-telephone-ci",
      "S1-chromium-bureau-ci", "S2-chromium-bureau-ci", "S3-chromium-bureau-ci", "S4-chromium-bureau-ci", "S5-chromium-bureau-ci", "S6-chromium-bureau-ci", "S7-chromium-bureau-ci",
    ]);
    for (const p of PROFILS_CHARGE_CANDIDATS) {
      expect(existsSync(`${RACINE}${p.fichier}`), p.fichier).toBe(true);
      expect(existsSync(`${RACINE}${p.recette}`), p.recette).toBe(true);
      expect(APPAREILS_RECETTE).toContain(p.appareil);
      expect(p.reseau).toBe("non-evalue");
    }
  });

  it("[+] une désignation complète (commit + empreinte, profils candidats, décision datée) est recevable et rendrait l'outil conforme avec une preuve réussie", () => {
    expect(validerDesignation(valide)).toEqual([]);
    expect(FORME_BUILD_DESIGNE.test(BUILD)).toBe(true);
    const f = STUDIO_FICHES_OUTILS[0]!;
    const preuve = { toolId: f.toolId, build: BUILD, profilCharge: "S3-chromium-bureau-ci", recette: "apps/web/e2e/studio-mesures-chargement.mjs", resultat: "reussi" as const };
    expect(preuveRecevable(preuve)).toEqual([]);
    expect(evaluerFicheOutil(f, [preuve], valide).etat).toBe("conforme");
  });

  it("[−] désignation refusée : commit abrégé ou branche, empreinte absente, aucun profil, profil inconnu ou doublé, décision ou date absentes", () => {
    expect(validerDesignation({ ...valide, build: "abc123" })[0]).toMatch(/^build/);
    expect(validerDesignation({ ...valide, build: "main+sha256:" + "b".repeat(64) })[0]).toMatch(/^build/);
    expect(validerDesignation({ ...valide, build: "a".repeat(40) })[0]).toMatch(/^build/);
    expect(validerDesignation({ ...valide, profilsCharge: [] })).toContain("profils de charge : au moins un profil désigné");
    expect(validerDesignation({ ...valide, profilsCharge: ["P-10 000 primitives"] })).toContain("profil de charge inconnu du dépôt : P-10 000 primitives");
    expect(validerDesignation({ ...valide, profilsCharge: ["S1-chromium-bureau-ci", "S1-chromium-bureau-ci"] })).toContain("profil de charge cité deux fois");
    expect(validerDesignation({ ...valide, decision: "accord oral" }).join()).toMatch(/décision/);
    expect(validerDesignation({ ...valide, date: "2 novembre" }).join()).toMatch(/date/);
    expect(preuveRecevable({ toolId: "studio.draw.line", build: "abc", profilCharge: "téléphone personnel", recette: "", resultat: "reussi" } as never)).toHaveLength(3);
  });
});
