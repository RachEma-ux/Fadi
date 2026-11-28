/**
 * Extension « Gabarits et servitudes » (catalogue des extensions, cas 3, lot 4 ; protocole 1.6) : le paquet livré passe
 * l'import de l'administrateur, puis tourne dans le vrai exécutant, servi par les vrais services de la Planche (moteur
 * plan simulé : chaque solide vaut son rectangle englobant). Règles, zones et Emplacement sont des données d'essai, pas
 * des valeurs réglementaires.
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ANNOTATIONS_VIDES, REGISTRE_SANDBOX, ajouterNiveau, ajouterRectangle, baliserOccurrences, creerExecutantExtension, creerFonctionsPlanche, jugerImportPaquet, modeleVide, modifierAnnotations, normaliserRaccourci, v3, type AccesPlanche, type AdaptateurBooleens, type AvisExtension, type ExecutantExtension, type Id, type Maillage, type Modele, type PaquetExtension, type PolygonePlan } from "@parcours/sandbox-planche-model";
import { creerHoteExtension, type WorkerExtension } from "./hote-extensions";

const DOSSIER = "../../../../extensions/gabarits-servitudes/";
const lire = (chemin: string) => readFileSync(fileURLToPath(new URL(DOSSIER + chemin, import.meta.url)), "utf8");
const PAQUET = JSON.parse(lire("gabarits-servitudes.fadi-addon.json")) as PaquetExtension;

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


const SOURCE = "Essai, pas un texte réglementaire";
const REGLES = {
  format: "fadi-regles-gabarit/1",
  jeux: [
    { id: "plu", nature: "PLU", commune: "Essai", version: "1", date: "2026-11-28", regles: {
      hauteur: { valeur: 9, source: SOURCE, relu: true },
      limites: { voie: { retrait: 5, source: SOURCE, relu: true }, separative: { retrait: 3, rapport: 2, source: SOURCE, relu: true } },
      stationnement: { surfaceParPlace: 50, source: SOURCE, relu: false },
    } },
    { id: "rnu", nature: "RNU", commune: "Essai", article: "article d'essai", version: "1", date: "2026-11-28", regles: { hauteur: { valeur: 6, source: SOURCE } } },
  ],
};
const EMPLACEMENT = { latitude: 46.2, longitude: 6.15, nord: 0 };

/** Parcelle 20 × 15 m au sol ; boîte 4 × 4 × 6 m posée en (30, 0) hors parcelle, groupée « Projet ». */
function site(): Modele {
  let m = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(20, 0, 0), v3(0, 15, 0)).modele;
  const f = creerFonctionsPlanche(m);
  f.api.grouper(f.api.boite([30, 0, 0], 4, 4, 6) as Id[], "Projet");
  m = modifierAnnotations(f.modele(), (a) => { a.reglages = { ...(a.reglages ?? {}), emplacement: EMPLACEMENT } as never; }).modele;
  return m;
}
/** Point du plan local → [longitude, latitude] (inverse du plan tangent, nord 0). */
const versWgs = (x: number, y: number) => {
  const R = 6378137, rad = Math.PI / 180;
  return [EMPLACEMENT.longitude + x / (R * Math.cos(EMPLACEMENT.latitude * rad)) / rad, EMPLACEMENT.latitude + y / R / rad];
};
const anneau = (x0: number, y0: number, x1: number, y1: number) => [[versWgs(x0, y0), versWgs(x1, y0), versWgs(x1, y1), versWgs(x0, y1), versWgs(x0, y0)]];
const ZONES = {
  type: "FeatureCollection",
  features: [
    { type: "Feature", properties: { nature: "hauteur", libelle: "Servitude de hauteur d'essai", source: SOURCE, date: "2026-11-01", plafond: 4 }, geometry: { type: "Polygon", coordinates: anneau(28, -2, 36, 6) } },
    { type: "Feature", properties: { nature: "sup", libelle: "SUP d'essai", source: SOURCE, date: "2026-11-01" }, geometry: { type: "Polygon", coordinates: anneau(-10, -10, -5, -5) } },
    { type: "Feature", properties: { nature: "ppri", libelle: "Sans source" }, geometry: { type: "Polygon", coordinates: anneau(50, 50, 60, 60) } },
    { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: versWgs(0, 0) } },
  ],
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
    const issue = await h.appeler("demande", `panneau.gabarits.${nom}`, { langue: "fr", ...donnees });
    if (issue.genre !== "fini") throw new Error(`action ${nom} : ${JSON.stringify(issue)}`);
    return issue.resultat as Etat;
  };
  return { etat, commande, action, fichier: (texte: string, nom: string) => void (aOuvrir = { nom, texte }), textes: () => etat.avis.map((a) => a.texte) };
}
const valeur = (e: Etat, libelle: RegExp) => e.resultats.find((r) => libelle.test(r.libelle))?.valeur;

