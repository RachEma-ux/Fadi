/** A login may return only to an explicit dossier route, never to a supplied origin or arbitrary app route. */
export function safeDossierReturnTo(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /^\/projets\/([a-zA-Z0-9._-]{1,128})$/.exec(value);
  if (!match || match[0] !== value || match[1] === "." || match[1] === "..") return null;
  return value;
}

export function dossierReconnectHref(projectId: string): string {
  const returnTo = safeDossierReturnTo(`/projets/${encodeURIComponent(projectId)}`);
  return `/connexion?renouveler=1${returnTo ? `&returnTo=${encodeURIComponent(returnTo)}` : ""}`;
}
