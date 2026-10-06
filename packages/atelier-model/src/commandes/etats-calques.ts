/**
 * États de calques (D-119, DA-05-03) : instantané nommé de la visibilité, du verrouillage et du gel de chaque calque,
 * enregistré dans le modèle (définition `etat-calques`) — donc versionné avec lui : chaque enregistrement est une
 * révision, relue et comparée dans l'historique comme toute définition. `etatCalques.restaurer` remet les calques
 * de l'instantané dans leur état (un lot, inverse exact) ; un calque créé depuis garde le sien, un calque supprimé
 * depuis sort de l'instantané (avec la suppression). Aucun objet n'est touché.
 */
import type { Calque, Definition, ModeleAtelier } from "../modele.js";
import { effetsVides, ErreurCommande, lire, type ContexteCommande, type Reducteur } from "./base.js";

type Brut = Record<string, unknown>;

export const CLASSE_ETAT_CALQUES = "etat-calques" as Definition["classe"];

export interface EtatCalque {
  visible: boolean;
  verrouille: boolean;
  gele: boolean;
}

export interface ParamsEtatCalques {
  nom: string;
  calques: Record<string, EtatCalque>;
}

const etatDe = (c: Calque): EtatCalque => ({ visible: c.visible, verrouille: c.verrouille, gele: c.gele === true });

/** Relecture validée (archives, reprise) : calques connus seulement, trois booléens chacun. */
export function lireParamsEtatCalques(etat: ModeleAtelier, p: Brut): ParamsEtatCalques {
  const nom = lire.chaine(p, "nom").trim();
  if (!nom || nom.length > 80) throw new ErreurCommande("invalide", "nom", "nom de l'état de calques requis (80 caractères au plus)");
  const brut = p["calques"];
  if (!brut || typeof brut !== "object" || Array.isArray(brut)) throw new ErreurCommande("invalide", "calques", "« calques » : état par identifiant de calque");
  const calques: Record<string, EtatCalque> = {};
  for (const [id, v] of Object.entries(brut as Record<string, unknown>)) {
    if (!etat.calques[id]) continue; // calque disparu : sorti de l'instantané
    const e = v as Partial<EtatCalque>;
    if (typeof e?.visible !== "boolean" || typeof e.verrouille !== "boolean" || typeof e.gele !== "boolean") throw new ErreurCommande("invalide", `calques.${id}`, "visible, verrouille et gele : booléens");
    calques[id] = { visible: e.visible, verrouille: e.verrouille, gele: e.gele };
  }
  return { nom, calques };
}

export const reducteursEtatCalques: Record<string, Reducteur> = {
  /** Enregistre l'état courant de tous les calques (nouvel instantané, ou mise à jour d'un instantané existant). */
  "etatCalques.enregistrer": (etat, p, ctx: ContexteCommande) => {
    const id = lire.chaineOuNull(p, "id") ?? ctx.ids.nouveau("etat-calques");
    const existant = etat.definitions[id];
    if (existant && existant.classe !== CLASSE_ETAT_CALQUES) throw new ErreurCommande("precondition", "id", `définition déjà existante : ${id}`);
    const nom = (p["nom"] === undefined && existant ? existant.nom : lire.chaine(p, "nom")).trim();
    if (!nom || nom.length > 80) throw new ErreurCommande("invalide", "nom", "nom de l'état de calques requis (80 caractères au plus)");
    if (Object.keys(etat.calques).length === 0) throw new ErreurCommande("precondition", "id", "aucun calque à enregistrer");
    const calques = Object.fromEntries(Object.values(etat.calques).sort((a, b) => (a.id < b.id ? -1 : 1)).map((c) => [c.id, etatDe(c)]));
    const params: ParamsEtatCalques = { nom, calques };
    const effets = effetsVides();
    (existant ? effets.modifies : effets.crees).push(id);
    const def: Definition = { id, classe: CLASSE_ETAT_CALQUES, nom, params: params as unknown as Brut, version: existant ? existant.version + 1 : 1 };
    return { etat: { ...etat, definitions: { ...etat.definitions, [id]: def } }, effets };
  },
  /** Remet les calques de l'instantané dans leur état enregistré. */
  "etatCalques.restaurer": (etat, p) => {
    const id = lire.chaine(p, "id");
    const d = etat.definitions[id];
    if (d?.classe !== CLASSE_ETAT_CALQUES) throw new ErreurCommande("precondition", "id", `état de calques inconnu : ${id}`);
    const params = d.params as unknown as ParamsEtatCalques;
    const calques = { ...etat.calques };
    const effets = effetsVides();
    for (const [cid, e] of Object.entries(params.calques)) {
      const c = calques[cid];
      if (!c) continue;
      if (c.visible === e.visible && c.verrouille === e.verrouille && (c.gele === true) === e.gele) continue;
      const { gele: _g, ...reste } = c;
      void _g;
      calques[cid] = { ...reste, visible: e.visible, verrouille: e.verrouille, ...(e.gele ? { gele: true } : {}) };
      effets.modifies.push(cid);
    }
    if (!effets.modifies.length) throw new ErreurCommande("precondition", "id", `« ${d.nom} » : les calques sont déjà dans cet état`);
    return { etat: { ...etat, calques }, effets };
  },
  "etatCalques.supprimer": (etat, p) => {
    const id = lire.chaine(p, "id");
    if (etat.definitions[id]?.classe !== CLASSE_ETAT_CALQUES) throw new ErreurCommande("precondition", "id", `état de calques inconnu : ${id}`);
    const definitions = { ...etat.definitions };
    delete definitions[id];
    const effets = effetsVides();
    effets.supprimes.push(id);
    return { etat: { ...etat, definitions }, effets };
  },
};

export const etatsCalques = (etat: ModeleAtelier): (Definition & { params: ParamsEtatCalques })[] =>
  Object.values(etat.definitions)
    .filter((d): d is Definition & { params: ParamsEtatCalques } => d.classe === CLASSE_ETAT_CALQUES)
    .sort((a, b) => a.nom.localeCompare(b.nom, "fr") || (a.id < b.id ? -1 : 1));
