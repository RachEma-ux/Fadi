/**
 * Échange BCF 2.1 (D-097, DA-17-16) : les vues 3D enregistrées du projet (point de vue, annotations) s'échangent
 * avec les outils de coordination BIM sous la forme d'un fichier .bcfzip — un sujet (« Topic ») par vue, son point
 * de vue (caméra en perspective) et un commentaire par annotation.
 *
 * Conventions, déclarées et jamais devinées :
 * - coordonnées : repère local du projet, en mètres, comme l'export IFC de l'Atelier (pas de conversion cadastrale) ;
 * - la position d'une annotation n'a pas d'équivalent BCF 2.1 : elle est écrite à la fin du commentaire
 *   (« [point x ; y ; z m, repère local] ») et relue à l'import ; un commentaire sans ce repère est placé au point visé ;
 * - à l'import, le point visé (que BCF ne porte pas) est pris sur la direction de visée, à la distance déclarée
 *   (`distanceCible`, 10 m par défaut) : paramètre d'affichage de la vue, sans effet sur le modèle ;
 * - caméra orthogonale reprise en perspective, objets désignés (« Components ») non repris : avertissements.
 * Archive : écrite sans compression (méthode « stockée ») ; à la lecture, les entrées compressées (« deflate »)
 * sont décompressées par la fonction fournie par l'appelant (le navigateur ou Node), le module restant pur.
 */
import type { ModeleAtelier } from "../modele.js";
import { vues3D, type ParamsVue3D } from "../commandes/vues3d.js";

type Point3 = { x: number; y: number; z: number };

export interface FichierArchive {
  nom: string;
  octets: Uint8Array;
}

// --- ZIP -----------------------------------------------------------------------------------------------------------

