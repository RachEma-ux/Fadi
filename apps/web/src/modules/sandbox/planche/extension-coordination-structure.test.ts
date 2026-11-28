/**
 * Extension « Coordination et structure » (catalogue des extensions, cas 3, lot 5 ; protocole 1.7) : le paquet livré
 * passe l'import de l'administrateur, puis tourne dans le vrai exécutant, servi par les vrais services de la Planche.
 * Balises, niveaux et seuils sont des données d'essai, pas des valeurs réglementaires.
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ANNOTATIONS_VIDES, REGISTRE_SANDBOX, baliserOccurrences, creerExecutantExtension, creerFonctionsPlanche, jugerImportPaquet, modeleVide, normaliserRaccourci, type AccesPlanche, type AvisExtension, type ExecutantExtension, type Id, type Modele, type PaquetExtension } from "@parcours/sandbox-planche-model";
import { creerHoteExtension, type WorkerExtension } from "./hote-extensions";

const DOSSIER = "../../../../extensions/coordination-structure/";
const lire = (chemin: string) => readFileSync(fileURLToPath(new URL(DOSSIER + chemin, import.meta.url)), "utf8");
const PAQUET = JSON.parse(lire("coordination-structure.fadi-addon.json")) as PaquetExtension;

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
    const issue = await h.appeler("demande", `panneau.coordination.${nom}`, { langue: "fr", ...donnees });
    if (issue.genre !== "fini") throw new Error(`action ${nom} : ${JSON.stringify(issue)}`);
    return issue.resultat as Etat;
  };
  return { etat, commande, action, textes: () => etat.avis.map((a) => a.texte) };
}
const valeur = (e: Etat, libelle: RegExp) => e.resultats.find((r) => libelle.test(r.libelle))?.valeur;

/** Modèle d'essai : objets en boîtes groupées et nommées, chacun avec sa balise ; niveaux d'étage facultatifs. */
function modele(boites: { nom: string; balise: string; coin: [number, number, number]; l: number; p: number; h: number }[], niveaux: { id: string; nom: string; altitude: number }[] = []): Modele {
  const f = creerFonctionsPlanche(modeleVide());
  const ids = boites.map((b) => f.api.grouper(f.api.boite(b.coin, b.l, b.p, b.h), b.nom) as Id);
  let m = f.modele();
  const an = m.annotations ?? ANNOTATIONS_VIDES;
  const balises: Record<string, { id: string; nom: string; couleur: string; visible: boolean }> = {};
  for (const b of new Set(boites.map((x) => x.balise))) balises[`b-${b}`] = { id: `b-${b}`, nom: b, couleur: "#888888", visible: true };
  m = { ...m, annotations: { ...an, balises: { ...an.balises, ...balises }, niveaux: Object.fromEntries(niveaux.map((n) => [n.id, { ...n, hauteur: 3 }])) } as never };
  boites.forEach((b, i) => { m = baliserOccurrences(m, [ids[i]!], `b-${b.balise}`).modele; });
  return m;
}

describe("extension « Coordination et structure » — paquet", () => {
  it("le paquet livré est celui du dossier source et passe l'import de l'administrateur ; protocole 1.7", () => {
    expect(PAQUET).toEqual(assembler());
    expect(jugerImportPaquet(PAQUET).ok).toBe(true);
    expect(PAQUET.fiche.protocole).toBe("1.7");
  });
  it("règle d'or : chaque commande a son icône et un raccourci que la Planche ne prend pas ; un panneau", () => {
    const pris = new Set(REGISTRE_SANDBOX.flatMap((e) => (e.raccourci ? [normaliserRaccourci(e.raccourci)] : [])));
    expect(PAQUET.fiche.commandes.map((c) => c.id)).toEqual(["ouvrir-panneau", "collisions", "descente", "saillies"]);
    for (const c of PAQUET.fiche.commandes) {
      expect(PAQUET.pages[c.icone!]).toMatch(/^<svg/);
      expect(pris.has(normaliserRaccourci(c.raccourci!)), c.id).toBe(false);
    }
    expect(PAQUET.fiche.panneaux.map((p) => p.id)).toEqual(["coordination"]);
  });
  it("aucun seuil dans le code ; « SketchUp » n'y figure pas", () => {
    expect(JSON.stringify(PAQUET)).not.toMatch(/sketchup/i);
    // Aucune valeur en mètres écrite en dur à côté d'un seuil (saillie, hauteur, décalage).
    expect(PAQUET.code).not.toMatch(/(admis|admise|hmin|saillie|hauteur)\w*\s*=\s*\d/);
  });
});

