/**
 * Murs (annexe B, DA-07-01) : `mur.tracer`, `mur.modifier`, `mur.scinder`, `mur.joindre`, `mur.supprimer`.
 *
 * - les baies suivent leur mur (`distance` conservée sur `mur.modifier`, centre conservé sur une scission ou
 *   une jonction) ; une baie qui sortirait de l'emprise fait refuser la commande avec la liste ;
 * - scission : deux nouveaux murs, une baie à cheval bloque la commande ; les références à l'ancien mur
 *   passent « à réparer » avec propositions (R12) ;
 * - jonction (contrat : « deux murs colinéaires et contigus ») : un nouveau mur, paramètres identiques exigés
 *   (aucun choix silencieux entre deux valeurs) ;
 * - suppression : les baies hébergées sont supprimées dans la même commande (DA-07-01-e).
 */
import type { PropositionReparation, ReferenceTopologique } from "../contrats/references.js";
import { TOLERANCES } from "../contrats/tolerances.js";
import type { IdObjet, ObjetMur } from "../ontologie/classes.js";
import { estPointLocal, REPERE_LOCAL_PROJET } from "../ontologie/reperes.js";
import {
  baiesDuMur,
  controlerEmprise,
  controlerEnTete,
  controlerIdentifiantLibre,
  controlerLongueurMin,
  controlerNiveauHaut,
  controlerType,
  exigerCibles,
  fusionnerModifications,
  marquerSaisie,
  nomObjet,
  nouvelObjet,
  reposerBaies,
  sansCles,
  supprimerObjet,
  type Corps,
} from "./communs.js";
import { jsonCanonique } from "./empreinte.js";
import { distance, distanceDroite, longueurSegment, parametreProjection, pointA, pt, scalaire, sous } from "./geometrie.js";
import { motif, type Transaction } from "./transaction.js";

/** Contrôles propres d'un mur posé (création, modification, transformation). */
export function controlerMur(tx: Transaction, m: ObjetMur, chemin: string, cles: readonly string[] | null): void {
  const touche = (k: string) => cles === null || cles.includes(k);
  if (touche("axe")) controlerLongueurMin(tx, m.params.axe?.a, m.params.axe?.b, `${chemin}.axe`, nomObjet(m));
  if (touche("typeId")) controlerType(tx, "mur", m.params.typeId, `${chemin}.typeId`);
  if (touche("niveauHaut")) controlerNiveauHaut(tx, m.niveauId, m.params.niveauHaut, `${chemin}.niveauHaut`, nomObjet(m));
}

export const tracer: Corps<"mur.tracer"> = (tx, c) => {
  const p = c.params;
  if (!controlerEnTete(tx, p)) return;
  const params = { ...sansCles(p, ["id", "niveauId", "calqueId", "a", "b"]), axe: { a: p.a, b: p.b } } as unknown as ObjetMur["params"];
  const m = nouvelObjet("mur", p.id, params, { niveauId: p.niveauId, calqueId: p.calqueId });
  controlerLongueurMin(tx, p.a, p.b, "params.b", nomObjet(m));
  controlerType(tx, "mur", p.typeId, "params.typeId");
  controlerNiveauHaut(tx, p.niveauId, p.niveauHaut, "params.niveauHaut", nomObjet(m));
  tx.mettre(m);
};

export const modifier: Corps<"mur.modifier"> = (tx, c) => {
  const murs = exigerCibles(tx, c.cibles, ["mur"]);
  if (!murs) return;
  const cles = typeof c.params.modifications === "object" && c.params.modifications !== null ? Object.keys(c.params.modifications) : [];
  for (const avant of murs) {
    if (avant.classe !== "mur") continue;
    const m = fusionnerModifications(tx, avant, c.params.modifications, "params.modifications");
    if (!m) return;
    controlerMur(tx, m, "params.modifications", cles);
    tx.mettre(m);
    if (cles.includes("axe")) reposerBaies(tx, avant, "distance", "params.modifications.axe");
    controlerEmprise(tx, m.id, "params.modifications");
  }
};

/** Propositions de réparation après scission ou jonction : mêmes caractéristiques sur les nouveaux murs. */
function propositionsPour(cibles: (ref: ReferenceTopologique) => readonly IdObjet[]): (ref: ReferenceTopologique) => readonly PropositionReparation[] {
  return (ref) => [
    ...cibles(ref).map((id) => ({ cible: { objetId: id, caracteristique: ref.caracteristique }, libelle: `${ref.caracteristique} de ${id}` })),
    { cible: null, libelle: "détacher (la cote devient libre)" },
  ];
}

