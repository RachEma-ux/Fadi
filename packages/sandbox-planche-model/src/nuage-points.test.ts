import { describe, expect, it } from "vitest";
import { inferer } from "./inference.js";
import { ErreurNuagePoints, ajusterPlan, empriseNuage, lireNuagePoints, nuageDansProjet, placementNuageDefaut, pointsDe, trancheNuage } from "./nuage-points.js";
import { ajouterReference, estReference, rechargerReference } from "./references.js";
import { modeleVide } from "./geometrie-libre.js";

/** LAS 1.2, format de point 0 (20 octets), échelle 0,001, décalage (2 600 000, 1 200 000, 400). */
function las(points: readonly [number, number, number][]): Uint8Array {
  const debut = 227;
  const o = new Uint8Array(debut + points.length * 20);
  const dv = new DataView(o.buffer);
  o.set([0x4c, 0x41, 0x53, 0x46]);
  o[24] = 1;
  o[25] = 2;
  dv.setUint16(94, debut, true);
  dv.setUint32(96, debut, true);
  o[104] = 0;
  dv.setUint16(105, 20, true);
  dv.setUint32(107, points.length, true);
  [0.001, 0.001, 0.001, 2_600_000, 1_200_000, 400].forEach((v, i) => dv.setFloat64(131 + i * 8, v, true));
  points.forEach(([x, y, z], i) => {
    const b = debut + i * 20;
    dv.setInt32(b, Math.round((x - 2_600_000) / 0.001), true);
    dv.setInt32(b + 4, Math.round((y - 1_200_000) / 0.001), true);
    dv.setInt32(b + 8, Math.round((z - 400) / 0.001), true);
  });
  return o;
}

