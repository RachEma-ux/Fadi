/**
 * Propriétés en tableau (D-045) — pur.
 *
 * - Import CSV : une ligne par propriété, colonnes `id`, `propriete`, `valeur` et, facultative, `unite` (séparateur
 *   « ; » ou « , », détecté sur l'en-tête). Chaque ligne valide devient une commande `propriete.definir`
 *   (provenance « import », statut « déclarée ») ; une ligne invalide est refusée nominativement, jamais corrigée :
 *   objet inconnu, nom vide, nombre sans unité (R3 : une grandeur sans unité n'est pas devinée).
 * - Numérotation des pièces : codes `préfixe + numéro` dans l'ordre de lecture du plan (de haut en bas, puis de
 *   gauche à droite, par centre de gravité) ; un code déjà porté par une autre pièce du projet est refusé.
 * - Synthèse d'une zone : pièces et espaces dont le contour est entièrement dans la zone (même niveau), ou liés à la
 *   zone par une relation « contient » (de tout niveau), y compris ceux de ses sous-zones (zones imbriquées, D-056) ;
 *   nombre et somme des aires nettes (calculées, non réglementaires), chaque pièce comptée une fois.
 */
import type { Commande } from "../commandes/index.js";
import { aireNette, centroide, pointDansPolygone, projectionSurSegment, type Vec } from "../geometrie.js";
import type { ModeleAtelier, Occurrence } from "../modele.js";
import { sousZones } from "../commandes/zones.js";

export interface RapportProprietesCsv {
  lignes: number;
  retenues: number;
  refus: { ligne: number; motif: string }[];
}