/** Rattache les nouveaux murs au groupe de l'ancien. */
function heriterGroupe(tx: Transaction, groupeId: IdObjet | undefined, nouveaux: readonly IdObjet[]): void {
  if (groupeId === undefined) return;
  const g = tx.objet(groupeId);
  if (g?.classe !== "groupe") return;
  tx.mettre({ ...g, params: { ...g.params, membres: [...g.params.membres, ...nouveaux] } });
  for (const id of nouveaux) tx.ajouterRelation({ type: "appartient-a", sourceId: id, cibleId: groupeId, derivee: false });
}

/** Copie d'un mur sous un nouvel identifiant (même traçabilité : c'est le même mur physique), nouvel axe. */
function copieMur(m: ObjetMur, id: IdObjet, axe: ObjetMur["params"]["axe"]): ObjetMur {
  const { representations: _r, ...reste } = m;
  void _r;
  return marquerSaisie({ ...reste, id, params: { ...m.params, axe } }, ["axe"]);
}

export const scinder: Corps<"mur.scinder"> = (tx, c) => {
  const murs = exigerCibles(tx, c.cibles, ["mur"], { min: 1, max: 1 });
  const m = murs?.[0];
  if (!m || m.classe !== "mur") return;
  const { point, nouveauxIds } = c.params;
  if (!estPointLocal(point) || (point.repereLocal ?? REPERE_LOCAL_PROJET) !== REPERE_LOCAL_PROJET) {
    tx.refuser("repere-melange", "params.point", motif(nomObjet(m), "point de scission mal formé ou hors du repère local du projet", "désigner un point de l'axe"));
    return;
  }
  if (!Array.isArray(nouveauxIds) || nouveauxIds.length !== 2 || nouveauxIds[0] === nouveauxIds[1]) {
    tx.refuser("parametre-invalide", "params.nouveauxIds", motif(nomObjet(m), "deux identifiants distincts attendus", "fournir deux nouveaux identifiants"));
    return;
  }
  const [id1, id2] = nouveauxIds;
  if (!controlerIdentifiantLibre(tx, id1, "params.nouveauxIds[0]") || !controlerIdentifiantLibre(tx, id2, "params.nouveauxIds[1]")) return;
  const axe = m.params.axe;
  const L = longueurSegment(axe);
  if (distanceDroite(axe, point) > TOLERANCES.longueurMin) {
    tx.refuser("precondition", "params.point", motif(nomObjet(m), `le point est à ${distanceDroite(axe, point)} m de l'axe`, "désigner un point sur l'axe du mur"), [m.id]);
    return;
  }
  const t = parametreProjection(axe, point);
  const d = t * L;
  if (d < TOLERANCES.longueurMin || L - d < TOLERANCES.longueurMin) {
    tx.refuser("precondition", "params.point", motif(nomObjet(m), "le point de scission est trop près d'une extrémité ou hors du mur", "choisir un point intérieur au mur"), [m.id]);
    return;
  }
  const a = baiesDuMur(tx, m.id).filter((b) => {
    const centre = b.params.position.t * L;
    return centre - b.params.largeur.value / 2 < d - TOLERANCES.tolCoincidence && centre + b.params.largeur.value / 2 > d + TOLERANCES.tolCoincidence;
  });
  if (a.length > 0) {
    tx.refuser("precondition", "params.point", motif(nomObjet(m), `ouverture à cheval sur le point de scission : ${a.map((b) => b.id).join(", ")}`, "déplacer ou supprimer d'abord"), a.map((b) => b.id));
    return;
  }
  const P = pointA(axe, t);
  const p = pt(P.x, P.y);
  const m1 = copieMur(m, id1, { a: axe.a, b: p });
  const m2 = copieMur(m, id2, { a: p, b: axe.b });
  tx.mettre(m1);
  tx.mettre(m2);
  reposerBaies(tx, m, "absolu", "params.point", (centre) => (scalaire(sous(centre, axe.a), sous(axe.b, axe.a)) / (L * L) <= t ? m1 : m2));
  controlerEmprise(tx, id1, "params.point");
  controlerEmprise(tx, id2, "params.point");
  tx.remplacer(m.id, [id1, id2]);
  supprimerObjet(
    tx,
    m.id,
    propositionsPour((ref) => (ref.caracteristique === "mur:arete-debut" ? [id1] : ref.caracteristique === "mur:arete-fin" ? [id2] : [id1, id2])),
  );
  heriterGroupe(tx, m.groupeId, [id1, id2]);
};

