/**
 * Construction d'une opération exacte (P2-1) depuis la sélection et les paramètres de l'outil « Solide exact ». Pur
 * (testé) : rend l'opération à soumettre au noyau (aperçu dans le navigateur, calcul de référence sur le serveur),
 * ou le message qui dit ce qui manque (UX4). Toutes les coordonnées sont relatives au niveau (z = 0 au niveau).
 */
import type { OperandeExacte, OperationExacte, Point2, Point3 } from "@parcours/geometry-exact";
import { contoursArchitecture, etendueDalle, etendueMur, facesMur, pointsPolyligne, type ModeleAtelier, type OccurrenceQuelconque } from "@parcours/atelier-model";
import { contourEsquisse } from "../actions";

export type TypeOperationExacte = "revolution" | "balayage" | "lissage" | "booleen" | "trou" | "coque" | "surface" | "patch" | "conge";
export const OPERATIONS_EXACTES: { id: TypeOperationExacte; libelle: string; aide: string }[] = [
  { id: "revolution", libelle: "Révolution", aide: "Sélectionnez une esquisse fermée (profil) et une ligne d'esquisse (axe) ; angle dans les paramètres." },
  { id: "balayage", libelle: "Balayage", aide: "Sélectionnez une esquisse fermée (profil) et une ligne ou polyligne ouverte (trajet) ; le profil est placé perpendiculairement au départ du trajet, à la hauteur donnée." },
  { id: "lissage", libelle: "Lissage", aide: "Sélectionnez deux esquisses fermées : la première au niveau, la seconde à la hauteur donnée." },
  { id: "booleen", libelle: "Booléen exact", aide: "Sélectionnez deux objets : solides exacts, murs, dalles, poteaux ou solides fermés (le paramétrique reste canonique : son extrusion sert d'opérande)." },
  { id: "trou", libelle: "Trou", aide: "Sélectionnez un solide exact ; diamètre, profondeur (0 = traversant) et centre dans les paramètres (par défaut : centre de l'emprise)." },
  { id: "coque", libelle: "Coque", aide: "Sélectionnez un solide exact ; épaisseur de paroi dans les paramètres, dessus ouvert ou non." },
  { id: "surface", libelle: "Surface (NURBS)", aide: "Sélectionnez une esquisse fermée à quatre sommets : grille de contrôle 3 × 3 (centre relevé de la hauteur donnée), surface B-spline épaissie de l'épaisseur donnée." },
  { id: "patch", libelle: "Patch", aide: "Sélectionnez une esquisse fermée : face non plane tendue sur son contour (un sommet sur deux relevé de la hauteur donnée), épaissie de l'épaisseur donnée." },
  { id: "conge", libelle: "Congé", aide: "Sélectionnez un solide exact ; rayon de congé dans les paramètres, appliqué à toutes ses arêtes (refusé s'il est trop grand pour le solide)." },
];

export interface OperationConstruite { entrees: OperationExacte; sources: string[]; libelle: string; niveauId: string; type: TypeOperationExacte }
export type ResultatConstruction = { ok: true; operation: OperationConstruite } | { ok: false; message: string };

const nb = (p: Record<string, unknown>, cle: string, defaut: number): number => { const v = p[cle]; return typeof v === "number" && Number.isFinite(v) ? v : defaut; };
const altitude = (etat: ModeleAtelier, niveauId: string | null) => (niveauId ? (etat.niveaux[niveauId]?.elevation ?? 0) : 0);
const p2 = (q: { x: number; y: number }): Point2 => ({ x: q.x, y: q.y });

