/**
 * Cas 2 du catalogue, lot 2 « Accrochage et saisie » (maquettes lot2-1 à lot2-4 validées le 27 novembre 2026) :
 * - panneau « Accrochage » : genres actifs, un seul genre pour le prochain point (Alt + 1 à 6), presque accroché ;
 * - panneau « Mètre · Mesure » : mesure décomposée, guide en réseau, répartition entre deux bornes ;
 * - sections d'Info modèle (unité d'affichage et de saisie, paramètres du projet, ressaut maximal saisi avec sa source)
 *   et d'Info entité (longueur d'une arête, sommets, objet exclu de l'accrochage, remise à l'échelle d'un import).
 * Composants React purs : ils reçoivent le modèle et des rappels ; la Planche applique les opérations (un pas
 * d'historique chacune). Aucune valeur réglementaire n'est fournie : sans valeur saisie, rien n'est évalué.
 */
import { useEffect, useMemo, useState } from "react";
import {
  type GenreAccrochage,
  type Id,
  type Modele,
  type RegleRepartition,
  type UniteSaisie,
  type Vec3,
  REGLAGES_DEFAUT,
  analyserSaisie,
  changerUnite,
  uniteDeSaisie,
  decomposerMesure,
  formaterLongueurUnite,
  repartition,
} from "@parcours/sandbox-planche-model";
import { t } from "../messages";
import { Pictogramme } from "../pictogrammes/Pictogramme";
import { COMMANDES_ACCROCHAGE, GENRE_FORCE, type Disponibilite, type IdCommandeAccrochage } from "./commandes-objets";
import { afficherRaccourci } from "./outils-planche";

const arreter = (e: { stopPropagation(): void }) => e.stopPropagation();
/** Nombre saisi (virgule ou point), null si vide ou invalide. */
export const lireNombre = (s: string): number | null => {
  const v = Number(s.trim().replace(/\s*m$/, "").replace(",", "."));
  return s.trim() !== "" && Number.isFinite(v) ? v : null;
};
/** Point saisi « x ; y ; z » (virgules décimales admises). */
export const lirePoint = (s: string): Vec3 | null => {
  const p = s.split(";").map((x) => lireNombre(x));
  return p.length === 3 && p.every((x) => x !== null) ? { x: p[0]!, y: p[1]!, z: p[2]! } : null;
};
/** Longueur saisie dans l'unité du projet (« 240 cm », « 7' 10 1/2" », nombre nu dans l'unité choisie), en mètres. */
export const lireLongueurUnite = (s: string, unite: UniteSaisie | undefined, sep: "." | ","): number | null => {
  const r = analyserSaisie(s, { attendu: "longueur", separateurDecimal: sep, uniteModele: uniteDeSaisie(unite) });
  return r.genre === "longueur" ? r.valeur : null;
};
const nb = (v: number, sep: "." | ",", d = 3) => v.toFixed(d).replace(".", sep);
const textePoint = (p: Vec3, sep: "." | ",") => `${nb(p.x, sep)} ; ${nb(p.y, sep)} ; ${nb(p.z, sep)}`;

function BoutonCommande({ id, disponibilite, executer, actif = false, plein = false }: { id: IdCommandeAccrochage; disponibilite: (id: IdCommandeAccrochage) => Disponibilite; executer: (id: IdCommandeAccrochage) => void; actif?: boolean; plein?: boolean }) {
  const c = COMMANDES_ACCROCHAGE.find((x) => x.id === id)!;
  const d = disponibilite(id);
  return (
    <button type="button" className={plein ? "planche-bouton-principal" : undefined} aria-pressed={actif || undefined} disabled={!d.disponible} title={`${t(c.libelle)} (${afficherRaccourci(c.raccourci)})${d.motif ? ` — ${t(d.motif)}` : ""}`} aria-label={t(c.libelle)} onClick={() => executer(id)} data-planche-commande={id}>
      <Pictogramme picto={c.picto} /> {t(c.court)}
    </button>
  );
}

// ————————————————————————————————————————————————————————————— Panneau « Accrochage » (maquette lot2-1)

