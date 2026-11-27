/**
 * Extension « Plans reçus et présentation » (catalogue des extensions, cas 1 de la feuille de route, extension n° 8 ;
 * maquette validée le 27 novembre 2026) : le paquet livré dans `apps/web/extensions/plans/` passe l'import de
 * l'administrateur, puis tourne dans le vrai exécutant, servi par les vrais services de la Planche sur un vrai modèle.
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ajouterRectangle, appliquer, contexte, creerExecutantExtension, jugerImportPaquet, modeleVide, modifierAnnotations, v3, type AccesPlanche, type AvisExtension, type ExecutantExtension, type Id, type Modele, type PaquetExtension, type ValeursSaisie } from "@parcours/sandbox-planche-model";
import { creerHoteExtension, type WorkerExtension } from "./hote-extensions";

const DOSSIER = "../../../../extensions/plans/";
const lire = (chemin: string) => readFileSync(fileURLToPath(new URL(DOSSIER + chemin, import.meta.url)), "utf8");
const PAQUET = JSON.parse(lire("plans.fadi-addon.json")) as PaquetExtension;

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
    const r = await h.appeler("demande", `panneau.plans.${nom}`, { langue: "fr", ...donnees });
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

const occurrences = (m: Modele) => Object.values(contexte(m, undefined).occurrences);
const nomDefinition = (m: Modele, occ: Id) => m.definitions[contexte(m, undefined).occurrences[occ]!.definition]!.nom;
const composer4 = (a: readonly number[], b: readonly number[]) => {
  const r: number[] = [];
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { let s = 0; for (let k = 0; k < 4; k++) s += a[i * 4 + k]! * b[k * 4 + j]!; r.push(s); }
  return r;
};
/** Faces et arêtes d'une occurrence, en coordonnées du dessin. */
function monde(m: Modele, occ: Id) {
  const faces: [number, number, number][][] = [];
  const aretes: [number, number, number][][] = [];
  const visiter = (o: { definition: Id; transformation: readonly number[] }, M: readonly number[]) => {
    const c = m.definitions[o.definition]!.contenu;
    const pt = (s: Id) => { const p = appliquer(M, c.sommets[s]!.position); return [p.x, p.y, p.z] as [number, number, number]; };
    for (const f of Object.values(c.faces)) faces.push(f.exterieur.map(pt));
    for (const a of Object.values(c.aretes)) aretes.push([pt(a.a), pt(a.b)]);
    for (const sous of Object.values(c.occurrences)) visiter(sous, composer4(M, sous.transformation));
  };
  const o = contexte(m, undefined).occurrences[occ]!;
  visiter(o, o.transformation);
  return { faces, aretes };
}
const arrondi = (v: number) => Math.round(v * 1e6) / 1e6;

/** Levé DXF d'essai : courbes 3D, bâti fermé (et un contour ouvert), limite fermée, cartouche en textes, arbres en cercles. */
function dxfLeve(): string {
  const l: (string | number)[] = [0, "SECTION", 2, "HEADER", 9, "$INSUNITS", 70, 6, 0, "ENDSEC", 0, "SECTION", 2, "ENTITIES"];
  const lw = (calque: string, pts: [number, number][], ferme: boolean) => {
    l.push(0, "LWPOLYLINE", 8, calque, 90, pts.length, 70, ferme ? 1 : 0, 38, 0);
    for (const [x, y] of pts) l.push(10, x, 20, y);
  };
  l.push(0, "POLYLINE", 8, "TOPO_COURBES", 66, 1, 30, 0, 70, 8);
  for (const [x, y] of [[0, 30], [20, 31], [40, 30]] as const) l.push(0, "VERTEX", 8, "TOPO_COURBES", 10, x, 20, y, 30, 412, 70, 32);
  l.push(0, "SEQEND");
  lw("BATI_EXIST", [[0, 0], [10, 0], [10, 8], [0, 8]], true);
  lw("BATI_EXIST", [[15, 0], [21, 0], [21, 6], [15, 6]], true);
  lw("BATI_EXIST", [[25, 0], [30, 0], [30, 4]], false);
  lw("LIMITES", [[-5, -5], [45, -5], [45, 40], [-5, 40]], true);
  for (let i = 0; i < 3; i++) l.push(0, "TEXT", 8, "CARTOUCHE", 10, i, 20, -10, 1, "Cartouche");
  l.push(0, "CIRCLE", 8, "VEGETAL", 10, 12, 20, 20, 40, 2);
  l.push(0, "ENDSEC", 0, "EOF");
  return l.join("\n") + "\n";
}
const ROLES = { BATI_EXIST: "emprise", TOPO_COURBES: "courbe", LIMITES: "limite", CARTOUCHE: "ignorer", VEGETAL: "arbre" } as const;

