import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import Login from './Login.jsx'
import './index.css'
import { useState, useEffect } from 'react'
import { supabase } from './supabase'

function Root() {
  const [session, setSession] = useState(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })
    return () => subscription.unsubscribe()
  }, [])

  if (session === undefined) return (
    <div style={{display:'flex',width:'100vw',height:'100vh',background:'#060608',alignItems:'center',justifyContent:'center'}}>
      <div style={{fontFamily:'monospace',fontSize:13,color:'#d4a843',letterSpacing:'.3em'}}>NEURAHASH OS</div>
    </div>
  )

  return session ? <App session={session} /> : <Login />
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
)