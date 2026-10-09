/**
 * Règles par ontologie (P2-8 ; DA-19-05) — panneau d'automatisation.
 *
 * Une règle porte sur une classe (socle ou ontologie active) : sa comparaison est contrôlée sur chaque occurrence après
 * chaque commande, un problème « regle » est rattaché à chaque objet non tenu (panneau Modifications, inspecteur), rien
 * n'est corrigé. La règle vient du projet, avec sa source dans son nom ou son message : Fadi n'en fournit aucune (R3).
 */
import { useMemo, useState } from "react";
import { CLASSES, controlesClasses, LIBELLES_ONTOLOGIE, ontologiesActives, valeursObjet, type Classe, type Commande, type ModeleAtelier, type OccurrenceQuelconque, type ParamsRegle } from "@parcours/atelier-model";

export interface PropsRegles {
  etat: ModeleAtelier;
  readOnly: boolean;
  onCommandes: (commandes: Commande[], label: string) => void;
}

export function Regles({ etat, readOnly, onCommandes }: PropsRegles) {
  const actives = ontologiesActives(etat);
  const classes = useMemo(() => (Object.keys(CLASSES) as Classe[]).filter((c) => actives.includes(CLASSES[c].ontologie)).sort((a, b) => CLASSES[a].libelle.localeCompare(CLASSES[b].libelle, "fr")), [actives]);
  const regles = Object.values(etat.definitions).filter((d) => d.classe === "regle" && typeof (d.params as { classe?: unknown }).classe === "string").sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
  const controles = useMemo(() => new Map(controlesClasses(etat).map((c) => [c.regleId, c])), [etat]);
  const [nom, setNom] = useState("");
  const [classe, setClasse] = useState<Classe>("mur");
  const [expression, setExpression] = useState("");
  const [message, setMessage] = useState("");
  const exemple = (Object.values(etat.objets) as OccurrenceQuelconque[]).find((o) => o.classe === classe);
  const variables = exemple ? Object.keys(valeursObjet(etat, exemple)) : [];
  const valide = nom.trim() && /(<=|>=|=|<|>)/.test(expression) && message.trim();

  return (
    <div className="regles" data-regles>
      <h3>Règles par ontologie</h3>
      <p className="nav-detail">Une règle du projet (avec sa source) sur une classe : contrôlée sur chaque objet après chaque commande, signalée dans Modifications et sur l'objet, jamais corrigée. Fadi n'apporte aucune règle.</p>
      {regles.length > 0 && (
        <ul className="regles-liste">
          {regles.map((d) => {
            const r = d.params as unknown as ParamsRegle & { classe: string };
            const c = controles.get(d.id);
            return (
              <li key={d.id} data-regle-id={d.id} data-non-tenus={c?.nonTenus.length ?? 0}>
                <strong>{d.nom}</strong> · {CLASSES[r.classe as Classe]?.libelle ?? r.classe} · <code>{r.expression}</code>
                <br />
                <span className="nav-detail">
                  {c ? `${c.objets} objet(s), ${c.nonTenus.length} non tenu(s)${c.nonEvalues.length ? `, ${c.nonEvalues.length} non évalué(s)` : ""}` : "aucun objet"} — {r.message}
                </span>
                {!readOnly && (
                  <button type="button" className="bouton-mini" onClick={() => onCommandes([{ type: "definition.supprimer", params: { id: d.id } }], `Retirer la règle « ${d.nom} »`)} data-regle-retirer={d.id}>
                    ×<span className="sr-only">Retirer la règle {d.nom}</span>
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {!readOnly && (
        <form
          className="ver-form regles-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!valide) return;
            onCommandes([{ type: "regle.definir", params: { nom: nom.trim(), classe, expression: expression.trim(), message: message.trim() } }], `Règle « ${nom.trim()} »`);
            setNom("");
            setExpression("");
            setMessage("");
          }}
        >
          <label className="auto-champ">Nom et source de la règle<input value={nom} maxLength={160} placeholder="Épaisseur minimale (programme, §2.3)" onChange={(e) => setNom(e.target.value)} data-regle-onto="nom" /></label>
          <label className="auto-champ">
            Classe
            <select value={classe} onChange={(e) => setClasse(e.target.value as Classe)} data-regle-onto="classe">
              {classes.map((c) => (
                <option key={c} value={c}>
                  {CLASSES[c].libelle} · {LIBELLES_ONTOLOGIE[CLASSES[c].ontologie]}
                </option>
              ))}
            </select>
          </label>
          <label className="auto-champ">
            Comparaison
            <input value={expression} maxLength={300} placeholder="epaisseur >= 0.2" list="regles-variables" onChange={(e) => setExpression(e.target.value)} data-regle-onto="expression" />
          </label>
          <datalist id="regles-variables">{variables.map((v) => <option key={v} value={v} />)}</datalist>
          {variables.length > 0 ? <p className="nav-detail">Variables lisibles sur « {exemple!.id} » : {variables.join(", ")}.</p> : <p className="nav-detail">Aucun objet de cette classe dans le modèle : la règle attendra le premier.</p>}
          <label className="auto-champ">Message si la règle n'est pas tenue<input value={message} maxLength={300} placeholder="mur plus mince que le programme" onChange={(e) => setMessage(e.target.value)} data-regle-onto="message" /></label>
          <span className="ver-actions">
            <button type="submit" disabled={!valide} data-regle-onto="definir">Ajouter la règle</button>
          </span>
        </form>
      )}
    </div>
  );
}
