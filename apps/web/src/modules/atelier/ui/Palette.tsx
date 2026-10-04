/** Palette `Ctrl/⌘ K` : recherche d'outils, d'objets, de paramètres et d'aides ; clavier complet. */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { EtatModele } from "@parcours/atelier-model";
import type { ContexteAtelier, RegistreOutils } from "../socle";
import { deplacerActif, FILTRES_PALETTE, LIBELLES_FILTRE, resultatsPalette, type FiltrePalette, type ResultatPalette } from "./palette";
import { texteRaccourci } from "./raccourcis";

export function Palette({
  outils,
  ctx,
  etat,
  favoris,
  onChoisir,
  onFavori,
  onFermer,
}: {
  outils: RegistreOutils;
  ctx: ContexteAtelier;
  etat: EtatModele | null;
  favoris: readonly string[];
  onChoisir: (r: ResultatPalette) => void;
  onFavori: (outilId: string) => void;
  onFermer: () => void;
}) {
  const [texte, setTexte] = useState("");
  const [filtre, setFiltre] = useState<FiltrePalette>("tout");
  const [actif, setActif] = useState(0);
  const champ = useRef<HTMLInputElement | null>(null);
  const boite = useRef<HTMLDivElement | null>(null);
  const { resultats, objetsNonListes } = useMemo(() => resultatsPalette({ texte, filtre, outils, ctx, etat, favoris }), [texte, filtre, outils, ctx, etat, favoris]);
  const courant = resultats[actif];

  useEffect(() => {
    const avant = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    champ.current?.focus();
    return () => avant?.focus();
  }, []);
  useEffect(() => setActif(0), [texte, filtre]);
  useEffect(() => {
    if (courant) document.getElementById(`atl-res-${courant.cle}`)?.scrollIntoView({ block: "nearest" });
  }, [courant]);

  const clavier = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setActif((a) => deplacerActif(a, resultats.length, e.key === "ArrowDown" ? 1 : -1));
    } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && e.target === champ.current) {
      e.preventDefault();
      if (courant?.action.type === "outil") onFavori(courant.action.id);
    } else if (e.key === "Enter" && e.target === champ.current) {
      e.preventDefault();
      if (courant) onChoisir(courant);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onFermer();
    } else if (e.key === "Tab") {
      // Piège du focus dans la boîte de dialogue modale.
      const f = boite.current?.querySelectorAll<HTMLElement>("input, button:not([disabled])");
      if (!f || f.length === 0) return;
      const premier = f[0];
      const dernier = f[f.length - 1];
      if (e.shiftKey && document.activeElement === premier) {
        e.preventDefault();
        dernier?.focus();
      } else if (!e.shiftKey && document.activeElement === dernier) {
        e.preventDefault();
        premier?.focus();
      }
    }
  };

  return (
    <>
      <div className="atl-voile" onClick={onFermer} aria-hidden="true" />
      <div ref={boite} className="atl-palette" role="dialog" aria-modal="true" aria-labelledby="atl-palette-titre" onKeyDown={clavier} data-testid="atl-palette">
        <h2 id="atl-palette-titre" className="atl-sr">
          Rechercher une commande, un objet, une aide
        </h2>
        <div className="atl-palette-tete">
          <input
            ref={champ}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls="atl-palette-liste"
            aria-activedescendant={courant ? `atl-res-${courant.cle}` : undefined}
            aria-autocomplete="list"
            aria-label="Rechercher une commande, un objet, une aide"
            placeholder="Rechercher une commande, un objet, une aide…"
            value={texte}
            onChange={(e) => setTexte(e.target.value)}
            data-testid="atl-palette-champ"
          />
          <button type="button" onClick={onFermer}>
            Échap
          </button>
        </div>
        <div className="atl-palette-filtres" role="group" aria-label="Filtrer les résultats">
          {FILTRES_PALETTE.map((f) => (
            <button key={f} type="button" className="atl-puce-filtre" aria-pressed={filtre === f} onClick={() => setFiltre(f)}>
              {LIBELLES_FILTRE[f]}
            </button>
          ))}
        </div>
        <ul id="atl-palette-liste" role="listbox" aria-label="Résultats">
          {resultats.map((r, i) => (
            <li
              key={r.cle}
              id={`atl-res-${r.cle}`}
              role="option"
              aria-selected={i === actif}
              aria-disabled={r.motif ? true : undefined}
              className={`atl-res${r.motif ? " atl-indispo" : ""}`}
              onMouseEnter={() => setActif(i)}
              onClick={() => onChoisir(r)}
              data-testid={`atl-palette-${r.cle}`}
            >
              <span className="atl-nom">
                {r.nom}
                {r.raccourci && <kbd className="atl-kbd">{texteRaccourci(r.raccourci)}</kbd>}
              </span>
              <span className="atl-fam">{r.etiquette}</span>
              {r.via && <span className="atl-via">{r.via}</span>}
              <dl>
                <dt>Action</dt>
                <dd>{r.aide.action}</dd>
                <dt>Conditions</dt>
                <dd>{r.motif ? <b>Indisponible : {r.motif}.</b> : r.aide.conditions}</dd>
                {r.aide.exemple && (
                  <>
                    <dt>Exemple</dt>
                    <dd>{r.aide.exemple}</dd>
                  </>
                )}
              </dl>
              {r.favori && <span className="atl-etoile">★ épinglé</span>}
            </li>
          ))}
          {resultats.length === 0 && <li className="atl-vide">Aucun résultat pour « {texte} ».</li>}
          {objetsNonListes > 0 && <li className="atl-vide">… et {objetsNonListes} objet(s) de plus : précisez la recherche.</li>}
        </ul>
        <p className="atl-palette-pied" aria-live="polite">
          <span>
            <kbd className="atl-kbd">↑</kbd> <kbd className="atl-kbd">↓</kbd> choisir
          </span>
          <span>
            <kbd className="atl-kbd">Entrée</kbd> lancer
          </span>
          <span>
            <kbd className="atl-kbd">Échap</kbd> fermer
          </span>
          <span>{resultats.length} résultat(s)</span>
        </p>
        {courant?.action.type === "outil" && (
          <p className="atl-palette-pied">
            <button type="button" className="atl-epingle" aria-pressed={!!courant.favori} onClick={() => courant.action.type === "outil" && onFavori(courant.action.id)} data-testid="atl-palette-epingler">
              {courant.favori ? `★ Retirer « ${courant.nom} » des favoris` : `☆ Épingler « ${courant.nom} » dans la barre`}
            </button>
            <span>
              <kbd className="atl-kbd">Ctrl</kbd> <kbd className="atl-kbd">Entrée</kbd> épingler
            </span>
          </p>
        )}
      </div>
    </>
  );
}
