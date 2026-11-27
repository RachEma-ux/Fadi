/**
 * Extension « Surfaces et programme » (catalogue des extensions, cas 1 de la feuille de route, extension n° 1 ;
 * maquette validée le 27 novembre 2026) : le paquet livré dans `apps/web/extensions/surfaces-programme/` passe l'import
 * de l'administrateur, puis tourne dans le vrai exécutant, servi par les vrais services de la Planche sur un vrai modèle.
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ajouterRectangle, ajouterSegment, contexte, creerExecutantExtension, jugerImportPaquet, modeleVide, v3, type AccesPlanche, type AvisExtension, type ExecutantExtension, type Id, type Modele, type PaquetExtension, type ValeursSaisie } from "@parcours/sandbox-planche-model";
import { creerHoteExtension, type WorkerExtension } from "./hote-extensions";

const DOSSIER = "../../../../extensions/surfaces-programme/";
const lire = (chemin: string) => readFileSync(fileURLToPath(new URL(DOSSIER + chemin, import.meta.url)), "utf8");
const PAQUET = JSON.parse(lire("surfaces-programme.fadi-addon.json")) as PaquetExtension;

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
  cellules: string[];
}
interface Etat {
  onglet: string;
  regle: string;
  note: string;
  colonnes: string[];
  lignes: Ligne[];
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
      enregistrer: (d) => {
        etat.fichiers.push({ nom: d.nom, texte: d.texte });
        return { reponse: Promise.resolve(true), fermer: () => {} };
      },
    },
    panneau: { envoyer: (_p, d) => (etat.envois.push(d), true), ouvrir: (p) => (etat.ouverts.push(p), true) },
  });
  const action = async (nom: string, donnees: Record<string, unknown> = {}): Promise<Etat> => {
    const r = await h.appeler("demande", `panneau.surfaces.${nom}`, { langue: "fr", ...donnees });
    if (r.genre !== "fini") throw new Error(`action ${nom} : ${JSON.stringify(r)}`);
    return r.resultat as Etat;
  };
  /** Déclare la face `face` avec ces valeurs (la saisie répond aussitôt). */
  const declarer = async (face: Id, v: Partial<Record<"numero" | "nom" | "usage" | "niveau", string>> & { retirer?: boolean }) => {
    etat.selection = [face];
    reponses = [{ numero: "", nom: "", usage: "", niveau: "", ...v }];
    return action("declarer", { onglet: "surfaces" });
  };
  return {
    etat,
    h,
    action,
    declarer,
    titres,
    repondre: (r: (ValeursSaisie | null)[]) => void (reponses = r),
    fichierAOuvrir: (f: { nom: string; texte: string } | null) => void (aOuvrir = f),
    derniereAlerte: () => etat.avis.filter((a) => a.genre === "alerte").at(-1)?.texte ?? "",
  };
}

/** Modèle de rectangles horizontaux posés côte à côte ; rend le modèle et les faces dans l'ordre. */
function rectangles(cotes: readonly (readonly [number, number])[]): { modele: Modele; faces: Id[] } {
  let m = modeleVide();
  const faces: Id[] = [];
  let x = 0;
  for (const [a, b] of cotes) {
    const avant = new Set(Object.keys(m.racine.faces));
    m = ajouterRectangle(m, v3(x, 0, 0), v3(a, 0, 0), v3(0, b, 0)).modele;
    faces.push(Object.keys(m.racine.faces).find((f) => !avant.has(f))!);
    x += a + 1;
  }
  return { modele: m, faces };
}
const occurrences = (m: Modele) => Object.values(contexte(m, undefined).occurrences);
const cellules = (e: Etat) => e.lignes.map((l) => l.cellules);

