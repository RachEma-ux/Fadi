/**
 * Ensembles d'affichage partagés (D-066, fiche DA-05-03) : un ensemble d'affichage (préréglage de calques et de
 * classes masqués, local par défaut, R10) peut être partagé avec l'équipe comme définition `ensemble-affichage`
 * { nom, calquesMasques, classesMasquees, niveauId } et, au choix, associé à un étage (appliqué quand on y passe).
 * Un ensemble ne fait que réduire l'affichage : il ne révèle jamais un calque masqué dans le modèle, et n'écrit
 * rien d'autre que sa propre définition.
 */
import type { Definition, ModeleAtelier } from "../modele.js";
import { estClasse } from "../ontologie.js";
import { effetsVides, ErreurCommande, lire, type ContexteCommande, type Reducteur } from "./base.js";

type Brut = Record<string, unknown>;

export const CLASSE_ENSEMBLE = "ensemble-affichage" as Definition["classe"];

export interface ParamsEnsembleAffichage {
  nom: string;
  calquesMasques: string[];
  classesMasquees: string[];
  /** Étage associé : l'ensemble s'applique quand on passe sur cet étage ; null = aucun. */
  niveauId: string | null;
}

export function lireParamsEnsemble(etat: ModeleAtelier, p: Brut): ParamsEnsembleAffichage {
  const nom = lire.chaine(p, "nom").trim();
  if (!nom || nom.length > 80) throw new ErreurCommande("invalide", "nom", "nom de l'ensemble requis (80 caractères au plus)");
  const liste = (cle: string): string[] => {
    const v = p[cle] ?? [];
    if (!Array.isArray(v) || !v.every((x) => typeof x === "string")) throw new ErreurCommande("invalide", cle, `« ${cle} » : liste d'identifiants`);
    return [...new Set(v as string[])].sort();
  };
  const calquesMasques = liste("calquesMasques");
  for (const c of calquesMasques) if (!etat.calques[c]) throw new ErreurCommande("precondition", "calquesMasques", `calque inconnu : ${c}`);
  const classesMasquees = liste("classesMasquees");
  for (const c of classesMasquees) if (!estClasse(c)) throw new ErreurCommande("invalide", "classesMasquees", `classe inconnue : ${c}`);
  const niveauId = lire.chaineOuNull(p, "niveauId");
  if (niveauId && !etat.niveaux[niveauId]) throw new ErreurCommande("precondition", "niveauId", `niveau inconnu : ${niveauId}`);
  return { nom, calquesMasques, classesMasquees, niveauId };
}

export const reducteursEnsemble: Record<string, Reducteur> = {
  "ensemble.enregistrer": (etat, p, ctx: ContexteCommande) => {
    const id = lire.chaineOuNull(p, "id") ?? ctx.ids.nouveau("ensemble");
    const existant = etat.definitions[id];
    if (existant && existant.classe !== CLASSE_ENSEMBLE) throw new ErreurCommande("precondition", "id", `définition déjà existante : ${id}`);
    const params = lireParamsEnsemble(etat, p);
    const effets = effetsVides();
    (existant ? effets.modifies : effets.crees).push(id);
    const def: Definition = { id, classe: CLASSE_ENSEMBLE, nom: params.nom, params: params as unknown as Brut, version: existant ? existant.version + 1 : 1 };
    return { etat: { ...etat, definitions: { ...etat.definitions, [id]: def } }, effets };
  },
  "ensemble.supprimer": (etat, p) => {
    const id = lire.chaine(p, "id");
    if (etat.definitions[id]?.classe !== CLASSE_ENSEMBLE) throw new ErreurCommande("precondition", "id", `ensemble d'affichage inconnu : ${id}`);
    const definitions = { ...etat.definitions };
    delete definitions[id];
    const effets = effetsVides();
    effets.supprimes.push(id);
    return { etat: { ...etat, definitions }, effets };
  },
};

export const ensemblesPartages = (etat: ModeleAtelier): (Definition & { params: ParamsEnsembleAffichage })[] =>
  Object.values(etat.definitions)
    .filter((d): d is Definition & { params: ParamsEnsembleAffichage } => d.classe === CLASSE_ENSEMBLE)
    .sort((a, b) => a.nom.localeCompare(b.nom, "fr") || (a.id < b.id ? -1 : 1));
