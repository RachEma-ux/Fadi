/**
 * Dalles, toitures, escaliers, pièces, espaces, zones, poteaux, solides (annexe B).
 *
 * - dalle : contour simple exigé, trous intérieurs ; un changement du nombre de sommets met « à réparer » les
 *   références `dalle:contour[i]` (les indices changent de sens) ;
 * - escalier (DA-07-10) : niveaux reliés existants, arrivée au-dessus du départ ; valeurs « non évaluées »
 *   signalées, contradiction entre hauteur à franchir et écart d'altitude affichée, jamais corrigée ;
 * - pièce : `aireCalculee` jamais saisie (retirée si la géométrie change : elle n'est plus à jour) ; code en
 *   double sur le niveau signalé (DA-02-02) ;
 * - zone : `contenu` porté par les relations `contient` (non dérivées) vers des pièces ou espaces.
 */
import { TOLERANCES } from "../contrats/tolerances.js";
import type { IdObjet, ObjetModele, ObjetZone } from "../ontologie/classes.js";
import { estNonEvaluee } from "../ontologie/provenance.js";
import {
  controlerContour,
  controlerEnTete,
  controlerLongueurMin,
  controlerNiveau,
  controlerTrous,
  exigerCibles,
  fabriqueCreation,
  fabriqueModification,
  fabriqueSuppression,
  fusionnerModifications,
  nomObjet,
  nouvelObjet,
  referencesAReparer,
  sansCles,
  signalerNonEvaluees,
  type ControleObjet,
  type Corps,
} from "./communs.js";
import { motif, type Transaction } from "./transaction.js";

const touche = (cles: readonly string[] | null, ...k: string[]) => cles === null || k.some((x) => cles.includes(x));

// --- Dalles et toitures -----------------------------------------------------

const controleContourTrous =
  (simple: boolean): ControleObjet =>
  (tx, o, chemin, cles) => {
    const p = o.params as { contour?: unknown; trous?: unknown };
    if (touche(cles, "contour")) controlerContour(tx, p.contour, `${chemin}.contour`, nomObjet(o), simple);
    if (touche(cles, "contour", "trous")) controlerTrous(tx, p.contour, p.trous, `${chemin}.trous`, nomObjet(o));
    if (cles !== null && cles.includes("contour")) {
      const avant = tx.objet(o.id);
      const nAvant = (avant?.params as { contour?: unknown[] } | undefined)?.contour?.length;
      const nApres = Array.isArray(p.contour) ? p.contour.length : undefined;
      if (nAvant !== nApres) referencesAReparer(tx, o.id);
    }
  };

const controleToiture: ControleObjet = (tx, o, chemin, cles) => {
  controleContourTrous(true)(tx, o, chemin, cles);
  signalerNonEvaluees(tx, o, ["pente"]);
};

export const dalleCreer = fabriqueCreation<"dalle.creer">("dalle", controleContourTrous(true));
export const dalleModifier = fabriqueModification<"dalle.modifier">(["dalle"], controleContourTrous(true));
export const dalleSupprimer = fabriqueSuppression<"dalle.supprimer">(["dalle"]);
export const toitureCreer = fabriqueCreation<"toiture.creer">("toiture", controleToiture);
export const toitureModifier = fabriqueModification<"toiture.modifier">(["toiture"], controleToiture);
export const toitureSupprimer = fabriqueSuppression<"toiture.supprimer">(["toiture"]);

// --- Escaliers --------------------------------------------------------------

