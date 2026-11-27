/**
 * Extension « Contrôles réglementaires et accessibilité » (catalogue des extensions, cas 1 de la feuille de route, extension n° 6 ;
 * maquette validée le 27 novembre 2026) : le paquet livré dans `apps/web/extensions/controles/` passe l'import
 * de l'administrateur, puis tourne dans le vrai exécutant, servi par les vrais services de la Planche sur un vrai modèle.
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ajouterRectangle, ajouterSegment, contexte, creerExecutantExtension, creerFonctionsPlanche, jugerImportPaquet, modeleVide, v3, type AccesPlanche, type AvisExtension, type ExecutantExtension, type Id, type Modele, type PaquetExtension, type ValeursSaisie } from "@parcours/sandbox-planche-model";
import { creerHoteExtension, type WorkerExtension } from "./hote-extensions";

const DOSSIER = "../../../../extensions/controles/";
const lire = (chemin: string) => readFileSync(fileURLToPath(new URL(DOSSIER + chemin, import.meta.url)), "utf8");
const PAQUET = JSON.parse(lire("controles.fadi-addon.json")) as PaquetExtension;

/** Le même assemblage que `assembler.mjs`, refait ici à partir des sources. */
function assembler(): PaquetExtension {
  const pages: Record<string, string> = {};
  for (const nom of readdirSync(fileURLToPath(new URL(DOSSIER + "pages/", import.meta.url))).sort()) pages[nom] = lire(`pages/${nom}`);
  return { format: "fadi-addon/1", fiche: JSON.parse(lire("fiche.json")), code: lire("code.js"), pages } as PaquetExtension;
}

/** Worker de remplacement : le vrai exécutant, dans le même fil, avec des messages différés comme entre deux fils. */
function creerFaux(): WorkerExtension {
  let x: ExecutantExtension | null = null;
  const w: WorkerExtension = {
    onmessage: null,
    onerror: null,
    terminate: () => {},
    postMessage: (m) => {
      const brut = JSON.parse(JSON.stringify(m)) as { demarrer?: { fiche: { id: string; version: string }; code: string } };
      setTimeout(() => {
        const rendre = (r: unknown) => setTimeout(() => w.onmessage?.({ data: JSON.parse(JSON.stringify(r)) }), 0);
        if (brut.demarrer) {
          x = creerExecutantExtension(brut.demarrer, rendre);
          const erreur = x.demarrer();
          rendre({ demarre: erreur === null, erreur });
          return;
        }
        x?.recevoir(brut);
      }, 0);
    },
  };
  return w;
}

interface Ligne {
  genre: string;
  id?: string;
  choisi?: boolean;
  ton?: string;
  cellules: string[];
}
interface Etat {
  onglet: string;
  regle: string;
  note: string;
  formulaire: { id: string; libelle: string; valeur: string }[];
  resultats: { libelle: string; valeur: string; ton?: string }[];
  encart: string | null;
  colonnes: string[];
  lignes: Ligne[];
  choisie: string | null;
  pied: string[] | null;
  vide: string | null;
  page: number;
  pages: number;
}

