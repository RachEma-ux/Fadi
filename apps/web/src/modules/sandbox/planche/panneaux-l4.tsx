/**
 * Cas 2 du catalogue, lot 4 « Balises, scènes et gabarit » (maquettes lot4-1 à lot4-4 validées le 27 novembre 2026) :
 * - panneau Balises : balise courante, épaisseur et type de trait, balises réservées, verrou, balises de phase,
 *   classement de la sélection ;
 * - panneau Scènes : scènes du projet et leur projection, scènes types du gabarit, état mémorisé, échelle nominale, soleil ;
 * - Info entité · Plan de coupe : distance le long de la normale, déplacement par pas, profondeur vue, scène face à la coupe ;
 * - panneau « Nouvelle Planche » : gabarit d'agence (importé, archivé), résumé, création, enregistrement comme gabarit.
 * Composants React purs : ils reçoivent le modèle et des rappels ; la Planche applique les opérations (un pas
 * d'historique chacune). Aucune épaisseur, couleur ni échelle n'est fournie par Fadi : elles sont saisies ou viennent du
 * gabarit de l'agence.
 */
import { useEffect, useState } from "react";
import {
  type ArchiveFichier,
  type Balise,
  type BalisesReservees,
  type ChangementBalise,
  type CompteClassement,
  type Gabarit,
  type GenreReserve,
  type Id,
  type Modele,
  type MotifRefusArchive,
  type PlanDeCoupe,
  type Scene,
  type TraitBalise,
  GENRES_RESERVES,
  TRAITS_BALISE,
  dateDuJour,
  distancePlan,
  lireEchelle,
  resumeGabarit,
} from "@parcours/sandbox-planche-model";
import { t, type CleMessage } from "../messages";
import { IconeSandbox, Pictogramme } from "../pictogrammes/Pictogramme";
import { COMMANDES_BALISE, COMMANDES_GABARIT, COMMANDES_SCENE, type Disponibilite, type IdCommandeBalise, type IdCommandeGabarit, type IdCommandeScene } from "./commandes-objets";
import { afficherRaccourci } from "./outils-planche";
import { lireNombre } from "./panneau-accrochage";

const arreter = (e: { stopPropagation(): void }) => e.stopPropagation();
const nb = (v: number, sep: "." | ",", d = 2) => v.toFixed(d).replace(".", sep);
const TOUTES = [...COMMANDES_BALISE, ...COMMANDES_SCENE, ...COMMANDES_GABARIT];
type IdLot4 = IdCommandeBalise | IdCommandeScene | IdCommandeGabarit;

function BoutonCommande<I extends IdLot4>({ id, disponibilite, executer, plein = false, libelle }: { id: I; disponibilite: (id: I) => Disponibilite; executer: (id: I) => void; plein?: boolean; libelle?: string }) {
  const c = TOUTES.find((x) => x.id === id)!;
  const d = disponibilite(id);
  return (
    <button type="button" className={plein ? "planche-bouton-principal" : undefined} disabled={!d.disponible} title={`${t(c.libelle)} (${afficherRaccourci(c.raccourci)})${d.motif ? ` — ${t(d.motif)}` : ""}`} aria-label={libelle ?? t(c.libelle)} onClick={() => executer(id)} data-planche-commande={id}>
      <Pictogramme picto={c.picto} /> {libelle ?? t(c.court)}
    </button>
  );
}

/** Champ saisi gardé localement, validé à la sortie (Entrée ou perte du focus) ; rétabli s'il est refusé. */
function ChampValide({ valeur, onValider, etiquette, attribut, desactive = false }: { valeur: string; onValider: (texte: string) => boolean; etiquette: string; attribut: string; desactive?: boolean }) {
  const [texte, setTexte] = useState(valeur);
  useEffect(() => setTexte(valeur), [valeur]);
  const valider = () => {
    if (texte === valeur) return;
    if (!onValider(texte)) setTexte(valeur);
  };
  return (
    <input
      value={texte}
      disabled={desactive}
      aria-label={etiquette}
      onKeyDown={(e) => {
        arreter(e);
        if (e.key === "Enter") valider();
      }}
      onChange={(e) => setTexte(e.target.value)}
      onBlur={valider}
      {...{ [attribut]: "" }}
    />
  );
}

