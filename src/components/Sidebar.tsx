'use client'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'

const COR = '#9f183c'

const ICONES: Record<string, string> = {
  '/dashboard':            'M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z M9 22V12h6v10',
  '/funcionarios':         'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8',
  '/colaboradores':        'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2 M9 11a4 4 0 100-8 4 4 0 000 8 M23 21v-2a4 4 0 00-3-3.87 M16 3.13a4 4 0 010 7.75',
  '/auditoria':            'M9 11l3 3L22 4 M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11',
  '/matriz-competencias':  'M3 3h18v18H3z M3 9h18 M3 15h18 M9 3v18 M15 3v18',
  '/configuracoes':        'M12 15a3 3 0 100-6 3 3 0 000 6z M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z',
}

function SvgIcon({ path, size = 18, cor = 'currentColor' }: { path: string; size?: number; cor?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={cor} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0 }}>
      {path.split(' M').map((p, i) => (
        <path key={i} d={i === 0 ? p : 'M' + p} />
      ))}
    </svg>
  )
}

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { usuario } = useAuth()
  const [recolhida, setRecolhida] = useState(false)
  const [tooltip, setTooltip] = useState('')

useEffect(() => {
  const salvo = localStorage.getItem('sidebar_recolhida')
  if (salvo === 'true') {
    setRecolhida(true)
    document.documentElement.style.setProperty('--sidebar-width', '64px')
  }
}, [])

 function toggleSidebar() {
  const novo = !recolhida
  setRecolhida(novo)
  localStorage.setItem('sidebar_recolhida', String(novo))
  document.documentElement.style.setProperty('--sidebar-width', novo ? '64px' : '220px')
}

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const todosItens = [
    { label: 'Dashboard',              href: '/dashboard',            niveis: ['admin', 'operador', 'visualizador'], modulo: null },
    { label: 'Painel Operacional',     href: '/funcionarios',         niveis: ['admin', 'operador', 'visualizador'], modulo: null },
    { label: 'Matriz de Competências', href: '/matriz-competencias',  niveis: [] as string[],                        modulo: 'matriz' },
    { label: 'Colaboradores',          href: '/colaboradores',        niveis: ['admin', 'operador'],                 modulo: null },
    { label: 'Auditoria',              href: '/auditoria',            niveis: ['admin', 'operador'],                 modulo: null },
    { label: 'Configurações',          href: '/configuracoes',        niveis: ['admin'],                             modulo: null },
  ]

  const itensFiltrados = usuario
    ? todosItens.filter(item => {
        if (item.modulo) return usuario.nivel === 'admin' || (usuario.modulos_acesso || []).includes(item.modulo)
        return item.niveis.includes(usuario.nivel)
      })
    : todosItens

  const largura = recolhida ? 64 : 220

  // Iniciais do usuário
  const iniciais = (usuario?.nome || usuario?.email || 'U')
    .split(' ').slice(0, 2).map((p: string) => p[0]).join('').toUpperCase()

  return (
    <div style={{
        width: largura, minHeight: '100vh', backgroundColor: 'white',
        borderRight: '1px solid #f0f0f0', display: 'flex', flexDirection: 'column',
        fontFamily: 'Arial', position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 10,
        transition: 'width 0.2s ease', overflow: 'hidden',
      }}>

       {/* LOGO + TOGGLE */}
<div style={{
  padding: '18px 0',
  borderBottom: '1px solid #f0f0f0',
  display: 'flex',
  flexDirection: recolhida ? 'column' : 'row',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
}}>
  {!recolhida && (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, paddingLeft: 20, overflow: 'hidden' }}>
      <img src="/logo-cgb.png" alt="CGB" style={{ height: 26, flexShrink: 0 }} />
      <span style={{ fontSize: 13, fontWeight: 600, color: '#4a4a49', whiteSpace: 'nowrap' }}>SegVenc</span>
    </div>
  )}

  {recolhida && (
  <img src="/icon-cgb.png" alt="CGB" style={{ height: 28 }} />
)}
  <button
    onClick={toggleSidebar}
    title={recolhida ? 'Expandir menu' : 'Recolher menu'}
    style={{
      background: 'none', border: '1px solid #e0e0e0', borderRadius: 6,
      width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
      cursor: 'pointer', color: '#888', fontSize: 12, flexShrink: 0,
      marginRight: recolhida ? 0 : 16,
    }}
  >
    {recolhida ? '›' : '‹'}
  </button>
