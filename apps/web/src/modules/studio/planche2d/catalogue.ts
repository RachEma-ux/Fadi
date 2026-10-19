/**
 * Catalogue des outils (gestionnaire « Outils » et palette de commandes, #166 « Registry ») : chaque entrée est lue
 * dans le registre `STUDIO_TOOLS` (jamais recopiée) ou dans `COMMANDES_EDITEUR`, rangée par barre, avec son icône,
 * ses raccourcis, sa nature et son exposition aux agents (affichage seulement). Recherche par nom, raccourci ou
 * identifiant, sans casse ni accents. Pur : ni React ni DOM.
 *
 * Manifeste (B.1-03) : contextes, droit requis et propriétaire viennent du manifeste versionné du modèle
 * (`STUDIO_MANIFESTE_OUTILS`) pour les outils du registre, et de `MANIFESTE_COMMANDES` (ci-dessous) pour les commandes
 * de l'éditeur, propriété de l'interface Studio. Filtres du catalogue (B.2-01) : `filtrerCatalogue`.
 */
import { entreeManifeste, STUDIO_TOOLS, type StudioContexteOutil, type StudioDroitOutil } from "@parcours/atelier-model";
import {
  BARRES_STUDIO, COMMANDES_EDITEUR, libelleRaccourci, type BarreStudio, type CibleRaccourci, type CommandeEditeur, type IdCommandeEditeur, type StudioToolEntry,
} from "./raccourcis";

const P2D = ["planche-2d"] as const;
const V3D = ["vue-3d"] as const;
const P2D_V3D = ["planche-2d", "vue-3d"] as const;
/**
 * Contextes des commandes de l'éditeur (hors registre) ; `satisfies` impose une entrée par commande. Propriétaire :
 * l'interface Studio (`PROPRIETAIRE_EDITEUR`) ; droit : `ecriture` pour une commande indisponible en lecture seule.
 */
export const MANIFESTE_COMMANDES = Object.freeze({
  annuler: P2D_V3D, retablir: P2D_V3D, "annuler-trace": P2D_V3D, enregistrer: P2D_V3D, "tout-selectionner": P2D,
  "terminer-polyligne": P2D, "fermer-polyligne": P2D,
  "zoom-avant": P2D, "zoom-arriere": P2D, cadrer: P2D, "plein-ecran": P2D_V3D, "vue-3d": P2D_V3D, "navigation-3d": V3D, "coupe-3d": V3D,
  "accrochage-sommets": P2D, "accrochage-grille": P2D, "accrochage-milieu": P2D, "accrochage-centre": P2D, "accrochage-quadrant": P2D,
  "accrochage-intersection": P2D, "accrochage-perpendiculaire": P2D, "accrochage-tangente": P2D, "accrochage-proche": P2D,
  "reperage-orthogonal": P2D, "reperage-polaire": P2D, "pas-polaire": P2D,
  "importer-dxf": P2D, "exporter-svg": P2D, "exporter-dxf": P2D, "exporter-ifc": P2D, feuille: ["feuille"], "exporter-png": V3D,
  outils: ["planche-2d", "vue-3d", "feuille"], palette: ["planche-2d", "vue-3d", "feuille"],
  exigences: P2D, dossier: ["planche-2d", "vue-3d", "feuille"],
} as const satisfies Record<IdCommandeEditeur, readonly StudioContexteOutil[]>);
export const PROPRIETAIRE_EDITEUR = Object.freeze({ id: "studio.editeur", module: "apps/web/src/modules/studio" });

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
  /** Contextes où l'entrée agit (manifeste). */
  readonly contextes: readonly StudioContexteOutil[];
  /** Droit requis pour l'exécuter (manifeste) ; le verdict réel reste au serveur. */
  readonly droit: StudioDroitOutil;
  /** Propriétaire du contrat (module du modèle, ou l'interface pour une commande de l'éditeur). */
  readonly proprietaire: string;
}

export const CATALOGUE: readonly EntreeCatalogue[] = Object.freeze([
  ...STUDIO_TOOLS.map((t): EntreeCatalogue => {
    const m = entreeManifeste(t.toolId)!;
    return {
      identifiant: t.toolId, cible: { type: "outil", toolId: t.toolId }, libelleFR: t.libelleFR, raccourcis: [t.raccourci],
      icone: t.iconeSymbolique, barre: t.groupe, nature: t.nature, agentExposure: t.agentExposure, outil: t, commande: null,
      contextes: m.contextes, droit: m.droit, proprietaire: m.proprietaire.id,
    };
  }),
  ...COMMANDES_EDITEUR.map((c): EntreeCatalogue => ({
    identifiant: c.id, cible: { type: "commande", id: c.id }, libelleFR: c.libelleFR, raccourcis: [c.raccourci, ...(c.autres ?? [])],
    icone: c.iconeSymbolique, barre: c.groupe, nature: "editeur", agentExposure: null, outil: null, commande: c,
    contextes: MANIFESTE_COMMANDES[c.id], droit: c.ecrit ? "ecriture" : "lecture", proprietaire: PROPRIETAIRE_EDITEUR.id,
  })),
]);

/** Filtres du catalogue autorisé (B.2-01) ; un champ absent ne filtre pas. */
export interface FiltresCatalogue {
  barre?: BarreStudio;
  contexte?: StudioContexteOutil;
  nature?: EntreeCatalogue["nature"];
  /** Seulement les favoris (outils du registre). */
  favoris?: boolean;
  /** Seulement ce que le compte peut exécuter ici (droit réel : `autorise`). */
  executables?: boolean;
  /** Seulement les outils de ce regroupement personnel. */
  groupe?: string;
}

/** Ce que les filtres lisent des préférences et du droit réel, injecté (aucun état global). */
export interface SourcesFiltres {
  favoris: readonly string[];
  groupes: readonly { id: string; outils: readonly string[] }[];
  /** Droit réel d'exécution (serveur, révision, enregistrement) ; ne dit rien de la visibilité. */
  autorise: (e: EntreeCatalogue) => boolean;
}

export function filtrerCatalogue(entrees: readonly EntreeCatalogue[], f: FiltresCatalogue, s: SourcesFiltres): EntreeCatalogue[] {
  const fav = new Set(s.favoris);
  const groupe = f.groupe === undefined ? null : new Set(s.groupes.find((g) => g.id === f.groupe)?.outils ?? []);
  return entrees.filter((e) => (f.barre === undefined || e.barre === f.barre)
    && (f.contexte === undefined || e.contextes.includes(f.contexte))
    && (f.nature === undefined || e.nature === f.nature)
    && (!f.favoris || (e.outil !== null && fav.has(e.identifiant)))
    && (groupe === null || (e.outil !== null && groupe.has(e.identifiant)))
    && (!f.executables || s.autorise(e)));
}

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
