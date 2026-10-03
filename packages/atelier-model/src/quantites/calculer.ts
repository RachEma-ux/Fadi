/**
 * Quantités, règle `quantites/1` (L1.3 ; contrat `contrats/quantites.ts` ; fiche DA-16-10, règles
 * « Recommandation » de la fiche, retenues ici). Fonctions pures : même état → mêmes quantités, bit à bit,
 * dans le même ordre. Chaque quantité porte la règle, la révision et l'empreinte `atelier-empreinte/1`
 * (`calculerEmpreinte`) de l'état dont elle est issue (R11). Unités SI, aucun arrondi ; l'affichage arrondit.
 *
 * ## Règle `quantites/1`
 *
 * Convention d'outil, pas une norme de métré ni une surface réglementaire (SIA 416, SDP, Carrez : non
 * évaluées, R3). Vides d'ouvertures déduits ; chevauchements entre objets additionnés (pas de booléen) ;
 * calques masqués inclus ; jonctions de murs non traitées (contour rectangulaire axe × épaisseur).
 *
 * Par objet (`objetId`, `niveauId` de l'objet) :
 * - mur : `longueur-mur` = ‖b − a‖ (m) ; hauteur H = `hauteur`, sinon altitude(`niveauHaut`) − altitude(niveau
 *   du mur) ; `aire-mur-brute` = L × H ; `aire-baies-mur` = Σ largeur × hauteur des baies hébergées ;
 *   `aire-mur` = brute − baies (aire nette d'une face) ; `volume-mur` = L × e × H − Σ largeur × hauteur × e ;
 * - porte, fenêtre, ouverture : `aire-baie` = largeur × hauteur ; une baie sans hôte est comptée dans les
 *   effectifs et n'est déduite d'aucun mur ;
 * - dalle : `aire-dalle` = |aire(contour)| − Σ |aire(trou)| ; `volume-dalle` = aire × épaisseur ;
 * - poteau : `volume-poteau` = largeur × profondeur × hauteur pour la forme `basic-square`, toute autre forme
 *   « non évaluée » (section non définie par la règle) ;
 * - solide : `volume-solide` = (|aire(contour)| − Σ |aire(trou)|) × hauteur, contour fermé seulement ;
 * - pièce : `aire-piece` = Σ des polygones courants (contour − trous) ; `aire-piece-declaree` = `aireDeclaree`
 *   telle quelle ; `ecart-aire-piece` = calculée − déclarée ; jamais l'une à la place de l'autre ; les
 *   `polygonesSource` (autre repère, D-021) ne sont jamais utilisés ;
 * - espace, zone : `aire-espace`, `aire-zone` = Σ des polygones (contour − trous).
 *
 * Agrégats (sans `objetId`) par niveau (`niveauId`) puis pour le projet (sans `niveauId`) : sommes de
 * `longueur-mur`, `aire-mur`, `aire-mur-brute`, `aire-baies-mur`, `volume-mur`, `aire-baie`, `aire-dalle`,
 * `volume-dalle`, `volume-poteau`, `volume-solide` ; `aire-pieces-niveau` (par niveau seulement) ; effectifs
 * `effectif-portes`, `effectif-fenetres`, `effectif-ouvertures` (classe `ouverture` seule), `effectif-poteaux`,
 * `effectif-escaliers` (toutes les occurrences, sans fusion par `groupe`) et
 * `effectif-escaliers-reference-plan` (occurrences `referencePlanSeulement`) ; une occurrence dont le drapeau
 * est « non évaluée » (D-024) rend cet effectif partiel (non évalué, compte des occurrences sûres en `partiel`).
 *
 * Non évaluée (jamais 0 inventé) : paramètre absent, non fini, nul ou négatif là où il doit être positif ;
 * paramètre annoté `non-evaluee` ; hauteur de mur non résolvable ; contour de moins de 3 sommets,
 * auto-sécant, d'aire < `aireMin` (D-012) ou hors du repère local du projet ; pièce sans tracé courant.
 * Un agrégat dont une entrée est non évaluée est non évalué, motif « partiel » (somme des évaluées et liste
 * des non évaluées dans le motif et dans le champ `partiel`, D-026).
 * Paramètre annoté `a-verifier` (ex. épaisseur de dalle importée de P.118, D-021) : valeur calculée et rendue,
 * statut `a-verifier` (D-026, parité DA-16-10 : jamais masquée).
 *
 * Ordre : nature (ordre de `NATURES_QUANTITE`), niveau (`ordre`, puis identifiant ; niveaux inconnus ensuite,
 * projet en dernier), agrégat avant objets, identifiant d'objet (ordre des unités de code). Les sommes sont
 * faites dans l'ordre des identifiants.
 */
