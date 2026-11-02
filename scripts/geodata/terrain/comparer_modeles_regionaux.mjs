// Comparaison des modèles régionaux autour de Benslimane (TER-D4, Issue #381) : lecture par fenêtre des COG publics
// GEDTM30 v1.2 (MNT) et Copernicus GLO-30 (MNS), sans rien enregistrer. Constat entre modèles, jamais une précision.
// Usage : node scripts/geodata/terrain/comparer_modeles_regionaux.mjs (dépendance geotiff du dépôt).
import { fromUrl } from "geotiff";
const LAT=33.5315, LON=-7.10621, DLAT=0.0045, DLON=0.0054;
const src = {
  gedtm: "https://s3.opengeohub.org/global/dtm/v1.2/gedtm_rf_m_30m_s_20060101_20151231_go_epsg.4326.3855_v1.2.tif",
  gedtmStd: "https://s3.opengeohub.org/global/dtm/v1.2/gedtm_rf_std_30m_s_20060101_20151231_go_epsg.4326.3855_v1.2.tif",
  glo30: "https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_N33_00_W008_00_DEM/Copernicus_DSM_COG_10_N33_00_W008_00_DEM.tif",
};
async function lire(url){
  const t=await fromUrl(url); const im=await t.getImage();
  const [ox,oy]=im.getOrigin(); const [rx,ry]=im.getResolution();
  const c0=Math.floor((LON-DLON-ox)/rx), c1=Math.ceil((LON+DLON-ox)/rx);
  const r0=Math.floor((LAT+DLAT-oy)/ry), r1=Math.ceil((LAT-DLAT-oy)/ry);
  const [b]=await im.readRasters({window:[c0,r0,c1,r1],samples:[0]});
  const nd=im.getGDALNoData(); const w=c1-c0;
  const pts=new Map(); let vals=[];
  for(let r=0;r<r1-r0;r++)for(let c=0;c<w;c++){const v=b[r*w+c]; if(!Number.isFinite(v)||(nd!=null&&v===nd)||v>1e30) continue;
    const lon=ox+(c0+c+0.5)*rx, lat=oy+(r0+r+0.5)*ry; pts.set(`${lat.toFixed(5)},${lon.toFixed(5)}`,v); vals.push(v);}
  const cc=Math.floor((LON-ox)/rx), cr=Math.floor((LAT-oy)/ry);
  const [cb]=await im.readRasters({window:[cc,cr,cc+1,cr+1],samples:[0]});
  return {keys:im.getGeoKeys(), res:[rx,ry], gdal:im.getGDALMetadata?.(), n:vals.length, centre:cb[0], min:Math.min(...vals), max:Math.max(...vals), moy:vals.reduce((a,b)=>a+b,0)/vals.length, pts};
}
const out={};
for(const [k,u] of Object.entries(src)){ out[k]=await lire(u); console.log(k, JSON.stringify({keys:out[k].keys,res:out[k].res,gdal:out[k].gdal,n:out[k].n,centre:out[k].centre,min:out[k].min,max:out[k].max,moy:+out[k].moy.toFixed(2)})); }
// écarts GEDTM30 - GLO30 sur cellules communes (même centre arrondi à 1e-5°)
const gl=[...out.glo30.pts].map(([p,v])=>{const [a,b]=p.split(',').map(Number);return [a,b,v];});
const d=[]; for(const [p,v] of out.gedtm.pts){const [a,b]=p.split(',').map(Number); let best=null,bd=1e9; for(const [x,y,w] of gl){const e=(x-a)**2+(y-b)**2; if(e<bd){bd=e;best=w;}} if(best!==null && Math.sqrt(bd)<0.0002) d.push(v-best);}
if(d.length){d.sort((a,b)=>a-b); const m=d.reduce((a,b)=>a+b,0)/d.length; const rms=Math.sqrt(d.reduce((a,b)=>a+b*b,0)/d.length); const a=d.map(Math.abs).sort((x,y)=>x-y);
console.log("ecarts gedtm-glo30", JSON.stringify({n:d.length,moyenne:+m.toFixed(2),rms:+rms.toFixed(2),min:+d[0].toFixed(2),max:+d.at(-1).toFixed(2),p95abs:+a[Math.ceil(0.95*a.length)-1].toFixed(2)}));}
else console.log("aucune cellule commune (grilles non alignées)");
