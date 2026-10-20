/**
 * Cartes de la Console de Studio (menu « Studio › Console », demande du maître d'ouvrage du 20 octobre 2026) :
 * « 00 Sandbox » (la Planche de Sandbox) puis les quatre domaines « 01 » à « 04 », sous leur libellé exact (REF-01 §02,
 * `domaines/definitions.ts`). Chaque domaine s'ouvre INDÉPENDAMMENT DE TOUT PROJET : aucun projet, aucune étude ni aucune
 * variante n'est lu, créé ou nommé (pas de projet fictif). Pur : ni React ni DOM.
 */
import { DOMAINES_STUDIO, type DomaineStudio } from "../domaines/definitions";
import { cheminOutilConsoleStudio, cheminSandboxStudio } from "../routes-studio";

export type IdCarteConsole = "sandbox" | DomaineStudio;

export interface CarteConsole {
  readonly id: IdCarteConsole;
  /** « 00 » à « 04 ». */
  readonly numero: string;
  readonly libelleFR: string;
  /** Une ligne sous le nom : la responsabilité du domaine (REF-01 §02), ou ce que contient la Sandbox. */
  readonly descriptionFR: string;
  /** Adresse ouverte par la carte. */
  readonly chemin: string;
}

/** Libellé de la carte 00, tel que demandé. */
export const LIBELLE_SANDBOX = "Sandbox";
export const DESCRIPTION_SANDBOX = "Planche libre en 3D, à soi seule : aucun projet, aucun lien avec l’étape 10";

export const CARTES_CONSOLE: readonly CarteConsole[] = Object.freeze([
  { id: "sandbox", numero: "00", libelleFR: LIBELLE_SANDBOX, descriptionFR: DESCRIPTION_SANDBOX, chemin: cheminSandboxStudio() },
  ...DOMAINES_STUDIO.map((d): CarteConsole => ({
    id: d.id, numero: d.numero, libelleFR: d.libelleFR, descriptionFR: d.responsabiliteFR, chemin: cheminOutilConsoleStudio(d.id),
  })),
]);
