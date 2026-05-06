'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface DashboardStats {
  totalColaboradores: number
  examesValidos: number
  proximosVencimento: number
  vencidos: number
}

export default function DashboardPage() {
  const router = useRouter()
  const [stats, setStats] = useState<DashboardStats>({
    totalColaboradores: 0,
    examesValidos: 0,
    proximosVencimento: 0,
    vencidos: 0,
  })
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    async function carregar() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const hoje = new Date()
      const em30dias = new Date()
      em30dias.setDate(hoje.getDate() + 30)

      const hojeStr = hoje.toISOString().split('T')[0]
      const em30diasStr = em30dias.toISOString().split('T')[0]

      const [
        { count: totalColab },
        { count: validos },
        { count: proximos },
        { count: vencidos },
      ] = await Promise.all([
        supabase.from('colaboradores').select('*', { count: 'exact', head: true })
          .eq('situacao', 'ATIVO'),
        supabase.from('registros_exames').select('*', { count: 'exact', head: true })
          .eq('is_atual', true)
          .gt('data_vencimento', em30diasStr),
        supabase.from('registros_exames').select('*', { count: 'exact', head: true })
          .eq('is_atual', true)
          .gte('data_vencimento', hojeStr)
          .lte('data_vencimento', em30diasStr),
        supabase.from('registros_exames').select('*', { count: 'exact', head: true })
          .eq('is_atual', true)
          .lt('data_vencimento', hojeStr),
      ])

      setStats({
        totalColaboradores: totalColab || 0,
        examesValidos: validos || 0,
        proximosVencimento: proximos || 0,
        vencidos: vencidos || 0,
      })
      setCarregando(false)
    }
    carregar()
  }, [router])

  if (carregando) {
    return <p style={{ color: '#888', fontSize: 14, fontFamily: 'Arial' }}>Carregando...</p>
  }

  const cards = [
    { label: 'Colaboradores Ativos', valor: stats.totalColaboradores, cor: '#4a4a49', bg: '#f5f5f5' },
    { label: 'Exames Válidos', valor: stats.examesValidos, cor: '#16a34a', bg: '#f0fdf4' },
    { label: 'Próximos do Vencimento', valor: stats.proximosVencimento, cor: '#d97706', bg: '#fffbeb' },
    { label: 'Vencidos', valor: stats.vencidos, cor: '#dc2626', bg: '#fef2f2' },
  ]

  return (
    <div style={{ fontFamily: 'Arial, sans-serif' }}>
      <h1 style={{ fontSize: 22, fontWeight: 500, color: '#1a1a1a', marginBottom: 4 }}>
        Dashboard
      </h1>
      <p style={{ fontSize: 14, color: '#888', marginBottom: 32 }}>
        Visão geral dos exames e colaboradores
      </p>

      {/* CARDS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
        {cards.map((card, i) => (
          <div key={i} style={{
            backgroundColor: 'white',
            borderRadius: 12,
            padding: '20px 24px',
            border: '1px solid #f0f0f0',
          }}>
            <p style={{ fontSize: 12, color: '#888', marginBottom: 12 }}>{card.label}</p>
            <p style={{ fontSize: 32, fontWeight: 600, color: card.cor, margin: 0 }}>
              {card.valor.toLocaleString('pt-BR')}
            </p>
          </div>
        ))}
      </div>

      {/* GRÁFICOS PLACEHOLDER */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={{
          backgroundColor: 'white', borderRadius: 12,
          padding: '24px', border: '1px solid #f0f0f0', minHeight: 200,
        }}>
          <p style={{ fontSize: 14, fontWeight: 500, color: '#333', marginBottom: 4 }}>Exames por Base</p>
          <p style={{ fontSize: 12, color: '#aaa' }}>Em breve</p>
        </div>
        <div style={{
          backgroundColor: 'white', borderRadius: 12,
          padding: '24px', border: '1px solid #f0f0f0', minHeight: 200,
        }}>
          <p style={{ fontSize: 14, fontWeight: 500, color: '#333', marginBottom: 4 }}>Exames por Função</p>
          <p style={{ fontSize: 12, color: '#aaa' }}>Em breve</p>
        </div>
      </div>
    </div>
  )
}