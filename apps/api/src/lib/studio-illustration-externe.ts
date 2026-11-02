/**
 * Fournisseur d'illustration **externe** (service d'IA tiers), livré **désactivé** (lot F, décision P-12). Tout vient de
 * l'administrateur, par l'environnement du serveur ; rien n'est inventé ni appelé par défaut :
 * - `STUDIO_ILLUSTRATION_EXTERNE_ACTIF=1`, `…_URL` (https), `…_CLE` (clé fournie par l'administrateur, jamais journalisée
 *   ni renvoyée), `…_COUT` (« 0.04 CHF » : coût par génération déclaré ; absent → désactivé), `…_NOM`, `…_VERSION`
 *   (absente → « inconnue »), `…_DROITS`, `…_QUOTAS` (absents → signalés) ;
 * - politique de transfert : `STUDIO_TRANSFERT_POLITIQUE=avec-consentement` (défaut : interdits),
 *   `STUDIO_TRANSFERT_CLASSIFICATIONS` (« publique,interne »), `STUDIO_TRANSFERT_CONTRAT`, `STUDIO_TRANSFERT_FOURNISSEURS`
 *   (« externe »).
 * Le service n'est appelé qu'après `studioControlerTransfert` (lib/studio-illustrations.ts). Contrat d'échange générique :
 * POST JSON `{ image: <PNG base64>, parametres }` → `{ image: <PNG base64>, version? }`. Le transport est remplaçable
 * (`transportExterne.fetch`) : les tests emploient un double, jamais un service réel.
 */
import type { StudioCoutDeclare, StudioPolitiqueTransfert } from "@parcours/atelier-model/studio-agents";

export interface ConfigIllustrationExterne {
  active: boolean;
  url: string | null;
  cle: string | null;
  nom: string;
  version: string | null;
  cout: StudioCoutDeclare | null;
  droits: string | null;
  quotas: string | null;
}

export const STUDIO_FOURNISSEUR_EXTERNE_ID = "externe";

function lireCout(v: string | undefined): StudioCoutDeclare | null {
  const m = /^\s*(\d+(?:\.\d+)?)\s+([A-Z]{3})\s*$/.exec(v ?? "");
  return m ? { montant: Number(m[1]), devise: m[2]! } : null;
}
const texte = (v: string | undefined) => (v && v.trim() ? v.trim() : null);

export function configIllustrationExterne(env: NodeJS.ProcessEnv = process.env): ConfigIllustrationExterne {
  const url = texte(env["STUDIO_ILLUSTRATION_EXTERNE_URL"]);
  return {
    active: env["STUDIO_ILLUSTRATION_EXTERNE_ACTIF"] === "1" && !!url && /^https:\/\//.test(url),
    url, cle: texte(env["STUDIO_ILLUSTRATION_EXTERNE_CLE"]),
    nom: texte(env["STUDIO_ILLUSTRATION_EXTERNE_NOM"]) ?? "Service externe d’illustration (IA)",
    version: texte(env["STUDIO_ILLUSTRATION_EXTERNE_VERSION"]), cout: lireCout(env["STUDIO_ILLUSTRATION_EXTERNE_COUT"]),
    droits: texte(env["STUDIO_ILLUSTRATION_EXTERNE_DROITS"]), quotas: texte(env["STUDIO_ILLUSTRATION_EXTERNE_QUOTAS"]),
  };
}

export function politiqueTransfert(env: NodeJS.ProcessEnv = process.env): StudioPolitiqueTransfert {
  const liste = (v: string | undefined) => (v ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  const classes = liste(env["STUDIO_TRANSFERT_CLASSIFICATIONS"]).filter((c): c is "publique" | "interne" | "confidentielle" => ["publique", "interne", "confidentielle"].includes(c));
  return {
    transfertsExternes: env["STUDIO_TRANSFERT_POLITIQUE"] === "avec-consentement" ? "avec-consentement" : "interdits",
    classificationsAdmises: classes, contrat: texte(env["STUDIO_TRANSFERT_CONTRAT"]), fournisseursAutorises: liste(env["STUDIO_TRANSFERT_FOURNISSEURS"]),
  };
}

/** Transport remplaçable (double de test) ; jamais appelé sans contrôle de politique accepté. */
export const transportExterne: { fetch: typeof fetch } = { fetch: (...a) => globalThis.fetch(...a) };

export class ErreurFournisseurExterne extends Error {}

export async function genererIllustrationExterne(config: ConfigIllustrationExterne, png: Buffer, parametres: Record<string, unknown>): Promise<{ png: Buffer; version: string | null }> {
  if (!config.active || !config.url || !config.cle) throw new ErreurFournisseurExterne("service externe non configuré");
  let res: Response;
  try {
    res = await transportExterne.fetch(config.url, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.cle}` },
      body: JSON.stringify({ image: png.toString("base64"), parametres }), signal: AbortSignal.timeout(60_000),
    });
  } catch { throw new ErreurFournisseurExterne("service externe injoignable"); }
  if (!res.ok) throw new ErreurFournisseurExterne(`service externe : réponse ${res.status}`);
  const corps = (await res.json().catch(() => null)) as { image?: unknown; version?: unknown } | null;
  if (!corps || typeof corps.image !== "string") throw new ErreurFournisseurExterne("service externe : image absente");
  return { png: Buffer.from(corps.image, "base64"), version: typeof corps.version === "string" && corps.version.trim() ? corps.version.trim().slice(0, 80) : null };
}
