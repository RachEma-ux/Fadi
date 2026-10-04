/** Erreurs lisibles « objet, cause, action » (§5.8), annoncées aux lecteurs d'écran. */
import type { ErreurLisible } from "../socle";

export function Erreurs({ erreurs, titre = "Commande refusée — rien n'a été modifié", testId }: { erreurs: readonly ErreurLisible[]; titre?: string; testId?: string }) {
  if (erreurs.length === 0) return null;
  return (
    <div className="atl-message atl-erreur" role="alert" data-testid={testId}>
      <h3>{titre}</h3>
      {erreurs.map((e, i) => (
        <dl className="atl-oca" key={`${e.objet}-${i}`}>
          <dt>Objet</dt>
          <dd>{e.objet}</dd>
          <dt>Cause</dt>
          <dd>{e.cause}</dd>
          <dt>Action</dt>
          <dd>{e.action}</dd>
        </dl>
      ))}
    </div>
  );
}
