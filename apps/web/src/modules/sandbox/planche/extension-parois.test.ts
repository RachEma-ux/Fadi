/**
 * Extension « Parois, baies et structure » (catalogue des extensions, cas 1 de la feuille de route, extension n° 5 ;
 * maquette validée le 27 novembre 2026) : le paquet livré dans `apps/web/extensions/parois/` passe l'import
 * de l'administrateur, puis tourne dans le vrai exécutant, servi par les vrais services de la Planche sur un vrai modèle.
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ajouterRectangle, ajouterSegment, appliquer, contexte, creerExecutantExtension, creerFonctionsPlanche, jugerImportPaquet, modeleVide, v3, type AccesPlanche, type AvisExtension, type ExecutantExtension, type Id, type Modele, type PaquetExtension, type ValeursSaisie } from "@parcours/sandbox-planche-model";
import { creerHoteExtension, type WorkerExtension } from "./hote-extensions";

const DOSSIER = "../../../../extensions/parois/";
const lire = (chemin: string) => readFileSync(fileURLToPath(new URL(DOSSIER + chemin, import.meta.url)), "utf8");
const PAQUET = JSON.parse(lire("parois.fadi-addon.json")) as PaquetExtension;

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
    const r = await h.appeler("demande", `panneau.parois.${nom}`, { langue: "fr", ...donnees });
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

/** Mur modelé en faces : une boîte de 4 × 0,30 × 2,50 m posée en (x, y) ; rend le modèle et la face côté y bas. */
function mur(m: Modele = modeleVide(), x = 0, y = 0, longueur = 4): { modele: Modele; face: Id } {
  const f = creerFonctionsPlanche(m);
  f.api.boite([x, y, 0], longueur, 0.3, 2.5);
  const modele = f.modele();
  const face = Object.entries(modele.racine.faces).find(([id, v]) => !m.racine.faces[id] && v.normale.y < -0.99)![0];
  return { modele, face };
}
const facesRacine = (m: Modele) => Object.values(m.racine.faces);
const aretes = (m: Modele) => Object.keys(m.racine.aretes);

/** Bibliothèque d'essai : types fictifs, propres au test (aucun type ni épaisseur n'est dans l'extension). */
const TYPES_ESSAI = {
  format: "fadi-types-parois/1",
  types: [
    { id: "c72", nom: "Cloison d'essai 72", epaisseur: 0.072, ossature: "ossature d'essai", plaques: "1 plaque de chaque côté" },
    { id: "d100", nom: "Doublage d'essai", epaisseur: 0.1 },
  ],
};
const BAIE = { baie: "1,40 ; 1,20 ; 0,95", depuis: "bas", decalage: "" };

describe("extension « Parois, baies et structure » — paquet", () => {
  it("le paquet versionné est exactement l'assemblage de ses sources", () => {
    expect(PAQUET).toEqual(assembler());
  });

  it("passe l'import de l'administrateur : forme, une icône et un raccourci par commande (règle d'or)", () => {
    expect(jugerImportPaquet(PAQUET)).toMatchObject({ ok: true });
    const icones = [...PAQUET.fiche.commandes.map((c) => c.icone), ...PAQUET.fiche.panneaux.map((p) => p.icone)];
    expect(icones.every((i) => typeof i === "string" && PAQUET.pages[i!]?.startsWith("<svg"))).toBe(true);
    expect(new Set(icones).size).toBe(icones.length);
    expect(PAQUET.fiche.commandes.map((c) => c.raccourci)).toEqual(["Ctrl+Alt+P", "Alt+Maj+F1", "Alt+Maj+F2", "Alt+Maj+F3", "Alt+Maj+F4", "Alt+Maj+F5", "Alt+Maj+F6"]);
  });

  it("aucun nom de produit tiers ; chaque bouton de la page appelle une action que le code traite", () => {
    expect(JSON.stringify(PAQUET)).not.toMatch(/sketchup/i);
    const actions = [...PAQUET.pages["panneau.js"]!.matchAll(/action: "([a-z-]+)"/g)].map((m) => m[1]);
    expect(actions.length).toBe(10);
    for (const a of actions) expect(PAQUET.code).toContain(`action("${a}"`);
  });
});

