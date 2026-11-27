/**
 * Extension « Toitures et combles » (catalogue des extensions, cas 1 de la feuille de route, extension n° 4 ;
 * maquette validée le 27 novembre 2026) : le paquet livré dans `apps/web/extensions/toitures/` passe l'import
 * de l'administrateur, puis tourne dans le vrai exécutant, servi par les vrais services de la Planche sur un vrai modèle.
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ajouterRectangle, ajouterSegment, appliquer, contexte, creerExecutantExtension, creerFonctionsPlanche, jugerImportPaquet, modeleVide, modifierAnnotations, v3, type AccesPlanche, type AvisExtension, type ExecutantExtension, type Id, type Modele, type PaquetExtension, type ValeursSaisie } from "@parcours/sandbox-planche-model";
import { creerHoteExtension, type WorkerExtension } from "./hote-extensions";

const DOSSIER = "../../../../extensions/toitures/";
const lire = (chemin: string) => readFileSync(fileURLToPath(new URL(DOSSIER + chemin, import.meta.url)), "utf8");
const PAQUET = JSON.parse(lire("toitures.fadi-addon.json")) as PaquetExtension;

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
  choisieLibelle: string;
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
    const r = await h.appeler("demande", `panneau.toitures.${nom}`, { langue: "fr", ...donnees });
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

const occurrences = (m: Modele) => Object.values(contexte(m, undefined).occurrences);
const valeur = (e: Etat, libelle: string) => e.resultats.find((r) => r.libelle === libelle)?.valeur;

/** Face rectangulaire horizontale L × W à l'altitude z ; rend le modèle et la face. */
function contour(L: number, W: number, z: number, m: Modele = modeleVide(), x = 0): { modele: Modele; face: Id } {
  const avant = new Set(Object.keys(m.racine.faces));
  const r = ajouterRectangle(m, v3(x, 0, z), v3(L, 0, 0), v3(0, W, 0)).modele;
  return { modele: r, face: Object.keys(r.racine.faces).find((f) => !avant.has(f))! };
}

/** Faces d'un objet posé à la racine, en coordonnées du monde (sous-objets compris), avec leur nom de groupe. */
function facesMonde(m: Modele, occ: Id): { groupe: string; points: [number, number, number][] }[] {
  const sortie: { groupe: string; points: [number, number, number][] }[] = [];
  const visiter = (o: { definition: Id; transformation: readonly number[]; nom?: string }, M: readonly number[]) => {
    const d = m.definitions[o.definition]!;
    const c = d.contenu;
    for (const f of Object.values(c.faces)) {
      sortie.push({ groupe: o.nom ?? d.nom, points: f.exterieur.map((s) => { const p = appliquer(M, c.sommets[s]!.position); return [p.x, p.y, p.z] as [number, number, number]; }) });
    }
    for (const sous of Object.values(c.occurrences)) visiter(sous, composer4(M, sous.transformation));
  };
  const o = contexte(m, undefined).occurrences[occ]!;
  visiter(o, o.transformation);
  return sortie;
}
const composer4 = (a: readonly number[], b: readonly number[]) => {
  const r: number[] = [];
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { let s = 0; for (let k = 0; k < 4; k++) s += a[i * 4 + k]! * b[k * 4 + j]!; r.push(s); }
  return r;
};
const nomDefinition = (m: Modele, occ: Id) => m.definitions[contexte(m, undefined).occurrences[occ]!.definition]!.nom;

