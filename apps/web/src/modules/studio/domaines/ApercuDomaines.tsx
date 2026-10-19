/**
 * Aperçu des domaines du Studio et de leurs outils, affiché sur la page d'un projet (liste des études). Les outils de
 * travail ne s'ouvrent que dans l'espace d'une variante : sans étude, la page ne montrait qu'un formulaire de création
 * et rien ne disait où se trouvent les planches et les outils. L'aperçu est dérivé des mêmes tables que l'espace
 * (`DOMAINES_STUDIO`, `DOMAINES_FAMILLES_OUTILS`, `DOMAINES_COMMANDES`) : il ne déclare rien de plus que ce qui existe.
 * Lecture seule ; aucune action n'est lancée d'ici.
 */
import { STUDIO_TOOLS } from "@parcours/atelier-model";
import { COMMANDES_EDITEUR } from "../planche2d/raccourcis";
import { A_DEFINIR, DOMAINES_COMMANDES, DOMAINES_FAMILLES_OUTILS, DOMAINES_STUDIO, type DomaineAttribue } from "./domaines";

/** Libellés des outils du registre et des commandes de l'éditeur rattachés à un domaine (ou « à définir »). */
export function outilsDuDomaine(d: DomaineAttribue): { outils: string[]; commandes: string[] } {
  const outils = STUDIO_TOOLS.filter((t) => DOMAINES_FAMILLES_OUTILS[t.groupe] === d).map((t) => t.libelleFR);
  const commandes = COMMANDES_EDITEUR.filter((c) => DOMAINES_COMMANDES[c.id] === d).map((c) => c.libelleFR);
  return { outils, commandes };
}

function Liste({ titre, libelles }: { titre: string; libelles: string[] }) {
  if (!libelles.length) return null;
  return (
    <div className="studio-apercu-liste">
      <h4>{titre}</h4>
      <ul>{libelles.map((l) => <li key={l}>{l}</li>)}</ul>
    </div>
  );
}

export function ApercuDomaines({ ouvert }: { ouvert: boolean }) {
  const communs = outilsDuDomaine(A_DEFINIR);
  return (
    <details className="studio-apercu-domaines" open={ouvert} data-studio-apercu-domaines>
      <summary>Domaines et outils du Studio</summary>
      <p>Les planches et les outils de travail s’ouvrent dans l’espace de travail d’une variante. Ouvrez une étude, ou créez-en une : elle ouvre sa variante initiale avec ces quatre domaines.</p>
      <ol className="studio-apercu-grille">
        {DOMAINES_STUDIO.map((d) => {
          const { outils, commandes } = outilsDuDomaine(d.id);
          return (
            <li key={d.id} data-studio-apercu-domaine={d.id}>
              <h3><span aria-hidden="true">{d.numero}</span> {d.libelleFR}</h3>
              <p>{d.responsabiliteFR}</p>
              <Liste titre="Outils" libelles={outils} />
              <Liste titre="Commandes" libelles={commandes} />
            </li>
          );
        })}
      </ol>
      {(communs.outils.length > 0 || communs.commandes.length > 0) && (
        <div data-studio-apercu-domaine="a-definir">
          <h3>Communs aux domaines (rattachement à définir)</h3>
          <Liste titre="Commandes" libelles={[...communs.outils, ...communs.commandes]} />
        </div>
      )}
    </details>
  );
}
