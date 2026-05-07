'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'

// ─── TIPOS ───────────────────────────────────────────────────────────────────

interface Auditoria {
  id: string
  auditor_email: string
  data_auditoria: string
  validado: boolean
  observacao: string | null
}

interface Registro {
  id: string
  matricula_colaborador: string
  regra_id: number
  data_realizacao: string
  data_vencimento: string
  url_arquivo: string | null
  logs_auditoria: Auditoria[]
  colaboradores: {
    nome: string
    funcoes: { nome: string } | null
    bases: { id: number; nome: string } | null
  } | null
  regras_vencimento: {
    nome_item: string
  } | null
}

type OrdemColuna = 'matricula' | 'colaborador' | 'funcao' | 'base' | 'treinamento' | 'realizado' | 'vencimento' | 'status'
type OrdemDirecao = 'asc' | 'desc'
type FiltroCard = 'pendente' | 'reprovado' | 'validado' | 'sem_arquivo' | null

const COR = '#9f183c'
const PAGE_SIZE = 50

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function getStatusVencimento(dataVencimento: string) {
  const hoje = new Date()
  const venc = new Date(dataVencimento)
  const diff = (venc.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24)
  if (diff < 0) return 'vencido'
  if (diff <= 30) return 'proximo'
  return 'valido'
}

function getStatusAuditoria(registro: Registro): { label: string; cor: string; bg: string; key: string } {
  const auditorias = registro.logs_auditoria || []
  if (auditorias.length === 0) return { label: 'Pendente', cor: '#888', bg: '#f5f5f5', key: 'pendente' }
  const ultima = [...auditorias].sort((a, b) =>
    new Date(b.data_auditoria).getTime() - new Date(a.data_auditoria).getTime()
  )[0]
  if (ultima.validado) return { label: 'Validado', cor: '#16a34a', bg: '#f0fdf4', key: 'validado' }
  return { label: 'Reprovado', cor: '#dc2626', bg: '#fef2f2', key: 'reprovado' }
}

// ─── TH ORDENÁVEL ────────────────────────────────────────────────────────────

function ThOrdenavel({ label, coluna, ordemAtual, direcao, onClick, style }: {
  label: string
  coluna: OrdemColuna
  ordemAtual: OrdemColuna
  direcao: OrdemDirecao
  onClick: (col: OrdemColuna) => void
  style?: React.CSSProperties
}) {
  const ativo = ordemAtual === coluna
  return (
    <th
      onClick={() => onClick(coluna)}
      style={{
        padding: '10px 16px', textAlign: 'left', fontWeight: 700,
        color: ativo ? COR : '#333', whiteSpace: 'nowrap',
        cursor: 'pointer', userSelect: 'none',
        borderBottom: ativo ? `2px solid ${COR}` : '2px solid transparent',
        position: 'sticky', top: 0, backgroundColor: '#fafafa', zIndex: 3,
        ...style,
      }}
    >
      {label} {ativo ? (direcao === 'asc' ? '↑' : '↓') : <span style={{ color: '#ccc' }}>↕</span>}
    </th>
  )
}

// ─── MODAL AUDITORIA ─────────────────────────────────────────────────────────

