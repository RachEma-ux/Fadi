/**
 * Versions, variantes, publications et verrous (lot 7, Architecture V4 §4.7) — panneau de droite.
 *
 * - Versions nommées : créer (révision courante), comparer à l'état courant (ajoutés, modifiés, supprimés ; mise en
 *   évidence en 3D), restaurer (une nouvelle révision, l'historique reste), publier ;
 * - Variantes : créer (projet bifurqué), et depuis une variante : comparer au point de bifurcation, essai de fusion
 *   (objets affectés, conflits, rejeu à blanc), fusion explicite (« la variante prévaut » seulement si l'utilisateur
 *   le choisit) ;
 * - Publications : version figée, documents figés (téléchargeables), écarts de catalogues, restauration ;
 * - Verrous fins : la sélection ou le niveau actif réservés à son compte, levés à la main ou à l'échéance.
 * Aucune action n'écrit le modèle hors du service de commandes (le serveur rejoue, valide et journalise).
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import type { DifferenceModeles, ModeleAtelier } from "@parcours/atelier-model";
import { api, ApiError, type AtelierFusionEssai } from "../../../../lib/api";
import type { AtelierClient } from "../../bus/atelier-client";
import { etatUi } from "../etat-ui";

export interface PropsVersions {
  projectId: string;
  client: AtelierClient;
  etat: ModeleAtelier;
  revision: number;
  selection: string[];
  niveauId: string | null;
  readOnly: boolean;
  /** Libellé de l'état passé affiché, s'il y en a un. */
  consultation?: string | null;
  onConsulter?: (libelle: string, etat: ModeleAtelier) => void;
}

/** Message lisible d'un refus du serveur (message, détail, conflits). */
export function messageErreur(err: unknown): string {
  if (err instanceof ApiError) {
    const b = (err.body ?? {}) as { message?: string; details?: { message?: string }[]; conflits?: { objetId?: string; motif?: string }[] };
    return b.message ?? b.details?.[0]?.message ?? (b.conflits?.length ? `Conflit : ${b.conflits.map((c) => c.objetId ?? c.motif).join(", ")}` : null) ?? err.serverMessage ?? `Refusé (${err.status})`;
  }
  return err instanceof Error ? err.message : String(err);
}

const date = (iso: string) => new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });

