/**
 * Moteur des commandes `atelier-commands/1` : table des réducteurs (`TableReducteurs`), contrôles communs,
 * restauration exacte (inverse), effets, application atomique d'un lot (`AppliquerLot`).
 *
 * Contrôles communs à toute commande, après son corps :
 * - chaque objet posé est validé contre l'ontologie (`validerObjet` : classe, paramètres, unités, repères,
 *   provenance et statut) ;
 * - niveau et calque cités existants ; aucun objet touché sur un calque verrouillé (DA-05-01) ;
 * - toute relation ajoutée est admise entre les classes de ses extrémités (`relationAdmise`).
 * Un réducteur ne touche jamais `revision` ; ceux de `REDUCTEURS` recalculent l'empreinte de l'état rendu ;
 * `appliquerLot` la calcule une fois, en fin de lot, et incrémente la révision d'une unité.
 */
import type { Commande, CommandeDeType, TypeCommande } from "../contrats/commandes.js";
import type { Effets, EffetVue } from "../contrats/effets.js";
import { CONTRAT_COMMANDES, TYPES_COMMANDE, type EnveloppeCommandes } from "../contrats/enveloppe.js";
import type { EtatModele } from "../contrats/etat.js";
import type { CodeProbleme, Probleme } from "../contrats/probleme.js";
import type { ErreurCommande, Reducteur, ResultatLot, ResultatReducteur, TableReducteurs } from "../contrats/reducteurs.js";
import type { IdObjet, ObjetModele } from "../ontologie/classes.js";
import { descripteur } from "../ontologie/descripteurs.js";
import type { Relation } from "../ontologie/relations.js";
import { relationAdmise } from "../ontologie/relations.js";
import { validerObjet } from "../ontologie/validation.js";
import * as annotations from "./annotations.js";
import { nomObjet, type Corps } from "./communs.js";
import { detecter } from "./detection.js";
import { calculerEmpreinte, empreinteValeur } from "./empreinte.js";
import * as esquisses from "./esquisses.js";
import { teteInverse } from "./inverses.js";
import * as murs from "./murs.js";
import * as niveaux from "./niveaux.js";
import * as objets from "./objets.js";
import * as organisation from "./organisation.js";
import * as ouvertures from "./ouvertures.js";
import * as site from "./site.js";
import * as tr from "./transformations.js";
import { cleRelation, motif, restaurationDe, sansRestauration, Transaction, VERSION_RESTAURATION, type Restauration } from "./transaction.js";

