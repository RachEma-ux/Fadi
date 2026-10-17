/**
 * Audit LECTURE SEULE dans le checkout local de Fadi.
 * Ne consulte ni ne modifie un autre dépôt GitHub, dont DrawAll.
 * Usage : node scripts/audit-drawall-in-fadi.mjs [chemin-rapport-json]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ignoreDirs=new Set(['.git','node_modules','dist','coverage','.cache','.next','build','.vite','playwright-report','test-results','.turbo']);
const extensions=new Set(['.md','.mdx','.txt','.json','.yaml','.yml','.js','.mjs','.cjs','.ts','.tsx','.jsx','.html','.css','.scss','.sh','.toml','.xml','.svg','.py','.sql','.rb','.config']);
const bad=/draw[\s_-]?all|docs\/drawall|(?:\bDA-\d{2}-\d{2}\b)/gi;

function enumerate(start){
 const out=[];
 function go(dir){
  for(const item of fs.readdirSync(dir,{withFileTypes:true})){
   if(item.isDirectory()){if(!ignoreDirs.has(item.name))go(path.join(dir,item.name));continue;}
   if(!item.isFile())continue;
   const full=path.join(dir,item.name);
   if(!extensions.has(path.extname(item.name).toLowerCase()))continue;
   const st=fs.statSync(full);
   if(st.size>1_500_000){out.push({path:path.relative(start,full).replaceAll('\\','/'),skipped:'large text file',bytes:st.size});continue;}
   out.push({full,path:path.relative(start,full).replaceAll('\\','/')});
  }
 }
 go(start);return out;
}
function classify(p){
 if(p.startsWith('docs/drawall/'))return 'A-OTHER-PRODUCT-REFERENCE';
 if(p==='docs/atelier-drawall.md')return 'B-CROSS-PRODUCT-CONTRACT';
 if(p.startsWith('docs/atelier/fiches/'))return 'C-FADI-CAPABILITY-SHEET';
 if(p.startsWith('docs/atelier/')||p.startsWith('docs/planche/')||p.startsWith('docs/'))return 'B-FADI-DOCUMENTATION';
 if(p.startsWith('packages/')||p.startsWith('apps/'))return 'D-ACTIVE-FADI-CODE-REVIEW';
 return 'E-REPOSITORY-METADATA';
}
export function audit(start){
 const reports=[],all=enumerate(start);
 for(const f of all){
  if(f.skipped){reports.push({path:f.path,category:classify(f.path),skipped:f.skipped,bytes:f.bytes});continue;}
  const src=fs.readFileSync(f.full,'utf8');
  const lines=src.split(/\r?\n/), hits=[];
  for(let i=0;i<lines.length;i++){
   bad.lastIndex=0;
   const matches=[...lines[i].matchAll(bad)].map(m=>m[0]);
   if(matches.length)hits.push({line:i+1,markers:matches,excerpt:lines[i].trim().slice(0,260)});
  }
  if(hits.length||/drawall/i.test(f.path))reports.push({path:f.path,category:classify(f.path),occurrences:hits.length,hits});
 }
 const summary={scanned_files:all.length,affected_files:reports.filter(x=>x.hits?.length).length,total_matching_lines:reports.reduce((a,x)=>a+(x.occurrences||0),0),by_category:{},skipped_files:reports.filter(x=>x.skipped).map(x=>({path:x.path,reason:x.skipped}))};
 for(const f of reports){const cat=f.category;summary.by_category[cat]??={files:0,lines:0};if(f.occurrences){summary.by_category[cat].files++;summary.by_category[cat].lines+=f.occurrences;}}
 return {generated_at:new Date().toISOString(),repository:'RachEma-ux/Fadi',mode:'read-only',scope:'this checkout only; no DrawAll repository operations',summary,files:reports};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const result=audit(root);
 const target=process.argv[2];
 if(target){
  fs.mkdirSync(path.dirname(path.resolve(target)),{recursive:true});
  fs.writeFileSync(target,JSON.stringify(result,null,2)+'\n');
 }
 console.log(JSON.stringify(result.summary,null,2));
 console.log('AUDIT_DRAWALL_FADI_OK : inventaire uniquement, aucune suppression.');
}
