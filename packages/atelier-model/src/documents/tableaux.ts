/**
 * Tableaux et rapport de quantités reproductibles depuis une révision (cahier §5.9, DA-16-10) : pièces, portes,
 * fenêtres, murs, composants et synthèse par niveau. Une valeur absente du modèle est écrite « non évaluée »,
 * jamais remplacée. Ordre déterministe (niveau, puis identifiant) : deux générations à la même révision donnent
 * les mêmes octets.
 */
import { aireBaie, LIBELLES_CINTRE } from "../cintres.js";
import { aire, aireNette, distance } from "../geometrie.js";
import { contoursArchitecture } from "../blocs-places.js";
import { aireSection, designationSection } from "../ontologies/structure/sections.js";
import { longueurBarre, longueurPoutre } from "../ontologies/structure/geometrie.js";
import { assemblagesSoudes } from "../ontologies/structure/soudures.js";
import { aireBois, designationBois } from "../ontologies/timber/sections.js";
import { longueurElementBois, volumePanneauClt } from "../ontologies/timber/geometrie.js";
import { developpe, parametresPli, tablePliage } from "../ontologies/sheetmetal/pliage.js";
import { designationReseau } from "../ontologies/mep/sections.js";
import { longueurSegment } from "../ontologies/mep/geometrie.js";
import { connexionDuPort, portsDe } from "../ontologies/mep/connectivite.js";
import type { ModeleAtelier, Occurrence } from "../modele.js";
import { niveauxOrdonnes, objetsDeClasse, ouverturesDuMur } from "../modele.js";
import { quantites } from "../quantites.js";
import { echapperXml } from "./rendu-svg.js";
import { empreinteDe } from "./empreinte.js";

export type TypeTableau = "pieces" | "portes" | "fenetres" | "murs" | "composants" | "nomenclature" | "structure" | "armatures" | "assemblagesStructure" | "bois" | "pliage" | "reseau" | "synthese";
export const TABLEAUX: Record<TypeTableau, string> = {
  pieces: "Tableau des pièces",
  portes: "Tableau des portes",
  fenetres: "Tableau des fenêtres",
  murs: "Tableau des murs",
  composants: "Tableau des composants",
  nomenclature: "Nomenclature des assemblages",
  structure: "Nomenclature de structure",
  armatures: "Nomenclature des armatures",
  assemblagesStructure: "Assemblages de structure et soudures",
  bois: "Liste des pièces de bois",
  pliage: "Table de pliage et développés",
  reseau: "Nomenclature de réseau",
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
      lignes.push([n.nom, o.params.repere ?? null, o.id, mur?.id ?? `${o.params.murHoteId} (absent)`, r3(o.params.largeur.value), r3(o.params.hauteur.value), o.params.allege ? r3(o.params.allege.value) : null, o.params.cintre ? LIBELLES_CINTRE[o.params.cintre.type] : "droit", o.definitionId ?? null, o.phase ?? null]);
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
  const vides = ouverturesDuMur(etat, m.id).reduce((s, o) => s + aireBaie(o.params.cintre, o.params.largeur.value, o.params.hauteur.value), 0); // baie cintrée : aire exacte du profil (D-141)
  return r2(Math.max(0, L * H - vides));
}

