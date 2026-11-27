/** Protocole 1.4 : coupe horizontale, projection au sol et union servies à une extension (moteur simulé). */
import { describe, expect, it } from "vitest";
import { baliserOccurrences, modeleVide, type Id, type Modele } from "./geometrie-libre.js";
import type { Maillage } from "./maillage.js";
import type { AdaptateurBooleens, PolygonePlan } from "./outils/machine.js";
import { creerFonctionsPlanche } from "./scripts.js";
import { ajouterNiveau } from "./niveaux.js";
import { creerServicesExtension, type AccesPlanche, type PlansLus } from "./services-extensions.js";

/** Moteur simulé : chaque solide vaut son rectangle englobant ; l'union simulée garde les polygones tels quels. */
const boiteXY = (m: Maillage) => {
  const xs: number[] = [], ys: number[] = [], zs: number[] = [];
  for (let i = 0; i < m.positions.length; i += 3) xs.push(m.positions[i]!), ys.push(m.positions[i + 1]!), zs.push(m.positions[i + 2]!);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys), z0: Math.min(...zs), z1: Math.max(...zs) };
};
const rect = (b: ReturnType<typeof boiteXY>): PolygonePlan => ({ exterieur: [[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1]], trous: [] });
const appels: string[] = [];
const moteur: AdaptateurBooleens = {
  union: (a) => a,
  difference: (a) => a,
  intersection: (a) => a,
  plans: {
    coupe: (ms, h) => (appels.push(`coupe ${ms.length} ${h}`), ms.map(boiteXY).filter((b) => b.z0 < h && h < b.z1).map(rect)),
    projection: (ms) => (appels.push(`projection ${ms.length}`), ms.map(boiteXY).map(rect)),
    union: (ps) => (appels.push(`union ${ps.length}`), [...ps]),
  },
};

function planche(m: Modele, avecMoteur = true, permissions: string[] = ["modele.lire"]) {
  const acces: AccesPlanche = {
    modele: () => m,
    selection: () => [],
    dans: () => undefined,
    appliquer: () => true,
    selectionner: () => {},
    ...(avecMoteur ? { booleens: () => moteur } : {}),
  };
  return creerServicesExtension({ id: "essai", permissions: permissions as never }, acces);
}
const ok = <T>(r: { ok: boolean; resultat?: unknown }): T => {
  expect(r).toMatchObject({ ok: true });
  return (r as { resultat: T }).resultat;
};

/** Boîte 10 × 8 × 3 groupée ; composant 2 × 2 × 6 placé deux fois dans un groupe ; boîte ouverte ; une face libre. */
function depart() {
  const f = creerFonctionsPlanche(modeleVide());
  const batiment = f.api.grouper(f.api.boite([0, 0, 0], 10, 8, 3) as Id[], "Bâtiment") as Id;
  const tour = f.api.composant(f.api.boite([20, 0, 0], 2, 2, 6) as Id[], "Tour") as Id;
  const copie = (f.api.copier(tour, [5, 0, 0]) as Id[])[0]!;
  const ensemble = f.api.grouper([tour, copie], "Ensemble") as Id;
  const ouverte = f.api.boite([40, 0, 0], 1, 1, 1) as Id[];
  f.api.effacer(ouverte.filter((id) => f.api.genre(id) === "face").slice(0, 1));
  const ouvert = f.api.grouper(ouverte.filter((id) => f.existe(id)), "Ouvert") as Id;
  f.api.rectangle([60, 0, 0], [1, 0, 0], [0, 1, 0]);
  return { modele: f.modele(), batiment, tour, copie, ensemble, ouvert };
}

