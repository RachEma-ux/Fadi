import { describe, expect, it } from "vitest";
import { CONTRAT_COMMANDES, appliquerLot } from "../commandes/index.js";
import { modeleVide, objetsDeClasse } from "../modele.js";
import { assemblerScript, construireGabarit, valeurGabarit, versScriptGuide } from "./gabarits.js";
import { developperScript, SCRIPTS_INTEGRES } from "./scripts.js";

const base = () => appliquerLot(modeleVide(), { requestId: "n", baseRevision: 0, contract: CONTRAT_COMMANDES, label: "n", commands: [{ type: "niveau.creer", params: { id: "n0", nom: "Rez", elevation: 0, hauteur: 3 } }] }).etat;

describe("éditeur guidé de scripts (D-028)", () => {
  it("valeurs : nombre littéral, $paramètre, expression (le « = » est ajouté) ; champ requis vide refusé", () => {
    expect(valeurGabarit("2,5", "x")).toBe(2.5);
    expect(valeurGabarit("$ep", "x")).toBe("$ep");
    expect(valeurGabarit("ox + i * px", "x")).toBe("=ox + i * px");
    expect(() => construireGabarit("mur.tracer", { niveauId: "n0", ax: "0", ay: "0", bx: "4", by: "0" })).toThrow(/Épaisseur/);
  });

  it("un script guidé (murs en boucle, dalle rectangulaire, textes numérotés) se développe et s'applique comme un geste", () => {
    const script = assemblerScript({
      id: "cellules",
      nom: "Cellules",
      description: "Une rangée de cellules",
      parametres: [{ nom: "n", libelle: "Nombre", type: "entier", defaut: 3, min: 1, max: 10 }, { nom: "l", libelle: "Largeur", type: "longueur", defaut: 3 }, { nom: "niv", libelle: "Niveau", type: "niveau" }],
      pour: [{ variable: "i", de: 0, a: "n - 1" }],
      commandes: [
        { type: "mur.tracer", saisies: { niveauId: "$niv", ax: "i * l", ay: "0", bx: "i * l", by: "5", epaisseur: "0,2", hauteur: "2,8" } },
        { type: "dalle.creer", saisies: { niveauId: "$niv", x0: "i * l", y0: "0", lx: "$l", ly: "5", epaisseur: "0,25" } },
        { type: "texte.creer", saisies: { niveauId: "$niv", x: "i * l + 1", y: "2", texte: "Cellule {i}" } },
        { libre: JSON.stringify({ type: "esquisse.ligne", params: { niveauId: "$niv", points: [{ x: "=i * l", y: 6, frame: "local", unit: "m" }, { x: "=i * l + 1", y: 6, frame: "local", unit: "m" }] } }) },
      ],
    });
    const cmds = developperScript(script, base(), { niv: "n0" });
    expect(cmds).toHaveLength(12);
    const e = appliquerLot(base(), { requestId: "s", baseRevision: 0, contract: CONTRAT_COMMANDES, label: "s", commands: cmds }).etat;
    expect(objetsDeClasse(e, "mur")).toHaveLength(3);
    const dalles = objetsDeClasse(e, "dalle");
    expect(dalles.map((d) => d.params.contour[2]!.x).sort()).toEqual([3, 6, 9]);
    expect(objetsDeClasse(e, "texte").map((t) => t.params.texte).sort()).toEqual(["Cellule 0", "Cellule 1", "Cellule 2"]);
  });

  it("aller-retour : les scripts intégrés relus dans l'éditeur guidé redonnent les mêmes gabarits", () => {
    for (const s of SCRIPTS_INTEGRES) {
      const guide = versScriptGuide(s);
      const re = assemblerScript(guide);
      expect(re.commandes).toEqual(s.commandes);
    }
    const trame = versScriptGuide(SCRIPTS_INTEGRES.find((s) => s.id === "trame-poteaux")!);
    expect("type" in trame.commandes[0]! && trame.commandes[0].type).toBe("poteau.creer");
  });
});
