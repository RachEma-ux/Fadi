/**
 * Extension « Site et terrain » (catalogue des extensions, cas 1 de la feuille de route, extension n° 7 ; maquette validée
 * le 27 novembre 2026) : le paquet livré dans `apps/web/extensions/site/` passe l'import de l'administrateur, puis
 * tourne dans le vrai exécutant, servi par les vrais services de la Planche sur un vrai modèle.
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ajouterRectangle, appliquer, contexte, creerExecutantExtension, creerFonctionsPlanche, jugerImportPaquet, modeleVide, modifierAnnotations, peindreFaces, v3, type AccesPlanche, type AvisExtension, type ExecutantExtension, type Id, type Modele, type PaquetExtension, type ValeursSaisie } from "@parcours/sandbox-planche-model";
import { creerHoteExtension, type WorkerExtension } from "./hote-extensions";

const DOSSIER = "../../../../extensions/site/";
const lire = (chemin: string) => readFileSync(fileURLToPath(new URL(DOSSIER + chemin, import.meta.url)), "utf8");
const PAQUET = JSON.parse(lire("site.fadi-addon.json")) as PaquetExtension;

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
    const r = await h.appeler("demande", `panneau.site.${nom}`, { langue: "fr", ...donnees });
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

/** Rectangles horizontaux séparés ; rend le modèle et l'identifiant de chaque face. */
function rectangles(l: [number, number, number, number][]): { modele: Modele; faces: Id[] } {
  let m = modeleVide();
  const faces: Id[] = [];
  for (const [x, y, a, b] of l) {
    const avant = new Set(Object.keys(m.racine.faces));
    m = ajouterRectangle(m, v3(x, y, 0), v3(a, 0, 0), v3(0, b, 0)).modele;
    faces.push(Object.keys(m.racine.faces).find((k) => !avant.has(k))!);
  }
  return { modele: m, faces };
}

describe("extension « Site et terrain » — paquet", () => {
  it("le paquet versionné est exactement l'assemblage de ses sources", () => {
    expect(PAQUET).toEqual(assembler());
  });

  it("passe l'import de l'administrateur : forme, une icône et un raccourci par commande (règle d'or)", () => {
    expect(jugerImportPaquet(PAQUET)).toMatchObject({ ok: true });
    const icones = [...PAQUET.fiche.commandes.map((c) => c.icone), ...PAQUET.fiche.panneaux.map((p) => p.icone)];
    expect(icones.every((i) => typeof i === "string" && PAQUET.pages[i!]?.startsWith("<svg"))).toBe(true);
    expect(new Set(icones).size).toBe(icones.length);
    expect(PAQUET.fiche.commandes.map((c) => c.raccourci)).toEqual(["Ctrl+Alt+G", "Ctrl+Maj+F2", "Ctrl+Maj+F3", "Ctrl+Maj+F4", "Ctrl+Maj+F5", "Ctrl+Maj+F6"]);
  });

  it("aucun nom de produit tiers, aucun coefficient ni hauteur dans le code ; chaque bouton a son action", () => {
    expect(JSON.stringify(PAQUET)).not.toMatch(/sketchup/i);
    expect(PAQUET.code).not.toMatch(/coefficients\s*=\s*\{\s*[^}]/);
    const actions = [...PAQUET.pages["panneau.js"]!.matchAll(/action: "([a-z-]+)"/g)].map((m) => m[1]);
    expect(new Set(actions).size).toBe(10);
    for (const a of actions) expect(PAQUET.code).toContain(`action("${a}"`);
  });
});

