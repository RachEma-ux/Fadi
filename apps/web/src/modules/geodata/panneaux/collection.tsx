/**
 * Collection (D-GD-36) : ensemble nommé et ordonné de cartes enregistrées (un atlas). La collection ne contient que des
 * RÉFÉRENCES vers des cartes de « Mes cartes » : modifier une carte la modifie dans toutes ses collections ; une carte
 * peut être dans plusieurs collections ; supprimer une collection ne supprime aucune carte. État de la collection ouverte
 * (`useCollection`, partagé par le menu ☰ et le panneau) et panneau Collection : Nouveau, Ouvrir, liste ordonnée
 * (ouvrir une carte, Monter, Descendre, Retirer, Ajouter la carte affichée), Enregistrer, Enregistrer sous, Supprimer.
 * Les opérations sur la liste sont celles, pures, du modèle (`ajouterCarte`, `retirerCarte`, `deplacerCarte`).
 */
import { useEffect, useRef, useState } from "react";
import { ajouterCarte, deplacerCarte, retirerCarte, titreCollectionValide, type CarteDeCollection } from "@parcours/geodata-model";
import { api, ErreurGeoData, type CarteRecue, type CollectionDetail, type CollectionRecue } from "../client";

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Collection ouverte : dernier état enregistré et brouillon en cours d'édition. */
export interface CollectionOuverte { id: string; nom: string; description: string; revision: number; cartes: CarteDeCollection[]; modifiee: boolean; conflit: boolean }
export type ModeCollection = "nouveau" | "ouvrir" | "ouverte" | "enregistrer-sous";

const depuis = (d: CollectionDetail): CollectionOuverte => ({ id: d.id, nom: d.nom, description: d.description, revision: d.revision, cartes: d.cartes, modifiee: false, conflit: false });

/** État de la collection ouverte et ses actions (une seule source pour le menu ☰ et le panneau). */
export function useCollection() {
  const [ouverte, setOuverte] = useState<CollectionOuverte | null>(null);
  const ids = (c: CollectionOuverte) => c.cartes.map((x) => x.id);
  return {
    ouverte,
    creer: async (nom: string, description: string) => setOuverte(depuis(await api.creerCollection({ nom: nom.trim(), description }))),
    ouvrir: async (id: string) => setOuverte(depuis(await api.collection(id))),
    modifier: (f: (c: CollectionOuverte) => Partial<CollectionOuverte>) => setOuverte((c) => (c ? { ...c, ...f(c), modifiee: true } : c)),
    // Révision attendue : une collection changée ailleurs entre-temps est refusée (409), marquée en conflit, jamais écrasée.
    enregistrer: async () => {
      if (!ouverte) return;
      try { setOuverte(depuis(await api.enregistrerCollection(ouverte.id, { revisionAttendue: ouverte.revision, nom: ouverte.nom.trim(), description: ouverte.description, cartes: ids(ouverte) }))); }
      catch (e) { if (e instanceof ErreurGeoData && e.code === "revision_conflict") setOuverte((c) => (c ? { ...c, conflit: true } : c)); throw e; }
    },
    /** Après un ajout fait ailleurs (Mes cartes › Ajouter à la collection) : relue si elle est ouverte et sans modification locale. */
    rafraichir: async (id: string) => { if (ouverte?.id === id && !ouverte.modifiee) setOuverte(depuis(await api.collection(id))); },
    enregistrerSous: async (nom: string) => { if (ouverte) setOuverte(depuis(await api.creerCollection({ nom: nom.trim(), description: ouverte.description, cartes: ids(ouverte) }))); },
    supprimer: async () => { if (ouverte) { await api.supprimerCollection(ouverte.id); setOuverte(null); } },
    fermer: () => setOuverte(null),
  };
}
export type EtatCollection = ReturnType<typeof useCollection>;

