/**
 * Contrôleur de la zone de travail 2D (logique pure, sans DOM, testable) : reçoit les entrées de pointeur
 * (souris, stylet, toucher unifiés), de molette et de clavier **en coordonnées écran**, et produit :
 * - les `EvenementPlan` **en mètres, repère local, après accrochage** vers `pilote.traiter` (outil actif) ;
 * - la sélection (clic, Maj = ajouter, Ctrl = basculer, lasso, filtre par classe) quand aucun outil n'est actif
 *   (`vue.outilActif === null` : le pilote n'a pas de session) ;
 * - le manipulateur 2D (DA-02-17) : glisser un objet sélectionné le déplace (`transformer.deplacer`), Ctrl au
 *   relâcher le copie (`transformer.copier`) — une commande par geste, validée par `ctx.valider` ;
 * - la vue (pan, zoom molette ou pincer, ajuster à l'emprise) et la saisie de précision au clavier.
 * Les coordonnées écran ne sortent jamais d'ici ni du composant.
 */
import type { EtatModele, IdObjet, PointLocal } from "@parcours/atelier-model";
import type { Accrochage, ChampSaisie, ContexteAtelier, DessinPlan, ErreurLisible, EtatInterface, EvenementPlan, Modificateurs, PiloteOutils, Registres } from "../socle";
import { accrocher, REGLAGES_INITIAUX, surGrille, type CandidatAccrochage, type ModeAccrochage, type ReglagesAccrochage } from "./accrochage";
import { admisParFiltre, basculerGroupe, filtrerParClasse, groupesPresents, lasso, modeClic, objetSousPointeur, type FiltreClasses } from "./choix";
import { distance, emprise, pt, rectangleDe, segmentsDe, type Rectangle, type Vec } from "./geometrie";
import { commande, SANS_MODIFICATEUR } from "./outils/commun";
import { selectionAvecBaies } from "./outils/transformations";
import { analyserSaisie, ouvreSaisie } from "./saisie";
import { ajusterEmprise, CADRE_INITIAL, deplacerVue, facteurMolette, pixelsEnMetres, redimensionner, versEcran, versMetres, zoomerVue, type CadreVue } from "./vue";

/** Rayons de capture (DA-02-15, proposés) : 8 px souris et stylet, 16 px toucher. */
export const RAYON_SOURIS_PX = 8;
export const RAYON_TOUCHER_PX = 16;
/** Déplacement au-delà duquel un appui devient un glisser (px). */
export const SEUIL_GLISSER_PX = 4;

export type TypePointeur = "mouse" | "pen" | "touch";

export interface EntreePointeur {
  readonly id: number;
  /** Position dans la zone, px CSS depuis le coin haut-gauche. */
  readonly x: number;
  readonly y: number;
  readonly type: TypePointeur;
  /** 0 principal, 1 milieu, 2 secondaire. */
  readonly bouton: number;
  readonly modificateurs: Modificateurs;
}

export interface EtatSaisie {
  readonly indice: number;
  readonly texte: string;
  readonly erreur: ErreurLisible | null;
}

/** Ce que le composant affiche (instantané, recalculé à chaque notification). */
export interface AffichageZone {
  readonly cadre: CadreVue;
  readonly reglages: ReglagesAccrochage;
  readonly filtre: FiltreClasses;
  /** Curseur (pointeur ou clavier) en px écran, après accrochage ; `null` hors de la zone. */
  readonly curseur: Vec | null;
  /** Même curseur en m (barre de coordonnées, DA-01-01-f). */
  readonly curseurMetres: Vec | null;
  readonly accrochage: Accrochage | null;
  /** Lasso en px écran et son sens. */
  readonly lasso: { readonly rect: Rectangle; readonly sens: "inclus" | "touches" } | null;
  /** Manipulateur : vecteur de déplacement en m de la sélection, copie si Ctrl. */
  readonly manipulation: { readonly dx: number; readonly dy: number; readonly copie: boolean } | null;
  readonly survole: IdObjet | null;
  readonly saisie: EtatSaisie | null;
  readonly modePan: boolean;
  /** Erreurs du manipulateur ou de la saisie (affichées « objet, cause, action »). */
  readonly erreurs: readonly ErreurLisible[];
  /** Message court pour la région `aria-live`. */
  readonly annonce: string;
}

interface Pointeur {
  readonly entree: EntreePointeur;
  readonly depart: Vec;
}

