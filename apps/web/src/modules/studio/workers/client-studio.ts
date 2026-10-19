/**
 * Client du Worker de Studio : un seul hôte pour la session (créé paresseusement), fonctions typées pour la lecture
 * DXF et la composition de la feuille. Sans Worker, le calcul se fait directement (mêmes fonctions, mêmes résultats).
 */
import type { StudioDocument, StudioSheetOptions } from "@parcours/atelier-model";
import type { LectureDxf } from "../import/import-dxf-ui";
import { HoteWorker, type ErreurHote, type OptionsDemande } from "./hote-worker";
import { executerDirectement } from "./protocole";
import { TRAITEMENTS_STUDIO, type ChargeDxf, type ResultatFeuille } from "./traitements";

/** Délai d'une lecture DXF (5 Mo au plus) — borne de sûreté choisie par Fadi, pas une mesure. */
export const DELAI_DXF_MS = 60_000;
/** Délai d'une composition de feuille — borne de sûreté choisie par Fadi, pas une mesure. */
export const DELAI_FEUILLE_MS = 30_000;

let hote: HoteWorker | null = null;
export function hoteStudio(): HoteWorker {
  return (hote ??= new HoteWorker({
    creer: () => new Worker(new URL("./studio.worker.ts", import.meta.url), { type: "module", name: "fadi-studio" }),
    delaiMs: DELAI_DXF_MS,
    direct: executerDirectement(TRAITEMENTS_STUDIO),
  }));
}

export const lireDxfHorsFil = (charge: ChargeDxf, o: OptionsDemande = {}): Promise<LectureDxf> =>
  hoteStudio().demander<LectureDxf>("dxf.lire", charge, { delaiMs: DELAI_DXF_MS, ...o });

export const composerFeuilleHorsFil = (document: StudioDocument, options: StudioSheetOptions, o: OptionsDemande = {}): Promise<ResultatFeuille> =>
  hoteStudio().demander<ResultatFeuille>("feuille.composer", { document, options }, { delaiMs: DELAI_FEUILLE_MS, ...o });

/**
 * Le Worker a été abandonné après trop d'échecs : les calculs lourds se font désormais sur le fil principal (mêmes
 * fonctions, mêmes résultats). Faux sans Worker du tout (rendu serveur, tests) : rien à annoncer.
 */
export const calculSurFilPrincipal = (): boolean => hote !== null && hote.indisponible && hote.repli;
export const MESSAGE_REPLI = "Calcul hors du fil principal indisponible après plusieurs échecs : ce calcul se fait sur le fil principal, l’interface peut se figer quelques instants.";

/** Message d'interface (français source) d'un échec de l'hôte ; `null` pour un résultat simplement écarté. */
export function messageHote(e: unknown): string | null {
  const code = (e as ErreurHote | null)?.code;
  if (code === "annulee" || code === "remplacee") return null;
  if (code === "delai") return "Le calcul n’a pas répondu à temps : réessayez ; il sera relancé.";
  if (code === "indisponible") return "Calcul indisponible : trois échecs consécutifs. Rechargez la page pour réessayer.";
  return "Le calcul a été interrompu : réessayez ; il sera relancé.";
}
