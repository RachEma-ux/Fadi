/**
 * Presse-papiers de l'Atelier (D-147, DA-02-02) : copier une sélection et la coller dans le même projet, sur un
 * autre niveau ou dans un autre projet. Le contenu copié est autonome (objets, ouvertures des murs copiés,
 * définitions utilisées, blocs imbriqués compris, noms des calques) ; le collage le traduit en commandes typées
 * ordinaires (`type.definir`, `objet.creer`), donc validées, journalisées et annulables comme toute modification.
 * Rien n'est inventé : un lien qui ne peut pas suivre (calque absent, niveau haut, objet associé non copié) est
 * retiré et nommé dans les remarques ; un mur ou un espace montant à un niveau haut garde sa hauteur effective.
 * Pur (ni React ni DOM).
 */
import type { Commande } from "./commandes/index.js";
import { transformerOccurrence } from "./commandes/transformer.js";
import type { Definition, ModeleAtelier, OccurrenceQuelconque } from "./modele.js";
import { ouverturesDuMur } from "./modele.js";

export const FORMAT_PRESSE_PAPIERS = "fadi-atelier-presse-papiers/1";

export interface PressePapiers {
  format: typeof FORMAT_PRESSE_PAPIERS;
  projetId: string | null;
  /** Objets copiés (murs avant leurs ouvertures), identifiants d'origine. */
  objets: OccurrenceQuelconque[];
  /** Définitions utilisées (types, blocs, blocs imbriqués). */
  definitions: Definition[];
  /** Noms des calques d'origine (pour retrouver un calque de même nom à destination). */
  calques: Record<string, string>;
  /** Hauteur effective (m) d'un mur ou d'un espace qui montait jusqu'à un niveau haut. */
  hauteursEffectives: Record<string, number>;
  remarques: string[];
}

const ORDRE: Record<string, number> = { mur: 0, porte: 1, fenetre: 1, ouverture: 1 };

/** Copie d'une sélection. Une ouverture sans son mur n'est pas copiée (son hôte resterait inconnu). */
export function copierSelection(etat: ModeleAtelier, ids: readonly string[], projetId: string | null = null): PressePapiers {
  const remarques: string[] = [];
  const retenus = new Map<string, OccurrenceQuelconque>();
  for (const id of ids) {
    const o = etat.objets[id];
    if (!o) continue;
    if ((o.classe === "porte" || o.classe === "fenetre" || o.classe === "ouverture") && !ids.includes(o.params.murHoteId)) {
      remarques.push(`${o.id} : ouverture copiée sans son mur ${o.params.murHoteId} — non copiée.`);
      continue;
    }
    retenus.set(id, o);
    if (o.classe === "mur") for (const ouv of ouverturesDuMur(etat, id)) retenus.set(ouv.id, ouv);
  }
  const objets = [...retenus.values()].sort((a, b) => (ORDRE[a.classe] ?? 2) - (ORDRE[b.classe] ?? 2) || (a.id < b.id ? -1 : 1));
  // Définitions utilisées, blocs imbriqués compris.
  const defs = new Map<string, Definition>();
  const ajouterDef = (id: string | null | undefined) => {
    if (!id || defs.has(id) || !etat.definitions[id]) return;
    const d = etat.definitions[id]!;
    defs.set(id, d);
    const contenu = (d.params as { contenu?: { definitionId?: string | null }[] }).contenu;
    if (Array.isArray(contenu)) for (const e of contenu) ajouterDef(e.definitionId);
  };
  for (const o of objets) ajouterDef(o.definitionId);
  const calques: Record<string, string> = {};
  for (const o of objets) if (o.calqueId && etat.calques[o.calqueId]) calques[o.calqueId] = etat.calques[o.calqueId]!.nom;
  const hauteursEffectives: Record<string, number> = {};
  for (const o of objets) {
    const haut = (o.classe === "mur" || o.classe === "espace") && o.params.niveauHautId ? etat.niveaux[o.params.niveauHautId] : undefined;
    const bas = o.niveauId ? etat.niveaux[o.niveauId] : undefined;
    if (haut && bas && haut.elevation > bas.elevation) hauteursEffectives[o.id] = Math.round((haut.elevation - bas.elevation) * 1e9) / 1e9;
  }
  return { format: FORMAT_PRESSE_PAPIERS, projetId, objets, definitions: [...defs.values()], calques, hauteursEffectives, remarques };
}

/** Lecture prudente d'un presse-papiers (texte JSON) : null si ce n'en est pas un. */
export function lirePressePapiers(texte: string | null | undefined): PressePapiers | null {
  if (!texte) return null;
  try {
    const v = JSON.parse(texte) as Partial<PressePapiers>;
    return v && v.format === FORMAT_PRESSE_PAPIERS && Array.isArray(v.objets) && Array.isArray(v.definitions) ? (v as PressePapiers) : null;
  } catch {
    return null;
  }
}

const libre = (pris: Set<string>, id: string) => {
  if (!pris.has(id)) return id;
  for (let k = 1; ; k++) if (!pris.has(`${id}-c${k}`)) return `${id}-c${k}`;
};

/**
 * Commandes de collage sur un niveau de la cible, avec un décalage facultatif (m). Nouveaux identifiants quand
 * ceux d'origine sont pris ; définitions reprises (identiques : réutilisées ; sinon copiées sous un identifiant
 * libre) ; calque d'origine, ou calque de même nom, sinon aucun (dit).
 */