describe("extension « Parois, baies et structure » — cloisons (n° 11)", () => {
  it("bibliothèque d'agence chargée ; une cloison par arête sélectionnée, groupée avec son métré ; total par type", async () => {
    let m = ajouterSegment(modeleVide(), v3(0, 0, 0), v3(4, 0, 0)).modele;
    m = ajouterSegment(m, v3(4, 0, 0), v3(4, 3, 0)).modele;
    const p = planche(m);
    p.etat.selection = aretes(m);
    await p.action("poser-cloisons", { onglet: "cloisons", valeurs: { hauteur: "2,50" } });
    expect(p.derniereAlerte()).toBe("Chargez d'abord la bibliothèque des types de paroi de l'agence.");
    p.fichierAOuvrir({ nom: "types.json", texte: JSON.stringify({ ...TYPES_ESSAI, types: [{ id: "x", nom: "Sans épaisseur" }] }) });
    await p.action("charger-types", { onglet: "cloisons" });
    expect(p.derniereAlerte()).toMatch(/^Bibliothèque refusée : type 1 : .*épaisseur/);
    p.fichierAOuvrir({ nom: "types.json", texte: JSON.stringify(TYPES_ESSAI) });
    let e = await p.action("charger-types", { onglet: "cloisons" });
    expect(e.formulaire[0]).toMatchObject({ id: "type", valeur: "c72", choix: [{ valeur: "c72", libelle: "Cloison d'essai 72 — 7,2 cm, ossature d'essai, 1 plaque de chaque côté" }, { valeur: "d100", libelle: "Doublage d'essai — 10 cm" }] });
    p.etat.selection = aretes(p.etat.modele);
    e = await p.action("poser-cloisons", { onglet: "cloisons", valeurs: { type: "c72", hauteur: "2,50", position: "axe" } });
    expect(p.etat.pas).toEqual(["Bibliothèque des types de paroi", "Poser des cloisons"]);
    const objets = occurrences(p.etat.modele);
    expect(objets.map((o) => nomDefinition(p.etat.modele, o.id)).sort()).toEqual(["Cloison Cloison d'essai 72 — 3,00 m", "Cloison Cloison d'essai 72 — 4,00 m"]);
    const premiere = objets.find((o) => nomDefinition(p.etat.modele, o.id).endsWith("4,00 m"))!;
    const pts = facesMonde(p.etat.modele, premiere.id).flatMap((f) => f.points);
    const borne = (k: 0 | 1 | 2) => [Math.min(...pts.map((q) => q[k])), Math.max(...pts.map((q) => q[k]))].map((v) => Math.round(v * 1e6) / 1e6);
    expect([borne(0), borne(1), borne(2)]).toEqual([[0, 4], [-0.036, 0.036], [0, 2.5]]);
    expect(e.lignes[0]!.cellules).toEqual(["Cloison d'essai 72 · 2", "7,00 m", "", "17,50 m²"]);
    expect(e.lignes.slice(1).map((l) => l.cellules).sort()).toEqual([
      ["Cloison Cloison d'essai 72 — 3,00 m", "3,00 m", "2,50 m", "7,50 m²"],
      ["Cloison Cloison d'essai 72 — 4,00 m", "4,00 m", "2,50 m", "10,00 m²"],
    ]);
    expect(e.lignes).toHaveLength(3);
    expect(e.pied).toEqual(["Total · 2 cloisons", "", "", "17,50 m²"]);
  });
});

