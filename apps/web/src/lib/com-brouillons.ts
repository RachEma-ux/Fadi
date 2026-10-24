/**
 * Brouillons de la Communication (COM, Issue #280) gardés sur l'appareil : clé propre au compte, au projet et à la
 * conversation, pour qu'un autre compte du même navigateur ne relise ni n'envoie jamais le brouillon d'un autre.
 * Oubliés avec l'appareil (déconnexion, autre compte : `forgetDevice`) et avec un projet devenu inaccessible
 * (`forgetProject`, CR-D5). Toute erreur de stockage est ignorée : le brouillon n'est alors qu'en mémoire.
 */
const PREFIXE = "fadi.com.brouillon.";

export const cleBrouillon = (userId: string, projectId: string, conversationId: string): string => `${PREFIXE}${userId}.${projectId}.${conversationId}`;

export function lireBrouillon(cle: string | null): string {
  if (!cle) return "";
  try { return localStorage.getItem(cle) ?? ""; } catch { return ""; }
}

export function ecrireBrouillon(cle: string | null, texte: string): void {
  if (!cle) return;
  try { if (texte) localStorage.setItem(cle, texte); else localStorage.removeItem(cle); } catch { /* stockage indisponible */ }
}

/** Oublie les brouillons : tous, ou ceux d'un projet (quel que soit le compte). */
export function oublierBrouillons(projectId?: string): void {
  try {
    const cles: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(PREFIXE) && (!projectId || k.split(".")[4] === projectId)) cles.push(k);
    }
    for (const k of cles) localStorage.removeItem(k);
  } catch { /* stockage indisponible */ }
}