/** Table d'essai : valeurs et sources fictives, propres au test (aucune pente n'est dans l'extension). */
const TABLE_ESSAI = {
  format: "fadi-regles-pentes/1",
  entrees: [
    { materiau: "Matériau d'essai A", zone: "Z1", situation: "S1", pente: 30, unite: "%", source: "Fixture 1", relu: true },
    { materiau: "Matériau d'essai A", zone: "Z1", situation: "S2", pente: 38, unite: "%", source: "Fixture 2", relu: false },
    { materiau: "Matériau d'essai B", zone: "Z2", situation: "S1", pente: 20, unite: "°", source: "Fixture 3", relu: true },
  ],
};
const PANS = { type: "2", pente: "35", unite: "%", debord: "" };
async function chargerTable(p: ReturnType<typeof planche>, table: unknown = TABLE_ESSAI) {
  p.fichierAOuvrir({ nom: "pentes.json", texte: JSON.stringify(table) });
  return p.action("charger-table", { onglet: "pente" });
}

describe("extension « Toitures et combles » — paquet", () => {
  it("le paquet versionné est exactement l'assemblage de ses sources", () => {
    expect(PAQUET).toEqual(assembler());
  });

  it("passe l'import de l'administrateur : forme, une icône et un raccourci par commande (règle d'or)", () => {
    expect(jugerImportPaquet(PAQUET)).toMatchObject({ ok: true });
    const icones = [...PAQUET.fiche.commandes.map((c) => c.icone), ...PAQUET.fiche.panneaux.map((p) => p.icone)];
    expect(icones.every((i) => typeof i === "string" && PAQUET.pages[i!]?.startsWith("<svg"))).toBe(true);
    expect(new Set(icones).size).toBe(icones.length);
    expect(PAQUET.fiche.commandes.map((c) => c.raccourci)).toEqual(["Ctrl+Alt+T", "Ctrl+Alt+Maj+T", "Ctrl+Alt+Maj+W", "Ctrl+Alt+Maj+Z", "Ctrl+Alt+Maj+H"]);
  });

  it("aucun nom de produit tiers, aucun matériau ni pente minimale dans le code ; chaque bouton a son action", () => {
    expect(JSON.stringify(PAQUET)).not.toMatch(/sketchup/i);
    expect(PAQUET.code).not.toMatch(/tuile|ardoise|zinc|bac acier|tile|slate/i);
    const actions = [...PAQUET.pages["panneau.js"]!.matchAll(/action: "([a-z-]+)"/g)].map((m) => m[1]);
    expect(actions.length).toBeGreaterThanOrEqual(7);
    for (const a of actions) expect(PAQUET.code).toContain(`action("${a}"`);
  });
});