type Geste =
  | { readonly genre: "outil" }
  | { readonly genre: "lasso"; readonly depart: Vec; readonly mode: Modificateurs }
  | { readonly genre: "manipuler"; readonly departM: Vec; readonly depart: Vec; actif: boolean }
  | { readonly genre: "clic-vide"; readonly depart: Vec; readonly mode: Modificateurs }
  | { readonly genre: "pan"; dernier: Vec }
  | { readonly genre: "pincer"; distance: number; milieu: Vec };

export interface OptionsControleur {
  readonly registres: Pick<Registres, "dessinateurs">;
  readonly pilote: PiloteOutils;
  readonly ctx: ContexteAtelier;
  readonly vue: EtatInterface;
}

export class ControleurPlan {
  private readonly o: OptionsControleur;
  private cadre: CadreVue = CADRE_INITIAL;
  private reglages: ReglagesAccrochage = REGLAGES_INITIAUX;
  private filtre: FiltreClasses = null;
  private curseurM: Vec | null = null;
  private curseurEcran: Vec | null = null;
  private accrochage: Accrochage | null = null;
  private pointeurs = new Map<number, Pointeur>();
  private geste: Geste | null = null;
  private survole: IdObjet | null = null;
  private saisie: EtatSaisie | null = null;
  private modePan = false;
  private erreurs: readonly ErreurLisible[] = [];
  private annonce = "";
  private reference: Vec | null = null;
  private outilReference: string | null = null;
  private dernierTypePointeur: TypePointeur = "mouse";
  private file: Promise<void> = Promise.resolve();
  private mouvementEnAttente: EvenementPlan | null = null;
  private cacheDessins: { etat: EtatModele | null; niveau: IdObjet | null; masques: readonly IdObjet[]; dessins: readonly DessinPlan[] } | null = null;
  private instantane: AffichageZone | null = null;
  private readonly ecouteurs = new Set<() => void>();

  constructor(o: OptionsControleur) {
    this.o = o;
  }

  // -------------------------------------------------------------------------------------------------------------
  // Abonnement (compatible `useSyncExternalStore`)
  // -------------------------------------------------------------------------------------------------------------

  abonner = (e: () => void): (() => void) => {
    this.ecouteurs.add(e);
    return () => this.ecouteurs.delete(e);
  };

  lire = (): AffichageZone => {
    if (!this.instantane) {
      this.instantane = {
        cadre: this.cadre,
        reglages: this.reglages,
        filtre: this.filtre,
        curseur: this.curseurEcran,
        curseurMetres: this.curseurEcran ? this.curseurM : null,
        accrochage: this.accrochage,
        lasso: this.lassoAffiche(),
        manipulation: this.manipulationAffichee(),
        survole: this.survole,
        saisie: this.saisie,
        modePan: this.modePan,
        erreurs: this.erreurs,
        annonce: this.annonce,
      };
    }
    return this.instantane;
  };

  private publier(): void {
    this.instantane = null;
    for (const e of [...this.ecouteurs]) e();
  }

  // -------------------------------------------------------------------------------------------------------------
  // Données du niveau
  // -------------------------------------------------------------------------------------------------------------

  /** Dessins du niveau actif (mis en cache tant que l'état, le niveau et les calques masqués ne changent pas). */
  dessins(): readonly DessinPlan[] {
    const etat = this.o.ctx.etat();
    const v = this.o.vue.lire();
    const c = this.cacheDessins;
    if (c && c.etat === etat && c.niveau === v.niveauActifId && c.masques === v.calquesMasques) return c.dessins;
    const dessins = etat && v.niveauActifId ? this.o.registres.dessinateurs.dessinerNiveau(etat, v.niveauActifId, v.calquesMasques) : [];
    this.cacheDessins = { etat, niveau: v.niveauActifId, masques: v.calquesMasques, dessins };
    return dessins;
  }

  /** Groupes de classes présents (filtre de sélection). */
  groupes(): string[] {
    const etat = this.o.ctx.etat();
    return etat ? groupesPresents(this.dessins(), etat) : [];
  }

  private outilActif(): string | null {
    return this.o.pilote.outilActif()?.id ?? null;
  }

  private tolerance(): number {
    return pixelsEnMetres(this.cadre, this.dernierTypePointeur === "touch" ? RAYON_TOUCHER_PX : RAYON_SOURIS_PX);
  }

