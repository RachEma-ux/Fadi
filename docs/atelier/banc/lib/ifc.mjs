// Écriture IFC 4.3 (IFC4X3_ADD2 côté schéma) du sous-ensemble P.118 : web-ifc (MPL-2.0) contre écriture directe STEP.
// Contenu identique dans les deux voies : projet, unités SI, site + IfcMapConversion/IfcProjectedCRS,
// bâtiment, 6 niveaux, 220 murs (IfcWall, extrusion de rectangle), 210 IfcOpeningElement + IfcRelVoidsElement,
// 120 IfcColumn. Chaque fichier produit est relu par web-ifc (comptage d'entités, en-tête, maillages).
// IfcMapConversion porte des valeurs nulles de TEST (Eastings/Northings = 0) : la transformation local → EPSG
// n'est pas dérivée ici ; le fichier n'est pas un livrable. Validation IfcOpenShell : non exécutée dans ce banc.
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { arrondi } from "./stats.mjs";
import { versionPaquet } from "./paquets.mjs";

const ici = dirname(fileURLToPath(import.meta.url));
const MARGE = 0.01;
const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$";

/** GUID IFC compressé (22 caractères) déterministe, dérivé de l'identifiant. */
export function guidIfc(id) {
  const h = createHash("sha1").update(id).digest();
  let n = 0n;
  for (let i = 0; i < 16; i++) n = (n << 8n) | BigInt(h[i]);
  let s = "";
  for (let i = 0; i < 22; i++) {
    const bits = i === 0 ? 2n : 6n;
    const decalage = BigInt(126 - 6 * i); // 2 bits puis 21 × 6 bits = 128 bits
    s += ALPHABET[Number((n >> decalage) & ((1n << bits) - 1n))];
  }
  return s;
}

/** Géométrie commune aux deux voies, dérivée de la scène P.118. */
function plan(scene) {
  return scene.niveaux.map((n) => ({
    id: n.id, nom: n.nom, elevation: n.elevation,
    murs: n.murs.map((m) => {
      const dx = m.b[0] - m.a[0], dy = m.b[1] - m.a[1];
      const L = Math.hypot(dx, dy);
      return {
        id: m.id, L, e: m.epaisseur, h: m.hauteur, a: m.a, dir: [dx / L, dy / L],
        ouvertures: n.ouvertures.filter((o) => o.murHoteId === m.id).map((o) => ({ id: o.id, x: o.t * L, l: o.largeur, h: o.hauteur, z: o.allege })),
      };
    }),
    poteaux: n.poteaux.map((p) => ({ id: p.id, p: p.p, l: p.largeur, pr: p.profondeur, h: p.hauteur, ang: (p.angle * Math.PI) / 180 })),
  }));
}

