/**
 * Réutilisation de modèle (DA-21-09) : reprendre dans ce projet, depuis un autre projet lisible (ou une de ses
 * versions nommées), les familles d'objets choisies. Aperçu d'abord (rien n'est écrit), puis reprise en une révision ;
 * rien du site, des hypothèses, des sources ni de la structure n'est repris sans être coché.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { RapportReprise } from "@parcours/atelier-model";
import { api, type RepriseDemande } from "../../../../lib/api";
import type { AtelierClient } from "../../bus/atelier-client";
import { messageErreur } from "./Versions";

const FAMILLES: [RepriseDemande["options"]["familles"][number], string][] = [
  ["architecture", "Architecture (murs, ouvertures, dalles, toitures, escaliers, poteaux, garde-corps)"],
  ["espaces", "Pièces, espaces, zones"],
  ["dessin", "Dessin et annotations (esquisses, cotes, textes, solides, blocs, objets importés)"],
  ["documents", "Vues et feuilles"],
  ["definitions", "Bibliothèque de définitions (types, blocs, composants, même sans occurrence)"],
];

export function Reprise({ projectId, client, readOnly }: { projectId: string; client: AtelierClient; readOnly: boolean }) {
  const [ouvert, setOuvert] = useState(false);
  const projets = useQuery({ queryKey: ["projects"], queryFn: () => api.listProjects(), enabled: ouvert, retry: false });
  const [sourceId, setSourceId] = useState("");
  const versions = useQuery({ queryKey: ["atelier-versions-source", sourceId], queryFn: () => api.getAtelierVersions(sourceId), enabled: !!sourceId, retry: false });
  const [versionId, setVersionId] = useState("");
  const [familles, setFamilles] = useState<Set<string>>(new Set(["architecture"]));
  const [donnees, setDonnees] = useState({ site: false, hypotheses: false, sources: false, structure: false });
  const [homonymes, setHomonymes] = useState<"reutiliser" | "renommer">("reutiliser");
  const [apercu, setApercu] = useState<{ rapport: RapportReprise; vide: boolean; ajouts: Record<string, number>; cle: string } | null>(null);
  const [message, setMessage] = useState<{ texte: string; erreur: boolean } | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [zone, setZone] = useState({ active: false, min: "", max: "" });
  const [bibliotheque, setBibliotheque] = useState("");
  const lireXY = (t: string) => {
    const [x, y] = t.split(";").map((v) => Number(v.trim().replace(",", ".")));
    return Number.isFinite(x) && Number.isFinite(y) && t.includes(";") ? { x: x!, y: y! } : null;
  };
  const zoneLue = zone.active ? (() => { const a = lireXY(zone.min); const b = lireXY(zone.max); return a && b ? { min: { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) }, max: { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y) } } : null; })() : null;
  const demande = (): RepriseDemande => ({ source: { projectId: sourceId, ...(versionId ? { versionId } : {}) }, options: { familles: [...familles] as RepriseDemande["options"]["familles"], ...donnees, homonymes, ...(zoneLue ? { zone: zoneLue } : {}), ...(familles.has("definitions") && bibliotheque.trim() ? { bibliotheque: bibliotheque.trim() } : {}) } });
  const cle = JSON.stringify(demande());
  const agir = async (f: () => Promise<string | void>) => {
    setMessage(null);
    setOccupe(true);
    try {
      const m = await f();
      if (m) setMessage({ texte: m, erreur: false });
    } catch (err) {
      setMessage({ texte: messageErreur(err), erreur: true });
    } finally {
      setOccupe(false);
    }
  };
  if (readOnly) return null;
  return (
    <details className="reprise" onToggle={(e) => setOuvert(e.currentTarget.open)}>
      <summary>Reprendre d'un autre projet</summary>
      <label className="auto-champ">
        Projet source
        <select value={sourceId} onChange={(e) => { setSourceId(e.target.value); setVersionId(""); setApercu(null); }} data-reprise="source">
          <option value="">—</option>
          {(projets.data ?? []).filter((p) => p.id !== projectId).map((p) => (
            <option key={p.id} value={p.id}>
              {p.code} — {p.name}
            </option>
          ))}
        </select>
      </label>
      {!!versions.data?.versions.length && (
        <label className="auto-champ">
          État repris
          <select value={versionId} onChange={(e) => { setVersionId(e.target.value); setApercu(null); }}>
            <option value="">État courant (révision {versions.data.revision})</option>
            {versions.data.versions.map((v) => (
              <option key={v.id} value={v.id}>
                Version « {v.nom} » (r{v.revision})
              </option>
            ))}
          </select>
        </label>
      )}
      <fieldset className="reprise-choix">
        <legend>Familles reprises</legend>
        {FAMILLES.map(([f, libelle]) => (
          <label key={f}>
            <input type="checkbox" checked={familles.has(f)} onChange={(e) => { const s = new Set(familles); if (e.target.checked) s.add(f); else s.delete(f); setFamilles(s); setApercu(null); }} data-famille={f} /> {libelle}
          </label>
        ))}
        {familles.has("definitions") && (
          <label className="auto-champ">
            Bibliothèque de blocs et composants (vide : toutes)
            <input value={bibliotheque} onChange={(e) => { setBibliotheque(e.target.value); setApercu(null); }} placeholder="Mobilier" maxLength={120} data-reprise="bibliotheque" />
          </label>
        )}
      </fieldset>
      <fieldset className="reprise-choix">
        <legend>Données de projet (jamais reprises par défaut)</legend>
        {([["site", "Parcelle et emprise"], ["hypotheses", "Hypothèses"], ["sources", "Sources"], ["structure", "Structure déclarée"]] as const).map(([k, l]) => (
          <label key={k}>
            <input type="checkbox" checked={donnees[k]} onChange={(e) => { setDonnees({ ...donnees, [k]: e.target.checked }); setApercu(null); }} /> {l}
          </label>
        ))}
      </fieldset>
      <fieldset className="reprise-choix">
        <legend>Sélection spatiale</legend>
        <label>
          <input type="checkbox" checked={zone.active} onChange={(e) => { setZone({ ...zone, active: e.target.checked }); setApercu(null); }} data-reprise="zone" /> Seulement les objets entièrement dans un rectangle (repère local de la source)
        </label>
        {zone.active && (
          <>
            <label className="auto-champ">Coin (x ; y, m)<input value={zone.min} onChange={(e) => { setZone({ ...zone, min: e.target.value }); setApercu(null); }} placeholder="0 ; 0" data-reprise="zone-min" /></label>
            <label className="auto-champ">Coin opposé (x ; y, m)<input value={zone.max} onChange={(e) => { setZone({ ...zone, max: e.target.value }); setApercu(null); }} placeholder="12 ; 8" data-reprise="zone-max" /></label>
            {!zoneLue && <p className="ver-erreur">Saisissez deux coins « x ; y ».</p>}
          </>
        )}
      </fieldset>
      <label className="auto-champ">
        Calques et définitions de même nom
        <select value={homonymes} onChange={(e) => { setHomonymes(e.target.value as "reutiliser" | "renommer"); setApercu(null); }}>
          <option value="reutiliser">réutiliser ceux du projet</option>
          <option value="renommer">créer des copies « (reprise) »</option>
        </select>
      </label>
      <span className="ver-actions">
        <button type="button" disabled={occupe || !sourceId || (zone.active && !zoneLue)} onClick={() => void agir(async () => { const a = await api.apercuRepriseAtelier(projectId, demande()); setApercu({ ...a, cle }); })}>
          Aperçu
        </button>
        <button
          type="button"
          className="primaire"
          disabled={occupe || !apercu || apercu.vide || apercu.cle !== cle}
          onClick={() =>
            void agir(async () => {
              await client.demarrage;
              await client.envoyer();
              if (client.getSnapshot().lots.length) throw new Error("Des modifications ne sont pas encore enregistrées : synchronisez d'abord.");
              const r = await api.repriseAtelier(projectId, { ...demande(), empreinteSource: apercu!.rapport.source.empreinte, requestId: `ui-${Date.now().toString(36)}`, baseRevision: client.getSnapshot().revisionServeur });
              await client.relireServeur(r.revision);
              setApercu(null);
              return `Reprise effectuée (révision ${r.revision}).`;
            })
          }
        >
          Reprendre
        </button>
      </span>
      {message && <p className={message.erreur ? "ver-erreur" : "ver-info"} role={message.erreur ? "alert" : "status"}>{message.texte}</p>}
      {apercu && apercu.cle === cle && (
        <div className="ver-diff reprise-apercu" data-reprise-apercu={apercu.ajouts["objets"] ?? 0}>
          <p>
            Depuis « {apercu.rapport.source.nom} » (révision {apercu.rapport.source.revision}) : {apercu.ajouts["objets"] ?? 0} objet(s), {apercu.ajouts["niveaux"] ?? 0} niveau(x) créé(s), {apercu.ajouts["definitions"] ?? 0} définition(s), {apercu.ajouts["calques"] ?? 0} calque(s).
          </p>
          <ul>
            {apercu.rapport.parClasse.map((c) => <li key={c.classe}>{c.classe} : {c.reprises} / {c.source}</li>)}
            {apercu.rapport.niveaux.map((n) => <li key={n.source}>Niveau « {n.source} » → {n.action === "apparie" ? `apparié à « ${n.cible} »` : "créé"}</li>)}
            {apercu.rapport.homonymes.map((h) => <li key={h.nature + h.nom}>{h.nature === "calque" ? "Calque" : "Définition"} « {h.nom} » : {h.action === "reutilise" ? "réutilisé" : "renommé"}</li>)}
            {apercu.rapport.aReparer.length > 0 && <li>{apercu.rapport.aReparer.length} référence(s) à réparer (objet visé non repris)</li>}
            {apercu.rapport.nonRepris.slice(0, 10).map((n) => <li key={n.id}>Non repris : {n.id} — {n.motif}</li>)}
            {apercu.rapport.remarques.map((r) => <li key={r}>{r}</li>)}
          </ul>
        </div>
      )}
    </details>
  );
}