describe("extension « Site et terrain » — terrain depuis des points (n° 8)", () => {
  it("relevé triangulé : la ligne de rupture est respectée, le terrain est posé à ses cotes dans un groupe", async () => {
    const releve = ["# points", "n;x;y;z", "1;0;0;10", "2;4;-1;11,5", "3;8;0;10", "4;4;1;11,5", "# ruptures", "1;3"].join("\n");
    const p = planche(modeleVide());
    p.fichierAOuvrir({ nom: "releve.csv", texte: releve });
    let e = await p.action("charger-releve", { onglet: "terrain", valeurs: { recaler: "non" } });
    expect(e.resultats).toEqual([
      { libelle: "Fichier", valeur: "releve.csv" }, { libelle: "Points", valeur: "4" }, { libelle: "Lignes de rupture", valeur: "1" },
      { libelle: "Contour", valeur: "aucun" }, { libelle: "Altitudes", valeur: "10,00 – 11,50 m" },
    ]);
    e = await p.action("tracer-terrain", { onglet: "terrain", valeurs: { recaler: "non" } });
    expect(p.derniereAlerte()).toBe("");
    expect(p.etat.pas.at(-1)).toBe("Tracer le terrain");
    expect(e.resultats.slice(5)).toEqual([
      { libelle: "Triangles", valeur: "2" },
      { libelle: "Lignes de rupture respectées", valeur: "1 / 1", ton: "ok" },
      { libelle: "Aire en plan", valeur: "8,0 m²" },
    ]);
    const [g] = occurrences(p.etat.modele);
    expect(nomDefinition(p.etat.modele, g!.id)).toBe("Terrain naturel");
    const w = monde(p.etat.modele, g!.id);
    expect(w.faces).toHaveLength(2);
    // La rupture 1–3 (z = 10) est une arête : la diagonale courte 2–4 n'y est plus.
    const cles = w.aretes.map((a) => a.map((q) => q.map(arrondi).join(",")).sort().join(" "));
    expect(cles).toContain("0,0,10 8,0,10");
    expect(cles).not.toContain("4,-1,11.5 4,1,11.5");
  });

  it("sans la rupture, la diagonale courte ; contour : les triangles hors contour sont retirés ; recalage noté", async () => {
    const pts = ["# points", "0 0 0", "10 0 0", "10 10 0", "0 10 0", "5 5 2", "20 5 0"];
    const p = planche(modeleVide());
    p.fichierAOuvrir({ nom: "semis.txt", texte: [...pts, "# contour", "1;2;3;4"].join("\n") });
    await p.action("charger-releve", { onglet: "terrain", valeurs: { recaler: "non" } });
    let e = await p.action("tracer-terrain", { onglet: "terrain" });
    expect(e.resultats.find((r) => r.libelle === "Triangles")!.valeur).toBe("4");
    expect(e.resultats.find((r) => r.libelle === "Aire en plan")!.valeur).toBe("100,0 m²");
    const q = planche(modeleVide());
    q.fichierAOuvrir({ nom: "loin.txt", texte: ["2600000 1200000 400", "2600010 1200000 401", "2600005 1200008 402", "x y z", "2600005 1200008 405"].join("\n") });
    e = await q.action("charger-releve", { onglet: "terrain", valeurs: { recaler: "oui" } });
    expect(e.resultats.at(-1)).toEqual({ libelle: "Décalage appliqué", valeur: "x −2 600 000,00 · y −1 200 000,00 m" });
    expect(e.lignes.map((l) => l.cellules)).toEqual([["4", "ligne illisible"], ["5", "point confondu en plan avec un autre"]]);
    await q.action("tracer-terrain", { onglet: "terrain" });
    const w = monde(q.etat.modele, occurrences(q.etat.modele)[0]!.id);
    expect(w.faces[0]!.map((r) => r.map(arrondi)).sort()).toEqual([[0, 0, 400], [10, 0, 401], [5, 8, 402]]);
    const r = planche(modeleVide());
    r.fichierAOuvrir({ nom: "deux.txt", texte: "0 0 0\n1 0 0" });
    await r.action("charger-releve", { onglet: "terrain" });
    expect(r.derniereAlerte()).toBe("Relevé refusé : Moins de trois points lus : rien à trianguler.");
  });
});

describe("extension « Site et terrain » — semis plus dense", () => {
  it("semis de 144 points : une face par triangle, aucune face de plus ; plus de 1 000 points : refusé", async () => {
    const l: string[] = [];
    let s = 7;
    const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 12; i++) for (let j = 0; j < 12; j++) l.push(`${i * 3 + r()} ${j * 3 + r()} ${100 + Math.sin(i / 3) * 2 + r() * 0.3}`);
    const p = planche(modeleVide());
    p.fichierAOuvrir({ nom: "semis.txt", texte: [...l, "# ruptures", "1;144"].join("\n") });
    await p.action("charger-releve", { onglet: "terrain" });
    const e = await p.action("tracer-terrain", { onglet: "terrain" });
    const n = Number(e.resultats.find((x) => x.libelle === "Triangles")!.valeur);
    expect(n).toBeGreaterThan(240);
    expect(e.resultats.find((x) => x.libelle === "Lignes de rupture respectées")).toEqual({ libelle: "Lignes de rupture respectées", valeur: "1 / 1", ton: "ok" });
    expect(monde(p.etat.modele, occurrences(p.etat.modele)[0]!.id).faces).toHaveLength(n);
    const q = planche(modeleVide());
    q.fichierAOuvrir({ nom: "gros.txt", texte: Array.from({ length: 1001 }, (_, i) => `${i % 40} ${Math.floor(i / 40)} 0`).join("\n") });
    await q.action("charger-releve", { onglet: "terrain" });
    expect(q.derniereAlerte()).toBe("Relevé refusé : Plus de 1000 points : réduisez le semis (le tracé resterait trop lourd).");
  });
});

