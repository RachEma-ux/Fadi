/**
 * Extensions installées sur la plateforme (protocole 1.0, lot 3) : les paquets `fadi-addon/1` que l'administrateur a
 * importés. Ils vivent en base (`addon_packages`), jamais dans le code de Fadi ; le serveur les juge à l'import, le
 * navigateur les relit à la réception, avec les mêmes règles. Pur : ni React, ni DOM, ni base.
 *
 * Règles d'import, en plus de la forme du paquet (`validerPaquetExtension`) :
 *  - l'identifiant ne reprend pas celui d'une extension livrée par Fadi ;
 *  - chaque raccourci porte un modificateur ou est une touche de fonction (une lettre seule appartient aux outils et à
 *    la saisie des mesures), et n'est pris ni par la Planche, ni par le navigateur, ni par une autre extension
 *    installée — règle d'or : un raccourci désigne une seule commande ;
 *  - l'icône de chaque commande et de chaque outil est un dessin SVG du paquet (affiché comme une image : rien de ce
 *    qu'il contient ne s'exécute).
 * Un refus est nommé, jamais un filtrage silencieux.
 */
import { normaliserRaccourci } from "./catalogue-outils.js";
import { extensionSandbox } from "./extensions-sandbox.js";
import { validerPaquetExtension, type EntreeDeclaree, type MotifRefusPaquet, type PaquetExtension } from "./protocole-extensions.js";
import { RACCOURCI_RECHERCHE, RACCOURCIS_NAVIGATEUR, REGISTRE_SANDBOX } from "./registre-sandbox.js";

/** Combinaisons que la Planche traite elle-même, hors de son registre : annuler, rétablir, tout sélectionner, presse-papiers, zoom. */
export const RACCOURCIS_PLANCHE_RESERVES: readonly string[] = Object.freeze(["Ctrl+Z", "Ctrl+Maj+Z", "Ctrl+Y", "Ctrl+A", "Ctrl+C", "Ctrl+X", "Ctrl+V", "Ctrl+Maj+I", RACCOURCI_RECHERCHE]);

export type MotifRefusImport = MotifRefusPaquet | "identifiant_reserve" | "raccourci_refuse" | "icone_invalide";
export type JugementImport = { readonly ok: true; readonly paquet: PaquetExtension } | { readonly ok: false; readonly erreur: MotifRefusImport; readonly detail: string };

const AVEC_MODIFICATEUR = /^(?:(?:Ctrl|Alt|Maj)\+)+(?:[A-Z0-9]|F(?:[1-9]|1[0-2]))$/;
const FONCTION_SEULE = /^F(?:[1-9]|1[0-2])$/;
/** Maj + lettre ou chiffre écrit un caractère (saisie des mesures) : refusé comme une touche seule. */
const MAJ_SEULE = /^Maj\+[A-Z0-9]$/;

const PRIS_PAR_FADI: ReadonlyMap<string, string> = new Map([
  ...REGISTRE_SANDBOX.flatMap((e) => (e.raccourci ? [[normaliserRaccourci(e.raccourci), `${e.nature} « ${e.id} » de la Planche`] as const] : [])),
  ...RACCOURCIS_PLANCHE_RESERVES.map((r) => [normaliserRaccourci(r), "la Planche"] as const),
  ...RACCOURCIS_NAVIGATEUR.map((r) => [normaliserRaccourci(r), "le navigateur"] as const),
]);

const entreesDe = (p: PaquetExtension): readonly EntreeDeclaree[] => [...p.fiche.commandes, ...p.fiche.outils];

/** Le texte d'une page est-il un dessin SVG ? (Forme seulement : il n'est jamais interprété comme une page.) */
export const estDessinSvg = (texte: string): boolean => /^\s*(?:<\?xml[^>]*\?>\s*)?<svg[\s>]/.test(texte) && /<\/svg>\s*$/.test(texte);

/**
 * Juge un paquet présenté à l'import, face aux extensions déjà installées (une extension de même identifiant est
 * remplacée : elle ne compte pas parmi les autres).
 */
export function jugerImportPaquet(v: unknown, installees: readonly PaquetExtension[] = []): JugementImport {
  const lu = validerPaquetExtension(v);
  if (!lu.ok) return lu;
  const p = lu.paquet;
  if (extensionSandbox(p.fiche.id)) return { ok: false, erreur: "identifiant_reserve", detail: `« ${p.fiche.id} » est une extension livrée par Fadi` };
  const autres = new Map<string, string>();
  for (const x of installees) if (x.fiche.id !== p.fiche.id) for (const e of entreesDe(x)) autres.set(normaliserRaccourci(e.raccourci), `l'extension « ${x.fiche.id} »`);
  for (const e of entreesDe(p)) {
    const r = normaliserRaccourci(e.raccourci);
    if (!(AVEC_MODIFICATEUR.test(r) || FONCTION_SEULE.test(r)) || MAJ_SEULE.test(r)) return { ok: false, erreur: "raccourci_refuse", detail: `« ${e.id} » : ${e.raccourci} — un modificateur (Ctrl, Alt) ou une touche de fonction est attendu` };
    const preneur = PRIS_PAR_FADI.get(r) ?? autres.get(r);
    if (preneur) return { ok: false, erreur: "raccourci_refuse", detail: `« ${e.id} » : ${e.raccourci} est déjà pris par ${preneur}` };
    if (!e.icone.endsWith(".svg") || !estDessinSvg(p.pages[e.icone] ?? "")) return { ok: false, erreur: "icone_invalide", detail: `« ${e.id} » : l'icône doit être un dessin SVG du paquet (fichier .svg)` };
  }
  for (const x of p.fiche.panneaux) {
    if (!x.icone.endsWith(".svg") || !estDessinSvg(p.pages[x.icone] ?? "")) return { ok: false, erreur: "icone_invalide", detail: `panneau « ${x.id} » : l'icône doit être un dessin SVG du paquet (fichier .svg)` };
  }
  return { ok: true, paquet: p };
}

/**
 * Relecture, dans le navigateur, de la liste reçue du serveur : chaque paquet repasse les règles d'import, dans l'ordre
 * reçu ; un paquet qui ne les passe pas (ou plus) est écarté. Une valeur illisible donne une liste vide.
 */
export function lirePaquetsInstalles(v: unknown): readonly PaquetExtension[] {
  if (!Array.isArray(v)) return [];
  const retenus: PaquetExtension[] = [];
  for (const brut of v) {
    const j = jugerImportPaquet(brut, retenus);
    if (j.ok && !retenus.some((x) => x.fiche.id === j.paquet.fiche.id)) retenus.push(j.paquet);
  }
  return retenus;
}

/** Clé d'une commande d'extension dans les listes de la Planche (menu des outils, barre de l'extension). */
export const cleCommandeExtension = (extension: string, commande: string): string => `extension:${extension}:${commande}`;
/** Identifiant de la barre d'outils d'une extension installée. */
export const idBarreExtension = (extension: string): string => `extension:${extension}`;
/** Nom de la demande adressée à l'extension quand sa commande est lancée. */
export const nomAppelCommande = (commande: string): string => `commande.${commande}`;

/** Adresse d'image (`data:`) d'une icône du paquet, ou `null` si la page n'est pas un dessin SVG. */
export function imageIcone(paquet: Pick<PaquetExtension, "pages">, page: string): string | null {
  const texte = paquet.pages[page];
  return texte !== undefined && estDessinSvg(texte) ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(texte)}` : null;
}
