/**
 * Empreinte que portera la version d'une fiche qualifiée, lue dans la fiche seule (fichier, puis tableau de valeurs et
 * annexes s'il y en a — douars, concepts, tableau de bord, agrégats de prix publiés, dans cet ordre ; même calcul que `db/geodata-reference.ts`) : une version déjà en base est reconnue
 * sans lire ni télécharger ses données (import automatique au déploiement, D-GD-23). Les empreintes réelles restent
 * contrôlées à la lecture : une fiche qui ne correspond pas à ses fichiers est refusée comme avant.
 */
import { createHash } from "node:crypto";

export interface EmpreintesFiche {
  version: { empreinte: string; tableau?: { empreinte: string } | undefined; annexes?: AnnexesEmpreintes | undefined };
}

type Annexe = { empreinte: string } | undefined;
export interface AnnexesEmpreintes { douars?: Annexe; concepts?: Annexe; tableau?: Annexe; prixPublies?: Annexe }

/** Suite des empreintes des annexes présentes (« :h1:h2… ») ; vide sans annexe (versions antérieures inchangées). */
export function suiteAnnexes(a: AnnexesEmpreintes | undefined, lire: (x: { empreinte: string }) => string = (x) => x.empreinte.toLowerCase()): string {
  return [a?.douars, a?.concepts, a?.tableau, a?.prixPublies].filter((x): x is { empreinte: string } => !!x).map((x) => `:${lire(x)}`).join("");
}

export function empreinteAttendue(fiche: EmpreintesFiche): string {
  const t = fiche.version.tableau;
  const f = fiche.version.empreinte.toLowerCase();
  return t ? createHash("sha256").update(`${f}:${t.empreinte.toLowerCase()}${suiteAnnexes(fiche.version.annexes)}`).digest("hex") : f;
}
