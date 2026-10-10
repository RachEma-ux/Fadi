/**
 * Lot 5 — interface des objets (cahier-planche §5.6, §5.8, §6) : menu contextuel de Sélection, boîte « Créer un
 * composant », panneaux Info entité, Composants, Styles, Ombres, Scènes, Affichage, Adoucir / lisser, Info modèle et
 * Navigateur. Composants React purs : ils reçoivent le modèle et des rappels, n'appellent jamais le noyau en écriture
 * eux-mêmes (la Planche applique les opérations, un pas d'historique chacune).
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { REGLAGES_DEFAUT, aire, contexte, dist, estSolide, genreAnnotation, motifNonSolide, nombreOccurrences, volume, type Id, type MetadonneesDefinition, type Modele, type ReglagesPlanche, type Scene } from "@parcours/planche-model";
import { t } from "../messages";
import type { OptionsAffichage, VueStandard } from "./vue-planche";

const virgule = (n: number, d = 2) => n.toFixed(d).replace(".", ",");

// ---------------------------------------------------------------------------------------------------------------
// Menu contextuel

export interface EntreeMenu {
  readonly id: string;
  readonly libelle: string;
  readonly action?: () => void;
  readonly sous?: readonly EntreeMenu[];
  readonly grise?: boolean;
  readonly separateurAvant?: boolean;
}

export function MenuContextuel({ x, y, entrees, onFermer }: { x: number; y: number; entrees: readonly EntreeMenu[]; onFermer: () => void }) {
  const [ouvert, setOuvert] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const fermer = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onFermer();
    };
    const clavier = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onFermer();
      }
    };
    // Fenêtre où vit le menu (page ou Planche détachée).
    const w = ref.current?.ownerDocument.defaultView ?? window;
    w.addEventListener("pointerdown", fermer, true);
    w.addEventListener("keydown", clavier, true);
    ref.current?.querySelector<HTMLButtonElement>("button:not([disabled])")?.focus();
    return () => {
      w.removeEventListener("pointerdown", fermer, true);
      w.removeEventListener("keydown", clavier, true);
    };
  }, [onFermer]);
  // Le menu reste dans SA fenêtre (page ou Planche détachée, souvent plus petite).
  const [fenetre, setFenetre] = useState<Window>(window);
  useLayoutEffect(() => {
    const v = ref.current?.ownerDocument.defaultView;
    if (v && v !== fenetre) setFenetre(v);
  }, [fenetre]);
  const style = { left: Math.min(x, fenetre.innerWidth - 260), top: Math.max(8, Math.min(y, fenetre.innerHeight - Math.min(fenetre.innerHeight - 16, 36 * entrees.length + 16))) };
  const rendre = (e: EntreeMenu) => (
    <li key={e.id} role="none" className={e.separateurAvant ? "avec-separateur" : undefined}>
      <button
        type="button"
        role="menuitem"
        disabled={e.grise}
        aria-haspopup={e.sous ? "menu" : undefined}
        aria-expanded={e.sous ? ouvert === e.id : undefined}
        data-planche-menu={e.id}
        onClick={() => {
          // Un clic ouvre toujours le sous-menu : le survol qui précède le clic l'a souvent déjà ouvert, et une bascule le
          // refermait aussitôt (Objets O-1). Échap ou le survol d'une autre entrée le referment.
          if (e.sous) setOuvert(e.id);
          else if (e.action) {
            e.action();
            onFermer();
          }
        }}
        onPointerEnter={() => e.sous && setOuvert(e.id)}
      >
        {e.libelle}
        {e.sous && <span aria-hidden="true"> ▸</span>}
      </button>
      {e.sous && ouvert === e.id && (
        <ul role="menu" className="planche-menu-sous">
          {e.sous.map(rendre)}
        </ul>
      )}
    </li>
  );
  return (
    <div ref={ref} className="planche-menu" style={style} role="menu" aria-label={t("planche.menu.selectionner")} data-planche-menu-contextuel>
      <ul role="menu">{entrees.map(rendre)}</ul>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Boîte « Créer un composant »

export interface ParametresComposant extends MetadonneesDefinition {
  readonly nom: string;
}

export function DialogueComposant({ nomDefaut, onCreer, onAnnuler }: { nomDefaut: string; onCreer: (p: ParametresComposant) => void; onAnnuler: () => void }) {
  const [nom, setNom] = useState(nomDefaut);
  const [description, setDescription] = useState("");
  const [options, setOptions] = useState(false);
  const [collerA, setCollerA] = useState<NonNullable<MetadonneesDefinition["collerA"]>>("aucun");
  const [decouper, setDecouper] = useState(false);
  const [faceCamera, setFaceCamera] = useState(false);
  const champ = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    champ.current?.focus();
    champ.current?.select();
  }, []);
  return (
    <div className="planche-recherche-fond" onPointerDown={(e) => e.target === e.currentTarget && onAnnuler()}>
      <form
        className="planche-recherche planche-dialogue"
        role="dialog"
        aria-modal="true"
        aria-label={t("planche.composant.titre")}
        data-planche-composant
        onSubmit={(e) => {
          e.preventDefault();
          onCreer({ nom: nom.trim() || nomDefaut, ...(description.trim() ? { description: description.trim() } : {}), collerA, ...(decouper ? { decouperOuverture: true } : {}), ...(faceCamera ? { faceCamera: true } : {}) });
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            onAnnuler();
          }
        }}
      >
        <h3>{t("planche.composant.titre")}</h3>
        <label>
          {t("planche.composant.nom")}
          <span className="planche-champ-effacable">
            <input ref={champ} value={nom} onChange={(e) => setNom(e.target.value)} autoComplete="off" data-planche-composant-nom />
            <button type="button" aria-label={t("planche.composant.effacer-nom")} onClick={() => setNom("")}>×</button>
          </span>
        </label>
        {/* Le chevron n'a qu'un effet : déplier les options (le défaut de SketchUp qui créait le composant n'est pas reproduit). */}
        <button type="button" className="lien planche-chevron" aria-expanded={options} onClick={() => setOptions(!options)} data-planche-composant-options>
          {options ? "▾" : "▸"} {t("planche.composant.options")}
        </button>
        {options && (
          <div className="planche-dialogue-options">
            <label>
              {t("planche.composant.description")}
              <input value={description} onChange={(e) => setDescription(e.target.value)} autoComplete="off" data-planche-composant-description />
            </label>
            <label>
              {t("planche.composant.coller")}
              <select value={collerA} onChange={(e) => setCollerA(e.target.value as typeof collerA)} data-planche-composant-coller>
                {(["aucun", "tout", "horizontal", "vertical", "incline"] as const).map((v) => (
                  <option key={v} value={v}>{t(`planche.composant.coller.${v}`)}</option>
                ))}
              </select>
            </label>
            <label>
              <input type="checkbox" checked={decouper} onChange={(e) => setDecouper(e.target.checked)} /> {t("planche.composant.decouper")}
            </label>
            <label>
              <input type="checkbox" checked={faceCamera} onChange={(e) => setFaceCamera(e.target.checked)} /> {t("planche.composant.face-camera")}
            </label>
            <label>
              <input type="checkbox" disabled /> {t("planche.composant.ombres-soleil")}
            </label>
          </div>
        )}
        <div className="barre-groupe">
          <button type="submit" data-planche-composant-creer>{t("planche.composant.creer")}</button>
          <button type="button" onClick={onAnnuler} data-planche-composant-annuler>{t("planche.composant.annuler")}</button>
        </div>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Info entité

