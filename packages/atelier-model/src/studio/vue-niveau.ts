import { validateStudioDocument, type StudioDocument } from "./document-2d.js";
import type { StudioArchitectureItem } from "./architecture/types.js";

/**
 * Vue par niveau (lot W3-B, X.1-04) : document **dérivé** (jamais enregistré) qui ne garde, parmi les objets rattachables
 * (murs et leurs ouvertures, échelles, poteaux, poutres, dalles, occurrences de composants), que ceux d'un niveau — ou
 * ceux qui n'ont aucun niveau (`STUDIO_SANS_NIVEAU`). Plan et vue 3D l'affichent tel quel ; les commandes continuent de
 * s'appliquer au document entier (mêmes identifiants).
 *
 * La géométrie libre (formes 2D, cotes et annotations libres, solides libres, graphismes) n'appartient à aucun niveau
 * (A.3-09) : elle est gardée par défaut (`libres: "garder"`), ou masquée sur demande (`libres: "masquer"`). Ce qui
 * désignerait un objet retiré de la vue (cote liée à un mur d'un autre niveau, propriété déclarée, apparence d'affichage)
 * est retiré avec lui de la vue : rien n'est modifié dans le document. Pur.
 */

export const STUDIO_SANS_NIVEAU = "\u0000sans-niveau" as const;
export type StudioFiltreNiveau = string | typeof STUDIO_SANS_NIVEAU;

/** Identifiants des objets rattachés au niveau (ouvertures de ses murs comprises), ou sans niveau. */
export function studioMembresNiveau(doc: StudioDocument, filtre: StudioFiltreNiveau): Set<string> {
  const garde = (n: string | undefined) => (filtre === STUDIO_SANS_NIVEAU ? n === undefined : n === filtre);
  const architecture = doc.architecture ?? [];
  const murs = new Map(architecture.filter((x) => x.type === "wall").map((w) => [w.id, w as Extract<StudioArchitectureItem, { type: "wall" }>]));
  const out = new Set<string>();
  for (const x of architecture) {
    if (x.type === "opening") { if (garde(murs.get(x.hostId)?.niveauId)) out.add(x.id); continue; }
    if (garde(x.niveauId)) out.add(x.id);
  }
  for (const o of doc.occurrences ?? []) if (garde(o.niveauId)) out.add(o.id);
  return out;
}

export function studioVueNiveau(document: StudioDocument, filtre: StudioFiltreNiveau | null, options: { libres?: "garder" | "masquer" } = {}): StudioDocument {
  const doc = validateStudioDocument(document);
  if (filtre === null) return doc;
  if (filtre !== STUDIO_SANS_NIVEAU && !(doc.niveaux ?? []).some((n) => n.id === filtre)) throw new RangeError(`niveau inconnu : ${filtre}`);
  const membres = studioMembresNiveau(doc, filtre);
  const masquer = options.libres === "masquer";
  const architecture = (doc.architecture ?? []).filter((x) => membres.has(x.id));
  const occurrences = (doc.occurrences ?? []).filter((o) => membres.has(o.id));
  const objects = masquer ? [] : doc.objects;
  const presents = new Set<string>([...objects.map((o) => o.id), ...architecture.map((a) => a.id), ...occurrences.map((o) => o.id), ...(masquer ? [] : (doc.solides ?? []).map((s) => s.id))]);
  const lien = (l: { objectId: string } | null | undefined) => !l || presents.has(l.objectId);
  // Une cote libre est de la géométrie libre ; une cote liée suit les objets qu'elle désigne.
  const archi = new Set(architecture.map((a) => a.id));
  const surArchitecture = (d: { links: { start: { objectId: string } | null; end: { objectId: string } | null } }) => [d.links.start, d.links.end].some((l) => !!l && archi.has(l.objectId));
  const dimensions = (doc.dimensions ?? []).filter((d) => lien(d.links.start) && lien(d.links.end) && (!masquer || surArchitecture(d)));
  const annotations = masquer ? [] : doc.annotations ?? [];
  const solides = masquer ? [] : doc.solides ?? [];
  const exacts = masquer ? [] : doc.exacts ?? [];
  const cotesFaces = masquer ? [] : doc.cotesFaces ?? [];
  const graphismes = masquer ? [] : doc.graphismes ?? [];
  const proprietes = (doc.proprietes ?? []).filter((p) => presents.has(p.cibleId));
  const scenes = (doc.scenes ?? []).filter((s) => s.type !== "appearance" || s.target.kind !== "object" || presents.has(s.target.id));
  const vue: StudioDocument = {
    id: doc.id, schemaVersion: doc.schemaVersion, units: doc.units, frame: doc.frame, objects,
    ...(doc.layers ? { layers: doc.layers } : {}),
    ...(dimensions.length ? { dimensions } : {}),
    ...(solides.length ? { solides } : {}),
    ...(exacts.length ? { exacts } : {}),
    ...(cotesFaces.length ? { cotesFaces } : {}),
    ...(annotations.length ? { annotations } : {}),
    ...(architecture.length ? { architecture } : {}),
    ...(proprietes.length ? { proprietes } : {}),
    ...(scenes.length ? { scenes } : {}),
    ...(!masquer && doc.nonNatifs?.length ? { nonNatifs: doc.nonNatifs } : {}),
    ...(graphismes.length ? { graphismes } : {}),
    ...(doc.systemeProjet ? { systemeProjet: doc.systemeProjet } : {}),
    ...(!masquer && doc.sources?.length ? { sources: doc.sources } : {}),
    ...(doc.niveaux ? { niveaux: doc.niveaux } : {}),
    ...(doc.composants ? { composants: doc.composants } : {}),
    ...(occurrences.length ? { occurrences } : {}),
  };
  return validateStudioDocument(vue);
}
