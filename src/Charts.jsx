import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'

const C={gold:'#d4a843',gold2:'#f0c060',green:'#10b981',red:'#f43f5e',t1:'#f0f0f8',t2:'#808098',t3:'#40405a',border:'rgba(255,255,255,0.06)'}

function getMonthlyData(finanzas){
  const meses={}
  finanzas.forEach(f=>{
    const fecha=new Date(f.fecha)
    const key=`${fecha.getFullYear()}-${String(fecha.getMonth()+1).padStart(2,'0')}`
    const label=fecha.toLocaleString('es',{month:'short',year:'2-digit'}).toUpperCase()
    if(!meses[key])meses[key]={key,label,ingresos:0,gastos:0}
    if(f.tipo==='ingreso')meses[key].ingresos+=Number(f.monto)
    else meses[key].gastos+=Number(f.monto)
  })
  return Object.values(meses).sort((a,b)=>a.key.localeCompare(b.key)).slice(-6)
}

const CustomTooltip=({active,payload,label})=>{
  if(!active||!payload?.length)return null
  return(
    <div style={{background:'rgba(14,14,22,0.97)',border:`1px solid ${C.border}`,borderRadius:10,padding:'12px 16px',fontFamily:'Inter,sans-serif'}}>
      <div style={{fontSize:10,color:C.t2,marginBottom:8,letterSpacing:'.1em',textTransform:'uppercase'}}>{label}</div>
      {payload.map(p=>(
        <div key={p.name} style={{display:'flex',justifyContent:'space-between',gap:20,fontSize:11,marginBottom:4}}>
          <span style={{color:C.t2}}>{p.name==='ingresos'?'Ingresos':'Gastos'}</span>
          <span style={{fontFamily:'monospace',fontWeight:700,color:p.name==='ingresos'?C.green:C.red}}>${Number(p.value).toLocaleString()}</span>
        </div>
      ))}
      <div style={{borderTop:`1px solid ${C.border}`,marginTop:8,paddingTop:8,display:'flex',justifyContent:'space-between',fontSize:11}}>
        <span style={{color:C.t2}}>Neto</span>
        <span style={{fontFamily:'monospace',fontWeight:700,color:C.gold2}}>${(payload.find(p=>p.name==='ingresos')?.value||0)-(payload.find(p=>p.name==='gastos')?.value||0)>=0?'':'-'}${Math.abs((payload.find(p=>p.name==='ingresos')?.value||0)-(payload.find(p=>p.name==='gastos')?.value||0)).toLocaleString()}</span>
      </div>
    </div>
  )
}

export default function Charts({finanzas}){
  const data=getMonthlyData(finanzas)

  if(!data.length)return(
    <div style={{padding:40,textAlign:'center',color:C.t3,fontSize:11,textTransform:'uppercase',letterSpacing:'.1em'}}>
      Sin datos para mostrar
    </div>
  )

  return(
    <div style={{width:'100%',height:240}}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{top:10,right:10,left:0,bottom:0}} barGap={4}>
          <XAxis dataKey="label" tick={{fill:C.t3,fontSize:9,fontFamily:'monospace',letterSpacing:'.08em'}} axisLine={{stroke:C.border}} tickLine={false}/>
          <YAxis tick={{fill:C.t3,fontSize:9,fontFamily:'monospace'}} axisLine={false} tickLine={false} tickFormatter={v=>`$${v>=1000?Math.round(v/1000)+'k':v}`}/>
          <Tooltip content={<CustomTooltip/>} cursor={{fill:'rgba(255,255,255,0.03)'}}/>
          <Bar dataKey="ingresos" fill={C.green} radius={[4,4,0,0]} maxBarSize={32} fillOpacity={0.85}/>
          <Bar dataKey="gastos" fill={C.red} radius={[4,4,0,0]} maxBarSize={32} fillOpacity={0.85}/>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}