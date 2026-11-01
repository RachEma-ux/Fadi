/**
 * Module Documents — le catalogue de ce que le projet produit depuis sa
 * révision courante (rapports Harmonie, bilan du bâtiment conçu, plans de
 * lecture, tableaux, fiches, archive), avec pour chaque document sa
 * dernière production et son actualité : à jour quand la révision du modèle
 * et l'empreinte de ses entrées n'ont pas changé depuis, périmé sinon.
 * Les fichiers sont régénérés à la demande par le serveur ; le téléchargement
 * enregistre la production.
 */
import { CommunicationPanel } from "../collaboration/communication/CommunicationPanel";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { api, type DocumentDescriptor, type DocumentsView, type StudioDossierDocument, type StudioPackageDocument } from "../../lib/api";
import { LOCALE } from "../../lib/i18n";
import { libelleErreurDossier } from "../../lib/studio-dossier-erreurs";

const GROUPS: { id: DocumentDescriptor["group"]; title: string; note: string }[] = [
  { id: "harmonie", title: "Rapports Harmonie", note: "Documents HTML autonomes des choix par étape (feuille du prototype), produits depuis l'état courant des propositions et des arbitrages." },
  { id: "bilan", title: "Bilan du bâtiment conçu et plans de lecture", note: "Bilan HTML et plans SVG par niveau, produits depuis le modèle courant, la parcelle et le géoréférencement." },
  { id: "atelier", title: "Vues, feuilles, quantités et maquette IFC de l'Atelier", note: "Plans, coupes, façades, plans de masse et détails définis dans l'Atelier, leurs feuilles, les tableaux de quantités et la maquette IFC 4.3 : produits par le serveur depuis le modèle à la révision courante (PDF, DXF, SVG, CSV, IFC), chacun avec la révision et l'empreinte de ses entrées — à jour tant que le modèle n'a pas changé, périmés après une commande (l'Atelier distingue, vue par vue, si le dessin lui-même a changé)." },
  { id: "dessins", title: "Exports de travail de l'Atelier", note: "Fichiers DXF, SVG, PNG, CSV et JSON exportés depuis la barre de l'Atelier, enregistrés ici au moment de l'export avec leur niveau, leur vue et la révision du modèle : à jour tant que le modèle n'a pas changé, périmés ensuite (le fichier reste tel quel)." },
  { id: "tableaux", title: "Tableaux", note: "Surfaces mesurées par niveau et par zone, programme appliqué, fiches de l'exemple — en CSV (séparateur « ; »)." },
  { id: "exemple", title: "Exemple résolu", note: "Dossier complet de l'exemple P.118 (`fullReport` du prototype) : critères, complétude et transmission, réponses des 21 étapes, budget, bilan du bâtiment dessiné, registre des hypothèses — un seul HTML imprimable, produit sur l'état courant du projet." },
  { id: "archive", title: "Archive", note: "Sauvegarde complète du projet, réimportable (« Importer projet JSON »)." },
];

function Freshness({ d }: { d: DocumentDescriptor }) {
  if (!d.produced) return <span className="h7-chip">Non produit</span>;
  if (d.freshness === "a-jour") return <span className="h7-chip ok">À jour · révision {d.produced.modelRevision}</span>;
  return <span className="h7-chip warn">Périmé · produit à la révision {d.produced.modelRevision}, entrées modifiées depuis</span>;
}

function DocumentRow({ projectId, d, onProduced }: { projectId: string; d: DocumentDescriptor; onProduced: () => void }) {
  const queryClient = useQueryClient();
  const isExport = d.kind.startsWith("dessin:");
  const remove = useMutation({
    mutationFn: () => api.deleteDrawingExport(projectId, d.kind.slice("dessin:".length)),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["documents", projectId] }),
  });
  return (
    <tr data-document={d.kind} data-freshness={d.freshness ?? "aucune"}>
      <td>
        <b>{d.label}</b>
        <br />
        <small>{d.fileName}</small>
      </td>
      <td>
        <Freshness d={d} />
      </td>
      <td>
        {d.produced ? (
          <>
            {new Date(d.produced.producedAt).toLocaleString(LOCALE)}
            <br />
            <small>
              {d.produced.count} production(s) · empreinte {d.produced.inputHash}
            </small>
          </>
        ) : (
          <small>Empreinte courante {d.current.inputHash}</small>
        )}
      </td>
      <td>{d.stepNumber !== null ? <Link to={`/projets/${projectId}?module=parcours&etape=${d.stepNumber}`}>{String(d.stepNumber).padStart(2, "0")}</Link> : "—"}</td>
      <td>
        <a className="button-secondary" href={d.href} download onClick={isExport ? undefined : onProduced}>
          {isExport ? "Télécharger ↓" : "Produire ↓"}
        </a>
        {isExport && (
          <button type="button" className="button-secondary documents-remove" disabled={remove.isPending} onClick={() => remove.mutate()}>
            Retirer
          </button>
        )}
      </td>
    </tr>
  );
}

