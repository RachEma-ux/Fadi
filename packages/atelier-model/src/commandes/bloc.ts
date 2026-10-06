/**
 * Blocs et composants (fiches DA-05-06, DA-05-07, DA-05-09) : une définition du catalogue versionné (`bloc` :
 * dessin réutilisable ; `composant` : objet du bâtiment avec propriétés, classification et comptage) créée depuis
 * une sélection et un point de base, placée en occurrences `bloc-occurrence`, redéfinie (version suivante, les
 * occurrences suivent), décomposée en objets indépendants. Les bibliothèques sont un regroupement nommé des
 * définitions (paramètre `bibliotheque`), sans commande propre.
 */
import type { Definition, ModeleAtelier, Occurrence, OccurrenceQuelconque } from "../modele.js";
import { ouverturesDuMur, referencesVers } from "../modele.js";
import { pointCaracteristique } from "../references.js";
import { pt, type Point2 } from "../unites.js";
import { effetsVides, ErreurCommande, lire, nouveauProbleme, type ContexteCommande, type ResultatCommande } from "./base.js";
import { creerOccurrence } from "./objets.js";
import { transformerOccurrence } from "./transformer.js";
import { definitionsImbriquees } from "../blocs-places.js";
export { definitionsImbriquees };

type Brut = Record<string, unknown>;

/**
 * Classes admises dans un bloc ou un composant : du dessin, des solides et (D-078) des occurrences d'autres blocs
 * (blocs imbriqués, sans cycle) ; jamais un élément hébergeant (mur…).
 */
// Poteaux et dalles (D-108) : objets d'architecture admis dans un bloc (volume, plan, décomposition). Murs et
// ouvertures (D-150) : admis ensemble — une ouverture vient avec son mur hôte, les murs du bloc se raccordent entre eux.
export const CLASSES_BLOC = ["esquisse", "texte", "solide", "bloc-occurrence", "poteau", "dalle", "mur", "porte", "fenetre", "ouverture"] as const;
/** Profondeur d'imbrication au plus (au-delà : refus à la définition, rien dessiné au-delà). */
export const PROFONDEUR_BLOCS = 8;

export interface ContenuBloc {
  classe: (typeof CLASSES_BLOC)[number];
  params: Record<string, unknown>;
  calqueId: string | null;
  /** Occurrence imbriquée : définition placée (D-078). */
  definitionId?: string | null;
  /** Clé locale (D-150) : identifiant d'origine d'un mur, auquel ses ouvertures se rattachent (`murHoteId`). */
  cle?: string;
}

/** Profondeur d'imbrication d'une définition (1 : aucun bloc imbriqué). */
function profondeur(etat: ModeleAtelier, defId: string, garde = 0): number {
  if (garde > PROFONDEUR_BLOCS + 1) return garde;
  const d = etat.definitions[defId];
  const enfants = ((d?.params as unknown as ParamsDefinitionBloc | undefined)?.contenu ?? []).filter((e) => e.classe === "bloc-occurrence" && e.definitionId).map((e) => e.definitionId!);
  return 1 + Math.max(0, ...enfants.map((x) => profondeur(etat, x, garde + 1)));
}

export interface ParamsDefinitionBloc {
  pointDeBase: Point2;
  contenu: ContenuBloc[];
  bibliotheque: string | null;
  /** Composant : propriétés héritées par les occurrences (surchargeables sur l'occurrence). */
  proprietes: Record<string, { valeur: string | number | boolean; unite: string | null }>;
  classification: string | null;
}

const estBloc = (d: Definition | undefined): d is Definition => !!d && (d.classe === "bloc" || d.classe === "composant");

function lireProprietesComposant(p: Brut): ParamsDefinitionBloc["proprietes"] {
  const v = p["proprietes"];
  if (v === undefined || v === null) return {};
  if (typeof v !== "object" || Array.isArray(v)) throw new ErreurCommande("invalide", "proprietes", "« proprietes » : { nom: { valeur, unite } }");
  const out: ParamsDefinitionBloc["proprietes"] = {};
  for (const [nom, brut] of Object.entries(v as Brut)) {
    const q = (brut ?? {}) as { valeur?: unknown; unite?: unknown };
    if (!["string", "number", "boolean"].includes(typeof q.valeur)) throw new ErreurCommande("invalide", `proprietes.${nom}`, "valeur texte, nombre ou booléen attendue");
    const unite = typeof q.unite === "string" && q.unite.trim() ? q.unite.trim() : null;
    if (typeof q.valeur === "number" && !unite) throw new ErreurCommande("invalide", `proprietes.${nom}.unite`, `propriété numérique « ${nom} » sans unité : refusée`);
    out[nom] = { valeur: q.valeur as string | number | boolean, unite };
  }
  return out;
}

