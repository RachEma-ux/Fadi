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

/** Champ de texte d'un outil (`genre: "texte"`, D-038) : Entrée valide, Maj+Entrée passe à la ligne. */
function ChampTexte({ champ, pilote }: { champ: ChampSaisie; pilote: PiloteOutils }) {
  const [texte, setTexte] = useState("");
  const id = `atl-precision-${champ.champ}`;
  return (
    <label htmlFor={id}>
      {champ.libelle}
      <textarea
        id={id}
        rows={2}
        autoComplete="off"
        value={texte}
        onChange={(e) => setTexte(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (texte.trim() === "") return;
            const contenu = texte;
            setTexte("");
            void pilote.traiter({ type: "saisie-texte", champ: champ.champ, texte: contenu });
          }
        }}
        data-testid={`atl-precision-${champ.champ}`}
      />
    </label>
  );
}

/** Liste de choix d'un outil (`ChampSaisie.choix`, D-038) : envoie l'évènement `choix` au changement. */
function ChampChoix({ champ, pilote }: { champ: ChampSaisie; pilote: PiloteOutils }) {
  const id = `atl-precision-${champ.champ}`;
  return (
    <label htmlFor={id}>
      {champ.libelle}
      <select id={id} value={champ.valeurChoisie ?? ""} onChange={(e) => void pilote.traiter({ type: "choix", champ: champ.champ, valeur: e.target.value })} data-testid={`atl-precision-${champ.champ}`}>
        {champ.valeurChoisie == null && <option value="">—</option>}
        {(champ.choix ?? []).map((o) => (
          <option key={o.valeur} value={o.valeur}>
            {o.libelle}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ZoneTravail({
  pilote,
  vue,
  vueTravail,
  niveauActif,
  enfant,
  enfant3d,
}: {
  pilote: PiloteOutils;
  vue: EtatInterface;
  vueTravail: VueTravail;
  niveauActif: { nom: string; detail: string } | null;
  enfant: ReactNode;
  /** Vue 3D (L3b.1) ; absente = bascule 3D désactivée. */
  enfant3d?: ReactNode;
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
          <button
            type="button"
            role="radio"
            aria-checked={vueTravail === "plan"}
            onClick={() => {
              if (pilote.outilActif() && !pilote.outilActif()?.vues.includes("plan")) pilote.abandonner();
              vue.modifier({ vue: "plan" });
            }}
            data-testid="atl-vue-plan"
          >
            Plan 2D
          </button>
          {enfant3d ? (
            <button
              type="button"
              role="radio"
              aria-checked={vueTravail === "3d"}
              onClick={() => {
                // Un geste du plan 2D ne continue pas en 3D (et inversement) : abandon sans écriture.
                if (pilote.outilActif() && !pilote.outilActif()?.vues.includes("3d")) pilote.abandonner();
                vue.modifier({ vue: "3d" });
              }}
              data-testid="atl-vue-3d"
            >
              3D
            </button>
          ) : (
            <button type="button" role="radio" aria-checked={false} aria-disabled="true" title="Vue 3D indisponible" data-testid="atl-vue-3d">
              3D
            </button>
          )}
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
          {apercu.champs.map((c) =>
            c.choix ? (
              <ChampChoix key={c.champ} champ={c} pilote={pilote} />
            ) : c.genre === "texte" ? (
              <ChampTexte key={c.champ} champ={c} pilote={pilote} />
            ) : (
              <ChampPrecision key={c.champ} champ={c} pilote={pilote} onErreur={setErreursSaisie} />
            ),
          )}
          <span className="atl-muet atl-petit">Entrée pour appliquer</span>
        </div>
      )}
      <Erreurs erreurs={erreurs} titre="Contrôle refusé — rien n'a été modifié" testId="atl-erreurs-geste" />
      <div className="atl-toile" id="atl-zone-travail" tabIndex={-1}>
        {vueTravail === "3d" && enfant3d ? enfant3d : enfant}
      </div>
    </>
  );
}
