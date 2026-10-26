import type { StudioCommand, StudioDocument } from "../composition/types.js";
import { studioIdsOperandes } from "../objets-3d/exacts.js";

/**
 * Événement d'effets d'une commande acceptée (EX-010, IF-011) : ce que le lot a réellement changé dans le document
 * canonique, calculé par le serveur entre la tête (`avant`) et le document produit (`apres`), jamais annoncé par le
 * client. Il identifie :
 * - les objets créés, modifiés et supprimés (identifiants, toutes familles du document) ;
 * - les références et contraintes modifiées : relations du document (cote → objet lié, ouverture → mur hôte, prisme →
 *   profil source, solide exact → opérandes, propriété → cible, apparence → objet visé) ajoutées ou retirées, et
 *   contraintes dont l'état a changé (cote passée « à résoudre » ou résolue) ;
 * - les domaines dérivés invalidés (`STUDIO_DOMAINES_DERIVES`) : tout ce qui est calculé depuis le document et qui ne
 *   vaut plus pour la révision de sortie (plan 2D, maillage 3D, métré, exports, publications et feuilles) ;
 * - la révision de sortie et l'origine (source de l'écriture, auteur, requête, outils employés).
 *
 * Une suppression d'hôte en cascade (mur et ses ouvertures) décrit donc chaque dépendant supprimé et chaque relation
 * rompue, et invalide les publications : aucun document dérivé ne reste « frais » en silence. Pur et déterministe.
 */

/** Domaines de contenus dérivés d'une révision (EX-010, EX-016) ; l'ordre est celui de l'affichage. */
export const STUDIO_DOMAINES_DERIVES = Object.freeze(["plan-2d", "maillage-3d", "quantites", "exports", "publications"] as const);
export type StudioDomaineDerive = (typeof STUDIO_DOMAINES_DERIVES)[number];

export type StudioNatureRelation = "cote-liee" | "hote" | "source-profil" | "operande" | "propriete" | "apparence";
export interface StudioRelation { de: string; vers: string; nature: StudioNatureRelation }
export interface StudioContrainteModifiee { id: string; contrainte: "a-resoudre"; avant: boolean | null; apres: boolean | null }

export interface StudioOrigineEffets {
  source: string;
  auteurId: string;
  requestId: string | null;
  /** Outils des commandes du lot, dans l'ordre, sans doublon. */
  outils: string[];
}

export interface StudioEffetsCommande {
  schema: "studio-effets/1";
  crees: string[];
  modifies: string[];
  supprimes: string[];
  references: { ajoutees: StudioRelation[]; retirees: StudioRelation[] };
  contraintes: StudioContrainteModifiee[];
  domainesInvalides: StudioDomaineDerive[];
  revisionBase: string | null;
  revisionSortie: string;
  origine: StudioOrigineEffets;
}

type Famille = "objects" | "layers" | "dimensions" | "annotations" | "solides" | "exacts" | "surfaces" | "cotesFaces" | "architecture" | "proprietes" | "scenes" | "nonNatifs";
const FAMILLES: readonly Famille[] = ["objects", "layers", "dimensions", "annotations", "solides", "exacts", "surfaces", "cotesFaces", "architecture", "proprietes", "scenes", "nonNatifs"];

/** Domaines lus par chaque famille d'éléments (une modification les invalide). Les publications lisent tout. */
const LECTEURS: Record<Famille, readonly StudioDomaineDerive[]> = {
  objects: ["plan-2d", "maillage-3d", "quantites", "exports", "publications"],
  layers: ["plan-2d", "maillage-3d", "quantites", "exports", "publications"],
  dimensions: ["plan-2d", "exports", "publications"],
  annotations: ["plan-2d", "exports", "publications"],
  solides: ["maillage-3d", "quantites", "exports", "publications"],
  exacts: ["maillage-3d", "quantites", "exports", "publications"],
  // Surfaces libres (X.1-05) : vue 3D, exports (OBJ ; comptées ailleurs) et publications ; aucun métré.
  surfaces: ["maillage-3d", "exports", "publications"],
  // Cotes de faces 3D (lot G2) : lues par la vue 3D et les publications (aucun format ne les écrit).
  cotesFaces: ["maillage-3d", "publications"],
  architecture: ["plan-2d", "maillage-3d", "quantites", "exports", "publications"],
  proprietes: ["quantites", "exports", "publications"],
  // Réglages de vue : seule la vue 3D les lit (jamais la géométrie, le métré ni les exports) ; une feuille publiée les cite.
  scenes: ["maillage-3d", "publications"],
  nonNatifs: ["plan-2d", "publications"],
};

const stable = (v: unknown): string => {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).sort().filter((k) => o[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stable(o[k])}`).join(",")}}`;
};

function cle(famille: Famille, item: unknown): string {
  const o = item as Record<string, unknown>;
  if (famille === "proprietes") return `${String(o["cibleId"])}#${String(o["nom"])}`;
  return String(o["id"]);
}

