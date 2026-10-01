/* Shared model geometry for the existing architectural workshop views. */
(()=>{'use strict';
 const bridge=window.V14Bridge;
 const deep=v=>JSON.parse(JSON.stringify(v));
 const len=(a,b)=>Math.hypot(b[0]-a[0],b[1]-a[1]);
 const mid=(a,b)=>[(a[0]+b[0])/2,(a[1]+b[1])/2];
  const COLUMN_SHAPES=[
    // BASIC
    {id:'basic-square',family:'BASIC',label:'Carré',kind:'square',icon:'□',params:['width']},
    {id:'basic-rectangle',family:'BASIC',label:'Rectangle',kind:'rect',icon:'▭',params:['width','depth']},
    {id:'basic-circle',family:'BASIC',label:'Cercle',kind:'circle',icon:'○',params:['diameter']},
    {id:'basic-ellipse',family:'BASIC',label:'Ellipse / Ovale',kind:'ellipse',icon:'⬭',params:['width','depth']},
    {id:'basic-triangle',family:'BASIC',label:'Triangle',kind:'triangle',icon:'△',params:['width','depth']},
    {id:'basic-trapezoid',family:'BASIC',label:'Trapèze',kind:'trapezoid',icon:'⏢',params:['width','depth']},
    {id:'basic-parallelogram',family:'BASIC',label:'Parallélogramme',kind:'parallelogram',icon:'▱',params:['width','depth']},
    {id:'basic-pentagon',family:'BASIC',label:'Pentagone',kind:'regular5',icon:'⬠',params:['width','depth']},
    {id:'basic-hexagon',family:'BASIC',label:'Hexagone',kind:'regular6',icon:'⬡',params:['width','depth']},
    {id:'basic-octagon',family:'BASIC',label:'Octogone',kind:'regular8',icon:'⯃',params:['width','depth']},
    {id:'basic-ngon',family:'BASIC',label:'Polygone N côtés',kind:'ngon',icon:'N',params:['width','depth','sides']},
    // CONCRETE / ARCHITECTURAL
    {id:'concrete-l',family:'BÉTON / ARCHI',label:'L',kind:'L',icon:'L',params:['width','depth','thickness']},
    {id:'concrete-t',family:'BÉTON / ARCHI',label:'T',kind:'T',icon:'T',params:['width','depth','thickness']},
    {id:'concrete-c',family:'BÉTON / ARCHI',label:'C',kind:'C',icon:'C',params:['width','depth','thickness']},
    {id:'concrete-u',family:'BÉTON / ARCHI',label:'U',kind:'U',icon:'U',params:['width','depth','thickness']},
    {id:'concrete-i',family:'BÉTON / ARCHI',label:'I',kind:'I',icon:'I',params:['width','depth','flange','web']},
    {id:'concrete-h',family:'BÉTON / ARCHI',label:'H',kind:'I',icon:'H',params:['width','depth','flange','web']},
    {id:'concrete-plus',family:'BÉTON / ARCHI',label:'Cruciforme +',kind:'plus',icon:'+',params:['width','depth','thickness']},
    {id:'concrete-x',family:'BÉTON / ARCHI',label:'Croix X',kind:'X',icon:'X',params:['width','depth','thickness']},
    {id:'concrete-y',family:'BÉTON / ARCHI',label:'Y',kind:'Y',icon:'Y',params:['width','depth','thickness']},
    {id:'concrete-elbow',family:'BÉTON / ARCHI',label:'Coude / Elbow',kind:'L',icon:'⌞',params:['width','depth','thickness']},
    {id:'concrete-irregular',family:'BÉTON / ARCHI',label:'Irrégulier',kind:'irregular',icon:'⌁',params:['width','depth']},
    {id:'concrete-custom-poly',family:'BÉTON / ARCHI',label:'Polygone personnalisé',kind:'custom',icon:'✎',params:['width','depth']},
    {id:'concrete-custom-spline',family:'BÉTON / ARCHI',label:'Spline fermée',kind:'custom',icon:'〰',params:['width','depth']},
    // HOLLOW
    {id:'hollow-shs',family:'CREUX',label:'SHS · carré creux',kind:'hollowRect',icon:'▣',params:['width','thickness']},
    {id:'hollow-rhs',family:'CREUX',label:'RHS · rectangle creux',kind:'hollowRect',icon:'▤',params:['width','depth','thickness']},
    {id:'hollow-chs',family:'CREUX',label:'CHS · rond creux',kind:'hollowCircle',icon:'◉',params:['diameter','thickness']},
    {id:'hollow-ellipse',family:'CREUX',label:'Ellipse creuse',kind:'hollowEllipse',icon:'◉',params:['width','depth','thickness']},
    {id:'hollow-polygon',family:'CREUX',label:'Polygone creux',kind:'hollowPoly',icon:'⬡',params:['width','depth','thickness','sides']},
    {id:'hollow-custom',family:'CREUX',label:'Creux personnalisé',kind:'hollowCustom',icon:'✎',params:['width','depth','thickness']},
    // STEEL
    {id:'steel-h',family:'ACIER',label:'H / HE',kind:'I',icon:'H',params:['width','depth','flange','web']},
    {id:'steel-i',family:'ACIER',label:'I',kind:'I',icon:'I',params:['width','depth','flange','web']},
    {id:'steel-w',family:'ACIER',label:'W · Wide Flange',kind:'I',icon:'W',params:['width','depth','flange','web']},
    {id:'steel-hp',family:'ACIER',label:'HP',kind:'I',icon:'HP',params:['width','depth','flange','web']},
    {id:'steel-t',family:'ACIER',label:'T',kind:'T',icon:'T',params:['width','depth','flange','web']},
    {id:'steel-c',family:'ACIER',label:'Channel C',kind:'C',icon:'C',params:['width','depth','thickness']},
    {id:'steel-u',family:'ACIER',label:'Channel U',kind:'U',icon:'U',params:['width','depth','thickness']},
    {id:'steel-l-equal',family:'ACIER',label:'L · ailes égales',kind:'L',icon:'L',params:['width','depth','thickness']},
    {id:'steel-l-unequal',family:'ACIER',label:'L · ailes inégales',kind:'L',icon:'L',params:['width','depth','thickness']},
{id:'steel-z',family:'ACIER',label:'Z',kind:'Z',icon:'Z',params:['width','depth','thickness']},
    {id:'steel-pipe',family:'ACIER',label:'Pipe',kind:'hollowCircle',icon:'◉',params:['diameter','thickness']},
    {id:'steel-shs',family:'ACIER',label:'SHS',kind:'hollowRect',icon:'▣',params:['width','thickness']},
    {id:'steel-rhs',family:'ACIER',label:'RHS',kind:'hollowRect',icon:'▤',params:['width','depth','thickness']},
    {id:'steel-chs',family:'ACIER',label:'CHS',kind:'hollowCircle',icon:'◉',params:['diameter','thickness']},
    {id:'steel-box',family:'ACIER',label:'Caisson / Box',kind:'hollowRect',icon:'▣',params:['width','depth','thickness']},
    {id:'steel-builtup',family:'ACIER',label:'Profil bâti',kind:'I',icon:'I+',params:['width','depth','flange','web']},
    {id:'steel-cold-c',family:'ACIER',label:'C formé à froid',kind:'C',icon:'C',params:['width','depth','thickness']},
    {id:'steel-c-lipped',family:'ACIER',label:'C à lèvres',kind:'C-lipped',icon:'C⌝',params:['width','depth','thickness']},
    {id:'steel-folded',family:'ACIER',label:'Profil plié',kind:'Z',icon:'Z',params:['width','depth','thickness']},
    {id:'steel-custom',family:'ACIER',label:'Acier personnalisé',kind:'custom',icon:'✎',params:['width','depth']},
    // COMPOSITE
    {id:'comp-h-rect',family:'COMPOSITE',label:'H acier + béton rectangle',kind:'compRectH',icon:'▣H',params:['width','depth','flange','web']},
    {id:'comp-h-circle',family:'COMPOSITE',label:'H acier + béton cercle',kind:'compCircleH',icon:'◉H',params:['diameter','flange','web']},
    {id:'comp-h-ellipse',family:'COMPOSITE',label:'H acier + béton ovale',kind:'compEllipseH',icon:'⬭H',params:['width','depth','flange','web']},
    {id:'comp-filled-shs',family:'COMPOSITE',label:'SHS rempli béton',kind:'filledRect',icon:'▣●',params:['width','thickness']},
    {id:'comp-filled-rhs',family:'COMPOSITE',label:'RHS rempli béton',kind:'filledRect',icon:'▤●',params:['width','depth','thickness']},
    {id:'comp-filled-chs',family:'COMPOSITE',label:'CHS rempli béton',kind:'filledCircle',icon:'◉●',params:['diameter','thickness']},
    {id:'comp-custom',family:'COMPOSITE',label:'Composite personnalisé',kind:'custom',icon:'✎+',params:['width','depth']},
    // CUSTOM
    {id:'custom-points',family:'CUSTOM',label:'Profil par points',kind:'custom',icon:'✎',params:['width','depth']},
    {id:'custom-spline',family:'CUSTOM',label:'Spline',kind:'custom',icon:'〰',params:['width','depth']},
    {id:'custom-import',family:'CUSTOM',label:'Profil importé',kind:'custom',icon:'⇩',params:['width','depth']},
    {id:'custom-stylo',family:'CUSTOM',label:'Profil depuis Stylo',kind:'custom',icon:'✎',params:['width','depth']}
  ];
  const COLUMN_SHAPE_MAP=Object.fromEntries(COLUMN_SHAPES.map(s=>[s.id,s]));

  function columnShapeMeta(c){c=ensureColumnProps(c);return COLUMN_SHAPE_MAP[c.shapeId]||COLUMN_SHAPE_MAP['basic-square'];}
  function ensureColumnProps(c){if(!c)return c;const legacy={carré:'basic-square',rectangulaire:'basic-rectangle',circulaire:'basic-circle',rect:'basic-rectangle',circle:'basic-circle'};if(!c.shapeId)c.shapeId=legacy[c.shape]||'basic-square';const meta=COLUMN_SHAPE_MAP[c.shapeId]||COLUMN_SHAPE_MAP['basic-square'];c.shapeFamily=meta.family;if(c.width===undefined)c.width=.40;if(c.depth===undefined)c.depth=.40;if(c.diameter===undefined)c.diameter=.40;if(c.thickness===undefined)c.thickness=.06;if(c.flangeThickness===undefined)c.flangeThickness=.08;if(c.webThickness===undefined)c.webThickness=.06;if(c.sides===undefined)c.sides=6;if(c.angle===undefined)c.angle=0;if(!c.material)c.material=meta.family==='ACIER'?'acier':meta.family==='COMPOSITE'?'mixte':'béton';if(!c.role)c.role='porteur';if(c.topLevel===undefined)c.topLevel='' ;if(c.baseOffset===undefined)c.baseOffset=0;if(c.topOffset===undefined)c.topOffset=0;if(!c.mark)c.mark=c.id;if(!Array.isArray(c.customProfile)||c.customProfile.length<3)c.customProfile=[[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]];return c;}
  function regularPolyPts(n,w,d,phase=-Math.PI/2){const pts=[];for(let i=0;i<n;i++){const a=phase+i*Math.PI*2/n;pts.push([Math.cos(a)*w/2,Math.sin(a)*d/2]);}return pts;}
  function rectPts(w,d){return[[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2]];}
  function rotateLocal(p,a){const co=Math.cos(a),si=Math.sin(a);return[p[0]*co-p[1]*si,p[0]*si+p[1]*co];}
  function barPoly(length,t,angle=0){return rectPts(length,t).map(p=>rotateLocal(p,angle));}
  function normalizeProfile(points){if(!points?.length)return null;const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys),w=x1-x0||1,d=y1-y0||1,cx=(x0+x1)/2,cy=(y0+y1)/2;return points.map(p=>[(p[0]-cx)/w,(p[1]-cy)/d]);}
  function originalShapeData(c){c=ensureColumnProps(c);const m=columnShapeMeta(c),w=Math.max(.05,c.width),d=Math.max(.05,c.depth),dia=Math.max(.05,c.diameter),t=Math.min(Math.max(.01,c.thickness),Math.min(w,d)/2*.9),ft=Math.min(Math.max(.01,c.flangeThickness),d/2*.9),wt=Math.min(Math.max(.01,c.webThickness),w/2*.9),k=m.kind;let solids=[],holes=[],inserts=[];
    if(k==='square'){solids=[rectPts(w,w)];}
    else if(k==='rect'){solids=[rectPts(w,d)];}
    else if(k==='circle'){solids=[regularPolyPts(32,dia,dia)];}
    else if(k==='ellipse'){solids=[regularPolyPts(32,w,d)];}
    else if(k==='triangle'){solids=[[[-w/2,d/2],[w/2,d/2],[0,-d/2]]];}
    else if(k==='trapezoid'){solids=[[[-w*.35,-d/2],[w*.35,-d/2],[w/2,d/2],[-w/2,d/2]]];}
    else if(k==='parallelogram'){solids=[[[-w*.35,-d/2],[w/2,-d/2],[w*.35,d/2],[-w/2,d/2]]];}
    else if(k.startsWith('regular')){solids=[regularPolyPts(+k.replace('regular','')||6,w,d)];}
    else if(k==='ngon'){solids=[regularPolyPts(Math.max(3,Math.min(16,Math.round(c.sides||6))),w,d)];}
    else if(k==='L'){solids=[[[ -w/2,-d/2],[ w/2,-d/2],[ w/2,-d/2+t],[-w/2+t,-d/2+t],[-w/2+t,d/2],[-w/2,d/2]]];}
    else if(k==='T'){const f=Math.min(Math.max(ft,t),d*.45),ww=Math.min(Math.max(wt,t),w*.6);solids=[[[ -w/2,-d/2],[w/2,-d/2],[w/2,-d/2+f],[ww/2,-d/2+f],[ww/2,d/2],[-ww/2,d/2],[-ww/2,-d/2+f],[-w/2,-d/2+f]]];}
    else if(k==='C'||k==='C-lipped'){solids=[[[ -w/2,-d/2],[w/2,-d/2],[w/2,-d/2+t],[-w/2+t,-d/2+t],[-w/2+t,d/2-t],[w/2,d/2-t],[w/2,d/2],[-w/2,d/2]]];if(k==='C-lipped'){solids.push(rectPts(t,d*.25).map(([x,y])=>[w/2-t/2,y-d*.35]),rectPts(t,d*.25).map(([x,y])=>[w/2-t/2,y+d*.35]));}}
    else if(k==='U'){solids=[[[ -w/2,-d/2],[w/2,-d/2],[w/2,d/2], [w/2-t,d/2],[w/2-t,-d/2+t],[-w/2+t,-d/2+t],[-w/2+t,d/2],[-w/2,d/2]]];}
    else if(k==='I'){const f=Math.min(Math.max(ft,.02),d*.45),ww=Math.min(Math.max(wt,.02),w*.6);solids=[[[ -w/2,-d/2],[w/2,-d/2],[w/2,-d/2+f],[ww/2,-d/2+f],[ww/2,d/2-f],[w/2,d/2-f],[w/2,d/2],[-w/2,d/2],[-w/2,d/2-f],[-ww/2,d/2-f],[-ww/2,-d/2+f],[-w/2,-d/2+f]]];}
    else if(k==='plus'){solids=[barPoly(w,t,0),barPoly(d,t,Math.PI/2)];}
    else if(k==='X'){solids=[barPoly(Math.max(w,d)*1.05,t,Math.PI/4),barPoly(Math.max(w,d)*1.05,t,-Math.PI/4)];}
    else if(k==='Y'){const L=Math.max(w,d)*.7;solids=[barPoly(L,t,-Math.PI/2).map(([x,y])=>[x,y-d*.15]),barPoly(L,t,Math.PI/6).map(([x,y])=>[x+w*.12,y+d*.12]),barPoly(L,t,5*Math.PI/6).map(([x,y])=>[x-w*.12,y+d*.12])];}
    else if(k==='Z'){solids=[barPoly(w,t,0).map(([x,y])=>[x,y-d/2+t/2]),barPoly(w,t,0).map(([x,y])=>[x,y+d/2-t/2]),barPoly(Math.hypot(w,d),t,Math.atan2(d,w))];}
    else if(k==='hollowRect'||k==='filledRect'){solids=[rectPts(w,d)];const iw=Math.max(.01,w-2*t),id=Math.max(.01,d-2*t);if(k==='hollowRect')holes=[rectPts(iw,id)];else inserts=[rectPts(iw,id)];}
    else if(k==='hollowCircle'||k==='filledCircle'){solids=[regularPolyPts(32,dia,dia)];const inner=Math.max(.01,dia-2*t);if(k==='hollowCircle')holes=[regularPolyPts(32,inner,inner)];else inserts=[regularPolyPts(32,inner,inner)];}
    else if(k==='hollowEllipse'){solids=[regularPolyPts(32,w,d)];holes=[regularPolyPts(32,Math.max(.01,w-2*t),Math.max(.01,d-2*t))];}
    else if(k==='hollowPoly'){const n=Math.max(3,Math.min(16,Math.round(c.sides||6)));solids=[regularPolyPts(n,w,d)];holes=[regularPolyPts(n,Math.max(.01,w-2*t),Math.max(.01,d-2*t))];}
    else if(k==='compRectH'||k==='compCircleH'||k==='compEllipseH'){if(k==='compRectH')solids=[rectPts(w,d)];if(k==='compCircleH')solids=[regularPolyPts(32,dia,dia)];if(k==='compEllipseH')solids=[regularPolyPts(32,w,d)];const bw=k==='compCircleH'?dia*.55:w*.55,bd=k==='compCircleH'?dia*.75:d*.75,ff=Math.min(Math.max(ft,.02),bd*.3),ww=Math.min(Math.max(wt,.02),bw*.45);inserts=[[[ -bw/2,-bd/2],[bw/2,-bd/2],[bw/2,-bd/2+ff],[ww/2,-bd/2+ff],[ww/2,bd/2-ff],[bw/2,bd/2-ff],[bw/2,bd/2],[-bw/2,bd/2],[-bw/2,bd/2-ff],[-ww/2,bd/2-ff],[-ww/2,-bd/2+ff],[-bw/2,-bd/2+ff]]];}
    else if(k==='irregular'){solids=[[[-w/2,-d/2],[w*.15,-d/2],[w*.15,-d*.1],[w/2,-d*.1],[w/2,d/2],[-w*.25,d/2],[-w*.25,d*.15],[-w/2,d*.15]]];}
    else {solids=[c.customProfile.map(p=>[p[0]*w,p[1]*d])];}
    return {solids,holes,inserts};
  }
  function shapeData(col){const c=deep(col);if(['hollow-shs','steel-shs','comp-filled-shs','steel-l-equal'].includes(c.shapeId))c.depth=c.width;const d=originalShapeData(c);if(columnShapeMeta(c).kind==='hollowCustom'){const outer=c.customProfile.map(p=>[p[0]*c.width,p[1]*c.depth]),hole=bridge.inset(outer,Number(c.thickness)||.06);d.solids=[outer];d.holes=hole?[hole]:[];}return d;}
  function ensurePathProps(p){if(!p)return p;p={...p};if(!Array.isArray(p.points))p.points=[];if(p.closed===undefined)p.closed=false;if(!p.name)p.name=p.closed?'Polygone':'Segment';if(!p.wallType)p.wallType='intérieur';if(p.height===undefined)p.height=3.5;if(p.thickness===undefined)p.thickness=.20;if(!p.role)p.role='guide-mur';return p;}
  function pathSegments(path){path=ensurePathProps(path);const segs=[];for(let i=1;i<path.points.length;i++)segs.push([path.points[i-1],path.points[i]]);if(path.closed&&path.points.length>2)segs.push([path.points[path.points.length-1],path.points[0]]);return segs;}
  function fd3dColumnWorldPoly(c,poly){const a=(c.angle||0)*Math.PI/180;return poly.map(pt=>{const q=rotateLocal(pt,a);return[c.p[0]+q[0],c.p[1]+q[1]];});}
  function elevationOf(id,ls){return Number(ls.find(x=>x.id===id)?.elevation)||0;}
  function vertical(o,level,ls){const z0=elevationOf(o.baseLevel||level.id,ls)+(Number(o.baseOffset)||0),z1=o.topLevel?elevationOf(o.topLevel,ls)+(Number(o.topOffset)||0):z0+(o.height!=null&&Number.isFinite(Number(o.height))?Number(o.height):Number(level.height)||0);return[z0,Math.max(z0,z1)];}
  function wallPoly(w,a=w.a,b=w.b){const L=len(a,b)||1,n=[-(b[1]-a[1])/L,(b[0]-a[0])/L],t=Number(w.thickness)||.2,side=w.orientation==='extérieur-droite'?-1:1,offset=w.lineRef==='face-intérieure'?side*t/2:w.lineRef==='face-extérieure'?-side*t/2:0;return [[a,offset+t/2],[b,offset+t/2],[b,offset-t/2],[a,offset-t/2]].map(([p,d])=>p.map((v,i)=>v+n[i]*d));}
  function stairFoot(st){const L=len(st.a,st.b)||1,u=st.a.map((v,i)=>(st.b[i]-v)/L),n=[-u[1],u[0]],half=(Number(st.width)||1.2)/2;return[[st.a,-half],[st.b,-half],[st.b,half],[st.a,half]].map(([p,d])=>p.map((v,i)=>v+n[i]*d));}
  function modelGeometry(model,level,ls,options={}){model=modelVisibleModel(modelMigrate(model));const prisms=[],surfaces=[],paths=[];const put=(poly,z0,z1,kind,id,holes=[],fill=null)=>{if(poly.length>=3&&z1>z0)prisms.push({poly,holes,z0,z1,kind,id,fill:fill||({wall:'#607c69',column:'#8da27f',stairs:'#b8b68a'}[kind]||'#849880')});};
    for(const w0 of model.walls||[]){const w=deep(w0),L=len(w.a,w.b);if(L<1e-7)continue;const[z0,z1]=vertical(w,level,ls),ops=[...(model.doors||[]),...(model.windows||[])].filter(o=>o.hostWallId===w.id).map(o=>{const center=Math.max(0,Math.min(L,(Number(o.t)||0)*L)),a=Math.max(0,center-o.width/2),b=Math.min(L,center+o.width/2),bottom=z0+(o.kind==='door'?0:Number(o.sill??.9)),top=Math.min(z1,bottom+Number(o.height||2.1));return{...o,a,b,bottom,top}});const xs=[0,L,...ops.flatMap(o=>[o.a,o.b])].sort((a,b)=>a-b).filter((n,i,a)=>!i||n-a[i-1]>1e-8),at=d=>w.a.map((v,i)=>v+(w.b[i]-v)*d/L);for(let i=1;i<xs.length;i++){const x=(xs[i-1]+xs[i])/2,voids=ops.filter(o=>x>o.a-1e-8&&x<o.b+1e-8).map(o=>[o.bottom,o.top]),zs=[z0,z1,...voids.flat()].filter(z=>z>=z0&&z<=z1).sort((a,b)=>a-b);for(let j=1;j<zs.length;j++){const z=(zs[j]+zs[j-1])/2;if(voids.some(([a,b])=>z>a&&z<b))continue;put(wallPoly(w,at(xs[i-1]),at(xs[i])),zs[j-1],zs[j],'wall',w.id,[],w.color);}}
      for(const o of ops){const a=at(o.a),b=at(o.b);surfaces.push({points:[[...a,o.bottom],[...b,o.bottom],[...b,o.top],[...a,o.top]],kind:o.kind,id:o.id,fill:o.kind==='window'?'rgba(158,202,208,.38)':'rgba(210,195,151,.6)',stroke:o.kind==='window'?'#3f7a78':'#8a7139'});}}
    for(const c0 of model.columns||[]){const col=ensureColumnProps(deep({...c0,baseLevel:c0.baseLevel||level.id})),d=shapeData(col),[z0,z1]=vertical(col,level,ls);for(const poly of d.solids)put(fd3dColumnWorldPoly(col,poly),z0,z1,'column',col.id,d.holes.map(h=>fd3dColumnWorldPoly(col,h)));for(const poly of d.inserts)put(fd3dColumnWorldPoly(col,poly),z0,z1,'column',col.id,[],'#3f5f55');}
    for(const st of model.stairs||[]){const L=len(st.a,st.b);if(!L)continue;const z0=(Number(level.elevation)||0)+(Number(st.baseOffset)||0),H=st.height!=null&&Number.isFinite(Number(st.height))?Number(st.height):Number(level.height)||0,n=Math.max(2,Math.min(200,Math.round(st.risers||st.steps||12))),treads=st.risers?n-1:n,foot=stairFoot(st),at=(a,b,t)=>a.map((v,j)=>v+(b[j]-v)*t);for(let i=0;i<treads;i++){const a=at(foot[0],foot[1],i/treads),b=at(foot[0],foot[1],(i+1)/treads),c=at(foot[3],foot[2],(i+1)/treads),d=at(foot[3],foot[2],i/treads),top=z0+H*(i+1)/n;if(!st.planReferenceOnly||(st.incomingDisplay&&options.includeIncoming))put([a,b,c,d],st.waistThickness?z0+H*i/n-Number(st.waistThickness):z0,top,'stairs',st.id);if(st.risers)paths.push({points:[a,d],kind:'stairs',id:st.id,z:z0,stroke:'#486c5c',planOnly:true,dash:st.planReferenceOnly?'4 3':(z0+H*i/n>(Number(level.elevation)||0)+1.2?'4 3':null)});}if(st.risers){paths.push({points:foot,closed:true,kind:'stairs',id:st.id,z:z0,stroke:'#486c5c',planOnly:true,dash:st.planReferenceOnly?'4 3':null});const u=st.a.map((v,i)=>(st.b[i]-v)/L),end=st.b.map((v,i)=>v-u[i]*.16),normal=[-u[1],u[0]];paths.push({points:[st.a,end,end.map((v,i)=>v-u[i]*.22+normal[i]*.13),end,end.map((v,i)=>v-u[i]*.22-normal[i]*.13)],kind:'stairs',id:st.id,z:z0,stroke:'#ae6944',planOnly:true});}}
    for(const p of model.paths||[])if(p.points?.length>1){if(p.planOnly&&!(p.incomingDisplay&&options.includeIncoming)){paths.push({points:p.points,closed:p.closed,kind:'stairs',id:p.id,z:Number(level.elevation)||0,stroke:'#6a8176',dash:'4 3',planOnly:true});continue;}const g=modelPathGeometry(p,level,ls);prisms.push(...g.prisms);surfaces.push(...g.surfaces);paths.push(...g.paths);}paths.push(...modelAnnotationPaths(model,level));return {prisms,surfaces,paths};
  }
  function polyIntervals(poly,axis,value){const vals=[];const other=1-axis;for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length];if((a[axis]<=value&&b[axis]>value)||(b[axis]<=value&&a[axis]>value)){const t=(value-a[axis])/(b[axis]-a[axis]);vals.push(a[other]+t*(b[other]-a[other]));}}vals.sort((a,b)=>a-b);const out=[];for(let i=1;i<vals.length;i+=2)if(vals[i]-vals[i-1]>1e-8)out.push([vals[i-1],vals[i]]);return out;}
  function subtractIntervals(source,holes){let result=source;for(const [a,b] of holes){const out=[];for(const [x,y] of result){if(b<=x||a>=y)out.push([x,y]);else{if(a>x)out.push([x,a]);if(b<y)out.push([b,y]);}}result=out;}return result;}
  function solidZ(s,p,top){
   const zs=top?s.topZ:s.bottomZ;if(!zs)return top?s.z1:s.z0;
   const a=s.poly[0];for(let i=1;i<s.poly.length-1;i++){
    const b=s.poly[i],c=s.poly[i+1],u=[b[0]-a[0],b[1]-a[1]],v=[c[0]-a[0],c[1]-a[1]],d=u[0]*v[1]-u[1]*v[0];if(Math.abs(d)<1e-10)continue;
    const x=p[0]-a[0],y=p[1]-a[1];return zs[0]+((x*v[1]-y*v[0])*(zs[i]-zs[0])+(u[0]*y-u[1]*x)*(zs[i+1]-zs[0]))/d;
   }return zs[0];
  }
  function cutPrism(s,axis,value){return subtractIntervals(polyIntervals(s.poly,axis,value),s.holes.flatMap(h=>polyIntervals(h,axis,value))).map(([a,b])=>{
   const r={a,b,z0:s.z0,z1:s.z1,kind:s.kind,id:s.id};
   if(s.bottomZ){const p=t=>axis?[t,value]:[value,t];r.profile=[[a,solidZ(s,p(a),false)],[b,solidZ(s,p(b),false)],[b,solidZ(s,p(b),true)],[a,solidZ(s,p(a),true)]];}return r;
  });}
  function prismFaces(s){
   const f=[],point=(p,top)=>[...p,solidZ(s,p,top)];
   for(const top of [false,true])f.push({points:s.poly.map(p=>point(p,top)),holes:s.holes.map(h=>h.map(p=>point(p,top))),fill:s.fill,stroke:'#294a3b',kind:s.kind,id:s.id});
   for(const loop of [s.poly,...s.holes])for(let i=0;i<loop.length;i++){const a=loop[i],b=loop[(i+1)%loop.length];f.push({points:[point(a,false),point(b,false),point(b,true),point(a,true)],fill:s.fill,stroke:'#294a3b',kind:s.kind,id:s.id});}return f;
  }
  function drawFaces(ctx,faces,project){faces.sort((a,b)=>a.points.reduce((s,p)=>s+project(p)[2],0)/a.points.length-b.points.reduce((s,p)=>s+project(p)[2],0)/b.points.length);for(const f of faces){ctx.beginPath();for(const loop of [f.points,...(f.holes||[])]){loop.forEach((p,i)=>{const q=project(p);i?ctx.lineTo(q[0],q[1]):ctx.moveTo(q[0],q[1]);});ctx.closePath();}ctx.fillStyle=f.fill;ctx.fill('evenodd');ctx.strokeStyle=f.stroke||'#294a3b';ctx.lineWidth=f.selected?2:1;ctx.stroke();}}
  function modelEnsure(m){for(const group of Object.values(MODEL_GROUPS))if(!Array.isArray(m[group]))m[group]=[];m.layers={...deep(MODEL_LAYERS),...(m.layers||{})};m.activeLayer=m.activeLayer&&m.layers[m.activeLayer]?m.activeLayer:'Murs';return m;}
  function modelFind(kind,key,model={}){return model?.[MODEL_GROUPS[kind]]?.find(o=>o.id===key);}
  function modelLayer(kind,o){return o?.layer||(kind==='wall'?(o.type==='cloison'?'Cloisons':'Murs'):kind==='column'?'Poteaux':kind==='door'||kind==='window'?'Ouvertures':kind==='dim'?'Cotations':kind==='text'?'Annotations':kind==='stairs'?'Mobilier':'Murs');}
  function modelVisible(kind,o,model={}){return model?.layers?.[modelLayer(kind,o)]?.visible!==false;}
  function modelVisibleModel(model){const out={...model};for(const [kind,group]of Object.entries(MODEL_GROUPS))out[group]=(model[group]||[]).filter(o=>modelVisible(kind,o,model));return out;}
  function modelLinearPoly(a,b,width){const L=len(a,b)||1,n=[-(b[1]-a[1])/L*width/2,(b[0]-a[0])/L*width/2];return[[a,1],[b,1],[b,-1],[a,-1]].map(([p,s])=>p.map((v,i)=>v+s*n[i]));}
  function modelPathPolys(p){if(p.closed&&p.points.length>=3)return[p.points];return pathSegments(p).map(([a,b])=>modelLinearPoly(a,b,Math.max(.001,Number(p.thickness)||.1)));}
  function modelFrame(kind,o){
   let a,b,v,w,linear=false;
   if(kind==='wall'||kind==='stairs'){a=o.a;b=o.b;w=kind==='wall'?(o.thickness??.2):(o.width??1.2);linear=true;}
   else if(kind==='path'&&o.points?.length===2&&!o.closed){[a,b]=o.points;w=o.thickness??.1;linear=true;}
   else if(kind==='path'&&o.closed&&o.points?.length===4){[a,b]=o.points;const d=o.points[3],u=b.map((x,i)=>x-a[i]);w=len(a,d);if(w<1e-9||Math.abs(u[0]*(d[0]-a[0])+u[1]*(d[1]-a[1]))>1e-6*len(a,b)*w||len(o.points[2],b.map((x,i)=>x+d[i]-a[i]))>1e-6)return null;v=d.map((x,i)=>(x-a[i])/w);}
   else if(kind==='column'){const t=(o.angle||0)*Math.PI/180;return{a:o.p,u:[Math.cos(t),Math.sin(t)],v:[-Math.sin(t),Math.cos(t)],length:o.width||o.diameter||.4,width:o.depth||o.diameter||.4,column:true};}
   else return null;
   const L=len(a,b);if(L<1e-9)return null;const u=b.map((x,i)=>(x-a[i])/L);return{a:[...a],u,v:v||[-u[1],u[0]],length:L,width:w,linear};
  }
  function modelResolve(ref,fallback,model={}){const o=ref&&modelFind(ref.kind||'path',ref.id,model);const points=o?.points||(o?.a&&o?.b?[o.a,o.b]:o?.p?[o.p]:null);return points?.[ref?.i]||fallback;}
  function modelDimensionGeometry(d,model={}){const a=modelResolve(d.aRef,d.a,model),b=modelResolve(d.bRef,d.b,model),L=len(a,b);if(L<1e-9)return null;const u=b.map((x,i)=>(x-a[i])/L),n=[-u[1],u[0]],off=d.offset??.6,A=a.map((x,i)=>x+n[i]*off),B=b.map((x,i)=>x+n[i]*off),tick=p=>[p.map((v,i)=>v-(u[i]+n[i])*.08),p.map((v,i)=>v+(u[i]+n[i])*.08)];return{lines:[[a,A],[A,B],[b,B],tick(A),tick(B)],at:mid(A,B),text:L.toFixed(2)+' m',angle:Math.atan2(u[1],u[0])};}
  function modelPathGeometry(p,level,ls){
   const prisms=[],surfaces=[],paths=[],polys=modelPathPolys(p),base=Number(level.elevation)||0,h=p.cadSolid?Math.max(0,Number(p.height)||0):0,z0=base+(Number(p.baseOffset)||0),polyHoles=(p.holes||[]).filter(x=>x.kind==='poly').map(x=>x.poly),rects=(p.holes||[]).filter(x=>x.kind==='rect');
   const put=(poly,a,b,holes=[])=>{if(b>a+1e-8)prisms.push({poly,holes,z0:a,z1:b,kind:'path',id:p.id,fill:p.color||'#8da27f'});};
   if(p.closed&&p.vertexOffsets?.length===p.points.length&&p.vertexOffsets.every(Number.isFinite)){
    const bottomZ=p.vertexOffsets.map(z=>z0+z),topZ=p.topOffsets?.length===p.points.length?p.topOffsets.map(z=>z0+z):bottomZ.map(z=>z+h);
    prisms.push({poly:p.points,holes:polyHoles,z0:Math.min(...bottomZ),z1:Math.max(...topZ),bottomZ,topZ,kind:'path',id:p.id,fill:p.color||'#bdad86',siteAccess:!!p.siteAccess,role:p.role});
    paths.push({id:p.id,kind:'path',points:p.points,closed:true,z:Math.max(...topZ),stroke:p.color||'#557060',siteAccess:!!p.siteAccess});return{prisms,surfaces,paths};
   }
   const f=modelFrame('path',p);
   if(h>0&&f&&rects.length){
    const a=f.linear?f.a:f.a.map((v,i)=>v+f.v[i]*f.width/2),L=f.length,at=t=>a.map((v,i)=>v+f.u[i]*t);
    const ops=rects.map(o=>{const t=(o.x-a[0])*f.u[0]+(o.y-a[1])*f.u[1];return{a:Math.max(0,t-o.w/2),b:Math.min(L,t+o.w/2),bottom:Math.max(0,o.sill||0),top:Math.min(h,(o.sill||0)+o.h)};}).filter(o=>o.b>o.a&&o.top>o.bottom);
    const xs=[...new Set([0,L,...ops.flatMap(o=>[o.a,o.b])])].sort((a,b)=>a-b);
    for(let i=1;i<xs.length;i++){const x=(xs[i-1]+xs[i])/2,voids=ops.filter(o=>x>o.a&&x<o.b),zs=[...new Set([0,h,...voids.flatMap(o=>[o.bottom,o.top])])].sort((a,b)=>a-b);for(let j=1;j<zs.length;j++){const z=(zs[j-1]+zs[j])/2;if(!voids.some(o=>z>o.bottom&&z<o.top))put(modelLinearPoly(at(xs[i-1]),at(xs[i]),f.width),z0+zs[j-1],z0+zs[j]);}}
   }else for(const poly of polys)if(h>0)put(poly,z0,z0+h,p.closed?polyHoles:[]);
   if(h===0)for(const poly of polys)surfaces.push({id:p.id,kind:'path',points:poly.map(q=>[...q,z0]),holes:(p.closed?polyHoles:[]).map(poly=>poly.map(q=>[...q,z0])),fill:p.color||'#dbe5bf',stroke:'#557060'});
   for(const poly of polys)paths.push({id:p.id,kind:'path',points:poly,closed:true,z:z0,stroke:p.color||'#557060'});
   for(const poly of polyHoles)paths.push({id:p.id,kind:'path',points:poly,closed:true,z:z0,stroke:p.color||'#557060'});
   return{prisms,surfaces,paths};
  }
  function modelAnnotationPaths(model,level){const out=[],z=Number(level.elevation)||0;
   for(const d of model.dims||[]){if(!modelVisible('dim',d,model))continue;const g=modelDimensionGeometry(d,model);if(!g)continue;for(const points of g.lines)out.push({id:d.id,siteAccess:!!d.siteAccess,kind:'dim',points,closed:false,z,stroke:'#c0392b'});out.push({id:d.id,siteAccess:!!d.siteAccess,kind:'dim',points:[g.at],text:g.text,angle:g.angle,z,stroke:'#c0392b'});}
   for(const t of model.texts||[])if(modelVisible('text',t,model))out.push({id:t.id,siteAccess:!!t.siteAccess,kind:'text',points:[[t.x,t.y]],text:t.text,angle:0,z,stroke:'#2c3e50'});return out;
  }
  function modelMigrate(model){
   if(!model?.atelierV85||model.meta?.atelierV85Migrated)return model;
   const m=modelEnsure(deep(model)),v=m.atelierV85,map=new Map();
   for(const o of v.o||[]){const key='v85-'+String(o.id);map.set(o.id,key);m.paths.push({id:key,kind:'path',name:o.kind||'Objet',points:deep(o.p),closed:o.p.length>2,thickness:o.width??.1,height:o.h||0,cadSolid:true,layer:o.layer,holes:deep(o.holes||[]),role:'solid'});}
   const ref=r=>r&&map.has(r.id)?{kind:'path',id:map.get(r.id),i:r.i}:undefined;
   for(const d of v.dims||[])m.dims.push({...deep(d),id:'v85-'+d.id,aRef:ref(d.aRef),bRef:ref(d.bRef),kind:'dim',layer:'Cotations'});
   for(const t of v.texts||[])m.texts.push({...deep(t),id:'v85-'+t.id,kind:'text',layer:'Annotations'});
   m.layers={...m.layers,...deep(v.layers||{})};m.meta={...m.meta,atelierV85Migrated:true,atelierV85Backup:deep(v)};delete m.atelierV85;return m;
  }
  const MODEL_LAYERS={Murs:{color:'#36594a',fill:'#dbe5bf',visible:true,locked:false},Cloisons:{color:'#557060',fill:'#e8eed4',visible:true,locked:false},Poteaux:{color:'#203f35',fill:'#9caf8c',visible:true,locked:false},Ouvertures:{color:'#1683df',fill:'#b8d4e8',visible:true,locked:false},Mobilier:{color:'#8b5a2b',fill:'#d4b48c',visible:true,locked:false},Cotations:{color:'#c0392b',fill:null,visible:true,locked:false},Annotations:{color:'#2c3e50',fill:null,visible:true,locked:false}};
  const MODEL_GROUPS={wall:'walls',column:'columns',path:'paths',door:'doors',window:'windows',stairs:'stairs',dim:'dims',text:'texts'};
 window.V14Geometry={solidZ,vertical,model:modelGeometry,faces:prismFaces,draw:drawFaces,cut:cutPrism,intervals:polyIntervals,subtract:subtractIntervals,shape:c=>shapeData(deep(c)),columnPoly:fd3dColumnWorldPoly,wallPoly,stairFoot};
 bridge.render();
})();
/* Native workshop drawing tools. No separate editor or additional drawing surface. */
(()=>{'use strict';
const bridge=window.V14Bridge,G=window.V14Geometry,$=q=>document.querySelector(q),$$=q=>[...document.querySelectorAll(q)],deep=v=>JSON.parse(JSON.stringify(v));
const len=(a,b)=>Math.hypot(b[0]-a[0],b[1]-a[1]),mid=(a,b)=>a.map((v,i)=>(v+b[i])/2),id=prefix=>prefix+'-'+(globalThis.crypto?.randomUUID?.()||Date.now()+'-'+Math.random().toString(36).slice(2));
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pointSegDistance=(p,a,b)=>{const v=b.map((x,i)=>x-a[i]),n=v[0]**2+v[1]**2,t=Math.max(0,Math.min(1,((p[0]-a[0])*v[0]+(p[1]-a[1])*v[1])/(n||1)));return len(p,a.map((x,i)=>x+t*v[i]));};
const pointOnSegment=(p,a,b)=>pointSegDistance(p,a,b)<1e-7;
const pathSegments=p=>p.points.slice(0,p.closed?p.points.length:-1).map((a,i)=>[a,p.points[(i+1)%p.points.length]]);
const vertical=G.vertical;
let levels=[],committed=null,recorded=null,contextKey='',panelKey='',painting=false;
const S={model:null,level:null,selected:null,tool:'select',mode:'3d',undo:[],redo:[],snap:true,gridSize:.5,view:{scale:1}},histories=new Map();
const wallById=key=>S.model?.walls.find(x=>x.id===key);
const obj=()=>{if(!S.selected)return null;const split=S.selected.indexOf(':'),kind=S.selected.slice(0,split),key=S.selected.slice(split+1),item=fdFind(kind,key);return item?{kind,id:key,item}:null;};
function suHelp(text){const el=$('#atelier-tool-status');if(el)el.textContent=text;}
function fdProjector(){return bridge.cad.project()||(()=>[0,0,0,1]);}
function fdActivate(tool){activate(tool);}
function render(){bridge.render();renderPanel();}
function fdCancel(){cancel();}
function ensureContext(){
 const c=bridge.cad.context(),key=JSON.stringify([c.project,c.level]);S.mode=c.mode;levels=bridge.levels();
 if(key!==contextKey){CAD.gesture=null;CAD.pending=null;CAD.preview=null;bridge.cad.preview(null);contextKey=key;S.level=c.level;S.selected=null;recorded=deep(bridge.model(c.level)||{});S.model=fdEnsure(fdMigrate(deep(recorded)));committed=deep(S.model);if(!histories.has(key))histories.set(key,{undo:[],redo:[]});Object.assign(S,histories.get(key));panelKey='';}
 return !!(c.project&&c.level&&bridge.parcel());
}
function cancel(){CAD.gesture=null;CAD.pending=null;CAD.preview=null;if(committed)S.model=deep(committed);bridge.cad.preview(null);}
function persist(){
 const error=fdValidate();if(error){S.model=deep(committed);bridge.cad.preview(null);suHelp(error);S.undo.pop();return false;}
 try{bridge.saveModel(S.level,deep(S.model),{deferRender:true});committed=deep(S.model);recorded=deep(S.model);bridge.cad.preview(null);histories.set(contextKey,{undo:S.undo,redo:S.redo});return true;}catch(e){S.model=deep(committed);S.undo.pop();bridge.cad.preview(null);suHelp('Enregistrement impossible : '+e.message);return false;}
}
function fdValidate(){
 const ids=new Set();for(const {kind,item:o}of fdEntries()){
  if(ids.has(String(o.id)))return 'Identifiant dupliqué.';ids.add(String(o.id));
  const old=fdFind(kind,o.id,committed);if(JSON.stringify(old)===JSON.stringify(o))continue;
  const L=committed?.layers?.[fdLayer(kind,old||o)],N=S.model.layers[fdLayer(kind,o)];if(L?.locked||L?.visible===false||N?.locked||N?.visible===false)return 'Calque masqué ou verrouillé.';
  const points=o.points||(o.a&&o.b?[o.a,o.b]:o.p?[o.p]:kind==='text'?[[o.x,o.y]]:[]);
  if(points.some(p=>!Array.isArray(p)||p.length!==2||p.some(v=>!Number.isFinite(v)||Math.abs(v)>1e7)))return 'Coordonnées invalides.';
  if(['wall','path','column','stairs'].includes(kind)&&(!Number.isFinite(fdHeight(kind,o))||fdHeight(kind,o)<0))return 'Hauteur invalide.';
  if(o.height!==undefined&&(!Number.isFinite(o.height)||o.height<0||o.height>1e6))return 'Hauteur invalide.';
  if((kind==='wall'||kind==='path')&&(!Number.isFinite(o.thickness)||o.thickness<.001))return 'Épaisseur minimale : 0,001 m.';
  if(kind==='path'&&o.vertexOffsets&&(!Array.isArray(o.vertexOffsets)||o.vertexOffsets.length!==o.points.length||o.vertexOffsets.some(z=>!Number.isFinite(z))))return 'Profil de pente invalide.';
  if(kind==='path'&&o.topOffsets&&(!Array.isArray(o.topOffsets)||o.topOffsets.length!==o.points.length||o.topOffsets.some((z,i)=>!Number.isFinite(z)||z<=o.vertexOffsets[i])))return 'Profil supérieur invalide.';
  if(kind==='path'&&o.points.length<2)return 'Deux points distincts sont requis.';
  if((kind==='wall'||kind==='stairs')&&len(o.a,o.b)<.01)return 'Longueur minimale : 0,01 m.';
  for(const h of o.holes||[]){if(h.kind==='poly'&&(!o.closed||!h.poly.every(p=>fdInside(p,o.points))))return 'La coque dépasse son contour.';if(h.kind==='rect'){const f=fdFrame(kind,o),t=f&&(h.x-f.a[0])*f.u[0]+(h.y-f.a[1])*f.u[1];if(!f||h.w<=0||h.h<=0||h.sill<0||t<h.w/2-1e-7||t+h.w/2>f.length+1e-7||h.sill+h.h>fdHeight(kind,o)+1e-7)return 'Le percement dépasse son objet.';}}
 }
 for(const {kind,item:o}of fdEntries(committed))if(!fdFind(kind,o.id)&&(committed.layers[fdLayer(kind,o)]?.locked||committed.layers[fdLayer(kind,o)]?.visible===false))return 'Objet verrouillé : suppression refusée.';
 for(const o of [...S.model.doors,...S.model.windows]){const w=wallById(o.hostWallId);if(!w)return 'Mur hôte absent.';const L=len(w.a,w.b),t=o.t*L;if(![o.width,o.height,o.sill??0,o.t].every(Number.isFinite)||o.width<=0||o.height<=0||t<o.width/2-1e-7||t+o.width/2>L+1e-7||(o.sill||0)<0||(o.sill||0)+o.height>fdHeight('wall',w)+1e-7)return 'L’ouverture dépasse son mur.';}
 return null;
}
  const FD_CAD_LAYERS={Murs:{color:'#36594a',fill:'#dbe5bf',visible:true,locked:false},Cloisons:{color:'#557060',fill:'#e8eed4',visible:true,locked:false},Poteaux:{color:'#203f35',fill:'#9caf8c',visible:true,locked:false},Ouvertures:{color:'#1683df',fill:'#b8d4e8',visible:true,locked:false},Mobilier:{color:'#8b5a2b',fill:'#d4b48c',visible:true,locked:false},Cotations:{color:'#c0392b',fill:null,visible:true,locked:false},Annotations:{color:'#2c3e50',fill:null,visible:true,locked:false}};
  const FD_CAD_GROUPS={wall:'walls',column:'columns',path:'paths',door:'doors',window:'windows',stairs:'stairs',dim:'dims',text:'texts'};
  const CAD={axis:'auto',lastAxis:'length',panel:null,gesture:null,pending:null,preview:null,measure:null,pointers:new Map(),navigation:false,axes:true,extrudeMode:'shell',snapRef:null};
  function fdEnsure(m){for(const group of Object.values(FD_CAD_GROUPS))if(!Array.isArray(m[group]))m[group]=[];m.layers={...deep(FD_CAD_LAYERS),...(m.layers||{})};m.activeLayer=m.activeLayer&&m.layers[m.activeLayer]?m.activeLayer:'Murs';return m;}
  const fdClamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const fdNumber=v=>{const s=String(v??'').trim().replace(',','.');return s===''?NaN:Number(s);};
  function fdFind(kind,key,model=S.model){return model?.[FD_CAD_GROUPS[kind]]?.find(o=>o.id===key);}
  function fdLayer(kind,o){return o?.layer||(kind==='wall'?(o.type==='cloison'?'Cloisons':'Murs'):kind==='column'?'Poteaux':kind==='door'||kind==='window'?'Ouvertures':kind==='dim'?'Cotations':kind==='text'?'Annotations':kind==='stairs'?'Mobilier':'Murs');}
  function fdVisible(kind,o,model=S.model){return model?.layers?.[fdLayer(kind,o)]?.visible!==false;}
  function fdWritable(kind,o,model=S.model){const layer=model?.layers?.[fdLayer(kind,o)];if(layer?.locked||layer?.visible===false){suHelp('Calque masqué ou verrouillé : modification impossible.');return false;}return true;}
  function fdVisibleModel(model){const out={...model};for(const [kind,group]of Object.entries(FD_CAD_GROUPS))out[group]=(model[group]||[]).filter(o=>fdVisible(kind,o,model));return out;}
  function fdEntries(model=S.model){return Object.entries(FD_CAD_GROUPS).flatMap(([kind,group])=>(model?.[group]||[]).map(item=>({kind,item,id:item.id})));}
  function fdInside(p,poly){let yes=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if(pointOnSegment(p,a,b))return true;if(((a[1]>p[1])!==(b[1]>p[1]))&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;}
  function fdArea(poly){return Math.abs(poly.reduce((s,p,i)=>s+p[0]*poly[(i+1)%poly.length][1]-poly[(i+1)%poly.length][0]*p[1],0))/2;}
  function fdOffset(poly,dist){
   if(poly.length<3)throw Error('Un polygone fermé est requis.');
   const signed=poly.reduce((s,p,i)=>s+p[0]*poly[(i+1)%poly.length][1]-poly[(i+1)%poly.length][0]*p[1],0),sign=Math.sign(signed),lines=[];
   if(!sign)throw Error('Polygone dégénéré.');
   for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],c=poly[(i+2)%poly.length],u=[b[0]-a[0],b[1]-a[1]],L=len(a,b),cross=u[0]*(c[1]-b[1])-u[1]*(c[0]-b[0]);if(L<1e-8||cross*sign<=1e-9)throw Error('Le décalage exige un polygone strictement convexe.');const n=[sign*u[1]/L,-sign*u[0]/L];lines.push({a:a.map((v,j)=>v+n[j]*dist),u,n});}
   const out=lines.map((l,i)=>{const k=lines[(i+lines.length-1)%lines.length],den=k.u[0]*l.u[1]-k.u[1]*l.u[0];if(Math.abs(den)<1e-9)throw Error('Arêtes incompatibles.');const t=((l.a[0]-k.a[0])*l.u[1]-(l.a[1]-k.a[1])*l.u[0])/den;return k.a.map((v,j)=>v+t*k.u[j]);});
   if(fdArea(out)<1e-8||out.some(p=>p.some(v=>!Number.isFinite(v))||lines.some(l=>(p[0]-l.a[0])*l.n[0]+(p[1]-l.a[1])*l.n[1]>1e-7)))throw Error('Distance trop grande : le polygone se referme.');return out;
  }
  function fdLinearPoly(a,b,width){const L=len(a,b)||1,n=[-(b[1]-a[1])/L*width/2,(b[0]-a[0])/L*width/2];return[[a,1],[b,1],[b,-1],[a,-1]].map(([p,s])=>p.map((v,i)=>v+s*n[i]));}
  function fdPathPolys(p){if(p.closed&&p.points.length>=3)return[p.points];return pathSegments(p).map(([a,b])=>fdLinearPoly(a,b,Math.max(.001,Number(p.thickness)||.1)));}
  function fdFrame(kind,o){
   let a,b,v,w,linear=false;
   if(kind==='wall'||kind==='stairs'){a=o.a;b=o.b;w=kind==='wall'?(o.thickness??.2):(o.width??1.2);linear=true;}
   else if(kind==='path'&&o.points?.length===2&&!o.closed){[a,b]=o.points;w=o.thickness??.1;linear=true;}
   else if(kind==='path'&&o.closed&&o.points?.length===4){[a,b]=o.points;const d=o.points[3],u=b.map((x,i)=>x-a[i]);w=len(a,d);if(w<1e-9||Math.abs(u[0]*(d[0]-a[0])+u[1]*(d[1]-a[1]))>1e-6*len(a,b)*w||len(o.points[2],b.map((x,i)=>x+d[i]-a[i]))>1e-6)return null;v=d.map((x,i)=>(x-a[i])/w);}
   else if(kind==='column'){const t=(o.angle||0)*Math.PI/180;return{a:o.p,u:[Math.cos(t),Math.sin(t)],v:[-Math.sin(t),Math.cos(t)],length:o.width||o.diameter||.4,width:o.depth||o.diameter||.4,column:true};}
   else return null;
   const L=len(a,b);if(L<1e-9)return null;const u=b.map((x,i)=>(x-a[i])/L);return{a:[...a],u,v:v||[-u[1],u[0]],length:L,width:w,linear};
  }
  function fdHeight(kind,o,level=levels.find(l=>l.id===S.level),ls=levels){if(['wall','column'].includes(kind)){const [z0,z1]=vertical(o,level||{id:S.level,height:3},ls);return z1-z0;}return Math.max(0,Number(o.height)||0);}
  function fdDimension(kind,o,axis){const f=fdFrame(kind,o);return axis==='height'?fdHeight(kind,o):f?.[axis]??null;}
  function fdTransform(o,fn){if(o.a)o.a=fn(o.a);if(o.b)o.b=fn(o.b);if(o.p)o.p=fn(o.p);if(o.points)o.points=o.points.map(fn);if(o.kind==='text'){const p=fn([o.x,o.y]);o.x=p[0];o.y=p[1];}if(o.holes)o.holes=o.holes.map(h=>h.kind==='poly'?{...h,poly:h.poly.map(fn)}:{...h,...(()=>{const p=fn([h.x,h.y]);return{x:p[0],y:p[1]};})()});}
  function fdResize(kind,o,axis,value){
   if(!Number.isFinite(value)||value<(axis==='height'?0:.001)||value>1e6)throw Error('Dimension invalide.');
   if(axis==='height'){o.height=value;if(kind==='path')o.cadSolid=true;if('topLevel'in o)o.topLevel='';return;}
   const f=fdFrame(kind,o);if(!f)throw Error('Longueur / largeur : sélectionnez une ligne, un mur ou un rectangle.');
   const old=axis==='length'?f.length:f.width,ratio=value/old,dir=axis==='length'?f.u:f.v;
   if(f.column){if(axis==='length')o.width=value;else o.depth=value;return;}
   const transform=p=>{const t=(p[0]-f.a[0])*dir[0]+(p[1]-f.a[1])*dir[1];return p.map((v,i)=>v+dir[i]*t*(ratio-1));};
   if(f.linear){if(axis==='length'){if(kind==='path')o.points=[o.points[0],transform(o.points[1])];else o.b=transform(o.b);}else if(kind==='stairs')o.width=value;else o.thickness=value;}
   else o.points=o.points.map(transform);
   if(o.holes)for(const h of o.holes){if(h.kind==='poly'){h.poly=h.thick?fdOffset(o.points,-h.thick):h.poly.map(transform);}else{const p=transform([h.x,h.y]);h.x=p[0];h.y=p[1];}}
   o.cadSolid=true;
  }
  function fdResolve(ref,fallback,model=S.model){const o=ref&&fdFind(ref.kind||'path',ref.id,model);const points=o?.points||(o?.a&&o?.b?[o.a,o.b]:o?.p?[o.p]:null);return points?.[ref?.i]||fallback;}
  function fdDimensionGeometry(d,model=S.model){const a=fdResolve(d.aRef,d.a,model),b=fdResolve(d.bRef,d.b,model),L=len(a,b);if(L<1e-9)return null;const u=b.map((x,i)=>(x-a[i])/L),n=[-u[1],u[0]],off=d.offset??.6,A=a.map((x,i)=>x+n[i]*off),B=b.map((x,i)=>x+n[i]*off),tick=p=>[p.map((v,i)=>v-(u[i]+n[i])*.08),p.map((v,i)=>v+(u[i]+n[i])*.08)];return{lines:[[a,A],[A,B],[b,B],tick(A),tick(B)],at:mid(A,B),text:L.toFixed(2)+' m',angle:Math.atan2(u[1],u[0])};}
  function fdPathGeometry(p,level,ls){
   const prisms=[],surfaces=[],paths=[],polys=fdPathPolys(p),base=Number(level.elevation)||0,h=p.cadSolid?Math.max(0,Number(p.height)||0):0,z0=base+(Number(p.baseOffset)||0),polyHoles=(p.holes||[]).filter(x=>x.kind==='poly').map(x=>x.poly),rects=(p.holes||[]).filter(x=>x.kind==='rect');
   const put=(poly,a,b,holes=[])=>{if(b>a+1e-8)prisms.push({poly,holes,z0:a,z1:b,kind:'path',id:p.id,fill:p.color||'#8da27f'});};
   const f=fdFrame('path',p);
   if(h>0&&f&&rects.length){
    const a=f.linear?f.a:f.a.map((v,i)=>v+f.v[i]*f.width/2),L=f.length,at=t=>a.map((v,i)=>v+f.u[i]*t);
    const ops=rects.map(o=>{const t=(o.x-a[0])*f.u[0]+(o.y-a[1])*f.u[1];return{a:Math.max(0,t-o.w/2),b:Math.min(L,t+o.w/2),bottom:Math.max(0,o.sill||0),top:Math.min(h,(o.sill||0)+o.h)};}).filter(o=>o.b>o.a&&o.top>o.bottom);
    const xs=[...new Set([0,L,...ops.flatMap(o=>[o.a,o.b])])].sort((a,b)=>a-b);
    for(let i=1;i<xs.length;i++){const x=(xs[i-1]+xs[i])/2,voids=ops.filter(o=>x>o.a&&x<o.b),zs=[...new Set([0,h,...voids.flatMap(o=>[o.bottom,o.top])])].sort((a,b)=>a-b);for(let j=1;j<zs.length;j++){const z=(zs[j-1]+zs[j])/2;if(!voids.some(o=>z>o.bottom&&z<o.top))put(fdLinearPoly(at(xs[i-1]),at(xs[i]),f.width),z0+zs[j-1],z0+zs[j]);}}
   }else for(const poly of polys)if(h>0)put(poly,z0,z0+h,p.closed?polyHoles:[]);
   for(const poly of polys)paths.push({id:p.id,kind:'path',points:poly,closed:true,z:z0,stroke:p.color||'#557060'});
   for(const poly of polyHoles)paths.push({id:p.id,kind:'path',points:poly,closed:true,z:z0,stroke:p.color||'#557060'});
   return{prisms,surfaces,paths};
  }
  function fdAnnotationPaths(model,level){const out=[],z=Number(level.elevation)||0;
   for(const d of model.dims||[]){if(!fdVisible('dim',d,model))continue;const g=fdDimensionGeometry(d,model);if(!g)continue;for(const points of g.lines)out.push({id:d.id,siteAccess:!!d.siteAccess,kind:'dim',points,closed:false,z,stroke:'#c0392b'});out.push({id:d.id,siteAccess:!!d.siteAccess,kind:'dim',points:[g.at],text:g.text,angle:g.angle,z,stroke:'#c0392b'});}
   for(const t of model.texts||[])if(fdVisible('text',t,model))out.push({id:t.id,siteAccess:!!t.siteAccess,kind:'text',points:[[t.x,t.y]],text:t.text,angle:0,z,stroke:'#2c3e50'});return out;
  }
  function fdMigrate(model){
   if(!model?.atelierV85||model.meta?.atelierV85Migrated)return model;
   const m=fdEnsure(deep(model)),v=m.atelierV85,map=new Map();
   for(const o of v.o||[]){const key='v85-'+String(o.id);map.set(o.id,key);m.paths.push({id:key,kind:'path',name:o.kind||'Objet',points:deep(o.p),closed:o.p.length>2,thickness:o.width??.1,height:o.h||0,cadSolid:true,layer:o.layer,holes:deep(o.holes||[]),role:'solid'});}
   const ref=r=>r&&map.has(r.id)?{kind:'path',id:map.get(r.id),i:r.i}:undefined;
   for(const d of v.dims||[])m.dims.push({...deep(d),id:'v85-'+d.id,aRef:ref(d.aRef),bRef:ref(d.bRef),kind:'dim',layer:'Cotations'});
   for(const t of v.texts||[])m.texts.push({...deep(t),id:'v85-'+t.id,kind:'text',layer:'Annotations'});
   m.layers={...m.layers,...deep(v.layers||{})};m.meta={...m.meta,atelierV85Migrated:true,atelierV85Backup:deep(v)};delete m.atelierV85;return m;
  }
  function fdCommit(before,selection=S.selected){
   if(JSON.stringify(before)===JSON.stringify(S.model))return true;
   // Reject invalid edits before allocating a copy. Copy the persisted source, not
   // the gesture preview, and restore the candidate after native context rebinding.
   const error=fdValidate();if(error){S.model=deep(before);bridge.cad.preview(null);suHelp(error);render();return false;}
   const candidate=deep(S.model),tool=S.tool,panel=CAD.panel,historyBefore=deep(recorded||before);
   let copied=false;
   try{copied=window.P118Resolved?.ensureDrawingCopy?.()===true;}
   catch(error){S.model=deep(before);bridge.cad.preview(null);suHelp('Copie de travail impossible : '+error.message);render();return false;}
   if(copied){ensureContext();S.model=candidate;S.tool=tool;CAD.panel=panel;committed=deep(before);}
   const redo=deep(S.redo);S.undo.push(historyBefore);if(S.undo.length>100)S.undo.shift();S.redo=[];
   if(persist()===false){S.redo=redo;render();return false;}S.selected=selection;render();
   if(copied){suHelp('Copie de travail active · modification enregistrée ; exemple original conservé.');bridge.toast?.('Copie de travail créée automatiquement · exemple original conservé.');}
   return true;
  }
  function fdEdit(fn){const before=deep(S.model),selected=S.selected;try{fn();return fdCommit(before);}catch(e){S.model=before;S.selected=selected;suHelp(e.message);render();return false;}}

  function fdCandidates(kind,o,project=fdProjector(),explicit=false){
   const f=fdFrame(kind,o),base=f?[f.a[0],f.a[1],fdHeight(kind,o)]:[...(o.points?.[0]||o.p||[0,0]),fdHeight(kind,o)],bp=project(base),out=[];
   const nominal=Math.max(.001,bp[3]||S.view.scale||1);
   for(const axis of ['length','width','height']){
    if(axis!=='height'&&!f)continue;
    if(axis==='height'&&S.mode==='2d'&&CAD.axis!=='height')continue;
    const d=axis==='height'?[0,0,1]:[...(axis==='length'?f.u:f.v),0],q=project(base.map((v,i)=>v+d[i])),vx=q[0]-bp[0],vy=q[1]-bp[1];
    let scale=Math.hypot(vx,vy),u=[vx/scale,vy/scale],fallback=scale<Math.max(.001,nominal*.06);
    if(fallback){if(!(explicit&&S.mode==='2d'&&axis==='height'))continue;scale=nominal;u=[0,-1];}
    out.push({axis,u,scale,fallback});
   }
   // A centred line widens on both sides; its visible side follows the pointer.
   if(f?.linear)for(const c of out)if(c.axis==='width')c.scale/=2;
   return out;
  }
  function fdGuides(project=fdProjector()){
   const o=obj();if(S.tool!=='pushpull'||!o?.item||!fdVisible(o.kind,o.item))return[];
   const f=fdFrame(o.kind,o.item),z=fdHeight(o.kind,o.item),p=o.item.points?.[0]||o.item.p||[0,0],center=f?f.a.map((v,i)=>v+(f.column?0:f.u[i]*f.length/2)+(f.linear||f.column?0:f.v[i]*f.width/2)):p;
   const box=surface.getBoundingClientRect(),left=box.left+24,right=Math.max(left,box.right-24),top=box.top+30,bottom=Math.max(top,box.bottom-24),used=[];
   return fdCandidates(o.kind,o.item,project,true).map(c=>{
    let anchor=[...center,z];
    if(f&&c.axis==='length')anchor=[...center.map((v,i)=>v+f.u[i]*f.length/2),z];
    if(f&&c.axis==='width')anchor=[...center.map((v,i)=>v+f.v[i]*f.width/2),z];
    const at=project(anchor),raw=[at[0]+c.u[0]*54,at[1]+c.u[1]*54];
    let to=[fdClamp(raw[0],left,right),fdClamp(raw[1],top,bottom)];
    if(used.some(q=>len(q,to)<34)){
     for(const shift of [36,-36,72,-72,108,-108]){const candidate=[fdClamp(to[0]-c.u[1]*shift,left,right),fdClamp(to[1]+c.u[0]*shift,top,bottom)];if(!used.some(q=>len(q,candidate)<34)){to=candidate;break;}}
    }
    used.push(to);const from=[to[0]-c.u[0]*40,to[1]-c.u[1]*40];
    return{...c,from,to,color:{length:'#e07b1f',width:'#2ea043',height:'#3478c7'}[c.axis],label:{length:'L',width:'l',height:'H'}[c.axis]};
   });
  }
  function fdPickGuide(p){let best=null,d=18;for(const g of fdGuides()){const n=Math.min(len(p,g.to),pointSegDistance(p,g.from,g.to)+5);if(n<d){best=g;d=n;}}return best;}
  function fdNewPath(points,closed=false,name='Segment'){
   const path={id:id('PTH'),kind:'path',points:deep(points),closed,name,thickness:.1,height:0,cadSolid:true,role:'solid',wallType:'intérieur',layer:S.model.activeLayer};
   if(!fdWritable('path',path))return false;return fdEdit(()=>{S.model.paths.push(path);S.selected='path:'+path.id;});
  }
  function fdDetachRefs(key){for(const d of S.model.dims){if(d.aRef?.id===key){d.a=[...fdResolve(d.aRef,d.a)];delete d.aRef;}if(d.bRef?.id===key){d.b=[...fdResolve(d.bRef,d.b)];delete d.bRef;}}}
  function fdDelete(){const o=obj();if(!o?.item||!fdWritable(o.kind,o.item))return;fdEdit(()=>{fdDetachRefs(o.id);S.model[FD_CAD_GROUPS[o.kind]]=S.model[FD_CAD_GROUPS[o.kind]].filter(x=>x.id!==o.id);if(o.kind==='wall'){S.model.doors=S.model.doors.filter(x=>x.hostWallId!==o.id);S.model.windows=S.model.windows.filter(x=>x.hostWallId!==o.id);}S.selected=null;});}
  function fdDuplicate(kind,o,delta=[.5,.5]){
   const n=deep(o);n.id=id(kind.toUpperCase());if(n.holes)n.holes.forEach(h=>h.id=id('VOID'));
   if(kind==='dim'){n.a=[...fdResolve(n.aRef,n.a)];n.b=[...fdResolve(n.bRef,n.b)];delete n.aRef;delete n.bRef;}
   fdTransform(n,p=>p.map((v,i)=>v+delta[i]));
   if(kind==='door'||kind==='window'){const w=wallById(n.hostWallId);n.t+=.5/(len(w.a,w.b)||1);}
   S.model[FD_CAD_GROUPS[kind]].push(n);
   if(kind==='wall')for(const group of ['doors','windows'])for(const opening of [...S.model[group]].filter(x=>x.hostWallId===o.id))S.model[group].push({...deep(opening),id:id('OPEN'),hostWallId:n.id});
   return n;
  }
  function fdCopy(){const o=obj();if(!o?.item){fdActivate('copy');return;}if(!fdWritable(o.kind,o.item))return;fdEdit(()=>{const n=fdDuplicate(o.kind,o.item);S.selected=o.kind+':'+n.id;});}
  function fdOffsetSelected(value=null){const o=obj();if(!o?.item){fdActivate('offset');return;}if(!fdWritable(o.kind,o.item))return;
   const raw=value??prompt('Décalage parallèle (m) : + extérieur / − intérieur','0.20');if(raw===null)return;const distance=fdNumber(raw);if(!Number.isFinite(distance)||Math.abs(distance)<.001){suHelp('Distance non nulle attendue.');return;}
   fdEdit(()=>{const n=fdDuplicate(o.kind,o.item,[0,0]);if(o.kind==='path'&&o.item.closed){n.points=fdOffset(o.item.points,distance);for(const h of n.holes||[])if(h.kind==='poly')h.poly=fdOffset(n.points,-h.thick);}else{const f=fdFrame(o.kind,o.item);if(!f?.linear)throw Error('Décalage : choisissez un mur, une ligne ou un polygone convexe.');fdTransform(n,p=>p.map((v,i)=>v+f.v[i]*distance));}S.selected=o.kind+':'+n.id;});
  }
  function fdExtrude(hit,point){const o=hit&&fdFind(hit.kind,hit.id);if(!o||!fdWritable(hit.kind,o))return;S.selected=hit.kind+':'+hit.id;
   if(CAD.extrudeMode==='shell'){
    if(hit.kind!=='path'||!o.closed){suHelp('Coque : sélectionnez un polygone fermé.');return;}
    const raw=prompt('Épaisseur de la coque (m)','0.20');if(raw===null)return;const thick=fdNumber(raw);if(!Number.isFinite(thick)||thick<=0){suHelp('Épaisseur positive attendue.');return;}
    fdEdit(()=>{const poly=fdOffset(o.points,-thick);o.holes=[...(o.holes||[]).filter(h=>h.kind!=='poly'),{id:id('VOID'),kind:'poly',poly,thick}];o.cadSolid=true;});
   }else{
    const f=fdFrame(hit.kind,o);if(!f||!['wall','path'].includes(hit.kind)){suHelp('Percement : choisissez un mur, une ligne ou un rectangle.');return;}
    const ask=(text,def)=>{const raw=prompt(text,String(def));return raw===null?null:fdNumber(raw);};
    const width=ask('Largeur de l’ouverture (m)',.9);if(width===null)return;const height=ask('Hauteur de l’ouverture (m)',1.2);if(height===null)return;const sill=ask('Allège — hauteur sous l’ouverture (m)',.9);if(sill===null)return;
    if(![width,height,sill].every(Number.isFinite)||width<=0||height<=0||sill<0||width>f.length||sill+height>fdHeight(hit.kind,o)+1e-8){suHelp('L’ouverture doit tenir dans la longueur et la hauteur de son hôte.');return;}
    const t=fdClamp(point?(point[0]-f.a[0])*f.u[0]+(point[1]-f.a[1])*f.u[1]:f.length/2,width/2,f.length-width/2);
    fdEdit(()=>{if(hit.kind==='wall'){const kind=sill===0?'door':'window',opening={id:id('OPEN'),kind,hostWallId:o.id,t:t/f.length,width,height,sill,layer:'Ouvertures'};S.model[FD_CAD_GROUPS[kind]].push(opening);}else{if((o.holes||[]).some(h=>h.kind==='poly'))throw Error('Pour un percement mural, tracez un mur avec l’outil Mur, puis placez l’ouverture dessus.');o.holes??=[];o.holes.push({id:id('VOID'),kind:'rect',x:f.a[0]+f.u[0]*t+(f.linear?0:f.v[0]*f.width/2),y:f.a[1]+f.u[1]*t+(f.linear?0:f.v[1]*f.width/2),w:width,h:height,sill});o.cadSolid=true;}});
   }render();
  }
const TOOLS=[['select','↖','Sélection'],['erase','⌫','Effacer'],['pen','╱','Ligne'],['rectangle','▭','Rectangle'],['polygon','⬡','Polygone'],['circle','○','Cercle'],['wall','▬','Mur'],['column','▣','Poteau'],['door','◩','Porte'],['window','▢','Fenêtre'],['stairs','▤','Escalier'],['pushpull','⇅','Pousser/Tirer'],['extrude','⬒','Extruder'],['move','✥','Déplacer'],['copy','▣','Copier'],['rotate','⟳','Tourner objet'],['scale','⤢','Échelle'],['mirror','⇄','Miroir'],['offset','∥','Décalage'],['orbit','⟳','Rotation vue'],['pan','✣','Pan'],['tape','↔','Mètre'],['dimension','⟷','Cotation'],['text','T','Texte'],['layers','☰','Calques'],['metrics','Σ','Métré'],['exports','⤓','Exporter']];
const HINTS={select:'Touchez un objet pour le sélectionner. Propriétés : dimensions et calque. Deux doigts : pan et zoom.',pen:'Ligne : glissez ou touchez les deux extrémités.',rectangle:'Rectangle : glissez ou touchez deux coins opposés.',polygon:'Polygone : touchez les sommets puis Terminer.',circle:'Cercle : centre puis rayon, par glissement ou deux touches.',wall:'Mur : tracez son axe. Épaisseur 0,20 m ; hauteur du niveau.',column:'Poteau : touchez son point d’insertion.',stairs:'Escalier : tracez son axe puis ajustez ses propriétés.',door:'Porte : touchez le mur hôte.',window:'Fenêtre : touchez le mur hôte.',pushpull:'Glissez une flèche : L orange = longueur, l vert = largeur, H bleu = hauteur. Choisissez un axe si les directions se superposent.',extrude:'Coque : touchez un polygone fermé. Percement : touchez un mur ou un volume.',move:'Glissez l’objet pour le déplacer dans le plan du niveau.',copy:'Glissez l’objet pour créer une copie.',erase:'Touchez l’objet à supprimer.',offset:'Touchez un objet puis indiquez la distance de décalage.',tape:'Touchez deux points ou glissez pour mesurer.',dimension:'Tracez entre deux points pour créer une cote associée.',text:'Touchez le point d’ancrage du texte.',orbit:'Glissez pour tourner la vue 3D. Deux doigts : pan et zoom.',pan:'Glissez pour déplacer la vue. Deux doigts : pan et zoom.'};
// The Design landing view and its 2D/3D workspaces share a tab, but not tool visibility.
// Model navigation selects visible floors; editing must not intercept its taps.
function drawingEnabled(){const root=$('#nativeDesignerRoot');return !!root&&root.dataset.atelierWorkspace!=='home'&&root.dataset.atelierTab!=='model';}
function setWorkspaceTab(name,editing=name!=='designhome'){
 const root=$('#nativeDesignerRoot'),workspace=editing?'drawing':'home';
 if(!root||(root.dataset.atelierTab===name&&root.dataset.atelierWorkspace===workspace))return;
 root.dataset.atelierTab=name;root.dataset.atelierWorkspace=workspace;
 cancel();CAD.pointers.clear();CAD.navigation=false;CAD.snapRef=null;
 if(!drawingEnabled()){CAD.panel=null;const panel=$('#atelier-properties');if(panel)panel.hidden=true;}
 bridge.render();
}
function activate(tool){
 ensureContext();if(bridge.levelScope?.()==='roof'&&!['select','pan','orbit','layers','metrics','exports','props'].includes(tool)){bridge.toast('Vue de toiture : revenez au niveau porteur pour modifier ses objets.');return;}cancel();if(['layers','metrics','exports','props'].includes(tool)){CAD.panel=tool;renderPanel(true);return;}
 if(['rotate','scale','mirror'].includes(tool)){transformSelected(tool);return;}
 S.tool=tool;bridge.cad.prepare();
 let planeNotice='';
 if(S.mode==='3d'&&['pen','rectangle','polygon','circle','wall','column','stairs','dimension','tape','text','move','copy','offset'].includes(tool)&&bridge.cad.project()&&!plane([0,0])){
  const v=bridge.capture();bridge.restore({...v,pitch:(v.pitch<0?-1:1)*Math.PI/6});
  planeNotice='Vue de tranche inclinée à 30° pour dessiner dans le plan du niveau. ';
 }
 suHelp(planeNotice+(HINTS[tool]||'Sélectionnez un objet.')+(window.P118Resolved?.isRead?.(typeof project==='function'?project():null)?' · Exemple protégé : première modification dans une copie automatique.':''));render();
 if(['extrude','offset'].includes(tool))renderPanel(true);
}
function undoRedo(redo=false){if(!ensureContext())return;cancel();const source=redo?S.redo:S.undo,target=redo?S.undo:S.redo;if(!source.length)return;const next=deep(source[source.length-1]);try{bridge.saveModel(S.level,next,{deferRender:true});source.pop();target.push(deep(recorded||committed));recorded=deep(next);S.model=fdEnsure(fdMigrate(deep(next)));committed=deep(S.model);S.selected=null;render();suHelp(redo?'Action rétablie.':'Action annulée.');}catch(e){suHelp('Enregistrement impossible : '+e.message);}}
function plane(p,project=fdProjector()){
 const a=project([0,0,0]),x=project([1,0,0]),y=project([0,1,0]),u=[x[0]-a[0],x[1]-a[1]],v=[y[0]-a[0],y[1]-a[1]],det=u[0]*v[1]-u[1]*v[0];
 if(Math.abs(det)<Math.max(1e-6,a[3]*a[3]*.015))return null;
 return[((p[0]-a[0])*v[1]-(p[1]-a[1])*v[0])/det,(u[0]*(p[1]-a[1])-u[1]*(p[0]-a[0]))/det];
}
function snap(p,project=fdProjector()){
 CAD.snapRef=null;if(!p||!S.snap)return p;const a=project([...p,0]);let best=null,dist=12;
 for(const {kind,item:o}of fdEntries()){if(!fdVisible(kind,o))continue;const points=o.points||(o.a&&o.b?[o.a,o.b]:o.p?[o.p]:[]);points.forEach((q,i)=>{const d=len(a,project([...q,0]));if(d<dist){dist=d;best=q;CAD.snapRef={kind,id:o.id,i};}});}
 return best?[...best]:p.map(x=>Math.round(x/S.gridSize)*S.gridSize);
}
function projectedGeometry(project=fdProjector()){
 const l=levels.find(x=>x.id===S.level);if(!l)return{faces:[],paths:[]};const data=G.model(S.model,l,levels,{includeIncoming:true}),z=l.elevation||0,pr=p=>project([p[0],p[1],(p[2]||0)-z]);
 const faces=data.prisms.flatMap(s=>G.faces(s)).concat(data.surfaces).map(f=>({...f,screen:f.points.map(pr),holeScreens:(f.holes||[]).map(h=>h.map(pr))})).map(f=>({...f,depth:f.screen.reduce((s,p)=>s+p[2],0)/f.screen.length})).sort((a,b)=>a.depth-b.depth);
 const paths=data.paths.filter(p=>!p.planOnly||S.mode!=='3d').map(p=>({...p,screen:p.points.map(q=>pr([...q,p.z]))}));
 // Zero-height and uncut plan objects remain selectable.
 for(const {kind,item:o}of fdEntries()){if(!fdVisible(kind,o))continue;let polys=[];if(kind==='wall')polys=[G.wallPoly(o,o.a,o.b)];else if(kind==='path')polys=fdPathPolys(o);else if(kind==='column'){const d=G.shape(o);polys=d.solids.map(p=>G.columnPoly(o,p));}else if(kind==='stairs')polys=[G.stairFoot(o)];for(const poly of polys)paths.push({kind,id:o.id,closed:true,screen:poly.map(p=>project([...p,0])),holeScreens:(o.holes||[]).filter(h=>h.kind==='poly').map(h=>h.poly.map(p=>project([...p,0])))});}
 return{faces,paths};
}
function hit(p,project=fdProjector()){
 const g=projectedGeometry(project);
 for(const pa of [...g.paths].reverse()){if(pa.text){const q=pa.screen[0];if(Math.abs(p[1]-q[1])<12&&p[0]>=q[0]-4&&p[0]<=q[0]+Math.max(30,pa.text.length*7))return{kind:pa.kind,id:pa.id};}else{const q=pa.screen;for(let i=1;i<q.length;i++)if(pointSegDistance(p,q[i-1],q[i])<8)return{kind:pa.kind,id:pa.id};}}
 if(S.mode==='3d')for(const f of [...g.faces].reverse())if(!f.holeScreens.some(h=>fdInside(p,h))&&(fdInside(p,f.screen)||f.screen.some((a,i)=>pointSegDistance(p,a,f.screen[(i+1)%f.screen.length])<8)))return{kind:f.kind,id:f.id};
 for(const pa of [...g.paths].reverse())if(pa.closed&&fdInside(p,pa.screen)&&!(pa.holeScreens||[]).some(h=>fdInside(p,h)))return{kind:pa.kind,id:pa.id};return null;
}
function nearestWall(p){let best=null,d=Infinity;for(const w of S.model.walls){if(!fdVisible('wall',w))continue;const dist=pointSegDistance(p,w.a,w.b);if(dist<d){d=dist;best=w;}}return d<Math.max(.6,12/(fdProjector()([0,0,0])[3]||1))?best:null;}
function addOpening(kind,p,host=null){const wall=host||nearestWall(p);if(!wall||!fdWritable('wall',wall)){suHelp('Touchez un mur visible et déverrouillé.');return;}const f=fdFrame('wall',wall),width=Math.min(kind==='door'?.9:1.2,f.length),sill=kind==='door'?0:.9,height=kind==='door'?2.1:1.2,t=fdClamp((p[0]-f.a[0])*f.u[0]+(p[1]-f.a[1])*f.u[1],width/2,f.length-width/2);fdEdit(()=>{const n={id:id('OPEN'),kind,hostWallId:wall.id,t:t/f.length,width,height,sill,layer:'Ouvertures'};S.model[FD_CAD_GROUPS[kind]].push(n);S.selected=kind+':'+n.id;});}
function newObject(kind,a,b){fdEdit(()=>{let o;if(kind==='wall')o={id:id('WALL'),kind,a,b,thickness:.2,height:levels.find(l=>l.id===S.level)?.height||3,baseLevel:S.level,topLevel:'',baseOffset:0,topOffset:0,lineRef:'axe',type:'intérieur',layer:S.model.activeLayer};else if(kind==='stairs')o={id:id('STAIR'),kind,a,b,width:1.2,height:levels.find(l=>l.id===S.level)?.height||3,steps:12,layer:'Mobilier'};else o={id:id('COLUMN'),kind:'column',p:a,width:.4,depth:.4,height:levels.find(l=>l.id===S.level)?.height||3,shapeId:'rect',angle:0,baseLevel:S.level,layer:'Poteaux'};S.model[FD_CAD_GROUPS[o.kind]].push(o);S.selected=o.kind+':'+o.id;});}
const DRAW=['pen','rectangle','polygon','circle','wall','stairs','dimension','tape'];
const surface=$('#viewer-surface');
function consumed(e){e.preventDefault();e.stopImmediatePropagation();}
function down(e){
 if(!drawingEnabled())return;
 const handle=e.target.closest('[data-push-axis]');
 if((!handle&&e.target.closest('button,input,select,a,textarea,#atelier-properties'))||!ensureContext())return;
 if(e.pointerType==='mouse'&&e.button!==0&&e.button!==1)return;
 const previous=[...CAD.pointers.values()];CAD.pointers.set(e.pointerId,{pointerId:e.pointerId,clientX:e.clientX,clientY:e.clientY});
 if(CAD.pointers.size>1){cancel();CAD.navigation=true;for(const p of previous)bridge.cad.navigate(p,true);bridge.cad.navigate(e,true);render();consumed(e);return;}
 if(CAD.navigation){bridge.cad.navigate(e,true);consumed(e);return;}
 if(['pan','orbit'].includes(S.tool)||e.button===1||e.shiftKey||S.mode==='readonly'){CAD.navigation=true;bridge.cad.navigate(e,S.tool==='pan'||e.shiftKey||e.button===1);consumed(e);return;}
 bridge.cad.prepare();bridge.render();const project=fdProjector(),p=[e.clientX,e.clientY],guide=S.tool==='pushpull'&&(handle?fdGuides(project).find(g=>g.axis===handle.dataset.pushAxis):fdPickGuide(p)),picked=guide&&obj()?{kind:obj().kind,id:obj().id}:hit(p,project),point=snap(plane(p,project),project),ref=CAD.snapRef;
 if(guide){CAD.lastAxis=guide.axis;if(CAD.axis!=='auto')CAD.axis=guide.axis;}
 if(picked)S.selected=picked.kind+':'+picked.id;else if(S.tool==='select'){S.selected=null;CAD.navigation=true;render();return;}
 CAD.gesture={id:e.pointerId,context:contextKey,tool:S.tool,start:p,point,ref,project,hit:picked,before:deep(S.model),original:picked?deep(fdFind(picked.kind,picked.id)):null,axis:guide||null,changed:false};
 surface.setPointerCapture(e.pointerId);surface.focus({preventScroll:true});render();consumed(e);
}
function move(e){
 if(!drawingEnabled())return;
 const record=CAD.pointers.get(e.pointerId);if(record){record.clientX=e.clientX;record.clientY=e.clientY;}
 if(CAD.navigation)return;
 const g=CAD.gesture;if(!g||g.id!==e.pointerId)return;if(contextKey!==g.context){cancel();return;}
 const p=[e.clientX,e.clientY],dx=p[0]-g.start[0],dy=p[1]-g.start[1],distance=Math.hypot(dx,dy),raw=plane(p,g.project),wp=snap(raw,g.project);
 if(DRAW.includes(g.tool)){if(wp&&g.point){CAD.preview={a:CAD.pending?.a||g.point,b:wp,tool:g.tool};bridge.render();}consumed(e);return;}
 if(g.tool==='pushpull'&&g.hit&&distance>4){
  if(!fdWritable(g.hit.kind,g.original)){consumed(e);return;}
  const candidates=fdCandidates(g.hit.kind,g.original,g.project,CAD.axis!=='auto');
  if(!g.axis){if(CAD.axis!=='auto')g.axis=candidates.find(x=>x.axis===CAD.axis);else{const scored=candidates.map(c=>({...c,score:Math.abs(dx*c.u[0]+dy*c.u[1])/distance})).sort((a,b)=>b.score-a.score);if(scored[0]?.score>.75&&(!scored[1]||scored[0].score-scored[1].score>.06))g.axis=scored[0];}}
  if(g.axis){const c=g.axis,next=deep(g.original),value=Math.max(c.axis==='height'?0:.001,fdDimension(g.hit.kind,next,c.axis)+(dx*c.u[0]+dy*c.u[1])/c.scale);try{fdResize(g.hit.kind,next,c.axis,value);S.model=deep(g.before);S.model[FD_CAD_GROUPS[g.hit.kind]][S.model[FD_CAD_GROUPS[g.hit.kind]].findIndex(x=>x.id===g.hit.id)]=next;CAD.lastAxis=c.axis;previewValid(g);suHelp(({length:'Longueur',width:'Largeur',height:'Hauteur'})[c.axis]+' : '+fdDimension(g.hit.kind,fdFind(g.hit.kind,g.hit.id),c.axis).toFixed(3)+' m');}catch(err){suHelp(err.message);}}
  if(!g.axis)suHelp('Directions superposées : glissez une poignée L, l ou H, ou choisissez la dimension ci-dessous.');
  consumed(e);return;
 }
 if(['move','copy'].includes(g.tool)&&g.hit&&distance>4&&raw&&g.point){
  if(!fdWritable(g.hit.kind,g.original)){consumed(e);return;}S.model=deep(g.before);let target=fdFind(g.hit.kind,g.hit.id);
  if(g.tool==='copy'){target=fdDuplicate(g.hit.kind,target,[0,0]);S.selected=g.hit.kind+':'+target.id;}
  let delta=raw.map((v,i)=>v-plane(g.start,g.project)[i]);if(S.snap)delta=delta.map(x=>Math.round(x/S.gridSize)*S.gridSize);
  if(['door','window'].includes(g.hit.kind)){const w=wallById(target.hostWallId),L=len(w.a,w.b);target.t+=(delta[0]*(w.b[0]-w.a[0])+delta[1]*(w.b[1]-w.a[1]))/(L*L);}else{if(g.hit.kind==='dim'){target.a=deep(fdResolve(target.aRef,target.a));target.b=deep(fdResolve(target.bRef,target.b));delete target.aRef;delete target.bRef;}fdTransform(target,q=>q.map((v,i)=>v+delta[i]));}
  previewValid(g);consumed(e);return;
 }
 consumed(e);
}
function previewValid(g){const error=fdValidate();if(error){S.model=deep(g.lastGood||g.before);suHelp(error);}else{g.changed=true;g.lastGood=deep(S.model);}bridge.cad.preview(S.model);bridge.render();}
function up(e,cancelled=false){
 if(!drawingEnabled())return;
 CAD.pointers.delete(e.pointerId);if(CAD.navigation){if(!CAD.pointers.size)CAD.navigation=false;return;}
 const g=CAD.gesture;if(!g||g.id!==e.pointerId)return;consumed(e);
 if(cancelled){cancel();render();return;}
 CAD.gesture=null;CAD.preview=null;if(contextKey!==g.context){cancel();render();return;}
 if(g.changed){fdCommit(g.before,S.selected);return;}
 const p=[e.clientX,e.clientY],wp=snap(plane(p,g.project),g.project),ref=CAD.snapRef,distance=len(p,g.start);
 if(['select','move','pushpull'].includes(g.tool)){render();return;}
 if(g.tool==='erase'){fdDelete();return;}if(g.tool==='copy'){fdCopy();return;}if(g.tool==='extrude'){fdExtrude(g.hit,wp);return;}if(g.tool==='offset'){fdOffsetSelected();return;}
 if(['door','window'].includes(g.tool)){
  const picked=g.hit,opening=picked&&['door','window'].includes(picked.kind)?fdFind(picked.kind,picked.id):null;
  const host=picked?.kind==='wall'?wallById(picked.id):opening?wallById(opening.hostWallId):null;
  let at=wp;
  if(host&&S.mode==='3d'){
   const a=g.project([...host.a,0]),b=g.project([...host.b,0]),z=g.project([...host.a,1]);
   const u=[b[0]-a[0],b[1]-a[1]],v=[z[0]-a[0],z[1]-a[1]],det=u[0]*v[1]-u[1]*v[0];
   if(Math.abs(det)>1e-7){const t=fdClamp(((p[0]-a[0])*v[1]-(p[1]-a[1])*v[0])/det,0,1);at=host.a.map((x,i)=>x+t*(host.b[i]-x));}
  }
  if(at)addOpening(g.tool,at,host);else suHelp('Inclinez la vue pour positionner l’ouverture sur son mur.');
  return;
 }
 if(!wp){suHelp('Vue de tranche : passez en 2D ou inclinez la vue 3D pour dessiner.');return;}
 if(g.tool==='text'){const text=prompt('Texte à afficher','Note');if(text?.trim())fdEdit(()=>{const n={id:id('TXT'),kind:'text',x:wp[0],y:wp[1],text:text.trim().slice(0,2000),layer:'Annotations'};S.model.texts.push(n);S.selected='text:'+n.id;});return;}
 if(g.tool==='column'){newObject('column',wp);return;}
 if(g.tool==='polygon'){CAD.pending??={tool:'polygon',points:[]};CAD.pending.points.push(wp);suHelp(CAD.pending.points.length+' sommets · Terminer pour fermer.');render();return;}
 if(DRAW.includes(g.tool)){
  const old=CAD.pending;if(distance<=4&&!old){CAD.pending={tool:g.tool,a:wp,ref};suHelp('Touchez le deuxième point. Échap : annuler.');render();return;}
  const a=old?.a||g.point,b=wp;CAD.pending=null;if(!a||len(a,b)<.01){render();return;}
  if(g.tool==='pen')fdNewPath([a,b]);
  if(g.tool==='rectangle'){if(Math.abs(a[0]-b[0])<.01||Math.abs(a[1]-b[1])<.01){suHelp('Deux dimensions non nulles requises.');return;}fdNewPath([a,[b[0],a[1]],b,[a[0],b[1]]],true,'Rectangle');}
  if(g.tool==='circle'){const radius=len(a,b);fdNewPath(Array.from({length:48},(_,i)=>[a[0]+radius*Math.cos(i*Math.PI/24),a[1]+radius*Math.sin(i*Math.PI/24)]),true,'Cercle');}
  if(['wall','stairs'].includes(g.tool))newObject(g.tool,a,b);
  if(g.tool==='dimension')fdEdit(()=>{const n={id:id('DIM'),kind:'dim',a,b,aRef:old?.ref||g.ref,bRef:ref,offset:.6,layer:'Cotations'};S.model.dims.push(n);S.selected='dim:'+n.id;});
  if(g.tool==='tape')suHelp('Distance : '+len(a,b).toFixed(3)+' m');render();
 }
}
surface.addEventListener('pointerdown',down,true);surface.addEventListener('pointermove',move,true);surface.addEventListener('pointerup',e=>up(e),true);surface.addEventListener('pointercancel',e=>up(e,true),true);surface.addEventListener('lostpointercapture',e=>up(e,true),true);
surface.addEventListener('wheel',()=>{if(drawingEnabled())cancel();},true);
function transformSelected(tool){const o=obj();if(!o){suHelp('Sélectionnez d’abord un objet.');return;}if(!fdWritable(o.kind,o.item))return;const f=fdFrame(o.kind,o.item),origin=o.item.p||o.item.a||o.item.points?.[0];if(!origin){suHelp('Choisissez un objet de dessin.');return;}
 let value=1;if(tool!=='mirror'){const input=prompt(tool==='rotate'?'Angle de rotation (degrés)':'Facteur d’échelle',tool==='rotate'?'90':'1.2');if(input===null)return;value=fdNumber(input);if(!Number.isFinite(value)||tool==='scale'&&value<=0){suHelp('Valeur invalide.');return;}}
 fdEdit(()=>{const angle=value*Math.PI/180,cs=Math.cos(angle),sn=Math.sin(angle);if(o.kind==='column'){if(tool==='rotate')o.item.angle=(o.item.angle||0)+value;else if(tool==='scale'){o.item.width*=value;o.item.depth*=value;o.item.height*=value;}else o.item.angle=-(o.item.angle||0);}else fdTransform(o.item,p=>{const x=p[0]-origin[0],y=p[1]-origin[1];return tool==='rotate'?[origin[0]+x*cs-y*sn,origin[1]+x*sn+y*cs]:tool==='mirror'?[origin[0]-x,p[1]]:[origin[0]+x*value,origin[1]+y*value];});});
}
function afterRender(){
 if(painting)return;painting=true;try{if(!ensureContext())return;mountTools();syncControls();paint();if(!CAD.gesture)renderPanel();}finally{painting=false;}
}
function paint(){
 if(!drawingEnabled()||S.mode==='readonly'){paintPushHandles([]);return;}const project=fdProjector(),strokes=[],chosen=obj();
 if(chosen){const g=projectedGeometry(project),faces=g.faces.filter(p=>p.id===chosen.id);let outlines=[...g.paths,...g.faces].filter(p=>p.id===chosen.id);if(S.tool==='pushpull'&&S.mode==='3d'&&faces.length){const top=Math.max(...faces.flatMap(p=>p.points.map(q=>q[2])));outlines=faces.filter(p=>p.points.every(q=>Math.abs(q[2]-top)<1e-7));}for(const p of outlines)strokes.push({points:p.screen,closed:p.closed??true,color:'#1683df',width:2.5});}
 if(CAD.preview){const {a,b,tool}=CAD.preview,points=tool==='rectangle'?[a,[b[0],a[1]],b,[a[0],b[1]]]:[a,b];strokes.push({points:points.map(p=>project([...p,0])),closed:tool==='rectangle',color:'#b56b3c',dash:true});}
 if(CAD.pending?.points)strokes.push({points:CAD.pending.points.map(p=>project([...p,0])),color:'#b56b3c'});
 if(CAD.pending?.a){const p=project([...CAD.pending.a,0]);strokes.push({points:[[p[0]-5,p[1]],[p[0]+5,p[1]]],color:'#b56b3c'});}
 const guides=fdGuides(project);paintPushHandles(guides);for(const g of guides){strokes.push({points:[g.from,g.to],color:g.color,width:3});const a=Math.atan2(g.u[1],g.u[0]);strokes.push({points:[[g.to[0]-9*Math.cos(a-.4),g.to[1]-9*Math.sin(a-.4)],g.to,[g.to[0]-9*Math.cos(a+.4),g.to[1]-9*Math.sin(a+.4)]],color:g.color,width:3});}
 const canvas=$('#building-canvas');if(S.mode==='3d'&&!canvas.hidden){const ctx=canvas.getContext('2d'),r=canvas.getBoundingClientRect();ctx.save();ctx.setTransform(canvas.width/r.width,0,0,canvas.height/r.height,0,0);for(const s of strokes){ctx.beginPath();s.points.forEach((p,i)=>i?ctx.lineTo(p[0]-r.left,p[1]-r.top):ctx.moveTo(p[0]-r.left,p[1]-r.top));if(s.closed)ctx.closePath();ctx.strokeStyle=s.color;ctx.lineWidth=s.width||2;ctx.setLineDash(s.dash?[5,4]:[]);ctx.stroke();}ctx.restore();}
 else{const svg=$('#technical-stage svg'),matrix=svg?.getScreenCTM();if(!matrix)return;svg.querySelector('[data-atelier-guides]')?.remove();const inv=matrix.inverse(),conv=p=>[inv.a*p[0]+inv.c*p[1]+inv.e,inv.b*p[0]+inv.d*p[1]+inv.f],group=document.createElementNS('http://www.w3.org/2000/svg','g');group.setAttribute('data-atelier-guides','');group.setAttribute('pointer-events','none');group.innerHTML=strokes.map(s=>`<path d="${s.points.map((p,i)=>(i?'L':'M')+conv(p).join(' ')).join(' ')}${s.closed?' Z':''}" fill="none" stroke="${s.color}" stroke-width="${s.width||2}" vector-effect="non-scaling-stroke"${s.dash?' stroke-dasharray="5 4"':''}/>`).join('');svg.appendChild(group);}
}
const TOOL_GROUPS=[
 ['Sélection',['select','erase']],
 ['Dessiner',['rectangle','pen','wall','door','window']],
 ['Modifier',['pushpull','extrude','move','orbit','pan']],
 ['Mesurer',['tape','dimension','text']],
 ['Organiser',['copy','offset']],
 ['Autres tracés',['polygon','circle','column','stairs']],
 ['Transformer',['rotate','scale','mirror']],
 ['Gérer',['layers','metrics','exports']]
];
const TOOL_LABELS={pushpull:'Pousser',orbit:'Rotation',rotate:'Tourner'};
function toolPaletteHTML(){return TOOL_GROUPS.map(([name,ids])=>`<section class="atelier-tool-group" aria-label="${name}"><h3>${name}</h3>${ids.map(tool=>{const [,icon,label]=TOOLS.find(t=>t[0]===tool);return`<button type="button" data-atelier-tool="${tool}" aria-pressed="false" title="${label}" aria-label="${label}"><span class="atelier-tool-icon" aria-hidden="true">${tool==='door'?'▯':icon}</span><small class="atelier-tool-label">${TOOL_LABELS[tool]||label}</small></button>`;}).join('')}</section>`).join('');}
function mountTools(){
 const column=surface.closest('.v7-viewport-column');if(!column||$('#atelier-drawing-tools'))return;
 column.classList.add('atelier-has-tools');
 const row=document.createElement('aside');row.id='atelier-drawing-tools';row.setAttribute('aria-label','Outils de dessin');
 row.innerHTML='<button type="button" id="atelier-tools-toggle" aria-controls="atelier-tool-palette" aria-expanded="true" title="Replier les outils" aria-label="Replier les outils"><span aria-hidden="true">‹</span><small>Outils</small></button><div id="atelier-tool-palette">'+toolPaletteHTML()+'</div>';column.insertBefore(row,surface);
 const toggle=$('#atelier-tools-toggle'),palette=$('#atelier-tool-palette');
 function foldTools(collapsed,persist=false){
  column.classList.toggle('atelier-tools-collapsed',collapsed);palette.hidden=collapsed;
  toggle.setAttribute('aria-expanded',String(!collapsed));toggle.title=collapsed?'Afficher les outils':'Replier les outils';toggle.setAttribute('aria-label',toggle.title);
  toggle.querySelector('span').textContent=collapsed?'›':'‹';
  if(persist)bridge.store.setItem('parcours.atelier.toolsCollapsed',String(collapsed));
 }
 foldTools(bridge.store.getItem('parcours.atelier.toolsCollapsed')==='true');
 toggle.onclick=()=>{cancel();CAD.pointers.clear();CAD.navigation=false;foldTools(!column.classList.contains('atelier-tools-collapsed'),true);bridge.render();};
 const footer=column.querySelector('.v7-view-footer');
 row.querySelectorAll('[data-atelier-tool]').forEach(b=>b.onclick=()=>activate(b.dataset.atelierTool));
 const options=document.createElement('div');options.id='atelier-tool-options';options.innerHTML=`<button type="button" id="atelier-snap" aria-pressed="true">Accrochage</button><select id="atelier-snap-step" aria-label="Pas de l’accrochage"><option value=".1">0,10 m</option><option value=".25">0,25 m</option><option selected value=".5">0,50 m</option><option value="1">1,00 m</option></select><span id="atelier-push-axes" hidden>${[['auto','Auto'],['length','Longueur'],['width','Largeur'],['height','Hauteur']].map(([a,label])=>`<button type="button" data-atelier-axis="${a}">${label}</button>`).join('')}</span><form id="atelier-push-value" hidden><label id="atelier-dimension-label" for="atelier-dimension-value">Longueur</label><input id="atelier-dimension-value" inputmode="decimal" autocomplete="off" aria-label="Longueur en mètres"><span>m</span><button id="atelier-dimension-apply" type="submit">OK</button></form><span id="atelier-extrude-modes" hidden><button type="button" data-atelier-extrude="shell">Coque</button><button type="button" data-atelier-extrude="hole">Percement</button></span><button type="button" id="atelier-polygon-finish" hidden>Terminer</button><button type="button" id="atelier-tool-cancel">Annuler le geste</button>`;column.insertBefore(options,footer);
 const dock=document.createElement('div');dock.id='atelier-push-dock';dock.hidden=true;options.insertBefore(dock,$('#atelier-push-value'));dock.appendChild($('#atelier-push-value'));
 const help=document.createElement('div');help.id='atelier-tool-status';help.setAttribute('role','status');help.textContent=HINTS[S.tool];column.insertBefore(help,footer);
 $('#atelier-snap').onclick=()=>{S.snap=!S.snap;syncControls();};$('#atelier-snap-step').onchange=e=>S.gridSize=Number(e.target.value);
 $('#atelier-push-value').onsubmit=applyPushValue;
 options.querySelectorAll('[data-atelier-axis]').forEach(b=>b.onclick=()=>fdSetPushAxis(b.dataset.atelierAxis));options.querySelectorAll('[data-atelier-extrude]').forEach(b=>b.onclick=()=>{CAD.extrudeMode=b.dataset.atelierExtrude;syncControls();});
 $('#atelier-polygon-finish').onclick=()=>{const points=CAD.pending?.points;if(points?.length>=3){CAD.pending=null;fdNewPath(points,true,'Polygone');}else suHelp('Au moins trois sommets sont requis.');};$('#atelier-tool-cancel').onclick=()=>{cancel();render();suHelp('Geste annulé.');};
 const panel=document.createElement('aside');panel.id='atelier-properties';panel.hidden=true;panel.setAttribute('aria-label','Propriétés, calques et métré');surface.appendChild(panel);
 // Recalculate the native projection after the sidebar changes the viewport width.
 let size='',resizeFrame=0;
 new ResizeObserver(entries=>{const r=entries[0]?.contentRect;if(!r||!r.width||!r.height)return;const next=r.width+'x'+r.height;if(next===size)return;size=next;if(!resizeFrame)resizeFrame=requestAnimationFrame(()=>{resizeFrame=0;bridge.render();});}).observe(surface);
}
function fdSetPushAxis(axis){
 cancel();CAD.axis=axis;if(axis!=='auto')CAD.lastAxis=axis;
 render();
}
function fdPushValue(){
 const selected=obj(),axis=CAD.axis==='auto'?CAD.lastAxis:CAD.axis;
 return{selected,axis,value:selected?fdDimension(selected.kind,selected.item,axis):null};
}
function syncPushValue(){
 const form=$('#atelier-push-value');if(!form)return;
 const active=drawingEnabled()&&S.tool==='pushpull',dock=$('#atelier-push-dock'),navigation=$('.viewer-floating-controls');
 dock.hidden=!active;form.hidden=!active;
 const parent=active?dock:surface;if(navigation&&navigation.parentElement!==parent)parent.appendChild(navigation);
 $('#atelier-tool-cancel').hidden=S.tool==='pushpull'&&!CAD.gesture;
 const {selected,axis,value}=fdPushValue(),input=$('#atelier-dimension-value'),label=$('#atelier-dimension-label');
 label.textContent={length:'Longueur',width:'Largeur',height:'Hauteur'}[axis];
 input.setAttribute('aria-label',label.textContent+' en mètres');input.disabled=!selected||value===null;
 $('#atelier-dimension-apply').disabled=input.disabled;
 if(document.activeElement!==input||CAD.gesture)input.value=Number.isFinite(value)?value.toFixed(3):'';
}
function applyPushValue(e){
 e.preventDefault();if(!ensureContext())return;
 const {selected,axis}=fdPushValue(),value=fdNumber($('#atelier-dimension-value').value);
 if(!selected){suHelp('Sélectionnez une ligne, un mur ou un rectangle.');return;}
 if(!fdWritable(selected.kind,selected.item))return;
 if(!Number.isFinite(value)||value<(axis==='height'?0:axis==='length'?.01:.001)||value>1e6){suHelp('Saisissez une dimension valide en mètres.');return;}
 cancel();const target=fdFind(selected.kind,selected.id);
 if(fdEdit(()=>fdResize(selected.kind,target,axis,value)))suHelp(({length:'Longueur',width:'Largeur',height:'Hauteur'})[axis]+' : '+value.toFixed(3)+' m');
}
function paintPushHandles(guides){
 let host=$('#atelier-push-handles');
 if(!host){host=document.createElement('div');host.id='atelier-push-handles';host.setAttribute('aria-label','Poignées Pousser/Tirer');surface.appendChild(host);}
 host.hidden=!drawingEnabled()||S.tool!=='pushpull'||!guides.length;
 if(host.hidden){host.replaceChildren();return;}
 const box=surface.getBoundingClientRect();host.replaceChildren();
 for(const g of guides){
  const button=document.createElement('button');button.type='button';button.dataset.pushAxis=g.axis;
  button.className='atelier-push-handle';const label=document.createElement('span');label.textContent=g.label;label.setAttribute('aria-hidden','true');button.appendChild(label);
  button.style.cssText=`left:${g.to[0]-box.left}px;top:${g.to[1]-box.top}px;color:${g.color}`;
  button.title=({length:'Longueur',width:'Largeur',height:'Hauteur'})[g.axis]+' — glisser pour modifier';
  button.setAttribute('aria-label',button.title);
  button.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();fdSetPushAxis(g.axis);$('#atelier-dimension-value')?.focus();}};
  host.appendChild(button);
 }
}