function ResumeDifference({ d, etat, libelle }: { d: DifferenceModeles; etat: ModeleAtelier; libelle: string }) {
  if (d.identiques) return <p className="ver-diff" data-diff="identique">{libelle} : identique à l'état courant.</p>;
  const presents = [...d.ajoutes, ...d.modifies].map((o) => o.id).filter((id) => etat.objets[id]);
  return (
    <div className="ver-diff" data-diff="differences">
      <p>
        {libelle} → état courant : <strong>{d.ajoutes.length}</strong> ajouté(s), <strong>{d.modifies.length}</strong> modifié(s), <strong>{d.supprimes.length}</strong> supprimé(s)
        {d.niveaux.ajoutes.length + d.niveaux.supprimes.length + d.niveaux.modifies.length > 0 && <> · niveaux : {d.niveaux.ajoutes.length + d.niveaux.supprimes.length + d.niveaux.modifies.length}</>}
        {d.site && <> · site modifié</>}
      </p>
      {d.modifies.length > 0 && (
        <details>
          <summary>Modifiés</summary>
          <ul>
            {d.modifies.slice(0, 50).map((o) => (
              <li key={o.id}>
                {o.id} <span className="nav-detail">{o.classe} · {o.champs.join(", ")}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      {d.supprimes.length > 0 && (
        <details>
          <summary>Supprimés</summary>
          <ul>
            {d.supprimes.slice(0, 50).map((o) => (
              <li key={o.id}>
                {o.id} <span className="nav-detail">{o.classe}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      {presents.length > 0 && (
        <button type="button" className="ver-evidence" onClick={() => { etatUi.selectionner(presents); etatUi.set({ mode: "3d" }); }}>
          Mettre en évidence en 3D ({presents.length})
        </button>
      )}
    </div>
  );
}

export function Versions({ projectId, client, etat, revision, selection, niveauId, readOnly, onConsulter }: PropsVersions) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [nomVersion, setNomVersion] = useState("");
  const [nomVariante, setNomVariante] = useState("");
  const [nomPublication, setNomPublication] = useState("");
  const [comparaison, setComparaison] = useState<{ libelle: string; d: DifferenceModeles } | null>(null);
  const [fusion, setFusion] = useState<AtelierFusionEssai | null>(null);
  const [publicationOuverte, setPublicationOuverte] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);

  const versions = useQuery({ queryKey: ["atelier-versions", projectId, revision], queryFn: () => api.getAtelierVersions(projectId), retry: false });
  const variantes = useQuery({ queryKey: ["atelier-variantes", projectId, revision], queryFn: () => api.getAtelierVariantes(projectId), retry: false });
  const publications = useQuery({ queryKey: ["atelier-publications", projectId, revision], queryFn: () => api.getAtelierPublications(projectId), retry: false });
  const verrous = useQuery({ queryKey: ["atelier-verrous", projectId, revision], queryFn: () => api.getAtelierVerrous(projectId), retry: false, refetchInterval: 60_000 });
  const detailPublication = useQuery({ queryKey: ["atelier-publication", projectId, publicationOuverte], queryFn: () => api.getAtelierPublication(projectId, publicationOuverte!), enabled: !!publicationOuverte, retry: false });

  const rafraichir = () => {
    for (const k of ["atelier-versions", "atelier-variantes", "atelier-publications", "atelier-verrous"]) void qc.invalidateQueries({ queryKey: [k, projectId] });
  };
  /** Les lots locaux partent d'abord : une action du serveur s'applique à la révision qu'on voit. */
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
      rafraichir();
    } catch (err) {
      setErreur(messageErreur(err));
    } finally {
      setOccupe(false);
    }
  };
  const requestId = () => `ui-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  const tronc = variantes.data?.tronc ?? null;

  return (
    <section className="versions" aria-label="Versions, variantes et publications">
      <h3>Versions</h3>
      {erreur && <p className="ver-erreur" role="alert">{erreur}</p>}
      {info && <p className="ver-info" role="status">{info}</p>}

      {!readOnly && (
        <form
          className="ver-form"
          onSubmit={(e) => {
            e.preventDefault();
            const nom = nomVersion.trim();
            if (!nom) return;
            void agir(async () => {
              const r = await synchroniser();
              const v = await api.postAtelierVersion(projectId, { nom, revision: r });
              setNomVersion("");
              return `Version « ${v.nom} » enregistrée (révision ${v.revision}).`;
            });
          }}
        >
          <label htmlFor="ver-nom">Nouvelle version (révision {revision})</label>
          <span className="ver-ligne">
            <input id="ver-nom" value={nomVersion} maxLength={120} placeholder="Nom de la version" onChange={(e) => setNomVersion(e.target.value)} />
            <button type="submit" disabled={occupe || !nomVersion.trim()}>Enregistrer</button>
          </span>
        </form>
      )}
      {versions.isLoading ? (
        <p className="nav-vide">Chargement des versions…</p>
      ) : versions.isError ? (
        <p className="ver-erreur">Versions indisponibles (hors ligne ?).</p>
      ) : !versions.data?.versions.length ? (
        <p className="nav-vide">Aucune version nommée : chaque lot reste une révision du journal.</p>
      ) : (
        <ul className="ver-liste" aria-label="Versions nommées">
          {versions.data.versions.map((v) => (
            <li key={v.id} data-version={v.id}>
              <span className="ver-nom">{v.nom}</span> <span className="nav-detail">r{v.revision} · {date(v.createdAt)}{v.auteur ? ` · ${v.auteur}` : ""}</span>
              <span className="ver-actions">
                <button type="button" disabled={occupe} onClick={() => void agir(async () => { const c = await api.comparerAtelier(projectId, `v:${v.id}`); setComparaison({ libelle: `« ${v.nom} »`, d: c.difference }); })}>Comparer</button>
                {onConsulter && (
                  <button type="button" disabled={occupe} onClick={() => void agir(async () => { const d = await api.getAtelierVersion(projectId, v.id); onConsulter(`version « ${v.nom} » (r${v.revision})`, d.modele); })}>
                    Consulter
                  </button>
                )}
                {!readOnly && (
                  <button
                    type="button"
                    disabled={occupe}
                    onClick={() => {
                      if (!window.confirm(`Ramener le modèle à la version « ${v.nom} » ? Une nouvelle révision est créée ; l'historique reste.`)) return;
                      void agir(async () => {
                        const base = await synchroniser();
                        const r = await api.restaurerAtelierVersion(projectId, v.id, { requestId: requestId(), baseRevision: base });
                        await client.relireServeur(r.revision);
                        return r.inchange ? "Le modèle est déjà identique à cette version." : `Version « ${v.nom} » restaurée (révision ${r.revision}).`;
                      });
                    }}
                  >
                    Restaurer
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      {comparaison && <ResumeDifference d={comparaison.d} etat={etat} libelle={comparaison.libelle} />}

      <h3>Variantes</h3>
      {tronc ? (
        <div className="ver-tronc" data-variante={tronc.statut}>
          <p>
            Variante « {tronc.nom} » de {tronc.accessible ? <button type="button" className="lien" onClick={() => navigate(`/projets/${tronc.id}?module=atelier`)}>{tronc.name ?? "son tronc"}</button> : "un projet auquel vous n'avez plus accès"} (révision {tronc.forkRevision}) · {tronc.statut === "fusionnee" ? `fusionnée (révision ${tronc.fusionRevision} du tronc)` : "ouverte"}
          </p>
          <span className="ver-actions">
            <button type="button" disabled={occupe} onClick={() => void agir(async () => { const c = await api.comparerAtelier(projectId, `r:${tronc.baseRevision}`); setComparaison({ libelle: "Point de bifurcation", d: c.difference }); })}>Comparer au tronc</button>
            {tronc.accessible && (
              <button type="button" disabled={occupe} onClick={() => void agir(async () => { await synchroniser(); setFusion(await api.getAtelierFusion(tronc.id, projectId)); })}>{tronc.statut === "fusionnee" ? "Préparer une nouvelle fusion" : "Préparer la fusion"}</button>
            )}
          </span>
          {fusion && (
            <div className="ver-fusion" data-conflits={fusion.conflits.length}>
              <p>
                {fusion.lots.length} lot(s) à rejouer sur le tronc (révision {fusion.tronc.revision}, {fusion.tronc.lotsDepuisBifurcation} lot(s) du tronc depuis {fusion.tronc.depuis === "derniere-fusion" ? "la dernière fusion" : "la bifurcation"}{fusion.dejaFusionnes ? ` ; ${fusion.dejaFusionnes} lot(s) déjà fusionné(s)` : ""}) : {fusion.affectes.crees.length} création(s), {fusion.affectes.modifies.length} modification(s), {fusion.affectes.supprimes.length} suppression(s).
              </p>
              {!fusion.rejeu.ok && <p className="ver-erreur">Rejeu impossible : « {fusion.rejeu.lot} » — {fusion.rejeu.message}</p>}
              {fusion.conflits.length > 0 && (
                <>
                  <p className="ver-erreur">{fusion.conflits.length} conflit(s) : objet modifié dans le tronc et dans la variante.</p>
                  <ul className="ver-conflits">
                    {fusion.conflits.map((c) => (
                      <li key={c.objetId}>
                        {c.objetId} <span className="nav-detail">tronc : « {c.tronc.label} » r{c.tronc.revision} · variante : « {c.variante.label} »</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <button type="button" className="ver-evidence" onClick={() => { etatUi.selectionner([...fusion.affectes.crees, ...fusion.affectes.modifies].filter((id) => etat.objets[id])); etatUi.set({ mode: "3d" }); }}>
                Mettre en évidence en 3D
              </button>
              {!readOnly && fusion.rejeu.ok && fusion.lots.length > 0 && (
                <button
                  type="button"
                  className="primaire"
                  disabled={occupe}
                  onClick={() => {
                    if (fusion.conflits.length && !window.confirm(`${fusion.conflits.length} conflit(s) : la version de la variante remplacera celle du tronc pour ces objets. Continuer ?`)) return;
                    void agir(async () => {
                      const r = await api.postAtelierFusion(tronc.id, projectId, { baseRevision: fusion.tronc.revision, strategie: fusion.conflits.length ? "variante-prioritaire" : "refuser-conflits" });
                      setFusion(null);
                      return `Variante fusionnée dans le tronc (${r.lots} lot(s), révision ${r.revision}).`;
                    });
                  }}
                >
                  {fusion.conflits.length ? "Fusionner (la variante prévaut)" : "Fusionner dans le tronc"}
                </button>
              )}
            </div>
          )}
        </div>
      ) : null}
      {!readOnly && (
        <form
          className="ver-form"
          onSubmit={(e) => {
            e.preventDefault();
            const nom = nomVariante.trim();
            if (!nom) return;
            void agir(async () => {
              await synchroniser();
              const v = await api.postAtelierVariante(projectId, nom);
              setNomVariante("");
              navigate(`/projets/${v.id}?module=atelier`, { state: { notice: `Variante « ${nom} » créée depuis la révision ${v.forkRevision}.` } });
            });
          }}
        >
          <label htmlFor="var-nom">Nouvelle variante (bifurcation à la révision {revision})</label>
          <span className="ver-ligne">
            <input id="var-nom" value={nomVariante} maxLength={80} placeholder="Nom de la variante" onChange={(e) => setNomVariante(e.target.value)} />
            <button type="submit" disabled={occupe || !nomVariante.trim()}>Créer</button>
          </span>
        </form>
      )}
      {!!variantes.data?.variantes.length && (
        <ul className="ver-liste" aria-label="Variantes de ce projet">
          {variantes.data.variantes.map((v) => (
            <li key={v.id} data-variante-id={v.id}>
              <button type="button" className="lien" onClick={() => navigate(`/projets/${v.id}?module=atelier`)}>{v.nom}</button>{" "}
              <span className="nav-detail">depuis r{v.forkRevision} · {v.modifications} lot(s) · {v.statut === "fusionnee" ? `fusionnée en r${v.fusionRevision}` : "ouverte"}</span>
            </li>
          ))}
        </ul>
      )}

      <h3>Publications</h3>
      {!readOnly && (
        <form
          className="ver-form"
          onSubmit={(e) => {
            e.preventDefault();
            const nom = nomPublication.trim();
            if (!nom) return;
            void agir(async () => {
              await synchroniser();
              const p = await api.postAtelierPublication(projectId, { nom });
              setNomPublication("");
              setPublicationOuverte(p.id);
              return `Publication « ${p.nom} » figée : révision ${p.revision}, ${p.documents.length} document(s).`;
            });
          }}
        >
          <label htmlFor="pub-nom">Publier l'état courant</label>
          <span className="ver-ligne">
            <input id="pub-nom" value={nomPublication} maxLength={120} placeholder="Nom de la publication" onChange={(e) => setNomPublication(e.target.value)} />
            <button type="submit" disabled={occupe || !nomPublication.trim()}>Publier</button>
          </span>
        </form>
      )}
      {!publications.data?.publications.length ? (
        <p className="nav-vide">Aucune publication.</p>
      ) : (
        <ul className="ver-liste" aria-label="Publications">
          {publications.data.publications.map((p) => (
            <li key={p.id} data-publication={p.id}>
              <button type="button" className="lien" aria-expanded={publicationOuverte === p.id} onClick={() => setPublicationOuverte(publicationOuverte === p.id ? null : p.id)}>{p.nom}</button>{" "}
              <span className="nav-detail">r{p.revision} · {p.documents} document(s) · {date(p.createdAt)}</span>
              {publicationOuverte === p.id && detailPublication.data && (
                <div className="ver-publication">
                  <p className="nav-detail">Version « {detailPublication.data.version.nom} » · empreinte {detailPublication.data.empreinte}</p>
                  {detailPublication.data.ecarts.length > 0 ? (
                    <p className="ver-erreur">Catalogues changés depuis : {detailPublication.data.ecarts.map((e) => `${e.catalogue} ${e.publie} → ${e.actuel}`).join(" ; ")}</p>
                  ) : (
                    <p className="nav-detail">Catalogues de règles inchangés depuis la publication.</p>
                  )}
                  <ul>
                    {detailPublication.data.documents.map((d) => (
                      <li key={d.volumeId + d.kind}>
                        <a href={`${detailPublication.data.base}/${d.volumeId}`} download={d.fileName}>{d.label}</a>
                      </li>
                    ))}
                  </ul>
                  {!readOnly && (
                    <button
                      type="button"
                      disabled={occupe}
                      onClick={() => {
                        if (!window.confirm(`Ramener le modèle à la publication « ${p.nom} » ? Une nouvelle révision est créée.`)) return;
                        void agir(async () => {
                          const base = await synchroniser();
                          const r = await api.restaurerAtelierPublication(projectId, p.id, { requestId: requestId(), baseRevision: base });
                          await client.relireServeur(r.revision);
                          return r.inchange ? "Le modèle est déjà celui de la publication." : `Publication « ${p.nom} » restaurée (révision ${r.revision}).`;
                        });
                      }}
                    >
                      Restaurer cette publication
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <h3>Verrous</h3>
      {!readOnly && (
        <span className="ver-actions">
          <button type="button" disabled={occupe || !selection.length} onClick={() => void agir(async () => { const r = await api.postAtelierVerrous(projectId, { cles: selection, minutes: 30 }); return `${r.cles.length} objet(s) verrouillé(s) jusqu'à ${date(r.expiresAt)}.`; })}>
            Verrouiller la sélection (30 min)
          </button>
          <button type="button" disabled={occupe || !niveauId} onClick={() => void agir(async () => { const r = await api.postAtelierVerrous(projectId, { cles: [`niveau:${niveauId}`], minutes: 30 }); return `Niveau verrouillé jusqu'à ${date(r.expiresAt)}.`; })}>
            Verrouiller le niveau
          </button>
        </span>
      )}
      {!verrous.data?.verrous.length ? (
        <p className="nav-vide">Aucun verrou en cours.</p>
      ) : (
        <ul className="ver-liste" aria-label="Verrous en cours">
          {verrous.data.verrous.map((v) => {
            const niveau = v.cle.startsWith("niveau:") ? etat.niveaux[v.cle.slice(7)] : undefined;
            return (
              <li key={v.cle} data-verrou={v.cle}>
                {niveau ? `Niveau ${niveau.nom}` : v.cle} <span className="nav-detail">{v.moi ? "vous" : v.auteur} · jusqu'à {date(v.expiresAt)}{v.motif ? ` · ${v.motif}` : ""}</span>
                {!readOnly && v.moi && <button type="button" onClick={() => void agir(async () => { await api.deleteAtelierVerrou(projectId, v.cle); return "Verrou levé."; })}>Lever</button>}
                {!readOnly && v.moi && (
                  <form className="ver-transmettre" onSubmit={(e) => { e.preventDefault(); const champ = e.currentTarget.elements.namedItem("email") as HTMLInputElement; const email = champ.value.trim(); if (email) void agir(async () => { const r = await api.transfererAtelierVerrou(projectId, v.cle, email); champ.value = ""; return `Verrou transmis à ${r.auteur}.`; }); }}>
                    <input name="email" type="email" aria-label={`Transmettre le verrou ${v.cle} à (courriel)`} placeholder="Transmettre à…" onKeyDown={(e) => e.stopPropagation()} data-verrou-transmettre={v.cle} />
                    <button type="submit">Transmettre</button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
