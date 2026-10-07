import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  INFERENCES,
  OUTILS,
  PANNEAUX,
  normaliserRaccourci,
  normaliserTexte,
  outilParId,
  outilParRaccourci,
  panneauParId,
  rechercherOutil,
} from "./catalogue-outils.js";
import { FORMES_PAR_ATTENDU, analyserSaisie } from "./saisie-vcb.js";

const DOSSIER_REFERENCES = new URL("../../../docs/planche/reference/", import.meta.url);

describe("intégrité du catalogue des outils", () => {
  it("identifiants uniques", () => {
    const ids = OUTILS.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("raccourcis uniques et en forme canonique", () => {
    const r = OUTILS.flatMap((o) => (o.raccourci === null ? [] : [o.raccourci]));
    expect(new Set(r.map(normaliserRaccourci)).size).toBe(r.length);
    for (const x of r) expect(normaliserRaccourci(x)).toBe(x);
  });

  it("chaque outil a au moins une étape et des libellés non vides", () => {
    for (const o of OUTILS) {
      expect(o.etapes.length, o.id).toBeGreaterThanOrEqual(1);
      expect(o.libelle.trim(), o.id).not.toBe("");
      expect(o.libelleSketchUp.trim(), o.id).not.toBe("");
    }
  });

  it("un outil observé a au moins une consigne relevée, traduite et originale ensemble", () => {
    for (const o of OUTILS) {
      if (o.statutReleve === "observe" && o.id !== "zoom-etendu") {
        expect(o.etapes.some((e) => e.consigne !== null), o.id).toBe(true);
      }
      for (const e of o.etapes) {
        expect(e.consigne === null, o.id).toBe(e.consigneSketchUp === null);
        expect(e.libelleMesures === null, o.id).toBe(e.libelleMesuresSketchUp === null);
      }
    }
  });

  it("les attentes de saisie existent dans la grammaire du champ Mesures", () => {
    for (const o of OUTILS) {
      for (const e of o.etapes) {
        if (e.saisie !== null) expect(Object.keys(FORMES_PAR_ATTENDU), o.id).toContain(e.saisie.attendu);
      }
    }
  });

  it("les inférences citées sont connues", () => {
    for (const o of OUTILS) for (const i of o.inferences) expect(INFERENCES[i], `${o.id}/${i}`).toBeDefined();
  });

  it("les fichiers de référence cités existent", () => {
    for (const x of [...OUTILS, ...PANNEAUX]) {
      const fichiers = [...x.sourceReference.matchAll(/([a-z-]+\.md)/g)].map((m) => m[1] ?? "");
      expect(fichiers.length, x.id).toBeGreaterThan(0);
      for (const f of fichiers) expect(existsSync(new URL(f, DOSSIER_REFERENCES)), `${x.id} → ${f}`).toBe(true);
    }
  });

  it("barre gauche relevée : 12 outils", () => {
    const barre = OUTILS.filter((o) => o.emplacement === "barre").map((o) => o.libelleSketchUp);
    expect(barre.sort()).toEqual(
      [
        "Select",
        "Eraser",
        "Line",
        "Rectangle",
        "Push/Pull",
        "Move",
        "Rotate",
        "Scale",
        "Paint Bucket",
        "Orbit",
        "Pan",
        "Tape Measure",
      ].sort(),
    );
  });

  it("seuls les booléens Intersect/Union/Subtract/Trim/Split sont payants, et non vérifiés", () => {
    const payants = OUTILS.filter((o) => o.offre === "payante");
    expect(payants.map((o) => o.libelleSketchUp).sort()).toEqual(["Intersect", "Split", "Subtract", "Trim", "Union"]);
    for (const o of payants) expect(o.statutReleve).toBe("non-verifie");
    expect(outilParId("enveloppe-exterieure")?.offre).toBe("gratuite");
  });

  it("valeurs relevées : côtés par défaut et segments de Divide", () => {
    expect(outilParId("cercle")?.etapes[0]?.valeurInitiale).toBe("24");
    expect(outilParId("polygone")?.etapes[0]?.valeurInitiale).toBe("6");
    expect(outilParId("arc-2-points")?.etapes[0]?.valeurInitiale).toBe("12");
    expect(outilParId("diviser")?.etapes[0]?.valeurInitiale).toBe("5");
  });

  it("les saisies relevées en direct sont acceptées par l'analyseur à l'étape indiquée", () => {
    const cas: [string, number, string, string][] = [
      ["rectangle", 1, "4m,3m", "dimensions"],
      ["ligne", 1, "3 m", "longueur"],
      ["cercle", 0, "12", "segments"],
      ["cercle", 1, "8s", "segments"],
      ["arc-2-points", 2, "0.5 m", "longueur"],
      ["rectangle-pivote", 2, "2 m , 90", "longueur-angle"],
      ["deplacer", 2, "x3", "reseau"],
      ["deplacer", 2, "/3", "reseau"],
      ["faire-pivoter", 3, "1:2", "angle"],
      ["echelle", 2, "3m", "echelle-cible"],
      ["diviser", 0, "3", "segments"],
      ["zoom", 0, "60", "champ-vision"],
    ];
    for (const [id, i, texte, genre] of cas) {
      const saisie = outilParId(id)?.etapes[i]?.saisie;
      expect(saisie, `${id}[${i}]`).toBeTruthy();
      if (saisie) expect(analyserSaisie(texte, saisie).genre, `${id}[${i}] « ${texte} »`).toBe(genre);
    }
  });

  it("modificateurs observés : mode connu", () => {
    for (const o of OUTILS) {
      for (const m of o.modificateurs) {
        if (m.statutReleve === "observe") expect(m.mode, `${o.id}/${m.touche}`).not.toBeNull();
      }
    }
  });
});

describe("recherche et accès", () => {
  it("outilParId", () => {
    expect(outilParId("pousser-tirer")?.libelleSketchUp).toBe("Push/Pull");
    expect(outilParId("inexistant")).toBeNull();
  });

  it("outilParRaccourci, notations française et anglaise", () => {
    expect(outilParRaccourci("L")?.id).toBe("ligne");
    expect(outilParRaccourci("l")?.id).toBe("ligne");
    expect(outilParRaccourci("Espace")?.id).toBe("selection");
    expect(outilParRaccourci("Space")?.id).toBe("selection");
    expect(outilParRaccourci("Shift+Space")?.id).toBe("lasso");
    expect(outilParRaccourci("ctrl+shift+e")?.id).toBe("zoom-etendu");
    expect(outilParRaccourci("Shift+Ctrl+E")?.id).toBe("zoom-etendu");
    expect(outilParRaccourci("Maj+W")?.id).toBe("zoom-fenetre");
    expect(outilParRaccourci("W")).toBeNull();
    expect(outilParRaccourci("")).toBeNull();
  });

  it("normaliserTexte retire accents et casse", () => {
    expect(normaliserTexte("  Échelle  ")).toBe("echelle");
    expect(normaliserTexte("Main levée")).toBe("main levee");
  });

  it("rechercherOutil : français, anglais, insensible aux accents", () => {
    expect(rechercherOutil("echelle")[0]?.id).toBe("echelle");
    expect(rechercherOutil("ÉCHELLE")[0]?.id).toBe("echelle");
    expect(rechercherOutil("scale")[0]?.id).toBe("echelle");
    expect(rechercherOutil("gomme")[0]?.id).toBe("gomme");
    expect(rechercherOutil("eraser")[0]?.id).toBe("gomme");
    expect(rechercherOutil("push pull")[0]?.id).toBe("pousser-tirer");
    expect(rechercherOutil("pousser")[0]?.id).toBe("pousser-tirer");
    expect(rechercherOutil("main levee")[0]?.id).toBe("main-levee");
    expect(rechercherOutil("tape")[0]?.id).toBe("metre");
  });

  it("rechercherOutil : tri exact puis préfixe", () => {
    const arcs = rechercherOutil("arc").map((o) => o.id);
    expect(arcs[0]).toBe("arc");
    expect(arcs).toEqual(expect.arrayContaining(["arc-2-points", "arc-3-points"]));
    const zooms = rechercherOutil("zoom").map((o) => o.id);
    expect(zooms[0]).toBe("zoom");
    expect(zooms).toContain("zoom-fenetre");
  });

  it("rechercherOutil : rien pour une requête vide ou inconnue", () => {
    expect(rechercherOutil("")).toEqual([]);
    expect(rechercherOutil("téléporteur")).toEqual([]);
  });
});

describe("panneaux", () => {
  it("identifiants uniques et colonne de droite dans l'ordre relevé", () => {
    const ids = PANNEAUX.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    const colonne = PANNEAUX.filter((p) => p.ordre !== null)
      .sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0))
      .map((p) => p.libelleSketchUp);
    expect(colonne).toEqual([
      "Entity Info",
      "Components",
      "Instructor",
      "3D Warehouse",
      "Materials",
      "Styles",
      "Tags",
      "Shadows",
      "Scenes",
      "Display",
      "Soften / Smooth",
      "Model Info",
    ]);
  });

  it("panneaux absents de la colonne : non vérifiés", () => {
    for (const p of PANNEAUX.filter((x) => x.ordre === null)) expect(p.statutReleve).toBe("non-verifie");
  });

  it("bornes cohérentes et défaut dans les bornes", () => {
    for (const p of PANNEAUX) {
      for (const sec of p.sections) {
        for (const c of sec.champs) {
          if (c.min !== null && c.max !== null) expect(c.min, `${p.id}/${c.libelleSketchUp}`).toBeLessThan(c.max);
          if (typeof c.defaut === "number" && c.min !== null && c.max !== null) {
            expect(c.defaut).toBeGreaterThanOrEqual(c.min);
            expect(c.defaut).toBeLessThanOrEqual(c.max);
          }
        }
      }
    }
  });

  it("valeurs relevées clés", () => {
    const champ = (pid: string, lib: string) =>
      panneauParId(pid)
        ?.sections.flatMap((s) => s.champs)
        .find((c) => c.libelleSketchUp === lib);
    expect(champ("adoucir-lisser", "Angle")).toMatchObject({ defaut: 30, min: 0, max: 180 });
    expect(champ("ombres", "Light")).toMatchObject({ defaut: 80, min: 0, max: 100 });
    expect(champ("scenes", "Field Of View (FOV)")).toMatchObject({ defaut: 30, min: 0, max: 120 });
    expect(champ("affichage", "Section Cuts — number")).toMatchObject({ defaut: 3, min: 1, max: 20 });
    expect(champ("info-modele", "Angle Snapping — value")?.defaut).toBe("15°");
    expect(panneauParId("styles")?.statutReleve).toBe("non-verifie");
    expect(panneauParId("inexistant")).toBeNull();
  });
});
