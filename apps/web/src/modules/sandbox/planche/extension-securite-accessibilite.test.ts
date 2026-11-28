/**
 * Extension « Sécurité et accessibilité » (catalogue des extensions, cas 3, lot 5 ; protocole 1.7) : le paquet livré
 * passe l'import de l'administrateur, puis tourne dans le vrai exécutant, servi par les vrais services de la Planche.
 * Balises et valeurs exigées sont des données d'essai, pas des valeurs réglementaires.
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ANNOTATIONS_VIDES, REGISTRE_SANDBOX, baliserOccurrences, creerExecutantExtension, creerFonctionsPlanche, jugerImportPaquet, modeleVide, normaliserRaccourci, type AccesPlanche, type AvisExtension, type ExecutantExtension, type Id, type Modele, type PaquetExtension } from "@parcours/sandbox-planche-model";
import { creerHoteExtension, type WorkerExtension } from "./hote-extensions";

const DOSSIER = "../../../../extensions/securite-accessibilite/";
const lire = (chemin: string) => readFileSync(fileURLToPath(new URL(DOSSIER + chemin, import.meta.url)), "utf8");
const PAQUET = JSON.parse(lire("securite-accessibilite.fadi-addon.json")) as PaquetExtension;

function assembler(): PaquetExtension {
  const pages: Record<string, string> = {};
  for (const nom of readdirSync(fileURLToPath(new URL(DOSSIER + "pages/", import.meta.url))).sort()) pages[nom] = lire(`pages/${nom}`);
  return { format: "fadi-addon/1", fiche: JSON.parse(lire("fiche.json")), code: lire("code.js"), pages } as PaquetExtension;
}

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

type Etat = { onglet: string; lignes: { cellules: string[]; ton?: string; id?: string }[]; resultats: { libelle: string; valeur: string; ton?: string }[]; vide: string | null };

function planche(modele: Modele, selection: Id[] = []) {
  const etat = { modele, selection, pas: [] as string[], avis: [] as AvisExtension[], envois: [] as unknown[] };
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
    separateur: () => ",",
  };
  const h = creerHoteExtension(PAQUET, {
    creer: creerFaux,
    acces,
    surAvis: (a) => void etat.avis.push(a),
    panneau: { envoyer: (_p, d) => (etat.envois.push(d), true), ouvrir: () => true },
  });
  const commande = async (id: string) => {
    const issue = await h.appeler("demande", `commande.${id}`, { langue: "fr" });
    if (issue.genre !== "fini") throw new Error(`commande ${id} : ${JSON.stringify(issue)}`);
    return etat.envois.at(-1) as Etat;
  };
  const action = async (nom: string, donnees: Record<string, unknown> = {}) => {
    const issue = await h.appeler("demande", `panneau.securite.${nom}`, { langue: "fr", ...donnees });
    if (issue.genre !== "fini") throw new Error(`action ${nom} : ${JSON.stringify(issue)}`);
    return issue.resultat as Etat;
  };
  return { etat, commande, action, textes: () => etat.avis.map((a) => a.texte) };
}
const valeur = (e: Etat, libelle: RegExp) => e.resultats.find((r) => libelle.test(r.libelle))?.valeur;

/** Modèle d'essai : objets en boîtes groupées et nommées, chacun avec sa balise ; niveaux d'étage facultatifs. */
function modele(boites: { nom: string; balise: string; coin: [number, number, number]; l: number; p: number; h: number; avec?: [number, number, number, number, number, number] }[], niveaux: { id: string; nom: string; altitude: number }[] = []): Modele {
  const f = creerFonctionsPlanche(modeleVide());
  const ids = boites.map((b) => f.api.grouper([...(f.api.boite(b.coin, b.l, b.p, b.h) as Id[]), ...(b.avec ? (f.api.boite([b.avec[0], b.avec[1], b.avec[2]], b.avec[3], b.avec[4], b.avec[5]) as Id[]) : [])], b.nom) as Id);
  let m = f.modele();
  const an = m.annotations ?? ANNOTATIONS_VIDES;
  const balises: Record<string, { id: string; nom: string; couleur: string; visible: boolean }> = {};
  for (const b of new Set(boites.map((x) => x.balise))) balises[`b-${b}`] = { id: `b-${b}`, nom: b, couleur: "#888888", visible: true };
  m = { ...m, annotations: { ...an, balises: { ...an.balises, ...balises }, niveaux: Object.fromEntries(niveaux.map((n) => [n.id, { ...n, hauteur: 3 }])) } as never };
  boites.forEach((b, i) => { m = baliserOccurrences(m, [ids[i]!], `b-${b.balise}`).modele; });
  return m;
}

describe("extension « Sécurité et accessibilité » — paquet", () => {
  it("le paquet livré est celui du dossier source et passe l'import de l'administrateur ; protocole 1.7", () => {
    expect(PAQUET).toEqual(assembler());
    expect(jugerImportPaquet(PAQUET).ok).toBe(true);
    expect(PAQUET.fiche.protocole).toBe("1.7");
  });
  it("règle d'or : chaque commande a son icône et un raccourci que la Planche ne prend pas ; un panneau", () => {
    const pris = new Set(REGISTRE_SANDBOX.flatMap((e) => (e.raccourci ? [normaliserRaccourci(e.raccourci)] : [])));
    expect(PAQUET.fiche.commandes.map((c) => c.id)).toEqual(["ouvrir-panneau", "garde-corps", "accessibilite", "stationnement"]);
    for (const c of PAQUET.fiche.commandes) {
      expect(PAQUET.pages[c.icone!]).toMatch(/^<svg/);
      expect(pris.has(normaliserRaccourci(c.raccourci!)), c.id).toBe(false);
    }
    expect(PAQUET.fiche.panneaux.map((p) => p.id)).toEqual(["securite"]);
  });
  it("aucune valeur exigée dans le code ; « SketchUp » n'y figure pas", () => {
    expect(JSON.stringify(PAQUET)).not.toMatch(/sketchup/i);
    expect(PAQUET.code).not.toMatch(/\b(1[.,]50|0[.,]90|1[.,]00|1[.,]20|0[.,]45|2[.,]50|3[.,]30|5[.,]00)\b/);
  });
});

