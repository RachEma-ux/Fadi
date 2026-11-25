/**
 * Bouton « Outils ▾ » de la Planche (D-198, puis proposition A du 25 novembre 2026) : une entrée de plus vers les outils,
 * à côté du rail de gauche et de la grille « … ». Un clic ouvre la liste sous le bouton ; Échap, un clic ailleurs ou le
 * choix d'un outil la referment.
 *
 * Liste (rôle `menu`) à DEUX niveaux : champ « Rechercher un outil… » (Entrée active le premier outil retenu), puis un
 * groupe par famille du catalogue (flèche + nom) et une ligne par outil — cliquer la ligne ACTIVE l'outil et ferme la
 * liste ; l'étiquette en bout de ligne nomme la barre où l'outil est rangé et l'affiche ou la masque. Les commandes
 * suivent, en trois groupes : « Groupe », « Repères » et « Bois » (Zoom avant / arrière sont rangés avec « Caméra »).
 *
 * En pied, « ⚙ Barres d'outils » : chaque barre nommée (`barres-nommees.ts`) y figure UNE fois, avec son aperçu et son
 * interrupteur ; « Mes barres » liste les barres personnelles (regroupements du compte), « Nouvelle barre… » en crée une,
 * « Dupliquer » copie une barre livrée, « Modifier » ouvre le panneau « Personnaliser ». Clavier : flèches haut / bas
 * (Début, Fin) d'un élément à l'autre, flèche droite / gauche pour déplier / replier un groupe, Entrée, Échap.
 */
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { OUTILS, outilParId, type Outil, type Pictogramme as DescriptionPictogramme } from "@parcours/sandbox-planche-model";
import { FAMILLE_DES_COMMANDES_CAMERA, GROUPES_COMMANDES, type GroupeCommande } from "./barres-nommees";
import { groupesOutils, libelleOperation, premierOutil } from "./barres-outils";
import { t } from "../messages";
import { afficherRaccourci, nomOutil, pictoOutil, raccourciOutil } from "./outils-planche";
import { IconeSandbox, Pictogramme } from "../pictogrammes/Pictogramme";

/** Aperçu d'une entrée dans la ligne d'une barre (icône seule ; le nom sert d'infobulle). */
export interface ApercuBarre {
  readonly cle: string;
  readonly picto: DescriptionPictogramme;
  readonly nom: string;
}

/** Ligne de la section « Barres d'outils » : une barre nommée, livrée ou personnelle. */
export interface LigneBarre {
  readonly id: string;
  readonly nom: string;
  readonly origine: "livree" | "personnelle";
  /** Barre personnelle : identifiant de son regroupement (« Modifier »). */
  readonly groupe?: string;
  readonly affichee: boolean;
  readonly apercu: readonly ApercuBarre[];
}

export interface PropsBoutonOutils {
  /** Outil actif (surligné dans la liste). */
  outilId: string;
  /** Motif d'indisponibilité d'un outil (`null` = disponible), comme le rail de gauche. */
  raison: (o: Outil) => string | null;
  /** Active un outil exactement comme la barre de gauche. */
  onChoisir: (id: string) => void;
  /** Barres nommées, dans l'ordre affiché : les livrées, puis les personnelles. */
  barres: readonly LigneBarre[];
  /** Étiquette d'un outil : la barre livrée où il est rangé (identifiant et nom), ou `null`. */
  etiquette: (outilId: string) => { id: string; nom: string } | null;
  onAfficherBarre: (id: string, afficher: boolean) => void;
  onReinitialiser: () => void;
  /** Une barre au moins a été déplacée : « Réinitialiser la disposition » a quelque chose à faire. */
  reinitialisable: boolean;
  /** « Nouvelle barre… » : ouvre le panneau « Personnaliser » ; absent (lecture seule), le bouton n'est pas offert. */
  onNouvelleBarre?: () => void;
  /** « Dupliquer » une barre livrée en barre personnelle ; absent ou limite atteinte, le bouton n'est pas offert. */
  onDupliquerBarre?: (id: string) => void;
  /** « Modifier » une barre personnelle (identifiant de son regroupement). */
  onModifierBarre?: (groupe: string) => void;
  /** Extensions livrées, pour le groupe « Extensions » placé après « Bois » ; absent ou vide, le groupe n'est pas offert. */
  extensions?: readonly ExtensionListe[];
  onBasculerExtension?: (id: string, active: boolean) => void;
  /**
   * Commandes de la Planche (règle d'or) : chacune garde son icône, son nom et son raccourci ; grisée, elle dit pourquoi.
   * `groupe` la range dans « Groupe », « Repères », « Bois » ou avec la famille « Caméra ».
   */
  commandes?: readonly CommandeListe[];
  /**
   * « outils » : bouton « Outils ▾ » de la barre du haut ; « loupe » : la même liste, ouverte par la loupe de la barre
   * verticale. Chaque instance a son propre état : aucun lien entre les deux.
   */
  variante?: "outils" | "loupe";
  /**
   * Outils offerts (25 novembre 2026) : le catalogue moins les outils des extensions désactivées ; par défaut, tout le
   * catalogue. La recherche et les familles ne montrent que ceux-là.
   */
  catalogue?: readonly Outil[];
}

