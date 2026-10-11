/**
 * Lot L19 (cahier V1 B5.1, B5.2) : codes de diagnostic (EX-ERR-01), plafond de complexité (EX-PERF-02), extrusion
 * dans des contextes transformés (EX-MODEL-02, cas I-01 et I-02), sûreté des deltas forgés (EX-SEC-01), round-trip
 * d'empreinte (EX-SAVE-01, 03).
 */
import { describe, expect, it } from "vitest";
import { CODES_DIAGNOSTIC, ErreurPlanche, PLAFOND_TRIANGLES, codeDe, exigerComplexite } from "./diagnostics.js";
import { appliquerDeltaPlanche, differencePlanche, empreintePlanche, estDeltaPlanche, lireModelePlanche } from "./delta.js";
import {
  type Id,
  type Matrice4,
  type Modele,
  ERREUR_DISTANCE_NON_FINIE,
  ERREUR_REVOLUTION_AXE_NUL,
  ajouterPolygone,
  ajouterRectangle,
  ajouterSegment,
  appliquer,
  contexte,
  grouper,
  modeleVide,
  pousserTirer,
  revolution,
  suivezMoi,
  trianglesBalayage,
} from "./geometrie-libre.js";
import { ERREUR_CONTEXTE_DEFORME, pointsDe } from "./outils/commun-modif.js";
import { machinePousserTirer } from "./outils/pousser-tirer.js";
import type { ContexteOutil, EvenementOutil } from "./outils/machine.js";
import { clicVers, saisie, survolVers, touche } from "./outils/essais-modification.js";
import { type Vec3, dot, normalize, sub, v3 } from "./vecteur.js";

const piege = (f: () => unknown): unknown => {
  try {
    f();
  } catch (e) {
    return e;
  }
  return null;
};

describe("L19 — codes de diagnostic stables (EX-ERR-01)", () => {
  it("les 14 codes du cahier ; une ErreurPlanche reste une RangeError et garde son message français", () => {
    expect(CODES_DIAGNOSTIC).toHaveLength(14);
    const e = piege(() => pousserTirer(ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(1, 0, 0), v3(0, 1, 0)).modele, Object.keys(ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(1, 0, 0), v3(0, 1, 0)).modele.racine.faces)[0] as Id, Number.NaN));
    expect(e).toBeInstanceOf(RangeError);
    expect(e).toBeInstanceOf(ErreurPlanche);
    expect(codeDe(e)).toBe("EX_DISTANCE_INVALID");
    expect((e as Error).message).toBe(ERREUR_DISTANCE_NON_FINIE);
    expect(codeDe(new Error("brut"))).toBeNull();
  });

  it("révolution à axe nul → EX_AXIS_INVALID ; chemin ramifié → EX_PATH_BRANCH", () => {
    const m = ajouterRectangle(modeleVide(), v3(1, 0, 0), v3(1, 0, 0), v3(0, 0, 1)).modele;
    const p = Object.keys(m.racine.faces)[0] as Id;
    const e = piege(() => revolution(m, p, { origine: v3(0, 0, 0), direction: v3(0, 0, 0) }));
    expect(codeDe(e)).toBe("EX_AXIS_INVALID");
    expect((e as Error).message).toBe(ERREUR_REVOLUTION_AXE_NUL);
  });
});

describe("L19 — plafond de complexité (EX-PERF-02)", () => {
  it("estimation avant génération ; au-delà du plafond, refus nommé EX_COMPLEXITY_LIMIT sans géométrie produite", () => {
    expect(PLAFOND_TRIANGLES).toBe(2_000);
    expect(trianglesBalayage(4, 48, false)).toBe(384);
    expect(() => exigerComplexite(PLAFOND_TRIANGLES)).not.toThrow();
    expect(codeDe(piege(() => exigerComplexite(PLAFOND_TRIANGLES + 1)))).toBe("EX_COMPLEXITY_LIMIT");
    const m = ajouterRectangle(modeleVide(), v3(1, 0, 0), v3(1, 0, 0), v3(0, 0, 1)).modele;
    const p = Object.keys(m.racine.faces)[0] as Id;
    // 4 sommets × 128 segments × 2 = 1 024 triangles : refusé sous un plafond réglé à 1 000, accepté au plafond par défaut.
    const e = piege(() => revolution(m, p, { origine: v3(0, 0, 0), direction: v3(0, 0, 1) }, { segments: 128, plafondTriangles: 1000 }));
    expect(codeDe(e)).toBe("EX_COMPLEXITY_LIMIT");
    expect(() => revolution(m, p, { origine: v3(0, 0, 0), direction: v3(0, 0, 1) }, { segments: 24 })).not.toThrow();
  });

  it("Suivez-moi : le même plafond s'applique avant le balayage", () => {
    let m = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(4, 0, 0), v3(0, 3, 0)).modele;
    const chemin = Object.keys(m.racine.faces)[0] as Id;
    m = ajouterRectangle(m, v3(0, 0, 0), v3(0.4, 0, 0), v3(0, 0, 0.6)).modele;
    const profil = Object.keys(m.racine.faces).find((f) => f !== chemin) as Id;
    expect(codeDe(piege(() => suivezMoi(m, profil, { face: chemin }, { plafondTriangles: 10 })))).toBe("EX_COMPLEXITY_LIMIT");
  });
});

