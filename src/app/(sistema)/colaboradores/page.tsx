'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'

interface Colaborador {
  matricula: string
  nome: string
  funcoes: { nome: string } | null
  funcao_id: number | null
  base_id: number | null
  gerencia_id: number | null
  contato: string | null
  processo: string | null
  data_admissao: string | null
  data_demissao: string | null
  email_corporativo: string | null
  situacao: string
  gerencia: string | null
  supervisor: string | null
  bases: { nome: string } | null
}

interface Base { id: number; nome: string }
interface Funcao { id: number; nome: string }
interface Gerencia {
  id: number
  sigla: string
  nome: string
  gerente_matricula: string | null
  colaboradores?: { nome: string } | null
}

type OrdemColuna = 'nome' | 'matricula' | 'funcao' | 'base' | 'gerencia' |  'supervisor' | 'admissao' |  'demissao' | 'situacao' 
type OrdemDirecao = 'asc' | 'desc'
type FiltroCard = 'ATIVO' | 'AF.PREVIDÊNCIA' | 'FÉRIAS' | 'AVISO PRÉVIO' | 'LICENÇA MATERNIDADE' | 'DEMITIDO' | null

const SITUACOES = ['ATIVO', 'AF.PREVIDÊNCIA', 'AVISO PRÉVIO', 'FÉRIAS', 'LICENÇA MATERNIDADE', 'DEMITIDO']
const POR_PAGINA = 50
const COR = '#9f183c'

// ─── TH ORDENÁVEL ────────────────────────────────────────────────────────────

function ThOrdenavel({ label, coluna, ordemAtual, direcao, onClick, style }: {
  label: string; coluna: OrdemColuna; ordemAtual: OrdemColuna
  direcao: OrdemDirecao; onClick: (col: OrdemColuna) => void; style?: React.CSSProperties
}) {
  const ativo = ordemAtual === coluna
  return (
    <th onClick={() => onClick(coluna)} style={{
      padding: '10px 16px', textAlign: 'left', fontWeight: 700,
      color: ativo ? COR : '#333', whiteSpace: 'nowrap',
      cursor: 'pointer', userSelect: 'none',
      borderBottom: ativo ? `2px solid ${COR}` : '2px solid transparent',
      position: 'sticky', top: 0, backgroundColor: '#fafafa', zIndex: 3,
      ...style,
    }}>
      {label} {ativo ? (direcao === 'asc' ? '↑' : '↓') : <span style={{ color: '#ccc' }}>↕</span>}
    </th>
  )
}

// ─── PÁGINA PRINCIPAL ─────────────────────────────────────────────────────────

