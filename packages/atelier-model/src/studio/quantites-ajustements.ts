import { GRANDEUR_CUMULABLE, UNITE_GRANDEUR, type GrandeurQuantite, type UniteQuantite } from "./metre/grandeurs.js";
import type { StudioDocument } from "./document-2d.js";
import {
  appliquerAjustementsQuantites, type AjustementQuantite, type QuantitesAjustees, type QuantitesStudio, type RefusAjustement,
  type TotalAjuste, type ValeurAjustee,
} from "./quantites.js";

/**
 * Ajustements manuels ENREGISTRÉS du métré Studio (E.3-05). Pur : ni React, ni DOM, ni stockage. Le serveur les range
 * dans un journal en ajout seul, versionné par variante (`sequence` croissante) ; ce module décide de ce qui est
 * recevable, de l'état de la cible au moment de l'ajustement, et de ce qui s'applique à une révision donnée.
 *
 * - Une cible est un objet (une grandeur de cet objet) ou un calque (le total d'une grandeur cumulable du calque).
 * - La quantité brute n'est jamais remplacée : brute, ajustement (écart) et ajustée sont montrées ensemble.
 * - Chaque ajustement garde l'état de sa cible à la révision où il a été saisi (`etatCible`, calculé par le serveur
 *   depuis le document de cette révision). Sur une autre révision (ou un brouillon), un ajustement dont la cible a
 *   changé depuis — objet modifié ou supprimé, objets du calque modifiés — est « à revoir » : il n'est **jamais**
 *   appliqué en silence ; la valeur retenue reste la brute, et l'ajustement proposé est montré à côté.
 * - Pour une même cible et une même grandeur, seul le dernier ajustement (plus grande séquence) compte : un ajustement
 *   plus ancien est « remplacé », même si le dernier est à revoir (on ne revient jamais en silence à un plus ancien).
 * - `valeur: null` revient explicitement à la valeur brute (retour tracé lui aussi).
 * - L'état d'un total de calque comprend les ajustements d'objets EN VIGUEUR de ce calque (pour la grandeur) : un
 *   ajustement d'objet enregistré après celui du total rend le total « à revoir », au lieu d'être masqué par lui.
 * - Choix conservateur assumé : l'état de la cible reprend la forme du métré (grandeurs présentes, codes de motif
 *   « non évalué », nature). Une évolution du modèle de métré (nouvelle grandeur, motif renommé…) change donc cet état,
 *   et TOUS les ajustements concernés passent « à revoir » : ils sont à reconfirmer, jamais réappliqués en silence.
 * - Le journal d'une variante est borné (`STUDIO_LIMITES_AJUSTEMENTS.journal`) : au-delà, le serveur refuse.
 */

export type CibleAjustementQuantite = { type: "objet"; id: string } | { type: "calque"; id: string };

/** Motif de refus d'un ajustement à enregistrer : ceux du métré, plus la cible calque et l'unité. */
export type RefusAjustementEnregistre = RefusAjustement | "calque-inconnu" | "grandeur-non-cumulable" | "unite-incoherente" | "motif-trop-long";

export const STUDIO_LIMITES_AJUSTEMENTS = Object.freeze({ motif: 2000, journal: 5000 });

/** Saisie d'un ajustement (ce que la personne fournit) ; auteur, date et révision sont posés par le serveur. */
export interface SaisieAjustementQuantite {
  cible: CibleAjustementQuantite;
  grandeur: GrandeurQuantite;
  unite: UniteQuantite;
  valeur: number | null;
  motif: string;
}

/** Ajustement tel que le journal du serveur le rend. */
export interface AjustementQuantiteEnregistre extends SaisieAjustementQuantite {
  id: string;
  /** Rang dans le journal de la variante (1, 2, …) : version du journal après cet ajustement. */
  sequence: number;
  /** Révision sur laquelle l'ajustement a été saisi. */
  revisionId: string;
  /** Valeur brute de la cible à cette révision ; null = non évaluée. */
  derivee: number | null;
  /** État de la cible à cette révision (`etatCibleQuantite`) : sert à reconnaître une cible changée depuis. */
  etatCible: unknown;
  /** Identifiant du compte auteur. */
  auteur: string;
  auteurEmail?: string | null;
  /** Date ISO 8601 (horloge du serveur). */
  date: string;
}