function lireBibliotheque(etat: ModeleAtelier, p: Brut, idCourant: string | null): string | null {
  const b = lire.chaineOuNull(p, "bibliotheque")?.trim() || null;
  if (!b) return null;
  for (const d of Object.values(etat.definitions)) {
    if (!estBloc(d) || d.id === idCourant) continue;
    const autre = (d.params as unknown as ParamsDefinitionBloc).bibliotheque;
    if (autre && autre !== b && autre.toLowerCase() === b.toLowerCase()) throw new ErreurCommande("invalide", "bibliotheque", `bibliothèque « ${b} » : une bibliothèque « ${autre} » existe déjà (seule la casse diffère)`);
  }
  return b;
}

/** Contenu d'une sélection, ramené au point de base (coordonnées relatives). */
/** Ouvertures des murs visés (D-150) : elles suivent leur mur dans le bloc. */
export function avecOuvertures(etat: ModeleAtelier, cibles: string[]): string[] {
  const out = [...cibles];
  for (const id of cibles) if (etat.objets[id]?.classe === "mur") for (const ouv of ouverturesDuMur(etat, id)) if (!out.includes(ouv.id)) out.push(ouv.id);
  return out;
}

function contenuDepuis(etat: ModeleAtelier, cibles0: string[], base: Point2): ContenuBloc[] {
  if (!cibles0.length) throw new ErreurCommande("invalide", "cibles", "sélection vide");
  const cibles = avecOuvertures(etat, cibles0);
  // Murs d'abord : leurs ouvertures s'y rattachent par la clé locale.
  const ordre = (id: string) => (etat.objets[id]?.classe === "mur" ? 0 : 1);
  return [...cibles].sort((a, b) => ordre(a) - ordre(b)).map((id) => {
    const i = cibles0.indexOf(id);
    const o = etat.objets[id];
    if (!o) throw new ErreurCommande("precondition", `cibles[${i}]`, `objet inconnu : ${id}`);
    if (!(CLASSES_BLOC as readonly string[]).includes(o.classe)) throw new ErreurCommande("precondition", `cibles[${i}]`, `classe « ${o.classe} » refusée dans un bloc (esquisses, textes, solides, poteaux, dalles, murs avec leurs ouvertures et occurrences de blocs seulement)`);
    if ((o.classe === "porte" || o.classe === "fenetre" || o.classe === "ouverture") && !cibles.includes(o.params.murHoteId)) throw new ErreurCommande("precondition", `cibles[${i}]`, `${o.id} : une ouverture entre dans un bloc avec son mur ${o.params.murHoteId}`);
    let relatif = transformerOccurrence(o, { type: "translation", dx: -base.x, dy: -base.y });
    if (relatif.classe === "mur" && relatif.params.niveauHautId) {
      // Un bloc n'est lié à aucun niveau : le niveau haut devient la hauteur effective (non évaluée si incohérent).
      const bas = o.niveauId ? etat.niveaux[o.niveauId] : undefined;
      const haut = etat.niveaux[relatif.params.niveauHautId];
      const h = bas && haut && haut.elevation > bas.elevation ? { value: Math.round((haut.elevation - bas.elevation) * 1e9) / 1e9, unit: "m" as const } : null;
      relatif = { ...relatif, params: { ...relatif.params, niveauHautId: null, hauteur: h } };
    }
    return { classe: o.classe as ContenuBloc["classe"], params: relatif.params as unknown as Record<string, unknown>, calqueId: o.calqueId, ...(o.classe === "bloc-occurrence" ? { definitionId: o.definitionId } : {}), ...(o.classe === "mur" ? { cle: o.id } : {}) };
  });
}