export interface ActionsInfoEntite {
  renommerOccurrence(id: Id, nom: string): void;
  modifierDefinition(def: Id, meta: MetadonneesDefinition & { nom?: string }): void;
  verrouiller(id: Id, verrou: boolean): void;
  masquer(ids: Id[], masquee: boolean): void;
  materiauFace(id: Id, cote: "recto" | "verso", materiau: Id | null): void;
  materiauObjet(id: Id, materiau: Id | null): void;
  balise(id: Id, balise: Id | null): void;
  renommerPlan(id: Id, nom: string): void;
}

export function PanneauInfoEntite({ modele, selection, dans, lecture, separateur, actions }: { modele: Modele; selection: readonly Id[]; dans: Id | undefined; lecture: boolean; separateur: "." | ","; actions: ActionsInfoEntite }) {
  const c = contexte(modele, dans);
  const materiaux = Object.values(modele.annotations?.materiaux ?? {});
  const balises = Object.values(modele.annotations?.balises ?? {});
  const ids = selection.filter((id) => c.faces[id] || c.aretes[id] || c.occurrences[id] || c.courbes[id] || genreAnnotation(id));
  const nb = (v: number) => (separateur === "," ? virgule(v) : v.toFixed(2));
  const fmtL = (v: number) => `${nb(v)} m`;
  const fmtA = (v: number) => `${nb(v)} m²`;
  const fmtV = (v: number) => `${nb(v)} m³`;
  const choixMateriau = (valeur: string | undefined, onChange: (v: Id | null) => void, nom: string) => (
    <select value={valeur ?? ""} disabled={lecture} aria-label={nom} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">{t("planche.info.defaut")}</option>
      {materiaux.map((m) => (
        <option key={m.id} value={m.id}>{m.nom}</option>
      ))}
    </select>
  );
  const choixBalise = (valeur: string | undefined, onChange: (v: Id | null) => void) => (
    <select value={valeur ?? ""} disabled={lecture} aria-label={t("planche.info.balise")} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">{t("planche.info.sans-balise")}</option>
      {balises.map((b) => (
        <option key={b.id} value={b.id}>{b.nom}</option>
      ))}
    </select>
  );
  if (ids.length === 0) return <p className="inspecteur-aide" data-planche-info="aucune">{t("planche.info.aucune")}</p>;
  if (ids.length > 1) {
    const faces = ids.filter((id) => c.faces[id]);
    const recto = new Set(faces.map((id) => c.faces[id]!.materiauRecto ?? ""));
    return (
      <dl className="planche-info" data-planche-info="entites">
        <dt>{t("planche.info.entites", { nombre: String(ids.length) })}</dt>
        {faces.length > 0 && (
          <>
            <dt>{t("planche.info.aire")}</dt>
            <dd>{fmtA(faces.reduce((s, id) => s + aire(modele, id, dans !== undefined ? { dans } : {}), 0))}</dd>
            <dt>{t("planche.info.recto")}</dt>
            <dd>{recto.size > 1 ? t("planche.info.multiple") : choixMateriau([...recto][0] || undefined, (v) => faces.forEach((id) => actions.materiauFace(id, "recto", v)), t("planche.info.recto"))}</dd>
          </>
        )}
      </dl>
    );
  }
  const id = ids[0]!;
  const f = c.faces[id];
  if (f) {
    return (
      <dl className="planche-info" data-planche-info="face">
        <dt>{t("planche.info.face")}</dt>
        <dd>{f.masquee ? t("planche.info.masque") : ""}</dd>
        <dt>{t("planche.info.aire")}</dt>
        <dd>{fmtA(aire(modele, id, dans !== undefined ? { dans } : {}))}</dd>
        <dt>{t("planche.info.recto")}</dt>
        <dd>{choixMateriau(f.materiauRecto, (v) => actions.materiauFace(id, "recto", v), t("planche.info.recto"))}</dd>
        <dt>{t("planche.info.verso")}</dt>
        <dd>{choixMateriau(f.materiauVerso, (v) => actions.materiauFace(id, "verso", v), t("planche.info.verso"))}</dd>
        <dt>{t("planche.info.ombres")}</dt>
        <dd />
      </dl>
    );
  }
  const k = c.courbes[id];
  if (k) {
    const L = k.aretes.reduce((s, a) => {
      const ar = c.aretes[a];
      return ar ? s + dist(c.sommets[ar.a]!.position, c.sommets[ar.b]!.position) : s;
    }, 0);
    return (
      <dl className="planche-info" data-planche-info="courbe">
        <dt>{t("planche.info.courbe")}</dt>
        <dd>{k.genre}</dd>
        <dt>{t("planche.info.longueur")}</dt>
        <dd>~ {fmtL(L)}</dd>
        <dt>{t("planche.info.rayon")}</dt>
        <dd>{fmtL(k.rayon)}</dd>
        <dt>{t("planche.info.segments")}</dt>
        <dd>{k.aretes.length}</dd>
      </dl>
    );
  }
  const a = c.aretes[id];
  if (a) {
    return (
      <dl className="planche-info" data-planche-info="arete">
        <dt>{t("planche.info.arete")}</dt>
        <dd>{a.masquee ? t("planche.info.masque") : a.adoucie ? t("planche.menu.adoucir") : ""}</dd>
        <dt>{t("planche.info.longueur")}</dt>
        <dd>{fmtL(dist(c.sommets[a.a]!.position, c.sommets[a.b]!.position))}</dd>
      </dl>
    );
  }
  const occ = c.occurrences[id];
  if (occ) {
    const d = modele.definitions[occ.definition];
    const solide = estSolide(modele, id);
    const n = nombreOccurrences(modele, occ.definition);
    const motif = solide ? null : motifNonSolide(modele, id);
    const titre = d?.genre === "composant" ? (solide ? t("planche.info.composant-solide") : t("planche.info.composant")) : solide ? t("planche.info.groupe-solide") : t("planche.info.groupe");
    const vol = solide ? volume(modele, id) : null;
    return (
      <dl className="planche-info" data-planche-info={d?.genre ?? "groupe"} data-planche-info-solide={solide}>
        <dt>
          {titre} ({t("planche.info.dans-modele", { nombre: String(n) })})
        </dt>
        <dd>{motif ? t("planche.info.pas-solide", { motif }) : ""}</dd>
        {vol !== null && (
          <>
            <dt>{t("planche.info.volume")}</dt>
            <dd data-planche-info-volume>{fmtV(vol)}</dd>
          </>
        )}
        <dt>{t("planche.info.occurrence")}</dt>
        <dd>
          <input value={occ.nom ?? ""} disabled={lecture} placeholder={occ.id} aria-label={t("planche.info.occurrence")} onChange={(e) => actions.renommerOccurrence(id, e.target.value)} data-planche-info-occurrence />
        </dd>
        <dt>{t("planche.info.definition")}</dt>
        <dd>
          <input value={d?.nom ?? ""} disabled={lecture} aria-label={t("planche.info.definition")} onChange={(e) => actions.modifierDefinition(occ.definition, { nom: e.target.value })} data-planche-info-definition />
        </dd>
        <dt>{t("planche.info.materiau")}</dt>
        <dd>{choixMateriau(occ.materiau, (v) => actions.materiauObjet(id, v), t("planche.info.materiau"))}</dd>
        <dt>{t("planche.info.balise")}</dt>
        <dd>{choixBalise(occ.balise, (v) => actions.balise(id, v))}</dd>
        <dt>{t("planche.info.ombres")}</dt>
        <dd />
        <dt>
          <label>
            <input type="checkbox" checked={occ.verrouille === true} disabled={lecture} onChange={(e) => actions.verrouiller(id, e.target.checked)} data-planche-info-verrou /> {t("planche.info.verrouille")}
          </label>
        </dt>
        <dd>
          <label>
            <input type="checkbox" checked={occ.masquee === true} disabled={lecture} onChange={(e) => actions.masquer([id], e.target.checked)} data-planche-info-masque /> {t("planche.info.masque")}
          </label>
        </dd>
      </dl>
    );
  }
  const g = genreAnnotation(id);
  const an = modele.annotations;
  if (g === "plan" && an?.plansDeCoupe[id]) {
    const p = an.plansDeCoupe[id]!;
    return (
      <dl className="planche-info" data-planche-info="plan">
        <dt>{t("planche.info.plan")}</dt>
        <dd>
          <input value={p.nom} disabled={lecture} aria-label={t("planche.info.nom")} onChange={(e) => actions.renommerPlan(id, e.target.value)} />
        </dd>
      </dl>
    );
  }
  if (g === "cote" || g === "texte" || g === "guide") {
    return (
      <dl className="planche-info" data-planche-info={g}>
        <dt>{t(g === "cote" ? "planche.info.cote" : g === "texte" ? "planche.info.texte" : "planche.info.guide")}</dt>
        <dd>{g === "texte" ? an?.textes[id]?.texte : ""}</dd>
        <dt>{t("planche.infomodele.police")}</dt>
        <dd />
      </dl>
    );
  }
  return <p className="inspecteur-aide">{t("planche.info.aucune")}</p>;
}