</div>

        {/* MENU */}
        <nav style={{ flex: 1, padding: '10px 0', overflowY: 'auto' }}>
          {itensFiltrados.map((item) => {
            const ativo = pathname === item.href
            const iconePath = ICONES[item.href] || ''

            return (
              <div key={item.href} style={{ position: 'relative' }}
                onMouseEnter={() => recolhida && setTooltip(item.label)}
                onMouseLeave={() => setTooltip('')}
              >
                <a href={item.href} style={{
                  display: 'flex', alignItems: 'center',
                  gap: recolhida ? 0 : 12,
                  justifyContent: recolhida ? 'center' : 'flex-start',
                  padding: recolhida ? '12px 0' : '10px 20px',
                  fontSize: 13,
                  color: ativo ? COR : '#666',
                  backgroundColor: ativo ? '#fdf2f5' : 'transparent',
                  borderLeft: ativo ? `3px solid ${COR}` : '3px solid transparent',
                  textDecoration: 'none',
                  transition: 'background 0.15s',
                }}>
                  <SvgIcon path={iconePath} cor={ativo ? COR : '#888'} />
                  {!recolhida && (
                    <span style={{ whiteSpace: 'nowrap', fontWeight: ativo ? 500 : 400 }}>
                      {item.label}
                    </span>
                  )}
                </a>

                {/* Tooltip */}
                {recolhida && tooltip === item.label && (
                  <div style={{
                    position: 'fixed', left: 72, zIndex: 999,
                    backgroundColor: '#1a1a1a', color: 'white',
                    fontSize: 12, padding: '6px 10px', borderRadius: 6,
                    whiteSpace: 'nowrap', pointerEvents: 'none',
                    transform: 'translateY(-50%)',
                    marginTop: -14,
                  }}>
                    {item.label}
                  </div>
                )}
              </div>
            )
          })}
        </nav>

        {/* USUÁRIO + SAIR */}
        <div style={{
          borderTop: '1px solid #f0f0f0',
          padding: recolhida ? '14px 0' : '14px 20px',
        }}>
          {!recolhida && usuario && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              {/* Avatar */}
              <div style={{
                width: 32, height: 32, borderRadius: '50%',
                backgroundColor: '#fdf2f5', display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 600, color: COR, flexShrink: 0,
              }}>
                {iniciais}
              </div>
              <div style={{ overflow: 'hidden' }}>
                <p style={{
                  fontSize: 12, fontWeight: 500, color: '#333', margin: 0,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  maxWidth: 130,
                }}>
                  {usuario.nome || usuario.email}
                </p>
                <p style={{ fontSize: 11, color: '#aaa', margin: '1px 0 0', textTransform: 'capitalize' }}>
                  {usuario.nivel}
                </p>
              </div>
            </div>
          )}

          {/* Avatar recolhido */}
          {recolhida && usuario && (
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%',
                backgroundColor: '#fdf2f5', display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 600, color: COR,
              }}>
                {iniciais}
              </div>
            </div>
          )}

          {/* Botão Sair */}
          <button
            onClick={handleLogout}
            title="Sair"
            style={{
              width: '100%', display: 'flex', alignItems: 'center',
              gap: recolhida ? 0 : 8,
              justifyContent: recolhida ? 'center' : 'flex-start',
              padding: recolhida ? '8px 0' : '8px 4px',
              fontSize: 13, color: '#999', background: 'none',
              border: 'none', cursor: 'pointer', borderRadius: 6,
            }}
            onMouseEnter={e => (e.currentTarget.style.color = '#dc2626')}
            onMouseLeave={e => (e.currentTarget.style.color = '#999')}
          >
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
            {!recolhida && <span>Sair</span>}
          </button>
        </div>
      </div>
  )
}