const GENRES_ACTIFS = ["base", "guides", "croisement", "apparente", "quadrants", "axe", "section"] as const;

export function PanneauAccrochage({ force, presqueMm, onPresque, executer, disponibilite }: { force: GenreAccrochage | null; presqueMm: number; onPresque: (mm: number) => void; executer: (id: IdCommandeAccrochage) => void; disponibilite: (id: IdCommandeAccrochage) => Disponibilite }) {
  const [texte, setTexte] = useState(String(presqueMm));
  useEffect(() => setTexte(String(presqueMm)), [presqueMm]);
  return (
    <div className="planche-accrochage" data-planche-accrochage>
      <h4>{t("planche.accrochage.genres")}</h4>
      <dl className="planche-accrochage-genres">
        {GENRES_ACTIFS.map((g) => (
          <div key={g} className="planche-accrochage-ligne">
            <dt>{t(`planche.accrochage.genre.${g}`)}</dt>
            <dd className="planche-accrochage-actif" data-planche-accrochage-genre={g}>{t(g === "base" ? "planche.accrochage.actifs" : "planche.accrochage.actif")}</dd>
          </div>
        ))}
      </dl>
      <h4>{t("planche.accrochage.prochain")}</h4>
      <div className="planche-debit-barre planche-accrochage-force" role="toolbar" aria-label={t("planche.accrochage.prochain")}>
        {COMMANDES_ACCROCHAGE.filter((c) => GENRE_FORCE[c.id]).map((c) => (
          <BoutonCommande key={c.id} id={c.id} disponibilite={disponibilite} executer={executer} actif={force === GENRE_FORCE[c.id]} plein={force === GENRE_FORCE[c.id]} />
        ))}
      </div>
      <h4>{t("planche.accrochage.presque")}</h4>
      <label className="planche-accrochage-champ">
        {t("planche.accrochage.presque.seuil")}
        <span>
          <input inputMode="decimal" value={texte} onKeyDown={arreter} onChange={(e) => setTexte(e.target.value)} onBlur={() => { const v = lireNombre(texte); if (v !== null && v >= 0) onPresque(v); else setTexte(String(presqueMm)); }} data-planche-accrochage-presque /> mm
        </span>
      </label>
      <p className="inspecteur-aide">{t("planche.accrochage.presque.aide")}</p>
    </div>
  );
}

// ————————————————————————————————————————————————————————————— Panneau « Mètre · Mesure » (maquette lot2-4)

export interface ReglagesMetre {
  readonly entraxe: string;
  readonly nombre: string;
  readonly regle: RegleRepartition;
  readonly valeur: string;
}
export const REGLAGES_METRE_DEFAUT: ReglagesMetre = { entraxe: "", nombre: "5", regle: "entraxe-max", valeur: "" };

