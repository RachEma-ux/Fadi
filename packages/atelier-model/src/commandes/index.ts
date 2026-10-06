/**
 * Registre des commandes du contrat `atelier-commands/1` (annexe B du cahier des charges) et application
 * atomique d'un lot : même code dans le navigateur (aperçu) et sur le serveur (validation). L'inverse d'un lot
 * est un instantané différentiel (`interne.restaurer`), appliqué par annuler / rétablir comme une nouvelle
 * microversion.
 */
import { dissocierReseau, modifierReseau } from "./reseau-associatif.js";
import { copier } from "./transformer.js";
import { jumelerOuverture, ouvertureAngle } from "./fenetres.js";
import { creerEscalierHelicoidal, creerEscalierVolees } from "./escaliers.js";
import type { ModeleAtelier, Occurrence, OccurrenceQuelconque } from "../modele.js";
import type { Classe } from "../ontologie.js";
import { estOuverture } from "../ontologie.js";
import { couperContour, longueurAxeMur, unionContoursAdjacents } from "../geometrie.js";
import { referencesVers } from "../modele.js";
import { lire } from "./base.js";
import { validerParams } from "./validation.js";
import {
  appliquerDifferentiel,
  commandeInverse,
  CONTRAT_COMMANDES,
  differentiel,
  effetsVides,
  ErreurCommande,
  fusionnerEffets,
  generateurIds,
  TYPE_RESTAURER,
  type Commande,
  type ContexteCommande,
  type Effets,
  type Enveloppe,
  type InstantaneDiff,
  type Reducteur,
} from "./base.js";
import { reducteursBloc } from "./bloc.js";
import { controlerContraintes, reducteursContrainte } from "./contrainte.js";
import { controlerVerrous, verrouillerObjets } from "./verrous.js";
import { suivreHachures } from "./hachures-associees.js";
import { reducteursDocuments } from "./documents.js";
import { reducteursVues3D } from "./vues3d.js";
import { reducteursReferentiel } from "./referentiels.js";
import { reducteursEnsemble } from "./ensembles.js";
import { definirAltimetrie } from "./altimetrie.js";
import { convertirEsquisse } from "../esquisse/conversion.js";
import { arrondirSommets } from "../esquisse/arrondir.js";
import { affecterZone } from "./zones.js";
import { alignerSelection } from "./transformer.js";
import { tremieEscalier } from "./tremie.js";
import { changerClasse } from "./changer-classe.js";
import { joindreMurs, scinderMur } from "./mur.js";
import { creerOccurrence, modifierOccurrence, supprimerOccurrence } from "./objets.js";
import { affecterClassification, affecterPhase, definirPropriete, rattacherReference, reducteursCalque, reducteursDefinition, reducteursGroupe, reducteursNiveau, reducteursSite, reducteursType, reparerReference } from "./organisation.js";
import { dupliquerNiveau, reducteursTransformer } from "./transformer.js";
import { verifierModele } from "../archive.js";
import { reducteursRefExterne } from "./refexterne.js";

const triplet = (classe: Classe, prefixe: string, creer = "creer"): Record<string, Reducteur> => ({
  [`${prefixe}.${creer}`]: (etat, p, ctx) => creerOccurrence(etat, p, ctx, classe),
  [`${prefixe}.modifier`]: (etat, p, ctx) => modifierOccurrence(etat, p, ctx, classe),
  [`${prefixe}.supprimer`]: (etat, p, ctx) => supprimerOccurrence(etat, p, ctx, classe),
});

const FORMES = ["ligne", "polyligne", "arc", "cercle", "rectangle", "polygone", "spline", "construction", "hachure", "ellipse"] as const;

