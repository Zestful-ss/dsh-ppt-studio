globalThis.__ModuleLoader__?.load({id:'dsh-ppt-studio',factory:require=>{
 const React=require('react'),h=React.createElement;
 const {useState,useEffect,useRef,useCallback,useMemo}=React;

 const css=`
 .pts{height:100%;min-height:0;display:flex;flex-direction:column;font-family:inherit;color:var(--dsw-alias-label-primary,#202024);font-size:12px;background:var(--dsw-alias-bg-layer-1,#fff);container-type:inline-size;container-name:ppt-studio}
 .pts *{box-sizing:border-box}
 .pts-bar{display:flex;align-items:center;gap:6px;padding:6px 8px;border-bottom:1px solid var(--dsw-alias-border-main,#e6e6ea);flex-wrap:wrap;flex:none}
 .pts-bar select,.pts-bar input{font:inherit;color:inherit;background:var(--dsw-alias-bg-layer-2,#f6f6f8);border:1px solid var(--dsw-alias-border-main,#dedee3);border-radius:6px;padding:3px 6px;min-width:0}
 .pts-bar select{max-width:190px}
 .pts button{font:inherit;font-size:12px;border:1px solid var(--dsw-alias-border-main,#dedee3);border-radius:6px;background:transparent;color:inherit;cursor:pointer;padding:4px 8px;white-space:nowrap}
 .pts button:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,#f1f1f3)}
 .pts button:disabled{opacity:.45;cursor:default}
 .pts button.on{background:var(--dsw-alias-interactive-bg-active,#e8e8ee);border-color:var(--dsw-alias-label-tertiary,#9a9aa2)}
 .pts button.primary{background:#e24b2b;border-color:#e24b2b;color:#fff}
 .pts-spacer{flex:1}
 .pts-body{flex:1;min-height:0;display:flex;overflow:hidden}
 .pts-thumbs{width:104px;flex:none;overflow-y:auto;border-right:1px solid var(--dsw-alias-border-main,#e6e6ea);padding:6px;display:flex;flex-direction:column;gap:6px}
 .pts-thumb{border:1px solid var(--dsw-alias-border-main,#dedee3);border-radius:6px;background:#fff;cursor:pointer;padding:0;overflow:hidden;position:relative;flex:none}
 .pts-thumb.on{border-color:#e24b2b;box-shadow:0 0 0 1px #e24b2b}
 .pts-thumb .n{position:absolute;left:3px;top:2px;font-size:10px;color:#9a9aa2;background:#fff;border-radius:3px;padding:0 3px;z-index:1;pointer-events:none}
 .pts-main{flex:1;min-width:0;min-height:0;display:flex;overflow:hidden}
 .pts-stage{flex:1;min-width:0;min-height:0;overflow:auto;padding:10px;display:flex;align-items:center;justify-content:center;background:var(--dsw-alias-bg-layer-2,#f4f4f6)}
 .pts-canvas{position:relative;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.14);flex:none;touch-action:none}
 .pts-el{position:absolute;user-select:none;cursor:move}
 .pts-el.sel{outline:1.5px solid #e24b2b;outline-offset:1px}
 .pts-el.sel .pts-handle{display:block}
 .pts-el-text{white-space:pre-wrap;overflow:hidden;word-break:break-word}
 .pts-handle{display:none;position:absolute;width:9px;height:9px;margin:0;padding:0;border:1px solid #e24b2b;background:#fff;border-radius:2px;box-sizing:border-box;transform:translate(-50%,-50%);z-index:4}
 .pts-handle.rot{border-radius:50%;cursor:grab}
 .pts-handle[data-handle=nw],.pts-handle[data-handle=se]{cursor:nwse-resize}
 .pts-handle[data-handle=ne],.pts-handle[data-handle=sw]{cursor:nesw-resize}
 .pts-handle[data-handle=n],.pts-handle[data-handle=s]{cursor:ns-resize}
 .pts-handle[data-handle=e],.pts-handle[data-handle=w]{cursor:ew-resize}
 .pts-edit{position:absolute;z-index:6;border:1.5px solid #e24b2b;background:#fff;color:#111;resize:none;padding:0;margin:0;font-family:inherit;line-height:1.25;overflow:hidden;outline:none;box-sizing:border-box}
 .pts-cell-edit{width:100%;height:100%;border:1.5px solid #e24b2b;background:#fff;color:inherit;font:inherit;padding:3px 6px;margin:0;outline:none;resize:none;box-sizing:border-box;line-height:1.25}
 .pts-format{display:flex;align-items:center;gap:6px;padding:5px 8px;border-bottom:1px solid var(--dsw-alias-border-main,#e6e6ea);flex-wrap:wrap;flex:none;background:var(--dsw-alias-bg-layer-1,#fff)}
 .pts-format input[type=number]{width:58px}
 .pts-format input[type=color]{width:30px;height:24px;padding:1px}
 .pts-format select{max-width:120px}
 .pts-mark{position:absolute;border:1.5px dashed #e24b2b;background:rgba(226,75,43,.10);pointer-events:none}
 .pts-side{width:240px;flex:none;border-left:1px solid var(--dsw-alias-border-main,#e6e6ea);overflow-y:auto;padding:8px;display:flex;flex-direction:column;gap:8px}
 @container ppt-studio (max-width:760px){.pts-main{flex-direction:column}.pts-side{width:100%;max-height:38%;border-left:0;border-top:1px solid var(--dsw-alias-border-main,#e6e6ea)}}
 .pts-field{display:flex;flex-direction:column;gap:3px}
 .pts-field label{font-size:11px;color:var(--dsw-alias-label-secondary,#77777f)}
 .pts-field input,.pts-field textarea,.pts-field select{font:inherit;color:inherit;background:var(--dsw-alias-bg-layer-2,#f6f6f8);border:1px solid var(--dsw-alias-border-main,#dedee3);border-radius:6px;padding:4px 6px;width:100%}
 .pts-field textarea{min-height:72px;resize:vertical;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px}
 .pts-row{display:flex;gap:6px}
 .pts-row>*{flex:1;min-width:0}
 .pts-note{font-size:11px;line-height:1.6;color:var(--dsw-alias-label-secondary,#77777f)}
 .pts-error{color:#c4432b;font-size:11px;line-height:1.6;white-space:pre-wrap}
 .pts-ok{color:#1c7c4a;font-size:11px;line-height:1.6;white-space:pre-wrap;word-break:break-all}
 .pts-empty{padding:24px;text-align:center;color:var(--dsw-alias-label-secondary,#77777f);font-size:12px;line-height:1.8}
 .pts-markbar{display:flex;gap:6px;align-items:center;padding:6px 8px;border-top:1px solid var(--dsw-alias-border-main,#e6e6ea);flex:none;flex-wrap:wrap;background:var(--dsw-alias-bg-layer-1,#fff)}
 .pts-markbar input{flex:1;min-width:120px;font:inherit;color:inherit;background:var(--dsw-alias-bg-layer-2,#f6f6f8);border:1px solid var(--dsw-alias-border-main,#dedee3);border-radius:6px;padding:4px 6px}
 .pts-ico{width:14px;height:14px;display:block}
 .pts-tag{font-size:10px;padding:2px 6px;border-radius:4px;border:1px solid var(--dsw-alias-border-main,#dedee3);color:var(--dsw-alias-label-secondary,#77777f);background:var(--dsw-alias-bg-layer-2,#f6f6f8)}
 .pts-tag.active{background:rgba(28,124,74,.10);color:#1c7c4a;border-color:rgba(28,124,74,.3)}
 .pts-tag.warn{background:rgba(226,75,43,.10);color:#c4432b;border-color:rgba(226,75,43,.3)}
 .pts-pill{display:inline-flex;align-items:center;font-size:11px;padding:2px 6px;border-radius:12px;background:var(--dsw-alias-interactive-bg-hover,#f1f1f3);color:var(--dsw-alias-label-secondary,#77777f)}
 .pts-card{border:1px solid var(--dsw-alias-border-main,#e6e6ea);border-radius:8px;padding:12px;margin-top:10px;background:var(--dsw-alias-bg-layer-1,#fff);display:flex;flex-direction:column;gap:8px}
 .pts-flex{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
 .pts-set{display:block;max-width:760px;padding:28px 30px 44px;font-size:13px;line-height:1.65}
 .pts-set-title{font-size:22px;font-weight:650;letter-spacing:-.3px;margin:0 0 6px}
 .pts-set-lead{margin:0 0 18px;color:var(--dsw-alias-label-secondary,#77777f);font-size:13px;line-height:1.7}
 .pts-set-toggle{display:inline-flex;align-items:center;gap:8px;cursor:pointer;padding:8px 12px;border:1px solid var(--dsw-alias-border-main,#e6e6ea);border-radius:8px;background:var(--dsw-alias-bg-layer-2,#f6f6f8)}
 .pts-set-toggle input{accent-color:#e24b2b}
 .pts-set-section{margin-top:26px;padding-top:22px;border-top:1px solid var(--dsw-alias-border-main,#ececf0)}
 .pts-set-head{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap;margin-bottom:14px}
 .pts-set-head h3{font-size:17px;font-weight:600;margin:0 0 4px}
 .pts-set-head p{margin:0;color:var(--dsw-alias-label-secondary,#77777f);font-size:12px}
 .pts-set-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
 .pts-set .pts-set-actions button{padding:6px 12px}
 .pts-set-alert{margin:0 0 12px;padding:8px 10px;border-radius:8px;background:rgba(196,67,43,.08)}
 .pts-set-job{margin:0 0 14px;padding:12px 14px;border-radius:10px;background:var(--dsw-alias-bg-layer-2,#f4f4f6);font-size:12px}
 .pts-set-log{margin-top:6px;max-height:96px;overflow:auto;font-size:11px;color:var(--dsw-alias-label-secondary,#77777f);font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
 .pts-set-form{margin:0 0 16px;padding:16px;border:1px solid var(--dsw-alias-border-main,#e6e6ea);border-radius:12px;display:flex;flex-direction:column;gap:10px;background:var(--dsw-alias-bg-layer-1,#fff)}
 .pts-set-form strong{font-size:13px;font-weight:600}
 .pts-set-filters{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:2px 0 14px}
 .pts-set-segments{display:inline-flex;padding:3px;border-radius:9px;background:var(--dsw-alias-bg-layer-2,#f1f1f4);gap:2px}
 .pts-set .pts-set-segments button{border:0;background:transparent;padding:5px 12px;border-radius:7px;color:var(--dsw-alias-label-secondary,#66666e)}
 .pts-set .pts-set-segments button.on{background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,#202024);box-shadow:0 1px 2px rgba(0,0,0,.08)}
 .pts-set .pts-set-search{margin-left:auto;width:240px;padding:6px 10px}
 .pts-set-item{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;padding:14px 16px;margin-bottom:10px;border:1px solid var(--dsw-alias-border-main,#e8e8ee);border-radius:12px;background:var(--dsw-alias-bg-layer-1,#fff)}
 .pts-set-item-main{display:flex;gap:10px;align-items:flex-start;min-width:0}
 .pts-set-check{margin-top:4px;accent-color:#e24b2b;flex:none}
 .pts-set-item-body{min-width:0;display:flex;flex-direction:column;gap:4px}
 .pts-set-item-title{display:flex;align-items:center;gap:8px;flex-wrap:wrap;line-height:1.5}
 .pts-set-item-title strong{font-size:14px;font-weight:600}
 .pts-set-id{font:11px ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--dsw-alias-label-secondary,#8a8a92);background:var(--dsw-alias-bg-layer-2,#f4f4f7);padding:1px 6px;border-radius:5px}
 .pts-set-item-meta{font-size:12px;color:var(--dsw-alias-label-secondary,#77777f);overflow-wrap:anywhere}
 .pts-set-item-meta a{color:#d1462a;text-decoration:none}
 .pts-set-item-meta a:hover{text-decoration:underline}
 .pts-set-ext{margin-left:3px;opacity:.75}
 .pts-set-desc{font-size:12px;color:var(--dsw-alias-label-secondary,#7a7a82);line-height:1.6}
 .pts-set-hint{font-size:11.5px;color:#a06a2c;background:rgba(226,150,43,.10);padding:4px 8px;border-radius:6px;align-self:flex-start}
 .pts-set-item-actions{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;flex:none}
 .pts-set-item-actions button{padding:5px 11px}
 .pts-pill-accent{color:#c4432b;background:rgba(226,75,43,.10)}
 .pts-set-empty{padding:32px 0;text-align:center;color:var(--dsw-alias-label-secondary,#77777f);font-size:12px}
 .pts-set-foot{margin:18px 0 0;color:var(--dsw-alias-label-secondary,#8a8a92);font-size:11.5px;line-height:1.7}
 `;

 function Icon({size=14}){
  return h('svg',{className:'pts-ico',width:size,height:size,viewBox:'0 0 24 24','aria-hidden':true},
   h('rect',{x:2.5,y:4.5,width:19,height:12.5,rx:2,fill:'none',stroke:'currentColor',strokeWidth:1.6}),
   h('path',{d:'M7 21h10',stroke:'currentColor',strokeWidth:1.6,strokeLinecap:'round'}));
 }

 const endpoint=(()=>{try{return new URL('api/dsh-ppt-studio',window.location.href).href}catch{return '/api/dsh-ppt-studio'}})();
 const skillsEndpoint=(()=>{try{return new URL('api/dsh-ppt-studio/skills',window.location.href).href}catch{return '/api/dsh-ppt-studio/skills'}})();
 const CLIENT_BUILD='0.7.0';
 const diagEndpoint=(()=>{try{const url=new URL(endpoint,window.location.href);url.searchParams.set('action','client-diag');return url.href}catch{return '/api/dsh-ppt-studio?action=client-diag'}})();
 function postDiag(stage,extra){
  try{
   fetch(diagEndpoint,{method:'POST',headers:{'content-type':'application/json'},keepalive:true,body:JSON.stringify({action:'client-diag',stage,build:CLIENT_BUILD,href:String(window.location.href).slice(0,300),...(extra||{})})}).catch(()=>{});
  }catch{}
 }
 postDiag('client-loaded');
 const CALL_TIMEOUT_MS=8000;
 async function call(method,body,token,sessionId){
  const url=new URL(endpoint,window.location.href);
  if(sessionId)url.searchParams.set('sessionId',sessionId);
  const payload=body?{...body,sessionId}:undefined;
  const controller=new AbortController();
  const timeoutError=new Error('连接 PPT Studio 超时。若刚更新过插件，请完整退出并重新打开 DSH 后再试。');
  timeoutError.code='timeout';
  let timer;
  const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(timeoutError)},CALL_TIMEOUT_MS)});
  let r;
  try{
   r=await Promise.race([fetch(url.href,{method,headers:payload?{'content-type':'application/json','x-ppt-studio-token':token||''}:{},body:payload?JSON.stringify(payload):undefined,cache:'no-store',credentials:'same-origin',signal:controller.signal}),deadline]);
  }catch(error){
   if(error===timeoutError||controller.signal.aborted)throw timeoutError;
   throw error;
  }finally{clearTimeout(timer)}
  let v={};try{v=await r.json()}catch{}
  if(!r.ok){const e=new Error(v.error||`请求失败（${r.status}）`);e.status=r.status;e.code=v.code;throw e;}
  return v;
 }

 const uid=p=>p+'_'+Math.random().toString(36).slice(2,10);
 const slug=t=>String(t||'演示文稿').replace(/[\\/:*?"<>|]+/g,' ').replace(/\s+/g,' ').trim().slice(0,60)||'演示文稿';

 async function fileBase64(file){
  const bytes=new Uint8Array(await file.arrayBuffer());
  const chunk=0x8000;
  const parts=[];
  for(let i=0;i<bytes.length;i+=chunk)parts.push(String.fromCharCode.apply(null,bytes.subarray(i,i+chunk)));
  return btoa(parts.join(''));
 }

 function blankSlide(){return {id:uid('s'),note:'',elements:[]};}

 function replaceSlideById(project,slideId,fn){
  const i=project.slides.findIndex(s=>s.id===slideId);
  if(i<0)return project;
  const slides=project.slides.slice();
  slides[i]=fn(project.slides[i]);
  return {...project,slides};
 }
 function updateElementById(project,slideId,elementId,fn){
  return replaceSlideById(project,slideId,slide=>{
   const i=slide.elements.findIndex(e=>e.id===elementId);
   if(i<0)return slide;
   const elements=slide.elements.slice();
   elements[i]=fn(slide.elements[i]);
   return {...slide,elements};
  });
 }
 function unrotatedVector(deg){
  const rad=(Number(deg)||0)*Math.PI/180;
  return {u:{x:Math.cos(rad),y:Math.sin(rad)},v:{x:-Math.sin(rad),y:Math.cos(rad)}};
 }
 function canEditElement(el){return Boolean(el)&&(el.type==='text'||(el.type==='shape'&&el.shape!=='line'));}
 function projectBodyFingerprint(p){return JSON.stringify({title:p.title,theme:p.theme,viewport:p.viewport,slides:p.slides});}
function draftHasChanges(cached,server){
  if(!cached||!cached.project)return false;
  if(projectBodyFingerprint(cached.project)!==projectBodyFingerprint(server))return true;
  const edit=cached.activeEdit;
  if(edit){
    const element=server.slides?.find(slide=>slide.id===edit.slideId)?.elements?.find(item=>item.id===edit.elementId);
    if(element){
      const committed=edit.kind==='cell'
        ? String(element.rows?.[edit.row]?.[edit.col]??'')
        : String(element.text??'');
      if(String(edit.value??'')!==committed)return true;
    }
  }
  return false;
}

 function renderChartSvg(el){
  const data=el.data||{labels:[],series:[]};
  const labels=data.labels||[];
  const series=data.series||[];
  const w=el.w||300, boxH=el.h||200;
  if(!labels.length||!series.length){
   return h('div',{style:{width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center',color:'#77777f',fontSize:11}},'图表暂无数据');
  }

  const colors=['#e24b2b','#1f2430','#3b82f6','#10b981','#f59e0b','#8b5cf6'];
  const pad=30;
  const pw=w-pad*2, ph=boxH-pad*2;

  // Pie and doughnut
  if(el.chartType==='pie'||el.chartType==='doughnut'){
   const first=series[0]?.values||[];
   const total=first.reduce((a,b)=>a+Math.max(0,Number(b)||0),0);
   if(total<=0)return h('div',{style:{width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center',color:'#77777f',fontSize:11}},'暂无非零数据');
   const cx=w/2, cy=boxH/2, r=Math.min(pw,ph)/2;
   let curAngle=0;
   const paths=[];
   for(let i=0;i<first.length;i++){
    const val=Math.max(0,Number(first[i])||0);
    const slice=val/total;
    const a0=curAngle, a1=curAngle+slice*Math.PI*2;
    curAngle=a1;
    const x0=cx+r*Math.cos(a0), y0=cy+r*Math.sin(a0);
    const x1=cx+r*Math.cos(a1), y1=cy+r*Math.sin(a1);
    const large=slice>0.5?1:0;
    const d=`M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} Z`;
    paths.push(h('path',{key:i,d,fill:colors[i%colors.length]}));
   }
   if(el.chartType==='doughnut'){
    paths.push(h('circle',{key:'hole',cx,cy,r:r*0.6,fill:el.fill||'#ffffff'}));
   }
   return h('svg',{width:'100%',height:'100%',viewBox:`0 0 ${w} ${boxH}`},paths);
  }

  // Numeric bounds
  let allVals=[];
  for(const s of series)allVals.push(...(s.values||[]).map(Number).filter(Number.isFinite));
  if(!allVals.length)allVals=[0];
  const minVal=Math.min(0,...allVals);
  const maxVal=Math.max(1,...allVals);
  const range=maxVal-minVal||1;
  const zeroY=pad+ph*(maxVal/range);

  const items=[];
  // Axes
  items.push(h('line',{key:'base',x1:pad,y1:zeroY,x2:w-pad,y2:zeroY,stroke:'#dedee3',strokeWidth:1}));

  if(el.chartType==='column'||el.chartType==='bar'){
   const nGroups=labels.length;
   const nSeries=series.length;
   const groupW=pw/Math.max(1,nGroups);
   const barW=Math.max(2,(groupW*0.7)/Math.max(1,nSeries));

   labels.forEach((lab,gi)=>{
    const gx=pad+gi*groupW+(groupW*0.15);
    series.forEach((s,si)=>{
     const val=Number(s.values?.[gi])||0;
     const bx=gx+si*barW;
     const bh=Math.abs(val/range)*ph;
     const by=val>=0?zeroY-bh:zeroY;
     items.push(h('rect',{key:`${gi}-${si}`,x:bx,y:by,width:Math.max(1,barW-1),height:Math.max(1,bh),fill:colors[si%colors.length]}));
    });
   });
  }else if(el.chartType==='line'||el.chartType==='area'){
   series.forEach((s,si)=>{
    const pts=(s.values||[]).map((v,i)=>{
     const px=pad+(i/(Math.max(1,labels.length-1)))*pw;
     const py=pad+ph*((maxVal-(Number(v)||0))/range);
     return {x:px,y:py};
    });
    if(pts.length>1){
     const dPoints=pts.map((p,idx)=>(idx===0?`M ${p.x} ${p.y}`:`L ${p.x} ${p.y}`)).join(' ');
     if(el.chartType==='area'){
      const areaD=`${dPoints} L ${pts.at(-1).x} ${zeroY} L ${pts[0].x} ${zeroY} Z`;
      items.push(h('path',{key:`area-${si}`,d:areaD,fill:colors[si%colors.length],opacity:0.25}));
     }
     items.push(h('path',{key:`line-${si}`,d:dPoints,fill:'none',stroke:colors[si%colors.length],strokeWidth:2}));
    }
    pts.forEach((p,pi)=>items.push(h('circle',{key:`p-${si}-${pi}`,cx:p.x,cy:p.y,r:2.5,fill:colors[si%colors.length]})));
   });
  }else if(el.chartType==='scatter'){
   const xVals=labels.map(Number);
   const minX=Math.min(0,...xVals.filter(Number.isFinite));
   const maxX=Math.max(1,...xVals.filter(Number.isFinite));
   const rangeX=maxX-minX||1;
   series.forEach((s,si)=>{
    (s.values||[]).forEach((yVal,pi)=>{
     const xVal=xVals[pi]!==undefined&&Number.isFinite(xVals[pi])?xVals[pi]:pi;
     const px=pad+((xVal-minX)/rangeX)*pw;
     const py=pad+ph*((maxVal-(Number(yVal)||0))/range);
     items.push(h('circle',{key:`s-${si}-${pi}`,cx:px,cy:py,r:3,fill:colors[si%colors.length]}));
    });
   });
  }else{
   items.push(h('text',{key:'info',x:w/2,y:boxH/2,textAnchor:'middle',fill:'#77777f',fontSize:12},el.chartType));
  }

  return h('svg',{width:'100%',height:'100%',viewBox:`0 0 ${w} ${boxH}`},items);
 }

 function ElementView({el,scale,cell}){
  if(el.type==='text'){
   return h('div',{className:'pts-el-text',style:{width:'100%',height:'100%',fontSize:el.fontSize,color:el.color,fontWeight:el.bold?700:400,textAlign:el.align,lineHeight:el.lineHeight||1.25,background:el.fill||'transparent',padding:0}},
    el.text||'');
  }
  if(el.type==='shape'){
   if(el.shape==='line'){
    const sw=Math.max(1,el.strokeWidth||2);
    return h('svg',{width:'100%',height:'100%',style:{overflow:'visible'}},
     h('line',{x1:0,y1:(el.h||20)/2,x2:el.w||100,y2:(el.h||20)/2,stroke:el.stroke||'#1f2430',strokeWidth:sw}));
   }
   const radius=el.shape==='ellipse'?'50%':el.shape==='roundRect'?`${el.radius||0}px`:'0';
   return h('div',{style:{width:'100%',height:'100%',background:el.fill||'#f3f4f6',borderRadius:radius,border:el.stroke&&el.strokeWidth>0?`${el.strokeWidth}px solid ${el.stroke}`:'none'}},
    el.text?h('div',{style:{width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:el.align==='left'?'flex-start':el.align==='right'?'flex-end':'center',textAlign:el.align||'center',color:el.color||'#1f2430',fontSize:el.fontSize||20,fontWeight:el.bold?700:400,lineHeight:el.lineHeight||1.25,overflow:'hidden',whiteSpace:'pre-wrap',padding:4}},el.text):null);
  }
  if(el.type==='image'){
   return h('img',{src:el.src,alt:'',draggable:false,style:{width:'100%',height:'100%',objectFit:el.fit==='contain'?'contain':'cover',display:'block',pointerEvents:'none'}});
  }
  if(el.type==='chart'){
   return h('div',{style:{width:'100%',height:'100%',background:el.fill||'#fff',border:'1px solid #e6e6ea',borderRadius:4,overflow:'hidden'}},
    renderChartSvg(el));
  }
  if(el.type==='table'){
   const rows=el.rows||[];
   const trs=rows.map((row,ri)=>h('tr',{key:ri},row.map((value,ci)=>h('td',{key:ci,'data-row':ri,'data-col':ci,style:{border:'1px solid #e6e6ea',padding:cell&&cell.row===ri&&cell.col===ci?0:'3px 6px',background:ri===0?(el.headerFill||'#f3f4f6'):'#fff',color:el.color||'#1f2430',fontSize:el.fontSize||14,textAlign:el.align||'left',verticalAlign:'middle'}},
    cell&&cell.row===ri&&cell.col===ci?cell.node:String(value??'')))));
   return h('div',{style:{width:'100%',height:'100%',overflow:'auto',border:'1px solid #dedee3',background:'#fff'}},
    h('table',{style:{borderCollapse:'collapse',width:'100%',tableLayout:'fixed'}},
     h('tbody',null,trs)));
  }
  return null;
 }

 function Thumb({slide,index,active,onClick,viewport,theme,backdrop}){
  const ref=useRef(null);
  const [visible,setVisible]=useState(false);
  const w=88,sx=w/viewport.width,hh=Math.max(20,viewport.height*sx);
  useEffect(()=>{
   const node=ref.current;
   if(!node||typeof IntersectionObserver==='undefined'){setVisible(true);return;}
   const observer=new IntersectionObserver(entries=>setVisible(entries.some(entry=>entry.isIntersecting)),{root:node.parentElement,rootMargin:'80px'});
   observer.observe(node);
   return()=>observer.disconnect();
  },[]);
  return h('button',{ref,className:'pts-thumb'+(active?' on':''),style:{height:hh+8,width:'100%'},onClick,title:`第 ${index+1} 页`,'aria-label':`第 ${index+1} 页`},
   h('span',{className:'n'},index+1),
   visible&&h('div',{'aria-hidden':true,style:{position:'absolute',left:4,top:4,width:viewport.width,height:viewport.height,transform:`scale(${sx})`,transformOrigin:'0 0',background:slide.background||theme.backgroundColor,fontFamily:theme.fontName,pointerEvents:'none'}},
    backdrop&&h('img',{src:backdrop,alt:'',style:{position:'absolute',inset:0,width:'100%',height:'100%',pointerEvents:'none'}}),
    slide.elements.map(el=>h('div',{key:el.id,style:{position:'absolute',left:el.x,top:el.y,width:el.w,height:el.h,transform:el.rotate?`rotate(${el.rotate}deg)`:undefined}},h(ElementView,{el,scale:sx})))));
 }

 const TAB_PREF='dsh-ppt-studio:showWorkbench';
 const readTabPref=()=>{try{return window.localStorage.getItem(TAB_PREF)!=='false'}catch{return true}};
 let tabController=null;
 let clientContext=null;
 async function skillsCall(method,body,token){
  const r=await fetch(skillsEndpoint,{
   method,
   headers:body?{'content-type':'application/json','x-ppt-studio-token':token||''}:{headers:token?{'x-ppt-studio-token':token}:{}},
   body:body?JSON.stringify(body):undefined,
   cache:'no-store',
   credentials:'same-origin',
  });
  let v={};try{v=await r.json()}catch{}
  if(!r.ok){const e=new Error(v.error||`请求失败（${r.status}）`);e.status=r.status;e.code=v.code;throw e;}
  return v;
 }

 function SettingsPanel(){
  const [showTab,setShowTab]=useState(readTabPref);
  const [skillsToken,setSkillsToken]=useState('');
  const [skillsData,setSkillsData]=useState(null);
  const [skillsError,setSkillsError]=useState('');
  const [selectedIds,setSelectedIds]=useState([]);
  const [filterTab,setFilterTab]=useState('all');
  const [search,setSearch]=useState('');
  const [busy,setBusy]=useState(false);
  const [showAddForm,setShowAddForm]=useState(false);
  const [formUrl,setFormUrl]=useState('');
  const [formRef,setFormRef]=useState('');
  const [formPath,setFormPath]=useState('');
  const [formTitle,setFormTitle]=useState('');
  const [formCategory,setFormCategory]=useState('pptx-native');
  const alive=useRef(true);

  const onToggle=event=>{
   const value=event.target.checked;
   try{window.localStorage.setItem(TAB_PREF,String(value))}catch{}
   setShowTab(value);
   presetCache.clear();
   tabController?.set(value);
  };

  const refreshSkills=useCallback(async(overrideToken)=>{
   const t=overrideToken||skillsToken;
   try{
    const res=await skillsCall('GET',null,t);
    if(alive.current){
     if(res.token)setSkillsToken(res.token);
     setSkillsData(res);
    }
    return res;
   }catch(err){
    if(alive.current)setSkillsError(err.message);
    return null;
   }
  },[skillsToken]);

  useEffect(()=>{
   alive.current=true;
   (async()=>{
    const res=await refreshSkills('');
    if(res&&res.defaultInstall?.status==='pending'){
     try{
      await skillsCall('POST',{action:'initialize'},res.token);
      await refreshSkills(res.token);
     }catch(e){if(alive.current)setSkillsError(e.message)}
    }
   })();
   return()=>{alive.current=false;};
  },[]);

  const isJobRunning=skillsData?.job?.state==='running'||skillsData?.defaultInstall?.status==='running';
  useEffect(()=>{
   if(!isJobRunning)return;
   const timer=setInterval(()=>{
    refreshSkills().catch(()=>{});
   },1200);
   return()=>clearInterval(timer);
  },[isJobRunning,refreshSkills]);

  const doAction=async(action,ids,options={})=>{
   setBusy(true);setSkillsError('');
   try{
    const res=await skillsCall('POST',{action,ids,...options},skillsToken);
    if(res.token)setSkillsToken(res.token);
    if(action==='install'||action==='uninstall')setSelectedIds([]);
    await refreshSkills();
   }catch(e){
    setSkillsError(e.message);
   }finally{
    if(alive.current)setBusy(false);
   }
  };

  const submitAddSource=async(alsoInstall)=>{
   if(!formUrl.trim()){setSkillsError('请填写 GitHub 来源链接');return;}
   setBusy(true);setSkillsError('');
   try{
    const res=await skillsCall('POST',{
     action:'addSource',
     url:formUrl.trim(),
     ref:formRef.trim()||undefined,
     path:formPath.trim()||undefined,
     title:formTitle.trim()||undefined,
     category:formCategory,
    },skillsToken);
    setShowAddForm(false);
    setFormUrl('');setFormRef('');setFormPath('');setFormTitle('');
    await refreshSkills();
    if(alsoInstall&&res.source?.id&&res.source?.available){
     await doAction('install',[res.source.id]);
    }
   }catch(e){
    setSkillsError(e.message);
   }finally{
    if(alive.current)setBusy(false);
   }
  };

  const removeCustomSource=async(p)=>{
   const isInstalled=['managed','external'].includes(p.ownership);
   if(isInstalled){
    if(!window.confirm(`来源「${p.title}」已安装。是否卸载该 Skill 并删除此来源记录？`))return;
    await doAction('removeSource',undefined,{id:p.id,uninstall:true});
   }else{
    if(!window.confirm(`确定要移除来源「${p.title}」吗？`))return;
    await doAction('removeSource',undefined,{id:p.id,uninstall:false});
   }
  };

  const packages=skillsData?.packages||[];
  const installedCount=packages.filter(p=>['managed','external'].includes(p.ownership)).length;
  const filteredPackages=packages.filter(p=>{
   if(filterTab==='installed'&&!['managed','external'].includes(p.ownership))return false;
   if(filterTab==='available'&&['managed','external'].includes(p.ownership))return false;
   if(search.trim()){
    const q=search.trim().toLowerCase();
    const matches=(p.title||'').toLowerCase().includes(q)||(p.id||'').toLowerCase().includes(q)||(p.repository||'').toLowerCase().includes(q)||(p.path||'').toLowerCase().includes(q);
    if(!matches)return false;
   }
   return true;
  });

  const toggleSelect=id=>setSelectedIds(prev=>prev.includes(id)?prev.filter(x=>x!==id):[...prev,id]);

  const githubHref=p=>{
   if(!p.repository)return '';
   const base=`https://github.com/${p.repository}`;
   const sha=[p.installedRevision,p.revision].find(v=>typeof v==='string'&&/^[a-f0-9]{40}$/.test(v))||'';
   if(!p.path)return sha?`${base}/tree/${sha}`:base;
   return `${base}/tree/${sha||'HEAD'}/${p.path}`;
  };

  return h('div',{className:'pts pts-set'},h('style',null,css),
   h('h2',{className:'pts-set-title'},'PPT Studio'),
   h('p',{className:'pts-set-lead'},'在侧边栏制作和修改演示文稿。新建会话时选择「PPT Studio」预设，即可使用 PPT 工具与已安装技能。'),
   h('label',{className:'pts-set-toggle'},
    h('input',{type:'checkbox',checked:showTab,onChange:onToggle}),
    h('span',null,'在侧边栏显示「PPT 工作台」入口')),

   h('section',{className:'pts-set-section'},
    h('div',{className:'pts-set-head'},
     h('div',null,
      h('h3',null,'技能库'),
      h('p',null,'预置 16 个来源，按需安装；卸载只删除技能文件，不影响已制作的演示文稿。')),
     h('div',{className:'pts-set-actions'},
      h('button',{disabled:busy||!skillsData,onClick:()=>doAction('check',undefined)},'检查更新'),
      h('button',{disabled:busy||!selectedIds.length,className:'primary',onClick:()=>doAction('install',selectedIds)},`安装所选 (${selectedIds.length})`),
      h('button',{onClick:()=>setShowAddForm(!showAddForm)},showAddForm?'取消添加':'添加 GitHub 来源'))),

    skillsError&&h('div',{className:'pts-error pts-set-alert',role:'alert'},skillsError),
    skillsData?.checkError&&h('div',{className:'pts-error pts-set-alert',role:'alert'},`更新检查异常：${skillsData.checkError}`),
    skillsData?.job&&skillsData.job.state==='running'&&h('div',{className:'pts-set-job'},
     h('div',null,skillsData.job.message||'正在执行操作…'),
     skillsData.job.log?.length>0&&h('div',{className:'pts-set-log'},skillsData.job.log.map((l,i)=>h('div',{key:i},l)))),

    showAddForm&&h('div',{className:'pts-set-form'},
     h('strong',null,'添加 GitHub 来源'),
     h('div',{className:'pts-field'},h('label',null,'仓库或目录链接'),h('input',{value:formUrl,placeholder:'https://github.com/owner/repo/tree/main/skills/my-skill',onChange:e=>setFormUrl(e.target.value)})),
     h('div',{className:'pts-row'},
      h('div',{className:'pts-field'},h('label',null,'Ref（可选）'),h('input',{value:formRef,placeholder:'默认 main',onChange:e=>setFormRef(e.target.value)})),
      h('div',{className:'pts-field'},h('label',null,'Skill 子目录（可选）'),h('input',{value:formPath,placeholder:'仓库根目录留空',onChange:e=>setFormPath(e.target.value)}))),
     h('div',{className:'pts-row'},
      h('div',{className:'pts-field'},h('label',null,'显示名称（可选）'),h('input',{value:formTitle,placeholder:'默认使用 Skill 名称',onChange:e=>setFormTitle(e.target.value)})),
      h('div',{className:'pts-field'},h('label',null,'产物类型'),
       h('select',{value:formCategory,onChange:e=>setFormCategory(e.target.value)},
        h('option',{value:'pptx-native'},'可编辑 PPTX'),
        h('option',{value:'image'},'图片型演示'),
        h('option',{value:'html'},'网页演示'),
        h('option',{value:'unknown'},'未知/通用')))),
     h('div',{className:'pts-set-actions'},
      h('button',{disabled:busy,onClick:()=>submitAddSource(false)},'仅添加来源'),
      h('button',{disabled:busy,className:'primary',onClick:()=>submitAddSource(true)},'添加并安装'),
      h('button',{onClick:()=>setShowAddForm(false)},'取消'))),

    h('div',{className:'pts-set-filters'},
     h('div',{className:'pts-set-segments'},
      h('button',{className:filterTab==='all'?'on':'',onClick:()=>setFilterTab('all')},`全部 ${packages.length}`),
      h('button',{className:filterTab==='installed'?'on':'',onClick:()=>setFilterTab('installed')},`已安装 ${installedCount}`),
      h('button',{className:filterTab==='available'?'on':'',onClick:()=>setFilterTab('available')},`可添加 ${packages.length-installedCount}`)),
     h('input',{className:'pts-set-search',placeholder:'搜索名称、仓库或路径…',value:search,onChange:e=>setSearch(e.target.value)})),

    filteredPackages.length===0
     ?h('div',{className:'pts-set-empty'},'没有匹配的 Skill 来源。')
     :filteredPackages.map(p=>{
      const isInstalled=['managed','external'].includes(p.ownership);
      const isManaged=p.ownership==='managed';
      const status=p.ownership==='external'?'外部管理':p.ownership==='missing'?'需修复':isManaged?(p.update?'有更新':'已安装'):(p.available?'未安装':'不可用');
      const kind=p.category==='pptx-native'?'原生 PPTX':p.category==='image'?'图片型':p.category==='html'?'网页演示':'其他';
      return h('div',{key:p.id,className:'pts-set-item'},
       h('div',{className:'pts-set-item-main'},
        !isInstalled&&p.available&&h('input',{type:'checkbox',className:'pts-set-check',checked:selectedIds.includes(p.id),disabled:busy,onChange:()=>toggleSelect(p.id)}),
        h('div',{className:'pts-set-item-body'},
         h('div',{className:'pts-set-item-title'},
          h('strong',null,p.title||p.id),
          h('span',{className:'pts-set-id'},p.id),
          h('span',{className:'pts-tag'+(isManaged?' active':p.ownership==='missing'||p.restricted?' warn':'')},status),
          h('span',{className:'pts-pill'},kind),
          p.license&&h('span',{className:'pts-pill'},p.license),
          p.origin==='custom'&&h('span',{className:'pts-pill pts-pill-accent'},'自定义')),
         h('div',{className:'pts-set-item-meta'},
          p.repository
           ?h('a',{href:githubHref(p),target:'_blank',rel:'noopener noreferrer',title:'在 GitHub 中查看'},
              p.repository+(p.path?` / ${p.path}`:''),h('span',{className:'pts-set-ext'},'↗'))
           :h('span',null,'本地来源')),
         p.id==='ppt-master'&&h('div',{className:'pts-set-hint'},'已安装 Skill 不等于运行依赖已就绪；调用时会按该 Skill 的说明检查 Python 等环境。'),
         p.description&&h('div',{className:'pts-set-desc'},p.description))),
       h('div',{className:'pts-set-item-actions'},
        p.ownership==='missing'&&h('button',{disabled:busy,onClick:()=>doAction('repair',[p.id])},'修复'),
        isManaged&&p.update&&h('button',{disabled:busy,className:'primary',onClick:()=>doAction('update',[p.id])},'更新'),
        !isInstalled&&p.available&&h('button',{disabled:busy,onClick:()=>doAction('install',[p.id])},'安装'),
        isManaged&&h('button',{disabled:busy,onClick:()=>doAction('uninstall',[p.id])},'卸载'),
        p.origin==='custom'&&h('button',{disabled:busy,onClick:()=>removeCustomSource(p)},'删除来源')));
     }),

    h('p',{className:'pts-set-foot'},'技能只安装到插件私有目录，由「PPT Studio」预设单独加载；安装过程不执行远端脚本。')));
 }
  const PRESET_TTL=2000;
  const PRESET_RETRY_TTL=500;
  const presetCache=new Map();
  const presetChecks=new Set();
  function isPptSession(sessionId){
   if(!readTabPref()||typeof sessionId!=='string'||!sessionId)return false;
   const known=presetCache.get(sessionId);
   const age=known?Date.now()-known.checkedAt:Infinity;
   const ttl=known&&known.ok?PRESET_TTL:PRESET_RETRY_TTL;
   if(!presetChecks.has(sessionId)&&age>=ttl){
    presetChecks.add(sessionId);
    const url=new URL(endpoint,window.location.href);url.searchParams.set('action','mode');url.searchParams.set('sessionId',sessionId);
    fetch(url.href,{cache:'no-store',credentials:'same-origin'}).then(async response=>{
     if(response.status===403)return false;
     if(!response.ok)return null;
     const result=await response.json().catch(()=>({}));
     return result.mode==='ppt-studio';
    }).catch(()=>null).then(ok=>{
     presetChecks.delete(sessionId);
     const previous=presetCache.get(sessionId);
     if(ok===null){
      // Transient failures must not be treated as a permanent preset decision.
      presetCache.set(sessionId,{ok:previous?.ok===true,checkedAt:Date.now()});
      return;
     }
     presetCache.set(sessionId,{ok,checkedAt:Date.now()});
     if(presetCache.size>256)presetCache.delete(presetCache.keys().next().value);
     if((ok===true&&previous?.ok!==true)||(ok===false&&previous?.ok===true))tabController?.refresh();
    });
   }
   return known?known.ok===true:false;
  }
 function openDraftDb(){
  return new Promise(resolve=>{
   if(typeof indexedDB==='undefined')return resolve(null);
   let settled=false;
   const finish=value=>{if(settled)return;settled=true;clearTimeout(timer);resolve(value)};
   const timer=setTimeout(()=>finish(null),3000);
   try{
    const req=indexedDB.open('dsh-ppt-studio',1);
    req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains('drafts'))db.createObjectStore('drafts');};
    req.onsuccess=()=>finish(req.result);
    req.onerror=()=>finish(null);
    req.onblocked=()=>finish(null);
   }catch{finish(null)}
  });
 }

 async function idbGetDraft(key){
  const db=await openDraftDb();if(!db)return null;
  return new Promise(resolve=>{
   try{
    const tx=db.transaction('drafts','readonly');
    const req=tx.objectStore('drafts').get(key);
    req.onsuccess=()=>resolve(req.result||null);
    req.onerror=()=>resolve(null);
   }catch{resolve(null)}
  });
 }

 async function idbSetDraft(key,data){
  const db=await openDraftDb();if(!db)return false;
  return new Promise(resolve=>{
   try{
    const tx=db.transaction('drafts','readwrite');
    const req=tx.objectStore('drafts').put(data,key);
    req.onsuccess=()=>resolve(true);
    req.onerror=()=>resolve(false);
   }catch{resolve(false)}
  });
 }

 async function idbDeleteDraft(key){
  const db=await openDraftDb();if(!db)return false;
  return new Promise(resolve=>{
   try{
    const tx=db.transaction('drafts','readwrite');
    const req=tx.objectStore('drafts').delete(key);
    req.onsuccess=()=>resolve(true);
    req.onerror=()=>resolve(false);
   }catch{resolve(false)}
  });
 }

 function TabDescriptor(){return {id:'dsh-ppt-studio:workbench',title:()=> 'PPT 工作台',description:()=> '逐页预览、直接编辑并导出可编辑 PPTX。',icon:(size=16)=>h(Icon,{size}),order:60,single:true,available:(_ctx,scope)=>isPptSession(scope.sessionId),component:props=>h(Workbench,{ctx:props.ctx,scope:props.scope,visible:props.visible})};}

 function Workbench({ctx,scope,visible}){
  const [boot,setBoot]=useState(null);
  const [project,setProject]=useState(null);
  const [index,setIndex]=useState(0);
  const [selected,setSelected]=useState('');
  const [editor,setEditor]=useState(null);
  const [tool,setTool]=useState('select');
  const [mark,setMark]=useState(null);
  const [requestText,setRequestText]=useState('');
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [busy,setBusy]=useState(false);
  const [dirty,setDirty]=useState(false);
  const [conflict,setConflict]=useState(null);
  const [width,setWidth]=useState(0);
  const [height,setHeight]=useState(0);
  const [importing,setImporting]=useState(false);
  const [importWarnings,setImportWarnings]=useState([]);
  const [historyVersion,setHistoryVersion]=useState(0);
  const [chartDraft,setChartDraft]=useState(null);

  const token=useRef('');
  const baseRevision=useRef(1);
  const editSeq=useRef(0);
  const history=useRef({undo:[],redo:[],lastKey:null});
  const indexRef=useRef(0);
  const selectedRef=useRef('');
  const editorRef=useRef(null);
  const editInputRef=useRef(null);
  const stageRef=useRef(null);
  const canvasRef=useRef(null);
  const drag=useRef(null);
  const dirtyRef=useRef(false);
  const projectRef=useRef(null);
  const fileRef=useRef(null);
  const replaceRef=useRef(null);
  const replaceTarget=useRef(null);
  const pptxRef=useRef(null);
  const saveTimer=useRef(null);
  const draftTimer=useRef(null);
  const draftOps=useRef(Promise.resolve());
  const saveRef=useRef({inflight:null,retry:null});
  const loadingRef=useRef(false);
  const epoch=useRef(0);
  const clipboard=useRef(null);
  const historyKeyTimer=useRef(null);
  const listRevision=useRef(null);
  const listSession=useRef('');
  const listPolling=useRef(false);

  useEffect(()=>{projectRef.current=project},[project]);
  useEffect(()=>{dirtyRef.current=dirty},[dirty]);

  const safeIndex=project&&project.slides.length?Math.min(index,project.slides.length-1):0;
  const slide=project?project.slides[safeIndex]:null;
  const ratio=project?(project.viewport.height/project.viewport.width):(562.5/1000);
  const scale=width>0&&height>0&&project?Math.min(1,width/project.viewport.width,height/project.viewport.height):0.5;

  const fail=useCallback(e=>{
   if(e?.code==='PRESET_REQUIRED'){
    projectRef.current=null;dirtyRef.current=false;token.current='';history.current={undo:[],redo:[],lastKey:null};
    editorRef.current=null;setEditor(null);
    setProject(null);setBoot(null);setDirty(false);
    selectedRef.current='';setSelected('');
    setImportWarnings([]);
    // Drop the cached availability so the tab list can re-evaluate, but never
    // re-register the tab here: doing so remounts this panel and reboots forever.
    presetCache.delete(scope.sessionId);
   }
   setError(e&&e.message?e.message:String(e));
  },[scope.sessionId]);

  const snapshotState=useCallback(()=>{
   const p=projectRef.current;
   if(!p)return null;
   return {
    body:{title:p.title,theme:p.theme,viewport:p.viewport,slides:p.slides},
    activeSlideId:p.slides[indexRef.current]?.id,
    selectedId:selectedRef.current,
   };
  },[]);

  const pushHistory=useCallback(key=>{
   const h=history.current;
   if(key&&h.lastKey===key)return false;
   const snap=snapshotState();
   if(!snap)return false;
   h.undo.push(snap);
   if(h.undo.length>60)h.undo.shift();
   h.redo.length=0;
   h.lastKey=key||null;
   clearTimeout(historyKeyTimer.current);
   if(key){
    historyKeyTimer.current=setTimeout(()=>{history.current.lastKey=null;},900);
   }
   setHistoryVersion(v=>v+1);
   return true;
  },[snapshotState]);

  const queueDraft=useCallback(op=>{draftOps.current=draftOps.current.then(op).catch(()=>{});},[]);

  const draftPayload=useCallback(()=>{
   const p=projectRef.current;
   if(!p)return null;
   const s=editorRef.current;
   return {
    project:p,
    baseRevision:baseRevision.current,
    editSeq:editSeq.current,
    dirty:dirtyRef.current,
    activeSlideId:p.slides[indexRef.current]?.id||'',
    selectedId:selectedRef.current,
    activeEdit:s?{elementId:s.elementId,slideId:s.slideId,kind:s.kind,row:s.row,col:s.col,value:s.value,startValue:s.startValue}:null,
    savedAt:Date.now(),
   };
  },[]);

  const writeDraftNow=useCallback(()=>{
   const p=projectRef.current;
   if(!p)return;
   const key=`${scope.sessionId}:${p.id}`;
   const payload=draftPayload();
   if(payload)queueDraft(()=>idbSetDraft(key,payload));
  },[draftPayload,queueDraft,scope.sessionId]);

  const scheduleDraft=useCallback(()=>{
   if(!projectRef.current)return;
   clearTimeout(draftTimer.current);
   draftTimer.current=setTimeout(()=>writeDraftNow(),400);
  },[writeDraftNow]);

  const clearDraft=useCallback(projectId=>{
   clearTimeout(draftTimer.current);
   if(!projectId)return;
   const key=`${scope.sessionId}:${projectId}`;
   queueDraft(()=>idbDeleteDraft(key));
  },[queueDraft,scope.sessionId]);

  const updateProject=useCallback((updater,options)=>{
   const prev=projectRef.current;
   if(!prev)return prev;
   const next=updater(prev);
   if(!next||next===prev)return prev;
   pushHistory(options?options.historyKey:null);
   projectRef.current=next;
   editSeq.current+=1;
   dirtyRef.current=true;
   setProject(next);
   setDirty(true);
   scheduleDraft();
   return next;
  },[pushHistory,scheduleDraft]);

  const editorCurrentValue=useCallback(()=>{
   const s=editorRef.current;
   if(!s)return '';
   const node=editInputRef.current;
   if(node&&typeof node.value==='string')return String(node.value);
   return String(s.value??'');
  },[]);

  const valueInProject=useCallback(s=>{
   const p=projectRef.current;
   if(!p||!s)return '';
   const sl=p.slides.find(x=>x.id===s.slideId);
   if(!sl)return '';
   const el=sl.elements.find(e=>e.id===s.elementId);
   if(!el)return '';
   return s.kind==='cell'?String(el.rows?.[s.row]?.[s.col]??''):String(el.text??'');
  },[]);

  const writeEditorValue=useCallback((s,value)=>{
   updateProject(p=>updateElementById(p,s.slideId,s.elementId,el=>{
    if(s.kind==='cell'){
     if(el.type!=='table')return el;
     const rows=(el.rows||[]).map(row=>row.slice());
     while(rows.length<=s.row)rows.push([]);
     const row=rows[s.row];
     while(row.length<=s.col)row.push('');
     row[s.col]=value;
     return {...el,rows};
    }
    return {...el,text:value};
   }),{historyKey:s.key});
  },[updateProject]);

  const closeEditor=useCallback(()=>{
   clearTimeout(historyKeyTimer.current);
   history.current.lastKey=null;
   editorRef.current=null;
   editInputRef.current=null;
   setEditor(null);
   scheduleDraft();
  },[scheduleDraft]);

  const commitActiveEdit=useCallback(options=>{
   const s=editorRef.current;
   if(!s)return false;
   const value=editorCurrentValue();
   let changed=false;
   if(value!==valueInProject(s)){
    writeEditorValue(s,value);
    changed=true;
   }
   s.value=value;
   if(options&&options.close){
    closeEditor();
   }else{
    editorRef.current=s;
    if(changed)setEditor({...s});
    scheduleDraft();
   }
   return changed;
  },[closeEditor,editorCurrentValue,scheduleDraft,valueInProject,writeEditorValue]);

  const cancelActiveEdit=useCallback(()=>{
   const s=editorRef.current;
   if(!s)return;
   if(valueInProject(s)!==s.startValue){
    writeEditorValue(s,s.startValue);
    const h=history.current;
    if(h.lastKey===s.key&&h.undo.length)h.undo.pop();
    setHistoryVersion(v=>v+1);
   }
   closeEditor();
  },[closeEditor,valueInProject,writeEditorValue]);

  const goToSlide=useCallback(value=>{
   const p=projectRef.current;
   const count=p?p.slides.length:0;
   const next=Math.max(0,Math.min(Number(value)||0,Math.max(0,count-1)));
   indexRef.current=next;
   setIndex(next);
  },[]);

  const selectElement=useCallback(value=>{
   const next=value||'';
   selectedRef.current=next;
   setSelected(next);
  },[]);

  const beginEditing=useCallback((elementId,cell)=>{
   const p=projectRef.current;
   if(!p)return;
   const i=Math.min(indexRef.current,Math.max(0,p.slides.length-1));
   const sl=p.slides[i];
   if(!sl)return;
   const el=sl.elements.find(e=>e.id===elementId);
   if(!el)return;
   const kind=el.type==='table'?'cell':'text';
   if(kind==='text'&&!canEditElement(el))return;
   if(kind==='cell'&&(!cell||!Number.isInteger(cell.row)||!Number.isInteger(cell.col)))return;
   if(editorRef.current)commitActiveEdit({close:true});
   const baseValue=kind==='cell'?String(el.rows?.[cell.row]?.[cell.col]??''):String(el.text??'');
   const session={projectId:p.id,slideId:sl.id,elementId,kind,row:kind==='cell'?cell.row:null,col:kind==='cell'?cell.col:null,value:baseValue,startValue:baseValue,key:`edit:${elementId}`};
   editorRef.current=session;
   selectedRef.current=elementId;
   setSelected(elementId);
   setEditor(session);
   scheduleDraft();
  },[commitActiveEdit,scheduleDraft]);

  const hasUncommittedEdit=useCallback(()=>{
   const s=editorRef.current;
   if(!s)return false;
   return editorCurrentValue()!==valueInProject(s);
  },[editorCurrentValue,valueInProject]);

  const restoreSnapshot=useCallback(snap=>{
   const p=projectRef.current;
   if(!p||!snap||!snap.body)return;
   const next={...p,...snap.body};
   projectRef.current=next;
   editSeq.current+=1;
   dirtyRef.current=true;
   setProject(next);
   setDirty(true);
   const idx=next.slides.findIndex(s=>s.id===snap.activeSlideId);
   goToSlide(idx>=0?idx:indexRef.current);
   selectElement(snap.selectedId||'');
   setChartDraft(null);
   scheduleDraft();
  },[goToSlide,scheduleDraft,selectElement]);

  const undo=useCallback(()=>{
   if(editorRef.current)commitActiveEdit({close:true});
   const h=history.current;
   const snap=h.undo.pop();
   if(!snap)return;
   const current=snapshotState();
   if(current)h.redo.push(current);
   clearTimeout(historyKeyTimer.current);
   h.lastKey=null;
   restoreSnapshot(snap);
   setHistoryVersion(v=>v+1);
  },[commitActiveEdit,restoreSnapshot,snapshotState]);

  const redo=useCallback(()=>{
   if(editorRef.current)commitActiveEdit({close:true});
   const h=history.current;
   const snap=h.redo.pop();
   if(!snap)return;
   const current=snapshotState();
   if(current){
    h.undo.push(current);
    if(h.undo.length>60)h.undo.shift();
   }
   clearTimeout(historyKeyTimer.current);
   h.lastKey=null;
   restoreSnapshot(snap);
   setHistoryVersion(v=>v+1);
  },[commitActiveEdit,restoreSnapshot,snapshotState]);

  const sendSave=useCallback(entry=>call('POST',{action:'save',project:entry.project,baseRevision:entry.baseRevision,operationId:entry.operationId},token.current,scope.sessionId),[scope.sessionId]);

  const isUnknownSaveError=e=>!e||typeof e.status!=='number';

  const adoptSave=useCallback((v,entry)=>{
   if(epoch.current!==entry.epoch||!projectRef.current||projectRef.current.id!==entry.projectId)return projectRef.current;
   baseRevision.current=Number(v.revision)||entry.baseRevision;
   setBoot(b=>b&&Array.isArray(v.projects)?{...b,projects:v.projects}:b);
   const replayedLater=v.replayed&&v.revision!==v.appliedRevision;
   const hasNewer=dirtyRef.current||hasUncommittedEdit()||editSeq.current!==entry.seq;
   if(replayedLater&&hasNewer){
    const message='该演示文稿在服务器已被更新，当前本地有未保存草稿';
    setConflict(message);
    const err=new Error(message);
    err.status=409;
    throw err;
   }
   if(editSeq.current===entry.seq&&!hasUncommittedEdit()){
    projectRef.current=v.project;
    setProject(v.project);
    dirtyRef.current=false;
    setDirty(false);
    setConflict(null);
    clearDraft(v.project.id);
    setNotice('已保存');
    setTimeout(()=>setNotice(''),1600);
   }else{
    setNotice('部分修改已保存，继续保存最新草稿…');
   }
   return projectRef.current;
  },[clearDraft,hasUncommittedEdit]);

  const save=useCallback(async(force)=>{
   if(saveRef.current.inflight){
    return await saveRef.current.inflight;
   }
   if(drag.current)return projectRef.current;
   const hadRetry=Boolean(saveRef.current.retry);
   commitActiveEdit({close:false});
   if(!projectRef.current)return null;
   if(!force&&!dirtyRef.current&&!hadRetry)return projectRef.current;

   const run=(async()=>{
    setBusy(true);setError('');
    try{
     if(saveRef.current.retry){
      const retry=saveRef.current.retry;
      const v=await sendSave(retry);
      saveRef.current.retry=null;
      adoptSave(v,retry);
      if(editSeq.current===retry.seq&&!hasUncommittedEdit())return projectRef.current;
     }
     let attempts=0;
     while(attempts++<8){
      if(drag.current)return projectRef.current;
      commitActiveEdit({close:false});
      const p=projectRef.current;
      if(!p)return null;
      if(!dirtyRef.current)return p;
      const entry={
       project:p,
       baseRevision:baseRevision.current,
       operationId:'op_'+Math.random().toString(36).slice(2,10),
       projectId:p.id,
       epoch:epoch.current,
       seq:editSeq.current,
      };
      let v;
      try{
       v=await sendSave(entry);
      }catch(e){
       if(isUnknownSaveError(e))saveRef.current.retry=entry;
       throw e;
      }
      adoptSave(v,entry);
      if(!dirtyRef.current)return projectRef.current;
     }
     throw new Error('仍有未保存的修改，请稍后重试');
    }catch(e){
     if(e.status===409){
      setConflict(e.message||'该演示文稿在服务器已被更新（AI 或其他面板）');
      setDirty(true);
      dirtyRef.current=true;
     }else if(isUnknownSaveError(e)){
      setError('保存结果未知，稍后会用同一请求重试');
     }else{
      fail(e);
     }
     throw e;
    }finally{
     setBusy(false);
    }
   })();
   const tracked=run.finally(()=>{if(saveRef.current.inflight===tracked)saveRef.current.inflight=null;});
   saveRef.current.inflight=tracked;
   return tracked;
  },[adoptSave,commitActiveEdit,fail,hasUncommittedEdit,sendSave]);

  const flushDraft=useCallback(async()=>{
   commitActiveEdit({close:false});
   if(saveRef.current.inflight){try{await saveRef.current.inflight}catch{}}
   let attempts=0;
   while(dirtyRef.current||saveRef.current.retry){
    if(attempts++>=4)throw new Error('仍有未保存的修改，请稍后重试');
    await save(true);
   }
   return projectRef.current;
  },[commitActiveEdit,save]);

  const resetDocument=useCallback((next,options)=>{
   const opts=options||{};
   epoch.current+=1;
   clearTimeout(saveTimer.current);
   clearTimeout(draftTimer.current);
   clearTimeout(historyKeyTimer.current);
   drag.current=null;
   editorRef.current=null;
   editInputRef.current=null;
   setEditor(null);
   history.current={undo:[],redo:[],lastKey:null};
   projectRef.current=next||null;
   setProject(next||null);
   baseRevision.current=opts.revision??(next?next.revision:1);
   editSeq.current=0;
   dirtyRef.current=Boolean(opts.dirty);
   setDirty(Boolean(opts.dirty));
   const slideId=opts.activeSlideId&&next&&next.slides.some(s=>s.id===opts.activeSlideId)?opts.activeSlideId:(next&&next.slides[0]?next.slides[0].id:'');
   const idx=next?next.slides.findIndex(s=>s.id===slideId):-1;
   indexRef.current=idx>=0?idx:0;
   setIndex(indexRef.current);
   const selectedId=opts.selectedId&&next&&next.slides.some(s=>s.elements.some(e=>e.id===opts.selectedId))?opts.selectedId:'';
   selectedRef.current=selectedId;
   setSelected(selectedId);
   const edit=opts.activeEdit&&next&&next.slides.some(s=>s.id===opts.activeEdit.slideId)?opts.activeEdit:null;
   if(edit){
    const session={projectId:next.id,slideId:edit.slideId,elementId:edit.elementId,kind:edit.kind==='cell'?'cell':'text',row:edit.row??null,col:edit.col??null,value:String(edit.value??''),startValue:String(edit.startValue??edit.value??''),key:`edit:${edit.elementId}`};
    editorRef.current=session;
    setEditor(session);
   }
   setConflict(opts.conflict||null);
   setImportWarnings([]);
   setChartDraft(null);
   setHistoryVersion(v=>v+1);
   if(opts.notice){setNotice(opts.notice);setTimeout(()=>setNotice(''),1800);}
  },[]);

  const load=useCallback(async(id)=>{
   if(loadingRef.current)return;
   if(saveRef.current.inflight){try{await saveRef.current.inflight}catch{}}
   loadingRef.current=true;
   epoch.current+=1;
   const loadEpoch=epoch.current;
   setError('');setBusy(true);
   const startedAt=Date.now();
   postDiag('boot-start',{sessionIdTail:String(scope.sessionId||'').slice(-8)});
   try{
    const v=await call('GET',null,token.current,scope.sessionId);
    if(loadEpoch!==epoch.current)return;
    token.current=v.token;
    baseRevision.current=0;
    postDiag('boot-ok',{ms:Date.now()-startedAt,projects:Array.isArray(v.projects)?v.projects.length:0});
    setBoot(v);
    const target=id||(v.projects[0]&&v.projects[0].id);
    if(!target){resetDocument(null);return;}
    const p=await fetchProject(target,scope.sessionId);
    if(loadEpoch!==epoch.current)return;

    // Restore only real unsaved work: identical drafts are leftovers, and a draft
    // based on an older revision must surface a conflict instead of silently winning.
    const localKey=`${scope.sessionId}:${p.id}`;
    const cached=await idbGetDraft(localKey);
    if(loadEpoch!==epoch.current)return;
    const restored=Boolean(cached&&cached.project&&draftHasChanges(cached,p));
    const next=restored?cached.project:p;
    resetDocument(next,{
     revision:p.revision,
     dirty:restored,
     activeSlideId:restored?cached.activeSlideId:undefined,
     selectedId:restored?cached.selectedId:undefined,
     activeEdit:restored?cached.activeEdit:null,
     conflict:restored&&cached.baseRevision!==p.revision?'已恢复本地草稿，但服务器已有更新版本；请另存副本或确认后重新载入':null,
     notice:restored?'已恢复未保存的本地草稿':'',
    });
   }catch(e){
    postDiag('boot-failed',{ms:Date.now()-startedAt,code:e&&e.code?String(e.code):'',status:typeof e?.status==='number'?e.status:null,message:String((e&&e.message)||e).slice(0,200)});
    fail(e);
   }finally{
    loadingRef.current=false;
    setBusy(false);
   }
  },[resetDocument,scope.sessionId]);

  async function fetchProject(id,sessionId=scope.sessionId){
   const r=await fetch(`${endpoint}?action=project&id=${encodeURIComponent(id)}&sessionId=${encodeURIComponent(sessionId)}`,{cache:'no-store',credentials:'same-origin'});
   const v=await r.json();
   if(!r.ok){const e=new Error(v.error||'无法读取项目');e.status=r.status;e.code=v.code;throw e;}
   return v.project;
  }

  const refreshProjectList=async()=>{
   const v=await call('GET',null,token.current,scope.sessionId);
   if(v.token)token.current=v.token;
   const projects=Array.isArray(v.projects)?v.projects:[];
   const current=projectRef.current;
   const options=projects.slice();
   if(current&&!options.some(p=>p.id===current.id)){
    options.push({id:current.id,title:current.title,revision:baseRevision.current,slides:Array.isArray(current.slides)?current.slides.length:0});
   }
   setBoot(b=>b?{...b,projects:options}:b);
   // Keep the user's current document (and any local draft); only an empty workbench auto-opens the newest project.
   if(!current&&projects.length)await load(projects[0].id);
   return projects;
  };

  useEffect(()=>{load().catch(fail)},[load]);
  useEffect(()=>{if(visible&&!dirtyRef.current)load().catch(()=>{});},[visible,load]);

  // Directory-level revision sync while visible: picks up Agent/import projects without reading documents.
  useEffect(()=>{
   if(!visible||!boot)return;
   if(listSession.current!==scope.sessionId){listSession.current=scope.sessionId;listRevision.current=null;listPolling.current=false;}
   let stopped=false;
   const tick=async()=>{
    if(stopped||listPolling.current)return;
    listPolling.current=true;
    try{
     const listUrl=new URL(endpoint,window.location.href);
     listUrl.searchParams.set('action','listRevision');
     listUrl.searchParams.set('sessionId',scope.sessionId);
     const listRes=await fetch(listUrl.href,{cache:'no-store',credentials:'same-origin'});
     if(stopped)return;
     if(listRes.ok){
      const listData=await listRes.json().catch(()=>({}));
      const marker=String(listData.revision??'');
      if(marker&&marker!==listRevision.current){
       listRevision.current=marker;
       await refreshProjectList();
      }
     }
    const current=projectRef.current;
    if(stopped||!current||conflict)return;
    const r=await fetch(`${endpoint}?action=revision&id=${encodeURIComponent(current.id)}&sessionId=${encodeURIComponent(scope.sessionId)}`,{cache:'no-store',credentials:'same-origin'});
    if(!r.ok)return;
    const revData=await r.json();
    if(stopped||!(revData.revision>baseRevision.current))return;
    // Our own save may have committed before its response was lost; resolve it
    // with the original operationId instead of reporting a false conflict.
    if(saveRef.current.inflight||saveRef.current.retry)return;
    const busyEditing=Boolean(dirtyRef.current||editorRef.current||drag.current||hasUncommittedEdit());
    if(!busyEditing){
     const updated=await fetchProject(current.id,scope.sessionId);
     if(stopped||projectRef.current?.id!==current.id)return;
     if(dirtyRef.current||editorRef.current||drag.current)return;
     resetDocument(updated,{revision:updated.revision,dirty:false,activeSlideId:current.slides[indexRef.current]?.id,selectedId:selectedRef.current,notice:'已同步 AI 远端修改'});
    }else{
     setConflict('该演示文稿在服务器已被更新，当前本地有未保存草稿');
    }
   }catch{listRevision.current=null}
   finally{listPolling.current=false}
  };
  tick();
  const timer=setInterval(tick,2000);
  return()=>{stopped=true;clearInterval(timer)};
 },[visible,boot!==null,scope.sessionId,conflict,hasUncommittedEdit,resetDocument]);

  useEffect(()=>{
   if(!stageRef.current||!project)return;
   const node=stageRef.current;
   const measure=()=>{setWidth(Math.max(0,node.clientWidth-20));setHeight(Math.max(0,node.clientHeight-20))};
   const ro=new ResizeObserver(measure);
   ro.observe(node);measure();
   return()=>ro.disconnect();
  },[project!==null]);

  useEffect(()=>{
   if(!dirty||conflict)return;
   clearTimeout(saveTimer.current);
   saveTimer.current=setTimeout(()=>{
    if(drag.current)return;
    save().catch(()=>{});
   },900);
   return()=>clearTimeout(saveTimer.current);
  },[dirty,project,conflict,save]);

  useEffect(()=>{
   if(typeof document==='undefined')return undefined;
   const flushLocal=()=>{if(projectRef.current)writeDraftNow();};
   const onVisibility=()=>{if(document.visibilityState==='hidden')flushLocal();};
   document.addEventListener('visibilitychange',onVisibility);
   window.addEventListener('pagehide',flushLocal);
   return()=>{document.removeEventListener('visibilitychange',onVisibility);window.removeEventListener('pagehide',flushLocal);flushLocal();};
  },[writeDraftNow]);

  const create=async()=>{
   commitActiveEdit({close:false});
   if(dirtyRef.current&&!window.confirm('当前修改尚未保存，新建会离开当前项目。继续？'))return;
   setBusy(true);setError('');
   try{
    const title=window.prompt('新演示文稿标题','未命名演示文稿');
    if(title===null)return;
    if(projectRef.current)clearDraft(projectRef.current.id);
    const v=await call('POST',{action:'create',title},token.current,scope.sessionId);
    setBoot(b=>b?{...b,projects:v.projects}:b);
    resetDocument(v.project,{revision:v.project.revision,activeSlideId:v.project.slides[0]?.id,notice:'已创建新演示文稿'});
   }catch(e){fail(e)}finally{setBusy(false)}
  };

  const saveCopy=async()=>{
   if(!project)return;
   setBusy(true);setError('');
   try{
    const sourceId=projectRef.current?.id||project.id;
    await flushDraft();
    const source=projectRef.current||project;
    const v=await call('POST',{action:'create',title:`${source.title}（草稿副本）`,template:source,sourceProjectId:sourceId},token.current,scope.sessionId);
    clearDraft(sourceId);
    setBoot(b=>b?{...b,projects:v.projects}:b);
    resetDocument(v.project,{revision:v.project.revision,activeSlideId:v.project.slides[0]?.id,notice:'已另存为新项目副本'});
   }catch(e){fail(e)}finally{setBusy(false)}
  };

  const openProject=async(id)=>{
   if(id===projectRef.current?.id)return;
   commitActiveEdit({close:false});
   if(dirtyRef.current&&!window.confirm('当前修改尚未保存，切换会丢失。继续？'))return;
   setBusy(true);setError('');
   const previous=projectRef.current;
   try{
    if(previous)clearDraft(previous.id);
    const p=await fetchProject(id);
    resetDocument(p,{revision:p.revision,activeSlideId:p.slides[0]?.id});
   }catch(e){fail(e)}finally{setBusy(false)}
  };

  const doExport=async()=>{
   if(!project)return;
   setBusy(true);setError('');setNotice('');
   try{
    await flushDraft();
    const p=projectRef.current;
    if(!p)return;
    const v=await call('POST',{action:'export',id:p.id,baseRevision:baseRevision.current},token.current,scope.sessionId);
    setNotice(`已导出：${v.path}${v.warnings&&v.warnings.length?`\n注意：${v.warnings.join('；')}`:''}`);
   }catch(e){fail(e)}finally{setBusy(false)}
  };

  const addElement=el=>{
   const p=projectRef.current;
   if(!p)return null;
   const target=p.slides[indexRef.current];
   if(!target)return null;
   if(editorRef.current)commitActiveEdit({close:true});
   updateProject(proj=>replaceSlideById(proj,target.id,sl=>({...sl,elements:[...sl.elements,el]})));
   selectedRef.current=el.id;
   setSelected(el.id);
   return el;
  };

  const addText=()=>{
   const el=addElement({id:uid('e'),type:'text',x:120,y:200,w:560,h:80,rotate:0,text:'',fontSize:32,color:'#1f2430',bold:false,align:'left'});
   if(el)setTimeout(()=>beginEditing(el.id),0);
  };
  const addShape=()=>addElement({id:uid('e'),type:'shape',shape:'roundRect',x:300,y:180,w:360,h:180,rotate:0,fill:'#f3f4f6',stroke:'#d8d8de',strokeWidth:1,radius:16,text:''});
  const addChart=()=>addElement({id:uid('e'),type:'chart',chartType:'column',x:160,y:150,w:640,h:300,rotate:0,fill:'#ffffff',data:{labels:['Q1','Q2','Q3'],series:[{name:'收入',values:[12,18,26]}]}});
  const addTable=()=>addElement({id:uid('e'),type:'table',x:150,y:160,w:660,h:220,rotate:0,rows:[['项目','数值'],['A','1'],['B','2']],fontSize:16,color:'#1f2430',headerFill:'#f3f4f6',align:'left'});

  const readImageFile=async file=>{
   if(file.size>3*1024*1024)throw new Error('图片需小于 3 MB');
   return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file)});
  };

  const onPickImage=async(event)=>{
   const file=event.target.files&&event.target.files[0];
   event.target.value='';
   if(!file)return;
   try{
    const data=await readImageFile(file);
    addElement({id:uid('e'),type:'image',src:data,fit:'cover',x:200,y:140,w:600,h:340,rotate:0});
   }catch(e){setError(e.message)}
  };

  const onPickPptx=async(event)=>{
   const file=event.target.files&&event.target.files[0];
   event.target.value='';
   if(!file||importing)return;
   const pptxType='application/vnd.openxmlformats-officedocument.presentationml.presentation';
   if(!/\.pptx$/i.test(file.name)&&file.type!==pptxType){setError('请选择 .pptx（OpenXML）文件');return;}
   if(file.size>50*1024*1024){setError('PPTX 文件不能超过 50 MB');return;}
   setImporting(true);setError('');setNotice('');
   try{
    // Unsaved edits belong to the current project; save them before replacing the workbench.
    await flushDraft();
    const previous=projectRef.current;
    setBusy(true);
    const data=await fileBase64(file);
    const v=await call('POST',{
     action:'import',
     filename:file.name,
     title:file.name.replace(/\.pptx$/i,'').trim().slice(0,120)||undefined,
     data,
    },token.current,scope.sessionId);
    const imported=v.project;
    if(!imported||!Array.isArray(imported.slides))throw new Error('导入失败：服务器未返回可编辑的演示文稿');
    if(previous)clearDraft(previous.id);
    setBoot(b=>b?{...b,projects:Array.isArray(v.projects)?v.projects:b.projects}:b);
    resetDocument(imported,{revision:Number(imported.revision)||1,activeSlideId:imported.slides[0]?.id});
    setMark(null);setTool('select');setRequestText('');
    const warnings=(Array.isArray(v.warnings)?v.warnings:[])
     .map(w=>typeof w==='string'?w:String(w&&w.message?w.message:w||''))
     .filter(w=>w.trim());
    setImportWarnings(warnings);
    setNotice(warnings.length?`已导入「${imported.title||file.name}」，有 ${warnings.length} 条提示`:`已导入「${imported.title||file.name}」`);
   }catch(e){fail(e)}finally{setImporting(false);setBusy(false)}
  };

  const current=useMemo(()=>{
   if(!slide||!selected)return null;
   return slide.elements.find(e=>e.id===selected)||null;
  },[slide,selected]);
  const canEditText=Boolean(current&&canEditElement(current));

  const openImageReplace=()=>{
   const p=projectRef.current;
   if(!p||!slide||!current||current.type!=='image')return;
   replaceTarget.current={projectId:p.id,slideId:slide.id,elementId:current.id,epoch:epoch.current};
   if(replaceRef.current)replaceRef.current.click();
  };

  const onPickReplacement=async event=>{
   const file=event.target.files&&event.target.files[0];
   event.target.value='';
   const target=replaceTarget.current;
   replaceTarget.current=null;
   if(!file||!target)return;
   try{
    const data=await readImageFile(file);
    if(epoch.current!==target.epoch||projectRef.current?.id!==target.projectId)return;
    if(editorRef.current)commitActiveEdit({close:true});
    updateProject(proj=>updateElementById(proj,target.slideId,target.elementId,el=>el.type==='image'?{...el,src:data}:el));
    setNotice('已替换图片');
    setTimeout(()=>setNotice(''),1600);
   }catch(e){setError(e.message)}
  };

  const patchCurrent=(props,field)=>{
   const p=projectRef.current;
   if(!p||!current||!slide)return;
   updateProject(proj=>updateElementById(proj,slide.id,current.id,target=>({...target,...props})),{historyKey:`field:${current.id}:${field||Object.keys(props).join(',')}`});
  };

  const canvasPoint=(event)=>{
   const rect=canvasRef.current.getBoundingClientRect();
   return {x:(event.clientX-rect.left)/scale,y:(event.clientY-rect.top)/scale};
  };

  const applyPreview=useCallback(next=>{
   projectRef.current=next;
   setProject(next);
   dirtyRef.current=true;
   setDirty(true);
  },[]);

  const elementAt=id=>{
   const p=projectRef.current;
   if(!p)return null;
   const sl=p.slides[indexRef.current];
   return sl?sl.elements.find(e=>e.id===id)||null:null;
  };

  const selectedElement=()=>{
   const p=projectRef.current;
   if(!p||!selectedRef.current)return null;
   const sl=p.slides[indexRef.current];
   return sl?sl.elements.find(e=>e.id===selectedRef.current)||null:null;
  };

  const onPointerDown=(event)=>{
   if(!canvasRef.current||!slide)return;
   if(event.button!==undefined&&event.button!==0)return;
   if(canvasRef.current.focus)canvasRef.current.focus({preventScroll:true});
   const point=canvasPoint(event);
   if(tool==='mark'){
    drag.current={kind:'mark',start:point};
    setMark({x:point.x,y:point.y,w:0,h:0});
    canvasRef.current.setPointerCapture(event.pointerId);
    event.preventDefault();
    return;
   }
   const handle=event.target.closest&&event.target.closest('[data-handle]');
   if(handle){
    const el=elementAt(selectedRef.current);
    if(!el)return;
    const mode=handle.getAttribute('data-handle');
    drag.current={kind:mode==='rotate'?'rotate':'resize',handle:mode,id:el.id,slideId:slide.id,start:point,origin:{x:el.x,y:el.y,w:el.w,h:el.h,rotate:Number(el.rotate)||0,type:el.type,shape:el.shape},moved:false,pushed:false};
    if(canvasRef.current.setPointerCapture)canvasRef.current.setPointerCapture(event.pointerId);
    event.preventDefault();
    return;
   }
   const hit=event.target.closest&&event.target.closest('[data-el]');
   const id=hit&&hit.getAttribute('data-el');
   if(!id){
    if(editorRef.current)commitActiveEdit({close:true});
    selectElement('');
    return;
   }
   if(editorRef.current&&editorRef.current.elementId!==id)commitActiveEdit({close:true});
   selectElement(id);
   const el=elementAt(id);
   if(!el)return;
   drag.current={kind:'move',id,slideId:slide.id,start:point,startClient:{x:event.clientX,y:event.clientY},origin:{x:el.x,y:el.y,w:el.w,h:el.h,rotate:Number(el.rotate)||0,type:el.type,shape:el.shape},moved:false,pushed:false,captured:false};
  };

  const onPointerMove=(event)=>{
   const d=drag.current;
   if(!d)return;
   const point=canvasPoint(event);
   if(d.kind==='mark'){
    setMark({x:Math.min(d.start.x,point.x),y:Math.min(d.start.y,point.y),w:Math.abs(point.x-d.start.x),h:Math.abs(point.y-d.start.y)});
    return;
   }
   if(d.kind==='move'){
    if(!d.captured){
     if(Math.hypot(event.clientX-d.startClient.x,event.clientY-d.startClient.y)<3)return;
     d.captured=true;
     if(canvasRef.current&&canvasRef.current.setPointerCapture)canvasRef.current.setPointerCapture(event.pointerId);
    }
    const dx=point.x-d.start.x,dy=point.y-d.start.y;
    if(!d.pushed){
     if(Math.abs(dx)<0.5&&Math.abs(dy)<0.5)return;
     pushHistory(null);
     d.pushed=true;
     editSeq.current+=1;
    }
    d.moved=true;
    const nx=Math.round(d.origin.x+dx),ny=Math.round(d.origin.y+dy);
    const p=projectRef.current;
    const el=p&&p.slides.find(s=>s.id===d.slideId)?.elements.find(item=>item.id===d.id);
    if(!el||(el.x===nx&&el.y===ny))return;
    applyPreview(updateElementById(p,d.slideId,d.id,item=>({...item,x:nx,y:ny})));
    return;
   }
   if(d.kind==='resize'){
    const origin=d.origin;
    const {u,v}=unrotatedVector(origin.rotate);
    const dx=point.x-d.start.x,dy=point.y-d.start.y;
    const localX=dx*u.x+dy*u.y;
    const localY=dx*v.x+dy*v.y;
    const sx=d.handle.includes('e')?1:d.handle.includes('w')?-1:0;
    const sy=d.handle.includes('s')?1:d.handle.includes('n')?-1:0;
    if(!sx&&!sy)return;
    let w=origin.w,h=origin.h;
    if(sx)w=Math.max(2,origin.w+sx*localX);
    if(sy)h=Math.max(2,origin.h+sy*localY);
    const keepRatio=(origin.type==='image'&&!event.shiftKey)||(origin.type!=='image'&&event.shiftKey&&sx&&sy);
    if(keepRatio){
     const ratio=Math.max(0.01,origin.w/origin.h);
     if(sx&&sy){
      if(Math.abs(localX)>=Math.abs(localY))h=Math.max(2,w/ratio);
      else w=Math.max(2,h*ratio);
     }else if(sx){
      h=Math.max(2,w/ratio);
     }else if(sy){
      w=Math.max(2,h*ratio);
     }
    }
    const cx0=origin.x+origin.w/2;
    const cy0=origin.y+origin.h/2;
    const ax=cx0-sx*(origin.w/2)*u.x-sy*(origin.h/2)*v.x;
    const ay=cy0-sx*(origin.w/2)*u.y-sy*(origin.h/2)*v.y;
    const cx1=ax+sx*(w/2)*u.x+sy*(h/2)*v.x;
    const cy1=ay+sx*(w/2)*u.y+sy*(h/2)*v.y;
    const nx=Math.round(cx1-w/2),ny=Math.round(cy1-h/2);
    if(!d.pushed){pushHistory(null);d.pushed=true;editSeq.current+=1;}
    d.moved=true;
    const p=projectRef.current;
    applyPreview(updateElementById(p,d.slideId,d.id,item=>({...item,x:nx,y:ny,w:Math.round(w),h:Math.round(h)})));
    return;
   }
   if(d.kind==='rotate'){
    const origin=d.origin;
    const cx=origin.x+origin.w/2,cy=origin.y+origin.h/2;
    const a0=Math.atan2(d.start.y-cy,d.start.x-cx);
    const a1=Math.atan2(point.y-cy,point.x-cx);
    let deg=origin.rotate+(a1-a0)*180/Math.PI;
    if(event.shiftKey)deg=Math.round(deg/15)*15;
    deg=((deg+180)%360+360)%360-180;
    deg=Math.round(deg*10)/10;
    if(!d.pushed){pushHistory(null);d.pushed=true;editSeq.current+=1;}
    d.moved=true;
    const p=projectRef.current;
    applyPreview(updateElementById(p,d.slideId,d.id,item=>({...item,rotate:deg})));
   }
  };

  const cancelGesture=useCallback(()=>{
   const d=drag.current;
   if(!d)return false;
   drag.current=null;
   if(d.kind==='mark'){setMark(null);return true;}
   if(d.kind==='move'||d.kind==='resize'||d.kind==='rotate'){
    const p=projectRef.current;
    if(p){
     const next=updateElementById(p,d.slideId,d.id,item=>({...item,x:d.origin.x,y:d.origin.y,w:d.origin.w,h:d.origin.h,rotate:d.origin.rotate}));
     projectRef.current=next;
     setProject(next);
     dirtyRef.current=true;
     setDirty(true);
     if(d.pushed){
      const h=history.current;
      if(h.undo.length)h.undo.pop();
      h.lastKey=null;
      setHistoryVersion(v=>v+1);
     }
     scheduleDraft();
    }
    return true;
   }
   return false;
  },[scheduleDraft]);

  const onPointerUp=(event)=>{
   const d=drag.current;
   drag.current=null;
   if(!d)return;
   if(canvasRef.current&&canvasRef.current.hasPointerCapture&&canvasRef.current.hasPointerCapture(event.pointerId)){
    try{canvasRef.current.releasePointerCapture(event.pointerId)}catch{}
   }
   if(d.kind==='mark'){
    if(mark&&mark.w>8&&mark.h>8){setRequestText('');return;}
    setMark(null);
    return;
   }
   if(d.moved){
    editSeq.current+=1;
    dirtyRef.current=true;
    setDirty(true);
    scheduleDraft();
    clearTimeout(saveTimer.current);
    saveTimer.current=setTimeout(()=>{if(!drag.current)save().catch(()=>{});},120);
   }
  };

  const onPointerCancel=(event)=>{
   const d=drag.current;
   if(d&&canvasRef.current&&canvasRef.current.hasPointerCapture&&canvasRef.current.hasPointerCapture(event.pointerId)){
    try{canvasRef.current.releasePointerCapture(event.pointerId)}catch{}
   }
   cancelGesture();
  };

  const onDoubleClick=(event)=>{
   if(tool==='mark'||drag.current)return;
   const hit=event.target.closest&&event.target.closest('[data-el]');
   if(!hit)return;
   const id=hit.getAttribute('data-el');
   const el=elementAt(id);
   if(!el)return;
   if(el.type==='table'){
    const td=event.target.closest&&event.target.closest('td[data-row]');
    if(!td)return;
    const row=Number(td.getAttribute('data-row'));
    const col=Number(td.getAttribute('data-col'));
    if(!Number.isInteger(row)||!Number.isInteger(col))return;
    beginEditing(id,{row,col});
    event.preventDefault();
    return;
   }
   if(canEditElement(el)){
    beginEditing(id);
    event.preventDefault();
   }
  };

  const onEditorInput=useCallback(event=>{
   const s=editorRef.current;
   if(!s)return;
   s.value=String(event.target.value??'');
   if(!dirtyRef.current){dirtyRef.current=true;setDirty(true);}
   scheduleDraft();
   clearTimeout(saveTimer.current);
   saveTimer.current=setTimeout(()=>{save().catch(()=>{});},900);
  },[save,scheduleDraft]);

  const moveCell=(dr,dc)=>{
   const s=editorRef.current;
   if(!s||s.kind!=='cell')return;
   const p=projectRef.current;
   const sl=p&&p.slides.find(x=>x.id===s.slideId);
   const el=sl&&sl.elements.find(e=>e.id===s.elementId);
   const rows=el&&Array.isArray(el.rows)?el.rows:[];
   const cols=rows.reduce((max,row)=>Math.max(max,row.length),0);
   if(!rows.length||cols===0){commitActiveEdit({close:true});return;}
   let row=s.row,col=s.col;
   if(dc){
    col+=dc;
    if(col>=cols){col=0;row+=1;}
    else if(col<0){col=cols-1;row-=1;}
   }
   if(dr)row+=dr;
   if(row<0||row>=rows.length){commitActiveEdit({close:true});return;}
   beginEditing(s.elementId,{row,col:Math.max(0,Math.min(col,cols-1))});
  };

  const editorKeyDown=event=>{
   const s=editorRef.current;
   if(!s)return;
   const native=event.nativeEvent||event;
   if(native.isComposing||event.isComposing||native.keyCode===229)return;
   if(event.key==='Escape'){
    event.preventDefault();
    event.stopPropagation();
    cancelActiveEdit();
    return;
   }
   if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)){
    event.preventDefault();
    event.stopPropagation();
    commitActiveEdit({close:true});
    return;
   }
   if(s.kind==='cell'){
    if(event.key==='Enter'&&!event.shiftKey){
     event.preventDefault();
     event.stopPropagation();
     moveCell(1,0);
     return;
    }
    if(event.key==='Tab'){
     event.preventDefault();
     event.stopPropagation();
     moveCell(0,event.shiftKey?-1:1);
    }
   }
  };

  useEffect(()=>{
   const node=editInputRef.current;
   if(!node)return undefined;
   const handler=()=>onEditorInput({target:node});
   node.addEventListener('input',handler);
   return()=>node.removeEventListener('input',handler);
  },[editor&&editor.elementId,editor&&editor.kind,editor&&editor.row,editor&&editor.col,onEditorInput]);

  const removeElement=useCallback(id=>{
   const p=projectRef.current;
   if(!p||!id)return;
   const sl=p.slides[indexRef.current];
   if(!sl||!sl.elements.some(e=>e.id===id))return;
   if(editorRef.current&&editorRef.current.elementId===id)closeEditor();
   updateProject(proj=>replaceSlideById(proj,sl.id,s=>({...s,elements:s.elements.filter(e=>e.id!==id)})));
   selectElement('');
  },[closeEditor,selectElement,updateProject]);

  const insertCopy=useCallback(source=>{
   const p=projectRef.current;
   if(!p||!source)return null;
   const sl=p.slides[indexRef.current];
   if(!sl)return null;
   const copy=JSON.parse(JSON.stringify(source));
   copy.id=uid('e');
   copy.x=Math.round(source.x+24);
   copy.y=Math.round(source.y+24);
   updateProject(proj=>replaceSlideById(proj,sl.id,s=>({...s,elements:[...s.elements,copy]})));
   selectElement(copy.id);
   return copy;
  },[selectElement,updateProject]);

  const copySelected=useCallback(()=>{
   const el=selectedElement();
   if(!el)return false;
   clipboard.current=JSON.parse(JSON.stringify(el));
   setNotice('已复制元素');
   setTimeout(()=>setNotice(''),1200);
   return true;
  },[]);

  const pasteSelected=useCallback(()=>{
   if(!clipboard.current)return false;
   return Boolean(insertCopy(clipboard.current));
  },[insertCopy]);

  const duplicateSelected=useCallback(()=>{
   const el=selectedElement();
   return el?Boolean(insertCopy(el)):false;
  },[insertCopy]);

  const moveLayer=useCallback(mode=>{
   const p=projectRef.current;
   const el=selectedElement();
   if(!p||!el)return;
   const sl=p.slides[indexRef.current];
   if(!sl)return;
   const i=sl.elements.findIndex(e=>e.id===el.id);
   if(i<0)return;
   updateProject(proj=>replaceSlideById(proj,sl.id,s=>{
    const elements=s.elements.slice();
    const [item]=elements.splice(i,1);
    let target=i;
    if(mode==='front')target=elements.length;
    else if(mode==='back')target=0;
    else if(mode==='up')target=Math.min(elements.length,i+1);
    else target=Math.max(0,i-1);
    elements.splice(target,0,item);
    return {...s,elements};
   }));
  },[updateProject]);

  const nudgeSelected=useCallback((dx,dy)=>{
   const p=projectRef.current;
   const el=selectedElement();
   if(!p||!el)return;
   const sl=p.slides[indexRef.current];
   if(!sl)return;
   updateProject(proj=>updateElementById(proj,sl.id,el.id,item=>({...item,x:Math.round(item.x+dx),y:Math.round(item.y+dy)})),{historyKey:`nudge:${el.id}`});
  },[updateProject]);

  const onCanvasKeyDown=useCallback(event=>{
   if(!visible||editorRef.current)return;
   const target=event.target;
   if(target){
    const tag=String(target.tagName||'').toUpperCase();
    if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT'||target.isContentEditable===true)return;
   }
   const mod=event.ctrlKey||event.metaKey;
   const key=String(event.key||'');
   const lower=key.toLowerCase();
   if(mod&&lower==='z'){event.preventDefault();if(event.shiftKey)redo();else undo();return;}
   if(mod&&lower==='y'){event.preventDefault();redo();return;}
   if(mod&&lower==='s'){event.preventDefault();save(true).catch(()=>{});return;}
   if(mod&&lower==='d'){event.preventDefault();duplicateSelected();return;}
   if(mod&&lower==='c'){event.preventDefault();copySelected();return;}
   if(mod&&lower==='v'){event.preventDefault();pasteSelected();return;}
   if(key==='Delete'||key==='Backspace'){
    if(selectedRef.current){event.preventDefault();removeElement(selectedRef.current);}
    return;
   }
   if(key.indexOf('Arrow')===0&&selectedRef.current){
    event.preventDefault();
    const step=event.shiftKey?10:1;
    if(key==='ArrowLeft')nudgeSelected(-step,0);
    else if(key==='ArrowRight')nudgeSelected(step,0);
    else if(key==='ArrowUp')nudgeSelected(0,-step);
    else nudgeSelected(0,step);
    return;
   }
   if(key==='Escape'){
    if(cancelGesture())event.preventDefault();
    else if(selectedRef.current){event.preventDefault();selectElement('');}
   }
  },[cancelGesture,copySelected,duplicateSelected,nudgeSelected,pasteSelected,redo,removeElement,save,selectElement,undo,visible]);

  const prepareRequestData=()=>{
   if(!project||!slide)return null;
   const text=requestText.trim();
   if(!text)return null;
   const area=mark?{x:Math.round(mark.x),y:Math.round(mark.y),w:Math.round(mark.w),h:Math.round(mark.h)}:null;
   const elementIds=area?slide.elements.filter(el=>{
    return !(el.x+el.w<area.x||area.x+area.w<el.x||el.y+el.h<area.y||area.y+area.h<el.y);
   }).map(el=>el.id):(selected?[selected]:[]);
   const reqId='r_'+Math.random().toString(36).slice(2,10);
   return {
    id:reqId,
    projectId:project.id,
    slideId:slide.id,
    elementIds,
    area,
    instruction:text,
    baseRevision:baseRevision.current,
    formattedText:`【PPT 修改请求 #${reqId}】\n项目: ${project.title} (ID: ${project.id}, 基准 r${baseRevision.current})\n目标页面: ${slide.id}${elementIds.length?`\n关联元素: ${elementIds.join(', ')}`:''}${area?`\n框选区域: x=${area.x}, y=${area.y}, w=${area.w}, h=${area.h}`:''}\n要求: ${text}`,
   };
  };

  const submitRequest=async(targetAction='record')=>{
   const reqData=prepareRequestData();
   if(!reqData){setError('请先写明修改要求');return;}
   setBusy(true);setError('');
   try{
    await flushDraft();
    const opId='op_'+Math.random().toString(36).slice(2,10);
    const v=await call('POST',{
     action:'request',
     id:project.id,
     baseRevision:baseRevision.current,
     operationId:opId,
     requestId:reqData.id,
     slideId:reqData.slideId,
     elementIds:reqData.elementIds,
     area:reqData.area,
     instruction:reqData.instruction,
    },token.current,scope.sessionId);

    baseRevision.current=v.revision;projectRef.current=v.project;setProject(v.project);
    setMark(null);setTool('select');setRequestText('');

    if(targetAction==='send'){
     const actx=clientContext?.sessions?.scope?.(scope.sessionId);
     if(actx?.conversation?.send){
      await actx.conversation.send(reqData.formattedText);
      setNotice('已记录修改请求，并已发送给当前会话中的 AI');
     }else{
      setNotice('已记录修改请求。当前客户端不支持自动发送，请在对话中让 AI 处理');
     }
    }else if(targetAction==='draft'){
     const actx=clientContext?.sessions?.scope?.(scope.sessionId);
     if(actx?.conversation?.input?.for){
      if(window.confirm('这会替换输入框中的当前草稿，是否继续？')){
       actx.conversation.input.for(actx).setDraft(reqData.formattedText);
       setNotice('已填入输入框草稿');
      }
     }else{
      setNotice('当前客户端不支持设置输入草稿');
     }
    }else{
     setNotice('修改请求已记录');
    }
   }catch(e){fail(e)}finally{setBusy(false)}
  };

  const openRequests=(project&&project.pending?project.pending.filter(p=>p.status==='open'):[]);

  useEffect(()=>{
   if(!current||current.type!=='chart'){
    if(chartDraft)setChartDraft(null);
    return;
   }
   setChartDraft(prev=>{
    if(prev&&prev.elementId===current.id)return prev;
    return {
     elementId:current.id,
     labels:(current.data&&current.data.labels||[]).join(','),
     series:(current.data&&current.data.series||[]).map(s=>`${s.name}:${(s.values||[]).join(',')}`).join('\n'),
     error:'',
    };
   });
  },[current&&current.id,current&&current.type]);

  const applyChartDraft=()=>{
   if(!current||current.type!=='chart'||!chartDraft)return;
   const labels=chartDraft.labels.split(',').map(s=>s.trim()).filter(Boolean);
   const series=[];
   for(const raw of chartDraft.series.split('\n')){
    const line=raw.trim();
    if(!line)continue;
    const at=line.indexOf(':');
    if(at<0){setChartDraft({...chartDraft,error:'系列需使用「名称:值1,值2」格式'});return;}
    const values=line.slice(at+1).split(',').map(v=>Number(v.trim()));
    if(values.some(v=>!Number.isFinite(v))){setChartDraft({...chartDraft,error:'系列数值需为数字'});return;}
    series.push({name:line.slice(0,at).trim(),values});
   }
   if(!labels.length||!series.length){setChartDraft({...chartDraft,error:'至少需要一个分类和一个系列'});return;}
   patchCurrent({data:{labels,series}},'data');
   setChartDraft({...chartDraft,error:''});
  };

  const tableSizes=el=>{
   const rows=(el&&el.rows)||[];
   return {rows,cols:rows.reduce((max,row)=>Math.max(max,(row||[]).length),1)};
  };
  const changeTableRows=remove=>{
   if(!current||current.type!=='table')return;
   const {rows,cols}=tableSizes(current);
   if(remove){
    if(rows.length<=1)return;
    patchCurrent({rows:rows.slice(0,-1)},'rows');
   }else{
    if(rows.length>=60)return;
    patchCurrent({rows:[...rows,Array(cols).fill('')]},'rows');
   }
  };
  const changeTableCols=remove=>{
   if(!current||current.type!=='table')return;
   const {rows,cols}=tableSizes(current);
   if(remove){
    if(cols<=1)return;
    patchCurrent({rows:rows.map(row=>row.slice(0,-1))},'rows');
   }else{
    if(cols>=12)return;
    patchCurrent({rows:rows.map(row=>[...row,''])},'rows');
   }
  };

  const addSlide=()=>{
   const p=projectRef.current;
   if(!p)return;
   if(editorRef.current)commitActiveEdit({close:true});
   const source=p.slides[indexRef.current];
   const next=blankSlide();
   if(source&&source.backdropId)next.backdropId=source.backdropId;
   const at=indexRef.current+1;
   updateProject(proj=>{const slides=proj.slides.slice();slides.splice(at,0,next);return {...proj,slides};});
   goToSlide(at);
   selectElement('');
  };

  const removeSlide=()=>{
   const p=projectRef.current;
   if(!p||p.slides.length<=1)return;
   if(editorRef.current)commitActiveEdit({close:true});
   const at=indexRef.current;
   updateProject(proj=>{const slides=proj.slides.slice();slides.splice(at,1);return {...proj,slides};});
   goToSlide(Math.max(0,at-1));
   selectElement('');
  };

  const canUndo=history.current.undo.length>0;
  const canRedo=history.current.redo.length>0;

  const cellEditorNode=editor&&editor.kind==='cell'
   ?h('textarea',{key:`${editor.row}-${editor.col}`,ref:editInputRef,className:'pts-cell-edit','aria-label':'编辑单元格',defaultValue:editor.value,autoFocus:true,onPointerDown:e=>e.stopPropagation(),onClick:e=>e.stopPropagation(),onDoubleClick:e=>e.stopPropagation(),onInput:onEditorInput,onKeyDown:editorKeyDown,onBlur:()=>{if(editorRef.current&&editorRef.current.kind==='cell')commitActiveEdit({close:true})}})
   :null;

  const editingElement=editor&&editor.kind==='text'&&slide?slide.elements.find(e=>e.id===editor.elementId):null;

  const handlesFor=el=>{
   if(!el||selected!==el.id||(editor&&editor.elementId===el.id))return null;
   const names=el.type==='shape'&&el.shape==='line'?['e','w']:['nw','n','ne','e','se','s','sw','w'];
   const spots={nw:[0,0],n:[50,0],ne:[100,0],e:[100,50],se:[100,100],s:[50,100],sw:[0,100],w:[0,50]};
   const size=Math.round((9/Math.max(scale,0.05))*100)/100;
   const nodes=names.map(name=>{
    const [left,top]=spots[name];
    return h('div',{key:name,'data-handle':name,className:'pts-handle',style:{left:`${left}%`,top:`${top}%`,width:size,height:size}});
   });
   nodes.push(h('div',{key:'rotate','data-handle':'rotate',className:'pts-handle rot',style:{left:'50%',top:`${-18/Math.max(scale,0.05)}px`,width:size,height:size}}));
   return nodes;
  };

  const typeLabels={text:'文字',shape:'形状',image:'图片',chart:'图表',table:'表格'};
  const formatBar=current?h('div',{className:'pts-format','data-testid':'format-bar'},
   h('span',{className:'pts-note'},`已选：${typeLabels[current.type]||current.type}`),
   canEditText&&h('input',{type:'number','aria-label':'字号',title:'字号',value:Math.round(current.fontSize||24),onChange:e=>patchCurrent({fontSize:Math.max(6,Number(e.target.value)||24)},'fontSize')}),
   canEditText&&h('select',{'aria-label':'加粗',value:String(current.bold===true),onChange:e=>patchCurrent({bold:e.target.value==='true'},'bold')},h('option',{value:'false'},'常规'),h('option',{value:'true'},'加粗')),
   canEditText&&h('input',{type:'color','aria-label':'文字颜色',title:'文字颜色',value:/^#[0-9a-f]{6}$/i.test(current.color||'')?current.color:'#1f2430',onChange:e=>patchCurrent({color:e.target.value},'color')}),
   canEditText&&h('select',{'aria-label':'对齐',value:current.align||'left',onChange:e=>patchCurrent({align:e.target.value},'align')},h('option',{value:'left'},'左对齐'),h('option',{value:'center'},'居中'),h('option',{value:'right'},'右对齐')),
   current.type==='table'&&h('select',{'aria-label':'表格对齐',value:current.align||'left',onChange:e=>patchCurrent({align:e.target.value},'align')},h('option',{value:'left'},'左对齐'),h('option',{value:'center'},'居中'),h('option',{value:'right'},'右对齐')),
   current.type==='image'&&h('select',{'aria-label':'图片适应',value:current.fit||'cover',onChange:e=>patchCurrent({fit:e.target.value},'fit')},h('option',{value:'cover'},'填满裁剪'),h('option',{value:'contain'},'完整显示')),
   current.type==='image'&&h('button',{onClick:openImageReplace},'替换图片'),
   h('span',{className:'pts-spacer'}),
   h('button',{disabled:!canUndo,'data-action':'undo',title:'撤销 (Ctrl+Z)',onClick:undo},'撤销'),
   h('button',{disabled:!canRedo,'data-action':'redo',title:'重做 (Ctrl+Shift+Z)',onClick:redo},'重做'),
   h('button',{'data-action':'duplicate',onClick:duplicateSelected},'副本'),
   h('button',{'data-action':'delete',onClick:()=>current&&removeElement(current.id)},'删除')):null;

  const pptxPicker=h('input',{key:'pptx-picker',ref:pptxRef,type:'file',accept:'.pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation',style:{display:'none'},onChange:onPickPptx});
  const imagePicker=h('input',{key:'image-picker',ref:fileRef,type:'file',accept:'image/*',style:{display:'none'},onChange:onPickImage});
  const replacePicker=h('input',{key:'image-replace-picker',ref:replaceRef,type:'file',accept:'image/*',style:{display:'none'},onChange:onPickReplacement});
  const importWarningsBar=importWarnings.length>0&&h('div',{className:'pts-bar',role:'status',style:{alignItems:'flex-start',background:'rgba(226,150,43,.10)',maxHeight:'25%',overflowY:'auto'}},
   h('div',{className:'pts-note',style:{flex:1,minWidth:0}},
    h('strong',null,'导入提示：'),
    importWarnings.map((warning,i)=>h('div',{key:i},`· ${warning}`))),
   h('button',{onClick:()=>setImportWarnings([])},'知道了'));

  if(!boot)return h('div',{className:'pts'},h('style',null,css),h('div',{className:'pts-empty'},
   h('div',null,`${error||'正在连接 PPT Studio…'}（v${CLIENT_BUILD}）`),
   error&&h('button',{style:{marginTop:10},disabled:busy,onClick:()=>{load().catch(fail)}},busy?'重试中…':'重试连接')));

  if(!project){
   return h('div',{className:'pts'},h('style',null,css),
    h('div',{className:'pts-bar'},
     h('button',{className:'primary',disabled:busy||importing,onClick:create},'新建演示文稿'),
     h('button',{disabled:busy||importing,onClick:()=>pptxRef.current&&pptxRef.current.click()},importing?'导入中…':'导入 PPTX'),
     pptxPicker,
     h('button',{disabled:busy||importing,onClick:()=>load()},'刷新')),
    importWarningsBar,
    h('div',{className:'pts-empty'},
     h('div',null,'还没有打开演示文稿。'),
     h('div',{className:'pts-note'},'可直接导入 .pptx 继续编辑；导入不会修改原始文件。'),
     error&&h('div',{className:'pts-error',role:'alert'},error)),
    boot.projects&&boot.projects.length>0&&h('div',{className:'pts-empty'},
     h('div',null,'已有项目：'),
     boot.projects.map(p=>h('div',{key:p.id},h('button',{style:{marginTop:6},onClick:()=>openProject(p.id)},`${p.title} · ${p.slides} 页`)))));
  }

  const showCanvas=width>0&&height>0;
  return h('div',{className:'pts',onKeyDown:onCanvasKeyDown},h('style',null,css),
   h('div',{className:'pts-bar'},
    h(Icon,{size:14}),
    h('select',{value:project.id,'aria-label':'选择演示文稿',onChange:e=>openProject(e.target.value)},
     (boot.projects||[]).map(p=>h('option',{key:p.id,value:p.id},`${p.title} · r${p.revision}`))),
    h('button',{disabled:busy||importing,onClick:create},'新建'),
    h('button',{disabled:busy||importing,onClick:()=>pptxRef.current&&pptxRef.current.click()},importing?'导入中…':'导入 PPTX'),
    pptxPicker,
    h('button',{onClick:()=>addText()},'文字'),
    h('button',{onClick:()=>addShape()},'形状'),
    h('button',{onClick:()=>addChart()},'图表'),
    h('button',{onClick:()=>addTable()},'表格'),
    h('button',{onClick:()=>fileRef.current&&fileRef.current.click()},'图片'),
    imagePicker,
    replacePicker,
    h('span',{className:'pts-spacer'}),
    h('button',{className:tool==='mark'?'on':'',title:'在画布上框选区域，交给 AI 修改',onClick:()=>{setTool(tool==='mark'?'select':'mark');setMark(null)}},'圈选修改'),
    h('button',{className:'primary',disabled:busy||(!dirty&&!saveRef.current.retry),onClick:()=>save(true).catch(()=>{})},busy?'保存中…':(dirty?'保存':'已保存')),
    h('button',{disabled:busy,onClick:doExport},'导出 PPTX')),
   formatBar,
   importWarningsBar,
   conflict&&h('div',{className:'pts-bar',style:{background:'rgba(226,75,43,.10)'}},
    h('span',{className:'pts-error'},conflict),
    h('button',{onClick:async()=>{if(window.confirm('重新载入将放弃本地未保存草稿，是否继续？')){clearDraft(project.id);await load(project.id);}}},'重新载入'),
    h('button',{onClick:saveCopy},'另存草稿副本')),
   h('div',{className:'pts-body'},
    h('div',{className:'pts-thumbs'},
     project.slides.map((s,i)=>h(Thumb,{key:s.id,slide:s,index:i,active:i===safeIndex,viewport:project.viewport,theme:project.theme,backdrop:project.backdrops?.[s.backdropId],onClick:()=>{if(editorRef.current)commitActiveEdit({close:true});goToSlide(i);selectElement('')}})),
     h('button',{onClick:addSlide},'+ 页'),
     project.slides.length>1&&h('button',{onClick:removeSlide},'删页')),
    h('div',{className:'pts-main'},
     h('div',{className:'pts-stage',ref:stageRef},
      showCanvas&&h('div',{tabIndex:0,role:'application','aria-label':'幻灯片画布','data-testid':'ppt-canvas',className:'pts-canvas',ref:canvasRef,style:{width:project.viewport.width*scale,height:project.viewport.height*scale,background:slide.background||project.theme.backgroundColor,fontFamily:project.theme.fontName},
       onPointerDown,onPointerMove,onPointerUp,onPointerCancel,onDoubleClick},
       h('div',{style:{position:'absolute',left:0,top:0,width:project.viewport.width,height:project.viewport.height,transform:`scale(${scale})`,transformOrigin:'0 0'}},
        project.backdrops?.[slide.backdropId]&&h('img',{src:project.backdrops[slide.backdropId],alt:'',style:{position:'absolute',inset:0,width:'100%',height:'100%',pointerEvents:'none'}}),
        slide.elements.map(el=>{
         const cell=editor&&editor.kind==='cell'&&editor.elementId===el.id?{row:editor.row,col:editor.col,node:cellEditorNode}:null;
         const textEditing=Boolean(editor&&editor.kind==='text'&&editor.elementId===el.id);
         return h('div',{key:el.id,'data-el':el.id,className:'pts-el'+(selected===el.id?' sel':''),style:{position:'absolute',left:el.x,top:el.y,width:el.w,height:el.h,transform:el.rotate?`rotate(${el.rotate}deg)`:undefined}},
          h(ElementView,{el,scale,cell}),
          textEditing&&h('textarea',{key:'editor','data-testid':'canvas-editor',ref:editInputRef,className:'pts-edit',autoFocus:true,defaultValue:editor.value,onPointerDown:e=>e.stopPropagation(),onClick:e=>e.stopPropagation(),onDoubleClick:e=>e.stopPropagation(),onInput:onEditorInput,onKeyDown:editorKeyDown,onBlur:()=>{if(editorRef.current&&editorRef.current.kind==='text')commitActiveEdit({close:true})},style:{left:0,top:0,width:'100%',height:'100%',fontSize:el.fontSize,color:el.color,fontWeight:el.bold?700:400,textAlign:el.align||'left',lineHeight:el.lineHeight||1.25,padding:el.type==='shape'?4:0,background:el.type==='shape'?(el.fill||'#f3f4f6'):(el.fill||'#fff')}}),
          handlesFor(el));
        }),
        mark&&h('div',{className:'pts-mark',style:{left:mark.x,top:mark.y,width:mark.w,height:mark.h}})))),
     h('div',{className:'pts-side'},
      h('div',{className:'pts-field'},h('label',null,'标题'),h('input',{value:project.title,onChange:e=>updateProject(p=>({...p,title:e.target.value}),{historyKey:'title'})})),
      h('div',{className:'pts-field'},h('label',null,'本页备注'),h('textarea',{style:{minHeight:52},value:slide.note||'',onChange:e=>updateProject(p=>replaceSlideById(p,slide.id,s=>({...s,note:e.target.value})),{historyKey:`note:${slide.id}`})})),
      current?h('div',{style:{display:'flex',flexDirection:'column',gap:8}},
       h('div',{className:'pts-note'},`已选中：${typeLabels[current.type]||current.type}`),
       h('div',{className:'pts-row'},
        h('div',{className:'pts-field'},h('label',null,'X'),h('input',{type:'number',value:Math.round(current.x),onChange:e=>patchCurrent({x:Number(e.target.value)||0},'x')})),
        h('div',{className:'pts-field'},h('label',null,'Y'),h('input',{type:'number',value:Math.round(current.y),onChange:e=>patchCurrent({y:Number(e.target.value)||0},'y')})),
        h('div',{className:'pts-field'},h('label',null,'宽'),h('input',{type:'number',value:Math.round(current.w),onChange:e=>patchCurrent({w:Math.max(1,Number(e.target.value)||1)},'w')})),
        h('div',{className:'pts-field'},h('label',null,'高'),h('input',{type:'number',value:Math.round(current.h),onChange:e=>patchCurrent({h:Math.max(1,Number(e.target.value)||1)},'h')}))),
       h('div',{className:'pts-row'},
        h('div',{className:'pts-field'},h('label',null,'旋转'),h('input',{type:'number','aria-label':'旋转',value:Math.round(current.rotate||0),onChange:e=>patchCurrent({rotate:Number(e.target.value)||0},'rotate')})),
        h('div',{className:'pts-field'},h('label',null,'快捷'),h('div',{className:'pts-note'},'方向键微调 · Ctrl+D 副本'))),
       canEditText&&h('div',{style:{display:'flex',flexDirection:'column',gap:8}},
        h('div',{className:'pts-field'},h('label',null,'文字'),h('textarea',{'aria-label':'元素文字',value:current.text||'',onChange:e=>patchCurrent({text:e.target.value},'text')})),
        h('div',{className:'pts-row'},
         h('div',{className:'pts-field'},h('label',null,'字号'),h('input',{type:'number',value:Math.round(current.fontSize||24),onChange:e=>patchCurrent({fontSize:Math.max(6,Number(e.target.value)||24)},'fontSize')})),
         h('div',{className:'pts-field'},h('label',null,'行高'),h('input',{type:'number',step:'0.05',value:current.lineHeight||1.25,onChange:e=>patchCurrent({lineHeight:Math.max(0.7,Number(e.target.value)||1.25)},'lineHeight')}))),
        h('div',{className:'pts-row'},
         h('div',{className:'pts-field'},h('label',null,'颜色'),h('input',{type:'color',value:/^#[0-9a-f]{6}$/i.test(current.color||'')?current.color:'#1f2430',onChange:e=>patchCurrent({color:e.target.value},'color')})),
         h('div',{className:'pts-field'},h('label',null,'背景'),h('input',{type:'color',value:/^#[0-9a-f]{6}$/i.test(current.fill||'')?current.fill:'#ffffff',onChange:e=>patchCurrent({fill:e.target.value},'fill')})))),
       current.type==='shape'&&h('div',{style:{display:'flex',flexDirection:'column',gap:8}},
        h('div',{className:'pts-field'},h('label',null,'形状'),h('select',{value:current.shape||'rect',onChange:e=>patchCurrent({shape:e.target.value},'shape')},h('option',{value:'rect'},'矩形'),h('option',{value:'roundRect'},'圆角矩形'),h('option',{value:'ellipse'},'椭圆'),h('option',{value:'line'},'线条'))),
        h('div',{className:'pts-row'},
         h('div',{className:'pts-field'},h('label',null,'填充'),h('input',{type:'color',value:/^#[0-9a-f]{6}$/i.test(current.fill||'')?current.fill:'#f3f4f6',onChange:e=>patchCurrent({fill:e.target.value},'fill')})),
         h('div',{className:'pts-field'},h('label',null,'描边'),h('input',{type:'color',value:/^#[0-9a-f]{6}$/i.test(current.stroke||'')?current.stroke:'#1f2430',onChange:e=>patchCurrent({stroke:e.target.value},'stroke')}))),
        h('div',{className:'pts-row'},
         h('div',{className:'pts-field'},h('label',null,'圆角'),h('input',{type:'number',value:Math.round(current.radius||0),onChange:e=>patchCurrent({radius:Math.max(0,Number(e.target.value)||0)},'radius')})),
         h('div',{className:'pts-field'},h('label',null,'描边粗细'),h('input',{type:'number',value:Math.round(current.strokeWidth||0),onChange:e=>patchCurrent({strokeWidth:Math.max(0,Number(e.target.value)||0)},'strokeWidth')})))),
       current.type==='chart'&&h('div',{style:{display:'flex',flexDirection:'column',gap:8}},
        h('div',{className:'pts-field'},h('label',null,'图表类型'),h('select',{value:current.chartType,onChange:e=>patchCurrent({chartType:e.target.value},'chartType')},['column','bar','line','area','pie','doughnut','radar','scatter'].map(v=>h('option',{key:v,value:v},v)))),
        chartDraft&&h('div',{style:{display:'flex',flexDirection:'column',gap:8}},
         h('div',{className:'pts-field'},h('label',null,'分类（逗号分隔）'),h('input',{'aria-label':'图表分类',value:chartDraft.labels,onChange:e=>setChartDraft({...chartDraft,labels:e.target.value,error:''})})),
         h('div',{className:'pts-field'},h('label',null,'系列（每行：名称:值1,值2）'),h('textarea',{'aria-label':'图表系列',value:chartDraft.series,onChange:e=>setChartDraft({...chartDraft,series:e.target.value,error:''})})),
         chartDraft.error&&h('div',{className:'pts-error',role:'alert'},chartDraft.error),
         h('button',{onClick:applyChartDraft},'应用图表数据'))),
       current.type==='table'&&h('div',{style:{display:'flex',flexDirection:'column',gap:8}},
        h('div',{className:'pts-row'},
         h('button',{onClick:()=>changeTableRows(false)},'加行'),
         h('button',{onClick:()=>changeTableRows(true)},'删行'),
         h('button',{onClick:()=>changeTableCols(false)},'加列'),
         h('button',{onClick:()=>changeTableCols(true)},'删列')),
        h('div',{className:'pts-note'},'双击单元格可直接输入；Enter 下移，Tab 右移。'),
        h('div',{className:'pts-field'},h('label',null,'批量内容（每行一行，Tab 或逗号分隔）'),h('textarea',{value:(current.rows||[]).map(r=>r.join('\t')).join('\n'),onChange:e=>patchCurrent({rows:e.target.value.split('\n').map(line=>line.split(/\t|,/).map(c=>c.trim()))},'rows')}))),
       current.type==='image'&&h('div',{className:'pts-note'},'图片以原图嵌入；替换会保留元素位置和框尺寸。'),
       h('div',{className:'pts-row'},
        h('button',{onClick:()=>moveLayer('front')},'置顶'),
        h('button',{onClick:()=>moveLayer('up')},'上移'),
        h('button',{onClick:()=>moveLayer('down')},'下移'),
        h('button',{onClick:()=>moveLayer('back')},'置底')),
       h('div',{className:'pts-row'},
        h('button',{onClick:duplicateSelected},'副本'),
        h('button',{onClick:copySelected},'复制'),
        h('button',{onClick:pasteSelected},'粘贴'),
        h('button',{onClick:()=>removeElement(current.id)},'删除'))):h('div',{className:'pts-note'},'点选元素后可拖动、缩放和旋转；双击文字或形状改字，双击表格单元格输入。也可以框选一块区域交给 AI。'),
      h('div',{className:'pts-field'},h('label',null,'画布比例'),h('select',{value:String(ratio),onChange:e=>updateProject(p=>({...p,viewport:{...p.viewport,height:p.viewport.width*Number(e.target.value)}}))},h('option',{value:'0.5625'},'16:9'),h('option',{value:'0.75'},'4:3'),h('option',{value:'1.4142'},'A4 竖版'))),
      h('div',{className:'pts-note'},`版本 r${project.revision} · ${project.slides.length} 页`),
      openRequests.length>0&&h('div',{className:'pts-field'},h('label',null,`待处理的修改请求（${openRequests.length}）`),h('div',{className:'pts-note'},openRequests.map(r=>h('div',{key:r.id},`· [${r.id}] ${r.instruction}`)))),
      error&&h('div',{className:'pts-error',role:'alert'},error),
      notice&&h('div',{className:'pts-ok',role:'status'},notice)),
     ),
    ),
   h('div',{className:'pts-markbar'},
    h('span',{className:'pts-note'},tool==='mark'?'框选区域后写清楚要求：':'开启「圈选修改」后可框选区域并交付 AI。'),
    tool==='mark'&&h('input',{value:requestText,placeholder:'例如：这一块字号太小，改成两栏布局',onChange:e=>setRequestText(e.target.value),onKeyDown:e=>{if(e.key==='Enter')submitRequest('send')}}),
    tool==='mark'&&h('button',{className:'primary',disabled:busy||!requestText.trim(),onClick:()=>submitRequest('send')},'交给 AI 修改'),
    tool==='mark'&&h('button',{disabled:busy||!requestText.trim(),onClick:()=>submitRequest('draft')},'替换输入草稿'),
    tool==='mark'&&h('button',{disabled:busy||!requestText.trim(),onClick:()=>submitRequest('record')},'仅记录请求'),
    tool==='mark'&&h('button',{onClick:()=>{setTool('select');setMark(null);setRequestText('')}},'取消')));
 }

 return {
  inject:['slots'],
  apply(ctx){
    clientContext=ctx;
    ctx.effect(()=>ctx.slots.inject('settings.section',()=>ctx.slots.register({name:'settings.section',id:'dsh-ppt-studio',order:30,label:()=> 'PPT Studio'},SettingsPanel)));
   ctx.inject(['betterSidebar'],child=>{
    child.effect(()=>{
      let dispose=null;
      const set=value=>{
       dispose?.();dispose=null;
       if(value)dispose=child.betterSidebar.registerTab(TabDescriptor());
      };
      tabController={set,refresh:()=>set(readTabPref())};
      set(readTabPref());
      return()=>{dispose?.();dispose=null;if(tabController?.set===set)tabController=null;};
    });
   });
  },
 };
}});
