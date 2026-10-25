/**
 * Panneau « Scènes, apparence et rendus » de la vue 3D (lot E.5) : liste des scènes enregistrées, réglages d'une scène
 * (nom, calques montrés, mode d'affichage), apparence d'affichage d'un calque ou d'un objet, et les trois types de
 * rendu — seul le rendu du modèle existe ; l'illustration IA contrainte et l'exploration libre sont annoncées
 * indisponibles, sans bouton. Présentation seulement : chaque action est rendue par la vue 3D (`Vue3DStudio`).
 */
import { STUDIO_FINITIONS_AFFICHAGE, STUDIO_MODES_AFFICHAGE, studioScenes, type StudioDocument, type StudioFinitionAffichage, type StudioModeAffichage } from "@parcours/atelier-model";
import { Icon } from "../../../../components/Icon";
import { libelleType } from "../../variante/rapport-export";
import { apparenceDe, calquesVisualisation, LIBELLES_FINITION, LIBELLES_MODE, TYPES_RENDU } from "./scenes-ui";

export interface PanneauVisualisationProps {
  doc: StudioDocument;
  modifiable: boolean;
  sceneChoisie: string | null;
  /** Scène dont la vue courante est exactement le réglage (caméra, calques, mode). */
  sceneActive: string | null;
  nom: string;
  calques: readonly string[];
  mode: StudioModeAffichage;
  cible: string;
  couleur: string;
  finition: StudioFinitionAffichage | "";
  /** Rendu exportable (WebGL disponible) ; `raisonRendu` : pourquoi il ne l'est pas. */
  rendu: { possible: boolean; raison: string | null };
  surChoix: (id: string) => void;
  surNom: (v: string) => void;
  surCalques: (ids: string[]) => void;
  surMode: (m: StudioModeAffichage) => void;
  surVueDessin: () => void;
  surCible: (v: string) => void;
  surCouleur: (v: string) => void;
  surFinition: (v: StudioFinitionAffichage | "") => void;
  surAction: (action: string) => void;
}

const court = (id: string) => (id.length > 10 ? id.slice(0, 8) : id);

