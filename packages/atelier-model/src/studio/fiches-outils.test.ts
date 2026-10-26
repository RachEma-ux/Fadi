/**
 * TR-AC-011 / AC-011 — un outil n'est « prêt à développer » que si entrées, sorties, préconditions, permissions,
 * effets, risques, mesures et jeux d'essai sont explicités ; « conforme » seulement après preuve d'exécution sur version
 * et profil de charge désignés. Fiches réelles du manifeste et fiches altérées.
 */
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { STUDIO_TOOL_IDS } from "./registry.js";
import { DESIGNATION_CONFORMITE, evaluerFicheOutil, PREUVES_EXECUTION_OUTILS, STUDIO_FICHES_OUTILS, type FicheOutil } from "./fiches-outils.js";

const fichier = (f: string) => new URL(`./${f}`, import.meta.url);

describe("TR-AC-011 — fiches d'outils et règle prêt à développer / conforme", () => {
  it("une fiche par outil du registre ; chaque jeu d'essai déclaré existe, cite l'outil, et un jeu négatif contient des cas de refus", () => {
    expect(STUDIO_FICHES_OUTILS.map((f) => f.toolId)).toEqual([...STUDIO_TOOL_IDS]);
    for (const f of STUDIO_FICHES_OUTILS) {
      for (const j of f.jeuxEssai) {
        expect(existsSync(fichier(j.fichier)), `${f.toolId} : ${j.fichier}`).toBe(true);
        const texte = readFileSync(fichier(j.fichier), "utf8");
        expect(texte.includes(`"${f.toolId}"`), `${f.toolId} cité dans ${j.fichier}`).toBe(true);
        if (j.cas === "negatif") expect(/toThrow|rejects|refus\(|Refus/.test(texte), `${j.fichier} : cas de refus`).toBe(true);
      }
    }
  });

  it("toutes les fiches réelles sont prêtes à développer ; aucune n'est conforme tant qu'aucun build ni profil de charge n'est désigné", () => {
    expect(DESIGNATION_CONFORMITE).toBeNull();
    expect(PREUVES_EXECUTION_OUTILS).toEqual([]);
    const etats = STUDIO_FICHES_OUTILS.map((f) => evaluerFicheOutil(f));
    expect(etats.every((e) => e.etat === "pret-a-developper")).toBe(true);
    expect(etats[0]!.manques).toEqual(["preuve d'exécution sur build et profil de charge désignés"]);
  });

  it("cas négatif : fiche sans jeu négatif, sans risques ou sans mesures → incomplète, jamais prête par la seule présence des autres champs", () => {
    const f = STUDIO_FICHES_OUTILS.find((x) => x.toolId === "studio.solide.booleen")!;
    expect(f.risques.some((r) => r.includes("AC-006"))).toBe(true);
    expect(f.mesures).toContain("PERF-07");
    const sansNegatif: FicheOutil = { ...f, jeuxEssai: f.jeuxEssai.filter((j) => j.cas === "positif") };
    expect(evaluerFicheOutil(sansNegatif)).toEqual({ etat: "incomplet", manques: ["jeu d'essai négatif"] });
    expect(evaluerFicheOutil({ ...f, risques: [], mesures: [] }).manques).toEqual(["risques", "mesures"]);
    expect(evaluerFicheOutil({ ...f, entrees: {}, preconditions: null }).manques).toEqual(["entrées", "préconditions"]);
  });

  it("conforme seulement avec une preuve réussie sur le build ET un profil désignés ; autre build, autre profil ou échec : non conforme", () => {
    const f = STUDIO_FICHES_OUTILS[1]!;
    const designation = { build: "abc123-0011", profilsCharge: ["P-10 000 primitives"] };
    const preuve = { toolId: f.toolId, build: "abc123-0011", profilCharge: "P-10 000 primitives", recette: "studio-mesures-chargement", resultat: "reussi" as const };
    expect(evaluerFicheOutil(f, [preuve], designation).etat).toBe("conforme");
    expect(evaluerFicheOutil(f, [{ ...preuve, build: "autre" }], designation).etat).toBe("pret-a-developper");
    expect(evaluerFicheOutil(f, [{ ...preuve, profilCharge: "autre" }], designation).etat).toBe("pret-a-developper");
    expect(evaluerFicheOutil(f, [{ ...preuve, resultat: "echoue" }], designation).etat).toBe("pret-a-developper");
    expect(evaluerFicheOutil(f, [preuve], null).etat).toBe("pret-a-developper");
  });
});
