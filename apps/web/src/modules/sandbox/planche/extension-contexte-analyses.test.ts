/**
 * Extension « Contexte et analyses » (catalogue des extensions, cas 3, lot 4 ; protocole 1.6) : le paquet livré passe
 * l'import de l'administrateur, puis tourne dans le vrai exécutant, servi par les vrais services de la Planche.
 * Fichiers, Emplacement et part de baies sont des données d'essai.
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ANNOTATIONS_VIDES, REGISTRE_SANDBOX, ajouterNiveau, ajouterRectangle, baliserOccurrences, creerExecutantExtension, creerFonctionsPlanche, jugerImportPaquet, modeleVide, modifierAnnotations, normaliserRaccourci, v3, type AccesPlanche, type AdaptateurBooleens, type AvisExtension, type ExecutantExtension, type Id, type Maillage, type Modele, type PaquetExtension, type PolygonePlan } from "@parcours/sandbox-planche-model";
import { creerHoteExtension, type WorkerExtension } from "./hote-extensions";

const DOSSIER = "../../../../extensions/contexte-analyses/";
const lire = (chemin: string) => readFileSync(fileURLToPath(new URL(DOSSIER + chemin, import.meta.url)), "utf8");
const PAQUET = JSON.parse(lire("contexte-analyses.fadi-addon.json")) as PaquetExtension;

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
    const issue = await h.appeler("demande", `panneau.analyses.${nom}`, { langue: "fr", ...donnees });
    if (issue.genre !== "fini") throw new Error(`action ${nom} : ${JSON.stringify(issue)}`);
    return issue.resultat as Etat;
  };
  return { etat, commande, action, fichier: (texte: string, nom: string) => void (aOuvrir = { nom, texte }), textes: () => etat.avis.map((a) => a.texte) };
}
const valeur = (e: Etat, libelle: RegExp) => e.resultats.find((r) => libelle.test(r.libelle))?.valeur;

const EMPLACEMENT = { latitude: 46.2, longitude: 6.15, nord: 0 };
const versWgs = (x: number, y: number) => {
  const R = 6378137, rad = Math.PI / 180;
  return [EMPLACEMENT.longitude + x / (R * Math.cos(EMPLACEMENT.latitude * rad)) / rad, EMPLACEMENT.latitude + y / R / rad];
};
const anneau = (x0: number, y0: number, x1: number, y1: number) => [[versWgs(x0, y0), versWgs(x1, y0), versWgs(x1, y1), versWgs(x0, y1), versWgs(x0, y0)]];
const avecEmplacement = (m: Modele, e: unknown = EMPLACEMENT): Modele => modifierAnnotations(m, (a) => { a.reglages = { ...(a.reglages ?? {}), emplacement: e } as never; }).modele;
const GEOJSON = {
  type: "FeatureCollection",
  features: [
    { type: "Feature", properties: { building: "yes", height: "12", name: "Immeuble A" }, geometry: { type: "Polygon", coordinates: anneau(20, 0, 30, 10) } },
    { type: "Feature", properties: { building: "yes", "building:levels": "3" }, geometry: { type: "Polygon", coordinates: anneau(40, 0, 46, 6) } },
    { type: "Feature", properties: { building: "yes" }, geometry: { type: "Polygon", coordinates: anneau(60, 0, 64, 4) } },
    { type: "Feature", properties: { highway: "residential" }, geometry: { type: "LineString", coordinates: [versWgs(0, -5), versWgs(70, -5)] } },
    { type: "Feature", properties: { place: "locality", name: "Lieu-dit" }, geometry: { type: "Point", coordinates: versWgs(5, 5) } },
  ],
};
const OSM = `<?xml version="1.0"?><osm version="0.6">
<node id="1" lat="${versWgs(0, 20)[1]}" lon="${versWgs(0, 20)[0]}"/><node id="2" lat="${versWgs(8, 20)[1]}" lon="${versWgs(8, 20)[0]}"/>
<node id="3" lat="${versWgs(8, 28)[1]}" lon="${versWgs(8, 28)[0]}"/><node id="4" lat="${versWgs(0, 28)[1]}" lon="${versWgs(0, 28)[0]}"/>
<way id="10"><nd ref="1"/><nd ref="2"/><nd ref="3"/><nd ref="4"/><nd ref="1"/><tag k="building" v="house"/><tag k="height" v="7"/></way>
<relation id="20"><member type="way" ref="10"/></relation></osm>`;

/** Bâtiment d'essai : boîte 10 × 6 × 3 m groupée ; la face sud (y = 0) porte la matière « Vitrage » sur toute sa surface. */
function maison(): Modele {
  const f = creerFonctionsPlanche(modeleVide());
  f.api.boite([0, 0, 0], 10, 6, 3);
  let m = f.modele();
  const sud = Object.values(m.racine.faces).find((x) => Math.abs(x.normale.y + 1) < 1e-9)!;
  const an = m.annotations ?? ANNOTATIONS_VIDES;
  m = { ...m, annotations: { ...an, materiaux: { ...an.materiaux, vit: { id: "vit", nom: "Vitrage", couleur: "#88bbdd" } } } };
  m = { ...m, racine: { ...m.racine, faces: { ...m.racine.faces, [sud.id]: { ...sud, materiauRecto: "vit" } } } };
  return avecEmplacement(m);
}

