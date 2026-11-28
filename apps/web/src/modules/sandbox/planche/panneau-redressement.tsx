/**
 * Panneau de l'étape 7c du lot C4 (cas 4 du catalogue des extensions : D10-F23a-003 ; capture
 * `analyses/catalogue-extensions/cas-4/maquettes/c4-etape-7c-redressement.png`) : « Redresser une photo ». La photo est
 * affichée réduite ; un clic pointe un coin (A à D : bas gauche, bas droit, haut droit, haut gauche) puis des points de
 * contrôle (E et suivants) ; une loupe suit le pointeur. Dimensions du rectangle, positions des contrôles et pose dans le
 * dessin sont saisies ; les résidus et l'alerte de façade non plane sont recalculés à chaque saisie.
 */
import { useEffect, useRef, useState } from "react";
import type { PixelFond } from "@parcours/sandbox-planche-model";
import { t } from "../messages";
import { Pictogramme } from "../pictogrammes/Pictogramme";
import { COMMANDES_REDRESSEMENT, type Disponibilite, type IdCommandeRedressement } from "./commandes-objets";
import { afficherRaccourci } from "./outils-planche";

const arreter = (e: { stopPropagation(): void }) => e.stopPropagation();
const LETTRES = "ABCDEFGHIJKL";
/** Coins puis contrôles : 12 points au plus. */
export const POINTS_REDRESSEMENT_MAX = 12;
const LARGEUR_VUE = 320;
const LOUPE = 96;
const GROSSISSEMENT = 4;

export interface SaisieRedressement {
  readonly largeur: string;
  readonly hauteur: string;
  readonly x: string;
  readonly y: string;
  readonly altitude: string;
  readonly azimut: string;
  /** Positions saisies des contrôles (s, t), dans l'ordre des points E, F… */
  readonly controles: readonly { readonly s: string; readonly t: string }[];
}

export interface ResumeResidus {
  /** Texte de l'écart moyen, ou null (non évalué). */
  readonly moyen: string | null;
  readonly points: readonly string[];
  readonly nonPlane: boolean;
}

function Bouton({ id, executer, disponibilite, principal = false }: { id: IdCommandeRedressement; executer: (id: IdCommandeRedressement) => void; disponibilite: (id: IdCommandeRedressement) => Disponibilite; principal?: boolean }) {
  const c = COMMANDES_REDRESSEMENT.find((x) => x.id === id)!;
  const d = disponibilite(id);
  return (
    <button type="button" className={principal ? "est-principal" : undefined} disabled={!d.disponible} title={`${t(c.libelle)} (${afficherRaccourci(c.raccourci)})${d.motif ? ` — ${t(d.motif)}` : ""}`} aria-label={t(c.libelle)} onClick={() => executer(id)} data-planche-commande={id}>
      <Pictogramme picto={c.picto} /> {t(c.court)} ({afficherRaccourci(c.raccourci)})
    </button>
  );
}

