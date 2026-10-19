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
 `;

 function Icon({size=14}){
  return h('svg',{className:'pts-ico',width:size,height:size,viewBox:'0 0 24 24','aria-hidden':true},
   h('rect',{x:2.5,y:4.5,width:19,height:12.5,rx:2,fill:'none',stroke:'currentColor',strokeWidth:1.6}),
   h('path',{d:'M7 21h10',stroke:'currentColor',strokeWidth:1.6,strokeLinecap:'round'}));
 }

 const endpoint=(()=>{try{return new URL('api/dsh-ppt-studio',window.location.href).href}catch{return '/api/dsh-ppt-studio'}})();

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

 function elBox(el){
  const base={position:'absolute',left:el.x,top:el.y,width:el.w,height:el.h};
  if(el.rotate)base.transform=`rotate(${el.rotate}deg)`;
  return base;
 }

 function ElementView({el,scale}){
  const style={...elBox(el)};
  if(el.type==='text'){
   return h('div',{className:'pts-el pts-el-text',style:{...style,fontSize:el.fontSize,color:el.color,fontWeight:el.bold?700:400,textAlign:el.align,lineHeight:el.lineHeight||1.25,background:el.fill||'transparent',padding:0}},
    el.text||'');
  }
  if(el.type==='shape'){
   const radius=el.shape==='ellipse'?'50%':el.shape==='roundRect'?`${el.radius||10}px`:'0';
   return h('div',{className:'pts-el',style:{...style,background:el.shape==='line'?'transparent':(el.fill||'#f3f4f6'),borderRadius:radius,border:el.strokeWidth>0?`${el.strokeWidth}px solid ${el.stroke||'#1f2430'}`:'none'}},
    el.text?h('div',{style:{width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:el.align==='left'?'flex-start':el.align==='right'?'flex-end':'center',color:el.color||'#1f2430',fontSize:el.fontSize||20,overflow:'hidden',whiteSpace:'pre-wrap'}},el.text):null);
  }
  if(el.type==='image')return h('img',{className:'pts-el',src:el.src,alt:'',style:{...style,objectFit:el.fit||'cover'}});
  if(el.type==='chart'){
   return h('div',{className:'pts-el',style:{...style,background:el.fill||'#fff',border:'1px solid #e6e6ea',borderRadius:4,display:'flex',flexDirection:'column',justifyContent:'center',alignItems:'center',gap:4,color:'#77777f',fontSize:11}},
    h('strong',{style:{fontSize:12,color:'#202024'}},el.chartType),
    h('span',null,`${(el.data&&el.data.labels||[]).length} 个分类 · ${(el.data&&el.data.series||[]).length} 个系列`),
    h('span',{style:{fontSize:10}}, '导出后为可编辑图表'));
  }
  if(el.type==='table'){
   const rows=(el.rows||[]).slice(0,6);
   const cellStyle=(ri)=>({border:'1px solid #e6e6ea',padding:'2px 4px',background:ri===0?(el.headerFill||'#f3f4f6'):'#fff',whiteSpace:'nowrap',overflow:'hidden',maxWidth:120,color:el.color||'#1f2430'});
   const trs=rows.map((row,ri)=>h('tr',{key:ri},row.map((cell,ci)=>h('td',{key:ci,style:cellStyle(ri)},cell))));
   return h('div',{className:'pts-el',style:{...style,overflow:'hidden',border:'1px solid #dedee3',background:'#fff'}},
    h('table',{style:{borderCollapse:'collapse',width:'100%',fontSize:Math.max(8,(el.fontSize||16)*0.5)}},
     h('tbody',null,trs)));
  }
  return null;
 }

 function Thumb({slide,index,active,onClick,ratio}){
  const w=88,hh=Math.max(20,Math.round(w*ratio));
  return h('button',{className:'pts-thumb'+(active?' on':''),style:{height:hh+8,width:'100%'},onClick,title:`第 ${index+1} 页`,'aria-label':`第 ${index+1} 页`},
   h('span',{className:'n'},index+1),
   (slide.elements||[]).slice(0,14).map(el=>{
    const sx=w/(slide.viewportWidth||1000),sy=(hh-8)/562.5;
    if(el.type==='image')return h('span',{key:el.id,className:'box',style:{left:4+el.x*sx*(1000/1000),top:4+el.y*sy,width:Math.max(2,el.w*sx),height:Math.max(2,el.h*sy),background:'#cfd3dc'}});
    return h('span',{key:el.id,className:'box',style:{left:4+el.x*sx,top:4+el.y*sy,width:Math.max(2,el.w*sx),height:Math.max(2,el.h*sy),background:el.type==='text'?'#b9bec9':'#e3e5ea'}});
   }));
 }

 const TAB_PREF='dsh-ppt-studio:showWorkbench';
 const readTabPref=()=>{try{return window.localStorage.getItem(TAB_PREF)!=='false'}catch{return true}};
 let tabController=null;
 let clientContext=null;
 function SettingsPanel({close}={}){
  const [showTab,setShowTab]=useState(readTabPref);
  const [startError,setStartError]=useState('');
  const onToggle=event=>{
   const value=event.target.checked;
   try{window.localStorage.setItem(TAB_PREF,String(value))}catch{}
   setShowTab(value);tabController?.set(value);
  };
  const startPptSession=()=>{
   try{
    const workspace=clientContext?.get?.('uiWorkspace');
    if(!workspace?.startSession)throw new Error('当前 DSH profile 未提供新建会话入口');
    workspace.startSession(undefined,{agentPreset:'ppt-studio'});
    close?.();
   }catch(error){setStartError(error?.message||String(error))}
  };
  return h('div',{style:{maxWidth:680,padding:'24px 28px',color:'var(--dsw-alias-label-primary)',fontSize:13,lineHeight:1.7}},
   h('h2',{style:{fontSize:20,fontWeight:550,margin:'0 0 8px'}},'PPT 专用模式'),
   h('p',{style:{margin:'0 0 16px',color:'var(--dsw-alias-label-secondary)'}},'PPT 工具与技能已放入独立 Agent 预设。Standard 和其他预设不会收到 PPT Agent 工具或专属技能。'),
   h('button',{className:'primary',onClick:startPptSession},'新建 PPT 专用会话'),
   startError&&h('p',{role:'alert',style:{color:'var(--dsw-alias-state-error-primary)',fontSize:12}},startError),
   h('label',{style:{display:'flex',alignItems:'center',gap:9,padding:'12px 0',borderTop:'1px solid var(--dsw-alias-border-main)',marginTop:14}},h('input',{type:'checkbox',checked:showTab,onChange:onToggle}),h('span',null,'显示侧边栏「PPT 工作台」入口')),
   h('p',{style:{margin:'12px 0 0',color:'var(--dsw-alias-label-secondary)',fontSize:12}},'工作台 API 会验证当前会话的 Agent 预设；非 PPT 会话不能读取、保存或导出 PPT 项目。技能可在 PPT 专用会话中用 ppt_skills 按需安装。'));
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
  const history=useRef([]);
  const stageRef=useRef(null);
  const canvasRef=useRef(null);
  const drag=useRef(null);
  const dirtyRef=useRef(false);
  const projectRef=useRef(null);
  const fileRef=useRef(null);
  const saveTimer=useRef(null);

  useEffect(()=>{projectRef.current=project},[project]);
  useEffect(()=>{dirtyRef.current=dirty},[dirty]);

  const slide=project?project.slides[index]:null;
  const ratio=project?(project.viewport.height/project.viewport.width):(562.5/1000);
  const scale=width>0&&project?width/project.viewport.width:0.5;

  const fail=e=>{
   if(e?.code==='PRESET_REQUIRED'){
    projectRef.current=null;dirtyRef.current=false;token.current='';history.current=[];
    setProject(null);setBoot(null);setDirty(false);setSelected('');setEditing('');
   }
   setError(e&&e.message?e.message:String(e));
  };

  const load=useCallback(async(id)=>{
   setError('');setBusy(true);
   try{
    const v=await call('GET',null,token.current,scope.sessionId);
    token.current=v.token;baseRevision.current=0;
    setBoot(v);
    const target=id||(v.projects[0]&&v.projects[0].id);
    if(!target){setProject(null);return;}
    const p=await fetchProject(target,scope.sessionId);
    setProject(p);baseRevision.current=p.revision;projectRef.current=p;
    setIndex(0);setSelected('');setEditing('');history.current=[];setDirty(false);
   }catch(e){fail(e)}finally{setBusy(false)}
  },[]);

  async function fetchProject(id,sessionId=scope.sessionId){
   const r=await fetch(`${endpoint}?action=project&id=${encodeURIComponent(id)}&sessionId=${encodeURIComponent(sessionId)}`,{cache:'no-store',credentials:'same-origin'});
   const v=await r.json();
   if(!r.ok){const e=new Error(v.error||'无法读取项目');e.status=r.status;e.code=v.code;throw e;}
   return v.project;
  }

  useEffect(()=>{load().catch(fail)},[load]);
  useEffect(()=>{if(visible)load().catch(()=>{});},[visible,load]);

  useEffect(()=>{
   if(!stageRef.current||!project)return;
   const node=stageRef.current;
   const ro=new ResizeObserver(()=>{const w=node.clientWidth-20;setWidth(Math.max(240,Math.min(1000,w)))});
   ro.observe(node);setWidth(Math.max(240,Math.min(1000,node.clientWidth-20)));
   return()=>ro.disconnect();
  },[project!==null]);

  const pushHistory=useCallback(()=>{
   if(!projectRef.current)return;
   history.current.push(JSON.stringify(projectRef.current));
   if(history.current.length>60)history.current.shift();
  },[]);

  const mutate=useCallback((fn)=>{
   pushHistory();
   setProject(prev=>{
    if(!prev)return prev;
    const next=JSON.parse(JSON.stringify(prev));
    fn(next);
    projectRef.current=next;
    return next;
   });
   setDirty(true);
  },[pushHistory]);

  const undo=useCallback(()=>{
   const last=history.current.pop();
   if(!last)return;
   const prev=JSON.parse(last);
   projectRef.current=prev;setProject(prev);setDirty(true);setEditing('');setSelected('');
  },[]);

  const save=useCallback(async(force)=>{
   const p=projectRef.current;
   if(!p)return;
   if(!force&&!dirtyRef.current)return;
   setBusy(true);setError('');
   try{
    const v=await call('POST',{action:'save',project:p,baseRevision:baseRevision.current},token.current,scope.sessionId);
    baseRevision.current=v.project.revision;
    projectRef.current=v.project;
    setProject(v.project);setDirty(false);dirtyRef.current=false;setConflict(null);
    setBoot(b=>b?{...b,projects:v.projects}:b);
    setNotice('已保存');
    setTimeout(()=>setNotice(''),1600);
   }catch(e){
    if(e.status===409){setConflict(e.message||'该项目已被更新');setDirty(true);}
    else fail(e);
   }finally{setBusy(false)}
  },[setBoot]);

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
   if(dirtyRef.current)await save(true);
   setBusy(true);setError('');setNotice('');
   try{
    const v=await call('POST',{action:'export',id:projectRef.current.id},token.current,scope.sessionId);
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

  // Pointer handling: move elements and drag a mark rectangle for AI requests.
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
   drag.current={kind:'move',id,start:point,origin:{x:el.x,y:el.y},moved:false,movedAny:false};
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
    if(Math.abs(dx)>1||Math.abs(dy)>1)d.movedAny=true;
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
   if(d.kind==='move'&&d.movedAny){setDirty(true);}
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

  const submitRequest=async()=>{
   if(!project)return;
   const text=requestText.trim();
   if(!text){setError('请先写明要改什么');return;}
   if(dirtyRef.current)await save(true);
   setBusy(true);setError('');
   try{
    const area=mark?{x:Math.round(mark.x),y:Math.round(mark.y),w:Math.round(mark.w),h:Math.round(mark.h)}:null;
    const elementIds=area?slide.elements.filter(el=>{
     const overlaps=!(el.x+el.w<area.x||area.x+area.w<el.x||el.y+el.h<area.y||area.y+area.h<el.y);
     return overlaps;
    }).map(el=>el.id):(selected?[selected]:[]);
    const v=await call('POST',{action:'request',id:project.id,slideId:slide.id,elementIds,area,instruction:text},token.current,scope.sessionId);
    baseRevision.current=v.project.revision;projectRef.current=v.project;setProject(v.project);
    setMark(null);setTool('select');setRequestText('');
    setNotice('修改请求已记录。回到对话里让 AI 处理这条请求。');
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
   conflict&&h('div',{className:'pts-bar'},
    h('span',{className:'pts-error'},'该演示文稿已被更新（可能是 AI 或其他面板）。'),
    h('button',{onClick:async()=>{await load(project.id);}}, '重新载入'),
    h('button',{onClick:()=>save(true)},'强制保存当前内容')),
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
        slide.elements.map(el=>h('div',{key:el.id,'data-el':el.id,className:'pts-el'+(selected===el.id?' sel':''),style:{position:'absolute',left:el.x,top:el.y,width:el.w,height:el.h}},
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
        h('div',{className:'pts-field'},h('label',null,'圆角'),h('input',{type:'number',value:Math.round(current.radius||0),onChange:e=>patchCurrent({radius:Number(e.target.value)||0})}))),
       current.type==='chart'&&h('div',{style:{display:'flex',flexDirection:'column',gap:8}},
        h('div',{className:'pts-field'},h('label',null,'图表类型'),h('select',{value:current.chartType,onChange:e=>patchCurrent({chartType:e.target.value})},['column','bar','line','area','pie','doughnut','radar','scatter'].map(v=>h('option',{key:v,value:v},v)))),
        h('div',{className:'pts-field'},h('label',null,'分类（逗号分隔）'),h('input',{value:(current.data&&current.data.labels||[]).join(','),onChange:e=>patchCurrent({data:{...current.data,labels:e.target.value.split(',').map(s=>s.trim()).filter(Boolean)}})})),
        h('div',{className:'pts-field'},h('label',null,'系列（每行：名称:值1,值2）'),h('textarea',{value:(current.data&&current.data.series||[]).map(s=>`${s.name}:${s.values.join(',')}`).join('\n'),onChange:e=>patchCurrent({data:{...current.data,series:e.target.value.split('\n').filter(l=>l.includes(':')).map(line=>{const i=line.indexOf(':');return {name:line.slice(0,i).trim(),values:line.slice(i+1).split(',').map(Number).filter(n=>!Number.isNaN(n))}}).filter(s=>s.values.length)}})}))),
       current.type==='table'&&h('div',{style:{display:'flex',flexDirection:'column',gap:8}},
        h('div',{className:'pts-field'},h('label',null,'表格（每行一行，单元格用 Tab 或逗号分隔）'),h('textarea',{value:(current.rows||[]).map(r=>r.join('\t')).join('\n'),onChange:e=>patchCurrent({rows:e.target.value.split('\n').map(line=>line.split(/\t|,/).map(c=>c.trim()))})}))),
       current.type==='image'&&h('div',{className:'pts-note'},'图片将以原图嵌入，导出时保留为图片对象。'),
       h('div',{className:'pts-row'},
        h('button',{onClick:()=>mutate(p=>{const s=p.slides[index];const i=s.elements.findIndex(e=>e.id===current.id);if(i>=0){const [c]=s.elements.splice(i,1);s.elements.push(c)}})},'置顶'),
        h('button',{onClick:()=>{mutate(p=>{const s=p.slides[index];s.elements=s.elements.filter(e=>e.id!==current.id)});setSelected('')}},'删除'))):h('div',{className:'pts-note'},'在画布上点选元素即可编辑；也可以框选一块区域交给 AI。'),
      h('div',{className:'pts-field'},h('label',null,'画布比例'),h('select',{value:String(ratio),onChange:e=>mutate(p=>{p.viewport.height=p.viewport.width*Number(e.target.value)})},h('option',{value:'0.5625'},'16:9'),h('option',{value:'0.75'},'4:3'),h('option',{value:'1.4142'},'A4 竖版'))),
      h('div',{className:'pts-note'},`版本 r${project.revision} · ${project.slides.length} 页`),
      openRequests.length>0&&h('div',{className:'pts-field'},h('label',null,`待处理的修改请求（${openRequests.length}）`),h('div',{className:'pts-note'},openRequests.map(r=>h('div',{key:r.id},`· ${r.instruction}`)))),
      error&&h('div',{className:'pts-error',role:'alert'},error),
      notice&&h('div',{className:'pts-ok',role:'status'},notice)),
     ),
    ),
   h('div',{className:'pts-markbar'},
    h('span',{className:'pts-note'},tool==='mark'?'在画布上拖出要修改的区域，再写清楚要求：':'开启「圈选修改」后可框选区域交给 AI。'),
    tool==='mark'&&h('input',{value:requestText,placeholder:'例如：这一块字号太小，改成两栏布局',onChange:e=>setRequestText(e.target.value),onKeyDown:e=>{if(e.key==='Enter')submitRequest()}}),
    tool==='mark'&&h('button',{className:'primary',disabled:busy||!requestText.trim(),onClick:submitRequest},'记录修改请求'),
    tool==='mark'&&h('button',{onClick:()=>{setTool('select');setMark(null);setRequestText('')}},'取消')));
 }

 return {
  inject:['slots'],
  apply(ctx){
    clientContext=ctx;
    ctx.effect(()=>ctx.slots.inject('settings.section',()=>ctx.slots.register({name:'settings.section',id:'dsh-ppt-studio',order:30,label:()=> 'PPT 专用模式'},SettingsPanel)));
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
