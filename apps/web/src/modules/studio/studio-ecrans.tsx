/** Écrans communs de Studio : refus sans divulgation (NAV-004). Un refus ne nomme jamais la ressource demandée. */
import { Link } from "react-router-dom";
import { RACINE_STUDIO } from "./routes-studio";

const MESSAGES_REFUS = {
  projet: "Projet introuvable, ou vous n’y avez pas accès.",
  etude: "Étude introuvable, ou vous n’y avez pas accès.",
  variante: "Variante introuvable, ou vous n’y avez pas accès.",
  revision: "Révision introuvable, ou vous n’y avez pas accès.",
} as const;

export type QuoiRefus = keyof typeof MESSAGES_REFUS;

export function StudioRefus({ quoi }: { quoi: QuoiRefus }) {
  return (
    <section className="studio-welcome" role="alert" data-studio-refus={quoi}>
      <h1>{MESSAGES_REFUS[quoi]}</h1>
      <p>Aucune donnée n’a été modifiée.</p>
      <Link to={RACINE_STUDIO}>Revenir à l’accueil de Studio</Link>
    </section>
  );
}