/** Corps de réducteur par type de commande (exhaustif à la compilation). */
const CORPS: { readonly [T in TypeCommande]: Corps<T> } = {
  "niveau.creer": niveaux.creer,
  "niveau.modifier": niveaux.modifier,
  "niveau.supprimer": niveaux.supprimer,
  "mur.tracer": murs.tracer,
  "mur.modifier": murs.modifier,
  "mur.scinder": murs.scinder,
  "mur.joindre": murs.joindre,
  "mur.supprimer": murs.supprimer,
  "ouverture.poser": ouvertures.poser,
  "ouverture.modifier": ouvertures.modifier,
  "ouverture.deplacer": ouvertures.deplacer,
  "ouverture.supprimer": ouvertures.supprimer,
  "dalle.creer": objets.dalleCreer,
  "dalle.modifier": objets.dalleModifier,
  "dalle.supprimer": objets.dalleSupprimer,
  "toiture.creer": objets.toitureCreer,
  "toiture.modifier": objets.toitureModifier,
  "toiture.supprimer": objets.toitureSupprimer,
  "escalier.creer": objets.escalierCreer,
  "escalier.modifier": objets.escalierModifier,
  "escalier.supprimer": objets.escalierSupprimer,
  "piece.detecter": detecter,
  "piece.creer": objets.pieceCreer,
  "piece.modifier": objets.pieceModifier,
  "piece.supprimer": objets.pieceSupprimer,
  "espace.creer": objets.espaceCreer,
  "espace.modifier": objets.espaceModifier,
  "espace.supprimer": objets.espaceSupprimer,
  "zone.creer": objets.zoneCreer,
  "zone.modifier": objets.zoneModifier,
  "zone.supprimer": objets.zoneSupprimer,
  "poteau.creer": objets.poteauCreer,
  "poteau.modifier": objets.poteauModifier,
  "poteau.supprimer": objets.poteauSupprimer,
  "solide.extruder": objets.solideExtruder,
  "solide.modifier": objets.solideModifier,
  "solide.supprimer": objets.solideSupprimer,
  "esquisse.ligne": esquisses.ligne,
  "esquisse.polyligne": esquisses.polyligne,
  "esquisse.arc": esquisses.arc,
  "esquisse.cercle": esquisses.cercle,
  "esquisse.rectangle": esquisses.rectangle,
  "esquisse.polygone": esquisses.polygone,
  "esquisse.spline": esquisses.spline,
  "esquisse.construction": esquisses.construction,
  "esquisse.hachure": esquisses.hachure,
  "esquisse.modifier": esquisses.modifier,
  "esquisse.supprimer": esquisses.supprimer,
  "transformer.deplacer": tr.deplacer,
  "transformer.copier": tr.copier,
  "transformer.tourner": tr.tourner,
  "transformer.miroir": tr.miroir,
  "transformer.echelle": tr.mettreAEchelle,
  "transformer.etirer": tr.etirer,
  "transformer.ajuster": tr.ajuster,
  "transformer.prolonger": tr.prolonger,
  "transformer.decaler": tr.decaler,
  "transformer.repeter": tr.repeter,
  "transformer.decomposer": tr.decomposer,
  "transformer.pointsDeControle": tr.pointsDeControle,
  "cotation.creer": annotations.cotationCreer,
  "cotation.modifier": annotations.cotationModifier,
  "cotation.rattacher": annotations.cotationRattacher,
  "cotation.supprimer": annotations.cotationSupprimer,
  "texte.creer": annotations.texteCreer,
  "texte.modifier": annotations.texteModifier,
  "texte.supprimer": annotations.texteSupprimer,
  "etiquette.creer": annotations.etiquetteCreer,
  "etiquette.modifier": annotations.etiquetteModifier,
  "etiquette.supprimer": annotations.etiquetteSupprimer,
  "calque.creer": organisation.calqueCreer,
  "calque.modifier": organisation.calqueModifier,
  "calque.reordonner": organisation.calqueReordonner,
  "calque.affecter": organisation.calqueAffecter,
  "calque.supprimer": organisation.calqueSupprimer,
  "groupe.creer": organisation.groupeCreer,
  "groupe.dissoudre": organisation.groupeDissoudre,
  "bloc.definir": organisation.blocDefinir,
  "bloc.placer": organisation.blocPlacer,
  "type.definir": organisation.typeDefinir,
  "type.modifier": organisation.typeModifier,
  "propriete.definir": organisation.proprieteDefinir,
  "classification.affecter": organisation.classificationAffecter,
  "reference.reparer": annotations.reparer,
  "site.parcelle.definir": site.parcelleDefinir,
  "site.emprise.definir": site.empriseDefinir,
};

// --- Contrôles communs ----------------------------------------------------------

function codeValidation(message: string): CodeProbleme {
  if (/unité/.test(message)) return "unite-invalide";
  if (/repère|coordonnée|frame/.test(message)) return "repere-melange";
  if (/classe inconnue/.test(message)) return "classe-inconnue";
  return "parametre-invalide";
}