import type { EtatModele } from "../contrats/etat.js";
import { NATURES_QUANTITE, REGLE_QUANTITES, type CalculerQuantites, type NatureQuantite, type Quantite, type QuantitePartielle, type UniteQuantite } from "../contrats/quantites.js";
import { TOLERANCES } from "../contrats/tolerances.js";
import { contourAutoSecant } from "../commandes/communs.js";
import { calculerEmpreinte } from "../commandes/empreinte.js";
import { aireSignee, distance } from "../commandes/geometrie.js";
import type { IdObjet, ObjetBaie, ObjetModele, ObjetMur } from "../ontologie/classes.js";
import { estNonEvaluee, nonEvaluee, type NonEvaluee } from "../ontologie/provenance.js";
import { estPointLocal, REPERE_LOCAL_PROJET, type PointLocal, type PolygoneAvecTrous, type TrouPolygone } from "../ontologie/reperes.js";

/** Formes de poteau dont la section est définie par `quantites/1` (largeur × profondeur). */
export const FORMES_POTEAU_RECTANGULAIRES = ["basic-square"] as const;

export interface FiltreQuantites {
  readonly niveauId?: IdObjet;
  readonly natures?: readonly NatureQuantite[];
}

// --- Valeurs évaluées ---------------------------------------------------------------

/** Valeur intermédiaire : nombre et statut, ou non évaluée. */
type Val = { readonly v: number; readonly aVerifier: boolean } | NonEvaluee;
const val = (v: number, aVerifier = false): Val => ({ v, aVerifier });
const estNE = (x: Val): x is NonEvaluee => estNonEvaluee(x);

/** Combine des valeurs (non évaluée si l'une l'est ; « à vérifier » si l'une l'est). */
function combiner(xs: readonly Val[], f: (...v: number[]) => number): Val {
  for (const x of xs) if (estNE(x)) return x;
  const ok = xs as readonly { v: number; aVerifier: boolean }[];
  const r = f(...ok.map((x) => x.v));
  if (!Number.isFinite(r)) return nonEvaluee("résultat non fini");
  return val(r, ok.some((x) => x.aVerifier));
}

/** Grandeur positive d'un paramètre, avec le statut de son annotation. */
function positive(o: ObjetModele, cle: string, g: unknown, unite: string): Val {
  const statut = o.annotations?.[cle]?.statut;
  if (statut === "non-evaluee") return nonEvaluee(`${o.id} : ${cle} non évalué(e)`);
  if (estNonEvaluee(g)) return nonEvaluee(`${o.id} : ${cle} non évalué(e) (${g.motif})`);
  const x = g as { value?: unknown; unit?: unknown } | undefined;
  if (typeof x?.value !== "number" || !Number.isFinite(x.value) || x.unit !== unite) return nonEvaluee(`${o.id} : ${cle} absent(e) ou mal formé(e)`);
  if (!(x.value > 0)) return nonEvaluee(`${o.id} : ${cle} nul(le) ou négatif(ve) (${x.value} ${unite})`);
  return val(x.value, statut === "a-verifier");
}

const duProjet = (p: unknown): p is PointLocal => estPointLocal(p) && (p.repereLocal ?? REPERE_LOCAL_PROJET) === REPERE_LOCAL_PROJET;