export function PanneauRedressement({
  photo,
  points,
  onPointer,
  saisie,
  onSaisie,
  residus,
  executer,
  disponibilite,
  onChoisirFichier,
  erreur,
  note,
  lecture,
}: {
  /** Photo réduite (data URL) et ses dimensions, ou null. */
  photo: { readonly nom: string; readonly image: string; readonly largeur: number; readonly hauteur: number } | null;
  points: readonly PixelFond[];
  onPointer: (p: PixelFond) => void;
  saisie: SaisieRedressement;
  onSaisie: (s: SaisieRedressement) => void;
  residus: ResumeResidus | null;
  executer: (id: IdCommandeRedressement) => void;
  disponibilite: (id: IdCommandeRedressement) => Disponibilite;
  onChoisirFichier: () => void;
  erreur: string | null;
  note: string | null;
  lecture: boolean;
}) {
  const vue = useRef<HTMLCanvasElement | null>(null);
  const loupe = useRef<HTMLCanvasElement | null>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [survol, setSurvol] = useState<PixelFond | null>(null);
  const k = photo ? LARGEUR_VUE / photo.largeur : 1;
  const hauteurVue = photo ? Math.round(photo.hauteur * k) : 0;

  useEffect(() => {
    if (!photo) return setImg(null);
    const i = new Image();
    i.onload = () => setImg(i);
    i.src = photo.image;
  }, [photo]);

  // Photo, quadrilatère des coins et lettres des points.
  useEffect(() => {
    const c = vue.current?.getContext("2d");
    if (!c || !img || !photo) return;
    c.clearRect(0, 0, LARGEUR_VUE, hauteurVue);
    c.drawImage(img, 0, 0, LARGEUR_VUE, hauteurVue);
    const style = getComputedStyle(vue.current!);
    const trait = style.getPropertyValue("--couleur-accent").trim() || style.color;
    c.strokeStyle = trait;
    c.fillStyle = trait;
    c.lineWidth = 2;
    const coins = points.slice(0, 4);
    if (coins.length > 1) {
      c.beginPath();
      coins.forEach((p, i) => (i === 0 ? c.moveTo(p.u * k, p.v * k) : c.lineTo(p.u * k, p.v * k)));
      if (coins.length === 4) c.closePath();
      c.stroke();
    }
    c.font = "bold 12px sans-serif";
    points.forEach((p, i) => {
      c.beginPath();
      c.arc(p.u * k, p.v * k, 3, 0, 2 * Math.PI);
      c.fill();
      c.fillText(LETTRES[i]!, p.u * k + 5, p.v * k - 5);
    });
  }, [img, photo, points, k, hauteurVue]);

  // Loupe : la zone survolée, grossie, avec sa croix de visée.
  useEffect(() => {
    const c = loupe.current?.getContext("2d");
    if (!c || !img || !photo || !survol) return;
    const cote = LOUPE / GROSSISSEMENT / k;
    c.imageSmoothingEnabled = false;
    c.clearRect(0, 0, LOUPE, LOUPE);
    c.drawImage(img, survol.u - cote / 2, survol.v - cote / 2, cote, cote, 0, 0, LOUPE, LOUPE);
    c.strokeStyle = getComputedStyle(loupe.current!).color;
    c.beginPath();
    c.moveTo(LOUPE / 2, 0);
    c.lineTo(LOUPE / 2, LOUPE);
    c.moveTo(0, LOUPE / 2);
    c.lineTo(LOUPE, LOUPE / 2);
    c.stroke();
  }, [img, photo, survol, k]);

  const pixel = (e: React.PointerEvent<HTMLCanvasElement>): PixelFond => {
    const r = e.currentTarget.getBoundingClientRect();
    return { u: Math.min(photo!.largeur, Math.max(0, ((e.clientX - r.left) / r.width) * LARGEUR_VUE / k)), v: Math.min(photo!.hauteur, Math.max(0, ((e.clientY - r.top) / r.height) * hauteurVue / k)) };
  };
  const champ = (cle: keyof Omit<SaisieRedressement, "controles">, libelle: string) => (
    <label>
      {libelle}{" "}
      <input type="text" inputMode="decimal" size={7} value={saisie[cle]} disabled={lecture} onKeyDown={arreter} onChange={(e) => onSaisie({ ...saisie, [cle]: e.target.value })} data-planche-redressement-champ={cle} />
    </label>
  );
  const controles = Math.max(0, points.length - 4);

  return (
    <div className="planche-controle planche-fonds planche-ifc" data-planche-redressement={points.length}>
      <p className="inspecteur-aide" data-planche-redressement-lu>{photo ? t("planche.redressement.lu", { nom: photo.nom, largeur: String(photo.largeur), hauteur: String(photo.hauteur) }) : t("planche.redressement.aucun")}</p>
      <div className="planche-debit-barre">
        <button type="button" onClick={onChoisirFichier} data-planche-redressement-choisir>
          {t("planche.redressement.choisir")}
        </button>
      </div>
      {photo && (
        <>
          <p className="inspecteur-aide">{t("planche.redressement.consigne")}</p>
          <canvas
            ref={vue}
            width={LARGEUR_VUE}
            height={hauteurVue}
            style={{ width: "100%", height: "auto", cursor: "crosshair", touchAction: "none" }}
            aria-label={t("planche.redressement.photo")}
            onPointerMove={(e) => setSurvol(pixel(e))}
            onPointerLeave={() => setSurvol(null)}
            onPointerDown={(e) => {
              if (lecture || points.length >= POINTS_REDRESSEMENT_MAX) return;
              e.preventDefault();
              onPointer(pixel(e));
            }}
            data-planche-redressement-photo
          />
          {survol && <canvas ref={loupe} width={LOUPE} height={LOUPE} aria-label={t("planche.redressement.loupe")} data-planche-redressement-loupe />}
          <p className="inspecteur-aide" data-planche-redressement-coins>{t("planche.redressement.coins", { nombre: String(Math.min(4, points.length)) })}</p>
          <div className="planche-ifc-coches">
            {champ("largeur", t("planche.redressement.largeur"))}
            {champ("hauteur", t("planche.redressement.hauteur"))}
          </div>
          {controles > 0 && (
            <fieldset className="planche-ifc-coches">
              <legend>{t("planche.redressement.controles")}</legend>
              {Array.from({ length: controles }, (_, i) => {
                const id = LETTRES[i + 4]!;
                const v = saisie.controles[i] ?? { s: "", t: "" };
                const maj = (n: { s: string; t: string }) => onSaisie({ ...saisie, controles: Array.from({ length: controles }, (_, j) => (j === i ? n : (saisie.controles[j] ?? { s: "", t: "" }))) });
                return (
                  <span key={id}>
                    {id}{" "}
                    <input type="text" inputMode="decimal" size={6} value={v.s} disabled={lecture} aria-label={t("planche.redressement.controle.s", { id })} onKeyDown={arreter} onChange={(e) => maj({ ...v, s: e.target.value })} data-planche-redressement-controle={`${id}-s`} />{" "}
                    <input type="text" inputMode="decimal" size={6} value={v.t} disabled={lecture} aria-label={t("planche.redressement.controle.t", { id })} onKeyDown={arreter} onChange={(e) => maj({ ...v, t: e.target.value })} data-planche-redressement-controle={`${id}-t`} />
                  </span>
                );
              })}
            </fieldset>
          )}
          {residus && (
            <div data-planche-redressement-residus>
              <p className="inspecteur-aide">{residus.moyen === null ? t("planche.redressement.residus.non-evalues") : residus.moyen}</p>
              {residus.points.length > 0 && <p className="inspecteur-aide">{residus.points.join(" · ")}</p>}
              {residus.nonPlane && <p className="planche-message" role="alert" data-planche-redressement-alerte>{t("planche.redressement.alerte")}</p>}
            </div>
          )}
          <fieldset className="planche-ifc-coches">
            <legend>{t("planche.redressement.pose")}</legend>
            {champ("x", t("planche.redressement.x"))}
            {champ("y", t("planche.redressement.y"))}
            {champ("altitude", t("planche.redressement.altitude"))}
            {champ("azimut", t("planche.redressement.azimut"))}
          </fieldset>
          <p className="inspecteur-aide">{t("planche.redressement.aide")}</p>
        </>
      )}
      <div className="planche-debit-barre" role="toolbar" aria-label={t("planche.redressement.barre")}>
        <Bouton id="poser-redressee" executer={executer} disponibilite={disponibilite} principal />
        <Bouton id="effacer-points-redressement" executer={executer} disponibilite={disponibilite} />
      </div>
      {erreur && <p className="planche-message" role="alert" data-planche-redressement-erreur>{erreur}</p>}
      {note && <p className="inspecteur-aide" data-planche-redressement-note>{note}</p>}
    </div>
  );
}
