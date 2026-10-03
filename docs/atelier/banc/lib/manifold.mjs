// Booléens de maillage manifold-3d (Apache-2.0) : mur − ouvertures.
// 1) Les 220 murs de P.118 avec leurs 210 ouvertures (données réelles, repère local m).
// 2) Cas de robustesse synthétiques déclarés (coplanarité, affleurement, dépassement, chevauchement,
//    grandes coordonnées, dégénérescence). Un maillage n'est pas une B-Rep (voir fiche DA-04).
import { resume, arrondi } from "./stats.mjs";
import { versionPaquet } from "./paquets.mjs";

const MARGE = 0.01; // m, débord du volume de découpe au-delà des faces traversées (variante « avec marges »)

/** Volume d'intersection de deux boîtes alignées [x0,x1]×[y0,y1]×[z0,z1]. */
function interBoites(a, b) {
  const d = (i) => Math.max(0, Math.min(a[i][1], b[i][1]) - Math.max(a[i][0], b[i][0]));
  return d(0) * d(1) * d(2);
}

/**
 * Calcule mur − ouvertures dans le repère du mur, puis place le résultat (rotation + translation).
 * `ouvertures` : { x0, x1, z0, z1, y0?, y1? } en repère mur (x le long de l'axe, y en travers, z vertical).
 */
function murMoinsOuvertures(M, { longueur, epaisseur, hauteur, origine = [0, 0, 0], angleDeg = 0, ouvertures, marges, genreAttendu: genreImpose }) {
  const e2 = epaisseur / 2;
  const boiteMur = [[0, longueur], [-e2, e2], [0, hauteur]];
  const coupes = ouvertures.map((o) => {
    let { x0, x1, z0, z1 } = o;
    let y0 = o.y0 ?? -e2 - MARGE;
    let y1 = o.y1 ?? e2 + MARGE;
    if (marges) {
      // Si la découpe touche une face du mur, on la prolonge au-delà (pas de face coplanaire).
      if (z0 <= 0) z0 = -MARGE;
      if (z1 >= hauteur) z1 = hauteur + MARGE;
      if (x0 <= 0) x0 = -MARGE;
      if (x1 >= longueur) x1 = longueur + MARGE;
      y0 = Math.min(y0, -e2 - MARGE);
      y1 = Math.max(y1, e2 + MARGE);
    }
    return [[x0, x1], [y0, y1], [z0, z1]];
  });
  // Volume attendu : exact si les découpes ne se chevauchent pas ; sinon déclaré non calculable simplement.
  let chevauchement = false;
  for (let i = 0; i < coupes.length; i++) for (let j = i + 1; j < coupes.length; j++) if (interBoites(coupes[i], coupes[j]) > 0) chevauchement = true;
  const vMur = longueur * epaisseur * hauteur;
  let attendu = chevauchement ? null : vMur - coupes.reduce((s, c) => s + interBoites(boiteMur, c), 0);
  if (chevauchement && coupes.length === 2) {
    // Inclusion-exclusion pour deux découpes qui se chevauchent.
    const [c1, c2] = coupes;
    const c12 = [0, 1, 2].map((i) => [Math.max(c1[i][0], c2[i][0]), Math.min(c1[i][1], c2[i][1])]);
    attendu = vMur - (interBoites(boiteMur, c1) + interBoites(boiteMur, c2) - interBoites(boiteMur, c12));
  }
  // Genre attendu : une découpe strictement intérieure en x et z qui traverse toute l'épaisseur = un trou.
  const genreAttendu = genreImpose != null ? genreImpose : chevauchement ? null : coupes.filter((c) => c[0][0] > 0 && c[0][1] < longueur && c[2][0] > 0 && c[2][1] < hauteur && c[1][0] <= -e2 && c[1][1] >= e2 && c[0][1] > c[0][0] && c[2][1] > c[2][0]).length;

  const t0 = performance.now();
  const aDetruire = [];
  const boite = (b) => {
    const m = M.Manifold.cube([b[0][1] - b[0][0], b[1][1] - b[1][0], b[2][1] - b[2][0]], false).translate([b[0][0], b[1][0], b[2][0]]);
    aDetruire.push(m);
    return m;
  };
  let res = boite(boiteMur);
  const valides = coupes.filter((c) => c[0][1] > c[0][0] && c[1][1] > c[1][0] && c[2][1] > c[2][0]);
  if (valides.length) {
    const outils = M.Manifold.union(valides.map(boite));
    aDetruire.push(outils);
    res = res.subtract(outils);
    aDetruire.push(res);
  }
  const place = res.rotate([0, 0, angleDeg]).translate(origine);
  aDetruire.push(place);
  const statut = place.status();
  const volume = place.volume();
  const genre = place.genus();
  const triangles = place.numTri();
  const ms = performance.now() - t0;
  for (const m of aDetruire) m.delete();
  const erreurRel = attendu ? Math.abs(volume - attendu) / attendu : null;
  return {
    ms, statut: String(statut?.value ?? statut), volume, attendu, erreurRel, genre, genreAttendu, triangles,
    decoupesDegenerees: coupes.length - valides.length, chevauchement,
  };
}

