/**
 * Palette de commandes (UX2, DA-01-03) : Ctrl/⌘ K, recherche en français ou avec les termes d'autres logiciels
 * (synonymes), flèches pour parcourir, Entrée pour choisir, étoile pour épingler en favori. Chaque entrée dit ce
 * que fait l'outil et, si elle est indisponible, pourquoi.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { etatUi, type EtatUi } from "../etat-ui";
import { FAMILLES, rechercherOutils, type Outil } from "../outils";
import { libelleTouche, raccourciDe } from "../raccourcis";

export interface PropsPalette {
  ui: EtatUi;
  disponibilite: (o: Outil) => string | null;
  onChoisir: (o: Outil) => void;
}

export function Palette({ ui, disponibilite, onChoisir }: PropsPalette) {
  const [texte, setTexte] = useState("");
  const [index, setIndex] = useState(0);
  const champ = useRef<HTMLInputElement | null>(null);
  const resultats = useMemo(() => rechercherOutils(texte), [texte]);
  useEffect(() => champ.current?.focus(), []);
  useEffect(() => setIndex(0), [texte]);

  const fermer = () => etatUi.set({ paletteOuverte: false });
  const choisir = (o: Outil | undefined) => {
    if (!o) return;
    const raison = disponibilite(o);
    if (raison) {
      etatUi.set({ aide: raison });
      return;
    }
    onChoisir(o);
  };

  return (
    <div className="palette-fond" onPointerDown={(e) => e.target === e.currentTarget && fermer()}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Palette de commandes">
        <input
          ref={champ}
          className="palette-champ"
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-resultats"
          aria-activedescendant={resultats[index] ? `palette-${resultats[index]!.id}` : undefined}
          placeholder="Rechercher un outil (mur, wall, cloison, cote…)"
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Escape") fermer();
            else if (e.key === "ArrowDown") {
              e.preventDefault();
              setIndex((i) => Math.min(resultats.length - 1, i + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setIndex((i) => Math.max(0, i - 1));
            } else if (e.key === "Enter") {
              e.preventDefault();
              choisir(resultats[index]);
            }
          }}
        />
        <ul id="palette-resultats" role="listbox" className="palette-resultats">
          {resultats.length === 0 && <li className="palette-vide">Aucun outil ne correspond. Essayez un autre mot (« cloison », « slab », « cote »).</li>}
          {resultats.map((o, i) => {
            const raison = disponibilite(o);
            return (
              <li key={o.id} id={`palette-${o.id}`} role="option" aria-selected={i === index} aria-disabled={!!raison} className={`${i === index ? "est-actif" : ""}${raison ? " est-indisponible" : ""}`} onPointerEnter={() => setIndex(i)} onClick={() => choisir(o)}>
                <span className="palette-picto" aria-hidden="true">{o.picto}</span>
                <span className="palette-texte">
                  <strong>{o.libelle}</strong> <span className="palette-famille">{FAMILLES[o.famille]}</span>
                  <span className="palette-aide">{raison ?? o.aide}</span>
                </span>
                {libelleTouche(raccourciDe(o, ui.raccourcis)) && <kbd>{libelleTouche(raccourciDe(o, ui.raccourcis))}</kbd>}
                <button
                  type="button"
                  className="palette-favori"
                  aria-pressed={ui.favoris.includes(o.id)}
                  title={ui.favoris.includes(o.id) ? "Retirer des favoris" : "Épingler en favori"}
                  onClick={(e) => {
                    e.stopPropagation();
                    etatUi.basculerFavori(o.id);
                  }}
                >
                  {ui.favoris.includes(o.id) ? "★" : "☆"}
                  <span className="sr-only">{ui.favoris.includes(o.id) ? `Retirer ${o.libelle} des favoris` : `Épingler ${o.libelle}`}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