/** Aire (valeur absolue) d'un contour simple, ou motif. */
function aireContour(contour: readonly unknown[] | undefined, quoi: string): Val {
  if (!Array.isArray(contour) || contour.length < 3) return nonEvaluee(`${quoi} : moins de 3 sommets`);
  if (!contour.every(duProjet)) return nonEvaluee(`${quoi} : sommet mal formé ou hors du repère local du projet`);
  const pts = contour as readonly PointLocal[];
  if (contourAutoSecant(pts)) return nonEvaluee(`${quoi} : contour auto-sécant`);
  const a = Math.abs(aireSignee(pts));
  if (a < TOLERANCES.aireMin) return nonEvaluee(`${quoi} : aire ${a} m² inférieure à ${TOLERANCES.aireMin} m²`);
  return val(a);
}

/** Aire nette contour − trous. */
function aireNette(contour: readonly unknown[] | undefined, trous: readonly TrouPolygone<PointLocal>[] | undefined, quoi: string): Val {
  const c = aireContour(contour, quoi);
  const ts = (trous ?? []).map((t, i) => aireContour(t?.polygone, `${quoi}, trou ${t?.id ?? i}`));
  return combiner([c, ...ts], (a, ...t) => t.reduce((s, x) => s - x, a));
}

function airePolygones(polys: readonly PolygoneAvecTrous<PointLocal>[] | undefined, quoi: string, vide: string): Val {
  if (!Array.isArray(polys) || polys.length === 0) return nonEvaluee(`${quoi} : ${vide}`);
  return combiner(
    polys.map((p, i) => aireNette(p?.contour, p?.trous, `${quoi}, polygone ${i}`)),
    (...a) => a.reduce((s, x) => s + x, 0),
  );
}

function hauteurMur(objets: EtatModele["objets"], m: ObjetMur): Val {
  if (m.params.hauteur !== undefined) return positive(m, "hauteur", m.params.hauteur, "m");
  const haut = m.params.niveauHaut !== undefined ? objets[m.params.niveauHaut] : undefined;
  const bas = m.niveauId !== undefined ? objets[m.niveauId] : undefined;
  if (haut?.classe !== "niveau" || bas?.classe !== "niveau") return nonEvaluee(`${m.id} : ni hauteur, ni niveau haut résolvable`);
  const h = haut.params.elevation.value - bas.params.elevation.value;
  return h > 0 ? val(h) : nonEvaluee(`${m.id} : niveau haut ${haut.id} pas au-dessus du niveau ${bas.id}`);
}

// --- Calcul -------------------------------------------------------------------------

interface Brute {
  readonly nature: NatureQuantite;
  readonly valeur: Val;
  readonly unite: UniteQuantite;
  readonly objetId: IdObjet;
  readonly niveauId: IdObjet | undefined;
  readonly entrees: readonly IdObjet[];
}

const UNITE: Readonly<Record<NatureQuantite, UniteQuantite>> = {
  "aire-piece": "m²",
  "aire-pieces-niveau": "m²",
  "aire-espace": "m²",
  "aire-zone": "m²",
  "longueur-mur": "m",
  "aire-mur": "m²",
  "effectif-portes": "unite",
  "effectif-fenetres": "unite",
  "effectif-ouvertures": "unite",
  "aire-mur-brute": "m²",
  "aire-baies-mur": "m²",
  "volume-mur": "m³",
  "aire-baie": "m²",
  "aire-dalle": "m²",
  "volume-dalle": "m³",
  "effectif-poteaux": "unite",
  "volume-poteau": "m³",
  "effectif-escaliers": "unite",
  "effectif-escaliers-reference-plan": "unite",
  "volume-solide": "m³",
  "aire-piece-declaree": "m²",
  "ecart-aire-piece": "m²",
};

/** Sommes par niveau et projet : nature de l'agrégat (par objet → agrégat), projet inclus ou non. */
const SOMMES: readonly { readonly de: NatureQuantite; readonly vers: NatureQuantite; readonly projet: boolean }[] = [
  { de: "longueur-mur", vers: "longueur-mur", projet: true },
  { de: "aire-mur", vers: "aire-mur", projet: true },
  { de: "aire-mur-brute", vers: "aire-mur-brute", projet: true },
  { de: "aire-baies-mur", vers: "aire-baies-mur", projet: true },
  { de: "volume-mur", vers: "volume-mur", projet: true },
  { de: "aire-baie", vers: "aire-baie", projet: true },
  { de: "aire-dalle", vers: "aire-dalle", projet: true },
  { de: "volume-dalle", vers: "volume-dalle", projet: true },
  { de: "volume-poteau", vers: "volume-poteau", projet: true },
  { de: "volume-solide", vers: "volume-solide", projet: true },
  { de: "aire-piece", vers: "aire-pieces-niveau", projet: false },
];

