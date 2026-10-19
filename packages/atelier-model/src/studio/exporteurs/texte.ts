/** Écriture des nombres et des chaînes des exports de fichier Studio (SVG, DXF). Pures et déterministes. */

/** Nombre arrondi au micromètre, sans `-0` ni résidu flottant. */
export const nb = (v: number): string => {
  const r = Math.round(v * 1e6) / 1e6;
  return Math.abs(r) < 1e-12 ? "0" : String(r);
};

export const xml = (s: string): string =>
  // Caractères de contrôle interdits en XML 1.0 retirés, puis échappement des cinq entités.
  s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

/** Ordonnée SVG : l'axe y est retourné (l'écran descend). */
export const svgY = (y: number): string => nb(-y);

/** Chaîne DXF en ASCII strict : fins de ligne et contrôles retirés, hors ASCII en `\U+XXXX`, 250 caractères au plus. */
export function dxfText(s: string): string {
  let out = "";
  for (const ch of s.replace(/[\r\n]+/g, " ").replace(/[\u0000-\u001F\u007F]/g, "")) {
    const code = ch.codePointAt(0)!;
    out += code < 0x80 ? ch : code <= 0xffff ? `\\U+${code.toString(16).toUpperCase().padStart(4, "0")}` : "?";
  }
  return out.slice(0, 250);
}
