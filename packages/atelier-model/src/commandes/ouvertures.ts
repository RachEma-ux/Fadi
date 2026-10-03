/**
 * Ouvertures (annexe B, DA-07-02 / 03 / 04) : `ouverture.poser`, `.modifier`, `.deplacer`, `.supprimer`.
 * Contrôle d'emprise dans le mur hôte en précondition de chaque commande ; `distance` = t × longueur du mur,
 * jusqu'au centre de la baie (DA-07-02) : fournie, elle doit être cohérente avec `t`.
 */
import { TOLERANCES } from "../contrats/tolerances.js";
import { CLASSES_BAIE, type ObjetBaie, type ObjetMur } from "../ontologie/classes.js";
import { controlerGrandeur } from "../ontologie/unites.js";
import { controlerEmprise, controlerEnTete, controlerType, estClasseBaie, exigerCibles, fusionnerModifications, nomObjet, nouvelObjet, sansCles, supprimerObjet, avecParams, type Corps } from "./communs.js";
import { longueurSegment } from "./geometrie.js";
import { motif, type Transaction } from "./transaction.js";

/** Mur hôte existant, sur le niveau donné. */
function hote(tx: Transaction, murHoteId: unknown, niveauId: unknown, chemin: string): ObjetMur | null {
  const m = typeof murHoteId === "string" ? tx.objet(murHoteId) : undefined;
  if (!m || m.classe !== "mur") {
    tx.refuser("precondition", chemin, motif(`Mur hôte ${String(murHoteId)}`, "inexistant ou supprimé", "choisir un mur existant"), typeof murHoteId === "string" ? [murHoteId] : []);
    return null;
  }
  if (m.niveauId !== niveauId) {
    tx.refuser("precondition", chemin, motif(nomObjet(m), `sur le niveau ${String(m.niveauId)}, pas sur ${String(niveauId)}`, "choisir un mur du même niveau"), [m.id]);
    return null;
  }
  return m;
}

/** `distance` fournie : unité m et cohérence avec `t` (à `tolCoincidence`). */
function controlerDistance(tx: Transaction, t: number, d: unknown, L: number, chemin: string, objet: string): boolean {
  if (d === undefined) return true;
  const e = controlerGrandeur(d, "m");
  if (e) {
    tx.refuser("unite-invalide", chemin, motif(objet, e, "donner la distance en mètres"));
    return false;
  }
  const v = (d as { value: number }).value;
  if (Math.abs(v - t * L) > TOLERANCES.tolCoincidence) {
    tx.refuser("parametre-invalide", chemin, motif(objet, `distance ${v} m incohérente avec t = ${t} (t × longueur = ${t * L} m)`, "fournir t ou une distance cohérente"));
    return false;
  }
  return true;
}

export const poser: Corps<"ouverture.poser"> = (tx, c) => {
  const p = c.params;
  if (!estClasseBaie(p.classe)) {
    tx.refuser("classe-inconnue", "params.classe", motif("Baie", `classe « ${String(p.classe)} » inconnue`, `choisir ${CLASSES_BAIE.join(", ")}`));
    return;
  }
  if (!controlerEnTete(tx, p)) return;
  const m = hote(tx, p.murHoteId, p.niveauId, "params.murHoteId");
  controlerType(tx, p.classe, p.typeId, "params.typeId");
  if (!m) return;
  const b = nouvelObjet(p.classe, p.id, sansCles(p, ["id", "niveauId", "calqueId", "classe"]) as unknown as ObjetBaie["params"], { niveauId: p.niveauId, calqueId: p.calqueId }) as ObjetBaie;
  if (typeof p.position?.t === "number") controlerDistance(tx, p.position.t, p.position.distance, longueurSegment(m.params.axe), "params.position.distance", nomObjet(b));
  tx.mettre(b);
  controlerEmprise(tx, m.id, "params.position");
};

export const modifier: Corps<"ouverture.modifier"> = (tx, c) => {
  const baies = exigerCibles(tx, c.cibles, CLASSES_BAIE);
  if (!baies) return;
  for (const avant of baies) {
    if (!estClasseBaie(avant.classe)) continue;
    const b = fusionnerModifications(tx, avant as ObjetBaie, c.params.modifications, "params.modifications", ["murHoteId", "position"]);
    if (!b) return;
    if ("typeId" in (c.params.modifications ?? {})) controlerType(tx, b.classe, b.params.typeId, "params.modifications.typeId");
    tx.mettre(b);
    controlerEmprise(tx, b.params.murHoteId, "params.modifications");
  }
};

export const deplacer: Corps<"ouverture.deplacer"> = (tx, c) => {
  const baies = exigerCibles(tx, c.cibles, CLASSES_BAIE, { min: 1, max: 1 });
  const b = baies?.[0] as ObjetBaie | undefined;
  if (!b) return;
  const { murHoteId, t, distance } = c.params;
  if (murHoteId === undefined && t === undefined && distance === undefined) {
    tx.refuser("parametre-invalide", "params", motif(nomObjet(b), "aucun déplacement demandé", "fournir murHoteId, t ou distance"), [b.id]);
    return;
  }
  const m = hote(tx, murHoteId ?? b.params.murHoteId, b.niveauId, murHoteId === undefined ? "cibles[0]" : "params.murHoteId");
  if (!m) return;
  const L = longueurSegment(m.params.axe);
  let tNouveau = b.params.position.t;
  if (t !== undefined) {
    if (typeof t !== "number" || !(t >= 0 && t <= 1)) {
      tx.refuser("parametre-invalide", "params.t", motif(nomObjet(b), `t = ${String(t)} hors de [0, 1]`, "donner une position sur l'axe du mur"), [b.id]);
      return;
    }
    tNouveau = t;
  } else if (distance !== undefined) {
    const e = controlerGrandeur(distance, "m");
    if (e) {
      tx.refuser("unite-invalide", "params.distance", motif(nomObjet(b), e, "donner la distance en mètres"), [b.id]);
      return;
    }
    tNouveau = L === 0 ? Number.NaN : distance.value / L;
    if (!(tNouveau >= 0 && tNouveau <= 1)) {
      tx.refuser("hors-emprise", "params.distance", motif(nomObjet(b), `distance ${distance.value} m hors du mur ${m.id} (longueur ${L} m)`, "choisir une distance sur le mur"), [b.id, m.id]);
      return;
    }
  }
  if (t !== undefined && !controlerDistance(tx, tNouveau, distance, L, "params.distance", nomObjet(b))) return;
  const position =
    distance !== undefined ? { t: tNouveau, distance } : b.params.position.distance === undefined ? { t: tNouveau } : { t: tNouveau, distance: { value: tNouveau * L, unit: "m" as const } };
  const cles = m.id === b.params.murHoteId ? ["position"] : ["position", "murHoteId"];
  tx.mettre(avecParams(b, { position, murHoteId: m.id } as Partial<ObjetBaie["params"]>, cles));
  controlerEmprise(tx, m.id, "params");
};

export const supprimer: Corps<"ouverture.supprimer"> = (tx, c) => {
  const baies = exigerCibles(tx, c.cibles, CLASSES_BAIE);
  if (!baies) return;
  for (const b of baies) supprimerObjet(tx, b.id);
};
