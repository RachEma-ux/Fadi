/**
 * Boîte « Feuille » (Maj+P) : format ISO, orientation, échelle (normalisée ou ajustée), cartouche prérempli par les
 * données réelles (modifiable), échelle graphique et flèche du nord à la demande, aperçu en direct. « Imprimer / PDF »
 * imprime la seule feuille à sa taille réelle (feuille de style d'impression, `@page` à la taille du format) ;
 * « Télécharger la feuille SVG / PDF » produit le fichier dans le navigateur (`composerFeuilleStudio`, composé hors du
 * fil principal par le Worker de Studio ; l'aperçu précédent reste affiché jusqu'au résultat suivant). Présentation
 * seulement : rien n'est écrit dans le document, la boîte reste ouverte en lecture seule.
 */
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  STUDIO_SHEET_FORMATS, STUDIO_SHEET_SCALES,
  type StudioDocument, type StudioSheetFormat, type StudioSheetOptions, type StudioSheetScaleChoice, type StudioSheetTitleBlock,
} from "@parcours/atelier-model";
import { Icon } from "../../../components/Icon";
import { Dialogue } from "../planche2d/CatalogueOutils";
import { calculSurFilPrincipal, DELAI_FEUILLE_MS, MESSAGE_REPLI } from "../workers/client-studio";
import { empreinteDe, texteEmpreinte } from "../taches/empreinte";
import { documentSansElement, etatApercuFeuille } from "../taches/etats-contenus";
import { EtatContenu } from "../taches/EtatContenu";
import { messageTache } from "../taches/messages";
import { ordonnanceurStudio } from "../taches/pool-studio";
import { composerFeuille, MESSAGE_FEUILLE_IMPOSSIBLE, type ResultatFeuille } from "../workers/traitements";
import {
  angleNord, CHAMPS_CARTOUCHE, cartoucheCourant, nomFichierFeuille, REGLAGES_INITIAUX, svgSansProlog, type ReglagesFeuille,
} from "./feuille-ui";
import "./feuille.css";

export interface PanneauFeuilleProps {
  /** Document de la révision affichée (enregistrée), jamais le brouillon. */
  doc: StudioDocument;
  /** Champs lus (projet, étude, variante, révision, auteur). */
  cartouche: StudioSheetTitleBlock;
  /** Des modifications non enregistrées existent : elles ne figurent pas sur la feuille. */
  brouillonNonEnregistre: boolean;
  surFermer: () => void;
}

const VIDE: ResultatFeuille = Object.freeze({ feuille: null, svg: null, pdf: null, erreur: "" });

/** Adresse `blob:` d'un contenu, libérée quand il change ou à la fermeture. */
function useAdresseBlob(contenu: string | Uint8Array | null, type: string): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (contenu === null || typeof URL.createObjectURL !== "function") { setUrl(null); return; }
    const u = URL.createObjectURL(new Blob([contenu as BlobPart], { type }));
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [contenu, type]);
  return url;
}

