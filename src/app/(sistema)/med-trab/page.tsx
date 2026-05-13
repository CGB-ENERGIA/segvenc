'use client'

import { useEffect, useState, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'

// ─── CONSTANTES ───────────────────────────────────────────────────────────────
const COR = '#9f183c'
const COL_MATRICULA = 110
const COL_NOME = 230
const SITUACOES_EXCLUIDAS_PADRAO = ['DEMITIDO', 'AF.PREVIDÊNCIA', 'LICENÇA MATERNIDADE']
const TIPOS_SEM_VENCIMENTO = ['admissional', 'retorno', 'mudanca_risco', 'demissional']

const TIPOS_ASO = [
  { value: 'admissional',   label: 'Admissional' },
  { value: 'periodico',     label: 'Periódico' },
  { value: 'retorno',       label: 'Retorno ao Trabalho' },
  { value: 'mudanca_risco', label: 'Mudança de Risco (MRO)' },
  { value: 'demissional',   label: 'Demissional' },
]

// ─── TIPOS ────────────────────────────────────────────────────────────────────
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
  data_admissao: string | null
  processo: string | null
  bases: { nome: string } | null
  funcoes: { nome: string } | null
  gerencias: { sigla: string } | null
  asos: ASO[]
}

interface Base { id: number; nome: string }

type StatusASO = 'no_prazo' | 'critico' | 'atencao' | 'vencido' | 'sem_aso'
type CardFiltro = StatusASO | 'programado' | null
type OrdemColuna =
  | 'matricula' | 'nome' | 'base' | 'situacao' | 'admissao'
  | 'funcao' | 'processo' | 'gse'
  | 'admissional' | 'periodico' | 'retorno' | 'mro' | 'demissional' | 'status'
type OrdemDirecao = 'asc' | 'desc'
type AbaModal = 'info' | 'documento' | 'auditoria'

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function formatarData(d: string | null | undefined): string {
  if (!d) return '—'
  return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR')
}

function calcularDias(dv: string | null): number | null {
  if (!dv) return null
  return Math.ceil((new Date(dv + 'T12:00:00').getTime() - new Date().getTime()) / 86400000)
}

function getStatusASO(dv: string | null): StatusASO {
  const dias = calcularDias(dv)
  if (dias === null) return 'sem_aso'
  if (dias < 0)    return 'vencido'
  if (dias <= 30)  return 'atencao'
  if (dias <= 60)  return 'critico'
  return 'no_prazo'
}

function getASOPorTipo(asos: ASO[], tipo: string): ASO | null {
  const lista = (asos || []).filter(a => a.tipo === tipo)
  if (!lista.length) return null
  return lista.sort((a, b) => new Date(b.data_realizacao).getTime() - new Date(a.data_realizacao).getTime())[0]
}

function getStatusColaborador(col: Colaborador): StatusASO {
  const p = getASOPorTipo(col.asos, 'periodico')
  return p ? getStatusASO(p.data_vencimento) : 'sem_aso'
}

function temProgramado(col: Colaborador): boolean {
  const p = getASOPorTipo(col.asos, 'periodico')
  if (!p?.data_vencimento) return false
  const dias = calcularDias(p.data_vencimento)
  return dias !== null && dias > 0 && dias <= 365
}

function statusCores(s: StatusASO): { bg: string; text: string } {
  if (s === 'no_prazo') return { bg: '#dcfce7', text: '#15803d' }
  if (s === 'critico')  return { bg: '#fef9c3', text: '#a16207' }
  if (s === 'atencao')  return { bg: '#ffedd5', text: '#c2410c' }
  if (s === 'vencido')  return { bg: '#fee2e2', text: '#dc2626' }
  return { bg: '#f1f5f9', text: '#64748b' }
}

function statusLabel(s: StatusASO): string {
  if (s === 'no_prazo') return 'No Prazo'
  if (s === 'critico')  return 'Prazo Crítico'
  if (s === 'atencao')  return 'Bernhoeft c/ Atenção'
  if (s === 'vencido')  return 'Vencido'
  return 'Sem ASO'
}

function tipoLabel(tipo: string): string {
  return TIPOS_ASO.find(t => t.value === tipo)?.label ?? tipo
}

function primeiroNome(s: string | null) { return s ? s.trim().split(' ')[0] : '—' }

// ─── EXPORTAÇÃO ───────────────────────────────────────────────────────────────
function gerarExport(colabs: Colaborador[]) {
  return colabs.map(c => {
    const asoAdm = getASOPorTipo(c.asos, 'admissional')
    const asoPer = getASOPorTipo(c.asos, 'periodico')
    const asoRet = getASOPorTipo(c.asos, 'retorno')
    const asoMRO = getASOPorTipo(c.asos, 'mudanca_risco')
    const asoDem = getASOPorTipo(c.asos, 'demissional')
    const status = getStatusColaborador(c)
    return {
      'Matrícula': c.matricula,
      'Nome': c.nome,
      'Base': c.bases?.nome || '',
      'Situação': c.situacao,
      'Admissão': formatarData(c.data_admissao),
      'Função': c.funcoes?.nome || '',
      'Processo': c.processo || '',
      'GSE': asoPer?.gse ?? '',
      'Admissional': formatarData(asoAdm?.data_realizacao),
      'Periódico - Realização': formatarData(asoPer?.data_realizacao),
      'Periódico - Vencimento': formatarData(asoPer?.data_vencimento),
      'Retorno': formatarData(asoRet?.data_realizacao),
      'MRO': formatarData(asoMRO?.data_realizacao),
      'Demissional': formatarData(asoDem?.data_realizacao),
      'Status': statusLabel(status),
    }
  })
}

function exportCSV(dados: Record<string, string | number>[]) {
  if (!dados.length) return
  const cols = Object.keys(dados[0])
  const csv = [cols.map(h => `"${h}"`).join(';'), ...dados.map(r => cols.map(h => `"${String(r[h] ?? '').replace(/"/g, '""')}"`).join(';'))].join('\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' }))
  a.download = `med-trab-${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.csv`
  a.click()
}

