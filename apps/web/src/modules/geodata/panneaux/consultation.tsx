/**
 * Panneaux de consultation de GeoData : Catalogue, Couches, Légende (les trois onglets du panneau gauche, concept § 4.1),
 * fiche d'objet et table des attributs. Les noms et valeurs des sources sont des données : affichés tels quels
 * (`translate="no"`), arabe compris. Une valeur absente est écrite « Valeur absente » avec son motif, jamais « 0 ».
 */
import { useEffect, useState } from "react";
import { type EntreeLegende, arbreIndicateurs, categorieDe, declinaisonParDefaut, declinaisonProche, grouperIndicateurs, indicateurPourCle, type CleIndicateur, indicateursPrincipaux, LIBELLES_MILIEU, LIBELLES_SEXE, type FamilleIndicateurs, type Milieu, type Sexe, compterParType, type RangementCatalogue, degradeCss, regrouperCatalogue, type TypeCatalogue, formatNombre, libelleAbsence, LIBELLES_USAGES, USAGES, type Composition, type StyleCouche, type ValeurIndicateur } from "@parcours/geodata-model";
import { api, type IndicateurRecu, type ValeurRasterRecue, type CoucheRecue, type Disponibilite, type LigneTable, type ValeurRecue, type VersionRecue } from "../client";
import { entreesCategories, type Categorie } from "../composition-ops";

/** Valeur de l'option « une couleur par entité » de la liste « Coloration ». */
const ENTITES = "__entites__";

export const formaterValeur = (v: ValeurRecue | ValeurIndicateur | undefined, unite = ""): string => {
  if (!v) return "Valeur absente — Non évaluée";
  if (v.valeur === null) return `Valeur absente — ${libelleAbsence(v.motifAbsence ?? "non-evaluee")}`;
  return `${formatNombre(v.valeur, Math.abs(v.valeur) >= 100 || Number.isInteger(v.valeur) ? 0 : 2)}${unite ? ` ${unite}` : ""}`;
};

/**
 * Niveaux administratifs du pays courant (D-GD-42), lus dans la table des niveaux en base : « Limites administratives »
 * en est généré — une entrée par niveau, dans l'ordre des rangs, avec sa couche publiée ; un niveau sans couche en base
 * le dit. Ajouter un niveau en base ajoute son entrée, sans modifier l'interface.
 */
export interface NiveauCatalogue { readonly code: string; readonly rang: number; readonly pluriel: string; readonly coucheId: string | null }

