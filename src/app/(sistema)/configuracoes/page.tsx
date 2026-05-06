'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'

// ─── TIPOS ───────────────────────────────────────────────────────────────────

interface Usuario {
  id: string
  email: string
  nome: string
  nivel: string
  pode_auditar: boolean
  ativo: boolean
  created_at: string
  bases?: { base_id: number }[]
}

interface Base {
  id: number
  nome: string
  empresa_id: number | null
  empresas?: { nome: string; sigla: string } | null
}

interface Empresa {
  id: number
  nome: string
  sigla: string
}

interface Funcao {
  id: number
  nome: string
}

interface RegraVencimento {
  id: number
  nome_item: string
  validade_dias: number
  alerta_previo_dias: number
}

type Aba = 'usuarios' | 'bases' | 'funcoes' | 'tipos_exame'

// ─── ESTILOS BASE ─────────────────────────────────────────────────────────────

const cor = '#9f183c'
const corClaro = '#fdf2f5'

const btnPrimario: React.CSSProperties = {
  backgroundColor: cor, color: 'white', border: 'none',
  borderRadius: 8, padding: '8px 16px', fontSize: 13,
  cursor: 'pointer', fontWeight: 500,
}

const btnSecundario: React.CSSProperties = {
  backgroundColor: 'white', color: '#555', border: '1px solid #e0e0e0',
  borderRadius: 8, padding: '8px 16px', fontSize: 13, cursor: 'pointer',
}

const btnPerigo: React.CSSProperties = {
  backgroundColor: 'white', color: '#dc2626', border: '1px solid #fca5a5',
  borderRadius: 8, padding: '6px 12px', fontSize: 12, cursor: 'pointer',
}

const inputStyle: React.CSSProperties = {
  width: '100%', height: 38, border: '1px solid #e0e0e0',
  borderRadius: 8, padding: '0 12px', fontSize: 13,
  boxSizing: 'border-box', outline: 'none',
}

const labelStyle: React.CSSProperties = {
  fontSize: 12, fontWeight: 500, color: '#555', marginBottom: 4, display: 'block',
}

// ─── MODAL GENÉRICO ───────────────────────────────────────────────────────────