const controleEscalier: ControleObjet = (tx, o, chemin, cles) => {
  if (o.classe !== "escalier") return;
  const p = o.params;
  if (touche(cles, "axe")) controlerLongueurMin(tx, p.axe?.a, p.axe?.b, `${chemin}.axe`, nomObjet(o));
  if (touche(cles, "contremarches") && p.contremarches === 0) {
    tx.refuser("parametre-invalide", `${chemin}.contremarches`, motif(nomObjet(o), "0 contremarche", "donner un nombre entier ≥ 1 ou « non évaluée »"), [o.id]);
  }
  if (p.niveauDepartId !== undefined && touche(cles, "niveauDepartId")) controlerNiveau(tx, p.niveauDepartId, `${chemin}.niveauDepartId`);
  if (p.niveauArriveeId !== undefined && touche(cles, "niveauArriveeId")) controlerNiveau(tx, p.niveauArriveeId, `${chemin}.niveauArriveeId`);
  const nd = p.niveauDepartId !== undefined ? tx.objet(p.niveauDepartId) : undefined;
  const na = p.niveauArriveeId !== undefined ? tx.objet(p.niveauArriveeId) : undefined;
  if (nd?.classe === "niveau" && na?.classe === "niveau") {
    const dz = na.params.elevation.value - nd.params.elevation.value;
    if (!(dz > 0)) {
      tx.refuser("precondition", `${chemin}.niveauArriveeId`, motif(nomObjet(o), `le niveau d'arrivée ${na.id} n'est pas au-dessus du niveau de départ ${nd.id}`, "inverser ou corriger les niveaux reliés"), [o.id]);
    } else if (!estNonEvaluee(p.hauteurAFranchir) && typeof p.hauteurAFranchir === "object" && Math.abs(p.hauteurAFranchir.value - dz) > TOLERANCES.tolCoincidence) {
      tx.signaler({
        code: "valeur-a-verifier",
        gravite: "avertissement",
        message: `${nomObjet(o)} : hauteur à franchir déclarée ${p.hauteurAFranchir.value} m, écart d'altitude entre ${nd.id} et ${na.id} : ${dz} m. Les deux valeurs sont conservées ; à vérifier.`,
        objetIds: [o.id, nd.id, na.id],
        ...(o.niveauId !== undefined ? { niveauId: o.niveauId } : {}),
      });
    }
  }
  if (p.niveauDepartId === undefined || p.niveauArriveeId === undefined) {
    tx.signaler({
      code: "niveaux-relies-absents",
      gravite: "avertissement",
      message: `${nomObjet(o)} : niveau de départ ou d'arrivée non renseigné ; aucune relation « relie » n'est créée pour lui.`,
      objetIds: [o.id],
      ...(o.niveauId !== undefined ? { niveauId: o.niveauId } : {}),
    });
  }
  signalerNonEvaluees(tx, o, ["hauteurAFranchir", "marches", "contremarches", "epaisseurPaillasse"]);
};

export const escalierCreer = fabriqueCreation<"escalier.creer">("escalier", controleEscalier);
export const escalierModifier = fabriqueModification<"escalier.modifier">(["escalier"], controleEscalier);
export const escalierSupprimer = fabriqueSuppression<"escalier.supprimer">(["escalier"]);

// --- Pièces, espaces, zones -------------------------------------------------

const controlePolygones: ControleObjet = (tx, o, chemin, cles) => {
  const polys = (o.params as { polygones?: unknown }).polygones;
  if (touche(cles, "polygones") && Array.isArray(polys)) {
    polys.forEach((poly: unknown, i) => {
      const contour = typeof poly === "object" && poly !== null ? (poly as { contour?: unknown }).contour : undefined;
      controlerContour(tx, contour, `${chemin}.polygones[${i}].contour`, nomObjet(o), false);
      controlerTrous(tx, contour, (poly as { trous?: unknown } | null)?.trous, `${chemin}.polygones[${i}].trous`, nomObjet(o));
    });
  }
};

const controlePiece: ControleObjet = (tx, o, chemin, cles) => {
  if (o.classe !== "piece") return;
  controlePolygones(tx, o, chemin, cles);
  if (cles === null && o.params.aireCalculee !== undefined) {
    tx.refuser("parametre-invalide", `${chemin}.aireCalculee`, motif(nomObjet(o), "« aireCalculee » est une valeur calculée, jamais saisie", "retirer ce paramètre"), [o.id]);
  }
  if (touche(cles, "code", "niveauId") && o.params.code !== undefined) {
    const doublon = tx.objets().find((x) => x.id !== o.id && x.classe === "piece" && x.niveauId === o.niveauId && x.params.code === o.params.code);
    if (doublon) {
      tx.signaler({
        code: "doublon",
        gravite: "avertissement",
        message: `${nomObjet(o)} : code « ${o.params.code} » déjà porté par ${nomObjet(doublon)} sur le niveau ${String(o.niveauId)}.`,
        objetIds: [o.id, doublon.id],
        ...(o.niveauId !== undefined ? { niveauId: o.niveauId } : {}),
      });
    }
  }
  // La géométrie change : l'aire calculée n'est plus à jour ; elle est retirée (« non calculée »), jamais estimée.
  if (cles !== null && cles.includes("polygones") && o.params.aireCalculee !== undefined) {
    const { aireCalculee: _a, ...params } = o.params;
    void _a;
    return { ...o, params } as ObjetModele;
  }
  return undefined;
};

