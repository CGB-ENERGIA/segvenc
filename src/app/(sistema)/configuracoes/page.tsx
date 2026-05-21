'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'

// ─── TIPOS ───────────────────────────────────────────────────────────────────
interface Usuario { id: string; email: string; nome: string; nivel: string; pode_auditar: boolean; ativo: boolean; created_at: string; bases?: { base_id: number }[]; modulos_acesso?: string[] }
interface Base { id: number; nome: string; empresa_id: number | null; empresas?: { nome: string; sigla: string } | null }
interface Empresa { id: number; nome: string; sigla: string }
interface Funcao { id: number; nome: string }
interface RegraVencimento { id: number; nome_item: string; validade_dias: number; alerta_previo_dias: number }
interface Gerencia { id: number; sigla: string; nome: string; gerente_matricula: string | null; colaboradores?: { nome: string; matricula: string } | null }
interface ColaboradorBusca { matricula: string; nome: string }
interface GSE { id: number; setor: string; gse_funcoes: { id: number }[]; gse_exames: { id: number }[] }
interface GSEFuncao { id: number; gse_id: number; funcao: string }
interface TipoExameMedico { id: number; nome: string }
interface GSEExame { id: number; gse_id: number; tipo_exame_medico_id: number; no_adm: boolean; no_per: boolean; no_ret: boolean; no_mro: boolean; no_dem: boolean; tipos_exame_medico?: { nome: string } | null }
interface Supervisor { id: number; nome: string }
interface MatrizNR { id: string; funcao: string; processo: string | null; treinamento: string; obrigatorio: string }
interface ConfigEmpresa { id: number; razao_social: string; cnpj: string; cnae: string; grau_risco: string; endereco: string; numero: string; bairro: string; cidade: string; uf: string; telefone: string }
interface MedicoASO { id: number; nome: string; crm: string; rqe: string; especialidade: string; telefone: string; ativo: boolean; created_at: string }

type Aba = 'usuarios' | 'bases' | 'funcoes' | 'tipos_exame' | 'gerencias' | 'gse' | 'supervisores' | 'obrigatoriedade_nr' | 'empresa' | 'medicos'

// ─── CONSTANTES ───────────────────────────────────────────────────────────────
const MODULOS = [
  { chave: 'painel', label: 'Painel Operacional' },
  { chave: 'colaboradores', label: 'Colaboradores' },
  { chave: 'matriz', label: 'Matriz de Competências' },
  { chave: 'medicina', label: 'Medicina do Trabalho' },
  { chave: 'auditoria', label: 'Auditoria' },
  { chave: 'configuracoes', label: 'Configurações' },
  { chave: 'gerar_aso', label: 'Gerar ASO' }
]
const NRS_ALVO = ['NR 10-B', 'NR 11', 'NR 12 - II', 'NR 12 - V', 'NR 12 - XII', 'NR 35']

// ─── ESTILOS BASE ─────────────────────────────────────────────────────────────
const cor = '#9f183c'
const corClaro = '#fdf2f5'
const btnPrimario: React.CSSProperties = { backgroundColor: cor, color: 'white', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, cursor: 'pointer', fontWeight: 500 }
const btnSecundario: React.CSSProperties = { backgroundColor: 'white', color: '#555', border: '1px solid #e0e0e0', borderRadius: 8, padding: '8px 16px', fontSize: 13, cursor: 'pointer' }
const btnPerigo: React.CSSProperties = { backgroundColor: 'white', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: 8, padding: '6px 12px', fontSize: 12, cursor: 'pointer' }
const inputStyle: React.CSSProperties = { width: '100%', height: 38, border: '1px solid #e0e0e0', borderRadius: 8, padding: '0 12px', fontSize: 13, boxSizing: 'border-box', outline: 'none' }
const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 500, color: '#555', marginBottom: 4, display: 'block' }