function ouverturesDuMur(mur, ouvertures, longueur) {
  return ouvertures.filter((o) => o.murHoteId === mur.id).map((o) => {
    const c = o.t * longueur;
    return { id: o.id, x0: c - o.largeur / 2, x1: c + o.largeur / 2, z0: o.allege, z1: o.allege + o.hauteur };
  });
}

export async function mesurerManifold(scene) {
  const Module = (await import("manifold-3d")).default;
  const t0 = performance.now();
  const M = await Module();
  M.setup();
  const initMs = performance.now() - t0;

  // 1) P.118 réel
  const p118 = { sansMarges: null, avecMarges: null };
  const observations = { ouverturesSansMurHote: 0, ouverturesDebordantLeMur: [], mursAvecOuvertures: 0 };
  const idsMurs = new Set(scene.niveaux.flatMap((n) => n.murs.map((m) => m.id)));
  for (const n of scene.niveaux) for (const o of n.ouvertures) if (!idsMurs.has(o.murHoteId)) observations.ouverturesSansMurHote++;
  for (const marges of [false, true]) {
    const temps = [];
    let nonConformes = [];
    let triangles = 0;
    let ouverturesTraitees = 0;
    const tTotal = performance.now();
    for (const n of scene.niveaux) {
      for (const mur of n.murs) {
        const dx = mur.b[0] - mur.a[0], dy = mur.b[1] - mur.a[1];
        const longueur = Math.hypot(dx, dy);
        const ouv = ouverturesDuMur(mur, n.ouvertures, longueur);
        ouverturesTraitees += ouv.length;
        if (!marges && ouv.length) {
          observations.mursAvecOuvertures++;
          for (const o of ouv) if (o.x0 < 0 || o.x1 > longueur || o.z1 > mur.hauteur) observations.ouverturesDebordantLeMur.push(o.id);
        }
        const r = murMoinsOuvertures(M, {
          longueur, epaisseur: mur.epaisseur, hauteur: mur.hauteur, origine: [mur.a[0], mur.a[1], n.elevation],
          angleDeg: (Math.atan2(dy, dx) * 180) / Math.PI, ouvertures: ouv, marges,
        });
        temps.push(r.ms);
        triangles += r.triangles;
        const ok = r.statut === "NoError" || r.statut === "0";
        const volOk = r.attendu == null || r.erreurRel < 1e-9;
        const genreOk = r.genreAttendu == null || r.genre === r.genreAttendu;
        if (!ok || !volOk || !genreOk) nonConformes.push({ mur: mur.id, statut: r.statut, erreurRel: r.erreurRel, genre: r.genre, genreAttendu: r.genreAttendu });
      }
    }
    const res = {
      murs: temps.length, ouvertures: ouverturesTraitees, totalMs: arrondi(performance.now() - tTotal), parMurMs: resume(temps, 3),
      triangles, nonConformes: nonConformes.length, detailNonConformes: nonConformes.slice(0, 20),
    };
    if (marges) p118.avecMarges = res; else p118.sansMarges = res;
  }

  // 2) Cas de robustesse (mur 5 m × 0,20 m × 3 m sauf mention)
  const base = { longueur: 5, epaisseur: 0.2, hauteur: 3 };
  const cas = [
    ["fenêtre centrée (nominal)", { ...base, ouvertures: [{ x0: 2, x1: 3.2, z0: 0.9, z1: 2.1 }] }],
    ["porte allège 0 (face basse coplanaire)", { ...base, ouvertures: [{ x0: 2, x1: 2.9, z0: 0, z1: 2.1 }] }],
    ["découpe d'épaisseur exacte (faces avant/arrière coplanaires)", { ...base, ouvertures: [{ x0: 2, x1: 3, z0: 1, z1: 2, y0: -0.1, y1: 0.1 }] }],
    ["découpe quasi coplanaire (1e-9 m)", { ...base, ouvertures: [{ x0: 2, x1: 3, z0: 1, z1: 2, y0: -0.1 - 1e-9, y1: 0.1 + 1e-9 }] }],
    ["ouverture affleurant l'extrémité du mur", { ...base, ouvertures: [{ x0: 4, x1: 5, z0: 1, z1: 2 }] }],
    ["ouverture dépassant l'extrémité du mur", { ...base, ouvertures: [{ x0: 4.5, x1: 5.5, z0: 1, z1: 2 }] }],
    ["deux ouvertures qui se chevauchent (un seul trou)", { ...base, genreAttendu: 1, ouvertures: [{ x0: 1, x1: 2.5, z0: 1, z1: 2 }, { x0: 2, x1: 3.5, z0: 1.5, z1: 2.5 }] }],
    ["deux ouvertures accolées (face commune, un seul trou)", { ...base, genreAttendu: 1, ouvertures: [{ x0: 1, x1: 2, z0: 1, z1: 2 }, { x0: 2, x1: 3, z0: 1, z1: 2 }] }],
    ["ouverture de largeur nulle (dégénérée)", { ...base, ouvertures: [{ x0: 2, x1: 2, z0: 1, z1: 2 }] }],
    ["mur oblique 37°", { ...base, angleDeg: 37, ouvertures: [{ x0: 2, x1: 3.2, z0: 0.9, z1: 2.1 }] }],
    ["mur en coordonnées cadastrales (≈ 3,2e5 ; 3,47e5 m)", { ...base, origine: [321960.123456, 347190.654321, 0], angleDeg: 23.5, ouvertures: [{ x0: 2, x1: 3.2, z0: 0.9, z1: 2.1 }] }],
    ["mur fin 0,05 m, 20 ouvertures", { longueur: 30, epaisseur: 0.05, hauteur: 3, ouvertures: Array.from({ length: 20 }, (_, i) => ({ x0: 0.5 + i * 1.45, x1: 1.4 + i * 1.45, z0: 0.8, z1: 2.2 })) }],
  ];
  const robustesse = [];
  for (const marges of [false, true]) {
    for (const [nom, p] of cas) {
      try {
        const r = murMoinsOuvertures(M, { ...p, marges });
        robustesse.push({
          cas: nom, marges, statut: r.statut, msBool: arrondi(r.ms, 3), volume: r.volume, attendu: r.attendu,
          erreurRel: r.erreurRel, genre: r.genre, genreAttendu: r.genreAttendu, triangles: r.triangles,
          conforme: (r.statut === "NoError" || r.statut === "0") && (r.attendu == null || r.erreurRel < 1e-6) && (r.genreAttendu == null || r.genre === r.genreAttendu),
          note: r.chevauchement ? "chevauchement : volume attendu par inclusion-exclusion" : r.decoupesDegenerees ? `${r.decoupesDegenerees} découpe(s) dégénérée(s) ignorée(s)` : "",
        });
      } catch (e) {
        robustesse.push({ cas: nom, marges, exception: String(e?.message ?? e) });
      }
    }
  }
  return { version: versionPaquet("manifold-3d"), initMs: arrondi(initMs), p118, observations: { ...observations, ouverturesDebordantLeMur: observations.ouverturesDebordantLeMur.length, exemplesDebordants: observations.ouverturesDebordantLeMur.slice(0, 10) }, robustesse };
}
