/**
 * Catalogue des extensions, côté serveur (25 novembre 2026) : lignes de réglage de la plateforme
 * (`addon_platform_settings`) et fiches pour l'administration. Les règles (réglage en vigueur, choix effectif d'un
 * compte) viennent du paquet du Sandbox (`catalogue-extensions.ts`) : les mêmes que dans le navigateur.
 * Pur : aucune base (lectures dans `lib/addons-lecture.ts`, écritures dans `routes/admin/addons.ts`).
 */
import { EXTENSIONS_SANDBOX, contenuExtension, reglageEnVigueur, type ExtensionSandbox, type ReglagePlateforme, type ReglagesPlateforme } from "@parcours/sandbox-planche-model";
import type { addonPlatformSettings } from "../db/schema.js";

export type LigneReglage = typeof addonPlatformSettings.$inferSelect;

export const reglageDeLigne = (l: Pick<LigneReglage, "state" | "defaultActive">): ReglagePlateforme => ({ etat: l.state, activeParDefaut: l.defaultActive });

/** Réglages de la plateforme par identifiant d'extension, depuis les lignes lues. */
export const reglagesDeLignes = (lignes: readonly LigneReglage[]): ReglagesPlateforme => Object.fromEntries(lignes.map((l) => [l.addonId, reglageDeLigne(l)] as const));

/** Fiche d'une extension pour l'administration : ce que Fadi livre, et ce que la plateforme a réglé. */
export interface FicheAdminAddon extends ReglagePlateforme {
  readonly id: string;
  /** Nom et description français de référence (le web les traduit). */
  readonly libelle: string;
  readonly description: string;
  readonly version: string;
  /** Réglage d'origine livré par Fadi, pour comparaison. */
  readonly activeParDefautLivre: boolean;
  readonly contenu: { readonly outil: number; readonly commande: number; readonly panneau: number };
  /** `true` dès que l'administrateur a réglé cette extension (une ligne existe en base). */
  readonly reglee: boolean;
  readonly updatedAt: string | null;
  readonly updatedBy: string | null;
}

export function ficheAdminAddon(x: ExtensionSandbox, ligne: LigneReglage | undefined): FicheAdminAddon {
  const reglage = reglageEnVigueur(x, ligne ? { [x.id]: reglageDeLigne(ligne) } : {});
  return {
    id: x.id,
    libelle: x.libelle,
    description: x.description,
    version: x.version,
    ...reglage,
    activeParDefautLivre: x.activeParDefaut,
    contenu: { ...contenuExtension(x) },
    reglee: ligne !== undefined,
    updatedAt: ligne ? ligne.updatedAt.toISOString() : null,
    updatedBy: ligne?.updatedBy ?? null,
  };
}

export function fichesAdminAddons(lignes: readonly LigneReglage[]): readonly FicheAdminAddon[] {
  const parId = new Map(lignes.map((l) => [l.addonId, l] as const));
  return EXTENSIONS_SANDBOX.map((x) => ficheAdminAddon(x, parId.get(x.id)));
}