// ---------------------------------------------------------------------------------------------------------------
// Composants

export function PanneauComposants({ modele, lecture, onModifier, onSelectionner }: { modele: Modele; lecture: boolean; onModifier: (def: Id, meta: MetadonneesDefinition & { nom?: string }) => void; onSelectionner: (def: Id) => void }) {
  const composants = Object.values(modele.definitions).filter((d) => d.genre === "composant");
  const [edition, setEdition] = useState<{ id: Id; nom: string; description: string } | null>(null);
  if (composants.length === 0) return <p className="inspecteur-aide" data-planche-composants-vide>{t("planche.composants.aucun")}</p>;
  return (
    <ul className="planche-liste-panneau planche-composants" data-planche-composants>
      {composants.map((d) => (
        <li key={d.id} data-planche-composant-definition={d.id}>
          {edition?.id === d.id ? (
            <form
              className="planche-creation"
              onSubmit={(e) => {
                e.preventDefault();
                onModifier(d.id, { nom: edition.nom, description: edition.description });
                setEdition(null);
              }}
            >
              <label>
                {t("planche.info.nom")}
                <input value={edition.nom} onChange={(e) => setEdition({ ...edition, nom: e.target.value })} autoComplete="off" />
              </label>
              <label>
                {t("planche.composant.description")}
                <input value={edition.description} onChange={(e) => setEdition({ ...edition, description: e.target.value })} autoComplete="off" />
              </label>
              <button type="submit">{t("planche.composants.enregistrer")}</button>
            </form>
          ) : (
            <>
              <button type="button" className="planche-ligne-choix" onClick={() => onSelectionner(d.id)} title={t("planche.composants.selectionner")}>
                <strong>{d.nom}</strong> <span className="inspecteur-aide">{t("planche.composants.occurrences", { nombre: String(nombreOccurrences(modele, d.id)) })}</span>
                {d.description && <span className="inspecteur-aide"> — {d.description}</span>}
              </button>
              {!lecture && (
                <button type="button" className="canevas-icone" aria-label={t("planche.composants.modifier")} title={t("planche.composants.modifier")} onClick={() => setEdition({ id: d.id, nom: d.nom, description: d.description ?? "" })}>
                  ⋮
                </button>
              )}
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Styles, Ombres, Affichage (options de la vue, R10)

function Bascule({ cle, libelle, options, onOptions }: { cle: keyof OptionsAffichage; libelle: string; options: OptionsAffichage; onOptions: (o: Partial<OptionsAffichage>) => void }) {
  return (
    <label className="planche-bascule">
      <input type="checkbox" checked={options[cle] === true} onChange={(e) => onOptions({ [cle]: e.target.checked } as Partial<OptionsAffichage>)} data-planche-option={cle} /> {libelle}
    </label>
  );
}

export function PanneauStyles({ options, onOptions }: { options: OptionsAffichage; onOptions: (o: Partial<OptionsAffichage>) => void }) {
  return (
    <div className="planche-options" data-planche-styles>
      <Bascule cle="aretes" libelle={t("planche.styles.aretes")} options={options} onOptions={onOptions} />
      <Bascule cle="aretesArriere" libelle={t("planche.styles.aretes-arriere")} options={options} onOptions={onOptions} />
      <Bascule cle="rayonsX" libelle={t("planche.styles.rayons-x")} options={options} onOptions={onOptions} />
      <Bascule cle="couleurParBalise" libelle={t("planche.styles.couleur-balise")} options={options} onOptions={onOptions} />
      <Bascule cle="sol" libelle={t("planche.styles.sol")} options={options} onOptions={onOptions} />
      <label>
        {t("planche.styles.mode")}
        <select value={options.modeFace} onChange={(e) => onOptions({ modeFace: e.target.value as OptionsAffichage["modeFace"] })} data-planche-option="modeFace">
          {(["ombre", "monochrome", "filaire", "lignes-cachees"] as const).map((m) => (
            <option key={m} value={m}>{t(`planche.styles.mode.${m}`)}</option>
          ))}
        </select>
      </label>
      <p className="inspecteur-aide">{t("planche.styles.note")}</p>
    </div>
  );
}

export function PanneauOmbres({ options, onOptions, latitudeParcelle }: { options: OptionsAffichage; onOptions: (o: Partial<OptionsAffichage>) => void; latitudeParcelle: number | null }) {
  const h = Math.floor(options.heure);
  const mn = Math.round((options.heure - h) * 60);
  return (
    <div className="planche-options" data-planche-ombres>
      <Bascule cle="ombres" libelle={t("planche.ombres.activer")} options={options} onOptions={onOptions} />
      <Bascule cle="ombresSol" libelle={t("planche.ombres.sol")} options={options} onOptions={onOptions} />
      <label>
        {t("planche.ombres.heure")} : {h}:{String(mn).padStart(2, "0")}
        <input type="range" min={5} max={21} step={0.25} value={options.heure} onChange={(e) => onOptions({ heure: Number(e.target.value) })} data-planche-option="heure" />
      </label>
      <label>
        {t("planche.ombres.date")} : {options.jour}
        <input type="range" min={1} max={365} step={1} value={options.jour} onChange={(e) => onOptions({ jour: Number(e.target.value) })} data-planche-option="jour" />
      </label>
      <label>
        {t("planche.ombres.latitude")} : {virgule(options.latitude, 1)}°
        <input type="range" min={-66} max={66} step={0.5} value={options.latitude} onChange={(e) => onOptions({ latitude: Number(e.target.value) })} data-planche-option="latitude" />
      </label>
      {latitudeParcelle === null && <p className="inspecteur-aide">{t("planche.ombres.non-evalue")}</p>}
      <p className="inspecteur-aide">{t("planche.styles.note")}</p>
    </div>
  );
}

export function PanneauAffichage({ options, onOptions, onReafficher, onSupprimerGuides, lecture }: { options: OptionsAffichage; onOptions: (o: Partial<OptionsAffichage>) => void; onReafficher: (quoi: "tout" | "selection" | "dernier") => void; onSupprimerGuides: () => void; lecture: boolean }) {
  return (
    <div className="planche-options" data-planche-affichage>
      <h4>{t("planche.affichage.reafficher")}</h4>
      <div className="barre-groupe">
        <button type="button" disabled={lecture} onClick={() => onReafficher("tout")} data-planche-reafficher="tout">{t("planche.affichage.tout")}</button>
        <button type="button" disabled={lecture} onClick={() => onReafficher("selection")} data-planche-reafficher="selection">{t("planche.affichage.selection")}</button>
        <button type="button" disabled={lecture} onClick={() => onReafficher("dernier")} data-planche-reafficher="dernier">{t("planche.affichage.dernier")}</button>
      </div>
      <h4>{t("planche.affichage.voir")}</h4>
      <Bascule cle="objetsMasques" libelle={t("planche.affichage.objets-masques")} options={options} onOptions={onOptions} />
      <Bascule cle="geometrieMasquee" libelle={t("planche.affichage.geometrie-masquee")} options={options} onOptions={onOptions} />
      <Bascule cle="couleurParBalise" libelle={t("planche.affichage.couleur-balise")} options={options} onOptions={onOptions} />
      <Bascule cle="plansDeCoupe" libelle={t("planche.affichage.plans")} options={options} onOptions={onOptions} />
      <Bascule cle="axes" libelle={t("planche.affichage.axes")} options={options} onOptions={onOptions} />
      <Bascule cle="guides" libelle={t("planche.affichage.guides")} options={options} onOptions={onOptions} />
      <button type="button" disabled={lecture} onClick={onSupprimerGuides} data-planche-supprimer-guides>{t("planche.affichage.supprimer-guides")}</button>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Scènes

export function PanneauScenes({ modele, lecture, projection, champDeVision, onAjouter, onMettreAJour, onAppliquer, onSupprimer, onVueStandard, onProjection, onChampDeVision }: {
  modele: Modele;
  lecture: boolean;
  projection: "perspective" | "parallele";
  champDeVision: number;
  onAjouter: () => void;
  onMettreAJour: (id: Id) => void;
  onAppliquer: (s: Scene) => void;
  onSupprimer: (id: Id) => void;
  onVueStandard: (v: VueStandard) => void;
  onProjection: (p: "perspective" | "parallele") => void;
  onChampDeVision: (deg: number) => void;
}) {
  const scenes = Object.values(modele.annotations?.scenes ?? {});
  const [active, setActive] = useState<Id | null>(null);
  return (
    <div className="planche-options" data-planche-scenes>
      <div className="barre-groupe">
        <button type="button" disabled={lecture} onClick={onAjouter} data-planche-scene-ajouter>{t("planche.scenes.ajouter")}</button>
        <button type="button" disabled={lecture || !active} onClick={() => active && onMettreAJour(active)} data-planche-scene-maj>{t("planche.scenes.mettre-a-jour")}</button>
      </div>
      <h4>{t("planche.scenes.camera")}</h4>
      <label>
        <input type="radio" name="planche-projection" checked={projection === "perspective"} onChange={() => onProjection("perspective")} /> {t("planche.scenes.perspective")}
      </label>
      <label>
        <input type="radio" name="planche-projection" checked={projection === "parallele"} onChange={() => onProjection("parallele")} data-planche-projection-parallele /> {t("planche.scenes.parallele")}
      </label>
      <label>
        {t("planche.scenes.champ")} : {virgule(champDeVision, 0)}°
        <input type="range" min={1} max={120} step={1} value={Math.round(champDeVision)} onChange={(e) => onChampDeVision(Number(e.target.value))} data-planche-champ-vision />
      </label>
      <h4>{t("planche.scenes.vues")}</h4>
      <div className="planche-vues-standard">
        {(["dessus", "sud", "est", "nord", "ouest", "dessous", "iso"] as const).map((v) => (
          <button key={v} type="button" onClick={() => onVueStandard(v)} data-planche-vue-standard={v}>{t(`planche.scenes.vue.${v}`)}</button>
        ))}
      </div>
      <p className="inspecteur-aide">{t("planche.scenes.nord")}</p>
      <h4>{t("planche.scenes.mes")}</h4>
      {scenes.length === 0 && <p className="inspecteur-aide">{t("planche.scenes.aucune")}</p>}
      <ul className="planche-liste-panneau">
        {scenes.map((s) => (
          <li key={s.id} className={active === s.id ? "est-actif" : undefined} data-planche-scene={s.id}>
            <button
              type="button"
              className="planche-ligne-choix"
              onClick={() => {
                setActive(s.id);
                onAppliquer(s);
              }}
            >
              {s.nom} <span className="inspecteur-aide">{s.projection === "parallele" ? t("planche.scenes.parallele") : `${virgule(s.champDeVision, 0)}°`}</span>
            </button>
            {!lecture && (
              <button type="button" className="canevas-icone" aria-label={t("planche.scenes.supprimer")} title={t("planche.scenes.supprimer")} onClick={() => onSupprimer(s.id)}>×</button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Adoucir / lisser

export function PanneauAdoucir({ selection, lecture, onAppliquer }: { selection: readonly Id[]; lecture: boolean; onAppliquer: (angle: number, coplanaires: boolean) => void }) {
  const [angle, setAngle] = useState(30);
  const [coplanaires, setCoplanaires] = useState(false);
  const [lisser, setLisser] = useState(false);
  return (
    <div className="planche-options" data-planche-adoucir>
      <label>
        <input type="checkbox" checked={coplanaires} onChange={(e) => setCoplanaires(e.target.checked)} data-planche-adoucir-coplanaires /> {t("planche.adoucir.coplanaires")}
      </label>
      <label>
        <input type="checkbox" checked={lisser} onChange={(e) => setLisser(e.target.checked)} /> {t("planche.adoucir.lisser")}
      </label>
      <label>
        {t("planche.adoucir.angle")} : {angle}°
        <input type="range" min={0} max={180} step={1} value={angle} onChange={(e) => setAngle(Number(e.target.value))} data-planche-adoucir-angle />
      </label>
      <button type="button" disabled={lecture || selection.length === 0} onClick={() => onAppliquer(angle, coplanaires)} data-planche-adoucir-appliquer>{t("planche.adoucir.appliquer")}</button>
      {selection.length === 0 && <p className="inspecteur-aide">{t("planche.adoucir.selection")}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Info modèle

export function PanneauInfoModele({ modele, lecture, precision, onPrecision, onReglages }: { modele: Modele; lecture: boolean; precision: number; onPrecision: (d: number) => void; onReglages: (r: ReglagesPlanche) => void }) {
  const r = modele.annotations?.reglages ?? REGLAGES_DEFAUT;
  const [brouillon, setBrouillon] = useState(r);
  useEffect(() => setBrouillon(r), [r]);
  const ext = (valeur: ReglagesPlanche["extremitesCote"], onChange: (v: ReglagesPlanche["extremitesCote"]) => void, nom: string) => (
    <select value={valeur} disabled={lecture} aria-label={nom} onChange={(e) => onChange(e.target.value as ReglagesPlanche["extremitesCote"])}>
      {(["aucune", "barre", "fleche-ouverte", "fleche-fermee", "point"] as const).map((v) => (
        <option key={v} value={v}>{t(`planche.infomodele.ext.${v}`)}</option>
      ))}
    </select>
  );
  return (
    <form
      className="planche-options planche-creation"
      data-planche-info-modele
      onSubmit={(e) => {
        e.preventDefault();
        onReglages(brouillon);
      }}
    >
      <h4>{t("planche.infomodele.unites")}</h4>
      <p className="inspecteur-aide">{t("planche.infomodele.longueur", { precision: `0,${"0".repeat(precision)} m` })}</p>
      <label>
        {t("planche.infomodele.precision")}
        <select value={precision} onChange={(e) => onPrecision(Number(e.target.value))} data-planche-precision>
          {[0, 1, 2, 3].map((d) => (
            <option key={d} value={d}>{`0,${"0".repeat(d)}`}</option>
          ))}
        </select>
      </label>
      <label>
        {t("planche.infomodele.accrochage-longueur")}
        <input inputMode="decimal" disabled={lecture} value={brouillon.accrochageLongueur ?? ""} onChange={(e) => setBrouillon({ ...brouillon, accrochageLongueur: e.target.value ? Number(e.target.value.replace(",", ".")) : null })} data-planche-accrochage-longueur />
      </label>
      <label>
        {t("planche.infomodele.accrochage-angle")}
        <input inputMode="decimal" disabled={lecture} value={brouillon.accrochageAngle ?? ""} onChange={(e) => setBrouillon({ ...brouillon, accrochageAngle: e.target.value ? Number(e.target.value.replace(",", ".")) : null })} data-planche-accrochage-angle />
      </label>
      <h4>{t("planche.infomodele.texte")}</h4>
      <label>
        {t("planche.infomodele.extremites")}
        {ext(brouillon.extremitesTexte, (v) => setBrouillon({ ...brouillon, extremitesTexte: v }), t("planche.infomodele.extremites"))}
      </label>
      <label>
        {t("planche.infomodele.aligner")}
        <select value={brouillon.alignerTexte} disabled={lecture} onChange={(e) => setBrouillon({ ...brouillon, alignerTexte: e.target.value as ReglagesPlanche["alignerTexte"] })}>
          <option value="ecran">{t("planche.infomodele.al.ecran")}</option>
          <option value="epingle">{t("planche.infomodele.al.epingle")}</option>
        </select>
      </label>
      <h4>{t("planche.infomodele.cotes")}</h4>
      <label>
        {t("planche.infomodele.extremites")}
        {ext(brouillon.extremitesCote, (v) => setBrouillon({ ...brouillon, extremitesCote: v }), t("planche.infomodele.extremites"))}
      </label>
      <label>
        {t("planche.infomodele.aligner")}
        <select value={brouillon.alignerCote} disabled={lecture} onChange={(e) => setBrouillon({ ...brouillon, alignerCote: e.target.value as ReglagesPlanche["alignerCote"] })}>
          {(["dessus", "centre", "exterieur", "ecran"] as const).map((v) => (
            <option key={v} value={v}>{t(`planche.infomodele.al.${v}`)}</option>
          ))}
        </select>
      </label>
      <p className="inspecteur-aide">{t("planche.infomodele.police")}</p>
      <button type="submit" disabled={lecture} data-planche-reglages-enregistrer>{t("planche.composants.enregistrer")}</button>
    </form>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Navigateur (arbre des contextes)

export function NavigateurPlanche({ modele, selection, dans, lecture, onSelectionner, onEntrer, onCibler, onMasquer, onSupprimer }: {
  modele: Modele;
  selection: readonly Id[];
  dans: Id | undefined;
  lecture: boolean;
  onSelectionner: (id: Id, dans: Id | undefined) => void;
  onEntrer: (id: Id | undefined) => void;
  onCibler: (id: Id) => void;
  onMasquer: (id: Id, dans: Id | undefined, masquee: boolean) => void;
  onSupprimer: (id: Id, dans: Id | undefined) => void;
}) {
  const [filtre, setFiltre] = useState("");
  const [deplies, setDeplies] = useState<Set<Id>>(() => new Set());
  const choisis = new Set(selection);
  const f = filtre.trim().toLowerCase();
  const nomDe = (id: Id, defNom: string, nom?: string) => nom ?? `${defNom} (${id})`;
  const arbre = useMemo(() => {
    const rendre = (parent: Id | undefined, profondeur: number): { id: Id; parent: Id | undefined; profondeur: number; nom: string; genre: string; masquee: boolean; verrouille: boolean; enfants: number }[] => {
      const c = contexte(modele, parent);
      const r: ReturnType<typeof rendre> = [];
      for (const o of Object.values(c.occurrences)) {
        const d = modele.definitions[o.definition];
        const nom = nomDe(o.id, d?.nom ?? "Objet", o.nom);
        const enfants = d ? Object.keys(d.contenu.occurrences).length : 0;
        if (!f || nom.toLowerCase().includes(f)) r.push({ id: o.id, parent, profondeur, nom, genre: d?.genre ?? "groupe", masquee: o.masquee === true, verrouille: o.verrouille === true, enfants });
        if (profondeur < 16 && (deplies.has(o.id) || f)) r.push(...rendre(o.id, profondeur + 1));
      }
      return r;
    };
    return rendre(undefined, 0);
  }, [modele, deplies, f]);
  return (
    <div className="planche-navigateur" data-planche-navigateur>
      <input value={filtre} onChange={(e) => setFiltre(e.target.value)} placeholder={t("planche.navigateur.rechercher")} aria-label={t("planche.navigateur.rechercher")} autoComplete="off" />
      <ul role="tree">
        <li role="treeitem" aria-selected={dans === undefined} className={dans === undefined ? "est-actif" : undefined}>
          <button type="button" className="planche-ligne-choix" onClick={() => onEntrer(undefined)}>{t("planche.navigateur.racine")}</button>
        </li>
        {arbre.length === 0 && <li className="inspecteur-aide">{t("planche.navigateur.vide")}</li>}
        {arbre.map((n) => (
          <li key={n.id} role="treeitem" aria-selected={choisis.has(n.id)} aria-level={n.profondeur + 1} className={`${choisis.has(n.id) ? "est-actif" : ""}${dans === n.id ? " est-ouvert" : ""}`} style={{ paddingLeft: `${n.profondeur * 0.9}rem` }} data-planche-navigateur-objet={n.id}>
            <button type="button" className="canevas-icone planche-deplier" aria-label={deplies.has(n.id) ? t("planche.navigateur.replier") : t("planche.navigateur.deplier")} disabled={n.enfants === 0} onClick={() => setDeplies((s) => { const d = new Set(s); if (d.has(n.id)) d.delete(n.id); else d.add(n.id); return d; })}>
              {n.enfants === 0 ? "·" : deplies.has(n.id) ? "▾" : "▸"}
            </button>
            <button type="button" className="planche-ligne-choix" onClick={() => onSelectionner(n.id, n.parent)} onDoubleClick={() => !n.verrouille && onEntrer(n.id)} title={n.verrouille ? t("planche.navigateur.verrouille") : t("planche.navigateur.entrer")}>
              <span aria-hidden="true">{n.genre === "composant" ? "◈" : "▣"}</span> {n.nom}
              {n.verrouille && <span aria-label={t("planche.info.verrouille")}> 🔒</span>}
              {n.masquee && <span className="inspecteur-aide"> ({t("planche.info.masque")})</span>}
            </button>
            <button type="button" className="canevas-icone" aria-label={t("planche.navigateur.cibler")} title={t("planche.navigateur.cibler")} onClick={() => onCibler(n.id)}>⌖</button>
            {!lecture && (
              <>
                <button type="button" className="canevas-icone" aria-label={t("planche.navigateur.masquer")} title={t("planche.navigateur.masquer")} onClick={() => onMasquer(n.id, n.parent, !n.masquee)} data-planche-navigateur-masquer>{n.masquee ? "◌" : "◉"}</button>
                <button type="button" className="canevas-icone" aria-label={t("planche.navigateur.supprimer")} title={t("planche.navigateur.supprimer")} onClick={() => onSupprimer(n.id, n.parent)}>×</button>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
