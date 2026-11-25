/**
 * Catalogue des extensions vu de la plateforme (demande du maître d'ouvrage du 25 novembre 2026, premier lot : « catalogue
 * en base et activation par l'administrateur »). Le code de Fadi livre les extensions (`EXTENSIONS_SANDBOX` : ce qu'elles
 * contiennent, leur version) ; la plateforme décide, en base, de ce qui est proposé aux comptes :
 *
 * - `etat` : `disponible`, `experimentale` (proposée, signalée comme telle) ou `retiree` (retirée pour tout le monde,
 *   tout de suite — le choix des comptes est gardé et revient si l'extension est rétablie) ;
 * - `activeParDefaut` : le réglage d'origine, suivi par tout compte qui n'a rien choisi.
 *
 * Tant que la plateforme n'a rien réglé pour une extension, elle est `disponible` avec le réglage d'origine livré par
 * Fadi. Le choix d'un compte (`ChoixExtensions`) ne joue que dans ce que la plateforme propose.
 *
 * Pur : ni React, ni DOM, ni base.
 */
import { EXTENSIONS_SANDBOX, extensionSandbox, type ChoixExtensions, type ExtensionSandbox } from "./extensions-sandbox.js";

export const ETATS_EXTENSION = ["disponible", "experimentale", "retiree"] as const;
export type EtatExtension = (typeof ETATS_EXTENSION)[number];

/** Réglage de la plateforme pour une extension (une ligne de la base). */
export interface ReglagePlateforme {
  readonly etat: EtatExtension;
  readonly activeParDefaut: boolean;
}
export type ReglagesPlateforme = Readonly<Record<string, ReglagePlateforme>>;

/** Une extension telle que la plateforme la propose : ce que le serveur envoie au navigateur. */
export interface FicheCatalogue extends ReglagePlateforme {
  readonly id: string;
  readonly version: string;
}

/** Réglage en vigueur d'une extension : celui de la plateforme, sinon celui livré par Fadi. */
export function reglageEnVigueur(x: ExtensionSandbox, reglages: ReglagesPlateforme): ReglagePlateforme {
  return reglages[x.id] ?? { etat: "disponible", activeParDefaut: x.activeParDefaut };
}

/** Catalogue complet, dans l'ordre de la liste livrée. Un réglage visant une extension inconnue est ignoré. */
export function catalogueExtensions(reglages: ReglagesPlateforme = {}): readonly FicheCatalogue[] {
  return EXTENSIONS_SANDBOX.map((x) => ({ id: x.id, version: x.version, ...reglageEnVigueur(x, reglages) }));
}

/** Catalogue sans aucun réglage de plateforme : sert tant que le serveur n'a pas répondu. */
export const CATALOGUE_LIVRE: readonly FicheCatalogue[] = Object.freeze(catalogueExtensions());

/** Une extension est-elle proposée aux comptes ? */
export const extensionProposee = (f: Pick<FicheCatalogue, "etat">): boolean => f.etat !== "retiree";

/**
 * Choix complet d'un compte dans un catalogue : une valeur pour chaque extension livrée — `false` si la plateforme
 * l'a retirée, sinon le choix du compte, sinon le réglage d'origine. C'est ce choix qu'on passe à `extensionActive`,
 * `clesMasquees` et `barreGaucheSandbox` ; le choix enregistré, lui, reste celui du compte.
 */
export function choixEffectif(choix: ChoixExtensions, catalogue: readonly FicheCatalogue[]): ChoixExtensions {
  const fiches = new Map(catalogue.map((f) => [f.id, f] as const));
  const effectif: Record<string, boolean> = {};
  for (const x of EXTENSIONS_SANDBOX) {
    const f = fiches.get(x.id);
    effectif[x.id] = f && !extensionProposee(f) ? false : (choix[x.id] ?? f?.activeParDefaut ?? x.activeParDefaut);
  }
  return effectif;
}

const estEtat = (v: unknown): v is EtatExtension => typeof v === "string" && (ETATS_EXTENSION as readonly string[]).includes(v);

/**
 * Relecture tolérante d'un catalogue reçu ou gardé en copie locale : les fiches valides d'extensions connues sont
 * retenues, les extensions absentes reprennent le réglage livré. Une valeur illisible donne le catalogue livré.
 */
export function lireCatalogue(v: unknown): readonly FicheCatalogue[] {
  if (!Array.isArray(v)) return CATALOGUE_LIVRE;
  const reglages: Record<string, ReglagePlateforme> = {};
  for (const f of v) {
    if (!f || typeof f !== "object") continue;
    const { id, etat, activeParDefaut } = f as Record<string, unknown>;
    if (typeof id === "string" && extensionSandbox(id) && estEtat(etat) && typeof activeParDefaut === "boolean") reglages[id] = { etat, activeParDefaut };
  }
  return catalogueExtensions(reglages);
}

export type ResultatReglage =
  | { readonly ok: true; readonly reglage: Partial<ReglagePlateforme> }
  | { readonly ok: false; readonly detail: string };

/** Valide un changement de réglage demandé par l'administrateur : `etat` et / ou `activeParDefaut`, rien d'autre. */
export function validerChangementReglage(corps: unknown): ResultatReglage {
  if (!corps || typeof corps !== "object" || Array.isArray(corps)) return { ok: false, detail: "objet attendu" };
  const c = corps as Record<string, unknown>;
  const inconnus = Object.keys(c).filter((k) => k !== "etat" && k !== "activeParDefaut");
  if (inconnus.length > 0) return { ok: false, detail: `champ inconnu : ${inconnus.join(", ")}` };
  if (c["etat"] === undefined && c["activeParDefaut"] === undefined) return { ok: false, detail: "etat ou activeParDefaut attendu" };
  if (c["etat"] !== undefined && !estEtat(c["etat"])) return { ok: false, detail: `etat : ${ETATS_EXTENSION.join(", ")}` };
  if (c["activeParDefaut"] !== undefined && typeof c["activeParDefaut"] !== "boolean") return { ok: false, detail: "activeParDefaut : booléen" };
  return { ok: true, reglage: { ...(c["etat"] !== undefined ? { etat: c["etat"] as EtatExtension } : {}), ...(c["activeParDefaut"] !== undefined ? { activeParDefaut: c["activeParDefaut"] as boolean } : {}) } };
}