const SALLE = [
  { nom: "Dalle", balise: "Dalle", coin: [0, 0, 0] as [number, number, number], l: 6, p: 4, h: 0.2 },
  { nom: "Garde-corps 1", balise: "Garde-corps", coin: [0, 0, 0.2] as [number, number, number], l: 6, p: 0.1, h: 1 },
  // Garde-corps 2 : muret de 40 cm (prise) et poteau jusqu'à 1,30 m.
  { nom: "Garde-corps 2", balise: "Garde-corps", coin: [0, 3.7, 0.2] as [number, number, number], l: 2, p: 0.3, h: 0.4, avec: [4, 3.9, 0.2, 0.1, 0.1, 1.1] as [number, number, number, number, number, number] },
];

describe("extension « Sécurité et accessibilité » — contrôles", () => {
  it("garde-corps : hauteur depuis le sol touché dessous, prise dans la zone saisie ; non évalué sans source", async () => {
    const p = planche(modele(SALLE));
    const vide = await p.commande("garde-corps");
    expect(vide.vide).toMatch(/Nommez/);
    const sans = await p.action("etat", { valeurs: { gardes: "Garde-corps" } });
    expect(sans.lignes.map((l) => l.cellules)).toEqual([["Garde-corps 1", "1,00 m", "non évalué", "non évalué"], ["Garde-corps 2", "1,10 m", "non évalué", "non évalué"]]);
    const avec = await p.action("etat", { valeurs: { gardes: "Garde-corps", hauteurGarde: "1", zoneEscalade: "0,45", sourceGarde: "Valeurs d'essai" } });
    expect(avec.lignes.map((l) => l.cellules.slice(1))).toEqual([["1,00 m", "aucune", "conforme"], ["1,10 m", "à 0,40 m", "insuffisant"]]);
  });
  it("rives : bords libres d'une dalle, protégés par un objet à la distance saisie ; une trémie compte à part", async () => {
    const p = planche(modele(SALLE));
    await p.commande("garde-corps");
    const e = await p.action("etat", { onglet: "rives", valeurs: { dalles: "Dalle", protections: "Garde-corps", distance: "0,2" } });
    expect(e.lignes).toHaveLength(4);
    expect(e.lignes.filter((l) => l.cellules[3] === "aucune")).toHaveLength(2);
    expect(valeur(e, /sans protection/)).toBe("2");
    const sans = await p.action("etat", { valeurs: { dalles: "Dalle", protections: "", distance: "" } });
    expect(valeur(sans, /sans protection/)).toBe("non évalué");
  });
  it("circulations : passage le plus étroit comparé à la largeur saisie avec sa source", async () => {
    const p = planche(modele([{ nom: "Couloir", balise: "Circulation", coin: [0, 0, 0], l: 10, p: 1.2, h: 0.1 }]));
    await p.commande("accessibilite");
    const e = await p.action("etat", { valeurs: { circulations: "Circulation", largeur: "1,4", sourceCirculation: "Essai" } });
    expect(e.lignes.map((l) => l.cellules)).toEqual([["Couloir", "1,20 m", "1,40 m", "insuffisant"]]);
  });
  it("sanitaire : plus grand cercle libre hors appareils, comparé au diamètre saisi", async () => {
    const p = planche(modele([
      { nom: "WC", balise: "Sanitaire", coin: [0, 0, 0], l: 2, p: 2, h: 0.1 },
      { nom: "Cuvette", balise: "Appareil", coin: [0, 0, 0.1], l: 0.4, p: 0.7, h: 0.4 },
    ]));
    await p.commande("accessibilite");
    const e = await p.action("etat", { onglet: "sanitaire", valeurs: { sanitaires: "Sanitaire", appareils: "Appareil", diametre: "1,5", sourceSanitaire: "Essai" } });
    expect(e.lignes[0]!.cellules[1]).toMatch(/^Ø 1,[67]\d m$/);
    expect(e.lignes[0]!.cellules[3]).toBe("conforme");
  });
  it("stationnement : dimensions par place, places adaptées comptées contre le nombre saisi", async () => {
    const p = planche(modele([
      { nom: "P1", balise: "Place", coin: [0, 0, 0], l: 2.5, p: 5, h: 0.05 },
      { nom: "P2", balise: "Place", coin: [3, 0, 0], l: 2.3, p: 4.5, h: 0.05 },
      { nom: "P3", balise: "Place PMR", coin: [6, 0, 0], l: 3.3, p: 5, h: 0.05 },
    ]));
    await p.commande("stationnement");
    const e = await p.action("etat", { valeurs: { places: "Place", placesPmr: "Place PMR", longueurPlace: "5", largeurPlace: "2,5", largeurPmr: "3,3", nombrePmr: "2", sourcePlace: "Essai" } });
    expect(e.lignes.map((l) => l.cellules)).toEqual([["P1", "5,00 m", "2,50 m", "conforme"], ["P2", "4,50 m", "2,30 m", "insuffisant"], ["P3 (adaptée)", "5,00 m", "3,30 m", "conforme"]]);
    expect(valeur(e, /adaptées/)).toBe("1 / 2");
  });
});
