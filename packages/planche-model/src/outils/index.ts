/** Registre des machines d'états des outils de la Planche. L'id d'une machine = id du catalogue (`catalogue-outils.ts`). */
import type { MachineOutil } from "./machine.js";
import { MACHINES_TRACE } from "./registre-trace.js";
import { MACHINES_FORMES } from "./registre-formes.js";

export * from "./machine.js";

export const MACHINES: ReadonlyMap<string, MachineOutil<any>> = new Map(
  [...MACHINES_TRACE, ...MACHINES_FORMES].map((m) => [m.id, m] as const),
);

export function machineParId(id: string): MachineOutil<any> | undefined {
  return MACHINES.get(id);
}
