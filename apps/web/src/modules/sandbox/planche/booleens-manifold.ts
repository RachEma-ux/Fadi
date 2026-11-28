/**
 * Adaptateur manifold-3d (Apache-2.0, D-013, MO-4) pour les outils de solides du lot 6 : chargé À LA DEMANDE (jamais
 * au chemin d'ouverture), version épinglée dans `package.json`, synchrone une fois le module WASM initialisé.
 * Les maillages échangés sont ceux du noyau (`Maillage`, coordonnées monde) ; les identifiants de face d'origine
 * (`facesParTriangle`) sont transmis à manifold (`faceID`) et relus sur le résultat quand il les conserve.
 * Résultat déclaré « booléen de maillage » : jamais exact au sens B-Rep.
 */
import type { AdaptateurBooleens, AdaptateurPlans, Maillage, PointPlan, PolygonePlan } from "@parcours/sandbox-planche-model";

type Module = Awaited<ReturnType<typeof import("manifold-3d").default>>;
type ManifoldT = InstanceType<Module["Manifold"]>;
type SectionT = InstanceType<Module["CrossSection"]>;

let chargement: Promise<AdaptateurBooleens> | null = null;

function versMesh(M: Module, m: Maillage): ManifoldT {
  const mesh = new M.Mesh({
    numProp: 3,
    vertProperties: new Float32Array(m.positions),
    triVerts: new Uint32Array(m.triangles),
    ...(m.facesParTriangle ? { faceID: new Uint32Array(m.facesParTriangle) } : {}),
  });
  mesh.merge();
  return new M.Manifold(mesh);
}

function versMaillage(r: ManifoldT): Maillage {
  const mesh = r.getMesh();
  const positions: number[] = [];
  const np = mesh.numProp;
  for (let i = 0; i < mesh.vertProperties.length; i += np) positions.push(mesh.vertProperties[i] as number, mesh.vertProperties[i + 1] as number, mesh.vertProperties[i + 2] as number);
  const triangles = Array.from(mesh.triVerts);
  const faceID = mesh.faceID && mesh.faceID.length === triangles.length / 3 ? Array.from(mesh.faceID) : undefined;
  r.delete();
  return { positions, triangles, ...(faceID ? { facesParTriangle: faceID } : {}) };
}

/** Aire signée d'un contour (positive : sens trigonométrique). */
function aireSignee(c: readonly PointPlan[]): number {
  let s = 0;
  for (let i = 0; i < c.length; i++) {
    const [ax, ay] = c[i] as PointPlan;
    const [bx, by] = c[(i + 1) % c.length] as PointPlan;
    s += ax * by - bx * ay;
  }
  return s / 2;
}

/** Section plane → polygones : une composante connexe par polygone, contour extérieur et trous. */
function versPolygones(cs: SectionT): PolygonePlan[] {
  const sortie: PolygonePlan[] = [];
  const composantes = cs.decompose();
  try {
    for (const k of composantes) {
      const contours = k.toPolygons().map((c) => c.map((p) => [p[0], p[1]] as PointPlan)).filter((c) => c.length >= 3);
      const exterieurs = contours.filter((c) => aireSignee(c) > 0);
      const trous = contours.filter((c) => aireSignee(c) < 0);
      // Une composante n'a qu'un contour extérieur ; par prudence, les trous vont au plus grand.
      exterieurs.sort((a, b) => aireSignee(b) - aireSignee(a));
      exterieurs.forEach((e, i) => sortie.push({ exterieur: e, trous: i === 0 ? trous : [] }));
    }
  } finally {
    for (const k of composantes) k.delete();
    cs.delete();
  }
  return sortie;
}

function plansManifold(M: Module): AdaptateurPlans {
  const sections = (solides: readonly Maillage[], f: (s: ManifoldT) => SectionT): PolygonePlan[] => {
    const parts: SectionT[] = [];
    try {
      for (const m of solides) {
        const s = versMesh(M, m);
        try {
          parts.push(f(s));
        } finally {
          s.delete();
        }
      }
      return versPolygones(M.CrossSection.union(parts));
    } finally {
      for (const p of parts) p.delete();
    }
  };
  return {
    coupe: (solides, hauteur) => sections(solides, (s) => s.slice(hauteur)),
    projection: (solides) => sections(solides, (s) => s.project()),
    union: (polygones) => {
      const parts = polygones.map((p) => new M.CrossSection([p.exterieur.map(([x, y]) => [x, y] as [number, number]), ...p.trous.map((t) => t.map(([x, y]) => [x, y] as [number, number]))], "EvenOdd"));
      try {
        return versPolygones(M.CrossSection.union(parts));
      } finally {
        for (const p of parts) p.delete();
      }
    },
  };
}

/** Charge manifold-3d (une seule fois) et retourne l'adaptateur synchrone. */
export function chargerBooleens(): Promise<AdaptateurBooleens> {
  if (!chargement) {
    chargement = (async () => {
      const { default: Module } = await import("manifold-3d");
      const M = await Module();
      M.setup();
      const op = (f: (a: ManifoldT, b: ManifoldT) => ManifoldT) => (a: Maillage, b: Maillage): Maillage => {
        const A = versMesh(M, a);
        const B = versMesh(M, b);
        try {
          return versMaillage(f(A, B));
        } finally {
          A.delete();
          B.delete();
        }
      };
      return {
        union: op((a, b) => M.Manifold.union(a, b)),
        difference: op((a, b) => M.Manifold.difference(a, b)),
        intersection: op((a, b) => M.Manifold.intersection(a, b)),
        // Cas 2, lot 8 (n° 15) : union de contours plans (règle positive), recentrée pour la précision.
        aireUnion: (contours) => {
          const pts = contours.flat();
          if (pts.length === 0) return 0;
          const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
          const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
          const cs = new M.CrossSection(contours.map((c) => c.map((p) => [p[0] - cx, p[1] - cy] as [number, number])), "Positive");
          try {
            return cs.area();
          } finally {
            cs.delete();
          }
        },
        plans: plansManifold(M),
      };
    })();
  }
  return chargement;
}
