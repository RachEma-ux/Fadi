/**
 * Éditeur guidé de scripts (D-028) : paramètres, boucles et gabarits de commandes saisis dans un formulaire, validés
 * à mesure par le même code que le serveur (`assemblerScript` → `validerScript`, puis `developperScript` sur le modèle
 * courant avec les valeurs par défaut) ; « Enregistrer une version » ajoute une version immuable au projet. Une
 * commande hors du catalogue guidé reste possible en JSON (commande libre).
 */
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  assemblerScript,
  developperScript,
  ErreurScript,
  GABARIT_PAR_TYPE,
  GABARITS_GUIDES,
  niveauxOrdonnes,
  versScriptGuide,
  type BouclePour,
  type LigneScriptGuide,
  type ModeleAtelier,
  type ParametreScript,
  type ScriptAtelier,
  type ScriptGuide,
  type TypeParametre,
} from "@parcours/atelier-model";
import { api } from "../../../../lib/api";
import { messageErreur } from "./Versions";

const TYPES_PARAMETRE: [TypeParametre, string][] = [
  ["nombre", "nombre"],
  ["entier", "entier"],
  ["longueur", "longueur (m)"],
  ["chaine", "texte"],
  ["niveau", "niveau"],
];

const VIDE: ScriptGuide = { id: "", nom: "", description: "", parametres: [], pour: [], commandes: [{ type: "mur.tracer", saisies: {} }] };