describe("extension « Parois, baies et structure » — baies (n° 13) et mur porteur percé (n° 35)", () => {
  it("perce une baie centrée à travers la paroi en un pas : épaisseur traversée lue sur la face opposée", async () => {
    const { modele, face } = mur();
    const p = planche(modele);
    p.etat.selection = [face];
    const e = await p.action("etat", { onglet: "baies", valeurs: BAIE });
    expect(e.resultats).toEqual([
      { libelle: "Épaisseur traversée (face opposée)", valeur: "0,30 m", ton: "" },
      { libelle: "Mur", valeur: "non qualifié", ton: "" },
    ]);
    expect(e.encart).toBeNull();
    await p.action("percer-baie", { onglet: "baies", valeurs: BAIE });
    expect(p.derniereAlerte()).toBe("");
    expect(p.etat.pas).toEqual(["Percer une baie"]);
    const faces = facesRacine(p.etat.modele);
    expect(faces).toHaveLength(10);
    expect(faces.filter((f) => f.trous.length === 1)).toHaveLength(2);
    const tableaux = faces.filter((f) => !modele.racine.faces[f.id]);
    const pts = tableaux.flatMap((f) => f.exterieur.map((s) => p.etat.modele.racine.sommets[s]!.position));
    expect([Math.min(...pts.map((q) => q.x)), Math.max(...pts.map((q) => q.x)), Math.min(...pts.map((q) => q.z)), Math.max(...pts.map((q) => q.z))].map((v) => Math.round(v * 1e6) / 1e6)).toEqual([1.3, 2.7, 0.95, 2.15]);
  });

  it("refus nommés : baie hors de la face, paroi sans face opposée, saisie illisible ; rien n'est modifié", async () => {
    const { modele, face } = mur();
    const p = planche(modele);
    p.etat.selection = [face];
    await p.action("percer-baie", { onglet: "baies", valeurs: { ...BAIE, baie: "1,40 ; 1,20 ; 1,50" } });
    expect(p.derniereAlerte()).toBe("La baie sort de la face du mur : réduisez-la ou déplacez-la.");
    await p.action("percer-baie", { onglet: "baies", valeurs: { ...BAIE, decalage: "3" } });
    expect(p.derniereAlerte()).toBe("La baie sort de la face du mur : réduisez-la ou déplacez-la.");
    await p.action("percer-baie", { onglet: "baies", valeurs: { ...BAIE, baie: "1,40 ; 1,20" } });
    expect(p.derniereAlerte()).toMatch(/^Saisissez largeur ; hauteur ; allège/);
    const seule = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(4, 0, 0), v3(0, 0, 2.5)).modele;
    const q = planche(seule);
    q.etat.selection = Object.keys(seule.racine.faces);
    await q.action("percer-baie", { onglet: "baies", valeurs: BAIE });
    expect(q.derniereAlerte()).toMatch(/^Aucune face opposée/);
    expect([p.etat.pas, q.etat.pas]).toEqual([[], []]);
  });

  it("deux murs alignés qui se touchent par un bord restent deux murs : la qualification de l'un n'est pas prêtée à l'autre", async () => {
    const a = mur();
    const b = mur(a.modele, 4, 0, 4);
    const p = planche(b.modele);
    p.etat.selection = [a.face];
    await p.action("marquer-mur", { onglet: "porteur", valeurs: { etat: "existant", porteur: "oui", nom: "Mur sur rue" } });
    expect(valeur(await p.action("etat", { onglet: "baies", valeurs: BAIE }), "Mur")).toBe("existant, porteur");
    p.etat.selection = [b.face];
    expect(valeur(await p.action("etat", { onglet: "baies", valeurs: BAIE }), "Mur")).toBe("non qualifié");
  });

  it("une face plus proche mais ailleurs (hors de l'étendue du mur) n'est pas prise pour la face opposée", async () => {
    const { modele, face } = mur();
    // Panneau à 0,10 m derrière le plan du mur, mais à côté de lui (x de 6 à 8), tourné vers lui.
    const avec = [ajouterRectangle(modele, v3(6, 0.1, 0), v3(2, 0, 0), v3(0, 0, 2.5)).modele, ajouterRectangle(modele, v3(6, 0.1, 0), v3(0, 0, 2.5), v3(2, 0, 0)).modele];
    const m = avec.find((x) => Object.entries(x.racine.faces).some(([id, f]) => !modele.racine.faces[id] && f.normale.y > 0.99))!;
    const p = planche(m);
    p.etat.selection = [face];
    const e = await p.action("etat", { onglet: "baies", valeurs: BAIE });
    expect(valeur(e, "Épaisseur traversée (face opposée)")).toBe("0,30 m");
    await p.action("percer-baie", { onglet: "baies", valeurs: BAIE });
    expect(p.derniereAlerte()).toBe("");
    expect(p.etat.pas).toEqual(["Percer une baie"]);
  });

  it("mur marqué existant et porteur : incidences signalées, intervention consignée, relevé exporté ; la Planche ne calcule rien", async () => {
    const { modele, face } = mur();
    const p = planche(modele);
    p.etat.selection = [face];
    await p.action("marquer-mur", { onglet: "porteur", valeurs: { etat: "existant", porteur: "oui", nom: "Mur sur rue" } });
    expect(p.etat.pas).toEqual(["Marquer un mur"]);
    let e = await p.action("etat", { onglet: "baies", valeurs: BAIE });
    expect(valeur(e, "Mur")).toBe("existant, porteur");
    expect(e.encart).toBe("Ouverture dans un mur porteur existant : 1,40 m créés. Points à faire valider : linteau ou poutre, appuis, descente de charges, avis du bureau d'études structure. La Planche ne calcule rien.");
    await p.action("consigner-intervention", { onglet: "baies" });
    expect(p.derniereAlerte()).toMatch(/^Percez d'abord une baie/);
    await p.action("percer-baie", { onglet: "baies", valeurs: BAIE });
    // Le mur garde sa qualification après le perçage (même plan, même endroit).
    p.etat.selection = [face];
    e = await p.action("consigner-intervention", { onglet: "baies", valeurs: BAIE });
    expect(valeur(e, "Mur")).toBe("existant, porteur");
    e = await p.action("etat", { onglet: "porteur" });
    expect(valeur(e, "Mur")).toBe("Mur sur rue — existant, porteur");
    expect(e.lignes.map((l) => l.cellules.slice(1))).toEqual([["1,40 × 1,20 m, allège 0,95 m", "Mur sur rue (existant, porteur)", "linteau ou poutre, appuis, descente de charges, avis du bureau d'études structure"]]);
    await p.action("exporter-releve", { onglet: "porteur" });
    const f = p.etat.fichiers[0]!;
    expect(f.nom).toMatch(/^interventions-murs-\d{4}-\d{2}-\d{2}\.md$/);
    expect(f.texte).toContain("| Mur sur rue |");
    expect(f.texte).toContain("La Planche ne calcule rien");
  });
});

