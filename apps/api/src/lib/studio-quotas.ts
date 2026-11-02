/**
 * Quotas d'invocation de Studio (EX-028, TR-EX-028) : « chaque invocation effective fait l'objet des contrôles
 * d'exécution, notamment permission, contexte, paramètres, **quotas** et révision ». Le schéma statique d'une enveloppe
 * valide ne suffit pas : à l'exécution, le serveur compte les invocations de chaque **compte** sur des **périodes**
 * glissantes et refuse au-delà (429 `quota_exceeded`, avec la période, la limite et le délai avant nouvel essai).
 *
 * Décisions (Fadi, réversibles) :
 * - Une invocation = un lot de commandes soumis (`POST …/commands`) et accepté ; un rejeu idempotent (même requestId)
 *   n'est pas une nouvelle invocation et n'est jamais refusé par le quota (le travail hors ligne en attente repart) ; un
 *   lot refusé (droits, révision, paramètres) ne consomme rien.
 * - Bornes de sûreté par défaut (pas des mesures) : 600 lots par minute et 20 000 lots par heure et par compte —
 *   largement au-dessus d'une édition humaine (enregistrement par lot), elles arrêtent une boucle ou un client forgé.
 *   Ajustables par `STUDIO_QUOTA_LOTS_MINUTE` / `STUDIO_QUOTA_LOTS_HEURE` (entiers positifs).
 * - L'installation d'une étude exemple (écriture système, préfixe réservé) n'est pas comptée.
 * - Compteur **en mémoire du processus** (le serveur Fadi est un monolithe à instance unique) : remis à zéro au
 *   redémarrage, jamais une donnée du projet.
 *
 * Pur : aucune base ; horloge injectable.
 */

export interface PolitiqueQuota {
  /** Identifiant stable de la période (rendu au client). */
  readonly periode: "minute" | "heure";
  readonly fenetreMs: number;
  readonly maxInvocations: number;
}

export interface DepassementQuota {
  readonly periode: PolitiqueQuota["periode"];
  readonly limite: number;
  readonly fenetreMs: number;
  /** Délai avant qu'une invocation se libère dans cette période (ms, arrondi au supérieur). */
  readonly reessayerDansMs: number;
}

const entierPositif = (v: string | undefined, defaut: number): number => {
  const n = v === undefined ? Number.NaN : Number(v);
  return Number.isInteger(n) && n > 0 ? n : defaut;
};

export function politiquesParDefaut(env: Record<string, string | undefined> = process.env): PolitiqueQuota[] {
  return [
    { periode: "minute", fenetreMs: 60_000, maxInvocations: entierPositif(env["STUDIO_QUOTA_LOTS_MINUTE"], 600) },
    { periode: "heure", fenetreMs: 3_600_000, maxInvocations: entierPositif(env["STUDIO_QUOTA_LOTS_HEURE"], 20_000) },
  ];
}

/** Compteur glissant par compte (instants des invocations acceptées). */
export class QuotaInvocations {
  private readonly instants = new Map<string, number[]>();

  constructor(private politiques: readonly PolitiqueQuota[], private horloge: () => number = Date.now) {}

  /** Remplace les politiques (et l'horloge : tests) et oublie les compteurs. */
  configurer(politiques: readonly PolitiqueQuota[], horloge: () => number = Date.now): void { this.politiques = politiques; this.horloge = horloge; this.instants.clear(); }
  get regles(): readonly PolitiqueQuota[] { return this.politiques; }

  private elaguer(compte: string, t: number): number[] {
    const max = Math.max(0, ...this.politiques.map((p) => p.fenetreMs));
    const l = (this.instants.get(compte) ?? []).filter((x) => t - x < max);
    if (l.length) this.instants.set(compte, l); else this.instants.delete(compte);
    return l;
  }

  /** Dépassement que provoquerait une invocation de plus pour ce compte, ou null (admise). Ne consomme rien. */
  verifier(compte: string): DepassementQuota | null {
    const t = this.horloge();
    const l = this.elaguer(compte, t);
    for (const p of this.politiques) {
      const dans = l.filter((x) => t - x < p.fenetreMs);
      if (dans.length >= p.maxInvocations) {
        // L'invocation la plus ancienne de la fenêtre qui doit sortir pour repasser sous la limite.
        const sortante = dans[dans.length - p.maxInvocations]!;
        return { periode: p.periode, limite: p.maxInvocations, fenetreMs: p.fenetreMs, reessayerDansMs: Math.max(1, sortante + p.fenetreMs - t) };
      }
    }
    return null;
  }

  /** Enregistre une invocation acceptée. */
  consommer(compte: string): void {
    const t = this.horloge();
    const l = this.elaguer(compte, t);
    l.push(t);
    this.instants.set(compte, l);
  }

  /** Invocations comptées pour ce compte dans chaque période (diagnostic, tests). */
  compte(compte: string): Record<PolitiqueQuota["periode"], number> {
    const t = this.horloge();
    const l = this.elaguer(compte, t);
    return Object.fromEntries(this.politiques.map((p) => [p.periode, l.filter((x) => t - x < p.fenetreMs).length])) as Record<PolitiqueQuota["periode"], number>;
  }
}

/** Quota des lots de commandes Studio du processus. */
export const quotaCommandesStudio = new QuotaInvocations(politiquesParDefaut());

/** Corps du refus 429 (français source, comme les autres refus de Studio). */
export function corpsRefusQuota(d: DepassementQuota): Record<string, unknown> {
  const libelle = d.periode === "minute" ? "par minute" : "par heure";
  return {
    error: "quota_exceeded", periode: d.periode, limite: d.limite, retryAfterSeconds: Math.ceil(d.reessayerDansMs / 1000),
    message: `Quota d'invocation atteint : ${d.limite} lots de commandes ${libelle} pour ce compte. Rien n'a été écrit ; réessayez plus tard.`,
  };
}
