/**
 * Onglets du tableau de bord RGPH 2024 (D-GD-37) : « Chiffres clés 2024 », « Tableaux RGPH 2024 », « CEE 2024 »,
 * « Concepts et définitions ». Interface ≠ base de données (D-GD-29) : la définition des blocs, les concepts et les
 * valeurs viennent de l'API (tables `geodata_tableaux_bord`, `geodata_concepts`, `geodata_valeurs`) ; ce fichier ne
 * contient aucun chiffre ni aucun libellé d'indicateur. Une valeur absente s'affiche « Donnée non disponible », jamais
 * zéro ; un résultat composé (somme, rapport) ou un total calculé est marqué d'un astérisque et expliqué.
 * Zone : celle choisie sur la carte (entité sélectionnée ou niveau de la barre territoriale), sinon la zone nationale de
 * la définition ; changeable ici par le filtre de zone (découpage territorial en base).
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import {
  evaluer, evaluerBloc, formaterNombre, LIBELLES_MILIEU, LIBELLES_SEXE, tableauxParTheme, trierLignes, validerDefinitionTableauDeBord, versCsv,
  type Bloc, type BlocTableau, type DefinitionTableauDeBord, type Expression, type Graphique, type IndicateurZone, type OngletGeoData, type PaysTerritorial, type UniteTerritoriale, type ValeurEvaluee,
} from "@parcours/geodata-model";
import { api, type ConceptsRecus, type TableauDeBordRecu } from "../client";

export interface ZoneCarte { readonly pays: string | null; readonly rang: number; readonly code: string; readonly nom: string; readonly coucheId: string | null }
type OngletBord = Exclude<OngletGeoData, "cartes">;
interface Etape { readonly code: string; readonly nom: string; readonly rang: number }

export const DONNEE_NON_DISPONIBLE = "Donnée non disponible";
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
/** Nombres au format français : l'affichage anglais (D-163) les convertit comme le reste de l'interface. */
const LOCALE = "fr-FR";
const nombre = (v: number | null, decimales: number | null) => formaterNombre(v, decimales, LOCALE);

