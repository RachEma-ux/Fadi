/**
 * Cas 4 du catalogue des extensions, lot C4, étape 7e (D10-F14-082) : lot d'échange daté. Plusieurs sorties produites
 * ensemble (IFC structuré, DXF des feuilles, PDF des feuilles, CSV du débit, image PNG de la vue), nommées d'après la
 * Planche et le jeu, rangées dans une archive ZIP avec un rapport par sortie et un manifeste d'empreintes (SHA-256).
 * Le registre des lots reste dans la Planche (registre des versions). Pur : ni DOM, ni React ; les sorties elles-mêmes
 * sont produites par l'appelant, une sortie impossible arrête l'émission avec son motif.
 */
import { sha256Hex } from "./empreinte.js";
import type { JeuLot, LotEmis, RegistreVersions, SortieLot } from "./versions-l7.js";
import { ecrireZip } from "./zip.js";

/** Libellés écrits dans le manifeste et les rapports (document produit, en français). */
export const LIBELLES_SORTIE: Readonly<Record<SortieLot, string>> = {
  ifc: "IFC structuré",
  dxf: "DXF des feuilles",
  pdf: "PDF des feuilles",
  csv: "CSV du débit",
  png: "Image PNG de la vue",
};

/** Fichier produit par une sortie. */
export interface FichierLot {
  readonly sortie: SortieLot;
  readonly nom: string;
  readonly donnees: Uint8Array;
  /** Ce que la sortie contient, pour son rapport (« IFC4, géoréférencé, 12 objets »). */
  readonly details: string;
}

export interface OptionsLot {
  readonly jeu: string;
  readonly planche: string;
  /** Empreinte du modèle émis (hexadécimal). */
  readonly empreinteModele: string;
  /** Destinataire saisi ; vide = non renseigné. */
  readonly destinataire: string;
  readonly date: Date;
}

export interface LotEcrit {
  readonly archive: string;
  readonly octets: Uint8Array;
  readonly manifeste: string;
  /** SHA-256 du manifeste (hexadécimal) : ce que retient le registre. */
  readonly empreinteManifeste: string;
  /** Fichiers rangés : sorties, rapports et manifeste. */
  readonly fichiers: number;
}

const propre = (s: string): string => s.normalize("NFC").replace(/\s+/g, " ").trim();

/** Segment de nom de fichier sûr : lettres et chiffres, mots joints par un tiret. */
export const segmentFichier = (s: string): string => propre(s).replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "") || "planche";

/** Nom court d'un jeu dans les fichiers : mots du nom sans le mot « lot », joints (« DCE lot 02 » → « DCE02 »). */
export function nomCourtJeu(jeu: string): string {
  const mots = propre(jeu).split(/[^\p{L}\p{N}]+/u).filter((x) => x && x.toLowerCase() !== "lot");
  return mots.join("") || "lot";
}

/** Nom d'une sortie : « <Planche>-<jeu>-<suffixe> » (suffixe : « modele.ifc », « rez.dxf »…). */
export const nomSortie = (planche: string, jeu: string, suffixe: string): string => `${segmentFichier(planche)}-${nomCourtJeu(jeu)}-${suffixe}`;

