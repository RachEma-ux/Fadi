/**
 * Indicateur de robustesse d'un mot de passe (gestion des comptes, D-6) — indication seulement, sans règle de
 * composition : la longueur compte d'abord. Le serveur reste seul juge (12 à 128 caractères, liste de mots de passe
 * compromis) ; un mot de passe « fort » ici peut y être refusé.
 */
export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 128;

export type PasswordStrength = "trop-court" | "faible" | "correct" | "fort";

export function passwordStrength(password: string): PasswordStrength {
  const n = [...password].length;
  if (n < PASSWORD_MIN) return "trop-court";
  const distinct = new Set(password.toLowerCase()).size;
  // Répétitions ou suites (« aaaaaaaaaaaa », « 123456789012 ») : faibles malgré la longueur.
  if (distinct < 5 || /^(.)\1+$/.test(password) || /^(?:0123456789|1234567890|abcdefghij)/i.test(password)) return "faible";
  if (n >= 20 && distinct >= 10) return "fort";
  if (n >= 16 || distinct >= 9) return "correct";
  return "faible";
}

export const STRENGTH_LABEL: Record<PasswordStrength, string> = {
  "trop-court": `Trop court : ${PASSWORD_MIN} caractères au moins.`,
  faible: "Robustesse : faible — allongez-le, une phrase de plusieurs mots convient bien.",
  correct: "Robustesse : correcte.",
  fort: "Robustesse : forte.",
};
