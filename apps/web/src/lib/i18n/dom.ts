/**
 * Traduction de l'interface affichée (D-163) : en anglais, les textes et les attributs lisibles (title, aria-label,
 * placeholder, alt, aria-valuetext, aria-description) du document sont traduits à l'affichage et le restent quand
 * React les met à jour. Couche d'adaptation : aucun composant n'est réécrit. Ne sont jamais touchés : les champs
 * de saisie (valeurs), les blocs marqués `translate="no"` (données du projet, aperçus de documents), les scripts et
 * les styles.
 */
import type { Traducteur } from "./traduire";

const ATTRIBUTS = ["title", "aria-label", "placeholder", "alt", "aria-valuetext", "aria-description", "aria-roledescription"];
/** Contenus jamais parcourus ; le texte d'une zone de saisie est une donnée (ses attributs se traduisent). */
const EXCLUS = new Set(["SCRIPT", "STYLE", "CODE", "PRE", "NOSCRIPT"]);
const TEXTE_EXCLU = new Set(["TEXTAREA"]);

export function demarrerTraductionDom(t: Traducteur, racine: Node = document.body): () => void {
  /** Dernière valeur écrite par la traduction : une mutation qui la redonne vient de nous. */
  const ecrits = new WeakMap<Node, string>();
  const ecritsAttr = new WeakMap<Element, Map<string, string>>();

  const exclu = (n: Node | null): boolean => {
    for (let e: Node | null = n; e; e = e.parentNode) {
      if (e.nodeType !== 1) continue;
      const el = e as Element;
      if (EXCLUS.has(el.tagName) || (el as HTMLElement).isContentEditable) return true;
      if (el.getAttribute("translate") === "no") return true;
    }
    return false;
  };

  const texte = (n: Text) => {
    const v = n.nodeValue ?? "";
    if (ecrits.get(n) === v) return;
    if (n.parentElement && TEXTE_EXCLU.has(n.parentElement.tagName)) return;
    if (exclu(n.parentNode)) return;
    const tr = t.traduire(v);
    if (tr !== v) {
      ecrits.set(n, tr);
      n.nodeValue = tr;
    }
  };

  const attribut = (el: Element, a: string) => {
    const v = el.getAttribute(a);
    if (v === null) return;
    const deja = ecritsAttr.get(el);
    if (deja?.get(a) === v) return;
    const tr = t.traduire(v);
    if (tr !== v) {
      const m = deja ?? new Map<string, string>();
      m.set(a, tr);
      ecritsAttr.set(el, m);
      el.setAttribute(a, tr);
    }
  };

  const element = (el: Element) => {
    if (exclu(el)) return;
    for (const a of ATTRIBUTS) if (el.hasAttribute(a)) attribut(el, a);
    // Boutons « input » : leur libellé est leur valeur.
    if (el.tagName === "INPUT" && ["button", "submit", "reset"].includes((el as HTMLInputElement).type)) attribut(el, "value");
    const w = document.createTreeWalker(el, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: (x) => (x.nodeType === 1 && (EXCLUS.has((x as Element).tagName) || (x as Element).getAttribute("translate") === "no") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    for (let x = w.nextNode(); x; x = w.nextNode()) {
      if (x.nodeType === 3) texte(x as Text);
      else {
        const e = x as Element;
        for (const a of ATTRIBUTS) if (e.hasAttribute(a)) attribut(e, a);
        if (e.tagName === "INPUT" && ["button", "submit", "reset"].includes((e as HTMLInputElement).type)) attribut(e, "value");
      }
    }
  };

  if (racine.nodeType === 1) element(racine as Element);
  const obs = new MutationObserver((ms) => {
    for (const m of ms) {
      if (m.type === "characterData") texte(m.target as Text);
      else if (m.type === "attributes" && m.attributeName) attribut(m.target as Element, m.attributeName);
      else
        m.addedNodes.forEach((n) => {
          if (n.nodeType === 3) texte(n as Text);
          else if (n.nodeType === 1) element(n as Element);
        });
    }
  });
  obs.observe(racine, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRIBUTS });
  // Titre de l'onglet.
  const titre = () => {
    const tr = t.traduire(document.title);
    if (tr !== document.title) document.title = tr;
  };
  titre();
  const obsTitre = new MutationObserver(titre);
  const elTitre = document.querySelector("title");
  if (elTitre) obsTitre.observe(elTitre, { childList: true, characterData: true, subtree: true });
  return () => {
    obs.disconnect();
    obsTitre.disconnect();
  };
}
