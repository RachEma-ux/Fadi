/**
 * Piège du focus des boîtes de dialogue de Studio (Outils, palette, Feuille, import DXF) : Tab et Maj+Tab bouclent
 * dans la boîte, le focus qui en sort y revient, Échap ferme, et le focus revient à l'élément d'origine à la fermeture.
 * La partie pure (`suivantDansLePiege`) choisit l'élément suivant ; le reste lit le DOM.
 */

/** Éléments qui prennent le focus au clavier. */
export const FOCALISABLES = 'a[href],area[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),iframe,summary,[contenteditable="true"],[tabindex]:not([tabindex="-1"])';

/**
 * Index du prochain élément focalisé dans une boîte de `n` éléments : Tab après le dernier revient au premier,
 * Maj+Tab avant le premier va au dernier ; un focus hors de la boîte (`courant` = -1) va au premier (ou au dernier).
 * null : rien à faire (le navigateur passe à l'élément suivant dans la boîte).
 */
export function suivantDansLePiege(n: number, courant: number, arriere: boolean): number | null {
  if (n <= 0) return null;
  if (courant < 0) return arriere ? n - 1 : 0;
  if (!arriere && courant === n - 1) return 0;
  if (arriere && courant === 0) return n - 1;
  return null;
}

/** Marque d'un élément rendu hors de la boîte (portail : liste déroulante, infobulle…) mais qui lui appartient. */
export const ATTRIBUT_PORTAIL = "data-studio-dialogue-portail";

/**
 * Le focus sur `cible` appartient-il à la boîte ? Oui s'il est dedans, ou dans un élément marqué
 * `data-studio-dialogue-portail` (rendu ailleurs dans la page) : le piège ne l'en retire pas.
 */
export function appartientAuDialogue(cible: Element | null, boite: Pick<Node, "contains"> | null): boolean {
  if (!cible || !boite) return false;
  return boite.contains(cible) || cible.closest(`[${ATTRIBUT_PORTAIL}]`) !== null;
}

/** Éléments focalisables visibles d'une boîte. */
export function focalisables(racine: Element): HTMLElement[] {
  return [...racine.querySelectorAll<HTMLElement>(FOCALISABLES)].filter((el) => !el.closest("[inert],[hidden]") && el.getClientRects().length > 0);
}