describe("nuage de points (cas 4, lot C4, étape 7f)", () => {
  it("lit un LAS géoréférencé sans perdre le millimètre et le pose coin minimal à l'origine, point bas à l'altitude 0", () => {
    const lu = lireNuagePoints("releve.las", las([[2_600_010.123, 1_200_020.456, 401.1], [2_600_012, 1_200_021, 402.25]]));
    expect(lu).toMatchObject({ format: "las", nombre: 2, pas: 1, version: "1.2" });
    const monde = nuageDansProjet(lu, 1, placementNuageDefaut(lu, 1));
    expect(Array.from(monde).map((v) => Math.round(v * 1000))).toEqual([0, 0, 0, 1877, 544, 1150]);
  });

  it("décime à pas régulier et compte tous les points du fichier", () => {
    const pts = Array.from({ length: 10 }, (_, i) => [2_600_000 + i, 1_200_000, 400] as [number, number, number]);
    const lu = lireNuagePoints("a.las", las(pts), 4);
    expect(lu.nombre).toBe(10);
    expect(lu.pas).toBe(3);
    expect(lu.points.length / 3).toBe(4);
  });

  it("lit XYZ et PTS (compte en tête, séparateurs variés) et PLY sans faces", () => {
    expect(lireNuagePoints("a.xyz", new TextEncoder().encode("# relevé\n1 2 3\n4;5;6 120 120 120\n")).nombre).toBe(2);
    const pts = lireNuagePoints("a.pts", new TextEncoder().encode("2\n1,2,3,-500\n4 5 6\n"));
    expect(pts).toMatchObject({ format: "pts", nombre: 2 });
    const ply = lireNuagePoints("a.ply", new TextEncoder().encode("ply\nformat ascii 1.0\nelement vertex 3\nproperty float x\nproperty float y\nproperty float z\nend_header\n0 0 0\n1 0 0\n0 1 1\n"));
    expect(ply).toMatchObject({ format: "ply", nombre: 3 });
  });

  it("refuse LAZ, E57 et PLY avec faces, chacun avec son motif", () => {
    const motif = (nom: string, o: Uint8Array) => {
      try {
        lireNuagePoints(nom, o);
        return null;
      } catch (e) {
        return e instanceof ErreurNuagePoints ? e.code : "autre";
      }
    };
    expect(motif("a.laz", new Uint8Array(10))).toBe("laz");
    expect(motif("a.e57", new Uint8Array(10))).toBe("e57");
    expect(motif("a.ply", new TextEncoder().encode("ply\nformat ascii 1.0\nelement vertex 3\nproperty float x\nproperty float y\nproperty float z\nelement face 1\nproperty list uchar int vertex_indices\nend_header\n0 0 0\n1 0 0\n0 1 0\n3 0 1 2\n"))).toBe("ply-faces");
    const compresse = las([[2_600_000, 1_200_000, 400]]);
    compresse[104] = 0x83;
    expect(motif("a.las", compresse)).toBe("laz");
    expect(motif("a.las", las([[2_600_000, 1_200_000, 400]]).subarray(0, 230))).toBe("tronque");
    expect(motif("a.xyz", new TextEncoder().encode("rien ici\n"))).toBe("vide");
  });

  it("tranche horizontale et boîte de découpe", () => {
    const monde = Float32Array.from([0, 0, 1.09, 1, 0, 1.1, 2, 0, 1.13, 5, 5, 1.1]);
    expect(trancheNuage(monde, 1.1, 0.04, null).length / 3).toBe(3);
    expect(trancheNuage(monde, 1.1, 0.04, { xmin: -1, ymin: -1, xmax: 3, ymax: 3 }).length / 3).toBe(2);
    expect(empriseNuage(monde)?.boite).toEqual({ xmin: 0, ymin: 0, xmax: 5, ymax: 5 });
  });

  it("ajuste un plan par moindres carrés, avec écarts, et refuse des points alignés", () => {
    const mur = pointsDe(Float32Array.from([2, 0, 0, 2.003, 1, 0, 1.997, 2, 0, 2, 0, 2, 2.004, 1, 2, 2, 2, 2]));
    const p = ajusterPlan(mur);
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(Math.abs(p.normale.x)).toBeCloseTo(1, 3);
    expect(p.ecartMoyen).toBeLessThan(0.003);
    expect(p.ecartMax).toBeLessThan(0.0035);
    expect(ajusterPlan(mur.slice(0, 2))).toEqual({ ok: false, erreur: "trop-peu" });
    expect(ajusterPlan([{ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 }, { x: 2, y: 2, z: 2 }])).toEqual({ ok: false, erreur: "alignes" });
    // Six points d'une seule tranche de 4 cm le long d'un mur de 5 m : presque alignés, plan non déterminé.
    const tranche = [0, 1, 2, 3, 4, 5].map((y, i) => ({ x: 2 + (i % 2) * 0.002, y, z: 1.1 + (i % 3) * 0.01 }));
    expect(ajusterPlan(tranche)).toEqual({ ok: false, erreur: "alignes" });
  });

  it("le nuage est une référence marquée, refusée sans son nombre de points", () => {
    const fichier = { id: "sbxref_00000000-0000-0000-0000-000000000001", empreinte: "a".repeat(64), taille: 1000 };
    const m = modeleVide();
    expect(ajouterReference(m, { nom: "r.las", format: "las", fichier, echelle: 1, triangles: 0, date: "2026-11-28" })).toEqual({ ok: false, erreur: "fichier" });
    const r = ajouterReference(m, { nom: "r.las", format: "las", fichier, echelle: 1, triangles: 0, date: "2026-11-28", nuage: { points: 2_418_360 } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const ref = r.modele.annotations!.references![r.id]!;
    expect(ref.nuage).toEqual({ points: 2_418_360 });
    expect(estReference(r.id, ref)).toBe(true);
    expect(estReference(r.id, { ...ref, nuage: undefined })).toBe(false);
    // Recharger un nuage par un maillage : refusé.
    expect(rechargerReference(r.modele, r.id, { nom: "m.obj", format: "obj", fichier: { ...fichier, empreinte: "b".repeat(64) }, echelle: 1, triangles: 3, date: "2026-11-28" })).toEqual({ ok: false, erreur: "fichier" });
  });

  it("accroche le point mesuré le plus proche du rayon et affiche l'écart au point visé", () => {
    const i = inferer({
      rayon: { origine: { x: 1, y: 1.004, z: 10 }, direction: { x: 0, y: 0, z: -1 } },
      tolerance: 0.02,
      geometrie: { aretes: [], faces: [], centres: [] },
      accrochage: {},
      pointsMesures: Float32Array.from([1, 1, 1.1, 1.5, 1, 1.1]),
    });
    expect(i.type).toBe("point-mesure");
    expect(i.point).toEqual({ x: 1, y: 1, z: expect.closeTo(1.1, 6) });
    expect(i.libelle.fr).toBe("Point mesuré · écart au point visé 4 mm");
    // Genre forcé (Alt + chiffre) : les points mesurés ne sont pas pris.
    expect(inferer({ rayon: { origine: { x: 1, y: 1, z: 10 }, direction: { x: 0, y: 0, z: -1 } }, tolerance: 0.02, geometrie: { aretes: [], faces: [], centres: [] }, accrochage: { force: "sommet" }, pointsMesures: Float32Array.from([1, 1, 1.1]) }).type).not.toBe("point-mesure");
  });
});
