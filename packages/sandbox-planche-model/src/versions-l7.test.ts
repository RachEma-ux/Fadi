import { describe, expect, it } from "vitest";
import { ajouterRectangle, grouper, modeleVide, modifierDefinition, peindreOccurrences, pousserTirer, type Modele } from "./geometrie-libre.js";
import { exporterIfc } from "./echanges-ifc.js";
import { lireGabarit } from "./balises-l4.js";
import { projeterPlan, svgPlan } from "./plan-vectoriel.js";
import { v3 } from "./vecteur.js";
import {
  comparaisonVide,
  comparerModeles,
  declarerDestinataire,
  empreinteModele,
  ficheDe,
  lignesFiche,
  lireContenuJalon,
  lireRegistreVersions,
  noterEmission,
  poserFiche,
  poserJalon,
  poserRevision,
  registreVide,
  revisionDe,
  segmentsDifferences,
  serialiserRegistreVersions,
  statutsProposes,
  texteCanonique,
  texteRevision,
  valeurFiche,
} from "./versions-l7.js";

const boite = (m: Modele, x: number, nom: string): Modele => {
  const r = ajouterRectangle(m, v3(x, 0, 0), v3(x + 2, 0, 0), v3(x, 2, 0)).modele;
  const neuves = Object.keys(r.racine.faces).filter((f) => !Object.keys(m.racine.faces).includes(f));
  const b = pousserTirer(r, neuves[0]!, 1).modele;
  const faces = Object.keys(b.racine.faces);
  const aretes = Object.keys(b.racine.aretes);
  return grouper(b, [...faces, ...aretes], { nom, genre: "groupe" }).modele;
};
const deux = (): Modele => boite(boite(modeleVide(), 0, "Abri"), 5, "Remise");
const idDe = (m: Modele, nom: string) => Object.keys(m.racine.occurrences).find((id) => m.definitions[m.racine.occurrences[id]!.definition]?.nom === nom)!;