describe("extension « Parois, baies et structure » — poteaux et poutres (n° 38)", () => {
  it("trame nommée A–C × 1–2 reportée sur deux niveaux ; métré des poteaux et des poutres ; sections saisies", async () => {
    const p = planche(modeleVide());
    const T = { entraxesX: "5 ; 5", entraxesY: "6", poteau: "0,30 × 0,30", poutre: "0,20 × 0,50", hauteurEtage: "3", etages: "2" };
    const e = await p.action("etat", { onglet: "structure", valeurs: T });
    expect(valeur(e, "Trame")).toBe("A–C × 1–2, 2 niveaux");
    expect(e.lignes.map((l) => l.cellules)).toEqual([["Poteaux", "12", "0,30 × 0,30", "30,00 m"], ["Poutres", "14", "0,20 × 0,50", "76,00 m"]]);
    await p.action("poser-trame", { onglet: "structure", valeurs: T });
    expect(p.etat.pas).toEqual(["Poser une trame"]);
    const [trame] = occurrences(p.etat.modele);
    expect(nomDefinition(p.etat.modele, trame!.id)).toBe("Structure — trame A–C × 1–2, 2 niveaux");
    const contenu = p.etat.modele.definitions[trame!.definition]!.contenu;
    const niveaux = Object.values(contenu.occurrences);
    expect(niveaux.map((o) => p.etat.modele.definitions[o.definition]!.nom).sort()).toEqual(["Niveau 1", "Niveau 2"]);
    const n1 = niveaux.find((o) => p.etat.modele.definitions[o.definition]!.nom === "Niveau 1")!;
    const noms = Object.values(p.etat.modele.definitions[n1.definition]!.contenu.occurrences).map((o) => p.etat.modele.definitions[o.definition]!.nom);
    expect(noms).toHaveLength(13);
    expect(noms).toContain("Poteau B2 · niveau 1");
    expect(noms).toContain("Poutre A1–B1 · niveau 1");
    expect(noms).toContain("Poutre C1–C2 · niveau 1");
    const pts = facesMonde(p.etat.modele, trame!.id).flatMap((f) => f.points);
    expect(Math.max(...pts.map((q) => q[2]))).toBeCloseTo(6, 9);
    expect(Object.keys(p.etat.modele.racine.faces)).toEqual([]);
  });

  it("saisie incomplète ou poutre plus haute que l'étage : refus nommé, rien n'est posé", async () => {
    const p = planche(modeleVide());
    await p.action("poser-trame", { onglet: "structure", valeurs: { entraxesX: "5", entraxesY: "6", poteau: "0,3", poutre: "0,2 × 0,5", hauteurEtage: "3", etages: "1" } });
    expect(p.derniereAlerte()).toMatch(/^Saisissez les entraxes/);
    await p.action("poser-trame", { onglet: "structure", valeurs: { entraxesX: "5", entraxesY: "6", poteau: "0,3 × 0,3", poutre: "0,2 × 3", hauteurEtage: "3", etages: "1" } });
    expect(p.derniereAlerte()).toBe("La hauteur de poutre doit être inférieure à la hauteur d'étage.");
    expect(p.etat.pas).toEqual([]);
  });
});

