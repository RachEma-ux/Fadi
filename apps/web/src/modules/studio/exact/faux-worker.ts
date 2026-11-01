/**
 * Faux Worker du noyau exact pour les tests (lot F2) : il répond aux demandes `charger` et `operation` par une fonction
 * fournie, peut rester muet, renvoyer une erreur de calcul, ou s'interrompre comme un vrai Worker (événement `error`).
 * Il compte ses créations et ses arrêts. Aucun noyau n'y tourne : le calcul est celui que le test lui donne.
 */
import type { WorkerExact } from "./client-exact";
import type { DemandeNoyauExact, ReponseNoyauExact } from "./noyau-exact.worker";

export interface CompteurFaux { crees: number; arretes: number; vivants: FauxWorker[] }

export class FauxWorker implements WorkerExact {
  arrete = false;
  readonly recus: DemandeNoyauExact[] = [];
  private readonly ecouteurs = new Map<string, ((e: MessageEvent | Event) => void)[]>();
  constructor(private readonly repondre: (d: DemandeNoyauExact, w: FauxWorker) => unknown | "silence" | { erreur: string }, private readonly compteur: CompteurFaux, private readonly instances = 1) {
    compteur.crees += 1;
    compteur.vivants.push(this);
  }
  addEventListener(type: string, f: (e: MessageEvent | Event) => void): void { this.ecouteurs.set(type, [...(this.ecouteurs.get(type) ?? []), f]); }
  private emettre(type: string, e: MessageEvent | Event) { for (const f of this.ecouteurs.get(type) ?? []) f(e); }
  terminate(): void {
    if (this.arrete) return;
    this.arrete = true;
    this.compteur.arretes += 1;
    this.compteur.vivants = this.compteur.vivants.filter((w) => w !== this);
  }
  postMessage(m: unknown): void {
    const d = m as DemandeNoyauExact;
    this.recus.push(d);
    const r = this.repondre(d, this);
    if (r === "silence") return;
    const suivi = { instances: this.instances, wasm: { url: "/assets/occt-wasm-x.wasm", transfere: 5_000_000, encode: 5_000_000, decode: 21_177_576 }, chargementMs: 12, memoireWasm: 65536 * (18 + this.recus.length) };
    const reponse: ReponseNoyauExact = r && typeof r === "object" && "erreur" in (r as object) ? { id: d.id, erreur: (r as { erreur: string }).erreur, suivi } : { id: d.id, valeur: r, suivi };
    queueMicrotask(() => { if (!this.arrete) this.emettre("message", { data: reponse } as MessageEvent); });
  }
  /** Interruption brutale, comme un Worker dont le noyau plante. */
  planter(): void { this.emettre("error", new Event("error")); }
}