/** Planche de remplacement : modèle, sélection, pas d'annulation, avis, saisies, fichiers et panneau. */
function planche(modele: Modele) {
  const etat = { modele, selection: [] as Id[], pas: [] as string[], avis: [] as AvisExtension[], fichiers: [] as { nom: string; texte: string }[], envois: [] as unknown[], ouverts: [] as string[] };
  let reponses: (ValeursSaisie | null)[] = [];
  let aOuvrir: { nom: string; texte: string } | null = null;
  // Protocole 1.2 : archivage en base du fichier chargé, réussi par défaut, refusé à la demande.
  let refusArchive: "connexion" | null = null;
  const archives: string[] = [];
  const titres: string[] = [];
  const acces: AccesPlanche = {
    modele: () => etat.modele,
    selection: () => etat.selection,
    dans: () => undefined,
    appliquer: (travail, nom) => {
      etat.modele = travail;
      etat.pas.push(nom);
      return true;
    },
    selectionner: (ids) => void (etat.selection = [...ids]),
  };
  const h = creerHoteExtension(PAQUET, {
    creer: creerFaux,
    acces,
    surAvis: (a) => void etat.avis.push(a),
    saisir: (d) => {
      titres.push(d.titre);
      return { reponse: Promise.resolve(reponses.shift() ?? null), fermer: () => {} };
    },
    fichiers: {
      ouvrir: () => ({ reponse: Promise.resolve(aOuvrir), fermer: () => {} }),
      archiver: async (f) => {
        archives.push(f.nom);
        return refusArchive === null ? { ok: true as const, archive: { id: `sbxfic_${archives.length}`, empreinte: "c".repeat(64), ajouteLe: "2026-11-27T12:00:00.000Z" } } : { ok: false as const, motif: refusArchive };
      },
      enregistrer: (d) => {
        etat.fichiers.push({ nom: d.nom, texte: d.texte });
        return { reponse: Promise.resolve(true), fermer: () => {} };
      },
    },
    panneau: { envoyer: (_p, d) => (etat.envois.push(d), true), ouvrir: (p) => (etat.ouverts.push(p), true) },
  });
  const action = async (nom: string, donnees: Record<string, unknown> = {}): Promise<Etat> => {
    const r = await h.appeler("demande", `panneau.controles.${nom}`, { langue: "fr", ...donnees });
    if (r.genre !== "fini") throw new Error(`action ${nom} : ${JSON.stringify(r)}`);
    return r.resultat as Etat;
  };
  return {
    etat,
    h,
    action,
    titres,
    repondre: (r: (ValeursSaisie | null)[]) => void (reponses = r),
    fichierAOuvrir: (f: { nom: string; texte: string } | null) => void (aOuvrir = f),
    refuserArchive: (motif: "connexion" | null) => void (refusArchive = motif),
    archives,
    derniereAlerte: () => etat.avis.filter((a) => a.genre === "alerte").at(-1)?.texte ?? "",
  };
}


const nomDefinition = (m: Modele, occ: Id) => m.definitions[contexte(m, undefined).occurrences[occ]!.definition]!.nom;

/** Objets groupés nommés (une petite boîte chacun), posés côte à côte ; rend le modèle et leurs identifiants. */
function objets(noms: string[]): { modele: Modele; ids: Id[] } {
  const f = creerFonctionsPlanche(modeleVide());
  const ids = noms.map((n, i) => f.api.grouper(f.api.boite([i * 3, 0, 0], 1, 0.2, 2) as Id[], n) as Id);
  return { modele: f.modele(), ids };
}

/** Table d'essai : seuils et sources fictifs, propres au test (aucun seuil n'est dans l'extension). */
const REGLES_ESSAI = {
  format: "fadi-regles-controles/1",
  jeux: [
    {
      id: "essai", libelle: "Jeu d'essai", version: "2", date: "2026-11-01",
      regles: {
        passage: { min: 0.83, source: "Fixture A", relu: true },
        degagement: { max: 20, source: "Fixture B", relu: false },
        vuesDroites: { min: 8, source: "Fixture C", relu: true },
        prospect: { rapport: 1, source: "Fixture D", relu: true },
        distanceConstructions: { min: 4, source: "Fixture E", relu: true },
        rampe: { tranches: [{ penteMax: 4, longueurMax: 10 }, { penteMax: 5, longueurMax: 4 }], palier: 1.4, deversMax: 2, source: "Fixture F", relu: true },
        placesFauteuil: { tranches: [{ jusqua: 50, places: 2 }, { jusqua: 100, places: 3 }], auDela: { par: 100, places: 1 }, source: "Fixture G", relu: true },
      },
    },
    { id: "autre", libelle: "Autre jeu", version: "1", date: "2026-10-01", regles: {} },
  ],
};
async function chargerRegles(p: ReturnType<typeof planche>, regles: unknown = REGLES_ESSAI) {
  p.fichierAOuvrir({ nom: "regles.json", texte: JSON.stringify(regles) });
  return p.action("charger-regles", { onglet: "registre" });
}

