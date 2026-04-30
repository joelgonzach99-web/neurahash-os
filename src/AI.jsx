import { useState, useEffect, useRef } from 'react'

const C = {
  border: 'rgba(255,255,255,0.06)',
  border2: 'rgba(255,255,255,0.11)',
  gold: '#d4a843', gold2: '#f0c060',
  green: '#10b981', red: '#f43f5e',
  amber: '#f59e0b', blue: '#6366f1',
  purple: '#a855f7', t1: '#f0f0f8',
  t2: '#808098', t3: '#40405a'
}

async function callAI(systemPrompt, userMessage, onChunk) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 55000)
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }]
      })
    })
    const data = await res.json()
    clearTimeout(timeout)
    return data?.content?.[0]?.text || data?.error?.message || 'Sin respuesta'
  } catch (e) {
    clearTimeout(timeout)
    if (e.name === 'AbortError') return '⚠️ Timeout — la respuesta tardó demasiado. Intentá de nuevo.'
    return `Error: ${e.message}`
  }
}

// ─── AGENTE JEFE ───────────────────────────────────────────────────────────
function AgenteJefe({ clientes, equipos, finanzas, alertas, tareas }) {
  const [resumen, setResumen] = useState(null)
  const [loading, setLoading] = useState(false)
  const [lastRun, setLastRun] = useState(null)

  const ing = finanzas.filter(f => f.tipo === 'ingreso').reduce((a, b) => a + Number(b.monto || 0), 0)
  const gst = finanzas.filter(f => f.tipo === 'gasto').reduce((a, b) => a + Number(b.monto || 0), 0)
  const equiposLibres = equipos.filter(e => !e.cliente_asignado_id).length
  const cobrosVencidos = clientes.filter(c => {
    if (!c.dia_cobro) return false
    const hoy = new Date()
    const cobro = new Date(hoy.getFullYear(), hoy.getMonth(), c.dia_cobro)
    return cobro < hoy
  }).length

  async function generarResumen() {
    setLoading(true)
    const ctx = `
DATOS ACTUALES DE NEURAHASH:
- Clientes: ${clientes.length} (${cobrosVencidos} con cobros vencidos)
- Equipos: ${equipos.length} total, ${equiposLibres} sin asignar
- Alertas energía: ${alertas.length} pendientes
- Tareas pendientes: ${tareas.filter(t => !t.completada).length}
- Finanzas: Ingresos $${ing.toLocaleString()} | Gastos $${gst.toLocaleString()} | Neto $${(ing - gst).toLocaleString()}
- Clientes: ${clientes.map(c => c.nombre).join(', ')}
- Equipos sin asignar: ${equipos.filter(e => !e.cliente_asignado_id).map(e => e.modelo).join(', ') || 'ninguno'}
`
    const system = `Sos el Agente Jefe de NeuraHash, una empresa de hosting de minería Bitcoin en Paraguay y Bolivia. 
Analizás los datos del negocio y das un resumen ejecutivo diario conciso y accionable.
Respondé en español, de forma directa y profesional. Máximo 200 palabras.
Identificá los 3 puntos más importantes del día y qué acción tomar en cada uno.
Usá emojis para hacer el resumen más visual.`

    const resultado = await callAI(system, `Generá el resumen ejecutivo diario con estos datos:\n${ctx}`)
    setResumen(resultado)
    setLastRun(new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }))
    setLoading(false)
  }

  useEffect(() => {
    if (clientes.length > 0 || equipos.length > 0) generarResumen()
  }, [])

  return (
    <div style={{ background: 'linear-gradient(135deg,rgba(212,168,67,0.08),rgba(99,102,241,0.05))', border: '1px solid rgba(212,168,67,0.2)', borderRadius: 14, padding: '18px 20px', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg,#d4a843,#f0c060)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>👑</div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.gold2, letterSpacing: '.05em' }}>AGENTE JEFE</div>
            <div style={{ fontSize: 8, color: C.t3, marginTop: 1 }}>Coordinador · Resumen ejecutivo</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {lastRun && <span style={{ fontSize: 8, color: C.t3 }}>Último: {lastRun}</span>}
          <button onClick={generarResumen} disabled={loading} style={{ background: loading ? 'rgba(255,255,255,0.04)' : 'linear-gradient(135deg,#d4a843,#e8b84b)', border: 'none', borderRadius: 8, padding: '7px 14px', cursor: loading ? 'wait' : 'pointer', fontFamily: 'Inter,sans-serif', fontSize: 10, fontWeight: 600, color: loading ? C.t3 : '#000' }}>
            {loading ? '⟳ Analizando...' : '↻ Actualizar'}
          </button>
        </div>
      </div>

      {/* KPIs rápidos */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 14 }}>
        {[
          { label: 'Clientes', val: clientes.length, color: C.blue, alert: cobrosVencidos > 0 ? `${cobrosVencidos} vencidos` : null },
          { label: 'Equipos libres', val: equiposLibres, color: equiposLibres > 0 ? C.amber : C.green, alert: equiposLibres > 0 ? 'Sin asignar' : null },
          { label: 'Alertas', val: alertas.length, color: alertas.length > 0 ? C.red : C.green, alert: null },
          { label: 'Neto USD', val: `$${(ing - gst).toLocaleString()}`, color: (ing - gst) >= 0 ? C.green : C.red, alert: null },
        ].map(k => (
          <div key={k.label} style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 8, padding: '8px 10px', border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 8, color: C.t3, marginBottom: 4 }}>{k.label}</div>
            <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 14, color: k.color }}>{k.val}</div>
            {k.alert && <div style={{ fontSize: 7, color: C.amber, marginTop: 2 }}>⚠ {k.alert}</div>}
          </div>
        ))}
      </div>

      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 0' }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.gold, animation: 'ledPulse 1s infinite' }} />
          <span style={{ fontSize: 11, color: C.t2 }}>Analizando el negocio...</span>
        </div>
      )}
      {resumen && !loading && (
        <div style={{ fontSize: 12, color: C.t1, lineHeight: 1.7, whiteSpace: 'pre-wrap', borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>{resumen}</div>
      )}
    </div>
  )
}