async function affecter(p: ReturnType<typeof planche>) {
  for (const [c, r] of Object.entries(ROLES)) {
    p.repondre([{ role: r }]);
    await p.action("choisir", { onglet: "calques", id: `calque:${c}` });
  }
}

describe("extension « Plans reçus et présentation » — paquet", () => {
  it("le paquet versionné est exactement l'assemblage de ses sources", () => {
    expect(PAQUET).toEqual(assembler());
  });

  it("passe l'import de l'administrateur : forme, une icône et un raccourci par commande (règle d'or)", () => {
    expect(jugerImportPaquet(PAQUET)).toMatchObject({ ok: true });
    const icones = [...PAQUET.fiche.commandes.map((c) => c.icone), ...PAQUET.fiche.panneaux.map((p) => p.icone)];
    expect(icones.every((i) => typeof i === "string" && PAQUET.pages[i!]?.startsWith("<svg"))).toBe(true);
    expect(new Set(icones).size).toBe(icones.length);
    expect(PAQUET.fiche.commandes.map((c) => c.raccourci)).toEqual(["Ctrl+Alt+D", "Ctrl+Maj+F7", "Ctrl+Maj+F8", "Ctrl+Maj+F9"]);
  });

  it("aucun nom de produit tiers ; chaque bouton a son action", () => {
    expect(JSON.stringify(PAQUET)).not.toMatch(/sketchup/i);
    const actions = [...PAQUET.pages["panneau.js"]!.matchAll(/action: "([a-z-]+)"/g)].map((m) => m[1]);
    expect(new Set(actions).size).toBe(5);
    for (const a of actions) expect(PAQUET.code).toContain(`action("${a}"`);
  });
});

