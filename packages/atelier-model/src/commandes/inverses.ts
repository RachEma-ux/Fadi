/**
 * Inverses : tête lisible (type et paramètres d'une commande du catalogue) + restauration exacte.
 *
 * - commande qui ne fait que créer → commande de suppression de la famille (cibles = objets créés) ;
 * - commande qui ne fait que supprimer → commande de création de l'objet principal, paramètres repris de l'objet ;
 * - sinon, même type : `*.modifier` avec les anciennes valeurs, déplacement opposé, rotation opposée, facteur
 *   inverse ; autres transformations : mêmes paramètres.
 * La tête sert à l'historique (libellé, droits) ; c'est la restauration qui redonne l'état exact.
 */
import type { Commande, TypeCommande } from "../contrats/commandes.js";
import type { ClasseObjet, IdObjet, ObjetModele } from "../ontologie/classes.js";
import { sansCles } from "./communs.js";
import type { Transaction } from "./transaction.js";

const SUPPRESSION: Partial<Record<ClasseObjet, TypeCommande>> = {
  niveau: "niveau.supprimer",
  mur: "mur.supprimer",
  porte: "ouverture.supprimer",
  fenetre: "ouverture.supprimer",
  ouverture: "ouverture.supprimer",
  dalle: "dalle.supprimer",
  toiture: "toiture.supprimer",
  escalier: "escalier.supprimer",
  piece: "piece.supprimer",
  espace: "espace.supprimer",
  zone: "zone.supprimer",
  poteau: "poteau.supprimer",
  solide: "solide.supprimer",
  "esquisse.ligne": "esquisse.supprimer",
  "esquisse.polyligne": "esquisse.supprimer",
  "esquisse.arc": "esquisse.supprimer",
  "esquisse.cercle": "esquisse.supprimer",
  "esquisse.rectangle": "esquisse.supprimer",
  "esquisse.polygone": "esquisse.supprimer",
  "esquisse.spline": "esquisse.supprimer",
  "esquisse.construction": "esquisse.supprimer",
  "esquisse.hachure": "esquisse.supprimer",
  cotation: "cotation.supprimer",
  texte: "texte.supprimer",
  etiquette: "etiquette.supprimer",
  calque: "calque.supprimer",
  groupe: "groupe.dissoudre",
};

const commande = (type: TypeCommande, params: unknown, cibles: readonly IdObjet[] = []): Commande => ({ type, params, cibles }) as Commande;

/** Commande de création qui redonnerait l'objet (paramètres canoniques), ou `null` si la classe n'en a pas. */
export function commandeCreationDe(o: ObjetModele, relationsZone: readonly IdObjet[] = []): Commande | null {
  const entete = { id: o.id, ...(o.niveauId !== undefined ? { niveauId: o.niveauId } : {}), ...(o.calqueId !== undefined ? { calqueId: o.calqueId } : {}) };
  switch (o.classe) {
    case "niveau":
      return commande("niveau.creer", { id: o.id, ...o.params });
    case "mur": {
      const { axe, ...p } = o.params;
      return commande("mur.tracer", { ...entete, ...p, a: axe.a, b: axe.b });
    }
    case "porte":
    case "fenetre":
    case "ouverture":
      return commande("ouverture.poser", { ...entete, classe: o.classe, ...o.params });
    case "dalle":
    case "toiture":
    case "escalier":
    case "espace":
    case "poteau":
    case "cotation":
    case "texte":
    case "etiquette":
      return commande(`${o.classe}.creer` as TypeCommande, { ...entete, ...(o.classe === "cotation" ? sansCles(o.params, ["etat"]) : o.params) });
    case "piece":
      return commande("piece.creer", { ...entete, ...sansCles(o.params, ["aireCalculee"]) });
    case "zone":
      return commande("zone.creer", { ...entete, ...o.params, contenu: relationsZone });
    case "solide":
      return commande("solide.extruder", { ...entete, ...o.params });
    case "calque":
      return commande("calque.creer", { id: o.id, ...sansCles(o.params, ["niveauxPresence"]) });
    case "groupe":
      return commande("groupe.creer", { id: o.id, ...(o.params.nom !== undefined ? { nom: o.params.nom } : {}) }, o.params.membres);
    case "parcelle":
      return commande("site.parcelle.definir", { id: o.id, ...o.params });
    case "emprise":
      return commande("site.emprise.definir", { id: o.id, ...o.params });
    default:
      if (o.classe.startsWith("esquisse.")) return commande(o.classe as TypeCommande, { ...entete, ...(o.params as object) });
      return null;
  }
}

/** Tête lisible de l'inverse de `c`, d'après les changements de la transaction. */
export function teteInverse(c: Commande, tx: Transaction): Commande {
  const ch = tx.changements();
  const crees = ch.filter((x) => x.avant === null && x.apres !== null);
  const supprimes = ch.filter((x) => x.avant !== null && x.apres === null);
  const principal = crees[0]?.apres;
  if (ch.length > 0 && crees.length === ch.length && principal) {
    const type = SUPPRESSION[principal.classe];
    if (type) return commande(type, {}, crees.filter((x) => x.apres && SUPPRESSION[x.apres.classe] === type).map((x) => x.id));
  }
  const ancien = supprimes[0]?.avant;
  if (ch.length > 0 && supprimes.length === ch.length && ancien) {
    const contenu = tx.base.relations.filter((r) => r.type === "contient" && r.sourceId === ancien.id).map((r) => r.cibleId);
    const creation = commandeCreationDe(ancien, contenu);
    if (creation) return creation;
  }
  switch (c.type) {
    case "transformer.deplacer":
      return commande(c.type, { vecteur: { dx: -c.params.vecteur.dx, dy: -c.params.vecteur.dy, unit: "m" } }, c.cibles);
    case "transformer.tourner":
      return commande(c.type, { centre: c.params.centre, angle: { value: -c.params.angle.value, unit: "°" } }, c.cibles);
    case "transformer.echelle":
      return commande(c.type, { centre: c.params.centre, facteur: 1 / c.params.facteur }, c.cibles);
    default:
      break;
  }
  if (c.type.endsWith(".modifier") && c.cibles.length > 0) {
    const mods = (c.params as { modifications?: unknown }).modifications;
    const o = tx.base.objets[c.cibles[0] ?? ""];
    if (o && typeof mods === "object" && mods !== null) {
      const anciens: Record<string, unknown> = {};
      for (const k of Object.keys(mods)) {
        const v = (o.params as unknown as Record<string, unknown>)[k];
        // Paramètre absent avant : l'inverse le retire (`null`, D-024).
        anciens[k] = v === undefined ? null : v;
      }
      return commande(c.type, { ...(c.params as object), modifications: anciens }, c.cibles);
    }
  }
  return commande(c.type, c.params, c.cibles);
}