/** Découpe une ligne CSV (guillemets doubles, séparateur donné). */
function cellules(ligne: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let guil = false;
  for (let i = 0; i < ligne.length; i++) {
    const ch = ligne[i]!;
    if (guil) {
      if (ch === '"' && ligne[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') guil = false;
      else cur += ch;
    } else if (ch === '"') guil = true;
    else if (ch === sep) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

export function commandesProprietesCsv(etat: ModeleAtelier, texte: string): { commandes: Commande[]; rapport: RapportProprietesCsv } {
  const lignes = texte.replace(/^﻿/, "").replace(/\r\n?/g, "\n").split("\n").filter((l) => l.trim() !== "");
  if (!lignes.length) throw new Error("Fichier vide.");
  const entete = lignes[0]!;
  const sep = (entete.match(/;/g)?.length ?? 0) >= (entete.match(/,/g)?.length ?? 0) ? ";" : ",";
  const cols = cellules(entete, sep).map((c) => c.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""));
  const iId = cols.indexOf("id");
  const iNom = cols.findIndex((c) => c === "propriete" || c === "nom");
  const iVal = cols.indexOf("valeur");
  const iUnite = cols.indexOf("unite");
  if (iId < 0 || iNom < 0 || iVal < 0) throw new Error("En-tête attendu : id ; propriete ; valeur ; unite (facultative).");
  const commandes: Commande[] = [];
  const refus: RapportProprietesCsv["refus"] = [];
  lignes.slice(1).forEach((l, k) => {
    const n = k + 2;
    const c = cellules(l, sep);
    const id = c[iId] ?? "";
    const nom = c[iNom] ?? "";
    const brut = c[iVal] ?? "";
    const unite = iUnite >= 0 ? (c[iUnite] ?? "") : "";
    if (!etat.objets[id]) return void refus.push({ ligne: n, motif: `objet inconnu : ${id || "(vide)"}` });
    if (!nom) return void refus.push({ ligne: n, motif: "nom de propriété vide" });
    if (nom.length > 120) return void refus.push({ ligne: n, motif: "nom de propriété trop long (120 caractères au plus)" });
    if (brut === "") return void refus.push({ ligne: n, motif: "valeur vide (une valeur absente n'est pas importée)" });
    let valeur: string | number | boolean = brut;
    if (/^-?\d+(?:[.,]\d+)?$/.test(brut)) {
      if (!unite) return void refus.push({ ligne: n, motif: `valeur numérique « ${brut} » sans unité : refusée` });
      valeur = Number(brut.replace(",", "."));
    } else if (/^(vrai|true|oui)$/i.test(brut)) valeur = true;
    else if (/^(faux|false|non)$/i.test(brut)) valeur = false;
    commandes.push({ type: "propriete.definir", params: { id, nom, valeur, ...(unite ? { unite } : {}), provenance: "import", statut: "declaree" } });
  });
  return { commandes, rapport: { lignes: lignes.length - 1, retenues: commandes.length, refus } };
}

/** Codes des pièces sélectionnées, dans l'ordre de lecture du plan. */
export function commandesNumerotationPieces(etat: ModeleAtelier, ids: readonly string[], prefixe: string, debut: number, chiffres = 0): Commande[] {
  if (!Number.isInteger(debut) || debut < 0) throw new Error("Premier numéro : entier positif ou nul.");
  const pieces = ids.map((id) => etat.objets[id]).filter((o): o is Occurrence<"piece"> => o?.classe === "piece");
  if (!pieces.length) throw new Error("Sélectionnez des pièces.");
  const tri = pieces.map((o) => ({ o, c: centroide(o.params.contour) })).sort((a, b) => (Math.abs(a.c.y - b.c.y) > 0.5 ? b.c.y - a.c.y : a.c.x - b.c.x));
  const autres = new Set(Object.values(etat.objets).filter((o): o is Occurrence<"piece"> => o.classe === "piece" && !ids.includes(o.id)).map((o) => o.params.code).filter(Boolean));
  return tri.map(({ o }, k) => {
    const code = `${prefixe}${String(debut + k).padStart(chiffres, "0")}`;
    if (autres.has(code)) throw new Error(`Le code « ${code} » est déjà porté par une autre pièce.`);
    return { type: "objet.modifier", params: { id: o.id, params: { code } } };
  });
}

export interface SyntheseZone {
  pieces: { id: string; nom: string; aire: number; par: "contour" | "relation" | "sous-zone"; niveauId: string | null }[];
  aireTotale: number;
  /** Zones contenues, directement ou non (D-056). */
  sousZones: { id: string; nom: string }[];
}

export function syntheseZone(etat: ModeleAtelier, zone: Occurrence<"zone">): SyntheseZone {
  const lies = new Set(Object.values(etat.relations).filter((r) => r.kind === "contient" && r.sourceId === zone.id).map((r) => r.targetId));
  const sous = sousZones(etat, zone.id).map((id) => etat.objets[id] as Occurrence<"zone">);
  const pieces: SyntheseZone["pieces"] = [];
  for (const o of Object.values(etat.objets)) {
    if (o.classe !== "piece" && o.classe !== "espace") continue;
    const contours = o.classe === "piece" ? [{ contour: o.params.contour, trous: o.params.trous }] : o.params.polygones;
    const z = zone.params.contour;
    const surBord = (q: Vec) => z.some((a, i) => projectionSurSegment(q, a, z[(i + 1) % z.length]!).distance < 1e-6);
    const dedans = o.niveauId === zone.niveauId && contours.every((c) => c.contour.every((q) => surBord(q) || pointDansPolygone(q, z)) && pointDansPolygone(centroide(c.contour), z));
    if (!dedans && !lies.has(o.id)) continue;
    const aire = contours.reduce((s, c) => s + aireNette(c.contour, c.trous), 0);
    const nom = [o.classe === "piece" ? o.params.code : null, o.params.nom].filter(Boolean).join(" · ") || o.id;
    pieces.push({ id: o.id, nom, aire: Math.round(aire * 100) / 100, par: lies.has(o.id) ? "relation" : "contour", niveauId: o.niveauId });
  }
  // Pièces des sous-zones, chacune une fois.
  for (const z of sous) {
    for (const q of syntheseZone({ ...etat, relations: Object.fromEntries(Object.entries(etat.relations).filter(([, r]) => !(r.kind === "contient" && etat.objets[r.targetId]?.classe === "zone"))) }, z).pieces) {
      if (!pieces.some((x) => x.id === q.id)) pieces.push({ ...q, par: "sous-zone" });
    }
  }
  return { pieces, aireTotale: Math.round(pieces.reduce((s, p) => s + p.aire, 0) * 100) / 100, sousZones: sous.map((z) => ({ id: z.id, nom: z.params.nom ?? z.id })) };
}