describe("extension « Surfaces et programme » — paquet", () => {
  it("le paquet versionné est exactement l'assemblage de ses sources", () => {
    expect(PAQUET).toEqual(assembler());
  });

  it("passe l'import de l'administrateur : forme, une icône et un raccourci par commande (règle d'or)", () => {
    expect(jugerImportPaquet(PAQUET)).toMatchObject({ ok: true });
    const icones = [...PAQUET.fiche.commandes.map((c) => c.icone), ...PAQUET.fiche.panneaux.map((p) => p.icone)];
    expect(icones.every((i) => typeof i === "string" && PAQUET.pages[i!]?.startsWith("<svg"))).toBe(true);
    expect(new Set(icones).size).toBe(icones.length);
    expect(PAQUET.fiche.commandes.map((c) => c.raccourci)).toEqual(["Ctrl+Alt+S", "Ctrl+Alt+Maj+L", "Ctrl+Alt+Maj+B", "Ctrl+Alt+Maj+V", "Ctrl+Alt+Maj+F", "Ctrl+Alt+Maj+O", "Ctrl+Alt+Maj+Q"]);
  });

  it("aucun nom de produit tiers ; aucune valeur réglementaire écrite dans le code", () => {
    expect(JSON.stringify(PAQUET)).not.toMatch(/sketchup/i);
    // Les seuils et coefficients sont déclarés par l'utilisateur : le code ne contient ni plafond ni hauteur légale.
    expect(PAQUET.code).not.toMatch(/1[,.]80|2[,.]20|1[,.]8 ?m/);
  });

  it("chaque bouton de la page appelle une action que le code traite", () => {
    const actions = [...PAQUET.pages["panneau.js"]!.matchAll(/action: "([a-z-]+)"/g)].map((m) => m[1]);
    expect(actions.length).toBeGreaterThan(10);
    for (const a of actions) expect(PAQUET.code).toContain(`action("${a}"`);
  });
});