function controlesCommuns(tx: Transaction): void {
  const verrouille = (calqueId: IdObjet | undefined): ObjetModele | null => {
    if (calqueId === undefined) return null;
    const k = tx.objet(calqueId) ?? tx.base.objets[calqueId];
    return k?.classe === "calque" && k.params.verrouille ? k : null;
  };
  for (const { id, avant, apres } of tx.changements()) {
    for (const o of [avant, apres]) {
      const k = verrouille(o?.calqueId);
      if (o && k) {
        tx.refuser("calque-verrouille", "cibles", motif(nomObjet(o), `sur le calque verrouillé « ${k.classe === "calque" ? k.params.nom : k.id} »`, "déverrouiller le calque (calque.modifier) ou retirer l'objet"), [o.id, k.id]);
        break;
      }
    }
    if (!apres) continue;
    for (const e of validerObjet(apres)) tx.refuser(codeValidation(e.message), e.chemin, motif(nomObjet(apres), e.message, "corriger la valeur"), [id]);
    const d = descripteur(apres.classe);
    if (d.porteNiveau && apres.niveauId !== undefined && tx.objet(apres.niveauId)?.classe !== "niveau") {
      tx.refuser("precondition", "niveauId", motif(nomObjet(apres), `niveau ${apres.niveauId} inexistant`, "choisir un niveau existant"), [id]);
    }
    if (apres.calqueId !== undefined && tx.objet(apres.calqueId)?.classe !== "calque") {
      tx.refuser("precondition", "calqueId", motif(nomObjet(apres), `calque ${apres.calqueId} inexistant`, "choisir un calque existant"), [id]);
    }
  }
  for (const r of tx.relationsAjoutees()) {
    const s = tx.objet(r.sourceId);
    const c = tx.objet(r.cibleId);
    if (!s || !c || !relationAdmise(r.type, s.classe, c.classe)) {
      tx.refuser("precondition", "relations", motif(`Relation ${r.type} ${r.sourceId} → ${r.cibleId}`, s && c ? `non admise entre ${s.classe} et ${c.classe}` : "extrémité inexistante", "corriger la commande"), [r.sourceId, r.cibleId]);
    }
  }
}

// --- Restauration ------------------------------------------------------------------

function appliquerRestauration(tx: Transaction, r: Restauration): void {
  if (typeof r !== "object" || r === null || r.version !== VERSION_RESTAURATION || !Array.isArray(r.objets) || !Array.isArray(r.relationsARetirer) || !Array.isArray(r.relationsARajouter)) {
    tx.refuser("parametre-invalide", "restauration", motif("Annulation", "restauration mal formée ou de version inconnue", "régénérer l'inverse depuis la commande d'origine"));
    return;
  }
  r.objets.forEach((x, i) => {
    const actuel = tx.objet(x.id);
    const empreinte = actuel ? empreinteValeur(actuel) : null;
    if (empreinte !== x.apres) {
      tx.refuser("precondition", `restauration.objets[${i}]`, motif(`Objet ${x.id}`, "modifié depuis la commande d'origine", "annuler d'abord les commandes plus récentes, ou recharger le modèle"), [x.id]);
    }
    if (x.avant !== null && x.avant.id !== x.id) tx.refuser("parametre-invalide", `restauration.objets[${i}]`, motif(`Objet ${x.id}`, "identifiant incohérent dans la restauration", "régénérer l'inverse"), [x.id]);
  });
  for (const rel of r.relationsARetirer) {
    if (!tx.aRelation(rel)) tx.refuser("precondition", "restauration.relations", motif(`Relation ${rel.type} ${rel.sourceId} → ${rel.cibleId}`, "absente", "recharger le modèle"), [rel.sourceId, rel.cibleId]);
  }
  if (r.catalogue && empreinteValeur(tx.catalogue()) !== r.catalogue.apres) {
    tx.refuser("precondition", "restauration.catalogue", motif("Catalogue de types", "modifié depuis la commande d'origine", "annuler d'abord les commandes plus récentes"));
  }
  if (tx.refusee) return;
  for (const x of r.objets) tx.poserBrut(x.id, x.avant);
  for (const rel of r.relationsARetirer) tx.retirerRelation(rel);
  for (const rel of r.relationsARajouter) tx.ajouterRelation(rel);
  for (const id of r.supprimesARetirer) tx.retirerSupprime(id);
  for (const id of r.supprimesARajouter) tx.ajouterSupprime(id);
  if (r.catalogue) tx.definirCatalogue(r.catalogue.avant);
}

