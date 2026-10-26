import { describe, expect, it } from "vitest";
import { OUTILS as OUTILS_PLANCHE } from "@parcours/planche-model";
import {
  STUDIO_ALIAS_OUTILS, STUDIO_CHARGEURS_OUTILS, STUDIO_MANIFESTE_OUTILS, STUDIO_MANIFESTE_OUTILS_VERSION, controlerManifesteOutils, entreeManifeste,
  resoudreAliasOutil, toolIdCanonique, type StudioAliasOutil, type StudioEntreeManifeste,
} from "./manifeste-outils.js";
import { STUDIO_TOOLS, STUDIO_TOOL_IDS } from "./registry.js";

describe("manifeste versionné du catalogue d'outils Studio (B.1-02, B.1-03, B.1-06)", () => {
  it("est valide : aucune entrée manquante, en double ou hors registre ; chargeurs et prérequis sans cycle", () => {
    expect(controlerManifesteOutils()).toEqual([]);
    expect(STUDIO_MANIFESTE_OUTILS.version).toBe(STUDIO_MANIFESTE_OUTILS_VERSION);
    expect(STUDIO_MANIFESTE_OUTILS.entrees.map((e) => e.toolId)).toEqual([...STUDIO_TOOL_IDS]);
  });

  it("chaque capacité a un propriétaire, son contrat lu dans le registre, un contexte, un droit et un chargeur", () => {
    for (const t of STUDIO_TOOLS) {
      const e = entreeManifeste(t.toolId)!;
      expect(e.proprietaire.id).toMatch(/^studio\./);
      expect(e.contrat).toEqual({ contractVersion: t.contractVersion, nature: t.nature, refusalCodes: t.refusalCodes, supportsDryRun: t.supportsDryRun, agentExposure: "none" });
      expect(e.contextes.length).toBeGreaterThan(0);
      expect(e.droit).toBe(t.nature === "mutation" ? "ecriture" : "lecture");
      expect(STUDIO_CHARGEURS_OUTILS.some((c) => c.id === e.chargeur)).toBe(true);
    }
    expect(entreeManifeste("studio.outil.inexistant")).toBeNull();
  });

  it("le volume libre et la visualisation agissent dans la vue 3D, chargée à la demande (three)", () => {
    for (const id of ["studio.solide.boite", "studio.scene.creer", "studio.apparence.definir"]) {
      expect(entreeManifeste(id)).toMatchObject({ contextes: ["vue-3d"], chargeur: "vue-3d" });
    }
    expect(STUDIO_CHARGEURS_OUTILS.find((c) => c.id === "vue-3d")).toMatchObject({ mode: "a-la-demande", dependances: ["planche-2d", "npm:three"] });
    expect(entreeManifeste("studio.dessin.ligne")).toMatchObject({ contextes: ["planche-2d"], chargeur: "planche-2d", droit: "ecriture" });
    expect(entreeManifeste("studio.dessin.selection")).toMatchObject({ droit: "lecture" });
    expect(entreeManifeste("studio.scene.rappeler")).toMatchObject({ droit: "lecture", prerequis: ["studio.scene.creer"] });
  });

  it("est gelé : le manifeste ne se modifie pas à l'exécution", () => {
    expect(Object.isFrozen(STUDIO_MANIFESTE_OUTILS)).toBe(true);
    expect(Object.isFrozen(STUDIO_MANIFESTE_OUTILS.entrees[0])).toBe(true);
    expect(Object.isFrozen(STUDIO_ALIAS_OUTILS)).toBe(true);
  });

  it("le contrôle relève chaque défaut (contre-épreuve)", () => {
    const [premiere, seconde] = STUDIO_MANIFESTE_OUTILS.entrees as [StudioEntreeManifeste, StudioEntreeManifeste];
    const reste = STUDIO_MANIFESTE_OUTILS.entrees.slice(2);
    const pbs = controlerManifesteOutils({
      version: "v1",
      entrees: [
        premiere, premiere,
        { ...seconde, chargeur: "inconnu" as never, contextes: ["atelier" as never], droit: "lecture", prerequis: [seconde.toolId] },
        { ...seconde, toolId: "studio.hors" as never, prerequis: ["studio.hors" as never] },
        ...reste.map((e) => (e.toolId === "studio.scene.creer" ? { ...e, prerequis: ["studio.scene.modifier" as const] } : e)),
      ],
    }, [
      { catalogue: "studio", periode: "courante", idHistorique: "studio.dessin.ligne", regle: "renomme", toolId: "studio.dessin.cercle" },
      { catalogue: "planche", periode: "courante", idHistorique: "x", regle: "equivalent", toolId: "studio.absent" as never },
      { catalogue: "planche", periode: "courante", idHistorique: "x", regle: "hors-studio", toolId: "studio.dessin.ligne" },
      { catalogue: "planche", periode: "courante", idHistorique: "y", regle: "renomme", toolId: "studio.dessin.ligne" },
    ], [...STUDIO_CHARGEURS_OUTILS, { id: "feuille", mode: "inclus", module: "m", dependances: ["vue-3d"] }]);
    const texte = pbs.join("\n");
    for (const attendu of [
      "version de manifeste invalide", "outil cité 2 fois", "entrée hors registre : studio.hors", "chargeur inconnu", "contexte inconnu", "droit lecture pour une mutation",
      "prérequis de lui-même", "prérequis circulaire", "chargeur déclaré deux fois", "alias qui masque un outil du registre", "cible hors registre", "alias en double",
      "incohérente avec sa cible", "réservé au catalogue studio",
    ]) expect(texte).toContain(attendu);
  });
});

