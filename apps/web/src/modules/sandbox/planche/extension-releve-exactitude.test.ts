/**
 * Extension « Relevé et exactitude » (catalogue des extensions, cas 1 de la feuille de route, extension n° 2 ;
 * maquette validée le 27 novembre 2026) : le paquet livré dans `apps/web/extensions/releve-exactitude/` passe l'import
 * de l'administrateur, puis tourne dans le vrai exécutant, servi par les vrais services de la Planche sur un vrai modèle.
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ajouterRectangle, ajouterSegment, creerExecutantExtension, jugerImportPaquet, modeleVide, v3, type AccesPlanche, type AvisExtension, type ExecutantExtension, type Id, type Modele, type PaquetExtension, type ValeursSaisie } from "@parcours/sandbox-planche-model";
import { creerHoteExtension, type WorkerExtension } from "./hote-extensions";

const DOSSIER = "../../../../extensions/releve-exactitude/";
const lire = (chemin: string) => readFileSync(fileURLToPath(new URL(DOSSIER + chemin, import.meta.url)), "utf8");
const PAQUET = JSON.parse(lire("releve-exactitude.fadi-addon.json")) as PaquetExtension;

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
  formulaire: { id: string; libelle: string; valeur: string }[];
  resultats: { libelle: string; valeur: string; ton?: string }[];
  encart: string | null;
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
    const r = await h.appeler("demande", `panneau.releve.${nom}`, { langue: "fr", ...donnees });
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
const cellules = (e: Etat) => e.lignes.map((l) => l.cellules);

const faces = (m: Modele) => Object.keys(m.racine.faces);
const aretes = (m: Modele) => Object.keys(m.racine.aretes);
const virgule = (v: number) => String(v).replace(".", ",");
const valeur = (e: Etat, libelle: string) => e.resultats.find((r) => r.libelle === libelle)?.valeur;

/** Quadrilatère relevé : côtés et diagonales exacts d'un contour connu, au millionième. */
function releve(pts: readonly (readonly [number, number])[]) {
  const d = (a: readonly [number, number], b: readonly [number, number]) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  const cotes = pts.map((p, i) => d(p, pts[(i + 1) % pts.length]!));
  return { cotes: cotes.map((c) => virgule(Number(c.toFixed(6)))).join(" ; "), ac: d(pts[0]!, pts[2]!), bd: d(pts[1]!, pts[3]!) };
}

describe("extension « Relevé et exactitude » — paquet", () => {
  it("le paquet versionné est exactement l'assemblage de ses sources", () => {
    expect(PAQUET).toEqual(assembler());
  });

  it("passe l'import de l'administrateur : forme, une icône et un raccourci par commande (règle d'or)", () => {
    expect(jugerImportPaquet(PAQUET)).toMatchObject({ ok: true });
    const icones = [...PAQUET.fiche.commandes.map((c) => c.icone), ...PAQUET.fiche.panneaux.map((p) => p.icone)];
    expect(icones.every((i) => typeof i === "string" && PAQUET.pages[i!]?.startsWith("<svg"))).toBe(true);
    expect(new Set(icones).size).toBe(icones.length);
    expect(PAQUET.fiche.commandes.map((c) => c.raccourci)).toEqual(["Ctrl+Alt+R", "Ctrl+Alt+Maj+P", "Ctrl+Alt+Maj+D", "Ctrl+Alt+Maj+N", "Ctrl+Alt+Maj+U"]);
  });

  it("aucun nom de produit tiers ; chaque bouton de la page appelle une action que le code traite", () => {
    expect(JSON.stringify(PAQUET)).not.toMatch(/sketchup/i);
    const actions = [...PAQUET.pages["panneau.js"]!.matchAll(/action: "([a-z-]+)"/g)].map((m) => m[1]);
    expect(actions.length).toBeGreaterThanOrEqual(7);
    for (const a of actions) expect(PAQUET.code).toContain(`action("${a}"`);
  });
});

