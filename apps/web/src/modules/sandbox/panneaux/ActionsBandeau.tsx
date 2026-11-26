/**
 * Barre d'actions intégrée au bandeau d'en-tête de la Planche (ordinateur seulement). Depuis le 26 novembre 2026, le
 * centre du bandeau porte Annuler · Rétablir | Cadrer · Zoom (groupes séparés d'un filet) ; les commandes de groupe
 * restent dans la barre « Groupe » de la liste Outils, au clic droit et au clavier. États grisés et infobulles ; sur
 * fenêtre étroite, icônes seules (le nom reste dans l'infobulle et pour le lecteur d'écran). Au téléphone, la barre
 * flottante (`BarreActions`) reste telle quelle.
 */
import { useRef } from "react";
import { t } from "../messages";
import { IconeSandbox, Pictogramme } from "../pictogrammes/Pictogramme";
import { useNavigationBarre } from "../navigation-barre";
import type { ActionBarre } from "./BarreActions";

export function BoutonBandeau({ a }: { a: ActionBarre }) {
  return (
    <button type="button" onClick={a.onClick} disabled={a.disabled} aria-pressed={a.pressed} title={a.titre ?? a.libelle} aria-label={a.libelle} data-action={a.id} {...a.attributs}>
      {typeof a.picto === "string" ? <IconeSandbox nom={a.picto} className="barre-actions-picto" /> : <Pictogramme picto={a.picto} className="barre-actions-picto" />}
      {a.texte && <span className="barre-actions-texte" aria-hidden="true">{a.texte}</span>}
    </button>
  );
}

/** Groupes de commandes, rendus au centre du bandeau ; un groupe vide n'est pas rendu. */
export function ActionsBandeau({ groupes }: { groupes: readonly (readonly ActionBarre[])[] }) {
  const racine = useRef<HTMLDivElement | null>(null);
  const naviguer = useNavigationBarre(racine);
  return (
    <div ref={racine} className="planche-bandeau-actions" role="toolbar" aria-label={t("actions.barre")} onKeyDown={naviguer} data-barre-actions data-planche-bandeau-actions>
      {groupes
        .filter((g) => g.length > 0)
        .map((g, i) => (
          <div key={i} className="planche-bandeau-groupe" role="group">
            {g.map((a) => (
              <BoutonBandeau key={a.id} a={a} />
            ))}
          </div>
        ))}
    </div>
  );
}