export const joindre: Corps<"mur.joindre"> = (tx, c) => {
  const murs = exigerCibles(tx, c.cibles, ["mur"], { min: 2, max: 2 });
  if (!murs) return;
  const [m1, m2] = murs;
  if (m1?.classe !== "mur" || m2?.classe !== "mur") return;
  const nouvelId = c.params.nouvelId;
  if (!controlerIdentifiantLibre(tx, nouvelId, "params.nouvelId")) return;
  const objet = `Murs ${m1.id} et ${m2.id}`;
  const ids = [m1.id, m2.id];
  if (m1.niveauId !== m2.niveauId || m1.calqueId !== m2.calqueId || m1.groupeId !== m2.groupeId) {
    tx.refuser("precondition", "cibles", motif(objet, "niveau, calque ou groupe différents", "harmoniser les deux murs d'abord"), ids);
    return;
  }
  const { axe: _a1, ...p1 } = m1.params;
  const { axe: _a2, ...p2 } = m2.params;
  void _a1;
  void _a2;
  if (jsonCanonique(p1) !== jsonCanonique(p2)) {
    tx.refuser("precondition", "cibles", motif(objet, "paramètres différents (épaisseur, hauteur, alignement, type, extérieur ou nom)", "harmoniser les paramètres d'abord (mur.modifier)"), ids);
    return;
  }
  const A = m1.params.axe;
  const B = m2.params.axe;
  const u = sous(A.b, A.a);
  const v = sous(B.b, B.a);
  const colineaires = distanceDroite(A, B.a) <= TOLERANCES.tolCoincidence && distanceDroite(A, B.b) <= TOLERANCES.tolCoincidence;
  if (!colineaires || scalaire(u, v) <= 0) {
    tx.refuser("precondition", "cibles", motif(objet, colineaires ? "axes de sens opposés" : "axes non colinéaires", "joindre seulement deux murs alignés de même sens"), ids);
    return;
  }
  let axe: ObjetMur["params"]["axe"] | null = null;
  if (distance(A.b, B.a) <= TOLERANCES.tolCoincidence) axe = { a: A.a, b: B.b };
  else if (distance(B.b, A.a) <= TOLERANCES.tolCoincidence) axe = { a: B.a, b: A.b };
  if (!axe) {
    tx.refuser("precondition", "cibles", motif(objet, "les murs ne sont pas contigus (aucune extrémité commune)", "prolonger l'un des murs d'abord"), ids);
    return;
  }
  const premier = axe.a === A.a ? m1 : m2;
  const second = premier === m1 ? m2 : m1;
  const nouveau = copieMur(premier, nouvelId, axe);
  tx.mettre(nouveau);
  reposerBaies(tx, m1, "absolu", "cibles", () => nouveau);
  reposerBaies(tx, m2, "absolu", "cibles", () => nouveau);
  controlerEmprise(tx, nouvelId, "cibles");
  const props = propositionsPour((ref) =>
    (ref.objetId === premier.id && ref.caracteristique === "mur:arete-fin") || (ref.objetId === second.id && ref.caracteristique === "mur:arete-debut") ? [] : [nouvelId],
  );
  tx.remplacer(m1.id, [nouvelId]);
  tx.remplacer(m2.id, [nouvelId]);
  supprimerObjet(tx, m1.id, props);
  supprimerObjet(tx, m2.id, props);
  heriterGroupe(tx, premier.groupeId, [nouvelId]);
};

export const supprimer: Corps<"mur.supprimer"> = (tx, c) => {
  const murs = exigerCibles(tx, c.cibles, ["mur"]);
  if (!murs) return;
  // Les baies hébergées sont supprimées avec le mur ; elles figurent dans `effets.objetsSupprimes` (aperçu).
  for (const m of murs) {
    for (const b of baiesDuMur(tx, m.id)) supprimerObjet(tx, b.id);
    supprimerObjet(tx, m.id);
  }
};