/** JSON canonique (clés triées, `undefined` omis, ordre des tableaux conservé). */
export function jsonCanoniqueQuantites(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return `[${v.map((x) => (x === undefined ? "null" : jsonCanoniqueQuantites(x))).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).sort().filter((k) => o[k] !== undefined).map((k) => `${JSON.stringify(k)}:${jsonCanoniqueQuantites(o[k])}`).join(",")}}`;
}

/** Enregistrement source d'un objet métré (objet 2D ou objet architectural), tel que le document le porte. */
function sourceDe(doc: StudioDocument, id: string): unknown {
  return (doc.objects as readonly unknown[]).find((o) => !!o && typeof o === "object" && (o as { id?: unknown }).id === id)
    ?? (doc.architecture ?? []).find((a) => a.id === id) ?? null;
}

/**
 * État d'une cible à une révision, et sa valeur brute. Objet : son enregistrement dans le document et toutes ses
 * quantités brutes (un mur dont une ouverture change change donc aussi). Calque : la grandeur de chacun de ses objets et
 * le nombre d'objets non pris en charge. Le nom ou la visibilité d'un calque n'en font pas partie : ils ne changent
 * aucune quantité.
 */
export function etatCibleQuantite(
  doc: StudioDocument, q: QuantitesStudio, cible: CibleAjustementQuantite, grandeur: GrandeurQuantite,
  /** Ajustements d'objets en vigueur (`evaluerAjustementsQuantites(...).objets`) : repris dans l'état d'un total de calque. */
  objetsEnVigueur: readonly AjustementQuantiteEnregistre[] = [],
): { etat: unknown; derivee: number | null } | { refus: RefusAjustementEnregistre } {
  if (cible.type === "objet") {
    const o = q.objets.find((x) => x.objetId === cible.id);
    if (!o) return { refus: "objet-inconnu" };
    const v = o.valeurs.find((x) => x.grandeur === grandeur);
    if (!v) return { refus: "grandeur-non-applicable" };
    return {
      etat: { cible: "objet", source: sourceDe(doc, cible.id), type: o.type, nature: o.nature, calqueId: o.calqueId, valeurs: o.valeurs.map(({ grandeur: g, unite, valeur, motif }) => ({ grandeur: g, unite, valeur, motif })) },
      derivee: v.valeur,
    };
  }
  const c = q.calques.find((x) => x.calqueId === cible.id);
  if (!c) return { refus: "calque-inconnu" };
  if (!GRANDEUR_CUMULABLE[grandeur]) return { refus: "grandeur-non-cumulable" };
  const t = c.totaux.find((x) => x.grandeur === grandeur);
  if (!t) return { refus: "grandeur-non-applicable" };
  const ajustes = new Map(objetsEnVigueur.filter((a) => a.cible.type === "objet" && a.grandeur === grandeur).map((a) => [a.cible.id, a]));
  return {
    etat: {
      cible: "calque", calqueId: c.calqueId, grandeur,
      objets: c.objets.flatMap((o) => {
        const v = o.valeurs.find((x) => x.grandeur === grandeur);
        if (!v) return [];
        const a = ajustes.get(o.objetId);
        // Clé `ajustement` présente seulement pour un objet ajusté : un état sans ajustement d'objet reste inchangé.
        return [{ objetId: o.objetId, valeur: v.valeur, motif: v.motif, ...(a ? { ajustement: { id: a.id, valeur: a.valeur } } : {}) }];
      }),
      nonPrisEnCharge: c.objets.filter((o) => o.nature === "non-pris-en-charge").map((o) => o.objetId),
    },
    derivee: t.valeur,
  };
}

