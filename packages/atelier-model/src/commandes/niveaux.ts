/**
 * Niveaux (annexe B) : `niveau.creer`, `niveau.modifier`, `niveau.supprimer`.
 * Suppression refusée si des objets du niveau n'ont pas de destination, ou si un mur s'y appuie (`niveauHaut`) ;
 * un escalier qui le relie n'est pas supprimé implicitement : problème « niveaux reliés absents » (DA-07-10).
 */
import type { IdObjet, ObjetModele, ObjetNiveau } from "../ontologie/classes.js";
import { controlerEmprise, controlerNiveau, controlerIdentifiantLibre, exigerCibles, fusionnerModifications, nomObjet, nouvelObjet, sansCles, supprimerObjet, type Corps } from "./communs.js";
import { motif, type Transaction } from "./transaction.js";

function niveaux(tx: Transaction): ObjetNiveau[] {
  return tx.objets().filter((o): o is ObjetNiveau => o.classe === "niveau");
}

function controlerOrdreUnique(tx: Transaction, n: ObjetNiveau, chemin: string): void {
  const autre = niveaux(tx).find((x) => x.id !== n.id && x.params.ordre === n.params.ordre);
  if (autre) tx.refuser("precondition", chemin, motif(nomObjet(n), `ordre ${n.params.ordre} déjà pris par ${nomObjet(autre)}`, "choisir un ordre libre"), [n.id, autre.id]);
}

const liste = (ids: readonly IdObjet[]): string => (ids.length > 12 ? `${ids.slice(0, 12).join(", ")}… (${ids.length} au total)` : ids.join(", "));

export const creer: Corps<"niveau.creer"> = (tx, c) => {
  if (!controlerIdentifiantLibre(tx, c.params.id, "params.id")) return;
  const n = nouvelObjet("niveau", c.params.id, sansCles(c.params, ["id"]) as unknown as ObjetNiveau["params"]);
  controlerOrdreUnique(tx, n, "params.ordre");
  tx.mettre(n);
};

export const modifier: Corps<"niveau.modifier"> = (tx, c) => {
  const cibles = exigerCibles(tx, c.cibles, ["niveau"], { min: 1, max: 1 });
  const n = cibles?.[0];
  if (!n || n.classe !== "niveau") return;
  const m = fusionnerModifications(tx, n, c.params.modifications, "params.modifications");
  if (!m) return;
  controlerOrdreUnique(tx, m, "params.modifications.ordre");
  tx.mettre(m);
  const altitudeChangee = m.params.elevation.value !== n.params.elevation.value;
  if (altitudeChangee) {
    // Les murs dont la hauteur dépend de ce niveau (niveau porteur ou niveau haut) sont recontrôlés.
    for (const o of tx.objets()) {
      if (o.classe === "mur" && o.params.hauteur === undefined && (o.niveauId === n.id || o.params.niveauHaut === n.id)) controlerEmprise(tx, o.id, "params.modifications.elevation");
      if (o.classe === "escalier" && (o.params.niveauDepartId === n.id || o.params.niveauArriveeId === n.id)) {
        tx.signaler({
          code: "valeur-a-verifier",
          gravite: "avertissement",
          message: `${nomObjet(o)} : l'altitude du niveau relié ${n.id} a changé ; la hauteur à franchir déclarée est à vérifier.`,
          objetIds: [o.id, n.id],
          ...(o.niveauId !== undefined ? { niveauId: o.niveauId } : {}),
        });
      }
    }
  }
};

export const supprimer: Corps<"niveau.supprimer"> = (tx, c) => {
  const cibles = exigerCibles(tx, c.cibles, ["niveau"], { min: 1, max: 1 });
  const n = cibles?.[0];
  if (!n) return;
  const portes = tx.objets().filter((o) => o.niveauId === n.id);
  const appuis = tx.objets().filter((o) => o.classe === "mur" && o.params.niveauHaut === n.id && o.niveauId !== n.id);
  if (appuis.length > 0) {
    tx.refuser(
      "precondition",
      "cibles[0]",
      motif(nomObjet(n), `des murs d'autres niveaux s'y appuient (niveau haut) : ${liste(appuis.map((o) => o.id))}`, "leur donner une hauteur ou un autre niveau haut d'abord"),
      appuis.map((o) => o.id),
    );
    return;
  }
  const destinationId = c.params.niveauDestinationId;
  if (portes.length > 0) {
    if (destinationId === undefined) {
      tx.refuser(
        "precondition",
        "params.niveauDestinationId",
        motif(nomObjet(n), `${portes.length} objet(s) sans destination : ${liste(portes.map((o) => o.id))}`, "indiquer un niveau de destination ou supprimer ces objets d'abord"),
        portes.map((o) => o.id),
      );
      return;
    }
    if (destinationId === n.id) {
      tx.refuser("precondition", "params.niveauDestinationId", motif(nomObjet(n), "le niveau de destination est le niveau supprimé", "choisir un autre niveau"));
      return;
    }
    if (!controlerNiveau(tx, destinationId, "params.niveauDestinationId")) return;
    for (const o of portes) {
      const deplace = { ...o, niveauId: destinationId } as ObjetModele;
      tx.mettre(deplace);
      if (deplace.classe === "mur" && deplace.params.niveauHaut === destinationId) {
        tx.refuser("precondition", "params.niveauDestinationId", motif(nomObjet(deplace), `son niveau haut serait son propre niveau ${destinationId}`, "modifier le mur d'abord"), [deplace.id]);
      }
    }
  }
  for (const o of tx.objets()) {
    if (o.classe === "escalier" && (o.params.niveauDepartId === n.id || o.params.niveauArriveeId === n.id)) {
      tx.signaler({
        code: "niveaux-relies-absents",
        gravite: "avertissement",
        message: `${nomObjet(o)} : le niveau relié ${n.id} est supprimé ; l'escalier n'est ni supprimé ni réaffecté. Action : modifier l'escalier (escalier.modifier).`,
        objetIds: [o.id, n.id],
        ...(o.niveauId !== undefined ? { niveauId: o.niveauId } : {}),
      });
    }
  }
  supprimerObjet(tx, n.id);
};