const TABLE_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(octets: Uint8Array): number {
  let c = 0xffffffff;
  for (const o of octets) c = TABLE_CRC[(c ^ o) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Archive ZIP sans compression (méthode 0), noms en UTF-8. */
export function zipStocke(fichiers: readonly FichierArchive[]): Uint8Array {
  const enc = new TextEncoder();
  const locaux: Uint8Array[] = [];
  const centraux: Uint8Array[] = [];
  let decalage = 0;
  for (const f of fichiers) {
    const nom = enc.encode(f.nom);
    const crc = crc32(f.octets);
    const local = new Uint8Array(30 + nom.length);
    const v = new DataView(local.buffer);
    v.setUint32(0, 0x04034b50, true);
    v.setUint16(4, 20, true);
    v.setUint16(6, 0x0800, true); // noms UTF-8
    v.setUint16(8, 0, true);
    v.setUint32(14, crc, true);
    v.setUint32(18, f.octets.length, true);
    v.setUint32(22, f.octets.length, true);
    v.setUint16(26, nom.length, true);
    local.set(nom, 30);
    const central = new Uint8Array(46 + nom.length);
    const w = new DataView(central.buffer);
    w.setUint32(0, 0x02014b50, true);
    w.setUint16(4, 20, true);
    w.setUint16(6, 20, true);
    w.setUint16(8, 0x0800, true);
    w.setUint32(16, crc, true);
    w.setUint32(20, f.octets.length, true);
    w.setUint32(24, f.octets.length, true);
    w.setUint16(28, nom.length, true);
    w.setUint32(42, decalage, true);
    central.set(nom, 46);
    locaux.push(local, f.octets);
    centraux.push(central);
    decalage += local.length + f.octets.length;
  }
  const tailleCentrale = centraux.reduce((s, c) => s + c.length, 0);
  const fin = new Uint8Array(22);
  const z = new DataView(fin.buffer);
  z.setUint32(0, 0x06054b50, true);
  z.setUint16(8, fichiers.length, true);
  z.setUint16(10, fichiers.length, true);
  z.setUint32(12, tailleCentrale, true);
  z.setUint32(16, decalage, true);
  const sortie = new Uint8Array(decalage + tailleCentrale + 22);
  let i = 0;
  for (const p of [...locaux, ...centraux, fin]) {
    sortie.set(p, i);
    i += p.length;
  }
  return sortie;
}

/** Lecture d'une archive ZIP par son répertoire central ; `inflate` décompresse une entrée « deflate » brute. */
export async function lireZip(octets: Uint8Array, inflate?: (brut: Uint8Array) => Promise<Uint8Array>): Promise<FichierArchive[]> {
  const v = new DataView(octets.buffer, octets.byteOffset, octets.byteLength);
  let fin = -1;
  for (let i = octets.length - 22; i >= Math.max(0, octets.length - 22 - 65535); i--) if (v.getUint32(i, true) === 0x06054b50) { fin = i; break; }
  if (fin < 0) throw new Error("archive ZIP illisible (répertoire central introuvable)");
  const n = v.getUint16(fin + 10, true);
  let p = v.getUint32(fin + 16, true);
  const dec = new TextDecoder();
  const out: FichierArchive[] = [];
  for (let k = 0; k < n; k++) {
    if (v.getUint32(p, true) !== 0x02014b50) throw new Error("archive ZIP illisible (entrée centrale)");
    const methode = v.getUint16(p + 10, true);
    const taille = v.getUint32(p + 20, true);
    const lNom = v.getUint16(p + 28, true);
    const lExtra = v.getUint16(p + 30, true);
    const lComm = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const nom = dec.decode(octets.subarray(p + 46, p + 46 + lNom));
    p += 46 + lNom + lExtra + lComm;
    if (nom.endsWith("/")) continue;
    const debut = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    const brut = octets.subarray(debut, debut + taille);
    if (methode === 0) out.push({ nom, octets: brut.slice() });
    else if (methode === 8) {
      if (!inflate) throw new Error(`entrée compressée sans décompresseur : ${nom}`);
      out.push({ nom, octets: await inflate(brut) });
    } else throw new Error(`méthode de compression non prise en charge (${methode}) : ${nom}`);
  }
  return out;
}

// --- XML minimal ---------------------------------------------------------------------------------------------------

const echapper = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const desechapper = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d))).replace(/&amp;/g, "&");
const blocs = (xml: string, balise: string): string[] => [...xml.matchAll(new RegExp(`<${balise}(?:\\s[^>]*)?>([\\s\\S]*?)</${balise}>`, "g"))].map((m) => m[0]);
const texte = (xml: string, balise: string): string | null => {
  const m = new RegExp(`<${balise}(?:\\s[^>]*)?>([\\s\\S]*?)</${balise}>`).exec(xml);
  return m ? desechapper(m[1]!.trim()) : null;
};
const attribut = (xml: string, balise: string, nom: string): string | null => {
  const m = new RegExp(`<${balise}\\s[^>]*${nom}="([^"]*)"`).exec(xml);
  return m ? desechapper(m[1]!) : null;
};
const nombre = (s: string | null): number | null => (s !== null && s !== "" && Number.isFinite(Number(s)) ? Number(s) : null);
const point = (xml: string, balise: string): Point3 | null => {
  const b = blocs(xml, balise)[0];
  if (!b) return null;
  const x = nombre(texte(b, "X"));
  const y = nombre(texte(b, "Y"));
  const z = nombre(texte(b, "Z"));
  return x === null || y === null || z === null ? null : { x, y, z };
};

