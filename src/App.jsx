import { useState, useEffect, useRef } from 'react'
import { supabase } from './supabase'
import Charts from './Charts'
import AI from './AI'

const C={void:'#060608',bg1:'#0a0a0f',card:'#111118',card2:'#161622',glass:'rgba(16,16,28,0.75)',border:'rgba(255,255,255,0.06)',border2:'rgba(255,255,255,0.11)',gold:'#d4a843',gold2:'#f0c060',green:'#10b981',red:'#f43f5e',amber:'#f59e0b',blue:'#6366f1',purple:'#a855f7',t1:'#f0f0f8',t2:'#808098',t3:'#40405a'}
const initials=n=>n.split(' ').map(x=>x[0]).join('').substring(0,2).toUpperCase()
const daysUntil=d=>Math.round((new Date(d)-new Date())/864e5)
const money=(n,cur='USD')=>{
  const sym={USD:'$',PYG:'₲',BOB:'Bs'}[cur]||'$'
  return sym+Number(n||0).toLocaleString()
}
const num={fontFamily:'monospace',fontWeight:700}

// Exchange rates (approximate, can be updated)
const RATES={USD:1,PYG:7500,BOB:6.91}

function toUSD(amount,currency){return Number(amount||0)/RATES[currency||'USD']}

function getProximoCobro(diaCobro){
  const hoy=new Date()
  const este=new Date(hoy.getFullYear(),hoy.getMonth(),diaCobro||1)
  if(este<=hoy)este.setMonth(este.getMonth()+1)
  return este.toISOString().slice(0,10)
}
function getPeriodo(){
  const d=new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
}

