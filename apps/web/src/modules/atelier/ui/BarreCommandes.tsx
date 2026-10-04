/** Barre de commandes contextuelle (repère 3) : favoris, outils par niveau d'affichage, familles au niveau Complet. */
import type { KeyboardEvent } from "react";
import type { Activation, DefinitionOutil, FamilleOutil, NiveauAffichage } from "../socle";
import { modeleBarre } from "./barre";
import { texteRaccourci } from "./raccourcis";

export function BarreCommandes({
  outils,
  niveau,
  favoris,
  famille,
  onFamille,
  outilActif,
  activation,
  onActiver,
  onPalette,
  disposition = "barre",
}: {
  outils: readonly DefinitionOutil[];
  niveau: NiveauAffichage;
  favoris: readonly string[];
  famille: FamilleOutil;
  onFamille: (f: FamilleOutil) => void;
  outilActif: string | null;
  activation: (o: DefinitionOutil) => Activation;
  onActiver: (id: string | null) => void;
  onPalette: () => void;
  /** `grille` : feuille « Outils » du téléphone. */
  disposition?: "barre" | "grille";
}) {
  const m = modeleBarre({ outils, niveau, favoris, famille, activation });
  const prefixe = disposition === "grille" ? "atl-tel-outil" : "atl-outil";

  const bouton = (o: DefinitionOutil, cle: string) => {
    const a = activation(o);
    const actif = outilActif === o.id;
    const description = [o.aide.action, o.raccourci ? `Raccourci : ${texteRaccourci(o.raccourci)}` : "", a.ok ? "" : `Indisponible : ${a.motif}`].filter(Boolean).join(" · ");
    return (
      <button
        key={cle}
        type="button"
        className={`atl-outil${favoris.includes(o.id) ? " atl-favori" : ""}`}
        aria-pressed={actif}
        aria-disabled={!a.ok || undefined}
        title={description}
        aria-description={description}
        onClick={() => onActiver(actif ? null : o.id)}
        data-testid={`${prefixe}-${o.id}`}
      >
        <span>{o.libelle}</span>
        {o.raccourci && (
          <kbd className="atl-kbd" aria-hidden="true">
            {texteRaccourci(o.raccourci)}
          </kbd>
        )}
      </button>
    );
  };

  const flechesOnglets = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const i = m.familles.findIndex((f) => f.famille === famille);
    const n = m.familles.length;
    const suivant = m.familles[(i + (e.key === "ArrowRight" ? 1 : n - 1)) % n];
    if (!suivant) return;
    e.preventDefault();
    onFamille(suivant.famille);
    requestAnimationFrame(() => document.getElementById(`${prefixe}-onglet-${suivant.famille}`)?.focus());
  };

  return (
    <div className={`atl-commandes atl-${disposition}`}>
      {m.familles.length > 0 && (
        <div className="atl-familles" role="tablist" aria-label="Familles de commandes" onKeyDown={flechesOnglets}>
          {m.familles.map((f) => (
            <button
              key={f.famille}
              id={`${prefixe}-onglet-${f.famille}`}
              type="button"
              role="tab"
              aria-selected={f.famille === famille}
              aria-controls={`${prefixe}-panneau`}
              tabIndex={f.famille === famille ? 0 : -1}
              onClick={() => onFamille(f.famille)}
              data-testid={`${prefixe}-famille-${f.famille}`}
            >
              {f.libelle} <span className="atl-nb">{f.nombre}</span>
            </button>
          ))}
        </div>
      )}
      <div
        className="atl-outils"
        id={`${prefixe}-panneau`}
        role={m.familles.length > 0 ? "tabpanel" : "toolbar"}
        aria-label={m.familles.length > 0 ? undefined : "Outils"}
        aria-labelledby={m.familles.length > 0 ? `${prefixe}-onglet-${famille}` : undefined}
      >
        <button type="button" className="atl-outil" aria-pressed={outilActif === null} onClick={() => onActiver(null)} title="Sélection : clic, lasso ou filtre par classe" data-testid={`${prefixe}-selection`}>
          <span>Sélection</span>
        </button>
        {m.favoris.length > 0 && (
          <span className="atl-groupe" role="group" aria-label="Favoris épinglés">
            <span className="atl-titre-groupe" aria-hidden="true">
              ★ Favoris
            </span>
            {m.favoris.map((o) => bouton(o, `fav-${o.id}`))}
          </span>
        )}
        {m.groupes.map((g) => (
          <span key={g.cle} className="atl-groupe" role="group" aria-label={g.titre}>
            <span className="atl-titre-groupe" aria-hidden="true">
              {g.titre}
            </span>
            {g.outils.length === 0 ? <span className="atl-muet atl-petit">{g.cle === "contexte" ? "aucun outil pour la sélection courante" : "aucun outil enregistré"}</span> : g.outils.filter((o) => !favoris.includes(o.id)).map((o) => bouton(o, o.id))}
          </span>
        ))}
        <button type="button" className="atl-plus-palette" onClick={onPalette} data-testid={`${prefixe}-palette`}>
          Toutes les commandes <kbd className="atl-kbd">Ctrl</kbd> <kbd className="atl-kbd">K</kbd>
        </button>
      </div>
    </div>
  );
}
