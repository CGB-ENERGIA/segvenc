'use client'

import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'

const COR = '#9f183c'

// ─── TIPOS ───────────────────────────────────────────────────────────────────

interface ASO {
  id: string
  tipo: string
  data_realizacao: string
  data_vencimento: string | null
  gse: number | null
  observacao: string | null
  url_arquivo: string | null
}

interface Colaborador {
  matricula: string
  nome: string
  situacao: string
  funcao_id: number | null
  bases: { nome: string } | null
  funcoes: { nome: string } | null
  gerencias: { sigla: string } | null
  asos: ASO[]
}

interface Gerencia {
  id: number
  sigla: string
  nome: string
}

type StatusASO = 'no_prazo' | 'critico' | 'atencao' | 'vencido' | 'sem_aso'
type CardFiltro = 'total' | StatusASO | null
type OrdemColuna =
  | 'matricula' | 'nome' | 'funcao' | 'gse' | 'base'
  | 'situacao' | 'admissional' | 'ultimo_periodico' | 'vencimento' | 'status'
type OrdemDirecao = 'asc' | 'desc'

const TIPOS_ASO = [
  { value: 'admissional', label: 'Admissional' },
  { value: 'periodico',   label: 'Periódico' },
  { value: 'retorno',     label: 'Retorno ao Trabalho' },
  { value: 'mro',         label: 'Mudança de Risco Ocupacional' },
  { value: 'demissional', label: 'Demissional' },
]

const TIPOS_SEM_VENCIMENTO = ['admissional', 'retorno', 'mro', 'demissional']

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function calcularDias(dataVencimento: string | null): number | null {
  if (!dataVencimento) return null
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  const venc = new Date(dataVencimento + 'T00:00:00')
  return Math.ceil((venc.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24))
}

function getStatusASO(dataVencimento: string | null): StatusASO {
  const dias = calcularDias(dataVencimento)
  if (dias === null) return 'sem_aso'
  if (dias < 0)   return 'vencido'
  if (dias <= 30) return 'atencao'
  if (dias <= 60) return 'critico'
  return 'no_prazo'
}

function getUltimoPeriodico(asos: ASO[]): ASO | null {
  const p = (asos || []).filter(a => a.tipo === 'periodico')
  if (!p.length) return null
  return p.sort((a, b) =>
    new Date(b.data_realizacao).getTime() - new Date(a.data_realizacao).getTime()
  )[0]
}

function getAdmissional(asos: ASO[]): ASO | null {
  const a = (asos || []).filter(x => x.tipo === 'admissional')
  if (!a.length) return null
  return a.sort((x, y) =>
    new Date(y.data_realizacao).getTime() - new Date(x.data_realizacao).getTime()
  )[0]
}

function formatarData(data: string | null | undefined): string {
  if (!data) return '—'
  return new Date(data + 'T00:00:00').toLocaleDateString('pt-BR')
}

function statusLabel(s: StatusASO): string {
  if (s === 'no_prazo') return 'No Prazo'
  if (s === 'critico')  return 'Prazo Crítico'
  if (s === 'atencao')  return 'Bernhoeft com Atenção'
  if (s === 'vencido')  return 'Vencido'
  return 'Sem ASO'
}

function statusCores(s: StatusASO): { bg: string; text: string } {
  if (s === 'no_prazo') return { bg: '#dcfce7', text: '#15803d' }
  if (s === 'critico')  return { bg: '#fef9c3', text: '#a16207' }
  if (s === 'atencao')  return { bg: '#ffedd5', text: '#c2410c' }
  if (s === 'vencido')  return { bg: '#fee2e2', text: '#dc2626' }
  return { bg: '#f1f5f9', text: '#64748b' }
}

function situacaoCores(situacao: string): { bg: string; text: string } {
  const s = situacao?.toUpperCase()
  if (s === 'ATIVO')   return { bg: '#dcfce7', text: '#15803d' }
  if (s === 'INATIVO') return { bg: '#fee2e2', text: '#dc2626' }
  return { bg: '#f1f5f9', text: '#64748b' }
}

function tipoLabel(tipo: string): string {
  return TIPOS_ASO.find(t => t.value === tipo)?.label ?? tipo
}

