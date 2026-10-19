/** Aides partagées de l'espace de travail d'une variante : refus d'accès, avertissement de sortie. */
import { ApiError } from "../../../lib/api";
import { LANGUE } from "../../../lib/i18n";

export const warning = () => LANGUE === "en" ? "Unsaved or unconfirmed changes. Leave this study?" : "Modifications non enregistrées ou non confirmées. Quitter cette étude ?";
export const refused = (e: unknown) => e instanceof ApiError && [401, 403, 404].includes(e.status);
