/**
 * Panneaux de consultation de GeoData : Catalogue, Couches, Légende (les trois onglets du panneau gauche, concept § 4.1),
 * fiche d'objet et table des attributs. Les noms et valeurs des sources sont des données : affichés tels quels
 * (`translate="no"`), arabe compris. Une valeur absente est écrite « Valeur absente » avec son motif, jamais « 0 ».
 */
import { useEffect, useState } from "react";
import { arbreIndicateurs, categorieDe, declinaisonParDefaut, declinaisonProche, grouperIndicateurs, indicateursPrincipaux, LIBELLES_MILIEU, LIBELLES_SEXE, type FamilleIndicateurs, type Milieu, type Sexe, compterParType, type RangementCatalogue, degradeCss, regrouperCatalogue, type TypeCatalogue, formatNombre, legende, libelleAbsence, LIBELLES_USAGES, USAGES, CLASSES_MAX, CLASSES_MIN, couleursPalette, PALETTE_PAR_DEFAUT, PALETTES_CLASSES, type IdPalette, type Composition, type MethodeClassification, type StyleCouche, type ValeurIndicateur } from "@parcours/geodata-model";
import { api, type IndicateurRecu, type ValeurRasterRecue, type CoucheRecue, type Disponibilite, type LigneTable, type ValeurRecue } from "../client";
import { entreesCategories, lireSeuilsManuels, reclasser, recolorerClasse, styleThematique, type Categorie } from "../composition-ops";

/** Valeur de l'option « une couleur par entité » (jamais un identifiant d'indicateur : ceux-ci commencent par une lettre). */
const ENTITES = "__entites__";

export const formaterValeur = (v: ValeurRecue | ValeurIndicateur | undefined, unite = ""): string => {
  if (!v) return "Valeur absente — Non évaluée";
  if (v.valeur === null) return `Valeur absente — ${libelleAbsence(v.motifAbsence ?? "non-evaluee")}`;
  return `${formatNombre(v.valeur, Math.abs(v.valeur) >= 100 || Number.isInteger(v.valeur) ? 0 : 2)}${unite ? ` ${unite}` : ""}`;
};