/** DXF à la manière de l'export GeoData : polylignes 3D, deux calques, métadonnées en commentaires. */
function dxfCourbes(): string {
  const l: (string | number)[] = [999, "Repere horizontal : EPSG:2056", 999, "Reference verticale : LN02", 999, "Source : Fixture", 999, "Equidistance : 1 m", 0, "SECTION", 2, "ENTITIES"];
  const poly = (calque: string, z: number, pts: [number, number][], ferme = false) => {
    l.push(0, "POLYLINE", 8, calque, 66, 1, 10, 0, 20, 0, 30, z, 70, 8 | (ferme ? 1 : 0));
    for (const [x, y] of pts) l.push(0, "VERTEX", 8, calque, 10, x, 20, y, 30, z, 70, 32);
    l.push(0, "SEQEND");
  };
  poly("COURBES_MAITRESSES", 500, [[2600000, 1200000], [2600010, 1200002], [2600020, 1200000]]);
  poly("COURBES_INTERMEDIAIRES", 501, [[2600000, 1200005], [2600010, 1200007], [2600020, 1200005]]);
  poly("COURBES_INTERMEDIAIRES", 502, [[2600008, 1200010], [2600012, 1200010], [2600012, 1200014], [2600008, 1200014]], true);
  l.push(0, "CIRCLE", 8, "0", 10, 0, 20, 0, 40, 1, 0, "ENDSEC", 0, "EOF");
  return l.join("\r\n") + "\r\n";
}

describe("extension « Site et terrain » — courbes de niveau DXF (n° 26)", () => {
  it("chaque polyligne posée à sa cote, recalée à l'origine, dans un groupe sans face ; repère rappelé, jamais converti", async () => {
    const p = planche(modeleVide());
    p.fichierAOuvrir({ nom: "courbes.dxf", texte: dxfCourbes() });
    let e = await p.action("charger-dxf", { onglet: "courbes", valeurs: { recaler: "oui" } });
    expect(p.etat.avis.map((a) => a.texte)).toEqual(["DXF chargé : 3 polylignes.", "Ignorés : 1 CIRCLE."]);
    expect(e.lignes.map((l) => l.cellules)).toEqual([["COURBES_INTERMEDIAIRES", "2", "501,00 – 502,00 m"], ["COURBES_MAITRESSES", "1", "500,00 m"]]);
    expect(e.resultats).toEqual([
      { libelle: "Fichier", valeur: "courbes.dxf" }, { libelle: "Polylignes", valeur: "3" }, { libelle: "Segments", valeur: "8" },
      { libelle: "Repère horizontal", valeur: "EPSG:2056" }, { libelle: "Référence verticale", valeur: "LN02" }, { libelle: "Source", valeur: "Fixture" },
      { libelle: "Équidistance", valeur: "1 m" }, { libelle: "Décalage appliqué", valeur: "x −2 600 000,00 · y −1 200 000,00 m" },
    ]);
    e = await p.action("choisir", { onglet: "courbes", id: "calque:COURBES_INTERMEDIAIRES" });
    expect(e.formulaire[0]).toMatchObject({ id: "calque", valeur: "COURBES_INTERMEDIAIRES" });
    expect(e.resultats[1]).toEqual({ libelle: "Polylignes", valeur: "2" });
    await p.action("poser-courbes", { onglet: "courbes" });
    expect(p.etat.pas.at(-1)).toBe("Poser les courbes de niveau");
    const [g] = occurrences(p.etat.modele);
    expect(nomDefinition(p.etat.modele, g!.id)).toBe("Courbes de niveau — COURBES_INTERMEDIAIRES");
    const w = monde(p.etat.modele, g!.id);
    expect(w.faces).toHaveLength(0);
    expect(w.aretes).toHaveLength(6);
    expect([...new Set(w.aretes.flatMap((a) => a.map((q) => arrondi(q[2]))))].sort()).toEqual([501, 502]);
    const xs = w.aretes.flatMap((a) => a.map((q) => arrondi(q[0])));
    expect([Math.min(...xs), Math.max(...xs)]).toEqual([0, 20]);
  });

  it("un fichier qui n'est pas un DXF texte est refusé et nommé", async () => {
    const p = planche(modeleVide());
    p.fichierAOuvrir({ nom: "faux.dxf", texte: "bonjour\nceci n'est pas un dxf\nni ceci\nni cela" });
    await p.action("charger-dxf", { onglet: "courbes" });
    expect(p.derniereAlerte()).toBe("DXF refusé : le fichier n'est pas un DXF texte (ASCII) lisible");
  });
});

