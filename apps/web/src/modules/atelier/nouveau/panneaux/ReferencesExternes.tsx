/**
 * Références externes (DA-05-11) : superposer en lecture seule, sur un niveau de ce projet, le plan d'un niveau
 * d'une **publication** d'un autre projet lisible. Rien n'est copié : la référence épingle la publication (révision,
 * empreinte) et la conversion explicite du repère de la source vers celui du projet (position, angle). Une
 * publication plus récente est signalée ; ses différences se consultent avant d'épingler.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { pt, type Commande } from "@parcours/atelier-model";
import { api, type ReferenceExterneEtat } from "../../../../lib/api";
import type { AtelierClient } from "../../bus/atelier-client";
import { messageErreur } from "./Versions";

interface Props {
  projectId: string;
  niveaux: { id: string; nom: string }[];
  niveauId: string | null;
  references: ReferenceExterneEtat[];
  readOnly: boolean;
  client: AtelierClient;
}

/** Exécute, envoie, et lève l'explication du serveur si le lot est refusé (droits, publication, cycle). */
async function executerEtValider(client: AtelierClient, commandes: Commande[], label: string): Promise<void> {
  await client.demarrage;
  const { requestId } = await client.executer(commandes, label);
  await client.envoyer();
  const lot = client.getSnapshot().lots.find((l) => l.enveloppe.requestId === requestId);
  if (!lot) return;
  const d = (lot.detail ?? {}) as { message?: string; conflits?: { motif: string }[] };
  if (lot.etat === "local") throw new Error("Hors ligne : la référence sera contrôlée par le serveur à la reconnexion.");
  // Un rattachement refusé n'a rien à rejouer : il est abandonné, l'explication reste affichée.
  await client.decider(requestId, "abandonner");
  throw new Error(d.message ?? d.conflits?.[0]?.motif ?? "Référence refusée par le serveur.");
}

const ETAT: Record<ReferenceExterneEtat["etat"], string> = { "a-jour": "à jour", "plus-recente": "publication plus récente disponible", inaccessible: "source inaccessible" };

