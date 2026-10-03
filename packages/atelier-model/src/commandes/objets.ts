/**
 * Création, modification et suppression d'occurrences (toutes classes), avec les règles propres à chaque classe :
 * une ouverture suit le calque de son mur hôte, un mur hébergeant des ouvertures ne se supprime qu'avec
 * l'option explicite `avecHeberges`, une ouverture dont l'emprise sort du mur modifié passe « à réparer », les
 * références vers un objet supprimé passent « à réparer » (R12). Les alias `mur.tracer`, `ouverture.poser`,
 * `dalle.creer`, `esquisse.ligne`… sont enregistrés dans `index.ts`.
 */
import { distance } from "../geometrie.js";
import type { ModeleAtelier, Occurrence, OccurrenceQuelconque, Propriete, Reference } from "../modele.js";
import { ouverturesDuMur, referencesVers } from "../modele.js";
import { CLASSES, estClasse, estOuverture, type Classe } from "../ontologie.js";
import { ErreurCommande, effetsVides, lire, nouveauProbleme, type ContexteCommande, type Effets, type ResultatCommande } from "./base.js";
import { validerParams } from "./validation.js";

type Brut = Record<string, unknown>;

function lireProprietes(p: Brut): Record<string, Propriete> {
  const v = p["proprietes"];
  if (v === undefined || v === null) return {};
  if (typeof v !== "object") throw new ErreurCommande("invalide", "proprietes", "« proprietes » doit être un objet");
  const out: Record<string, Propriete> = {};
  for (const [nom, prop] of Object.entries(v as Record<string, unknown>)) {
    if (typeof prop !== "object" || prop === null) throw new ErreurCommande("invalide", `proprietes.${nom}`, "propriété typée attendue");
    const q = prop as Partial<Propriete>;
    const provenance = q.provenance ?? "saisie";
    const statut = q.statut ?? "declaree";
    if (!["saisie", "import", "calcul", "regle"].includes(provenance)) throw new ErreurCommande("invalide", `proprietes.${nom}.provenance`, "provenance invalide");
    if (!["declaree", "verifiee", "a-verifier"].includes(statut)) throw new ErreurCommande("invalide", `proprietes.${nom}.statut`, "statut invalide");
    out[nom] = q.unite === undefined ? { valeur: q.valeur, provenance, statut } : { valeur: q.valeur, unite: q.unite, provenance, statut };
  }
  return out;
}

export function creerOccurrence(etat: ModeleAtelier, p: Brut, ctx: ContexteCommande, classeForcee?: Classe): ResultatCommande {
  const classe = classeForcee ?? (p["classe"] as Classe);
  if (!estClasse(classe)) throw new ErreurCommande("invalide", "classe", `classe inconnue : ${String(p["classe"])}`);
  const description = CLASSES[classe];
  const params = validerParams(etat, classe, (p["params"] as Brut | undefined) ?? p);
  const idDemande = lire.chaineOuNull(p, "id");
  if (idDemande !== null && etat.objets[idDemande]) throw new ErreurCommande("precondition", "id", `identifiant déjà utilisé : ${idDemande}`);
  const id = idDemande ?? ctx.ids.nouveau(classe);
  let niveauId = lire.chaineOuNull(p, "niveauId");
  let calqueId = lire.calque(etat, p);
  if (estOuverture(classe)) {
    const hote = etat.objets[(params as Occurrence<"porte">["params"]).murHoteId] as Occurrence<"mur">;
    niveauId = hote.niveauId;
    calqueId = calqueId ?? hote.calqueId;
  } else if (description.parNiveau) {
    if (niveauId === null) throw new ErreurCommande("invalide", "niveauId", "« niveauId » requis");
    if (!etat.niveaux[niveauId]) throw new ErreurCommande("precondition", "niveauId", `niveau inconnu : ${niveauId}`);
  }
  const definitionId = lire.chaineOuNull(p, "definitionId");
  if (definitionId !== null && !etat.definitions[definitionId]) throw new ErreurCommande("precondition", "definitionId", `définition inconnue : ${definitionId}`);
  const groupeId = lire.chaineOuNull(p, "groupeId");
  if (groupeId !== null && !etat.groupes[groupeId]) throw new ErreurCommande("precondition", "groupeId", `groupe inconnu : ${groupeId}`);
  const occurrence = {
    id,
    classe,
    niveauId,
    definitionId,
    calqueId,
    groupeId,
    phase: lire.chaineOuNull(p, "phase"),
    params,
    proprietes: lireProprietes(p),
  } as OccurrenceQuelconque;
  const effets = effetsVides();
  effets.crees.push(id);
  if (niveauId) effets.niveauxTouches.push(niveauId);
  return { etat: { ...etat, objets: { ...etat.objets, [id]: occurrence } }, effets };
}