export function PanneauCatalogue(p: { rangement?: RangementCatalogue | undefined; couches: CoucheRecue[] | null; erreur: string | null; composition: Composition; onAjouter(c: CoucheRecue): void; onRecharger(): void }) {
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
        {groupes.map(({ categorie, couches, actives: n }) => {
          // Avec un filtre, les catégories qui ont un résultat s'ouvrent d'elles-mêmes.
          const ouverte = !!f || ouvertes.has(categorie.cle);
          return (
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
                        <div className="gd-ligne-titre"><strong translate="no">{c.titre}</strong>{c.version.privee && <span className="gd-badge">Privée</span>}{c.version.synthetique && <span className="gd-badge gd-badge-alerte">Jeu synthétique</span>}</div>
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
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Fiche obligatoire d'une version (concept § 7.2) : producteur, licence, attribution, période, système, empreinte, droits. */
export function FicheVersion({ couche: c }: { couche: CoucheRecue }) {
  const v = c.version;
  return (
    <dl className="gd-fiche-version" data-gd-fiche-version>
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
 * Choix de la coloration (D-GD-17, lot A2) : une famille d'indicateurs (rangée par thème), puis sa modalité, son
 * milieu de résidence et son sexe quand la famille en a plusieurs. Une déclinaison qui n'existe pas n'est jamais
 * remplacée en silence : les autres dimensions s'adaptent à celle que l'on vient de choisir.
 */
function ChoixColoration(p: { couche: CoucheRecue; coucheId: string; style: StyleCouche; onStyle(s: StyleCouche): void; valeursDe(indicateurId: string): Promise<ValeurIndicateur[]> }) {
  const c = p.couche;
  const familles = grouperIndicateurs(c.indicateurs);
  const courant = p.style.mode === "thematique" ? (c.indicateurs.find((i) => i.id === (p.style as { indicateurId: string }).indicateurId) ?? null) : null;
  const famille = courant ? (familles.find((f) => f.indicateurs.includes(courant)) ?? null) : null;
  const representant = (f: FamilleIndicateurs<IndicateurRecu>) => (f === famille && courant ? courant : declinaisonParDefaut(f));
  const appliquer = async (id: string) => p.onStyle(styleThematique(id, await p.valeursDe(id)));
  const changer = (dim: "modalite" | "milieu" | "sexe", modalite: string | null, milieu: Milieu, sexe: Sexe) => {
    const i = famille && declinaisonProche(famille, modalite, milieu, sexe, dim);
    if (i) void appliquer(i.id);
  };
  const themes = [...new Set(familles.map((f) => f.theme))];
  const option = (f: FamilleIndicateurs<IndicateurRecu>) => <option key={`${f.theme}|${f.famille}`} value={representant(f).id} translate="no">{f.famille.includes(`(${f.indicateurs[0]!.unite})`) ? f.famille : `${f.famille} (${f.indicateurs[0]!.unite})`}</option>;
  const milieu = courant?.milieu ?? "ensemble";
  const sexe = courant?.sexe ?? "ensemble";
  return (
    <>
      <label className="gd-champ">Coloration
        <select value={courant ? courant.id : p.style.mode === "categories" ? ENTITES : ""} onChange={async (e) => {
          const id = e.target.value;
          if (!id) return p.onStyle(c.styleDefaut.mode === "simple" ? c.styleDefaut : { mode: "simple", couleur: "#2b8cbe" });
          if (id === ENTITES) return p.onStyle({ mode: "categories" });
          await appliquer(id);
        }} data-gd-indicateur={p.coucheId}>
          <option value="">Couleur unie</option>
          <option value={ENTITES}>Une couleur par entité</option>
          {themes.length === 1 && themes[0] === "Autres indicateurs" ? familles.map(option) : themes.map((t) => <optgroup key={t} label={t} translate="no">{familles.filter((f) => f.theme === t).map(option)}</optgroup>)}
        </select>
      </label>
      {c.indicateurs.length > 0 && <ArbreIndicateurs couche={c} coucheId={p.coucheId} courant={courant} onChoix={(f) => void appliquer(representant(f).id)} />}
      {famille && courant && famille.indicateurs.length > 1 && (
        <div className="gd-dimensions" data-gd-dimensions={p.coucheId}>
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
    </>
  );
}

/**
 * Arbre d'indicateurs (lot F, D-GD-26) : thèmes puis familles, repliés ; une recherche (sans accents ni casse, chaque mot
 * au début d'un mot) déplie les thèmes retenus. Choisir une famille colore la couche par sa déclinaison par défaut
 * (ou celle en cours) ; les dimensions se règlent ensuite comme avec la liste « Coloration ».
 */
function ArbreIndicateurs(p: { couche: CoucheRecue; coucheId: string; courant: IndicateurRecu | null; onChoix(f: FamilleIndicateurs<IndicateurRecu>): void }) {
  const [recherche, setRecherche] = useState("");
  const arbre = arbreIndicateurs(p.couche.indicateurs, recherche);
  const familles = arbre.reduce((n, b) => n + b.familles.length, 0);
  const cherche = recherche.trim() !== "";
  return (
    <details className="gd-arbre" data-gd-arbre={p.coucheId}>
      <summary>{`Parcourir les indicateurs (${p.couche.indicateurs.length})`}</summary>
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
    </details>
  );
}

export function PanneauCouches(p: {
  composition: Composition; couches: Map<string, CoucheRecue>; disponibilite: Record<string, Disponibilite>;
  onVisibilite(id: string): void; onOpacite(id: string, o: number): void; onEtiquettes(id: string): void; onDeplacer(id: string, s: 1 | -1): void; onRetirer(id: string): void;
  onStyle(id: string, s: StyleCouche): void; onTable(id: string): void; valeursDe(indicateurId: string): Promise<ValeurIndicateur[]>;
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
              <label className="gd-case"><input type="checkbox" checked={k.visible} onChange={() => p.onVisibilite(k.coucheId)} /><span translate="no">{c?.titre ?? k.coucheId}</span></label>
            </div>
            {indispo && <p role="status" className="gd-alerte" data-gd-indisponible>{d.motif}</p>}
            {d?.etat === "disponible" && d.versionPlusRecente && <p className="gd-discret">Une version plus récente de cette source est publiée ; la carte garde la version enregistrée.</p>}
            <label className="gd-champ">{`Opacité : ${Math.round(k.opacite * 100)} %`}<input type="range" min={0} max={100} value={Math.round(k.opacite * 100)} onChange={(e) => p.onOpacite(k.coucheId, Number(e.target.value) / 100)} /></label>
            {c && !c.raster && <label className="gd-case"><input type="checkbox" checked={!!k.etiquettes} onChange={() => p.onEtiquettes(k.coucheId)} data-gd-etiquettes={k.coucheId} />{k.style.mode === "thematique" ? "Libellés (nom et valeur abrégée)" : "Libellés (nom)"}</label>}
            {c?.raster && <p className="gd-discret" data-gd-raster-info={k.coucheId}><span translate="no">{`${c.raster.grandeur}${c.raster.unite ? ` (${c.raster.unite})` : ""}`}</span> · Couche raster : symbologie de la source, touchez la carte pour lire une valeur.</p>}
            {c && !c.raster && (
              <ChoixColoration couche={c} style={k.style} onStyle={(st) => p.onStyle(k.coucheId, st)} valeursDe={p.valeursDe} coucheId={k.coucheId} />
            )}
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

export function PanneauLegende(p: { composition: Composition; couches: Map<string, CoucheRecue>; valeurs: Map<string, Map<string, ValeurIndicateur>>; categories: Map<string, Categorie[]>; onStyle(id: string, s: StyleCouche): void }) {
  const visibles = [...p.composition.couches].reverse().filter((k) => k.visible);
  if (!visibles.length) return <p className="gd-etat">Aucune couche visible.</p>;
  return (
    <div data-gd-legende>
      {visibles.map((k) => {
        const c = p.couches.get(k.coucheId);
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
        const style = k.style;
        const ind = c?.indicateurs.find((x) => x.id === style.indicateurId);
        const vs = [...(p.valeurs.get(style.indicateurId)?.values() ?? [])];
        const entrees = legende(vs, style.seuils, style.couleurs, (x) => formatNombre(x, Math.abs(x) >= 100 ? 0 : 2));
        return (
          <section key={k.coucheId} className="gd-legende" data-gd-legende-couche={k.coucheId}>
            <h3 translate="no">{c?.titre ?? k.coucheId}</h3>
            <p translate="no">{ind ? `${ind.titre} (${ind.unite})${ind.periode ? ` — ${ind.periode}` : ""}` : style.indicateurId}</p>
            {ind?.nature === "calcule" && <p className="gd-discret">Résultat calculé par GeoData, non une valeur de la source.</p>}
            <ul className="gd-entrees">{entrees.map((e) => (
              <li key={String(e.classe)} className="gd-entree" data-classe={String(e.classe)}>
                {e.classe === "absente"
                  ? <span className="gd-pastille gd-hachure" />
                  : <input type="color" className="gd-pastille gd-pastille-choix" value={e.couleur} data-gd-couleur-classe={e.classe} title={`Couleur de la classe ${e.libelle}`} aria-label={`Couleur de la classe ${e.libelle}`}
                      onChange={(ev) => p.onStyle(k.coucheId, recolorerClasse(style, e.classe as number, ev.target.value))} />}
                {`${e.libelle} (${e.effectif})`}
              </li>
            ))}</ul>
            <Seuils style={style} onChange={(s) => p.onStyle(k.coucheId, s)} valeurs={vs} />
          </section>
        );
      })}
    </div>
  );
}

const LIBELLES_METHODES: Record<MethodeClassification, string> = {
  quantiles: "Quantiles (effectifs égaux)",
  "intervalles-egaux": "Intervalles égaux",
  "seuils-naturels": "Seuils naturels (Jenks)",
  manuel: "Seuils manuels",
};

/** Dégradé d'aperçu d'une palette (n classes), pour la liste des palettes. */
const apercu = (id: IdPalette, n: number, inverser: boolean) => `linear-gradient(to right, ${couleursPalette(id, n, inverser).flatMap((c, i, t) => [`${c} ${(i / t.length) * 100}%`, `${c} ${((i + 1) / t.length) * 100}%`]).join(", ")})`;

/**
 * Classification d'une couche thématique (lot D, D-GD-25) : méthode (quantiles, intervalles égaux, seuils naturels de
 * Jenks, seuils manuels), nombre de classes, palette prédéfinie (et inversion) ; la couleur de chaque classe se choisit
 * aussi dans la légende. Tout est enregistré avec la carte ; une valeur absente garde sa propre entrée hachurée.
 */
function Seuils({ style, valeurs, onChange }: { style: Extract<StyleCouche, { mode: "thematique" }>; valeurs: ValeurIndicateur[]; onChange(s: StyleCouche): void }) {
  const [texte, setTexte] = useState(style.seuils.join(" ; "));
  const [erreur, setErreur] = useState<string | null>(null);
  useEffect(() => setTexte(style.seuils.join(" ; ")), [style.seuils]);
  const palette = style.palette ?? PALETTE_PAR_DEFAUT;
  const classes = style.seuils.length + 1;
  return (
    <div className="gd-seuils" data-gd-classification>
      <label className="gd-champ">Classification
        <select value={style.methode} data-gd-methode onChange={(e) => onChange(reclasser(style, valeurs, { methode: e.target.value as MethodeClassification }))}>
          {(Object.keys(LIBELLES_METHODES) as MethodeClassification[]).map((m) => <option key={m} value={m}>{LIBELLES_METHODES[m]}</option>)}
        </select>
      </label>
      {style.methode !== "manuel" && (
        <label className="gd-champ">Nombre de classes
          <select value={classes} data-gd-classes onChange={(e) => onChange(reclasser(style, valeurs, { classes: Number(e.target.value) }))}>
            {Array.from({ length: CLASSES_MAX - CLASSES_MIN + 1 }, (_, i) => CLASSES_MIN + i).map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      )}
      <label className="gd-champ">Palette
        <select value={palette} data-gd-palette onChange={(e) => onChange(reclasser(style, valeurs, { palette: e.target.value as IdPalette }))}>
          {(Object.keys(PALETTES_CLASSES) as IdPalette[]).map((id) => <option key={id} value={id}>{PALETTES_CLASSES[id].libelle}</option>)}
        </select>
      </label>
      <div className="gd-degrade" style={{ background: apercu(palette, classes, !!style.inverser) }} role="img" aria-label={`Aperçu de la palette ${PALETTES_CLASSES[palette].libelle}`} data-gd-apercu-palette />
      <label className="gd-case"><input type="checkbox" checked={!!style.inverser} data-gd-inverser onChange={(e) => onChange(reclasser(style, valeurs, { inverser: e.target.checked }))} />Inverser la palette</label>
      <p className="gd-discret">Touchez la pastille d'une classe pour en choisir la couleur.</p>
      {style.methode === "manuel" && (
        <form onSubmit={(e) => {
          e.preventDefault();
          const s = lireSeuilsManuels(texte);
          if (!s) return setErreur("Seuils : nombres strictement croissants séparés par « ; » (9 au plus).");
          setErreur(null);
          onChange(reclasser({ ...style, seuils: s }, valeurs, {}));
        }}>
          <label className="gd-champ">Seuils (enregistrés avec la carte)<input value={texte} onChange={(e) => setTexte(e.target.value)} inputMode="decimal" /></label>
          {erreur && <p role="alert" className="gd-alerte">{erreur}</p>}
          <button type="submit">Appliquer les seuils</button>
        </form>
      )}
    </div>
  );
}

export function TableAttributs(p: { couche: CoucheRecue; onSelection(code: string): void; onFiltre(f: { propriete: string; operateur: "egal" | "contient"; valeur: string } | null): void; filtreActif: { propriete: string; operateur: "egal" | "contient"; valeur: string } | null; onFermer(): void }) {
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
    api.table(p.couche.id, { page, taille, tri, ordre, ...(p.filtreActif ?? {}) }).then((d) => vivant && setDonnees(d)).catch((e: Error) => vivant && setErreur(e.message));
    return () => { vivant = false; };
  }, [p.couche.id, page, tri, ordre, p.filtreActif]);
  const pages = donnees ? Math.max(1, Math.ceil(donnees.total / taille)) : 1;
  const colonnes = indicateursPrincipaux(p.couche.indicateurs);
  const trier = (t: "nom" | "code") => { if (t === tri) setOrdre(ordre === "asc" ? "desc" : "asc"); else { setTri(t); setOrdre("asc"); } setPage(1); };
  return (
    <section className="gd-table" aria-label="Table des attributs" data-gd-table={p.couche.id}>
      <div className="gd-ligne-titre"><h3 translate="no">{p.couche.titre}</h3><button type="button" onClick={p.onFermer}>Fermer la table</button></div>
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