function ClientesInline({equipos=[],fetchAll,toast,clientes=[]}){
  const[pagos,setPagos]=useState([])
  const[clienteEquipos,setClienteEquipos]=useState([])
  const[modal,setModal]=useState(null)
  const[selected,setSelected]=useState(null)
  const[form,setForm]=useState({})
  const[tab,setTab]=useState('lista')
  const[loading,setLoading]=useState(true)

  useEffect(()=>{fetchData()},[])

  async function fetchData(){
    setLoading(true)
    const[p,ce]=await Promise.all([
      supabase.from('pagos_clientes').select('*').order('creado_en',{ascending:false}),
      supabase.from('cliente_equipos').select('*'),
    ])
    setPagos(p.data||[])
    setClienteEquipos(ce.data||[])
    setLoading(false)
  }

  function getClienteEquipos(clienteId){
    const ids=clienteEquipos.filter(ce=>ce.cliente_id===clienteId).map(ce=>ce.equipo_id)
    return equipos.filter(e=>ids.includes(e.id))
  }
  function getEstadoPago(clienteId,tipo='hosting'){
    const p=pagos.find(p=>p.cliente_id===clienteId&&p.periodo===getPeriodo()&&p.tipo===tipo)
    return p?.estado||'pendiente'
  }
  function getDiasAlCobro(c){
    if(!c.dia_cobro)return null
    return Math.round((new Date(getProximoCobro(c.dia_cobro))-new Date())/864e5)
  }

  const alertasProximas=clientes.filter(c=>{const d=getDiasAlCobro(c);return d!==null&&d<=5&&d>=0&&getEstadoPago(c.id)!=='pagado'})
  const alertasVencidas=clientes.filter(c=>{const d=getDiasAlCobro(c);return d!==null&&d<0&&getEstadoPago(c.id)!=='pagado'})
  const totalPorCobrar=clientes.filter(c=>getEstadoPago(c.id)!=='pagado').reduce((a,b)=>a+Number(b.tarifa_mensual||0),0)

  async function addCliente(){
    if(!form.nombre||!form.tarifa_mensual){toast('Completá los campos requeridos','error');return}
    await supabase.from('clientes').insert([{nombre:form.nombre,contacto:form.contacto||'',pais:form.pais||'Paraguay',tarifa_mensual:Number(form.tarifa_mensual),unidades_asic:Number(form.unidades_asic)||1,dia_cobro:Number(form.dia_cobro)||1,fecha_inicio:form.fecha_inicio||new Date().toISOString().slice(0,10),fecha_vence_contrato:form.fecha_vence_contrato||null,costo_energia:Number(form.costo_energia)||0,notas:form.notas||'',estado:'activo'}])
    setModal(null);setForm({});fetchAll();fetchData();toast('Cliente agregado ✓','success')
  }
  async function asignarEquipo(){
    if(!form.equipo_id){toast('Seleccioná un equipo','error');return}
    await supabase.from('cliente_equipos').insert([{cliente_id:selected.id,equipo_id:form.equipo_id}])
    setModal(null);setForm({});fetchData();toast('Equipo asignado ✓','success')
  }
  async function desasignarEquipo(cid,eid){
    await supabase.from('cliente_equipos').delete().eq('cliente_id',cid).eq('equipo_id',eid)
    fetchData();toast('Equipo removido','info')
  }
  async function marcarPagado(c,tipo){
    const periodo=getPeriodo()
    const monto=tipo==='hosting'?c.tarifa_mensual:c.costo_energia
    const existe=pagos.find(p=>p.cliente_id===c.id&&p.periodo===periodo&&p.tipo===tipo)
    if(existe){await supabase.from('pagos_clientes').update({estado:'pagado',fecha_pago:new Date().toISOString().slice(0,10)}).eq('id',existe.id)}
    else{await supabase.from('pagos_clientes').insert([{cliente_id:c.id,tipo,monto:Number(monto)||0,moneda:'USD',fecha_pago:new Date().toISOString().slice(0,10),periodo,estado:'pagado'}])}
    await supabase.from('finanzas').insert([{tipo:'ingreso',monto:Number(monto)||0,moneda:'USD',descripcion:`${tipo==='hosting'?'Hosting':'Energía'}: ${c.nombre}`,categoria:tipo==='hosting'?'Hosting':'Energía',fecha:new Date().toISOString().slice(0,10),responsable:'Joel',pais:c.pais||'Paraguay'}])
    fetchData();fetchAll();toast(`${tipo==='hosting'?'Hosting':'Energía'} pagado ✓`,'success')
  }
  async function delCliente(id){
    await supabase.from('clientes').delete().eq('id',id);fetchAll();fetchData();toast('Eliminado','info')
  }

  const panel={background:'rgba(14,14,22,0.8)',backdropFilter:'blur(20px)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:12,overflow:'hidden'}
  const panelHdr={display:'flex',alignItems:'center',justifyContent:'space-between',padding:'13px 18px',borderBottom:'1px solid rgba(255,255,255,0.06)',background:'rgba(255,255,255,0.015)'}
  const btnS=(t)=>({display:'inline-flex',alignItems:'center',gap:6,padding:'7px 14px',borderRadius:8,border:'none',cursor:'pointer',fontFamily:'Inter,sans-serif',fontSize:11,fontWeight:600,transition:'all .2s',background:t==='gold'?'linear-gradient(135deg,#d4a843,#e8b84b)':t==='green'?'rgba(16,185,129,0.12)':'rgba(255,255,255,0.06)',color:t==='gold'?'#000':t==='green'?'#10b981':'#f0f0f8',border:t==='green'?'1px solid rgba(16,185,129,0.25)':'1px solid rgba(255,255,255,0.06)'})
  const fInput={width:'100%',background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.11)',borderRadius:8,padding:'10px 13px',color:'#f0f0f8',fontFamily:'Inter,sans-serif',fontSize:12,outline:'none',boxSizing:'border-box'}
  const fLabel={display:'block',fontSize:9,letterSpacing:'.15em',textTransform:'uppercase',color:'#40405a',marginBottom:6,fontWeight:600}
  const num={fontFamily:'monospace',fontWeight:700}

  if(loading)return <div style={{padding:40,textAlign:'center',color:'#40405a',fontSize:11}}>Cargando clientes...</div>

  return(
    <div>
      {(alertasVencidas.length>0||alertasProximas.length>0)&&(
        <div style={{marginBottom:14,display:'flex',flexDirection:'column',gap:8}}>
          {alertasVencidas.length>0&&<div style={{background:'rgba(244,63,94,0.08)',border:'1px solid rgba(244,63,94,0.25)',borderRadius:10,padding:'10px 16px',display:'flex',alignItems:'center',gap:10}}>
            <span>🔴</span><div><div style={{fontSize:10,fontWeight:600,color:'#f43f5e'}}>COBROS VENCIDOS</div><div style={{fontSize:9,color:'#808098',marginTop:2}}>{alertasVencidas.map(c=>c.nombre).join(', ')}</div></div>
          </div>}
          {alertasProximas.length>0&&<div style={{background:'rgba(245,158,11,0.08)',border:'1px solid rgba(245,158,11,0.25)',borderRadius:10,padding:'10px 16px',display:'flex',alignItems:'center',gap:10}}>
            <span>🟡</span><div><div style={{fontSize:10,fontWeight:600,color:'#f59e0b'}}>COBROS PRÓXIMOS (5 días)</div><div style={{fontSize:9,color:'#808098',marginTop:2}}>{alertasProximas.map(c=>`${c.nombre} (${getDiasAlCobro(c)}d)`).join(', ')}</div></div>
          </div>}
        </div>
      )}

      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
        <div style={{display:'flex',gap:4,background:'rgba(255,255,255,0.03)',padding:4,borderRadius:10}}>
          {[['lista','👥 Clientes'],['pagos','💰 Pagos'],['alertas','🔔 Alertas']].map(([t,l])=>(
            <button key={t} onClick={()=>setTab(t)} style={{background:tab===t?'rgba(212,168,67,0.1)':'none',border:'none',cursor:'pointer',fontFamily:'Inter,sans-serif',fontSize:11,fontWeight:600,padding:'7px 14px',borderRadius:8,color:tab===t?'#f0c060':'#808098'}}>
              {l}{t==='alertas'&&(alertasProximas.length+alertasVencidas.length)>0&&<span style={{marginLeft:5,background:'#f43f5e',color:'#fff',fontSize:8,padding:'1px 5px',borderRadius:10}}>{alertasProximas.length+alertasVencidas.length}</span>}
            </button>
          ))}
        </div>
        <button style={btnS('gold')} onClick={()=>setModal('cliente')}>+ Nuevo cliente</button>
      </div>

      {tab==='lista'&&<div style={{display:'flex',flexDirection:'column',gap:10}}>
        {clientes.map(c=>{
          const eqs=getClienteEquipos(c.id)
          const dias=getDiasAlCobro(c)
          const estHost=getEstadoPago(c.id,'hosting')
          const estEn=getEstadoPago(c.id,'energia')
          const proximo=c.dia_cobro?getProximoCobro(c.dia_cobro):null
          const urgente=dias!==null&&dias<=5&&dias>=0
          const vencido=dias!==null&&dias<0
          return(
            <div key={c.id} style={{...panel,border:`1px solid ${vencido&&estHost!=='pagado'?'rgba(244,63,94,0.3)':urgente&&estHost!=='pagado'?'rgba(245,158,11,0.2)':'rgba(255,255,255,0.06)'}`}}>
              <div style={{display:'flex',alignItems:'center',gap:12,padding:'14px 16px',borderBottom:'1px solid rgba(255,255,255,0.06)'}}>
                <div style={{width:36,height:36,borderRadius:'50%',background:'linear-gradient(135deg,rgba(212,168,67,0.5),#d4a843)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700,color:'#000',flexShrink:0}}>{c.nombre.split(' ').map(x=>x[0]).join('').substring(0,2).toUpperCase()}</div>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:700}}>{c.nombre}</div>
                  <div style={{fontSize:9,color:'#40405a',marginTop:2}}>{c.contacto} · {c.pais} · {c.unidades_asic} ASICs</div>
                </div>
                {proximo&&<div style={{textAlign:'center',padding:'0 12px',borderLeft:'1px solid rgba(255,255,255,0.06)'}}>
                  <div style={{fontSize:8,color:'#40405a',marginBottom:3,textTransform:'uppercase'}}>Próximo cobro</div>
                  <div style={{...num,fontSize:11,color:vencido?'#f43f5e':urgente?'#f59e0b':'#f0f0f8'}}>{proximo}</div>
                  <div style={{fontSize:8,marginTop:2,color:vencido?'#f43f5e':urgente?'#f59e0b':'#40405a'}}>{vencido?`Vencido ${Math.abs(dias)}d`:dias===0?'Hoy':`En ${dias}d`}</div>
                </div>}
                <div style={{textAlign:'right',padding:'0 12px',borderLeft:'1px solid rgba(255,255,255,0.06)'}}>
                  <div style={{...num,fontSize:16,color:'#f0c060'}}>${Number(c.tarifa_mensual||0).toLocaleString()}</div>
                  <div style={{fontSize:8,color:'#40405a'}}>hosting/mes</div>
                  {c.costo_energia>0&&<div style={{fontSize:9,color:'#40405a',marginTop:2}}>${Number(c.costo_energia||0).toLocaleString()} energía</div>}
                </div>
                <button style={{...btnS('ghost'),padding:'5px 8px',fontSize:9,color:'#f43f5e',border:'none',background:'none',cursor:'pointer'}} onClick={()=>delCliente(c.id)}>🗑</button>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr'}}>
                <div style={{padding:'12px 16px',borderRight:'1px solid rgba(255,255,255,0.06)'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                    <span style={{fontSize:9,color:'#40405a',textTransform:'uppercase',fontWeight:600}}>⛏ Equipos</span>
                    <button style={{...btnS('ghost'),padding:'3px 8px',fontSize:9}} onClick={()=>{setSelected(c);setModal('equipo')}}>+ Asignar</button>
                  </div>
                  {eqs.length===0&&<div style={{fontSize:9,color:'#40405a',fontStyle:'italic'}}>Sin equipos</div>}
                  {eqs.map(eq=>(
                    <div key={eq.id} style={{display:'flex',alignItems:'center',gap:6,marginBottom:5,padding:'5px 8px',background:'rgba(255,255,255,0.03)',borderRadius:6}}>
                      <span style={{width:5,height:5,borderRadius:'50%',background:eq.estado==='activo'?'#10b981':'#f59e0b',flexShrink:0}}/>
                      <span style={{flex:1,fontSize:10,fontWeight:500}}>{eq.modelo}</span>
                      <span style={{...num,fontSize:9,color:'#f0c060'}}>{eq.hashrate}TH</span>
                      <button style={{background:'none',border:'none',cursor:'pointer',color:'#40405a',fontSize:11}} onClick={()=>desasignarEquipo(c.id,eq.id)}>×</button>
                    </div>
                  ))}
                </div>
                <div style={{padding:'12px 16px',borderRight:'1px solid rgba(255,255,255,0.06)'}}>
                  <div style={{fontSize:9,color:'#40405a',textTransform:'uppercase',fontWeight:600,marginBottom:8}}>💳 Hosting — {getPeriodo()}</div>
                  <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
                    <span style={{fontSize:16,padding:'6px 10px',background:estHost==='pagado'?'rgba(16,185,129,0.1)':'rgba(244,63,94,0.08)',borderRadius:8,border:`1px solid ${estHost==='pagado'?'rgba(16,185,129,0.2)':'rgba(244,63,94,0.15)'}`}}>{estHost==='pagado'?'✅':'⏳'}</span>
                    <div><div style={{fontSize:11,fontWeight:600,color:estHost==='pagado'?'#10b981':'#f43f5e'}}>{estHost==='pagado'?'Pagado':'Pendiente'}</div><div style={{...num,fontSize:10,color:'#f0c060'}}>${Number(c.tarifa_mensual||0).toLocaleString()}</div></div>
                  </div>
                  {estHost!=='pagado'&&<button style={btnS('green')} onClick={()=>marcarPagado(c,'hosting')}>✓ Marcar pagado</button>}
                </div>
                <div style={{padding:'12px 16px'}}>
                  <div style={{fontSize:9,color:'#40405a',textTransform:'uppercase',fontWeight:600,marginBottom:8}}>⚡ Energía — {getPeriodo()}</div>
                  {Number(c.costo_energia||0)>0?(
                    <>
                      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
                        <span style={{fontSize:16,padding:'6px 10px',background:estEn==='pagado'?'rgba(16,185,129,0.1)':'rgba(245,158,11,0.08)',borderRadius:8,border:`1px solid ${estEn==='pagado'?'rgba(16,185,129,0.2)':'rgba(245,158,11,0.2)'}`}}>{estEn==='pagado'?'✅':'⚡'}</span>
                        <div><div style={{fontSize:11,fontWeight:600,color:estEn==='pagado'?'#10b981':'#f59e0b'}}>{estEn==='pagado'?'Pagado':'Pendiente'}</div><div style={{...num,fontSize:10,color:'#f0c060'}}>${Number(c.costo_energia||0).toLocaleString()}</div></div>
                      </div>
                      {estEn!=='pagado'&&<button style={{...btnS('ghost'),border:'1px solid rgba(245,158,11,0.3)',color:'#f59e0b'}} onClick={()=>marcarPagado(c,'energia')}>✓ Marcar pagado</button>}
                    </>
                  ):<div style={{fontSize:9,color:'#40405a',fontStyle:'italic'}}>Sin costo de energía</div>}
                </div>
              </div>
              {c.fecha_vence_contrato&&<div style={{padding:'8px 16px',borderTop:'1px solid rgba(255,255,255,0.06)',background:'rgba(255,255,255,0.01)',display:'flex',alignItems:'center',gap:8}}>
                <span style={{fontSize:9,color:'#40405a'}}>📄 Contrato vence:</span>
                <span style={{...num,fontSize:9,color:Math.round((new Date(c.fecha_vence_contrato)-new Date())/864e5)<30?'#f59e0b':'#808098'}}>{c.fecha_vence_contrato}</span>
                {c.notas&&<span style={{marginLeft:8,fontSize:8,color:'#40405a',fontStyle:'italic'}}>📝 {c.notas}</span>}
              </div>}
            </div>
          )
        })}
        {!clientes.length&&<div style={{...panel,padding:40,color:'#40405a',textAlign:'center',fontSize:11,textTransform:'uppercase'}}>Sin clientes registrados</div>}
      </div>}

      {tab==='pagos'&&<div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10,marginBottom:14}}>
          {[
            {label:'Hosting cobrado este mes',val:'$'+pagos.filter(p=>p.tipo==='hosting'&&p.estado==='pagado'&&p.periodo===getPeriodo()).reduce((a,b)=>a+Number(b.monto),0).toLocaleString(),color:'#10b981'},
            {label:'Energía cobrada este mes',val:'$'+pagos.filter(p=>p.tipo==='energia'&&p.estado==='pagado'&&p.periodo===getPeriodo()).reduce((a,b)=>a+Number(b.monto),0).toLocaleString(),color:'#f59e0b'},
            {label:'Pendiente de cobro',val:'$'+totalPorCobrar.toLocaleString(),color:'#f43f5e'},
          ].map(s=>(
            <div key={s.label} style={{background:'rgba(14,14,22,0.8)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:12,padding:'12px 16px'}}>
              <div style={{fontSize:8,color:'#40405a',textTransform:'uppercase',marginBottom:6}}>{s.label}</div>
              <div style={{...num,fontSize:18,color:s.color}}>{s.val}</div>
            </div>
          ))}
        </div>
        <div style={panel}>
          <div style={panelHdr}><span style={{fontSize:9,color:'#808098',textTransform:'uppercase',fontWeight:600}}>Historial de pagos</span></div>
          {pagos.slice(0,20).map(p=>{
            const c=clientes.find(c=>c.id===p.cliente_id)
            return(<div key={p.id} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 16px',borderBottom:'1px solid rgba(255,255,255,0.06)'}}>
              <span style={{width:6,height:6,borderRadius:'50%',background:p.tipo==='hosting'?'#6366f1':'#f59e0b',flexShrink:0}}/>
              <div style={{flex:1}}><div style={{fontSize:10,fontWeight:600}}>{c?.nombre||'—'}</div><div style={{fontSize:8,color:'#40405a'}}>{p.tipo==='hosting'?'Hosting':'Energía'} · {p.periodo}</div></div>
              <span style={{fontSize:8,color:'#40405a'}}>{p.fecha_pago}</span>
              <span style={{fontSize:8,padding:'2px 8px',borderRadius:10,background:p.estado==='pagado'?'rgba(16,185,129,0.1)':'rgba(244,63,94,0.1)',color:p.estado==='pagado'?'#10b981':'#f43f5e'}}>{p.estado}</span>
              <span style={{...num,fontSize:11,color:'#f0c060'}}>${Number(p.monto).toLocaleString()}</span>
            </div>)
          })}
          {!pagos.length&&<div style={{padding:40,color:'#40405a',textAlign:'center',fontSize:11}}>Sin historial</div>}
        </div>
      </div>}

      {tab==='alertas'&&<div style={{display:'flex',flexDirection:'column',gap:10}}>
        {[...alertasVencidas,...alertasProximas].map(c=>{
          const dias=getDiasAlCobro(c)
          return(<div key={c.id} style={{...panel,border:`1px solid ${dias<0?'rgba(244,63,94,0.3)':'rgba(245,158,11,0.3)'}`}}>
            <div style={{display:'flex',alignItems:'center',gap:12,padding:'14px 16px'}}>
              <span style={{fontSize:24}}>{dias<0?'🔴':'🟡'}</span>
              <div style={{flex:1}}><div style={{fontSize:13,fontWeight:700}}>{c.nombre}</div><div style={{fontSize:9,color:'#40405a',marginTop:2}}>Día de cobro: {c.dia_cobro} de cada mes</div></div>
              <div style={{textAlign:'right'}}><div style={{...num,fontSize:16,color:dias<0?'#f43f5e':'#f59e0b'}}>{dias<0?`${Math.abs(dias)}d vencido`:`${dias}d para cobrar`}</div><div style={{...num,fontSize:13,color:'#f0c060',marginTop:4}}>${Number(c.tarifa_mensual||0).toLocaleString()}</div></div>
            </div>
            <div style={{display:'flex',gap:8,padding:'10px 16px',borderTop:'1px solid rgba(255,255,255,0.06)'}}>
              {getEstadoPago(c.id,'hosting')!=='pagado'&&<button style={btnS('green')} onClick={()=>marcarPagado(c,'hosting')}>✓ Hosting pagado</button>}
              {Number(c.costo_energia||0)>0&&getEstadoPago(c.id,'energia')!=='pagado'&&<button style={{...btnS('ghost'),border:'1px solid rgba(245,158,11,0.3)',color:'#f59e0b'}} onClick={()=>marcarPagado(c,'energia')}>✓ Energía pagada</button>}
            </div>
          </div>)
        })}
        {alertasProximas.length===0&&alertasVencidas.length===0&&<div style={{...panel,padding:40,color:'#10b981',textAlign:'center',fontSize:12}}>✓ Sin alertas — todo al día</div>}
      </div>}

      {modal&&<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.85)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',backdropFilter:'blur(6px)',padding:16}} onClick={e=>{if(e.target===e.currentTarget){setModal(null);setForm({});setSelected(null)}}}>
        <div style={{background:'linear-gradient(135deg,rgba(16,16,26,0.99),rgba(12,12,20,0.99))',border:'1px solid rgba(255,255,255,0.11)',borderRadius:16,width:'100%',maxWidth:500,maxHeight:'90vh',overflowY:'auto',boxShadow:'0 32px 80px rgba(0,0,0,0.7)'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'16px 20px',borderBottom:'1px solid rgba(255,255,255,0.06)'}}>
            <div style={{fontFamily:'monospace',fontSize:11,fontWeight:700,letterSpacing:'.08em'}}>{modal==='cliente'?'NUEVO CLIENTE':'ASIGNAR EQUIPO'}</div>
            <button style={{background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.06)',color:'#808098',width:28,height:28,borderRadius:6,cursor:'pointer',fontSize:16,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={()=>{setModal(null);setForm({});setSelected(null)}}>×</button>
          </div>
          <div style={{padding:18}}>
            {modal==='cliente'&&<>
              <div style={{marginBottom:12}}><label style={fLabel}>Nombre</label><input style={fInput} placeholder="Carlos Reyes" value={form.nombre||''} onChange={e=>setForm({...form,nombre:e.target.value})}/></div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:12}}>
                <div><label style={fLabel}>Contacto</label><input style={fInput} placeholder="+595 9..." value={form.contacto||''} onChange={e=>setForm({...form,contacto:e.target.value})}/></div>
                <div><label style={fLabel}>País</label><select style={fInput} value={form.pais||'Paraguay'} onChange={e=>setForm({...form,pais:e.target.value})}><option>Paraguay</option><option>Bolivia</option><option>Argentina</option><option>Otro</option></select></div>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10,marginBottom:12}}>
                <div><label style={fLabel}>ASICs</label><input style={fInput} type="number" placeholder="3" value={form.unidades_asic||''} onChange={e=>setForm({...form,unidades_asic:e.target.value})}/></div>
                <div><label style={fLabel}>Hosting (USD)</label><input style={fInput} type="number" placeholder="420" value={form.tarifa_mensual||''} onChange={e=>setForm({...form,tarifa_mensual:e.target.value})}/></div>
                <div><label style={fLabel}>Energía (USD)</label><input style={fInput} type="number" placeholder="150" value={form.costo_energia||''} onChange={e=>setForm({...form,costo_energia:e.target.value})}/></div>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10,marginBottom:12}}>
                <div><label style={fLabel}>Día de cobro</label><input style={fInput} type="number" min="1" max="31" placeholder="15" value={form.dia_cobro||''} onChange={e=>setForm({...form,dia_cobro:e.target.value})}/></div>
                <div><label style={fLabel}>Inicio contrato</label><input style={fInput} type="date" value={form.fecha_inicio||''} onChange={e=>setForm({...form,fecha_inicio:e.target.value})}/></div>
                <div><label style={fLabel}>Vence contrato</label><input style={fInput} type="date" value={form.fecha_vence_contrato||''} onChange={e=>setForm({...form,fecha_vence_contrato:e.target.value})}/></div>
              </div>
              <div style={{marginBottom:12}}><label style={fLabel}>Notas</label><input style={fInput} placeholder="Observaciones..." value={form.notas||''} onChange={e=>setForm({...form,notas:e.target.value})}/></div>
              <div style={{display:'flex',gap:8,justifyContent:'flex-end',paddingTop:14,borderTop:'1px solid rgba(255,255,255,0.06)'}}>
                <button style={btnS('ghost')} onClick={()=>{setModal(null);setForm({})}}>Cancelar</button>
                <button style={btnS('gold')} onClick={addCliente}>✓ Guardar</button>
              </div>
            </>}
            {modal==='equipo'&&<>
              <div style={{marginBottom:12}}>
                <div style={{fontSize:11,color:'#808098',marginBottom:12}}>Asignando a: <strong style={{color:'#f0f0f8'}}>{selected?.nombre}</strong></div>
                <label style={fLabel}>Equipo</label>
                <select style={fInput} value={form.equipo_id||''} onChange={e=>setForm({...form,equipo_id:e.target.value})}>
                  <option value="">— Seleccioná —</option>
                  {equipos.map(eq=><option key={eq.id} value={eq.id}>{eq.modelo} — {eq.hashrate}TH ({eq.estado})</option>)}
                </select>
              </div>
              <div style={{display:'flex',gap:8,justifyContent:'flex-end',paddingTop:14,borderTop:'1px solid rgba(255,255,255,0.06)'}}>
                <button style={btnS('ghost')} onClick={()=>{setModal(null);setForm({});setSelected(null)}}>Cancelar</button>
                <button style={btnS('gold')} onClick={asignarEquipo}>✓ Asignar</button>
              </div>
            </>}
          </div>
        </div>
      </div>}
    </div>
  )
}

