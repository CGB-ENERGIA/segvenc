'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface Colaborador {
  matricula: string
  nome: string
  funcoes: { nome: string } | null
  funcao_id: number | null
  base_id: number | null
  data_admissao: string | null
  data_demissao: string | null
  email_corporativo: string | null
  situacao: string
  bases: { nome: string } | null
}

interface Base { id: number; nome: string }
interface Funcao { id: number; nome: string }

const SITUACOES = ['ATIVO', 'AF.PREVIDENCIA', 'APOS.INVALIDEZ', 'DEMITIDO']
const POR_PAGINA = 50

export default function ColaboradoresPage() {
  const router = useRouter()
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([])
  const [bases, setBases] = useState<Base[]>([])
  const [funcoes, setFuncoes] = useState<Funcao[]>([])
  const [carregando, setCarregando] = useState(true)
  const [filtroBase, setFiltroBase] = useState('')
  const [filtroFuncao, setFiltroFuncao] = useState('')
  const [filtroSituacao, setFiltroSituacao] = useState('ATIVO')
  const [filtroBusca, setFiltroBusca] = useState('')
  const [pagina, setPagina] = useState(1)
  const [total, setTotal] = useState(0)
  const [modalAberto, setModalAberto] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [form, setForm] = useState({
    matricula: '',
    nome: '',
    funcao_id: '',
    base_id: '',
    data_admissao: '',
    data_demissao: '',
    email_corporativo: '',
    situacao: 'ATIVO',
  })
  const [editando, setEditando] = useState<string | null>(null)

  async function buscar(base: string, funcao: string, situacao: string, pag: number = 1) {
    setCarregando(true)
    const from = (pag - 1) * POR_PAGINA
    const to = from + POR_PAGINA - 1

    let q = supabase
      .from('colaboradores')
      .select('matricula, nome, funcao_id, base_id, data_admissao, data_demissao, email_corporativo, situacao, bases(nome), funcoes(nome)', { count: 'exact' })
      .order('nome')
      .range(from, to)

    if (situacao) q = q.eq('situacao', situacao)
    if (base) q = q.eq('base_id', parseInt(base))
    if (funcao) q = q.eq('funcao_id', parseInt(funcao))

    const { data, count } = await q
    setColaboradores((data as unknown as Colaborador[]) || [])
    setTotal(count || 0)
    setCarregando(false)
  }

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const [{ data: b }, { data: f }] = await Promise.all([
        supabase.from('bases').select('id, nome').order('nome'),
        supabase.from('funcoes').select('id, nome').order('nome'),
      ])
      setBases(b || [])
      setFuncoes(f || [])
      await buscar('', '', 'ATIVO', 1)
    }
    init()
  }, [])

  useEffect(() => {
    setPagina(1)
    buscar(filtroBase, filtroFuncao, filtroSituacao, 1)
  }, [filtroBase, filtroFuncao, filtroSituacao])

  const filtrados = filtroBusca
    ? colaboradores.filter(c =>
        c.nome.toLowerCase().includes(filtroBusca.toLowerCase()) ||
        c.matricula.includes(filtroBusca)
      )
    : colaboradores

  function abrirNovo() {
    setEditando(null)
    setForm({ matricula: '', nome: '', funcao_id: '', base_id: '', data_admissao: '', data_demissao: '', email_corporativo: '', situacao: 'ATIVO' })
    setErro(null)
    setModalAberto(true)
  }

  function abrirEdicao(c: Colaborador) {
    setEditando(c.matricula)
    setForm({
      matricula: c.matricula,
      nome: c.nome,
      funcao_id: c.funcao_id?.toString() || '',
      base_id: c.base_id?.toString() || '',
      data_admissao: c.data_admissao || '',
      data_demissao: c.data_demissao || '',
      email_corporativo: c.email_corporativo || '',
      situacao: c.situacao,
    })
    setErro(null)
    setModalAberto(true)
  }

  async function salvar() {
    if (!form.nome || !form.matricula) { setErro('Nome e matricula sao obrigatorios.'); return }
    setSalvando(true)
    setErro(null)

    const payload = {
      matricula: form.matricula,
      nome: form.nome.toUpperCase(),
      funcao_id: form.funcao_id ? parseInt(form.funcao_id) : null,
      base_id: form.base_id ? parseInt(form.base_id) : null,
      data_admissao: form.data_admissao || null,
      data_demissao: form.data_demissao || null,
      email_corporativo: form.email_corporativo || null,
      situacao: form.situacao,
    }

    if (editando) {
      const { error } = await supabase.from('colaboradores').update(payload).eq('matricula', editando)
      if (error) { setErro('Erro ao salvar: ' + error.message); setSalvando(false); return }
    } else {
      const { error } = await supabase.from('colaboradores').insert(payload)
      if (error) { setErro('Erro ao cadastrar: ' + error.message); setSalvando(false); return }
    }

    setSalvando(false)
    setModalAberto(false)
    await buscar(filtroBase, filtroFuncao, filtroSituacao, pagina)
  }

  const totalPaginas = Math.ceil(total / POR_PAGINA)

  const inputStyle = {
    width: '100%',
    height: 38,
    border: '1px solid #e0e0e0',
    borderRadius: 8,
    padding: '0 12px',
    fontSize: 13,
    color: '#333',
    backgroundColor: '#fafafa',
    outline: 'none',
    boxSizing: 'border-box' as const,
  }

  const labelStyle = {
    display: 'block' as const,
    fontSize: 12,
    color: '#666',
    marginBottom: 5,
  }

  return (
    <div style={{ fontFamily: 'Arial, sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 500, color: '#1a1a1a', marginBottom: 4 }}>Colaboradores</h1>
          <p style={{ fontSize: 14, color: '#888', margin: 0 }}>Gestão de colaboradores da CGB</p>
        </div>
        <button onClick={abrirNovo} style={{
          height: 38, backgroundColor: '#9f183c', color: 'white',
          border: 'none', borderRadius: 8, padding: '0 20px',
          fontSize: 13, fontWeight: 500, cursor: 'pointer',
        }}>
          + Novo Colaborador
        </button>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' as const }}>
        <input
          type="text"
          placeholder="Buscar por nome ou matricula..."
          value={filtroBusca}
          onChange={e => setFiltroBusca(e.target.value)}
          style={{ ...inputStyle, width: 260 }}
        />
        <select value={filtroBase} onChange={e => setFiltroBase(e.target.value)}
          style={{ ...inputStyle, width: 180 }}>
          <option value="">Todas as bases</option>
          {bases.map(b => <option key={b.id} value={b.id}>{b.nome}</option>)}
        </select>
        <select value={filtroFuncao} onChange={e => setFiltroFuncao(e.target.value)}
          style={{ ...inputStyle, width: 220 }}>
          <option value="">Todas as funções</option>
          {funcoes.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
        </select>
        <select value={filtroSituacao} onChange={e => setFiltroSituacao(e.target.value)}
          style={{ ...inputStyle, width: 160 }}>
          <option value="">Todas as situações</option>
          {SITUACOES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <span style={{ fontSize: 13, color: '#888', alignSelf: 'center' }}>
          {total} colaboradores
        </span>
      </div>

      {carregando ? (
        <p style={{ color: '#888', fontSize: 14 }}>Carregando...</p>
      ) : (
        <>
          <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid #f0f0f0' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: 'white', fontSize: 13 }}>
              <thead>
                <tr style={{ backgroundColor: '#fafafa', borderBottom: '1px solid #f0f0f0' }}>
                  {['Nome', 'Matrícula', 'Função', 'Base', 'Admissão', 'E-mail', 'Situação', ''].map((h, i) => (
                    <th key={i} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 500, color: '#555', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtrados.map((c, i) => (
                  <tr key={c.matricula} style={{ borderBottom: '1px solid #f5f5f5', backgroundColor: i % 2 === 0 ? 'white' : '#fafafa' }}>
                    <td style={{ padding: '10px 16px', fontWeight: 500, color: '#333' }}>{c.nome}</td>
                    <td style={{ padding: '10px 16px', color: '#666' }}>{c.matricula}</td>
                    <td style={{ padding: '10px 16px', color: '#666' }}>{c.funcoes?.nome || '—'}</td>
                    <td style={{ padding: '10px 16px', color: '#666', whiteSpace: 'nowrap' }}>{c.bases?.nome || '—'}</td>
                    <td style={{ padding: '10px 16px', color: '#666', whiteSpace: 'nowrap' }}>
                      {c.data_admissao ? new Date(c.data_admissao + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}
                    </td>
                    <td style={{ padding: '10px 16px', color: '#666' }}>{c.email_corporativo || '—'}</td>
                    <td style={{ padding: '10px 16px' }}>
                      <span style={{
                        fontSize: 11, padding: '2px 8px', borderRadius: 99,
                        backgroundColor: c.situacao === 'ATIVO' ? '#f0fdf4' : '#fef2f2',
                        color: c.situacao === 'ATIVO' ? '#16a34a' : '#dc2626',
                      }}>{c.situacao}</span>
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <button onClick={() => abrirEdicao(c)} style={{
                        fontSize: 12, color: '#9f183c', background: 'none',
                        border: '1px solid #9f183c', borderRadius: 6,
                        padding: '4px 12px', cursor: 'pointer',
                      }}>Editar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* PAGINAÇÃO */}
          {total > POR_PAGINA && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 0' }}>
              <span style={{ fontSize: 13, color: '#888' }}>
                Mostrando {((pagina - 1) * POR_PAGINA) + 1}–{Math.min(pagina * POR_PAGINA, total)} de {total}
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => { const p = pagina - 1; setPagina(p); buscar(filtroBase, filtroFuncao, filtroSituacao, p) }}
                  disabled={pagina === 1}
                  style={{ height: 34, padding: '0 16px', border: '1px solid #e0e0e0', borderRadius: 8, fontSize: 13, cursor: pagina === 1 ? 'not-allowed' : 'pointer', backgroundColor: 'white', color: pagina === 1 ? '#ccc' : '#333' }}
                >
                  Anterior
                </button>
                <span style={{ height: 34, padding: '0 16px', display: 'flex', alignItems: 'center', fontSize: 13, color: '#555' }}>
                  Página {pagina} de {totalPaginas}
                </span>
                <button
                  onClick={() => { const p = pagina + 1; setPagina(p); buscar(filtroBase, filtroFuncao, filtroSituacao, p) }}
                  disabled={pagina >= totalPaginas}
                  style={{ height: 34, padding: '0 16px', border: '1px solid #e0e0e0', borderRadius: 8, fontSize: 13, cursor: pagina >= totalPaginas ? 'not-allowed' : 'pointer', backgroundColor: 'white', color: pagina >= totalPaginas ? '#ccc' : '#333' }}
                >
                  Próxima
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {modalAberto && (
        <div style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
        }}>
          <div style={{
            backgroundColor: 'white', borderRadius: 16, padding: 32,
            width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
              <h2 style={{ fontSize: 18, fontWeight: 500, margin: 0 }}>
                {editando ? 'Editar Colaborador' : 'Novo Colaborador'}
              </h2>
              <button onClick={() => setModalAberto(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#888' }}>x</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>Nome completo *</label>
                <input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} style={inputStyle} placeholder="Nome do colaborador" />
              </div>
              <div>
                <label style={labelStyle}>Matrícula *</label>
                <input value={form.matricula} onChange={e => setForm({ ...form, matricula: e.target.value })} style={inputStyle} placeholder="Ex: 12345" disabled={!!editando} />
              </div>
              <div>
                <label style={labelStyle}>Situação</label>
                <select value={form.situacao} onChange={e => setForm({ ...form, situacao: e.target.value })} style={inputStyle}>
                  {SITUACOES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Função</label>
                <select value={form.funcao_id} onChange={e => setForm({ ...form, funcao_id: e.target.value })} style={inputStyle}>
                  <option value="">Selecione...</option>
                  {funcoes.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Base</label>
                <select value={form.base_id} onChange={e => setForm({ ...form, base_id: e.target.value })} style={inputStyle}>
                  <option value="">Selecione...</option>
                  {bases.map(b => <option key={b.id} value={b.id}>{b.nome}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Data de Admissão</label>
                <input type="date" value={form.data_admissao} onChange={e => setForm({ ...form, data_admissao: e.target.value })} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Data de Demissão</label>
                <input type="date" value={form.data_demissao} onChange={e => setForm({ ...form, data_demissao: e.target.value })} style={inputStyle} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>E-mail corporativo</label>
                <input type="email" value={form.email_corporativo} onChange={e => setForm({ ...form, email_corporativo: e.target.value })} style={inputStyle} placeholder="email@cgbengenharia.com.br" />
              </div>
            </div>

            {erro && (
              <div style={{ marginTop: 16, fontSize: 13, color: '#b91c1c', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px' }}>
                {erro}
              </div>
            )}

            <div style={{ display: 'flex', gap: 12, marginTop: 24, justifyContent: 'flex-end' }}>
              <button onClick={() => setModalAberto(false)} style={{
                height: 38, padding: '0 20px', border: '1px solid #e0e0e0',
                borderRadius: 8, fontSize: 13, cursor: 'pointer', background: 'white', color: '#555',
              }}>
                Cancelar
              </button>
              <button onClick={salvar} disabled={salvando} style={{
                height: 38, padding: '0 24px', backgroundColor: '#9f183c',
                color: 'white', border: 'none', borderRadius: 8,
                fontSize: 13, fontWeight: 500, cursor: 'pointer',
                opacity: salvando ? 0.7 : 1,
              }}>
                {salvando ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}