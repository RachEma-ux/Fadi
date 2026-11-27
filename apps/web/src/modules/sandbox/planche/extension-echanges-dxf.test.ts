/**
 * Extension « Échanges DXF » (catalogue des extensions, cas 3, lot 1 ; maquettes validées le 27 novembre 2026) : le
 * paquet livré dans `apps/web/extensions/echanges-dxf/` passe l'import de l'administrateur, puis tourne dans le vrai
 * exécutant, servi par les vrais services de la Planche sur un vrai modèle (protocole 1.1).
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ajouterSegment, appliquer, composer, contexte, creerExecutantExtension, jugerImportPaquet, modeleVide, v3, type AccesPlanche, type AvisExtension, type ExecutantExtension, type Id, type Matrice4, type Modele, type PaquetExtension, type ValeursSaisie } from "@parcours/sandbox-planche-model";
import { creerHoteExtension, type WorkerExtension } from "./hote-extensions";

const DOSSIER = "../../../../extensions/echanges-dxf/";
const lire = (chemin: string) => readFileSync(fileURLToPath(new URL(DOSSIER + chemin, import.meta.url)), "utf8");
const PAQUET = JSON.parse(lire("echanges-dxf.fadi-addon.json")) as PaquetExtension;

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

function planche(modele: Modele = modeleVide()) {
  const etat = { modele, selection: [] as Id[], pas: [] as string[], avis: [] as AvisExtension[], fichiers: [] as { nom: string; texte: string }[] };
  let reponses: (ValeursSaisie | null)[] = [];
  let aOuvrir: { nom: string; texte: string } | null = null;
  const saisies: { titre: string; champs: unknown }[] = [];
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
      saisies.push({ titre: d.titre, champs: d.champs });
      return { reponse: Promise.resolve(reponses.shift() ?? null), fermer: () => {} };
    },
    fichiers: {
      ouvrir: () => ({ reponse: Promise.resolve(aOuvrir), fermer: () => {} }),
      enregistrer: (d) => {
        etat.fichiers.push({ nom: d.nom, texte: d.texte });
        return { reponse: Promise.resolve(true), fermer: () => {} };
      },
    },
  });
  const commande = async (id: string, r: ValeursSaisie | null, langue = "fr") => {
    reponses = [r];
    const issue = await h.appeler("demande", `commande.${id}`, { langue });
    if (issue.genre !== "fini") throw new Error(`commande ${id} : ${JSON.stringify(issue)}`);
    return issue.resultat;
  };
  return {
    etat,
    saisies,
    commande,
    fichier: (texte: string, nom = "plan.dxf") => void (aOuvrir = { nom, texte }),
    textes: () => etat.avis.map((a) => a.texte),
  };
}

/** DXF texte minimal à partir de paires (code, valeur). */
const dxf = (...sections: (string | number)[][]) => [...sections.flat(), 0, "EOF"].join("\n") + "\n";
const entete = (unite: number) => [0, "SECTION", 2, "HEADER", 9, "$INSUNITS", 70, unite, 0, "ENDSEC"];
const entites = (...e: (string | number)[][]) => [0, "SECTION", 2, "ENTITIES", ...e.flat(), 0, "ENDSEC"];
const ligne = (calque: string, a: [number, number], b: [number, number]) => [0, "LINE", 8, calque, 10, a[0], 20, a[1], 11, b[0], 21, b[1]];
const rect = (calque: string, x0: number, y0: number, x1: number, y1: number) => [0, "LWPOLYLINE", 8, calque, 90, 4, 70, 1, 10, x0, 20, y0, 10, x1, 20, y0, 10, x1, 20, y1, 10, x0, 20, y1];
const IMPORT6 = { unite: "6", espace: "objet", pose: "sol", balises: true, blocs: true } as ValeursSaisie;
const IMPORT = { unite: "4", espace: "objet", pose: "sol", balises: true, blocs: true } as ValeursSaisie;

const occurrences = (m: Modele) => Object.values(contexte(m, undefined).occurrences);
const balises = (m: Modele) => Object.values(m.annotations?.balises ?? {}).map((b) => b.nom).sort();
/** Sommets du modèle entier, en coordonnées du modèle (transformations des occurrences composées). */
const sommets = (m: Modele): number[][] => {
  const r: number[][] = [];
  const parcourir = (c: ReturnType<typeof contexte>, M: Matrice4 | null) => {
    for (const s of Object.values(c.sommets)) {
      const q = M ? appliquer(M, s.position) : s.position;
      r.push([q.x, q.y, q.z]);
    }
    for (const o of Object.values(c.occurrences)) {
      const d = m.definitions[o.definition];
      if (d) parcourir(d.contenu, M ? composer(M, o.transformation) : o.transformation);
    }
  };
  parcourir(m.racine, null);
  return r;
};