describe("extension « Site et terrain » — unité foncière (n° 23) et biotope (n° 12)", () => {
  it("parcelles déclarées : surface mesurée et contenance à part, écart ; réunies ; retirer", async () => {
    const { modele, faces } = rectangles([[0, 0, 20, 12], [30, 0, 10, 23.17]]);
    const p = planche(modele);
    p.repondre([{ reference: "123", contenance: "238" }, { reference: "124", contenance: "230" }, { nom: "Parcelles 123 et 124 réunies" }]);
    for (const f of faces) {
      p.etat.selection = [f];
      await p.action("declarer-parcelle", { onglet: "unite" });
    }
    let e = await p.action("reunir-parcelles", { onglet: "unite" });
    expect(p.titres).toEqual(["Déclarer la parcelle", "Déclarer la parcelle", "Réunir en unité foncière"]);
    expect(e.colonnes).toEqual(["Parcelle", "Surface mesurée", "Contenance", "Écart"]);
    expect(e.lignes.map((l) => l.cellules)).toEqual([["123", "240,0 m²", "238 m²", "+2,0 m² (+0,8 %)"], ["124", "231,7 m²", "230 m²", "+1,7 m² (+0,7 %)"]]);
    expect(e.pied).toEqual(["Unité foncière", "471,7 m²", "468 m²", "+3,7 m² (+0,8 %)"]);
    expect(e.resultats).toEqual([
      { libelle: "Unité foncière", valeur: "Parcelles 123 et 124 réunies" },
      { libelle: "Surface mesurée cumulée", valeur: "471,7 m²" },
      { libelle: "Contenance cadastrale cumulée", valeur: "468 m²" },
    ]);
    p.etat.selection = [];
    e = await p.action("choisir", { onglet: "unite", id: faces[1] });
    expect(p.etat.selection).toEqual([faces[1]]);
    expect(e.lignes[1]!.choisi).toBe(true);
    e = await p.action("retirer-parcelle", { onglet: "unite", id: faces[1] });
    expect(e.lignes.map((l) => l.cellules[0])).toEqual(["123"]);
    expect(e.pied![0]).toBe("Total");
    p.etat.selection = [faces[0]!, faces[1]!];
    await p.action("declarer-parcelle", { onglet: "unite" });
    expect(p.derniereAlerte()).toBe("Sélectionnez une seule face horizontale.");
  });

  it("biotope : surfaces par revêtement, coefficients saisis avec l'article, seuil et marge ; un clic sélectionne le revêtement", async () => {
    const base = rectangles([[0, 0, 14, 13], [20, 0, 15.85, 10], [40, 0, 16.4, 8]]);
    const r = modifierAnnotations(base.modele, (a, id) => {
      const ids = ["Pleine terre", "Dalle végétalisée", "Bâti"].map((nom, i) => { const m = id("m"); a.materiaux[m] = { id: m, nom, couleur: ["#cde5c8", "#e4efd2", "#d9d9d9"][i]! }; return m; });
      return ids;
    });
    let m = r.modele;
    base.faces.forEach((f, i) => { m = peindreFaces(m, [f], r.extra[i]!).modele; });
    const p = planche(m);
    let e = await p.action("etat", { onglet: "biotope" });
    expect(e.lignes.map((l) => l.cellules)).toEqual([["Pleine terre", "182,0 m²", "–", "non évaluée"], ["Dalle végétalisée", "158,5 m²", "–", "non évaluée"], ["Bâti", "131,2 m²", "–", "non évaluée"]]);
    expect(e.resultats).toEqual([{ libelle: "Pleine terre", valeur: "non évaluée" }, { libelle: "Coefficient de biotope", valeur: "non évalué" }]);
    p.repondre([{ c0: "1", c1: "0,5", c2: "0", pleine: r.extra[0]!, article: "PLU, art. 13", seuil: "0,40" }]);
    e = await p.action("saisir-coefficients", { onglet: "biotope" });
    expect(p.derniereAlerte()).toBe("");
    expect(p.titres).toEqual(["Coefficients de biotope"]);
    expect(e.colonnes).toEqual(["Revêtement", "Surface", "Coefficient", "Pondérée"]);
    expect(e.lignes.map((l) => l.cellules)).toEqual([["Pleine terre", "182,0 m²", "1,0", "182,0"], ["Dalle végétalisée", "158,5 m²", "0,5", "79,3"], ["Bâti", "131,2 m²", "0,0", "0,0"]]);
    expect(e.pied).toEqual(["Total", "471,7 m²", "", "261,3"]);
    expect(e.resultats).toEqual([
      { libelle: "Pleine terre", valeur: "38,6 %" },
      { libelle: "Coefficient de biotope", valeur: "0,55" },
      { libelle: "Seuil saisi (PLU, art. 13)", valeur: "0,40 · marge 0,15", ton: "ok" },
    ]);
    expect(e.encart).toBe("Les coefficients sont saisis depuis le règlement local, avec la référence de l'article ; rien n'est fourni par défaut.");
    await p.action("choisir", { onglet: "biotope", id: `mat:${r.extra[1]}` });
    expect(p.etat.selection).toEqual([base.faces[1]]);
    p.repondre([{ c0: "2" }]);
    await p.action("saisir-coefficients", { onglet: "biotope" });
    expect(p.derniereAlerte()).toBe("Coefficient de « Pleine terre » : nombre de 0 à 1, ou vide.");
  });
});

