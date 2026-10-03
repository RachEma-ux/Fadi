/**
 * Émetteur d'événements typé du bus (sans DOM : utilisable dans les tests et hors React).
 * Un écouteur qui lève n'empêche pas les autres d'être appelés.
 */
export class Emetteur<M extends object> {
  private readonly ecouteurs = new Map<keyof M, Set<(v: never) => void>>();

  on<K extends keyof M>(nom: K, fn: (valeur: M[K]) => void): () => void {
    const set = this.ecouteurs.get(nom) ?? new Set<(v: never) => void>();
    this.ecouteurs.set(nom, set);
    const f = fn as (v: never) => void;
    set.add(f);
    return () => {
      set.delete(f);
    };
  }

  emettre<K extends keyof M>(nom: K, valeur: M[K]): void {
    const set = this.ecouteurs.get(nom);
    if (!set) return;
    for (const fn of [...set]) {
      try {
        (fn as (v: M[K]) => void)(valeur);
      } catch (err) {
        console.error(`[bus atelier] écouteur « ${String(nom)} » en échec`, err);
      }
    }
  }
}