describe("extension « Contrôles réglementaires et accessibilité » — paquet", () => {
  it("le paquet versionné est exactement l'assemblage de ses sources", () => {
    expect(PAQUET).toEqual(assembler());
  });

  it("passe l'import de l'administrateur : forme, une icône et un raccourci par commande (règle d'or)", () => {
    expect(jugerImportPaquet(PAQUET)).toMatchObject({ ok: true });
    const icones = [...PAQUET.fiche.commandes.map((c) => c.icone), ...PAQUET.fiche.panneaux.map((p) => p.icone)];
    expect(icones.every((i) => typeof i === "string" && PAQUET.pages[i!]?.startsWith("<svg"))).toBe(true);
    expect(new Set(icones).size).toBe(icones.length);
    expect(PAQUET.fiche.commandes.map((c) => c.raccourci)).toEqual(["Ctrl+Alt+K", "Alt+Maj+F7", "Alt+Maj+F8", "Alt+Maj+F9", "Alt+Maj+F10", "Alt+Maj+F11", "Alt+Maj+F12", "Ctrl+Maj+F1"]);
  });

  it("aucun nom de produit tiers, aucun seuil dans le code ; chaque bouton a son action", () => {
    expect(JSON.stringify(PAQUET)).not.toMatch(/sketchup/i);
    expect(PAQUET.code).not.toMatch(/0[.,]8[0-9]|0[.,]9[0-9]\b|\b1[.,]40\b/);
    const actions = [...PAQUET.pages["panneau.js"]!.matchAll(/action: "([a-z-]+)"/g)].map((m) => m[1]);
    expect(new Set(actions).size).toBe(11);
    for (const a of actions) expect(PAQUET.code).toContain(`action("${a}"`);
  });
});