/** Groupe d'un rectangle 1 × 1 (coin à l'origine locale, dans le plan défini par a et b), occurrence transformée par M. */
function groupeTransforme(M: Matrice4, a: Vec3 = v3(1, 0, 0), b: Vec3 = v3(0, 1, 0)): { m: Modele; occ: Id; face: Id } {
  const r = ajouterRectangle(modeleVide(), v3(0, 0, 0), a, b).modele;
  const g = grouper(r, [...Object.keys(r.racine.faces), ...Object.keys(r.racine.aretes)]);
  const occ = g.occurrence;
  const o = g.modele.racine.occurrences[occ]!;
  const m: Modele = { ...g.modele, racine: { ...g.modele.racine, occurrences: { ...g.modele.racine.occurrences, [occ]: { ...o, transformation: M } } } };
  const face = Object.keys(contexte(m, occ).faces)[0] as Id;
  return { m, occ, face };
}

/** Pousser/Tirer joué dans le contexte `dans` : les événements donnés, dans l'ordre. */
function jouerDans(m: Modele, dans: Id, evs: readonly EvenementOutil[]) {
  let etat = machinePousserTirer.initial();
  let modele = m;
  const ctx = (): ContexteOutil => ({ modele, selection: [], separateurDecimal: ",", dans });
  for (const ev of evs) {
    const t = machinePousserTirer.traiter(etat, ev, ctx());
    etat = t.etat;
    if (t.modele) modele = t.modele;
  }
  return { modele, etat };
}

/** Pousser/Tirer joué dans le contexte `dans` : clic au centre monde de la face, puis distance tapée. */
const pousserDans = (m: Modele, dans: Id, centre: Vec3, normale: Vec3, texte: string) => jouerDans(m, dans, [clicVers(centre, normale), saisie(texte)]);

const epaisseur = (m: Modele, occ: Id, n: Vec3): number => {
  const pts = pointsDe(m, [occ]).map((p) => dot(p, n));
  return Math.max(...pts) - Math.min(...pts);
};

