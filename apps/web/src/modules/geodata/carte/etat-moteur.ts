/**
 * État du moteur cartographique (feuille de route équipe A, PR P2 « carte robuste ») : sans React ni DOM.
 *
 * Avant P2, un seul état `erreurCarte` recevait quatre causes (WebGL absent, échec de démarrage, contexte perdu, tuile
 * refusée d'une couche) et n'était jamais remis à zéro : une seule tuile refusée coupait ~25 commandes jusqu'au
 * rechargement. Ici les cas sont séparés ; une tuile refusée ne change JAMAIS l'état du moteur (avis par couche, non
 * bloquant, comme le fond : `avisFond`) et un contexte WebGL restauré rend la carte.
 */

export type EtatMoteur =
  /** Moteur en cours de chargement ; `animation` coupée par la garde de 15 s (jamais d'animation sans fin). */
  | { readonly cas: "chargement"; readonly animation: boolean; readonly generation: number }
  | { readonly cas: "pret"; readonly generation: number }
  | { readonly cas: "sans-webgl" }
  | { readonly cas: "echec-demarrage"; readonly origine: "import" | "creation"; readonly detail: string }
  | { readonly cas: "contexte-perdu"; readonly generation: number };

export type EvenementMoteur =
  | { readonly type: "cree" }
  | { readonly type: "echec-import" }
  | { readonly type: "echec-creation"; readonly detail: string }
  | { readonly type: "delai-depasse" }
  | { readonly type: "contexte-perdu" }
  | { readonly type: "contexte-restaure" };

export function etatInitial(webgl: boolean): EtatMoteur {
  return webgl ? { cas: "chargement", animation: true, generation: 0 } : { cas: "sans-webgl" };
}

/** Transitions ; toute paire absente laisse l'état inchangé (`sans-webgl` et `echec-demarrage` sont terminaux). */
export function transitionMoteur(e: EtatMoteur, ev: EvenementMoteur): EtatMoteur {
  switch (e.cas) {
    case "chargement":
      if (ev.type === "cree") return { cas: "pret", generation: e.generation + 1 };
      if (ev.type === "echec-creation") return { cas: "echec-demarrage", origine: "creation", detail: ev.detail };
      if (ev.type === "echec-import") return { cas: "echec-demarrage", origine: "import", detail: "" };
      if (ev.type === "delai-depasse") return e.animation ? { ...e, animation: false } : e;
      if (ev.type === "contexte-perdu") return { cas: "contexte-perdu", generation: e.generation };
      return e;
    case "pret":
      return ev.type === "contexte-perdu" ? { cas: "contexte-perdu", generation: e.generation } : e;
    case "contexte-perdu":
      return ev.type === "contexte-restaure" ? { cas: "pret", generation: e.generation + 1 } : e;
    default:
      return e;
  }
}

/** Génération du moteur : change à la création et à la restauration ; les effets qui posent l'état sur la carte en dépendent. */
export const generationMoteur = (e: EtatMoteur): number => ("generation" in e ? e.generation : -1);

/**
 * Outils de la colonne, raccourcis M/I/V/G/S/O/U, pastilles, mini-carte, synthèse, légende flottante : disponibles tant
 * que la carte est prête ou en chargement (comme avant P2 : rien n'était coupé pendant le chargement).
 */
export const carteDisponible = (e: EtatMoteur): boolean => e.cas === "pret" || e.cas === "chargement";

/** Texte de l'alerte `data-gd-erreur-carte`, ou null (mêmes textes qu'avant P2). */
export function messageMoteur(e: EtatMoteur): string | null {
  switch (e.cas) {
    case "sans-webgl": return "WebGL n'est pas disponible dans ce navigateur : la carte ne peut pas s'afficher. La recherche, le catalogue, la table et les fiches restent utilisables.";
    case "echec-demarrage": return e.origine === "import"
      ? "Le moteur cartographique n'a pas pu être chargé (réseau ?). La recherche, la table et les fiches restent utilisables."
      : `La carte n'a pas pu démarrer (${e.detail}). La recherche, la table et les fiches restent utilisables.`;
    case "contexte-perdu": return "Le rendu graphique (WebGL) a été perdu : la recherche, la table et les fiches restent disponibles.";
    default: return null;
  }
}

/** Couches dont les tuiles sont refusées (403 / 404), par identifiant de couche : avis non bloquant. */
export type AvisCouches = ReadonlyMap<string, 403 | 404>;

const SOURCE_COUCHE = /^gd-couche-(.+?)(-etq)?$/;

/** Note un refus de tuiles ; seules les sources de couches comptent (`gd-couche-<id>` ou `gd-couche-<id>-etq`). */
export function noterRefus(a: AvisCouches, sourceId: string, statut: number): AvisCouches {
  const m = SOURCE_COUCHE.exec(sourceId);
  if (!m || (statut !== 403 && statut !== 404) || a.get(m[1]!) === statut) return a;
  return new Map(a).set(m[1]!, statut);
}

/** Un avis disparaît quand sa couche quitte la composition (ou n'est plus visible). */
export function oublierAvis(a: AvisCouches, couchesPresentes: ReadonlySet<string>): AvisCouches {
  if ([...a.keys()].every((k) => couchesPresentes.has(k))) return a;
  return new Map([...a].filter(([k]) => couchesPresentes.has(k)));
}