/** Effectifs : nature → prédicat sur l'objet (`null` = l'objet relève de l'effectif mais son critère est non évalué). */
const EFFECTIFS: readonly { readonly nature: NatureQuantite; readonly compte: (o: ObjetModele) => boolean | null }[] = [
  { nature: "effectif-portes", compte: (o) => o.classe === "porte" },
  { nature: "effectif-fenetres", compte: (o) => o.classe === "fenetre" },
  { nature: "effectif-ouvertures", compte: (o) => o.classe === "ouverture" },
  { nature: "effectif-poteaux", compte: (o) => o.classe === "poteau" },
  { nature: "effectif-escaliers", compte: (o) => o.classe === "escalier" },
  { nature: "effectif-escaliers-reference-plan", compte: (o) => (o.classe !== "escalier" ? false : estNonEvaluee(o.params.referencePlanSeulement) ? null : o.params.referencePlanSeulement === true) },
];

const comparer = (x: string, y: string): number => (x < y ? -1 : x > y ? 1 : 0);

function quantitesParObjet(etat: EtatModele, ids: readonly IdObjet[]): Brute[] {
  const objets = etat.objets;
  const res: Brute[] = [];
  const baiesParMur = new Map<IdObjet, ObjetBaie[]>();
  for (const id of ids) {
    const o = objets[id];
    if (o && (o.classe === "porte" || o.classe === "fenetre" || o.classe === "ouverture")) {
      const hote = objets[o.params.murHoteId];
      if (hote?.classe === "mur") baiesParMur.set(hote.id, [...(baiesParMur.get(hote.id) ?? []), o]);
    }
  }
  const ajouter = (o: ObjetModele, nature: NatureQuantite, valeur: Val, entrees: readonly IdObjet[] = [o.id]) =>
    res.push({ nature, valeur, unite: UNITE[nature], objetId: o.id, niveauId: o.niveauId, entrees });
  for (const id of ids) {
    const o = objets[id];
    if (!o) continue;
    switch (o.classe) {
      case "mur": {
        const axe = o.params.axe;
        const L: Val = duProjet(axe?.a) && duProjet(axe?.b) ? val(distance(axe.a, axe.b)) : nonEvaluee(`${o.id} : axe mal formé ou hors du repère local du projet`);
        const H = hauteurMur(objets, o);
        const e = positive(o, "epaisseur", o.params.epaisseur, "m");
        const baies = baiesParMur.get(o.id) ?? [];
        const aires = baies.map((b) => combiner([positive(b, "largeur", b.params.largeur, "m"), positive(b, "hauteur", b.params.hauteur, "m")], (l, h) => l * h));
        const aireBaies = combiner(aires, (...a) => a.reduce((s, x) => s + x, 0));
        const entrees = [o.id, ...baies.map((b) => b.id), ...(o.params.hauteur === undefined ? [o.niveauId, o.params.niveauHaut].filter((x): x is IdObjet => x !== undefined) : [])];
        const brute = combiner([L, H], (l, h) => l * h);
        ajouter(o, "longueur-mur", L);
        ajouter(o, "aire-mur-brute", brute, entrees);
        ajouter(o, "aire-baies-mur", aireBaies, [o.id, ...baies.map((b) => b.id)]);
        ajouter(o, "aire-mur", combiner([brute, aireBaies], (b, a) => b - a), entrees);
        ajouter(o, "volume-mur", combiner([L, H, e, aireBaies], (l, h, ep, a) => l * ep * h - a * ep), entrees);
        break;
      }
      case "porte":
      case "fenetre":
      case "ouverture":
        ajouter(o, "aire-baie", combiner([positive(o, "largeur", o.params.largeur, "m"), positive(o, "hauteur", o.params.hauteur, "m")], (l, h) => l * h));
        break;
      case "dalle": {
        const a = aireNette(o.params.contour, o.params.trous, o.id);
        ajouter(o, "aire-dalle", a);
        ajouter(o, "volume-dalle", combiner([a, positive(o, "epaisseur", o.params.epaisseur, "m")], (s, e) => s * e));
        break;
      }
      case "poteau": {
        const rect = (FORMES_POTEAU_RECTANGULAIRES as readonly string[]).includes(o.params.formeId);
        ajouter(
          o,
          "volume-poteau",
          rect
            ? combiner([positive(o, "largeur", o.params.largeur, "m"), positive(o, "profondeur", o.params.profondeur, "m"), positive(o, "hauteur", o.params.hauteur, "m")], (l, p, h) => l * p * h)
            : nonEvaluee(`${o.id} : forme « ${String(o.params.formeId)} » sans section définie par ${REGLE_QUANTITES}`),
        );
        break;
      }
      case "solide":
        ajouter(
          o,
          "volume-solide",
          o.params.ferme === true ? combiner([aireNette(o.params.contour, o.params.trous, o.id), positive(o, "hauteur", o.params.hauteur, "m")], (s, h) => s * h) : nonEvaluee(`${o.id} : contour ouvert`),
        );
        break;
      case "piece": {
        const calc = airePolygones(o.params.polygones, o.id, "pièce sans tracé courant");
        ajouter(o, "aire-piece", calc);
        const d = o.params.aireDeclaree;
        if (d !== undefined) {
          const decl: Val = typeof d.value === "number" && Number.isFinite(d.value) && d.unit === "m²" ? val(d.value) : nonEvaluee(`${o.id} : aire déclarée mal formée`);
          ajouter(o, "aire-piece-declaree", decl);
          ajouter(o, "ecart-aire-piece", combiner([calc, decl], (c, x) => c - x));
        }
        break;
      }
      case "espace":
        ajouter(o, "aire-espace", airePolygones(o.params.polygones, o.id, "aucun polygone"));
        break;
      case "zone":
        ajouter(o, "aire-zone", airePolygones(o.params.polygones, o.id, "aucun polygone"));
        break;
      default:
        break;
    }
  }
  return res;
}