describe("extension « Toitures et combles » — toiture à pans (n° 27)", () => {
  it("2 pans sur un contour 12 × 9 à +6,10 : égout, faîtage, couverture, comble ; posée sur le contour en un pas", async () => {
    const { modele, face } = contour(12, 9, 6.1);
    const p = planche(modele);
    p.etat.selection = [face];
    const e = await p.action("etat", { onglet: "pans", valeurs: PANS });
    expect(e.resultats).toEqual([
      { libelle: "Contour", valeur: "12,00 × 9,00 m" },
      { libelle: "Égout", valeur: "+6,10" },
      { libelle: "Faîtage", valeur: "+7,68" },
      { libelle: "Couverture", valeur: "114,4 m²" },
      { libelle: "Comble", valeur: "85 m³" },
      { libelle: "Pente minimale (aucune table chargée)", valeur: "non évaluable", ton: "" },
    ]);
    await p.action("generer-toiture", { onglet: "pans", valeurs: PANS });
    expect(p.etat.pas).toEqual(["Toiture à pans"]);
    expect(Object.keys(p.etat.modele.racine.faces)).toEqual([face]);
    const [toit] = occurrences(p.etat.modele);
    expect(nomDefinition(p.etat.modele, toit!.id)).toBe("Toiture 2 pans 35 %");
    const pans = facesMonde(p.etat.modele, toit!.id);
    expect(pans).toHaveLength(2);
    const zs = pans.flatMap((f) => f.points.map((q) => q[2]));
    expect(Math.min(...zs)).toBeCloseTo(6.1, 9);
    expect(Math.max(...zs)).toBeCloseTo(6.1 + 1.575, 9);
    const xs = pans.flatMap((f) => f.points.map((q) => q[0]));
    const ys = pans.flatMap((f) => f.points.map((q) => q[1]));
    expect([Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)].map((v) => Math.round(v * 1e6) / 1e6)).toEqual([0, 12, 0, 9]);
    expect(p.etat.selection).toEqual([toit!.id]);
  });

  it("4 pans avec débord, 4 pans sur un carré (pyramide), 1 pan : chaque type se pose ; le débord abaisse l'égout", async () => {
    const { modele, face } = contour(12, 9, 6.1);
    let p = planche(modele);
    p.etat.selection = [face];
    const quatre = { type: "4", pente: "40", unite: "%", debord: "0,5" };
    const e = await p.action("etat", { onglet: "pans", valeurs: quatre });
    expect([valeur(e, "Égout"), valeur(e, "Faîtage"), valeur(e, "Couverture"), valeur(e, "Comble")]).toEqual(["+5,90", "+7,90", "140,0 m²", "73 m³"]);
    await p.action("generer-toiture", { onglet: "pans", valeurs: quatre });
    expect(p.derniereAlerte()).toBe("");
    let pans = facesMonde(p.etat.modele, occurrences(p.etat.modele)[0]!.id);
    expect(pans.map((f) => f.points.length).sort()).toEqual([3, 3, 4, 4]);
    const xs = pans.flatMap((f) => f.points.map((q) => q[0]));
    expect([Math.min(...xs), Math.max(...xs)].map((v) => Math.round(v * 1e6) / 1e6)).toEqual([-0.5, 12.5]);

    const carre = contour(8, 8, 3);
    p = planche(carre.modele);
    p.etat.selection = [carre.face];
    await p.action("generer-toiture", { onglet: "pans", valeurs: { type: "4", pente: "45", unite: "°", debord: "" } });
    pans = facesMonde(p.etat.modele, occurrences(p.etat.modele)[0]!.id);
    expect(pans.map((f) => f.points.length)).toEqual([3, 3, 3, 3]);
    expect(Math.max(...pans.flatMap((f) => f.points.map((q) => q[2])))).toBeCloseTo(7, 9);

    const appentis = contour(6, 4, 0);
    p = planche(appentis.modele);
    p.etat.selection = [appentis.face];
    const un = { type: "1", pente: "10", unite: "%", debord: "" };
    expect(valeur(await p.action("etat", { onglet: "pans", valeurs: un }), "Faîtage")).toBe("+0,40");
    await p.action("generer-toiture", { onglet: "pans", valeurs: un });
    expect(facesMonde(p.etat.modele, occurrences(p.etat.modele)[0]!.id)).toHaveLength(1);
  });

  it("refus nommés : contour en L (noues non prises en charge), face non horizontale, pente illisible ; rien n'est posé", async () => {
    let m = modeleVide();
    const L = [v3(0, 0, 0), v3(6, 0, 0), v3(6, 3, 0), v3(3, 3, 0), v3(3, 6, 0), v3(0, 6, 0)];
    for (let i = 0; i < L.length; i++) m = ajouterSegment(m, L[i]!, L[(i + 1) % L.length]!).modele;
    const enL = Object.keys(m.racine.faces)[0]!;
    const p = planche(m);
    p.etat.selection = [enL];
    const e = await p.action("etat", { onglet: "pans", valeurs: PANS });
    expect(e.resultats[0]).toMatchObject({ libelle: "Contour", ton: "alerte" });
    expect(e.resultats[0]!.valeur).toMatch(/en L ou en T, qui demandent des noues/);
    await p.action("generer-toiture", { onglet: "pans", valeurs: PANS });
    expect(p.derniereAlerte()).toMatch(/noues/);
    const mur = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(4, 0, 0), v3(0, 0, 3)).modele;
    const q = planche(mur);
    q.etat.selection = Object.keys(mur.racine.faces);
    await q.action("generer-toiture", { onglet: "pans", valeurs: PANS });
    expect(q.derniereAlerte()).toBe("Le contour doit être une face horizontale.");
    const c = contour(4, 3, 0);
    const r = planche(c.modele);
    r.etat.selection = [c.face];
    await r.action("generer-toiture", { onglet: "pans", valeurs: { ...PANS, pente: "trente" } });
    expect(r.derniereAlerte()).toMatch(/La pente doit être un nombre positif/);
    expect([p.etat.pas, q.etat.pas, r.etat.pas]).toEqual([[], [], []]);
  });
});