describe("extension « Contrôles réglementaires et accessibilité » — passages utiles (n° 19) et registre (n° 32)", () => {
  it("portes déclarées : conforme, écart en cm, non évalué si l'attribut manque ; un écart mène à l'objet ; registre exporté", async () => {
    const { modele, ids } = objets(["P01 Entrée", "P02 Bureau", "P03 Réserve"]);
    const p = planche(modele);
    p.repondre([{ passage: "0,90" }, { passage: "0,77" }, { passage: "" }]);
    for (const id of ids) {
      p.etat.selection = [id];
      await p.action("declarer-portes", { onglet: "passages" });
    }
    expect(p.titres).toEqual(["Déclarer une porte", "Déclarer une porte", "Déclarer une porte"]);
    let e = await p.action("etat", { onglet: "passages" });
    expect(e.encart).toMatch(/^Aucune table de règles/);
    expect(e.lignes.map((l) => l.cellules[3])).toEqual(["non évalué (pas de seuil)", "non évalué (pas de seuil)", "non évalué (attribut absent)"]);
    await chargerRegles(p);
    e = await p.action("etat", { onglet: "passages" });
    expect(e.formulaire[0]).toMatchObject({ id: "jeu", valeur: "essai", choix: [{ valeur: "essai", libelle: "Jeu d'essai (v2, 2026-11-01)" }, { valeur: "autre", libelle: "Autre jeu (v1, 2026-10-01)" }] });
    expect(e.encart).toBe("Chaque seuil vient d'une table sourcée et datée, modifiable ; un écart mène à l'objet en un clic. Aucune valeur n'est inventée.");
    expect(e.colonnes).toEqual(["Porte", "Passage", "Seuil", "Verdict"]);
    expect(e.lignes.map((l) => [l.cellules, l.ton])).toEqual([
      [["P01 Entrée", "0,90 m", "0,83 m", "conforme"], "ok"],
      [["P02 Bureau", "0,77 m", "0,83 m", "−6 cm"], "alerte"],
      [["P03 Réserve", "–", "0,83 m", "non évalué (attribut absent)"], "gris"],
    ]);
    await p.action("choisir", { onglet: "passages", id: ids[1] });
    expect(p.etat.selection).toEqual([ids[1]]);
    await p.action("ajouter-registre", { onglet: "passages" });
    e = await p.action("etat", { onglet: "registre" });
    expect(e.lignes.map((l) => l.cellules.slice(1))).toEqual([["Passages utiles", "P01 Entrée", "conforme"], ["Passages utiles", "P02 Bureau", "−6 cm"], ["Passages utiles", "P03 Réserve", "non évalué (attribut absent)"]]);
    await p.action("exporter-registre", { onglet: "registre" });
    const [md, csv] = p.etat.fichiers;
    expect(md!.nom).toMatch(/^registre-controles-\d{4}-\d{2}-\d{2}\.md$/);
    expect(md!.texte).toContain("| Passages utiles | Jeu d'essai (v2, 2026-11-01) | P02 Bureau | 0,77 m | 0,83 m | −6 cm |");
    expect(csv!.nom).toMatch(/\.csv$/);
    expect(csv!.texte.split("\n")[0]).toBe("﻿Date;Règle;Table;Objet;Valeur;Seuil;Verdict");
    await p.action("vider-registre", { onglet: "registre" });
    expect((await p.action("etat", { onglet: "registre" })).vide).toMatch(/^Registre vide/);
  });

  it("un registre de quarante entrées est découpé par taille : chaque morceau reste sous la borne d'une valeur", async () => {
    const noms = Array.from({ length: 40 }, (_, i) => `P${String(i + 1).padStart(2, "0")} Porte du logement témoin`);
    const { modele, ids } = objets(noms);
    const p = planche(modele);
    p.repondre(ids.map(() => ({ passage: "0,90" })));
    for (const id of ids) {
      p.etat.selection = [id];
      await p.action("declarer-portes", { onglet: "passages" });
    }
    await chargerRegles(p);
    await p.action("ajouter-registre", { onglet: "passages" });
    expect(p.derniereAlerte()).toBe("");
    await p.action("ajouter-registre", { onglet: "passages" });
    expect(p.derniereAlerte()).toBe("");
    const e = await p.action("etat", { onglet: "registre" });
    expect(e.lignes).toHaveLength(80);
    expect(e.lignes.at(-1)!.cellules.slice(1)).toEqual(["Passages utiles", noms[39], "conforme"]);
    }, 60_000);

  it("une table sans source ou sans date est refusée et nommée", async () => {
    const p = planche(modeleVide());
    await chargerRegles(p, { ...REGLES_ESSAI, jeux: [{ ...REGLES_ESSAI.jeux[0], regles: { passage: { min: 0.83, source: "" } } }] });
    expect(p.derniereAlerte()).toBe("Table refusée : jeu « Jeu d'essai », règle « passage » : valeur ou source manquante");
    await chargerRegles(p, { ...REGLES_ESSAI, jeux: [{ ...REGLES_ESSAI.jeux[0], date: "1er novembre" }] });
    expect(p.derniereAlerte()).toMatch(/^Table refusée : jeu 1 : .*date/);
    await p.action("modele-regles", { onglet: "registre" });
    expect(JSON.parse(p.etat.fichiers[0]!.texte)).toMatchObject({ format: "fadi-regles-controles/1", jeux: [{ regles: { passage: { min: null, source: "" } } }] });
  });
});