/** Opérande exacte d'un objet : brep posé d'un solide exact, ou extrusion du contour d'un objet paramétrique (R15). */
export function operandeDe(etat: ModeleAtelier, o: OccurrenceQuelconque): OperandeExacte | null {
  const z = altitude(etat, o.niveauId);
  switch (o.classe) {
    case "solide-exact":
      return { brep: o.params.brep, pose: { x: o.params.position.x, y: o.params.position.y, angleDeg: o.params.angle.value } };
    case "mur": {
      const e = etendueMur(etat, o);
      if (!e) return null;
      const f = facesMur(o.params.a, o.params.b, o.params.epaisseur.value, o.params.alignement);
      return { extrusion: { profil: [p2(f.gauche[0]), p2(f.gauche[1]), p2(f.droite[1]), p2(f.droite[0])], z0: e[0] - z, hauteur: e[1] - e[0] } };
    }
    case "dalle": {
      const e = etendueDalle(o.params);
      return { extrusion: { profil: o.params.contour.map(p2), trous: o.params.trous.map((t) => t.map(p2)), z0: e.bas, hauteur: e.haut - e.bas } };
    }
    case "poteau": {
      const h = o.params.hauteur?.value;
      const c = contoursArchitecture("poteau", o.params as unknown as Record<string, unknown>);
      return h && c ? { extrusion: { profil: c.contour.map(p2), z0: 0, hauteur: h } } : null;
    }
    case "solide": {
      const h = o.params.hauteur?.value;
      return h && o.params.ferme && !o.params.profilVertical ? { extrusion: { profil: o.params.contour.map(p2), trous: o.params.trous.map((t) => t.map(p2)), z0: o.params.decalageBase.value, hauteur: h } } : null;
    }
    default:
      return null;
  }
}

const estLigne = (o: OccurrenceQuelconque) => o.classe === "esquisse" && (o.params.forme === "ligne" || o.params.forme === "construction") && o.params.points.length === 2;
const estTrajet = (o: OccurrenceQuelconque) => o.classe === "esquisse" && (o.params.forme === "ligne" || o.params.forme === "polyligne") && !o.params.ferme && o.params.points.length >= 2;
const nomDe = (o: OccurrenceQuelconque) => (typeof (o.params as { nom?: unknown }).nom === "string" && (o.params as { nom?: string }).nom) || o.id;

