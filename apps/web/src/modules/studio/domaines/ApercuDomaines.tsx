/**
 * Aperçu des domaines du Studio et de leurs outils, affiché sur la page d'un projet (liste des études). Les outils de
 * travail ne s'ouvrent que dans l'espace d'une variante : sans étude, la page ne montrait qu'un formulaire de création
 * et rien ne disait où se trouvent les planches et les outils. L'aperçu est dérivé des mêmes tables que l'espace
 * (`DOMAINES_STUDIO`, `DOMAINES_FAMILLES_OUTILS`, `DOMAINES_COMMANDES`) : il ne déclare rien de plus que ce qui existe.
 * Lecture seule ; aucune action n'est lancée d'ici.
 */
import { useState } from "react";
import { STUDIO_TOOLS } from "@parcours/atelier-model";
import { COMMANDES_EDITEUR } from "../planche2d/raccourcis";
import { A_DEFINIR, DOMAINES_COMMANDES, DOMAINES_FAMILLES_OUTILS, DOMAINES_STUDIO, type DomaineAttribue } from "./domaines";

/** Entrée d'une liste : identifiant stable (outil ou commande, clé React) et libellé. */
export interface EntreeApercu { id: string; libelle: string }

/** Outils du registre et commandes de l'éditeur rattachés à un domaine (ou « à définir »). */
export function outilsDuDomaine(d: DomaineAttribue): { outils: EntreeApercu[]; commandes: EntreeApercu[] } {
  const outils = STUDIO_TOOLS.filter((t) => DOMAINES_FAMILLES_OUTILS[t.groupe] === d).map((t) => ({ id: t.toolId, libelle: t.libelleFR }));
  const commandes = COMMANDES_EDITEUR.filter((c) => DOMAINES_COMMANDES[c.id] === d).map((c) => ({ id: c.id, libelle: c.libelleFR }));
  return { outils, commandes };
}

function Liste({ titre, entrees }: { titre: string; entrees: EntreeApercu[] }) {
  if (!entrees.length) return null;
  return (
    <div className="studio-apercu-liste">
      <h4>{titre}</h4>
      <ul>{entrees.map((e) => <li key={e.id}>{e.libelle}</li>)}</ul>
    </div>
  );
}

/**
 * `ouvert` : `undefined` tant que la liste des études n'est pas chargée ; l'état initial (ouvert s'il n'y a aucune
 * étude, sinon replié) est fixé UNE fois, quand la donnée arrive, puis seul l'utilisateur le change (aucune bascule
 * pendant un rechargement ou après la création d'une étude).
 */
export function ApercuDomaines({ ouvert }: { ouvert: boolean | undefined }) {
  const [open, setOpen] = useState<boolean | undefined>(ouvert);
  if (open === undefined && ouvert !== undefined) setOpen(ouvert);
  const communs = outilsDuDomaine(A_DEFINIR);
  return (
    <details className="studio-apercu-domaines" open={open ?? false} onToggle={(e) => { const o = e.currentTarget.open; if (o !== (open ?? false)) setOpen(o); }} data-studio-apercu-domaines>
      <summary>Domaines et outils du Studio</summary>
      <p>Les planches et les outils de travail s’ouvrent dans l’espace de travail d’une variante. Ouvrez une étude, ou créez-en une : elle ouvre sa variante initiale avec ces quatre domaines.</p>
      <ol className="studio-apercu-grille">
        {DOMAINES_STUDIO.map((d) => {
          const { outils, commandes } = outilsDuDomaine(d.id);
          return (
            <li key={d.id} data-studio-apercu-domaine={d.id}>
              <h3><span aria-hidden="true">{d.numero}</span> {d.libelleFR}</h3>
              <p>{d.responsabiliteFR}</p>
              <Liste titre="Outils" entrees={outils} />
              <Liste titre="Commandes" entrees={commandes} />
            </li>
          );
        })}
      </ol>
      {(communs.outils.length > 0 || communs.commandes.length > 0) && (
        <div data-studio-apercu-domaine="a-definir">
          <h3>Communs aux domaines (rattachement à définir)</h3>
          <Liste titre="Outils" entrees={communs.outils} />
          <Liste titre="Commandes" entrees={communs.commandes} />
        </div>
      )}
    </details>
  );
}
