/**
 * Site (annexe B) : `site.parcelle.definir`, `site.emprise.definir`, émises par la transmission de l'outil
 * Parcelle. Une seule parcelle et une seule emprise par projet : la commande crée l'objet ou remplace ses
 * paramètres (même identifiant). Les sommets cadastraux portent le CRS déclaré de la parcelle (R5) ; les
 * sommets locaux ne viennent que d'une conversion explicite faite en amont (domain-model), jamais ici.
 */
import type { ClasseObjet, IdObjet, ObjetModele } from "../ontologie/classes.js";
import { controlerIdentifiantLibre, marquerSaisie, nomObjet, nouvelObjet, sansCles, type Corps } from "./communs.js";
import { motif, type Transaction } from "./transaction.js";

function definir(tx: Transaction, classe: "parcelle" | "emprise", id: IdObjet, params: Record<string, unknown>): void {
  const existant = tx.objets().find((o) => o.classe === classe);
  if (existant && existant.id !== id) {
    tx.refuser("precondition", "params.id", motif(nomObjet(existant), `le projet a déjà une ${classe}`, `redéfinir ${existant.id} (même identifiant)`), [existant.id]);
    return;
  }
  const actuel = tx.objet(id);
  if (actuel && actuel.classe !== classe) {
    tx.refuser("precondition", "params.id", motif(nomObjet(actuel), `identifiant déjà porté par un objet de classe ${actuel.classe}`, "choisir un autre identifiant"), [id]);
    return;
  }
  if (!actuel) {
    if (!controlerIdentifiantLibre(tx, id, "params.id")) return;
    tx.mettre(nouvelObjet(classe as ClasseObjet, id, params as never) as ObjetModele);
    return;
  }
  const cles = [...new Set([...Object.keys(actuel.params), ...Object.keys(params)])];
  tx.mettre(marquerSaisie({ ...actuel, params } as ObjetModele, cles));
}

function controlerCrs(tx: Transaction, crs: unknown, points: unknown, chemin: string): boolean {
  if (!Array.isArray(points)) return true;
  const i = points.findIndex((p: unknown) => typeof p === "object" && p !== null && (p as { crs?: unknown }).crs !== crs);
  if (i >= 0) {
    tx.refuser("repere-melange", `${chemin}[${i}]`, motif("Parcelle", `sommet ${i} dans un autre CRS que « ${String(crs)} »`, "convertir explicitement les sommets dans le CRS déclaré"));
    return false;
  }
  return true;
}

export const parcelleDefinir: Corps<"site.parcelle.definir"> = (tx, c) => {
  const p = c.params;
  if (!controlerCrs(tx, p.crs, p.sommetsCadastraux, "params.sommetsCadastraux")) return;
  if (!controlerCrs(tx, p.crs, p.enveloppeRecul, "params.enveloppeRecul")) return;
  definir(tx, "parcelle", p.id, sansCles(p, ["id"]));
};

export const empriseDefinir: Corps<"site.emprise.definir"> = (tx, c) => {
  const p = c.params;
  const parcelle = tx.objets().find((o) => o.classe === "parcelle");
  if (parcelle?.classe === "parcelle" && !controlerCrs(tx, parcelle.params.crs, p.sommetsCadastraux, "params.sommetsCadastraux")) return;
  definir(tx, "emprise", p.id, sansCles(p, ["id"]));
};