describe("extension « Site et terrain » — volumes du contexte (n° 25)", () => {
  it("chaque emprise extrudée à sa hauteur (attribut, niveaux, saisie) ; sans hauteur : signalée, non extrudée", async () => {
    const { modele, faces } = rectangles([[0, 0, 10, 8], [20, 0, 6, 6]]);
    const p = planche(modele);
    p.etat.selection = [faces[0]!];
    p.repondre([{ hauteur: "9", niveaux: "3" }]);
    await p.action("declarer-hauteurs", { onglet: "volumes" });
    p.etat.selection = [...faces];
    let e = await p.action("etat", { onglet: "volumes" });
    expect(e.lignes.map((l) => l.cellules)).toEqual([["Emprise 1", "80,0 m²", "attribut", "9,00 m"], ["Emprise 2", "36,0 m²", "–", "non évaluée (attribut absent)"]]);
    expect(e.resultats).toEqual([{ libelle: "Emprises", valeur: "2" }, { libelle: "Extrudables", valeur: "1" }, { libelle: "Non extrudables", valeur: "1", ton: "alerte" }]);
    await p.action("extruder", { onglet: "volumes" });
    expect(p.etat.pas.at(-1)).toBe("Extruder le contexte");
    expect(p.derniereAlerte()).toBe("");
    expect(p.etat.avis.at(-1)!.texte).toBe("1 volume posé ; 1 non extrudée.");
    const [v] = occurrences(p.etat.modele);
    expect(nomDefinition(p.etat.modele, v!.id)).toBe("Volume — 9,00 m");
    const w = monde(p.etat.modele, v!.id);
    expect(w.faces).toHaveLength(6);
    const pts = w.faces.flat();
    expect([0, 1, 2].map((k) => [Math.min(...pts.map((q) => arrondi(q[k]!))), Math.max(...pts.map((q) => arrondi(q[k]!)))])).toEqual([[0, 10], [0, 8], [0, 9]]);
    // L'emprise reste dans le dessin, intacte.
    expect(Object.keys(p.etat.modele.racine.faces)).toEqual(expect.arrayContaining([...faces]));
    p.etat.selection = [...faces];
    e = await p.action("etat", { onglet: "volumes", valeurs: { source: "niveaux", etage: "3,2" } });
    expect(e.formulaire.map((c) => c.id)).toEqual(["source", "etage"]);
    expect(e.lignes[0]!.cellules.slice(2)).toEqual(["3 niveaux", "9,60 m"]);
    e = await p.action("etat", { onglet: "volumes", valeurs: { source: "unique", hauteur: "12" } });
    expect(e.lignes.map((l) => l.cellules[3])).toEqual(["12,00 m", "12,00 m"]);
  });
});