// --- Effets ----------------------------------------------------------------------

const CLASSES_3D = new Set(["niveau", "mur", "porte", "fenetre", "ouverture", "dalle", "toiture", "escalier", "poteau", "solide"]);
const CLASSES_QUANTITES = new Set(["mur", "porte", "fenetre", "ouverture", "dalle", "toiture", "escalier", "poteau", "piece", "espace", "zone"]);

interface Changement {
  readonly id: IdObjet;
  readonly avant: ObjetModele | null;
  readonly apres: ObjetModele | null;
}

function construireEffets(
  changements: readonly Changement[],
  relationsAjoutees: readonly Relation[],
  relationsRetirees: readonly Relation[],
  catalogueChange: boolean,
  problemes: readonly Probleme[],
  referencesTouchees: Effets["referencesTouchees"],
): Effets {
  const vues = new Map<string, EffetVue>();
  const vue = (nature: EffetVue["nature"], niveauId?: IdObjet) => vues.set(`${nature}|${niveauId ?? ""}`, niveauId === undefined ? { nature, etat: "a-recalculer" } : { nature, niveauId, etat: "a-recalculer" });
  for (const { avant, apres } of changements) {
    for (const o of [avant, apres]) {
      if (!o) continue;
      if (o.classe === "niveau") vue("plan-niveau", o.id);
      else if (o.niveauId !== undefined) vue("plan-niveau", o.niveauId);
      else if (o.classe === "calque" || o.classe === "groupe") vue("plan-niveau");
      if (CLASSES_3D.has(o.classe)) {
        vue("vue-3d");
        vue("coupe");
        vue("facade");
      }
      if (CLASSES_QUANTITES.has(o.classe)) {
        vue("nomenclature");
        vue("metre");
      }
    }
    if (avant && apres && (avant.proprietes !== apres.proprietes || avant.classifications !== apres.classifications)) vue("nomenclature");
  }
  if (catalogueChange) vue("nomenclature");
  const change = changements.length > 0 || relationsAjoutees.length > 0 || relationsRetirees.length > 0 || catalogueChange;
  return {
    objetsCrees: changements.filter((x) => !x.avant && x.apres).map((x) => x.id),
    objetsModifies: changements.filter((x) => x.avant && x.apres).map((x) => x.id),
    objetsSupprimes: changements.filter((x) => x.avant && !x.apres).map((x) => x.id),
    relationsAjoutees: [...relationsAjoutees],
    relationsRetirees: [...relationsRetirees],
    referencesTouchees: [...referencesTouchees],
    vues: [...vues.values()],
    documents: change ? [{ nature: "documents-derives", etat: "perime" }] : [],
    problemes: [...problemes],
  };
}

// --- Exécution d'une commande ----------------------------------------------------

/** Résultat interne : l'état rendu garde l'empreinte d'entrée (recalculée par l'appelant). */
type ResultatInterne = { readonly ok: true; readonly etat: EtatModele; readonly inverse: readonly Commande[]; readonly effets: Effets; readonly changements: readonly Changement[] } | { readonly ok: false; readonly erreurs: readonly ErreurCommande[] };

function estTypeCommande(t: unknown): t is TypeCommande {
  return typeof t === "string" && (TYPES_COMMANDE as readonly string[]).includes(t);
}

