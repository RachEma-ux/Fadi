/**
 * Exports de travail d'un niveau depuis le modèle typé (lot 4 : les exports au catalogue de l'ancien moteur sont
 * repris ; la matrice d'échanges complète DXF / IFC / PDF vient au lot 6). Purs : du modèle au texte.
 *
 * - DXF R12 ASCII, repère local du projet en mètres ; l'origine cadastrale et le CRS sont écrits en commentaire
 *   (R5 : jamais de mélange de repères, la conversion reste explicite) ; un calque DXF par calque du modèle.
 * - CSV des quantités (séparateur « ; », BOM, virgule décimale non utilisée : point, comme les tableaux existants).
 */
import { hoteOuverture, pointsArc, pointsEllipse, pointsSpline, type Vec } from "../geometrie.js";
import { type ModeleAtelier, type OccurrenceQuelconque } from "../modele.js";
import { quantites } from "../quantites.js";
import { Dxf } from "../documents/rendu-dxf.js";
import { polygoneMurRaccorde } from "../raccords.js";

const nb = (v: number) => (Math.abs(v) < 1e-12 ? "0" : String(Math.round(v * 1e6) / 1e6));
const calqueDxf = (nom: string | null | undefined) => (nom ? nom.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9_-]+/g, "_").slice(0, 31) || "0" : "0");

const centre = (pts: readonly Vec[]): Vec => ({ x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length });

function dessiner(d: Dxf, etat: ModeleAtelier, o: OccurrenceQuelconque): void {
  const calque = calqueDxf(o.calqueId ? (etat.calques[o.calqueId]?.nom ?? o.calqueId) : o.classe);
  switch (o.classe) {
    case "mur":
      d.polyligne(calque, polygoneMurRaccorde(etat, o), true);
      return;
    case "porte":
    case "fenetre":
    case "ouverture": {
      const h = etat.objets[o.params.murHoteId];
      if (!h || h.classe !== "mur") return;
      // Mur courbe (D-095) : trait sur la tangente à l'axe au centre de l'ouverture.
      const v = hoteOuverture(h.params, o.params.position, o.params.largeur.value);
      const L = Math.hypot(v.b.x - v.a.x, v.b.y - v.a.y);
      if (L < 1e-9) return;
      const u = { x: (v.b.x - v.a.x) / L, y: (v.b.y - v.a.y) / L };
      const c = { x: v.a.x + u.x * v.position * L, y: v.a.y + u.y * v.position * L };
      const w = o.params.largeur.value / 2;
      d.ligne(calque, { x: c.x - u.x * w, y: c.y - u.y * w }, { x: c.x + u.x * w, y: c.y + u.y * w });
      return;
    }
    case "dalle":
    case "toiture":
    case "zone":
    case "solide":
    case "reference-plan":
      d.polyligne(calque, o.params.contour, o.classe !== "solide" || o.params.ferme);
      for (const t of o.params.trous) d.polyligne(calque, t, true);
      return;
    case "piece":
      d.polyligne(calque, o.params.contour, true);
      if (o.params.contour.length) d.texte(calque, o.params.etiquette ?? centre(o.params.contour), 0.25, [o.params.code, o.params.nom].filter(Boolean).join(" "));
      return;
    case "espace":
      for (const pg of o.params.polygones) d.polyligne(calque, pg.contour, true);
      return;
    case "escalier": {
      const { a, b } = o.params;
      d.ligne(calque, a, b);
      const n = o.params.contremarches ?? o.params.marches ?? 0;
      const L = Math.hypot(b.x - a.x, b.y - a.y);
      if (n > 0 && L > 1e-9) {
        const u = { x: (b.x - a.x) / L, y: (b.y - a.y) / L };
        const nrm = { x: -u.y, y: u.x };
        const w = o.params.largeur.value / 2;
        for (let k = 0; k <= n; k++) {
          const p = { x: a.x + (u.x * L * k) / n, y: a.y + (u.y * L * k) / n };
          d.ligne(calque, { x: p.x - nrm.x * w, y: p.y - nrm.y * w }, { x: p.x + nrm.x * w, y: p.y + nrm.y * w });
        }
      }
      return;
    }
    case "poteau": {
      const ang = (o.params.angle.value * Math.PI) / 180;
      const u = { x: Math.cos(ang), y: Math.sin(ang) };
      const n = { x: -u.y, y: u.x };
      const lx = o.params.largeur.value / 2;
      const ly = o.params.profondeur.value / 2;
      const p = o.params.point;
      d.polyligne(calque, [
        { x: p.x - u.x * lx - n.x * ly, y: p.y - u.y * lx - n.y * ly },
        { x: p.x + u.x * lx - n.x * ly, y: p.y + u.y * lx - n.y * ly },
        { x: p.x + u.x * lx + n.x * ly, y: p.y + u.y * lx + n.y * ly },
        { x: p.x - u.x * lx + n.x * ly, y: p.y - u.y * lx + n.y * ly },
      ], true);
      return;
    }
    case "esquisse": {
      const p = o.params;
      if (p.forme === "cercle" && p.centre && p.rayon) d.cercle(calque, p.centre, p.rayon.value);
      else if (p.forme === "ellipse" && p.centre && p.rayon && p.rayonB) d.polyligne(calque, pointsEllipse(p.centre, p.rayon.value, p.rayonB.value, p.rotation?.value ?? 0), true);
      else if (p.forme === "arc" && p.centre && p.rayon) d.polyligne(calque, pointsArc(p.centre, p.rayon.value, p.angleDebut?.value ?? 0, p.angleFin?.value ?? 360), false);
      else if (p.forme === "spline") d.polyligne(calque, pointsSpline(p.points, 8, p.ferme, p.tangentes), p.ferme);
      else if (p.forme === "rectangle" && p.points.length === 2) {
        const [a, b] = [p.points[0]!, p.points[1]!];
        d.polyligne(calque, [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }], true);
      } else d.polyligne(calque, p.points, p.ferme || p.forme === "polygone" || p.forme === "hachure", p.renflements);
      return;
    }
    case "cotation":
      d.ligne(calque, o.params.a, o.params.b);
      return;
    case "texte":
      d.texte(calque, o.params.position, 0.25, o.params.texte);
      return;
    case "etiquette":
      d.texte(calque, o.params.position, 0.2, o.params.texte);
      return;
    default:
      return;
  }
}

