import { appendFileSync, statSync, truncateSync } from "node:fs";
import { ligneCourriel, renderMail, type MailLocale, type MailTemplate } from "./index.js";
import { isReservedDomain } from "./quota.js";

/** Au-delà, le fichier est vidé avant l'écriture suivante (les liens n'y servent que quelques minutes). */
export const CAPTURE_TAILLE_MAX = 5 * 1024 * 1024;

/**
 * Copie de recette (`MAIL_CAPTURE_RECETTE`, préproduction) : le courriel d'un domaine réservé, jamais remis, est écrit
 * dans le fichier pour que la recette lise son lien. Jamais bloquant : un échec d'écriture est journalisé, sans plus.
 */
export function capturerPourRecette(
  fichier: string,
  message: { to: string; template: MailTemplate; data: Record<string, string | undefined>; locale?: MailLocale },
  tailleMax = CAPTURE_TAILLE_MAX,
): void {
  if (!isReservedDomain(message.to)) return;
  try {
    try { if (statSync(fichier).size > tailleMax) truncateSync(fichier, 0); } catch { /* fichier absent : créé ci-dessous */ }
    const r = renderMail(message.template, message.data, message.locale ?? "fr");
    appendFileSync(fichier, `${ligneCourriel(message.to, r)}\n`, { mode: 0o644 });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`Courriel : copie de recette impossible (${String((err as Error).message ?? err).slice(0, 200)})`);
  }
}