export const reducteursBloc = {
  definir(etat: ModeleAtelier, p: Brut, ctx: ContexteCommande): ResultatCommande {
    const redefinir = lire.chaineOuNull(p, "redefinir");
    const existante = redefinir ? etat.definitions[redefinir] : undefined;
    if (redefinir && !estBloc(existante)) throw new ErreurCommande("precondition", "redefinir", `bloc ou composant inconnu : ${redefinir}`);
    const id = existante?.id ?? lire.chaineOuNull(p, "id") ?? ctx.ids.nouveau("bloc");
    if (!existante && etat.definitions[id]) throw new ErreurCommande("precondition", "id", `définition déjà existante : ${id}`);
    const nature = lire.enumeration(p, "nature", ["bloc", "composant"] as const, (existante?.classe as "bloc" | "composant" | undefined) ?? "bloc");
    const nom = (lire.chaineOuNull(p, "nom") ?? existante?.nom ?? "").trim();
    if (!nom) throw new ErreurCommande("invalide", "nom", "nom du bloc requis");
    const pointDeBase = lire.point(p, "pointDeBase")!;
    const cibles = Array.isArray(p["cibles"]) ? (p["cibles"] as unknown[]).filter((x): x is string => typeof x === "string") : [];
    const contenu = contenuDepuis(etat, cibles, pointDeBase);
    // Blocs imbriqués (D-078) : ni cycle (la définition dans elle-même, directement ou non), ni profondeur excessive.
    for (const e of contenu) {
      if (e.classe !== "bloc-occurrence") continue;
      if (!e.definitionId || !estBloc(etat.definitions[e.definitionId])) throw new ErreurCommande("precondition", "cibles", "occurrence imbriquée sans définition de bloc");
      if (e.definitionId === id || definitionsImbriquees(etat, e.definitionId).has(id)) throw new ErreurCommande("precondition", "cibles", `cycle : le bloc « ${etat.definitions[e.definitionId]!.nom} » contient déjà ce bloc`);
      if (profondeur(etat, e.definitionId) >= PROFONDEUR_BLOCS) throw new ErreurCommande("precondition", "cibles", `imbrication de plus de ${PROFONDEUR_BLOCS} niveaux refusée`);
    }
    const anciens = existante ? (existante.params as unknown as ParamsDefinitionBloc) : null;
    const params: ParamsDefinitionBloc = {
      pointDeBase,
      contenu,
      bibliotheque: p["bibliotheque"] === undefined && anciens ? anciens.bibliotheque : lireBibliotheque(etat, p, id),
      proprietes: p["proprietes"] === undefined && anciens ? anciens.proprietes : lireProprietesComposant(p),
      classification: p["classification"] === undefined && anciens ? anciens.classification : lire.chaineOuNull(p, "classification"),
    };
    const definition: Definition = { id, classe: nature, nom, params: params as unknown as Brut, version: (existante?.version ?? 0) + 1 };
    let suivant: ModeleAtelier = { ...etat, definitions: { ...etat.definitions, [id]: definition } };
    const effets = effetsVides();
    (existante ? effets.modifies : effets.crees).push(id);
    // Les occurrences suivent la nouvelle version : signalées modifiées (vues et quantités à recalculer).
    if (existante) for (const o of Object.values(etat.objets)) if (o.classe === "bloc-occurrence" && o.definitionId === id) effets.modifies.push(o.id);
    // Cotes rattachées aux sommets d'une occurrence (D-102) : un sommet disparu rend la référence « à réparer ».
    if (existante) {
      for (const o of Object.values(suivant.objets)) {
        if (o.classe !== "bloc-occurrence" || o.definitionId !== id) continue;
        for (const ref of referencesVers(suivant, o.id)) {
          if (ref.etat !== "ok" || !ref.caracteristique || pointCaracteristique(suivant, o.id, ref.caracteristique)) continue;
          const pb = nouveauProbleme(ctx.ids, "reference-a-reparer", ref.proprietaireId, `référence de ${ref.proprietaireId} vers ${o.id} (${ref.caracteristique}) : sommet absent du bloc redéfini — à réparer`);
          suivant = { ...suivant, references: { ...suivant.references, [ref.id]: { ...ref, etat: "a-reparer", propositions: [] } }, problemes: { ...suivant.problemes, [pb.id]: pb } };
          effets.problemes.push(pb);
          effets.referencesAReparer.push(ref.id);
        }
      }
    }
    // Remplacer la sélection par une occurrence posée au point de base (même niveau, calque du premier objet).
    if (lire.booleen(p, "remplacer", false)) {
      const sources = cibles.map((c) => etat.objets[c]!);
      const niveaux = new Set(sources.map((o) => o.niveauId));
      if (niveaux.size !== 1) throw new ErreurCommande("precondition", "cibles", "remplacer la sélection demande des objets d'un même niveau");
      const objets = { ...suivant.objets };
      const retires = avecOuvertures(etat, cibles);
      for (const c of retires) delete objets[c];
      effets.supprimes.push(...retires);
      suivant = { ...suivant, objets };
      const r = creerOccurrence(suivant, { niveauId: sources[0]!.niveauId, calqueId: sources[0]!.calqueId, definitionId: id, params: { position: pointDeBase, angle: { value: 0, unit: "deg" }, echelle: 1 } }, ctx, "bloc-occurrence");
      suivant = r.etat;
      effets.crees.push(...r.effets.crees);
    }
    return { etat: suivant, effets };
  },

  placer(etat: ModeleAtelier, p: Brut, ctx: ContexteCommande): ResultatCommande {
    const definitionId = lire.chaine(p, "definitionId");
    if (!estBloc(etat.definitions[definitionId])) throw new ErreurCommande("precondition", "definitionId", `bloc ou composant inconnu : ${definitionId}`);
    return creerOccurrence(etat, { id: p["id"], niveauId: p["niveauId"], calqueId: p["calqueId"], definitionId, phase: p["phase"], proprietes: p["proprietes"], params: { position: p["position"], angle: p["angle"] ?? { value: 0, unit: "deg" }, echelle: p["echelle"] ?? 1, ...(p["miroir"] === true ? { miroir: true } : {}) } }, ctx, "bloc-occurrence");
  },
};