interface Agregat {
  readonly nature: NatureQuantite;
  readonly niveauId: IdObjet | undefined;
  readonly valeur: Val;
  readonly partiel?: QuantitePartielle;
  readonly entrees: readonly IdObjet[];
}

function sommer(nature: NatureQuantite, niveauId: IdObjet | undefined, xs: readonly Brute[]): Agregat {
  const tries = [...xs].sort((p, q) => comparer(p.objetId, q.objetId));
  let somme = 0;
  let aVerifier = false;
  const nonEvalues: IdObjet[] = [];
  for (const x of tries) {
    if (estNE(x.valeur)) nonEvalues.push(x.objetId);
    else {
      somme += x.valeur.v;
      aVerifier ||= x.valeur.aVerifier;
    }
  }
  const entrees = tries.map((x) => x.objetId);
  if (nonEvalues.length === 0) return { nature, niveauId, valeur: val(somme, aVerifier), entrees };
  return {
    nature,
    niveauId,
    valeur: nonEvaluee(`partiel : ${nonEvalues.length} objet(s) non évalué(s) sur ${tries.length} (${nonEvalues.join(", ")}) ; somme des évalués ${somme} ${UNITE[nature]}`),
    partiel: { somme, nonEvalues },
    entrees,
  };
}

function agregats(etat: EtatModele, ids: readonly IdObjet[], parObjet: readonly Brute[]): Agregat[] {
  const res: Agregat[] = [];
  const niveauxDe = (xs: readonly { readonly niveauId?: IdObjet | undefined }[]) => [...new Set(xs.map((x) => x.niveauId).filter((n): n is IdObjet => n !== undefined))];
  for (const s of SOMMES) {
    const xs = parObjet.filter((q) => q.nature === s.de);
    for (const n of niveauxDe(xs)) res.push(sommer(s.vers, n, xs.filter((x) => x.niveauId === n)));
    if (s.projet && xs.length > 0) res.push(sommer(s.vers, undefined, xs));
  }
  for (const e of EFFECTIFS) {
    const objs = ids.map((id) => etat.objets[id]).filter((o): o is ObjetModele => o !== undefined && e.compte(o) !== false);
    const effectif = (niveauId: IdObjet | undefined, xs: readonly ObjetModele[]): Agregat => {
      const comptes = xs.filter((o) => e.compte(o) === true).map((o) => o.id);
      const nonEvalues = xs.filter((o) => e.compte(o) === null).map((o) => o.id);
      if (nonEvalues.length === 0) return { nature: e.nature, niveauId, valeur: val(comptes.length), entrees: comptes };
      return {
        nature: e.nature,
        niveauId,
        valeur: nonEvaluee(`partiel : critère non évalué pour ${nonEvalues.length} objet(s) (${nonEvalues.join(", ")}) ; ${comptes.length} compté(s)`),
        partiel: { somme: comptes.length, nonEvalues },
        entrees: xs.map((o) => o.id),
      };
    };
    for (const n of niveauxDe(objs)) res.push(effectif(n, objs.filter((o) => o.niveauId === n)));
    if (objs.length > 0) res.push(effectif(undefined, objs));
  }
  return res;
}

