/**
 * Connectivité de réseau (P2-5, cahier P2 §4 « graphe de connexions mep ») — pur. Les ports sont une lecture dérivée
 * des objets (segment : extrémités ; raccord et équipement : ports déclarés, tournés de l'angle ; vanne : faces) ; une
 * connexion est une relation « connecte » entre deux ports. La compatibilité se juge sans table de valeurs : même
 * système, même section (1 mm), fluides déclarés égaux, sens non contradictoires, ports coïncidents (5 mm).
 */
import type { ModeleAtelier, Occurrence, OccurrenceQuelconque, Point3Reseau, Relation, SectionReseau, SensPort, SystemeReseau } from "../../modele.js";
import { designationReseau, sectionsEgales } from "./sections.js";
import { repereEquipement, repereVanne } from "./geometrie.js";

export const TOLERANCE_PORT = 0.005;
export const CLASSES_RESEAU = ["segment-reseau", "raccord-reseau", "vanne", "equipement-reseau"] as const;
export type ClasseReseau = (typeof CLASSES_RESEAU)[number];

export interface PortAbsolu {
  objetId: string;
  classe: ClasseReseau;
  id: string;
  position: Point3Reseau;
  sens: SensPort;
  section: SectionReseau;
  systeme: SystemeReseau;
  fluide: string | null;
}

export const estReseau = (o: OccurrenceQuelconque | undefined): o is Occurrence<"segment-reseau"> | Occurrence<"raccord-reseau"> | Occurrence<"vanne"> | Occurrence<"equipement-reseau"> => !!o && (CLASSES_RESEAU as readonly string[]).includes(o.classe);

/** Ports d'un objet de réseau, en coordonnées du niveau (z relatif), dans l'ordre de déclaration. */
export function portsDe(o: OccurrenceQuelconque): PortAbsolu[] {
  switch (o.classe) {
    case "segment-reseau": {
      const p = o.params;
      const s0 = p.sommets[0]!, s1 = p.sommets[p.sommets.length - 1]!;
      const sensA: SensPort = p.sens === "a-vers-b" ? "entree" : p.sens === "b-vers-a" ? "sortie" : "indifferent";
      const sensB: SensPort = p.sens === "a-vers-b" ? "sortie" : p.sens === "b-vers-a" ? "entree" : "indifferent";
      return [
        { objetId: o.id, classe: "segment-reseau", id: "a", position: { ...s0 }, sens: sensA, section: p.section, systeme: p.systeme, fluide: p.fluide },
        { objetId: o.id, classe: "segment-reseau", id: "b", position: { ...s1 }, sens: sensB, section: p.section, systeme: p.systeme, fluide: p.fluide },
      ];
    }
    case "raccord-reseau": {
      const p = o.params;
      const r = (p.angle.value * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
      return p.ports.map((port) => ({ objetId: o.id, classe: "raccord-reseau" as const, id: port.id, position: { x: p.position.x + port.dx * c - port.dy * s, y: p.position.y + port.dx * s + port.dy * c, z: p.z + port.dz }, sens: port.sens, section: port.section ?? p.section, systeme: port.systeme ?? p.systeme, fluide: port.fluide ?? p.fluide }));
    }
    case "vanne": {
      const p = o.params;
      const { u, n } = repereVanne(p);
      const L = p.longueur.value / 2;
      const base = { objetId: o.id, classe: "vanne" as const, section: p.section, systeme: "tuyau" as const, fluide: p.fluide };
      const antiRetour = p.type === "anti-retour";
      const ports: PortAbsolu[] = [
        { ...base, id: "1", position: { x: p.position.x - u[0] * L, y: p.position.y - u[1] * L, z: p.z }, sens: antiRetour ? "entree" : "indifferent" },
        { ...base, id: "2", position: { x: p.position.x + u[0] * L, y: p.position.y + u[1] * L, z: p.z }, sens: antiRetour ? "sortie" : "indifferent" },
      ];
      if (p.type === "trois-voies") ports.push({ ...base, id: "3", position: { x: p.position.x + n[0] * L, y: p.position.y + n[1] * L, z: p.z }, sens: "indifferent" });
      return ports;
    }
    case "equipement-reseau": {
      const p = o.params;
      const { u, n } = repereEquipement(p);
      return p.ports.map((port) => ({ objetId: o.id, classe: "equipement-reseau" as const, id: port.id, position: { x: p.position.x + u[0] * port.dx + n[0] * port.dy, y: p.position.y + u[1] * port.dx + n[1] * port.dy, z: p.z + port.dz }, sens: port.sens, section: port.section ?? { forme: "circulaire", diametre: { value: 0, unit: "m" }, epaisseur: null }, systeme: port.systeme, fluide: port.fluide }));
    }
    default:
      return [];
  }
}

export function portDe(etat: ModeleAtelier, objetId: string, portId: string): PortAbsolu | null {
  const o = etat.objets[objetId];
  if (!o) return null;
  return portsDe(o).find((p) => p.id === portId) ?? null;
}

export const estConnexion = (r: Relation): boolean => r.kind === "connecte";
export const portsConnexion = (r: Relation): { a: { objetId: string; port: string }; b: { objetId: string; port: string } } => ({ a: { objetId: r.sourceId, port: String(r.params["portA"] ?? "") }, b: { objetId: r.targetId, port: String(r.params["portB"] ?? "") } });

/** Connexions du modèle, triées par identifiant (ordre déterministe). */
export function connexions(etat: ModeleAtelier): Relation[] {
  return Object.values(etat.relations).filter(estConnexion).sort((a, b) => (a.id < b.id ? -1 : 1));
}

/** Connexion qui tient un port donné, s'il y en a une. */
export function connexionDuPort(etat: ModeleAtelier, objetId: string, portId: string): Relation | null {
  return connexions(etat).find((r) => (r.sourceId === objetId && r.params["portA"] === portId) || (r.targetId === objetId && r.params["portB"] === portId)) ?? null;
}

/** Motifs d'incompatibilité de deux ports (vide : compatibles). Sans table de valeurs : tout vient des objets. */
export function incompatibilites(a: PortAbsolu, b: PortAbsolu): string[] {
  const motifs: string[] = [];
  if (a.objetId === b.objetId) motifs.push("un objet ne se connecte pas à lui-même");
  if (a.systeme !== b.systeme) motifs.push(`systèmes différents (${a.systeme} / ${b.systeme})`);
  if (!sectionsEgales(a.section, b.section)) motifs.push(`sections différentes (${designationReseau(a.section)} / ${designationReseau(b.section)})`);
  if (a.fluide && b.fluide && a.fluide.trim().toLowerCase() !== b.fluide.trim().toLowerCase()) motifs.push(`fluides différents (${a.fluide} / ${b.fluide})`);
  if (a.sens !== "indifferent" && a.sens === b.sens) motifs.push(`sens contradictoires (deux ${a.sens === "entree" ? "entrées" : "sorties"})`);
  const d = Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y, a.position.z - b.position.z);
  if (d > TOLERANCE_PORT) motifs.push(`ports distants de ${Math.round(d * 1000)} mm`);
  return motifs;
}

