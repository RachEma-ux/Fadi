/**
 * Panneau « Métré · niveau actif » (DA-16-10-b) : tableau par rubrique tiré de `calculerMetre` (pur), en tête le
 * niveau, la **révision** et l'empreinte d'origine, la règle `quantites/1` et la règle de cumul (calques masqués
 * inclus, D-019). Fraîcheur (R11) : dès que l'état change de révision, le tableau reste lisible mais est marqué
 * « à recalculer » ; l'export CSV d'un tableau périmé recalcule d'abord. À monter par l'intégrateur (onglet
 * Projet ou panneau d'analyse). Aucune commande : le métré ne modifie pas le modèle.
 */
import { useEffect, useReducer, useState } from "react";
import { estNonEvaluee } from "@parcours/atelier-model";
import type { ContexteAtelier } from "../socle";
import { texteFixe } from "./format";
import { calculerMetre, csvMetre, LIBELLES_RUBRIQUE, metrePerime, nomCsvMetre, RUBRIQUES_METRE, type LigneMetre, type Metre } from "./metre";
import { EFFETS_NAVIGATEUR } from "./navigateur";
import type { EffetsExport } from "./outils/exports";
import "./documents.css";

const UNITES: Readonly<Record<LigneMetre["unite"], string>> = { m: "m", "m²": "m²", "m³": "m³", unite: "" };

function valeurAffichee(l: LigneMetre): { texte: string; exact: string } {
  if (estNonEvaluee(l.valeur)) return { texte: `non évaluée${l.partiel ? ` (partiel : ${texteFixe(l.partiel.somme, l.unite === "unite" ? 0 : 3)})` : ""}`, exact: l.valeur.motif };
  const texte = l.unite === "unite" ? String(l.valeur) : `${texteFixe(l.valeur, 3)} ${UNITES[l.unite]}`;
  return { texte, exact: `${String(l.valeur).replace(".", ",")} ${UNITES[l.unite]}`.trim() };
}

export function PanneauMetre({ ctx, effets = EFFETS_NAVIGATEUR }: { ctx: ContexteAtelier; effets?: Pick<EffetsExport, "telecharger" | "maintenant"> }) {
  const [, rafraichir] = useReducer((x: number) => x + 1, 0);
  useEffect(() => ctx.abonnerEtat(() => rafraichir()), [ctx]);
  const calculer = (): Metre | null => {
    const etat = ctx.etat();
    const niveauId = ctx.niveauActif();
    return etat && niveauId ? calculerMetre(etat, niveauId) : null;
  };
  const [metre, setMetre] = useState<Metre | null>(calculer);
  const niveauId = ctx.niveauActif();
  useEffect(() => {
    if (metre?.niveauId !== niveauId) setMetre(calculer());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [niveauId]);

  if (!metre) return <p className="atl-doc-aide">Métré : ouvrez un projet et choisissez un niveau actif.</p>;
  const perime = metrePerime(metre, ctx.etat());
  const exporter = () => {
    const m = perime ? calculer() : metre;
    if (!m) return;
    setMetre(m);
    effets.telecharger(nomCsvMetre(m), new Blob([csvMetre(m, effets.maintenant())], { type: "text/csv;charset=utf-8" }));
  };
  return (
    <section className="atl-doc-metre" aria-labelledby="atl-doc-metre-titre" data-testid="atl-doc-metre">
      <h2 id="atl-doc-metre-titre">Métré · {metre.niveauNom}</h2>
      <p className="atl-doc-aide">
        Révision {metre.revision} · empreinte <code title={metre.empreinte}>{metre.empreinte.slice(0, 12)}</code> · règles {metre.regle}
      </p>
      <p className="atl-doc-aide">{metre.mention}</p>
      {perime && (
        <p role="status" className="atl-doc-perime">
          À recalculer — révision {metre.revision}, modèle en révision {ctx.etat()?.revision ?? "?"}.
        </p>
      )}
      <div className="atl-doc-actions">
        <button type="button" onClick={() => setMetre(calculer())} disabled={!perime}>
          Recalculer
        </button>
        <button type="button" onClick={exporter}>
          {perime ? "Recalculer puis exporter le CSV" : "Exporter le métré CSV"}
        </button>
      </div>
      {metre.lignes.length === 0 ? (
        <p>Aucun objet quantifiable sur ce niveau.</p>
      ) : (
        RUBRIQUES_METRE.filter((r) => metre.lignes.some((l) => l.rubrique === r)).map((r) => (
          <details key={r} open>
            <summary>{LIBELLES_RUBRIQUE[r]}</summary>
            <table>
              <thead>
                <tr>
                  <th scope="col">Groupe</th>
                  <th scope="col">Grandeur</th>
                  <th scope="col">Valeur</th>
                </tr>
              </thead>
              <tbody>
                {metre.lignes
                  .filter((l) => l.rubrique === r)
                  .map((l, i) => {
                    const v = valeurAffichee(l);
                    return (
                      <tr key={i} data-statut={l.statut}>
                        <td>{l.groupe ?? "tous"}</td>
                        <td>{l.grandeur}</td>
                        <td title={v.exact}>
                          {v.texte}
                          {l.statut === "a-verifier" ? " (à vérifier)" : ""}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </details>
        ))
      )}
    </section>
  );
}