/** Date et heure suisses : « 28.11.2026 », « 12 h 10 », « 2026-11-28 ». */
export function dateSuisse(d: Date): { readonly jour: string; readonly heure: string; readonly iso: string } {
  const p = new Intl.DateTimeFormat("fr-CH", { timeZone: "Europe/Zurich", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d);
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return { jour: `${v("day")}.${v("month")}.${v("year")}`, heure: `${Number(v("hour"))} h ${v("minute")}`, iso: `${v("year")}-${v("month")}-${v("day")}` };
}

/** Empreinte abrégée lisible : « 3b1e … 9a40 ». */
export const empreinteLot = (h: string): string => (h.length > 8 ? `${h.slice(0, 4)} … ${h.slice(-4)}` : h);
const empreinteModeleCourte = (h: string): string => (h.length > 12 ? `${h.slice(0, 4)} ${h.slice(4, 8)} … ${h.slice(-4)}` : h);

const ecrire = (s: string): Uint8Array => new TextEncoder().encode(s);
const nomRapport = (f: FichierLot): string => `rapports/${f.nom}.txt`;

/** Rapport d'une sortie : ce qu'elle contient, sa taille et son empreinte. */
export function rapportSortie(f: FichierLot, o: OptionsLot): string {
  const d = dateSuisse(o.date);
  return [`Rapport de sortie — lot « ${propre(o.jeu)} »`, `Émis le ${d.jour} à ${d.heure}`, `Sortie : ${LIBELLES_SORTIE[f.sortie]}`, `Fichier : ${f.nom}`, `Contenu : ${f.details}`, `Taille : ${f.donnees.length} octets`, `SHA-256 : ${sha256Hex(f.donnees)}`, ""].join("\n");
}

/**
 * Manifeste : en-tête (lot, date, Planche, empreinte du modèle, destinataire), puis chaque fichier rangé avec son
 * SHA-256 entier (sorties, puis rapports). Les colonnes sont alignées ; texte reproductible.
 */
export function manifesteLot(fichiers: readonly FichierLot[], o: OptionsLot): string {
  const d = dateSuisse(o.date);
  const dest = propre(o.destinataire);
  const lignes: [string, string][] = [];
  for (const f of fichiers) lignes.push([f.nom, sha256Hex(f.donnees)]);
  for (const f of fichiers) lignes.push([nomRapport(f), sha256Hex(ecrire(rapportSortie(f, o)))]);
  const large = Math.max(42, ...lignes.map(([n]) => n.length + 2));
  return [
    `Lot « ${propre(o.jeu)} » · émis le ${d.jour} à ${d.heure}`,
    `Planche « ${propre(o.planche)} » · empreinte du modèle ${empreinteModeleCourte(o.empreinteModele)}`,
    `Empreinte complète du modèle : ${o.empreinteModele}`,
    `Destinataire : ${dest || "non renseigné"}`,
    "",
    `${"Fichier".padEnd(large)}SHA-256`,
    ...lignes.map(([n, h]) => `${n.padEnd(large)}${h}`),
    "",
  ].join("\n");
}

/** Aperçu du manifeste dans le panneau (maquette) : empreintes abrégées, rapports résumés en une ligne. */
export function apercuManifeste(sorties: readonly { readonly nom: string; readonly empreinte: string | null }[], o: OptionsLot): string {
  const d = dateSuisse(o.date);
  const dest = propre(o.destinataire);
  const large = Math.max(42, ...sorties.map((x) => x.nom.length + 2));
  return [
    `Lot « ${propre(o.jeu)} » · émis le ${d.jour} à ${d.heure}`,
    `Planche « ${propre(o.planche)} » · empreinte du modèle ${empreinteModeleCourte(o.empreinteModele)}`,
    `Destinataire : ${dest ? `${dest} (saisi)` : "non renseigné"}`,
    "",
    `${"Fichier".padEnd(large)}SHA-256`,
    ...sorties.map((x) => `${x.nom.padEnd(large)}${x.empreinte ? empreinteLot(x.empreinte) : "à l'émission"}`),
    `${"rapports/ (un rapport par sortie)".padEnd(large)}${sorties.length} fichier${sorties.length > 1 ? "s" : ""}`,
  ].join("\n");
}

/** Nom de l'archive : « <Planche>-<jeu>-AAAA-MM-JJ.zip ». */
export const nomArchive = (planche: string, jeu: string, date: Date): string => `${segmentFichier(planche)}-${nomCourtJeu(jeu)}-${dateSuisse(date).iso}.zip`;

/** L'archive du lot : sorties, un rapport par sortie, manifeste. Refus nommé si aucune sortie ou deux noms égaux. */
export function ecrireLot(fichiers: readonly FichierLot[], o: OptionsLot): { readonly ok: true; readonly lot: LotEcrit } | { readonly ok: false; readonly erreur: "aucune-sortie" | "jeu-sans-nom" | "noms-en-double" } {
  if (!propre(o.jeu)) return { ok: false, erreur: "jeu-sans-nom" };
  if (!fichiers.length) return { ok: false, erreur: "aucune-sortie" };
  if (new Set(fichiers.map((f) => f.nom)).size !== fichiers.length) return { ok: false, erreur: "noms-en-double" };
  const manifeste = manifesteLot(fichiers, o);
  const entrees = [...fichiers.map((f) => ({ nom: f.nom, donnees: f.donnees })), ...fichiers.map((f) => ({ nom: nomRapport(f), donnees: ecrire(rapportSortie(f, o)) })), { nom: "manifeste.txt", donnees: ecrire(manifeste) }];
  return { ok: true, lot: { archive: nomArchive(o.planche, o.jeu, o.date), octets: ecrireZip(entrees, o.date), manifeste, empreinteManifeste: sha256Hex(manifeste), fichiers: entrees.length } };
}

/** Le lot émis, en tête du registre de la Planche. */
export function noterLot(r: RegistreVersions, l: LotEmis): RegistreVersions {
  const d = l.destinataire ? propre(l.destinataire) : "";
  return { ...r, lots: [{ ...l, jeu: propre(l.jeu), destinataire: d || null }, ...(r.lots ?? [])] };
}

/** Enregistre un jeu (nouveau, ou mis à jour par son nom) dans le registre. */
export function enregistrerJeu(r: RegistreVersions, j: Omit<JeuLot, "nom"> & { readonly nom: string }): RegistreVersions {
  const nom = propre(j.nom);
  if (!nom) return r;
  const autres = (r.jeux ?? []).filter((x) => x.id !== j.id && x.nom !== nom);
  return { ...r, jeux: [...autres, { id: j.id, nom, sorties: [...j.sorties] }].sort((a, b) => a.nom.localeCompare(b.nom, "fr")) };
}