export function ReferencesExternes({ projectId, niveaux, niveauId, references, readOnly, client }: Props) {
  const [ouvert, setOuvert] = useState(false);
  const projets = useQuery({ queryKey: ["projects"], queryFn: () => api.listProjects(), enabled: ouvert && !readOnly, retry: false });
  const [sourceId, setSourceId] = useState("");
  const publications = useQuery({ queryKey: ["atelier-publications", sourceId], queryFn: () => api.getAtelierPublications(sourceId), enabled: !!sourceId, retry: false });
  const [publicationId, setPublicationId] = useState("");
  const publication = useQuery({ queryKey: ["atelier-publication", sourceId, publicationId], queryFn: () => api.getAtelierPublication(sourceId, publicationId), enabled: !!sourceId && !!publicationId, retry: false });
  const [niveauSourceId, setNiveauSourceId] = useState("");
  const [cible, setCible] = useState("");
  const [position, setPosition] = useState("0;0");
  const [angle, setAngle] = useState("0");
  const [message, setMessage] = useState<{ texte: string; erreur: boolean } | null>(null);
  const [miseAJour, setMiseAJour] = useState<{ id: string; texte: string } | null>(null);

  const agir = async (f: () => Promise<string | void>) => {
    setMessage(null);
    try {
      const m = await f();
      if (m) setMessage({ texte: m, erreur: false });
    } catch (err) {
      setMessage({ texte: messageErreur(err), erreur: true });
    }
  };

  const rattacher = () =>
    agir(async () => {
      const pub = publication.data;
      if (!pub) throw new Error("Choisissez une publication.");
      const [x, y] = position.split(/[;\s]+/).map((v) => Number(v.replace(",", ".")));
      const a = Number(angle.replace(",", "."));
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(a)) throw new Error("Position « x;y » et angle en degrés attendus.");
      const niveauCible = cible || niveauId;
      if (!niveauCible) throw new Error("Choisissez le niveau du projet.");
      if (!niveauSourceId) throw new Error("Choisissez le niveau source.");
      const nomSource = projets.data?.find((p) => p.id === sourceId)?.name ?? "source";
      await executerEtValider(client, 
        [{ type: "refexterne.rattacher", params: { nom: `${nomSource} — ${pub.nom}`.slice(0, 120), projetSourceId: sourceId, publicationId: pub.id, revisionSource: pub.revision, empreinteSource: pub.empreinte, niveauSourceId, niveauId: niveauCible, position: pt(x!, y!), angle: { value: a, unit: "deg" }, calqueId: null } }],
        `Référence externe « ${pub.nom} »`,
      );
      return "Référence rattachée (lecture seule, rien n'est copié).";
    });

  const epinglerDerniere = (r: ReferenceExterneEtat) =>
    agir(async () => {
      if (!r.derniere) throw new Error("Source inaccessible.");
      await executerEtValider(client, [{ type: "refexterne.rattacher", params: { ...r.params, id: r.id, publicationId: r.derniere.id, revisionSource: r.derniere.revision, empreinteSource: r.derniere.empreinte, position: pt(r.params.position.x, r.params.position.y) } }], `Mise à jour de la référence « ${r.nom} »`);
      setMiseAJour(null);
      return `Référence épinglée sur « ${r.derniere.nom} » (révision ${r.derniere.revision}).`;
    });

  const voirDifferences = (r: ReferenceExterneEtat) =>
    agir(async () => {
      const d = await api.getAtelierMiseAJourReference(projectId, r.id);
      const lignes = [
        `De « ${d.epinglee.nom} » (r${d.epinglee.revision}) à « ${d.derniere.nom} » (r${d.derniere.revision}) : ${d.differences.ajoutes} objet(s) ajouté(s), ${d.differences.modifies} modifié(s), ${d.differences.supprimes} supprimé(s).`,
        d.representation.change ? `Le plan référencé change (${d.representation.traitsAvant} → ${d.representation.traitsApres} traits).` : "Le plan référencé ne change pas.",
        d.niveauSourcePresent ? "" : "Le niveau source n'existe plus dans la dernière publication.",
      ].filter(Boolean);
      setMiseAJour({ id: r.id, texte: lignes.join(" ") });
    });

  const pubs = publications.data?.publications ?? [];
  return (
    <details className="refext" onToggle={(e) => setOuvert(e.currentTarget.open)} data-references-externes={references.length}>
      <summary>Références externes{references.length ? ` (${references.length})` : ""}</summary>
      {references.length === 0 && <p className="ver-info">Aucune référence. Une référence superpose en gris, sans rien copier, le plan publié d'un autre projet.</p>}
      <ul className="refext-liste">
        {references.map((r) => (
          <li key={r.id} data-reference={r.id} data-etat={r.etat}>
            <strong>{r.nom}</strong>
            <span>
              {r.representation?.niveauSourceNom ?? r.params.niveauSourceId} → {niveaux.find((n) => n.id === r.params.niveauId)?.nom ?? r.params.niveauId} · r{r.params.revisionSource} · {ETAT[r.etat]}
            </span>
            {!readOnly && (
              <span className="ver-actions">
                {r.etat === "plus-recente" && (
                  <>
                    <button type="button" onClick={() => void voirDifferences(r)}>
                      Différences
                    </button>
                    <button type="button" className="primaire" onClick={() => void epinglerDerniere(r)} data-epingler={r.id}>
                      Épingler la dernière publication
                    </button>
                  </>
                )}
                <button type="button" onClick={() => void agir(async () => { await executerEtValider(client, [{ type: "refexterne.detacher", params: { id: r.id } }], `Détacher la référence « ${r.nom} »`); return "Référence détachée."; })}>
                  Détacher
                </button>
              </span>
            )}
            {miseAJour?.id === r.id && <p className="ver-info">{miseAJour.texte}</p>}
          </li>
        ))}
      </ul>
      {!readOnly && (
        <fieldset className="reprise-choix">
          <legend>Rattacher une publication</legend>
          <label className="auto-champ">
            Projet source
            <select value={sourceId} onChange={(e) => { setSourceId(e.target.value); setPublicationId(""); setNiveauSourceId(""); }} data-refext="source">
              <option value="">—</option>
              {(projets.data ?? []).filter((p) => p.id !== projectId).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} — {p.name}
                </option>
              ))}
            </select>
          </label>
          {sourceId && publications.isSuccess && pubs.length === 0 && <p className="ver-info">Ce projet n'a aucune publication : publiez-le d'abord (seules les publications sont référençables).</p>}
          {pubs.length > 0 && (
            <label className="auto-champ">
              Publication
              <select value={publicationId} onChange={(e) => { setPublicationId(e.target.value); setNiveauSourceId(""); }} data-refext="publication">
                <option value="">—</option>
                {pubs.map((p) => (
                  <option key={p.id} value={p.id}>
                    « {p.nom} » (r{p.revision})
                  </option>
                ))}
              </select>
            </label>
          )}
          {!!publication.data?.niveaux?.length && (
            <label className="auto-champ">
              Niveau source
              <select value={niveauSourceId} onChange={(e) => setNiveauSourceId(e.target.value)} data-refext="niveau-source">
                <option value="">—</option>
                {publication.data.niveaux.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.nom}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="auto-champ">
            Niveau du projet
            <select value={cible || niveauId || ""} onChange={(e) => setCible(e.target.value)} data-refext="niveau">
              {niveaux.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.nom}
                </option>
              ))}
            </select>
          </label>
          <label className="auto-champ">
            Origine de la source dans ce projet (x;y, m)
            <input value={position} onChange={(e) => setPosition(e.target.value)} inputMode="decimal" data-refext="position" />
          </label>
          <label className="auto-champ">
            Rotation (degrés, sens trigonométrique)
            <input value={angle} onChange={(e) => setAngle(e.target.value)} inputMode="decimal" data-refext="angle" />
          </label>
          <button type="button" className="primaire" disabled={!publication.data || !niveauSourceId || !niveaux.length} onClick={() => void rattacher()} data-refext="rattacher">
            Rattacher
          </button>
        </fieldset>
      )}
      {message && <p className={message.erreur ? "ver-erreur" : "ver-info"} role={message.erreur ? "alert" : "status"}>{message.texte}</p>}
    </details>
  );
}
