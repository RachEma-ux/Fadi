import type { Request } from "express";
import type { MailLocale } from "./mailer/index.js";

/**
 * Langue des courriels (UM-30) : la langue choisie dans l'interface de Fadi, transmise explicitement par le client
 * (`locale` du corps, ou valeur déjà validée passée en `explicit`) ; à défaut ou si elle est invalide, le français,
 * langue source (D-163). L'en-tête `Accept-Language` du navigateur n'est jamais lu : il reflète le réglage de
 * l'appareil, pas la langue d'interface (un administrateur au téléphone réglé en anglais invitait en anglais). Aucun
 * compte n'enregistre de préférence de langue : il n'y en a pas d'autre à consulter.
 */
export function mailLocale(req: Pick<Request, "body">, explicit?: unknown): MailLocale {
  const value = explicit !== undefined ? explicit : (req.body as { locale?: unknown } | undefined)?.locale;
  return value === "en" ? "en" : "fr";
}