// ─── AGENTE STOCK ───────────────────────────────────────────────────────────
function AgenteStock({ equipos, clientes }) {
  const [analisis, setAnalisis] = useState(null)
  const [loading, setLoading] = useState(false)
  const libres = equipos.filter(e => !e.cliente_asignado_id)
  const porModelo = equipos.reduce((acc, e) => {
    acc[e.modelo] = (acc[e.modelo] || 0) + 1
    return acc
  }, {})

  async function analizar() {
    setLoading(true)
    const ctx = `
Equipos totales: ${equipos.length}
Por modelo: ${Object.entries(porModelo).map(([m, n]) => `${m}: ${n} unidades`).join(', ')}
Sin asignar: ${libres.map(e => e.modelo).join(', ') || 'ninguno'}
Clientes activos: ${clientes.length}
Capacidad total: ${equipos.reduce((a, b) => a + Number(b.hashrate || 0), 0)} TH/s
`
    const result = await callAI(
      'Sos el Agente de Stock de NeuraHash. Analizás el inventario de miners ASIC. Sé conciso, máximo 150 palabras. Respondé en español.',
      `Analizá este inventario y decí si hay equipos que deberían asignarse o si falta capacidad:\n${ctx}`
    )
    setAnalisis(result)
    setLoading(false)
  }

  return (
    <div style={{ background: 'rgba(14,14,22,0.8)', border: `1px solid ${C.border}`, borderRadius: 12, padding: '16px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 20 }}>⛏</span>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.t1 }}>AGENTE STOCK</div>
            <div style={{ fontSize: 8, color: C.t3 }}>Inventario · Asignación</div>
          </div>
        </div>
        <button onClick={analizar} disabled={loading} style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 7, padding: '5px 12px', cursor: 'pointer', fontFamily: 'Inter,sans-serif', fontSize: 10, color: C.blue }}>
          {loading ? '...' : 'Analizar'}
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
        <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 8, padding: '8px 10px' }}>
          <div style={{ fontSize: 8, color: C.t3 }}>Equipos libres</div>
          <div style={{ fontFamily: 'monospace', fontSize: 18, color: libres.length > 0 ? C.amber : C.green, fontWeight: 700 }}>{libres.length}</div>
        </div>
        <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 8, padding: '8px 10px' }}>
          <div style={{ fontSize: 8, color: C.t3 }}>Asignados</div>
          <div style={{ fontFamily: 'monospace', fontSize: 18, color: C.gold2, fontWeight: 700 }}>{equipos.length - libres.length}</div>
        </div>
      </div>
      {libres.length > 0 && (
        <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8, padding: '8px 10px', marginBottom: 10 }}>
          <div style={{ fontSize: 9, color: C.amber, fontWeight: 600, marginBottom: 4 }}>⚠ Equipos sin asignar</div>
          {Object.entries(libres.reduce((acc, e) => { acc[e.modelo] = (acc[e.modelo] || 0) + 1; return acc }, {})).map(([m, n]) => (
            <div key={m} style={{ fontSize: 9, color: C.t2 }}>{n}x {m}</div>
          ))}
        </div>
      )}
      {analisis && <div style={{ fontSize: 11, color: C.t1, lineHeight: 1.6, borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>{analisis}</div>}
    </div>
  )
}

