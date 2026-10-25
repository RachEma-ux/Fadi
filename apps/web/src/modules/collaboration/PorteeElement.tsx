/**
 * Portées étroites (Issue #262, reliquat de la phase 2 ; `docs/workstreams/organisations-participation/portees-etroites.md`)
 * — attribution d'un rôle à une étude, une variante, une révision ou des documents : sélecteur de l'élément (relu des
 * routes Studio et Documents du projet) et capacité résultante, calculée par la règle pure partagée avec le serveur
 * (`capacitesDePortee`, `@parcours/domain-model`). Le serveur reste seul juge : il refuse un élément étranger au projet
 * et n'applique la capacité que dans son périmètre, à un participant qui lit déjà le projet.
 */
import { useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { capacitesDePortee, FAMILLES_DOCUMENTS, familleDocument, type CapacitePortee } from "@parcours/domain-model";
import { api } from "../../lib/api";
import { LOCALE } from "../../lib/i18n";
import type { BusinessRole, RoleScope } from "./participants-api";

export const CAPACITE_LABEL: Record<CapacitePortee, string> = {
  modifier: "modifier le contenu Studio du périmètre",
  constater: "recontrôler et rouvrir les observations du périmètre",
  approuver: "approuver ou refuser les publications Studio du périmètre",
  diffuser: "diffuser ou retirer les publications Studio du périmètre",
  telecharger: "produire et télécharger les documents désignés",
};

const FAMILLE_LABEL: Record<string, string> = {
  tableaux: "Tableaux (surfaces, programme, fiches)", atelier: "Documents de l’Atelier", dessins: "Exports de travail de l’Atelier",
  studio: "Paquets Studio diffusés", "studio-dossier": "Dossiers de conception Studio", harmonie: "Rapports Harmonie",
  bilan: "Bilan et plans de lecture", exemple: "Dossier de l’exemple",
};

export interface ElementPortee { id: string; label: string; famille?: boolean }

/** Éléments désignables du projet, par portée ; chargés seulement quand le formulaire des rôles est ouvert. */
export function useElementsPortee(projectId: string, enabled: boolean) {
  const etudes = useQuery({ queryKey: ["portees-etudes", projectId], queryFn: () => api.studioStudies(projectId, true), enabled, retry: false });
  const studies = etudes.data?.studies ?? [];
  const variantes = useQueries({
    queries: studies.map((s) => ({ queryKey: ["portees-variantes", projectId, s.id], queryFn: () => api.studioVariants(projectId, s.id, true), enabled, retry: false })),
  });
  const documents = useQuery({ queryKey: ["portees-documents", projectId], queryFn: () => api.getDocuments(projectId), enabled, retry: false });
  const variantList: (ElementPortee & { studyId: string })[] = studies.flatMap((s, i) =>
    (variantes[i]?.data?.variants ?? []).map((v) => ({ id: v.id, studyId: s.id, label: `${s.name} — ${v.name}` })));
  const d = documents.data;
  const docList: ElementPortee[] = [
    ...FAMILLES_DOCUMENTS.map((f) => ({ id: f, label: FAMILLE_LABEL[f] ?? f, famille: true })),
    ...(d?.documents ?? []).filter((x) => familleDocument(x.kind) !== null).map((x) => ({ id: x.kind, label: x.label })),
    ...(d?.studioPackages ?? []).map((x) => ({ id: x.kind, label: x.title })),
    ...(d?.studioDossiers ?? []).map((x) => ({ id: x.kind, label: x.title })),
  ];
  return {
    loading: etudes.isPending || documents.isPending,
    etude: studies.map((s) => ({ id: s.id, label: s.name })) as ElementPortee[],
    variante: variantList,
    documents: docList,
  };
}

/** Libellé d'un élément déjà attribué (nom de l'étude, de la variante, du document), sinon son identifiant. */
export function libelleElement(el: ReturnType<typeof useElementsPortee>, scope: RoleScope, id: string | null): string | null {
  if (!id) return null;
  const list = scope === "etude" ? el.etude : scope === "variante" ? el.variante : scope === "documents" ? el.documents : [];
  return list.find((x) => x.id === id)?.label ?? id;
}

/** Sélecteur de l'élément de la portée : étude, variante, révision (variante puis révision) ou documents. */
export function SelecteurElement({ projectId, scope, el, value, onChange }: {
  projectId: string; scope: Exclude<RoleScope, "projet">; el: ReturnType<typeof useElementsPortee>; value: string; onChange: (id: string) => void;
}) {
  if (scope === "revision") return <SelecteurRevision projectId={projectId} el={el} value={value} onChange={onChange} />;
  const list = scope === "etude" ? el.etude : scope === "variante" ? el.variante : el.documents;
  return (
    <label>
      Élément de la portée
      <select value={value} required onChange={(e) => onChange(e.target.value)} data-champ="element-portee">
        <option value="">{el.loading ? "Chargement…" : list.length ? "Choisir…" : "Aucun élément dans ce projet"}</option>
        {scope === "documents" ? (
          <>
            <optgroup label="Familles">
              {list.filter((x) => x.famille).map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
            </optgroup>
            <optgroup label="Documents">
              {list.filter((x) => !x.famille).map((x) => <option key={x.id} value={x.id} translate="no">{x.label}</option>)}
            </optgroup>
          </>
        ) : list.map((x) => <option key={x.id} value={x.id} translate="no">{x.label}</option>)}
      </select>
    </label>
  );
}

function SelecteurRevision({ projectId, el, value, onChange }: { projectId: string; el: ReturnType<typeof useElementsPortee>; value: string; onChange: (id: string) => void }) {
  const [chosen, setVariantId] = useState("");
  const variantId = chosen || (el.variante.length === 1 ? el.variante[0]!.id : "");
  const variant = el.variante.find((v) => v.id === variantId);
  const revisions = useQuery({
    queryKey: ["portees-revisions", projectId, variantId], enabled: !!variant, retry: false,
    queryFn: () => api.studioRevisions(projectId, variant!.studyId, variant!.id),
  });
  const list = revisions.data?.revisions ?? [];
  return (
    <>
      <label>
        Variante de la révision
        <select value={variantId} onChange={(e) => { setVariantId(e.target.value); onChange(""); }} data-champ="variante-revision">
          <option value="">{el.loading ? "Chargement…" : "Choisir…"}</option>
          {el.variante.map((x) => <option key={x.id} value={x.id} translate="no">{x.label}</option>)}
        </select>
      </label>
      <label>
        Élément de la portée
        <select value={value} required disabled={!variant} onChange={(e) => onChange(e.target.value)} data-champ="element-portee">
          <option value="">{variant ? "Choisir…" : "Choisissez d’abord la variante"}</option>
          {list.map((r, i) => <option key={r.id} value={r.id} translate="no">{`R${String(list.length - i).padStart(2, "0")} · ${new Date(r.createdAt).toLocaleString(LOCALE)}`}</option>)}
        </select>
      </label>
    </>
  );
}

/**
 * Capacité résultante d'une attribution : ce que le rôle ajoute à cette portée (ou ce que donne un rôle de projet), et
 * la règle directrice — une portée étroite n'ouvre jamais le projet.
 */
export function CapaciteResultante({ role, scope, lit }: { role: BusinessRole; scope: RoleScope; lit: boolean }) {
  if (scope === "projet") return null;
  const caps = capacitesDePortee(role, scope);
  return (
    <div className="wide" role="status" aria-live="polite" data-capacite-resultante={caps.join(",") || "aucune"}>
      {caps.length
        ? <p>{`Capacité ajoutée : ${caps.map((c) => CAPACITE_LABEL[c]).join(" ; ")}.`}</p>
        : <p>Aucune capacité ajoutée : ce rôle n’a pas d’effet à cette portée.</p>}
      <p className="h7-muted">Une portée étroite n’ouvre jamais le projet : elle ajoute une capacité, dans son seul périmètre, à une personne qui lit déjà le projet par un rôle de portée Projet.</p>
      {!lit && <p className="h7-error">Cette personne ne lit pas le projet : l’attribution resterait sans effet.</p>}
    </div>
  );
}

/** Résumé court d'une attribution existante (« ajoute : … ») pour les listes de rôles. */
export function resumeCapacite(role: BusinessRole, scope: RoleScope): string | null {
  if (scope === "projet") return null;
  const caps = capacitesDePortee(role, scope);
  return caps.length ? `ajoute : ${caps.map((c) => CAPACITE_LABEL[c]).join(" ; ")}` : "sans effet à cette portée";
}
