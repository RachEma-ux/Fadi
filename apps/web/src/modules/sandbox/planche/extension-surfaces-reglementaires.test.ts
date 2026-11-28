/**
 * Extension « Surfaces réglementaires » (catalogue des extensions, cas 3, lot 3 ; protocole 1.4) : le paquet livré dans
 * `apps/web/extensions/surfaces-reglementaires/` passe l'import de l'administrateur, puis tourne dans le vrai exécutant,
 * servi par les vrais services de la Planche (moteur plan simulé : chaque solide vaut son rectangle englobant).
 * Bâtiment, règles, programme et cote PPRI sont des données d'essai, pas des valeurs réglementaires.
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ANNOTATIONS_VIDES, ajouterNiveau, baliserOccurrences, creerExecutantExtension, creerFonctionsPlanche, jugerImportPaquet, modeleVide, type AccesPlanche, type AdaptateurBooleens, type AvisExtension, type ExecutantExtension, type Id, type Maillage, type Modele, type PaquetExtension, type PolygonePlan } from "@parcours/sandbox-planche-model";
import { creerHoteExtension, type WorkerExtension } from "./hote-extensions";

const DOSSIER = "../../../../extensions/surfaces-reglementaires/";
const lire = (chemin: string) => readFileSync(fileURLToPath(new URL(DOSSIER + chemin, import.meta.url)), "utf8");
const PAQUET = JSON.parse(lire("surfaces-reglementaires.fadi-addon.json")) as PaquetExtension;

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

/** Moteur plan simulé : rectangle englobant de chaque solide ; l'union simulée additionne (les étages superposés comptent chacun en projection). */
const boiteXY = (m: Maillage) => {
  const xs: number[] = [], ys: number[] = [], zs: number[] = [];
  for (let i = 0; i < m.positions.length; i += 3) xs.push(m.positions[i]!), ys.push(m.positions[i + 1]!), zs.push(m.positions[i + 2]!);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys), z0: Math.min(...zs), z1: Math.max(...zs) };
};
const rect = (b: ReturnType<typeof boiteXY>): PolygonePlan => ({ exterieur: [[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1]], trous: [] });
const MOTEUR: AdaptateurBooleens = {
  union: (a) => a,
  difference: (a) => a,
  intersection: (a) => a,
  plans: {
    coupe: (ms, h) => ms.map(boiteXY).filter((b) => b.z0 < h && h < b.z1).map(rect),
    projection: (ms) => ms.map(boiteXY).map(rect),
    union: (ps) => [...ps],
  },
};

/** RDC et R+1 de 12 × 10 m, garage 6 × 5 m balisé « Stationnement », débord 1 × 10 m balisé « Débord de toiture ». */
function batiment(): { modele: Modele; garage: Id } {
  const f = creerFonctionsPlanche(modeleVide());
  f.api.grouper(f.api.boite([0, 0, 0], 12, 10, 2.85) as Id[], "RDC");
  f.api.grouper(f.api.boite([0, 0, 2.85], 12, 10, 2.85) as Id[], "R+1");
  const garage = f.api.grouper(f.api.boite([12, 2, 0], 6, 5, 2.85) as Id[], "Garage") as Id;
  const debord = f.api.grouper(f.api.boite([-1, 0, 5.7], 1, 10, 0.2) as Id[], "Débord") as Id;
  let m = f.modele();
  const balise = (id: Id, nom: string) => ({ id, nom, couleur: "#888888", visible: true });
  const an = m.annotations ?? ANNOTATIONS_VIDES;
  m = { ...m, annotations: { ...an, balises: { ...an.balises, "b-st": balise("b-st", "Stationnement"), "b-de": balise("b-de", "Débord de toiture") } } };
  m = baliserOccurrences(baliserOccurrences(m, [garage], "b-st").modele, [debord], "b-de").modele;
  for (const [nom, altitude] of [["RDC", 0], ["R+1", 2.85]] as const) {
    const r = ajouterNiveau(m, { nom, altitude, hauteur: 2.85 });
    if (!r.ok) throw new Error(r.erreur);
    m = r.modele;
  }
  return { modele: m, garage };
}

const REGLES = {
  format: "fadi-regles-surfaces/1",
  jeux: [{ id: "essai", libelle: "Jeu d'essai", version: "1", date: "2026-11-28", regles: {
    sdp: { hauteurCoupe: 1, exclusions: [{ balise: "Stationnement", motif: "essai" }], abattement: 0.1, source: "Essai, pas un texte réglementaire", relu: true },
    emprise: { exclusions: [{ balise: "Débord de toiture", motif: "essai" }], source: "Essai, pas un texte réglementaire", relu: true },
    ppri: { zoneRefugeMin: 20, source: "Essai, pas un texte réglementaire", relu: false },
  } }],
};

type Etat = { onglet: string; lignes: { cellules: string[]; ton?: string }[]; pied: string[] | null; resultats: { libelle: string; valeur: string; ton?: string }[]; encart: string; vide: string | null; formulaire: { id: string; valeur: string }[] };

