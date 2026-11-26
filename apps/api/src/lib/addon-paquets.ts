/**
 * Extensions installées sur la plateforme (protocole des extensions 1.0, lot 3), côté serveur : lignes
 * `addon_packages` ↔ paquets, et fiches pour l'administration. Les règles d'import viennent du paquet du Sandbox
 * (`jugerImportPaquet`) : les mêmes que dans le navigateur. Le serveur range et rend un paquet ; il ne l'exécute jamais.
 * Pur : aucune base (lectures dans `lib/addon-paquets-lecture.ts`, écritures dans `routes/admin/addons.ts`).
 */
import { lirePaquetsInstalles, paquetInstalle, type ChoixPaquets, type EtatPaquet, type FichePaquetCompte, type OriginePaquet, type PaquetExtension, type PermissionExtension, type TexteBilingue } from "@parcours/sandbox-planche-model";
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
  readonly etat: EtatPaquet;
  /** « Installée d'origine » : suivi par tout compte qui n'a rien choisi. */
  readonly activeParDefaut: boolean;
  readonly origine: OriginePaquet;
}

/** Paquets rendus à un compte : ceux qu'il a installés (son choix, sinon le réglage d'origine). */
export function paquetsDuCompte(lignes: readonly LignePaquet[], choix: ChoixPaquets): readonly PaquetExtension[] {
  const installees = new Set(lignes.filter((l) => paquetInstalle(l.addonId, choix, l.defaultActive)).map((l) => l.addonId));
  // Le jugement des raccourcis se fait entre les paquets que le compte reçoit vraiment.
  return paquetsDeLignes(lignes.filter((l) => installees.has(l.addonId)));
}

/** Fiches, sans code, des extensions ajoutées que la plateforme propose à un compte (celles qui passent les règles). */
export function fichesComptePaquets(lignes: readonly LignePaquet[], choix: ChoixPaquets): readonly FichePaquetCompte[] {
  return fichesAdminPaquets(lignes).filter((f) => f.servie).map((f) => ({ id: f.id, nom: f.nom, description: f.description, version: f.version, etat: f.etat, commandes: f.commandes, outils: f.outils, panneaux: f.panneaux, installee: paquetInstalle(f.id, choix, f.activeParDefaut) }));
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
        etat: l.state,
        activeParDefaut: l.defaultActive,
        origine: l.origin,
      };
    });
}
