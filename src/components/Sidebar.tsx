'use client'

import React, { useState, useEffect, useRef } from 'react'

import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'

import { 
  LayoutDashboard, LayoutGrid, HeartPulse, Users, 
  ClipboardCheck, Settings, ChevronLeft, ChevronRight, 
  ChevronDown, MoreHorizontal, User, Key, LogOut, X, 
  CheckCircle2, Circle
} from 'lucide-react'

// ─── CORES E ESTILOS GERAIS ──────────────────────────────────────────────────
const COR_PRIMARIA = '#9f183c'
const COR_PRIMARIA_LIGHT = '#fff1f2'
const COR_TEXTO_PRINCIPAL = '#1e293b'
const COR_TEXTO_SECUNDARIO = '#64748b'
const COR_BORDA = '#e2e8f0'

const MAPA_ICONES: Record<string, React.ElementType> = {
  '/dashboard': LayoutDashboard,
  '/colaboradores': Users,
  '/auditoria': ClipboardCheck,
  '/matriz-competencias': LayoutGrid,
  '/med-trab': HeartPulse,
  '/configuracoes': Settings,
}

const LABELS_MODULOS: Record<string, string> = {
  matriz: 'Matriz de Competências',
  medicina: 'Medicina do Trabalho',
}

interface UsuarioInfo {
  id: string
  email: string
  nome: string | null
  nivel: 'admin' | 'operador' | 'visualizador'
  modulos_acesso: string[]
}

function RegraItem({ ok, texto }: { ok: boolean; texto: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: ok ? '#16a34a' : '#94a3b8', transition: 'color 0.2s' }}>
      {ok ? <CheckCircle2 size={16} /> : <Circle size={16} />}
      <span style={{ fontWeight: ok ? 500 : 400 }}>{texto}</span>
    </div>
  )
}

