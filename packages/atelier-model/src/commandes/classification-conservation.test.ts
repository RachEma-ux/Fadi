/** Oracles indépendants A5 — D-065/D-111/D-112, acceptation historique D-174 conservée.
 * Entièrement pur : modèles synthétiques en mémoire, aucun transport/API/DB/service.
 * Les champs extension représentent une fixture documentaire de propriété inconnue :
 * intersection TypeScript locale, sans élargir Propriete ni le modèle applicatif.
 */
import { describe, expect, it } from "vitest";
import { controleClassesIfc } from "../annexe-c.js";
import { proposerClassification } from "../classification-regle.js";
import { exporterIfc } from "../echanges/ifc.js";
import { modeleVide, type ModeleAtelier, type Occurrence, type Propriete } from "../modele.js";
import { m, pt } from "../unites.js";
import { CONTRAT_COMMANDES, appliquerLot, type Commande, type ResultatLot } from "./index.js";

const lot = (commands: Commande[], requestId = "classif-A5") => ({
  requestId, baseRevision: 0, contract: CONTRAT_COMMANDES, label: requestId, commands,
});
const affecter = (cible: { id: string } | { ids: string[] }, code: string | null): Commande => ({
  type: "classification.affecter", params: { ...cible, systeme: "CFC", code },
});
const charger: Commande = { type: "referentiel.charger", params: {
  id: "ref-cfc", systeme: "CFC", edition: "synthetique", source: "fixture A5 sans données réelles",
  codes: [{ code: "211", libelle: "Maçonnerie synthétique" }, { code: "214", libelle: "Structure synthétique" }],
} };
const photo = (e: ModeleAtelier): ModeleAtelier => JSON.parse(JSON.stringify(e)) as ModeleAtelier;
function base(avecReferentiel = false): ModeleAtelier {
  const e = appliquerLot(modeleVide(), lot([
    { type: "niveau.creer", params: { id: "n", nom: "Synthétique", elevation: 0, hauteur: 3 } },
    ...["w1", "w2", "exclu"].map((id, i): Commande => ({ type: "mur.tracer", params: {
      id, niveauId: "n", a: pt(0, i * 3), b: pt(4, i * 3), epaisseur: m(0.2), hauteur: m(3),
    } })),
    ...(avecReferentiel ? [charger] : []),
  ], "base-A5")).etat;
  e.objets["w1"]!.proprietes["classification:AUTRE"] = { valeur: "ancien", provenance: "import", statut: "a-verifier" };
  e.objets["w1"]!.proprietes["note"] = { valeur: { contenu: ["ne pas modifier", 0, false] }, provenance: "saisie", statut: "declaree" };
  return e;
}
type Declaration = Propriete & { extension: { source: string; attributs: (string | number | boolean)[] } };
const declarations: { nom: string; propriete?: Declaration }[] = [
  { nom: "absence" },
  ...(["saisie", "import"] as const).flatMap((provenance) => ["IfcWall", "IfcDoor"].map((valeur) => ({
    nom: `${provenance}-${valeur}`, propriete: {
      valeur, provenance, statut: provenance === "saisie" ? "declaree" as const : "a-verifier" as const,
      unite: "attribut-historique-à-conserver", extension: { source: "synthétique", attributs: ["inconnu", 0, false] },
    },
  }))),
  { nom: "ancienne-regle-verifiee-incoherente", propriete: { valeur: "IfcDoor", provenance: "regle", statut: "verifiee",
    extension: { source: "ancienne incohérence : jamais réparer par hypothèse", attributs: ["conserver", 2, false] } } },
  { nom: "ancienne-regle-verifiee", propriete: { valeur: "IfcWall", provenance: "regle", statut: "verifiee",
    extension: { source: "ancienne valeur : pas de réparation supposée", attributs: ["conserver", 1, true] } } },
];
function conserverDeclaration(avant: ModeleAtelier, apres: ModeleAtelier, id: string): void {
  expect(Object.hasOwn(apres.objets[id]!.proprietes, "classeIfc")).toBe(Object.hasOwn(avant.objets[id]!.proprietes, "classeIfc"));
  expect(apres.objets[id]!.proprietes["classeIfc"]).toStrictEqual(avant.objets[id]!.proprietes["classeIfc"]);
}
const optionsIfc = { projet: { id: "synth", nom: "Synthétique A5", code: "A5" }, revision: 1, horodatage: "2026-10-18T00:00:00" };

