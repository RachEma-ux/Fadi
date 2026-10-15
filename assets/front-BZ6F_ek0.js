(function(){const te=document.createElement("link").relList;if(te&&te.supports&&te.supports("modulepreload"))return;for(const P of document.querySelectorAll('link[rel="modulepreload"]'))g(P);new MutationObserver(P=>{for(const G of P)if(G.type==="childList")for(const pe of G.addedNodes)pe.tagName==="LINK"&&pe.rel==="modulepreload"&&g(pe)}).observe(document,{childList:!0,subtree:!0});function Y(P){const G={};return P.integrity&&(G.integrity=P.integrity),P.referrerPolicy&&(G.referrerPolicy=P.referrerPolicy),P.crossOrigin==="use-credentials"?G.credentials="include":P.crossOrigin==="anonymous"?G.credentials="omit":G.credentials="same-origin",G}function g(P){if(P.ep)return;P.ep=!0;const G=Y(P);fetch(P.href,G)}})();var $u={exports:{}},bl={};/**
 * @license React
 * react-jsx-runtime.production.js
 *
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */var nd;function jm(){if(nd)return bl;nd=1;var O=Symbol.for("react.transitional.element"),te=Symbol.for("react.fragment");function Y(g,P,G){var pe=null;if(G!==void 0&&(pe=""+G),P.key!==void 0&&(pe=""+P.key),"key"in P){G={};for(var Ae in P)Ae!=="key"&&(G[Ae]=P[Ae])}else G=P;return P=G.ref,{$$typeof:O,type:g,key:pe,ref:P!==void 0?P:null,props:G}}return bl.Fragment=te,bl.jsx=Y,bl.jsxs=Y,bl}var ad;function _m(){return ad||(ad=1,$u.exports=jm()),$u.exports}var f=_m(),Iu={exports:{}},B={};/**
 * @license React
 * react.production.js
 *
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */var ld;function Xm(){if(ld)return B;ld=1;var O=Symbol.for("react.transitional.element"),te=Symbol.for("react.portal"),Y=Symbol.for("react.fragment"),g=Symbol.for("react.strict_mode"),P=Symbol.for("react.profiler"),G=Symbol.for("react.consumer"),pe=Symbol.for("react.context"),Ae=Symbol.for("react.forward_ref"),L=Symbol.for("react.suspense"),T=Symbol.for("react.memo"),H=Symbol.for("react.lazy"),ne=Symbol.iterator;function w(c){return c===null||typeof c!="object"?null:(c=ne&&c[ne]||c["@@iterator"],typeof c=="function"?c:null)}var I={isMounted:function(){return!1},enqueueForceUpdate:function(){},enqueueReplaceState:function(){},enqueueSetState:function(){}},ee=Object.assign,Ye={};function Ue(c,R,A){this.props=c,this.context=R,this.refs=Ye,this.updater=A||I}Ue.prototype.isReactComponent={},Ue.prototype.setState=function(c,R){if(typeof c!="object"&&typeof c!="function"&&c!=null)throw Error("takes an object of state variables to update or a function which returns an object of state variables.");this.updater.enqueueSetState(this,c,R,"setState")},Ue.prototype.forceUpdate=function(c){this.updater.enqueueForceUpdate(this,c,"forceUpdate")};function _(){}_.prototype=Ue.prototype;function Mt(c,R,A){this.props=c,this.context=R,this.refs=Ye,this.updater=A||I}var Ne=Mt.prototype=new _;Ne.constructor=Mt,ee(Ne,Ue.prototype),Ne.isPureReactComponent=!0;var mt=Array.isArray,F={H:null,A:null,T:null,S:null,V:null},Qe=Object.prototype.hasOwnProperty;function Ke(c,R,A,M,N,k){return A=k.ref,{$$typeof:O,type:c,key:R,ref:A!==void 0?A:null,props:k}}function Je(c,R){return Ke(c.type,R,void 0,void 0,void 0,c.props)}function Et(c){return typeof c=="object"&&c!==null&&c.$$typeof===O}function jn(c){var R={"=":"=0",":":"=2"};return"$"+c.replace(/[=:]/g,function(A){return R[A]})}var xt=/\/+/g;function ze(c,R){return typeof c=="object"&&c!==null&&c.key!=null?jn(""+c.key):R.toString(36)}function vn(){}function hn(c){switch(c.status){case"fulfilled":return c.value;case"rejected":throw c.reason;default:switch(typeof c.status=="string"?c.then(vn,vn):(c.status="pending",c.then(function(R){c.status==="pending"&&(c.status="fulfilled",c.value=R)},function(R){c.status==="pending"&&(c.status="rejected",c.reason=R)})),c.status){case"fulfilled":return c.value;case"rejected":throw c.reason}}throw c}function De(c,R,A,M,N){var k=typeof c;(k==="undefined"||k==="boolean")&&(c=null);var X=!1;if(c===null)X=!0;else switch(k){case"bigint":case"string":case"number":X=!0;break;case"object":switch(c.$$typeof){case O:case te:X=!0;break;case H:return X=c._init,De(X(c._payload),R,A,M,N)}}if(X)return N=N(c),X=M===""?"."+ze(c,0):M,mt(N)?(A="",X!=null&&(A=X.replace(xt,"$&/")+"/"),De(N,R,A,"",function(Gt){return Gt})):N!=null&&(Et(N)&&(N=Je(N,A+(N.key==null||c&&c.key===N.key?"":(""+N.key).replace(xt,"$&/")+"/")+X)),R.push(N)),1;X=0;var we=M===""?".":M+":";if(mt(c))for(var fe=0;fe<c.length;fe++)M=c[fe],k=we+ze(M,fe),X+=De(M,R,A,k,N);else if(fe=w(c),typeof fe=="function")for(c=fe.call(c),fe=0;!(M=c.next()).done;)M=M.value,k=we+ze(M,fe++),X+=De(M,R,A,k,N);else if(k==="object"){if(typeof c.then=="function")return De(hn(c),R,A,M,N);throw R=String(c),Error("Objects are not valid as a React child (found: "+(R==="[object Object]"?"object with keys {"+Object.keys(c).join(", ")+"}":R)+"). If you meant to render a collection of children, use an array instead.")}return X}function b(c,R,A){if(c==null)return c;var M=[],N=0;return De(c,M,"","",function(k){return R.call(A,k,N++)}),M}function x(c){if(c._status===-1){var R=c._result;R=R(),R.then(function(A){(c._status===0||c._status===-1)&&(c._status=1,c._result=A)},function(A){(c._status===0||c._status===-1)&&(c._status=2,c._result=A)}),c._status===-1&&(c._status=0,c._result=R)}if(c._status===1)return c._result.default;throw c._result}var C=typeof reportError=="function"?reportError:function(c){if(typeof window=="object"&&typeof window.ErrorEvent=="function"){var R=new window.ErrorEvent("error",{bubbles:!0,cancelable:!0,message:typeof c=="object"&&c!==null&&typeof c.message=="string"?String(c.message):String(c),error:c});if(!window.dispatchEvent(R))return}else if(typeof process=="object"&&typeof process.emit=="function"){process.emit("uncaughtException",c);return}console.error(c)};function re(){}return B.Children={map:b,forEach:function(c,R,A){b(c,function(){R.apply(this,arguments)},A)},count:function(c){var R=0;return b(c,function(){R++}),R},toArray:function(c){return b(c,function(R){return R})||[]},only:function(c){if(!Et(c))throw Error("React.Children.only expected to receive a single React element child.");return c}},B.Component=Ue,B.Fragment=Y,B.Profiler=P,B.PureComponent=Mt,B.StrictMode=g,B.Suspense=L,B.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE=F,B.__COMPILER_RUNTIME={__proto__:null,c:function(c){return F.H.useMemoCache(c)}},B.cache=function(c){return function(){return c.apply(null,arguments)}},B.cloneElement=function(c,R,A){if(c==null)throw Error("The argument must be a React element, but you passed "+c+".");var M=ee({},c.props),N=c.key,k=void 0;if(R!=null)for(X in R.ref!==void 0&&(k=void 0),R.key!==void 0&&(N=""+R.key),R)!Qe.call(R,X)||X==="key"||X==="__self"||X==="__source"||X==="ref"&&R.ref===void 0||(M[X]=R[X]);var X=arguments.length-2;if(X===1)M.children=A;else if(1<X){for(var we=Array(X),fe=0;fe<X;fe++)we[fe]=arguments[fe+2];M.children=we}return Ke(c.type,N,void 0,void 0,k,M)},B.createContext=function(c){return c={$$typeof:pe,_currentValue:c,_currentValue2:c,_threadCount:0,Provider:null,Consumer:null},c.Provider=c,c.Consumer={$$typeof:G,_context:c},c},B.createElement=function(c,R,A){var M,N={},k=null;if(R!=null)for(M in R.key!==void 0&&(k=""+R.key),R)Qe.call(R,M)&&M!=="key"&&M!=="__self"&&M!=="__source"&&(N[M]=R[M]);var X=arguments.length-2;if(X===1)N.children=A;else if(1<X){for(var we=Array(X),fe=0;fe<X;fe++)we[fe]=arguments[fe+2];N.children=we}if(c&&c.defaultProps)for(M in X=c.defaultProps,X)N[M]===void 0&&(N[M]=X[M]);return Ke(c,k,void 0,void 0,null,N)},B.createRef=function(){return{current:null}},B.forwardRef=function(c){return{$$typeof:Ae,render:c}},B.isValidElement=Et,B.lazy=function(c){return{$$typeof:H,_payload:{_status:-1,_result:c},_init:x}},B.memo=function(c,R){return{$$typeof:T,type:c,compare:R===void 0?null:R}},B.startTransition=function(c){var R=F.T,A={};F.T=A;try{var M=c(),N=F.S;N!==null&&N(A,M),typeof M=="object"&&M!==null&&typeof M.then=="function"&&M.then(re,C)}catch(k){C(k)}finally{F.T=R}},B.unstable_useCacheRefresh=function(){return F.H.useCacheRefresh()},B.use=function(c){return F.H.use(c)},B.useActionState=function(c,R,A){return F.H.useActionState(c,R,A)},B.useCallback=function(c,R){return F.H.useCallback(c,R)},B.useContext=function(c){return F.H.useContext(c)},B.useDebugValue=function(){},B.useDeferredValue=function(c,R){return F.H.useDeferredValue(c,R)},B.useEffect=function(c,R,A){var M=F.H;if(typeof A=="function")throw Error("useEffect CRUD overload is not enabled in this build of React.");return M.useEffect(c,R)},B.useId=function(){return F.H.useId()},B.useImperativeHandle=function(c,R,A){return F.H.useImperativeHandle(c,R,A)},B.useInsertionEffect=function(c,R){return F.H.useInsertionEffect(c,R)},B.useLayoutEffect=function(c,R){return F.H.useLayoutEffect(c,R)},B.useMemo=function(c,R){return F.H.useMemo(c,R)},B.useOptimistic=function(c,R){return F.H.useOptimistic(c,R)},B.useReducer=function(c,R,A){return F.H.useReducer(c,R,A)},B.useRef=function(c){return F.H.useRef(c)},B.useState=function(c){return F.H.useState(c)},B.useSyncExternalStore=function(c,R,A){return F.H.useSyncExternalStore(c,R,A)},B.useTransition=function(){return F.H.useTransition()},B.version="19.1.9",B}var id;function ur(){return id||(id=1,Iu.exports=Xm()),Iu.exports}var Cn=ur(),er={exports:{}},yl={},tr={exports:{}},nr={};/**
 * @license React
 * scheduler.production.js
 *
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */var sd;function Ym(){return sd||(sd=1,(function(O){function te(b,x){var C=b.length;b.push(x);e:for(;0<C;){var re=C-1>>>1,c=b[re];if(0<P(c,x))b[re]=x,b[C]=c,C=re;else break e}}function Y(b){return b.length===0?null:b[0]}function g(b){if(b.length===0)return null;var x=b[0],C=b.pop();if(C!==x){b[0]=C;e:for(var re=0,c=b.length,R=c>>>1;re<R;){var A=2*(re+1)-1,M=b[A],N=A+1,k=b[N];if(0>P(M,C))N<c&&0>P(k,M)?(b[re]=k,b[N]=C,re=N):(b[re]=M,b[A]=C,re=A);else if(N<c&&0>P(k,C))b[re]=k,b[N]=C,re=N;else break e}}return x}function P(b,x){var C=b.sortIndex-x.sortIndex;return C!==0?C:b.id-x.id}if(O.unstable_now=void 0,typeof performance=="object"&&typeof performance.now=="function"){var G=performance;O.unstable_now=function(){return G.now()}}else{var pe=Date,Ae=pe.now();O.unstable_now=function(){return pe.now()-Ae}}var L=[],T=[],H=1,ne=null,w=3,I=!1,ee=!1,Ye=!1,Ue=!1,_=typeof setTimeout=="function"?setTimeout:null,Mt=typeof clearTimeout=="function"?clearTimeout:null,Ne=typeof setImmediate<"u"?setImmediate:null;function mt(b){for(var x=Y(T);x!==null;){if(x.callback===null)g(T);else if(x.startTime<=b)g(T),x.sortIndex=x.expirationTime,te(L,x);else break;x=Y(T)}}function F(b){if(Ye=!1,mt(b),!ee)if(Y(L)!==null)ee=!0,Qe||(Qe=!0,ze());else{var x=Y(T);x!==null&&De(F,x.startTime-b)}}var Qe=!1,Ke=-1,Je=5,Et=-1;function jn(){return Ue?!0:!(O.unstable_now()-Et<Je)}function xt(){if(Ue=!1,Qe){var b=O.unstable_now();Et=b;var x=!0;try{e:{ee=!1,Ye&&(Ye=!1,Mt(Ke),Ke=-1),I=!0;var C=w;try{t:{for(mt(b),ne=Y(L);ne!==null&&!(ne.expirationTime>b&&jn());){var re=ne.callback;if(typeof re=="function"){ne.callback=null,w=ne.priorityLevel;var c=re(ne.expirationTime<=b);if(b=O.unstable_now(),typeof c=="function"){ne.callback=c,mt(b),x=!0;break t}ne===Y(L)&&g(L),mt(b)}else g(L);ne=Y(L)}if(ne!==null)x=!0;else{var R=Y(T);R!==null&&De(F,R.startTime-b),x=!1}}break e}finally{ne=null,w=C,I=!1}x=void 0}}finally{x?ze():Qe=!1}}}var ze;if(typeof Ne=="function")ze=function(){Ne(xt)};else if(typeof MessageChannel<"u"){var vn=new MessageChannel,hn=vn.port2;vn.port1.onmessage=xt,ze=function(){hn.postMessage(null)}}else ze=function(){_(xt,0)};function De(b,x){Ke=_(function(){b(O.unstable_now())},x)}O.unstable_IdlePriority=5,O.unstable_ImmediatePriority=1,O.unstable_LowPriority=4,O.unstable_NormalPriority=3,O.unstable_Profiling=null,O.unstable_UserBlockingPriority=2,O.unstable_cancelCallback=function(b){b.callback=null},O.unstable_forceFrameRate=function(b){0>b||125<b?console.error("forceFrameRate takes a positive int between 0 and 125, forcing frame rates higher than 125 fps is not supported"):Je=0<b?Math.floor(1e3/b):5},O.unstable_getCurrentPriorityLevel=function(){return w},O.unstable_next=function(b){switch(w){case 1:case 2:case 3:var x=3;break;default:x=w}var C=w;w=x;try{return b()}finally{w=C}},O.unstable_requestPaint=function(){Ue=!0},O.unstable_runWithPriority=function(b,x){switch(b){case 1:case 2:case 3:case 4:case 5:break;default:b=3}var C=w;w=b;try{return x()}finally{w=C}},O.unstable_scheduleCallback=function(b,x,C){var re=O.unstable_now();switch(typeof C=="object"&&C!==null?(C=C.delay,C=typeof C=="number"&&0<C?re+C:re):C=re,b){case 1:var c=-1;break;case 2:c=250;break;case 5:c=1073741823;break;case 4:c=1e4;break;default:c=5e3}return c=C+c,b={id:H++,callback:x,priorityLevel:b,startTime:C,expirationTime:c,sortIndex:-1},C>re?(b.sortIndex=C,te(T,b),Y(L)===null&&b===Y(T)&&(Ye?(Mt(Ke),Ke=-1):Ye=!0,De(F,C-re))):(b.sortIndex=c,te(L,b),ee||I||(ee=!0,Qe||(Qe=!0,ze()))),b},O.unstable_shouldYield=jn,O.unstable_wrapCallback=function(b){var x=w;return function(){var C=w;w=x;try{return b.apply(this,arguments)}finally{w=C}}}})(nr)),nr}var ud;function Bm(){return ud||(ud=1,tr.exports=Ym()),tr.exports}var ar={exports:{}},_e={};/**
 * @license React
 * react-dom.production.js
 *
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */var rd;function Pm(){if(rd)return _e;rd=1;var O=ur();function te(L){var T="https://react.dev/errors/"+L;if(1<arguments.length){T+="?args[]="+encodeURIComponent(arguments[1]);for(var H=2;H<arguments.length;H++)T+="&args[]="+encodeURIComponent(arguments[H])}return"Minified React error #"+L+"; visit "+T+" for the full message or use the non-minified dev environment for full errors and additional helpful warnings."}function Y(){}var g={d:{f:Y,r:function(){throw Error(te(522))},D:Y,C:Y,L:Y,m:Y,X:Y,S:Y,M:Y},p:0,findDOMNode:null},P=Symbol.for("react.portal");function G(L,T,H){var ne=3<arguments.length&&arguments[3]!==void 0?arguments[3]:null;return{$$typeof:P,key:ne==null?null:""+ne,children:L,containerInfo:T,implementation:H}}var pe=O.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;function Ae(L,T){if(L==="font")return"";if(typeof T=="string")return T==="use-credentials"?T:""}return _e.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE=g,_e.createPortal=function(L,T){var H=2<arguments.length&&arguments[2]!==void 0?arguments[2]:null;if(!T||T.nodeType!==1&&T.nodeType!==9&&T.nodeType!==11)throw Error(te(299));return G(L,T,null,H)},_e.flushSync=function(L){var T=pe.T,H=g.p;try{if(pe.T=null,g.p=2,L)return L()}finally{pe.T=T,g.p=H,g.d.f()}},_e.preconnect=function(L,T){typeof L=="string"&&(T?(T=T.crossOrigin,T=typeof T=="string"?T==="use-credentials"?T:"":void 0):T=null,g.d.C(L,T))},_e.prefetchDNS=function(L){typeof L=="string"&&g.d.D(L)},_e.preinit=function(L,T){if(typeof L=="string"&&T&&typeof T.as=="string"){var H=T.as,ne=Ae(H,T.crossOrigin),w=typeof T.integrity=="string"?T.integrity:void 0,I=typeof T.fetchPriority=="string"?T.fetchPriority:void 0;H==="style"?g.d.S(L,typeof T.precedence=="string"?T.precedence:void 0,{crossOrigin:ne,integrity:w,fetchPriority:I}):H==="script"&&g.d.X(L,{crossOrigin:ne,integrity:w,fetchPriority:I,nonce:typeof T.nonce=="string"?T.nonce:void 0})}},_e.preinitModule=function(L,T){if(typeof L=="string")if(typeof T=="object"&&T!==null){if(T.as==null||T.as==="script"){var H=Ae(T.as,T.crossOrigin);g.d.M(L,{crossOrigin:H,integrity:typeof T.integrity=="string"?T.integrity:void 0,nonce:typeof T.nonce=="string"?T.nonce:void 0})}}else T==null&&g.d.M(L)},_e.preload=function(L,T){if(typeof L=="string"&&typeof T=="object"&&T!==null&&typeof T.as=="string"){var H=T.as,ne=Ae(H,T.crossOrigin);g.d.L(L,H,{crossOrigin:ne,integrity:typeof T.integrity=="string"?T.integrity:void 0,nonce:typeof T.nonce=="string"?T.nonce:void 0,type:typeof T.type=="string"?T.type:void 0,fetchPriority:typeof T.fetchPriority=="string"?T.fetchPriority:void 0,referrerPolicy:typeof T.referrerPolicy=="string"?T.referrerPolicy:void 0,imageSrcSet:typeof T.imageSrcSet=="string"?T.imageSrcSet:void 0,imageSizes:typeof T.imageSizes=="string"?T.imageSizes:void 0,media:typeof T.media=="string"?T.media:void 0})}},_e.preloadModule=function(L,T){if(typeof L=="string")if(T){var H=Ae(T.as,T.crossOrigin);g.d.m(L,{as:typeof T.as=="string"&&T.as!=="script"?T.as:void 0,crossOrigin:H,integrity:typeof T.integrity=="string"?T.integrity:void 0})}else g.d.m(L)},_e.requestFormReset=function(L){g.d.r(L)},_e.unstable_batchedUpdates=function(L,T){return L(T)},_e.useFormState=function(L,T,H){return pe.H.useFormState(L,T,H)},_e.useFormStatus=function(){return pe.H.useHostTransitionStatus()},_e.version="19.1.9",_e}var cd;function Gm(){if(cd)return ar.exports;cd=1;function O(){if(!(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__>"u"||typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE!="function"))try{__REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(O)}catch(te){console.error(te)}}return O(),ar.exports=Pm(),ar.exports}/**
 * @license React
 * react-dom-client.production.js
 *
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */var od;function Vm(){if(od)return yl;od=1;var O=Bm(),te=ur(),Y=Gm();function g(e){var t="https://react.dev/errors/"+e;if(1<arguments.length){t+="?args[]="+encodeURIComponent(arguments[1]);for(var n=2;n<arguments.length;n++)t+="&args[]="+encodeURIComponent(arguments[n])}return"Minified React error #"+e+"; visit "+t+" for the full message or use the non-minified dev environment for full errors and additional helpful warnings."}function P(e){return!(!e||e.nodeType!==1&&e.nodeType!==9&&e.nodeType!==11)}function G(e){var t=e,n=e;if(e.alternate)for(;t.return;)t=t.return;else{e=t;do t=e,(t.flags&4098)!==0&&(n=t.return),e=t.return;while(e)}return t.tag===3?n:null}function pe(e){if(e.tag===13){var t=e.memoizedState;if(t===null&&(e=e.alternate,e!==null&&(t=e.memoizedState)),t!==null)return t.dehydrated}return null}function Ae(e){if(G(e)!==e)throw Error(g(188))}function L(e){var t=e.alternate;if(!t){if(t=G(e),t===null)throw Error(g(188));return t!==e?null:e}for(var n=e,a=t;;){var l=n.return;if(l===null)break;var i=l.alternate;if(i===null){if(a=l.return,a!==null){n=a;continue}break}if(l.child===i.child){for(i=l.child;i;){if(i===n)return Ae(l),e;if(i===a)return Ae(l),t;i=i.sibling}throw Error(g(188))}if(n.return!==a.return)n=l,a=i;else{for(var s=!1,u=l.child;u;){if(u===n){s=!0,n=l,a=i;break}if(u===a){s=!0,a=l,n=i;break}u=u.sibling}if(!s){for(u=i.child;u;){if(u===n){s=!0,n=i,a=l;break}if(u===a){s=!0,a=i,n=l;break}u=u.sibling}if(!s)throw Error(g(189))}}if(n.alternate!==a)throw Error(g(190))}if(n.tag!==3)throw Error(g(188));return n.stateNode.current===n?e:t}function T(e){var t=e.tag;if(t===5||t===26||t===27||t===6)return e;for(e=e.child;e!==null;){if(t=T(e),t!==null)return t;e=e.sibling}return null}var H=Object.assign,ne=Symbol.for("react.element"),w=Symbol.for("react.transitional.element"),I=Symbol.for("react.portal"),ee=Symbol.for("react.fragment"),Ye=Symbol.for("react.strict_mode"),Ue=Symbol.for("react.profiler"),_=Symbol.for("react.provider"),Mt=Symbol.for("react.consumer"),Ne=Symbol.for("react.context"),mt=Symbol.for("react.forward_ref"),F=Symbol.for("react.suspense"),Qe=Symbol.for("react.suspense_list"),Ke=Symbol.for("react.memo"),Je=Symbol.for("react.lazy"),Et=Symbol.for("react.activity"),jn=Symbol.for("react.memo_cache_sentinel"),xt=Symbol.iterator;function ze(e){return e===null||typeof e!="object"?null:(e=xt&&e[xt]||e["@@iterator"],typeof e=="function"?e:null)}var vn=Symbol.for("react.client.reference");function hn(e){if(e==null)return null;if(typeof e=="function")return e.$$typeof===vn?null:e.displayName||e.name||null;if(typeof e=="string")return e;switch(e){case ee:return"Fragment";case Ue:return"Profiler";case Ye:return"StrictMode";case F:return"Suspense";case Qe:return"SuspenseList";case Et:return"Activity"}if(typeof e=="object")switch(e.$$typeof){case I:return"Portal";case Ne:return(e.displayName||"Context")+".Provider";case Mt:return(e._context.displayName||"Context")+".Consumer";case mt:var t=e.render;return e=e.displayName,e||(e=t.displayName||t.name||"",e=e!==""?"ForwardRef("+e+")":"ForwardRef"),e;case Ke:return t=e.displayName||null,t!==null?t:hn(e.type)||"Memo";case Je:t=e._payload,e=e._init;try{return hn(e(t))}catch{}}return null}var De=Array.isArray,b=te.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE,x=Y.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE,C={pending:!1,data:null,method:null,action:null},re=[],c=-1;function R(e){return{current:e}}function A(e){0>c||(e.current=re[c],re[c]=null,c--)}function M(e,t){c++,re[c]=e.current,e.current=t}var N=R(null),k=R(null),X=R(null),we=R(null);function fe(e,t){switch(M(X,t),M(k,e),M(N,null),t.nodeType){case 9:case 11:e=(e=t.documentElement)&&(e=e.namespaceURI)?qf(e):0;break;default:if(e=t.tagName,t=t.namespaceURI)t=qf(t),e=Lf(t,e);else switch(e){case"svg":e=1;break;case"math":e=2;break;default:e=0}}A(N),M(N,e)}function Gt(){A(N),A(k),A(X)}function _i(e){e.memoizedState!==null&&M(we,e);var t=N.current,n=Lf(t,e.type);t!==n&&(M(k,e),M(N,n))}function Sl(e){k.current===e&&(A(N),A(k)),we.current===e&&(A(we),ml._currentValue=C)}var Xi=Object.prototype.hasOwnProperty,Yi=O.unstable_scheduleCallback,Bi=O.unstable_cancelCallback,md=O.unstable_shouldYield,vd=O.unstable_requestPaint,bt=O.unstable_now,hd=O.unstable_getCurrentPriorityLevel,rr=O.unstable_ImmediatePriority,cr=O.unstable_UserBlockingPriority,Tl=O.unstable_NormalPriority,gd=O.unstable_LowPriority,or=O.unstable_IdlePriority,Ed=O.log,bd=O.unstable_setDisableYieldValue,Ta=null,Fe=null;function Vt(e){if(typeof Ed=="function"&&bd(e),Fe&&typeof Fe.setStrictMode=="function")try{Fe.setStrictMode(Ta,e)}catch{}}var ke=Math.clz32?Math.clz32:Td,yd=Math.log,Sd=Math.LN2;function Td(e){return e>>>=0,e===0?32:31-(yd(e)/Sd|0)|0}var Rl=256,Ol=4194304;function gn(e){var t=e&42;if(t!==0)return t;switch(e&-e){case 1:return 1;case 2:return 2;case 4:return 4;case 8:return 8;case 16:return 16;case 32:return 32;case 64:return 64;case 128:return 128;case 256:case 512:case 1024:case 2048:case 4096:case 8192:case 16384:case 32768:case 65536:case 131072:case 262144:case 524288:case 1048576:case 2097152:return e&4194048;case 4194304:case 8388608:case 16777216:case 33554432:return e&62914560;case 67108864:return 67108864;case 134217728:return 134217728;case 268435456:return 268435456;case 536870912:return 536870912;case 1073741824:return 0;default:return e}}function Ml(e,t,n){var a=e.pendingLanes;if(a===0)return 0;var l=0,i=e.suspendedLanes,s=e.pingedLanes;e=e.warmLanes;var u=a&134217727;return u!==0?(a=u&~i,a!==0?l=gn(a):(s&=u,s!==0?l=gn(s):n||(n=u&~e,n!==0&&(l=gn(n))))):(u=a&~i,u!==0?l=gn(u):s!==0?l=gn(s):n||(n=a&~e,n!==0&&(l=gn(n)))),l===0?0:t!==0&&t!==l&&(t&i)===0&&(i=l&-l,n=t&-t,i>=n||i===32&&(n&4194048)!==0)?t:l}function Ra(e,t){return(e.pendingLanes&~(e.suspendedLanes&~e.pingedLanes)&t)===0}function Rd(e,t){switch(e){case 1:case 2:case 4:case 8:case 64:return t+250;case 16:case 32:case 128:case 256:case 512:case 1024:case 2048:case 4096:case 8192:case 16384:case 32768:case 65536:case 131072:case 262144:case 524288:case 1048576:case 2097152:return t+5e3;case 4194304:case 8388608:case 16777216:case 33554432:return-1;case 67108864:case 134217728:case 268435456:case 536870912:case 1073741824:return-1;default:return-1}}function fr(){var e=Rl;return Rl<<=1,(Rl&4194048)===0&&(Rl=256),e}function dr(){var e=Ol;return Ol<<=1,(Ol&62914560)===0&&(Ol=4194304),e}function Pi(e){for(var t=[],n=0;31>n;n++)t.push(e);return t}function Oa(e,t){e.pendingLanes|=t,t!==268435456&&(e.suspendedLanes=0,e.pingedLanes=0,e.warmLanes=0)}function Od(e,t,n,a,l,i){var s=e.pendingLanes;e.pendingLanes=n,e.suspendedLanes=0,e.pingedLanes=0,e.warmLanes=0,e.expiredLanes&=n,e.entangledLanes&=n,e.errorRecoveryDisabledLanes&=n,e.shellSuspendCounter=0;var u=e.entanglements,r=e.expirationTimes,m=e.hiddenUpdates;for(n=s&~n;0<n;){var E=31-ke(n),S=1<<E;u[E]=0,r[E]=-1;var v=m[E];if(v!==null)for(m[E]=null,E=0;E<v.length;E++){var h=v[E];h!==null&&(h.lane&=-536870913)}n&=~S}a!==0&&pr(e,a,0),i!==0&&l===0&&e.tag!==0&&(e.suspendedLanes|=i&~(s&~t))}function pr(e,t,n){e.pendingLanes|=t,e.suspendedLanes&=~t;var a=31-ke(t);e.entangledLanes|=t,e.entanglements[a]=e.entanglements[a]|1073741824|n&4194090}function mr(e,t){var n=e.entangledLanes|=t;for(e=e.entanglements;n;){var a=31-ke(n),l=1<<a;l&t|e[a]&t&&(e[a]|=t),n&=~l}}function Gi(e){switch(e){case 2:e=1;break;case 8:e=4;break;case 32:e=16;break;case 256:case 512:case 1024:case 2048:case 4096:case 8192:case 16384:case 32768:case 65536:case 131072:case 262144:case 524288:case 1048576:case 2097152:case 4194304:case 8388608:case 16777216:case 33554432:e=128;break;case 268435456:e=134217728;break;default:e=0}return e}function Vi(e){return e&=-e,2<e?8<e?(e&134217727)!==0?32:268435456:8:2}function vr(){var e=x.p;return e!==0?e:(e=window.event,e===void 0?32:kf(e.type))}function Md(e,t){var n=x.p;try{return x.p=e,t()}finally{x.p=n}}var Zt=Math.random().toString(36).slice(2),Ce="__reactFiber$"+Zt,Be="__reactProps$"+Zt,_n="__reactContainer$"+Zt,Zi="__reactEvents$"+Zt,xd="__reactListeners$"+Zt,Ad="__reactHandles$"+Zt,hr="__reactResources$"+Zt,Ma="__reactMarker$"+Zt;function Qi(e){delete e[Ce],delete e[Be],delete e[Zi],delete e[xd],delete e[Ad]}function Xn(e){var t=e[Ce];if(t)return t;for(var n=e.parentNode;n;){if(t=n[_n]||n[Ce]){if(n=t.alternate,t.child!==null||n!==null&&n.child!==null)for(e=Cf(e);e!==null;){if(n=e[Ce])return n;e=Cf(e)}return t}e=n,n=e.parentNode}return null}function Yn(e){if(e=e[Ce]||e[_n]){var t=e.tag;if(t===5||t===6||t===13||t===26||t===27||t===3)return e}return null}function xa(e){var t=e.tag;if(t===5||t===26||t===27||t===6)return e.stateNode;throw Error(g(33))}function Bn(e){var t=e[hr];return t||(t=e[hr]={hoistableStyles:new Map,hoistableScripts:new Map}),t}function Re(e){e[Ma]=!0}var gr=new Set,Er={};function En(e,t){Pn(e,t),Pn(e+"Capture",t)}function Pn(e,t){for(Er[e]=t,e=0;e<t.length;e++)gr.add(t[e])}var Ud=RegExp("^[:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD][:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040]*$"),br={},yr={};function Hd(e){return Xi.call(yr,e)?!0:Xi.call(br,e)?!1:Ud.test(e)?yr[e]=!0:(br[e]=!0,!1)}function xl(e,t,n){if(Hd(t))if(n===null)e.removeAttribute(t);else{switch(typeof n){case"undefined":case"function":case"symbol":e.removeAttribute(t);return;case"boolean":var a=t.toLowerCase().slice(0,5);if(a!=="data-"&&a!=="aria-"){e.removeAttribute(t);return}}e.setAttribute(t,""+n)}}function Al(e,t,n){if(n===null)e.removeAttribute(t);else{switch(typeof n){case"undefined":case"function":case"symbol":case"boolean":e.removeAttribute(t);return}e.setAttribute(t,""+n)}}function At(e,t,n,a){if(a===null)e.removeAttribute(n);else{switch(typeof a){case"undefined":case"function":case"symbol":case"boolean":e.removeAttribute(n);return}e.setAttributeNS(t,n,""+a)}}var Ki,Sr;function Gn(e){if(Ki===void 0)try{throw Error()}catch(n){var t=n.stack.trim().match(/\n( *(at )?)/);Ki=t&&t[1]||"",Sr=-1<n.stack.indexOf(`
    at`)?" (<anonymous>)":-1<n.stack.indexOf("@")?"@unknown:0:0":""}return`
`+Ki+e+Sr}var Ji=!1;function wi(e,t){if(!e||Ji)return"";Ji=!0;var n=Error.prepareStackTrace;Error.prepareStackTrace=void 0;try{var a={DetermineComponentFrameRoot:function(){try{if(t){var S=function(){throw Error()};if(Object.defineProperty(S.prototype,"props",{set:function(){throw Error()}}),typeof Reflect=="object"&&Reflect.construct){try{Reflect.construct(S,[])}catch(h){var v=h}Reflect.construct(e,[],S)}else{try{S.call()}catch(h){v=h}e.call(S.prototype)}}else{try{throw Error()}catch(h){v=h}(S=e())&&typeof S.catch=="function"&&S.catch(function(){})}}catch(h){if(h&&v&&typeof h.stack=="string")return[h.stack,v.stack]}return[null,null]}};a.DetermineComponentFrameRoot.displayName="DetermineComponentFrameRoot";var l=Object.getOwnPropertyDescriptor(a.DetermineComponentFrameRoot,"name");l&&l.configurable&&Object.defineProperty(a.DetermineComponentFrameRoot,"name",{value:"DetermineComponentFrameRoot"});var i=a.DetermineComponentFrameRoot(),s=i[0],u=i[1];if(s&&u){var r=s.split(`
`),m=u.split(`
`);for(l=a=0;a<r.length&&!r[a].includes("DetermineComponentFrameRoot");)a++;for(;l<m.length&&!m[l].includes("DetermineComponentFrameRoot");)l++;if(a===r.length||l===m.length)for(a=r.length-1,l=m.length-1;1<=a&&0<=l&&r[a]!==m[l];)l--;for(;1<=a&&0<=l;a--,l--)if(r[a]!==m[l]){if(a!==1||l!==1)do if(a--,l--,0>l||r[a]!==m[l]){var E=`
`+r[a].replace(" at new "," at ");return e.displayName&&E.includes("<anonymous>")&&(E=E.replace("<anonymous>",e.displayName)),E}while(1<=a&&0<=l);break}}}finally{Ji=!1,Error.prepareStackTrace=n}return(n=e?e.displayName||e.name:"")?Gn(n):""}function qd(e){switch(e.tag){case 26:case 27:case 5:return Gn(e.type);case 16:return Gn("Lazy");case 13:return Gn("Suspense");case 19:return Gn("SuspenseList");case 0:case 15:return wi(e.type,!1);case 11:return wi(e.type.render,!1);case 1:return wi(e.type,!0);case 31:return Gn("Activity");default:return""}}function Tr(e){try{var t="";do t+=qd(e),e=e.return;while(e);return t}catch(n){return`
Error generating stack: `+n.message+`
`+n.stack}}function lt(e){switch(typeof e){case"bigint":case"boolean":case"number":case"string":case"undefined":return e;case"object":return e;default:return""}}function Rr(e){var t=e.type;return(e=e.nodeName)&&e.toLowerCase()==="input"&&(t==="checkbox"||t==="radio")}function Ld(e){var t=Rr(e)?"checked":"value",n=Object.getOwnPropertyDescriptor(e.constructor.prototype,t),a=""+e[t];if(!e.hasOwnProperty(t)&&typeof n<"u"&&typeof n.get=="function"&&typeof n.set=="function"){var l=n.get,i=n.set;return Object.defineProperty(e,t,{configurable:!0,get:function(){return l.call(this)},set:function(s){a=""+s,i.call(this,s)}}),Object.defineProperty(e,t,{enumerable:n.enumerable}),{getValue:function(){return a},setValue:function(s){a=""+s},stopTracking:function(){e._valueTracker=null,delete e[t]}}}}function Ul(e){e._valueTracker||(e._valueTracker=Ld(e))}function Or(e){if(!e)return!1;var t=e._valueTracker;if(!t)return!0;var n=t.getValue(),a="";return e&&(a=Rr(e)?e.checked?"true":"false":e.value),e=a,e!==n?(t.setValue(e),!0):!1}function Hl(e){if(e=e||(typeof document<"u"?document:void 0),typeof e>"u")return null;try{return e.activeElement||e.body}catch{return e.body}}var Nd=/[\n"\\]/g;function it(e){return e.replace(Nd,function(t){return"\\"+t.charCodeAt(0).toString(16)+" "})}function Fi(e,t,n,a,l,i,s,u){e.name="",s!=null&&typeof s!="function"&&typeof s!="symbol"&&typeof s!="boolean"?e.type=s:e.removeAttribute("type"),t!=null?s==="number"?(t===0&&e.value===""||e.value!=t)&&(e.value=""+lt(t)):e.value!==""+lt(t)&&(e.value=""+lt(t)):s!=="submit"&&s!=="reset"||e.removeAttribute("value"),t!=null?ki(e,s,lt(t)):n!=null?ki(e,s,lt(n)):a!=null&&e.removeAttribute("value"),l==null&&i!=null&&(e.defaultChecked=!!i),l!=null&&(e.checked=l&&typeof l!="function"&&typeof l!="symbol"),u!=null&&typeof u!="function"&&typeof u!="symbol"&&typeof u!="boolean"?e.name=""+lt(u):e.removeAttribute("name")}function Mr(e,t,n,a,l,i,s,u){if(i!=null&&typeof i!="function"&&typeof i!="symbol"&&typeof i!="boolean"&&(e.type=i),t!=null||n!=null){if(!(i!=="submit"&&i!=="reset"||t!=null))return;n=n!=null?""+lt(n):"",t=t!=null?""+lt(t):n,u||t===e.value||(e.value=t),e.defaultValue=t}a=a??l,a=typeof a!="function"&&typeof a!="symbol"&&!!a,e.checked=u?e.checked:!!a,e.defaultChecked=!!a,s!=null&&typeof s!="function"&&typeof s!="symbol"&&typeof s!="boolean"&&(e.name=s)}function ki(e,t,n){t==="number"&&Hl(e.ownerDocument)===e||e.defaultValue===""+n||(e.defaultValue=""+n)}function Vn(e,t,n,a){if(e=e.options,t){t={};for(var l=0;l<n.length;l++)t["$"+n[l]]=!0;for(n=0;n<e.length;n++)l=t.hasOwnProperty("$"+e[n].value),e[n].selected!==l&&(e[n].selected=l),l&&a&&(e[n].defaultSelected=!0)}else{for(n=""+lt(n),t=null,l=0;l<e.length;l++){if(e[l].value===n){e[l].selected=!0,a&&(e[l].defaultSelected=!0);return}t!==null||e[l].disabled||(t=e[l])}t!==null&&(t.selected=!0)}}function xr(e,t,n){if(t!=null&&(t=""+lt(t),t!==e.value&&(e.value=t),n==null)){e.defaultValue!==t&&(e.defaultValue=t);return}e.defaultValue=n!=null?""+lt(n):""}function Ar(e,t,n,a){if(t==null){if(a!=null){if(n!=null)throw Error(g(92));if(De(a)){if(1<a.length)throw Error(g(93));a=a[0]}n=a}n==null&&(n=""),t=n}n=lt(t),e.defaultValue=n,a=e.textContent,a===n&&a!==""&&a!==null&&(e.value=a)}function Zn(e,t){if(t){var n=e.firstChild;if(n&&n===e.lastChild&&n.nodeType===3){n.nodeValue=t;return}}e.textContent=t}var zd=new Set("animationIterationCount aspectRatio borderImageOutset borderImageSlice borderImageWidth boxFlex boxFlexGroup boxOrdinalGroup columnCount columns flex flexGrow flexPositive flexShrink flexNegative flexOrder gridArea gridRow gridRowEnd gridRowSpan gridRowStart gridColumn gridColumnEnd gridColumnSpan gridColumnStart fontWeight lineClamp lineHeight opacity order orphans scale tabSize widows zIndex zoom fillOpacity floodOpacity stopOpacity strokeDasharray strokeDashoffset strokeMiterlimit strokeOpacity strokeWidth MozAnimationIterationCount MozBoxFlex MozBoxFlexGroup MozLineClamp msAnimationIterationCount msFlex msZoom msFlexGrow msFlexNegative msFlexOrder msFlexPositive msFlexShrink msGridColumn msGridColumnSpan msGridRow msGridRowSpan WebkitAnimationIterationCount WebkitBoxFlex WebKitBoxFlexGroup WebkitBoxOrdinalGroup WebkitColumnCount WebkitColumns WebkitFlex WebkitFlexGrow WebkitFlexPositive WebkitFlexShrink WebkitLineClamp".split(" "));function Ur(e,t,n){var a=t.indexOf("--")===0;n==null||typeof n=="boolean"||n===""?a?e.setProperty(t,""):t==="float"?e.cssFloat="":e[t]="":a?e.setProperty(t,n):typeof n!="number"||n===0||zd.has(t)?t==="float"?e.cssFloat=n:e[t]=(""+n).trim():e[t]=n+"px"}function Hr(e,t,n){if(t!=null&&typeof t!="object")throw Error(g(62));if(e=e.style,n!=null){for(var a in n)!n.hasOwnProperty(a)||t!=null&&t.hasOwnProperty(a)||(a.indexOf("--")===0?e.setProperty(a,""):a==="float"?e.cssFloat="":e[a]="");for(var l in t)a=t[l],t.hasOwnProperty(l)&&n[l]!==a&&Ur(e,l,a)}else for(var i in t)t.hasOwnProperty(i)&&Ur(e,i,t[i])}function Wi(e){if(e.indexOf("-")===-1)return!1;switch(e){case"annotation-xml":case"color-profile":case"font-face":case"font-face-src":case"font-face-uri":case"font-face-format":case"font-face-name":case"missing-glyph":return!1;default:return!0}}var Dd=new Map([["acceptCharset","accept-charset"],["htmlFor","for"],["httpEquiv","http-equiv"],["crossOrigin","crossorigin"],["accentHeight","accent-height"],["alignmentBaseline","alignment-baseline"],["arabicForm","arabic-form"],["baselineShift","baseline-shift"],["capHeight","cap-height"],["clipPath","clip-path"],["clipRule","clip-rule"],["colorInterpolation","color-interpolation"],["colorInterpolationFilters","color-interpolation-filters"],["colorProfile","color-profile"],["colorRendering","color-rendering"],["dominantBaseline","dominant-baseline"],["enableBackground","enable-background"],["fillOpacity","fill-opacity"],["fillRule","fill-rule"],["floodColor","flood-color"],["floodOpacity","flood-opacity"],["fontFamily","font-family"],["fontSize","font-size"],["fontSizeAdjust","font-size-adjust"],["fontStretch","font-stretch"],["fontStyle","font-style"],["fontVariant","font-variant"],["fontWeight","font-weight"],["glyphName","glyph-name"],["glyphOrientationHorizontal","glyph-orientation-horizontal"],["glyphOrientationVertical","glyph-orientation-vertical"],["horizAdvX","horiz-adv-x"],["horizOriginX","horiz-origin-x"],["imageRendering","image-rendering"],["letterSpacing","letter-spacing"],["lightingColor","lighting-color"],["markerEnd","marker-end"],["markerMid","marker-mid"],["markerStart","marker-start"],["overlinePosition","overline-position"],["overlineThickness","overline-thickness"],["paintOrder","paint-order"],["panose-1","panose-1"],["pointerEvents","pointer-events"],["renderingIntent","rendering-intent"],["shapeRendering","shape-rendering"],["stopColor","stop-color"],["stopOpacity","stop-opacity"],["strikethroughPosition","strikethrough-position"],["strikethroughThickness","strikethrough-thickness"],["strokeDasharray","stroke-dasharray"],["strokeDashoffset","stroke-dashoffset"],["strokeLinecap","stroke-linecap"],["strokeLinejoin","stroke-linejoin"],["strokeMiterlimit","stroke-miterlimit"],["strokeOpacity","stroke-opacity"],["strokeWidth","stroke-width"],["textAnchor","text-anchor"],["textDecoration","text-decoration"],["textRendering","text-rendering"],["transformOrigin","transform-origin"],["underlinePosition","underline-position"],["underlineThickness","underline-thickness"],["unicodeBidi","unicode-bidi"],["unicodeRange","unicode-range"],["unitsPerEm","units-per-em"],["vAlphabetic","v-alphabetic"],["vHanging","v-hanging"],["vIdeographic","v-ideographic"],["vMathematical","v-mathematical"],["vectorEffect","vector-effect"],["vertAdvY","vert-adv-y"],["vertOriginX","vert-origin-x"],["vertOriginY","vert-origin-y"],["wordSpacing","word-spacing"],["writingMode","writing-mode"],["xmlnsXlink","xmlns:xlink"],["xHeight","x-height"]]),Cd=/^[\u0000-\u001F ]*j[\r\n\t]*a[\r\n\t]*v[\r\n\t]*a[\r\n\t]*s[\r\n\t]*c[\r\n\t]*r[\r\n\t]*i[\r\n\t]*p[\r\n\t]*t[\r\n\t]*:/i;function ql(e){return Cd.test(""+e)?"javascript:throw new Error('React has blocked a javascript: URL as a security precaution.')":e}var $i=null;function Ii(e){return e=e.target||e.srcElement||window,e.correspondingUseElement&&(e=e.correspondingUseElement),e.nodeType===3?e.parentNode:e}var Qn=null,Kn=null;function qr(e){var t=Yn(e);if(t&&(e=t.stateNode)){var n=e[Be]||null;e:switch(e=t.stateNode,t.type){case"input":if(Fi(e,n.value,n.defaultValue,n.defaultValue,n.checked,n.defaultChecked,n.type,n.name),t=n.name,n.type==="radio"&&t!=null){for(n=e;n.parentNode;)n=n.parentNode;for(n=n.querySelectorAll('input[name="'+it(""+t)+'"][type="radio"]'),t=0;t<n.length;t++){var a=n[t];if(a!==e&&a.form===e.form){var l=a[Be]||null;if(!l)throw Error(g(90));Fi(a,l.value,l.defaultValue,l.defaultValue,l.checked,l.defaultChecked,l.type,l.name)}}for(t=0;t<n.length;t++)a=n[t],a.form===e.form&&Or(a)}break e;case"textarea":xr(e,n.value,n.defaultValue);break e;case"select":t=n.value,t!=null&&Vn(e,!!n.multiple,t,!1)}}}var es=!1;function Lr(e,t,n){if(es)return e(t,n);es=!0;try{var a=e(t);return a}finally{if(es=!1,(Qn!==null||Kn!==null)&&(vi(),Qn&&(t=Qn,e=Kn,Kn=Qn=null,qr(t),e)))for(t=0;t<e.length;t++)qr(e[t])}}function Aa(e,t){var n=e.stateNode;if(n===null)return null;var a=n[Be]||null;if(a===null)return null;n=a[t];e:switch(t){case"onClick":case"onClickCapture":case"onDoubleClick":case"onDoubleClickCapture":case"onMouseDown":case"onMouseDownCapture":case"onMouseMove":case"onMouseMoveCapture":case"onMouseUp":case"onMouseUpCapture":case"onMouseEnter":(a=!a.disabled)||(e=e.type,a=!(e==="button"||e==="input"||e==="select"||e==="textarea")),e=!a;break e;default:e=!1}if(e)return null;if(n&&typeof n!="function")throw Error(g(231,t,typeof n));return n}var Ut=!(typeof window>"u"||typeof window.document>"u"||typeof window.document.createElement>"u"),ts=!1;if(Ut)try{var Ua={};Object.defineProperty(Ua,"passive",{get:function(){ts=!0}}),window.addEventListener("test",Ua,Ua),window.removeEventListener("test",Ua,Ua)}catch{ts=!1}var Qt=null,ns=null,Ll=null;function Nr(){if(Ll)return Ll;var e,t=ns,n=t.length,a,l="value"in Qt?Qt.value:Qt.textContent,i=l.length;for(e=0;e<n&&t[e]===l[e];e++);var s=n-e;for(a=1;a<=s&&t[n-a]===l[i-a];a++);return Ll=l.slice(e,1<a?1-a:void 0)}function Nl(e){var t=e.keyCode;return"charCode"in e?(e=e.charCode,e===0&&t===13&&(e=13)):e=t,e===10&&(e=13),32<=e||e===13?e:0}function zl(){return!0}function zr(){return!1}function Pe(e){function t(n,a,l,i,s){this._reactName=n,this._targetInst=l,this.type=a,this.nativeEvent=i,this.target=s,this.currentTarget=null;for(var u in e)e.hasOwnProperty(u)&&(n=e[u],this[u]=n?n(i):i[u]);return this.isDefaultPrevented=(i.defaultPrevented!=null?i.defaultPrevented:i.returnValue===!1)?zl:zr,this.isPropagationStopped=zr,this}return H(t.prototype,{preventDefault:function(){this.defaultPrevented=!0;var n=this.nativeEvent;n&&(n.preventDefault?n.preventDefault():typeof n.returnValue!="unknown"&&(n.returnValue=!1),this.isDefaultPrevented=zl)},stopPropagation:function(){var n=this.nativeEvent;n&&(n.stopPropagation?n.stopPropagation():typeof n.cancelBubble!="unknown"&&(n.cancelBubble=!0),this.isPropagationStopped=zl)},persist:function(){},isPersistent:zl}),t}var bn={eventPhase:0,bubbles:0,cancelable:0,timeStamp:function(e){return e.timeStamp||Date.now()},defaultPrevented:0,isTrusted:0},Dl=Pe(bn),Ha=H({},bn,{view:0,detail:0}),jd=Pe(Ha),as,ls,qa,Cl=H({},Ha,{screenX:0,screenY:0,clientX:0,clientY:0,pageX:0,pageY:0,ctrlKey:0,shiftKey:0,altKey:0,metaKey:0,getModifierState:ss,button:0,buttons:0,relatedTarget:function(e){return e.relatedTarget===void 0?e.fromElement===e.srcElement?e.toElement:e.fromElement:e.relatedTarget},movementX:function(e){return"movementX"in e?e.movementX:(e!==qa&&(qa&&e.type==="mousemove"?(as=e.screenX-qa.screenX,ls=e.screenY-qa.screenY):ls=as=0,qa=e),as)},movementY:function(e){return"movementY"in e?e.movementY:ls}}),Dr=Pe(Cl),_d=H({},Cl,{dataTransfer:0}),Xd=Pe(_d),Yd=H({},Ha,{relatedTarget:0}),is=Pe(Yd),Bd=H({},bn,{animationName:0,elapsedTime:0,pseudoElement:0}),Pd=Pe(Bd),Gd=H({},bn,{clipboardData:function(e){return"clipboardData"in e?e.clipboardData:window.clipboardData}}),Vd=Pe(Gd),Zd=H({},bn,{data:0}),Cr=Pe(Zd),Qd={Esc:"Escape",Spacebar:" ",Left:"ArrowLeft",Up:"ArrowUp",Right:"ArrowRight",Down:"ArrowDown",Del:"Delete",Win:"OS",Menu:"ContextMenu",Apps:"ContextMenu",Scroll:"ScrollLock",MozPrintableKey:"Unidentified"},Kd={8:"Backspace",9:"Tab",12:"Clear",13:"Enter",16:"Shift",17:"Control",18:"Alt",19:"Pause",20:"CapsLock",27:"Escape",32:" ",33:"PageUp",34:"PageDown",35:"End",36:"Home",37:"ArrowLeft",38:"ArrowUp",39:"ArrowRight",40:"ArrowDown",45:"Insert",46:"Delete",112:"F1",113:"F2",114:"F3",115:"F4",116:"F5",117:"F6",118:"F7",119:"F8",120:"F9",121:"F10",122:"F11",123:"F12",144:"NumLock",145:"ScrollLock",224:"Meta"},Jd={Alt:"altKey",Control:"ctrlKey",Meta:"metaKey",Shift:"shiftKey"};function wd(e){var t=this.nativeEvent;return t.getModifierState?t.getModifierState(e):(e=Jd[e])?!!t[e]:!1}function ss(){return wd}var Fd=H({},Ha,{key:function(e){if(e.key){var t=Qd[e.key]||e.key;if(t!=="Unidentified")return t}return e.type==="keypress"?(e=Nl(e),e===13?"Enter":String.fromCharCode(e)):e.type==="keydown"||e.type==="keyup"?Kd[e.keyCode]||"Unidentified":""},code:0,location:0,ctrlKey:0,shiftKey:0,altKey:0,metaKey:0,repeat:0,locale:0,getModifierState:ss,charCode:function(e){return e.type==="keypress"?Nl(e):0},keyCode:function(e){return e.type==="keydown"||e.type==="keyup"?e.keyCode:0},which:function(e){return e.type==="keypress"?Nl(e):e.type==="keydown"||e.type==="keyup"?e.keyCode:0}}),kd=Pe(Fd),Wd=H({},Cl,{pointerId:0,width:0,height:0,pressure:0,tangentialPressure:0,tiltX:0,tiltY:0,twist:0,pointerType:0,isPrimary:0}),jr=Pe(Wd),$d=H({},Ha,{touches:0,targetTouches:0,changedTouches:0,altKey:0,metaKey:0,ctrlKey:0,shiftKey:0,getModifierState:ss}),Id=Pe($d),ep=H({},bn,{propertyName:0,elapsedTime:0,pseudoElement:0}),tp=Pe(ep),np=H({},Cl,{deltaX:function(e){return"deltaX"in e?e.deltaX:"wheelDeltaX"in e?-e.wheelDeltaX:0},deltaY:function(e){return"deltaY"in e?e.deltaY:"wheelDeltaY"in e?-e.wheelDeltaY:"wheelDelta"in e?-e.wheelDelta:0},deltaZ:0,deltaMode:0}),ap=Pe(np),lp=H({},bn,{newState:0,oldState:0}),ip=Pe(lp),sp=[9,13,27,32],us=Ut&&"CompositionEvent"in window,La=null;Ut&&"documentMode"in document&&(La=document.documentMode);var up=Ut&&"TextEvent"in window&&!La,_r=Ut&&(!us||La&&8<La&&11>=La),Xr=" ",Yr=!1;function Br(e,t){switch(e){case"keyup":return sp.indexOf(t.keyCode)!==-1;case"keydown":return t.keyCode!==229;case"keypress":case"mousedown":case"focusout":return!0;default:return!1}}function Pr(e){return e=e.detail,typeof e=="object"&&"data"in e?e.data:null}var Jn=!1;function rp(e,t){switch(e){case"compositionend":return Pr(t);case"keypress":return t.which!==32?null:(Yr=!0,Xr);case"textInput":return e=t.data,e===Xr&&Yr?null:e;default:return null}}function cp(e,t){if(Jn)return e==="compositionend"||!us&&Br(e,t)?(e=Nr(),Ll=ns=Qt=null,Jn=!1,e):null;switch(e){case"paste":return null;case"keypress":if(!(t.ctrlKey||t.altKey||t.metaKey)||t.ctrlKey&&t.altKey){if(t.char&&1<t.char.length)return t.char;if(t.which)return String.fromCharCode(t.which)}return null;case"compositionend":return _r&&t.locale!=="ko"?null:t.data;default:return null}}var op={color:!0,date:!0,datetime:!0,"datetime-local":!0,email:!0,month:!0,number:!0,password:!0,range:!0,search:!0,tel:!0,text:!0,time:!0,url:!0,week:!0};function Gr(e){var t=e&&e.nodeName&&e.nodeName.toLowerCase();return t==="input"?!!op[e.type]:t==="textarea"}function Vr(e,t,n,a){Qn?Kn?Kn.push(a):Kn=[a]:Qn=a,t=Si(t,"onChange"),0<t.length&&(n=new Dl("onChange","change",null,n,a),e.push({event:n,listeners:t}))}var Na=null,za=null;function fp(e){Mf(e,0)}function jl(e){var t=xa(e);if(Or(t))return e}function Zr(e,t){if(e==="change")return t}var Qr=!1;if(Ut){var rs;if(Ut){var cs="oninput"in document;if(!cs){var Kr=document.createElement("div");Kr.setAttribute("oninput","return;"),cs=typeof Kr.oninput=="function"}rs=cs}else rs=!1;Qr=rs&&(!document.documentMode||9<document.documentMode)}function Jr(){Na&&(Na.detachEvent("onpropertychange",wr),za=Na=null)}function wr(e){if(e.propertyName==="value"&&jl(za)){var t=[];Vr(t,za,e,Ii(e)),Lr(fp,t)}}function dp(e,t,n){e==="focusin"?(Jr(),Na=t,za=n,Na.attachEvent("onpropertychange",wr)):e==="focusout"&&Jr()}function pp(e){if(e==="selectionchange"||e==="keyup"||e==="keydown")return jl(za)}function mp(e,t){if(e==="click")return jl(t)}function vp(e,t){if(e==="input"||e==="change")return jl(t)}function hp(e,t){return e===t&&(e!==0||1/e===1/t)||e!==e&&t!==t}var We=typeof Object.is=="function"?Object.is:hp;function Da(e,t){if(We(e,t))return!0;if(typeof e!="object"||e===null||typeof t!="object"||t===null)return!1;var n=Object.keys(e),a=Object.keys(t);if(n.length!==a.length)return!1;for(a=0;a<n.length;a++){var l=n[a];if(!Xi.call(t,l)||!We(e[l],t[l]))return!1}return!0}function Fr(e){for(;e&&e.firstChild;)e=e.firstChild;return e}function kr(e,t){var n=Fr(e);e=0;for(var a;n;){if(n.nodeType===3){if(a=e+n.textContent.length,e<=t&&a>=t)return{node:n,offset:t-e};e=a}e:{for(;n;){if(n.nextSibling){n=n.nextSibling;break e}n=n.parentNode}n=void 0}n=Fr(n)}}function Wr(e,t){return e&&t?e===t?!0:e&&e.nodeType===3?!1:t&&t.nodeType===3?Wr(e,t.parentNode):"contains"in e?e.contains(t):e.compareDocumentPosition?!!(e.compareDocumentPosition(t)&16):!1:!1}function $r(e){e=e!=null&&e.ownerDocument!=null&&e.ownerDocument.defaultView!=null?e.ownerDocument.defaultView:window;for(var t=Hl(e.document);t instanceof e.HTMLIFrameElement;){try{var n=typeof t.contentWindow.location.href=="string"}catch{n=!1}if(n)e=t.contentWindow;else break;t=Hl(e.document)}return t}function os(e){var t=e&&e.nodeName&&e.nodeName.toLowerCase();return t&&(t==="input"&&(e.type==="text"||e.type==="search"||e.type==="tel"||e.type==="url"||e.type==="password")||t==="textarea"||e.contentEditable==="true")}var gp=Ut&&"documentMode"in document&&11>=document.documentMode,wn=null,fs=null,Ca=null,ds=!1;function Ir(e,t,n){var a=n.window===n?n.document:n.nodeType===9?n:n.ownerDocument;ds||wn==null||wn!==Hl(a)||(a=wn,"selectionStart"in a&&os(a)?a={start:a.selectionStart,end:a.selectionEnd}:(a=(a.ownerDocument&&a.ownerDocument.defaultView||window).getSelection(),a={anchorNode:a.anchorNode,anchorOffset:a.anchorOffset,focusNode:a.focusNode,focusOffset:a.focusOffset}),Ca&&Da(Ca,a)||(Ca=a,a=Si(fs,"onSelect"),0<a.length&&(t=new Dl("onSelect","select",null,t,n),e.push({event:t,listeners:a}),t.target=wn)))}function yn(e,t){var n={};return n[e.toLowerCase()]=t.toLowerCase(),n["Webkit"+e]="webkit"+t,n["Moz"+e]="moz"+t,n}var Fn={animationend:yn("Animation","AnimationEnd"),animationiteration:yn("Animation","AnimationIteration"),animationstart:yn("Animation","AnimationStart"),transitionrun:yn("Transition","TransitionRun"),transitionstart:yn("Transition","TransitionStart"),transitioncancel:yn("Transition","TransitionCancel"),transitionend:yn("Transition","TransitionEnd")},ps={},ec={};Ut&&(ec=document.createElement("div").style,"AnimationEvent"in window||(delete Fn.animationend.animation,delete Fn.animationiteration.animation,delete Fn.animationstart.animation),"TransitionEvent"in window||delete Fn.transitionend.transition);function Sn(e){if(ps[e])return ps[e];if(!Fn[e])return e;var t=Fn[e],n;for(n in t)if(t.hasOwnProperty(n)&&n in ec)return ps[e]=t[n];return e}var tc=Sn("animationend"),nc=Sn("animationiteration"),ac=Sn("animationstart"),Ep=Sn("transitionrun"),bp=Sn("transitionstart"),yp=Sn("transitioncancel"),lc=Sn("transitionend"),ic=new Map,ms="abort auxClick beforeToggle cancel canPlay canPlayThrough click close contextMenu copy cut drag dragEnd dragEnter dragExit dragLeave dragOver dragStart drop durationChange emptied encrypted ended error gotPointerCapture input invalid keyDown keyPress keyUp load loadedData loadedMetadata loadStart lostPointerCapture mouseDown mouseMove mouseOut mouseOver mouseUp paste pause play playing pointerCancel pointerDown pointerMove pointerOut pointerOver pointerUp progress rateChange reset resize seeked seeking stalled submit suspend timeUpdate touchCancel touchEnd touchStart volumeChange scroll toggle touchMove waiting wheel".split(" ");ms.push("scrollEnd");function vt(e,t){ic.set(e,t),En(t,[e])}var sc=new WeakMap;function st(e,t){if(typeof e=="object"&&e!==null){var n=sc.get(e);return n!==void 0?n:(t={value:e,source:t,stack:Tr(t)},sc.set(e,t),t)}return{value:e,source:t,stack:Tr(t)}}var ut=[],kn=0,vs=0;function _l(){for(var e=kn,t=vs=kn=0;t<e;){var n=ut[t];ut[t++]=null;var a=ut[t];ut[t++]=null;var l=ut[t];ut[t++]=null;var i=ut[t];if(ut[t++]=null,a!==null&&l!==null){var s=a.pending;s===null?l.next=l:(l.next=s.next,s.next=l),a.pending=l}i!==0&&uc(n,l,i)}}function Xl(e,t,n,a){ut[kn++]=e,ut[kn++]=t,ut[kn++]=n,ut[kn++]=a,vs|=a,e.lanes|=a,e=e.alternate,e!==null&&(e.lanes|=a)}function hs(e,t,n,a){return Xl(e,t,n,a),Yl(e)}function Wn(e,t){return Xl(e,null,null,t),Yl(e)}function uc(e,t,n){e.lanes|=n;var a=e.alternate;a!==null&&(a.lanes|=n);for(var l=!1,i=e.return;i!==null;)i.childLanes|=n,a=i.alternate,a!==null&&(a.childLanes|=n),i.tag===22&&(e=i.stateNode,e===null||e._visibility&1||(l=!0)),e=i,i=i.return;return e.tag===3?(i=e.stateNode,l&&t!==null&&(l=31-ke(n),e=i.hiddenUpdates,a=e[l],a===null?e[l]=[t]:a.push(t),t.lane=n|536870912),i):null}function Yl(e){if(50<sl)throw sl=0,Tu=null,Error(g(185));for(var t=e.return;t!==null;)e=t,t=e.return;return e.tag===3?e.stateNode:null}var $n={};function Sp(e,t,n,a){this.tag=e,this.key=n,this.sibling=this.child=this.return=this.stateNode=this.type=this.elementType=null,this.index=0,this.refCleanup=this.ref=null,this.pendingProps=t,this.dependencies=this.memoizedState=this.updateQueue=this.memoizedProps=null,this.mode=a,this.subtreeFlags=this.flags=0,this.deletions=null,this.childLanes=this.lanes=0,this.alternate=null}function $e(e,t,n,a){return new Sp(e,t,n,a)}function gs(e){return e=e.prototype,!(!e||!e.isReactComponent)}function Ht(e,t){var n=e.alternate;return n===null?(n=$e(e.tag,t,e.key,e.mode),n.elementType=e.elementType,n.type=e.type,n.stateNode=e.stateNode,n.alternate=e,e.alternate=n):(n.pendingProps=t,n.type=e.type,n.flags=0,n.subtreeFlags=0,n.deletions=null),n.flags=e.flags&65011712,n.childLanes=e.childLanes,n.lanes=e.lanes,n.child=e.child,n.memoizedProps=e.memoizedProps,n.memoizedState=e.memoizedState,n.updateQueue=e.updateQueue,t=e.dependencies,n.dependencies=t===null?null:{lanes:t.lanes,firstContext:t.firstContext},n.sibling=e.sibling,n.index=e.index,n.ref=e.ref,n.refCleanup=e.refCleanup,n}function rc(e,t){e.flags&=65011714;var n=e.alternate;return n===null?(e.childLanes=0,e.lanes=t,e.child=null,e.subtreeFlags=0,e.memoizedProps=null,e.memoizedState=null,e.updateQueue=null,e.dependencies=null,e.stateNode=null):(e.childLanes=n.childLanes,e.lanes=n.lanes,e.child=n.child,e.subtreeFlags=0,e.deletions=null,e.memoizedProps=n.memoizedProps,e.memoizedState=n.memoizedState,e.updateQueue=n.updateQueue,e.type=n.type,t=n.dependencies,e.dependencies=t===null?null:{lanes:t.lanes,firstContext:t.firstContext}),e}function Bl(e,t,n,a,l,i){var s=0;if(a=e,typeof e=="function")gs(e)&&(s=1);else if(typeof e=="string")s=Rm(e,n,N.current)?26:e==="html"||e==="head"||e==="body"?27:5;else e:switch(e){case Et:return e=$e(31,n,t,l),e.elementType=Et,e.lanes=i,e;case ee:return Tn(n.children,l,i,t);case Ye:s=8,l|=24;break;case Ue:return e=$e(12,n,t,l|2),e.elementType=Ue,e.lanes=i,e;case F:return e=$e(13,n,t,l),e.elementType=F,e.lanes=i,e;case Qe:return e=$e(19,n,t,l),e.elementType=Qe,e.lanes=i,e;default:if(typeof e=="object"&&e!==null)switch(e.$$typeof){case _:case Ne:s=10;break e;case Mt:s=9;break e;case mt:s=11;break e;case Ke:s=14;break e;case Je:s=16,a=null;break e}s=29,n=Error(g(130,e===null?"null":typeof e,"")),a=null}return t=$e(s,n,t,l),t.elementType=e,t.type=a,t.lanes=i,t}function Tn(e,t,n,a){return e=$e(7,e,a,t),e.lanes=n,e}function Es(e,t,n){return e=$e(6,e,null,t),e.lanes=n,e}function bs(e,t,n){return t=$e(4,e.children!==null?e.children:[],e.key,t),t.lanes=n,t.stateNode={containerInfo:e.containerInfo,pendingChildren:null,implementation:e.implementation},t}var In=[],ea=0,Pl=null,Gl=0,rt=[],ct=0,Rn=null,qt=1,Lt="";function On(e,t){In[ea++]=Gl,In[ea++]=Pl,Pl=e,Gl=t}function cc(e,t,n){rt[ct++]=qt,rt[ct++]=Lt,rt[ct++]=Rn,Rn=e;var a=qt;e=Lt;var l=32-ke(a)-1;a&=~(1<<l),n+=1;var i=32-ke(t)+l;if(30<i){var s=l-l%5;i=(a&(1<<s)-1).toString(32),a>>=s,l-=s,qt=1<<32-ke(t)+l|n<<l|a,Lt=i+e}else qt=1<<i|n<<l|a,Lt=e}function ys(e){e.return!==null&&(On(e,1),cc(e,1,0))}function Ss(e){for(;e===Pl;)Pl=In[--ea],In[ea]=null,Gl=In[--ea],In[ea]=null;for(;e===Rn;)Rn=rt[--ct],rt[ct]=null,Lt=rt[--ct],rt[ct]=null,qt=rt[--ct],rt[ct]=null}var Xe=null,ve=null,$=!1,Mn=null,yt=!1,Ts=Error(g(519));function xn(e){var t=Error(g(418,""));throw Xa(st(t,e)),Ts}function oc(e){var t=e.stateNode,n=e.type,a=e.memoizedProps;switch(t[Ce]=e,t[Be]=a,n){case"dialog":K("cancel",t),K("close",t);break;case"iframe":case"object":case"embed":K("load",t);break;case"video":case"audio":for(n=0;n<rl.length;n++)K(rl[n],t);break;case"source":K("error",t);break;case"img":case"image":case"link":K("error",t),K("load",t);break;case"details":K("toggle",t);break;case"input":K("invalid",t),Mr(t,a.value,a.defaultValue,a.checked,a.defaultChecked,a.type,a.name,!0),Ul(t);break;case"select":K("invalid",t);break;case"textarea":K("invalid",t),Ar(t,a.value,a.defaultValue,a.children),Ul(t)}n=a.children,typeof n!="string"&&typeof n!="number"&&typeof n!="bigint"||t.textContent===""+n||a.suppressHydrationWarning===!0||Hf(t.textContent,n)?(a.popover!=null&&(K("beforetoggle",t),K("toggle",t)),a.onScroll!=null&&K("scroll",t),a.onScrollEnd!=null&&K("scrollend",t),a.onClick!=null&&(t.onclick=Ti),t=!0):t=!1,t||xn(e)}function fc(e){for(Xe=e.return;Xe;)switch(Xe.tag){case 5:case 13:yt=!1;return;case 27:case 3:yt=!0;return;default:Xe=Xe.return}}function ja(e){if(e!==Xe)return!1;if(!$)return fc(e),$=!0,!1;var t=e.tag,n;if((n=t!==3&&t!==27)&&((n=t===5)&&(n=e.type,n=!(n!=="form"&&n!=="button")||Xu(e.type,e.memoizedProps)),n=!n),n&&ve&&xn(e),fc(e),t===13){if(e=e.memoizedState,e=e!==null?e.dehydrated:null,!e)throw Error(g(317));e:{for(e=e.nextSibling,t=0;e;){if(e.nodeType===8)if(n=e.data,n==="/$"){if(t===0){ve=gt(e.nextSibling);break e}t--}else n!=="$"&&n!=="$!"&&n!=="$?"||t++;e=e.nextSibling}ve=null}}else t===27?(t=ve,rn(e.type)?(e=Gu,Gu=null,ve=e):ve=t):ve=Xe?gt(e.stateNode.nextSibling):null;return!0}function _a(){ve=Xe=null,$=!1}function dc(){var e=Mn;return e!==null&&(Ze===null?Ze=e:Ze.push.apply(Ze,e),Mn=null),e}function Xa(e){Mn===null?Mn=[e]:Mn.push(e)}var Rs=R(null),An=null,Nt=null;function Kt(e,t,n){M(Rs,t._currentValue),t._currentValue=n}function zt(e){e._currentValue=Rs.current,A(Rs)}function Os(e,t,n){for(;e!==null;){var a=e.alternate;if((e.childLanes&t)!==t?(e.childLanes|=t,a!==null&&(a.childLanes|=t)):a!==null&&(a.childLanes&t)!==t&&(a.childLanes|=t),e===n)break;e=e.return}}function Ms(e,t,n,a){var l=e.child;for(l!==null&&(l.return=e);l!==null;){var i=l.dependencies;if(i!==null){var s=l.child;i=i.firstContext;e:for(;i!==null;){var u=i;i=l;for(var r=0;r<t.length;r++)if(u.context===t[r]){i.lanes|=n,u=i.alternate,u!==null&&(u.lanes|=n),Os(i.return,n,e),a||(s=null);break e}i=u.next}}else if(l.tag===18){if(s=l.return,s===null)throw Error(g(341));s.lanes|=n,i=s.alternate,i!==null&&(i.lanes|=n),Os(s,n,e),s=null}else s=l.child;if(s!==null)s.return=l;else for(s=l;s!==null;){if(s===e){s=null;break}if(l=s.sibling,l!==null){l.return=s.return,s=l;break}s=s.return}l=s}}function Ya(e,t,n,a){e=null;for(var l=t,i=!1;l!==null;){if(!i){if((l.flags&524288)!==0)i=!0;else if((l.flags&262144)!==0)break}if(l.tag===10){var s=l.alternate;if(s===null)throw Error(g(387));if(s=s.memoizedProps,s!==null){var u=l.type;We(l.pendingProps.value,s.value)||(e!==null?e.push(u):e=[u])}}else if(l===we.current){if(s=l.alternate,s===null)throw Error(g(387));s.memoizedState.memoizedState!==l.memoizedState.memoizedState&&(e!==null?e.push(ml):e=[ml])}l=l.return}e!==null&&Ms(t,e,n,a),t.flags|=262144}function Vl(e){for(e=e.firstContext;e!==null;){if(!We(e.context._currentValue,e.memoizedValue))return!0;e=e.next}return!1}function Un(e){An=e,Nt=null,e=e.dependencies,e!==null&&(e.firstContext=null)}function je(e){return pc(An,e)}function Zl(e,t){return An===null&&Un(e),pc(e,t)}function pc(e,t){var n=t._currentValue;if(t={context:t,memoizedValue:n,next:null},Nt===null){if(e===null)throw Error(g(308));Nt=t,e.dependencies={lanes:0,firstContext:t},e.flags|=524288}else Nt=Nt.next=t;return n}var Tp=typeof AbortController<"u"?AbortController:function(){var e=[],t=this.signal={aborted:!1,addEventListener:function(n,a){e.push(a)}};this.abort=function(){t.aborted=!0,e.forEach(function(n){return n()})}},Rp=O.unstable_scheduleCallback,Op=O.unstable_NormalPriority,Se={$$typeof:Ne,Consumer:null,Provider:null,_currentValue:null,_currentValue2:null,_threadCount:0};function xs(){return{controller:new Tp,data:new Map,refCount:0}}function Ba(e){e.refCount--,e.refCount===0&&Rp(Op,function(){e.controller.abort()})}var Pa=null,As=0,ta=0,na=null;function Mp(e,t){if(Pa===null){var n=Pa=[];As=0,ta=Hu(),na={status:"pending",value:void 0,then:function(a){n.push(a)}}}return As++,t.then(mc,mc),t}function mc(){if(--As===0&&Pa!==null){na!==null&&(na.status="fulfilled");var e=Pa;Pa=null,ta=0,na=null;for(var t=0;t<e.length;t++)(0,e[t])()}}function xp(e,t){var n=[],a={status:"pending",value:null,reason:null,then:function(l){n.push(l)}};return e.then(function(){a.status="fulfilled",a.value=t;for(var l=0;l<n.length;l++)(0,n[l])(t)},function(l){for(a.status="rejected",a.reason=l,l=0;l<n.length;l++)(0,n[l])(void 0)}),a}var vc=b.S;b.S=function(e,t){typeof t=="object"&&t!==null&&typeof t.then=="function"&&Mp(e,t),vc!==null&&vc(e,t)};var Hn=R(null);function Us(){var e=Hn.current;return e!==null?e:oe.pooledCache}function Ql(e,t){t===null?M(Hn,Hn.current):M(Hn,t.pool)}function hc(){var e=Us();return e===null?null:{parent:Se._currentValue,pool:e}}var Ga=Error(g(460)),gc=Error(g(474)),Kl=Error(g(542)),Hs={then:function(){}};function Ec(e){return e=e.status,e==="fulfilled"||e==="rejected"}function Jl(){}function bc(e,t,n){switch(n=e[n],n===void 0?e.push(t):n!==t&&(t.then(Jl,Jl),t=n),t.status){case"fulfilled":return t.value;case"rejected":throw e=t.reason,Sc(e),e;default:if(typeof t.status=="string")t.then(Jl,Jl);else{if(e=oe,e!==null&&100<e.shellSuspendCounter)throw Error(g(482));e=t,e.status="pending",e.then(function(a){if(t.status==="pending"){var l=t;l.status="fulfilled",l.value=a}},function(a){if(t.status==="pending"){var l=t;l.status="rejected",l.reason=a}})}switch(t.status){case"fulfilled":return t.value;case"rejected":throw e=t.reason,Sc(e),e}throw Va=t,Ga}}var Va=null;function yc(){if(Va===null)throw Error(g(459));var e=Va;return Va=null,e}function Sc(e){if(e===Ga||e===Kl)throw Error(g(483))}var Jt=!1;function qs(e){e.updateQueue={baseState:e.memoizedState,firstBaseUpdate:null,lastBaseUpdate:null,shared:{pending:null,lanes:0,hiddenCallbacks:null},callbacks:null}}function Ls(e,t){e=e.updateQueue,t.updateQueue===e&&(t.updateQueue={baseState:e.baseState,firstBaseUpdate:e.firstBaseUpdate,lastBaseUpdate:e.lastBaseUpdate,shared:e.shared,callbacks:null})}function wt(e){return{lane:e,tag:0,payload:null,callback:null,next:null}}function Ft(e,t,n){var a=e.updateQueue;if(a===null)return null;if(a=a.shared,(ae&2)!==0){var l=a.pending;return l===null?t.next=t:(t.next=l.next,l.next=t),a.pending=t,t=Yl(e),uc(e,null,n),t}return Xl(e,a,t,n),Yl(e)}function Za(e,t,n){if(t=t.updateQueue,t!==null&&(t=t.shared,(n&4194048)!==0)){var a=t.lanes;a&=e.pendingLanes,n|=a,t.lanes=n,mr(e,n)}}function Ns(e,t){var n=e.updateQueue,a=e.alternate;if(a!==null&&(a=a.updateQueue,n===a)){var l=null,i=null;if(n=n.firstBaseUpdate,n!==null){do{var s={lane:n.lane,tag:n.tag,payload:n.payload,callback:null,next:null};i===null?l=i=s:i=i.next=s,n=n.next}while(n!==null);i===null?l=i=t:i=i.next=t}else l=i=t;n={baseState:a.baseState,firstBaseUpdate:l,lastBaseUpdate:i,shared:a.shared,callbacks:a.callbacks},e.updateQueue=n;return}e=n.lastBaseUpdate,e===null?n.firstBaseUpdate=t:e.next=t,n.lastBaseUpdate=t}var zs=!1;function Qa(){if(zs){var e=na;if(e!==null)throw e}}function Ka(e,t,n,a){zs=!1;var l=e.updateQueue;Jt=!1;var i=l.firstBaseUpdate,s=l.lastBaseUpdate,u=l.shared.pending;if(u!==null){l.shared.pending=null;var r=u,m=r.next;r.next=null,s===null?i=m:s.next=m,s=r;var E=e.alternate;E!==null&&(E=E.updateQueue,u=E.lastBaseUpdate,u!==s&&(u===null?E.firstBaseUpdate=m:u.next=m,E.lastBaseUpdate=r))}if(i!==null){var S=l.baseState;s=0,E=m=r=null,u=i;do{var v=u.lane&-536870913,h=v!==u.lane;if(h?(J&v)===v:(a&v)===v){v!==0&&v===ta&&(zs=!0),E!==null&&(E=E.next={lane:0,tag:u.tag,payload:u.payload,callback:null,next:null});e:{var j=e,z=u;v=t;var ue=n;switch(z.tag){case 1:if(j=z.payload,typeof j=="function"){S=j.call(ue,S,v);break e}S=j;break e;case 3:j.flags=j.flags&-65537|128;case 0:if(j=z.payload,v=typeof j=="function"?j.call(ue,S,v):j,v==null)break e;S=H({},S,v);break e;case 2:Jt=!0}}v=u.callback,v!==null&&(e.flags|=64,h&&(e.flags|=8192),h=l.callbacks,h===null?l.callbacks=[v]:h.push(v))}else h={lane:v,tag:u.tag,payload:u.payload,callback:u.callback,next:null},E===null?(m=E=h,r=S):E=E.next=h,s|=v;if(u=u.next,u===null){if(u=l.shared.pending,u===null)break;h=u,u=h.next,h.next=null,l.lastBaseUpdate=h,l.shared.pending=null}}while(!0);E===null&&(r=S),l.baseState=r,l.firstBaseUpdate=m,l.lastBaseUpdate=E,i===null&&(l.shared.lanes=0),an|=s,e.lanes=s,e.memoizedState=S}}function Tc(e,t){if(typeof e!="function")throw Error(g(191,e));e.call(t)}function Rc(e,t){var n=e.callbacks;if(n!==null)for(e.callbacks=null,e=0;e<n.length;e++)Tc(n[e],t)}var aa=R(null),wl=R(0);function Oc(e,t){e=Bt,M(wl,e),M(aa,t),Bt=e|t.baseLanes}function Ds(){M(wl,Bt),M(aa,aa.current)}function Cs(){Bt=wl.current,A(aa),A(wl)}var kt=0,V=null,ie=null,be=null,Fl=!1,la=!1,qn=!1,kl=0,Ja=0,ia=null,Ap=0;function ge(){throw Error(g(321))}function js(e,t){if(t===null)return!1;for(var n=0;n<t.length&&n<e.length;n++)if(!We(e[n],t[n]))return!1;return!0}function _s(e,t,n,a,l,i){return kt=i,V=t,t.memoizedState=null,t.updateQueue=null,t.lanes=0,b.H=e===null||e.memoizedState===null?uo:ro,qn=!1,i=n(a,l),qn=!1,la&&(i=xc(t,n,a,l)),Mc(e),i}function Mc(e){b.H=ni;var t=ie!==null&&ie.next!==null;if(kt=0,be=ie=V=null,Fl=!1,Ja=0,ia=null,t)throw Error(g(300));e===null||Oe||(e=e.dependencies,e!==null&&Vl(e)&&(Oe=!0))}function xc(e,t,n,a){V=e;var l=0;do{if(la&&(ia=null),Ja=0,la=!1,25<=l)throw Error(g(301));if(l+=1,be=ie=null,e.updateQueue!=null){var i=e.updateQueue;i.lastEffect=null,i.events=null,i.stores=null,i.memoCache!=null&&(i.memoCache.index=0)}b.H=Dp,i=t(n,a)}while(la);return i}function Up(){var e=b.H,t=e.useState()[0];return t=typeof t.then=="function"?wa(t):t,e=e.useState()[0],(ie!==null?ie.memoizedState:null)!==e&&(V.flags|=1024),t}function Xs(){var e=kl!==0;return kl=0,e}function Ys(e,t,n){t.updateQueue=e.updateQueue,t.flags&=-2053,e.lanes&=~n}function Bs(e){if(Fl){for(e=e.memoizedState;e!==null;){var t=e.queue;t!==null&&(t.pending=null),e=e.next}Fl=!1}kt=0,be=ie=V=null,la=!1,Ja=kl=0,ia=null}function Ge(){var e={memoizedState:null,baseState:null,baseQueue:null,queue:null,next:null};return be===null?V.memoizedState=be=e:be=be.next=e,be}function ye(){if(ie===null){var e=V.alternate;e=e!==null?e.memoizedState:null}else e=ie.next;var t=be===null?V.memoizedState:be.next;if(t!==null)be=t,ie=e;else{if(e===null)throw V.alternate===null?Error(g(467)):Error(g(310));ie=e,e={memoizedState:ie.memoizedState,baseState:ie.baseState,baseQueue:ie.baseQueue,queue:ie.queue,next:null},be===null?V.memoizedState=be=e:be=be.next=e}return be}function Ps(){return{lastEffect:null,events:null,stores:null,memoCache:null}}function wa(e){var t=Ja;return Ja+=1,ia===null&&(ia=[]),e=bc(ia,e,t),t=V,(be===null?t.memoizedState:be.next)===null&&(t=t.alternate,b.H=t===null||t.memoizedState===null?uo:ro),e}function Wl(e){if(e!==null&&typeof e=="object"){if(typeof e.then=="function")return wa(e);if(e.$$typeof===Ne)return je(e)}throw Error(g(438,String(e)))}function Gs(e){var t=null,n=V.updateQueue;if(n!==null&&(t=n.memoCache),t==null){var a=V.alternate;a!==null&&(a=a.updateQueue,a!==null&&(a=a.memoCache,a!=null&&(t={data:a.data.map(function(l){return l.slice()}),index:0})))}if(t==null&&(t={data:[],index:0}),n===null&&(n=Ps(),V.updateQueue=n),n.memoCache=t,n=t.data[t.index],n===void 0)for(n=t.data[t.index]=Array(e),a=0;a<e;a++)n[a]=jn;return t.index++,n}function Dt(e,t){return typeof t=="function"?t(e):t}function $l(e){var t=ye();return Vs(t,ie,e)}function Vs(e,t,n){var a=e.queue;if(a===null)throw Error(g(311));a.lastRenderedReducer=n;var l=e.baseQueue,i=a.pending;if(i!==null){if(l!==null){var s=l.next;l.next=i.next,i.next=s}t.baseQueue=l=i,a.pending=null}if(i=e.baseState,l===null)e.memoizedState=i;else{t=l.next;var u=s=null,r=null,m=t,E=!1;do{var S=m.lane&-536870913;if(S!==m.lane?(J&S)===S:(kt&S)===S){var v=m.revertLane;if(v===0)r!==null&&(r=r.next={lane:0,revertLane:0,action:m.action,hasEagerState:m.hasEagerState,eagerState:m.eagerState,next:null}),S===ta&&(E=!0);else if((kt&v)===v){m=m.next,v===ta&&(E=!0);continue}else S={lane:0,revertLane:m.revertLane,action:m.action,hasEagerState:m.hasEagerState,eagerState:m.eagerState,next:null},r===null?(u=r=S,s=i):r=r.next=S,V.lanes|=v,an|=v;S=m.action,qn&&n(i,S),i=m.hasEagerState?m.eagerState:n(i,S)}else v={lane:S,revertLane:m.revertLane,action:m.action,hasEagerState:m.hasEagerState,eagerState:m.eagerState,next:null},r===null?(u=r=v,s=i):r=r.next=v,V.lanes|=S,an|=S;m=m.next}while(m!==null&&m!==t);if(r===null?s=i:r.next=u,!We(i,e.memoizedState)&&(Oe=!0,E&&(n=na,n!==null)))throw n;e.memoizedState=i,e.baseState=s,e.baseQueue=r,a.lastRenderedState=i}return l===null&&(a.lanes=0),[e.memoizedState,a.dispatch]}function Zs(e){var t=ye(),n=t.queue;if(n===null)throw Error(g(311));n.lastRenderedReducer=e;var a=n.dispatch,l=n.pending,i=t.memoizedState;if(l!==null){n.pending=null;var s=l=l.next;do i=e(i,s.action),s=s.next;while(s!==l);We(i,t.memoizedState)||(Oe=!0),t.memoizedState=i,t.baseQueue===null&&(t.baseState=i),n.lastRenderedState=i}return[i,a]}function Ac(e,t,n){var a=V,l=ye(),i=$;if(i){if(n===void 0)throw Error(g(407));n=n()}else n=t();var s=!We((ie||l).memoizedState,n);s&&(l.memoizedState=n,Oe=!0),l=l.queue;var u=qc.bind(null,a,l,e);if(Fa(2048,8,u,[e]),l.getSnapshot!==t||s||be!==null&&be.memoizedState.tag&1){if(a.flags|=2048,sa(9,Il(),Hc.bind(null,a,l,n,t),null),oe===null)throw Error(g(349));i||(kt&124)!==0||Uc(a,t,n)}return n}function Uc(e,t,n){e.flags|=16384,e={getSnapshot:t,value:n},t=V.updateQueue,t===null?(t=Ps(),V.updateQueue=t,t.stores=[e]):(n=t.stores,n===null?t.stores=[e]:n.push(e))}function Hc(e,t,n,a){t.value=n,t.getSnapshot=a,Lc(t)&&Nc(e)}function qc(e,t,n){return n(function(){Lc(t)&&Nc(e)})}function Lc(e){var t=e.getSnapshot;e=e.value;try{var n=t();return!We(e,n)}catch{return!0}}function Nc(e){var t=Wn(e,2);t!==null&&at(t,e,2)}function Qs(e){var t=Ge();if(typeof e=="function"){var n=e;if(e=n(),qn){Vt(!0);try{n()}finally{Vt(!1)}}}return t.memoizedState=t.baseState=e,t.queue={pending:null,lanes:0,dispatch:null,lastRenderedReducer:Dt,lastRenderedState:e},t}function zc(e,t,n,a){return e.baseState=n,Vs(e,ie,typeof a=="function"?a:Dt)}function Hp(e,t,n,a,l){if(ti(e))throw Error(g(485));if(e=t.action,e!==null){var i={payload:l,action:e,next:null,isTransition:!0,status:"pending",value:null,reason:null,listeners:[],then:function(s){i.listeners.push(s)}};b.T!==null?n(!0):i.isTransition=!1,a(i),n=t.pending,n===null?(i.next=t.pending=i,Dc(t,i)):(i.next=n.next,t.pending=n.next=i)}}function Dc(e,t){var n=t.action,a=t.payload,l=e.state;if(t.isTransition){var i=b.T,s={};b.T=s;try{var u=n(l,a),r=b.S;r!==null&&r(s,u),Cc(e,t,u)}catch(m){Ks(e,t,m)}finally{b.T=i}}else try{i=n(l,a),Cc(e,t,i)}catch(m){Ks(e,t,m)}}function Cc(e,t,n){n!==null&&typeof n=="object"&&typeof n.then=="function"?n.then(function(a){jc(e,t,a)},function(a){return Ks(e,t,a)}):jc(e,t,n)}function jc(e,t,n){t.status="fulfilled",t.value=n,_c(t),e.state=n,t=e.pending,t!==null&&(n=t.next,n===t?e.pending=null:(n=n.next,t.next=n,Dc(e,n)))}function Ks(e,t,n){var a=e.pending;if(e.pending=null,a!==null){a=a.next;do t.status="rejected",t.reason=n,_c(t),t=t.next;while(t!==a)}e.action=null}function _c(e){e=e.listeners;for(var t=0;t<e.length;t++)(0,e[t])()}function Xc(e,t){return t}function Yc(e,t){if($){var n=oe.formState;if(n!==null){e:{var a=V;if($){if(ve){t:{for(var l=ve,i=yt;l.nodeType!==8;){if(!i){l=null;break t}if(l=gt(l.nextSibling),l===null){l=null;break t}}i=l.data,l=i==="F!"||i==="F"?l:null}if(l){ve=gt(l.nextSibling),a=l.data==="F!";break e}}xn(a)}a=!1}a&&(t=n[0])}}return n=Ge(),n.memoizedState=n.baseState=t,a={pending:null,lanes:0,dispatch:null,lastRenderedReducer:Xc,lastRenderedState:t},n.queue=a,n=lo.bind(null,V,a),a.dispatch=n,a=Qs(!1),i=Ws.bind(null,V,!1,a.queue),a=Ge(),l={state:t,dispatch:null,action:e,pending:null},a.queue=l,n=Hp.bind(null,V,l,i,n),l.dispatch=n,a.memoizedState=e,[t,n,!1]}function Bc(e){var t=ye();return Pc(t,ie,e)}function Pc(e,t,n){if(t=Vs(e,t,Xc)[0],e=$l(Dt)[0],typeof t=="object"&&t!==null&&typeof t.then=="function")try{var a=wa(t)}catch(s){throw s===Ga?Kl:s}else a=t;t=ye();var l=t.queue,i=l.dispatch;return n!==t.memoizedState&&(V.flags|=2048,sa(9,Il(),qp.bind(null,l,n),null)),[a,i,e]}function qp(e,t){e.action=t}function Gc(e){var t=ye(),n=ie;if(n!==null)return Pc(t,n,e);ye(),t=t.memoizedState,n=ye();var a=n.queue.dispatch;return n.memoizedState=e,[t,a,!1]}function sa(e,t,n,a){return e={tag:e,create:n,deps:a,inst:t,next:null},t=V.updateQueue,t===null&&(t=Ps(),V.updateQueue=t),n=t.lastEffect,n===null?t.lastEffect=e.next=e:(a=n.next,n.next=e,e.next=a,t.lastEffect=e),e}function Il(){return{destroy:void 0,resource:void 0}}function Vc(){return ye().memoizedState}function ei(e,t,n,a){var l=Ge();a=a===void 0?null:a,V.flags|=e,l.memoizedState=sa(1|t,Il(),n,a)}function Fa(e,t,n,a){var l=ye();a=a===void 0?null:a;var i=l.memoizedState.inst;ie!==null&&a!==null&&js(a,ie.memoizedState.deps)?l.memoizedState=sa(t,i,n,a):(V.flags|=e,l.memoizedState=sa(1|t,i,n,a))}function Zc(e,t){ei(8390656,8,e,t)}function Qc(e,t){Fa(2048,8,e,t)}function Kc(e,t){return Fa(4,2,e,t)}function Jc(e,t){return Fa(4,4,e,t)}function wc(e,t){if(typeof t=="function"){e=e();var n=t(e);return function(){typeof n=="function"?n():t(null)}}if(t!=null)return e=e(),t.current=e,function(){t.current=null}}function Fc(e,t,n){n=n!=null?n.concat([e]):null,Fa(4,4,wc.bind(null,t,e),n)}function Js(){}function kc(e,t){var n=ye();t=t===void 0?null:t;var a=n.memoizedState;return t!==null&&js(t,a[1])?a[0]:(n.memoizedState=[e,t],e)}function Wc(e,t){var n=ye();t=t===void 0?null:t;var a=n.memoizedState;if(t!==null&&js(t,a[1]))return a[0];if(a=e(),qn){Vt(!0);try{e()}finally{Vt(!1)}}return n.memoizedState=[a,t],a}function ws(e,t,n){return n===void 0||(kt&1073741824)!==0?e.memoizedState=t:(e.memoizedState=n,e=tf(),V.lanes|=e,an|=e,n)}function $c(e,t,n,a){return We(n,t)?n:aa.current!==null?(e=ws(e,n,a),We(e,t)||(Oe=!0),e):(kt&42)===0?(Oe=!0,e.memoizedState=n):(e=tf(),V.lanes|=e,an|=e,t)}function Ic(e,t,n,a,l){var i=x.p;x.p=i!==0&&8>i?i:8;var s=b.T,u={};b.T=u,Ws(e,!1,t,n);try{var r=l(),m=b.S;if(m!==null&&m(u,r),r!==null&&typeof r=="object"&&typeof r.then=="function"){var E=xp(r,a);ka(e,t,E,nt(e))}else ka(e,t,a,nt(e))}catch(S){ka(e,t,{then:function(){},status:"rejected",reason:S},nt())}finally{x.p=i,b.T=s}}function Lp(){}function Fs(e,t,n,a){if(e.tag!==5)throw Error(g(476));var l=eo(e).queue;Ic(e,l,t,C,n===null?Lp:function(){return to(e),n(a)})}function eo(e){var t=e.memoizedState;if(t!==null)return t;t={memoizedState:C,baseState:C,baseQueue:null,queue:{pending:null,lanes:0,dispatch:null,lastRenderedReducer:Dt,lastRenderedState:C},next:null};var n={};return t.next={memoizedState:n,baseState:n,baseQueue:null,queue:{pending:null,lanes:0,dispatch:null,lastRenderedReducer:Dt,lastRenderedState:n},next:null},e.memoizedState=t,e=e.alternate,e!==null&&(e.memoizedState=t),t}function to(e){var t=eo(e).next.queue;ka(e,t,{},nt())}function ks(){return je(ml)}function no(){return ye().memoizedState}function ao(){return ye().memoizedState}function Np(e){for(var t=e.return;t!==null;){switch(t.tag){case 24:case 3:var n=nt();e=wt(n);var a=Ft(t,e,n);a!==null&&(at(a,t,n),Za(a,t,n)),t={cache:xs()},e.payload=t;return}t=t.return}}function zp(e,t,n){var a=nt();n={lane:a,revertLane:0,action:n,hasEagerState:!1,eagerState:null,next:null},ti(e)?io(t,n):(n=hs(e,t,n,a),n!==null&&(at(n,e,a),so(n,t,a)))}function lo(e,t,n){var a=nt();ka(e,t,n,a)}function ka(e,t,n,a){var l={lane:a,revertLane:0,action:n,hasEagerState:!1,eagerState:null,next:null};if(ti(e))io(t,l);else{var i=e.alternate;if(e.lanes===0&&(i===null||i.lanes===0)&&(i=t.lastRenderedReducer,i!==null))try{var s=t.lastRenderedState,u=i(s,n);if(l.hasEagerState=!0,l.eagerState=u,We(u,s))return Xl(e,t,l,0),oe===null&&_l(),!1}catch{}finally{}if(n=hs(e,t,l,a),n!==null)return at(n,e,a),so(n,t,a),!0}return!1}function Ws(e,t,n,a){if(a={lane:2,revertLane:Hu(),action:a,hasEagerState:!1,eagerState:null,next:null},ti(e)){if(t)throw Error(g(479))}else t=hs(e,n,a,2),t!==null&&at(t,e,2)}function ti(e){var t=e.alternate;return e===V||t!==null&&t===V}function io(e,t){la=Fl=!0;var n=e.pending;n===null?t.next=t:(t.next=n.next,n.next=t),e.pending=t}function so(e,t,n){if((n&4194048)!==0){var a=t.lanes;a&=e.pendingLanes,n|=a,t.lanes=n,mr(e,n)}}var ni={readContext:je,use:Wl,useCallback:ge,useContext:ge,useEffect:ge,useImperativeHandle:ge,useLayoutEffect:ge,useInsertionEffect:ge,useMemo:ge,useReducer:ge,useRef:ge,useState:ge,useDebugValue:ge,useDeferredValue:ge,useTransition:ge,useSyncExternalStore:ge,useId:ge,useHostTransitionStatus:ge,useFormState:ge,useActionState:ge,useOptimistic:ge,useMemoCache:ge,useCacheRefresh:ge},uo={readContext:je,use:Wl,useCallback:function(e,t){return Ge().memoizedState=[e,t===void 0?null:t],e},useContext:je,useEffect:Zc,useImperativeHandle:function(e,t,n){n=n!=null?n.concat([e]):null,ei(4194308,4,wc.bind(null,t,e),n)},useLayoutEffect:function(e,t){return ei(4194308,4,e,t)},useInsertionEffect:function(e,t){ei(4,2,e,t)},useMemo:function(e,t){var n=Ge();t=t===void 0?null:t;var a=e();if(qn){Vt(!0);try{e()}finally{Vt(!1)}}return n.memoizedState=[a,t],a},useReducer:function(e,t,n){var a=Ge();if(n!==void 0){var l=n(t);if(qn){Vt(!0);try{n(t)}finally{Vt(!1)}}}else l=t;return a.memoizedState=a.baseState=l,e={pending:null,lanes:0,dispatch:null,lastRenderedReducer:e,lastRenderedState:l},a.queue=e,e=e.dispatch=zp.bind(null,V,e),[a.memoizedState,e]},useRef:function(e){var t=Ge();return e={current:e},t.memoizedState=e},useState:function(e){e=Qs(e);var t=e.queue,n=lo.bind(null,V,t);return t.dispatch=n,[e.memoizedState,n]},useDebugValue:Js,useDeferredValue:function(e,t){var n=Ge();return ws(n,e,t)},useTransition:function(){var e=Qs(!1);return e=Ic.bind(null,V,e.queue,!0,!1),Ge().memoizedState=e,[!1,e]},useSyncExternalStore:function(e,t,n){var a=V,l=Ge();if($){if(n===void 0)throw Error(g(407));n=n()}else{if(n=t(),oe===null)throw Error(g(349));(J&124)!==0||Uc(a,t,n)}l.memoizedState=n;var i={value:n,getSnapshot:t};return l.queue=i,Zc(qc.bind(null,a,i,e),[e]),a.flags|=2048,sa(9,Il(),Hc.bind(null,a,i,n,t),null),n},useId:function(){var e=Ge(),t=oe.identifierPrefix;if($){var n=Lt,a=qt;n=(a&~(1<<32-ke(a)-1)).toString(32)+n,t="«"+t+"R"+n,n=kl++,0<n&&(t+="H"+n.toString(32)),t+="»"}else n=Ap++,t="«"+t+"r"+n.toString(32)+"»";return e.memoizedState=t},useHostTransitionStatus:ks,useFormState:Yc,useActionState:Yc,useOptimistic:function(e){var t=Ge();t.memoizedState=t.baseState=e;var n={pending:null,lanes:0,dispatch:null,lastRenderedReducer:null,lastRenderedState:null};return t.queue=n,t=Ws.bind(null,V,!0,n),n.dispatch=t,[e,t]},useMemoCache:Gs,useCacheRefresh:function(){return Ge().memoizedState=Np.bind(null,V)}},ro={readContext:je,use:Wl,useCallback:kc,useContext:je,useEffect:Qc,useImperativeHandle:Fc,useInsertionEffect:Kc,useLayoutEffect:Jc,useMemo:Wc,useReducer:$l,useRef:Vc,useState:function(){return $l(Dt)},useDebugValue:Js,useDeferredValue:function(e,t){var n=ye();return $c(n,ie.memoizedState,e,t)},useTransition:function(){var e=$l(Dt)[0],t=ye().memoizedState;return[typeof e=="boolean"?e:wa(e),t]},useSyncExternalStore:Ac,useId:no,useHostTransitionStatus:ks,useFormState:Bc,useActionState:Bc,useOptimistic:function(e,t){var n=ye();return zc(n,ie,e,t)},useMemoCache:Gs,useCacheRefresh:ao},Dp={readContext:je,use:Wl,useCallback:kc,useContext:je,useEffect:Qc,useImperativeHandle:Fc,useInsertionEffect:Kc,useLayoutEffect:Jc,useMemo:Wc,useReducer:Zs,useRef:Vc,useState:function(){return Zs(Dt)},useDebugValue:Js,useDeferredValue:function(e,t){var n=ye();return ie===null?ws(n,e,t):$c(n,ie.memoizedState,e,t)},useTransition:function(){var e=Zs(Dt)[0],t=ye().memoizedState;return[typeof e=="boolean"?e:wa(e),t]},useSyncExternalStore:Ac,useId:no,useHostTransitionStatus:ks,useFormState:Gc,useActionState:Gc,useOptimistic:function(e,t){var n=ye();return ie!==null?zc(n,ie,e,t):(n.baseState=e,[e,n.queue.dispatch])},useMemoCache:Gs,useCacheRefresh:ao},ua=null,Wa=0;function ai(e){var t=Wa;return Wa+=1,ua===null&&(ua=[]),bc(ua,e,t)}function $a(e,t){t=t.props.ref,e.ref=t!==void 0?t:null}function li(e,t){throw t.$$typeof===ne?Error(g(525)):(e=Object.prototype.toString.call(t),Error(g(31,e==="[object Object]"?"object with keys {"+Object.keys(t).join(", ")+"}":e)))}function co(e){var t=e._init;return t(e._payload)}function oo(e){function t(d,o){if(e){var p=d.deletions;p===null?(d.deletions=[o],d.flags|=16):p.push(o)}}function n(d,o){if(!e)return null;for(;o!==null;)t(d,o),o=o.sibling;return null}function a(d){for(var o=new Map;d!==null;)d.key!==null?o.set(d.key,d):o.set(d.index,d),d=d.sibling;return o}function l(d,o){return d=Ht(d,o),d.index=0,d.sibling=null,d}function i(d,o,p){return d.index=p,e?(p=d.alternate,p!==null?(p=p.index,p<o?(d.flags|=67108866,o):p):(d.flags|=67108866,o)):(d.flags|=1048576,o)}function s(d){return e&&d.alternate===null&&(d.flags|=67108866),d}function u(d,o,p,y){return o===null||o.tag!==6?(o=Es(p,d.mode,y),o.return=d,o):(o=l(o,p),o.return=d,o)}function r(d,o,p,y){var U=p.type;return U===ee?E(d,o,p.props.children,y,p.key):o!==null&&(o.elementType===U||typeof U=="object"&&U!==null&&U.$$typeof===Je&&co(U)===o.type)?(o=l(o,p.props),$a(o,p),o.return=d,o):(o=Bl(p.type,p.key,p.props,null,d.mode,y),$a(o,p),o.return=d,o)}function m(d,o,p,y){return o===null||o.tag!==4||o.stateNode.containerInfo!==p.containerInfo||o.stateNode.implementation!==p.implementation?(o=bs(p,d.mode,y),o.return=d,o):(o=l(o,p.children||[]),o.return=d,o)}function E(d,o,p,y,U){return o===null||o.tag!==7?(o=Tn(p,d.mode,y,U),o.return=d,o):(o=l(o,p),o.return=d,o)}function S(d,o,p){if(typeof o=="string"&&o!==""||typeof o=="number"||typeof o=="bigint")return o=Es(""+o,d.mode,p),o.return=d,o;if(typeof o=="object"&&o!==null){switch(o.$$typeof){case w:return p=Bl(o.type,o.key,o.props,null,d.mode,p),$a(p,o),p.return=d,p;case I:return o=bs(o,d.mode,p),o.return=d,o;case Je:var y=o._init;return o=y(o._payload),S(d,o,p)}if(De(o)||ze(o))return o=Tn(o,d.mode,p,null),o.return=d,o;if(typeof o.then=="function")return S(d,ai(o),p);if(o.$$typeof===Ne)return S(d,Zl(d,o),p);li(d,o)}return null}function v(d,o,p,y){var U=o!==null?o.key:null;if(typeof p=="string"&&p!==""||typeof p=="number"||typeof p=="bigint")return U!==null?null:u(d,o,""+p,y);if(typeof p=="object"&&p!==null){switch(p.$$typeof){case w:return p.key===U?r(d,o,p,y):null;case I:return p.key===U?m(d,o,p,y):null;case Je:return U=p._init,p=U(p._payload),v(d,o,p,y)}if(De(p)||ze(p))return U!==null?null:E(d,o,p,y,null);if(typeof p.then=="function")return v(d,o,ai(p),y);if(p.$$typeof===Ne)return v(d,o,Zl(d,p),y);li(d,p)}return null}function h(d,o,p,y,U){if(typeof y=="string"&&y!==""||typeof y=="number"||typeof y=="bigint")return d=d.get(p)||null,u(o,d,""+y,U);if(typeof y=="object"&&y!==null){switch(y.$$typeof){case w:return d=d.get(y.key===null?p:y.key)||null,r(o,d,y,U);case I:return d=d.get(y.key===null?p:y.key)||null,m(o,d,y,U);case Je:var Z=y._init;return y=Z(y._payload),h(d,o,p,y,U)}if(De(y)||ze(y))return d=d.get(p)||null,E(o,d,y,U,null);if(typeof y.then=="function")return h(d,o,p,ai(y),U);if(y.$$typeof===Ne)return h(d,o,p,Zl(o,y),U);li(o,y)}return null}function j(d,o,p,y){for(var U=null,Z=null,q=o,D=o=0,xe=null;q!==null&&D<p.length;D++){q.index>D?(xe=q,q=null):xe=q.sibling;var W=v(d,q,p[D],y);if(W===null){q===null&&(q=xe);break}e&&q&&W.alternate===null&&t(d,q),o=i(W,o,D),Z===null?U=W:Z.sibling=W,Z=W,q=xe}if(D===p.length)return n(d,q),$&&On(d,D),U;if(q===null){for(;D<p.length;D++)q=S(d,p[D],y),q!==null&&(o=i(q,o,D),Z===null?U=q:Z.sibling=q,Z=q);return $&&On(d,D),U}for(q=a(q);D<p.length;D++)xe=h(q,d,D,p[D],y),xe!==null&&(e&&xe.alternate!==null&&q.delete(xe.key===null?D:xe.key),o=i(xe,o,D),Z===null?U=xe:Z.sibling=xe,Z=xe);return e&&q.forEach(function(pn){return t(d,pn)}),$&&On(d,D),U}function z(d,o,p,y){if(p==null)throw Error(g(151));for(var U=null,Z=null,q=o,D=o=0,xe=null,W=p.next();q!==null&&!W.done;D++,W=p.next()){q.index>D?(xe=q,q=null):xe=q.sibling;var pn=v(d,q,W.value,y);if(pn===null){q===null&&(q=xe);break}e&&q&&pn.alternate===null&&t(d,q),o=i(pn,o,D),Z===null?U=pn:Z.sibling=pn,Z=pn,q=xe}if(W.done)return n(d,q),$&&On(d,D),U;if(q===null){for(;!W.done;D++,W=p.next())W=S(d,W.value,y),W!==null&&(o=i(W,o,D),Z===null?U=W:Z.sibling=W,Z=W);return $&&On(d,D),U}for(q=a(q);!W.done;D++,W=p.next())W=h(q,d,D,W.value,y),W!==null&&(e&&W.alternate!==null&&q.delete(W.key===null?D:W.key),o=i(W,o,D),Z===null?U=W:Z.sibling=W,Z=W);return e&&q.forEach(function(Cm){return t(d,Cm)}),$&&On(d,D),U}function ue(d,o,p,y){if(typeof p=="object"&&p!==null&&p.type===ee&&p.key===null&&(p=p.props.children),typeof p=="object"&&p!==null){switch(p.$$typeof){case w:e:{for(var U=p.key;o!==null;){if(o.key===U){if(U=p.type,U===ee){if(o.tag===7){n(d,o.sibling),y=l(o,p.props.children),y.return=d,d=y;break e}}else if(o.elementType===U||typeof U=="object"&&U!==null&&U.$$typeof===Je&&co(U)===o.type){n(d,o.sibling),y=l(o,p.props),$a(y,p),y.return=d,d=y;break e}n(d,o);break}else t(d,o);o=o.sibling}p.type===ee?(y=Tn(p.props.children,d.mode,y,p.key),y.return=d,d=y):(y=Bl(p.type,p.key,p.props,null,d.mode,y),$a(y,p),y.return=d,d=y)}return s(d);case I:e:{for(U=p.key;o!==null;){if(o.key===U)if(o.tag===4&&o.stateNode.containerInfo===p.containerInfo&&o.stateNode.implementation===p.implementation){n(d,o.sibling),y=l(o,p.children||[]),y.return=d,d=y;break e}else{n(d,o);break}else t(d,o);o=o.sibling}y=bs(p,d.mode,y),y.return=d,d=y}return s(d);case Je:return U=p._init,p=U(p._payload),ue(d,o,p,y)}if(De(p))return j(d,o,p,y);if(ze(p)){if(U=ze(p),typeof U!="function")throw Error(g(150));return p=U.call(p),z(d,o,p,y)}if(typeof p.then=="function")return ue(d,o,ai(p),y);if(p.$$typeof===Ne)return ue(d,o,Zl(d,p),y);li(d,p)}return typeof p=="string"&&p!==""||typeof p=="number"||typeof p=="bigint"?(p=""+p,o!==null&&o.tag===6?(n(d,o.sibling),y=l(o,p),y.return=d,d=y):(n(d,o),y=Es(p,d.mode,y),y.return=d,d=y),s(d)):n(d,o)}return function(d,o,p,y){try{Wa=0;var U=ue(d,o,p,y);return ua=null,U}catch(q){if(q===Ga||q===Kl)throw q;var Z=$e(29,q,null,d.mode);return Z.lanes=y,Z.return=d,Z}finally{}}}var ra=oo(!0),fo=oo(!1),ot=R(null),St=null;function Wt(e){var t=e.alternate;M(Te,Te.current&1),M(ot,e),St===null&&(t===null||aa.current!==null||t.memoizedState!==null)&&(St=e)}function po(e){if(e.tag===22){if(M(Te,Te.current),M(ot,e),St===null){var t=e.alternate;t!==null&&t.memoizedState!==null&&(St=e)}}else $t()}function $t(){M(Te,Te.current),M(ot,ot.current)}function Ct(e){A(ot),St===e&&(St=null),A(Te)}var Te=R(0);function ii(e){for(var t=e;t!==null;){if(t.tag===13){var n=t.memoizedState;if(n!==null&&(n=n.dehydrated,n===null||n.data==="$?"||Pu(n)))return t}else if(t.tag===19&&t.memoizedProps.revealOrder!==void 0){if((t.flags&128)!==0)return t}else if(t.child!==null){t.child.return=t,t=t.child;continue}if(t===e)break;for(;t.sibling===null;){if(t.return===null||t.return===e)return null;t=t.return}t.sibling.return=t.return,t=t.sibling}return null}function $s(e,t,n,a){t=e.memoizedState,n=n(a,t),n=n==null?t:H({},t,n),e.memoizedState=n,e.lanes===0&&(e.updateQueue.baseState=n)}var Is={enqueueSetState:function(e,t,n){e=e._reactInternals;var a=nt(),l=wt(a);l.payload=t,n!=null&&(l.callback=n),t=Ft(e,l,a),t!==null&&(at(t,e,a),Za(t,e,a))},enqueueReplaceState:function(e,t,n){e=e._reactInternals;var a=nt(),l=wt(a);l.tag=1,l.payload=t,n!=null&&(l.callback=n),t=Ft(e,l,a),t!==null&&(at(t,e,a),Za(t,e,a))},enqueueForceUpdate:function(e,t){e=e._reactInternals;var n=nt(),a=wt(n);a.tag=2,t!=null&&(a.callback=t),t=Ft(e,a,n),t!==null&&(at(t,e,n),Za(t,e,n))}};function mo(e,t,n,a,l,i,s){return e=e.stateNode,typeof e.shouldComponentUpdate=="function"?e.shouldComponentUpdate(a,i,s):t.prototype&&t.prototype.isPureReactComponent?!Da(n,a)||!Da(l,i):!0}function vo(e,t,n,a){e=t.state,typeof t.componentWillReceiveProps=="function"&&t.componentWillReceiveProps(n,a),typeof t.UNSAFE_componentWillReceiveProps=="function"&&t.UNSAFE_componentWillReceiveProps(n,a),t.state!==e&&Is.enqueueReplaceState(t,t.state,null)}function Ln(e,t){var n=t;if("ref"in t){n={};for(var a in t)a!=="ref"&&(n[a]=t[a])}if(e=e.defaultProps){n===t&&(n=H({},n));for(var l in e)n[l]===void 0&&(n[l]=e[l])}return n}var si=typeof reportError=="function"?reportError:function(e){if(typeof window=="object"&&typeof window.ErrorEvent=="function"){var t=new window.ErrorEvent("error",{bubbles:!0,cancelable:!0,message:typeof e=="object"&&e!==null&&typeof e.message=="string"?String(e.message):String(e),error:e});if(!window.dispatchEvent(t))return}else if(typeof process=="object"&&typeof process.emit=="function"){process.emit("uncaughtException",e);return}console.error(e)};function ho(e){si(e)}function go(e){console.error(e)}function Eo(e){si(e)}function ui(e,t){try{var n=e.onUncaughtError;n(t.value,{componentStack:t.stack})}catch(a){setTimeout(function(){throw a})}}function bo(e,t,n){try{var a=e.onCaughtError;a(n.value,{componentStack:n.stack,errorBoundary:t.tag===1?t.stateNode:null})}catch(l){setTimeout(function(){throw l})}}function eu(e,t,n){return n=wt(n),n.tag=3,n.payload={element:null},n.callback=function(){ui(e,t)},n}function yo(e){return e=wt(e),e.tag=3,e}function So(e,t,n,a){var l=n.type.getDerivedStateFromError;if(typeof l=="function"){var i=a.value;e.payload=function(){return l(i)},e.callback=function(){bo(t,n,a)}}var s=n.stateNode;s!==null&&typeof s.componentDidCatch=="function"&&(e.callback=function(){bo(t,n,a),typeof l!="function"&&(ln===null?ln=new Set([this]):ln.add(this));var u=a.stack;this.componentDidCatch(a.value,{componentStack:u!==null?u:""})})}function Cp(e,t,n,a,l){if(n.flags|=32768,a!==null&&typeof a=="object"&&typeof a.then=="function"){if(t=n.alternate,t!==null&&Ya(t,n,l,!0),n=ot.current,n!==null){switch(n.tag){case 13:return St===null?Ou():n.alternate===null&&he===0&&(he=3),n.flags&=-257,n.flags|=65536,n.lanes=l,a===Hs?n.flags|=16384:(t=n.updateQueue,t===null?n.updateQueue=new Set([a]):t.add(a),xu(e,a,l)),!1;case 22:return n.flags|=65536,a===Hs?n.flags|=16384:(t=n.updateQueue,t===null?(t={transitions:null,markerInstances:null,retryQueue:new Set([a])},n.updateQueue=t):(n=t.retryQueue,n===null?t.retryQueue=new Set([a]):n.add(a)),xu(e,a,l)),!1}throw Error(g(435,n.tag))}return xu(e,a,l),Ou(),!1}if($)return t=ot.current,t!==null?((t.flags&65536)===0&&(t.flags|=256),t.flags|=65536,t.lanes=l,a!==Ts&&(e=Error(g(422),{cause:a}),Xa(st(e,n)))):(a!==Ts&&(t=Error(g(423),{cause:a}),Xa(st(t,n))),e=e.current.alternate,e.flags|=65536,l&=-l,e.lanes|=l,a=st(a,n),l=eu(e.stateNode,a,l),Ns(e,l),he!==4&&(he=2)),!1;var i=Error(g(520),{cause:a});if(i=st(i,n),il===null?il=[i]:il.push(i),he!==4&&(he=2),t===null)return!0;a=st(a,n),n=t;do{switch(n.tag){case 3:return n.flags|=65536,e=l&-l,n.lanes|=e,e=eu(n.stateNode,a,e),Ns(n,e),!1;case 1:if(t=n.type,i=n.stateNode,(n.flags&128)===0&&(typeof t.getDerivedStateFromError=="function"||i!==null&&typeof i.componentDidCatch=="function"&&(ln===null||!ln.has(i))))return n.flags|=65536,l&=-l,n.lanes|=l,l=yo(l),So(l,e,n,a),Ns(n,l),!1}n=n.return}while(n!==null);return!1}var To=Error(g(461)),Oe=!1;function He(e,t,n,a){t.child=e===null?fo(t,null,n,a):ra(t,e.child,n,a)}function Ro(e,t,n,a,l){n=n.render;var i=t.ref;if("ref"in a){var s={};for(var u in a)u!=="ref"&&(s[u]=a[u])}else s=a;return Un(t),a=_s(e,t,n,s,i,l),u=Xs(),e!==null&&!Oe?(Ys(e,t,l),jt(e,t,l)):($&&u&&ys(t),t.flags|=1,He(e,t,a,l),t.child)}function Oo(e,t,n,a,l){if(e===null){var i=n.type;return typeof i=="function"&&!gs(i)&&i.defaultProps===void 0&&n.compare===null?(t.tag=15,t.type=i,Mo(e,t,i,a,l)):(e=Bl(n.type,null,a,t,t.mode,l),e.ref=t.ref,e.return=t,t.child=e)}if(i=e.child,!ru(e,l)){var s=i.memoizedProps;if(n=n.compare,n=n!==null?n:Da,n(s,a)&&e.ref===t.ref)return jt(e,t,l)}return t.flags|=1,e=Ht(i,a),e.ref=t.ref,e.return=t,t.child=e}function Mo(e,t,n,a,l){if(e!==null){var i=e.memoizedProps;if(Da(i,a)&&e.ref===t.ref)if(Oe=!1,t.pendingProps=a=i,ru(e,l))(e.flags&131072)!==0&&(Oe=!0);else return t.lanes=e.lanes,jt(e,t,l)}return tu(e,t,n,a,l)}function xo(e,t,n){var a=t.pendingProps,l=a.children,i=e!==null?e.memoizedState:null;if(a.mode==="hidden"){if((t.flags&128)!==0){if(a=i!==null?i.baseLanes|n:n,e!==null){for(l=t.child=e.child,i=0;l!==null;)i=i|l.lanes|l.childLanes,l=l.sibling;t.childLanes=i&~a}else t.childLanes=0,t.child=null;return Ao(e,t,a,n)}if((n&536870912)!==0)t.memoizedState={baseLanes:0,cachePool:null},e!==null&&Ql(t,i!==null?i.cachePool:null),i!==null?Oc(t,i):Ds(),po(t);else return t.lanes=t.childLanes=536870912,Ao(e,t,i!==null?i.baseLanes|n:n,n)}else i!==null?(Ql(t,i.cachePool),Oc(t,i),$t(),t.memoizedState=null):(e!==null&&Ql(t,null),Ds(),$t());return He(e,t,l,n),t.child}function Ao(e,t,n,a){var l=Us();return l=l===null?null:{parent:Se._currentValue,pool:l},t.memoizedState={baseLanes:n,cachePool:l},e!==null&&Ql(t,null),Ds(),po(t),e!==null&&Ya(e,t,a,!0),null}function ri(e,t){var n=t.ref;if(n===null)e!==null&&e.ref!==null&&(t.flags|=4194816);else{if(typeof n!="function"&&typeof n!="object")throw Error(g(284));(e===null||e.ref!==n)&&(t.flags|=4194816)}}function tu(e,t,n,a,l){return Un(t),n=_s(e,t,n,a,void 0,l),a=Xs(),e!==null&&!Oe?(Ys(e,t,l),jt(e,t,l)):($&&a&&ys(t),t.flags|=1,He(e,t,n,l),t.child)}function Uo(e,t,n,a,l,i){return Un(t),t.updateQueue=null,n=xc(t,a,n,l),Mc(e),a=Xs(),e!==null&&!Oe?(Ys(e,t,i),jt(e,t,i)):($&&a&&ys(t),t.flags|=1,He(e,t,n,i),t.child)}function Ho(e,t,n,a,l){if(Un(t),t.stateNode===null){var i=$n,s=n.contextType;typeof s=="object"&&s!==null&&(i=je(s)),i=new n(a,i),t.memoizedState=i.state!==null&&i.state!==void 0?i.state:null,i.updater=Is,t.stateNode=i,i._reactInternals=t,i=t.stateNode,i.props=a,i.state=t.memoizedState,i.refs={},qs(t),s=n.contextType,i.context=typeof s=="object"&&s!==null?je(s):$n,i.state=t.memoizedState,s=n.getDerivedStateFromProps,typeof s=="function"&&($s(t,n,s,a),i.state=t.memoizedState),typeof n.getDerivedStateFromProps=="function"||typeof i.getSnapshotBeforeUpdate=="function"||typeof i.UNSAFE_componentWillMount!="function"&&typeof i.componentWillMount!="function"||(s=i.state,typeof i.componentWillMount=="function"&&i.componentWillMount(),typeof i.UNSAFE_componentWillMount=="function"&&i.UNSAFE_componentWillMount(),s!==i.state&&Is.enqueueReplaceState(i,i.state,null),Ka(t,a,i,l),Qa(),i.state=t.memoizedState),typeof i.componentDidMount=="function"&&(t.flags|=4194308),a=!0}else if(e===null){i=t.stateNode;var u=t.memoizedProps,r=Ln(n,u);i.props=r;var m=i.context,E=n.contextType;s=$n,typeof E=="object"&&E!==null&&(s=je(E));var S=n.getDerivedStateFromProps;E=typeof S=="function"||typeof i.getSnapshotBeforeUpdate=="function",u=t.pendingProps!==u,E||typeof i.UNSAFE_componentWillReceiveProps!="function"&&typeof i.componentWillReceiveProps!="function"||(u||m!==s)&&vo(t,i,a,s),Jt=!1;var v=t.memoizedState;i.state=v,Ka(t,a,i,l),Qa(),m=t.memoizedState,u||v!==m||Jt?(typeof S=="function"&&($s(t,n,S,a),m=t.memoizedState),(r=Jt||mo(t,n,r,a,v,m,s))?(E||typeof i.UNSAFE_componentWillMount!="function"&&typeof i.componentWillMount!="function"||(typeof i.componentWillMount=="function"&&i.componentWillMount(),typeof i.UNSAFE_componentWillMount=="function"&&i.UNSAFE_componentWillMount()),typeof i.componentDidMount=="function"&&(t.flags|=4194308)):(typeof i.componentDidMount=="function"&&(t.flags|=4194308),t.memoizedProps=a,t.memoizedState=m),i.props=a,i.state=m,i.context=s,a=r):(typeof i.componentDidMount=="function"&&(t.flags|=4194308),a=!1)}else{i=t.stateNode,Ls(e,t),s=t.memoizedProps,E=Ln(n,s),i.props=E,S=t.pendingProps,v=i.context,m=n.contextType,r=$n,typeof m=="object"&&m!==null&&(r=je(m)),u=n.getDerivedStateFromProps,(m=typeof u=="function"||typeof i.getSnapshotBeforeUpdate=="function")||typeof i.UNSAFE_componentWillReceiveProps!="function"&&typeof i.componentWillReceiveProps!="function"||(s!==S||v!==r)&&vo(t,i,a,r),Jt=!1,v=t.memoizedState,i.state=v,Ka(t,a,i,l),Qa();var h=t.memoizedState;s!==S||v!==h||Jt||e!==null&&e.dependencies!==null&&Vl(e.dependencies)?(typeof u=="function"&&($s(t,n,u,a),h=t.memoizedState),(E=Jt||mo(t,n,E,a,v,h,r)||e!==null&&e.dependencies!==null&&Vl(e.dependencies))?(m||typeof i.UNSAFE_componentWillUpdate!="function"&&typeof i.componentWillUpdate!="function"||(typeof i.componentWillUpdate=="function"&&i.componentWillUpdate(a,h,r),typeof i.UNSAFE_componentWillUpdate=="function"&&i.UNSAFE_componentWillUpdate(a,h,r)),typeof i.componentDidUpdate=="function"&&(t.flags|=4),typeof i.getSnapshotBeforeUpdate=="function"&&(t.flags|=1024)):(typeof i.componentDidUpdate!="function"||s===e.memoizedProps&&v===e.memoizedState||(t.flags|=4),typeof i.getSnapshotBeforeUpdate!="function"||s===e.memoizedProps&&v===e.memoizedState||(t.flags|=1024),t.memoizedProps=a,t.memoizedState=h),i.props=a,i.state=h,i.context=r,a=E):(typeof i.componentDidUpdate!="function"||s===e.memoizedProps&&v===e.memoizedState||(t.flags|=4),typeof i.getSnapshotBeforeUpdate!="function"||s===e.memoizedProps&&v===e.memoizedState||(t.flags|=1024),a=!1)}return i=a,ri(e,t),a=(t.flags&128)!==0,i||a?(i=t.stateNode,n=a&&typeof n.getDerivedStateFromError!="function"?null:i.render(),t.flags|=1,e!==null&&a?(t.child=ra(t,e.child,null,l),t.child=ra(t,null,n,l)):He(e,t,n,l),t.memoizedState=i.state,e=t.child):e=jt(e,t,l),e}function qo(e,t,n,a){return _a(),t.flags|=256,He(e,t,n,a),t.child}var nu={dehydrated:null,treeContext:null,retryLane:0,hydrationErrors:null};function au(e){return{baseLanes:e,cachePool:hc()}}function lu(e,t,n){return e=e!==null?e.childLanes&~n:0,t&&(e|=ft),e}function Lo(e,t,n){var a=t.pendingProps,l=!1,i=(t.flags&128)!==0,s;if((s=i)||(s=e!==null&&e.memoizedState===null?!1:(Te.current&2)!==0),s&&(l=!0,t.flags&=-129),s=(t.flags&32)!==0,t.flags&=-33,e===null){if($){if(l?Wt(t):$t(),$){var u=ve,r;if(r=u){e:{for(r=u,u=yt;r.nodeType!==8;){if(!u){u=null;break e}if(r=gt(r.nextSibling),r===null){u=null;break e}}u=r}u!==null?(t.memoizedState={dehydrated:u,treeContext:Rn!==null?{id:qt,overflow:Lt}:null,retryLane:536870912,hydrationErrors:null},r=$e(18,null,null,0),r.stateNode=u,r.return=t,t.child=r,Xe=t,ve=null,r=!0):r=!1}r||xn(t)}if(u=t.memoizedState,u!==null&&(u=u.dehydrated,u!==null))return Pu(u)?t.lanes=32:t.lanes=536870912,null;Ct(t)}return u=a.children,a=a.fallback,l?($t(),l=t.mode,u=ci({mode:"hidden",children:u},l),a=Tn(a,l,n,null),u.return=t,a.return=t,u.sibling=a,t.child=u,l=t.child,l.memoizedState=au(n),l.childLanes=lu(e,s,n),t.memoizedState=nu,a):(Wt(t),iu(t,u))}if(r=e.memoizedState,r!==null&&(u=r.dehydrated,u!==null)){if(i)t.flags&256?(Wt(t),t.flags&=-257,t=su(e,t,n)):t.memoizedState!==null?($t(),t.child=e.child,t.flags|=128,t=null):($t(),l=a.fallback,u=t.mode,a=ci({mode:"visible",children:a.children},u),l=Tn(l,u,n,null),l.flags|=2,a.return=t,l.return=t,a.sibling=l,t.child=a,ra(t,e.child,null,n),a=t.child,a.memoizedState=au(n),a.childLanes=lu(e,s,n),t.memoizedState=nu,t=l);else if(Wt(t),Pu(u)){if(s=u.nextSibling&&u.nextSibling.dataset,s)var m=s.dgst;s=m,a=Error(g(419)),a.stack="",a.digest=s,Xa({value:a,source:null,stack:null}),t=su(e,t,n)}else if(Oe||Ya(e,t,n,!1),s=(n&e.childLanes)!==0,Oe||s){if(s=oe,s!==null&&(a=n&-n,a=(a&42)!==0?1:Gi(a),a=(a&(s.suspendedLanes|n))!==0?0:a,a!==0&&a!==r.retryLane))throw r.retryLane=a,Wn(e,a),at(s,e,a),To;u.data==="$?"||Ou(),t=su(e,t,n)}else u.data==="$?"?(t.flags|=192,t.child=e.child,t=null):(e=r.treeContext,ve=gt(u.nextSibling),Xe=t,$=!0,Mn=null,yt=!1,e!==null&&(rt[ct++]=qt,rt[ct++]=Lt,rt[ct++]=Rn,qt=e.id,Lt=e.overflow,Rn=t),t=iu(t,a.children),t.flags|=4096);return t}return l?($t(),l=a.fallback,u=t.mode,r=e.child,m=r.sibling,a=Ht(r,{mode:"hidden",children:a.children}),a.subtreeFlags=r.subtreeFlags&65011712,m!==null?l=Ht(m,l):(l=Tn(l,u,n,null),l.flags|=2),l.return=t,a.return=t,a.sibling=l,t.child=a,a=l,l=t.child,u=e.child.memoizedState,u===null?u=au(n):(r=u.cachePool,r!==null?(m=Se._currentValue,r=r.parent!==m?{parent:m,pool:m}:r):r=hc(),u={baseLanes:u.baseLanes|n,cachePool:r}),l.memoizedState=u,l.childLanes=lu(e,s,n),t.memoizedState=nu,a):(Wt(t),n=e.child,e=n.sibling,n=Ht(n,{mode:"visible",children:a.children}),n.return=t,n.sibling=null,e!==null&&(s=t.deletions,s===null?(t.deletions=[e],t.flags|=16):s.push(e)),t.child=n,t.memoizedState=null,n)}function iu(e,t){return t=ci({mode:"visible",children:t},e.mode),t.return=e,e.child=t}function ci(e,t){return e=$e(22,e,null,t),e.lanes=0,e.stateNode={_visibility:1,_pendingMarkers:null,_retryCache:null,_transitions:null},e}function su(e,t,n){return ra(t,e.child,null,n),e=iu(t,t.pendingProps.children),e.flags|=2,t.memoizedState=null,e}function No(e,t,n){e.lanes|=t;var a=e.alternate;a!==null&&(a.lanes|=t),Os(e.return,t,n)}function uu(e,t,n,a,l){var i=e.memoizedState;i===null?e.memoizedState={isBackwards:t,rendering:null,renderingStartTime:0,last:a,tail:n,tailMode:l}:(i.isBackwards=t,i.rendering=null,i.renderingStartTime=0,i.last=a,i.tail=n,i.tailMode=l)}function zo(e,t,n){var a=t.pendingProps,l=a.revealOrder,i=a.tail;if(He(e,t,a.children,n),a=Te.current,(a&2)!==0)a=a&1|2,t.flags|=128;else{if(e!==null&&(e.flags&128)!==0)e:for(e=t.child;e!==null;){if(e.tag===13)e.memoizedState!==null&&No(e,n,t);else if(e.tag===19)No(e,n,t);else if(e.child!==null){e.child.return=e,e=e.child;continue}if(e===t)break e;for(;e.sibling===null;){if(e.return===null||e.return===t)break e;e=e.return}e.sibling.return=e.return,e=e.sibling}a&=1}switch(M(Te,a),l){case"forwards":for(n=t.child,l=null;n!==null;)e=n.alternate,e!==null&&ii(e)===null&&(l=n),n=n.sibling;n=l,n===null?(l=t.child,t.child=null):(l=n.sibling,n.sibling=null),uu(t,!1,l,n,i);break;case"backwards":for(n=null,l=t.child,t.child=null;l!==null;){if(e=l.alternate,e!==null&&ii(e)===null){t.child=l;break}e=l.sibling,l.sibling=n,n=l,l=e}uu(t,!0,n,null,i);break;case"together":uu(t,!1,null,null,void 0);break;default:t.memoizedState=null}return t.child}function jt(e,t,n){if(e!==null&&(t.dependencies=e.dependencies),an|=t.lanes,(n&t.childLanes)===0)if(e!==null){if(Ya(e,t,n,!1),(n&t.childLanes)===0)return null}else return null;if(e!==null&&t.child!==e.child)throw Error(g(153));if(t.child!==null){for(e=t.child,n=Ht(e,e.pendingProps),t.child=n,n.return=t;e.sibling!==null;)e=e.sibling,n=n.sibling=Ht(e,e.pendingProps),n.return=t;n.sibling=null}return t.child}function ru(e,t){return(e.lanes&t)!==0?!0:(e=e.dependencies,!!(e!==null&&Vl(e)))}function jp(e,t,n){switch(t.tag){case 3:fe(t,t.stateNode.containerInfo),Kt(t,Se,e.memoizedState.cache),_a();break;case 27:case 5:_i(t);break;case 4:fe(t,t.stateNode.containerInfo);break;case 10:Kt(t,t.type,t.memoizedProps.value);break;case 13:var a=t.memoizedState;if(a!==null)return a.dehydrated!==null?(Wt(t),t.flags|=128,null):(n&t.child.childLanes)!==0?Lo(e,t,n):(Wt(t),e=jt(e,t,n),e!==null?e.sibling:null);Wt(t);break;case 19:var l=(e.flags&128)!==0;if(a=(n&t.childLanes)!==0,a||(Ya(e,t,n,!1),a=(n&t.childLanes)!==0),l){if(a)return zo(e,t,n);t.flags|=128}if(l=t.memoizedState,l!==null&&(l.rendering=null,l.tail=null,l.lastEffect=null),M(Te,Te.current),a)break;return null;case 22:case 23:return t.lanes=0,xo(e,t,n);case 24:Kt(t,Se,e.memoizedState.cache)}return jt(e,t,n)}function Do(e,t,n){if(e!==null)if(e.memoizedProps!==t.pendingProps)Oe=!0;else{if(!ru(e,n)&&(t.flags&128)===0)return Oe=!1,jp(e,t,n);Oe=(e.flags&131072)!==0}else Oe=!1,$&&(t.flags&1048576)!==0&&cc(t,Gl,t.index);switch(t.lanes=0,t.tag){case 16:e:{e=t.pendingProps;var a=t.elementType,l=a._init;if(a=l(a._payload),t.type=a,typeof a=="function")gs(a)?(e=Ln(a,e),t.tag=1,t=Ho(null,t,a,e,n)):(t.tag=0,t=tu(null,t,a,e,n));else{if(a!=null){if(l=a.$$typeof,l===mt){t.tag=11,t=Ro(null,t,a,e,n);break e}else if(l===Ke){t.tag=14,t=Oo(null,t,a,e,n);break e}}throw t=hn(a)||a,Error(g(306,t,""))}}return t;case 0:return tu(e,t,t.type,t.pendingProps,n);case 1:return a=t.type,l=Ln(a,t.pendingProps),Ho(e,t,a,l,n);case 3:e:{if(fe(t,t.stateNode.containerInfo),e===null)throw Error(g(387));a=t.pendingProps;var i=t.memoizedState;l=i.element,Ls(e,t),Ka(t,a,null,n);var s=t.memoizedState;if(a=s.cache,Kt(t,Se,a),a!==i.cache&&Ms(t,[Se],n,!0),Qa(),a=s.element,i.isDehydrated)if(i={element:a,isDehydrated:!1,cache:s.cache},t.updateQueue.baseState=i,t.memoizedState=i,t.flags&256){t=qo(e,t,a,n);break e}else if(a!==l){l=st(Error(g(424)),t),Xa(l),t=qo(e,t,a,n);break e}else{switch(e=t.stateNode.containerInfo,e.nodeType){case 9:e=e.body;break;default:e=e.nodeName==="HTML"?e.ownerDocument.body:e}for(ve=gt(e.firstChild),Xe=t,$=!0,Mn=null,yt=!0,n=fo(t,null,a,n),t.child=n;n;)n.flags=n.flags&-3|4096,n=n.sibling}else{if(_a(),a===l){t=jt(e,t,n);break e}He(e,t,a,n)}t=t.child}return t;case 26:return ri(e,t),e===null?(n=Yf(t.type,null,t.pendingProps,null))?t.memoizedState=n:$||(n=t.type,e=t.pendingProps,a=Ri(X.current).createElement(n),a[Ce]=t,a[Be]=e,Le(a,n,e),Re(a),t.stateNode=a):t.memoizedState=Yf(t.type,e.memoizedProps,t.pendingProps,e.memoizedState),null;case 27:return _i(t),e===null&&$&&(a=t.stateNode=jf(t.type,t.pendingProps,X.current),Xe=t,yt=!0,l=ve,rn(t.type)?(Gu=l,ve=gt(a.firstChild)):ve=l),He(e,t,t.pendingProps.children,n),ri(e,t),e===null&&(t.flags|=4194304),t.child;case 5:return e===null&&$&&((l=a=ve)&&(a=om(a,t.type,t.pendingProps,yt),a!==null?(t.stateNode=a,Xe=t,ve=gt(a.firstChild),yt=!1,l=!0):l=!1),l||xn(t)),_i(t),l=t.type,i=t.pendingProps,s=e!==null?e.memoizedProps:null,a=i.children,Xu(l,i)?a=null:s!==null&&Xu(l,s)&&(t.flags|=32),t.memoizedState!==null&&(l=_s(e,t,Up,null,null,n),ml._currentValue=l),ri(e,t),He(e,t,a,n),t.child;case 6:return e===null&&$&&((e=n=ve)&&(n=fm(n,t.pendingProps,yt),n!==null?(t.stateNode=n,Xe=t,ve=null,e=!0):e=!1),e||xn(t)),null;case 13:return Lo(e,t,n);case 4:return fe(t,t.stateNode.containerInfo),a=t.pendingProps,e===null?t.child=ra(t,null,a,n):He(e,t,a,n),t.child;case 11:return Ro(e,t,t.type,t.pendingProps,n);case 7:return He(e,t,t.pendingProps,n),t.child;case 8:return He(e,t,t.pendingProps.children,n),t.child;case 12:return He(e,t,t.pendingProps.children,n),t.child;case 10:return a=t.pendingProps,Kt(t,t.type,a.value),He(e,t,a.children,n),t.child;case 9:return l=t.type._context,a=t.pendingProps.children,Un(t),l=je(l),a=a(l),t.flags|=1,He(e,t,a,n),t.child;case 14:return Oo(e,t,t.type,t.pendingProps,n);case 15:return Mo(e,t,t.type,t.pendingProps,n);case 19:return zo(e,t,n);case 31:return a=t.pendingProps,n=t.mode,a={mode:a.mode,children:a.children},e===null?(n=ci(a,n),n.ref=t.ref,t.child=n,n.return=t,t=n):(n=Ht(e.child,a),n.ref=t.ref,t.child=n,n.return=t,t=n),t;case 22:return xo(e,t,n);case 24:return Un(t),a=je(Se),e===null?(l=Us(),l===null&&(l=oe,i=xs(),l.pooledCache=i,i.refCount++,i!==null&&(l.pooledCacheLanes|=n),l=i),t.memoizedState={parent:a,cache:l},qs(t),Kt(t,Se,l)):((e.lanes&n)!==0&&(Ls(e,t),Ka(t,null,null,n),Qa()),l=e.memoizedState,i=t.memoizedState,l.parent!==a?(l={parent:a,cache:a},t.memoizedState=l,t.lanes===0&&(t.memoizedState=t.updateQueue.baseState=l),Kt(t,Se,a)):(a=i.cache,Kt(t,Se,a),a!==l.cache&&Ms(t,[Se],n,!0))),He(e,t,t.pendingProps.children,n),t.child;case 29:throw t.pendingProps}throw Error(g(156,t.tag))}function _t(e){e.flags|=4}function Co(e,t){if(t.type!=="stylesheet"||(t.state.loading&4)!==0)e.flags&=-16777217;else if(e.flags|=16777216,!Zf(t)){if(t=ot.current,t!==null&&((J&4194048)===J?St!==null:(J&62914560)!==J&&(J&536870912)===0||t!==St))throw Va=Hs,gc;e.flags|=8192}}function oi(e,t){t!==null&&(e.flags|=4),e.flags&16384&&(t=e.tag!==22?dr():536870912,e.lanes|=t,da|=t)}function Ia(e,t){if(!$)switch(e.tailMode){case"hidden":t=e.tail;for(var n=null;t!==null;)t.alternate!==null&&(n=t),t=t.sibling;n===null?e.tail=null:n.sibling=null;break;case"collapsed":n=e.tail;for(var a=null;n!==null;)n.alternate!==null&&(a=n),n=n.sibling;a===null?t||e.tail===null?e.tail=null:e.tail.sibling=null:a.sibling=null}}function me(e){var t=e.alternate!==null&&e.alternate.child===e.child,n=0,a=0;if(t)for(var l=e.child;l!==null;)n|=l.lanes|l.childLanes,a|=l.subtreeFlags&65011712,a|=l.flags&65011712,l.return=e,l=l.sibling;else for(l=e.child;l!==null;)n|=l.lanes|l.childLanes,a|=l.subtreeFlags,a|=l.flags,l.return=e,l=l.sibling;return e.subtreeFlags|=a,e.childLanes=n,t}function _p(e,t,n){var a=t.pendingProps;switch(Ss(t),t.tag){case 31:case 16:case 15:case 0:case 11:case 7:case 8:case 12:case 9:case 14:return me(t),null;case 1:return me(t),null;case 3:return n=t.stateNode,a=null,e!==null&&(a=e.memoizedState.cache),t.memoizedState.cache!==a&&(t.flags|=2048),zt(Se),Gt(),n.pendingContext&&(n.context=n.pendingContext,n.pendingContext=null),(e===null||e.child===null)&&(ja(t)?_t(t):e===null||e.memoizedState.isDehydrated&&(t.flags&256)===0||(t.flags|=1024,dc())),me(t),null;case 26:return n=t.memoizedState,e===null?(_t(t),n!==null?(me(t),Co(t,n)):(me(t),t.flags&=-16777217)):n?n!==e.memoizedState?(_t(t),me(t),Co(t,n)):(me(t),t.flags&=-16777217):(e.memoizedProps!==a&&_t(t),me(t),t.flags&=-16777217),null;case 27:Sl(t),n=X.current;var l=t.type;if(e!==null&&t.stateNode!=null)e.memoizedProps!==a&&_t(t);else{if(!a){if(t.stateNode===null)throw Error(g(166));return me(t),null}e=N.current,ja(t)?oc(t):(e=jf(l,a,n),t.stateNode=e,_t(t))}return me(t),null;case 5:if(Sl(t),n=t.type,e!==null&&t.stateNode!=null)e.memoizedProps!==a&&_t(t);else{if(!a){if(t.stateNode===null)throw Error(g(166));return me(t),null}if(e=N.current,ja(t))oc(t);else{switch(l=Ri(X.current),e){case 1:e=l.createElementNS("http://www.w3.org/2000/svg",n);break;case 2:e=l.createElementNS("http://www.w3.org/1998/Math/MathML",n);break;default:switch(n){case"svg":e=l.createElementNS("http://www.w3.org/2000/svg",n);break;case"math":e=l.createElementNS("http://www.w3.org/1998/Math/MathML",n);break;case"script":e=l.createElement("div"),e.innerHTML="<script><\/script>",e=e.removeChild(e.firstChild);break;case"select":e=typeof a.is=="string"?l.createElement("select",{is:a.is}):l.createElement("select"),a.multiple?e.multiple=!0:a.size&&(e.size=a.size);break;default:e=typeof a.is=="string"?l.createElement(n,{is:a.is}):l.createElement(n)}}e[Ce]=t,e[Be]=a;e:for(l=t.child;l!==null;){if(l.tag===5||l.tag===6)e.appendChild(l.stateNode);else if(l.tag!==4&&l.tag!==27&&l.child!==null){l.child.return=l,l=l.child;continue}if(l===t)break e;for(;l.sibling===null;){if(l.return===null||l.return===t)break e;l=l.return}l.sibling.return=l.return,l=l.sibling}t.stateNode=e;e:switch(Le(e,n,a),n){case"button":case"input":case"select":case"textarea":e=!!a.autoFocus;break e;case"img":e=!0;break e;default:e=!1}e&&_t(t)}}return me(t),t.flags&=-16777217,null;case 6:if(e&&t.stateNode!=null)e.memoizedProps!==a&&_t(t);else{if(typeof a!="string"&&t.stateNode===null)throw Error(g(166));if(e=X.current,ja(t)){if(e=t.stateNode,n=t.memoizedProps,a=null,l=Xe,l!==null)switch(l.tag){case 27:case 5:a=l.memoizedProps}e[Ce]=t,e=!!(e.nodeValue===n||a!==null&&a.suppressHydrationWarning===!0||Hf(e.nodeValue,n)),e||xn(t)}else e=Ri(e).createTextNode(a),e[Ce]=t,t.stateNode=e}return me(t),null;case 13:if(a=t.memoizedState,e===null||e.memoizedState!==null&&e.memoizedState.dehydrated!==null){if(l=ja(t),a!==null&&a.dehydrated!==null){if(e===null){if(!l)throw Error(g(318));if(l=t.memoizedState,l=l!==null?l.dehydrated:null,!l)throw Error(g(317));l[Ce]=t}else _a(),(t.flags&128)===0&&(t.memoizedState=null),t.flags|=4;me(t),l=!1}else l=dc(),e!==null&&e.memoizedState!==null&&(e.memoizedState.hydrationErrors=l),l=!0;if(!l)return t.flags&256?(Ct(t),t):(Ct(t),null)}if(Ct(t),(t.flags&128)!==0)return t.lanes=n,t;if(n=a!==null,e=e!==null&&e.memoizedState!==null,n){a=t.child,l=null,a.alternate!==null&&a.alternate.memoizedState!==null&&a.alternate.memoizedState.cachePool!==null&&(l=a.alternate.memoizedState.cachePool.pool);var i=null;a.memoizedState!==null&&a.memoizedState.cachePool!==null&&(i=a.memoizedState.cachePool.pool),i!==l&&(a.flags|=2048)}return n!==e&&n&&(t.child.flags|=8192),oi(t,t.updateQueue),me(t),null;case 4:return Gt(),e===null&&zu(t.stateNode.containerInfo),me(t),null;case 10:return zt(t.type),me(t),null;case 19:if(A(Te),l=t.memoizedState,l===null)return me(t),null;if(a=(t.flags&128)!==0,i=l.rendering,i===null)if(a)Ia(l,!1);else{if(he!==0||e!==null&&(e.flags&128)!==0)for(e=t.child;e!==null;){if(i=ii(e),i!==null){for(t.flags|=128,Ia(l,!1),e=i.updateQueue,t.updateQueue=e,oi(t,e),t.subtreeFlags=0,e=n,n=t.child;n!==null;)rc(n,e),n=n.sibling;return M(Te,Te.current&1|2),t.child}e=e.sibling}l.tail!==null&&bt()>pi&&(t.flags|=128,a=!0,Ia(l,!1),t.lanes=4194304)}else{if(!a)if(e=ii(i),e!==null){if(t.flags|=128,a=!0,e=e.updateQueue,t.updateQueue=e,oi(t,e),Ia(l,!0),l.tail===null&&l.tailMode==="hidden"&&!i.alternate&&!$)return me(t),null}else 2*bt()-l.renderingStartTime>pi&&n!==536870912&&(t.flags|=128,a=!0,Ia(l,!1),t.lanes=4194304);l.isBackwards?(i.sibling=t.child,t.child=i):(e=l.last,e!==null?e.sibling=i:t.child=i,l.last=i)}return l.tail!==null?(t=l.tail,l.rendering=t,l.tail=t.sibling,l.renderingStartTime=bt(),t.sibling=null,e=Te.current,M(Te,a?e&1|2:e&1),t):(me(t),null);case 22:case 23:return Ct(t),Cs(),a=t.memoizedState!==null,e!==null?e.memoizedState!==null!==a&&(t.flags|=8192):a&&(t.flags|=8192),a?(n&536870912)!==0&&(t.flags&128)===0&&(me(t),t.subtreeFlags&6&&(t.flags|=8192)):me(t),n=t.updateQueue,n!==null&&oi(t,n.retryQueue),n=null,e!==null&&e.memoizedState!==null&&e.memoizedState.cachePool!==null&&(n=e.memoizedState.cachePool.pool),a=null,t.memoizedState!==null&&t.memoizedState.cachePool!==null&&(a=t.memoizedState.cachePool.pool),a!==n&&(t.flags|=2048),e!==null&&A(Hn),null;case 24:return n=null,e!==null&&(n=e.memoizedState.cache),t.memoizedState.cache!==n&&(t.flags|=2048),zt(Se),me(t),null;case 25:return null;case 30:return null}throw Error(g(156,t.tag))}function Xp(e,t){switch(Ss(t),t.tag){case 1:return e=t.flags,e&65536?(t.flags=e&-65537|128,t):null;case 3:return zt(Se),Gt(),e=t.flags,(e&65536)!==0&&(e&128)===0?(t.flags=e&-65537|128,t):null;case 26:case 27:case 5:return Sl(t),null;case 13:if(Ct(t),e=t.memoizedState,e!==null&&e.dehydrated!==null){if(t.alternate===null)throw Error(g(340));_a()}return e=t.flags,e&65536?(t.flags=e&-65537|128,t):null;case 19:return A(Te),null;case 4:return Gt(),null;case 10:return zt(t.type),null;case 22:case 23:return Ct(t),Cs(),e!==null&&A(Hn),e=t.flags,e&65536?(t.flags=e&-65537|128,t):null;case 24:return zt(Se),null;case 25:return null;default:return null}}function jo(e,t){switch(Ss(t),t.tag){case 3:zt(Se),Gt();break;case 26:case 27:case 5:Sl(t);break;case 4:Gt();break;case 13:Ct(t);break;case 19:A(Te);break;case 10:zt(t.type);break;case 22:case 23:Ct(t),Cs(),e!==null&&A(Hn);break;case 24:zt(Se)}}function el(e,t){try{var n=t.updateQueue,a=n!==null?n.lastEffect:null;if(a!==null){var l=a.next;n=l;do{if((n.tag&e)===e){a=void 0;var i=n.create,s=n.inst;a=i(),s.destroy=a}n=n.next}while(n!==l)}}catch(u){ce(t,t.return,u)}}function It(e,t,n){try{var a=t.updateQueue,l=a!==null?a.lastEffect:null;if(l!==null){var i=l.next;a=i;do{if((a.tag&e)===e){var s=a.inst,u=s.destroy;if(u!==void 0){s.destroy=void 0,l=t;var r=n,m=u;try{m()}catch(E){ce(l,r,E)}}}a=a.next}while(a!==i)}}catch(E){ce(t,t.return,E)}}function _o(e){var t=e.updateQueue;if(t!==null){var n=e.stateNode;try{Rc(t,n)}catch(a){ce(e,e.return,a)}}}function Xo(e,t,n){n.props=Ln(e.type,e.memoizedProps),n.state=e.memoizedState;try{n.componentWillUnmount()}catch(a){ce(e,t,a)}}function tl(e,t){try{var n=e.ref;if(n!==null){switch(e.tag){case 26:case 27:case 5:var a=e.stateNode;break;case 30:a=e.stateNode;break;default:a=e.stateNode}typeof n=="function"?e.refCleanup=n(a):n.current=a}}catch(l){ce(e,t,l)}}function Tt(e,t){var n=e.ref,a=e.refCleanup;if(n!==null)if(typeof a=="function")try{a()}catch(l){ce(e,t,l)}finally{e.refCleanup=null,e=e.alternate,e!=null&&(e.refCleanup=null)}else if(typeof n=="function")try{n(null)}catch(l){ce(e,t,l)}else n.current=null}function Yo(e){var t=e.type,n=e.memoizedProps,a=e.stateNode;try{e:switch(t){case"button":case"input":case"select":case"textarea":n.autoFocus&&a.focus();break e;case"img":n.src?a.src=n.src:n.srcSet&&(a.srcset=n.srcSet)}}catch(l){ce(e,e.return,l)}}function cu(e,t,n){try{var a=e.stateNode;im(a,e.type,n,t),a[Be]=t}catch(l){ce(e,e.return,l)}}function Bo(e){return e.tag===5||e.tag===3||e.tag===26||e.tag===27&&rn(e.type)||e.tag===4}function ou(e){e:for(;;){for(;e.sibling===null;){if(e.return===null||Bo(e.return))return null;e=e.return}for(e.sibling.return=e.return,e=e.sibling;e.tag!==5&&e.tag!==6&&e.tag!==18;){if(e.tag===27&&rn(e.type)||e.flags&2||e.child===null||e.tag===4)continue e;e.child.return=e,e=e.child}if(!(e.flags&2))return e.stateNode}}function fu(e,t,n){var a=e.tag;if(a===5||a===6)e=e.stateNode,t?(n.nodeType===9?n.body:n.nodeName==="HTML"?n.ownerDocument.body:n).insertBefore(e,t):(t=n.nodeType===9?n.body:n.nodeName==="HTML"?n.ownerDocument.body:n,t.appendChild(e),n=n._reactRootContainer,n!=null||t.onclick!==null||(t.onclick=Ti));else if(a!==4&&(a===27&&rn(e.type)&&(n=e.stateNode,t=null),e=e.child,e!==null))for(fu(e,t,n),e=e.sibling;e!==null;)fu(e,t,n),e=e.sibling}function fi(e,t,n){var a=e.tag;if(a===5||a===6)e=e.stateNode,t?n.insertBefore(e,t):n.appendChild(e);else if(a!==4&&(a===27&&rn(e.type)&&(n=e.stateNode),e=e.child,e!==null))for(fi(e,t,n),e=e.sibling;e!==null;)fi(e,t,n),e=e.sibling}function Po(e){var t=e.stateNode,n=e.memoizedProps;try{for(var a=e.type,l=t.attributes;l.length;)t.removeAttributeNode(l[0]);Le(t,a,n),t[Ce]=e,t[Be]=n}catch(i){ce(e,e.return,i)}}var Xt=!1,Ee=!1,du=!1,Go=typeof WeakSet=="function"?WeakSet:Set,Me=null;function Yp(e,t){if(e=e.containerInfo,ju=Hi,e=$r(e),os(e)){if("selectionStart"in e)var n={start:e.selectionStart,end:e.selectionEnd};else e:{n=(n=e.ownerDocument)&&n.defaultView||window;var a=n.getSelection&&n.getSelection();if(a&&a.rangeCount!==0){n=a.anchorNode;var l=a.anchorOffset,i=a.focusNode;a=a.focusOffset;try{n.nodeType,i.nodeType}catch{n=null;break e}var s=0,u=-1,r=-1,m=0,E=0,S=e,v=null;t:for(;;){for(var h;S!==n||l!==0&&S.nodeType!==3||(u=s+l),S!==i||a!==0&&S.nodeType!==3||(r=s+a),S.nodeType===3&&(s+=S.nodeValue.length),(h=S.firstChild)!==null;)v=S,S=h;for(;;){if(S===e)break t;if(v===n&&++m===l&&(u=s),v===i&&++E===a&&(r=s),(h=S.nextSibling)!==null)break;S=v,v=S.parentNode}S=h}n=u===-1||r===-1?null:{start:u,end:r}}else n=null}n=n||{start:0,end:0}}else n=null;for(_u={focusedElem:e,selectionRange:n},Hi=!1,Me=t;Me!==null;)if(t=Me,e=t.child,(t.subtreeFlags&1024)!==0&&e!==null)e.return=t,Me=e;else for(;Me!==null;){switch(t=Me,i=t.alternate,e=t.flags,t.tag){case 0:break;case 11:case 15:break;case 1:if((e&1024)!==0&&i!==null){e=void 0,n=t,l=i.memoizedProps,i=i.memoizedState,a=n.stateNode;try{var j=Ln(n.type,l,n.elementType===n.type);e=a.getSnapshotBeforeUpdate(j,i),a.__reactInternalSnapshotBeforeUpdate=e}catch(z){ce(n,n.return,z)}}break;case 3:if((e&1024)!==0){if(e=t.stateNode.containerInfo,n=e.nodeType,n===9)Bu(e);else if(n===1)switch(e.nodeName){case"HEAD":case"HTML":case"BODY":Bu(e);break;default:e.textContent=""}}break;case 5:case 26:case 27:case 6:case 4:case 17:break;default:if((e&1024)!==0)throw Error(g(163))}if(e=t.sibling,e!==null){e.return=t.return,Me=e;break}Me=t.return}}function Vo(e,t,n){var a=n.flags;switch(n.tag){case 0:case 11:case 15:en(e,n),a&4&&el(5,n);break;case 1:if(en(e,n),a&4)if(e=n.stateNode,t===null)try{e.componentDidMount()}catch(s){ce(n,n.return,s)}else{var l=Ln(n.type,t.memoizedProps);t=t.memoizedState;try{e.componentDidUpdate(l,t,e.__reactInternalSnapshotBeforeUpdate)}catch(s){ce(n,n.return,s)}}a&64&&_o(n),a&512&&tl(n,n.return);break;case 3:if(en(e,n),a&64&&(e=n.updateQueue,e!==null)){if(t=null,n.child!==null)switch(n.child.tag){case 27:case 5:t=n.child.stateNode;break;case 1:t=n.child.stateNode}try{Rc(e,t)}catch(s){ce(n,n.return,s)}}break;case 27:t===null&&a&4&&Po(n);case 26:case 5:en(e,n),t===null&&a&4&&Yo(n),a&512&&tl(n,n.return);break;case 12:en(e,n);break;case 13:en(e,n),a&4&&Ko(e,n),a&64&&(e=n.memoizedState,e!==null&&(e=e.dehydrated,e!==null&&(n=wp.bind(null,n),dm(e,n))));break;case 22:if(a=n.memoizedState!==null||Xt,!a){t=t!==null&&t.memoizedState!==null||Ee,l=Xt;var i=Ee;Xt=a,(Ee=t)&&!i?tn(e,n,(n.subtreeFlags&8772)!==0):en(e,n),Xt=l,Ee=i}break;case 30:break;default:en(e,n)}}function Zo(e){var t=e.alternate;t!==null&&(e.alternate=null,Zo(t)),e.child=null,e.deletions=null,e.sibling=null,e.tag===5&&(t=e.stateNode,t!==null&&Qi(t)),e.stateNode=null,e.return=null,e.dependencies=null,e.memoizedProps=null,e.memoizedState=null,e.pendingProps=null,e.stateNode=null,e.updateQueue=null}var de=null,Ve=!1;function Yt(e,t,n){for(n=n.child;n!==null;)Qo(e,t,n),n=n.sibling}function Qo(e,t,n){if(Fe&&typeof Fe.onCommitFiberUnmount=="function")try{Fe.onCommitFiberUnmount(Ta,n)}catch{}switch(n.tag){case 26:Ee||Tt(n,t),Yt(e,t,n),n.memoizedState?n.memoizedState.count--:n.stateNode&&(n=n.stateNode,n.parentNode.removeChild(n));break;case 27:Ee||Tt(n,t);var a=de,l=Ve;rn(n.type)&&(de=n.stateNode,Ve=!1),Yt(e,t,n),ol(n.stateNode),de=a,Ve=l;break;case 5:Ee||Tt(n,t);case 6:if(a=de,l=Ve,de=null,Yt(e,t,n),de=a,Ve=l,de!==null)if(Ve)try{(de.nodeType===9?de.body:de.nodeName==="HTML"?de.ownerDocument.body:de).removeChild(n.stateNode)}catch(i){ce(n,t,i)}else try{de.removeChild(n.stateNode)}catch(i){ce(n,t,i)}break;case 18:de!==null&&(Ve?(e=de,Df(e.nodeType===9?e.body:e.nodeName==="HTML"?e.ownerDocument.body:e,n.stateNode),El(e)):Df(de,n.stateNode));break;case 4:a=de,l=Ve,de=n.stateNode.containerInfo,Ve=!0,Yt(e,t,n),de=a,Ve=l;break;case 0:case 11:case 14:case 15:Ee||It(2,n,t),Ee||It(4,n,t),Yt(e,t,n);break;case 1:Ee||(Tt(n,t),a=n.stateNode,typeof a.componentWillUnmount=="function"&&Xo(n,t,a)),Yt(e,t,n);break;case 21:Yt(e,t,n);break;case 22:Ee=(a=Ee)||n.memoizedState!==null,Yt(e,t,n),Ee=a;break;default:Yt(e,t,n)}}function Ko(e,t){if(t.memoizedState===null&&(e=t.alternate,e!==null&&(e=e.memoizedState,e!==null&&(e=e.dehydrated,e!==null))))try{El(e)}catch(n){ce(t,t.return,n)}}function Bp(e){switch(e.tag){case 13:case 19:var t=e.stateNode;return t===null&&(t=e.stateNode=new Go),t;case 22:return e=e.stateNode,t=e._retryCache,t===null&&(t=e._retryCache=new Go),t;default:throw Error(g(435,e.tag))}}function pu(e,t){var n=Bp(e);t.forEach(function(a){var l=Fp.bind(null,e,a);n.has(a)||(n.add(a),a.then(l,l))})}function Ie(e,t){var n=t.deletions;if(n!==null)for(var a=0;a<n.length;a++){var l=n[a],i=e,s=t,u=s;e:for(;u!==null;){switch(u.tag){case 27:if(rn(u.type)){de=u.stateNode,Ve=!1;break e}break;case 5:de=u.stateNode,Ve=!1;break e;case 3:case 4:de=u.stateNode.containerInfo,Ve=!0;break e}u=u.return}if(de===null)throw Error(g(160));Qo(i,s,l),de=null,Ve=!1,i=l.alternate,i!==null&&(i.return=null),l.return=null}if(t.subtreeFlags&13878)for(t=t.child;t!==null;)Jo(t,e),t=t.sibling}var ht=null;function Jo(e,t){var n=e.alternate,a=e.flags;switch(e.tag){case 0:case 11:case 14:case 15:Ie(t,e),et(e),a&4&&(It(3,e,e.return),el(3,e),It(5,e,e.return));break;case 1:Ie(t,e),et(e),a&512&&(Ee||n===null||Tt(n,n.return)),a&64&&Xt&&(e=e.updateQueue,e!==null&&(a=e.callbacks,a!==null&&(n=e.shared.hiddenCallbacks,e.shared.hiddenCallbacks=n===null?a:n.concat(a))));break;case 26:var l=ht;if(Ie(t,e),et(e),a&512&&(Ee||n===null||Tt(n,n.return)),a&4){var i=n!==null?n.memoizedState:null;if(a=e.memoizedState,n===null)if(a===null)if(e.stateNode===null){e:{a=e.type,n=e.memoizedProps,l=l.ownerDocument||l;t:switch(a){case"title":i=l.getElementsByTagName("title")[0],(!i||i[Ma]||i[Ce]||i.namespaceURI==="http://www.w3.org/2000/svg"||i.hasAttribute("itemprop"))&&(i=l.createElement(a),l.head.insertBefore(i,l.querySelector("head > title"))),Le(i,a,n),i[Ce]=e,Re(i),a=i;break e;case"link":var s=Gf("link","href",l).get(a+(n.href||""));if(s){for(var u=0;u<s.length;u++)if(i=s[u],i.getAttribute("href")===(n.href==null||n.href===""?null:n.href)&&i.getAttribute("rel")===(n.rel==null?null:n.rel)&&i.getAttribute("title")===(n.title==null?null:n.title)&&i.getAttribute("crossorigin")===(n.crossOrigin==null?null:n.crossOrigin)){s.splice(u,1);break t}}i=l.createElement(a),Le(i,a,n),l.head.appendChild(i);break;case"meta":if(s=Gf("meta","content",l).get(a+(n.content||""))){for(u=0;u<s.length;u++)if(i=s[u],i.getAttribute("content")===(n.content==null?null:""+n.content)&&i.getAttribute("name")===(n.name==null?null:n.name)&&i.getAttribute("property")===(n.property==null?null:n.property)&&i.getAttribute("http-equiv")===(n.httpEquiv==null?null:n.httpEquiv)&&i.getAttribute("charset")===(n.charSet==null?null:n.charSet)){s.splice(u,1);break t}}i=l.createElement(a),Le(i,a,n),l.head.appendChild(i);break;default:throw Error(g(468,a))}i[Ce]=e,Re(i),a=i}e.stateNode=a}else Vf(l,e.type,e.stateNode);else e.stateNode=Pf(l,a,e.memoizedProps);else i!==a?(i===null?n.stateNode!==null&&(n=n.stateNode,n.parentNode.removeChild(n)):i.count--,a===null?Vf(l,e.type,e.stateNode):Pf(l,a,e.memoizedProps)):a===null&&e.stateNode!==null&&cu(e,e.memoizedProps,n.memoizedProps)}break;case 27:Ie(t,e),et(e),a&512&&(Ee||n===null||Tt(n,n.return)),n!==null&&a&4&&cu(e,e.memoizedProps,n.memoizedProps);break;case 5:if(Ie(t,e),et(e),a&512&&(Ee||n===null||Tt(n,n.return)),e.flags&32){l=e.stateNode;try{Zn(l,"")}catch(h){ce(e,e.return,h)}}a&4&&e.stateNode!=null&&(l=e.memoizedProps,cu(e,l,n!==null?n.memoizedProps:l)),a&1024&&(du=!0);break;case 6:if(Ie(t,e),et(e),a&4){if(e.stateNode===null)throw Error(g(162));a=e.memoizedProps,n=e.stateNode;try{n.nodeValue=a}catch(h){ce(e,e.return,h)}}break;case 3:if(xi=null,l=ht,ht=Oi(t.containerInfo),Ie(t,e),ht=l,et(e),a&4&&n!==null&&n.memoizedState.isDehydrated)try{El(t.containerInfo)}catch(h){ce(e,e.return,h)}du&&(du=!1,wo(e));break;case 4:a=ht,ht=Oi(e.stateNode.containerInfo),Ie(t,e),et(e),ht=a;break;case 12:Ie(t,e),et(e);break;case 13:Ie(t,e),et(e),e.child.flags&8192&&e.memoizedState!==null!=(n!==null&&n.memoizedState!==null)&&(bu=bt()),a&4&&(a=e.updateQueue,a!==null&&(e.updateQueue=null,pu(e,a)));break;case 22:l=e.memoizedState!==null;var r=n!==null&&n.memoizedState!==null,m=Xt,E=Ee;if(Xt=m||l,Ee=E||r,Ie(t,e),Ee=E,Xt=m,et(e),a&8192)e:for(t=e.stateNode,t._visibility=l?t._visibility&-2:t._visibility|1,l&&(n===null||r||Xt||Ee||Nn(e)),n=null,t=e;;){if(t.tag===5||t.tag===26){if(n===null){r=n=t;try{if(i=r.stateNode,l)s=i.style,typeof s.setProperty=="function"?s.setProperty("display","none","important"):s.display="none";else{u=r.stateNode;var S=r.memoizedProps.style,v=S!=null&&S.hasOwnProperty("display")?S.display:null;u.style.display=v==null||typeof v=="boolean"?"":(""+v).trim()}}catch(h){ce(r,r.return,h)}}}else if(t.tag===6){if(n===null){r=t;try{r.stateNode.nodeValue=l?"":r.memoizedProps}catch(h){ce(r,r.return,h)}}}else if((t.tag!==22&&t.tag!==23||t.memoizedState===null||t===e)&&t.child!==null){t.child.return=t,t=t.child;continue}if(t===e)break e;for(;t.sibling===null;){if(t.return===null||t.return===e)break e;n===t&&(n=null),t=t.return}n===t&&(n=null),t.sibling.return=t.return,t=t.sibling}a&4&&(a=e.updateQueue,a!==null&&(n=a.retryQueue,n!==null&&(a.retryQueue=null,pu(e,n))));break;case 19:Ie(t,e),et(e),a&4&&(a=e.updateQueue,a!==null&&(e.updateQueue=null,pu(e,a)));break;case 30:break;case 21:break;default:Ie(t,e),et(e)}}function et(e){var t=e.flags;if(t&2){try{for(var n,a=e.return;a!==null;){if(Bo(a)){n=a;break}a=a.return}if(n==null)throw Error(g(160));switch(n.tag){case 27:var l=n.stateNode,i=ou(e);fi(e,i,l);break;case 5:var s=n.stateNode;n.flags&32&&(Zn(s,""),n.flags&=-33);var u=ou(e);fi(e,u,s);break;case 3:case 4:var r=n.stateNode.containerInfo,m=ou(e);fu(e,m,r);break;default:throw Error(g(161))}}catch(E){ce(e,e.return,E)}e.flags&=-3}t&4096&&(e.flags&=-4097)}function wo(e){if(e.subtreeFlags&1024)for(e=e.child;e!==null;){var t=e;wo(t),t.tag===5&&t.flags&1024&&t.stateNode.reset(),e=e.sibling}}function en(e,t){if(t.subtreeFlags&8772)for(t=t.child;t!==null;)Vo(e,t.alternate,t),t=t.sibling}function Nn(e){for(e=e.child;e!==null;){var t=e;switch(t.tag){case 0:case 11:case 14:case 15:It(4,t,t.return),Nn(t);break;case 1:Tt(t,t.return);var n=t.stateNode;typeof n.componentWillUnmount=="function"&&Xo(t,t.return,n),Nn(t);break;case 27:ol(t.stateNode);case 26:case 5:Tt(t,t.return),Nn(t);break;case 22:t.memoizedState===null&&Nn(t);break;case 30:Nn(t);break;default:Nn(t)}e=e.sibling}}function tn(e,t,n){for(n=n&&(t.subtreeFlags&8772)!==0,t=t.child;t!==null;){var a=t.alternate,l=e,i=t,s=i.flags;switch(i.tag){case 0:case 11:case 15:tn(l,i,n),el(4,i);break;case 1:if(tn(l,i,n),a=i,l=a.stateNode,typeof l.componentDidMount=="function")try{l.componentDidMount()}catch(m){ce(a,a.return,m)}if(a=i,l=a.updateQueue,l!==null){var u=a.stateNode;try{var r=l.shared.hiddenCallbacks;if(r!==null)for(l.shared.hiddenCallbacks=null,l=0;l<r.length;l++)Tc(r[l],u)}catch(m){ce(a,a.return,m)}}n&&s&64&&_o(i),tl(i,i.return);break;case 27:Po(i);case 26:case 5:tn(l,i,n),n&&a===null&&s&4&&Yo(i),tl(i,i.return);break;case 12:tn(l,i,n);break;case 13:tn(l,i,n),n&&s&4&&Ko(l,i);break;case 22:i.memoizedState===null&&tn(l,i,n),tl(i,i.return);break;case 30:break;default:tn(l,i,n)}t=t.sibling}}function mu(e,t){var n=null;e!==null&&e.memoizedState!==null&&e.memoizedState.cachePool!==null&&(n=e.memoizedState.cachePool.pool),e=null,t.memoizedState!==null&&t.memoizedState.cachePool!==null&&(e=t.memoizedState.cachePool.pool),e!==n&&(e!=null&&e.refCount++,n!=null&&Ba(n))}function vu(e,t){e=null,t.alternate!==null&&(e=t.alternate.memoizedState.cache),t=t.memoizedState.cache,t!==e&&(t.refCount++,e!=null&&Ba(e))}function Rt(e,t,n,a){if(t.subtreeFlags&10256)for(t=t.child;t!==null;)Fo(e,t,n,a),t=t.sibling}function Fo(e,t,n,a){var l=t.flags;switch(t.tag){case 0:case 11:case 15:Rt(e,t,n,a),l&2048&&el(9,t);break;case 1:Rt(e,t,n,a);break;case 3:Rt(e,t,n,a),l&2048&&(e=null,t.alternate!==null&&(e=t.alternate.memoizedState.cache),t=t.memoizedState.cache,t!==e&&(t.refCount++,e!=null&&Ba(e)));break;case 12:if(l&2048){Rt(e,t,n,a),e=t.stateNode;try{var i=t.memoizedProps,s=i.id,u=i.onPostCommit;typeof u=="function"&&u(s,t.alternate===null?"mount":"update",e.passiveEffectDuration,-0)}catch(r){ce(t,t.return,r)}}else Rt(e,t,n,a);break;case 13:Rt(e,t,n,a);break;case 23:break;case 22:i=t.stateNode,s=t.alternate,t.memoizedState!==null?i._visibility&2?Rt(e,t,n,a):nl(e,t):i._visibility&2?Rt(e,t,n,a):(i._visibility|=2,ca(e,t,n,a,(t.subtreeFlags&10256)!==0)),l&2048&&mu(s,t);break;case 24:Rt(e,t,n,a),l&2048&&vu(t.alternate,t);break;default:Rt(e,t,n,a)}}function ca(e,t,n,a,l){for(l=l&&(t.subtreeFlags&10256)!==0,t=t.child;t!==null;){var i=e,s=t,u=n,r=a,m=s.flags;switch(s.tag){case 0:case 11:case 15:ca(i,s,u,r,l),el(8,s);break;case 23:break;case 22:var E=s.stateNode;s.memoizedState!==null?E._visibility&2?ca(i,s,u,r,l):nl(i,s):(E._visibility|=2,ca(i,s,u,r,l)),l&&m&2048&&mu(s.alternate,s);break;case 24:ca(i,s,u,r,l),l&&m&2048&&vu(s.alternate,s);break;default:ca(i,s,u,r,l)}t=t.sibling}}function nl(e,t){if(t.subtreeFlags&10256)for(t=t.child;t!==null;){var n=e,a=t,l=a.flags;switch(a.tag){case 22:nl(n,a),l&2048&&mu(a.alternate,a);break;case 24:nl(n,a),l&2048&&vu(a.alternate,a);break;default:nl(n,a)}t=t.sibling}}var al=8192;function oa(e){if(e.subtreeFlags&al)for(e=e.child;e!==null;)ko(e),e=e.sibling}function ko(e){switch(e.tag){case 26:oa(e),e.flags&al&&e.memoizedState!==null&&Mm(ht,e.memoizedState,e.memoizedProps);break;case 5:oa(e);break;case 3:case 4:var t=ht;ht=Oi(e.stateNode.containerInfo),oa(e),ht=t;break;case 22:e.memoizedState===null&&(t=e.alternate,t!==null&&t.memoizedState!==null?(t=al,al=16777216,oa(e),al=t):oa(e));break;default:oa(e)}}function Wo(e){var t=e.alternate;if(t!==null&&(e=t.child,e!==null)){t.child=null;do t=e.sibling,e.sibling=null,e=t;while(e!==null)}}function ll(e){var t=e.deletions;if((e.flags&16)!==0){if(t!==null)for(var n=0;n<t.length;n++){var a=t[n];Me=a,Io(a,e)}Wo(e)}if(e.subtreeFlags&10256)for(e=e.child;e!==null;)$o(e),e=e.sibling}function $o(e){switch(e.tag){case 0:case 11:case 15:ll(e),e.flags&2048&&It(9,e,e.return);break;case 3:ll(e);break;case 12:ll(e);break;case 22:var t=e.stateNode;e.memoizedState!==null&&t._visibility&2&&(e.return===null||e.return.tag!==13)?(t._visibility&=-3,di(e)):ll(e);break;default:ll(e)}}function di(e){var t=e.deletions;if((e.flags&16)!==0){if(t!==null)for(var n=0;n<t.length;n++){var a=t[n];Me=a,Io(a,e)}Wo(e)}for(e=e.child;e!==null;){switch(t=e,t.tag){case 0:case 11:case 15:It(8,t,t.return),di(t);break;case 22:n=t.stateNode,n._visibility&2&&(n._visibility&=-3,di(t));break;default:di(t)}e=e.sibling}}function Io(e,t){for(;Me!==null;){var n=Me;switch(n.tag){case 0:case 11:case 15:It(8,n,t);break;case 23:case 22:if(n.memoizedState!==null&&n.memoizedState.cachePool!==null){var a=n.memoizedState.cachePool.pool;a!=null&&a.refCount++}break;case 24:Ba(n.memoizedState.cache)}if(a=n.child,a!==null)a.return=n,Me=a;else e:for(n=e;Me!==null;){a=Me;var l=a.sibling,i=a.return;if(Zo(a),a===n){Me=null;break e}if(l!==null){l.return=i,Me=l;break e}Me=i}}}var Pp={getCacheForType:function(e){var t=je(Se),n=t.data.get(e);return n===void 0&&(n=e(),t.data.set(e,n)),n}},Gp=typeof WeakMap=="function"?WeakMap:Map,ae=0,oe=null,Q=null,J=0,le=0,tt=null,nn=!1,fa=!1,hu=!1,Bt=0,he=0,an=0,zn=0,gu=0,ft=0,da=0,il=null,Ze=null,Eu=!1,bu=0,pi=1/0,mi=null,ln=null,qe=0,sn=null,pa=null,ma=0,yu=0,Su=null,ef=null,sl=0,Tu=null;function nt(){if((ae&2)!==0&&J!==0)return J&-J;if(b.T!==null){var e=ta;return e!==0?e:Hu()}return vr()}function tf(){ft===0&&(ft=(J&536870912)===0||$?fr():536870912);var e=ot.current;return e!==null&&(e.flags|=32),ft}function at(e,t,n){(e===oe&&(le===2||le===9)||e.cancelPendingCommit!==null)&&(va(e,0),un(e,J,ft,!1)),Oa(e,n),((ae&2)===0||e!==oe)&&(e===oe&&((ae&2)===0&&(zn|=n),he===4&&un(e,J,ft,!1)),Ot(e))}function nf(e,t,n){if((ae&6)!==0)throw Error(g(327));var a=!n&&(t&124)===0&&(t&e.expiredLanes)===0||Ra(e,t),l=a?Qp(e,t):Mu(e,t,!0),i=a;do{if(l===0){fa&&!a&&un(e,t,0,!1);break}else{if(n=e.current.alternate,i&&!Vp(n)){l=Mu(e,t,!1),i=!1;continue}if(l===2){if(i=t,e.errorRecoveryDisabledLanes&i)var s=0;else s=e.pendingLanes&-536870913,s=s!==0?s:s&536870912?536870912:0;if(s!==0){t=s;e:{var u=e;l=il;var r=u.current.memoizedState.isDehydrated;if(r&&(va(u,s).flags|=256),s=Mu(u,s,!1),s!==2){if(hu&&!r){u.errorRecoveryDisabledLanes|=i,zn|=i,l=4;break e}i=Ze,Ze=l,i!==null&&(Ze===null?Ze=i:Ze.push.apply(Ze,i))}l=s}if(i=!1,l!==2)continue}}if(l===1){va(e,0),un(e,t,0,!0);break}e:{switch(a=e,i=l,i){case 0:case 1:throw Error(g(345));case 4:if((t&4194048)!==t)break;case 6:un(a,t,ft,!nn);break e;case 2:Ze=null;break;case 3:case 5:break;default:throw Error(g(329))}if((t&62914560)===t&&(l=bu+300-bt(),10<l)){if(un(a,t,ft,!nn),Ml(a,0,!0)!==0)break e;a.timeoutHandle=Nf(af.bind(null,a,n,Ze,mi,Eu,t,ft,zn,da,nn,i,2,-0,0),l);break e}af(a,n,Ze,mi,Eu,t,ft,zn,da,nn,i,0,-0,0)}}break}while(!0);Ot(e)}function af(e,t,n,a,l,i,s,u,r,m,E,S,v,h){if(e.timeoutHandle=-1,S=t.subtreeFlags,(S&8192||(S&16785408)===16785408)&&(pl={stylesheets:null,count:0,unsuspend:Om},ko(t),S=xm(),S!==null)){e.cancelPendingCommit=S(ff.bind(null,e,t,i,n,a,l,s,u,r,E,1,v,h)),un(e,i,s,!m);return}ff(e,t,i,n,a,l,s,u,r)}function Vp(e){for(var t=e;;){var n=t.tag;if((n===0||n===11||n===15)&&t.flags&16384&&(n=t.updateQueue,n!==null&&(n=n.stores,n!==null)))for(var a=0;a<n.length;a++){var l=n[a],i=l.getSnapshot;l=l.value;try{if(!We(i(),l))return!1}catch{return!1}}if(n=t.child,t.subtreeFlags&16384&&n!==null)n.return=t,t=n;else{if(t===e)break;for(;t.sibling===null;){if(t.return===null||t.return===e)return!0;t=t.return}t.sibling.return=t.return,t=t.sibling}}return!0}function un(e,t,n,a){t&=~gu,t&=~zn,e.suspendedLanes|=t,e.pingedLanes&=~t,a&&(e.warmLanes|=t),a=e.expirationTimes;for(var l=t;0<l;){var i=31-ke(l),s=1<<i;a[i]=-1,l&=~s}n!==0&&pr(e,n,t)}function vi(){return(ae&6)===0?(ul(0),!1):!0}function Ru(){if(Q!==null){if(le===0)var e=Q.return;else e=Q,Nt=An=null,Bs(e),ua=null,Wa=0,e=Q;for(;e!==null;)jo(e.alternate,e),e=e.return;Q=null}}function va(e,t){var n=e.timeoutHandle;n!==-1&&(e.timeoutHandle=-1,um(n)),n=e.cancelPendingCommit,n!==null&&(e.cancelPendingCommit=null,n()),Ru(),oe=e,Q=n=Ht(e.current,null),J=t,le=0,tt=null,nn=!1,fa=Ra(e,t),hu=!1,da=ft=gu=zn=an=he=0,Ze=il=null,Eu=!1,(t&8)!==0&&(t|=t&32);var a=e.entangledLanes;if(a!==0)for(e=e.entanglements,a&=t;0<a;){var l=31-ke(a),i=1<<l;t|=e[l],a&=~i}return Bt=t,_l(),n}function lf(e,t){V=null,b.H=ni,t===Ga||t===Kl?(t=yc(),le=3):t===gc?(t=yc(),le=4):le=t===To?8:t!==null&&typeof t=="object"&&typeof t.then=="function"?6:1,tt=t,Q===null&&(he=1,ui(e,st(t,e.current)))}function sf(){var e=b.H;return b.H=ni,e===null?ni:e}function uf(){var e=b.A;return b.A=Pp,e}function Ou(){he=4,nn||(J&4194048)!==J&&ot.current!==null||(fa=!0),(an&134217727)===0&&(zn&134217727)===0||oe===null||un(oe,J,ft,!1)}function Mu(e,t,n){var a=ae;ae|=2;var l=sf(),i=uf();(oe!==e||J!==t)&&(mi=null,va(e,t)),t=!1;var s=he;e:do try{if(le!==0&&Q!==null){var u=Q,r=tt;switch(le){case 8:Ru(),s=6;break e;case 3:case 2:case 9:case 6:ot.current===null&&(t=!0);var m=le;if(le=0,tt=null,ha(e,u,r,m),n&&fa){s=0;break e}break;default:m=le,le=0,tt=null,ha(e,u,r,m)}}Zp(),s=he;break}catch(E){lf(e,E)}while(!0);return t&&e.shellSuspendCounter++,Nt=An=null,ae=a,b.H=l,b.A=i,Q===null&&(oe=null,J=0,_l()),s}function Zp(){for(;Q!==null;)rf(Q)}function Qp(e,t){var n=ae;ae|=2;var a=sf(),l=uf();oe!==e||J!==t?(mi=null,pi=bt()+500,va(e,t)):fa=Ra(e,t);e:do try{if(le!==0&&Q!==null){t=Q;var i=tt;t:switch(le){case 1:le=0,tt=null,ha(e,t,i,1);break;case 2:case 9:if(Ec(i)){le=0,tt=null,cf(t);break}t=function(){le!==2&&le!==9||oe!==e||(le=7),Ot(e)},i.then(t,t);break e;case 3:le=7;break e;case 4:le=5;break e;case 7:Ec(i)?(le=0,tt=null,cf(t)):(le=0,tt=null,ha(e,t,i,7));break;case 5:var s=null;switch(Q.tag){case 26:s=Q.memoizedState;case 5:case 27:var u=Q;if(!s||Zf(s)){le=0,tt=null;var r=u.sibling;if(r!==null)Q=r;else{var m=u.return;m!==null?(Q=m,hi(m)):Q=null}break t}}le=0,tt=null,ha(e,t,i,5);break;case 6:le=0,tt=null,ha(e,t,i,6);break;case 8:Ru(),he=6;break e;default:throw Error(g(462))}}Kp();break}catch(E){lf(e,E)}while(!0);return Nt=An=null,b.H=a,b.A=l,ae=n,Q!==null?0:(oe=null,J=0,_l(),he)}function Kp(){for(;Q!==null&&!md();)rf(Q)}function rf(e){var t=Do(e.alternate,e,Bt);e.memoizedProps=e.pendingProps,t===null?hi(e):Q=t}function cf(e){var t=e,n=t.alternate;switch(t.tag){case 15:case 0:t=Uo(n,t,t.pendingProps,t.type,void 0,J);break;case 11:t=Uo(n,t,t.pendingProps,t.type.render,t.ref,J);break;case 5:Bs(t);default:jo(n,t),t=Q=rc(t,Bt),t=Do(n,t,Bt)}e.memoizedProps=e.pendingProps,t===null?hi(e):Q=t}function ha(e,t,n,a){Nt=An=null,Bs(t),ua=null,Wa=0;var l=t.return;try{if(Cp(e,l,t,n,J)){he=1,ui(e,st(n,e.current)),Q=null;return}}catch(i){if(l!==null)throw Q=l,i;he=1,ui(e,st(n,e.current)),Q=null;return}t.flags&32768?($||a===1?e=!0:fa||(J&536870912)!==0?e=!1:(nn=e=!0,(a===2||a===9||a===3||a===6)&&(a=ot.current,a!==null&&a.tag===13&&(a.flags|=16384))),of(t,e)):hi(t)}function hi(e){var t=e;do{if((t.flags&32768)!==0){of(t,nn);return}e=t.return;var n=_p(t.alternate,t,Bt);if(n!==null){Q=n;return}if(t=t.sibling,t!==null){Q=t;return}Q=t=e}while(t!==null);he===0&&(he=5)}function of(e,t){do{var n=Xp(e.alternate,e);if(n!==null){n.flags&=32767,Q=n;return}if(n=e.return,n!==null&&(n.flags|=32768,n.subtreeFlags=0,n.deletions=null),!t&&(e=e.sibling,e!==null)){Q=e;return}Q=e=n}while(e!==null);he=6,Q=null}function ff(e,t,n,a,l,i,s,u,r){e.cancelPendingCommit=null;do gi();while(qe!==0);if((ae&6)!==0)throw Error(g(327));if(t!==null){if(t===e.current)throw Error(g(177));if(i=t.lanes|t.childLanes,i|=vs,Od(e,n,i,s,u,r),e===oe&&(Q=oe=null,J=0),pa=t,sn=e,ma=n,yu=i,Su=l,ef=a,(t.subtreeFlags&10256)!==0||(t.flags&10256)!==0?(e.callbackNode=null,e.callbackPriority=0,kp(Tl,function(){return hf(),null})):(e.callbackNode=null,e.callbackPriority=0),a=(t.flags&13878)!==0,(t.subtreeFlags&13878)!==0||a){a=b.T,b.T=null,l=x.p,x.p=2,s=ae,ae|=4;try{Yp(e,t,n)}finally{ae=s,x.p=l,b.T=a}}qe=1,df(),pf(),mf()}}function df(){if(qe===1){qe=0;var e=sn,t=pa,n=(t.flags&13878)!==0;if((t.subtreeFlags&13878)!==0||n){n=b.T,b.T=null;var a=x.p;x.p=2;var l=ae;ae|=4;try{Jo(t,e);var i=_u,s=$r(e.containerInfo),u=i.focusedElem,r=i.selectionRange;if(s!==u&&u&&u.ownerDocument&&Wr(u.ownerDocument.documentElement,u)){if(r!==null&&os(u)){var m=r.start,E=r.end;if(E===void 0&&(E=m),"selectionStart"in u)u.selectionStart=m,u.selectionEnd=Math.min(E,u.value.length);else{var S=u.ownerDocument||document,v=S&&S.defaultView||window;if(v.getSelection){var h=v.getSelection(),j=u.textContent.length,z=Math.min(r.start,j),ue=r.end===void 0?z:Math.min(r.end,j);!h.extend&&z>ue&&(s=ue,ue=z,z=s);var d=kr(u,z),o=kr(u,ue);if(d&&o&&(h.rangeCount!==1||h.anchorNode!==d.node||h.anchorOffset!==d.offset||h.focusNode!==o.node||h.focusOffset!==o.offset)){var p=S.createRange();p.setStart(d.node,d.offset),h.removeAllRanges(),z>ue?(h.addRange(p),h.extend(o.node,o.offset)):(p.setEnd(o.node,o.offset),h.addRange(p))}}}}for(S=[],h=u;h=h.parentNode;)h.nodeType===1&&S.push({element:h,left:h.scrollLeft,top:h.scrollTop});for(typeof u.focus=="function"&&u.focus(),u=0;u<S.length;u++){var y=S[u];y.element.scrollLeft=y.left,y.element.scrollTop=y.top}}Hi=!!ju,_u=ju=null}finally{ae=l,x.p=a,b.T=n}}e.current=t,qe=2}}function pf(){if(qe===2){qe=0;var e=sn,t=pa,n=(t.flags&8772)!==0;if((t.subtreeFlags&8772)!==0||n){n=b.T,b.T=null;var a=x.p;x.p=2;var l=ae;ae|=4;try{Vo(e,t.alternate,t)}finally{ae=l,x.p=a,b.T=n}}qe=3}}function mf(){if(qe===4||qe===3){qe=0,vd();var e=sn,t=pa,n=ma,a=ef;(t.subtreeFlags&10256)!==0||(t.flags&10256)!==0?qe=5:(qe=0,pa=sn=null,vf(e,e.pendingLanes));var l=e.pendingLanes;if(l===0&&(ln=null),Vi(n),t=t.stateNode,Fe&&typeof Fe.onCommitFiberRoot=="function")try{Fe.onCommitFiberRoot(Ta,t,void 0,(t.current.flags&128)===128)}catch{}if(a!==null){t=b.T,l=x.p,x.p=2,b.T=null;try{for(var i=e.onRecoverableError,s=0;s<a.length;s++){var u=a[s];i(u.value,{componentStack:u.stack})}}finally{b.T=t,x.p=l}}(ma&3)!==0&&gi(),Ot(e),l=e.pendingLanes,(n&4194090)!==0&&(l&42)!==0?e===Tu?sl++:(sl=0,Tu=e):sl=0,ul(0)}}function vf(e,t){(e.pooledCacheLanes&=t)===0&&(t=e.pooledCache,t!=null&&(e.pooledCache=null,Ba(t)))}function gi(e){return df(),pf(),mf(),hf()}function hf(){if(qe!==5)return!1;var e=sn,t=yu;yu=0;var n=Vi(ma),a=b.T,l=x.p;try{x.p=32>n?32:n,b.T=null,n=Su,Su=null;var i=sn,s=ma;if(qe=0,pa=sn=null,ma=0,(ae&6)!==0)throw Error(g(331));var u=ae;if(ae|=4,$o(i.current),Fo(i,i.current,s,n),ae=u,ul(0,!1),Fe&&typeof Fe.onPostCommitFiberRoot=="function")try{Fe.onPostCommitFiberRoot(Ta,i)}catch{}return!0}finally{x.p=l,b.T=a,vf(e,t)}}function gf(e,t,n){t=st(n,t),t=eu(e.stateNode,t,2),e=Ft(e,t,2),e!==null&&(Oa(e,2),Ot(e))}function ce(e,t,n){if(e.tag===3)gf(e,e,n);else for(;t!==null;){if(t.tag===3){gf(t,e,n);break}else if(t.tag===1){var a=t.stateNode;if(typeof t.type.getDerivedStateFromError=="function"||typeof a.componentDidCatch=="function"&&(ln===null||!ln.has(a))){e=st(n,e),n=yo(2),a=Ft(t,n,2),a!==null&&(So(n,a,t,e),Oa(a,2),Ot(a));break}}t=t.return}}function xu(e,t,n){var a=e.pingCache;if(a===null){a=e.pingCache=new Gp;var l=new Set;a.set(t,l)}else l=a.get(t),l===void 0&&(l=new Set,a.set(t,l));l.has(n)||(hu=!0,l.add(n),e=Jp.bind(null,e,t,n),t.then(e,e))}function Jp(e,t,n){var a=e.pingCache;a!==null&&a.delete(t),e.pingedLanes|=e.suspendedLanes&n,e.warmLanes&=~n,oe===e&&(J&n)===n&&(he===4||he===3&&(J&62914560)===J&&300>bt()-bu?(ae&2)===0&&va(e,0):gu|=n,da===J&&(da=0)),Ot(e)}function Ef(e,t){t===0&&(t=dr()),e=Wn(e,t),e!==null&&(Oa(e,t),Ot(e))}function wp(e){var t=e.memoizedState,n=0;t!==null&&(n=t.retryLane),Ef(e,n)}function Fp(e,t){var n=0;switch(e.tag){case 13:var a=e.stateNode,l=e.memoizedState;l!==null&&(n=l.retryLane);break;case 19:a=e.stateNode;break;case 22:a=e.stateNode._retryCache;break;default:throw Error(g(314))}a!==null&&a.delete(t),Ef(e,n)}function kp(e,t){return Yi(e,t)}var Ei=null,ga=null,Au=!1,bi=!1,Uu=!1,Dn=0;function Ot(e){e!==ga&&e.next===null&&(ga===null?Ei=ga=e:ga=ga.next=e),bi=!0,Au||(Au=!0,$p())}function ul(e,t){if(!Uu&&bi){Uu=!0;do for(var n=!1,a=Ei;a!==null;){if(e!==0){var l=a.pendingLanes;if(l===0)var i=0;else{var s=a.suspendedLanes,u=a.pingedLanes;i=(1<<31-ke(42|e)+1)-1,i&=l&~(s&~u),i=i&201326741?i&201326741|1:i?i|2:0}i!==0&&(n=!0,Tf(a,i))}else i=J,i=Ml(a,a===oe?i:0,a.cancelPendingCommit!==null||a.timeoutHandle!==-1),(i&3)===0||Ra(a,i)||(n=!0,Tf(a,i));a=a.next}while(n);Uu=!1}}function Wp(){bf()}function bf(){bi=Au=!1;var e=0;Dn!==0&&(sm()&&(e=Dn),Dn=0);for(var t=bt(),n=null,a=Ei;a!==null;){var l=a.next,i=yf(a,t);i===0?(a.next=null,n===null?Ei=l:n.next=l,l===null&&(ga=n)):(n=a,(e!==0||(i&3)!==0)&&(bi=!0)),a=l}ul(e)}function yf(e,t){for(var n=e.suspendedLanes,a=e.pingedLanes,l=e.expirationTimes,i=e.pendingLanes&-62914561;0<i;){var s=31-ke(i),u=1<<s,r=l[s];r===-1?((u&n)===0||(u&a)!==0)&&(l[s]=Rd(u,t)):r<=t&&(e.expiredLanes|=u),i&=~u}if(t=oe,n=J,n=Ml(e,e===t?n:0,e.cancelPendingCommit!==null||e.timeoutHandle!==-1),a=e.callbackNode,n===0||e===t&&(le===2||le===9)||e.cancelPendingCommit!==null)return a!==null&&a!==null&&Bi(a),e.callbackNode=null,e.callbackPriority=0;if((n&3)===0||Ra(e,n)){if(t=n&-n,t===e.callbackPriority)return t;switch(a!==null&&Bi(a),Vi(n)){case 2:case 8:n=cr;break;case 32:n=Tl;break;case 268435456:n=or;break;default:n=Tl}return a=Sf.bind(null,e),n=Yi(n,a),e.callbackPriority=t,e.callbackNode=n,t}return a!==null&&a!==null&&Bi(a),e.callbackPriority=2,e.callbackNode=null,2}function Sf(e,t){if(qe!==0&&qe!==5)return e.callbackNode=null,e.callbackPriority=0,null;var n=e.callbackNode;if(gi()&&e.callbackNode!==n)return null;var a=J;return a=Ml(e,e===oe?a:0,e.cancelPendingCommit!==null||e.timeoutHandle!==-1),a===0?null:(nf(e,a,t),yf(e,bt()),e.callbackNode!=null&&e.callbackNode===n?Sf.bind(null,e):null)}function Tf(e,t){if(gi())return null;nf(e,t,!0)}function $p(){rm(function(){(ae&6)!==0?Yi(rr,Wp):bf()})}function Hu(){return Dn===0&&(Dn=fr()),Dn}function Rf(e){return e==null||typeof e=="symbol"||typeof e=="boolean"?null:typeof e=="function"?e:ql(""+e)}function Of(e,t){var n=t.ownerDocument.createElement("input");return n.name=t.name,n.value=t.value,e.id&&n.setAttribute("form",e.id),t.parentNode.insertBefore(n,t),e=new FormData(e),n.parentNode.removeChild(n),e}function Ip(e,t,n,a,l){if(t==="submit"&&n&&n.stateNode===l){var i=Rf((l[Be]||null).action),s=a.submitter;s&&(t=(t=s[Be]||null)?Rf(t.formAction):s.getAttribute("formAction"),t!==null&&(i=t,s=null));var u=new Dl("action","action",null,a,l);e.push({event:u,listeners:[{instance:null,listener:function(){if(a.defaultPrevented){if(Dn!==0){var r=s?Of(l,s):new FormData(l);Fs(n,{pending:!0,data:r,method:l.method,action:i},null,r)}}else typeof i=="function"&&(u.preventDefault(),r=s?Of(l,s):new FormData(l),Fs(n,{pending:!0,data:r,method:l.method,action:i},i,r))},currentTarget:l}]})}}for(var qu=0;qu<ms.length;qu++){var Lu=ms[qu],em=Lu.toLowerCase(),tm=Lu[0].toUpperCase()+Lu.slice(1);vt(em,"on"+tm)}vt(tc,"onAnimationEnd"),vt(nc,"onAnimationIteration"),vt(ac,"onAnimationStart"),vt("dblclick","onDoubleClick"),vt("focusin","onFocus"),vt("focusout","onBlur"),vt(Ep,"onTransitionRun"),vt(bp,"onTransitionStart"),vt(yp,"onTransitionCancel"),vt(lc,"onTransitionEnd"),Pn("onMouseEnter",["mouseout","mouseover"]),Pn("onMouseLeave",["mouseout","mouseover"]),Pn("onPointerEnter",["pointerout","pointerover"]),Pn("onPointerLeave",["pointerout","pointerover"]),En("onChange","change click focusin focusout input keydown keyup selectionchange".split(" ")),En("onSelect","focusout contextmenu dragend focusin keydown keyup mousedown mouseup selectionchange".split(" ")),En("onBeforeInput",["compositionend","keypress","textInput","paste"]),En("onCompositionEnd","compositionend focusout keydown keypress keyup mousedown".split(" ")),En("onCompositionStart","compositionstart focusout keydown keypress keyup mousedown".split(" ")),En("onCompositionUpdate","compositionupdate focusout keydown keypress keyup mousedown".split(" "));var rl="abort canplay canplaythrough durationchange emptied encrypted ended error loadeddata loadedmetadata loadstart pause play playing progress ratechange resize seeked seeking stalled suspend timeupdate volumechange waiting".split(" "),nm=new Set("beforetoggle cancel close invalid load scroll scrollend toggle".split(" ").concat(rl));function Mf(e,t){t=(t&4)!==0;for(var n=0;n<e.length;n++){var a=e[n],l=a.event;a=a.listeners;e:{var i=void 0;if(t)for(var s=a.length-1;0<=s;s--){var u=a[s],r=u.instance,m=u.currentTarget;if(u=u.listener,r!==i&&l.isPropagationStopped())break e;i=u,l.currentTarget=m;try{i(l)}catch(E){si(E)}l.currentTarget=null,i=r}else for(s=0;s<a.length;s++){if(u=a[s],r=u.instance,m=u.currentTarget,u=u.listener,r!==i&&l.isPropagationStopped())break e;i=u,l.currentTarget=m;try{i(l)}catch(E){si(E)}l.currentTarget=null,i=r}}}}function K(e,t){var n=t[Zi];n===void 0&&(n=t[Zi]=new Set);var a=e+"__bubble";n.has(a)||(xf(t,e,2,!1),n.add(a))}function Nu(e,t,n){var a=0;t&&(a|=4),xf(n,e,a,t)}var yi="_reactListening"+Math.random().toString(36).slice(2);function zu(e){if(!e[yi]){e[yi]=!0,gr.forEach(function(n){n!=="selectionchange"&&(nm.has(n)||Nu(n,!1,e),Nu(n,!0,e))});var t=e.nodeType===9?e:e.ownerDocument;t===null||t[yi]||(t[yi]=!0,Nu("selectionchange",!1,t))}}function xf(e,t,n,a){switch(kf(t)){case 2:var l=Hm;break;case 8:l=qm;break;default:l=Ju}n=l.bind(null,t,n,e),l=void 0,!ts||t!=="touchstart"&&t!=="touchmove"&&t!=="wheel"||(l=!0),a?l!==void 0?e.addEventListener(t,n,{capture:!0,passive:l}):e.addEventListener(t,n,!0):l!==void 0?e.addEventListener(t,n,{passive:l}):e.addEventListener(t,n,!1)}function Du(e,t,n,a,l){var i=a;if((t&1)===0&&(t&2)===0&&a!==null)e:for(;;){if(a===null)return;var s=a.tag;if(s===3||s===4){var u=a.stateNode.containerInfo;if(u===l)break;if(s===4)for(s=a.return;s!==null;){var r=s.tag;if((r===3||r===4)&&s.stateNode.containerInfo===l)return;s=s.return}for(;u!==null;){if(s=Xn(u),s===null)return;if(r=s.tag,r===5||r===6||r===26||r===27){a=i=s;continue e}u=u.parentNode}}a=a.return}Lr(function(){var m=i,E=Ii(n),S=[];e:{var v=ic.get(e);if(v!==void 0){var h=Dl,j=e;switch(e){case"keypress":if(Nl(n)===0)break e;case"keydown":case"keyup":h=kd;break;case"focusin":j="focus",h=is;break;case"focusout":j="blur",h=is;break;case"beforeblur":case"afterblur":h=is;break;case"click":if(n.button===2)break e;case"auxclick":case"dblclick":case"mousedown":case"mousemove":case"mouseup":case"mouseout":case"mouseover":case"contextmenu":h=Dr;break;case"drag":case"dragend":case"dragenter":case"dragexit":case"dragleave":case"dragover":case"dragstart":case"drop":h=Xd;break;case"touchcancel":case"touchend":case"touchmove":case"touchstart":h=Id;break;case tc:case nc:case ac:h=Pd;break;case lc:h=tp;break;case"scroll":case"scrollend":h=jd;break;case"wheel":h=ap;break;case"copy":case"cut":case"paste":h=Vd;break;case"gotpointercapture":case"lostpointercapture":case"pointercancel":case"pointerdown":case"pointermove":case"pointerout":case"pointerover":case"pointerup":h=jr;break;case"toggle":case"beforetoggle":h=ip}var z=(t&4)!==0,ue=!z&&(e==="scroll"||e==="scrollend"),d=z?v!==null?v+"Capture":null:v;z=[];for(var o=m,p;o!==null;){var y=o;if(p=y.stateNode,y=y.tag,y!==5&&y!==26&&y!==27||p===null||d===null||(y=Aa(o,d),y!=null&&z.push(cl(o,y,p))),ue)break;o=o.return}0<z.length&&(v=new h(v,j,null,n,E),S.push({event:v,listeners:z}))}}if((t&7)===0){e:{if(v=e==="mouseover"||e==="pointerover",h=e==="mouseout"||e==="pointerout",v&&n!==$i&&(j=n.relatedTarget||n.fromElement)&&(Xn(j)||j[_n]))break e;if((h||v)&&(v=E.window===E?E:(v=E.ownerDocument)?v.defaultView||v.parentWindow:window,h?(j=n.relatedTarget||n.toElement,h=m,j=j?Xn(j):null,j!==null&&(ue=G(j),z=j.tag,j!==ue||z!==5&&z!==27&&z!==6)&&(j=null)):(h=null,j=m),h!==j)){if(z=Dr,y="onMouseLeave",d="onMouseEnter",o="mouse",(e==="pointerout"||e==="pointerover")&&(z=jr,y="onPointerLeave",d="onPointerEnter",o="pointer"),ue=h==null?v:xa(h),p=j==null?v:xa(j),v=new z(y,o+"leave",h,n,E),v.target=ue,v.relatedTarget=p,y=null,Xn(E)===m&&(z=new z(d,o+"enter",j,n,E),z.target=p,z.relatedTarget=ue,y=z),ue=y,h&&j)t:{for(z=h,d=j,o=0,p=z;p;p=Ea(p))o++;for(p=0,y=d;y;y=Ea(y))p++;for(;0<o-p;)z=Ea(z),o--;for(;0<p-o;)d=Ea(d),p--;for(;o--;){if(z===d||d!==null&&z===d.alternate)break t;z=Ea(z),d=Ea(d)}z=null}else z=null;h!==null&&Af(S,v,h,z,!1),j!==null&&ue!==null&&Af(S,ue,j,z,!0)}}e:{if(v=m?xa(m):window,h=v.nodeName&&v.nodeName.toLowerCase(),h==="select"||h==="input"&&v.type==="file")var U=Zr;else if(Gr(v))if(Qr)U=vp;else{U=pp;var Z=dp}else h=v.nodeName,!h||h.toLowerCase()!=="input"||v.type!=="checkbox"&&v.type!=="radio"?m&&Wi(m.elementType)&&(U=Zr):U=mp;if(U&&(U=U(e,m))){Vr(S,U,n,E);break e}Z&&Z(e,v,m),e==="focusout"&&m&&v.type==="number"&&m.memoizedProps.value!=null&&ki(v,"number",v.value)}switch(Z=m?xa(m):window,e){case"focusin":(Gr(Z)||Z.contentEditable==="true")&&(wn=Z,fs=m,Ca=null);break;case"focusout":Ca=fs=wn=null;break;case"mousedown":ds=!0;break;case"contextmenu":case"mouseup":case"dragend":ds=!1,Ir(S,n,E);break;case"selectionchange":if(gp)break;case"keydown":case"keyup":Ir(S,n,E)}var q;if(us)e:{switch(e){case"compositionstart":var D="onCompositionStart";break e;case"compositionend":D="onCompositionEnd";break e;case"compositionupdate":D="onCompositionUpdate";break e}D=void 0}else Jn?Br(e,n)&&(D="onCompositionEnd"):e==="keydown"&&n.keyCode===229&&(D="onCompositionStart");D&&(_r&&n.locale!=="ko"&&(Jn||D!=="onCompositionStart"?D==="onCompositionEnd"&&Jn&&(q=Nr()):(Qt=E,ns="value"in Qt?Qt.value:Qt.textContent,Jn=!0)),Z=Si(m,D),0<Z.length&&(D=new Cr(D,e,null,n,E),S.push({event:D,listeners:Z}),q?D.data=q:(q=Pr(n),q!==null&&(D.data=q)))),(q=up?rp(e,n):cp(e,n))&&(D=Si(m,"onBeforeInput"),0<D.length&&(Z=new Cr("onBeforeInput","beforeinput",null,n,E),S.push({event:Z,listeners:D}),Z.data=q)),Ip(S,e,m,n,E)}Mf(S,t)})}function cl(e,t,n){return{instance:e,listener:t,currentTarget:n}}function Si(e,t){for(var n=t+"Capture",a=[];e!==null;){var l=e,i=l.stateNode;if(l=l.tag,l!==5&&l!==26&&l!==27||i===null||(l=Aa(e,n),l!=null&&a.unshift(cl(e,l,i)),l=Aa(e,t),l!=null&&a.push(cl(e,l,i))),e.tag===3)return a;e=e.return}return[]}function Ea(e){if(e===null)return null;do e=e.return;while(e&&e.tag!==5&&e.tag!==27);return e||null}function Af(e,t,n,a,l){for(var i=t._reactName,s=[];n!==null&&n!==a;){var u=n,r=u.alternate,m=u.stateNode;if(u=u.tag,r!==null&&r===a)break;u!==5&&u!==26&&u!==27||m===null||(r=m,l?(m=Aa(n,i),m!=null&&s.unshift(cl(n,m,r))):l||(m=Aa(n,i),m!=null&&s.push(cl(n,m,r)))),n=n.return}s.length!==0&&e.push({event:t,listeners:s})}var am=/\r\n?/g,lm=/\u0000|\uFFFD/g;function Uf(e){return(typeof e=="string"?e:""+e).replace(am,`
`).replace(lm,"")}function Hf(e,t){return t=Uf(t),Uf(e)===t}function Ti(){}function se(e,t,n,a,l,i){switch(n){case"children":typeof a=="string"?t==="body"||t==="textarea"&&a===""||Zn(e,a):(typeof a=="number"||typeof a=="bigint")&&t!=="body"&&Zn(e,""+a);break;case"className":Al(e,"class",a);break;case"tabIndex":Al(e,"tabindex",a);break;case"dir":case"role":case"viewBox":case"width":case"height":Al(e,n,a);break;case"style":Hr(e,a,i);break;case"data":if(t!=="object"){Al(e,"data",a);break}case"src":case"href":if(a===""&&(t!=="a"||n!=="href")){e.removeAttribute(n);break}if(a==null||typeof a=="function"||typeof a=="symbol"||typeof a=="boolean"){e.removeAttribute(n);break}a=ql(""+a),e.setAttribute(n,a);break;case"action":case"formAction":if(typeof a=="function"){e.setAttribute(n,"javascript:throw new Error('A React form was unexpectedly submitted. If you called form.submit() manually, consider using form.requestSubmit() instead. If you\\'re trying to use event.stopPropagation() in a submit event handler, consider also calling event.preventDefault().')");break}else typeof i=="function"&&(n==="formAction"?(t!=="input"&&se(e,t,"name",l.name,l,null),se(e,t,"formEncType",l.formEncType,l,null),se(e,t,"formMethod",l.formMethod,l,null),se(e,t,"formTarget",l.formTarget,l,null)):(se(e,t,"encType",l.encType,l,null),se(e,t,"method",l.method,l,null),se(e,t,"target",l.target,l,null)));if(a==null||typeof a=="symbol"||typeof a=="boolean"){e.removeAttribute(n);break}a=ql(""+a),e.setAttribute(n,a);break;case"onClick":a!=null&&(e.onclick=Ti);break;case"onScroll":a!=null&&K("scroll",e);break;case"onScrollEnd":a!=null&&K("scrollend",e);break;case"dangerouslySetInnerHTML":if(a!=null){if(typeof a!="object"||!("__html"in a))throw Error(g(61));if(n=a.__html,n!=null){if(l.children!=null)throw Error(g(60));e.innerHTML=n}}break;case"multiple":e.multiple=a&&typeof a!="function"&&typeof a!="symbol";break;case"muted":e.muted=a&&typeof a!="function"&&typeof a!="symbol";break;case"suppressContentEditableWarning":case"suppressHydrationWarning":case"defaultValue":case"defaultChecked":case"innerHTML":case"ref":break;case"autoFocus":break;case"xlinkHref":if(a==null||typeof a=="function"||typeof a=="boolean"||typeof a=="symbol"){e.removeAttribute("xlink:href");break}n=ql(""+a),e.setAttributeNS("http://www.w3.org/1999/xlink","xlink:href",n);break;case"contentEditable":case"spellCheck":case"draggable":case"value":case"autoReverse":case"externalResourcesRequired":case"focusable":case"preserveAlpha":a!=null&&typeof a!="function"&&typeof a!="symbol"?e.setAttribute(n,""+a):e.removeAttribute(n);break;case"inert":case"allowFullScreen":case"async":case"autoPlay":case"controls":case"default":case"defer":case"disabled":case"disablePictureInPicture":case"disableRemotePlayback":case"formNoValidate":case"hidden":case"loop":case"noModule":case"noValidate":case"open":case"playsInline":case"readOnly":case"required":case"reversed":case"scoped":case"seamless":case"itemScope":a&&typeof a!="function"&&typeof a!="symbol"?e.setAttribute(n,""):e.removeAttribute(n);break;case"capture":case"download":a===!0?e.setAttribute(n,""):a!==!1&&a!=null&&typeof a!="function"&&typeof a!="symbol"?e.setAttribute(n,a):e.removeAttribute(n);break;case"cols":case"rows":case"size":case"span":a!=null&&typeof a!="function"&&typeof a!="symbol"&&!isNaN(a)&&1<=a?e.setAttribute(n,a):e.removeAttribute(n);break;case"rowSpan":case"start":a==null||typeof a=="function"||typeof a=="symbol"||isNaN(a)?e.removeAttribute(n):e.setAttribute(n,a);break;case"popover":K("beforetoggle",e),K("toggle",e),xl(e,"popover",a);break;case"xlinkActuate":At(e,"http://www.w3.org/1999/xlink","xlink:actuate",a);break;case"xlinkArcrole":At(e,"http://www.w3.org/1999/xlink","xlink:arcrole",a);break;case"xlinkRole":At(e,"http://www.w3.org/1999/xlink","xlink:role",a);break;case"xlinkShow":At(e,"http://www.w3.org/1999/xlink","xlink:show",a);break;case"xlinkTitle":At(e,"http://www.w3.org/1999/xlink","xlink:title",a);break;case"xlinkType":At(e,"http://www.w3.org/1999/xlink","xlink:type",a);break;case"xmlBase":At(e,"http://www.w3.org/XML/1998/namespace","xml:base",a);break;case"xmlLang":At(e,"http://www.w3.org/XML/1998/namespace","xml:lang",a);break;case"xmlSpace":At(e,"http://www.w3.org/XML/1998/namespace","xml:space",a);break;case"is":xl(e,"is",a);break;case"innerText":case"textContent":break;default:(!(2<n.length)||n[0]!=="o"&&n[0]!=="O"||n[1]!=="n"&&n[1]!=="N")&&(n=Dd.get(n)||n,xl(e,n,a))}}function Cu(e,t,n,a,l,i){switch(n){case"style":Hr(e,a,i);break;case"dangerouslySetInnerHTML":if(a!=null){if(typeof a!="object"||!("__html"in a))throw Error(g(61));if(n=a.__html,n!=null){if(l.children!=null)throw Error(g(60));e.innerHTML=n}}break;case"children":typeof a=="string"?Zn(e,a):(typeof a=="number"||typeof a=="bigint")&&Zn(e,""+a);break;case"onScroll":a!=null&&K("scroll",e);break;case"onScrollEnd":a!=null&&K("scrollend",e);break;case"onClick":a!=null&&(e.onclick=Ti);break;case"suppressContentEditableWarning":case"suppressHydrationWarning":case"innerHTML":case"ref":break;case"innerText":case"textContent":break;default:if(!Er.hasOwnProperty(n))e:{if(n[0]==="o"&&n[1]==="n"&&(l=n.endsWith("Capture"),t=n.slice(2,l?n.length-7:void 0),i=e[Be]||null,i=i!=null?i[n]:null,typeof i=="function"&&e.removeEventListener(t,i,l),typeof a=="function")){typeof i!="function"&&i!==null&&(n in e?e[n]=null:e.hasAttribute(n)&&e.removeAttribute(n)),e.addEventListener(t,a,l);break e}n in e?e[n]=a:a===!0?e.setAttribute(n,""):xl(e,n,a)}}}function Le(e,t,n){switch(t){case"div":case"span":case"svg":case"path":case"a":case"g":case"p":case"li":break;case"img":K("error",e),K("load",e);var a=!1,l=!1,i;for(i in n)if(n.hasOwnProperty(i)){var s=n[i];if(s!=null)switch(i){case"src":a=!0;break;case"srcSet":l=!0;break;case"children":case"dangerouslySetInnerHTML":throw Error(g(137,t));default:se(e,t,i,s,n,null)}}l&&se(e,t,"srcSet",n.srcSet,n,null),a&&se(e,t,"src",n.src,n,null);return;case"input":K("invalid",e);var u=i=s=l=null,r=null,m=null;for(a in n)if(n.hasOwnProperty(a)){var E=n[a];if(E!=null)switch(a){case"name":l=E;break;case"type":s=E;break;case"checked":r=E;break;case"defaultChecked":m=E;break;case"value":i=E;break;case"defaultValue":u=E;break;case"children":case"dangerouslySetInnerHTML":if(E!=null)throw Error(g(137,t));break;default:se(e,t,a,E,n,null)}}Mr(e,i,u,r,m,s,l,!1),Ul(e);return;case"select":K("invalid",e),a=s=i=null;for(l in n)if(n.hasOwnProperty(l)&&(u=n[l],u!=null))switch(l){case"value":i=u;break;case"defaultValue":s=u;break;case"multiple":a=u;default:se(e,t,l,u,n,null)}t=i,n=s,e.multiple=!!a,t!=null?Vn(e,!!a,t,!1):n!=null&&Vn(e,!!a,n,!0);return;case"textarea":K("invalid",e),i=l=a=null;for(s in n)if(n.hasOwnProperty(s)&&(u=n[s],u!=null))switch(s){case"value":a=u;break;case"defaultValue":l=u;break;case"children":i=u;break;case"dangerouslySetInnerHTML":if(u!=null)throw Error(g(91));break;default:se(e,t,s,u,n,null)}Ar(e,a,l,i),Ul(e);return;case"option":for(r in n)if(n.hasOwnProperty(r)&&(a=n[r],a!=null))switch(r){case"selected":e.selected=a&&typeof a!="function"&&typeof a!="symbol";break;default:se(e,t,r,a,n,null)}return;case"dialog":K("beforetoggle",e),K("toggle",e),K("cancel",e),K("close",e);break;case"iframe":case"object":K("load",e);break;case"video":case"audio":for(a=0;a<rl.length;a++)K(rl[a],e);break;case"image":K("error",e),K("load",e);break;case"details":K("toggle",e);break;case"embed":case"source":case"link":K("error",e),K("load",e);case"area":case"base":case"br":case"col":case"hr":case"keygen":case"meta":case"param":case"track":case"wbr":case"menuitem":for(m in n)if(n.hasOwnProperty(m)&&(a=n[m],a!=null))switch(m){case"children":case"dangerouslySetInnerHTML":throw Error(g(137,t));default:se(e,t,m,a,n,null)}return;default:if(Wi(t)){for(E in n)n.hasOwnProperty(E)&&(a=n[E],a!==void 0&&Cu(e,t,E,a,n,void 0));return}}for(u in n)n.hasOwnProperty(u)&&(a=n[u],a!=null&&se(e,t,u,a,n,null))}function im(e,t,n,a){switch(t){case"div":case"span":case"svg":case"path":case"a":case"g":case"p":case"li":break;case"input":var l=null,i=null,s=null,u=null,r=null,m=null,E=null;for(h in n){var S=n[h];if(n.hasOwnProperty(h)&&S!=null)switch(h){case"checked":break;case"value":break;case"defaultValue":r=S;default:a.hasOwnProperty(h)||se(e,t,h,null,a,S)}}for(var v in a){var h=a[v];if(S=n[v],a.hasOwnProperty(v)&&(h!=null||S!=null))switch(v){case"type":i=h;break;case"name":l=h;break;case"checked":m=h;break;case"defaultChecked":E=h;break;case"value":s=h;break;case"defaultValue":u=h;break;case"children":case"dangerouslySetInnerHTML":if(h!=null)throw Error(g(137,t));break;default:h!==S&&se(e,t,v,h,a,S)}}Fi(e,s,u,r,m,E,i,l);return;case"select":h=s=u=v=null;for(i in n)if(r=n[i],n.hasOwnProperty(i)&&r!=null)switch(i){case"value":break;case"multiple":h=r;default:a.hasOwnProperty(i)||se(e,t,i,null,a,r)}for(l in a)if(i=a[l],r=n[l],a.hasOwnProperty(l)&&(i!=null||r!=null))switch(l){case"value":v=i;break;case"defaultValue":u=i;break;case"multiple":s=i;default:i!==r&&se(e,t,l,i,a,r)}t=u,n=s,a=h,v!=null?Vn(e,!!n,v,!1):!!a!=!!n&&(t!=null?Vn(e,!!n,t,!0):Vn(e,!!n,n?[]:"",!1));return;case"textarea":h=v=null;for(u in n)if(l=n[u],n.hasOwnProperty(u)&&l!=null&&!a.hasOwnProperty(u))switch(u){case"value":break;case"children":break;default:se(e,t,u,null,a,l)}for(s in a)if(l=a[s],i=n[s],a.hasOwnProperty(s)&&(l!=null||i!=null))switch(s){case"value":v=l;break;case"defaultValue":h=l;break;case"children":break;case"dangerouslySetInnerHTML":if(l!=null)throw Error(g(91));break;default:l!==i&&se(e,t,s,l,a,i)}xr(e,v,h);return;case"option":for(var j in n)if(v=n[j],n.hasOwnProperty(j)&&v!=null&&!a.hasOwnProperty(j))switch(j){case"selected":e.selected=!1;break;default:se(e,t,j,null,a,v)}for(r in a)if(v=a[r],h=n[r],a.hasOwnProperty(r)&&v!==h&&(v!=null||h!=null))switch(r){case"selected":e.selected=v&&typeof v!="function"&&typeof v!="symbol";break;default:se(e,t,r,v,a,h)}return;case"img":case"link":case"area":case"base":case"br":case"col":case"embed":case"hr":case"keygen":case"meta":case"param":case"source":case"track":case"wbr":case"menuitem":for(var z in n)v=n[z],n.hasOwnProperty(z)&&v!=null&&!a.hasOwnProperty(z)&&se(e,t,z,null,a,v);for(m in a)if(v=a[m],h=n[m],a.hasOwnProperty(m)&&v!==h&&(v!=null||h!=null))switch(m){case"children":case"dangerouslySetInnerHTML":if(v!=null)throw Error(g(137,t));break;default:se(e,t,m,v,a,h)}return;default:if(Wi(t)){for(var ue in n)v=n[ue],n.hasOwnProperty(ue)&&v!==void 0&&!a.hasOwnProperty(ue)&&Cu(e,t,ue,void 0,a,v);for(E in a)v=a[E],h=n[E],!a.hasOwnProperty(E)||v===h||v===void 0&&h===void 0||Cu(e,t,E,v,a,h);return}}for(var d in n)v=n[d],n.hasOwnProperty(d)&&v!=null&&!a.hasOwnProperty(d)&&se(e,t,d,null,a,v);for(S in a)v=a[S],h=n[S],!a.hasOwnProperty(S)||v===h||v==null&&h==null||se(e,t,S,v,a,h)}var ju=null,_u=null;function Ri(e){return e.nodeType===9?e:e.ownerDocument}function qf(e){switch(e){case"http://www.w3.org/2000/svg":return 1;case"http://www.w3.org/1998/Math/MathML":return 2;default:return 0}}function Lf(e,t){if(e===0)switch(t){case"svg":return 1;case"math":return 2;default:return 0}return e===1&&t==="foreignObject"?0:e}function Xu(e,t){return e==="textarea"||e==="noscript"||typeof t.children=="string"||typeof t.children=="number"||typeof t.children=="bigint"||typeof t.dangerouslySetInnerHTML=="object"&&t.dangerouslySetInnerHTML!==null&&t.dangerouslySetInnerHTML.__html!=null}var Yu=null;function sm(){var e=window.event;return e&&e.type==="popstate"?e===Yu?!1:(Yu=e,!0):(Yu=null,!1)}var Nf=typeof setTimeout=="function"?setTimeout:void 0,um=typeof clearTimeout=="function"?clearTimeout:void 0,zf=typeof Promise=="function"?Promise:void 0,rm=typeof queueMicrotask=="function"?queueMicrotask:typeof zf<"u"?function(e){return zf.resolve(null).then(e).catch(cm)}:Nf;function cm(e){setTimeout(function(){throw e})}function rn(e){return e==="head"}function Df(e,t){var n=t,a=0,l=0;do{var i=n.nextSibling;if(e.removeChild(n),i&&i.nodeType===8)if(n=i.data,n==="/$"){if(0<a&&8>a){n=a;var s=e.ownerDocument;if(n&1&&ol(s.documentElement),n&2&&ol(s.body),n&4)for(n=s.head,ol(n),s=n.firstChild;s;){var u=s.nextSibling,r=s.nodeName;s[Ma]||r==="SCRIPT"||r==="STYLE"||r==="LINK"&&s.rel.toLowerCase()==="stylesheet"||n.removeChild(s),s=u}}if(l===0){e.removeChild(i),El(t);return}l--}else n==="$"||n==="$?"||n==="$!"?l++:a=n.charCodeAt(0)-48;else a=0;n=i}while(n);El(t)}function Bu(e){var t=e.firstChild;for(t&&t.nodeType===10&&(t=t.nextSibling);t;){var n=t;switch(t=t.nextSibling,n.nodeName){case"HTML":case"HEAD":case"BODY":Bu(n),Qi(n);continue;case"SCRIPT":case"STYLE":continue;case"LINK":if(n.rel.toLowerCase()==="stylesheet")continue}e.removeChild(n)}}function om(e,t,n,a){for(;e.nodeType===1;){var l=n;if(e.nodeName.toLowerCase()!==t.toLowerCase()){if(!a&&(e.nodeName!=="INPUT"||e.type!=="hidden"))break}else if(a){if(!e[Ma])switch(t){case"meta":if(!e.hasAttribute("itemprop"))break;return e;case"link":if(i=e.getAttribute("rel"),i==="stylesheet"&&e.hasAttribute("data-precedence"))break;if(i!==l.rel||e.getAttribute("href")!==(l.href==null||l.href===""?null:l.href)||e.getAttribute("crossorigin")!==(l.crossOrigin==null?null:l.crossOrigin)||e.getAttribute("title")!==(l.title==null?null:l.title))break;return e;case"style":if(e.hasAttribute("data-precedence"))break;return e;case"script":if(i=e.getAttribute("src"),(i!==(l.src==null?null:l.src)||e.getAttribute("type")!==(l.type==null?null:l.type)||e.getAttribute("crossorigin")!==(l.crossOrigin==null?null:l.crossOrigin))&&i&&e.hasAttribute("async")&&!e.hasAttribute("itemprop"))break;return e;default:return e}}else if(t==="input"&&e.type==="hidden"){var i=l.name==null?null:""+l.name;if(l.type==="hidden"&&e.getAttribute("name")===i)return e}else return e;if(e=gt(e.nextSibling),e===null)break}return null}function fm(e,t,n){if(t==="")return null;for(;e.nodeType!==3;)if((e.nodeType!==1||e.nodeName!=="INPUT"||e.type!=="hidden")&&!n||(e=gt(e.nextSibling),e===null))return null;return e}function Pu(e){return e.data==="$!"||e.data==="$?"&&e.ownerDocument.readyState==="complete"}function dm(e,t){var n=e.ownerDocument;if(e.data!=="$?"||n.readyState==="complete")t();else{var a=function(){t(),n.removeEventListener("DOMContentLoaded",a)};n.addEventListener("DOMContentLoaded",a),e._reactRetry=a}}function gt(e){for(;e!=null;e=e.nextSibling){var t=e.nodeType;if(t===1||t===3)break;if(t===8){if(t=e.data,t==="$"||t==="$!"||t==="$?"||t==="F!"||t==="F")break;if(t==="/$")return null}}return e}var Gu=null;function Cf(e){e=e.previousSibling;for(var t=0;e;){if(e.nodeType===8){var n=e.data;if(n==="$"||n==="$!"||n==="$?"){if(t===0)return e;t--}else n==="/$"&&t++}e=e.previousSibling}return null}function jf(e,t,n){switch(t=Ri(n),e){case"html":if(e=t.documentElement,!e)throw Error(g(452));return e;case"head":if(e=t.head,!e)throw Error(g(453));return e;case"body":if(e=t.body,!e)throw Error(g(454));return e;default:throw Error(g(451))}}function ol(e){for(var t=e.attributes;t.length;)e.removeAttributeNode(t[0]);Qi(e)}var dt=new Map,_f=new Set;function Oi(e){return typeof e.getRootNode=="function"?e.getRootNode():e.nodeType===9?e:e.ownerDocument}var Pt=x.d;x.d={f:pm,r:mm,D:vm,C:hm,L:gm,m:Em,X:ym,S:bm,M:Sm};function pm(){var e=Pt.f(),t=vi();return e||t}function mm(e){var t=Yn(e);t!==null&&t.tag===5&&t.type==="form"?to(t):Pt.r(e)}var ba=typeof document>"u"?null:document;function Xf(e,t,n){var a=ba;if(a&&typeof t=="string"&&t){var l=it(t);l='link[rel="'+e+'"][href="'+l+'"]',typeof n=="string"&&(l+='[crossorigin="'+n+'"]'),_f.has(l)||(_f.add(l),e={rel:e,crossOrigin:n,href:t},a.querySelector(l)===null&&(t=a.createElement("link"),Le(t,"link",e),Re(t),a.head.appendChild(t)))}}function vm(e){Pt.D(e),Xf("dns-prefetch",e,null)}function hm(e,t){Pt.C(e,t),Xf("preconnect",e,t)}function gm(e,t,n){Pt.L(e,t,n);var a=ba;if(a&&e&&t){var l='link[rel="preload"][as="'+it(t)+'"]';t==="image"&&n&&n.imageSrcSet?(l+='[imagesrcset="'+it(n.imageSrcSet)+'"]',typeof n.imageSizes=="string"&&(l+='[imagesizes="'+it(n.imageSizes)+'"]')):l+='[href="'+it(e)+'"]';var i=l;switch(t){case"style":i=ya(e);break;case"script":i=Sa(e)}dt.has(i)||(e=H({rel:"preload",href:t==="image"&&n&&n.imageSrcSet?void 0:e,as:t},n),dt.set(i,e),a.querySelector(l)!==null||t==="style"&&a.querySelector(fl(i))||t==="script"&&a.querySelector(dl(i))||(t=a.createElement("link"),Le(t,"link",e),Re(t),a.head.appendChild(t)))}}function Em(e,t){Pt.m(e,t);var n=ba;if(n&&e){var a=t&&typeof t.as=="string"?t.as:"script",l='link[rel="modulepreload"][as="'+it(a)+'"][href="'+it(e)+'"]',i=l;switch(a){case"audioworklet":case"paintworklet":case"serviceworker":case"sharedworker":case"worker":case"script":i=Sa(e)}if(!dt.has(i)&&(e=H({rel:"modulepreload",href:e},t),dt.set(i,e),n.querySelector(l)===null)){switch(a){case"audioworklet":case"paintworklet":case"serviceworker":case"sharedworker":case"worker":case"script":if(n.querySelector(dl(i)))return}a=n.createElement("link"),Le(a,"link",e),Re(a),n.head.appendChild(a)}}}function bm(e,t,n){Pt.S(e,t,n);var a=ba;if(a&&e){var l=Bn(a).hoistableStyles,i=ya(e);t=t||"default";var s=l.get(i);if(!s){var u={loading:0,preload:null};if(s=a.querySelector(fl(i)))u.loading=5;else{e=H({rel:"stylesheet",href:e,"data-precedence":t},n),(n=dt.get(i))&&Vu(e,n);var r=s=a.createElement("link");Re(r),Le(r,"link",e),r._p=new Promise(function(m,E){r.onload=m,r.onerror=E}),r.addEventListener("load",function(){u.loading|=1}),r.addEventListener("error",function(){u.loading|=2}),u.loading|=4,Mi(s,t,a)}s={type:"stylesheet",instance:s,count:1,state:u},l.set(i,s)}}}function ym(e,t){Pt.X(e,t);var n=ba;if(n&&e){var a=Bn(n).hoistableScripts,l=Sa(e),i=a.get(l);i||(i=n.querySelector(dl(l)),i||(e=H({src:e,async:!0},t),(t=dt.get(l))&&Zu(e,t),i=n.createElement("script"),Re(i),Le(i,"link",e),n.head.appendChild(i)),i={type:"script",instance:i,count:1,state:null},a.set(l,i))}}function Sm(e,t){Pt.M(e,t);var n=ba;if(n&&e){var a=Bn(n).hoistableScripts,l=Sa(e),i=a.get(l);i||(i=n.querySelector(dl(l)),i||(e=H({src:e,async:!0,type:"module"},t),(t=dt.get(l))&&Zu(e,t),i=n.createElement("script"),Re(i),Le(i,"link",e),n.head.appendChild(i)),i={type:"script",instance:i,count:1,state:null},a.set(l,i))}}function Yf(e,t,n,a){var l=(l=X.current)?Oi(l):null;if(!l)throw Error(g(446));switch(e){case"meta":case"title":return null;case"style":return typeof n.precedence=="string"&&typeof n.href=="string"?(t=ya(n.href),n=Bn(l).hoistableStyles,a=n.get(t),a||(a={type:"style",instance:null,count:0,state:null},n.set(t,a)),a):{type:"void",instance:null,count:0,state:null};case"link":if(n.rel==="stylesheet"&&typeof n.href=="string"&&typeof n.precedence=="string"){e=ya(n.href);var i=Bn(l).hoistableStyles,s=i.get(e);if(s||(l=l.ownerDocument||l,s={type:"stylesheet",instance:null,count:0,state:{loading:0,preload:null}},i.set(e,s),(i=l.querySelector(fl(e)))&&!i._p&&(s.instance=i,s.state.loading=5),dt.has(e)||(n={rel:"preload",as:"style",href:n.href,crossOrigin:n.crossOrigin,integrity:n.integrity,media:n.media,hrefLang:n.hrefLang,referrerPolicy:n.referrerPolicy},dt.set(e,n),i||Tm(l,e,n,s.state))),t&&a===null)throw Error(g(528,""));return s}if(t&&a!==null)throw Error(g(529,""));return null;case"script":return t=n.async,n=n.src,typeof n=="string"&&t&&typeof t!="function"&&typeof t!="symbol"?(t=Sa(n),n=Bn(l).hoistableScripts,a=n.get(t),a||(a={type:"script",instance:null,count:0,state:null},n.set(t,a)),a):{type:"void",instance:null,count:0,state:null};default:throw Error(g(444,e))}}function ya(e){return'href="'+it(e)+'"'}function fl(e){return'link[rel="stylesheet"]['+e+"]"}function Bf(e){return H({},e,{"data-precedence":e.precedence,precedence:null})}function Tm(e,t,n,a){e.querySelector('link[rel="preload"][as="style"]['+t+"]")?a.loading=1:(t=e.createElement("link"),a.preload=t,t.addEventListener("load",function(){return a.loading|=1}),t.addEventListener("error",function(){return a.loading|=2}),Le(t,"link",n),Re(t),e.head.appendChild(t))}function Sa(e){return'[src="'+it(e)+'"]'}function dl(e){return"script[async]"+e}function Pf(e,t,n){if(t.count++,t.instance===null)switch(t.type){case"style":var a=e.querySelector('style[data-href~="'+it(n.href)+'"]');if(a)return t.instance=a,Re(a),a;var l=H({},n,{"data-href":n.href,"data-precedence":n.precedence,href:null,precedence:null});return a=(e.ownerDocument||e).createElement("style"),Re(a),Le(a,"style",l),Mi(a,n.precedence,e),t.instance=a;case"stylesheet":l=ya(n.href);var i=e.querySelector(fl(l));if(i)return t.state.loading|=4,t.instance=i,Re(i),i;a=Bf(n),(l=dt.get(l))&&Vu(a,l),i=(e.ownerDocument||e).createElement("link"),Re(i);var s=i;return s._p=new Promise(function(u,r){s.onload=u,s.onerror=r}),Le(i,"link",a),t.state.loading|=4,Mi(i,n.precedence,e),t.instance=i;case"script":return i=Sa(n.src),(l=e.querySelector(dl(i)))?(t.instance=l,Re(l),l):(a=n,(l=dt.get(i))&&(a=H({},n),Zu(a,l)),e=e.ownerDocument||e,l=e.createElement("script"),Re(l),Le(l,"link",a),e.head.appendChild(l),t.instance=l);case"void":return null;default:throw Error(g(443,t.type))}else t.type==="stylesheet"&&(t.state.loading&4)===0&&(a=t.instance,t.state.loading|=4,Mi(a,n.precedence,e));return t.instance}function Mi(e,t,n){for(var a=n.querySelectorAll('link[rel="stylesheet"][data-precedence],style[data-precedence]'),l=a.length?a[a.length-1]:null,i=l,s=0;s<a.length;s++){var u=a[s];if(u.dataset.precedence===t)i=u;else if(i!==l)break}i?i.parentNode.insertBefore(e,i.nextSibling):(t=n.nodeType===9?n.head:n,t.insertBefore(e,t.firstChild))}function Vu(e,t){e.crossOrigin==null&&(e.crossOrigin=t.crossOrigin),e.referrerPolicy==null&&(e.referrerPolicy=t.referrerPolicy),e.title==null&&(e.title=t.title)}function Zu(e,t){e.crossOrigin==null&&(e.crossOrigin=t.crossOrigin),e.referrerPolicy==null&&(e.referrerPolicy=t.referrerPolicy),e.integrity==null&&(e.integrity=t.integrity)}var xi=null;function Gf(e,t,n){if(xi===null){var a=new Map,l=xi=new Map;l.set(n,a)}else l=xi,a=l.get(n),a||(a=new Map,l.set(n,a));if(a.has(e))return a;for(a.set(e,null),n=n.getElementsByTagName(e),l=0;l<n.length;l++){var i=n[l];if(!(i[Ma]||i[Ce]||e==="link"&&i.getAttribute("rel")==="stylesheet")&&i.namespaceURI!=="http://www.w3.org/2000/svg"){var s=i.getAttribute(t)||"";s=e+s;var u=a.get(s);u?u.push(i):a.set(s,[i])}}return a}function Vf(e,t,n){e=e.ownerDocument||e,e.head.insertBefore(n,t==="title"?e.querySelector("head > title"):null)}function Rm(e,t,n){if(n===1||t.itemProp!=null)return!1;switch(e){case"meta":case"title":return!0;case"style":if(typeof t.precedence!="string"||typeof t.href!="string"||t.href==="")break;return!0;case"link":if(typeof t.rel!="string"||typeof t.href!="string"||t.href===""||t.onLoad||t.onError)break;switch(t.rel){case"stylesheet":return e=t.disabled,typeof t.precedence=="string"&&e==null;default:return!0}case"script":if(t.async&&typeof t.async!="function"&&typeof t.async!="symbol"&&!t.onLoad&&!t.onError&&t.src&&typeof t.src=="string")return!0}return!1}function Zf(e){return!(e.type==="stylesheet"&&(e.state.loading&3)===0)}var pl=null;function Om(){}function Mm(e,t,n){if(pl===null)throw Error(g(475));var a=pl;if(t.type==="stylesheet"&&(typeof n.media!="string"||matchMedia(n.media).matches!==!1)&&(t.state.loading&4)===0){if(t.instance===null){var l=ya(n.href),i=e.querySelector(fl(l));if(i){e=i._p,e!==null&&typeof e=="object"&&typeof e.then=="function"&&(a.count++,a=Ai.bind(a),e.then(a,a)),t.state.loading|=4,t.instance=i,Re(i);return}i=e.ownerDocument||e,n=Bf(n),(l=dt.get(l))&&Vu(n,l),i=i.createElement("link"),Re(i);var s=i;s._p=new Promise(function(u,r){s.onload=u,s.onerror=r}),Le(i,"link",n),t.instance=i}a.stylesheets===null&&(a.stylesheets=new Map),a.stylesheets.set(t,e),(e=t.state.preload)&&(t.state.loading&3)===0&&(a.count++,t=Ai.bind(a),e.addEventListener("load",t),e.addEventListener("error",t))}}function xm(){if(pl===null)throw Error(g(475));var e=pl;return e.stylesheets&&e.count===0&&Qu(e,e.stylesheets),0<e.count?function(t){var n=setTimeout(function(){if(e.stylesheets&&Qu(e,e.stylesheets),e.unsuspend){var a=e.unsuspend;e.unsuspend=null,a()}},6e4);return e.unsuspend=t,function(){e.unsuspend=null,clearTimeout(n)}}:null}function Ai(){if(this.count--,this.count===0){if(this.stylesheets)Qu(this,this.stylesheets);else if(this.unsuspend){var e=this.unsuspend;this.unsuspend=null,e()}}}var Ui=null;function Qu(e,t){e.stylesheets=null,e.unsuspend!==null&&(e.count++,Ui=new Map,t.forEach(Am,e),Ui=null,Ai.call(e))}function Am(e,t){if(!(t.state.loading&4)){var n=Ui.get(e);if(n)var a=n.get(null);else{n=new Map,Ui.set(e,n);for(var l=e.querySelectorAll("link[data-precedence],style[data-precedence]"),i=0;i<l.length;i++){var s=l[i];(s.nodeName==="LINK"||s.getAttribute("media")!=="not all")&&(n.set(s.dataset.precedence,s),a=s)}a&&n.set(null,a)}l=t.instance,s=l.getAttribute("data-precedence"),i=n.get(s)||a,i===a&&n.set(null,l),n.set(s,l),this.count++,a=Ai.bind(this),l.addEventListener("load",a),l.addEventListener("error",a),i?i.parentNode.insertBefore(l,i.nextSibling):(e=e.nodeType===9?e.head:e,e.insertBefore(l,e.firstChild)),t.state.loading|=4}}var ml={$$typeof:Ne,Provider:null,Consumer:null,_currentValue:C,_currentValue2:C,_threadCount:0};function Um(e,t,n,a,l,i,s,u){this.tag=1,this.containerInfo=e,this.pingCache=this.current=this.pendingChildren=null,this.timeoutHandle=-1,this.callbackNode=this.next=this.pendingContext=this.context=this.cancelPendingCommit=null,this.callbackPriority=0,this.expirationTimes=Pi(-1),this.entangledLanes=this.shellSuspendCounter=this.errorRecoveryDisabledLanes=this.expiredLanes=this.warmLanes=this.pingedLanes=this.suspendedLanes=this.pendingLanes=0,this.entanglements=Pi(0),this.hiddenUpdates=Pi(null),this.identifierPrefix=a,this.onUncaughtError=l,this.onCaughtError=i,this.onRecoverableError=s,this.pooledCache=null,this.pooledCacheLanes=0,this.formState=u,this.incompleteTransitions=new Map}function Qf(e,t,n,a,l,i,s,u,r,m,E,S){return e=new Um(e,t,n,s,u,r,m,S),t=1,i===!0&&(t|=24),i=$e(3,null,null,t),e.current=i,i.stateNode=e,t=xs(),t.refCount++,e.pooledCache=t,t.refCount++,i.memoizedState={element:a,isDehydrated:n,cache:t},qs(i),e}function Kf(e){return e?(e=$n,e):$n}function Jf(e,t,n,a,l,i){l=Kf(l),a.context===null?a.context=l:a.pendingContext=l,a=wt(t),a.payload={element:n},i=i===void 0?null:i,i!==null&&(a.callback=i),n=Ft(e,a,t),n!==null&&(at(n,e,t),Za(n,e,t))}function wf(e,t){if(e=e.memoizedState,e!==null&&e.dehydrated!==null){var n=e.retryLane;e.retryLane=n!==0&&n<t?n:t}}function Ku(e,t){wf(e,t),(e=e.alternate)&&wf(e,t)}function Ff(e){if(e.tag===13){var t=Wn(e,67108864);t!==null&&at(t,e,67108864),Ku(e,67108864)}}var Hi=!0;function Hm(e,t,n,a){var l=b.T;b.T=null;var i=x.p;try{x.p=2,Ju(e,t,n,a)}finally{x.p=i,b.T=l}}function qm(e,t,n,a){var l=b.T;b.T=null;var i=x.p;try{x.p=8,Ju(e,t,n,a)}finally{x.p=i,b.T=l}}function Ju(e,t,n,a){if(Hi){var l=wu(a);if(l===null)Du(e,t,a,qi,n),Wf(e,a);else if(Nm(l,e,t,n,a))a.stopPropagation();else if(Wf(e,a),t&4&&-1<Lm.indexOf(e)){for(;l!==null;){var i=Yn(l);if(i!==null)switch(i.tag){case 3:if(i=i.stateNode,i.current.memoizedState.isDehydrated){var s=gn(i.pendingLanes);if(s!==0){var u=i;for(u.pendingLanes|=2,u.entangledLanes|=2;s;){var r=1<<31-ke(s);u.entanglements[1]|=r,s&=~r}Ot(i),(ae&6)===0&&(pi=bt()+500,ul(0))}}break;case 13:u=Wn(i,2),u!==null&&at(u,i,2),vi(),Ku(i,2)}if(i=wu(a),i===null&&Du(e,t,a,qi,n),i===l)break;l=i}l!==null&&a.stopPropagation()}else Du(e,t,a,null,n)}}function wu(e){return e=Ii(e),Fu(e)}var qi=null;function Fu(e){if(qi=null,e=Xn(e),e!==null){var t=G(e);if(t===null)e=null;else{var n=t.tag;if(n===13){if(e=pe(t),e!==null)return e;e=null}else if(n===3){if(t.stateNode.current.memoizedState.isDehydrated)return t.tag===3?t.stateNode.containerInfo:null;e=null}else t!==e&&(e=null)}}return qi=e,null}function kf(e){switch(e){case"beforetoggle":case"cancel":case"click":case"close":case"contextmenu":case"copy":case"cut":case"auxclick":case"dblclick":case"dragend":case"dragstart":case"drop":case"focusin":case"focusout":case"input":case"invalid":case"keydown":case"keypress":case"keyup":case"mousedown":case"mouseup":case"paste":case"pause":case"play":case"pointercancel":case"pointerdown":case"pointerup":case"ratechange":case"reset":case"resize":case"seeked":case"submit":case"toggle":case"touchcancel":case"touchend":case"touchstart":case"volumechange":case"change":case"selectionchange":case"textInput":case"compositionstart":case"compositionend":case"compositionupdate":case"beforeblur":case"afterblur":case"beforeinput":case"blur":case"fullscreenchange":case"focus":case"hashchange":case"popstate":case"select":case"selectstart":return 2;case"drag":case"dragenter":case"dragexit":case"dragleave":case"dragover":case"mousemove":case"mouseout":case"mouseover":case"pointermove":case"pointerout":case"pointerover":case"scroll":case"touchmove":case"wheel":case"mouseenter":case"mouseleave":case"pointerenter":case"pointerleave":return 8;case"message":switch(hd()){case rr:return 2;case cr:return 8;case Tl:case gd:return 32;case or:return 268435456;default:return 32}default:return 32}}var ku=!1,cn=null,on=null,fn=null,vl=new Map,hl=new Map,dn=[],Lm="mousedown mouseup touchcancel touchend touchstart auxclick dblclick pointercancel pointerdown pointerup dragend dragstart drop compositionend compositionstart keydown keypress keyup input textInput copy cut paste click change contextmenu reset".split(" ");function Wf(e,t){switch(e){case"focusin":case"focusout":cn=null;break;case"dragenter":case"dragleave":on=null;break;case"mouseover":case"mouseout":fn=null;break;case"pointerover":case"pointerout":vl.delete(t.pointerId);break;case"gotpointercapture":case"lostpointercapture":hl.delete(t.pointerId)}}function gl(e,t,n,a,l,i){return e===null||e.nativeEvent!==i?(e={blockedOn:t,domEventName:n,eventSystemFlags:a,nativeEvent:i,targetContainers:[l]},t!==null&&(t=Yn(t),t!==null&&Ff(t)),e):(e.eventSystemFlags|=a,t=e.targetContainers,l!==null&&t.indexOf(l)===-1&&t.push(l),e)}function Nm(e,t,n,a,l){switch(t){case"focusin":return cn=gl(cn,e,t,n,a,l),!0;case"dragenter":return on=gl(on,e,t,n,a,l),!0;case"mouseover":return fn=gl(fn,e,t,n,a,l),!0;case"pointerover":var i=l.pointerId;return vl.set(i,gl(vl.get(i)||null,e,t,n,a,l)),!0;case"gotpointercapture":return i=l.pointerId,hl.set(i,gl(hl.get(i)||null,e,t,n,a,l)),!0}return!1}function $f(e){var t=Xn(e.target);if(t!==null){var n=G(t);if(n!==null){if(t=n.tag,t===13){if(t=pe(n),t!==null){e.blockedOn=t,Md(e.priority,function(){if(n.tag===13){var a=nt();a=Gi(a);var l=Wn(n,a);l!==null&&at(l,n,a),Ku(n,a)}});return}}else if(t===3&&n.stateNode.current.memoizedState.isDehydrated){e.blockedOn=n.tag===3?n.stateNode.containerInfo:null;return}}}e.blockedOn=null}function Li(e){if(e.blockedOn!==null)return!1;for(var t=e.targetContainers;0<t.length;){var n=wu(e.nativeEvent);if(n===null){n=e.nativeEvent;var a=new n.constructor(n.type,n);$i=a,n.target.dispatchEvent(a),$i=null}else return t=Yn(n),t!==null&&Ff(t),e.blockedOn=n,!1;t.shift()}return!0}function If(e,t,n){Li(e)&&n.delete(t)}function zm(){ku=!1,cn!==null&&Li(cn)&&(cn=null),on!==null&&Li(on)&&(on=null),fn!==null&&Li(fn)&&(fn=null),vl.forEach(If),hl.forEach(If)}function Ni(e,t){e.blockedOn===t&&(e.blockedOn=null,ku||(ku=!0,O.unstable_scheduleCallback(O.unstable_NormalPriority,zm)))}var zi=null;function ed(e){zi!==e&&(zi=e,O.unstable_scheduleCallback(O.unstable_NormalPriority,function(){zi===e&&(zi=null);for(var t=0;t<e.length;t+=3){var n=e[t],a=e[t+1],l=e[t+2];if(typeof a!="function"){if(Fu(a||n)===null)continue;break}var i=Yn(n);i!==null&&(e.splice(t,3),t-=3,Fs(i,{pending:!0,data:l,method:n.method,action:a},a,l))}}))}function El(e){function t(r){return Ni(r,e)}cn!==null&&Ni(cn,e),on!==null&&Ni(on,e),fn!==null&&Ni(fn,e),vl.forEach(t),hl.forEach(t);for(var n=0;n<dn.length;n++){var a=dn[n];a.blockedOn===e&&(a.blockedOn=null)}for(;0<dn.length&&(n=dn[0],n.blockedOn===null);)$f(n),n.blockedOn===null&&dn.shift();if(n=(e.ownerDocument||e).$$reactFormReplay,n!=null)for(a=0;a<n.length;a+=3){var l=n[a],i=n[a+1],s=l[Be]||null;if(typeof i=="function")s||ed(n);else if(s){var u=null;if(i&&i.hasAttribute("formAction")){if(l=i,s=i[Be]||null)u=s.formAction;else if(Fu(l)!==null)continue}else u=s.action;typeof u=="function"?n[a+1]=u:(n.splice(a,3),a-=3),ed(n)}}}function Wu(e){this._internalRoot=e}Di.prototype.render=Wu.prototype.render=function(e){var t=this._internalRoot;if(t===null)throw Error(g(409));var n=t.current,a=nt();Jf(n,a,e,t,null,null)},Di.prototype.unmount=Wu.prototype.unmount=function(){var e=this._internalRoot;if(e!==null){this._internalRoot=null;var t=e.containerInfo;Jf(e.current,2,null,e,null,null),vi(),t[_n]=null}};function Di(e){this._internalRoot=e}Di.prototype.unstable_scheduleHydration=function(e){if(e){var t=vr();e={blockedOn:null,target:e,priority:t};for(var n=0;n<dn.length&&t!==0&&t<dn[n].priority;n++);dn.splice(n,0,e),n===0&&$f(e)}};var td=te.version;if(td!=="19.1.9")throw Error(g(527,td,"19.1.9"));x.findDOMNode=function(e){var t=e._reactInternals;if(t===void 0)throw typeof e.render=="function"?Error(g(188)):(e=Object.keys(e).join(","),Error(g(268,e)));return e=L(t),e=e!==null?T(e):null,e=e===null?null:e.stateNode,e};var Dm={bundleType:0,version:"19.1.9",rendererPackageName:"react-dom",currentDispatcherRef:b,reconcilerVersion:"19.1.9"};if(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__<"u"){var Ci=__REACT_DEVTOOLS_GLOBAL_HOOK__;if(!Ci.isDisabled&&Ci.supportsFiber)try{Ta=Ci.inject(Dm),Fe=Ci}catch{}}return yl.createRoot=function(e,t){if(!P(e))throw Error(g(299));var n=!1,a="",l=ho,i=go,s=Eo,u=null;return t!=null&&(t.unstable_strictMode===!0&&(n=!0),t.identifierPrefix!==void 0&&(a=t.identifierPrefix),t.onUncaughtError!==void 0&&(l=t.onUncaughtError),t.onCaughtError!==void 0&&(i=t.onCaughtError),t.onRecoverableError!==void 0&&(s=t.onRecoverableError),t.unstable_transitionCallbacks!==void 0&&(u=t.unstable_transitionCallbacks)),t=Qf(e,1,!1,null,null,n,a,l,i,s,u,null),e[_n]=t.current,zu(e),new Wu(t)},yl.hydrateRoot=function(e,t,n){if(!P(e))throw Error(g(299));var a=!1,l="",i=ho,s=go,u=Eo,r=null,m=null;return n!=null&&(n.unstable_strictMode===!0&&(a=!0),n.identifierPrefix!==void 0&&(l=n.identifierPrefix),n.onUncaughtError!==void 0&&(i=n.onUncaughtError),n.onCaughtError!==void 0&&(s=n.onCaughtError),n.onRecoverableError!==void 0&&(u=n.onRecoverableError),n.unstable_transitionCallbacks!==void 0&&(r=n.unstable_transitionCallbacks),n.formState!==void 0&&(m=n.formState)),t=Qf(e,1,!0,t,n??null,a,l,i,s,u,r,m),t.context=Kf(null),n=t.current,a=nt(),a=Gi(a),l=wt(a),l.callback=null,Ft(n,l,a),n=a,t.current.lanes=n,Oa(t,n),Ot(t),e[_n]=t.current,zu(e),new Di(t)},yl.version="19.1.9",yl}var fd;function Zm(){if(fd)return er.exports;fd=1;function O(){if(!(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__>"u"||typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE!="function"))try{__REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(O)}catch(te){console.error(te)}}return O(),er.exports=Vm(),er.exports}var Qm=Zm();const Km={search:"M10.5 3.5a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm5 12 5 5",people:"M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm-6 9v-2a6 6 0 0 1 12 0v2m1-15a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 4v2",home:"M3 11.5 12 4l9 7.5M5.5 10.5V20h13v-9.5M10 20v-5h4v5",folder:"M3 7a1.5 1.5 0 0 1 1.5-1.5H9l2 2h8.5A1.5 1.5 0 0 1 21 9v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18V7Z",route:"M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm12-10a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM8 17h6.5a3.5 3.5 0 0 0 0-7H10a3 3 0 0 1 0-6h5",atelier:"M12 3 3 20h18L12 3Zm0 6v7m-3 1h6",file:"M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm7 0v5h5M9 13h6M9 17h6",book:"M4 5.5A2.5 2.5 0 0 1 6.5 3H12v15H6.5A2.5 2.5 0 0 0 4 20.5V5.5Zm16 0A2.5 2.5 0 0 0 17.5 3H12v15h5.5a2.5 2.5 0 0 1 2.5 2.5V5.5Z",sparkle:"M12 3v4m0 10v4M3 12h4m10 0h4M12 7c0 3 2 5 5 5-3 0-5 2-5 5 0-3-2-5-5-5 3 0 5-2 5-5Z",gear:"M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm7.4-2.1.2-1.4-.2-1.4-2-.6-.8-1.9 1-1.8-2-2-1.8 1-1.9-.8-.6-2h-2.6l-.6 2-1.9.8-1.8-1-2 2 1 1.8-.8 1.9-2 .6-.2 1.4.2 1.4 2 .6.8 1.9-1 1.8 2 2 1.8-1 1.9.8.6 2h2.6l.6-2 1.9-.8 1.8 1 2-2-1-1.8.8-1.9 2-.6Z",upload:"M12 16V4m0 0-4 4m4-4 4 4M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3",plus:"M12 5v14M5 12h14",cube:"M12 3 4 7.5v9L12 21l8-4.5v-9L12 3Zm0 18V12M4 7.5 12 12l8-4.5","arrow-right":"M4 12h16m-6-6 6 6-6 6","chevron-right":"m9 6 6 6-6 6","chevron-down":"m6 9 6 6 6-6",check:"m5 12.5 4.5 4.5L19 7.5",site:"M12 21s-6-5.3-6-10a6 6 0 1 1 12 0c0 4.7-6 10-6 10Zm0-8a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z",programme:"M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z",design:"m4 20 4-1L19.5 7.5a2.1 2.1 0 0 0-3-3L5 16l-1 4Zm10.5-13.5 3 3",proof:"M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm2 4h8v3H8V7Zm0 6h2m3 0h2m-5 4h2m3 0h2",scale:"M12 3v18M4 7h16M6 7l-3 7a3 3 0 0 0 6 0L6 7Zm12 0-3 7a3 3 0 0 0 6 0l-3-7Z",flag:"M5 21V4m0 0h11l-2 4 2 4H5",stairs:"M4 20h4v-4h4v-4h4V8h4M4 20V8",drop:"M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z"};function pt({name:O,size:te=20,className:Y}){return f.jsx("svg",{className:Y,width:te,height:te,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"1.7",strokeLinecap:"round",strokeLinejoin:"round","aria-hidden":"true",focusable:"false",children:f.jsx("path",{d:Km[O]})})}const ji=[{id:"projets-sources",label:"Projets et sources",implemented:!0,status:"La parcelle du projet dans l'outil Parcelle du prototype (import KML/KMZ, bornes, cotes, dossier), transmise au modèle de l'Atelier ; sources des étapes ; archive de projet (sauvegarde, import, copie)."},{id:"parcours",label:"Parcours",implemented:!0,status:"Les 21 étapes avec leur formulaire métier, leurs propositions Harmonie arbitrables (péremption, rapports), leurs indicateurs, leur transmission, l'outil Parcelle (01), l'Atelier et la sous-page « Harmonie du bâtiment » (10, 11), les sources de l'étape."},{id:"programmation",label:"Programmation",implemented:!0,status:"Répartition programmatique par type de bâtiment (fourchettes, ratios, adjacences), bibliothèque des bâtiments et cas de programme appliqué (fiches, liaison au modèle dessiné, registre des hypothèses, transfert surfacique à total constant)."},{id:"atelier",label:"Atelier architectural",implemented:!0,status:"L'Atelier reconstruit sur le modèle typé du projet : plan 2D et outils de dessin, vue 3D, niveaux, coupes et façades de travail, inspecteur, annuler / rétablir, exports DXF / SVG / CSV / PNG ; documents dérivés (vues, feuilles, tableaux, PDF au catalogue), toitures en pente, garde-corps, blocs et composants, contraintes d'esquisse, phases ; échanges IFC 4.3 (export validé par IfcOpenShell, import en représentations) et import DXF 2D avec rapport de fidélité ; versions nommées, variantes fusionnées par rejeu validé, publications figées, verrous fins et collisions d'architecture ; scripts versionnés et assistant à boucle contrôlée (règles de Fadi, accord explicite) ; chaque modification est une commande enregistrée avec révision contrôlée, utilisable hors ligne."},{id:"analyses",label:"Analyses métier",implemented:!0,status:"Quantités dérivées du modèle, contrôles traçables (règles de flow-v62, transmissions, chiffrage, structure déclarée), résultats des étapes, variantes de programme ; contrôles réglementaires (accessibilité, incendie) non portés."},{id:"documents",label:"Documents",implemented:!0,status:"Catalogue des documents produits depuis la révision courante (rapports Harmonie, bilan du bâtiment, plans de lecture, tableaux, archive) avec leur actualité ; dessins techniques et exports DXF / PNG restent dans l'Atelier."},{id:"collaboration",label:"Collaboration",implemented:!0,status:"Commentaires par projet et par étape, journal des révisions, synchronisation hors-ligne de l'Atelier (file locale des modifications, envoyée dans l'ordre) et lecture hors-ligne ; partage multi-utilisateur et droits non disponibles (Lot 4), annoncés tels quels."}],Jm=`{
  "version": "8.19.0",
  "phases": [
    "Comprendre le site",
    "Programmer",
    "Concevoir / Tester",
    "Prouver la faisabilité",
    "Arbitrer",
    "Engager"
  ],
  "steps": [
    {
      "number": 1,
      "title": "Parcelle / Site existant",
      "phase": "Comprendre le site",
      "key": "site",
      "scope": "Site et paysage",
      "goal": "Choisir le lieu et composer le terrain, avant toute distribution intérieure.",
      "inputs": "Contour cadastral, géolocalisation, approche, contexte cartographique et observations datées.",
      "deliverable": "Schéma d’organisation du site et variante argumentée.",
      "method": "Formes extérieures · Luan Tou ; ouverture, appuis, transitions et mouvements. Aucune carte natale du bâtiment à ce stade.",
      "topic": "Organisation du site",
      "harmonieOptions": [],
      "transmitsTo": [
        2,
        4,
        6,
        9,
        10
      ]
    },
    {
      "number": 2,
      "title": "Réglementation & constructibilité",
      "phase": "Comprendre le site",
      "key": "rules",
      "scope": "Site constructible",
      "goal": "Adapter les intentions du site aux règles documentées, sans inventer un droit à construire.",
      "inputs": "Schéma de site retenu, règlement, servitudes, accès et retraits renseignés.",
      "deliverable": "Parti compatible à faire confirmer et solution de repli.",
      "method": "Conserver l’intention d’accueil ou de protection par une solution réalisable ; l’interprétation traditionnelle ne prime pas sur les règles.",
      "topic": "Adaptation aux contraintes",
      "harmonieOptions": [
        {
          "title": "Préserver l’intention, déplacer le dispositif",
          "proposal": "Déplacer parvis, filtre paysager ou desserte dans les espaces dont l’usage est admissible ; garder une transition extérieure lisible.",
          "benefit": "Conserve le sens du projet sans imposer une forme unique.",
          "tradeoff": "Implantation et dimensions restent à préciser.",
          "validation": "Accès, plantations et ouvrages dans les retraits doivent être autorisés."
        },
        {
          "title": "Concentrer l’aménagement dans une zone moins contrainte",
          "proposal": "Regrouper les aménagements permanents dans le secteur admissible et réserver les secteurs incertains à des usages réversibles sous réserve.",
          "benefit": "Réduit l’exposition aux incertitudes réglementaires.",
          "tradeoff": "Peut réduire l’espace disponible pour l’accueil.",
          "validation": "Ne pas qualifier d’aménageable une zone non vérifiée."
        },
        {
          "title": "Comparer un autre site ou un programme adapté",
          "proposal": "Lorsque l’intention principale est incompatible, comparer un autre site ou réduire le programme plutôt que forcer une implantation.",
          "benefit": "Évite une conception fondée sur une dérogation supposée.",
          "tradeoff": "Peut remettre en cause le choix foncier.",
          "validation": "Confirmer l’incompatibilité auprès du concepteur et de l’autorité compétente."
        }
      ],
      "transmitsTo": [
        6,
        9,
        10,
        16
      ]
    },
    {
      "number": 3,
      "title": "Marché & demande",
      "phase": "Comprendre le site",
      "key": "market",
      "scope": "Attentes et usages recherchés",
      "goal": "Proposer des qualités d’usage à confronter à la demande, sans prédire une rentabilité Feng Shui.",
      "inputs": "Publics visés, observations de marché et accessibilité territoriale documentée.",
      "deliverable": "Promesse d’usage testable auprès des futurs utilisateurs.",
      "method": "Lecture de l’accueil et des transitions ; aucune promesse d’attraction, de santé ou de prospérité.",
      "topic": "Qualités à tester",
      "harmonieOptions": [
        {
          "title": "Accueil identifiable et arrivée sereine",
          "proposal": "Tester auprès des usagers un accès compréhensible et une transition extérieure permettant de s’orienter sans conflit avec la desserte.",
          "benefit": "Formule une valeur d’usage observable.",
          "tradeoff": "Les réactions des usagers ne sont pas encore connues.",
          "validation": "Entretiens ou visites comparatives à documenter."
        },
        {
          "title": "Retrait et intimité",
          "proposal": "Comparer l’intérêt d’un site plus protégé, d’une limite paysagère ou d’une séquence d’entrée moins exposée.",
          "benefit": "Répond à une attente possible de tranquillité.",
          "tradeoff": "Moins de visibilité directe selon le contexte.",
          "validation": "Confirmer l’attente auprès du public cible, sans déduire le bruit du fond satellite."
        },
        {
          "title": "Lien avec l’extérieur partagé",
          "proposal": "Tester la valeur d’un espace extérieur collectif et les conditions d’usage aux heures de fréquentation.",
          "benefit": "Explore une qualité autre que la seule surface.",
          "tradeoff": "Entretien et gestion d’usage à prévoir.",
          "validation": "Aucune hausse de valeur ou de demande n’est présumée."
        }
      ],
      "transmitsTo": [
        4,
        5,
        6,
        12
      ]
    },
    {
      "number": 4,
      "title": "Idée & stratégie",
      "phase": "Programmer",
      "key": "strategy",
      "scope": "Parti d’ensemble",
      "goal": "Choisir un parti spatial reliant site, activités et identité du projet.",
      "inputs": "Intentions du site, contraintes connues et besoins pressentis.",
      "deliverable": "Parti directeur et compromis explicités.",
      "method": "Forme et équilibre ouverture/protection à l’échelle de l’ensemble.",
      "topic": "Parti spatial",
      "harmonieOptions": [
        {
          "title": "Séquence ouverte et progressive",
          "proposal": "Organiser une progression public → accueil → activités, en conservant un espace extérieur clairement identifiable.",
          "benefit": "Parti lisible pour les nouveaux arrivants.",
          "tradeoff": "Protection visuelle et contrôle des accès à préciser.",
          "validation": "Ne pas confondre ouverture d’usage et absence de contrôle."
        },
        {
          "title": "Ensemble protégé autour d’un extérieur",
          "proposal": "Concevoir le projet autour d’un espace de retrait, avec une entrée visible mais non exposée de part en part.",
          "benefit": "Donne une intention commune à l’implantation et au programme.",
          "tradeoff": "Peut limiter certaines vues ou la compacité.",
          "validation": "Confronter soleil, masques, circulation et constructibilité."
        },
        {
          "title": "Pôles autonomes reliés",
          "proposal": "Séparer les fonctions à horaires ou publics différents et les réunir par une transition commune.",
          "benefit": "Permet plusieurs modes d’exploitation.",
          "tradeoff": "Multiplie potentiellement les accès et supports.",
          "validation": "Tester besoins réels et coûts avant de figer les pôles."
        }
      ],
      "transmitsTo": [
        5,
        6,
        7,
        9,
        10
      ]
    },
    {
      "number": 5,
      "title": "Besoins & concertation",
      "phase": "Programmer",
      "key": "needs",
      "scope": "Usagers et activités",
      "goal": "Proposer des modalités d’usage et les confronter aux personnes concernées.",
      "inputs": "Profils d’usagers, activités, horaires, fréquentations et besoins exprimés.",
      "deliverable": "Scénario d’usage et besoins à intégrer au PMO.",
      "method": "Yin–Yang comme lecture qualitative de l’activité et du retrait ; besoins déclarés distincts de l’interprétation.",
      "topic": "Scénarios d’usage",
      "harmonieOptions": [
        {
          "title": "Alternance activité et retrait",
          "proposal": "Prévoir une possibilité de retrait à proximité des usages collectifs, sans placer cette zone dans un passage obligé.",
          "benefit": "Répond à plusieurs rythmes dans le même projet.",
          "tradeoff": "Surface et disponibilité à arbitrer.",
          "validation": "Interroger les usagers sur la durée et la simultanéité des usages."
        },
        {
          "title": "Séparation par horaires",
          "proposal": "Partager certains lieux à des moments distincts et prévoir les transitions nécessaires au changement d’activité.",
          "benefit": "Limite les duplications.",
          "tradeoff": "Dépend de l’organisation quotidienne.",
          "validation": "Éprouver un planning réaliste et les pointes de fréquentation."
        },
        {
          "title": "Séparation par publics",
          "proposal": "Prévoir des cheminements et espaces identifiables pour les usagers aux besoins incompatibles.",
          "benefit": "Réduit les conflits d’usage possibles.",
          "tradeoff": "Peut augmenter la surface de supports.",
          "validation": "Documenter les incompatibilités plutôt que les présumer."
        }
      ],
      "transmitsTo": [
        6,
        7,
        8
      ]
    },
    {
      "number": 6,
      "title": "PMO — Programme du maître d’ouvrage",
      "phase": "Programmer",
      "key": "pmo",
      "scope": "Objectifs du maître d’ouvrage",
      "goal": "Transformer les intentions retenues en exigences programmatiques compréhensibles.",
      "inputs": "Choix du site, besoins exprimés, objectifs et arbitrages du maître d’ouvrage.",
      "deliverable": "Exigences à transmettre à Répartition et à la conception.",
      "method": "Traduire une intention traditionnelle en qualité spatiale observable, avec critère de revue explicite.",
      "topic": "Engagements du programme",
      "harmonieOptions": [
        {
          "title": "Inscrire trois intentions prioritaires",
          "proposal": "Formaliser arrivée lisible, relation choisie à l’extérieur et séparation des mouvements incompatibles ; fixer pour chacune un responsable et un mode de vérification.",
          "benefit": "Donne un cap utilisable par les concepteurs.",
          "tradeoff": "Les arbitrages de surface restent ouverts.",
          "validation": "Chaque exigence doit être confirmée par le maître d’ouvrage."
        },
        {
          "title": "Définir un socle et des options",
          "proposal": "Séparer les qualités indispensables des options d’ambiance et de personnalisation.",
          "benefit": "Permet d’arbitrer sans perdre l’essentiel.",
          "tradeoff": "Certaines options peuvent être reportées.",
          "validation": "Ne pas classer un besoin de sécurité comme option de confort."
        },
        {
          "title": "Programme évolutif à scénarios",
          "proposal": "Décrire une situation de départ et une évolution, avec les intentions à préserver dans les deux cas.",
          "benefit": "Protège l’adaptabilité des usages.",
          "tradeoff": "Nécessite une réserve de conception.",
          "validation": "Ne pas transformer l’évolution souhaitée en surface autorisée."
        }
      ],
      "transmitsTo": [
        7,
        8,
        9,
        10
      ]
    },
    {
      "number": 7,
      "title": "Préprogramme fonctionnel",
      "phase": "Programmer",
      "key": "programme",
      "scope": "Répartition et relations fonctionnelles",
      "goal": "Proposer des allocations et regroupements du programme, distincts des surfaces dessinées.",
      "inputs": "Fiches d’espaces, capacités, surfaces cibles, adjacences et choix du PMO.",
      "deliverable": "Variante de Répartition argumentée, applicable seulement après arbitrage.",
      "method": "Gradation actif/calme, proximité d’usage et transitions ; le secteur symbolique ne dicte pas seul un local.",
      "topic": "Répartition du bâtiment",
      "harmonieOptions": [
        {
          "title": "Regroupement par intensité d’usage",
          "proposal": "Regrouper les activités fréquentes et l’accueil près des circulations identifiables ; préserver les fonctions de concentration et de retrait des traversées.",
          "benefit": "Hiérarchie fonctionnelle lisible.",
          "tradeoff": "Peut limiter certaines mutualisations.",
          "validation": "Comparer les cibles aux besoins et aux possibilités du site."
        },
        {
          "title": "Renforcer les supports sans augmenter le total",
          "proposal": "Tester un transfert limité de surface des fonctions principales vers une transition ou un support réellement nécessaire.",
          "benefit": "Met en évidence le coût surfacique d’un meilleur usage.",
          "tradeoff": "Réduit une capacité ou une surface principale.",
          "validation": "Les donneurs et bénéficiaires doivent être nommés ; aucun transfert implicite."
        },
        {
          "title": "Mutualisation maîtrisée",
          "proposal": "Partager les espaces compatibles et reporter la surface libérée vers un espace de retrait ou un besoin insuffisamment couvert.",
          "benefit": "Favorise l’adaptabilité.",
          "tradeoff": "Dépend des horaires et du fonctionnement.",
          "validation": "Conserver les circulations et supports indispensables ; vérifier les simultanéités."
        }
      ],
      "transmitsTo": [
        8,
        9,
        10,
        11,
        12
      ]
    },
    {
      "number": 8,
      "title": "Exigences techniques & environnementales",
      "phase": "Programmer",
      "key": "requirements",
      "scope": "Qualités techniques à concevoir",
      "goal": "Proposer des dispositifs de lumière, d’acoustique, de ventilation et de protection à instruire.",
      "inputs": "Programme, orientations documentées, activités et objectifs techniques.",
      "deliverable": "Solutions à dimensionner et critères de contrôle.",
      "method": "Équilibre d’ambiance subordonné aux performances techniques documentées.",
      "topic": "Réponses techniques",
      "harmonieOptions": [
        {
          "title": "Protections et transitions passives",
          "proposal": "Étudier protections solaires, seuils et transitions acoustiques en priorité, puis compléter par les équipements nécessaires.",
          "benefit": "Peut traiter les causes spatiales d’un inconfort.",
          "tradeoff": "Effets à démontrer par étude.",
          "validation": "Aucune performance acoustique ou thermique déduite du schéma."
        },
        {
          "title": "Dispositifs réglables par usage",
          "proposal": "Proposer éclairage différencié, occultation et traitement acoustique ajustables aux activités.",
          "benefit": "S’adapte aux variations d’usage.",
          "tradeoff": "Entretien et pilotage à prévoir.",
          "validation": "Les valeurs de dimensionnement viennent des études spécialisées."
        },
        {
          "title": "Enveloppe et équipements dédiés",
          "proposal": "Isoler les activités les plus exigeantes et prévoir une réponse spécifique plutôt qu’un traitement identique partout.",
          "benefit": "Cible les besoins critiques.",
          "tradeoff": "Coût et flexibilité à comparer.",
          "validation": "Vérifier réseaux, exploitation et contraintes de sécurité."
        }
      ],
      "transmitsTo": [
        10,
        11,
        13,
        16
      ]
    },
    {
      "number": 9,
      "title": "Compatibilité Parcelle ↔ Programme",
      "phase": "Concevoir / Tester",
      "key": "compatibility",
      "scope": "Site ↔ programme",
      "goal": "Proposer les compromis entre le terrain disponible et les besoins, sans confondre les deux répartitions.",
      "inputs": "Schéma du site, contraintes, programme et surfaces cibles.",
      "deliverable": "Scénario de compatibilité et ajustements proposés.",
      "method": "Conserver les qualités d’arrivée, d’appui et d’ouverture lors de l’adaptation au programme.",
      "topic": "Compromis site / usages",
      "harmonieOptions": [
        {
          "title": "Préserver les qualités extérieures prioritaires",
          "proposal": "Conserver l’espace d’arrivée et le retrait extérieur retenus ; ajuster le regroupement des fonctions pour les respecter.",
          "benefit": "Maintient le lien avec la décision initiale du site.",
          "tradeoff": "Peut contraindre la capacité recherchée.",
          "validation": "Comparer capacité et constructibilité sans redimensionnement automatique."
        },
        {
          "title": "Rééquilibrer terrain et programme",
          "proposal": "Comparer une autre organisation du site conservant la même intention, avec un programme regroupé autrement.",
          "benefit": "Évite de figer une première esquisse de site.",
          "tradeoff": "Nécessite de rouvrir certains arbitrages.",
          "validation": "Historiser la variante remplacée et vérifier les accès."
        },
        {
          "title": "Réduire ou phaser le programme",
          "proposal": "Proposer un programme réduit ou un phasage lorsque les besoins dépassent les possibilités documentées.",
          "benefit": "Rend les limites explicites.",
          "tradeoff": "Peut modifier la stratégie d’exploitation.",
          "validation": "Le maître d’ouvrage doit accepter la capacité révisée."
        }
      ],
      "transmitsTo": [
        10,
        11,
        12,
        13
      ]
    },
    {
      "number": 10,
      "title": "Étude de capacité architecturale",
      "phase": "Concevoir / Tester",
      "key": "architecture",
      "scope": "Bâtiment dessiné",
      "goal": "Proposer des améliorations localisées sur le modèle existant, sans le modifier à l’insu du concepteur.",
      "inputs": "Implantation, niveaux, accès, ouvertures, zones et objets de l’Atelier.",
      "deliverable": "Propositions liées à des objets et bilan de conception du modèle courant.",
      "method": "Forme, entrée, positions d’usage ; Ba Zhai et Xuan Kong uniquement avec des références suffisantes, jamais comme certification.",
      "topic": "Parti architectural",
      "harmonieOptions": [
        {
          "title": "Corriger le seuil et les transitions",
          "proposal": "Tester les changements localisés d’accueil, de passage et de rapport à l’extérieur avant d’envisager une redistribution générale.",
          "benefit": "Limite les modifications du modèle.",
          "tradeoff": "Peut ne pas résoudre un problème plus structurel.",
          "validation": "Accès, visibilité, gabarits et évacuation restent à vérifier."
        },
        {
          "title": "Recomposer la distribution",
          "proposal": "Comparer une organisation séparant plus nettement les secteurs actifs, calmes et techniques, en conservant les contraintes du modèle.",
          "benefit": "Traite les conflits d’usage à leur origine.",
          "tradeoff": "Impact plus important sur surfaces et réseaux.",
          "validation": "Aucun déplacement de noyau, poteau ou dalle sans étude."
        },
        {
          "title": "Ajuster les usages dans la géométrie existante",
          "proposal": "Réduire une densité excessive ou réaffecter certains usages, sans changer l’enveloppe ni les appuis.",
          "benefit": "Préserve la géométrie et les éléments structuraux.",
          "tradeoff": "Capacité ou exploitation à réarbitrer.",
          "validation": "La capacité nouvelle doit être inscrite au programme puis testée sur plan."
        }
      ],
      "transmitsTo": [
        11,
        12,
        13,
        16,
        18
      ]
    },
    {
      "number": 11,
      "title": "Esquisse architecturale — Esquisser",
      "phase": "Concevoir / Tester",
      "key": "drawings",
      "scope": "Plans, coupes et façades",
      "goal": "Traduire les intentions retenues en dessins contrôlables.",
      "inputs": "Même modèle que l’Atelier, propositions localisées et exigences retenues.",
      "deliverable": "Plans annotés, points de coupe et réserves de façade.",
      "method": "Le dessin apporte une preuve géométrique, pas une validation énergétique ou réglementaire universelle.",
      "topic": "Traduction graphique",
      "harmonieOptions": [
        {
          "title": "Vérifier la séquence d’arrivée sur plan",
          "proposal": "Annoter la relation voie → limite → accès → accueil sur le plan de masse et le RDC.",
          "benefit": "Relie intention du site et bâtiment dessiné.",
          "tradeoff": "La voie extérieure peut rester non relevée.",
          "validation": "Différencier tracé existant, projeté et hypothétique."
        },
        {
          "title": "Documenter les transitions en coupe",
          "proposal": "Placer les coupes aux changements de niveau, doubles hauteurs et interfaces entre activités.",
          "benefit": "Met en évidence hauteur, lumière et relation visuelle.",
          "tradeoff": "N’établit pas seul l’acoustique ni la stabilité.",
          "validation": "Coter les éléments nécessaires et conserver les réserves techniques."
        },
        {
          "title": "Comparer les façades selon les usages",
          "proposal": "Proposer les protections et vues recherchées face aux usages réels, plutôt qu’une ouverture uniforme.",
          "benefit": "Lie composition et programme.",
          "tradeoff": "Peut modifier l’expression architecturale.",
          "validation": "Vérifier apports, masques, entretien et performances par étude."
        }
      ],
      "transmitsTo": [
        12,
        13,
        16,
        18
      ]
    },
    {
      "number": 12,
      "title": "Scénarios de développement",
      "phase": "Concevoir / Tester",
      "key": "scenarios",
      "scope": "Variantes de développement",
      "goal": "Comparer des partis cohérents complets, à service rendu explicite.",
      "inputs": "Programme, variantes spatiales, capacités, contraintes et choix déjà retenus.",
      "deliverable": "Scénario privilégié et alternative.",
      "method": "Comparer intentions et conséquences, sans attribuer de score énergétique arbitraire.",
      "topic": "Variante à poursuivre",
      "harmonieOptions": [
        {
          "title": "Conserver le socle, corriger les interfaces",
          "proposal": "Maintenir la capacité de référence et concentrer les améliorations sur les interfaces problématiques.",
          "benefit": "Périmètre de modification limité.",
          "tradeoff": "Certaines limites peuvent rester.",
          "validation": "Lister les réserves non résolues."
        },
        {
          "title": "Confort d’usage prioritaire",
          "proposal": "Comparer un scénario accordant davantage de place au retrait, à l’attente et aux transitions.",
          "benefit": "Rend les qualités recherchées explicites.",
          "tradeoff": "Surface principale ou budget peuvent diminuer.",
          "validation": "Comparer à capacité et budget clairement indiqués."
        },
        {
          "title": "Adaptabilité prioritaire",
          "proposal": "Privilégier des espaces reconfigurables et des interventions réversibles.",
          "benefit": "Permet plusieurs usages successifs.",
          "tradeoff": "Certaines performances nécessitent des dispositifs complémentaires.",
          "validation": "Vérifier exploitation, rangement et réseaux."
        }
      ],
      "transmitsTo": [
        13,
        14,
        15,
        17,
        19
      ]
    },
    {
      "number": 13,
      "title": "Faisabilité technique",
      "phase": "Prouver la faisabilité",
      "key": "technical",
      "scope": "Faisabilité des solutions",
      "goal": "Remplacer les propositions non démontrées par des variantes réalisables.",
      "inputs": "Modèle, réserves de spécialistes, structure, accès, sol et réseaux.",
      "deliverable": "Solutions à dimensionner avec responsables.",
      "method": "Une correction symbolique ne remplace pas une solution constructive.",
      "topic": "Réponse aux réserves techniques",
      "harmonieOptions": [
        {
          "title": "Conserver l’intention par un dispositif simple",
          "proposal": "Rechercher une réponse constructive directe pour le seuil, la protection ou la séparation demandée.",
          "benefit": "Favorise la lisibilité et la maintenance.",
          "tradeoff": "Peut modifier l’esthétique envisagée.",
          "validation": "Dimensionnement et validation par les spécialistes concernés."
        },
        {
          "title": "Déplacer l’usage plutôt que l’ouvrage",
          "proposal": "Comparer une réaffectation lorsque déplacer un noyau, une structure ou un réseau est disproportionné.",
          "benefit": "Peut éviter une intervention lourde.",
          "tradeoff": "Programme et flux à reprendre.",
          "validation": "Valider la compatibilité du nouvel usage."
        },
        {
          "title": "Suspendre le dispositif incertain",
          "proposal": "Conserver une solution de repli tant que sol, autorisation ou performance restent indéterminés.",
          "benefit": "Évite une validation prématurée.",
          "tradeoff": "Une décision demeure ouverte.",
          "validation": "Identifier les études et la condition de levée de réserve."
        }
      ],
      "transmitsTo": [
        14,
        15,
        16,
        19
      ]
    },
    {
      "number": 14,
      "title": "Faisabilité économique & financière",
      "phase": "Prouver la faisabilité",
      "key": "finance",
      "scope": "Arbitrage d’investissement",
      "goal": "Comparer le coût des réponses proposées sans chiffrage fictif ni promesse de rendement.",
      "inputs": "Solutions retenues, devis, budget et postes renseignés.",
      "deliverable": "Priorisation à chiffrer et solution alternative.",
      "method": "La dimension Harmonie éclaire la qualité d’usage ; elle ne prédit pas les recettes.",
      "topic": "Priorité d’investissement",
      "harmonieOptions": [
        {
          "title": "Financer d’abord les décisions difficiles à reprendre",
          "proposal": "Prioriser implantation, accès et interfaces avant les finitions remplaçables.",
          "benefit": "Protège les décisions structurantes.",
          "tradeoff": "Finitions ou équipements peuvent être différés.",
          "validation": "Aucun montant inventé ; devis et faisabilité nécessaires."
        },
        {
          "title": "Comparer deux solutions au même service",
          "proposal": "Demander le coût de deux dispositifs répondant à la même intention d’usage.",
          "benefit": "Évite la comparaison d’options non équivalentes.",
          "tradeoff": "Demande un cahier de comparaison précis.",
          "validation": "Inclure équipements, travaux induits et études."
        },
        {
          "title": "Phaser les aménagements réversibles",
          "proposal": "Reporter les options pouvant évoluer sans compromettre l’usage de départ.",
          "benefit": "Permet de distinguer socle et options.",
          "tradeoff": "Travaux ultérieurs et perturbations à prévoir.",
          "validation": "Aucun besoin obligatoire ne peut être reporté comme décoration."
        }
      ],
      "transmitsTo": [
        15,
        17,
        19
      ]
    },
    {
      "number": 15,
      "title": "Coût global & sensibilités",
      "phase": "Prouver la faisabilité",
      "key": "lifecycle",
      "scope": "Coût global et exploitation",
      "goal": "Proposer des solutions dont l’usage et l’entretien restent soutenables.",
      "inputs": "Dispositifs envisagés, maintenance, exploitation et scénarios de durée de vie.",
      "deliverable": "Choix de pérennité et conditions d’exploitation.",
      "method": "Privilégier un équilibre réellement exploitable, pas une mise en scène impossible à entretenir.",
      "topic": "Pérennité de l’aménagement",
      "harmonieOptions": [
        {
          "title": "Matériaux et dispositifs sobres",
          "proposal": "Comparer des finitions durables et des protections simples répondant à l’ambiance recherchée.",
          "benefit": "Peut faciliter entretien et remplacement.",
          "tradeoff": "Choix esthétique moins spécifique.",
          "validation": "Coûts de cycle de vie à documenter."
        },
        {
          "title": "Dispositifs ajustables et remplaçables",
          "proposal": "Prévoir les réglages et remplacements à faible impact sur l’activité.",
          "benefit": "Favorise l’évolution des usages.",
          "tradeoff": "Nécessite pièces, procédures et accès de maintenance.",
          "validation": "Vérifier disponibilité et coût d’entretien."
        },
        {
          "title": "Gestion d’usage explicitée",
          "proposal": "Associer aux aménagements un protocole d’exploitation : horaires, rangement et réglages.",
          "benefit": "Rend le bénéfice d’usage plus crédible.",
          "tradeoff": "Dépend de l’équipe d’exploitation.",
          "validation": "Désigner les responsables et éviter les promesses non testées."
        }
      ],
      "transmitsTo": [
        17,
        19,
        20,
        21
      ]
    },
    {
      "number": 16,
      "title": "Vérifications / Due diligence",
      "phase": "Prouver la faisabilité",
      "key": "checks",
      "scope": "Réserves et corrections",
      "goal": "Proposer une correction pour chaque réserve pertinente, pas seulement la signaler.",
      "inputs": "Constats, preuves, données manquantes et avis des intervenants.",
      "deliverable": "Correction proposée, alternative et condition de validation.",
      "method": "Les vérifications techniques et la lecture traditionnelle restent distinctes.",
      "topic": "Levée de réserves",
      "harmonieOptions": [
        {
          "title": "Corriger à la source",
          "proposal": "Reprendre la décision spatiale à l’origine du conflit et documenter les conséquences sur le programme.",
          "benefit": "Traite le problème plutôt que son apparence.",
          "tradeoff": "Peut rouvrir plusieurs choix.",
          "validation": "Avis du responsable et contrôle après correction."
        },
        {
          "title": "Tester une alternative localisée",
          "proposal": "Faire un essai de mobilier, une maquette ou un détail avant de modifier tout l’ensemble.",
          "benefit": "Permet un retour concret.",
          "tradeoff": "Essai parfois non représentatif de toutes les situations.",
          "validation": "Décrire conditions et limites de l’essai."
        },
        {
          "title": "Conserver une réserve avec condition explicite",
          "proposal": "Lorsque la donnée manque, proposer l’étude ou le test décisif et une solution de repli.",
          "benefit": "Empêche un avis favorable par défaut.",
          "tradeoff": "Ne clôt pas la réserve.",
          "validation": "Ne pas masquer un blocage de sécurité ou d’autorisation."
        }
      ],
      "transmitsTo": [
        17,
        18,
        19
      ]
    },
    {
      "number": 17,
      "title": "Évaluation multicritère",
      "phase": "Arbitrer",
      "key": "evaluation",
      "scope": "Comparaison argumentée",
      "goal": "Proposer un arbitrage clair entre bénéfices, contraintes et incertitudes.",
      "inputs": "Scénarios, preuves, coûts et réserves.",
      "deliverable": "Option argumentée et points restant à décider.",
      "method": "Pas de note universelle de Qi ; données inconnues distinctes des avis défavorables.",
      "topic": "Arbitrage de qualité d’usage",
      "harmonieOptions": [
        {
          "title": "Retenir le scénario le mieux étayé",
          "proposal": "Privilégier la solution répondant aux besoins documentés avec les réserves les plus explicitement traitées.",
          "benefit": "Fonde le choix sur des éléments traçables.",
          "tradeoff": "Peut différer d’une préférence esthétique initiale.",
          "validation": "Aucun blocage obligatoire ne peut être compensé par une moyenne."
        },
        {
          "title": "Combiner les solutions compatibles",
          "proposal": "Assembler les qualités de variantes distinctes seulement si leur compatibilité est démontrée.",
          "benefit": "Permet un compromis ciblé.",
          "tradeoff": "Une combinaison constitue un scénario à revoir.",
          "validation": "Recalculer les conséquences de la combinaison."
        },
        {
          "title": "Demander un essai ciblé avant arbitrage",
          "proposal": "Identifier la donnée ou l’essai qui départagera les variantes.",
          "benefit": "Évite un choix fondé sur une précision fictive.",
          "tradeoff": "Retarde la clôture de l’arbitrage.",
          "validation": "Définir résultat attendu et responsable."
        }
      ],
      "transmitsTo": [
        18,
        19
      ]
    },
    {
      "number": 18,
      "title": "Bilan du potentiel de la parcelle",
      "phase": "Arbitrer",
      "key": "synthesis",
      "scope": "Bilan du projet",
      "goal": "Restituer les propositions retenues, réalisées et encore ouvertes dans leur ordre de décision.",
      "inputs": "Historique par étape, programme et modèle courant.",
      "deliverable": "Synthèse exportable, sans nouvelle étape Harmony.",
      "method": "Le bilan résulte du parcours ; une intention retenue n’est pas une réalisation vérifiée.",
      "topic": "Contenu du bilan",
      "harmonieOptions": [
        {
          "title": "Synthèse des décisions et preuves",
          "proposal": "Organiser le bilan par étape d’origine et état de traduction dans le projet.",
          "benefit": "Lisibilité pour la décision.",
          "tradeoff": "Nécessite des liaisons à jour.",
          "validation": "Afficher les divergences entre intention, programme et dessin."
        },
        {
          "title": "Synthèse centrée sur les écarts",
          "proposal": "Présenter d’abord les choix non traduits, les réserves et les actions nécessaires.",
          "benefit": "Concentre la revue sur les décisions ouvertes.",
          "tradeoff": "Moins de place pour le récit de conception.",
          "validation": "Conserver l’accès aux choix favorables et à leurs preuves."
        },
        {
          "title": "Comparatif de variantes",
          "proposal": "Conserver un tableau des solutions étudiées et des motifs d’abandon.",
          "benefit": "Préserve la logique du projet.",
          "tradeoff": "Rapport plus long.",
          "validation": "Ne pas mélanger les données de variantes distinctes."
        }
      ],
      "transmitsTo": [
        19,
        20,
        21
      ]
    },
    {
      "number": 19,
      "title": "Décision — GO / GO sous conditions / À reprendre / NO GO",
      "phase": "Arbitrer",
      "key": "decision",
      "scope": "Décision du maître d’ouvrage",
      "goal": "Proposer les conditions de poursuite ; laisser la décision globale au maître d’ouvrage.",
      "inputs": "Bilan, avis obligatoires, faisabilités et réserves.",
      "deliverable": "Conditions proposées et solutions de repli.",
      "method": "Aucun GO automatique fondé sur une appréciation Feng Shui.",
      "topic": "Conditions de poursuite",
      "harmonieOptions": [
        {
          "title": "Poursuite conditionnée aux réserves nommées",
          "proposal": "Proposer les études et arbitrages à clore avant de figer la conception.",
          "benefit": "Rend la poursuite explicite.",
          "tradeoff": "Le projet reste conditionnel.",
          "validation": "La décision GO reste une action distincte du maître d’ouvrage."
        },
        {
          "title": "Reprise ciblée du scénario",
          "proposal": "Proposer de rouvrir seulement les étapes ayant produit les incompatibilités majeures.",
          "benefit": "Évite une remise à zéro générale.",
          "tradeoff": "Certaines décisions aval devront être revues.",
          "validation": "Identifier les dépendances concernées."
        },
        {
          "title": "Conserver le scénario en attente",
          "proposal": "Préserver les travaux déjà réalisés et préciser ce qui manque pour statuer.",
          "benefit": "Évite de transformer une incertitude en validation.",
          "tradeoff": "Ne lance pas les études suivantes.",
          "validation": "Aucune action Harmonie ne doit forcer le GO."
        }
      ],
      "transmitsTo": [
        20,
        21
      ]
    },
    {
      "number": 20,
      "title": "Organisation des études — uniquement si GO",
      "phase": "Engager",
      "key": "studies",
      "scope": "Organisation des études",
      "goal": "Traduire les intentions retenues en missions et livrables, après décision favorable.",
      "inputs": "Décision effective, conditions, propositions et responsables.",
      "deliverable": "Brief de mission et jalons de revue.",
      "method": "Séparer conseil traditionnel, conception architecturale et validation spécialisée.",
      "topic": "Missions à engager",
      "harmonieOptions": [
        {
          "title": "Mission intégrée par intentions",
          "proposal": "Confier aux concepteurs une fiche de mission reliant chaque intention aux dessins et études attendus.",
          "benefit": "Clarifie les responsabilités.",
          "tradeoff": "Coordination nécessaire entre disciplines.",
          "validation": "À engager uniquement selon la décision du maître d’ouvrage."
        },
        {
          "title": "Revue ciblée des points sensibles",
          "proposal": "Prioriser les missions nécessaires pour l’accès, la lumière, l’acoustique ou les interfaces non résolues.",
          "benefit": "Concentre l’effort sur les incertitudes.",
          "tradeoff": "Ne remplace pas les études obligatoires.",
          "validation": "Préciser objet, source et livrable de chaque revue."
        },
        {
          "title": "Prototypes et retours utilisateurs",
          "proposal": "Organiser des essais pour les positions d’usage et les ambiances encore incertaines.",
          "benefit": "Relie conception et expérience d’usage.",
          "tradeoff": "Coût et représentativité des essais.",
          "validation": "Ne pas présenter un essai comme certification générale."
        }
      ],
      "transmitsTo": [
        21
      ]
    },
    {
      "number": 21,
      "title": "Transfert vers développement / conception",
      "phase": "Engager",
      "key": "handover",
      "scope": "Transfert et conception détaillée",
      "goal": "Transmettre un dossier d’intentions exploitable et préparer l’aménagement, sans le déclarer déjà réalisé.",
      "inputs": "Choix retenus, versions des dessins, actions, preuves et responsabilités.",
      "deliverable": "Dossier de transmission et briefs d’aménagement par usage.",
      "method": "Cinq Éléments et Yin–Yang comme cadre de composition contemporaine, subordonné aux usages et contraintes.",
      "topic": "Continuité vers l’aménagement",
      "harmonieOptions": [
        {
          "title": "Dossier d’intentions lié au modèle",
          "proposal": "Transmettre les propositions retenues avec les références des espaces et les actions restant à dessiner ou vérifier.",
          "benefit": "Conserve la continuité du projet.",
          "tradeoff": "Le destinataire doit disposer des versions correctes.",
          "validation": "Ne pas confondre transmission et validation finale."
        },
        {
          "title": "Brief d’ambiance par usage",
          "proposal": "Préparer les intentions de matériaux, lumière, textures et acoustique des espaces désormais définis.",
          "benefit": "Relie l’ambiance à la fonction réelle.",
          "tradeoff": "Échantillons et prescriptions restent à choisir.",
          "validation": "Pas d’objets symboliques imposés ni d’équilibre des éléments à parts égales."
        },
        {
          "title": "Revue après mise en usage",
          "proposal": "Prévoir un retour sur orientation, repérage, confort perçu et fonctionnement, puis des ajustements réversibles.",
          "benefit": "Permet de corriger selon l’usage constaté.",
          "tradeoff": "Ne peut être réalisée avant occupation.",
          "validation": "Les observations futures restent non renseignées."
        }
      ],
      "transmitsTo": []
    }
  ]
}
`,wm=`{
  "id": "p118-exemple-complet",
  "kind": "exemple-complet",
  "sourceId": "EXEMPLE-P118-V819-RESOLU",
  "sourceVersion": "8.19.0",
  "name": "P.118 — Escalier B et mezzanine",
  "summary": "Cas pédagogique complet : 21 étapes du Parcours illustrées de bout en bout sur un projet-exemple (formation & bureaux, escalier B et mezzanine).",
  "mode": "exemple pédagogique — aucune autorisation réelle",
  "date": "2026-09-30",
  "reviewDate": "2026-10-26",
  "source": "V8.18 modifiée selon RezRDC2.png et Mezzanine.png ; modes V8.13 conservés.",
  "criteria": [
    "Préserver le contour S01 et l’emprise dessinée de 673 m².",
    "Séparer l’arrivée du public, le travail concentré et la desserte technique.",
    "Diminuer les densités avant de demander des surfaces supplémentaires.",
    "Préférer les solutions réversibles et les exigences mesurables.",
    "Autoriser seulement les études tant que les réserves critiques subsistent."
  ],
  "facts": {
    "parcelArea": 1345.5475500009647,
    "officialArea": 1346,
    "footprint": 673.0000000000751,
    "setbackArea": 689.2327627759523,
    "setbacks": [
      5.147740927449004,
      5.147740927453261,
      5.147740927396454,
      5.147740927463421
    ],
    "inside": true,
    "insideSetback": true,
    "gross": 3743.7628415718177,
    "net": 3558.9570550836943,
    "roomArea": 2932.2573458814772,
    "roomCount": 74,
    "height": 16.599999999999998
  },
  "assumptions": [
    {
      "id": "H-CONTEXTE",
      "title": "Contexte cartographique de travail",
      "value": "Scénario A : approche latérale ouverte, arrière protégé par un filtre paysager projeté. Scénario B : voisin hypothétique de 12 m à 10 m pour l’étude des masques. Aucun de ces scénarios ne décrit une observation MapTiler réelle.",
      "stages": "01–03",
      "status": "Hypothèse / réponse de scénario — pas une preuve de terrain"
    },
    {
      "id": "H-ACCES",
      "title": "Approche du site",
      "value": "Côté B.265–B.266 retenu pour la démonstration ; pas de droit d’accès prétendu acquis. Organisation du terrain distincte des locaux.",
      "stages": "01–02",
      "status": "Hypothèse / réponse de scénario — pas une preuve de terrain"
    },
    {
      "id": "H-TOPO",
      "title": "Relief / eau / sol",
      "value": "Plan de sol horizontal pour le schéma ; aucune altitude réelle, pente, pollution, nappe ou absence de risque déduite. Choix arrêté : diagnostics avant travaux.",
      "stages": "01,13,16",
      "status": "Hypothèse / réponse de scénario — pas une preuve de terrain"
    },
    {
      "id": "H-USAGE",
      "title": "Capacité / simultanéité",
      "value": "60 apprenants + 84 utilisateurs de postes de travail + 16 visiteurs + 4 agents de service = 164 personnes en pointe ; situation courante : 40 + 60 + 8 + 2 = 110. Les salles de réunion et de pause accueillent ces mêmes groupes et ne sont pas ajoutées à l’effectif.",
      "stages": "05–11",
      "status": "Hypothèse / réponse de scénario — pas une preuve de terrain"
    },
    {
      "id": "H-DENSITE",
      "title": "Jauges cibles",
      "value": "M01 10 postes ; E02/R2 30 ; E03/R2 20. Ratio interne indicatif ≥ 6 m²/poste pour ces zones. Pas de seuil légal ; mobilier source non redessiné.",
      "stages": "07–11",
      "status": "Hypothèse / réponse de scénario — pas une preuve de terrain"
    },
    {
      "id": "H-HAUTEURS",
      "title": "Coupe du bâtiment",
      "value": "Modèle 16,60 m hors sol et 3,20/3,40 m étage à étage ; incohérence avec 3,50 m libres cités au dossier. Réponse : mission de coupe, possible neutralisation de la mezzanine. Aucune conformité supposée.",
      "stages": "08–21",
      "status": "Hypothèse / réponse de scénario — pas une preuve de terrain"
    },
    {
      "id": "H-MOBILITE",
      "title": "Stationnement de programme",
      "value": "12 autos (dont 2 adaptées à vérifier) + 20 vélos comme test ; aucun stationnement compté comme dessiné ou autorisé.",
      "stages": "02,06,13",
      "status": "Hypothèse / réponse de scénario — pas une preuve de terrain"
    },
    {
      "id": "H-AMBIANCE",
      "title": "Cibles d’étude",
      "value": "Lumière 500/300/150 lux selon usages ; acoustique ciblée, surfaces mates, accès libres. Cibles pédagogiques non réglementaires ni mesurées.",
      "stages": "08,10,21",
      "status": "Hypothèse / réponse de scénario — pas une preuve de terrain"
    },
    {
      "id": "H-COMPASS",
      "title": "Lecture directionnelle",
      "value": "Azimut de façade de travail ≈ 123,866° géographique depuis le modèle, non boussole. Déclinaison non utilisée ; pas de calcul Ba Zhai décisionnel dans ce cas collectif.",
      "stages": "10–11",
      "status": "Hypothèse / réponse de scénario — pas une preuve de terrain"
    },
    {
      "id": "H-TEMPS",
      "title": "Période / personnalisation",
      "value": "Occupation de scénario septembre 2028 ; aucune date réelle. Carte natale Xuan Kong non établie : volontairement non utilisée pour choisir les espaces. Aucune date de naissance personnelle nécessaire pour cet exemple collectif.",
      "stages": "10–11,21",
      "status": "Hypothèse / réponse de scénario — pas une preuve de terrain"
    },
    {
      "id": "H-FINANCE",
      "title": "Montants / recettes",
      "value": "24 M MAD d’investissement, recettes 3,60 M/an et OPEX 1,40 M/an : nombres fictifs pour démontrer les calculs. Aucun prix de marché, devis ou accord de financement.",
      "stages": "14–19",
      "status": "Hypothèse / réponse de scénario — pas une preuve de terrain"
    },
    {
      "id": "H-MISSION",
      "title": "Décision et calendrier",
      "value": "GO fictif pour études seulement ; 0,60 M inclus dans 1,60 M d’honoraires ; aucune signature. Dates de démonstration J1 26/10, J2 23/11, J3 21/12/2026.",
      "stages": "19–21",
      "status": "Hypothèse / réponse de scénario — pas une preuve de terrain"
    },
    {
      "id": "H-SANITAIRES-V817",
      "title": "Sanitaires redessinés",
      "value": "Scénario de pointe conservé à 164 personnes. Répartition H/F 50/50 choisie uniquement pour cette étude, à confirmer. Réunions, pauses et locaux support ne créent pas d’effectif supplémentaire ; les 4 agents alternent avec le sous-sol, les 4 formateurs sont retirés du R+3 pendant leur présence au R+1. Variante retenue : blocs H/F arrière superposés. RDC, R+1 et R+2 : deux WC par bloc, dont un adapté. Mezzanine et R+3 : une cabine adaptée par bloc et un espace de lavage séparé. Un urinoir par bloc H, protégé par un écran. L’option consistant à conserver deux pièces identiques partout est écartée pour différencier fréquentation, lavage et intimité.",
      "status": "Sanitaires redessinés — étude coordonnée, conformité globale non évaluée"
    },
    {
      "id": "H-ESC-A-V818",
      "title": "Escalier A autour de l’ascenseur",
      "value": "Escalier A tournant sur trois côtés de l’ascenseur recentré : montée à gauche, traversée arrière, arrivée à droite, suivant les flèches rouges. Deux paliers de rotation. La porte de l’ascenseur donne sur le palier d’étage avant. Les altitudes de V8.17 sont conservées : −3,20 / 0 / 3,20 / 6,40 / 9,80 / 13,20 m. Les conflits avec les anciens briefs restent ouverts.",
      "status": "Étude architecturale ; structure, sécurité incendie et conformité globale non évaluées"
    },
    {
      "id": "H-IMPLANTATION-V819",
      "title": "Escalier B et mezzanine",
      "value": "Escalier B bas déplacé à gauche du hall, dans la zone rouge. Mezzanine prolongée jusqu’au trait bleu par une galerie transversale, avec retour vers la galerie existante. Porte P-X sur la séparation hall / desserte principale. Liaisons SS → RDC → mezzanine déplacées ensemble. Les volées B mezzanine → étages restent à leur emplacement initial à droite ; la nouvelle galerie les relie. L’escalier A autour de l’ascenseur, les sanitaires et le monte-charge sont conservés.",
      "status": "Modification architecturale d’étude ; structure, évacuation et accessibilité complète à valider"
    }
  ],
  "steps": {
    "1": {
      "stage": 1,
      "title": "Parcelle / Site existant",
      "choice": "A",
      "headline": "Accueil extérieur lisible et service latéral",
      "decision": "Conserver une arrivée dégagée côté B.265–B.266 ; protéger un espace extérieur de pause ; étudier une desserte latérale séparée. Le schéma porte uniquement sur le terrain.",
      "why": "La forme S01 et les accès pressentis appellent une organisation lisible sans inventer les voisins.",
      "alternatives": "Un jardin prioritaire réduisant excessivement l’implantation ou des accès supplémentaires non acquis ne sont pas retenus.",
      "owner": "Maître d’ouvrage / programmiste — rôles de démonstration",
      "proof": "Fiche de décision EX-P118-01 ; démonstration sur données du modèle et hypothèses, non avis signé.",
      "result": {
        "donnee": "P.118 — El Mansouria ; B.266 → B.267 → B.268 → B.265 ; contenance 1 346 m² ; aire calculée 1 345,55 m².",
        "hypothese": "Accès étudié sur B.265–B.266 ; accueil dégagé, espace ouvert protégé et desserte latérale. Organisation du terrain seulement, sans distribution des bureaux. Le fond MapTiler est facultatif pour lire le cas ; scénario de contexte explicitement renseigné.",
        "raw": null
      },
      "sourceStatus": "Données du fichier + hypothèses explicites. Aucun relevé terrain, avis officiel ou engagement réel simulé."
    },
    "2": {
      "stage": 2,
      "title": "Réglementation & constructibilité",
      "choice": "A",
      "headline": "Préserver l’intention dans l’enveloppe admissible",
      "decision": "Conserver l’emprise de travail 673 m², contrôler l’accès et conditionner tout ouvrage dans le recul. Les hauteurs et la rampe restent des réserves critiques.",
      "why": "La surface ne suffit pas à conclure à la constructibilité : le choix préserve l’intention sans promettre une dérogation.",
      "alternatives": "Ni augmentation du droit à construire ni suppression de réserve pour simplifier la démonstration.",
      "owner": "Maître d’ouvrage / programmiste — rôles de démonstration",
      "proof": "Fiche de décision EX-P118-02 ; démonstration sur données du modèle et hypothèses, non avis signé.",
      "result": {
        "donnee": null,
        "hypothese": "Retenir l’implantation de 673 m² comme base des études, non comme droit acquis. Poursuite limitée aux études ; hauteurs et rampe sont deux conditions bloquantes avant chantier.",
        "raw": null
      },
      "sourceStatus": "Données du fichier + hypothèses explicites. Aucun relevé terrain, avis officiel ou engagement réel simulé."
    },
    "3": {
      "stage": 3,
      "title": "Marché & demande",
      "choice": "A",
      "headline": "Un accueil identifiable pour la formation et les bureaux",
      "decision": "Retenir la clientèle adulte formation/PME et une promesse d’usage simple : se repérer, travailler au calme et partager les supports compatibles. Recettes explicitement fictives.",
      "why": "Le positionnement illustre le raisonnement sans simuler une enquête de marché.",
      "alternatives": "Ni prédiction de prospérité Feng Shui ni comparable immobilier inventé.",
      "owner": "Maître d’ouvrage / programmiste — rôles de démonstration",
      "proof": "Fiche de décision EX-P118-03 ; démonstration sur données du modèle et hypothèses, non avis signé.",
      "result": {
        "donnee": null,
        "hypothese": "Choix arrêté pour montrer la démarche. Avant décision de construire : enquête auprès de trois opérateurs de formation et cinq entreprises, puis test des recettes au jalon J1 ; en cas d’insuffisance, réduire l’équipement initial.",
        "raw": null
      },
      "sourceStatus": "Données du fichier + hypothèses explicites. Aucun relevé terrain, avis officiel ou engagement réel simulé."
    },
    "4": {
      "stage": 4,
      "title": "Idée & stratégie",
      "choice": "C",
      "headline": "Pôles fonctionnels distincts et supports communs",
      "decision": "Séparer les intensités : arrivée collective au RDC, formation au R+1, concentration au R+2, direction au R+3 ; mezzanine administrative conditionnelle. Mutualiser l’accueil et les salles réservables.",
      "why": "Une exploitation mixte nécessite des limites lisibles sans multiplier automatiquement les noyaux.",
      "alternatives": "La distribution générale indifférenciée est écartée ; une autonomie physique totale n’est pas prétendue acquise.",
      "owner": "Maître d’ouvrage / programmiste — rôles de démonstration",
      "proof": "Fiche de décision EX-P118-04 ; démonstration sur données du modèle et hypothèses, non avis signé.",
      "result": {
        "donnee": null,
        "hypothese": "A — densité source conservée : écartée pour conflits d’usage ; B — recomposition lourde : réserve pour reprise des hauteurs ; R — densités réduites et études ciblées : retenue. Les alternatives sont déjà arbitrées dans cet exemple.",
        "raw": null
      },
      "sourceStatus": "Données du fichier + hypothèses explicites. Aucun relevé terrain, avis officiel ou engagement réel simulé."
    },
    "5": {
      "stage": 5,
      "title": "Besoins & concertation",
      "choice": "C",
      "headline": "Groupes identifiés et horaires décalés",
      "decision": "Choisir 110 personnes en situation courante et 164 en pointe de programme ; départs/pauses décalés de 15 minutes. Ces effectifs ne constituent pas un calcul incendie.",
      "why": "Les jauges cibles et les simultanéités sont renseignées, au lieu d’attendre un questionnaire du lecteur.",
      "alternatives": "Pas d’addition des mêmes salariés à leur poste, en réunion et en pause.",
      "owner": "Maître d’ouvrage / programmiste — rôles de démonstration",
      "proof": "Fiche de décision EX-P118-05 ; démonstration sur données du modèle et hypothèses, non avis signé.",
      "result": {
        "donnee": null,
        "hypothese": "Décision de programme : séparer formation et concentration, échelonner les arrivées, mutualiser uniquement les supports compatibles. Réponses transmises au PMO et à Répartition, sans questionnaire obligatoire.",
        "raw": null
      },
      "sourceStatus": "Données du fichier + hypothèses explicites. Aucun relevé terrain, avis officiel ou engagement réel simulé."
    },
    "6": {
      "stage": 6,
      "title": "PMO — Programme du maître d’ouvrage",
      "choice": "A",
      "headline": "Trois engagements prioritaires",
      "decision": "Inscrire dans le PMO : accueil lisible, concentration protégée, service séparé du public. Conserver les surfaces ; adapter capacités et mobilier avant une transformation lourde.",
      "why": "Ces engagements peuvent être contrôlés sur programme et dessin et transmis aux concepteurs.",
      "alternatives": "Les options décoratives ne remplacent pas les exigences de sécurité, de hauteur ou d’accès.",
      "owner": "Maître d’ouvrage / programmiste — rôles de démonstration",
      "proof": "Fiche de décision EX-P118-06 ; démonstration sur données du modèle et hypothèses, non avis signé.",
      "result": {
        "donnee": "Contour S01 ; emprise 673 m² ; demande de portée PT 20 m et charge 500 kg/m² conservée comme exigence à dimensionner. Aucun poteau central ajouté. Les quantités d’appuis présentes au modèle ne valent pas calcul structurel.",
        "hypothese": null,
        "raw": null
      },
      "sourceStatus": "Données du fichier + hypothèses explicites. Aucun relevé terrain, avis officiel ou engagement réel simulé."
    },
    "7": {
      "stage": 7,
      "title": "Préprogramme fonctionnel",
      "choice": "A",
      "headline": "Densités abaissées, surfaces conservées",
      "decision": "Retenir M01 10 postes, R2/E02 30 et R2/E03 20 ; ne pas augmenter le total du programme. Toutes les fiches sont liées au polygone source et dotées d’une capacité de scénario.",
      "why": "À surface constante, les trois zones disposent respectivement de 6,96, 7,25 et 7,60 m² par poste cible. Ces ratios sont des objectifs internes, pas des minima légaux.",
      "alternatives": "Le transfert aveugle de surface vers des supports est écarté ; pas de donneur/bénéficiaire fictif lorsque la densité peut être réduite.",
      "owner": "Maître d’ouvrage / programmiste — rôles de démonstration",
      "proof": "Fiche de décision EX-P118-07 ; démonstration sur données du modèle et hypothèses, non avis signé.",
      "result": {
        "donnee": null,
        "hypothese": "Évolution par cloisons légères et mobilier ; aucune extension foncière ou constructibilité supplémentaire présumée. Variante surfacique facultative, non exigée pour lire l’exemple.",
        "raw": null
      },
      "sourceStatus": "Données du fichier + hypothèses explicites. Aucun relevé terrain, avis officiel ou engagement réel simulé."
    },
    "8": {
      "stage": 8,
      "title": "Exigences techniques & environnementales",
      "choice": "A",
      "headline": "Protections et transitions avant décoration",
      "decision": "Retenir surfaces mates, commande de lumière par usage et séparation acoustique des interfaces. Prescrire une reprise de coupe pour la réserve de hauteur.",
      "why": "On traite la cause spatiale et technique de l’inconfort plutôt qu’une correction symbolique.",
      "alternatives": "Ni performances mesurées ni acoustique validée ne sont inventées à partir de la carte.",
      "owner": "Architecte coordinateur / BET — rôles de démonstration",
      "proof": "Fiche de décision EX-P118-08 ; démonstration sur données du modèle et hypothèses, non avis signé.",
      "result": {
        "donnee": null,
        "hypothese": "Plans/coupes : contrôle géométrique ; BET : stabilité/incendie/fluides ; acousticien : simulation et réception ; exploitant : essai d’usage. Les interprétations Feng Shui sont distinctes de ces preuves.",
        "raw": null
      },
      "sourceStatus": "Données du fichier + hypothèses explicites. Aucun relevé terrain, avis officiel ou engagement réel simulé."
    },
    "9": {
      "stage": 9,
      "title": "Compatibilité Parcelle ↔ Programme",
      "choice": "A",
      "headline": "Maintenir l’emprise et réviser les usages",
      "decision": "Conserver l’enveloppe dessinée de 673 m² ; ne pas absorber les espaces extérieurs pour augmenter le programme. Si la hauteur ne peut être régularisée, réaffecter ou neutraliser la mezzanine.",
      "why": "La compatibilité se démontre par des compromis explicites, pas par l’effacement des écarts.",
      "alternatives": "Une réduction des reculs ou une solution de structure non étudiée n’est pas retenue.",
      "owner": "Architecte coordinateur / BET — rôles de démonstration",
      "proof": "Fiche de décision EX-P118-09 ; démonstration sur données du modèle et hypothèses, non avis signé.",
      "result": {
        "donnee": null,
        "hypothese": "Scénario R retenu pour études ; pas de chantier. Deux replis déjà choisis : réaffecter une fonction plutôt que déplacer la structure ; réduire/neutraliser la mezzanine si la coupe l’impose.",
        "raw": null
      },
      "sourceStatus": "Données du fichier + hypothèses explicites. Aucun relevé terrain, avis officiel ou engagement réel simulé."
    },
    "10": {
      "stage": 10,
      "title": "Étude de capacité architecturale",
      "choice": "C",
      "headline": "Escalier B à gauche et mezzanine prolongée",
      "decision": "Escalier B bas déplacé à gauche du hall, dans la zone rouge. Mezzanine prolongée jusqu’au trait bleu par une galerie transversale, avec retour vers la galerie existante. Porte P-X sur la séparation hall / desserte principale. Liaisons SS → RDC → mezzanine déplacées ensemble. Les volées B mezzanine → étages restent à leur emplacement initial à droite ; la nouvelle galerie les relie. L’escalier A autour de l’ascenseur, les sanitaires et le monte-charge sont conservés.",
      "why": "Le lecteur voit ce qui est choisi au programme et ce qui reste à traduire en dessin, avec une action déjà définie.",
      "alternatives": "La reconstruction automatique du bâtiment et le déplacement non calculé de poteaux/noyaux sont écartés.",
      "owner": "Architecte coordinateur / BET — rôles de démonstration",
      "proof": "Modèle V8.19 partagé, dalles et circulations coordonnées ; revue intégrée au bilan.",
      "result": {
        "donnee": null,
        "hypothese": null,
        "raw": "Escalier B bas déplacé à gauche du hall, dans la zone rouge. Mezzanine prolongée jusqu’au trait bleu par une galerie transversale, avec retour vers la galerie existante. Porte P-X sur la séparation hall / desserte principale. Liaisons SS → RDC → mezzanine déplacées ensemble. Les volées B mezzanine → étages restent à leur emplacement initial à droite ; la nouvelle galerie les relie. L’escalier A autour de l’ascenseur, les sanitaires et le monte-charge sont conservés."
      },
      "sourceStatus": "Modification architecturale d’étude ; structure, évacuation et accessibilité complète à valider"
    },
    "11": {
      "stage": 11,
      "title": "Esquisse architecturale — Esquisser",
      "choice": "B",
      "headline": "La coupe de la mezzanine comme pièce décisive",
      "decision": "Escalier B bas déplacé à gauche du hall, dans la zone rouge. Mezzanine prolongée jusqu’au trait bleu par une galerie transversale, avec retour vers la galerie existante. Porte P-X sur la séparation hall / desserte principale. Liaisons SS → RDC → mezzanine déplacées ensemble. Les volées B mezzanine → étages restent à leur emplacement initial à droite ; la nouvelle galerie les relie. L’escalier A autour de l’ascenseur, les sanitaires et le monte-charge sont conservés.",
      "why": "La coupe met en évidence les hauteurs réelles du modèle, qui ne doivent pas être confondues avec la cible.",
      "alternatives": "Aucune façade réputée performante ni hauteur libre déduite sans épaisseur de dalle et réseaux.",
      "owner": "Architecte coordinateur / BET — rôles de démonstration",
      "proof": "Modèle V8.19 partagé, dalles et circulations coordonnées ; revue intégrée au bilan.",
      "result": {
        "donnee": null,
        "hypothese": null,
        "raw": "Escalier B bas déplacé à gauche du hall, dans la zone rouge. Mezzanine prolongée jusqu’au trait bleu par une galerie transversale, avec retour vers la galerie existante. Porte P-X sur la séparation hall / desserte principale. Liaisons SS → RDC → mezzanine déplacées ensemble. Les volées B mezzanine → étages restent à leur emplacement initial à droite ; la nouvelle galerie les relie. L’escalier A autour de l’ascenseur, les sanitaires et le monte-charge sont conservés."
      },
      "sourceStatus": "Modification architecturale d’étude ; structure, évacuation et accessibilité complète à valider"
    },
    "12": {
      "stage": 12,
      "title": "Scénarios de développement",
      "choice": "B",
      "headline": "Confort d’usage avant capacité maximale",
      "decision": "Retenir R : densités modérées et interfaces traitées. B (recomposition lourde) reste un repli pour la hauteur ; A (densité source) est écarté ; 0 (report) reste possible.",
      "why": "Le scénario privilégié est cohérent avec le but d’usage et ne suppose pas que tous les points techniques sont acquis.",
      "alternatives": "L’option maximisant le nombre de postes n’est pas assimilée automatiquement à l’optimum.",
      "owner": "Architecte coordinateur / BET — rôles de démonstration",
      "proof": "Fiche de décision EX-P118-12 ; démonstration sur données du modèle et hypothèses, non avis signé.",
      "result": {
        "donnee": null,
        "hypothese": "R traite d’abord les conflits d’usage avec peu d’interventions ; B reste le repli pour la coupe ; A n’est pas retenu ; 0 reste possible. Le scénario R n’est pas déclaré optimal hors de ces critères et hypothèses.",
        "raw": null
      },
      "sourceStatus": "Données du fichier + hypothèses explicites. Aucun relevé terrain, avis officiel ou engagement réel simulé."
    },
    "13": {
      "stage": 13,
      "title": "Faisabilité technique",
      "choice": "A",
      "headline": "Études ciblées avec solution de repli",
      "decision": "Attribuer sol/PT au BET, coupe à l’architecte, rampe/accès au géomètre et concepteur. Si l’une des conditions ne peut être levée, réduire/réaffecter le programme plutôt que forcer le chantier.",
      "why": "Chaque réserve a une réponse et un responsable pédagogique identifiés.",
      "alternatives": "Un simple statut vert ou une cure Feng Shui ne remplace aucune justification technique.",
      "owner": "Architecte coordinateur / BET — rôles de démonstration",
      "proof": "Fiche de décision EX-P118-13 ; démonstration sur données du modèle et hypothèses, non avis signé.",
      "result": {
        "donnee": null,
        "hypothese": "Faisabilité non certifiée ; réponse arrêtée = poursuivre les études ciblées. Le bâtiment dessiné est une base d’esquisse, pas un plan exécutable tel quel.",
        "raw": null
      },
      "sourceStatus": "Données du fichier + hypothèses explicites. Aucun relevé terrain, avis officiel ou engagement réel simulé."
    },
    "14": {
      "stage": 14,
      "title": "Faisabilité économique & financière",
      "choice": "A",
      "headline": "Financer d’abord les décisions structurantes",
      "decision": "Retenir l’enveloppe-test 24,00 M MAD et 0,60 M d’études initiales incluses. Préserver accès, coupe et structure avant d’augmenter le budget de finitions.",
      "why": "Tous les postes sont renseignés et le total vérifiable ; les valeurs ne sont pas présentées comme un devis réel.",
      "alternatives": "Aucune dépense réelle n’est autorisée par le fichier ; la dette-test n’est pas un accord bancaire.",
      "owner": "Maître d’ouvrage / programmiste — rôles de démonstration",
      "proof": "Fiche de décision EX-P118-14 ; démonstration sur données du modèle et hypothèses, non avis signé.",
      "result": {
        "donnee": null,
        "hypothese": "Investissement 24,00 M MAD = somme des six postes ; fonds propres 10,00 M + dette hypothétique 14,00 M = 24,00 M. Solde de financement-test 0. Recettes 1,80 M formation + 1,40 M bureaux + 0,40 M services. OPEX 1,40 M ; solde opérationnel 2,20 M avant dette, impôt et renouvellements non inclus. Études initiales 0,60 M comprises dans les honoraires. Pas de coût de financement ni de fiscalité inventés ; la dette est une hypothèse de source de fonds, pas une offre bancaire.",
        "raw": null
      },
      "sourceStatus": "Données du fichier + hypothèses explicites. Aucun relevé terrain, avis officiel ou engagement réel simulé."
    },
    "15": {
      "stage": 15,
      "title": "Coût global & sensibilités",
      "choice": "A",
      "headline": "Sobriété et seuils de réexamen explicites",
      "decision": "Choisir des matériaux entretenables et contrôler le scénario stressé : CAPEX 26,40 M, financement-test insuffisant de 2,40 M ; nouvelle décision requise.",
      "why": "L’exemple montre aussi la réponse à une hypothèse défavorable plutôt qu’un budget artificiellement toujours équilibré.",
      "alternatives": "Le résultat d’exploitation avant dette et impôt n’est pas assimilé à un bénéfice net.",
      "owner": "Maître d’ouvrage / programmiste — rôles de démonstration",
      "proof": "Fiche de décision EX-P118-15 ; démonstration sur données du modèle et hypothèses, non avis signé.",
      "result": {
        "donnee": null,
        "hypothese": "Seuil de financement-test : besoin 2,40 M non couvert sous choc CAPEX, donc nouvel arbitrage obligatoire. Seuil d’exploitation simplifié : recettes ≥ OPEX ; ne vaut pas seuil de solvabilité après dette/impôts. Aucun GO travaux sur le scénario défavorable sans financement révisé.",
        "raw": null
      },
      "sourceStatus": "Données du fichier + hypothèses explicites. Aucun relevé terrain, avis officiel ou engagement réel simulé."
    },
    "16": {
      "stage": 16,
      "title": "Vérifications / Due diligence",
      "choice": "A",
      "headline": "Corriger à la source, sans validation fictive",
      "decision": "Pour chaque réserve, inscrire dispositif de correction, preuve attendue et décideur ; ne laisser aucun champ « que faire ? » au lecteur. Hauteurs et accès demeurent critiques.",
      "why": "Un exemple complet peut conclure que la preuve reste à produire tout en donnant une réponse de projet complète.",
      "alternatives": "Les réserves ne sont pas supprimées pour afficher une réussite artificielle.",
      "owner": "Maître d’ouvrage / programmiste — rôles de démonstration",
      "proof": "Fiche de décision EX-P118-16 ; démonstration sur données du modèle et hypothèses, non avis signé.",
      "result": {
        "donnee": null,
        "hypothese": "Réserves critiques identifiées et assorties d’une réponse : HAUTEURS → reprise de coupe ; RAMPE → autorisation/drainage ; SOL/PT → investigations ; ACCÈS → pièces ; MARCHÉ/FINANCE → validation du scénario. Elles restent ouvertes techniquement, mais aucune réponse n’est laissée à inventer par le lecteur.",
        "raw": null
      },
      "sourceStatus": "Données du fichier + hypothèses explicites. Aucun relevé terrain, avis officiel ou engagement réel simulé."
    },
    "17": {
      "stage": 17,
      "title": "Évaluation multicritère",
      "choice": "A",
      "headline": "Un arbitrage traçable, pas une note de Qi",
      "decision": "Choisir la solution R au regard des critères documentés de l’exemple ; notes pédagogiques renseignées avec motifs ; réserves critiques prioritaires sur la moyenne.",
      "why": "Le niveau de preuve est visible et différencié de l’intérêt du parti spatial.",
      "alternatives": "Aucune note favorable n’efface un blocage technique ou une donnée absente.",
      "owner": "Maître d’ouvrage / programmiste — rôles de démonstration",
      "proof": "Fiche de décision EX-P118-17 ; démonstration sur données du modèle et hypothèses, non avis signé.",
      "result": {
        "donnee": null,
        "hypothese": "Notes pédagogiques motivées, pas validation automatique : vision 4 (objectifs explicites) ; marché 2 (non enquêté) ; programme 4 (lié aux zones, jauges choisies) ; technique 2 (hauteurs/PT/rampe non justifiés) ; finance 3 (calcul complet mais fictif et sensible au stress) ; exploitation 4 (horaires et mutualisations définis) ; risques 2 (réserves critiques) ; preuve 2 (modèle disponible, avis manquants). Moyenne 2,875/5 illustrative. Les réserves bloquantes priment sur la moyenne ; pas de score Feng Shui.",
        "raw": null
      },
      "sourceStatus": "Données du fichier + hypothèses explicites. Aucun relevé terrain, avis officiel ou engagement réel simulé."
    },
    "18": {
      "stage": 18,
      "title": "Bilan du potentiel de la parcelle",
      "choice": "A",
      "headline": "Synthèse décisions → programme → dessin",
      "decision": "Rassembler les choix amont réellement retenus, les 62 réponses de zones, le budget-test et les écarts restant à traduire. Générer le bilan sans ajouter une étape Harmony.",
      "why": "Le lecteur retrouve la même décision à son origine, au programme et dans l’Atelier.",
      "alternatives": "Le bilan ne se limite ni à une liste de questions ni à une promesse de conformité.",
      "owner": "Maître d’ouvrage / programmiste — rôles de démonstration",
      "proof": "Fiche de décision EX-P118-18 ; démonstration sur données du modèle et hypothèses, non avis signé.",
      "result": {
        "donnee": null,
        "hypothese": "Condition de poursuite retenue : études seulement ; nouvelle revue avec preuves techniques, accès et financement avant chantier. Étoiles Volantes non déterminantes pour arbitrer ce scénario collectif.",
        "raw": null
      },
      "sourceStatus": "Données du fichier + hypothèses explicites. Aucun relevé terrain, avis officiel ou engagement réel simulé."
    },
    "19": {
      "stage": 19,
      "title": "Décision — GO / GO sous conditions / À reprendre / NO GO",
      "choice": "A",
      "headline": "GO sous conditions pour les études uniquement",
      "decision": "Décision fictive : engager 0,60 M MAD d’études, aucune construction. Revue 26/10/2026 ; conditions coupe/PT/rampe/accès/financement. Échec d’une condition → reprise ou report.",
      "why": "Cette décision permet de montrer les étapes 20/21 sans simuler une autorisation réglementaire ni un projet prêt à construire.",
      "alternatives": "Le GO travaux est expressément exclu de cette démonstration.",
      "owner": "Maître d’ouvrage / programmiste — rôles de démonstration",
      "proof": "Fiche de décision EX-P118-19 ; démonstration sur données du modèle et hypothèses, non avis signé.",
      "result": {
        "donnee": null,
        "hypothese": null,
        "raw": "GO sous conditions"
      },
      "sourceStatus": "Données du fichier + hypothèses explicites. Aucun relevé terrain, avis officiel ou engagement réel simulé."
    },
    "20": {
      "stage": 20,
      "title": "Organisation des études — uniquement si GO",
      "choice": "A",
      "headline": "Missions et jalons déjà définis",
      "decision": "Affecter 0,12 M géomètre/sol, 0,18 architecte, 0,16 BET, 0,05 acoustique, 0,05 marché/économie, 0,04 coordination ; livrables à J1/J2/J3.",
      "why": "Les montants totalisent 0,60 M et montrent la transmission effective des conditions de décision.",
      "alternatives": "Aucun prestataire réel n’est engagé ; les fonctions, dates et budgets sont des exemples.",
      "owner": "Maître d’ouvrage / programmiste — rôles de démonstration",
      "proof": "Fiche de décision EX-P118-20 ; démonstration sur données du modèle et hypothèses, non avis signé.",
      "result": {
        "donnee": null,
        "hypothese": "J1 valider les données ; J2 arbitrer la coupe et les interfaces ; J3 réviser financement et décider des travaux séparément. Les conditions non levées restent visibles dans le transfert.",
        "raw": null
      },
      "sourceStatus": "Données du fichier + hypothèses explicites. Aucun relevé terrain, avis officiel ou engagement réel simulé."
    },
    "21": {
      "stage": 21,
      "title": "Transfert vers développement / conception",
      "choice": "A",
      "headline": "Transfert exploitable et brief d’ambiance",
      "decision": "Transmettre source S01, modèle, programme, 21 décisions, capacités cibles, registre des réponses et conditions d’études. Adapter matières/lumières aux usages et prévoir une revue après occupation.",
      "why": "Le dossier explique quoi transmettre, à qui et avec quelles limites ; aucun élément essentiel à compléter pour comprendre le parcours.",
      "alternatives": "Les études futures et le retour après occupation ne sont pas présentés comme déjà réalisés.",
      "owner": "Maître d’ouvrage / programmiste — rôles de démonstration",
      "proof": "Fiche de décision EX-P118-21 ; démonstration sur données du modèle et hypothèses, non avis signé.",
      "result": {
        "donnee": null,
        "hypothese": "Dossier de transmission entièrement illustré : parcelle, programme, modèle source, écarts explicités, budget-test, 21 décisions Harmonie, 62 réponses par zone et conditions d’étude. Transfert n’est pas autorisation de travaux.",
        "raw": null
      },
      "sourceStatus": "Données du fichier + hypothèses explicites. Aucun relevé terrain, avis officiel ou engagement réel simulé."
    }
  },
  "business": {
    "1": {
      "summary": "[DONNÉE / CALCUL DU FICHIER SOURCE] P.118 — El Mansouria ; B.266 → B.267 → B.268 → B.265 ; contenance 1 346 m² ; aire calculée 1 345,55 m².\\n[HYPOTHÈSE RETENUE POUR L’EXEMPLE] Accès étudié sur B.265–B.266 ; accueil dégagé, espace ouvert protégé et desserte latérale. Organisation du terrain seulement, sans distribution des bureaux. Le fond MapTiler est facultatif pour lire le cas ; scénario de contexte explicitement renseigné."
    },
    "2": {
      "f1": "[DONNÉE / CALCUL DU FICHIER SOURCE] Référence I5 incluse au dossier ; son application au site n’est pas une autorisation obtenue.",
      "f2": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] Retenir formation continue, bureaux et services. Exclure logement, industrie et hébergement de ce programme. Le passage aux études suppose confirmation de ces destinations.",
      "f3": "[DONNÉE / CALCUL DU FICHIER SOURCE] 1 346 × 50 % = 673 m² de plafond arithmétique de travail ; emprise dessinée 673 m². Aucun COS complémentaire n’est inventé.",
      "f4": "[DONNÉE / CALCUL DU FICHIER SOURCE] Le dossier cite 17,50 m hors sol et 3,50 m sous plafond pour les locaux concernés. Le modèle atteint 16,60 m hors sol, mais présente 3,20/3,40 m étage à étage : réserve H-HAUTEURS non levée.",
      "f5": "[DONNÉE / CALCUL DU FICHIER SOURCE] Décalage de travail 5 m : enveloppe calculée 689,23 m² ; distances de l’emprise aux limites ≈ 5,148 m. Autorisation de la rampe distincte du contrôle du contour.",
      "f6": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] Prévoir une étude de 12 places automobiles, dont 2 emplacements adaptés à vérifier, et 20 vélos ; privilégier accès collectif. Aucun emplacement sur voie publique n’est compté acquis. Ces nombres sont un programme-test, pas un ratio réglementaire.",
      "f7": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] Tester l’absence de servitude incompatible pour étudier la variante ; exiger état foncier, plans réseaux et alignement avant engagement des travaux. Repli : déplacer le dispositif dans la zone admissible.",
      "f8": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] Accès public côté B.265–B.266 ; desserte technique latérale hors parvis. Aucun droit d’accès supplémentaire considéré acquis. Géomètre/architecte : vérification au jalon J1.",
      "f9": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] Sol sans anomalie seulement dans le scénario de calcul ; pas constat. Diagnostics sol, eau, historique et nuisances prescrits ; la réserve financière ne prouve pas la constructibilité.",
      "f10": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] Mandater l’architecte pour identifier autorité instructrice, destination recevable et pièces à déposer. Aucun numéro de permis fictif, aucun avis favorable simulé.",
      "f11": "[DONNÉE / CALCUL DU FICHIER SOURCE] Document ZONE-I-5.pdf intégré au fichier de départ ; S01 / 118_officiel.kmz. Références conservées comme pièces sources, portée territoriale et actualité à confirmer par l’équipe de projet.",
      "f12": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] Retenir l’implantation de 673 m² comme base des études, non comme droit acquis. Poursuite limitée aux études ; hauteurs et rampe sont deux conditions bloquantes avant chantier."
    },
    "3": {
      "f1": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] Exercice de positionnement P.118, El Mansouria ; scénario arrêté au 28/09/2026, sans enquête réelle.",
      "f2": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] Formation continue pour adultes et équipes de PME ; usagers réguliers de bureaux, visiteurs sur rendez-vous, maintenance.",
      "f3": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] Cible de 60 apprenants simultanés, 84 postes de travail proposés ; recette stabilisée de scénario 3,60 M MAD/an. Aucune précommercialisation ou solvabilité démontrée.",
      "f4": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] Concurrence supposée présente ; modèle stressé par 10 % de vacance et 15 % de réduction des recettes unitaires. Aucune vacance locale mesurée n’est avancée.",
      "f5": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] Budget de recettes : formation 1,80 M + bureaux 1,40 M + services 0,40 M MAD/an. Valeurs de démonstration choisies pour tester le calcul, pas relevé de prix ni conseil d’investissement.",
      "f6": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] Comparer trois offres-types anonymes : bureau seul, centre de formation seul, ensemble mixte. Retenir le mixte pour la mutualisation et la diversité d’usage ; ce ne sont pas des transactions observées.",
      "f7": "[DONNÉE / CALCUL DU FICHIER SOURCE] Coordonnées de travail WGS84 ≈ -7,319682 ; 33,708221, dérivées du S01 sous hypothèse EPSG:26191. Temps de trajet et desserte réelle non mesurés ; stratégie retenue : arrivées groupées et horaires décalés.",
      "f8": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] Un lieu de formation lisible et des bureaux protégés des pointes d’affluence ; partager réunion, accueil et supports compatibles, pas les postes individuels par défaut.",
      "f9": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] Choix arrêté pour montrer la démarche. Avant décision de construire : enquête auprès de trois opérateurs de formation et cinq entreprises, puis test des recettes au jalon J1 ; en cas d’insuffisance, réduire l’équipement initial."
    },
    "4": {
      "f1": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] Bâtiment mixte : formation continue, bureaux et services partagés.",
      "f2": "[DONNÉE / CALCUL DU FICHIER SOURCE] Construction neuve représentée par un modèle d’esquisse ; aucun bâtiment achevé ni diagnostic d’existant certifié.",
      "f3": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] Public adulte ; PME de services ; exploitant de formation ; visiteurs accompagnés. Pas d’hébergement ni de public scolaire mineur dans le scénario.",
      "f4": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] Exploitation unifiée, recettes de formation + bureaux + services ; espaces partagés gérés par réservation. Calculs financiers illustratifs détaillés aux étapes 14/15.",
      "f5": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] Conserver l’actif, maîtriser les interfaces et prévoir des interventions réversibles plutôt qu’une division immédiate en lots autonomes.",
      "f6": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] Exploitant unique ; plages formation 08:30–17:30, bureaux 09:00–18:00 ; maintenance et livraison avant 08:00/après 18:00.",
      "f7": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] Préparer une location par ensembles fonctionnels si l’exploitation unique évolue ; aucune valeur de revente postulée.",
      "f8": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] Pointe de programme 164 personnes ; budget-test 24,00 M MAD ; conservation de l’emprise ; pas d’augmentation de densité sur la mezzanine ; relevés obligatoires avant réalisation.",
      "f9": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] A — densité source conservée : écartée pour conflits d’usage ; B — recomposition lourde : réserve pour reprise des hauteurs ; R — densités réduites et études ciblées : retenue. Les alternatives sont déjà arbitrées dans cet exemple."
    },
    "5": {
      "f1": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] Maître d’ouvrage fictif P.118 ; programmiste ; architecte ; exploitant ; BET structure/fluides/incendie ; géomètre ; acousticien. Ce sont des rôles, pas des missions attribuées à des personnes réelles.",
      "f2": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] 60 apprenants, 84 utilisateurs des postes, 16 visiteurs, 4 agents de service en pointe ; les salariés en réunion ne sont pas additionnés une seconde fois. Les 84 titulaires de postes incluent les formateurs et personnels de contrôle ; leurs postes sont libérés lorsqu’ils enseignent ou utilisent E06. Les locaux E06, réunions, pauses, archives et réserve sont occupés en rotation par ces mêmes personnes, pas par des effectifs additionnels. Exemple de créneau de pointe : 20 apprenants en Formation A, 20 en Formation B et 20 au plateau polyvalent RDC ; les autres ateliers ne reçoivent pas simultanément un quatrième groupe.",
      "f3": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] Apprendre, travailler individuellement et en équipe, recevoir, se réunir, faire une pause, entretenir ; pas de restauration de production ni d’activité industrielle.",
      "f4": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] 60 apprenants + 84 utilisateurs de postes de travail + 16 visiteurs + 4 agents de service = 164 personnes en pointe ; situation courante : 40 + 60 + 8 + 2 = 110. Les salles de réunion et de pause accueillent ces mêmes groupes et ne sont pas ajoutées à l’effectif. Les 84 titulaires de postes incluent les formateurs et personnels de contrôle ; leurs postes sont libérés lorsqu’ils enseignent ou utilisent E06. Les locaux E06, réunions, pauses, archives et réserve sont occupés en rotation par ces mêmes personnes, pas par des effectifs additionnels. Exemple de créneau de pointe : 20 apprenants en Formation A, 20 en Formation B et 20 au plateau polyvalent RDC ; les autres ateliers ne reçoivent pas simultanément un quatrième groupe.",
      "f5": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] Arrivée formation 08:30 ; bureaux 09:00 ; deux vagues de pause espacées de 15 min ; livraisons 07:00–08:00 / 18:00–19:00. Occupation annuelle financière simplifiée, non calendrier de réservations réel.",
      "f6": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] Pas de stockage dans les dégagements ; attente sur le côté du hall ; pas de réunion debout dans les passages ; accès technique réservé à l’exploitant.",
      "f7": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] 1. Repérage et accès ; 2. séparation des intensités ; 3. confort de travail ; 4. flexibilité. Sécurité et accessibilité sont des conditions, jamais des options d’ambiance.",
      "f8": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] Réduire M01 de 24 à 10 postes ; R2/E02 de 40 à 30 ; R2/E03 de 24 à 20. La réduction de capacité prime sur l’augmentation de l’emprise. Mobilier source à reprendre, sans faire croire qu’il a déjà été redessiné.",
      "f9": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] Restitution pédagogique remplie : usagers fictifs demandant calme, repérage, rangement et pauses ; aucun entretien réel n’est revendiqué. Le scénario montre ce que produirait une concertation documentée.",
      "f10": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] Décision de programme : séparer formation et concentration, échelonner les arrivées, mutualiser uniquement les supports compatibles. Réponses transmises au PMO et à Répartition, sans questionnaire obligatoire."
    },
    "6": {
      "f1": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] Retenir le scénario R : pôle Formation & bureaux sobre, lisible et adaptable, sans augmenter l’emprise.",
      "f2": "Sous-sol technique : 530,16 m² de zones.\\nRDC : 530,62 m² de zones.\\nMezzanine : 194,87 m² de zones.\\nR+1 · Formation : 541,78 m² de zones.\\nR+2 · Bureaux : 544,47 m² de zones.\\nR+3 · Direction : 542,85 m² de zones.",
      "f3": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] 60 apprenants + 84 utilisateurs de postes de travail + 16 visiteurs + 4 agents de service = 164 personnes en pointe ; situation courante : 40 + 60 + 8 + 2 = 110. Les salles de réunion et de pause accueillent ces mêmes groupes et ne sont pas ajoutées à l’effectif. Les 84 titulaires de postes incluent les formateurs et personnels de contrôle ; leurs postes sont libérés lorsqu’ils enseignent ou utilisent E06. Les locaux E06, réunions, pauses, archives et réserve sont occupés en rotation par ces mêmes personnes, pas par des effectifs additionnels. Exemple de créneau de pointe : 20 apprenants en Formation A, 20 en Formation B et 20 au plateau polyvalent RDC ; les autres ateliers ne reçoivent pas simultanément un quatrième groupe.",
      "f4": "[MODÈLE V8.19] Emprise 673 m² conservée ; dalle mezzanine nette 340.85 m² ; gain 75.72 m². Surfaces géométriques d’étude.",
      "f5": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] Programme-test : densités cibles modérées ; ambiances différenciées ; séparations acoustiques ; éclairage de tâche réglable ; accueil et parcours sans obstacles à dimensionner par les concepteurs.",
      "f6": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] Enveloppe totale de calcul : 24,00 M MAD ; autorisation fictive limitée à 0,60 M MAD d’études, incluse dans les 1,60 M d’études/honoraires, non ajoutée au budget.",
      "f7": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] Études préparatoires octobre–décembre 2026 ; études et autorisations au 1er semestre 2027 ; chantier seulement après nouveau GO ; ouverture-test septembre 2028, non engagement réel.",
      "f8": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] Préserver les décisions irréversibles (site, structure, accès) ; ajuster d’abord usages et mobilier ; travaux décoratifs non prioritaires devant les réserves techniques.",
      "f9": "[DONNÉE / CALCUL DU FICHIER SOURCE] Contour S01 ; emprise 673 m² ; demande de portée PT 20 m et charge 500 kg/m² conservée comme exigence à dimensionner. Aucun poteau central ajouté. Les quantités d’appuis présentes au modèle ne valent pas calcul structurel."
    },
    "7": {
      "f1": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] RDC accueil/formation ; mezzanine administration conditionnelle ; R+1 formation ; R+2 bureaux ; R+3 direction/coworking ; SS technique.",
      "f2": "parcours_lot118-E001 · S01 · Archives sèches : 253,39 m² ; 2 places de programme.\\nparcours_lot118-E002 · S02 · Locaux techniques / maintenance : 180,19 m² ; 2 places de programme.\\nparcours_lot118-E003 · S03 · Desserte technique : 52,58 m² ; 0 places de programme.\\nparcours_lot118-E004 · S04 · Réserve : 15,52 m² ; 1 places de programme.\\nP118-V815-5 · S04 · Réserve : 0,46 m² ; 0 places de programme.\\nparcours_lot118-E005 · Adaptation périphérique : 6,88 m² ; 0 places de programme.\\nparcours_lot118-E006 · Adaptation périphérique : 7,60 m² ; 0 places de programme.\\nparcours_lot118-E007 · Adaptation périphérique : 7,79 m² ; 0 places de programme.\\nP118-V815-9 · MC · Palier de manutention : 5,74 m² ; 0 places de programme.\\nparcours_lot118-E008 · R01 · Accueil, attente et hall : 160,65 m² ; 16 places de programme.\\nparcours_lot118-E009 · R02 · Plateau polyvalent : 172,95 m² ; 32 places de programme.\\nparcours_lot118-E010 · R03 · Ateliers / formation : 75,77 m² ; 12 places de programme.\\nparcours_lot118-E011 · R04 · Desserte principale · 2 m : 35,18 m² ; 0 places de programme.\\nparcours_lot118-E013 · R06 · Office / pause · 2 places : 12,65 m² ; 2 places de programme.\\nparcours_lot118-E015 · R08 · Dégagement arrière : 10,33 m² ; 0 places de programme.\\nP118-V815-16 · R08 · Dégagement arrière : 0,48 m² ; 0 places de programme.\\nparcours_lot118-E016 · Adaptation périphérique : 6,88 m² ; 0 places de programme.\\nparcours_lot118-E017 · Adaptation périphérique : 7,60 m² ; 0 places de programme.\\nparcours_lot118-E018 · Adaptation périphérique : 7,79 m² ; 0 places de programme.\\nP118-V815-20 · MC · Palier de manutention : 5,74 m² ; 0 places de programme.\\nP118-V815-21 · Sanitaires Femmes · 2 WC dont 1 adapté · 3 lavabos : 17,41 m² ; 0 places de programme.\\nP118-V815-22 · Sanitaires Hommes · 2 WC dont 1 adapté · 3 lavabos · 1 urinoir : 17,19 m² ; 0 places de programme.\\nparcours_lot118-E019 · M01 · Administration : 65,36 m² ; 10 places de programme.\\nparcours_lot118-E020 · M02 · Réunion : 20,71 m² ; 8 places de programme.\\nparcours_lot118-E021 · M03 · Galerie · 1,80 m : 22,80 m² ; 0 places de programme.\\nparcours_lot118-E023 · M05 · Office / pause · 2 places : 12,65 m² ; 2 places de programme.\\nparcours_lot118-E025 · M07 · Liaison vers noyau A : 15,02 m² ; 0 places de programme.\\nP118-V815-28 · M07 · Liaison vers noyau A : 0,48 m² ; 0 places de programme.\\nparcours_lot118-E026 · M08 · Dégagement réunion / escalier B : 14,06 m² ; 0 places de programme.\\nparcours_lot118-E027 · Adaptation périphérique : 5,73 m² ; 0 places de programme.\\nparcours_lot118-E028 · Adaptation périphérique : 7,74 m² ; 0 places de programme.\\nP118-V815-32 · MC · Palier de manutention : 5,74 m² ; 0 places de programme.\\nP118-V815-33 · Sanitaires Femmes · 1 WC dont 1 adapté · 2 lavabos : 12,38 m² ; 0 places de programme.\\nP118-V815-34 · Sanitaires Hommes · 1 WC dont 1 adapté · 2 lavabos · 1 urinoir : 12,20 m² ; 0 places de programme.\\nparcours_lot118-E029 · E01 · Desserte principale · 2 m : 45,54 m² ; 0 places de programme.\\nparcours_lot118-E030 · E02 · Formation A : 71,44 m² ; 20 places de programme.\\nparcours_lot118-E031 · E03 · Formation B : 70,99 m² ; 20 places de programme.\\nparcours_lot118-E032 · E04 · Atelier projet : 72,33 m² ; 8 places de programme.\\nparcours_lot118-E033 · E05 · Travail collaboratif : 135,88 m² ; 16 places de programme.\\nparcours_lot118-E034 · E06 · Salle de contrôle / support : 53,85 m² ; 4 places de programme.\\nparcours_lot118-E036 · E08 · Distribution arrière : 22,06 m² ; 0 places de programme.\\nparcours_lot118-E037 · E09 · Local technique : 7,08 m² ; 0 places de programme.\\nparcours_lot118-E038 · Adaptation périphérique : 6,88 m² ; 0 places de programme.\\nparcours_lot118-E039 · Adaptation périphérique : 7,60 m² ; 0 places de programme.\\nparcours_lot118-E040 · Adaptation périphérique : 7,79 m² ; 0 places de programme.\\nP118-V815-46 · MC · Palier de manutention : 5,74 m² ; 0 places de programme.\\nP118-V815-47 · Sanitaires Femmes · 2 WC dont 1 adapté · 3 lavabos : 17,41 m² ; 0 places de programme.\\nP118-V815-48 · Sanitaires Hommes · 2 WC dont 1 adapté · 3 lavabos · 1 urinoir : 17,19 m² ; 0 places de programme.\\nparcours_lot118-E041 · E01 · Desserte principale · 2 m : 45,54 m² ; 0 places de programme.\\nparcours_lot118-E042 · E02 · Bureaux ouverts : 217,45 m² ; 30 places de programme.\\nparcours_lot118-E043 · E03 · Équipe projets : 135,88 m² ; 20 places de programme.\\nparcours_lot118-E044 · E06 · Salle de contrôle / support : 53,85 m² ; 4 places de programme.\\nparcours_lot118-E046 · E08 · Distribution arrière : 22,06 m² ; 0 places de programme.\\nparcours_lot118-E047 · E09 · Local technique : 7,08 m² ; 0 places de programme.\\nparcours_lot118-E048 · Adaptation périphérique : 6,88 m² ; 0 places de programme.\\nparcours_lot118-E049 · Adaptation périphérique : 7,60 m² ; 0 places de programme.\\nparcours_lot118-E050 · Adaptation périphérique : 7,79 m² ; 0 places de programme.\\nP118-V815-58 · MC · Palier de manutention : 5,74 m² ; 0 places de programme.\\nP118-V815-59 · Sanitaires Femmes · 2 WC dont 1 adapté · 5 lavabos : 17,41 m² ; 0 places de programme.\\nP118-V815-60 · Sanitaires Hommes · 2 WC dont 1 adapté · 5 lavabos · 1 urinoir : 17,19 m² ; 0 places de programme.\\nparcours_lot118-E051 · E01 · Desserte principale · 2 m : 45,54 m² ; 0 places de programme.\\nparcours_lot118-E052 · E02 · Direction : 71,44 m² ; 4 places de programme.\\nparcours_lot118-E053 · E03 · Réunion conseil : 70,99 m² ; 14 places de programme.\\nparcours_lot118-E054 · E04 · Équipe de direction : 72,33 m² ; 8 places de programme.\\nparcours_lot118-E055 · E05 · Salon / coworking : 146,99 m² ; 12 places de programme.\\nparcours_lot118-E056 · E06 · Salle de contrôle / support : 53,85 m² ; 4 places de programme.\\nparcours_lot118-E058 · E08 · Distribution arrière : 22,06 m² ; 0 places de programme.\\nparcours_lot118-E059 · E09 · Local technique : 7,08 m² ; 0 places de programme.\\nparcours_lot118-E060 · Adaptation périphérique : 6,88 m² ; 0 places de programme.\\nparcours_lot118-E061 · Adaptation périphérique : 7,60 m² ; 0 places de programme.\\nparcours_lot118-E062 · Adaptation périphérique : 7,79 m² ; 0 places de programme.\\nP118-V815-72 · MC · Palier de manutention : 5,74 m² ; 0 places de programme.\\nP118-V815-73 · Sanitaires Femmes · 1 WC dont 1 adapté · 2 lavabos : 12,38 m² ; 0 places de programme.\\nP118-V815-74 · Sanitaires Hommes · 1 WC dont 1 adapté · 2 lavabos · 1 urinoir : 12,20 m² ; 0 places de programme.",
      "f3": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] 60 apprenants + 84 utilisateurs de postes de travail + 16 visiteurs + 4 agents de service = 164 personnes en pointe ; situation courante : 40 + 60 + 8 + 2 = 110. Les salles de réunion et de pause accueillent ces mêmes groupes et ne sont pas ajoutées à l’effectif.\\n[HYPOTHÈSE RETENUE POUR L’EXEMPLE] M01 : 10 postes / 69,55 m² ; R2 E02 : 30 / 217,45 m² ; R2 E03 : 20 / 152,08 m². Ce sont des jauges choisies, pas une certification.",
      "f4": "[MODÈLE V8.19] Emprise 673 m² conservée ; dalle mezzanine nette 340.85 m² ; gain 75.72 m². Surfaces géométriques d’étude.",
      "f5": "[DONNÉE / CALCUL DU FICHIER SOURCE] Aucune affectation des vides/noyaux/parois aux pièces. Toutes les bandes résiduelles sont identifiées comme support sans poste ; ventilation par catégorie calculée depuis les 74 fiches.",
      "f6": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] Accueil proche des noyaux ; formation proche des pauses mais séparée acoustiquement ; bureaux hors traversées ; réunion proche des équipes ; livraison séparée du public.",
      "f7": "Variante retenue : blocs H/F arrière superposés. RDC, R+1 et R+2 : deux WC par bloc, dont un adapté. Mezzanine et R+3 : une cabine adaptée par bloc et un espace de lavage séparé. Un urinoir par bloc H, protégé par un écran. L’option consistant à conserver deux pièces identiques partout est écartée pour différencier fréquentation, lavage et intimité. Surfaces utiles calculées hors cloisons et gaines, cabines et sas de lavage compris. Ratio rapporté à la dalle nette du niveau. Les agrandissements reprennent une partie des locaux voisins et de la distribution ; emprise et dalles conservées.",
      "f8": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] Public par hall ; employés vers leur étage ; service hors arrivée publique. Les transitions verticales sont communes avec signalétique et horaires, pas réputées indépendantes physiquement.",
      "f9": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] Partager les réunions et espaces projet par réservation. Aucun double compte des personnes. Pas de transfert de surface retenu : les densités peuvent être abaissées sans modifier les polygones.",
      "f10": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] Évolution par cloisons légères et mobilier ; aucune extension foncière ou constructibilité supplémentaire présumée. Variante surfacique facultative, non exigée pour lire l’exemple."
    },
    "8": {
      "f1": "[DONNÉE / CALCUL DU FICHIER SOURCE] Portée demandée 20 m ; charge 500 kg/m² ≈ 4,903325 kN/m² selon le dossier. Distinguer charges d’exploitation, cloisons et poids propre. Aucun dimensionnement PT n’est ajouté fictivement. Les nouvelles réservations du MC imposent une étude BET des dalles post-tendues.",
      "f2": "[DONNÉE / CALCUL DU FICHIER SOURCE] Source : SS -3,20 m ; RDC 0 ; mezzanine +3,20 ; R1 +6,40 ; R2 +9,80 ; R3 +13,20 ; haut +16,60. Réserve avec l’indication de 3,50 m sous plafond du dossier. Choix : mission de recomposition en coupe ; aucun chantier avant résolution.",
      "f3": "V8.17 : une cabine adaptée dans chaque bloc H/F ; manœuvre libre 1,50 × 1,50 m, transfert latéral 0,90 × 1,50 m en hypothèse, lavabo et barres d’appui dessinés. Largeur utile des portes et parcours complet à confirmer.",
      "f4": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] Faire dimensionner effectifs, dégagements, désenfumage et compartimentage selon classement réel. Conserver les noyaux du dessin pour l’étude seulement ; aucune certification de leurs largeurs ou de leur nombre.",
      "f5": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] Cibles d’étude : formation ≤ 0,8 s de réverbération ; calme visé 35–40 dB(A) en salles calmes ; séparation acoustique entre formation, bureaux et mezzanine. Valeurs internes de scénario, non mesures ni prescriptions réglementaires.",
      "f6": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] Cibles d’étude : 500 lux sur tâches, 300 lux zones de réunion, 150 lux circulations ; éclairage réglable, contrôle de l’éblouissement, ventilation à calculer sur jauges cibles. Pas de valeur mesurée.",
      "f7": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] Comparer protections solaires passives et systèmes réglables ; équipements économes en eau ; aucune économie chiffrée ni performance énergétique certifiée. Pas de bassin décoratif comme correction Feng Shui.",
      "f8": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] Réseaux séparés courant fort/faible ; Wi-Fi bureaux/visiteurs distinct ; réservations verticales regroupées ; points d’eau proches des zones techniques ; aucune implantation définitive de gaine inventée.",
      "f9": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] Nettoyage quotidien ; accès de maintenance hors passages publics ; contrôle mensuel des protections/éclairage ; renouvellements documentés dans OPEX-test 1,40 M MAD/an.",
      "f10": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] Plans/coupes : contrôle géométrique ; BET : stabilité/incendie/fluides ; acousticien : simulation et réception ; exploitant : essai d’usage. Les interprétations Feng Shui sont distinctes de ces preuves."
    },
    "9": {
      "f1": "[DONNÉE / CALCUL DU FICHIER SOURCE] L’emprise calculée reste dans la parcelle et l’enveloppe de recul de travail. Le programme est lié aux 74 zones du même modèle.",
      "f2": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] Adapter capacité, mobilier et horaires ; traiter seuil, protections et interfaces. Aucun déplacement de poteau, noyau ou dalle sans étude.",
      "f3": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] Mandats attribués dans l’exemple : géomètre pour contexte/voirie ; architecte pour hauteurs/autorisation ; BET pour structure, rampe, évacuation ; acousticien pour mezzanine.",
      "f4": "[DONNÉE / CALCUL DU FICHIER SOURCE] Les hauteurs actuelles 3,20/3,40 m étage à étage ne permettent pas de démontrer 3,50 m libres. Réponse retenue : étude en coupe, avec possibilité de modifier/supprimer l’usage régulier de la mezzanine si nécessaire.",
      "f5": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] Jauges de programme abaissées, mêmes surfaces. Pas de revendication d’une capacité légale de 164 personnes. Gel de l’exploitation réelle tant que les réserves critiques subsistent.",
      "f6": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] Ne pas vendre la capacité avant validation ; 2,50 M MAD de provision pour aléas ne garantissent aucune solution technique. Nouvelle décision budgétaire en cas de dépassement.",
      "f7": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] Scénario R retenu pour études ; pas de chantier. Deux replis déjà choisis : réaffecter une fonction plutôt que déplacer la structure ; réduire/neutraliser la mezzanine si la coupe l’impose."
    },
    "10": {
      "summary": "Escalier B bas déplacé à gauche du hall, dans la zone rouge. Mezzanine prolongée jusqu’au trait bleu par une galerie transversale, avec retour vers la galerie existante. Porte P-X sur la séparation hall / desserte principale. Liaisons SS → RDC → mezzanine déplacées ensemble. Les volées B mezzanine → étages restent à leur emplacement initial à droite ; la nouvelle galerie les relie. L’escalier A autour de l’ascenseur, les sanitaires et le monte-charge sont conservés."
    },
    "11": {
      "summary": "Escalier B bas déplacé à gauche du hall, dans la zone rouge. Mezzanine prolongée jusqu’au trait bleu par une galerie transversale, avec retour vers la galerie existante. Porte P-X sur la séparation hall / desserte principale. Liaisons SS → RDC → mezzanine déplacées ensemble. Les volées B mezzanine → étages restent à leur emplacement initial à droite ; la nouvelle galerie les relie. L’escalier A autour de l’ascenseur, les sanitaires et le monte-charge sont conservés."
    },
    "12": {
      "f1": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] 0 — Report : conserver le terrain et financer seulement la documentation ; repli si l’usage I5 ou la solution de hauteur se révèle incompatible.",
      "f2": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] A — Densité source conservée : M01 24 postes, R2 40+24. Écarté dans le scénario de démonstration : confort et transitions insuffisamment étayés.",
      "f3": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] B — Recomposition lourde : modifier la coupe et/ou la mezzanine, puis redistribution. Réserve technique si aucune solution conservant la structure ne répond au programme ; coût non réputé couvert.",
      "f4": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] R — Confort d’usage : M01 10, R2 30+20, horaires décalés, supports existants. Choix privilégié pour poursuivre les études, avec correction des hauteurs comme condition impérative.",
      "f5": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] Contour et emprise constants ; même périmètre financier ; capacités, effets sur flux, impacts travaux et niveau de preuve explicites. Pas de note universelle de Qi.",
      "f6": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] R — confort d’usage, jauges modérées, fonctions distinctes et supports mutualisés sous conditions.",
      "f7": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] R traite d’abord les conflits d’usage avec peu d’interventions ; B reste le repli pour la coupe ; A n’est pas retenu ; 0 reste possible. Le scénario R n’est pas déclaré optimal hors de ces critères et hypothèses."
    },
    "13": {
      "f1": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] Confier géotechnique, fondations et PT à un BET ; hypothèse de sol ordinaire uniquement pour le budget. Aucun ferraillage, câble ou section réputé calculé.",
      "f2": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] Terrain horizontal utilisé pour démonstration graphique ; relevé à produire avant terrassements. Aucun mètre cube ni pente réelle déduit d’un fond satellite.",
      "f3": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] Provision raccordements/extérieurs 1,20 M MAD ; demander capacité des réseaux et tracés. Repli : équipement par phases, pas branchement présumé autorisé.",
      "f4": "[DONNÉE / CALCUL DU FICHIER SOURCE] Rampe source : largeur libre 4 m, pente centrale ≈ 14,55 %, palier -3,20 m. Choix : desserte technique séparée, drainage à étudier et autorisation explicite avant réalisation.",
      "f5": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] Mission sécurité indépendante ; jauges opérationnelles de l’exemple non équivalentes aux effectifs réglementaires. Démonstration d’évacuation nécessaire avant ouverture.",
      "f6": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] Diagnostics sol/eau/pollution et examen du contexte commandés au jalon J1. Pas de certificat d’absence de risque créé pour combler un champ.",
      "f7": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] J0 programme ; J1 site/sol ; J2 coupe/PT/incendie ; J3 budget actualisé ; J4 éventuel GO travaux. Aucun lot travaux attribué dans cet exemple.",
      "f8": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] Exploitation technique hors horaires d’accueil ; interventions sur rampe et sous-sol isolées des circulations publiques ; planning de maintenance préparé.",
      "f9": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] Livrables définis : relevé topo et accès, diagnostic de sol, coupe justifiée, note PT, étude incendie/accessibilité, avant-projet acoustique, estimation actualisée. Responsables aux étapes 20/21.",
      "f10": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] Faisabilité non certifiée ; réponse arrêtée = poursuivre les études ciblées. Le bâtiment dessiné est une base d’esquisse, pas un plan exécutable tel quel."
    },
    "14": {
      "f1": 3200000,
      "f2": 13500000,
      "f3": 1600000,
      "f4": 1200000,
      "f5": 2000000,
      "f6": 2500000,
      "f7": 1400000,
      "f8": 3600000,
      "f9": 10000000,
      "f10": 14000000,
      "f11": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] MAD ; tous les montants sont un jeu de données fictif de démonstration, pas un devis ou une cotation locale.",
      "f12": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] Investissement 24,00 M MAD = somme des six postes ; fonds propres 10,00 M + dette hypothétique 14,00 M = 24,00 M. Solde de financement-test 0. Recettes 1,80 M formation + 1,40 M bureaux + 0,40 M services. OPEX 1,40 M ; solde opérationnel 2,20 M avant dette, impôt et renouvellements non inclus. Études initiales 0,60 M comprises dans les honoraires. Pas de coût de financement ni de fiscalité inventés ; la dette est une hypothèse de source de fonds, pas une offre bancaire. V8.15 : incidence financière du monte-charge et des sanitaires non chiffrée ; budget à réviser."
    },
    "15": {
      "f1": 10,
      "f2": 10,
      "f3": 15,
      "f4": 10,
      "f5": 2,
      "f6": 6,
      "f7": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] Scénario : provision de renouvellement suivie séparément dans les études ; entretien inclus dans les 1,40 M MAD d’OPEX-test. Aucun cycle de vie certifié par ces montants.",
      "f8": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] CAPEX +10 % = 26,40 M, besoin additionnel 2,40 M si financement inchangé. Recettes 3,60 M × 0,85 × 0,90 = 2,754 M ; OPEX ×1,10 = 1,540 M ; solde opérationnel-test 1,214 M avant dette/impôt. Choc de taux +2 points sur 14 M : majorant simplifié +0,280 M/an avant amortissement. Retard 6 mois : décalage de recettes, pas cumul arbitraire des postes.",
      "f9": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] Seuil de financement-test : besoin 2,40 M non couvert sous choc CAPEX, donc nouvel arbitrage obligatoire. Seuil d’exploitation simplifié : recettes ≥ OPEX ; ne vaut pas seuil de solvabilité après dette/impôts. Aucun GO travaux sur le scénario défavorable sans financement révisé. V8.15 : incidence financière du monte-charge et des sanitaires non chiffrée ; budget à réviser."
    },
    "16": {
      "f1": "[DONNÉE / CALCUL DU FICHIER SOURCE] Contour S01 disponible ; sa présence permet la géométrie, pas la confirmation du titre. Mandat géomètre/notaire fictif : pièces opposables au jalon J1.",
      "f2": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] Accès par B.265–B.266 retenu comme scénario ; servitudes et raccordement à la voirie à instruire. Sans droit d’accès confirmé, suspendre le scénario plutôt que le déclarer valide.",
      "f3": "[DONNÉE / CALCUL DU FICHIER SOURCE] I5 du dossier conservé ; vérifier note site, destinations, hauteur et rampe avant permis. Aucun avis administratif réputé acquis.",
      "f4": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] BET et laboratoire : dossier sol et justification PT ; incohérence de hauteur portée en réserve critique. Aucun sondage ou essai fictivement réussi.",
      "f5": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] Capacité réseaux et contexte extérieur à relever. Hypothèses MapTiler distinguées des observations, capture ou altimétrie réelle non disponible.",
      "f6": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] Enquête future de positionnement et promesses éventuelles avant lancement ; données financières seulement illustratives.",
      "f7": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] Budget-test complet 24 M ; stress à 26,4 M non couvert ; condition de financement explicitement portée à la décision.",
      "f8": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] Mandats et assurances à contractualiser dans un projet réel ; l’exemple fournit objets et responsabilités, pas de signature ni contrat fictivement exécutoire.",
      "f9": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] Ordre retenu : géomètre/sol avant coupe définitive ; coupe avant note PT et coûts ; retour budget avant GO travaux ; pas de rétroplanning présenté comme une réservation réelle.",
      "f10": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] Réserves critiques identifiées et assorties d’une réponse : HAUTEURS → reprise de coupe ; RAMPE → autorisation/drainage ; SOL/PT → investigations ; ACCÈS → pièces ; MARCHÉ/FINANCE → validation du scénario. Elles restent ouvertes techniquement, mais aucune réponse n’est laissée à inventer par le lecteur."
    },
    "17": {
      "f1": 4,
      "f2": 2,
      "f3": 4,
      "f4": 2,
      "f5": 3,
      "f6": 4,
      "f7": 2,
      "f8": 2,
      "f9": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] Notes pédagogiques motivées, pas validation automatique : vision 4 (objectifs explicites) ; marché 2 (non enquêté) ; programme 4 (lié aux zones, jauges choisies) ; technique 2 (hauteurs/PT/rampe non justifiés) ; finance 3 (calcul complet mais fictif et sensible au stress) ; exploitation 4 (horaires et mutualisations définis) ; risques 2 (réserves critiques) ; preuve 2 (modèle disponible, avis manquants). Moyenne 2,875/5 illustrative. Les réserves bloquantes priment sur la moyenne ; pas de score Feng Shui."
    },
    "18": {
      "f1": "[DONNÉE / CALCUL DU FICHIER SOURCE] Base de travail 673 m² issue de 50 % de 1 346 m² ; l’autorisation reste conditionnelle.",
      "f2": "[DONNÉE / CALCUL DU FICHIER SOURCE] Contenance source : 1 346 m² ; contour calculé : 1 345,55 m² ; emprise dessinée : 673,00 m² ; contours de dalles cumulés : 3 666,45 m² ; dalles après trémies : 3 503,46 m² ; zones du programme : 2 953,51 m². Ces mesures ont des périmètres différents et ne sont pas des surfaces réglementaires certifiées.",
      "f3": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] Scénario R : 60 apprenants, 84 utilisateurs des postes, 16 visiteurs et 4 agents en pointe, non certification réglementaire.",
      "f4": "[DONNÉE / CALCUL DU FICHIER SOURCE] Sous-sol technique : 537,97 m² de zones ; 7 zones.\\nRDC : 548,00 m² de zones ; 11 zones.\\nMezzanine : 207,10 m² de zones ; 10 zones.\\nR+1 · Formation : 552,58 m² de zones ; 12 zones.\\nR+2 · Bureaux : 555,28 m² de zones ; 10 zones.\\nR+3 · Direction : 552,58 m² de zones ; 12 zones.\\n[DONNÉE / CALCUL DU FICHIER SOURCE] Haut modèle +16,60 m ; mezzanine partielle 301,45 m² de dalle. Géométrie source non corrigée silencieusement.",
      "f5": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] R — confort d’usage, jauges modérées, fonctions distinctes et supports mutualisés sous conditions.",
      "f6": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] Investissement de démonstration 24,00 M MAD ; enveloppe études initiales 0,60 M comprise ; pas de devis.",
      "f7": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] Recettes-test 3,60 M/an ; OPEX 1,40 M ; fonds propres 10,00 M + dette hypothétique 14,00 M. Stress : besoin additionnel 2,40 M.",
      "f8": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] J1 octobre 2026, J2 novembre 2026, J3 décembre 2026 ; cible d’ouverture de scénario septembre 2028, subordonnée aux décisions réelles.",
      "f9": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] Hauteurs, structure/PT, rampe, accès, sol et réalité du marché. Le bilan n’en masque aucune ; réponse et responsable fixés à l’étape 20.",
      "f10": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] Forces : géométrie reliée, surfaces traçables, usages séparés et jauges réduites. Faiblesses : conformité non démontrée, mobilier source encore dense, contexte non observé et budget fictif.",
      "f11": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] Condition de poursuite retenue : études seulement ; nouvelle revue avec preuves techniques, accès et financement avant chantier. Étoiles Volantes non déterminantes pour arbitrer ce scénario collectif."
    },
    "19": {
      "f1": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] R — confort d’usage, jauges modérées, fonctions distinctes et supports mutualisés sous conditions.",
      "f2": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] A densité source : écartée ; B travaux lourds : repli conditionnel ; 0 report : conservé si refus des destinations, hauteurs non résolues ou budget non soutenable.",
      "f3": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] Autoriser la production des preuves plutôt que simuler une autorisation de construire. Scénario choisi au regard des critères de confort, lisibilité, réversibilité et maintien de l’emprise.",
      "f4": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] Décision fictive : GO sous conditions pour 0,60 M MAD d’études initiales seulement, incluse dans les 1,60 M d’honoraires ; aucun chantier, aucun recrutement d’exploitant et aucune ouverture autorisés.",
      "f5": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] Hauteurs source, rampe, sol/PT, accès, marché et financement : réserves assumées et explicites.",
      "f6": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] J1 documentation site et sol ; J2 coupe/structure/incendie/accessibilité ; J3 budget et recettes vérifiés. Si échec d’une condition bloquante : report ou reprise B, pas GO automatique.",
      "f7": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] Comité du maître d’ouvrage P.118 — rôle fictif de démonstration ; aucune identité ni signature réelle.",
      "f8": "2026-09-28",
      "f9": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] Parcours V8.1 · exemple résolu P.118 · géométrie source V8 inchangée ; registre des choix 01 à 21.",
      "f10": "2026-10-26",
      "decision": "GO sous conditions"
    },
    "20": {
      "f1": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] Lot études initiales : géomètre/sol, architecte, BET PT/incendie/fluides, acoustique, économie et marché. Engagement seulement fictif pour illustrer le parcours.",
      "f2": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] Rôles attribués : géomètre (site) ; architecte (coupe et coordination) ; BET structure (PT), BET sécurité/fluides, acousticien, économiste ; maître d’ouvrage arbitre.",
      "f3": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] Programmiste : exigences ; architecte : synthèse ; BET : notes signées de leur discipline dans un vrai projet ; MOA : acceptation et budget. Aucune validation ne revient au score Harmony.",
      "f4": "[DONNÉE / CALCUL DU FICHIER SOURCE] S01, I5 source, modèle de l’Atelier, 74 fiches, intentions Harmonie, budget-test et registre des réserves.",
      "f5": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] Relevé et visite avant conception définitive ; variantes en coupe ; calculs spécialistes ; test de circulation/mobilier ; revue économique. Les cartes directionnelles non établies ne bloquent pas la lecture du cas.",
      "f6": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] Topo/contextes, rapport sol, coupe justifiée, note PT, stratégie incendie/accessibilité, note acoustique, chiffrage et étude de demande. Chaque livrable est relié à une réserve identifiée.",
      "f7": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] Répartition des 0,60 M MAD d’études initiales : géomètre/sol 0,12 ; architecte 0,18 ; BET 0,16 ; acoustique 0,05 ; marché/économie 0,05 ; coordination 0,04. Somme 0,60 ; montants fictifs inclus dans le poste études.",
      "f8": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] J1 : 26/10/2026 ; J2 : 23/11/2026 ; J3 : 21/12/2026. Dates de démonstration, sans réservation de ressources réelles.",
      "f9": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] Pas de dimensionnement fondations avant sol ; pas de budget définitif avant coupe/PT ; pas de GO travaux avant accès, autorisations et financement.",
      "f10": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] J1 valider les données ; J2 arbitrer la coupe et les interfaces ; J3 réviser financement et décider des travaux séparément. Les conditions non levées restent visibles dans le transfert."
    },
    "21": {
      "summary": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] Dossier de transmission entièrement illustré : parcelle, programme, modèle source, écarts explicités, budget-test, 21 décisions Harmonie, 62 réponses par zone et conditions d’étude. Transfert n’est pas autorisation de travaux.",
      "f1": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] Transmettre au coordinateur architecte et à la MOA fictive le dossier V8.1 ; décision limitée aux études.",
      "f2": "[DONNÉE / CALCUL DU FICHIER SOURCE] S01 / I5 source / modèle natif / 74 fiches / géométrie et surfaces. Aucun relevé MapTiler réel ajouté.",
      "f3": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] Priorités : hauteurs, rampe, PT/sol, séparation des flux et jauges cibles ; réserves avec réponse affectée à chaque métier.",
      "f4": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] Budgets et jalons de l’étape 20, tous pédagogiques ; prochaine revue 26/10/2026.",
      "f5": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] Reprise acceptée seulement après contrôle des versions et pièces. Aucun champ « validé » inventé ; les avis spécialistes seront des livrables réels dans un vrai projet.",
      "f6": "[HYPOTHÈSE RETENUE POUR L’EXEMPLE] Conception détaillée puis aménagement : matériaux mats et ambiances adaptées à l’usage ; retour utilisateurs après occupation, traité comme mission future et non comme un résultat observé."
    }
  },
  "siteObservations": {
    "frontageEdge": 3,
    "approachStatus": "hypothesis",
    "priority": "balanced",
    "frontContext": "open",
    "backContext": "vegetation",
    "source": "S01 / géoréférencement du dossier ; H-ACCES et H-CONTEXTE. Aucune observation MapTiler en direct.",
    "note": "Scénario A : approche latérale ouverte, arrière protégé par un filtre paysager projeté. Scénario B : voisin hypothétique de 12 m à 10 m pour l’étude des masques. Aucun de ces scénarios ne décrit une observation MapTiler réelle.",
    "observedAt": null,
    "geographic": {
      "longitude": -7.319682410174416,
      "latitude": 33.708221167915354,
      "source": "Conversion de travail EPSG:26191 depuis S01 — non relevé terrain",
      "at": "2026-09-30"
    }
  },
  "issueAnswers": {
    "HEIGHT": "Reprise de coupe et étude de neutralisation/réaffectation de mezzanine si nécessaire ; jalon J2 ; aucun chantier avant solution.",
    "DENSITY": "Capacités cibles abaissées au programme ; mobilier source à adapter sur copie de conception. Pas de surface supplémentaire.",
    "MEZZ": "Réduire la densité, traiter bruit/intimité/rive ; aucune occupation autorisée avant résolution des hauteurs et sécurité.",
    "RAMP": "Séparer service et public ; étudier accès autorisé, drainage et soutènement au jalon J2.",
    "CONTEXT": "Utiliser les deux scénarios de contexte renseignés ; relevé/MapTiler/visite confiés au géomètre. Aucun lecteur obligé de fournir une observation pour lire le cas.",
    "COMPASS": "Lecture de Forme et d’usage retenue ; approche directionnelle non décisionnelle dans cet exemple collectif.",
    "FLYING": "Ne pas établir une carte natale fictive ; hypothèse temporelle renseignée et méthode non mobilisée pour cet arbitrage."
  },
  "demoRole": "Programmiste / architecte — rôles fictifs de démonstration"
}
`,Fm=`{
  "sourceVersion": "8.19.0",
  "sourceBlock": "p118-resolved-template → native.domains.nativeParcel ; SEED888_FILES.kmz → donnees/Bornes_Lambert_S01.csv et Notice.txt",
  "exampleId": "p118-exemple-complet",
  "parcelNumber": "118",
  "commune": "El Mansouria",
  "crs": "EPSG:26191",
  "crsHypothesis": "Merchich / Nord Maroc (EPSG:26191), hypothèse cohérente avec Parcelle ; la feuille source indique LAMBERT sans numéro EPSG. Transformation Merchich vers WGS84 (1), translations +31 / +146 / +47 m, précision annoncée de 7 m dans la base EPSG (Notice.txt du KMZ).",
  "units": "m",
  "vertexOrder": [
    "B.266",
    "B.267",
    "B.268",
    "B.265"
  ],
  "vertices": [
    {
      "id": "B.266",
      "frame": "cadastral",
      "crs": "EPSG:26191",
      "x": 321946.82,
      "y": 347183.88
    },
    {
      "id": "B.267",
      "frame": "cadastral",
      "crs": "EPSG:26191",
      "x": 321954.11,
      "y": 347215.38
    },
    {
      "id": "B.268",
      "frame": "cadastral",
      "crs": "EPSG:26191",
      "x": 321995.84,
      "y": 347186.25
    },
    {
      "id": "B.265",
      "frame": "cadastral",
      "crs": "EPSG:26191",
      "x": 321978.68,
      "y": 347161.67
    }
  ],
  "bornesWgs84FromSource": [
    {
      "id": "B.266",
      "lambert": {
        "frame": "cadastral",
        "crs": "EPSG:26191",
        "x": 321946.82,
        "y": 347183.88
      },
      "wgs84": {
        "frame": "geographic",
        "lat": 33.7081855041431,
        "lon": -7.319922453164
      }
    },
    {
      "id": "B.267",
      "lambert": {
        "frame": "cadastral",
        "crs": "EPSG:26191",
        "x": 321954.11,
        "y": 347215.38
      },
      "wgs84": {
        "frame": "geographic",
        "lat": 33.7084707585474,
        "lon": -7.3198500513508
      }
    },
    {
      "id": "B.268",
      "lambert": {
        "frame": "cadastral",
        "crs": "EPSG:26191",
        "x": 321995.84,
        "y": 347186.25
      },
      "wgs84": {
        "frame": "geographic",
        "lat": 33.7082150069432,
        "lon": -7.3193940264975
      }
    },
    {
      "id": "B.265",
      "lambert": {
        "frame": "cadastral",
        "crs": "EPSG:26191",
        "x": 321978.68,
        "y": 347161.67
      },
      "wgs84": {
        "frame": "geographic",
        "lat": 33.7079905153165,
        "lon": -7.3195742942528
      }
    }
  ],
  "areaLambert": 1345.5475500009647,
  "officialArea": 1346,
  "correctedAreaPrinted": 1346.4787,
  "perimeter": 152.0388631092568,
  "sideLengths": [
    32.332554801618976,
    50.89154939676699,
    29.97735812245502,
    38.837400788415806
  ],
  "centroid": {
    "frame": "cadastral",
    "crs": "EPSG:26191",
    "x": 321969.1332212173,
    "y": 347187.4245213032
  },
  "notice": "LOT 118 — RECONSTRUCTION CADASTRALE S01\\nSource : Calcul contenance_T61833-25 cl_Signed_GLOBAL (1).pdf\\nLes coordonnées Lambert de la feuille cadastrale sont conservées à l’identique. Conversion de localisation : Merchich / Nord Maroc (EPSG:26191), hypothèse cohérente avec Parcelle ; la feuille source indique LAMBERT sans numéro EPSG. Transformation Merchich vers WGS84 (1), translations +31 / +146 / +47 m, précision annoncée de 7 m dans la base EPSG. Cette précision de localisation est distincte de la précision numérique des coordonnées. Les cotes affichées sont calculées dans le plan Lambert. Les outils de mesure de Google Earth peuvent donner des valeurs légèrement différentes (projection et modèle de mesure). La contenance adoptée ne sert pas à redimensionner le contour. Altitudes non fournies : tracé plaqué au sol.\\n\\nLongueurs Lambert : 32,33 m, 50,89 m, 29,98 m, 38,84 m.\\nPérimètre Lambert : 152,04 m.\\nSurface Lambert : 1 345,54755 m².\\nContenance adoptée inscrite : 1 346 m².\\n\\nLe contour utilise exclusivement les quatre bornes de la page 1, sans ajustement sur une image satellite.\\nLe CSV joint conserve les coordonnées source. Aucun service distant n’est nécessaire pour les icônes.\\nDocumentation du format : https://developers.google.com/kml/documentation/kmzarchives\\n\\n\\nCOMPLÉMENT — TRACÉS INTÉRIEURS DU DOCUMENT CADASTRAL\\nPage 1 : trois constructions en tirets, activées par défaut.\\n- Perpendiculaire issue de B.266 sur B.267–B.268 : cote inscrite 30,0 m.\\n- Diagonale B.266–B.268 : cote inscrite 49,1 m.\\n- Perpendiculaire issue de B.265 sur B.266–B.268 : cote inscrite 23,7 m.\\nLe côté B.267–B.268 porte sa cote inscrite de 50,9 m.\\nLes coordonnées des quatre bornes restent inchangées. Les deux pieds H1 et H2\\nsont des constructions calculées, et non des bornes cadastrales supplémentaires.\\nLes valeurs exactes calculées sont détaillées dans les fiches et le CSV joint.\\nLa contenance graphique inscrite de 1345,3350 m² est conservée séparément.\\nLes deux pages et les octets du PDF source sont intégrés pour conserver tous\\nles tracés et annotations d’origine, y compris les indications hors parcelle\\ndont les coordonnées ne sont pas fournies. Ces dernières ne sont pas inventées\\ncomme géométries cartographiques. Les deux périmètres dessinés dans le PDF\\nreprésentent la même parcelle : un seul contour géographique est tracé.\\n"
}
`,lr=JSON.parse(Jm).steps,ir=JSON.parse(wm),mn=JSON.parse(Fm),dd="Version de consultation · sans serveur de données";function sr(O){return String(O).padStart(2,"0")}function km(){var Ye,Ue;const[O,te]=Cn.useState("home"),[Y,g]=Cn.useState("accueil"),[P,G]=Cn.useState(null),[pe,Ae]=Cn.useState(!1),[L,T]=Cn.useState("");Cn.useEffect(()=>{document.title="Fadi — Espace de travail"},[]);function H(_="accueil"){te("project"),g(_),G(null),T(""),window.scrollTo(0,0)}function ne(){te("home"),G(null),T(""),window.scrollTo(0,0)}function w(_){g(_),G(null),window.scrollTo(0,0)}const I=P===null?null:lr.find(_=>_.number===P)??null,ee=I?ir.steps[String(I.number)]:null;return f.jsxs("div",{className:"app-shell fadi-shell","data-sidebar":pe?"expanded":"collapsed",children:[f.jsxs("aside",{className:"app-sidebar","aria-label":"Navigation Fadi",children:[f.jsxs("button",{type:"button",className:"app-brand front-brand",onClick:ne,title:"Fadi · Accueil","aria-label":"Accueil Fadi",children:[f.jsx(pt,{name:"home",size:28}),f.jsx("span",{className:"sidebar-label app-brand-text",children:"Fadi"})]}),f.jsxs("button",{type:"button",className:"sidebar-toggle",onClick:()=>Ae(_=>!_),"aria-label":"Afficher ou masquer la navigation",children:[f.jsx(pt,{name:"chevron-right"}),f.jsx("span",{className:"sidebar-label",children:"Réduire / développer"})]}),f.jsxs("nav",{className:"app-nav",children:[f.jsxs("button",{type:"button",className:O==="home"?"active":"",onClick:ne,children:[f.jsx(pt,{name:"home"}),f.jsx("span",{className:"sidebar-label",children:"Accueil"})]}),f.jsxs("button",{type:"button",className:O==="projects"||O==="project"?"active":"",onClick:()=>te("projects"),children:[f.jsx(pt,{name:"folder"}),f.jsx("span",{className:"sidebar-label",children:"Projets"})]}),f.jsxs("button",{type:"button",onClick:()=>H("collaboration"),children:[f.jsx(pt,{name:"people"}),f.jsx("span",{className:"sidebar-label",children:"Collaboration"})]})]}),f.jsxs("nav",{className:"app-nav-secondary",children:[f.jsxs("button",{type:"button",onClick:()=>te("library"),children:[f.jsx(pt,{name:"book"}),f.jsx("span",{className:"sidebar-label",children:"Bibliothèque"})]}),f.jsxs("a",{href:"/?logout=1",title:"Déconnexion",children:[f.jsx(pt,{name:"arrow-right"}),f.jsx("span",{className:"sidebar-label",children:"Déconnexion"})]})]})]}),f.jsxs("div",{className:"app-main",children:[f.jsxs("header",{className:"app-topbar fadi-topbar",children:[f.jsxs("div",{className:"fadi-topbar-title",children:[f.jsx("h1",{children:O==="home"?"Bonjour admin,":O==="projects"?"Projets":O==="library"?"Bibliothèque des bâtiments":"P.118 — Formation & bureaux"}),f.jsxs("p",{children:[f.jsx("strong",{children:O==="home"?"Bienvenue dans Fadi.":"Espace de travail Fadi"}),f.jsx("span",{children:dd})]})]}),f.jsxs("div",{className:"fadi-topbar-actions",children:[f.jsx("button",{type:"button",className:"topbar-icon",onClick:ne,title:"Accueil","aria-label":"Accueil",children:f.jsx(pt,{name:"home"})}),f.jsx("span",{className:"front-version",children:"FadiFront"})]})]}),f.jsxs("main",{id:"workspace-content",className:"front-workspace",children:[f.jsxs("div",{className:"front-static-alert",role:"status",children:[f.jsx(pt,{name:"proof",size:17})," Instance statique basée sur Fadi · connexion locale · modifications de projet et synchronisation non disponibles."]}),O==="home"&&f.jsxs(f.Fragment,{children:[f.jsx("h2",{children:"Accueil de Fadi"}),f.jsx("p",{children:"De l’idée à la décision : Fadi accompagne l’analyse d’un site et la conception d’un projet immobilier."}),f.jsxs("section",{className:"front-panels",children:[f.jsxs("article",{className:"panel front-hero",children:[f.jsx("span",{className:"eyebrow",children:"Dossier de référence · extrait du dépôt Fadi"}),f.jsx("h3",{children:"P.118 — Formation & bureaux"}),f.jsx("p",{children:ir.summary}),f.jsxs("button",{className:"button-primary",type:"button",onClick:()=>H(),children:["Ouvrir le dossier P.118 ",f.jsx(pt,{name:"arrow-right",size:16})]})]}),f.jsxs("article",{className:"panel",children:[f.jsx("span",{className:"eyebrow",children:"21 étapes"}),f.jsx("h3",{children:"Parcours du projet"}),f.jsx("p",{children:"Consultez la trame métier originale et les décisions documentées de l’exemple."}),f.jsx("button",{type:"button",className:"button-secondary",onClick:()=>H("parcours"),children:"Explorer Parcours"})]})]}),f.jsx("h2",{children:"Modules du projet"}),f.jsx("div",{className:"front-module-grid",children:ji.map(_=>f.jsxs("button",{type:"button",className:"front-module-card",onClick:()=>H(_.id),children:[f.jsx("strong",{children:_.label}),f.jsx("span",{children:_.id==="parcours"?"21 étapes disponibles en consultation":"Découvrir le module"}),f.jsx(pt,{name:"arrow-right"})]},_.id))})]}),O==="projects"&&f.jsxs(f.Fragment,{children:[f.jsxs("div",{className:"front-page-head",children:[f.jsx("h2",{children:"Projets"}),f.jsx("button",{className:"button-primary",onClick:()=>H(),children:"Ouvrir P.118"})]}),f.jsxs("article",{className:"panel front-project",children:[f.jsx("span",{className:"eyebrow",children:"Exemple intégré — consultation"}),f.jsx("h3",{children:"P.118 — Formation & bureaux"}),f.jsxs("p",{children:["21 étapes · parcelle 118 · ",mn.officialArea," m²"]}),f.jsx("button",{className:"button-primary",onClick:()=>H(),children:"Ouvrir le projet"})]})]}),O==="library"&&f.jsxs(f.Fragment,{children:[f.jsx("h2",{children:"Bibliothèque des bâtiments"}),f.jsx("p",{children:"Le module complet (10 types / 21 cas) nécessite actuellement les services de Fadi. La bibliothèque sera activée dans la version avec API."}),f.jsx("button",{className:"button-secondary",onClick:()=>H("programmation"),children:"Voir Programmation"})]}),O==="project"&&f.jsxs(f.Fragment,{children:[f.jsxs("nav",{"aria-label":"Modules du projet",className:"module-nav front-module-nav",children:[f.jsx("button",{type:"button","aria-current":Y==="accueil"?"page":void 0,onClick:()=>w("accueil"),children:"Accueil du projet"}),f.jsx("button",{type:"button","aria-current":Y==="pilotage"?"page":void 0,onClick:()=>w("pilotage"),children:"Feuille de route"}),ji.map(_=>f.jsx("button",{type:"button","aria-current":Y===_.id?"page":void 0,onClick:()=>w(_.id),children:_.label},_.id))]}),Y==="accueil"&&f.jsxs("div",{className:"front-detail",children:[f.jsx("span",{className:"eyebrow",children:"Identité du projet"}),f.jsx("h2",{children:"P.118 — Formation & bureaux"}),f.jsx("p",{children:ir.summary}),f.jsxs("div",{className:"front-facts",children:[f.jsxs("div",{children:[f.jsxs("b",{children:[mn.officialArea.toLocaleString("fr-FR")," m²"]}),f.jsx("span",{children:"Surface cadastrale"})]}),f.jsxs("div",{children:[f.jsx("b",{children:"21"}),f.jsx("span",{children:"Étapes de Parcours"})]}),f.jsxs("div",{children:[f.jsx("b",{children:mn.commune}),f.jsx("span",{children:"Commune"})]})]}),f.jsx("button",{className:"button-primary",onClick:()=>w("parcours"),children:"Ouvrir les 21 étapes"})]}),Y==="parcours"&&f.jsx("section",{className:"front-detail",children:I===null?f.jsxs(f.Fragment,{children:[f.jsx("span",{className:"eyebrow",children:"Parcours du projet · 01–21"}),f.jsx("h2",{children:"Les 21 étapes du Parcours"}),f.jsx("p",{children:"Définitions et données de l’exemple P.118 provenant des fichiers sources de Fadi."}),f.jsx("div",{className:"front-step-grid",children:lr.map(_=>f.jsxs("button",{className:"front-step",onClick:()=>{G(_.number),window.scrollTo(0,0)},children:[f.jsx("span",{className:"front-step-num",children:sr(_.number)}),f.jsx("small",{children:_.phase}),f.jsx("strong",{children:_.title})]},_.number))})]}):f.jsxs(f.Fragment,{children:[f.jsx("button",{type:"button",className:"button-secondary",onClick:()=>G(null),children:"← Les 21 étapes"}),f.jsxs("span",{className:"eyebrow",children:["Étape ",sr(I.number)," / 21 · ",I.phase]}),f.jsx("h2",{children:I.title}),f.jsx("p",{children:I.goal}),f.jsxs("div",{className:"front-content-grid",children:[f.jsxs("section",{className:"panel",children:[f.jsx("h3",{children:"But et méthodologie"}),f.jsxs("p",{children:[f.jsx("strong",{children:"Données d’entrée :"})," ",I.inputs]}),f.jsxs("p",{children:[f.jsx("strong",{children:"Méthode :"})," ",I.method]}),f.jsxs("p",{children:[f.jsx("strong",{children:"Livrable :"})," ",I.deliverable]})]}),f.jsxs("section",{className:"panel",children:[f.jsx("h3",{children:"Exemple résolu P.118"}),f.jsx("p",{children:f.jsx("strong",{children:(ee==null?void 0:ee.headline)??"Décision non renseignée"})}),f.jsx("p",{children:(ee==null?void 0:ee.decision)??"Aucun résultat fourni"}),f.jsxs("p",{children:[f.jsx("strong",{children:"Justification :"})," ",(ee==null?void 0:ee.why)??"Non documentée"]})]})]}),(ee==null?void 0:ee.result)&&f.jsxs("section",{className:"panel",children:[f.jsx("h3",{children:"Données et hypothèses"}),f.jsx("p",{children:ee.result.donnee}),f.jsx("p",{children:ee.result.hypothese})]}),f.jsxs("div",{className:"front-step-actions",children:[f.jsx("button",{onClick:()=>G(Math.max(1,I.number-1)),disabled:I.number===1,children:"← Précédente"}),f.jsx("button",{onClick:()=>G(Math.min(21,I.number+1)),disabled:I.number===21,children:"Suivante →"})]})]})}),Y==="projets-sources"&&f.jsxs("section",{className:"front-detail",children:[f.jsxs("h2",{children:["Site existant · Parcelle ",mn.parcelNumber]}),f.jsxs("div",{className:"front-facts",children:[f.jsxs("div",{children:[f.jsxs("b",{children:[mn.officialArea.toLocaleString("fr-FR")," m²"]}),f.jsx("span",{children:"Surface officielle"})]}),f.jsxs("div",{children:[f.jsxs("b",{children:[mn.perimeter.toFixed(2)," m"]}),f.jsx("span",{children:"Périmètre calculé"})]}),f.jsxs("div",{children:[f.jsx("b",{children:mn.crs}),f.jsx("span",{children:"Système de coordonnées"})]})]}),f.jsxs("table",{className:"front-table",children:[f.jsx("thead",{children:f.jsxs("tr",{children:[f.jsx("th",{children:"Borne"}),f.jsx("th",{children:"X Lambert"}),f.jsx("th",{children:"Y Lambert"})]})}),f.jsx("tbody",{children:mn.vertices.map(_=>f.jsxs("tr",{children:[f.jsx("th",{children:_.id}),f.jsx("td",{children:_.x.toFixed(2)}),f.jsx("td",{children:_.y.toFixed(2)})]},_.id))})]}),f.jsxs("p",{children:["Outil Parcelle natif : ",f.jsx("a",{href:"/parcelle/index.html",target:"_blank",rel:"noreferrer",children:"ouvrir l’outil autonome"}),". Sans API, ses transmissions vers le modèle ne sont pas disponibles."]})]}),Y==="pilotage"&&f.jsxs("section",{className:"front-detail",children:[f.jsx("h2",{children:"Feuille de route"}),f.jsx("p",{children:"Le suivi multi-utilisateur et la persistance serveur ne sont pas disponibles en mode statique."}),f.jsx("div",{className:"front-step-grid",children:lr.map(_=>f.jsxs("button",{className:"front-step",onClick:()=>{w("parcours"),G(_.number)},children:[f.jsx("span",{children:sr(_.number)}),f.jsx("strong",{children:_.title})]},_.number))})]}),!["accueil","parcours","projets-sources","pilotage"].includes(Y)&&f.jsxs("section",{className:"front-detail",children:[f.jsx("span",{className:"eyebrow",children:dd}),f.jsx("h2",{children:((Ye=ji.find(_=>_.id===Y))==null?void 0:Ye.label)??"Module"}),f.jsx("p",{children:(Ue=ji.find(_=>_.id===Y))==null?void 0:Ue.status}),f.jsxs("div",{className:"front-unavailable",role:"status",children:[f.jsx(pt,{name:"flag",size:20}),f.jsxs("div",{children:[f.jsx("strong",{children:"Fonctions métier temporairement indisponibles"}),f.jsx("p",{children:"Ce module utilise les services Node.js et PostgreSQL/PostGIS de Fadi. Il ne serait pas fiable de simuler des enregistrements ou un modèle architectural sans ces services."})]})]}),Y==="atelier"&&f.jsx("p",{children:"La véritable interface d’Atelier est conservée dans le dépôt Fadi. Elle pourra être activée dès le déploiement de l’API et du stockage persistant."})]})]}),L&&f.jsx("p",{role:"status",children:L}),f.jsx("footer",{className:"front-footer",children:"FadiFront — consultation de démonstration. Données métier issues du dépôt RachEma-ux/Fadi. Aucun enregistrement serveur."})]})]})]})}const pd=document.getElementById("root");if(!pd)throw new Error("Root missing");Qm.createRoot(pd).render(f.jsx(Cn.StrictMode,{children:f.jsx(km,{})}));
