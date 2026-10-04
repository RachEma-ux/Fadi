/**
 * Export IFC 4.3 (IFC4X3_ADD2, ISO 16739-1:2024) du sous-ensemble de l'annexe C du cahier des charges : écriture
 * directe du fichier STEP (ISO 10303-21) depuis le modèle typé (décision D-013), sans dépendance. Conformité
 * **testée** en CI avec IfcOpenShell, jamais « certifiée » (D-006).
 *
 * Choix d'écriture :
 * - repère : le repère local du projet est le système de coordonnées du fichier ; `IfcMapConversion` le relie au
 *   CRS de la parcelle (`IfcProjectedCRS`, EPSG) par la translation explicite `cadastral = local + origine`, sans
 *   rotation ni échelle ; aucune altitude absolue n'est connue : hauteur orthogonale 0, signalée dans le rapport ;
 * - placements : chaque produit est placé par rapport à son étage ; géométrie en coordonnées de l'étage ;
 * - formes : extrusions paramétriques pour murs (corps plein, vidé par les `IfcOpeningElement`), dalles, poteaux,
 *   pièces ; maillage triangulé (`IfcTriangulatedFaceSet`, issu des maillages purs) pour escaliers, toitures en
 *   pente, solides, garde-corps et composants ;
 * - identités : GlobalId déterministe (empreinte du projet et de l'identifiant Fadi), le même objet garde son
 *   GlobalId d'un export à l'autre ; l'identifiant Fadi est aussi écrit en propriété (`Fadi_Identite`) ;
 * - reproductibilité : l'horodatage du fichier est fourni par l'appelant (instant de la révision exportée).
 */
import { aireNette, facesMur, normalise, perp, sub, type Vec } from "../geometrie.js";
import type { Definition, ModeleAtelier, Niveau, Occurrence, OccurrenceQuelconque } from "../modele.js";
import { niveauxOrdonnes } from "../modele.js";
import { etendueMur, maillageObjet } from "../projection/maillage.js";
import { empreinte } from "../documents/empreinte.js";
import { compositionMur, lireCouches } from "../compositions.js";
import { polygoneMurRaccorde, raccordMur } from "../raccords.js";

export const SCHEMA_IFC = "IFC4X3_ADD2";

// --- STEP ---------------------------------------------------------------------------------------------------------

/** Chaîne STEP : apostrophes doublées, barre oblique inverse doublée, hors ASCII en \X2\…\X0\. */
export function chaineStep(t: string): string {
  let out = "";
  let ext = "";
  const vider = () => {
    if (ext) {
      out += `\\X2\\${ext}\\X0\\`;
      ext = "";
    }
  };
  for (const ch of t) {
    const c = ch.codePointAt(0)!;
    if (c >= 0x20 && c <= 0x7e) {
      vider();
      out += ch === "'" ? "''" : ch === "\\" ? "\\\\" : ch;
    } else if (c <= 0xffff) ext += c.toString(16).toUpperCase().padStart(4, "0");
    else {
      // Hors du plan multilingue de base : paire de substitution UTF-16.
      for (const u of String.fromCodePoint(c).split("")) ext += u.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0");
    }
  }
  vider();
  return `'${out}'`;
}

/** Réel STEP : toujours un point décimal ; arrondi au nanomètre pour la reproductibilité. */
export function reelStep(v: number): string {
  const r = Math.round(v * 1e9) / 1e9;
  if (Object.is(r, -0) || r === 0) return "0.";
  if (Number.isInteger(r)) return `${r}.`;
  const s = String(r);
  if (s.includes("e")) {
    const [m, e] = s.split("e");
    return `${m!.includes(".") ? m : `${m}.`}E${e}`;
  }
  return s;
}

const CARACTERES_GUID = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$";

/** GlobalId IFC (22 caractères, base 64 IFC) déterministe à partir d'une clé. */
export function guidIfc(cle: string): string {
  const hex = [0, 1].map((k) => empreinte(`${k}:${cle}`)).join("");
  let n = BigInt(`0x${hex}`);
  let out = "";
  for (let i = 0; i < 22; i++) {
    out = CARACTERES_GUID[Number(n & 63n)]! + out;
    n >>= 6n;
  }
  // 22 × 6 = 132 bits : le premier caractère ne porte que 2 bits (0–3), comme un GUID compressé IFC.
  return CARACTERES_GUID[Number(BigInt(CARACTERES_GUID.indexOf(out[0]!)) & 3n)]! + out.slice(1);
}

class Step {
  lignes: string[] = [];
  private n = 0;
  ajouter(entite: string): number {
    this.n++;
    this.lignes.push(`#${this.n}=${entite};`);
    return this.n;
  }
}

const ref = (n: number) => `#${n}`;
const liste = (ns: readonly (number | string)[]) => `(${ns.map((x) => (typeof x === "number" ? ref(x) : x)).join(",")})`;
const opt = (t: string | null | undefined) => (t === null || t === undefined || t === "" ? "$" : chaineStep(t));

// --- Rapport ------------------------------------------------------------------------------------------------------

export interface LigneRapportEchange {
  classe: string;
  source: number;
  cible: number;
  ifc: string;
  representation: string;
  remarques: string[];
}

export interface RapportEchange {
  format: "IFC4X3_ADD2";
  sens: "export" | "import";
  classes: LigneRapportEchange[];
  /** Pertes et transformations à connaître (objets omis, propriétés non portées, valeurs écrites par convention). */
  remarques: string[];
  /** Références à réparer au moment de l'échange (cotes, contraintes). */
  aReparer: number;
}

export interface OptionsExportIfc {
  projet: { id: string; nom: string; code: string };
  revision: number;
  /** Horodatage ISO 8601 du fichier (instant de la révision exportée). */
  horodatage: string;
  auteur?: string | null;
}

// --- Export -------------------------------------------------------------------------------------------------------