describe("CLASSIF1 — invariance canonique, sans référentiel puis avec référentiel", () => {
  for (const avecReferentiel of [false, true]) for (const d of declarations) {
    it(`${avecReferentiel ? "chargé" : "libre"} / ${d.nom} : affectation, remplacement, retrait et chaque inverse exact`, () => {
      let courant = base(avecReferentiel);
      if (d.propriete) courant.objets["w1"]!.proprietes["classeIfc"] = structuredClone(d.propriete);
      const initial = photo(courant);
      for (const [index, code] of ["211", "214", null].entries()) {
        const avant = photo(courant);
        const envelope = lot([affecter({ id: "w1" }, code)], `cycle-${index}`);
        const r = appliquerLot(courant, envelope);
        expect(courant).toStrictEqual(avant);
        expect(appliquerLot(courant, envelope)).toStrictEqual(r); // déterminisme pur, pas idempotence serveur
        conserverDeclaration(avant, r.etat, "w1");
        expect(r.etat.objets["w1"]!.proprietes["note"]).toStrictEqual(initial.objets["w1"]!.proprietes["note"]);
        expect(r.etat.objets["w1"]!.proprietes["classification:AUTRE"]).toStrictEqual(initial.objets["w1"]!.proprietes["classification:AUTRE"]);
        expect(r.etat.objets["exclu"]).toStrictEqual(initial.objets["exclu"]);
        expect(r.etat.definitions).toStrictEqual(avant.definitions);
        expect(r.effets.modifies).toEqual(["w1"]);
        if (code === null) {
          expect(Object.hasOwn(r.etat.objets["w1"]!.proprietes, "classification:CFC")).toBe(false);
          expect(Object.hasOwn(r.etat.objets["w1"]!.proprietes, "classification:CFC:libelle")).toBe(false);
        } else {
          expect(r.etat.objets["w1"]!.proprietes["classification:CFC"]).toStrictEqual({
            valeur: code, provenance: "saisie", statut: avecReferentiel ? "verifiee" : "declaree",
          });
          if (avecReferentiel) expect(r.etat.objets["w1"]!.proprietes["classification:CFC:libelle"]).toStrictEqual({
            valeur: code === "211" ? "Maçonnerie synthétique" : "Structure synthétique", provenance: "import", statut: "verifiee",
          });
          else expect(Object.hasOwn(r.etat.objets["w1"]!.proprietes, "classification:CFC:libelle")).toBe(false);
        }
        expect(appliquerLot(r.etat, lot([r.inverse], `inverse-${index}`)).etat).toStrictEqual(avant);
        courant = r.etat;
      }
      conserverDeclaration(initial, courant, "w1");
    });
  }
});

describe("CLASSIF1 — lot ids et refus atomiques", () => {
  for (const avecReferentiel of [false, true]) it(`ids mixtes ${avecReferentiel ? "chargé" : "libre"} : absence + import, exclusions et inverse`, () => {
    let e = base(avecReferentiel);
    e.objets["w2"]!.proprietes["classeIfc"] = structuredClone(declarations.find((d) => d.nom === "import-IfcDoor")!.propriete!);
    for (const code of ["211", "214", null]) {
      const avant = photo(e);
      const r = appliquerLot(e, lot([affecter({ ids: ["w1", "w2"] }, code)]));
      expect(e).toStrictEqual(avant);
      for (const id of ["w1", "w2"]) conserverDeclaration(avant, r.etat, id);
      expect(r.effets.modifies).toEqual(["w1", "w2"]);
      expect(r.etat.objets["exclu"]).toStrictEqual(avant.objets["exclu"]);
      expect(appliquerLot(r.etat, lot([r.inverse], "inverse-ids")).etat).toStrictEqual(avant);
      e = r.etat;
    }
  });
  for (const mode of ["ids-inconnu", "ids-verrouille", "commande-inconnue", "code-ref-invalide"] as const) {
    it(`${mode} après une cible valide : refus précis, aucune mutation ni résultat partiel`, () => {
      const e = base(mode === "code-ref-invalide");
      e.objets["w1"]!.proprietes["classeIfc"] = structuredClone(declarations.find((d) => d.nom === "saisie-IfcDoor")!.propriete!);
      if (mode === "ids-verrouille") e.objets["w2"]!.verrouille = true;
      const avant = photo(e);
      const commands = mode === "ids-inconnu" ? [affecter({ ids: ["w1", "introuvable"] }, "211")]
        : mode === "ids-verrouille" ? [affecter({ ids: ["w1", "w2"] }, "211")]
        : [affecter({ id: "w1" }, "211"), affecter({ id: mode === "commande-inconnue" ? "introuvable" : "w2" }, mode === "code-ref-invalide" ? "999" : "211")];
      let resultat: ResultatLot | undefined;
      expect(() => { resultat = appliquerLot(e, lot(commands)); }).toThrow(mode === "ids-verrouille" ? /verrouill/ : mode === "code-ref-invalide" ? /absent du référentiel/ : /introuvable|inconnu/);
      expect(resultat).toBeUndefined();
      expect(e).toStrictEqual(avant);
      expect(JSON.stringify(e)).toBe(JSON.stringify(avant));
      expect(Object.hasOwn(e.objets["w1"]!.proprietes, "classification:CFC")).toBe(false);
    });
  }
  it("proposition par règle demeure explicite ; exclu verrouillé intact et inverse conserve les déclarations", () => {
    const e = base();
    e.objets["exclu"]!.verrouille = true;
    e.objets["w2"]!.proprietes["classeIfc"] = structuredClone(declarations.find((d) => d.nom === "import-IfcDoor")!.propriete!);
    const avant = photo(e);
    const p = proposerClassification(e, { classe: "mur", niveauId: "n", systeme: "CFC", code: "211" });
    expect(e).toStrictEqual(avant);
    expect(p.cibles).toEqual(["w1", "w2"]);
    expect(p.verrouilles).toEqual(["exclu"]);
    const r = appliquerLot(e, lot(p.commandes));
    for (const id of ["w1", "w2"]) conserverDeclaration(avant, r.etat, id);
    expect(r.etat.objets["exclu"]).toStrictEqual(avant.objets["exclu"]);
    expect(appliquerLot(r.etat, lot([r.inverse])).etat).toStrictEqual(avant);
  });
});

