/**
 * Tableaux et rapport de quantités reproductibles depuis une révision (cahier §5.9, DA-16-10) : pièces, portes,
 * fenêtres, murs, composants et synthèse par niveau. Une valeur absente du modèle est écrite « non évaluée »,
 * jamais remplacée. Ordre déterministe (niveau, puis identifiant) : deux générations à la même révision donnent
 * les mêmes octets.
 */
import { distance } from "../geometrie.js";
import type { ModeleAtelier, Occurrence } from "../modele.js";
import { niveauxOrdonnes, objetsDeClasse, ouverturesDuMur } from "../modele.js";
import { quantites } from "../quantites.js";
import { echapperXml } from "./rendu-svg.js";
import { empreinteDe } from "./empreinte.js";

export type TypeTableau = "pieces" | "portes" | "fenetres" | "murs" | "composants" | "synthese";
export const TABLEAUX: Record<TypeTableau, string> = {
  pieces: "Tableau des pièces",
  portes: "Tableau des portes",
  fenetres: "Tableau des fenêtres",
  murs: "Tableau des murs",
  composants: "Tableau des composants",
  synthese: "Synthèse des quantités par niveau",
};

export const NON_EVALUEE = "non évaluée";
type Cellule = string | number | null;

export interface Tableau {
  type: TypeTableau;
  titre: string;
  colonnes: string[];
  /** Unité de chaque colonne (null : texte). */
  unites: (string | null)[];
  lignes: Cellule[][];
  /** Ligne de total (même longueur que les colonnes), null si sans objet. */
  total: Cellule[] | null;
  empreinte: string;
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const parId = <T extends { id: string }>(a: T, b: T) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

function ouvertures(etat: ModeleAtelier, classe: "porte" | "fenetre"): Cellule[][] {
  const lignes: Cellule[][] = [];
  for (const n of niveauxOrdonnes(etat)) {
    for (const o of objetsDeClasse(etat, classe, n.id).sort(parId)) {
      const mur = etat.objets[o.params.murHoteId];
      lignes.push([n.nom, o.params.repere ?? null, o.id, mur?.id ?? `${o.params.murHoteId} (absent)`, r3(o.params.largeur.value), r3(o.params.hauteur.value), o.params.allege ? r3(o.params.allege.value) : null, o.definitionId ?? null, o.phase ?? null]);
    }
  }
  return lignes;
}

/** Surface d'une face de mur (longueur d'axe × hauteur) moins les ouvertures hébergées ; null sans hauteur. */
function surfaceNette(etat: ModeleAtelier, m: Occurrence<"mur">): number | null {
  const L = distance(m.params.a, m.params.b);
  let H: number | null = m.params.hauteur?.value ?? null;
  if (H === null && m.params.niveauHautId && m.niveauId) {
    const bas = etat.niveaux[m.niveauId]?.elevation;
    const haut = etat.niveaux[m.params.niveauHautId]?.elevation;
    if (bas !== undefined && haut !== undefined && haut > bas) H = haut - bas;
  }
  if (H === null) return null;
  const vides = ouverturesDuMur(etat, m.id).reduce((s, o) => s + o.params.largeur.value * o.params.hauteur.value, 0);
  return r2(Math.max(0, L * H - vides));
}

export function genererTableau(etat: ModeleAtelier, type: TypeTableau): Tableau {
  let colonnes: string[];
  let unites: (string | null)[];
  let lignes: Cellule[][] = [];
  let total: Cellule[] | null = null;
  switch (type) {
    case "pieces": {
      colonnes = ["Niveau", "Code", "Nom", "Catégorie", "Aire calculée", "Aire déclarée", "Écart signalé", "Identifiant"];
      unites = [null, null, null, null, "m²", "m²", null, null];
      const q = quantites(etat);
      for (const n of q.niveaux) for (const p of n.pieces) lignes.push([n.nom, p.code, p.nom, p.categorie, r2(p.aireCalculee), p.aireDeclaree === null ? null : r2(p.aireDeclaree), p.ecartSignale ? "oui" : "non", p.id]);
      total = ["Total", null, `${lignes.length} pièce(s)`, null, r2(q.totaux.airePieces), null, null, null];
      break;
    }
    case "portes":
    case "fenetres":
      colonnes = ["Niveau", "Repère", "Identifiant", "Mur hôte", "Largeur", "Hauteur", "Allège", "Type", "Phase"];
      unites = [null, null, null, null, "m", "m", "m", null, null];
      lignes = ouvertures(etat, type === "portes" ? "porte" : "fenetre");
      total = ["Total", null, `${lignes.length} ${type === "portes" ? "porte(s)" : "fenêtre(s)"}`, null, null, null, null, null, null];
      break;
    case "murs": {
      colonnes = ["Niveau", "Identifiant", "Type", "Extérieur", "Longueur d'axe", "Épaisseur", "Hauteur", "Surface nette d'une face", "Phase"];
      unites = [null, null, null, null, "m", "m", "m", "m²", null];
      let L = 0;
      for (const n of niveauxOrdonnes(etat)) {
        for (const m of objetsDeClasse(etat, "mur", n.id).sort(parId)) {
          const l = distance(m.params.a, m.params.b);
          L += l;
          lignes.push([n.nom, m.id, m.definitionId ?? "non typé", m.params.exterieur ? "oui" : "non", r3(l), r3(m.params.epaisseur.value), m.params.hauteur ? r3(m.params.hauteur.value) : m.params.niveauHautId ? `jusqu'à ${etat.niveaux[m.params.niveauHautId]?.nom ?? m.params.niveauHautId}` : null, surfaceNette(etat, m), m.phase ?? null]);
        }
      }
      total = ["Total", `${lignes.length} mur(s)`, null, null, r2(L), null, null, null, null];
      break;
    }
    case "composants": {
      colonnes = ["Définition", "Nature", "Nom", "Classification", "Occurrences", "Niveaux"];
      unites = [null, null, null, null, "u", null];
      const defs = Object.values(etat.definitions).filter((d) => d.classe === "composant" || d.classe === "bloc").sort((a, b) => (a.id < b.id ? -1 : 1));
      for (const d of defs) {
        const occ = Object.values(etat.objets).filter((o) => o.classe === "bloc-occurrence" && o.definitionId === d.id);
        const niveaux = [...new Set(occ.map((o) => (o.niveauId ? (etat.niveaux[o.niveauId]?.nom ?? o.niveauId) : "—")))].sort();
        lignes.push([d.id, d.classe === "composant" ? "composant" : "bloc", d.nom, (d.params["classification"] as string | undefined) ?? "non classé", occ.length, niveaux.join(", ")]);
      }
      break;
    }
    case "synthese": {
      colonnes = ["Niveau", "Altitude", "Pièces", "Aire des pièces", "Murs", "Longueur de murs", "Murs sans hauteur", "Portes", "Fenêtres", "Dalles (aire nette)", "Poteaux", "Escaliers"];
      unites = [null, "m", "u", "m²", "u", "m", "u", "u", "u", "m²", "u", "u"];
      const q = quantites(etat);
      for (const n of q.niveaux) lignes.push([n.nom, r3(n.elevation), n.pieces.length, r2(n.airePieces), n.murs.nombre, r2(n.murs.longueurAxe), n.murs.sansHauteur, n.ouvertures.portes, n.ouvertures.fenetres, r2(n.dalles.aireNette), n.poteaux, n.escaliers]);
      const t = q.totaux;
      total = ["Total", null, t.pieces, r2(t.airePieces), t.murs, r2(t.longueurMurs), q.niveaux.reduce((s, n) => s + n.murs.sansHauteur, 0), t.portes, t.fenetres, r2(t.aireDalles), t.poteaux, t.escaliers];
      break;
    }
  }
  return { type, titre: TABLEAUX[type], colonnes, unites, lignes, total, empreinte: empreinteDe({ type, colonnes, lignes, total }) };
}

const cellCsv = (v: Cellule) => (v === null ? `"${NON_EVALUEE}"` : typeof v === "number" ? String(v) : `"${v.replace(/"/g, '""')}"`);

/** CSV (BOM, séparateur « ; », point décimal, une ligne d'en-tête avec les unités). */
export function csvTableau(t: Tableau): string {
  const entete = t.colonnes.map((c, i) => (t.unites[i] ? `${c} (${t.unites[i]})` : c));
  const lignes = [entete.map((c) => `"${c.replace(/"/g, '""')}"`).join(";"), ...t.lignes.map((l) => l.map(cellCsv).join(";"))];
  if (t.total) lignes.push(t.total.map((v) => (v === null ? "" : cellCsv(v))).join(";"));
  return "﻿" + lignes.join("\r\n") + "\r\n";
}

const fmt = (v: Cellule) => (v === null ? `<span class="ne">${NON_EVALUEE}</span>` : typeof v === "number" ? String(v).replace(".", ",") : echapperXml(v));

/** Rapport HTML des quantités (synthèse puis tableaux), daté par la révision du modèle et son empreinte. */
export function rapportQuantitesHtml(etat: ModeleAtelier, projet: { nom: string; code: string }, revision: number): string {
  const types: TypeTableau[] = ["synthese", "pieces", "murs", "portes", "fenetres", "composants"];
  const tableaux = types.map((t) => genererTableau(etat, t));
  const empreinte = empreinteDe(tableaux.map((t) => t.empreinte));
  const table = (t: Tableau) =>
    `<section><h2>${echapperXml(t.titre)}</h2>${t.lignes.length ? `<table><thead><tr>${t.colonnes.map((c, i) => `<th>${echapperXml(c)}${t.unites[i] ? ` <small>(${t.unites[i]})</small>` : ""}</th>`).join("")}</tr></thead><tbody>${t.lignes.map((l) => `<tr>${l.map((v) => `<td>${fmt(v)}</td>`).join("")}</tr>`).join("")}</tbody>${t.total ? `<tfoot><tr>${t.total.map((v) => `<td>${v === null ? "" : fmt(v)}</td>`).join("")}</tr></tfoot>` : ""}</table>` : "<p>Aucun élément.</p>"}</section>`;
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>Quantités · ${echapperXml(projet.code)}</title>
<style>body{font:14px/1.45 system-ui,sans-serif;margin:24px;color:#1a1a1a}h1{font-size:22px}h2{font-size:16px;margin-top:28px}table{border-collapse:collapse;width:100%;font-size:12.5px}th,td{border:1px solid #c9d3cf;padding:4px 6px;text-align:left}th{background:#eef3f1}tfoot td{font-weight:600}.ne{color:#8a5a00;font-style:italic}.meta{color:#4a5a55}</style>
</head><body>
<h1>Quantités du modèle — ${echapperXml(projet.code)} · ${echapperXml(projet.nom)}</h1>
<p class="meta">Révision du modèle ${revision} · empreinte ${empreinte}. Quantités calculées depuis le modèle dessiné ; une valeur absente est « ${NON_EVALUEE} ». Les aires déclarées viennent de la source et ne sont jamais corrigées.</p>
${tableaux.map(table).join("\n")}
</body></html>
`;
}

export const tableauxDisponibles = (): TypeTableau[] => Object.keys(TABLEAUX) as TypeTableau[];
