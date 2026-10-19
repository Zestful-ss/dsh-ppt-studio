globalThis.__ModuleLoader__?.load({id:'dsh-ppt-studio',factory:require=>{
 const React=require('react'),h=React.createElement;
 const {useState,useEffect,useRef,useCallback,useMemo}=React;

 const css=`
 .pts{height:100%;min-height:0;display:flex;flex-direction:column;font-family:inherit;color:var(--dsw-alias-label-primary,#202024);font-size:12px;background:var(--dsw-alias-bg-layer-1,#fff)}
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
 .pts-thumb .n{position:absolute;left:3px;top:2px;font-size:10px;color:#9a9aa2;background:#fff;border-radius:3px;padding:0 3px}
 .pts-thumb .box{position:absolute;background:#e9e9ef;border-radius:2px}
 .pts-main{flex:1;min-width:0;display:flex;flex-direction:column;overflow:hidden}
 .pts-stage{flex:1;min-height:0;overflow:auto;padding:10px;display:flex;align-items:flex-start;justify-content:center;background:var(--dsw-alias-bg-layer-2,#f4f4f6)}
 .pts-canvas{position:relative;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.14);flex:none;touch-action:none}
 .pts-el{position:absolute;user-select:none;cursor:move}
 .pts-el.sel{outline:1.5px solid #e24b2b;outline-offset:1px}
 .pts-el-text{white-space:pre-wrap;overflow:hidden;word-break:break-word}
 .pts-edit{position:absolute;z-index:5;border:1.5px solid #e24b2b;background:#fff;color:#111;resize:none;padding:0;margin:0;font-family:inherit;line-height:1.25;overflow:auto;outline:none}
 .pts-mark{position:absolute;border:1.5px dashed #e24b2b;background:rgba(226,75,43,.10);pointer-events:none}
 .pts-side{width:240px;flex:none;border-left:1px solid var(--dsw-alias-border-main,#e6e6ea);overflow-y:auto;padding:8px;display:flex;flex-direction:column;gap:8px}
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
 async function call(method,body,token,sessionId){
  const url=new URL(endpoint,window.location.href);
  if(sessionId)url.searchParams.set('sessionId',sessionId);
  const payload=body?{...body,sessionId}:undefined;
  const r=await fetch(url.href,{method,headers:payload?{'content-type':'application/json','x-ppt-studio-token':token||''}:{},body:payload?JSON.stringify(payload):undefined,cache:'no-store',credentials:'same-origin'});
  let v={};try{v=await r.json()}catch{}
  if(!r.ok){const e=new Error(v.error||`请求失败（${r.status}）`);e.status=r.status;e.code=v.code;throw e;}
  return v;
 }

 const uid=p=>p+'_'+Math.random().toString(36).slice(2,10);
 const slug=t=>String(t||'演示文稿').replace(/[\\/:*?"<>|]+/g,' ').replace(/\s+/g,' ').trim().slice(0,60)||'演示文稿';

 function blankSlide(){return {id:uid('s'),note:'',elements:[]};}

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

 function ElementView({el,scale}){
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
   const radius=el.shape==='ellipse'?'50%':el.shape==='roundRect'?`${el.radius||10}px`:'0';
   return h('div',{style:{width:'100%',height:'100%',background:el.fill||'#f3f4f6',borderRadius:radius,border:el.strokeWidth>0?`${el.strokeWidth}px solid ${el.stroke||'#1f2430'}`:'none'}},
    el.text?h('div',{style:{width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:el.align==='left'?'flex-start':el.align==='right'?'flex-end':'center',color:el.color||'#1f2430',fontSize:el.fontSize||20,overflow:'hidden',whiteSpace:'pre-wrap'}},el.text):null);
  }
  if(el.type==='image'){
   return h('img',{src:el.src,alt:'',style:{width:'100%',height:'100%',objectFit:el.fit==='contain'?'contain':'cover',display:'block'}});
  }
  if(el.type==='chart'){
   return h('div',{style:{width:'100%',height:'100%',background:el.fill||'#fff',border:'1px solid #e6e6ea',borderRadius:4,overflow:'hidden'}},
    renderChartSvg(el));
  }
  if(el.type==='table'){
   const rows=el.rows||[];
   const trs=rows.map((row,ri)=>h('tr',{key:ri},row.map((cell,ci)=>h('td',{key:ci,style:{border:'1px solid #e6e6ea',padding:'3px 6px',background:ri===0?(el.headerFill||'#f3f4f6'):'#fff',color:el.color||'#1f2430',fontSize:el.fontSize||14}},String(cell??'')))));
   return h('div',{style:{width:'100%',height:'100%',overflow:'auto',border:'1px solid #dedee3',background:'#fff'}},
    h('table',{style:{borderCollapse:'collapse',width:'100%',tableLayout:'fixed'}},
     h('tbody',null,trs)));
  }
  return null;
 }

 function Thumb({slide,index,active,onClick,ratio}){
  const w=88,hh=Math.max(20,Math.round(w*ratio));
  return h('button',{className:'pts-thumb'+(active?' on':''),style:{height:hh+8,width:'100%'},onClick,title:`第 ${index+1} 页`,'aria-label':`第 ${index+1} 页`},
   h('span',{className:'n'},index+1),
   (slide.elements||[]).map(el=>{
    const sx=w/1000,sy=(hh-8)/(1000*ratio);
    const bg=el.type==='image'?'#cfd3dc':el.type==='text'?'#b9bec9':'#e3e5ea';
    return h('span',{key:el.id,className:'box',style:{left:4+el.x*sx,top:4+el.y*sy,width:Math.max(2,el.w*sx),height:Math.max(2,el.h*sy),background:bg}});
   }));
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
   setShowTab(value);tabController?.set(value);
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
   h('p',{className:'pts-set-lead'},'在侧边栏制作和修改演示文稿。PPT 工具与技能只在「PPT 专用」预设中生效，不影响 Standard 及其他模式。'),
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

    h('p',{className:'pts-set-foot'},'技能只安装到插件私有目录，由「PPT 专用」预设单独加载；安装过程不执行远端脚本。')));
 }
 const presetCache=new Map();
  const presetChecks=new Set();
  function isPptSession(sessionId){
   if(!readTabPref()||typeof sessionId!=='string'||!sessionId)return false;
   if(presetCache.has(sessionId))return presetCache.get(sessionId);
   if(!presetChecks.has(sessionId)){
    presetChecks.add(sessionId);
    const url=new URL(endpoint,window.location.href);url.searchParams.set('action','mode');url.searchParams.set('sessionId',sessionId);
    fetch(url.href,{cache:'no-store',credentials:'same-origin'}).then(async response=>{
     if(response.status===403){presetCache.set(sessionId,false);return true;}
     if(!response.ok)return null;
     const result=await response.json();
     if(result.mode==='ppt-studio'){presetCache.set(sessionId,true);return true;}
     return false;
    }).catch(()=>false).then(changed=>{
     presetChecks.delete(sessionId);
     if(presetCache.size>256)presetCache.delete(presetCache.keys().next().value);
     if(changed)tabController?.refresh();
    });
   }
   return false;
  }
 function openDraftDb(){
  return new Promise(resolve=>{
   if(typeof indexedDB==='undefined')return resolve(null);
   try{
    const req=indexedDB.open('dsh-ppt-studio',1);
    req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains('drafts'))db.createObjectStore('drafts');};
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>resolve(null);
   }catch{resolve(null)}
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
  const [editing,setEditing]=useState('');
  const [tool,setTool]=useState('select');
  const [mark,setMark]=useState(null);
  const [requestText,setRequestText]=useState('');
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [busy,setBusy]=useState(false);
  const [dirty,setDirty]=useState(false);
  const [conflict,setConflict]=useState(null);
  const [width,setWidth]=useState(0);

  const token=useRef('');
  const baseRevision=useRef(1);
  const editSeq=useRef(0);
  const history=useRef([]);
  const stageRef=useRef(null);
  const canvasRef=useRef(null);
  const drag=useRef(null);
  const dirtyRef=useRef(false);
  const projectRef=useRef(null);
  const fileRef=useRef(null);
  const saveTimer=useRef(null);
  const savingPromise=useRef(null);

  useEffect(()=>{projectRef.current=project},[project]);
  useEffect(()=>{dirtyRef.current=dirty},[dirty]);

  const slide=project?project.slides[index]:null;
  const ratio=project?(project.viewport.height/project.viewport.width):(562.5/1000);
  const scale=width>0&&project?width/project.viewport.width:0.5;
  const draftKey=project?`${scope.sessionId}:${project.id}`:null;

  const fail=e=>{
   if(e?.code==='PRESET_REQUIRED'){
    projectRef.current=null;dirtyRef.current=false;token.current='';history.current=[];
    setProject(null);setBoot(null);setDirty(false);setSelected('');setEditing('');
   }
   setError(e&&e.message?e.message:String(e));
  };

  const pushHistory=useCallback(()=>{
   const p=projectRef.current;
   if(!p)return;
   const snapshot={
    body:{title:p.title,theme:p.theme,viewport:p.viewport,slides:JSON.parse(JSON.stringify(p.slides))},
    activeSlideId:p.slides[index]?.id,
    selectedId:selected,
   };
   history.current.push(snapshot);
   if(history.current.length>60)history.current.shift();
  },[index,selected]);

  const mutate=useCallback((fn)=>{
   pushHistory();
   editSeq.current+=1;
   setProject(prev=>{
    if(!prev)return prev;
    const next=JSON.parse(JSON.stringify(prev));
    fn(next);
    projectRef.current=next;
    if(draftKey)idbSetDraft(draftKey,{project:next,baseRevision:baseRevision.current,editSeq:editSeq.current}).catch(()=>{});
    return next;
   });
   setDirty(true);
  },[pushHistory,draftKey]);

  const undo=useCallback(()=>{
   const last=history.current.pop();
   if(!last||!last.body)return;
   editSeq.current+=1;
   setProject(prev=>{
    if(!prev)return prev;
    const next={...prev,...last.body};
    projectRef.current=next;
    if(last.activeSlideId){
     const targetIdx=next.slides.findIndex(s=>s.id===last.activeSlideId);
     if(targetIdx>=0)setIndex(targetIdx);
     else setIndex(Math.min(index,Math.max(0,next.slides.length-1)));
    }
    setSelected(last.selectedId||'');
    setEditing('');
    if(draftKey)idbSetDraft(draftKey,{project:next,baseRevision:baseRevision.current,editSeq:editSeq.current}).catch(()=>{});
    return next;
   });
   setDirty(true);
  },[index,draftKey]);

  const save=useCallback(async(force)=>{
   const p=projectRef.current;
   if(!p)return;
   if(!force&&!dirtyRef.current)return;
   const currentSeq=editSeq.current;
   const opId='op_'+Math.random().toString(36).slice(2,10);
   setBusy(true);setError('');

   const pSave=(async()=>{
    try{
     const v=await call('POST',{action:'save',project:p,baseRevision:baseRevision.current,operationId:opId},token.current,scope.sessionId);
     baseRevision.current=v.revision;
     if(editSeq.current===currentSeq){
      projectRef.current=v.project;
      setProject(v.project);
      setDirty(false);dirtyRef.current=false;setConflict(null);
      if(draftKey)idbDeleteDraft(draftKey).catch(()=>{});
      setNotice('已保存');
      setTimeout(()=>setNotice(''),1600);
     }else{
      setNotice('部分修改已保存，继续保存最新草稿…');
     }
     setBoot(b=>b?{...b,projects:v.projects}:b);
     return v.project;
    }catch(e){
     if(e.status===409){
      setConflict(e.message||'该演示文稿在服务器已被更新（AI 或其他面板）');
      setDirty(true);
     }else{
      fail(e);
     }
     throw e;
    }finally{
     setBusy(false);
     savingPromise.current=null;
    }
   })();

   savingPromise.current=pSave;
   return pSave;
  },[draftKey,setBoot]);

  const flushDraft=useCallback(async()=>{
   if(savingPromise.current)await savingPromise.current.catch(()=>{});
   if(dirtyRef.current)return await save(true);
   return projectRef.current;
  },[save]);

  const load=useCallback(async(id)=>{
   setError('');setBusy(true);
   try{
    const v=await call('GET',null,token.current,scope.sessionId);
    token.current=v.token;baseRevision.current=0;
    setBoot(v);
    const target=id||(v.projects[0]&&v.projects[0].id);
    if(!target){setProject(null);return;}
    const p=await fetchProject(target,scope.sessionId);

    // Check IndexedDB draft
    const localKey=`${scope.sessionId}:${p.id}`;
    const cached=await idbGetDraft(localKey);
    if(cached&&cached.project&&cached.baseRevision===p.revision&&cached.project.updatedAt!==p.updatedAt){
     setProject(cached.project);baseRevision.current=p.revision;projectRef.current=cached.project;
     setDirty(true);dirtyRef.current=true;
     setNotice('已恢复未保存的本地草稿');
    }else{
     setProject(p);baseRevision.current=p.revision;projectRef.current=p;
     setDirty(false);dirtyRef.current=false;
    }
    setIndex(0);setSelected('');setEditing('');history.current=[];setConflict(null);
   }catch(e){fail(e)}finally{setBusy(false)}
  },[scope.sessionId]);

  async function fetchProject(id,sessionId=scope.sessionId){
   const r=await fetch(`${endpoint}?action=project&id=${encodeURIComponent(id)}&sessionId=${encodeURIComponent(sessionId)}`,{cache:'no-store',credentials:'same-origin'});
   const v=await r.json();
   if(!r.ok){const e=new Error(v.error||'无法读取项目');e.status=r.status;e.code=v.code;throw e;}
   return v.project;
  }

  useEffect(()=>{load().catch(fail)},[load]);
  useEffect(()=>{if(visible&&!dirtyRef.current)load().catch(()=>{});},[visible,load]);

  // Remote revision sync (every 2s while visible)
  useEffect(()=>{
   if(!visible||!project||conflict)return;
   const timer=setInterval(async()=>{
    try{
     const r=await fetch(`${endpoint}?action=revision&id=${encodeURIComponent(project.id)}&sessionId=${encodeURIComponent(scope.sessionId)}`,{cache:'no-store',credentials:'same-origin'});
     if(!r.ok)return;
     const revData=await r.json();
     if(revData.revision>baseRevision.current){
      if(!dirtyRef.current&&!savingPromise.current){
       const updated=await fetchProject(project.id,scope.sessionId);
       baseRevision.current=updated.revision;projectRef.current=updated;
       setProject(updated);setNotice('已同步 AI 远端修改');
       setTimeout(()=>setNotice(''),1600);
      }else if(dirtyRef.current){
       setConflict('该演示文稿在服务器已被更新，当前本地有未保存草稿');
      }
     }
    }catch{}
   },2000);
   return()=>clearInterval(timer);
  },[visible,project?.id,conflict,scope.sessionId]);

  useEffect(()=>{
   if(!stageRef.current||!project)return;
   const node=stageRef.current;
   const ro=new ResizeObserver(()=>{const w=node.clientWidth-20;setWidth(Math.max(240,Math.min(1000,w)))});
   ro.observe(node);setWidth(Math.max(240,Math.min(1000,node.clientWidth-20)));
   return()=>ro.disconnect();
  },[project!==null]);

  useEffect(()=>{
   if(!dirty||conflict)return;
   clearTimeout(saveTimer.current);
   saveTimer.current=setTimeout(()=>{save().catch(()=>{})},900);
   return()=>clearTimeout(saveTimer.current);
  },[dirty,project,conflict,save]);

  const create=async()=>{
   setBusy(true);setError('');
   try{
    const title=window.prompt('新演示文稿标题','未命名演示文稿');
    if(title===null){setBusy(false);return;}
    const v=await call('POST',{action:'create',title},token.current,scope.sessionId);
    baseRevision.current=v.project.revision;projectRef.current=v.project;
    setProject(v.project);setBoot(b=>({...b,projects:v.projects}));setIndex(0);setSelected('');setDirty(false);history.current=[];
   }catch(e){fail(e)}finally{setBusy(false)}
  };

  const saveCopy=async()=>{
   if(!project)return;
   setBusy(true);setError('');
   try{
    const v=await call('POST',{action:'create',title:`${project.title}（草稿副本）`,template:project},token.current,scope.sessionId);
    if(draftKey)await idbDeleteDraft(draftKey).catch(()=>{});
    baseRevision.current=v.project.revision;projectRef.current=v.project;
    setProject(v.project);setBoot(b=>({...b,projects:v.projects}));setIndex(0);setSelected('');setDirty(false);history.current=[];setConflict(null);
    setNotice('已另存为新项目副本');
   }catch(e){fail(e)}finally{setBusy(false)}
  };

  const openProject=async(id)=>{
   if(dirtyRef.current&&!window.confirm('当前修改尚未保存，切换会丢失。继续？'))return;
   setBusy(true);setError('');
   try{
    const p=await fetchProject(id);
    baseRevision.current=p.revision;projectRef.current=p;
    setProject(p);setIndex(0);setSelected('');setEditing('');setDirty(false);history.current=[];setConflict(null);
   }catch(e){fail(e)}finally{setBusy(false)}
  };

  const doExport=async()=>{
   if(!project)return;
   await flushDraft();
   setBusy(true);setError('');setNotice('');
   try{
    const v=await call('POST',{action:'export',id:projectRef.current.id,baseRevision:baseRevision.current},token.current,scope.sessionId);
    setNotice(`已导出：${v.path}${v.warnings&&v.warnings.length?`\n注意：${v.warnings.join('；')}`:''}`);
   }catch(e){fail(e)}finally{setBusy(false)}
  };

  const addElement=(el)=>{
   if(!slide)return;
   mutate(p=>{p.slides[index].elements.push(el)});
   setSelected(el.id);
  };

  const addText=()=>addElement({id:uid('e'),type:'text',x:120,y:200,w:560,h:80,rotate:0,text:'点击右侧输入文字',fontSize:32,color:'#1f2430',bold:false,align:'left'});
  const addShape=()=>addElement({id:uid('e'),type:'shape',shape:'roundRect',x:300,y:180,w:360,h:180,rotate:0,fill:'#f3f4f6',stroke:'#d8d8de',strokeWidth:1,radius:16});
  const addChart=()=>addElement({id:uid('e'),type:'chart',chartType:'column',x:160,y:150,w:640,h:300,rotate:0,fill:'#ffffff',data:{labels:['Q1','Q2','Q3'],series:[{name:'收入',values:[12,18,26]}]}});
  const addTable=()=>addElement({id:uid('e'),type:'table',x:150,y:160,w:660,h:220,rotate:0,rows:[['项目','数值'],['A','1'],['B','2']],fontSize:16,color:'#1f2430',headerFill:'#f3f4f6'});

  const onPickImage=async(event)=>{
   const file=event.target.files&&event.target.files[0];
   event.target.value='';
   if(!file)return;
   if(file.size>3*1024*1024){setError('图片需小于 3 MB');return;}
   const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file)});
   addElement({id:uid('e'),type:'image',src:data,fit:'cover',x:200,y:140,w:600,h:340,rotate:0});
  };

  const current=useMemo(()=>{
   if(!slide||!selected)return null;
   return slide.elements.find(e=>e.id===selected)||null;
  },[slide,selected]);

  const patchCurrent=(props)=>{
   if(!current)return;
   mutate(p=>{
    const target=p.slides[index].elements.find(e=>e.id===current.id);
    if(target)Object.assign(target,props);
   });
  };

  const canvasPoint=(event)=>{
   const rect=canvasRef.current.getBoundingClientRect();
   return {x:(event.clientX-rect.left)/scale,y:(event.clientY-rect.top)/scale};
  };

  const onPointerDown=(event)=>{
   if(!canvasRef.current||!slide)return;
   const point=canvasPoint(event);
   if(tool==='mark'){
    drag.current={kind:'mark',start:point};
    setMark({x:point.x,y:point.y,w:0,h:0});
    canvasRef.current.setPointerCapture(event.pointerId);
    event.preventDefault();
    return;
   }
   const hit=event.target.closest&&event.target.closest('[data-el]');
   const id=hit&&hit.getAttribute('data-el');
   if(!id){setSelected('');setEditing('');return;}
   setSelected(id);setEditing('');
   const el=slide.elements.find(e=>e.id===id);
   if(!el)return;
   drag.current={kind:'move',id,start:point,origin:{x:el.x,y:el.y},movedAny:false,hadPushedHistory:false};
   canvasRef.current.setPointerCapture(event.pointerId);
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
    const dx=point.x-d.start.x,dy=point.y-d.start.y;
    if(Math.abs(dx)>1||Math.abs(dy)>1){
     if(!d.hadPushedHistory){
      pushHistory();
      d.hadPushedHistory=true;
     }
     d.movedAny=true;
    }
    setProject(prev=>{
     if(!prev)return prev;
     const next=JSON.parse(JSON.stringify(prev));
     const el=next.slides[index].elements.find(e=>e.id===d.id);
     if(el){el.x=Math.round(d.origin.x+dx);el.y=Math.round(d.origin.y+dy);}
     projectRef.current=next;
     return next;
    });
    if(d.movedAny)setDirty(true);
   }
  };

  const onPointerUp=(event)=>{
   const d=drag.current;
   drag.current=null;
   if(!d)return;
   if(d.kind==='mark'&&mark&&mark.w>8&&mark.h>8){
    setRequestText('');
    return;
   }
   if(d.kind==='mark')setMark(null);
   if(d.kind==='move'&&d.movedAny){
    setDirty(true);
    editSeq.current+=1;
    if(draftKey)idbSetDraft(draftKey,{project:projectRef.current,baseRevision:baseRevision.current,editSeq:editSeq.current}).catch(()=>{});
   }
  };

  useEffect(()=>{
   const onKey=(event)=>{
    const active=document.activeElement;
    if(active&&/^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName))return;
    if(!visible)return;
    if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();undo();}
    else if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){event.preventDefault();save(true);}
    else if((event.key==='Delete'||event.key==='Backspace')&&selected){
     event.preventDefault();
     mutate(p=>{const s=p.slides[index];s.elements=s.elements.filter(e=>e.id!==selected)});
     setSelected('');
    }
   };
   document.addEventListener('keydown',onKey);
   return()=>document.removeEventListener('keydown',onKey);
  },[visible,selected,index,mutate,undo,save]);

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

  if(!boot)return h('div',{className:'pts'},h('style',null,css),h('div',{className:'pts-empty'},error||'正在连接 PPT Studio…'));

  if(!project){
   return h('div',{className:'pts'},h('style',null,css),
    h('div',{className:'pts-bar'},
     h('button',{className:'primary',disabled:busy,onClick:create},'新建演示文稿'),
     h('button',{disabled:busy,onClick:()=>load()},'刷新')),
    h('div',{className:'pts-empty'},
     h('div',null,'还没有打开演示文稿。'),
     error&&h('div',{className:'pts-error',role:'alert'},error)),
    boot.projects&&boot.projects.length>0&&h('div',{className:'pts-empty'},
     h('div',null,'已有项目：'),
     boot.projects.map(p=>h('div',{key:p.id},h('button',{style:{marginTop:6},onClick:()=>openProject(p.id)},`${p.title} · ${p.slides} 页`)))));
  }

  const showCanvas=width>0;
  return h('div',{className:'pts'},h('style',null,css),
   h('div',{className:'pts-bar'},
    h(Icon,{size:14}),
    h('select',{value:project.id,'aria-label':'选择演示文稿',onChange:e=>openProject(e.target.value)},
     (boot.projects||[]).map(p=>h('option',{key:p.id,value:p.id},`${p.title} · r${p.revision}`))),
    h('button',{disabled:busy,onClick:create},'新建'),
    h('button',{onClick:()=>addText()},'文字'),
    h('button',{onClick:()=>addShape()},'形状'),
    h('button',{onClick:()=>addChart()},'图表'),
    h('button',{onClick:()=>addTable()},'表格'),
    h('button',{onClick:()=>fileRef.current&&fileRef.current.click()},'图片'),
    h('input',{ref:fileRef,type:'file',accept:'image/*',style:{display:'none'},onChange:onPickImage}),
    h('span',{className:'pts-spacer'}),
    h('button',{className:tool==='mark'?'on':'',title:'在画布上框选区域，交给 AI 修改',onClick:()=>{setTool(tool==='mark'?'select':'mark');setMark(null)}},'圈选修改'),
    h('button',{disabled:busy||!dirty,onClick:()=>save(true)},busy?'保存中…':(dirty?'保存':'已保存')),
    h('button',{disabled:busy,onClick:doExport},'导出 PPTX')),
   conflict&&h('div',{className:'pts-bar',style:{background:'rgba(226,75,43,.10)'}},
    h('span',{className:'pts-error'},conflict),
    h('button',{onClick:async()=>{if(window.confirm('重新载入将放弃本地未保存草稿，是否继续？')){if(draftKey)await idbDeleteDraft(draftKey);await load(project.id);}}},'重新载入'),
    h('button',{onClick:saveCopy},'另存草稿副本')),
   h('div',{className:'pts-body'},
    h('div',{className:'pts-thumbs'},
     project.slides.map((s,i)=>h(Thumb,{key:s.id,slide:s,index:i,active:i===index,ratio,onClick:()=>{setIndex(i);setSelected('');setEditing('')}})),
     h('button',{onClick:()=>{mutate(p=>{p.slides.splice(index+1,0,blankSlide())});setIndex(index+1);setSelected('')}},'+ 页'),
     project.slides.length>1&&h('button',{onClick:()=>{mutate(p=>{p.slides.splice(index,1)});setIndex(Math.max(0,index-1));setSelected('')}},'删页')),
    h('div',{className:'pts-main'},
     h('div',{className:'pts-stage',ref:stageRef},
      showCanvas&&h('div',{className:'pts-canvas',ref:canvasRef,style:{width:project.viewport.width*scale,height:project.viewport.height*scale,background:slide.background||project.theme.backgroundColor},
       onPointerDown,onPointerMove,onPointerUp,onPointerCancel:onPointerUp},
       h('div',{style:{position:'absolute',left:0,top:0,width:project.viewport.width,height:project.viewport.height,transform:`scale(${scale})`,transformOrigin:'0 0'}},
        slide.elements.map(el=>h('div',{key:el.id,'data-el':el.id,className:'pts-el'+(selected===el.id?' sel':''),style:{position:'absolute',left:el.x,top:el.y,width:el.w,height:el.h,transform:el.rotate?`rotate(${el.rotate}deg)`:undefined}},
         h(ElementView,{el,scale}))),
        editing&&(()=>{const el=slide.elements.find(e=>e.id===editing);if(!el||el.type!=='text')return null;return h('textarea',{className:'pts-edit',autoFocus:true,style:{left:el.x,top:el.y,width:el.w,height:el.h,fontSize:el.fontSize,color:el.color,fontWeight:el.bold?700:400,textAlign:el.align},defaultValue:el.text,onBlur:e=>{const value=e.target.value;mutate(p=>{const t=p.slides[index].elements.find(x=>x.id===el.id);if(t)t.text=value});setEditing('')},onKeyDown:e=>{if(e.key==='Escape'){e.currentTarget.blur()}}})})(),
        mark&&h('div',{className:'pts-mark',style:{left:mark.x,top:mark.y,width:mark.w,height:mark.h}}))),
     ),
     h('div',{className:'pts-side'},
      h('div',{className:'pts-field'},h('label',null,'标题'),h('input',{value:project.title,onChange:e=>mutate(p=>{p.title=e.target.value})})),
      h('div',{className:'pts-field'},h('label',null,'本页备注'),h('textarea',{style:{minHeight:52},value:slide.note||'',onChange:e=>mutate(p=>{p.slides[index].note=e.target.value})})),
      current?h('div',{style:{display:'flex',flexDirection:'column',gap:8}},
       h('div',{className:'pts-note'},`已选中：${current.type}`),
       h('div',{className:'pts-row'},
        h('div',{className:'pts-field'},h('label',null,'X'),h('input',{type:'number',value:Math.round(current.x),onChange:e=>patchCurrent({x:Number(e.target.value)||0})})),
        h('div',{className:'pts-field'},h('label',null,'Y'),h('input',{type:'number',value:Math.round(current.y),onChange:e=>patchCurrent({y:Number(e.target.value)||0})})),
        h('div',{className:'pts-field'},h('label',null,'宽'),h('input',{type:'number',value:Math.round(current.w),onChange:e=>patchCurrent({w:Math.max(1,Number(e.target.value)||1)})})),
        h('div',{className:'pts-field'},h('label',null,'高'),h('input',{type:'number',value:Math.round(current.h),onChange:e=>patchCurrent({h:Math.max(1,Number(e.target.value)||1)})}))),
       current.type==='text'&&h('div',{style:{display:'flex',flexDirection:'column',gap:8}},
        current.type==='text'&&h('button',{onClick:()=>setEditing(current.id)},'在画布上改文字'),
        h('div',{className:'pts-field'},h('label',null,'文字'),h('textarea',{value:current.text||'',onChange:e=>patchCurrent({text:e.target.value})})),
        h('div',{className:'pts-row'},
         h('div',{className:'pts-field'},h('label',null,'字号'),h('input',{type:'number',value:Math.round(current.fontSize||24),onChange:e=>patchCurrent({fontSize:Number(e.target.value)||24})})),
         h('div',{className:'pts-field'},h('label',null,'颜色'),h('input',{type:'color',value:current.color||'#1f2430',onChange:e=>patchCurrent({color:e.target.value})}))),
        h('div',{className:'pts-row'},
         h('div',{className:'pts-field'},h('label',null,'对齐'),h('select',{value:current.align||'left',onChange:e=>patchCurrent({align:e.target.value})},['left','center','right'].map(v=>h('option',{key:v,value:v},v)))),
         h('div',{className:'pts-field'},h('label',null,'加粗'),h('select',{value:String(current.bold===true),onChange:e=>patchCurrent({bold:e.target.value==='true'})},h('option',{value:'false'},'否'),h('option',{value:'true'},'是'))))),
       current.type==='shape'&&h('div',{style:{display:'flex',flexDirection:'column',gap:8}},
        h('div',{className:'pts-row'},
         h('div',{className:'pts-field'},h('label',null,'填充'),h('input',{type:'color',value:current.fill||'#f3f4f6',onChange:e=>patchCurrent({fill:e.target.value})})),
         h('div',{className:'pts-field'},h('label',null,'描边'),h('input',{type:'color',value:current.stroke||'#1f2430',onChange:e=>patchCurrent({stroke:e.target.value})}))),
        h('div',{className:'pts-row'},
         h('div',{className:'pts-field'},h('label',null,'圆角'),h('input',{type:'number',value:Math.round(current.radius||0),onChange:e=>patchCurrent({radius:Number(e.target.value)||0})})),
         h('div',{className:'pts-field'},h('label',null,'描边粗细'),h('input',{type:'number',value:Math.round(current.strokeWidth||0),onChange:e=>patchCurrent({strokeWidth:Math.max(0,Number(e.target.value)||0)})})))),
       current.type==='chart'&&h('div',{style:{display:'flex',flexDirection:'column',gap:8}},
        h('div',{className:'pts-field'},h('label',null,'图表类型'),h('select',{value:current.chartType,onChange:e=>patchCurrent({chartType:e.target.value})},['column','bar','line','area','pie','doughnut','radar','scatter'].map(v=>h('option',{key:v,value:v},v)))),
        h('div',{className:'pts-field'},h('label',null,'分类（逗号分隔）'),h('input',{value:(current.data&&current.data.labels||[]).join(','),onChange:e=>patchCurrent({data:{...current.data,labels:e.target.value.split(',').map(s=>s.trim()).filter(Boolean)}})})),
        h('div',{className:'pts-field'},h('label',null,'系列（每行：名称:值1,值2）'),h('textarea',{value:(current.data&&current.data.series||[]).map(s=>`${s.name}:${s.values.join(',')}`).join('\n'),onChange:e=>patchCurrent({data:{...current.data,series:e.target.value.split('\n').filter(l=>l.includes(':')).map(line=>{const i=line.indexOf(':');return {name:line.slice(0,i).trim(),values:line.slice(i+1).split(',').map(Number).filter(n=>!Number.isNaN(n))}}).filter(s=>s.values.length)}})}))),
       current.type==='table'&&h('div',{style:{display:'flex',flexDirection:'column',gap:8}},
        h('div',{className:'pts-field'},h('label',null,'表格（每行一行，单元格用 Tab 或逗号分隔）'),h('textarea',{value:(current.rows||[]).map(r=>r.join('\t')).join('\n'),onChange:e=>patchCurrent({rows:e.target.value.split('\n').map(line=>line.split(/\t|,/).map(c=>c.trim()))})}))),
       current.type==='image'&&h('div',{className:'pts-note'},'图片将以原图嵌入，导出时保持指定比例。'),
       h('div',{className:'pts-row'},
        h('button',{onClick:()=>mutate(p=>{const s=p.slides[index];const i=s.elements.findIndex(e=>e.id===current.id);if(i>=0){const [c]=s.elements.splice(i,1);s.elements.push(c)}})},'置顶'),
        h('button',{onClick:()=>{mutate(p=>{const s=p.slides[index];s.elements=s.elements.filter(e=>e.id!==current.id)});setSelected('')}},'删除'))):h('div',{className:'pts-note'},'在画布上点选元素即可编辑；也可以框选一块区域交给 AI。'),
      h('div',{className:'pts-field'},h('label',null,'画布比例'),h('select',{value:String(ratio),onChange:e=>mutate(p=>{p.viewport.height=p.viewport.width*Number(e.target.value)})},h('option',{value:'0.5625'},'16:9'),h('option',{value:'0.75'},'4:3'),h('option',{value:'1.4142'},'A4 竖版'))),
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
