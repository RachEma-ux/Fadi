/** Export CSV des prix (RFC 4180) : logique pure, sans base. */

/**
 * Cellule CSV neutralisée contre l'injection de formules (tableur) : un texte qui commence par `=`, `+`, `-`, `@`, une
 * tabulation ou un retour chariot est préfixé d'une apostrophe. Un nombre (y compris négatif, ex. une tendance « -4.8 »
 * rendue en texte par PostgreSQL) reste numérique, sans préfixe.
 */
export function celluleCsv(v: unknown): string {
  const t = v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
  const nombre = typeof v === "number" || /^-?\d+(\.\d+)?$/.test(t);
  const sur = !nombre && /^[=+\-@\t\r]/.test(t) ? `'${t}` : t;
  return /[",\n\r]/.test(sur) ? `"${sur.replace(/"/g, '""')}"` : sur;
}
export const csv = (lignes: readonly (readonly unknown[])[]) => `${lignes.map((l) => l.map(celluleCsv).join(",")).join("\r\n")}\r\n`;
