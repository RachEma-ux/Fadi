/**
 * Import IFC (lot 6, D-006) — partie pure : d'une lecture déjà faite (par web-ifc côté serveur, ou tout autre lecteur
 * qui produit une `LectureIfc`) aux commandes du modèle typé. Chaque produit devient une **représentation importée**
 * (classe `objet-importe`) : classe et GlobalId d'origine, maillage triangulé, emprise ; aucun paramètre ni historique
 * paramétrique n'est inventé, aucun objet n'est reclassé.
 *
 * Repères (R5) : la lecture fournit les sommets dans le repère du fichier (mètres, Z vers le haut). Quand le fichier
 * porte une `IfcMapConversion` dans le **même** CRS que la parcelle du projet, la conversion vers le repère local est
 * explicite : `local = fichier + (E, N)_fichier − origineLocale_projet` (sans rotation ni échelle ; un fichier avec
 * rotation ou échelle n'est pas converti et le rapport le dit). Sinon les coordonnées sont gardées telles quelles et
 * le rapport l'écrit. Les altitudes sont rendues relatives au niveau d'accueil.
 */
import type { Commande } from "../commandes/index.js";
import type { ModeleAtelier, Niveau, OccurrenceQuelconque } from "../modele.js";
import { niveauxOrdonnes } from "../modele.js";
import { pt } from "../unites.js";
import type { LigneRapportEchange, RapportEchange } from "./ifc.js";

export interface EtageIfcLu {
  globalId: string;
  nom: string | null;
  /** Altitude de l'étage dans le repère du fichier (m). */
  elevation: number;
}

export interface ProduitIfcLu {
  globalId: string;
  /** Classe IFC, casse du schéma (« IfcWall »). */
  classe: string;
  nom: string | null;
  type: string | null;
  etageGlobalId: string | null;
  /** Triangles dans le repère du fichier, en mètres, Z vers le haut. */
  maillage: { positions: number[]; indices: number[] };
  /** Nom du type IFC associé (`IfcRelDefinesByType`), s'il y en a un. */
  typeNom?: string | null;
  /** Matériaux associés (`IfcRelAssociatesMaterial`), couches avec leur épaisseur en mètres quand elle est donnée. */
  materiaux?: { nom: string; epaisseur: number | null }[];
  /** Propriétés simples des jeux de propriétés (`IfcPropertySingleValue`), telles quelles. */
  proprietes?: { ensemble: string; nom: string; valeur: string | number | boolean; mesure: string | null }[];
}

/** Annotation 2D lue (textes et traits), dans le repère du fichier, en mètres, Z vers le haut. */
export interface AnnotationIfcLue {
  globalId: string;
  nom: string | null;
  etageGlobalId: string | null;
  textes: { texte: string; x: number; y: number; z: number }[];
  polylignes: { x: number; y: number; z: number }[][];
}

export interface LectureIfc {
  schema: string;
  /** Nom de l'application qui a écrit le fichier (en-tête), s'il est lisible. */
  application: string | null;
  etages: EtageIfcLu[];
  produits: ProduitIfcLu[];
  conversion: { crs: string | null; est: number; nord: number; hauteur: number; axeX: [number, number]; echelle: number } | null;
  /** Produits lus mais sans géométrie exploitable, ou classes hors du sous-ensemble (nombre par classe). */
  ignores: { classe: string; nombre: number; raison: string }[];
  /** Annotations 2D (`IfcAnnotation`) : textes et polylignes. */
  annotations?: AnnotationIfcLue[];
}

export interface OptionsImportIfc {
  /** Nom du fichier source (porté sur chaque objet importé). */
  source: string;
  /** Préfixe des identifiants créés (défaut « ifc »). */
  prefixe?: string;
  /** Nombre maximal de commandes par lot (défaut 500, la limite du contrat). */
  tailleLot?: number;
}

export interface ResultatImportIfc {
  lots: { label: string; commands: Commande[] }[];
  rapport: RapportEchange;
}

const TOLERANCE_ETAGE = 0.005;
const r5 = (v: number) => Math.round(v * 1e5) / 1e5;

