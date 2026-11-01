/**
 * Boîte « Illustration depuis la vue » (Ctrl+Maj+F4, lot F, décision P-12 ; TEST-032, F.2-03) : à partir du rendu du
 * modèle capturé dans la vue 3D, choisir le fournisseur (local sans IA par défaut ; service d'IA externe seulement s'il
 * est configuré — classification et consentement au coût déclaré exigés), le style et l'intensité, puis produire une
 * image **séparée**, archivée avec ses paramètres et sa provenance. L'illustration est « non vérifiée » ; le modèle
 * n'est jamais modifié. Les illustrations archivées de la variante restent consultables par tout lecteur.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "../../../components/Icon";
import { LOCALE } from "../../../lib/i18n";
import { Dialogue } from "../planche2d/CatalogueOutils";
import { apiIllustrations, ErreurLotF, type FournisseurIllustration, type IllustrationLue } from "./api-lot-f";
import {
  CHOIX_ILLUSTRATION_INITIAL, corpsIllustration, LIBELLES_CLASSIFICATION, LIBELLES_STYLE, libelleCout, messageRefusIllustration, raisonIndisponible, type ChoixIllustration,
} from "./illustration-ui";
import "./illustration.css";

export interface DialogueIllustrationProps {
  projectId: string; studyId: string; variantId: string;
  /** Rendu du modèle capturé (PNG portant sa provenance) ; null : consultation seulement. */
  capture: { png: Uint8Array; provenance: { revisionId: string; scene: { nom: string } | null } } | null;
  modifiable: boolean;
  surFermer: () => void;
}