describe("extension « Plans reçus et présentation » — calques (n° 21) et maquette blanche (n° 34)", () => {
  it("rôles donnés calque par calque, rien de deviné ; la correspondance gardée comme modèle se reprend sans geste", async () => {
    const p = planche(modeleVide());
    p.fichierAOuvrir({ nom: "leve.dxf", texte: dxfLeve() });
    let e = await p.action("charger-dxf", { onglet: "calques" });
    expect(e.colonnes).toEqual(["Calque", "Entités", "Rôle"]);
    expect(e.lignes.map((l) => l.cellules)).toEqual([
      ["BATI_EXIST", "3", "non affecté"], ["CARTOUCHE", "3", "non affecté"], ["LIMITES", "1", "non affecté"], ["TOPO_COURBES", "1", "non affecté"], ["VEGETAL", "1", "non affecté"],
    ]);
    await affecter(p);
    expect(p.titres[0]).toBe("Rôle du calque « BATI_EXIST »");
    e = await p.action("etat", { onglet: "calques" });
    expect(e.lignes.map((l) => l.cellules[2])).toEqual(["emprise bâtie", "ignorer", "limite", "courbe de niveau", "arbre"]);
    expect(e.formulaire.map((c) => c.id)).toEqual(["modele"]);
    e = await p.action("relire", { onglet: "calques", valeurs: { modele: "Levé géomètre type A" } });
    expect(e.onglet).toBe("maquette");
    expect(p.etat.avis.map((a) => a.texte)).toContain("Correspondance gardée comme modèle « Levé géomètre type A ».");
    // Fichier suivant : la correspondance revient sans aucun geste.
    p.fichierAOuvrir({ nom: "leve-2.dxf", texte: dxfLeve() });
    e = await p.action("charger-dxf", { onglet: "calques" });
    expect(p.etat.avis.at(-1)!.texte).toBe("Correspondance « Levé géomètre type A » reprise : 5 calques.");
    expect(e.lignes.map((l) => l.cellules[2])).toEqual(["emprise bâtie", "ignorer", "limite", "courbe de niveau", "arbre"]);
    expect(e.resultats).toContainEqual({ libelle: "Modèle repris", valeur: "Levé géomètre type A" });
  });

  it("relecture puis construction en un seul pas : emprises extrudées à la hauteur saisie, contours ouverts listés", async () => {
    const p = planche(modeleVide());
    p.fichierAOuvrir({ nom: "leve.dxf", texte: dxfLeve() });
    await p.action("charger-dxf", { onglet: "calques" });
    await affecter(p);
    let e = await p.action("relire", { onglet: "calques" });
    expect(e.colonnes).toEqual(["Calque", "Rôle", "Fermés", "Ouverts", "Construit"]);
    expect(e.lignes[0]!.cellules).toEqual(["BATI_EXIST", "emprise bâtie", "2", "1", "non extrudé (hauteur absente)"]);
    e = await p.action("etat", { onglet: "maquette", valeurs: { hauteur: "9", recaler: "non" } });
    expect(e.lignes.map((l) => l.cellules)).toEqual([
      ["BATI_EXIST", "emprise bâtie", "2", "1", "volumes 9,00 m"],
      ["CARTOUCHE", "ignorer", "0", "0", "ignoré"],
      ["LIMITES", "limite", "1", "0", "lignes"],
      ["TOPO_COURBES", "courbe de niveau", "0", "1", "lignes"],
      ["VEGETAL", "arbre", "0", "0", "listé"],
    ]);
    expect(e.resultats).toEqual([{ libelle: "Volumes à construire", valeur: "2" }, { libelle: "Segments en lignes", valeur: "6" }, { libelle: "Contours ouverts non extrudés", valeur: "1", ton: "alerte" }]);
    expect(e.encart).toBe("Contours ouverts listés sans être extrudés ; tout tient en un seul pas d'annulation.");
    await p.action("construire", { onglet: "maquette", valeurs: { hauteur: "9", recaler: "non" } });
    expect(p.derniereAlerte()).toBe("");
    expect(p.etat.pas).toEqual(["Construire la maquette blanche"]);
    const [g] = occurrences(p.etat.modele);
    expect(nomDefinition(p.etat.modele, g!.id)).toBe("Maquette blanche — leve.dxf");
    const w = monde(p.etat.modele, g!.id);
    expect(w.faces).toHaveLength(12);
    const zs = w.faces.flat().map((q) => arrondi(q[2]));
    expect([Math.min(...zs), Math.max(...zs)]).toEqual([0, 9]);
    const xs = w.aretes.flat().map((q) => arrondi(q[0]));
    expect([Math.min(...xs), Math.max(...xs)]).toEqual([-5, 45]);
    expect(w.aretes.some((a) => a.every((q) => arrondi(q[2]) === 412))).toBe(true);
    expect(p.etat.avis.at(-1)!.texte).toBe("Maquette blanche construite : 2 volumes, 6 segments.");
  });

  it("unité : déclarée (mm) convertie en mètres ; non déclarée, un choix explicite est exigé, sinon refus", async () => {
    const dxf = (u: number | null) => {
      const l: (string | number)[] = u === null ? [] : [0, "SECTION", 2, "HEADER", 9, "$INSUNITS", 70, u, 0, "ENDSEC"];
      l.push(0, "SECTION", 2, "ENTITIES", 0, "LWPOLYLINE", 8, "BATI", 90, 4, 70, 1);
      for (const [x, y] of [[0, 0], [10000, 0], [10000, 8000], [0, 8000]]) l.push(10, x, 20, y);
      l.push(0, "ENDSEC", 0, "EOF");
      return l.join("\n") + "\n";
    };
    const p = planche(modeleVide());
    p.fichierAOuvrir({ nom: "mm.dxf", texte: dxf(4) });
    await p.action("charger-dxf", { onglet: "calques" });
    expect(p.etat.avis.map((a) => a.texte)).toContain("Coordonnées converties en mètres depuis l'unité déclarée par le fichier : millimètre.");
    p.repondre([{ role: "emprise" }]);
    await p.action("choisir", { onglet: "calques", id: "calque:BATI" });
    await p.action("relire", { onglet: "calques" });
    await p.action("construire", { onglet: "maquette", valeurs: { hauteur: "3", recaler: "non" } });
    expect(p.derniereAlerte()).toBe("");
    const w = monde(p.etat.modele, occurrences(p.etat.modele)[0]!.id);
    const pts = w.faces.flat();
    expect([0, 1, 2].map((k) => [Math.min(...pts.map((q) => arrondi(q[k]!))), Math.max(...pts.map((q) => arrondi(q[k]!)))])).toEqual([[0, 10], [0, 8], [0, 3]]);
    const q = planche(modeleVide());
    q.fichierAOuvrir({ nom: "sans.dxf", texte: dxf(null) });
    q.repondre([null]);
    await q.action("charger-dxf", { onglet: "calques" });
    expect(q.titres).toEqual(["Unité du fichier DXF"]);
    expect(q.derniereAlerte()).toBe("DXF refusé : l'unité des coordonnées n'est pas déclarée et n'a pas été choisie");
    q.repondre([{ unite: "cm" }]);
    const e = await q.action("charger-dxf", { onglet: "calques" });
    expect(e.lignes.map((l) => l.cellules)).toEqual([["BATI", "1", "non affecté"]]);
    expect(q.etat.avis.at(-1)!.texte).toBe("Coordonnées converties en mètres depuis l'unité choisie : centimètre.");
  });

  it("un segment courbe (renflement) est découpé en cordes, signalé, et l'emprise garde sa forme", async () => {
    const l: (string | number)[] = [0, "SECTION", 2, "HEADER", 9, "$INSUNITS", 70, 6, 0, "ENDSEC", 0, "SECTION", 2, "ENTITIES", 0, "LWPOLYLINE", 8, "BATI", 90, 4, 70, 1];
    l.push(10, 0, 20, 0, 10, 10, 20, 0, 42, 1, 10, 10, 20, 8, 10, 0, 20, 8, 0, "ENDSEC", 0, "EOF");
    const p = planche(modeleVide());
    p.fichierAOuvrir({ nom: "courbe.dxf", texte: l.join("\n") + "\n" });
    await p.action("charger-dxf", { onglet: "calques" });
    expect(p.etat.avis.at(-1)!.texte).toBe("1 segment courbe (renflement) découpé en cordes de 7,5° au plus.");
    p.repondre([{ role: "emprise" }]);
    await p.action("choisir", { onglet: "calques", id: "calque:BATI" });
    await p.action("relire", { onglet: "calques" });
    await p.action("construire", { onglet: "maquette", valeurs: { hauteur: "3", recaler: "non" } });
    expect(p.derniereAlerte()).toBe("");
    const pts = monde(p.etat.modele, occurrences(p.etat.modele)[0]!.id).faces.flat();
    // Demi-cercle de rayon 4 posé sur le côté x = 10 : il atteint x = 14 en y = 4, tous ses points à 4 m du centre.
    expect(Math.max(...pts.map((q) => arrondi(q[0]!)))).toBe(14);
    expect(pts.filter((q) => q[0]! > 10 + 1e-6).every((q) => Math.abs(Math.hypot(q[0]! - 10, q[1]! - 4) - 4) < 1e-6)).toBe(true);
  });

  it("deux modèles de quatre-vingts calques sont gardés malgré la borne d'une valeur, et repris au fichier suivant", async () => {
    const l: (string | number)[] = [0, "SECTION", 2, "HEADER", 9, "$INSUNITS", 70, 6, 0, "ENDSEC", 0, "SECTION", 2, "ENTITIES"];
    const noms = Array.from({ length: 80 }, (_, i) => `SURVEY_LAYER_${String(i).padStart(3, "0")}`);
    noms.forEach((c, i) => l.push(0, "LINE", 8, c, 10, i, 20, 0, 30, 0, 11, i, 21, 1, 31, 0));
    l.push(0, "ENDSEC", 0, "EOF");
    const texte = l.join("\n") + "\n";
    const p = planche(modeleVide());
    p.fichierAOuvrir({ nom: "a.dxf", texte });
    await p.action("charger-dxf", { onglet: "calques" });
    for (const c of noms) {
      p.repondre([{ role: "limite" }]);
      await p.action("choisir", { onglet: "calques", id: `calque:${c}` });
    }
    let e = await p.action("relire", { onglet: "calques", valeurs: { modele: "Modèle A" } });
    expect(e.onglet).toBe("maquette");
    p.fichierAOuvrir({ nom: "b.dxf", texte });
    await p.action("charger-dxf", { onglet: "calques" });
    e = await p.action("relire", { onglet: "calques", valeurs: { modele: "Modèle B" } });
    expect(e.onglet).toBe("maquette");
    expect(p.derniereAlerte()).toBe("");
    expect(p.etat.avis.map((a) => a.texte)).toContain("Correspondance gardée comme modèle « Modèle B ».");
    p.fichierAOuvrir({ nom: "c.dxf", texte });
    await p.action("charger-dxf", { onglet: "calques" });
    expect(p.etat.avis.at(-1)!.texte).toMatch(/^Correspondance « Modèle [AB] » reprise : 80 calques\.$/);
  }, 60_000);

  it("annuler la relecture ne construit rien ; un fichier qui n'est pas un DXF est refusé", async () => {
    const p = planche(modeleVide());
    p.fichierAOuvrir({ nom: "leve.dxf", texte: dxfLeve() });
    await p.action("charger-dxf", { onglet: "calques" });
    await affecter(p);
    await p.action("relire", { onglet: "calques" });
    const e = await p.action("annuler", { onglet: "maquette" });
    expect(e.vide).toMatch(/^Chargez un DXF/);
    expect(occurrences(p.etat.modele)).toHaveLength(0);
    p.fichierAOuvrir({ nom: "faux.dxf", texte: "bonjour\nceci\nn'est\npas" });
    await p.action("charger-dxf", { onglet: "calques" });
    expect(p.derniereAlerte()).toBe("DXF refusé : le fichier n'est pas un DXF texte (ASCII) lisible");
  });
});