describe("extension « Relevé et exactitude » — pièce hors d'équerre (n° 2)", () => {
  it("rectangle 4 × 3 : écart nul, angles droits, surface ; la pièce est posée en un pas, à droite du dessin", async () => {
    const { modele } = rectangles([[2, 2]]);
    const p = planche(modele);
    const e = await p.action("etat", { onglet: "piece", valeurs: { cotes: "4 ; 3 ; 4 ; 3", diagonales: "5 ; 5", tolerance: "5" } });
    expect(e.formulaire.map((c) => c.libelle)).toEqual(["Côtés dans l'ordre du relevé (m)", "Diagonales (m)", "Tolérance de fermeture (mm)"]);
    expect(e.resultats).toEqual([
      { libelle: "Mesure redondante", valeur: "diagonale 2" },
      { libelle: "Écart de fermeture", valeur: "0,0 mm ≤ 5 mm", ton: "ok" },
      { libelle: "Angles", valeur: "90,0° · 90,0° · 90,0° · 90,0°" },
      { libelle: "Surface", valeur: "12,00 m²" },
    ]);
    await p.action("poser-piece", { onglet: "piece" });
    expect(p.etat.pas).toEqual(["Poser la pièce relevée"]);
    expect(faces(p.etat.modele)).toHaveLength(2);
    expect(p.etat.avis.at(-1)).toMatchObject({ genre: "info", texte: "Pièce posée à droite du dessin : 12,00 m²" });
  });

  it("pièce hors d'équerre : écart montré ; au-delà de la tolérance, rien n'est posé et la diagonale en cause est nommée", async () => {
    const r = releve([
      [0, 0],
      [4.2, 0],
      [4.3, 3.1],
      [0.1, 3.3],
    ]);
    const p = planche(modeleVide());
    const diag = (bd: number) => `${virgule(Number(r.ac.toFixed(6)))} ; ${virgule(Number(bd.toFixed(6)))}`;
    let e = await p.action("etat", { onglet: "piece", valeurs: { cotes: r.cotes, diagonales: diag(r.bd + 0.0024), tolerance: "5" } });
    expect(valeur(e, "Écart de fermeture")).toBe("2,4 mm ≤ 5 mm");
    expect(valeur(e, "Angles")!.split(" · ")).toHaveLength(4);
    expect(e.encart).toBe("Au-delà de la tolérance, la pièce n'est pas posée : l'écart et la mesure en cause sont nommés.");
    e = await p.action("etat", { onglet: "piece", valeurs: { cotes: r.cotes, diagonales: diag(r.bd + 0.008), tolerance: "5" } });
    expect(e.resultats.find((x) => x.libelle === "Écart de fermeture")).toMatchObject({ valeur: "8,0 mm > 5 mm", ton: "alerte" });
    expect(e.encart).toMatch(/mesure en cause, la diagonale 2/);
    await p.action("poser-piece", { onglet: "piece" });
    expect(p.derniereAlerte()).toBe("Écart de fermeture de 8,0 mm au-delà de la tolérance de 5 mm : mesure en cause, la diagonale 2. La pièce n'est pas posée.");
    expect(p.etat.pas).toEqual([]);
  });

  it("refus nommés : mesures qui ne ferment pas, diagonales manquantes, valeur illisible", async () => {
    const p = planche(modeleVide());
    let e = await p.action("etat", { onglet: "piece", valeurs: { cotes: "1 ; 1 ; 5", diagonales: "", tolerance: "5" } });
    expect(e.encart).toMatch(/le sommet 3 ne peut pas être construit/);
    e = await p.action("etat", { onglet: "piece", valeurs: { cotes: "4 ; 3 ; 4 ; 3 ; 2", diagonales: "5", tolerance: "5" } });
    expect(e.encart).toMatch(/il faut 2 diagonales/);
    e = await p.action("etat", { onglet: "piece", valeurs: { cotes: "4 ; trois", diagonales: "", tolerance: "5" } });
    expect(e.encart).toMatch(/« Côtés dans l'ordre du relevé \(m\) »/);
    // « Effacer » vide le relevé.
    e = await p.action("effacer-piece", { onglet: "piece" });
    expect(e.formulaire.find((c) => c.id === "cotes")!.valeur).toBe("");
  });
});

describe("extension « Relevé et exactitude » — point par deux distances (n° 6)", () => {
  it("construit le point à gauche ou à droite de l'arête ; refus si les cercles ne se coupent pas ; triangle par trois côtés", async () => {
    const m = ajouterSegment(modeleVide(), v3(0, 0, 0), v3(4, 0, 0)).modele;
    const base = aretes(m)[0]!;
    const p = planche(m);
    p.etat.selection = [base];
    let e = await p.action("etat", { onglet: "point", valeurs: { d1: "3", d2: "5", cote: "gauche" } });
    expect(e.resultats).toEqual([
      { libelle: "Base", valeur: "4,000 m" },
      { libelle: "Point", valeur: "(0,000 ; 3,000 ; 0,000)", ton: "ok" },
    ]);
    await p.action("construire-point", { onglet: "point" });
    expect(p.etat.pas).toEqual(["Construire un point par deux distances"]);
    expect(p.etat.avis.at(-1)!.texte).toBe("Point construit : (0,000 ; 3,000 ; 0,000)");
    p.etat.selection = [base];
    e = await p.action("etat", { onglet: "point", valeurs: { d1: "3", d2: "5", cote: "droite" } });
    expect(valeur(e, "Point")).toBe("(0,000 ; -3,000 ; 0,000)");
    e = await p.action("etat", { onglet: "point", valeurs: { d1: "1", d2: "1", cote: "gauche" } });
    expect(e.encart).toBe("Les deux cercles ne se coupent pas : avec une base de 4,000 m, ces distances ne forment pas de triangle.");
    p.etat.selection = [];
    e = await p.action("etat", { onglet: "point" });
    expect(e.encart).toMatch(/Sélectionnez une seule arête/);
    const avant = faces(p.etat.modele).length;
    await p.action("poser-triangle", { onglet: "point", valeurs: { triangle: "3 ; 4 ; 5" } });
    expect(p.etat.pas.at(-1)).toBe("Poser un triangle par ses trois côtés");
    expect(faces(p.etat.modele).length).toBe(avant + 1);
  });
});

describe("extension « Relevé et exactitude » — provenance (n° 18) et bulletin (n° 3)", () => {
  it("marque la provenance et la précision des éléments ; groupés par provenance ; marque retirée", async () => {
    const { modele, faces: f } = rectangles([[4, 3]]);
    const p = planche(modele);
    const arete = aretes(modele)[0]!;
    p.etat.selection = [f[0]!, arete];
    p.repondre([{ provenance: "mesure", precision: 2, note: "Relevé laser" }]);
    let e = await p.action("marquer-provenance", { onglet: "provenance" });
    expect(p.titres).toEqual(["Marquer la provenance"]);
    expect(cellules(e)[0]).toEqual(["Mesuré · 2 éléments", ""]);
    expect(cellules(e)[1]).toEqual(["Face", "12,00 m²", "± 2 mm", "Relevé laser"]);
    expect(e.pied).toEqual(["Total · 2 éléments", ""]);
    p.etat.selection = [arete];
    p.repondre([{ provenance: "suppose", precision: 0, note: "" }]);
    e = await p.action("marquer-provenance", { onglet: "provenance" });
    expect(e.lignes.filter((l) => l.genre === "groupe").map((l) => l.cellules[0])).toEqual(["Mesuré · 1 élément", "Supposé · 1 élément"]);
    p.repondre([{ provenance: "retirer", precision: 0, note: "" }]);
    e = await p.action("marquer-provenance", { onglet: "provenance" });
    expect(e.lignes.filter((l) => l.genre === "groupe").map((l) => l.cellules[0])).toEqual(["Mesuré · 1 élément"]);
    await p.action("choisir", { onglet: "provenance", id: f[0]! });
    expect(p.etat.selection).toEqual([f[0]]);
  });

  it("bulletin : longueur hors du pas, angle presque droit, sommets presque confondus ; export .md daté, rien n'est corrigé", async () => {
    let m = modeleVide();
    m = ajouterSegment(m, v3(0, 0, 0), v3(2, 0, 0)).modele;
    m = ajouterSegment(m, v3(0, 0, 0), v3(0.003, 2, 0)).modele; // 89,9° environ avec la première
    m = ajouterSegment(m, v3(5, 0, 0), v3(6.0004, 0, 0)).modele; // 1 000,4 mm : hors du pas de 1 mm
    m = ajouterSegment(m, v3(6.0007, 0, 0), v3(6.0007, 1, 0)).modele; // sommet à 0,3 mm du précédent
    const p = planche(m);
    const avant = JSON.stringify(p.etat.modele);
    let e = await p.action("etat", { onglet: "bulletin" });
    expect(e.vide).toMatch(/Contrôler le dessin/);
    e = await p.action("controler-dessin", { onglet: "bulletin", valeurs: { pas: "1", angle: "0,2", sommets: "0,5" } });
    expect(e.resultats.slice(0, 3)).toEqual([
      { libelle: "Longueurs hors du pas", valeur: "2 constats", ton: "alerte" },
      { libelle: "Angles presque droits ou presque alignés", valeur: "1 constat", ton: "alerte" },
      { libelle: "Sommets presque confondus", valeur: "1 constat", ton: "alerte" },
    ]);
    expect(e.resultats[3]!.valeur).toMatch(/^[0-9a-f]{16}$/);
    expect(JSON.stringify(p.etat.modele)).toBe(avant);
    expect(p.etat.pas).toEqual([]);
    await p.action("exporter-bulletin", { onglet: "bulletin" });
    const f = p.etat.fichiers[0]!;
    expect(f.nom).toMatch(/^bulletin-exactitude-\d{4}-\d{2}-\d{2}\.md$/);
    expect(f.texte).toContain("# Bulletin d'exactitude du dessin");
    expect(f.texte).toContain(`\`${e.resultats[3]!.valeur}\``);
    expect(f.texte).toContain("- Seuil d'angle (°) : 0,2");
    expect(f.texte).toContain("Rien n'a été corrigé dans le dessin.");
    // Le dessin change : l'export demande un nouveau contrôle.
    p.etat.modele = ajouterSegment(p.etat.modele, v3(9, 9, 0), v3(10, 9, 0)).modele;
    e = await p.action("etat", { onglet: "bulletin" });
    expect(e.encart).toMatch(/a changé depuis le contrôle/);
    await p.action("exporter-bulletin", { onglet: "bulletin" });
    expect(p.etat.fichiers).toHaveLength(1);
  });
});

describe("extension « Relevé et exactitude » — commandes et langue", () => {
  it("Ctrl+Alt+R ouvre le panneau ; chaque commande ouvre son onglet ; textes en anglais", async () => {
    const p = planche(modeleVide());
    await p.h.appeler("demande", "commande.ouvrir-panneau", { langue: "fr" });
    expect(p.etat.ouverts).toEqual(["releve"]);
    await p.h.appeler("demande", "commande.controler-dessin", { langue: "en" });
    expect(p.etat.avis.at(-1)).toMatchObject({ genre: "info", texte: "Drawing checked: 0 finding" });
    expect(p.etat.envois.at(-1)).toMatchObject({ onglet: "bulletin", colonnes: ["Check", "Element", "Value"] });
    await p.h.appeler("demande", "commande.construire-point", { langue: "en" });
    expect(p.etat.avis.at(-1)).toMatchObject({ genre: "alerte", texte: "Select a single edge: its ends are the two known points." });
  });
});
