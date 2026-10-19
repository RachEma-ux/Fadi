/**
 * Boîte « Matrice d'échanges » (Q, barre Exporter) — E.6-01 à E.6-05, en lecture seule : chaque format lu ou écrit par
 * Studio, par sens, objet, entité et version, avec sa limite de couverture et son statut (livré, non livré, renoncé).
 * La donnée est celle du modèle (`STUDIO_MATRICE_ECHANGES`), recoupée par test avec le code réel ; rien n'est saisi ici
 * et aucune entrée n'est une déclaration de conformité. Chemins du dépôt, routes, noms d'entités IFC et références des
 * sources : `translate="no"` ; le commentaire d'une source, en prose, est traduit. Chaque bloc de détails porte un nom
 * propre (format, sens, objet) ; ses intertitres sont des `h3` sous le `h2` de la boîte.
 */
import { useState } from "react";
import { STUDIO_MATRICE_ECHANGES, type StudioEntreeEchange } from "@parcours/atelier-model";
import { Dialogue } from "../planche2d/CatalogueOutils";
import {
  entreesFiltrees, FILTRES_STATUT, LIBELLES_COUVERTURE_ENTITE, LIBELLES_FAMILLE_ECHANGE, LIBELLES_SENS_ECHANGE, LIBELLES_STATUT_ECHANGE, lignesFidelite, nomDetails, resumeMatrice,
  TEXTES_ECHANGES as T, type FiltreStatut,
} from "./echanges-ui";
import "./echanges.css";

export function PanneauEchanges({ surFermer }: { surFermer: () => void }) {
  const [filtre, setFiltre] = useState<FiltreStatut>("tous");
  const entrees = entreesFiltrees(filtre);
  return (
    <Dialogue titre={T.titre} id="studio-echanges-titre" classe="studio-echanges" surFermer={surFermer}>
      <div className="studio-echanges-corps" data-studio-echanges data-studio-echanges-revision={STUDIO_MATRICE_ECHANGES.revision}>
        <p className="studio-dialogue-aide">{T.aide}</p>
        <p data-studio-echanges-resume>{resumeMatrice()}</p>
        <label className="studio-echanges-filtre">{T.filtre}
          <select value={filtre} onChange={(e) => setFiltre(e.target.value as FiltreStatut)} data-studio-echanges-filtre>
            {FILTRES_STATUT.map((f) => <option key={f} value={f}>{f === "tous" ? T.tous : LIBELLES_STATUT_ECHANGE[f]}</option>)}
          </select>
        </label>
        {entrees.length === 0 && <p data-studio-echanges-vide>{T.aucune}</p>}
        {entrees.length > 0 && (
          <div className="studio-echanges-tableau">
            <table data-studio-echanges-table>
              <thead><tr>{T.colonnes.map((c) => <th key={c} scope="col">{c}</th>)}</tr></thead>
              <tbody>{entrees.map((e) => <Ligne key={e.id} e={e} />)}</tbody>
            </table>
          </div>
        )}
      </div>
    </Dialogue>
  );
}

function Ligne({ e }: { e: StudioEntreeEchange }) {
  const fidelite = lignesFidelite(e);
  return (
    <tr data-studio-echange={e.id} data-studio-echange-statut={e.statut}>
      <th scope="row">{e.format}<span className="studio-echanges-famille">{LIBELLES_FAMILLE_ECHANGE[e.famille]}</span></th>
      <td>{e.versionFormat}</td>
      <td>{LIBELLES_SENS_ECHANGE[e.sens]}</td>
      <td>{e.objet}</td>
      <td><span className={`studio-echanges-statut studio-echanges-statut-${e.statut}`}>{LIBELLES_STATUT_ECHANGE[e.statut]}</span></td>
      <td>
        {e.limite}
        <details className="studio-echanges-details">
          <summary data-studio-echange-details={e.id}>{nomDetails(e)}</summary>
          {e.raison && <p><strong>{T.raison}</strong> {e.raison}</p>}
          {e.entites.length > 0 && <>
            <h3>{T.entites}</h3>
            <ul>{e.entites.map((x) => <li key={x.entite} data-studio-echange-entite={x.couverture}><strong>{x.entite}</strong> — {LIBELLES_COUVERTURE_ENTITE[x.couverture]} — {x.detail}</li>)}</ul>
          </>}
          {e.ecritureIfc && <>
            <h3>{T.ecritureIfc}</h3>
            <ul data-studio-echange-ecriture-ifc>{e.ecritureIfc.elements.map((x) => <li key={x.entites.join()}><span translate="no">{x.entites.map((n, i) => <span key={n}>{i > 0 && ", "}<code>{n}</code></span>)}</span> — {x.detail}</li>)}</ul>
            <h3>{T.jeuxIfc}</h3>
            <ul>{e.ecritureIfc.jeuxDeProprietes.map((x) => <li key={x.nom}><code translate="no">{x.nom}</code> — {x.detail}</li>)}</ul>
          </>}
          {fidelite.length > 0 && <>
            <h3>{T.couvertureFidelite}</h3>
            <table className="studio-echanges-fidelite" data-studio-echange-fidelite={e.fidelite}>
              <thead><tr>{T.colonnesFidelite.map((c) => <th key={c} scope="col">{c}</th>)}</tr></thead>
              <tbody>{fidelite.map((l) => <tr key={`${l.categorie}-${l.type}`}><td>{l.categorie}</td><td>{l.type}</td><td><ul>{l.sorts.map((s) => <li key={s}>{s}</li>)}</ul></td></tr>)}</tbody>
            </table>
          </>}
          {e.controle && <p><strong>{T.controle}</strong> {e.controle}</p>}
          {e.route && <p><strong>{T.route}</strong> <code translate="no">{e.route}</code></p>}
          {e.preuves && <>
            <h3>{T.preuves}</h3>
            <ul translate="no" className="studio-echanges-preuves">
              {[...e.preuves.code, ...e.preuves.tests, ...(e.preuves.routes ?? []), ...(e.preuves.interfaces ?? [])].map((x) => <li key={`${x.fichier}#${x.motif}`}><code>{x.fichier}</code> · <code>{x.motif}</code></li>)}
            </ul>
          </>}
          <h3>{T.sources}</h3>
          <ul data-studio-echange-sources>{e.sources.map((s) => <li key={s.reference}><cite translate="no">{s.reference}</cite>{s.commentaire && <> — <span>{s.commentaire}</span></>}</li>)}</ul>
        </details>
      </td>
    </tr>
  );
}
