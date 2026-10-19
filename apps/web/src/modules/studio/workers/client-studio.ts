/**
 * Client du Worker de Studio : fonctions typées pour la lecture DXF et la composition de la feuille, sur le premier
 * hôte du groupe partagé (`taches/pool-studio.ts`, Workers réutilisés). L'interface passe par l'ordonnanceur
 * (`taches/`) ; ces appels directs restent pour les bancs d'essai. Sans Worker, le calcul se fait directement (mêmes
 * fonctions, mêmes résultats). Chaque appel déclare un usage du moteur `calcul` (comme `executeurHotes`) : ses
 * Workers ne sont jamais libérés pendant un calcul en cours.
 */
import type { StudioDocument, StudioSheetOptions } from "@parcours/atelier-model";
import type { LectureDxf } from "../import/import-dxf-ui";
import { ressourcesStudio } from "../chargement/ressources-studio";
import { groupeEnRepli, hotesStudio } from "../taches/pool-studio";
import type { ErreurHote, HoteWorker, OptionsDemande } from "./hote-worker";
import type { ChargeDxf, ResultatFeuille } from "./traitements";

/** Délai d'une lecture DXF (5 Mo au plus) — borne de sûreté choisie par Fadi, pas une mesure. */
export const DELAI_DXF_MS = 60_000;
/** Délai d'une composition de feuille — borne de sûreté choisie par Fadi, pas une mesure. */
export const DELAI_FEUILLE_MS = 30_000;

/** Premier hôte du groupe partagé (un seul Worker réutilisé pour ces appels). */
export const hoteStudio = (): HoteWorker => hotesStudio()[0]!;

let appels = 0;
/**
 * Appel direct à l'hôte, déclaré comme usage du moteur `calcul` pendant toute sa durée (B.3-05) : le gestionnaire ne
 * libère jamais les Workers pendant un appel en cours, et le Tool Manager le montre actif.
 */
function demanderAvecUsage<T>(nature: string, charge: unknown, o: OptionsDemande): Promise<T> {
  const fin = ressourcesStudio.utiliser("calcul", `client:${nature}:${++appels}`);
  let p: Promise<T>;
  try {
    p = hoteStudio().demander<T>(nature, charge, o);
  } catch (e) {
    fin();
    throw e;
  }
  return p.finally(fin);
}

export const lireDxfHorsFil = (charge: ChargeDxf, o: OptionsDemande = {}): Promise<LectureDxf> =>
  demanderAvecUsage<LectureDxf>("dxf.lire", charge, { delaiMs: DELAI_DXF_MS, ...o });

export const composerFeuilleHorsFil = (document: StudioDocument, options: StudioSheetOptions, o: OptionsDemande = {}): Promise<ResultatFeuille> =>
  demanderAvecUsage<ResultatFeuille>("feuille.composer", { document, options }, { delaiMs: DELAI_FEUILLE_MS, ...o });

/**
 * Le Worker a été abandonné après trop d'échecs : les calculs lourds se font désormais sur le fil principal (mêmes
 * fonctions, mêmes résultats). Faux sans Worker du tout (rendu serveur, tests) : rien à annoncer.
 */
export const calculSurFilPrincipal = (): boolean => groupeEnRepli();
export const MESSAGE_REPLI = "Calcul hors du fil principal indisponible après plusieurs échecs : ce calcul se fait sur le fil principal, l’interface peut se figer quelques instants.";

/** Message d'interface (français source) d'un échec de l'hôte ; `null` pour un résultat simplement écarté. */
export function messageHote(e: unknown): string | null {
  const code = (e as ErreurHote | null)?.code;
  if (code === "annulee" || code === "remplacee") return null;
  if (code === "delai") return "Le calcul n’a pas répondu à temps : réessayez ; il sera relancé.";
  if (code === "indisponible") return "Calcul indisponible : trois échecs consécutifs. Rechargez la page pour réessayer.";
  return "Le calcul a été interrompu : réessayez ; il sera relancé.";
}