export function PanneauCollection(p: { etat: EtatCollection; mode: ModeCollection; onMode(m: ModeCollection): void; carte: CarteRecue | null; onOuvrirCarte(id: string): void; onAnnonce(m: string): void }) {
  const { etat } = p;
  const c = etat.ouverte;
  const [erreur, setErreur] = useState<string | null>(null);
  const [titre, setTitre] = useState("");
  const [description, setDescription] = useState("");
  const [liste, setListe] = useState<CollectionRecue[] | null>(null);
  const [confirmer, setConfirmer] = useState(false);
  const champTitre = useRef<HTMLInputElement>(null);
  const agir = async (f: () => Promise<unknown>, annonce?: string) => { try { setErreur(null); await f(); if (annonce) p.onAnnonce(annonce); } catch (e) { setErreur(message(e)); } };

  useEffect(() => {
    setErreur(null); setConfirmer(false);
    if (p.mode === "nouveau") { setTitre(""); setDescription(""); }
    if (p.mode === "enregistrer-sous" && c) setTitre(`${c.nom.slice(0, 110)} (copie)`);
    if (p.mode === "ouvrir") { setListe(null); api.collections().then((r) => setListe(r.collections.filter((x) => x.etat === "active"))).catch((e) => setErreur(message(e))); }
    if (p.mode === "nouveau" || p.mode === "enregistrer-sous") champTitre.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.mode]);

  const dejaDedans = !!(p.carte && c?.cartes.some((x) => x.id === p.carte!.id));
  return (
    <div data-gd-collection-panneau={p.mode}>
      {erreur && <p role="alert" className="gd-alerte">{erreur}</p>}
      {p.mode === "nouveau" && (
        <form className="gd-formulaire" onSubmit={(e) => { e.preventDefault(); if (titreCollectionValide(titre)) void agir(async () => { await etat.creer(titre, description); p.onMode("ouverte"); }, `Collection « ${titre.trim()} » créée.`); }} data-gd-collection-nouvelle>
          <h3>Nouvelle collection</h3>
          <p className="gd-discret">Un ensemble ordonné de cartes enregistrées, pour regrouper les cartes d'une même étude ou d'un même territoire.</p>
          <label className="gd-champ">Titre<input ref={champTitre} value={titre} onChange={(e) => setTitre(e.target.value)} maxLength={120} required data-gd-collection-titre-saisie /></label>
          <label className="gd-champ">Description (facultative)<textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} rows={3} /></label>
          <button type="submit" data-gd-collection-creer>Créer la collection</button>
        </form>
      )}
      {p.mode === "ouvrir" && (
        <section className="gd-formulaire" data-gd-collection-liste>
          <h3>Ouvrir une collection</h3>
          {!liste && !erreur && <p role="status">Chargement des collections…</p>}
          {liste?.length === 0 && <p className="gd-etat">Aucune collection pour l'instant : créez-en une par « Nouveau ».</p>}
          <ul className="gd-liste">
            {liste?.map((k) => (
              <li key={k.id} className="gd-carte-couche">
                <strong translate="no">{k.nom}</strong>
                <p className="gd-discret">{`${k.cartes} carte(s)`}{k.description ? <> · <span translate="no">{k.description}</span></> : null}</p>
                <button type="button" onClick={() => void agir(async () => { await etat.ouvrir(k.id); p.onMode("ouverte"); }, `Collection « ${k.nom} » ouverte.`)} data-gd-collection-ouvrir={k.id}>Ouvrir</button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {p.mode === "enregistrer-sous" && c && (
        <form className="gd-formulaire" onSubmit={(e) => { e.preventDefault(); if (titreCollectionValide(titre)) void agir(async () => { await etat.enregistrerSous(titre); p.onMode("ouverte"); }, `Collection enregistrée sous « ${titre.trim()} ».`); }} data-gd-collection-enregistrer-sous>
          <h3>Enregistrer la collection sous</h3>
          <p className="gd-discret">Une copie est créée sous ce titre, avec les mêmes cartes dans le même ordre (références, pas de copie des cartes).</p>
          <label className="gd-champ">Nouveau titre<input ref={champTitre} value={titre} onChange={(e) => setTitre(e.target.value)} maxLength={120} required data-gd-collection-titre-saisie /></label>
          <div className="gd-actions">
            <button type="submit" data-gd-collection-valider-sous>Enregistrer la copie</button>
            <button type="button" onClick={() => p.onMode("ouverte")}>Annuler</button>
          </div>
        </form>
      )}
      {(p.mode === "ouverte" || (p.mode === "enregistrer-sous" && !c)) && !c && (
        <section className="gd-formulaire">
          <p className="gd-etat">Aucune collection ouverte.</p>
          <div className="gd-actions">
            <button type="button" onClick={() => p.onMode("nouveau")}>Nouvelle collection</button>
            <button type="button" onClick={() => p.onMode("ouvrir")}>Ouvrir une collection</button>
          </div>
        </section>
      )}
      {p.mode === "ouverte" && c && (
        <section className="gd-formulaire" data-gd-collection-ouverte={c.id}>
          <label className="gd-champ">Titre<input value={c.nom} onChange={(e) => etat.modifier(() => ({ nom: e.target.value }))} maxLength={120} required translate="no" data-gd-collection-titre /></label>
          <label className="gd-champ">Description<textarea value={c.description} onChange={(e) => etat.modifier(() => ({ description: e.target.value }))} maxLength={2000} rows={2} translate="no" data-gd-collection-description /></label>
          <p role="status" className={c.modifiee ? "gd-alerte" : "gd-discret"} data-gd-collection-etat={c.modifiee ? "modifiee" : "enregistree"}>{c.modifiee ? "Collection modifiée, non enregistrée" : "Collection enregistrée"}</p>
          {c.conflit && (
            <div role="alert" className="gd-bandeau gd-alerte" data-gd-collection-conflit>
              <p>La collection a été modifiée ailleurs depuis son ouverture : rechargez-la (vos changements non enregistrés seront perdus) ou enregistrez-la sous un autre titre.</p>
              <button type="button" onClick={() => void agir(() => etat.ouvrir(c.id), "Collection rechargée.")} data-gd-collection-recharger>Recharger la collection</button>
            </div>
          )}
          <h3>{`Cartes (${c.cartes.length})`}</h3>
          {c.cartes.length === 0 && <p className="gd-etat">Aucune carte : ouvrez une carte enregistrée, puis « Ajouter la carte affichée ».</p>}
          <ol className="gd-liste gd-collection-cartes">
            {c.cartes.map((k, i) => (
              <li key={k.id} className="gd-carte-couche" data-gd-collection-carte={k.id}>
                <button type="button" className="gd-lien-carte" onClick={() => p.onOuvrirCarte(k.id)} aria-current={p.carte?.id === k.id ? "true" : undefined} data-gd-collection-ouvrir-carte={k.id}>
                  <strong translate="no">{k.nom}</strong>{k.etat === "archivee" ? " (archivée)" : ""}
                </button>
                <div className="gd-actions">
                  <button type="button" onClick={() => etat.modifier((x) => ({ cartes: deplacerCarte(x.cartes, k.id, -1) }))} disabled={i === 0} aria-label={`Monter ${k.nom}`} data-gd-collection-monter={k.id}>Monter</button>
                  <button type="button" onClick={() => etat.modifier((x) => ({ cartes: deplacerCarte(x.cartes, k.id, 1) }))} disabled={i === c.cartes.length - 1} aria-label={`Descendre ${k.nom}`} data-gd-collection-descendre={k.id}>Descendre</button>
                  <button type="button" onClick={() => etat.modifier((x) => ({ cartes: retirerCarte(x.cartes, k.id) }))} aria-label={`Retirer ${k.nom} de la collection`} data-gd-collection-retirer={k.id}>Retirer</button>
                </div>
              </li>
            ))}
          </ol>
          <button type="button" disabled={!p.carte || dejaDedans} onClick={() => p.carte && etat.modifier((x) => ({ cartes: ajouterCarte(x.cartes, { id: p.carte!.id, nom: p.carte!.nom, etat: p.carte!.etat }) }))} data-gd-collection-ajouter>Ajouter la carte affichée</button>
          {!p.carte && <p className="gd-discret">Enregistrez d'abord la carte affichée (Mes cartes) pour pouvoir l'ajouter.</p>}
          {dejaDedans && <p className="gd-discret">La carte affichée est déjà dans cette collection.</p>}
          <div className="gd-actions">
            <button type="button" disabled={!titreCollectionValide(c.nom)} onClick={() => void agir(etat.enregistrer, "Collection enregistrée.")} data-gd-collection-enregistrer>Enregistrer</button>
            <button type="button" onClick={() => p.onMode("enregistrer-sous")} data-gd-collection-sous>Enregistrer sous</button>
          </div>
          {!confirmer ? <button type="button" onClick={() => setConfirmer(true)} data-gd-collection-supprimer>Supprimer la collection</button> : (
            <div className="gd-actions" role="group" aria-label="Confirmer la suppression">
              <p className="gd-discret">La collection est supprimée ; ses cartes restent dans Mes cartes.</p>
              <button type="button" onClick={() => void agir(async () => { await etat.supprimer(); p.onMode("ouvrir"); }, "Collection supprimée ; ses cartes restent dans Mes cartes.")} data-gd-collection-confirmer-suppression>Confirmer la suppression</button>
              <button type="button" onClick={() => setConfirmer(false)}>Annuler</button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
