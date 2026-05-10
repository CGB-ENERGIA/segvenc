'use client'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'

const COR = '#9f183c'

const ICONES: Record<string, string> = {
  '/dashboard':            'M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z M9 22V12h6v10',
  '/colaboradores':        'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2 M9 11a4 4 0 100-8 4 4 0 000 8 M23 21v-2a4 4 0 00-3-3.87 M16 3.13a4 4 0 010 7.75',
  '/auditoria':            'M9 11l3 3L22 4 M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11',
  '/matriz-competencias':  'M3 3h18v18H3z M3 9h18 M3 15h18 M9 3v18 M15 3v18',
  '/med-trab':             'M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z M9 12h6 M12 9v6',
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
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: ok ? '#16a34a' : '#aaa', transition: 'color 0.15s' }}>
      <span style={{ fontWeight: 700, width: 14, textAlign: 'center', flexShrink: 0 }}>{ok ? '✓' : '○'}</span>
      <span>{texto}</span>
    </div>
  )
}

function ModalPerfil({ usuario, onFechar }: { usuario: UsuarioInfo; onFechar: () => void }) {
  const iniciais = (usuario.nome || usuario.email || 'U')
    .split(' ').slice(0, 2).map((p: string) => p[0]).join('').toUpperCase()

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ backgroundColor: 'white', borderRadius: 16, padding: 28, width: '100%', maxWidth: 440, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: '#1a1a1a', margin: 0 }}>Meu Perfil</h2>
          <button onClick={onFechar} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#aaa', padding: 0 }}>✕</button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20, padding: '14px 16px', backgroundColor: '#f9f9f9', borderRadius: 10 }}>
          <div style={{ width: 48, height: 48, borderRadius: '50%', backgroundColor: '#fdf2f5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 600, color: COR, flexShrink: 0 }}>
            {iniciais}
          </div>
          <div>
            <p style={{ fontSize: 14, fontWeight: 600, color: '#1a1a1a', margin: 0 }}>{usuario.nome || '—'}</p>
            <p style={{ fontSize: 12, color: '#888', margin: '2px 0 0', textTransform: 'capitalize' }}>{usuario.nivel}</p>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
          <div style={{ backgroundColor: '#f9f9f9', borderRadius: 8, padding: '10px 14px' }}>
            <p style={{ fontSize: 11, color: '#888', margin: '0 0 3px' }}>E-mail</p>
            <p style={{ fontSize: 13, color: '#333', margin: 0, fontWeight: 500 }}>{usuario.email}</p>
          </div>
          <div style={{ backgroundColor: '#f9f9f9', borderRadius: 8, padding: '10px 14px' }}>
            <p style={{ fontSize: 11, color: '#888', margin: '0 0 3px' }}>Nível de acesso</p>
            <p style={{ fontSize: 13, color: '#333', margin: 0, fontWeight: 500, textTransform: 'capitalize' }}>{usuario.nivel}</p>
          </div>
          <div style={{ backgroundColor: '#f9f9f9', borderRadius: 8, padding: '10px 14px' }}>
            <p style={{ fontSize: 11, color: '#888', margin: '0 0 8px' }}>Módulos com acesso</p>
            {usuario.nivel === 'admin' ? (
              <span style={{ display: 'inline-block', fontSize: 12, padding: '3px 10px', borderRadius: 99, backgroundColor: '#fdf2f5', color: COR, fontWeight: 500 }}>
                Todos os módulos
              </span>
            ) : (usuario.modulos_acesso || []).length === 0 ? (
              <span style={{ fontSize: 13, color: '#aaa' }}>Nenhum módulo adicional</span>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {(usuario.modulos_acesso || []).map((m: string) => (
                  <span key={m} style={{ fontSize: 12, padding: '3px 10px', borderRadius: 99, backgroundColor: '#fdf2f5', color: COR, fontWeight: 500 }}>
                    {LABELS_MODULOS[m] || m}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <button onClick={onFechar} style={{ width: '100%', height: 38, backgroundColor: COR, color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
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
    width: '100%', height: 38, border: '1px solid #e0e0e0', borderRadius: 8,
    padding: '0 12px', fontSize: 13, boxSizing: 'border-box', outline: 'none', backgroundColor: 'white',
  }

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ backgroundColor: 'white', borderRadius: 16, padding: 28, width: '100%', maxWidth: 440, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: '#1a1a1a', margin: 0 }}>Alterar Senha</h2>
          <button onClick={onFechar} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#aaa', padding: 0 }}>✕</button>
        </div>

        {sucesso ? (
          <div style={{ textAlign: 'center', padding: '28px 0' }}>
            <div style={{ fontSize: 40, color: '#16a34a', marginBottom: 12 }}>✓</div>
            <p style={{ fontSize: 15, fontWeight: 500, color: '#16a34a', margin: 0 }}>Senha alterada com sucesso!</p>
            <p style={{ fontSize: 12, color: '#aaa', margin: '6px 0 0' }}>Fechando em instantes...</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>Senha atual *</label>
              <input type="password" value={senhaAtual} onChange={e => setSenhaAtual(e.target.value)} style={inputStyle} placeholder="••••••••" autoComplete="current-password" />
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>Nova senha *</label>
              <input type="password" value={novaSenha} onChange={e => setNovaSenha(e.target.value)} style={inputStyle} placeholder="••••••••" autoComplete="new-password" />
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>Confirmar nova senha *</label>
              <input type="password" value={confirmarSenha} onChange={e => setConfirmarSenha(e.target.value)} style={inputStyle} placeholder="••••••••" autoComplete="new-password" />
            </div>

            {novaSenha && (
              <div style={{ backgroundColor: '#f9f9f9', borderRadius: 8, padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <RegraItem ok={regras.minLength} texto="Mínimo 8 caracteres" />
                <RegraItem ok={regras.maiuscula} texto="Pelo menos 1 letra maiúscula" />
                <RegraItem ok={regras.numero} texto="Pelo menos 1 número" />
                <RegraItem ok={regras.confirma} texto="Confirmação de senha coincide" />
              </div>
            )}

            {erro && (
              <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '8px 12px' }}>
                <p style={{ fontSize: 12, color: '#dc2626', margin: 0 }}>{erro}</p>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
              <button onClick={onFechar} style={{ height: 38, padding: '0 18px', border: '1px solid #e0e0e0', borderRadius: 8, fontSize: 13, cursor: 'pointer', background: 'white', color: '#555' }}>Cancelar</button>
              <button onClick={alterar} disabled={salvando} style={{ height: 38, padding: '0 22px', backgroundColor: COR, color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: salvando ? 'not-allowed' : 'pointer', opacity: salvando ? 0.7 : 1 }}>
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

  useEffect(() => {
    const salvo = localStorage.getItem('sidebar_recolhida')
    if (salvo === 'true') {
      setRecolhida(true)
      document.documentElement.style.setProperty('--sidebar-width', '64px')
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
    document.documentElement.style.setProperty('--sidebar-width', novo ? '64px' : '220px')
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  function abrirMenu() {
    if (footerRef.current) {
      const rect = footerRef.current.getBoundingClientRect()
      setMenuPos({
        bottom: window.innerHeight - rect.top + 4,
        left: rect.left,
        width: Math.max(200, rect.width),
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

  const largura = recolhida ? 64 : 220

  const iniciais = (usuario?.nome || usuario?.email || 'U')
    .split(' ').slice(0, 2).map((p: string) => p[0]).join('').toUpperCase()

  const menuItemStyle: React.CSSProperties = {
    width: '100%', display: 'flex', alignItems: 'center', gap: 10,
    padding: '10px 16px', fontSize: 13, textAlign: 'left',
    border: 'none', background: 'none', cursor: 'pointer', color: '#333',
  }

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
          const iconePath = ICONES[item.href] || ''

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
                    display: 'flex', alignItems: 'center',
                    gap: recolhida ? 0 : 12,
                    justifyContent: recolhida ? 'center' : 'flex-start',
                    padding: recolhida ? '12px 0' : '10px 20px',
                    fontSize: 13,
                    color: filhoAtivo ? COR : '#666',
                    backgroundColor: filhoAtivo ? '#fdf2f5' : 'transparent',
                    borderLeft: filhoAtivo ? `3px solid ${COR}` : '3px solid transparent',
                    cursor: 'pointer',
                    userSelect: 'none',
                    transition: 'background 0.15s',
                  }}
                >
                  <SvgIcon path={iconePath} cor={filhoAtivo ? COR : '#888'} />
                  {!recolhida && (
                    <>
                      <span style={{ flex: 1, whiteSpace: 'nowrap', fontWeight: filhoAtivo ? 500 : 400 }}>
                        {item.label}
                      </span>
                      <span style={{ fontSize: 10, color: '#bbb', marginRight: 4 }}>
                        {estaExpandido ? '▾' : '›'}
                      </span>
                    </>
                  )}
                </div>

                {estaExpandido && !recolhida && item.filhos.map(filho => {
                  const filhoAtivoItem = pathname === filho.href || pathname.startsWith(filho.href + '/')
                  return (
                    <a key={filho.href} href={filho.href} style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '8px 20px 8px 50px',
                      fontSize: 12,
                      color: filhoAtivoItem ? COR : '#888',
                      backgroundColor: filhoAtivoItem ? '#fdf2f5' : 'transparent',
                      borderLeft: filhoAtivoItem ? `3px solid ${COR}` : '3px solid transparent',
                      textDecoration: 'none',
                      fontWeight: filhoAtivoItem ? 600 : 400,
                      transition: 'background 0.15s',
                    }}>
                      <span style={{ fontSize: 10, color: filhoAtivoItem ? COR : '#ccc' }}>●</span>
                      {filho.label}
                    </a>
                  )
                })}

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
          }

          const ativo = pathname === item.href

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

      {/* USUÁRIO */}
      <div
        ref={footerRef}
        style={{
          borderTop: '1px solid #f0f0f0',
          padding: recolhida ? '12px 0' : '12px 16px',
        }}
      >
        {usuario && (
          <div
            onClick={abrirMenu}
            style={{
              display: 'flex', alignItems: 'center',
              gap: recolhida ? 0 : 10,
              justifyContent: recolhida ? 'center' : 'flex-start',
              cursor: 'pointer', borderRadius: 8,
              padding: recolhida ? '6px 0' : '6px 8px',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f5f5f5')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              backgroundColor: '#fdf2f5', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 600, color: COR, flexShrink: 0,
            }}>
              {iniciais}
            </div>
            {!recolhida && (
              <>
                <div style={{ overflow: 'hidden', flex: 1 }}>
                  <p style={{
                    fontSize: 12, fontWeight: 500, color: '#333', margin: 0,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    maxWidth: 120,
                  }}>
                    {usuario.nome || usuario.email}
                  </p>
                  <p style={{ fontSize: 11, color: '#aaa', margin: '1px 0 0', textTransform: 'capitalize' }}>
                    {usuario.nivel}
                  </p>
                </div>
                <span style={{ fontSize: 16, color: '#ccc', flexShrink: 0 }}>⋯</span>
              </>
            )}
          </div>
        )}
      </div>

      {/* POPUP MENU */}
      {menuAberto && usuario && (
        <div
          ref={popupRef}
          style={{
            position: 'fixed',
            bottom: menuPos.bottom,
            left: menuPos.left,
            width: menuPos.width,
            backgroundColor: 'white',
            border: '1px solid #e8e8e8',
            borderRadius: 10,
            boxShadow: '0 -8px 24px rgba(0,0,0,0.12)',
            overflow: 'hidden',
            zIndex: 999,
          }}
        >
          <button
            onClick={() => { setModal('perfil'); setMenuAberto(false) }}
            style={menuItemStyle}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f9f9f9')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <span>👤</span>
            <span>Meu Perfil</span>
          </button>
          <button
            onClick={() => { setModal('senha'); setMenuAberto(false) }}
            style={menuItemStyle}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f9f9f9')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <span>🔑</span>
            <span>Alterar Senha</span>
          </button>
          <div style={{ height: 1, backgroundColor: '#f0f0f0' }} />
          <button
            onClick={handleLogout}
            style={{ ...menuItemStyle, color: '#dc2626' }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#fef2f2')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <span>→</span>
            <span>Sair</span>
          </button>
        </div>
      )}

      {/* MODALS */}
      {modal === 'perfil' && usuario && <ModalPerfil usuario={usuario} onFechar={() => setModal(null)} />}
      {modal === 'senha' && usuario && <ModalAlterarSenha usuario={usuario} onFechar={() => setModal(null)} />}
    </div>
  )
}
