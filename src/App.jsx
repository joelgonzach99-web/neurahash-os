import { useState, useEffect } from 'react'
import { supabase } from './supabase'
import Charts from './Charts'
import AI from './AI'
const C={void:'#060608',bg1:'#0a0a0f',card:'#111118',card2:'#161622',glass:'rgba(16,16,28,0.75)',border:'rgba(255,255,255,0.06)',border2:'rgba(255,255,255,0.11)',gold:'#d4a843',gold2:'#f0c060',green:'#10b981',red:'#f43f5e',amber:'#f59e0b',blue:'#6366f1',t1:'#f0f0f8',t2:'#808098',t3:'#40405a'}
const initials=n=>n.split(' ').map(x=>x[0]).join('').substring(0,2).toUpperCase()
const daysUntil=d=>Math.round((new Date(d)-new Date())/864e5)
const money=n=>'$'+Number(n||0).toLocaleString()
const num={fontFamily:'monospace',fontWeight:700}

export default function App(){
  const[page,setPage]=useState('dashboard')
  const[clientes,setClientes]=useState([])
  const[equipos,setEquipos]=useState([])
  const[finanzas,setFinanzas]=useState([])
  const[alertas,setAlertas]=useState([])
  const[tareas,setTareas]=useState([])
  const[loading,setLoading]=useState(true)
  const[modal,setModal]=useState(null)
  const[form,setForm]=useState({})
  const[btc,setBtc]=useState(null)
  const[focus,setFocus]=useState(false)
  const[toasts,setToasts]=useState([])
  const[logoOk,setLogoOk]=useState(true)
  const[sideOpen,setSideOpen]=useState(false)

  useEffect(()=>{fetchAll()},[])
  useEffect(()=>{fetchBTC();const t=setInterval(fetchBTC,60000);return()=>clearInterval(t)},[])

  async function fetchAll(){
    setLoading(true)
    const[c,e,f,a,t]=await Promise.all([
      supabase.from('clientes').select('*').order('creado_en',{ascending:false}),
      supabase.from('equipos').select('*').order('creado_en',{ascending:false}),
      supabase.from('finanzas').select('*').order('fecha',{ascending:false}),
      supabase.from('alertas_energia').select('*').order('fecha_vence'),
      supabase.from('tareas').select('*').order('creado_en',{ascending:false}),
    ])
    setClientes(c.data||[]);setEquipos(e.data||[]);setFinanzas(f.data||[]);setAlertas(a.data||[]);setTareas(t.data||[])
    setLoading(false)
  }

  async function fetchBTC(){
    try{const r=await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true');const d=await r.json();setBtc(d.bitcoin)}catch(e){}
  }

  function toast(msg,type='info'){
    const id=Date.now()
    setToasts(p=>[...p,{id,msg,type}])
    setTimeout(()=>setToasts(p=>p.filter(t=>t.id!==id)),3000)
  }

  function navigate(p){setPage(p);setSideOpen(false)}

  const F=focus?'blur(8px)':'none'
  const ing=finanzas.filter(f=>f.tipo==='ingreso').reduce((a,b)=>a+Number(b.monto),0)
  const gst=finanzas.filter(f=>f.tipo==='gasto').reduce((a,b)=>a+Number(b.monto),0)
  const net=ing-gst
  const activeEq=equipos.filter(e=>e.estado==='activo').length
  const totalHash=equipos.filter(e=>e.estado!=='inactivo').reduce((a,b)=>a+Number(b.hashrate||0),0)

  async function addCliente(){
    if(!form.nombre||!form.tarifa_mensual){toast('Completá los campos requeridos','error');return}
    await supabase.from('clientes').insert([{nombre:form.nombre,contacto:form.contacto||'',pais:form.pais||'Paraguay',tarifa_mensual:Number(form.tarifa_mensual),unidades_asic:Number(form.unidades_asic)||1}])
    setModal(null);setForm({});fetchAll();toast('Cliente agregado ✓','success')
  }
  async function addEquipo(){
    if(!form.modelo){toast('Ingresá el modelo','error');return}
    await supabase.from('equipos').insert([{modelo:form.modelo,hashrate:Number(form.hashrate)||0,temperatura:Number(form.temperatura)||0,estado:form.estado||'activo'}])
    setModal(null);setForm({});fetchAll();toast('Equipo agregado ✓','success')
  }
  async function addFinanza(){
    if(!form.monto||!form.descripcion){toast('Completá los campos','error');return}
    await supabase.from('finanzas').insert([{tipo:form.tipo||'ingreso',monto:Number(form.monto),descripcion:form.descripcion,categoria:form.categoria||'Otro',fecha:form.fecha||new Date().toISOString().slice(0,10)}])
    setModal(null);setForm({});fetchAll();toast('Movimiento registrado ✓','success')
  }
  async function addAlerta(){
    if(!form.cliente_nombre||!form.fecha_vence||!form.monto){toast('Completá los campos','error');return}
    const c=clientes.find(x=>x.nombre===form.cliente_nombre)
    await supabase.from('alertas_energia').insert([{cliente_id:c?.id||null,fecha_vence:form.fecha_vence,monto:Number(form.monto)}])
    setModal(null);setForm({});fetchAll();toast('Alerta creada ✓','success')
  }
  async function addTarea(){
    if(!form.descripcion){toast('Escribí una descripción','error');return}
    await supabase.from('tareas').insert([{descripcion:form.descripcion,categoria:form.categoria||'ops'}])
    setModal(null);setForm({});fetchAll();toast('Tarea creada ✓','success')
  }
  async function toggleTarea(id,done){
    await supabase.from('tareas').update({completada:!done}).eq('id',id)
    fetchAll();if(!done)toast('Tarea completada ✓','success')
  }
  async function del(table,id){
    await supabase.from(table).delete().eq('id',id);fetchAll();toast('Eliminado','info')
  }
  async function resolveAlerta(a){
    await supabase.from('finanzas').insert([{tipo:'ingreso',monto:Number(a.monto),descripcion:'Pago energía',categoria:'Energía',fecha:new Date().toISOString().slice(0,10)}])
    await supabase.from('alertas_energia').delete().eq('id',a.id)
    fetchAll();toast('Pago registrado ✓','success')
  }

  const nav=[
    {id:'dashboard',label:'Dashboard',icon:'◈'},
    {id:'equipos',label:'Equipos',icon:'◉'},
    {id:'clientes',label:'Clientes',icon:'⬡',section:'Gestión'},
    {id:'contabilidad',label:'Contabilidad',icon:'⬢'},
    {id:'energia',label:'Energía',icon:'⚡',badge:alertas.length},
    {id:'tareas',label:'Tareas',icon:'✓',section:'Sistema'},
    {id:'ia',label:'IA',icon:'🧠'},
  ]

  const btn=(t)=>({display:'inline-flex',alignItems:'center',gap:6,padding:'9px 16px',borderRadius:8,border:'none',cursor:'pointer',fontFamily:'Inter,sans-serif',fontSize:11,fontWeight:600,letterSpacing:'.03em',transition:'all .2s',background:t==='gold'?`linear-gradient(135deg,#d4a843,#e8b84b)`:t==='ghost'?'rgba(255,255,255,0.06)':'transparent',color:t==='gold'?'#000':t==='ghost'?C.t1:C.red,boxShadow:t==='gold'?'0 0 20px rgba(212,168,67,0.25)':'none'})
  const panel={background:'rgba(14,14,22,0.8)',backdropFilter:'blur(20px)',border:`1px solid ${C.border}`,borderRadius:12,overflow:'hidden'}
  const panelHdr={display:'flex',alignItems:'center',justifyContent:'space-between',padding:'13px 18px',borderBottom:`1px solid ${C.border}`,background:'rgba(255,255,255,0.015)'}
  const fInput={width:'100%',background:'rgba(255,255,255,0.04)',border:`1px solid ${C.border2}`,borderRadius:8,padding:'11px 14px',color:C.t1,fontFamily:'Inter,sans-serif',fontSize:12,outline:'none',boxSizing:'border-box'}
  const fLabel={display:'block',fontSize:9,letterSpacing:'.15em',textTransform:'uppercase',color:C.t3,marginBottom:7,fontWeight:600}
  const tag=(c)=>({fontSize:8,padding:'3px 8px',borderRadius:20,textTransform:'uppercase',fontWeight:600,background:c==='urg'?'rgba(244,63,94,0.12)':c==='ops'?'rgba(99,102,241,0.12)':'rgba(212,168,67,0.12)',color:c==='urg'?C.red:c==='ops'?C.blue:C.gold2,border:`1px solid ${c==='urg'?'rgba(244,63,94,0.2)':c==='ops'?'rgba(99,102,241,0.2)':'rgba(212,168,67,0.2)'}`})

  if(loading)return(
    <div style={{display:'flex',width:'100vw',minHeight:'100vh',background:C.void,alignItems:'center',justifyContent:'center',flexDirection:'column',gap:14}}>
      <div style={{fontFamily:'monospace',fontSize:13,color:C.gold,letterSpacing:'.3em'}}>NEURAHASH OS</div>
      <div style={{fontSize:10,color:C.t3,letterSpacing:'.2em'}}>CARGANDO...</div>
    </div>
  )

  return(
    <div style={{display:'flex',width:'100vw',minHeight:'100vh',background:C.void,fontFamily:'Inter,system-ui,sans-serif',color:C.t1,position:'relative'}}>
      <style>{`
        *{box-sizing:border-box;}
        ::-webkit-scrollbar{width:4px;} ::-webkit-scrollbar-track{background:transparent;} ::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:2px;}
        @keyframes ledPulse{0%,100%{opacity:0.4;}50%{opacity:1;box-shadow:0 0 12px #10b981;}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:translateY(0);}}
        .page{animation:fadeUp .3s ease;}
        .nav-item:hover{background:rgba(255,255,255,0.04)!important;color:#f0f0f8!important;}
        .stat-card:hover{transform:translateY(-2px)!important;}
        .btn-gold:hover{box-shadow:0 0 30px rgba(212,168,67,0.4)!important;transform:translateY(-1px)!important;}
        .client-row:hover{background:rgba(255,255,255,0.025)!important;}
        .mobile-menu-btn{display:none;}
        .sidebar-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:99;backdrop-filter:blur(4px);}
        @media(max-width:768px){
          .sidebar{transform:translateX(-100%)!important;}
          .sidebar.open{transform:translateX(0)!important;}
          .main-content{margin-left:0!important;}
          .stat-grid{grid-template-columns:1fr 1fr!important;}
          .two-col{grid-template-columns:1fr!important;}
          .three-col{grid-template-columns:1fr!important;}
          .eq-grid{grid-template-columns:1fr 1fr!important;}
          .header-btc{display:none!important;}
          .mobile-menu-btn{display:flex!important;}
          .sidebar-overlay{display:block!important;}
        }
        @media(max-width:480px){
          .eq-grid{grid-template-columns:1fr!important;}
          .content-pad{padding:12px!important;}
        }
      `}</style>

      <div style={{position:'fixed',top:'-20%',left:'15%',width:600,height:600,borderRadius:'50%',background:'radial-gradient(circle,rgba(99,102,241,0.06),transparent 70%)',pointerEvents:'none',zIndex:0}}/>
      <div style={{position:'fixed',bottom:'-10%',right:'10%',width:500,height:500,borderRadius:'50%',background:'radial-gradient(circle,rgba(212,168,67,0.05),transparent 70%)',pointerEvents:'none',zIndex:0}}/>

      {sideOpen&&<div className="sidebar-overlay" onClick={()=>setSideOpen(false)}/>}

      <aside className={`sidebar${sideOpen?' open':''}`} style={{position:'fixed',left:0,top:0,width:220,height:'100vh',background:'linear-gradient(180deg,rgba(10,10,20,0.99),rgba(7,7,14,0.99))',borderRight:`1px solid ${C.border}`,display:'flex',flexDirection:'column',zIndex:100,backdropFilter:'blur(20px)',transition:'transform .3s ease'}}>
        <div style={{height:1,background:'linear-gradient(90deg,transparent,rgba(212,168,67,0.5),transparent)'}}/>
        <div style={{overflow:'hidden',borderBottom:`1px solid ${C.border}`}}>
          {logoOk
            ?<img src="/neurahash-logo.png" alt="NeuraHash" style={{width:'100%',display:'block'}} onError={()=>setLogoOk(false)}/>
            :<div style={{padding:'18px 20px'}}><div style={{fontFamily:'monospace',fontSize:15,fontWeight:800,color:C.gold,letterSpacing:'.1em'}}>NEURAHASH</div><div style={{fontSize:9,color:C.t3,letterSpacing:'.2em',marginTop:2}}>MINING OS</div></div>
          }
        </div>
        <nav style={{flex:1,padding:'8px 0',overflowY:'auto'}}>
          {nav.map(item=>(
            <div key={item.id}>
              {item.section&&<div style={{padding:'16px 18px 4px',fontSize:9,letterSpacing:'.3em',color:C.t3,textTransform:'uppercase',fontWeight:600}}>{item.section}</div>}
              <div className="nav-item" onClick={()=>navigate(item.id)} style={{display:'flex',alignItems:'center',gap:9,padding:'10px 18px',fontSize:11,color:page===item.id?C.gold2:C.t2,cursor:'pointer',background:page===item.id?'rgba(212,168,67,0.07)':'transparent',borderLeft:page===item.id?`2px solid ${C.gold}`:'2px solid transparent',transition:'all .15s',fontWeight:page===item.id?600:400,textTransform:'uppercase',letterSpacing:'.05em',margin:'1px 6px',borderRadius:'0 6px 6px 0'}}>
                <span style={{fontSize:13,opacity:.8}}>{item.icon}</span>
                {item.label}
                {item.badge>0&&<span style={{marginLeft:'auto',background:C.red,color:'#fff',fontSize:8,padding:'2px 6px',borderRadius:20,fontWeight:700}}>{item.badge}</span>}
              </div>
            </div>
          ))}
        </nav>
        <div style={{padding:'12px 16px',borderTop:`1px solid ${C.border}`}}>
          <div style={{display:'flex',alignItems:'center',gap:7,padding:'7px 12px',background:'rgba(16,185,129,0.07)',border:'1px solid rgba(16,185,129,0.2)',borderRadius:20}}>
            <span style={{width:6,height:6,borderRadius:'50%',background:C.green,boxShadow:`0 0 8px ${C.green}`,display:'inline-block',animation:'ledPulse 2s infinite'}}/>
            <span style={{fontSize:9,color:C.green,fontWeight:600,letterSpacing:'.1em'}}>SISTEMA ACTIVO</span>
          </div>
        </div>
      </aside>

      <div className="main-content" style={{marginLeft:220,flex:1,display:'flex',flexDirection:'column',minWidth:0,position:'relative',zIndex:1}}>
        <header style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 18px',background:'rgba(6,6,8,0.85)',backdropFilter:'blur(24px)',borderBottom:`1px solid ${C.border}`,position:'sticky',top:0,zIndex:50}}>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <button className="mobile-menu-btn" style={{background:'rgba(255,255,255,0.05)',border:`1px solid ${C.border}`,color:C.t1,width:34,height:34,borderRadius:8,cursor:'pointer',fontSize:17,alignItems:'center',justifyContent:'center'}} onClick={()=>setSideOpen(!sideOpen)}>☰</button>
            <div>
              <div style={{fontFamily:'monospace',fontSize:12,fontWeight:700,letterSpacing:'.08em'}}>{({dashboard:'PANEL GENERAL',equipos:'EQUIPOS',clientes:'CLIENTES',contabilidad:'CONTABILIDAD',energia:'ENERGÍA',tareas:'TAREAS'})[page]}</div>
              <div style={{fontSize:8,color:C.t3,marginTop:2,letterSpacing:'.05em'}}>NEURAHASH · PY & BO</div>
            </div>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            {btc&&<div className="header-btc" style={{display:'flex',alignItems:'center',gap:8,padding:'6px 12px',background:'rgba(255,255,255,0.04)',border:`1px solid ${C.border}`,borderRadius:20}}>
              <span style={{color:C.gold,fontSize:13}}>₿</span>
              <div style={{...num,fontSize:11,color:C.gold2,filter:F}}>${btc.usd?.toLocaleString()}</div>
              <span style={{fontSize:9,padding:'2px 6px',borderRadius:10,background:btc.usd_24h_change>=0?'rgba(16,185,129,0.12)':'rgba(244,63,94,0.12)',color:btc.usd_24h_change>=0?C.green:C.red,fontWeight:600}}>{btc.usd_24h_change>=0?'+':''}{btc.usd_24h_change?.toFixed(2)}%</span>
            </div>}
            <button style={{...btn('ghost'),padding:'6px 10px',borderRadius:16,border:`1px solid ${C.border}`,fontSize:14}} onClick={()=>setFocus(!focus)}>{focus?'👁':'🔒'}</button>
            <button onClick={()=>supabase.auth.signOut()} style={{...btn('ghost'),padding:'6px 10px',borderRadius:16,border:`1px solid ${C.border}`,fontSize:10,marginRight:4}}>⏻</button>
<button onClick={()=>navigate('energia')} style={{width:34,height:34,background:'rgba(255,255,255,0.05)',border:`1px solid ${C.border}`,borderRadius:8,cursor:'pointer',fontSize:14,color:C.t2,position:'relative',display:'flex',alignItems:'center',justifyContent:'center'}}>
              🔔{alertas.length>0&&<span style={{position:'absolute',top:-4,right:-4,width:15,height:15,background:C.red,borderRadius:'50%',fontSize:8,fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center',color:'#fff'}}>{alertas.length}</span>}
            </button>
          </div>
        </header>

        <div className="content-pad" style={{padding:'16px 18px',flex:1}}>

          {page==='dashboard'&&<div className="page">
            <div className="stat-grid" style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,marginBottom:14}}>
              {[
                {label:'Equipos Activos',val:activeEq,sub:`de ${equipos.length} totales`,color:C.green,icon:'⛏'},
                {label:'Hashrate Total',val:totalHash+'TH',sub:'combinado',color:C.gold,icon:'₿'},
                {label:'Clientes',val:clientes.length,sub:'contratos hosting',color:C.blue,icon:'👥'},
                {label:'Alertas Energía',val:alertas.length,sub:'pendientes',color:C.red,icon:'⚡'},
              ].map(s=>(
                <div key={s.label} className="stat-card" style={{background:'linear-gradient(135deg,rgba(22,22,34,0.9),rgba(14,14,20,0.9))',backdropFilter:'blur(20px)',border:`1px solid ${C.border}`,borderRadius:12,padding:'12px 14px',position:'relative',overflow:'hidden',transition:'transform .2s'}}>
                  <div style={{position:'absolute',top:-25,right:-25,width:70,height:70,borderRadius:'50%',background:s.color,filter:'blur(25px)',opacity:.2,pointerEvents:'none'}}/>
                  <div style={{fontSize:8,letterSpacing:'.1em',color:C.t3,textTransform:'uppercase',fontWeight:600,marginBottom:6}}>{s.label}</div>
                  <div style={{...num,fontSize:22,color:s.color,filter:F}}>{s.val}</div>
                  <div style={{fontSize:8,color:C.t3,marginTop:3}}>{s.sub}</div>
                  <div style={{position:'absolute',right:8,bottom:6,fontSize:20,opacity:.07}}>{s.icon}</div>
                </div>
              ))}
            </div>
            <div className="two-col" style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
              <div style={panel}>
                <div style={panelHdr}>
                  <span style={{fontSize:9,letterSpacing:'.1em',textTransform:'uppercase',color:C.t2,fontWeight:600}}>⛏ Equipos</span>
                  <button style={{fontSize:9,color:'rgba(212,168,67,0.6)',cursor:'pointer',background:'none',border:'none',fontFamily:'Inter,sans-serif',fontWeight:600}} onClick={()=>navigate('equipos')}>Ver todos →</button>
                </div>
                {equipos.slice(0,5).map(e=>(
                  <div key={e.id} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 14px',borderBottom:`1px solid ${C.border}`}}>
                    <span style={{width:7,height:7,borderRadius:'50%',flexShrink:0,background:e.estado==='activo'?C.green:e.estado==='advertencia'?C.amber:C.t3,animation:e.estado==='activo'?'ledPulse 2s infinite':'none'}}/>
                    <span style={{flex:1,fontSize:11,fontWeight:500}}>{e.modelo}</span>
                    <span style={{...num,fontSize:10,color:C.gold2,filter:F}}>{e.hashrate}TH</span>
                    <span style={{fontSize:9,color:e.temperatura>79?C.red:C.t3,width:34,textAlign:'right'}}>{e.temperatura}°C</span>
                  </div>
                ))}
                {!equipos.length&&<div style={{padding:24,color:C.t3,textAlign:'center',fontSize:11}}>Sin equipos registrados</div>}
              </div>
              <div style={panel}>
                <div style={panelHdr}>
                  <span style={{fontSize:9,letterSpacing:'.1em',textTransform:'uppercase',color:C.t2,fontWeight:600}}>⚡ Alertas Energía</span>
                  <button style={{fontSize:9,color:'rgba(212,168,67,0.6)',cursor:'pointer',background:'none',border:'none',fontFamily:'Inter,sans-serif',fontWeight:600}} onClick={()=>navigate('energia')}>Ver →</button>
                </div>
                <div style={{padding:'10px 12px'}}>
                  {alertas.slice(0,2).map(a=>{
                    const d=daysUntil(a.fecha_vence),lvl=d<0?'red':'amber'
                    return(
                      <div key={a.id} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 10px',borderRadius:8,marginBottom:6,background:lvl==='red'?'rgba(244,63,94,0.06)':'rgba(245,158,11,0.06)',border:`1px solid ${lvl==='red'?'rgba(244,63,94,0.2)':'rgba(245,158,11,0.2)'}`}}>
                        <span style={{fontSize:14}}>{lvl==='red'?'🔴':'🟡'}</span>
                        <div style={{flex:1}}>
                          <div style={{fontSize:10,fontWeight:600,filter:F}}>Vence: {a.fecha_vence}</div>
                          <div style={{fontSize:8,color:C.t3,filter:F}}>{money(a.monto)} USD</div>
                        </div>
                        <span style={{...num,fontSize:14,color:lvl==='red'?C.red:C.amber}}>{d<0?d:'+'+d}d</span>
                      </div>
                    )
                  })}
                  {!alertas.length&&<div style={{padding:'8px 0',color:C.green,fontSize:11,textAlign:'center'}}>✓ Sin alertas pendientes</div>}
                  <div style={{marginTop:6}}>
                    {[['Ingresos',money(ing),C.green],['Gastos','-'+money(gst),C.red],['Neto',money(net),net>=0?C.green:C.red]].map(([l,v,c])=>(
                      <div key={l} style={{display:'flex',justifyContent:'space-between',padding:'5px 0',borderBottom:`1px solid ${C.border}`,fontSize:9}}>
                        <span style={{color:C.t2}}>{l}</span>
                        <span style={{...num,color:c,filter:F}}>{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="three-col" style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr',gap:12}}>
              <div style={panel}>
                <div style={panelHdr}>
                  <span style={{fontSize:9,letterSpacing:'.1em',textTransform:'uppercase',color:C.t2,fontWeight:600}}>👥 Clientes</span>
                  <button style={{fontSize:9,color:'rgba(212,168,67,0.6)',cursor:'pointer',background:'none',border:'none',fontFamily:'Inter,sans-serif',fontWeight:600}} onClick={()=>setModal('cliente')}>+ Nuevo</button>
                </div>
                {clientes.slice(0,5).map(c=>(
                  <div key={c.id} className="client-row" onClick={()=>navigate('clientes')} style={{display:'flex',alignItems:'center',gap:8,padding:'9px 14px',borderBottom:`1px solid ${C.border}`,cursor:'pointer',transition:'background .15s'}}>
                    <div style={{width:26,height:26,borderRadius:'50%',background:`linear-gradient(135deg,rgba(212,168,67,0.6),${C.gold})`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:9,fontWeight:700,color:'#000',flexShrink:0}}>{initials(c.nombre)}</div>
                    <span style={{flex:1,fontSize:11,fontWeight:500,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c.nombre}</span>
                    <span style={{fontSize:8,color:C.t3,flexShrink:0}}>{c.unidades_asic} ASICs</span>
                    <span style={{...num,fontSize:11,color:C.gold2,marginLeft:8,filter:F,flexShrink:0}}>{money(c.tarifa_mensual)}/mo</span>
                  </div>
                ))}
                {!clientes.length&&<div style={{padding:24,color:C.t3,textAlign:'center',fontSize:11}}>Sin clientes</div>}
              </div>
              <div style={panel}>
                <div style={panelHdr}><span style={{fontSize:9,letterSpacing:'.1em',textTransform:'uppercase',color:C.t2,fontWeight:600}}>💰 Finanzas</span></div>
                <div style={{padding:'0 14px'}}>
                  {[['Ingresos',money(ing),C.green,false],['Gastos','-'+money(gst),C.red,false],['Neto',money(net),net>=0?C.green:C.red,true]].map(([l,v,c,bold])=>(
                    <div key={l} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',borderBottom:`1px solid ${C.border}`}}>
                      <span style={{fontSize:9,color:bold?C.t1:C.t2,fontWeight:bold?600:400}}>{l}</span>
                      <span style={{...num,fontSize:bold?13:10,color:c,filter:F}}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div style={panel}>
                <div style={panelHdr}><span style={{fontSize:9,letterSpacing:'.1em',textTransform:'uppercase',color:C.t2,fontWeight:600}}>✓ Tareas</span></div>
                <div style={{padding:'0 14px'}}>
                  {tareas.slice(0,5).map(t=>(
                    <div key={t.id} style={{display:'flex',alignItems:'center',gap:7,padding:'8px 0',borderBottom:`1px solid ${C.border}`}}>
                      <div onClick={()=>toggleTarea(t.id,t.completada)} style={{width:14,height:14,border:`1.5px solid ${t.completada?C.green:C.border2}`,borderRadius:3,cursor:'pointer',background:t.completada?C.green:'transparent',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                        {t.completada&&<span style={{fontSize:8,color:'#000',fontWeight:900}}>✓</span>}
                      </div>
                      <span style={{flex:1,fontSize:9,color:t.completada?C.t3:C.t1,textDecoration:t.completada?'line-through':'none'}}>{t.descripcion}</span>
                    </div>
                  ))}
                  {!tareas.length&&<div style={{padding:16,color:C.t3,textAlign:'center',fontSize:11}}>Sin tareas</div>}
                </div>
              </div>
            </div>
          </div>}

          {page==='equipos'&&<div className="page">
            <div style={{display:'flex',justifyContent:'flex-end',marginBottom:14}}>
              <button className="btn-gold" style={btn('gold')} onClick={()=>setModal('equipo')}>+ Agregar equipo</button>
            </div>
            <div className="eq-grid" style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12}}>
              {equipos.map(e=>(
                <div key={e.id} style={{...panel,padding:14,border:`1px solid ${e.estado==='activo'?'rgba(16,185,129,0.2)':e.estado==='advertencia'?'rgba(245,158,11,0.2)':C.border}`}}>
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:10}}>
                    <div><div style={{fontSize:12,fontWeight:600}}>{e.modelo}</div><div style={{fontSize:9,color:C.t3,marginTop:2,textTransform:'uppercase'}}>{e.estado}</div></div>
                    <span style={{width:8,height:8,borderRadius:'50%',background:e.estado==='activo'?C.green:e.estado==='advertencia'?C.amber:C.t3,marginTop:4,animation:e.estado==='activo'?'ledPulse 2s infinite':'none'}}/>
                  </div>
                  <div style={{display:'flex',gap:16,marginBottom:12}}>
                    <div><div style={{fontSize:8,color:C.t3,textTransform:'uppercase',marginBottom:2}}>Hashrate</div><div style={{...num,fontSize:14,color:C.gold2,filter:F}}>{e.hashrate} TH/s</div></div>
                    <div><div style={{fontSize:8,color:C.t3,textTransform:'uppercase',marginBottom:2}}>Temp</div><div style={{...num,fontSize:14,color:e.temperatura>79?C.red:C.t1}}>{e.temperatura}°C</div></div>
                  </div>
                  <button style={{...btn('danger'),padding:'5px 10px',fontSize:10}} onClick={()=>del('equipos',e.id)}>🗑 Eliminar</button>
                </div>
              ))}
              {!equipos.length&&<div style={{gridColumn:'span 3',padding:40,color:C.t3,textAlign:'center',fontSize:11,textTransform:'uppercase'}}>Sin equipos registrados</div>}
            </div>
          </div>}

          {page==='clientes'&&<div className="page">
            <div style={{display:'flex',justifyContent:'flex-end',marginBottom:14}}>
              <button className="btn-gold" style={btn('gold')} onClick={()=>setModal('cliente')}>+ Nuevo cliente</button>
            </div>
            <div style={panel}>
              {clientes.map(c=>(
                <div key={c.id} style={{display:'flex',alignItems:'center',gap:10,padding:'12px 16px',borderBottom:`1px solid ${C.border}`}}>
                  <div style={{width:30,height:30,borderRadius:'50%',background:`linear-gradient(135deg,rgba(212,168,67,0.6),${C.gold})`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:700,color:'#000',flexShrink:0}}>{initials(c.nombre)}</div>
                  <div style={{flex:1,minWidth:0}}><div style={{fontSize:12,fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c.nombre}</div><div style={{fontSize:9,color:C.t3,marginTop:2}}>{c.contacto} · {c.pais}</div></div>
                  <div style={{textAlign:'center',padding:'0 10px',flexShrink:0}}><div style={{...num,fontSize:15,color:C.gold2}}>{c.unidades_asic}</div><div style={{fontSize:8,color:C.t3,textTransform:'uppercase'}}>ASICs</div></div>
                  <div style={{textAlign:'right',flexShrink:0}}><div style={{...num,fontSize:12,color:C.green,filter:F}}>{money(c.tarifa_mensual)}/mo</div></div>
                  <button style={{...btn('danger'),padding:'5px 8px',fontSize:9,flexShrink:0}} onClick={()=>del('clientes',c.id)}>🗑</button>
                </div>
              ))}
              {!clientes.length&&<div style={{padding:40,color:C.t3,textAlign:'center',fontSize:11,textTransform:'uppercase'}}>Sin clientes</div>}
            </div>
          </div>}

          {page==='contabilidad'&&<div className="page">
            <div style={{background:'rgba(14,14,22,0.8)',backdropFilter:'blur(20px)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:12,overflow:'hidden',marginBottom:14}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'13px 18px',borderBottom:'1px solid rgba(255,255,255,0.06)',background:'rgba(255,255,255,0.015)'}}>
                <span style={{fontSize:9,letterSpacing:'.12em',textTransform:'uppercase',color:'#808098',fontWeight:600}}>📊 Ingresos vs Gastos — Últimos 6 meses</span>
              </div>
              <div style={{padding:'16px 8px 8px'}}><Charts finanzas={finanzas}/></div>
            </div>
            <div style={{background:'linear-gradient(135deg,rgba(212,168,67,0.08),rgba(99,102,241,0.05))',border:'1px solid rgba(212,168,67,0.15)',borderRadius:12,padding:'14px 18px',marginBottom:14,display:'flex',flexWrap:'wrap',alignItems:'center',gap:18}}>
              {[['Balance Neto',money(net),net>=0?C.green:C.red,26],['Ingresos','+'+money(ing),C.green,16],['Gastos','-'+money(gst),C.red,16]].map(([l,v,c,sz])=>(
                <div key={l}><div style={{fontSize:8,color:C.t3,textTransform:'uppercase',letterSpacing:'.1em',fontWeight:600}}>{l}</div><div style={{...num,fontSize:sz,color:c,filter:F}}>{v}</div></div>
              ))}
            </div>
            <div style={{display:'flex',justifyContent:'flex-end',marginBottom:12}}>
              <button className="btn-gold" style={btn('gold')} onClick={()=>setModal('finanza')}>+ Registrar movimiento</button>
            </div>
            <div style={panel}>
              {finanzas.map(f=>(
                <div key={f.id} style={{display:'flex',alignItems:'center',gap:8,padding:'10px 14px',borderBottom:`1px solid ${C.border}`}}>
                  <span style={{width:6,height:6,borderRadius:'50%',background:f.tipo==='ingreso'?C.green:C.red,flexShrink:0}}/>
                  <span style={{flex:1,fontSize:10,fontWeight:500,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{f.descripcion}</span>
                  <span style={{fontSize:8,color:C.t3,flexShrink:0}}>{f.fecha}</span>
                  <span style={{...num,fontSize:11,width:75,textAlign:'right',color:f.tipo==='ingreso'?C.green:C.red,filter:F,flexShrink:0}}>{f.tipo==='ingreso'?'+':'-'}{money(f.monto)}</span>
                  <button style={{...btn('danger'),padding:'3px 7px',flexShrink:0}} onClick={()=>del('finanzas',f.id)}>🗑</button>
                </div>
              ))}
              {!finanzas.length&&<div style={{padding:40,color:C.t3,textAlign:'center',fontSize:11,textTransform:'uppercase'}}>Sin movimientos</div>}
            </div>
          </div>}

          {page==='energia'&&<div className="page">
            <div style={{display:'flex',justifyContent:'flex-end',marginBottom:14}}>
              <button className="btn-gold" style={btn('gold')} onClick={()=>setModal('alerta')}>+ Nueva alerta</button>
            </div>
            {alertas.map(a=>{
              const d=daysUntil(a.fecha_vence),lvl=d<0?'red':'amber'
              return(
                <div key={a.id} style={{...panel,marginBottom:12,border:`1px solid ${lvl==='red'?'rgba(244,63,94,0.25)':'rgba(245,158,11,0.25)'}`}}>
                  <div style={{display:'flex',alignItems:'center',gap:12,padding:'14px 18px'}}>
                    <span style={{fontSize:22}}>{lvl==='red'?'🔴':'🟡'}</span>
                    <div style={{flex:1}}>
                      <div style={{...num,fontSize:13}}>Vence: {a.fecha_vence}</div>
                      <div style={{fontSize:9,color:C.t3,marginTop:3}}>{d<0?`Vencido hace ${Math.abs(d)} días`:`Vence en ${d} días`}</div>
                    </div>
                    <div style={{...num,fontSize:22,color:lvl==='red'?C.red:C.amber}}>{d<0?d:'+'+d}d</div>
                  </div>
                  <div style={{display:'flex',flexWrap:'wrap',alignItems:'center',justifyContent:'space-between',gap:8,padding:'10px 18px',borderTop:`1px solid ${C.border}`}}>
                    <div style={{...num,fontSize:18,color:C.gold2,filter:F}}>{money(a.monto)} USD</div>
                    <div style={{display:'flex',gap:8}}>
                      <button style={{...btn('ghost'),border:'1px solid rgba(16,185,129,0.3)',color:C.green,padding:'6px 10px',fontSize:10}} onClick={()=>resolveAlerta(a)}>✓ Pagado</button>
                      <button style={{...btn('danger'),padding:'6px 10px',fontSize:10}} onClick={()=>del('alertas_energia',a.id)}>Eliminar</button>
                    </div>
                  </div>
                </div>
              )
            })}
            {!alertas.length&&<div style={{...panel,padding:40,color:C.green,textAlign:'center',fontSize:12}}>✓ Sin alertas activas.</div>}
          </div>}

          {page==='ia'&&<div className="page">
            <AI clientes={clientes} equipos={equipos} finanzas={finanzas} alertas={alertas} tareas={tareas}/>
          </div>}

          {page==='tareas'&&<div className="page">
            <div style={{display:'flex',justifyContent:'flex-end',marginBottom:14}}>
              <button className="btn-gold" style={btn('gold')} onClick={()=>setModal('tarea')}>+ Nueva tarea</button>
            </div>
            <div style={panel}>
              {tareas.map(t=>(
                <div key={t.id} style={{display:'flex',alignItems:'center',gap:10,padding:'11px 14px',borderBottom:`1px solid ${C.border}`}}>
                  <div onClick={()=>toggleTarea(t.id,t.completada)} style={{width:16,height:16,border:`1.5px solid ${t.completada?C.green:C.border2}`,borderRadius:4,cursor:'pointer',background:t.completada?C.green:'transparent',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                    {t.completada&&<span style={{fontSize:9,color:'#000',fontWeight:900}}>✓</span>}
                  </div>
                  <span style={{flex:1,fontSize:11,fontWeight:500,color:t.completada?C.t3:C.t1,textDecoration:t.completada?'line-through':'none'}}>{t.descripcion}</span>
                  <span style={tag(t.categoria)}>{t.categoria==='urg'?'Urgente':t.categoria==='ops'?'Ops':'Fin'}</span>
                  <button style={{...btn('danger'),padding:'4px 7px',marginLeft:6}} onClick={()=>del('tareas',t.id)}>🗑</button>
                </div>
              ))}
              {!tareas.length&&<div style={{padding:40,color:C.t3,textAlign:'center',fontSize:11,textTransform:'uppercase'}}>Sin tareas</div>}
            </div>
          </div>}

        </div>
      </div>

      {modal&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.85)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',backdropFilter:'blur(6px)',padding:'16px'}} onClick={e=>{if(e.target===e.currentTarget){setModal(null);setForm({})}}}>
          <div style={{background:'linear-gradient(135deg,rgba(16,16,26,0.99),rgba(12,12,20,0.99))',border:`1px solid ${C.border2}`,borderRadius:16,width:'100%',maxWidth:460,maxHeight:'90vh',overflowY:'auto',boxShadow:'0 32px 80px rgba(0,0,0,0.7)'}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'16px 20px',borderBottom:`1px solid ${C.border}`}}>
              <div style={{fontFamily:'monospace',fontSize:11,fontWeight:700,letterSpacing:'.08em'}}>
                {({cliente:'NUEVO CLIENTE',equipo:'NUEVO EQUIPO',finanza:'REGISTRAR MOVIMIENTO',alerta:'NUEVA ALERTA',tarea:'NUEVA TAREA'})[modal]}
              </div>
              <button style={{background:'rgba(255,255,255,0.06)',border:`1px solid ${C.border}`,color:C.t2,width:28,height:28,borderRadius:6,cursor:'pointer',fontSize:16,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={()=>{setModal(null);setForm({})}}>×</button>
            </div>
            <div style={{padding:18}}>
              {modal==='cliente'&&<>
                <div style={{marginBottom:12}}><label style={fLabel}>Nombre completo</label><input style={fInput} placeholder="Ej: Carlos Reyes" value={form.nombre||''} onChange={e=>setForm({...form,nombre:e.target.value})}/></div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:12}}>
                  <div><label style={fLabel}>Contacto</label><input style={fInput} placeholder="+595 9..." value={form.contacto||''} onChange={e=>setForm({...form,contacto:e.target.value})}/></div>
                  <div><label style={fLabel}>ASICs</label><input style={fInput} type="number" placeholder="3" value={form.unidades_asic||''} onChange={e=>setForm({...form,unidades_asic:e.target.value})}/></div>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                  <div><label style={fLabel}>Tarifa mensual (USD)</label><input style={fInput} type="number" placeholder="420" value={form.tarifa_mensual||''} onChange={e=>setForm({...form,tarifa_mensual:e.target.value})}/></div>
                  <div><label style={fLabel}>País</label><select style={fInput} value={form.pais||'Paraguay'} onChange={e=>setForm({...form,pais:e.target.value})}><option>Paraguay</option><option>Bolivia</option><option>Argentina</option><option>Otro</option></select></div>
                </div>
                <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:18,paddingTop:14,borderTop:`1px solid ${C.border}`}}>
                  <button style={btn('ghost')} onClick={()=>{setModal(null);setForm({})}}>Cancelar</button>
                  <button className="btn-gold" style={btn('gold')} onClick={addCliente}>✓ Guardar</button>
                </div>
              </>}
              {modal==='equipo'&&<>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:12}}>
                  <div><label style={fLabel}>Modelo</label><input style={fInput} placeholder="Antminer S21" value={form.modelo||''} onChange={e=>setForm({...form,modelo:e.target.value})}/></div>
                  <div><label style={fLabel}>Estado</label><select style={fInput} value={form.estado||'activo'} onChange={e=>setForm({...form,estado:e.target.value})}><option value="activo">Activo</option><option value="advertencia">Advertencia</option><option value="inactivo">Inactivo</option></select></div>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                  <div><label style={fLabel}>Hashrate (TH/s)</label><input style={fInput} type="number" placeholder="200" value={form.hashrate||''} onChange={e=>setForm({...form,hashrate:e.target.value})}/></div>
                  <div><label style={fLabel}>Temperatura (°C)</label><input style={fInput} type="number" placeholder="68" value={form.temperatura||''} onChange={e=>setForm({...form,temperatura:e.target.value})}/></div>
                </div>
                <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:18,paddingTop:14,borderTop:`1px solid ${C.border}`}}>
                  <button style={btn('ghost')} onClick={()=>{setModal(null);setForm({})}}>Cancelar</button>
                  <button className="btn-gold" style={btn('gold')} onClick={addEquipo}>✓ Guardar</button>
                </div>
              </>}
              {modal==='finanza'&&<>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:12}}>
                  <div><label style={fLabel}>Tipo</label><select style={fInput} value={form.tipo||'ingreso'} onChange={e=>setForm({...form,tipo:e.target.value})}><option value="ingreso">Ingreso</option><option value="gasto">Gasto</option></select></div>
                  <div><label style={fLabel}>Monto (USD)</label><input style={fInput} type="number" placeholder="420" value={form.monto||''} onChange={e=>setForm({...form,monto:e.target.value})}/></div>
                </div>
                <div style={{marginBottom:12}}><label style={fLabel}>Descripción</label><input style={fInput} placeholder="Ej: Pago hosting" value={form.descripcion||''} onChange={e=>setForm({...form,descripcion:e.target.value})}/></div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                  <div><label style={fLabel}>Categoría</label><select style={fInput} value={form.categoria||'Otro'} onChange={e=>setForm({...form,categoria:e.target.value})}><option>Hosting</option><option>Energía</option><option>Mantenimiento</option><option>BTC</option><option>Otro</option></select></div>
                  <div><label style={fLabel}>Fecha</label><input style={fInput} type="date" value={form.fecha||new Date().toISOString().slice(0,10)} onChange={e=>setForm({...form,fecha:e.target.value})}/></div>
                </div>
                <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:18,paddingTop:14,borderTop:`1px solid ${C.border}`}}>
                  <button style={btn('ghost')} onClick={()=>{setModal(null);setForm({})}}>Cancelar</button>
                  <button className="btn-gold" style={btn('gold')} onClick={addFinanza}>✓ Registrar</button>
                </div>
              </>}
              {modal==='alerta'&&<>
                <div style={{marginBottom:12}}><label style={fLabel}>Cliente</label><input style={fInput} placeholder="Nombre del cliente" value={form.cliente_nombre||''} onChange={e=>setForm({...form,cliente_nombre:e.target.value})}/></div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                  <div><label style={fLabel}>Fecha vencimiento</label><input style={fInput} type="date" value={form.fecha_vence||''} onChange={e=>setForm({...form,fecha_vence:e.target.value})}/></div>
                  <div><label style={fLabel}>Monto (USD)</label><input style={fInput} type="number" placeholder="420" value={form.monto||''} onChange={e=>setForm({...form,monto:e.target.value})}/></div>
                </div>
                <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:18,paddingTop:14,borderTop:`1px solid ${C.border}`}}>
                  <button style={btn('ghost')} onClick={()=>{setModal(null);setForm({})}}>Cancelar</button>
                  <button className="btn-gold" style={btn('gold')} onClick={addAlerta}>✓ Crear</button>
                </div>
              </>}
              {modal==='tarea'&&<>
                <div style={{marginBottom:12}}><label style={fLabel}>Descripción</label><input style={fInput} placeholder="Ej: Revisar ASIC-003" value={form.descripcion||''} onChange={e=>setForm({...form,descripcion:e.target.value})}/></div>
                <div style={{marginBottom:12}}><label style={fLabel}>Categoría</label><select style={fInput} value={form.categoria||'ops'} onChange={e=>setForm({...form,categoria:e.target.value})}><option value="ops">Operaciones</option><option value="fin">Finanzas</option><option value="urg">Urgente</option></select></div>
                <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:18,paddingTop:14,borderTop:`1px solid ${C.border}`}}>
                  <button style={btn('ghost')} onClick={()=>{setModal(null);setForm({})}}>Cancelar</button>
                  <button className="btn-gold" style={btn('gold')} onClick={addTarea}>✓ Crear</button>
                </div>
              </>}
            </div>
          </div>
        </div>
      )}

      <div style={{position:'fixed',bottom:18,right:14,zIndex:300,display:'flex',flexDirection:'column',gap:7}}>
        {toasts.map(t=>(
          <div key={t.id} style={{background:'rgba(14,14,22,0.95)',backdropFilter:'blur(20px)',border:`1px solid ${C.border2}`,borderLeft:`3px solid ${t.type==='success'?C.green:t.type==='error'?C.red:C.gold}`,borderRadius:10,padding:'10px 14px',fontSize:11,fontWeight:500,color:C.t1,display:'flex',alignItems:'center',gap:8,minWidth:200,maxWidth:'88vw',boxShadow:'0 8px 32px rgba(0,0,0,0.5)'}}>
            <span>{t.type==='success'?'✓':t.type==='error'?'✕':'ℹ'}</span>{t.msg}
          </div>
        ))}
      </div>
    </div>
  )
}