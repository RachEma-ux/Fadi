/**
 * Données des panneaux Affichage, Info modèle, Matériaux et Arborescence (D-159, ergonomie SketchUp pour le Web).
 * Pur : lectures du modèle typé, aucun DOM ; rien n'est inventé (une donnée absente est dite « non renseignée »).
 * Le masquage est un état d'affichage pour soi (comme l'isolement) : il ne modifie jamais le modèle.
 */
import { CLASSES, compositionMur, niveauxOrdonnes, type Classe, type ModeleAtelier, type Occurrence, type OccurrenceQuelconque } from "@parcours/atelier-model";

export interface Masquage {
  masques: string[];
  pileMasques: string[][];
}

/** Masque les objets donnés (ceux déjà masqués sont ignorés) ; null si rien de nouveau. */
export function masquer(m: Masquage, ids: readonly string[]): Masquage | null {
  const deja = new Set(m.masques);
  const nouveaux = [...new Set(ids)].filter((id) => !deja.has(id));
  if (!nouveaux.length) return null;
  return { masques: [...m.masques, ...nouveaux], pileMasques: [...m.pileMasques, nouveaux] };
}

/** Réaffiche le dernier masquage ; null s'il n'y en a pas. */
export function reafficherDernier(m: Masquage): (Masquage & { reaffiches: string[] }) | null {
  const dernier = m.pileMasques[m.pileMasques.length - 1];
  if (!dernier) return null;
  const retour = new Set(dernier);
  return { masques: m.masques.filter((id) => !retour.has(id)), pileMasques: m.pileMasques.slice(0, -1), reaffiches: dernier };
}

export function reafficherTout(): Masquage {
  return { masques: [], pileMasques: [] };
}

export interface InfoModele {
  niveaux: { id: string; nom: string; elevation: number; hauteur: number | null; objets: number }[];
  objets: number;
  parClasse: { classe: Classe; libelle: string; nombre: number }[];
  calques: number;
  groupes: number;
  definitions: { libelle: string; nombre: number }[];
  relations: number;
  problemes: number;
  site: { parcelle: boolean; emprise: boolean; hypotheses: number; sources: number };
}

const LIBELLES_DEFINITIONS: Record<string, string> = {
  bloc: "Blocs",
  composant: "Composants",
  vue: "Vues",
  feuille: "Feuilles",
  "vue-3d": "Vues 3D",
  planche: "Planches",
  "reference-externe": "Références externes",
  "ensemble-affichage": "Ensembles d'affichage",
  "etat-calques": "États de calques",
  "referentiel-classification": "Référentiels de classification",
};

export function infoModele(etat: ModeleAtelier): InfoModele {
  const objets = Object.values(etat.objets) as OccurrenceQuelconque[];
  const parNiveau = new Map<string, number>();
  const parClasse = new Map<Classe, number>();
  for (const o of objets) {
    if (o.niveauId) parNiveau.set(o.niveauId, (parNiveau.get(o.niveauId) ?? 0) + 1);
    parClasse.set(o.classe, (parClasse.get(o.classe) ?? 0) + 1);
  }
  const defs = new Map<string, number>();
  for (const d of Object.values(etat.definitions)) {
    const libelle = LIBELLES_DEFINITIONS[d.classe] ?? `Types (${CLASSES[d.classe as Classe]?.libelle ?? d.classe})`;
    defs.set(libelle, (defs.get(libelle) ?? 0) + 1);
  }
  return {
    niveaux: niveauxOrdonnes(etat).map((n) => ({ id: n.id, nom: n.nom, elevation: n.elevation, hauteur: n.hauteur, objets: parNiveau.get(n.id) ?? 0 })),
    objets: objets.length,
    parClasse: [...parClasse].map(([classe, nombre]) => ({ classe, libelle: CLASSES[classe]?.libelle ?? classe, nombre })).sort((a, b) => b.nombre - a.nombre || a.libelle.localeCompare(b.libelle, "fr")),
    calques: Object.keys(etat.calques).length,
    groupes: Object.keys(etat.groupes).length,
    definitions: [...defs].map(([libelle, nombre]) => ({ libelle, nombre })).sort((a, b) => a.libelle.localeCompare(b.libelle, "fr")),
    relations: Object.keys(etat.relations).length,
    problemes: Object.keys(etat.problemes).length,
    site: { parcelle: !!etat.site.parcelle, emprise: !!etat.site.emprise, hypotheses: etat.site.hypotheses.length, sources: etat.site.sources.length },
  };
}

export interface MateriauEnUsage {
  materiau: string;
  fonctions: string[];
  types: string[];
  murs: string[];
}

/**
 * Matériaux déclarés dans les compositions de murs (D-026) et en usage : lecture seule. Les murs sans type composé
 * sont comptés à part (matériau non renseigné), jamais rattachés à un matériau supposé.
 */