describe("extension « Gabarits et servitudes » — paquet", () => {
  it("le paquet livré est celui du dossier source et passe l'import de l'administrateur ; protocole 1.6", () => {
    expect(PAQUET).toEqual(assembler());
    expect(jugerImportPaquet(PAQUET).ok).toBe(true);
    expect(PAQUET.fiche.protocole).toBe("1.6");
  });
  it("règle d'or : chaque commande a son icône et un raccourci que la Planche ne prend pas ; un panneau", () => {
    const pris = new Set(REGISTRE_SANDBOX.flatMap((e) => (e.raccourci ? [normaliserRaccourci(e.raccourci)] : [])));
    expect(PAQUET.fiche.commandes.map((c) => c.id)).toEqual(["ouvrir-panneau", "gabarit", "servitudes", "scenarios"]);
    for (const c of PAQUET.fiche.commandes) {
      expect(PAQUET.pages[c.icone!]).toMatch(/^<svg/);
      expect(pris.has(normaliserRaccourci(c.raccourci!)), c.id).toBe(false);
    }
    expect(PAQUET.fiche.panneaux.map((p) => p.id)).toEqual(["gabarits"]);
  });
  it("aucune valeur réglementaire dans le code ; « SketchUp » n'y figure pas", () => {
    expect(JSON.stringify(PAQUET)).not.toMatch(/sketchup/i);
    expect(PAQUET.code).not.toMatch(/(retrait|rapport|hauteurALimite|surfaceParPlace)\s*[:=]\s*\d/);
    expect(PAQUET.code).not.toMatch(/R\s?111/);
  });
});

describe("extension « Gabarits et servitudes » — gabarit", () => {
  it("sans table : rien n'est construit, c'est dit", async () => {
    const p = planche(site());
    const e = await p.commande("gabarit");
    expect(e.encart).toMatch(/^Aucune table de règles/);
    await p.action("construire");
    expect(p.textes().at(-1)).toMatch(/ne fournit aucune règle/);
  });
  it("parcelle, limite sur voie, PLU : gabarit translucide, emprise constructible des retraits", async () => {
    const p = planche(site());
    await p.commande("gabarit");
    p.fichier(JSON.stringify(REGLES), "regles.json");
    await p.action("charger-regles");
    const face = Object.keys(p.etat.modele.racine.faces).find((id) => p.etat.modele.racine.faces[id]!.normale.z !== 0 && Object.values(p.etat.modele.racine.faces).length > 0)!;
    p.etat.selection = [face];
    await p.action("retenir-parcelle");
    // Arête basse (y = 0) : la voie.
    const basse = Object.values(p.etat.modele.racine.aretes).find((a) => {
      const s = p.etat.modele.racine.sommets;
      return s[a.a]!.position.y === 0 && s[a.b]!.position.y === 0 && s[a.a]!.position.x <= 20 && s[a.b]!.position.x <= 20;
    })!;
    p.etat.selection = [basse.id];
    await p.action("retenir-voies");
    const e = await p.action("construire");
    expect(p.textes().at(-1)).toMatch(/^Gabarit construit/);
    expect(e.lignes.map((l) => l.cellules.slice(0, 3))).toEqual([["1 · voie", "20,00 m", "5,00 m"], ["2 · séparative", "15,00 m", "3,00 m"], ["3 · séparative", "20,00 m", "3,00 m"], ["4 · séparative", "15,00 m", "3,00 m"]]);
    expect(valeur(e, /Emprise constructible/)).toBe("98,00 m²");
    const groupe = Object.values(p.etat.modele.racine.occurrences).find((o) => p.etat.modele.definitions[o.definition]?.nom?.startsWith("Gabarit PLU"));
    expect(groupe).toBeDefined();
    const mat = Object.values(p.etat.modele.annotations?.materiaux ?? {}).find((x) => x.nom === "Gabarit PLU");
    expect(mat?.opacite).toBe(0.3);
    // La parcelle n'est pas soudée au gabarit : elle reste une seule face.
    expect(Object.keys(p.etat.modele.racine.faces).filter((id) => p.etat.modele.racine.faces[id]!.normale.z !== 0)).toHaveLength(1);
  });
});