describe("extension « Contrôles réglementaires et accessibilité » — dégagements, rampe, vues, distance, places", () => {
  it("dégagements (n° 20) : longueur du cheminement sélectionné contre la distance maximale ; « à vérifier » si non relue", async () => {
    let m = ajouterSegment(modeleVide(), v3(0, 0, 0), v3(10, 0, 0)).modele;
    m = ajouterSegment(m, v3(10, 0, 0), v3(10, 15, 0)).modele;
    const p = planche(m);
    await chargerRegles(p);
    p.etat.selection = Object.keys(m.racine.aretes);
    p.repondre([{ nom: "Bureau 3 vers escalier" }]);
    const e = await p.action("mesurer-cheminement", { onglet: "degagements" });
    expect(e.lignes.map((l) => [l.cellules, l.ton])).toEqual([[["Bureau 3 vers escalier", "25,00 m", "20,00 m", "+5,00 m · à vérifier"], "alerte"]]);
    p.etat.selection = [];
    await p.action("choisir", { onglet: "degagements", id: "ch0" });
    expect([...p.etat.selection].sort()).toEqual(Object.keys(m.racine.aretes).sort());
  });

  it("rampe (n° 16) : tronçons et paliers selon la table, dévers contrôlé ; posée en un groupe ; pente hors table signalée", async () => {
    const p = planche(modeleVide());
    await chargerRegles(p);
    const R = { denivele: "0,5", pente: "5", largeur: "1,4", devers: "3" };
    let e = await p.action("etat", { onglet: "rampe", valeurs: R });
    expect(e.resultats).toEqual([{ libelle: "Longueur développée", valeur: "10,00 m" }]);
    expect(e.lignes.map((l) => l.cellules)).toEqual([
      ["Tronçon 1", "3,33 m", "5,0 %", "conforme"], ["Palier 1", "1,40 m", "0 %", ""],
      ["Tronçon 2", "3,33 m", "5,0 %", "conforme"], ["Palier 2", "1,40 m", "0 %", ""],
      ["Tronçon 3", "3,33 m", "5,0 %", "conforme"], ["Dévers", "", "3,0 %", "+1,0 %"],
    ]);
    await p.action("poser-rampe", { onglet: "rampe", valeurs: R });
    expect(p.etat.pas.at(-1)).toBe("Poser une rampe");
    const [rampe] = Object.values(contexte(p.etat.modele, undefined).occurrences);
    expect(nomDefinition(p.etat.modele, rampe!.id)).toBe("Rampe — 3 tronçons");
    expect(Object.keys(p.etat.modele.definitions[rampe!.definition]!.contenu.faces)).toHaveLength(5);
    e = await p.action("etat", { onglet: "rampe", valeurs: { ...R, pente: "8" } });
    expect(e.lignes[0]!.cellules[3]).toBe("pente au-delà de la table");
    // Saisie extrême : le nombre de tronçons est borné avant toute allocation, aperçu compris.
    const X = { ...R, denivele: "1000", pente: "0,0001" };
    e = await p.action("etat", { onglet: "rampe", valeurs: X });
    expect(e.lignes.map((l) => [l.cellules[0], l.ton])).toEqual([["Plus de trente tronçons : réduisez le dénivelé ou augmentez la pente admise.", "alerte"], ["Dévers", "alerte"]]);
    await p.action("poser-rampe", { onglet: "rampe", valeurs: X });
    expect(p.derniereAlerte()).toBe("Plus de trente tronçons : réduisez le dénivelé ou augmentez la pente admise.");
    const q = planche(modeleVide());
    await q.action("poser-rampe", { onglet: "rampe", valeurs: R });
    expect(q.derniereAlerte()).toMatch(/^Sans table de rampe/);
  });

  it("vues droites et prospect (n° 5), distance entre constructions (n° 10) : deux faces mesurées en plan", async () => {
    let m = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(10, 0, 0), v3(0, 0, 3)).modele;
    m = ajouterRectangle(m, v3(0, 6, 0), v3(10, 0, 0), v3(0, 0, 9)).modele;
    const p = planche(m);
    await chargerRegles(p);
    p.etat.selection = Object.keys(m.racine.faces);
    let e = await p.action("mesurer-vues", { onglet: "vues" });
    expect(e.lignes.map((l) => l.cellules)).toEqual([["Mesure 1", "6,00 m", "8,00 m", "−2,00 m"], ["Prospect (hauteur admise)", "Hauteur 9,00 m", "6,00 m", "+3,00 m"]]);
    e = await p.action("mesurer-distance", { onglet: "distance" });
    expect(e.lignes.map((l) => l.cellules)).toEqual([["Mesure 1", "6,00 m", "4,00 m", "conforme"]]);
    p.etat.selection = [Object.keys(m.racine.faces)[0]!];
    await p.action("mesurer-distance", { onglet: "distance" });
    expect(p.derniereAlerte()).toBe("Sélectionnez exactement deux faces.");
  });

  it("places fauteuil (n° 40) : nombre exigé selon l'effectif et la table, emplacements déclarés comptés", async () => {
    const { modele, ids } = objets(["Place A", "Place B", "Place C"]);
    const p = planche(modele);
    await chargerRegles(p);
    p.etat.selection = ids;
    let e = await p.action("declarer-places", { onglet: "places", valeurs: { effectif: "120" } });
    expect(e.lignes.map((l) => l.cellules[0])).toEqual(["Place A", "Place B", "Place C"]);
    expect(e.resultats).toEqual([
      { libelle: "Emplacements exigés", valeur: "4" },
      { libelle: "Emplacements déclarés", valeur: "3" },
      { libelle: "Résultat", valeur: "1 manquant", ton: "alerte" },
    ]);
    e = await p.action("etat", { onglet: "places", valeurs: { effectif: "80" } });
    expect(e.resultats.at(-1)).toEqual({ libelle: "Résultat", valeur: "conforme", ton: "ok" });
  });
});