describe("extension « Contexte et analyses » — paquet", () => {
  it("le paquet livré est celui du dossier source et passe l'import de l'administrateur ; protocole 1.6", () => {
    expect(PAQUET).toEqual(assembler());
    expect(jugerImportPaquet(PAQUET).ok).toBe(true);
    expect(PAQUET.fiche.protocole).toBe("1.6");
  });
  it("règle d'or : chaque commande a son icône et un raccourci que la Planche ne prend pas ; un panneau", () => {
    const pris = new Set(REGISTRE_SANDBOX.flatMap((e) => (e.raccourci ? [normaliserRaccourci(e.raccourci)] : [])));
    expect(PAQUET.fiche.commandes.map((c) => c.id)).toEqual(["ouvrir-panneau", "contexte", "couleurs", "vitrage"]);
    for (const c of PAQUET.fiche.commandes) {
      expect(PAQUET.pages[c.icone!]).toMatch(/^<svg/);
      expect(pris.has(normaliserRaccourci(c.raccourci!)), c.id).toBe(false);
    }
  });
  it("aucune part de baies exigée dans le code ; « SketchUp » n'y figure pas", () => {
    expect(JSON.stringify(PAQUET)).not.toMatch(/sketchup/i);
    expect(PAQUET.code).not.toMatch(/\b1\s*\/\s*6\b|0[.,]16/);
  });
});

describe("extension « Contexte et analyses » — contexte bâti", () => {
  it("GeoJSON : hauteur lue (height, ou étages × hauteur saisie), jamais devinée ; voirie en arêtes ; non lus comptés", async () => {
    const p = planche(avecEmplacement(modeleVide()));
    await p.commande("contexte");
    p.fichier(JSON.stringify(GEOJSON), "contexte.geojson");
    const e = await p.action("poser-contexte", { valeurs: { etage: "3" } });
    expect(p.textes().at(-1)).toBe("Contexte posé : 3 bâtiments, 1 voies.");
    expect(e.lignes.map((l) => l.cellules)).toEqual([["Point (lieu-dit)", "1", "0", "1"], ["bâtiments", "3", "3", "0"], ["voirie", "1", "1", "0"]]);
    expect(valeur(e, /sans hauteur/)).toBe("1");
    // Un seul pas d'annulation.
    expect(p.etat.pas).toHaveLength(1);
    const noms = Object.values(p.etat.modele.definitions).map((d) => d.nom).sort();
    expect(noms).toEqual(expect.arrayContaining(["Contexte bâti", "Immeuble A", "Voirie"]));
  });
  it("OSM : chemin fermé « building » extrudé selon height ; relation comptée non posée", async () => {
    const p = planche(avecEmplacement(modeleVide()));
    await p.commande("contexte");
    p.fichier(OSM, "contexte.osm");
    const e = await p.action("poser-contexte");
    expect(p.textes().at(-1)).toBe("Contexte posé : 1 bâtiments, 0 voies.");
    expect(e.lignes.map((l) => l.cellules)).toEqual([["bâtiments", "1", "1", "0"], ["relation", "1", "0", "1"]]);
  });
  it("sans Emplacement : rien n'est posé", async () => {
    const p = planche(modeleVide());
    await p.commande("contexte");
    p.fichier(JSON.stringify(GEOJSON), "contexte.geojson");
    await p.action("poser-contexte");
    expect(p.textes().at(-1)).toMatch(/^Emplacement non saisi/);
  });
});

describe("extension « Contexte et analyses » — couleurs et vitrage", () => {
  it("couleurs par orientation : 5 classes, légende numérotée, matières rétablies en un pas", async () => {
    const p = planche(maison());
    await p.commande("couleurs");
    const e = await p.action("appliquer-couleurs", { valeurs: { valeur: "orientation" } });
    expect(p.textes().at(-1)).toBe("Couleurs appliquées à 4 éléments.");
    expect(e.lignes.map((l) => l.cellules[0])).toEqual(["1", "2", "3", "4", "5"]);
    expect(e.lignes.map((l) => l.cellules[3])).toEqual(["1", "1", "0", "1", "1"]);
    const sud = Object.values(p.etat.modele.racine.faces).find((x) => Math.abs(x.normale.y + 1) < 1e-9)!;
    expect(sud.materiauRecto).not.toBe("vit");
    await p.action("retirer-couleurs");
    expect(p.textes().at(-1)).toBe("Matières d'origine rétablies.");
    expect(Object.values(p.etat.modele.racine.faces).find((x) => x.id === sud.id)!.materiauRecto).toBe("vit");
    expect(p.etat.pas).toHaveLength(2);
  });
  it("vitrage : façades extérieures par secteur, baies de la matière nommée, marge sur la part saisie avec sa source", async () => {
    const p = planche(maison());
    await p.commande("vitrage");
    const sans = await p.action("etat", { onglet: "vitrage" });
    expect(sans.lignes.map((l) => l.cellules)).toEqual([["N", "30,00 m²", "non évalué", "non évalué"], ["E", "18,00 m²", "non évalué", "non évalué"], ["S", "30,00 m²", "non évalué", "non évalué"], ["O", "18,00 m²", "non évalué", "non évalué"]]);
    const e = await p.action("etat", { valeurs: { baies: "Vitrage", shab: "60", part: "1/6", source: "Essai, pas un texte" } });
    expect(e.lignes.map((l) => l.cellules[3])).toEqual(["0,0 %", "0,0 %", "100,0 %", "0,0 %"]);
    expect(valeur(e, /exigées/)).toBe("10,00 m² (Essai, pas un texte)");
    expect(valeur(e, /Marge/)).toBe("+20,00 m²");
    const sansSource = await p.action("etat", { valeurs: { baies: "Vitrage", shab: "60", part: "1/6", source: "" } });
    expect(valeur(sansSource, /exigées/)).toBe("non évalué");
  });
});