  private admis(): (id: IdObjet) => boolean {
    const etat = this.o.ctx.etat();
    return etat ? admisParFiltre(etat, this.filtre) : () => true;
  }

  /** Candidats d'accrochage : dessins du niveau, plus les points déjà posés de l'aperçu (fermer une polyligne). */
  private candidats(): CandidatAccrochage[] {
    const c: CandidatAccrochage[] = [...this.dessins()];
    const points: PointLocal[] = [];
    const segments: { a: PointLocal; b: PointLocal }[] = [];
    for (const f of this.o.pilote.apercu().formes) {
      if (f.forme === "polyligne" && f.style === "trace") {
        // Le dernier sommet de l'aperçu est le curseur : il n'est pas un candidat.
        const pts = f.points.slice(0, -1);
        points.push(...pts);
        for (const s of segmentsDe(pts, false)) segments.push({ a: pt(s.a.x, s.a.y), b: pt(s.b.x, s.b.y) });
      }
    }
    if (points.length > 0) c.push({ objetId: "apercu", segments, points });
    return c;
  }

  private synchroniserOutil(): void {
    const id = this.outilActif();
    if (id !== this.outilReference) {
      this.outilReference = id;
      this.reference = null;
      this.saisie = null;
    }
  }

  // -------------------------------------------------------------------------------------------------------------
  // File des évènements vers le pilote (séquentielle ; mouvements fusionnés)
  // -------------------------------------------------------------------------------------------------------------

  private envoyer(e: EvenementPlan): void {
    if (e.type === "survol" || e.type === "glisse") {
      const enAttente = this.mouvementEnAttente !== null;
      this.mouvementEnAttente = e;
      if (enAttente) return;
      this.file = this.file.then(async () => {
        const m = this.mouvementEnAttente;
        this.mouvementEnAttente = null;
        if (m) await this.o.pilote.traiter(m);
      });
      this.file = this.file.catch(() => undefined);
      return;
    }
    if (e.type === "appui") this.reference = e.point;
    this.file = this.file.then(async () => {
      const m = this.mouvementEnAttente;
      this.mouvementEnAttente = null;
      if (m) await this.o.pilote.traiter(m);
      await this.o.pilote.traiter(e);
    });
    this.file = this.file.catch(() => undefined);
  }

  /** Attend la fin des évènements envoyés (tests, enchaînements). */
  async attendre(): Promise<void> {
    await this.file;
  }

  private evenementPointeur(type: "survol" | "appui" | "glisse" | "relache", ecran: Vec, m: Modificateurs, accrocher_ = true): EvenementPlan {
    const brut = versMetres(this.cadre, ecran);
    const a = accrocher_
      ? accrocher({ point: brut, reference: this.reference, tolerance: this.tolerance(), orthogonal: m.maj }, this.candidats(), this.reglages)
      : { point: pt(brut.x, brut.y), accrochage: { type: "aucun" as const, libelle: "" } };
    this.curseurM = a.point;
    this.curseurEcran = versEcran(this.cadre, a.point);
    this.majAccrochage(a.accrochage);
    return { type, point: a.point, accrochage: a.accrochage, modificateurs: m, objetSousPointeur: objetSousPointeur(this.dessins(), brut, this.tolerance()) };
  }

  private majAccrochage(a: Accrochage | null): void {
    const avant = this.accrochage?.libelle ?? "";
    this.accrochage = a && a.type !== "aucun" ? a : null;
    const apres = this.accrochage?.libelle ?? "";
    if (apres && apres !== avant) this.annonce = `Accrochage : ${apres}`;
  }

  // -------------------------------------------------------------------------------------------------------------
  // Pointeur
  // -------------------------------------------------------------------------------------------------------------