describe("extension « Contrôles réglementaires et accessibilité » — commandes et langue", () => {
  it("Ctrl+Alt+K ouvre le panneau ; chaque commande ouvre son onglet ; textes en anglais", async () => {
    const p = planche(modeleVide());
    await p.h.appeler("demande", "commande.ouvrir-panneau", { langue: "fr" });
    expect(p.etat.ouverts).toEqual(["controles"]);
    for (const [c, o] of [["passages", "passages"], ["degagements", "degagements"], ["rampe", "rampe"], ["vues-droites", "vues"], ["distance-constructions", "distance"], ["places-fauteuil", "places"], ["registre", "registre"]] as const) {
      await p.h.appeler("demande", `commande.${c}`, { langue: "en" });
      expect(p.etat.envois.at(-1)).toMatchObject({ onglet: o });
    }
    expect(p.etat.envois.at(-1)).toMatchObject({ colonnes: ["Date", "Rule", "Object", "Verdict"], vide: "Empty register: « Add to the register » from a check tab." });
  });
});

describe("extension « Contrôles réglementaires » — archivage en base du fichier chargé (protocole 1.2)", () => {
  it("le fichier est archivé avant d'être chargé ; sans archive, il n'est pas chargé et le motif est donné", async () => {
    expect(PAQUET.fiche.protocole).toBe("1.2");
    expect(PAQUET.code).toContain("{ archiver: true }");
    const p = planche(modeleVide());
    await chargerRegles(p);
    expect(p.archives).toEqual(["regles.json"]);
    expect(p.derniereAlerte()).toBe("");
    const q = planche(modeleVide());
    q.refuserArchive("connexion");
    await chargerRegles(q);
    expect(q.derniereAlerte()).toBe("Chargement refusé : le fichier n'a pas pu être archivé en base (connexion requise)");
    expect(q.etat.avis.some((a) => a.texte.startsWith("Table chargée"))).toBe(false);
  });
});