export function PanneauCatalogue(p: { rangement?: RangementCatalogue | undefined; couches: CoucheRecue[] | null; erreur: string | null; composition: Composition; onAjouter(c: CoucheRecue): void; onRecharger(): void; indicateurs?: RubriqueIndicateurs | undefined; niveaux?: readonly NiveauCatalogue[] | undefined }) {
  const [filtre, setFiltre] = useState("");
  const [details, setDetails] = useState<string | null>(null);
  const [type, setType] = useState<TypeCatalogue>("vecteurs");
  const [ouvertes, setOuvertes] = useState<Set<string>>(new Set());
  if (p.erreur) return <div role="alert" className="gd-etat"><p>{p.erreur}</p><button type="button" onClick={p.onRecharger}>Réessayer</button></div>;
  if (!p.couches) return <p role="status" className="gd-etat">Chargement du catalogue…</p>;
  const f = filtre.trim().toLowerCase();
  const liste = p.couches.filter((c) => !f || `${c.titre} ${c.version.source.titre} ${c.version.source.theme} ${categorieDe(c, p.rangement).libelle}`.toLowerCase().includes(f));
  const actives = new Set(p.composition.couches.map((k) => k.coucheId));
  const groupes = regrouperCatalogue(liste, type, actives, p.rangement);
  const nombres = compterParType(p.couches);
  const basculer = (cle: string) => setOuvertes((o) => { const n = new Set(o); if (n.has(cle)) n.delete(cle); else n.add(cle); return n; });
  return (
    <div className="gd-catalogue" data-gd-catalogue>
      <div className="gd-types" role="group" aria-label="Type de couches">
        {(["vecteurs", "imagerie"] as const).map((t) => <button key={t} type="button" aria-pressed={type === t} onClick={() => setType(t)} data-gd-type={t}>{`${t === "vecteurs" ? "Vecteurs" : "Imagerie"} (${nombres[t]})`}</button>)}
      </div>
      <label className="gd-champ">Filtrer le catalogue<input type="search" value={filtre} onChange={(e) => setFiltre(e.target.value)} data-gd-filtre-catalogue /></label>
      {p.couches.length === 0 && <p className="gd-etat">Catalogue vide : aucune couche n'est encore publiée ni importée pour ce compte.</p>}
      {p.couches.length > 0 && groupes.length === 0 && <p className="gd-etat">{f ? "Aucune couche de ce type ne correspond au filtre." : "Aucune couche de ce type au catalogue."}</p>}
      <ul className="gd-categories">
        {groupes.flatMap(({ categorie, couches, actives: n }, index) => {
          // Rubrique « Indicateurs » (D-GD-31) : parmi les vecteurs, après « Géologie » (ou en dernier), jamais filtrée.
          const rubrique = p.indicateurs && type === "vecteurs" && p.indicateurs.liste.length > 0 && (categorie.cle === "geologie" || (index === groupes.length - 1 && !groupes.some((g) => g.categorie.cle === "geologie")));
          const ouverteInd = ouvertes.has("indicateurs");
          const blocIndicateurs = rubrique ? (
            <li key="indicateurs" className="gd-categorie" data-gd-categorie="indicateurs">
              <button type="button" className="gd-entete-categorie" aria-expanded={ouverteInd} aria-controls="gd-categorie-indicateurs" onClick={() => basculer("indicateurs")} data-gd-entete-categorie="indicateurs">
                <span aria-hidden="true" className="gd-chevron">{ouverteInd ? "▾" : "▸"}</span>
                <span className="gd-nom-categorie">Indicateurs</span>
                <span className={`gd-compte${p.indicateurs!.actif ? " gd-compte-actif" : ""}`} title={`${p.indicateurs!.liste.length} indicateur(s)`}>{String(p.indicateurs!.liste.length)}</span>
              </button>
              {ouverteInd && <div id="gd-categorie-indicateurs"><RubriqueIndicateursContenu {...p.indicateurs!} /></div>}
            </li>
          ) : null;
          // Avec un filtre, les catégories qui ont un résultat s'ouvrent d'elles-mêmes.
          const ouverte = !!f || ouvertes.has(categorie.cle);
          const bloc = (
            <li key={categorie.cle} className="gd-categorie" data-gd-categorie={categorie.cle}>
              <button type="button" className="gd-entete-categorie" aria-expanded={ouverte} aria-controls={`gd-categorie-${categorie.cle}`} onClick={() => basculer(categorie.cle)} data-gd-entete-categorie={categorie.cle}>
                <span aria-hidden="true" className="gd-chevron">{ouverte ? "▾" : "▸"}</span>
                <span className="gd-nom-categorie">{categorie.libelle}</span>
                <span className={`gd-compte${n ? " gd-compte-actif" : ""}`} title={`${n} couche(s) active(s) sur ${couches.length}`}>{n ? `${n}/${couches.length}` : String(couches.length)}</span>
              </button>
              {ouverte && (
                <ul className="gd-liste" id={`gd-categorie-${categorie.cle}`}>
                  {couches.map((c) => {
                    const dedans = actives.has(c.id);
                    return (
                      <li key={c.id} className={`gd-carte-couche${dedans ? " gd-active" : ""}`} data-gd-couche-catalogue={c.id}>
                        {c.niveauAdministratif && <p className="gd-niveau-admin" translate="no" data-gd-niveau-admin={c.niveauAdministratif.code}>{c.niveauAdministratif.pluriel}</p>}
                        <div className="gd-ligne-titre"><strong translate="no">{c.titre}</strong>{c.version.privee && <span className="gd-badge">Privée</span>}{c.version.synthetique && <span className="gd-badge gd-badge-alerte">Jeu synthétique</span>}<BadgeProvisoire version={c.version} /></div>
                        <p className="gd-discret" translate="no">{c.version.source.producteur}</p>
                        <p className="gd-discret">{c.typeGeometrie === "raster" ? "Couche raster (grille de valeurs)" : `${c.nombreObjets} objets · ${c.indicateurs.length} indicateur(s)`}</p>
                        <div className="gd-actions">
                          <button type="button" disabled={dedans} onClick={() => p.onAjouter(c)} data-gd-ajouter={c.id}>{dedans ? "Déjà sur la carte" : "Ajouter à la carte"}</button>
                          <button type="button" aria-expanded={details === c.id} onClick={() => setDetails(details === c.id ? null : c.id)}>Fiche de la couche</button>
                        </div>
                        {details === c.id && <FicheVersion couche={c} />}
                      </li>
                    );
                  })}
                  {/* Niveaux de la table des niveaux sans couche publiée (rangés avec les autres niveaux) : signalés, jamais inventés. */}
                  {couches.some((c) => c.niveauAdministratif) && !f && (p.niveaux ?? []).filter((n) => !p.couches!.some((c) => c.niveauAdministratif?.code === n.code)).map((n) => (
                    <li key={`niveau-${n.code}`} className="gd-carte-couche gd-niveau-sans-couche" data-gd-niveau-sans-couche={n.code}>
                      <p className="gd-niveau-admin" translate="no">{n.pluriel}</p>
                      <p className="gd-discret">Aucune couche publiée en base pour ce niveau.</p>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
          return blocIndicateurs ? [bloc, blocIndicateurs] : [bloc];
        })}
      </ul>
    </div>
  );
}

/** Fiche obligatoire d'une version (concept § 7.2) : producteur, licence, attribution, période, système, empreinte, droits. */
/**
 * Source provisoire (D-GD-54) : badge visible partout où la couche paraît (catalogue, couches, fiche), avec son motif et
 * sa décision en infobulle ; rien pour une source qualifiée.
 */
export function BadgeProvisoire({ version: v }: { version: VersionRecue }) {
  if (v.qualification?.etat !== "provisoire") return null;
  return <span className="gd-badge gd-badge-alerte" title={`Source provisoire, non qualifiée (${v.qualification.decision ?? ""}) : ${v.qualification.motif ?? ""}`} data-gd-provisoire>Source provisoire</span>;
}

export function FicheVersion({ couche: c }: { couche: CoucheRecue }) {
  const v = c.version;
  return (
    <dl className="gd-fiche-version" data-gd-fiche-version>
      {v.qualification?.etat === "provisoire" && <><dt>Qualification</dt><dd className="gd-alerte" data-gd-qualification="provisoire"><span>Source provisoire, non qualifiée</span>{" "}<span translate="no">{`(${v.qualification.decision ?? ""}) — ${v.qualification.motif ?? ""}`}</span></dd></>}
      <dt>Source</dt><dd translate="no">{v.source.titre}</dd>
      <dt>Description</dt><dd translate="no">{v.source.description || c.description || "Non renseignée"}</dd>
      <dt>Version</dt><dd translate="no">{v.libelle}</dd>
      <dt>Période</dt><dd translate="no">{v.periode ?? "Non renseignée"}</dd>
      <dt>Couverture</dt><dd translate="no">{v.source.couverture}</dd>
      <dt>Licence</dt><dd translate="no">{v.licence}</dd>
      <dt>Attribution</dt><dd translate="no">{v.attribution}</dd>
      <dt>Système source</dt><dd translate="no">{v.crsSource}</dd>
      <dt>Précision</dt><dd translate="no">{v.precision ?? "Non renseignée"}</dd>
      <dt>Empreinte SHA-256</dt><dd><code translate="no">{v.empreinte}</code></dd>
      {v.urlSource && <><dt>Adresse source</dt><dd><a href={v.urlSource} target="_blank" rel="noreferrer noopener" translate="no">{v.urlSource}</a></dd></>}
      <dt>Transformations</dt><dd translate="no">{v.transformations.length ? v.transformations.join(" ; ") : "Aucune"}</dd>
      <dt>Droits par usage</dt>
      <dd><ul className="gd-droits">{USAGES.map((u) => <li key={u} data-droit={v.droits[u]}>{`${LIBELLES_USAGES[u]} : ${v.droits[u] === "autorise" ? "autorisé" : v.droits[u] === "refuse" ? "refusé" : "non qualifié"}`}</li>)}</ul></dd>
      {c.indicateurs.length > 24 && <><dt>Indicateurs</dt><dd><p>{`${c.indicateurs.length} indicateurs, regroupés en familles :`}</p><ul>{grouperIndicateurs(c.indicateurs).map((f) => <li key={`${f.theme}|${f.famille}`}><span translate="no">{`${f.theme} — ${f.famille}`}</span>{` (${f.indicateurs.length} déclinaison(s))`}</li>)}</ul></dd></>}
      {c.indicateurs.length > 0 && c.indicateurs.length <= 24 && <><dt>Indicateurs</dt><dd><ul>{c.indicateurs.map((i) => <li key={i.id}><span translate="no">{`${i.titre} (${i.unite})`}</span>{` — ${i.nature === "calcule" ? "résultat calculé" : "valeur de la source"} ; ${i.absentes} valeur(s) absente(s)`}<br /><span className="gd-discret" translate="no">{i.methode}</span></li>)}</ul></dd></>}
    </dl>
  );
}

/**
 * Liste « Coloration » d'une couche (D-GD-32) : les seuls modes de style, couleur unie ou une couleur par entité. Aucun
 * indicateur ne s'y choisit et aucun indicateur ne recolore la couche : la coloration reste celle choisie ici.
 */
function ChoixColoration(p: { couche: CoucheRecue; coucheId: string; style: StyleCouche; onStyle(s: StyleCouche): void }) {
  const c = p.couche;
  return (
    <label className="gd-champ">Coloration
      <select value={p.style.mode === "categories" ? ENTITES : ""} onChange={(e) => {
        if (e.target.value === ENTITES) return p.onStyle({ mode: "categories" });
        p.onStyle(c.styleDefaut.mode === "simple" ? c.styleDefaut : { mode: "simple", couleur: "#2b8cbe" });
      }} data-gd-coloration={p.coucheId}>
        <option value="">Couleur unie</option>
        <option value={ENTITES}>Une couleur par entité</option>
      </select>
    </label>
  );
}

function ArbreIndicateurs(p: { liste: readonly IndicateurRecu[]; cle: string; courant: IndicateurRecu | null; onChoix(f: FamilleIndicateurs<IndicateurRecu>): void }) {
  const [recherche, setRecherche] = useState("");
  const arbre = arbreIndicateurs(p.liste, recherche);
  const familles = arbre.reduce((n, b) => n + b.familles.length, 0);
  const cherche = recherche.trim() !== "";
  return (
    <div className="gd-arbre" data-gd-arbre={p.cle}>
      <label className="gd-champ">Rechercher un indicateur
        <input type="search" value={recherche} onChange={(e) => setRecherche(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape" && recherche) { e.preventDefault(); setRecherche(""); } }} placeholder="Ex. : chômage, âge, logement" data-gd-arbre-recherche />
      </label>
      <p className="gd-discret" role="status" data-gd-arbre-compte>{cherche ? (familles ? `${familles} famille(s) trouvée(s)` : "Aucun indicateur ne correspond.") : `${arbre.length} thème(s)`}</p>
      <ul className="gd-arbre-themes">
        {arbre.map((b) => (
          <li key={b.theme}>
            <details open={cherche || (p.courant !== null && b.familles.some((f) => f.indicateurs.includes(p.courant!)))} data-gd-arbre-theme={b.theme}>
              <summary><span translate="no">{b.theme}</span>{` (${b.familles.length})`}</summary>
              <ul>
                {b.familles.map((f) => {
                  const actif = p.courant !== null && f.indicateurs.includes(p.courant);
                  return (
                    <li key={f.famille}>
                      <button type="button" className="gd-arbre-famille" aria-pressed={actif} onClick={() => p.onChoix(f)} data-gd-arbre-famille={f.famille}>
                        <span translate="no">{f.famille}</span>
                        <span className="gd-discret" translate="no">{f.indicateurs[0]!.unite}</span>
                        {f.indicateurs.length > 1 && <span className="gd-discret">{`${f.indicateurs.length} déclinaisons`}</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Rubrique « Indicateurs » du catalogue (D-GD-31) : réunion des indicateurs des couches du catalogue, un seul actif. */
export interface RubriqueIndicateurs { readonly liste: readonly IndicateurRecu[]; readonly actif: CleIndicateur | null; onChoix(i: IndicateurRecu): void }

function RubriqueIndicateursContenu(p: RubriqueIndicateurs) {
  const familles = grouperIndicateurs(p.liste);
  const courant = p.actif ? indicateurPourCle(p.liste, p.actif) : null;
  const famille = courant ? (familles.find((f) => f.indicateurs.includes(courant)) ?? null) : null;
  const milieu = courant?.milieu ?? "ensemble";
  const sexe = courant?.sexe ?? "ensemble";
  const changer = (dim: "modalite" | "milieu" | "sexe", modalite: string | null, m: Milieu, s: Sexe) => {
    const i = famille && declinaisonProche(famille, modalite, m, s, dim);
    if (i) p.onChoix(i);
  };
  return (
    <div className="gd-rubrique-indicateurs" data-gd-rubrique-indicateurs>
      <p className="gd-discret">Un indicateur choisi ici affiche sa valeur sur chaque entité des couches chargées qui le portent ; un seul à la fois ; la coloration des couches ne change pas.</p>
      <ArbreIndicateurs liste={p.liste} cle="catalogue" courant={courant} onChoix={(f) => p.onChoix(f === famille && courant ? courant : declinaisonParDefaut(f))} />
      {famille && courant && famille.indicateurs.length > 1 && (
        <div className="gd-dimensions" data-gd-dimensions="catalogue">
          {famille.modalites.length > 1 && (
            <label className="gd-champ">Modalité
              <select data-gd-dimension="modalite" value={courant.modalite ?? ""} onChange={(e) => changer("modalite", e.target.value || null, milieu, sexe)}>
                {famille.modalites.map((m) => (m === null ? <option key="" value="">Sans modalité</option> : <option key={m} value={m} translate="no">{m}</option>))}
              </select>
            </label>
          )}
          {famille.milieux.length > 1 && (
            <label className="gd-champ">Milieu de résidence
              <select data-gd-dimension="milieu" value={milieu} onChange={(e) => changer("milieu", courant.modalite, e.target.value as Milieu, sexe)}>
                {famille.milieux.map((m) => <option key={m} value={m}>{LIBELLES_MILIEU[m]}</option>)}
              </select>
            </label>
          )}
          {famille.sexes.length > 1 && (
            <label className="gd-champ">Sexe
              <select data-gd-dimension="sexe" value={sexe} onChange={(e) => changer("sexe", courant.modalite, milieu, e.target.value as Sexe)}>
                {famille.sexes.map((x) => <option key={x} value={x}>{LIBELLES_SEXE[x]}</option>)}
              </select>
            </label>
          )}
        </div>
      )}
    </div>
  );
}

export function PanneauCouches(p: {
  composition: Composition; couches: Map<string, CoucheRecue>; disponibilite: Record<string, Disponibilite>;
  /** État d'affichage de chaque couche visible dans la vue (P3-4). */
  etats?: ReadonlyMap<string, "chargement" | "vide" | "ok">;
  /** Objets distincts dessinés dans la vue, par couche (P3-4). */
  nombres?: ReadonlyMap<string, number>;
  onVisibilite(id: string): void; onOpacite(id: string, o: number): void; onEtiquettes(id: string): void; onRegrouper?(id: string): void; onDeplacer(id: string, s: 1 | -1): void; onRetirer(id: string): void;
  onStyle(id: string, s: StyleCouche): void; onTable(id: string): void;
  /** Indicateur actif du catalogue (D-GD-31, D-GD-32) : par couche qui le porte ; couches où ses valeurs sont masquées. */
  indicateurs?: ReadonlyMap<string, IndicateurRecu> | undefined; masques?: ReadonlySet<string> | undefined; onAfficherIndicateur?(id: string, afficher: boolean): void;
  /** Coloration selon l'indicateur actif (D-GD-55) : couches où elle est coupée. */
  colorationsCoupees?: ReadonlySet<string>; onColorerIndicateur?(id: string, colorer: boolean): void;
}) {
  if (!p.composition.couches.length) return <p className="gd-etat">Aucune couche active : ajoutez-en depuis le Catalogue.</p>;
  const ordre = [...p.composition.couches].reverse();
  return (
    <ol className="gd-liste" data-gd-couches>
      {ordre.map((k, i) => {
        const c = p.couches.get(k.coucheId);
        const d = p.disponibilite[k.coucheId];
        const indispo = d && d.etat !== "disponible";
        return (
          <li key={k.coucheId} className="gd-carte-couche" data-gd-couche-active={k.coucheId}>
            <div className="gd-ligne-titre">
              <label className="gd-case"><input type="checkbox" checked={k.visible} onChange={() => p.onVisibilite(k.coucheId)} /><span translate="no">{c?.titre ?? k.coucheId}</span></label>{c && <BadgeProvisoire version={c.version} />}
            </div>
            {indispo && <p role="status" className="gd-alerte" data-gd-indisponible>{d.motif}</p>}
            {k.visible && p.etats?.get(k.coucheId) === "chargement" && <p className="gd-discret" role="status" data-gd-etat-couche="chargement">Chargement…</p>}
            {k.visible && p.etats?.get(k.coucheId) === "ok" && p.nombres?.has(k.coucheId) && <p className="gd-discret" data-gd-etat-couche="ok"><span>{formatNombre(p.nombres.get(k.coucheId)!, 0)}</span> <span>objet(s) dessiné(s) dans la vue</span></p>}
            {k.visible && p.etats?.get(k.coucheId) === "vide" && <p className="gd-discret" role="status" data-gd-etat-couche="vide">Aucun objet dans la vue : déplacez ou dézoomez la carte.</p>}
            {/* Limites administratives (D-GD-44) : un mélange de versions n'est jamais silencieux, les frontières d'une version
                antérieure peuvent ne pas coïncider avec celles des autres niveaux. */}
            {d?.etat === "disponible" && d.versionPlusRecente && (c?.niveau
              ? <p role="status" className="gd-alerte" data-gd-version-anterieure={k.coucheId}>Contours d'une version antérieure : leurs limites peuvent ne pas coïncider avec celles des autres niveaux administratifs. Retirez cette couche puis ajoutez-la depuis le Catalogue pour afficher la version publiée.</p>
              : <p className="gd-discret">Une version plus récente de cette source est publiée ; la carte garde la version enregistrée.</p>)}
            <label className="gd-champ">{`Opacité : ${Math.round(k.opacite * 100)} %`}<input type="range" min={0} max={100} value={Math.round(k.opacite * 100)} onChange={(e) => p.onOpacite(k.coucheId, Number(e.target.value) / 100)} /></label>
            {c && !c.raster && <label className="gd-case"><input type="checkbox" checked={!!k.etiquettes} onChange={() => p.onEtiquettes(k.coucheId)} data-gd-etiquettes={k.coucheId} />Libellés (nom)</label>}
            {c && (c.typeGeometrie === "point" || c.typeGeometrie === "mixte") && p.onRegrouper && (
              <label className="gd-case" title="Points réunis en grappes numérotées jusqu'au zoom 13 ; touchez une grappe pour vous en rapprocher. Sans effet sur une couche filtrée.">
                <input type="checkbox" checked={!!k.regrouper} onChange={() => p.onRegrouper?.(k.coucheId)} data-gd-regrouper={k.coucheId} />Regrouper les points
              </label>
            )}
            {c?.raster && <p className="gd-discret" data-gd-raster-info={k.coucheId}><span translate="no">{`${c.raster.grandeur}${c.raster.unite ? ` (${c.raster.unite})` : ""}`}</span> · Couche raster : symbologie de la source, touchez la carte pour lire une valeur.</p>}
            {c && p.indicateurs?.get(k.coucheId) && (
              <label className="gd-case" data-gd-indicateur-affiche={k.coucheId}>
                <input type="checkbox" checked={!p.masques?.has(k.coucheId)} onChange={(e) => p.onAfficherIndicateur?.(k.coucheId, e.target.checked)} />
                Afficher l'indicateur
                <span className="gd-discret" translate="no">{` — ${p.indicateurs.get(k.coucheId)!.titre}`}</span>
              </label>
            )}
            {c && p.indicateurs?.get(k.coucheId) && (
              <label className="gd-case" data-gd-indicateur-couleur={k.coucheId}>
                <input type="checkbox" checked={!p.colorationsCoupees?.has(k.coucheId)} onChange={(e) => p.onColorerIndicateur?.(k.coucheId, e.target.checked)} />
                Colorer selon l'indicateur
              </label>
            )}
            {c && !c.raster && <ChoixColoration couche={c} style={k.style} onStyle={(st) => p.onStyle(k.coucheId, st)} coucheId={k.coucheId} />}
            {k.style.mode === "simple" && <label className="gd-champ">Couleur<input type="color" value={k.style.couleur} onChange={(e) => p.onStyle(k.coucheId, { mode: "simple", couleur: e.target.value })} /></label>}
            <div className="gd-actions">
              <button type="button" onClick={() => p.onDeplacer(k.coucheId, 1)} disabled={i === 0} aria-label={`Monter ${c?.titre ?? ""}`}>Monter</button>
              <button type="button" onClick={() => p.onDeplacer(k.coucheId, -1)} disabled={i === ordre.length - 1} aria-label={`Descendre ${c?.titre ?? ""}`}>Descendre</button>
              <button type="button" onClick={() => p.onTable(k.coucheId)} disabled={!!indispo || !!c?.raster}>Table</button>
              <button type="button" onClick={() => p.onRetirer(k.coucheId)}>Retirer</button>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function PanneauLegende(p: { composition: Composition; couches: Map<string, CoucheRecue>; categories: Map<string, Categorie[]>; /** Couches colorées selon l'indicateur actif (D-GD-55). */ colorations?: ReadonlyMap<string, { indicateur: IndicateurRecu; entrees: readonly EntreeLegende[] }> }) {
  const visibles = [...p.composition.couches].reverse().filter((k) => k.visible);
  if (!visibles.length) return <p className="gd-etat">Aucune couche visible.</p>;
  return (
    <div data-gd-legende>
      {visibles.map((k) => {
        const c = p.couches.get(k.coucheId);
        const col = p.colorations?.get(k.coucheId);
        if (col) return <section key={k.coucheId} className="gd-legende" data-gd-legende-couche={k.coucheId}><h3 translate="no">{c?.titre ?? k.coucheId}</h3><EntreesIndicateur indicateur={col.indicateur} entrees={col.entrees} /></section>;
        if (k.style.mode === "simple") return <section key={k.coucheId} className="gd-legende"><h3 translate="no">{c?.titre ?? k.coucheId}</h3><p className="gd-entree"><span className="gd-pastille" style={{ background: k.style.couleur }} />Objets de la couche</p></section>;
        if (k.style.mode === "raster") {
          const r = c?.raster;
          if (!r) return null;
          return (
            <section key={k.coucheId} className="gd-legende" data-gd-legende-couche={k.coucheId} data-gd-legende-raster>
              <h3 translate="no">{c.titre}</h3>
              <p translate="no">{`${r.grandeur}${r.unite ? ` (${r.unite})` : ""}`}</p>
              {r.classes ? (
                <ul className="gd-entrees">{r.classes.map((cl) => <li key={cl.valeur} className="gd-entree"><span className="gd-pastille" style={{ background: cl.couleur }} /><span translate="no">{cl.libelle}</span></li>)}</ul>
              ) : (
                <div className="gd-degrade-bloc">
                  <div className="gd-degrade" style={{ background: degradeCss(r.palette) }} role="img" aria-label={`Dégradé de ${formatNombre(r.min, 2)} à ${formatNombre(r.max, 2)}`} />
                  <div className="gd-degrade-bornes"><span>{formatNombre(r.min, Math.abs(r.min) >= 100 ? 0 : 2)}</span><span>{formatNombre(r.max, Math.abs(r.max) >= 100 ? 0 : 2)}</span></div>
                </div>
              )}
              <p className="gd-discret">Cellule sans valeur : transparente (non évaluée, jamais zéro).</p>
            </section>
          );
        }
        if (k.style.mode === "categories") {
          const cs = p.categories.get(k.coucheId);
          return (
            <section key={k.coucheId} className="gd-legende" data-gd-legende-couche={k.coucheId}>
              <h3 translate="no">{c?.titre ?? k.coucheId}</h3>
              <p>Une couleur par entité (repère visuel, sans valeur).</p>
              {!cs ? <p role="status" className="gd-discret">Chargement des couleurs…</p> : (
                <ul className="gd-entrees">{entreesCategories(cs).map((e) => <li key={String(e.classe)} className="gd-entree" data-gd-entite={e.couleur ? "" : undefined}>{e.couleur && <span className="gd-pastille" style={{ background: e.couleur }} />}<span translate={e.couleur ? "no" : undefined}>{e.libelle}</span></li>)}</ul>
              )}
            </section>
          );
        }
        // Ancien style thématique (avant D-GD-32) : plus rendu, la couche est en couleur unie par défaut.
        return <section key={k.coucheId} className="gd-legende"><h3 translate="no">{c?.titre ?? k.coucheId}</h3><p className="gd-entree"><span className="gd-pastille" style={{ background: "#2b8cbe" }} />Objets de la couche</p></section>;
      })}
    </div>
  );
}

export function TableAttributs(p: { couche: CoucheRecue; onSelection(code: string): void; onFiltre(f: { propriete: string; operateur: "egal" | "contient"; valeur: string } | null): void; filtreActif: { propriete: string; operateur: "egal" | "contient"; valeur: string } | null; onFermer(): void;
  /** Zone d'étude qui filtre (D-GD-41) : seuls les objets qui la recoupent ; null = aucune. */
  zone?: { readonly id: string; readonly nom: string } | null }) {
  const [page, setPage] = useState(1);
  const [tri, setTri] = useState<"nom" | "code">("nom");
  const [ordre, setOrdre] = useState<"asc" | "desc">("asc");
  const [donnees, setDonnees] = useState<{ total: number; lignes: LigneTable[] } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [propriete, setPropriete] = useState(p.filtreActif?.propriete ?? "nom");
  const [operateur, setOperateur] = useState<"egal" | "contient">(p.filtreActif?.operateur ?? "contient");
  const [valeur, setValeur] = useState(p.filtreActif?.valeur ?? "");
  const taille = 25;
  useEffect(() => {
    let vivant = true;
    setErreur(null);
    api.table(p.couche.id, { page, taille, tri, ordre, ...(p.filtreActif ?? {}), zone: p.zone?.id ?? null }).then((d) => vivant && setDonnees(d)).catch((e: Error) => vivant && setErreur(e.message));
    return () => { vivant = false; };
  }, [p.couche.id, page, tri, ordre, p.filtreActif, p.zone?.id]);
  useEffect(() => setPage(1), [p.zone?.id]);
  const pages = donnees ? Math.max(1, Math.ceil(donnees.total / taille)) : 1;
  const colonnes = indicateursPrincipaux(p.couche.indicateurs);
  const trier = (t: "nom" | "code") => { if (t === tri) setOrdre(ordre === "asc" ? "desc" : "asc"); else { setTri(t); setOrdre("asc"); } setPage(1); };
  return (
    <section className="gd-table" aria-label="Table des attributs" data-gd-table={p.couche.id}>
      <div className="gd-ligne-titre"><h3 translate="no">{p.couche.titre}</h3><button type="button" onClick={p.onFermer}>Fermer la table</button></div>
      {p.zone && <p className="gd-discret" data-gd-table-zone={p.zone.id}><span>Objets qui recoupent la zone d'étude</span> <span translate="no">{`« ${p.zone.nom} »`}</span></p>}
      <form className="gd-filtre" onSubmit={(e) => { e.preventDefault(); setPage(1); p.onFiltre(valeur.trim() ? { propriete, operateur, valeur: valeur.trim() } : null); }}>
        <label className="gd-champ">Propriété<select value={propriete} onChange={(e) => setPropriete(e.target.value)}><option value="nom">nom</option><option value="code">code</option>{p.couche.proprietesExposees.map((x) => <option key={x} value={x} translate="no">{x}</option>)}</select></label>
        <label className="gd-champ">Condition<select value={operateur} onChange={(e) => setOperateur(e.target.value as "egal" | "contient")}><option value="contient">contient</option><option value="egal">est égal à</option></select></label>
        <label className="gd-champ">Valeur<input value={valeur} onChange={(e) => setValeur(e.target.value)} /></label>
        <button type="submit">Filtrer</button>
        {p.filtreActif && <button type="button" onClick={() => { setValeur(""); setPage(1); p.onFiltre(null); }}>Retirer le filtre</button>}
      </form>
      {erreur && <p role="alert" className="gd-alerte">{erreur}</p>}
      {!donnees && !erreur && <p role="status">Chargement de la table…</p>}
      {donnees && (
        <>
          <p className="gd-discret" role="status">{`${donnees.total} objet(s) · page ${page} sur ${pages}`}</p>
          {colonnes.length < p.couche.indicateurs.length && <p className="gd-discret" data-gd-colonnes-principales>{`${colonnes.length} indicateurs principaux sur ${p.couche.indicateurs.length} ; la fiche d'un objet les montre tous.`}</p>}
          <div className="gd-defilement">
            <table>
              <thead><tr>
                <th scope="col" aria-sort={tri === "code" ? (ordre === "asc" ? "ascending" : "descending") : "none"}><button type="button" onClick={() => trier("code")}>Code</button></th>
                <th scope="col" aria-sort={tri === "nom" ? (ordre === "asc" ? "ascending" : "descending") : "none"}><button type="button" onClick={() => trier("nom")}>Nom</button></th>
                {colonnes.map((i) => <th key={i.id} scope="col" translate="no">{`${i.titre} (${i.unite})`}</th>)}
                <th scope="col"><span className="sr-only">Actions</span></th>
              </tr></thead>
              <tbody>
                {donnees.lignes.map((l) => (
                  <tr key={l.code} data-gd-ligne={l.code}>
                    <td translate="no">{l.code}</td>
                    <td translate="no">{l.nom ?? "—"}</td>
                    {colonnes.map((i) => <td key={i.id} data-absente={l.valeurs[i.id]?.valeur == null ? "" : undefined}>{formaterValeur(l.valeurs[i.id])}</td>)}
                    <td><button type="button" onClick={() => p.onSelection(l.code)} aria-label={`Voir la fiche de ${l.nom ?? l.code}`}>Fiche</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="gd-actions">
            <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>Page précédente</button>
            <button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)}>Page suivante</button>
          </div>
        </>
      )}
    </section>
  );
}


/** Valeur d'une couche raster au point touché (D-GD-13) : « non évaluée » hors emprise ou sans donnée, jamais zéro. */
export function FicheValeur(p: { titre: string; etat: "chargement" | "erreur" | "ok"; recue?: ValeurRasterRecue; erreur?: string; onFermer(): void }) {
  if (p.etat === "chargement") return <p role="status" className="gd-etat">Lecture de la valeur…</p>;
  if (p.etat === "erreur") return <p role="alert" className="gd-etat">{p.erreur}</p>;
  const r = p.recue!;
  return (
    <article className="gd-fiche" data-gd-valeur-raster>
      <h3 translate="no">{p.titre}</h3>
      <p className="gd-discret">{`lon ${r.lon.toFixed(5)} · lat ${r.lat.toFixed(5)}`}</p>
      <dl className="gd-valeurs"><div data-absente={r.valeur === null ? "" : undefined}><dt translate="no">{r.grandeur}</dt><dd>{r.valeur === null ? "Non évaluée (hors emprise ou cellule sans donnée)" : r.classe ? <span translate="no">{r.classe}</span> : `${formatNombre(r.valeur, Math.abs(r.valeur) >= 100 ? 0 : 2)}${r.unite ? ` ${r.unite}` : ""}`}</dd></div></dl>
      <div className="gd-actions"><button type="button" onClick={p.onFermer}>Fermer</button></div>
    </article>
  );
}

/**
 * Légende de la coloration selon l'indicateur actif (D-GD-55), sur la carte : indicateur, unité, classes (bornes et nombre
 * d'entités), valeur absente en gris (jamais zéro), source de la couche et son statut provisoire le cas échéant.
 */
export function LegendeIndicateur(p: { colorations: ReadonlyMap<string, { indicateur: IndicateurRecu; entrees: readonly EntreeLegende[] }>; couches: ReadonlyMap<string, CoucheRecue>; /** Panneau Données ouvert à gauche (bureau). */ decalee?: boolean }) {
  return (
    <section className={`gd-legende-indicateur${p.decalee ? " gd-legende-decalee" : ""}`} aria-label="Légende de l'indicateur" data-gd-legende-indicateur>
      {[...p.colorations].map(([id, c]) => {
        const couche = p.couches.get(id);
        return (
          <div key={id}>
            <EntreesIndicateur indicateur={c.indicateur} entrees={c.entrees} />
            {couche && <p className="gd-discret"><span translate="no">{couche.version.attribution}</span>{couche.version.qualification?.etat === "provisoire" && <>{" · "}<span>Source provisoire</span></>}</p>}
          </div>
        );
      })}
    </section>
  );
}

/** Classes de la coloration selon l'indicateur (D-GD-55) : titre, unité, bornes, effectifs, valeur absente. */
function EntreesIndicateur({ indicateur: i, entrees }: { indicateur: IndicateurRecu; entrees: readonly EntreeLegende[] }) {
  return (
    <>
      <h3 translate="no">{i.titre}{i.unite ? ` (${i.unite})` : ""}</h3>
      <ul className="gd-entrees" data-gd-legende-classes>
        {entrees.map((e) => (
          <li key={String(e.classe)} className="gd-entree">
            <span className="gd-pastille" style={{ background: e.couleur }} />
            {e.classe === "absente" ? <span>Valeur absente</span> : <span translate="no">{e.libelle}</span>}
            <span className="gd-discret" translate="no">{` (${e.effectif})`}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

