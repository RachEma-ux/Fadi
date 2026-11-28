/**
 * Panneau « PDF reçu » (cas 4 du catalogue des extensions, lot C4, étape 4 : D10-F14-008, D10-F14-009, D10-S-004 ;
 * maquette `analyses/catalogue-extensions/cas-4/maquettes/c4-etape-4-pdf-recu.png`) : pages du PDF, aperçu cliquable
 * (mesure à l'échelle du fichier, barre d'échelle pointée), échelle proposée puis confirmée, niveau et origine ;
 * barre : ouvrir, mesurer, barre d'échelle, confirmer, insérer la page, poser une page scannée en fond.
 */
import { accrocherPdf, estCercleComplet, mesurePdf, type ImagePdf, type PagePdf, type PointPdf } from "@parcours/sandbox-planche-model";
import { useRef } from "react";
import { LOCALE } from "../../../lib/i18n";
import { t } from "../messages";
import { Pictogramme } from "../pictogrammes/Pictogramme";
import { COMMANDES_PDF, type Disponibilite, type IdCommandePdf } from "./commandes-objets";
import { afficherRaccourci } from "./outils-planche";

const arreter = (e: { stopPropagation(): void }) => e.stopPropagation();
const nombre = (v: number, d = 1, max = d): string => v.toLocaleString(LOCALE, { minimumFractionDigits: d, maximumFractionDigits: max });
/** Traits dessinés dans l'aperçu (tous sont insérés). */
export const TRAITS_APERCU_MAX = 30_000;

/** Format A (A0 à A5) de la page, à 2 mm près, dans un sens ou l'autre ; sinon rien. */
export function formatPage(l: number, h: number): string {
  const [c, g] = l < h ? [l, h] : [h, l];
  const formats: [string, number, number][] = [["A0", 841, 1189], ["A1", 594, 841], ["A2", 420, 594], ["A3", 297, 420], ["A4", 210, 297], ["A5", 148, 210]];
  const f = formats.find(([, a, b]) => Math.abs(a - c) <= 2 && Math.abs(b - g) <= 2);
  return f ? ` · ${f[0]}` : "";
}

export interface EtatPdf {
  readonly nom: string;
  /** Archive de l'original ; `null` = archivage en cours ou refusé. */
  readonly fichier: { readonly id: string; readonly empreinte: string } | null;
  readonly pages: readonly PagePdf[];
}

