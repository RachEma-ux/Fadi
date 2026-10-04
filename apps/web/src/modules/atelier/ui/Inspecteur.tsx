/**
 * Inspecteur (repère 4) : objet principal de la sélection, champs typés avec unités et provenance, contrôle avant
 * envoi, validation par `ctx.valider`, erreurs « objet, cause, action ».
 */
import { useEffect, useState } from "react";
import type { EtatModele, ObjetModele } from "@parcours/atelier-model";
import type { ChampInspecteur, ContexteAtelier, ErreurLisible, RegistreInspecteur, Selection } from "../socle";
import { Erreurs } from "./Erreurs";
import { texteSaisieInitial, texteValeur } from "./format";
import { champsInspecteur, preparerModification, type Saisie } from "./inspecteur";
import { enTeteObjet, proprietesObjet } from "./inspecteur-generique";
import { libelleClasse, libelleObjet } from "./navigateur";

function Champ({ champ, objet, ctx, onResultat }: { champ: ChampInspecteur; objet: ObjetModele; ctx: ContexteAtelier; onResultat: (erreurs: readonly ErreurLisible[], message: string) => void }) {
  const initial = texteSaisieInitial(champ.valeur);
  const [texte, setTexte] = useState(initial);
  const [enCours, setEnCours] = useState(false);
  const [invalide, setInvalide] = useState(false);
  useEffect(() => setTexte(initial), [initial]);
  const id = `atl-champ-${champ.cle}`;

  const appliquer = async (saisie: Saisie) => {
    if (enCours) return;
    const p = preparerModification(champ, saisie, objet, ctx);
    if (p.etat === "inchange") return setInvalide(false);
    if (p.etat === "refus") {
      setInvalide(true);
      return onResultat(p.erreurs, "");
    }
    setEnCours(true);
    const r = await ctx.valider(p.label, p.commandes);
    setEnCours(false);
    setInvalide(!r.ok);
    if (r.ok) onResultat([], `${p.label} : modifié (révision locale ${r.etat.revision}).`);
    else onResultat(r.erreurs, "");
  };

  let controle;
  if (champ.lectureSeule) {
    controle = (
      <span className="atl-lu" id={id}>
        {texteValeur(champ.valeur, champ.unite)}
      </span>
    );
  } else if (champ.type === "booleen") {
    controle = <input id={id} type="checkbox" checked={champ.valeur === true} disabled={enCours} onChange={(e) => void appliquer({ booleen: e.target.checked })} data-testid={id} />;
  } else if (champ.type === "choix") {
    controle = (
      <span className="atl-val">
        <select id={id} value={typeof champ.valeur === "string" ? champ.valeur : ""} disabled={enCours} onChange={(e) => void appliquer({ texte: e.target.value })} aria-invalid={invalide || undefined} data-testid={id}>
          {typeof champ.valeur !== "string" && <option value="">{texteValeur(champ.valeur)}</option>}
          {(champ.choix ?? []).map((c) => (
            <option key={c.valeur} value={c.valeur}>
              {c.libelle}
            </option>
          ))}
        </select>
      </span>
    );
  } else {
    const numerique = champ.type !== "texte";
    controle = (
      <span className="atl-val">
        <input
          id={id}
          type="text"
          inputMode={numerique ? "decimal" : undefined}
          value={texte}
          placeholder={texteSaisieInitial(champ.valeur) === "" ? texteValeur(champ.valeur) : undefined}
          disabled={enCours}
          aria-invalid={invalide || undefined}
          onChange={(e) => setTexte(e.target.value)}
          onBlur={() => void appliquer({ texte })}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void appliquer({ texte });
            } else if (e.key === "Escape") {
              setTexte(initial);
              setInvalide(false);
            }
          }}
          data-testid={`atl-champ-${champ.cle}`}
        />
        {champ.unite && <span className="atl-unite">{champ.unite}</span>}
      </span>
    );
  }
  return (
    <div className={`atl-prop${invalide ? " atl-invalide" : ""}`}>
      {champ.lectureSeule ? <span className="atl-cle">{champ.libelle}</span> : <label htmlFor={id}>{champ.libelle}</label>}
      {controle}
      {champ.provenance && <span className="atl-provenance">{champ.provenance}</span>}
    </div>
  );
}

export function Inspecteur({ registre, ctx, etat, sel }: { registre: RegistreInspecteur; ctx: ContexteAtelier; etat: EtatModele | null; sel: Selection }) {
  const [erreurs, setErreurs] = useState<readonly ErreurLisible[]>([]);
  const [message, setMessage] = useState("");
  const objet = etat && sel.principal ? etat.objets[sel.principal] : undefined;
  useEffect(() => {
    setErreurs([]);
    setMessage("");
  }, [sel.principal]);

  if (!etat) return <p className="atl-muet">Chargement du modèle…</p>;
  if (!sel.principal) return <p className="atl-muet" data-testid="atl-inspecteur-vide">Aucun objet sélectionné. Choisissez un objet dans la zone de travail ou dans le navigateur.</p>;
  if (!objet) return <p className="atl-muet">L'objet sélectionné « {sel.principal} » n'existe plus dans le modèle (supprimé ou annulé).</p>;

  const champs = champsInspecteur(registre, objet, ctx);
  const niveau = objet.niveauId ? etat.objets[objet.niveauId] : undefined;
  return (
    <div data-testid="atl-inspecteur-objet" data-objet={objet.id}>
      <p className="atl-objet-titre">
        <b>{libelleObjet(objet)}</b> · {libelleClasse(objet.classe).toLowerCase()}
        {niveau ? ` · niveau ${libelleObjet(niveau)}` : ""}
      </p>
      {sel.ids.length > 1 && <p className="atl-muet atl-petit">{sel.ids.length} objets sélectionnés ; l'inspecteur montre le dernier choisi.</p>}
      {!ctx.ecriture.permise && <p className="atl-message atl-alerte">Lecture seule : {ctx.ecriture.motif}.</p>}
      <div className="atl-entete">
        {enTeteObjet(objet).map((l) => (
          <div className="atl-prop" key={l.libelle}>
            <span className="atl-cle">{l.libelle}</span>
            <span className="atl-lu">
              <code>{l.valeur}</code>
            </span>
          </div>
        ))}
      </div>
      <form className="atl-champs" onSubmit={(e) => e.preventDefault()} aria-label={`Paramètres de ${libelleObjet(objet)}`}>
        {champs.map((c) => (
          <Champ
            key={`${objet.id}-${c.cle}`}
            champ={c}
            objet={objet}
            ctx={ctx}
            onResultat={(e, m) => {
              setErreurs(e);
              setMessage(m);
            }}
          />
        ))}
      </form>
      <p className={message ? "atl-message atl-ok" : "atl-sr"} role="status">
        {message}
      </p>
      <Erreurs erreurs={erreurs} testId="atl-erreurs-inspecteur" />
      {objet.proprietes.length > 0 && (
        <details className="atl-bloc">
          <summary>Propriétés ({objet.proprietes.length})</summary>
          {proprietesObjet(objet).map((p, i) => (
            <div className="atl-prop" key={`${p.nom}-${i}`}>
              <span className="atl-cle">{p.nom}</span>
              <span className="atl-lu">{p.valeur}</span>
              <span className="atl-provenance">{p.provenance}</span>
            </div>
          ))}
        </details>
      )}
    </div>
  );
}