function ModalAuditoria({ registro, usuarioEmail, onFechar, onAtualizar }: {
  registro: Registro
  usuarioEmail: string
  onFechar: () => void
  onAtualizar: () => void
}) {
  const [form, setForm] = useState({ validado: true, observacao: '' })
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const auditorias = [...(registro.logs_auditoria || [])].sort(
    (a, b) => new Date(b.data_auditoria).getTime() - new Date(a.data_auditoria).getTime()
  )

  const inputStyle: React.CSSProperties = {
    width: '100%', height: 38, border: '1px solid #e0e0e0',
    borderRadius: 8, padding: '0 12px', fontSize: 13,
    color: '#333', outline: 'none', boxSizing: 'border-box',
  }

  async function salvar() {
    if (!form.validado && !form.observacao) { setErro('Informe o motivo da reprovação.'); return }
    setSalvando(true); setErro(null)
    const { error } = await supabase.from('logs_auditoria').insert({
      registro_id: registro.id,
      auditor_email: usuarioEmail,
      validado: form.validado,
      observacao: form.observacao || null,
      data_auditoria: new Date().toISOString(),
    })
    if (error) { setErro('Erro ao salvar: ' + error.message); setSalvando(false); return }
    setSalvando(false)
    onAtualizar()
    onFechar()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div style={{ backgroundColor: 'white', borderRadius: 16, width: '100%', maxWidth: 560, maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>

        {/* HEADER */}
        <div style={{ padding: '24px 28px 20px', borderBottom: '1px solid #f0f0f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0, color: '#1a1a1a' }}>Auditar Documento</h2>
              <p style={{ fontSize: 13, color: '#888', margin: '4px 0 0' }}>
                {registro.colaboradores?.nome} · {registro.matricula_colaborador} — {registro.regras_vencimento?.nome_item}
              </p>
            </div>
            <button onClick={onFechar} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#aaa', padding: '0 4px' }}>✕</button>
          </div>
        </div>

        <div style={{ padding: '20px 28px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* DOCUMENTO */}
          {registro.url_arquivo ? (
            <a href={registro.url_arquivo} target="_blank" rel="noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 14, backgroundColor: '#eff6ff', borderRadius: 10, border: '1px solid #bfdbfe', color: '#2563eb', textDecoration: 'none', fontSize: 13, fontWeight: 500 }}>
              👁 Visualizar documento antes de auditar
            </a>
          ) : (
            <div style={{ padding: 14, backgroundColor: '#fef2f2', borderRadius: 10, border: '1px solid #fecaca' }}>
              <p style={{ fontSize: 13, color: '#b91c1c', margin: 0 }}>⚠️ Sem documento. Recomenda-se solicitar antes de auditar.</p>
            </div>
          )}

          {/* DECISÃO */}
          <div>
            <label style={{ display: 'block', fontSize: 12, color: '#666', marginBottom: 8, fontWeight: 600 }}>Decisão *</label>
            <div style={{ display: 'flex', gap: 12 }}>
              {[
                { val: true, label: 'Aprovar', cor: '#16a34a', bg: '#f0fdf4' },
                { val: false, label: 'Reprovar', cor: '#dc2626', bg: '#fef2f2' },
              ].map(op => (
                <button key={String(op.val)} onClick={() => setForm(f => ({ ...f, validado: op.val }))}
                  style={{
                    flex: 1, height: 42, borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer',
                    border: form.validado === op.val ? `2px solid ${op.cor}` : '1px solid #e0e0e0',
                    backgroundColor: form.validado === op.val ? op.bg : 'white',
                    color: form.validado === op.val ? op.cor : '#555',
                  }}>{op.label}</button>
              ))}
            </div>
          </div>

          {/* OBSERVAÇÃO */}
          <div>
            <label style={{ display: 'block', fontSize: 12, color: '#666', marginBottom: 5, fontWeight: 600 }}>
              Observação {!form.validado && <span style={{ color: '#dc2626' }}>*</span>}
            </label>
            <textarea
              value={form.observacao}
              onChange={e => setForm(f => ({ ...f, observacao: e.target.value }))}
              placeholder={!form.validado ? 'Informe o motivo da reprovação...' : 'Observação opcional...'}
              rows={3}
              style={{ ...inputStyle, height: 'auto', padding: '8px 12px', resize: 'none' }}
            />
          </div>

          {erro && (
            <div style={{ fontSize: 13, color: '#b91c1c', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px' }}>
              {erro}
            </div>
          )}

          {/* HISTÓRICO */}
          {auditorias.length > 0 && (
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#333', margin: '0 0 10px' }}>Histórico de auditorias</p>
              {auditorias.map((log, i) => (
                <div key={log.id} style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: '10px 14px', marginBottom: 8, borderLeft: `3px solid ${log.validado ? '#16a34a' : '#dc2626'}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 12, fontWeight: 500, color: log.validado ? '#16a34a' : '#dc2626' }}>
                      {log.validado ? '✓ Validado' : '✗ Reprovado'}
                      {i === 0 && <span style={{ fontSize: 10, color: '#aaa', marginLeft: 8 }}>mais recente</span>}
                    </span>
                    <span style={{ fontSize: 11, color: '#aaa' }}>{new Date(log.data_auditoria).toLocaleString('pt-BR')}</span>
                  </div>
                  <p style={{ fontSize: 12, color: '#666', margin: '4px 0 0' }}>{log.auditor_email}</p>
                  {log.observacao && <p style={{ fontSize: 12, color: '#888', margin: '4px 0 0', fontStyle: 'italic' }}>"{log.observacao}"</p>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* FOOTER */}
        <div style={{ padding: '16px 28px', borderTop: '1px solid #f0f0f0', display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <button onClick={onFechar} style={{ height: 38, padding: '0 20px', border: '1px solid #e0e0e0', borderRadius: 8, fontSize: 13, cursor: 'pointer', background: 'white', color: '#555' }}>
            Cancelar
          </button>
          <button onClick={salvar} disabled={salvando} style={{
            height: 38, padding: '0 24px',
            backgroundColor: form.validado ? '#16a34a' : '#dc2626',
            color: 'white', border: 'none', borderRadius: 8,
            fontSize: 13, fontWeight: 500, cursor: salvando ? 'not-allowed' : 'pointer',
            opacity: salvando ? 0.7 : 1,
          }}>
            {salvando ? 'Salvando...' : form.validado ? 'Confirmar aprovação' : 'Confirmar reprovação'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── PÁGINA PRINCIPAL ─────────────────────────────────────────────────────────

export default function AuditoriaPage() {
  const router = useRouter()
  const { usuario } = useAuth()
  const [registros, setRegistros] = useState<Registro[]>([])
  const [carregando, setCarregando] = useState(true)
  const [filtroBase, setFiltroBase] = useState('')
  const [filtroBusca, setFiltroBusca] = useState('')
  const [bases, setBases] = useState<{ id: number; nome: string }[]>([])
  const [ordemColuna, setOrdemColuna] = useState<OrdemColuna>('vencimento')
  const [ordemDirecao, setOrdemDirecao] = useState<OrdemDirecao>('asc')
  const [filtroCard, setFiltroCard] = useState<FiltroCard>(null)
  const [registroSelecionado, setRegistroSelecionado] = useState<Registro | null>(null)
  const [pagina, setPagina] = useState(1)

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: b } = await supabase.from('bases').select('id, nome').order('nome')
      setBases(b || [])
      await buscar()
    }
    init()
  }, [])

  const buscar = useCallback(async () => {
    setCarregando(true)

    let query = supabase
      .from('registros_exames')
      .select(`
        id, matricula_colaborador, regra_id, data_realizacao, data_vencimento, url_arquivo,
        logs_auditoria (id, auditor_email, data_auditoria, validado, observacao),
        colaboradores (nome, bases (id, nome), funcoes (nome)),
        regras_vencimento (nome_item)
      `)
      .eq('is_atual', true)
      .order('data_vencimento', { ascending: true })

    // Filtro por base direto na query do Supabase
    if (filtroBase) {
      query = (query as any).eq('colaboradores.bases.id', parseInt(filtroBase))
    }

    const { data } = await query
    let resultado = (data as unknown as Registro[]) || []

    // Filtro por base no resultado (join no Supabase pode não filtrar diretamente)
    if (filtroBase) {
      resultado = resultado.filter(r =>
        r.colaboradores?.bases?.id === parseInt(filtroBase)
      )
    }

    // Filtro por bases do usuário (não admin)
    if (usuario && usuario.nivel !== 'admin' && usuario.bases?.length > 0) {
      resultado = resultado.filter(r =>
       usuario.bases.includes(r.colaboradores?.bases?.id ?? -1)
      )
    }

    setRegistros(resultado)
    setPagina(1)
    setCarregando(false)
  }, [filtroBase, usuario])

  useEffect(() => { buscar() }, [buscar])

  function toggleOrdem(coluna: OrdemColuna) {
    if (ordemColuna === coluna) setOrdemDirecao(d => d === 'asc' ? 'desc' : 'asc')
    else { setOrdemColuna(coluna); setOrdemDirecao('asc') }
    setPagina(1)
  }

  function limparFiltros() {
    setFiltroBusca('')
    setFiltroBase('')
    setFiltroCard(null)
    setPagina(1)
  }

  // ─── STATS (sem filtro de card) ───────────────────────────────────────────

  const registrosFiltradosBase = registros.filter(r => {
    if (filtroBusca) {
      const b = filtroBusca.toLowerCase()
      if (
        !r.colaboradores?.nome?.toLowerCase().includes(b) &&
        !r.regras_vencimento?.nome_item?.toLowerCase().includes(b) &&
        !r.matricula_colaborador?.toLowerCase().includes(b)
      ) return false
    }
    return true
  })

  const statsPendente = registrosFiltradosBase.filter(r => getStatusAuditoria(r).key === 'pendente').length
  const statsReprovado = registrosFiltradosBase.filter(r => getStatusAuditoria(r).key === 'reprovado').length
  const statsValidado = registrosFiltradosBase.filter(r => getStatusAuditoria(r).key === 'validado').length
  const statsSemArquivo = registrosFiltradosBase.filter(r => !r.url_arquivo).length

  // ─── FILTRO + ORDENAÇÃO ───────────────────────────────────────────────────

  const filtrados = registrosFiltradosBase.filter(r => {
    if (!filtroCard) return true
    if (filtroCard === 'sem_arquivo') return !r.url_arquivo
    return getStatusAuditoria(r).key === filtroCard
  })

  const ordenados = [...filtrados].sort((a, b) => {
    let vA = '', vB = ''
    if (ordemColuna === 'matricula') { vA = a.matricula_colaborador; vB = b.matricula_colaborador }
    else if (ordemColuna === 'colaborador') { vA = a.colaboradores?.nome || ''; vB = b.colaboradores?.nome || '' }
    else if (ordemColuna === 'funcao') { vA = a.colaboradores?.funcoes?.nome || ''; vB = b.colaboradores?.funcoes?.nome || '' }
    else if (ordemColuna === 'base') { vA = a.colaboradores?.bases?.nome || ''; vB = b.colaboradores?.bases?.nome || '' }
    else if (ordemColuna === 'treinamento') { vA = a.regras_vencimento?.nome_item || ''; vB = b.regras_vencimento?.nome_item || '' }
    else if (ordemColuna === 'realizado') { vA = a.data_realizacao; vB = b.data_realizacao }
    else if (ordemColuna === 'vencimento') { vA = a.data_vencimento; vB = b.data_vencimento }
    else if (ordemColuna === 'status') { vA = getStatusAuditoria(a).key; vB = getStatusAuditoria(b).key }
    return ordemDirecao === 'asc' ? vA.localeCompare(vB) : vB.localeCompare(vA)
  })

  // ─── PAGINAÇÃO ────────────────────────────────────────────────────────────

  const totalPaginas = Math.ceil(ordenados.length / PAGE_SIZE)
  const paginados = ordenados.slice((pagina - 1) * PAGE_SIZE, pagina * PAGE_SIZE)

  const temFiltroAtivo = !!(filtroBusca || filtroBase || filtroCard)

  const selectStyle: React.CSSProperties = {
    height: 36, border: '1px solid #e0e0e0', borderRadius: 8,
    padding: '0 10px', fontSize: 13, backgroundColor: 'white', color: '#555', outline: 'none',
  }

  // ─── CORES VENCIMENTO ─────────────────────────────────────────────────────

  const coresVenc: Record<string, { bg: string; cor: string }> = {
    valido: { bg: '#f0fdf4', cor: '#15803d' },
    proximo: { bg: '#fffbeb', cor: '#b45309' },
    vencido: { bg: '#fef2f2', cor: '#b91c1c' },
  }

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', display: 'flex', flexDirection: 'column', height: '100%' }}>
      <h1 style={{ fontSize: 18, fontWeight: 600, color: '#1a1a1a', margin: '0 0 12px' }}>Auditoria</h1>

      {/* CARDS */}
      {carregando ? (
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
            { label: 'Total', valor: registrosFiltradosBase.length, cor: '#4a4a49', status: null },
            { label: 'Pendentes', valor: statsPendente, cor: '#888', status: 'pendente' as FiltroCard },
            { label: 'Reprovados', valor: statsReprovado, cor: '#dc2626', status: 'reprovado' as FiltroCard },
            { label: 'Validados', valor: statsValidado, cor: '#16a34a', status: 'validado' as FiltroCard },
            { label: 'Sem Arquivo', valor: statsSemArquivo, cor: '#d97706', status: 'sem_arquivo' as FiltroCard },
          ].map((card, i) => {
            const ativo = filtroCard === card.status && card.status !== null
            return (
              <div
                key={i}
                onClick={() => card.status !== null && setFiltroCard(ativo ? null : card.status)}
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
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="Nome, matrícula ou treinamento..."
          value={filtroBusca}
          onChange={e => { setFiltroBusca(e.target.value); setPagina(1) }}
          style={{ ...selectStyle, width: 260, padding: '0 12px' }}
        />
        <select value={filtroBase} onChange={e => { setFiltroBase(e.target.value); setPagina(1) }} style={{ ...selectStyle, width: 180 }}>
          <option value="">Todas as bases</option>
          {bases.map(b => <option key={b.id} value={b.id}>{b.nome}</option>)}
        </select>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 13, color: '#888' }}>
          {ordenados.length} registro{ordenados.length !== 1 ? 's' : ''}
        </span>
        {temFiltroAtivo && (
          <button onClick={limparFiltros} style={{ height: 36, padding: '0 12px', fontSize: 12, border: '1px solid #fca5a5', borderRadius: 8, backgroundColor: '#fef2f2', color: '#dc2626', cursor: 'pointer' }}>
            ✕ Limpar
          </button>
        )}
      </div>

      {/* TABELA */}
      {carregando ? (
        <p style={{ color: '#888', fontSize: 14 }}>Carregando...</p>
      ) : (
        <>
          <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 300px)', borderRadius: 12, border: '1px solid #f0f0f0', flex: 1 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: 'white', fontSize: 13 }}>
              <thead>
                <tr style={{ backgroundColor: '#fafafa', borderBottom: '1px solid #f0f0f0' }}>
                  <ThOrdenavel label="Matrícula" coluna="matricula" ordemAtual={ordemColuna} direcao={ordemDirecao} onClick={toggleOrdem} />
                  <ThOrdenavel label="Colaborador" coluna="colaborador" ordemAtual={ordemColuna} direcao={ordemDirecao} onClick={toggleOrdem} />
                  <ThOrdenavel label="Função" coluna="funcao" ordemAtual={ordemColuna} direcao={ordemDirecao} onClick={toggleOrdem} />
                  <ThOrdenavel label="Base" coluna="base" ordemAtual={ordemColuna} direcao={ordemDirecao} onClick={toggleOrdem} />
                  <ThOrdenavel label="Treinamento" coluna="treinamento" ordemAtual={ordemColuna} direcao={ordemDirecao} onClick={toggleOrdem} />
                  <ThOrdenavel label="Realizado" coluna="realizado" ordemAtual={ordemColuna} direcao={ordemDirecao} onClick={toggleOrdem} />
                  <ThOrdenavel label="Vencimento" coluna="vencimento" ordemAtual={ordemColuna} direcao={ordemDirecao} onClick={toggleOrdem} />
                  <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 700, color: '#333', whiteSpace: 'nowrap', position: 'sticky', top: 0, backgroundColor: '#fafafa', zIndex: 3 }}>Arquivo</th>
                  <ThOrdenavel label="Status" coluna="status" ordemAtual={ordemColuna} direcao={ordemDirecao} onClick={toggleOrdem} />
                  <th style={{ padding: '10px 16px', position: 'sticky', top: 0, backgroundColor: '#fafafa', zIndex: 3 }} />
                </tr>
              </thead>
              <tbody>
                {paginados.length === 0 ? (
                  <tr>
                    <td colSpan={10} style={{ padding: '48px 16px', textAlign: 'center', color: '#aaa', fontSize: 14 }}>
                      <p style={{ fontSize: 28, margin: '0 0 8px' }}>📋</p>
                      Nenhum registro encontrado.
                    </td>
                  </tr>
                ) : paginados.map((r, i) => {
                  const statusAud = getStatusAuditoria(r)
                  const statusVenc = getStatusVencimento(r.data_vencimento)
                  const corVenc = coresVenc[statusVenc]
                  return (
                    <tr key={r.id} style={{ borderBottom: '1px solid #f5f5f5', backgroundColor: i % 2 === 0 ? 'white' : '#fafafa' }}>
                      <td style={{ padding: '10px 16px', color: '#666', whiteSpace: 'nowrap' }}>
                        {r.matricula_colaborador}
                      </td>
                      <td style={{ padding: '10px 16px', fontWeight: 500, color: '#333', whiteSpace: 'nowrap' }}>
                        {r.colaboradores?.nome || '—'}
                      </td>
                      <td style={{ padding: '10px 16px', color: '#666', whiteSpace: 'nowrap' }}>
                        {r.colaboradores?.funcoes?.nome || '—'}
                      </td>
                      <td style={{ padding: '10px 16px', color: '#666', whiteSpace: 'nowrap' }}>
                        {r.colaboradores?.bases?.nome || '—'}
                      </td>
                      <td style={{ padding: '10px 16px', color: '#666', whiteSpace: 'nowrap' }}>
                        {r.regras_vencimento?.nome_item || '—'}
                      </td>
                      <td style={{ padding: '10px 16px', color: '#666', whiteSpace: 'nowrap' }}>
                        {new Date(r.data_realizacao + 'T12:00:00').toLocaleDateString('pt-BR')}
                      </td>
                      {/* VENCIMENTO COM COR */}
                      <td style={{ padding: '8px 12px', whiteSpace: 'nowrap', backgroundColor: corVenc.bg }}>
                        <span style={{ fontSize: 12, color: corVenc.cor, fontWeight: 500 }}>
                          {new Date(r.data_vencimento + 'T12:00:00').toLocaleDateString('pt-BR')}
                        </span>
                      </td>
                      <td style={{ padding: '10px 16px' }}>
                        {r.url_arquivo
                          ? <a href={r.url_arquivo} target="_blank" rel="noreferrer" style={{ color: '#2563eb', fontSize: 12 }}>Ver arquivo</a>
                          : <span style={{ color: '#f59e0b', fontSize: 12 }}>Sem arquivo</span>
                        }
                      </td>
                      <td style={{ padding: '10px 16px' }}>
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, backgroundColor: statusAud.bg, color: statusAud.cor }}>
                          {statusAud.label}
                        </span>
                      </td>
                      <td style={{ padding: '10px 16px' }}>
                        {usuario?.pode_auditar && (
                          <button onClick={() => setRegistroSelecionado(r)} style={{
                            fontSize: 12, color: COR, background: 'none',
                            border: `1px solid ${COR}`, borderRadius: 6,
                            padding: '4px 12px', cursor: 'pointer',
                          }}>
                            Auditar
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* PAGINAÇÃO */}
          {totalPaginas > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, paddingTop: 16 }}>
              <button
                onClick={() => setPagina(p => Math.max(1, p - 1))}
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
                    <button key={p} onClick={() => setPagina(p as number)} style={{
                      height: 32, width: 32, borderRadius: 8, fontSize: 13, cursor: 'pointer',
                      border: pagina === p ? `2px solid ${COR}` : '1px solid #e0e0e0',
                      backgroundColor: pagina === p ? '#fdf2f5' : 'white',
                      color: pagina === p ? COR : '#555', fontWeight: pagina === p ? 600 : 400,
                    }}>{p}</button>
                  )
                )}

              <button
                onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))}
                disabled={pagina === totalPaginas}
                style={{ height: 32, padding: '0 14px', borderRadius: 8, border: '1px solid #e0e0e0', backgroundColor: 'white', fontSize: 13, cursor: pagina === totalPaginas ? 'not-allowed' : 'pointer', color: pagina === totalPaginas ? '#ccc' : '#555' }}
              >Próxima →</button>

              <span style={{ fontSize: 12, color: '#888', marginLeft: 8 }}>
                Página {pagina} de {totalPaginas}
              </span>
            </div>
          )}
        </>
      )}

      {/* MODAL */}
      {registroSelecionado && usuario?.pode_auditar && (
        <ModalAuditoria
          registro={registroSelecionado}
          usuarioEmail={usuario.email}
          onFechar={() => setRegistroSelecionado(null)}
          onAtualizar={buscar}
        />
      )}
    </div>
  )
}