// ─── AGENTE FINANZAS ─────────────────────────────────────────────────────────
function AgenteFinanzas({ finanzas, clientes }) {
  const [analisis, setAnalisis] = useState(null)
  const [loading, setLoading] = useState(false)

  const mesActual = new Date().toISOString().slice(0, 7)
  const finMes = finanzas.filter(f => f.fecha?.slice(0, 7) === mesActual)
  const ingMes = finMes.filter(f => f.tipo === 'ingreso').reduce((a, b) => a + Number(b.monto || 0), 0)
  const gstMes = finMes.filter(f => f.tipo === 'gasto').reduce((a, b) => a + Number(b.monto || 0), 0)
  const gastoAllan = finanzas.filter(f => f.tipo === 'gasto' && f.responsable === 'Allan').reduce((a, b) => a + Number(b.monto || 0), 0)
  const gastoJoel = finanzas.filter(f => f.tipo === 'gasto' && f.responsable === 'Joel').reduce((a, b) => a + Number(b.monto || 0), 0)

  async function analizar() {
    setLoading(true)
    const ctx = `
Mes actual (${mesActual}):
- Ingresos: $${ingMes.toLocaleString()}
- Gastos: $${gstMes.toLocaleString()}
- Neto del mes: $${(ingMes - gstMes).toLocaleString()}

Gastos por responsable (histórico):
- Allan: $${gastoAllan.toLocaleString()}
- Joel: $${gastoJoel.toLocaleString()}

Últimas transacciones: ${finanzas.slice(0, 5).map(f => `${f.tipo} $${f.monto} (${f.descripcion})`).join(', ')}
`
    const result = await callAI(
      'Sos el Agente Financiero de NeuraHash. Analizás ingresos, gastos y tendencias. Máximo 150 palabras. Respondé en español con recomendaciones concretas.',
      `Analizá las finanzas y detectá algo inusual o que requiera atención:\n${ctx}`
    )
    setAnalisis(result)
    setLoading(false)
  }

  return (
    <div style={{ background: 'rgba(14,14,22,0.8)', border: `1px solid ${C.border}`, borderRadius: 12, padding: '16px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 20 }}>💰</span>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.t1 }}>AGENTE FINANZAS</div>
            <div style={{ fontSize: 8, color: C.t3 }}>Ingresos · Gastos · Anomalías</div>
          </div>
        </div>
        <button onClick={analizar} disabled={loading} style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 7, padding: '5px 12px', cursor: 'pointer', fontFamily: 'Inter,sans-serif', fontSize: 10, color: C.green }}>
          {loading ? '...' : 'Analizar'}
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
        {[
          { label: `Ingresos ${mesActual.slice(5)}`, val: `$${ingMes.toLocaleString()}`, color: C.green },
          { label: `Gastos ${mesActual.slice(5)}`, val: `$${gstMes.toLocaleString()}`, color: C.red },
          { label: 'Neto mes', val: `$${(ingMes - gstMes).toLocaleString()}`, color: (ingMes - gstMes) >= 0 ? C.green : C.red },
        ].map(k => (
          <div key={k.label} style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 8, padding: '8px 10px' }}>
            <div style={{ fontSize: 8, color: C.t3 }}>{k.label}</div>
            <div style={{ fontFamily: 'monospace', fontSize: 13, color: k.color, fontWeight: 700 }}>{k.val}</div>
          </div>
        ))}
      </div>
      {analisis && <div style={{ fontSize: 11, color: C.t1, lineHeight: 1.6, borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>{analisis}</div>}
    </div>
  )
}

