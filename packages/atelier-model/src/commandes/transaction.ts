/**
 * Transaction d'une commande : vue de travail sur un `EtatModele` immuable, qui enregistre exactement ce que la
 * commande change (objets, relations, traces d'identité, catalogue) et ce qu'elle refuse.
 *
 * - les réducteurs n'écrivent jamais dans l'état reçu : ils posent ou retirent des objets dans la transaction ;
 * - les relations dérivées des paramètres canoniques (`heberge-par` / `heberge` d'une baie, `relie` d'un
 *   escalier, `reference` d'une cotation ou d'une étiquette) sont tenues à jour à chaque pose ;
 * - `conclure` produit l'état suivant et la **restauration** exacte (avant / après) qui sert d'inverse.
 *
 * Restauration : le contrat `atelier-commands/1` ne contient pas de commande capable de redonner un objet
 * tel qu'il était (provenance `import`, propriétés, annotations, représentations, trace `supprimes`…), et un
 * inverse arithmétique (vecteur opposé, angle opposé) ne redonne pas les mêmes nombres flottants. L'inverse
 * d'une commande est donc une commande du catalogue (type et paramètres lisibles) qui porte en plus un champ
 * `restauration` : l'état avant de chaque objet touché et l'empreinte attendue de son état après. Voir le
 * rapport de L1.2 (contrat à compléter).
 */
import type { Commande } from "../contrats/commandes.js";
import type { ReferenceTopologique } from "../contrats/references.js";
import type { ErreurCommande } from "../contrats/reducteurs.js";
import type { EtatModele } from "../contrats/etat.js";
import type { CodeProbleme, Probleme } from "../contrats/probleme.js";
import type { IdObjet, ObjetModele } from "../ontologie/classes.js";
import type { CatalogueTypes } from "../ontologie/definitions.js";
import type { Relation } from "../ontologie/relations.js";
import { empreinteValeur, jsonCanonique } from "./empreinte.js";

export const VERSION_RESTAURATION = 1;

export interface RestaurationObjet {
  readonly id: IdObjet;
  /** Objet à rétablir ; `null` = l'objet n'existait pas. */
  readonly avant: ObjetModele | null;
  /** Empreinte de l'objet attendu au moment de la restauration ; `null` = l'objet doit être absent. */
  readonly apres: string | null;
}

/** Restauration exacte portée par une commande inverse. */
export interface Restauration {
  readonly version: typeof VERSION_RESTAURATION;
  /** Commande dont cette restauration annule les effets (sans sa propre restauration). */
  readonly origine: Commande;
  readonly objets: readonly RestaurationObjet[];
  readonly relationsARetirer: readonly Relation[];
  readonly relationsARajouter: readonly Relation[];
  readonly supprimesARetirer: readonly IdObjet[];
  readonly supprimesARajouter: readonly IdObjet[];
  readonly catalogue?: { readonly avant: CatalogueTypes; readonly apres: string };
}

/** Commande du catalogue portant une restauration (inverse produit par un réducteur). */
export type CommandeRestauratrice = Commande & { readonly restauration: Restauration };

export function restaurationDe(c: Commande): Restauration | undefined {
  const r = (c as { restauration?: unknown }).restauration;
  return r === undefined ? undefined : (r as Restauration);
}

/** Commande sans son éventuelle restauration. */
export function sansRestauration(c: Commande): Commande {
  if (restaurationDe(c) === undefined) return c;
  const { restauration: _ignoree, ...reste } = c as Commande & { restauration?: unknown };
  void _ignoree;
  return reste as Commande;
}

export function cleRelation(r: Relation): string {
  return jsonCanonique({ type: r.type, sourceId: r.sourceId, cibleId: r.cibleId, role: r.role ?? null, derivee: r.derivee });
}

/** Relations dérivées des paramètres canoniques d'un objet. */
export function relationsDerivees(o: ObjetModele): Relation[] {
  switch (o.classe) {
    case "porte":
    case "fenetre":
    case "ouverture":
      return [
        { type: "heberge-par", sourceId: o.id, cibleId: o.params.murHoteId, derivee: true },
        { type: "heberge", sourceId: o.params.murHoteId, cibleId: o.id, derivee: true },
      ];
    case "escalier": {
      const r: Relation[] = [];
      if (o.params.niveauDepartId !== undefined) r.push({ type: "relie", sourceId: o.id, cibleId: o.params.niveauDepartId, role: "depart", derivee: true });
      if (o.params.niveauArriveeId !== undefined) r.push({ type: "relie", sourceId: o.id, cibleId: o.params.niveauArriveeId, role: "arrivee", derivee: true });
      return r;
    }
    case "cotation": {
      const vus = new Set<string>();
      const r: Relation[] = [];
      for (const ref of o.params.references) {
        const rel: Relation = { type: "reference", sourceId: o.id, cibleId: ref.objetId, role: ref.caracteristique, derivee: true };
        const k = cleRelation(rel);
        if (!vus.has(k)) {
          vus.add(k);
          r.push(rel);
        }
      }
      return r;
    }
    case "etiquette":
      if (o.params.objetId === undefined) return [];
      return [
        o.params.caracteristique === undefined
          ? { type: "reference", sourceId: o.id, cibleId: o.params.objetId, derivee: true }
          : { type: "reference", sourceId: o.id, cibleId: o.params.objetId, role: o.params.caracteristique, derivee: true },
      ];
    default:
      return [];
  }
}