function ModalPerfil({ usuario, onFechar }: { usuario: UsuarioInfo; onFechar: () => void }) {
  const iniciais = (usuario.nome || usuario.email || 'U')
    .split(' ').slice(0, 2).map((p: string) => p[0]).join('').toUpperCase()

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, animation: 'fadeIn 0.2s' }}>
      <div style={{ backgroundColor: 'white', borderRadius: 20, padding: 32, width: '100%', maxWidth: 440, boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: COR_TEXTO_PRINCIPAL, margin: 0 }}>Meu Perfil</h2>
          <button onClick={onFechar} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COR_TEXTO_SECUNDARIO, padding: 4, display: 'flex', borderRadius: 8, transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f1f5f9'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
            <X size={20} />
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24, padding: '20px', backgroundColor: '#f8fafc', borderRadius: 16, border: `1px solid ${COR_BORDA}` }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', backgroundColor: COR_PRIMARIA_LIGHT, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, color: COR_PRIMARIA, flexShrink: 0 }}>
            {iniciais}
          </div>
          <div>
            <p style={{ fontSize: 16, fontWeight: 700, color: COR_TEXTO_PRINCIPAL, margin: 0 }}>{usuario.nome || '—'}</p>
            <p style={{ fontSize: 13, color: COR_TEXTO_SECUNDARIO, margin: '4px 0 0', textTransform: 'capitalize', fontWeight: 500 }}>{usuario.nivel}</p>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 28 }}>
          <div style={{ backgroundColor: '#f8fafc', borderRadius: 12, padding: '12px 16px', border: `1px solid ${COR_BORDA}` }}>
            <p style={{ fontSize: 12, color: COR_TEXTO_SECUNDARIO, margin: '0 0 4px', fontWeight: 500 }}>E-mail</p>
            <p style={{ fontSize: 14, color: COR_TEXTO_PRINCIPAL, margin: 0, fontWeight: 500 }}>{usuario.email}</p>
          </div>
          <div style={{ backgroundColor: '#f8fafc', borderRadius: 12, padding: '12px 16px', border: `1px solid ${COR_BORDA}` }}>
            <p style={{ fontSize: 12, color: COR_TEXTO_SECUNDARIO, margin: '0 0 10px', fontWeight: 500 }}>Módulos com acesso</p>
            {usuario.nivel === 'admin' ? (
              <span style={{ display: 'inline-block', fontSize: 13, padding: '4px 12px', borderRadius: 99, backgroundColor: COR_PRIMARIA_LIGHT, color: COR_PRIMARIA, fontWeight: 600 }}>
                Todos os módulos
              </span>
            ) : (usuario.modulos_acesso || []).length === 0 ? (
              <span style={{ fontSize: 13, color: COR_TEXTO_SECUNDARIO }}>Nenhum módulo adicional</span>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {(usuario.modulos_acesso || []).map((m: string) => (
                  <span key={m} style={{ fontSize: 13, padding: '4px 12px', borderRadius: 99, backgroundColor: COR_PRIMARIA_LIGHT, color: COR_PRIMARIA, fontWeight: 600 }}>
                    {LABELS_MODULOS[m] || m}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <button onClick={onFechar} style={{ width: '100%', height: 44, backgroundColor: COR_PRIMARIA, color: 'white', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', transition: 'opacity 0.2s' }} onMouseEnter={e => e.currentTarget.style.opacity = '0.9'} onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
          Fechar
        </button>
      </div>
    </div>
  )
}

function ModalAlterarSenha({ usuario, onFechar }: { usuario: UsuarioInfo; onFechar: () => void }) {
  const [senhaAtual, setSenhaAtual] = useState('')
  const [novaSenha, setNovaSenha] = useState('')
  const [confirmarSenha, setConfirmarSenha] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [sucesso, setSucesso] = useState(false)

  const regras = {
    minLength: novaSenha.length >= 8,
    maiuscula: /[A-Z]/.test(novaSenha),
    numero: /[0-9]/.test(novaSenha),
    confirma: novaSenha !== '' && novaSenha === confirmarSenha,
  }

  async function alterar() {
    setErro('')
    if (!senhaAtual || !novaSenha || !confirmarSenha) { setErro('Preencha todos os campos.'); return }
    if (!Object.values(regras).every(Boolean)) { setErro('Corrija os requisitos da senha antes de continuar.'); return }
    setSalvando(true)
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: usuario.email, password: senhaAtual })
    if (signInError) { setErro('Senha atual incorreta.'); setSalvando(false); return }
    const { error } = await supabase.auth.updateUser({ password: novaSenha })
    if (error) { setErro(error.message); setSalvando(false); return }
    setSucesso(true)
    setSalvando(false)
    setTimeout(() => onFechar(), 2000)
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', height: 42, border: `1px solid ${COR_BORDA}`, borderRadius: 10,
    padding: '0 14px', fontSize: 14, boxSizing: 'border-box', outline: 'none', backgroundColor: 'white',
    color: COR_TEXTO_PRINCIPAL, transition: 'border-color 0.2s'
  }

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, animation: 'fadeIn 0.2s' }}>
      <div style={{ backgroundColor: 'white', borderRadius: 20, padding: 32, width: '100%', maxWidth: 440, boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: COR_TEXTO_PRINCIPAL, margin: 0 }}>Alterar Senha</h2>
          <button onClick={onFechar} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COR_TEXTO_SECUNDARIO, padding: 4, display: 'flex', borderRadius: 8, transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f1f5f9'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
            <X size={20} />
          </button>
        </div>

        {sucesso ? (
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <CheckCircle2 size={56} color="#16a34a" style={{ margin: '0 auto 16px' }} />
            <p style={{ fontSize: 18, fontWeight: 700, color: '#16a34a', margin: 0 }}>Senha alterada com sucesso!</p>
            <p style={{ fontSize: 14, color: COR_TEXTO_SECUNDARIO, margin: '8px 0 0' }}>Fechando em instantes...</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ fontSize: 13, fontWeight: 500, color: COR_TEXTO_PRINCIPAL, display: 'block', marginBottom: 6 }}>Senha atual *</label>
              <input type="password" value={senhaAtual} onChange={e => setSenhaAtual(e.target.value)} style={inputStyle} placeholder="••••••••" autoComplete="current-password" />
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 500, color: COR_TEXTO_PRINCIPAL, display: 'block', marginBottom: 6 }}>Nova senha *</label>
              <input type="password" value={novaSenha} onChange={e => setNovaSenha(e.target.value)} style={inputStyle} placeholder="••••••••" autoComplete="new-password" />
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 500, color: COR_TEXTO_PRINCIPAL, display: 'block', marginBottom: 6 }}>Confirmar nova senha *</label>
              <input type="password" value={confirmarSenha} onChange={e => setConfirmarSenha(e.target.value)} style={inputStyle} placeholder="••••••••" autoComplete="new-password" />
            </div>

            {novaSenha && (
              <div style={{ backgroundColor: '#f8fafc', borderRadius: 12, padding: '16px', display: 'flex', flexDirection: 'column', gap: 10, border: `1px solid ${COR_BORDA}` }}>
                <RegraItem ok={regras.minLength} texto="Mínimo 8 caracteres" />
                <RegraItem ok={regras.maiuscula} texto="Pelo menos 1 letra maiúscula" />
                <RegraItem ok={regras.numero} texto="Pelo menos 1 número" />
                <RegraItem ok={regras.confirma} texto="Confirmação de senha coincide" />
              </div>
            )}

            {erro && (
              <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Circle size={16} color="#dc2626" />
                <p style={{ fontSize: 13, color: '#dc2626', margin: 0, fontWeight: 500 }}>{erro}</p>
              </div>
            )}

            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 8 }}>
              <button onClick={onFechar} style={{ height: 42, padding: '0 20px', border: `1px solid ${COR_BORDA}`, borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', background: 'white', color: COR_TEXTO_PRINCIPAL }}>Cancelar</button>
              <button onClick={alterar} disabled={salvando} style={{ height: 42, padding: '0 24px', backgroundColor: COR_PRIMARIA, color: 'white', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: salvando ? 'not-allowed' : 'pointer', opacity: salvando ? 0.7 : 1 }}>
                {salvando ? 'Alterando...' : 'Alterar senha'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

interface ItemFilho { label: string; href: string }
interface ItemMenu {
  label: string
  href: string
  niveis: string[]
  modulo: string | null
  filhos?: ItemFilho[]
}

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { usuario } = useAuth()
  const [recolhida, setRecolhida] = useState(false)
  const [tooltip, setTooltip] = useState('')
  const [menuAberto, setMenuAberto] = useState(false)
  const [modal, setModal] = useState<'perfil' | 'senha' | null>(null)
  const [menuPos, setMenuPos] = useState({ bottom: 0, left: 0, width: 0 })
  const [expandido, setExpandido] = useState<string | null>(null)
  const footerRef = useRef<HTMLDivElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)

  const LARGURA_RECOLHIDA = 80
  const LARGURA_EXPANDIDA = 280

  useEffect(() => {
    const salvo = localStorage.getItem('sidebar_recolhida')
    if (salvo === 'true') {
      setRecolhida(true)
      document.documentElement.style.setProperty('--sidebar-width', `${LARGURA_RECOLHIDA}px`)
    } else {
      document.documentElement.style.setProperty('--sidebar-width', `${LARGURA_EXPANDIDA}px`)
    }
  }, [])

  useEffect(() => {
    if (pathname.startsWith('/matriz-competencias/')) {
      setExpandido('/matriz-competencias')
    }
  }, [pathname])

  useEffect(() => {
    function handleClickFora(e: MouseEvent) {
      const t = e.target as Node
      const dentroFooter = footerRef.current?.contains(t)
      const dentroPopup = popupRef.current?.contains(t)
      if (!dentroFooter && !dentroPopup) setMenuAberto(false)
    }
    document.addEventListener('mousedown', handleClickFora)
    return () => document.removeEventListener('mousedown', handleClickFora)
  }, [])

  function toggleSidebar() {
    const novo = !recolhida
    setRecolhida(novo)
    localStorage.setItem('sidebar_recolhida', String(novo))
    document.documentElement.style.setProperty('--sidebar-width', novo ? `${LARGURA_RECOLHIDA}px` : `${LARGURA_EXPANDIDA}px`)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  function abrirMenu() {
    if (footerRef.current) {
      const rect = footerRef.current.getBoundingClientRect()
      setMenuPos({
        bottom: window.innerHeight - rect.top + 8,
        left: rect.left,
        width: Math.max(220, rect.width),
      })
    }
    setMenuAberto(m => !m)
  }

  const todosItens: ItemMenu[] = [
    { label: 'Dashboard',              href: '/dashboard',            niveis: ['admin', 'operador', 'visualizador'], modulo: null },
    {
      label: 'Matriz de Competências', href: '/matriz-competencias',  niveis: [] as string[],                        modulo: 'matriz',
      filhos: [
        { label: 'BASE NR', href: '/matriz-competencias/base-nr' },
        { label: 'BASE PO', href: '/matriz-competencias/base-po' },
      ],
    },
    { label: 'Medicina do Trabalho',   href: '/med-trab',             niveis: [] as string[],                        modulo: 'medicina' },
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

  const largura = recolhida ? LARGURA_RECOLHIDA : LARGURA_EXPANDIDA

  const iniciais = (usuario?.nome || usuario?.email || 'U')
    .split(' ').slice(0, 2).map((p: string) => p[0]).join('').toUpperCase()

  const menuItemStyle: React.CSSProperties = {
    width: '100%', display: 'flex', alignItems: 'center', gap: 12,
    padding: '12px 16px', fontSize: 14, fontWeight: 500, textAlign: 'left',
    border: 'none', background: 'none', cursor: 'pointer', color: COR_TEXTO_PRINCIPAL,
    transition: 'background 0.2s'
  }

  return (
    <aside style={{
      width: largura, height: '100vh', backgroundColor: '#ffffff',
      borderRight: `1px solid ${COR_BORDA}`, display: 'flex', flexDirection: 'column',
      fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', 
      position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 40,
      transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)', overflow: 'hidden',
    }}>
      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      `}</style>

      {}
      <div style={{
        height: 80, display: 'flex', alignItems: 'center',
        padding: recolhida ? '0 20px' : '0 24px',
        justifyContent: recolhida ? 'center' : 'space-between',
        borderBottom: `1px solid transparent`,
        transition: 'padding 0.3s',
        flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, overflow: 'hidden', whiteSpace: 'nowrap' }}>
          {recolhida ? (
             <div style={{ width: 32, height: 32, backgroundColor: COR_PRIMARIA, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold', fontSize: 16, flexShrink: 0 }}>C</div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, animation: 'fadeIn 0.3s ease-in-out' }}>
               <div style={{ width: 32, height: 32, backgroundColor: COR_PRIMARIA, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold', fontSize: 16 }}>C</div>
               <span style={{ fontSize: 18, fontWeight: 800, color: '#333', letterSpacing: '-0.02em' }}>CGB</span>
               <span style={{ fontSize: 15, fontWeight: 600, color: COR_TEXTO_SECUNDARIO }}>SegVenc</span>
            </div>
          )}
        </div>

        {!recolhida && (
          <button 
            onClick={toggleSidebar}
            style={{
              width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
              backgroundColor: 'white', border: `1px solid ${COR_BORDA}`, borderRadius: 6,
              cursor: 'pointer', color: COR_TEXTO_SECUNDARIO, transition: 'all 0.2s',
              flexShrink: 0
            }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f8fafc'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'white'}
          >
            <ChevronLeft size={16} />
          </button>
        )}
      </div>

      {}
      <nav style={{ flex: 1, padding: '24px 16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {recolhida && (
           <button 
             onClick={toggleSidebar}
             style={{
               width: 40, height: 40, margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center',
               backgroundColor: 'white', border: `1px solid ${COR_BORDA}`, borderRadius: 8,
               cursor: 'pointer', color: COR_TEXTO_SECUNDARIO, transition: 'all 0.2s'
             }}
             onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f8fafc'}
             onMouseLeave={e => e.currentTarget.style.backgroundColor = 'white'}
           >
             <ChevronRight size={18} />
           </button>
        )}

        {itensFiltrados.map((item) => {
          const IconeLucide = MAPA_ICONES[item.href] || LayoutDashboard

          if (item.filhos) {
            const estaExpandido = expandido === item.href
            const filhoAtivo = item.filhos.some(f => pathname === f.href || pathname.startsWith(f.href + '/'))

            return (
              <div key={item.href} style={{ position: 'relative' }}
                onMouseEnter={() => recolhida && setTooltip(item.label)}
                onMouseLeave={() => setTooltip('')}
              >
                <div
                  onClick={() => {
                    if (recolhida) {
                      router.push(item.filhos![0].href)
                    } else {
                      setExpandido(estaExpandido ? null : item.href)
                    }
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 14,
                    padding: recolhida ? '12px' : '12px 16px',
                    justifyContent: recolhida ? 'center' : 'flex-start',
                    backgroundColor: filhoAtivo ? COR_PRIMARIA_LIGHT : 'transparent',
                    color: filhoAtivo ? COR_PRIMARIA : COR_TEXTO_SECUNDARIO,
                    borderRadius: 8, cursor: 'pointer', userSelect: 'none',
                    transition: 'all 0.2s ease', position: 'relative',
                    fontWeight: filhoAtivo ? 600 : 500, fontSize: 14, whiteSpace: 'nowrap'
                  }}
                  onMouseEnter={e => { if (!filhoAtivo) e.currentTarget.style.backgroundColor = '#f1f5f9' }}
                  onMouseLeave={e => { if (!filhoAtivo) e.currentTarget.style.backgroundColor = 'transparent' }}
                >
                  {filhoAtivo && (
                    <div style={{ position: 'absolute', left: 0, top: '15%', bottom: '15%', width: 4, backgroundColor: COR_PRIMARIA, borderRadius: '0 4px 4px 0' }} />
                  )}
                  <IconeLucide size={20} style={{ flexShrink: 0, color: filhoAtivo ? COR_PRIMARIA : '#94a3b8', transition: 'color 0.2s' }} />
                  {!recolhida && (
                    <>
                      <span style={{ flex: 1, animation: 'fadeIn 0.2s ease-in-out' }}>{item.label}</span>
                      <ChevronDown size={16} style={{ color: '#94a3b8', transform: estaExpandido ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
                    </>
                  )}
                </div>

                {estaExpandido && !recolhida && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4, paddingLeft: 46 }}>
                    {item.filhos.map(filho => {
                      const filhoAtivoItem = pathname === filho.href || pathname.startsWith(filho.href + '/')
                      return (
                        <a key={filho.href} href={filho.href} style={{
                          display: 'flex', alignItems: 'center',
                          padding: '8px 12px', fontSize: 13,
                          color: filhoAtivoItem ? COR_PRIMARIA : COR_TEXTO_SECUNDARIO,
                          backgroundColor: filhoAtivoItem ? COR_PRIMARIA_LIGHT : 'transparent',
                          borderRadius: 6, textDecoration: 'none',
                          fontWeight: filhoAtivoItem ? 600 : 500,
                          transition: 'all 0.2s ease'
                        }}
                        onMouseEnter={e => { if (!filhoAtivoItem) e.currentTarget.style.color = COR_TEXTO_PRINCIPAL }}
                        onMouseLeave={e => { if (!filhoAtivoItem) e.currentTarget.style.color = COR_TEXTO_SECUNDARIO }}
                        >
                          {filho.label}
                        </a>
                      )
                    })}
                  </div>
                )}

                {recolhida && tooltip === item.label && (
                  <div style={{ position: 'fixed', left: 88, zIndex: 999, backgroundColor: '#1e293b', color: 'white', fontSize: 13, fontWeight: 500, padding: '8px 12px', borderRadius: 8, whiteSpace: 'nowrap', pointerEvents: 'none', transform: 'translateY(-50%)', marginTop: -14, boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
                    {item.label}
                  </div>
                )}
              </div>
            )
          }

          const ativo = pathname === item.href

          return (
            <div key={item.href} style={{ position: 'relative' }}
              onMouseEnter={() => recolhida && setTooltip(item.label)}
              onMouseLeave={() => setTooltip('')}
            >
              <a href={item.href} style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: recolhida ? '12px' : '12px 16px',
                justifyContent: recolhida ? 'center' : 'flex-start',
                backgroundColor: ativo ? COR_PRIMARIA_LIGHT : 'transparent',
                color: ativo ? COR_PRIMARIA : COR_TEXTO_SECUNDARIO,
                borderRadius: 8, textDecoration: 'none',
                transition: 'all 0.2s ease', position: 'relative',
                fontWeight: ativo ? 600 : 500, fontSize: 14, whiteSpace: 'nowrap'
              }}
              onMouseEnter={e => { if (!ativo) e.currentTarget.style.backgroundColor = '#f1f5f9' }}
              onMouseLeave={e => { if (!ativo) e.currentTarget.style.backgroundColor = 'transparent' }}
              >
                {ativo && (
                  <div style={{ position: 'absolute', left: 0, top: '15%', bottom: '15%', width: 4, backgroundColor: COR_PRIMARIA, borderRadius: '0 4px 4px 0' }} />
                )}
                <IconeLucide size={20} style={{ flexShrink: 0, color: ativo ? COR_PRIMARIA : '#94a3b8', transition: 'color 0.2s' }} />
                {!recolhida && (
                  <span style={{ animation: 'fadeIn 0.2s ease-in-out' }}>{item.label}</span>
                )}
              </a>

              {recolhida && tooltip === item.label && (
                <div style={{ position: 'fixed', left: 88, zIndex: 999, backgroundColor: '#1e293b', color: 'white', fontSize: 13, fontWeight: 500, padding: '8px 12px', borderRadius: 8, whiteSpace: 'nowrap', pointerEvents: 'none', transform: 'translateY(-50%)', marginTop: -14, boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
                  {item.label}
                </div>
              )}
            </div>
          )
        })}
      </nav>

      {}
      <div ref={footerRef} style={{
        padding: '20px 16px', borderTop: `1px solid ${COR_BORDA}`,
        display: 'flex', alignItems: 'center', gap: 12,
        justifyContent: recolhida ? 'center' : 'space-between',
        transition: 'all 0.3s', backgroundColor: '#ffffff'
      }}>
        {usuario && (
          <div onClick={abrirMenu} style={{ 
            display: 'flex', alignItems: 'center', gap: 12, overflow: 'hidden',
            cursor: 'pointer', padding: recolhida ? 4 : '6px 8px', borderRadius: 10,
            transition: 'background 0.2s', width: '100%',
            justifyContent: recolhida ? 'center' : 'space-between'
          }}
          onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f8fafc'}
          onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 40, height: 40, borderRadius: '50%', backgroundColor: '#1e293b',
                color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14, fontWeight: 600, flexShrink: 0, position: 'relative'
              }}>
                {iniciais}
                <div style={{ position: 'absolute', top: -2, right: -2, width: 12, height: 12, backgroundColor: '#ef4444', border: '2px solid white', borderRadius: '50%' }}/>
              </div>
              
              {!recolhida && (
                <div style={{ display: 'flex', flexDirection: 'column', whiteSpace: 'nowrap', animation: 'fadeIn 0.2s' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: COR_TEXTO_PRINCIPAL, overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 130 }}>
                    {usuario.nome || usuario.email.split('@')[0]}
                  </span>
                  <span style={{ fontSize: 12, color: COR_TEXTO_SECUNDARIO, textTransform: 'capitalize', fontWeight: 500 }}>{usuario.nivel}</span>
                </div>
              )}
            </div>

            {!recolhida && (
              <MoreHorizontal size={18} color="#94a3b8" style={{ flexShrink: 0 }} />
            )}
          </div>
        )}
      </div>

      {}
      {menuAberto && usuario && (
        <div ref={popupRef} style={{
          position: 'fixed', bottom: menuPos.bottom, left: menuPos.left, width: menuPos.width,
          backgroundColor: 'white', border: `1px solid ${COR_BORDA}`, borderRadius: 12,
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
          overflow: 'hidden', zIndex: 999, padding: '8px'
        }}>
          <button onClick={() => { setModal('perfil'); setMenuAberto(false) }} style={{...menuItemStyle, borderRadius: 8}} onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f1f5f9'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
            <User size={18} color={COR_TEXTO_SECUNDARIO} />
            <span>Meu Perfil</span>
          </button>
          <button onClick={() => { setModal('senha'); setMenuAberto(false) }} style={{...menuItemStyle, borderRadius: 8}} onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f1f5f9'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
            <Key size={18} color={COR_TEXTO_SECUNDARIO} />
            <span>Alterar Senha</span>
          </button>
          <div style={{ height: 1, backgroundColor: COR_BORDA, margin: '6px 0' }} />
          <button onClick={handleLogout} style={{ ...menuItemStyle, color: '#dc2626', borderRadius: 8 }} onMouseEnter={e => e.currentTarget.style.backgroundColor = '#fef2f2'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
            <LogOut size={18} color="#dc2626" />
            <span>Sair do sistema</span>
          </button>
        </div>
      )}

      {modal === 'perfil' && usuario && <ModalPerfil usuario={usuario} onFechar={() => setModal(null)} />}
      {modal === 'senha' && usuario && <ModalAlterarSenha usuario={usuario} onFechar={() => setModal(null)} />}
    </aside>
  )
}