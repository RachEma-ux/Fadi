/**
 * Panneau « Feuilles » (cas 4 du catalogue des extensions, étape 6 : D7-F11-013, D7-F11-012, D7-F11-011 ; maquette
 * `analyses/catalogue-extensions/cas-4/maquettes/etape-6-feuilles-pdf.png`) : liste des feuilles (cochées pour le jeu
 * PDF), aperçu de la feuille choisie (cliquer une fenêtre de vue la choisit), champs de la feuille et du cartouche,
 * réglages de la fenêtre choisie ; barres : nouvelle feuille, supprimer, ajouter / supprimer une fenêtre, exporter la
 * feuille ou le jeu en PDF vectoriel, motif des noms de fichiers.
 */
import { type CompositionFeuille, type Feuille, type FenetreVue, type Id, type PlanDeCoupe, type Scene, ECHELLES_SERIE, FORMATS_A, formatA, svgFeuille } from "@parcours/sandbox-planche-model";
import { useEffect, useState } from "react";
import { LANGUE_INTERFACE, t } from "../messages";
import { Pictogramme } from "../pictogrammes/Pictogramme";
import { COMMANDES_FEUILLES, type Disponibilite, type IdCommandeFeuille } from "./commandes-objets";
import { afficherRaccourci } from "./outils-planche";

const arreter = (e: { stopPropagation(): void }) => e.stopPropagation();
const separateur = (): "," | "." => (LANGUE_INTERFACE === "en" ? "." : ",");
const nombre = (v: number): string => String(Math.round(v * 10) / 10).replace(".", separateur());
export type ChampsFeuille = { numero: string; nom: string; indice: string; projet: string; phase: string; date: string };
const champsDe = (f: Feuille | null): ChampsFeuille => ({ numero: f?.numero ?? "", nom: f?.nom ?? "", indice: f?.indice ?? "", projet: f?.cartouche.projet ?? "", phase: f?.cartouche.phase ?? "", date: f?.cartouche.date ?? "" });
const positionDe = (w: FenetreVue | null) => (w ? `${nombre(w.x)} ; ${nombre(w.y)}` : "");
const CHAMPS_FEUILLE = ["numero", "nom", "indice", "projet", "phase", "date"] as const;

