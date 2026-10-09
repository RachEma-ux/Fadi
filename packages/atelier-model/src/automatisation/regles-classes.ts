/**
 * Règles par ontologie (P2-8 ; DA-19-05 Knowledgeware) — pures.
 *
 * Une règle de conception (`regle.definir`) porte soit sur une famille paramétrique (P2-2, `familleId`), soit sur une
 * **classe** d'une ontologie (`classe` : `mur`, `poutre`, `segment-reseau`…) : son expression (comparaison de l'arithmétique
 * bornée du lot 8) est contrôlée sur **chaque occurrence** de la classe, avec les valeurs numériques de ses paramètres
 * (grandeurs `{ value, unit }` ramenées à leur nombre, `niveau_elevation` et `niveau_hauteur` du niveau porteur). Une
 * règle non tenue produit un problème « regle » rattaché à l'objet, **jamais une correction** (R3 : la règle vient du
 * projet avec sa source, Fadi n'en fournit aucune). Une variable absente d'un objet le laisse « non évalué » : un seul
 * problème par règle le dit, sans inventer de valeur.
 */
import type { ModeleAtelier, OccurrenceQuelconque, Probleme } from "../modele.js";
import { effetsVides, nouveauProbleme, type ContexteCommande, type ResultatCommande } from "../commandes/base.js";
import { controlerRegle, type ParamsRegle } from "../ontologies/mechanical/familles.js";

const NOM = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Valeurs numériques lisibles par une règle sur un objet : paramètres nombres et grandeurs, puis niveau porteur. */
export function valeursObjet(etat: Pick<ModeleAtelier, "niveaux">, o: OccurrenceQuelconque): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(o.params as Record<string, unknown>)) {
    if (!NOM.test(k)) continue;
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    else if (v && typeof v === "object" && !Array.isArray(v) && typeof (v as { value?: unknown }).value === "number" && typeof (v as { unit?: unknown }).unit === "string") out[k] = (v as { value: number }).value;
    else if (v && typeof v === "object" && !Array.isArray(v)) {
      // Un niveau d'imbrication (section { largeur, hauteur }, point { x, y }) : « section_largeur », « a_x ».
      for (const [k2, v2] of Object.entries(v as Record<string, unknown>)) {
        if (!NOM.test(k2)) continue;
        if (typeof v2 === "number" && Number.isFinite(v2)) out[`${k}_${k2}`] = v2;
        else if (v2 && typeof v2 === "object" && typeof (v2 as { value?: unknown }).value === "number") out[`${k}_${k2}`] = (v2 as { value: number }).value;
      }
    }
  }
  if (o.niveauId && etat.niveaux[o.niveauId]) {
    const n = etat.niveaux[o.niveauId]!;
    out["niveau_elevation"] = n.elevation;
    if (typeof n.hauteur === "number") out["niveau_hauteur"] = n.hauteur;
  }
  return out;
}

export interface ControleClasse {
  regleId: string;
  nom: string;
  classe: string;
  /** Objets de la classe, objets non tenus (message), objets non évalués (variable absente). */
  objets: number;
  nonTenus: { objetId: string; message: string }[];
  nonEvalues: { objetId: string; variable: string }[];
}

/** Contrôle de toutes les règles de classe sur l'état donné (lecture pure, aucun problème écrit). */
export function controlesClasses(etat: ModeleAtelier): ControleClasse[] {
  const regles = Object.values(etat.definitions).filter((d) => d.classe === "regle" && typeof (d.params as { classe?: unknown }).classe === "string").sort((a, b) => (a.id < b.id ? -1 : 1));
  if (!regles.length) return [];
  const objets = Object.values(etat.objets) as OccurrenceQuelconque[];
  return regles.map((d) => {
    const r = d.params as unknown as ParamsRegle & { classe: string };
    const cibles = objets.filter((o) => o.classe === r.classe).sort((a, b) => (a.id < b.id ? -1 : 1));
    const nonTenus: ControleClasse["nonTenus"] = [];
    const nonEvalues: ControleClasse["nonEvalues"] = [];
    for (const o of cibles) {
      const valeurs = valeursObjet(etat, o);
      try {
        const m = controlerRegle({ expression: r.expression, message: r.message, familleId: null }, valeurs);
        if (m) nonTenus.push({ objetId: o.id, message: m });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const variable = /variable inconnue « ([^»]+) »/.exec(msg)?.[1] ?? msg;
        nonEvalues.push({ objetId: o.id, variable });
      }
    }
    return { regleId: d.id, nom: d.nom, classe: r.classe, objets: cibles.length, nonTenus, nonEvalues };
  });
}

/**
 * Contrôle après chaque commande : les problèmes « regle » rattachés à un objet sont recalculés (les problèmes de famille,
 * sans objet, restent ceux de `regles.controler`). Identifiants stables : `pb-regle-<regle>-<objet>`.
 */
export function controlerReglesClasses(_avant: ModeleAtelier, etat: ModeleAtelier, ctx: ContexteCommande): ResultatCommande {
  const controles = controlesClasses(etat);
  const anciens = Object.values(etat.problemes).filter((pb) => pb.type === "regle" && (pb.objetId !== null || pb.message.includes("non évalué")));
  if (!controles.length && !anciens.length) return { etat, effets: effetsVides() };
  const problemes: Record<string, Probleme> = Object.fromEntries(Object.entries(etat.problemes).filter(([, pb]) => !(pb.type === "regle" && (pb.objetId !== null || pb.message.includes("non évalué")))));
  const effets = effetsVides();
  for (const c of controles) {
    for (const nt of c.nonTenus) {
      const id = `pb-regle-${c.regleId}-${nt.objetId}`;
      const pb: Probleme = anciens.find((a) => a.id === id && a.message === `${c.nom} : ${nt.message}`) ?? { id, type: "regle", objetId: nt.objetId, message: `${c.nom} : ${nt.message}` };
      problemes[id] = pb;
      if (!anciens.some((a) => a.id === id)) effets.problemes.push(pb);
    }
    if (c.nonEvalues.length) {
      const variables = [...new Set(c.nonEvalues.map((x) => x.variable))].sort();
      const message = `${c.nom} : ${c.nonEvalues.length} objet(s) « ${c.classe} » non évalué(s) — variable absente : ${variables.join(", ")}`;
      const id = `pb-regle-${c.regleId}-non-evalue`;
      const pb: Probleme = anciens.find((a) => a.id === id && a.message === message) ?? { id, type: "regle", objetId: null, message };
      problemes[id] = pb;
      if (!anciens.some((a) => a.id === id)) effets.problemes.push(pb);
    }
  }
  void nouveauProbleme;
  void ctx;
  const inchange = Object.keys(problemes).length === Object.keys(etat.problemes).length && Object.entries(problemes).every(([k, v]) => etat.problemes[k] === v || (etat.problemes[k]?.message === v.message && etat.problemes[k]?.objetId === v.objetId));
  return inchange ? { etat, effets: effetsVides() } : { etat: { ...etat, problemes }, effets };
}