describe("extension « Site et terrain » — retours de relecture", () => {
  it("deux ruptures qui se croisent sans point commun : la défaite est signalée, contrôlée sur la triangulation finale", async () => {
    const p = planche(modeleVide());
    p.fichierAOuvrir({ nom: "croix.txt", texte: ["0 0 0", "10 0 0", "10 10 0", "0 10 0", "# ruptures", "1;3", "2;4"].join("\n") });
    await p.action("charger-releve", { onglet: "terrain" });
    const e = await p.action("tracer-terrain", { onglet: "terrain" });
    expect(e.resultats.find((r) => r.libelle === "Lignes de rupture respectées")).toEqual({ libelle: "Lignes de rupture respectées", valeur: "1 / 2", ton: "alerte" });
  });

  it("au-delà de 200 lignes de rupture : chacune est listée, non prise en compte", async () => {
    const p = planche(modeleVide());
    const ruptures = Array.from({ length: 202 }, () => "1;2");
    p.fichierAOuvrir({ nom: "r.txt", texte: ["0 0 0", "10 0 0", "10 10 0", "# ruptures", ...ruptures].join("\n") });
    const e = await p.action("charger-releve", { onglet: "terrain" });
    expect(e.lignes.map((l) => l.cellules)).toEqual([["205", "au-delà de 200 lignes de rupture : non prise en compte"], ["206", "au-delà de 200 lignes de rupture : non prise en compte"]]);
  });

  it("une emprise avec une ouverture n'est pas extrudée ; une hauteur déclarée dans un groupe reste quand on en déclare ailleurs", async () => {
    let { modele, faces } = rectangles([[0, 0, 10, 8], [20, 0, 6, 6]]);
    modele = ajouterRectangle(modele, v3(3, 3, 0), v3(2, 0, 0), v3(0, 2, 0)).modele;
    const p = planche(modele);
    p.etat.selection = [faces[0]!];
    p.repondre([{ hauteur: "9", niveaux: "" }]);
    await p.action("declarer-hauteurs", { onglet: "volumes" });
    let e = await p.action("etat", { onglet: "volumes" });
    expect(e.lignes[0]!.cellules[3]).toBe("non extrudée (emprise avec une ouverture)");
    await p.action("extruder", { onglet: "volumes" });
    expect(p.derniereAlerte()).toMatch(/^Aucune emprise extrudable/);
    expect(occurrences(p.etat.modele)).toHaveLength(0);
    // La face 2 passe dans un groupe : sa hauteur déclarée reste quand on en déclare une à la racine.
    p.etat.selection = [faces[1]!];
    p.repondre([{ hauteur: "4", niveaux: "" }]);
    await p.action("declarer-hauteurs", { onglet: "volumes" });
    const f = creerFonctionsPlanche(p.etat.modele);
    f.api.grouper([faces[1]!], "Contexte");
    p.etat.modele = f.modele();
    p.etat.selection = [faces[0]!];
    p.repondre([{ hauteur: "12", niveaux: "" }]);
    await p.action("declarer-hauteurs", { onglet: "volumes" });
    expect(JSON.stringify(p.etat.modele)).toContain(`"${faces[1]}":{"hauteur":4`);
  });
});

describe("extension « Site et terrain » — commandes et langue", () => {
  it("Ctrl+Alt+G ouvre le panneau ; chaque commande ouvre son onglet ; textes en anglais", async () => {
    const p = planche(modeleVide());
    await p.h.appeler("demande", "commande.ouvrir-panneau", { langue: "fr" });
    expect(p.etat.ouverts).toEqual(["site"]);
    for (const [c, o] of [["terrain", "terrain"], ["courbes", "courbes"], ["unite-fonciere", "unite"], ["volumes", "volumes"], ["biotope", "biotope"]] as const) {
      await p.h.appeler("demande", `commande.${c}`, { langue: "en" });
      expect(p.etat.envois.at(-1)).toMatchObject({ onglet: o });
    }
    expect(p.etat.envois.at(-1)).toMatchObject({ colonnes: ["Surface type", "Area", "Factor", "Weighted"], vide: "No horizontal surface painted with a material in this context." });
  });
});