export function exporterIfc(etat: ModeleAtelier, options: OptionsExportIfc): { contenu: string; rapport: RapportEchange } {
  const s = new Step();
  const cleProjet = options.projet.id;
  const gid = (id: string) => chaineStep(guidIfc(`${cleProjet}|${id}`));
  const lignes = new Map<string, LigneRapportEchange>();
  const remarques = new Set<string>();
  const compter = (classe: string, ifc: string, representation: string, exporte: boolean, remarque?: string) => {
    const l = lignes.get(classe) ?? { classe, source: 0, cible: 0, ifc, representation, remarques: [] };
    l.source++;
    if (exporte) l.cible++;
    if (remarque && !l.remarques.includes(remarque)) l.remarques.push(remarque);
    lignes.set(classe, l);
  };

  // Unités, contexte, repères.
  const metre = s.ajouter("IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)");
  const m2 = s.ajouter("IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.)");
  const m3 = s.ajouter("IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.)");
  const rad = s.ajouter("IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.)");
  const unites = s.ajouter(`IFCUNITASSIGNMENT(${liste([metre, m2, m3, rad])})`);
  const origine3 = s.ajouter("IFCCARTESIANPOINT((0.,0.,0.))");
  const axeZ = s.ajouter("IFCDIRECTION((0.,0.,1.))");
  const axeX = s.ajouter("IFCDIRECTION((1.,0.,0.))");
  const sco = s.ajouter(`IFCAXIS2PLACEMENT3D(${ref(origine3)},${ref(axeZ)},${ref(axeX)})`);
  const contexte = s.ajouter(`IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,${ref(sco)},$)`);
  const corps = s.ajouter(`IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Body','Model',*,*,*,*,${ref(contexte)},$,.MODEL_VIEW.,$)`);
  const axe = s.ajouter(`IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Axis','Model',*,*,*,*,${ref(contexte)},$,.GRAPH_VIEW.,$)`);
  const emprise = s.ajouter(`IFCGEOMETRICREPRESENTATIONSUBCONTEXT('FootPrint','Model',*,*,*,*,${ref(contexte)},$,.MODEL_VIEW.,$)`);
  const annotation = s.ajouter(`IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Annotation','Plan',*,*,*,*,${ref(contexte)},$,.PLAN_VIEW.,$)`);
  const parcelle = etat.site.parcelle;
  if (parcelle) {
    const crs = s.ajouter(`IFCPROJECTEDCRS(${chaineStep(parcelle.crs)},${chaineStep("Repère cadastral de la parcelle (transmis par l'outil Parcelle)")},$,$,$,$,${ref(metre)})`);
    s.ajouter(`IFCMAPCONVERSION(${ref(contexte)},${ref(crs)},${reelStep(parcelle.origineLocale.x)},${reelStep(parcelle.origineLocale.y)},0.,1.,0.,1.)`);
    remarques.add(`IfcMapConversion : cadastral (${parcelle.crs}) = local + (${parcelle.origineLocale.x} ; ${parcelle.origineLocale.y}), sans rotation ni échelle ; hauteur orthogonale 0 écrite par convention (aucune altitude absolue dans le modèle).`);
  } else remarques.add("Aucune parcelle : pas d'IfcMapConversion, le fichier reste dans le repère local du projet.");

  const projet = s.ajouter(`IFCPROJECT(${gid("projet")},$,${chaineStep(`${options.projet.code} — ${options.projet.nom}`)},$,$,$,$,${liste([contexte])},${ref(unites)})`);
  const placementSite = s.ajouter(`IFCLOCALPLACEMENT($,${ref(sco)})`);
  // Emprise de la parcelle sur le site (repère local).
  let repSite = "$";
  if (parcelle) {
    const pts = parcelle.sommets.map((v) => s.ajouter(`IFCCARTESIANPOINT((${reelStep(v.cadastral.x - parcelle.origineLocale.x)},${reelStep(v.cadastral.y - parcelle.origineLocale.y)}))`));
    const poly = s.ajouter(`IFCPOLYLINE(${liste([...pts, pts[0]!])})`);
    const r = s.ajouter(`IFCSHAPEREPRESENTATION(${ref(emprise)},'FootPrint','Curve2D',${liste([poly])})`);
    repSite = ref(s.ajouter(`IFCPRODUCTDEFINITIONSHAPE($,$,${liste([r])})`));
  }
  const site = s.ajouter(`IFCSITE(${gid("site")},$,${chaineStep(parcelle ? `Parcelle (${parcelle.crs})` : "Site")},$,$,${ref(placementSite)},${repSite},$,.ELEMENT.,$,$,$,$,$)`);
  const placementBat = s.ajouter(`IFCLOCALPLACEMENT(${ref(placementSite)},${ref(sco)})`);
  const batiment = s.ajouter(`IFCBUILDING(${gid("batiment")},$,${chaineStep(options.projet.nom || "Bâtiment")},$,$,${ref(placementBat)},$,$,.ELEMENT.,$,$,$)`);
  s.ajouter(`IFCRELAGGREGATES(${gid("rel-projet-site")},$,$,$,${ref(projet)},${liste([site])})`);
  s.ajouter(`IFCRELAGGREGATES(${gid("rel-site-batiment")},$,$,$,${ref(site)},${liste([batiment])})`);

  // Étages.
  const niveaux = niveauxOrdonnes(etat);
  const etages = new Map<string, { id: number; placement: number; niveau: Niveau }>();
  for (const n of niveaux) {
    const p = s.ajouter(`IFCCARTESIANPOINT((0.,0.,${reelStep(n.elevation)}))`);
    const a = s.ajouter(`IFCAXIS2PLACEMENT3D(${ref(p)},$,$)`);
    const placement = s.ajouter(`IFCLOCALPLACEMENT(${ref(placementBat)},${ref(a)})`);
    const id = s.ajouter(`IFCBUILDINGSTOREY(${gid(`niveau|${n.id}`)},$,${chaineStep(n.nom)},$,$,${ref(placement)},$,$,.ELEMENT.,${reelStep(n.elevation)})`);
    etages.set(n.id, { id, placement, niveau: n });
    compter("niveau", "IfcBuildingStorey", "—", true);
  }
  if (etages.size) s.ajouter(`IFCRELAGGREGATES(${gid("rel-batiment-etages")},$,$,$,${ref(batiment)},${liste([...etages.values()].map((e) => e.id))})`);

  const contenus = new Map<number, number[]>();
  const contenir = (niveauId: string | null, produit: number) => {
    const e = niveauId ? etages.get(niveauId) : undefined;
    const cle = e ? e.id : batiment;
    const l = contenus.get(cle) ?? [];
    l.push(produit);
    contenus.set(cle, l);
  };
  const psets: { objets: number[]; nom: string; proprietes: string[] }[] = [];
  const pset = (objet: number, nom: string, proprietes: (string | null)[]) => {
    const props = proprietes.filter((x): x is string => !!x);
    if (props.length) psets.push({ objets: [objet], nom, proprietes: props });
  };
  const prop = (nom: string, valeur: string) => s.ajouter(`IFCPROPERTYSINGLEVALUE(${chaineStep(nom)},$,${valeur},$)`);
  const label = (v: string) => `IFCLABEL(${chaineStep(v)})`;
  const texte = (v: string) => `IFCTEXT(${chaineStep(v)})`;
  const identite = (n: number, o: OccurrenceQuelconque) =>
    pset(n, "Fadi_Identite", [
      String(prop("Identifiant", `IFCIDENTIFIER(${chaineStep(o.id)})`)),
      o.calqueId ? String(prop("Calque", label(etat.calques[o.calqueId]?.nom ?? o.calqueId))) : null,
      o.phase ? String(prop("Phase", label(o.phase))) : null,
      o.definitionId && etat.definitions[o.definitionId] ? String(prop("Type", label(etat.definitions[o.definitionId]!.nom))) : null,
    ].map((x) => (x ? `#${x}` : null)));

  const placementDe = (niveauId: string | null) => {
    const e = niveauId ? etages.get(niveauId) : undefined;
    return s.ajouter(`IFCLOCALPLACEMENT(${ref(e ? e.placement : placementBat)},${ref(sco)})`);
  };
  const z0 = (niveauId: string | null) => (niveauId ? (etat.niveaux[niveauId]?.elevation ?? 0) : 0);
  const pt3 = (x: number, y: number, z: number) => s.ajouter(`IFCCARTESIANPOINT((${reelStep(x)},${reelStep(y)},${reelStep(z)}))`);
  const dir3 = (x: number, y: number, z: number) => s.ajouter(`IFCDIRECTION((${reelStep(x)},${reelStep(y)},${reelStep(z)}))`);
  const polyligne2 = (pts: readonly Vec[], fermer: boolean) => {
    const ids = pts.map((p) => s.ajouter(`IFCCARTESIANPOINT((${reelStep(p.x)},${reelStep(p.y)}))`));
    return s.ajouter(`IFCPOLYLINE(${liste(fermer ? [...ids, ids[0]!] : ids)})`);
  };
  const forme = (reps: number[]) => s.ajouter(`IFCPRODUCTDEFINITIONSHAPE($,$,${liste(reps)})`);
  /** Extrusion verticale d'un contour (repère de l'étage), de z à z + h. */
  const extrusionContour = (contour: readonly Vec[], trous: readonly (readonly Vec[])[], z: number, h: number) => {
    const ext = polyligne2(contour, true);
    const profil = trous.length ? s.ajouter(`IFCARBITRARYPROFILEDEFWITHVOIDS(.AREA.,$,${ref(ext)},${liste(trous.map((t) => polyligne2(t, true)))})`) : s.ajouter(`IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,${ref(ext)})`);
    const position = s.ajouter(`IFCAXIS2PLACEMENT3D(${ref(pt3(0, 0, z))},$,$)`);
    return s.ajouter(`IFCEXTRUDEDAREASOLID(${ref(profil)},${ref(position)},${ref(axeZ)},${reelStep(h)})`);
  };
  /** Boîte orientée : origine, direction u dans le plan, abscisses [s0, s1], décalages [o0, o1], hauteurs [za, zb]. */
  const boite = (o: Vec, u: Vec, s0: number, s1: number, o0: number, o1: number, za: number, zb: number) => {
    const centre = s.ajouter(`IFCCARTESIANPOINT((${reelStep((s0 + s1) / 2)},${reelStep((o0 + o1) / 2)}))`);
    const pos2 = s.ajouter(`IFCAXIS2PLACEMENT2D(${ref(centre)},$)`);
    const profil = s.ajouter(`IFCRECTANGLEPROFILEDEF(.AREA.,$,${ref(pos2)},${reelStep(s1 - s0)},${reelStep(o1 - o0)})`);
    const position = s.ajouter(`IFCAXIS2PLACEMENT3D(${ref(pt3(o.x, o.y, za))},${ref(axeZ)},${ref(dir3(u.x, u.y, 0))})`);
    return s.ajouter(`IFCEXTRUDEDAREASOLID(${ref(profil)},${ref(position)},${ref(axeZ)},${reelStep(zb - za)})`);
  };
  const corpsSolide = (items: number[]) => s.ajouter(`IFCSHAPEREPRESENTATION(${ref(corps)},'Body','SweptSolid',${liste(items)})`);
  /** Maillage pur → IfcTriangulatedFaceSet en coordonnées de l'étage. */
  const corpsMaille = (o: OccurrenceQuelconque): number | null => {
    const m = maillageObjet(etat, o);
    if (!m || !m.indices.length) return null;
    const dz = z0(o.niveauId);
    const coords: string[] = [];
    for (let i = 0; i < m.positions.length; i += 3) coords.push(`(${reelStep(m.positions[i]!)},${reelStep(m.positions[i + 1]!)},${reelStep(m.positions[i + 2]! - dz)})`);
    const liste3 = s.ajouter(`IFCCARTESIANPOINTLIST3D((${coords.join(",")}),$)`);
    const tri: string[] = [];
    for (let k = 0; k < m.indices.length; k += 3) tri.push(`(${m.indices[k]! + 1},${m.indices[k + 1]! + 1},${m.indices[k + 2]! + 1})`);
    const fs = s.ajouter(`IFCTRIANGULATEDFACESET(${ref(liste3)},$,$,(${tri.join(",")}),$)`);
    return s.ajouter(`IFCSHAPEREPRESENTATION(${ref(corps)},'Body','Tessellation',${liste([fs])})`);
  };

  // Types de murs.
  const typesMur = new Map<string, number>();
  const definitionsMur = Object.values(etat.definitions).filter((d: Definition) => d.classe === "mur").sort((a, b) => (a.id < b.id ? -1 : 1));
  // Compositions (D-026) : un IfcMaterialLayerSet par type de mur composé, associé au type et aux murs cohérents.
  const materiauxIfc = new Map<string, number>();
  const materiauIfc = (nom: string) => {
    let id = materiauxIfc.get(nom);
    if (id === undefined) {
      id = s.ajouter(`IFCMATERIAL(${chaineStep(nom)},$,$)`);
      materiauxIfc.set(nom, id);
    }
    return id;
  };
  const jeuxCouches = new Map<string, number>();
  const associationsMateriau = new Map<number, number[]>();
  for (const d of definitionsMur) {
    const t = s.ajouter(`IFCWALLTYPE(${gid(`type|${d.id}`)},$,${chaineStep(d.nom)},$,$,$,$,$,$,${d.id === "cloison" ? ".PARTITIONING." : ".STANDARD."})`);
    typesMur.set(d.id, t);
    let couches: ReturnType<typeof lireCouches> = null;
    try {
      couches = lireCouches(d.params["couches"]);
    } catch {
      couches = null;
    }
    if (couches) {
      const ids = couches.map((c) => s.ajouter(`IFCMATERIALLAYER(${ref(materiauIfc(c.materiau))},${reelStep(c.epaisseur.value)},${c.fonction === "lame-air" ? ".T." : "$"},${chaineStep(c.materiau)},$,${c.fonction ? chaineStep(c.fonction) : "$"},$)`));
      const jeu = s.ajouter(`IFCMATERIALLAYERSET(${liste(ids)},${chaineStep(d.nom)},$)`);
      jeuxCouches.set(d.id, jeu);
      associationsMateriau.set(jeu, [t]);
    }
  }
  const typage = new Map<number, number[]>();

  const objets = (Object.values(etat.objets) as OccurrenceQuelconque[]).sort((a, b) => (a.id < b.id ? -1 : 1));
  const produits = new Map<string, number>();
  const ouverturesParMur = new Map<string, Occurrence<"porte" | "fenetre" | "ouverture">[]>();
  for (const o of objets) if (o.classe === "porte" || o.classe === "fenetre" || o.classe === "ouverture") ouverturesParMur.set(o.params.murHoteId, [...(ouverturesParMur.get(o.params.murHoteId) ?? []), o]);
  const espacesParId = new Map<string, number>();
  const espacesParEtage = new Map<string, number[]>();

  for (const o of objets) {
    const nom = ("nom" in o.params && typeof o.params.nom === "string" && o.params.nom) || null;
    switch (o.classe) {
      case "mur": {
        const { a, b, epaisseur, alignement } = o.params;
        const L = Math.hypot(b.x - a.x, b.y - a.y);
        const u = normalise(sub(b, a));
        const n = perp(u);
        const f = facesMur(a, b, epaisseur.value, alignement);
        const oG = (f.gauche[0].x - a.x) * n.x + (f.gauche[0].y - a.y) * n.y;
        const oD = (f.droite[0].x - a.x) * n.x + (f.droite[0].y - a.y) * n.y;
        const reps: number[] = [];
        const etendue = etendueMur(etat, o);
        // Corps d'abord (représentation lue par défaut par la plupart des visualiseurs), axe ensuite.
        // Repère propre au mur (D-030) : origine en a, X le long de l'axe, Y vers la face gauche — l'axe, le corps et
        // l'usage des couches (`IfcMaterialLayerSetUsage`, AXIS2) s'y écrivent.
        const versLocal = (q: Vec): Vec => ({ x: (q.x - a.x) * u.x + (q.y - a.y) * u.y, y: (q.x - a.x) * n.x + (q.y - a.y) * n.y });
        const etage = o.niveauId ? etages.get(o.niveauId) : undefined;
        const placementMur = s.ajouter(`IFCLOCALPLACEMENT(${ref(etage ? etage.placement : placementBat)},${ref(s.ajouter(`IFCAXIS2PLACEMENT3D(${ref(pt3(a.x, a.y, 0))},${ref(axeZ)},${ref(dir3(u.x, u.y, 0))})`))})`);
        // Raccords (D-023) : un mur dont une extrémité est raccordée est extrudé depuis son contour raccordé.
        const raccord = raccordMur(etat, o);
        const raccorde = !!raccord && (Math.abs(raccord.gauche[0]) > 1e-9 || Math.abs(raccord.droite[0]) > 1e-9 || Math.abs(raccord.gauche[1] - L) > 1e-9 || Math.abs(raccord.droite[1] - L) > 1e-9 || !!raccord.pointes?.some((x) => x));
        if (etendue) reps.push(corpsSolide([raccorde ? extrusionContour(polygoneMurRaccorde(etat, o).map(versLocal), [], etendue[0] - z0(o.niveauId), etendue[1] - etendue[0]) : boite({ x: 0, y: 0 }, { x: 1, y: 0 }, 0, L, Math.min(oG, oD), Math.max(oG, oD), etendue[0] - z0(o.niveauId), etendue[1] - z0(o.niveauId))]));
        reps.push(s.ajouter(`IFCSHAPEREPRESENTATION(${ref(axe)},'Axis','Curve2D',${liste([polyligne2([{ x: 0, y: 0 }, { x: L, y: 0 }], false)])})`));
        const id = s.ajouter(`IFCWALL(${gid(o.id)},$,${opt(nom ?? o.id)},$,$,${ref(placementMur)},${ref(forme(reps))},$,${o.definitionId === "cloison" ? ".PARTITIONING." : ".STANDARD."})`);
        produits.set(o.id, id);
        contenir(o.niveauId, id);
        identite(id, o);
        pset(id, "Pset_WallCommon", [`#${prop("IsExternal", `IFCBOOLEAN(${o.params.exterieur ? ".T." : ".F."})`)}`]);
        if (o.definitionId && typesMur.has(o.definitionId)) typage.set(typesMur.get(o.definitionId)!, [...(typage.get(typesMur.get(o.definitionId)!) ?? []), id]);
        const composition = compositionMur(etat, o);
        if (composition && composition.coherente && jeuxCouches.has(composition.typeId)) {
          // Usage des couches : de la face gauche (décalage oG sur Y local) vers la face droite (sens négatif de Y).
          const usage = s.ajouter(`IFCMATERIALLAYERSETUSAGE(${ref(jeuxCouches.get(composition.typeId)!)},.AXIS2.,.NEGATIVE.,${reelStep(oG)},$)`);
          associationsMateriau.set(usage, [id]);
        } else if (composition && !composition.coherente) remarques.add(`Mur ${o.id} : épaisseur différente de la composition du type « ${composition.typeNom} » (écart ${Math.round(composition.ecart * 1000)} mm) : couches non écrites.`);
        compter("mur", "IfcWall", etendue ? "Axis + SweptSolid (corps plein vidé par les ouvertures)" : "Axis", true, etendue ? undefined : "mur sans hauteur : axe seul, sans volume (hauteur non évaluée)");
        // Ouvertures hébergées : vide + élément de remplissage.
        for (const ouv of ouvertesTriees(ouverturesParMur.get(o.id) ?? [])) {
          const c = ouv.params.position * L;
          const w = ouv.params.largeur.value;
          const zb = (etendue?.[0] ?? z0(o.niveauId)) - z0(o.niveauId) + (ouv.params.allege?.value ?? 0);
          const marge = 0.01;
          const vide = boite(a, u, c - w / 2, c + w / 2, Math.min(oG, oD) - marge, Math.max(oG, oD) + marge, zb, zb + ouv.params.hauteur.value);
          const ouverture = s.ajouter(`IFCOPENINGELEMENT(${gid(`vide|${ouv.id}`)},$,${chaineStep(`Vide ${ouv.params.repere ?? ouv.id}`)},$,$,${ref(placementDe(o.niveauId))},${ref(forme([corpsSolide([vide])]))},$,.OPENING.)`);
          s.ajouter(`IFCRELVOIDSELEMENT(${gid(`rel-vide|${ouv.id}`)},$,$,$,${ref(id)},${ref(ouverture)})`);
          if (ouv.classe === "ouverture") {
            produits.set(ouv.id, ouverture);
            compter("ouverture", "IfcOpeningElement", "SweptSolid", true);
            continue;
          }
          const ep = ouv.classe === "porte" ? 0.04 : 0.03;
          const centre = (oG + oD) / 2;
          const classeIfc = ouv.classe === "porte" ? "IFCDOOR" : "IFCWINDOW";
          let placementRemplissage: number;
          let panneau: number;
          let operation = "$";
          const ouvrant = ouv.classe === "porte" ? ouv.params.ouvrant : null;
          if (ouvrant) {
            // Sens renseigné (D-037) : repère propre à la porte, Y dans le sens d'ouverture, X le long de la baie ;
            // gauche / droite « vu dans le sens +Y » (IfcDoorTypeOperationEnum) : charnière du côté de X minimal → LEFT.
            const y = ouvrant.cote === "gauche" ? n : { x: -n.x, y: -n.y };
            const x = { x: y.y, y: -y.x };
            const sCharniere = ouvrant.charniere === "debut" ? c - w / 2 : c + w / 2;
            const sAutre = ouvrant.charniere === "debut" ? c + w / 2 : c - w / 2;
            const surAxe = (sv: number) => ({ x: a.x + u.x * sv + n.x * centre, y: a.y + u.y * sv + n.y * centre });
            const pc = surAxe(sCharniere);
            const pa = surAxe(sAutre);
            const gaucheVu = (pa.x - pc.x) * x.x + (pa.y - pc.y) * x.y > 0; // l'autre tableau du côté +X : charnière à gauche
            const origine = gaucheVu ? pc : pa;
            operation = gaucheVu ? ".SINGLE_SWING_LEFT." : ".SINGLE_SWING_RIGHT.";
            const etage = o.niveauId ? etages.get(o.niveauId) : undefined;
            placementRemplissage = s.ajouter(`IFCLOCALPLACEMENT(${ref(etage ? etage.placement : placementBat)},${ref(s.ajouter(`IFCAXIS2PLACEMENT3D(${ref(pt3(origine.x, origine.y, 0))},${ref(axeZ)},${ref(dir3(x.x, x.y, 0))})`))})`);
            panneau = boite({ x: 0, y: 0 }, { x: 1, y: 0 }, 0, w, -ep / 2, ep / 2, zb, zb + ouv.params.hauteur.value);
          } else {
            panneau = boite(a, u, c - w / 2, c + w / 2, centre - ep / 2, centre + ep / 2, zb, zb + ouv.params.hauteur.value);
            placementRemplissage = placementDe(o.niveauId);
          }
          const remplissage = s.ajouter(`${classeIfc}(${gid(ouv.id)},$,${opt(ouv.params.repere ?? ouv.id)},$,$,${ref(placementRemplissage)},${ref(forme([corpsSolide([panneau])]))},${opt(ouv.params.repere)},${reelStep(ouv.params.hauteur.value)},${reelStep(w)},${ouv.classe === "porte" ? ".DOOR." : ".WINDOW."},${operation},$)`);
          s.ajouter(`IFCRELFILLSELEMENT(${gid(`rel-remplit|${ouv.id}`)},$,$,$,${ref(ouverture)},${ref(remplissage)})`);
          produits.set(ouv.id, remplissage);
          contenir(o.niveauId, remplissage);
          identite(remplissage, ouv);
          compter(ouv.classe, ouv.classe === "porte" ? "IfcDoor" : "IfcWindow", "SweptSolid (panneau) + IfcOpeningElement", true, ouv.classe === "porte" && !ouvrant ? "sens d'ouverture non renseigné : OperationType non écrit" : undefined);
        }
        break;
      }
      case "porte":
      case "fenetre":
      case "ouverture":
        if (!etat.objets[o.params.murHoteId]) compter(o.classe, o.classe === "porte" ? "IfcDoor" : o.classe === "fenetre" ? "IfcWindow" : "IfcOpeningElement", "—", false, "mur hôte introuvable : omise");
        break; // écrites avec leur mur hôte
      case "dalle": {
        const solide = extrusionContour(o.params.contour, o.params.trous, o.params.decalageBase.value, o.params.epaisseur.value);
        const id = s.ajouter(`IFCSLAB(${gid(o.id)},$,${opt(nom ?? o.id)},$,$,${ref(placementDe(o.niveauId))},${ref(forme([corpsSolide([solide])]))},$,.FLOOR.)`);
        produits.set(o.id, id);
        contenir(o.niveauId, id);
        identite(id, o);
        compter("dalle", "IfcSlab (FLOOR)", "SweptSolid", true);
        break;
      }
      case "toiture": {
        const enPente = o.params.type !== "plate" && !!o.params.pente;
        const rep = enPente ? corpsMaille(o) : corpsSolide([extrusionContour(o.params.contour, o.params.trous, o.params.decalageBase.value, o.params.epaisseur.value)]);
        const dalle = s.ajouter(`IFCSLAB(${gid(`pan|${o.id}`)},$,${opt(nom ?? o.id)},$,$,${ref(placementDe(o.niveauId))},${rep ? ref(forme([rep])) : "$"},$,.ROOF.)`);
        const toit = s.ajouter(`IFCROOF(${gid(o.id)},$,${opt(nom ?? o.id)},$,$,${ref(placementDe(o.niveauId))},$,$,${o.params.type === "bipente" ? ".GABLE_ROOF." : o.params.type === "monopente" ? ".SHED_ROOF." : ".FLAT_ROOF."})`);
        s.ajouter(`IFCRELAGGREGATES(${gid(`rel-toit|${o.id}`)},$,$,$,${ref(toit)},${liste([dalle])})`);
        produits.set(o.id, toit);
        contenir(o.niveauId, toit);
        identite(toit, o);
        if (o.params.pente) pset(toit, "Pset_RoofCommon", [`#${prop("Reference", label(`${o.params.type} ${o.params.pente.value}°`))}`]);
        compter("toiture", "IfcRoof + IfcSlab (ROOF)", enPente ? "Tessellation" : "SweptSolid", true, o.params.type !== "plate" && !o.params.pente ? "pente non renseignée : écrite plate" : undefined);
        break;
      }
      case "escalier":
      case "solide":
      case "garde-corps":
      case "bloc-occurrence": {
        const def = o.classe === "bloc-occurrence" && o.definitionId ? etat.definitions[o.definitionId] : undefined;
        if (o.classe === "bloc-occurrence" && def?.classe !== "composant") {
          compter("bloc-occurrence", "—", "—", false, "bloc de dessin 2D : omis (le DXF des vues le porte)");
          break;
        }
        const rep = corpsMaille(o);
        const classeIfc = o.classe === "escalier" ? "IFCSTAIR" : o.classe === "garde-corps" ? "IFCRAILING" : "IFCBUILDINGELEMENTPROXY";
        const type = o.classe === "escalier" ? ".NOTDEFINED." : o.classe === "garde-corps" ? ".GUARDRAIL." : ".NOTDEFINED.";
        const id = s.ajouter(`${classeIfc}(${gid(o.id)},$,${opt(nom ?? (def ? def.nom : o.id))},$,${o.classe === "solide" ? chaineStep(o.params.role) : "$"},${ref(placementDe(o.niveauId))},${rep ? ref(forme([rep])) : "$"},$,${type})`);
        produits.set(o.id, id);
        contenir(o.niveauId, id);
        identite(id, o);
        if (o.classe === "escalier")
          pset(id, "Pset_StairCommon", [
            o.params.contremarches ? `#${prop("NumberOfRiser", `IFCCOUNTMEASURE(${o.params.contremarches})`)}` : null,
            o.params.marches ? `#${prop("NumberOfTreads", `IFCCOUNTMEASURE(${o.params.marches})`)}` : null,
            o.params.contremarches ? `#${prop("RiserHeight", `IFCPOSITIVELENGTHMEASURE(${reelStep(o.params.hauteurAFranchir.value / o.params.contremarches)})`)}` : null,
          ]);
        if (o.classe === "solide") pset(id, "Fadi_Solide", [`#${prop("Role", label(o.params.role))}`]);
        if (o.classe === "garde-corps") pset(id, "Fadi_GardeCorps", [`#${prop("Hauteur", `IFCPOSITIVELENGTHMEASURE(${reelStep(o.params.hauteur.value)})`)}`, `#${prop("Remplissage", label(o.params.remplissage))}`]);
        if (def) {
          const pd = def.params as { proprietes?: Record<string, { valeur: unknown; unite: string | null }>; classification?: string | null };
          pset(id, "Fadi_Composant", [
            `#${prop("Definition", label(def.nom))}`,
            `#${prop("Version", `IFCINTEGER(${def.version})`)}`,
            `#${prop("Classification", label(pd.classification ?? "non classé"))}`,
            ...Object.entries(pd.proprietes ?? {}).map(([k, v]) => `#${prop(k, typeof v.valeur === "number" ? `IFCREAL(${reelStep(v.valeur)})` : typeof v.valeur === "boolean" ? `IFCBOOLEAN(${v.valeur ? ".T." : ".F."})` : label(String(v.valeur)))}`),
          ]);
        }
        const libelle = o.classe === "escalier" ? "IfcStair" : o.classe === "garde-corps" ? "IfcRailing" : "IfcBuildingElementProxy";
        compter(o.classe, libelle, rep ? "Tessellation" : "—", true, rep ? (o.classe === "solide" ? "rôle porté par ObjectType et Fadi_Solide.Role (jamais reclassé)" : undefined) : "sans volume (hauteur non renseignée) : sans représentation");
        break;
      }
      case "objet-importe": {
        // Représentation importée : réécrite telle quelle (maillage), GlobalId d'origine conservé, classe d'origine
        // en ObjectType et en propriété — jamais reclassée en objet paramétrique.
        const rep = corpsMaille(o);
        const id = s.ajouter(`IFCBUILDINGELEMENTPROXY(${chaineStep(o.params.globalId)},$,${opt(o.params.nom ?? o.id)},$,${chaineStep(o.params.ifcClasse)},${ref(placementDe(o.niveauId))},${rep ? ref(forme([rep])) : "$"},$,.NOTDEFINED.)`);
        produits.set(o.id, id);
        contenir(o.niveauId, id);
        identite(id, o);
        pset(id, "Fadi_Import", [`#${prop("ClasseIfc", label(o.params.ifcClasse))}`, `#${prop("GlobalIdOrigine", `IFCIDENTIFIER(${chaineStep(o.params.globalId)})`)}`, o.params.type ? `#${prop("TypeOrigine", label(o.params.type))}` : null, o.params.source ? `#${prop("Source", label(o.params.source))}` : null]);
        compter("objet-importe", "IfcBuildingElementProxy", rep ? "Tessellation" : "—", true, "représentation importée : maillage réécrit, classe d'origine en ObjectType et Fadi_Import.ClasseIfc, GlobalId d'origine conservé");
        break;
      }
      case "poteau": {
        const h = o.params.hauteur?.value;
        const ang = (o.params.angle.value * Math.PI) / 180;
        const u = { x: Math.cos(ang), y: Math.sin(ang) };
        const lx = o.params.largeur.value / 2;
        const ly = o.params.profondeur.value / 2;
        const rep = h ? forme([corpsSolide([boite(o.params.point, u, -lx, lx, -ly, ly, 0, h)])]) : null;
        const id = s.ajouter(`IFCCOLUMN(${gid(o.id)},$,${opt(nom ?? o.id)},$,$,${ref(placementDe(o.niveauId))},${rep ? ref(rep) : "$"},$,.COLUMN.)`);
        produits.set(o.id, id);
        contenir(o.niveauId, id);
        identite(id, o);
        compter("poteau", "IfcColumn", h ? "SweptSolid" : "—", true, h ? undefined : "hauteur non renseignée : sans représentation");
        break;
      }
      case "piece":
      case "espace": {
        const contours = o.classe === "piece" ? [{ contour: o.params.contour, trous: o.params.trous }] : o.params.polygones;
        const hauteur = o.niveauId ? etat.niveaux[o.niveauId]?.hauteur : null;
        const reps: number[] = [];
        if (hauteur) reps.push(corpsSolide(contours.map((c) => extrusionContour(c.contour, c.trous, 0, hauteur))));
        reps.push(s.ajouter(`IFCSHAPEREPRESENTATION(${ref(emprise)},'FootPrint','Curve2D',${liste(contours.map((c) => polyligne2(c.contour, true)))})`));
        const code = o.classe === "piece" ? o.params.code : o.params.code;
        const id = s.ajouter(`IFCSPACE(${gid(o.id)},$,${opt(code ?? o.params.nom)},$,${o.classe === "espace" ? chaineStep("Espace déclaré") : "$"},${ref(placementDe(o.niveauId))},${ref(forme(reps))},${opt(o.params.nom)},.ELEMENT.,.SPACE.,$)`);
        produits.set(o.id, id);
        espacesParId.set(o.id, id);
        // Un espace est un élément de structure spatiale : il décompose l'étage (IfcRelAggregates), il n'y est pas « contenu ».
        if (o.niveauId && etages.has(o.niveauId)) espacesParEtage.set(o.niveauId, [...(espacesParEtage.get(o.niveauId) ?? []), id]);
        identite(id, o);
        const aire = contours.reduce((acc, c) => acc + aireNette(c.contour, c.trous), 0);
        const q = s.ajouter(`IFCQUANTITYAREA('NetFloorArea',$,$,${reelStep(Math.round(aire * 1e6) / 1e6)},$)`);
        const eq = s.ajouter(`IFCELEMENTQUANTITY(${gid(`qto|${o.id}`)},$,'Qto_SpaceBaseQuantities',$,$,${liste([q])})`);
        s.ajouter(`IFCRELDEFINESBYPROPERTIES(${gid(`rel-qto|${o.id}`)},$,$,$,${liste([id])},${ref(eq)})`);
        const declaree = o.params.aireDeclaree?.value;
        pset(id, "Fadi_Piece", [declaree !== undefined ? `#${prop("AireDeclaree", `IFCAREAMEASURE(${reelStep(declaree)})`)}` : null, o.params.categorie ? `#${prop("Categorie", label(o.params.categorie))}` : null]);
        compter(o.classe, "IfcSpace", hauteur ? "SweptSolid + FootPrint" : "FootPrint", true, `${hauteur ? "" : "hauteur du niveau non renseignée : emprise seule ; "}aire calculée en Qto_SpaceBaseQuantities.NetFloorArea, aire déclarée en Fadi_Piece.AireDeclaree`);
        break;
      }
      case "zone":
        break; // après les espaces (groupes)
      case "cotation":
      case "texte":
      case "etiquette":
      case "esquisse": {
        let item: number;
        if (o.classe === "texte" || o.classe === "etiquette") {
          const p = s.ajouter(`IFCAXIS2PLACEMENT2D(${ref(s.ajouter(`IFCCARTESIANPOINT((${reelStep(o.params.position.x)},${reelStep(o.params.position.y)}))`))},$)`);
          item = s.ajouter(`IFCTEXTLITERAL(${chaineStep(o.params.texte)},${ref(p)},.LEFT.)`);
        } else if (o.classe === "cotation") item = polyligne2([o.params.a, o.params.b], false);
        else {
          const pts = o.params.points.length >= 2 ? o.params.points : o.params.centre ? [o.params.centre, o.params.centre] : [];
          if (pts.length < 2) {
            compter(o.classe, "IfcAnnotation", "—", false, "esquisse sans sommet (cercle, arc) : omise");
            break;
          }
          item = polyligne2(pts, o.params.ferme || o.params.forme === "polygone");
        }
        const rep = s.ajouter(`IFCSHAPEREPRESENTATION(${ref(annotation)},'Annotation','Annotation2D',${liste([item])})`);
        const type = o.classe === "cotation" ? ".DIMENSION." : o.classe === "esquisse" ? ".USERDEFINED." : ".TEXT.";
        const id = s.ajouter(`IFCANNOTATION(${gid(o.id)},$,${opt(o.id)},$,${o.classe === "esquisse" ? chaineStep(`esquisse ${o.params.forme}`) : "$"},${ref(placementDe(o.niveauId))},${ref(forme([rep]))},${type})`);
        produits.set(o.id, id);
        contenir(o.niveauId, id);
        compter(o.classe, "IfcAnnotation", "Annotation2D", true, o.classe === "cotation" ? "export seulement ; valeur et rattachements non portés" : o.classe === "esquisse" ? "export seulement ; arcs et cercles omis, contraintes non portées" : "export seulement");
        break;
      }
      case "reference-plan":
        compter("reference-plan", "—", "—", false, "référence de plan : omise (fond de dessin)");
        break;
    }
  }

  // Zones : groupes des pièces / espaces qu'elles contiennent (relation « contient »).
  for (const z of objets.filter((o): o is Occurrence<"zone"> => o.classe === "zone")) {
    const id = s.ajouter(`IFCZONE(${gid(z.id)},$,${chaineStep(z.params.nom)},$,$,$)`);
    const membres = Object.values(etat.relations).filter((r) => r.kind === "contient" && r.sourceId === z.id).map((r) => espacesParId.get(r.targetId)).filter((x): x is number => x !== undefined);
    if (membres.length) s.ajouter(`IFCRELASSIGNSTOGROUP(${gid(`rel-zone|${z.id}`)},$,$,$,${liste(membres)},$,${ref(id)})`);
    compter("zone", "IfcZone", "—", true, "contour non porté (une IfcZone n'a pas de géométrie) ; membres par IfcRelAssignsToGroup");
  }

  for (const [niveauId, ids] of espacesParEtage) s.ajouter(`IFCRELAGGREGATES(${gid(`rel-espaces|${niveauId}`)},$,$,$,${ref(etages.get(niveauId)!.id)},${liste(ids)})`);
  // Contenance spatiale, typage, propriétés.
  for (const [structure, elements] of contenus) s.ajouter(`IFCRELCONTAINEDINSPATIALSTRUCTURE(${gid(`rel-contenu|${structure}`)},$,$,$,${liste(elements)},${ref(structure)})`);
  for (const [type, objetsTypes] of typage) s.ajouter(`IFCRELDEFINESBYTYPE(${gid(`rel-type|${type}`)},$,$,$,${liste(objetsTypes)},${ref(type)})`);
  for (const [jeu, objetsMat] of associationsMateriau) s.ajouter(`IFCRELASSOCIATESMATERIAL(${gid(`rel-materiau|${jeu}`)},$,$,$,${liste(objetsMat)},${ref(jeu)})`);
  // Hypothèses, sources, structure déclarée : propriétés du projet, statut explicite.
  if (etat.site.hypotheses.length) pset(projet, "Fadi_Hypotheses", etat.site.hypotheses.map((h) => `#${prop(h.id, texte(`${h.domaine} — ${h.texte} (statut : ${h.statut})`))}`));
  if (etat.site.sources.length) pset(projet, "Fadi_Sources", etat.site.sources.map((src) => `#${prop(src.id, texte(JSON.stringify(src.champs).slice(0, 2000)))}`));
  if (etat.site.structure) pset(projet, "Fadi_StructureDeclaree", Object.entries(etat.site.structure).map(([k, v]) => `#${prop(k, texte(`${typeof v === "string" ? v : JSON.stringify(v)} (déclarée, à confirmer)`))}`));
  pset(projet, "Fadi_Export", [`#${prop("Revision", `IFCINTEGER(${options.revision})`)}`, `#${prop("Schema", label(SCHEMA_IFC))}`]);
  psets.forEach((p, i) => {
    const ensemble = s.ajouter(`IFCPROPERTYSET(${gid(`pset|${i}|${p.nom}|${p.objets.join(",")}`)},$,${chaineStep(p.nom)},$,(${p.proprietes.join(",")}))`);
    s.ajouter(`IFCRELDEFINESBYPROPERTIES(${gid(`rel-pset|${i}|${p.nom}|${p.objets.join(",")}`)},$,$,$,${liste(p.objets)},${ref(ensemble)})`);
  });
  const aReparer = Object.values(etat.references).filter((r) => r.etat === "a-reparer").length;
  if (aReparer) remarques.add(`${aReparer} référence(s) à réparer au moment de l'export (non portées par l'IFC).`);
  const natives = (Object.values(etat.objets) as OccurrenceQuelconque[]).reduce((n, o) => n + Object.keys(o.proprietes).filter((k) => k.startsWith("natif:")).length, 0);
  if (natives) remarques.add(`${natives} propriété(s) d'import natif (natif:*) non exportées (conservées dans le paquet natif).`);

  const entete = [
    "ISO-10303-21;",
    "HEADER;",
    `FILE_DESCRIPTION(('ViewDefinition [ReferenceView]'),'2;1');`,
    `FILE_NAME(${chaineStep(`${options.projet.code}_revision_${options.revision}.ifc`)},${chaineStep(options.horodatage)},(${chaineStep(options.auteur ?? "")}),(''),'Fadi — Atelier (atelier-model, écriture directe)','Fadi','');`,
    `FILE_SCHEMA(('${SCHEMA_IFC}'));`,
    "ENDSEC;",
    "DATA;",
  ];
  const contenu = [...entete, ...s.lignes, "ENDSEC;", "END-ISO-10303-21;", ""].join("\n");
  const ordre = ["niveau", "mur", "porte", "fenetre", "ouverture", "dalle", "toiture", "escalier", "poteau", "piece", "espace", "zone", "solide", "garde-corps", "bloc-occurrence", "objet-importe", "cotation", "texte", "etiquette", "esquisse", "reference-plan"];
  return {
    contenu,
    rapport: {
      format: "IFC4X3_ADD2",
      sens: "export",
      classes: [...lignes.values()].sort((a, b) => ordre.indexOf(a.classe) - ordre.indexOf(b.classe)),
      remarques: [...remarques],
      aReparer,
    },
  };
}

function ouvertesTriees<T extends { id: string }>(l: T[]): T[] {
  return [...l].sort((a, b) => (a.id < b.id ? -1 : 1));
}
