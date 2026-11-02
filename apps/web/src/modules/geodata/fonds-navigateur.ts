/**
 * Fonds des fournisseurs réglés dans Paramètres (D-GD-15), lus dans le stockage de ce navigateur : MapTiler (clé de
 * « Connexion MapTiler ») et fournisseurs XYZ saisis. Les clés restent dans le navigateur : la composition enregistrée
 * ne garde que l'identifiant du fond, jamais une adresse ni une clé.
 */
import { CLE_LOCALE_MAPTILER, CLE_SESSION_MAPTILER, CLE_STOCKAGE_FOURNISSEURS, fondParDefaut, fondsDesFournisseurs, lireReglagesFournisseurs, type FondFournisseur, type FournisseurSansCle } from "@parcours/geodata-model";

export interface FondsNavigateur { readonly fonds: readonly FondFournisseur[]; readonly sansCle: readonly FournisseurSansCle[]; readonly defaut: string | null }

export function lireFondsNavigateur(): FondsNavigateur {
  let brut: string | null = null;
  let cle = "";
  try {
    brut = window.localStorage.getItem(CLE_STOCKAGE_FOURNISSEURS);
    cle = window.sessionStorage.getItem(CLE_SESSION_MAPTILER) || window.localStorage.getItem(CLE_LOCALE_MAPTILER) || "";
  } catch { /* stockage indisponible : aucun fond de fournisseur */ }
  const reglages = lireReglagesFournisseurs(brut);
  const { fonds, sansCle } = fondsDesFournisseurs(reglages, cle);
  return { fonds, sansCle, defaut: fondParDefaut(reglages, fonds) };
}