describe("extension « Plans reçus et présentation » — silhouettes et arbres (n° 29)", () => {
  it("adulte 1,70 m posé comme composant, sur la face choisie, de la matière choisie ; hauteur saisie pour les autres", async () => {
    let m = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(10, 0, 0), v3(0, 6, 0)).modele;
    const face = Object.keys(m.racine.faces)[0]!;
    const r = modifierAnnotations(m, (a, id) => { const k = id("m"); a.materiaux[k] = { id: k, nom: "Gris clair", couleur: "#cccccc" }; return k; });
    m = r.modele;
    const p = planche(m);
    let e = await p.action("etat", { onglet: "silhouettes" });
    expect(e.formulaire.map((c) => [c.id, c.valeur])).toEqual([["genre", "adulte"], ["taille", "1,70"], ["matiere", ""]]);
    p.etat.selection = [face];
    e = await p.action("poser-silhouette", { onglet: "silhouettes", valeurs: { genre: "adulte", taille: "1,70", matiere: r.extra } });
    expect(p.etat.pas.at(-1)).toBe("Poser une silhouette");
    const [s] = occurrences(p.etat.modele);
    expect(nomDefinition(p.etat.modele, s!.id)).toBe("Silhouette — adulte 1,70 m");
    expect(p.etat.modele.definitions[s!.definition]!.genre).toBe("composant");
    expect(s!.materiau).toBe(r.extra);
    const pts = monde(p.etat.modele, s!.id).faces.flat();
    expect([Math.min(...pts.map((q) => arrondi(q[2]))), Math.max(...pts.map((q) => arrondi(q[2])))]).toEqual([0, 1.7]);
    expect(arrondi((Math.min(...pts.map((q) => q[0])) + Math.max(...pts.map((q) => q[0]))) / 2)).toBe(5);
    expect(new Set(pts.map((q) => arrondi(q[1])))).toEqual(new Set([3]));
    expect(Object.keys(p.etat.modele.racine.faces)).toEqual([face]);
    expect(e.lignes.map((l) => l.cellules)).toEqual([["adulte", "1,70 m"]]);
    p.etat.selection = [];
    await p.action("poser-silhouette", { onglet: "silhouettes", valeurs: { genre: "arbre", taille: "" } });
    expect(p.derniereAlerte()).toBe("La hauteur doit être un nombre positif, en mètres.");
    e = await p.action("poser-silhouette", { onglet: "silhouettes", valeurs: { genre: "arbre", taille: "6", matiere: "" } });
    expect(e.lignes.map((l) => l.cellules)).toEqual([["adulte", "1,70 m"], ["arbre", "6,00 m"]]);
    const arbre = occurrences(p.etat.modele).find((o) => o.id !== s!.id)!;
    const xa = monde(p.etat.modele, arbre.id).faces.flat().map((q) => q[0]);
    expect(Math.min(...xa)).toBeGreaterThan(10);
  });
});

describe("extension « Plans reçus et présentation » — commandes et langue", () => {
  it("Ctrl+Alt+D ouvre le panneau ; chaque commande ouvre son onglet ; textes en anglais", async () => {
    const p = planche(modeleVide());
    await p.h.appeler("demande", "commande.ouvrir-panneau", { langue: "fr" });
    expect(p.etat.ouverts).toEqual(["plans"]);
    for (const [c, o] of [["calques", "calques"], ["silhouettes", "silhouettes"], ["maquette", "maquette"]] as const) {
      await p.h.appeler("demande", `commande.${c}`, { langue: "en" });
      expect(p.etat.envois.at(-1)).toMatchObject({ onglet: o });
    }
    expect(p.etat.envois.at(-1)).toMatchObject({ colonnes: ["Layer", "Role", "Closed", "Open", "Built"], encart: "Open outlines listed without being extruded; everything fits in a single undo step." });
  });
});