describe("alias de migration des identifiants (B.1-04)", () => {
  it("un toolId du registre est canonique ; aucun identifiant Studio n'a été renommé", () => {
    expect(resoudreAliasOutil("studio.dessin.echelle")).toEqual({ statut: "canonique", toolId: "studio.dessin.echelle" });
    expect(STUDIO_ALIAS_OUTILS.filter((a) => a.catalogue === "studio")).toEqual([]);
    expect(resoudreAliasOutil("studio.dessin.dimension")).toEqual({ statut: "inconnu" });
    expect(toolIdCanonique("studio.dessin.cote")).toBe("studio.dessin.cote");
    expect(toolIdCanonique("studio.outil.retire")).toBeNull();
  });

  it("un ancien identifiant Studio suit son alias « renomme » (table injectée)", () => {
    const table: StudioAliasOutil[] = [{ catalogue: "studio", periode: "courante", idHistorique: "studio.dessin.dimension", regle: "renomme", toolId: "studio.dessin.cote" }];
    expect(resoudreAliasOutil("studio.dessin.dimension", {}, table)).toMatchObject({ statut: "alias", toolId: "studio.dessin.cote" });
    expect(toolIdCanonique("studio.dessin.dimension", table)).toBe("studio.dessin.cote");
  });

  it("équivalences Planche : chaque identifiant source existe au commit courant", () => {
    const ids = new Set(OUTILS_PLANCHE.map((o) => o.id));
    for (const a of STUDIO_ALIAS_OUTILS.filter((x) => x.catalogue === "planche")) expect(ids.has(a.idHistorique), a.idHistorique).toBe(true);
    expect(resoudreAliasOutil("echelle", { catalogue: "planche" })).toMatchObject({ statut: "alias", toolId: "studio.dessin.echelle" });
    expect(resoudreAliasOutil("pousser-tirer", { catalogue: "planche" })).toEqual({ statut: "inconnu" });
  });

  it("« echelle » de l'Atelier (B.1-05) : transformation au commit courant ; avant 1a6f9b5, ambigu sans fiche, jamais choisi par défaut", () => {
    expect(resoudreAliasOutil("echelle", { catalogue: "atelier" })).toMatchObject({ statut: "alias", toolId: "studio.dessin.echelle" });
    expect(resoudreAliasOutil("echelle-acces", { catalogue: "atelier" })).toMatchObject({ statut: "alias", toolId: "studio.architecture.echelle-acces" });
    const ancien = resoudreAliasOutil("echelle", { catalogue: "atelier", periode: "avant-1a6f9b5" });
    expect(ancien.statut).toBe("ambigu");
    expect(ancien.statut === "ambigu" && ancien.alternatives.map((a) => a.toolId)).toEqual(["studio.architecture.echelle-acces", "studio.dessin.echelle"]);
    expect(resoudreAliasOutil("echelle", { catalogue: "atelier", periode: "avant-1a6f9b5", contexte: "DA-07-13" })).toMatchObject({ statut: "alias", toolId: "studio.architecture.echelle-acces" });
    expect(resoudreAliasOutil("echelle", { catalogue: "atelier", periode: "avant-1a6f9b5", contexte: "DA-02-05" })).toMatchObject({ statut: "alias", toolId: "studio.dessin.echelle" });
  });

  // Libellé cité par le registre pour B.1-05 (constat au commit de réalisation, avant le lot G2) : depuis G2, l'échelle
  // d'accès existe sous un identifiant distinct — aucune collision ; le test suivant (EX-027) en est la preuve courante.
  it("Studio n'a qu'un outil « échelle » (transformation) et aucun objet d'accès : pas de collision dans le registre", () => {
    expect(STUDIO_TOOLS.filter((t) => t.libelleFR === "Échelle").map((t) => [t.toolId, t.groupe])).toEqual([["studio.dessin.echelle", "modification"]]);
    expect(STUDIO_TOOLS.filter((t) => /échelle/i.test(t.libelleFR) && t.groupe !== "modification").map((t) => t.toolId)).toEqual(["studio.architecture.echelle-acces"]);
    expect(new Set(STUDIO_TOOL_IDS).size).toBe(STUDIO_TOOL_IDS.length);
  });

  it("EX-027 [+] manifeste valide avec deux capacités « échelle » distinctes (transformation et échelle d'accès) ; identifiants du référentiel et alias anciens résolus", () => {
    expect(controlerManifesteOutils()).toEqual([]);
    const echelles = STUDIO_TOOLS.filter((t) => /echelle|scale|ladder/i.test(t.toolId) || /échelle/i.test(t.libelleFR));
    expect(echelles.map((t) => [t.toolId, t.groupe, t.libelleFR])).toEqual([
      ["studio.dessin.echelle", "modification", "Échelle"], ["studio.architecture.echelle-acces", "architecture", "Échelle d’accès"],
    ]);
    expect(new Set(STUDIO_TOOL_IDS).size).toBe(STUDIO_TOOL_IDS.length);
    expect(entreeManifeste("studio.architecture.echelle-acces")).toMatchObject({ contextes: ["planche-2d"], droit: "ecriture", chargeur: "planche-2d", proprietaire: { id: "studio.architecture" } });
    expect(resoudreAliasOutil("studio.transform.scale", { catalogue: "referentiel" })).toMatchObject({ statut: "alias", toolId: "studio.dessin.echelle" });
    expect(resoudreAliasOutil("studio.arch.ladder", { catalogue: "referentiel" })).toMatchObject({ statut: "alias", toolId: "studio.architecture.echelle-acces" });
    expect(resoudreAliasOutil("studio.draw.line2d", { catalogue: "referentiel" })).toMatchObject({ statut: "alias", toolId: "studio.dessin.ligne" });
    // Un identifiant canonique reste canonique ; un identifiant du référentiel n'est jamais un outil Studio en soi.
    expect(resoudreAliasOutil("studio.architecture.echelle-acces")).toEqual({ statut: "canonique", toolId: "studio.architecture.echelle-acces" });
    expect(toolIdCanonique("studio.arch.ladder")).toBeNull();
  });
});
