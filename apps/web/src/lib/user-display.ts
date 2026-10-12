import type { CurrentUser } from "./api";

/** Initiales pour l'avatar : du nom affiché s'il est saisi (deux premiers mots), sinon de l'adresse (deux segments, ou deux lettres). */
export function initialsFrom(user: Pick<CurrentUser, "email" | "displayName">): string {
  const name = user.displayName?.trim();
  if (name) {
    const words = name.split(/\s+/).filter(Boolean);
    const letters = words.length >= 2 ? [words[0]?.[0], words[1]?.[0]] : [name[0], name[1]];
    return letters.filter(Boolean).join("").toUpperCase();
  }
  const local = user.email.split("@")[0] ?? user.email;
  const parts = local.split(/[._-]+/).filter(Boolean);
  const letters = parts.length >= 2 ? [parts[0]?.[0], parts[1]?.[0]] : [local[0], local[1]];
  return letters.filter(Boolean).join("").toUpperCase();
}

/** Le nom montré dans la barre latérale et l'accueil : le nom affiché saisi, sinon ce que la personne a tapé avant le premier chiffre ou séparateur de son adresse (jamais un prénom inventé). */
export function shownName(user: Pick<CurrentUser, "email" | "displayName">): string {
  const name = user.displayName?.trim();
  if (name) return name;
  const local = user.email.split("@")[0] ?? user.email;
  const alpha = local.match(/^[a-zA-Z]+/)?.[0] ?? local;
  return alpha.charAt(0).toUpperCase() + alpha.slice(1);
}