// ─── AGENTE CLIENTES ─────────────────────────────────────────────────────────
function AgenteClientes({ clientes, equipos }) {
  const [analisis, setAnalisis] = useState(null)
  const [loading, setLoading] = useState(false)

  const hoy = new Date()
  const cobrosProximos = clientes.filter(c => {
    if (!c.dia_cobro) return false
    const cobro = new Date(hoy.getFullYear(), hoy.getMonth(), c.dia_cobro)
    if (cobro <= hoy) cobro.setMonth(cobro.getMonth() + 1)
    const dias = Math.round((cobro - hoy) / 864e5)
    return dias <= 5
  })

  async function analizar() {
    setLoading(true)
    const ctx = clientes.map(c => {
      const eqAsig = equipos.filter(e => e.cliente_asignado_id === c.id).length
      return `${c.nombre}: ${eqAsig} equipos, $${c.tarifa_mensual}/mes, cobro día ${c.dia_cobro || 'N/A'}, país: ${c.pais}`
    }).join('\n')

    const result = await callAI(
      'Sos el Agente de Clientes de NeuraHash. Analizás el portafolio de clientes y cobros. Máximo 150 palabras. Respondé en español.',
      `Analizá estos clientes y alertá sobre cobros próximos o clientes sin equipos:\n${ctx}`
    )
    setAnalisis(result)
    setLoading(false)
  }

  return (
    <div style={{ background: 'rgba(14,14,22,0.8)', border: `1px solid ${C.border}`, borderRadius: 12, padding: '16px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 20 }}>👥</span>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.t1 }}>AGENTE CLIENTES</div>
            <div style={{ fontSize: 8, color: C.t3 }}>Cobros · Contratos · Alertas</div>
          </div>
        </div>
        <button onClick={analizar} disabled={loading} style={{ background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.3)', borderRadius: 7, padding: '5px 12px', cursor: 'pointer', fontFamily: 'Inter,sans-serif', fontSize: 10, color: C.purple }}>
          {loading ? '...' : 'Analizar'}
        </button>
      </div>

      {cobrosProximos.length > 0 && (
        <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8, padding: '8px 10px', marginBottom: 10 }}>
          <div style={{ fontSize: 9, color: C.amber, fontWeight: 600, marginBottom: 4 }}>🔔 Cobros próximos (5 días)</div>
          {cobrosProximos.map(c => (
            <div key={c.id} style={{ fontSize: 9, color: C.t2 }}>{c.nombre} — ${c.tarifa_mensual}</div>
          ))}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
        <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 8, padding: '8px 10px' }}>
          <div style={{ fontSize: 8, color: C.t3 }}>Total clientes</div>
          <div style={{ fontFamily: 'monospace', fontSize: 18, color: C.blue, fontWeight: 700 }}>{clientes.length}</div>
        </div>
        <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 8, padding: '8px 10px' }}>
          <div style={{ fontSize: 8, color: C.t3 }}>MRR estimado</div>
          <div style={{ fontFamily: 'monospace', fontSize: 14, color: C.gold2, fontWeight: 700 }}>${clientes.reduce((a, b) => a + Number(b.tarifa_mensual || 0), 0).toLocaleString()}</div>
        </div>
      </div>
      {analisis && <div style={{ fontSize: 11, color: C.t1, lineHeight: 1.6, borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>{analisis}</div>}
    </div>
  )
}

// ─── CHAT LIBRE ──────────────────────────────────────────────────────────────
function ChatLibre({ clientes, equipos, finanzas, alertas, tareas }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const endRef = useRef(null)

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const systemPrompt = `Sos el asistente IA de NeuraHash, empresa de hosting de minería Bitcoin en Paraguay y Bolivia.
Tenés acceso a estos datos en tiempo real:
- Clientes (${clientes.length}): ${clientes.map(c => `${c.nombre} (${c.unidades_asic} ASICs, $${c.tarifa_mensual}/mes)`).join(', ')}
- Equipos (${equipos.length}): ${equipos.reduce((acc, e) => { acc[e.modelo] = (acc[e.modelo] || 0) + 1; return acc }, {})} 
- Finanzas: ${finanzas.length} movimientos registrados
- Alertas energía: ${alertas.length}
- Tareas: ${tareas.filter(t => !t.completada).length} pendientes

Respondé siempre en español, de forma concisa y profesional. Si te preguntan sobre datos específicos, buscalos en el contexto.`

  async function send() {
    if (!input.trim() || loading) return
    const userMsg = input.trim()
    setInput('')
    setMessages(p => [...p, { role: 'user', content: userMsg }])
    setLoading(true)

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 55000)
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 800,
          system: systemPrompt,
          messages: [...messages, { role: 'user', content: userMsg }].filter(m => m.role !== 'system')
        })
      })
      const data = await res.json()
      clearTimeout(timeout)
      const reply = data?.content?.[0]?.text || 'Sin respuesta'
      setMessages(p => [...p, { role: 'assistant', content: reply }])
    } catch (e) {
      clearTimeout(timeout)
      setMessages(p => [...p, { role: 'assistant', content: e.name === 'AbortError' ? '⚠️ Timeout. Intentá de nuevo.' : `Error: ${e.message}` }])
    }
    setLoading(false)
  }

  return (
    <div style={{ background: 'rgba(14,14,22,0.8)', border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 16 }}>🧠</span>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.t1 }}>CHAT LIBRE</div>
          <div style={{ fontSize: 8, color: C.t3 }}>Preguntá cualquier cosa sobre tu operación</div>
        </div>
      </div>
      <div style={{ height: 280, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {messages.length === 0 && (
          <div style={{ color: C.t3, fontSize: 11, textAlign: 'center', marginTop: 40 }}>
            Preguntame sobre clientes, equipos, finanzas o cualquier cosa del negocio.
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div style={{ maxWidth: '80%', padding: '10px 14px', borderRadius: m.role === 'user' ? '12px 12px 4px 12px' : '12px 12px 12px 4px', background: m.role === 'user' ? 'linear-gradient(135deg,#d4a843,#e8b84b)' : 'rgba(255,255,255,0.06)', color: m.role === 'user' ? '#000' : C.t1, fontSize: 12, lineHeight: 1.6 }}>
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: 'flex', gap: 4, padding: '10px 14px', background: 'rgba(255,255,255,0.06)', borderRadius: '12px 12px 12px 4px', width: 'fit-content' }}>
            {[0, 1, 2].map(i => <span key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: C.t3, animation: `ledPulse 1s ${i * 0.2}s infinite` }} />)}
          </div>
        )}
        <div ref={endRef} />
      </div>
      <div style={{ padding: '12px 16px', borderTop: `1px solid ${C.border}`, display: 'flex', gap: 8 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()}
          placeholder="Preguntame algo sobre tus operaciones..."
          style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border2}`, borderRadius: 8, padding: '10px 14px', color: C.t1, fontFamily: 'Inter,sans-serif', fontSize: 12, outline: 'none' }}
        />
        <button onClick={send} disabled={loading || !input.trim()} style={{ background: input.trim() ? 'linear-gradient(135deg,#d4a843,#e8b84b)' : 'rgba(255,255,255,0.04)', border: 'none', borderRadius: 8, width: 40, cursor: input.trim() ? 'pointer' : 'default', fontSize: 16, color: input.trim() ? '#000' : C.t3 }}>→</button>
      </div>
    </div>
  )
}

// ─── COMPONENTE PRINCIPAL ────────────────────────────────────────────────────
export default function AI({ clientes = [], equipos = [], finanzas = [], alertas = [], tareas = [] }) {
  const [activeTab, setActiveTab] = useState('jefe')

  const tabs = [
    { id: 'jefe', label: '👑 Jefe', desc: 'Resumen diario' },
    { id: 'agentes', label: '🤖 Agentes', desc: 'Stock · Finanzas · Clientes' },
    { id: 'chat', label: '💬 Chat', desc: 'Consulta libre' },
  ]

  return (
    <div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: 'rgba(255,255,255,0.03)', padding: 4, borderRadius: 10, width: 'fit-content' }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{ background: activeTab === t.id ? 'rgba(212,168,67,0.1)' : 'none', border: 'none', cursor: 'pointer', fontFamily: 'Inter,sans-serif', fontSize: 11, fontWeight: 600, padding: '7px 16px', borderRadius: 8, color: activeTab === t.id ? C.gold2 : C.t2, transition: 'all .15s' }}>
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'jefe' && (
        <AgenteJefe clientes={clientes} equipos={equipos} finanzas={finanzas} alertas={alertas} tareas={tareas} />
      )}

      {activeTab === 'agentes' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <AgenteStock equipos={equipos} clientes={clientes} />
            <AgenteFinanzas finanzas={finanzas} clientes={clientes} />
          </div>
          <AgenteClientes clientes={clientes} equipos={equipos} />
        </div>
      )}

      {activeTab === 'chat' && (
        <ChatLibre clientes={clientes} equipos={equipos} finanzas={finanzas} alertas={alertas} tareas={tareas} />
      )}
    </div>
  )
}