export function genererTableau(etat: ModeleAtelier, type: TypeTableau): Tableau {
  let colonnes: string[];
  let unites: (string | null)[];
  let lignes: Cellule[][] = [];
  let total: Cellule[] | null = null;
  switch (type) {
    case "pieces": {
      // Hauteur propre et volume (D-059) : « non évaluée » tant que la hauteur n'est pas déclarée.
      colonnes = ["Niveau", "Code", "Nom", "Catégorie", "Aire calculée", "Aire déclarée", "Écart signalé", "Hauteur", "Volume", "Identifiant"];
      unites = [null, null, null, null, "m²", "m²", null, "m", "m³", null];
      const q = quantites(etat);
      for (const n of q.niveaux) for (const p of n.pieces) lignes.push([n.nom, p.code, p.nom, p.categorie, r2(p.aireCalculee), p.aireDeclaree === null ? null : r2(p.aireDeclaree), p.ecartSignale ? "oui" : "non", p.hauteur === undefined ? null : r3(p.hauteur), p.volume === undefined ? null : r2(p.volume), p.id]);
      total = ["Total", null, `${lignes.length} pièce(s)`, null, r2(q.totaux.airePieces), null, null, null, null, null];
      break;
    }
    case "portes":
    case "fenetres":
      // Haut de baie (D-141) : « droit » ou le cintre ; la hauteur va jusqu'à la clé.
      colonnes = ["Niveau", "Repère", "Identifiant", "Mur hôte", "Largeur", "Hauteur", "Allège", "Haut", "Type", "Phase"];
      unites = [null, null, null, null, "m", "m", "m", null, null, null];
      lignes = ouvertures(etat, type === "portes" ? "porte" : "fenetre");
      total = ["Total", null, `${lignes.length} ${type === "portes" ? "porte(s)" : "fenêtre(s)"}`, null, null, null, null, null, null, null];
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
    case "nomenclature": {
      // Nomenclature (P2-2, DA-10-14 / 15 / 16) : une ligne par pièce d'assemblage, dans l'ordre des numéros ; masse
      // « non évaluée » tant qu'aucune densité sourcée n'est fournie (R3).
      colonnes = ["Assemblage", "N°", "Référence", "Pièce", "Matériau", "Volume", "Quantité", "Niveau", "Liaisons"];
      unites = [null, null, null, null, null, "m³", "u", null, null];
      const asms = objetsDeClasse(etat, "assemblage").sort(parId);
      for (const a of asms) {
        const pieces = objetsDeClasse(etat, "piece-mecanique").filter((o) => o.params.assemblageId === a.id).sort((x, y) => (x.params.numero ?? 1e9) - (y.params.numero ?? 1e9) || (x.id < y.id ? -1 : 1));
        for (const pc of pieces) {
          const liaisons = objetsDeClasse(etat, "liaison").filter((l) => l.params.a === pc.id || l.params.b === pc.id).length;
          lignes.push([a.params.nom, pc.params.numero, pc.params.reference, pc.params.nom, pc.params.materiau, pc.params.volume === null ? null : r3(pc.params.volume), 1, pc.niveauId ? (etat.niveaux[pc.niveauId]?.nom ?? pc.niveauId) : "—", liaisons]);
        }
      }
      total = ["Total", null, null, `${lignes.length} pièce(s)`, null, r3(lignes.reduce((s, l) => s + (typeof l[5] === "number" ? l[5] : 0), 0)), lignes.length, null, null];
      break;
    }
    case "structure": {
      // Nomenclature de structure (P2-3, DA-08-17 / 19) : poteaux, éléments linéaires et plaques ; masse « non évaluée »
      // sans masse linéique sourcée (R3) ; source du profil citée telle quelle.
      colonnes = ["Niveau", "Élément", "Classe", "Nom", "Rôle", "Section", "Source du profil", "Matériau", "Longueur", "Volume", "Masse", "Préfabriqué", "Trame", "Coulage"];
      unites = [null, null, null, null, null, null, null, null, "m", "m³", "kg", null, null, null];
      const coulages = objetsDeClasse(etat, "coulage");
      const coulageDe = (id: string) => coulages.find((c) => c.params.elements.includes(id))?.params.nom ?? null;
      for (const n of niveauxOrdonnes(etat)) {
        for (const o of objetsDeClasse(etat, "poteau", n.id).sort(parId)) {
          const c = contoursArchitecture("poteau", o.params as unknown as Record<string, unknown>);
          const h = o.params.hauteur?.value ?? null;
          const vol = c && h ? aire(c.contour) * h : null;
          lignes.push([n.nom, o.id, "poteau", o.params.nom, "poteau", `${o.params.formeId} ${Math.round(o.params.largeur.value * 1000)} × ${Math.round(o.params.profondeur.value * 1000)}${o.params.epaisseurProfil ? ` e ${Math.round(o.params.epaisseurProfil.value * 1000)}` : ""} mm`, null, ((o.proprietes["materiauNom"]?.valeur ?? o.proprietes["materiau"]?.valeur) as string | undefined) ?? null, h === null ? null : r3(h), vol === null ? null : r3(vol), null, "non", (o.proprietes["trame"]?.valeur as string | undefined) ?? null, coulageDe(o.id)]);
        }
        for (const o of objetsDeClasse(etat, "poutre", n.id).sort(parId)) {
          const L = longueurPoutre(o.params);
          const sec = o.params.section;
          lignes.push([n.nom, o.id, "poutre", o.params.nom, o.params.role, designationSection(sec), sec.profil?.source ?? null, o.params.materiauNom ?? o.params.materiau, r3(L), r3(aireSection(sec) * L), sec.masseLineique === null ? null : r2(sec.masseLineique * L), o.params.prefabrique ? "oui" : "non", o.params.trameId, coulageDe(o.id)]);
        }
        for (const o of objetsDeClasse(etat, "plaque", n.id).sort(parId)) {
          lignes.push([n.nom, o.id, "plaque", o.params.nom, "plaque", `e ${Math.round(o.params.epaisseur.value * 1000)} mm`, null, o.params.materiauNom ?? o.params.materiau, null, r3(aireNette(o.params.contour, o.params.trous) * o.params.epaisseur.value), null, o.params.prefabrique ? "oui" : "non", null, coulageDe(o.id)]);
        }
      }
      const masses = lignes.map((l) => l[10]).filter((v): v is number => typeof v === "number");
      total = ["Total", `${lignes.length} élément(s)`, null, null, null, null, null, null, r3(lignes.reduce((acc, l) => acc + (typeof l[8] === "number" ? l[8] : 0), 0)), r3(lignes.reduce((acc, l) => acc + (typeof l[9] === "number" ? l[9] : 0), 0)), masses.length === lignes.length && lignes.length ? r2(masses.reduce((acc, v) => acc + v, 0)) : null, null, null, null];
      break;
    }
    case "armatures": {
      // Nomenclature des armatures (DA-08-14 / 18) : diamètre, longueur développée, nombre ; masse non évaluée (aucune densité sourcée).
      colonnes = ["Niveau", "Armature", "Nom", "Hôte", "Forme", "Diamètre", "Longueur unitaire", "Nombre", "Longueur totale", "Nuance", "Masse"];
      unites = [null, null, null, null, null, "mm", "m", "u", "m", null, "kg"];
      for (const n of niveauxOrdonnes(etat)) {
        for (const o of objetsDeClasse(etat, "armature", n.id).sort(parId)) {
          const Lu = longueurBarre(o.params);
          lignes.push([n.nom, o.id, o.params.nom, o.params.hoteId, o.params.forme, Math.round(o.params.diametre.value * 1000), r3(Lu), o.params.nombre, r3(Lu * o.params.nombre), o.params.nuance, null]);
        }
      }
      total = ["Total", `${lignes.length} armature(s)`, null, null, null, null, null, lignes.reduce((acc, l) => acc + (typeof l[7] === "number" ? l[7] : 0), 0), r3(lignes.reduce((acc, l) => acc + (typeof l[8] === "number" ? l[8] : 0), 0)), null, null];
      break;
    }
    case "assemblagesStructure": {
      // Assemblages paramétriques (DA-08-10 / 12 / 13) et assemblages soudés dérivés (DA-10-10).
      colonnes = ["Nature", "Assemblage", "Nom ou type", "Éléments", "Platine", "Boulons", "Diamètre des boulons", "Soudures", "Longueur de cordon"];
      unites = [null, null, null, null, "mm", "u", "mm", "u", "m"];
      for (const o of objetsDeClasse(etat, "assemblage-structurel").sort(parId)) {
        const b = o.params.boulons;
        lignes.push(["paramétrique", o.id, o.params.nom ?? o.params.type, o.params.elements.join(", "), `${Math.round(o.params.platine.largeur.value * 1000)} × ${Math.round(o.params.platine.hauteur.value * 1000)} × ${Math.round(o.params.platine.epaisseur.value * 1000)}`, b ? b.rangees * b.parRangee : 0, b ? Math.round(b.diametre.value * 1000) : null, null, null]);
      }
      for (const w of assemblagesSoudes(etat)) lignes.push(["soudé", w.id, `assemblage soudé ${w.elements[0]}`, w.elements.join(", "), null, null, null, w.soudures.length, r3(w.longueur)]);
      total = ["Total", `${lignes.length} assemblage(s)`, null, null, null, lignes.reduce((acc, l) => acc + (typeof l[5] === "number" ? l[5] : 0), 0), null, lignes.reduce((acc, l) => acc + (typeof l[7] === "number" ? l[7] : 0), 0), r3(lignes.reduce((acc, l) => acc + (typeof l[8] === "number" ? l[8] : 0), 0))];
      break;
    }
    case "bois": {
      // Liste des pièces de bois (P2-4, DA-09) : pièces, panneaux CLT et quincaillerie des assemblages ; masse non évaluée.
      colonnes = ["Niveau", "Repère", "Pièce", "Classe", "Rôle", "Section", "Essence", "Classe de résistance", "Source", "Longueur", "Volume", "Ossature", "Masse"];
      unites = [null, null, null, null, null, null, null, null, null, "m", "m³", null, "kg"];
      for (const n of niveauxOrdonnes(etat)) {
        for (const o of objetsDeClasse(etat, "element-bois", n.id).sort(parId)) {
          const L = longueurElementBois(o.params);
          const sec = o.params.section;
          lignes.push([n.nom, o.params.repere, o.params.nom ?? o.id, "pièce", o.params.role, designationBois(sec), sec.essence, sec.classe, sec.profil?.source ?? null, r3(L), r3(aireBois(sec) * L), o.params.ossatureId, null]);
        }
        for (const o of objetsDeClasse(etat, "panneau-clt", n.id).sort(parId)) {
          lignes.push([n.nom, null, o.params.nom ?? o.id, "panneau CLT", o.params.pose, `${o.params.couches} couches, e ${Math.round(o.params.epaisseur.value * 1000)} mm`, o.params.essence, o.params.classe, o.params.profil?.source ?? null, o.params.pose === "mur" && o.params.a && o.params.b ? r3(Math.hypot(o.params.b.x - o.params.a.x, o.params.b.y - o.params.a.y)) : null, r3(volumePanneauClt(o.params)), null, null]);
        }
        for (const o of objetsDeClasse(etat, "assemblage-bois", n.id).sort(parId)) {
          for (const q of o.params.quincaillerie) lignes.push([n.nom, null, `${o.params.nom ?? o.id} : ${q.designation}`, "quincaillerie", o.params.type, `× ${q.nombre}`, null, null, q.source, null, null, null, null]);
        }
      }
      total = ["Total", null, `${lignes.length} ligne(s)`, null, null, null, null, null, null, r3(lignes.reduce((acc, l) => acc + (typeof l[9] === "number" ? l[9] : 0), 0)), r3(lignes.reduce((acc, l) => acc + (typeof l[10] === "number" ? l[10] : 0), 0)), null, null];
      break;
    }
    case "pliage": {
      // Table de pliage et développés (P2-4, DA-11-03 à 05) : un pli par ligne, paramètres sourcés ou « non évalués ».
      colonnes = ["Tôle", "Repère", "Matériau", "Épaisseur", "Bord", "Angle", "Rayon intérieur", "Facteur K", "Allongement", "Source", "Développé (L × l)", "Aire développée"];
      unites = [null, null, null, "mm", null, "°", "mm", null, "mm", null, "mm", "m²"];
      for (const o of objetsDeClasse(etat, "tole").sort(parId)) {
        const table = tablePliage(o.params, etat.definitions as Record<string, { classe: string; params: Record<string, unknown> }>);
        const dev = developpe(o.params, table);
        const enc = dev.nonEvalues.length ? null : `${Math.round(dev.encombrement.longueur * 1000)} × ${Math.round(dev.encombrement.largeur * 1000)}`;
        if (!o.params.plis.length) lignes.push([o.params.nom ?? o.id, o.params.repere, o.params.materiau, Math.round(o.params.epaisseur.value * 1000), null, null, null, null, null, null, enc, dev.nonEvalues.length ? null : r3(dev.aire)]);
        for (const pli of o.params.plis) {
          const pr = parametresPli(o.params, pli, table);
          lignes.push([o.params.nom ?? o.id, o.params.repere, o.params.materiau, Math.round(o.params.epaisseur.value * 1000), pli.bord, pli.angle.value, Math.round(pr.rayon * 1000), pr.facteurK, pr.allongement === null ? null : r2(pr.allongement * 1000), pr.source, enc, dev.nonEvalues.length ? null : r3(dev.aire)]);
        }
      }
      total = ["Total", null, null, null, null, null, null, null, null, null, `${objetsDeClasse(etat, "tole").length} tôle(s)`, null];
      break;
    }
    case "reseau": {
      // Nomenclature de réseau (P2-5, DA-12) : segments, raccords, vannes, équipements, supports ; ports libres comptés ; masse non évaluée.
      colonnes = ["Niveau", "Classe", "Objet", "Repère", "Système", "Type", "Section", "Longueur", "Fluide", "Matériau", "Spécification", "Source", "Ports", "Ports libres", "Masse"];
      unites = [null, null, null, null, null, null, null, "m", null, null, null, null, "u", "u", "kg"];
      const spec = (id: string | null) => (id ? (etat.definitions[id]?.nom ?? id) : null);
      const libres = (o: Occurrence<"segment-reseau"> | Occurrence<"raccord-reseau"> | Occurrence<"vanne"> | Occurrence<"equipement-reseau">) => portsDe(o).filter((p) => !connexionDuPort(etat, o.id, p.id)).length;
      for (const n of niveauxOrdonnes(etat)) {
        for (const o of objetsDeClasse(etat, "segment-reseau", n.id).sort(parId)) lignes.push([n.nom, "segment", o.params.nom ?? o.id, o.params.repere, o.params.systeme, null, designationReseau(o.params.section, o.params.profil), r3(longueurSegment(o.params)), o.params.fluide, o.params.materiau, spec(o.params.specificationId), o.params.profil?.source ?? null, 2, libres(o), null]);
        for (const o of objetsDeClasse(etat, "raccord-reseau", n.id).sort(parId)) lignes.push([n.nom, "raccord", o.params.nom ?? o.id, null, o.params.systeme, o.params.type, designationReseau(o.params.section, o.params.profil), null, o.params.fluide, o.params.materiau, spec(o.params.specificationId), o.params.profil?.source ?? null, o.params.ports.length, libres(o), null]);
        for (const o of objetsDeClasse(etat, "vanne", n.id).sort(parId)) lignes.push([n.nom, "vanne", o.params.nom ?? o.id, o.params.repere, "tuyau", o.params.type, designationReseau(o.params.section, o.params.profil), r3(o.params.longueur.value), o.params.fluide, o.params.materiau, spec(o.params.specificationId), o.params.profil?.source ?? null, o.params.type === "trois-voies" ? 3 : 2, libres(o), null]);
        for (const o of objetsDeClasse(etat, "equipement-reseau", n.id).sort(parId)) lignes.push([n.nom, "équipement", o.params.nom, o.params.repere, [...new Set(o.params.ports.map((p) => p.systeme ?? "tuyau"))].sort().join(" + "), `${o.params.type} (${o.params.categorie})`, `${Math.round(o.params.longueur.value * 1000)} × ${Math.round(o.params.largeur.value * 1000)} × ${Math.round(o.params.hauteur.value * 1000)} mm`, null, [...new Set(o.params.ports.map((p) => p.fluide).filter((f): f is string => !!f))].sort().join(", ") || null, null, null, null, o.params.ports.length, libres(o), null]);
        for (const o of objetsDeClasse(etat, "support-reseau", n.id).sort(parId)) lignes.push([n.nom, "support", o.params.nom ?? o.id, null, null, o.params.type, null, o.params.longueur ? r3(o.params.longueur.value) : null, null, null, null, null, null, null, null]);
      }
      total = ["Total", null, `${lignes.length} ligne(s)`, null, null, null, null, r3(lignes.filter((l) => l[1] === "segment").reduce((acc, l) => acc + (typeof l[7] === "number" ? l[7] : 0), 0)), null, null, null, null, lignes.reduce((acc, l) => acc + (typeof l[12] === "number" ? l[12] : 0), 0), lignes.reduce((acc, l) => acc + (typeof l[13] === "number" ? l[13] : 0), 0), null];
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