/** Téléchargement d'un fichier produit dans le navigateur (aucun envoi au serveur). */
function telecharger(nom: string, contenu: string) {
  const url = URL.createObjectURL(new Blob([contenu], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nom;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const nomFichier = (cle: string, zone: string) => `geodata-${cle}-${zone}.csv`.replace(/[^A-Za-z0-9._-]+/g, "-");

// ——— Cellule de valeur ———

function Valeur({ v, decimales }: { v: ValeurEvaluee; decimales: number | null }) {
  const t = nombre(v.valeur, decimales);
  if (t === null) return <span className="gd-nd" data-gd-nd data-gd-motif={v.motif ?? ""}>{DONNEE_NON_DISPONIBLE}</span>;
  return <span data-gd-valeur={v.valeur ?? ""}><span translate="no">{t}</span>{v.calcule && <abbr className="gd-calcule" title="Calculé par GeoData" data-gd-calcule>*</abbr>}</span>;
}

// ——— Graphique SVG interne (aucune dépendance) ———

/** Libellés des catégories Milieu / Sexe (modèle) → jeton de couleur de la palette partagée. */
const CATEGORIE_DE_LIBELLE = new Map<string, string>([...Object.entries(LIBELLES_MILIEU), ...Object.entries(LIBELLES_SEXE)].map(([k, v]) => [v, k]));
const COULEURS = ["var(--gd-serie-1)", "var(--gd-serie-2)", "var(--gd-serie-3)", "var(--gd-serie-4)", "var(--gd-serie-5)", "var(--gd-serie-6)"];

export function GraphiqueSvg({ type, titre, colonnes, lignes, decimales }: { type: Graphique; titre: string; colonnes: readonly string[]; lignes: readonly { libelle: string; valeurs: readonly (number | null)[] }[]; decimales: number | null }) {
  // Une courbe suit la première colonne (séries d'unités différentes non superposées) ; les barres montrent toutes les colonnes.
  const series = type === "courbe" ? [0] : colonnes.map((_, i) => i);
  const presentes = lignes.flatMap((l) => series.map((s) => l.valeurs[s] ?? null)).filter((x): x is number => x !== null);
  if (!presentes.length) return <p className="gd-nd gd-graphique-vide" data-gd-graphique-vide>{`${DONNEE_NON_DISPONIBLE} : aucune valeur à représenter.`}</p>;
  const max = Math.max(...presentes, 0) || 1;
  const etiquette = (v: number) => nombre(v, decimales) ?? "";
  // Une seule série (barres) : chaque catégorie a sa couleur et sa légende (ex. Urbain, Rural, Ensemble) ; plusieurs
  // séries : une couleur par colonne, comme la légende.
  const parLigne = series.length === 1 && type !== "courbe" && lignes.length > 1;
  // Une série ou une catégorie nommée Urbain / Rural / Ensemble / Masculin / Féminin prend la couleur de sa catégorie
  // (palette partagée --gd-cat-*, la même que les tableaux de la fiche) ; sinon la couleur de son rang.
  const couleurDe = (libelle: string | undefined, rang: number) => { const c = libelle === undefined ? undefined : CATEGORIE_DE_LIBELLE.get(libelle); return c ? `var(--gd-cat-${c})` : COULEURS[rang % COULEURS.length]; };
  const couleur = (s: number, i: number) => (parLigne ? couleurDe(lignes[i]?.libelle, i) : couleurDe(colonnes[s], s));
  const entrees = parLigne ? lignes.map((li, i) => ({ cle: `l${i}`, libelle: li.libelle, i })) : series.length > 1 ? series.map((s) => ({ cle: `s${s}`, libelle: colonnes[s]!, i: s })) : [];
  // Barres horizontales d'une seule série : chaque libellé est déjà écrit au-dessus de sa barre, pas de légende en double.
  const legende = entrees.length > 0 && !(parLigne && type === "barres-horizontales") && (
    <ul className="gd-legende-graphique" aria-hidden="true">{entrees.map((e) => <li key={e.cle}><span style={{ background: couleurDe(e.libelle, e.i) }} />{e.libelle}</li>)}</ul>
  );
  if (type === "barres-horizontales") {
    // Libellé complet au-dessus de ses barres (jamais tronqué : il reste traduisible et lisible).
    const hLigne = 12 * series.length + 26, ml = 8, l = 560, h = lignes.length * hLigne + 12, larg = l - ml - 70;
    return (
      <figure className="gd-graphique" data-gd-graphique={type}>
        <svg viewBox={`0 0 ${l} ${h}`} role="img" aria-label={`Graphique du bloc : ${titre}`} preserveAspectRatio="xMinYMin meet">

          {lignes.map((li, i) => (
            <g key={li.libelle} transform={`translate(0 ${8 + i * hLigne})`}>
              <text x={ml} y={8} className="gd-txt gd-txt-libelle">{li.libelle}</text>
              {series.map((s, k) => {
                const v = li.valeurs[s] ?? null;
                if (v === null) return <text key={s} x={ml + 4} y={14 + k * 12 + 9} className="gd-txt gd-txt-nd">n. d.</text>;
                const w = Math.max(1, (v / max) * larg);
                return <g key={s}><rect x={ml} y={14 + k * 12} width={w} height={10} fill={couleur(s, i)}><title>{`${li.libelle} — ${colonnes[s]} : ${etiquette(v)}`}</title></rect><text x={ml + w + 4} y={14 + k * 12 + 8} className="gd-txt">{etiquette(v)}</text></g>;
              })}
            </g>
          ))}
        </svg>
        {legende}
      </figure>
    );
  }
  const n = lignes.length;
  // Libellés complets (jamais tronqués) ; inclinés quand ils ne tiennent pas sous leur groupe.
  const pasEstime = (560 - 74) / n, incline = lignes.some((li) => li.libelle.length * 6 > pasEstime);
  const l = 560, h = incline ? 270 : 230, ml = 64, mb = incline ? 84 : 44, mh = 12, largeur = l - ml - 10, hauteur = h - mb - mh;
  const pas = largeur / n;
  const y = (v: number) => mh + hauteur - (v / max) * hauteur;
  // Graduation du milieu : entière quand toutes les valeurs le sont (jamais « 224 342,5 » personnes).
  const entieres = presentes.every((v) => Number.isInteger(v));
  const graduations = [0, entieres ? Math.round(max / 2) : max / 2, max];
  return (
    <figure className="gd-graphique" data-gd-graphique={type}>
      <svg viewBox={`0 0 ${l} ${h}`} role="img" aria-label={`Graphique du bloc : ${titre}`} preserveAspectRatio="xMinYMin meet">
        {graduations.map((g) => <g key={g}><line x1={ml} x2={l - 10} y1={y(g)} y2={y(g)} className="gd-grille" /><text x={ml - 6} y={y(g)} textAnchor="end" dominantBaseline="middle" className="gd-txt">{etiquette(g)}</text></g>)}
        {lignes.map((li, i) => (incline
          ? <text key={li.libelle} x={ml + pas * i + pas / 2} y={h - mb + 12} textAnchor="end" transform={`rotate(-30 ${ml + pas * i + pas / 2} ${h - mb + 12})`} className="gd-txt">{li.libelle}</text>
          : <text key={li.libelle} x={ml + pas * i + pas / 2} y={h - mb + 16} textAnchor="middle" className="gd-txt">{li.libelle}</text>))}
        {type === "barres" && lignes.map((li, i) => series.map((s, k) => {
          const v = li.valeurs[s] ?? null;
          const lb = (pas * 0.78) / series.length, x = ml + pas * i + pas * 0.11 + k * lb;
          if (v === null) return <text key={`${i}-${s}`} x={x + lb / 2} y={y(0) - 4} textAnchor="middle" className="gd-txt gd-txt-nd">n. d.</text>;
          return <rect key={`${i}-${s}`} x={x} y={y(v)} width={Math.max(1, lb - 2)} height={Math.max(0, y(0) - y(v))} fill={couleur(s, i)}><title>{`${li.libelle} — ${colonnes[s]} : ${etiquette(v)}`}</title></rect>;
        }))}
        {type === "courbe" && (() => {
          const pts = lignes.map((li, i) => ({ x: ml + pas * i + pas / 2, v: li.valeurs[0] ?? null, libelle: li.libelle }));
          const segments: string[] = [];
          pts.forEach((p, i) => { const q = pts[i - 1]; if (p.v !== null && q && q.v !== null) segments.push(`M${q.x},${y(q.v)}L${p.x},${y(p.v)}`); });
          return <g>
            <path d={segments.join("")} stroke={COULEURS[0]} strokeWidth={2} fill="none" />
            {pts.map((p) => (p.v === null ? <text key={p.libelle} x={p.x} y={y(0) - 4} textAnchor="middle" className="gd-txt gd-txt-nd">n. d.</text> : <circle key={p.libelle} cx={p.x} cy={y(p.v)} r={4} fill={COULEURS[0]}><title>{`${p.libelle} — ${colonnes[0]} : ${etiquette(p.v)}`}</title></circle>))}
          </g>;
        })()}
        <line x1={ml} x2={l - 10} y1={y(0)} y2={y(0)} className="gd-axe" />
      </svg>
      {legende}
    </figure>
  );
}

// ——— Tableau triable ———

interface ColonneTable { readonly libelle: string; readonly groupe?: string }
interface LigneTableBord { readonly cle: string; readonly libelle: string; readonly unite?: string | null; readonly valeurs: readonly ValeurEvaluee[] }

export function TableTriable({ legende, enTete, colonnes, lignes, decimales, avecUnite = false, zone, libellesDonnees = false, etiquetteId }: { libellesDonnees?: boolean; etiquetteId?: string; legende: string; enTete: string; colonnes: readonly ColonneTable[]; lignes: readonly LigneTableBord[]; decimales: number | null; avecUnite?: boolean; zone?: string }) {
  const [tri, setTri] = useState<{ col: number; sens: "asc" | "desc" } | null>(null);
  const triees = useMemo(() => (tri ? trierLignes(lignes, (l) => (tri.col < 0 ? l.libelle : l.valeurs[tri.col]?.valeur ?? null), tri.sens) : lignes), [lignes, tri]);
  const basculer = (col: number) => setTri((t) => (t && t.col === col ? (t.sens === "asc" ? { col, sens: "desc" } : null) : { col, sens: col < 0 ? "asc" : "desc" }));
  const ariaSort = (col: number) => (tri?.col === col ? (tri.sens === "asc" ? "ascending" : "descending") : "none");
  const groupes = colonnes.some((c) => c.groupe) ? colonnes.reduce<{ libelle: string; n: number }[]>((acc, c) => { const d = acc[acc.length - 1]; if (d && d.libelle === c.groupe) d.n++; else acc.push({ libelle: c.groupe ?? "", n: 1 }); return acc; }, []) : null;
  const fixes = 1 + (avecUnite ? 1 : 0);
  const entete = (libelle: string, col: number) => (
    <th scope="col" aria-sort={ariaSort(col)} key={col}>
      <button type="button" className="gd-tri" onClick={() => basculer(col)} data-gd-tri={col}>{libelle}<span aria-hidden="true">{tri?.col === col ? (tri.sens === "asc" ? " ▲" : " ▼") : " ↕"}</span></button>
    </th>
  );
  return (
    <div className="gd-table-defilante" tabIndex={0} role="region" {...(etiquetteId ? { "aria-labelledby": etiquetteId } : { "aria-label": legende })}>
      <table className="gd-table-bord" data-gd-table-bord {...(etiquetteId ? { "aria-labelledby": etiquetteId } : {})}>
        {!etiquetteId && <caption className="sr-only">{legende}</caption>}
        <thead>
          {zone && <tr><th scope="col" colSpan={fixes} /><th scope="colgroup" colSpan={colonnes.length} className="gd-entete-zone" translate="no">{zone}</th></tr>}
          {groupes && <tr><th scope="col" colSpan={fixes} />{groupes.map((g, i) => <th key={i} scope="colgroup" colSpan={g.n}>{g.libelle}</th>)}</tr>}
          <tr>{entete(enTete, -1)}{avecUnite && <th scope="col">Unité</th>}{colonnes.map((c, i) => entete(c.libelle, i))}</tr>
        </thead>
        <tbody>
          {triees.map((l) => (
            <tr key={l.cle}>
              <th scope="row" translate={libellesDonnees ? "no" : undefined}>{l.libelle}</th>
              {avecUnite && <td className="gd-unite" translate="no">{l.unite ?? ""}</td>}
              {l.valeurs.map((v, i) => <td key={i}><Valeur v={v} decimales={decimales} /></td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ——— Bloc avec menu ⋮ (export CSV, plein écran) ———

function BlocCadre({ cle, titre, sousTitre, source, calcule, note, csv, children, donnee = false, sousTitreDonnee = false }: { cle: string; titre: string; donnee?: boolean; sousTitreDonnee?: boolean; sousTitre?: string; source: string; calcule: boolean; note: string | null; csv: () => { nom: string; contenu: string }; children: ReactNode }) {
  const [menu, setMenu] = useState(false);
  const [plein, setPlein] = useState(false);
  const bouton = useRef<HTMLButtonElement>(null);
  const cadre = useRef<HTMLElement>(null);
  // Plein écran : le focus va au bloc ; Échap en sort où que soit le focus, puis il revient au bouton ⋮.
  useEffect(() => {
    if (!plein) return;
    cadre.current?.focus();
    const ecouter = (e: globalThis.KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setPlein(false); bouton.current?.focus(); } };
    window.addEventListener("keydown", ecouter, true);
    return () => window.removeEventListener("keydown", ecouter, true);
  }, [plein]);
  const clavier = (e: KeyboardEvent) => {
    if (e.key !== "Escape") return;
    if (menu) { setMenu(false); bouton.current?.focus(); e.stopPropagation(); }
  };
  return (
    <section ref={cadre} tabIndex={plein ? -1 : undefined} className={`gd-bloc${plein ? " gd-bloc-plein" : ""}`} aria-labelledby={`gd-bloc-${cle}`} onKeyDown={clavier} data-gd-bloc={cle} data-gd-plein-ecran={plein ? "oui" : "non"}>
      <div className="gd-bloc-tete">
        <h3 id={`gd-bloc-${cle}`}><span translate={donnee ? "no" : undefined}>{titre}</span>{sousTitre && <span className="gd-discret">{" — "}<span translate={sousTitreDonnee ? "no" : undefined}>{sousTitre}</span></span>}</h3>
        <div className="gd-bloc-menu">
          <button ref={bouton} type="button" className="gd-points" aria-label={donnee ? "Actions du tableau" : `Actions du bloc : ${titre}`} aria-describedby={`gd-bloc-${cle}`} title="Actions" aria-haspopup="true" aria-expanded={menu} onClick={() => setMenu(!menu)} data-gd-bloc-menu>⋮</button>
          {menu && (
            <ul className="gd-bloc-actions">
              <li><button type="button" onClick={() => { const f = csv(); telecharger(f.nom, f.contenu); setMenu(false); }} data-gd-bloc-csv>Exporter en CSV</button></li>
              <li><button type="button" onClick={() => { setPlein(!plein); setMenu(false); }} data-gd-bloc-plein>{plein ? "Quitter le plein écran" : "Plein écran"}</button></li>
            </ul>
          )}
        </div>
      </div>
      {children}
      <p className="gd-source" data-gd-source>{"Source : "}<span translate="no">{source}</span>{calcule && <>{" · "}<span className="gd-discret">* Calculé par GeoData à partir des valeurs publiées.</span></>}{note && <>{" · "}<span className="gd-discret">{note}</span></>}</p>
    </section>
  );
}

function piedCsv(zone: string, source: string, calcule: boolean, note: string | null): string[] {
  return [`Zone : ${zone}`, `Source : ${source}`, ...(calcule ? ["* Calculé par GeoData à partir des valeurs publiées"] : []), ...(note ? [note] : []), `Cellule vide : ${DONNEE_NON_DISPONIBLE}`];
}
const valeurCsv = (v: ValeurEvaluee) => v.valeur;

function BlocPaire({ bloc, indicateurs, zone }: { bloc: BlocTableau; indicateurs: readonly IndicateurZone[]; zone: string }) {
  const e = evaluerBloc(bloc, indicateurs);
  const lignes = bloc.lignes.map((l, i) => ({ cle: `${i}`, libelle: l.libelle, valeurs: e.valeurs[i]! }));
  const csv = () => ({
    nom: nomFichier(bloc.cle, zone),
    contenu: versCsv([bloc.enTeteLignes || bloc.titre, ...bloc.colonnes], lignes.map((l) => [l.libelle, ...l.valeurs.map(valeurCsv)]), piedCsv(zone, bloc.source, e.calcule, bloc.note)),
  });
  return (
    <BlocCadre cle={bloc.cle} titre={bloc.titre} sousTitre={bloc.unite ?? undefined} sousTitreDonnee source={bloc.source} calcule={e.calcule} note={bloc.note} csv={csv}>
      <div className="gd-paire">
        <TableTriable legende={bloc.titre} enTete={bloc.enTeteLignes} colonnes={bloc.colonnes.map((c) => ({ libelle: c }))} lignes={lignes} decimales={bloc.decimales} />
        {bloc.graphique && <GraphiqueSvg type={bloc.graphique} titre={bloc.titre} colonnes={bloc.colonnes} decimales={bloc.decimales} lignes={lignes.map((l) => ({ libelle: l.libelle, valeurs: l.valeurs.map((v) => v.valeur) }))} />}
      </div>
    </BlocCadre>
  );
}

function CarteChiffre({ bloc, indicateurs }: { bloc: Extract<Bloc, { type: "chiffre" }>; indicateurs: readonly IndicateurZone[] }) {
  const v = evaluer(bloc.valeur, indicateurs);
  return (
    <article className="gd-chiffre" data-gd-chiffre={bloc.cle} data-gd-chiffre-valeur={v.valeur ?? ""}>
      <h3>{bloc.titre}</h3>
      <p className="gd-chiffre-valeur"><Valeur v={v} decimales={bloc.decimales} />{v.valeur !== null && bloc.unite && <span className="gd-chiffre-unite" translate="no">{bloc.unite === "%" ? " %" : ` ${bloc.unite}`}</span>}</p>
      <p className="gd-source">{"Source : "}<span translate="no">{bloc.source}</span>{v.calcule && <>{" · "}<span className="gd-discret">* Calculé par GeoData.</span></>}{bloc.note && <>{" · "}<span className="gd-discret">{bloc.note}</span></>}</p>
    </article>
  );
}

// ——— Filtre de zone (découpage territorial en base) ———

function FiltreZone({ pays, niveaux, nomNational, chaine, onChoisir, compteur }: { pays: string; niveaux: PaysTerritorial["niveaux"]; nomNational: string; chaine: readonly Etape[]; onChoisir(z: Etape | null): void; compteur: { disponibles: number; total: number } | null }) {
  const [listes, setListes] = useState<Map<string, readonly UniteTerritoriale[]>>(new Map());
  const parents = useMemo(() => ["", ...chaine.map((e) => e.code)], [chaine]);
  const cle = (p: string) => `${pays}:${p}`;
  useEffect(() => {
    for (const p of parents) {
      if (listes.has(cle(p))) continue;
      api.unitesTerritoriales(pays, p || null).then((r) => setListes((m) => new Map(m).set(cle(p), r.unites))).catch(() => setListes((m) => new Map(m).set(cle(p), [])));
    }
  }, [parents, pays, listes]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="gd-filtre-zone" role="group" aria-label="Filtre de zone" data-gd-filtre-zone>
      <span className="gd-filtre-titre">Zone</span>
      {parents.map((p, i) => {
        const options = listes.get(cle(p)) ?? [];
        if (i > 0 && !options.length) return null;
        const niveau = niveaux.find((n) => n.rang === i + 1);
        const parent = i > 0 ? chaine[i - 1]! : null;
        return (
          <span key={p || "racine"} className="gd-filtre-champ">
          <span id={`gd-filtre-niveau-${i + 1}`} className="sr-only" translate="no">{niveau?.singulier ?? "Zone"}</span>
          <select aria-labelledby={`gd-filtre-niveau-${i + 1}`} value={chaine[i]?.code ?? ""} data-gd-filtre-niveau={i + 1}
            onChange={(e) => { const u = options.find((o) => o.code === e.target.value); onChoisir(u ? { code: u.code, nom: u.nom, rang: u.rang } : parent); }}>
            <option value="">{parent ? `Ensemble — ${parent.nom}` : nomNational}</option>
            {options.map((o) => <option key={o.code} value={o.code} translate="no">{o.nom}</option>)}
          </select>
          </span>
        );
      })}
      {chaine.length > 0 && <button type="button" onClick={() => onChoisir(null)} data-gd-filtre-national>{nomNational}</button>}
      {compteur && <span className="gd-compteur" aria-live="polite" data-gd-compteur={`${compteur.disponibles}/${compteur.total}`}>{`${compteur.disponibles.toLocaleString(LOCALE)} valeurs disponibles sur ${compteur.total.toLocaleString(LOCALE)}`}</span>}
    </div>
  );
}

// ——— Concepts ———

function Concepts({ pays, langues }: { pays: string; langues: Record<string, number> }) {
  const [langue, setLangue] = useState<"fr" | "ar">("fr");
  const [recus, setRecus] = useState<ConceptsRecus | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  useEffect(() => {
    let vivant = true;
    setRecus(null);
    setErreur(null);
    api.concepts(pays, langue).then((r) => vivant && setRecus(r)).catch((e) => vivant && setErreur(message(e)));
    return () => { vivant = false; };
  }, [pays, langue]);
  return (
    <section className="gd-concepts" aria-label="Concepts et définitions" data-gd-concepts>
      <div role="tablist" aria-label="Langue des concepts" className="gd-sous-onglets">
        {(["ar", "fr"] as const).map((l) => (
          <button key={l} type="button" role="tab" aria-selected={langue === l} onClick={() => setLangue(l)} data-gd-concepts-langue={l}>
            {l === "ar" ? "Arabe" : "Français"}<span className="gd-discret">{` (${langues[l] ?? 0})`}</span>
          </button>
        ))}
      </div>
      {erreur && <p role="alert" className="gd-alerte">{erreur}</p>}
      {!recus && !erreur && <p role="status">Chargement…</p>}
      {recus && !recus.concepts.length && <p className="gd-nd" data-gd-concepts-vide>{`${DONNEE_NON_DISPONIBLE} : aucun concept dans cette langue en base.`}</p>}
      {recus && recus.concepts.length > 0 && (
        <>
          <dl className="gd-liste-concepts" lang={langue} dir={langue === "ar" ? "rtl" : "ltr"} translate="no">
            {recus.concepts.map((c) => <div key={c.titre} data-gd-concept><dt>{c.titre}</dt><dd>{c.texte.split("\n").map((p, i) => <p key={i}>{p}</p>)}</dd></div>)}
          </dl>
          {recus.source && <p className="gd-source" data-gd-source>{"Source : "}<span translate="no">{recus.source}</span></p>}
        </>
      )}
    </section>
  );
}

// ——— Conteneur ———

/** Familles désignées par les blocs d'un onglet (pour écarter leur thème de l'onglet Tableaux). */
const famillesDe = (e: Expression): string[] => ("indicateur" in e ? [e.indicateur.famille] : "somme" in e ? e.somme.map((s) => s.famille) : "ratio" in e ? [...famillesDe(e.ratio[0]), ...famillesDe(e.ratio[1])] : []);

export function TableauDeBord({ onglet, paysCourant, paysPret, zoneCarte, visible, zoneEtude = null }: { onglet: OngletBord; paysCourant: string | null; /** Découpage territorial lu (pays courant connu, ou aucun). */ paysPret: boolean; zoneCarte: ZoneCarte | null; visible: boolean;
  /** Zone d'étude qui filtre la carte (D-GD-41) : signalée, jamais agrégée ici (les chiffres portent sur des territoires entiers). */
  zoneEtude?: string | null }) {
  const [bord, setBord] = useState<{ recu: TableauDeBordRecu; definition: DefinitionTableauDeBord } | null>(null);
  const [erreurBord, setErreurBord] = useState<string | null>(null);
  const [niveaux, setNiveaux] = useState<PaysTerritorial["niveaux"]>([]);
  const [zone, setZone] = useState<ZoneCarte | null>(zoneCarte);
  const [resolue, setResolue] = useState<{ coucheId: string; code: string; nom: string; chaine: Etape[] } | null>(null);
  const [indicateurs, setIndicateurs] = useState<IndicateurZone[] | null>(null);
  const [attribution, setAttribution] = useState<string | null>(null);
  const [etat, setEtat] = useState<{ chargement: boolean; erreur: string | null }>({ chargement: false, erreur: null });

  // La zone suit la sélection de la carte (entité, niveau de la barre territoriale) ; sans sélection : zone nationale.
  const cleCarte = zoneCarte ? `${zoneCarte.rang}:${zoneCarte.code}` : "";
  useEffect(() => { setZone(zoneCarte); }, [cleCarte]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!paysPret) return;
    let vivant = true;
    setBord(null);
    setResolue(null);
    const charger = (p: string | null) => api.tableauDeBord(p);
    charger(paysCourant).catch((e) => (paysCourant ? charger(null) : Promise.reject(e))).then((recu) => {
      if (!vivant) return;
      const d = validerDefinitionTableauDeBord(recu.definition);
      if (!d.ok) { setErreurBord(`Définition du tableau de bord invalide : ${d.erreurs.slice(0, 3).join(" ; ")}`); return; }
      setBord({ recu, definition: d.definition });
      setErreurBord(null);
    }).catch((e) => vivant && setErreurBord(message(e)));
    api.territoires().then((r) => vivant && setNiveaux(r.pays.find((p) => p.code === (paysCourant ?? r.pays[0]?.code))?.niveaux ?? [])).catch(() => undefined);
    return () => { vivant = false; };
  }, [paysCourant, paysPret]);

  const pays = bord?.recu.pays ?? null;
  // Résolution de la zone : couche et ancêtres lus dans le découpage territorial en base.
  useEffect(() => {
    if (!bord || !pays) return;
    let vivant = true;
    if (!zone || zone.rang === 0) { setResolue({ coucheId: bord.recu.zone.coucheId, code: bord.recu.zone.code, nom: bord.recu.zone.nom, chaine: [] }); return; }
    api.uniteTerritoriale(zone.pays ?? pays, zone.code, zone.rang).then((u) => {
      if (vivant) setResolue({ coucheId: u.coucheId, code: u.code, nom: u.nom, chaine: [...u.ancetres.map((a) => ({ code: a.code, nom: a.nom, rang: a.rang })), { code: u.code, nom: u.nom, rang: u.rang }] });
    }).catch(() => {
      if (!vivant) return;
      if (zone.coucheId) setResolue({ coucheId: zone.coucheId, code: zone.code, nom: zone.nom, chaine: [{ code: zone.code, nom: zone.nom, rang: zone.rang }] });
      else setEtat({ chargement: false, erreur: `Zone « ${zone.nom} » absente du découpage territorial en base.` });
    });
    return () => { vivant = false; };
  }, [bord, pays, zone]);

  useEffect(() => {
    if (!resolue) return;
    let vivant = true;
    // Jamais les valeurs d'une zone sous la définition ou le nom d'une autre : elles sont effacées pendant le chargement.
    setIndicateurs(null);
    setEtat({ chargement: true, erreur: null });
    api.fiche(resolue.coucheId, resolue.code).then((f) => {
      if (!vivant) return;
      setAttribution(f.couche.version.attribution);
      setIndicateurs(f.indicateurs.map((i) => ({ titre: i.titre, unite: i.unite, nature: i.nature, theme: i.theme, famille: i.famille, modalite: i.modalite, milieu: i.milieu, sexe: i.sexe, valeur: i.valeur, motifAbsence: i.motifAbsence })));
      setEtat({ chargement: false, erreur: null });
    }).catch((e) => { if (vivant) { setIndicateurs(null); setEtat({ chargement: false, erreur: message(e) }); } });
    return () => { vivant = false; };
  }, [resolue]);

  const blocs = useMemo(() => bord?.definition.blocs.filter((b) => b.onglet === onglet) ?? [], [bord, onglet]);
  const themesCee = useMemo(() => {
    const familles = new Set((bord?.definition.blocs ?? []).filter((b) => b.onglet === "cee").flatMap((b) => (b.type === "chiffre" ? famillesDe(b.valeur) : b.lignes.flatMap((l) => l.cellules.flatMap(famillesDe)))));
    return [...new Set((indicateurs ?? []).filter((i) => i.famille && familles.has(i.famille) && i.theme).map((i) => i.theme as string))];
  }, [bord, indicateurs]);
  const tableaux = useMemo(() => (onglet === "tableaux" && indicateurs ? tableauxParTheme(indicateurs, themesCee) : []), [onglet, indicateurs, themesCee]);
  const compteur = useMemo(() => {
    if (!indicateurs) return null;
    const liste = onglet === "tableaux" ? tableaux.flatMap((t) => t.lignes.flatMap((l) => l.cellules)) : blocs.flatMap((b) => evaluerBloc(b, indicateurs).valeurs.flat());
    return { disponibles: liste.filter((x) => x && x.valeur !== null).length, total: liste.length };
  }, [indicateurs, onglet, tableaux, blocs]);

  const nomZone = resolue?.nom ?? bord?.recu.zone.nom ?? "";
  const choisirZone = (e: Etape | null) => setZone(e ? { pays, rang: e.rang, code: e.code, nom: e.nom, coucheId: null } : null);

  return (
    <div className="gd-tableau-bord" hidden={!visible} data-gd-tableau-bord={onglet} data-gd-zone={resolue ? `${resolue.chaine.length}:${resolue.code}` : ""} data-gd-zone-nom={nomZone}>
      {erreurBord && <p role="alert" className="gd-alerte" data-gd-bord-erreur>{erreurBord}</p>}
      {zoneEtude && onglet !== "concepts" && <p className="gd-discret" data-gd-bord-zone-etude><span>Le filtre de zone d'étude</span> <span translate="no">{`« ${zoneEtude} »`}</span> <span>ne s'applique pas ici : ces chiffres portent sur des territoires entiers. Pour une zone libre, utilisez « Analyser » dans Études.</span></p>}
      {!bord && !erreurBord && <p role="status">Chargement du tableau de bord…</p>}
      {bord && onglet !== "concepts" && (
        <FiltreZone pays={bord.recu.pays} niveaux={niveaux} nomNational={bord.recu.zone.nom} chaine={resolue?.chaine ?? []} onChoisir={choisirZone} compteur={compteur} />
      )}
      {bord && onglet !== "concepts" && (
        <h2 className="gd-titre-zone" data-gd-titre-zone><span translate="no">{nomZone}</span></h2>
      )}
      {etat.erreur && <p role="alert" className="gd-alerte">{etat.erreur}</p>}
      {etat.chargement && <p role="status">Chargement des valeurs de la zone…</p>}
      {bord && onglet === "concepts" && <Concepts pays={bord.recu.pays} langues={bord.recu.concepts} />}
      {bord && indicateurs && (onglet === "chiffres-cles" || onglet === "cee") && (
        <>
          {blocs.some((b) => b.type === "chiffre") && <div className="gd-chiffres">{blocs.filter((b): b is Extract<Bloc, { type: "chiffre" }> => b.type === "chiffre").map((b) => <CarteChiffre key={b.cle} bloc={b} indicateurs={indicateurs} />)}</div>}
          <div className="gd-blocs">{blocs.filter((b): b is BlocTableau => b.type === "tableau").map((b) => <BlocPaire key={b.cle} bloc={b} indicateurs={indicateurs} zone={nomZone} />)}</div>
        </>
      )}
      {bord && indicateurs && onglet === "tableaux" && (
        <div className="gd-blocs gd-blocs-larges">
          {!tableaux.length && <p className="gd-nd">{`${DONNEE_NON_DISPONIBLE} : aucun indicateur pour cette zone.`}</p>}
          {tableaux.map((t, n) => {
            const colonnes = t.colonnes.map((c) => ({ libelle: LIBELLES_SEXE[c.sexe], groupe: LIBELLES_MILIEU[c.milieu] }));
            const lignes = t.lignes.map((l, i) => ({ cle: `${i}`, libelle: l.libelle, unite: l.unite, valeurs: l.cellules.map((c): ValeurEvaluee => (c ? { valeur: c.valeur, calcule: c.nature === "calcule" && c.valeur !== null, motif: c.motifAbsence } : { valeur: null, calcule: false, motif: null })) }));
            const calcule = lignes.some((l) => l.valeurs.some((v) => v.calcule));
            const source = attribution ?? bord.recu.attribution;
            const csv = () => ({
              nom: nomFichier(`tableau-${n + 1}`, nomZone),
              contenu: versCsv(["Indicateur", "Unité", ...t.colonnes.map((c) => `${nomZone} — ${c.libelle}`)], lignes.map((l) => [l.libelle, l.unite ?? "", ...l.valeurs.map(valeurCsv)]), piedCsv(nomZone, source, calcule, null)),
            });
            return (
              <BlocCadre key={t.theme} donnee cle={`theme-${n}`} titre={t.theme} sousTitre={`${lignes.length} indicateurs`} source={source} calcule={calcule} note={null} csv={csv}>
                <TableTriable legende={t.theme} enTete="Indicateur" colonnes={colonnes} lignes={lignes} decimales={null} avecUnite zone={nomZone} libellesDonnees etiquetteId={`gd-bloc-theme-${n}`} />
              </BlocCadre>
            );
          })}
        </div>
      )}
    </div>
  );
}
