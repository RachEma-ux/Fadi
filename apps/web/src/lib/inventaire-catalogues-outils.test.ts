/**
 * Inventaire et réconciliation des catalogues d'outils (#166, B.1-01, B.1-05), au commit de réalisation : registre
 * Studio (`STUDIO_TOOLS`) et commandes de l'éditeur Studio, catalogue de la Planche (`@parcours/planche-model`),
 * palette de l'Atelier (`modules/atelier/nouveau/outils.ts`). Cet essai vit hors de `modules/studio` et de
 * `modules/atelier` : il lit les deux sans créer de dépendance entre eux (frontière ADR-STUDIO-NAV-01).
 */
import { describe, expect, it } from "vitest";
import { OUTILS as OUTILS_PLANCHE } from "@parcours/planche-model";
import { resoudreAliasOutil, STUDIO_ALIAS_OUTILS, STUDIO_TOOLS } from "@parcours/atelier-model";
import { OUTILS as OUTILS_ATELIER, OUTILS_PAR_ID } from "../modules/atelier/nouveau/outils";
import { CATALOGUE } from "../modules/studio/planche2d/catalogue";
import { COMMANDES_EDITEUR } from "../modules/studio/planche2d/raccourcis";

describe("inventaire des catalogues d'outils (B.1-01)", () => {
  it("chaque catalogue a des identifiants uniques", () => {
    for (const ids of [STUDIO_TOOLS.map((t) => t.toolId), COMMANDES_EDITEUR.map((c) => c.id), OUTILS_PLANCHE.map((o) => o.id), OUTILS_ATELIER.map((o) => o.id)]) {
      expect(new Set(ids).size).toBe(ids.length);
    }
    // Le catalogue Studio réunit registre et commandes de l'éditeur sans recouvrement.
    expect(CATALOGUE).toHaveLength(STUDIO_TOOLS.length + COMMANDES_EDITEUR.length);
    expect(new Set(CATALOGUE.map((e) => e.identifiant)).size).toBe(CATALOGUE.length);
  });

  it("chaque alias « courant » cite un identifiant présent dans son catalogue source, avec une capacité de même nature", () => {
    const sources = { planche: new Map(OUTILS_PLANCHE.map((o) => [o.id, o.libelle])), atelier: new Map(OUTILS_ATELIER.map((o) => [o.id, o.libelle])) };
    // Le catalogue « referentiel » (lot G2, EX-027) nomme des identifiants d’exemple du Référentiel RT-001, pas un catalogue d’outils.
    for (const a of STUDIO_ALIAS_OUTILS.filter((x) => x.periode === "courante" && (x.catalogue === "planche" || x.catalogue === "atelier"))) {
      const libelle = sources[a.catalogue as "planche" | "atelier"].get(a.idHistorique);
      expect(libelle, `${a.catalogue}:${a.idHistorique}`).toBeDefined();
    }
    // Contrôle de nature sur les équivalences dont les libellés diffèrent.
    expect(OUTILS_PAR_ID["tourner"]?.famille).toBe("modifier");
    expect(OUTILS_PAR_ID["miroir"]?.famille).toBe("modifier");
    expect(OUTILS_PLANCHE.find((o) => o.id === "faire-pivoter")?.libelleSketchUp).toBe("Rotate");
    expect(OUTILS_PLANCHE.find((o) => o.id === "decalage")?.libelleSketchUp).toBe("Offset");
  });
});

describe("collision historique « echelle » requalifiée au commit courant (B.1-05)", () => {
  it("Atelier : deux outils distincts — « echelle-acces » (objet d'accès, DA-07-13) et « echelle » (transformation, DA-02-05)", () => {
    expect(OUTILS_ATELIER.filter((o) => o.id === "echelle")).toHaveLength(1);
    expect(OUTILS_PAR_ID["echelle"]).toMatchObject({ famille: "modifier", fiche: "DA-02-05" });
    expect(OUTILS_PAR_ID["echelle-acces"]).toMatchObject({ famille: "creer", fiche: "DA-07-13" });
  });
  it("Planche : un seul « echelle » (Scale) ; Studio : un seul outil d'échelle, la transformation", () => {
    expect(OUTILS_PLANCHE.filter((o) => o.id === "echelle").map((o) => o.libelleSketchUp)).toEqual(["Scale"]);
    expect(STUDIO_TOOLS.filter((t) => t.libelleFR === "Échelle").map((t) => t.toolId)).toEqual(["studio.dessin.echelle"]);
  });
  it("les trois lectures convergent vers la transformation ; l'objet d'accès n'est jamais converti", () => {
    for (const catalogue of ["planche", "atelier"] as const) expect(resoudreAliasOutil("echelle", { catalogue })).toMatchObject({ toolId: "studio.dessin.echelle" });
    // Lot G2 (EX-027) : l’objet d’accès a désormais son équivalent Studio (échelle d’accès) ; il n’est jamais converti
    // vers la transformation.
    expect(resoudreAliasOutil("echelle-acces", { catalogue: "atelier" })).toMatchObject({ statut: "alias", toolId: "studio.architecture.echelle-acces" });
    expect(resoudreAliasOutil("echelle-acces", { catalogue: "atelier" })).not.toMatchObject({ toolId: "studio.dessin.echelle" });
  });
});
