/**
 * Automatisation et assistant (lot 8, D4, T19) — panneau de droite.
 *
 * Assistant à boucle contrôlée : une intention → proposition des règles de Fadi (aucun fournisseur de modèle de
 * langage n'est configuré) → séquence inspectable, journal des hypothèses, essais (trois au plus), aperçu des objets
 * affectés et des documents à recalculer → **rien n'est écrit** tant que l'utilisateur n'accepte pas.
 * Scripts : bibliothèque versionnée (intégrés + projet) ; paramètres typés ; essai à blanc puis exécution par les
 * mêmes commandes et les mêmes refus qu'un geste.
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ModeleAtelier, ParametreScript, ScriptAtelier } from "@parcours/atelier-model";
import { api, type AtelierProposition, type AtelierScript } from "../../../../lib/api";
import type { AtelierClient } from "../../bus/atelier-client";
import { EditeurScript } from "./EditeurScript";
import { messageErreur } from "./Versions";

export interface PropsAutomatisation {
  projectId: string;
  client: AtelierClient;
  etat: ModeleAtelier;
  revision: number;
  niveauId: string | null;
  readOnly: boolean;
}

const SUGGESTIONS = ["Feuilles et quantités", "Annoter les réserves Harmonie", "Détecter les pièces du niveau actif", "Trame de poteaux 4 x 3 tous les 6 m", "Corriger les ouvertures hors mur"];
const STATUTS: Record<AtelierProposition["statut"], string> = { proposee: "Proposée — en attente de votre accord", echouee: "Échec après les essais", incomprise: "Intention non reconnue", acceptee: "Acceptée et exécutée", refusee: "Refusée" };
const requestId = () => `ui-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

function Apercu({ effets, documents, commandes }: { effets: AtelierProposition["effets"]; documents: { kind: string; label: string }[]; commandes: { type: string; params: Record<string, unknown> }[] }) {
  return (
    <div className="auto-apercu">
      {effets && (
        <p>
          Aperçu (exécution à blanc) : <strong>{effets.crees.length}</strong> création(s), <strong>{effets.modifies.length}</strong> modification(s), <strong>{effets.supprimes.length}</strong> suppression(s)
          {effets.referencesAReparer.length > 0 && <> · {effets.referencesAReparer.length} référence(s) à réparer</>}.
        </p>
      )}
      {documents.length > 0 && (
        <details>
          <summary>{documents.length} document(s) à recalculer après exécution</summary>
          <ul>
            {documents.slice(0, 30).map((d) => (
              <li key={d.kind}>{d.label}</li>
            ))}
          </ul>
        </details>
      )}
      <details className="auto-sequence">
        <summary>Séquence de {commandes.length} commande(s)</summary>
        <ol>
          {commandes.slice(0, 200).map((c, i) => (
            <li key={i}>
              <code>{c.type}</code> <span className="nav-detail">{JSON.stringify(c.params).slice(0, 140)}</span>
            </li>
          ))}
        </ol>
      </details>
    </div>
  );
}

export function Automatisation({ projectId, client, etat, revision, niveauId, readOnly }: PropsAutomatisation) {
  const qc = useQueryClient();
  const [intention, setIntention] = useState("");
  const [proposition, setProposition] = useState<(AtelierProposition & { documentsARecalculer?: { kind: string; label: string }[] }) | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);
  const scripts = useQuery({ queryKey: ["atelier-scripts", projectId], queryFn: () => api.getAtelierScripts(projectId), retry: false });
  const tous: AtelierScript[] = useMemo(() => [...(scripts.data?.integres ?? []), ...(scripts.data?.projet ?? [])], [scripts.data]);
  const [scriptId, setScriptId] = useState("trame-poteaux");
  const script = tous.find((s) => s.id === scriptId) ?? null;
  const [valeurs, setValeurs] = useState<Record<string, string>>({});
  const [essai, setEssai] = useState<{ cle: string; commandes: { type: string; params: Record<string, unknown> }[]; effets: AtelierProposition["effets"]; documents: { kind: string; label: string }[] } | null>(null);
  const [nouveauScript, setNouveauScript] = useState("");

  const synchroniser = async () => {
    await client.demarrage;
    await client.envoyer();
    if (client.getSnapshot().lots.length) throw new Error("Des modifications ne sont pas encore enregistrées sur le serveur : synchronisez d'abord.");
    return client.getSnapshot().revisionServeur;
  };
  const agir = async (f: () => Promise<string | void>) => {
    setErreur(null);
    setInfo(null);
    setOccupe(true);
    try {
      const m = await f();
      if (m) setInfo(m);
    } catch (err) {
      setErreur(messageErreur(err));
    } finally {
      setOccupe(false);
    }
  };
  const valeurDe = (p: ParametreScript) => valeurs[p.nom] ?? (p.type === "niveau" ? (niveauId ?? "") : p.defaut !== undefined ? String(p.defaut) : "");
  const parametres = () => Object.fromEntries((script?.parametres ?? []).map((p) => [p.nom, p.type === "chaine" || p.type === "niveau" ? valeurDe(p) : valeurDe(p) === "" ? undefined : Number(valeurDe(p).replace(",", "."))]));
  const cleEssai = JSON.stringify([scriptId, script?.version, parametres(), revision]);

  return (
    <details className="automatisation">
      <summary>Automatisation et assistant</summary>
      {erreur && <p className="ver-erreur" role="alert">{erreur}</p>}
      {info && <p className="ver-info" role="status">{info}</p>}

      <h3>Assistant</h3>
      <p className="nav-detail">Aucun fournisseur de modèle de langage configuré : propositions des règles déterministes de Fadi. Rien n'est écrit sans votre accord.</p>
      <form
        className="ver-form"
        onSubmit={(e) => {
          e.preventDefault();
          const t = intention.trim();
          if (t.length < 2) return;
          void agir(async () => {
            await synchroniser();
            setProposition(await api.proposerAtelier(projectId, { intention: t, niveauId }));
          });
        }}
      >
        <label htmlFor="auto-intention">Intention</label>
        <span className="ver-ligne">
          <input id="auto-intention" value={intention} maxLength={300} placeholder="Ex. feuilles et quantités" onChange={(e) => setIntention(e.target.value)} />
          <button type="submit" disabled={occupe || readOnly || intention.trim().length < 2}>Proposer</button>
        </span>
        <span className="auto-suggestions">
          {SUGGESTIONS.map((s) => (
            <button key={s} type="button" className="lien" onClick={() => setIntention(s)}>
              {s}
            </button>
          ))}
        </span>
      </form>
      {proposition && (
        <div className="auto-proposition" data-statut={proposition.statut}>
          <p className="auto-statut">
            {STATUTS[proposition.statut]}
            {proposition.depuisCache ? " · séquence déjà validée (cache)" : ""}
          </p>
          <p>{proposition.explication}</p>
          {proposition.iterations.length > 0 && (
            <ol className="auto-iterations" aria-label="Essais">
              {proposition.iterations.map((it) => (
                <li key={it.numero}>
                  Essai {it.numero} : {it.commandes} commande(s), {it.resultat === "valide" ? "valide" : `refusé — ${it.erreur ?? ""}`}
                </li>
              ))}
            </ol>
          )}
          {proposition.hypotheses.length > 0 && (
            <div className="auto-hypotheses">
              <h4>Journal des hypothèses</h4>
              <ul>
                {proposition.hypotheses.map((h, i) => (
                  <li key={i}>
                    <strong>{h.texte}</strong> — {h.motif}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {proposition.commandes.length > 0 && <Apercu effets={proposition.effets} documents={proposition.documentsARecalculer ?? []} commandes={proposition.commandes} />}
          {proposition.statut === "proposee" && proposition.commandes.length > 0 && !readOnly && (
            <span className="ver-actions">
              <button
                type="button"
                className="primaire"
                disabled={occupe}
                onClick={() =>
                  void agir(async () => {
                    const base = await synchroniser();
                    const r = await api.accepterAtelierProposition(projectId, proposition.id, { requestId: requestId(), baseRevision: base });
                    await client.relireServeur(r.revision);
                    setProposition({ ...proposition, statut: "acceptee", revisionResultat: r.revision });
                    return `Proposition exécutée (révision ${r.revision}).`;
                  })
                }
              >
                Accepter et exécuter
              </button>
              <button type="button" disabled={occupe} onClick={() => void agir(async () => { await api.refuserAtelierProposition(projectId, proposition.id); setProposition({ ...proposition, statut: "refusee" }); return "Proposition refusée : rien n'a été écrit."; })}>
                Refuser
              </button>
            </span>
          )}
        </div>
      )}

      <h3>Scripts</h3>
      {scripts.isError ? (
        <p className="ver-erreur">Bibliothèque indisponible.</p>
      ) : (
        <>
          <label className="auto-champ">
            Script
            <select value={scriptId} onChange={(e) => { setScriptId(e.target.value); setEssai(null); }} data-script="choix">
              {tous.map((s) => (
                <option key={`${s.origine}-${s.id}`} value={s.id}>
                  {s.nom} · v{s.version}{s.origine === "projet" ? " (projet)" : ""}
                </option>
              ))}
            </select>
          </label>
          {script && (
            <form
              className="auto-script"
              onSubmit={(e) => {
                e.preventDefault();
                void agir(async () => {
                  await synchroniser();
                  const r = await api.essayerAtelierScript(projectId, script.id, { parametres: parametres(), version: script.version });
                  setEssai({ cle: cleEssai, commandes: r.commandes as { type: string; params: Record<string, unknown> }[], effets: r.effets, documents: r.documentsARecalculer });
                });
              }}
            >
              <p className="nav-detail">{script.description}</p>
              {script.parametres.map((p) => (
                <label key={p.nom} className="auto-champ" title={p.aide}>
                  {p.libelle}
                  {p.type === "niveau" ? (
                    <select value={valeurDe(p)} onChange={(e) => setValeurs({ ...valeurs, [p.nom]: e.target.value })} data-parametre={p.nom}>
                      {Object.values(etat.niveaux)
                        .sort((a, b) => a.elevation - b.elevation)
                        .map((n) => (
                          <option key={n.id} value={n.id}>
                            {n.nom}
                          </option>
                        ))}
                    </select>
                  ) : (
                    <input value={valeurDe(p)} inputMode={p.type === "chaine" ? "text" : "decimal"} onChange={(e) => setValeurs({ ...valeurs, [p.nom]: e.target.value })} data-parametre={p.nom} placeholder={p.aide ?? ""} />
                  )}
                </label>
              ))}
              <span className="ver-actions">
                <button type="submit" disabled={occupe || readOnly}>Essayer (à blanc)</button>
                <button
                  type="button"
                  className="primaire"
                  disabled={occupe || readOnly || !essai || essai.cle !== cleEssai}
                  title={!essai || essai.cle !== cleEssai ? "Essayez d'abord avec ces paramètres" : undefined}
                  onClick={() =>
                    void agir(async () => {
                      const base = await synchroniser();
                      const r = await api.executerAtelierScript(projectId, script.id, { parametres: parametres(), version: script.version, requestId: requestId(), baseRevision: base });
                      await client.relireServeur(r.revision);
                      setEssai(null);
                      void qc.invalidateQueries({ queryKey: ["atelier-problemes", projectId] });
                      return `Script « ${script.nom} » exécuté (révision ${r.revision}).`;
                    })
                  }
                >
                  Exécuter
                </button>
              </span>
            </form>
          )}
          {essai && essai.cle === cleEssai && <Apercu effets={essai.effets} documents={essai.documents} commandes={essai.commandes} />}
          {!readOnly && <EditeurScript projectId={projectId} etat={etat} scripts={tous as unknown as ScriptAtelier[]} onEnregistre={(id) => { setScriptId(id); setEssai(null); }} />}
          {!readOnly && (
            <details className="auto-nouveau">
              <summary>Ajouter un script au projet (JSON, avancé)</summary>
              <textarea aria-label="Script (JSON)" rows={6} value={nouveauScript} onChange={(e) => setNouveauScript(e.target.value)} placeholder='{ "id": "mon-script", "nom": "…", "parametres": [], "pour": [], "commandes": [] }' />
              <button
                type="button"
                disabled={occupe || !nouveauScript.trim()}
                onClick={() =>
                  void agir(async () => {
                    let brut: unknown;
                    try {
                      brut = JSON.parse(nouveauScript);
                    } catch {
                      throw new Error("JSON illisible.");
                    }
                    const s = await api.postAtelierScript(projectId, brut);
                    void qc.invalidateQueries({ queryKey: ["atelier-scripts", projectId] });
                    setNouveauScript("");
                    setScriptId(s.id);
                    return `Script « ${s.nom} » enregistré (version ${s.version}).`;
                  })
                }
              >
                Enregistrer une version
              </button>
            </details>
          )}
        </>
      )}
    </details>
  );
}
