/**
 * Raccourcis des commandes d'administration des comptes (règle d'or, AGENTS.md : chaque commande livrée a sa propre
 * icône et un raccourci, contrôlés par test). Alt+Maj+lettre, lu sur la touche physique (`code`) : Alt modifie la lettre
 * produite sur macOS. Pur : aucun DOM.
 */
import type { CommandeAdmin } from "./icones-admin";

/** Commandes des invitations et des comptes de test (UM-31), option « Auto-contrôle » d'un compte (OP-6). */
export type CommandeRaccourcie = Extract<CommandeAdmin, "renvoyer" | "copier-lien" | "comptes-test" | "auto-controle">;

export const RACCOURCIS_ADMIN: Record<CommandeRaccourcie, { touche: string; aria: string; libelle: string }> = {
  // Agit sur la ligne d'invitation qui a le focus.
  renvoyer: { touche: "KeyR", aria: "Alt+Shift+R", libelle: "Raccourci : Alt+Maj+R" },
  // Copie le lien de la ligne qui a le focus, sinon le dernier lien émis.
  "copier-lien": { touche: "KeyL", aria: "Alt+Shift+L", libelle: "Raccourci : Alt+Maj+L" },
  // Bascule « Masquer les comptes de test ».
  "comptes-test": { touche: "KeyT", aria: "Alt+Shift+T", libelle: "Raccourci : Alt+Maj+T" },
  // Bascule l'option « Auto-contrôle » du compte dont la fiche est ouverte (OP-6), après confirmation.
  "auto-controle": { touche: "KeyA", aria: "Alt+Shift+A", libelle: "Raccourci : Alt+Maj+A" },
};

/** Commande désignée par une frappe (Alt+Maj+lettre, sans Ctrl ni Méta), sinon `null`. */
export function commandeAdminDuClavier(e: { code: string; altKey: boolean; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }): CommandeRaccourcie | null {
  if (!e.altKey || !e.shiftKey || e.ctrlKey || e.metaKey) return null;
  for (const [c, r] of Object.entries(RACCOURCIS_ADMIN)) if (r.touche === e.code) return c as CommandeRaccourcie;
  return null;
}