describe("L19 — extrusion dans un contexte transformé (EX-MODEL-02, I-01, I-02)", () => {
  const cas: [string, Matrice4][] = [
    ["translaté", [1, 0, 0, 5, 0, 1, 0, -2, 0, 0, 1, 1, 0, 0, 0, 1]],
    ["tourné de 90° autour de x", [1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1]],
    ["à l'échelle uniforme × 2", [2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 1]],
    ["en miroir (x ↦ −x)", [-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]],
  ];
  for (const [nom, M] of cas) {
    it(`I-01 — contexte ${nom} : « 1 » donne 1 m monde le long de la normale monde`, () => {
      const { m, occ } = groupeTransforme(M);
      const centre = appliquer(M, v3(0.5, 0.5, 0));
      const n = normalize(sub(appliquer(M, v3(0, 0, 1)), appliquer(M, v3(0, 0, 0))));
      const r = pousserDans(m, occ, centre, n, "1");
      expect(r.etat.erreur).toBeNull();
      expect(epaisseur(r.modele, occ, n)).toBeCloseTo(1, 9);
    });
  }

  it("I-02 — échelle non uniforme qui ne garde pas la normale : refus nommé EX_CONTEXT_TRANSFORM_UNSUPPORTED, modèle inchangé", () => {
    const M: Matrice4 = [2, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const s = Math.SQRT1_2;
    const { m, occ } = groupeTransforme(M, v3(s, -s, 0), v3(0, 0, 1));
    const centre = appliquer(M, v3(s / 2, -s / 2, 0.5));
    // Normale monde (transposée inverse) de la face de normale locale (1 ; 1 ; 0)/√2 : (1/2 ; 1 ; 0) normalisée.
    const n = normalize(v3(0.5, 1, 0));
    const r = pousserDans(m, occ, centre, n, "1");
    expect(r.etat.erreur).toContain(ERREUR_CONTEXTE_DEFORME);
    expect(r.modele).toBe(m);
  });

  it("échelle non uniforme qui garde la normale (face alignée) : dimension monde exacte", () => {
    const M: Matrice4 = [2, 0, 0, 0, 0, 1, 0, 0, 0, 0, 3, 0, 0, 0, 0, 1];
    const { m, occ } = groupeTransforme(M);
    const r = pousserDans(m, occ, appliquer(M, v3(0.5, 0.5, 0)), v3(0, 0, 1), "1");
    expect(r.etat.erreur).toBeNull();
    expect(epaisseur(r.modele, occ, v3(0, 0, 1))).toBeCloseTo(1, 9);
  });

  const DEUX: Matrice4 = [2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 1];
  const etendueX = (m: Modele, occ: Id): number => Math.max(...pointsDe(m, [occ]).map((p) => p.x));

  it("couronne dans un groupe × 2 : la distance tapée puis sa correction restent des mètres monde (revue de #132)", () => {
    // 24-gone de rayon 1 (sommet en (1 ; 0 ; 0)) groupé puis mis à l'échelle × 2 : rayon monde 2.
    const poly = ajouterPolygone(modeleVide(), v3(0, 0, 0), v3(0, 0, 1), 1, 24).modele;
    const g = grouper(poly, [...Object.keys(poly.racine.faces), ...Object.keys(poly.racine.aretes)]);
    const o = g.modele.racine.occurrences[g.occurrence]!;
    const m: Modele = { ...g.modele, racine: { ...g.modele.racine, occurrences: { ...g.modele.racine.occurrences, [g.occurrence]: { ...o, transformation: DEUX } } } };
    const occ = g.occurrence;
    const a = Math.PI / 24;
    const milieu = v3(2 * Math.cos(a) * Math.cos(a), 2 * Math.cos(a) * Math.sin(a), 0); // milieu monde de la première arête
    // Couronne vers l'extérieur de 0,5 m monde, puis correction « 1 » : le rayon monde d'un sommet vaut 2 + d / cos(π/24).
    const r = jouerDans(m, occ, [clicVers(milieu), survolVers(v3(3.2, 0.2, 0)), saisie("0,5")]);
    expect(r.etat.erreur).toBeNull();
    expect(etendueX(r.modele, occ)).toBeCloseTo(2 + 0.5 / Math.cos(a), 9);
    const c = jouerDans(m, occ, [clicVers(milieu), survolVers(v3(3.2, 0.2, 0)), saisie("0,5"), saisie("1")]);
    expect(c.etat.erreur).toBeNull();
    expect(etendueX(c.modele, occ)).toBeCloseTo(2 + 1 / Math.cos(a), 9);
  });

  it("allongement dans un groupe à l'échelle (1 ; 2 ; 1) : la longueur tapée puis sa correction restent des mètres monde (revue de #132)", () => {
    // Segment local (0 ; 0 ; 0) → (0 ; 1 ; 0) groupé puis étiré × 2 selon y : 2 m monde. L'allongement se mesure le long de
    // l'arête, exact même sous échelle non uniforme ; une direction oubliée (x par défaut) donnerait 6 m au lieu de 4.
    const M: Matrice4 = [1, 0, 0, 0, 0, 2, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const seg = ajouterSegment(modeleVide(), v3(0, 0, 0), v3(0, 1, 0)).modele;
    const g = grouper(seg, Object.keys(seg.racine.aretes));
    const o = g.modele.racine.occurrences[g.occurrence]!;
    const m: Modele = { ...g.modele, racine: { ...g.modele.racine, occurrences: { ...g.modele.racine.occurrences, [g.occurrence]: { ...o, transformation: M } } } };
    const occ = g.occurrence;
    const etendueY = (x: Modele): number => Math.max(...pointsDe(x, [occ]).map((q) => q.y));
    const r = jouerDans(m, occ, [clicVers(v3(0, 1.8, 0)), touche("FlecheBas"), survolVers(v3(0, 3, 0)), saisie("1")]);
    expect(r.etat.erreur).toBeNull();
    expect(etendueY(r.modele)).toBeCloseTo(3, 9);
    const c = jouerDans(m, occ, [clicVers(v3(0, 1.8, 0)), touche("FlecheBas"), survolVers(v3(0, 3, 0)), saisie("1"), saisie("2")]);
    expect(c.etat.erreur).toBeNull();
    expect(etendueY(c.modele)).toBeCloseTo(4, 9);
  });
});

describe("L19 — persistance et deltas forgés (EX-SAVE-01, 03 ; EX-SEC-01)", () => {
  it("application, correction, annulation : les empreintes du round-trip par delta concordent", () => {
    const m0 = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(1, 0, 0), v3(0, 1, 0)).modele;
    const f = Object.keys(m0.racine.faces)[0] as Id;
    const m1 = pousserTirer(m0, f, 1).modele;
    const m1b = pousserTirer(m0, f, 2).modele; // correction immédiate : remplace m1 depuis m0
    for (const [a, b] of [[m0, m1], [m0, m1b], [m1b, m0]] as const) {
      const d = differencePlanche(a, b);
      expect(estDeltaPlanche(d)).toBe(true);
      expect(empreintePlanche(appliquerDeltaPlanche(a, d!))).toBe(empreintePlanche(b));
    }
    // Relecture (réouverture) : même empreinte.
    expect(empreintePlanche(lireModelePlanche(JSON.parse(JSON.stringify(m1b))) as Modele)).toBe(empreintePlanche(m1b));
  });

  it("delta forgé : coordonnée non finie (1e400 → Infinity au JSON) ou référence pendante refusés", () => {
    const m0 = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(1, 0, 0), v3(0, 1, 0)).modele;
    const s = Object.keys(m0.racine.sommets)[0] as Id;
    const forge = JSON.parse(`{"racine":{"sommets":{"${s}":{"id":"${s}","position":{"x":1e400,"y":0,"z":0}}}}}`);
    expect(estDeltaPlanche(forge)).toBe(false);
    const pendante = { ...m0, racine: { ...m0.racine, occurrences: { o9: { id: "o9", definition: "d-inconnue", transformation: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] } } } };
    expect(lireModelePlanche(JSON.parse(JSON.stringify(pendante)))).toBeNull();
  });
});