/** Enveloppe convexe (chaîne monotone d'Andrew), sens trigonométrique. */
export function enveloppeConvexe(points: readonly { x: number; y: number }[]): { x: number; y: number }[] {
  const pts = [...new Map(points.map((p) => [`${r5(p.x)}|${r5(p.y)}`, { x: r5(p.x), y: r5(p.y) }])).values()].sort((a, b) => a.x - b.x || a.y - b.y);
  if (pts.length < 3) return pts;
  const croix = (o: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const bas: { x: number; y: number }[] = [];
  for (const p of pts) {
    while (bas.length >= 2 && croix(bas[bas.length - 2]!, bas[bas.length - 1]!, p) <= 0) bas.pop();
    bas.push(p);
  }
  const haut: { x: number; y: number }[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]!;
    while (haut.length >= 2 && croix(haut[haut.length - 2]!, haut[haut.length - 1]!, p) <= 0) haut.pop();
    haut.push(p);
  }
  return [...bas.slice(0, -1), ...haut.slice(0, -1)];
}

/** Fusionne les sommets confondus (au centième de millimètre) et retire les triangles dégénérés. */
export function compacterMaillage(positions: readonly number[], indices: readonly number[]): { positions: number[]; indices: number[] } {
  const cles = new Map<string, number>();
  const sortie: number[] = [];
  const remap: number[] = [];
  for (let i = 0; i < positions.length; i += 3) {
    const x = r5(positions[i]!);
    const y = r5(positions[i + 1]!);
    const z = r5(positions[i + 2]!);
    const k = `${x}|${y}|${z}`;
    let j = cles.get(k);
    if (j === undefined) {
      j = sortie.length / 3;
      cles.set(k, j);
      sortie.push(x === 0 ? 0 : x, y === 0 ? 0 : y, z === 0 ? 0 : z);
    }
    remap.push(j);
  }
  const tri: number[] = [];
  for (let k = 0; k + 2 < indices.length; k += 3) {
    const a = remap[indices[k]!];
    const b = remap[indices[k + 1]!];
    const c = remap[indices[k + 2]!];
    if (a === undefined || b === undefined || c === undefined || a === b || b === c || a === c) continue;
    tri.push(a, b, c);
  }
  return { positions: sortie, indices: tri };
}

/** Identifiant Fadi d'un objet importé : stable pour un GlobalId donné. */
export const idImporte = (prefixe: string, globalId: string) => `${prefixe}-${globalId.replace(/[^A-Za-z0-9_$-]/g, "_")}`;

