/**
 * Extension « Escaliers » (catalogue des extensions, cas 1 de la feuille de route, extension n° 3 ;
 * maquette validée le 27 novembre 2026) : le paquet livré dans `apps/web/extensions/escaliers/` passe l'import
 * de l'administrateur, puis tourne dans le vrai exécutant, servi par les vrais services de la Planche sur un vrai modèle.
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ajouterRectangle, appliquer, contexte, creerExecutantExtension, creerFonctionsPlanche, jugerImportPaquet, modeleVide, v3, type AccesPlanche, type AvisExtension, type ExecutantExtension, type Id, type Modele, type PaquetExtension, type ValeursSaisie } from "@parcours/sandbox-planche-model";
import { creerHoteExtension, type WorkerExtension } from "./hote-extensions";

const DOSSIER = "../../../../extensions/escaliers/";
const lire = (chemin: string) => readFileSync(fileURLToPath(new URL(DOSSIER + chemin, import.meta.url)), "utf8");
const PAQUET = JSON.parse(lire("escaliers.fadi-addon.json")) as PaquetExtension;

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
  cleFormulaire?: string | null;
  vide: string | null;
  page: number;
  pages: number;
}

/** Planche de remplacement : modèle, sélection, pas d'annulation, avis, saisies, fichiers et panneau. */
function planche(modele: Modele) {
  const etat = { modele, selection: [] as Id[], pas: [] as string[], avis: [] as AvisExtension[], fichiers: [] as { nom: string; texte: string }[], envois: [] as unknown[], ouverts: [] as string[] };
  let reponses: (ValeursSaisie | null)[] = [];
  let aOuvrir: { nom: string; texte: string } | null = null;
  // Protocole 1.2 : archivage en base du fichier chargé, réussi par défaut, refusé à la demande.
  let refusArchive: "connexion" | null = null;
  const archives: string[] = [];
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
      archiver: async (f) => {
        archives.push(f.nom);
        return refusArchive === null ? { ok: true as const, archive: { id: `sbxfic_${archives.length}`, empreinte: "c".repeat(64), ajouteLe: "2026-11-27T12:00:00.000Z" } } : { ok: false as const, motif: refusArchive };
      },
      enregistrer: (d) => {
        etat.fichiers.push({ nom: d.nom, texte: d.texte });
        return { reponse: Promise.resolve(true), fermer: () => {} };
      },
    },
    panneau: { envoyer: (_p, d) => (etat.envois.push(d), true), ouvrir: (p) => (etat.ouverts.push(p), true) },
  });
  const action = async (nom: string, donnees: Record<string, unknown> = {}): Promise<Etat> => {
    const r = await h.appeler("demande", `panneau.escaliers.${nom}`, { langue: "fr", ...donnees });
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
    refuserArchive: (motif: "connexion" | null) => void (refusArchive = motif),
    archives,
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

const occurrences = (m: Modele) => Object.values(contexte(m, undefined).occurrences);
const composer4 = (a: readonly number[], b: readonly number[]) => {
  const r: number[] = [];
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { let s = 0; for (let k = 0; k < 4; k++) s += a[i * 4 + k]! * b[k * 4 + j]!; r.push(s); }
  return r;
};
/** Sommets d'une occurrence, en coordonnées du dessin, triés (pour comparer deux escaliers). */
function sommetsMonde(m: Modele, occ: Id): string[] {
  const l: string[] = [];
  const visiter = (o: { definition: Id; transformation: readonly number[] }, M: readonly number[]) => {
    const c = m.definitions[o.definition]!.contenu;
    for (const f of Object.values(c.faces)) for (const s of f.exterieur) { const q = appliquer(M, c.sommets[s]!.position); l.push([q.x, q.y, q.z].map((v) => (Math.round(v * 1e6) / 1e6 + 0).toFixed(6)).join(",")); }
    for (const sous of Object.values(c.occurrences)) visiter(sous, composer4(M, sous.transformation));
  };
  const o = contexte(m, undefined).occurrences[occ]!;
  visiter(o, o.transformation);
  return [...new Set(l)].sort();
}
const valeur = (e: Etat, libelle: string) => e.resultats.find((r) => r.libelle === libelle)?.valeur;

/** Fichier de règles d'essai : valeurs et sources fictives, propres au test (aucune valeur n'est dans l'extension). */
const REGLES_ESSAI = {
  format: "fadi-regles-escaliers/1",
  portees: [
    {
      id: "essai",
      libelle: "Portée d'essai",
      marge: 0.004,
      regles: {
        hauteurMarche: { min: 0.16, max: 0.18, source: "Fixture A", relu: true },
        giron: { min: 0.25, max: null, source: "Fixture B", relu: true },
        blondel: { min: 0.6, max: 0.64, milieu: 0.62, source: "Fixture C", relu: true },
        echappee: { min: 1.9, max: null, source: "Fixture D", relu: false },
        largeur: { min: 0.8, max: null, source: "Fixture E", relu: true },
        prolongementMainCourante: { min: 0.28, max: null, source: "Fixture F", relu: true },
        mainsCourantesDeuxCotes: { exige: true, source: "Fixture G", relu: true },
        bandeEveil: { exige: true, source: "Fixture H", relu: true },
        nezContrastes: { exige: null, source: "Fixture I", relu: true },
      },
    },
  ],
};
const VALEURS = { type: "droit", hauteur: "2,78", nombre: "16", giron: "0,27", largeur: "1,00", portee: "" };
async function chargerRegles(p: ReturnType<typeof planche>, regles: unknown = REGLES_ESSAI) {
  p.fichierAOuvrir({ nom: "regles.json", texte: JSON.stringify(regles) });
  return p.action("charger-regles", { onglet: "generer", valeurs: VALEURS });
}

describe("extension « Escaliers » — paquet", () => {
  it("le paquet versionné est exactement l'assemblage de ses sources", () => {
    expect(PAQUET).toEqual(assembler());
  });

  it("passe l'import de l'administrateur : forme, une icône et un raccourci par commande (règle d'or)", () => {
    expect(jugerImportPaquet(PAQUET)).toMatchObject({ ok: true });
    const icones = [...PAQUET.fiche.commandes.map((c) => c.icone), ...PAQUET.fiche.panneaux.map((p) => p.icone)];
    expect(icones.every((i) => typeof i === "string" && PAQUET.pages[i!]?.startsWith("<svg"))).toBe(true);
    expect(new Set(icones).size).toBe(icones.length);
    expect(PAQUET.fiche.commandes.map((c) => c.raccourci)).toEqual(["Ctrl+Alt+Y", "Ctrl+Alt+Maj+G", "Ctrl+Alt+Maj+S", "Ctrl+Alt+Maj+C", "Ctrl+Alt+Maj+A", "Ctrl+Alt+Maj+R"]);
  });

  it("aucun nom de produit tiers, aucune valeur réglementaire dans le code ; chaque bouton a son action", () => {
    expect(JSON.stringify(PAQUET)).not.toMatch(/sketchup/i);
    // Ni hauteur de marche, ni giron, ni module, ni échappée écrits en dur.
    expect(PAQUET.code).not.toMatch(/[^\d,]0\.(1[5-9]|2\d|6[0-4])\d*\b|\b1\.9\d*\b/);
    const actions = [...PAQUET.pages["panneau.js"]!.matchAll(/action: "([a-z-]+)"/g)].map((m) => m[1]);
    expect(actions.length).toBeGreaterThanOrEqual(7);
    for (const a of actions) expect(PAQUET.code).toContain(`action("${a}"`);
  });
});

describe("extension « Escaliers » — générer (n° 7)", () => {
  it("escalier droit : une marche par groupe, un groupe « Escalier » qui garde ses paramètres ; Blondel affiché", async () => {
    const { modele } = rectangles([[2, 2]]);
    const p = planche(modele);
    const e = await p.action("etat", { onglet: "generer", valeurs: VALEURS });
    expect(valeur(e, "Escalier")).toBe("16 hauteurs · h 17,4 cm · g 27,0 cm · 2h + g = 61,8 cm");
    expect(valeur(e, "Longueur au sol")).toBe("4,05 × 1,00 m");
    expect(valeur(e, "Résultat")).toBe("non évaluable");
    expect(e.encart).toMatch(/Aucun fichier de règles/);
    await p.action("generer-escalier", { onglet: "generer", valeurs: VALEURS });
    expect(p.etat.pas).toEqual(["Générer un escalier"]);
    const objets = occurrences(p.etat.modele);
    expect(objets).toHaveLength(1);
    expect(Object.keys(p.etat.modele.racine.faces)).toHaveLength(1);
    expect(p.etat.selection).toEqual([objets[0]!.id]);
  });

  it("à palier, en L, en U et balancé : chaque type se dessine ; trop peu de marches pour tourner est refusé", async () => {
    for (const type of ["palier", "l", "u", "balance"]) {
      const p = planche(modeleVide());
      const e = await p.action("etat", { onglet: "generer", valeurs: { ...VALEURS, type, nombre: "14" } });
      expect(e.encart).toMatch(/Aucun fichier de règles/);
      await p.action("generer-escalier", { onglet: "generer", valeurs: { ...VALEURS, type, nombre: "14" } });
      expect(p.etat.pas).toEqual(["Générer un escalier"]);
      expect(occurrences(p.etat.modele)).toHaveLength(1);
    }
    const p = planche(modeleVide());
    const e = await p.action("etat", { onglet: "generer", valeurs: { ...VALEURS, type: "balance", nombre: "4" } });
    expect(e.encart).toMatch(/au moins 6 hauteurs/);
    await p.action("generer-escalier", { onglet: "generer" });
    expect(p.etat.pas).toEqual([]);
  });
});

describe("extension « Escaliers » — règles, solutions (n° 15) et vérification (n° 9)", () => {
  it("un fichier de règles sans source est refusé et nommé ; le fichier valide est gardé avec le dessin", async () => {
    const p = planche(modeleVide());
    const sansSource = structuredClone(REGLES_ESSAI);
    (sansSource.portees[0]!.regles.giron as { source: string }).source = " ";
    await chargerRegles(p, sansSource);
    expect(p.derniereAlerte()).toBe("Fichier de règles refusé : « Portée d'essai », règle « giron » : nombres positifs ou null, et une source non vide");
    const e = await chargerRegles(p);
    expect(p.etat.avis.at(-1)).toMatchObject({ genre: "info", texte: "Règles chargées : Portée d'essai" });
    expect(e.encart).toMatch(/Règles chargées : 1 portée \(regles\.json\)/);
    expect(valeur(e, "Résultat")).toBe("dans la règle");
    const q = planche(p.etat.modele);
    expect((await q.action("etat", { onglet: "generer", valeurs: VALEURS })).encart).toMatch(/1 portée/);
    await p.action("modele-regles", { onglet: "generer" });
    expect(p.etat.fichiers[0]!.nom).toBe("regles-escaliers-modele.json");
    expect(JSON.parse(p.etat.fichiers[0]!.texte)).toMatchObject({ format: "fadi-regles-escaliers/1" });
  });

  it("solutions classées par confort, hors règle à la fin ; « à vérifier » si une règle n'est pas relue ; la solution choisie se génère", async () => {
    const p = planche(modeleVide());
    await chargerRegles(p);
    const e = await p.action("etat", { onglet: "solutions", valeurs: { hauteur: "2,78", tremie: "3,20 × 1,00", epaisseur: "0,10" } });
    expect(e.colonnes).toEqual(["n", "h (cm)", "g (cm)", "2h + g", "Échappée", "Règle"]);
    const etats = e.lignes.map((l) => l.cellules[5]!);
    expect(etats[0]).toBe("dans la règle · à vérifier");
    // Les états vont du meilleur au pire.
    const rang = (s: string) => (s.startsWith("dans") ? 0 : s.startsWith("à la limite") ? 1 : 2);
    expect(etats.map(rang)).toEqual([...etats.map(rang)].sort());
    expect(etats.at(-1)).toMatch(/^hors règle/);
    expect(e.encart).toBe("Blondel 0,60 à 0,64 m, milieu 0,62 m. Chaque règle cite sa source, « à vérifier » tant que le texte n'a pas été relu.");
    const premiere = e.lignes[0]!;
    await p.action("choisir", { onglet: "solutions", id: premiere.id });
    await p.action("generer-solution", { onglet: "solutions", id: premiere.id });
    expect(p.etat.pas.at(-1)).toBe("Générer un escalier");
    expect(p.etat.avis.at(-1)!.texte).toMatch(new RegExp(`^Escalier généré : ${premiere.cellules[0]} hauteurs · h ${premiere.cellules[1]} cm · g ${premiere.cellules[2]} cm`));
  });

  it("sans fichier de règles, les solutions ne sont pas évaluables", async () => {
    const p = planche(modeleVide());
    const e = await p.action("etat", { onglet: "solutions", valeurs: { hauteur: "2,78", tremie: "3,20 × 1,00", epaisseur: "0,20" } });
    expect(e.vide).toMatch(/Chargez d'abord un fichier de règles/);
    expect(e.lignes).toEqual([]);
  });

  it("vérifier : un escalier sélectionné prête ses valeurs ; trois états par critère, avec la source", async () => {
    const p = planche(modeleVide());
    await chargerRegles(p);
    await p.action("generer-escalier", { onglet: "generer", valeurs: { ...VALEURS, giron: "0,249" } });
    const e = await p.action("etat", { onglet: "verifier" });
    expect(e.formulaire.find((c) => c.id === "vh")!.valeur).toBe("0,174");
    expect(e.lignes.map((l) => [l.cellules[0], l.cellules[2], l.cellules[3]])).toEqual([
      ["Hauteur de marche", "conforme", "Fixture A"],
      ["Giron", "non conforme", "Fixture B"],
      ["Module de Blondel (2h + g)", "non conforme", "Fixture C"],
      ["Échappée", "non évaluable", "Fixture D"],
      ["Largeur", "conforme", "Fixture E"],
    ]);
    expect(valeur(e, "Résultat")).toBe("non conforme");
  });
});

describe("extension « Escaliers » — accessibilité (n° 22) et rouvrir (n° 37)", () => {
  it("accessibilité déclarée sur l'escalier, jugée exigence par exigence ; sans règle, non évaluable", async () => {
    const p = planche(modeleVide());
    await chargerRegles(p);
    await p.action("generer-escalier", { onglet: "generer", valeurs: VALEURS });
    p.repondre([{ mainsCourantesDeuxCotes: true, prolongementMainCourante: 0.3, nezContrastes: false, contremarchesExtremes: true, bandeEveil: false }]);
    const e = await p.action("declarer-accessibilite", { onglet: "accessibilite" });
    expect(p.titres).toEqual(["Accessibilité de l'escalier"]);
    expect(e.lignes.map((l) => [l.cellules[0], l.cellules[1], l.cellules[2]])).toEqual([
      ["Mains courantes des deux côtés", "oui", "conforme"],
      ["Nez de marche contrastés", "non", "non évaluable"],
      ["Première et dernière contremarches visibles", "oui", "non évaluable"],
      ["Bande d'éveil en haut", "non", "non conforme"],
      ["Prolongement des mains courantes", "0,30 m", "conforme"],
    ]);
    expect(valeur(e, "Résultat")).toBe("non conforme");
  });

  it("rouvrir : les paramètres reviennent ; régénérer remplace l'escalier en un seul pas et garde l'accessibilité", async () => {
    const p = planche(modeleVide());
    await p.action("generer-escalier", { onglet: "generer", valeurs: VALEURS });
    p.repondre([{ mainsCourantesDeuxCotes: true, prolongementMainCourante: 0, nezContrastes: true, contremarchesExtremes: true, bandeEveil: true }]);
    await p.action("declarer-accessibilite", { onglet: "accessibilite" });
    let e = await p.action("etat", { onglet: "rouvrir" });
    expect(e.formulaire.find((c) => c.id === "nombre")!.valeur).toBe("16");
    const pas = p.etat.pas.length;
    e = await p.action("regenerer-escalier", { onglet: "rouvrir", valeurs: { ...VALEURS, nombre: "15", giron: "0,25" } });
    expect(p.etat.pas.slice(pas)).toEqual(["Régénérer l'escalier"]);
    const objets = occurrences(p.etat.modele);
    expect(objets).toHaveLength(1);
    expect(objets[0]!.id).not.toBe(e.lignes[0]?.id);
    expect(p.etat.avis.at(-1)!.texte).toBe("Escalier régénéré : 15 hauteurs · h 18,5 cm · g 25,0 cm · 2h + g = 62,1 cm");
    const a = await p.action("etat", { onglet: "accessibilite" });
    expect(a.lignes[0]!.cellules[1]).toBe("oui");
    p.etat.selection = [];
    e = await p.action("etat", { onglet: "rouvrir" });
    expect(e.vide).toMatch(/Sélectionnez un escalier généré/);
  });
});

describe("extension « Escaliers » — placement", () => {
  it("deux escaliers générés dans un dessin vide ne se superposent pas (contenu des groupes compris)", async () => {
    const p = planche(modeleVide());
    await p.action("generer-escalier", { onglet: "generer", valeurs: VALEURS });
    await p.action("generer-escalier", { onglet: "generer", valeurs: VALEURS });
    const [a, b] = occurrences(p.etat.modele).map((o) => sommetsMonde(p.etat.modele, o.id).map((k) => Number(k.split(",")[0])));
    expect(Math.min(...b!)).toBeGreaterThanOrEqual(Math.max(...a!) + 2 - 1e-9);
  });

  it("un escalier déplacé et tourné avec la Planche garde sa place quand il est régénéré", async () => {
    const p = planche(modeleVide());
    await p.action("generer-escalier", { onglet: "generer", valeurs: VALEURS });
    const id = occurrences(p.etat.modele)[0]!.id;
    const f = creerFonctionsPlanche(p.etat.modele);
    f.api.tourner([id], [1, 2, 0], [0, 0, 1], 90);
    f.api.deplacer([id], [5, -3, 1]);
    p.etat.modele = f.modele();
    const avant = sommetsMonde(p.etat.modele, id);
    p.etat.selection = [id];
    await p.action("etat", { onglet: "rouvrir" });
    await p.action("regenerer-escalier", { onglet: "rouvrir", valeurs: VALEURS });
    const [neuf] = occurrences(p.etat.modele);
    expect(neuf!.id).not.toBe(id);
    expect(sommetsMonde(p.etat.modele, neuf!.id)).toEqual(avant);
  });

  it("rouvrir : choisir un autre escalier remplace les paramètres du formulaire", async () => {
    const p = planche(modeleVide());
    await p.action("generer-escalier", { onglet: "generer", valeurs: VALEURS });
    await p.action("generer-escalier", { onglet: "generer", valeurs: { ...VALEURS, nombre: "15" } });
    const [a, b] = occurrences(p.etat.modele);
    p.etat.selection = [a!.id];
    let e = await p.action("etat", { onglet: "rouvrir" });
    expect([e.cleFormulaire, e.formulaire.find((c) => c.id === "nombre")!.valeur]).toEqual([a!.id, "16"]);
    p.etat.selection = [b!.id];
    e = await p.action("etat", { onglet: "rouvrir", valeurs: { ...VALEURS, nombre: "16" } });
    expect([e.cleFormulaire, e.formulaire.find((c) => c.id === "nombre")!.valeur]).toEqual([b!.id, "15"]);
  });
});

describe("extension « Escaliers » — commandes et langue", () => {
  it("Ctrl+Alt+Y ouvre le panneau ; chaque commande ouvre son onglet ; textes en anglais", async () => {
    const p = planche(modeleVide());
    await p.h.appeler("demande", "commande.ouvrir-panneau", { langue: "fr" });
    expect(p.etat.ouverts).toEqual(["escaliers"]);
    await p.h.appeler("demande", "commande.solutions", { langue: "en" });
    expect(p.etat.envois.at(-1)).toMatchObject({ onglet: "solutions", vide: "Load a sourced rules file first: without it, the solutions cannot be assessed." });
    await p.h.appeler("demande", "commande.rouvrir-escalier", { langue: "en" });
    expect(p.etat.envois.at(-1)).toMatchObject({ onglet: "rouvrir", vide: "Select a stair generated by this extension (a single group)." });
  });
});

describe("extension « Escaliers » — archivage en base du fichier chargé (protocole 1.2)", () => {
  it("le fichier est archivé avant d'être chargé ; sans archive, il n'est pas chargé et le motif est donné", async () => {
    expect(PAQUET.fiche.protocole).toBe("1.2");
    expect(PAQUET.code).toContain("{ archiver: true }");
    const p = planche(modeleVide());
    await chargerRegles(p);
    expect(p.archives).toEqual(["regles.json"]);
    expect(p.derniereAlerte()).toBe("");
    const q = planche(modeleVide());
    q.refuserArchive("connexion");
    await chargerRegles(q);
    expect(q.derniereAlerte()).toBe("Chargement refusé : le fichier n'a pas pu être archivé en base (connexion requise)");
    expect(q.etat.avis.some((a) => a.texte.startsWith("Règles chargées"))).toBe(false);
  });
});
