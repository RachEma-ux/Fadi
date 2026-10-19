/**
 * Focus pendant une sauvegarde (I.5-02) : les commandes se désactivent le temps de l'envoi, et le navigateur rend alors
 * le focus au corps de la page. Ce crochet relève l'élément focalisé au début de la sauvegarde et le lui rend à la fin,
 * si le focus n'a été pris par rien d'autre entre-temps : après « Enregistrer » (ou Ctrl+S), le focus reste où il était.
 */
import { useEffect, useRef } from "react";

export function useFocusConserve(enCours: boolean): void {
  const avant = useRef<HTMLElement | null>(null);
  // Relevé au rendu qui démarre la sauvegarde, avant que le bouton ne soit désactivé.
  if (enCours && !avant.current && typeof document !== "undefined") {
    const a = document.activeElement;
    avant.current = a instanceof HTMLElement && a !== document.body ? a : null;
  }
  useEffect(() => {
    if (enCours) return;
    const el = avant.current;
    avant.current = null;
    if (!el) return;
    const perdu = !document.activeElement || document.activeElement === document.body;
    // Une ligne de liste ou un bouton remplacé par un nouveau rendu : on retrouve le même élément par son marqueur.
    if (perdu && el.isConnected && !el.matches(":disabled")) el.focus();
  }, [enCours]);
}