describe("protocole 1.4 : opérations planes", () => {
  it("coupe à 1 m du modèle entier : bâtiment et deux instances du composant, chacune à sa place ; boîte ouverte écartée avec son motif ; face libre signalée", () => {
    const d = depart();
    appels.length = 0;
    const r = ok<PlansLus>(planche(d.modele).servir("geometrie.coupe", { hauteur: 1 }));
    expect(r.solides.map((s) => [s.chemin.length, s.aire])).toEqual([[1, 80], [2, 4], [2, 4]]);
    expect(r.aire).toBeCloseTo(88, 9);
    expect(r.polygones.map((p) => p.exterieur[0])).toEqual([[0, 0], [20, 0], [25, 0]]);
    expect(r.ecartes).toHaveLength(1);
    expect(r.ecartes[0]).toMatchObject({ id: d.ouvert });
    expect(r.ecartes[0]!.motif).toMatch(/arête/);
    expect(r.facesLibres).toBe(1);
    // Une coupe de l'union, puis une par solide pour le détail.
    expect(appels).toEqual(["coupe 3 1", "coupe 1 1", "coupe 1 1", "coupe 1 1"]);
    // À 4 m, seules les deux tours sont coupées.
    expect(ok<PlansLus>(planche(d.modele).servir("geometrie.coupe", { hauteur: 4 })).aire).toBeCloseTo(8, 9);
  });
  it("projection des objets nommés ; un identifiant inconnu est refusé", () => {
    const d = depart();
    const r = ok<PlansLus>(planche(d.modele).servir("geometrie.projection", { objets: [d.ensemble] }));
    expect(r.aire).toBeCloseTo(8, 9);
    expect(r.facesLibres).toBe(0);
    expect(planche(d.modele).servir("geometrie.projection", { objets: ["inconnu"] })).toMatchObject({ ok: false, erreur: "objet_introuvable" });
  });
  it("union : polygones validés, aire nette (trous déduits) ; arguments faux refusés", () => {
    const s = planche(modeleVide());
    const r = ok<{ aire: number }>(s.servir("geometrie.union", { polygones: [{ exterieur: [[0, 0], [10, 0], [10, 10], [0, 10]], trous: [[[4, 4], [4, 6], [6, 6], [6, 4]]] }] }));
    expect(r.aire).toBeCloseTo(96, 9);
    expect(s.servir("geometrie.union", { polygones: [] })).toMatchObject({ ok: false, erreur: "argument_invalide" });
    expect(s.servir("geometrie.union", { polygones: [{ exterieur: [[0, 0], [1, 0]] }] })).toMatchObject({ ok: false, detail: expect.stringMatching(/exterieur/) });
    expect(s.servir("geometrie.union", { polygones: [{ exterieur: [[0, 0], [1, 0], [1, Number.NaN]] }] })).toMatchObject({ ok: false });
  });
  it("hauteur absente ou démesurée refusée ; moteur absent refusé ; coupe sans modele.lire refusée, union sans permission admise", () => {
    const d = depart();
    expect(planche(d.modele).servir("geometrie.coupe", {})).toMatchObject({ ok: false, erreur: "argument_invalide" });
    expect(planche(d.modele).servir("geometrie.coupe", { hauteur: 1e9 })).toMatchObject({ ok: false, erreur: "argument_invalide" });
    expect(planche(d.modele, false).servir("geometrie.coupe", { hauteur: 1 })).toMatchObject({ ok: false, detail: expect.stringMatching(/manifold-3d/) });
    expect(planche(d.modele, true, []).servir("geometrie.coupe", { hauteur: 1 })).toEqual({ ok: false, erreur: "permission_refusee", detail: "modele.lire" });
    expect(planche(d.modele, true, []).servir("geometrie.union", { polygones: [{ exterieur: [[0, 0], [1, 0], [1, 1]] }] })).toMatchObject({ ok: true });
  });
  it("niveaux.lire : niveaux du plus haut au plus bas et référence NGF (null si absente ou non finie) ; permission modele.lire", () => {
    let m = modeleVide();
    for (const [nom, altitude] of [["R+1", 3], ["RDC", 0]] as const) {
      const r = ajouterNiveau(m, { nom, altitude, hauteur: 3 });
      if (!r.ok) throw new Error(r.erreur);
      m = r.modele;
    }
    const lu = (ref?: number | null) =>
      creerServicesExtension({ id: "essai", permissions: ["modele.lire"] }, { modele: () => m, selection: () => [], dans: () => undefined, appliquer: () => true, selectionner: () => {}, ...(ref === undefined ? {} : { referenceNGF: () => ref }) }).servir("niveaux.lire", null);
    expect(ok<{ niveaux: { nom: string; altitude: number }[]; referenceNGF: number | null }>(lu(412.5))).toMatchObject({ niveaux: [{ nom: "R+1", altitude: 3, hauteur: 3 }, { nom: "RDC", altitude: 0, hauteur: 3 }], referenceNGF: 412.5 });
    expect(ok<{ referenceNGF: number | null }>(lu()).referenceNGF).toBeNull();
    expect(ok<{ referenceNGF: number | null }>(lu(Number.NaN)).referenceNGF).toBeNull();
    expect(planche(m, true, []).servir("niveaux.lire", null)).toEqual({ ok: false, erreur: "permission_refusee", detail: "modele.lire" });
  });
  it("chaque solide porte sa balise, ou celle de l'objet qui le contient", () => {
    const d = depart();
    const m = baliserOccurrences(baliserOccurrences(d.modele, [d.ensemble], "b-tours").modele, [d.batiment], "b-bati").modele;
    const r = ok<PlansLus>(planche(m).servir("geometrie.projection", {}));
    expect(r.solides.map((x) => x.balise)).toEqual(["b-bati", "b-tours", "b-tours"]);
    expect(ok<PlansLus>(planche(m).servir("geometrie.projection", { objets: [d.tour] })).solides[0]!.balise).toBe("b-tours");
  });
});