// ————————————————————————————————————————————————————————————— Panneau Balises (maquette lot4-1)

const genreReserve = (r: BalisesReservees, id: Id): GenreReserve | undefined => GENRES_RESERVES.find((g) => r[g] === id);

export function PanneauBalises({
  modele,
  courante,
  lecture,
  separateur,
  compte,
  onChoisir,
  onCourante,
  onVisible,
  onCreer,
  onModifier,
  onClasser,
  executer,
  disponibilite,
}: {
  modele: Modele;
  courante: string | null;
  lecture: boolean;
  separateur: "." | ",";
  compte: CompteClassement;
  onChoisir: (id: string) => void;
  onCourante: (id: string | null) => void;
  onVisible: (id: string, visible: boolean) => void;
  onCreer: (nom: string, couleur: string) => void;
  onModifier: (id: Id, v: ChangementBalise) => boolean;
  onClasser: (balise: Id | null) => void;
  executer: (id: IdCommandeBalise) => void;
  disponibilite: (id: IdCommandeBalise) => Disponibilite;
}) {
  const balises: Balise[] = Object.values(modele.annotations?.balises ?? {});
  const reservees = modele.annotations?.reglages?.balisesReservees ?? {};
  const [nom, setNom] = useState("");
  const [couleur, setCouleur] = useState("#2f7bd6");
  const [classer, setClasser] = useState(false);
  const cour = courante ? modele.annotations?.balises[courante] : undefined;
  const morceaux = (
    [
      ["aretes", compte.aretes],
      ["faces", compte.faces],
      ["objets", compte.objets],
      ["cotes", compte.cotes],
      ["textes", compte.textes],
      ["plans", compte.plans],
    ] as const
  )
    .filter(([, n]) => n > 0)
    .map(([g, n]) => t(`planche.balise.compte.${g}${n === 1 ? ".un" : ""}` as CleMessage, { nombre: String(n) }));
  return (
    <div className="planche-liste-panneau planche-balises" data-planche-balises>
      <label className="planche-accrochage-champ">
        {t("planche.balise.courante")}
        <select value={courante ?? ""} onChange={(e) => onCourante(e.target.value || null)} data-planche-balise-courante>
          <option value="">{t("planche.info.sans-balise")}</option>
          {balises.map((b) => (
            <option key={b.id} value={b.id}>{b.nom}</option>
          ))}
        </select>
      </label>
      <p className="inspecteur-aide">{t("planche.balise.courante.aide")}</p>
      <h4>{t("panneau.balises")}</h4>
      {balises.length > 0 && (
        <div className="planche-balises-tete" aria-hidden="true">
          <span />
          <span>{t("planche.materiau.nom")}</span>
          <span>{t("planche.balise.epaisseur")}</span>
          <span>{t("planche.balise.trait")}</span>
          <span />
        </div>
      )}
      <ul role="listbox" aria-label={t("panneau.balises")}>
        {balises.map((b) => {
          const g = genreReserve(reservees, b.id);
          return (
            <li key={b.id} role="option" aria-selected={courante === b.id} className={`planche-balises-ligne${courante === b.id ? " est-actif" : ""}`} data-planche-balise={b.id} data-planche-balise-verrouillee={b.verrouillee ? "oui" : undefined}>
              <input type="checkbox" checked={b.visible} disabled={lecture} aria-label={`${t("planche.balise.visible")} — ${b.nom}`} onChange={(e) => onVisible(b.id, e.target.checked)} data-planche-balise-visible />
              <button type="button" className="planche-ligne-choix" onClick={() => onChoisir(b.id)}>
                <span className="planche-pastille" style={{ background: b.couleur }} aria-hidden="true" />
                {b.nom}
                {g && <small className="inspecteur-aide"> ({t("planche.balise.reservee")})</small>}
              </button>
              <ChampValide
                valeur={b.epaisseur !== undefined ? nb(b.epaisseur, separateur) : ""}
                desactive={lecture}
                etiquette={`${t("planche.balise.epaisseur")} — ${b.nom}`}
                attribut="data-planche-balise-epaisseur"
                onValider={(s) => {
                  if (!s.trim()) return onModifier(b.id, { epaisseur: null });
                  const v = lireNombre(s.replace(/\s*mm$/, ""));
                  return v !== null && onModifier(b.id, { epaisseur: v });
                }}
              />
              <select value={b.trait ?? "continu"} disabled={lecture} aria-label={`${t("planche.balise.trait")} — ${b.nom}`} onChange={(e) => onModifier(b.id, { trait: e.target.value as TraitBalise })} data-planche-balise-trait>
                {TRAITS_BALISE.map((x) => (
                  <option key={x} value={x}>{t(`planche.balise.trait.${x}` as CleMessage)}</option>
                ))}
              </select>
              <span className="planche-balises-verrou" title={b.verrouillee ? t("planche.balise.verrouillee") : undefined}>{b.verrouillee && <IconeSandbox nom="verrou" />}</span>
            </li>
          );
        })}
      </ul>
      {balises.length === 0 && <p className="inspecteur-aide">{t("planche.balise.aucune")}</p>}
      <div className="planche-debit-barre" role="toolbar" aria-label={t("panneau.balises")}>
        <BoutonCommande id="balises-phase" disponibilite={disponibilite} executer={executer} plein />
        <BoutonCommande id="classer-selection" disponibilite={disponibilite} executer={() => setClasser((v) => !v)} />
        <BoutonCommande id="verrouiller-balise" disponibilite={disponibilite} executer={executer} libelle={t(cour?.verrouillee ? "planche.balise.deverrouiller" : "planche.balise.court.verrouiller-balise")} />
      </div>
      {classer && (
        <ul className="planche-parametres" aria-label={t("planche.balise.classer-selection")} data-planche-balise-classer>
          {balises.map((b) => (
            <li key={b.id}>
              <button type="button" onClick={() => { setClasser(false); onClasser(b.id); }} data-planche-balise-classer-vers={b.id}>
                <span><span className="planche-pastille" style={{ background: b.couleur }} aria-hidden="true" /> {b.nom}</span>
              </button>
            </li>
          ))}
          <li>
            <button type="button" onClick={() => { setClasser(false); onClasser(null); }} data-planche-balise-classer-vers="">{t("planche.info.sans-balise")}</button>
          </li>
        </ul>
      )}
      <p className="inspecteur-aide">{t("planche.balise.aide-sorties")}</p>
      <p className="planche-balises-selection" data-planche-balise-selection>
        <span>{morceaux.length ? t("planche.balise.selection", { liste: morceaux.join(", ") }) : t("planche.balise.selection-vide")}</span>
        {cour && <strong>{t("planche.balise.selection-balise", { nom: cour.nom })}</strong>}
      </p>
      {!lecture && (
        <form
          className="planche-creation"
          onSubmit={(e) => {
            e.preventDefault();
            const n = nom.trim() || `${t("planche.balise.nouvelle")} ${balises.length + 1}`;
            onCreer(n, couleur);
            setNom("");
          }}
          data-planche-balise-creation
        >
          <h4>{t("planche.balise.nouvelle")}</h4>
          <label>
            {t("planche.materiau.nom")}
            <input value={nom} onChange={(e) => setNom(e.target.value)} autoComplete="off" data-planche-balise-nom />
          </label>
          <label>
            {t("planche.materiau.couleur")}
            <input type="color" value={couleur} onChange={(e) => setCouleur(e.target.value)} data-planche-balise-couleur />
          </label>
          <button type="submit" data-planche-balise-creer>{t("planche.balise.creer")}</button>
        </form>
      )}
    </div>
  );
}