export const REDUCTEURS: Record<string, Reducteur> = {
  // Objets, générique
  "objet.creer": (etat, p, ctx) => creerOccurrence(etat, p, ctx),
  "objet.modifier": (etat, p, ctx) => modifierOccurrence(etat, p, ctx),
  "objet.supprimer": (etat, p, ctx) => supprimerOccurrence(etat, p, ctx),
  "objet.verrouiller": (etat, p) => verrouillerObjets(etat, p),
  // Niveaux
  "niveau.creer": (etat, p, ctx) => reducteursNiveau.creer(etat, p, ctx),
  "niveau.modifier": (etat, p) => reducteursNiveau.modifier(etat, p),
  "niveau.supprimer": (etat, p, ctx) => reducteursNiveau.supprimer(etat, p, ctx),
  "niveau.dupliquer": (etat, p, ctx) => dupliquerNiveau(etat, p, ctx, (e, q) => reducteursNiveau.creer(e, q, ctx)),
  // Murs
  ...triplet("mur", "mur", "tracer"),
  "mur.scinder": (etat, p, ctx) => scinderMur(etat, p, ctx),
  "mur.joindre": (etat, p, ctx) => joindreMurs(etat, p, ctx),
  // Ouvertures (classe choisie par `classe` : porte / fenetre / ouverture)
  "ouverture.poser": (etat, p, ctx) => {
    const classe = (p["classe"] as Classe | undefined) ?? "ouverture";
    if (classe !== "porte" && classe !== "fenetre" && classe !== "ouverture") throw new ErreurCommande("invalide", "classe", "classe d'ouverture : porte / fenetre / ouverture");
    return creerOccurrence(etat, p, ctx, classe);
  },
  "ouverture.modifier": (etat, p, ctx) => modifierOccurrence(etat, p, ctx, "ouverture"),
  "ouverture.deplacer": (etat, p, ctx) => modifierOccurrence(etat, { id: p["id"], params: { position: p["position"] } }, ctx, "ouverture"),
  "ouverture.supprimer": (etat, p, ctx) => supprimerOccurrence(etat, p, ctx, "ouverture"),
  // Pièces (D-050) : fusionner deux pièces adjacentes d'un même niveau (la première garde son nom, son code et ses
  // propriétés ; la seconde, sans lien, est supprimée) ; scinder une pièce par une droite (la seconde moitié reçoit
  // un nouvel identifiant, le même nom et aucun code — à renseigner). Pièce liée (cote, relation, programme) : refus.
  "piece.fusionner": (etat, p) => {
    const ids = Array.isArray(p["ids"]) ? (p["ids"] as unknown[]) : [];
    if (ids.length !== 2 || !ids.every((x) => typeof x === "string")) throw new ErreurCommande("invalide", "ids", "fusion : deux pièces");
    const [a, b] = (ids as string[]).map((id) => etat.objets[id]) as [OccurrenceQuelconque | undefined, OccurrenceQuelconque | undefined];
    if (!a || !b || a.classe !== "piece" || b.classe !== "piece") throw new ErreurCommande("precondition", "ids", "fusion : deux pièces existantes");
    if (a.niveauId !== b.niveauId) throw new ErreurCommande("precondition", "ids", "fusion : pièces d'un même niveau");
    if (a.params.trous.length || b.params.trous.length) throw new ErreurCommande("precondition", "ids", "fusion : pièces sans trous seulement");
    if (a.params.aireDeclaree || b.params.aireDeclaree) throw new ErreurCommande("precondition", "ids", "une aire déclarée est renseignée : elle ne vaudrait plus après la fusion — la retirer d'abord");
    if (referencesVers(etat, b.id).length || Object.values(etat.relations).some((r) => r.sourceId === b.id || r.targetId === b.id)) throw new ErreurCommande("precondition", "ids", `${b.id} est liée (cote, relation ou programme) : la détacher d'abord`);
    const contour = unionContoursAdjacents(a.params.contour, b.params.contour);
    if (!contour) throw new ErreurCommande("precondition", "ids", "les deux pièces ne partagent pas de côté (ou leur union aurait un trou)");
    const objets = { ...etat.objets, [a.id]: { ...a, params: { ...a.params, contour } } as OccurrenceQuelconque };
    delete objets[b.id];
    const effets = effetsVides();
    effets.modifies.push(a.id);
    effets.supprimes.push(b.id);
    if (a.niveauId) effets.niveauxTouches.push(a.niveauId);
    return { etat: { ...etat, objets }, effets };
  },
  "piece.scinder": (etat, p, ctx) => {
    const id = lire.objet(etat, p, "id");
    const o = etat.objets[id]!;
    if (o.classe !== "piece") throw new ErreurCommande("precondition", "id", `${id} n'est pas une pièce`);
    if (o.params.trous.length) throw new ErreurCommande("precondition", "id", "scission : pièce sans trous seulement");
    if (o.params.aireDeclaree) throw new ErreurCommande("precondition", "id", "une aire déclarée est renseignée : elle ne vaudrait plus après la scission — la retirer d'abord");
    if (referencesVers(etat, id).length) throw new ErreurCommande("precondition", "id", `${id} est visée par une cote : la détacher d'abord`);
    const parts = couperContour(o.params.contour, lire.point(p, "a")!, lire.point(p, "b")!);
    if (!parts) throw new ErreurCommande("precondition", "a", "la droite ne coupe pas la pièce en deux (ou passe par un sommet)");
    const nouvel = lire.chaineOuNull(p, "nouvelId") ?? ctx.ids.nouveau("piece");
    if (etat.objets[nouvel]) throw new ErreurCommande("precondition", "nouvelId", `identifiant déjà utilisé : ${nouvel}`);
    const objets = {
      ...etat.objets,
      [id]: { ...o, params: { ...o.params, contour: parts[0], etiquette: null } } as OccurrenceQuelconque,
      [nouvel]: { ...o, id: nouvel, groupeId: null, proprietes: {}, params: { ...o.params, contour: parts[1], code: null, etiquette: null } } as OccurrenceQuelconque,
    };
    const effets = effetsVides();
    effets.modifies.push(id);
    effets.crees.push(nouvel);
    if (o.niveauId) effets.niveauxTouches.push(o.niveauId);
    return { etat: { ...etat, objets }, effets };
  },
  // Répartir une ouverture le long de son mur (D-047) : `nombre` copies à `entraxe` (m, signé : vers b si positif) ;
  // une copie qui sortirait du mur ou chevaucherait une autre ouverture : refus du lot entier.
  "escalier.volees": (etat, p, ctx) => creerEscalierVolees(etat, p, ctx),
  "escalier.helicoidal": (etat, p, ctx) => creerEscalierHelicoidal(etat, p, ctx),
  "ouverture.jumeler": (etat, p, ctx) => jumelerOuverture(etat, p, ctx),
  "ouverture.angle": (etat, p, ctx) => ouvertureAngle(etat, p, ctx),
  "ouverture.repartir": (etat, p, ctx) => {
    const id = lire.objet(etat, p, "id");
    const o = etat.objets[id]!;
    if (!estOuverture(o.classe)) throw new ErreurCommande("precondition", "id", `${id} n'est pas une ouverture`);
    const ouv = o as Occurrence<"porte">;
    const mur = etat.objets[ouv.params.murHoteId] as Occurrence<"mur">;
    const L = longueurAxeMur(mur.params); // mur courbe : le long de l'arc (D-095)
    const nombre = lire.nombre(p, "nombre", { entier: true, min: 1, max: 100 })!;
    const entraxe = lire.longueur(p, "entraxe")!.value;
    if (Math.abs(entraxe) < ouv.params.largeur.value) throw new ErreurCommande("invalide", "entraxe", "entraxe plus petit que la largeur : les ouvertures se chevaucheraient");
    const intervalles = Object.values(etat.objets).filter((x) => estOuverture(x.classe) && (x as Occurrence<"porte">).params.murHoteId === mur.id).map((x) => { const q = (x as Occurrence<"porte">).params; return [q.position * L - q.largeur.value / 2, q.position * L + q.largeur.value / 2] as const; });
    let courant = etat;
    let effets = effetsVides();
    for (let k = 1; k <= nombre; k++) {
      const c = ouv.params.position * L + k * entraxe;
      const deb = c - ouv.params.largeur.value / 2;
      const fin = c + ouv.params.largeur.value / 2;
      if (deb < -1e-9 || fin > L + 1e-9) throw new ErreurCommande("precondition", "nombre", `copie ${k} : l'emprise sortirait du mur ${mur.id}`);
      if (intervalles.some(([a, b]) => deb < b - 1e-9 && fin > a + 1e-9)) throw new ErreurCommande("precondition", "entraxe", `copie ${k} : chevaucherait une ouverture existante`);
      // Repère numéroté à la suite (« F1 » → « F2 », « F3 »…) quand il se termine par un nombre libre (D-050) ; sinon
      // aucun repère (jamais un doublon).
      const m = ouv.params.repere ? /^(.*?)(\d+)$/.exec(ouv.params.repere) : null;
      const pris = new Set(Object.values(courant.objets).map((x) => (x.params as { repere?: string | null }).repere).filter(Boolean));
      const candidat = m ? `${m[1]}${Number(m[2]) + k}` : null;
      const repere = candidat && !pris.has(candidat) ? candidat : null;
      const r = creerOccurrence(courant, { classe: o.classe, calqueId: o.calqueId, definitionId: o.definitionId, params: { ...ouv.params, repere, position: Math.round((c / L) * 1e9) / 1e9 } }, ctx, o.classe);
      courant = r.etat;
      effets = fusionnerEffets(effets, r.effets);
    }
    return { etat: courant, effets };
  },
  // Changer de classe sur place (D-044) : porte ↔ fenêtre ↔ baie ; dimensions et position gardées, sens d'ouverture
  // retiré hors porte ; mêmes contrôles que la pose.
  "ouverture.changerClasse": (etat, p) => {
    const id = lire.objet(etat, p, "id");
    const o = etat.objets[id]!;
    if (!estOuverture(o.classe)) throw new ErreurCommande("precondition", "id", `${id} n'est pas une ouverture`);
    const classe = lire.enumeration(p, "classe", ["porte", "fenetre", "ouverture"] as const);
    if (classe === o.classe) throw new ErreurCommande("invalide", "classe", `${id} est déjà de classe ${classe}`);
    const calque = o.calqueId ? etat.calques[o.calqueId] : null;
    if (calque?.verrouille) throw new ErreurCommande("precondition", "id", `calque verrouillé : ${calque.nom}`);
    const { ouvrant: _o, ...reste } = (o as Occurrence<"porte">).params;
    void _o;
    const params = validerParams(etat, classe, reste as unknown as Record<string, unknown>);
    const effets = effetsVides();
    effets.modifies.push(id);
    if (o.niveauId) effets.niveauxTouches.push(o.niveauId);
    return { etat: { ...etat, objets: { ...etat.objets, [id]: { ...o, classe, params, definitionId: null } as OccurrenceQuelconque } }, effets };
  },
  // Dalles, toitures, escaliers, pièces, espaces, zones, poteaux, solides
  ...triplet("dalle", "dalle"),
  ...triplet("toiture", "toiture"),
  ...triplet("escalier", "escalier"),
  ...triplet("piece", "piece"),
  ...triplet("espace", "espace"),
  ...triplet("zone", "zone"),
  ...triplet("poteau", "poteau"),
  ...triplet("solide", "solide", "extruder"),
  ...triplet("reference-plan", "referencePlan"),
  ...triplet("garde-corps", "gardeCorps"),
  ...triplet("objet-importe", "objetImporte"),
  // Esquisse : une commande par forme + modifier / supprimer
  ...Object.fromEntries(FORMES.map((forme) => [`esquisse.${forme}`, ((etat, p, ctx) => creerOccurrence(etat, { ...p, params: { ...((p["params"] as Record<string, unknown> | undefined) ?? p), forme } }, ctx, "esquisse")) as Reducteur])),
  "esquisse.modifier": (etat, p, ctx) => modifierOccurrence(etat, p, ctx, "esquisse"),
  "esquisse.supprimer": (etat, p, ctx) => supprimerOccurrence(etat, p, ctx, "esquisse"),
  "esquisse.convertir": (etat, p) => convertirEsquisse(etat, p),
  "esquisse.arrondirSommets": (etat, p) => arrondirSommets(etat, p),
  "zone.affecter": (etat, p, ctx) => affecterZone(etat, p, ctx),
  "escalier.tremie": (etat, p) => tremieEscalier(etat, p),
  "objet.changerClasse": (etat, p) => changerClasse(etat, p),
  // Transformations
  "transformer.deplacer": reducteursTransformer.deplacer,
  "transformer.copier": reducteursTransformer.copier,
  "transformer.tourner": reducteursTransformer.tourner,
  "transformer.miroir": reducteursTransformer.miroir,
  "transformer.echelle": reducteursTransformer.echelle,
  "transformer.etirer": reducteursTransformer.etirer,
  "transformer.ajuster": reducteursTransformer.ajuster,
  "transformer.prolonger": reducteursTransformer.prolonger,
  "transformer.decaler": reducteursTransformer.decaler,
  "transformer.repeter": reducteursTransformer.repeter,
  "transformer.aligner": alignerSelection,
  "transformer.decomposer": reducteursTransformer.decomposer,
  "transformer.joindre": reducteursTransformer.joindre,
  "transformer.pointsDeControle": reducteursTransformer.pointsDeControle,
  "transformer.raccorder": reducteursTransformer.raccorder,
  "transformer.chanfreiner": reducteursTransformer.chanfreiner,
  "transformer.chanfreinerSommet": reducteursTransformer.chanfreinerSommet,
  // Annotations
  ...triplet("cotation", "cotation"),
  "cotation.rattacher": (etat, p, ctx) => rattacherReference(etat, p, ctx),
  ...triplet("texte", "texte"),
  ...triplet("etiquette", "etiquette"),
  // Organisation
  "calque.creer": (etat, p, ctx) => reducteursCalque.creer(etat, p, ctx),
  "calque.modifier": (etat, p) => reducteursCalque.modifier(etat, p),
  "calque.supprimer": (etat, p) => reducteursCalque.supprimer(etat, p),
  "calque.affecter": (etat, p, ctx, c) => reducteursCalque.affecter(etat, p, ctx, c),
  "groupe.creer": (etat, p, ctx, c) => reducteursGroupe.creer(etat, p, ctx, c),
  "reseau.modifier": (etat, p, ctx) => modifierReseau(etat, p, ctx, copier),
  "reseau.dissocier": (etat, p) => dissocierReseau(etat, p),
  "groupe.dissoudre": (etat, p) => reducteursGroupe.dissoudre(etat, p),
  "groupe.modifier": (etat, p) => reducteursGroupe.modifier(etat, p),
  "type.definir": (etat, p, ctx) => reducteursType.definir(etat, p, ctx),
  "type.modifier": (etat, p) => reducteursType.modifier(etat, p),
  "definition.supprimer": (etat, p) => reducteursDefinition.supprimer(etat, p),
  "definition.substituer": (etat, p) => reducteursDefinition.substituer(etat, p),
  "propriete.definir": (etat, p) => definirPropriete(etat, p),
  // Plusieurs objets d'un coup (D-112, classification par règle) : `ids` au lieu de `id`, mêmes contrôles pour chacun.
  "classification.affecter": (etat, p) => {
    if (!Array.isArray(p["ids"])) return affecterClassification(etat, p);
    const ids = (p["ids"] as unknown[]).filter((x): x is string => typeof x === "string");
    if (!ids.length || ids.length > 5000) throw new ErreurCommande("invalide", "ids", "de 1 à 5000 objets");
    let courant = etat;
    let effets = effetsVides();
    for (const id of ids) {
      const r = affecterClassification(courant, { ...p, id });
      courant = r.etat;
      effets = fusionnerEffets(effets, r.effets);
    }
    return { etat: courant, effets };
  },
  "reference.reparer": (etat, p) => reparerReference(etat, p),
  // Documents dérivés (lot 5) : vues et feuilles
  ...reducteursDocuments,
  ...reducteursVues3D,
  ...reducteursReferentiel,
  ...reducteursEnsemble,
  // Blocs et composants, contraintes d'esquisse, phases (lot 5)
  "bloc.definir": (etat, p, ctx) => reducteursBloc.definir(etat, p, ctx),
  "bloc.placer": (etat, p, ctx) => reducteursBloc.placer(etat, p, ctx),
  "contrainte.ajouter": (etat, p, ctx) => reducteursContrainte.ajouter(etat, p, ctx),
  "contrainte.modifier": (etat, p) => reducteursContrainte.modifier(etat, p),
  "contrainte.supprimer": (etat, p) => reducteursContrainte.supprimer(etat, p),
  "phase.affecter": (etat, p, _ctx, c) => affecterPhase(etat, p, c),
  // Site
  "site.parcelle.definir": (etat, p) => reducteursSite.parcelle(etat, p),
  "site.emprise.definir": (etat, p) => reducteursSite.emprise(etat, p),
  "site.altimetrie.definir": (etat, p) => definirAltimetrie(etat, p),
  // Références externes (DA-05-11)
  ...reducteursRefExterne,
  // Réutilisation de modèle (DA-21-09) : ajouts préparés par `planifierReprise`, revalidés comme une archive.
  "modele.reprendre": (etat, p) => reprendreModele(etat, p),
  // Inverse
  [TYPE_RESTAURER]: (etat, p) => {
    const diff = p["diff"] as InstantaneDiff | undefined;
    if (!diff) throw new ErreurCommande("invalide", "diff", "instantané différentiel requis");
    const suivant = appliquerDifferentiel(etat, diff);
    const effets = effetsVides();
    for (const cle of Object.keys(diff.avant) as (keyof InstantaneDiff["avant"])[]) effets.modifies.push(...Object.keys(diff.avant[cle] ?? {}));
    for (const cle of Object.keys(diff.crees) as (keyof InstantaneDiff["crees"])[]) effets.supprimes.push(...(diff.crees[cle] ?? []));
    return { etat: suivant, effets };
  },
};