describe("extension « Échanges DXF » — paquet", () => {
  it("le paquet versionné est exactement l'assemblage de ses sources", () => {
    expect(PAQUET).toEqual(assembler());
  });

  it("passe l'import de l'administrateur en protocole 1.1 : une icône et un raccourci par commande (règle d'or)", () => {
    expect(jugerImportPaquet(PAQUET)).toMatchObject({ ok: true });
    expect(PAQUET.fiche.protocole).toBe("1.1");
    const icones = PAQUET.fiche.commandes.map((c) => c.icone);
    expect(icones.every((i) => typeof i === "string" && PAQUET.pages[i!]?.startsWith("<svg"))).toBe(true);
    expect(new Set(icones).size).toBe(icones.length);
    expect(PAQUET.fiche.commandes.map((c) => [c.id, c.raccourci])).toEqual([
      ["importer", "Ctrl+Alt+Maj+I"],
      ["exporter", "Ctrl+Alt+Maj+X"],
      ["figure-fond", "Ctrl+Alt+Maj+M"],
    ]);
  });

  it("aucun nom de produit tiers dans le paquet", () => {
    expect(JSON.stringify(PAQUET)).not.toMatch(/sketchup|autocad|autodesk/i);
  });
});

describe("extension « Échanges DXF » — importer", () => {
  it("reprend lignes et polylignes à l'échelle de l'unité lue, un groupe balisé par calque, en un seul pas", async () => {
    const p = planche();
    p.fichier(dxf(entete(4), entites(rect("MURS", 0, 0, 12000, 9000), ligne("CLOISONS", [5000, 0], [5000, 9000]), [0, "TEXT", 8, "TEXTES", 10, 0, 20, 0, 1, "Séjour"])));
    await p.commande("importer", IMPORT);
    // L'unité lue est proposée et désignée comme telle.
    const champs = p.saisies[0]!.champs as { id: string; valeur: unknown; choix?: { libelle: string }[]; libelle: string }[];
    expect(champs.find((c) => c.id === "unite")).toMatchObject({ valeur: "4" });
    expect(champs.find((c) => c.id === "unite")!.choix![0]!.libelle).toBe("Millimètres (lue dans le fichier)");
    expect(champs.find((c) => c.id === "balises")!.libelle).toBe("Calques en balises (2)");
    expect(p.etat.pas).toEqual(["Importer plan.dxf"]);
    expect(balises(p.etat.modele)).toEqual(["CLOISONS", "MURS"]);
    expect(occurrences(p.etat.modele)).toHaveLength(2);
    const xs = sommets(p.etat.modele).map((s) => s[0]!);
    expect(Math.max(...xs)).toBeCloseTo(12, 9);
    expect(p.textes()).toContain("Plan repris : 2 traits, 0 arcs et cercles, 0 blocs, 2 calques en balises.");
    // Rien n'est perdu en silence.
    expect(p.textes()).toContain("Non repris : 1 TEXT (textes, hachures et cotes : à venir).");
  });

  it("une unité absente du fichier est dite « non indiquée » et choisie par l'utilisateur", async () => {
    const p = planche();
    p.fichier(dxf(entites(ligne("0", [0, 0], [3, 0]))));
    await p.commande("importer", { ...IMPORT, unite: "6" });
    const champ = (p.saisies[0]!.champs as { id: string; libelle: string }[]).find((c) => c.id === "unite")!;
    expect(champ.libelle).toMatch(/non indiquée dans le fichier/);
    expect(Math.max(...sommets(p.etat.modele).map((s) => s[0]!))).toBeCloseTo(3, 9);
  });

  it("arcs, cercles et polylignes bombées deviennent de vraies courbes", async () => {
    const p = planche();
    const bombee = [0, "LWPOLYLINE", 8, "A", 90, 2, 70, 0, 10, 0, 20, 0, 42, 1, 10, 2, 20, 0];
    p.fichier(dxf(entete(6), entites([0, "CIRCLE", 8, "A", 10, 10, 20, 0, 40, 1], [0, "ARC", 8, "A", 10, 20, 20, 0, 40, 2, 50, 0, 51, 90], bombee)));
    await p.commande("importer", IMPORT6);
    const d = p.etat.modele.definitions[occurrences(p.etat.modele)[0]!.definition]!;
    const genres = Object.values(d.contenu.courbes).map((c) => c.genre).sort();
    expect(genres).toEqual(["arc", "arc", "cercle"]);
    // La bombe positive tourne dans le sens trigonométrique : le demi-cercle de (0,0) à (2,0) passe par (1,-1).
    const ys = Object.values(d.contenu.sommets).filter((s) => s.position.x < 3).map((s) => s.position.y);
    expect(Math.min(...ys)).toBeCloseTo(-1, 6);
    expect(p.textes()[0]).toMatch(/3 arcs et cercles/);
  });

  it("blocs en composants : une définition, une occurrence par insertion, tournée ; une échelle ≠ 1 est posée éclatée et signalée", async () => {
    const p = planche();
    const blocs = [0, "SECTION", 2, "BLOCKS", 0, "BLOCK", 8, "0", 2, "FENETRE", 10, 0, 20, 0, 0, "LINE", 8, "0", 10, 0, 20, 0, 11, 1000, 21, 0, 0, "ENDBLK", 0, "ENDSEC"];
    const ins = (x: number, rot: number, ech = 1) => [0, "INSERT", 8, "FENETRES", 2, "FENETRE", 10, x, 20, 0, 41, ech, 42, ech, 50, rot];
    p.fichier(dxf(entete(4), blocs, entites(ins(0, 0), ins(5000, 90), ins(9000, 0, 2))));
    await p.commande("importer", IMPORT);
    const m = p.etat.modele;
    const composants = Object.values(m.definitions).filter((d) => d.nom === "FENETRE");
    expect(composants).toHaveLength(1);
    const groupe = occurrences(m)[0]!;
    const dedans = Object.values(m.definitions[groupe.definition]!.contenu.occurrences).filter((o) => o.definition === composants[0]!.id);
    expect(dedans).toHaveLength(2);
    expect(p.textes()).toContain("1 bloc(s) inséré(s) à une échelle autre que 1 : posé(s) éclaté(s).");
    expect(p.textes().filter((x) => x.startsWith("Non repris"))).toEqual([]);
    // La copie tournée de 90° s'élève de 1 m le long de Y à partir de (5 ; 0).
    const ys = sommets(m).filter((s) => Math.abs(s[0]! - 5) < 1e-6).map((s) => s[1]!);
    expect(Math.max(...ys)).toBeCloseTo(1, 6);
    // L'insertion à l'échelle 2 est dessinée éclatée : 2 m de long à partir de 9 m.
    expect(Math.max(...sommets(m).map((s) => s[0]!))).toBeCloseTo(11, 6);
  });

  it("présentation : seules les entités de son espace papier sont reprises", async () => {
    const p = planche();
    const tables = [0, "SECTION", 2, "TABLES", 0, "TABLE", 2, "BLOCK_RECORD", 0, "BLOCK_RECORD", 5, "1F", 2, "*Paper_Space0", 0, "ENDTAB", 0, "ENDSEC"];
    const blocs = [0, "SECTION", 2, "BLOCKS", 0, "BLOCK", 8, "0", 2, "*Paper_Space0", 330, "1F", 10, 0, 20, 0, 0, "LINE", 8, "CARTOUCHE", 10, 0, 20, 0, 11, 420, 21, 0, 0, "ENDBLK", 0, "ENDSEC"];
    const objets = [0, "SECTION", 2, "OBJECTS", 0, "LAYOUT", 1, "A3 - Détails", 330, "1F", 0, "ENDSEC"];
    p.fichier(dxf(entete(4), tables, blocs, entites(ligne("MURS", [0, 0], [12000, 0])), objets));
    await p.commande("importer", { ...IMPORT, espace: "A3 - Détails" });
    const espace = (p.saisies[0]!.champs as { id: string; choix: { libelle: string }[] }[]).find((c) => c.id === "espace")!;
    expect(espace.choix.map((c) => c.libelle)).toEqual(["Espace objet (le dessin)", "Présentation « A3 - Détails »"]);
    expect(balises(p.etat.modele)).toEqual(["CARTOUCHE"]);
    expect(Math.max(...sommets(p.etat.modele).map((s) => s[0]!))).toBeCloseTo(0.42, 9);
  });

  it("pose debout sur l'arête sélectionnée : X le long de l'arête, Y vertical ; sans arête, refus expliqué", async () => {
    const depart = ajouterSegment(modeleVide(), v3(0, 0, 0), v3(0, 10, 0));
    const arete = Object.keys(depart.modele.racine.aretes)[0]!;
    const p = planche(depart.modele);
    p.fichier(dxf(entete(6), entites(rect("FACADE", 0, 0, 4, 3))));
    expect(await p.commande("importer", { ...IMPORT6, pose: "vertical" })).toBeNull();
    expect(p.textes().at(-1)).toMatch(/sélectionnez une seule arête/);
    p.etat.selection = [arete];
    await p.commande("importer", { ...IMPORT6, pose: "vertical" });
    const s = sommets(p.etat.modele);
    expect(Math.max(...s.map((q) => q[2]!))).toBeCloseTo(3, 9);
    expect(Math.max(...s.map((q) => q[1]!))).toBeCloseTo(10, 9);
    expect(Math.max(...s.map((q) => Math.abs(q[0]!)))).toBeCloseTo(0, 9);
  });

  it("annuler la saisie ne touche pas au modèle", async () => {
    const p = planche();
    p.fichier(dxf(entete(4), entites(ligne("0", [0, 0], [1, 0]))));
    expect(await p.commande("importer", null)).toBeNull();
    expect(p.etat.pas).toEqual([]);
  });
});