export default function App(){
  const[page,setPage]=useState('dashboard')
  const[clientes,setClientes]=useState([])
  const[equipos,setEquipos]=useState([])
  const[finanzas,setFinanzas]=useState([])
  const[alertas,setAlertas]=useState([])
  const[tareas,setTareas]=useState([])
  const[cuentasPorCobrar,setCuentasPorCobrar]=useState([])
  const[presupuestos,setPresupuestos]=useState([])
  const[loading,setLoading]=useState(true)
  const[modal,setModal]=useState(null)
  const[form,setForm]=useState({})
  const[btc,setBtc]=useState(null)
  const[focus,setFocus]=useState(false)
  const[toasts,setToasts]=useState([])
  const[logoOk,setLogoOk]=useState(true)
  const[sideOpen,setSideOpen]=useState(false)
  const[contabFilter,setContabFilter]=useState({tipo:'all',responsable:'all',moneda:'all',periodo:'all'})
  const[contabTab,setContabTab]=useState('movimientos')

  useEffect(()=>{fetchAll()},[])
  useEffect(()=>{fetchBTC();const t=setInterval(fetchBTC,60000);return()=>clearInterval(t)},[])

  async function fetchAll(){
    setLoading(true)
    const[c,e,f,a,t,cpc,p]=await Promise.all([
      supabase.from('clientes').select('*').order('creado_en',{ascending:false}),
      supabase.from('equipos').select('*').order('creado_en',{ascending:false}),
      supabase.from('finanzas').select('*').order('fecha',{ascending:false}),
      supabase.from('alertas_energia').select('*').order('fecha_vence'),
      supabase.from('tareas').select('*').order('creado_en',{ascending:false}),
      supabase.from('cuentas_por_cobrar').select('*').order('fecha_vence',{ascending:true}),
      supabase.from('presupuestos').select('*').order('mes',{ascending:false}),
    ])
    setClientes(c.data||[]);setEquipos(e.data||[]);setFinanzas(f.data||[]);setAlertas(a.data||[]);setTareas(t.data||[])
    setCuentasPorCobrar(cpc.data||[]);setPresupuestos(p.data||[])
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

  // Finance calculations
  const finanzasUSD=finanzas.map(f=>({...f,montoUSD:toUSD(f.monto,f.moneda||'USD')}))
  const ing=finanzasUSD.filter(f=>f.tipo==='ingreso').reduce((a,b)=>a+b.montoUSD,0)
  const gst=finanzasUSD.filter(f=>f.tipo==='gasto').reduce((a,b)=>a+b.montoUSD,0)
  const net=ing-gst
  const activeEq=equipos.filter(e=>e.estado==='activo').length
  const totalHash=equipos.filter(e=>e.estado!=='inactivo').reduce((a,b)=>a+Number(b.hashrate||0),0)

  // Gastos por responsable
  const gastoAllan=finanzasUSD.filter(f=>f.tipo==='gasto'&&f.responsable==='Allan').reduce((a,b)=>a+b.montoUSD,0)
  const gastoJoel=finanzasUSD.filter(f=>f.tipo==='gasto'&&f.responsable==='Joel').reduce((a,b)=>a+b.montoUSD,0)

  // Cuentas por cobrar
  const totalPorCobrar=cuentasPorCobrar.filter(c=>c.estado!=='pagado').reduce((a,b)=>a+Number(b.monto||0),0)
  const vencidasCPC=cuentasPorCobrar.filter(c=>c.estado!=='pagado'&&daysUntil(c.fecha_vence)<0).length

  // Presupuesto del mes actual
  const mesActual=new Date().toISOString().slice(0,7)
  const presupuestoMes=presupuestos.find(p=>p.mes===mesActual)
  const gastoMes=finanzasUSD.filter(f=>{
    const fm=f.fecha?.slice(0,7)
    return f.tipo==='gasto'&&fm===mesActual
  }).reduce((a,b)=>a+b.montoUSD,0)
  const presupuestoPct=presupuestoMes?Math.min(100,Math.round((gastoMes/(presupuestoMes.monto||1))*100)):null

  // Filtered finanzas
  const finanzasFiltradas=finanzas.filter(f=>{
    if(contabFilter.tipo!=='all'&&f.tipo!==contabFilter.tipo)return false
    if(contabFilter.responsable!=='all'&&f.responsable!==contabFilter.responsable)return false
    if(contabFilter.moneda!=='all'&&(f.moneda||'USD')!==contabFilter.moneda)return false
    if(contabFilter.periodo!=='all'){
      const hoy=new Date()
      const fecha=new Date(f.fecha)
      if(contabFilter.periodo==='7d'&&(hoy-fecha)>7*864e5)return false
      if(contabFilter.periodo==='30d'&&(hoy-fecha)>30*864e5)return false
      if(contabFilter.periodo==='mes'&&f.fecha?.slice(0,7)!==mesActual)return false
    }
    return true
  })

  // CRUD operations
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
    await supabase.from('finanzas').insert([{
      tipo:form.tipo||'ingreso',
      monto:Number(form.monto),
      moneda:form.moneda||'USD',
      descripcion:form.descripcion,
      categoria:form.categoria||'Otro',
      fecha:form.fecha||new Date().toISOString().slice(0,10),
      responsable:form.responsable||'Joel',
      pais:form.pais||'Paraguay',
      notas:form.notas||''
    }])
    setModal(null);setForm({});fetchAll();toast('Movimiento registrado ✓','success')
  }
  async function addCuentaPorCobrar(){
    if(!form.cliente_nombre||!form.monto||!form.fecha_vence){toast('Completá los campos','error');return}
    await supabase.from('cuentas_por_cobrar').insert([{
      cliente_nombre:form.cliente_nombre,
      concepto:form.concepto||'Hosting mensual',
      monto:Number(form.monto),
      moneda:form.moneda||'USD',
      fecha_emision:new Date().toISOString().slice(0,10),
      fecha_vence:form.fecha_vence,
      estado:'pendiente'
    }])
    setModal(null);setForm({});fetchAll();toast('Cuenta por cobrar creada ✓','success')
  }
  async function addPresupuesto(){
    if(!form.monto){toast('Ingresá el monto','error');return}
    const mes=form.mes||mesActual
    await supabase.from('presupuestos').upsert([{mes,monto:Number(form.monto),notas:form.notas||''}],{onConflict:'mes'})
    setModal(null);setForm({});fetchAll();toast('Presupuesto guardado ✓','success')
  }
  async function marcarCobrada(cpc){
    await supabase.from('cuentas_por_cobrar').update({estado:'pagado'}).eq('id',cpc.id)
    await supabase.from('finanzas').insert([{tipo:'ingreso',monto:cpc.monto,moneda:cpc.moneda||'USD',descripcion:`Cobro: ${cpc.concepto} — ${cpc.cliente_nombre}`,categoria:'Hosting',fecha:new Date().toISOString().slice(0,10),responsable:'Joel',pais:'Paraguay'}])
    fetchAll();toast('Cobro registrado ✓','success')
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
    await supabase.from('finanzas').insert([{tipo:'ingreso',monto:Number(a.monto),moneda:'USD',descripcion:'Pago energía',categoria:'Energía',fecha:new Date().toISOString().slice(0,10),responsable:'Joel',pais:'Paraguay'}])
    await supabase.from('alertas_energia').delete().eq('id',a.id)
    fetchAll();toast('Pago registrado ✓','success')
  }

  // Export CSV
  function exportCSV(){
    const rows=[['Fecha','Tipo','Descripcion','Monto','Moneda','Monto_USD','Categoria','Responsable','Pais']]
    finanzasFiltradas.forEach(f=>{
      rows.push([f.fecha,f.tipo,`"${f.descripcion}"`,f.monto,f.moneda||'USD',toUSD(f.monto,f.moneda||'USD').toFixed(2),f.categoria,f.responsable||'',f.pais||''])
    })
    const csv=rows.map(r=>r.join(',')).join('\n')
    const blob=new Blob([csv],{type:'text/csv'})
    const url=URL.createObjectURL(blob)
    const a=document.createElement('a')
    a.href=url;a.download=`neurahash_finanzas_${mesActual}.csv`;a.click()
    toast('Exportado ✓','success')
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

  const btn=(t)=>({display:'inline-flex',alignItems:'center',gap:6,padding:'9px 16px',borderRadius:8,border:'none',cursor:'pointer',fontFamily:'Inter,sans-serif',fontSize:11,fontWeight:600,letterSpacing:'.03em',transition:'all .2s',background:t==='gold'?`linear-gradient(135deg,#d4a843,#e8b84b)`:t==='ghost'?'rgba(255,255,255,0.06)':t==='blue'?'rgba(99,102,241,0.15)':'transparent',color:t==='gold'?'#000':t==='ghost'?C.t1:t==='blue'?C.blue:C.red,boxShadow:t==='gold'?'0 0 20px rgba(212,168,67,0.25)':'none'})
  const panel={background:'rgba(14,14,22,0.8)',backdropFilter:'blur(20px)',border:`1px solid ${C.border}`,borderRadius:12,overflow:'hidden'}
  const panelHdr={display:'flex',alignItems:'center',justifyContent:'space-between',padding:'13px 18px',borderBottom:`1px solid ${C.border}`,background:'rgba(255,255,255,0.015)'}
  const fInput={width:'100%',background:'rgba(255,255,255,0.04)',border:`1px solid ${C.border2}`,borderRadius:8,padding:'11px 14px',color:C.t1,fontFamily:'Inter,sans-serif',fontSize:12,outline:'none',boxSizing:'border-box'}
  const fLabel={display:'block',fontSize:9,letterSpacing:'.15em',textTransform:'uppercase',color:C.t3,marginBottom:7,fontWeight:600}
  const tag=(c)=>({fontSize:8,padding:'3px 8px',borderRadius:20,textTransform:'uppercase',fontWeight:600,background:c==='urg'?'rgba(244,63,94,0.12)':c==='ops'?'rgba(99,102,241,0.12)':'rgba(212,168,67,0.12)',color:c==='urg'?C.red:c==='ops'?C.blue:C.gold2,border:`1px solid ${c==='urg'?'rgba(244,63,94,0.2)':c==='ops'?'rgba(99,102,241,0.2)':'rgba(212,168,67,0.2)'}`})

  const filterBtn=(active)=>({...btn(active?'gold':'ghost'),padding:'6px 12px',fontSize:10,border:active?'none':`1px solid ${C.border}`})

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
        .tab-btn{background:none;border:none;cursor:pointer;font-family:Inter,sans-serif;font-size:11px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;padding:8px 14px;border-radius:8px;transition:all .15s;}
        .tab-btn.active{background:rgba(212,168,67,0.1);color:#f0c060;}
        .tab-btn:not(.active){color:#808098;}
        .tab-btn:hover:not(.active){background:rgba(255,255,255,0.04);color:#f0f0f8;}
        input[type=date]::-webkit-calendar-picker-indicator{filter:invert(1);opacity:.4;}
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
          .contab-filters{flex-wrap:wrap!important;}
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
              <div style={{fontFamily:'monospace',fontSize:12,fontWeight:700,letterSpacing:'.08em'}}>{({dashboard:'PANEL GENERAL',equipos:'EQUIPOS',clientes:'CLIENTES',contabilidad:'CONTABILIDAD',energia:'ENERGÍA',tareas:'TAREAS',ia:'ASISTENTE IA'})[page]}</div>
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

          {/* ─── DASHBOARD ─── */}
          {page==='dashboard'&&<div className="page">
            <div className="stat-grid" style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,marginBottom:14}}>
              {[
                {label:'Equipos Activos',val:activeEq,sub:`de ${equipos.length} totales`,color:C.green,icon:'⛏'},
                {label:'Hashrate Total',val:totalHash+'TH',sub:'combinado',color:C.gold,icon:'₿'},
                {label:'Por Cobrar',val:money(totalPorCobrar),sub:`${vencidasCPC} vencidas`,color:vencidasCPC>0?C.red:C.blue,icon:'💰'},
                {label:'Alertas Energía',val:alertas.length,sub:'pendientes',color:C.red,icon:'⚡'},
              ].map(s=>(
                <div key={s.label} className="stat-card" style={{background:'linear-gradient(135deg,rgba(22,22,34,0.9),rgba(14,14,20,0.9))',backdropFilter:'blur(20px)',border:`1px solid ${C.border}`,borderRadius:12,padding:'12px 14px',position:'relative',overflow:'hidden',transition:'transform .2s'}}>
                  <div style={{position:'absolute',top:-25,right:-25,width:70,height:70,borderRadius:'50%',background:s.color,filter:'blur(25px)',opacity:.2,pointerEvents:'none'}}/>
                  <div style={{fontSize:8,letterSpacing:'.1em',color:C.t3,textTransform:'uppercase',fontWeight:600,marginBottom:6}}>{s.label}</div>
                  <div style={{...num,fontSize:20,color:s.color,filter:F}}>{s.val}</div>
                  <div style={{fontSize:8,color:C.t3,marginTop:3}}>{s.sub}</div>
                  <div style={{position:'absolute',right:8,bottom:6,fontSize:20,opacity:.07}}>{s.icon}</div>
                </div>
              ))}
            </div>

            {/* Presupuesto del mes */}
            {presupuestoMes&&<div style={{background:'rgba(14,14,22,0.8)',border:`1px solid ${C.border}`,borderRadius:12,padding:'12px 16px',marginBottom:12}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                <span style={{fontSize:9,color:C.t2,textTransform:'uppercase',letterSpacing:'.1em',fontWeight:600}}>💰 Presupuesto {mesActual}</span>
                <span style={{...num,fontSize:11,color:presupuestoPct>90?C.red:presupuestoPct>70?C.amber:C.green}}>{presupuestoPct}% usado</span>
              </div>
              <div style={{height:6,background:'rgba(255,255,255,0.06)',borderRadius:3,overflow:'hidden'}}>
                <div style={{height:'100%',width:`${presupuestoPct}%`,background:presupuestoPct>90?C.red:presupuestoPct>70?C.amber:C.green,borderRadius:3,transition:'width .5s ease'}}/>
              </div>
              <div style={{display:'flex',justifyContent:'space-between',marginTop:6,fontSize:9,color:C.t3}}>
                <span>Gastado: <span style={{color:C.t1,fontFamily:'monospace'}}>{money(gastoMes)}</span></span>
                <span>Presupuesto: <span style={{color:C.t1,fontFamily:'monospace'}}>{money(presupuestoMes.monto)}</span></span>
              </div>
            </div>}

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
                  <span style={{fontSize:9,letterSpacing:'.1em',textTransform:'uppercase',color:C.t2,fontWeight:600}}>📋 Cuentas por Cobrar</span>
                  <button style={{fontSize:9,color:'rgba(212,168,67,0.6)',cursor:'pointer',background:'none',border:'none',fontFamily:'Inter,sans-serif',fontWeight:600}} onClick={()=>{navigate('contabilidad');setContabTab('cobrar')}}>Ver →</button>
                </div>
                {cuentasPorCobrar.filter(c=>c.estado!=='pagado').slice(0,4).map(cpc=>{
                  const d=daysUntil(cpc.fecha_vence)
                  return(
                    <div key={cpc.id} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 14px',borderBottom:`1px solid ${C.border}`}}>
                      <span style={{width:6,height:6,borderRadius:'50%',background:d<0?C.red:d<7?C.amber:C.blue,flexShrink:0}}/>
                      <span style={{flex:1,fontSize:10,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{cpc.cliente_nombre}</span>
                      <span style={{fontSize:8,color:d<0?C.red:C.t3}}>{d<0?`${Math.abs(d)}d venc.`:`${d}d`}</span>
                      <span style={{...num,fontSize:10,color:C.gold2,filter:F}}>{money(cpc.monto,cpc.moneda||'USD')}</span>
                    </div>
                  )
                })}
                {!cuentasPorCobrar.filter(c=>c.estado!=='pagado').length&&<div style={{padding:24,color:C.green,textAlign:'center',fontSize:11}}>✓ Todo cobrado</div>}
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
                  <div style={{display:'flex',justifyContent:'space-between',padding:'8px 0',borderBottom:`1px solid ${C.border}`}}>
                    <span style={{fontSize:9,color:C.t3}}>Allan</span>
                    <span style={{...num,fontSize:10,color:C.red,filter:F}}>-{money(gastoAllan)}</span>
                  </div>
                  <div style={{display:'flex',justifyContent:'space-between',padding:'8px 0'}}>
                    <span style={{fontSize:9,color:C.t3}}>Joel</span>
                    <span style={{...num,fontSize:10,color:C.red,filter:F}}>-{money(gastoJoel)}</span>
                  </div>
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

          {/* ─── EQUIPOS ─── */}
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
                  <button style={{...btn('ghost'),padding:'5px 10px',fontSize:10,color:C.red}} onClick={()=>del('equipos',e.id)}>🗑 Eliminar</button>
                </div>
              ))}
              {!equipos.length&&<div style={{gridColumn:'span 3',padding:40,color:C.t3,textAlign:'center',fontSize:11,textTransform:'uppercase'}}>Sin equipos registrados</div>}
            </div>
          </div>}

          {/* ─── CLIENTES ─── */}
          {page==='clientes'&&<div className="page">
            <ClientesInline equipos={equipos} fetchAll={fetchAll} toast={toast} clientes={clientes}/>
          </div>}

          {/* ─── CONTABILIDAD ─── */}
          {page==='contabilidad'&&<div className="page">

            {/* KPI Row */}
            <div className="stat-grid" style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,marginBottom:14}}>
              {[
                {label:'Balance Neto',val:money(net),color:net>=0?C.green:C.red},
                {label:'Ingresos Totales',val:money(ing),color:C.green},
                {label:'Gastos Totales',val:money(gst),color:C.red},
                {label:'Por Cobrar',val:money(totalPorCobrar),color:C.blue},
              ].map(s=>(
                <div key={s.label} style={{background:'rgba(14,14,22,0.8)',border:`1px solid ${C.border}`,borderRadius:12,padding:'12px 16px'}}>
                  <div style={{fontSize:8,color:C.t3,textTransform:'uppercase',letterSpacing:'.1em',marginBottom:6}}>{s.label}</div>
                  <div style={{...num,fontSize:18,color:s.color,filter:F}}>{s.val}</div>
                </div>
              ))}
            </div>

            {/* Responsables */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:14}}>
              {[['Allan',gastoAllan,C.purple],['Joel',gastoJoel,C.blue]].map(([name,gasto,color])=>(
                <div key={name} style={{background:'rgba(14,14,22,0.8)',border:`1px solid ${C.border}`,borderRadius:12,padding:'12px 16px',display:'flex',alignItems:'center',gap:12}}>
                  <div style={{width:36,height:36,borderRadius:'50%',background:`linear-gradient(135deg,${color}44,${color}88)`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:700,color,border:`1px solid ${color}44`}}>{name[0]}</div>
                  <div>
                    <div style={{fontSize:9,color:C.t3,textTransform:'uppercase',letterSpacing:'.1em',marginBottom:4}}>{name} — Gastos</div>
                    <div style={{...num,fontSize:16,color,filter:F}}>{money(gasto)}</div>
                  </div>
                  <div style={{marginLeft:'auto',textAlign:'right'}}>
                    <div style={{fontSize:8,color:C.t3,marginBottom:2}}>% del total</div>
                    <div style={{...num,fontSize:13,color:C.t2}}>{gst>0?Math.round((gasto/gst)*100):0}%</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Presupuesto mes */}
            <div style={{background:'rgba(14,14,22,0.8)',border:`1px solid ${C.border}`,borderRadius:12,padding:'14px 18px',marginBottom:14}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
                <span style={{fontSize:9,color:C.t2,textTransform:'uppercase',letterSpacing:'.1em',fontWeight:600}}>📊 Presupuesto Mensual — {mesActual}</span>
                <button style={{...btn('ghost'),padding:'5px 10px',fontSize:9,border:`1px solid ${C.border}`}} onClick={()=>setModal('presupuesto')}>
                  {presupuestoMes?'Editar':'+ Establecer'}
                </button>
              </div>
              {presupuestoMes?(
                <>
                  <div style={{height:8,background:'rgba(255,255,255,0.06)',borderRadius:4,overflow:'hidden',marginBottom:8}}>
                    <div style={{height:'100%',width:`${presupuestoPct}%`,background:presupuestoPct>90?C.red:presupuestoPct>70?C.amber:C.green,borderRadius:4,transition:'width .5s ease'}}/>
                  </div>
                  <div style={{display:'flex',justifyContent:'space-between',fontSize:9}}>
                    <span style={{color:C.t3}}>Gastado: <span style={{color:C.t1,fontFamily:'monospace',fontWeight:700}}>{money(gastoMes)}</span></span>
                    <span style={{color:presupuestoPct>90?C.red:presupuestoPct>70?C.amber:C.green,fontWeight:700}}>{presupuestoPct}% usado</span>
                    <span style={{color:C.t3}}>Presupuesto: <span style={{color:C.t1,fontFamily:'monospace',fontWeight:700}}>{money(presupuestoMes.monto)}</span></span>
                  </div>
                </>
              ):<div style={{color:C.t3,fontSize:11,textAlign:'center',padding:'8px 0'}}>No hay presupuesto establecido para este mes</div>}
            </div>

            {/* Tabs */}
            <div style={{display:'flex',gap:4,marginBottom:14,background:'rgba(255,255,255,0.03)',padding:4,borderRadius:10,width:'fit-content'}}>
              {[['movimientos','📋 Movimientos'],['cobrar','💸 Por Cobrar'],['graficos','📈 Gráficos']].map(([tab,label])=>(
                <button key={tab} className={`tab-btn${contabTab===tab?' active':''}`} onClick={()=>setContabTab(tab)}>{label}</button>
              ))}
            </div>

            {/* Movimientos Tab */}
            {contabTab==='movimientos'&&<>
              <div className="contab-filters" style={{display:'flex',gap:8,marginBottom:12,flexWrap:'wrap',alignItems:'center'}}>
                <div style={{display:'flex',gap:4}}>
                  {['all','ingreso','gasto'].map(t=>(
                    <button key={t} style={filterBtn(contabFilter.tipo===t)} onClick={()=>setContabFilter(f=>({...f,tipo:t}))}>
                      {t==='all'?'Todos':t==='ingreso'?'Ingresos':'Gastos'}
                    </button>
                  ))}
                </div>
                <div style={{display:'flex',gap:4}}>
                  {['all','Joel','Allan'].map(r=>(
                    <button key={r} style={filterBtn(contabFilter.responsable===r)} onClick={()=>setContabFilter(f=>({...f,responsable:r}))}>
                      {r==='all'?'Todos':r}
                    </button>
                  ))}
                </div>
                <div style={{display:'flex',gap:4}}>
                  {['all','USD','PYG','BOB'].map(m=>(
                    <button key={m} style={filterBtn(contabFilter.moneda===m)} onClick={()=>setContabFilter(f=>({...f,moneda:m}))}>
                      {m==='all'?'Monedas':m}
                    </button>
                  ))}
                </div>
                <div style={{display:'flex',gap:4}}>
                  {[['all','Todo'],['mes','Este mes'],['30d','30 días'],['7d','7 días']].map(([v,l])=>(
                    <button key={v} style={filterBtn(contabFilter.periodo===v)} onClick={()=>setContabFilter(f=>({...f,periodo:v}))}>{l}</button>
                  ))}
                </div>
                <div style={{marginLeft:'auto',display:'flex',gap:8}}>
                  <button style={{...btn('blue'),padding:'7px 12px',border:`1px solid rgba(99,102,241,0.3)`}} onClick={exportCSV}>⬇ CSV</button>
                  <button className="btn-gold" style={btn('gold')} onClick={()=>setModal('finanza')}>+ Movimiento</button>
                </div>
              </div>

              <div style={panel}>
                {finanzasFiltradas.length===0&&<div style={{padding:40,color:C.t3,textAlign:'center',fontSize:11,textTransform:'uppercase'}}>Sin movimientos</div>}
                {finanzasFiltradas.map(f=>(
                  <div key={f.id} style={{display:'flex',alignItems:'center',gap:8,padding:'10px 14px',borderBottom:`1px solid ${C.border}`}}>
                    <span style={{width:6,height:6,borderRadius:'50%',background:f.tipo==='ingreso'?C.green:C.red,flexShrink:0}}/>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:10,fontWeight:500,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{f.descripcion}</div>
                      <div style={{fontSize:8,color:C.t3,marginTop:2,display:'flex',gap:8}}>
                        <span>{f.fecha}</span>
                        <span style={{background:'rgba(255,255,255,0.05)',padding:'1px 6px',borderRadius:10}}>{f.categoria}</span>
                        {f.pais&&<span>{f.pais}</span>}
                      </div>
                    </div>
                    {f.responsable&&(
                      <span style={{fontSize:8,padding:'2px 8px',borderRadius:10,background:f.responsable==='Allan'?'rgba(168,85,247,0.1)':'rgba(99,102,241,0.1)',color:f.responsable==='Allan'?C.purple:C.blue,border:`1px solid ${f.responsable==='Allan'?'rgba(168,85,247,0.2)':'rgba(99,102,241,0.2)'}`,flexShrink:0}}>
                        {f.responsable}
                      </span>
                    )}
                    <span style={{fontSize:8,color:C.t3,padding:'2px 6px',background:'rgba(255,255,255,0.04)',borderRadius:6,flexShrink:0}}>{f.moneda||'USD'}</span>
                    <span style={{...num,fontSize:11,width:90,textAlign:'right',color:f.tipo==='ingreso'?C.green:C.red,filter:F,flexShrink:0}}>
                      {f.tipo==='ingreso'?'+':'-'}{money(f.monto,f.moneda||'USD')}
                    </span>
                    <button style={{...btn('ghost'),padding:'3px 7px',flexShrink:0,color:C.red}} onClick={()=>del('finanzas',f.id)}>🗑</button>
                  </div>
                ))}
              </div>
            </>}

            {/* Cuentas por Cobrar Tab */}
            {contabTab==='cobrar'&&<>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
                <div style={{display:'flex',gap:12}}>
                  <div style={{background:'rgba(14,14,22,0.8)',border:`1px solid ${C.border}`,borderRadius:10,padding:'8px 14px'}}>
                    <div style={{fontSize:8,color:C.t3,textTransform:'uppercase',marginBottom:3}}>Total pendiente</div>
                    <div style={{...num,fontSize:14,color:C.gold2,filter:F}}>{money(totalPorCobrar)}</div>
                  </div>
                  <div style={{background:'rgba(14,14,22,0.8)',border:`1px solid ${C.border}`,borderRadius:10,padding:'8px 14px'}}>
                    <div style={{fontSize:8,color:C.t3,textTransform:'uppercase',marginBottom:3}}>Vencidas</div>
                    <div style={{...num,fontSize:14,color:vencidasCPC>0?C.red:C.green}}>{vencidasCPC}</div>
                  </div>
                </div>
                <button className="btn-gold" style={btn('gold')} onClick={()=>setModal('cobrar')}>+ Nueva cuenta</button>
              </div>
              <div style={panel}>
                {cuentasPorCobrar.map(cpc=>{
                  const d=daysUntil(cpc.fecha_vence)
                  const pagado=cpc.estado==='pagado'
                  return(
                    <div key={cpc.id} style={{display:'flex',alignItems:'center',gap:10,padding:'11px 16px',borderBottom:`1px solid ${C.border}`,opacity:pagado?.6:1}}>
                      <span style={{width:8,height:8,borderRadius:'50%',background:pagado?C.green:d<0?C.red:d<7?C.amber:C.blue,flexShrink:0}}/>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:11,fontWeight:600}}>{cpc.cliente_nombre}</div>
                        <div style={{fontSize:8,color:C.t3,marginTop:2}}>{cpc.concepto} · Vence: {cpc.fecha_vence}</div>
                      </div>
                      <span style={{fontSize:8,padding:'2px 8px',borderRadius:10,background:pagado?'rgba(16,185,129,0.1)':d<0?'rgba(244,63,94,0.1)':'rgba(99,102,241,0.1)',color:pagado?C.green:d<0?C.red:C.blue,border:`1px solid ${pagado?'rgba(16,185,129,0.2)':d<0?'rgba(244,63,94,0.2)':'rgba(99,102,241,0.2)'}`}}>
                        {pagado?'Pagado':d<0?`Vencida ${Math.abs(d)}d`:`En ${d}d`}
                      </span>
                      <span style={{...num,fontSize:12,color:C.gold2,filter:F}}>{money(cpc.monto,cpc.moneda||'USD')}</span>
                      {!pagado&&<button style={{...btn('ghost'),padding:'5px 10px',fontSize:9,color:C.green,border:`1px solid rgba(16,185,129,0.3)`}} onClick={()=>marcarCobrada(cpc)}>✓ Cobrado</button>}
                      <button style={{...btn('ghost'),padding:'5px 8px',fontSize:9,color:C.red}} onClick={()=>del('cuentas_por_cobrar',cpc.id)}>🗑</button>
                    </div>
                  )
                })}
                {!cuentasPorCobrar.length&&<div style={{padding:40,color:C.t3,textAlign:'center',fontSize:11}}>Sin cuentas por cobrar</div>}
              </div>
            </>}

            {/* Gráficos Tab */}
            {contabTab==='graficos'&&<>
              <div style={{...panel,marginBottom:14}}>
                <div style={panelHdr}><span style={{fontSize:9,letterSpacing:'.1em',textTransform:'uppercase',color:C.t2,fontWeight:600}}>📊 Ingresos vs Gastos — Últimos 6 meses</span></div>
                <div style={{padding:'16px 8px 8px'}}><Charts finanzas={finanzas}/></div>
              </div>

              {/* Gastos por categoría */}
              <div style={panel}>
                <div style={panelHdr}><span style={{fontSize:9,letterSpacing:'.1em',textTransform:'uppercase',color:C.t2,fontWeight:600}}>🏷 Gastos por Categoría</span></div>
                <div style={{padding:'12px 16px'}}>
                  {Object.entries(
                    finanzas.filter(f=>f.tipo==='gasto').reduce((acc,f)=>{
                      const cat=f.categoria||'Otro'
                      acc[cat]=(acc[cat]||0)+toUSD(f.monto,f.moneda||'USD')
                      return acc
                    },{})
                  ).sort((a,b)=>b[1]-a[1]).map(([cat,total])=>{
                    const pct=gst>0?Math.round((total/gst)*100):0
                    return(
                      <div key={cat} style={{marginBottom:10}}>
                        <div style={{display:'flex',justifyContent:'space-between',marginBottom:4,fontSize:9}}>
                          <span style={{color:C.t2}}>{cat}</span>
                          <span style={{...num,color:C.t1,filter:F}}>{money(total)} <span style={{color:C.t3,fontWeight:400}}>({pct}%)</span></span>
                        </div>
                        <div style={{height:4,background:'rgba(255,255,255,0.06)',borderRadius:2}}>
                          <div style={{height:'100%',width:`${pct}%`,background:C.red,borderRadius:2,opacity:.7}}/>
                        </div>
                      </div>
                    )
                  })}
                  {!finanzas.filter(f=>f.tipo==='gasto').length&&<div style={{color:C.t3,textAlign:'center',fontSize:11,padding:'12px 0'}}>Sin gastos</div>}
                </div>
              </div>
            </>}
          </div>}

          {/* ─── ENERGÍA ─── */}
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
                      <button style={{...btn('ghost'),padding:'6px 10px',fontSize:10,color:C.red}} onClick={()=>del('alertas_energia',a.id)}>Eliminar</button>
                    </div>
                  </div>
                </div>
              )
            })}
            {!alertas.length&&<div style={{...panel,padding:40,color:C.green,textAlign:'center',fontSize:12}}>✓ Sin alertas activas.</div>}
          </div>}

          {/* ─── IA ─── */}
          {page==='ia'&&<div className="page">
            <AI clientes={clientes} equipos={equipos} finanzas={finanzas} alertas={alertas} tareas={tareas}/>
          </div>}

          {/* ─── TAREAS ─── */}
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
                  <button style={{...btn('ghost'),padding:'4px 7px',marginLeft:6,color:C.red}} onClick={()=>del('tareas',t.id)}>🗑</button>
                </div>
              ))}
              {!tareas.length&&<div style={{padding:40,color:C.t3,textAlign:'center',fontSize:11,textTransform:'uppercase'}}>Sin tareas</div>}
            </div>
          </div>}

        </div>
      </div>

      {/* ─── MODALES ─── */}
      {modal&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.85)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',backdropFilter:'blur(6px)',padding:'16px'}} onClick={e=>{if(e.target===e.currentTarget){setModal(null);setForm({})}}}>
          <div style={{background:'linear-gradient(135deg,rgba(16,16,26,0.99),rgba(12,12,20,0.99))',border:`1px solid ${C.border2}`,borderRadius:16,width:'100%',maxWidth:480,maxHeight:'90vh',overflowY:'auto',boxShadow:'0 32px 80px rgba(0,0,0,0.7)'}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'16px 20px',borderBottom:`1px solid ${C.border}`}}>
              <div style={{fontFamily:'monospace',fontSize:11,fontWeight:700,letterSpacing:'.08em'}}>
                {({cliente:'NUEVO CLIENTE',equipo:'NUEVO EQUIPO',finanza:'REGISTRAR MOVIMIENTO',alerta:'NUEVA ALERTA',tarea:'NUEVA TAREA',cobrar:'CUENTA POR COBRAR',presupuesto:'PRESUPUESTO MENSUAL'})[modal]}
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
                  <div><label style={fLabel}>Responsable</label><select style={fInput} value={form.responsable||'Joel'} onChange={e=>setForm({...form,responsable:e.target.value})}><option>Joel</option><option>Allan</option></select></div>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:12}}>
                  <div><label style={fLabel}>Monto</label><input style={fInput} type="number" placeholder="420" value={form.monto||''} onChange={e=>setForm({...form,monto:e.target.value})}/></div>
                  <div><label style={fLabel}>Moneda</label><select style={fInput} value={form.moneda||'USD'} onChange={e=>setForm({...form,moneda:e.target.value})}><option>USD</option><option>PYG</option><option>BOB</option></select></div>
                </div>
                <div style={{marginBottom:12}}><label style={fLabel}>Descripción</label><input style={fInput} placeholder="Ej: Pago hosting" value={form.descripcion||''} onChange={e=>setForm({...form,descripcion:e.target.value})}/></div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10,marginBottom:12}}>
                  <div><label style={fLabel}>Categoría</label><select style={fInput} value={form.categoria||'Otro'} onChange={e=>setForm({...form,categoria:e.target.value})}><option>Hosting</option><option>Energía</option><option>Mantenimiento</option><option>BTC</option><option>Salario</option><option>Oficina</option><option>Transporte</option><option>Otro</option></select></div>
                  <div><label style={fLabel}>País</label><select style={fInput} value={form.pais||'Paraguay'} onChange={e=>setForm({...form,pais:e.target.value})}><option>Paraguay</option><option>Bolivia</option><option>Argentina</option><option>Otro</option></select></div>
                  <div><label style={fLabel}>Fecha</label><input style={fInput} type="date" value={form.fecha||new Date().toISOString().slice(0,10)} onChange={e=>setForm({...form,fecha:e.target.value})}/></div>
                </div>
                <div style={{marginBottom:12}}><label style={fLabel}>Notas (opcional)</label><input style={fInput} placeholder="Referencia, comprobante..." value={form.notas||''} onChange={e=>setForm({...form,notas:e.target.value})}/></div>
                <div style={{display:'flex',gap:8,justifyContent:'flex-end',paddingTop:14,borderTop:`1px solid ${C.border}`}}>
                  <button style={btn('ghost')} onClick={()=>{setModal(null);setForm({})}}>Cancelar</button>
                  <button className="btn-gold" style={btn('gold')} onClick={addFinanza}>✓ Registrar</button>
                </div>
              </>}

              {modal==='cobrar'&&<>
                <div style={{marginBottom:12}}><label style={fLabel}>Cliente</label><input style={fInput} placeholder="Nombre del cliente" list="clientes-list" value={form.cliente_nombre||''} onChange={e=>setForm({...form,cliente_nombre:e.target.value})}/>
                  <datalist id="clientes-list">{clientes.map(c=><option key={c.id} value={c.nombre}/>)}</datalist>
                </div>
                <div style={{marginBottom:12}}><label style={fLabel}>Concepto</label><input style={fInput} placeholder="Hosting mensual, BTC mining..." value={form.concepto||''} onChange={e=>setForm({...form,concepto:e.target.value})}/></div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10}}>
                  <div><label style={fLabel}>Monto</label><input style={fInput} type="number" placeholder="420" value={form.monto||''} onChange={e=>setForm({...form,monto:e.target.value})}/></div>
                  <div><label style={fLabel}>Moneda</label><select style={fInput} value={form.moneda||'USD'} onChange={e=>setForm({...form,moneda:e.target.value})}><option>USD</option><option>PYG</option><option>BOB</option></select></div>
                  <div><label style={fLabel}>Fecha vencimiento</label><input style={fInput} type="date" value={form.fecha_vence||''} onChange={e=>setForm({...form,fecha_vence:e.target.value})}/></div>
                </div>
                <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:18,paddingTop:14,borderTop:`1px solid ${C.border}`}}>
                  <button style={btn('ghost')} onClick={()=>{setModal(null);setForm({})}}>Cancelar</button>
                  <button className="btn-gold" style={btn('gold')} onClick={addCuentaPorCobrar}>✓ Crear</button>
                </div>
              </>}

              {modal==='presupuesto'&&<>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:12}}>
                  <div><label style={fLabel}>Mes (YYYY-MM)</label><input style={fInput} type="month" value={form.mes||mesActual} onChange={e=>setForm({...form,mes:e.target.value})}/></div>
                  <div><label style={fLabel}>Presupuesto (USD)</label><input style={fInput} type="number" placeholder="5000" value={form.monto||''} onChange={e=>setForm({...form,monto:e.target.value})}/></div>
                </div>
                <div style={{marginBottom:12}}><label style={fLabel}>Notas</label><input style={fInput} placeholder="Objetivo del mes..." value={form.notas||''} onChange={e=>setForm({...form,notas:e.target.value})}/></div>
                <div style={{display:'flex',gap:8,justifyContent:'flex-end',paddingTop:14,borderTop:`1px solid ${C.border}`}}>
                  <button style={btn('ghost')} onClick={()=>{setModal(null);setForm({})}}>Cancelar</button>
                  <button className="btn-gold" style={btn('gold')} onClick={addPresupuesto}>✓ Guardar</button>
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
                <div style={{display:'flex',gap:8,justifyContent:'flex-end',paddingTop:14,borderTop:`1px solid ${C.border}`}}>
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