const courte = (hash: string) => hash.slice(0, 12);

/**
 * Groupe « Studio — paquets diffusés » : paquets figés des publications Studio, en lecture seule (ils sont produits par
 * le flux de publication, jamais ici). Un paquet retiré reste listé et téléchargeable, marqué « Retiré ».
 */
/** Dossiers de conception Studio (E.3-03, E.3-06) : livrables recalculés depuis des révisions immuables, identifiés par leur empreinte. */
function StudioDossiers({ dossiers }: { dossiers: StudioDossierDocument[] }) {
  return (
    <section className="biz-card" aria-labelledby="documents-studio-dossiers" data-studio-dossiers={dossiers.length}>
      <h2 id="documents-studio-dossiers">Studio — dossiers de conception</h2>
      <p className="biz-sub">
        Feuilles composées dans l'ordre du dossier, métré (brut, déductions et net séparés) et rapport de fidélité, produits à la demande depuis les révisions enregistrées qu'ils citent. L'empreinte SHA-256
        identifie le dossier assemblé : une feuille réépinglée sur une autre révision la change.
      </p>
      <div className="table-scroll" tabIndex={0}>
        <table className="programme-table studio-packages-table">
          <thead>
            <tr>
              <th>Dossier</th>
              <th>Sources</th>
              <th>Empreinte</th>
              <th>Fichiers</th>
            </tr>
          </thead>
          <tbody>
            {dossiers.map((d) => (
              <tr key={d.kind} data-studio-dossier-document={d.dossierId} data-dossier-hash={d.hash ?? ""}>
                <td>
                  <b translate="no">{d.title}</b>
                  <br />
                  <small>
                    Étude <span translate="no">{d.studyName}</span>{` · ${d.sheetCount} feuille(s)`}
                  </small>
                </td>
                <td>
                  {d.sources.map((s) => (
                    <small key={`${s.variantId}:${s.revisionId}`} translate="no">
                      {`${s.variantName ?? "non évalué"} · ${s.revisionShort}`}
                      <br />
                    </small>
                  ))}
                </td>
                <td>
                  {d.hash ? <code translate="no" title={d.hash}>{courte(d.hash)}</code> : <span className="h7-chip warn" data-studio-dossier-erreur={d.error ?? ""}>{libelleErreurDossier(d.error)}</span>}
                </td>
                <td>
                  {d.files.map((f) => (
                    <span key={f.format} className="studio-package-file">
                      <a className="button-secondary" href={f.href} download data-studio-dossier-file={f.format} translate="no">
                        {f.format.toUpperCase()} ↓
                      </a>{" "}
                    </span>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function StudioPackages({ packages }: { packages: StudioPackageDocument[] }) {
  return (
    <section className="biz-card" aria-labelledby="documents-studio" data-studio-packages={packages.length}>
      <h2 id="documents-studio">Studio — paquets diffusés</h2>
      <p className="biz-sub">
        Paquets figés des publications Studio (SVG, DXF, IFC et feuille PDF), produits à la diffusion d'une révision approuvée et vérifiés par leurs empreintes SHA-256. Lecture seule : un paquet retiré reste
        consultable, il n'est jamais supprimé.
      </p>
      <div className="table-scroll" tabIndex={0}>
        <table className="programme-table studio-packages-table">
          <thead>
            <tr>
              <th>Paquet</th>
              <th>Statut</th>
              <th>Diffusion</th>
              <th>Empreintes</th>
              <th>Fichiers</th>
            </tr>
          </thead>
          <tbody>
            {packages.map((p) => (
              <tr key={p.kind} data-studio-package={p.publicationId} data-status={p.status} data-package-hash={p.packageHash} data-contenu={p.contenu ?? "complet"}>
                <td>
                  <b translate="no">{p.title}</b>
                  {p.contenu === "dessin-2d" && <> <span className="h7-chip" data-studio-package-dessin2d>Dessin 2D indépendant</span></>}
                  <br />
                  <small>
                    Étude <span translate="no">{p.studyName}</span> · variante <span translate="no">{p.variantName}</span> · révision <code translate="no">{p.revisionShort}</code>
                  </small>
                </td>
                <td>
                  {p.status === "retire" ? <span className="h7-chip warn">Retiré</span> : <span className="h7-chip ok">Diffusé</span>}
                  <br />
                  <small>{p.freshness === "a-jour" ? "Révision encore en tête de la variante" : "La variante a changé depuis"}</small>
                  {p.replacedBy && (
                    <>
                      <br />
                      <small>Remplacé par une diffusion plus récente</small>
                    </>
                  )}
                </td>
                <td>
                  {p.diffusedAt ? new Date(p.diffusedAt).toLocaleString(LOCALE) : "—"}
                  {p.diffusedBy && (
                    <>
                      <br />
                      <small translate="no">{p.diffusedBy}</small>
                    </>
                  )}
                  {p.withdrawnAt && (
                    <>
                      <br />
                      <small>Retiré le</small> <small>{new Date(p.withdrawnAt).toLocaleString(LOCALE)}</small>
                    </>
                  )}
                </td>
                <td>
                  <small>Document</small> <code translate="no" title={p.documentHash}>{courte(p.documentHash)}</code>
                  <br />
                  <small>Paquet</small> <code translate="no" title={p.packageHash}>{courte(p.packageHash)}</code>
                </td>
                <td>
                  {p.files.map((f) => (
                    <span key={f.format} className="studio-package-file">
                      <a className="button-secondary" href={f.href} download={f.fileName} data-studio-file={f.format} title={`${f.fileName} · SHA-256 ${f.sha256}`} translate="no">
                        {f.format.toUpperCase()} ↓
                      </a>{" "}
                    </span>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Panneau contextuel (Communication, COM) : conversations sur les documents produits du projet. */
function ConversationsDocuments({ projectId, choix }: { projectId: string; choix: { ref: string; label: string }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <details className="fold-card biz-card" data-documents-conversations open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary>Conversations sur les documents</summary>
      <div className="fold-card-body">{open && <CommunicationPanel projectId={projectId} contexte={{ type: "document", choix }} />}</div>
    </details>
  );
}

export function DocumentsModule({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["documents", projectId], queryFn: () => api.getDocuments(projectId) });
  const [stepsOpen, setStepsOpen] = useState(false);
  // Le téléchargement est pris en charge par le navigateur : la production est relue peu après.
  const onProduced = () => setTimeout(() => void queryClient.invalidateQueries({ queryKey: ["documents", projectId] }), 1500);
  if (query.isLoading) return <p role="status">Lecture des documents…</p>;
  if (!query.data) return <p role="alert">Impossible de lire les documents du projet.</p>;
  const v: DocumentsView = query.data;
  const produced = v.documents.filter((d) => d.produced);
  const stale = produced.filter((d) => d.freshness === "perime");
  return (
    <div className="documents-module">
      <section className="biz-card">
        <h2>Documents du projet</h2>
        <p className="biz-sub">
          Révision du modèle {v.modelRevision} · empreinte {v.nativeHash} · {v.documents.length} documents productibles · {produced.length} produit(s), dont {stale.length} périmé(s)
        </p>
        <p className="programme-note">
          Chaque document porte la révision du projet dont il a été produit. Il est périmé dès que ses entrées changent (modèle, parcelle, programme, réponses, arbitrages) : deux documents ne peuvent
          pas se contredire en silence.
        </p>
      </section>
      {GROUPS.map((g) => {
        const docs = v.documents.filter((d) => d.group === g.id);
        if (!docs.length) return null;
        const main = g.id === "harmonie" ? docs.filter((d) => d.stepNumber === null) : docs;
        const steps = g.id === "harmonie" ? docs.filter((d) => d.stepNumber !== null) : [];
        return (
          <section className="biz-card" key={g.id} aria-labelledby={`documents-${g.id}`}>
            <h2 id={`documents-${g.id}`}>{g.title}</h2>
            <p className="biz-sub">{g.note}</p>
            <div className="table-scroll" tabIndex={0}>
              <table className="programme-table documents-table">
                <thead>
                  <tr>
                    <th>Document</th>
                    <th>Actualité</th>
                    <th>Dernière production</th>
                    <th>Étape</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {main.map((d) => (
                    <DocumentRow key={d.kind} projectId={projectId} d={d} onProduced={onProduced} />
                  ))}
                </tbody>
              </table>
            </div>
            {steps.length > 0 && (
              <details className="fold-card documents-steps" open={stepsOpen} onToggle={(e) => setStepsOpen((e.target as HTMLDetailsElement).open)}>
                <summary>
                  {steps.length} rapports d'étape · {steps.filter((d) => d.produced).length} produit(s)
                </summary>
                <div className="fold-card-body">
                  <div className="table-scroll" tabIndex={0}>
                    <table className="programme-table documents-table">
                      <thead>
                        <tr>
                          <th>Document</th>
                          <th>Actualité</th>
                          <th>Dernière production</th>
                          <th>Étape</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {steps.map((d) => (
                          <DocumentRow key={d.kind} projectId={projectId} d={d} onProduced={onProduced} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </details>
            )}
          </section>
        );
      })}
      {(v.studioPackages?.length ?? 0) > 0 && <StudioPackages packages={v.studioPackages!} />}
      {(v.studioDossiers?.length ?? 0) > 0 && <StudioDossiers dossiers={v.studioDossiers!} />}
      {produced.length > 0 && <ConversationsDocuments projectId={projectId} choix={produced.map((d) => ({ ref: d.kind, label: d.label }))} />}
      {v.studioDossiersError && (
        <p className="h7-chip warn" role="status" data-studio-dossiers-erreur={v.studioDossiersError}>
          {`Studio — dossiers de conception : ${libelleErreurDossier(v.studioDossiersError)}`}
        </p>
      )}
    </div>
  );
}