/** Message « objet, cause, action » (DA-05-12-f). */
export function motif(objet: string, cause: string, action: string): string {
  return `${objet} : ${cause}. Action : ${action}.`;
}

export class Transaction {
  private readonly modifies = new Map<IdObjet, ObjetModele | null>();
  private readonly relAjoutees = new Map<string, Relation>();
  private readonly relRetirees = new Map<string, Relation>();
  private clesBase: Set<string> | null = null;
  private supprimesBase: Set<IdObjet> | null = null;
  private readonly supAjoutes = new Set<IdObjet>();
  private readonly supRetires = new Set<IdObjet>();
  private catalogueCourant: CatalogueTypes | null = null;
  readonly erreurs: ErreurCommande[] = [];
  readonly problemes: Probleme[] = [];
  readonly referencesTouchees: { readonly porteurId: IdObjet; readonly reference: ReferenceTopologique }[] = [];

  constructor(readonly base: EtatModele) {}

  // --- Lecture -------------------------------------------------------------

  objet(id: IdObjet): ObjetModele | undefined {
    if (this.modifies.has(id)) return this.modifies.get(id) ?? undefined;
    return Object.prototype.hasOwnProperty.call(this.base.objets, id) ? this.base.objets[id] : undefined;
  }

  /** Objets courants (état de base + changements de la transaction). */
  objets(): ObjetModele[] {
    const r: ObjetModele[] = [];
    for (const id of Object.keys(this.base.objets)) {
      const o = this.objet(id);
      if (o) r.push(o);
    }
    for (const [id, o] of this.modifies) if (o && !Object.prototype.hasOwnProperty.call(this.base.objets, id)) r.push(o);
    return r;
  }

  private supprimesInitiaux(): Set<IdObjet> {
    if (!this.supprimesBase) this.supprimesBase = new Set(this.base.supprimes);
    return this.supprimesBase;
  }

  estSupprime(id: IdObjet): boolean {
    return (this.supprimesInitiaux().has(id) && !this.supRetires.has(id)) || this.supAjoutes.has(id);
  }

  /** Identifiant jamais utilisé (ni objet présent, ni objet supprimé : DA-05-12-a). */
  identifiantLibre(id: IdObjet): boolean {
    return this.objet(id) === undefined && !this.estSupprime(id);
  }

  private clesInitiales(): Set<string> {
    if (!this.clesBase) this.clesBase = new Set(this.base.relations.map(cleRelation));
    return this.clesBase;
  }

  aRelation(r: Relation): boolean {
    const k = cleRelation(r);
    return (this.clesInitiales().has(k) && !this.relRetirees.has(k)) || this.relAjoutees.has(k);
  }

  relations(): Relation[] {
    const r = this.base.relations.filter((x) => !this.relRetirees.has(cleRelation(x)));
    return [...r, ...this.relAjoutees.values()];
  }

  catalogue(): CatalogueTypes {
    return this.catalogueCourant ?? this.base.catalogue;
  }

  // --- Écriture ------------------------------------------------------------

  ajouterRelation(r: Relation): void {
    const k = cleRelation(r);
    if (this.aRelation(r)) return;
    if (this.relRetirees.has(k)) this.relRetirees.delete(k);
    else this.relAjoutees.set(k, r);
  }

  retirerRelation(r: Relation): void {
    const k = cleRelation(r);
    if (!this.aRelation(r)) return;
    if (this.relAjoutees.has(k)) this.relAjoutees.delete(k);
    else this.relRetirees.set(k, r);
  }

  /** Pose un objet (création ou remplacement) et tient à jour ses relations dérivées. */
  mettre(o: ObjetModele): void {
    const ancien = this.objet(o.id);
    const nouvelles = relationsDerivees(o);
    const clesNouvelles = new Set(nouvelles.map(cleRelation));
    if (ancien) for (const r of relationsDerivees(ancien)) if (!clesNouvelles.has(cleRelation(r))) this.retirerRelation(r);
    this.modifies.set(o.id, o);
    // Une relation dérivée vers un objet absent (référence d'une cotation « à réparer ») n'est pas recréée.
    for (const r of nouvelles) if (this.objet(r.sourceId) && this.objet(r.cibleId)) this.ajouterRelation(r);
  }