/** Modification : fusion du patch avec les paramètres existants, puis validation complète de la classe. */
export function modifierOccurrence(etat: ModeleAtelier, p: Brut, ctx: ContexteCommande, classeAttendue?: Classe): ResultatCommande {
  const id = lire.objet(etat, p, "id");
  const existant = etat.objets[id]!;
  if (classeAttendue && existant.classe !== classeAttendue && !(classeAttendue === "ouverture" && estOuverture(existant.classe))) {
    throw new ErreurCommande("precondition", "id", `l'objet ${id} n'est pas de classe ${classeAttendue}`);
  }
  const calqueExistant = existant.calqueId ? etat.calques[existant.calqueId] : null;
  if (calqueExistant?.verrouille) throw new ErreurCommande("precondition", "id", `calque verrouillé : ${calqueExistant.nom}`);
  const patch = (p["params"] as Brut | undefined) ?? {};
  const params = validerParams(etat, existant.classe, { ...(existant.params as unknown as Brut), ...patch });
  const proprietes = p["proprietes"] === undefined ? existant.proprietes : { ...existant.proprietes, ...lireProprietes(p) };
  const suivant = {
    ...existant,
    params,
    proprietes,
    phase: p["phase"] === undefined ? existant.phase : lire.chaineOuNull(p, "phase"),
    definitionId: p["definitionId"] === undefined ? existant.definitionId : lire.chaineOuNull(p, "definitionId"),
  } as OccurrenceQuelconque;
  if (suivant.definitionId !== null && !etat.definitions[suivant.definitionId]) throw new ErreurCommande("precondition", "definitionId", `définition inconnue : ${suivant.definitionId}`);
  const objets = { ...etat.objets, [id]: suivant };
  let problemes = etat.problemes;
  const effets = effetsVides();
  effets.modifies.push(id);
  if (existant.niveauId) effets.niveauxTouches.push(existant.niveauId);
  // Un mur modifié : les ouvertures dont l'emprise sort du nouvel axe passent « à réparer » (R12), jamais supprimées.
  if (existant.classe === "mur") {
    const m = suivant as Occurrence<"mur">;
    const longueur = distance(m.params.a, m.params.b);
    for (const o of ouverturesDuMur(etat, id)) {
      const demi = o.params.largeur.value / 2 / longueur;
      if (o.params.position - demi < -1e-9 || o.params.position + demi > 1 + 1e-9) {
        const pb = nouveauProbleme(ctx.ids, "reference-a-reparer", o.id, `${CLASSES[o.classe].libelle} ${o.id} : l'emprise sort du mur ${id} modifié — déplacer, supprimer ou détacher`);
        problemes = { ...problemes, [pb.id]: pb };
        effets.problemes.push(pb);
        effets.referencesAReparer.push(o.id);
      }
    }
  }
  return { etat: { ...etat, objets, problemes }, effets };
}

export function supprimerOccurrence(etat: ModeleAtelier, p: Brut, ctx: ContexteCommande, classeAttendue?: Classe): ResultatCommande {
  const id = lire.objet(etat, p, "id");
  const existant = etat.objets[id]!;
  if (classeAttendue && existant.classe !== classeAttendue && !(classeAttendue === "ouverture" && estOuverture(existant.classe))) {
    throw new ErreurCommande("precondition", "id", `l'objet ${id} n'est pas de classe ${classeAttendue}`);
  }
  const calqueExistant = existant.calqueId ? etat.calques[existant.calqueId] : null;
  if (calqueExistant?.verrouille) throw new ErreurCommande("precondition", "id", `calque verrouillé : ${calqueExistant.nom}`);
  const aSupprimer = new Set<string>([id]);
  if (existant.classe === "mur") {
    const heberges = ouverturesDuMur(etat, id);
    if (heberges.length > 0) {
      if (!lire.booleen(p, "avecHeberges", false)) throw new ErreurCommande("precondition", "id", `le mur ${id} héberge ${heberges.length} ouverture(s) : indiquer avecHeberges = true pour les supprimer avec lui`);
      for (const o of heberges) aSupprimer.add(o.id);
    }
  }
  return supprimerIds(etat, [...aSupprimer], ctx);
}

/** Suppression brute d'un ensemble d'objets : relations retirées, références « à réparer », appartenance aux groupes retirée. */
export function supprimerIds(etat: ModeleAtelier, ids: readonly string[], ctx: ContexteCommande): ResultatCommande {
  const objets = { ...etat.objets };
  const effets: Effets = effetsVides();
  for (const id of ids) {
    const o = objets[id];
    if (!o) continue;
    delete objets[id];
    effets.supprimes.push(id);
    if (o.niveauId) effets.niveauxTouches.push(o.niveauId);
  }
  const relations = Object.fromEntries(Object.entries(etat.relations).filter(([, r]) => !ids.includes(r.sourceId) && !ids.includes(r.targetId)));
  let references = etat.references;
  let problemes = etat.problemes;
  for (const id of ids) {
    for (const ref of referencesVers(etat, id)) {
      if (ids.includes(ref.proprietaireId)) {
        references = { ...references };
        delete references[ref.id];
        continue;
      }
      const reparee: Reference = { ...ref, etat: "a-reparer", propositions: [] };
      references = { ...references, [ref.id]: reparee };
      const pb = nouveauProbleme(ctx.ids, "reference-a-reparer", ref.proprietaireId, `référence de ${ref.proprietaireId} vers ${id} (${ref.caracteristique ?? "?"}) : objet supprimé — à réparer`);
      problemes = { ...problemes, [pb.id]: pb };
      effets.problemes.push(pb);
      effets.referencesAReparer.push(ref.id);
    }
  }
  // Les références détenues par les objets supprimés disparaissent avec eux.
  for (const ref of Object.values(references)) if (ids.includes(ref.proprietaireId)) {
    references = { ...references };
    delete references[ref.id];
  }
  // Les problèmes qui visaient un objet supprimé sont levés (plus d'objet à réparer).
  for (const pb of Object.values(problemes)) if (pb.objetId && ids.includes(pb.objetId) && !effets.problemes.includes(pb)) {
    problemes = { ...problemes };
    delete problemes[pb.id];
  }
  return { etat: { ...etat, objets, relations, references, problemes }, effets };
}
