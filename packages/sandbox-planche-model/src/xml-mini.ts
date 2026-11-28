/**
 * (Cas 4, lot C4, étape 7) Lecteur XML minimal, sans bibliothèque ni DOM : éléments, attributs et texte, assez pour les
 * formats d'échange lus par la Planche (COLLADA, 3MF, KML). Pas de DTD ni d'entités externes (jamais résolues) ; les
 * entités prédéfinies et numériques sont décodées ; CDATA gardé comme texte. Les préfixes d'espace de noms sont retirés
 * des noms (`kml:Placemark` → `Placemark`). Pur : utilisable dans un travailleur et dans Node.
 */

export interface NoeudXml {
  readonly nom: string;
  readonly attributs: Readonly<Record<string, string>>;
  readonly enfants: NoeudXml[];
  /** Texte direct (concaténé, non coupé). */
  texte: string;
}

export class ErreurXml extends Error {}

const ENTITES: Readonly<Record<string, string>> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

export function decoderEntites(s: string): string {
  if (!s.includes("&")) return s;
  return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (tout, e: string) => {
    if (e.startsWith("#x")) return String.fromCodePoint(Number.parseInt(e.slice(2), 16));
    if (e.startsWith("#")) return String.fromCodePoint(Number.parseInt(e.slice(1), 10));
    return ENTITES[e] ?? tout;
  });
}

const sansPrefixe = (n: string): string => {
  const i = n.indexOf(":");
  return i >= 0 ? n.slice(i + 1) : n;
};

/** Analyse un document XML ; renvoie l'élément racine. */
export function lireXml(texte: string): NoeudXml {
  const pile: NoeudXml[] = [];
  let racine: NoeudXml | null = null;
  let i = 0;
  const n = texte.length;
  if (texte.charCodeAt(0) === 0xfeff) i = 1;
  while (i < n) {
    const lt = texte.indexOf("<", i);
    const fin = lt < 0 ? n : lt;
    if (fin > i && pile.length > 0) (pile[pile.length - 1] as NoeudXml).texte += decoderEntites(texte.slice(i, fin));
    if (lt < 0) break;
    if (texte.startsWith("<!--", lt)) {
      const f = texte.indexOf("-->", lt + 4);
      if (f < 0) throw new ErreurXml("Commentaire XML non fermé.");
      i = f + 3;
    } else if (texte.startsWith("<![CDATA[", lt)) {
      const f = texte.indexOf("]]>", lt + 9);
      if (f < 0) throw new ErreurXml("Section CDATA non fermée.");
      if (pile.length > 0) (pile[pile.length - 1] as NoeudXml).texte += texte.slice(lt + 9, f);
      i = f + 3;
    } else if (texte.startsWith("<?", lt)) {
      const f = texte.indexOf("?>", lt + 2);
      if (f < 0) throw new ErreurXml("Instruction XML non fermée.");
      i = f + 2;
    } else if (texte.startsWith("<!", lt)) {
      // DOCTYPE : sauté, jamais interprété (aucune entité externe).
      let profondeur = 0;
      let k = lt + 2;
      for (; k < n; k++) {
        const c = texte[k];
        if (c === "[") profondeur++;
        else if (c === "]") profondeur--;
        else if (c === ">" && profondeur <= 0) break;
      }
      i = k + 1;
    } else if (texte[lt + 1] === "/") {
      const f = texte.indexOf(">", lt);
      if (f < 0) throw new ErreurXml("Balise fermante non terminée.");
      const nom = sansPrefixe(texte.slice(lt + 2, f).trim());
      const haut = pile.pop();
      if (!haut || haut.nom !== nom) throw new ErreurXml(`Balise fermante inattendue : </${nom}>.`);
      i = f + 1;
    } else {
      // Balise ouvrante : nom, attributs (valeurs entre guillemets simples ou doubles), auto-fermante ou non.
      let k = lt + 1;
      while (k < n && !/[\s/>]/.test(texte[k] as string)) k++;
      const nom = sansPrefixe(texte.slice(lt + 1, k));
      if (nom === "") throw new ErreurXml("Nom de balise vide.");
      const attributs: Record<string, string> = {};
      for (;;) {
        while (k < n && /\s/.test(texte[k] as string)) k++;
        if (k >= n) throw new ErreurXml(`Balise <${nom}> non terminée.`);
        const c = texte[k];
        if (c === ">" || (c === "/" && texte[k + 1] === ">")) break;
        let a = k;
        while (k < n && !/[\s=/>]/.test(texte[k] as string)) k++;
        const cle = sansPrefixe(texte.slice(a, k));
        while (k < n && /\s/.test(texte[k] as string)) k++;
        if (texte[k] !== "=") {
          attributs[cle] = "";
          continue;
        }
        k++;
        while (k < n && /\s/.test(texte[k] as string)) k++;
        const q = texte[k];
        if (q !== '"' && q !== "'") throw new ErreurXml(`Attribut « ${cle} » sans guillemets dans <${nom}>.`);
        a = k + 1;
        const f = texte.indexOf(q, a);
        if (f < 0) throw new ErreurXml(`Attribut « ${cle} » non fermé dans <${nom}>.`);
        attributs[cle] = decoderEntites(texte.slice(a, f));
        k = f + 1;
      }
      const auto = texte[k] === "/";
      const noeud: NoeudXml = { nom, attributs, enfants: [], texte: "" };
      if (pile.length > 0) (pile[pile.length - 1] as NoeudXml).enfants.push(noeud);
      else if (racine) throw new ErreurXml("Plusieurs éléments racines.");
      else racine = noeud;
      if (!auto) pile.push(noeud);
      i = k + (auto ? 2 : 1);
    }
  }
  if (pile.length > 0) throw new ErreurXml(`Balise <${(pile[pile.length - 1] as NoeudXml).nom}> non fermée.`);
  if (!racine) throw new ErreurXml("Document XML vide.");
  return racine;
}

/** Premier enfant direct de ce nom. */
export const enfant = (n: NoeudXml | undefined, nom: string): NoeudXml | undefined => n?.enfants.find((e) => e.nom === nom);
/** Enfants directs de ce nom. */
export const enfants = (n: NoeudXml | undefined, nom: string): NoeudXml[] => (n ? n.enfants.filter((e) => e.nom === nom) : []);
/** Descendants de ce nom (profondeur d'abord, ordre du document). */
export function descendants(n: NoeudXml, nom: string): NoeudXml[] {
  const r: NoeudXml[] = [];
  const pile = [...n.enfants].reverse();
  while (pile.length > 0) {
    const e = pile.pop() as NoeudXml;
    if (e.nom === nom) r.push(e);
    for (let k = e.enfants.length - 1; k >= 0; k--) pile.push(e.enfants[k] as NoeudXml);
  }
  return r;
}
/** Chemin d'enfants directs. */
export const chemin = (n: NoeudXml | undefined, ...noms: string[]): NoeudXml | undefined => noms.reduce<NoeudXml | undefined>((c, x) => enfant(c, x), n);
/** Nombres séparés par des blancs. */
export const nombresXml = (s: string): number[] => {
  const t = s.trim();
  return t === "" ? [] : t.split(/\s+/).map(Number);
};