export const pieceCreer = fabriqueCreation<"piece.creer">("piece", controlePiece);
export const pieceModifier = fabriqueModification<"piece.modifier">(["piece"], controlePiece);
export const pieceSupprimer = fabriqueSuppression<"piece.supprimer">(["piece"]);
export const espaceCreer = fabriqueCreation<"espace.creer">("espace", controlePolygones);
export const espaceModifier = fabriqueModification<"espace.modifier">(["espace"], controlePolygones);
export const espaceSupprimer = fabriqueSuppression<"espace.supprimer">(["espace"]);

/** Contenu d'une zone : pièces ou espaces existants, cités une fois. */
function controlerContenu(tx: Transaction, contenu: unknown, chemin: string): IdObjet[] | null {
  if (!Array.isArray(contenu) || !contenu.every((x) => typeof x === "string") || new Set(contenu).size !== contenu.length) {
    tx.refuser("parametre-invalide", chemin, motif("Zone", "contenu mal formé (liste d'identifiants distincts attendue)", "corriger la liste"));
    return null;
  }
  let ok = true;
  contenu.forEach((id: string, i) => {
    const o = tx.objet(id);
    if (!o || (o.classe !== "piece" && o.classe !== "espace")) {
      ok = false;
      tx.refuser("precondition", `${chemin}[${i}]`, motif(`Objet ${id}`, o ? `classe « ${o.classe} » : une zone contient des pièces ou des espaces` : "introuvable", "retirer l'objet du contenu"), [id]);
    }
  });
  return ok ? (contenu as IdObjet[]) : null;
}

function poserContenu(tx: Transaction, zoneId: IdObjet, contenu: readonly IdObjet[]): void {
  for (const r of tx.relations()) if (r.type === "contient" && r.sourceId === zoneId && !contenu.includes(r.cibleId)) tx.retirerRelation(r);
  for (const id of contenu) tx.ajouterRelation({ type: "contient", sourceId: zoneId, cibleId: id, derivee: false });
}

export const zoneCreer: Corps<"zone.creer"> = (tx, c) => {
  const p = c.params;
  if (!controlerEnTete(tx, p)) return;
  const contenu = controlerContenu(tx, p.contenu, "params.contenu");
  const z = nouvelObjet("zone", p.id, sansCles(p, ["id", "niveauId", "calqueId", "contenu"]) as unknown as ObjetZone["params"], { niveauId: p.niveauId, calqueId: p.calqueId });
  controlePolygones(tx, z, "params", null);
  tx.mettre(z);
  if (contenu) poserContenu(tx, z.id, contenu);
};

export const zoneModifier: Corps<"zone.modifier"> = (tx, c) => {
  const zones = exigerCibles(tx, c.cibles, ["zone"]);
  if (!zones) return;
  const contenu = c.params.contenu === undefined ? undefined : controlerContenu(tx, c.params.contenu, "params.contenu");
  if (contenu === null) return;
  const mods = c.params.modifications ?? {};
  const cles = Object.keys(mods);
  for (const z of zones) {
    const m = fusionnerModifications(tx, z, mods, "params.modifications");
    if (!m) return;
    controlePolygones(tx, m, "params.modifications", cles);
    tx.mettre(m);
    if (contenu) poserContenu(tx, m.id, contenu);
  }
};

export const zoneSupprimer = fabriqueSuppression<"zone.supprimer">(["zone"]);

// --- Poteaux et solides -----------------------------------------------------

const controleSolide: ControleObjet = (tx, o, chemin, cles) => {
  if (o.classe !== "solide") return;
  if (touche(cles, "contour", "ferme") && o.params.ferme) controlerContour(tx, o.params.contour, `${chemin}.contour`, nomObjet(o), false);
  if (touche(cles, "contour", "trous")) controlerTrous(tx, o.params.contour, o.params.trous, `${chemin}.trous`, nomObjet(o));
};

export const poteauCreer = fabriqueCreation<"poteau.creer">("poteau");
export const poteauModifier = fabriqueModification<"poteau.modifier">(["poteau"]);
export const poteauSupprimer = fabriqueSuppression<"poteau.supprimer">(["poteau"]);
export const solideExtruder = fabriqueCreation<"solide.extruder">("solide", controleSolide);
export const solideModifier = fabriqueModification<"solide.modifier">(["solide"], controleSolide);
export const solideSupprimer = fabriqueSuppression<"solide.supprimer">(["solide"]);
