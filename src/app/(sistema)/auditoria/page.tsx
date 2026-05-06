'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'

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
  bases: { nome: string } | null
} | null
  regras_vencimento: {
    nome_item: string
  } | null
}

export default function AuditoriaPage() {
  const router = useRouter()
  const { usuario } = useAuth()
  const [registros, setRegistros] = useState<Registro[]>([])
  const [carregando, setCarregando] = useState(true)
  const [filtroStatus, setFiltroStatus] = useState('pendente')
  const [filtroBase, setFiltroBase] = useState('')
  const [bases, setBases] = useState<{ id: number; nome: string }[]>([])
  const [modalAberto, setModalAberto] = useState(false)
  const [registroSelecionado, setRegistroSelecionado] = useState<Registro | null>(null)
  const [formAuditoria, setFormAuditoria] = useState({ validado: true, observacao: '' })
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

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

  useEffect(() => {
    buscar()
  }, [filtroStatus, filtroBase])

  async function buscar() {
    setCarregando(true)

    let query = supabase
      .from('registros_exames')
      .select(`
        id, matricula_colaborador, regra_id, data_realizacao, data_vencimento, url_arquivo,
        logs_auditoria (id, auditor_email, data_auditoria, validado, observacao),
        colaboradores (nome, bases (nome), funcoes (nome)),
        regras_vencimento (nome_item)
      `)
      .eq('is_atual', true)
      .order('data_vencimento', { ascending: true })

    const { data } = await query
    let resultado = (data as unknown as Registro[]) || []

    // Filtro por status
    if (filtroStatus === 'pendente') {
      resultado = resultado.filter(r => {
        const auditorias = r.logs_auditoria || []
        if (auditorias.length === 0) return true
        const ultima = [...auditorias].sort((a, b) =>
          new Date(b.data_auditoria).getTime() - new Date(a.data_auditoria).getTime()
        )[0]
        return !ultima.validado
      })
    } else if (filtroStatus === 'validado') {
      resultado = resultado.filter(r => {
        const auditorias = r.logs_auditoria || []
        if (auditorias.length === 0) return false
        const ultima = [...auditorias].sort((a, b) =>
          new Date(b.data_auditoria).getTime() - new Date(a.data_auditoria).getTime()
        )[0]
        return ultima.validado
      })
    } else if (filtroStatus === 'sem_arquivo') {
      resultado = resultado.filter(r => !r.url_arquivo)
    }

    // Filtro por base
    if (filtroBase) {
      resultado = resultado.filter(r =>
        (r.colaboradores?.bases as any)?.id === parseInt(filtroBase) ||
        (r.colaboradores?.bases as any)?.nome !== undefined
      )
    }

    // Se não for admin, filtrar por bases do usuário
    if (usuario && usuario.nivel !== 'admin' && usuario.bases.length > 0) {
      resultado = resultado.filter(r =>
        usuario.bases.includes((r.colaboradores?.bases as any)?.id)
      )
    }

    setRegistros(resultado)
    setCarregando(false)
  }

  function abrirAuditoria(registro: Registro) {
    if (!usuario?.pode_auditar) return
    setRegistroSelecionado(registro)
    setFormAuditoria({ validado: true, observacao: '' })
    setErro(null)
    setModalAberto(true)
  }

  async function salvarAuditoria() {
    if (!registroSelecionado || !usuario) return
    if (!formAuditoria.validado && !formAuditoria.observacao) {
      setErro('Informe o motivo da reprovação.')
      return
    }

    setSalvando(true)
    setErro(null)

    const { error } = await supabase.from('logs_auditoria').insert({
      registro_id: registroSelecionado.id,
      auditor_email: usuario.email,
      validado: formAuditoria.validado,
      observacao: formAuditoria.observacao || null,
      data_auditoria: new Date().toISOString(),
    })

    if (error) {
      setErro('Erro ao salvar: ' + error.message)
      setSalvando(false)
      return
    }

    setSalvando(false)
    setModalAberto(false)
    await buscar()
  }

  function getStatusAuditoria(registro: Registro) {
    const auditorias = registro.logs_auditoria || []
    if (auditorias.length === 0) return { label: 'Pendente', cor: '#888', bg: '#f5f5f5' }
    const ultima = [...auditorias].sort((a, b) =>
      new Date(b.data_auditoria).getTime() - new Date(a.data_auditoria).getTime()
    )[0]
    if (ultima.validado) return { label: 'Validado', cor: '#16a34a', bg: '#f0fdf4' }
    return { label: 'Reprovado', cor: '#dc2626', bg: '#fef2f2' }
  }

  const inputStyle = {
    width: '100%', height: 38, border: '1px solid #e0e0e0',
    borderRadius: 8, padding: '0 12px', fontSize: 13,
    color: '#333', backgroundColor: '#fafafa', outline: 'none',
    boxSizing: 'border-box' as const,
  }

  const totalPendentes = registros.filter(r => {
    const aud = r.logs_auditoria || []
    if (aud.length === 0) return true
    const ultima = [...aud].sort((a, b) => new Date(b.data_auditoria).getTime() - new Date(a.data_auditoria).getTime())[0]
    return !ultima.validado
  }).length

  return (
    <div style={{ fontFamily: 'Arial, sans-serif' }}>
      <h1 style={{ fontSize: 22, fontWeight: 500, color: '#1a1a1a', marginBottom: 4 }}>Auditoria</h1>
      <p style={{ fontSize: 14, color: '#888', marginBottom: 24 }}>
        Revisão e validação de documentos de treinamento
      </p>

      {/* CARDS RESUMO */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Total de Registros', valor: registros.length, cor: '#4a4a49' },
          { label: 'Pendentes / Reprovados', valor: totalPendentes, cor: '#d97706' },
          { label: 'Sem Arquivo', valor: registros.filter(r => !r.url_arquivo).length, cor: '#dc2626' },
        ].map((card, i) => (
          <div key={i} style={{ backgroundColor: 'white', borderRadius: 12, padding: '16px 20px', border: '1px solid #f0f0f0' }}>
            <p style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>{card.label}</p>
            <p style={{ fontSize: 28, fontWeight: 600, color: card.cor, margin: 0 }}>{card.valor}</p>
          </div>
        ))}
      </div>

      {/* FILTROS */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' as const }}>
        <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}
          style={{ ...inputStyle, width: 200 }}>
          <option value="todos">Todos</option>
          <option value="pendente">Pendentes / Reprovados</option>
          <option value="validado">Validados</option>
          <option value="sem_arquivo">Sem arquivo</option>
        </select>
        <select value={filtroBase} onChange={e => setFiltroBase(e.target.value)}
          style={{ ...inputStyle, width: 180 }}>
          <option value="">Todas as bases</option>
          {bases.map(b => <option key={b.id} value={b.id}>{b.nome}</option>)}
        </select>
        <span style={{ fontSize: 13, color: '#888', alignSelf: 'center' }}>
          {registros.length} registros
        </span>
      </div>

      {/* TABELA */}
      {carregando ? (
        <p style={{ color: '#888', fontSize: 14 }}>Carregando...</p>
      ) : (
        <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid #f0f0f0' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: 'white', fontSize: 13 }}>
            <thead>
              <tr style={{ backgroundColor: '#fafafa', borderBottom: '1px solid #f0f0f0' }}>
                {['Colaborador', 'Função', 'Base', 'Treinamento', 'Realizado', 'Vencimento', 'Arquivo', 'Status', ''].map((h, i) => (
                  <th key={i} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 500, color: '#555', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {registros.map((r, i) => {
                const status = getStatusAuditoria(r)
                return (
                  <tr key={r.id} style={{ borderBottom: '1px solid #f5f5f5', backgroundColor: i % 2 === 0 ? 'white' : '#fafafa' }}>
                    <td style={{ padding: '10px 16px', fontWeight: 500, color: '#333', whiteSpace: 'nowrap' }}>
                      {r.colaboradores?.nome || '—'}
                    </td>
                    <td style={{ padding: '10px 16px', color: '#666' }}>{r.colaboradores?.funcoes?.nome || '—'}</td>
                    <td style={{ padding: '10px 16px', color: '#666', whiteSpace: 'nowrap' }}>
                      {r.colaboradores?.bases?.nome || '—'}
                    </td>
                    <td style={{ padding: '10px 16px', color: '#666', whiteSpace: 'nowrap' }}>
                      {r.regras_vencimento?.nome_item || '—'}
                    </td>
                    <td style={{ padding: '10px 16px', color: '#666', whiteSpace: 'nowrap' }}>
                      {new Date(r.data_realizacao + 'T12:00:00').toLocaleDateString('pt-BR')}
                    </td>
                    <td style={{ padding: '10px 16px', color: '#666', whiteSpace: 'nowrap' }}>
                      {new Date(r.data_vencimento + 'T12:00:00').toLocaleDateString('pt-BR')}
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      {r.url_arquivo
                        ? <a href={r.url_arquivo} target="_blank" rel="noreferrer" style={{ color: '#2563eb', fontSize: 12 }}>Ver arquivo</a>
                        : <span style={{ color: '#f59e0b', fontSize: 12 }}>Sem arquivo</span>
                      }
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, backgroundColor: status.bg, color: status.cor }}>
                        {status.label}
                      </span>
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      {usuario?.pode_auditar && (
                        <button onClick={() => abrirAuditoria(r)} style={{
                          fontSize: 12, color: '#9f183c', background: 'none',
                          border: '1px solid #9f183c', borderRadius: 6,
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
      )}

      {/* MODAL AUDITORIA */}
      {modalAberto && registroSelecionado && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ backgroundColor: 'white', borderRadius: 16, padding: 32, width: '100%', maxWidth: 520, boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 500, margin: 0 }}>Auditar Documento</h2>
                <p style={{ fontSize: 13, color: '#888', margin: '4px 0 0' }}>
                  {registroSelecionado.colaboradores?.nome} — {registroSelecionado.regras_vencimento?.nome_item}
                </p>
              </div>
              <button onClick={() => setModalAberto(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#888' }}>x</button>
            </div>

            {/* Preview do arquivo */}
            {registroSelecionado.url_arquivo && (
              <div style={{ marginBottom: 20, padding: 12, backgroundColor: '#f9f9f9', borderRadius: 8 }}>
                <a href={registroSelecionado.url_arquivo} target="_blank" rel="noreferrer"
                  style={{ fontSize: 13, color: '#2563eb', display: 'flex', alignItems: 'center', gap: 8 }}>
                  📎 Visualizar documento
                </a>
              </div>
            )}

            {/* Decisão */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, color: '#666', marginBottom: 8 }}>Decisão *</label>
              <div style={{ display: 'flex', gap: 12 }}>
                <button
                  onClick={() => setFormAuditoria({ ...formAuditoria, validado: true })}
                  style={{
                    flex: 1, height: 42, borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer',
                    border: formAuditoria.validado ? '2px solid #16a34a' : '1px solid #e0e0e0',
                    backgroundColor: formAuditoria.validado ? '#f0fdf4' : 'white',
                    color: formAuditoria.validado ? '#16a34a' : '#555',
                  }}
                >
                  Aprovar
                </button>
                <button
                  onClick={() => setFormAuditoria({ ...formAuditoria, validado: false })}
                  style={{
                    flex: 1, height: 42, borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer',
                    border: !formAuditoria.validado ? '2px solid #dc2626' : '1px solid #e0e0e0',
                    backgroundColor: !formAuditoria.validado ? '#fef2f2' : 'white',
                    color: !formAuditoria.validado ? '#dc2626' : '#555',
                  }}
                >
                  Reprovar
                </button>
              </div>
            </div>

            {/* Observação */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, color: '#666', marginBottom: 5 }}>
                Observação {!formAuditoria.validado && <span style={{ color: '#dc2626' }}>*</span>}
              </label>
              <textarea
                value={formAuditoria.observacao}
                onChange={e => setFormAuditoria({ ...formAuditoria, observacao: e.target.value })}
                placeholder={!formAuditoria.validado ? 'Informe o motivo da reprovação...' : 'Observação opcional...'}
                rows={3}
                style={{ ...inputStyle, height: 'auto', padding: '8px 12px', resize: 'none' as const }}
              />
            </div>

            {erro && (
              <div style={{ marginBottom: 16, fontSize: 13, color: '#b91c1c', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px' }}>
                {erro}
              </div>
            )}

            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button onClick={() => setModalAberto(false)} style={{ height: 38, padding: '0 20px', border: '1px solid #e0e0e0', borderRadius: 8, fontSize: 13, cursor: 'pointer', background: 'white', color: '#555' }}>
                Cancelar
              </button>
              <button onClick={salvarAuditoria} disabled={salvando} style={{
                height: 38, padding: '0 24px',
                backgroundColor: formAuditoria.validado ? '#16a34a' : '#dc2626',
                color: 'white', border: 'none', borderRadius: 8,
                fontSize: 13, fontWeight: 500, cursor: 'pointer',
                opacity: salvando ? 0.7 : 1,
              }}>
                {salvando ? 'Salvando...' : formAuditoria.validado ? 'Aprovar' : 'Reprovar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}