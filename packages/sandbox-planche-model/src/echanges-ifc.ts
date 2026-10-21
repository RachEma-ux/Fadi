/**
 * Menu de la Planche — export IFC (IFC4, maillage triangulé) : un `IfcBuildingElementProxy` par maillage de la Planche
 * (`maillagesPlanche`), en `IfcTriangulatedFaceSet`, mètres, Z vers le haut, sans dépendance. Géométrie seulement :
 * aucune classe IFC, aucun jeu de propriétés ni quantité n'est inventé (les objets sont « NOTDEFINED »). Texte
 * reproductible : même modèle et même date, mêmes octets. Pur : ni DOM, ni React.
 */
import type { Modele } from "./geometrie-libre.js";
import { maillagesPlanche } from "./representation.js";
import { nonEtanchesDe, omisExport, type ExportMaillage } from "./echanges.js";

/** Chaîne STEP : apostrophes doublées, caractères hors ASCII en `\X2\…\X0\`. */
export function chaineIfc(s: string): string {
  let sortie = "";
  let hex = "";
  const vider = () => {
    if (hex) sortie += `\\X2\\${hex}\\X0\\`;
    hex = "";
  };
  for (const ch of s) {
    const cp = ch.codePointAt(0) as number;
    if (cp >= 0x20 && cp < 0x7f) {
      vider();
      sortie += ch === "'" ? "''" : ch === "\\" ? "\\\\" : ch;
    } else if (cp > 0xffff) {
      hex += cp.toString(16).toUpperCase().padStart(8, "0").slice(0, 8); // hors plan de base : non représenté, rare
    } else hex += cp.toString(16).toUpperCase().padStart(4, "0");
  }
  vider();
  return `'${sortie}'`;
}

const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$";

/** GlobalId IFC (22 caractères) déterministe à partir d'un texte (même Planche, mêmes identifiants). */
export function guidIfc(graine: string): string {
  const mots: number[] = [];
  let h = 0x811c9dc5;
  for (let k = 0; k < 4; k++) {
    for (const ch of `${k}|${graine}`) {
      h ^= ch.codePointAt(0) as number;
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    mots.push(h);
  }
  // 128 bits → 22 caractères base 64 (le premier ne porte que 2 bits, donc reste dans 0-3).
  let n = 0n;
  for (const w of mots) n = (n << 32n) | BigInt(w);
  let s = "";
  for (let i = 0; i < 22; i++) {
    s = ALPHABET[Number(n & 63n)] + s;
    n >>= 6n;
  }
  return s;
}

const reel = (x: number): string => {
  const v = Math.abs(x) < 5e-7 ? 0 : x;
  // Réel STEP : toujours un point décimal (« 2. »).
  return v.toFixed(6).replace(/0+$/, "");
};

export function exporterIfc(m: Modele, nom = "Planche", maintenant: Date = new Date()): ExportMaillage {
  const maillages = maillagesPlanche(m).filter((x) => x.triangles.length > 0);
  const l: string[] = [];
  let n = 0;
  const e = (texte: string): number => {
    n++;
    l.push(`#${n}=${texte};`);
    return n;
  };
  const horodatage = maintenant.toISOString().replace(/\.\d+Z$/, "");
  const nomFichier = `${nom.replace(/[^\w.-]+/g, "_") || "planche"}.ifc`;
  const entete = [
    "ISO-10303-21;",
    "HEADER;",
    "FILE_DESCRIPTION(('ViewDefinition [ReferenceView_V1.2]'),'2;1');",
    `FILE_NAME(${chaineIfc(nomFichier)},'${horodatage}',(''),(''),'Fadi Sandbox','Fadi','');`,
    "FILE_SCHEMA(('IFC4'));",
    "ENDSEC;",
    "DATA;",
  ];
  const origine = e("IFCCARTESIANPOINT((0.,0.,0.))");
  const axes = e(`IFCAXIS2PLACEMENT3D(#${origine},$,$)`);
  const contexte = e(`IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,#${axes},$)`);
  const corps = e(`IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Body','Model',*,*,*,*,#${contexte},$,.MODEL_VIEW.,$)`);
  const longueur = e("IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)");
  const unites = e(`IFCUNITASSIGNMENT((#${longueur}))`);
  const projet = e(`IFCPROJECT('${guidIfc("projet")}',$,${chaineIfc(nom)},$,$,$,$,(#${contexte}),#${unites})`);
  const placementSite = e(`IFCLOCALPLACEMENT($,#${axes})`);
  const site = e(`IFCSITE('${guidIfc("site")}',$,'Sandbox',$,$,#${placementSite},$,$,.ELEMENT.,$,$,$,$,$)`);
  e(`IFCRELAGGREGATES('${guidIfc("agrege")}',$,$,$,#${projet},(#${site}))`);
  const produits: number[] = [];
  let triangles = 0;
  for (const mesh of maillages) {
    const pts = e(`IFCCARTESIANPOINTLIST3D((${Array.from({ length: mesh.positions.length / 3 }, (_, i) => `(${reel(mesh.positions[i * 3]!)},${reel(mesh.positions[i * 3 + 1]!)},${reel(mesh.positions[i * 3 + 2]!)})`).join(",")}))`);
    const idx = Array.from({ length: mesh.triangles.length / 3 }, (_, k) => `(${mesh.triangles[k * 3]! + 1},${mesh.triangles[k * 3 + 1]! + 1},${mesh.triangles[k * 3 + 2]! + 1})`).join(",");
    triangles += mesh.triangles.length / 3;
    const faces = e(`IFCTRIANGULATEDFACESET(#${pts},$,$,(${idx}),$)`);
    const repr = e(`IFCSHAPEREPRESENTATION(#${corps},'Body','Tessellation',(#${faces}))`);
    const defForme = e(`IFCPRODUCTDEFINITIONSHAPE($,$,(#${repr}))`);
    const placement = e(`IFCLOCALPLACEMENT(#${placementSite},#${axes})`);
    produits.push(e(`IFCBUILDINGELEMENTPROXY('${guidIfc(`objet|${mesh.id}`)}',$,${chaineIfc(mesh.nom)},$,$,#${placement},#${defForme},$,.NOTDEFINED.)`));
  }
  if (produits.length > 0) e(`IFCRELCONTAINEDINSPATIALSTRUCTURE('${guidIfc("contient")}',$,$,$,(${produits.map((p) => `#${p}`).join(",")}),#${site})`);
  const contenu = [...entete, ...l, "ENDSEC;", "END-ISO-10303-21;", ""].join("\n");
  return { contenu, objets: maillages.length, triangles, omis: omisExport(m), nonEtanches: nonEtanchesDe(maillages) };
}