function planche(modele: Modele, reference: number | null = 375.2) {
  const etat = { modele, selection: [] as Id[], pas: [] as string[], avis: [] as AvisExtension[], envois: [] as unknown[], ouverts: [] as string[] };
  let aOuvrir: { nom: string; texte: string } | null = null;
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
    booleens: () => MOTEUR,
    referenceNGF: () => reference,
  };
  const h = creerHoteExtension(PAQUET, {
    creer: creerFaux,
    acces,
    surAvis: (a) => void etat.avis.push(a),
    panneau: { envoyer: (_p, d) => (etat.envois.push(d), true), ouvrir: (p) => (etat.ouverts.push(p), true) },
    fichiers: {
      ouvrir: () => ({ reponse: Promise.resolve(aOuvrir), fermer: () => {} }),
      enregistrer: () => ({ reponse: Promise.resolve(true), fermer: () => {} }),
      archiver: async () => ({ ok: true, archive: { id: "archive-essai", empreinte: "a".repeat(64), ajouteLe: "2026-11-28T11:00:00.000Z" } }),
    },
  });
  const commande = async (id: string) => {
    const issue = await h.appeler("demande", `commande.${id}`, { langue: "fr" });
    if (issue.genre !== "fini") throw new Error(`commande ${id} : ${JSON.stringify(issue)}`);
    return etat.envois.at(-1) as Etat;
  };
  const action = async (nom: string, donnees: Record<string, unknown> = {}) => {
    const issue = await h.appeler("demande", `panneau.surfaces.${nom}`, { langue: "fr", ...donnees });
    if (issue.genre !== "fini") throw new Error(`action ${nom} : ${JSON.stringify(issue)}`);
    return issue.resultat as Etat;
  };
  return { etat, commande, action, fichier: (texte: string, nom: string) => void (aOuvrir = { nom, texte }), textes: () => etat.avis.map((a) => a.texte) };
}
const valeur = (e: Etat, libelle: RegExp) => e.resultats.find((r) => libelle.test(r.libelle))?.valeur;

describe("extension « Surfaces réglementaires » — paquet", () => {
  it("le paquet livré est celui du dossier source et passe l'import de l'administrateur", () => {
    expect(PAQUET).toEqual(assembler());
    expect(jugerImportPaquet(PAQUET).ok).toBe(true);
  });
  it("cinq commandes, chacune avec son icône et son raccourci ; un panneau ; protocole 1.4", () => {
    expect(PAQUET.fiche.protocole).toBe("1.4");
    expect(PAQUET.fiche.commandes.map((c) => [c.id, c.raccourci])).toEqual([["ouvrir-panneau", "Ctrl+Alt+U"], ["par-niveau", "Ctrl+Alt+N"], ["emprise", "Ctrl+Alt+E"], ["programme", "Ctrl+Alt+O"], ["ppri", "Ctrl+Alt+I"]]);
    for (const c of PAQUET.fiche.commandes) expect(PAQUET.pages[c.icone!]).toMatch(/^<svg/);
    expect(PAQUET.fiche.panneaux.map((p) => p.id)).toEqual(["surfaces"]);
  });
  it("aucune valeur réglementaire dans le code ; « SketchUp » n'y figure pas", () => {
    expect(JSON.stringify(PAQUET)).not.toMatch(/sketchup/i);
    // Les seuls nombres d'une règle viennent de la table chargée : aucune hauteur de coupe ni abattement codés.
    expect(PAQUET.code).not.toMatch(/hauteurCoupe\s*[:=]\s*\d/);
    expect(PAQUET.code).not.toMatch(/abattement\s*[:=]\s*0?\.\d/);
  });
});

