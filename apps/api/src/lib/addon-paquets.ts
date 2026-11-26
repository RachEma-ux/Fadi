/**
 * Extensions installées sur la plateforme (protocole des extensions 1.0, lot 3), côté serveur : lignes
 * `addon_packages` ↔ paquets, et fiches pour l'administration. Les règles d'import viennent du paquet du Sandbox
 * (`jugerImportPaquet`) : les mêmes que dans le navigateur. Le serveur range et rend un paquet ; il ne l'exécute jamais.
 * Pur : aucune base (lectures dans `lib/addon-paquets-lecture.ts`, écritures dans `routes/admin/addons.ts`).
 */
import { lirePaquetsInstalles, type PaquetExtension, type PermissionExtension, type TexteBilingue } from "@parcours/sandbox-planche-model";
import type { addonPackages } from "../db/schema.js";

export type LignePaquet = typeof addonPackages.$inferSelect;

/**
 * Paquets rendus aux comptes, dans l'ordre des identifiants : chaque ligne repasse les règles d'import (une ligne
 * devenue invalide — règles durcies, raccourci pris depuis par la Planche — est écartée, jamais servie telle quelle).
 */
export function paquetsDeLignes(lignes: readonly Pick<LignePaquet, "addonId" | "package">[]): readonly PaquetExtension[] {
  const triees = [...lignes].sort((a, b) => (a.addonId < b.addonId ? -1 : a.addonId > b.addonId ? 1 : 0));
  return lirePaquetsInstalles(triees.map((l) => l.package)).filter((p) => triees.some((l) => l.addonId === p.fiche.id));
}

/** Fiche d'une extension installée, pour l'administration : la fiche du paquet sans son code ni ses pages. */
export interface FicheAdminPaquet {
  readonly id: string;
  readonly nom: TexteBilingue;
  readonly description: TexteBilingue;
  readonly version: string;
  readonly auteur: string;
  readonly protocole: string;
  readonly permissions: readonly PermissionExtension[];
  readonly commandes: number;
  readonly outils: number;
  readonly panneaux: number;
  /** `false` : la ligne ne passe plus les règles d'import, elle n'est plus rendue aux comptes. */
  readonly servie: boolean;
  readonly importedAt: string;
  readonly importedBy: string | null;
}

export function fichesAdminPaquets(lignes: readonly LignePaquet[]): readonly FicheAdminPaquet[] {
  const servis = new Map(paquetsDeLignes(lignes).map((p) => [p.fiche.id, p] as const));
  return [...lignes]
    .sort((a, b) => (a.addonId < b.addonId ? -1 : 1))
    .map((l) => {
      const p = servis.get(l.addonId);
      const f = (p?.fiche ?? (l.package as { fiche?: Partial<PaquetExtension["fiche"]> }).fiche ?? {}) as Partial<PaquetExtension["fiche"]>;
      const vide: TexteBilingue = { fr: l.addonId, en: l.addonId };
      return {
        id: l.addonId,
        nom: f.nom ?? vide,
        description: f.description ?? { fr: "", en: "" },
        version: l.version,
        auteur: f.auteur ?? "",
        protocole: f.protocole ?? "",
        permissions: f.permissions ?? [],
        commandes: f.commandes?.length ?? 0,
        outils: f.outils?.length ?? 0,
        panneaux: f.panneaux?.length ?? 0,
        servie: p !== undefined,
        importedAt: l.importedAt.toISOString(),
        importedBy: l.importedBy,
      };
    });
}