// ---------- Voie 1 : web-ifc ----------
async function ecrireWebIfc(api, W, scene) {
  const S = W.IFC4X3;
  const t0 = performance.now();
  const model = api.CreateModel({ schema: "IFC4X3_ADD2", name: "P118-banc", description: ["ViewDefinition [ReferenceView]"], authors: ["banc L0.4"], organizations: ["Fadi"] });
  const ecrire = (o) => { api.WriteLine(model, o); return new W.Handle(o.expressID); };
  const L = (v) => new S.IfcLengthMeasure(v);
  const R = (v) => new S.IfcReal(v);
  const lab = (v) => new S.IfcLabel(v);
  const pt3 = (x, y, z) => ecrire(new S.IfcCartesianPoint([L(x), L(y), L(z)]));
  const pt2 = (x, y) => ecrire(new S.IfcCartesianPoint([L(x), L(y)]));
  const dir3 = (x, y, z) => ecrire(new S.IfcDirection([R(x), R(y), R(z)]));
  const dir2 = (x, y) => ecrire(new S.IfcDirection([R(x), R(y)]));
  const Z = dir3(0, 0, 1);
  const pl3 = (x, y, z, rx = 1, ry = 0) => ecrire(new S.IfcAxis2Placement3D(pt3(x, y, z), Z, dir3(rx, ry, 0)));
  const placement = (rel, x, y, z, rx, ry) => ecrire(new S.IfcLocalPlacement(rel, pl3(x, y, z, rx, ry)));
  const ctx = ecrire(new S.IfcGeometricRepresentationContext(lab("Model"), lab("Model"), new S.IfcDimensionCount(3), R(1e-5), pl3(0, 0, 0), dir2(0, 1)));
  const unites = ecrire(new S.IfcUnitAssignment([
    ecrire(new S.IfcSIUnit(S.IfcUnitEnum.LENGTHUNIT, null, S.IfcSIUnitName.METRE)),
    ecrire(new S.IfcSIUnit(S.IfcUnitEnum.AREAUNIT, null, S.IfcSIUnitName.SQUARE_METRE)),
    ecrire(new S.IfcSIUnit(S.IfcUnitEnum.VOLUMEUNIT, null, S.IfcSIUnitName.CUBIC_METRE)),
    ecrire(new S.IfcSIUnit(S.IfcUnitEnum.PLANEANGLEUNIT, null, S.IfcSIUnitName.RADIAN)),
  ]));
  const projet = ecrire(new S.IfcProject(new S.IfcGloballyUniqueId(guidIfc("projet")), null, lab("P.118"), null, null, null, null, [ctx], unites));
  const crs = ecrire(new S.IfcProjectedCRS(lab(scene.source.crs ?? "EPSG:26191"), null, null, null, null, null, null));
  ecrire(new S.IfcMapConversion(ctx, crs, L(0), L(0), L(0), null, null, null));
  const extrusion = (largeur, profondeur, cx, cy, hauteur, z0 = 0) => {
    const prof = ecrire(new S.IfcRectangleProfileDef(S.IfcProfileTypeEnum.AREA, null, ecrire(new S.IfcAxis2Placement2D(pt2(cx, cy), null)), new S.IfcPositiveLengthMeasure(largeur), new S.IfcPositiveLengthMeasure(profondeur)));
    const solide = ecrire(new S.IfcExtrudedAreaSolid(prof, pl3(0, 0, z0), Z, new S.IfcPositiveLengthMeasure(hauteur)));
    const rep = ecrire(new S.IfcShapeRepresentation(ctx, lab("Body"), lab("SweptSolid"), [solide]));
    return ecrire(new S.IfcProductDefinitionShape(null, null, [rep]));
  };
  const plSite = placement(null, 0, 0, 0);
  const site = ecrire(new S.IfcSite(new S.IfcGloballyUniqueId(guidIfc("site")), null, lab("Parcelle 118"), null, null, plSite, null, null, S.IfcElementCompositionEnum.ELEMENT, null, null, null, null, null));
  const plBat = placement(plSite, 0, 0, 0);
  const bat = ecrire(new S.IfcBuilding(new S.IfcGloballyUniqueId(guidIfc("batiment")), null, lab("P.118"), null, null, plBat, null, null, S.IfcElementCompositionEnum.ELEMENT, null, null, null));
  ecrire(new S.IfcRelAggregates(new S.IfcGloballyUniqueId(guidIfc("agg-projet")), null, null, null, projet, [site]));
  ecrire(new S.IfcRelAggregates(new S.IfcGloballyUniqueId(guidIfc("agg-site")), null, null, null, site, [bat]));
  const etages = [];
  for (const n of plan(scene)) {
    const plN = placement(plBat, 0, 0, n.elevation);
    const etage = ecrire(new S.IfcBuildingStorey(new S.IfcGloballyUniqueId(guidIfc(n.id)), null, lab(n.nom), null, null, plN, null, null, S.IfcElementCompositionEnum.ELEMENT, L(n.elevation)));
    etages.push(etage);
    const contenus = [];
    for (const m of n.murs) {
      const plM = placement(plN, m.a[0], m.a[1], 0, m.dir[0], m.dir[1]);
      const mur = ecrire(new S.IfcWall(new S.IfcGloballyUniqueId(guidIfc(m.id)), null, lab(m.id), null, null, plM, extrusion(m.L, m.e, m.L / 2, 0, m.h), new S.IfcIdentifier(m.id), S.IfcWallTypeEnum.STANDARD));
      contenus.push(mur);
      for (const o of m.ouvertures) {
        const plO = placement(plM, o.x, 0, o.z);
        const ouv = ecrire(new S.IfcOpeningElement(new S.IfcGloballyUniqueId(guidIfc(o.id)), null, lab(o.id), null, null, plO, extrusion(o.l, m.e + 2 * MARGE, 0, 0, o.h), null, S.IfcOpeningElementTypeEnum.OPENING));
        ecrire(new S.IfcRelVoidsElement(new S.IfcGloballyUniqueId(guidIfc("vide-" + o.id)), null, null, null, mur, ouv));
      }
    }
    for (const p of n.poteaux) {
      const plP = placement(plN, p.p[0], p.p[1], 0, Math.cos(p.ang), Math.sin(p.ang));
      contenus.push(ecrire(new S.IfcColumn(new S.IfcGloballyUniqueId(guidIfc(p.id)), null, lab(p.id), null, null, plP, extrusion(p.l, p.pr, 0, 0, p.h), new S.IfcIdentifier(p.id), S.IfcColumnTypeEnum.COLUMN)));
    }
    ecrire(new S.IfcRelContainedInSpatialStructure(new S.IfcGloballyUniqueId(guidIfc("cont-" + n.id)), null, null, null, contenus, etage));
  }
  ecrire(new S.IfcRelAggregates(new S.IfcGloballyUniqueId(guidIfc("agg-bat")), null, null, null, bat, etages));
  const t1 = performance.now();
  const octets = api.SaveModel(model);
  const t2 = performance.now();
  api.CloseModel(model);
  return { octets, constructionMs: t1 - t0, serialisationMs: t2 - t1 };
}