describe("extension « Surfaces réglementaires » — calculs", () => {
  it("sans table : mesures données, surface de plancher et emprise réglementaire non évaluées", async () => {
    const p = planche(batiment().modele);
    const e = await p.commande("par-niveau");
    expect(p.etat.ouverts).toEqual(["surfaces"]);
    expect(e.onglet).toBe("niveaux");
    expect(e.encart).toMatch(/^Aucune table de règles/);
    // Sans hauteur de coupe (ni saisie ni table), rien n'est coupé.
    expect(e.lignes.map((l) => l.cellules)).toEqual([["R+1 (+2,85)", "non évaluée", "non évaluée", "non évaluée"], ["RDC (±0,00)", "non évaluée", "non évaluée", "non évaluée"]].map((l) => [expect.stringMatching(/^R(\+1|DC)/), ...l.slice(1)]));
    const avecHauteur = await p.action("etat", { valeurs: { hauteur: "1" } });
    expect(avecHauteur.lignes.map((l) => l.cellules.slice(1))).toEqual([["120,00 m²", "non évaluée", "non évaluée"], ["150,00 m²", "non évaluée", "non évaluée"]]);
    const em = await p.action("etat", { onglet: "emprise" });
    // Union simulée : 120 + 120 + 30 + 10.
    expect(valeur(em, /projet/i)).toBe("280,00 m²");
    expect(em.resultats.some((r) => r.valeur === "non évaluée")).toBe(true);
  });

  it("avec la table : garage déduit, abattement appliqué, débord écarté de l'emprise, CES sur le terrain saisi", async () => {
    const p = planche(batiment().modele);
    await p.commande("ouvrir-panneau");
    p.fichier(JSON.stringify(REGLES), "regles.json");
    await p.action("charger-regles", { onglet: "regles" });
    expect(p.etat.pas).toHaveLength(1);
    const n = await p.action("etat", { onglet: "niveaux" });
    // RDC : 120 + 30 (garage) coupés, 30 déduits, (120) × 0,9 = 108 ; R+1 : 120 × 0,9 = 108.
    expect(n.lignes.map((l) => l.cellules.slice(1))).toEqual([["120,00 m²", "0,00 m²", "108,00 m²"], ["150,00 m²", "30,00 m²", "108,00 m²"]]);
    expect(n.pied).toEqual(["Total", "270,00 m²", "30,00 m²", "216,00 m²"]);
    const em = await p.action("etat", { onglet: "emprise", valeurs: { terrain: "600" } });
    expect(em.resultats.map((r) => r.valeur)).toEqual(expect.arrayContaining(["280,00 m²", "270,00 m²", "45,0 %"]));
  });

  it("programme comparé par nom de niveau ; écart négatif en alerte", async () => {
    const p = planche(batiment().modele);
    await p.commande("programme");
    p.fichier(JSON.stringify(REGLES), "regles.json");
    await p.action("charger-regles");
    p.fichier("niveau;surface\nRDC;100\nR+1;110\nR+2;50\n", "programme.csv");
    const e = await p.action("charger-programme", { onglet: "programme" });
    expect(e.lignes.map((l) => [l.cellules, l.ton])).toEqual([
      [["RDC", "100,00 m²", "108,00 m²", "+8,00 m²"], "ok"],
      [["R+1", "110,00 m²", "108,00 m²", "−2,00 m²"], "alerte"],
      [["R+2", "50,00 m²", "non évalué", "–"], "gris"],
    ]);
  });

  it("programme chargé sans table ni hauteur de coupe : niveaux « non évalués », jamais un écart calculé", async () => {
    const p = planche(batiment().modele);
    await p.commande("programme");
    p.fichier("niveau;surface\nRDC;100\n", "programme.csv");
    const e = await p.action("charger-programme", { onglet: "programme" });
    expect(e.lignes.map((l) => [l.cellules, l.ton])).toEqual([[["RDC", "100,00 m²", "non évalué", "–"], "gris"]]);
    expect(JSON.stringify(e)).not.toMatch(/NaN/);
  });

  it("emprise : les faces hors de tout groupe sont signalées, jamais omises en silence", async () => {
    const f = creerFonctionsPlanche(batiment().modele);
    f.api.rectangle([30, 0, 0], [1, 0, 0], [0, 1, 0]);
    const p = planche(f.modele());
    await p.commande("emprise");
    const e = await p.action("etat", { onglet: "emprise" });
    expect(e.resultats.find((r) => /hors de tout groupe/.test(r.libelle))).toMatchObject({ valeur: "1", ton: "limite" });
  });

  it("PPRI : cote saisie avec sa source, premier plancher en NGF, zone refuge mesurée sur la sélection, règle non relue « à vérifier »", async () => {
    const d = batiment();
    const p = planche(d.modele);
    await p.commande("ppri");
    p.fichier(JSON.stringify(REGLES), "regles.json");
    await p.action("charger-regles");
    // Sans source, la cote est refusée.
    await p.action("retenir-cote", { onglet: "ppri", valeurs: { cote: "375,50", source: "" } });
    expect(p.textes().at(-1)).toMatch(/source/i);
    let e = await p.action("retenir-cote", { onglet: "ppri", valeurs: { cote: "375,50", source: "PPRI d'essai" } });
    expect(valeur(e, /NGF de la planche|±0,00/)).toBe("375,20 m NGF");
    expect(e.resultats.find((r) => r.ton === "alerte")?.valeur).toMatch(/^insuffisant \(−30 cm\)$/);
    p.etat.selection = [d.garage];
    e = await p.action("mesurer-refuge", { onglet: "ppri" });
    expect(e.resultats.map((r) => r.valeur)).toEqual(expect.arrayContaining(["30,00 m²", "20,00 m² (à vérifier)", "conforme"]));
    // Corriger la cote garde la zone refuge mesurée.
    e = await p.action("retenir-cote", { onglet: "ppri", valeurs: { cote: "375,10", source: "PPRI d'essai, révisé" } });
    expect(e.resultats.map((r) => r.valeur)).toEqual(expect.arrayContaining(["30,00 m²", "conforme"]));
  });
});
