/**
 * Clavier de l'espace de travail : chaque raccourci du registre (`STUDIO_TOOLS`) et des commandes de l'éditeur
 * (`COMMANDES_EDITEUR`) lance son outil ou sa commande. Une boîte de dialogue ouverte garde le clavier ; dans un champ,
 * seuls les raccourcis admis (`actifDansUnChamp`) passent ; Entrée / Maj+Entrée ne sont prises que pendant le tracé
 * d'une polyligne. Espace tenue sert au panoramique (Espace + glisser) ; relâchée sans glisser, elle choisit la Sélection.
 */
import { useEffect, useRef, type MutableRefObject } from "react";
import { actifDansUnChamp, cibleRaccourci, combinaison, COMMANDES_EDITEUR, type CibleRaccourci, type CommandeEditeur } from "../planche2d/raccourcis";

export interface OptionsClavier {
  /** Une boîte de dialogue (Outils, palette, feuille, import) est ouverte. */
  dialogue: boolean;
  /** Le contexte et le dessin sont chargés. */
  pret: boolean;
  commandeDisponible: (c: CommandeEditeur) => boolean;
  executer: (cible: CibleRaccourci, verifier: boolean) => void;
  /** Espace tenue (partagée avec les gestes de la planche). */
  espace: MutableRefObject<{ tenu: boolean; panoramique: boolean }>;
  /** Raccourcis personnels du profil (EX-034), consultés après la table native (jamais une combinaison native). */
  personnels?: ReadonlyMap<string, CibleRaccourci>;
}

export function useClavierStudio(o: OptionsClavier) {
  const clavier = useRef<(e: KeyboardEvent) => void>(() => {});
  const relacher = useRef<(e: KeyboardEvent) => void>(() => {});
  const { espace } = o;
  clavier.current = (e: KeyboardEvent) => {
    const c = combinaison(e);
    // Une boîte de dialogue ouverte (Outils, palette) garde le clavier pour elle ; Ctrl+S / Ctrl+K n'atteignent pas le navigateur.
    if (o.dialogue) { if (c === "Ctrl+S" || c === "Ctrl+K") e.preventDefault(); return; }
    const field = (e.target as Element | null)?.closest?.("input,textarea,select,[contenteditable=true]");
    if (field && !actifDansUnChamp(c)) return;
    const cible = cibleRaccourci(c) ?? (c ? o.personnels?.get(c) ?? null : null);
    if (!cible || !o.pret) return;
    // Entrée / Maj+Entrée ne sont prises que pendant le tracé d'une polyligne : ailleurs, elles activent le bouton focalisé.
    if (cible.type === "commande" && (cible.id === "terminer-polyligne" || cible.id === "fermer-polyligne")) {
      const c2 = COMMANDES_EDITEUR.find(x => x.id === cible.id);
      if (!c2 || !o.commandeDisponible(c2)) return;
    }
    e.preventDefault();
    // Espace : tenue, elle sert au panoramique (Espace + glisser) ; relâchée sans glisser, elle choisit la Sélection.
    if (cible.type === "outil" && cible.toolId === "studio.dessin.selection") { if (!e.repeat && !espace.current.tenu) espace.current = { tenu: true, panoramique: false }; return; }
    o.executer(cible, false);
  };
  relacher.current = (e: KeyboardEvent) => {
    if (e.key !== " " || !espace.current.tenu) return;
    const panoramique = espace.current.panoramique;
    espace.current = { tenu: false, panoramique: false };
    if (!panoramique && !o.dialogue && o.pret) o.executer({ type: "outil", toolId: "studio.dessin.selection" }, false);
  };
  useEffect(() => {
    const keys = (e: KeyboardEvent) => clavier.current(e);
    const keysUp = (e: KeyboardEvent) => relacher.current(e);
    const blur = () => { espace.current = { tenu: false, panoramique: false }; };
    window.addEventListener("keydown", keys); window.addEventListener("keyup", keysUp); window.addEventListener("blur", blur);
    return () => { window.removeEventListener("keydown", keys); window.removeEventListener("keyup", keysUp); window.removeEventListener("blur", blur); };
  }, [espace]);
}
