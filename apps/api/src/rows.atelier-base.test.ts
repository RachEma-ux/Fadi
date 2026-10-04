/**
 * Passage EtatModele ⇄ lignes (lib/atelier-rows.ts), sans base de données : aller-retour sans perte sur le modèle
 * importé de P.118, répartition des classes conforme aux contraintes de init.sql, différences d'état.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  appliquerLot,
  calculerEmpreinte,
  CLASSES_OBJET,
  CONTRAT_COMMANDES,
  importerP118,
  jsonCanonique,
  ONTOLOGIES,
  PROVENANCES,
  STATUTS,
  type Commande,
  type EtatModele,
  type JeuDonneesP118,
  type ObjetModele,
} from "@parcours/atelier-model";
import { CLASSES_CALQUES, CLASSES_SITE, diffEtats, etatVersLignes, lignesVersEtat, objetVersLignes, lignesVersObjet, tableDeClasse, type LignesModele } from "./lib/atelier-rows.js";

const PROJET = "proj_rows";
const SOURCE = JSON.parse(readFileSync(new URL("./data/examples/p118-native-model.json", import.meta.url), "utf8")) as JeuDonneesP118;
const { modele } = importerP118(SOURCE, { projetId: PROJET });
const INIT_SQL = readFileSync(new URL("./db/init.sql", import.meta.url), "utf8");

/** Ce que la base rend : JSON relu (jsonb), clés réordonnées comprises. */
const commeEnBase = (l: LignesModele): LignesModele => JSON.parse(JSON.stringify(l)) as LignesModele;
const ensemble = (rs: readonly unknown[]) => rs.map((r) => jsonCanonique(r)).sort();

function lot(etat: EtatModele, commands: readonly Commande[], label = "essai") {
  const r = appliquerLot(etat, { requestId: `req-${label}`, baseRevision: etat.revision, contract: CONTRAT_COMMANDES, label, commands });
  if (!r.ok) throw new Error(JSON.stringify(r.erreurs));
  return r;
}

describe("atelier-rows : aller-retour sans perte (P.118)", () => {
  it("état → lignes → état : même empreinte, mêmes objets, relations, catalogue, propriétés de projet", () => {
    const lignes = commeEnBase(etatVersLignes(modele));
    expect(lignes.objets).toHaveLength(Object.keys(modele.objets).length);
    const relu = lignesVersEtat(lignes);
    expect(calculerEmpreinte(relu)).toBe(modele.empreinte);
    expect(relu.empreinte).toBe(modele.empreinte);
    expect(relu.revision).toBe(modele.revision);
    expect(relu.versionOntologie).toBe(modele.versionOntologie);
    expect(relu.objets).toEqual(modele.objets);
    expect(relu.catalogue).toEqual(modele.catalogue);
    expect(relu.proprietesProjet).toEqual(modele.proprietesProjet);
    expect(ensemble(relu.relations)).toEqual(ensemble(modele.relations));
    expect(relu.supprimes).toEqual([]);
    // Chaque objet rendu est identique octet pour octet dans sa forme canonique (nombres sans arrondi).
    for (const [id, o] of Object.entries(modele.objets)) expect(jsonCanonique(relu.objets[id]), id).toBe(jsonCanonique(o));
  });

  it("répartit les objets par classe : calques, site, autres", () => {
    const lignes = etatVersLignes(modele);
    const parTable = (t: string) => lignes.objets.filter((o) => o.table === t).length;
    const compte = (cl: readonly string[]) => Object.values(modele.objets).filter((o) => cl.includes(o.classe)).length;
    expect(parTable("atelier_layers")).toBe(22);
    expect(parTable("atelier_site")).toBe(compte(CLASSES_SITE));
    expect(parTable("atelier_objects")).toBe(Object.keys(modele.objets).length - 22 - compte(CLASSES_SITE));
    // Repères (R5) : seules les lignes du site portent des coordonnées non locales.
    for (const o of lignes.objets) {
      if (o.table !== "atelier_site") expect(JSON.stringify(o.params), o.id).not.toMatch(/"frame":"(cadastral|geographic)"/);
    }
    expect(lignes.proprietes.filter((p) => p.object_id === null)).toHaveLength(modele.proprietesProjet.length);
  });

  it("conserve un JSON null, des champs inconnus, un tableau de représentations vide, des représentations", () => {
    const base = Object.values(modele.objets).find((o) => o.classe === "mur")!;
    const objet = {
      ...base,
      proprietes: [{ nom: "import.vide", valeur: null, provenance: "import", statut: "declaree", inconnu: 1 }, ...base.proprietes],
      representations: [],
      champFutur: { a: [1.5e-7, -3.2] },
    } as unknown as ObjetModele;
    const l = JSON.parse(JSON.stringify(objetVersLignes(objet))) as ReturnType<typeof objetVersLignes>;
    expect(lignesVersObjet(l.objet, l.proprietes, l.representations)).toEqual(objet);
    const avecReps = { ...base, representations: [{ usage: "plan-2d", autorite: "derivee", moteur: "m", versionMoteur: "1", empreinteEntrees: "sha256-x" }] } as ObjetModele;
    const l2 = objetVersLignes(avecReps);
    expect(l2.representations).toHaveLength(1);
    expect(l2.objet.extra).toBeNull();
    expect(lignesVersObjet(l2.objet, l2.proprietes, l2.representations)).toEqual(avecReps);
  });

  it("refuse un état incohérent (identifiant vivant et supprimé)", () => {
    const id = Object.keys(modele.objets)[0]!;
    expect(() => etatVersLignes({ ...modele, supprimes: [id] })).toThrow(/à la fois/);
  });
});