export function DialogueIllustration({ projectId, studyId, variantId, capture, modifiable, surFermer }: DialogueIllustrationProps) {
  const [fournisseurs, setFournisseurs] = useState<FournisseurIllustration[]>([]);
  const [liste, setListe] = useState<IllustrationLue[]>([]);
  const [choix, setChoix] = useState<ChoixIllustration>(CHOIX_ILLUSTRATION_INITIAL);
  const [erreur, setErreur] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [resultat, setResultat] = useState<IllustrationLue | null>(null);
  // Même demande rejouée (même requestId) tant que le choix n'a pas changé : jamais de doublon après une coupure.
  const tentative = useRef<{ cle: string; requestId: string } | null>(null);
  const charger = useCallback(async () => {
    try {
      const [f, l] = await Promise.all([apiIllustrations.fournisseurs(projectId, studyId, variantId), apiIllustrations.lister(projectId, studyId, variantId)]);
      setFournisseurs(f.fournisseurs); setListe(l.illustrations); setErreur("");
    } catch (e) { setErreur(e instanceof ErreurLotF ? e.message : "Le serveur n’a pas répondu."); }
  }, [projectId, studyId, variantId]);
  useEffect(() => { void charger(); }, [charger]);
  const f = fournisseurs.find((x) => x.id === choix.fournisseur);
  const raison = !capture ? "Aucun rendu capturé : ouvrez la vue 3D enregistrée puis relancez la commande." : raisonIndisponible(choix, f, modifiable);
  const poser = (p: Partial<ChoixIllustration>) => setChoix((c) => ({ ...c, ...p }));

  async function generer() {
    if (!capture || raison) return;
    const cle = JSON.stringify([choix, capture.provenance.revisionId, capture.png.length]);
    if (tentative.current?.cle !== cle) tentative.current = { cle, requestId: crypto.randomUUID() };
    setEnCours(true); setErreur("");
    try {
      const r = await apiIllustrations.creer(projectId, studyId, variantId, corpsIllustration(tentative.current.requestId, capture.png, choix, f));
      setResultat(r); tentative.current = null;
      await charger();
    } catch (e) { setErreur(e instanceof ErreurLotF ? messageRefusIllustration(e.status, e.corps) : "Envoi non confirmé. Réessayez : la même demande sera rejouée sans doublon."); }
    finally { setEnCours(false); }
  }

  return (
    <Dialogue titre="Illustration depuis la vue" id="studio-illustration-titre" classe="studio-illustration" surFermer={surFermer}>
      <div className="studio-illustration-corps" data-studio-illustration>
        <p className="studio-note">Une illustration est une image séparée, tirée du rendu du modèle de la vue. Elle est <strong>non vérifiée</strong> : ni métrique, ni conforme. Le modèle n’est jamais modifié.</p>
        {capture
          ? <p data-studio-illustration-source>Source : rendu du modèle, révision <code translate="no">{capture.provenance.revisionId.slice(-8)}</code>{capture.provenance.scene ? `, scène « ${capture.provenance.scene.nom} »` : ", vue courante"}.</p>
          : <p className="studio-hint">Aucun rendu capturé : consultation des illustrations archivées seulement.</p>}
        <fieldset>
          <legend>Fournisseur</legend>
          {fournisseurs.map((x) => (
            <label key={x.id} className="studio-illustration-fournisseur" data-studio-fournisseur={x.id} data-studio-disponible={x.disponible ? "oui" : "non"}>
              <input type="radio" name="fournisseur" value={x.id} checked={choix.fournisseur === x.id} disabled={!x.disponible} onChange={() => poser({ fournisseur: x.id, consentement: false })} />
              <span><strong>{x.nature === "local-deterministe" ? "Illustration dérivée du rendu (locale, sans IA)" : x.nom}</strong> — {x.nature === "local-deterministe" ? "aucun réseau, résultat reproductible" : "service d’IA externe"}<br />
                <span className="studio-hint">{libelleCout(x)}{x.disponible ? "" : ` · Indisponible : ${x.manque.join(" ; ")}`}</span></span>
            </label>
          ))}
        </fieldset>
        <div className="studio-illustration-reglages">
          <label>Style
            <select value={choix.style} onChange={(e) => poser({ style: e.target.value })} data-studio-illustration-style>
              {(f?.styles ?? ["trait", "lavis", "sepia"]).map((s) => <option key={s} value={s}>{LIBELLES_STYLE[s] ?? s}</option>)}
            </select>
          </label>
          <label>Intensité
            <input type="range" min={0} max={100} step={5} value={choix.intensite} onChange={(e) => poser({ intensite: Number(e.target.value) })} data-studio-illustration-intensite />
          </label>
        </div>
        {f?.nature === "ia-externe" && <fieldset data-studio-illustration-externe>
          <legend>Envoi au service externe</legend>
          <label>Classification de l’image
            <select value={choix.classification} onChange={(e) => poser({ classification: e.target.value as ChoixIllustration["classification"] })} data-studio-illustration-classification>
              <option value="">Choisir…</option>
              {(["publique", "interne", "confidentielle"] as const).map((c) => <option key={c} value={c}>{LIBELLES_CLASSIFICATION[c]}</option>)}
            </select>
          </label>
          <label><input type="checkbox" checked={choix.consentement} onChange={(e) => poser({ consentement: e.target.checked })} data-studio-illustration-consentement /> J’accepte l’envoi de l’image du rendu à ce service et son coût déclaré.</label>
        </fieldset>}
        <div className="studio-vue3d-actions">
          <button type="button" onClick={() => void generer()} disabled={!!raison || enCours} data-studio-illustration-generer><Icon name="studio-illustration" size={18} /> Produire l’illustration</button>
          {raison && <p className="studio-hint" data-studio-illustration-raison>{raison}</p>}
        </div>
        {erreur && <p role="alert" className="studio-erreur" data-studio-illustration-erreur>{erreur}</p>}
        {resultat && <section data-studio-illustration-resultat={resultat.id} aria-label="Illustration produite">
          <img src={resultat.image} alt="Illustration produite (non vérifiée)" width={Math.min(480, resultat.largeur)} />
          <p data-studio-illustration-verification="non-verifiee">Non vérifiée — {String(resultat.provenance["verification"]?.["portee"] ?? "")}</p>
          <p data-studio-illustration-reproductibilite>{String(resultat.provenance["reproductibilite"]?.["garantie"] ?? "")}</p>
          <p data-studio-illustration-modele={resultat.provenance["modele"]?.["inchange"] ? "inchange" : "inconnu"}>Modèle source inchangé : révision <code translate="no">{resultat.revisionId.slice(-8)}</code>.</p>
        </section>}
        <h3>Illustrations archivées de la variante</h3>
        {liste.length === 0 ? <p className="studio-hint">Aucune illustration archivée.</p> : <ul className="studio-illustration-liste">
          {liste.map((i) => (
            <li key={i.id} data-studio-illustration-archivee={i.id}>
              <a href={i.image} download>{new Date(i.creeLe).toLocaleString(LOCALE)}</a> — {i.fournisseur.nature === "local-deterministe" ? "locale, sans IA" : "service d’IA externe"}, {LIBELLES_STYLE[String(i.parametres["style"])] ?? String(i.parametres["style"])}, {i.creeParEmail ?? i.creePar} · non vérifiée
            </li>
          ))}
        </ul>}
      </div>
    </Dialogue>
  );
}