/** Plan d'un niveau en DXF R12 (repère local, mètres). */
export function dxfNiveau(etat: ModeleAtelier, niveauId: string): string {
  const niveau = etat.niveaux[niveauId];
  const objets = (Object.values(etat.objets) as OccurrenceQuelconque[]).filter((o) => o.niveauId === niveauId && !(o.calqueId && etat.calques[o.calqueId]?.visible === false)).sort((a, b) => (a.id < b.id ? -1 : 1));
  const d = new Dxf();
  const origine = etat.site.parcelle?.origineLocale;
  d.paire(999, `Fadi · Atelier · niveau ${niveau?.nom ?? niveauId} (altitude ${nb(niveau?.elevation ?? 0)} m) · repère local du projet, mètres`);
  d.paire(999, origine ? `Origine du repère local = (${nb(origine.x)} ; ${nb(origine.y)}) en ${origine.crs} — cadastral = local + origine` : "Aucune parcelle : origine du repère local non rattachée au cadastre");
  d.paire(0, "SECTION");
  d.paire(2, "HEADER");
  d.paire(9, "$ACADVER");
  d.paire(1, "AC1009");
  d.paire(9, "$INSUNITS");
  d.paire(70, 6);
  d.paire(0, "ENDSEC");
  const calques = [...new Set(objets.map((o) => calqueDxf(o.calqueId ? (etat.calques[o.calqueId]?.nom ?? o.calqueId) : o.classe)))].sort();
  d.paire(0, "SECTION");
  d.paire(2, "TABLES");
  d.paire(0, "TABLE");
  d.paire(2, "LAYER");
  d.paire(70, calques.length);
  for (const c of calques) {
    d.paire(0, "LAYER");
    d.paire(2, c);
    d.paire(70, 0);
    d.paire(62, 7);
    d.paire(6, "CONTINUOUS");
  }
  d.paire(0, "ENDTAB");
  d.paire(0, "ENDSEC");
  d.paire(0, "SECTION");
  d.paire(2, "ENTITIES");
  for (const o of objets) dessiner(d, etat, o);
  d.paire(0, "ENDSEC");
  d.paire(0, "EOF");
  return d.lignes.join("\r\n") + "\r\n";
}

const cell = (v: string | number | null) => (v === null ? "" : typeof v === "number" ? nb(v) : `"${v.replace(/"/g, '""')}"`);

/** Quantités du modèle en CSV : une ligne par pièce, puis une ligne de synthèse par niveau. */
export function csvQuantites(etat: ModeleAtelier): string {
  const q = quantites(etat);
  const lignes = [["Niveau", "Altitude m", "Type", "Identifiant", "Code", "Nom", "Aire calculée m2", "Aire déclarée m2", "Écart signalé"].map((c) => cell(c)).join(";")];
  for (const n of q.niveaux) {
    for (const p of n.pieces) lignes.push([n.nom, n.elevation, "pièce", p.id, p.code, p.nom, p.aireCalculee, p.aireDeclaree, p.ecartSignale ? "oui" : "non"].map(cell).join(";"));
    lignes.push([n.nom, n.elevation, "niveau", n.niveauId, null, `${n.murs.nombre} murs · ${n.ouvertures.portes} portes · ${n.ouvertures.fenetres} fenêtres · ${n.poteaux} poteaux · ${n.escaliers} escaliers`, n.airePieces, null, null].map(cell).join(";"));
  }
  return "﻿" + lignes.join("\r\n") + "\r\n";
}