/** Contrôle d'une saisie contre le métré de la révision : null si recevable, sinon le motif du refus. */
export function controlerSaisieAjustement(doc: StudioDocument, q: QuantitesStudio, s: SaisieAjustementQuantite): RefusAjustementEnregistre | null {
  if (UNITE_GRANDEUR[s.grandeur] === undefined) return "grandeur-non-applicable";
  if (s.unite !== UNITE_GRANDEUR[s.grandeur]) return "unite-incoherente";
  if (s.valeur !== null && (typeof s.valeur !== "number" || !Number.isFinite(s.valeur) || s.valeur < 0)) return "valeur-invalide";
  if (typeof s.motif !== "string" || !s.motif.trim()) return "motif-obligatoire";
  if (s.motif.length > STUDIO_LIMITES_AJUSTEMENTS.motif) return "motif-trop-long";
  const e = etatCibleQuantite(doc, q, s.cible, s.grandeur);
  return "refus" in e ? e.refus : null;
}

export type StatutAjustementEnregistre = "en-vigueur" | "a-revoir" | "remplace";
/** Pourquoi un ajustement est à revoir : sa cible a changé depuis sa révision, ou n'existe plus (ou plus pour cette grandeur). */
export type MotifRevueAjustement = "cible-modifiee" | "cible-absente";

export interface LigneJournalAjustement {
  ajustement: AjustementQuantiteEnregistre;
  statut: StatutAjustementEnregistre;
  revue?: MotifRevueAjustement;
}

export interface EvaluationAjustementsQuantites {
  /** Journal complet, dans l'ordre des séquences, avec le statut de chaque ajustement pour la révision examinée. */
  journal: LigneJournalAjustement[];
  /** Derniers ajustements d'objets en vigueur. */
  objets: AjustementQuantiteEnregistre[];
  /** Derniers ajustements de calques en vigueur. */
  calques: AjustementQuantiteEnregistre[];
  /** Derniers ajustements à revoir (objets et calques). */
  aRevoir: AjustementQuantiteEnregistre[];
}

const cleCible = (a: Pick<SaisieAjustementQuantite, "cible" | "grandeur">) => `${a.cible.type}\u0000${a.cible.id}\u0000${a.grandeur}`;

/**
 * Statut de chaque ajustement du journal pour la révision `doc` (et son métré `q`) : le dernier de chaque cible est en
 * vigueur si l'état de sa cible est identique à celui de sa révision d'origine, sinon à revoir ; les autres sont remplacés.
 */
export function evaluerAjustementsQuantites(doc: StudioDocument, q: QuantitesStudio, journal: readonly AjustementQuantiteEnregistre[]): EvaluationAjustementsQuantites {
  const ordonne = [...journal].sort((a, b) => a.sequence - b.sequence);
  const dernier = new Map<string, AjustementQuantiteEnregistre>();
  for (const a of ordonne) dernier.set(cleCible(a), a);
  const statut = new Map<AjustementQuantiteEnregistre, { statut: StatutAjustementEnregistre; revue?: MotifRevueAjustement }>();
  // Deux passes : les objets d'abord (leur statut ne dépend d'aucun total), puis les totaux de calque, dont l'état
  // comprend les ajustements d'objets en vigueur.
  const evaluer = (a: AjustementQuantiteEnregistre, objetsEnVigueur: readonly AjustementQuantiteEnregistre[]) => {
    const e = etatCibleQuantite(doc, q, a.cible, a.grandeur, objetsEnVigueur);
    if ("refus" in e) statut.set(a, { statut: "a-revoir", revue: "cible-absente" });
    else if (jsonCanoniqueQuantites(e.etat) !== jsonCanoniqueQuantites(a.etatCible)) statut.set(a, { statut: "a-revoir", revue: "cible-modifiee" });
    else statut.set(a, { statut: "en-vigueur" });
  };
  const derniersObjets = [...dernier.values()].filter((a) => a.cible.type === "objet");
  for (const a of derniersObjets) evaluer(a, []);
  const objetsEnVigueur = derniersObjets.filter((a) => statut.get(a)?.statut === "en-vigueur");
  for (const a of dernier.values()) if (a.cible.type === "calque") evaluer(a, objetsEnVigueur);
  const lignes = ordonne.map((ajustement): LigneJournalAjustement => ({ ajustement, ...(statut.get(ajustement) ?? { statut: "remplace" as const }) }));
  const derniers = [...dernier.values()];
  const enVigueur = derniers.filter((a) => statut.get(a)?.statut === "en-vigueur");
  return {
    journal: lignes,
    objets: enVigueur.filter((a) => a.cible.type === "objet"),
    calques: enVigueur.filter((a) => a.cible.type === "calque"),
    aRevoir: derniers.filter((a) => statut.get(a)?.statut === "a-revoir"),
  };
}

