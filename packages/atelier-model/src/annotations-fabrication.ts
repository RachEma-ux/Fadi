/**
 * Annotations de fabrication (P2-7, DA-15-03, 08 à 16) — pur. Textes dérivés des valeurs saisies (tolérance de cote,
 * cadre de tolérance géométrique, symbole de soudure, état de surface, symbole spécialiste, étiquette intelligente) et
 * tracé des symboles en primitives (lignes, cadres, flèches) : aucune police de symboles, aucune valeur par défaut
 * de tolérance ni de rugosité (R3). Les textes servent aux vues, aux fiches et à l'IFC (IfcAnnotation .TEXT.).
 */
import type { CaracteristiqueGeometrique, CordonSoudure, ModeleAtelier, Occurrence, OccurrenceQuelconque, ParamsAnnotationFabrication, ParamsCotation } from "./modele.js";
import { designationSection } from "./ontologies/structure/sections.js";
import { longueurBarre, longueurPoutre } from "./ontologies/structure/geometrie.js";
import { designationBois } from "./ontologies/timber/sections.js";
import { longueurElementBois } from "./ontologies/timber/geometrie.js";
import { designationReseau } from "./ontologies/mep/sections.js";
import { longueurSegment } from "./ontologies/mep/geometrie.js";
import { CLASSES } from "./ontologie.js";

const mm = (v: number) => `${Math.round(v * 1000 * 100) / 100}`.replace(".", ",");
const signe = (v: number) => (v >= 0 ? `+${mm(v)}` : `−${mm(-v)}`);

export const LIBELLES_CARACTERISTIQUE: Record<CaracteristiqueGeometrique, string> = {
  planeite: "Planéité", rectitude: "Rectitude", circularite: "Circularité", cylindricite: "Cylindricité", parallelisme: "Parallélisme", perpendicularite: "Perpendicularité", inclinaison: "Inclinaison", position: "Position", coaxialite: "Coaxialité", symetrie: "Symétrie", "profil-ligne": "Profil d'une ligne", "profil-surface": "Profil d'une surface",
};
/** Symboles ISO 1101 (caractères Unicode : affichage seulement, le tracé des cadres est en primitives). */
export const SYMBOLES_CARACTERISTIQUE: Record<CaracteristiqueGeometrique, string> = {
  planeite: "⏥", rectitude: "⏤", circularite: "○", cylindricite: "⌭", parallelisme: "∥", perpendicularite: "⟂", inclinaison: "∠", position: "⌖", coaxialite: "◎", symetrie: "⌯", "profil-ligne": "⌒", "profil-surface": "⌓",
};
export const LIBELLES_CORDON: Record<CordonSoudure, string> = {
  "bout-a-bout": "Bout à bout (I)", angle: "Angle", v: "En V", "demi-v": "En demi-V", u: "En U", j: "En J", bouchon: "Bouchon", point: "Par points", ligne: "En ligne continue",
};

/** Texte d'une cote mécanique : préfixe, longueur (mm) et tolérance « +a / −b » (mm) si saisie. */
export function texteCotation(p: Pick<ParamsCotation, "prefixe" | "tolerance">, longueurM: number): string {
  const base = `${p.prefixe ?? ""}${mm(longueurM)}`;
  if (!p.tolerance) return base;
  const { plus, moins } = p.tolerance;
  if (Math.abs(plus - moins) < 1e-12) return `${base} ±${mm(Math.abs(plus))}`;
  return `${base} ${signe(plus)}/${signe(-moins)}`;
}

/** Texte d'une annotation de fabrication (une ligne). */
export function texteAnnotation(p: ParamsAnnotationFabrication): string {
  switch (p.type) {
    case "tolerance-geometrique":
      return `${SYMBOLES_CARACTERISTIQUE[p.caracteristique]} ${mm(p.valeur.value)}${p.references.length ? ` | ${p.references.join(" | ")}` : ""}`;
    case "soudure":
      return `${LIBELLES_CORDON[p.cordon]}${p.taille ? ` a${mm(p.taille.value)}` : ""}${p.longueur ? ` × ${mm(p.longueur.value)}` : ""}${p.cote === "oppose" ? " (côté opposé)" : p.cote === "deux-cotes" ? " (deux côtés)" : ""}${p.peripherique ? " périphérique" : ""}${p.chantier ? " chantier" : ""}${p.procede ? ` ${p.procede}` : ""}`;
    case "etat-de-surface":
      return `${p.parametre} ${`${p.valeur}`.replace(".", ",")} µm${p.procede ? ` ${p.procede}` : ""}${p.stries ? ` ${p.stries}` : ""}`;
    case "specialiste":
      return `${p.famille} : ${p.texte}`;
  }
}