function exportXLSX(dados: Record<string, string | number>[]) {
  if (!dados.length) return
  import('xlsx').then(X => {
    const ws = X.utils.json_to_sheet(dados)
    const wb = X.utils.book_new()
    X.utils.book_append_sheet(wb, ws, 'MED TRAB')
    X.writeFile(wb, `med-trab-${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.xlsx`)
  })
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

// ─── BOTÃO EXPORTAR ───────────────────────────────────────────────────────────
function BotaoExportar({ onClick }: { onClick: (t: 'csv' | 'xlsx') => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [])
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(!open)} style={{ height: 36, padding: '0 10px', fontSize: 12, border: '1px solid #e0e0e0', borderRadius: 8, backgroundColor: 'white', color: '#555', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
        <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M8 13h2m4 0h2M8 17h2m4 0h2M10 13v4" /></svg>
        <span style={{ fontSize: 10 }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 40, right: 0, zIndex: 150, backgroundColor: 'white', border: '1px solid #e0e0e0', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', width: 180, overflow: 'hidden' }}>
          {(['csv', 'xlsx'] as const).map((t, i) => (
            <button key={t} onClick={() => { onClick(t); setOpen(false) }} style={{ width: '100%', padding: '10px 16px', fontSize: 13, textAlign: 'left', border: 'none', background: 'none', cursor: 'pointer', color: '#333', display: 'flex', alignItems: 'center', gap: 10, borderTop: i > 0 ? '1px solid #f0f0f0' : 'none' }}
              onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f9f9f9'}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
              {t === 'csv' ? '📄 Exportar CSV' : '📊 Exportar Excel'}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── SELETOR DE COLUNAS ───────────────────────────────────────────────────────
function SeletorColunas({ colunas, visiveis, onChange }: { colunas: { key: string; label: string }[]; visiveis: string[]; onChange: (c: string[]) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [])
  const toggle = (k: string) => onChange(visiveis.includes(k) ? visiveis.filter(v => v !== k) : [...visiveis, k])
  const todas = colunas.every(c => visiveis.includes(c.key))
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(!open)} style={{ height: 36, border: '1px solid #e0e0e0', borderRadius: 8, padding: '0 12px', fontSize: 13, backgroundColor: 'white', color: '#555', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>⊞ Colunas {open ? '▲' : '▼'}</button>
      {open && (
        <div style={{ position: 'absolute', top: 40, right: 0, zIndex: 150, backgroundColor: 'white', border: '1px solid #e0e0e0', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', width: 220, maxHeight: 360, overflowY: 'auto' }}>
          <div style={{ padding: '8px 14px', borderBottom: '1px solid #f0f0f0' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 600, color: '#333', cursor: 'pointer' }}>
              <input type="checkbox" checked={todas} onChange={() => onChange(todas ? [] : colunas.map(c => c.key))} style={{ accentColor: COR }} />Todas as colunas
            </label>
          </div>
          {colunas.map(col => (
            <label key={col.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px', fontSize: 12, cursor: 'pointer', backgroundColor: visiveis.includes(col.key) ? '#fdf2f5' : 'white', color: visiveis.includes(col.key) ? COR : '#555' }}>
              <input type="checkbox" checked={visiveis.includes(col.key)} onChange={() => toggle(col.key)} style={{ accentColor: COR }} />{col.label}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── TH ORDENÁVEL ─────────────────────────────────────────────────────────────
function Th({ label, col, ord, dir, onClick, left, style }: {
  label: string; col: OrdemColuna; ord: OrdemColuna; dir: OrdemDirecao
  onClick: (c: OrdemColuna) => void; left?: number; style?: React.CSSProperties
}) {
  const ativo = ord === col
  const isSticky = left !== undefined
  return (
    <th onClick={() => onClick(col)} style={{
      padding: '10px 12px', textAlign: 'left', fontWeight: 700, whiteSpace: 'nowrap',
      cursor: 'pointer', userSelect: 'none', color: ativo ? COR : '#333',
      borderBottom: ativo ? `2px solid ${COR}` : '2px solid #e0e0e0',
      borderRight: isSticky ? '2px solid #d0d0d0' : '1px solid #e8e8e8',
      position: 'sticky', top: 0,
      left: isSticky ? left : undefined,
      zIndex: isSticky ? 110 : 100,
      backgroundColor: '#fafafa',
      ...style,
    }}>
      {label} {ativo ? (dir === 'asc' ? '↑' : '↓') : <span style={{ color: '#ccc' }}>↕</span>}
    </th>
  )
}

// ─── ÍCONE ────────────────────────────────────────────────────────────────────
function Icone({ tipo, cor, titulo, size = 16 }: { tipo: string; cor: string; titulo?: string; size?: number }) {
  const paths: Record<string, string> = {
    clipe: 'M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48',
    check: 'M22 11.08V12a10 10 0 11-5.93-9.14M22 4L12 14.01l-3-3',
    x_circulo: 'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM15 9l-6 6M9 9l6 6',
    olho: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 9a3 3 0 100 6 3 3 0 000-6z',
    upload: 'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12',
    plus: 'M12 5v14M5 12h14',
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={cor} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}>
      {titulo && <title>{titulo}</title>}
      <path d={paths[tipo] || ''} />
    </svg>
  )
}

// ─── CÉLULA ASO ───────────────────────────────────────────────────────────────
function CelulaASO({ aso, tipo, onClick, compacto }: {
  aso: ASO | null
  tipo: string
  onClick: () => void
  compacto: boolean
}) {
  const pad = compacto ? '6px 8px' : '8px 12px'
  const base: React.CSSProperties = {
    padding: pad, textAlign: 'center', verticalAlign: 'middle',
    minWidth: compacto ? 100 : 130,
    borderBottom: '1px solid #f5f5f5', borderRight: '1px solid #f0f0f0',
    cursor: 'pointer',
  }

  if (!aso) return (
    <td style={{ ...base, backgroundColor: '#fafafa' }} onClick={onClick}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
        <Icone tipo="plus" cor="#ccc" size={12} />
        <span style={{ fontSize: compacto ? 10 : 11, color: '#ccc' }}>Sem registro</span>
      </div>
    </td>
  )

  const semVenc = TIPOS_SEM_VENCIMENTO.includes(tipo)

  if (semVenc) return (
    <td style={{ ...base, backgroundColor: '#f0fdf4' }} onClick={onClick}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
        <Icone tipo="check" cor="#16a34a" size={13} />
        <span style={{ fontSize: compacto ? 10 : 11, color: '#16a34a', fontWeight: 600 }}>{formatarData(aso.data_realizacao)}</span>
        {aso.url_arquivo && <Icone tipo="clipe" cor="#2563eb" size={12} titulo="Com documento" />}
      </div>
    </td>
  )

  const status = getStatusASO(aso.data_vencimento)
  const cores = statusCores(status)
  const bgMap: Record<StatusASO, string> = {
    no_prazo: '#f0fdf4', critico: '#fefce8', atencao: '#fff7ed', vencido: '#fef2f2', sem_aso: '#fafafa',
  }

  return (
    <td style={{ ...base, backgroundColor: bgMap[status] }} onClick={onClick}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
        <span style={{ fontSize: compacto ? 10 : 11, color: '#555' }}>{formatarData(aso.data_realizacao)}</span>
        <span style={{ fontSize: compacto ? 10 : 11, fontWeight: 600, padding: '1px 6px', borderRadius: 99, backgroundColor: cores.bg, color: cores.text }}>
          Vence {formatarData(aso.data_vencimento)}
        </span>
        {aso.url_arquivo && <Icone tipo="clipe" cor="#2563eb" size={12} titulo="Com documento" />}
      </div>
    </td>
  )
}

// ─── MODAL ASO (abas: info, documento, auditoria) ─────────────────────────────
function ModalASO({ dados, abaInicial, onClose, onUpdate, email, podeAuditar, nivel }: {
  dados: { colab: Colaborador; aso: ASO | null; tipo: string }
  abaInicial: AbaModal
  onClose: () => void
  onUpdate: () => void
  email: string
  podeAuditar: boolean
  nivel: string
}) {
  const [aba, setAba] = useState<AbaModal>(abaInicial)
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [errUp, setErrUp] = useState('')
  const [formAud, setFormAud] = useState({ validado: true, observacao: '' })
  const [salvAud, setSalvAud] = useState(false)
  const [errAud, setErrAud] = useState('')
  const [modalExc, setModalExc] = useState(false)
  const [confNome, setConfNome] = useState('')
  const [excluindo, setExcluindo] = useState(false)
  const [errExc, setErrExc] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const { colab, aso, tipo } = dados
  const tLabel = tipoLabel(tipo)

  async function fazerUpload() {
    if (!arquivo || !aso) return
    setUploading(true); setErrUp('')
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const ext = arquivo.name.split('.').pop()
    const path = `asos/${colab.matricula}/${tipo}/${ts}.${ext}`
    const { error: se } = await supabase.storage.from('documentos').upload(path, arquivo, { upsert: false })
    if (se) { setErrUp(se.message); setUploading(false); return }
    const { data: u } = supabase.storage.from('documentos').getPublicUrl(path)
    const { error: de } = await supabase.from('asos').update({ url_arquivo: u.publicUrl }).eq('id', aso.id)
    if (de) { setErrUp(de.message); setUploading(false); return }
    setArquivo(null); setUploading(false); onUpdate(); onClose()
  }

  async function salvarAud() {
    if (!aso) return
    if (!formAud.validado && !formAud.observacao) { setErrAud('Informe o motivo.'); return }
    setSalvAud(true); setErrAud('')
    const { error } = await supabase.from('logs_auditoria').insert({
      registro_id: aso.id, auditor_email: email,
      validado: formAud.validado, observacao: formAud.observacao || null,
      data_auditoria: new Date().toISOString(),
    })
    if (error) { setErrAud(error.message); setSalvAud(false); return }
    setSalvAud(false); onUpdate(); onClose()
  }

  async function excluir() {
    if (!aso) return
    if (confNome !== tLabel) { setErrExc('Nome não confere.'); return }
    setExcluindo(true)
    const { error } = await supabase.from('asos').delete().eq('id', aso.id)
    if (error) { setErrExc(error.message); setExcluindo(false); return }
    onUpdate(); onClose()
  }

  const abas: { key: AbaModal; label: string }[] = [
    { key: 'info', label: 'Informações' },
    { key: 'documento', label: 'Documento' },
    ...(podeAuditar ? [{ key: 'auditoria' as AbaModal, label: 'Auditoria' }] : []),
  ]

  const inp: React.CSSProperties = {
    width: '100%', height: 38, border: '1px solid #e0e0e0', borderRadius: 8,
    padding: '0 12px', fontSize: 13, boxSizing: 'border-box', outline: 'none',
  }

  const semVenc = TIPOS_SEM_VENCIMENTO.includes(tipo)
  const status = aso ? getStatusASO(aso.data_vencimento) : 'sem_aso'
  const cores = statusCores(status)

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}>
      <div style={{ backgroundColor: 'white', borderRadius: 16, width: '100%', maxWidth: 560, maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>

        {/* Header */}
        <div style={{ padding: '24px 28px 0', borderBottom: '1px solid #f0f0f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
            <div>
              <h2 style={{ fontSize: 17, fontWeight: 600, color: '#1a1a1a', margin: 0 }}>{tLabel}</h2>
              <p style={{ fontSize: 13, color: '#888', margin: '3px 0 0' }}>{colab.nome} · {colab.matricula}</p>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#aaa', padding: '0 4px' }}>✕</button>
          </div>
          <div style={{ display: 'flex' }}>
            {abas.map(a => (
              <button key={a.key} onClick={() => setAba(a.key)} style={{
                padding: '8px 16px', fontSize: 13, fontWeight: aba === a.key ? 600 : 400,
                border: 'none', background: 'none', cursor: 'pointer',
                color: aba === a.key ? COR : '#888',
                borderBottom: aba === a.key ? `2px solid ${COR}` : '2px solid transparent',
                marginBottom: -1,
              }}>{a.label}</button>
            ))}
          </div>
        </div>

        {/* Conteúdo */}
        <div style={{ padding: '24px 28px', overflowY: 'auto', flex: 1 }}>

          {/* ABA: INFORMAÇÕES */}
          {aba === 'info' && (
            aso ? (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
                  {[
                    { label: 'Tipo', valor: tLabel },
                    { label: 'Realizado em', valor: formatarData(aso.data_realizacao) },
                    { label: 'Vencimento', valor: semVenc ? 'Sem prazo' : formatarData(aso.data_vencimento) },
                    { label: 'GSE', valor: aso.gse != null ? String(aso.gse) : '—' },
                    { label: 'Base', valor: colab.bases?.nome || '—' },
                    { label: 'Função', valor: colab.funcoes?.nome || '—' },
                  ].map((item, i) => (
                    <div key={i} style={{ backgroundColor: '#f9f9f9', borderRadius: 8, padding: 12 }}>
                      <p style={{ fontSize: 11, color: '#888', margin: '0 0 4px' }}>{item.label}</p>
                      <p style={{ fontSize: 14, color: '#333', margin: 0, fontWeight: 500 }}>{item.valor}</p>
                    </div>
                  ))}
                </div>
                {!semVenc && aso.data_vencimento && (
                  <div style={{ padding: '10px 14px', borderRadius: 10, marginBottom: 16, backgroundColor: cores.bg, border: `1px solid ${cores.text}30` }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: cores.text }}>{statusLabel(status)}</span>
                    {calcularDias(aso.data_vencimento) !== null && (
                      <span style={{ fontSize: 12, color: cores.text, marginLeft: 8 }}>
                        ({calcularDias(aso.data_vencimento)! > 0
                          ? `${calcularDias(aso.data_vencimento)} dias restantes`
                          : `${Math.abs(calcularDias(aso.data_vencimento)!)} dias vencido`})
                      </span>
                    )}
                  </div>
                )}
                {aso.observacao && (
                  <div style={{ backgroundColor: '#f9f9f9', borderRadius: 8, padding: 12, marginBottom: 16 }}>
                    <p style={{ fontSize: 11, color: '#888', margin: '0 0 4px' }}>Observação</p>
                    <p style={{ fontSize: 13, color: '#555', margin: 0 }}>{aso.observacao}</p>
                  </div>
                )}
                {nivel === 'admin' && (
                  <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #f0f0f0' }}>
                    <button onClick={() => { setConfNome(''); setErrExc(''); setModalExc(true) }} style={{ height: 36, padding: '0 16px', fontSize: 12, border: '1px solid #fca5a5', borderRadius: 8, backgroundColor: '#fef2f2', color: '#dc2626', cursor: 'pointer' }}>
                      🗑 Excluir este ASO
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#aaa' }}>
                <p style={{ fontSize: 32, margin: '0 0 8px' }}>📋</p>
                <p style={{ fontSize: 14 }}>Nenhum registro de {tLabel} encontrado.</p>
              </div>
            )
          )}

          {/* Modal confirmar exclusão — zIndex 400 */}
          {modalExc && (
            <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 400 }}>
              <div style={{ backgroundColor: 'white', borderRadius: 16, padding: 28, width: '100%', maxWidth: 440, boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
                <h3 style={{ fontSize: 16, fontWeight: 600, color: '#dc2626', margin: '0 0 8px' }}>Excluir ASO</h3>
                <p style={{ fontSize: 13, color: '#555', margin: '0 0 16px', lineHeight: 1.5 }}>Esta ação é <strong>irreversível</strong>. Para confirmar, digite o tipo do ASO:</p>
                <p style={{ fontSize: 13, fontWeight: 600, color: '#333', margin: '0 0 8px', padding: '8px 12px', backgroundColor: '#f9f9f9', borderRadius: 8, borderLeft: '3px solid #dc2626' }}>{tLabel}</p>
                <input type="text" autoFocus value={confNome} onChange={e => setConfNome(e.target.value)} onKeyDown={e => e.key === 'Enter' && excluir()} placeholder="Digite o nome exato..." style={{ width: '100%', height: 38, border: '1px solid #e0e0e0', borderRadius: 8, padding: '0 12px', fontSize: 13, boxSizing: 'border-box', outline: 'none', marginBottom: 8 }} />
                {errExc && <p style={{ fontSize: 12, color: '#dc2626', margin: '0 0 12px' }}>{errExc}</p>}
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 12 }}>
                  <button onClick={() => setModalExc(false)} style={{ height: 38, padding: '0 18px', border: '1px solid #e0e0e0', borderRadius: 8, fontSize: 13, cursor: 'pointer', background: 'white', color: '#555' }}>Cancelar</button>
                  <button onClick={excluir} disabled={excluindo || confNome !== tLabel} style={{ height: 38, padding: '0 22px', backgroundColor: '#dc2626', color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: excluindo || confNome !== tLabel ? 'not-allowed' : 'pointer', opacity: excluindo || confNome !== tLabel ? 0.5 : 1 }}>
                    {excluindo ? 'Excluindo...' : 'Confirmar exclusão'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ABA: DOCUMENTO */}
          {aba === 'documento' && (
            <div>
              {aso?.url_arquivo ? (
                <div style={{ marginBottom: 24 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#333', margin: '0 0 12px' }}>Documento atual</p>
                  <a href={aso.url_arquivo} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 16, backgroundColor: '#eff6ff', borderRadius: 10, border: '1px solid #bfdbfe', color: '#2563eb', textDecoration: 'none', fontSize: 13, fontWeight: 500 }}>
                    <Icone tipo="olho" cor="#2563eb" size={18} />Visualizar documento
                  </a>
                </div>
              ) : (
                <div style={{ marginBottom: 24, padding: 16, backgroundColor: '#fffbeb', borderRadius: 10, border: '1px solid #fde68a' }}>
                  <p style={{ fontSize: 13, color: '#92400e', margin: 0 }}>⚠️ Nenhum documento anexado ainda.</p>
                </div>
              )}
              {!aso && <p style={{ fontSize: 13, color: '#aaa', marginBottom: 16 }}>Registre o ASO antes de anexar documento.</p>}
              {aso && (
                <>
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#333', margin: '0 0 12px' }}>{aso.url_arquivo ? 'Substituir documento' : 'Anexar documento'}</p>
                  <div onClick={() => fileRef.current?.click()} style={{ border: '2px dashed #e0e0e0', borderRadius: 10, padding: '28px 20px', textAlign: 'center', cursor: 'pointer', backgroundColor: '#fafafa' }}>
                    <Icone tipo="upload" cor="#aaa" size={28} />
                    <p style={{ fontSize: 13, color: '#888', margin: '8px 0 4px' }}>{arquivo ? arquivo.name : 'Clique para selecionar'}</p>
                    <p style={{ fontSize: 11, color: '#bbb', margin: 0 }}>PDF, JPG ou PNG · Máx. 10MB</p>
                    <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: 'none' }} onChange={e => setArquivo(e.target.files?.[0] || null)} />
                  </div>
                  {errUp && <p style={{ fontSize: 12, color: '#dc2626', marginTop: 8 }}>{errUp}</p>}
                  {arquivo && (
                    <button onClick={fazerUpload} disabled={uploading} style={{ width: '100%', marginTop: 16, height: 40, backgroundColor: COR, color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: uploading ? 'not-allowed' : 'pointer', opacity: uploading ? 0.7 : 1 }}>
                      {uploading ? 'Enviando...' : 'Enviar documento'}
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          {/* ABA: AUDITORIA */}
          {aba === 'auditoria' && podeAuditar && (
            <div>
              {aso?.url_arquivo ? (
                <a href={aso.url_arquivo} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 14, backgroundColor: '#eff6ff', borderRadius: 10, border: '1px solid #bfdbfe', color: '#2563eb', textDecoration: 'none', fontSize: 13, fontWeight: 500, marginBottom: 20 }}>
                  <Icone tipo="olho" cor="#2563eb" size={16} />Visualizar documento antes de auditar
                </a>
              ) : (
                <div style={{ padding: 14, backgroundColor: '#fef2f2', borderRadius: 10, border: '1px solid #fecaca', marginBottom: 20 }}>
                  <p style={{ fontSize: 13, color: '#b91c1c', margin: 0 }}>⚠️ Sem documento. Recomenda-se solicitar antes de auditar.</p>
                </div>
              )}
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 8 }}>Decisão *</label>
                <div style={{ display: 'flex', gap: 12 }}>
                  {[{ val: true, label: 'Aprovar', cor: '#16a34a', bg: '#f0fdf4' }, { val: false, label: 'Reprovar', cor: '#dc2626', bg: '#fef2f2' }].map(op => (
                    <button key={String(op.val)} onClick={() => setFormAud(f => ({ ...f, validado: op.val }))} style={{ flex: 1, height: 42, borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', border: formAud.validado === op.val ? `2px solid ${op.cor}` : '1px solid #e0e0e0', backgroundColor: formAud.validado === op.val ? op.bg : 'white', color: formAud.validado === op.val ? op.cor : '#555' }}>
                      {op.label}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>Observação {!formAud.validado && <span style={{ color: '#dc2626' }}>*</span>}</label>
                <textarea value={formAud.observacao} onChange={e => setFormAud(f => ({ ...f, observacao: e.target.value }))} placeholder={!formAud.validado ? 'Informe o motivo...' : 'Opcional...'} rows={3} style={{ ...inp, height: 'auto', padding: '8px 12px', resize: 'none' }} />
              </div>
              {errAud && <p style={{ fontSize: 12, color: '#dc2626', marginBottom: 12 }}>{errAud}</p>}
              <button onClick={salvarAud} disabled={salvAud || !aso} style={{ width: '100%', height: 40, fontSize: 13, fontWeight: 500, cursor: salvAud || !aso ? 'not-allowed' : 'pointer', border: 'none', borderRadius: 8, opacity: salvAud || !aso ? 0.7 : 1, backgroundColor: formAud.validado ? '#16a34a' : '#dc2626', color: 'white' }}>
                {salvAud ? 'Salvando...' : formAud.validado ? 'Confirmar aprovação' : 'Confirmar reprovação'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── MODAL NOVO ASO ───────────────────────────────────────────────────────────
function ModalNovoASO({ colab, onClose, onSalvo }: {
  colab: Colaborador
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

  useEffect(() => {
    async function buscarGSE() {
      if (colab.funcao_id) {
        const { data } = await supabase.from('gse_funcoes').select('gse_id').eq('gse_id', colab.funcao_id).maybeSingle()
        if (data?.gse_id) { setGse(String(data.gse_id)); return }
      }
      const ultimoComGSE = [...(colab.asos || [])].sort((a, b) => new Date(b.data_realizacao).getTime() - new Date(a.data_realizacao).getTime()).find(a => a.gse != null)
      if (ultimoComGSE?.gse != null) setGse(String(ultimoComGSE.gse))
    }
    buscarGSE()
  }, [colab])

  useEffect(() => {
    if (tipo !== 'periodico' || vencimentoEditado) return
    if (!dataRealizacao) { setDataVencimento(''); return }
    const d = new Date(dataRealizacao + 'T12:00:00')
    d.setFullYear(d.getFullYear() + 1)
    setDataVencimento(d.toISOString().split('T')[0])
  }, [tipo, dataRealizacao, vencimentoEditado])

  useEffect(() => { setDataVencimento(''); setVencimentoEditado(false) }, [tipo])

  async function salvar() {
    if (!dataRealizacao) { setErro('Data de realização é obrigatória.'); return }
    setSalvando(true); setErro('')
    try {
      let urlArquivo: string | null = null
      if (arquivo) {
        const ext = arquivo.name.split('.').pop()
        const path = `asos/${colab.matricula}/${tipo}/${Date.now()}.${ext}`
        const { error: uploadErr } = await supabase.storage.from('documentos').upload(path, arquivo)
        if (uploadErr) throw uploadErr
        const { data: urlData } = supabase.storage.from('documentos').getPublicUrl(path)
        urlArquivo = urlData.publicUrl
      }
      const { error: insertErr } = await supabase.from('asos').insert({
        matricula_colaborador: colab.matricula, tipo,
        data_realizacao: dataRealizacao,
        data_vencimento: TIPOS_SEM_VENCIMENTO.includes(tipo) ? null : (dataVencimento || null),
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
  const inp: React.CSSProperties = { width: '100%', height: 38, border: '1px solid #e0e0e0', borderRadius: 8, padding: '0 12px', fontSize: 13, boxSizing: 'border-box', outline: 'none', backgroundColor: 'white' }

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}>
      <div style={{ backgroundColor: 'white', borderRadius: 16, padding: 28, width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: '#1a1a1a', margin: 0 }}>Novo ASO</h2>
            <p style={{ fontSize: 13, color: '#888', margin: '3px 0 0' }}>{colab.nome} · {colab.matricula}</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#aaa' }}>✕</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>Tipo *</label>
            <select value={tipo} onChange={e => setTipo(e.target.value)} style={inp}>
              {TIPOS_ASO.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: semVencimento ? '1fr' : '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>Data de realização *</label>
              <input type="date" value={dataRealizacao} onChange={e => setDataRealizacao(e.target.value)} style={inp} />
            </div>
            {!semVencimento && (
              <div>
                <label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>
                  {tipo === 'periodico' ? 'Vencimento (auto +1 ano)' : 'Vencimento'}
                </label>
                <input type="date" value={dataVencimento}
                  onChange={e => { setDataVencimento(e.target.value); setVencimentoEditado(true) }}
                  style={{ ...inp, backgroundColor: dataVencimento ? '#f0fdf4' : 'white' }} />
                {dataVencimento && <p style={{ fontSize: 11, color: '#16a34a', margin: '3px 0 0' }}>✓ Calculado automaticamente</p>}
              </div>
            )}
          </div>
          {semVencimento && (
            <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '8px 12px' }}>
              <p style={{ fontSize: 12, color: '#16a34a', margin: 0 }}>✓ Este tipo de ASO não possui prazo de vencimento</p>
            </div>
          )}
          <div>
            <label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>GSE</label>
            <input type="number" value={gse} onChange={e => setGse(e.target.value)} placeholder="Número do grupo" style={inp} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>Observação <span style={{ color: '#aaa' }}>(opcional)</span></label>
            <textarea value={observacao} onChange={e => setObservacao(e.target.value)} rows={2} placeholder="Opcional" style={{ ...inp, height: 'auto', padding: '8px 12px', resize: 'none' }} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>Documento <span style={{ color: '#aaa' }}>(opcional)</span></label>
            <div onClick={() => fileRef.current?.click()} style={{ border: '2px dashed #e0e0e0', borderRadius: 10, padding: '16px 20px', textAlign: 'center', cursor: 'pointer', backgroundColor: '#fafafa' }}>
              <Icone tipo="upload" cor="#aaa" size={22} />
              <p style={{ fontSize: 12, color: '#888', margin: '6px 0 0' }}>{arquivo ? arquivo.name : 'Clique para anexar'}</p>
              <p style={{ fontSize: 11, color: '#bbb', margin: '2px 0 0' }}>PDF, JPG ou PNG</p>
              <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: 'none' }} onChange={e => setArquivo(e.target.files?.[0] || null)} />
            </div>
          </div>
          {erro && <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '8px 12px' }}><p style={{ fontSize: 12, color: '#dc2626', margin: 0 }}>{erro}</p></div>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
            <button onClick={onClose} style={{ height: 38, padding: '0 18px', border: '1px solid #e0e0e0', borderRadius: 8, fontSize: 13, cursor: 'pointer', background: 'white', color: '#555' }}>Cancelar</button>
            <button onClick={salvar} disabled={salvando} style={{ height: 38, padding: '0 22px', backgroundColor: COR, color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: salvando ? 'not-allowed' : 'pointer', opacity: salvando ? 0.7 : 1 }}>
              {salvando ? 'Salvando...' : 'Salvar ASO'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── PÁGINA PRINCIPAL ─────────────────────────────────────────────────────────
export default function MedTrabPage() {
  const router = useRouter()
  const { usuario } = useAuth()

  const [colabs, setColabs] = useState<Colaborador[]>([])
  const [bases, setBases] = useState<Base[]>([])
  const [loading, setLoading] = useState(true)

  const [busca, setBusca] = useState('')
  const [filtroBase, setFiltroBase] = useState('')
  const [filtroSits, setFiltroSits] = useState<string[]>([])
  const [situacoesDisp, setSituacoesDisp] = useState<string[]>([])
  const [cardAtivo, setCardAtivo] = useState<CardFiltro>(null)
  const [compacto, setCompacto] = useState(false)
  const [colunas, setColunas] = useState<string[]>([
    'matricula', 'nome', 'base', 'situacao', 'admissao', 'funcao',
    'processo', 'gse', 'admissional', 'periodico', 'retorno', 'mro', 'demissional', 'status',
  ])
  const [ordCol, setOrdCol] = useState<OrdemColuna>('nome')
  const [ordDir, setOrdDir] = useState<OrdemDirecao>('asc')

  const [modalASO, setModalASO] = useState<{ colab: Colaborador; aso: ASO | null; tipo: string; abaInicial: AbaModal } | null>(null)
  const [modalNovo, setModalNovo] = useState<Colaborador | null>(null)

  // ─── CARREGAR DADOS ──────────────────────────────────────────────────────────
  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: basesData } = await supabase.from('bases').select('id,nome').order('nome')
      setBases(basesData || [])
      await buscarColabs(null)
    }
    init()
  }, [])

  async function buscarColabs(sitsP: string[] | null) {
    const primeiraVez = sitsP === null
    const sitsB = primeiraVez ? [] : sitsP!
    setLoading(true)

    // Query 1: colaboradores (paginada)
    let todos: any[] = []; let from = 0; const ps = 500
    while (true) {
      let q = supabase.from('colaboradores').select(`
        matricula, nome, situacao, funcao_id, data_admissao, processo,
        bases (nome),
        funcoes (nome),
        gerencias!colaboradores_gerencia_id_fkey (sigla)
      `).order('nome').range(from, from + ps - 1)

      if (filtroBase) q = q.eq('base_id', filtroBase)
      if (!primeiraVez) {
        if (sitsB.length > 0) q = q.in('situacao', sitsB)
        else q = q.eq('situacao', '___nenhuma___')
      }

      const { data: cd } = await q
      if (!cd || cd.length === 0) break
      todos = [...todos, ...cd]
      if (cd.length < ps) break
      from += ps
    }

    // Primeira carga: deriva situações e aplica exclusões padrão
    if (primeiraVez) {
      const sitsUnicas = [...new Set(todos.map((c: any) => c.situacao).filter(Boolean))].sort() as string[]
      setSituacoesDisp(sitsUnicas)
      const sitsIniciais = sitsUnicas.filter(s => !SITUACOES_EXCLUIDAS_PADRAO.includes(s))
      setFiltroSits(sitsIniciais)
      todos = todos.filter((c: any) => sitsIniciais.includes(c.situacao))
    }

    // Query 2: ASOs filtrados pelas matrículas
    const mats = todos.map((c: any) => c.matricula)
    let asosData: any[] = []
    if (mats.length > 0) {
      const { data: aData } = await supabase
        .from('asos')
        .select('id, matricula_colaborador, tipo, data_realizacao, data_vencimento, gse, observacao, url_arquivo')
        .in('matricula_colaborador', mats)
      if (aData) asosData = aData
    }

    // Join no JavaScript
    setColabs(todos.map((c: any) => ({
      ...c,
      asos: asosData.filter((a: any) => a.matricula_colaborador === c.matricula),
    })) as Colaborador[])
    setLoading(false)
  }

  // Rebusca quando filtros de BD mudam
  useEffect(() => {
    if (situacoesDisp.length > 0) buscarColabs(filtroSits)
  }, [filtroBase, filtroSits])

  // ─── STATS ───────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const r = { no_prazo: 0, critico: 0, atencao: 0, vencido: 0, programado: 0 }
    colabs.forEach(c => {
      const s = getStatusColaborador(c)
      if (s === 'no_prazo') r.no_prazo++
      else if (s === 'critico') r.critico++
      else if (s === 'atencao') r.atencao++
      else if (s === 'vencido') r.vencido++
      if (temProgramado(c)) r.programado++
    })
    return r
  }, [colabs])

  // ─── FILTROS CLIENT-SIDE ─────────────────────────────────────────────────────
  const filtrados = useMemo(() => colabs.filter(c => {
    if (busca) {
      const b = busca.toLowerCase()
      if (!c.nome.toLowerCase().includes(b) && !c.matricula.includes(busca)) return false
    }
    if (cardAtivo === 'programado') return temProgramado(c)
    if (cardAtivo) return getStatusColaborador(c) === cardAtivo
    return true
  }), [colabs, busca, cardAtivo])

  // ─── ORDENAÇÃO ────────────────────────────────────────────────────────────────
  const ordenados = useMemo(() => [...filtrados].sort((a, b) => {
    let vA: string | number = '', vB: string | number = ''
    switch (ordCol) {
      case 'matricula':   vA = a.matricula; vB = b.matricula; break
      case 'nome':        vA = a.nome; vB = b.nome; break
      case 'base':        vA = a.bases?.nome || ''; vB = b.bases?.nome || ''; break
      case 'situacao':    vA = a.situacao || ''; vB = b.situacao || ''; break
      case 'admissao':    vA = a.data_admissao || ''; vB = b.data_admissao || ''; break
      case 'funcao':      vA = a.funcoes?.nome || ''; vB = b.funcoes?.nome || ''; break
      case 'processo':    vA = a.processo || ''; vB = b.processo || ''; break
      case 'gse': {
        vA = getASOPorTipo(a.asos, 'periodico')?.gse ?? 9999
        vB = getASOPorTipo(b.asos, 'periodico')?.gse ?? 9999
        break
      }
      case 'admissional': vA = getASOPorTipo(a.asos, 'admissional')?.data_realizacao || ''; vB = getASOPorTipo(b.asos, 'admissional')?.data_realizacao || ''; break
      case 'periodico':   vA = getASOPorTipo(a.asos, 'periodico')?.data_vencimento || '9999'; vB = getASOPorTipo(b.asos, 'periodico')?.data_vencimento || '9999'; break
      case 'retorno':     vA = getASOPorTipo(a.asos, 'retorno')?.data_realizacao || ''; vB = getASOPorTipo(b.asos, 'retorno')?.data_realizacao || ''; break
      case 'mro':         vA = getASOPorTipo(a.asos, 'mudanca_risco')?.data_realizacao || ''; vB = getASOPorTipo(b.asos, 'mudanca_risco')?.data_realizacao || ''; break
      case 'demissional': vA = getASOPorTipo(a.asos, 'demissional')?.data_realizacao || ''; vB = getASOPorTipo(b.asos, 'demissional')?.data_realizacao || ''; break
      case 'status': {
        const ord: Record<StatusASO, number> = { vencido: 0, atencao: 1, critico: 2, no_prazo: 3, sem_aso: 4 }
        vA = ord[getStatusColaborador(a)]; vB = ord[getStatusColaborador(b)]; break
      }
    }
    if (vA < vB) return ordDir === 'asc' ? -1 : 1
    if (vA > vB) return ordDir === 'asc' ? 1 : -1
    return 0
  }), [filtrados, ordCol, ordDir])

  function toggleOrd(c: OrdemColuna) {
    if (ordCol === c) setOrdDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setOrdCol(c); setOrdDir('asc') }
  }

  const sitsIniciais = useMemo(() => situacoesDisp.filter(s => !SITUACOES_EXCLUIDAS_PADRAO.includes(s)), [situacoesDisp])
  const sitsAlteradas = JSON.stringify([...filtroSits].sort()) !== JSON.stringify([...sitsIniciais].sort())
  const temFiltro = !!(busca || filtroBase || cardAtivo || sitsAlteradas)

  function limpar() {
    setBusca(''); setFiltroBase(''); setCardAtivo(null)
    setFiltroSits(sitsIniciais)
  }

  const vis = (k: string) => colunas.includes(k)
  const leftNome = vis('matricula') ? COL_MATRICULA : 0
  const padCell = compacto ? '4px 10px' : '8px 14px'
  const fs = compacto ? 12 : 13

  const colsDef = [
    { key: 'matricula',   label: 'Matrícula' },
    { key: 'nome',        label: 'Nome' },
    { key: 'base',        label: 'Base' },
    { key: 'situacao',    label: 'Situação' },
    { key: 'admissao',    label: 'Admissão' },
    { key: 'funcao',      label: 'Função' },
    { key: 'processo',    label: 'Processo' },
    { key: 'gse',         label: 'GSE' },
    { key: 'admissional', label: 'Admissional' },
    { key: 'periodico',   label: 'Periódico' },
    { key: 'retorno',     label: 'Retorno' },
    { key: 'mro',         label: 'MRO' },
    { key: 'demissional', label: 'Demissional' },
    { key: 'status',      label: 'Status' },
  ]

  const sel: React.CSSProperties = { height: 36, border: '1px solid #e0e0e0', borderRadius: 8, padding: '0 10px', fontSize: 13, backgroundColor: 'white', color: '#555' }
  const tdBase = (ex?: React.CSSProperties): React.CSSProperties => ({ padding: padCell, color: '#666', whiteSpace: 'nowrap', verticalAlign: 'middle', borderBottom: '1px solid #f5f5f5', borderRight: '1px solid #f0f0f0', ...ex })
  const stickyTd = (bg: string, l: number): React.CSSProperties => ({ position: 'sticky', left: l, backgroundColor: bg, zIndex: 10, borderRight: '2px solid #d0d0d0' })

  const CARDS = [
    { key: 'no_prazo'   as CardFiltro, label: 'No Prazo',               valor: stats.no_prazo,   cor: '#16a34a' },
    { key: 'critico'    as CardFiltro, label: 'Prazo Crítico',           valor: stats.critico,    cor: '#a16207' },
    { key: 'atencao'    as CardFiltro, label: 'Bernhoeft c/ Atenção',    valor: stats.atencao,    cor: '#c2410c' },
    { key: 'vencido'    as CardFiltro, label: 'Vencidos',                valor: stats.vencido,    cor: '#dc2626' },
    { key: 'programado' as CardFiltro, label: 'Programado (≤365 dias)',  valor: stats.programado, cor: '#7c3aed' },
  ]

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* TÍTULO */}
      <div style={{ marginBottom: 12 }}>
        <h1 style={{ fontSize: 18, fontWeight: 600, color: '#1a1a1a', margin: 0 }}>Medicina do Trabalho</h1>
        <p style={{ fontSize: 12, color: '#888', margin: '3px 0 0', fontWeight: 500 }}>Gestão de ASOs e vencimentos periódicos</p>
      </div>

      {/* CARDS */}
      {loading
        ? <div style={{ display: 'flex', gap: 12, marginBottom: 12, overflowX: 'auto', paddingBottom: 4 }}>
            {[...Array(5)].map((_, i) => (
              <div key={i} style={{ backgroundColor: 'white', borderRadius: 10, padding: '10px 16px', border: '1px solid #f0f0f0', minWidth: 160, flex: '1 0 160px' }}>
                <div style={{ height: 10, backgroundColor: '#f0f0f0', borderRadius: 4, marginBottom: 8, width: '60%' }} />
                <div style={{ height: 24, backgroundColor: '#f0f0f0', borderRadius: 4, width: '40%' }} />
              </div>
            ))}
          </div>
        : <div style={{ display: 'flex', gap: 12, marginBottom: 12, overflowX: 'auto', paddingBottom: 4 }}>
            {/* Card total (não filtrável) */}
            <div style={{ backgroundColor: 'white', borderRadius: 10, padding: '10px 16px', border: '1px solid #f0f0f0', minWidth: 160, flex: '1 0 160px' }}>
              <p style={{ fontSize: 11, color: '#888', margin: '0 0 4px' }}>Colaboradores</p>
              <p style={{ fontSize: 24, fontWeight: 600, color: '#4a4a49', margin: 0 }}>{filtrados.length.toLocaleString('pt-BR')}</p>
            </div>
            {CARDS.map((card, i) => {
              const ativo = cardAtivo === card.key
              return (
                <div key={i} onClick={() => setCardAtivo(ativo ? null : card.key)}
                  style={{ backgroundColor: ativo ? card.cor + '10' : 'white', borderRadius: 10, padding: '10px 16px', border: ativo ? `2px solid ${card.cor}` : '1px solid #f0f0f0', minWidth: 160, flex: '1 0 160px', cursor: 'pointer', transition: 'all 0.15s ease', boxShadow: ativo ? `0 2px 8px ${card.cor}30` : 'none' }}>
                  <p style={{ fontSize: 11, color: '#888', margin: '0 0 4px' }}>{card.label}{ativo && <span style={{ marginLeft: 6, fontSize: 10, color: card.cor }}>● filtrado</span>}</p>
                  <p style={{ fontSize: 24, fontWeight: 600, color: card.cor, margin: 0 }}>{card.valor.toLocaleString('pt-BR')}</p>
                </div>
              )
            })}
          </div>
      }

      {/* FILTROS */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="text" placeholder="Nome ou matrícula..." value={busca} onChange={e => setBusca(e.target.value)} style={{ ...sel, width: 200, padding: '0 12px' }} />
        <select value={filtroBase} onChange={e => setFiltroBase(e.target.value)} style={{ ...sel, width: 150 }}>
          <option value="">Todas as bases</option>
          {bases.map(b => <option key={b.id} value={b.id}>{b.nome}</option>)}
        </select>
        <FiltroSituacao opcoes={situacoesDisp} selecionadas={filtroSits} onChange={setFiltroSits} />
        <div style={{ flex: 1 }} />
        {temFiltro && (
          <button onClick={limpar} style={{ height: 36, padding: '0 12px', fontSize: 12, border: '1px solid #fca5a5', borderRadius: 8, backgroundColor: '#fef2f2', color: '#dc2626', cursor: 'pointer' }}>
            ✕ Limpar
          </button>
        )}
        <button onClick={() => setCompacto(c => !c)} style={{ height: 36, padding: '0 12px', fontSize: 12, border: `1px solid ${compacto ? COR : '#e0e0e0'}`, borderRadius: 8, backgroundColor: compacto ? '#fdf2f5' : 'white', color: compacto ? COR : '#555', cursor: 'pointer' }}>
          ⊟ Compacto
        </button>
        {colunas.length > 0 && <SeletorColunas colunas={colsDef} visiveis={colunas} onChange={setColunas} />}
        <BotaoExportar onClick={t => { const d = gerarExport(ordenados); t === 'csv' ? exportCSV(d) : exportXLSX(d) }} />
      </div>

      {/* TABELA */}
      {loading
        ? <p style={{ color: '#888', fontSize: 14 }}>Carregando dados da tabela...</p>
        : <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 230px)', borderRadius: 12, border: '1px solid #f0f0f0', flex: 1 }}>
            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, backgroundColor: 'white', fontSize: fs }}>
              <thead>
                <tr style={{ backgroundColor: '#fafafa' }}>
                  {vis('matricula')   && <Th label="Matrícula"  col="matricula"   ord={ordCol} dir={ordDir} onClick={toggleOrd} left={0}       style={{ width: COL_MATRICULA, minWidth: COL_MATRICULA }} />}
                  {vis('nome')        && <Th label="Nome"       col="nome"        ord={ordCol} dir={ordDir} onClick={toggleOrd} left={leftNome} style={{ width: COL_NOME, minWidth: COL_NOME }} />}
                  {vis('base')        && <Th label="Base"       col="base"        ord={ordCol} dir={ordDir} onClick={toggleOrd} />}
                  {vis('situacao')    && <Th label="Situação"   col="situacao"    ord={ordCol} dir={ordDir} onClick={toggleOrd} />}
                  {vis('admissao')    && <Th label="Admissão"   col="admissao"    ord={ordCol} dir={ordDir} onClick={toggleOrd} />}
                  {vis('funcao')      && <Th label="Função"     col="funcao"      ord={ordCol} dir={ordDir} onClick={toggleOrd} />}
                  {vis('processo')    && <Th label="Processo"   col="processo"    ord={ordCol} dir={ordDir} onClick={toggleOrd} />}
                  {vis('gse')         && <Th label="GSE"        col="gse"         ord={ordCol} dir={ordDir} onClick={toggleOrd} style={{ textAlign: 'center' }} />}
                  {vis('admissional') && <Th label="Admissional" col="admissional" ord={ordCol} dir={ordDir} onClick={toggleOrd} style={{ textAlign: 'center' }} />}
                  {vis('periodico')   && <Th label="Periódico"  col="periodico"   ord={ordCol} dir={ordDir} onClick={toggleOrd} style={{ textAlign: 'center' }} />}
                  {vis('retorno')     && <Th label="Retorno"    col="retorno"     ord={ordCol} dir={ordDir} onClick={toggleOrd} style={{ textAlign: 'center' }} />}
                  {vis('mro')         && <Th label="MRO"        col="mro"         ord={ordCol} dir={ordDir} onClick={toggleOrd} style={{ textAlign: 'center' }} />}
                  {vis('demissional') && <Th label="Demissional" col="demissional" ord={ordCol} dir={ordDir} onClick={toggleOrd} style={{ textAlign: 'center' }} />}
                  {vis('status')      && <Th label="Status"     col="status"      ord={ordCol} dir={ordDir} onClick={toggleOrd} />}
                </tr>
              </thead>
              <tbody>
                {ordenados.length === 0
                  ? <tr><td colSpan={99} style={{ padding: '40px 20px', textAlign: 'center', color: '#aaa', fontSize: 14 }}>Nenhum colaborador encontrado.</td></tr>
                  : ordenados.map((c, i) => {
                      const bg = i % 2 === 0 ? 'white' : '#fafafa'
                      const status = getStatusColaborador(c)
                      const cores = statusCores(status)
                      const asoAdm = getASOPorTipo(c.asos, 'admissional')
                      const asoPer = getASOPorTipo(c.asos, 'periodico')
                      const asoRet = getASOPorTipo(c.asos, 'retorno')
                      const asoMRO = getASOPorTipo(c.asos, 'mudanca_risco')
                      const asoDem = getASOPorTipo(c.asos, 'demissional')
                      return (
                        <tr key={c.matricula} style={{ backgroundColor: bg }}>
                          {vis('matricula') && <td style={{ ...tdBase(), ...stickyTd(bg, 0), width: COL_MATRICULA, minWidth: COL_MATRICULA }}>{c.matricula}</td>}
                          {vis('nome') && (
                            <td style={{ ...tdBase(), ...stickyTd(bg, leftNome), width: COL_NOME, minWidth: COL_NOME }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontWeight: 500, color: '#333', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: COL_NOME - 40 }}>{c.nome}</span>
                                <button
                                  title="Novo ASO"
                                  onClick={e => { e.stopPropagation(); setModalNovo(c) }}
                                  style={{ width: 20, height: 20, borderRadius: '50%', backgroundColor: '#f0f0f0', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: '#888', flexShrink: 0, lineHeight: 1 }}
                                  onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#fdf2f5'; e.currentTarget.style.color = COR }}
                                  onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#f0f0f0'; e.currentTarget.style.color = '#888' }}>
                                  +
                                </button>
                              </div>
                            </td>
                          )}
                          {vis('base')     && <td style={tdBase()}>{c.bases?.nome || '—'}</td>}
                          {vis('situacao') && (
                            <td style={tdBase()}>
                              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, backgroundColor: c.situacao === 'ATIVO' ? '#f0fdf4' : '#f1f5f9', color: c.situacao === 'ATIVO' ? '#16a34a' : '#64748b' }}>{c.situacao}</span>
                            </td>
                          )}
                          {vis('admissao')  && <td style={tdBase()}>{formatarData(c.data_admissao)}</td>}
                          {vis('funcao')    && <td style={tdBase()}>{c.funcoes?.nome || '—'}</td>}
                          {vis('processo')  && <td style={tdBase()}>{c.processo || '—'}</td>}
                          {vis('gse')       && <td style={tdBase({ textAlign: 'center' })}>{asoPer?.gse ?? '—'}</td>}
                          {vis('admissional') && <CelulaASO aso={asoAdm} tipo="admissional" compacto={compacto} onClick={() => setModalASO({ colab: c, aso: asoAdm, tipo: 'admissional', abaInicial: 'info' })} />}
                          {vis('periodico')   && <CelulaASO aso={asoPer} tipo="periodico"   compacto={compacto} onClick={() => setModalASO({ colab: c, aso: asoPer, tipo: 'periodico',   abaInicial: 'info' })} />}
                          {vis('retorno')     && <CelulaASO aso={asoRet} tipo="retorno"     compacto={compacto} onClick={() => setModalASO({ colab: c, aso: asoRet, tipo: 'retorno',     abaInicial: 'info' })} />}
                          {vis('mro')         && <CelulaASO aso={asoMRO} tipo="mudanca_risco" compacto={compacto} onClick={() => setModalASO({ colab: c, aso: asoMRO, tipo: 'mudanca_risco', abaInicial: 'info' })} />}
                          {vis('demissional')  && <CelulaASO aso={asoDem} tipo="demissional" compacto={compacto} onClick={() => setModalASO({ colab: c, aso: asoDem, tipo: 'demissional', abaInicial: 'info' })} />}
                          {vis('status') && (
                            <td style={tdBase()}>
                              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, backgroundColor: cores.bg, color: cores.text, fontWeight: 600, whiteSpace: 'nowrap' }}>
                                {statusLabel(status)}
                              </span>
                            </td>
                          )}
                        </tr>
                      )
                    })
                }
              </tbody>
            </table>
          </div>
      }

      {/* MODAIS */}
      {modalASO && (
        <ModalASO
          dados={{ colab: modalASO.colab, aso: modalASO.aso, tipo: modalASO.tipo }}
          abaInicial={modalASO.abaInicial}
          onClose={() => setModalASO(null)}
          onUpdate={() => buscarColabs(filtroSits)}
          email={usuario?.email || ''}
          podeAuditar={usuario?.pode_auditar || false}
          nivel={usuario?.nivel || 'visualizador'}
        />
      )}
      {modalNovo && (
        <ModalNovoASO
          colab={modalNovo}
          onClose={() => setModalNovo(null)}
          onSalvo={() => { setModalNovo(null); buscarColabs(filtroSits) }}
        />
      )}
    </div>
  )
}