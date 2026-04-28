import { useState, useRef, useEffect } from 'react'

const C={void:'#060608',border:'rgba(255,255,255,0.06)',border2:'rgba(255,255,255,0.11)',gold:'#d4a843',gold2:'#f0c060',green:'#10b981',red:'#f43f5e',blue:'#6366f1',t1:'#f0f0f8',t2:'#808098',t3:'#40405a'}

export default function AI({clientes,equipos,finanzas,alertas,tareas}){
  const[messages,setMessages]=useState([{role:'assistant',content:'Hola! Soy tu asistente NeuraHash. Puedo ayudarte con análisis de tus miners, clientes, finanzas y operaciones. ¿En qué te puedo ayudar?'}])
  const[input,setInput]=useState('')
  const[loading,setLoading]=useState(false)
  const bottomRef=useRef(null)

  useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:'smooth'})},[messages])

  const ing=finanzas.filter(f=>f.tipo==='ingreso').reduce((a,b)=>a+Number(b.monto),0)
  const gst=finanzas.filter(f=>f.tipo==='gasto').reduce((a,b)=>a+Number(b.monto),0)

  const context=`Eres el asistente de operaciones de NeuraHash, una empresa de Bitcoin mining hosting en Paraguay y Bolivia.

DATOS ACTUALES DEL SISTEMA:
- Equipos: ${equipos.length} total, ${equipos.filter(e=>e.estado==='activo').length} activos
- Hashrate total: ${equipos.reduce((a,b)=>a+Number(b.hashrate||0),0)} TH/s
- Clientes: ${clientes.length} (${clientes.map(c=>c.nombre+' - '+c.unidades_asic+' ASICs - $'+c.tarifa_mensual+'/mes').join(', ')})
- Ingresos totales: $${ing.toLocaleString()}
- Gastos totales: $${gst.toLocaleString()}
- Neto: $${(ing-gst).toLocaleString()}
- Alertas de energía pendientes: ${alertas.length}
- Tareas pendientes: ${tareas.filter(t=>!t.completada).length}

Responde siempre en español, de forma concisa y profesional. Usa datos reales del sistema cuando sea relevante.`

  async function sendMessage(){
    if(!input.trim()||loading)return
    const userMsg={role:'user',content:input}
    setMessages(p=>[...p,userMsg])
    setInput('')
    setLoading(true)

    try{
      const res=await fetch('/api/chat',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          model:'claude-sonnet-4-20250514',
          max_tokens:1000,
          system:context,
          messages:[...messages,userMsg].filter(m=>m.role!=='system')
        })
      })
      const data=await res.json()
      const reply=data?.content?.[0]?.text||data?.error?.message||JSON.stringify(data)||'Error al procesar la respuesta'
      setMessages(p=>[...p,{role:'assistant',content:reply}])
    }catch(e){
      setMessages(p=>[...p,{role:'assistant',content:'Error de conexión. Intenta de nuevo.'}])
    }
    setLoading(false)
  }

  return(
    <div style={{display:'flex',flexDirection:'column',height:'calc(100vh - 120px)',maxHeight:700}}>
      <div style={{background:'rgba(14,14,22,0.8)',backdropFilter:'blur(20px)',border:`1px solid ${C.border}`,borderRadius:12,overflow:'hidden',display:'flex',flexDirection:'column',flex:1}}>
        
        <div style={{display:'flex',alignItems:'center',gap:10,padding:'14px 18px',borderBottom:`1px solid ${C.border}`,background:'rgba(255,255,255,0.015)'}}>
          <div style={{width:8,height:8,borderRadius:'50%',background:C.green,boxShadow:`0 0 8px ${C.green}`,animation:'ledPulse 2s infinite'}}/>
          <span style={{fontSize:10,letterSpacing:'.12em',textTransform:'uppercase',color:C.t2,fontWeight:600}}>🧠 Asistente NeuraHash IA</span>
          <span style={{marginLeft:'auto',fontSize:8,color:C.t3,letterSpacing:'.1em'}}>claude-sonnet</span>
        </div>

        <div style={{flex:1,overflowY:'auto',padding:'16px 18px',display:'flex',flexDirection:'column',gap:12}}>
          {messages.map((m,i)=>(
            <div key={i} style={{display:'flex',justifyContent:m.role==='user'?'flex-end':'flex-start'}}>
              <div style={{maxWidth:'80%',padding:'10px 14px',borderRadius:m.role==='user'?'12px 12px 2px 12px':'12px 12px 12px 2px',background:m.role==='user'?`linear-gradient(135deg,${C.gold},#e8b84b)`:'rgba(255,255,255,0.05)',border:m.role==='user'?'none':`1px solid ${C.border}`,fontSize:12,lineHeight:1.6,color:m.role==='user'?'#000':C.t1,fontWeight:m.role==='user'?500:400,whiteSpace:'pre-wrap'}}>
                {m.content}
              </div>
            </div>
          ))}
          {loading&&(
            <div style={{display:'flex',justifyContent:'flex-start'}}>
              <div style={{padding:'10px 16px',borderRadius:'12px 12px 12px 2px',background:'rgba(255,255,255,0.05)',border:`1px solid ${C.border}`,display:'flex',gap:4,alignItems:'center'}}>
                {[0,1,2].map(i=><span key={i} style={{width:6,height:6,borderRadius:'50%',background:C.gold,animation:`fadeUp .8s ${i*.2}s infinite alternate`}}/>)}
              </div>
            </div>
          )}
          <div ref={bottomRef}/>
        </div>

        <div style={{padding:'12px 16px',borderTop:`1px solid ${C.border}`,display:'flex',gap:8}}>
          <input
            style={{flex:1,background:'rgba(255,255,255,0.04)',border:`1px solid ${C.border2}`,borderRadius:10,padding:'10px 14px',color:C.t1,fontFamily:'Inter,sans-serif',fontSize:12,outline:'none'}}
            placeholder="Preguntame algo sobre tus operaciones..."
            value={input}
            onChange={e=>setInput(e.target.value)}
            onKeyDown={e=>e.key==='Enter'&&!e.shiftKey&&sendMessage()}
          />
          <button
            onClick={sendMessage}
            disabled={loading||!input.trim()}
            style={{padding:'10px 16px',borderRadius:10,border:'none',cursor:'pointer',background:`linear-gradient(135deg,${C.gold},#e8b84b)`,color:'#000',fontWeight:700,fontSize:12,opacity:loading||!input.trim()?0.5:1,transition:'all .2s'}}
          >→</button>
        </div>
      </div>
    </div>
  )
}