// ClientesPage.jsx — Componente completo de Clientes mejorado
// Integrar en App.jsx reemplazando el bloque {page==='clientes'&&...}

import { useState, useEffect } from 'react'
import { supabase } from './supabase'

const C={void:'#060608',bg1:'#0a0a0f',card:'#111118',border:'rgba(255,255,255,0.06)',border2:'rgba(255,255,255,0.11)',gold:'#d4a843',gold2:'#f0c060',green:'#10b981',red:'#f43f5e',amber:'#f59e0b',blue:'#6366f1',purple:'#a855f7',t1:'#f0f0f8',t2:'#808098',t3:'#40405a'}
const num={fontFamily:'monospace',fontWeight:700}
const initials=n=>n.split(' ').map(x=>x[0]).join('').substring(0,2).toUpperCase()
const money=n=>'$'+Number(n||0).toLocaleString()
const daysUntil=d=>Math.round((new Date(d)-new Date())/864e5)

function getProximoCobro(diaCobro){
  const hoy=new Date()
  const este=new Date(hoy.getFullYear(),hoy.getMonth(),diaCobro||1)
  if(este<=hoy) este.setMonth(este.getMonth()+1)
  return este.toISOString().slice(0,10)
}

function getPeriodo(){
  const d=new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
}

export default function ClientesPage({equipos=[],onRefresh,toast}){
  const[clientes,setClientes]=useState([])
  const[pagos,setPagos]=useState([])
  const[clienteEquipos,setClienteEquipos]=useState([])
  const[loading,setLoading]=useState(true)
  const[modal,setModal]=useState(null)
  const[selected,setSelected]=useState(null)
  const[form,setForm]=useState({})
  const[tab,setTab]=useState('lista')

  useEffect(()=>{fetchData()},[])

  async function fetchData(){
    setLoading(true)
    const[c,p,ce]=await Promise.all([
      supabase.from('clientes').select('*').order('creado_en',{ascending:false}),
      supabase.from('pagos_clientes').select('*').order('creado_en',{ascending:false}),
      supabase.from('cliente_equipos').select('*'),
    ])
    setClientes(c.data||[])
    setPagos(p.data||[])
    setClienteEquipos(ce.data||[])
    setLoading(false)
  }

  function getClienteEquipos(clienteId){
    const ids=clienteEquipos.filter(ce=>ce.cliente_id===clienteId).map(ce=>ce.equipo_id)
    return equipos.filter(e=>ids.includes(e.id))
  }

  function getEstadoPago(cliente){
    const periodo=getPeriodo()
    const pago=pagos.find(p=>p.cliente_id===cliente.id&&p.periodo===periodo&&p.tipo==='hosting')
    return pago?.estado||'pendiente'
  }

  function getEstadoEnergia(cliente){
    const periodo=getPeriodo()
    const pago=pagos.find(p=>p.cliente_id===cliente.id&&p.periodo===periodo&&p.tipo==='energia')
    return pago?.estado||'pendiente'
  }

  function getDiasAlCobro(cliente){
    if(!cliente.dia_cobro)return null
    const proximo=getProximoCobro(cliente.dia_cobro)
    return daysUntil(proximo)
  }

  // Alertas: clientes con cobro en ≤5 días
  const alertasProximas=clientes.filter(c=>{
    const dias=getDiasAlCobro(c)
    return dias!==null&&dias<=5&&dias>=0&&getEstadoPago(c)!=='pagado'
  })

  const alertasVencidas=clientes.filter(c=>{
    const dias=getDiasAlCobro(c)
    return dias!==null&&dias<0&&getEstadoPago(c)!=='pagado'
  })

  async function addCliente(){
    if(!form.nombre||!form.tarifa_mensual){toast('Completá los campos requeridos','error');return}
    await supabase.from('clientes').insert([{
      nombre:form.nombre,
      contacto:form.contacto||'',
      pais:form.pais||'Paraguay',
      tarifa_mensual:Number(form.tarifa_mensual),
      unidades_asic:Number(form.unidades_asic)||1,
      dia_cobro:Number(form.dia_cobro)||1,
      fecha_inicio:form.fecha_inicio||new Date().toISOString().slice(0,10),
      fecha_vence_contrato:form.fecha_vence_contrato||null,
      costo_energia:Number(form.costo_energia)||0,
      notas:form.notas||'',
      estado:'activo'
    }])
    setModal(null);setForm({});fetchData();toast('Cliente agregado ✓','success')
    if(onRefresh)onRefresh()
  }

  async function asignarEquipo(){
    if(!form.equipo_id){toast('Seleccioná un equipo','error');return}
    const existe=clienteEquipos.find(ce=>ce.cliente_id===selected.id&&ce.equipo_id===form.equipo_id)
    if(existe){toast('Ya está asignado','error');return}
    await supabase.from('cliente_equipos').insert([{cliente_id:selected.id,equipo_id:form.equipo_id}])
    setModal(null);setForm({});fetchData();toast('Equipo asignado ✓','success')
  }

  async function desasignarEquipo(clienteId,equipoId){
    await supabase.from('cliente_equipos').delete().eq('cliente_id',clienteId).eq('equipo_id',equipoId)
    fetchData();toast('Equipo removido','info')
  }

  async function marcarPagado(cliente,tipo){
    const periodo=getPeriodo()
    const monto=tipo==='hosting'?cliente.tarifa_mensual:cliente.costo_energia
    const existe=pagos.find(p=>p.cliente_id===cliente.id&&p.periodo===periodo&&p.tipo===tipo)
    if(existe){
      await supabase.from('pagos_clientes').update({estado:'pagado',fecha_pago:new Date().toISOString().slice(0,10)}).eq('id',existe.id)
    }else{
      await supabase.from('pagos_clientes').insert([{
        cliente_id:cliente.id,tipo,monto:Number(monto)||0,moneda:'USD',
        fecha_pago:new Date().toISOString().slice(0,10),periodo,estado:'pagado'
      }])
    }
    // Registrar en finanzas
    await supabase.from('finanzas').insert([{
      tipo:'ingreso',monto:Number(monto)||0,moneda:'USD',
      descripcion:`${tipo==='hosting'?'Hosting':'Energía'}: ${cliente.nombre}`,
      categoria:tipo==='hosting'?'Hosting':'Energía',
      fecha:new Date().toISOString().slice(0,10),
      responsable:'Joel',pais:cliente.pais||'Paraguay'
    }])
    fetchData();toast(`${tipo==='hosting'?'Hosting':'Energía'} marcado como pagado ✓`,'success')
    if(onRefresh)onRefresh()
  }

  async function del(id){
    await supabase.from('clientes').delete().eq('id',id)
    fetchData();toast('Cliente eliminado','info')
    if(onRefresh)onRefresh()
  }

  const panel={background:'rgba(14,14,22,0.8)',backdropFilter:'blur(20px)',border:`1px solid ${C.border}`,borderRadius:12,overflow:'hidden'}
  const panelHdr={display:'flex',alignItems:'center',justifyContent:'space-between',padding:'13px 18px',borderBottom:`1px solid ${C.border}`,background:'rgba(255,255,255,0.015)'}
  const btn=(t)=>({display:'inline-flex',alignItems:'center',gap:6,padding:'7px 14px',borderRadius:8,border:'none',cursor:'pointer',fontFamily:'Inter,sans-serif',fontSize:11,fontWeight:600,letterSpacing:'.03em',transition:'all .2s',background:t==='gold'?`linear-gradient(135deg,#d4a843,#e8b84b)`:t==='green'?'rgba(16,185,129,0.12)':t==='ghost'?'rgba(255,255,255,0.06)':'rgba(244,63,94,0.08)',color:t==='gold'?'#000':t==='green'?C.green:t==='ghost'?C.t1:C.red,border:t==='green'?`1px solid rgba(16,185,129,0.25)`:t==='ghost'?`1px solid ${C.border}`:'none'})
  const fInput={width:'100%',background:'rgba(255,255,255,0.04)',border:`1px solid ${C.border2}`,borderRadius:8,padding:'10px 13px',color:C.t1,fontFamily:'Inter,sans-serif',fontSize:12,outline:'none',boxSizing:'border-box'}
  const fLabel={display:'block',fontSize:9,letterSpacing:'.15em',textTransform:'uppercase',color:C.t3,marginBottom:6,fontWeight:600}

  if(loading)return <div style={{padding:40,textAlign:'center',color:C.t3,fontSize:11}}>Cargando...</div>

  return(
    <div>
      {/* Alertas banner */}
      {(alertasProximas.length>0||alertasVencidas.length>0)&&(
        <div style={{marginBottom:14,display:'flex',flexDirection:'column',gap:8}}>
          {alertasVencidas.length>0&&(
            <div style={{background:'rgba(244,63,94,0.08)',border:'1px solid rgba(244,63,94,0.25)',borderRadius:10,padding:'10px 16px',display:'flex',alignItems:'center',gap:10}}>
              <span style={{fontSize:16}}>🔴</span>
              <div style={{flex:1}}>
                <div style={{fontSize:10,fontWeight:600,color:C.red}}>COBROS VENCIDOS</div>
                <div style={{fontSize:9,color:C.t2,marginTop:2}}>{alertasVencidas.map(c=>c.nombre).join(', ')}</div>
              </div>
            </div>
          )}
          {alertasProximas.length>0&&(
            <div style={{background:'rgba(245,158,11,0.08)',border:'1px solid rgba(245,158,11,0.25)',borderRadius:10,padding:'10px 16px',display:'flex',alignItems:'center',gap:10}}>
              <span style={{fontSize:16}}>🟡</span>
              <div style={{flex:1}}>
                <div style={{fontSize:10,fontWeight:600,color:C.amber}}>COBROS EN LOS PRÓXIMOS 5 DÍAS</div>
                <div style={{fontSize:9,color:C.t2,marginTop:2}}>{alertasProximas.map(c=>`${c.nombre} (${getDiasAlCobro(c)}d)`).join(', ')}</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Header */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
        <div style={{display:'flex',gap:4,background:'rgba(255,255,255,0.03)',padding:4,borderRadius:10}}>
          {[['lista','👥 Clientes'],['pagos','💰 Pagos'],['alertas','🔔 Alertas']].map(([t,l])=>(
            <button key={t} onClick={()=>setTab(t)} style={{background:tab===t?'rgba(212,168,67,0.1)':'none',border:'none',cursor:'pointer',fontFamily:'Inter,sans-serif',fontSize:11,fontWeight:600,letterSpacing:'.05em',padding:'7px 14px',borderRadius:8,color:tab===t?C.gold2:C.t2,transition:'all .15s'}}>
              {l}{t==='alertas'&&(alertasProximas.length+alertasVencidas.length)>0&&<span style={{marginLeft:6,background:C.red,color:'#fff',fontSize:8,padding:'1px 5px',borderRadius:10,fontWeight:700}}>{alertasProximas.length+alertasVencidas.length}</span>}
            </button>
          ))}
        </div>
        <button style={btn('gold')} onClick={()=>setModal('cliente')}>+ Nuevo cliente</button>
      </div>

      {/* Lista tab */}
      {tab==='lista'&&<div style={{display:'flex',flexDirection:'column',gap:10}}>
        {clientes.map(c=>{
          const equiposCliente=getClienteEquipos(c.id)
          const diasCobro=getDiasAlCobro(c)
          const estadoHosting=getEstadoPago(c)
          const estadoEnergia=getEstadoEnergia(c)
          const proximo=c.dia_cobro?getProximoCobro(c.dia_cobro):null
          const urgente=diasCobro!==null&&diasCobro<=5
          const vencido=diasCobro!==null&&diasCobro<0

          return(
            <div key={c.id} style={{...panel,border:`1px solid ${vencido&&estadoHosting!=='pagado'?'rgba(244,63,94,0.3)':urgente&&estadoHosting!=='pagado'?'rgba(245,158,11,0.2)':C.border}`}}>
              {/* Header del cliente */}
              <div style={{display:'flex',alignItems:'center',gap:12,padding:'14px 16px',borderBottom:`1px solid ${C.border}`}}>
                <div style={{width:36,height:36,borderRadius:'50%',background:`linear-gradient(135deg,rgba(212,168,67,0.5),${C.gold})`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700,color:'#000',flexShrink:0}}>{initials(c.nombre)}</div>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:700}}>{c.nombre}</div>
                  <div style={{fontSize:9,color:C.t3,marginTop:2}}>{c.contacto} · {c.pais} · {c.unidades_asic} ASICs</div>
                </div>

                {/* Estado cobro */}
                {proximo&&(
                  <div style={{textAlign:'center',padding:'0 12px',borderLeft:`1px solid ${C.border}`}}>
                    <div style={{fontSize:8,color:C.t3,marginBottom:3,textTransform:'uppercase'}}>Próximo cobro</div>
                    <div style={{...num,fontSize:11,color:vencido?C.red:urgente?C.amber:C.t1}}>{proximo}</div>
                    <div style={{fontSize:8,marginTop:2,color:vencido?C.red:urgente?C.amber:C.t3}}>
                      {vencido?`Vencido ${Math.abs(diasCobro)}d`:diasCobro===0?'Hoy':`En ${diasCobro}d`}
                    </div>
                  </div>
                )}

                <div style={{textAlign:'right',padding:'0 12px',borderLeft:`1px solid ${C.border}`}}>
                  <div style={{...num,fontSize:16,color:C.gold2}}>{money(c.tarifa_mensual)}</div>
                  <div style={{fontSize:8,color:C.t3}}>hosting/mes</div>
                  {c.costo_energia>0&&<div style={{fontSize:9,color:C.t3,marginTop:2}}>{money(c.costo_energia)} energía</div>}
                </div>

                <button style={{...btn('ghost'),padding:'5px 8px',fontSize:9,color:C.red}} onClick={()=>del(c.id)}>🗑</button>
              </div>

              {/* Body */}
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:0}}>
                {/* Equipos */}
                <div style={{padding:'12px 16px',borderRight:`1px solid ${C.border}`}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                    <span style={{fontSize:9,color:C.t3,textTransform:'uppercase',letterSpacing:'.1em',fontWeight:600}}>⛏ Equipos asignados</span>
                    <button style={{...btn('ghost'),padding:'3px 8px',fontSize:9}} onClick={()=>{setSelected(c);setModal('equipo')}}>+ Asignar</button>
                  </div>
                  {equiposCliente.length===0&&<div style={{fontSize:9,color:C.t3,fontStyle:'italic'}}>Sin equipos asignados</div>}
                  {equiposCliente.map(eq=>(
                    <div key={eq.id} style={{display:'flex',alignItems:'center',gap:6,marginBottom:5,padding:'5px 8px',background:'rgba(255,255,255,0.03)',borderRadius:6}}>
                      <span style={{width:5,height:5,borderRadius:'50%',background:eq.estado==='activo'?C.green:C.amber,flexShrink:0}}/>
                      <span style={{flex:1,fontSize:10,fontWeight:500}}>{eq.modelo}</span>
                      <span style={{...num,fontSize:9,color:C.gold2}}>{eq.hashrate}TH</span>
                      <button style={{background:'none',border:'none',cursor:'pointer',color:C.t3,fontSize:10,padding:'0 2px'}} onClick={()=>desasignarEquipo(c.id,eq.id)}>×</button>
                    </div>
                  ))}
                </div>

                {/* Hosting */}
                <div style={{padding:'12px 16px',borderRight:`1px solid ${C.border}`}}>
                  <div style={{fontSize:9,color:C.t3,textTransform:'uppercase',letterSpacing:'.1em',fontWeight:600,marginBottom:8}}>💳 Hosting — {getPeriodo()}</div>
                  <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
                    <span style={{fontSize:18,padding:'6px 10px',background:estadoHosting==='pagado'?'rgba(16,185,129,0.1)':'rgba(244,63,94,0.08)',borderRadius:8,border:`1px solid ${estadoHosting==='pagado'?'rgba(16,185,129,0.2)':'rgba(244,63,94,0.15)'}`}}>
                      {estadoHosting==='pagado'?'✅':'⏳'}
                    </span>
                    <div>
                      <div style={{fontSize:11,fontWeight:600,color:estadoHosting==='pagado'?C.green:C.red}}>{estadoHosting==='pagado'?'Pagado':'Pendiente'}</div>
                      <div style={{...num,fontSize:10,color:C.gold2}}>{money(c.tarifa_mensual)}</div>
                    </div>
                  </div>
                  {estadoHosting!=='pagado'&&(
                    <button style={btn('green')} onClick={()=>marcarPagado(c,'hosting')}>✓ Marcar pagado</button>
                  )}
                </div>

                {/* Energía */}
                <div style={{padding:'12px 16px'}}>
                  <div style={{fontSize:9,color:C.t3,textTransform:'uppercase',letterSpacing:'.1em',fontWeight:600,marginBottom:8}}>⚡ Energía — {getPeriodo()}</div>
                  {c.costo_energia>0?(
                    <>
                      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
                        <span style={{fontSize:18,padding:'6px 10px',background:estadoEnergia==='pagado'?'rgba(16,185,129,0.1)':'rgba(245,158,11,0.08)',borderRadius:8,border:`1px solid ${estadoEnergia==='pagado'?'rgba(16,185,129,0.2)':'rgba(245,158,11,0.2)'}`}}>
                          {estadoEnergia==='pagado'?'✅':'⚡'}
                        </span>
                        <div>
                          <div style={{fontSize:11,fontWeight:600,color:estadoEnergia==='pagado'?C.green:C.amber}}>{estadoEnergia==='pagado'?'Pagado':'Pendiente'}</div>
                          <div style={{...num,fontSize:10,color:C.gold2}}>{money(c.costo_energia)}</div>
                        </div>
                      </div>
                      {estadoEnergia!=='pagado'&&(
                        <button style={{...btn('ghost'),border:`1px solid rgba(245,158,11,0.3)`,color:C.amber}} onClick={()=>marcarPagado(c,'energia')}>✓ Marcar pagado</button>
                      )}
                    </>
                  ):(
                    <div style={{fontSize:9,color:C.t3,fontStyle:'italic'}}>Sin costo de energía registrado</div>
                  )}
                </div>
              </div>

              {/* Contrato vencimiento */}
              {c.fecha_vence_contrato&&(
                <div style={{padding:'8px 16px',borderTop:`1px solid ${C.border}`,background:'rgba(255,255,255,0.01)',display:'flex',alignItems:'center',gap:8}}>
                  <span style={{fontSize:9,color:C.t3}}>📄 Contrato vence:</span>
                  <span style={{...num,fontSize:9,color:daysUntil(c.fecha_vence_contrato)<30?C.amber:C.t2}}>{c.fecha_vence_contrato}</span>
                  <span style={{fontSize:8,color:C.t3}}>({daysUntil(c.fecha_vence_contrato)}d)</span>
                  {c.notas&&<span style={{marginLeft:8,fontSize:8,color:C.t3,fontStyle:'italic'}}>📝 {c.notas}</span>}
                </div>
              )}
            </div>
          )
        })}
        {!clientes.length&&<div style={{...panel,padding:40,color:C.t3,textAlign:'center',fontSize:11,textTransform:'uppercase'}}>Sin clientes registrados</div>}
      </div>}

      {/* Pagos tab */}
      {tab==='pagos'&&<div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10,marginBottom:14}}>
          {[
            {label:'Hosting cobrado este mes',val:money(pagos.filter(p=>p.tipo==='hosting'&&p.estado==='pagado'&&p.periodo===getPeriodo()).reduce((a,b)=>a+Number(b.monto),0)),color:C.green},
            {label:'Energía cobrada este mes',val:money(pagos.filter(p=>p.tipo==='energia'&&p.estado==='pagado'&&p.periodo===getPeriodo()).reduce((a,b)=>a+Number(b.monto),0)),color:C.amber},
            {label:'Pendiente de cobro',val:money(clientes.filter(c=>getEstadoPago(c)!=='pagado').reduce((a,b)=>a+Number(b.tarifa_mensual),0)),color:C.red},
          ].map(s=>(
            <div key={s.label} style={{background:'rgba(14,14,22,0.8)',border:`1px solid ${C.border}`,borderRadius:12,padding:'12px 16px'}}>
              <div style={{fontSize:8,color:C.t3,textTransform:'uppercase',marginBottom:6}}>{s.label}</div>
              <div style={{...num,fontSize:18,color:s.color}}>{s.val}</div>
            </div>
          ))}
        </div>

        <div style={panel}>
          <div style={panelHdr}><span style={{fontSize:9,color:C.t2,textTransform:'uppercase',letterSpacing:'.1em',fontWeight:600}}>Historial de pagos</span></div>
          {pagos.slice(0,30).map(p=>{
            const cliente=clientes.find(c=>c.id===p.cliente_id)
            return(
              <div key={p.id} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 16px',borderBottom:`1px solid ${C.border}`}}>
                <span style={{width:6,height:6,borderRadius:'50%',background:p.tipo==='hosting'?C.blue:C.amber,flexShrink:0}}/>
                <div style={{flex:1}}>
                  <div style={{fontSize:10,fontWeight:600}}>{cliente?.nombre||'—'}</div>
                  <div style={{fontSize:8,color:C.t3}}>{p.tipo==='hosting'?'Hosting':'Energía'} · {p.periodo}</div>
                </div>
                <span style={{fontSize:8,color:C.t3}}>{p.fecha_pago}</span>
                <span style={{fontSize:8,padding:'2px 8px',borderRadius:10,background:p.estado==='pagado'?'rgba(16,185,129,0.1)':'rgba(244,63,94,0.1)',color:p.estado==='pagado'?C.green:C.red,border:`1px solid ${p.estado==='pagado'?'rgba(16,185,129,0.2)':'rgba(244,63,94,0.2)'}`}}>{p.estado}</span>
                <span style={{...num,fontSize:11,color:C.gold2}}>{money(p.monto)}</span>
              </div>
            )
          })}
          {!pagos.length&&<div style={{padding:40,color:C.t3,textAlign:'center',fontSize:11}}>Sin historial de pagos</div>}
        </div>
      </div>}

      {/* Alertas tab */}
      {tab==='alertas'&&<div style={{display:'flex',flexDirection:'column',gap:10}}>
        {[...alertasVencidas,...alertasProximas].map(c=>{
          const dias=getDiasAlCobro(c)
          const vencido=dias<0
          return(
            <div key={c.id} style={{...panel,border:`1px solid ${vencido?'rgba(244,63,94,0.3)':'rgba(245,158,11,0.3)'}`}}>
              <div style={{display:'flex',alignItems:'center',gap:12,padding:'14px 16px'}}>
                <span style={{fontSize:24}}>{vencido?'🔴':'🟡'}</span>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:700}}>{c.nombre}</div>
                  <div style={{fontSize:9,color:C.t3,marginTop:2}}>{c.pais} · Día de cobro: {c.dia_cobro} de cada mes</div>
                </div>
                <div style={{textAlign:'right'}}>
                  <div style={{...num,fontSize:18,color:vencido?C.red:C.amber}}>{vencido?`${Math.abs(dias)}d vencido`:`${dias}d para cobrar`}</div>
                  <div style={{...num,fontSize:13,color:C.gold2,marginTop:4}}>{money(c.tarifa_mensual)}</div>
                </div>
              </div>
              <div style={{display:'flex',gap:8,padding:'10px 16px',borderTop:`1px solid ${C.border}`}}>
                {getEstadoPago(c)!=='pagado'&&<button style={btn('green')} onClick={()=>marcarPagado(c,'hosting')}>✓ Marcar hosting pagado</button>}
                {c.costo_energia>0&&getEstadoEnergia(c)!=='pagado'&&<button style={{...btn('ghost'),border:`1px solid rgba(245,158,11,0.3)`,color:C.amber}} onClick={()=>marcarPagado(c,'energia')}>✓ Marcar energía pagada</button>}
              </div>
            </div>
          )
        })}
        {alertasProximas.length===0&&alertasVencidas.length===0&&(
          <div style={{...panel,padding:40,color:C.green,textAlign:'center',fontSize:12}}>✓ Sin alertas pendientes — todo al día</div>
        )}
      </div>}

      {/* Modales */}
      {modal&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.85)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',backdropFilter:'blur(6px)',padding:16}} onClick={e=>{if(e.target===e.currentTarget){setModal(null);setForm({});setSelected(null)}}}>
          <div style={{background:'linear-gradient(135deg,rgba(16,16,26,0.99),rgba(12,12,20,0.99))',border:`1px solid ${C.border2}`,borderRadius:16,width:'100%',maxWidth:500,maxHeight:'90vh',overflowY:'auto',boxShadow:'0 32px 80px rgba(0,0,0,0.7)'}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'16px 20px',borderBottom:`1px solid ${C.border}`}}>
              <div style={{fontFamily:'monospace',fontSize:11,fontWeight:700,letterSpacing:'.08em'}}>
                {modal==='cliente'?'NUEVO CLIENTE':'ASIGNAR EQUIPO'}
              </div>
              <button style={{background:'rgba(255,255,255,0.06)',border:`1px solid ${C.border}`,color:C.t2,width:28,height:28,borderRadius:6,cursor:'pointer',fontSize:16,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={()=>{setModal(null);setForm({});setSelected(null)}}>×</button>
            </div>
            <div style={{padding:18}}>
              {modal==='cliente'&&<>
                <div style={{marginBottom:12}}><label style={fLabel}>Nombre completo</label><input style={fInput} placeholder="Ej: Carlos Reyes" value={form.nombre||''} onChange={e=>setForm({...form,nombre:e.target.value})}/></div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:12}}>
                  <div><label style={fLabel}>Contacto / WhatsApp</label><input style={fInput} placeholder="+595 9..." value={form.contacto||''} onChange={e=>setForm({...form,contacto:e.target.value})}/></div>
                  <div><label style={fLabel}>País</label><select style={fInput} value={form.pais||'Paraguay'} onChange={e=>setForm({...form,pais:e.target.value})}><option>Paraguay</option><option>Bolivia</option><option>Argentina</option><option>Otro</option></select></div>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10,marginBottom:12}}>
                  <div><label style={fLabel}>ASICs</label><input style={fInput} type="number" placeholder="3" value={form.unidades_asic||''} onChange={e=>setForm({...form,unidades_asic:e.target.value})}/></div>
                  <div><label style={fLabel}>Tarifa hosting (USD)</label><input style={fInput} type="number" placeholder="420" value={form.tarifa_mensual||''} onChange={e=>setForm({...form,tarifa_mensual:e.target.value})}/></div>
                  <div><label style={fLabel}>Costo energía (USD)</label><input style={fInput} type="number" placeholder="150" value={form.costo_energia||''} onChange={e=>setForm({...form,costo_energia:e.target.value})}/></div>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10,marginBottom:12}}>
                  <div><label style={fLabel}>Día de cobro (1-31)</label><input style={fInput} type="number" min="1" max="31" placeholder="15" value={form.dia_cobro||''} onChange={e=>setForm({...form,dia_cobro:e.target.value})}/></div>
                  <div><label style={fLabel}>Inicio contrato</label><input style={fInput} type="date" value={form.fecha_inicio||''} onChange={e=>setForm({...form,fecha_inicio:e.target.value})}/></div>
                  <div><label style={fLabel}>Vence contrato</label><input style={fInput} type="date" value={form.fecha_vence_contrato||''} onChange={e=>setForm({...form,fecha_vence_contrato:e.target.value})}/></div>
                </div>
                <div style={{marginBottom:12}}><label style={fLabel}>Notas</label><input style={fInput} placeholder="Observaciones..." value={form.notas||''} onChange={e=>setForm({...form,notas:e.target.value})}/></div>
                <div style={{display:'flex',gap:8,justifyContent:'flex-end',paddingTop:14,borderTop:`1px solid ${C.border}`}}>
                  <button style={btn('ghost')} onClick={()=>{setModal(null);setForm({})}}>Cancelar</button>
                  <button style={btn('gold')} onClick={addCliente}>✓ Guardar</button>
                </div>
              </>}

              {modal==='equipo'&&<>
                <div style={{marginBottom:12}}>
                  <div style={{fontSize:11,color:C.t2,marginBottom:12}}>Asignando equipo a: <strong style={{color:C.t1}}>{selected?.nombre}</strong></div>
                  <label style={fLabel}>Seleccionar equipo</label>
                  <select style={fInput} value={form.equipo_id||''} onChange={e=>setForm({...form,equipo_id:e.target.value})}>
                    <option value="">— Seleccioná un equipo —</option>
                    {equipos.map(eq=>(
                      <option key={eq.id} value={eq.id}>{eq.modelo} — {eq.hashrate}TH/s ({eq.estado})</option>
                    ))}
                  </select>
                </div>
                <div style={{display:'flex',gap:8,justifyContent:'flex-end',paddingTop:14,borderTop:`1px solid ${C.border}`}}>
                  <button style={btn('ghost')} onClick={()=>{setModal(null);setForm({});setSelected(null)}}>Cancelar</button>
                  <button style={btn('gold')} onClick={asignarEquipo}>✓ Asignar</button>
                </div>
              </>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
