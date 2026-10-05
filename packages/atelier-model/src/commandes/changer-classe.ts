/**
 * Changer de classe sur place (D-060, fiche DA-05-12) : `objet.changerClasse` { id, classe, params? } pour les objets
 * définis par un contour fermé — esquisse fermée (polygone, polyligne fermée, rectangle, hachure), dalle, pièce,
 * zone. Le contour (et les trous, entre dalle, pièce et zone) est gardé ; les paramètres propres à la classe
 * d'arrivée sont donnés par la commande (épaisseur d'une dalle, nom d'une pièce ou d'une zone…) et validés comme à
 * la création — rien n'est déduit. L'identifiant, le niveau, le calque, le groupe, la phase et les propriétés sont
 * gardés ; le type (définition propre à une classe) est retiré. Refus : objet lié (cote, relation, contrainte), trous
 * perdus vers une esquisse, même classe, classe non admise.
 */
import { referencesVers, type Contour, type ModeleAtelier, type OccurrenceQuelconque } from "../modele.js";
import { pt, type Point2 } from "../unites.js";
import { effetsVides, ErreurCommande, lire, type ResultatCommande } from "./base.js";
import { validerParams } from "./validation.js";

type Brut = Record<string, unknown>;

export const CLASSES_A_CONTOUR = ["esquisse", "dalle", "piece", "zone"] as const;
type ClasseContour = (typeof CLASSES_A_CONTOUR)[number];

/** Contour fermé d'un objet, ou null s'il n'en a pas. */
export function contourFerme(o: OccurrenceQuelconque): Contour | null {
  if (o.classe === "dalle" || o.classe === "piece" || o.classe === "zone") return { contour: o.params.contour, trous: o.params.trous };
  if (o.classe !== "esquisse") return null;
  const q = o.params;
  if (q.forme === "rectangle" && q.points.length === 2) {
    const [a, b] = q.points as [Point2, Point2];
    return { contour: [pt(a.x, a.y), pt(b.x, a.y), pt(b.x, b.y), pt(a.x, b.y)], trous: [] };
  }
  if ((q.forme === "polygone" || q.forme === "hachure" || (q.forme === "polyligne" && q.ferme) || (q.forme === "rectangle" && q.points.length >= 3)) && q.points.length >= 3) return { contour: q.points, trous: [] };
  return null;
}

export function changerClasse(etat: ModeleAtelier, p: Brut): ResultatCommande {
  const id = lire.objet(etat, p, "id");
  const o = etat.objets[id]!;
  const classe = lire.enumeration(p, "classe", CLASSES_A_CONTOUR) as ClasseContour;
  if (classe === o.classe) throw new ErreurCommande("invalide", "classe", `${id} est déjà de classe ${classe}`);
  if (!(CLASSES_A_CONTOUR as readonly string[]).includes(o.classe)) throw new ErreurCommande("precondition", "id", `${id} (${o.classe}) : changement de classe réservé aux esquisses fermées, dalles, pièces et zones`);
  const calque = o.calqueId ? etat.calques[o.calqueId] : null;
  if (calque?.verrouille) throw new ErreurCommande("precondition", "id", `calque verrouillé : ${calque.nom}`);
  const c = contourFerme(o);
  if (!c) throw new ErreurCommande("precondition", "id", `${id} : esquisse ouverte, aucun contour fermé à garder`);
  if (referencesVers(etat, id).length || Object.values(etat.relations).some((r) => r.sourceId === id || r.targetId === id)) throw new ErreurCommande("precondition", "id", `${id} est lié (cote, relation, contrainte ou programme) : le détacher d'abord`);
  const supp = (p["params"] ?? {}) as Brut;
  if (typeof supp !== "object" || Array.isArray(supp)) throw new ErreurCommande("invalide", "params", "« params » : objet attendu");
  let brut: Brut;
  if (classe === "esquisse") {
    if (c.trous.length) throw new ErreurCommande("precondition", "id", `${id} a des trous : une esquisse ne les garderait pas`);
    brut = { forme: "polygone", points: c.contour, ferme: true, centre: null, rayon: null, angleDebut: null, angleFin: null, motif: null, ...supp };
  } else brut = { ...supp, contour: c.contour, trous: c.trous };
  const params = validerParams(etat, classe, brut);
  const effets = effetsVides();
  effets.modifies.push(id);
  if (o.niveauId) effets.niveauxTouches.push(o.niveauId);
  return { etat: { ...etat, objets: { ...etat.objets, [id]: { ...o, classe, params, definitionId: null } as OccurrenceQuelconque } }, effets };
}