export default function ColaboradoresPage() {
  const router = useRouter()
  const { usuario } = useAuth()
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([])
  const [bases, setBases] = useState<Base[]>([])
  const [funcoes, setFuncoes] = useState<Funcao[]>([])
  const [gerencias, setGerencias] = useState<Gerencia[]>([])
  const [carregando, setCarregando] = useState(true)
  const [filtroBase, setFiltroBase] = useState('')
  const [filtroFuncao, setFiltroFuncao] = useState('')
  const [filtroSituacao, setFiltroSituacao] = useState('ATIVO')
  const [filtroBusca, setFiltroBusca] = useState('')
  const [filtroCard, setFiltroCard] = useState<FiltroCard>(null)
  const [pagina, setPagina] = useState(1)
  const [total, setTotal] = useState(0)

  const [statsTotal, setStatsTotal] = useState(0)
  const [statsAtivo, setStatsAtivo] = useState(0)
  const [statsAfastado, setStatsAfastado] = useState(0)
  const [statsFerias, setStatsFerias] = useState(0)
  const [statsAviso, setStatsAviso] = useState(0)
  const [statsLicenca, setStatsLicenca] = useState(0)
  const [statsDemitido, setStatsDemitido] = useState(0)
  const [carregandoStats, setCarregandoStats] = useState(true)

  const [modalAberto, setModalAberto] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [ordemColuna, setOrdemColuna] = useState<OrdemColuna>('nome')
  const [ordemDirecao, setOrdemDirecao] = useState<OrdemDirecao>('asc')
  const [form, setForm] = useState({
    matricula: '', nome: '', funcao_id: '', base_id: '',
    gerencia_id: '', contato: '', processo: '',
    data_admissao: '', data_demissao: '', email_corporativo: '', situacao: 'ATIVO',
  })
  const [editando, setEditando] = useState<string | null>(null)
  const [modalExcluirAberto, setModalExcluirAberto] = useState(false)
  const [confirmacaoMatricula, setConfirmacaoMatricula] = useState('')
  const [excluindo, setExcluindo] = useState(false)
  const [erroExcluir, setErroExcluir] = useState<string | null>(null)

// ─── BUSCA STATS ─────────────────────────────────────────────────────────

async function buscarStats() {
  setCarregandoStats(true)
  let todos: any[] = []; let from = 0
  while (true) {
    const { data } = await supabase.from('colaboradores').select('situacao').range(from, from + 999)
    if (!data || data.length === 0) break
    todos = [...todos, ...data]
    if (data.length < 1000) break
    from += 1000
  }
  setStatsTotal(todos.length)
  setStatsAtivo(todos.filter(c => c.situacao === 'ATIVO').length)
  setStatsAfastado(todos.filter(c => c.situacao === 'AF.PREVIDÊNCIA').length)
  setStatsFerias(todos.filter(c => c.situacao === 'FÉRIAS').length)
  setStatsAviso(todos.filter(c => c.situacao === 'AVISO PRÉVIO').length)
  setStatsLicenca(todos.filter(c => c.situacao === 'LICENÇA MATERNIDADE').length)
  setStatsDemitido(todos.filter(c => c.situacao === 'DEMITIDO').length)
  setCarregandoStats(false)
}

  // ─── BUSCA TABELA ─────────────────────────────────────────────────────────

  async function buscar(base: string, funcao: string, situacao: string, pag: number = 1, busca: string = '') {
    setCarregando(true)
    const from = (pag - 1) * POR_PAGINA
    const to = from + POR_PAGINA - 1

    let q = supabase
      .from('colaboradores')
      .select(
       'matricula, nome, funcao_id, base_id, gerencia_id, contato, processo, data_admissao, data_demissao, email_corporativo, situacao, gerencia, supervisor, bases(nome), funcoes(nome)',
       { count: 'exact' }
    )
      .order('nome')
      .range(from, to)

    if (situacao) q = q.eq('situacao', situacao)
    if (base) q = q.eq('base_id', parseInt(base))
    if (funcao) q = q.eq('funcao_id', parseInt(funcao))
    if (busca) q = q.or(`nome.ilike.%${busca}%,matricula.ilike.%${busca}%`)

    const { data, count } = await q
    setColaboradores((data as unknown as Colaborador[]) || [])
    setTotal(count || 0)
    setCarregando(false)
  }

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const [{ data: b }, { data: f }, { data: g }] = await Promise.all([
        supabase.from('bases').select('id, nome').order('nome'),
        supabase.from('funcoes').select('id, nome').order('nome'),
        supabase.from('gerencias').select('id, sigla, nome, gerente_matricula, colaboradores(nome)').order('sigla'),
      ])
      setBases(b || [])
      setFuncoes(f || [])
      setGerencias((g as unknown as Gerencia[]) || [])
      await Promise.all([buscar('', '', 'ATIVO', 1, ''), buscarStats()])
    }
    init()
  }, [])

  useEffect(() => {
    setPagina(1)
    buscar(filtroBase, filtroFuncao, filtroSituacao, 1, filtroBusca)
  }, [filtroBase, filtroFuncao, filtroSituacao, filtroBusca])

  function handleCard(status: FiltroCard) {
    if (filtroCard === status) { setFiltroCard(null); setFiltroSituacao('') }
    else { setFiltroCard(status); setFiltroSituacao(status || '') }
    setPagina(1)
  }

  function toggleOrdem(coluna: OrdemColuna) {
    if (ordemColuna === coluna) setOrdemDirecao(d => d === 'asc' ? 'desc' : 'asc')
    else { setOrdemColuna(coluna); setOrdemDirecao('asc') }
  }

  function limparFiltros() {
    setFiltroBusca(''); setFiltroBase(''); setFiltroFuncao('')
    setFiltroSituacao('ATIVO'); setFiltroCard(null); setPagina(1)
  }

  const ordenados = [...colaboradores].sort((a, b) => {
    let vA = '', vB = ''
    if (ordemColuna === 'nome') { vA = a.nome; vB = b.nome }
    else if (ordemColuna === 'matricula') { vA = a.matricula; vB = b.matricula }
    else if (ordemColuna === 'funcao') { vA = a.funcoes?.nome || ''; vB = b.funcoes?.nome || '' }
    else if (ordemColuna === 'base') { vA = a.bases?.nome || ''; vB = b.bases?.nome || '' }
    else if (ordemColuna === 'supervisor') { vA = a.supervisor || ''; vB = b.supervisor || '' }
    else if (ordemColuna === 'admissao') { vA = a.data_admissao || ''; vB = b.data_admissao || '' }
    else if (ordemColuna === 'demissao') { vA = a.data_demissao || ''; vB = b.data_demissao || '' }
    else if (ordemColuna === 'situacao') { vA = a.situacao; vB = b.situacao }
    return ordemDirecao === 'asc' ? vA.localeCompare(vB) : vB.localeCompare(vA)
  })

  function abrirNovo() {
    setEditando(null)
    setForm({
      matricula: '', nome: '', funcao_id: '', base_id: '',
      gerencia_id: '', contato: '', processo: '',
      data_admissao: '', data_demissao: '', email_corporativo: '', situacao: 'ATIVO',
    })
    setErro(null)
    setModalAberto(true)
  }

  function abrirEdicao(c: Colaborador) {
    setEditando(c.matricula)
    setForm({
      matricula: c.matricula, nome: c.nome,
      funcao_id: c.funcao_id?.toString() || '',
      base_id: c.base_id?.toString() || '',
      gerencia_id: c.gerencia_id?.toString() || '',
      contato: c.contato || '',
      processo: c.processo || '',
      data_admissao: c.data_admissao || '',
      data_demissao: c.data_demissao || '',
      email_corporativo: c.email_corporativo || '',
      situacao: c.situacao,
    })
    setErro(null)
    setModalAberto(true)
  }

  async function salvar() {
    if (!form.nome || !form.matricula) { setErro('Nome e matrícula são obrigatórios.'); return }
    setSalvando(true); setErro(null)
    const payload = {
      matricula: form.matricula, nome: form.nome.toUpperCase(),
      funcao_id: form.funcao_id ? parseInt(form.funcao_id) : null,
      base_id: form.base_id ? parseInt(form.base_id) : null,
      gerencia_id: form.gerencia_id ? parseInt(form.gerencia_id) : null,
      contato: form.contato || null,
      processo: form.processo || null,
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
    await Promise.all([buscar(filtroBase, filtroFuncao, filtroSituacao, pagina, filtroBusca), buscarStats()])
  }

  async function excluir() {
    if (confirmacaoMatricula !== editando) { setErroExcluir('Matrícula incorreta. Digite exatamente como mostrado.'); return }
    setExcluindo(true); setErroExcluir(null)
    const { error } = await supabase.from('colaboradores').delete().eq('matricula', editando!)
    if (error) { setErroExcluir('Erro ao excluir: ' + error.message); setExcluindo(false); return }
    setExcluindo(false)
    setModalExcluirAberto(false)
    setModalAberto(false)
    await Promise.all([buscar(filtroBase, filtroFuncao, filtroSituacao, pagina, filtroBusca), buscarStats()])
  }

  const totalPaginas = Math.ceil(total / POR_PAGINA)
  const temFiltroAtivo = !!(filtroBusca || filtroBase || filtroFuncao || filtroCard || filtroSituacao !== 'ATIVO')

  const corSituacao = (s: string) => {
    if (s === 'ATIVO') return { bg: '#f0fdf4', cor: '#16a34a' }
    if (s === 'AF.PREVIDENCIA') return { bg: '#fffbeb', cor: '#b45309' }
    if (s === 'APOS.INVALIDEZ') return { bg: '#eff6ff', cor: '#2563eb' }
    return { bg: '#fef2f2', cor: '#dc2626' }
  }

  const gerenciaSelecionada = gerencias.find(g => g.id.toString() === form.gerencia_id)

  const inputStyle: React.CSSProperties = {
    width: '100%', height: 38, border: '1px solid #e0e0e0', borderRadius: 8,
    padding: '0 12px', fontSize: 13, color: '#333', backgroundColor: '#fafafa',
    outline: 'none', boxSizing: 'border-box',
  }
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, color: '#666', marginBottom: 5 }
  const selectStyle: React.CSSProperties = {
    height: 38, border: '1px solid #e0e0e0', borderRadius: 8,
    padding: '0 12px', fontSize: 13, backgroundColor: 'white', color: '#555',
    outline: 'none', boxSizing: 'border-box',
  }

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* CABEÇALHO */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h1 style={{ fontSize: 18, fontWeight: 600, color: '#1a1a1a', margin: 0 }}>Colaboradores</h1>
        <button onClick={abrirNovo} style={{
          height: 36, backgroundColor: COR, color: 'white',
          border: 'none', borderRadius: 8, padding: '0 18px',
          fontSize: 13, fontWeight: 500, cursor: 'pointer',
        }}>
          + Novo Colaborador
        </button>
      </div>

      {/* CARDS */}
      {carregandoStats ? (
        <div style={{ display: 'flex', gap: 12, marginBottom: 12, overflowX: 'auto', paddingBottom: 4 }}>
          {[...Array(5)].map((_, i) => (
            <div key={i} style={{ backgroundColor: 'white', borderRadius: 10, padding: '10px 16px', border: '1px solid #f0f0f0', minWidth: 140, flex: '1 0 140px' }}>
              <div style={{ height: 10, backgroundColor: '#f0f0f0', borderRadius: 4, marginBottom: 8, width: '60%' }} />
              <div style={{ height: 24, backgroundColor: '#f0f0f0', borderRadius: 4, width: '40%' }} />
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 12, marginBottom: 12, overflowX: 'auto', paddingBottom: 4 }}>
          {[
        { label: 'Total',              valor: statsTotal,    cor: '#4a4a49', status: null },
        { label: 'Ativos',             valor: statsAtivo,    cor: '#16a34a', status: 'ATIVO' as FiltroCard },
        { label: 'AF. Previdência',    valor: statsAfastado, cor: '#b45309', status: 'AF.PREVIDÊNCIA' as FiltroCard },
        { label: 'Férias',             valor: statsFerias,   cor: '#0284c7', status: 'FÉRIAS' as FiltroCard },
        { label: 'Aviso Prévio',       valor: statsAviso,    cor: '#7c3aed', status: 'AVISO PRÉVIO' as FiltroCard },
        { label: 'Licença Maternidade',valor: statsLicenca,  cor: '#db2777', status: 'LICENÇA MATERNIDADE' as FiltroCard },
        { label: 'Demitidos',          valor: statsDemitido, cor: '#dc2626', status: 'DEMITIDO' as FiltroCard },
          ].map((card, i) => {
            const ativo = filtroCard === card.status && card.status !== null
            return (
              <div
                key={i}
                onClick={() => card.status !== null && handleCard(card.status)}
                style={{
                  backgroundColor: ativo ? card.cor + '12' : 'white',
                  borderRadius: 10, padding: '10px 16px',
                  border: ativo ? `2px solid ${card.cor}` : '1px solid #f0f0f0',
                  minWidth: 140, flex: '1 0 140px',
                  cursor: card.status !== null ? 'pointer' : 'default',
                  transition: 'all 0.15s ease',
                  boxShadow: ativo ? `0 2px 8px ${card.cor}30` : 'none',
                }}
              >
                <p style={{ fontSize: 11, color: '#888', margin: '0 0 4px' }}>
                  {card.label}
                  {ativo && <span style={{ marginLeft: 6, fontSize: 10, color: card.cor }}>● filtrado</span>}
                </p>
                <p style={{ fontSize: 24, fontWeight: 600, color: card.cor, margin: 0 }}>
                  {card.valor.toLocaleString('pt-BR')}
                </p>
              </div>
            )
          })}
        </div>
      )}

      {/* FILTROS */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="text" placeholder="🔍BUSCAR NOME OU MATRICULA" value={filtroBusca}
          onChange={e => setFiltroBusca(e.target.value)}
          style={{ ...selectStyle, width: 260 }} />
        <select value={filtroBase} onChange={e => setFiltroBase(e.target.value)} style={{ ...selectStyle, width: 180 }}>
          <option value="">TODAS AS BASES</option>
          {bases.map(b => <option key={b.id} value={b.id}>{b.nome}</option>)}
        </select>
        <select value={filtroFuncao} onChange={e => setFiltroFuncao(e.target.value)} style={{ ...selectStyle, width: 220 }}>
          <option value="">TODAS AS FUNCÕES</option>
          {funcoes.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
        </select>
        <select value={filtroSituacao} onChange={e => { setFiltroSituacao(e.target.value); setFiltroCard(null) }} style={{ ...selectStyle, width: 160 }}>
          <option value="">TODAS AS SITUAÇÕES</option>
          {SITUACOES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <div style={{ flex: 1 }} />
        {temFiltroAtivo && (
          <button onClick={limparFiltros} style={{
            height: 36, padding: '0 12px', fontSize: 12,
            border: '1px solid #fca5a5', borderRadius: 8,
            backgroundColor: '#fef2f2', color: '#dc2626', cursor: 'pointer',
          }}>✕ Limpar</button>
        )}
      </div>

      {/* TABELA */}
      {carregando ? (
        <p style={{ color: '#888', fontSize: 14 }}>Carregando...</p>
      ) : (
        <>
          <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 280px)', borderRadius: 12, border: '1px solid #f0f0f0', flex: 1 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: 'white', fontSize: 13 }}>
              <thead>
                <tr style={{ backgroundColor: '#fafafa', borderBottom: '1px solid #f0f0f0' }}>
                  <ThOrdenavel label="Nome" coluna="nome" ordemAtual={ordemColuna} direcao={ordemDirecao} onClick={toggleOrdem} style={{ minWidth: 200 }} />
                  <ThOrdenavel label="Matrícula" coluna="matricula" ordemAtual={ordemColuna} direcao={ordemDirecao} onClick={toggleOrdem} />
                  <ThOrdenavel label="Função" coluna="funcao" ordemAtual={ordemColuna} direcao={ordemDirecao} onClick={toggleOrdem} />
                  <ThOrdenavel label="Base" coluna="base" ordemAtual={ordemColuna} direcao={ordemDirecao} onClick={toggleOrdem} />
                  <ThOrdenavel label="Gerência" coluna="gerencia" ordemAtual={ordemColuna} direcao={ordemDirecao} onClick={toggleOrdem} />
                  <ThOrdenavel label="Supervisor" coluna="supervisor" ordemAtual={ordemColuna} direcao={ordemDirecao} onClick={toggleOrdem} />
                  <ThOrdenavel label="Admissão" coluna="admissao" ordemAtual={ordemColuna} direcao={ordemDirecao} onClick={toggleOrdem} />
                  <ThOrdenavel label="Demissão" coluna="demissao" ordemAtual={ordemColuna} direcao={ordemDirecao} onClick={toggleOrdem} />
                  <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 700, color: '#333', whiteSpace: 'nowrap', position: 'sticky', top: 0, backgroundColor: '#fafafa', zIndex: 3 }}>E-mail</th>
                  <ThOrdenavel label="Situação" coluna="situacao" ordemAtual={ordemColuna} direcao={ordemDirecao} onClick={toggleOrdem} />
                  <th style={{ padding: '10px 16px', position: 'sticky', top: 0, backgroundColor: '#fafafa', zIndex: 3 }} />
                </tr>
              </thead>
              <tbody>
                {ordenados.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ padding: '48px 16px', textAlign: 'center', color: '#aaa', fontSize: 14 }}>
                      <p style={{ fontSize: 28, margin: '0 0 8px' }}>👤</p>
                      Nenhum colaborador encontrado.
                    </td>
                  </tr>
                ) : ordenados.map((c, i) => {
                  const cor = corSituacao(c.situacao)
                  return (
                    <tr key={c.matricula} style={{ borderBottom: '1px solid #f5f5f5', backgroundColor: i % 2 === 0 ? 'white' : '#fafafa' }}>
                      <td style={{ padding: '10px 16px', fontWeight: 500, color: '#333', whiteSpace: 'nowrap' }}>{c.nome}</td>
                      <td style={{ padding: '10px 16px', color: '#666' }}>{c.matricula}</td>
                      <td style={{ padding: '10px 16px', color: '#666', whiteSpace: 'nowrap' }}>{c.funcoes?.nome || '—'}</td>
                      <td style={{ padding: '10px 16px', color: '#666', whiteSpace: 'nowrap' }}>{c.bases?.nome || '—'}</td>
                      <td style={{ padding: '10px 16px', color: '#666', whiteSpace: 'nowrap' }}>
                       {c.gerencia
                   ? <span style={{ fontSize: 11, backgroundColor: '#fdf2f5', color: COR, padding: '2px 8px', borderRadius: 99, fontWeight: 600 }}>{c.gerencia}</span>
                  : '—'}
                  </td>
                 <td style={{ padding: '10px 16px', color: '#666', whiteSpace: 'nowrap' }}>
      {c.supervisor ? c.supervisor.trim().split(' ')[0] : '—'}
</td>
<td style={{ padding: '10px 16px', color: '#666', whiteSpace: 'nowrap' }}>
  {c.data_admissao ? new Date(c.data_admissao + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}
</td>
                      <td style={{ padding: '10px 16px', color: '#666', whiteSpace: 'nowrap' }}>
                      {c.data_demissao ? new Date(c.data_demissao + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}
                      </td>
                      <td style={{ padding: '10px 16px', color: '#666' }}>{c.email_corporativo || '—'}</td>
                      <td style={{ padding: '10px 16px' }}>
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, backgroundColor: cor.bg, color: cor.cor }}>
                          {c.situacao}
                        </span>
                      </td>
                      <td style={{ padding: '10px 16px' }}>
                        <button onClick={() => abrirEdicao(c)} style={{
                          fontSize: 12, color: COR, background: 'none',
                          border: `1px solid ${COR}`, borderRadius: 6,
                          padding: '4px 12px', cursor: 'pointer',
                        }}>Editar</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* PAGINAÇÃO */}
          {total > POR_PAGINA && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, paddingTop: 16 }}>
              <button
                onClick={() => { const p = pagina - 1; setPagina(p); buscar(filtroBase, filtroFuncao, filtroSituacao, p, filtroBusca) }}
                disabled={pagina === 1}
                style={{ height: 32, padding: '0 14px', borderRadius: 8, border: '1px solid #e0e0e0', backgroundColor: 'white', fontSize: 13, cursor: pagina === 1 ? 'not-allowed' : 'pointer', color: pagina === 1 ? '#ccc' : '#555' }}
              >← Anterior</button>

              {Array.from({ length: totalPaginas }, (_, i) => i + 1)
                .filter(p => p === 1 || p === totalPaginas || Math.abs(p - pagina) <= 1)
                .reduce<(number | '...')[]>((acc, p, idx, arr) => {
                  if (idx > 0 && typeof arr[idx - 1] === 'number' && (p as number) - (arr[idx - 1] as number) > 1) acc.push('...')
                  acc.push(p)
                  return acc
                }, [])
                .map((p, idx) => p === '...'
                  ? <span key={`ellipsis-${idx}`} style={{ fontSize: 13, color: '#aaa', padding: '0 4px' }}>…</span>
                  : (
                    <button key={p} onClick={() => { setPagina(p as number); buscar(filtroBase, filtroFuncao, filtroSituacao, p as number, filtroBusca) }} style={{
                      height: 32, width: 32, borderRadius: 8, fontSize: 13, cursor: 'pointer',
                      border: pagina === p ? `2px solid ${COR}` : '1px solid #e0e0e0',
                      backgroundColor: pagina === p ? '#fdf2f5' : 'white',
                      color: pagina === p ? COR : '#555', fontWeight: pagina === p ? 600 : 400,
                    }}>{p}</button>
                  )
                )}

              <button
                onClick={() => { const p = pagina + 1; setPagina(p); buscar(filtroBase, filtroFuncao, filtroSituacao, p, filtroBusca) }}
                disabled={pagina >= totalPaginas}
                style={{ height: 32, padding: '0 14px', borderRadius: 8, border: '1px solid #e0e0e0', backgroundColor: 'white', fontSize: 13, cursor: pagina >= totalPaginas ? 'not-allowed' : 'pointer', color: pagina >= totalPaginas ? '#ccc' : '#555' }}
              >Próxima →</button>

              <span style={{ fontSize: 12, color: '#888', marginLeft: 8 }}>
                Mostrando {((pagina - 1) * POR_PAGINA) + 1}–{Math.min(pagina * POR_PAGINA, total)} de {total}
              </span>
            </div>
          )}
        </>
      )}

      {/* MODAL EDITAR/NOVO */}
      {modalAberto && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ backgroundColor: 'white', borderRadius: 16, padding: 32, width: '100%', maxWidth: 580, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
              <div>
                <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0, color: '#1a1a1a' }}>{editando ? 'Editar Colaborador' : 'Novo Colaborador'}</h2>
                {editando && <p style={{ fontSize: 13, color: '#888', margin: '3px 0 0' }}>Matrícula: {editando}</p>}
              </div>
              <button onClick={() => setModalAberto(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#aaa' }}>✕</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>Nome completo *</label>
                <input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} style={inputStyle} placeholder="Nome do colaborador" />
              </div>
              <div>
                <label style={labelStyle}>Matrícula *</label>
                <input value={form.matricula} onChange={e => setForm({ ...form, matricula: e.target.value })} style={{ ...inputStyle, backgroundColor: editando ? '#f5f5f5' : '#fafafa', color: editando ? '#aaa' : '#333' }} placeholder="Ex: 12345" disabled={!!editando} />
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
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>Gerência</label>
                <select value={form.gerencia_id} onChange={e => setForm({ ...form, gerencia_id: e.target.value })} style={inputStyle}>
                  <option value="">Selecione...</option>
                  {gerencias.map(g => <option key={g.id} value={g.id}>{g.sigla} — {g.nome}</option>)}
                </select>
                {gerenciaSelecionada?.colaboradores?.nome && (
                  <p style={{ fontSize: 11, color: '#888', margin: '4px 0 0' }}>
                    Gerente: {gerenciaSelecionada.colaboradores.nome}
                  </p>
                )}
              </div>
              <div>
                <label style={labelStyle}>Contato (telefone)</label>
                <input value={form.contato} onChange={e => setForm({ ...form, contato: e.target.value })} style={inputStyle} placeholder="(69) 99999-9999" />
              </div>
              <div>
              <div>
               <label style={labelStyle}>Processo</label>
               <select value={form.processo} onChange={e => setForm({ ...form, processo: e.target.value })} style={inputStyle}>
               <option value="">Selecione...</option>
                 {[
                    'Administrativo', 'Almoxarifado', 'Construção', 'Corte e Religação',
                    'Frota', 'Inspeção', 'Ligação Nova', 'Linha Viva', 'Manutenção',
                    'Plantão', 'Poda', 'Qualidade e Equipamentos', 'Seed Money',
                    'Segurança', 'Tat', 'Transporte'
                   ].map(p => <option key={p} value={p}>{p}</option>)}
                 </select>
              </div>
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

            <div style={{ display: 'flex', gap: 12, marginTop: 24, justifyContent: 'space-between', alignItems: 'center' }}>
              {editando && usuario?.nivel === 'admin' && (
                <button
                  onClick={() => { setConfirmacaoMatricula(''); setErroExcluir(null); setModalExcluirAberto(true) }}
                  style={{ height: 38, padding: '0 16px', border: '1px solid #fca5a5', borderRadius: 8, fontSize: 13, cursor: 'pointer', backgroundColor: '#fef2f2', color: '#dc2626' }}
                >
                  🗑 Excluir
                </button>
              )}
              <div style={{ display: 'flex', gap: 12, marginLeft: 'auto' }}>
                <button onClick={() => setModalAberto(false)} style={{ height: 38, padding: '0 20px', border: '1px solid #e0e0e0', borderRadius: 8, fontSize: 13, cursor: 'pointer', background: 'white', color: '#555' }}>
                  Cancelar
                </button>
                <button onClick={salvar} disabled={salvando} style={{ height: 38, padding: '0 24px', backgroundColor: COR, color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: salvando ? 'not-allowed' : 'pointer', opacity: salvando ? 0.7 : 1 }}>
                  {salvando ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CONFIRMAR EXCLUSÃO */}
      {modalExcluirAberto && editando && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
          <div style={{ backgroundColor: 'white', borderRadius: 16, padding: 32, width: '100%', maxWidth: 440, boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <p style={{ fontSize: 36, margin: '0 0 12px' }}>⚠️</p>
              <h2 style={{ fontSize: 17, fontWeight: 600, color: '#1a1a1a', margin: '0 0 8px' }}>Excluir Colaborador</h2>
              <p style={{ fontSize: 13, color: '#666', margin: 0 }}>
                Esta ação é <strong>irreversível</strong> e irá excluir todos os exames, auditorias e programações vinculadas.
              </p>
            </div>

            <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '12px 16px', marginBottom: 20 }}>
              <p style={{ fontSize: 13, color: '#b91c1c', margin: 0, fontWeight: 500 }}>
                Para confirmar, digite a matrícula: <strong>{editando}</strong>
              </p>
            </div>

            <input
              autoFocus
              value={confirmacaoMatricula}
              onChange={e => setConfirmacaoMatricula(e.target.value)}
              placeholder={`Digite ${editando} para confirmar`}
              style={{ width: '100%', height: 40, border: '2px solid #fca5a5', borderRadius: 8, padding: '0 12px', fontSize: 14, outline: 'none', boxSizing: 'border-box', marginBottom: 12, textAlign: 'center', letterSpacing: 2 }}
            />

            {erroExcluir && (
              <p style={{ fontSize: 12, color: '#dc2626', marginBottom: 12, textAlign: 'center' }}>{erroExcluir}</p>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setModalExcluirAberto(false)}
                style={{ flex: 1, height: 40, border: '1px solid #e0e0e0', borderRadius: 8, fontSize: 13, cursor: 'pointer', background: 'white', color: '#555' }}
              >
                Cancelar
              </button>
              <button
                onClick={excluir}
                disabled={excluindo || confirmacaoMatricula !== editando}
                style={{ flex: 1, height: 40, backgroundColor: confirmacaoMatricula === editando ? '#dc2626' : '#f5f5f5', color: confirmacaoMatricula === editando ? 'white' : '#aaa', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: confirmacaoMatricula === editando ? 'pointer' : 'not-allowed', transition: 'all 0.15s' }}
              >
                {excluindo ? 'Excluindo...' : 'Confirmar exclusão'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