function getStatusColaborador(col: Colaborador): StatusASO {
  const p = getUltimoPeriodico(col.asos || [])
  return p ? getStatusASO(p.data_vencimento) : 'sem_aso'
}

// ─── TH ORDENÁVEL ────────────────────────────────────────────────────────────

function ThSort({
  col, label, ordemCol, ordemDir, onToggle,
}: {
  col: OrdemColuna; label: string
  ordemCol: OrdemColuna; ordemDir: OrdemDirecao
  onToggle: (c: OrdemColuna) => void
}) {
  const ativo = ordemCol === col
  return (
    <th
      onClick={() => onToggle(col)}
      style={{
        padding: '12px 14px', textAlign: 'left', fontSize: 12, fontWeight: 600,
        color: ativo ? COR : '#666', cursor: 'pointer', userSelect: 'none',
        whiteSpace: 'nowrap', backgroundColor: '#fafafa',
        position: 'sticky', top: 0, zIndex: 2,
        borderBottom: '2px solid #e8e8e8',
      }}
    >
      {label} {ativo ? (ordemDir === 'asc' ? '↑' : '↓') : <span style={{ color: '#ccc' }}>↕</span>}
    </th>
  )
}

// ─── MODAL VER ASOs ───────────────────────────────────────────────────────────

