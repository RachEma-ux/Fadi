/**
 * Machine d'états du compte (UM-2) — fonction pure. États stockés : active, suspended, closed.
 *   active ⇄ suspended ; active → closed ; suspended → closed (anonymisation D-5) ; closed est terminal.
 * Toute autre transition (y compris vers l'état courant) est refusée.
 */
import type { AccountStatus } from "../../db/schema.js";

const ALLOWED: Record<AccountStatus, readonly AccountStatus[]> = {
  active: ["suspended", "closed"],
  suspended: ["active", "closed"],
  closed: [],
};

export function canTransition(from: AccountStatus, to: AccountStatus): boolean {
  return ALLOWED[from].includes(to);
}

export class AccountTransitionRefused extends Error {
  constructor(public readonly from: AccountStatus, public readonly to: AccountStatus) {
    super(`transition de compte refusée : ${from} → ${to}`);
    this.name = "AccountTransitionRefused";
  }
}

export function assertTransition(from: AccountStatus, to: AccountStatus): void {
  if (!canTransition(from, to)) throw new AccountTransitionRefused(from, to);
}