// ---------- Voie 2 : écriture directe STEP (ISO 10303-21) ----------
function ecrireDirect(scene) {
  const t0 = performance.now();
  const lignes = [];
  let n = 0;
  const f = (x) => { const s = String(x); return /[.eE]/.test(s) ? s.replace(/e/, "E") : s + "."; };
  const str = (s) => `'${String(s).replace(/\\/g, "\\\\").replace(/'/g, "''").replace(/[^\x20-\x7e]/g, (c) => `\\X2\\${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0")}\\X0\\`)}'`;
  const e = (texte) => { n++; lignes.push(`#${n}=${texte};`); return `#${n}`; };
  const Z = e(`IFCDIRECTION((0.,0.,1.))`);
  const pt3 = (x, y, z) => e(`IFCCARTESIANPOINT((${f(x)},${f(y)},${f(z)}))`);
  const pl3 = (x, y, z, rx = 1, ry = 0) => e(`IFCAXIS2PLACEMENT3D(${pt3(x, y, z)},${Z},${e(`IFCDIRECTION((${f(rx)},${f(ry)},0.))`)})`);
  const placement = (rel, x, y, z, rx, ry) => e(`IFCLOCALPLACEMENT(${rel ?? "$"},${pl3(x, y, z, rx, ry)})`);
  const ctx = e(`IFCGEOMETRICREPRESENTATIONCONTEXT('Model','Model',3,1.E-05,${pl3(0, 0, 0)},${e("IFCDIRECTION((0.,1.))")})`);
  const u = ["LENGTHUNIT,$,.METRE.", "AREAUNIT,$,.SQUARE_METRE.", "VOLUMEUNIT,$,.CUBIC_METRE.", "PLANEANGLEUNIT,$,.RADIAN."].map((s) => { const [t, p, nm] = s.split(","); return e(`IFCSIUNIT(*,.${t}.,${p},${nm})`); });
  const unites = e(`IFCUNITASSIGNMENT((${u.join(",")}))`);
  const projet = e(`IFCPROJECT('${guidIfc("projet")}',$,'P.118',$,$,$,$,(${ctx}),${unites})`);
  const crs = e(`IFCPROJECTEDCRS(${str(scene.source.crs ?? "EPSG:26191")},$,$,$,$,$,$)`);
  e(`IFCMAPCONVERSION(${ctx},${crs},0.,0.,0.,$,$,$)`);
  const extrusion = (largeur, profondeur, cx, cy, hauteur, z0 = 0) => {
    const prof = e(`IFCRECTANGLEPROFILEDEF(.AREA.,$,${e(`IFCAXIS2PLACEMENT2D(${e(`IFCCARTESIANPOINT((${f(cx)},${f(cy)}))`)},$)`)},${f(largeur)},${f(profondeur)})`);
    const sol = e(`IFCEXTRUDEDAREASOLID(${prof},${pl3(0, 0, z0)},${Z},${f(hauteur)})`);
    return e(`IFCPRODUCTDEFINITIONSHAPE($,$,(${e(`IFCSHAPEREPRESENTATION(${ctx},'Body','SweptSolid',(${sol}))`)}))`);
  };
  const plSite = placement(null, 0, 0, 0);
  const site = e(`IFCSITE('${guidIfc("site")}',$,'Parcelle 118',$,$,${plSite},$,$,.ELEMENT.,$,$,$,$,$)`);
  const plBat = placement(plSite, 0, 0, 0);
  const bat = e(`IFCBUILDING('${guidIfc("batiment")}',$,'P.118',$,$,${plBat},$,$,.ELEMENT.,$,$,$)`);
  e(`IFCRELAGGREGATES('${guidIfc("agg-projet")}',$,$,$,${projet},(${site}))`);
  e(`IFCRELAGGREGATES('${guidIfc("agg-site")}',$,$,$,${site},(${bat}))`);
  const etages = [];
  for (const niv of plan(scene)) {
    const plN = placement(plBat, 0, 0, niv.elevation);
    const etage = e(`IFCBUILDINGSTOREY('${guidIfc(niv.id)}',$,${str(niv.nom)},$,$,${plN},$,$,.ELEMENT.,${f(niv.elevation)})`);
    etages.push(etage);
    const contenus = [];
    for (const m of niv.murs) {
      const plM = placement(plN, m.a[0], m.a[1], 0, m.dir[0], m.dir[1]);
      const mur = e(`IFCWALL('${guidIfc(m.id)}',$,${str(m.id)},$,$,${plM},${extrusion(m.L, m.e, m.L / 2, 0, m.h)},${str(m.id)},.STANDARD.)`);
      contenus.push(mur);
      for (const o of m.ouvertures) {
        const plO = placement(plM, o.x, 0, o.z);
        const ouv = e(`IFCOPENINGELEMENT('${guidIfc(o.id)}',$,${str(o.id)},$,$,${plO},${extrusion(o.l, m.e + 2 * MARGE, 0, 0, o.h)},$,.OPENING.)`);
        e(`IFCRELVOIDSELEMENT('${guidIfc("vide-" + o.id)}',$,$,$,${mur},${ouv})`);
      }
    }
    for (const p of niv.poteaux) {
      const plP = placement(plN, p.p[0], p.p[1], 0, Math.cos(p.ang), Math.sin(p.ang));
      contenus.push(e(`IFCCOLUMN('${guidIfc(p.id)}',$,${str(p.id)},$,$,${plP},${extrusion(p.l, p.pr, 0, 0, p.h)},${str(p.id)},.COLUMN.)`));
    }
    e(`IFCRELCONTAINEDINSPATIALSTRUCTURE('${guidIfc("cont-" + niv.id)}',$,$,$,(${contenus.join(",")}),${etage})`);
  }
  e(`IFCRELAGGREGATES('${guidIfc("agg-bat")}',$,$,$,${bat},(${etages.join(",")}))`);
  const entete = [
    "ISO-10303-21;", "HEADER;", "FILE_DESCRIPTION(('ViewDefinition [ReferenceView]'),'2;1');",
    "FILE_NAME('P118-banc.ifc','2026-01-01T00:00:00',('banc L0.4'),('Fadi'),'banc L0.4','banc L0.4','');",
    "FILE_SCHEMA(('IFC4X3_ADD2'));", "ENDSEC;", "DATA;",
  ];
  const texte = [...entete, ...lignes, "ENDSEC;", "END-ISO-10303-21;", ""].join("\n");
  const t1 = performance.now();
  const octets = Buffer.from(texte, "utf8");
  return { octets, constructionMs: t1 - t0, serialisationMs: performance.now() - t1 };
}

function relire(api, W, octets) {
  const t0 = performance.now();
  const m = api.OpenModel(new Uint8Array(octets), { COORDINATE_TO_ORIGIN: false });
  const ouvertureMs = performance.now() - t0;
  const compte = (t) => api.GetLineIDsWithType(m, t).size();
  const r = {
    ouvertureMs: arrondi(ouvertureMs), schema: api.GetModelSchema(m),
    murs: compte(W.IFCWALL), ouvertures: compte(W.IFCOPENINGELEMENT), videsRel: compte(W.IFCRELVOIDSELEMENT), poteaux: compte(W.IFCCOLUMN),
    niveaux: compte(W.IFCBUILDINGSTOREY), mapConversion: compte(W.IFCMAPCONVERSION), projectedCRS: compte(W.IFCPROJECTEDCRS),
    lignes: api.GetAllLines(m).size(),
  };
  let maillages = 0, triangles = 0;
  const t1 = performance.now();
  api.StreamAllMeshes(m, (mesh) => {
    maillages++;
    for (let i = 0; i < mesh.geometries.size(); i++) {
      const g = api.GetGeometry(m, mesh.geometries.get(i).geometryExpressID);
      triangles += g.GetIndexDataSize() / 3;
      g.delete?.();
    }
  });
  r.maillagesMs = arrondi(performance.now() - t1);
  r.maillages = maillages;
  r.triangles = triangles;
  api.CloseModel(m);
  return r;
}

export async function mesurerIfc(scene) {
  const W = await import("web-ifc");
  const api = new W.IfcAPI();
  api.SetWasmPath(join(ici, "..", "node_modules", "web-ifc") + "/", true);
  await api.Init(undefined, true);
  const res = { version: versionPaquet("web-ifc"), note: "IfcMapConversion : Eastings/Northings/OrthogonalHeight = 0 (valeurs de test, pas une donnée de projet). Validation IfcOpenShell non exécutée." };
  for (const [voie, fn] of [["webIfc", () => ecrireWebIfc(api, W, scene)], ["direct", async () => ecrireDirect(scene)]]) {
    try {
      const { octets, constructionMs, serialisationMs } = await fn();
      const texte = Buffer.from(octets).toString("utf8");
      res[voie] = {
        constructionMs: arrondi(constructionMs), serialisationMs: arrondi(serialisationMs), octets: octets.length,
        entete: texte.split("\n").filter((l) => /^FILE_(SCHEMA|DESCRIPTION|NAME)\(/.test(l)),
        relecture: relire(api, W, octets),
      };
    } catch (e) {
      res[voie] = { erreur: String(e?.stack ?? e).slice(0, 800) };
    }
  }
  return res;
}