export function commandesColler(cible: ModeleAtelier, pp: PressePapiers, niveauId: string, decalage: { dx: number; dy: number } = { dx: 0, dy: 0 }): { commandes: Commande[]; ids: string[]; remarques: string[] } {
  const remarques = [...pp.remarques];
  const commandes: Commande[] = [];
  // Définitions.
  const defsPrises = new Set(Object.keys(cible.definitions));
  const defMap = new Map<string, string>();
  for (const d of pp.definitions) {
    const ex = cible.definitions[d.id];
    if (ex && ex.classe === d.classe && JSON.stringify(ex.params) === JSON.stringify(d.params)) {
      defMap.set(d.id, d.id);
      continue;
    }
    const id = libre(defsPrises, d.id);
    defsPrises.add(id);
    defMap.set(d.id, id);
  }
  const remapContenu = (params: Record<string, unknown>) => {
    const contenu = (params as { contenu?: { definitionId?: string | null }[] }).contenu;
    return Array.isArray(contenu) ? { ...params, contenu: contenu.map((e) => (e.definitionId ? { ...e, definitionId: defMap.get(e.definitionId) ?? e.definitionId } : e)) } : params;
  };
  for (const d of pp.definitions) {
    const id = defMap.get(d.id)!;
    if (cible.definitions[id]) continue;
    commandes.push({ type: "type.definir", params: { id, classe: d.classe, nom: id === d.id ? d.nom : `${d.nom} (collé)`, params: remapContenu(d.params) } });
  }
  // Objets.
  const pris = new Set(Object.keys(cible.objets));
  const idMap = new Map<string, string>();
  for (const o of pp.objets) {
    const id = libre(pris, o.id);
    pris.add(id);
    idMap.set(o.id, id);
  }
  const calqueParNom = new Map(Object.values(cible.calques).map((c) => [c.nom, c.id] as const));
  const ids: string[] = [];
  for (const o0 of pp.objets) {
    const o = decalage.dx || decalage.dy ? transformerOccurrence(o0, { type: "translation", dx: decalage.dx, dy: decalage.dy }) : o0;
    const id = idMap.get(o.id)!;
    const params = { ...(o.params as unknown as Record<string, unknown>) };
    // Liens internes au contenu copié : suivis ; vers l'extérieur : retirés et nommés.
    for (const cle of ["sourceId", "objetId"] as const) {
      const v = params[cle];
      if (typeof v !== "string") continue;
      if (idMap.has(v)) params[cle] = idMap.get(v);
      else {
        if (cle === "sourceId") delete params[cle];
        else params[cle] = null;
        remarques.push(`${o.id} : lien vers ${v} (non copié) retiré.`);
      }
    }
    if (params["axeDe"] && typeof params["axeDe"] === "object") {
      const ax = params["axeDe"] as { sourceId?: string };
      if (ax.sourceId && idMap.has(ax.sourceId)) params["axeDe"] = { ...ax, sourceId: idMap.get(ax.sourceId) };
      else {
        delete params["axeDe"];
        remarques.push(`${o.id} : axe associé à un objet non copié, devenu libre.`);
      }
    }
    if (o.classe === "porte" || o.classe === "fenetre" || o.classe === "ouverture") params["murHoteId"] = idMap.get(o.params.murHoteId)!;
    if ((o.classe === "mur" || o.classe === "espace") && o.params.niveauHautId) {
      const h = pp.hauteursEffectives[o.id];
      if (o.classe === "mur") params["niveauHautId"] = null;
      else delete params["niveauHautId"];
      if (h) params["hauteur"] = { value: h, unit: "m" };
      remarques.push(`${o.id} : niveau haut remplacé par la hauteur effective${h ? ` (${h} m)` : " (non évaluée)"}.`);
    }
    if (o.classe === "escalier") {
      params["niveauDepartId"] = niveauId;
      if (o.params.niveauArriveeId) {
        params["niveauArriveeId"] = null;
        remarques.push(`${o.id} : niveau d'arrivée à redéfinir.`);
      }
    }
    let calqueId: string | null = null;
    if (o.calqueId) {
      if (cible.calques[o.calqueId] && cible.calques[o.calqueId]!.nom === pp.calques[o.calqueId]) calqueId = o.calqueId;
      else if (pp.calques[o.calqueId] && calqueParNom.has(pp.calques[o.calqueId]!)) calqueId = calqueParNom.get(pp.calques[o.calqueId]!)!;
      else remarques.push(`${o.id} : calque « ${pp.calques[o.calqueId] ?? o.calqueId} » absent ici — collé sans calque.`);
    }
    const ouverture = o.classe === "porte" || o.classe === "fenetre" || o.classe === "ouverture";
    commandes.push({
      type: "objet.creer",
      params: {
        id,
        classe: o.classe,
        ...(ouverture ? {} : { niveauId }),
        calqueId,
        definitionId: o.definitionId ? (defMap.get(o.definitionId) ?? null) : null,
        phase: o.phase,
        params,
        proprietes: o.proprietes,
      },
    });
    ids.push(id);
  }
  return { commandes, ids, remarques: [...new Set(remarques)] };
}