export function PanneauFeuilles({
  feuilles,
  choisie,
  composition,
  fenetre,
  cochees,
  scenes,
  plans,
  motifNoms,
  lecture,
  onChoisir,
  onCocher,
  onChoisirFenetre,
  onModifierFeuille,
  onModifierFenetre,
  onMotifNoms,
  executer,
  disponibilite,
  erreur,
  note,
}: {
  feuilles: readonly Feuille[];
  choisie: Feuille | null;
  composition: CompositionFeuille | null;
  fenetre: string | null;
  cochees: ReadonlySet<Id>;
  scenes: readonly Scene[];
  plans: readonly PlanDeCoupe[];
  motifNoms: string;
  lecture: boolean;
  onChoisir: (id: Id) => void;
  onCocher: (id: Id, coche: boolean) => void;
  onChoisirFenetre: (id: string | null) => void;
  onModifierFeuille: (v: Partial<Omit<Feuille, "id" | "fenetres">>) => void;
  onModifierFenetre: (v: Partial<Omit<FenetreVue, "id">> | { position: string }) => void;
  onMotifNoms: (v: string) => void;
  executer: (id: IdCommandeFeuille) => void;
  disponibilite: (id: IdCommandeFeuille) => Disponibilite;
  erreur: string | null;
  note: string | null;
}) {
  const [champs, setChamps] = useState<ChampsFeuille>(() => champsDe(choisie));
  const cle = choisie ? JSON.stringify([choisie.id, choisie.numero, choisie.nom, choisie.indice, choisie.cartouche]) : "";
  useEffect(() => setChamps(champsDe(choisie)), [cle]); // eslint-disable-line react-hooks/exhaustive-deps
  const w = choisie?.fenetres.find((x) => x.id === fenetre) ?? null;
  const wc = composition?.fenetres.find((x) => x.id === fenetre) ?? null;
  const [position, setPosition] = useState(positionDe(w));
  const clePos = w ? `${choisie?.id}:${w.id}:${w.x}:${w.y}` : "";
  useEffect(() => setPosition(positionDe(w)), [clePos]); // eslint-disable-line react-hooks/exhaustive-deps
  const enregistrerChamps = () => {
    if (!choisie) return;
    const avant = champsDe(choisie);
    if (CHAMPS_FEUILLE.every((c) => champs[c] === avant[c])) return;
    onModifierFeuille({ numero: champs.numero, nom: champs.nom, indice: champs.indice, cartouche: { projet: champs.projet, phase: champs.phase, date: champs.date } });
  };
  const bouton = (id: IdCommandeFeuille, classe = "", parametres: Record<string, string> = {}, avecRaccourci = false) => {
    const c = COMMANDES_FEUILLES.find((x) => x.id === id)!;
    const d = disponibilite(id);
    return (
      <button key={id} type="button" className={classe} disabled={!d.disponible} title={`${t(c.libelle)} (${afficherRaccourci(c.raccourci)})${d.motif ? ` — ${t(d.motif)}` : ""}`} aria-label={t(c.libelle)} onClick={() => executer(id)} data-planche-commande={id}>
        <Pictogramme picto={c.picto} /> {t(c.court, parametres)}
        {avecRaccourci ? ` (${afficherRaccourci(c.raccourci)})` : ""}
      </button>
    );
  };
  const choisirSurApercu = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!composition) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * composition.largeur;
    const y = ((e.clientY - r.top) / r.height) * composition.hauteur;
    const touche = composition.fenetres.find((f) => x >= f.x - 3 && x <= f.x + Math.max(f.largeur, 30) + 3 && y >= f.y - 3 && y <= f.y + f.hauteur + 8);
    onChoisirFenetre(touche?.id ?? null);
  };
  const champTexte = (c: (typeof CHAMPS_FEUILLE)[number]) => (
    <label key={c} className="planche-feuilles-champ">
      <span>{t(`planche.feuilles.champ.${c}`)}</span>
      <input value={champs[c]} disabled={lecture} onKeyDown={(e) => { arreter(e); if (e.key === "Enter") enregistrerChamps(); }} onBlur={enregistrerChamps} onChange={(e) => setChamps({ ...champs, [c]: e.target.value })} data-planche-feuille-champ={c} />
    </label>
  );
  const resume = (f: Feuille) => {
    const d = formatA(f.format);
    return t("planche.feuilles.resume", { format: `A${f.format}`, sens: t(`planche.feuilles.sens.${f.sens}`), nombre: String(f.fenetres.length), indice: f.indice ? t("planche.feuilles.resume.indice", { indice: f.indice }) : "" }) + ` · ${d.court} × ${d.long}`;
  };
  return (
    <div className="planche-controle planche-feuilles" data-planche-feuilles={feuilles.length}>
      <p className="inspecteur-aide">{t("planche.feuilles.aide")}</p>
      <div className="planche-feuilles-corps">
        <div className="planche-feuilles-gauche">
          {feuilles.length === 0 ? (
            <p className="inspecteur-aide" data-planche-feuilles-vide>{t("planche.feuilles.vide")}</p>
          ) : (
            <ul className="planche-feuilles-liste" aria-label={t("planche.feuilles.liste")}>
              {feuilles.map((f) => (
                <li key={f.id} className={f.id === choisie?.id ? "est-choisi" : ""} data-planche-feuille={f.id}>
                  <input type="checkbox" checked={cochees.has(f.id)} onChange={(e) => onCocher(f.id, e.target.checked)} onKeyDown={arreter} aria-label={t("planche.feuilles.cocher")} data-planche-feuille-cocher={f.id} />
                  <button type="button" onClick={() => onChoisir(f.id)} aria-pressed={f.id === choisie?.id}>
                    <b translate="no">{`${f.numero}${f.nom ? ` · ${f.nom}` : ""}`}</b>
                    <small>{resume(f)}</small>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="planche-debit-barre planche-feuilles-pile" role="toolbar" aria-label={t("planche.feuilles.barre")}>
            {bouton("nouvelle-feuille")}
            {bouton("supprimer-feuille")}
          </div>
        </div>
        <div className="planche-feuilles-scene">
          {composition && <img alt={t("planche.feuilles.apercu")} title={t("planche.feuilles.apercu")} src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgFeuille(composition, { surligne: fenetre }))}`} onClick={choisirSurApercu} data-planche-feuille-apercu={choisie?.id} />}
        </div>
        {choisie && (
          <div className="planche-feuilles-props">
            <fieldset>
              <legend>{t("planche.feuilles.feuille")}</legend>
              {CHAMPS_FEUILLE.slice(0, 3).map(champTexte)}
              <label className="planche-feuilles-champ">
                <span>{t("planche.feuilles.champ.format")}</span>
                <select value={choisie.format} disabled={lecture} onChange={(e) => onModifierFeuille({ format: Number(e.target.value) as Feuille["format"] })} onKeyDown={arreter} data-planche-feuille-champ="format">
                  {FORMATS_A.map((r) => <option key={r} value={r}>{`A${r} · ${formatA(r).long} × ${formatA(r).court} mm`}</option>)}
                </select>
              </label>
              <label className="planche-feuilles-champ">
                <span>{t("planche.feuilles.champ.sens")}</span>
                <select value={choisie.sens} disabled={lecture} onChange={(e) => onModifierFeuille({ sens: e.target.value as Feuille["sens"] })} onKeyDown={arreter} data-planche-feuille-champ="sens">
                  <option value="paysage">{t("planche.feuilles.option.paysage")}</option>
                  <option value="portrait">{t("planche.feuilles.option.portrait")}</option>
                </select>
              </label>
              {CHAMPS_FEUILLE.slice(3).map(champTexte)}
            </fieldset>
            {w && wc ? (
              <fieldset className="est-fenetre" data-planche-fenetre={w.id}>
                <legend>{t("planche.feuilles.fenetre", { numero: String(choisie.fenetres.indexOf(w) + 1) })}</legend>
                <label className="planche-feuilles-champ">
                  <span>{t("planche.feuilles.champ.scene")}</span>
                  <select value={w.scene ?? ""} disabled={lecture} onChange={(e) => onModifierFenetre({ scene: e.target.value || null })} onKeyDown={arreter} data-planche-fenetre-champ="scene">
                    <option value="">{t("planche.feuilles.scene.dessus")}</option>
                    {scenes.map((s) => <option key={s.id} value={s.id}>{s.projection === "parallele" ? t("planche.feuilles.scene.parallele", { nom: s.nom }) : s.nom}</option>)}
                  </select>
                </label>
                <label className="planche-feuilles-champ">
                  <span>{t("planche.feuilles.champ.echelle")}</span>
                  <select value={w.echelle} disabled={lecture} onChange={(e) => onModifierFenetre({ echelle: Number(e.target.value) })} onKeyDown={arreter} data-planche-fenetre-champ="echelle">
                    {ECHELLES_SERIE.map((x) => <option key={x} value={x}>{`1:${x}`}</option>)}
                  </select>
                </label>
                <label className="planche-feuilles-champ">
                  <span>{t("planche.feuilles.champ.coupe")}</span>
                  <select value={w.coupe ?? ""} disabled={lecture} onChange={(e) => onModifierFenetre({ coupe: (e.target.value || null) as FenetreVue["coupe"] })} onKeyDown={arreter} data-planche-fenetre-champ="coupe">
                    <option value="">{t("planche.feuilles.coupe.active")}</option>
                    <option value="aucune">{t("planche.plan.coupe.aucune")}</option>
                    {plans.map((p) => <option key={p.id} value={p.id}>{t("planche.plan.coupe.plan", { nom: p.nom })}</option>)}
                  </select>
                </label>
                <label className="planche-feuilles-champ">
                  <span>{t("planche.feuilles.champ.position")}</span>
                  <input value={position} disabled={lecture} inputMode="decimal" onKeyDown={(e) => { arreter(e); if (e.key === "Enter") onModifierFenetre({ position }); }} onBlur={() => position !== positionDe(w) && onModifierFenetre({ position })} onChange={(e) => setPosition(e.target.value)} data-planche-fenetre-champ="position" />
                </label>
                <div className="planche-feuilles-champ">
                  <span>{t("planche.feuilles.champ.taille")}</span>
                  <span data-planche-fenetre-taille={`${Math.round(wc.largeur)}x${Math.round(wc.hauteur)}`}>{t("planche.feuilles.taille", { largeur: nombre(wc.largeur), hauteur: nombre(wc.hauteur) })}</span>
                </div>
                {wc.depasse && <p className="inspecteur-aide planche-feuilles-alerte" role="alert" data-planche-fenetre-depasse>{t("planche.feuilles.depasse")}</p>}
                {wc.vide && <p className="inspecteur-aide">{t("planche.feuilles.vide-fenetre")}</p>}
              </fieldset>
            ) : (
              <p className="inspecteur-aide">{t("planche.feuilles.aucune-fenetre")}</p>
            )}
          </div>
        )}
      </div>
      <div className="planche-debit-barre" role="toolbar" aria-label={t("planche.feuilles.barre")}>
        {bouton("ajouter-fenetre")}
        {bouton("supprimer-fenetre")}
        {bouton("exporter-feuille-pdf", "est-principal", {}, true)}
        {bouton("exporter-jeu-pdf", "", { nombre: String(cochees.size) })}
        <label className="planche-feuilles-motif">
          <span>{t("planche.feuilles.motif-fichiers")}</span>
          <input value={motifNoms} onChange={(e) => onMotifNoms(e.target.value)} onKeyDown={arreter} data-planche-feuilles-motif />
        </label>
      </div>
      {erreur && <p className="inspecteur-aide" role="alert" data-planche-feuilles-erreur>{erreur}</p>}
      <p className="inspecteur-aide">{t("planche.feuilles.note")}</p>
      {note && <p className="inspecteur-aide" role="status" data-planche-feuilles-note>{note}</p>}
    </div>
  );
}
