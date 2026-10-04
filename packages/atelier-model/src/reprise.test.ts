import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CONTRAT_COMMANDES, appliquerLot, type Commande } from "./commandes/index.js";
import { importerModeleNatif, type JeuNatif } from "./import/natif.js";
import { modeleVide, objetsDeClasse, type ModeleAtelier, type Occurrence } from "./modele.js";
import { m, pt } from "./unites.js";
import { planifierReprise } from "./reprise.js";

const P118 = importerModeleNatif(JSON.parse(readFileSync(new URL("../../../apps/api/src/data/examples/p118-native-model.json", import.meta.url), "utf8")) as JeuNatif).modele;
const lot = (commands: Commande[], id = "c") => ({ requestId: id, baseRevision: 0, contract: CONTRAT_COMMANDES, label: id, commands });
const cible = (): ModeleAtelier =>
  appliquerLot(modeleVide(), lot([
    { type: "niveau.creer", params: { id: "n0", nom: "Rez", elevation: 0, hauteur: 3 } },
    { type: "calque.creer", params: { id: "c-murs", nom: "murs" } },
    { type: "mur.tracer", params: { id: "w-cible", niveauId: "n0", a: pt(100, 0), b: pt(104, 0), epaisseur: m(0.2), hauteur: m(3) } },
  ])).etat;
const origine = { projet: "p-118", nom: "P.118", revision: 1 };

