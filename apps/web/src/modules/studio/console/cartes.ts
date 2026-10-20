/**
 * Cartes de la Console de Studio (menu « Studio › Console », demande du maître d'ouvrage du 20 octobre 2026) :
 * « 00 Sadbox » (bientôt disponible) puis les quatre domaines « 01 » à « 04 », sous leur libellé exact (REF-01 §02,
 * `domaines/definitions.ts`). Chaque domaine s'ouvre INDÉPENDAMMENT DE TOUT PROJET : aucun projet, aucune étude ni aucune
 * variante n'est lu, créé ou nommé (pas de projet fictif). Pur : ni React ni DOM.
 */
import { DOMAINES_STUDIO, type DomaineStudio } from "../domaines/definitions";
import { cheminOutilConsoleStudio, cheminSadboxStudio } from "../routes-studio";

export type IdCarteConsole = "sadbox" | DomaineStudio;

export interface CarteConsole {
  readonly id: IdCarteConsole;
  /** « 00 » à « 04 ». */
  readonly numero: string;
  readonly libelleFR: string;
  /** Une ligne sous le nom : la responsabilité du domaine (REF-01 §02), ou la mention « bientôt disponible ». */
  readonly descriptionFR: string;
  /** Carte non encore livrée : elle ouvre une page « bientôt disponible », jamais un outil. */
  readonly bientot: boolean;
  /** Adresse ouverte par la carte. */
  readonly chemin: string;
}

/** Libellé de la carte 00, tel que demandé. */
export const LIBELLE_SADBOX = "Sadbox";
export const TEXTE_BIENTOT = "Bientôt disponible";

export const CARTES_CONSOLE: readonly CarteConsole[] = Object.freeze([
  { id: "sadbox", numero: "00", libelleFR: LIBELLE_SADBOX, descriptionFR: TEXTE_BIENTOT, bientot: true, chemin: cheminSadboxStudio() },
  ...DOMAINES_STUDIO.map((d): CarteConsole => ({
    id: d.id, numero: d.numero, libelleFR: d.libelleFR, descriptionFR: d.responsabiliteFR, bientot: false, chemin: cheminOutilConsoleStudio(d.id),
  })),
]);