function inventaire(doc: StudioDocument): Map<string, { famille: Famille; empreinte: string }> {
  const out = new Map<string, { famille: Famille; empreinte: string }>();
  const d = doc as unknown as Record<string, unknown>;
  for (const f of FAMILLES) for (const item of (d[f] as unknown[] | undefined) ?? []) out.set(`${f}:${cle(f, item)}`, { famille: f, empreinte: stable(item) });
  return out;
}

/** Relations du document (références entre éléments), triées et sans doublon. */
export function studioRelations(doc: StudioDocument): StudioRelation[] {
  const out: StudioRelation[] = [];
  for (const c of doc.dimensions ?? []) for (const l of [c.links.start, c.links.end]) if (l) out.push({ de: c.id, vers: l.objectId, nature: "cote-liee" });
  for (const a of doc.annotations ?? []) {
    if (a.type === "angular-dimension") for (const l of [a.links.first, a.links.second]) if (l) out.push({ de: a.id, vers: l.objectId, nature: "cote-liee" });
  }
  for (const a of doc.architecture ?? []) if (a.type === "opening") out.push({ de: a.id, vers: a.hostId, nature: "hote" });
  for (const c of doc.cotesFaces ?? []) out.push({ de: c.id, vers: c.solidId, nature: "cote-liee" });
  for (const s of doc.solides ?? []) if (s.type === "prism" && s.source) out.push({ de: s.id, vers: s.source.objectId, nature: "source-profil" });
  for (const s of doc.exacts ?? []) for (const id of studioIdsOperandes(s)) out.push({ de: s.id, vers: id, nature: "operande" });
  for (const p of doc.proprietes ?? []) out.push({ de: `${p.cibleId}#${p.nom}`, vers: p.cibleId, nature: "propriete" });
  for (const s of doc.scenes ?? []) if (s.type === "appearance" && s.target.kind === "object") out.push({ de: s.id, vers: s.target.id, nature: "apparence" });
  const vus = new Set<string>();
  return out.filter((r) => { const k = `${r.nature}|${r.de}|${r.vers}`; if (vus.has(k)) return false; vus.add(k); return true; })
    .sort((a, b) => (a.de + a.nature + a.vers).localeCompare(b.de + b.nature + b.vers));
}

function aResoudre(doc: StudioDocument): Map<string, boolean> {
  const m = new Map<string, boolean>();
  for (const c of doc.dimensions ?? []) m.set(c.id, c.toResolve);
  for (const a of doc.annotations ?? []) if (a.type === "angular-dimension") m.set(a.id, a.toResolve);
  for (const c of doc.cotesFaces ?? []) m.set(c.id, c.toResolve);
  return m;
}

const idDeCle = (k: string): string => k.slice(k.indexOf(":") + 1);

/**
 * Effets d'un lot accepté : `avant` = tête du serveur, `apres` = document produit par le lot, `commands` = commandes
 * appliquées. Les identifiants sont ceux du document (une propriété est désignée par `cible#nom`).
 */
export function studioEffetsCommande(
  avant: StudioDocument, apres: StudioDocument, commands: readonly StudioCommand[],
  meta: { revisionBase: string | null; revisionSortie: string; source: string; auteurId: string; requestId: string | null },
): StudioEffetsCommande {
  const a = inventaire(avant), b = inventaire(apres);
  const crees: string[] = [], modifies: string[] = [], supprimes: string[] = [];
  const domaines = new Set<StudioDomaineDerive>();
  for (const [k, v] of b) {
    const prev = a.get(k);
    if (!prev) crees.push(idDeCle(k));
    else if (prev.empreinte !== v.empreinte) modifies.push(idDeCle(k));
    else continue;
    for (const d of LECTEURS[v.famille]) domaines.add(d);
  }
  for (const [k, v] of a) if (!b.has(k)) { supprimes.push(idDeCle(k)); for (const d of LECTEURS[v.famille]) domaines.add(d); }
  const ra = studioRelations(avant), rb = studioRelations(apres);
  const k = (r: StudioRelation) => `${r.nature}|${r.de}|${r.vers}`;
  const ka = new Set(ra.map(k)), kb = new Set(rb.map(k));
  const contraintes: StudioContrainteModifiee[] = [];
  const ta = aResoudre(avant), tb = aResoudre(apres);
  for (const id of [...new Set([...ta.keys(), ...tb.keys()])].sort()) {
    const x = ta.get(id) ?? null, y = tb.get(id) ?? null;
    if (x !== null && y !== null && x !== y) contraintes.push({ id, contrainte: "a-resoudre", avant: x, apres: y });
  }
  const tri = (l: string[]) => [...new Set(l)].sort();
  return {
    schema: "studio-effets/1",
    crees: tri(crees), modifies: tri(modifies), supprimes: tri(supprimes),
    references: { ajoutees: rb.filter((r) => !ka.has(k(r))), retirees: ra.filter((r) => !kb.has(k(r))) },
    contraintes,
    domainesInvalides: STUDIO_DOMAINES_DERIVES.filter((d) => domaines.has(d)),
    revisionBase: meta.revisionBase, revisionSortie: meta.revisionSortie,
    origine: { source: meta.source, auteurId: meta.auteurId, requestId: meta.requestId, outils: [...new Set(commands.map((c) => c.toolId))] },
  };
}