describe("extension « Toitures et combles » — variantes (n° 33)", () => {
  it("compare des variantes sur le même contour ; la variante choisie se garde en un pas ; un autre contour repart de zéro", async () => {
    const { modele, face } = contour(12, 9, 6.1);
    const p = planche(modele);
    p.etat.selection = [face];
    let e = await p.action("etat", { onglet: "variantes" });
    expect(e.vide).toMatch(/Aucune variante/);
    p.repondre([{ type: "2", pente: 35, unite: "%", debord: 0 }, { type: "4", pente: 40, unite: "%", debord: 0 }, { type: "2", pente: 45, unite: "°", debord: 0 }]);
    for (let i = 0; i < 3; i++) await p.action("comparer-pente", { onglet: "variantes" });
    expect(p.titres).toEqual(["Comparer une autre pente", "Comparer une autre pente", "Comparer une autre pente"]);
    e = await p.action("choisir", { onglet: "variantes", id: "v1" });
    expect(e.colonnes).toEqual(["Variante", "Pente", "Couverture", "Égout", "Faîtage", "Comble"]);
    expect(e.lignes.map((l) => l.cellules)).toEqual([
      ["A · 2 pans", "35 %", "114,4 m²", "+6,10", "+7,68", "85 m³"],
      ["B · 4 pans", "40 %", "116,3 m²", "+6,10", "+7,90", "73 m³"],
      ["C · 2 pans", "45°", "152,7 m²", "+6,10", "+10,60", "243 m³"],
    ]);
    expect(e.lignes.map((l) => l.choisi)).toEqual([false, true, false]);
    expect(e.choisieLibelle).toBe("B");
    expect(e.resultats).toEqual([{ libelle: "Pente minimale (aucune table chargée)", valeur: "non évaluable", ton: "" }]);
    expect(e.encart).toMatch(/table des pentes minimales n'est pas encore chargée/);
    await p.action("garder-variante", { onglet: "variantes", id: "v1" });
    expect(p.etat.pas).toEqual(["Comparer une autre pente", "Comparer une autre pente", "Comparer une autre pente", "Garder une variante"]);
    expect(nomDefinition(p.etat.modele, occurrences(p.etat.modele)[0]!.id)).toBe("Toiture 4 pans 40 %");
    // Un autre contour : les variantes repartent de zéro.
    const autre = contour(5, 4, 0, p.etat.modele, 30);
    p.etat.modele = autre.modele;
    p.etat.selection = [autre.face];
    p.repondre([{ type: "1", pente: 10, unite: "%", debord: 0 }]);
    e = await p.action("comparer-pente", { onglet: "variantes" });
    expect(e.lignes.map((l) => l.cellules[0])).toEqual(["A · 1 pan"]);
  });
});

describe("extension « Toitures et combles » — pente minimale (n° 36)", () => {
  it("sans table : non évaluable ; table sans source refusée ; table chargée : conforme, non conforme, « à vérifier », source citée", async () => {
    const { modele, face } = contour(12, 9, 6.1);
    const p = planche(modele);
    p.etat.selection = [face];
    let e = await p.action("etat", { onglet: "pente", valeurs: PANS });
    expect(e.formulaire).toEqual([]);
    expect(e.resultats).toEqual([
      { libelle: "Pente du pan", valeur: "35 % (onglet Toiture à pans)" },
      { libelle: "Pente minimale (aucune table chargée)", valeur: "non évaluable", ton: "" },
    ]);
    expect(e.encart).toBe("La table des pentes minimales n'est pas encore chargée : le contrôle dit « non évaluable » au lieu d'inventer une valeur.");
    await chargerTable(p, { ...TABLE_ESSAI, entrees: [{ ...TABLE_ESSAI.entrees[0], source: "" }] });
    expect(p.derniereAlerte()).toMatch(/^Table refusée : ligne 1 : .*source/);
    await chargerTable(p);
    expect(p.etat.pas).toEqual(["Table des pentes minimales"]);
    e = await p.action("etat", { onglet: "pente", valeurs: PANS });
    expect(e.formulaire.map((c) => [c.id, c.valeur])).toEqual([["materiau", "Matériau d'essai A"], ["zone", "Z1"], ["situation", "S1"]]);
    expect(e.resultats).toEqual([
      { libelle: "Pente du pan", valeur: "35 % (onglet Toiture à pans)" },
      { libelle: "Pente minimale (Matériau d'essai A, Z1, S1)", valeur: "30 %" },
      { libelle: "Résultat", valeur: "conforme", ton: "ok" },
      { libelle: "Source", valeur: "Fixture 1" },
    ]);
    e = await p.action("etat", { onglet: "pente", valeurs: { ...PANS, materiau: "Matériau d'essai A", zone: "Z1", situation: "S2" } });
    expect(valeur(e, "Résultat")).toBe("non conforme · à vérifier");
    // Pentes en degrés et en % comparées sur la même mesure : 35 % ≈ 19,3° < 20°.
    e = await p.action("etat", { onglet: "pente", valeurs: { ...PANS, materiau: "Matériau d'essai B" } });
    expect(e.formulaire.map((c) => c.valeur)).toEqual(["Matériau d'essai B", "Z2", "S1"]);
    expect(valeur(e, "Résultat")).toBe("non conforme");
    expect(valeur(e, "Pente minimale (Matériau d'essai B, Z2, S1)")).toBe("20°");
    await p.action("modele-table", { onglet: "pente" });
    expect(JSON.parse(p.etat.fichiers[0]!.texte)).toMatchObject({ format: "fadi-regles-pentes/1", entrees: [{ pente: null, source: "" }] });
  });
});

describe("extension « Toitures et combles » — ligne 1,80 m (n° 4)", () => {
  it("dans le comble d'une toiture : bande sous la hauteur et partie au-dessus, aires nommées, bande colorée ; retracer remplace", async () => {
    const depart = contour(12, 9, 6.1);
    const r = modifierAnnotations(depart.modele, (a, id) => {
      const matiere = id("m");
      a.materiaux[matiere] = { id: matiere, nom: "Bande", couleur: "#d9822b" };
      return { matiere };
    });
    const p = planche(r.modele);
    p.etat.selection = [depart.face];
    await p.action("generer-toiture", { onglet: "pans", valeurs: { type: "2", pente: "45", unite: "°", debord: "" } });
    const toit = p.etat.selection[0]!;
    let e = await p.action("etat", { onglet: "ligne", valeurs: { hauteur: "1,80", matiere: r.extra.matiere } });
    expect(e.formulaire.find((c) => c.id === "matiere")).toMatchObject({ choix: [{ valeur: "", libelle: "aucune" }, { valeur: r.extra.matiere, libelle: "Bande" }] });
    expect(e.resultats).toEqual([
      { libelle: "Toiture", valeur: "Toiture 2 pans 45°" },
      { libelle: "Sous 1,8 m", valeur: "43,20 m²", ton: "limite" },
      { libelle: "À 1,8 m et plus", valeur: "64,80 m²" },
    ]);
    await p.action("tracer-ligne", { onglet: "ligne", valeurs: { hauteur: "1,80", matiere: r.extra.matiere } });
    expect(p.etat.pas.at(-1)).toBe("Ligne de hauteur sous rampants");
    const ligne = occurrences(p.etat.modele).find((o) => o.id !== toit)!;
    expect(nomDefinition(p.etat.modele, ligne.id)).toBe("Ligne h = 1,8 m");
    const faces = facesMonde(p.etat.modele, ligne.id);
    expect(faces.map((f) => f.groupe).sort()).toEqual(["Comble sous 1,8 m — 43,20 m²", "Comble sous 1,8 m — 43,20 m²", "Comble à 1,8 m et plus — 64,80 m²"].sort());
    const haute = faces.find((f) => f.groupe.startsWith("Comble à"))!;
    const ys = haute.points.map((q) => Math.round(q[1] * 1e6) / 1e6);
    expect([Math.min(...ys), Math.max(...ys)]).toEqual([1.8, 7.2]);
    expect(haute.points.every((q) => Math.abs(q[2] - 6.1) < 1e-9)).toBe(true);
    const bande = Object.values(p.etat.modele.definitions[ligne.definition]!.contenu.occurrences).find((o) => o.materiau);
    expect(bande?.materiau).toBe(r.extra.matiere);
    // Retracer à une autre hauteur remplace la ligne précédente.
    p.etat.selection = [toit];
    await p.action("tracer-ligne", { onglet: "ligne", valeurs: { hauteur: "1", matiere: "" } });
    expect(occurrences(p.etat.modele)).toHaveLength(2);
    expect(p.derniereAlerte()).toBe("");
    // Un comble trop bas : tout est sous la ligne.
    p.etat.selection = [toit];
    await p.action("tracer-ligne", { onglet: "ligne", valeurs: { hauteur: "5", matiere: "" } });
    expect(p.etat.avis.at(-1)?.texte).toBe("Le comble n'atteint pas 5 m : tout est sous la ligne.");
    expect(occurrences(p.etat.modele)).toHaveLength(2);
  });

  it("sans toiture sélectionnée : la ligne est refusée et nommée", async () => {
    const { modele, face } = contour(4, 3, 0);
    const p = planche(modele);
    p.etat.selection = [face];
    const e = await p.action("tracer-ligne", { onglet: "ligne", valeurs: { hauteur: "1,80" } });
    expect(p.derniereAlerte()).toMatch(/Sélectionnez une toiture générée/);
    expect(e.resultats[0]).toMatchObject({ ton: "alerte" });
    expect(p.etat.pas).toEqual([]);
  });
});

describe("extension « Toitures et combles » — retours de relecture", () => {
  it("un contour avec une ouverture est refusé, rien n'est posé", async () => {
    const depart = contour(12, 9, 6.1);
    const m = ajouterRectangle(depart.modele, v3(4, 3, 6.1), v3(2, 0, 0), v3(0, 2, 0)).modele;
    const p = planche(m);
    p.etat.selection = [depart.face];
    await p.action("generer-toiture", { onglet: "pans", valeurs: PANS });
    expect(p.derniereAlerte()).toBe("Le contour a une ouverture : les surfaces et le comble ne la prendraient pas en compte. Choisissez une face sans ouverture.");
    expect(occurrences(p.etat.modele)).toHaveLength(0);
  });

  it("une table aux libellés longs se garde par morceaux bornés en taille", async () => {
    const entrees = Array.from({ length: 20 }, (_, i) => ({ materiau: `${"M".repeat(56)} ${i}`, zone: "Z".repeat(40), situation: "S".repeat(60), pente: 30, unite: "%", source: "F".repeat(160), relu: true }));
    const p = planche(modeleVide());
    await chargerTable(p, { format: "fadi-regles-pentes/1", entrees });
    expect(p.derniereAlerte()).toBe("");
    expect(p.etat.pas).toEqual(["Table des pentes minimales"]);
  });

  it("une toiture déplacée et tournée avec la Planche : la ligne se trace à sa place actuelle", async () => {
    const depart = contour(12, 9, 6.1);
    const p = planche(depart.modele);
    p.etat.selection = [depart.face];
    await p.action("generer-toiture", { onglet: "pans", valeurs: { type: "2", pente: "45", unite: "°", debord: "" } });
    const toit = p.etat.selection[0]!;
    const f = creerFonctionsPlanche(p.etat.modele);
    f.api.tourner([toit], [0, 0, 0], [0, 0, 1], 90);
    f.api.deplacer([toit], [20, 5, 0]);
    p.etat.modele = f.modele();
    p.etat.selection = [toit];
    await p.action("tracer-ligne", { onglet: "ligne", valeurs: { hauteur: "1,80", matiere: "" } });
    expect(p.derniereAlerte()).toBe("");
    const ligne = occurrences(p.etat.modele).find((o) => o.id !== toit)!;
    const haute = facesMonde(p.etat.modele, ligne.id).find((x) => x.groupe.startsWith("Comble à"))!;
    const xs = haute.points.map((q) => Math.round(q[0] * 1e6) / 1e6);
    const ys = haute.points.map((q) => Math.round(q[1] * 1e6) / 1e6);
    expect([Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]).toEqual([12.8, 18.2, 5, 17]);
  });
});

describe("extension « Toitures et combles » — commandes et langue", () => {
  it("Ctrl+Alt+T ouvre le panneau ; chaque commande ouvre son onglet ; textes en anglais", async () => {
    const p = planche(modeleVide());
    await p.h.appeler("demande", "commande.ouvrir-panneau", { langue: "fr" });
    expect(p.etat.ouverts).toEqual(["toitures"]);
    expect(p.etat.envois.at(-1)).toMatchObject({ onglet: "pans" });
    await p.h.appeler("demande", "commande.variantes", { langue: "en" });
    expect(p.etat.envois.at(-1)).toMatchObject({ onglet: "variantes", colonnes: ["Variant", "Pitch", "Roof area", "Eaves", "Ridge", "Attic"], vide: "No variant: select the outline, then « Compare another pitch »." });
    await p.h.appeler("demande", "commande.pente-minimale", { langue: "en" });
    expect(p.etat.envois.at(-1)).toMatchObject({ onglet: "pente" });
    await p.h.appeler("demande", "commande.ligne-hauteur", { langue: "en" });
    expect(p.etat.envois.at(-1)).toMatchObject({ onglet: "ligne", resultats: [{ libelle: "Roof", valeur: "Select a roof generated by this extension: the line is drawn in its attic.", ton: "alerte" }] });
    await p.h.appeler("demande", "commande.toiture-pans", { langue: "en" });
    expect(p.etat.envois.at(-1)).toMatchObject({ onglet: "pans", resultats: [{ libelle: "Outline", ton: "alerte" }] });
  });
});

describe("extension « Toitures et combles » — archivage en base du fichier chargé (protocole 1.2)", () => {
  it("le fichier est archivé avant d'être chargé ; sans archive, il n'est pas chargé et le motif est donné", async () => {
    expect(PAQUET.fiche.protocole).toBe("1.2");
    expect(PAQUET.code).toContain("{ archiver: true }");
    const p = planche(modeleVide());
    await chargerTable(p);
    expect(p.archives).toEqual(["pentes.json"]);
    expect(p.derniereAlerte()).toBe("");
    const q = planche(modeleVide());
    q.refuserArchive("connexion");
    await chargerTable(q);
    expect(q.derniereAlerte()).toBe("Chargement refusé : le fichier n'a pas pu être archivé en base (connexion requise)");
    expect(q.etat.avis.some((a) => a.texte.startsWith("Table des pentes chargée"))).toBe(false);
  });
});