export function EditeurScript({ projectId, etat, scripts, onEnregistre }: { projectId: string; etat: ModeleAtelier; scripts: ScriptAtelier[]; onEnregistre: (id: string) => void }) {
  const qc = useQueryClient();
  const [s, setS] = useState<ScriptGuide>(VIDE);
  const [message, setMessage] = useState<{ texte: string; erreur: boolean } | null>(null);
  const [occupe, setOccupe] = useState(false);
  const niveaux = niveauxOrdonnes(etat);

  // Validation et développement à mesure (valeurs par défaut ; premier niveau pour un paramètre niveau sans défaut).
  const verdict = useMemo(() => {
    try {
      const script = assemblerScript(s);
      const valeurs = Object.fromEntries(script.parametres.map((p) => [p.nom, p.defaut ?? (p.type === "niveau" ? niveaux[0]?.id : undefined)]));
      try {
        const n = developperScript(script, etat, valeurs).length;
        return { script, texte: `Script valide : ${n} commande(s) avec les valeurs par défaut.`, erreur: false };
      } catch (err) {
        return { script, texte: `Script valide ; essai avec les valeurs par défaut impossible : ${err instanceof ErreurScript ? `${err.chemin} — ${err.message}` : String(err)}`, erreur: false };
      }
    } catch (err) {
      return { script: null, texte: err instanceof ErreurScript ? `${err.chemin} : ${err.message}` : String(err), erreur: true };
    }
  }, [s, etat, niveaux]);

  const majParam = (i: number, patch: Partial<ParametreScript>) => setS({ ...s, parametres: s.parametres.map((p, k) => (k === i ? { ...p, ...patch } : p)) });
  const majBoucle = (i: number, b: BouclePour) => setS({ ...s, pour: s.pour.map((x, k) => (k === i ? b : x)) });
  const majCommande = (i: number, l: LigneScriptGuide) => setS({ ...s, commandes: s.commandes.map((x, k) => (k === i ? l : x)) });
  const nombreOuVide = (t: string) => (t.trim() === "" ? undefined : Number(t.replace(",", ".")));
  const references = [...s.parametres.map((p) => `$${p.nom}`), ...s.pour.map((b) => `$${b.variable}`)];

  const enregistrer = async () => {
    setMessage(null);
    if (!verdict.script) return setMessage({ texte: verdict.texte, erreur: true });
    setOccupe(true);
    try {
      const r = await api.postAtelierScript(projectId, verdict.script);
      void qc.invalidateQueries({ queryKey: ["atelier-scripts", projectId] });
      setMessage({ texte: `Script « ${r.nom} » enregistré (version ${r.version}).`, erreur: false });
      onEnregistre(r.id);
    } catch (err) {
      setMessage({ texte: messageErreur(err), erreur: true });
    } finally {
      setOccupe(false);
    }
  };

  return (
    <details className="auto-editeur" data-editeur-script>
      <summary>Écrire un script (éditeur guidé)</summary>
      <label className="auto-champ">
        Partir de
        <select onChange={(e) => { const x = scripts.find((y) => y.id === e.target.value); setS(x ? { ...versScriptGuide(x), id: x.id } : VIDE); setMessage(null); }} defaultValue="" data-editeur="depart">
          <option value="">un script vide</option>
          {scripts.map((x) => <option key={`${x.id}-${x.version}`} value={x.id}>{x.nom} · v{x.version}</option>)}
        </select>
      </label>
      <div className="editeur-identite">
        <label className="auto-champ">Identifiant<input value={s.id} onChange={(e) => setS({ ...s, id: e.target.value })} placeholder="ma-trame" data-editeur="id" /></label>
        <label className="auto-champ">Nom<input value={s.nom} onChange={(e) => setS({ ...s, nom: e.target.value })} data-editeur="nom" /></label>
      </div>
      <label className="auto-champ">Description<textarea rows={2} value={s.description} onChange={(e) => setS({ ...s, description: e.target.value })} /></label>

      <fieldset className="reprise-choix">
        <legend>Paramètres saisis à l'exécution</legend>
        {s.parametres.map((p, i) => (
          <div key={i} className="editeur-ligne" data-editeur-parametre={i}>
            <input aria-label={`Nom du paramètre ${i + 1}`} value={p.nom} placeholder="nom" onChange={(e) => majParam(i, { nom: e.target.value })} />
            <input aria-label={`Libellé du paramètre ${i + 1}`} value={p.libelle} placeholder="libellé" onChange={(e) => majParam(i, { libelle: e.target.value })} />
            <select aria-label={`Type du paramètre ${i + 1}`} value={p.type} onChange={(e) => majParam(i, { type: e.target.value as TypeParametre })}>
              {TYPES_PARAMETRE.map(([t, l]) => <option key={t} value={t}>{l}</option>)}
            </select>
            <input aria-label={`Valeur par défaut du paramètre ${i + 1}`} value={p.defaut === undefined ? "" : String(p.defaut)} placeholder="défaut" onChange={(e) => majParam(i, { defaut: p.type === "chaine" || p.type === "niveau" ? e.target.value || undefined : nombreOuVide(e.target.value) })} />
            {(p.type === "nombre" || p.type === "entier" || p.type === "longueur") && (
              <>
                <input aria-label={`Minimum du paramètre ${i + 1}`} value={p.min ?? ""} placeholder="min" size={4} onChange={(e) => majParam(i, { min: nombreOuVide(e.target.value) })} />
                <input aria-label={`Maximum du paramètre ${i + 1}`} value={p.max ?? ""} placeholder="max" size={4} onChange={(e) => majParam(i, { max: nombreOuVide(e.target.value) })} />
              </>
            )}
            <button type="button" className="bouton-mini" onClick={() => setS({ ...s, parametres: s.parametres.filter((_, k) => k !== i) })}>×<span className="sr-only">Retirer le paramètre {i + 1}</span></button>
          </div>
        ))}
        <button type="button" onClick={() => setS({ ...s, parametres: [...s.parametres, { nom: `p${s.parametres.length + 1}`, libelle: "", type: "nombre" }] })} data-editeur="ajouter-parametre">Ajouter un paramètre</button>
      </fieldset>

      <fieldset className="reprise-choix">
        <legend>Boucles (de l'extérieur vers l'intérieur, 3 au plus)</legend>
        {s.pour.map((b, i) => (
          <div key={i} className="editeur-ligne">
            <input aria-label={`Variable de la boucle ${i + 1}`} value={b.variable} size={6} onChange={(e) => majBoucle(i, { ...b, variable: e.target.value })} />
            <select aria-label={`Nature de la boucle ${i + 1}`} value={"niveaux" in b ? "niveaux" : "entiers"} onChange={(e) => majBoucle(i, e.target.value === "niveaux" ? { variable: b.variable, niveaux: true } : { variable: b.variable, de: 0, a: 1 })}>
              <option value="entiers">entiers de … à …</option>
              <option value="niveaux">chaque niveau du modèle</option>
            </select>
            {!("niveaux" in b) && (
              <>
                <input aria-label={`Début de la boucle ${i + 1}`} value={String(b.de)} size={6} onChange={(e) => majBoucle(i, { ...b, de: /^-?\d+$/.test(e.target.value.trim()) ? Number(e.target.value) : e.target.value })} />
                <input aria-label={`Fin de la boucle ${i + 1}`} value={String(b.a)} size={8} onChange={(e) => majBoucle(i, { ...b, a: /^-?\d+$/.test(e.target.value.trim()) ? Number(e.target.value) : e.target.value })} />
              </>
            )}
            <button type="button" className="bouton-mini" onClick={() => setS({ ...s, pour: s.pour.filter((_, k) => k !== i) })}>×<span className="sr-only">Retirer la boucle {i + 1}</span></button>
          </div>
        ))}
        {s.pour.length < 3 && <button type="button" onClick={() => setS({ ...s, pour: [...s.pour, { variable: ["i", "j", "k"][s.pour.length]!, de: 0, a: 1 }] })} data-editeur="ajouter-boucle">Ajouter une boucle</button>}
      </fieldset>

      <fieldset className="reprise-choix">
        <legend>Commandes répétées à chaque tour</legend>
        <p className="nav-detail">Un nombre reste un nombre ; « $nom » reprend un paramètre ou une variable ; toute autre saisie est un calcul (« ox + i * px ») ; dans un texte, « {"{i}"} » insère la variable.</p>
        <datalist id="editeur-references">
          {references.map((r) => <option key={r} value={r} />)}
          {niveaux.map((n) => <option key={n.id} value={n.id}>{n.nom}</option>)}
        </datalist>
        {s.commandes.map((l, i) => {
          const g = "type" in l ? GABARIT_PAR_TYPE[l.type] : undefined;
          return (
            <div key={i} className="editeur-commande" data-editeur-commande={i}>
              <span className="editeur-ligne">
                <select aria-label={`Commande ${i + 1}`} value={"type" in l ? l.type : "libre"} onChange={(e) => majCommande(i, e.target.value === "libre" ? { libre: JSON.stringify({ type: "", params: {} }, null, 2) } : { type: e.target.value, saisies: {} })} data-editeur="type">
                  {GABARITS_GUIDES.map((x) => <option key={x.type} value={x.type}>{x.libelle}</option>)}
                  <option value="libre">Commande libre (JSON)</option>
                </select>
                <button type="button" className="bouton-mini" disabled={s.commandes.length <= 1} onClick={() => setS({ ...s, commandes: s.commandes.filter((_, k) => k !== i) })}>×<span className="sr-only">Retirer la commande {i + 1}</span></button>
              </span>
              {g && "type" in l && (
                <div className="editeur-champs">
                  {g.champs.map((c) => (
                    <label key={c.cle} className="auto-champ" title={c.aide}>
                      {c.libelle}{c.requis ? "" : " (facultatif)"}
                      <input value={l.saisies[c.cle] ?? ""} list={c.nature === "texte" ? undefined : "editeur-references"} onChange={(e) => majCommande(i, { type: l.type, saisies: { ...l.saisies, [c.cle]: e.target.value } })} data-editeur-champ={c.cle} />
                    </label>
                  ))}
                </div>
              )}
              {"libre" in l && <textarea aria-label={`Commande libre ${i + 1} (JSON)`} rows={5} value={l.libre} onChange={(e) => majCommande(i, { libre: e.target.value })} />}
            </div>
          );
        })}
        {s.commandes.length < 50 && <button type="button" onClick={() => setS({ ...s, commandes: [...s.commandes, { type: "mur.tracer", saisies: {} }] })} data-editeur="ajouter-commande">Ajouter une commande</button>}
      </fieldset>

      <p className={verdict.erreur ? "ver-erreur" : "ver-info"} role="status" data-editeur-verdict={verdict.erreur ? "erreur" : "valide"}>{verdict.texte}</p>
      <span className="ver-actions">
        <button type="button" className="primaire" disabled={occupe || !verdict.script} onClick={() => void enregistrer()} data-editeur="enregistrer">
          Enregistrer une version
        </button>
      </span>
      {message && <p className={message.erreur ? "ver-erreur" : "ver-info"} role={message.erreur ? "alert" : "status"}>{message.texte}</p>}
      {verdict.script && (
        <details className="editeur-json">
          <summary>Voir le script (JSON)</summary>
          <pre>{JSON.stringify(verdict.script, null, 2)}</pre>
        </details>
      )}
    </details>
  );
}