/** Calcul du contrat `CalculerQuantites` (pur) : toutes les natures de `quantites/1`, statut, agrégats partiels. */
export const calculerQuantites: CalculerQuantites = (etat: EtatModele, filtre?: FiltreQuantites): readonly Quantite[] => {
  const ids = Object.keys(etat.objets).sort(comparer);
  const parObjet = quantitesParObjet(etat, ids);
  const empreinte = calculerEmpreinte(etat);
  const base = { regle: REGLE_QUANTITES, revision: etat.revision, empreinte } as const;
  const sortie = (nature: NatureQuantite, v: Val, niveauId: IdObjet | undefined, objetId: IdObjet | undefined, entrees: readonly IdObjet[], partiel?: QuantitePartielle): Quantite => ({
    nature,
    valeur: estNE(v) ? v : v.v,
    unite: UNITE[nature],
    ...base,
    ...(objetId !== undefined ? { objetId } : {}),
    ...(niveauId !== undefined ? { niveauId } : {}),
    entrees: [...entrees],
    statut: estNE(v) ? "non-evaluee" : v.aVerifier ? "a-verifier" : "calculee",
    ...(partiel !== undefined ? { partiel } : {}),
  });
  const toutes: Quantite[] = [
    ...agregats(etat, ids, parObjet).map((a) => sortie(a.nature, a.valeur, a.niveauId, undefined, a.entrees, a.partiel)),
    ...parObjet.map((q) => sortie(q.nature, q.valeur, q.niveauId, q.objetId, q.entrees)),
  ];
  const rangNature = new Map(NATURES_QUANTITE.map((n, i) => [n, i]));
  const niveaux = ids
    .map((id) => etat.objets[id])
    .filter((o): o is Extract<ObjetModele, { classe: "niveau" }> => o?.classe === "niveau")
    .sort((p, q) => p.params.ordre - q.params.ordre || comparer(p.id, q.id));
  const rangNiveau = new Map(niveaux.map((n, i) => [n.id, i]));
  const cleNiveau = (n: IdObjet | undefined): [number, string] => (n === undefined ? [2, ""] : rangNiveau.has(n) ? [0, String(rangNiveau.get(n)).padStart(12, "0")] : [1, n]);
  const filtrees = toutes.filter((q) => (filtre?.niveauId === undefined || q.niveauId === filtre.niveauId) && (filtre?.natures === undefined || filtre.natures.includes(q.nature)));
  return filtrees.sort((p, q) => {
    const [gp, np] = cleNiveau(p.niveauId);
    const [gq, nq] = cleNiveau(q.niveauId);
    return (
      (rangNature.get(p.nature) ?? 0) - (rangNature.get(q.nature) ?? 0) ||
      gp - gq ||
      comparer(np, nq) ||
      (p.objetId === undefined ? 0 : 1) - (q.objetId === undefined ? 0 : 1) ||
      comparer(p.objetId ?? "", q.objetId ?? "")
    );
  });
};
