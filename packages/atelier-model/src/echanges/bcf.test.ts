import { deflateRawSync, inflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { CONTRAT_COMMANDES, appliquerLot, type Commande } from "../commandes/index.js";
import { vues3D } from "../commandes/vues3d.js";
import { modeleVide } from "../modele.js";
import { crc32, exporterBcf, guidStable, importerBcf, lireZip, zipStocke } from "./bcf.js";

const lot = (commands: Commande[], id = "r") => ({ requestId: id, baseRevision: 0, contract: CONTRAT_COMMANDES, label: id, commands });
const enc = new TextEncoder();
const options = { projet: { id: "p1", nom: "Maison <A&B>" }, horodatage: "2026-10-05T10:00:00Z", auteur: "revue@exemple.fr", champDeVision: 45 };
const etat = () =>
  appliquerLot(modeleVide(), lot([
    { type: "niveau.creer", params: { id: "n", nom: "R", elevation: 0, hauteur: 3 } },
    { type: "vue3d.enregistrer", params: { id: "v1", nom: "Façade & entrée", camera: { position: { x: 10, y: -10, z: 5 }, cible: { x: 0, y: 0, z: 1 } }, annotations: [{ position: { x: 1, y: 2, z: 3 }, texte: "Garde-corps < 1 m ?" }] } },
    { type: "vue3d.enregistrer", params: { id: "v2", nom: "Dessus", camera: { position: { x: 0, y: 0, z: 30 }, cible: { x: 0, y: 0.01, z: 0 } } } },
  ])).etat;

describe("archive ZIP (D-097)", () => {
  it("CRC-32 de référence ; écriture stockée relue ; entrée compressée relue par le décompresseur fourni", async () => {
    expect(crc32(enc.encode("123456789"))).toBe(0xcbf43926);
    const z = zipStocke([{ nom: "a.txt", octets: enc.encode("bonjour") }, { nom: "dossier/é.xml", octets: enc.encode("<x/>") }]);
    const lus = await lireZip(z);
    expect(lus.map((f) => [f.nom, new TextDecoder().decode(f.octets)])).toEqual([["a.txt", "bonjour"], ["dossier/é.xml", "<x/>"]]);
    // Entrée « deflate » : on remplace les données et la méthode d'une archive écrite à la main.
    const brut = enc.encode("texte compressé ".repeat(20));
    const comp = deflateRawSync(brut);
    const nom = enc.encode("c.txt");
    const local = new Uint8Array(30 + nom.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(8, 8, true); lv.setUint32(14, crc32(brut), true); lv.setUint32(18, comp.length, true); lv.setUint32(22, brut.length, true); lv.setUint16(26, nom.length, true); local.set(nom, 30);
    const central = new Uint8Array(46 + nom.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(10, 8, true); cv.setUint32(16, crc32(brut), true); cv.setUint32(20, comp.length, true); cv.setUint32(24, brut.length, true); cv.setUint16(28, nom.length, true); cv.setUint32(42, 0, true); central.set(nom, 46);
    const fin = new Uint8Array(22);
    const fv = new DataView(fin.buffer);
    fv.setUint32(0, 0x06054b50, true); fv.setUint16(8, 1, true); fv.setUint16(10, 1, true); fv.setUint32(12, central.length, true); fv.setUint32(16, local.length + comp.length, true);
    const archive = new Uint8Array([...local, ...comp, ...central, ...fin]);
    await expect(lireZip(archive)).rejects.toThrow(/décompresseur/);
    const ok = await lireZip(archive, async (b) => new Uint8Array(inflateRawSync(b)));
    expect(new TextDecoder().decode(ok[0]!.octets)).toBe("texte compressé ".repeat(20));
    await expect(lireZip(enc.encode("pas une archive"))).rejects.toThrow(/illisible/);
  });
});

describe("échange BCF 2.1 (D-097, DA-17-16)", () => {
  it("export : version, projet, un sujet par vue 3D (titre échappé, caméra, commentaires avec le point) ; GUID stables", () => {
    const e = etat();
    const { fichiers, sujets } = exporterBcf(e, options);
    expect(sujets).toBe(2);
    const noms = fichiers.map((f) => f.nom);
    expect(noms).toContain("bcf.version");
    expect(noms).toContain("project.bcfp");
    const g1 = guidStable("vue3d|p1|v1");
    expect(g1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(guidStable("vue3d|p1|v1")).toBe(g1);
    const markup = new TextDecoder().decode(fichiers.find((f) => f.nom === `${g1}/markup.bcf`)!.octets);
    expect(markup).toContain("<Title>Façade &amp; entrée</Title>");
    expect(markup).toContain("Garde-corps &lt; 1 m ? [point 1 ; 2 ; 3 m, repère local]");
    const pdv = new TextDecoder().decode(fichiers.find((f) => f.nom === `${g1}/viewpoint.bcfv`)!.octets);
    expect(pdv).toContain("<CameraViewPoint><X>10</X><Y>-10</Y><Z>5</Z></CameraViewPoint>");
    expect(pdv).toContain("<FieldOfView>45</FieldOfView>");
    expect(new TextDecoder().decode(fichiers.find((f) => f.nom === "project.bcfp")!.octets)).toContain("Maison &lt;A&amp;B&gt;");
    expect(exporterBcf(modeleVide(), options).sujets).toBe(0);
  });

  it("aller-retour : vues relues (caméra, cible sur la direction de visée, annotations et leurs points) puis enregistrables", async () => {
    const e = etat();
    const lus = await lireZip(zipStocke(exporterBcf(e, options).fichiers));
    const { vues, avertissements } = importerBcf(lus, 10);
    expect(avertissements).toEqual([]);
    const facade = vues.find((v) => v.nom === "Façade & entrée")!;
    expect(facade.camera.position).toEqual({ x: 10, y: -10, z: 5 });
    const d = Math.hypot(10, 10, 4);
    expect(facade.camera.cible.x).toBeCloseTo(10 - (10 / d) * 10, 5);
    expect(facade.annotations).toEqual([{ texte: "Garde-corps < 1 m ?", position: { x: 1, y: 2, z: 3 } }]);
    const r = appliquerLot(modeleVide(), lot(vues.map((v) => ({ type: "vue3d.enregistrer", params: { nom: v.nom, camera: v.camera, ...(v.annotations.length ? { annotations: v.annotations } : {}) } })), "i"));
    expect(vues3D(r.etat).map((v) => v.nom)).toEqual(["Dessus", "Façade & entrée"]);
  });

  it("BCF d'un autre outil : caméra orthogonale, objets désignés, commentaire sans point, sujet sans point de vue", () => {
    const f = (nom: string, xml: string) => ({ nom, octets: enc.encode(xml) });
    const { vues, avertissements } = importerBcf([
      f("bcf.version", `<Version VersionId="2.1"/>`),
      f("A/markup.bcf", `<Markup><Topic Guid="a"><Title>Conflit gaine</Title></Topic><Comment Guid="c1"><Date>2026</Date><Author>x</Author><Comment>Déplacer la gaine</Comment></Comment><Viewpoints Guid="v"><Viewpoint>vue.bcfv</Viewpoint></Viewpoints></Markup>`),
      f("A/vue.bcfv", `<VisualizationInfo><Components><Selection><Component IfcGuid="0abc"/></Selection></Components><OrthogonalCamera><CameraViewPoint><X>0</X><Y>0</Y><Z>20</Z></CameraViewPoint><CameraDirection><X>0</X><Y>0</Y><Z>-2</Z></CameraDirection><CameraUpVector><X>0</X><Y>1</Y><Z>0</Z></CameraUpVector><ViewToWorldScale>30</ViewToWorldScale></OrthogonalCamera></VisualizationInfo>`),
      f("B/markup.bcf", `<Markup><Topic Guid="b"><Title>Sans vue</Title></Topic></Markup>`),
    ]);
    expect(vues).toHaveLength(1);
    expect(vues[0]!.camera.cible).toEqual({ x: 0, y: 0, z: 10 });
    expect(vues[0]!.annotations).toEqual([{ texte: "Déplacer la gaine", position: { x: 0, y: 0, z: 10 } }]);
    expect(avertissements.join(" | ")).toMatch(/orthogonale.*Components|Components.*orthogonale/s);
    expect(avertissements.join(" | ")).toMatch(/Sans vue.*point de vue absent/);
  });
});