// ————————————————————————————————————————————————————————————— Panneau Scènes (maquette lot4-2)

const MODES_FACE = ["ombre", "monochrome", "filaire", "lignes-cachees"] as const;
const texteDate = (jour: number, heure: number): string => {
  const [a, m, j] = dateDuJour(jour, new Date().getFullYear()).split("-");
  const h = Math.floor(heure);
  const mn = Math.round((heure - h) * 60);
  return `${j}.${m}.${a} ${String(h).padStart(2, "0")}:${String(mn).padStart(2, "0")}`;
};
/** Lit « JJ.MM.AAAA HH:MM » : jour de l'année et heure décimale, ou `null`. */
export function lireDateSoleil(s: string): { jour: number; heure: number } | null {
  const x = /^\s*(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2})[:h](\d{2})\s*$/.exec(s);
  if (!x) return null;
  const [j, m, a, h, mn] = x.slice(1).map(Number) as [number, number, number, number, number];
  const d = new Date(Date.UTC(a, m - 1, j));
  if (d.getUTCMonth() !== m - 1 || d.getUTCDate() !== j || h > 23 || mn > 59) return null;
  const jour = Math.floor((d.getTime() - Date.UTC(a, 0, 1)) / 86400000) + 1;
  return { jour: Math.min(jour, 365), heure: h + mn / 60 };
}

