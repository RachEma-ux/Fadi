#!/usr/bin/env node
// Interdit la réintroduction de références explicites à l'autre application
// dans les sources exécutées de Fadi. N'infère pas l'origine d'une fonctionnalité.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dirs=['apps','packages'];
const skip=new Set(['node_modules','dist','coverage','.next','build']);
const extensions=new Set(['.js','.mjs','.cjs','.ts','.tsx','.jsx','.sql','.json','.html','.css','.scss']);
const forbidden=/draw[ _-]?all|docs\/drawall/i;
let scanned=0;
const failures=[];
function walk(p){
 if(!fs.existsSync(p))return;
 for(const e of fs.readdirSync(p,{withFileTypes:true})){
  const fn=path.join(p,e.name);
  if(e.isDirectory()){if(!skip.has(e.name))walk(fn);continue;}
  if(!e.isFile()||!extensions.has(path.extname(e.name)))continue;
  const lines=fs.readFileSync(fn,'utf8').split(/\r?\n/);
  scanned++;
  lines.forEach((line,i)=>{
   if(forbidden.test(line)) failures.push(path.relative(root,fn).replaceAll('\\','/')+':'+(i+1));
  });
 }
}
for(const dir of dirs)walk(path.join(root,dir));
if(failures.length){
 console.error('FADI_EXTERNAL_APP_REFERENCE_FAILED : références explicites externes dans du code Fadi');
 for(const s of failures)console.error(' - '+s);
 process.exit(1);
}
console.log('FADI_EXTERNAL_APP_REFERENCE_OK : '+scanned+' fichiers de code contrôlés, aucune référence nominale à l’autre application.');
