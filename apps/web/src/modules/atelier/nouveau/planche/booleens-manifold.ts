/**
 * Adaptateur manifold-3d (Apache-2.0, D-013, MO-4) pour les outils de solides du lot 6 : chargé À LA DEMANDE (jamais
 * au chemin d'ouverture), version épinglée dans `package.json`, synchrone une fois le module WASM initialisé.
 * Les maillages échangés sont ceux du noyau (`Maillage`, coordonnées monde) ; les identifiants de face d'origine
 * (`facesParTriangle`) sont transmis à manifold (`faceID`) et relus sur le résultat quand il les conserve.
 * Résultat déclaré « booléen de maillage » : jamais exact au sens B-Rep.
 */
import type { AdaptateurBooleens, Maillage } from "@parcours/planche-model";

type Module = Awaited<ReturnType<typeof import("manifold-3d").default>>;
type ManifoldT = InstanceType<Module["Manifold"]>;

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
      };
    })();
  }
  return chargement;
}
