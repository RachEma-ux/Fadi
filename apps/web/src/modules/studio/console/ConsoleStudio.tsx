/**
 * Console de Studio (`/studio/console`) : cinq cartes.
 *
 * - « 00 Sandbox » : page « bientôt disponible » (`/studio/console/sandbox`).
 * - « 01 » à « 04 » : l'outil du domaine, ouvert SANS CHARGER DE PROJET (`/studio/console/:domaine`) — aucune lecture
 *   de projet, d'étude ni de variante, aucune création côté serveur, aucun projet fictif. Ce qui est dessiné reste dans
 *   la page : rien n'est enregistré (`ConsoleOutil`).
 */
import { Link } from "react-router-dom";
import { cheminConsoleStudio } from "../routes-studio";
import { CARTES_CONSOLE, LIBELLE_SANDBOX, TEXTE_BIENTOT } from "./cartes";
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
            <Link to={c.chemin} className="studio-console-carte" data-studio-console-carte={c.id} data-studio-console-bientot={c.bientot ? "" : undefined}>
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

/** Carte « 00 Sandbox » : page « bientôt disponible » (aucune donnée, aucun appel serveur). */
export function ConsoleSandbox() {
  return (
    <section className="studio-welcome studio-page studio-console" data-studio-console-sandbox>
      <header className="studio-page-entete">
        <h1><span className="studio-console-numero">00</span> {LIBELLE_SANDBOX}</h1>
      </header>
      <p role="status" className="studio-console-bientot" data-studio-bientot>{TEXTE_BIENTOT}</p>
      <p>Cet espace n’est pas encore disponible : aucun outil n’est ouvert et rien n’est créé.</p>
      <p><Link to={cheminConsoleStudio()} data-studio-console-retour>Revenir à la Console</Link></p>
    </section>
  );
}
