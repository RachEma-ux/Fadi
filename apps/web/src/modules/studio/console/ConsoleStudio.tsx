/**
 * Console de Studio (`/studio/console`) : cinq cartes.
 *
 * - « 00 Sandbox » : un simple lien vers le module Sandbox (`/sandbox`, lot 1), qui n'est plus chargé par le Studio.
 * - « 01 » à « 04 » : l'outil du domaine, ouvert SANS CHARGER DE PROJET (`/studio/console/:domaine`) — aucune lecture
 *   de projet, d'étude ni de variante, aucune création côté serveur, aucun projet fictif. Ce qui est dessiné reste dans
 *   la page : rien n'est enregistré (`ConsoleOutil`).
 */
import { Link } from "react-router-dom";
import { CARTES_CONSOLE } from "./cartes";
import "./console.css";

export function ConsoleStudio() {
  return (
    <section className="studio-welcome studio-page studio-console" data-studio-console>
      <header className="studio-page-entete">
        {/* « Console » est aussi le nom anglais du menu : le dictionnaire le traduit ailleurs (support « Console » des réseaux), d'où translate="no". */}
        <h1 translate="no">Console</h1>
      </header>
      <p className="studio-console-intro">Ouvrez un outil de Studio, sans projet : rien n’est lu ni enregistré tant que vous ne choisissez pas « Enregistrer dans un projet ».</p>
      <ul className="studio-console-cartes" aria-label="Outils de la Console">
        {CARTES_CONSOLE.map((c) => (
          <li key={c.id}>
            <Link to={c.chemin} className="studio-console-carte" data-studio-console-carte={c.id}>
              <span className="studio-console-numero">{c.numero}</span>
              <strong>{c.libelleFR}</strong>
              <small>{c.descriptionFR}</small>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