describe("extension « Surfaces et programme » — tableau des surfaces (n° 1)", () => {
  it("déclare des locaux en un pas d'annulation chacun ; groupés par niveau, « Sans niveau » à la fin", async () => {
    const { modele, faces } = rectangles([
      [4, 3],
      [2.5, 1.3],
      [3, 2],
    ]);
    const p = planche(modele);
    expect((await p.action("etat")).vide).toMatch(/Aucun local/);
    await p.declarer(faces[0]!, { numero: "002", nom: "Séjour", usage: "Séjour", niveau: "RDC" });
    await p.declarer(faces[1]!, { nom: "Cellier", usage: "Rangement" });
    const e = await p.declarer(faces[2]!, { numero: "001", nom: "Cuisine", niveau: "RDC" });
    expect(p.etat.pas).toHaveLength(3);
    expect(cellules(e)).toEqual([
      ["RDC · 2 locaux", "18,00 m²"],
      ["001", "Cuisine", "–", "6,00 m²"],
      ["002", "Séjour", "Séjour", "12,00 m²"],
      ["Sans niveau · 1 local", "3,25 m²"],
      ["–", "Cellier", "Rangement", "3,25 m²"],
    ]);
    expect(e.pied).toEqual(["Total · 3 locaux", "21,25 m²"]);
    expect(e.colonnes).toEqual(["N°", "Local", "Usage", "Surface"]);
    expect(e.regle).toMatch(/^Règle : aire nette de la face de sol/);
    expect(e.note).toMatch(/Lots .* SDP du permis/);
    // Enregistrés avec le dessin : une nouvelle séance de l'extension les relit.
    const q = planche(p.etat.modele);
    expect((await q.action("etat")).pied).toEqual(["Total · 3 locaux", "21,25 m²"]);
  });

  it("le total est la somme des valeurs exactes, arrondie une seule fois", async () => {
    const cotes = [
      [1.005, 1.005],
      [1.005, 1.005],
      [1.005, 1.005],
    ] as const;
    const { modele, faces } = rectangles(cotes);
    const p = planche(modele);
    let e: Etat | null = null;
    for (const f of faces) e = await p.declarer(f, { nom: "Local", niveau: "R+1" });
    expect(e!.lignes.filter((l) => l.genre === "ligne").map((l) => l.cellules[3])).toEqual(["1,01 m²", "1,01 m²", "1,01 m²"]);
    const exacte = cotes.reduce((s, [a, b]) => s + a * b, 0);
    expect(e!.pied![1]).toBe(`${(Math.round(exacte * 100) / 100).toFixed(2).replace(".", ",")} m²`);
  });

  it("refus nommés : face non horizontale, sélection qui n'est pas une face, nom vide ; rien n'est enregistré", async () => {
    let m = modeleVide();
    m = ajouterRectangle(m, v3(0, 0, 0), v3(2, 0, 0), v3(0, 0, 2.5)).modele;
    const mur = Object.keys(m.racine.faces)[0]!;
    const p = planche(m);
    await p.declarer(mur, { nom: "Mur" });
    expect(p.derniereAlerte()).toMatch(/pas horizontale/);
    p.etat.selection = [];
    await p.action("declarer");
    expect(p.derniereAlerte()).toMatch(/une seule face de sol/);
    p.etat.selection = [Object.keys(p.etat.modele.racine.aretes)[0]!];
    await p.action("declarer");
    expect(p.derniereAlerte()).toMatch(/n'est pas une face/);
    const sol = rectangles([[3, 3]]);
    const q = planche(sol.modele);
    await q.declarer(sol.faces[0]!, { nom: "   " });
    expect(q.derniereAlerte()).toMatch(/obligatoire/);
    expect(p.etat.pas).toEqual([]);
    expect(q.etat.pas).toEqual([]);
  });

  it("une face disparue reste dans le tableau, nommée et non comptée ; le local peut être retiré", async () => {
    const { modele, faces } = rectangles([
      [4, 3],
      [2, 2],
    ]);
    const p = planche(modele);
    await p.declarer(faces[0]!, { numero: "001", nom: "Séjour", niveau: "RDC" });
    await p.declarer(faces[1]!, { numero: "004", nom: "WC", niveau: "RDC" });
    const sansWc = structuredClone(p.etat.modele) as Modele & { racine: { faces: Record<string, unknown> } };
    delete sansWc.racine.faces[faces[1]!];
    p.etat.modele = sansWc;
    let e = await p.action("etat");
    expect(e.lignes.map((l) => l.genre)).toEqual(["groupe", "ligne", "introuvable"]);
    expect(e.lignes[2]!.cellules[1]).toMatch(/^WC : face introuvable/);
    expect(e.pied).toEqual(["Total · 1 local", "12,00 m²"]);
    p.repondre([{ numero: "004", nom: "WC", usage: "", niveau: "RDC", retirer: true }]);
    e = await p.action("modifier", { id: faces[1]! });
    expect(p.titres.at(-1)).toBe("Modifier le local");
    expect(JSON.stringify(e)).not.toMatch(/WC/);
  });

  it("un clic sur une ligne sélectionne la face du local ; la ligne suit la sélection", async () => {
    const { modele, faces } = rectangles([
      [4, 3],
      [2, 2],
    ]);
    const p = planche(modele);
    await p.declarer(faces[0]!, { nom: "Séjour" });
    await p.declarer(faces[1]!, { nom: "Bureau" });
    p.etat.selection = [];
    const e = await p.action("choisir", { id: faces[1]! });
    expect(p.etat.selection).toEqual([faces[1]]);
    expect(e.lignes.find((l) => l.choisi)?.id).toBe(faces[1]);
  });

  it("CSV : BOM, « ; », séparateur décimal déclaré, règle et version, en-tête avec unités, sous-totaux et total", async () => {
    const { modele, faces } = rectangles([
      [4, 3],
      [2.5, 1.3],
    ]);
    const p = planche(modele);
    await p.declarer(faces[0]!, { numero: "001", nom: 'Séjour "sud"', usage: "Séjour", niveau: "RDC" });
    await p.declarer(faces[1]!, { nom: "Cellier" });
    await p.action("exporter");
    const { nom, texte } = p.etat.fichiers[0]!;
    expect(nom).toBe("tableau-des-surfaces.csv");
    expect(texte.startsWith("﻿")).toBe(true);
    const lignes = texte.slice(1).split("\r\n");
    expect(lignes[0]).toMatch(/^"Tableau des surfaces";"Règle : .*";"tableau-surfaces\/1 \(1\.0\.0\)";"Séparateur décimal : ,"$/);
    expect(lignes.slice(1, -1)).toEqual([
      '"Niveau";"N°";"Local";"Usage";"Surface (m²)"',
      '"RDC";"001";"Séjour ""sud""";"Séjour";12,00',
      '"Sous-total RDC";;"1 local";;12,00',
      '"Sans niveau";"";"Cellier";"";3,25',
      '"Sous-total Sans niveau";;"1 local";;3,25',
      '"Total";;"2 locaux";;15,25',
    ]);
  });

  it("au-delà d'une page, le tableau est paginé dans les bornes du panneau ; le total couvre tous les locaux", async () => {
    const { modele, faces } = rectangles(Array.from({ length: 130 }, () => [1, 2] as const));
    const p = planche(modele);
    for (let i = 0; i < faces.length; i++) await p.declarer(faces[i]!, { numero: String(i + 1).padStart(3, "0"), nom: `Chambre ${i + 1}`, usage: "Chambre", niveau: i < 65 ? "R+1" : "R+2" });
    const e = await p.action("etat");
    expect(e.pages).toBe(2);
    expect(e.lignes).toHaveLength(80);
    expect(e.pied).toEqual(["Total · 130 locaux", "260,00 m²"]);
    expect(JSON.stringify(e).length).toBeLessThan(20_000);
    const suite = await p.action("page", { page: 1 });
    expect(suite.lignes).toHaveLength(52);
    expect(suite.lignes.at(-1)!.cellules[1]).toBe("Chambre 130");
  }, 60_000);
});

describe("extension « Surfaces et programme » — programme (n° 17)", () => {
  it("lignes saisies et CSV chargé ; boîtes carrées de côté √S au mm, groupées et nommées, en un pas", async () => {
    const { modele } = rectangles([[4, 3]]);
    const p = planche(modele);
    p.repondre([{ nom: "Bureau", surface: 12, hauteur: 2.7, nombre: 2 }]);
    await p.action("programme-ajouter", { onglet: "programme" });
    p.fichierAOuvrir({ nom: "programme.csv", texte: "﻿nom;surface;hauteur;nombre\r\nSalle de réunion;25,5;3;1\r\n;10;3;1\r\nArchives;-4;3;1\r\n" });
    let e = await p.action("programme-importer", { onglet: "programme" });
    expect(p.etat.avis.map((a) => a.texte)).toContain("Programme chargé : 1 ligne");
    expect(p.derniereAlerte()).toBe("2 lignes ignorées (nom vide ou surface non positive)");
    expect(cellules(e)).toEqual([
      ["Bureau", "2", "12,00 m²", "3,464 m", "0,00 m²"],
      ["Salle de réunion", "1", "25,50 m²", "5,050 m", "0,00 m²"],
    ]);
    expect(e.pied).toEqual(["Total cible · 3 boîtes", "49,50 m²"]);
    const pas = p.etat.pas.length;
    e = await p.action("generer-boites", { onglet: "programme" });
    expect(p.etat.pas.slice(pas)).toEqual(["Générer les boîtes de programme"]);
    const objets = occurrences(p.etat.modele);
    expect(objets).toHaveLength(3);
    // Les boîtes sont posées à droite du dessin, sans toucher la face existante.
    expect(Object.keys(p.etat.modele.racine.faces)).toHaveLength(1);
    // Régénérer remplace les boîtes précédentes.
    await p.action("generer-boites", { onglet: "programme" });
    expect(occurrences(p.etat.modele)).toHaveLength(3);
  });

  it("programme vide : refus nommé, rien n'est dessiné", async () => {
    const p = planche(modeleVide());
    await p.action("generer-boites", { onglet: "programme" });
    expect(p.derniereAlerte()).toMatch(/Programme vide/);
    expect(p.etat.pas).toEqual([]);
  });
});

describe("extension « Surfaces et programme » — capacité (n° 24) et typologies (n° 14)", () => {
  it("volumes par niveau sur l'emprise sélectionnée, attique en retrait ; SDP estimée et densités", async () => {
    const { modele, faces } = rectangles([[20, 10]]);
    const p = planche(modele);
    p.etat.selection = [faces[0]!];
    p.repondre([{ niveaux: 3, hauteur: 3, retrait: 2, coefficient: 0.8, terrain: 1000, surfaceLogement: 60 }]);
    const e = await p.action("volumes-capacite", { onglet: "capacite" });
    expect(p.etat.pas).toEqual(["Générer les volumes de capacité"]);
    expect(occurrences(p.etat.modele)).toHaveLength(3);
    // L'emprise reste intacte (les volumes sont dessinés à l'écart puis ramenés, groupés).
    expect(Object.keys(p.etat.modele.racine.faces)).toEqual([faces[0]]);
    expect(cellules(e)).toEqual([
      ["Niveau 1", "0,000 m", "200,00 m²"],
      ["Niveau 2", "3,000 m", "200,00 m²"],
      ["Niveau 3 (attique)", "6,000 m", "96,00 m²"],
      ["SDP (estimation, coefficient 0,8)", "396,80 m²"],
      ["Emprise au sol / terrain", "0,20"],
      ["Surface brute / terrain", "0,50"],
      ["Logements (estimation)", "6"],
      ["Logements par hectare (estimation)", "60,00"],
    ]);
    expect(e.pied).toEqual(["Surface brute · 3 / 3", "496,00 m²"]);
    // Régénérer remplace ; effacer retire tout.
    p.repondre([{ niveaux: 2, hauteur: 3, retrait: 0, coefficient: 1, terrain: 0, surfaceLogement: 0 }]);
    const f = await p.action("volumes-capacite", { onglet: "capacite" });
    expect(occurrences(p.etat.modele)).toHaveLength(2);
    expect(cellules(f).slice(-3)).toEqual([["Surface brute / terrain", "non évaluée"], ["Logements (estimation)", "non évaluée"], ["Logements par hectare (estimation)", "non évaluée"]]);
    await p.action("capacite-effacer", { onglet: "capacite" });
    expect(occurrences(p.etat.modele)).toHaveLength(0);
  });

  it("une emprise loin sur l'axe X reste intacte : le nouveau se reconnaît à son identifiant, pas à sa position", async () => {
    const m = ajouterRectangle(modeleVide(), v3(2000, 0, 0), v3(20, 0, 0), v3(0, 10, 0)).modele;
    const emprise = Object.keys(m.racine.faces)[0]!;
    const p = planche(m);
    p.etat.selection = [emprise];
    p.repondre([{ niveaux: 2, hauteur: 3, retrait: 0, coefficient: 1, terrain: 0, surfaceLogement: 0 }]);
    const e = await p.action("volumes-capacite", { onglet: "capacite" });
    expect(Object.keys(p.etat.modele.racine.faces)).toEqual([emprise]);
    expect(occurrences(p.etat.modele)).toHaveLength(2);
    expect(e.pied).toEqual(["Surface brute · 2 / 2", "400,00 m²"]);
  });

  it("retrait trop grand pour l'emprise : refus nommé, rien n'est dessiné", async () => {
    const { modele, faces } = rectangles([[4, 3]]);
    const p = planche(modele);
    p.etat.selection = [faces[0]!];
    p.repondre([{ niveaux: 2, hauteur: 3, retrait: 2, coefficient: 1, terrain: 0, surfaceLogement: 0 }]);
    await p.action("volumes-capacite", { onglet: "capacite" });
    expect(p.derniereAlerte()).toMatch(/retrait de l'attique est trop grand/);
    expect(p.etat.pas).toEqual([]);
  });

  it("bibliothèque de typologies ; remplissage le long d'une arête ; mix et façade trop courte", async () => {
    const m = ajouterSegment(modeleVide(), v3(0, 0, 0), v3(30, 0, 0)).modele;
    const arete = Object.keys(m.racine.aretes)[0]!;
    const p = planche(m);
    p.repondre([{ nom: "T2", surface: 45, largeur: 6 }]);
    await p.action("typologie-ajouter", { onglet: "typologies" });
    p.repondre([{ nom: "T3", surface: 64, largeur: 8 }]);
    await p.action("typologie-ajouter", { onglet: "typologies" });
    p.etat.selection = [arete];
    p.repondre([{ n0: 3, n1: 2, cote: false }]);
    await p.action("remplir-facade", { onglet: "typologies" });
    expect(p.derniereAlerte()).toBe("La façade est trop courte : 34,000 m demandés pour 30,000 m disponibles ; rien n'a été dessiné.");
    p.repondre([{ n0: 2, n1: 2, cote: false }]);
    const e = await p.action("remplir-facade", { onglet: "typologies" });
    expect(p.etat.pas.at(-1)).toBe("Remplir le long d'une façade");
    expect(occurrences(p.etat.modele)).toHaveLength(4);
    expect(cellules(e)).toEqual([
      ["T2 · 45,00 m²", "6,000 m", "2", "50 %", "90,00 m²"],
      ["T3 · 64,00 m²", "8,000 m", "2", "50 %", "128,00 m²"],
      ["Part de la surface brute de capacité (estimation)", "non évaluée"],
    ]);
    expect(e.pied).toEqual(["Total · 4 logements", "218,00 m²"]);
    // Modifier la bibliothèque après la pose ne change pas la surface des unités déjà dessinées.
    p.repondre([{ nom: "T2", surface: 90, largeur: 6, retirer: false }]);
    const apres = await p.action("typologie-modifier", { onglet: "typologies", id: e.lignes[0]!.id });
    expect(apres.pied).toEqual(["Total · 4 logements", "218,00 m²"]);
    expect(apres.lignes[0]!.cellules).toEqual(["T2 · 90,00 m²", "6,000 m", "2", "50 %", "90,00 m²"]);
    await p.action("typologies-effacer", { onglet: "typologies" });
    expect(occurrences(p.etat.modele)).toHaveLength(0);
  });
});

describe("extension « Surfaces et programme » — lots (n° 30) et SDP du permis (n° 31)", () => {
  it("logements avec surfaces principales et annexes ; un local dans un seul logement ; locaux sans lot", async () => {
    const { modele, faces } = rectangles([
      [4, 3],
      [3, 3],
      [2, 2],
      [1, 1],
    ]);
    const p = planche(modele);
    for (const [i, nom] of ["Séjour", "Chambre", "Cave", "Placard"].entries()) await p.declarer(faces[i]!, { numero: `00${i + 1}`, nom });
    p.etat.selection = [faces[0]!, faces[1]!];
    p.repondre([{ genre: "logement", numero: "12", nom: "", typologie: "T2", etage: "R+1", annexe: false }]);
    await p.action("creer-lot", { onglet: "lots" });
    p.etat.selection = [faces[2]!];
    p.repondre([{ genre: "logement", numero: "12", nom: "", typologie: "", etage: "", annexe: true }]);
    let e = await p.action("creer-lot", { onglet: "lots" });
    expect(cellules(e)).toEqual([
      ["Logement 12 · T2 · R+1", "21,00 m² + 4,00 m²"],
      ["", "001 Séjour", "principal", "12,00 m²"],
      ["", "002 Chambre", "principal", "9,00 m²"],
      ["", "003 Cave", "annexe", "4,00 m²"],
      ["Locaux sans lot · 1 local", ""],
      ["", "004 Placard", "–", "1,00 m²"],
      ["SHAB et Carrez : non évaluées (hauteurs sous plafond non déclarées)", ""],
    ]);
    p.etat.selection = [faces[1]!];
    p.repondre([{ genre: "logement", numero: "13", nom: "", typologie: "", etage: "", annexe: false }]);
    await p.action("creer-lot", { onglet: "lots" });
    expect(p.derniereAlerte()).toBe("Le local « Chambre » appartient déjà à « Logement 12 · T2 · R+1 » : retirez-le de ce lot d'abord.");
    // Un même local peut appartenir à un logement et à un lot de copropriété.
    p.repondre([{ genre: "lot", numero: "7", nom: "", typologie: "", etage: "", annexe: false }]);
    e = await p.action("creer-lot", { onglet: "lots" });
    expect(e.lignes.filter((l) => l.genre === "groupe").map((l) => l.cellules[0])).toContain("Lot de copropriété 7");
    e = await p.action("lot-retirer", { onglet: "lots", id: e.lignes.find((l) => l.cellules[0] === "Lot de copropriété 7")!.id });
    expect(JSON.stringify(e)).not.toMatch(/copropriété 7/);
    p.etat.selection = [Object.keys(p.etat.modele.racine.aretes)[0]!];
    await p.action("creer-lot", { onglet: "lots" });
    expect(p.derniereAlerte()).toMatch(/n'est pas un local déclaré/);
  });

  it("SDP ventilée par destination et par état, déduction motivée ; non qualifiés listés ; export CSV", async () => {
    const { modele, faces } = rectangles([
      [10, 10],
      [5, 4],
      [3, 2],
      [2, 2],
    ]);
    const p = planche(modele);
    for (const [i, nom] of ["Logement", "Extension", "Garage", "Abri"].entries()) await p.declarer(faces[i]!, { nom });
    const qualifier = async (i: number, v: ValeursSaisie) => {
      p.etat.selection = [faces[i]!];
      p.repondre([v]);
      return p.action("qualifier-local", { onglet: "sdp" });
    };
    await qualifier(0, { destination: "Habitation", etat: "existant", deduction: 8, motif: "Trémie d'escalier" });
    await qualifier(1, { destination: "Habitation", etat: "cree", deduction: 0, motif: "" });
    await qualifier(2, { destination: "Habitation", etat: "demoli", deduction: 1, motif: "" });
    expect(p.derniereAlerte()).toMatch(/demande son motif/);
    const e = await qualifier(2, { destination: "Habitation", etat: "demoli", deduction: 0, motif: "" });
    expect(cellules(e)).toEqual([
      ["Habitation", "92,00 m²", "20,00 m²", "6,00 m²"],
      ["Après travaux = conservée + créée", "112,00 m²"],
      ["Locaux non qualifiés (non comptés) · 1 local", ""],
      ["Abri", "4,00 m²", "", ""],
    ]);
    expect(e.pied).toEqual(["Total", "92,00 m²", "20,00 m²", "6,00 m²"]);
    await p.action("sdp-exporter", { onglet: "sdp" });
    const lignes = p.etat.fichiers[0]!.texte.slice(1).split("\r\n");
    expect(p.etat.fichiers[0]!.nom).toBe("sdp-du-permis.csv");
    expect(lignes.slice(1, 5)).toEqual([
      '"Destination";"Conservée (m²)";"Créée (m²)";"Démolie (m²)";"Après travaux (m²)"',
      '"Habitation";92,00;20,00;6,00;112,00',
      '"Total";92,00;20,00;6,00;112,00',
      '"Habitation";"Logement";"Déduction 8,00";"Trémie d\'escalier";',
    ]);
  });
});

describe("extension « Surfaces et programme » — commandes et langue", () => {
  it("Ctrl+Alt+S ouvre le panneau ; chaque commande ouvre son onglet ; textes en anglais", async () => {
    const { modele, faces } = rectangles([[4, 3]]);
    const p = planche(modele);
    await p.h.appeler("demande", "commande.ouvrir-panneau", { langue: "fr" });
    expect(p.etat.ouverts).toEqual(["surfaces"]);
    p.etat.selection = [faces[0]!];
    p.repondre([{ numero: "001", nom: "Séjour", usage: "", niveau: "" }]);
    await p.h.appeler("demande", "commande.declarer-local", { langue: "en" });
    expect(p.titres).toEqual(["Declare a room"]);
    expect(p.etat.avis.at(-1)).toMatchObject({ genre: "info", texte: "Room declared: 001 Séjour" });
    expect(p.etat.envois.at(-1)).toMatchObject({ onglet: "surfaces", pied: ["Total · 1 room", "12,00 m²"] });
    await p.h.appeler("demande", "commande.qualifier-local", { langue: "en" });
    expect(p.etat.envois.at(-1)).toMatchObject({ onglet: "sdp", colonnes: ["Use class", "Kept", "Created", "Demolished"] });
  });
});
