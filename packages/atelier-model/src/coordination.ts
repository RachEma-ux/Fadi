/**
 * Coordination entre ontologies (P2-6, cahier P2 §4, DA-17-14) — pur. Les volumes communs entre corps d'ontologies
 * différentes (réseau × mur, poutre × gaine, pièce × bâtiment…) sont signalés, jamais corrigés ; une réservation
 * accordée qui couvre le volume commun en plan et en altitude l'exempte. Les contrôles de spécification relèvent les
 * objets de réseau qui échappent à une spécification existante ou la contredisent. Aucune valeur n'est inventée.
 */
import type { ModeleAtelier, Occurrence, OccurrenceQuelconque } from "./modele.js";
import { intersectionSegments, pointDansPolygone, type Vec } from "./geometrie.js";
import { corpsDe, familleCorps, interferences, type Interference } from "./interferences.js";
import { CLASSES } from "./ontologie.js";

export interface CollisionOntologies {
  objets: [string, string];
  familles: [string, string];
  niveauId: string | null;
  volume: number;
  /** Réservation accordée qui couvre le volume commun, s'il y en a une. */
  reservationId: string | null;
}

const altitude = (etat: ModeleAtelier, niveauId: string | null) => (niveauId ? (etat.niveaux[niveauId]?.elevation ?? 0) : 0);

/** Les réservations accordées du modèle, avec leur boîte en altitude absolue. */
function reservations(etat: ModeleAtelier): { o: Occurrence<"reservation">; z0: number; z1: number }[] {
  return (Object.values(etat.objets) as OccurrenceQuelconque[]).filter((o): o is Occurrence<"reservation"> => o.classe === "reservation" && o.params.statut === "accordee").map((o) => { const z = altitude(etat, o.niveauId) + o.params.z; return { o, z0: z, z1: z + o.params.hauteur.value }; });
}

/** Sommets de l'emprise commune de deux polygones : sommets intérieurs et intersections de bords. */
function pointsCommuns(a: readonly Vec[], b: readonly Vec[]): Vec[] {
  const out: Vec[] = [...a.filter((p) => pointDansPolygone(p, b)), ...b.filter((p) => pointDansPolygone(p, a))];
  for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) {
    const x = intersectionSegments(a[i]!, a[(i + 1) % a.length]!, b[j]!, b[(j + 1) % b.length]!);
    if (x) out.push(x.point);
  }
  return out;
}

/** Une réservation couvre l'interférence si les deux corps y ont un point de leur emprise commune et si leur tranche d'altitude commune tient dedans. */
function reservationCouvrant(etat: ModeleAtelier, i: Interference): string | null {
  const [a, b] = i.objets.map((id) => etat.objets[id]).map((o) => (o ? corpsDe(etat, o) : []));
  if (!a?.length || !b?.length) return null;
  // Une réservation ne couvre que la paire qu'elle vise (relecture Codex #99) : son hôte déclaré et, s'il est donné, le
  // réseau concerné doivent être les deux objets en collision ; une réservation d'un autre mur voisin n'exempte rien.
  const paire = new Set(i.objets);
  for (const r of reservations(etat)) {
    if (r.o.params.hoteId !== null && !paire.has(r.o.params.hoteId)) continue;
    if (r.o.params.pourId !== null && !paire.has(r.o.params.pourId)) continue;
    const ok = a.some((ca) => b.some((cb) => {
      const z0 = Math.max(ca.z0, cb.z0), z1 = Math.min(ca.z1, cb.z1);
      if (z0 < r.z0 - 1e-6 || z1 > r.z1 + 1e-6) return false;
      // Points de l'emprise commune : sommets de l'un dans l'autre et intersections des bords (un réseau qui traverse un
      // mur n'a aucun sommet dedans) ; tous doivent tomber dans la réservation.
      const dedans = pointsCommuns(ca.contour, cb.contour);
      return dedans.length > 0 && dedans.every((p) => pointDansPolygone(p, r.o.params.contour));
    }));
    if (ok) return r.o.id;
  }
  return null;
}

/** Volumes communs entre objets d'ontologies différentes, réservation couvrante nommée ; les paires du socle entre elles ne sont pas ici. */
export function collisionsOntologies(etat: ModeleAtelier): CollisionOntologies[] {
  const out: CollisionOntologies[] = [];
  for (const i of interferences(etat)) {
    const [p, q] = i.objets.map((id) => etat.objets[id]);
    if (!p || !q) continue;
    const fa = familleCorps(p.classe), fb = familleCorps(q.classe);
    if (fa === fb) continue;
    out.push({ objets: i.objets, familles: [fa, fb], niveauId: i.niveauId, volume: i.volume, reservationId: reservationCouvrant(etat, i) });
  }
  return out;
}

export interface ControleSpecification {
  objetId: string;
  classe: OccurrenceQuelconque["classe"];
  motif: string;
}

/** Contrôles de spécification (DA-17-14) : objets de réseau sans spécification alors qu'une existe pour leur système ; fluide ou matériau contredisant la spécification suivie. */
export function controlesSpecification(etat: ModeleAtelier): ControleSpecification[] {
  const specs = Object.values(etat.definitions).filter((d) => d.classe === "specification");
  const out: ControleSpecification[] = [];
  for (const o of (Object.values(etat.objets) as OccurrenceQuelconque[]).sort((x, y) => (x.id < y.id ? -1 : 1))) {
    if (o.classe !== "segment-reseau" && o.classe !== "raccord-reseau" && o.classe !== "vanne") continue;
    const systeme = o.classe === "vanne" ? "tuyau" : o.params.systeme;
    const suivie = o.params.specificationId ? specs.find((d) => d.id === o.params.specificationId) : undefined;
    if (!suivie) {
      const candidates = specs.filter((d) => d.params["systeme"] === systeme);
      if (candidates.length) out.push({ objetId: o.id, classe: o.classe, motif: `${CLASSES[o.classe].libelle} sans spécification alors que ${candidates.length === 1 ? `« ${candidates[0]!.nom } » existe` : `${candidates.length} spécifications existent`} pour le système ${systeme}` });
      continue;
    }
    const fluide = suivie.params["fluide"], materiau = suivie.params["materiau"];
    if (typeof fluide === "string" && o.params.fluide && o.params.fluide.trim().toLowerCase() !== fluide.trim().toLowerCase()) out.push({ objetId: o.id, classe: o.classe, motif: `fluide « ${o.params.fluide} » contredit la spécification « ${suivie.nom} » (${fluide})` });
    if (typeof materiau === "string" && o.params.materiau && o.params.materiau.trim().toLowerCase() !== materiau.trim().toLowerCase()) out.push({ objetId: o.id, classe: o.classe, motif: `matériau « ${o.params.materiau} » contredit la spécification « ${suivie.nom} » (${materiau})` });
  }
  return out;
}