describe("extension « Gabarits et servitudes » — servitudes et scénarios", () => {
  it("zones posées depuis l'Emplacement ; refus comptés ; intrusion au-dessus du plafond signalée avec l'écart", async () => {
    const p = planche(site());
    await p.commande("servitudes");
    p.fichier(JSON.stringify(ZONES), "zones.geojson");
    await p.action("poser-zones");
    expect(p.textes().at(-1)).toBe("2 zones posées.");
    const c = await p.action("controler");
    expect(p.textes().at(-1)).toBe("1 intrusion signalée.");
    expect(c.lignes.map((l) => [l.cellules[0]!.split(" · ")[0], l.cellules[2], l.cellules[3], l.ton])).toEqual([
      ["Servitude de hauteur d'essai", "4,00 m", "intrusion (+2,00 m)", "alerte"],
      ["SUP d'essai", "sans plafond", "non évalué", "gris"],
    ]);
    expect(valeur(c, /refusées/)).toBe("1");
    expect(valeur(c, /non lus/)).toBe("Point × 1");
  });
  it("sans Emplacement : import refusé", async () => {
    const m = modifierAnnotations(site(), (a) => { a.reglages = { ...(a.reglages ?? {}), emplacement: undefined } as never; }).modele;
    const p = planche(m);
    await p.commande("servitudes");
    p.fichier(JSON.stringify(ZONES), "zones.geojson");
    await p.action("poser-zones");
    expect(p.textes().at(-1)).toMatch(/^Emplacement non saisi/);
  });
  it("scénarios balisés : emprise, surface coupée et places selon la règle du jeu", async () => {
    const f = creerFonctionsPlanche(modeleVide());
    const a = f.api.grouper(f.api.boite([0, 0, 0], 10, 10, 3) as Id[], "A") as Id;
    const b = f.api.grouper(f.api.boite([20, 0, 0], 10, 5, 3) as Id[], "B") as Id;
    let m = f.modele();
    const an = m.annotations ?? ANNOTATIONS_VIDES;
    m = { ...m, annotations: { ...an, balises: { ...an.balises, sa: { id: "sa", nom: "Scénario A", couleur: "#888888", visible: true }, sb: { id: "sb", nom: "Scénario B", couleur: "#888888", visible: true } } } };
    m = baliserOccurrences(baliserOccurrences(m, [a], "sa").modele, [b], "sb").modele;
    const r = ajouterNiveau(m, { nom: "RDC", altitude: 0, hauteur: 3 });
    if (!r.ok) throw new Error(r.erreur);
    const p = planche(r.modele);
    await p.commande("scenarios");
    p.fichier(JSON.stringify(REGLES), "regles.json");
    await p.action("charger-regles");
    const e = await p.action("etat", { onglet: "scenarios", valeurs: { hauteur: "1" } });
    expect(e.lignes.map((l) => l.cellules)).toEqual([["Scénario A", "100,00 m²", "100,00 m²", "2"], ["Scénario B", "50,00 m²", "50,00 m²", "1"]]);
    expect(valeur(e, /stationnement/)).toBe("50,0 m² / place (à vérifier)");
  });
});