export interface EtatConnexion {
  relation: Relation;
  a: PortAbsolu | null;
  b: PortAbsolu | null;
  motifs: string[];
}

/** État de chaque connexion : ports retrouvés et motifs d'incompatibilité actuels (objets déplacés ou modifiés). */
export function etatConnexions(etat: ModeleAtelier): EtatConnexion[] {
  return connexions(etat).map((relation) => {
    const { a, b } = portsConnexion(relation);
    const pa = portDe(etat, a.objetId, a.port), pb = portDe(etat, b.objetId, b.port);
    const motifs = !pa || !pb ? [`port ${!pa ? `${a.objetId}:${a.port}` : `${b.objetId}:${b.port}`} introuvable`] : incompatibilites(pa, pb);
    return { relation, a: pa, b: pb, motifs };
  });
}

/** Ports non connectés du modèle (lecture dérivée : fiches, nomenclature, P&ID), ordre déterministe. */
export function portsLibres(etat: ModeleAtelier, filtre?: (o: OccurrenceQuelconque) => boolean): PortAbsolu[] {
  const out: PortAbsolu[] = [];
  for (const o of (Object.values(etat.objets) as OccurrenceQuelconque[]).sort((x, y) => (x.id < y.id ? -1 : 1))) {
    if (!estReseau(o) || (filtre && !filtre(o))) continue;
    for (const p of portsDe(o)) if (!connexionDuPort(etat, o.id, p.id)) out.push(p);
  }
  return out;
}

/** Composantes connexes du graphe objet — connexion — objet : un réseau par composante, nommé par son plus petit identifiant. */
export function reseauxConnexes(etat: ModeleAtelier): { id: string; objets: string[]; connexions: string[]; systemes: SystemeReseau[]; fluides: string[] }[] {
  const parent = new Map<string, string>();
  const racine = (x: string): string => { let r = x; while (parent.get(r) !== undefined && parent.get(r) !== r) r = parent.get(r)!; parent.set(x, r); return r; };
  const unir = (a: string, b: string) => { const ra = racine(a), rb = racine(b); if (ra !== rb) parent.set(ra < rb ? rb : ra, ra < rb ? ra : rb); };
  const objets = (Object.values(etat.objets) as OccurrenceQuelconque[]).filter(estReseau).sort((x, y) => (x.id < y.id ? -1 : 1));
  for (const o of objets) parent.set(o.id, o.id);
  const cx = connexions(etat).filter((r) => parent.has(r.sourceId) && parent.has(r.targetId));
  for (const r of cx) unir(r.sourceId, r.targetId);
  const groupes = new Map<string, { id: string; objets: string[]; connexions: string[]; systemes: SystemeReseau[]; fluides: string[] }>();
  for (const o of objets) {
    const r = racine(o.id);
    const g = groupes.get(r) ?? { id: `reseau:${r}`, objets: [], connexions: [], systemes: [], fluides: [] };
    g.objets.push(o.id);
    for (const p of portsDe(o)) {
      if (!g.systemes.includes(p.systeme)) g.systemes.push(p.systeme);
      if (p.fluide && !g.fluides.includes(p.fluide)) g.fluides.push(p.fluide);
    }
    groupes.set(r, g);
  }
  for (const r of cx) groupes.get(racine(r.sourceId))!.connexions.push(r.id);
  return [...groupes.values()].map((g) => ({ ...g, systemes: g.systemes.sort(), fluides: g.fluides.sort() })).sort((a, b) => (a.id < b.id ? -1 : 1));
}
