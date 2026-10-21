import { afterEach, describe, expect, it, vi } from "vitest";
import { modeleVide } from "@parcours/sandbox-planche-model";
import { enregistrerBrouillon } from "./brouillon";

afterEach(() => vi.unstubAllGlobals());
describe("Sandbox — confirmation réelle du stockage", () => {
  it("refuse de confirmer une sauvegarde si IndexedDB est indisponible", async () => {
    vi.stubGlobal("indexedDB", undefined);
    await expect(enregistrerBrouillon(modeleVide())).rejects.toThrow();
  });
});

import { creerSauvegardeBrouillon, type EtatSauvegarde } from "./sauvegarde-brouillon";

describe("Sandbox — écritures ordonnées et confirmation", () => {
  it("annonce l'échec, conserve le brouillon en mémoire et permet un nouvel essai", async () => {
    const etats: EtatSauvegarde[] = [];
    const ecrire = vi.fn().mockRejectedValueOnce(new Error("quota")).mockResolvedValueOnce(undefined);
    const s = creerSauvegardeBrouillon((e) => etats.push(e), ecrire);
    await s.sauver(modeleVide(), s.modifier());
    expect(etats.at(-1)).toBe("erreur");
    await s.sauver(modeleVide(), s.modifier());
    expect(etats.at(-1)).toBe("enregistre");
    expect(ecrire).toHaveBeenCalledTimes(2);
  });
  it("une ancienne écriture ne confirme pas la suivante et ne peut la dépasser", async () => {
    const etats: EtatSauvegarde[] = [];
    let terminer!: () => void;
    const ecrire = vi.fn().mockImplementationOnce(() => new Promise<void>((r) => { terminer = r; })).mockResolvedValue(undefined);
    const s = creerSauvegardeBrouillon((e) => etats.push(e), ecrire);
    const premier = s.sauver(modeleVide(), s.modifier());
    await Promise.resolve();
    const ticket = s.modifier();
    const dernier = s.sauver(modeleVide(), ticket);
    expect(ecrire).toHaveBeenCalledTimes(1);
    terminer();
    await premier;
    expect(etats.at(-1)).not.toBe("enregistre");
    await dernier;
    expect(etats.at(-1)).toBe("enregistre");
    expect(ecrire).toHaveBeenCalledTimes(2);
  });
});

import { localStore } from "../../../lib/local-store";
import { chargerBrouillon } from "./brouillon";

it("un brouillon illisible est conservé sur disque, sans autoriser un écrasement automatique", async () => {
  const lire = vi.spyOn(localStore, "getValueChecked").mockResolvedValueOnce("{illisible");
  const ecrire = vi.spyOn(localStore, "setValueChecked");
  await expect(chargerBrouillon()).rejects.toThrow("illisible");
  expect(ecrire).not.toHaveBeenCalled();
  lire.mockRestore();
  ecrire.mockRestore();
});
