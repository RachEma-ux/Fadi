/**
 * Onglet « Administration » de la page Extensions (images 12 à 14, validées le 26 novembre 2026), montré au seul
 * administrateur de la plateforme : les extensions fournies par Fadi se règlent (état, installée d'origine) ; celles
 * ajoutées ici se créent, s'importent, se modifient, s'exportent et se retirent. Un fichier importé est d'abord jugé
 * par le serveur sans rien écrire : rien n'est installé avant l'accord de l'administrateur. La protection reste au
 * serveur (404 pour tout autre compte).
 */
import { useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BORNES_EXTENSION, ETATS_EXTENSION, ETATS_PAQUET, imageIcone, lireBrouillonPaquet, paquetVide, validerPaquetExtension,
  type EtatExtension, type EtatPaquet, type OriginePaquet, type PaquetExtension,
} from "@parcours/sandbox-planche-model";
import { adminAddonsApi, refusPaquet, telechargerPaquet, type AddonAdmin, type PaquetAdmin } from "../../lib/addons";
import { useOnline } from "../../components/SyncIndicator";
import { LANGUE_INTERFACE, t } from "../../modules/sandbox/messages";
import { texteFiche } from "../../modules/sandbox/planche/extensions-installees";
import { EditeurExtension } from "./EditeurExtension";

export const CLE_ADMIN = ["extensions-admin"] as const;

type MotifAffiche = "forme_invalide" | "hors_bornes" | "version_non_prise_en_charge" | "identifiant_reserve" | "raccourci_refuse" | "icone_invalide" | "illisible";
const MOTIFS: readonly string[] = ["forme_invalide", "hors_bornes", "version_non_prise_en_charge", "identifiant_reserve", "raccourci_refuse", "icone_invalide"];

interface Fichier { readonly nom: string; readonly taille: string }
type Dialogue =
  | { readonly genre: "accepte"; readonly fichier: Fichier; readonly paquet: PaquetExtension; readonly remplace: boolean }
  | { readonly genre: "refuse"; readonly fichier: Fichier; readonly motif: MotifAffiche; readonly detail: string; readonly brouillon: PaquetExtension | null }
  | { readonly genre: "retirer"; readonly paquet: PaquetAdmin };
type Edition = { readonly initial: PaquetExtension; readonly creation: boolean; readonly origine: OriginePaquet; readonly etat: EtatPaquet; readonly titre: string };

const taille = (octets: number): string => (octets < 1024 ? t("extensions.fichier.taille.octets", { n: String(octets) }) : t("extensions.fichier.taille.ko", { n: String(Math.round(octets / 1024)) }));
const dateCourte = (iso: string): string => new Date(iso).toLocaleDateString(LANGUE_INTERFACE === "en" ? "en-GB" : "fr-CH", { day: "2-digit", month: "2-digit", year: "numeric" });
function contenu(p: Pick<PaquetAdmin, "commandes" | "outils" | "panneaux">): string {
  const un = (n: number, seul: "extensions.contenu.outil" | "extensions.contenu.commande" | "extensions.contenu.panneau", plusieurs: "extensions.contenu.outils" | "extensions.contenu.commandes" | "extensions.contenu.panneaux") => (n === 0 ? null : n === 1 ? t(seul) : t(plusieurs, { n: String(n) }));
  return [un(p.commandes, "extensions.contenu.commande", "extensions.contenu.commandes"), un(p.outils, "extensions.contenu.outil", "extensions.contenu.outils"), un(p.panneaux, "extensions.contenu.panneau", "extensions.contenu.panneaux")].filter(Boolean).join(" · ");
}

function Interrupteur({ actif, libelle, desactive, onChange, nom }: { actif: boolean; libelle: string; desactive: boolean; onChange: (v: boolean) => void; nom: string }) {
  return <button type="button" role="switch" aria-checked={actif} aria-label={libelle} disabled={desactive} className={`extensions-interrupteur${actif ? " actif" : ""}`} onClick={() => onChange(!actif)} data-admin-origine={nom} />;
}

