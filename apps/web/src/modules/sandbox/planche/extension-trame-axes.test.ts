/**
 * Extension « Trame d'axes » (catalogue des extensions, cas 3, lot 2 : D1-F2-030 ; protocole 1.3) : le paquet livré
 * dans `apps/web/extensions/trame-axes/` passe l'import de l'administrateur, puis tourne dans le vrai exécutant, servi
 * par les vrais services de la Planche sur un vrai modèle.
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ajouterRectangle, appliquer, contexte, creerExecutantExtension, jugerImportPaquet, lireDonneesExtension, modeleVide, v3, type AccesPlanche, type AvisExtension, type ExecutantExtension, type Id, type Modele, type PaquetExtension, type ValeursSaisie } from "@parcours/sandbox-planche-model";
import { creerHoteExtension, type WorkerExtension } from "./hote-extensions";

const DOSSIER = "../../../../extensions/trame-axes/";
const lire = (chemin: string) => readFileSync(fileURLToPath(new URL(DOSSIER + chemin, import.meta.url)), "utf8");
const PAQUET = JSON.parse(lire("trame-axes.fadi-addon.json")) as PaquetExtension;

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
  const etat = { modele, selection: [] as Id[], dans: undefined as Id | undefined, pas: [] as string[], avis: [] as AvisExtension[], fichiers: [] as { nom: string; texte: string }[], decimales: 2 };
  let reponses: (ValeursSaisie | null)[] = [];
  let aOuvrir: { nom: string; texte: string } | null = null;
  const saisies: { titre: string; champs: unknown }[] = [];
  const acces: AccesPlanche = {
    modele: () => etat.modele,
    selection: () => etat.selection,
    dans: () => etat.dans,
    appliquer: (travail, nom) => {
      etat.modele = travail;
      etat.pas.push(nom);
      return true;
    },
    selectionner: (ids) => void (etat.selection = [...ids]),
    decimales: () => etat.decimales,
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
  /** Événement de l'outil « poser » ; `r` = réponses aux fenêtres de saisie qu'il ouvre. */
  const outil = async (evenement: string, donnees: Record<string, unknown> = {}, r: (ValeursSaisie | null)[] = []) => {
    reponses = [...r];
    const issue = await h.appeler("demande", `outil.poser.${evenement}`, { langue: "fr", ...donnees });
    if (issue.genre !== "fini") throw new Error(`outil ${evenement} : ${JSON.stringify(issue)}`);
    return issue.resultat as { etat?: string; saisie?: { valeur: string }; apercu?: { pointilles: unknown[]; textes: { texte: string }[] } } | null;
  };
  return { etat, saisies, commande, outil, textes: () => etat.avis.map((a) => a.texte), lire: () => void aOuvrir };
}

const REGLAGES = { x: "2x6;7,20", repX: "lettres", y: "6x5,40", repY: "chiffres", angle: 0, debord: 1.5 } as ValeursSaisie;
const occurrences = (m: Modele) => Object.values(contexte(m, undefined).occurrences);
/** Sommets d'une occurrence, en coordonnées du modèle. */
const sommetsDe = (m: Modele, o: { definition: Id; transformation: readonly number[] }) => Object.values(m.definitions[o.definition]!.contenu.sommets).map((s) => appliquer(o.transformation as never, s.position));
const souris = (point: number[], vise: number[] | null = point, nature = "libre") => ({ point, vise, nature, objet: null });

