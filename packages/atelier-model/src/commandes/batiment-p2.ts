/**
 * Commandes du bâtiment P2 et des surfaces libres (P2-6) : surfaces libres (création, conversion explicite depuis un
 * objet maillé — DA-07-20 —, déplacement d'un sommet de contrôle — édition directe —, niveau de subdivision), terrain
 * (ajout de points). Les classes à paramètres simples passent par les triplets ordinaires.
 */
import type { ModeleAtelier, Occurrence, OccurrenceQuelconque } from "../modele.js";
import { ErreurCommande, lire, type Reducteur } from "./base.js";
import { creerOccurrence, modifierOccurrence, supprimerOccurrence } from "./objets.js";
import { maillageObjet } from "../projection/maillage.js";
import { controleDepuisMaillage } from "../batiment-p2.js";

const estSurface = (o: OccurrenceQuelconque | undefined): o is Occurrence<"surface-libre"> => !!o && o.classe === "surface-libre";

export const reducteursBatimentP2: Record<string, Reducteur> = {
  "surfaceLibre.creer": (etat, p, ctx) => creerOccurrence(etat, p, ctx, "surface-libre"),
  "surfaceLibre.modifier": (etat, p, ctx) => modifierOccurrence(etat, p, ctx, "surface-libre"),
  "surfaceLibre.supprimer": (etat, p, ctx) => supprimerOccurrence(etat, p, ctx, "surface-libre"),
  /** Conversion métier explicite (DA-07-20, DA-03-11) : le maillage d'un objet devient le maillage de contrôle d'une surface libre ; l'objet d'origine reste (ou est retiré sur demande). */
  "surfaceLibre.depuisObjet": (etat, p, ctx) => {
    const sourceId = lire.objet(etat, p, "sourceId");
    const src = etat.objets[sourceId]!;
    const m = maillageObjet(etat, src);
    if (!m || !m.indices.length) throw new ErreurCommande("precondition", "sourceId", `${sourceId} (${src.classe}) n'a pas de maillage convertible`);
    const z = src.niveauId ? (etat.niveaux[src.niveauId]?.elevation ?? 0) : 0;
    const { sommets, faces } = controleDepuisMaillage({ positions: m.positions.map((v, i) => (i % 3 === 2 ? v - z : v)), indices: m.indices });
    if (sommets.length > 50000) throw new ErreurCommande("precondition", "sourceId", `${sourceId} : maillage trop fin pour une surface libre (${sommets.length} sommets)`);
    const niveaux = lire.nombre(p, "niveaux", { optionnel: true, entier: true, min: 0, max: 4 }) ?? 0;
    return creerOccurrence(etat, { id: p["id"] ?? null, niveauId: src.niveauId, calqueId: src.calqueId, params: { nom: lire.chaineOuNull(p, "nom") ?? `${(src.params as { nom?: string | null }).nom ?? src.id} (surface libre)`, sommets, faces, niveaux, origine: { classe: src.classe, id: src.id }, ferme: true } }, ctx, "surface-libre");
  },
  /** Édition directe (morphing) : un sommet de contrôle déplacé de (dx, dy, dz) ; la surface subdivisée suit. */
  "surfaceLibre.deplacerSommet": (etat, p, ctx) => {
    const id = lire.objet(etat, p, "id");
    const s = etat.objets[id];
    if (!estSurface(s)) throw new ErreurCommande("precondition", "id", `${id} n'est pas une surface libre`);
    const index = lire.nombre(p, "index", { entier: true, min: 0, max: s.params.sommets.length - 1 })!;
    const d = (k: string) => lire.nombre(p, k, { optionnel: true }) ?? 0;
    const q = s.params.sommets[index]!;
    const sommets = s.params.sommets.map((v, i) => (i === index ? { x: q.x + d("dx"), y: q.y + d("dy"), z: q.z + d("dz") } : v));
    return modifierOccurrence(etat, { id, params: { sommets } }, ctx, "surface-libre");
  },
  "surfaceLibre.subdiviser": (etat, p, ctx) => {
    const id = lire.objet(etat, p, "id");
    if (!estSurface(etat.objets[id])) throw new ErreurCommande("precondition", "id", `${id} n'est pas une surface libre`);
    return modifierOccurrence(etat, { id, params: { niveaux: lire.nombre(p, "niveaux", { entier: true, min: 0, max: 4 })! } }, ctx, "surface-libre");
  },
  /** Terrain : points relevés ajoutés au semis (jamais interpolés). */
  "terrain.ajouterPoints": (etat, p, ctx) => {
    const id = lire.objet(etat, p, "id");
    const t = etat.objets[id];
    if (!t || t.classe !== "terrain") throw new ErreurCommande("precondition", "id", `${id} n'est pas un terrain`);
    const v = p["points"];
    if (!Array.isArray(v) || !v.length) throw new ErreurCommande("invalide", "points", "liste de points { x, y, z } requise");
    return modifierOccurrence(etat, { id, params: { points: [...t.params.points, ...(v as { x: number; y: number; z: number }[])] } }, ctx, "terrain");
  },
};

export type { ModeleAtelier };