describe("extension « Parois, baies et structure » — fronts mitoyens (n° 28) et mur en limite (n° 39)", () => {
  it("façades le long du contour d'îlot ; un côté déclaré en limite séparative interdit les baies", async () => {
    const ilot = contour(10, 8, 0);
    const p = planche(ilot.modele);
    p.etat.selection = [ilot.face];
    let e = await p.action("etat", { onglet: "fronts", valeurs: { hauteurFacades: "9" } });
    expect(e.lignes.map((l) => l.cellules)).toEqual([["Côté 1", "10,00 m", "non"], ["Côté 2", "8,00 m", "non"], ["Côté 3", "10,00 m", "non"], ["Côté 4", "8,00 m", "non"]]);
    e = await p.action("choisir", { onglet: "fronts", id: "c0", valeurs: { hauteurFacades: "9" } });
    expect(e.lignes[0]).toMatchObject({ choisi: true, cellules: ["Côté 1", "10,00 m", "oui"] });
    await p.action("generer-fronts", { onglet: "fronts", valeurs: { hauteurFacades: "9" } });
    expect(p.derniereAlerte()).toBe("");
    expect(p.etat.pas).toEqual(["Générer des façades mitoyennes"]);
    expect(Object.keys(p.etat.modele.racine.faces)).toEqual([ilot.face]);
    const [fronts] = occurrences(p.etat.modele);
    const facades = Object.values(p.etat.modele.definitions[fronts!.definition]!.contenu.occurrences).map((o) => p.etat.modele.definitions[o.definition]!.nom);
    expect(facades.sort()).toEqual(["Façade 1 — limite séparative", "Façade 2", "Façade 3", "Façade 4"]);
    // Un mur posé contre le côté 1 (même plan) : la baie y est refusée.
    const contre = mur(p.etat.modele, 2, 0);
    p.etat.modele = contre.modele;
    p.etat.selection = [contre.face];
    e = await p.action("etat", { onglet: "baies", valeurs: BAIE });
    expect(e.encart).toMatch(/^Mur en limite séparative/);
    await p.action("percer-baie", { onglet: "baies", valeurs: BAIE });
    expect(p.derniereAlerte()).toMatch(/^Mur en limite séparative/);
    expect(p.etat.pas).toEqual(["Générer des façades mitoyennes"]);
  });

  it("qualifie un mur en limite avec son héberge ; une extension plus haute est signalée ; la Planche ne tranche rien", async () => {
    const { modele, face } = mur();
    const p = planche(modele);
    p.etat.selection = [face];
    await p.action("qualifier-mur", { onglet: "limite", valeurs: { qualification: "voisin", heberge: "6", extension: "7,20" } });
    expect(p.etat.pas).toEqual(["Qualifier un mur"]);
    let e = await p.action("etat", { onglet: "limite" });
    expect(e.resultats).toEqual([
      { libelle: "Mur", valeur: "Mur 1 — privatif du voisin" },
      { libelle: "Héberge", valeur: "6,00 m" },
      { libelle: "Extension", valeur: "surélévation de 1,20 m au-dessus de l'héberge", ton: "alerte" },
    ]);
    expect(e.encart).toMatch(/^Adossement contre un mur privatif du voisin.*La Planche ne tranche rien\.$/);
    await p.action("qualifier-mur", { onglet: "limite", valeurs: { qualification: "mitoyen", heberge: "6", extension: "5,5" } });
    e = await p.action("etat", { onglet: "limite" });
    expect(valeur(e, "Extension")).toBe("adossement sous l'héberge (0,50 m de marge)");
    expect(valeur(e, "Mur")).toBe("Mur 1 — mitoyen");
  });
});

describe("extension « Parois, baies et structure » — commandes et langue", () => {
  it("Ctrl+Alt+P ouvre le panneau sur Baies ; chaque commande ouvre son onglet ; textes en anglais", async () => {
    const p = planche(modeleVide());
    await p.h.appeler("demande", "commande.ouvrir-panneau", { langue: "fr" });
    expect(p.etat.ouverts).toEqual(["parois"]);
    expect(p.etat.envois.at(-1)).toMatchObject({ onglet: "baies" });
    for (const [c, o] of [["cloisons", "cloisons"], ["mur-porteur", "porteur"], ["poteaux-poutres", "structure"], ["fronts-mitoyens", "fronts"], ["mur-limite", "limite"], ["baies", "baies"]] as const) {
      await p.h.appeler("demande", `commande.${c}`, { langue: "en" });
      expect(p.etat.envois.at(-1)).toMatchObject({ onglet: o });
    }
    expect(p.etat.envois.at(-1)).toMatchObject({ resultats: [{ libelle: "Wall", valeur: "Select a single wall face.", ton: "alerte" }] });
  });
});