function ModalVerASOs({
  colaborador, onClose, onNovoASO,
}: {
  colaborador: Colaborador
  onClose: () => void
  onNovoASO: () => void
}) {
  const asos = [...(colaborador.asos || [])].sort(
    (a, b) => new Date(b.data_realizacao).getTime() - new Date(a.data_realizacao).getTime()
  )

  return (
    <div style={{
      position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 300, padding: 24,
    }}>
      <div style={{
        backgroundColor: 'white', borderRadius: 16, width: '100%', maxWidth: 640,
        maxHeight: '85vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px', borderBottom: '1px solid #f0f0f0',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1a1a1a' }}>
              ASOs — {colaborador.nome}
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#888' }}>
              Matrícula {colaborador.matricula}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              onClick={onNovoASO}
              style={{
                backgroundColor: COR, color: 'white', border: 'none',
                borderRadius: 8, padding: '8px 16px', fontSize: 13,
                fontWeight: 600, cursor: 'pointer',
              }}
            >
              + Novo ASO
            </button>
            <button
              onClick={onClose}
              style={{
                background: 'none', border: '1px solid #e0e0e0', borderRadius: 8,
                width: 36, height: 36, cursor: 'pointer', fontSize: 20, color: '#666',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              ×
            </button>
          </div>
        </div>

        {/* Lista */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
          {asos.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 0', color: '#aaa' }}>
              <p style={{ margin: 0, fontSize: 14 }}>Nenhum ASO registrado.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {asos.map(aso => {
                const status = getStatusASO(aso.data_vencimento)
                const cores = statusCores(status)
                return (
                  <div key={aso.id} style={{
                    border: '1px solid #e8e8e8', borderRadius: 12, padding: '16px 20px',
                  }}>
                    <div style={{
                      display: 'flex', alignItems: 'center',
                      justifyContent: 'space-between', marginBottom: 10,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{
                          backgroundColor: '#fdf2f5', color: COR,
                          fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 20,
                        }}>
                          {tipoLabel(aso.tipo)}
                        </span>
                        {aso.gse != null && (
                          <span style={{ fontSize: 12, color: '#888' }}>GSE {aso.gse}</span>
                        )}
                      </div>
                      {aso.data_vencimento && (
                        <span style={{
                          backgroundColor: cores.bg, color: cores.text,
                          fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 20,
                        }}>
                          {statusLabel(status)}
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 24, fontSize: 13, color: '#555' }}>
                      <span>Realização: <strong>{formatarData(aso.data_realizacao)}</strong></span>
                      {aso.data_vencimento && (
                        <span>Vencimento: <strong>{formatarData(aso.data_vencimento)}</strong></span>
                      )}
                    </div>
                    {aso.observacao && (
                      <p style={{ margin: '8px 0 0', fontSize: 12, color: '#777' }}>
                        {aso.observacao}
                      </p>
                    )}
                    {aso.url_arquivo && (
                      <a
                        href={aso.url_arquivo}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          marginTop: 10, fontSize: 12, color: COR, textDecoration: 'none',
                        }}
                      >
                        <svg width={13} height={13} viewBox="0 0 24 24" fill="none"
                          stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z M14 2v6h6" />
                        </svg>
                        Ver documento
                      </a>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── MODAL NOVO ASO ───────────────────────────────────────────────────────────

function ModalNovoASO({
  colaborador, onClose, onSalvo,
}: {
  colaborador: Colaborador
  onClose: () => void
  onSalvo: () => void
}) {
  const [tipo, setTipo] = useState('periodico')
  const [dataRealizacao, setDataRealizacao] = useState('')
  const [dataVencimento, setDataVencimento] = useState('')
  const [vencimentoEditado, setVencimentoEditado] = useState(false)
  const [gse, setGse] = useState('')
  const [observacao, setObservacao] = useState('')
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  // Pré-preenche GSE
  useEffect(() => {
    async function buscarGSE() {
      if (colaborador.funcao_id) {
        const { data } = await supabase
          .from('gse_funcoes')
          .select('gse')
          .eq('funcao_id', colaborador.funcao_id)
          .maybeSingle()
        if (data?.gse) { setGse(String(data.gse)); return }
      }
      const ultimoComGSE = [...(colaborador.asos || [])]
        .sort((a, b) => new Date(b.data_realizacao).getTime() - new Date(a.data_realizacao).getTime())
        .find(a => a.gse != null)
      if (ultimoComGSE?.gse != null) setGse(String(ultimoComGSE.gse))
    }
    buscarGSE()
  }, [colaborador])

  // Auto-calcula vencimento para periódico (+365 dias)
  useEffect(() => {
    if (tipo !== 'periodico' || vencimentoEditado) return
    if (!dataRealizacao) { setDataVencimento(''); return }
    const d = new Date(dataRealizacao + 'T00:00:00')
    d.setFullYear(d.getFullYear() + 1)
    setDataVencimento(d.toISOString().split('T')[0])
  }, [tipo, dataRealizacao, vencimentoEditado])

  // Reset vencimento ao mudar tipo
  useEffect(() => {
    setDataVencimento('')
    setVencimentoEditado(false)
  }, [tipo])

  async function handleSalvar() {
    if (!dataRealizacao) { setErro('Data de realização é obrigatória.'); return }
    setSalvando(true)
    setErro('')
    try {
      let urlArquivo: string | null = null
      if (arquivo) {
        const ext = arquivo.name.split('.').pop()
        const path = `asos/${colaborador.matricula}/${tipo}/${Date.now()}.${ext}`
        const { error: uploadErr } = await supabase.storage
          .from('documentos')
          .upload(path, arquivo)
        if (uploadErr) throw uploadErr
        const { data: urlData } = supabase.storage.from('documentos').getPublicUrl(path)
        urlArquivo = urlData.publicUrl
      }

      const { error: insertErr } = await supabase.from('asos').insert({
        matricula_colaborador: colaborador.matricula,
        tipo,
        data_realizacao: dataRealizacao,
        data_vencimento: dataVencimento || null,
        gse: gse ? parseInt(gse) : null,
        observacao: observacao || null,
        url_arquivo: urlArquivo,
      })
      if (insertErr) throw insertErr
      onSalvo()
    } catch (e: unknown) {
      setErro((e as Error).message || 'Erro ao salvar ASO.')
    } finally {
      setSalvando(false)
    }
  }

  const semVencimento = TIPOS_SEM_VENCIMENTO.includes(tipo)

  const inputStyle: React.CSSProperties = {
    width: '100%', height: 38, border: '1px solid #e0e0e0',
    borderRadius: 8, padding: '0 12px', fontSize: 13,
    boxSizing: 'border-box', outline: 'none', backgroundColor: 'white', fontFamily: 'Arial',
  }
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 6,
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 400, padding: 24,
    }}>
      <div style={{
        backgroundColor: 'white', borderRadius: 16, width: '100%', maxWidth: 500,
        maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px', borderBottom: '1px solid #f0f0f0',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#1a1a1a' }}>
              Novo ASO
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#888' }}>
              {colaborador.nome} · {colaborador.matricula}
            </p>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: '1px solid #e0e0e0', borderRadius: 8,
            width: 36, height: 36, cursor: 'pointer', fontSize: 20, color: '#666',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>×</button>
        </div>

        {/* Form */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            <div>
              <label style={labelStyle}>Tipo *</label>
              <select value={tipo} onChange={e => setTipo(e.target.value)} style={inputStyle}>
                {TIPOS_ASO.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={labelStyle}>Data de Realização *</label>
                <input
                  type="date" value={dataRealizacao}
                  onChange={e => setDataRealizacao(e.target.value)}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>
                  {tipo === 'periodico' ? 'Vencimento (auto +1 ano)' : 'Data de Vencimento'}
                </label>
                <input
                  type="date" value={dataVencimento}
                  onChange={e => { setDataVencimento(e.target.value); setVencimentoEditado(true) }}
                  disabled={semVencimento}
                  style={{
                    ...inputStyle,
                    backgroundColor: semVencimento ? '#f9f9f9' : 'white',
                    color: semVencimento ? '#bbb' : '#1a1a1a',
                  }}
                />
              </div>
            </div>

            <div>
              <label style={labelStyle}>GSE</label>
              <input
                type="number" value={gse}
                onChange={e => setGse(e.target.value)}
                placeholder="Número do grupo"
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>Observação</label>
              <textarea
                value={observacao}
                onChange={e => setObservacao(e.target.value)}
                rows={3}
                placeholder="Opcional"
                style={{
                  ...inputStyle, height: 'auto', padding: '10px 12px',
                  resize: 'vertical', lineHeight: 1.5,
                }}
              />
            </div>

            <div>
              <label style={labelStyle}>Documento (PDF, JPG, PNG)</label>
              <div
                onClick={() => fileRef.current?.click()}
                style={{
                  border: `2px dashed ${arquivo ? COR : '#e0e0e0'}`,
                  borderRadius: 10, padding: '20px 16px', textAlign: 'center',
                  cursor: 'pointer', backgroundColor: arquivo ? '#fdf2f5' : '#fafafa',
                  transition: 'all 0.2s',
                }}
              >
                {arquivo ? (
                  <>
                    <p style={{ margin: 0, fontSize: 13, color: COR, fontWeight: 600 }}>
                      {arquivo.name}
                    </p>
                    <p style={{ margin: '4px 0 0', fontSize: 11, color: '#aaa' }}>
                      Clique para trocar
                    </p>
                  </>
                ) : (
                  <>
                    <p style={{ margin: 0, fontSize: 13, color: '#888' }}>
                      Clique para selecionar arquivo
                    </p>
                    <p style={{ margin: '4px 0 0', fontSize: 11, color: '#aaa' }}>
                      PDF, JPG ou PNG
                    </p>
                  </>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                style={{ display: 'none' }}
                onChange={e => setArquivo(e.target.files?.[0] ?? null)}
              />
            </div>

            {erro && (
              <p style={{
                margin: 0, fontSize: 13, color: '#dc2626',
                backgroundColor: '#fee2e2', padding: '10px 14px', borderRadius: 8,
              }}>
                {erro}
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 24px', borderTop: '1px solid #f0f0f0',
          display: 'flex', justifyContent: 'flex-end', gap: 12,
        }}>
          <button onClick={onClose} style={{
            padding: '9px 20px', fontSize: 13, border: '1px solid #e0e0e0',
            borderRadius: 8, cursor: 'pointer', background: 'white', color: '#555',
          }}>
            Cancelar
          </button>
          <button
            onClick={handleSalvar}
            disabled={salvando}
            style={{
              padding: '9px 20px', fontSize: 13, fontWeight: 600,
              backgroundColor: COR, color: 'white', border: 'none',
              borderRadius: 8, cursor: salvando ? 'not-allowed' : 'pointer',
              opacity: salvando ? 0.7 : 1,
            }}
          >
            {salvando ? 'Salvando...' : 'Salvar ASO'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── PÁGINA PRINCIPAL ─────────────────────────────────────────────────────────

export default function MedTrabPage() {
  useAuth()
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([])
  const [gerencias, setGerencias] = useState<Gerencia[]>([])
  const [bases, setBases] = useState<string[]>([])
  const [carregando, setCarregando] = useState(true)

  const [busca, setBusca] = useState('')
  const [filtroBase, setFiltroBase] = useState('')
  const [filtroSituacao, setFiltroSituacao] = useState('ATIVO')
  const [filtroGerencia, setFiltroGerencia] = useState('')
  const [cardAtivo, setCardAtivo] = useState<CardFiltro>(null)

  const [ordemCol, setOrdemCol] = useState<OrdemColuna>('nome')
  const [ordemDir, setOrdemDir] = useState<OrdemDirecao>('asc')

  const [modalVerASOs, setModalVerASOs] = useState<Colaborador | null>(null)
  const [modalNovoASO, setModalNovoASO] = useState<Colaborador | null>(null)

  async function carregar() {
    setCarregando(true)
    const { data } = await supabase.from('colaboradores').select(`
      matricula, nome, situacao, funcao_id,
      bases (nome),
      funcoes (nome),
      gerencias (sigla),
      asos (
        id, tipo, data_realizacao, data_vencimento, gse, observacao, url_arquivo
      )
    `)
    if (data) {
      setColaboradores(data as unknown as Colaborador[])
      const basesUnicas = [
        ...new Set(data.map((c: any) => c.bases?.nome).filter(Boolean) as string[]),
      ].sort()
      setBases(basesUnicas)
    }
    const { data: ger } = await supabase
      .from('gerencias')
      .select('id, sigla, nome')
      .order('sigla')
    if (ger) setGerencias(ger)
    setCarregando(false)
  }

  useEffect(() => { carregar() }, [])

  // Stats (filtradas apenas por situação)
  const colaboradoresFiltradosPorSituacao = colaboradores.filter(c =>
    !filtroSituacao || c.situacao?.toUpperCase() === filtroSituacao
  )
  const stats = { total: 0, no_prazo: 0, critico: 0, atencao: 0, vencido: 0 }
  stats.total = colaboradoresFiltradosPorSituacao.length
  colaboradoresFiltradosPorSituacao.forEach(c => {
    const s = getStatusColaborador(c)
    if (s in stats) (stats as Record<string, number>)[s]++
  })

  // Filtragem completa
  const filtrados = colaboradoresFiltradosPorSituacao.filter(c => {
    if (busca) {
      const q = busca.toLowerCase()
      if (!c.nome.toLowerCase().includes(q) && !c.matricula.toLowerCase().includes(q)) return false
    }
    if (filtroBase && c.bases?.nome !== filtroBase) return false
    if (filtroGerencia && c.gerencias?.sigla !== filtroGerencia) return false
    if (cardAtivo && cardAtivo !== 'total') {
      if (getStatusColaborador(c) !== cardAtivo) return false
    }
    return true
  })

  // Ordenação
  const ordenados = [...filtrados].sort((a, b) => {
    let va: string | number = ''
    let vb: string | number = ''
    switch (ordemCol) {
      case 'matricula':       va = a.matricula;                vb = b.matricula;                break
      case 'nome':            va = a.nome;                     vb = b.nome;                     break
      case 'funcao':          va = a.funcoes?.nome ?? '';      vb = b.funcoes?.nome ?? '';      break
      case 'gse': {
        const pa = getUltimoPeriodico(a.asos); const pb = getUltimoPeriodico(b.asos)
        va = pa?.gse ?? 0; vb = pb?.gse ?? 0; break
      }
      case 'base':            va = a.bases?.nome ?? '';        vb = b.bases?.nome ?? '';        break
      case 'situacao':        va = a.situacao ?? '';           vb = b.situacao ?? '';           break
      case 'admissional': {
        va = getAdmissional(a.asos)?.data_realizacao ?? ''
        vb = getAdmissional(b.asos)?.data_realizacao ?? ''
        break
      }
      case 'ultimo_periodico': {
        va = getUltimoPeriodico(a.asos)?.data_realizacao ?? ''
        vb = getUltimoPeriodico(b.asos)?.data_realizacao ?? ''
        break
      }
      case 'vencimento': {
        va = getUltimoPeriodico(a.asos)?.data_vencimento ?? ''
        vb = getUltimoPeriodico(b.asos)?.data_vencimento ?? ''
        break
      }
      case 'status': {
        const ordem: Record<StatusASO, number> = {
          vencido: 0, atencao: 1, critico: 2, no_prazo: 3, sem_aso: 4,
        }
        va = ordem[getStatusColaborador(a)]; vb = ordem[getStatusColaborador(b)]; break
      }
    }
    if (va < vb) return ordemDir === 'asc' ? -1 : 1
    if (va > vb) return ordemDir === 'asc' ? 1 : -1
    return 0
  })

  function toggleOrdem(col: OrdemColuna) {
    if (ordemCol === col) setOrdemDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setOrdemCol(col); setOrdemDir('asc') }
  }

  function limparFiltros() {
    setBusca('')
    setFiltroBase('')
    setFiltroSituacao('ATIVO')
    setFiltroGerencia('')
    setCardAtivo(null)
  }

  const hasFiltroAtivo =
    busca || filtroBase || filtroGerencia || filtroSituacao !== 'ATIVO' || cardAtivo !== null

  const CARDS = [
    { key: 'total'    as CardFiltro, label: 'Total',                   valor: stats.total,     cor: '#6366f1', bg: '#eef2ff' },
    { key: 'no_prazo' as CardFiltro, label: 'No Prazo',                valor: stats.no_prazo,  cor: '#16a34a', bg: '#dcfce7' },
    { key: 'critico'  as CardFiltro, label: 'Prazo Crítico',           valor: stats.critico,   cor: '#a16207', bg: '#fef9c3' },
    { key: 'atencao'  as CardFiltro, label: 'Bernhoeft com Atenção',   valor: stats.atencao,   cor: '#c2410c', bg: '#ffedd5' },
    { key: 'vencido'  as CardFiltro, label: 'Vencidos',                valor: stats.vencido,   cor: '#dc2626', bg: '#fee2e2' },
  ]

  const thProps = { ordemCol, ordemDir, onToggle: toggleOrdem }

  if (carregando) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <p style={{ color: '#aaa', fontSize: 14 }}>Carregando...</p>
      </div>
    )
  }

  return (
    <div style={{ fontFamily: 'Arial, sans-serif' }}>
      {/* TÍTULO */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#1a1a1a' }}>
          Medicina do Trabalho
        </h1>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: '#888' }}>
          Gestão de ASOs e vencimentos periódicos
        </p>
      </div>

      {/* CARDS */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)',
        gap: 14, marginBottom: 28,
      }}>
        {CARDS.map(card => {
          const ativo = cardAtivo === card.key
          return (
            <div
              key={String(card.key)}
              onClick={() => setCardAtivo(ativo ? null : card.key)}
              style={{
                backgroundColor: ativo ? card.cor : 'white',
                border: `2px solid ${ativo ? card.cor : '#e8e8e8'}`,
                borderRadius: 12, padding: '16px 20px',
                cursor: 'pointer', transition: 'all 0.2s',
                boxShadow: ativo
                  ? `0 4px 16px ${card.cor}40`
                  : '0 1px 4px rgba(0,0,0,0.06)',
              }}
            >
              <p style={{
                margin: 0, fontSize: 12, fontWeight: 500,
                color: ativo ? 'rgba(255,255,255,0.85)' : '#888',
              }}>
                {card.label}
              </p>
              <p style={{
                margin: '8px 0 0', fontSize: 28, fontWeight: 700,
                color: ativo ? 'white' : card.cor,
              }}>
                {card.valor}
              </p>
            </div>
          )
        })}
      </div>

      {/* FILTROS */}
      <div style={{
        backgroundColor: 'white', borderRadius: 12, padding: '14px 18px',
        marginBottom: 20, border: '1px solid #e8e8e8',
        display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
      }}>
        <input
          type="text"
          placeholder="Buscar por nome ou matrícula..."
          value={busca}
          onChange={e => setBusca(e.target.value)}
          style={{
            flex: 1, minWidth: 200, height: 36, border: '1px solid #e0e0e0',
            borderRadius: 8, padding: '0 12px', fontSize: 13, outline: 'none', fontFamily: 'Arial',
          }}
        />
        <select
          value={filtroBase}
          onChange={e => setFiltroBase(e.target.value)}
          style={{
            height: 36, border: '1px solid #e0e0e0', borderRadius: 8,
            padding: '0 10px', fontSize: 13, outline: 'none',
            backgroundColor: 'white', fontFamily: 'Arial',
          }}
        >
          <option value="">Todas as Bases</option>
          {bases.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
        <select
          value={filtroSituacao}
          onChange={e => setFiltroSituacao(e.target.value)}
          style={{
            height: 36, border: '1px solid #e0e0e0', borderRadius: 8,
            padding: '0 10px', fontSize: 13, outline: 'none',
            backgroundColor: 'white', fontFamily: 'Arial',
          }}
        >
          <option value="">Todas as Situações</option>
          <option value="ATIVO">Ativo</option>
          <option value="INATIVO">Inativo</option>
        </select>
        <select
          value={filtroGerencia}
          onChange={e => setFiltroGerencia(e.target.value)}
          style={{
            height: 36, border: '1px solid #e0e0e0', borderRadius: 8,
            padding: '0 10px', fontSize: 13, outline: 'none',
            backgroundColor: 'white', fontFamily: 'Arial',
          }}
        >
          <option value="">Todas as Gerências</option>
          {gerencias.map(g => (
            <option key={g.id} value={g.sigla}>{g.sigla} — {g.nome}</option>
          ))}
        </select>
        {hasFiltroAtivo && (
          <button
            onClick={limparFiltros}
            style={{
              height: 36, padding: '0 14px', fontSize: 13,
              border: '1px solid #e0e0e0', borderRadius: 8,
              cursor: 'pointer', background: 'white', color: '#666',
              display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'Arial',
            }}
          >
            ✕ Limpar
          </button>
        )}
      </div>

      {/* TABELA */}
      <div style={{
        backgroundColor: 'white', border: '1px solid #e8e8e8', borderRadius: 12,
        overflow: 'hidden',
      }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                <ThSort col="matricula"       label="Matrícula"        {...thProps} />
                <ThSort col="nome"            label="Nome"             {...thProps} />
                <ThSort col="funcao"          label="Função"           {...thProps} />
                <ThSort col="gse"             label="GSE"              {...thProps} />
                <ThSort col="base"            label="Base"             {...thProps} />
                <ThSort col="situacao"        label="Situação"         {...thProps} />
                <ThSort col="admissional"     label="ASO Admissional"  {...thProps} />
                <ThSort col="ultimo_periodico" label="Último Periódico" {...thProps} />
                <ThSort col="vencimento"      label="Vencimento"       {...thProps} />
                <ThSort col="status"          label="Status"           {...thProps} />
                <th style={{
                  padding: '12px 14px', fontSize: 12, fontWeight: 600, color: '#666',
                  backgroundColor: '#fafafa', whiteSpace: 'nowrap',
                  position: 'sticky', top: 0, zIndex: 2,
                  borderBottom: '2px solid #e8e8e8',
                }}>
                  Ações
                </th>
              </tr>
            </thead>
            <tbody>
              {ordenados.length === 0 ? (
                <tr>
                  <td colSpan={11} style={{
                    padding: '56px 0', textAlign: 'center',
                    color: '#aaa', fontSize: 14,
                  }}>
                    Nenhum colaborador encontrado.
                  </td>
                </tr>
              ) : (
                ordenados.map((col, i) => {
                  const admissional = getAdmissional(col.asos || [])
                  const periodico   = getUltimoPeriodico(col.asos || [])
                  const status      = getStatusColaborador(col)
                  const coresStatus = statusCores(status)
                  const coresSit    = situacaoCores(col.situacao)
                  const bgRow       = i % 2 === 0 ? 'white' : '#fafafa'

                  let corVenc = '#1a1a1a'
                  if (periodico?.data_vencimento) {
                    const s = getStatusASO(periodico.data_vencimento)
                    if (s === 'vencido') corVenc = '#dc2626'
                    else if (s === 'atencao') corVenc = '#c2410c'
                    else if (s === 'critico') corVenc = '#a16207'
                    else corVenc = '#15803d'
                  }

                  return (
                    <tr
                      key={col.matricula}
                      style={{ backgroundColor: bgRow, borderBottom: '1px solid #f0f0f0' }}
                    >
                      <td style={{ padding: '10px 14px', color: '#555' }}>
                        {col.matricula}
                      </td>
                      <td style={{
                        padding: '10px 14px', fontWeight: 500,
                        color: '#1a1a1a', whiteSpace: 'nowrap',
                      }}>
                        {col.nome}
                      </td>
                      <td style={{ padding: '10px 14px', color: '#555' }}>
                        {col.funcoes?.nome ?? '—'}
                      </td>
                      <td style={{ padding: '10px 14px', color: '#555', textAlign: 'center' }}>
                        {periodico?.gse ?? '—'}
                      </td>
                      <td style={{ padding: '10px 14px', color: '#555' }}>
                        {col.bases?.nome ?? '—'}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{
                          backgroundColor: coresSit.bg, color: coresSit.text,
                          fontSize: 11, fontWeight: 600,
                          padding: '3px 10px', borderRadius: 20,
                        }}>
                          {col.situacao ?? '—'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', color: '#555', whiteSpace: 'nowrap' }}>
                        {formatarData(admissional?.data_realizacao)}
                      </td>
                      <td style={{ padding: '10px 14px', color: '#555', whiteSpace: 'nowrap' }}>
                        {formatarData(periodico?.data_realizacao)}
                      </td>
                      <td style={{
                        padding: '10px 14px', fontWeight: 600,
                        color: corVenc, whiteSpace: 'nowrap',
                      }}>
                        {formatarData(periodico?.data_vencimento)}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{
                          backgroundColor: coresStatus.bg, color: coresStatus.text,
                          fontSize: 11, fontWeight: 600,
                          padding: '3px 10px', borderRadius: 20, whiteSpace: 'nowrap',
                        }}>
                          {statusLabel(status)}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            onClick={() => setModalVerASOs(col)}
                            style={{
                              padding: '5px 12px', fontSize: 12,
                              border: '1px solid #e0e0e0', borderRadius: 6,
                              cursor: 'pointer', background: 'white', color: '#555',
                              whiteSpace: 'nowrap', fontFamily: 'Arial',
                            }}
                          >
                            Ver ASOs
                          </button>
                          <button
                            onClick={() => setModalNovoASO(col)}
                            style={{
                              padding: '5px 12px', fontSize: 12,
                              backgroundColor: COR, color: 'white',
                              border: 'none', borderRadius: 6,
                              cursor: 'pointer', whiteSpace: 'nowrap',
                              fontWeight: 600, fontFamily: 'Arial',
                            }}
                          >
                            + Novo ASO
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Rodapé */}
        <div style={{
          padding: '12px 20px', borderTop: '1px solid #f0f0f0',
          fontSize: 12, color: '#aaa', backgroundColor: '#fafafa',
        }}>
          {ordenados.length} colaborador{ordenados.length !== 1 ? 'es' : ''} encontrado
          {ordenados.length !== filtrados.length || filtrados.length !== colaboradores.length
            ? ` de ${colaboradores.length} total`
            : ''}
        </div>
      </div>

      {/* MODAL VER ASOs */}
      {modalVerASOs && (
        <ModalVerASOs
          colaborador={modalVerASOs}
          onClose={() => setModalVerASOs(null)}
          onNovoASO={() => {
            const c = modalVerASOs
            setModalVerASOs(null)
            setModalNovoASO(c)
          }}
        />
      )}

      {/* MODAL NOVO ASO */}
      {modalNovoASO && (
        <ModalNovoASO
          colaborador={modalNovoASO}
          onClose={() => setModalNovoASO(null)}
          onSalvo={() => {
            setModalNovoASO(null)
            carregar()
          }}
        />
      )}
    </div>
  )
}
