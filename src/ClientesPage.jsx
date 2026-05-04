// ClientesPage.jsx — Calculadora f2pool integrada: BTC/día por máquina + fee seleccionable
import { useState, useEffect, useRef } from 'react'
import { supabase } from './supabase'

const C={void:'#060608',bg1:'#0a0a0f',card:'#111118',border:'rgba(255,255,255,0.06)',border2:'rgba(255,255,255,0.11)',gold:'#d4a843',gold2:'#f0c060',green:'#10b981',red:'#f43f5e',amber:'#f59e0b',blue:'#6366f1',purple:'#a855f7',orange:'#f7931a',t1:'#f0f0f8',t2:'#808098',t3:'#40405a'}
const num={fontFamily:'monospace',fontWeight:700}
const initials=n=>n.split(' ').map(x=>x[0]).join('').substring(0,2).toUpperCase()
const money=n=>'$'+Number(n||0).toLocaleString('en',{minimumFractionDigits:2,maximumFractionDigits:2})
const btcFmt=n=>Number(n||0).toFixed(8)+' ₿'
const daysUntil=d=>Math.round((new Date(d)-new Date())/864e5)
const FEE_OPTIONS=[10,15,18,20,25]

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

// Hook: precio BTC + dificultad de red → misma fórmula que f2pool FPPS
// BTC/día = hashrate(TH/s) × 86400 × blockReward / (difficulty × 2^32)
function useMiningData(){
  const [btcPrice, setBtcPrice] = useState(null)
  const [difficulty, setDifficulty] = useState(null)
  const [blockReward] = useState(3.125) // post-halving abril 2024
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
      }catch{
        setDifficulty(109521666870163)
      }
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
    // Fórmula FPPS idéntica a f2pool: hashrate(H/s) × 86400 × reward / (difficulty × 2^32)
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

  // CÁLCULO PRINCIPAL: suma hashrate de todos sus equipos → BTC/día total → × fee%
  function calcEnergiaEquipo(hashrate){
    return Number(hashrate||0) >= 300 ? 163 : 90
  }
  function calcEnergiaTotal(cliente){
    const equiposC = getClienteEquiposArr(cliente.id)
    return equiposC.reduce((a,e)=>a+calcEnergiaEquipo(Number(e.hashrate||0)),0)
  }
  function calcEnergiaEquipo(hashrate){
    return Number(hashrate||0) >= 300 ? 163 : 90
  }
  function calcEnergiaTotal(cliente){
    const equiposC = getClienteEquiposArr(cliente.id)
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
    const proximo=cliente.dia_cobro?getProximoCobro(cliente.dia_cobro):null
    const fecha=proximo?new Date(proximo+'T12:00:00').toLocaleDateString('es',{day:'numeric',month:'long'}):'próximamente'
    let montoStr=money(cliente.tarifa_mensual)
    if(btcMesFee&&feePct>0) montoStr=`${btcFmt(btcMesFee)} ≈ ${money(usdMesFee)}`
    const msg=`Hola ${cliente.nombre.split(' ')[0]} 👋, te recuerdo que tu pago de hosting de *${montoStr}* vence el *${fecha}*. Cualquier consulta estoy disponible. Saludos, *NeuraHash* ⛏`
    const tel=(cliente.contacto||'').replace(/\D/g,'')
    window.open(tel?`https://wa.me/${tel}?text=${encodeURIComponent(msg)}`:`https://wa.me/?text=${encodeURIComponent(msg)}`,'_blank')
  }

  const alertasProximas=clientes.filter(c=>{const d=getDiasAlCobro(c);return d!==null&&d<=5&&d>=0&&getEstadoPago(c)!=='pagado'})
  const alertasVencidas=clientes.filter(c=>{const d=getDiasAlCobro(c);return d!==null&&d<0&&getEstadoPago(c)!=='pagado'})

  async function addCliente(){
    if(!form.nombre){toast('Nombre requerido','error');return}
    await supabase.from('clientes').insert([{
      nombre:form.nombre,contacto:form.contacto||'',pais:form.pais||'Paraguay',
      tarifa_mensual:Number(form.tarifa_mensual)||0,unidades_asic:Number(form.unidades_asic)||1,
      dia_cobro:Number(form.dia_cobro)||1,fecha_inicio:form.fecha_inicio||new Date().toISOString().slice(0,10),
      fecha_vence_contrato:form.fecha_vence_contrato||null,costo_energia:Number(form.costo_energia)||0,
      notas:form.notas||'',estado:'activo'
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
    const {usdMesFee,feePct}=calcClienteFee(cliente)
    const monto=tipo==='hosting'&&feePct>0&&usdMesFee?usdMesFee:(tipo==='hosting'?cliente.tarifa_mensual:cliente.costo_energia)
    const existe=pagos.find(p=>p.cliente_id===cliente.id&&p.periodo===periodo&&p.tipo===tipo)
    if(existe){ await supabase.from('pagos_clientes').update({estado:'pagado',fecha_pago:new Date().toISOString().slice(0,10),monto:Number(monto)||0}).eq('id',existe.id) }
    else{ await supabase.from('pagos_clientes').insert([{cliente_id:cliente.id,tipo,monto:Number(monto)||0,moneda:'USD',fecha_pago:new Date().toISOString().slice(0,10),periodo,estado:'pagado'}]) }
    await supabase.from('finanzas').insert([{tipo:'ingreso',monto:Number(monto)||0,moneda:'USD',descripcion:`${tipo==='hosting'?'Hosting':'Energía'}: ${cliente.nombre}`,categoria:tipo==='hosting'?'Hosting':'Energía',fecha:new Date().toISOString().slice(0,10),responsable:'Joel',pais:cliente.pais||'Paraguay'}])
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
  const btn=(t)=>({display:'inline-flex',alignItems:'center',gap:5,padding:'6px 12px',borderRadius:7,border:'none',cursor:'pointer',fontFamily:'Inter,sans-serif',fontSize:10,fontWeight:600,letterSpacing:'.03em',transition:'all .2s',
    background:t==='gold'?`linear-gradient(135deg,#d4a843,#e8b84b)`:t==='green'?'rgba(16,185,129,0.12)':t==='ghost'?'rgba(255,255,255,0.06)':t==='wa'?'rgba(37,211,102,0.12)':t==='red'?'rgba(244,63,94,0.08)':t==='orange'?'rgba(247,147,26,0.1)':'rgba(255,255,255,0.04)',
    color:t==='gold'?'#000':t==='green'?C.green:t==='ghost'?C.t1:t==='wa'?'#25D366':t==='red'?C.red:t==='orange'?C.orange:C.t2,
    border:t==='green'?`1px solid rgba(16,185,129,0.25)`:t==='ghost'?`1px solid ${C.border}`:t==='wa'?'1px solid rgba(37,211,102,0.3)':t==='red'?'1px solid rgba(244,63,94,0.2)':t==='orange'?'1px solid rgba(247,147,26,0.25)':'none'
  })
  const fInput={width:'100%',background:'rgba(255,255,255,0.04)',border:`1px solid ${C.border2}`,borderRadius:8,padding:'10px 13px',color:C.t1,fontFamily:'Inter,sans-serif',fontSize:12,outline:'none',boxSizing:'border-box'}
  const fLabel={display:'block',fontSize:9,letterSpacing:'.15em',textTransform:'uppercase',color:C.t3,marginBottom:6,fontWeight:600}

  if(loading)return <div style={{padding:40,textAlign:'center',color:C.t3,fontSize:11}}>Cargando...</div>

  return(
    <div>
      {/* BTC + Dificultad Banner */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12,padding:'9px 14px',background:'rgba(247,147,26,0.05)',border:'1px solid rgba(247,147,26,0.15)',borderRadius:10,flexWrap:'wrap',gap:8}}>
        <div style={{display:'flex',alignItems:'center',gap:14,flexWrap:'wrap'}}>
          <div style={{display:'flex',alignItems:'center',gap:6}}>
            <span style={{fontSize:13}}>₿</span>
            {miningLoading?<span style={{fontSize:9,color:C.t3}}>Cargando...</span>:(
              <span style={{fontFamily:'monospace',fontWeight:700,fontSize:13,color:C.orange}}>{btcPrice?`$${btcPrice.toLocaleString()}`:'—'}</span>
            )}
            <span style={{fontSize:8,color:C.t3}}>USD/BTC</span>
          </div>
          {difficulty&&<div style={{display:'flex',alignItems:'center',gap:5}}><span style={{fontSize:8,color:C.t3}}>Dificultad:</span><span style={{fontFamily:'monospace',fontSize:9,color:C.t2,fontWeight:600}}>{(difficulty/1e12).toFixed(2)}T</span></div>}
          {lastUpdate&&<span style={{fontSize:8,color:C.t3}}>· {lastUpdate.toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'})}</span>}
        </div>
        <button onClick={refetch} style={{...btn('orange'),padding:'4px 9px',fontSize:9}}>↻ Actualizar</button>
      </div>

      {/* Alertas */}
      {(alertasProximas.length>0||alertasVencidas.length>0)&&(
        <div style={{marginBottom:14,display:'flex',flexDirection:'column',gap:8}}>
          {alertasVencidas.length>0&&(
            <div style={{background:'rgba(244,63,94,0.08)',border:'1px solid rgba(244,63,94,0.25)',borderRadius:10,padding:'10px 16px',display:'flex',alignItems:'center',gap:10}}>
              <span style={{fontSize:16}}>🔴</span>
              <div style={{flex:1}}><div style={{fontSize:10,fontWeight:600,color:C.red}}>COBROS VENCIDOS</div><div style={{fontSize:9,color:C.t2,marginTop:2}}>{alertasVencidas.map(c=>c.nombre).join(', ')}</div></div>
            </div>
          )}
          {alertasProximas.length>0&&(
            <div style={{background:'rgba(245,158,11,0.08)',border:'1px solid rgba(245,158,11,0.25)',borderRadius:10,padding:'10px 16px',display:'flex',alignItems:'center',gap:10}}>
              <span style={{fontSize:16}}>🟡</span>
              <div style={{flex:1}}><div style={{fontSize:10,fontWeight:600,color:C.amber}}>COBROS PRÓXIMOS (5 días)</div><div style={{fontSize:9,color:C.t2,marginTop:2}}>{alertasProximas.map(c=>`${c.nombre} (${getDiasAlCobro(c)}d)`).join(', ')}</div></div>
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
        <button style={{...btn('gold'),padding:'8px 16px',fontSize:11}} onClick={()=>setModal('cliente')}>+ Nuevo cliente</button>
      </div>

      {/* TAB LISTA */}
      {tab==='lista'&&<div style={{display:'flex',flexDirection:'column',gap:10}}>
        {clientes.map(c=>{
          const eqArr=getClienteEquiposArr(c.id)
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
              <div style={{padding:'12px 16px',borderBottom:`1px solid ${C.border}`}}>
                {/* Fila 1: avatar + nombre + monto + delete */}
                <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:10}}>
                  <div style={{width:34,height:34,borderRadius:'50%',background:`linear-gradient(135deg,rgba(212,168,67,0.5),${C.gold})`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,color:'#000',flexShrink:0}}>{initials(c.nombre)}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:700}}>{c.nombre}</div>
                    <div style={{fontSize:9,color:C.t3,marginTop:1}}>{c.pais} · {equipCount} equipo{equipCount!==1?'s':''} · {totalTH} TH/s{c.contacto?` · ${c.contacto}`:''}</div>
                  </div>
                  <div style={{textAlign:'right',flexShrink:0}}>
                    {hasFee&&btcMesFee?(
                      <>
                        <div style={{...num,fontSize:12,color:C.orange}}>{btcFmt(btcMesFee)}</div>
                        {usdMesFee&&<div style={{...num,fontSize:10,color:C.gold2}}>≈ {money(usdMesFee)}</div>}
                        <div style={{fontSize:8,color:C.t3}}>fee {feePct}%/mes</div>
                      </>
                    ):(
                      <>
                        <div style={{...num,fontSize:14,color:C.gold2}}>{money(c.tarifa_mensual)}</div>
                        <div style={{fontSize:8,color:C.t3}}>hosting/mes</div>
                      </>
                    )}
                  </div>
                  <button style={{...btn('red'),padding:'4px 7px',flexShrink:0}} onClick={()=>del(c.id)}>🗑</button>
                </div>

                {/* Selector de fee % */}
                <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:8,flexWrap:'wrap'}}>
                  <span style={{fontSize:8,color:C.t3,letterSpacing:'.1em',textTransform:'uppercase',fontWeight:600}}>Fee hosting:</span>
                  {FEE_OPTIONS.map(pct=>(
                    <button key={pct} onClick={()=>setFee(c.id,pct)}
                      style={{padding:'3px 9px',borderRadius:6,border:'none',cursor:'pointer',fontFamily:'monospace',fontSize:10,fontWeight:700,transition:'all .15s',
                        background:feePct===pct?'rgba(247,147,26,0.2)':'rgba(255,255,255,0.04)',
                        color:feePct===pct?C.orange:C.t3,
                        outline:feePct===pct?`1px solid rgba(247,147,26,0.5)`:'1px solid rgba(255,255,255,0.06)',
                      }}>
                      {pct}%
                    </button>
                  ))}
                  {hasFee&&<button onClick={()=>setFee(c.id,0)} style={{padding:'3px 7px',borderRadius:6,border:`1px solid ${C.border}`,background:'none',cursor:'pointer',fontSize:9,color:C.t3,fontFamily:'Inter,sans-serif'}}>✕</button>}
                </div>

                {/* BTC producción breakdown */}
                {equipCount>0&&btcDiaTotal!=null?(
                  <div style={{display:'flex',alignItems:'center',gap:10,padding:'6px 10px',background:'rgba(247,147,26,0.04)',border:'1px solid rgba(247,147,26,0.1)',borderRadius:8,flexWrap:'wrap',marginBottom:8}}>
                    <span style={{fontSize:8,color:C.t3}}>⛏ Producción:</span>
                    <span style={{fontFamily:'monospace',fontSize:10,fontWeight:700,color:C.orange}}>{btcFmt(btcDiaTotal)}<span style={{color:C.t3,fontSize:8}}>/día</span></span>
                    <span style={{fontFamily:'monospace',fontSize:9,color:C.t2}}>· {btcFmt(btcDiaTotal*30)}/mes</span>
                    {hasFee&&btcDiaFee&&<>
                      <span style={{color:C.t3,fontSize:9}}>→</span>
                      <span style={{fontSize:8,color:C.amber}}>Fee {feePct}%:</span>
                      <span style={{fontFamily:'monospace',fontSize:10,fontWeight:700,color:C.gold2}}>{btcFmt(btcDiaFee)}<span style={{color:C.t3,fontSize:8}}>/día</span></span>
                      {btcPrice&&<span style={{fontSize:8,color:C.t3}}>≈ {money(btcDiaFee*btcPrice)}/día</span>}
                    </>}
                  </div>
                ):(
                  equipCount===0&&<div style={{fontSize:9,color:C.t3,fontStyle:'italic',marginBottom:8}}>⚠ Sin equipos asignados — asigná equipos para calcular producción BTC</div>
                )}

                {/* Cobro fecha + badges + WA */}
                <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                  <div style={{display:'flex',alignItems:'center',gap:6,background:'rgba(255,255,255,0.03)',border:`1px solid ${C.border}`,borderRadius:7,padding:'5px 10px'}}>
                    <span style={{fontSize:8,color:C.t3}}>📅 Próximo cobro:</span>
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
                      <span onClick={()=>iniciarEditDia(c)} style={{...num,fontSize:10,color:vencido?C.red:urgente?C.amber:C.t1,cursor:'pointer',borderBottom:`1px dashed ${C.t3}`}}>{proximo||'—'}</span>
                    )}
                    {editandoDia!==c.id&&diasCobro!==null&&(
                      <span style={{fontSize:8,color:vencido?C.red:urgente?C.amber:C.t3}}>({vencido?`vencido ${Math.abs(diasCobro)}d`:diasCobro===0?'hoy':`en ${diasCobro}d`})</span>
                    )}
                  </div>
                  <span style={{fontSize:8,padding:'3px 8px',borderRadius:10,background:estadoHosting==='pagado'?'rgba(16,185,129,0.1)':'rgba(244,63,94,0.1)',color:estadoHosting==='pagado'?C.green:C.red,border:`1px solid ${estadoHosting==='pagado'?'rgba(16,185,129,0.2)':'rgba(244,63,94,0.2)'}`}}>
                    {estadoHosting==='pagado'?'✅ Hosting pagado':'⏳ Hosting pendiente'}
                  </span>
                  {c.costo_energia>0&&(
                    <span style={{fontSize:8,padding:'3px 8px',borderRadius:10,background:estadoEnergia==='pagado'?'rgba(16,185,129,0.1)':'rgba(245,158,11,0.08)',color:estadoEnergia==='pagado'?C.green:C.amber,border:`1px solid ${estadoEnergia==='pagado'?'rgba(16,185,129,0.2)':'rgba(245,158,11,0.2)'}`}}>
                      {estadoEnergia==='pagado'?'✅ Energía pagada':'⚡ Energía pendiente'}
                    </span>
                  )}
                  <button style={btn('wa')} onClick={()=>abrirWhatsApp(c)}>📲 WhatsApp</button>
                </div>
              </div>

              {/* Grid: Equipos / Hosting / Energía */}
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:0}}>
                <div style={{padding:'12px 14px',borderRight:`1px solid ${C.border}`}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                    <span style={{fontSize:9,color:C.t3,textTransform:'uppercase',letterSpacing:'.08em',fontWeight:600}}>⛏ Equipos</span>
                    <button style={btn('ghost')} onClick={()=>{setSelected(c);setModal('equipo')}}>+ Asignar</button>
                  </div>
                  {eqArr.length===0&&<div style={{fontSize:9,color:C.t3,fontStyle:'italic'}}>Sin equipos</div>}
                  {eqArr.map(eq=>{
                    const eqBtcDay=calcBtcDay(Number(eq.hashrate||0))
                    const eqFeeDay=eqBtcDay&&feePct?eqBtcDay*(feePct/100):null
                    return(
                      <div key={eq.id} style={{marginBottom:5,padding:'5px 8px',background:'rgba(255,255,255,0.03)',borderRadius:6}}>
                        <div style={{display:'flex',alignItems:'center',gap:5}}>
                          <span style={{width:5,height:5,borderRadius:'50%',background:eq.estado==='activo'?C.green:C.amber,flexShrink:0}}/>
                          <span style={{flex:1,fontSize:9,fontWeight:600}}>{eq.modelo}</span>
                          <span style={{...num,fontSize:9,color:C.gold2}}>{eq.hashrate}TH</span>
                          <button style={{background:'none',border:'none',cursor:'pointer',color:C.t3,fontSize:10,padding:'0 2px'}} onClick={()=>desasignarEquipo(c.id,eq.id)}>×</button>
                        </div>
                        {eqBtcDay!=null&&(
                          <div style={{fontSize:8,fontFamily:'monospace',marginTop:2,paddingLeft:10,color:C.orange}}>
                            {btcFmt(eqBtcDay)}/día
                            {eqFeeDay&&<span style={{color:C.t3}}> → {btcFmt(eqFeeDay)}</span>}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                <div style={{padding:'12px 14px',borderRight:`1px solid ${C.border}`}}>
                  <div style={{fontSize:9,color:C.t3,textTransform:'uppercase',letterSpacing:'.08em',fontWeight:600,marginBottom:8}}>💳 Hosting — {getPeriodo()}</div>
                  <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
                    <span style={{fontSize:16,padding:'5px 9px',background:estadoHosting==='pagado'?'rgba(16,185,129,0.1)':'rgba(244,63,94,0.08)',borderRadius:7,border:`1px solid ${estadoHosting==='pagado'?'rgba(16,185,129,0.2)':'rgba(244,63,94,0.15)'}`}}>
                      {estadoHosting==='pagado'?'✅':'⏳'}
                    </span>
                    <div>
                      <div style={{fontSize:10,fontWeight:600,color:estadoHosting==='pagado'?C.green:C.red}}>{estadoHosting==='pagado'?'Pagado':'Pendiente'}</div>
                      {hasFee&&btcMesFee?(
                        <>
                          <div style={{...num,fontSize:10,color:C.orange}}>{btcFmt(btcMesFee)}</div>
                          {usdMesFee&&<div style={{fontSize:8,color:C.gold2,fontFamily:'monospace'}}>≈ {money(usdMesFee)}</div>}
                        </>
                      ):(
                        <div style={{...num,fontSize:10,color:C.gold2}}>{money(c.tarifa_mensual)}</div>
                      )}
                    </div>
                  </div>
                  {estadoHosting!=='pagado'&&<button style={btn('green')} onClick={()=>marcarPagado(c,'hosting')}>✓ Marcar pagado</button>}
                </div>

                <div style={{padding:'12px 14px'}}>
                  <div style={{fontSize:9,color:C.t3,textTransform:'uppercase',letterSpacing:'.08em',fontWeight:600,marginBottom:8}}>⚡ Energía — {getPeriodo()}</div>
                  {c.costo_energia>0?(
                    <>
                      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
                        <span style={{fontSize:16,padding:'5px 9px',background:estadoEnergia==='pagado'?'rgba(16,185,129,0.1)':'rgba(245,158,11,0.08)',borderRadius:7,border:`1px solid ${estadoEnergia==='pagado'?'rgba(16,185,129,0.2)':'rgba(245,158,11,0.2)'}`}}>
                          {estadoEnergia==='pagado'?'✅':'⚡'}
                        </span>
                        <div>
                          <div style={{fontSize:10,fontWeight:600,color:estadoEnergia==='pagado'?C.green:C.amber}}>{estadoEnergia==='pagado'?'Pagado':'Pendiente'}</div>
                          <div style={{...num,fontSize:10,color:C.gold2}}>{money(c.costo_energia)}</div>
                        </div>
                      </div>
                      {estadoEnergia!=='pagado'&&<button style={{...btn('ghost'),border:`1px solid rgba(245,158,11,0.3)`,color:C.amber}} onClick={()=>marcarPagado(c,'energia')}>✓ Marcar pagado</button>}
                    </>
                  ):(
                    <div style={{fontSize:9,color:C.t3,fontStyle:'italic'}}>Sin costo de energía</div>
                  )}
                </div>
              </div>

              {(c.fecha_vence_contrato||c.notas)&&(
                <div style={{padding:'7px 14px',borderTop:`1px solid ${C.border}`,background:'rgba(255,255,255,0.01)',display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                  {c.fecha_vence_contrato&&<><span style={{fontSize:9,color:C.t3}}>📄 Contrato vence:</span><span style={{...num,fontSize:9,color:daysUntil(c.fecha_vence_contrato)<30?C.amber:C.t2}}>{c.fecha_vence_contrato}</span><span style={{fontSize:8,color:C.t3}}>({daysUntil(c.fecha_vence_contrato)}d)</span></>}
                  {c.notas&&<span style={{marginLeft:4,fontSize:8,color:C.t3,fontStyle:'italic'}}>📝 {c.notas}</span>}
                </div>
              )}
            </div>
          )
        })}
        {!clientes.length&&<div style={{...panel,padding:40,color:C.t3,textAlign:'center',fontSize:11,textTransform:'uppercase'}}>Sin clientes registrados</div>}
      </div>}

      {/* TAB CALCULADORA */}
      {tab==='calc'&&<CalculadoraTab equipos={equipos} btcPrice={btcPrice} calcBtcDay={calcBtcDay} difficulty={difficulty} C={C} num={num} money={money} btcFmt={btcFmt} btn={btn}/>}

      {/* TAB PAGOS */}
      {tab==='pagos'&&<div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10,marginBottom:14}}>
          {[
            {label:'Hosting cobrado este mes',val:money(pagos.filter(p=>p.tipo==='hosting'&&p.estado==='pagado'&&p.periodo===getPeriodo()).reduce((a,b)=>a+Number(b.monto),0)),color:C.green},
            {label:'Energía cobrada este mes',val:money(pagos.filter(p=>p.tipo==='energia'&&p.estado==='pagado'&&p.periodo===getPeriodo()).reduce((a,b)=>a+Number(b.monto),0)),color:C.amber},
            {label:'Pendiente de cobro',val:money(clientes.filter(c=>getEstadoPago(c)!=='pagado').reduce((a,b)=>{const{usdMesFee,feePct}=calcClienteFee(b);return a+(feePct>0&&usdMesFee?usdMesFee:Number(b.tarifa_mensual))},0)),color:C.red},
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
                <div style={{flex:1}}><div style={{fontSize:10,fontWeight:600}}>{cliente?.nombre||'—'}</div><div style={{fontSize:8,color:C.t3}}>{p.tipo==='hosting'?'Hosting':'Energía'} · {p.periodo}</div></div>
                <span style={{fontSize:8,color:C.t3}}>{p.fecha_pago}</span>
                <span style={{fontSize:8,padding:'2px 8px',borderRadius:10,background:p.estado==='pagado'?'rgba(16,185,129,0.1)':'rgba(244,63,94,0.1)',color:p.estado==='pagado'?C.green:C.red,border:`1px solid ${p.estado==='pagado'?'rgba(16,185,129,0.2)':'rgba(244,63,94,0.2)'}`}}>{p.estado}</span>
                <div style={{textAlign:'right'}}><div style={{...num,fontSize:11,color:C.gold2}}>{money(p.monto)}</div>{btcPrice&&<div style={{fontSize:8,color:C.orange,fontFamily:'monospace'}}>{btcFmt(Number(p.monto)/btcPrice)}</div>}</div>
              </div>
            )
          })}
          {!pagos.length&&<div style={{padding:40,color:C.t3,textAlign:'center',fontSize:11}}>Sin historial de pagos</div>}
        </div>
      </div>}

      {/* TAB ALERTAS */}
      {tab==='alertas'&&<div style={{display:'flex',flexDirection:'column',gap:10}}>
        {[...alertasVencidas,...alertasProximas].map(c=>{
          const dias=getDiasAlCobro(c); const vencido=dias<0
          const{btcMesFee,feePct,usdMesFee}=calcClienteFee(c)
          return(
            <div key={c.id} style={{...panel,border:`1px solid ${vencido?'rgba(244,63,94,0.3)':'rgba(245,158,11,0.3)'}`}}>
              <div style={{display:'flex',alignItems:'center',gap:12,padding:'14px 16px'}}>
                <span style={{fontSize:24}}>{vencido?'🔴':'🟡'}</span>
                <div style={{flex:1}}><div style={{fontSize:13,fontWeight:700}}>{c.nombre}</div><div style={{fontSize:9,color:C.t3,marginTop:2}}>{c.pais} · Día de cobro: {c.dia_cobro}</div></div>
                <div style={{textAlign:'right'}}>
                  <div style={{...num,fontSize:16,color:vencido?C.red:C.amber}}>{vencido?`${Math.abs(dias)}d vencido`:`${dias}d para cobrar`}</div>
                  {feePct>0&&btcMesFee?(<><div style={{...num,fontSize:12,color:C.orange,marginTop:4}}>{btcFmt(btcMesFee)}</div>{usdMesFee&&<div style={{fontSize:9,color:C.gold2}}>≈ {money(usdMesFee)}</div>}<div style={{fontSize:8,color:C.t3}}>fee {feePct}%</div></>):(<div style={{...num,fontSize:13,color:C.gold2,marginTop:4}}>{money(c.tarifa_mensual)}</div>)}
                </div>
              </div>
              <div style={{display:'flex',gap:8,padding:'10px 16px',borderTop:`1px solid ${C.border}`,flexWrap:'wrap'}}>
                {getEstadoPago(c)!=='pagado'&&<button style={btn('green')} onClick={()=>marcarPagado(c,'hosting')}>✓ Hosting pagado</button>}
                {c.costo_energia>0&&getEstadoEnergia(c)!=='pagado'&&<button style={{...btn('ghost'),border:`1px solid rgba(245,158,11,0.3)`,color:C.amber}} onClick={()=>marcarPagado(c,'energia')}>✓ Energía pagada</button>}
                <button style={btn('wa')} onClick={()=>abrirWhatsApp(c)}>📲 WhatsApp</button>
              </div>
            </div>
          )
        })}
        {alertasProximas.length===0&&alertasVencidas.length===0&&<div style={{...panel,padding:40,color:C.green,textAlign:'center',fontSize:12}}>✓ Sin alertas pendientes — todo al día</div>}
      </div>}

      {/* MODAL */}
      {modal&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.85)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',backdropFilter:'blur(6px)',padding:16}} onClick={e=>{if(e.target===e.currentTarget){setModal(null);setForm({});setSelected(null)}}}>
          <div style={{background:'linear-gradient(135deg,rgba(16,16,26,0.99),rgba(12,12,20,0.99))',border:`1px solid ${C.border2}`,borderRadius:16,width:'100%',maxWidth:500,maxHeight:'90vh',overflowY:'auto',boxShadow:'0 32px 80px rgba(0,0,0,0.7)'}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'16px 20px',borderBottom:`1px solid ${C.border}`}}>
              <div style={{fontFamily:'monospace',fontSize:11,fontWeight:700,letterSpacing:'.08em'}}>{modal==='cliente'?'NUEVO CLIENTE':'ASIGNAR EQUIPO'}</div>
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
                  <div><label style={fLabel}>Tarifa base (USD)</label><input style={fInput} type="number" placeholder="420" value={form.tarifa_mensual||''} onChange={e=>setForm({...form,tarifa_mensual:e.target.value})}/></div>
                  <div><label style={fLabel}>Costo energía (USD)</label><input style={fInput} type="number" placeholder="150" value={form.costo_energia||''} onChange={e=>setForm({...form,costo_energia:e.target.value})}/></div>
                  <div><label style={fLabel}>Día de cobro (1-31)</label><input style={fInput} type="number" min="1" max="31" placeholder="15" value={form.dia_cobro||''} onChange={e=>setForm({...form,dia_cobro:e.target.value})}/></div>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:12}}>
                  <div><label style={fLabel}>Inicio contrato</label><input style={fInput} type="date" value={form.fecha_inicio||''} onChange={e=>setForm({...form,fecha_inicio:e.target.value})}/></div>
                  <div><label style={fLabel}>Vence contrato</label><input style={fInput} type="date" value={form.fecha_vence_contrato||''} onChange={e=>setForm({...form,fecha_vence_contrato:e.target.value})}/></div>
                </div>
                <div style={{marginBottom:12}}><label style={fLabel}>Notas</label><input style={fInput} placeholder="Observaciones..." value={form.notas||''} onChange={e=>setForm({...form,notas:e.target.value})}/></div>
                <div style={{display:'flex',gap:8,justifyContent:'flex-end',paddingTop:14,borderTop:`1px solid ${C.border}`}}>
                  <button style={btn('ghost')} onClick={()=>{setModal(null);setForm({})}}>Cancelar</button>
                  <button style={{...btn('gold'),padding:'8px 16px',fontSize:11}} onClick={addCliente}>✓ Guardar</button>
                </div>
              </>}
              {modal==='equipo'&&<>
                <div style={{marginBottom:12}}>
                  <div style={{fontSize:11,color:C.t2,marginBottom:12}}>Asignando equipo a: <strong style={{color:C.t1}}>{selected?.nombre}</strong></div>
                  <label style={fLabel}>Seleccionar equipo</label>
                  <select style={fInput} value={form.equipo_id||''} onChange={e=>setForm({...form,equipo_id:e.target.value})}>
                    <option value="">— Seleccioná un equipo —</option>
                    {equipos.map(eq=><option key={eq.id} value={eq.id}>{eq.modelo} — {eq.hashrate}TH/s ({eq.estado})</option>)}
                  </select>
                </div>
                <div style={{display:'flex',gap:8,justifyContent:'flex-end',paddingTop:14,borderTop:`1px solid ${C.border}`}}>
                  <button style={btn('ghost')} onClick={()=>{setModal(null);setForm({});setSelected(null)}}>Cancelar</button>
                  <button style={{...btn('gold'),padding:'8px 16px',fontSize:11}} onClick={asignarEquipo}>✓ Asignar</button>
                </div>
              </>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── TAB CALCULADORA — replica f2pool ───
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

  return(
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
      {/* Panel izquierdo — inputs */}
      <div style={{background:'rgba(14,14,22,0.8)',border:`1px solid ${C.border}`,borderRadius:12,padding:16}}>
        <div style={{fontSize:9,color:C.t3,textTransform:'uppercase',letterSpacing:'.12em',fontWeight:600,marginBottom:12}}>⛏ Configurar cálculo</div>

        <div style={{marginBottom:12}}>
          <div style={{fontSize:9,color:C.t3,marginBottom:6,fontWeight:600}}>Seleccionar equipo</div>
          <div style={{display:'flex',flexDirection:'column',gap:4}}>
            <button onClick={()=>{setSelectedEquipo(null);setHashrate('')}}
              style={{padding:'6px 10px',borderRadius:6,textAlign:'left',border:`1px solid ${!selectedEquipo?'rgba(247,147,26,0.4)':C.border}`,background:!selectedEquipo?'rgba(247,147,26,0.06)':'rgba(255,255,255,0.02)',cursor:'pointer',fontSize:9,color:!selectedEquipo?C.orange:C.t3,fontFamily:'Inter,sans-serif'}}>
              ✏ Hashrate manual
            </button>
            {equipos.filter(e=>e.estado==='activo').map(eq=>(
              <button key={eq.id} onClick={()=>setSelectedEquipo(eq)}
                style={{padding:'6px 10px',borderRadius:6,textAlign:'left',border:`1px solid ${selectedEquipo?.id===eq.id?'rgba(247,147,26,0.4)':C.border}`,background:selectedEquipo?.id===eq.id?'rgba(247,147,26,0.06)':'rgba(255,255,255,0.02)',cursor:'pointer',fontFamily:'Inter,sans-serif',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <span style={{fontSize:9,color:selectedEquipo?.id===eq.id?C.orange:C.t1,fontWeight:600}}>{eq.modelo}</span>
                <span style={{fontFamily:'monospace',fontSize:9,color:C.gold2,fontWeight:700}}>{eq.hashrate} TH/s</span>
              </button>
            ))}
          </div>
        </div>

        {!selectedEquipo&&(
          <div style={{marginBottom:12}}>
            <div style={{fontSize:9,color:C.t3,marginBottom:5,fontWeight:600}}>Hashrate (TH/s)</div>
            <input type="number" placeholder="ej: 200" value={hashrate} onChange={e=>setHashrate(e.target.value)}
              style={{width:'100%',background:'rgba(255,255,255,0.05)',border:`1px solid ${C.border2}`,borderRadius:8,padding:'9px 12px',color:C.orange,fontFamily:'monospace',fontSize:14,fontWeight:700,outline:'none',boxSizing:'border-box'}}/>
          </div>
        )}

        <div style={{marginBottom:12}}>
          <div style={{fontSize:9,color:C.t3,marginBottom:5,fontWeight:600}}>Precio BTC (USD)</div>
          <input type="number" placeholder={btcPrice?String(Math.round(btcPrice)):'precio BTC'} value={customPrice} onChange={e=>setCustomPrice(e.target.value)}
            style={{width:'100%',background:'rgba(255,255,255,0.05)',border:`1px solid ${C.border2}`,borderRadius:8,padding:'9px 12px',color:C.orange,fontFamily:'monospace',fontSize:13,fontWeight:700,outline:'none',boxSizing:'border-box'}}/>
          {btcPrice&&!customPrice&&<div style={{fontSize:8,color:C.t3,marginTop:3}}>Usando precio actual: ${btcPrice.toLocaleString()}</div>}
        </div>

        <div>
          <div style={{fontSize:9,color:C.t3,marginBottom:6,fontWeight:600}}>% Fee NeuraHash</div>
          <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
            {[0,10,15,18,20,25].map(pct=>(
              <button key={pct} onClick={()=>setFeeSelected(pct)}
                style={{padding:'5px 11px',borderRadius:6,border:'none',cursor:'pointer',fontFamily:'monospace',fontSize:10,fontWeight:700,transition:'all .15s',
                  background:feeSelected===pct?'rgba(247,147,26,0.2)':'rgba(255,255,255,0.04)',
                  color:feeSelected===pct?C.orange:C.t3,
                  outline:feeSelected===pct?'1px solid rgba(247,147,26,0.5)':'1px solid rgba(255,255,255,0.06)',
                }}>
                {pct===0?'0%':`${pct}%`}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Panel derecho — resultados */}
      <div style={{background:'rgba(14,14,22,0.8)',border:`1px solid ${C.border}`,borderRadius:12,padding:16}}>
        <div style={{fontSize:9,color:C.t3,textTransform:'uppercase',letterSpacing:'.12em',fontWeight:600,marginBottom:12}}>
          📊 Revenue — {selectedEquipo?selectedEquipo.modelo:`${hashrateUsado||0} TH/s`}
        </div>

        {!hashrateUsado?(
          <div style={{color:C.t3,fontSize:11,textAlign:'center',padding:30,fontStyle:'italic'}}>Seleccioná un equipo o ingresá el hashrate</div>
        ):(
          <>
            {/* Producción bruta */}
            <div style={{marginBottom:14,padding:'10px 12px',background:'rgba(255,255,255,0.02)',borderRadius:8}}>
              <div style={{fontSize:8,color:C.t3,textTransform:'uppercase',letterSpacing:'.1em',fontWeight:600,marginBottom:8}}>Producción bruta (FPPS)</div>
              {[
                {label:'BTC / día',val:btcDay?btcFmt(btcDay):'—',color:C.orange},
                {label:'BTC / mes (×30)',val:btcMes?btcFmt(btcMes):'—',color:C.orange},
                {label:'USD / día',val:usdDay?money(usdDay):'—',color:C.gold2},
                {label:'USD / mes',val:usdMes?money(usdMes):'—',color:C.gold2},
              ].map(r=>(
                <div key={r.label} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'5px 0',borderBottom:`1px solid ${C.border}`}}>
                  <span style={{fontSize:9,color:C.t3}}>{r.label}</span>
                  <span style={{...num,fontSize:11,color:r.color}}>{r.val}</span>
                </div>
              ))}
            </div>

            {/* Fee breakdown */}
            {feeSelected>0&&(
              <>
                <div style={{marginBottom:10,padding:'10px 12px',background:'rgba(247,147,26,0.05)',border:'1px solid rgba(247,147,26,0.15)',borderRadius:8}}>
                  <div style={{fontSize:8,color:C.orange,textTransform:'uppercase',letterSpacing:'.1em',fontWeight:600,marginBottom:8}}>Fee NeuraHash {feeSelected}%</div>
                  {[
                    {label:'Fee BTC/día',val:feeDay?btcFmt(feeDay):'—',color:C.orange},
                    {label:'Fee BTC/mes',val:feeMes?btcFmt(feeMes):'—',color:C.orange},
                    {label:'Fee USD/mes',val:feeUsdMes?money(feeUsdMes):'—',color:C.gold2},
                  ].map(r=>(
                    <div key={r.label} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'4px 0',borderBottom:`1px solid rgba(247,147,26,0.08)`}}>
                      <span style={{fontSize:9,color:C.t3}}>{r.label}</span>
                      <span style={{...num,fontSize:11,color:r.color}}>{r.val}</span>
                    </div>
                  ))}
                </div>

                <div style={{padding:'10px 12px',background:'rgba(16,185,129,0.04)',border:'1px solid rgba(16,185,129,0.15)',borderRadius:8}}>
                  <div style={{fontSize:8,color:C.green,textTransform:'uppercase',letterSpacing:'.1em',fontWeight:600,marginBottom:8}}>Cliente recibe</div>
                  {[
                    {label:'BTC/día neto',val:clienteDay?btcFmt(clienteDay):'—'},
                    {label:'BTC/mes neto',val:clienteMes?btcFmt(clienteMes):'—'},
                    {label:'USD/mes neto',val:clienteMes&&precioUsado?money(clienteMes*precioUsado):'—'},
                  ].map(r=>(
                    <div key={r.label} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'4px 0',borderBottom:`1px solid rgba(16,185,129,0.08)`}}>
                      <span style={{fontSize:9,color:C.t3}}>{r.label}</span>
                      <span style={{...num,fontSize:11,color:C.green}}>{r.val}</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {difficulty&&<div style={{marginTop:10,fontSize:8,color:C.t3,textAlign:'right'}}>Dificultad: {(difficulty/1e12).toFixed(2)}T · FPPS</div>}
          </>
        )}
      </div>
    </div>
  )
}
