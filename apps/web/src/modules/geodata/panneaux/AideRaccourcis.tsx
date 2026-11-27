/**
 * Aide « Raccourcis clavier » (feuille de route équipe A, PR P5 ; Q7) : lue dans la table unique des raccourcis, jamais
 * recopiée. Ouverte par « ? » (hors saisie) ou par l'entrée du groupe « Affichage » ; Échap ou « Fermer » la ferment et
 * rendent le focus à l'élément d'origine.
 */
import { useEffect, useRef } from "react";
import { RACCOURCIS } from "../raccourcis";

const affiche = (t: string) => t.replace("ArrowUp", "↑").replace("ArrowDown", "↓");

export function AideRaccourcis({ onFermer }: { onFermer(): void }) {
  const boite = useRef<HTMLDivElement>(null);
  const origine = useRef<HTMLElement | null>(null);
  useEffect(() => {
    origine.current = document.activeElement as HTMLElement | null;
    boite.current?.querySelector<HTMLButtonElement>("[data-gd-aide-fermer]")?.focus();
    return () => origine.current?.focus?.();
  }, []);
  return (
    <div ref={boite} role="dialog" aria-modal="false" aria-labelledby="gd-aide-titre" className="gd-aide-raccourcis" data-gd-aide-raccourcis
      onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onFermer(); } }}>
      <div className="gd-ligne-titre">
        <h2 id="gd-aide-titre">Raccourcis clavier</h2>
        <button type="button" onClick={onFermer} data-gd-aide-fermer>Fermer</button>
      </div>
      <table>
        <thead><tr><th scope="col">Commande</th><th scope="col">Touche</th></tr></thead>
        <tbody>
          {RACCOURCIS.map((r) => <tr key={r.commande} data-gd-aide-ligne={r.commande}><td>{r.libelle}</td><td><kbd translate="no">{affiche(r.touche)}</kbd></td></tr>)}
        </tbody>
      </table>
      <p className="gd-discret">Dans un groupe ouvert : flèches pour se déplacer, lettre affichée à droite pour activer, Échap pour fermer.</p>
    </div>
  );
}