export function PanneauPdfRecu({
  pdf,
  choisie,
  onChoisir,
  mode,
  points,
  onPoint,
  proposition,
  echelleBarre,
  longueurBarre,
  onLongueurBarre,
  echelle,
  onEchelle,
  confirmee,
  niveaux,
  niveau,
  onNiveau,
  origine,
  onOrigine,
  lecture,
  executer,
  disponibilite,
  erreur,
  note,
}: {
  pdf: EtatPdf | null;
  choisie: number;
  onChoisir: (i: number) => void;
  mode: "mesure" | "barre" | null;
  points: readonly PointPdf[];
  onPoint: (p: PointPdf) => void;
  proposition: { readonly echelle: number; readonly texte: string } | null;
  echelleBarre: number | null;
  longueurBarre: string;
  onLongueurBarre: (s: string) => void;
  echelle: string;
  onEchelle: (s: string) => void;
  confirmee: number | null;
  niveaux: readonly { readonly id: string; readonly nom: string; readonly altitude: number }[];
  niveau: string | null;
  onNiveau: (id: string | null) => void;
  origine: { readonly x: string; readonly y: string };
  onOrigine: (o: { x: string; y: string }) => void;
  lecture: boolean;
  executer: (id: IdCommandePdf) => void;
  disponibilite: (id: IdCommandePdf) => Disponibilite;
  erreur: string | null;
  note: string | null;
}) {
  const groupe = useRef<SVGGElement | null>(null);
  const page = pdf?.pages[choisie] ?? null;
  const bouton = (id: IdCommandePdf, classe = "") => {
    const c = COMMANDES_PDF.find((x) => x.id === id)!;
    const d = disponibilite(id);
    const actif = (id === "mesurer-pdf" && mode === "mesure") || (id === "barre-echelle-pdf" && mode === "barre");
    return (
      <button key={id} type="button" className={`${classe}${actif ? " est-actif" : ""}`} aria-pressed={id === "mesurer-pdf" || id === "barre-echelle-pdf" ? actif : undefined} disabled={!d.disponible} title={`${t(c.libelle)} (${afficherRaccourci(c.raccourci)})${d.motif ? ` — ${t(d.motif)}` : ""}`} aria-label={t(c.libelle)} onClick={() => executer(id)} data-planche-commande={id}>
        <Pictogramme picto={c.picto} /> {t(c.court)} ({afficherRaccourci(c.raccourci)})
      </button>
    );
  };
  const cliquer = (e: React.MouseEvent<SVGSVGElement>) => {
    const g = groupe.current;
    if (!page || !mode || !g) return;
    const m = g.getScreenCTM();
    if (!m) return;
    const q = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    // Accrochage : 8 pixels à l'écran, en millimètres papier.
    const tol = 8 / Math.max(1e-9, Math.hypot(m.a, m.b));
    onPoint(accrocherPdf(page, { x: q.x, y: q.y }, tol).point);
  };
  let d = "";
  if (page) for (const s of page.traits.slice(0, TRAITS_APERCU_MAX)) d += `M${s.a.x.toFixed(2)} ${s.a.y.toFixed(2)}L${s.b.x.toFixed(2)} ${s.b.y.toFixed(2)}`;
  const arcs = page?.arcs.slice(0, TRAITS_APERCU_MAX) ?? [];
  const papier = points.length === 2 ? Math.hypot(points[1]!.x - points[0]!.x, points[1]!.y - points[0]!.y) : null;
  const ecrite = proposition?.echelle ?? null;
  return (
    <div className="planche-controle planche-fonds planche-pdf" data-planche-pdf={pdf ? pdf.pages.length : 0}>
      {!pdf ? (
        <p className="inspecteur-aide" data-planche-pdf-vide>{t("planche.pdf.vide")}</p>
      ) : (
        <>
          <p className="inspecteur-aide" data-planche-pdf-fichier={pdf.fichier?.id ?? ""}>
            {pdf.fichier ? t("planche.pdf.fichier", { nom: pdf.nom, pages: String(pdf.pages.length), empreinte: pdf.fichier.empreinte.slice(0, 12) }) : t("planche.pdf.fichier-local", { nom: pdf.nom, pages: String(pdf.pages.length) })}
          </p>
          <ul className="planche-fonds-liste">
            {pdf.pages.map((p, i) => {
              const vect = p.traits.length + p.arcs.length > 0;
              const img = p.images[0];
              return (
                <li key={p.numero} className={i === choisie ? "est-choisi" : ""} data-planche-pdf-page={p.numero} data-traits={p.traits.length} data-arcs={p.arcs.length} data-images={p.images.length}>
                  <button type="button" onClick={() => onChoisir(i)} aria-pressed={i === choisie}>
                    <b>{t("planche.pdf.page", { numero: String(p.numero), format: formatPage(p.largeur, p.hauteur), largeur: nombre(p.largeur, 0), hauteur: nombre(p.hauteur, 0) })}</b>
                    <span className={`planche-fonds-etat ${vect ? "est-cale" : "est-non-cale"}`}>{t(vect ? "planche.pdf.page.vectorielle" : img ? "planche.pdf.page.image" : "planche.pdf.page.vide")}</span>
                    <small>
                      {vect && t("planche.pdf.page.detail", { traits: p.traits.length.toLocaleString(LOCALE), arcs: p.arcs.length.toLocaleString(LOCALE), courbes: p.courbesEnSegments.toLocaleString(LOCALE), aplats: p.aplats.toLocaleString(LOCALE) })}
                      {img && `${vect ? " · " : ""}${t("planche.pdf.page.detail-image", { format: img.format === "jpeg" ? "JPEG" : "PNG", largeur: String(img.largeurPx), hauteur: String(img.hauteurPx) })}`}
                      {p.nonLus > 0 && ` · ${t("planche.pdf.page.non-lus", { nombre: String(p.nonLus) })}`}
                      {p.tropDeTraits && ` · ${t("planche.pdf.page.trop")}`}
                    </small>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
      {page && (
        <>
          <svg className={`planche-pdf-apercu${mode ? " est-pointage" : ""}`} viewBox={`0 0 ${page.largeur} ${page.hauteur}`} preserveAspectRatio="xMidYMid meet" onClick={cliquer} role="img" aria-label={t("planche.pdf.apercu")} data-planche-pdf-apercu={page.numero}>
            <rect className="planche-pdf-feuille" x={0} y={0} width={page.largeur} height={page.hauteur} />
            <g ref={groupe} transform={`matrix(1 0 0 -1 0 ${page.hauteur})`}>
              <path className="planche-pdf-traits" d={d} />
              {arcs.map((a, i) => {
                if (estCercleComplet(a)) return <circle key={i} className="planche-pdf-arc" cx={a.centre.x} cy={a.centre.y} r={a.rayon} />;
                const x0 = a.centre.x + a.rayon * Math.cos(a.debut);
                const y0 = a.centre.y + a.rayon * Math.sin(a.debut);
                const x1 = a.centre.x + a.rayon * Math.cos(a.debut + a.angle);
                const y1 = a.centre.y + a.rayon * Math.sin(a.debut + a.angle);
                return <path key={i} className="planche-pdf-arc" d={`M${x0} ${y0}A${a.rayon} ${a.rayon} 0 ${Math.abs(a.angle) > Math.PI ? 1 : 0} ${a.angle > 0 ? 1 : 0} ${x1} ${y1}`} />;
              })}
              {points.length === 2 && <line className={mode === "barre" ? "planche-pdf-barre" : "planche-pdf-mesure"} x1={points[0]!.x} y1={points[0]!.y} x2={points[1]!.x} y2={points[1]!.y} />}
              {points.map((p, i) => (
                <circle key={`p${i}`} className={mode === "barre" ? "planche-pdf-point est-barre" : "planche-pdf-point"} cx={p.x} cy={p.y} r={Math.max(page.largeur, page.hauteur) / 150} data-planche-pdf-point={i} />
              ))}
            </g>
          </svg>
          <p className="inspecteur-aide">
            {t(mode === "mesure" ? "planche.pdf.mode.mesure" : mode === "barre" ? "planche.pdf.mode.barre" : "planche.pdf.apercu")}
            {page.traits.length > TRAITS_APERCU_MAX ? ` ${t("planche.pdf.apercu-partiel", { nombre: TRAITS_APERCU_MAX.toLocaleString(LOCALE) })}` : ""}
          </p>
          {mode === "mesure" && papier !== null && (
            <p className="planche-pdf-resultat" data-planche-pdf-mesure={confirmee !== null ? mesurePdf(points[0]!, points[1]!, confirmee).toFixed(4) : ""}>
              <b>{confirmee !== null ? t("planche.pdf.mesure", { longueur: nombre(mesurePdf(points[0]!, points[1]!, confirmee), 2), papier: nombre(papier, 1), echelle: nombre(confirmee, 0, 2) }) : t("planche.pdf.mesure-papier", { papier: nombre(papier, 1) })}</b>
            </p>
          )}
          <div className="planche-fonds-recue" data-planche-pdf-proposee={ecrite ?? ""}>
            <p>{proposition ? <b>{t("planche.pdf.echelle.texte", { echelle: String(proposition.echelle), texte: proposition.texte })}</b> : t("planche.pdf.echelle.texte-aucune")}</p>
            {mode === "barre" ? (
              <p className="planche-pdf-ligne">
                {papier !== null && mode === "barre" ? t("planche.pdf.echelle.barre", { papier: nombre(papier, 1) }) : t("planche.pdf.echelle.barre-aide")}{" "}
                {mode === "barre" && papier !== null && (
                  <>
                    <input value={longueurBarre} inputMode="decimal" onKeyDown={arreter} onChange={(e) => onLongueurBarre(e.target.value)} data-planche-pdf-longueur-barre />{" "}
                    {echelleBarre !== null && (
                      <span data-planche-pdf-echelle-barre={echelleBarre.toFixed(3)}>
                        {t("planche.pdf.echelle.barre-resultat", { echelle: nombre(echelleBarre, 1) })}
                        {ecrite !== null ? `, ${t(Math.abs(echelleBarre - ecrite) / ecrite < 0.01 ? "planche.pdf.echelle.concordante" : "planche.pdf.echelle.discordante")}` : ""}
                      </span>
                    )}
                  </>
                )}
              </p>
            ) : null}
            <p className="inspecteur-aide">{confirmee !== null ? t("planche.pdf.echelle.confirmee", { echelle: nombre(confirmee, 0, 3) }) : t("planche.pdf.echelle.attente")}</p>
          </div>
          <div className="planche-pdf-reglages">
            <label>
              <span>{t("planche.pdf.echelle")}</span>
              <input value={echelle} inputMode="decimal" disabled={lecture} onKeyDown={arreter} onChange={(e) => onEchelle(e.target.value)} data-planche-pdf-echelle />
            </label>
            <label>
              <span>{t("planche.pdf.niveau")}</span>
              <select value={niveau ?? ""} disabled={lecture} onKeyDown={arreter} onChange={(e) => onNiveau(e.target.value || null)} data-planche-pdf-niveau>
                {niveaux.length === 0 && <option value="">{t("planche.pdf.niveau-aucun")}</option>}
                {niveaux.map((n) => (
                  <option key={n.id} value={n.id}>{`${n.nom} (${n.altitude >= 0 ? "+" : ""}${nombre(n.altitude, 2)})`}</option>
                ))}
              </select>
            </label>
            <label>
              <span>{t("planche.pdf.origine-x")}</span>
              <input value={origine.x} inputMode="decimal" disabled={lecture} onKeyDown={arreter} onChange={(e) => onOrigine({ ...origine, x: e.target.value })} data-planche-pdf-origine="x" />
            </label>
            <label>
              <span>{t("planche.pdf.origine-y")}</span>
              <input value={origine.y} inputMode="decimal" disabled={lecture} onKeyDown={arreter} onChange={(e) => onOrigine({ ...origine, y: e.target.value })} data-planche-pdf-origine="y" />
            </label>
          </div>
        </>
      )}
      <div className="planche-debit-barre" role="toolbar" aria-label={t("planche.pdf.barre")}>
        {bouton("ouvrir-pdf")}
        {bouton("mesurer-pdf")}
        {bouton("barre-echelle-pdf")}
        {bouton("confirmer-echelle-pdf")}
        {bouton("inserer-pdf", "est-principal")}
        {bouton("poser-fond-pdf")}
      </div>
      {erreur && <p className="planche-message" role="alert" data-planche-pdf-erreur>{erreur}</p>}
      {note && <p className="inspecteur-aide" data-planche-pdf-note>{note}</p>}
      <p className="inspecteur-aide">{t("planche.pdf.aide")}</p>
    </div>
  );
}

/** Fichier image d'une page scannée : JPEG tel quel, pixels gris ou RVB rendus en PNG (canevas du navigateur). */
export async function fichierImagePdf(img: ImagePdf, nom: string): Promise<File> {
  if (img.format === "jpeg") return new File([img.octets as BlobPart], `${nom}.jpg`, { type: "image/jpeg" });
  const toile = document.createElement("canvas");
  toile.width = img.largeurPx;
  toile.height = img.hauteurPx;
  const ctx = toile.getContext("2d");
  if (!ctx) throw new Error("canevas");
  const donnees = ctx.createImageData(img.largeurPx, img.hauteurPx);
  const n = img.largeurPx * img.hauteurPx;
  for (let i = 0; i < n; i++) {
    const k = i * img.composantes;
    const [r, g, b] = img.composantes === 1 ? [img.octets[k]!, img.octets[k]!, img.octets[k]!] : [img.octets[k]!, img.octets[k + 1]!, img.octets[k + 2]!];
    donnees.data[i * 4] = r;
    donnees.data[i * 4 + 1] = g;
    donnees.data[i * 4 + 2] = b;
    donnees.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(donnees, 0, 0);
  const blob = await new Promise<Blob | null>((ok) => toile.toBlob(ok, "image/png"));
  if (!blob) throw new Error("png");
  return new File([blob], `${nom}.png`, { type: "image/png" });
}