const TABLES_REPRISE = ["niveaux", "objets", "relations", "definitions", "calques", "groupes", "references"] as const;

function reprendreModele(etat: ModeleAtelier, p: Record<string, unknown>): { etat: ModeleAtelier; effets: Effets } {
  const ajouts = (p["ajouts"] ?? {}) as Partial<Record<(typeof TABLES_REPRISE)[number], Record<string, unknown>>>;
  const site = (p["site"] ?? {}) as Partial<ModeleAtelier["site"]>;
  const fusion = { ...etat, site: { ...etat.site, ...site } } as unknown as Record<string, unknown>;
  const crees: string[] = [];
  for (const cle of TABLES_REPRISE) {
    const t = ajouts[cle] ?? {};
    if (typeof t !== "object" || Array.isArray(t)) throw new ErreurCommande("invalide", `ajouts.${cle}`, "table attendue");
    for (const id of Object.keys(t)) {
      if ((etat[cle] as Record<string, unknown>)[id]) throw new ErreurCommande("precondition", `ajouts.${cle}.${id}`, `identifiant déjà présent : ${id}`);
      crees.push(id);
    }
    fusion[cle] = { ...(etat[cle] as Record<string, unknown>), ...t };
  }
  if (crees.length > 20000) throw new ErreurCommande("invalide", "ajouts", "reprise trop volumineuse (20 000 éléments au plus)");
  // Revalidation complète du modèle obtenu (mêmes validateurs qu'une archive) ; les éléments existants restent inchangés.
  const v = verifierModele(fusion);
  if (!v.ok) throw new ErreurCommande("invalide", "ajouts", `reprise refusée : ${v.erreurs.slice(0, 5).join(" ; ")}`);
  const suivant: ModeleAtelier = { ...etat, site: { ...etat.site, ...site } };
  for (const cle of TABLES_REPRISE) {
    const t = ajouts[cle] ?? {};
    if (!Object.keys(t).length) continue;
    const valides = v.modele[cle] as Record<string, unknown>;
    (suivant as unknown as Record<string, Record<string, unknown>>)[cle] = { ...(etat[cle] as Record<string, unknown>), ...Object.fromEntries(Object.keys(t).map((id) => [id, valides[id]])) };
  }
  const effets = effetsVides();
  effets.crees.push(...crees);
  for (const o of Object.values(ajouts.objets ?? {}) as { niveauId?: string | null }[]) if (o.niveauId && !effets.niveauxTouches.includes(o.niveauId)) effets.niveauxTouches.push(o.niveauId);
  return { etat: suivant, effets };
}