describe("extension « Trame d'axes »", () => {
  it("le paquet est celui des sources, passe l'import, a une icône et un raccourci par outil et par commande, sans mot réservé", () => {
    expect(PAQUET).toEqual(assembler());
    expect(jugerImportPaquet(PAQUET)).toMatchObject({ ok: true });
    expect(PAQUET.fiche.protocole).toBe("1.3");
    const entrees = [...PAQUET.fiche.commandes, ...PAQUET.fiche.outils];
    expect(entrees.map((e) => e.raccourci)).toEqual(["Ctrl+Alt+F", "Ctrl+Alt+A"]);
    for (const e of entrees) expect(PAQUET.pages[e.icone]).toMatch(/^<svg /);
    expect(PAQUET.code).not.toMatch(/\bimport\b/);
  });

  it("pose une trame nommée : files accrochables dans un groupe verrouillé, balise « Trame », bulles et cotes d'entraxe", async () => {
    const p = planche();
    await p.outil("activation", {}, [REGLAGES]);
    expect(p.saisies[0]!.titre).toBe("Trame d'axes");
    const vue = await p.outil("deplacement", souris([10.004, 4.996, 0]));
    // 4 files A–D et 7 files 1–7 en aperçu ; origine arrondie au pas d'accrochage du projet (0,01 m).
    expect(vue!.apercu!.pointilles).toHaveLength(11);
    expect(vue!.apercu!.textes.map((x) => x.texte)).toEqual(["A", "B", "C", "D", "1", "2", "3", "4", "5", "6", "7"]);
    expect(vue!.etat).toMatch(/^Origine 10,00 m ; 5,00 m/);
    await p.outil("clic", souris([10.004, 4.996, 0]));
    expect(p.etat.pas).toEqual(["Trame d'axes"]);
    const m = p.etat.modele;
    const [g] = occurrences(m);
    expect(g!.verrouille).toBe(true);
    // Rien que des traits : ni case ni disque, et rien n'est resté hors du groupe.
    expect(Object.keys(m.definitions[g!.definition]!.contenu.faces)).toHaveLength(0);
    expect(Object.keys(contexte(m, undefined).aretes)).toHaveLength(0);
    expect(m.annotations?.balises[g!.balise!]?.nom).toBe("Trame");
    expect(m.definitions[g!.definition]!.nom).toBe("Trame A–D / 1–7");
    const textes = Object.values(m.annotations!.textes).map((x) => (x.genre === "repere" ? x.texte : ""));
    expect(textes).toEqual(["A", "B", "C", "D", "1", "2", "3", "4", "5", "6", "7"]);
    const cotes = Object.values(m.annotations!.cotes).flatMap((c) => (c.genre === "lineaire" ? [Math.hypot(c.b.x - c.a.x, c.b.y - c.a.y)] : []));
    // 3 entraxes en X (6, 6, 7,2), 6 en Y (5,4), puis les deux totaux.
    expect(cotes.map((x) => Math.round(x * 100) / 100)).toEqual([6, 6, 7.2, 5.4, 5.4, 5.4, 5.4, 5.4, 5.4, 19.2, 32.4]);
    // La file A part de l'origine, débord compris.
    const xs = sommetsDe(m, g!).map((q) => Math.round(q.x * 1000) / 1000);
    expect(Math.min(...xs)).toBeCloseTo(10 - 1.5 - 0.8, 6);
    expect(xs).toContain(10);
    expect(xs).toContain(29.2);
    expect(p.textes()).toContain("Trame posée : 4 × 7 files, verrouillée, sur la balise « Trame ».");
  });

  it("un point accroché est pris tel quel ; une origine saisie x;y pose la trame là", async () => {
    const p = planche(ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(3.333, 0, 0), v3(0, 2, 0)).modele);
    await p.outil("activation", {}, [REGLAGES]);
    const vue = await p.outil("deplacement", souris([3.333, 0, 0], [3.3, 0.02, 0], "sommet"));
    expect(vue!.saisie!.valeur).toBe("3,33;0,00");
    await p.outil("saisie", { texte: "-2;1,5" });
    const [g] = occurrences(p.etat.modele);
    expect(sommetsDe(p.etat.modele, g!).some((q) => Math.abs(q.x + 2) < 1e-9 && Math.abs(q.y - 1.5) < 1e-9)).toBe(true);
    // Le rectangle d'origine n'est pas soudé à la trame.
    expect(Object.keys(contexte(p.etat.modele, undefined).faces)).toHaveLength(1);
  });

  it("la précision du projet règle l'affichage de l'origine", async () => {
    const p = planche();
    p.etat.decimales = 3;
    await p.outil("activation", {}, [REGLAGES]);
    const vue = await p.outil("deplacement", souris([1.2346, 0, 0], [1.2346, 0, 0], "sommet"));
    expect(vue!.saisie!.valeur).toBe("1,235;0,000");
  });

  it("des entraxes illisibles ou des repères identiques sont redemandés, jamais devinés", async () => {
    const p = planche();
    await p.outil("activation", {}, [{ ...REGLAGES, x: "6;abc" }, { ...REGLAGES, repY: "lettres" }, null]);
    expect(p.saisies).toHaveLength(3);
    expect(p.textes()[0]).toMatch(/^Entraxe illisible : « abc »/);
    expect(p.textes()[1]).toMatch(/repères différents/);
    // Fenêtre annulée : rien n'est posé.
    expect(occurrences(p.etat.modele)).toHaveLength(0);
  });

  it("modifier un entraxe repose la trame entière en un pas, au même endroit, et retire les anciennes bulles et cotes", async () => {
    const p = planche();
    await p.outil("activation", {}, [REGLAGES]);
    await p.outil("clic", souris([0, 0, 0]));
    const [g] = occurrences(p.etat.modele);
    expect(lireDonneesExtension(p.etat.modele, "trame-axes", { genre: "objet", id: g!.id })).toMatchObject({ ok: true, valeur: { trame: { x: "2x6;7.2", origine: [0, 0, 0] } } });
    p.etat.selection = [g!.id];
    expect(await p.commande("modifier", { ...REGLAGES, x: "3x6" })).toBe(true);
    expect(p.etat.pas).toEqual(["Trame d'axes", "Modifier la trame"]);
    const m = p.etat.modele;
    expect(occurrences(m)).toHaveLength(1);
    const cotes = Object.values(m.annotations!.cotes).flatMap((c) => (c.genre === "lineaire" ? [Math.round(Math.hypot(c.b.x - c.a.x, c.b.y - c.a.y) * 100) / 100] : []));
    expect(cotes).toEqual([6, 6, 6, 5.4, 5.4, 5.4, 5.4, 5.4, 5.4, 18, 32.4]);
    expect(Object.keys(m.annotations!.textes)).toHaveLength(11);
    expect(occurrences(m)[0]!.verrouille).toBe(true);
    // Sans trame sélectionnée : refus expliqué.
    p.etat.selection = [];
    expect(await p.commande("modifier", null)).toBe(false);
    expect(p.textes().at(-1)).toBe("Sélectionnez une seule trame posée par « Trame d'axes ».");
  });
});
