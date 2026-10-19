/**
 * Propriété des tampons transférés entre environnements d'exécution (D.3-01), sur un vrai canal de messages : le
 * tampon transféré est détaché chez l'expéditeur (longueur 0) et tout usage ultérieur est refusé ; le destinataire
 * en devient propriétaire avec le contenu intact. Le protocole du Worker transfère ainsi les tampons de ses résultats.
 */
import { MessageChannel } from "node:worker_threads";
import { describe, expect, it } from "vitest";
import { brancher, type PorteeWorker } from "../workers/protocole";
import { assurerPossede, ErreurTransfert, estTransfere, posterAvecTransfert } from "./transferts";

describe("Tampons transférés (D.3-01)", () => {
  it("canal réel : détaché chez l'expéditeur, intact chez le destinataire, réutilisation refusée", async () => {
    const { port1, port2 } = new MessageChannel();
    const recu = new Promise<ArrayBuffer>((r) => port2.once("message", (m: { b: ArrayBuffer }) => r(m.b)));
    const b = new Uint8Array([1, 2, 3, 4]).buffer;
    posterAvecTransfert((m, t) => port1.postMessage(m, t as never), { b }, [b]);
    expect(b.byteLength).toBe(0);
    expect(estTransfere(b)).toBe(true);
    expect(() => assurerPossede(b)).toThrow(ErreurTransfert);
    // Second transfert du même tampon : refusé avant tout envoi.
    expect(() => posterAvecTransfert(() => { throw new Error("ne doit pas être appelé"); }, null, [b])).toThrow(ErreurTransfert);
    const r = await recu;
    expect([...new Uint8Array(r)]).toEqual([1, 2, 3, 4]);
    expect(() => assurerPossede(r)).not.toThrow();
    port1.close(); port2.close();
  });

  it("protocole du Worker : le tampon d'un résultat est transféré, le Worker ne le possède plus", async () => {
    let tampon: ArrayBuffer | null = null;
    const envois: { message: unknown; transfert?: Transferable[] }[] = [];
    const portee: PorteeWorker = { onmessage: null, postMessage: (message, transfert) => { envois.push({ message: structuredClone(message, { transfer: transfert ?? [] }), transfert }); } };
    brancher(portee, { "pdf.produire": { executer: () => { tampon = new Uint8Array([9, 9]).buffer; return { pdf: tampon }; }, transfert: (v: { pdf: ArrayBuffer }) => [v.pdf] } });
    await portee.onmessage!({ data: { id: 1, nature: "pdf.produire", charge: null } } as MessageEvent);
    expect(envois).toHaveLength(1);
    expect(tampon!.byteLength).toBe(0);
    expect(() => assurerPossede(tampon!)).toThrow(ErreurTransfert);
    expect([...new Uint8Array((envois[0]!.message as { valeur: { pdf: ArrayBuffer } }).valeur.pdf)]).toEqual([9, 9]);
  });
});