function executer(etat: EtatModele, c: Commande): ResultatInterne {
  if (typeof c !== "object" || c === null || !estTypeCommande((c as { type?: unknown }).type)) {
    return { ok: false, erreurs: [{ code: "parametre-invalide", chemin: "type", message: motif("Commande", `type « ${String((c as { type?: unknown } | null)?.type)} » absent du contrat atelier-commands/1`, "utiliser un type du catalogue") }] };
  }
  if (typeof c.params !== "object" || c.params === null || !Array.isArray(c.cibles)) {
    return { ok: false, erreurs: [{ code: "parametre-invalide", chemin: "params", message: motif(`Commande ${c.type}`, "params (objet) et cibles (liste) obligatoires", "compléter la commande") }] };
  }
  const tx = new Transaction(etat);
  const restauration = restaurationDe(c);
  try {
    if (restauration !== undefined) appliquerRestauration(tx, restauration);
    else (CORPS[c.type] as Corps<TypeCommande>)(tx, c as CommandeDeType<TypeCommande>);
  } catch (e) {
    // Données reçues mal formées au point de faire échouer un calcul : refus motivé, jamais d'état partiel.
    tx.refuser("parametre-invalide", "params", motif(`Commande ${c.type}`, `données inexploitables (${e instanceof Error ? e.message : String(e)})`, "vérifier la forme des paramètres"));
  }
  if (!tx.refusee) controlesCommuns(tx);
  if (tx.refusee) return { ok: false, erreurs: tx.erreurs };
  const { etat: suivant, restauration: r } = tx.conclure(c);
  const changements = tx.changements();
  const inverse: Commande[] = tx.estVide() ? [] : [{ ...(restauration !== undefined ? restauration.origine : teteInverse(sansRestauration(c), tx)), restauration: r } as unknown as Commande];
  const effets = construireEffets(changements, tx.relationsAjoutees(), tx.relationsRetirees(), tx.catalogueChange(), tx.problemes, tx.referencesTouchees);
  return { ok: true, etat: suivant, inverse, effets, changements };
}

/** Applique une commande (réducteur pur, empreinte recalculée, révision inchangée). */
export function appliquerCommande(etat: EtatModele, c: Commande): ResultatReducteur {
  const r = executer(etat, c);
  if (!r.ok) return r;
  return { ok: true, etat: { ...r.etat, empreinte: calculerEmpreinte(r.etat) }, inverse: r.inverse, effets: r.effets };
}

function table(): TableReducteurs {
  const t: Partial<Record<TypeCommande, Reducteur>> = {};
  for (const type of TYPES_COMMANDE) t[type] = (etat, c) => appliquerCommande(etat, c);
  return t as TableReducteurs;
}

/** Table des réducteurs du contrat `atelier-commands/1` (un par type). */
export const REDUCTEURS: TableReducteurs = table();

// --- Lot --------------------------------------------------------------------------

function prefixer(erreurs: readonly ErreurCommande[], i: number): ErreurCommande[] {
  return erreurs.map((e) => ({ ...e, chemin: e.chemin === "" ? `commands[${i}]` : `commands[${i}].${e.chemin}` }));
}

/**
 * Applique une enveloppe : contrat et `baseRevision` contrôlés, commandes appliquées dans l'ordre, tout ou
 * rien ; révision + 1 ; empreinte recalculée ; inverse du lot (inverses des commandes, ordre inverse) ;
 * effets agrégés (changement net du lot).
 */