export function construireOperation(etat: ModeleAtelier, type: TypeOperationExacte, selection: readonly string[], params: Record<string, unknown>): ResultatConstruction {
  const sel = selection.map((id) => etat.objets[id]).filter((o): o is OccurrenceQuelconque => !!o);
  const refus = (message: string): ResultatConstruction => ({ ok: false, message });
  const niveauDe = (o: OccurrenceQuelconque | undefined) => o?.niveauId ?? null;
  switch (type) {
    case "revolution": {
      const profilO = sel.find((o) => !!contourEsquisse(etat, o.id));
      const axeO = sel.find((o) => estLigne(o));
      if (!profilO || !axeO) return refus("Révolution : sélectionnez une esquisse fermée (profil) et une ligne d'esquisse (axe).");
      const niveauId = niveauDe(profilO);
      if (!niveauId) return refus("Révolution : le profil doit être sur un niveau.");
      const [a, b] = (axeO as { params: { points: Point2[] } }).params.points;
      const angleDeg = nb(params, "angleRevolution", 360);
      return { ok: true, operation: { type, niveauId, sources: [profilO.id, axeO.id], libelle: `Révolution ${angleDeg}° de ${nomDe(profilO)}`, entrees: { type: "revolution", profil: contourEsquisse(etat, profilO.id)!.map(p2), axe: { a: p2(a!), b: p2(b!) }, angleDeg, z0: 0 } } };
    }
    case "balayage": {
      const profilO = sel.find((o) => !!contourEsquisse(etat, o.id));
      const trajetO = sel.find((o) => estTrajet(o) && o.id !== profilO?.id);
      if (!profilO || !trajetO) return refus("Balayage : sélectionnez une esquisse fermée (profil) et une ligne ou polyligne ouverte (trajet).");
      const niveauId = niveauDe(profilO);
      if (!niveauId) return refus("Balayage : le profil doit être sur un niveau.");
      const z = nb(params, "hauteurExacte", 0);
      const q = (trajetO as { params: { points: Point2[]; renflements?: number[] } }).params;
      const pts = (q.renflements ? pointsPolyligne(q.points, false, q.renflements) : q.points).map((p) => ({ x: p.x, y: p.y, z }));
      // Profil placé perpendiculairement au premier segment, centré sur son centre de gravité : x du profil → normale, y → vertical.
      const contour = contourEsquisse(etat, profilO.id)!;
      const cx = contour.reduce((s, p) => s + p.x, 0) / contour.length, cy = contour.reduce((s, p) => s + p.y, 0) / contour.length;
      const u = { x: pts[1]!.x - pts[0]!.x, y: pts[1]!.y - pts[0]!.y };
      const L = Math.hypot(u.x, u.y) || 1;
      const n = { x: -u.y / L, y: u.x / L };
      const profil: Point3[] = contour.map((p) => ({ x: pts[0]!.x + (p.x - cx) * n.x, y: pts[0]!.y + (p.x - cx) * n.y, z: z + (p.y - cy) }));
      return { ok: true, operation: { type, niveauId, sources: [profilO.id, trajetO.id], libelle: `Balayage de ${nomDe(profilO)} le long de ${nomDe(trajetO)}`, entrees: { type: "balayage", profil, trajet: pts } } };
    }
    case "lissage": {
      const fermes = sel.filter((o) => !!contourEsquisse(etat, o.id));
      if (fermes.length < 2) return refus("Lissage : sélectionnez deux esquisses fermées (la première au niveau, la seconde à la hauteur donnée).");
      const h = nb(params, "hauteurExacte", 0);
      if (!(h > 0)) return refus("Lissage : renseignez la hauteur du second profil (> 0).");
      const niveauId = niveauDe(fermes[0]);
      if (!niveauId) return refus("Lissage : les profils doivent être sur un niveau.");
      const profils = fermes.slice(0, 2).map((o, i) => contourEsquisse(etat, o.id)!.map((p) => ({ x: p.x, y: p.y, z: i === 0 ? 0 : h })));
      return { ok: true, operation: { type, niveauId, sources: fermes.slice(0, 2).map((o) => o.id), libelle: `Lissage ${nomDe(fermes[0]!)} → ${nomDe(fermes[1]!)}`, entrees: { type: "lissage", profils, regle: params["lissageRegle"] === true } } };
    }
    case "booleen": {
      if (sel.length !== 2) return refus("Booléen exact : sélectionnez exactement deux objets (solides exacts, murs, dalles, poteaux, solides fermés).");
      const [oa, ob] = sel as [OccurrenceQuelconque, OccurrenceQuelconque];
      const a = operandeDe(etat, oa), b = operandeDe(etat, ob);
      if (!a || !b) return refus(`Booléen exact : ${!a ? nomDe(oa) : nomDe(ob)} n'a pas de volume exploitable (hauteur non renseignée, profil vertical ou classe sans volume).`);
      if (oa.niveauId !== ob.niveauId) return refus("Booléen exact : les deux objets doivent être sur le même niveau.");
      const niveauId = niveauDe(oa);
      if (!niveauId) return refus("Booléen exact : les objets doivent être sur un niveau.");
      const op = params["booleenExact"] === "union" || params["booleenExact"] === "intersection" ? (params["booleenExact"] as "union" | "intersection") : "soustraction";
      const lib = op === "union" ? "Union" : op === "intersection" ? "Intersection" : "Soustraction";
      return { ok: true, operation: { type, niveauId, sources: [oa.id, ob.id], libelle: `${lib} exacte ${nomDe(oa)} / ${nomDe(ob)}`, entrees: { type: "booleen", op, a, b } } };
    }
    case "surface": {
      const profilO = sel.find((o) => (contourEsquisse(etat, o.id)?.length ?? 0) === 4);
      if (!profilO) return refus("Surface : sélectionnez une esquisse fermée à quatre sommets (la grille de contrôle en est déduite).");
      const niveauId = niveauDe(profilO);
      if (!niveauId) return refus("Surface : l'esquisse doit être sur un niveau.");
      const epaisseur = nb(params, "epaisseurExacte", 0);
      if (!(epaisseur > 0)) return refus("Surface : renseignez l'épaisseur (> 0).");
      const h = nb(params, "hauteurExacte", 0);
      const [p0, p1, p2x, p3] = contourEsquisse(etat, profilO.id)! as unknown as [Point2, Point2, Point2, Point2];
      // Grille 3 × 3 bilinéaire sur le quadrilatère (lignes p0→p1, p3→p2), centre relevé de h : surface bombée déclarée.
      const lerp = (a: Point2, b: Point2, t: number) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      const controle: Point3[] = [];
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { const u = lerp(p0, p1, j / 2), v = lerp(p3, p2x, j / 2), q = lerp(u, v, i / 2); controle.push({ x: q.x, y: q.y, z: i === 1 && j === 1 ? h : 0 }); }
      return { ok: true, operation: { type, niveauId, sources: [profilO.id], libelle: `Surface ${nomDe(profilO)} (flèche ${h} m, e ${epaisseur} m)`, entrees: { type: "surface", controle, lignes: 3, colonnes: 3, epaisseur } } };
    }
    case "patch": {
      const profilO = sel.find((o) => (contourEsquisse(etat, o.id)?.length ?? 0) >= 3);
      if (!profilO) return refus("Patch : sélectionnez une esquisse fermée (son contour, un sommet sur deux relevé, porte la face).");
      const niveauId = niveauDe(profilO);
      if (!niveauId) return refus("Patch : l'esquisse doit être sur un niveau.");
      const epaisseur = nb(params, "epaisseurExacte", 0);
      if (!(epaisseur > 0)) return refus("Patch : renseignez l'épaisseur (> 0).");
      const h = nb(params, "hauteurExacte", 0);
      const contour: Point3[] = contourEsquisse(etat, profilO.id)!.map((p, i) => ({ x: p.x, y: p.y, z: i % 2 === 1 ? h : 0 }));
      return { ok: true, operation: { type, niveauId, sources: [profilO.id], libelle: `Patch ${nomDe(profilO)} (relief ${h} m, e ${epaisseur} m)`, entrees: { type: "patch", contour, epaisseur } } };
    }
    case "conge": {
      const o = sel.find((x) => x.classe === "solide-exact");
      if (!o || o.classe !== "solide-exact") return refus("Congé : sélectionnez un solide exact.");
      const niveauId = niveauDe(o);
      if (!niveauId) return refus("Le solide exact doit être sur un niveau.");
      const rayon = nb(params, "rayonExacte", 0);
      if (!(rayon > 0)) return refus("Congé : renseignez le rayon (> 0).");
      return { ok: true, operation: { type, niveauId, sources: [o.id], libelle: `Congé r ${rayon} m de ${nomDe(o)}`, entrees: { type: "conge", solide: { brep: o.params.brep, pose: { x: o.params.position.x, y: o.params.position.y, angleDeg: o.params.angle.value } }, rayon } } };
    }
    case "trou":
    case "coque": {
      const o = sel.find((x) => x.classe === "solide-exact");
      if (!o || o.classe !== "solide-exact") return refus(`${type === "trou" ? "Trou" : "Coque"} : sélectionnez un solide exact.`);
      const niveauId = niveauDe(o);
      if (!niveauId) return refus("Le solide exact doit être sur un niveau.");
      const solide = { brep: o.params.brep, pose: { x: o.params.position.x, y: o.params.position.y, angleDeg: o.params.angle.value } };
      if (type === "coque") {
        const epaisseur = nb(params, "epaisseurExacte", 0);
        if (!(epaisseur > 0)) return refus("Coque : renseignez l'épaisseur de paroi (> 0).");
        return { ok: true, operation: { type, niveauId, sources: [o.id], libelle: `Coque ${epaisseur} m de ${nomDe(o)}`, entrees: { type: "coque", solide, epaisseur, ouvrirDessus: params["ouvrirDessusExacte"] === true } } };
      }
      const diametre = nb(params, "diametreExacte", 0);
      if (!(diametre > 0)) return refus("Trou : renseignez le diamètre (> 0).");
      const profondeur = nb(params, "profondeurExacte", 0);
      const e = o.params.emprise;
      const cx = e.reduce((s, p) => s + p.x, 0) / (e.length || 1), cy = e.reduce((s, p) => s + p.y, 0) / (e.length || 1);
      let zmax = -Infinity;
      for (let i = 2; i < o.params.maillage.positions.length; i += 3) zmax = Math.max(zmax, o.params.maillage.positions[i]!);
      const centre = { x: nb(params, "xTrou", cx), y: nb(params, "yTrou", cy), z: Number.isFinite(zmax) ? zmax : 0 };
      return { ok: true, operation: { type, niveauId, sources: [o.id], libelle: `Trou Ø ${diametre} m dans ${nomDe(o)}`, entrees: { type: "trou", solide, centre, direction: { x: 0, y: 0, z: -1 }, diametre, profondeur: profondeur > 0 ? profondeur : null } } };
    }
  }
}
