/**
 * Temps réel — signaux entre les routes existantes et le canal (RT-D5 § 7). Aucune dépendance : une route qui retire un
 * accès, révoque une session de compte ou enregistre une révision Studio l'annonce ici après validation ; le canal, s'il
 * est démarré, s'y abonne. Sans canal (drapeau absent, tests), un signal ne fait rien.
 *
 * Un signal d'accès rend immédiatement « à relire » toutes les connexions concernées : plus rien ne leur est diffusé
 * avant la relecture de leur droit (RT-R1).
 */
export type SignalTempsReel =
  | { type: "acces"; projectId: string; userId?: string }
  | { type: "compte"; userId: string }
  | { type: "session-compte"; sessionId: string }
  | { type: "studio-revision"; projectId: string; variantId: string; revisionId: string };

type Abonne = (s: SignalTempsReel) => void;
const abonnes = new Set<Abonne>();

export function abonnerSignaux(f: Abonne): () => void {
  abonnes.add(f);
  return () => abonnes.delete(f);
}

/** Annonce un fait déjà validé ; une erreur d'un abonné n'interrompt jamais la route appelante. */
export function signalerTempsReel(s: SignalTempsReel): void {
  for (const f of abonnes) {
    try { f(s); } catch { /* le canal journalise lui-même ses erreurs */ }
  }
}

/**
 * Intergiciel des routeurs qui changent un accès au projet (membres, participations) : après une écriture réussie,
 * signal `acces` pour le projet de l'adresse. Sans effet sur la réponse.
 */
export function signalerAccesApresEcriture(req: { method: string; params: unknown }, res: { statusCode: number; once(e: "finish", f: () => void): unknown }, next: () => void): void {
  const projectId = (req.params as Record<string, string | undefined>)["projectId"];
  if (req.method !== "GET" && req.method !== "HEAD" && projectId) {
    res.once("finish", () => { if (res.statusCode < 400) signalerTempsReel({ type: "acces", projectId }); });
  }
  next();
}
