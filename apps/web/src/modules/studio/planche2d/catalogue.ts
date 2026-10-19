/**
 * Catalogue des outils (gestionnaire « Outils » et palette de commandes, #166 « Registry ») : chaque entrée est lue
 * dans le registre `STUDIO_TOOLS` (jamais recopiée) ou dans `COMMANDES_EDITEUR`, rangée par barre, avec son icône,
 * ses raccourcis, sa nature et son exposition aux agents (affichage seulement). Recherche par nom, raccourci ou
 * identifiant, sans casse ni accents. Pur : ni React ni DOM.
 */
import { STUDIO_TOOLS } from "@parcours/atelier-model";
import {
  BARRES_STUDIO, COMMANDES_EDITEUR, libelleRaccourci, type BarreStudio, type CibleRaccourci, type CommandeEditeur, type StudioToolEntry,
} from "./raccourcis";

export interface EntreeCatalogue {
  /** Identifiant affiché et cherché : `toolId` du registre, ou identifiant de la commande de l'éditeur. */
  readonly identifiant: string;
  readonly cible: CibleRaccourci;
  readonly libelleFR: string;
  readonly raccourcis: readonly string[];
  readonly icone: StudioToolEntry["iconeSymbolique"] | CommandeEditeur["iconeSymbolique"];
  readonly barre: BarreStudio;
  /** `lecture` / `mutation` pour le registre ; `editeur` pour une commande locale de l'éditeur. */
  readonly nature: "lecture" | "mutation" | "editeur";
  /** Exposition aux agents telle que le registre la déclare ; null pour une commande de l'éditeur (hors registre). */
  readonly agentExposure: StudioToolEntry["agentExposure"] | null;
  /** Descripteur du registre, tel quel (même objet). */
  readonly outil: StudioToolEntry | null;
  readonly commande: CommandeEditeur | null;
}

export const CATALOGUE: readonly EntreeCatalogue[] = Object.freeze([
  ...STUDIO_TOOLS.map((t): EntreeCatalogue => ({
    identifiant: t.toolId, cible: { type: "outil", toolId: t.toolId }, libelleFR: t.libelleFR, raccourcis: [t.raccourci],
    icone: t.iconeSymbolique, barre: t.groupe, nature: t.nature, agentExposure: t.agentExposure, outil: t, commande: null,
  })),
  ...COMMANDES_EDITEUR.map((c): EntreeCatalogue => ({
    identifiant: c.id, cible: { type: "commande", id: c.id }, libelleFR: c.libelleFR, raccourcis: [c.raccourci, ...(c.autres ?? [])],
    icone: c.iconeSymbolique, barre: c.groupe, nature: "editeur", agentExposure: null, outil: null, commande: c,
  })),
]);

/** Minuscules, sans accents ni espaces superflus. */
export const normaliser = (s: string): string => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Pertinence d'une entrée pour une recherche (0 = écartée) : nom commençant par la recherche, puis nom, raccourci
 * (forme du registre ou forme affichée, « Maj+C »), identifiant. `autres` : textes affichés en plus (traduction).
 */
export function pertinence(e: EntreeCatalogue, recherche: string, autres: readonly string[] = []): number {
  const q = normaliser(recherche);
  if (!q) return 1;
  const noms = [e.libelleFR, ...autres].map(normaliser);
  if (noms.some((n) => n === q)) return 5;
  if (noms.some((n) => n.startsWith(q))) return 4;
  if (noms.some((n) => n.includes(q))) return 3;
  if (e.raccourcis.some((r) => normaliser(r) === q || normaliser(libelleRaccourci(r)) === q)) return 3;
  if (normaliser(e.identifiant).includes(q)) return 2;
  if (e.raccourcis.some((r) => normaliser(r).includes(q) || normaliser(libelleRaccourci(r)).includes(q))) return 1;
  return 0;
}

/** Entrées retenues par la recherche, les plus pertinentes d'abord (ordre du catalogue à égalité). */
export function rechercher(recherche: string, autres: (e: EntreeCatalogue) => readonly string[] = () => []): EntreeCatalogue[] {
  return CATALOGUE.map((e, i) => ({ e, i, p: pertinence(e, recherche, autres(e)) }))
    .filter((x) => x.p > 0)
    .sort((a, b) => b.p - a.p || a.i - b.i)
    .map((x) => x.e);
}

/**
 * Groupe « Favoris » de la palette : les entrées favorites (registre seulement), dans l'ordre reçu (pertinence de la
 * recherche), puis les autres. Une entrée n'apparaît qu'une fois ; rien n'est retiré.
 */
export function separerFavoris(entrees: readonly EntreeCatalogue[], favoris: readonly string[]): { favoris: EntreeCatalogue[]; autres: EntreeCatalogue[] } {
  const f = new Set(favoris);
  const estFavori = (e: EntreeCatalogue) => e.outil !== null && f.has(e.identifiant);
  return { favoris: entrees.filter(estFavori), autres: entrees.filter((e) => !estFavori(e)) };
}

/** Groupes du gestionnaire : une section par barre, dans l'ordre des barres. */
export const groupesCatalogue = (entrees: readonly EntreeCatalogue[]): { barre: (typeof BARRES_STUDIO)[number]; entrees: EntreeCatalogue[] }[] =>
  BARRES_STUDIO.map((barre) => ({ barre, entrees: entrees.filter((e) => e.barre === barre.id) })).filter((g) => g.entrees.length > 0);