export function PanneauFeuille({ doc, cartouche, brouillonNonEnregistre, surFermer }: PanneauFeuilleProps) {
  const [reglages, setReglages] = useState<ReglagesFeuille>(REGLAGES_INITIAUX);
  const [saisies, setSaisies] = useState<Partial<StudioSheetTitleBlock>>({});
  const champs = cartoucheCourant(cartouche, saisies);
  const cleChamps = JSON.stringify(champs);
  const angle = angleNord(reglages);
  const regler = (r: Partial<ReglagesFeuille>) => setReglages((v) => ({ ...v, ...r }));

  // `champs` est recalculé à chaque rendu : sa clé JSON tient lieu de dépendance.
  const options = useMemo<StudioSheetOptions>(
    () => ({ format: reglages.format, orientation: reglages.orientation, scale: reglages.scale, titleBlock: champs, scaleBar: reglages.scaleBar, north: angle === null ? null : { angle } }),
    [reglages.format, reglages.orientation, reglages.scale, reglages.scaleBar, angle, cleChamps],
  );
  // Composition (SVG et PDF) hors du fil principal ; sans Worker (rendu serveur, tests), directement au premier rendu.
  const [resultat, setResultat] = useState<ResultatFeuille>(() => (typeof Worker === "undefined" ? composerFeuille(doc, options) : VIDE));
  const [enCours, setEnCours] = useState(false);
  // EX-016 : clé (document + réglages) de l'aperçu affiché, comparée à celle de la composition demandée.
  const cleCourante = texteEmpreinte(empreinteDe(doc, options));
  const [cleAffichee, setCleAffichee] = useState<string | null>(() => (typeof Worker === "undefined" ? cleCourante : null));
  useEffect(() => {
    let actif = true;
    const cle = texteEmpreinte(empreinteDe(doc, options));
    setEnCours(true);
    // Tâche interactive (aperçu), une seule clé : un réglage plus récent remplace la composition plus ancienne, dont le
    // résultat est périmé, sans arrêter le Worker (une composition est courte ; l'arrêter coûterait un redémarrage).
    const tache = ordonnanceurStudio().soumettre<unknown, ResultatFeuille>({
      cle: "studio.feuille", classe: "interactive", nature: "feuille.composer", charge: { document: doc, options },
      empreinte: empreinteDe(doc, options), delaiMs: DELAI_FEUILLE_MS,
      surResultat: (r) => { if (actif) { setResultat(r); setCleAffichee(cle); setEnCours(false); } },
    });
    void tache.issue.then((i) => {
      const message = messageTache(i);
      if (actif && message !== null) { setResultat({ ...VIDE, erreur: message ?? MESSAGE_FEUILLE_IMPOSSIBLE }); setCleAffichee(cle); setEnCours(false); }
    });
    return () => { actif = false; tache.abandonner(); };
  }, [doc, options]);
  const pdf = resultat.pdf;
  const lienSvg = useAdresseBlob(resultat.svg, "image/svg+xml");
  const lienPdf = useAdresseBlob(pdf, "application/pdf");
  const apercu = resultat.svg ? svgSansProlog(resultat.svg) : "";
  const fraicheur = etatApercuFeuille({ revisionId: cartouche.revisionId ?? "", courante: cleCourante, affichee: cleAffichee, enCours, erreur: cleAffichee === cleCourante ? resultat.erreur || null : null, sansElement: documentSansElement(doc) });

  // Impression : seule la feuille s'imprime (classe posée sur <body> tant que la boîte est ouverte).
  const f = resultat.feuille;
  // Seulement quand une feuille est composée : sinon Ctrl+P imprimerait une page vide.
  useEffect(() => {
    if (!f) return;
    document.body.classList.add("studio-feuille-imprime");
    return () => document.body.classList.remove("studio-feuille-imprime");
  }, [f]);

  return (
    <Dialogue titre="Feuille" id="studio-feuille-titre" classe="studio-feuille" surFermer={surFermer}>
      <div className="studio-feuille-corps" data-studio-feuille>
        <form className="studio-feuille-reglages" onSubmit={(e) => e.preventDefault()}>
          <fieldset>
            <legend>Mise en page</legend>
            <label>Format<select value={reglages.format} onChange={(e) => regler({ format: e.target.value as StudioSheetFormat })} data-studio-feuille-format>
              {(Object.keys(STUDIO_SHEET_FORMATS) as StudioSheetFormat[]).map((k) => <option key={k} value={k}>{k}</option>)}
            </select></label>
            <label>Orientation<select value={reglages.orientation} onChange={(e) => regler({ orientation: e.target.value as ReglagesFeuille["orientation"] })} data-studio-feuille-orientation>
              <option value="portrait">Portrait</option>
              <option value="paysage">Paysage</option>
            </select></label>
            <label>Échelle<select value={String(reglages.scale)} onChange={(e) => regler({ scale: (e.target.value === "ajuster" ? "ajuster" : Number(e.target.value)) as StudioSheetScaleChoice })} data-studio-feuille-echelle>
              {STUDIO_SHEET_SCALES.map((s) => <option key={s} value={s}>{`1:${s}`}</option>)}
              <option value="ajuster">Ajuster au cadre</option>
            </select></label>
            <label className="studio-feuille-case"><input type="checkbox" checked={reglages.scaleBar} onChange={(e) => regler({ scaleBar: e.target.checked })} data-studio-feuille-barre-echelle /> Échelle graphique</label>
            <label className="studio-feuille-case"><input type="checkbox" checked={reglages.nord} onChange={(e) => regler({ nord: e.target.checked })} data-studio-feuille-nord /> Flèche du nord</label>
            {reglages.nord && <label>Angle du nord (degrés, sens horaire depuis +y)<input type="text" inputMode="decimal" value={reglages.angleNord} onChange={(e) => regler({ angleNord: e.target.value })} data-studio-feuille-angle-nord /></label>}
            {reglages.nord && angle === null && <p className="studio-dialogue-aide" role="status">Saisissez l’angle du nord : sans angle déclaré, la feuille reste « non orientée ».</p>}
          </fieldset>
          <fieldset>
            <legend>Cartouche</legend>
            <p className="studio-dialogue-aide">Prérempli par les données du projet ; un champ vide s’affiche « — » sur la feuille.</p>
            {CHAMPS_CARTOUCHE.map((c) => (
              <label key={c.id}>{c.libelleFR}<input type="text" value={champs[c.id] ?? ""} maxLength={200} onChange={(e) => setSaisies((s) => ({ ...s, [c.id]: e.target.value }))} data-studio-feuille-champ={c.id} /></label>
            ))}
          </fieldset>
        </form>
        <div className="studio-feuille-apercu-zone" aria-busy={enCours || undefined} data-studio-feuille-en-cours={enCours ? "oui" : "non"}>
          <p className="studio-etat-contenu-ligne"><EtatContenu etat={fraicheur} nom="apercu-feuille" statut /></p>
          {enCours && !f && <p className="studio-dialogue-aide" role="status">Composition de la feuille…</p>}
          {calculSurFilPrincipal() && <p className="studio-dialogue-aide" role="status" data-studio-calcul-repli>{MESSAGE_REPLI}</p>}
          {brouillonNonEnregistre && <p className="studio-info" role="status">La feuille porte sur la révision enregistrée affichée : les modifications non enregistrées n’y figurent pas.</p>}
          {resultat.erreur && <p role="alert">{resultat.erreur}</p>}
          {f && <p className="studio-dialogue-aide studio-feuille-resume" data-studio-feuille-resume>
            <span translate="no">{`${f.format} · ${f.width} × ${f.height} mm`}</span>
            <span>{f.orientation === "paysage" ? "Paysage" : "Portrait"}</span>
            <span translate="no">{f.scale.label}</span>
            {f.clipped && <strong data-studio-feuille-decoupe>Dessin découpé au cadre</strong>}
          </p>}
          <div className="studio-feuille-apercu" role="img" aria-label="Aperçu de la feuille" translate="no" data-studio-feuille-apercu dangerouslySetInnerHTML={{ __html: apercu }} />
          <div className="studio-feuille-actions">
            <button type="button" disabled={!f} onClick={() => window.print()} data-studio-feuille-imprimer><Icon name="studio-print" size={18} /> Imprimer / PDF</button>
            <a className="studio-lien-bouton" href={lienSvg ?? undefined} aria-disabled={lienSvg ? undefined : true} download={f ? nomFichierFeuille(champs, reglages, "svg") : undefined} data-studio-feuille-svg><Icon name="studio-sheet-svg" size={18} /> Télécharger la feuille SVG</a>
            <a className="studio-lien-bouton" href={lienPdf ?? undefined} aria-disabled={lienPdf ? undefined : true} download={f ? nomFichierFeuille(champs, reglages, "pdf") : undefined} data-studio-feuille-pdf><Icon name="studio-sheet-pdf" size={18} /> Télécharger la feuille PDF</a>
          </div>
          <p className="studio-dialogue-aide">« Imprimer / PDF » imprime la feuille seule, à sa taille réelle : choisissez le même format de papier et une échelle d’impression de 100 %.</p>
        </div>
      </div>
      {f && typeof document !== "undefined" && createPortal(
        <div className="studio-feuille-impression" translate="no" aria-hidden="true" data-studio-feuille-impression>
          <style>{`@media print { @page { size: ${f.width}mm ${f.height}mm; margin: 0; } }`}</style>
          {/* Identifiant de découpe propre à la copie imprimée (l'aperçu est masqué à l'impression). */}
          <div style={{ width: `${f.width}mm`, height: `${f.height}mm` }} dangerouslySetInnerHTML={{ __html: apercu.replaceAll("studio-sheet-viewport", "studio-sheet-viewport-impression") }} />
        </div>,
        document.body,
      )}
    </Dialogue>
  );
}
