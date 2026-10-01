/**
 * Mécanisme générique de commandes réversibles — voir docs/architecture.md,
 * « Coherent, reversible operations ».
 *
 * Ce fichier ne contient AUCUNE règle métier (pas de « déplacer un mur »,
 * pas de « recalculer une surface »). Il fournit uniquement le squelette
 * mécanique commun à toute commande qui modifie l'état d'un projet :
 * appliquer, annuler (undo), rétablir (redo), et un historique borné.
 *
 * Chaque module (Atelier, Programmation, …) définit ses propres commandes
 * concrètes en implémentant `Command<TState>` pour son propre `TState` ;
 * ce paquet ne connaît ni la géométrie ni aucun autre type de domaine.
 */

/**
 * Une commande sait produire le prochain état à partir de l'état courant
 * (`apply`) et sait revenir à l'état précédent (`undo`). Les deux méthodes
 * sont pures : elles retournent un nouvel état, elles ne mutent pas
 * `state` en place — ce qui est nécessaire pour que l'historique reste
 * cohérent même si un état intermédiaire est partagé ailleurs (ex. rendu).
 */
export interface Command<TState> {
  /** Libellé court, destiné à l'historique visible par l'utilisateur. */
  readonly label: string;
  apply(state: TState): TState;
  undo(state: TState): TState;
}

export interface CommandHistoryOptions {
  /** Nombre maximal de commandes conservées dans l'historique. Par défaut, illimité. */
  maxEntries?: number;
}

/**
 * Empile les commandes appliquées, permet de les annuler/rétablir dans
 * l'ordre, et oublie la branche "redo" dès qu'une nouvelle commande est
 * appliquée après un undo (comportement standard do/undo/redo).
 *
 * `maxEntries`, s'il est fourni, borne la pile "undo" : les entrées les
 * plus anciennes sont alors évincées silencieusement (elles ne sont plus
 * annulables, mais ne bloquent pas la mémoire sur un historique sans fin).
 */
export class CommandHistory<TState> {
  private state: TState;
  private readonly undoStack: Command<TState>[] = [];
  private readonly redoStack: Command<TState>[] = [];
  private readonly maxEntries: number | undefined;

  constructor(initialState: TState, options: CommandHistoryOptions = {}) {
    this.state = initialState;
    this.maxEntries = options.maxEntries;
  }

  getState(): TState {
    return this.state;
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** Libellés des commandes annulables, de la plus ancienne à la plus récente. */
  undoLabels(): string[] {
    return this.undoStack.map((c) => c.label);
  }

  /** Libellés des commandes rétablissables, de la plus ancienne à la plus récente. */
  redoLabels(): string[] {
    return this.redoStack.map((c) => c.label);
  }

  /** Applique la commande, l'ajoute à l'historique, et vide la pile "redo". */
  do(command: Command<TState>): TState {
    this.state = command.apply(this.state);
    this.undoStack.push(command);
    this.redoStack.length = 0;
    if (this.maxEntries !== undefined && this.undoStack.length > this.maxEntries) {
      this.undoStack.splice(0, this.undoStack.length - this.maxEntries);
    }
    return this.state;
  }

  /** Annule la dernière commande appliquée ; ne fait rien si l'historique est vide. */
  undo(): TState {
    const command = this.undoStack.pop();
    if (!command) {
      return this.state;
    }
    this.state = command.undo(this.state);
    this.redoStack.push(command);
    return this.state;
  }

  /** Réapplique la dernière commande annulée ; ne fait rien s'il n'y a rien à rétablir. */
  redo(): TState {
    const command = this.redoStack.pop();
    if (!command) {
      return this.state;
    }
    this.state = command.apply(this.state);
    this.undoStack.push(command);
    return this.state;
  }
}