/** Section du lot 4 ajoutée en tête du panneau Scènes : liste et projection, scènes types, état mémorisé, échelle, soleil. */
export function SectionScenesL4({
  modele,
  active,
  lecture,
  onAppliquer,
  onMettreAJour,
  onModifier,
  onScenesTypes,
  executer,
  disponibilite,
}: {
  modele: Modele;
  active: Id | null;
  lecture: boolean;
  onAppliquer: (s: Scene) => void;
  onMettreAJour: (id: Id) => void;
  onModifier: (id: Id, v: { echelle?: number | null; soleil?: { jour: number; heure: number } | null }) => boolean;
  onScenesTypes: (genres: readonly string[]) => void;
  executer: (id: IdCommandeScene) => void;
  disponibilite: (id: IdCommandeScene) => Disponibilite;
}) {
  const a = modele.annotations;
  const scenes = Object.values(a?.scenes ?? {});
  const s = active ? a?.scenes?.[active] : undefined;
  const types = a?.reglages?.gabarit?.scenesTypes ?? [];
  const [menu, setMenu] = useState(false);
  const balisesVisibles = s?.etat ? s.etat.balisesVisibles.map((id) => a?.balises[id]?.nom).filter(Boolean).join(", ") : "";
  const planActif = s?.etat?.plansActifs.map((id) => a?.plansDeCoupe[id]?.nom).filter(Boolean).join(", ");
  return (
    <div className="planche-accrochage planche-scenes-l4" data-planche-scenes-l4>
      <h4>{t("planche.scene.projet")}</h4>
      {scenes.length === 0 && <p className="inspecteur-aide">{t("planche.scenes.aucune")}</p>}
      <dl className="planche-accrochage-genres">
        {scenes.map((x) => (
          <div key={x.id} className={`planche-accrochage-ligne${active === x.id ? " est-actif" : ""}`}>
            <dt>
              <button type="button" className="planche-ligne-choix" onClick={() => onAppliquer(x)} data-planche-scene-l4={x.id}>{x.nom}</button>
            </dt>
            <dd>{t(x.projection === "parallele" ? "planche.scene.parallele" : "planche.scene.perspective")}</dd>
          </div>
        ))}
      </dl>
      <div className="planche-debit-barre" role="toolbar" aria-label={t("panneau.scenes")}>
        <BoutonCommande id="scenes-types" disponibilite={disponibilite} executer={() => setMenu((v) => !v)} plein />
        <button type="button" disabled={lecture || !s} onClick={() => s && onMettreAJour(s.id)} data-planche-scene-l4-maj>{t("planche.scene.mettre-a-jour")}</button>
      </div>
      {menu && (
        <ul className="planche-parametres" data-planche-scenes-types>
          {types.map((x, i) => (
            <li key={`${x.genre}-${i}`}>
              <button type="button" onClick={() => { setMenu(false); onScenesTypes([x.genre]); }} data-planche-scene-type={x.genre}>
                <span>{t(`planche.scene.type.${x.genre}` as CleMessage)}</span>
                <span>{x.echelle ? `1:${x.echelle}` : ""}</span>
              </button>
            </li>
          ))}
          <li>
            <button type="button" onClick={() => { setMenu(false); executer("scenes-types"); }} data-planche-scene-type="tous">{t("planche.scene.type.tous")}</button>
          </li>
        </ul>
      )}
      {s && (
        <>
          <h4>{t("planche.scene.memorise", { nom: s.nom })}</h4>
          <dl className="planche-accrochage-genres" data-planche-scene-memoire>
            <div className="planche-accrochage-ligne"><dt>{t("planche.scene.balises-visibles")}</dt><dd>{s.etat ? balisesVisibles || t("planche.scene.aucun") : t("planche.scene.non-memorise")}</dd></div>
            <div className="planche-accrochage-ligne"><dt>{t("planche.scene.plan-actif")}</dt><dd>{s.etat ? planActif || t("planche.scene.aucun") : t("planche.scene.non-memorise")}</dd></div>
            <div className="planche-accrochage-ligne"><dt>{t("planche.scene.style")}</dt><dd>{s.etat?.style && (MODES_FACE as readonly string[]).includes(s.etat.style) ? t(`planche.scene.style.${s.etat.style}` as CleMessage) : t("planche.scene.non-memorise")}</dd></div>
            <div className="planche-accrochage-ligne"><dt>{t("planche.scene.masques")}</dt><dd>{s.etat ? String(s.etat.masques.length) : t("planche.scene.non-memorise")}</dd></div>
            <div className="planche-accrochage-ligne"><dt>{t("planche.scene.echelle")}</dt><dd data-planche-scene-echelle-lue>{s.echelle ? `1:${s.echelle}` : t("planche.scene.sans-echelle")}</dd></div>
            <div className="planche-accrochage-ligne"><dt>{t("planche.scene.soleil")}</dt><dd>{s.soleil ? texteDate(s.soleil.jour, s.soleil.heure) : t("planche.scene.non-memorise")}</dd></div>
          </dl>
          <label className="planche-accrochage-champ">
            {t("planche.scene.echelle")}
            <ChampValide
              valeur={s.echelle ? `1:${s.echelle}` : ""}
              desactive={lecture}
              etiquette={t("planche.scene.echelle")}
              attribut="data-planche-scene-echelle"
              onValider={(x) => {
                if (!x.trim()) return onModifier(s.id, { echelle: null });
                const e = lireEchelle(x);
                return e !== null && onModifier(s.id, { echelle: e });
              }}
            />
          </label>
          <label className="planche-accrochage-champ">
            {t("planche.scene.date-soleil")}
            <ChampValide
              valeur={s.soleil ? texteDate(s.soleil.jour, s.soleil.heure) : ""}
              desactive={lecture}
              etiquette={t("planche.scene.date-soleil")}
              attribut="data-planche-scene-soleil"
              onValider={(x) => {
                if (!x.trim()) return onModifier(s.id, { soleil: null });
                const d = lireDateSoleil(x);
                return d !== null && onModifier(s.id, { soleil: d });
              }}
            />
          </label>
        </>
      )}
      <p className="inspecteur-aide">{t("planche.scene.types.aide")}</p>
    </div>
  );
}