export function materiauxEnUsage(etat: ModeleAtelier): { materiaux: MateriauEnUsage[]; mursSansComposition: number } {
  const parNom = new Map<string, { fonctions: Set<string>; types: Set<string>; murs: Set<string> }>();
  let sans = 0;
  for (const o of Object.values(etat.objets) as OccurrenceQuelconque[]) {
    if (o.classe !== "mur") continue;
    const c = compositionMur(etat, o as Occurrence<"mur">);
    if (!c || !c.couches.length) {
      sans++;
      continue;
    }
    for (const k of c.couches) {
      const e = parNom.get(k.materiau) ?? { fonctions: new Set(), types: new Set(), murs: new Set() };
      if (k.fonction) e.fonctions.add(k.fonction);
      e.types.add(c.typeNom);
      e.murs.add(o.id);
      parNom.set(k.materiau, e);
    }
  }
  const tri = (s: Set<string>) => [...s].sort((a, b) => a.localeCompare(b, "fr"));
  return {
    materiaux: [...parNom].map(([materiau, e]) => ({ materiau, fonctions: tri(e.fonctions), types: tri(e.types), murs: tri(e.murs) })).sort((a, b) => a.materiau.localeCompare(b.materiau, "fr")),
    mursSansComposition: sans,
  };
}

export interface NoeudArbre {
  id: string;
  libelle: string;
  genre: "niveau" | "groupe" | "bloc" | "objet" | "classe";
  objetId?: string;
  enfants: NoeudArbre[];
}

const nomObjet = (o: OccurrenceQuelconque) => {
  const p = o.params as unknown as Record<string, unknown>;
  const n = typeof p["nom"] === "string" && p["nom"] ? (p["nom"] as string) : null;
  return `${CLASSES[o.classe]?.libelle ?? o.classe} ${n ?? o.id}`;
};

/**
 * Arborescence (Outliner) : niveaux → groupes (membres) → occurrences de blocs (par définition) → autres objets par
 * classe. Les objets sans niveau sont rangés sous « Sans niveau ».
 */
export function arborescence(etat: ModeleAtelier): NoeudArbre[] {
  const objets = Object.values(etat.objets) as OccurrenceQuelconque[];
  const parNiveau = new Map<string, OccurrenceQuelconque[]>();
  for (const o of objets) {
    const k = o.niveauId && etat.niveaux[o.niveauId] ? o.niveauId : "";
    const l = parNiveau.get(k) ?? [];
    l.push(o);
    parNiveau.set(k, l);
  }
  const branche = (id: string, libelle: string, liste: OccurrenceQuelconque[]): NoeudArbre => {
    const enfants: NoeudArbre[] = [];
    const reste: OccurrenceQuelconque[] = [];
    const groupes = new Map<string, OccurrenceQuelconque[]>();
    for (const o of liste) {
      if (o.groupeId && etat.groupes[o.groupeId]) groupes.set(o.groupeId, [...(groupes.get(o.groupeId) ?? []), o]);
      else reste.push(o);
    }
    const feuille = (o: OccurrenceQuelconque): NoeudArbre => ({ id: `o:${o.id}`, libelle: nomObjet(o), genre: "objet", objetId: o.id, enfants: [] });
    for (const [gid, membres] of [...groupes].sort((a, b) => etat.groupes[a[0]]!.nom.localeCompare(etat.groupes[b[0]]!.nom, "fr"))) {
      enfants.push({ id: `${id}/g:${gid}`, libelle: `Groupe ${etat.groupes[gid]!.nom}`, genre: "groupe", enfants: membres.map(feuille) });
    }
    const blocs = new Map<string, OccurrenceQuelconque[]>();
    const autres = new Map<Classe, OccurrenceQuelconque[]>();
    for (const o of reste) {
      if (o.classe === "bloc-occurrence" && o.definitionId) blocs.set(o.definitionId, [...(blocs.get(o.definitionId) ?? []), o]);
      else autres.set(o.classe, [...(autres.get(o.classe) ?? []), o]);
    }
    for (const [did, occ] of [...blocs].sort((a, b) => (etat.definitions[a[0]]?.nom ?? a[0]).localeCompare(etat.definitions[b[0]]?.nom ?? b[0], "fr"))) {
      const d = etat.definitions[did];
      enfants.push({ id: `${id}/b:${did}`, libelle: `${d?.classe === "composant" ? "Composant" : "Bloc"} ${d?.nom ?? did} (${occ.length})`, genre: "bloc", enfants: occ.map(feuille) });
    }
    for (const [classe, occ] of [...autres].sort((a, b) => (CLASSES[a[0]]?.libelle ?? a[0]).localeCompare(CLASSES[b[0]]?.libelle ?? b[0], "fr"))) {
      enfants.push({ id: `${id}/c:${classe}`, libelle: `${CLASSES[classe]?.libelle ?? classe} (${occ.length})`, genre: "classe", enfants: occ.map(feuille) });
    }
    return { id, libelle, genre: "niveau", enfants };
  };
  const out = niveauxOrdonnes(etat).map((n) => branche(`n:${n.id}`, n.nom, parNiveau.get(n.id) ?? []));
  const sans = parNiveau.get("");
  if (sans?.length) out.push(branche("n:-", "Sans niveau", sans));
  return out;
}
