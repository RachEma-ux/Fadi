/**
 * Module Documents — le catalogue de ce que le projet produit depuis sa
 * révision courante (rapports Harmonie, bilan du bâtiment conçu, plans de
 * lecture, tableaux, fiches, archive), avec pour chaque document sa
 * dernière production et son actualité : à jour quand la révision du modèle
 * et l'empreinte de ses entrées n'ont pas changé depuis, périmé sinon.
 * Les fichiers sont régénérés à la demande par le serveur ; le téléchargement
 * enregistre la production.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { api, type DocumentDescriptor, type DocumentsView } from "../../lib/api";

const GROUPS: { id: DocumentDescriptor["group"]; title: string; note: string }[] = [
  { id: "harmonie", title: "Rapports Harmonie", note: "Documents HTML autonomes des choix par étape (feuille du prototype), produits depuis l'état courant des propositions et des arbitrages." },
  { id: "bilan", title: "Bilan du bâtiment conçu et plans de lecture", note: "Bilan HTML et plans SVG par niveau, produits depuis le modèle courant, la parcelle et le géoréférencement." },
  { id: "tableaux", title: "Tableaux", note: "Surfaces mesurées par niveau et par zone, programme appliqué, fiches de l'exemple — en CSV (séparateur « ; »)." },
  { id: "archive", title: "Archive", note: "Sauvegarde complète du projet, réimportable (« Importer projet JSON »)." },
];

function Freshness({ d }: { d: DocumentDescriptor }) {
  if (!d.produced) return <span className="h7-chip">Non produit</span>;
  if (d.freshness === "a-jour") return <span className="h7-chip ok">À jour · révision {d.produced.modelRevision}</span>;
  return <span className="h7-chip warn">Périmé · produit à la révision {d.produced.modelRevision}, entrées modifiées depuis</span>;
}

function DocumentRow({ projectId, d, onProduced }: { projectId: string; d: DocumentDescriptor; onProduced: () => void }) {
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
            {new Date(d.produced.producedAt).toLocaleString("fr-FR")}
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
        <a className="button-secondary" href={d.href} download onClick={onProduced}>
          Produire ↓
        </a>
      </td>
    </tr>
  );
}

export function DocumentsModule({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["documents", projectId], queryFn: () => api.getDocuments(projectId) });
  const [stepsOpen, setStepsOpen] = useState(false);
  // Le téléchargement est pris en charge par le navigateur : la production est relue peu après.
  const onProduced = () => setTimeout(() => void queryClient.invalidateQueries({ queryKey: ["documents", projectId] }), 1500);
  if (query.isLoading) return <p role="status">Lecture des documents…</p>;
  if (query.isError || !query.data) return <p role="alert">Impossible de lire les documents du projet.</p>;
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
            <div className="table-scroll">
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
                  <div className="table-scroll">
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
    </div>
  );
}
