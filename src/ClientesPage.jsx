// ClientesPage.jsx — Calculadora f2pool integrada: BTC/día por máquina + fee seleccionable
import { useState, useEffect, useRef } from 'react'
import { supabase } from './supabase'

const C={void:'#060608',bg1:'#0a0a0f',card:'#111118',border:'rgba(255,255,255,0.06)',border2:'rgba(255,255,255,0.11)',gold:'#d4a843',gold2:'#f0c060',green:'#10b981',red:'#f43f5e',amber:'#f59e0b',blue:'#6366f1',purple:'#a855f7',orange:'#f7931a',t1:'#f0f0f8',t2:'#808098',t3:'#40405a'}
const num={fontFamily:'monospace',fontWeight:700}
const initials=n=>n.split(' ').map(x=>x[0]).join('').substring(0,2).toUpperCase()
const money=n=>'$'+Number(n||0).toLocaleString('en',{minimumFractionDigits:2,maximumFractionDigits:2})
const btcFmt=n=>Number(n||0).toFixed(8)+' ₿'
const daysUntil=d=>Math.round((new Date(d)-new Date())/864e5)
const FEE_OPTIONS=[7.5,10,15,18,20,25]

// Dado una fecha de inicio, calcula el próximo cobro mensual
function getProximoCobroDesde(fechaInicio){
  if(!fechaInicio) return null
  const inicio=new Date(fechaInicio+'T12:00:00')
  const hoy=new Date()
  const dia=inicio.getDate()
  let cobro=new Date(hoy.getFullYear(),hoy.getMonth(),dia)
  if(cobro<=hoy) cobro.setMonth(cobro.getMonth()+1)
  return cobro.toISOString().slice(0,10)
}

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

// Agrupar equipos por modelo+hashrate con fecha_asignacion más temprana del grupo
function agruparEquipos(eqArr, asignacionesMap={}){
  const grupos={}
  eqArr.forEach(eq=>{
    const key=`${eq.modelo}||${eq.hashrate}`
    if(!grupos[key]) grupos[key]={...eq,cantidad:0,ids:[],fechaAsignacion:null}
    grupos[key].cantidad++
    grupos[key].ids.push(eq.id)
    // Fecha de asignación más temprana del grupo
    const fa=asignacionesMap[eq.id]
    if(fa&&(!grupos[key].fechaAsignacion||fa<grupos[key].fechaAsignacion)){
      grupos[key].fechaAsignacion=fa
    }
  })
  return Object.values(grupos)
}