export function appliquerLot(etat: EtatModele, enveloppe: EnveloppeCommandes): ResultatLot {
  const e = enveloppe as Partial<EnveloppeCommandes> | null;
  if (typeof e !== "object" || e === null) return { ok: false, erreurs: [{ code: "parametre-invalide", chemin: "", message: motif("Enveloppe", "objet attendu", "envoyer une enveloppe atelier-commands/1") }] };
  if (e.contract !== CONTRAT_COMMANDES) {
    return { ok: false, erreurs: [{ code: "parametre-invalide", chemin: "contract", message: motif("Enveloppe", `contrat « ${String(e.contract)} » non pris en charge`, `envoyer « ${CONTRAT_COMMANDES} »`) }] };
  }
  if (typeof e.requestId !== "string" || e.requestId.trim() === "") {
    return { ok: false, erreurs: [{ code: "parametre-invalide", chemin: "requestId", message: motif("Enveloppe", "requestId absent", "fournir un identifiant de requête (UUID)") }] };
  }
  if (typeof e.label !== "string") return { ok: false, erreurs: [{ code: "parametre-invalide", chemin: "label", message: motif("Enveloppe", "libellé absent", "fournir un libellé d'historique") }] };
  if (e.baseRevision !== etat.revision) {
    return {
      ok: false,
      erreurs: [{ code: "conflit-revision", chemin: "baseRevision", message: motif("Enveloppe", `révision de base ${String(e.baseRevision)} périmée (révision courante ${etat.revision})`, "recharger le modèle et rejouer les commandes") }],
    };
  }
  if (!Array.isArray(e.commands) || e.commands.length === 0) {
    return { ok: false, erreurs: [{ code: "parametre-invalide", chemin: "commands", message: motif("Enveloppe", "aucune commande", "envoyer au moins une commande") }] };
  }
  let courant = etat;
  const inverses: Commande[][] = [];
  const problemes: Probleme[] = [];
  const references: Effets["referencesTouchees"][number][] = [];
  const touches = new Set<IdObjet>();
  for (let i = 0; i < e.commands.length; i++) {
    const r = executer(courant, e.commands[i] as Commande);
    if (!r.ok) return { ok: false, erreurs: prefixer(r.erreurs, i) };
    courant = r.etat;
    inverses.push([...r.inverse]);
    for (const x of r.changements) touches.add(x.id);
    problemes.push(...r.effets.problemes.map((p) => (p.chemin === undefined ? p : { ...p, chemin: `commands[${i}].${p.chemin}` })));
    references.push(...r.effets.referencesTouchees);
  }
  // Changement net du lot (un objet créé puis supprimé dans le même lot n'apparaît pas).
  const changements: Changement[] = [];
  for (const id of touches) {
    const avant = Object.prototype.hasOwnProperty.call(etat.objets, id) ? (etat.objets[id] ?? null) : null;
    const apres = Object.prototype.hasOwnProperty.call(courant.objets, id) ? (courant.objets[id] ?? null) : null;
    if (avant === apres || (avant && apres && empreinteValeur(avant) === empreinteValeur(apres))) continue;
    changements.push({ id, avant, apres });
  }
  const cles = (rs: readonly Relation[]) => new Map(rs.map((r) => [cleRelation(r), r]));
  const initiales = cles(etat.relations);
  const finales = cles(courant.relations);
  const ajoutees = [...finales].filter(([k]) => !initiales.has(k)).map(([, r]) => r);
  const retirees = [...initiales].filter(([k]) => !finales.has(k)).map(([, r]) => r);
  const catalogueChange = empreinteValeur(etat.catalogue) !== empreinteValeur(courant.catalogue);
  const effets = construireEffets(changements, ajoutees, retirees, catalogueChange, problemes, references);
  const final: EtatModele = { ...courant, revision: etat.revision + 1, empreinte: calculerEmpreinte(courant) };
  return { ok: true, etat: final, inverse: inverses.reverse().flat(), effets };
}

/** Enveloppe d'annulation d'un lot appliqué : inverse du lot, sur la révision produite. */
export function enveloppeInverse(lot: EnveloppeCommandes, inverse: readonly Commande[], revision: number, requestId: string): EnveloppeCommandes {
  return { requestId, baseRevision: revision, contract: CONTRAT_COMMANDES, label: `Annuler : ${lot.label}`, commands: inverse };
}

/** État vide d'un projet (aucune valeur par défaut, R3) ; empreinte calculée. */
export function etatVide(projetId: string, versionOntologie: number): EtatModele {
  const base = { projetId, revision: 0, versionOntologie, objets: {}, relations: [], catalogue: { version: 0, definitions: {} }, proprietesProjet: [], supprimes: [] };
  return { ...base, empreinte: calculerEmpreinte(base) };
}
