import { useState } from 'react'
import { supabase } from './supabase'

const C={void:'#060608',border:'rgba(255,255,255,0.08)',border2:'rgba(255,255,255,0.14)',gold:'#d4a843',gold2:'#f0c060',t1:'#f0f0f8',t2:'#808098',t3:'#40405a',red:'#f43f5e',green:'#10b981'}

export default function Login(){
  const[email,setEmail]=useState('')
  const[password,setPassword]=useState('')
  const[loading,setLoading]=useState(false)
  const[error,setError]=useState('')

  async function handleLogin(){
    if(!email||!password){setError('Completá los campos');return}
    setLoading(true);setError('')
    const{error}=await supabase.auth.signInWithPassword({email,password})
    if(error){setError('Email o contraseña incorrectos');setLoading(false)}
  }

  return(
    <div style={{display:'flex',width:'100vw',height:'100vh',background:'#060608',alignItems:'center',justifyContent:'center',fontFamily:'Inter,system-ui,sans-serif',position:'relative',overflow:'hidden'}}>
      <div style={{position:'absolute',top:'-20%',left:'10%',width:500,height:500,borderRadius:'50%',background:'radial-gradient(circle,rgba(212,168,67,0.07),transparent 70%)',pointerEvents:'none'}}/>
      <div style={{position:'absolute',bottom:'-10%',right:'10%',width:400,height:400,borderRadius:'50%',background:'radial-gradient(circle,rgba(99,102,241,0.06),transparent 70%)',pointerEvents:'none'}}/>

      <div style={{width:'100%',maxWidth:400,padding:'0 20px'}}>
        <div style={{textAlign:'center',marginBottom:40}}>
          <div style={{fontFamily:'monospace',fontSize:22,fontWeight:800,color:C.gold,letterSpacing:'.15em',marginBottom:8}}>NEURAHASH OS</div>
          <div style={{fontSize:11,color:C.t3,letterSpacing:'.2em',textTransform:'uppercase'}}>Sistema de Operaciones</div>
        </div>

        <div style={{background:'rgba(14,14,22,0.9)',backdropFilter:'blur(20px)',border:`1px solid ${C.border2}`,borderRadius:16,padding:32,boxShadow:'0 32px 80px rgba(0,0,0,0.5)'}}>
          <div style={{marginBottom:20}}>
            <label style={{display:'block',fontSize:9,letterSpacing:'.15em',textTransform:'uppercase',color:C.t3,marginBottom:8,fontWeight:600}}>Email</label>
            <input
              style={{width:'100%',background:'rgba(255,255,255,0.04)',border:`1px solid ${C.border2}`,borderRadius:8,padding:'12px 14px',color:C.t1,fontFamily:'Inter,sans-serif',fontSize:13,outline:'none',boxSizing:'border-box'}}
              type="email"
              placeholder="tu@email.com"
              value={email}
              onChange={e=>setEmail(e.target.value)}
              onKeyDown={e=>e.key==='Enter'&&handleLogin()}
            />
          </div>

          <div style={{marginBottom:24}}>
            <label style={{display:'block',fontSize:9,letterSpacing:'.15em',textTransform:'uppercase',color:C.t3,marginBottom:8,fontWeight:600}}>Contraseña</label>
            <input
              style={{width:'100%',background:'rgba(255,255,255,0.04)',border:`1px solid ${C.border2}`,borderRadius:8,padding:'12px 14px',color:C.t1,fontFamily:'Inter,sans-serif',fontSize:13,outline:'none',boxSizing:'border-box'}}
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={e=>setPassword(e.target.value)}
              onKeyDown={e=>e.key==='Enter'&&handleLogin()}
            />
          </div>

          {error&&<div style={{background:'rgba(244,63,94,0.08)',border:'1px solid rgba(244,63,94,0.2)',borderRadius:8,padding:'10px 14px',fontSize:11,color:C.red,marginBottom:18,textAlign:'center'}}>{error}</div>}

          <button
            onClick={handleLogin}
            disabled={loading}
            style={{width:'100%',padding:'13px',borderRadius:10,border:'none',cursor:loading?'not-allowed':'pointer',background:`linear-gradient(135deg,#d4a843,#e8b84b)`,color:'#000',fontFamily:'Inter,sans-serif',fontSize:12,fontWeight:700,letterSpacing:'.05em',boxShadow:'0 0 24px rgba(212,168,67,0.3)',opacity:loading?0.7:1,transition:'all .2s'}}
          >
            {loading?'INGRESANDO...':'INGRESAR →'}
          </button>
        </div>

        <div style={{textAlign:'center',marginTop:24,fontSize:9,color:C.t3,letterSpacing:'.1em'}}>
          ACCESO RESTRINGIDO · SOLO PERSONAL AUTORIZADO
        </div>
      </div>
    </div>
  )
}