/** Copies indépendantes du contenu d'une occurrence de bloc, placées (décomposition). */
export function decomposerBloc(etat: ModeleAtelier, o: Occurrence<"bloc-occurrence">, ctx: ContexteCommande): { objets: Record<string, OccurrenceQuelconque>; crees: string[] } {
  const def = o.definitionId ? etat.definitions[o.definitionId] : undefined;
  if (!estBloc(def)) throw new ErreurCommande("precondition", "cibles", `occurrence ${o.id} : définition absente, décomposition impossible`);
  const params = def.params as unknown as ParamsDefinitionBloc;
  const objets: Record<string, OccurrenceQuelconque> = {};
  const crees: string[] = [];
  const murs = new Map<string, string>(); // clé locale → identifiant du mur décomposé (D-150)
  for (const e of params.contenu) {
    const id = ctx.ids.nouveau(e.classe);
    if (e.classe === "mur" && e.cle) murs.set(e.cle, id);
    const estOuv = e.classe === "porte" || e.classe === "fenetre" || e.classe === "ouverture";
    const p0 = estOuv ? { ...e.params, murHoteId: murs.get(String(e.params["murHoteId"])) ?? e.params["murHoteId"] } : e.params;
    let copie = { id, classe: e.classe, niveauId: o.niveauId, definitionId: e.classe === "bloc-occurrence" ? (e.definitionId ?? null) : null, calqueId: e.calqueId ?? o.calqueId, groupeId: null, phase: o.phase, params: p0, proprietes: {} } as unknown as OccurrenceQuelconque;
    if (o.params.miroir) copie = transformerOccurrence(copie, { type: "miroir", a: pt(0, 0), b: pt(1, 0) });
    if (o.params.echelle !== 1) copie = transformerOccurrence(copie, { type: "echelle", centre: pt(0, 0), facteur: o.params.echelle });
    if (o.params.angle.value) copie = transformerOccurrence(copie, { type: "rotation", centre: pt(0, 0), angleDeg: o.params.angle.value });
    copie = transformerOccurrence(copie, { type: "translation", dx: o.params.position.x, dy: o.params.position.y });
    objets[id] = copie;
    crees.push(id);
  }
  return { objets, crees };
}

/** Propriétés effectives d'une occurrence de composant : celles de la définition, surchargées par l'occurrence. */
export function proprietesEffectives(etat: ModeleAtelier, o: OccurrenceQuelconque): Record<string, { valeur: unknown; unite: string | null; source: "definition" | "occurrence" }> {
  const out: Record<string, { valeur: unknown; unite: string | null; source: "definition" | "occurrence" }> = {};
  const def = o.definitionId ? etat.definitions[o.definitionId] : undefined;
  if (estBloc(def)) for (const [k, v] of Object.entries((def.params as unknown as ParamsDefinitionBloc).proprietes ?? {})) out[k] = { valeur: v.valeur, unite: v.unite, source: "definition" };
  for (const [k, v] of Object.entries(o.proprietes)) out[k] = { valeur: v.valeur, unite: v.unite ?? null, source: "occurrence" };
  return out;
}

/** Bibliothèques : définitions de blocs et composants regroupées et filtrées (consultation, sans commande). */
export function bibliotheques(etat: ModeleAtelier, recherche = "", nature?: "bloc" | "composant"): { nom: string; definitions: { id: string; nom: string; nature: "bloc" | "composant"; version: number; occurrences: number }[] }[] {
  const q = recherche.trim().toLowerCase();
  const groupes = new Map<string, { id: string; nom: string; nature: "bloc" | "composant"; version: number; occurrences: number }[]>();
  for (const d of Object.values(etat.definitions)) {
    if (!estBloc(d)) continue;
    if (nature && d.classe !== nature) continue;
    const params = d.params as unknown as ParamsDefinitionBloc;
    if (q && !`${d.nom} ${params.bibliotheque ?? ""} ${params.classification ?? ""}`.toLowerCase().includes(q)) continue;
    const nom = params.bibliotheque ?? "Sans bibliothèque";
    const occurrences = Object.values(etat.objets).filter((o) => o.classe === "bloc-occurrence" && o.definitionId === d.id).length;
    const l = groupes.get(nom) ?? [];
    l.push({ id: d.id, nom: d.nom, nature: d.classe as "bloc" | "composant", version: d.version, occurrences });
    groupes.set(nom, l);
  }
  return [...groupes.entries()].sort((a, b) => a[0].localeCompare(b[0], "fr")).map(([nom, definitions]) => ({ nom, definitions: definitions.sort((a, b) => a.nom.localeCompare(b.nom, "fr")) }));
}