// ─── MODAL GENÉRICO ───────────────────────────────────────────────────────────
function Modal({ titulo, onFechar, children, maxWidth }: { titulo: string; onFechar: () => void; children: React.ReactNode; maxWidth?: number }) {
  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div style={{ backgroundColor: 'white', borderRadius: 16, padding: 32, width: '100%', maxWidth: maxWidth || 520, maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
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
  const [form, setForm] = useState({ nome: '', email: '', nivel: 'operador', pode_auditar: false, ativo: true, bases_ids: [] as number[], modulos_acesso: [] as string[] })

  useEffect(() => { carregar() }, [])

  async function carregar() {
    setCarregando(true)
    const { data: u } = await supabase.from('usuarios').select('*, bases:usuarios_bases(base_id)').order('nome')
    const { data: b } = await supabase.from('bases').select('id, nome, empresa_id').order('nome')
    setUsuarios(u || []); setBases(b || []); setCarregando(false)
  }

  function abrirNovo() { setForm({ nome: '', email: '', nivel: 'operador', pode_auditar: false, ativo: true, bases_ids: [], modulos_acesso: [] }); setErro(''); setModal('novo') }
  function abrirEditar(u: Usuario) { setUsuarioSelecionado(u); setForm({ nome: u.nome, email: u.email, nivel: u.nivel, pode_auditar: u.pode_auditar, ativo: u.ativo, bases_ids: u.bases?.map(b => b.base_id) || [], modulos_acesso: u.modulos_acesso || [] }); setErro(''); setModal('editar') }
  function toggleBase(id: number) { setForm(f => ({ ...f, bases_ids: f.bases_ids.includes(id) ? f.bases_ids.filter(b => b !== id) : [...f.bases_ids, id] })) }
  function toggleModulo(chave: string) { setForm(f => ({ ...f, modulos_acesso: f.modulos_acesso.includes(chave) ? f.modulos_acesso.filter(m => m !== chave) : [...f.modulos_acesso, chave] })) }

  async function salvarNovo() {
    setSalvando(true); setErro('')
    try {
      const res = await fetch('/api/criar-usuario', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: form.email, nome: form.nome }) })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      const userId = json.user.id
      const { error: dbError } = await supabase.from('usuarios').insert({ id: userId, email: form.email, nome: form.nome, nivel: form.nivel, pode_auditar: form.pode_auditar, ativo: form.ativo, modulos_acesso: form.modulos_acesso })
      if (dbError) throw new Error(dbError.message)
      if (form.bases_ids.length > 0) await supabase.from('usuarios_bases').insert(form.bases_ids.map(base_id => ({ usuario_id: userId, base_id })))
      setModal(null); carregar()
    } catch (e: any) { setErro(e.message || 'Erro ao criar usuário') }
    setSalvando(false)
  }

  async function salvarEdicao() {
    if (!usuarioSelecionado) return
    setSalvando(true); setErro('')
    try {
      const { error } = await supabase.from('usuarios').update({ nome: form.nome, nivel: form.nivel, pode_auditar: form.pode_auditar, ativo: form.ativo, modulos_acesso: form.modulos_acesso }).eq('id', usuarioSelecionado.id)
      if (error) throw new Error(error.message)
      await supabase.from('usuarios_bases').delete().eq('usuario_id', usuarioSelecionado.id)
      if (form.bases_ids.length > 0) await supabase.from('usuarios_bases').insert(form.bases_ids.map(base_id => ({ usuario_id: usuarioSelecionado.id, base_id })))
      setModal(null); carregar()
    } catch (e: any) { setErro(e.message || 'Erro ao salvar') }
    setSalvando(false)
  }

  async function toggleAtivo(u: Usuario) { await supabase.from('usuarios').update({ ativo: !u.ativo }).eq('id', u.id); carregar() }

  const nivelCor: Record<string, { bg: string; text: string }> = { admin: { bg: '#fdf2f5', text: cor }, operador: { bg: '#eff6ff', text: '#2563eb' }, visualizador: { bg: '#f0fdf4', text: '#16a34a' } }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <p style={{ fontSize: 13, color: '#888', margin: 0 }}>{usuarios.length} usuários cadastrados</p>
        <button style={btnPrimario} onClick={abrirNovo}>+ Novo Usuário</button>
      </div>
      {carregando ? <p style={{ color: '#888', fontSize: 14 }}>Carregando...</p> : (
        <div style={{ borderRadius: 12, border: '1px solid #f0f0f0', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: 'white', fontSize: 13 }}>
            <thead><tr style={{ backgroundColor: '#fafafa', borderBottom: '1px solid #f0f0f0' }}>
              {['Nome', 'Email', 'Nível', 'Auditor', 'Status', 'Ações'].map(h => <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 500, color: '#555' }}>{h}</th>)}
            </tr></thead>
            <tbody>{usuarios.map((u, i) => {
              const nc = nivelCor[u.nivel] || { bg: '#f5f5f5', text: '#555' }
              return (
                <tr key={u.id} style={{ borderBottom: '1px solid #f5f5f5', backgroundColor: i % 2 === 0 ? 'white' : '#fafafa' }}>
                  <td style={{ padding: '10px 16px', fontWeight: 500, color: '#333' }}>{u.nome}</td>
                  <td style={{ padding: '10px 16px', color: '#666' }}>{u.email}</td>
                  <td style={{ padding: '10px 16px' }}><span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, backgroundColor: nc.bg, color: nc.text, textTransform: 'capitalize' }}>{u.nivel}</span></td>
                  <td style={{ padding: '10px 16px', color: u.pode_auditar ? '#16a34a' : '#aaa', fontSize: 13 }}>{u.pode_auditar ? '✓ Sim' : '— Não'}</td>
                  <td style={{ padding: '10px 16px' }}><span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, backgroundColor: u.ativo ? '#f0fdf4' : '#f5f5f5', color: u.ativo ? '#16a34a' : '#aaa' }}>{u.ativo ? 'Ativo' : 'Inativo'}</span></td>
                  <td style={{ padding: '10px 16px' }}><div style={{ display: 'flex', gap: 8 }}><button style={btnSecundario} onClick={() => abrirEditar(u)}>Editar</button><button style={btnPerigo} onClick={() => toggleAtivo(u)}>{u.ativo ? 'Desativar' : 'Ativar'}</button></div></td>
                </tr>
              )
            })}</tbody>
          </table>
        </div>
      )}
      {(modal === 'novo' || modal === 'editar') && (
        <Modal titulo={modal === 'novo' ? 'Novo Usuário' : 'Editar Usuário'} onFechar={() => setModal(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div><label style={labelStyle}>Nome completo</label><input style={inputStyle} value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="Nome do usuário" /></div>
            {modal === 'novo' && <div><label style={labelStyle}>Email corporativo</label><input style={inputStyle} type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="email@cgbengenharia.com.br" /><p style={{ fontSize: 11, color: '#888', margin: '4px 0 0' }}>O usuário receberá um email para definir sua própria senha.</p></div>}
            <div><label style={labelStyle}>Nível de acesso</label><select style={inputStyle} value={form.nivel} onChange={e => setForm(f => ({ ...f, nivel: e.target.value }))}><option value="visualizador">Visualizador</option><option value="operador">Operador</option><option value="admin">Admin</option></select></div>
            <div style={{ display: 'flex', gap: 24 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#555', cursor: 'pointer' }}><input type="checkbox" checked={form.pode_auditar} onChange={e => setForm(f => ({ ...f, pode_auditar: e.target.checked }))} />Pode auditar documentos</label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#555', cursor: 'pointer' }}><input type="checkbox" checked={form.ativo} onChange={e => setForm(f => ({ ...f, ativo: e.target.checked }))} />Usuário ativo</label>
            </div>
            <div><label style={labelStyle}>Bases de acesso</label>
              <div style={{ border: '1px solid #e0e0e0', borderRadius: 8, padding: 12, maxHeight: 160, overflowY: 'auto', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {bases.map(b => <label key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#555', cursor: 'pointer', backgroundColor: form.bases_ids.includes(b.id) ? corClaro : '#f9f9f9', padding: '4px 10px', borderRadius: 99, border: `1px solid ${form.bases_ids.includes(b.id) ? cor : '#e0e0e0'}` }}><input type="checkbox" checked={form.bases_ids.includes(b.id)} onChange={() => toggleBase(b.id)} style={{ display: 'none' }} />{b.nome}</label>)}
              </div>
            </div>
            <div><label style={labelStyle}>Módulos com acesso</label>
              <div style={{ border: '1px solid #e0e0e0', borderRadius: 8, padding: 12, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {MODULOS.filter(m => m.chave !== 'configuracoes' || form.nivel === 'admin').map(m => <label key={m.chave} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#555', cursor: 'pointer', backgroundColor: form.modulos_acesso.includes(m.chave) ? corClaro : '#f9f9f9', padding: '4px 10px', borderRadius: 99, border: `1px solid ${form.modulos_acesso.includes(m.chave) ? cor : '#e0e0e0'}` }}><input type="checkbox" checked={form.modulos_acesso.includes(m.chave)} onChange={() => toggleModulo(m.chave)} style={{ display: 'none' }} />{form.modulos_acesso.includes(m.chave) ? '☑' : '☐'} {m.label}</label>)}
              </div>
            </div>
            {erro && <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: 12 }}><p style={{ fontSize: 13, color: '#dc2626', margin: 0 }}>{erro}</p></div>}
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 8 }}>
              <button style={btnSecundario} onClick={() => setModal(null)}>Cancelar</button>
              <button style={{ ...btnPrimario, opacity: salvando ? 0.7 : 1 }} onClick={modal === 'novo' ? salvarNovo : salvarEdicao} disabled={salvando}>{salvando ? 'Salvando...' : modal === 'novo' ? 'Criar Usuário' : 'Salvar'}</button>
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
  async function carregar() { setCarregando(true); const { data: b } = await supabase.from('bases').select('*, empresas(nome, sigla)').order('nome'); const { data: e } = await supabase.from('empresas').select('*').order('nome'); setBases(b || []); setEmpresas(e || []); setCarregando(false) }
  function abrirNovo() { setForm({ nome: '', empresa_id: '' }); setModal('novo') }
  function abrirEditar(b: Base) { setSelecionado(b); setForm({ nome: b.nome, empresa_id: String(b.empresa_id || '') }); setModal('editar') }
  async function salvar() { setSalvando(true); const payload = { nome: form.nome, empresa_id: form.empresa_id ? Number(form.empresa_id) : null }; if (modal === 'novo') await supabase.from('bases').insert(payload); else if (selecionado) await supabase.from('bases').update(payload).eq('id', selecionado.id); setSalvando(false); setModal(null); carregar() }
  async function excluir(id: number) { if (!confirm('Excluir esta base?')) return; await supabase.from('bases').delete().eq('id', id); carregar() }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <p style={{ fontSize: 13, color: '#888', margin: 0 }}>{bases.length} bases cadastradas</p>
        <button style={btnPrimario} onClick={abrirNovo}>+ Nova Base</button>
      </div>
      {carregando ? <p style={{ color: '#888', fontSize: 14 }}>Carregando...</p> : (
        <div style={{ borderRadius: 12, border: '1px solid #f0f0f0', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: 'white', fontSize: 13 }}>
            <thead><tr style={{ backgroundColor: '#fafafa', borderBottom: '1px solid #f0f0f0' }}>{['Nome', 'Empresa', 'Ações'].map(h => <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 500, color: '#555' }}>{h}</th>)}</tr></thead>
            <tbody>{bases.map((b, i) => <tr key={b.id} style={{ borderBottom: '1px solid #f5f5f5', backgroundColor: i % 2 === 0 ? 'white' : '#fafafa' }}>
              <td style={{ padding: '10px 16px', fontWeight: 500, color: '#333' }}>{b.nome}</td>
              <td style={{ padding: '10px 16px', color: '#666' }}>{b.empresas ? `${b.empresas.sigla} — ${b.empresas.nome}` : '—'}</td>
              <td style={{ padding: '10px 16px' }}><div style={{ display: 'flex', gap: 8 }}><button style={btnSecundario} onClick={() => abrirEditar(b)}>Editar</button><button style={btnPerigo} onClick={() => excluir(b.id)}>Excluir</button></div></td>
            </tr>)}</tbody>
          </table>
        </div>
      )}
      {(modal === 'novo' || modal === 'editar') && (
        <Modal titulo={modal === 'novo' ? 'Nova Base' : 'Editar Base'} onFechar={() => setModal(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div><label style={labelStyle}>Nome da base</label><input style={inputStyle} value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="Ex: 172 - Cacoal" /></div>
            <div><label style={labelStyle}>Empresa</label><select style={inputStyle} value={form.empresa_id} onChange={e => setForm(f => ({ ...f, empresa_id: e.target.value }))}><option value="">Selecione a empresa</option>{empresas.map(e => <option key={e.id} value={e.id}>{e.sigla} — {e.nome}</option>)}</select></div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 8 }}><button style={btnSecundario} onClick={() => setModal(null)}>Cancelar</button><button style={{ ...btnPrimario, opacity: salvando ? 0.7 : 1 }} onClick={salvar} disabled={salvando}>{salvando ? 'Salvando...' : 'Salvar'}</button></div>
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
  async function carregar() { setCarregando(true); const { data } = await supabase.from('funcoes').select('*').order('nome'); setFuncoes(data || []); setCarregando(false) }
  function abrirNovo() { setNome(''); setModal('novo') }
  function abrirEditar(f: Funcao) { setSelecionado(f); setNome(f.nome); setModal('editar') }
  async function salvar() { setSalvando(true); if (modal === 'novo') await supabase.from('funcoes').insert({ nome }); else if (selecionado) await supabase.from('funcoes').update({ nome }).eq('id', selecionado.id); setSalvando(false); setModal(null); carregar() }
  async function excluir(id: number) { if (!confirm('Excluir esta função?')) return; await supabase.from('funcoes').delete().eq('id', id); carregar() }
  const funcoesFiltradas = busca ? funcoes.filter(f => f.nome.toLowerCase().includes(busca.toLowerCase())) : funcoes

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}><input style={{ ...inputStyle, width: 240 }} placeholder="Buscar função..." value={busca} onChange={e => setBusca(e.target.value)} /><span style={{ fontSize: 13, color: '#888' }}>{funcoesFiltradas.length} funções</span></div>
        <button style={btnPrimario} onClick={abrirNovo}>+ Nova Função</button>
      </div>
      {carregando ? <p style={{ color: '#888', fontSize: 14 }}>Carregando...</p> : (
        <div style={{ borderRadius: 12, border: '1px solid #f0f0f0', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: 'white', fontSize: 13 }}>
            <thead><tr style={{ backgroundColor: '#fafafa', borderBottom: '1px solid #f0f0f0' }}>{['#', 'Nome da Função', 'Ações'].map(h => <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 500, color: '#555' }}>{h}</th>)}</tr></thead>
            <tbody>{funcoesFiltradas.map((f, i) => <tr key={f.id} style={{ borderBottom: '1px solid #f5f5f5', backgroundColor: i % 2 === 0 ? 'white' : '#fafafa' }}>
              <td style={{ padding: '10px 16px', color: '#aaa', fontSize: 12 }}>{f.id}</td>
              <td style={{ padding: '10px 16px', fontWeight: 500, color: '#333' }}>{f.nome}</td>
              <td style={{ padding: '10px 16px' }}><div style={{ display: 'flex', gap: 8 }}><button style={btnSecundario} onClick={() => abrirEditar(f)}>Editar</button><button style={btnPerigo} onClick={() => excluir(f.id)}>Excluir</button></div></td>
            </tr>)}</tbody>
          </table>
        </div>
      )}
      {(modal === 'novo' || modal === 'editar') && (
        <Modal titulo={modal === 'novo' ? 'Nova Função' : 'Editar Função'} onFechar={() => setModal(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div><label style={labelStyle}>Nome da função</label><input style={inputStyle} value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: TÉCNICO ELETROTÉCNICO" onKeyDown={e => e.key === 'Enter' && salvar()} />{modal === 'editar' && <p style={{ fontSize: 11, color: '#888', margin: '4px 0 0' }}>✓ Todos os colaboradores com esta função serão atualizados automaticamente.</p>}</div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 8 }}><button style={btnSecundario} onClick={() => setModal(null)}>Cancelar</button><button style={{ ...btnPrimario, opacity: salvando ? 0.7 : 1 }} onClick={salvar} disabled={salvando}>{salvando ? 'Salvando...' : 'Salvar'}</button></div>
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
  async function carregar() { setCarregando(true); const { data } = await supabase.from('regras_vencimento').select('*').order('nome_item'); setRegras(data || []); setCarregando(false) }
  function abrirNovo() { setForm({ nome_item: '', validade_dias: '', alerta_previo_dias: '' }); setModal('novo') }
  function abrirEditar(r: RegraVencimento) { setSelecionado(r); setForm({ nome_item: r.nome_item, validade_dias: String(r.validade_dias), alerta_previo_dias: String(r.alerta_previo_dias) }); setModal('editar') }
  async function salvar() { setSalvando(true); const payload = { nome_item: form.nome_item, validade_dias: Number(form.validade_dias), alerta_previo_dias: Number(form.alerta_previo_dias) }; if (modal === 'novo') await supabase.from('regras_vencimento').insert(payload); else if (selecionado) await supabase.from('regras_vencimento').update(payload).eq('id', selecionado.id); setSalvando(false); setModal(null); carregar() }
  async function excluir(id: number) { if (!confirm('Excluir este tipo de exame?')) return; await supabase.from('regras_vencimento').delete().eq('id', id); carregar() }
  function diasParaTexto(dias: number) { if (dias >= 365 && dias % 365 === 0) return `${dias / 365} ano${dias / 365 > 1 ? 's' : ''}`; if (dias >= 30 && dias % 30 === 0) return `${dias / 30} mes${dias / 30 > 1 ? 'es' : ''}`; return `${dias} dias` }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <p style={{ fontSize: 13, color: '#888', margin: 0 }}>{regras.length} tipos cadastrados</p>
        <button style={btnPrimario} onClick={abrirNovo}>+ Novo Tipo</button>
      </div>
      {carregando ? <p style={{ color: '#888', fontSize: 14 }}>Carregando...</p> : (
        <div style={{ borderRadius: 12, border: '1px solid #f0f0f0', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: 'white', fontSize: 13 }}>
            <thead><tr style={{ backgroundColor: '#fafafa', borderBottom: '1px solid #f0f0f0' }}>{['Nome do Exame / Treinamento', 'Validade', 'Alerta Prévio', 'Ações'].map(h => <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 500, color: '#555' }}>{h}</th>)}</tr></thead>
            <tbody>{regras.map((r, i) => <tr key={r.id} style={{ borderBottom: '1px solid #f5f5f5', backgroundColor: i % 2 === 0 ? 'white' : '#fafafa' }}>
              <td style={{ padding: '10px 16px', fontWeight: 500, color: '#333' }}>{r.nome_item}</td>
              <td style={{ padding: '10px 16px' }}><span style={{ backgroundColor: '#eff6ff', color: '#2563eb', fontSize: 12, padding: '2px 8px', borderRadius: 99 }}>{diasParaTexto(r.validade_dias)}</span></td>
              <td style={{ padding: '10px 16px' }}><span style={{ backgroundColor: '#fffbeb', color: '#d97706', fontSize: 12, padding: '2px 8px', borderRadius: 99 }}>{diasParaTexto(r.alerta_previo_dias)} antes</span></td>
              <td style={{ padding: '10px 16px' }}><div style={{ display: 'flex', gap: 8 }}><button style={btnSecundario} onClick={() => abrirEditar(r)}>Editar</button><button style={btnPerigo} onClick={() => excluir(r.id)}>Excluir</button></div></td>
            </tr>)}</tbody>
          </table>
        </div>
      )}
      {(modal === 'novo' || modal === 'editar') && (
        <Modal titulo={modal === 'novo' ? 'Novo Tipo de Exame' : 'Editar Tipo de Exame'} onFechar={() => setModal(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div><label style={labelStyle}>Nome do exame / treinamento</label><input style={inputStyle} value={form.nome_item} onChange={e => setForm(f => ({ ...f, nome_item: e.target.value }))} placeholder="Ex: Direção Defensiva" /></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div><label style={labelStyle}>Validade (em dias)</label><input style={inputStyle} type="number" value={form.validade_dias} onChange={e => setForm(f => ({ ...f, validade_dias: e.target.value }))} placeholder="Ex: 730" /><p style={{ fontSize: 11, color: '#888', margin: '4px 0 0' }}>730 dias = 2 anos</p></div>
              <div><label style={labelStyle}>Alerta prévio (em dias)</label><input style={inputStyle} type="number" value={form.alerta_previo_dias} onChange={e => setForm(f => ({ ...f, alerta_previo_dias: e.target.value }))} placeholder="Ex: 30" /><p style={{ fontSize: 11, color: '#888', margin: '4px 0 0' }}>Dias antes do vencimento</p></div>
            </div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 8 }}><button style={btnSecundario} onClick={() => setModal(null)}>Cancelar</button><button style={{ ...btnPrimario, opacity: salvando ? 0.7 : 1 }} onClick={salvar} disabled={salvando}>{salvando ? 'Salvando...' : 'Salvar'}</button></div>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ─── ABA GERÊNCIAS ────────────────────────────────────────────────────────────
function AbaGerencias() {
  const [gerencias, setGerencias] = useState<Gerencia[]>([])
  const [carregando, setCarregando] = useState(true)
  const [modal, setModal] = useState<'novo' | 'editar' | null>(null)
  const [selecionado, setSelecionado] = useState<Gerencia | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [form, setForm] = useState({ sigla: '', nome: '', gerente_matricula: '' })
  const [gerenteBusca, setGerenteBusca] = useState('')
  const [gerenteSugestoes, setGerenteSugestoes] = useState<ColaboradorBusca[]>([])
  const [showSugestoes, setShowSugestoes] = useState(false)

  useEffect(() => { carregar() }, [])
  async function carregar() { setCarregando(true); const { data } = await supabase.from('gerencias').select('*, colaboradores(nome, matricula)').order('sigla'); setGerencias((data as unknown as Gerencia[]) || []); setCarregando(false) }
  async function buscarGerentes(texto: string) { if (texto.length < 2) { setGerenteSugestoes([]); setShowSugestoes(false); return }; const { data } = await supabase.from('colaboradores').select('matricula, nome').or(`nome.ilike.%${texto}%,matricula.ilike.%${texto}%`).limit(10); setGerenteSugestoes(data || []); setShowSugestoes(true) }
  function selecionarGerente(c: ColaboradorBusca) { setForm(f => ({ ...f, gerente_matricula: c.matricula })); setGerenteBusca(`${c.nome} (${c.matricula})`); setShowSugestoes(false); setGerenteSugestoes([]) }
  function abrirNovo() { setForm({ sigla: '', nome: '', gerente_matricula: '' }); setGerenteBusca(''); setModal('novo') }
  function abrirEditar(g: Gerencia) { setSelecionado(g); setForm({ sigla: g.sigla, nome: g.nome, gerente_matricula: g.gerente_matricula || '' }); setGerenteBusca(g.colaboradores ? `${g.colaboradores.nome} (${g.colaboradores.matricula})` : ''); setModal('editar') }
  async function salvar() { if (!form.sigla) return; setSalvando(true); const payload = { sigla: form.sigla.toUpperCase(), nome: form.nome, gerente_matricula: form.gerente_matricula || null }; if (modal === 'novo') await supabase.from('gerencias').insert(payload); else if (selecionado) await supabase.from('gerencias').update(payload).eq('id', selecionado.id); setSalvando(false); setModal(null); carregar() }
  async function excluir(id: number) { if (!confirm('Excluir esta gerência?')) return; await supabase.from('gerencias').delete().eq('id', id); carregar() }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <p style={{ fontSize: 13, color: '#888', margin: 0 }}>{gerencias.length} gerências cadastradas</p>
        <button style={btnPrimario} onClick={abrirNovo}>+ Nova Gerência</button>
      </div>
      {carregando ? <p style={{ color: '#888', fontSize: 14 }}>Carregando...</p> : (
        <div style={{ borderRadius: 12, border: '1px solid #f0f0f0', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: 'white', fontSize: 13 }}>
            <thead><tr style={{ backgroundColor: '#fafafa', borderBottom: '1px solid #f0f0f0' }}>{['Sigla', 'Nome', 'Gerente', 'Ações'].map(h => <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 500, color: '#555' }}>{h}</th>)}</tr></thead>
            <tbody>{gerencias.length === 0 ? <tr><td colSpan={4} style={{ padding: '32px 16px', textAlign: 'center', color: '#aaa', fontSize: 13 }}>Nenhuma gerência cadastrada.</td></tr>
              : gerencias.map((g, i) => <tr key={g.id} style={{ borderBottom: '1px solid #f5f5f5', backgroundColor: i % 2 === 0 ? 'white' : '#fafafa' }}>
                <td style={{ padding: '10px 16px', fontWeight: 600, color: cor }}>{g.sigla}</td>
                <td style={{ padding: '10px 16px', color: '#333' }}>{g.nome}</td>
                <td style={{ padding: '10px 16px', color: '#666' }}>{g.colaboradores?.nome || <span style={{ color: '#ccc' }}>—</span>}</td>
                <td style={{ padding: '10px 16px' }}><div style={{ display: 'flex', gap: 8 }}><button style={btnSecundario} onClick={() => abrirEditar(g)}>Editar</button><button style={btnPerigo} onClick={() => excluir(g.id)}>Excluir</button></div></td>
              </tr>)}
            </tbody>
          </table>
        </div>
      )}
      {(modal === 'novo' || modal === 'editar') && (
        <Modal titulo={modal === 'novo' ? 'Nova Gerência' : 'Editar Gerência'} onFechar={() => setModal(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 16 }}>
              <div><label style={labelStyle}>Sigla *</label><input style={inputStyle} value={form.sigla} onChange={e => setForm(f => ({ ...f, sigla: e.target.value }))} placeholder="Ex: GT" maxLength={10} /></div>
              <div><label style={labelStyle}>Nome completo</label><input style={inputStyle} value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="Ex: Gerência de Transportes" /></div>
            </div>
            <div style={{ position: 'relative' }}>
              <label style={labelStyle}>Gerente (busca por nome ou matrícula)</label>
              <div style={{ position: 'relative' }}>
                <input style={inputStyle} value={gerenteBusca} onChange={e => { setGerenteBusca(e.target.value); buscarGerentes(e.target.value) }} onFocus={() => gerenteBusca.length >= 2 && setShowSugestoes(true)} onBlur={() => setTimeout(() => setShowSugestoes(false), 150)} placeholder="Digite o nome ou matrícula..." />
                {form.gerente_matricula && <button onClick={() => { setForm(f => ({ ...f, gerente_matricula: '' })); setGerenteBusca('') }} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#aaa', fontSize: 16 }}>✕</button>}
              </div>
              {showSugestoes && gerenteSugestoes.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, backgroundColor: 'white', border: '1px solid #e0e0e0', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', maxHeight: 200, overflowY: 'auto' }}>
                  {gerenteSugestoes.map(c => <div key={c.matricula} onClick={() => selecionarGerente(c)} style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #f5f5f5' }} onMouseEnter={e => (e.currentTarget.style.backgroundColor = corClaro)} onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'white')}><span style={{ fontWeight: 500 }}>{c.nome}</span><span style={{ color: '#888', marginLeft: 8 }}>({c.matricula})</span></div>)}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 8 }}><button style={btnSecundario} onClick={() => setModal(null)}>Cancelar</button><button style={{ ...btnPrimario, opacity: salvando ? 0.7 : 1 }} onClick={salvar} disabled={salvando}>{salvando ? 'Salvando...' : 'Salvar'}</button></div>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ─── ABA GSE ──────────────────────────────────────────────────────────────────
function AbaGSE() {
  const [gses, setGses] = useState<GSE[]>([])
  const [carregando, setCarregando] = useState(true)
  const [gseSelecionado, setGseSelecionado] = useState<GSE | null>(null)
  const [gseFuncoes, setGseFuncoes] = useState<GSEFuncao[]>([])
  const [gseExames, setGseExames] = useState<GSEExame[]>([])
  const [tiposExame, setTiposExame] = useState<TipoExameMedico[]>([])
  const [novaFuncao, setNovaFuncao] = useState('')
  const [adicionandoFuncao, setAdicionandoFuncao] = useState(false)
  const [novoExameId, setNovoExameId] = useState('')
  const [adicionandoExame, setAdicionandoExame] = useState(false)
  const [atualizandoExame, setAtualizandoExame] = useState<number | null>(null)

  useEffect(() => { carregarGSEs() }, [])
  async function carregarGSEs() { setCarregando(true); const { data } = await supabase.from('gses').select('id, setor, gse_funcoes(id), gse_exames(id)').order('setor'); setGses((data as unknown as GSE[]) || []); setCarregando(false) }
  async function abrirGSE(gse: GSE) {
    setGseSelecionado(gse)
    const [{ data: funcoes }, { data: exames }, { data: tipos }] = await Promise.all([
      supabase.from('gse_funcoes').select('*').eq('gse_id', gse.id).order('funcao'),
      supabase.from('gse_exames').select('*, tipos_exame_medico(nome)').eq('gse_id', gse.id),
      supabase.from('tipos_exame_medico').select('*').order('nome'),
    ])
    setGseFuncoes(funcoes || []); setGseExames((exames as unknown as GSEExame[]) || []); setTiposExame(tipos || []); setNovaFuncao(''); setNovoExameId('')
  }
  async function adicionarFuncao() { if (!novaFuncao.trim() || !gseSelecionado) return; setAdicionandoFuncao(true); await supabase.from('gse_funcoes').insert({ gse_id: gseSelecionado.id, funcao: novaFuncao.trim() }); const { data } = await supabase.from('gse_funcoes').select('*').eq('gse_id', gseSelecionado.id).order('funcao'); setGseFuncoes(data || []); setNovaFuncao(''); setAdicionandoFuncao(false); carregarGSEs() }
  async function removerFuncao(id: number) { await supabase.from('gse_funcoes').delete().eq('id', id); setGseFuncoes(f => f.filter(x => x.id !== id)); carregarGSEs() }
  async function adicionarExame() { if (!novoExameId || !gseSelecionado) return; setAdicionandoExame(true); await supabase.from('gse_exames').insert({ gse_id: gseSelecionado.id, tipo_exame_medico_id: parseInt(novoExameId), no_adm: false, no_per: false, no_ret: false, no_mro: false, no_dem: false }); const { data } = await supabase.from('gse_exames').select('*, tipos_exame_medico(nome)').eq('gse_id', gseSelecionado.id); setGseExames((data as unknown as GSEExame[]) || []); setNovoExameId(''); setAdicionandoExame(false); carregarGSEs() }
  async function removerExame(id: number) { await supabase.from('gse_exames').delete().eq('id', id); setGseExames(e => e.filter(x => x.id !== id)); carregarGSEs() }
  async function toggleCheckbox(exame: GSEExame, campo: 'no_adm' | 'no_per' | 'no_ret' | 'no_mro' | 'no_dem') { setAtualizandoExame(exame.id); await supabase.from('gse_exames').update({ [campo]: !exame[campo] }).eq('id', exame.id); setGseExames(e => e.map(x => x.id === exame.id ? { ...x, [campo]: !exame[campo] } : x)); setAtualizandoExame(null) }
  const examesJaVinculados = new Set(gseExames.map(e => e.tipo_exame_medico_id))
  const tiposDisponiveis = tiposExame.filter(t => !examesJaVinculados.has(t.id))
  const thExameStyle: React.CSSProperties = { padding: '8px 12px', textAlign: 'center' as const, fontWeight: 500, color: '#555', fontSize: 12, backgroundColor: '#fafafa', borderBottom: '1px solid #f0f0f0' }

  return (
    <div>
      <div style={{ marginBottom: 20 }}><p style={{ fontSize: 13, color: '#888', margin: 0 }}>{gses.length} GSEs cadastrados</p></div>
      {carregando ? <p style={{ color: '#888', fontSize: 14 }}>Carregando...</p> : (
        <div style={{ borderRadius: 12, border: '1px solid #f0f0f0', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: 'white', fontSize: 13 }}>
            <thead><tr style={{ backgroundColor: '#fafafa', borderBottom: '1px solid #f0f0f0' }}>{['ID', 'Setor', 'Funções', 'Exames', 'Ações'].map(h => <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 500, color: '#555' }}>{h}</th>)}</tr></thead>
            <tbody>{gses.length === 0 ? <tr><td colSpan={5} style={{ padding: '32px 16px', textAlign: 'center', color: '#aaa', fontSize: 13 }}>Nenhum GSE cadastrado.</td></tr>
              : gses.map((g, i) => <tr key={g.id} style={{ borderBottom: '1px solid #f5f5f5', backgroundColor: i % 2 === 0 ? 'white' : '#fafafa' }}>
                <td style={{ padding: '10px 16px', color: '#aaa', fontSize: 12 }}>{g.id}</td>
                <td style={{ padding: '10px 16px', fontWeight: 500, color: '#333' }}>{g.setor}</td>
                <td style={{ padding: '10px 16px' }}><span style={{ backgroundColor: '#eff6ff', color: '#2563eb', fontSize: 12, padding: '2px 8px', borderRadius: 99 }}>{g.gse_funcoes.length}</span></td>
                <td style={{ padding: '10px 16px' }}><span style={{ backgroundColor: '#f0fdf4', color: '#16a34a', fontSize: 12, padding: '2px 8px', borderRadius: 99 }}>{g.gse_exames.length}</span></td>
                <td style={{ padding: '10px 16px' }}><button style={btnSecundario} onClick={() => abrirGSE(g)}>Gerenciar</button></td>
              </tr>)}
            </tbody>
          </table>
        </div>
      )}
      {gseSelecionado && (
        <Modal titulo={`GSE ${gseSelecionado.id} — ${gseSelecionado.setor}`} onFechar={() => setGseSelecionado(null)} maxWidth={720}>
          <div style={{ marginBottom: 32 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: '#333', margin: '0 0 12px', paddingBottom: 8, borderBottom: '1px solid #f0f0f0' }}>Funções vinculadas ao GSE</h3>
            {gseFuncoes.length === 0 ? <p style={{ fontSize: 13, color: '#aaa', margin: '0 0 12px' }}>Nenhuma função vinculada.</p>
              : <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                {gseFuncoes.map(f => <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 6, backgroundColor: '#f9f9f9', border: '1px solid #e0e0e0', borderRadius: 99, padding: '4px 10px', fontSize: 12 }}><span style={{ color: '#333' }}>{f.funcao}</span><button onClick={() => removerFuncao(f.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#aaa', fontSize: 14, padding: 0, lineHeight: 1 }}>✕</button></div>)}
              </div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <input style={{ ...inputStyle, flex: 1 }} value={novaFuncao} onChange={e => setNovaFuncao(e.target.value)} placeholder="Nome da nova função..." onKeyDown={e => e.key === 'Enter' && adicionarFuncao()} />
              <button style={{ ...btnPrimario, opacity: adicionandoFuncao ? 0.7 : 1, whiteSpace: 'nowrap' }} onClick={adicionarFuncao} disabled={adicionandoFuncao}>Adicionar</button>
            </div>
          </div>
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: '#333', margin: '0 0 12px', paddingBottom: 8, borderBottom: '1px solid #f0f0f0' }}>Exames por tipo de ASO</h3>
            {gseExames.length === 0 ? <p style={{ fontSize: 13, color: '#aaa', margin: '0 0 12px' }}>Nenhum exame vinculado.</p>
              : <div style={{ overflowX: 'auto', marginBottom: 16 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, border: '1px solid #f0f0f0', borderRadius: 8 }}>
                  <thead><tr><th style={{ ...thExameStyle, textAlign: 'left', padding: '8px 12px' }}>Exame</th>{['ADM', 'PER', 'RET', 'MRO', 'DEM'].map(h => <th key={h} style={thExameStyle}>{h}</th>)}<th style={{ ...thExameStyle, width: 36 }}></th></tr></thead>
                  <tbody>{gseExames.map((e, i) => {
                    const desabilitado = atualizandoExame === e.id
                    return <tr key={e.id} style={{ borderBottom: '1px solid #f5f5f5', backgroundColor: i % 2 === 0 ? 'white' : '#fafafa', opacity: desabilitado ? 0.6 : 1 }}>
                      <td style={{ padding: '8px 12px', color: '#333' }}>{e.tipos_exame_medico?.nome || '—'}</td>
                      {(['no_adm', 'no_per', 'no_ret', 'no_mro', 'no_dem'] as const).map(campo => <td key={campo} style={{ padding: '8px 12px', textAlign: 'center' }}><input type="checkbox" checked={e[campo]} onChange={() => toggleCheckbox(e, campo)} disabled={desabilitado} style={{ width: 16, height: 16, cursor: 'pointer', accentColor: cor }} /></td>)}
                      <td style={{ padding: '8px 12px', textAlign: 'center' }}><button onClick={() => removerExame(e.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ccc', fontSize: 14 }} onMouseEnter={ev => (ev.currentTarget.style.color = '#dc2626')} onMouseLeave={ev => (ev.currentTarget.style.color = '#ccc')}>✕</button></td>
                    </tr>
                  })}</tbody>
                </table>
              </div>}
            {tiposDisponiveis.length > 0 && <div style={{ display: 'flex', gap: 8 }}>
              <select style={{ ...inputStyle, flex: 1 }} value={novoExameId} onChange={e => setNovoExameId(e.target.value)}><option value="">Selecione um exame para adicionar...</option>{tiposDisponiveis.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}</select>
              <button style={{ ...btnPrimario, opacity: (adicionandoExame || !novoExameId) ? 0.7 : 1, whiteSpace: 'nowrap' }} onClick={adicionarExame} disabled={adicionandoExame || !novoExameId}>Adicionar</button>
            </div>}
          </div>
        </Modal>
      )}
    </div>
  )
}

// ─── ABA SUPERVISORES ─────────────────────────────────────────────────────────
function AbaSupervisores() {
  const [supervisores, setSupervisores] = useState<Supervisor[]>([])
  const [carregando, setCarregando] = useState(true)
  const [modal, setModal] = useState<'novo' | 'editar' | null>(null)
  const [selecionado, setSelecionado] = useState<Supervisor | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [nome, setNome] = useState('')
  const [busca, setBusca] = useState('')

  useEffect(() => { carregar() }, [])
  async function carregar() { setCarregando(true); const { data } = await supabase.from('supervisores').select('*').order('nome'); setSupervisores(data || []); setCarregando(false) }
  function abrirNovo() { setNome(''); setModal('novo') }
  function abrirEditar(s: Supervisor) { setSelecionado(s); setNome(s.nome); setModal('editar') }
  async function salvar() {
    if (!nome.trim()) return
    setSalvando(true)
    if (modal === 'novo') await supabase.from('supervisores').insert({ nome: nome.trim() })
    else if (selecionado) await supabase.from('supervisores').update({ nome: nome.trim() }).eq('id', selecionado.id)
    setSalvando(false); setModal(null); carregar()
  }
  async function excluir(id: number) {
    if (!confirm('Excluir este supervisor? Colaboradores vinculados perderão o supervisor.')) return
    await supabase.from('supervisores').delete().eq('id', id); carregar()
  }
  const filtrados = busca ? supervisores.filter(s => s.nome.toLowerCase().includes(busca.toLowerCase())) : supervisores

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <input style={{ ...inputStyle, width: 240 }} placeholder="Buscar supervisor..." value={busca} onChange={e => setBusca(e.target.value)} />
          <span style={{ fontSize: 13, color: '#888' }}>{filtrados.length} supervisores</span>
        </div>
        <button style={btnPrimario} onClick={abrirNovo}>+ Novo Supervisor</button>
      </div>
      {carregando ? <p style={{ color: '#888', fontSize: 14 }}>Carregando...</p> : (
        <div style={{ borderRadius: 12, border: '1px solid #f0f0f0', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: 'white', fontSize: 13 }}>
            <thead><tr style={{ backgroundColor: '#fafafa', borderBottom: '1px solid #f0f0f0' }}>
              {['#', 'Nome do Supervisor', 'Ações'].map(h => <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 500, color: '#555' }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {filtrados.length === 0
                ? <tr><td colSpan={3} style={{ padding: '32px 16px', textAlign: 'center', color: '#aaa', fontSize: 13 }}>Nenhum supervisor encontrado.</td></tr>
                : filtrados.map((s, i) => (
                  <tr key={s.id} style={{ borderBottom: '1px solid #f5f5f5', backgroundColor: i % 2 === 0 ? 'white' : '#fafafa' }}>
                    <td style={{ padding: '10px 16px', color: '#aaa', fontSize: 12 }}>{s.id}</td>
                    <td style={{ padding: '10px 16px', fontWeight: 500, color: '#333' }}>{s.nome}</td>
                    <td style={{ padding: '10px 16px' }}>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button style={btnSecundario} onClick={() => abrirEditar(s)}>Editar</button>
                        <button style={btnPerigo} onClick={() => excluir(s.id)}>Excluir</button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
      {(modal === 'novo' || modal === 'editar') && (
        <Modal titulo={modal === 'novo' ? 'Novo Supervisor' : 'Editar Supervisor'} onFechar={() => setModal(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={labelStyle}>Nome completo *</label>
              <input style={inputStyle} value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: JOÃO DA SILVA" onKeyDown={e => e.key === 'Enter' && salvar()} autoFocus />
            </div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 8 }}>
              <button style={btnSecundario} onClick={() => setModal(null)}>Cancelar</button>
              <button style={{ ...btnPrimario, opacity: salvando ? 0.7 : 1 }} onClick={salvar} disabled={salvando}>{salvando ? 'Salvando...' : 'Salvar'}</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ─── ABA OBRIGATORIEDADE NR ───────────────────────────────────────────────────
function AbaObrigatoriedadeNR() {
  const [nrSelecionada, setNrSelecionada] = useState(NRS_ALVO[0])
  const [registros, setRegistros] = useState<MatrizNR[]>([])
  const [funcoes, setFuncoes] = useState<Funcao[]>([])
  const [carregando, setCarregando] = useState(false)
  const [modal, setModal] = useState<'novo' | 'editar' | null>(null)
  const [selecionado, setSelecionado] = useState<MatrizNR | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [busca, setBusca] = useState('')
  const [form, setForm] = useState({ funcao: '', processo: '', obrigatorio: 'SIM' })

  useEffect(() => { carregar() }, [nrSelecionada])

  async function carregar() {
    setCarregando(true)
    const [{ data: r }, { data: f }] = await Promise.all([
      supabase.from('matriz_treinamentos').select('*').eq('pagina', 'BASE NR').eq('treinamento', nrSelecionada).order('funcao'),
      supabase.from('funcoes').select('id, nome').order('nome'),
    ])
    setRegistros(r || []); setFuncoes(f || []); setCarregando(false)
  }

  function abrirNovo() { setForm({ funcao: '', processo: '', obrigatorio: 'SIM' }); setSelecionado(null); setModal('novo') }
  function abrirEditar(r: MatrizNR) { setSelecionado(r); setForm({ funcao: r.funcao, processo: r.processo || '', obrigatorio: r.obrigatorio }); setModal('editar') }

  async function salvar() {
    if (!form.funcao) return
    setSalvando(true)
    const payload = { pagina: 'BASE NR', treinamento: nrSelecionada, funcao: form.funcao, processo: form.processo || null, obrigatorio: form.obrigatorio }
    if (modal === 'novo') await supabase.from('matriz_treinamentos').insert(payload)
    else if (selecionado) await supabase.from('matriz_treinamentos').update(payload).eq('id', selecionado.id)
    setSalvando(false); setModal(null); carregar()
  }

  async function excluir(id: string) {
    if (!confirm('Excluir esta regra de obrigatoriedade?')) return
    await supabase.from('matriz_treinamentos').delete().eq('id', id); carregar()
  }

  const filtrados = busca ? registros.filter(r => r.funcao.toLowerCase().includes(busca.toLowerCase())) : registros
  const obrigCores: Record<string, { bg: string; text: string }> = {
    'SIM': { bg: '#f0fdf4', text: '#16a34a' },
    'NÃO': { bg: '#fef2f2', text: '#dc2626' },
    'N/A': { bg: '#f1f5f9', text: '#64748b' },
  }

  return (
    <div>
      {/* Seletor de NR */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {NRS_ALVO.map(nr => (
          <button key={nr} onClick={() => { setNrSelecionada(nr); setBusca('') }}
            style={{ padding: '8px 16px', fontSize: 13, fontWeight: nrSelecionada === nr ? 600 : 400, border: `1px solid ${nrSelecionada === nr ? cor : '#e0e0e0'}`, borderRadius: 8, cursor: 'pointer', backgroundColor: nrSelecionada === nr ? corClaro : 'white', color: nrSelecionada === nr ? cor : '#555', transition: 'all 0.15s' }}>
            {nr}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <input style={{ ...inputStyle, width: 240 }} placeholder="Buscar função..." value={busca} onChange={e => setBusca(e.target.value)} />
          <span style={{ fontSize: 13, color: '#888' }}>{filtrados.length} regras para {nrSelecionada}</span>
        </div>
        <button style={btnPrimario} onClick={abrirNovo}>+ Nova Regra</button>
      </div>

      {carregando ? <p style={{ color: '#888', fontSize: 14 }}>Carregando...</p> : (
        <div style={{ borderRadius: 12, border: '1px solid #f0f0f0', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: 'white', fontSize: 13 }}>
            <thead><tr style={{ backgroundColor: '#fafafa', borderBottom: '1px solid #f0f0f0' }}>
              {['Função', 'Processo', 'Obrigatoriedade', 'Ações'].map(h => <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 500, color: '#555' }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {filtrados.length === 0
                ? <tr><td colSpan={4} style={{ padding: '32px 16px', textAlign: 'center', color: '#aaa', fontSize: 13 }}>Nenhuma regra cadastrada para {nrSelecionada}.</td></tr>
                : filtrados.map((r, i) => {
                  const oc = obrigCores[r.obrigatorio] || { bg: '#f1f5f9', text: '#64748b' }
                  return (
                    <tr key={r.id} style={{ borderBottom: '1px solid #f5f5f5', backgroundColor: i % 2 === 0 ? 'white' : '#fafafa' }}>
                      <td style={{ padding: '10px 16px', fontWeight: 500, color: '#333' }}>{r.funcao}</td>
                      <td style={{ padding: '10px 16px', color: '#666' }}>{r.processo || <span style={{ color: '#ccc' }}>Todos</span>}</td>
                      <td style={{ padding: '10px 16px' }}>
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, backgroundColor: oc.bg, color: oc.text, fontWeight: 600 }}>{r.obrigatorio}</span>
                      </td>
                      <td style={{ padding: '10px 16px' }}>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button style={btnSecundario} onClick={() => abrirEditar(r)}>Editar</button>
                          <button style={btnPerigo} onClick={() => excluir(r.id)}>Excluir</button>
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
        <Modal titulo={modal === 'novo' ? `Nova Regra — ${nrSelecionada}` : `Editar Regra — ${nrSelecionada}`} onFechar={() => setModal(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={labelStyle}>Função *</label>
              <select style={inputStyle} value={form.funcao} onChange={e => setForm(f => ({ ...f, funcao: e.target.value }))}>
                <option value="">Selecione a função...</option>
                {funcoes.map(f => <option key={f.id} value={f.nome}>{f.nome}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Processo <span style={{ color: '#aaa', fontWeight: 400 }}>(deixe vazio para todos)</span></label>
              <input style={inputStyle} value={form.processo} onChange={e => setForm(f => ({ ...f, processo: e.target.value }))} placeholder="Ex: Manutenção" />
            </div>
            <div>
              <label style={labelStyle}>Obrigatoriedade *</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {['SIM', 'NÃO', 'N/A'].map(op => (
                  <button key={op} onClick={() => setForm(f => ({ ...f, obrigatorio: op }))}
                    style={{ flex: 1, height: 38, borderRadius: 8, fontSize: 13, fontWeight: form.obrigatorio === op ? 600 : 400, cursor: 'pointer', border: `1px solid ${form.obrigatorio === op ? (op === 'SIM' ? '#16a34a' : op === 'NÃO' ? '#dc2626' : '#94a3b8') : '#e0e0e0'}`, backgroundColor: form.obrigatorio === op ? (op === 'SIM' ? '#f0fdf4' : op === 'NÃO' ? '#fef2f2' : '#f1f5f9') : 'white', color: form.obrigatorio === op ? (op === 'SIM' ? '#16a34a' : op === 'NÃO' ? '#dc2626' : '#64748b') : '#555' }}>
                    {op}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 8 }}>
              <button style={btnSecundario} onClick={() => setModal(null)}>Cancelar</button>
              <button style={{ ...btnPrimario, opacity: salvando ? 0.7 : 1 }} onClick={salvar} disabled={salvando}>{salvando ? 'Salvando...' : 'Salvar'}</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ─── ABA EMPRESA ─────────────────────────────────────────────────────────────
function AbaEmpresa() {
  const [empresa, setEmpresa] = useState<ConfigEmpresa | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [editando, setEditando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [form, setForm] = useState({ razao_social: '', cnpj: '', cnae: '', grau_risco: '', endereco: '', numero: '', bairro: '', cidade: '', uf: '', telefone: '' })

  useEffect(() => { carregar() }, [])

  async function carregar() {
    setCarregando(true)
    const { data } = await supabase.from('configuracoes_empresa').select('*').limit(1).single()
    if (data) { setEmpresa(data); setForm({ razao_social: data.razao_social || '', cnpj: data.cnpj || '', cnae: data.cnae || '', grau_risco: data.grau_risco || '', endereco: data.endereco || '', numero: data.numero || '', bairro: data.bairro || '', cidade: data.cidade || '', uf: data.uf || '', telefone: data.telefone || '' }) }
    setCarregando(false)
  }

  async function salvar() {
    setSalvando(true)
    if (empresa) {
      await supabase.from('configuracoes_empresa').update(form).eq('id', empresa.id)
    } else {
      await supabase.from('configuracoes_empresa').insert(form)
    }
    setSalvando(false); setEditando(false); carregar()
  }

  if (carregando) return <p style={{ color: '#888', fontSize: 14 }}>Carregando...</p>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <p style={{ fontSize: 13, color: '#888', margin: 0 }}>Dados da empresa exibidos no ASO</p>
        {!editando && <button style={btnPrimario} onClick={() => setEditando(true)}>✏️ Editar</button>}
      </div>

      {!editando ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {[
            { label: 'Razão Social', value: empresa?.razao_social },
            { label: 'CNPJ', value: empresa?.cnpj },
            { label: 'CNAE', value: empresa?.cnae },
            { label: 'Grau de Risco', value: empresa?.grau_risco },
            { label: 'Endereço', value: empresa?.endereco },
            { label: 'Número', value: empresa?.numero },
            { label: 'Bairro', value: empresa?.bairro },
            { label: 'Cidade', value: empresa?.cidade },
            { label: 'UF', value: empresa?.uf },
            { label: 'Telefone', value: empresa?.telefone },
          ].map(item => (
            <div key={item.label} style={{ backgroundColor: '#f9f9f9', borderRadius: 10, padding: '12px 16px', border: '1px solid #f0f0f0' }}>
              <p style={{ fontSize: 11, color: '#888', margin: '0 0 4px', fontWeight: 500 }}>{item.label}</p>
              <p style={{ fontSize: 14, color: '#333', margin: 0, fontWeight: 500 }}>{item.value || <span style={{ color: '#ccc' }}>—</span>}</p>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div style={{ gridColumn: '1 / -1' }}><label style={labelStyle}>Razão Social</label><input style={inputStyle} value={form.razao_social} onChange={e => setForm(f => ({ ...f, razao_social: e.target.value }))} /></div>
            <div><label style={labelStyle}>CNPJ</label><input style={inputStyle} value={form.cnpj} onChange={e => setForm(f => ({ ...f, cnpj: e.target.value }))} placeholder="00.000.000/0000-00" /></div>
            <div><label style={labelStyle}>CNAE</label><input style={inputStyle} value={form.cnae} onChange={e => setForm(f => ({ ...f, cnae: e.target.value }))} placeholder="0000-0/00" /></div>
            <div><label style={labelStyle}>Grau de Risco</label><select style={inputStyle} value={form.grau_risco} onChange={e => setForm(f => ({ ...f, grau_risco: e.target.value }))}><option value="">Selecione...</option>{['1','2','3','4'].map(g => <option key={g} value={g}>{g}</option>)}</select></div>
            <div><label style={labelStyle}>Telefone</label><input style={inputStyle} value={form.telefone} onChange={e => setForm(f => ({ ...f, telefone: e.target.value }))} placeholder="(00) 0000-0000" /></div>
            <div style={{ gridColumn: '1 / -1' }}><label style={labelStyle}>Endereço</label><input style={inputStyle} value={form.endereco} onChange={e => setForm(f => ({ ...f, endereco: e.target.value }))} /></div>
            <div><label style={labelStyle}>Número</label><input style={inputStyle} value={form.numero} onChange={e => setForm(f => ({ ...f, numero: e.target.value }))} /></div>
            <div><label style={labelStyle}>Bairro</label><input style={inputStyle} value={form.bairro} onChange={e => setForm(f => ({ ...f, bairro: e.target.value }))} /></div>
            <div><label style={labelStyle}>Cidade</label><input style={inputStyle} value={form.cidade} onChange={e => setForm(f => ({ ...f, cidade: e.target.value }))} /></div>
            <div><label style={labelStyle}>UF</label><input style={{ ...inputStyle, maxWidth: 80 }} value={form.uf} onChange={e => setForm(f => ({ ...f, uf: e.target.value.toUpperCase() }))} maxLength={2} /></div>
          </div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 8 }}>
            <button style={btnSecundario} onClick={() => setEditando(false)}>Cancelar</button>
            <button style={{ ...btnPrimario, opacity: salvando ? 0.7 : 1 }} onClick={salvar} disabled={salvando}>{salvando ? 'Salvando...' : 'Salvar'}</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── ABA MÉDICOS ──────────────────────────────────────────────────────────────
function AbaMedicos() {
  const [medicos, setMedicos] = useState<MedicoASO[]>([])
  const [carregando, setCarregando] = useState(true)
  const [modal, setModal] = useState<'novo' | 'editar' | null>(null)
  const [selecionado, setSelecionado] = useState<MedicoASO | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [form, setForm] = useState({ nome: '', crm: '', rqe: '', especialidade: '', telefone: '', ativo: true })

  useEffect(() => { carregar() }, [])
  async function carregar() { setCarregando(true); const { data } = await supabase.from('medicos_aso').select('*').order('created_at', { ascending: false }); setMedicos(data || []); setCarregando(false) }
  function abrirNovo() { setForm({ nome: '', crm: '', rqe: '', especialidade: '', telefone: '', ativo: true }); setSelecionado(null); setModal('novo') }
  function abrirEditar(m: MedicoASO) { setSelecionado(m); setForm({ nome: m.nome, crm: m.crm || '', rqe: m.rqe || '', especialidade: m.especialidade || '', telefone: m.telefone || '', ativo: m.ativo }); setModal('editar') }

  async function salvar() {
    if (!form.nome) return
    setSalvando(true)
    if (modal === 'novo') {
      // Se novo médico for ativo, desativa os demais
      if (form.ativo) await supabase.from('medicos_aso').update({ ativo: false }).eq('ativo', true)
      await supabase.from('medicos_aso').insert(form)
    } else if (selecionado) {
      if (form.ativo) await supabase.from('medicos_aso').update({ ativo: false }).neq('id', selecionado.id)
      await supabase.from('medicos_aso').update(form).eq('id', selecionado.id)
    }
    setSalvando(false); setModal(null); carregar()
  }

  async function ativar(m: MedicoASO) {
    await supabase.from('medicos_aso').update({ ativo: false }).eq('ativo', true)
    await supabase.from('medicos_aso').update({ ativo: true }).eq('id', m.id)
    carregar()
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <p style={{ fontSize: 13, color: '#888', margin: 0 }}>{medicos.length} médico{medicos.length !== 1 ? 's' : ''} cadastrado{medicos.length !== 1 ? 's' : ''} · O médico <strong>ativo</strong> será usado no ASO</p>
        <button style={btnPrimario} onClick={abrirNovo}>+ Novo Médico</button>
      </div>
      {carregando ? <p style={{ color: '#888', fontSize: 14 }}>Carregando...</p> : (
        <div style={{ borderRadius: 12, border: '1px solid #f0f0f0', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: 'white', fontSize: 13 }}>
            <thead><tr style={{ backgroundColor: '#fafafa', borderBottom: '1px solid #f0f0f0' }}>
              {['Nome', 'CRM', 'RQE', 'Especialidade', 'Telefone', 'Status', 'Ações'].map(h => <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 500, color: '#555' }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {medicos.length === 0
                ? <tr><td colSpan={7} style={{ padding: '32px 16px', textAlign: 'center', color: '#aaa', fontSize: 13 }}>Nenhum médico cadastrado.</td></tr>
                : medicos.map((m, i) => (
                  <tr key={m.id} style={{ borderBottom: '1px solid #f5f5f5', backgroundColor: m.ativo ? '#f0fdf4' : (i % 2 === 0 ? 'white' : '#fafafa') }}>
                    <td style={{ padding: '10px 16px', fontWeight: 600, color: '#333' }}>{m.nome}</td>
                    <td style={{ padding: '10px 16px', color: '#666' }}>{m.crm || '—'}</td>
                    <td style={{ padding: '10px 16px', color: '#666' }}>{m.rqe || '—'}</td>
                    <td style={{ padding: '10px 16px', color: '#666' }}>{m.especialidade || '—'}</td>
                    <td style={{ padding: '10px 16px', color: '#666' }}>{m.telefone || '—'}</td>
                    <td style={{ padding: '10px 16px' }}>
                      <span style={{ fontSize: 11, padding: '2px 10px', borderRadius: 99, backgroundColor: m.ativo ? '#dcfce7' : '#f1f5f9', color: m.ativo ? '#15803d' : '#94a3b8', fontWeight: 600 }}>
                        {m.ativo ? '● Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button style={btnSecundario} onClick={() => abrirEditar(m)}>Editar</button>
                        {!m.ativo && <button style={{ ...btnPrimario, padding: '6px 12px', fontSize: 12 }} onClick={() => ativar(m)}>Ativar</button>}
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
      {(modal === 'novo' || modal === 'editar') && (
        <Modal titulo={modal === 'novo' ? 'Novo Médico' : 'Editar Médico'} onFechar={() => setModal(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ gridColumn: '1 / -1' }}><label style={labelStyle}>Nome completo *</label><input style={inputStyle} value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="Ex: DR. JOÃO DA SILVA" autoFocus /></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div><label style={labelStyle}>CRM</label><input style={inputStyle} value={form.crm} onChange={e => setForm(f => ({ ...f, crm: e.target.value }))} placeholder="Ex: 1844-PA" /></div>
              <div><label style={labelStyle}>RQE</label><input style={inputStyle} value={form.rqe} onChange={e => setForm(f => ({ ...f, rqe: e.target.value }))} placeholder="Ex: 6709" /></div>
              <div><label style={labelStyle}>Especialidade</label><input style={inputStyle} value={form.especialidade} onChange={e => setForm(f => ({ ...f, especialidade: e.target.value }))} placeholder="Ex: MÉDICO DO TRABALHO" /></div>
              <div><label style={labelStyle}>Telefone</label><input style={inputStyle} value={form.telefone} onChange={e => setForm(f => ({ ...f, telefone: e.target.value }))} placeholder="(00) 00000-0000" /></div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#555', cursor: 'pointer' }}>
              <input type="checkbox" checked={form.ativo} onChange={e => setForm(f => ({ ...f, ativo: e.target.checked }))} style={{ accentColor: cor }} />
              Definir como médico ativo <span style={{ fontSize: 11, color: '#aaa' }}>(será usado no ASO)</span>
            </label>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 8 }}>
              <button style={btnSecundario} onClick={() => setModal(null)}>Cancelar</button>
              <button style={{ ...btnPrimario, opacity: salvando ? 0.7 : 1 }} onClick={salvar} disabled={salvando}>{salvando ? 'Salvando...' : 'Salvar'}</button>
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
    async function verificar() { const { data: { user } } = await supabase.auth.getUser(); if (!user) { router.push('/login'); return } }
    verificar()
  }, [])

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
    { key: 'gerencias', label: 'Gerências', descricao: 'Gerências e seus responsáveis' },
    { key: 'supervisores', label: 'Supervisores', descricao: 'Cadastro de supervisores' },
    { key: 'gse', label: 'GSE', descricao: 'Grupos Similares de Exposição — funções e exames por tipo de ASO' },
    { key: 'obrigatoriedade_nr', label: 'Obrigatoriedade NR', descricao: 'Funções obrigadas por norma regulamentadora' },
    { key: 'empresa', label: 'Empresa', descricao: 'Dados da empresa exibidos no ASO' },
    { key: 'medicos', label: 'Médicos', descricao: 'Médicos responsáveis pelo PCMSO' },
  ]

  const abaInfo = abas.find(a => a.key === abaAtiva)!

  return (
    <div style={{ fontFamily: 'Arial, sans-serif' }}>
      <h1 style={{ fontSize: 22, fontWeight: 500, color: '#1a1a1a', marginBottom: 4 }}>Configurações</h1>
      <p style={{ fontSize: 14, color: '#888', marginBottom: 28 }}>{abaInfo.descricao}</p>
      <div style={{ display: 'flex', gap: 4, marginBottom: 28, borderBottom: '1px solid #f0f0f0', flexWrap: 'wrap' }}>
        {abas.map(aba => (
          <button key={aba.key} onClick={() => setAbaAtiva(aba.key)} style={{ padding: '10px 20px', fontSize: 13, fontWeight: 500, border: 'none', background: 'none', cursor: 'pointer', color: abaAtiva === aba.key ? cor : '#888', borderBottom: abaAtiva === aba.key ? `2px solid ${cor}` : '2px solid transparent', marginBottom: -1, transition: 'all 0.15s' }}>
            {aba.label}
          </button>
        ))}
      </div>
      {abaAtiva === 'usuarios' && <AbaUsuarios />}
      {abaAtiva === 'bases' && <AbaBases />}
      {abaAtiva === 'funcoes' && <AbaFuncoes />}
      {abaAtiva === 'tipos_exame' && <AbaTiposExame />}
      {abaAtiva === 'gerencias' && <AbaGerencias />}
      {abaAtiva === 'supervisores' && <AbaSupervisores />}
      {abaAtiva === 'gse' && <AbaGSE />}
      {abaAtiva === 'obrigatoriedade_nr' && <AbaObrigatoriedadeNR />}
      {abaAtiva === 'empresa' && <AbaEmpresa />}
      {abaAtiva === 'medicos' && <AbaMedicos />}
    </div>
  )
}