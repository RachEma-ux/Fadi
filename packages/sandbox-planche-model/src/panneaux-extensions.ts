/**
 * Panneau d'une extension (protocole 1.0, lot 4, permission « panneau »). Pur : ce module compose la page affichée et
 * juge la forme de ce qui s'échange ; la Planche l'affiche dans un cadre à l'écart et fait passer les messages.
 *
 * La page est un fragment HTML du paquet. Elle est affichée dans un cadre sans origine (ni la Planche, ni le compte, ni
 * l'enregistrement local du navigateur) et sans réseau (`CSP_PAGE_PANNEAU` : rien n'est chargé d'ailleurs). Les styles,
 * scripts et dessins SVG qu'elle cite par leur nom de page du paquet sont recopiés dans la page ; toute autre adresse
 * reste lettre morte.
 *
 * Dans la page, l'objet `fadi` :
 *   fadi.langue                    « fr » ou « en »
 *   fadi.action(nom, donnees)      appelle l'action nommée de l'extension ; promesse de sa réponse
 *   fadi.surDonnees(fonction)      reçoit les données que l'extension envoie au panneau
 *
 * Dans l'extension :
 *   planche.panneau.sur(panneau, action, fonction)   traite l'action « panneau.<panneau>.<action> »
 *   planche.panneau.envoyer(panneau, donnees)        envoie des données à la page ; faux si le panneau est fermé
 *   planche.panneau.ouvrir(panneau)                  ouvre le panneau dans la colonne
 *
 * Aucun des deux ne lit le contenu de l'autre : il ne passe que des données (JSON), de taille bornée.
 */
import type { FicheExtension, PaquetExtension } from "./protocole-extensions.js";

export const BORNES_PANNEAU = {
  /** Longueur du nom d'une action. */
  action: 30,
  /** Taille, en caractères JSON, des données d'une action, d'une réponse ou d'un envoi. */
  donnees: 20_000,
  /** Actions d'un panneau en attente de réponse. */
  enAttente: 20,
  /** Hauteur du cadre, en pixels (la page annonce la sienne). */
  hauteurMin: 60,
  hauteurMax: 4000,
} as const;

/** Rien n'est chargé d'ailleurs : scripts et styles de la page seulement, images en `data:`. */
export const CSP_PAGE_PANNEAU = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; form-action 'none'; base-uri 'none'";

const MOTIF_ACTION = /^[a-z][a-zA-Z0-9-]*$/;
const estObjet = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Copie des données (JSON seulement), ou `undefined` si elles ne passent pas : non transmissibles ou trop grandes. */
export function donneesPanneau(v: unknown): unknown {
  if (v === undefined) return null;
  try {
    const texte = JSON.stringify(v) as string | undefined;
    if (texte === undefined || texte.length > BORNES_PANNEAU.donnees) return undefined;
    return JSON.parse(texte) as unknown;
  } catch {
    return undefined;
  }
}

/** Nom de l'appel adressé à l'extension pour une action de son panneau, ou `null` si l'action est mal nommée. */
export function nomAppelPanneau(panneau: string, action: unknown): string | null {
  if (typeof action !== "string" || action.length > BORNES_PANNEAU.action || !MOTIF_ACTION.test(action)) return null;
  return `panneau.${panneau}.${action}`;
}

export type MessagePagePanneau =
  | { readonly sorte: "action"; readonly id: number; readonly nom: string; readonly donnees: unknown }
  | { readonly sorte: "hauteur"; readonly px: number };

/** Relit un message venu de la page ; tout ce qui n'a pas la forme attendue est ignoré. */
export function lireMessagePagePanneau(v: unknown): MessagePagePanneau | null {
  if (!estObjet(v)) return null;
  if (v["fadi"] === "hauteur") {
    const px = v["px"];
    if (typeof px !== "number" || !Number.isFinite(px)) return null;
    return { sorte: "hauteur", px: Math.min(BORNES_PANNEAU.hauteurMax, Math.max(BORNES_PANNEAU.hauteurMin, Math.ceil(px))) };
  }
  if (v["fadi"] !== "action") return null;
  const id = v["id"];
  const nom = v["nom"];
  if (typeof id !== "number" || !Number.isSafeInteger(id) || id < 0) return null;
  if (typeof nom !== "string" || nom.length > BORNES_PANNEAU.action || !MOTIF_ACTION.test(nom)) return null;
  const donnees = donneesPanneau(v["donnees"]);
  // Données refusées : l'action est rendue avec `undefined`, que la Planche traduit en refus adressé à la page.
  return { sorte: "action", id, nom, donnees };
}

export type LectureEnvoiPanneau = { readonly ok: true; readonly panneau: string; readonly donnees: unknown } | { readonly ok: false; readonly detail: string };