/** `onglets` : les options de la page (Installées, Disponibles, Administration), placées sous le titre de l'écran montré. */
export function AdministrationExtensions({ onglets }: { onglets: ReactNode }) {
  const online = useOnline();
  const queryClient = useQueryClient();
  const choisir = useRef<HTMLInputElement>(null);
  const [dialogue, setDialogue] = useState<Dialogue | null>(null);
  const [etatImport, setEtatImport] = useState<EtatPaquet>("experimentale");
  const [edition, setEditionBrute] = useState<Edition | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [erreurEditeur, setErreurEditeur] = useState<string | null>(null);
  const setEdition = (e: Edition | null) => {
    setErreurEditeur(null);
    setEditionBrute(e);
  };
  const q = useQuery({ queryKey: CLE_ADMIN, queryFn: adminAddonsApi.lire });
  const relire = () => Promise.all([queryClient.invalidateQueries({ queryKey: CLE_ADMIN }), queryClient.invalidateQueries({ queryKey: ["extensions-compte"] }), queryClient.invalidateQueries({ queryKey: ["extensions-paquets-compte"] })]);
  const action = useMutation({
    mutationFn: (faire: () => Promise<unknown>) => faire(),
    onMutate: () => setErreur(null),
    onSuccess: () => relire(),
    onError: () => setErreur(t("extensions.admin.erreur.action")),
  });
  const enregistrer = useMutation({
    mutationFn: ({ paquet, e }: { paquet: PaquetExtension; e: Edition }) => adminAddonsApi.installer(paquet, { etat: e.etat, origine: e.origine, ...(e.creation ? { installee: false } : {}) }),
    onMutate: () => setErreurEditeur(null),
    onSuccess: async () => {
      await relire();
      setEdition(null);
    },
    onError: (err) => setErreurEditeur(t("extensions.admin.editeur.refus", { detail: refusPaquet(err)?.detail || t("extensions.admin.erreur.action") })),
  });

  /** Lit le fichier choisi et le fait juger par le serveur, sans rien installer. */
  const presenter = async (f: File) => {
    const fichier: Fichier = { nom: f.name, taille: taille(f.size) };
    setErreur(null);
    if (f.size > BORNES_EXTENSION.paquet * 1.3) return setDialogue({ genre: "refuse", fichier, motif: "hors_bornes", detail: t("extensions.admin.motif.trop_gros.detail"), brouillon: null });
    let brut: unknown;
    try {
      brut = JSON.parse(await f.text());
    } catch {
      return setDialogue({ genre: "refuse", fichier, motif: "illisible", detail: t("extensions.admin.motif.illisible.detail"), brouillon: null });
    }
    try {
      const essai = await adminAddonsApi.essayer(brut);
      const lu = validerPaquetExtension(brut);
      if (!lu.ok) return setDialogue({ genre: "refuse", fichier, motif: lu.erreur, detail: lu.detail, brouillon: lireBrouillonPaquet(brut) });
      setEtatImport("experimentale");
      setDialogue({ genre: "accepte", fichier, paquet: lu.paquet, remplace: essai.remplace });
    } catch (err) {
      const refus = refusPaquet(err);
      if (!refus) return setErreur(t("extensions.admin.erreur.action"));
      setDialogue({ genre: "refuse", fichier, motif: (MOTIFS.includes(refus.motif) ? refus.motif : "forme_invalide") as MotifAffiche, detail: refus.detail, brouillon: lireBrouillonPaquet(brut) });
    }
  };
  const ouvrirEditeur = async (p: PaquetAdmin) => {
    setErreur(null);
    try {
      const brouillon = lireBrouillonPaquet(await adminAddonsApi.paquet(p.id));
      if (brouillon) setEdition({ initial: brouillon, creation: false, origine: p.origine, etat: p.etat, titre: t("extensions.admin.editeur.titre.modifier", { nom: texteFiche(p.nom) }) });
    } catch {
      setErreur(t("extensions.admin.erreur.action"));
    }
  };
  const exporter = async (p: PaquetAdmin) => {
    setErreur(null);
    try {
      telechargerPaquet(await adminAddonsApi.paquet(p.id), p.id);
    } catch {
      setErreur(t("extensions.admin.erreur.action"));
    }
  };

  if (edition) {
    return <EditeurExtension onglets={onglets} initial={edition.initial} creation={edition.creation} titre={edition.titre} enCours={enregistrer.isPending} erreur={erreurEditeur} onAnnuler={() => setEdition(null)} onEnregistrer={(paquet) => enregistrer.mutate({ paquet, e: edition })} />;
  }

  const occupe = !online || action.isPending;
  const selectEtat = <E extends string>(nom: string, valeur: E, etats: readonly E[], id: string, sur: (e: E) => void) => (
    <select value={valeur} disabled={occupe} aria-label={t("extensions.admin.etat.de", { nom })} onChange={(e) => sur(e.target.value as E)} data-admin-etat={id}>
      {etats.map((e) => <option key={e} value={e}>{t(`extensions.admin.etat.${e as EtatExtension}`)}</option>)}
    </select>
  );
  const ligneFadi = (a: AddonAdmin) => {
    const nom = t(`extension.${a.id}` as "extension.bois");
    return (
      <tr key={a.id} data-admin-extension={a.id} data-admin-source="fadi">
        <th scope="row">{nom}</th>
        <td><span className="extensions-origine fadi">{t("extensions.admin.origine.fadi")}</span></td>
        <td>{a.version}</td>
        <td>{selectEtat(nom, a.etat, ETATS_EXTENSION, a.id, (etat) => action.mutate(() => adminAddonsApi.regler(a.id, { etat })))}</td>
        <td><Interrupteur actif={a.activeParDefaut} libelle={t("extensions.admin.origineActive.de", { nom })} desactive={occupe} nom={a.id} onChange={(activeParDefaut) => action.mutate(() => adminAddonsApi.regler(a.id, { activeParDefaut }))} /></td>
        <td className="h7-muted">{t("extensions.admin.fournie")}</td>
      </tr>
    );
  };
  const lignePaquet = (p: PaquetAdmin) => {
    const nom = texteFiche(p.nom);
    return (
      <tr key={p.id} data-admin-extension={p.id} data-admin-source={p.origine}>
        <th scope="row">
          {nom}
          <small>{t(p.origine === "creee" ? "extensions.admin.sous.creee" : "extensions.admin.sous.importee", { contenu: contenu(p), date: dateCourte(p.importedAt) })}</small>
          {!p.servie && <small className="form-error" data-admin-non-servie>{t("extensions.admin.nonServie")}</small>}
        </th>
        <td><span className={`extensions-origine ${p.origine}`}>{t(`extensions.admin.origine.${p.origine}`)}</span></td>
        <td>{p.version}</td>
        <td>{selectEtat(nom, p.etat, ETATS_PAQUET, p.id, (etat) => action.mutate(() => adminAddonsApi.reglerPaquet(p.id, { etat })))}</td>
        <td><Interrupteur actif={p.activeParDefaut} libelle={t("extensions.admin.origineActive.de", { nom })} desactive={occupe} nom={p.id} onChange={(activeParDefaut) => action.mutate(() => adminAddonsApi.reglerPaquet(p.id, { activeParDefaut }))} /></td>
        <td>
          <span className="extensions-actions-ligne">
            <button type="button" className="button-secondary" disabled={occupe} onClick={() => void ouvrirEditeur(p)} data-admin-modifier>{t("extensions.admin.modifier")}</button>
            <button type="button" className="button-secondary" disabled={!online} onClick={() => void exporter(p)} data-admin-exporter>{t("extensions.admin.exporter")}</button>
            <button type="button" className="button-secondary extensions-danger" disabled={occupe} onClick={() => setDialogue({ genre: "retirer", paquet: p })} data-admin-retirer>{t("extensions.admin.retirer")}</button>
          </span>
        </td>
      </tr>
    );
  };
  const fermer = () => setDialogue(null);
  const autreFichier = () => {
    fermer();
    choisir.current?.click();
  };

  return (
    <div data-extensions-administration translate="no">
      <h1>Extensions</h1>
      <p className="h7-muted">{t("extensions.admin.intro")}</p>
      {onglets}
      <div className="extensions-admin-tete">
        <button type="button" className="button-primary" disabled={!online} onClick={() => setEdition({ initial: paquetVide(), creation: true, origine: "creee", etat: "experimentale", titre: t("extensions.admin.editeur.titre.creer") })} data-admin-creer>{t("extensions.admin.creer")}</button>
        <button type="button" className="button-secondary" disabled={!online} onClick={() => choisir.current?.click()} data-admin-importer>{t("extensions.admin.importer")}</button>
        <input ref={choisir} type="file" accept=".json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void presenter(f); }} data-admin-fichier />
        {q.data && <span className="h7-muted extensions-admin-bilan" data-admin-bilan>{t("extensions.admin.bilan", { total: String(q.data.addons.length + q.data.paquets.length), fadi: String(q.data.addons.length), ajoutees: String(q.data.paquets.length) })}</span>}
      </div>
      {q.isPending && <p role="status">…</p>}
      {q.isError && <p role="alert" className="form-error">{t("extensions.admin.erreur.chargement")}</p>}
      {erreur && <p role="alert" className="form-error" data-admin-erreur>{erreur}</p>}
      {q.data && (
        <div className="extensions-table-cadre">
          <table className="extensions-table" data-admin-table>
            <thead>
              <tr>
                <th scope="col">{t("extensions.admin.col.extension")}</th><th scope="col">{t("extensions.admin.col.origine")}</th><th scope="col">{t("extensions.admin.col.version")}</th>
                <th scope="col">{t("extensions.admin.col.etat")}</th><th scope="col">{t("extensions.admin.col.origineActive")}</th><th scope="col">{t("extensions.admin.col.actions")}</th>
              </tr>
            </thead>
            <tbody>{q.data.addons.map(ligneFadi)}{q.data.paquets.map(lignePaquet)}</tbody>
          </table>
        </div>
      )}

      {dialogue && (
        <div className="extensions-voile">
          {dialogue.genre === "accepte" && (
            <div role="dialog" aria-modal="true" aria-labelledby="extensions-dialogue-titre" className="extensions-dialogue" data-admin-dialogue="accepte">
              <h2 id="extensions-dialogue-titre">{t("extensions.admin.import.titre", { nom: texteFiche(dialogue.paquet.fiche.nom) })}</h2>
              <p className="h7-muted">{t("extensions.admin.import.fichier", { fichier: dialogue.fichier.nom, taille: dialogue.fichier.taille })}</p>
              {dialogue.remplace && <p className="extensions-avis" data-admin-remplace>{t("extensions.admin.import.remplace", { version: dialogue.paquet.fiche.version })}</p>}
              <dl className="extensions-fiche">
                <dt>{t("extensions.admin.import.identifiant")}</dt><dd><strong>{dialogue.paquet.fiche.id}</strong></dd>
                <dt>{t("extensions.admin.import.version")}</dt><dd>{t("extensions.admin.import.versionProtocole", { version: dialogue.paquet.fiche.version, protocole: dialogue.paquet.fiche.protocole })}</dd>
                <dt>{t("extensions.admin.import.auteur")}</dt><dd>{t("extensions.admin.import.auteurDeclare", { auteur: dialogue.paquet.fiche.auteur })}</dd>
                <dt>{t("extensions.admin.import.description")}</dt><dd>{texteFiche(dialogue.paquet.fiche.description)}</dd>
              </dl>
              <h3>{t("extensions.admin.import.demande")}</h3>
              <p className="extensions-pastilles" data-admin-permissions>
                {dialogue.paquet.fiche.permissions.length === 0 ? <span>{t("extensions.admin.import.aucune")}</span> : dialogue.paquet.fiche.permissions.map((perm) => <span key={perm}>{t(`extensions.admin.permission.${perm}`)}</span>)}
              </p>
              {([["commandes", dialogue.paquet.fiche.commandes], ["outils", dialogue.paquet.fiche.outils]] as const).map(([sorte, entrees]) => entrees.length > 0 && (
                <div key={sorte}>
                  <h3>{t(`extensions.admin.import.${sorte}`, { n: String(entrees.length) })}</h3>
                  <ul className="extensions-commandes" data-admin-entrees={sorte}>
                    {entrees.map((c) => {
                      const image = imageIcone(dialogue.paquet, c.icone);
                      return <li key={c.id}><span className="extensions-commande-icone" aria-hidden="true">{image && <img src={image} alt="" width={22} height={22} />}</span><span className="extensions-commande-texte"><strong>{texteFiche(c.libelle)}</strong></span><kbd>{c.raccourci}</kbd></li>;
                    })}
                  </ul>
                </div>
              ))}
              {dialogue.paquet.fiche.panneaux.length > 0 && (
                <div>
                  <h3>{t("extensions.admin.import.panneaux", { n: String(dialogue.paquet.fiche.panneaux.length) })}</h3>
                  <ul className="extensions-commandes" data-admin-entrees="panneaux">
                    {dialogue.paquet.fiche.panneaux.map((x) => {
                      const image = imageIcone(dialogue.paquet, x.icone);
                      return <li key={x.id}><span className="extensions-commande-icone" aria-hidden="true">{image && <img src={image} alt="" width={22} height={22} />}</span><span className="extensions-commande-texte"><strong>{texteFiche(x.titre)}</strong></span></li>;
                    })}
                  </ul>
                </div>
              )}
              <p className="extensions-conforme" data-admin-conforme>✓ {t("extensions.admin.import.conforme")}</p>
              <div className="extensions-dialogue-pied">
                <label className="extensions-champ"><span>{t("extensions.admin.import.etat")}</span>
                  <select value={etatImport} onChange={(e) => setEtatImport(e.target.value as EtatPaquet)} data-admin-etat-import>{ETATS_PAQUET.map((e) => <option key={e} value={e}>{t(`extensions.admin.etat.${e}`)}</option>)}</select>
                </label>
                <span className="extensions-actions">
                  <button type="button" className="button-secondary" onClick={fermer} data-admin-annuler>{t("extensions.admin.annuler")}</button>
                  <button type="button" className="button-primary" disabled={occupe} onClick={() => { const d = dialogue; fermer(); action.mutate(() => adminAddonsApi.installer(d.paquet, { etat: etatImport, origine: "importee", ...(d.remplace ? {} : { installee: false }) })); }} data-admin-installer>{t("extensions.admin.import.installer")}</button>
                </span>
              </div>
            </div>
          )}
          {dialogue.genre === "refuse" && (
            <div role="alertdialog" aria-modal="true" aria-labelledby="extensions-dialogue-titre" className="extensions-dialogue" data-admin-dialogue="refuse">
              <h2 id="extensions-dialogue-titre">{t("extensions.admin.refus.titre")}</h2>
              <p className="h7-muted">{t("extensions.admin.refus.fichier", { fichier: dialogue.fichier.nom, taille: dialogue.fichier.taille })}</p>
              <div className="extensions-refus" data-admin-motif={dialogue.motif}>
                <strong>{t(`extensions.admin.motif.${dialogue.motif}`)}</strong>
                <p>{dialogue.detail}</p>
              </div>
              <p>{t(dialogue.brouillon ? "extensions.admin.refus.rien" : "extensions.admin.refus.rienIllisible")}</p>
              <div className="extensions-actions">
                <button type="button" className="button-secondary" onClick={fermer} data-admin-fermer>{t("extensions.admin.fermer")}</button>
                <button type="button" className="button-secondary" onClick={autreFichier} data-admin-autre>{t("extensions.admin.refus.autre")}</button>
                {dialogue.brouillon && <button type="button" className="button-primary" onClick={() => { const b = dialogue.brouillon!; fermer(); setEdition({ initial: b, creation: true, origine: "importee", etat: "experimentale", titre: t("extensions.admin.editeur.titre.modifier", { nom: texteFiche(b.fiche.nom) || b.fiche.id }) }); }} data-admin-editeur>{t("extensions.admin.refus.editeur")}</button>}
              </div>
            </div>
          )}
          {dialogue.genre === "retirer" && (
            <div role="alertdialog" aria-modal="true" aria-labelledby="extensions-dialogue-titre" className="extensions-dialogue" data-admin-dialogue="retirer">
              <h2 id="extensions-dialogue-titre">{t("extensions.admin.retirer.titre", { nom: texteFiche(dialogue.paquet.nom) })}</h2>
              <p>{t("extensions.admin.retirer.texte")}</p>
              <div className="extensions-actions">
                <button type="button" className="button-secondary" onClick={fermer} data-admin-annuler>{t("extensions.admin.annuler")}</button>
                <button type="button" className="button-primary extensions-danger-plein" onClick={() => { const id = dialogue.paquet.id; fermer(); action.mutate(() => adminAddonsApi.retirer(id)); }} data-admin-confirmer>{t("extensions.admin.retirer")}</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
