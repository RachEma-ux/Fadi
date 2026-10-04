/**
 * Zone de travail (repère 2) : bandeau (niveau actif, bascule 2D / 3D, puce d'outil actif), consigne et champs de
 * saisie de précision de l'outil, erreurs de contrôle, puis la zone fournie par l'équipier « 2D » (`zoneTravail`).
 */
import { useState, type ReactNode } from "react";
import type { ChampSaisie, ErreurLisible, EtatInterface, PiloteOutils, VueTravail } from "../socle";
import { Erreurs } from "./Erreurs";
import { lireNombre, texteExact } from "./format";

function ChampPrecision({ champ, pilote, onErreur }: { champ: ChampSaisie; pilote: PiloteOutils; onErreur: (e: readonly ErreurLisible[]) => void }) {
  const [texte, setTexte] = useState("");
  const id = `atl-precision-${champ.champ}`;
  const envoyer = () => {
    const r = lireNombre(texte, champ.unite, champ.libelle);
    if (!r.ok) return onErreur([r.erreur]);
    onErreur([]);
    if (r.valeur === null) return;
    setTexte("");
    void pilote.traiter({ type: "saisie", champ: champ.champ, valeur: r.valeur });
  };
  return (
    <label htmlFor={id}>
      {champ.libelle}
      {champ.unite ? ` (${champ.unite})` : ""}
      <input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={texte}
        placeholder={champ.valeur === null ? "" : texteExact(champ.valeur)}
        onChange={(e) => setTexte(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            envoyer();
          }
        }}
        data-testid={`atl-precision-${champ.champ}`}
      />
    </label>
  );
}

export function ZoneTravail({
  pilote,
  vue,
  vueTravail,
  niveauActif,
  enfant,
}: {
  pilote: PiloteOutils;
  vue: EtatInterface;
  vueTravail: VueTravail;
  niveauActif: { nom: string; detail: string } | null;
  enfant: ReactNode;
}) {
  const [erreursSaisie, setErreursSaisie] = useState<readonly ErreurLisible[]>([]);
  const outil = pilote.outilActif();
  const apercu = pilote.apercu();
  const erreurs = [...erreursSaisie, ...apercu.erreurs, ...pilote.derniereErreur()];
  return (
    <>
      <div className="atl-zone-barre">
        <span className="atl-niveau-actif" data-testid="atl-niveau-actif">
          {niveauActif ? (
            <>
              {niveauActif.nom} <span className="atl-muet-clair">{niveauActif.detail}</span>
            </>
          ) : (
            "Aucun niveau actif"
          )}
        </span>
        <span className="atl-segment atl-clair" role="radiogroup" aria-label="Vue de la zone de travail">
          <button type="button" role="radio" aria-checked={vueTravail === "plan"} onClick={() => vue.modifier({ vue: "plan" })} data-testid="atl-vue-plan">
            Plan 2D
          </button>
          <button type="button" role="radio" aria-checked={false} aria-disabled="true" title="La vue 3D arrive au lot 3b" data-testid="atl-vue-3d">
            3D <span className="atl-lot">lot 3b</span>
          </button>
        </span>
        <span className="atl-puce" data-testid="atl-puce-outil">
          <span className="atl-sr">Outil actif : </span>
          {outil ? outil.libelle : "Sélection"}
        </span>
        <p className="atl-consigne" aria-live="polite" data-testid="atl-consigne">
          {apercu.consigne || (outil ? outil.aide.action : "Sélection : cliquez un objet, ou choisissez un outil (barre, raccourci, Ctrl/⌘ K).")}
        </p>
        {outil && (
          <button type="button" className="atl-petit-bouton" onClick={() => pilote.abandonner()} data-testid="atl-abandonner">
            Terminer <kbd className="atl-kbd">Échap</kbd>
          </button>
        )}
      </div>
      {apercu.champs.length > 0 && (
        <div className="atl-precision" role="group" aria-label="Saisie de précision" data-testid="atl-precision">
          {apercu.champs.map((c) => (
            <ChampPrecision key={c.champ} champ={c} pilote={pilote} onErreur={setErreursSaisie} />
          ))}
          <span className="atl-muet atl-petit">Entrée pour appliquer</span>
        </div>
      )}
      <Erreurs erreurs={erreurs} titre="Contrôle refusé — rien n'a été modifié" testId="atl-erreurs-geste" />
      <div className="atl-toile" id="atl-zone-travail" tabIndex={-1}>
        {enfant}
      </div>
    </>
  );
}