function Modal({ titulo, onFechar, children }: {
  titulo: string
  onFechar: () => void
  children: React.ReactNode
}) {
  return (
    <div style={{
      position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }}>
      <div style={{
        backgroundColor: 'white', borderRadius: 16, padding: 32,
        width: '100%', maxWidth: 520, maxHeight: '85vh', overflowY: 'auto',
        boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h2 style={{ fontSize: 17, fontWeight: 600, color: '#1a1a1a', margin: 0 }}>{titulo}</h2>
          <button onClick={onFechar} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#888' }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

// ─── ABA USUÁRIOS ─────────────────────────────────────────────────────────────

function AbaUsuarios() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [bases, setBases] = useState<Base[]>([])
  const [carregando, setCarregando] = useState(true)
  const [modal, setModal] = useState<'novo' | 'editar' | null>(null)
  const [usuarioSelecionado, setUsuarioSelecionado] = useState<Usuario | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [form, setForm] = useState({
    nome: '', email: '', nivel: 'operador',
    pode_auditar: false, ativo: true, bases_ids: [] as number[],
  })

  useEffect(() => { carregar() }, [])

  async function carregar() {
    setCarregando(true)
    const { data: u } = await supabase
      .from('usuarios')
      .select('*, bases:usuarios_bases(base_id)')
      .order('nome')
  const { data: b } = await supabase.from('bases').select('id, nome, empresa_id').order('nome')
    setUsuarios(u || [])
    setBases(b || [])
    setCarregando(false)
  }

  function abrirNovo() {
    setForm({ nome: '', email: '', nivel: 'operador', pode_auditar: false, ativo: true, bases_ids: [] })
    setErro('')
    setModal('novo')
  }

  function abrirEditar(u: Usuario) {
    setUsuarioSelecionado(u)
    setForm({
      nome: u.nome,
      email: u.email,
      nivel: u.nivel,
      pode_auditar: u.pode_auditar,
      ativo: u.ativo,
      bases_ids: u.bases?.map(b => b.base_id) || [],
    })
    setErro('')
    setModal('editar')
  }

  async function salvarNovo() {
  setSalvando(true)
  setErro('')
  try {
    // 1. Criar usuário via API Route (server-side)
    const res = await fetch('/api/criar-usuario', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: form.email, nome: form.nome }),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error)
    const userId = json.user.id

    // 2. Inserir na tabela usuarios
    const { error: dbError } = await supabase.from('usuarios').insert({
      id: userId,
      email: form.email,
      nome: form.nome,
      nivel: form.nivel,
      pode_auditar: form.pode_auditar,
      ativo: form.ativo,
    })
    if (dbError) throw new Error(dbError.message)

    // 3. Associar bases
    if (form.bases_ids.length > 0) {
      await supabase.from('usuarios_bases').insert(
        form.bases_ids.map(base_id => ({ usuario_id: userId, base_id }))
      )
    }

    setModal(null)
    carregar()
  } catch (e: any) {
    setErro(e.message || 'Erro ao criar usuário')
  }
  setSalvando(false)
}

  async function salvarEdicao() {
    if (!usuarioSelecionado) return
    setSalvando(true)
    setErro('')
    try {
      const { error } = await supabase.from('usuarios').update({
        nome: form.nome,
        nivel: form.nivel,
        pode_auditar: form.pode_auditar,
        ativo: form.ativo,
      }).eq('id', usuarioSelecionado.id)
      if (error) throw new Error(error.message)

      // Atualizar bases
      await supabase.from('usuarios_bases').delete().eq('usuario_id', usuarioSelecionado.id)
      if (form.bases_ids.length > 0) {
        await supabase.from('usuarios_bases').insert(
          form.bases_ids.map(base_id => ({ usuario_id: usuarioSelecionado.id, base_id }))
        )
      }

      setModal(null)
      carregar()
    } catch (e: any) {
      setErro(e.message || 'Erro ao salvar')
    }
    setSalvando(false)
  }

  async function toggleAtivo(u: Usuario) {
    await supabase.from('usuarios').update({ ativo: !u.ativo }).eq('id', u.id)
    carregar()
  }

  function toggleBase(id: number) {
    setForm(f => ({
      ...f,
      bases_ids: f.bases_ids.includes(id)
        ? f.bases_ids.filter(b => b !== id)
        : [...f.bases_ids, id],
    }))
  }

  const nivelCor: Record<string, { bg: string; text: string }> = {
    admin: { bg: '#fdf2f5', text: cor },
    operador: { bg: '#eff6ff', text: '#2563eb' },
    visualizador: { bg: '#f0fdf4', text: '#16a34a' },
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <p style={{ fontSize: 13, color: '#888', margin: 0 }}>{usuarios.length} usuários cadastrados</p>
        <button style={btnPrimario} onClick={abrirNovo}>+ Novo Usuário</button>
      </div>

      {carregando ? <p style={{ color: '#888', fontSize: 14 }}>Carregando...</p> : (
        <div style={{ borderRadius: 12, border: '1px solid #f0f0f0', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: 'white', fontSize: 13 }}>
            <thead>
              <tr style={{ backgroundColor: '#fafafa', borderBottom: '1px solid #f0f0f0' }}>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 500, color: '#555' }}>Nome</th>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 500, color: '#555' }}>Email</th>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 500, color: '#555' }}>Nível</th>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 500, color: '#555' }}>Auditor</th>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 500, color: '#555' }}>Status</th>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 500, color: '#555' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u, i) => {
                const nc = nivelCor[u.nivel] || { bg: '#f5f5f5', text: '#555' }
                return (
                  <tr key={u.id} style={{ borderBottom: '1px solid #f5f5f5', backgroundColor: i % 2 === 0 ? 'white' : '#fafafa' }}>
                    <td style={{ padding: '10px 16px', fontWeight: 500, color: '#333' }}>{u.nome}</td>
                    <td style={{ padding: '10px 16px', color: '#666' }}>{u.email}</td>
                    <td style={{ padding: '10px 16px' }}>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, backgroundColor: nc.bg, color: nc.text, textTransform: 'capitalize' }}>
                        {u.nivel}
                      </span>
                    </td>
                    <td style={{ padding: '10px 16px', color: u.pode_auditar ? '#16a34a' : '#aaa', fontSize: 13 }}>
                      {u.pode_auditar ? '✓ Sim' : '— Não'}
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <span style={{
                        fontSize: 11, padding: '2px 8px', borderRadius: 99,
                        backgroundColor: u.ativo ? '#f0fdf4' : '#f5f5f5',
                        color: u.ativo ? '#16a34a' : '#aaa',
                      }}>
                        {u.ativo ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button style={btnSecundario} onClick={() => abrirEditar(u)}>Editar</button>
                        <button style={btnPerigo} onClick={() => toggleAtivo(u)}>
                          {u.ativo ? 'Desativar' : 'Ativar'}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {(modal === 'novo' || modal === 'editar') && (
        <Modal
          titulo={modal === 'novo' ? 'Novo Usuário' : 'Editar Usuário'}
          onFechar={() => setModal(null)}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={labelStyle}>Nome completo</label>
              <input style={inputStyle} value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="Nome do usuário" />
            </div>

            {modal === 'novo' && (
              <div>
                <label style={labelStyle}>Email corporativo</label>
                <input style={inputStyle} type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="email@cgbengenharia.com.br" />
                <p style={{ fontSize: 11, color: '#888', margin: '4px 0 0' }}>
                  O usuário receberá um email para definir sua própria senha.
                </p>
              </div>
            )}

            <div>
              <label style={labelStyle}>Nível de acesso</label>
              <select style={inputStyle} value={form.nivel} onChange={e => setForm(f => ({ ...f, nivel: e.target.value }))}>
                <option value="visualizador">Visualizador</option>
                <option value="operador">Operador</option>
                <option value="admin">Admin</option>
              </select>
            </div>

            <div style={{ display: 'flex', gap: 24 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#555', cursor: 'pointer' }}>
                <input type="checkbox" checked={form.pode_auditar} onChange={e => setForm(f => ({ ...f, pode_auditar: e.target.checked }))} />
                Pode auditar documentos
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#555', cursor: 'pointer' }}>
                <input type="checkbox" checked={form.ativo} onChange={e => setForm(f => ({ ...f, ativo: e.target.checked }))} />
                Usuário ativo
              </label>
            </div>

            <div>
              <label style={labelStyle}>Bases de acesso</label>
              <div style={{
                border: '1px solid #e0e0e0', borderRadius: 8, padding: 12,
                maxHeight: 160, overflowY: 'auto', display: 'flex', flexWrap: 'wrap', gap: 8,
              }}>
                {bases.map(b => (
                  <label key={b.id} style={{
                    display: 'flex', alignItems: 'center', gap: 6, fontSize: 12,
                    color: '#555', cursor: 'pointer',
                    backgroundColor: form.bases_ids.includes(b.id) ? corClaro : '#f9f9f9',
                    padding: '4px 10px', borderRadius: 99,
                    border: `1px solid ${form.bases_ids.includes(b.id) ? cor : '#e0e0e0'}`,
                  }}>
                    <input
                      type="checkbox"
                      checked={form.bases_ids.includes(b.id)}
                      onChange={() => toggleBase(b.id)}
                      style={{ display: 'none' }}
                    />
                    {b.nome}
                  </label>
                ))}
              </div>
            </div>

            {erro && (
              <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: 12 }}>
                <p style={{ fontSize: 13, color: '#dc2626', margin: 0 }}>{erro}</p>
              </div>
            )}

            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 8 }}>
              <button style={btnSecundario} onClick={() => setModal(null)}>Cancelar</button>
              <button
                style={{ ...btnPrimario, opacity: salvando ? 0.7 : 1 }}
                onClick={modal === 'novo' ? salvarNovo : salvarEdicao}
                disabled={salvando}
              >
                {salvando ? 'Salvando...' : modal === 'novo' ? 'Criar Usuário' : 'Salvar'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ─── ABA BASES ────────────────────────────────────────────────────────────────

function AbaBases() {
  const [bases, setBases] = useState<Base[]>([])
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [carregando, setCarregando] = useState(true)
  const [modal, setModal] = useState<'novo' | 'editar' | null>(null)
  const [selecionado, setSelecionado] = useState<Base | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [form, setForm] = useState({ nome: '', empresa_id: '' })

  useEffect(() => { carregar() }, [])

  async function carregar() {
    setCarregando(true)
    const { data: b } = await supabase.from('bases').select('*, empresas(nome, sigla)').order('nome')
    const { data: e } = await supabase.from('empresas').select('*').order('nome')
    setBases(b || [])
    setEmpresas(e || [])
    setCarregando(false)
  }

  function abrirNovo() {
    setForm({ nome: '', empresa_id: '' })
    setModal('novo')
  }

  function abrirEditar(b: Base) {
    setSelecionado(b)
    setForm({ nome: b.nome, empresa_id: String(b.empresa_id || '') })
    setModal('editar')
  }

  async function salvar() {
    setSalvando(true)
    const payload = {
      nome: form.nome,
      empresa_id: form.empresa_id ? Number(form.empresa_id) : null,
    }
    if (modal === 'novo') {
      await supabase.from('bases').insert(payload)
    } else if (selecionado) {
      await supabase.from('bases').update(payload).eq('id', selecionado.id)
    }
    setSalvando(false)
    setModal(null)
    carregar()
  }

  async function excluir(id: number) {
    if (!confirm('Excluir esta base? Esta ação não pode ser desfeita.')) return
    await supabase.from('bases').delete().eq('id', id)
    carregar()
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <p style={{ fontSize: 13, color: '#888', margin: 0 }}>{bases.length} bases cadastradas</p>
        <button style={btnPrimario} onClick={abrirNovo}>+ Nova Base</button>
      </div>

      {carregando ? <p style={{ color: '#888', fontSize: 14 }}>Carregando...</p> : (
        <div style={{ borderRadius: 12, border: '1px solid #f0f0f0', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: 'white', fontSize: 13 }}>
            <thead>
              <tr style={{ backgroundColor: '#fafafa', borderBottom: '1px solid #f0f0f0' }}>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 500, color: '#555' }}>Nome</th>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 500, color: '#555' }}>Empresa</th>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 500, color: '#555' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {bases.map((b, i) => (
                <tr key={b.id} style={{ borderBottom: '1px solid #f5f5f5', backgroundColor: i % 2 === 0 ? 'white' : '#fafafa' }}>
                  <td style={{ padding: '10px 16px', fontWeight: 500, color: '#333' }}>{b.nome}</td>
                  <td style={{ padding: '10px 16px', color: '#666' }}>
                    {b.empresas ? `${b.empresas.sigla} — ${b.empresas.nome}` : '—'}
                  </td>
                  <td style={{ padding: '10px 16px' }}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button style={btnSecundario} onClick={() => abrirEditar(b)}>Editar</button>
                      <button style={btnPerigo} onClick={() => excluir(b.id)}>Excluir</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(modal === 'novo' || modal === 'editar') && (
        <Modal titulo={modal === 'novo' ? 'Nova Base' : 'Editar Base'} onFechar={() => setModal(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={labelStyle}>Nome da base</label>
              <input style={inputStyle} value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="Ex: 172 - Cacoal" />
            </div>
            <div>
              <label style={labelStyle}>Empresa</label>
              <select style={inputStyle} value={form.empresa_id} onChange={e => setForm(f => ({ ...f, empresa_id: e.target.value }))}>
                <option value="">Selecione a empresa</option>
                {empresas.map(e => <option key={e.id} value={e.id}>{e.sigla} — {e.nome}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 8 }}>
              <button style={btnSecundario} onClick={() => setModal(null)}>Cancelar</button>
              <button style={{ ...btnPrimario, opacity: salvando ? 0.7 : 1 }} onClick={salvar} disabled={salvando}>
                {salvando ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ─── ABA FUNÇÕES ──────────────────────────────────────────────────────────────

function AbaFuncoes() {
  const [funcoes, setFuncoes] = useState<Funcao[]>([])
  const [carregando, setCarregando] = useState(true)
  const [modal, setModal] = useState<'novo' | 'editar' | null>(null)
  const [selecionado, setSelecionado] = useState<Funcao | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [nome, setNome] = useState('')
  const [busca, setBusca] = useState('')

  useEffect(() => { carregar() }, [])

  async function carregar() {
    setCarregando(true)
    const { data } = await supabase.from('funcoes').select('*').order('nome')
    setFuncoes(data || [])
    setCarregando(false)
  }

  function abrirNovo() { setNome(''); setModal('novo') }
  function abrirEditar(f: Funcao) { setSelecionado(f); setNome(f.nome); setModal('editar') }

  async function salvar() {
    setSalvando(true)
    if (modal === 'novo') {
      await supabase.from('funcoes').insert({ nome })
    } else if (selecionado) {
      await supabase.from('funcoes').update({ nome }).eq('id', selecionado.id)
    }
    setSalvando(false)
    setModal(null)
    carregar()
  }

  async function excluir(id: number) {
    if (!confirm('Excluir esta função?')) return
    await supabase.from('funcoes').delete().eq('id', id)
    carregar()
  }

  const funcoesFiltradas = busca
    ? funcoes.filter(f => f.nome.toLowerCase().includes(busca.toLowerCase()))
    : funcoes

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <input
            style={{ ...inputStyle, width: 240 }}
            placeholder="Buscar função..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
          />
          <span style={{ fontSize: 13, color: '#888' }}>{funcoesFiltradas.length} funções</span>
        </div>
        <button style={btnPrimario} onClick={abrirNovo}>+ Nova Função</button>
      </div>

      {carregando ? <p style={{ color: '#888', fontSize: 14 }}>Carregando...</p> : (
        <div style={{ borderRadius: 12, border: '1px solid #f0f0f0', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: 'white', fontSize: 13 }}>
            <thead>
              <tr style={{ backgroundColor: '#fafafa', borderBottom: '1px solid #f0f0f0' }}>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 500, color: '#555' }}>#</th>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 500, color: '#555' }}>Nome da Função</th>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 500, color: '#555' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {funcoesFiltradas.map((f, i) => (
                <tr key={f.id} style={{ borderBottom: '1px solid #f5f5f5', backgroundColor: i % 2 === 0 ? 'white' : '#fafafa' }}>
                  <td style={{ padding: '10px 16px', color: '#aaa', fontSize: 12 }}>{f.id}</td>
                  <td style={{ padding: '10px 16px', fontWeight: 500, color: '#333' }}>{f.nome}</td>
                  <td style={{ padding: '10px 16px' }}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button style={btnSecundario} onClick={() => abrirEditar(f)}>Editar</button>
                      <button style={btnPerigo} onClick={() => excluir(f.id)}>Excluir</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(modal === 'novo' || modal === 'editar') && (
        <Modal titulo={modal === 'novo' ? 'Nova Função' : 'Editar Função'} onFechar={() => setModal(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={labelStyle}>Nome da função</label>
              <input
                style={inputStyle}
                value={nome}
                onChange={e => setNome(e.target.value)}
                placeholder="Ex: TÉCNICO ELETROTÉCNICO"
                onKeyDown={e => e.key === 'Enter' && salvar()}
              />
              {modal === 'editar' && (
                <p style={{ fontSize: 11, color: '#888', margin: '4px 0 0' }}>
                  ✓ Todos os colaboradores com esta função serão atualizados automaticamente.
                </p>
              )}
            </div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 8 }}>
              <button style={btnSecundario} onClick={() => setModal(null)}>Cancelar</button>
              <button style={{ ...btnPrimario, opacity: salvando ? 0.7 : 1 }} onClick={salvar} disabled={salvando}>
                {salvando ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ─── ABA TIPOS DE EXAME ───────────────────────────────────────────────────────

function AbaTiposExame() {
  const [regras, setRegras] = useState<RegraVencimento[]>([])
  const [carregando, setCarregando] = useState(true)
  const [modal, setModal] = useState<'novo' | 'editar' | null>(null)
  const [selecionado, setSelecionado] = useState<RegraVencimento | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [form, setForm] = useState({ nome_item: '', validade_dias: '', alerta_previo_dias: '' })

  useEffect(() => { carregar() }, [])

  async function carregar() {
    setCarregando(true)
    const { data } = await supabase.from('regras_vencimento').select('*').order('nome_item')
    setRegras(data || [])
    setCarregando(false)
  }

  function abrirNovo() {
    setForm({ nome_item: '', validade_dias: '', alerta_previo_dias: '' })
    setModal('novo')
  }

  function abrirEditar(r: RegraVencimento) {
    setSelecionado(r)
    setForm({
      nome_item: r.nome_item,
      validade_dias: String(r.validade_dias),
      alerta_previo_dias: String(r.alerta_previo_dias),
    })
    setModal('editar')
  }

  async function salvar() {
    setSalvando(true)
    const payload = {
      nome_item: form.nome_item,
      validade_dias: Number(form.validade_dias),
      alerta_previo_dias: Number(form.alerta_previo_dias),
    }
    if (modal === 'novo') {
      await supabase.from('regras_vencimento').insert(payload)
    } else if (selecionado) {
      await supabase.from('regras_vencimento').update(payload).eq('id', selecionado.id)
    }
    setSalvando(false)
    setModal(null)
    carregar()
  }

  async function excluir(id: number) {
    if (!confirm('Excluir este tipo de exame?')) return
    await supabase.from('regras_vencimento').delete().eq('id', id)
    carregar()
  }

  function diasParaTexto(dias: number) {
    if (dias >= 365 && dias % 365 === 0) return `${dias / 365} ano${dias / 365 > 1 ? 's' : ''}`
    if (dias >= 30 && dias % 30 === 0) return `${dias / 30} mes${dias / 30 > 1 ? 'es' : ''}`
    return `${dias} dias`
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <p style={{ fontSize: 13, color: '#888', margin: 0 }}>{regras.length} tipos cadastrados</p>
        <button style={btnPrimario} onClick={abrirNovo}>+ Novo Tipo</button>
      </div>

      {carregando ? <p style={{ color: '#888', fontSize: 14 }}>Carregando...</p> : (
        <div style={{ borderRadius: 12, border: '1px solid #f0f0f0', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: 'white', fontSize: 13 }}>
            <thead>
              <tr style={{ backgroundColor: '#fafafa', borderBottom: '1px solid #f0f0f0' }}>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 500, color: '#555' }}>Nome do Exame / Treinamento</th>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 500, color: '#555' }}>Validade</th>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 500, color: '#555' }}>Alerta Prévio</th>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 500, color: '#555' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {regras.map((r, i) => (
                <tr key={r.id} style={{ borderBottom: '1px solid #f5f5f5', backgroundColor: i % 2 === 0 ? 'white' : '#fafafa' }}>
                  <td style={{ padding: '10px 16px', fontWeight: 500, color: '#333' }}>{r.nome_item}</td>
                  <td style={{ padding: '10px 16px', color: '#666' }}>
                    <span style={{ backgroundColor: '#eff6ff', color: '#2563eb', fontSize: 12, padding: '2px 8px', borderRadius: 99 }}>
                      {diasParaTexto(r.validade_dias)}
                    </span>
                  </td>
                  <td style={{ padding: '10px 16px', color: '#666' }}>
                    <span style={{ backgroundColor: '#fffbeb', color: '#d97706', fontSize: 12, padding: '2px 8px', borderRadius: 99 }}>
                      {diasParaTexto(r.alerta_previo_dias)} antes
                    </span>
                  </td>
                  <td style={{ padding: '10px 16px' }}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button style={btnSecundario} onClick={() => abrirEditar(r)}>Editar</button>
                      <button style={btnPerigo} onClick={() => excluir(r.id)}>Excluir</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(modal === 'novo' || modal === 'editar') && (
        <Modal titulo={modal === 'novo' ? 'Novo Tipo de Exame' : 'Editar Tipo de Exame'} onFechar={() => setModal(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={labelStyle}>Nome do exame / treinamento</label>
              <input style={inputStyle} value={form.nome_item} onChange={e => setForm(f => ({ ...f, nome_item: e.target.value }))} placeholder="Ex: Direção Defensiva" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <label style={labelStyle}>Validade (em dias)</label>
                <input style={inputStyle} type="number" value={form.validade_dias} onChange={e => setForm(f => ({ ...f, validade_dias: e.target.value }))} placeholder="Ex: 730" />
                <p style={{ fontSize: 11, color: '#888', margin: '4px 0 0' }}>730 dias = 2 anos</p>
              </div>
              <div>
                <label style={labelStyle}>Alerta prévio (em dias)</label>
                <input style={inputStyle} type="number" value={form.alerta_previo_dias} onChange={e => setForm(f => ({ ...f, alerta_previo_dias: e.target.value }))} placeholder="Ex: 30" />
                <p style={{ fontSize: 11, color: '#888', margin: '4px 0 0' }}>Dias antes do vencimento</p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 8 }}>
              <button style={btnSecundario} onClick={() => setModal(null)}>Cancelar</button>
              <button style={{ ...btnPrimario, opacity: salvando ? 0.7 : 1 }} onClick={salvar} disabled={salvando}>
                {salvando ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ─── PÁGINA PRINCIPAL ─────────────────────────────────────────────────────────

export default function ConfiguracoesPage() {
  const router = useRouter()
  const { usuario } = useAuth()
  const [abaAtiva, setAbaAtiva] = useState<Aba>('usuarios')

  useEffect(() => {
    async function verificar() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
    }
    verificar()
  }, [])

  // Bloquear acesso se não for admin
  if (usuario && usuario.nivel !== 'admin') {
    return (
      <div style={{ textAlign: 'center', padding: '80px 0' }}>
        <p style={{ fontSize: 32, marginBottom: 12 }}>🔒</p>
        <h2 style={{ fontSize: 18, color: '#333', marginBottom: 8 }}>Acesso restrito</h2>
        <p style={{ fontSize: 14, color: '#888' }}>Esta área é exclusiva para administradores.</p>
      </div>
    )
  }

  const abas: { key: Aba; label: string; descricao: string }[] = [
    { key: 'usuarios', label: 'Usuários', descricao: 'Gerencie os usuários e permissões do sistema' },
    { key: 'bases', label: 'Bases', descricao: 'Cadastre e edite as bases operacionais' },
    { key: 'funcoes', label: 'Funções', descricao: 'Funções dos colaboradores' },
    { key: 'tipos_exame', label: 'Tipos de Exame', descricao: 'Exames e treinamentos com regras de vencimento' },
  ]

  const abaInfo = abas.find(a => a.key === abaAtiva)!

  return (
    <div style={{ fontFamily: 'Arial, sans-serif' }}>
      {/* CABEÇALHO */}
      <h1 style={{ fontSize: 22, fontWeight: 500, color: '#1a1a1a', marginBottom: 4 }}>
        Configurações
      </h1>
      <p style={{ fontSize: 14, color: '#888', marginBottom: 28 }}>
        {abaInfo.descricao}
      </p>

      {/* ABAS */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 28, borderBottom: '1px solid #f0f0f0' }}>
        {abas.map(aba => (
          <button
            key={aba.key}
            onClick={() => setAbaAtiva(aba.key)}
            style={{
              padding: '10px 20px', fontSize: 13, fontWeight: 500,
              border: 'none', background: 'none', cursor: 'pointer',
              color: abaAtiva === aba.key ? cor : '#888',
              borderBottom: abaAtiva === aba.key ? `2px solid ${cor}` : '2px solid transparent',
              marginBottom: -1,
              transition: 'all 0.15s',
            }}
          >
            {aba.label}
          </button>
        ))}
      </div>

      {/* CONTEÚDO */}
      {abaAtiva === 'usuarios' && <AbaUsuarios />}
      {abaAtiva === 'bases' && <AbaBases />}
      {abaAtiva === 'funcoes' && <AbaFuncoes />}
      {abaAtiva === 'tipos_exame' && <AbaTiposExame />}
    </div>
  )
}