describe("réutilisation de modèle (DA-21-09)", () => {
  it("architecture du RDC reprise : niveau apparié, identifiants nouveaux, hôtes remappés, provenance ; inverse exact", () => {
    const c = cible();
    const plan = planifierReprise(P118, c, { familles: ["architecture"], niveaux: ["rdc"], origine });
    expect(plan.rapport.niveaux).toEqual([{ source: "RDC", cible: "Rez", action: "apparie" }]);
    const r = appliquerLot(c, lot([plan.commande!], "reprise"));
    const mursSource = objetsDeClasse(P118, "mur", "rdc").length;
    const murs = objetsDeClasse(r.etat, "mur", "n0").filter((o) => o.id !== "w-cible");
    expect(murs).toHaveLength(mursSource);
    expect(murs.every((o) => o.id.startsWith("reprise-") && String(o.proprietes["reprise:origine"]?.valeur).includes("P.118"))).toBe(true);
    const portes = objetsDeClasse(r.etat, "porte") as Occurrence<"porte">[];
    expect(portes.length).toBe(objetsDeClasse(P118, "porte", "rdc").length);
    expect(portes.every((p) => r.etat.objets[p.params.murHoteId]?.classe === "mur" && p.params.murHoteId.startsWith("reprise-"))).toBe(true);
    expect(plan.rapport.homonymes).toContainEqual({ nature: "calque", nom: "Murs", action: "reutilise" });
    expect(murs.some((o) => o.calqueId === "c-murs")).toBe(true);
    expect(Object.values(r.etat.calques).filter((x) => x.nom.toLowerCase() === "murs")).toHaveLength(1);
    expect(r.effets.crees.length).toBeGreaterThan(mursSource);
    // Rien du site, des hypothèses ni des sources sans choix explicite.
    expect(r.etat.site.parcelle).toBeNull();
    expect(r.etat.site.hypotheses).toEqual([]);
    expect(appliquerLot(r.etat, lot([r.inverse], "inv")).etat).toEqual(c);
  });

  it("homonymes renommés sur demande ; cotes dont l'objet visé n'est pas repris → « à réparer » ; ouvertures sans leur mur → non reprises", () => {
    const c = cible();
    const dessin = planifierReprise(P118, c, { familles: ["dessin"], niveaux: ["rdc"], homonymes: "renommer", origine });
    const cotes = Object.values(P118.references).filter((x) => x.objetId && P118.objets[x.proprietaireId]?.niveauId === "rdc");
    expect(dessin.rapport.aReparer.length).toBe(cotes.length);
    const r = appliquerLot(c, lot([dessin.commande!], "d")).etat;
    expect(Object.values(r.references).filter((x) => x.etat === "a-reparer").length).toBe(cotes.length);
    const archi = planifierReprise(P118, c, { familles: ["architecture"], niveaux: ["rdc"], homonymes: "renommer", origine });
    expect(archi.rapport.homonymes.some((h) => h.action === "renomme" && h.nom === "Murs")).toBe(true);
    const r2 = appliquerLot(c, lot([archi.commande!], "a")).etat;
    expect(Object.values(r2.calques).map((x) => x.nom)).toContain("Murs (reprise)");
    // Sans les murs (famille « espaces » seule) aucune ouverture n'est reprise.
    expect(planifierReprise(P118, c, { familles: ["espaces"], niveaux: ["rdc"], origine }).rapport.parClasse.every((x) => !["porte", "fenetre"].includes(x.classe))).toBe(true);
  });

  it("site et hypothèses seulement cochés ; une parcelle cible n'est jamais écrasée ; rien à reprendre = pas de commande ; doublon refusé", () => {
    const vide = appliquerLot(modeleVide(), lot([{ type: "niveau.creer", params: { id: "n0", nom: "Rez", elevation: 0 } }])).etat;
    const p = planifierReprise(P118, vide, { familles: [], site: true, hypotheses: true, origine });
    const r = appliquerLot(vide, lot([p.commande!], "s")).etat;
    expect(r.site.parcelle).toEqual(P118.site.parcelle);
    expect(r.site.hypotheses.length).toBe(P118.site.hypotheses.length);
    expect(planifierReprise(P118, r, { familles: [], site: true, origine }).rapport.remarques[0]).toMatch(/conservée/);
    expect(planifierReprise(P118, vide, { familles: [], origine }).commande).toBeNull();
    const plan = planifierReprise(P118, vide, { familles: ["architecture"], niveaux: ["mezz"], origine });
    const une = appliquerLot(vide, lot([plan.commande!], "x")).etat;
    expect(() => appliquerLot(une, lot([plan.commande!], "y"))).toThrow(/déjà présent/);
  });

  it("sélection spatiale : seuls les objets entièrement dans le rectangle ; les ouvertures suivent leur mur ; dit au rapport", () => {
    const c = cible();
    const tous = planifierReprise(P118, c, { familles: ["architecture"], niveaux: ["rdc"], origine });
    const murs = objetsDeClasse(P118, "mur", "rdc") as Occurrence<"mur">[];
    const xs = murs.flatMap((m2) => [m2.params.a.x, m2.params.b.x]).sort((a, b) => a - b);
    const xMedian = xs[Math.floor(xs.length / 2)]!;
    const zone = { min: { x: -1000, y: -1000 }, max: { x: xMedian, y: 1000 } };
    const partiel = planifierReprise(P118, c, { familles: ["architecture"], niveaux: ["rdc"], origine, zone });
    const ajoutes = Object.values((partiel.commande!.params["ajouts"] as { objets: Record<string, Occurrence<"mur">> }).objets);
    const mursRepris = ajoutes.filter((o) => o.classe === "mur");
    expect(mursRepris.length).toBeGreaterThan(0);
    expect(mursRepris.length).toBeLessThan(murs.length);
    expect(mursRepris.every((o) => o.params.a.x <= xMedian && o.params.b.x <= xMedian)).toBe(true);
    expect(Object.keys((tous.commande!.params["ajouts"] as { objets: Record<string, unknown> }).objets).length).toBeGreaterThan(ajoutes.length);
    expect(partiel.rapport.remarques.some((r) => /Sélection spatiale/.test(r))).toBe(true);
    const r = appliquerLot(c, lot([partiel.commande!], "z"));
    expect(objetsDeClasse(r.etat, "mur").length).toBe(mursRepris.length + 1);
  });

  it("bibliothèque partagée : définitions reprises sans occurrence (types, blocs), filtre par bibliothèque, calques du contenu remappés", () => {
    const biblio = appliquerLot(modeleVide(), lot([
      { type: "niveau.creer", params: { id: "n", nom: "N", elevation: 0 } },
      { type: "calque.creer", params: { id: "c-mob", nom: "Mobilier" } },
      { type: "type.definir", params: { id: "ext", classe: "mur", nom: "Mur extérieur", params: { couches: [{ materiau: "Béton", epaisseur: m(0.2) }] } } },
      { type: "esquisse.ligne", params: { id: "e1", niveauId: "n", points: [pt(0, 0), pt(1, 0)], calqueId: "c-mob" } },
      { type: "bloc.definir", params: { id: "table", nom: "Table", cibles: ["e1"], pointDeBase: pt(0, 0), bibliotheque: "Mobilier" } },
      { type: "bloc.definir", params: { id: "wc", nom: "WC", cibles: ["e1"], pointDeBase: pt(0, 0), bibliotheque: "Sanitaires" } },
    ])).etat;
    const c = cible();
    const tout = planifierReprise(biblio, c, { familles: ["definitions"], origine });
    const r = appliquerLot(c, lot([tout.commande!], "b")).etat;
    expect(Object.values(r.definitions).map((d) => d.nom).sort()).toEqual(["Mur extérieur", "Table", "WC"]);
    expect(objetsDeClasse(r, "esquisse")).toHaveLength(0); // aucune occurrence n'est reprise
    const table = Object.values(r.definitions).find((d) => d.nom === "Table")!;
    const calque = (table.params as { contenu: { calqueId: string | null }[] }).contenu[0]!.calqueId!;
    expect(r.calques[calque]!.nom).toBe("Mobilier");
    expect(tout.rapport.remarques.some((x) => /3 définition/.test(x))).toBe(true);
    const seule = planifierReprise(biblio, c, { familles: ["definitions"], bibliotheque: "Sanitaires", origine });
    const r2 = appliquerLot(c, lot([seule.commande!], "s")).etat;
    expect(Object.values(r2.definitions).map((d) => d.nom)).toEqual(["WC"]);
    // Homonyme réutilisé : la définition existante de la cible est gardée, rien n'est dupliqué.
    const encore = planifierReprise(biblio, r, { familles: ["definitions"], origine });
    expect(encore.rapport.homonymes.filter((h) => h.action === "reutilise")).toHaveLength(3);
  });
});
