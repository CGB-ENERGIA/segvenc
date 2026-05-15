'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface Usuario {
  id: string
  email: string
  nome: string | null
  nivel: 'admin' | 'operador' | 'visualizador'
  pode_auditar: boolean
  bases: number[]
  modulos_acesso: string[]
}

interface AuthContextType {
  usuario: Usuario | null
  carregando: boolean
}

const AuthContext = createContext<AuthContextType>({ usuario: null, carregando: true })

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    async function carregarUsuario() {
      console.log('iniciando carregamento...')
      setCarregando(true)
      const { data: { user } } = await supabase.auth.getUser()
      console.log('user:', user?.email)

      if (!user) { setCarregando(false); return }

      const { data: perfil } = await supabase
        .from('usuarios')
        .select('id, email, nome, nivel, pode_auditar, modulos_acesso')
        .eq('id', user.id)
        .single()

      if (!perfil) { setCarregando(false); return }

      let bases: number[] = []
      if (perfil.nivel !== 'admin') {
        const { data: ub } = await supabase
          .from('usuarios_bases')
          .select('base_id')
          .eq('usuario_id', user.id)
        bases = (ub || []).map((b: { base_id: number }) => b.base_id)
      }

      setUsuario({
        id: perfil.id,
        email: perfil.email,
        nome: perfil.nome,
        nivel: perfil.nivel,
        pode_auditar: perfil.pode_auditar,
        bases,
        modulos_acesso: perfil.modulos_acesso || [],
      })
      setCarregando(false)
      console.log('carregamento finalizado')
    }

    carregarUsuario()

  const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT') {
    setUsuario(null)
    setCarregando(false)
  }
})

    return () => subscription.unsubscribe()
  }, [])

  return (
    <AuthContext.Provider value={{ usuario, carregando }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}