/** Résultat de la répartition entre les bornes de la dernière mesure, ou un message. */
export function resultatRepartition(derniere: { a: Vec3; b: Vec3 } | null, r: ReglagesMetre): { elements: number; entraxe: number } | string {
  if (!derniere) return t("planche.accrochage.motif.mesure");
  const v = lireNombre(r.valeur);
  if (v === null) return t("planche.metre.valeur-vide");
  try {
    const x = repartition(Math.hypot(derniere.b.x - derniere.a.x, derniere.b.y - derniere.a.y, derniere.b.z - derniere.a.z), r.regle, v);
    return { elements: x.elements, entraxe: x.entraxe };
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

export function PanneauMetreMesure({ derniere, zeroNgf, unite, separateur, guidePas, reglages, onReglages, executer, disponibilite, note }: {
  derniere: { a: Vec3; b: Vec3 } | null;
  /** Altitude NGF du ±0,00 (Emplacement), null si non déclarée. */
  zeroNgf: number | null;
  unite: UniteSaisie | undefined;
  separateur: "." | ",";
  /** Pas du dernier guide du Mètre (m), null sans guide. */
  guidePas: number | null;
  reglages: ReglagesMetre;
  onReglages: (r: ReglagesMetre) => void;
  executer: (id: IdCommandeAccrochage) => void;
  disponibilite: (id: IdCommandeAccrochage) => Disponibilite;
  note: string | null;
}) {
  const [apercu, setApercu] = useState(false);
  const L = (v: number) => formaterLongueurUnite(v, unite, separateur, 3);
  const d = derniere ? decomposerMesure(derniere.a, derniere.b, zeroNgf) : null;
  const res = resultatRepartition(derniere, reglages);
  const signe = (v: number) => `${v >= 0 ? "+" : "−"}${L(Math.abs(v))}`;
  return (
    <div className="planche-metre" data-planche-metre>
      <h4>{t("planche.metre.mesure")}</h4>
      {d ? (
        <dl className="planche-accrochage-genres" data-planche-metre-decomposition>
          <div className="planche-accrochage-ligne"><dt>{t("planche.info.longueur")}</dt><dd data-planche-metre-longueur>{L(d.longueur)}</dd></div>
          <div className="planche-accrochage-ligne"><dt>{t("planche.metre.horizontale")}</dt><dd>{L(d.horizontale)}</dd></div>
          <div className="planche-accrochage-ligne"><dt>{t("planche.metre.denivele")}</dt><dd>{L(Math.abs(d.denivele))}</dd></div>
          <div className="planche-accrochage-ligne"><dt>{t("planche.metre.pente")}</dt><dd>{d.pentePourcent === null ? t("planche.metre.verticale") : `${nb(Math.abs(d.pentePourcent), separateur, 1)} % · ${nb(Math.abs(d.angleDegres), separateur, 2)}°`}</dd></div>
          <div className="planche-accrochage-ligne"><dt>{t("planche.metre.altitude")}</dt><dd>{signe(d.altitude)}</dd></div>
          <div className="planche-accrochage-ligne"><dt>{t("planche.metre.ngf")}</dt><dd data-planche-metre-ngf>{d.altitudeNgf === null ? t("planche.metre.ngf-inconnue") : signe(d.altitudeNgf)}</dd></div>
        </dl>
      ) : (
        <p className="inspecteur-aide" data-planche-metre-vide>{t("planche.metre.aucune")}</p>
      )}
      {d && d.altitudeNgf === null && <p className="inspecteur-aide">{t("planche.metre.ngf-aide")}</p>}
      <h4>{t("planche.metre.reseau")}</h4>
      <label className="planche-accrochage-champ">
        {t("planche.metre.entraxe")}
        <input inputMode="decimal" value={reglages.entraxe} placeholder={guidePas === null ? "" : nb(guidePas, separateur, 2)} onKeyDown={arreter} onChange={(e) => onReglages({ ...reglages, entraxe: e.target.value })} data-planche-metre-entraxe />
      </label>
      <label className="planche-accrochage-champ">
        {t("planche.metre.nombre")}
        <input inputMode="numeric" value={reglages.nombre} onKeyDown={arreter} onChange={(e) => onReglages({ ...reglages, nombre: e.target.value })} data-planche-metre-nombre />
      </label>
      <div className="planche-debit-barre" role="toolbar" aria-label={t("planche.metre.reseau")}>
        <BoutonCommande id="guide-reseau" disponibilite={disponibilite} executer={executer} />
      </div>
      <h4>{t("planche.metre.repartir")}</h4>
      <label className="planche-accrochage-champ">
        {t("planche.metre.regle")}
        <select value={reglages.regle} onKeyDown={arreter} onChange={(e) => onReglages({ ...reglages, regle: e.target.value as RegleRepartition })} data-planche-metre-regle>
          {(["entraxe-max", "vide-max", "nombre"] as const).map((r) => (
            <option key={r} value={r}>{t(`planche.metre.regle.${r}`)}</option>
          ))}
        </select>
      </label>
      <label className="planche-accrochage-champ">
        {t("planche.metre.valeur")}
        <input inputMode="decimal" value={reglages.valeur} onKeyDown={arreter} onChange={(e) => onReglages({ ...reglages, valeur: e.target.value })} data-planche-metre-valeur />
      </label>
      <dl className="planche-accrochage-genres">
        <div className="planche-accrochage-ligne">
          <dt>{t("planche.metre.resultat")}</dt>
          <dd data-planche-metre-resultat>{typeof res === "string" ? res : t("planche.metre.resultat.valeur", { elements: String(res.elements), entraxe: L(res.entraxe) })}</dd>
        </div>
      </dl>
      <div className="planche-debit-barre" role="toolbar" aria-label={t("planche.metre.repartir")}>
        <BoutonCommande id="repartir" disponibilite={disponibilite} executer={executer} plein />
        <button type="button" aria-pressed={apercu} onClick={() => setApercu((v) => !v)} data-planche-metre-apercu-bouton>{t("planche.metre.apercu")}</button>
      </div>
      {apercu && typeof res !== "string" && (
        <p className="inspecteur-aide" data-planche-metre-apercu>{Array.from({ length: res.elements }, (_, k) => L(k * res.entraxe)).join(" · ")}</p>
      )}
      {note && <p className="inspecteur-aide" role="status" data-planche-metre-note>{note}</p>}
    </div>
  );
}

// ————————————————————————————————————————————————————————————— Info modèle · Unités et paramètres (maquette lot2-2)

const UNITES: readonly UniteSaisie[] = ["m", "cm", "mm", "pieds-pouces"];

export function SectionUnites({ modele, lecture, onUnite }: { modele: Modele; lecture: boolean; onUnite: (u: UniteSaisie) => void }) {
  const r = modele.annotations?.reglages ?? REGLAGES_DEFAUT;
  const unite = r.uniteSaisie ?? "m";
  const controle = useMemo(() => {
    try {
      return changerUnite(modele, unite).controle;
    } catch {
      return null;
    }
  }, [modele, unite]);
  return (
    <>
      <label>
        {t("planche.unites.affichage")}
        <select value={unite} disabled={lecture} onChange={(e) => onUnite(e.target.value as UniteSaisie)} data-planche-unite>
          {UNITES.map((u) => (
            <option key={u} value={u}>{t(`planche.unites.${u}`)}</option>
          ))}
        </select>
      </label>
      <p className="inspecteur-aide">{t("planche.unites.aide")}</p>
      <div className="planche-accrochage-ligne" role="group">
        <dt>{t("planche.unites.controle")}</dt>
        <dd className={controle && controle.ecarts === 0 ? "planche-accrochage-actif" : "planche-info-cote-alerte"} data-planche-unite-controle>
          {controle ? t("planche.unites.controle.valeur", { ecarts: String(controle.ecarts), valeurs: controle.valeurs.toLocaleString("fr-CH") }) : t("planche.unites.controle.refus")}
        </dd>
      </div>
    </>
  );
}

export function SectionParametres({ modele, lecture, separateur, onParametre, onSupprimerParametre }: {
  modele: Modele;
  lecture: boolean;
  separateur: "." | ",";
  onParametre: (p: { id?: Id; nom: string; valeur: number }) => void;
  onSupprimerParametre: (id: Id) => void;
}) {
  const r = modele.annotations?.reglages ?? REGLAGES_DEFAUT;
  const unite = r.uniteSaisie ?? "m";
  const parametres = Object.values(r.parametres ?? {});
  const [choisi, setChoisi] = useState<Id | null>(null);
  const [nom, setNom] = useState("");
  const [valeur, setValeur] = useState("");
  const p = choisi ? r.parametres?.[choisi] : undefined;
  return (
    <>
      <h4>{t("planche.parametres.titre")}</h4>
      {parametres.length === 0 ? (
        <p className="inspecteur-aide" data-planche-parametres="aucun">{t("planche.parametres.aucun")}</p>
      ) : (
        <ul className="planche-parametres" data-planche-parametres={parametres.length}>
          {parametres.map((x) => (
            <li key={x.id}>
              <button type="button" aria-pressed={choisi === x.id} onClick={() => { setChoisi(choisi === x.id ? null : x.id); setNom(x.nom); setValeur(nb(x.valeur, separateur, 2)); }} data-planche-parametre={x.nom}>
                <span translate="no">{x.nom}</span>
                <strong>{formaterLongueurUnite(x.valeur, unite, separateur)}</strong>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="planche-debit-barre">
        <input value={nom} disabled={lecture} placeholder={t("planche.parametres.nom")} aria-label={t("planche.parametres.nom")} onKeyDown={arreter} onChange={(e) => setNom(e.target.value)} data-planche-parametre-nom />
        <input value={valeur} disabled={lecture} inputMode="decimal" placeholder={t("planche.parametres.valeur")} aria-label={t("planche.parametres.valeur")} onKeyDown={arreter} onChange={(e) => setValeur(e.target.value)} data-planche-parametre-valeur />
      </div>
      <div className="planche-debit-barre">
        <button type="button" disabled={lecture || nom.trim() === "" || lireNombre(valeur) === null} onClick={() => { onParametre({ nom: nom.trim(), valeur: lireNombre(valeur)! }); setNom(""); setValeur(""); setChoisi(null); }} data-planche-parametre-ajouter>{t("planche.parametres.ajouter")}</button>
        <button type="button" disabled={lecture || !p || nom.trim() === "" || lireNombre(valeur) === null} onClick={() => p && onParametre({ id: p.id, nom: nom.trim(), valeur: lireNombre(valeur)! })} data-planche-parametre-renommer>{t("planche.parametres.renommer")}</button>
        <button type="button" disabled={lecture || !p} onClick={() => { if (p) onSupprimerParametre(p.id); setChoisi(null); setNom(""); setValeur(""); }} data-planche-parametre-supprimer>{t("planche.parametres.supprimer")}</button>
      </div>
      <p className="inspecteur-aide">{t("planche.parametres.aide")}</p>
    </>
  );
}

// ————————————————————————————————————————————————————————————— Info entité · Arête (maquette lot2-3)

/** Champ validé à l'Entrée ou à la sortie ; revient à la valeur du modèle si la saisie est refusée. */
function ChampValide({ valeur, lecture, onValider, nom, donnee }: { valeur: string; lecture: boolean; onValider: (s: string) => void; nom: string; donnee: string }) {
  const [texte, setTexte] = useState(valeur);
  useEffect(() => setTexte(valeur), [valeur]);
  const valider = () => {
    if (texte !== valeur) onValider(texte);
  };
  return (
    <input
      value={texte}
      disabled={lecture}
      aria-label={nom}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") valider();
        if (e.key === "Escape") setTexte(valeur);
      }}
      onChange={(e) => setTexte(e.target.value)}
      onBlur={valider}
      {...{ [`data-planche-${donnee}`]: "" }}
    />
  );
}

export function SectionAreteSommets({ debut, fin, lecture, separateur, unite, onLongueur, onSommet }: {
  debut: { id: Id; position: Vec3 };
  fin: { id: Id; position: Vec3 };
  lecture: boolean;
  separateur: "." | ",";
  unite: UniteSaisie | undefined;
  onLongueur: (l: number) => void;
  onSommet: (id: Id, p: Vec3) => void;
}) {
  const a = debut.position;
  const b = fin.position;
  const d = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
  const L = Math.hypot(d.x, d.y, d.z);
  const axe = L < 1e-9 ? null : Math.abs(Math.abs(d.x) - L) < 1e-9 ? "x" : Math.abs(Math.abs(d.y) - L) < 1e-9 ? "y" : Math.abs(Math.abs(d.z) - L) < 1e-9 ? "z" : null;
  return (
    <>
      <dt>{t("planche.info.longueur")}</dt>
      <dd>
        <ChampValide valeur={formaterLongueurUnite(L, unite, separateur, 3)} lecture={lecture} nom={t("planche.info.longueur")} donnee="arete-longueur" onValider={(s) => { const v = lireLongueurUnite(s, unite, separateur); if (v !== null) onLongueur(v); }} />
      </dd>
      <dt>{t("planche.arete.direction")}</dt>
      <dd data-planche-arete-direction>{axe ? t("planche.arete.axe", { axe: axe.toUpperCase() }) : t("planche.arete.oblique")}</dd>
      <dd className="inspecteur-aide planche-info-large">{t("planche.arete.aide")}</dd>
      <dt className="planche-info-titre">{t("planche.arete.sommets")}</dt>
      <dd />
      <dt>{t("planche.arete.debut")}</dt>
      <dd>
        <ChampValide valeur={textePoint(a, separateur)} lecture={lecture} nom={t("planche.arete.debut")} donnee="sommet-debut" onValider={(s) => { const p = lirePoint(s); if (p) onSommet(debut.id, p); }} />
      </dd>
      <dt>{t("planche.arete.fin")}</dt>
      <dd>
        <ChampValide valeur={textePoint(b, separateur)} lecture={lecture} nom={t("planche.arete.fin")} donnee="sommet-fin" onValider={(s) => { const p = lirePoint(s); if (p) onSommet(fin.id, p); }} />
      </dd>
    </>
  );
}

// ————————————————————————————————————————————————————————————— Info entité · objet exclu, remise à l'échelle

export function SectionAccrochageObjet({ nom, exclu, balise, lecture, onExclure, onExclureBalise }: { nom: string; exclu: boolean; balise: { nom: string; exclue: boolean } | null; lecture: boolean; onExclure: (exclu: boolean) => void; onExclureBalise: (exclue: boolean) => void }) {
  const choix = (valeur: boolean, onChange: (v: boolean) => void, libelle: string, donnee: string) => (
    <select value={valeur ? "exclu" : "inclus"} disabled={lecture} aria-label={libelle} onChange={(e) => onChange(e.target.value === "exclu")} {...{ [`data-planche-${donnee}`]: "" }}>
      <option value="inclus">{t("planche.accrochage.objet.inclus")}</option>
      <option value="exclu">{t("planche.accrochage.objet.exclu")}</option>
    </select>
  );
  return (
    <>
      <dt className="planche-info-titre">{t("planche.accrochage.titre")}</dt>
      <dd />
      <dt>{t("planche.accrochage.objet", { nom })}</dt>
      <dd>{choix(exclu, onExclure, t("planche.accrochage.objet", { nom }), "accrochage-objet")}</dd>
      {balise && (
        <>
          <dt>{t("planche.accrochage.balise", { nom: balise.nom })}</dt>
          <dd>{choix(balise.exclue, onExclureBalise, t("planche.accrochage.balise", { nom: balise.nom }), "accrochage-balise")}</dd>
        </>
      )}
      <dd className="inspecteur-aide planche-info-large">{t("planche.accrochage.objet.aide")}</dd>
    </>
  );
}

export function SectionRemiseEchelle({ mesureeDefaut, separateur, mesuree, reelle, onMesuree, onReelle, executer, disponibilite, note }: {
  mesureeDefaut: number | null;
  separateur: "." | ",";
  mesuree: string;
  reelle: string;
  onMesuree: (s: string) => void;
  onReelle: (s: string) => void;
  executer: (id: IdCommandeAccrochage) => void;
  disponibilite: (id: IdCommandeAccrochage) => Disponibilite;
  note: string | null;
}) {
  return (
    <>
      <dt className="planche-info-titre">{t("planche.echelle.titre")}</dt>
      <dd />
      <dt>{t("planche.echelle.mesuree")}</dt>
      <dd>
        <input inputMode="decimal" value={mesuree} placeholder={mesureeDefaut === null ? "" : nb(mesureeDefaut, separateur, 2)} aria-label={t("planche.echelle.mesuree")} onKeyDown={arreter} onChange={(e) => onMesuree(e.target.value)} data-planche-echelle-mesuree />
      </dd>
      <dt>{t("planche.echelle.reelle")}</dt>
      <dd>
        <input inputMode="decimal" value={reelle} aria-label={t("planche.echelle.reelle")} onKeyDown={arreter} onChange={(e) => onReelle(e.target.value)} data-planche-echelle-reelle />
      </dd>
      <dd className="planche-info-large">
        <BoutonCommande id="remettre-echelle" disponibilite={disponibilite} executer={executer} plein />
      </dd>
      {note && <dd className="inspecteur-aide planche-info-large" role="status" data-planche-echelle-note>{note}</dd>}
    </>
  );
}
