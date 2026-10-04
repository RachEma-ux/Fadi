/**
 * Modèle de l'inspecteur (L3a.1) : choix des champs (descripteur enregistré ou repli générique) et préparation d'une
 * modification saisie (lecture, contrôle, commandes, contrôle à blanc). Module pur ; la validation est faite par le
 * composant avec `ctx.valider`.
 */
import type { Commande, ObjetModele } from "@parcours/atelier-model";
import type { ChampInspecteur, ContexteAtelier, ErreurLisible, RegistreInspecteur } from "../socle";
import { lireNombre, lisible } from "./format";
import { champsGeneriques, valeurInchangee } from "./inspecteur-generique";
import { libelleObjet } from "./navigateur";

const champErreur = (message: string): ChampInspecteur => ({
  cle: "__erreur",
  libelle: "Descripteur de l'inspecteur",
  type: "texte",
  valeur: `en échec (${message}) — affichage générique de l'ontologie`,
  lectureSeule: true,
  controler: () => null,
  commandes: () => [],
});

/** Champs d'un objet : descripteur de sa classe s'il existe, sinon repli générique ; un descripteur en panne est annoncé. */
export function champsInspecteur(registre: RegistreInspecteur, objet: ObjetModele, ctx: ContexteAtelier): readonly ChampInspecteur[] {
  const d = registre.pour(objet.classe);
  if (!d) return champsGeneriques(objet, libelleObjet(objet));
  try {
    return d.champs(objet, ctx);
  } catch (e) {
    return [champErreur(e instanceof Error ? e.message : String(e)), ...champsGeneriques(objet, libelleObjet(objet))];
  }
}

/** Saisie brute du composant : texte d'un champ, choix d'une liste, case à cocher. */
export type Saisie = { readonly texte: string } | { readonly booleen: boolean };

export type Preparation =
  | { readonly etat: "inchange" }
  | { readonly etat: "refus"; readonly erreurs: readonly ErreurLisible[] }
  | { readonly etat: "pret"; readonly label: string; readonly commandes: readonly Commande[] };

/** Saisie → valeur selon la convention des champs (nombre dans `unite`, texte, booléen, `null` = vidé). */
export function lireSaisie(champ: ChampInspecteur, saisie: Saisie): { ok: true; valeur: unknown } | { ok: false; erreur: ErreurLisible } {
  if ("booleen" in saisie) return { ok: true, valeur: saisie.booleen };
  switch (champ.type) {
    case "longueur":
    case "angle":
    case "aire":
    case "nombre": {
      const r = lireNombre(saisie.texte, champ.unite ?? "", champ.libelle);
      return r.ok ? { ok: true, valeur: r.valeur } : r;
    }
    case "booleen":
      return saisie.texte === "" ? { ok: true, valeur: null } : { ok: true, valeur: saisie.texte === "true" || saisie.texte === "oui" };
    default:
      return { ok: true, valeur: saisie.texte === "" ? null : saisie.texte };
  }
}

/**
 * Cycle d'une modification dans l'inspecteur (§5.8) : lecture de la saisie, rien si inchangée, contrôle du champ,
 * commandes, contrôle à blanc local (`ctx.essayer`, même réducteur que le serveur). Erreurs « objet, cause, action ».
 */
export function preparerModification(champ: ChampInspecteur, saisie: Saisie, objet: ObjetModele, ctx: Pick<ContexteAtelier, "essayer" | "ecriture">): Preparation {
  if (champ.lectureSeule) return { etat: "refus", erreurs: [lisible(champ.libelle, "en lecture seule", "utiliser l'outil adapté de la zone de travail")] };
  if (!ctx.ecriture.permise) return { etat: "refus", erreurs: [lisible("Projet", ctx.ecriture.motif, "ouvrir une copie de travail ou demander l'accès")] };
  const lu = lireSaisie(champ, saisie);
  if (!lu.ok) return { etat: "refus", erreurs: [lu.erreur] };
  if (valeurInchangee(champ, lu.valeur)) return { etat: "inchange" };
  let erreur: ErreurLisible | null;
  let commandes: readonly Commande[];
  try {
    erreur = champ.controler(lu.valeur);
    commandes = erreur ? [] : champ.commandes(lu.valeur);
  } catch (e) {
    return { etat: "refus", erreurs: [lisible(champ.libelle, `contrôle en échec : ${e instanceof Error ? e.message : String(e)}`, "signaler le problème ; rien n'a été modifié")] };
  }
  if (erreur) return { etat: "refus", erreurs: [erreur] };
  if (commandes.length === 0) return { etat: "refus", erreurs: [lisible(champ.libelle, "aucune commande de modification", "utiliser l'outil adapté de la zone de travail")] };
  const essai = ctx.essayer(commandes);
  if (!essai.ok) return { etat: "refus", erreurs: essai.erreurs };
  return { etat: "pret", label: `${champ.libelle} · ${libelleObjet(objet)}`, commandes };
}
