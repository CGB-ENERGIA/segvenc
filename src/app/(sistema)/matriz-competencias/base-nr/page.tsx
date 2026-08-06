'use client'

import { useEffect, useState, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import { uploadParaR2 } from '@/lib/r2-client'

// ─── CONSTANTES ───────────────────────────────────────────────────────────────
const COR = '#9f183c'
const NRS_ALVO = ['NR 10-B', 'NR 11', 'NR 12 - II', 'NR 12 - V', 'NR 12 - XII', 'NR 20', 'NR 35']
const COL_MATRICULA = 110
const COL_NOME = 230
const COL_FUNCAO = 170
const COL_PROCESSO = 120
// Situações excluídas por padrão ao abrir a página
const SITUACOES_EXCLUIDAS_PADRAO = ['DEMITIDO', 'AF.PREVIDÊNCIA', 'LICENÇA MATERNIDADE']

// ─── TIPOS ───────────────────────────────────────────────────────────────────
interface Auditoria { id: string; auditor_email: string; data_auditoria: string; validado: boolean; observacao: string | null }
interface Programacao { id: string; data_programada: string; observacao: string | null; criado_por: string; created_at: string }
interface Registro { id: string; regra_id: number; data_realizacao: string; data_vencimento: string | null; url_arquivo: string | null; logs_auditoria: Auditoria[]; programacoes?: Programacao[] }
interface Colaborador { matricula: string; nome: string; funcao_id: number | null; funcoes: { nome: string } | null; situacao: string; bases: { nome: string } | null; gerencia: string | null; supervisor: string | null; data_admissao: string | null; processo: string | null; registros_exames: Registro[] }
interface NR { id: number; nome: string; validade_dias: number | null }
interface Base { id: number; nome: string }
interface MatrizTreinamento { id: string; pagina: string; funcao: string; processo: string | null; treinamento: string; obrigatorio: string }

type StatusObrig = 'SIM' | 'NAO' | 'NA'
type OrdemColuna = 'matricula' | 'nome' | 'funcao' | 'processo' | 'base' | 'admissao' | 'situacao' | 'gerencia' | 'supervisor' | `nr_${number}`
type OrdemDirecao = 'asc' | 'desc'
type AbaModal = 'info' | 'documento' | 'programacao' | 'auditoria' | 'historico'

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function primeiroNome(s: string | null) { return s ? s.trim().split(' ')[0] : '—' }
function formatarData(d: string | null) { return d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : '—' }
function getStatus(dv: string) {
  const diff = (new Date(dv + 'T12:00:00').getTime() - new Date().getTime()) / 86400000
  if (diff < 0) return 'vencido'
  if (diff <= 30) return 'atencao'
  if (diff <= 60) return 'critico'
  return 'valido'
}
function getDias(dv: string) { return Math.ceil((new Date(dv).getTime() - new Date().getTime()) / 86400000) }

function getObrigatoriedade(matriz: MatrizTreinamento[], funcaoColab: string | null, processoColab: string | null, nomeNr: string): StatusObrig {
  if (!funcaoColab) return 'NA'
  const fC = funcaoColab.trim().toUpperCase()
  const pC = (processoColab || '').trim().toUpperCase()
  const nN = nomeNr.trim().toUpperCase()
  const regra = matriz.find(m => {
    const mF = m.funcao.trim().toUpperCase()
    const mT = m.treinamento.trim().toUpperCase()
    if (m.processo && m.processo.trim() !== '') return mF === fC && m.processo.trim().toUpperCase() === pC && mT === nN
    return mF === fC && mT === nN
  })
  if (!regra) return 'NA'
  const v = regra.obrigatorio.trim().toUpperCase()
  if (v === 'SIM') return 'SIM'
  if (v === 'NÃO' || v === 'NAO') return 'NAO'
  return 'NA'
}

function calcStats(colabs: Colaborador[], nrs: NR[], colunasVisiveis: string[], matriz: MatrizTreinamento[]) {
  let v = 0, c60 = 0, c30 = 0, vc = 0, prog = 0
  colabs.forEach(c => {
    nrs.filter(nr => colunasVisiveis.includes(`nr_${nr.id}`)).forEach(nr => {
      if (getObrigatoriedade(matriz, c.funcoes?.nome || null, c.processo, nr.nome) !== 'SIM') return
      const r = c.registros_exames.find(r => r.regra_id === nr.id)
      if (!r) { vc++; return }
      if (nr.validade_dias === null) { v++; return }
      const s = getStatus(r.data_vencimento!)
      if (s === 'valido') v++
      else if (s === 'critico') c60++
      else if (s === 'atencao') c30++
      else vc++
      if ((s === 'critico' || s === 'atencao' || s === 'vencido') && (r.programacoes || []).some(p => p.data_programada >= hoje)) prog++
    })
  })
  return { validos: v, criticos: c60, atencao: c30, vencidos: vc, programados: prog }
}

const hoje = new Date().toISOString().split('T')[0]

// HELPER R2: Gera URL Assinada e abre o documento
async function visualizarDocumento(e: React.MouseEvent, urlOuKey: string) {
  e.preventDefault()
  try {
    let key = urlOuKey
    // Tratamento de compatibilidade para os dados antigos que estão no banco
    if (key.includes('supabase.co')) {
      const parts = key.split('documentos/')
      if (parts.length > 1) key = parts[1]
    }
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(`/api/r2/signed-url?key=${encodeURIComponent(key)}`, {
  headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
  })
  const data = await res.json()
  if (data.url) window.open(data.url, '_blank')
  else alert(data.error || 'Erro ao gerar link de visualização.')
  } catch (err) {
    console.error(err)
    alert('Erro ao abrir o documento.')
  }
}

// ─── EXPORTAÇÃO ──────────────────────────────────────────────────────────────
function gerarExport(colabs: Colaborador[], nrs: NR[], matriz: MatrizTreinamento[]) {
  return colabs.map(c => {
    const l: Record<string, string> = {
      'Matrícula': c.matricula, 'Nome': c.nome, 'Função': c.funcoes?.nome || '',
      'Processo': c.processo || '', 'Base': c.bases?.nome || '',
      'Admissão': formatarData(c.data_admissao), 'Situação': c.situacao,
      'Gerência': c.gerencia || '', 'Coordenador': c.supervisor || ''
    }
nrs.forEach(nr => {
      const obrig = getObrigatoriedade(matriz, c.funcoes?.nome || null, c.processo, nr.nome)
      const r = c.registros_exames.find(r => r.regra_id === nr.id)
      // Só marca N/A quando NÃO há curso lançado. Havendo registro, exporta o
      // curso mesmo a função sendo NA (curso opcional/extra).
      if (obrig === 'NA' && !r) { l[nr.nome] = 'N/A'; return }
      if (!r) { l[nr.nome] = obrig === 'SIM' ? 'Falta fazer' : 'Sem registro'; return }
      if (nr.validade_dias === null) { l[nr.nome] = 'Possui'; return }
      const s = getStatus(r.data_vencimento!)
      l[`${nr.nome} - Vencimento`] = formatarData(r.data_vencimento)
      l[`${nr.nome} - Status`] = s === 'valido' ? 'Válido' : s === 'critico' ? 'Prazo Crítico' : s === 'atencao' ? 'Bernhoeft c/ Atenção' : 'Vencido'
      l[`${nr.nome} - Documento`] = r.url_arquivo ? 'Com documento' : 'Sem documento'
    })
    return l
  })
}

function exportCSV(dados: Record<string, string>[]) {
  if (!dados.length) return
  const cols = Object.keys(dados[0])
  const csv = [cols.map(h => `"${h}"`).join(';'), ...dados.map(r => cols.map(h => `"${(r[h] || '').replace(/"/g, '""')}"`).join(';'))].join('\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' }))
  a.download = `base-nr-${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.csv`; a.click()
}
function exportXLSX(dados: Record<string, string>[]) {
  if (!dados.length) return
  import('xlsx').then(X => { const ws = X.utils.json_to_sheet(dados); const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, ws, 'BASE NR'); X.writeFile(wb, `base-nr-${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.xlsx`) })
}