/** Valeur d'objet ajustée, avec l'ajustement à revoir éventuel (proposé, non appliqué). */
export interface ValeurAjusteeEnregistree extends ValeurAjustee {
  /** Écart retenu − brute ; absent sans ajustement en vigueur, null si la brute n'est pas évaluée. */
  ecart?: number | null;
  /** Ajustement enregistré en vigueur (le dernier de la cible). */
  enregistre?: AjustementQuantiteEnregistre;
  /** Dernier ajustement de la cible, à revoir : il n'est pas appliqué. */
  aRevoir?: AjustementQuantiteEnregistre;
}
/** Total ajusté d'un calque, avec l'ajustement du total du calque s'il y en a un. */
export interface TotalAjusteEnregistre extends TotalAjuste {
  /** Total du calque ajusté (ajustement de calque en vigueur) ; `retenue` le reprend. */
  ajusteeCalque?: number;
  /** Ajustement de calque en vigueur (y compris un retour à la valeur brute). */
  ajustementCalque?: AjustementQuantiteEnregistre;
  /** Ajustement de calque à revoir : non appliqué. */
  aRevoirCalque?: AjustementQuantiteEnregistre;
  /** Écart retenu − total brut ; null si le total brut n'est pas évalué. */
  ecart?: number | null;
  /**
   * Total général : ajustements de calque dont le total retenu n'est pas évalué — leur écart n'est pas calculable, il
   * n'est pas reporté (aucune valeur inventée) ; le total général est alors partiel.
   */
  ajustementsNonReportes?: number;
}
export interface ObjetAjusteEnregistre extends Omit<QuantitesAjustees["objets"][number], "valeurs"> { valeurs: ValeurAjusteeEnregistree[] }
export interface CalqueAjusteEnregistre extends Omit<QuantitesAjustees["calques"][number], "objets" | "totaux"> { objets: ObjetAjusteEnregistre[]; totaux: TotalAjusteEnregistre[] }
export interface QuantitesAjusteesEnregistrees extends Omit<QuantitesAjustees, "calques" | "objets" | "totaux"> {
  calques: CalqueAjusteEnregistre[];
  objets: ObjetAjusteEnregistre[];
  totaux: TotalAjusteEnregistre[];
  evaluation: EvaluationAjustementsQuantites;
  /** Faux quand les ajustements de calque ne s'appliquent pas à cette vue (sous-ensemble filtré d'un calque). */
  calquesAppliques: boolean;
}

const versMetre = (a: AjustementQuantiteEnregistre): AjustementQuantite => ({
  objetId: a.cible.id, grandeur: a.grandeur, valeur: a.valeur, motif: a.motif, auteur: a.auteurEmail || a.auteur, date: a.date,
});
const ecartDe = (retenue: number | null, brute: number | null): number | null => (retenue === null || brute === null ? null : retenue - brute);

/**
 * Applique l'évaluation (faite sur le métré COMPLET de la révision) à un métré `q` — le même ou un sous-ensemble filtré.
 * Les ajustements d'objets en vigueur s'appliquent par `appliquerAjustementsQuantites` ; ceux de calques remplacent le
 * total du calque (et décalent le total général de leur écart) seulement si `calques` est vrai : un total de calque
 * ajusté ne vaut que pour le calque entier, jamais pour un filtre par nature.
 */