/** Valeur d'un champ d'étiquette intelligente sur un objet ; null quand l'objet ne le porte pas (jamais inventé). */
export function champObjet(etat: ModeleAtelier, o: OccurrenceQuelconque, champ: string): string | null {
  const p = o.params as unknown as Record<string, unknown>;
  const r3 = (v: number) => `${Math.round(v * 1000) / 1000}`.replace(".", ",");
  switch (champ) {
    case "nom": return typeof p["nom"] === "string" && p["nom"] ? (p["nom"] as string) : null;
    case "repere": return typeof p["repere"] === "string" && p["repere"] ? (p["repere"] as string) : null;
    case "numero": return typeof p["numero"] === "number" ? String(p["numero"]) : typeof p["numero"] === "string" && p["numero"] ? (p["numero"] as string) : null;
    case "classe": return CLASSES[o.classe].libelle;
    case "niveau": return o.niveauId ? (etat.niveaux[o.niveauId]?.nom ?? null) : null;
    case "section":
      if (o.classe === "poutre") return designationSection(o.params.section);
      if (o.classe === "element-bois") return designationBois(o.params.section);
      if (o.classe === "segment-reseau" || o.classe === "vanne" || o.classe === "raccord-reseau") return designationReseau(o.params.section, o.params.profil);
      return null;
    case "longueur":
      if (o.classe === "poutre") return `${r3(longueurPoutre(o.params))} m`;
      if (o.classe === "element-bois") return `${r3(longueurElementBois(o.params))} m`;
      if (o.classe === "segment-reseau") return `${r3(longueurSegment(o.params))} m`;
      if (o.classe === "armature") return `${r3(longueurBarre(o.params))} m`;
      if (o.classe === "mur" || o.classe === "rampe" || o.classe === "mur-rideau") return `${r3(Math.hypot(o.params.b.x - o.params.a.x, o.params.b.y - o.params.a.y))} m`;
      return null;
    case "volume": return typeof p["volume"] === "number" ? `${r3(p["volume"] as number)} m³` : null;
    default: return null;
  }
}

/** Texte d'une étiquette : gabarit `{champ}` résolu sur l'objet visé, « non évalué » pour un champ absent ; sans gabarit, le texte saisi. */
export function texteEtiquette(etat: ModeleAtelier, e: Occurrence<"etiquette">): string {
  if (!e.params.champ) return e.params.texte;
  const cible = e.params.objetId ? etat.objets[e.params.objetId] : undefined;
  return e.params.champ.replace(/\{([a-z]+)\}/g, (_, k: string) => (cible ? (champObjet(etat, cible, k) ?? "non évalué") : "objet absent"));
}

export interface TraceurSymbole {
  ligne(a: { x: number; y: number }, b: { x: number; y: number }): void;
  cadre(x0: number, y0: number, x1: number, y1: number): void;
  texte(p: { x: number; y: number }, t: string, ancre?: "debut" | "milieu" | "fin"): void;
}

/**
 * Tracé d'un symbole de fabrication à la position donnée (mètres du dessin ; `taille` = hauteur du symbole en m,
 * à choisir d'après l'échelle) : ligne de repère et flèche vers l'attache, cadre de tolérance par case, symbole de
 * soudure (ligne de référence, queue, cordon côté flèche ou opposé), état de surface (coche), texte des autres.
 */