/** « panneau.envoyer » et « panneau.ouvrir » : un panneau déclaré dans la fiche, des données qui passent. */
export function lireEnvoiPanneau(fiche: Pick<FicheExtension, "panneaux">, v: unknown): LectureEnvoiPanneau {
  const panneau = estObjet(v) ? v["panneau"] : undefined;
  if (typeof panneau !== "string" || !fiche.panneaux.some((p) => p.id === panneau)) return { ok: false, detail: "panneau : identifiant d'un panneau déclaré dans la fiche" };
  const donnees = donneesPanneau(estObjet(v) ? v["donnees"] : undefined);
  if (donnees === undefined) return { ok: false, detail: `donnees : des données seulement, ${BORNES_PANNEAU.donnees} caractères au plus` };
  return { ok: true, panneau, donnees };
}

/** Le pont de la page : `fadi.action`, `fadi.surDonnees`, et l'annonce de sa hauteur. Écrit pour tout navigateur. */
const pontPage = (langue: "fr" | "en"): string =>
  `(function(){var n=0,attentes={},ecoutes=[],P=window.parent;` +
  `window.addEventListener("message",function(e){if(e.source!==P)return;var m=e.data;if(!m||typeof m!=="object")return;` +
  `if(m.fadi==="reponse"){var a=attentes[m.id];if(!a)return;delete attentes[m.id];if(m.ok)a[0](m.resultat);else{var x=new Error(String(m.detail||m.erreur));x.name=String(m.erreur);a[1](x);}}` +
  `else if(m.fadi==="donnees"){ecoutes.slice().forEach(function(f){try{f(m.donnees);}catch(_){}});}});` +
  `window.fadi=Object.freeze({langue:${JSON.stringify(langue)},` +
  `action:function(nom,donnees){return new Promise(function(tenir,rejeter){var id=++n;attentes[id]=[tenir,rejeter];P.postMessage({fadi:"action",id:id,nom:nom,donnees:donnees===undefined?null:donnees},"*");});},` +
  `surDonnees:function(f){if(typeof f==="function")ecoutes.push(f);}});` +
  `function h(){P.postMessage({fadi:"hauteur",px:document.documentElement.scrollHeight},"*");}` +
  `window.addEventListener("load",h);if(window.ResizeObserver)new ResizeObserver(h).observe(document.documentElement);})();`;

/** Mise en page de départ : celle de la Planche, que les styles de la page complètent ou remplacent. */
const STYLE_PAGE = "html,body{margin:0;padding:0;background:transparent}body{font:14px/1.45 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#183d32}*{box-sizing:border-box}";

const NOM_PAGE = "[a-z0-9][a-z0-9._-]{0,59}";
const attribut = (balise: string, nom: string): string | null => new RegExp(`\\s${nom}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i").exec(balise)?.slice(1).find((x) => x !== undefined) ?? null;

/**
 * Document affiché dans le cadre du panneau : la page du paquet, précédée de la règle « aucun réseau » et du pont. Les
 * feuilles de style (`<link rel="stylesheet" href="x.css">`), les scripts (`<script src="x.js"></script>`) et les dessins
 * (`src="x.svg"`) nommés par une page du paquet y sont recopiés. `null` si le panneau n'est pas déclaré.
 */
export function composerPagePanneau(paquet: Pick<PaquetExtension, "fiche" | "pages">, panneau: string, langue: "fr" | "en"): string | null {
  const declare = paquet.fiche.panneaux.find((p) => p.id === panneau);
  const page = declare ? paquet.pages[declare.page] : undefined;
  if (page === undefined) return null;
  const pageDe = (nom: string | null, suffixe: string): string | null => (nom !== null && new RegExp(`^${NOM_PAGE}$`).test(nom) && nom.endsWith(suffixe) && Object.prototype.hasOwnProperty.call(paquet.pages, nom) ? paquet.pages[nom]! : null);
  const corps = page
    .replace(/<link\b[^>]*>/gi, (balise) => {
      const css = /\srel\s*=\s*["']?stylesheet/i.test(balise) ? pageDe(attribut(balise, "href"), ".css") : null;
      return css === null ? "" : `<style>${css.replace(/<\/style/gi, "<\\/style")}</style>`;
    })
    .replace(/<script\b([^>]*)>\s*<\/script>/gi, (balise, attributs: string) => {
      const js = pageDe(attribut(`<script${attributs}>`, "src"), ".js");
      return js === null ? balise : `<script>${js.replace(/<\/script/gi, "<\\/script")}</script>`;
    })
    .replace(new RegExp(`(\\ssrc\\s*=\\s*)(?:"(${NOM_PAGE}\\.svg)"|'(${NOM_PAGE}\\.svg)')`, "gi"), (tout, avant: string, a?: string, b?: string) => {
      const svg = pageDe(a ?? b ?? null, ".svg");
      return svg === null ? tout : `${avant}"data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}"`;
    });
  return `<!doctype html><html lang="${langue}"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${CSP_PAGE_PANNEAU}"><style>${STYLE_PAGE}</style><script>${pontPage(langue)}</script></head><body>${corps}</body></html>`;
}
