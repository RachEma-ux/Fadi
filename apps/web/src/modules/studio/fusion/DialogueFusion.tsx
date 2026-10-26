/**
 * Boîte « Fusionner une variante » (lot W3-D, X.1-06) : fusion à trois voies d'une variante source de l'étude dans la
 * variante affichée (cible), depuis leur ancêtre commun. Aperçu (changements, conflits), choix EXPLICITE de chaque
 * conflit (garder la source ou la cible ; aucun choix par défaut, aucune résolution silencieuse), puis application en
 * une révision de la cible. « Annuler la dernière fusion » (Ctrl+F11) rend, par une nouvelle révision, le document
 * d'avant la fusion tant qu'elle est la tête. Le serveur recalcule l'aperçu, vérifie les droits et les têtes, et refuse
 * un résultat qui n'est plus celui accepté (`lib/studio-fusion.ts`).
 */
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError, type StudioCoteFusion, type StudioFusionLue } from "../../../lib/api";
import { Dialogue } from "../planche2d/CatalogueOutils";
import { choixValables, conflitsSansChoix, corpsFusion, detailConflit, libelleCle, libelleEtat, messageRefusFusion, raisonBlocage, TYPES_CONFLITS } from "./fusion-ui";

export type ModeFusion = "fusion" | "annulation";
const nouvelId = (prefixe: string) => `${prefixe}-${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now())}`;

function Cle({ cle }: { cle: string }) {
  const l = libelleCle(cle);
  return <span>{l.famille}{l.id !== null && <> <code translate="no">{l.id}</code></>}</span>;
}