describe("extension « Coordination et structure » — contrôles", () => {
  it("collisions : une gaine traverse une poutre, une autre la touche seulement ; la paire se sélectionne", async () => {
    const m = modele([
      { nom: "Poutre", balise: "Structure", coin: [0, 0, 2.5], l: 6, p: 0.3, h: 0.5 },
      { nom: "Gaine 1", balise: "Réseaux", coin: [2, -1, 2.6], l: 0.3, p: 2, h: 0.3 },
      { nom: "Gaine 2", balise: "Réseaux", coin: [4, -1, 3], l: 0.3, p: 2, h: 0.3 },
    ]);
    const p = planche(m);
    const vide = await p.commande("collisions");
    expect(vide.vide).toMatch(/Nommez/);
    const e = await p.action("controler-collisions", { valeurs: { familleA: "Réseaux", familleB: "Structure" } });
    expect(e.lignes.map((l) => l.cellules.slice(0, 2))).toEqual([["Gaine 1", "Poutre"]]);
    expect(valeur(e, /Paires/)).toBe("1");
    expect(p.textes().at(-1)).toBe("Collisions : 1 paires.");
    await p.action("choisir", { id: e.lignes[0]!.id });
    expect(p.etat.selection).toHaveLength(2);
  });
  it("descente : un poteau d'étage sans appui, un autre décalé ; décalage admis saisi avec sa source, sinon non évalué", async () => {
    const m = modele(
      [
        { nom: "P0-1", balise: "Poteau", coin: [0, 0, 0], l: 0.3, p: 0.3, h: 3 },
        { nom: "P1-1", balise: "Poteau", coin: [0.1, 0, 3], l: 0.3, p: 0.3, h: 3 },
        { nom: "P1-2", balise: "Poteau", coin: [5, 0, 3], l: 0.3, p: 0.3, h: 3 },
      ],
      [{ id: "n0", nom: "Rez", altitude: 0 }, { id: "n1", nom: "Étage 1", altitude: 3 }],
    );
    const p = planche(m);
    await p.commande("descente");
    const sans = await p.action("etat", { valeurs: { porteurs: "Poteau" } });
    expect(sans.lignes.map((l) => l.cellules)).toEqual([["P1-1", "Étage 1", "P0-1", "0,10 m"], ["P1-2", "Étage 1", "aucun", "–"], ["P0-1", "Rez", "plus bas niveau", "–"]]);
    expect(valeur(sans, /au-delà/)).toBe("non évalué");
    expect(valeur(sans, /sans appui/)).toBe("1");
    const avec = await p.action("etat", { valeurs: { porteurs: "Poteau", decalage: "0,05", sourceDecalage: "Hypothèse d'essai" } });
    expect(avec.lignes[0]!.ton).toBe("alerte");
    expect(valeur(avec, /au-delà/)).toBe("1");
  });
  it("saillies : alignement retenu sur une arête ; avancée et hauteur libre comparées aux valeurs saisies avec leur source", async () => {
    const f = creerFonctionsPlanche(modele([
      { nom: "Bâtiment", balise: "Projet", coin: [0, 0, 0], l: 10, p: 8, h: 9 },
      { nom: "Balcon", balise: "Projet", coin: [2, -1.2, 3], l: 3, p: 1.2, h: 0.2 },
    ]));
    const arete = f.api.ligne([-5, 0, 0], [15, 0, 0]) as Id[];
    const p = planche(f.modele(), [arete[0]!]);
    await p.commande("saillies");
    await p.action("retenir-alignement");
    expect(p.textes().at(-1)).toBe("Alignement retenu.");
    const sans = await p.action("etat");
    expect(sans.lignes.map((l) => l.cellules)).toEqual([["Balcon", "1,20 m", "non évalué", "non évalué"]]);
    const avec = await p.action("etat", { valeurs: { saillie: "0,8", hauteur: "3,5", sol: "0", sourceSaillie: "Règlement d'essai" } });
    expect(avec.lignes.map((l) => l.cellules)).toEqual([["Balcon", "1,20 m", "3,00 m", "au-delà"]]);
    const ok = await p.action("etat", { valeurs: { saillie: "1,5", hauteur: "2,5", sol: "0", sourceSaillie: "Règlement d'essai" } });
    expect(ok.lignes[0]!.cellules[3]).toBe("conforme");
  });
});