export const TYPES_COMMANDES: readonly string[] = Object.keys(REDUCTEURS);

export function appliquerCommande(etat: ModeleAtelier, commande: Commande, ctx: ContexteCommande): { etat: ModeleAtelier; effets: Effets } {
  const reducteur = REDUCTEURS[commande.type];
  if (!reducteur) throw new ErreurCommande("inconnue", "type", `commande inconnue : ${commande.type}`);
  if (typeof commande.params !== "object" || commande.params === null) throw new ErreurCommande("invalide", "params", "paramètres requis");
  const r = reducteur(etat, commande.params, ctx, commande.cibles ?? []);
  const c0 = controlerContraintes(etat, r.etat, commande.type, r.effets, ctx);
  controlerVerrous(etat, c0.etat, commande.type);
  return commande.type === "interne.restaurer" ? c0 : suivreHachures(c0.etat, c0.effets);
}

export interface ResultatLot {
  etat: ModeleAtelier;
  effets: Effets;
  /** Effets de chaque commande du lot, dans l'ordre. */
  parCommande: Effets[];
  /** Commande inverse (instantané différentiel) : l'appliquer revient à l'état de départ. */
  inverse: Commande;
}

/** Applique un lot de commandes de façon atomique : une erreur laisse l'état de départ intact (immuable). */
export function appliquerLot(etat: ModeleAtelier, enveloppe: Enveloppe): ResultatLot {
  if (enveloppe.contract !== CONTRAT_COMMANDES) throw new ErreurCommande("invalide", "contract", `contrat non pris en charge : ${enveloppe.contract} (attendu ${CONTRAT_COMMANDES})`);
  if (!Array.isArray(enveloppe.commands) || enveloppe.commands.length === 0) throw new ErreurCommande("invalide", "commands", "lot vide");
  if (enveloppe.commands.length > 500) throw new ErreurCommande("invalide", "commands", "lot trop grand (500 commandes maximum)");
  const ctx: ContexteCommande = { ids: generateurIds(enveloppe.requestId) };
  let courant = etat;
  let effets = effetsVides();
  const parCommande: Effets[] = [];
  enveloppe.commands.forEach((commande, i) => {
    try {
      const r = appliquerCommande(courant, commande, ctx);
      courant = r.etat;
      effets = fusionnerEffets(effets, r.effets);
      parCommande.push(r.effets);
    } catch (err) {
      if (err instanceof ErreurCommande) throw new ErreurCommande(err.code, `commands[${i}].${err.chemin}`, `commands[${i}].${err.chemin} : ${err.message}`);
      throw err;
    }
  });
  return { etat: courant, effets, parCommande, inverse: commandeInverse(differentiel(etat, courant)) };
}