  pointeurBas(p: EntreePointeur): void {
    this.synchroniserOutil();
    this.dernierTypePointeur = p.type;
    const ecran = { x: p.x, y: p.y };
    this.pointeurs.set(p.id, { entree: p, depart: ecran });
    this.erreurs = [];
    if (this.pointeurs.size === 2 && [...this.pointeurs.values()].every((x) => x.entree.type === "touch")) {
      // Deux doigts : pan / zoom, jamais un trait (DA-01-06).
      const [a, b] = [...this.pointeurs.values()].map((x) => ({ x: x.entree.x, y: x.entree.y })) as [Vec, Vec];
      this.geste = { genre: "pincer", distance: distance(a, b), milieu: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
      this.publier();
      return;
    }
    if (this.pointeurs.size > 1) return;
    if (p.bouton === 1 || this.modePan) {
      this.geste = { genre: "pan", dernier: ecran };
      return;
    }
    if (p.bouton !== 0) return;
    if (this.outilActif()) {
      this.geste = { genre: "outil" };
      this.envoyer(this.evenementPointeur("appui", ecran, p.modificateurs));
      this.publier();
      return;
    }
    const brut = versMetres(this.cadre, ecran);
    const touche = objetSousPointeur(this.dessins(), brut, this.tolerance(), this.admis());
    const selection = this.o.ctx.selection.lire().ids;
    if (touche && selection.includes(touche) && !p.modificateurs.maj && !p.modificateurs.ctrl) {
      const a = accrocher({ point: brut, reference: null, tolerance: this.tolerance(), orthogonal: false }, this.dessins(), this.reglages);
      this.geste = { genre: "manipuler", departM: a.point, depart: ecran, actif: false };
    } else if (touche) {
      this.o.ctx.selection.choisir([touche], modeClic(p.modificateurs));
      this.geste = null;
    } else {
      this.geste = { genre: "clic-vide", depart: ecran, mode: p.modificateurs };
    }
    this.publier();
  }

  pointeurDeplace(p: EntreePointeur): void {
    this.dernierTypePointeur = p.type;
    const ecran = { x: p.x, y: p.y };
    const suivi = this.pointeurs.get(p.id);
    if (suivi) this.pointeurs.set(p.id, { entree: p, depart: suivi.depart });
    const g = this.geste;
    if (g?.genre === "pincer") {
      const pts = [...this.pointeurs.values()].map((x) => ({ x: x.entree.x, y: x.entree.y }));
      if (pts.length >= 2) {
        const [a, b] = pts as [Vec, Vec];
        const d = distance(a, b);
        const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        let c = deplacerVue(this.cadre, m.x - g.milieu.x, m.y - g.milieu.y);
        if (g.distance > 0 && d > 0) c = zoomerVue(c, d / g.distance, m);
        this.cadre = c;
        g.distance = d;
        g.milieu = m;
        this.publier();
      }
      return;
    }
    if (g?.genre === "pan") {
      this.cadre = deplacerVue(this.cadre, ecran.x - g.dernier.x, ecran.y - g.dernier.y);
      g.dernier = ecran;
      this.publier();
      return;
    }
    if (this.outilActif()) {
      this.synchroniserOutil();
      // Pendant un glisser (main levée, poignée) : point brut, accrochages désactivés (DA-01-06).
      const glisse = g?.genre === "outil" && suivi !== undefined;
      this.envoyer(this.evenementPointeur(glisse ? "glisse" : "survol", ecran, p.modificateurs, !glisse));
      this.publier();
      return;
    }
    const brut = versMetres(this.cadre, ecran);
    this.curseurM = brut;
    this.curseurEcran = ecran;
    this.accrochage = null;
    if (g?.genre === "clic-vide" && suivi && distance(ecran, g.depart) > SEUIL_GLISSER_PX) this.geste = { genre: "lasso", depart: g.depart, mode: g.mode };
    if (g?.genre === "manipuler" && suivi && distance(ecran, g.depart) > SEUIL_GLISSER_PX) g.actif = true;
    if (g?.genre === "manipuler" && g.actif) {
      const a = accrocher({ point: brut, reference: g.departM, tolerance: this.tolerance(), orthogonal: p.modificateurs.maj }, this.dessins(), this.reglages);
      this.curseurM = a.point;
      this.curseurEcran = versEcran(this.cadre, a.point);
      this.majAccrochage(a.accrochage);
    }
    this.survole = this.geste?.genre === "lasso" ? null : objetSousPointeur(this.dessins(), brut, this.tolerance(), this.admis());
    this.publier();
  }

  pointeurHaut(p: EntreePointeur): void {
    const ecran = { x: p.x, y: p.y };
    const suivi = this.pointeurs.get(p.id);
    this.pointeurs.delete(p.id);
    const g = this.geste;
    if (g?.genre === "pincer") {
      if (this.pointeurs.size === 0) this.geste = null;
      return;
    }
    this.geste = null;
    if (!suivi) return;
    if (g?.genre === "pan") return;
    if (g?.genre === "outil") {
      this.envoyer(this.evenementPointeur("relache", ecran, p.modificateurs));
      this.publier();
      return;
    }
    if (g?.genre === "lasso") {
      const etat = this.o.ctx.etat();
      const ids = lasso(this.dessins(), versMetres(this.cadre, g.depart), versMetres(this.cadre, ecran), this.admis());
      this.o.ctx.selection.choisir(etat ? filtrerParClasse(ids, etat, this.filtre) : ids, g.mode.maj ? "ajouter" : g.mode.ctrl ? "basculer" : "remplacer");
      this.annonce = `${this.o.ctx.selection.lire().ids.length} objet(s) sélectionné(s)`;
    } else if (g?.genre === "clic-vide") {
      if (!g.mode.maj && !g.mode.ctrl) this.o.ctx.selection.vider();
    } else if (g?.genre === "manipuler" && g.actif && this.curseurM) {
      void this.manipuler(g.departM, this.curseurM, p.modificateurs.ctrl);
    }
    this.publier();
  }

  /** Pointeur annulé (`pointercancel`) : le geste en cours est abandonné sans commande. */
  pointeurAnnule(p: EntreePointeur): void {
    this.pointeurs.delete(p.id);
    if (this.geste?.genre === "outil") this.envoyer({ type: "touche", touche: "Escape", modificateurs: SANS_MODIFICATEUR });
    this.geste = null;
    this.publier();
  }

  pointeurSorti(): void {
    if (this.pointeurs.size > 0) return;
    this.curseurEcran = null;
    this.survole = null;
    this.accrochage = null;
    this.publier();
  }

  /** Manipulateur 2D : une commande par geste (déplacer, ou copier avec Ctrl). */
  private async manipuler(de: Vec, a: Vec, copie: boolean): Promise<void> {
    const ids = this.o.ctx.selection.lire().ids;
    const vecteur = { dx: a.x - de.x, dy: a.y - de.y, unit: "m" as const };
    if (ids.length === 0 || Math.hypot(vecteur.dx, vecteur.dy) === 0) return;
    let r;
    if (copie) {
      const cibles = selectionAvecBaies(this.o.ctx.etat(), ids);
      const etat = this.o.ctx.etat();
      const nouveaux = cibles.map((id) => this.o.ctx.nouvelId((etat?.objets[id]?.classe ?? "objet").replace(/\./g, "-")));
      r = await this.o.ctx.valider(`Copier ${cibles.length} objet(s)`, [commande("transformer.copier", { vecteur, nouveauxIds: nouveaux }, cibles)]);
    } else {
      r = await this.o.ctx.valider(`Déplacer ${ids.length} objet${ids.length > 1 ? "s" : ""}`, [commande("transformer.deplacer", { vecteur }, ids)]);
    }
    this.erreurs = r.ok ? [] : r.erreurs;
    this.annonce = r.ok ? (copie ? "Copie validée" : "Déplacement validé") : `Refusé : ${r.erreurs[0]?.message ?? ""}`;
    this.publier();
  }

  molette(x: number, y: number, deltaY: number): void {
    this.cadre = zoomerVue(this.cadre, facteurMolette(deltaY), { x, y });
    this.publier();
  }

  // -------------------------------------------------------------------------------------------------------------
  // Vue
  // -------------------------------------------------------------------------------------------------------------

  redimensionner(largeur: number, hauteur: number): void {
    const c = redimensionner(this.cadre, largeur, hauteur);
    if (c === this.cadre) return;
    this.cadre = c;
    this.publier();
  }

  /** Ajuste la vue à l'emprise des dessins du niveau (ou de la sélection si `selection`). */
  ajuster(selection = false): void {
    const ids = new Set(this.o.ctx.selection.lire().ids);
    const d = this.dessins().filter((x) => !selection || ids.has(x.objetId));
    const r = emprise(d.flatMap((x) => [...x.segments.flatMap((s) => [s.a, s.b]), ...x.points, ...(x.contour ?? [])]));
    this.cadre = ajusterEmprise(this.cadre, r);
    this.publier();
  }

  zoomer(facteur: number): void {
    this.cadre = zoomerVue(this.cadre, facteur, { x: this.cadre.largeur / 2, y: this.cadre.hauteur / 2 });
    this.publier();
  }

  basculerPan(): void {
    this.modePan = !this.modePan;
    this.publier();
  }

  /** Cadre imposé (tests, restauration). */
  definirCadre(c: CadreVue): void {
    this.cadre = c;
    this.publier();
  }

  // -------------------------------------------------------------------------------------------------------------
  // Réglages et filtre
  // -------------------------------------------------------------------------------------------------------------

  basculerAccrochage(): void {
    this.reglages = { ...this.reglages, actif: !this.reglages.actif };
    this.annonce = this.reglages.actif ? "Accrochages actifs" : "Accrochages désactivés";
    this.publier();
  }

  basculerMode(m: ModeAccrochage): void {
    this.reglages = { ...this.reglages, modes: { ...this.reglages.modes, [m]: !this.reglages.modes[m] } };
    this.publier();
  }

  basculerFiltre(groupe: string): void {
    this.filtre = basculerGroupe(this.filtre, groupe, this.groupes());
    const etat = this.o.ctx.etat();
    if (etat && this.filtre) {
      const sel = this.o.ctx.selection.lire().ids;
      const gardes = filtrerParClasse(sel, etat, this.filtre);
      if (gardes.length !== sel.length) this.o.ctx.selection.choisir(gardes);
    }
    this.publier();
  }

  toutesClasses(): void {
    this.filtre = null;
    this.publier();
  }

  // -------------------------------------------------------------------------------------------------------------
  // Clavier
  // -------------------------------------------------------------------------------------------------------------

  /** Point courant (clavier ou pointeur), en m ; à défaut le centre de la vue posé sur la grille. */
  private pointCourant(): Vec {
    if (this.curseurM) return this.curseurM;
    const c = versMetres(this.cadre, { x: this.cadre.largeur / 2, y: this.cadre.hauteur / 2 });
    return pt(surGrille(c.x, this.reglages.pasGrille), surGrille(c.y, this.reglages.pasGrille));
  }

  private placerCurseurClavier(p: Vec, m: Modificateurs): void {
    const q = pt(p.x, p.y);
    this.curseurM = q;
    this.curseurEcran = versEcran(this.cadre, q);
    this.majAccrochage({ type: "grille", libelle: "Curseur clavier" });
    if (this.outilActif()) this.envoyer({ type: "survol", point: q, accrochage: { type: "grille", libelle: "Curseur clavier" }, modificateurs: m, objetSousPointeur: objetSousPointeur(this.dessins(), q, this.tolerance()) });
    else this.survole = objetSousPointeur(this.dessins(), q, this.tolerance(), this.admis());
  }

  /** Pose (appui + relâche) au point donné, accrochage déjà résolu. */
  private poser(p: PointLocal, a: Accrochage, m: Modificateurs): void {
    const objet = objetSousPointeur(this.dessins(), p, this.tolerance());
    this.envoyer({ type: "appui", point: p, accrochage: a, modificateurs: m, objetSousPointeur: objet });
    this.envoyer({ type: "relache", point: p, accrochage: a, modificateurs: m, objetSousPointeur: objet });
  }

  private champs(): readonly ChampSaisie[] {
    return this.o.pilote.apercu().champs;
  }

  /**
   * Touche pressée dans la zone (hors champ de saisie). Rend `true` si elle est consommée (le composant
   * appelle alors `preventDefault`).
   */
  touche(touche: string, m: Modificateurs): boolean {
    this.synchroniserOutil();
    const outil = this.outilActif();
    if (this.saisie) return false;
    if (outil && ouvreSaisie(touche) && !m.ctrl && !m.alt) {
      this.saisie = { indice: 0, texte: touche, erreur: null };
      this.publier();
      return true;
    }
    const pas = this.reglages.pasGrille * (m.maj ? 10 : 1);
    const fleches: Record<string, Vec> = { ArrowLeft: { x: -pas, y: 0 }, ArrowRight: { x: pas, y: 0 }, ArrowUp: { x: 0, y: pas }, ArrowDown: { x: 0, y: -pas } };
    const f = fleches[touche];
    if (f) {
      const p = this.pointCourant();
      this.placerCurseurClavier({ x: p.x + f.x, y: p.y + f.y }, { ...m, maj: false });
      this.publier();
      return true;
    }
    if (touche === "Enter") {
      if (!this.curseurM) this.placerCurseurClavier(this.pointCourant(), m);
      const c = this.pointCourant();
      const p = pt(c.x, c.y);
      if (outil) this.poser(p, this.accrochage ?? { type: "aucun", libelle: "" }, m);
      else {
        const id = objetSousPointeur(this.dessins(), p, this.tolerance(), this.admis());
        if (id) this.o.ctx.selection.choisir([id], modeClic(m));
      }
      this.publier();
      return true;
    }
    if (touche === "Escape") {
      if (outil) this.o.pilote.abandonner();
      else this.o.ctx.selection.vider();
      this.geste = null;
      this.reference = null;
      this.erreurs = [];
      this.publier();
      return true;
    }
    if (!outil && (touche === "+" || touche === "=")) {
      this.zoomer(1.25);
      return true;
    }
    if (!outil && touche === "-") {
      this.zoomer(0.8);
      return true;
    }
    if (outil && (touche === "Backspace" || touche === "Delete")) {
      this.envoyer({ type: "touche", touche, modificateurs: m });
      return true;
    }
    return false;
  }

  // -------------------------------------------------------------------------------------------------------------
  // Champ de saisie de précision
  // -------------------------------------------------------------------------------------------------------------

  /** Champ actif (celui proposé par l'outil à l'indice courant), ou un champ de coordonnées s'il n'y en a pas. */
  champActif(): ChampSaisie {
    const c = this.champs();
    const i = this.saisie?.indice ?? 0;
    return c[i % Math.max(1, c.length)] ?? { champ: "point", libelle: "Point (x;y, @dx;dy, @l<a)", unite: "m", valeur: null };
  }

  /** Ouvre la saisie sur le champ `indice` (clic dans un champ affiché). */
  ouvrirSaisie(indice: number): void {
    this.saisie = { indice, texte: "", erreur: null };
    this.publier();
  }

  ecrireSaisie(texte: string): void {
    if (!this.saisie) return;
    this.saisie = { ...this.saisie, texte, erreur: null };
    this.publier();
  }

  fermerSaisie(): void {
    this.saisie = null;
    this.publier();
  }

  /**
   * Tab : la valeur verrouille la grandeur, le champ suivant s'ouvre. Entrée : la valeur verrouille la grandeur
   * puis le point est posé au curseur (l'outil applique le verrou) ; une coordonnée pose le point saisi.
   */
  validerSaisie(sens: "entree" | "suivant" | "precedent"): void {
    const s = this.saisie;
    if (!s) return;
    const champs = this.champs();
    const champ = this.champActif();
    const m = SANS_MODIFICATEUR;
    if (s.texte.trim() === "" && sens !== "entree") {
      const n = Math.max(1, champs.length);
      this.saisie = { indice: (s.indice + (sens === "precedent" ? n - 1 : 1)) % n, texte: "", erreur: null };
      this.publier();
      return;
    }
    const r = analyserSaisie(s.texte, champ.unite, this.reference);
    if (r.genre === "erreur") {
      this.saisie = { ...s, erreur: r.erreur };
      this.annonce = r.erreur.message;
      this.publier();
      return;
    }
    if (r.genre === "point") {
      this.saisie = null;
      this.curseurM = r.point;
      this.curseurEcran = versEcran(this.cadre, r.point);
      this.poser(r.point, { type: "aucun", libelle: "Saisie" }, m);
      this.publier();
      return;
    }
    if (champ.champ !== "point") this.envoyer({ type: "saisie", champ: champ.champ, valeur: r.valeur });
    if (sens === "entree") {
      this.saisie = null;
      const p = this.curseurM ?? this.pointCourant();
      // Le pointeur brut : l'outil y applique les verrous (longueur, angle…) qu'il vient de recevoir.
      const point = pt(p.x, p.y);
      this.poser(point, this.accrochage ?? { type: "aucun", libelle: "" }, m);
    } else {
      const n = Math.max(1, champs.length);
      this.saisie = { indice: (s.indice + (sens === "precedent" ? n - 1 : 1)) % n, texte: "", erreur: null };
    }
    this.publier();
  }

  // -------------------------------------------------------------------------------------------------------------

  private lassoAffiche(): AffichageZone["lasso"] {
    const g = this.geste;
    if (g?.genre !== "lasso" || !this.curseurEcran) return null;
    return { rect: rectangleDe(g.depart, this.curseurEcran), sens: this.curseurEcran.x >= g.depart.x ? "inclus" : "touches" };
  }

  private manipulationAffichee(): AffichageZone["manipulation"] {
    const g = this.geste;
    if (g?.genre !== "manipuler" || !g.actif || !this.curseurM) return null;
    const copie = [...this.pointeurs.values()].some((p) => p.entree.modificateurs.ctrl);
    return { dx: this.curseurM.x - g.departM.x, dy: this.curseurM.y - g.departM.y, copie };
  }
}
