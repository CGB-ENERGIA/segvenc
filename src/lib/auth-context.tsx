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
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setCarregando(false); return }

      const { data: perfil } = await supabase
        .from('usuarios')
        .select('id, email, nome, nivel, pode_auditar')
        .eq('id', user.id)
        .single()

      if (!perfil) { setCarregando(false); return }

      // Buscar bases vinculadas (admin vê tudo)
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
      })
      setCarregando(false)
    }

    carregarUsuario()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      carregarUsuario()
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