export function tracerAnnotation(t: TraceurSymbole, p: ParamsAnnotationFabrication, taille: number): void {
  const pos = p.position;
  if (p.attache) {
    t.ligne(pos, p.attache);
    const dx = pos.x - p.attache.x, dy = pos.y - p.attache.y, L = Math.hypot(dx, dy) || 1;
    const ux = dx / L, uy = dy / L, h = taille * 0.6;
    t.ligne(p.attache, { x: p.attache.x + ux * h - uy * h * 0.35, y: p.attache.y + uy * h + ux * h * 0.35 });
    t.ligne(p.attache, { x: p.attache.x + ux * h + uy * h * 0.35, y: p.attache.y + uy * h - ux * h * 0.35 });
  }
  const h = taille;
  switch (p.type) {
    case "tolerance-geometrique": {
      // Cadre par case : symbole | valeur | références.
      const cases = [SYMBOLES_CARACTERISTIQUE[p.caracteristique], mm(p.valeur.value), ...p.references];
      let x = pos.x;
      for (const c of cases) {
        const w = Math.max(h, (c.length * h) / 1.6);
        t.cadre(x, pos.y, x + w, pos.y + h);
        t.texte({ x: x + w / 2, y: pos.y + h * 0.28 }, c, "milieu");
        x += w;
      }
      break;
    }
    case "soudure": {
      // Ligne de référence horizontale avec queue ; cordon dessiné sous (côté flèche) ou sur (côté opposé) la ligne.
      const L = h * 4;
      t.ligne(pos, { x: pos.x + L, y: pos.y });
      t.ligne({ x: pos.x + L, y: pos.y }, { x: pos.x + L + h * 0.6, y: pos.y + h * 0.5 });
      t.ligne({ x: pos.x + L, y: pos.y }, { x: pos.x + L + h * 0.6, y: pos.y - h * 0.5 });
      const cotes = p.cote === "deux-cotes" ? [-1, 1] : p.cote === "oppose" ? [1] : [-1];
      for (const s of cotes) {
        const y = pos.y + s * h * 0.05, cx = pos.x + L / 2;
        if (p.cordon === "angle") { t.ligne({ x: cx - h / 2, y }, { x: cx - h / 2, y: y + s * h }); t.ligne({ x: cx - h / 2, y: y + s * h }, { x: cx + h / 2, y }); }
        else if (p.cordon === "v" || p.cordon === "demi-v") { t.ligne({ x: cx - h / 2, y: y + s * h }, { x: cx, y }); t.ligne({ x: cx, y }, { x: cx + h / 2, y: y + s * h }); }
        else if (p.cordon === "u" || p.cordon === "j") { t.ligne({ x: cx - h / 2, y: y + s * h }, { x: cx - h / 2, y: y + s * h * 0.3 }); t.ligne({ x: cx - h / 2, y: y + s * h * 0.3 }, { x: cx + h / 2, y: y + s * h * 0.3 }); t.ligne({ x: cx + h / 2, y: y + s * h * 0.3 }, { x: cx + h / 2, y: y + s * h }); }
        else if (p.cordon === "bout-a-bout") { t.ligne({ x: cx - h * 0.2, y }, { x: cx - h * 0.2, y: y + s * h }); t.ligne({ x: cx + h * 0.2, y }, { x: cx + h * 0.2, y: y + s * h }); }
        else if (p.cordon === "bouchon" || p.cordon === "point") { t.cadre(cx - h * 0.4, Math.min(y, y + s * h * 0.8), cx + h * 0.4, Math.max(y, y + s * h * 0.8)); }
        else { t.ligne({ x: cx - h / 2, y: y + s * h * 0.5 }, { x: cx + h / 2, y: y + s * h * 0.5 }); }
      }
      if (p.peripherique) t.cadre(pos.x - h * 0.3, pos.y - h * 0.3, pos.x + h * 0.3, pos.y + h * 0.3);
      if (p.chantier) { t.ligne({ x: pos.x, y: pos.y }, { x: pos.x, y: pos.y + h * 1.4 }); t.ligne({ x: pos.x, y: pos.y + h * 1.4 }, { x: pos.x + h * 0.6, y: pos.y + h * 1.1 }); }
      t.texte({ x: pos.x, y: pos.y - h * 1.5 }, texteAnnotation(p), "debut");
      break;
    }
    case "etat-de-surface": {
      // Coche normalisée : deux branches, valeur à droite de la grande branche.
      t.ligne({ x: pos.x, y: pos.y + h * 0.6 }, { x: pos.x + h * 0.5, y: pos.y });
      t.ligne({ x: pos.x + h * 0.5, y: pos.y }, { x: pos.x + h * 1.3, y: pos.y + h * 1.6 });
      t.texte({ x: pos.x + h * 1.5, y: pos.y + h * 0.6 }, texteAnnotation(p), "debut");
      break;
    }
    case "specialiste":
      t.cadre(pos.x, pos.y, pos.x + Math.max(h * 2, (texteAnnotation(p).length * h) / 1.6), pos.y + h);
      t.texte({ x: pos.x + h * 0.2, y: pos.y + h * 0.28 }, texteAnnotation(p), "debut");
      break;
  }
}
