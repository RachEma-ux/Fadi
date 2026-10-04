/**
 * Installation du module « documents simples » (L3a.5) : outils Cotation (K) et Texte (T) de la famille
 * Documenter, Mètre (U) de la famille Analyser, exports SVG / PNG / DXF, impression et métré CSV de la famille
 * Partager (sans raccourci), dessinateur et descripteur d'inspecteur des classes `cotation`, `texte`, `etiquette`.
 * Les classes d'architecture sont dessinées par le module « architecture » : rien n'est enregistré ici pour elles.
 */
import type { InstallationModule } from "../socle";
import { DESSINATEUR_ANNOTATIONS } from "./annotations";
import { DESCRIPTEUR_ANNOTATIONS } from "./descripteurs";
import { EFFETS_NAVIGATEUR } from "./navigateur";
import { outilCotation, outilTexte } from "./outils/annotation";
import { outilsExport, type EffetsExport } from "./outils/exports";
import { outilMetre } from "./outils/mesure";

export interface OptionsInstallation {
  readonly effets: EffetsExport;
}

export function installerAvec(o: OptionsInstallation): InstallationModule {
  return (r) => {
    r.dessinateurs.enregistrer(DESSINATEUR_ANNOTATIONS);
    r.inspecteur.enregistrer(DESCRIPTEUR_ANNOTATIONS);
    const exports = outilsExport({ dessinateurs: r.dessinateurs, effets: o.effets });
    for (const outil of [outilCotation(), outilTexte(), outilMetre(), ...exports]) r.outils.enregistrer(outil);
  };
}

export const installer: InstallationModule = installerAvec({ effets: EFFETS_NAVIGATEUR });