export interface CommandeListe {
  readonly id: string;
  readonly picto: DescriptionPictogramme;
  readonly nom: string;
  readonly raccourci: string;
  /** Motif d'indisponibilité (`null` = disponible). */
  readonly motif: string | null;
  readonly executer: () => void;
  /** Groupe de la liste (`groupeDeCommande`) ; absent : « Groupe ». */
  readonly groupe?: GroupeCommande;
  /** Extension qui apporte la commande (groupe « Extensions ») : la ligne se range sous elle. */
  readonly extension?: string;
}

/** Ligne d'une extension dans le groupe « Extensions » : pictogramme, nom et interrupteur (même effet que la fenêtre « Extensions »). */
export interface ExtensionListe {
  readonly id: string;
  readonly nom: string;
  readonly picto: DescriptionPictogramme;
  readonly active: boolean;
}

/** Bouton d'une opération : pictogramme propre à l'outil, « Nom — raccourci » en infobulle et en nom accessible. */
export function titreOperation(o: Outil, raison: string | null): string {
  return `${libelleOperation(o)}${raison ? ` — ${raison}` : ""}`;
}

/**
 * Placement de la liste « Outils » (pur, testé) : au téléphone, surcouche fixe 4 px sous le bouton ; partout, hauteur
 * maximale bornée au bas de la Planche et de la fenêtre (8 px de marge), jamais moins de 88 px.
 */
export function placementListeOutils(basBouton: number, basZone: number | null, hauteurFenetre: number, telephone: boolean): { haut: number | null; hauteurMax: number } {
  const bas = Math.min(hauteurFenetre, basZone ?? hauteurFenetre);
  return { haut: telephone ? Math.round(basBouton + 4) : null, hauteurMax: Math.max(88, Math.floor(bas - basBouton - 12)) };
}