export function appliquerAjustementsEnregistres(q: QuantitesStudio, evaluation: EvaluationAjustementsQuantites, options: { calques: boolean } = { calques: true }): QuantitesAjusteesEnregistrees {
  const base = appliquerAjustementsQuantites(q, evaluation.objets.map(versMetre));
  const parCle = new Map(evaluation.objets.map((a) => [`${a.cible.id}\u0000${a.grandeur}`, a]));
  const revoirObjet = new Map(evaluation.aRevoir.filter((a) => a.cible.type === "objet").map((a) => [`${a.cible.id}\u0000${a.grandeur}`, a]));
  const decorer = (o: QuantitesAjustees["objets"][number]): ObjetAjusteEnregistre => ({
    ...o,
    valeurs: o.valeurs.map((v) => {
      const cle = `${o.objetId}\u0000${v.grandeur}`;
      const enregistre = parCle.get(cle), aRevoir = revoirObjet.get(cle);
      return { ...v, ...(enregistre ? { enregistre, ecart: ecartDe(v.retenue, v.derivee) } : {}), ...(aRevoir ? { aRevoir } : {}) };
    }),
  });
  const objets = base.objets.map(decorer);
  const parId = new Map(objets.map((o) => [o.objetId, o]));
  const calqueEnVigueur = new Map(evaluation.calques.map((a) => [`${a.cible.id}\u0000${a.grandeur}`, a]));
  const calqueARevoir = new Map(evaluation.aRevoir.filter((a) => a.cible.type === "calque").map((a) => [`${a.cible.id}\u0000${a.grandeur}`, a]));
  const decalage = new Map<GrandeurQuantite, { somme: number; reportes: number; nonReportes: number }>();
  const calques = base.calques.map((c): CalqueAjusteEnregistre => ({
    ...c,
    objets: c.objets.map((o) => parId.get(o.objetId)!),
    totaux: c.totaux.map((t): TotalAjusteEnregistre => {
      const cle = `${c.calqueId}\u0000${t.grandeur}`;
      const a = options.calques ? calqueEnVigueur.get(cle) : undefined;
      const revoir = options.calques ? calqueARevoir.get(cle) : undefined;
      if (!a) return { ...t, ...(revoir ? { aRevoirCalque: revoir } : {}) };
      if (a.valeur === null) return { ...t, ajustementCalque: a, ecart: ecartDe(t.retenue, t.valeur) };
      // Le total du calque ajusté remplace le total retenu des objets (ajustements d'objets compris).
      // Écarts valables additionnés ; un écart sur un total retenu non évalué n'est pas calculable : compté à part.
      const cumul = decalage.get(t.grandeur) ?? { somme: 0, reportes: 0, nonReportes: 0 };
      if (t.retenue === null) cumul.nonReportes += 1;
      else { cumul.somme += a.valeur - t.retenue; cumul.reportes += 1; }
      decalage.set(t.grandeur, cumul);
      return { ...t, retenue: a.valeur, ajusteeCalque: a.valeur, ajustementCalque: a, ajustes: t.ajustes + 1, ecart: ecartDe(a.valeur, t.valeur) };
    }),
  }));
  const totaux = base.totaux.map((t): TotalAjusteEnregistre => {
    const d = decalage.get(t.grandeur);
    if (!d) return t;
    // Une base non évaluée reste non évaluée ; seuls les écarts calculables sont reportés.
    const retenue = t.retenue === null ? null : t.retenue + d.somme;
    return { ...t, retenue, ajustes: t.ajustes + d.reportes, ecart: ecartDe(retenue, t.valeur), ...(d.nonReportes ? { ajustementsNonReportes: d.nonReportes } : {}) };
  });
  return { ...base, calques, objets, totaux, evaluation, calquesAppliques: options.calques };
}