  /** Pose un objet sans toucher aux relations (restauration exacte). */
  poserBrut(id: IdObjet, o: ObjetModele | null): void {
    this.modifies.set(id, o);
  }

  /**
   * Retire un objet : toutes les relations qui le citent sont retirées, son identifiant est conservé dans
   * `supprimes` (jamais réutilisé, DA-05-12-a).
   */
  retirer(id: IdObjet): void {
    for (const r of this.relations()) if (r.sourceId === id || r.cibleId === id) this.retirerRelation(r);
    this.modifies.set(id, null);
    this.ajouterSupprime(id);
  }

  ajouterSupprime(id: IdObjet): void {
    if (this.supRetires.has(id)) this.supRetires.delete(id);
    else if (!this.supprimesInitiaux().has(id)) this.supAjoutes.add(id);
  }

  retirerSupprime(id: IdObjet): void {
    if (this.supAjoutes.has(id)) this.supAjoutes.delete(id);
    else if (this.supprimesInitiaux().has(id)) this.supRetires.add(id);
  }

  definirCatalogue(c: CatalogueTypes): void {
    this.catalogueCourant = c;
  }

  refuser(code: CodeProbleme, chemin: string, message: string, objetIds?: readonly IdObjet[]): void {
    this.erreurs.push(objetIds && objetIds.length > 0 ? { code, chemin, message, objetIds } : { code, chemin, message });
  }

  signaler(p: Probleme): void {
    this.problemes.push(p);
  }

  get refusee(): boolean {
    return this.erreurs.length > 0;
  }

  // --- Bilan ---------------------------------------------------------------

  /** Objets réellement changés : `[id, avant, après]` (pose identique ignorée). */
  changements(): { readonly id: IdObjet; readonly avant: ObjetModele | null; readonly apres: ObjetModele | null }[] {
    const r: { id: IdObjet; avant: ObjetModele | null; apres: ObjetModele | null }[] = [];
    for (const [id, apres] of this.modifies) {
      const avant = Object.prototype.hasOwnProperty.call(this.base.objets, id) ? (this.base.objets[id] ?? null) : null;
      if (avant === apres) continue;
      if (avant && apres && jsonCanonique(avant) === jsonCanonique(apres)) continue;
      r.push({ id, avant, apres });
    }
    return r;
  }

  relationsAjoutees(): Relation[] {
    return [...this.relAjoutees.values()];
  }

  relationsRetirees(): Relation[] {
    return [...this.relRetirees.values()];
  }

  catalogueChange(): boolean {
    return this.catalogueCourant !== null && jsonCanonique(this.catalogueCourant) !== jsonCanonique(this.base.catalogue);
  }

  /** Vrai si la transaction ne change rien. */
  estVide(): boolean {
    return this.changements().length === 0 && this.relAjoutees.size === 0 && this.relRetirees.size === 0 && this.supAjoutes.size === 0 && this.supRetires.size === 0 && !this.catalogueChange();
  }

  /** État suivant (révision et empreinte inchangées : c'est le lot qui les met à jour) et restauration exacte. */
  conclure(origine: Commande): { readonly etat: EtatModele; readonly restauration: Restauration } {
    const changements = this.changements();
    const objets: Record<IdObjet, ObjetModele> = { ...this.base.objets };
    for (const { id, apres } of changements) {
      if (apres) objets[id] = apres;
      else delete objets[id];
    }
    const supprimes = [...this.base.supprimes.filter((id) => !this.supRetires.has(id)), ...this.supAjoutes];
    const catalogueChange = this.catalogueChange();
    const etat: EtatModele = {
      ...this.base,
      objets,
      relations: this.relations(),
      supprimes,
      catalogue: this.catalogue(),
    };
    const restauration: Restauration = {
      version: VERSION_RESTAURATION,
      origine: sansRestauration(origine),
      objets: changements.map(({ id, avant, apres }) => ({ id, avant, apres: apres ? empreinteValeur(apres) : null })),
      relationsARetirer: this.relationsAjoutees(),
      relationsARajouter: this.relationsRetirees(),
      supprimesARetirer: [...this.supAjoutes],
      supprimesARajouter: [...this.supRetires],
      ...(catalogueChange ? { catalogue: { avant: this.base.catalogue, apres: empreinteValeur(this.catalogue()) } } : {}),
    };
    return { etat, restauration };
  }
}
