/**
 * Fond mondial à la demande (TER-09, Issue #381) : lecture **par plages HTTP** des COG distants approuvés (GEDTM30 global,
 * Copernicus GLO-30 en dalles 1° × 1°), dans l'emprise demandée seulement, avec un cache local par source et par version.
 *
 * Trois pièces :
 *  - `lirePlageOrigine` : une requête de plage vers l'origine, adresse **construite** depuis une fiche livrée et revérifiée
 *    (liste fermée), redirection jamais suivie, délai, taille, budget ; ETag / Last-Modified / taille épinglés ;
 *  - `ServiceDistant` : le service `terrain-distant` (seul à sortir vers Internet ; réseau `front` + `internal`, aucune
 *    base, volume terrain sous `cache-distant/` seulement) ; il sert des plages à l'API depuis son cache, et va chercher à
 *    l'origine les blocs manquants (le travail continue si l'appelant abandonne : la lecture suivante trouve le cache) ;
 *    quota borné à l'intérieur du volume terrain, éviction LRU ;
 *  - `ClientServiceDistant` : le client geotiff de l'API (réseau `internal` seulement) vers ce service.
 *
 * Jamais de cache public (réponses `private, no-store` ; service interne sans port publié). Hors couverture → « hors
 * couverture » ; origine injoignable, budget atteint ou source modifiée → « indisponible » ; jamais une valeur inventée.
 */