export function commandesImportIfc(etat: ModeleAtelier, lecture: LectureIfc, options: OptionsImportIfc): ResultatImportIfc {
  const prefixe = options.prefixe ?? "ifc";
  const tailleLot = Math.max(1, Math.min(500, options.tailleLot ?? 500));
  const remarques: string[] = [];
  const lignes = new Map<string, LigneRapportEchange>();
  const compter = (classe: string, importe: boolean, remarque?: string) => {
    const l = lignes.get(classe) ?? { classe, source: 0, cible: 0, ifc: classe, representation: "Tessellation", remarques: [] };
    l.source++;
    if (importe) l.cible++;
    if (remarque && !l.remarques.includes(remarque)) l.remarques.push(remarque);
    lignes.set(classe, l);
  };
  if (lecture.schema.toUpperCase() !== "IFC4X3_ADD2" && lecture.schema.toUpperCase() !== "IFC4X3") remarques.push(`Schéma du fichier : ${lecture.schema} (le sous-ensemble est défini en IFC4X3_ADD2 ; lu sans garantie de fidélité).`);
  if (lecture.application) remarques.push(`Fichier écrit par : ${lecture.application}.`);

  // Repère : translation explicite seulement si le CRS est le même et sans rotation ni échelle.
  let dx = 0;
  let dy = 0;
  const parcelle = etat.site.parcelle;
  const c = lecture.conversion;
  if (c && parcelle && c.crs && c.crs.trim().toUpperCase() === parcelle.crs.trim().toUpperCase()) {
    const sansRotation = Math.abs(c.axeX[1]) < 1e-9 && c.axeX[0] > 0;
    if (sansRotation && Math.abs(c.echelle - 1) < 1e-9) {
      dx = c.est - parcelle.origineLocale.x;
      dy = c.nord - parcelle.origineLocale.y;
      remarques.push(`Repère : IfcMapConversion dans ${c.crs}, conversion explicite vers le repère local du projet (translation de ${r5(dx)} ; ${r5(dy)} m).`);
    } else remarques.push(`Repère : IfcMapConversion avec rotation ou échelle (${c.crs}) — non convertie ; coordonnées du fichier gardées telles quelles, à recaler.`);
  } else if (c && parcelle) remarques.push(`Repère : CRS du fichier (${c.crs ?? "non renseigné"}) différent de celui de la parcelle (${parcelle.crs}) — aucune conversion ; coordonnées du fichier gardées telles quelles, à recaler.`);
  else if (c) remarques.push(`Repère : IfcMapConversion lue (${c.crs ?? "CRS non renseigné"}) mais le projet n'a pas de parcelle — coordonnées du fichier gardées telles quelles.`);
  else remarques.push("Repère : aucune IfcMapConversion — coordonnées du fichier gardées telles quelles (repère local supposé commun, à vérifier).");

  // Étages → niveaux : même altitude (± 5 mm) = même niveau ; sinon un niveau « IFC · nom » est créé.
  const commandes: { cmd: Commande; label: string }[] = [];
  const niveaux = niveauxOrdonnes(etat);
  const niveauDeEtage = new Map<string, Niveau>();
  const nouveaux: Niveau[] = [];
  let ordre = niveaux.length;
  for (const e of [...lecture.etages].sort((a, b) => a.elevation - b.elevation)) {
    const existant = [...niveaux, ...nouveaux].find((n) => Math.abs(n.elevation - e.elevation) <= TOLERANCE_ETAGE);
    if (existant) {
      niveauDeEtage.set(e.globalId, existant);
      continue;
    }
    const n: Niveau = { id: idImporte(`${prefixe}-niveau`, e.globalId), nom: `IFC · ${e.nom ?? e.globalId}`, elevation: r5(e.elevation), hauteur: null, ordre: ordre++ };
    if (etat.niveaux[n.id]) {
      niveauDeEtage.set(e.globalId, etat.niveaux[n.id]!);
      continue;
    }
    nouveaux.push(n);
    niveauDeEtage.set(e.globalId, n);
    commandes.push({ cmd: { type: "niveau.creer", params: { id: n.id, nom: n.nom, elevation: n.elevation, ordre: n.ordre } }, label: "niveaux" });
  }
  if (nouveaux.length) remarques.push(`${nouveaux.length} niveau(x) créé(s) pour des étages sans équivalent d'altitude : ${nouveaux.map((n) => n.nom).join(", ")}.`);
  const tousNiveaux = [...niveaux, ...nouveaux].sort((a, b) => a.elevation - b.elevation);
  let niveauHorsEtage: Niveau | null = null;
  const accueilSansEtage = (zmin: number): Niveau => {
    const dessous = tousNiveaux.filter((n) => n.elevation <= zmin + TOLERANCE_ETAGE);
    const n = dessous.at(-1) ?? tousNiveaux[0];
    if (n) return n;
    if (!niveauHorsEtage) {
      niveauHorsEtage = { id: `${prefixe}-niveau-hors-etage`, nom: "IFC · hors étage", elevation: 0, hauteur: null, ordre: ordre++ };
      tousNiveaux.push(niveauHorsEtage);
      commandes.push({ cmd: { type: "niveau.creer", params: { id: niveauHorsEtage.id, nom: niveauHorsEtage.nom, elevation: 0, ordre: niveauHorsEtage.ordre } }, label: "niveaux" });
      remarques.push("Aucun niveau dans le projet ni étage dans le fichier : niveau « IFC · hors étage » créé à l'altitude 0.");
    }
    return niveauHorsEtage;
  };

  // Calque d'accueil.
  const calqueId = `${prefixe}-calque`;
  if (!etat.calques[calqueId]) commandes.push({ cmd: { type: "calque.creer", params: { id: calqueId, nom: `Import IFC · ${options.source}`.slice(0, 120) } }, label: "calque" });

  const dejaImportes = new Set((Object.values(etat.objets) as OccurrenceQuelconque[]).filter((o) => o.classe === "objet-importe").map((o) => (o as { params: { globalId: string } }).params.globalId));
  let groupeCree = false;
  const groupeId = `${prefixe}-groupe-${options.source.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 40)}`;
  const groupeLibre = !etat.groupes[groupeId];
  let sansEtage = 0;
  const vus = new Set<string>();
  for (const p of [...lecture.produits].sort((a, b) => (a.globalId < b.globalId ? -1 : 1))) {
    if (vus.has(p.globalId)) {
      compter(p.classe, false, "GlobalId en double dans le fichier : seconde occurrence ignorée");
      continue;
    }
    vus.add(p.globalId);
    if (dejaImportes.has(p.globalId)) {
      compter(p.classe, false, "déjà présent dans le modèle (même GlobalId) : non réimporté");
      continue;
    }
    if (!p.maillage.indices.length) {
      compter(p.classe, false, "sans géométrie lisible : non importé");
      continue;
    }
    const m = compacterMaillage(p.maillage.positions, p.maillage.indices);
    if (!m.indices.length) {
      compter(p.classe, false, "géométrie dégénérée : non importé");
      continue;
    }
    let zmin = Infinity;
    for (let i = 2; i < m.positions.length; i += 3) zmin = Math.min(zmin, m.positions[i]!);
    let niveau = p.etageGlobalId ? niveauDeEtage.get(p.etageGlobalId) : undefined;
    if (!niveau) {
      niveau = accueilSansEtage(zmin);
      sansEtage++;
    }
    const pos = m.positions.slice();
    for (let i = 0; i < pos.length; i += 3) {
      pos[i] = r5(pos[i]! + dx);
      pos[i + 1] = r5(pos[i + 1]! + dy);
      pos[i + 2] = r5(pos[i + 2]! - niveau.elevation);
    }
    const plan: { x: number; y: number }[] = [];
    for (let i = 0; i < pos.length; i += 3) plan.push({ x: pos[i]!, y: pos[i + 1]! });
    const id = idImporte(prefixe, p.globalId);
    if (etat.objets[id]) {
      compter(p.classe, false, `identifiant ${id} déjà utilisé : non importé`);
      continue;
    }
    const params: Record<string, unknown> = {
      id,
      niveauId: niveau.id,
      calqueId,
      ifcClasse: p.classe,
      globalId: p.globalId,
      nom: p.nom,
      type: p.type,
      maillage: { positions: pos, indices: m.indices },
      empreinte: enveloppeConvexe(plan).map((q) => pt(q.x, q.y)),
      source: options.source,
    };
    // Type, matériaux et propriétés : repris tels quels, en propriétés importées déclarées (rien n'est réinterprété).
    const props: Record<string, { valeur: unknown; unite?: string; provenance: "import"; statut: "declaree" }> = {};
    if (p.typeNom) props["ifc:type"] = { valeur: p.typeNom, provenance: "import", statut: "declaree" };
    if (p.materiaux?.length) {
      props["ifc:materiaux"] = { valeur: p.materiaux.map((x) => (x.epaisseur !== null ? `${x.nom} ${Math.round(x.epaisseur * 1000)} mm` : x.nom)).join(" ; ").slice(0, 500), provenance: "import", statut: "declaree" };
      const total = p.materiaux.every((x) => x.epaisseur !== null) ? p.materiaux.reduce((s2, x) => s2 + x.epaisseur!, 0) : null;
      if (total !== null && p.materiaux.length > 1) props["ifc:epaisseurCouches"] = { valeur: r5(total), unite: "m", provenance: "import", statut: "declaree" };
    }
    for (const q of (p.proprietes ?? []).slice(0, 100)) props[`ifc:${q.ensemble}.${q.nom}`.slice(0, 120)] = q.mesure ? { valeur: q.valeur, unite: q.mesure, provenance: "import", statut: "declaree" } : { valeur: q.valeur, provenance: "import", statut: "declaree" };
    if (Object.keys(props).length) params["proprietes"] = props;
    if ((p.proprietes?.length ?? 0) > 100) remarques.push(`${p.globalId} : ${p.proprietes!.length} propriétés, les 100 premières reprises.`);
    if (groupeLibre && groupeCree) params["groupeId"] = groupeId;
    commandes.push({ cmd: { type: "objetImporte.creer", params }, label: "objets" });
    if (groupeLibre && !groupeCree) {
      commandes.push({ cmd: { type: "groupe.creer", params: { id: groupeId, nom: `Import ${options.source}`.slice(0, 120), cibles: [id] } }, label: "objets" });
      groupeCree = true;
    }
    compter(p.classe, true);
  }
  // Annotations 2D : textes et traits sur le niveau de leur étage, calque « annotations » ; comptées par classe.
  const annotations = lecture.annotations ?? [];
  if (annotations.length) {
    const calqueAnn = `${prefixe}-calque-annotations`;
    if (!etat.calques[calqueAnn]) commandes.push({ cmd: { type: "calque.creer", params: { id: calqueAnn, nom: `Import IFC · annotations · ${options.source}`.slice(0, 120) } }, label: "annotations" });
    for (const a of [...annotations].sort((x, y) => (x.globalId < y.globalId ? -1 : 1))) {
      const base = idImporte(`${prefixe}-ann`, a.globalId);
      if (dejaImportes.has(a.globalId) || etat.objets[`${base}-0`]) {
        compter("IfcAnnotation", false, "déjà importée (même GlobalId) : non réimportée");
        continue;
      }
      const zmin = Math.min(...a.textes.map((t) => t.z), ...a.polylignes.flat().map((q) => q.z), Infinity);
      const niveau = (a.etageGlobalId ? niveauDeEtage.get(a.etageGlobalId) : undefined) ?? accueilSansEtage(Number.isFinite(zmin) ? zmin : 0);
      const P = (q: { x: number; y: number }) => pt(r5(q.x + dx), r5(q.y + dy));
      let k = 0;
      for (const t of a.textes) if (t.texte.trim()) commandes.push({ cmd: { type: "texte.creer", params: { id: `${base}-${k++}`, niveauId: niveau.id, calqueId: calqueAnn, position: P(t), texte: t.texte.trim().slice(0, 500) } }, label: "annotations" });
      for (const l of a.polylignes) {
        const pts = l.map(P).filter((q, i, arr) => i === 0 || Math.hypot(q.x - arr[i - 1]!.x, q.y - arr[i - 1]!.y) > 1e-6);
        if (pts.length >= 2) commandes.push({ cmd: { type: pts.length === 2 ? "esquisse.ligne" : "esquisse.polyligne", params: { id: `${base}-${k++}`, niveauId: niveau.id, calqueId: calqueAnn, points: pts, ferme: false } }, label: "annotations" });
      }
      compter("IfcAnnotation", k > 0, k > 0 ? "textes et traits repris en textes et esquisses (cotes non associatives)" : "annotation sans texte ni trait lisible");
    }
  }
  if (sansEtage) remarques.push(`${sansEtage} produit(s) sans étage dans le fichier : rattaché(s) au niveau dont l'altitude est immédiatement sous leur point le plus bas.`);
  for (const i of lecture.ignores) {
    const l = lignes.get(i.classe) ?? { classe: i.classe, source: 0, cible: 0, ifc: i.classe, representation: "—", remarques: [] };
    l.source += i.nombre;
    if (!l.remarques.includes(i.raison)) l.remarques.push(i.raison);
    lignes.set(i.classe, l);
  }
  remarques.push("Chaque produit est importé en représentation (maillage, classe et GlobalId d'origine) ; son type, ses matériaux et ses propriétés simples sont repris tels quels en propriétés importées « déclarées » : ni paramètres, ni ouvertures hébergées, rien de réinterprété.");

  const lots: { label: string; commands: Commande[] }[] = [];
  for (let k = 0; k < commandes.length; k += tailleLot) {
    const tranche = commandes.slice(k, k + tailleLot);
    lots.push({ label: `Import IFC ${options.source} (${lots.length + 1}/${Math.ceil(commandes.length / tailleLot)})`, commands: tranche.map((t) => t.cmd) });
  }
  return {
    lots,
    rapport: {
      format: "IFC4X3_ADD2",
      sens: "import",
      classes: [...lignes.values()].sort((a, b) => (a.classe < b.classe ? -1 : 1)),
      remarques,
      aReparer: 0,
    },
  };
}