describe("extension « Échanges DXF » — exporter et plan masse", () => {
  /** Importe puis rend la Planche, pour exporter un modèle connu. */
  async function importe(...e: (string | number)[][]) {
    const p = planche();
    p.fichier(dxf(entete(6), entites(...e)));
    await p.commande("importer", IMPORT6);
    return p;
  }
  const paires = (texte: string) => {
    const l = texte.trim().split("\n");
    const r: [number, string][] = [];
    for (let i = 0; i + 1 < l.length; i += 2) r.push([Number(l[i]), l[i + 1]!]);
    return r;
  };
  const types = (texte: string) => paires(texte).filter(([c, v]) => c === 0 && ["LINE", "ARC", "CIRCLE"].includes(v)).map(([, v]) => v);

  it("écrit un DXF relisible : unité déclarée, un calque par balise, vrais arcs et cercles", async () => {
    const p = await importe(rect("MURS", 0, 0, 4, 3), [0, "CIRCLE", 8, "POTEAUX", 10, 2, 20, 1, 40, 0.2], [0, "ARC", 8, "PORTES", 10, 0, 20, 0, 40, 0.9, 50, 0, 51, 90]);
    await p.commande("exporter", { contenu: "modele", unite: "4", calques: true, arcs: true, nom: "plan.dxf" });
    const f = p.etat.fichiers.at(-1)!;
    expect(f.nom).toBe("plan.dxf");
    const v = paires(f.texte);
    expect(v.findIndex(([c, x]) => c === 9 && x === "$INSUNITS")).toBeGreaterThan(-1);
    expect(v[v.findIndex(([c, x]) => c === 9 && x === "$INSUNITS") + 1]).toEqual([70, "4"]);
    const calques = v.filter(([c], i) => c === 2 && v[i - 1]?.[1] === "LAYER").map(([, x]) => x);
    expect(calques.sort()).toEqual(["0", "MURS", "PORTES", "POTEAUX"]);
    expect(types(f.texte).sort()).toEqual(["ARC", "CIRCLE", "LINE", "LINE", "LINE", "LINE"]);
    // Millimètres : le cercle garde son rayon de 0,2 m = 200 mm, l'arc va de 0° à 90°.
    const i = v.findIndex(([c, x]) => c === 0 && x === "CIRCLE");
    expect(Number(v.slice(i).find(([c]) => c === 40)![1])).toBeCloseTo(200, 6);
    const a = v.findIndex(([c, x]) => c === 0 && x === "ARC");
    const bout = v.slice(a);
    expect(Number(bout.find(([c]) => c === 50)![1])).toBeCloseTo(0, 6);
    expect(Number(bout.find(([c]) => c === 51)![1])).toBeCloseTo(90, 6);
    expect(p.textes().at(-1)).toBe("DXF écrit : 4 traits, 2 arcs et cercles, 4 calques.");
    // Relu par la commande d'import : même plan, même échelle.
    const q = planche();
    q.fichier(f.texte);
    await q.commande("importer", IMPORT);
    expect(q.textes()[0]).toBe("Plan repris : 4 traits, 2 arcs et cercles, 0 blocs, 3 calques en balises.");
    expect(Math.max(...sommets(q.etat.modele).map((s) => s[0]!))).toBeCloseTo(4, 6);
  });

  it("sans vrais arcs, les courbes sont écrites en segments ; sans balises, tout va au calque 0", async () => {
    const p = await importe([0, "CIRCLE", 8, "POTEAUX", 10, 0, 20, 0, 40, 1]);
    await p.commande("exporter", { contenu: "modele", unite: "6", calques: false, arcs: false, nom: "brut" });
    const f = p.etat.fichiers.at(-1)!;
    expect(f.nom).toBe("brut.dxf");
    expect(types(f.texte).every((x) => x === "LINE")).toBe(true);
    expect(types(f.texte).length).toBeGreaterThan(8);
    expect(f.texte).not.toMatch(/\n8\nPOTEAUX\n/);
  });

  it("figure-fond SVG : bâti en noir plein, voirie en trait, parcelles en trait fin", async () => {
    const p = await importe(rect("MURS", 0, 0, 12, 9), rect("PARCELLES", -6, -6, 18, 16), ligne("VOIRIE", [-10, -8], [44, -8]));
    const id = (nom: string) => Object.values(p.etat.modele.annotations!.balises).find((b) => b.nom === nom)!.id;
    await p.commande("figure-fond", { bati: id("MURS"), voirie: id("VOIRIE"), parcelles: id("PARCELLES"), format: "svg" });
    const f = p.etat.fichiers.at(-1)!;
    expect(f.nom).toBe("plan-masse.svg");
    expect(f.texte.match(/<polygon fill="#000"/g)).toHaveLength(1);
    expect(f.texte.match(/stroke-width="0.6"/g)).toHaveLength(1);
    expect(f.texte.match(/stroke-width="0.15"/g)).toHaveLength(4);
    expect(f.texte).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="0 0 /);
  });

  it("figure-fond DXF : un bâti en L (concave) est rempli exactement, sans déborder", async () => {
    const enL = [0, "LWPOLYLINE", 8, "MURS", 90, 6, 70, 1, 10, 0, 20, 0, 10, 10, 20, 0, 10, 10, 20, 4, 10, 4, 20, 4, 10, 4, 20, 10, 10, 0, 20, 10];
    const p = await importe(enL);
    const id = Object.values(p.etat.modele.annotations!.balises).find((b) => b.nom === "MURS")!.id;
    await p.commande("figure-fond", { bati: id, voirie: "-", parcelles: "-", format: "dxf" });
    const v = paires(p.etat.fichiers.at(-1)!.texte);
    let aire = 0;
    v.forEach(([c, x], i) => {
      if (c !== 0 || x !== "SOLID") return;
      const n = (code: number) => Number(v.slice(i).find(([k]) => k === code)![1]);
      aire += Math.abs((n(11) - n(10)) * (n(22) - n(20)) - (n(12) - n(10)) * (n(21) - n(20))) / 2;
    });
    expect(aire).toBeCloseTo(10 * 4 + 4 * 6, 6);
  });

  it("figure-fond DXF : calques BATI, VOIRIE, PARCELLES ; rien sous les balises choisies → alerte, aucun fichier", async () => {
    const p = await importe(rect("MURS", 0, 0, 12, 9), ligne("VOIRIE", [-10, -8], [44, -8]));
    const id = (nom: string) => Object.values(p.etat.modele.annotations!.balises).find((b) => b.nom === nom)!.id;
    await p.commande("figure-fond", { bati: id("MURS"), voirie: id("VOIRIE"), parcelles: "-", format: "dxf" });
    const f = p.etat.fichiers.at(-1)!;
    expect(f.nom).toBe("plan-masse.dxf");
    // Le rectangle bâti est rempli de deux triangles.
    expect(f.texte.match(/\n0\nSOLID\n8\nBATI\n/g)).toHaveLength(2);
    expect(f.texte).toMatch(/\n0\nLINE\n8\nVOIRIE\n/);
    const n = p.etat.fichiers.length;
    expect(await p.commande("figure-fond", { bati: id("VOIRIE"), voirie: "-", parcelles: "-", format: "svg" })).toBeNull();
    expect(p.etat.fichiers).toHaveLength(n);
    expect(p.textes().at(-1)).toMatch(/Rien à dessiner/);
  });
});