// ─── FILTRO MULTI-SELECT SITUAÇÃO ─────────────────────────────────────────────
function FiltroSituacao({ opcoes, selecionadas, onChange }: {
  opcoes: string[]
  selecionadas: string[]
  onChange: (v: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [])

  const toggle = (s: string) => onChange(selecionadas.includes(s) ? selecionadas.filter(x => x !== s) : [...selecionadas, s])
  const todas = opcoes.every(o => selecionadas.includes(o))
  const nenhuma = selecionadas.length === 0

  // Label do botão
  let label = 'Todas as situações'
  if (nenhuma) label = 'Nenhuma'
  else if (!todas) {
    if (selecionadas.length === 1) label = selecionadas[0]
    else label = `${selecionadas.length} situações`
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(!open)} style={{ height: 36, border: '1px solid #e0e0e0', borderRadius: 8, padding: '0 10px', fontSize: 13, backgroundColor: 'white', color: '#555', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, minWidth: 160, justifyContent: 'space-between' }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        <span style={{ fontSize: 10, flexShrink: 0 }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 40, left: 0, zIndex: 150, backgroundColor: 'white', border: '1px solid #e0e0e0', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', width: 220, overflow: 'hidden' }}>
          {/* Selecionar todas */}
          <div style={{ padding: '8px 14px', borderBottom: '1px solid #f0f0f0' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 600, color: '#333', cursor: 'pointer' }}>
              <input type="checkbox" checked={todas} onChange={() => onChange(todas ? [] : opcoes)} style={{ accentColor: COR }} />
              Todas as situações
            </label>
          </div>
          {opcoes.map(op => (
            <label key={op} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px', fontSize: 12, cursor: 'pointer', backgroundColor: selecionadas.includes(op) ? '#fdf2f5' : 'white', color: selecionadas.includes(op) ? COR : '#555' }}>
              <input type="checkbox" checked={selecionadas.includes(op)} onChange={() => toggle(op)} style={{ accentColor: COR }} />
              {op}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── COMPONENTES ─────────────────────────────────────────────────────────────
function BotaoExportar({ onClick }: { onClick: (t: 'csv' | 'xlsx') => void }) {
  const [open, setOpen] = useState(false); const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h) }, [])
  return <div ref={ref} style={{ position: 'relative' }}>
    <button onClick={() => setOpen(!open)} style={{ height: 36, padding: '0 10px', fontSize: 12, border: '1px solid #e0e0e0', borderRadius: 8, backgroundColor: 'white', color: '#555', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
      <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M8 13h2m4 0h2M8 17h2m4 0h2M10 13v4" /></svg>
      <span style={{ fontSize: 10 }}>{open ? '▲' : '▼'}</span>
    </button>
    {open && <div style={{ position: 'absolute', top: 40, right: 0, zIndex: 150, backgroundColor: 'white', border: '1px solid #e0e0e0', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', width: 180, overflow: 'hidden' }}>
      {(['csv', 'xlsx'] as const).map((t, i) => <button key={t} onClick={() => { onClick(t); setOpen(false) }} style={{ width: '100%', padding: '10px 16px', fontSize: 13, textAlign: 'left', border: 'none', background: 'none', cursor: 'pointer', color: '#333', display: 'flex', alignItems: 'center', gap: 10, borderTop: i > 0 ? '1px solid #f0f0f0' : 'none' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f9f9f9'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>{t === 'csv' ? '📄 Exportar CSV' : '📊 Exportar Excel'}</button>)}
    </div>}
  </div>
}

function Icone({ tipo, cor, titulo, size = 16 }: { tipo: string; cor: string; titulo?: string; size?: number }) {
  const paths: Record<string, string> = {
    clipe: 'M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48',
    check: 'M22 11.08V12a10 10 0 11-5.93-9.14M22 4L12 14.01l-3-3',
    x_circulo: 'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM15 9l-6 6M9 9l6 6',
    relogio: 'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM12 6v6l4 2',
    calendario: 'M19 4H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2zM16 2v4M8 2v4M3 10h18',
    upload: 'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12',
    olho: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 9a3 3 0 100 6 3 3 0 000-6z',
    plus: 'M12 5v14M5 12h14',
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={cor} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}>{titulo && <title>{titulo}</title>}<path d={paths[tipo] || ''} /></svg>
}

function SeletorColunas({ colunas, visiveis, onChange }: { colunas: { key: string; label: string }[]; visiveis: string[]; onChange: (c: string[]) => void }) {
  const [open, setOpen] = useState(false); const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h) }, [])
  const toggle = (k: string) => onChange(visiveis.includes(k) ? visiveis.filter(v => v !== k) : [...visiveis, k])
  const todas = colunas.every(c => visiveis.includes(c.key))
  return <div ref={ref} style={{ position: 'relative' }}>
    <button onClick={() => setOpen(!open)} style={{ height: 36, border: '1px solid #e0e0e0', borderRadius: 8, padding: '0 12px', fontSize: 13, backgroundColor: 'white', color: '#555', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>⊞ Colunas {open ? '▲' : '▼'}</button>
    {open && <div style={{ position: 'absolute', top: 40, right: 0, zIndex: 150, backgroundColor: 'white', border: '1px solid #e0e0e0', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', width: 220, maxHeight: 360, overflowY: 'auto' }}>
      <div style={{ padding: '8px 14px', borderBottom: '1px solid #f0f0f0' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 600, color: '#333', cursor: 'pointer' }}>
          <input type="checkbox" checked={todas} onChange={() => onChange(todas ? [] : colunas.map(c => c.key))} style={{ accentColor: COR }} />Todas as colunas
        </label>
      </div>
      {colunas.map(col => <label key={col.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px', fontSize: 12, cursor: 'pointer', backgroundColor: visiveis.includes(col.key) ? '#fdf2f5' : 'white', color: visiveis.includes(col.key) ? COR : '#555' }}>
        <input type="checkbox" checked={visiveis.includes(col.key)} onChange={() => toggle(col.key)} style={{ accentColor: COR }} />{col.label}
      </label>)}
    </div>}
  </div>
}

function Th({ label, col, ord, dir, onClick, left, style }: { label: string; col: OrdemColuna; ord: OrdemColuna; dir: OrdemDirecao; onClick: (c: OrdemColuna) => void; left?: number; style?: React.CSSProperties }) {
  const ativo = ord === col
  const isSticky = left !== undefined
  return <th onClick={() => onClick(col)} style={{
    padding: '10px 12px', textAlign: 'left', fontWeight: 700, whiteSpace: 'nowrap',
    cursor: 'pointer', userSelect: 'none', color: ativo ? COR : '#333',
    borderBottom: ativo ? `2px solid ${COR}` : '2px solid #e0e0e0',
    borderRight: isSticky ? '2px solid #d0d0d0' : '1px solid #e8e8e8',
    position: 'sticky', top: 0,
    left: isSticky ? left : undefined,
    // ─── zIndex corrigido ───────────────────────────────────────────────────
    // th sticky normal:  100 (acima do scroll, abaixo dos modais)
    // th sticky coluna: 110 (acima dos th normais)
    // modais: 300+ (sempre acima de tudo na tabela)
    zIndex: isSticky ? 110 : 100,
    backgroundColor: '#fafafa',
    ...style,
  }}>
    {label} {ativo ? (dir === 'asc' ? '↑' : '↓') : <span style={{ color: '#ccc' }}>↕</span>}
  </th>
}

// ─── CÉLULA NR ────────────────────────────────────────────────────────────────
function CelulaNR({ reg, semPrazo, onClick, onIcone, compacto, obrig }: {
  reg: Registro | undefined; semPrazo: boolean
  onClick: () => void; onIcone: (t: 'documento' | 'programacao') => void
  compacto: boolean; obrig: StatusObrig
}) {
  const pad = compacto ? '6px 8px' : '8px 12px'; const minW = compacto ? 100 : 130
  const base: React.CSSProperties = { padding: pad, textAlign: 'center', verticalAlign: 'middle', minWidth: minW, borderBottom: '1px solid #f5f5f5', borderRight: '1px solid #f0f0f0' }
  const naoObrig = obrig === 'NAO' || obrig === 'NA'

  // NA SEM registro → hachura, mas clicável para registrar o curso mesmo assim
  if (obrig === 'NA' && !reg) return (
    <td style={{ ...base, background: 'repeating-linear-gradient(45deg,#fdfdfd,#fdfdfd 8px,#efefef 8px,#efefef 16px)', cursor: 'pointer' }} onClick={onClick} title="Não se aplica a esta função — clique para registrar o curso mesmo assim">
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
        <span style={{ fontSize: 11, color: '#ccc', fontStyle: 'italic' }}>N/A</span>
        <Icone tipo="plus" cor="#ccc" size={12} />
      </div>
    </td>
  )

  if (obrig === 'NAO' && !reg) return (
    <td style={{ ...base, backgroundColor: '#f9f9f9', cursor: 'pointer' }} onClick={onClick} title="Opcional — clique para adicionar">
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
        <span style={{ fontSize: compacto ? 10 : 11, color: '#bbb' }}>Opcional</span>
        <Icone tipo="plus" cor="#ccc" size={12} />
      </div>
    </td>
  )

  if (obrig === 'SIM' && !reg) return (
    <td style={{ ...base, backgroundColor: '#fef2f2', cursor: 'pointer' }} onClick={onClick}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
        <span style={{ fontSize: compacto ? 10 : 11, color: '#dc2626', fontWeight: 600 }}>Falta fazer</span>
        <Icone tipo="x_circulo" cor="#dc2626" size={13} />
      </div>
    </td>
  )

  if (!reg) return null

  if (semPrazo) {
    const temArq = !!reg.url_arquivo
    const aud = [...(reg.logs_auditoria || [])].sort((a, b) => new Date(b.data_auditoria).getTime() - new Date(a.data_auditoria).getTime())[0]
    return <td style={{ ...base, backgroundColor: '#f0fdf4', cursor: 'pointer' }} onClick={onClick}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Icone tipo="check" cor="#16a34a" size={13} /><span style={{ fontSize: compacto ? 10 : 11, color: '#16a34a', fontWeight: 600 }}>Possui</span></div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span onClick={e => { e.stopPropagation(); onIcone('documento') }} style={{ cursor: 'pointer', display: 'flex' }}><Icone tipo="clipe" cor={temArq ? '#2563eb' : '#9ca3af'} size={13} /></span>
          {!aud && <Icone tipo="relogio" cor="#9ca3af" titulo="Pendente" size={13} />}
          {aud?.validado && <Icone tipo="check" cor="#16a34a" titulo="Validado" size={13} />}
          {aud && !aud.validado && <Icone tipo="x_circulo" cor="#dc2626" titulo="Reprovado" size={13} />}
        </div>
      </div>
    </td>
  }

  const st = getStatus(reg.data_vencimento!); const dias = getDias(reg.data_vencimento!)
  const temArq = !!reg.url_arquivo
  const aud = [...(reg.logs_auditoria || [])].sort((a, b) => new Date(b.data_auditoria).getTime() - new Date(a.data_auditoria).getTime())[0]
  const prog = [...(reg.programacoes || [])].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
  const bgMap: Record<string, string> = { valido: '#f0fdf4', critico: '#fffbeb', atencao: '#fef9c3', vencido: '#fef2f2' }

  return <td style={{ ...base, backgroundColor: bgMap[st], cursor: 'pointer' }} onClick={onClick}>
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <span style={{ fontSize: compacto ? 10 : 11, color: '#555', fontWeight: 500 }}>{formatarData(reg.data_vencimento)}</span>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <span onClick={e => { e.stopPropagation(); onIcone('documento') }} style={{ cursor: 'pointer', display: 'flex' }}><Icone tipo="clipe" cor={temArq ? '#2563eb' : '#9ca3af'} size={13} /></span>
        {!aud && <Icone tipo="relogio" cor="#9ca3af" titulo="Pendente" size={13} />}
        {aud?.validado && <Icone tipo="check" cor="#16a34a" titulo="Validado" size={13} />}
        {aud && !aud.validado && <Icone tipo="x_circulo" cor="#dc2626" titulo="Reprovado" size={13} />}
        {(dias <= 30 || !!prog) && obrig === 'SIM' && (
          <span title={prog ? `Prog: ${formatarData(prog.data_programada)}` : 'Não programado'} onClick={e => { e.stopPropagation(); onIcone('programacao') }} style={{ cursor: 'pointer', display: 'flex' }}>
            <Icone tipo="calendario" cor={prog ? '#7c3aed' : '#9ca3af'} size={13} />
          </span>
        )}
      </div>
      {prog && obrig === 'SIM' && <span style={{ fontSize: 10, color: '#7c3aed', fontStyle: 'italic' }}>Prog: {formatarData(prog.data_programada)}</span>}
    </div>
  </td>
}

// ─── MODAL NOVO TREINAMENTO ───────────────────────────────────────────────────
function ModalNovoTrein({ colab, nrs, onClose, onUpdate, email }: { colab: Colaborador; nrs: NR[]; onClose: () => void; onUpdate: () => void; email: string }) {
  const [form, setForm] = useState({ regra_id: '', data_realizacao: '', data_vencimento: '' })
  const [arquivo, setArquivo] = useState<File | null>(null); const [salvando, setSalvando] = useState(false); const [erro, setErro] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const nrSel = nrs.find(n => n.id === parseInt(form.regra_id)); const semPrazo = nrSel?.validade_dias === null
  useEffect(() => {
    if (form.regra_id && form.data_realizacao && nrSel && nrSel.validade_dias !== null) {
      const d = new Date(form.data_realizacao + 'T12:00:00'); d.setDate(d.getDate() + nrSel.validade_dias)
      setForm(f => ({ ...f, data_vencimento: d.toISOString().split('T')[0] }))
    } else if (semPrazo) setForm(f => ({ ...f, data_vencimento: '' }))
  }, [form.regra_id, form.data_realizacao, nrSel, semPrazo])

  async function salvar() {
    if (!form.regra_id || !form.data_realizacao) { setErro('Preencha o tipo de NR e a data.'); return }
    setSalvando(true); setErro('')
    try {
      await supabase.from('registros_exames').update({ is_atual: false }).eq('matricula_colaborador', colab.matricula).eq('regra_id', parseInt(form.regra_id))
      const { data: novo, error: e } = await supabase.from('registros_exames').insert({ matricula_colaborador: colab.matricula, regra_id: parseInt(form.regra_id), data_realizacao: form.data_realizacao, data_vencimento: semPrazo ? null : form.data_vencimento || null, is_atual: true }).select().single()
      if (e) throw new Error(e.message)

      // Upload para R2
      if (arquivo && novo) {
        const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19); const ext = arquivo.name.split('.').pop()
        const path = `${colab.matricula}/${form.regra_id}/${ts}.${ext}`

        await uploadParaR2(arquivo, path)

        await supabase.from('registros_exames').update({ url_arquivo: path }).eq('id', novo.id)
      }
      onUpdate(); onClose()
    } catch (e: any) { setErro(e.message || 'Erro ao salvar') }
    setSalvando(false)
  }
  const inp: React.CSSProperties = { width: '100%', height: 38, border: '1px solid #e0e0e0', borderRadius: 8, padding: '0 12px', fontSize: 13, boxSizing: 'border-box', outline: 'none', backgroundColor: 'white' }
  return (
    // ─── zIndex 300: sempre acima dos th sticky (110) e td sticky (50) ────────
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}>
      <div style={{ backgroundColor: 'white', borderRadius: 16, padding: 28, width: '100%', maxWidth: 480, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div><h2 style={{ fontSize: 16, fontWeight: 600, color: '#1a1a1a', margin: 0 }}>Novo Treinamento NR</h2><p style={{ fontSize: 13, color: '#888', margin: '3px 0 0' }}>{colab.nome} · {colab.matricula}</p></div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#aaa' }}>✕</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div><label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>Tipo de NR *</label>
            <select value={form.regra_id} onChange={e => setForm(f => ({ ...f, regra_id: e.target.value }))} style={inp}>
              <option value="">Selecione...</option>{nrs.map(n => <option key={n.id} value={n.id}>{n.nome}</option>)}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: semPrazo ? '1fr' : '1fr 1fr', gap: 12 }}>
            <div><label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>Data de realização *</label><input type="date" value={form.data_realizacao} onChange={e => setForm(f => ({ ...f, data_realizacao: e.target.value }))} style={inp} /></div>
            {!semPrazo && <div><label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>Vencimento</label><input type="date" value={form.data_vencimento} onChange={e => setForm(f => ({ ...f, data_vencimento: e.target.value }))} style={{ ...inp, backgroundColor: form.data_vencimento ? '#f0fdf4' : 'white' }} />{form.data_vencimento && <p style={{ fontSize: 11, color: '#16a34a', margin: '3px 0 0' }}>✓ Calculado automaticamente</p>}</div>}
          </div>
          {semPrazo && <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '8px 12px' }}><p style={{ fontSize: 12, color: '#16a34a', margin: 0 }}>✓ Esta NR não possui prazo de vencimento</p></div>}
          <div><label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>Documento <span style={{ color: '#aaa' }}>(opcional)</span></label>
            <div onClick={() => fileRef.current?.click()} style={{ border: '2px dashed #e0e0e0', borderRadius: 10, padding: '16px 20px', textAlign: 'center', cursor: 'pointer', backgroundColor: '#fafafa' }}>
              <Icone tipo="upload" cor="#aaa" size={22} /><p style={{ fontSize: 12, color: '#888', margin: '6px 0 0' }}>{arquivo ? arquivo.name : 'Clique para anexar'}</p>
              <p style={{ fontSize: 11, color: '#bbb', margin: '2px 0 0' }}>PDF, JPG ou PNG</p>
              <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: 'none' }} onChange={e => setArquivo(e.target.files?.[0] || null)} />
            </div>
          </div>
          {erro && <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '8px 12px' }}><p style={{ fontSize: 12, color: '#dc2626', margin: 0 }}>{erro}</p></div>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
            <button onClick={onClose} style={{ height: 38, padding: '0 18px', border: '1px solid #e0e0e0', borderRadius: 8, fontSize: 13, cursor: 'pointer', background: 'white', color: '#555' }}>Cancelar</button>
            <button onClick={salvar} disabled={salvando} style={{ height: 38, padding: '0 22px', backgroundColor: COR, color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: salvando ? 'not-allowed' : 'pointer', opacity: salvando ? 0.7 : 1 }}>{salvando ? 'Salvando...' : 'Salvar'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── MODAL INCLUIR CURSO MANUAL ───────────────────────────────────────────────
// Diferença para o ModalNovoTrein: aqui o colaborador NÃO vem pronto — você
// busca qualquer colaborador (inclusive de função fora da matriz) e lança a NR.
function ModalCursoManual({ nrs, onClose, onUpdate, email }: { nrs: NR[]; onClose: () => void; onUpdate: () => void; email: string }) {
  const [busca, setBusca] = useState('')
  const [resultados, setResultados] = useState<any[]>([])
  const [buscando, setBuscando] = useState(false)
  const [colabSel, setColabSel] = useState<any | null>(null)
  const [form, setForm] = useState({ regra_id: '', data_realizacao: '', data_vencimento: '' })
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const nrSel = nrs.find(n => n.id === parseInt(form.regra_id)); const semPrazo = nrSel?.validade_dias === null

  // Busca de colaboradores em TODA a base (não só os da matriz), com debounce
  useEffect(() => {
    if (colabSel) return
    const termo = busca.trim()
    if (termo.length < 2) { setResultados([]); return }
    let ativo = true
    setBuscando(true)
    const t = setTimeout(async () => {
      const { data } = await supabase.from('colaboradores')
        .select('matricula,nome,processo,situacao,funcoes(nome),bases(nome)')
        .or(`nome.ilike.%${termo}%,matricula.ilike.%${termo}%`)
        .order('nome').limit(20)
      if (ativo) { setResultados(data || []); setBuscando(false) }
    }, 300)
    return () => { ativo = false; clearTimeout(t) }
  }, [busca, colabSel])

  // Vencimento automático = realização + validade_dias da NR (igual ao ModalNovoTrein)
  useEffect(() => {
    if (form.regra_id && form.data_realizacao && nrSel && nrSel.validade_dias !== null) {
      const d = new Date(form.data_realizacao + 'T12:00:00'); d.setDate(d.getDate() + nrSel.validade_dias)
      setForm(f => ({ ...f, data_vencimento: d.toISOString().split('T')[0] }))
    } else if (semPrazo) setForm(f => ({ ...f, data_vencimento: '' }))
  }, [form.regra_id, form.data_realizacao, nrSel, semPrazo])

  async function salvar() {
    if (!colabSel) { setErro('Selecione um colaborador.'); return }
    if (!form.regra_id || !form.data_realizacao) { setErro('Preencha o tipo de NR e a data.'); return }
    setSalvando(true); setErro('')
    try {
      // Mantém histórico: marca registros anteriores da mesma NR como não-atuais
      await supabase.from('registros_exames').update({ is_atual: false })
        .eq('matricula_colaborador', colabSel.matricula).eq('regra_id', parseInt(form.regra_id))
      const { data: novo, error: e } = await supabase.from('registros_exames').insert({
        matricula_colaborador: colabSel.matricula,
        regra_id: parseInt(form.regra_id),
        data_realizacao: form.data_realizacao,
        data_vencimento: semPrazo ? null : form.data_vencimento || null,
        is_atual: true,
      }).select().single()
      if (e) throw new Error(e.message)

      // Upload opcional para o R2
      if (arquivo && novo) {
        const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19); const ext = arquivo.name.split('.').pop()
        const path = `${colabSel.matricula}/${form.regra_id}/${ts}.${ext}`
        await uploadParaR2(arquivo, path)
        await supabase.from('registros_exames').update({ url_arquivo: path }).eq('id', novo.id)
      }
      onUpdate(); onClose()
    } catch (e: any) { setErro(e.message || 'Erro ao salvar') }
    setSalvando(false)
  }

  const inp: React.CSSProperties = { width: '100%', height: 38, border: '1px solid #e0e0e0', borderRadius: 8, padding: '0 12px', fontSize: 13, boxSizing: 'border-box', outline: 'none', backgroundColor: 'white' }

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}>
      <div style={{ backgroundColor: 'white', borderRadius: 16, padding: 28, width: '100%', maxWidth: 480, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: '#1a1a1a', margin: 0 }}>Incluir curso manual</h2>
            <p style={{ fontSize: 13, color: '#888', margin: '3px 0 0' }}>Registra uma NR para qualquer colaborador, mesmo fora da matriz</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#aaa' }}>✕</button>
        </div>

        {/* Passo 1 — escolher o colaborador */}
        {!colabSel ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>Colaborador *</label>
              <input autoFocus type="text" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Nome ou matrícula..." style={inp} />
            </div>
            <div style={{ maxHeight: 260, overflowY: 'auto', border: resultados.length ? '1px solid #f0f0f0' : 'none', borderRadius: 8 }}>
              {buscando
                ? <p style={{ fontSize: 13, color: '#aaa', padding: '8px 4px' }}>Buscando...</p>
                : busca.trim().length >= 2 && resultados.length === 0
                  ? <p style={{ fontSize: 13, color: '#aaa', padding: '8px 4px' }}>Nenhum colaborador encontrado.</p>
                  : resultados.map(c => (
                    <button key={c.matricula} onClick={() => { setColabSel(c); setResultados([]); setBusca('') }}
                      style={{ width: '100%', textAlign: 'left', padding: '10px 12px', border: 'none', borderBottom: '1px solid #f5f5f5', background: 'white', cursor: 'pointer' }}
                      onMouseEnter={e => e.currentTarget.style.backgroundColor = '#fdf2f5'}
                      onMouseLeave={e => e.currentTarget.style.backgroundColor = 'white'}>
                      <span style={{ fontSize: 13, fontWeight: 500, color: '#333' }}>{c.nome}</span>
                      <span style={{ fontSize: 12, color: '#888', marginLeft: 8 }}>{c.matricula} · {c.funcoes?.nome || 'Sem função'}</span>
                    </button>
                  ))}
            </div>
          </div>
        ) : (
          /* Passo 2 — lançar a NR */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f9f9f9', borderRadius: 8, padding: '10px 14px' }}>
              <div>
                <p style={{ fontSize: 13, fontWeight: 600, color: '#333', margin: 0 }}>{colabSel.nome}</p>
                <p style={{ fontSize: 12, color: '#888', margin: '2px 0 0' }}>{colabSel.matricula} · {colabSel.funcoes?.nome || 'Sem função'}</p>
              </div>
              <button onClick={() => setColabSel(null)} style={{ fontSize: 12, color: COR, background: 'none', border: 'none', cursor: 'pointer' }}>Trocar</button>
            </div>

            <div>
              <label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>Tipo de NR *</label>
              <select value={form.regra_id} onChange={e => setForm(f => ({ ...f, regra_id: e.target.value }))} style={inp}>
                <option value="">Selecione...</option>{nrs.map(n => <option key={n.id} value={n.id}>{n.nome}</option>)}
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: semPrazo ? '1fr' : '1fr 1fr', gap: 12 }}>
              <div><label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>Data de realização *</label><input type="date" value={form.data_realizacao} onChange={e => setForm(f => ({ ...f, data_realizacao: e.target.value }))} style={inp} /></div>
              {!semPrazo && <div><label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>Vencimento</label><input type="date" value={form.data_vencimento} onChange={e => setForm(f => ({ ...f, data_vencimento: e.target.value }))} style={{ ...inp, backgroundColor: form.data_vencimento ? '#f0fdf4' : 'white' }} />{form.data_vencimento && <p style={{ fontSize: 11, color: '#16a34a', margin: '3px 0 0' }}>✓ Calculado automaticamente</p>}</div>}
            </div>
            {semPrazo && <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '8px 12px' }}><p style={{ fontSize: 12, color: '#16a34a', margin: 0 }}>✓ Esta NR não possui prazo de vencimento</p></div>}
            <div>
              <label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>Documento <span style={{ color: '#aaa' }}>(opcional)</span></label>
              <div onClick={() => fileRef.current?.click()} style={{ border: '2px dashed #e0e0e0', borderRadius: 10, padding: '16px 20px', textAlign: 'center', cursor: 'pointer', backgroundColor: '#fafafa' }}>
                <Icone tipo="upload" cor="#aaa" size={22} /><p style={{ fontSize: 12, color: '#888', margin: '6px 0 0' }}>{arquivo ? arquivo.name : 'Clique para anexar'}</p>
                <p style={{ fontSize: 11, color: '#bbb', margin: '2px 0 0' }}>PDF, JPG ou PNG</p>
                <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: 'none' }} onChange={e => setArquivo(e.target.files?.[0] || null)} />
              </div>
            </div>
            {erro && <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '8px 12px' }}><p style={{ fontSize: 12, color: '#dc2626', margin: 0 }}>{erro}</p></div>}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
              <button onClick={onClose} style={{ height: 38, padding: '0 18px', border: '1px solid #e0e0e0', borderRadius: 8, fontSize: 13, cursor: 'pointer', background: 'white', color: '#555' }}>Cancelar</button>
              <button onClick={salvar} disabled={salvando} style={{ height: 38, padding: '0 22px', backgroundColor: COR, color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: salvando ? 'not-allowed' : 'pointer', opacity: salvando ? 0.7 : 1 }}>{salvando ? 'Salvando...' : 'Salvar curso'}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── MODAL EXAME ──────────────────────────────────────────────────────────────
function ModalExame({ dados, abaInicial, onClose, onUpdate, email, podeAuditar, nivel }: {
  dados: { colab: Colaborador; reg: Registro | undefined; nr: NR; abaInicial: AbaModal }
  abaInicial: AbaModal; onClose: () => void; onUpdate: () => void; email: string; podeAuditar: boolean; nivel: string
}) {
  const [aba, setAba] = useState<AbaModal>(abaInicial)
  const [progs, setProgs] = useState<Programacao[]>([]); const [loadProgs, setLoadProgs] = useState(false)
  const [formProg, setFormProg] = useState({ data_programada: '', observacao: '' }); const [salvProg, setSalvProg] = useState(false); const [errProg, setErrProg] = useState('')
  const [arquivo, setArquivo] = useState<File | null>(null); const [uploading, setUploading] = useState(false); const [errUp, setErrUp] = useState('')
  const [formAud, setFormAud] = useState({ validado: true, observacao: '' }); const [salvAud, setSalvAud] = useState(false); const [errAud, setErrAud] = useState('')
  const [modalExc, setModalExc] = useState(false); const [confNome, setConfNome] = useState(''); const [excluindo, setExcluindo] = useState(false); const [errExc, setErrExc] = useState('')
  const [historico, setHistorico] = useState<Registro[]>([])
  const [loadHistorico, setLoadHistorico] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const { colab, reg, nr } = dados

  useEffect(() => { if (aba === 'programacao' && reg) loadProgramacoes() }, [aba, reg])
  useEffect(() => { if (aba === 'historico') carregarHistorico() }, [aba])

  async function loadProgramacoes() { if (!reg) return; setLoadProgs(true); const { data } = await supabase.from('programacoes_exames').select('*').eq('registro_id', reg.id).order('created_at', { ascending: false }); setProgs(data || []); setLoadProgs(false) }

  async function carregarHistorico() {
    setLoadHistorico(true)
    const { data } = await supabase
      .from('registros_exames')
      .select('id, regra_id, data_realizacao, data_vencimento, url_arquivo, logs_auditoria(id, auditor_email, data_auditoria, validado, observacao)')
      .eq('matricula_colaborador', colab.matricula)
      .eq('regra_id', nr.id)
      .eq('is_atual', false)
      .order('data_realizacao', { ascending: false })
    setHistorico((data || []) as Registro[])
    setLoadHistorico(false)
  }

  async function salvarProg() { if (!reg || !formProg.data_programada) { setErrProg('Informe a data.'); return } setSalvProg(true); setErrProg(''); const { error } = await supabase.from('programacoes_exames').insert({ registro_id: reg.id, matricula_colaborador: colab.matricula, regra_id: nr.id, data_programada: formProg.data_programada, observacao: formProg.observacao || null, criado_por: email }); if (error) { setErrProg(error.message); setSalvProg(false); return } setFormProg({ data_programada: '', observacao: '' }); setSalvProg(false); loadProgramacoes(); onUpdate() }

  // Upload modificado para R2
  async function fazerUpload() {
    if (!arquivo || !reg) return;
    setUploading(true); setErrUp('');
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const ext = arquivo.name.split('.').pop();
    const path = `${colab.matricula}/${nr.id}/${ts}.${ext}`;

    try {
      await uploadParaR2(arquivo, path);
      const { error: de } = await supabase.from('registros_exames').update({ url_arquivo: path }).eq('id', reg.id);
      if (de) throw de;

      setArquivo(null);
      onUpdate();
      onClose();
    } catch (e: any) {
      setErrUp(e.message || 'Erro no envio');
    } finally {
      setUploading(false);
    }
  }

  async function salvarAud() { if (!reg) return; if (!formAud.validado && !formAud.observacao) { setErrAud('Informe o motivo.'); return } setSalvAud(true); setErrAud(''); const { error } = await supabase.from('logs_auditoria').insert({ registro_id: reg.id, auditor_email: email, validado: formAud.validado, observacao: formAud.observacao || null, data_auditoria: new Date().toISOString() }); if (error) { setErrAud(error.message); setSalvAud(false); return } setSalvAud(false); onUpdate(); onClose() }
  async function excluir() { if (!reg) return; if (confNome !== nr.nome) { setErrExc('Nome não confere.'); return } setExcluindo(true); const { error } = await supabase.from('registros_exames').delete().eq('id', reg.id); if (error) { setErrExc(error.message); setExcluindo(false); return } onUpdate(); onClose() }

  const auds = [...(reg?.logs_auditoria || [])].sort((a, b) => new Date(b.data_auditoria).getTime() - new Date(a.data_auditoria).getTime())

  const abas: { key: AbaModal; label: string }[] = [
    { key: 'info', label: 'Informações' },
    ...(nivel !== 'visualizador' ? [
      { key: 'documento' as AbaModal, label: 'Documento' },
      { key: 'programacao' as AbaModal, label: 'Programação' },
    ] : []),
    { key: 'historico', label: 'Histórico' },
  ]

  const inp: React.CSSProperties = { width: '100%', height: 38, border: '1px solid #e0e0e0', borderRadius: 8, padding: '0 12px', fontSize: 13, boxSizing: 'border-box', outline: 'none' }

  return (
    // ─── zIndex 300: sempre acima dos th sticky (110) ─────────────────────────
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}>
      <div style={{ backgroundColor: 'white', borderRadius: 16, width: '100%', maxWidth: 580, maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ padding: '24px 28px 0', borderBottom: '1px solid #f0f0f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
            <div><h2 style={{ fontSize: 17, fontWeight: 600, color: '#1a1a1a', margin: 0 }}>{nr.nome}</h2><p style={{ fontSize: 13, color: '#888', margin: '3px 0 0' }}>{colab.nome} · {colab.matricula}</p></div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#aaa', padding: '0 4px' }}>✕</button>
          </div>
          <div style={{ display: 'flex' }}>{abas.map(a => <button key={a.key} onClick={() => setAba(a.key)} style={{ padding: '8px 16px', fontSize: 13, fontWeight: aba === a.key ? 600 : 400, border: 'none', background: 'none', cursor: 'pointer', color: aba === a.key ? COR : '#888', borderBottom: aba === a.key ? `2px solid ${COR}` : '2px solid transparent', marginBottom: -1 }}>{a.label}</button>)}</div>
        </div>
        <div style={{ padding: '24px 28px', overflowY: 'auto', flex: 1 }}>

          {/* ── INFO ── */}
          {aba === 'info' && <div>
            {reg ? <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
                {[{ label: 'Realizado em', valor: formatarData(reg.data_realizacao) }, { label: 'Vencimento', valor: nr.validade_dias === null ? 'Sem prazo' : formatarData(reg.data_vencimento) }, { label: 'Base', valor: colab.bases?.nome || '—' }, { label: 'Função', valor: colab.funcoes?.nome || '—' }].map((item, i) => <div key={i} style={{ backgroundColor: '#f9f9f9', borderRadius: 8, padding: 12 }}><p style={{ fontSize: 11, color: '#888', margin: '0 0 4px' }}>{item.label}</p><p style={{ fontSize: 14, color: item.label === 'Vencimento' && nr.validade_dias === null ? '#16a34a' : '#333', margin: 0, fontWeight: 500 }}>{item.valor}</p></div>)}
              </div>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#333', margin: '0 0 12px' }}>Últimas auditorias</p>
              {auds.length === 0 ? <p style={{ fontSize: 13, color: '#aaa' }}>Nenhuma auditoria realizada.</p> : auds.slice(0, 3).map((log, i) => <div key={log.id} style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: '10px 14px', marginBottom: 8, borderLeft: `3px solid ${log.validado ? '#16a34a' : '#dc2626'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: 12, fontWeight: 500, color: log.validado ? '#16a34a' : '#dc2626' }}>{log.validado ? '✓ Validado' : '✗ Reprovado'}{i === 0 && <span style={{ fontSize: 10, color: '#aaa', marginLeft: 8 }}>mais recente</span>}</span><span style={{ fontSize: 11, color: '#aaa' }}>{new Date(log.data_auditoria).toLocaleString('pt-BR')}</span></div>
                <p style={{ fontSize: 12, color: '#666', margin: '4px 0 0' }}>{log.auditor_email}</p>
                {log.observacao && <p style={{ fontSize: 12, color: '#666', margin: '4px 0 0', fontStyle: 'italic' }}>"{log.observacao}"</p>}
              </div>)}
              {nivel === 'admin' && <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid #f0f0f0' }}><button onClick={() => { setConfNome(''); setErrExc(''); setModalExc(true) }} style={{ height: 36, padding: '0 16px', fontSize: 12, border: '1px solid #fca5a5', borderRadius: 8, backgroundColor: '#fef2f2', color: '#dc2626', cursor: 'pointer' }}>🗑 Excluir este registro</button></div>}
            </> : <div style={{ textAlign: 'center', padding: '40px 0', color: '#aaa' }}><p style={{ fontSize: 32, margin: '0 0 8px' }}>📋</p><p style={{ fontSize: 14 }}>Nenhum registro encontrado para esta NR.</p></div>}
          </div>}

          {/* ── MODAL EXCLUIR ── */}
          {modalExc && <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 400 }}>
            <div style={{ backgroundColor: 'white', borderRadius: 16, padding: 28, width: '100%', maxWidth: 440, boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, color: '#dc2626', margin: '0 0 8px' }}>Excluir registro</h3>
              <p style={{ fontSize: 13, color: '#555', margin: '0 0 16px', lineHeight: 1.5 }}>Esta ação é <strong>irreversível</strong>. Para confirmar, digite o nome da NR:</p>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#333', margin: '0 0 8px', padding: '8px 12px', backgroundColor: '#f9f9f9', borderRadius: 8, borderLeft: '3px solid #dc2626' }}>{nr.nome}</p>
              <input type="text" autoFocus value={confNome} onChange={e => setConfNome(e.target.value)} onKeyDown={e => e.key === 'Enter' && excluir()} placeholder="Digite o nome exato..." style={{ width: '100%', height: 38, border: '1px solid #e0e0e0', borderRadius: 8, padding: '0 12px', fontSize: 13, boxSizing: 'border-box', outline: 'none', marginBottom: 8 }} />
              {errExc && <p style={{ fontSize: 12, color: '#dc2626', margin: '0 0 12px' }}>{errExc}</p>}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 12 }}>
                <button onClick={() => setModalExc(false)} style={{ height: 38, padding: '0 18px', border: '1px solid #e0e0e0', borderRadius: 8, fontSize: 13, cursor: 'pointer', background: 'white', color: '#555' }}>Cancelar</button>
                <button onClick={excluir} disabled={excluindo || confNome !== nr.nome} style={{ height: 38, padding: '0 22px', backgroundColor: '#dc2626', color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: excluindo || confNome !== nr.nome ? 'not-allowed' : 'pointer', opacity: excluindo || confNome !== nr.nome ? 0.5 : 1 }}>{excluindo ? 'Excluindo...' : 'Confirmar exclusão'}</button>
              </div>
            </div>
          </div>}

          {/* ── DOCUMENTO ── */}
          {aba === 'documento' && <div>
            {reg?.url_arquivo ? <div style={{ marginBottom: 24 }}><p style={{ fontSize: 13, fontWeight: 600, color: '#333', margin: '0 0 12px' }}>Documento atual</p><a href="#" onClick={(e) => visualizarDocumento(e, reg.url_arquivo!)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 16, backgroundColor: '#eff6ff', borderRadius: 10, border: '1px solid #bfdbfe', color: '#2563eb', textDecoration: 'none', fontSize: 13, fontWeight: 500 }}><Icone tipo="olho" cor="#2563eb" size={18} />Visualizar documento</a></div>
              : <div style={{ marginBottom: 24, padding: 16, backgroundColor: '#fffbeb', borderRadius: 10, border: '1px solid #fde68a' }}><p style={{ fontSize: 13, color: '#92400e', margin: 0 }}>⚠️ Nenhum documento anexado ainda.</p></div>}
            {!reg && <p style={{ fontSize: 13, color: '#aaa', marginBottom: 16 }}>Registre a NR antes de anexar documento.</p>}
            {reg && <><p style={{ fontSize: 13, fontWeight: 600, color: '#333', margin: '0 0 12px' }}>{reg.url_arquivo ? 'Substituir documento' : 'Anexar documento'}</p>
              <div onClick={() => fileRef.current?.click()} style={{ border: '2px dashed #e0e0e0', borderRadius: 10, padding: '28px 20px', textAlign: 'center', cursor: 'pointer', backgroundColor: '#fafafa' }}>
                <Icone tipo="upload" cor="#aaa" size={28} /><p style={{ fontSize: 13, color: '#888', margin: '8px 0 4px' }}>{arquivo ? arquivo.name : 'Clique para selecionar'}</p><p style={{ fontSize: 11, color: '#bbb', margin: 0 }}>PDF, JPG ou PNG · Máx. 10MB</p>
                <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: 'none' }} onChange={e => setArquivo(e.target.files?.[0] || null)} />
              </div>
              {errUp && <p style={{ fontSize: 12, color: '#dc2626', marginTop: 8 }}>{errUp}</p>}
              {arquivo && <button onClick={fazerUpload} disabled={uploading} style={{ width: '100%', marginTop: 16, height: 40, backgroundColor: COR, color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: uploading ? 'not-allowed' : 'pointer', opacity: uploading ? 0.7 : 1 }}>{uploading ? 'Enviando...' : 'Enviar documento'}</button>}
            </>}
          </div>}

          {/* ── PROGRAMAÇÃO ── */}
          {aba === 'programacao' && <div>
            <div style={{ backgroundColor: '#f9f9f9', borderRadius: 10, padding: 16, marginBottom: 24 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#333', margin: '0 0 14px' }}>Nova programação</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div><label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>Data programada *</label><input type="date" value={formProg.data_programada} onChange={e => setFormProg(f => ({ ...f, data_programada: e.target.value }))} style={inp} /></div>
                <div><label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>Observação</label><input type="text" value={formProg.observacao} onChange={e => setFormProg(f => ({ ...f, observacao: e.target.value }))} placeholder="Opcional..." style={inp} /></div>
              </div>
              {errProg && <p style={{ fontSize: 12, color: '#dc2626', margin: '0 0 8px' }}>{errProg}</p>}
              <button onClick={salvarProg} disabled={salvProg || !reg} style={{ height: 36, padding: '0 20px', backgroundColor: COR, color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: salvProg || !reg ? 'not-allowed' : 'pointer', opacity: salvProg || !reg ? 0.7 : 1 }}>{salvProg ? 'Salvando...' : 'Programar'}</button>
            </div>
            <p style={{ fontSize: 13, fontWeight: 600, color: '#333', margin: '0 0 12px' }}>Histórico</p>
            {loadProgs ? <p style={{ fontSize: 13, color: '#aaa' }}>Carregando...</p> : progs.length === 0 ? <p style={{ fontSize: 13, color: '#aaa' }}>Nenhuma programação registrada.</p> : progs.map((p, i) => <div key={p.id} style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: '10px 14px', marginBottom: 8, borderLeft: '3px solid #7c3aed' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}><span style={{ fontSize: 13, fontWeight: 500, color: '#7c3aed' }}>📅 {formatarData(p.data_programada)}{i === 0 && <span style={{ fontSize: 10, color: '#aaa', marginLeft: 8 }}>mais recente</span>}</span><span style={{ fontSize: 11, color: '#aaa' }}>{new Date(p.created_at).toLocaleString('pt-BR')}</span></div>
              <p style={{ fontSize: 12, color: '#666', margin: 0 }}>Por: {p.criado_por}</p>
              {p.observacao && <p style={{ fontSize: 12, color: '#888', margin: '4px 0 0', fontStyle: 'italic' }}>{p.observacao}</p>}
            </div>)}
          </div>}

          {/* ── AUDITORIA ── */}
          {aba === 'auditoria' && podeAuditar && <div>
            {reg?.url_arquivo ? <a href="#" onClick={(e) => visualizarDocumento(e, reg.url_arquivo!)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 14, backgroundColor: '#eff6ff', borderRadius: 10, border: '1px solid #bfdbfe', color: '#2563eb', textDecoration: 'none', fontSize: 13, fontWeight: 500, marginBottom: 20 }}><Icone tipo="olho" cor="#2563eb" size={16} />Visualizar documento antes de auditar</a>
              : <div style={{ padding: 14, backgroundColor: '#fef2f2', borderRadius: 10, border: '1px solid #fecaca', marginBottom: 20 }}><p style={{ fontSize: 13, color: '#b91c1c', margin: 0 }}>⚠️ Sem documento. Recomenda-se solicitar antes de auditar.</p></div>}
            <div style={{ marginBottom: 16 }}><label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 8 }}>Decisão *</label>
              <div style={{ display: 'flex', gap: 12 }}>{[{ val: true, label: 'Aprovar', cor: '#16a34a', bg: '#f0fdf4' }, { val: false, label: 'Reprovar', cor: '#dc2626', bg: '#fef2f2' }].map(op => <button key={String(op.val)} onClick={() => setFormAud(f => ({ ...f, validado: op.val }))} style={{ flex: 1, height: 42, borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', border: formAud.validado === op.val ? `2px solid ${op.cor}` : '1px solid #e0e0e0', backgroundColor: formAud.validado === op.val ? op.bg : 'white', color: formAud.validado === op.val ? op.cor : '#555' }}>{op.label}</button>)}</div>
            </div>
            <div style={{ marginBottom: 16 }}><label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>Observação {!formAud.validado && <span style={{ color: '#dc2626' }}>*</span>}</label><textarea value={formAud.observacao} onChange={e => setFormAud(f => ({ ...f, observacao: e.target.value }))} placeholder={!formAud.validado ? 'Informe o motivo...' : 'Opcional...'} rows={3} style={{ ...inp, height: 'auto', padding: '8px 12px', resize: 'none' }} /></div>
            {errAud && <p style={{ fontSize: 12, color: '#dc2626', marginBottom: 12 }}>{errAud}</p>}
            <button onClick={salvarAud} disabled={salvAud || !reg} style={{ width: '100%', height: 40, fontSize: 13, fontWeight: 500, cursor: salvAud || !reg ? 'not-allowed' : 'pointer', border: 'none', borderRadius: 8, opacity: salvAud || !reg ? 0.7 : 1, backgroundColor: formAud.validado ? '#16a34a' : '#dc2626', color: 'white' }}>{salvAud ? 'Salvando...' : formAud.validado ? 'Confirmar aprovação' : 'Confirmar reprovação'}</button>
            {auds.length > 0 && <div style={{ marginTop: 24 }}><p style={{ fontSize: 13, fontWeight: 600, color: '#333', margin: '0 0 12px' }}>Histórico</p>{auds.map((log, i) => <div key={log.id} style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: '10px 14px', marginBottom: 8, borderLeft: `3px solid ${log.validado ? '#16a34a' : '#dc2626'}` }}><div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: 12, fontWeight: 500, color: log.validado ? '#16a34a' : '#dc2626' }}>{log.validado ? '✓ Validado' : '✗ Reprovado'}{i === 0 && <span style={{ fontSize: 10, color: '#aaa', marginLeft: 8 }}>mais recente</span>}</span><span style={{ fontSize: 11, color: '#aaa' }}>{new Date(log.data_auditoria).toLocaleString('pt-BR')}</span></div><p style={{ fontSize: 12, color: '#666', margin: '4px 0 0' }}>{log.auditor_email}</p>{log.observacao && <p style={{ fontSize: 12, color: '#666', margin: '4px 0 0', fontStyle: 'italic' }}>"{log.observacao}"</p>}</div>)}</div>}
          </div>}

          {/* ── HISTÓRICO ── */}
          {aba === 'historico' && (
            <div>
              {loadHistorico
                ? <p style={{ fontSize: 13, color: '#aaa' }}>Carregando...</p>
                : historico.length === 0
                  ? <div style={{ textAlign: 'center', padding: '40px 0', color: '#aaa' }}>
                      <p style={{ fontSize: 28, margin: '0 0 8px' }}>📂</p>
                      <p style={{ fontSize: 14 }}>Nenhum registro anterior encontrado.</p>
                    </div>
                  : historico.map((h, i) => {
                      const aud = [...(h.logs_auditoria || [])].sort((a, b) => new Date(b.data_auditoria).getTime() - new Date(a.data_auditoria).getTime())[0]
                      return (
                        <div key={h.id} style={{ border: '1px solid #f0f0f0', borderRadius: 10, padding: '14px 16px', marginBottom: 10, borderLeft: '3px solid #e0e0e0' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                            <div>
                              <p style={{ fontSize: 13, fontWeight: 600, color: '#333', margin: 0 }}>
                                📅 Realizado em: {formatarData(h.data_realizacao)}
                              </p>
                              {h.data_vencimento && (
                                <p style={{ fontSize: 12, color: '#888', margin: '3px 0 0' }}>
                                  Vencimento: {formatarData(h.data_vencimento)}
                                </p>
                              )}
                            </div>
                            {i === 0 && (
                              <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, backgroundColor: '#f1f5f9', color: '#64748b' }}>mais recente</span>
                            )}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            {h.url_arquivo
                              ? <a href="#" onClick={(e) => visualizarDocumento(e, h.url_arquivo!)} target="_blank" rel="noreferrer"
                                  style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#2563eb', textDecoration: 'none', padding: '4px 10px', backgroundColor: '#eff6ff', borderRadius: 6, border: '1px solid #bfdbfe' }}>
                                  <Icone tipo="olho" cor="#2563eb" size={13} /> Ver documento
                                </a>
                              : <span style={{ fontSize: 12, color: '#aaa', display: 'flex', alignItems: 'center', gap: 4 }}>
                                  <Icone tipo="clipe" cor="#ccc" size={13} /> Sem documento
                                </span>}
                            {!aud && (
                              <span style={{ fontSize: 12, color: '#aaa', display: 'flex', alignItems: 'center', gap: 4 }}>
                                <Icone tipo="relogio" cor="#ccc" size={13} /> Sem auditoria
                              </span>
                            )}
                            {aud?.validado && (
                              <span style={{ fontSize: 12, color: '#16a34a', display: 'flex', alignItems: 'center', gap: 4 }}>
                                <Icone tipo="check" cor="#16a34a" size={13} /> Validado
                              </span>
                            )}
                            {aud && !aud.validado && (
                              <span style={{ fontSize: 12, color: '#dc2626', display: 'flex', alignItems: 'center', gap: 4 }}>
                                <Icone tipo="x_circulo" cor="#dc2626" size={13} /> Reprovado
                              </span>
                            )}
                          </div>
                          {aud?.observacao && (
                            <p style={{ fontSize: 12, color: '#888', margin: '8px 0 0', fontStyle: 'italic' }}>"{aud.observacao}"</p>
                          )}
                        </div>
                      )
                    })
              }
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

// ─── PÁGINA PRINCIPAL ─────────────────────────────────────────────────────────
export default function BaseNRPage() {
  const router = useRouter(); const { usuario } = useAuth()
  const podeEditar = usuario?.nivel !== 'visualizador'
  const [colabs, setColabs] = useState<Colaborador[]>([])
  const [nrs, setNrs] = useState<NR[]>([])
  const [bases, setBases] = useState<Base[]>([])
  const [matriz, setMatriz] = useState<MatrizTreinamento[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [filtroBase, setFiltroBase] = useState('')
  const [filtroSits, setFiltroSits] = useState<string[]>([])
  const [situacoesDisponiveis, setSituacoesDisp] = useState<string[]>([])
  const [filtroGer, setFiltroGer] = useState('')
  const [filtroSup, setFiltroSup] = useState('')
  const [filtroStatus, setFiltroStatus] = useState<'valido' | 'critico' | 'atencao' | 'vencido' | 'programado' | null>(null)
  const [compacto, setCompacto] = useState(false)
  const [colunas, setColunas] = useState<string[]>([])
  const [ordCol, setOrdCol] = useState<OrdemColuna>('nome')
  const [ordDir, setOrdDir] = useState<OrdemDirecao>('asc')
  const [modalExame, setModalExame] = useState<{ colab: Colaborador; reg: Registro | undefined; nr: NR; abaInicial: AbaModal } | null>(null)
  const [modalNovo, setModalNovo] = useState<Colaborador | null>(null)
  const [modalManual, setModalManual] = useState(false)

  const gerenciasDisp = useMemo(() => [...new Set(colabs.map(c => c.gerencia).filter(Boolean) as string[])].sort(), [colabs])
  const supervisoresDisp = useMemo(() => [...new Set(colabs.map(c => c.supervisor).filter(Boolean) as string[])].sort(), [colabs])

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser(); if (!user) { router.push('/login'); return }
      const [{ data: basesData }, { data: nrsData }, { data: matrizData }] = await Promise.all([
        supabase.from('bases').select('id,nome').order('nome'),
        supabase.from('regras_vencimento').select('id,nome_item,validade_dias').in('nome_item', NRS_ALVO).order('nome_item'),
        supabase.from('matriz_treinamentos').select('*').eq('pagina', 'BASE NR'),
      ])
      setBases(basesData || [])
      setMatriz(matrizData || [])
      const nm: NR[] = (nrsData || []).map((r: any) => ({ id: r.id, nome: r.nome_item, validade_dias: r.validade_dias }))
      setNrs(nm)
      setColunas(['matricula', 'nome', 'funcao', 'processo', 'base', 'admissao', 'situacao', 'gerencia', 'supervisor', ...nm.map(n => `nr_${n.id}`)])
      await buscarColabs(nm, matrizData || [], null)
    }
    init()
  }, [])

  async function buscarColabs(nrsP?: NR[], matrizP?: MatrizTreinamento[], sitsP?: string[] | null) {
    const nrsB = nrsP ?? nrs; if (nrsB.length === 0) return
    const matrizB = matrizP ?? matriz
    const primeiraVez = sitsP === null
    const sitsB = primeiraVez ? [] : (sitsP ?? filtroSits)
    setLoading(true)
    let todos: any[] = []; let from = 0; const ps = 500
    while (true) {
      let q = supabase.from('colaboradores')
        .select('matricula,nome,funcao_id,situacao,data_admissao,processo,gerencia,supervisor,bases(nome),funcoes(nome)')
        .order('nome').range(from, from + ps - 1)
      if (filtroBase) q = q.eq('base_id', filtroBase)
      if (filtroGer) q = q.eq('gerencia', filtroGer)
      if (filtroSup) q = q.eq('supervisor', filtroSup)
      if (!primeiraVez) {
        if (sitsB.length > 0) q = q.in('situacao', sitsB)
        else q = q.eq('situacao', '___nenhuma___')
      }
      const { data: cd } = await q; if (!cd || cd.length === 0) break
      todos = [...todos, ...cd]; if (cd.length < ps) break; from += ps
    }
    if (primeiraVez) {
      const sitsUnicas = [...new Set(todos.map((c: any) => c.situacao).filter(Boolean))].sort() as string[]
      setSituacoesDisp(sitsUnicas)
      const sitsIniciais = sitsUnicas.filter(s => !SITUACOES_EXCLUIDAS_PADRAO.includes(s))
      setFiltroSits(sitsIniciais)
      todos = todos.filter((c: any) => sitsIniciais.includes(c.situacao))
    }

    const rids = nrsB.map(n => n.id)
    const naMatriz = (c: any) => {
      const fnome = c.funcoes?.nome; if (!fnome) return false
      return matrizB.some(m => {
        const mF = m.funcao.trim().toUpperCase(); const fC = fnome.trim().toUpperCase()
        if (m.processo && m.processo.trim() !== '') return mF === fC && m.processo.trim().toUpperCase() === (c.processo || '').trim().toUpperCase()
        return mF === fC
      })
    }

    // Busca registros (NRs alvo, vigentes) de TODOS os colaboradores filtrados,
    // para descobrir quem tem curso lançado mesmo fora da matriz.
    const matsTodos = todos.map((c: any) => c.matricula)
    let regs: any[] = []
    if (matsTodos.length > 0 && rids.length > 0) {
      const LOTE = 100
      for (let i = 0; i < matsTodos.length; i += LOTE) {
        const loteMats = matsTodos.slice(i, i + LOTE)
        let fromReg = 0
        while (true) {
          const { data: rd } = await supabase.from('registros_exames')
            .select('id,matricula_colaborador,regra_id,data_realizacao,data_vencimento,url_arquivo,logs_auditoria(id,auditor_email,data_auditoria,validado,observacao),programacoes_exames(id,data_programada,observacao,criado_por,created_at)')
            .eq('is_atual', true)
            .in('regra_id', rids)
            .in('matricula_colaborador', loteMats)
            .range(fromReg, fromReg + 499)
          if (!rd || rd.length === 0) break
          regs = [...regs, ...rd]
          if (rd.length < 500) break
          fromReg += 500
        }
      }
    }
    const matsComCurso = new Set(regs.map((r: any) => r.matricula_colaborador))

    // Aparece na matriz quem bate com a matriz OU tem curso lançado.
    const colabsFiltrados = matrizB.length === 0
      ? todos
      : todos.filter((c: any) => naMatriz(c) || matsComCurso.has(c.matricula))

    setColabs(colabsFiltrados.map((c: any) => ({
      ...c,
      registros_exames: (regs || []).filter((r: any) => r.matricula_colaborador === c.matricula).map((r: any) => ({ ...r, programacoes: r.programacoes_exames || [] }))
    })) as Colaborador[])
    setLoading(false)
  }

  useEffect(() => { if (nrs.length > 0 && filtroSits.length >= 0) buscarColabs() }, [filtroBase, filtroGer, filtroSup, filtroSits])

  function toggleOrd(c: OrdemColuna) { if (ordCol === c) setOrdDir(d => d === 'asc' ? 'desc' : 'asc'); else { setOrdCol(c); setOrdDir('asc') } }
  function limpar() { setBusca(''); setFiltroBase(''); setFiltroGer(''); setFiltroSup(''); setFiltroStatus(null); setFiltroSits(situacoesDisponiveis.filter(s => !SITUACOES_EXCLUIDAS_PADRAO.includes(s))) }

  const semStatus = useMemo(() => colabs.filter(c => {
    if (busca) { const b = busca.toLowerCase(); if (!c.nome.toLowerCase().includes(b) && !c.matricula.includes(busca)) return false }
    return true
  }), [colabs, busca])

  const stats = useMemo(() => calcStats(semStatus, nrs, colunas, matriz), [semStatus, nrs, colunas, matriz])

  const filtrados = useMemo(() => {
    if (!filtroStatus) return semStatus
    return semStatus.filter(c => {
      const nrsVis = nrs.filter(nr => colunas.includes(`nr_${nr.id}`))
      if (filtroStatus === 'valido') return nrsVis.some(nr => {
        if (getObrigatoriedade(matriz, c.funcoes?.nome || null, c.processo, nr.nome) !== 'SIM') return false
        const r = c.registros_exames.find(r => r.regra_id === nr.id); if (!r) return false
        if (nr.validade_dias === null) return true
        return getStatus(r.data_vencimento!) === 'valido'
      })
      return nrsVis.some(nr => {
        if (getObrigatoriedade(matriz, c.funcoes?.nome || null, c.processo, nr.nome) !== 'SIM') return false
        const r = c.registros_exames.find(r => r.regra_id === nr.id)
        if (filtroStatus === 'programado') {
          if (!r || nr.validade_dias === null) return false
          const s = getStatus(r.data_vencimento!)
          return (s === 'critico' || s === 'atencao' || s === 'vencido') && (r.programacoes || []).some(p => p.data_programada >= hoje)
        }
        if (!r) return filtroStatus === 'vencido'
        if (nr.validade_dias === null) return false
        return getStatus(r.data_vencimento!) === filtroStatus
      })
    })
  }, [semStatus, filtroStatus, nrs, colunas, matriz])

  const ordenados = useMemo(() => [...filtrados].sort((a, b) => {
    let vA = '', vB = ''
    switch (ordCol) {
      case 'matricula': vA = a.matricula; vB = b.matricula; break
      case 'nome': vA = a.nome; vB = b.nome; break
      case 'funcao': vA = a.funcoes?.nome || ''; vB = b.funcoes?.nome || ''; break
      case 'processo': vA = a.processo || ''; vB = b.processo || ''; break
      case 'base': vA = a.bases?.nome || ''; vB = b.bases?.nome || ''; break
      case 'admissao': vA = a.data_admissao || ''; vB = b.data_admissao || ''; break
      case 'situacao': vA = a.situacao; vB = b.situacao; break
      case 'gerencia': vA = a.gerencia || ''; vB = b.gerencia || ''; break
      case 'supervisor': vA = a.supervisor || ''; vB = b.supervisor || ''; break
      default: if (ordCol.startsWith('nr_')) {
        const id = parseInt(ordCol.replace('nr_', '')); const nr = nrs.find(n => n.id === id)
        if (nr?.validade_dias === null) { vA = a.registros_exames.some(r => r.regra_id === id) ? 'a' : 'z'; vB = b.registros_exames.some(r => r.regra_id === id) ? 'a' : 'z' }
        else { vA = a.registros_exames.find(r => r.regra_id === id)?.data_vencimento || '9999-99-99'; vB = b.registros_exames.find(r => r.regra_id === id)?.data_vencimento || '9999-99-99' }
      }
    }
    return ordDir === 'asc' ? vA.localeCompare(vB) : vB.localeCompare(vA)
  }), [filtrados, ordCol, ordDir, nrs])

  const sitsIniciais = useMemo(() => situacoesDisponiveis.filter(s => !SITUACOES_EXCLUIDAS_PADRAO.includes(s)), [situacoesDisponiveis])
  const sitsAlteradas = JSON.stringify([...filtroSits].sort()) !== JSON.stringify([...sitsIniciais].sort())
  const temFiltro = !!(busca || filtroBase || filtroGer || filtroSup || filtroStatus || sitsAlteradas)

  const vis = (k: string) => colunas.includes(k)
  const leftNome = vis('matricula') ? COL_MATRICULA : 0
  const colsDef = [
    { key: 'matricula', label: 'Matrícula' }, { key: 'nome', label: 'Nome' }, { key: 'funcao', label: 'Função' },
    { key: 'processo', label: 'Processo' }, { key: 'base', label: 'Base' }, { key: 'admissao', label: 'Admissão' },
    { key: 'situacao', label: 'Situação' }, { key: 'gerencia', label: 'Gerência' }, { key: 'supervisor', label: 'Coordenador' },
    ...nrs.map(n => ({ key: `nr_${n.id}`, label: n.nome }))
  ]
  const padCell = compacto ? '4px 10px' : '8px 16px'; const fs = compacto ? 12 : 13
  const sel: React.CSSProperties = { height: 36, border: '1px solid #e0e0e0', borderRadius: 8, padding: '0 10px', fontSize: 13, backgroundColor: 'white', color: '#555' }
  const tdBase = (ex?: React.CSSProperties): React.CSSProperties => ({ padding: padCell, color: '#666', whiteSpace: 'nowrap', verticalAlign: 'middle', borderBottom: '1px solid #f5f5f5', borderRight: '1px solid #f0f0f0', ...ex })
  const stickyTd = (bg: string, l: number): React.CSSProperties => ({ position: 'sticky', left: l, backgroundColor: bg, zIndex: 10, borderRight: '2px solid #d0d0d0' })

  return <div style={{ fontFamily: 'Arial, sans-serif', display: 'flex', flexDirection: 'column', height: '100%' }}>
    <div style={{ marginBottom: 12 }}>
      <h1 style={{ fontSize: 18, fontWeight: 600, color: '#1a1a1a', margin: 0 }}>Matriz de Competências</h1>
      <p style={{ fontSize: 12, color: '#888', margin: '3px 0 0', fontWeight: 500 }}>BASE NR — Normas Regulamentadoras</p>
    </div>

    {/* CARDS */}
    {loading || nrs.length === 0
      ? <div style={{ display: 'flex', gap: 12, marginBottom: 12, overflowX: 'auto', paddingBottom: 4 }}>
          {[...Array(5)].map((_, i) => <div key={i} style={{ backgroundColor: 'white', borderRadius: 10, padding: '10px 16px', border: '1px solid #f0f0f0', minWidth: 160, flex: '1 0 160px' }}><div style={{ height: 10, backgroundColor: '#f0f0f0', borderRadius: 4, marginBottom: 8, width: '60%' }} /><div style={{ height: 24, backgroundColor: '#f0f0f0', borderRadius: 4, width: '40%' }} /></div>)}
        </div>
      : <div style={{ display: 'flex', gap: 12, marginBottom: 12, overflowX: 'auto', paddingBottom: 4 }}>
          {[
            { label: 'Colaboradores',        valor: filtrados.length,   cor: '#4a4a49', status: null },
            { label: 'Treinamentos Válidos', valor: stats.validos,      cor: '#16a34a', status: 'valido'     as const },
            { label: 'Prazo Crítico',        valor: stats.criticos,     cor: '#d97706', status: 'critico'    as const },
            { label: 'Bernhoeft c/ Atenção', valor: stats.atencao,      cor: '#ca8a04', status: 'atencao'    as const },
            { label: 'Falta / Vencidos',     valor: stats.vencidos,     cor: '#dc2626', status: 'vencido'    as const },
            { label: 'Programados',          valor: stats.programados,  cor: '#7c3aed', status: 'programado' as const },
          ].map((card, i) => {
            const ativo = filtroStatus === card.status && card.status !== null
            return <div key={i} onClick={() => card.status !== null && setFiltroStatus(ativo ? null : card.status)}
              style={{ backgroundColor: ativo ? card.cor + '10' : 'white', borderRadius: 10, padding: '10px 16px', border: ativo ? `2px solid ${card.cor}` : '1px solid #f0f0f0', minWidth: 160, flex: '1 0 160px', cursor: card.status !== null ? 'pointer' : 'default', transition: 'all 0.15s ease', boxShadow: ativo ? `0 2px 8px ${card.cor}30` : 'none' }}>
              <p style={{ fontSize: 11, color: '#888', margin: '0 0 4px' }}>{card.label}{ativo && <span style={{ marginLeft: 6, fontSize: 10, color: card.cor }}>● filtrado</span>}</p>
              <p style={{ fontSize: 24, fontWeight: 600, color: card.cor, margin: 0 }}>{card.valor.toLocaleString('pt-BR')}</p>
            </div>
          })}
        </div>}

    {/* FILTROS */}
    <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
      <input type="text" placeholder="Nome ou matrícula..." value={busca} onChange={e => setBusca(e.target.value)} style={{ ...sel, width: 200, padding: '0 12px' }} />
      <select value={filtroBase} onChange={e => setFiltroBase(e.target.value)} style={{ ...sel, width: 150 }}>
        <option value="">Todas as bases</option>{bases.map(b => <option key={b.id} value={b.id}>{b.nome}</option>)}
      </select>
      <FiltroSituacao opcoes={situacoesDisponiveis} selecionadas={filtroSits} onChange={setFiltroSits} />
      <select value={filtroGer} onChange={e => setFiltroGer(e.target.value)} style={{ ...sel, width: 150 }}>
        <option value="">Todas as gerências</option>{gerenciasDisp.map(g => <option key={g} value={g}>{g}</option>)}
      </select>
      <select value={filtroSup} onChange={e => setFiltroSup(e.target.value)} style={{ ...sel, width: 160 }}>
        <option value="">Todos os coordenadores</option>{supervisoresDisp.map(s => <option key={s} value={s}>{primeiroNome(s)}</option>)}
      </select>
      <div style={{ flex: 1 }} />
      {temFiltro && <button onClick={limpar} style={{ height: 36, padding: '0 12px', fontSize: 12, border: '1px solid #fca5a5', borderRadius: 8, backgroundColor: '#fef2f2', color: '#dc2626', cursor: 'pointer' }}>✕ Limpar</button>}
      <button onClick={() => setCompacto(c => !c)} style={{ height: 36, padding: '0 12px', fontSize: 12, border: `1px solid ${compacto ? COR : '#e0e0e0'}`, borderRadius: 8, backgroundColor: compacto ? '#fdf2f5' : 'white', color: compacto ? COR : '#555', cursor: 'pointer' }}>⊟ Compacto</button>
      {colunas.length > 0 && <SeletorColunas colunas={colsDef} visiveis={colunas} onChange={setColunas} />}
      {podeEditar && <button onClick={() => setModalManual(true)} style={{ height: 36, padding: '0 14px', fontSize: 12, border: 'none', borderRadius: 8, backgroundColor: COR, color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 500 }}>+ Incluir curso manual</button>}
      <BotaoExportar onClick={t => { const d = gerarExport(ordenados, nrs, matriz); t === 'csv' ? exportCSV(d) : exportXLSX(d) }} />
    </div>

    {/* TABELA */}
    {loading ? <p style={{ color: '#888', fontSize: 14 }}>Carregando dados da tabela...</p>
      : <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 230px)', borderRadius: 12, border: '1px solid #f0f0f0', flex: 1 }}>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, backgroundColor: 'white', fontSize: fs }}>
          <thead>
            <tr style={{ backgroundColor: '#fafafa' }}>
              {vis('matricula') && <Th label="Matrícula" col="matricula" ord={ordCol} dir={ordDir} onClick={toggleOrd} left={0} style={{ width: COL_MATRICULA, minWidth: COL_MATRICULA }} />}
              {vis('nome') && <Th label="Nome" col="nome" ord={ordCol} dir={ordDir} onClick={toggleOrd} left={leftNome} style={{ width: COL_NOME, minWidth: COL_NOME }} />}
              {vis('funcao') && <Th label="Função" col="funcao" ord={ordCol} dir={ordDir} onClick={toggleOrd} style={{ width: COL_FUNCAO }} />}
              {vis('processo') && <Th label="Processo" col="processo" ord={ordCol} dir={ordDir} onClick={toggleOrd} style={{ width: COL_PROCESSO }} />} 
              {vis('base') && <Th label="Base" col="base" ord={ordCol} dir={ordDir} onClick={toggleOrd} />}
              {vis('admissao') && <Th label="Admissão" col="admissao" ord={ordCol} dir={ordDir} onClick={toggleOrd} />}
              {vis('situacao') && <Th label="Situação" col="situacao" ord={ordCol} dir={ordDir} onClick={toggleOrd} />}
              {vis('gerencia') && <Th label="Gerência" col="gerencia" ord={ordCol} dir={ordDir} onClick={toggleOrd} />}
              {vis('supervisor') && <Th label="Coordenador" col="supervisor" ord={ordCol} dir={ordDir} onClick={toggleOrd} />}
              {nrs.filter(n => vis(`nr_${n.id}`)).map(n => <Th key={n.id} label={n.nome} col={`nr_${n.id}` as OrdemColuna} ord={ordCol} dir={ordDir} onClick={toggleOrd} style={{ textAlign: 'center' }} />)}
            </tr>
          </thead>
          <tbody>
            {ordenados.length === 0
              ? <tr><td colSpan={99} style={{ padding: '40px 20px', textAlign: 'center', color: '#aaa', fontSize: 14 }}>
                  {matriz.length === 0 ? 'Matriz de treinamentos não encontrada. Importe os dados no banco.' : 'Nenhum colaborador encontrado.'}
                </td></tr>
              : ordenados.map((c, i) => {
                  const bg = i % 2 === 0 ? 'white' : '#fafafa'
                  return <tr key={c.matricula} style={{ backgroundColor: bg }}>
                    {vis('matricula') && <td style={{ ...tdBase(), ...stickyTd(bg, 0), width: COL_MATRICULA, minWidth: COL_MATRICULA }}>{c.matricula}</td>}
                    {vis('nome') && <td style={{ ...tdBase(), ...stickyTd(bg, leftNome), width: COL_NOME, minWidth: COL_NOME }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 500, color: '#333', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: COL_NOME - 40 }}>{c.nome}</span>
                        {podeEditar && (
                          <button title="Novo treinamento NR" onClick={e => { e.stopPropagation(); setModalNovo(c) }}
                            style={{ width: 20, height: 20, borderRadius: '50%', backgroundColor: '#f0f0f0', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: '#888', flexShrink: 0, lineHeight: 1 }}
                            onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#fdf2f5'; e.currentTarget.style.color = COR }}
                            onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#f0f0f0'; e.currentTarget.style.color = '#888' }}>+</button>
                        )}
                      </div>
                    </td>}
                    {vis('funcao') && <td style={tdBase()} title={c.funcoes?.nome || ''}><div style={{ width: COL_FUNCAO, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.funcoes?.nome || '—'}</div></td>}
                    {vis('processo') && <td style={tdBase()} title={c.processo || ''}><div style={{ width: COL_PROCESSO, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.processo || '—'}</div></td>}
                    {vis('base') && <td style={tdBase()}>{c.bases?.nome || '—'}</td>}
                    {vis('admissao') && <td style={tdBase()}>{formatarData(c.data_admissao)}</td>}
                    {vis('situacao') && <td style={tdBase()}><span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, backgroundColor: c.situacao === 'ATIVO' ? '#f0fdf4' : '#fef2f2', color: c.situacao === 'ATIVO' ? '#16a34a' : '#dc2626' }}>{c.situacao}</span></td>}
                    {vis('gerencia') && <td style={tdBase()}>{c.gerencia ? <span style={{ fontSize: compacto ? 11 : 12, padding: '2px 8px', borderRadius: 99, backgroundColor: '#f0f0f0', color: '#444', fontWeight: 500 }}>{c.gerencia}</span> : '—'}</td>}
                    {vis('supervisor') && <td style={tdBase({ fontSize: compacto ? 11 : 12 })} title={c.supervisor || ''}>{primeiroNome(c.supervisor)}</td>}
                    {nrs.filter(n => vis(`nr_${n.id}`)).map(nr => {
                      const reg = c.registros_exames.find(r => r.regra_id === nr.id)
                      const obrig = getObrigatoriedade(matriz, c.funcoes?.nome || null, c.processo, nr.nome)
                      return <CelulaNR key={nr.id} reg={reg} semPrazo={nr.validade_dias === null} compacto={compacto} obrig={obrig}
                        onClick={() => setModalExame({ colab: c, reg, nr, abaInicial: 'info' })}
                        onIcone={tipo => setModalExame({ colab: c, reg, nr, abaInicial: tipo === 'documento' ? 'documento' : 'programacao' })}
                      />
                    })}
                  </tr>
                })}
          </tbody>
        </table>
      </div>}

    {modalExame && <ModalExame dados={modalExame} abaInicial={modalExame.abaInicial} onClose={() => setModalExame(null)} onUpdate={() => buscarColabs(nrs, matriz)} email={usuario?.email || ''} podeAuditar={usuario?.pode_auditar || false} nivel={usuario?.nivel || 'visualizador'} />}
    {modalNovo && <ModalNovoTrein colab={modalNovo} nrs={nrs} onClose={() => setModalNovo(null)} onUpdate={() => buscarColabs(nrs, matriz)} email={usuario?.email || ''} />}
    {modalManual && <ModalCursoManual nrs={nrs} onClose={() => setModalManual(false)} onUpdate={() => buscarColabs(nrs, matriz)} email={usuario?.email || ''} />}
  </div>
}