describe("cas 2, lot 7 — statut, indice et fiche du projet (n° 40, 109)", () => {
  it("statut et indice saisis, nettoyés ; deux champs vides retirent la révision", () => {
    const m = poserRevision(modeleVide(), { statut: "  Permis ", indice: "B" }).modele;
    expect(revisionDe(m)).toEqual({ statut: "Permis", indice: "B" });
    expect(texteRevision(revisionDe(m))).toBe("Permis, indice B");
    expect(revisionDe(poserRevision(m, { statut: "", indice: " " }).modele)).toBeNull();
  });

  it("fiche : un champ vide reste « non renseigné », rien n'est complété", () => {
    const m = poserFiche(modeleVide(), { projet: "Immeuble A", adresse: "  " }).modele;
    expect(ficheDe(m)).toEqual({ projet: "Immeuble A" });
    expect(valeurFiche(ficheDe(m), "adresse")).toBeNull();
    expect(lignesFiche(ficheDe(m))).toEqual([
      ["Projet", "Immeuble A"],
      ["N° de projet", "non renseigné"],
      ["Maître d'ouvrage", "non renseigné"],
      ["Adresse", "non renseigné"],
      ["Parcelle", "non renseigné"],
      ["Auteur du projet", "non renseigné"],
    ]);
  });

  it("fiche et révision reprises dans l'export IFC et le plan vectoriel ; champ absent écrit absent", () => {
    let m = boite(modeleVide(), 0, "Abri");
    m = poserFiche(m, { projet: "Immeuble A", numero: "P-118", parcelle: "Parcelle 42" }).modele;
    m = poserRevision(m, { statut: "Permis", indice: "B" }).modele;
    const ifc = exporterIfc(m, "Brouillon").contenu;
    expect(ifc).toMatch(/IFCPROJECT\('[^']+',\$,'Immeuble A',\$,\$,'P-118','Permis indice B',/);
    expect(ifc).toMatch(/IFCSITE\('[^']+',\$,'Parcelle 42',\$,/);
    const svg = svgPlan(projeterPlan(m, { direction: v3(0, 0, -1), haut: v3(0, 1, 0) }), m, { echelle: 100, traits: { coupe: 0.5, vu: 0.25, cache: 0.18 }, cachees: "pointille" });
    expect(svg).toContain("<title>Immeuble A</title>");
    expect(svg).toContain("Adresse : non renseigné");
    expect(svg).toContain("Révision : Permis, indice B");
  });

  it("statuts proposés : liste du gabarit d'agence, puis statuts des jalons", () => {
    const g = lireGabarit(JSON.stringify({ format: "fadi-gabarit/1", nom: "Agence", source: "Charte 2026", balises: [{ nom: "Mur", couleur: "#333333" }], statuts: ["Esquisse", "Permis", "Esquisse"] }));
    expect(g.ok && g.gabarit.statuts).toEqual(["Esquisse", "Permis"]);
    expect(lireGabarit(JSON.stringify({ format: "fadi-gabarit/1", nom: "A", source: "S", balises: [{ nom: "M", couleur: "#333333" }], statuts: [""] })).ok).toBe(false);
    const r = poserJalon(registreVide(), poserRevision(modeleVide(), { statut: "Exécution", indice: "C" }).modele, { nom: "J", date: "2026-11-27T20:00:00Z", id: "j1" }).registre;
    expect(statutsProposes(["Esquisse", "Permis"], r)).toEqual(["Esquisse", "Permis", "Exécution"]);
  });
});

describe("cas 2, lot 7 — jalons et registre (n° 38, 62)", () => {
  it("jalon figé : nom exigé, statut et indice recopiés, empreinte du contenu canonique", () => {
    const m = poserRevision(deux(), { statut: "Permis", indice: "B" }).modele;
    expect(() => poserJalon(registreVide(), m, { nom: "  ", date: "d", id: "j1" })).toThrow(RangeError);
    const { registre, jalon, contenu } = poserJalon(registreVide(), m, { nom: "Dépôt permis", date: "2026-11-27T20:10:00Z", id: "j1" });
    expect(jalon).toMatchObject({ nom: "Dépôt permis", statut: "Permis", indice: "B", objets: 2 });
    expect(jalon.empreinte).toBe(empreinteModele(m));
    expect(registre.jalons).toEqual([jalon]);
    // Relu tel quel : même modèle, même empreinte.
    const relu = lireContenuJalon(jalon, contenu)!;
    expect(texteCanonique(relu)).toBe(contenu);
    // Contenu modifié hors Fadi : refusé.
    expect(lireContenuJalon(jalon, contenu.replace("Abri", "Abris"))).toBeNull();
  });

  it("empreinte indépendante de l'ordre des clés", () => {
    expect(texteCanonique({ b: 1, a: { d: [1, 2], c: null } })).toBe(texteCanonique({ a: { c: null, d: [1, 2] }, b: 1 }));
  });

  it("registre : émissions notées, destinataire déclaré ou non renseigné, relecture tolérante", () => {
    let r = noterEmission(registreVide(), { id: "e1", date: "2026-11-27", jalon: "Dépôt permis", indice: "B", format: "IFC", fichier: "Immeuble.ifc", genre: "emission" });
    expect(r.emissions[0]!.destinataire).toBeNull();
    r = declarerDestinataire(r, "e1", " Bureau d'ingénieurs ");
    expect(r.emissions[0]!.destinataire).toBe("Bureau d'ingénieurs");
    expect(lireRegistreVersions(serialiserRegistreVersions(r))).toEqual(r);
    expect(lireRegistreVersions("{")).toBeNull();
    expect(lireRegistreVersions(JSON.stringify({ format: "autre", jalons: [], emissions: [] }))).toBeNull();
  });
});

describe("cas 2, lot 7 — comparaison objet par objet (n° 33, 41, 48)", () => {
  it("deux états égaux : aucune différence", () => {
    const m = deux();
    expect(comparaisonVide(comparerModeles(m, m))).toBe(true);
  });

  it("ajoutés, supprimés, modifiés, avec ce qui a changé", () => {
    const a = deux();
    const abri = idDe(a, "Abri");
    const remise = idDe(a, "Remise");
    // Vers : Abri peint, Remise supprimée, Atelier ajouté.
    let b = peindreOccurrences(a, [abri], "m1").modele;
    const { [remise]: _r, ...reste } = b.racine.occurrences;
    b = { ...b, racine: { ...b.racine, occurrences: reste } };
    b = boite(b, 10, "Atelier");
    const c = comparerModeles(a, b);
    expect(c.ajoutes.map((o) => o.nom)).toEqual(["Atelier"]);
    expect(c.supprimes.map((o) => o.nom)).toEqual(["Remise"]);
    expect(c.modifies).toEqual([{ id: abri, nom: "Abri", genre: "groupe", etat: "modifie", aspects: ["matiere"] }]);
    // Déplacé : la géométrie change.
    const deplace = { ...a, racine: { ...a.racine, occurrences: { ...a.racine.occurrences, [abri]: { ...a.racine.occurrences[abri]!, transformation: [1, 0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] as const } } } } as Modele;
    expect(comparerModeles(a, deplace).modifies[0]!.aspects).toEqual(["geometrie"]);
    // Surlignage : arêtes des ajoutés et modifiés à l'arrivée, des supprimés au départ (12 arêtes par boîte).
    const s = segmentsDifferences(a, b, c);
    expect([s.ajoutes.length, s.modifies.length, s.supprimes.length]).toEqual([12, 12, 12]);
    expect(Math.min(...s.supprimes.flat().map((p) => p.x))).toBeCloseTo(5, 9);
    expect(Math.min(...s.ajoutes.flat().map((p) => p.x))).toBeCloseTo(10, 9);
  });

  it("composant renommé ou décrit (métadonnées de sa définition) : « modifié »", () => {
    const a = deux();
    const abri = idDe(a, "Abri");
    const b = modifierDefinition(a, a.racine.occurrences[abri]!.definition, { nom: "Après", description: "Description modifiée" }).modele;
    expect(comparerModeles(a, b).modifies.map((o) => [o.id, o.aspects])).toEqual([[abri, ["nom", "donnees"]]]);
  });

  it("géométrie libre de la racine comptée à part", () => {
    const a = modeleVide();
    const b = ajouterRectangle(a, v3(0, 0, 0), v3(1, 0, 0), v3(0, 1, 0)).modele;
    expect(comparerModeles(a, b).geometrieLibre).toEqual({ ajoutees: 5, supprimees: 0, modifiees: 0 });
  });
});