/** Identifiant stable au format UUID, dérivé d'une chaîne (même vue → même sujet d'un export à l'autre). */
export function guidStable(s: string): string {
  const h: number[] = [];
  for (let graine = 0; graine < 4; graine++) {
    let x = (0x811c9dc5 ^ (graine * 0x9e3779b9)) >>> 0;
    for (let i = 0; i < s.length; i++) x = Math.imul(x ^ s.charCodeAt(i), 0x01000193) >>> 0;
    h.push(x);
  }
  const hex = h.map((x) => x.toString(16).padStart(8, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${((parseInt(hex[16]!, 16) & 3) | 8).toString(16)}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

// --- Export ---------------------------------------------------------------------------------------------------------

const r6 = (v: number) => Math.round(v * 1e6) / 1e6 || 0;
const xyz = (balise: string, p: Point3) => `<${balise}><X>${r6(p.x)}</X><Y>${r6(p.y)}</Y><Z>${r6(p.z)}</Z></${balise}>`;
const MARQUE = /\s*\[point (-?[\d.]+) ; (-?[\d.]+) ; (-?[\d.]+) m, repère local\]\s*$/;

export interface OptionsBcf {
  projet: { id: string; nom: string };
  /** Horodatage ISO 8601 des sujets et commentaires. */
  horodatage: string;
  /** Auteur déclaré des sujets (BCF : « CreationAuthor »). */
  auteur: string;
  /** Champ de vision vertical de la caméra perspective, en degrés. */
  champDeVision: number;
}

/** Fichiers d'un .bcfzip pour les vues 3D enregistrées ; vide si aucune vue. */
export function exporterBcf(etat: ModeleAtelier, o: OptionsBcf): { fichiers: FichierArchive[]; sujets: number } {
  const enc = new TextEncoder();
  const fichiers: FichierArchive[] = [];
  const ajouter = (nom: string, xml: string) => fichiers.push({ nom, octets: enc.encode(`<?xml version="1.0" encoding="UTF-8"?>\n${xml}`) });
  ajouter("bcf.version", `<Version VersionId="2.1"><DetailedVersion>2.1</DetailedVersion></Version>`);
  ajouter("project.bcfp", `<ProjectExtension><Project ProjectId="${guidStable(`projet|${o.projet.id}`)}"><Name>${echapper(o.projet.nom)}</Name></Project><ExtensionSchema></ExtensionSchema></ProjectExtension>`);
  const vues = vues3D(etat);
  for (const v of vues) {
    const g = guidStable(`vue3d|${o.projet.id}|${v.id}`);
    const gv = guidStable(`point-de-vue|${o.projet.id}|${v.id}`);
    const p = v.params as ParamsVue3D;
    const d = { x: p.camera.cible.x - p.camera.position.x, y: p.camera.cible.y - p.camera.position.y, z: p.camera.cible.z - p.camera.position.z };
    const l = Math.hypot(d.x, d.y, d.z) || 1;
    const commentaires = (p.annotations ?? []).map((a, i) => `<Comment Guid="${guidStable(`annotation|${o.projet.id}|${v.id}|${i}`)}"><Date>${o.horodatage}</Date><Author>${echapper(o.auteur)}</Author><Comment>${echapper(`${a.texte} [point ${r6(a.position.x)} ; ${r6(a.position.y)} ; ${r6(a.position.z)} m, repère local]`)}</Comment><Viewpoint Guid="${gv}"/></Comment>`).join("");
    ajouter(`${g}/markup.bcf`, `<Markup><Topic Guid="${g}" TopicType="Information" TopicStatus="Open"><Title>${echapper(v.nom)}</Title><CreationDate>${o.horodatage}</CreationDate><CreationAuthor>${echapper(o.auteur)}</CreationAuthor><Description>${echapper(`Vue 3D « ${v.nom} » de l'Atelier (version ${v.version}) — repère local du projet, mètres.`)}</Description></Topic>${commentaires}<Viewpoints Guid="${gv}"><Viewpoint>viewpoint.bcfv</Viewpoint></Viewpoints></Markup>`);
    ajouter(`${g}/viewpoint.bcfv`, `<VisualizationInfo Guid="${gv}"><PerspectiveCamera>${xyz("CameraViewPoint", p.camera.position)}${xyz("CameraDirection", { x: d.x / l, y: d.y / l, z: d.z / l })}${xyz("CameraUpVector", { x: 0, y: 0, z: 1 })}<FieldOfView>${r6(o.champDeVision)}</FieldOfView></PerspectiveCamera></VisualizationInfo>`);
  }
  return { fichiers, sujets: vues.length };
}

// --- Import ---------------------------------------------------------------------------------------------------------

export interface VueBcf {
  nom: string;
  camera: { position: Point3; cible: Point3 };
  annotations: { position: Point3; texte: string }[];
}

/** Sujets d'un .bcfzip lus en vues 3D (paramètres de `vue3d.enregistrer`), avec les avertissements de reprise. */
export function importerBcf(fichiers: readonly FichierArchive[], distanceCible = 10): { vues: VueBcf[]; avertissements: string[] } {
  const dec = new TextDecoder();
  const lus = new Map(fichiers.map((f) => [f.nom.replace(/\\/g, "/"), dec.decode(f.octets)]));
  const version = lus.get("bcf.version");
  const avertissements: string[] = [];
  if (!version) avertissements.push("bcf.version absent : version supposée 2.x.");
  else {
    const id = attribut(version, "Version", "VersionId");
    if (id && !id.startsWith("2.")) avertissements.push(`Version BCF ${id} : lue comme 2.1 (les champs propres à cette version sont ignorés).`);
  }
  const vues: VueBcf[] = [];
  const marquesSujets = [...lus.keys()].filter((k) => /(^|\/)markup\.bcf$/.test(k)).sort();
  for (const cle of marquesSujets) {
    const dossier = cle.slice(0, cle.length - "markup.bcf".length);
    const markup = lus.get(cle)!;
    const titre = (texte(blocs(markup, "Topic")[0] ?? "", "Title") ?? "").trim().slice(0, 120) || `Sujet BCF ${dossier.replace(/\/$/, "").slice(0, 8)}`;
    const nomPdv = texte(blocs(markup, "Viewpoints")[0] ?? "", "Viewpoint") ?? "viewpoint.bcfv";
    const pdv = lus.get(`${dossier}${nomPdv}`) ?? lus.get(`${dossier}viewpoint.bcfv`);
    if (!pdv) {
      avertissements.push(`« ${titre} » : point de vue absent, sujet non repris.`);
      continue;
    }
    let camera = blocs(pdv, "PerspectiveCamera")[0];
    if (!camera) {
      camera = blocs(pdv, "OrthogonalCamera")[0];
      if (camera) avertissements.push(`« ${titre} » : caméra orthogonale reprise en perspective.`);
    }
    const position = camera ? point(camera, "CameraViewPoint") : null;
    const direction = camera ? point(camera, "CameraDirection") : null;
    const l = direction ? Math.hypot(direction.x, direction.y, direction.z) : 0;
    if (!position || !direction || l < 1e-9) {
      avertissements.push(`« ${titre} » : caméra illisible, sujet non repris.`);
      continue;
    }
    const cible = { x: r6(position.x + (direction.x / l) * distanceCible), y: r6(position.y + (direction.y / l) * distanceCible), z: r6(position.z + (direction.z / l) * distanceCible) };
    if (/<Components[\s>]/.test(pdv)) avertissements.push(`« ${titre} » : objets désignés (Components) non repris.`);
    // Commentaire BCF : <Comment Guid="…"> … <Comment>texte</Comment> … </Comment>.
    const annotations = [...markup.matchAll(/<Comment\s[^>]*Guid="[^"]*"[^>]*>[\s\S]*?<Comment>([\s\S]*?)<\/Comment>/g)]
      .map((m) => desechapper(m[1]!.trim()))
      .filter(Boolean)
      .slice(0, 100)
      .map((t) => {
        const m = MARQUE.exec(t);
        return m ? { texte: t.replace(MARQUE, "").trim().slice(0, 500), position: { x: Number(m[1]), y: Number(m[2]), z: Number(m[3]) } } : { texte: t.slice(0, 500), position: cible };
      })
      .filter((a) => a.texte);
    vues.push({ nom: titre, camera: { position: { x: r6(position.x), y: r6(position.y), z: r6(position.z) }, cible }, annotations });
  }
  if (!marquesSujets.length) avertissements.push("Aucun sujet (markup.bcf) dans l'archive.");
  return { vues, avertissements };
}