describe("L19 — exports honnêtes (EX-SAVE-04, I-07)", () => {
  it("solide fermé : étanche, volume exact ; surface ouverte (Surface ouverte de Pousser/Tirer) : déclarée non étanche, sans volume", async () => {
    const { exporterObj, exporterStl } = await import("./echanges.js");
    const { maillagesPlanche } = await import("./representation.js");
    const { tuberFace } = await import("./geometrie-libre.js");
    // Boîte 1 × 1 × 1 groupée : un solide.
    const r = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(1, 0, 0), v3(0, 1, 0)).modele;
    const f = Object.keys(r.racine.faces)[0] as Id;
    const boite = pousserTirer(r, f, 1).modele;
    const g = grouper(boite, [...Object.keys(boite.racine.faces), ...Object.keys(boite.racine.aretes)]);
    const ms = maillagesPlanche(g.modele);
    expect(ms.filter((x) => x.solide)).toHaveLength(1);
    expect(ms.find((x) => x.solide)?.volume).toBeCloseTo(1, 9);
    expect(exporterStl(g.modele).nonEtanches).toBe(0);
    // Même boîte non groupée (géométrie libre de la racine, pas un « solide » reconnu) : fermée par sa topologie, donc
    // étanche à l'export (revue de #132) — et la face tirée de 1 m garde sa signature de boîte.
    expect(maillagesPlanche(boite).some((x) => x.solide)).toBe(false);
    expect(exporterObj(boite).nonEtanches).toBe(0);
    expect(exporterStl(boite).nonEtanches).toBe(0);
    // Surface ouverte : tube sans fond, aucun volume, compté non étanche à l'export.
    const t = tuberFace(r, f, 1).modele;
    const ouv = exporterObj(t);
    expect(ouv.nonEtanches).toBe(1);
    expect(maillagesPlanche(t).every((x) => x.volume === null)).toBe(true);
    expect(exporterStl(t).nonEtanches).toBe(1);
  });
});

describe("L19 — message d'outil et code détachable (EX-ERR-01)", () => {
  it("messageErreur suffixe le code ; separerDiagnostic le détache ; un message non codé reste entier", async () => {
    const { messageErreur, separerDiagnostic } = await import("./outils/commun-formes.js");
    const t = messageErreur(new ErreurPlanche("EX_AXIS_INVALID", ERREUR_REVOLUTION_AXE_NUL));
    expect(t).toBe(`Opération impossible : ${ERREUR_REVOLUTION_AXE_NUL} [EX_AXIS_INVALID]`);
    expect(separerDiagnostic(t)).toEqual({ message: `Opération impossible : ${ERREUR_REVOLUTION_AXE_NUL}`, code: "EX_AXIS_INVALID" });
    expect(separerDiagnostic("Texte libre [EX_INCONNU]")).toEqual({ message: "Texte libre [EX_INCONNU]", code: null });
  });
});