function useMiningData(){
  const [btcPrice, setBtcPrice] = useState(null)
  const [difficulty, setDifficulty] = useState(null)
  const [blockReward] = useState(3.125)
  const [lastUpdate, setLastUpdate] = useState(null)
  const [loading, setLoading] = useState(true)
  const intervalRef = useRef(null)

  async function fetchAll(){
    try{
      let price = null
      try{
        const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd')
        const d = await r.json()
        price = d?.bitcoin?.usd
      }catch{
        try{
          const r = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT')
          const d = await r.json()
          price = parseFloat(d?.price)
        }catch{}
      }
      if(price) setBtcPrice(price)
      try{
        const r = await fetch('https://blockchain.info/q/getdifficulty')
        const txt = await r.text()
        const diff = parseFloat(txt)
        if(diff && diff > 1e12) setDifficulty(diff)
        else setDifficulty(109521666870163)
      }catch{ setDifficulty(109521666870163) }
      setLastUpdate(new Date())
    }catch(e){ console.warn('Mining data fetch error', e) }
    finally{ setLoading(false) }
  }

  useEffect(()=>{
    fetchAll()
    intervalRef.current = setInterval(fetchAll, 120000)
    return ()=>clearInterval(intervalRef.current)
  },[])

  function calcBtcDay(hashrateTH){
    if(!difficulty||!hashrateTH) return null
    return (hashrateTH * 1e12 * 86400 * blockReward) / (difficulty * Math.pow(2, 32))
  }

  return { btcPrice, difficulty, blockReward, lastUpdate, loading, calcBtcDay, refetch: fetchAll }
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
  const[editandoDia,setEditandoDia]=useState(null)
  const[diaTemp,setDiaTemp]=useState('')
  const[feePcts,setFeePcts]=useState({})
  const[editando,setEditando]=useState(null)
  const[editForm,setEditForm]=useState({})

  const { btcPrice, difficulty, lastUpdate, loading: miningLoading, calcBtcDay, refetch } = useMiningData()

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
    const fees={}
    ;(c.data||[]).forEach(cl=>{ if(cl.hosting_fee_pct) fees[cl.id]=Number(cl.hosting_fee_pct) })
    setFeePcts(prev=>({...fees,...prev}))
    setLoading(false)
  }

  // Mapa de equipo_id -> fecha_asignacion
  function getAsignacionesMap(clienteId){
    const map={}
    clienteEquipos.filter(ce=>ce.cliente_id===clienteId).forEach(ce=>{
      map[ce.equipo_id]=ce.fecha_asignacion||null
    })
    return map
  }

  function getClienteEquiposArr(clienteId){
    const ids=clienteEquipos.filter(ce=>ce.cliente_id===clienteId).map(ce=>ce.equipo_id)
    return equipos.filter(e=>ids.includes(e.id))
  }

  function getEstadoPago(cliente){
    const pago=pagos.find(p=>p.cliente_id===cliente.id&&p.periodo===getPeriodo()&&p.tipo==='hosting')
    return pago?.estado||'pendiente'
  }

  function getEstadoEnergia(cliente){
    const pago=pagos.find(p=>p.cliente_id===cliente.id&&p.periodo===getPeriodo()&&p.tipo==='energia')
    return pago?.estado||'pendiente'
  }

  function getDiasAlCobro(cliente){
    if(!cliente.dia_cobro)return null
    return daysUntil(getProximoCobro(cliente.dia_cobro))
  }

  function calcEnergiaEquipo(hashrate){
    return Number(hashrate||0) >= 300 ? 163 : 90
  }
  function calcEnergiaTotal(cliente){
    const equiposC = getClienteEquiposArr(cliente.id)
    if(equiposC.length===0) return 0
    return equiposC.reduce((a,e)=>a+calcEnergiaEquipo(Number(e.hashrate||0)),0)
  }

  function calcClienteFee(cliente){
    const equiposC = getClienteEquiposArr(cliente.id)
    const totalTH = equiposC.reduce((a,e)=>a+Number(e.hashrate||0),0)
    const btcDiaTotal = calcBtcDay(totalTH)
    const feePct = feePcts[cliente.id] || 0
    const btcDiaFee = btcDiaTotal&&feePct ? btcDiaTotal*(feePct/100) : null
    const btcMesFee = btcDiaFee ? btcDiaFee*30 : null
    const usdMesFee = btcMesFee&&btcPrice ? btcMesFee*btcPrice : null
    return { totalTH, equipCount:equiposC.length, btcDiaTotal, feePct, btcDiaFee, btcMesFee, usdMesFee }
  }

  async function setFee(clienteId, pct){
    setFeePcts(prev=>({...prev,[clienteId]:pct}))
    try{ await supabase.from('clientes').update({hosting_fee_pct:pct}).eq('id',clienteId) }catch{}
  }

  function iniciarEditDia(cliente){ setEditandoDia(cliente.id); setDiaTemp(String(cliente.dia_cobro||1)) }

  async function guardarDia(cliente){
    const dia=parseInt(diaTemp)
    if(!dia||dia<1||dia>31){toast('Día inválido (1-31)','error');return}
    await supabase.from('clientes').update({dia_cobro:dia}).eq('id',cliente.id)
    setEditandoDia(null);setDiaTemp('');fetchData();toast('Fecha de cobro actualizada ✓','success')
    if(onRefresh)onRefresh()
  }

  function abrirWhatsApp(cliente){
    const {btcMesFee,usdMesFee,feePct}=calcClienteFee(cliente)
    const energiaTotal=calcEnergiaTotal(cliente)
    const proximo=cliente.dia_cobro?getProximoCobro(cliente.dia_cobro):null
    const fecha=proximo?new Date(proximo+'T12:00:00').toLocaleDateString('es',{day:'numeric',month:'long'}):'próximamente'
    let hostingStr=feePct>0&&btcMesFee?`${btcFmt(btcMesFee)} ≈ ${money(usdMesFee)}`:money(cliente.tarifa_mensual)
    const msg=`Hola ${cliente.nombre.split(' ')[0]} 👋, te recuerdo que tu pago vence el *${fecha}*:\n• Hosting: *${hostingStr}*\n• Energía: *${money(energiaTotal)}*\nCualquier consulta estoy disponible. Saludos, *NeuraHash* ⛏`
    const tel=(cliente.contacto||'').replace(/\D/g,'')
    window.open(tel?`https://wa.me/${tel}?text=${encodeURIComponent(msg)}`:`https://wa.me/?text=${encodeURIComponent(msg)}`,'_blank')
  }

  const alertasProximas=clientes.filter(c=>{const d=getDiasAlCobro(c);return d!==null&&d<=5&&d>=0&&getEstadoPago(c)!=='pagado'})
  const alertasVencidas=clientes.filter(c=>{const d=getDiasAlCobro(c);return d!==null&&d<0&&getEstadoPago(c)!=='pagado'})

  async function addCliente(){
    if(!form.nombre){toast('Nombre requerido','error');return}
    await supabase.from('clientes').insert([{
      nombre:form.nombre,contacto:form.contacto||'',pais:form.pais||'Paraguay',
      ubicacion_granja:form.ubicacion_granja||'Paraguay',
      tarifa_mensual:0,unidades_asic:1,
      dia_cobro:Number(form.dia_cobro)||1,
      fecha_inicio:form.fecha_inicio||new Date().toISOString().slice(0,10),
      fecha_vence_contrato:form.fecha_vence_contrato||null,
      costo_energia:0,notas:form.notas||'',
      pool_url:form.pool_url||null,estado:'activo'
    }])
    setModal(null);setForm({});fetchData();toast('Cliente agregado ✓','success')
    if(onRefresh)onRefresh()
  }

  // Asignar múltiples equipos guardando fecha_asignacion
  async function asignarEquipo(){
    if(!form.equipo_id){toast('Seleccioná un equipo','error');return}
    const grupo=modelosLibres.find(g=>g.ids[0]===form.equipo_id)
    if(!grupo){toast('Equipo no disponible','error');return}
    const cantidad=Number(form.cantidad_asignar)||1
    if(cantidad>grupo.ids.length){toast('No hay suficientes unidades libres','error');return}
    const fechaHoy=new Date().toISOString().slice(0,10)
    const fechaAsig=form.fecha_asignacion||fechaHoy
    const idsAAsignar=grupo.ids.slice(0,cantidad)
    const inserts=idsAAsignar.map(equipoId=>({
      cliente_id:selected.id,
      equipo_id:equipoId,
      fecha_asignacion:fechaAsig
    }))
    await supabase.from('cliente_equipos').insert(inserts)
    setModal(null);setForm({});fetchData()
    toast(`${cantidad} equipo${cantidad>1?'s':''} asignado${cantidad>1?'s':''} desde ${fechaAsig} ✓`,'success')
    if(onRefresh)onRefresh()
  }

  async function desasignarGrupo(clienteId, ids){
    await Promise.all(ids.map(equipoId=>
      supabase.from('cliente_equipos').delete().eq('cliente_id',clienteId).eq('equipo_id',equipoId)
    ))
    fetchData();toast('Equipo(s) removido(s)','info')
  }

  async function marcarPagado(cliente,tipo){
    const periodo=getPeriodo()
    const {usdMesFee,feePct}=calcClienteFee(cliente)
    const energiaTotal=calcEnergiaTotal(cliente)
    const monto=tipo==='hosting'
      ?(feePct>0&&usdMesFee?usdMesFee:Number(cliente.tarifa_mensual)||0)
      :energiaTotal
    const existe=pagos.find(p=>p.cliente_id===cliente.id&&p.periodo===periodo&&p.tipo===tipo)
    if(existe){ await supabase.from('pagos_clientes').update({estado:'pagado',fecha_pago:new Date().toISOString().slice(0,10),monto:Number(monto)||0}).eq('id',existe.id) }
    else{ await supabase.from('pagos_clientes').insert([{cliente_id:cliente.id,tipo,monto:Number(monto)||0,moneda:'USD',fecha_pago:new Date().toISOString().slice(0,10),periodo,estado:'pagado'}]) }
    await supabase.from('finanzas').insert([{tipo:'ingreso',monto:Number(monto)||0,moneda:'USD',descripcion:`${tipo==='hosting'?'Hosting':'Energía'}: ${cliente.nombre}`,categoria:tipo==='hosting'?'Hosting':'Energía',fecha:new Date().toISOString().slice(0,10),responsable:'Joel',pais:cliente.pais||'Paraguay'}])
    fetchData();toast(`${tipo==='hosting'?'Hosting':'Energía'} marcado como pagado ✓`,'success')
    if(onRefresh)onRefresh()
  }

  function iniciarEdicion(cliente){
    setEditando(cliente.id)
    setEditForm({
      nombre:cliente.nombre,contacto:cliente.contacto||'',
      pais:cliente.pais||'Paraguay',
      ubicacion_granja:cliente.ubicacion_granja||'Paraguay',
      dia_cobro:cliente.dia_cobro||1,
      fecha_inicio:cliente.fecha_inicio||'',
      fecha_vence_contrato:cliente.fecha_vence_contrato||'',
      notas:cliente.notas||'',pool_url:cliente.pool_url||''
    })
    setModal('editar')
  }

  async function guardarEdicion(){
    if(!editForm.nombre){toast('Nombre requerido','error');return}
    await supabase.from('clientes').update({
      nombre:editForm.nombre,contacto:editForm.contacto||'',
      pais:editForm.pais||'Paraguay',
      ubicacion_granja:editForm.ubicacion_granja||'Paraguay',
      dia_cobro:Number(editForm.dia_cobro)||1,
      fecha_inicio:editForm.fecha_inicio||null,
      fecha_vence_contrato:editForm.fecha_vence_contrato||null,
      notas:editForm.notas||'',pool_url:editForm.pool_url||null
    }).eq('id',editando)
    setModal(null);setEditando(null);setEditForm({})
    fetchData();toast('Cliente actualizado ✓','success')
    if(onRefresh)onRefresh()
  }

  async function del(id,nombre){
    if(!window.confirm(`¿Eliminar a ${nombre}? Esta acción no se puede deshacer.`)) return
    await supabase.from('clientes').delete().eq('id',id)
    fetchData();toast('Cliente eliminado','info')
    if(onRefresh)onRefresh()
  }

  const panel={background:'rgba(14,14,22,0.8)',backdropFilter:'blur(20px)',border:`1px solid ${C.border}`,borderRadius:12,overflow:'hidden'}
  const panelHdr={display:'flex',alignItems:'center',justifyContent:'space-between',padding:'13px 18px',borderBottom:`1px solid ${C.border}`,background:'rgba(255,255,255,0.015)'}
  const btn=(t)=>({display:'inline-flex',alignItems:'center',gap:5,padding:'6px 12px',borderRadius:7,border:'none',cursor:'pointer',fontFamily:'Inter,sans-serif',fontSize:10,fontWeight:600,letterSpacing:'.03em',transition:'all .2s',
    background:t==='gold'?`linear-gradient(135deg,#d4a843,#e8b84b)`:t==='green'?'rgba(16,185,129,0.12)':t==='ghost'?'rgba(255,255,255,0.06)':t==='wa'?'rgba(37,211,102,0.12)':t==='red'?'rgba(244,63,94,0.08)':t==='orange'?'rgba(247,147,26,0.1)':'rgba(255,255,255,0.04)',
    color:t==='gold'?'#000':t==='green'?C.green:t==='ghost'?C.t1:t==='wa'?'#25D366':t==='red'?C.red:t==='orange'?C.orange:C.t2,
    border:t==='green'?`1px solid rgba(16,185,129,0.25)`:t==='ghost'?`1px solid ${C.border}`:t==='wa'?'1px solid rgba(37,211,102,0.3)':t==='red'?'1px solid rgba(244,63,94,0.2)':t==='orange'?'1px solid rgba(247,147,26,0.25)':'none'
  })
  const fInput={width:'100%',background:'rgba(255,255,255,0.04)',border:`1px solid ${C.border2}`,borderRadius:8,padding:'10px 13px',color:C.t1,fontFamily:'Inter,sans-serif',fontSize:12,outline:'none',boxSizing:'border-box'}
  const fLabel={display:'block',fontSize:9,letterSpacing:'.15em',textTransform:'uppercase',color:C.t3,marginBottom:6,fontWeight:600}

  const SelectPaisCliente=({val,onChange})=>(
    <select style={fInput} value={val||'Paraguay'} onChange={onChange}>
      <option>Paraguay</option><option>Bolivia</option><option>Argentina</option>
      <option>Estados Unidos</option><option>Otro</option>
    </select>
  )
  const SelectGranja=({val,onChange})=>(
    <select style={fInput} value={val||'Paraguay'} onChange={onChange}>
      <option>Paraguay</option><option>Bolivia</option>
    </select>
  )

  const equiposAsignadosIds = clienteEquipos.map(ce=>ce.equipo_id)
  const equiposLibres = equipos.filter(e=>e.estado==='activo'&&!equiposAsignadosIds.includes(e.id))
  const modelosLibres = agruparEquipos(equiposLibres)

  if(loading)return <div style={{padding:40,textAlign:'center',color:C.t3,fontSize:11}}>Cargando...</div>

  return(
    <div>
      {/* BTC Banner */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12,padding:'10px 16px',background:'rgba(247,147,26,0.05)',border:'1px solid rgba(247,147,26,0.15)',borderRadius:10,flexWrap:'wrap',gap:8}}>
        <div style={{display:'flex',alignItems:'center',gap:16,flexWrap:'wrap'}}>
          <div style={{display:'flex',alignItems:'center',gap:7}}>
            <span style={{fontSize:16}}>₿</span>
            {miningLoading?<span style={{fontSize:10,color:C.t3}}>Cargando...</span>:(
              <span style={{fontFamily:'monospace',fontWeight:700,fontSize:16,color:C.orange}}>{btcPrice?`$${btcPrice.toLocaleString()}`:'—'}</span>
            )}
            <span style={{fontSize:9,color:C.t3}}>USD/BTC</span>
          </div>
          {difficulty&&<div style={{display:'flex',alignItems:'center',gap:5}}>
            <span style={{fontSize:9,color:C.t3}}>Dificultad:</span>
            <span style={{fontFamily:'monospace',fontSize:10,color:C.t2,fontWeight:600}}>{(difficulty/1e12).toFixed(2)}T</span>
          </div>}
          {lastUpdate&&<span style={{fontSize:9,color:C.t3}}>· act. {lastUpdate.toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'})}</span>}
        </div>
        <button onClick={refetch} style={{...btn('orange'),padding:'5px 12px',fontSize:10}}>↻ Actualizar</button>
      </div>

      {/* Alertas */}
      {(alertasProximas.length>0||alertasVencidas.length>0)&&(
        <div style={{marginBottom:14,display:'flex',flexDirection:'column',gap:8}}>
          {alertasVencidas.length>0&&(
            <div style={{background:'rgba(244,63,94,0.08)',border:'1px solid rgba(244,63,94,0.25)',borderRadius:10,padding:'10px 16px',display:'flex',alignItems:'center',gap:10}}>
              <span style={{fontSize:16}}>🔴</span>
              <div style={{flex:1}}><div style={{fontSize:11,fontWeight:600,color:C.red}}>COBROS VENCIDOS</div><div style={{fontSize:10,color:C.t2,marginTop:2}}>{alertasVencidas.map(c=>c.nombre).join(', ')}</div></div>
            </div>
          )}
          {alertasProximas.length>0&&(
            <div style={{background:'rgba(245,158,11,0.08)',border:'1px solid rgba(245,158,11,0.25)',borderRadius:10,padding:'10px 16px',display:'flex',alignItems:'center',gap:10}}>
              <span style={{fontSize:16}}>🟡</span>
              <div style={{flex:1}}><div style={{fontSize:11,fontWeight:600,color:C.amber}}>COBROS PRÓXIMOS (5 días)</div><div style={{fontSize:10,color:C.t2,marginTop:2}}>{alertasProximas.map(c=>`${c.nombre} (${getDiasAlCobro(c)}d)`).join(', ')}</div></div>
            </div>
          )}
        </div>
      )}

      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
        <div style={{display:'flex',gap:4,background:'rgba(255,255,255,0.03)',padding:4,borderRadius:10}}>
          {[['lista','👥 Clientes'],['pagos','💰 Pagos'],['alertas','🔔 Alertas'],['calc','⛏ Calculadora']].map(([t,l])=>(
            <button key={t} onClick={()=>setTab(t)} style={{background:tab===t?'rgba(212,168,67,0.1)':'none',border:'none',cursor:'pointer',fontFamily:'Inter,sans-serif',fontSize:11,fontWeight:600,letterSpacing:'.05em',padding:'7px 14px',borderRadius:8,color:tab===t?C.gold2:C.t2,transition:'all .15s'}}>
              {l}{t==='alertas'&&(alertasProximas.length+alertasVencidas.length)>0&&<span style={{marginLeft:6,background:C.red,color:'#fff',fontSize:8,padding:'1px 5px',borderRadius:10,fontWeight:700}}>{alertasProximas.length+alertasVencidas.length}</span>}
            </button>
          ))}
        </div>
        <button style={{...btn('gold'),padding:'9px 18px',fontSize:12}} onClick={()=>setModal('cliente')}>+ Nuevo cliente</button>
      </div>

      {/* TAB LISTA */}
      {tab==='lista'&&<div style={{display:'flex',flexDirection:'column',gap:12}}>
        {clientes.map(c=>{
          const eqArr=getClienteEquiposArr(c.id)
          const asignacionesMap=getAsignacionesMap(c.id)
          const gruposEq=agruparEquipos(eqArr,asignacionesMap)
          const diasCobro=getDiasAlCobro(c)
          const estadoHosting=getEstadoPago(c)
          const estadoEnergia=getEstadoEnergia(c)
          const proximo=c.dia_cobro?getProximoCobro(c.dia_cobro):null
          const urgente=diasCobro!==null&&diasCobro<=5
          const vencido=diasCobro!==null&&diasCobro<0
          const {totalTH,equipCount,btcDiaTotal,feePct,btcDiaFee,btcMesFee,usdMesFee}=calcClienteFee(c)
          const energiaTotal=calcEnergiaTotal(c)
          const hasFee=feePct>0

          return(
            <div key={c.id} style={{...panel,border:`1px solid ${vencido&&estadoHosting!=='pagado'?'rgba(244,63,94,0.3)':urgente&&estadoHosting!=='pagado'?'rgba(245,158,11,0.2)':C.border}`}}>
              <div style={{padding:'14px 18px',borderBottom:`1px solid ${C.border}`}}>
                <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:12}}>
                  <div style={{width:40,height:40,borderRadius:'50%',background:`linear-gradient(135deg,rgba(212,168,67,0.5),${C.gold})`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:700,color:'#000',flexShrink:0}}>{initials(c.nombre)}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:15,fontWeight:700}}>{c.nombre}</div>
                    <div style={{fontSize:10,color:C.t3,marginTop:2,display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
                      <span>{c.pais}</span><span>·</span>
                      <span>{equipCount} equipo{equipCount!==1?'s':''}</span><span>·</span>
                      <span>{totalTH} TH/s</span>
                      {c.ubicacion_granja&&<span style={{padding:'1px 7px',borderRadius:8,background:'rgba(99,102,241,0.1)',color:C.blue,border:'1px solid rgba(99,102,241,0.2)',fontSize:9}}>🏭 {c.ubicacion_granja}</span>}
                      {c.contacto&&<span>· {c.contacto}</span>}
                    </div>
                  </div>
                  <div style={{textAlign:'right',flexShrink:0}}>
                    {hasFee&&btcMesFee?(
                      <>
                        <div style={{...num,fontSize:14,color:C.orange}}>{btcFmt(btcMesFee)}</div>
                        {usdMesFee&&<div style={{...num,fontSize:12,color:C.gold2}}>≈ {money(usdMesFee)}</div>}
                        <div style={{fontSize:9,color:C.t3,marginTop:1}}>fee hosting {feePct}%/mes</div>
                      </>
                    ):(
                      <>
                        <div style={{...num,fontSize:15,color:C.gold2}}>{money(c.tarifa_mensual)}</div>
                        <div style={{fontSize:9,color:C.t3}}>hosting/mes</div>
                      </>
                    )}
                    {energiaTotal>0&&<div style={{fontSize:10,color:C.amber,marginTop:3}}>⚡ {money(energiaTotal)}/mes energía</div>}
                  </div>
                  <button style={{...btn('ghost'),padding:'5px 9px',flexShrink:0}} onClick={()=>iniciarEdicion(c)} title="Editar">✏️</button>
                  <button style={{...btn('red'),padding:'5px 9px',flexShrink:0}} onClick={()=>del(c.id,c.nombre)} title="Eliminar">🗑</button>
                </div>

                <div style={{display:'flex',alignItems:'center',gap:7,marginBottom:10,flexWrap:'wrap'}}>
                  <span style={{fontSize:9,color:C.t3,letterSpacing:'.1em',textTransform:'uppercase',fontWeight:600}}>Fee hosting:</span>
                  {FEE_OPTIONS.map(pct=>(
                    <button key={pct} onClick={()=>setFee(c.id,pct)}
                      style={{padding:'4px 11px',borderRadius:6,border:'none',cursor:'pointer',fontFamily:'monospace',fontSize:11,fontWeight:700,transition:'all .15s',
                        background:feePct===pct?'rgba(247,147,26,0.2)':'rgba(255,255,255,0.04)',
                        color:feePct===pct?C.orange:C.t3,
                        outline:feePct===pct?`1px solid rgba(247,147,26,0.5)`:'1px solid rgba(255,255,255,0.06)',
                      }}>{pct}%</button>
                  ))}
                  {hasFee&&<button onClick={()=>setFee(c.id,0)} style={{padding:'4px 9px',borderRadius:6,border:`1px solid ${C.border}`,background:'none',cursor:'pointer',fontSize:10,color:C.t3,fontFamily:'Inter,sans-serif'}}>✕</button>}
                </div>

                {equipCount>0&&btcDiaTotal!=null?(
                  <div style={{display:'flex',alignItems:'center',gap:12,padding:'8px 12px',background:'rgba(247,147,26,0.04)',border:'1px solid rgba(247,147,26,0.1)',borderRadius:8,flexWrap:'wrap',marginBottom:10}}>
                    <div style={{display:'flex',alignItems:'center',gap:5}}>
                      <span style={{fontSize:10,color:C.t3}}>⛏ Producción:</span>
                      <span style={{fontFamily:'monospace',fontSize:12,fontWeight:700,color:C.orange}}>{btcFmt(btcDiaTotal)}<span style={{color:C.t3,fontSize:9}}>/día</span></span>
                      <span style={{fontFamily:'monospace',fontSize:10,color:C.t2}}>· {btcFmt(btcDiaTotal*30)}/mes</span>
                    </div>
                    {hasFee&&btcDiaFee&&<>
                      <span style={{color:C.t3,fontSize:11}}>→</span>
                      <div style={{display:'flex',alignItems:'center',gap:5}}>
                        <span style={{fontSize:10,color:C.amber}}>Fee {feePct}%:</span>
                        <span style={{fontFamily:'monospace',fontSize:12,fontWeight:700,color:C.gold2}}>{btcFmt(btcDiaFee)}<span style={{color:C.t3,fontSize:9}}>/día</span></span>
                        {btcPrice&&<span style={{fontSize:10,color:C.t3}}>≈ {money(btcDiaFee*btcPrice)}/día</span>}
                      </div>
                    </>}
                  </div>
                ):(
                  equipCount===0&&<div style={{fontSize:10,color:C.t3,fontStyle:'italic',marginBottom:10}}>⚠ Sin equipos asignados — asigná equipos para calcular producción BTC</div>
                )}

                <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                  <div style={{display:'flex',alignItems:'center',gap:6,background:'rgba(255,255,255,0.03)',border:`1px solid ${C.border}`,borderRadius:7,padding:'6px 12px'}}>
                    <span style={{fontSize:9,color:C.t3}}>📅 Próximo cobro hosting:</span>
                    {editandoDia===c.id?(
                      <div style={{display:'flex',alignItems:'center',gap:4}}>
                        <input type="number" min="1" max="31" value={diaTemp} onChange={e=>setDiaTemp(e.target.value)}
                          onKeyDown={e=>{if(e.key==='Enter')guardarDia(c);if(e.key==='Escape')setEditandoDia(null)}}
                          style={{width:36,background:'rgba(255,255,255,0.08)',border:`1px solid ${C.gold}`,borderRadius:4,padding:'2px 4px',color:C.gold2,fontFamily:'monospace',fontSize:11,fontWeight:700,outline:'none',textAlign:'center'}}
                          autoFocus/>
                        <button onClick={()=>guardarDia(c)} style={{background:'rgba(16,185,129,0.15)',border:'1px solid rgba(16,185,129,0.3)',borderRadius:4,padding:'2px 6px',cursor:'pointer',color:C.green,fontSize:10,fontFamily:'Inter,sans-serif'}}>✓</button>
                        <button onClick={()=>setEditandoDia(null)} style={{background:'rgba(255,255,255,0.06)',border:`1px solid ${C.border}`,borderRadius:4,padding:'2px 6px',cursor:'pointer',color:C.t3,fontSize:10,fontFamily:'Inter,sans-serif'}}>×</button>
                      </div>
                    ):(
                      <span onClick={()=>iniciarEditDia(c)} style={{...num,fontSize:11,color:vencido?C.red:urgente?C.amber:C.t1,cursor:'pointer',borderBottom:`1px dashed ${C.t3}`}}>{proximo||'—'}</span>
                    )}
                    {editandoDia!==c.id&&diasCobro!==null&&(
                      <span style={{fontSize:9,color:vencido?C.red:urgente?C.amber:C.t3}}>({vencido?`vencido ${Math.abs(diasCobro)}d`:diasCobro===0?'hoy':`en ${diasCobro}d`})</span>
                    )}
                  </div>
                  <span style={{fontSize:9,padding:'4px 10px',borderRadius:10,background:estadoHosting==='pagado'?'rgba(16,185,129,0.1)':'rgba(244,63,94,0.1)',color:estadoHosting==='pagado'?C.green:C.red,border:`1px solid ${estadoHosting==='pagado'?'rgba(16,185,129,0.2)':'rgba(244,63,94,0.2)'}`}}>
                    {estadoHosting==='pagado'?'✅ Hosting pagado':'⏳ Hosting pendiente'}
                  </span>
                  <span style={{fontSize:9,padding:'4px 10px',borderRadius:10,background:estadoEnergia==='pagado'?'rgba(16,185,129,0.1)':'rgba(245,158,11,0.08)',color:estadoEnergia==='pagado'?C.green:C.amber,border:`1px solid ${estadoEnergia==='pagado'?'rgba(16,185,129,0.2)':'rgba(245,158,11,0.2)'}`}}>
                    {estadoEnergia==='pagado'?'✅ Energía pagada':'⚡ Energía pendiente'}
                  </span>
                  <button style={{...btn('wa'),padding:'6px 12px',fontSize:10}} onClick={()=>abrirWhatsApp(c)}>📲 WhatsApp</button>
                  {c.pool_url&&<button style={{...btn('orange'),padding:'6px 12px',fontSize:10}} onClick={()=>window.open(c.pool_url,'_blank')}>⛏ Ver Pool</button>}
                </div>
              </div>

              {/* Grid: Equipos / Hosting / Energía */}
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:0}}>
                <div style={{padding:'14px 16px',borderRight:`1px solid ${C.border}`}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
                    <span style={{fontSize:10,color:C.t3,textTransform:'uppercase',letterSpacing:'.08em',fontWeight:600}}>⛏ Equipos</span>
                    <button style={btn('ghost')} onClick={()=>{setSelected(c);setModal('equipo')}}>+ Asignar</button>
                  </div>
                  {gruposEq.length===0&&<div style={{fontSize:10,color:C.t3,fontStyle:'italic'}}>Sin equipos</div>}
                  {gruposEq.map((grupo,i)=>{
                    const eqBtcDayUnit=calcBtcDay(Number(grupo.hashrate||0))
                    const eqBtcDayTotal=eqBtcDayUnit?eqBtcDayUnit*grupo.cantidad:null
                    const eqFeeDayTotal=eqBtcDayTotal&&feePct?eqBtcDayTotal*(feePct/100):null
                    const eqEnergiaUnit=calcEnergiaEquipo(Number(grupo.hashrate||0))
                    const eqEnergiaTotal=eqEnergiaUnit*grupo.cantidad
                    // Próximo cobro de energía basado en fecha de asignación
                    const proximoCobro=grupo.fechaAsignacion?getProximoCobroDesde(grupo.fechaAsignacion):null
                    const diasProximo=proximoCobro?daysUntil(proximoCobro):null
                    const diaDelMes=grupo.fechaAsignacion?new Date(grupo.fechaAsignacion+'T12:00:00').getDate():null
                    return(
                      <div key={i} style={{marginBottom:8,padding:'8px 10px',background:'rgba(255,255,255,0.03)',borderRadius:8,border:`1px solid ${C.border}`}}>
                        <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:4}}>
                          <span style={{width:6,height:6,borderRadius:'50%',background:grupo.estado==='activo'?C.green:C.amber,flexShrink:0}}/>
                          <span style={{flex:1,fontSize:10,fontWeight:600}}>{grupo.modelo}</span>
                          <span style={{background:'rgba(212,168,67,0.15)',border:`1px solid rgba(212,168,67,0.3)`,borderRadius:6,padding:'2px 8px',fontFamily:'monospace',fontSize:11,fontWeight:700,color:C.gold2}}>×{grupo.cantidad}</span>
                          <span style={{...num,fontSize:10,color:C.t2}}>{grupo.hashrate}TH</span>
                          <button style={{background:'none',border:'none',cursor:'pointer',color:C.t3,fontSize:12,padding:'0 2px'}} onClick={()=>desasignarGrupo(c.id,[grupo.ids[grupo.ids.length-1]])} title="Quitar 1">−</button>
                          {grupo.cantidad>1&&<button style={{background:'none',border:'none',cursor:'pointer',color:C.red,fontSize:9,padding:'0 2px',fontFamily:'Inter,sans-serif'}} onClick={()=>desasignarGrupo(c.id,grupo.ids)} title="Quitar todas">✕</button>}
                        </div>
                        <div style={{paddingLeft:12,display:'flex',flexDirection:'column',gap:3}}>
                          <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
                            {eqBtcDayTotal!=null&&<span style={{fontSize:9,fontFamily:'monospace',color:C.orange}}>{btcFmt(eqBtcDayTotal)}/día{eqFeeDayTotal&&<span style={{color:C.t3}}> → fee: {btcFmt(eqFeeDayTotal)}</span>}</span>}
                            <span style={{fontSize:9,color:C.amber}}>⚡ {money(eqEnergiaTotal)}/mes</span>
                          </div>
                          {/* Ciclo de cobro de energía */}
                          {grupo.fechaAsignacion&&(
                            <div style={{display:'flex',alignItems:'center',gap:5}}>
                              <span style={{fontSize:8,color:C.t3}}>📅 energía cobra día</span>
                              <span style={{fontSize:9,fontFamily:'monospace',fontWeight:700,color:C.blue}}>{diaDelMes}</span>
                              <span style={{fontSize:8,color:C.t3}}>c/mes</span>
                              {diasProximo!==null&&<span style={{fontSize:8,padding:'1px 5px',borderRadius:5,background:diasProximo<=3?'rgba(244,63,94,0.1)':'rgba(99,102,241,0.1)',color:diasProximo<=3?C.red:C.blue}}>{diasProximo===0?'hoy':`en ${diasProximo}d`}</span>}
                            </div>
                          )}
                          {grupo.fechaAsignacion&&(
                            <div style={{fontSize:8,color:C.t3}}>desde {grupo.fechaAsignacion}</div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>

                <div style={{padding:'14px 16px',borderRight:`1px solid ${C.border}`}}>
                  <div style={{fontSize:10,color:C.t3,textTransform:'uppercase',letterSpacing:'.08em',fontWeight:600,marginBottom:10}}>💳 Hosting — {getPeriodo()}</div>
                  <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:10}}>
                    <span style={{fontSize:18,padding:'6px 10px',background:estadoHosting==='pagado'?'rgba(16,185,129,0.1)':'rgba(244,63,94,0.08)',borderRadius:8,border:`1px solid ${estadoHosting==='pagado'?'rgba(16,185,129,0.2)':'rgba(244,63,94,0.15)'}`}}>
                      {estadoHosting==='pagado'?'✅':'⏳'}
                    </span>
                    <div>
                      <div style={{fontSize:11,fontWeight:600,color:estadoHosting==='pagado'?C.green:C.red}}>{estadoHosting==='pagado'?'Pagado':'Pendiente'}</div>
                      {hasFee&&btcMesFee?(
                        <><div style={{...num,fontSize:12,color:C.orange}}>{btcFmt(btcMesFee)}</div>
                        {usdMesFee&&<div style={{fontSize:10,color:C.gold2,fontFamily:'monospace'}}>≈ {money(usdMesFee)}</div>}</>
                      ):(
                        <div style={{...num,fontSize:12,color:C.gold2}}>{money(c.tarifa_mensual)}</div>
                      )}
                    </div>
                  </div>
                  {estadoHosting!=='pagado'&&<button style={btn('green')} onClick={()=>marcarPagado(c,'hosting')}>✓ Marcar pagado</button>}
                </div>

                <div style={{padding:'14px 16px'}}>
                  <div style={{fontSize:10,color:C.t3,textTransform:'uppercase',letterSpacing:'.08em',fontWeight:600,marginBottom:10}}>⚡ Energía — {getPeriodo()}</div>
                  <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:10}}>
                    <span style={{fontSize:18,padding:'6px 10px',background:estadoEnergia==='pagado'?'rgba(16,185,129,0.1)':'rgba(245,158,11,0.08)',borderRadius:8,border:`1px solid ${estadoEnergia==='pagado'?'rgba(16,185,129,0.2)':'rgba(245,158,11,0.2)'}`}}>
                      {estadoEnergia==='pagado'?'✅':'⚡'}
                    </span>
                    <div>
                      <div style={{fontSize:11,fontWeight:600,color:estadoEnergia==='pagado'?C.green:C.amber}}>{estadoEnergia==='pagado'?'Pagado':'Pendiente'}</div>
                      {energiaTotal>0?(
                        <><div style={{...num,fontSize:12,color:C.gold2}}>{money(energiaTotal)}</div>
                        <div style={{fontSize:9,color:C.t3,marginTop:1}}>{eqArr.length} equipo{eqArr.length!==1?'s':''} · auto-calculado</div></>
                      ):(
                        <div style={{fontSize:10,color:C.t3}}>Sin equipos asignados</div>
                      )}
                    </div>
                  </div>
                  {/* Detalle de energía por grupo con su fecha */}
                  {gruposEq.length>1&&(
                    <div style={{marginBottom:8}}>
                      {gruposEq.map((g,i)=>{
                        const en=calcEnergiaEquipo(Number(g.hashrate||0))*g.cantidad
                        const diaG=g.fechaAsignacion?new Date(g.fechaAsignacion+'T12:00:00').getDate():null
                        return(
                          <div key={i} style={{display:'flex',justifyContent:'space-between',fontSize:8,color:C.t3,padding:'2px 0',borderBottom:`1px solid rgba(255,255,255,0.03)`}}>
                            <span>{g.modelo.replace('Antminer ','').replace(/\s*\(.*\)/,'')} ×{g.cantidad}{diaG?` · día ${diaG}`:''}</span>
                            <span style={{color:C.amber,fontFamily:'monospace'}}>{money(en)}</span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                  {energiaTotal>0&&estadoEnergia!=='pagado'&&<button style={{...btn('ghost'),border:`1px solid rgba(245,158,11,0.3)`,color:C.amber}} onClick={()=>marcarPagado(c,'energia')}>✓ Marcar pagado</button>}
                </div>
              </div>

              {(c.fecha_vence_contrato||c.notas)&&(
                <div style={{padding:'8px 16px',borderTop:`1px solid ${C.border}`,background:'rgba(255,255,255,0.01)',display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
                  {c.fecha_vence_contrato&&<><span style={{fontSize:10,color:C.t3}}>📄 Contrato vence:</span><span style={{...num,fontSize:10,color:daysUntil(c.fecha_vence_contrato)<30?C.amber:C.t2}}>{c.fecha_vence_contrato}</span><span style={{fontSize:9,color:C.t3}}>({daysUntil(c.fecha_vence_contrato)}d)</span></>}
                  {c.notas&&<span style={{marginLeft:4,fontSize:9,color:C.t3,fontStyle:'italic'}}>📝 {c.notas}</span>}
                </div>
              )}
            </div>
          )
        })}
        {!clientes.length&&<div style={{...panel,padding:40,color:C.t3,textAlign:'center',fontSize:12,textTransform:'uppercase'}}>Sin clientes registrados</div>}
      </div>}

      {tab==='calc'&&<CalculadoraTab equipos={equipos} btcPrice={btcPrice} calcBtcDay={calcBtcDay} difficulty={difficulty} C={C} num={num} money={money} btcFmt={btcFmt} btn={btn}/>}

      {tab==='pagos'&&<div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10,marginBottom:14}}>
          {[
            {label:'Hosting cobrado este mes',val:money(pagos.filter(p=>p.tipo==='hosting'&&p.estado==='pagado'&&p.periodo===getPeriodo()).reduce((a,b)=>a+Number(b.monto),0)),color:C.green},
            {label:'Energía cobrada este mes',val:money(pagos.filter(p=>p.tipo==='energia'&&p.estado==='pagado'&&p.periodo===getPeriodo()).reduce((a,b)=>a+Number(b.monto),0)),color:C.amber},
            {label:'Pendiente (hosting + energía)',val:money(clientes.reduce((a,c)=>{
              const{usdMesFee,feePct,btcMesFee}=calcClienteFee(c)
              const energiaTotal=calcEnergiaTotal(c)
              const hostingUsd=feePct>0&&usdMesFee?usdMesFee:(feePct>0&&btcMesFee&&btcPrice?btcMesFee*btcPrice:Number(c.tarifa_mensual)||0)
              const hosting=getEstadoPago(c)!=='pagado'?hostingUsd:0
              const energia=getEstadoEnergia(c)!=='pagado'?energiaTotal:0
              return a+hosting+energia
            },0)),color:C.red},
          ].map(s=>(
            <div key={s.label} style={{background:'rgba(14,14,22,0.8)',border:`1px solid ${C.border}`,borderRadius:12,padding:'14px 18px'}}>
              <div style={{fontSize:9,color:C.t3,textTransform:'uppercase',marginBottom:8}}>{s.label}</div>
              <div style={{...num,fontSize:20,color:s.color}}>{s.val}</div>
            </div>
          ))}
        </div>
        <div style={panel}>
          <div style={panelHdr}><span style={{fontSize:10,color:C.t2,textTransform:'uppercase',letterSpacing:'.1em',fontWeight:600}}>Historial de pagos</span></div>
          {pagos.slice(0,30).map(p=>{
            const cliente=clientes.find(c=>c.id===p.cliente_id)
            return(
              <div key={p.id} style={{display:'flex',alignItems:'center',gap:10,padding:'11px 16px',borderBottom:`1px solid ${C.border}`}}>
                <span style={{width:7,height:7,borderRadius:'50%',background:p.tipo==='hosting'?C.blue:C.amber,flexShrink:0}}/>
                <div style={{flex:1}}><div style={{fontSize:11,fontWeight:600}}>{cliente?.nombre||'—'}</div><div style={{fontSize:9,color:C.t3}}>{p.tipo==='hosting'?'Hosting':'Energía'} · {p.periodo}</div></div>
                <span style={{fontSize:9,color:C.t3}}>{p.fecha_pago}</span>
                <span style={{fontSize:9,padding:'3px 9px',borderRadius:10,background:p.estado==='pagado'?'rgba(16,185,129,0.1)':'rgba(244,63,94,0.1)',color:p.estado==='pagado'?C.green:C.red,border:`1px solid ${p.estado==='pagado'?'rgba(16,185,129,0.2)':'rgba(244,63,94,0.2)'}`}}>{p.estado}</span>
                <div style={{textAlign:'right'}}><div style={{...num,fontSize:12,color:C.gold2}}>{money(p.monto)}</div>{btcPrice&&<div style={{fontSize:9,color:C.orange,fontFamily:'monospace'}}>{btcFmt(Number(p.monto)/btcPrice)}</div>}</div>
              </div>
            )
          })}
          {!pagos.length&&<div style={{padding:40,color:C.t3,textAlign:'center',fontSize:11}}>Sin historial de pagos</div>}
        </div>
      </div>}

      {tab==='alertas'&&<div style={{display:'flex',flexDirection:'column',gap:10}}>
        {[...alertasVencidas,...alertasProximas].map(c=>{
          const dias=getDiasAlCobro(c); const vencido=dias<0
          const{btcMesFee,feePct,usdMesFee}=calcClienteFee(c)
          const energiaTotal=calcEnergiaTotal(c)
          return(
            <div key={c.id} style={{...panel,border:`1px solid ${vencido?'rgba(244,63,94,0.3)':'rgba(245,158,11,0.3)'}`}}>
              <div style={{display:'flex',alignItems:'center',gap:12,padding:'16px 18px'}}>
                <span style={{fontSize:26}}>{vencido?'🔴':'🟡'}</span>
                <div style={{flex:1}}><div style={{fontSize:14,fontWeight:700}}>{c.nombre}</div><div style={{fontSize:10,color:C.t3,marginTop:2}}>{c.pais} · Día de cobro: {c.dia_cobro}</div></div>
                <div style={{textAlign:'right'}}>
                  <div style={{...num,fontSize:17,color:vencido?C.red:C.amber}}>{vencido?`${Math.abs(dias)}d vencido`:`${dias}d para cobrar`}</div>
                  {feePct>0&&btcMesFee?(<><div style={{...num,fontSize:13,color:C.orange,marginTop:4}}>{btcFmt(btcMesFee)}</div>{usdMesFee&&<div style={{fontSize:10,color:C.gold2}}>≈ {money(usdMesFee)} hosting</div>}</>):(<div style={{...num,fontSize:14,color:C.gold2,marginTop:4}}>{money(c.tarifa_mensual)} hosting</div>)}
                  {energiaTotal>0&&<div style={{fontSize:10,color:C.amber,marginTop:2}}>+ {money(energiaTotal)} energía</div>}
                </div>
              </div>
              <div style={{display:'flex',gap:8,padding:'12px 18px',borderTop:`1px solid ${C.border}`,flexWrap:'wrap'}}>
                {getEstadoPago(c)!=='pagado'&&<button style={btn('green')} onClick={()=>marcarPagado(c,'hosting')}>✓ Hosting pagado</button>}
                {energiaTotal>0&&getEstadoEnergia(c)!=='pagado'&&<button style={{...btn('ghost'),border:`1px solid rgba(245,158,11,0.3)`,color:C.amber}} onClick={()=>marcarPagado(c,'energia')}>✓ Energía pagada</button>}
                <button style={btn('wa')} onClick={()=>abrirWhatsApp(c)}>📲 WhatsApp</button>
              </div>
            </div>
          )
        })}
        {alertasProximas.length===0&&alertasVencidas.length===0&&<div style={{...panel,padding:40,color:C.green,textAlign:'center',fontSize:13}}>✓ Sin alertas pendientes — todo al día</div>}
      </div>}

      {/* MODAL */}
      {modal&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.85)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',backdropFilter:'blur(6px)',padding:16}} onClick={e=>{if(e.target===e.currentTarget){setModal(null);setForm({});setSelected(null);setEditando(null);setEditForm({})}}}>
          <div style={{background:'linear-gradient(135deg,rgba(16,16,26,0.99),rgba(12,12,20,0.99))',border:`1px solid ${C.border2}`,borderRadius:16,width:'100%',maxWidth:520,maxHeight:'90vh',overflowY:'auto',boxShadow:'0 32px 80px rgba(0,0,0,0.7)'}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'16px 20px',borderBottom:`1px solid ${C.border}`}}>
              <div style={{fontFamily:'monospace',fontSize:12,fontWeight:700,letterSpacing:'.08em'}}>
                {modal==='cliente'?'NUEVO CLIENTE':modal==='editar'?'EDITAR CLIENTE':'ASIGNAR EQUIPO'}
              </div>
              <button style={{background:'rgba(255,255,255,0.06)',border:`1px solid ${C.border}`,color:C.t2,width:30,height:30,borderRadius:6,cursor:'pointer',fontSize:17,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={()=>{setModal(null);setForm({});setSelected(null);setEditando(null);setEditForm({})}}>×</button>
            </div>
            <div style={{padding:20}}>

              {modal==='cliente'&&<>
                <div style={{marginBottom:12}}><label style={fLabel}>Nombre completo</label><input style={fInput} placeholder="Ej: Carlos Reyes" value={form.nombre||''} onChange={e=>setForm({...form,nombre:e.target.value})}/></div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:12}}>
                  <div><label style={fLabel}>Contacto / WhatsApp</label><input style={fInput} placeholder="+1 786..." value={form.contacto||''} onChange={e=>setForm({...form,contacto:e.target.value})}/></div>
                  <div><label style={fLabel}>País del cliente</label><SelectPaisCliente val={form.pais} onChange={e=>setForm({...form,pais:e.target.value})}/></div>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:12}}>
                  <div><label style={fLabel}>Día de cobro hosting (1-31)</label><input style={fInput} type="number" min="1" max="31" placeholder="15" value={form.dia_cobro||''} onChange={e=>setForm({...form,dia_cobro:e.target.value})}/></div>
                  <div><label style={fLabel}>Ubicación de la granja</label><SelectGranja val={form.ubicacion_granja} onChange={e=>setForm({...form,ubicacion_granja:e.target.value})}/></div>
                </div>
                <div style={{marginBottom:12,padding:'10px 14px',background:'rgba(99,102,241,0.05)',border:'1px solid rgba(99,102,241,0.15)',borderRadius:8}}>
                  <div style={{fontSize:10,color:C.blue,fontWeight:600,marginBottom:4}}>ℹ Energía — ciclo independiente por equipo</div>
                  <div style={{fontSize:9,color:C.t3}}>Cada equipo cobra energía desde su fecha de asignación. Hydro (≥300TH): $163/mes · Aire: $90/mes</div>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:12}}>
                  <div><label style={fLabel}>Inicio contrato</label><input style={fInput} type="date" value={form.fecha_inicio||''} onChange={e=>setForm({...form,fecha_inicio:e.target.value})}/></div>
                  <div><label style={fLabel}>Vence contrato</label><input style={fInput} type="date" value={form.fecha_vence_contrato||''} onChange={e=>setForm({...form,fecha_vence_contrato:e.target.value})}/></div>
                </div>
                <div style={{marginBottom:12}}><label style={fLabel}>Link del Pool (f2pool, etc)</label><input style={fInput} placeholder="https://f2pool.com/mining-user/..." value={form.pool_url||''} onChange={e=>setForm({...form,pool_url:e.target.value})}/></div>
                <div style={{marginBottom:12}}><label style={fLabel}>Notas</label><input style={fInput} placeholder="Observaciones..." value={form.notas||''} onChange={e=>setForm({...form,notas:e.target.value})}/></div>
                <div style={{display:'flex',gap:8,justifyContent:'flex-end',paddingTop:14,borderTop:`1px solid ${C.border}`}}>
                  <button style={btn('ghost')} onClick={()=>{setModal(null);setForm({})}}>Cancelar</button>
                  <button style={{...btn('gold'),padding:'9px 18px',fontSize:12}} onClick={addCliente}>✓ Guardar</button>
                </div>
              </>}

              {modal==='editar'&&<>
                <div style={{marginBottom:12}}><label style={fLabel}>Nombre completo</label><input style={fInput} value={editForm.nombre||''} onChange={e=>setEditForm({...editForm,nombre:e.target.value})}/></div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:12}}>
                  <div><label style={fLabel}>Contacto / WhatsApp</label><input style={fInput} value={editForm.contacto||''} onChange={e=>setEditForm({...editForm,contacto:e.target.value})}/></div>
                  <div><label style={fLabel}>País del cliente</label><SelectPaisCliente val={editForm.pais} onChange={e=>setEditForm({...editForm,pais:e.target.value})}/></div>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:12}}>
                  <div><label style={fLabel}>Día de cobro hosting (1-31)</label><input style={fInput} type="number" min="1" max="31" value={editForm.dia_cobro||''} onChange={e=>setEditForm({...editForm,dia_cobro:e.target.value})}/></div>
                  <div><label style={fLabel}>Ubicación de la granja</label><SelectGranja val={editForm.ubicacion_granja} onChange={e=>setEditForm({...editForm,ubicacion_granja:e.target.value})}/></div>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:12}}>
                  <div><label style={fLabel}>Inicio contrato</label><input style={fInput} type="date" value={editForm.fecha_inicio||''} onChange={e=>setEditForm({...editForm,fecha_inicio:e.target.value})}/></div>
                  <div><label style={fLabel}>Vence contrato</label><input style={fInput} type="date" value={editForm.fecha_vence_contrato||''} onChange={e=>setEditForm({...editForm,fecha_vence_contrato:e.target.value})}/></div>
                </div>
                <div style={{marginBottom:12}}><label style={fLabel}>Link del Pool (f2pool, etc)</label><input style={fInput} placeholder="https://f2pool.com/mining-user/..." value={editForm.pool_url||''} onChange={e=>setEditForm({...editForm,pool_url:e.target.value})}/></div>
                <div style={{marginBottom:12}}><label style={fLabel}>Notas</label><input style={fInput} value={editForm.notas||''} onChange={e=>setEditForm({...editForm,notas:e.target.value})}/></div>
                <div style={{display:'flex',gap:8,justifyContent:'flex-end',paddingTop:14,borderTop:`1px solid ${C.border}`}}>
                  <button style={btn('ghost')} onClick={()=>{setModal(null);setEditando(null);setEditForm({})}}>Cancelar</button>
                  <button style={{...btn('gold'),padding:'9px 18px',fontSize:12}} onClick={guardarEdicion}>✓ Guardar cambios</button>
                </div>
              </>}

              {/* ASIGNAR EQUIPO con fecha de asignación y botones +/- */}
              {modal==='equipo'&&<>
                <div style={{marginBottom:16}}>
                  <div style={{fontSize:12,color:C.t2,marginBottom:14}}>Asignando equipo a: <strong style={{color:C.t1}}>{selected?.nombre}</strong></div>
                  <label style={fLabel}>Seleccionar modelo</label>
                  {modelosLibres.length===0?(
                    <div style={{fontSize:11,color:C.t3,fontStyle:'italic',padding:'12px 0'}}>No hay equipos libres disponibles</div>
                  ):(
                    <div style={{display:'flex',flexDirection:'column',gap:6}}>
                      {modelosLibres.map((grupo,i)=>{
                        const eqBtcDay=calcBtcDay(Number(grupo.hashrate||0))
                        const eqEnergia=calcEnergiaEquipo(Number(grupo.hashrate||0))
                        const isSelected=form.equipo_id===grupo.ids[0]
                        return(
                          <div key={i} onClick={()=>setForm({...form,equipo_id:grupo.ids[0],cantidad_asignar:1})}
                            style={{padding:'10px 14px',borderRadius:8,border:`1px solid ${isSelected?'rgba(247,147,26,0.5)':C.border}`,background:isSelected?'rgba(247,147,26,0.08)':'rgba(255,255,255,0.02)',cursor:'pointer',transition:'all .15s'}}>
                            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
                              <span style={{flex:1,fontSize:11,fontWeight:700,color:isSelected?C.orange:C.t1}}>{grupo.modelo}</span>
                              <span style={{background:'rgba(212,168,67,0.15)',border:`1px solid rgba(212,168,67,0.3)`,borderRadius:6,padding:'2px 10px',fontFamily:'monospace',fontSize:12,fontWeight:700,color:C.gold2}}>{grupo.cantidad} libre{grupo.cantidad!==1?'s':''}</span>
                              <span style={{...num,fontSize:11,color:C.t2}}>{grupo.hashrate} TH/s</span>
                            </div>
                            <div style={{display:'flex',gap:12}}>
                              {eqBtcDay&&<span style={{fontSize:9,fontFamily:'monospace',color:C.orange}}>{btcFmt(eqBtcDay)}/día por unidad</span>}
                              <span style={{fontSize:9,color:C.amber}}>⚡ {money(eqEnergia)}/mes c/u</span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* Cantidad +/- */}
                {form.equipo_id&&(()=>{
                  const grupo=modelosLibres.find(g=>g.ids[0]===form.equipo_id)
                  const max=grupo?grupo.ids.length:1
                  const qty=Number(form.cantidad_asignar)||1
                  const eqEnergia=grupo?calcEnergiaEquipo(Number(grupo.hashrate||0))*qty:0
                  const eqBtcDay=grupo?calcBtcDay(Number(grupo.hashrate||0)):null
                  return(
                    <div style={{marginBottom:14,padding:'14px 16px',background:'rgba(212,168,67,0.05)',border:'1px solid rgba(212,168,67,0.2)',borderRadius:10}}>
                      <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:10}}>
                        <span style={{fontSize:10,color:C.t2,fontWeight:600,flex:1}}>Cantidad a asignar:</span>
                        <div style={{display:'flex',alignItems:'center',gap:8}}>
                          <button onClick={e=>{e.stopPropagation();setForm({...form,cantidad_asignar:Math.max(1,qty-1)})}}
                            style={{width:32,height:32,borderRadius:8,background:'rgba(255,255,255,0.06)',border:`1px solid ${C.border2}`,color:C.t1,fontSize:18,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700,fontFamily:'monospace'}}>−</button>
                          <span style={{fontFamily:'monospace',fontSize:22,fontWeight:800,color:C.gold2,minWidth:36,textAlign:'center'}}>{qty}</span>
                          <button onClick={e=>{e.stopPropagation();setForm({...form,cantidad_asignar:Math.min(max,qty+1)})}}
                            style={{width:32,height:32,borderRadius:8,background:'rgba(255,255,255,0.06)',border:`1px solid ${C.border2}`,color:C.t1,fontSize:18,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700,fontFamily:'monospace'}}>+</button>
                        </div>
                        <span style={{fontSize:9,color:C.t3}}>de {max} disponible{max!==1?'s':''}</span>
                      </div>
                      <div style={{display:'flex',gap:16,fontSize:9,color:C.t3,marginBottom:10}}>
                        {eqBtcDay&&<span>⛏ <span style={{color:C.orange,fontFamily:'monospace'}}>{btcFmt(eqBtcDay*qty)}</span>/día total</span>}
                        <span>⚡ <span style={{color:C.amber}}>{money(eqEnergia)}</span>/mes total</span>
                      </div>
                      {/* Fecha de asignación */}
                      <div>
                        <label style={{...fLabel,marginBottom:4}}>📅 Fecha de inicio (cobro energía desde este día cada mes)</label>
                        <input style={fInput} type="date"
                          value={form.fecha_asignacion||new Date().toISOString().slice(0,10)}
                          onChange={e=>setForm({...form,fecha_asignacion:e.target.value})}/>
                        {form.fecha_asignacion&&(
                          <div style={{fontSize:9,color:C.blue,marginTop:5}}>
                            💡 Energía se cobrará el día <strong>{new Date(form.fecha_asignacion+'T12:00:00').getDate()}</strong> de cada mes
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })()}

                <div style={{display:'flex',gap:8,justifyContent:'flex-end',paddingTop:14,borderTop:`1px solid ${C.border}`}}>
                  <button style={btn('ghost')} onClick={()=>{setModal(null);setForm({});setSelected(null)}}>Cancelar</button>
                  <button style={{...btn('gold'),padding:'9px 18px',fontSize:12}} onClick={asignarEquipo} disabled={!form.equipo_id}>
                    ✓ Asignar {form.cantidad_asignar>1?`${form.cantidad_asignar} equipos`:'equipo'}
                  </button>
                </div>
              </>}

            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function CalculadoraTab({equipos,btcPrice,calcBtcDay,difficulty,C,num,money,btcFmt,btn}){
  const[hashrate,setHashrate]=useState('')
  const[customPrice,setCustomPrice]=useState('')
  const[feeSelected,setFeeSelected]=useState(0)
  const[selectedEquipo,setSelectedEquipo]=useState(null)

  const precioUsado=customPrice?Number(customPrice):(btcPrice||0)
  const hashrateUsado=selectedEquipo?Number(selectedEquipo.hashrate):(Number(hashrate)||0)
  const btcDay=calcBtcDay(hashrateUsado)
  const btcMes=btcDay?btcDay*30:null
  const usdDay=btcDay&&precioUsado?btcDay*precioUsado:null
  const usdMes=usdDay?usdDay*30:null
  const feeDay=btcDay&&feeSelected?btcDay*(feeSelected/100):null
  const feeMes=feeDay?feeDay*30:null
  const feeUsdMes=feeMes&&precioUsado?feeMes*precioUsado:null
  const clienteDay=btcDay&&feeDay?btcDay-feeDay:btcDay
  const clienteMes=clienteDay?clienteDay*30:null
  const energiaMes=selectedEquipo?(Number(selectedEquipo.hashrate||0)>=300?163:90):null

  const modelosUnicos=equipos.filter(e=>e.estado==='activo').reduce((acc,eq)=>{
    const key=`${eq.modelo}-${eq.hashrate}`
    if(!acc.find(x=>`${x.modelo}-${x.hashrate}`===key)) acc.push(eq)
    return acc
  },[])

  return(
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
      <div style={{background:'rgba(14,14,22,0.8)',border:`1px solid ${C.border}`,borderRadius:12,padding:18}}>
        <div style={{fontSize:10,color:C.t3,textTransform:'uppercase',letterSpacing:'.12em',fontWeight:600,marginBottom:14}}>⛏ Configurar cálculo</div>
        <div style={{marginBottom:14}}>
          <div style={{fontSize:10,color:C.t3,marginBottom:8,fontWeight:600}}>Seleccionar modelo</div>
          <div style={{display:'flex',flexDirection:'column',gap:5}}>
            <button onClick={()=>{setSelectedEquipo(null);setHashrate('')}}
              style={{padding:'7px 12px',borderRadius:7,textAlign:'left',border:`1px solid ${!selectedEquipo?'rgba(247,147,26,0.4)':C.border}`,background:!selectedEquipo?'rgba(247,147,26,0.06)':'rgba(255,255,255,0.02)',cursor:'pointer',fontSize:10,color:!selectedEquipo?C.orange:C.t3,fontFamily:'Inter,sans-serif'}}>
              ✏ Hashrate manual
            </button>
            {modelosUnicos.map(eq=>(
              <button key={eq.id} onClick={()=>setSelectedEquipo(eq)}
                style={{padding:'7px 12px',borderRadius:7,textAlign:'left',border:`1px solid ${selectedEquipo?.id===eq.id?'rgba(247,147,26,0.4)':C.border}`,background:selectedEquipo?.id===eq.id?'rgba(247,147,26,0.06)':'rgba(255,255,255,0.02)',cursor:'pointer',fontFamily:'Inter,sans-serif',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <span style={{fontSize:10,color:selectedEquipo?.id===eq.id?C.orange:C.t1,fontWeight:600}}>{eq.modelo}</span>
                <span style={{fontFamily:'monospace',fontSize:10,color:C.gold2,fontWeight:700}}>{eq.hashrate} TH/s</span>
              </button>
            ))}
          </div>
        </div>
        {!selectedEquipo&&(
          <div style={{marginBottom:14}}>
            <div style={{fontSize:10,color:C.t3,marginBottom:6,fontWeight:600}}>Hashrate (TH/s)</div>
            <input type="number" placeholder="ej: 200" value={hashrate} onChange={e=>setHashrate(e.target.value)}
              style={{width:'100%',background:'rgba(255,255,255,0.05)',border:`1px solid ${C.border2}`,borderRadius:8,padding:'10px 14px',color:C.orange,fontFamily:'monospace',fontSize:15,fontWeight:700,outline:'none',boxSizing:'border-box'}}/>
          </div>
        )}
        <div style={{marginBottom:14}}>
          <div style={{fontSize:10,color:C.t3,marginBottom:6,fontWeight:600}}>Precio BTC (USD)</div>
          <input type="number" placeholder={btcPrice?String(Math.round(btcPrice)):'precio BTC'} value={customPrice} onChange={e=>setCustomPrice(e.target.value)}
            style={{width:'100%',background:'rgba(255,255,255,0.05)',border:`1px solid ${C.border2}`,borderRadius:8,padding:'10px 14px',color:C.orange,fontFamily:'monospace',fontSize:14,fontWeight:700,outline:'none',boxSizing:'border-box'}}/>
          {btcPrice&&!customPrice&&<div style={{fontSize:9,color:C.t3,marginTop:4}}>Precio actual: ${btcPrice.toLocaleString()}</div>}
        </div>
        <div>
          <div style={{fontSize:10,color:C.t3,marginBottom:8,fontWeight:600}}>% Fee NeuraHash</div>
          <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
            {[0,7.5,10,15,18,20,25].map(pct=>(
              <button key={pct} onClick={()=>setFeeSelected(pct)}
                style={{padding:'5px 13px',borderRadius:7,border:'none',cursor:'pointer',fontFamily:'monospace',fontSize:11,fontWeight:700,transition:'all .15s',
                  background:feeSelected===pct?'rgba(247,147,26,0.2)':'rgba(255,255,255,0.04)',
                  color:feeSelected===pct?C.orange:C.t3,
                  outline:feeSelected===pct?'1px solid rgba(247,147,26,0.5)':'1px solid rgba(255,255,255,0.06)',
                }}>{pct===0?'0%':`${pct}%`}</button>
            ))}
          </div>
        </div>
      </div>
      <div style={{background:'rgba(14,14,22,0.8)',border:`1px solid ${C.border}`,borderRadius:12,padding:18}}>
        <div style={{fontSize:10,color:C.t3,textTransform:'uppercase',letterSpacing:'.12em',fontWeight:600,marginBottom:14}}>
          📊 Revenue — {selectedEquipo?selectedEquipo.modelo:`${hashrateUsado||0} TH/s`}
        </div>
        {!hashrateUsado?(
          <div style={{color:C.t3,fontSize:12,textAlign:'center',padding:40,fontStyle:'italic'}}>Seleccioná un equipo o ingresá el hashrate</div>
        ):(
          <>
            <div style={{marginBottom:14,padding:'12px 14px',background:'rgba(255,255,255,0.02)',borderRadius:8}}>
              <div style={{fontSize:9,color:C.t3,textTransform:'uppercase',letterSpacing:'.1em',fontWeight:600,marginBottom:10}}>Producción bruta (FPPS)</div>
              {[
                {label:'BTC / día',val:btcDay?btcFmt(btcDay):'—',color:C.orange},
                {label:'BTC / mes (×30)',val:btcMes?btcFmt(btcMes):'—',color:C.orange},
                {label:'USD / día',val:usdDay?money(usdDay):'—',color:C.gold2},
                {label:'USD / mes',val:usdMes?money(usdMes):'—',color:C.gold2},
              ].map(r=>(
                <div key={r.label} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'6px 0',borderBottom:`1px solid ${C.border}`}}>
                  <span style={{fontSize:10,color:C.t3}}>{r.label}</span>
                  <span style={{...num,fontSize:12,color:r.color}}>{r.val}</span>
                </div>
              ))}
            </div>
            {energiaMes&&<div style={{marginBottom:14,padding:'10px 14px',background:'rgba(245,158,11,0.04)',border:'1px solid rgba(245,158,11,0.15)',borderRadius:8}}>
              <div style={{fontSize:9,color:C.amber,textTransform:'uppercase',letterSpacing:'.1em',fontWeight:600,marginBottom:6}}>Costo Energía / mes</div>
              <div style={{...num,fontSize:14,color:C.amber}}>{money(energiaMes)}</div>
              <div style={{fontSize:9,color:C.t3,marginTop:2}}>{Number(selectedEquipo?.hashrate||0)>=300?'Hydro cooling':'Aire'}</div>
            </div>}
            {feeSelected>0&&<>
              <div style={{marginBottom:10,padding:'12px 14px',background:'rgba(247,147,26,0.05)',border:'1px solid rgba(247,147,26,0.15)',borderRadius:8}}>
                <div style={{fontSize:9,color:C.orange,textTransform:'uppercase',letterSpacing:'.1em',fontWeight:600,marginBottom:10}}>Fee NeuraHash {feeSelected}%</div>
                {[
                  {label:'Fee BTC/día',val:feeDay?btcFmt(feeDay):'—',color:C.orange},
                  {label:'Fee BTC/mes',val:feeMes?btcFmt(feeMes):'—',color:C.orange},
                  {label:'Fee USD/mes',val:feeUsdMes?money(feeUsdMes):'—',color:C.gold2},
                ].map(r=>(
                  <div key={r.label} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'5px 0',borderBottom:`1px solid rgba(247,147,26,0.08)`}}>
                    <span style={{fontSize:10,color:C.t3}}>{r.label}</span>
                    <span style={{...num,fontSize:12,color:r.color}}>{r.val}</span>
                  </div>
                ))}
              </div>
              <div style={{padding:'12px 14px',background:'rgba(16,185,129,0.04)',border:'1px solid rgba(16,185,129,0.15)',borderRadius:8}}>
                <div style={{fontSize:9,color:C.green,textTransform:'uppercase',letterSpacing:'.1em',fontWeight:600,marginBottom:10}}>Cliente recibe</div>
                {[
                  {label:'BTC/día neto',val:clienteDay?btcFmt(clienteDay):'—'},
                  {label:'BTC/mes neto',val:clienteMes?btcFmt(clienteMes):'—'},
                  {label:'USD/mes neto',val:clienteMes&&precioUsado?money(clienteMes*precioUsado):'—'},
                ].map(r=>(
                  <div key={r.label} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'5px 0',borderBottom:`1px solid rgba(16,185,129,0.08)`}}>
                    <span style={{fontSize:10,color:C.t3}}>{r.label}</span>
                    <span style={{...num,fontSize:12,color:C.green}}>{r.val}</span>
                  </div>
                ))}
              </div>
            </>}
            {difficulty&&<div style={{marginTop:10,fontSize:9,color:C.t3,textAlign:'right'}}>Dificultad: {(difficulty/1e12).toFixed(2)}T · FPPS</div>}
          </>
        )}
      </div>
    </div>
  )
}