export function DialogueFusion({ projectId, studyId, variantId, mode, brouillonNonEnregistre, surFermer, surEcrite }: {
  projectId: string; studyId: string; variantId: string; mode: ModeFusion; brouillonNonEnregistre: boolean;
  surFermer: () => void;
  /** Révision écrite (fusion ou annulation) : la variante affichée doit relire sa tête. */
  surEcrite: () => void;
}) {
  const variantes = useQuery({ queryKey: ["studio-variants", projectId, studyId, "archives"], queryFn: () => api.studioVariants(projectId, studyId, true), retry: false });
  const revisions = useQuery({ queryKey: ["studio-revisions", projectId, studyId, variantId], queryFn: () => api.studioRevisions(projectId, studyId, variantId), retry: false });
  const [source, setSource] = useState("");
  const [choix, setChoix] = useState<Record<string, StudioCoteFusion>>({});
  const [lu, setLu] = useState<StudioFusionLue | null>(null);
  const [message, setMessage] = useState<{ type: "refus" | "ok"; texte: string } | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [ecrite, setEcrite] = useState(false);
  const requete = useRef(nouvelId("fusion"));
  const sources = (variantes.data?.variants ?? []).filter((v) => v.id !== variantId);
  const tete = revisions.data?.revisions.find((r) => r.id === variantes.data?.variants.find((v) => v.id === variantId)?.headRevisionId) ?? null;
  const teteEstFusion = tete?.source === "variant-merge";

  async function apercevoir(sourceId: string, choixCourants: Record<string, StudioCoteFusion>) {
    if (!sourceId) return;
    setEnCours(true); setMessage(null);
    try {
      const r = await api.studioFusionApercu(projectId, studyId, variantId, sourceId, Object.keys(choixCourants).length ? choixCourants : undefined);
      // Un choix qui ne désigne plus aucun conflit (référence réparée par un autre choix) est retiré, puis l'aperçu relancé.
      const valables = choixValables(r.apercu.conflits, choixCourants);
      if (Object.keys(valables).length !== Object.keys(choixCourants).length) { setChoix(valables); setEnCours(false); return apercevoir(sourceId, valables); }
      setLu(r);
    } catch (err) {
      setLu(null);
      setMessage({ type: "refus", texte: err instanceof ApiError ? messageRefusFusion(err.status, err.body) : "Aperçu indisponible : réessayez." });
    } finally { setEnCours(false); }
  }
  useEffect(() => { setChoix({}); setLu(null); requete.current = nouvelId("fusion"); if (source) void apercevoir(source, {}); }, [source]);

  function choisir(id: string, cote: StudioCoteFusion) {
    const suivant = { ...choix, [id]: cote };
    setChoix(suivant);
    requete.current = nouvelId("fusion");
    void apercevoir(source, suivant);
  }
  async function appliquer() {
    if (!lu || enCours || raisonBlocage(lu, choix, brouillonNonEnregistre)) return;
    setEnCours(true); setMessage(null);
    try {
      const r = await api.studioFusionAppliquer(projectId, studyId, variantId, corpsFusion(lu, choix, requete.current));
      setEcrite(true);
      setMessage({ type: "ok", texte: `Fusion enregistrée : nouvelle révision ${r.revision.id.slice(-8)} de cette variante. Elle s’annule par « Annuler la dernière fusion ».` });
    } catch (err) {
      setMessage({ type: "refus", texte: err instanceof ApiError ? messageRefusFusion(err.status, err.body) : "Fusion non confirmée : relancez l’aperçu avant de réessayer." });
    } finally { setEnCours(false); }
  }
  async function annuler() {
    if (!tete || !teteEstFusion || enCours) return;
    setEnCours(true); setMessage(null);
    try {
      const r = await api.studioFusionAnnuler(projectId, studyId, variantId, nouvelId("annule"), tete.id);
      setEcrite(true);
      setMessage({ type: "ok", texte: `Fusion annulée : nouvelle révision ${r.revision.id.slice(-8)}, au document d’avant la fusion.` });
    } catch (err) {
      setMessage({ type: "refus", texte: err instanceof ApiError ? messageRefusFusion(err.status, err.body) : "Annulation non confirmée : réessayez." });
    } finally { setEnCours(false); }
  }

  const blocage = raisonBlocage(lu, choix, brouillonNonEnregistre);
  const restants = lu ? conflitsSansChoix(lu.apercu.conflits, choix) : [];
  return (
    <Dialogue titre={mode === "annulation" ? "Annuler la dernière fusion" : "Fusionner une variante"} id="studio-fusion-titre" classe="studio-fusion" surFermer={surFermer}>
      <div data-studio-fusion={mode}>
        {mode === "fusion" && <>
          <p className="studio-dialogue-aide">Fusion à trois voies d’une autre variante de l’étude dans cette variante, depuis leur ancêtre commun : chaque changement d’un seul côté est repris ; un élément changé des deux côtés est un conflit que vous tranchez vous-même.</p>
          <label htmlFor="studio-fusion-source">Variante source</label>
          <select id="studio-fusion-source" value={source} onChange={(e) => setSource(e.target.value)} disabled={enCours || ecrite} data-studio-fusion-source>
            <option value="">Choisir…</option>
            {sources.map((v) => <option key={v.id} value={v.id} translate="no">{v.archived ? `${v.name} (archivée)` : v.name}</option>)}
          </select>
          {variantes.isError && <p role="alert">Variantes indisponibles.</p>}
          {lu && <section aria-labelledby="studio-fusion-apercu" data-studio-fusion-apercu>
            <h3 id="studio-fusion-apercu">Aperçu</h3>
            <p data-studio-fusion-ancetre>{`Ancêtre commun : révision ${lu.ancetre.revisionId.slice(-8)}. Source : ${lu.apercu.changementsSource.length} changement(s) ; cette variante : ${lu.apercu.changementsCible.length} changement(s).`}</p>
            <h4>Changements apportés à cette variante</h4>
            {lu.apercu.appliques.length === 0 ? <p data-studio-fusion-aucun>Aucun changement.</p> : <ul data-studio-fusion-appliques>
              {lu.apercu.appliques.map((a) => <li key={a.cle} data-cle={a.cle}><Cle cle={a.cle} /> — {libelleEtat(a.etat)}{a.origine === "mixte" ? " (propriétés des deux côtés)" : a.origine === "resolution" ? " (votre choix)" : ""}</li>)}
            </ul>}
            <h4>{`Conflits : ${lu.apercu.conflits.length}`}</h4>
            {lu.apercu.conflits.length === 0 ? <p data-studio-fusion-sans-conflit>Aucun conflit.</p> : <ol data-studio-fusion-conflits>
              {lu.apercu.conflits.map((c) => <li key={c.id} data-studio-fusion-conflit={c.id}>
                <fieldset>
                  <legend>{TYPES_CONFLITS[c.type]} : {c.cles.map((k, i) => <span key={k}>{i > 0 ? ", " : ""}<Cle cle={k} /></span>)}</legend>
                  <p>{detailConflit(c)}</p>
                  {(["source", "cible"] as const).map((cote) => <label key={cote}>
                    <input type="radio" name={`studio-fusion-${c.id}`} checked={choix[c.id] === cote} disabled={enCours || ecrite} onChange={() => choisir(c.id, cote)} data-studio-fusion-choix={cote} />
                    {cote === "source" ? "Garder la source" : "Garder cette variante"}
                  </label>)}
                </fieldset>
              </li>)}
            </ol>}
            {restants.length > 0 && <p data-studio-fusion-restants>{`${restants.length} conflit(s) sans choix : le document montré garde cette variante tant que vous n’avez pas choisi.`}</p>}
            {!lu.apercu.valide && <p role="alert" data-studio-fusion-invalide>Le résultat de la fusion serait invalide : choisissez d’autres versions.</p>}
          </section>}
          {blocage && lu && !ecrite && <p data-studio-fusion-blocage>{blocage}</p>}
          <button type="button" disabled={!!blocage || enCours || ecrite} onClick={() => void appliquer()} data-studio-fusion-appliquer>Fusionner dans cette variante</button>
        </>}
        {mode === "annulation" && <>
          <p className="studio-dialogue-aide">Annuler la dernière fusion crée une nouvelle révision qui rend le document d’avant la fusion ; rien n’est réécrit ni supprimé.</p>
          {revisions.isPending && <p role="status">Chargement des révisions…</p>}
          {revisions.data && !teteEstFusion && <p data-studio-fusion-pas-de-fusion>La tête de cette variante n’est pas une fusion : rien à annuler.</p>}
          {brouillonNonEnregistre && <p>Enregistrez ou annulez d’abord les modifications en cours de cette variante.</p>}
          <button type="button" disabled={!teteEstFusion || enCours || ecrite || brouillonNonEnregistre} onClick={() => void annuler()} data-studio-fusion-annuler>Annuler la dernière fusion</button>
        </>}
        {message && <p role={message.type === "refus" ? "alert" : "status"} data-studio-fusion-message={message.type}>{message.texte}</p>}
        {ecrite && <button type="button" onClick={surEcrite} data-studio-fusion-ouvrir>Ouvrir la nouvelle révision</button>}
      </div>
    </Dialogue>
  );
}