export function BoutonOutils({ outilId, raison, onChoisir, barres, etiquette, onAfficherBarre, onReinitialiser, reinitialisable, onNouvelleBarre, onDupliquerBarre, onModifierBarre, extensions = [], onBasculerExtension, commandes = [], variante = "outils", catalogue = OUTILS }: PropsBoutonOutils) {
  const [ouvert, setOuvert] = useState(false);
  const [requete, setRequete] = useState("");
  // Groupes dépliés : familles d'outils et groupes de commandes (« groupe », « reperes », « bois »).
  const [familles, setFamilles] = useState<ReadonlySet<string>>(() => new Set());
  // Téléphone : la liste sort en surcouche fixe, posée juste sous le bouton (la barre du haut défile, D-192).
  const [hautTelephone, setHautTelephone] = useState<number | null>(null);
  const [hauteurListe, setHauteurListe] = useState<number | null>(null);
  const racine = useRef<HTMLDivElement | null>(null);
  const bouton = useRef<HTMLButtonElement | null>(null);
  const champ = useRef<HTMLInputElement | null>(null);
  const idListe = useId();
  const groupes = useMemo(() => groupesOutils(requete, catalogue), [requete, catalogue]);
  const filtre = requete.trim() !== "";
  const motsRequete = requete.trim().toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").split(/\s+/).filter(Boolean);
  const commandesRetenues = commandes.filter((c) => {
    const texte = `${c.nom} ${c.raccourci} ${c.id}`.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
    return motsRequete.every((m) => texte.includes(m));
  });

  const fermer = (rendreFocus = true) => {
    setOuvert(false);
    setRequete("");
    if (rendreFocus) bouton.current?.focus();
  };

  useEffect(() => {
    if (!ouvert) return;
    // Fenêtre où vit la Planche (page ou fenêtre détachée).
    const w = racine.current?.ownerDocument.defaultView ?? window;
    const surClic = (e: PointerEvent) => {
      const c = e.target as Node | null;
      if (racine.current && c && !racine.current.contains(c)) fermer(false);
    };
    const surTouche = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Échap ne ferme que la liste : la Planche (fin de tracé, outil précédent) ne la reçoit pas.
      e.stopImmediatePropagation();
      e.preventDefault();
      fermer();
    };
    w.addEventListener("pointerdown", surClic, true);
    w.addEventListener("keydown", surTouche, true);
    return () => {
      w.removeEventListener("pointerdown", surClic, true);
      w.removeEventListener("keydown", surTouche, true);
    };
  }, [ouvert]);

  // Position et hauteur de la liste, toujours mesurées ensemble à partir du bouton et de la zone réelle de la Planche
  // (pas d'une fenêtre plein écran supposée) : les dernières commandes restent atteignables par défilement local.
  const positionner = () => {
    const w = racine.current?.ownerDocument.defaultView ?? window;
    const b = bouton.current?.getBoundingClientRect();
    if (!b) return;
    const zone = racine.current?.closest(".planche")?.getBoundingClientRect();
    const p = placementListeOutils(variante === "loupe" ? b.top : b.bottom, zone?.bottom ?? null, w.innerHeight, w.matchMedia("(max-width: 760px)").matches);
    setHautTelephone(p.haut);
    setHauteurListe(p.hauteurMax);
  };

  // Avant la peinture (useLayoutEffect) puis à chaque défilement, y compris celui d'un conteneur interne : depuis la mise
  // en page pleine largeur (#142), la page du projet défile dans un conteneur, dont le `scroll` ne remonte pas à la
  // fenêtre — d'où l'écoute en capture sur le document.
  useLayoutEffect(() => {
    if (!ouvert) return;
    const w = racine.current?.ownerDocument.defaultView ?? window;
    const d = w.document;
    positionner();
    w.addEventListener("resize", positionner);
    w.visualViewport?.addEventListener("resize", positionner);
    d.addEventListener("scroll", positionner, { capture: true, passive: true });
    return () => {
      w.removeEventListener("resize", positionner);
      w.visualViewport?.removeEventListener("resize", positionner);
      d.removeEventListener("scroll", positionner, { capture: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ouvert]);

  const focusAuRendu = useRef(false);
  const ouvrir = (clavier: boolean) => {
    // Famille de l'outil actif dépliée à l'ouverture (les autres repliées, chacune avec sa flèche).
    const f = outilParId(outilId)?.famille;
    setFamilles((s) => (f && !s.has(f) ? new Set([...s, f]) : s));
    // Haut et hauteur maximale fixés dans le même rendu que l'ouverture : la liste n'est jamais peinte avec la hauteur
    // de repli de la feuille de style (100vh − 7rem au téléphone), qui ignore où se trouve le bouton.
    positionner();
    setOuvert(true);
    focusAuRendu.current = clavier;
  };
  // Le champ n'existe qu'une fois la liste rendue : le focus se pose après ce rendu, jamais avant.
  useEffect(() => {
    if (ouvert && focusAuRendu.current) champ.current?.focus();
    focusAuRendu.current = false;
  }, [ouvert]);

  const choisir = (id: string) => {
    onChoisir(id);
    fermer();
  };

  const basculerFamille = (f: string) =>
    setFamilles((s) => {
      const n = new Set(s);
      if (n.has(f)) n.delete(f);
      else n.add(f);
      return n;
    });
  /** Éléments parcourus au clavier, dans l'ordre affiché : le champ, puis chaque élément du menu. */
  const navigables = () => Array.from(racine.current?.querySelectorAll<HTMLElement>("[data-outils-nav]") ?? []).filter((e) => !(e as HTMLButtonElement).disabled);
  const surClavier = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // Rien de ce qu'on tape dans la liste ne doit atteindre le clavier de la Planche (raccourcis, touches d'état).
    e.stopPropagation();
    const items = navigables();
    const cible = e.target as HTMLElement;
    const i = items.indexOf(cible);
    const vers = (j: number) => {
      e.preventDefault();
      items[(j + items.length) % items.length]?.focus();
    };
    if (e.key === "ArrowDown") vers(i + 1);
    else if (e.key === "ArrowUp") vers(i - 1);
    else if (e.key === "Home" && cible !== champ.current) vers(0);
    else if (e.key === "End" && cible !== champ.current) vers(items.length - 1);
    else if (e.key === "ArrowRight" && cible.getAttribute("aria-expanded") === "false") {
      e.preventDefault();
      cible.click();
    } else if (e.key === "ArrowLeft" && cible.getAttribute("aria-expanded") === "true") {
      e.preventDefault();
      cible.click();
    }
  };

  /** Ligne d'une commande : icône, nom, raccourci ; grisée, son titre dit pourquoi. */
  const ligneCommande = (c: CommandeListe) => (
    <div key={c.id} className="planche-outils-ligne" role="none" data-outils-ligne={c.id}>
      <div className="planche-outils-tete" role="none">
        <button
          type="button"
          role="menuitem"
          className={`planche-outils-nom${c.motif ? " est-indisponible" : ""}`}
          aria-disabled={c.motif ? true : undefined}
          title={c.motif ? `${c.nom} — ${c.motif}` : `${c.nom} (${afficherRaccourci(c.raccourci)})`}
          data-outils-nav
          data-outils-commande={c.id}
          onClick={() => {
            if (c.motif) return;
            fermer(false);
            c.executer();
          }}
        >
          <Pictogramme picto={c.picto} className="planche-outils-picto" />
          <span className="planche-outils-libelle">{c.nom}</span>
          <span aria-hidden="true"> · </span>
          <kbd>{afficherRaccourci(c.raccourci)}</kbd>
        </button>
      </div>
    </div>
  );
  const commandesDe = (g: GroupeCommande) => commandesRetenues.filter((c) => (c.groupe ?? "groupe") === g);
  const commandesCamera = commandesDe("camera");
  // Une famille sans outil retenu garde son groupe si une de ses commandes l'est (Zoom avant / arrière sous « Caméra »).
  const groupesAffiches = commandesCamera.length > 0 && !groupes.some((g) => g.famille === FAMILLE_DES_COMMANDES_CAMERA) ? [...groupes, { famille: FAMILLE_DES_COMMANDES_CAMERA, libelle: t("outils.famille.camera"), outils: [] as Outil[] }] : groupes;
  const livrees = barres.filter((b) => b.origine === "livree");
  const personnelles = barres.filter((b) => b.origine === "personnelle");
  const APERCU_MAX = 6;
  /** Ligne d'une barre nommée : interrupteur (toute la ligne), nom, aperçu des icônes, puis Dupliquer ou Modifier. */
  const ligneBarre = (b: LigneBarre) => (
    <div key={b.id} className="planche-outils-barre" role="none" data-outils-barre-ligne={b.id}>
      <button
        type="button"
        role="menuitemcheckbox"
        className="planche-outils-barre-bascule"
        aria-checked={b.affichee}
        aria-label={t("outils.afficher.aide", { outil: b.nom })}
        title={t("outils.afficher.aide", { outil: b.nom })}
        data-outils-nav
        data-outils-afficher={b.id}
        onClick={() => onAfficherBarre(b.id, !b.affichee)}
      >
        <span className="planche-outils-barre-nom">{b.nom}</span>
        <span className="planche-outils-barre-apercu" aria-hidden="true">
          {b.apercu.slice(0, APERCU_MAX).map((a) => (
            <span key={a.cle} title={a.nom}>
              <Pictogramme picto={a.picto} />
            </span>
          ))}
          {b.apercu.length > APERCU_MAX && <span className="planche-outils-barre-reste">+{b.apercu.length - APERCU_MAX}</span>}
          {b.apercu.length === 0 && <span className="planche-outils-barre-reste">{t("outils.barre.vide")}</span>}
        </span>
        <span className="planche-outils-interrupteur" aria-hidden="true" data-actif={b.affichee ? "" : undefined} />
      </button>
      {b.origine === "livree" && onDupliquerBarre && (
        <button type="button" role="menuitem" className="planche-outils-barre-action" aria-label={t("outils.barre.dupliquer", { outil: b.nom })} title={t("outils.barre.dupliquer", { outil: b.nom })} data-outils-nav data-outils-dupliquer={b.id} onClick={() => { fermer(false); onDupliquerBarre(b.id); }}>
          <IconeSandbox nom="menuEnregistrerSous" />
        </button>
      )}
      {b.origine === "personnelle" && b.groupe && onModifierBarre && (
        <button type="button" role="menuitem" className="planche-outils-barre-action" aria-label={t("outils.barre.modifier", { outil: b.nom })} title={t("outils.barre.modifier", { outil: b.nom })} data-outils-nav data-outils-modifier={b.groupe} onClick={() => { const g = b.groupe!; fermer(false); onModifierBarre(g); }}>
          <IconeSandbox nom="menuRenommer" />
        </button>
      )}
    </div>
  );

  return (
    <div className={`planche-outils-menu${variante === "loupe" ? " planche-outils-menu-loupe" : ""}`} ref={racine} onKeyDown={ouvert ? surClavier : undefined} data-planche-outils-menu>
      {variante === "loupe" ? (
        <button
          type="button"
          ref={bouton}
          className="outil planche-loupe-bouton"
          aria-haspopup="menu"
          aria-expanded={ouvert}
          aria-controls={ouvert ? idListe : undefined}
          title={t("planche.recherche.titre")}
          aria-label={t("planche.recherche.titre")}
          data-planche-recherche
          data-planche-loupe-bouton
          onClick={() => (ouvert ? fermer() : ouvrir(true))}
        >
          <IconeSandbox nom="rechercher" className="outil-picto" />
          <span className="outil-libelle" aria-hidden="true">{t("planche.rechercher")}</span>
        </button>
      ) : (
        <button
          type="button"
          ref={bouton}
          className="planche-outils-bouton"
          aria-haspopup="menu"
          aria-expanded={ouvert}
          aria-controls={ouvert ? idListe : undefined}
          title={t("outils.bouton.aide")}
          data-planche-outils-bouton
          onClick={(e) => (ouvert ? fermer() : ouvrir(e.detail === 0))}
        >
          {t("outils.bouton")}
          <IconeSandbox nom="menu" className="planche-outils-chevron" />
        </button>
      )}
      {ouvert && (
        <div className="planche-outils-liste" data-variante={variante} style={{ ...(hautTelephone !== null ? { top: `${hautTelephone}px` } : {}), ...(hauteurListe !== null ? { maxHeight: `${hauteurListe}px` } : {}) }} data-planche-outils-liste>
          <div className="planche-outils-recherche">
            <IconeSandbox nom="rechercher" />
            <input
              ref={champ}
              type="search"
              value={requete}
              placeholder={t("outils.recherche")}
              aria-label={t("outils.recherche")}
              aria-controls={idListe}
              autoComplete="off"
              data-outils-nav
              data-outils-recherche
              onChange={(e) => setRequete(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const o = premierOutil(requete, catalogue);
                  if (o) choisir(o.id);
                }
              }}
            />
          </div>
          <div id={idListe} className="planche-outils-arbre" role="menu" aria-label={t("outils.menu")}>
            {filtre && groupes.length === 0 && commandesRetenues.length === 0 && <p className="inspecteur-aide" role="none">{t("outils.aucun")}</p>}
            {groupesAffiches.map((g) => {
              const deplie = filtre || familles.has(g.famille);
              return (
                <div key={g.famille} className="planche-outils-groupe" role="group" aria-label={g.libelle} data-outils-groupe={g.famille}>
                  <button type="button" role="menuitem" className="planche-outils-famille" aria-expanded={deplie} data-outils-nav data-outils-famille={g.famille} onClick={() => !filtre && basculerFamille(g.famille)}>
                    <IconeSandbox nom={deplie ? "menu" : "sousMenu"} className="planche-outils-fleche" />
                    {g.libelle}
                  </button>
                  {deplie &&
                    g.outils.map((o) => {
                      const r = raccourciOutil(o);
                      const actif = o.id === outilId;
                      const motif = raison(o);
                      const e = etiquette(o.id);
                      const affichee = e ? barres.some((b) => b.id === e.id && b.affichee) : false;
                      return (
                        <div key={o.id} className={`planche-outils-ligne${actif ? " est-actif" : ""}`} role="none" data-outils-ligne={o.id}>
                          <div className="planche-outils-tete" role="none">
                            <button type="button" role="menuitem" className={`planche-outils-nom${motif ? " est-indisponible" : ""}`} aria-current={actif ? "true" : undefined} aria-disabled={motif ? true : undefined} title={titreOperation(o, motif)} data-outils-nav data-outils-outil={o.id} data-raccourci={r ?? undefined} onClick={() => choisir(o.id)}>
                              <Pictogramme picto={pictoOutil(o.id)} className="planche-outils-picto" />
                              <span className="planche-outils-libelle">{nomOutil(o)}</span>
                              {r && (
                                <>
                                  <span aria-hidden="true"> · </span>
                                  <kbd>{afficherRaccourci(r)}</kbd>
                                </>
                              )}
                            </button>
                            {e && (
                              <button type="button" role="menuitemcheckbox" className="planche-outils-etiquette" aria-checked={affichee} aria-label={t("outils.afficher.aide", { outil: e.nom })} title={t("outils.afficher.aide", { outil: e.nom })} data-outils-nav data-outils-etiquette={e.id} onClick={() => onAfficherBarre(e.id, !affichee)}>
                                {t("outils.etiquette", { barre: e.nom })}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  {deplie && g.famille === FAMILLE_DES_COMMANDES_CAMERA && commandesCamera.map(ligneCommande)}
                </div>
              );
            })}
            {GROUPES_COMMANDES.map((g) => {
              const lignes = commandesDe(g.id);
              if (lignes.length === 0) return null;
              const deplie = filtre || familles.has(g.id);
              return (
                <div key={g.id} className="planche-outils-groupe" role="group" aria-label={t(g.cle)} data-outils-groupe={g.id}>
                  <button type="button" role="menuitem" className="planche-outils-famille" aria-expanded={deplie} data-outils-nav data-outils-famille={g.id} onClick={() => !filtre && basculerFamille(g.id)}>
                    <IconeSandbox nom={deplie ? "menu" : "sousMenu"} className="planche-outils-fleche" />
                    {t(g.cle)}
                  </button>
                  {deplie && lignes.map(ligneCommande)}
                </div>
              );
            })}
            {(() => {
              // Groupe « Extensions » : une ligne par extension (interrupteur), suivie des commandes qu'elle apporte.
              const q = filtre ? requete.trim().toLocaleLowerCase("fr") : "";
              const lignes = commandesDe("extensions");
              const retenues = extensions.filter((x) => !filtre || x.nom.toLocaleLowerCase("fr").includes(q) || lignes.some((c) => c.extension === x.id));
              if (retenues.length === 0 || !onBasculerExtension) return null;
              const deplie = filtre || familles.has("extensions");
              return (
                <div className="planche-outils-groupe" role="group" aria-label={t("outils.famille.extensions")} data-outils-groupe="extensions">
                  <button type="button" role="menuitem" className="planche-outils-famille" aria-expanded={deplie} data-outils-nav data-outils-famille="extensions" onClick={() => !filtre && basculerFamille("extensions")}>
                    <IconeSandbox nom={deplie ? "menu" : "sousMenu"} className="planche-outils-fleche" />
                    {t("outils.famille.extensions")}
                  </button>
                  {deplie &&
                    retenues.map((x) => (
                      <div key={x.id} role="none" data-outils-extension-ligne={x.id}>
                        <button type="button" role="menuitemcheckbox" className="planche-outils-extension" aria-checked={x.active} title={t("outils.extension.aide", { extension: x.nom })} data-outils-nav data-outils-extension={x.id} onClick={() => onBasculerExtension(x.id, !x.active)}>
                          <Pictogramme picto={x.picto} className="planche-outils-picto" />
                          <span className="planche-outils-libelle">{x.nom}</span>
                          <span className="planche-outils-interrupteur" aria-hidden="true" data-actif={x.active ? "" : undefined} />
                        </button>
                        {x.active && <div className="planche-outils-extension-commandes" role="none">{lignes.filter((c) => c.extension === x.id).map(ligneCommande)}</div>}
                      </div>
                    ))}
                </div>
              );
            })()}
            <div className="planche-outils-pied" role="group" aria-label={t("outils.pied")} data-outils-reglages>
              <span className="planche-outils-pied-titre" aria-hidden="true">
                <IconeSandbox nom="reglages" /> {t("outils.pied")}
              </span>
              <span className="inspecteur-aide" role="none">
                {t("outils.pied.aide")}
              </span>
              {livrees.map(ligneBarre)}
              <span className="planche-outils-pied-sous-titre" role="none" data-outils-mes-barres>
                {t("outils.pied.mes-barres")}
              </span>
              {personnelles.length === 0 && (
                <span className="inspecteur-aide" role="none">
                  {t("outils.pied.aucune")}
                </span>
              )}
              {personnelles.map(ligneBarre)}
              {onNouvelleBarre && (
                <button type="button" role="menuitem" className="planche-outils-nouvelle" data-outils-nav data-outils-nouvelle onClick={() => { fermer(false); onNouvelleBarre(); }}>
                  {t("outils.barre.nouvelle")}
                </button>
              )}
              <button type="button" role="menuitem" className="planche-outils-reinitialiser" disabled={!reinitialisable} data-outils-nav data-outils-reinitialiser onClick={onReinitialiser}>
                {t("outils.reinitialiser")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