/** Identifiants d'objets qu'un lot cible explicitement (pour le calcul des conflits côté serveur). */
export function identifiantsCibles(enveloppe: Enveloppe): string[] {
  const ids = new Set<string>();
  for (const c of enveloppe.commands) {
    for (const k of ["id", "id1", "id2", "murHoteId", "limiteId", "autreId", "objetId", "referenceId", "vueId", "definitionId", "objetA", "objetB", "redefinir", "ancienne", "nouvelle", "zoneId", "dalleId", "murA", "murB", "groupeId", "calqueCible"]) {
      const v = c.params[k];
      if (typeof v === "string") ids.add(v);
    }
    for (const k of ["ajouter", "retirer", "ids"]) {
      const v = c.params[k];
      if (Array.isArray(v)) for (const x of v) if (typeof x === "string") ids.add(x);
    }
    for (const v of c.cibles ?? []) ids.add(v);
    const cibles = c.params["cibles"];
    if (Array.isArray(cibles)) for (const v of cibles) if (typeof v === "string") ids.add(v);
  }
  return [...ids];
}

export { CONTRAT_COMMANDES, ErreurCommande, TYPE_RESTAURER, generateurIds, differentiel, appliquerDifferentiel, commandeInverse };
export type { Commande, Enveloppe, Effets, ContexteCommande, InstantaneDiff, Reducteur };
export { detecterPieces, descendantsCalque, type PropositionPiece } from "./organisation.js";
export { transformerOccurrence } from "./transformer.js";
export { validerParams } from "./validation.js";