import { createHash, randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { mkdir, readdir, readFile, rename, rm, stat, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { BaseClient, BaseResponse } from "geotiff";
import {
  adresseAutorisee, adresseDistante, blocsDePlage, CompteurBudget, lireContentRange, lirePlage, memeSource, planEviction, redirectionRefusee, suitesContigues,
  DALLE, type AcquisitionDistante, type BudgetDistant, type DeclarationTerrain, type EpinglageDistant,
} from "@parcours/geodata-model";

/** Taille d'un bloc du cache (et des lectures de geotiff côté API). */
export const TAILLE_BLOC = 256 * 1024;
/** Plage d'une lecture de l'API vers le service (découpée en requêtes d'origine bornées par le budget). */
export const PLAGE_MAX_API = 64 * 1024 * 1024;

/** Budget par défaut (TER-D24, à confirmer) ; surchargé par l'environnement du service. */
export const BUDGET_DISTANT_DEFAUT: BudgetDistant = Object.freeze({ simultanees: 6, parMinute: 300, octetsParJour: 5 * 1000 ** 3, octetsParRequete: 16 * 1024 * 1024, delaiMs: 20_000 });

/** Quota du cache distant par défaut (TER-D22, à confirmer) : 10 Go à l'intérieur du quota du volume terrain. */
export const QUOTA_CACHE_DEFAUT = 10 * 1000 ** 3;

export type EtatDistant = "hors-couverture" | "indisponible" | "source-modifiee" | "budget" | "refuse";
export class ErreurDistante extends Error {
  constructor(readonly etat: EtatDistant, message: string) { super(message); }
}

export interface SourceDistanteLivree { readonly cle: string; readonly acquisition: AcquisitionDistante }

/** Sources distantes d'une liste de fiches livrées (la liste fermée des hôtes et des modèles d'adresse). */
export const sourcesDistantes = (fiches: readonly DeclarationTerrain[]): SourceDistanteLivree[] =>
  fiches.flatMap((d) => (d.acquisition.methode === "distant" ? [{ cle: d.cle, acquisition: d.acquisition }] : []));

/** Transport HTTP (fetch par défaut) ; remplaçable dans les tests, jamais configurable à l'exécution. */
export type Transport = (url: string, init: { headers: Record<string, string>; signal: AbortSignal; redirect: "manual" }) => Promise<Response>;
const transportFetch: Transport = (url, init) => fetch(url, init);

const epinglageDe = (r: Response, total: number): EpinglageDistant => ({ etag: r.headers.get("etag"), lastModified: r.headers.get("last-modified"), taille: total });

/** Corps lu en flux, refusé au-delà de `max` octets (une origine qui ignore la plage n'envoie jamais tout le fichier). */
async function corpsBorne(r: Response, max: number): Promise<Buffer> {
  if (!r.body) return Buffer.alloc(0);
  const morceaux: Buffer[] = [];
  let n = 0;
  const lecteur = r.body.getReader();
  for (;;) {
    const { done, value } = await lecteur.read();
    if (done) break;
    n += value.length;
    if (n > max) { await lecteur.cancel().catch(() => undefined); throw new ErreurDistante("indisponible", `Réponse distante plus longue que la plage demandée (${max} octets) : abandonnée.`); }
    morceaux.push(Buffer.from(value));
  }
  return Buffer.concat(morceaux);
}

/**
 * Lit la plage [debut, fin] d'une adresse de la liste fermée, à l'origine. Refus : adresse hors liste, redirection, statut
 * inattendu, plage ignorée, corps trop long, délai dépassé, budget. 404 / 403 de l'origine = hors couverture (dalle
 * absente : océan…).
 */
export async function lirePlageOrigine(
  sources: readonly SourceDistanteLivree[], url: string, debut: number, fin: number,
  o: { readonly budget: CompteurBudget; readonly transport?: Transport | undefined; readonly maintenant?: (() => number) | undefined },
): Promise<{ octets: Buffer; total: number; epinglage: EpinglageDistant }> {
  if (!adresseAutorisee(sources, url)) throw new ErreurDistante("refuse", "Adresse distante hors de la liste fermée des fiches livrées : refusée.");
  const longueur = fin - debut + 1;
  const motif = o.budget.reserver(longueur, (o.maintenant ?? Date.now)());
  if (motif) throw new ErreurDistante("budget", motif);
  try {
    let r: Response;
    try {
      r = await (o.transport ?? transportFetch)(url, { headers: { Range: `bytes=${debut}-${fin}` }, signal: AbortSignal.timeout(o.budget.budget.delaiMs), redirect: "manual" });
    } catch (e) {
      throw new ErreurDistante("indisponible", `Source distante injoignable (${(e as Error).name === "TimeoutError" ? `délai de ${o.budget.budget.delaiMs} ms dépassé` : (e as Error).message}).`);
    }
    if (redirectionRefusee(r.status)) throw new ErreurDistante("refuse", `Redirection distante (HTTP ${r.status}) refusée : aucune redirection n'est suivie.`);
    if (r.status === 404 || r.status === 403) { await r.body?.cancel().catch(() => undefined); throw new ErreurDistante("hors-couverture", `Aucune donnée à cette adresse (HTTP ${r.status}).`); }
    if (r.status === 206) {
      const cr = lireContentRange(r.headers.get("content-range"), { debut, fin });
      if (!cr) { await r.body?.cancel().catch(() => undefined); throw new ErreurDistante("indisponible", "Content-Range distant incohérent avec la plage demandée."); }
      const octets = await corpsBorne(r, cr.fin - debut + 1);
      if (octets.length !== cr.fin - debut + 1) throw new ErreurDistante("indisponible", "Plage distante incomplète.");
      return { octets, total: cr.total, epinglage: epinglageDe(r, cr.total) };
    }
    if (r.status === 200) {
      // Plage ignorée : admise seulement si le fichier entier tient dans la plage demandée.
      const lu = Number(r.headers.get("content-length"));
      if (debut !== 0 || !(lu > 0 && lu <= longueur)) { await r.body?.cancel().catch(() => undefined); throw new ErreurDistante("indisponible", "L'origine ignore les plages HTTP : lecture partielle impossible, rien n'est téléchargé."); }
      const octets = await corpsBorne(r, lu);
      return { octets, total: octets.length, epinglage: epinglageDe(r, octets.length) };
    }
    await r.body?.cancel().catch(() => undefined);
    throw new ErreurDistante("indisponible", `Source distante en erreur (HTTP ${r.status}).`);
  } finally {
    o.budget.liberer();
  }
}

// ——— Service terrain-distant ———

interface MetaSource extends EpinglageDistant { readonly url: string; readonly cle: string; readonly dalle: string | null; readonly premierAcces: string }
interface Absence { readonly depuis: number; readonly motif: string }

export interface OptionsService {
  /** Racine du volume terrain ; le cache vit sous `cache-distant/`. */
  readonly racine: string;
  readonly sources: readonly SourceDistanteLivree[];
  readonly quotaCache: number;
  /** Quota du volume terrain entier (TER-D7) : le cache est aussi évincé pour que le volume reste dessous. */
  readonly quotaVolume: number;
  readonly budget: BudgetDistant;
  readonly transport?: Transport | undefined;
  readonly maintenant?: (() => number) | undefined;
  /** Utilisation du volume hors cache (octets), mesurée par l'appelant (originaux, dérivés, exports). */
  readonly horsCache?: () => Promise<number>;
}

const hacher = (t: string) => createHash("sha256").update(t).digest("hex");

export class ServiceDistant {
  readonly dossier: string;
  readonly budget: CompteurBudget;
  private readonly index = new Map<string, { taille: number; utiliseLe: number }>();
  private total = 0;
  private readonly enVol = new Map<string, Promise<void>>();
  private readonly metas = new Map<string, MetaSource>();
  private readonly absences = new Map<string, Absence>();
  private readonly protegees = new Set<string>();
  private horsCacheOctets = 0;
  private evictionEnCours: Promise<void> | null = null;
  readonly compteurs = { lectures: 0, depuisCache: 0, depuisOrigine: 0, octetsOrigine: 0, evinces: 0 };

  constructor(readonly o: OptionsService) {
    if (!(o.quotaCache > 0) || o.quotaCache > o.quotaVolume) throw new Error("Quota du cache distant invalide : il doit tenir dans le quota du volume terrain.");
    this.dossier = join(o.racine, "cache-distant");
    this.budget = new CompteurBudget(o.budget);
  }

  private maintenant() { return (this.o.maintenant ?? Date.now)(); }

  /** Inventaire du cache au démarrage (date de modification = dernier usage) ; mesure du volume hors cache. */
  async demarrer(): Promise<void> {
    await mkdir(this.dossier, { recursive: true });
    for (const cle of await readdir(this.dossier).catch(() => [] as string[])) {
      for (const h of await readdir(join(this.dossier, cle)).catch(() => [] as string[])) {
        const d = join(this.dossier, cle, h);
        for (const f of await readdir(d).catch(() => [] as string[])) {
          const p = join(d, f);
          if (f.endsWith(".part")) { await rm(p, { force: true }); continue; }
          if (!/^b\d+$/.test(f)) continue;
          const s = await stat(p);
          this.index.set(p, { taille: s.size, utiliseLe: s.mtimeMs });
          this.total += s.size;
        }
      }
    }
    await this.mesurerVolume();
    await this.evincer();
  }

  async mesurerVolume(): Promise<void> {
    if (this.o.horsCache) this.horsCacheOctets = await this.o.horsCache().catch(() => this.horsCacheOctets);
  }

  private repertoire(cle: string, url: string) { return join(this.dossier, cle, hacher(url).slice(0, 40)); }

  private async meta(cle: string, url: string): Promise<MetaSource | null> {
    const d = this.repertoire(cle, url);
    const deja = this.metas.get(d);
    if (deja) return deja;
    try {
      const m = JSON.parse(await readFile(join(d, "meta.json"), "utf8")) as MetaSource;
      if (m.url !== url) return null;
      this.metas.set(d, m);
      return m;
    } catch { return null; }
  }

  private async epingler(cle: string, url: string, dalle: string | null, e: EpinglageDistant): Promise<MetaSource> {
    const d = this.repertoire(cle, url);
    const m = await this.meta(cle, url);
    if (m) {
      if (!memeSource(m, e)) throw new ErreurDistante("source-modifiee", `La source distante a changé depuis sa première lecture (${m.premierAcces}) : ETag, date ou taille différents. Rien n'est mélangé ; une nouvelle version de catalogue est requise.`);
      return m;
    }
    const nouveau: MetaSource = { ...e, url, cle, dalle, premierAcces: new Date(this.maintenant()).toISOString() };
    await mkdir(d, { recursive: true });
    const part = join(d, `meta.json.${process.pid}.${randomUUID()}.part`);
    await writeFile(part, JSON.stringify(nouveau));
    await rename(part, join(d, "meta.json"));
    this.metas.set(d, nouveau);
    return nouveau;
  }

  /** Blocs [b0, b1] lus à l'origine en une requête et écrits dans le cache (écriture puis renommage). */
  private async chercher(cle: string, url: string, dalle: string | null, b0: number, b1: number, taille: number | null): Promise<void> {
    const debut = b0 * TAILLE_BLOC;
    const fin = taille === null ? (b1 + 1) * TAILLE_BLOC - 1 : Math.min((b1 + 1) * TAILLE_BLOC, taille) - 1;
    const r = await lirePlageOrigine(this.o.sources, url, debut, fin, { budget: this.budget, transport: this.o.transport, maintenant: this.o.maintenant });
    const meta = await this.epingler(cle, url, dalle, r.epinglage);
    this.compteurs.depuisOrigine++;
    this.compteurs.octetsOrigine += r.octets.length;
    const d = this.repertoire(cle, url);
    for (let b = b0; b <= b1; b++) {
      const morceau = r.octets.subarray((b - b0) * TAILLE_BLOC, Math.min((b - b0 + 1) * TAILLE_BLOC, r.octets.length));
      if (!morceau.length) break;
      if (b * TAILLE_BLOC + morceau.length < Math.min((b + 1) * TAILLE_BLOC, meta.taille)) break; // bloc incomplet : jamais mis en cache
      const p = join(d, `b${b}`);
      const part = `${p}.${process.pid}.${randomUUID()}.part`;
      await writeFile(part, morceau);
      await rename(part, p);
      const ancien = this.index.get(p);
      if (ancien) this.total -= ancien.taille;
      this.index.set(p, { taille: morceau.length, utiliseLe: this.maintenant() });
      this.total += morceau.length;
    }
  }

  /**
   * Plage [debut, fin] d'une source de la liste fermée (`dalle` null pour une adresse unique), depuis le cache, en allant
   * chercher à l'origine les blocs manquants. Renvoie les octets (bornés par la taille du fichier) et l'épinglage.
   */
  async lire(cle: string, dalle: string | null, debut: number, fin: number): Promise<{ octets: Buffer; meta: MetaSource; depuisCache: boolean }> {
    const source = this.o.sources.find((s) => s.cle === cle);
    if (!source) throw new ErreurDistante("refuse", `Source distante inconnue : ${cle} (liste fermée des fiches livrées).`);
    if (dalle !== null && !DALLE.test(dalle)) throw new ErreurDistante("refuse", "Dalle invalide.");
    const url = adresseDistante(source.acquisition, dalle);
    if (!url) throw new ErreurDistante("hors-couverture", "Hors de l'emprise déclarée de la source.");
    if (!adresseAutorisee(this.o.sources, url)) throw new ErreurDistante("refuse", "Adresse distante hors de la liste fermée.");
    if (fin - debut + 1 > PLAGE_MAX_API) throw new ErreurDistante("refuse", `Plage de ${fin - debut + 1} octets : au-delà de ${PLAGE_MAX_API} par lecture.`);
    const absente = this.absences.get(url);
    if (absente && this.maintenant() - absente.depuis < 86_400_000) throw new ErreurDistante("hors-couverture", absente.motif);
    this.compteurs.lectures++;
    const d = this.repertoire(cle, url);
    let meta = await this.meta(cle, url);
    const voulus = blocsDePlage(debut, fin, TAILLE_BLOC, meta?.taille ?? null);
    const manquants = voulus.filter((b) => !this.index.has(join(d, `b${b}`)));
    for (const b of voulus) this.protegees.add(join(d, `b${b}`));
    try {
      if (manquants.length) {
        // Un bloc n'est cherché qu'une fois à la fois : les blocs déjà en vol (lecture concurrente, plage différente) sont
        // attendus ; seuls les autres partent, regroupés en suites contiguës.
        const attentes: Promise<void>[] = [];
        const libres: number[] = [];
        for (const b of manquants) { const p = this.enVol.get(`${d}|b${b}`); if (p) attentes.push(p); else libres.push(b); }
        for (const [b0, b1] of suitesContigues(libres, Math.max(1, Math.floor(this.o.budget.octetsParRequete / TAILLE_BLOC)))) {
          const p = this.chercher(cle, url, dalle, b0, b1, meta?.taille ?? null).catch((e) => {
            if (e instanceof ErreurDistante && e.etat === "hors-couverture") this.absences.set(url, { depuis: this.maintenant(), motif: e.message });
            throw e;
          });
          for (let b = b0; b <= b1; b++) this.enVol.set(`${d}|b${b}`, p);
          void p.catch(() => undefined).finally(() => { for (let b = b0; b <= b1; b++) if (this.enVol.get(`${d}|b${b}`) === p) this.enVol.delete(`${d}|b${b}`); });
          attentes.push(p);
        }
        await Promise.all(attentes);
        meta = await this.meta(cle, url);
      }
      if (!meta) throw new ErreurDistante("indisponible", "Source distante sans en-tête épinglé.");
      const f = Math.min(fin, meta.taille - 1);
      if (f < debut) return { octets: Buffer.alloc(0), meta, depuisCache: !manquants.length };
      const morceaux: Buffer[] = [];
      for (const b of blocsDePlage(debut, f, TAILLE_BLOC, meta.taille)) {
        const p = join(d, `b${b}`);
        let contenu: Buffer;
        try { contenu = await readFile(p); } catch { this.index.delete(p); throw new ErreurDistante("indisponible", "Bloc du cache évincé pendant la lecture : réessayer."); }
        const a = Math.max(debut, b * TAILLE_BLOC) - b * TAILLE_BLOC;
        const z = Math.min(f, (b + 1) * TAILLE_BLOC - 1) - b * TAILLE_BLOC + 1;
        morceaux.push(contenu.subarray(a, z));
        const e = this.index.get(p);
        if (e) e.utiliseLe = this.maintenant();
        void utimes(p, new Date(), new Date()).catch(() => undefined);
      }
      if (!manquants.length) this.compteurs.depuisCache++;
      return { octets: Buffer.concat(morceaux), meta, depuisCache: !manquants.length };
    } finally {
      for (const b of voulus) this.protegees.delete(join(d, `b${b}`));
      void this.evincer();
    }
  }

  /** Éviction LRU : le cache sous son quota (90 % visé) et le volume entier sous le sien. */
  evincer(): Promise<void> {
    if (this.evictionEnCours) return this.evictionEnCours;
    this.evictionEnCours = (async () => {
      const quota = Math.min(this.o.quotaCache, Math.max(0, this.o.quotaVolume - this.horsCacheOctets));
      const plan = planEviction([...this.index].map(([cle, v]) => ({ cle, taille: v.taille, utiliseLe: v.utiliseLe })), quota, Math.floor(quota * 0.9), this.protegees);
      for (const p of plan) {
        const e = this.index.get(p);
        await rm(p, { force: true });
        if (e) { this.total -= e.taille; this.index.delete(p); this.compteurs.evinces++; }
      }
    })().finally(() => { this.evictionEnCours = null; });
    return this.evictionEnCours;
  }

  etat() {
    return {
      sources: this.o.sources.map((s) => s.cle), cache: { octets: this.total, blocs: this.index.size, quota: this.o.quotaCache, quotaVolume: this.o.quotaVolume, horsCache: this.horsCacheOctets },
      budget: { ...this.o.budget, ...this.budget.etat(this.maintenant()) }, compteurs: { ...this.compteurs },
    };
  }

  /** Serveur HTTP interne : `GET /sante`, `GET /source/<cle>/<dalle|->` avec `Range: bytes=a-b`. */
  serveur(): Server {
    return createServer((req, res) => { void this.repondre(req, res); });
  }

  private async repondre(req: IncomingMessage, res: ServerResponse) {
    res.setHeader("Cache-Control", "private, no-store");
    const json = (statut: number, corps: unknown, etat?: string) => {
      if (etat) res.setHeader("X-Terrain-Etat", etat);
      res.writeHead(statut, { "Content-Type": "application/json; charset=utf-8" }).end(JSON.stringify(corps));
    };
    try {
      if (req.method !== "GET") return json(405, { error: "methode" });
      const chemin = (req.url ?? "").split("?")[0]!;
      if (chemin === "/sante") return json(200, { ok: true, ...this.etat() });
      const m = /^\/source\/([a-z0-9][a-z0-9-]{2,79})\/([A-Z0-9]{7}|-)$/.exec(chemin);
      if (!m) return json(404, { error: "inconnu" });
      const plage = lirePlage(req.headers["range"]);
      if (!plage) return json(416, { error: "plage", message: "Une plage unique « bytes=a-b » est exigée." });
      const r = await this.lire(m[1]!, m[2] === "-" ? null : m[2]!, plage.debut, plage.fin);
      const fin = plage.debut + r.octets.length - 1;
      res.writeHead(206, {
        "Content-Type": "application/octet-stream", "Content-Length": String(r.octets.length), "Content-Range": `bytes ${plage.debut}-${Math.max(plage.debut, fin)}/${r.meta.taille}`,
        "X-Source-Url": r.meta.url, "X-Source-Etag": r.meta.etag ?? "", "X-Source-Last-Modified": r.meta.lastModified ?? "", "X-Source-Taille": String(r.meta.taille),
        "X-Source-Premier-Acces": r.meta.premierAcces, "X-Terrain-Cache": r.depuisCache ? "hit" : "miss",
      }).end(r.octets);
    } catch (e) {
      if (e instanceof ErreurDistante) {
        const statut = e.etat === "hors-couverture" ? 404 : e.etat === "budget" ? 429 : e.etat === "source-modifiee" ? 409 : e.etat === "refuse" ? 403 : 503;
        return json(statut, { error: e.etat, message: e.message }, e.etat);
      }
      return json(500, { error: "interne", message: "Erreur du service de lecture distante." }, "indisponible");
    }
  }
}

// ——— Client de l'API ———

/** Adresse du service distant (réseau interne seulement), ou null (fond mondial « indisponible »). */
export function adresseServiceDistant(env: NodeJS.ProcessEnv = process.env): string | null {
  const v = env["GEODATA_TERRAIN_DISTANT_URL"];
  if (!v) return null;
  if (!/^http:\/\/[a-z0-9][a-z0-9.-]{0,62}:\d{2,5}$/.test(v)) throw new Error(`GEODATA_TERRAIN_DISTANT_URL invalide : ${v} (http://<service interne>:<port>).`);
  return v;
}

class ReponseService extends BaseResponse {
  constructor(private readonly statut: number, private readonly entetes: Headers, private readonly donnees: ArrayBuffer) { super(); }
  override get status() { return this.statut; }
  override getHeader(nom: string) { return this.entetes.get(nom) ?? undefined; }
  override async getData() { return this.donnees; }
}

/**
 * Client geotiff vers le service distant : chaque plage demandée par geotiff passe par le service (cache, origine). Les
 * refus deviennent des `ErreurDistante` ; `surEpinglage` reçoit l'épinglage de la source (traçabilité par version).
 */
export class ClientServiceDistant extends BaseClient {
  /** Dernier refus reçu (geotiff remplace l'erreur d'un bloc par une erreur générique : l'état est relu ici). */
  derniereErreur: ErreurDistante | null = null;
  constructor(base: string, readonly cle: string, readonly dalle: string | null, private readonly surEpinglage: (url: string, e: EpinglageDistant) => Promise<void>, private readonly delaiMs = 30_000) {
    super(`${base}/source/${cle}/${dalle ?? "-"}`);
  }

  override async request({ headers, signal }: { headers?: Record<string, string>; signal?: AbortSignal } = {}): Promise<BaseResponse> {
    let r: Response;
    const signaux = [AbortSignal.timeout(this.delaiMs), ...(signal ? [signal] : [])];
    const echec = (e: ErreurDistante) => { this.derniereErreur = e; return e; };
    try {
      r = await fetch(this.url, { headers: headers ?? {}, signal: AbortSignal.any(signaux), redirect: "error" });
    } catch (e) {
      throw echec(new ErreurDistante("indisponible", `Service de lecture distante injoignable (${(e as Error).message}).`));
    }
    if (r.status !== 206) {
      const corps = (await r.json().catch(() => ({}))) as { error?: EtatDistant; message?: string };
      const etat: EtatDistant = corps.error && ["hors-couverture", "indisponible", "source-modifiee", "budget", "refuse"].includes(corps.error) ? corps.error : "indisponible";
      throw echec(new ErreurDistante(etat, corps.message ?? `Service de lecture distante : HTTP ${r.status}.`));
    }
    const url = r.headers.get("x-source-url");
    if (url) {
      try {
        await this.surEpinglage(url, { etag: r.headers.get("x-source-etag") || null, lastModified: r.headers.get("x-source-last-modified") || null, taille: Number(r.headers.get("x-source-taille")) });
      } catch (e) {
        throw echec(e instanceof ErreurDistante ? e : new ErreurDistante("indisponible", (e as Error).message));
      }
    }
    return new ReponseService(r.status, r.headers, await r.arrayBuffer());
  }
}

/** Client geotiff direct vers l'origine (import : lecture de l'en-tête par le service terrain-import), mêmes contrôles. */
export class ClientOrigine extends BaseClient {
  epinglage: EpinglageDistant | null = null;
  premierBloc: Buffer | null = null;
  constructor(url: string, private readonly sources: readonly SourceDistanteLivree[], private readonly budget: CompteurBudget, private readonly transport?: Transport | undefined) { super(url); }
  override async request({ headers }: { headers?: Record<string, string>; signal?: AbortSignal } = {}): Promise<BaseResponse> {
    const p = lirePlage(headers?.["Range"] ?? headers?.["range"]);
    if (!p) throw new ErreurDistante("refuse", "Plage attendue.");
    const r = await lirePlageOrigine(this.sources, this.url, p.debut, p.fin, { budget: this.budget, transport: this.transport });
    if (this.epinglage && !memeSource(this.epinglage, r.epinglage)) throw new ErreurDistante("source-modifiee", "La source distante a changé pendant la lecture de l'en-tête.");
    this.epinglage = r.epinglage;
    if (p.debut === 0 && !this.premierBloc) this.premierBloc = r.octets;
    const h = new Headers({ "content-range": `bytes ${p.debut}-${p.debut + r.octets.length - 1}/${r.total}` });
    const ab = r.octets.buffer.slice(r.octets.byteOffset, r.octets.byteOffset + r.octets.length) as ArrayBuffer;
    return new ReponseService(206, h, ab);
  }
}
