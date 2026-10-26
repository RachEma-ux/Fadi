/**
 * Empreinte que portera la version d'une fiche qualifiée, lue dans la fiche seule (fichier, puis tableau de valeurs et
 * annexe des douars s'il y en a ; même calcul que `db/geodata-reference.ts`) : une version déjà en base est reconnue
 * sans lire ni télécharger ses données (import automatique au déploiement, D-GD-23). Les empreintes réelles restent
 * contrôlées à la lecture : une fiche qui ne correspond pas à ses fichiers est refusée comme avant.
 */
import { createHash } from "node:crypto";

export interface EmpreintesFiche {
  version: { empreinte: string; tableau?: { empreinte: string } | undefined; annexes?: { douars?: { empreinte: string } | undefined } | undefined };
}

export function empreinteAttendue(fiche: EmpreintesFiche): string {
  const t = fiche.version.tableau;
  const d = fiche.version.annexes?.douars;
  const f = fiche.version.empreinte.toLowerCase();
  return t ? createHash("sha256").update(`${f}:${t.empreinte.toLowerCase()}${d ? `:${d.empreinte.toLowerCase()}` : ""}`).digest("hex") : f;
}