describe("CLASSIF1 — contrôle et export dérivés restent distincts", () => {
  for (const avecReferentiel of [false, true]) it(`déclaration incohérente ${avecReferentiel ? "chargé" : "libre"} : diagnostic conservé, export AnnexeC et aucune mutation`, () => {
    let e = base(avecReferentiel);
    e.objets["w1"]!.proprietes["classeIfc"] = structuredClone(declarations.find((d) => d.nom === "import-IfcDoor")!.propriete!);
    const attenduDiagnostic = controleClassesIfc(e);
    expect(attenduDiagnostic.map((x) => [x.objetId, x.declaree, x.attendues])).toEqual([["w1", "IfcDoor", ["IfcWall"]]]);
    for (const code of ["211", "214", null]) {
      e = appliquerLot(e, lot([affecter({ ids: ["w1", "w2"] }, code)])).etat;
      const avant = photo(e);
      expect(controleClassesIfc(e)).toStrictEqual(attenduDiagnostic);
      const r = exporterIfc(e, optionsIfc);
      expect(e).toStrictEqual(avant);
      expect(r.contenu.match(/=IFCWALL\(/g)).toHaveLength(3);
      expect(r.rapport.remarques.some((m) => /w1 : classe IFC déclarée IfcDoor, annexe C : IfcWall/.test(m))).toBe(true);
      if (code !== null) expect(r.contenu).toContain(`IFCCLASSIFICATIONREFERENCE($,'${code}',`);
      else {
        expect(r.contenu).not.toContain("IFCCLASSIFICATIONREFERENCE($,'211',");
        expect(r.contenu).not.toContain("IFCCLASSIFICATIONREFERENCE($,'214',");
      }
      expect(r.contenu).toContain("IFCCLASSIFICATIONREFERENCE($,'ancien',");
    }
  });
  it("objet importé synthétique : déclaration et paramètres d’origine conservés, pas de diagnostic déduit", () => {
    const e = base();
    const importe: Occurrence<"objet-importe"> = {
      id: "importe", classe: "objet-importe", niveauId: "n", definitionId: null, calqueId: null, groupeId: null, phase: null,
      params: { ifcClasse: "IfcWall", globalId: "SYNTHETIQUE", nom: "Fixture sans fichier IFC", type: null,
        maillage: { positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2] }, empreinte: [pt(0, 0), pt(1, 0), pt(0, 1)], source: "fixture-memoire" },
      proprietes: { classeIfc: structuredClone(declarations.find((d) => d.nom === "import-IfcDoor")!.propriete!) },
    };
    e.objets["importe"] = importe;
    const avant = photo(e);
    const r = appliquerLot(e, lot([affecter({ id: "importe" }, "211")]));
    conserverDeclaration(avant, r.etat, "importe");
    expect(r.etat.objets["importe"]!.params).toStrictEqual(importe.params);
    expect(controleClassesIfc(r.etat)).toEqual([]);
    const snapshot = photo(r.etat);
    exporterIfc(r.etat, optionsIfc);
    expect(r.etat).toStrictEqual(snapshot);
    expect(appliquerLot(r.etat, lot([r.inverse])).etat).toStrictEqual(avant);
    expect(e).toStrictEqual(avant);
  });
});