describe("atelier-rows : répartition alignée sur init.sql", () => {
  const debut = INIT_SQL.indexOf("-- >>> module: atelier\n");
  const section = INIT_SQL.slice(debut, INIT_SQL.indexOf("-- <<< module: atelier\n", debut));
  const bloc = (t: string) => {
    const i = section.indexOf(`CREATE TABLE IF NOT EXISTS ${t} (`);
    if (i < 0) throw new Error(`table ${t} absente`);
    return section.slice(i, section.indexOf("\n);", i));
  };
  const valeurs = (texte: string, motif: RegExp) => {
    const m = motif.exec(texte);
    if (!m) throw new Error(`motif absent : ${motif}`);
    return [...m[1]!.matchAll(/'([^']+)'/g)].map((x) => x[1]!).sort();
  };

  it("chaque classe de l'ontologie va dans une et une seule table, comme le disent les contraintes SQL", () => {
    expect(valeurs(bloc("atelier_layers"), /"class" IN \(([^)]*)\)/)).toEqual([...CLASSES_CALQUES].sort());
    expect(valeurs(bloc("atelier_site"), /"class" IN \(([^)]*)\)/)).toEqual([...CLASSES_SITE].sort());
    expect(valeurs(bloc("atelier_objects"), /"class" NOT IN \(([^)]*)\)/)).toEqual([...CLASSES_CALQUES, ...CLASSES_SITE].sort());
    for (const c of CLASSES_OBJET) expect(["atelier_objects", "atelier_layers", "atelier_site"]).toContain(tableDeClasse(c));
  });

  it("provenances, statuts et ontologies admis par la base = ceux du modèle", () => {
    expect([...section.matchAll(/provenance IN \(/g)]).toHaveLength(4);
    expect([...section.matchAll(/status IN \(/g)]).toHaveLength(4);
    expect([...section.matchAll(/ontology IN \(/g)]).toHaveLength(3);
    for (const m of section.matchAll(/provenance IN \(([^)]*)\)/g)) expect([...m[1]!.matchAll(/'([^']+)'/g)].map((x) => x[1]).sort()).toEqual([...PROVENANCES].sort());
    for (const m of section.matchAll(/status IN \(([^)]*)\)/g)) expect([...m[1]!.matchAll(/'([^']+)'/g)].map((x) => x[1]).sort()).toEqual([...STATUTS].sort());
    for (const m of section.matchAll(/ontology IN \(([^)]*)\)/g)) expect([...m[1]!.matchAll(/'([^']+)'/g)].map((x) => x[1]).sort()).toEqual([...ONTOLOGIES].sort());
  });
});

describe("atelier-rows : différence entre deux états", () => {
  const mur = Object.values(modele.objets).find((o) => o.classe === "mur" && modele.relations.some((r) => r.type === "heberge" && r.sourceId === o.id))!;

  it("aucun changement : différence vide", () => {
    expect(diffEtats(modele, modele).vide).toBe(true);
  });

  it("suppression d'un mur et de ses baies : traces de suppression et relations retirées, puis annulation", () => {
    const r = lot(modele, [{ type: "mur.supprimer", params: {}, cibles: [mur.id] } as Commande]);
    const d = diffEtats(modele, r.etat);
    expect(d.objetsEcrits).toHaveLength(0);
    expect(d.objetsEffaces).toHaveLength(0);
    expect(d.supprimesAjoutes).toContain(mur.id);
    expect(d.supprimesAjoutes.length).toBeGreaterThan(1);
    expect(d.relationsRetirees.length).toBeGreaterThan(0);
    expect(d.tete.model_revision).toBe(modele.revision + 1);
    const annule = lot(r.etat, r.inverse, "annuler");
    const d2 = diffEtats(r.etat, annule.etat);
    expect([...d2.supprimesRetires].sort()).toEqual([...d.supprimesAjoutes].sort());
    expect(d2.objetsEcrits.map((o) => o.id).sort()).toEqual([...d.supprimesAjoutes].sort());
    expect(ensemble(d2.relationsAjoutees)).toEqual(ensemble(d.relationsRetirees));
    expect(annule.etat.empreinte).toBe(modele.empreinte);
  });

  it("création annulée : l'objet est effacé sans trace ; création puis suppression dans un lot : trace sans contenu", () => {
    const niveauId = mur.niveauId!;
    const calqueId = mur.calqueId!;
    const P = (x: number, y: number) => ({ x, y, frame: "local", unit: "m" }) as const;
    const creer = { type: "esquisse.ligne", params: { id: `${PROJET}_L1`, niveauId, calqueId, a: P(0, 0), b: P(1, 0) }, cibles: [] } as unknown as Commande;
    const r = lot(modele, [creer]);
    expect(diffEtats(modele, r.etat).objetsEcrits.map((o) => o.id)).toEqual([`${PROJET}_L1`]);
    const annule = lot(r.etat, r.inverse, "annuler");
    const d = diffEtats(r.etat, annule.etat);
    expect(d.objetsEffaces).toEqual([`${PROJET}_L1`]);
    expect(d.supprimesAjoutes).toEqual([]);
    const r2 = lot(modele, [creer, { type: "esquisse.supprimer", params: {}, cibles: [`${PROJET}_L1`] } as Commande], "creer-supprimer");
    const d2 = diffEtats(modele, r2.etat);
    expect(d2.objetsEcrits).toEqual([]);
    expect(d2.supprimesAjoutes).toEqual([`${PROJET}_L1`]);
  });
});
