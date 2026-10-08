/**
 * Création, modification et suppression d'occurrences (toutes classes), avec les règles propres à chaque classe :
 * une ouverture suit le calque de son mur hôte, un mur hébergeant des ouvertures ne se supprime qu'avec
 * l'option explicite `avecHeberges`, une ouverture dont l'emprise sort du mur modifié passe « à réparer », les
 * références vers un objet supprimé passent « à réparer » (R12). Les alias `mur.tracer`, `ouverture.poser`,
 * `dalle.creer`, `esquisse.ligne`… sont enregistrés dans `index.ts`.
 */
import { longueurAxeMur } from "../geometrie.js";
import type { ModeleAtelier, Occurrence, OccurrenceQuelconque, Propriete, Reference } from "../modele.js";
import { ouverturesDuMur, referencesVers } from "../modele.js";
import { CLASSES, estClasse, estOuverture, LIBELLES_ONTOLOGIE, ontologiesActives, type Classe } from "../ontologie.js";
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
  // Ontologie activable (P2-2, T01) : ses classes n'entrent dans le projet qu'une fois l'ontologie activée.
  if (!ontologiesActives(etat).includes(description.ontologie)) throw new ErreurCommande("precondition", "classe", `${description.libelle} : ontologie « ${LIBELLES_ONTOLOGIE[description.ontologie]} » non activée dans ce projet (ontologie.activer)`);
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
  // R16 : une représentation importée n'a pas de paramètres à éditer — elle se transforme (déplacer, tourner, miroir,
  // échelle, copier) et s'organise (calque, groupe, phase, propriétés), rien de plus.
  if (existant.classe === "objet-importe" && Object.keys(patch).length) throw new ErreurCommande("precondition", "params", "représentation importée : paramètres non modifiables (seules les transformations et l'organisation s'appliquent)");
  // P2-1 : la géométrie d'un solide exact (brep, maillage, volume…) ne se modifie que par une nouvelle opération du
  // noyau, revalidée par le serveur ; ici seuls le nom, la couleur et la pose se changent.
  if (existant.classe === "solide-exact") {
    const interdites = Object.keys(patch).filter((k) => !["nom", "couleur", "position", "angle"].includes(k));
    if (interdites.length) throw new ErreurCommande("precondition", "params", `solide exact : seuls nom, couleur, position et angle se modifient (refusé : ${interdites.join(", ")}) — la géométrie passe par une opération exacte`);
  }
  // P2-2 : la géométrie d'une pièce mécanique est une copie de sa source ; elle se refait par une nouvelle pièce.
  if (existant.classe === "piece-mecanique") {
    const interdites = Object.keys(patch).filter((k) => ["brep", "maillage", "volume", "empreinteBrep", "moteur", "versionMoteur", "emprise"].includes(k));
    if (interdites.length) throw new ErreurCommande("precondition", "params", `pièce mécanique : géométrie non modifiable (refusé : ${interdites.join(", ")}) — créer une nouvelle pièce depuis une autre source`);
  }
  const params = validerParams(etat, existant.classe, { ...(existant.params as unknown as Brut), ...patch });
  const effets0: string[] = [];
  const proprietes = p["proprietes"] === undefined ? existant.proprietes : { ...existant.proprietes, ...lireProprietes(p) };
  const suivant = {
    ...existant,
    params,
    proprietes,
    phase: p["phase"] === undefined ? existant.phase : lire.chaineOuNull(p, "phase"),
    definitionId: p["definitionId"] === undefined ? existant.definitionId : lire.chaineOuNull(p, "definitionId"),
  } as OccurrenceQuelconque;
  if (suivant.definitionId !== null && !etat.definitions[suivant.definitionId]) throw new ErreurCommande("precondition", "definitionId", `définition inconnue : ${suivant.definitionId}`);
  // Changer d'hôte (D-037) : une ouverture suit le niveau de son nouveau mur ; position et largeur sont contrôlées
  // sur ce mur par la validation (l'emprise ne sort jamais du mur hôte).
  if (estOuverture(existant.classe)) {
    const hote = etat.objets[(suivant as Occurrence<"porte">).params.murHoteId]!;
    if (hote.niveauId !== existant.niveauId) (suivant as { niveauId: string | null }).niveauId = hote.niveauId;
    if (hote.niveauId) effets0.push(hote.niveauId);
  }
  const objets = { ...etat.objets, [id]: suivant };
  let problemes = etat.problemes;
  const effets = effetsVides();
  effets.modifies.push(id);
  if (existant.niveauId) effets.niveauxTouches.push(existant.niveauId);
  for (const n of effets0) if (!effets.niveauxTouches.includes(n)) effets.niveauxTouches.push(n);
  // Un mur modifié : les ouvertures dont l'emprise sort du nouvel axe passent « à réparer » (R12), jamais supprimées.
  if (existant.classe === "mur") {
    const m = suivant as Occurrence<"mur">;
    const longueur = longueurAxeMur(m.params); // mur courbe : longueur d'arc (D-095)
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
  // Les contraintes d'esquisse restent et passent « à réparer » (contrôle après commande) ; les autres relations sont retirées.
  const relations = Object.fromEntries(Object.entries(etat.relations).filter(([, r]) => r.kind === "contrainte" || (!ids.includes(r.sourceId) && !ids.includes(r.targetId))));
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