function syncControls(){
 surface.closest('.v7-viewport-column').dataset.activeTool=S.tool;
 syncPushValue();
 $$('[data-atelier-tool]').forEach(b=>{const on=b.dataset.atelierTool===S.tool;b.classList.toggle('active',on);b.setAttribute('aria-pressed',on);});
 $$('[data-atelier-axis]').forEach(b=>{const on=b.dataset.atelierAxis===CAD.axis;b.classList.toggle('active',on);b.setAttribute('aria-pressed',on);});
 $$('[data-atelier-extrude]').forEach(b=>{const on=b.dataset.atelierExtrude===CAD.extrudeMode;b.classList.toggle('active',on);b.setAttribute('aria-pressed',on);});
 for(const [key,stack]of [['undo',S.undo],['redo',S.redo]]){const b=$('[data-quick="'+key+'"]');if(b)b.disabled=!stack.length;}
 if($('#atelier-push-axes'))$('#atelier-push-axes').hidden=S.tool!=='pushpull';if($('#atelier-extrude-modes'))$('#atelier-extrude-modes').hidden=S.tool!=='extrude';if($('#atelier-polygon-finish'))$('#atelier-polygon-finish').hidden=S.tool!=='polygon';
 if($('#atelier-snap')){$('#atelier-snap').classList.toggle('active',S.snap);$('#atelier-snap').setAttribute('aria-pressed',S.snap);}
}
function renderPanel(open=false){
 mountTools();const panel=$('#atelier-properties');if(!panel)return;if(open){panel.hidden=false;panelKey='';}if(panel.hidden)return;
 const selected=obj(),key=JSON.stringify([contextKey,S.selected,selected?.item,S.model?.layers,CAD.panel,S.tool]);if(key===panelKey)return;panelKey=key;
 const field=(label,name,value)=>`<label>${label}<input name="${name}" inputmode="decimal" value="${esc(value)}" required></label>`;
 let body='';if(CAD.panel==='layers'){
  body='<h3>Calques</h3>'+Object.entries(S.model.layers).map(([name,L],i)=>`<div class="atelier-layer"><input type="checkbox" data-layer-visible="${i}" ${L.visible!==false?'checked':''} aria-label="Afficher ${esc(name)}"><button data-layer-active="${i}" class="${S.model.activeLayer===name?'active':''}">${esc(name)}</button><button data-layer-lock="${i}" aria-label="${L.locked?'Déverrouiller':'Verrouiller'} ${esc(name)}">${L.locked?'🔒':'🔓'}</button></div>`).join('');
 }else if(CAD.panel==='metrics'){
  const rows=metrics();body='<h3>Métré · niveau actif</h3><table><tr><th>Objet</th><th>Volume net</th></tr>'+rows.map(r=>`<tr><td>${esc(r.name)}</td><td>${r.volume.toFixed(3)} m³</td></tr>`).join('')+`</table><p><b>Total : ${rows.reduce((a,r)=>a+r.volume,0).toFixed(3)} m³</b></p><p>Vides déduits. Calques masqués inclus ; chevauchements entre objets additionnés.</p><button data-export="csv">Exporter le métré CSV</button>`;
 }else if(CAD.panel==='exports'){
  body='<h3>Exporter</h3>'+[['json','Projet JSON · niveaux'],['svg','Plan SVG · niveau actif'],['dxf','Plan DXF · mètres'],['csv','Métré CSV · niveau actif'],['print','Imprimer le plan / PDF']].map(([key,label])=>`<button data-export="${key}">${label}</button>`).join('');
 }else if(!selected){body='<h3>Propriétés</h3><p>Touchez un objet dans la vue pour modifier ses dimensions.</p>';}else{
  const {kind,item:o}=selected,f=fdFrame(kind,o),locked=!fdVisible(kind,o)||S.model.layers[fdLayer(kind,o)]?.locked;
  body=`<h3>Propriétés · ${esc(o.name||({wall:'Mur',path:'Tracé',column:'Poteau',door:'Porte',window:'Fenêtre',stairs:'Escalier',dim:'Cotation',text:'Texte'})[kind])}</h3><form id="atelier-properties-form"><fieldset ${locked?'disabled':''}>`;
  if(f)body+=field('Longueur (m)','length',f.length.toFixed(3))+field('Largeur (m)','width',f.width.toFixed(3));
  if(['wall','path','column','stairs'].includes(kind))body+=field('Hauteur (m)','height',fdHeight(kind,o).toFixed(3));
  if(['door','window'].includes(kind))body+=field('Largeur (m)','openingWidth',o.width)+field('Hauteur (m)','openingHeight',o.height)+field('Allège (m)','sill',o.sill||0);
  if(kind==='dim')body+=field('Décalage de cote (m)','offset',o.offset??.6);
  if(kind==='text')body+=`<label>Texte<input name="text" value="${esc(o.text)}" required></label>`;
  body+=`<label>Calque<select name="layer">${Object.keys(S.model.layers).map(name=>`<option value="${esc(name)}" ${name===fdLayer(kind,o)?'selected':''}>${esc(name)}</option>`).join('')}</select></label><button type="submit">Appliquer</button></fieldset></form><div class="atelier-actions"><button id="atelier-copy-selection" ${locked?'disabled':''}>Copier</button><button id="atelier-delete-selection" ${locked?'disabled':''}>Supprimer</button></div>`;
  if(o.holes?.length)body+='<h3>Vides</h3>'+o.holes.map((h,i)=>`<div class="atelier-layer"><span>${h.kind==='poly'?'Coque':`Percement ${h.w} × ${h.h} m`}</span><button data-remove-hole="${i}" ${locked?'disabled':''}>Supprimer</button></div>`).join('');
 }
 panel.innerHTML='<button type="button" id="atelier-close-properties">✕ Fermer</button>'+body;
 $('#atelier-close-properties').onclick=()=>panel.hidden=true;
 const names=Object.keys(S.model.layers);
 panel.querySelectorAll('[data-layer-visible]').forEach(b=>b.onchange=()=>fdEdit(()=>{S.model.layers[names[+b.dataset.layerVisible]].visible=b.checked;S.selected=null;}));
 panel.querySelectorAll('[data-layer-lock]').forEach(b=>b.onclick=()=>fdEdit(()=>{const L=S.model.layers[names[+b.dataset.layerLock]];L.locked=!L.locked;}));
 panel.querySelectorAll('[data-layer-active]').forEach(b=>b.onclick=()=>fdEdit(()=>S.model.activeLayer=names[+b.dataset.layerActive]));
 panel.querySelectorAll('[data-export]').forEach(b=>b.onclick=()=>exportFile(b.dataset.export));
 if($('#atelier-copy-selection'))$('#atelier-copy-selection').onclick=fdCopy;if($('#atelier-delete-selection'))$('#atelier-delete-selection').onclick=fdDelete;
 panel.querySelectorAll('[data-remove-hole]').forEach(b=>b.onclick=()=>{const o=obj();if(o&&fdWritable(o.kind,o.item))fdEdit(()=>o.item.holes.splice(+b.dataset.removeHole,1));});
 const form=$('#atelier-properties-form');if(form)form.onsubmit=e=>{e.preventDefault();const s=obj();if(!s||!fdWritable(s.kind,s.item))return;const data=new FormData(form);fdEdit(()=>{for(const a of ['length','width','height'])if(data.has(a))fdResize(s.kind,s.item,a,fdNumber(data.get(a)));for(const [a,key]of [['openingWidth','width'],['openingHeight','height'],['sill','sill'],['offset','offset']])if(data.has(a))s.item[key]=fdNumber(data.get(a));if(data.has('text'))s.item.text=String(data.get('text')).slice(0,2000);s.item.layer=String(data.get('layer'));});};
}
function metrics(){const l=levels.find(l=>l.id===S.level),model=deep(S.model);for(const L of Object.values(model.layers))L.visible=true;const g=G.model(model,l,levels);return fdEntries(model).filter(x=>!['dim','text'].includes(x.kind)).map(({kind,item:o})=>({id:o.id,kind,name:o.name||kind,layer:fdLayer(kind,o),volume:g.prisms.filter(p=>p.id===o.id).reduce((s,p)=>s+Math.max(0,fdArea(p.poly)-(p.holes||[]).reduce((a,h)=>a+fdArea(h),0))*(p.topZ?p.topZ.reduce((s,z,i)=>s+z-p.bottomZ[i],0)/p.topZ.length:p.z1-p.z0),0)}));}
function planPaths(){const l=levels.find(l=>l.id===S.level),data=G.model(S.model,l,levels),out=[];for(const s of data.prisms){for(const poly of [s.poly,...s.holes])out.push({points:poly,closed:true,layer:fdLayer(s.kind,fdFind(s.kind,s.id))});}for(const s of data.paths)out.push({...s,layer:fdLayer(s.kind,fdFind(s.kind,s.id))});return out;}
function buildPlanSVG(){const items=planPaths(),pts=items.flatMap(p=>p.points),xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]),minX=pts.length?Math.min(...xs)-1:0,maxY=pts.length?Math.max(...ys)+1:10,W=pts.length?Math.max(...xs)-minX+1:10,H=pts.length?maxY-Math.min(...ys)+1:10;return`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W*100} ${H*100}"><rect width="100%" height="100%" fill="white"/>`+items.map(p=>{const q=p.points.map(([x,y])=>[(x-minX)*100,(maxY-y)*100]);return p.text?`<text x="${q[0][0]}" y="${q[0][1]}" font-size="16" fill="#173f35">${esc(p.text)}</text>`:`<path d="${q.map((a,i)=>(i?'L':'M')+a.join(' ')).join(' ')}${p.closed?' Z':''}" fill="none" stroke="#36594a" stroke-width="1.4"/>`;}).join('')+'</svg>';}
function exportFile(kind){
 let text,mime,name='Atelier_'+String(bridge.code()||'projet').replace(/[^\w-]/g,'_');
 if(kind==='json'){const models={};for(const l of levels)models[l.id]=bridge.model(l.id);text=JSON.stringify({version:1,units:'m',project:bridge.projectId(),parcel:bridge.parcel(),levels,models},null,2);mime='application/json';}
 if(kind==='svg'){text=buildPlanSVG();mime='image/svg+xml';}
 if(kind==='csv'){const cell=s=>'"'+String(s).replace(/^[=+@-]/,"'").replace(/"/g,'""')+'"';text='\uFEFFid;type;calque;volume_net_m3\r\n'+metrics().map(r=>[cell(r.id),cell(r.kind),cell(r.layer),r.volume.toFixed(3)].join(';')).join('\r\n');mime='text/csv;charset=utf-8';}
 if(kind==='dxf'){text='0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1015\n9\n$INSUNITS\n70\n6\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n';const safe=s=>String(s).replace(/[^\x20-\x7e]/g,c=>'\\U+'+c.charCodeAt(0).toString(16).toUpperCase().padStart(4,'0'));for(const p of planPaths()){if(p.text){text+=`0\nTEXT\n8\n${safe(p.layer)}\n10\n${p.points[0][0]}\n20\n${p.points[0][1]}\n40\n0.18\n1\n${safe(p.text)}\n`;continue;}for(let i=0;i<p.points.length-(p.closed?0:1);i++){const a=p.points[i],b=p.points[(i+1)%p.points.length];text+=`0\nLINE\n8\n${safe(p.layer)}\n10\n${a[0]}\n20\n${a[1]}\n30\n0\n11\n${b[0]}\n21\n${b[1]}\n31\n0\n`;}}text+='0\nENDSEC\n0\nEOF\n';mime='application/dxf';}
 if(kind==='print'){const w=window.open('','_blank');if(!w){suHelp('Autorisez la fenêtre d’impression.');return;}w.document.write('<!doctype html><html lang="fr"><title>Plan Atelier</title><style>@page{size:A3 landscape;margin:12mm}svg{width:100%;height:240mm}</style><h1>Plan du niveau · Atelier Architectural</h1>'+buildPlanSVG()+'<p>Coordonnées en mètres · ajustement à la page.</p></html>');w.document.close();w.focus();w.print();return;}
 if(text!==undefined){const url=URL.createObjectURL(new Blob([text],{type:mime})),a=document.createElement('a');a.href=url;a.download=name+'.'+kind;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);suHelp('Export préparé : '+a.download);}
}
document.addEventListener('keydown',e=>{if(!drawingEnabled())return;if(e.target.closest('input,textarea,select,[contenteditable="true"]')||!surface.isConnected||!surface.getClientRects().length)return;if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();undoRedo(e.shiftKey);}else if(e.key==='Escape'){cancel();if($('#atelier-properties'))$('#atelier-properties').hidden=true;render();}else if(['Delete','Backspace'].includes(e.key)){e.preventDefault();fdDelete();}});
window.AtelierTools={inspect:()=>({project:bridge.projectId(),level:S.level,mode:S.mode,tool:S.tool,selected:S.selected,workspace:$('#nativeDesignerRoot')?.dataset.atelierWorkspace,undo:S.undo.length,redo:S.redo.length,pending:!!CAD.pending,panel:CAD.panel,axis:CAD.axis,snap:S.snap,gridSize:S.gridSize,gesture:!!CAD.gesture}),activate,setWorkspaceTab,undo:()=>undoRedo(),redo:()=>undoRedo(true),properties:()=>{CAD.panel='props';renderPanel(true);},afterRender,cancel:(options={})=>{cancel();if(options.render!==false)render();},export:exportFile};
ensureContext();afterRender();
})();