// ————————————————————————————————————————————————————————————— Info entité · Plan de coupe (maquette lot4-3)

export function SectionPlanCoupe({
  modele,
  plan,
  lecture,
  separateur,
  pas,
  onPas,
  echelle,
  onEchelle,
  onPlacer,
  onDecaler,
  onProfondeur,
  executer,
  disponibilite,
}: {
  modele: Modele;
  plan: PlanDeCoupe;
  lecture: boolean;
  separateur: "." | ",";
  pas: number;
  onPas: (pas: number) => void;
  echelle: number | null;
  onEchelle: (e: number | null) => void;
  onPlacer: (distance: number) => boolean;
  onDecaler: (delta: number) => boolean;
  onProfondeur: (p: number | null) => boolean;
  executer: (id: IdCommandeScene) => void;
  disponibilite: (id: IdCommandeScene) => Disponibilite;
}) {
  const [deplacer, setDeplacer] = useState("");
  const [editionPas, setEditionPas] = useState(false);
  const signe = (v: number) => `${v >= 0 ? "+" : ""}${nb(v, separateur)} m`;
  const balise = plan.balise ? modele.annotations?.balises[plan.balise] : undefined;
  const reservee = balise && GENRES_RESERVES.some((g) => modele.annotations?.reglages?.balisesReservees?.[g] === balise.id);
  return (
    <div className="planche-info-large planche-accrochage" data-planche-coupe-l4>
      <h4>{t("planche.coupe.titre", { nom: plan.nom })}</h4>
      <label className="planche-accrochage-champ">
        {t("planche.coupe.distance")}
        <ChampValide valeur={`${nb(distancePlan(plan), separateur)} m`} desactive={lecture} etiquette={t("planche.coupe.distance")} attribut="data-planche-coupe-distance" onValider={(x) => { const v = lireNombre(x); return v !== null && onPlacer(v); }} />
      </label>
      <label className="planche-accrochage-champ">
        {t("planche.coupe.deplacer")}
        <input
          value={deplacer}
          disabled={lecture}
          placeholder={signe(0)}
          onKeyDown={(e) => {
            arreter(e);
            if (e.key === "Enter") {
              const v = lireNombre(deplacer);
              if (v !== null && onDecaler(v)) setDeplacer("");
            }
          }}
          onChange={(e) => setDeplacer(e.target.value)}
          data-planche-coupe-deplacer
        />
      </label>
      <div className="planche-debit-barre" role="toolbar" aria-label={t("planche.coupe.deplacer")}>
        <BoutonCommande id="reculer-coupe" disponibilite={disponibilite} executer={executer} />
        <BoutonCommande id="avancer-coupe" disponibilite={disponibilite} executer={executer} />
        {editionPas ? (
          <ChampValide valeur={nb(pas, separateur)} etiquette={t("planche.coupe.pas-titre")} attribut="data-planche-coupe-pas-champ" onValider={(x) => { const v = lireNombre(x); if (v === null || !(v > 0)) return false; onPas(v); setEditionPas(false); return true; }} />
        ) : (
          <button type="button" onClick={() => setEditionPas(true)} data-planche-coupe-pas>{t("planche.coupe.pas", { pas: `${nb(pas, separateur)} m` })}</button>
        )}
      </div>
      <label className="planche-accrochage-champ">
        {t("planche.coupe.profondeur")}
        <ChampValide valeur={plan.profondeur !== undefined ? `${nb(plan.profondeur, separateur)} m` : ""} desactive={lecture} etiquette={t("planche.coupe.profondeur")} attribut="data-planche-coupe-profondeur" onValider={(x) => { if (!x.trim()) return onProfondeur(null); const v = lireNombre(x); return v !== null && v > 0 && onProfondeur(v); }} />
      </label>
      <p className="inspecteur-aide">{t("planche.coupe.profondeur.aide")}</p>
      <h4>{t("planche.coupe.scene")}</h4>
      <label className="planche-accrochage-champ">
        {t("planche.scene.echelle")}
        <ChampValide valeur={echelle ? `1:${echelle}` : ""} etiquette={t("planche.scene.echelle")} attribut="data-planche-coupe-echelle" onValider={(x) => { if (!x.trim()) { onEchelle(null); return true; } const e = lireEchelle(x); if (e === null) return false; onEchelle(e); return true; }} />
      </label>
      <div className="planche-debit-barre" role="toolbar" aria-label={t("planche.coupe.scene")}>
        <BoutonCommande id="scene-face-coupe" disponibilite={disponibilite} executer={executer} plein />
      </div>
      <p className="inspecteur-aide">{echelle ? t("planche.coupe.scene.aide", { echelle: `1:${echelle}` }) : t("planche.coupe.scene.aide-sans")}</p>
      <div className="planche-accrochage-ligne">
        <dt>{t("planche.info.balise")}</dt>
        <dd data-planche-coupe-balise>{balise ? `${balise.nom}${reservee ? ` (${t("planche.balise.reservee")})` : ""}` : t("planche.info.sans-balise")}</dd>
      </div>
    </div>
  );
}

