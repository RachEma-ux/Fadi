/**
 * Auto-contrôle (OP-6) : avertissement avant d'approuver un dossier que l'on a produit ou soumis (confirmation
 * explicite), ou explication d'un refus avec les autres approbateurs possibles. Partagé par le panneau Publications
 * du Studio et l'espace de revue externe. Le serveur revérifie tout à l'approbation.
 */
import type { ControleApprobation } from "../lib/api";
import {
  AUCUN_AUTRE_APPROBATEUR, AUTRES_APPROBATEURS, avertissementAutoControle, CONFIRMER_AUTO_CONTROLE, MARQUE_AUTO_CONTROLE, refusAutoControle, ROLE_APPROBATEUR, TITRE_MARQUE,
} from "../lib/auto-controle";
import "./auto-controle.css";

/** Marque visible d'une approbation enregistrée en auto-contrôle. */
export function MarqueAutoControle({ data }: { data?: string }) {
  return <span className="marque-auto-controle" title={TITRE_MARQUE} {...(data ? { [data]: "" } : {})}>{MARQUE_AUTO_CONTROLE}</span>;
}

export function ApprobateursPossibles({ controle }: { controle: Pick<ControleApprobation, "approvers"> }) {
  if (!controle.approvers.length) return <p data-auto-controle-approbateurs="0">{AUCUN_AUTRE_APPROBATEUR}</p>;
  return (
    <>
      <p>{AUTRES_APPROBATEURS}</p>
      <ul className="auto-controle-approbateurs" data-auto-controle-approbateurs={controle.approvers.length}>
        {controle.approvers.map((a, i) => (
          <li key={i}>{a.name ? <><span translate="no">{a.name}</span>{" · "}</> : null}<span>{ROLE_APPROBATEUR[a.role]}</span></li>
        ))}
      </ul>
    </>
  );
}

export interface AvisAutoControleProps {
  controle: ControleApprobation;
  confirme: boolean;
  surConfirme: (v: boolean) => void;
  /** Identifiant de la case (unique dans la page). */
  id: string;
}

/** Rien sans auto-contrôle ; avertissement et case de confirmation s'il est permis ; refus expliqué sinon. */
export function AvisAutoControle({ controle, confirme, surConfirme, id }: AvisAutoControleProps) {
  if (!controle.autoControle) return null;
  if (!controle.autorise) {
    return (
      <div className="auto-controle auto-controle-refus" role="alert" data-auto-controle-refus>
        <p>{refusAutoControle(controle)}</p>
        <ApprobateursPossibles controle={controle} />
      </div>
    );
  }
  return (
    <div className="auto-controle" data-auto-controle-avertissement>
      <p role="note">{avertissementAutoControle(controle)}</p>
      <label htmlFor={id} className="auto-controle-confirmer">
        <input id={id} type="checkbox" checked={confirme} onChange={(e) => surConfirme(e.target.checked)} data-auto-controle-confirmer />
        <span>{CONFIRMER_AUTO_CONTROLE}</span>
      </label>
    </div>
  );
}