export function PanneauVisualisation(p: PanneauVisualisationProps) {
  const scenes = studioScenes(p.doc);
  const calques = calquesVisualisation(p.doc);
  const objets = [
    ...p.doc.objects.map((o) => ({ id: o.id, type: o.type })),
    ...(p.doc.solides ?? []).map((s) => ({ id: s.id, type: s.type })),
    ...(p.doc.architecture ?? []).map((a) => ({ id: a.id, type: a.type })),
  ];
  const apparence = p.cible ? apparenceDe(p.doc, p.cible) : null;
  const choisie = scenes.some((s) => s.id === p.sceneChoisie);
  const bouton = (action: string, icone: Parameters<typeof Icon>[0]["name"], libelle: string, actif: boolean) => (
    <button type="button" onClick={() => p.surAction(action)} disabled={!actif} data-studio-scene-action={action}><Icon name={icone} size={18} /> {libelle}</button>
  );
  return (
    <div className="studio-vue3d-solides studio-vue3d-visualisation" data-studio-visualisation="">
      <section aria-labelledby="studio-scenes-titre" data-studio-scenes={scenes.length}>
        <h3 id="studio-scenes-titre"><Icon name="studio-scene-recall" size={18} /> Scènes</h3>
        {scenes.length === 0 && <p className="studio-hint">Aucune scène enregistrée. Une scène garde la caméra, les calques montrés et le mode d’affichage ; la rappeler ne modifie pas le modèle.</p>}
        {scenes.length > 0 && <ul>
          {scenes.map((s) => (
            <li key={s.id}>
              <button type="button" aria-pressed={s.id === p.sceneChoisie} onClick={() => p.surChoix(s.id)} data-studio-scene={s.id} data-studio-scene-active={s.id === p.sceneActive ? "oui" : "non"}>
                <span translate="no">{s.name}</span>
              </button>
            </li>
          ))}
        </ul>}
        <fieldset>
          <legend>Réglages de la scène</legend>
          <label>Nom de la scène
            <input type="text" name="scene-nom" maxLength={80} value={p.nom} onChange={(e) => p.surNom(e.target.value)} disabled={!p.modifiable} data-studio-scene-nom translate="no" />
          </label>
          <label>Mode d’affichage
            <select name="scene-mode" value={p.mode} onChange={(e) => p.surMode(e.target.value as StudioModeAffichage)} data-studio-scene-mode>
              {STUDIO_MODES_AFFICHAGE.map((m) => <option key={m} value={m}>{LIBELLES_MODE[m]}</option>)}
            </select>
          </label>
          <fieldset className="studio-vue3d-calques">
            <legend>Calques montrés</legend>
            {calques.map((c) => (
              <label key={c.id}>
                <input type="checkbox" checked={p.calques.includes(c.id)} data-studio-scene-calque={c.id}
                  onChange={(e) => p.surCalques(e.target.checked ? [...p.calques, c.id] : p.calques.filter((x) => x !== c.id))} />
                <span translate={c.implicite ? undefined : "no"}>{c.nom}</span>
              </label>
            ))}
          </fieldset>
          <div className="studio-vue3d-actions">
            {bouton("studio.scene.creer", "studio-scene-add", "Nouvelle scène", p.modifiable)}
            {bouton("studio.scene.modifier", "studio-scene-update", "Mettre à jour la scène", p.modifiable && choisie)}
            {bouton("studio.scene.rappeler", "studio-scene-recall", "Rappeler la scène", choisie)}
            {bouton("studio.scene.supprimer", "studio-scene-delete", "Supprimer la scène", p.modifiable && choisie)}
            <button type="button" onClick={p.surVueDessin} data-studio-scene-quitter>Revenir à la vue du dessin</button>
          </div>
        </fieldset>
      </section>

      <section aria-labelledby="studio-apparence-titre" data-studio-apparence="">
        <h3 id="studio-apparence-titre"><Icon name="studio-appearance" size={18} /> Apparence d’affichage</h3>
        <p className="studio-hint">Réglage d’affichage seulement : la géométrie, les quantités et les données de l’IFC ne changent pas.</p>
        <fieldset disabled={!p.modifiable}>
          <legend>Couleur et finition d’un calque ou d’un objet</legend>
          <label>Calque ou objet
            <select name="apparence-cible" value={p.cible} onChange={(e) => p.surCible(e.target.value)} data-studio-apparence-cible>
              <option value="">Choisir…</option>
              <optgroup label="Calques">{calques.map((c) => <option key={c.id} value={`layer:${c.id}`}>{c.nom}</option>)}</optgroup>
              {objets.length > 0 && <optgroup label="Objets">{objets.map((o) => <option key={o.id} value={`object:${o.id}`}>{`${libelleType(o.type)} ${court(o.id)}`}</option>)}</optgroup>}
            </select>
          </label>
          <label>Couleur d’affichage
            <input type="color" name="apparence-couleur" value={p.couleur} onChange={(e) => p.surCouleur(e.target.value)} data-studio-apparence-couleur />
          </label>
          <label>Finition d’affichage
            <select name="apparence-finition" value={p.finition} onChange={(e) => p.surFinition(e.target.value as StudioFinitionAffichage | "")} data-studio-apparence-finition>
              <option value="">Aucune</option>
              {STUDIO_FINITIONS_AFFICHAGE.map((f) => <option key={f} value={f}>{LIBELLES_FINITION[f]}</option>)}
            </select>
          </label>
          <p role="status" data-studio-apparence-etat={apparence ? "definie" : "aucune"}>{p.cible ? (apparence ? "Cette cible a une apparence d’affichage." : "Cette cible n’a pas d’apparence d’affichage : couleurs par défaut de la vue.") : "Choisissez un calque ou un objet."}</p>
          <div className="studio-vue3d-actions">
            {bouton("studio.apparence.definir", "studio-appearance", "Apparence d’affichage", p.modifiable && !!p.cible)}
            {bouton("studio.apparence.retirer", "studio-appearance-remove", "Retirer l’apparence", p.modifiable && !!apparence)}
          </div>
        </fieldset>
      </section>

      <section aria-labelledby="studio-rendus-titre" data-studio-rendus="">
        <h3 id="studio-rendus-titre"><Icon name="studio-export-png" size={18} /> Rendus</h3>
        <ul>
          {TYPES_RENDU.map((t) => (
            <li key={t.id} data-studio-rendu={t.id} data-studio-disponible={t.disponible ? "oui" : "non"}>
              <strong>{t.libelle}</strong>{" — "}<span>{t.disponible ? "Disponible" : "Non disponible"}</span>
              <p className="studio-hint">{t.description}</p>
              {t.disponible && <>
                {t.id === "illustration-ia"
                  ? <button type="button" onClick={() => p.surAction("illustration")} disabled={!p.rendu.possible} data-studio-illustrer><Icon name="studio-illustration" size={18} /> Illustration depuis la vue…</button>
                  : <button type="button" onClick={() => p.surAction("exporter-png")} disabled={!p.rendu.possible} data-studio-exporter-png><Icon name="studio-export-png" size={18} /> Exporter le rendu PNG</button>}
                {p.rendu.raison && <p className="studio-hint" data-studio-rendu-raison>{p.rendu.raison}</p>}
              </>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