// ————————————————————————————————————————————————————————————— Panneau « Nouvelle Planche » (maquette lot4-4)

export interface GabaritDisponible {
  /** Identifiant de l'archive en base (ou « local: » pour un gabarit lu mais pas encore rangé). */
  readonly id: string;
  readonly nomFichier: string;
  readonly gabarit: Gabarit;
  /** Texte du fichier, gardé tel quel avec le modèle de la Planche créée. */
  readonly texte: string;
  readonly archive?: ArchiveFichier;
  readonly refusArchive?: MotifRefusArchive;
}

export function PanneauGabarit({
  gabarits,
  choisi,
  onChoisir,
  separateur,
  note,
  executer,
  disponibilite,
}: {
  gabarits: readonly GabaritDisponible[];
  choisi: string;
  onChoisir: (id: string) => void;
  separateur: "." | ",";
  note: string | null;
  executer: (id: IdCommandeGabarit) => void;
  disponibilite: (id: IdCommandeGabarit) => Disponibilite;
}) {
  const g = gabarits.find((x) => x.id === choisi);
  const r = g ? resumeGabarit(g.gabarit) : null;
  return (
    <div className="planche-accrochage" data-planche-gabarit>
      <h4>{t("planche.gabarit.titre")}</h4>
      <label className="planche-accrochage-champ">
        {t("planche.gabarit.titre-champ")}
        <select value={choisi} onChange={(e) => onChoisir(e.target.value)} data-planche-gabarit-choix>
          <option value="">{t("planche.gabarit.vide")}</option>
          {gabarits.map((x) => (
            <option key={x.id} value={x.id}>{x.gabarit.nom}</option>
          ))}
        </select>
      </label>
      <div className="planche-debit-barre planche-gabarit-barre" role="toolbar" aria-label={t("planche.gabarit.titre")}>
        <BoutonCommande id="importer-gabarit" disponibilite={disponibilite} executer={executer} />
        <BoutonCommande id="enregistrer-gabarit" disponibilite={disponibilite} executer={executer} />
      </div>
      {g && r && (
        <dl className="planche-accrochage-genres" data-planche-gabarit-resume>
          <div className="planche-accrochage-ligne"><dt>{t("planche.gabarit.unite")}</dt><dd>{t(`planche.unites.${r.unite}` as CleMessage)}</dd></div>
          <div className="planche-accrochage-ligne"><dt>{t("planche.gabarit.pas")}</dt><dd>{r.pas !== null ? `${nb(r.pas * 1000, separateur, r.pas * 1000 < 1 ? 2 : 0)} mm` : t("planche.gabarit.sans")}</dd></div>
          <div className="planche-accrochage-ligne"><dt>{t("planche.gabarit.balises")}</dt><dd data-planche-gabarit-balises>{r.balises}</dd></div>
          <div className="planche-accrochage-ligne"><dt>{t("planche.gabarit.reservees")}</dt><dd>{r.reservees}</dd></div>
          <div className="planche-accrochage-ligne"><dt>{t("planche.gabarit.scenes-types")}</dt><dd>{r.scenesTypes}</dd></div>
        </dl>
      )}
      {g && <p className="inspecteur-aide" translate="no">{g.nomFichier} · {g.gabarit.source}</p>}
      <div className="planche-debit-barre" role="toolbar" aria-label={t("planche.gabarit.creer")}>
        <BoutonCommande id="creer-planche-gabarit" disponibilite={disponibilite} executer={executer} plein />
      </div>
      <p className="inspecteur-aide">{t("planche.gabarit.aide")}</p>
      {note && <p className="inspecteur-aide" role="status" data-planche-gabarit-note>{note}</p>}
    </div>
  );
}
