'use client'

import { useEffect, useState, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'

const COR_PRIMARIA = '#9f183c'
const COR_CARD = '#ffffff'
const COR_TEXTO_PRINCIPAL = '#18181b'
const COR_TEXTO_SECUNDARIO = '#71717a'
const COR_BORDA = '#e4e4e7'
const CORES_STATUS = {
  verde: '#22c55e', laranja: '#f59e0b', vermelho: '#ef4444', roxo: '#8b5cf6', amarelo: '#d97706',
}
const hoje = new Date().toISOString().split('T')[0]
const SITUACOES_EXCLUIDAS_PADRAO = ['DEMITIDO', 'AF.PREVIDÊNCIA', 'LICENÇA MATERNIDADE']
const NRS_ALVO = ['NR 10-B', 'NR 11', 'NR 12 - II', 'NR 12 - V', 'NR 12 - XII', 'NR 35']
const POS_ALVO = ['Direção Defensiva', 'Pilotagem Defensiva']
const LOTE = 100

type AbaModulo = 'geral' | 'nr' | 'po' | 'medicina' | 'cnh'
type SituacaoNR = 'proximo' | 'critico' | 'atencao' | 'vencido' | 'programado'
type SituacaoMed = 'critico' | 'atencao' | 'vencido' | 'programado'
type SituacaoCNH = 'no_prazo' | 'proximo' | 'vencido' | 'sem_cnh' | 'na' 
type FiltroAtivo = { tipo: 'base' | 'gerencia' | 'supervisor'; valor: string } | null

interface MatrizNR { funcao: string; processo: string | null; treinamento: string; obrigatorio: string }
interface ColabNR {
  matricula: string; nome: string; funcao: string | null; processo: string | null
  base: string | null; gerencia: string | null; supervisor: string | null; situacao: string
  registros: Record<number, { data_vencimento: string | null; programacoes: string[] }>
}
interface ColabPO {
  matricula: string; nome: string; direcao: string; pilotagem: string
  base: string | null; gerencia: string | null; supervisor: string | null; situacao: string; funcao: string | null
  registros: Record<number, { data_vencimento: string | null; programacoes: string[] }>
}
interface ColabMed {
  matricula: string; nome: string; base: string | null; gerencia: string | null; supervisor: string | null; situacao: string; funcao: string | null
  asoVencimento: string | null; asoTipo: string | null; asoProgramacoes: string[]
}
interface ColabCNH {
  matricula: string; nome: string; base: string | null; gerencia: string | null; supervisor: string | null; situacao: string; funcao: string | null
  categoria: string | null; data_vencimento: string | null; numero_cnh: string | null; exigencia: string
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function getDias(dv: string | null): number | null {
  if (!dv) return null
  return Math.ceil((new Date(dv + 'T12:00:00').getTime() - new Date().getTime()) / 86400000)
}
function getStatusNR(dv: string): 'valido' | 'critico' | 'atencao' | 'vencido' {
  const diff = (new Date(dv + 'T12:00:00').getTime() - new Date().getTime()) / 86400000
  if (diff < 0) return 'vencido'
  if (diff <= 30) return 'atencao'
  if (diff <= 60) return 'critico'
  return 'valido'
}
function getStatusPO(dv: string): 'valido' | 'proximo' | 'vencido' {
  const diff = (new Date(dv + 'T12:00:00').getTime() - new Date().getTime()) / 86400000
  return diff < 0 ? 'vencido' : diff <= 30 ? 'proximo' : 'valido'
}
function getStatusMed(dv: string | null): 'no_prazo' | 'critico' | 'atencao' | 'vencido' | 'sem_aso' {
  if (!dv) return 'sem_aso'
  const dias = getDias(dv)
  if (dias === null || dias < 0) return 'vencido'
  if (dias <= 30) return 'atencao'
  if (dias <= 60) return 'critico'
  return 'no_prazo'
}

// HELPER DE CNH ATUALIZADO — Sincronizado perfeitamente com a regra da CNHPage
function getStatusCNHDashboard(numero_cnh: string | null, data_vencimento: string | null, exigencia: string): SituacaoCNH {
  if (!numero_cnh && exigencia === 'SIM') return 'sem_cnh'
  if (!numero_cnh) return 'na'
  
  const dias = getDias(data_vencimento)
  if (dias === null) return 'no_prazo'
  if (dias < 0) return 'vencido'
  if (dias <= 30) return 'proximo'
  return 'no_prazo'
}

function formatarData(d: string | null | undefined): string {
  if (!d) return '—'
  return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR')
}
function getObrigatoriedade(matriz: MatrizNR[], funcao: string | null, processo: string | null, nomeNr: string): 'SIM' | 'NAO' | 'NA' {
  if (!funcao) return 'NA'
  const fC = funcao.trim().toUpperCase(); const pC = (processo || '').trim().toUpperCase(); const nN = nomeNr.trim().toUpperCase()
  const regra = matriz.find(m => {
    const mF = m.funcao.trim().toUpperCase(); const mT = m.treinamento.trim().toUpperCase()
    if (m.processo && m.processo.trim() !== '') return mF === fC && m.processo.trim().toUpperCase() === pC && mT === nN
    return mF === fC && mT === nN
  })
  if (!regra) return 'NA'
  const v = regra.obrigatorio.trim().toUpperCase()
  return v === 'SIM' ? 'SIM' : (v === 'NÃO' || v === 'NAO') ? 'NAO' : 'NA'
}

function calcStatsNR(colabs: ColabNR[], nrs: { id: number; nome: string; validade_dias: number | null }[], matriz: MatrizNR[]) {
  let v = 0, c60 = 0, c30 = 0, vc = 0, prog = 0
  colabs.forEach(c => {
    nrs.forEach(nr => {
      if (getObrigatoriedade(matriz, c.funcao, c.processo, nr.nome) !== 'SIM') return
      const reg = c.registros[nr.id]
      if (!reg) { vc++; return }
      if (nr.validade_dias === null) { v++; return }
      const s = getStatusNR(reg.data_vencimento!)
      if (s === 'valido') v++; else if (s === 'critico') c60++; else if (s === 'atencao') c30++; else vc++
      if ((s === 'critico' || s === 'atencao' || s === 'vencido') && reg.programacoes.some(d => d >= hoje)) prog++
    })
  })
  return { validos: v, criticos: c60, atencao: c30, vencidos: vc, programados: prog }
}
function calcStatsPO(colabs: ColabPO[], pos: { id: number; nome: string; validade_dias: number }[]) {
  let v = 0, p = 0, vc = 0, prog = 0
  colabs.forEach(c => {
    pos.forEach(po => {
      const campo = po.nome === 'Direção Defensiva' ? c.direcao : c.pilotagem
      if (campo !== 'SIM') return
      const reg = c.registros[po.id]
      if (!reg) { vc++; return }
      const s = getStatusPO(reg.data_vencimento!)
      if (s === 'valido') v++; else if (s === 'proximo') p++; else vc++
      if ((s === 'proximo' || s === 'vencido') && reg.programacoes.some(d => d >= hoje)) prog++
    })
  })
  return { validos: v, proximos: p, vencidos: vc, programados: prog }
}
function calcStatsMed(colabs: ColabMed[]) {
  let mNP = 0, mC = 0, mA = 0, mV = 0, mProg = 0
  colabs.forEach(c => {
    const st = getStatusMed(c.asoVencimento)
    if (st === 'no_prazo') mNP++; else if (st === 'critico') mC++; else if (st === 'atencao') mA++; else if (st === 'vencido') mV++
    if ((st === 'critico' || st === 'atencao' || st === 'vencido') && c.asoProgramacoes.some(d => d >= hoje)) mProg++
  })
  return { mNP, mC, mA, mV, mProg }
}

// CALCSTATS CNH AJUSTADO — Sincronizado com os helpers novos
function calcStatsCNH(colabs: ColabCNH[]) {
  let noPrazo = 0, proximo = 0, vencido = 0, semCnh = 0
  colabs.forEach(c => {
    const s = getStatusCNHDashboard(c.numero_cnh, c.data_vencimento, c.exigencia)
    if (s === 'na') return
    if (s === 'sem_cnh') semCnh++
    else if (s === 'no_prazo') noPrazo++
    else if (s === 'proximo') proximo++
    else if (s === 'vencido') vencido++
  })
  return { noPrazo, proximo, vencido, semCnh }
}

async function buscarRegistrosEmLotes(matriculas: string[], regraIds: number[], map: Record<string, Record<number, { data_vencimento: string | null; programacoes: string[] }>>) {
  for (let i = 0; i < matriculas.length; i += LOTE) {
    const lote = matriculas.slice(i, i + LOTE); let from = 0
    while (true) {
      const { data: rd } = await supabase.from('registros_exames')
        .select('matricula_colaborador, regra_id, data_vencimento, programacoes_exames(data_programada)')
        .eq('is_atual', true).in('regra_id', regraIds).in('matricula_colaborador', lote).range(from, from + 499)
      if (!rd || rd.length === 0) break
      rd.forEach((r: any) => {
        if (!map[r.matricula_colaborador]) map[r.matricula_colaborador] = {}
        map[r.matricula_colaborador][r.regra_id] = { data_vencimento: r.data_vencimento, programacoes: (r.programacoes_exames || []).map((p: any) => p.data_programada) }
      })
      if (rd.length < 500) break; from += 500
    }
  }
}

// ─── CONTAGEM POR GRUPO ────────────────────────────────────────────────────────
function contarNRPorGrupo(colabs: ColabNR[], nrs: { id: number; nome: string; validade_dias: number | null }[], matriz: MatrizNR[], agrup: 'base' | 'gerencia' | 'supervisor', situacao: SituacaoNR): { nome: string; total: number }[] {
  const grupos: Record<string, number> = {}
  colabs.forEach(c => {
    const chave = agrup === 'base' ? c.base : agrup === 'gerencia' ? c.gerencia : c.supervisor
    if (!chave) return
    nrs.forEach(nr => {
      if (getObrigatoriedade(matriz, c.funcao, c.processo, nr.nome) !== 'SIM') return
      if (nr.validade_dias === null) return
      const reg = c.registros[nr.id]
      if (situacao === 'programado') {
        if (!reg) return
        const s = getStatusNR(reg.data_vencimento!)
        if (!((s === 'critico' || s === 'atencao' || s === 'vencido') && reg.programacoes.some(d => d >= hoje))) return
      } else if (situacao === 'proximo') {
        if (!reg) return; const s = getStatusNR(reg.data_vencimento!); if (s !== 'critico' && s !== 'atencao') return
      } else if (situacao === 'critico') {
        if (!reg || getStatusNR(reg.data_vencimento!) !== 'critico') return
      } else if (situacao === 'atencao') {
        if (!reg || getStatusNR(reg.data_vencimento!) !== 'atencao') return
      } else {
        if (reg && getStatusNR(reg.data_vencimento!) !== 'vencido') return
      }
      grupos[chave] = (grupos[chave] || 0) + 1
    })
  })
  return Object.entries(grupos).map(([nome, total]) => ({ nome, total })).sort((a, b) => b.total - a.total)
}
function contarPOPorGrupo(colabs: ColabPO[], pos: { id: number; nome: string }[], agrup: 'base' | 'gerencia' | 'supervisor', situacao: SituacaoNR): { nome: string; total: number }[] {
  const grupos: Record<string, number> = {}
  colabs.forEach(c => {
    const chave = agrup === 'base' ? c.base : agrup === 'gerencia' ? c.gerencia : c.supervisor
    if (!chave) return
    pos.forEach(po => {
      const campo = po.nome === 'Direção Defensiva' ? c.direcao : c.pilotagem
      if (campo !== 'SIM') return
      const reg = c.registros[po.id]
      if (situacao === 'programado') {
        if (!reg) return; const s = getStatusPO(reg.data_vencimento!)
        if (!((s === 'proximo' || s === 'vencido') && reg.programacoes.some(d => d >= hoje))) return
      } else if (situacao === 'proximo') {
        if (!reg || getStatusPO(reg.data_vencimento!) !== 'proximo') return
      } else {
        if (reg && getStatusPO(reg.data_vencimento!) !== 'vencido') return
      }
      grupos[chave] = (grupos[chave] || 0) + 1
    })
  })
  return Object.entries(grupos).map(([nome, total]) => ({ nome, total })).sort((a, b) => b.total - a.total)
}
function contarMedPorGrupo(colabs: ColabMed[], agrup: 'base' | 'gerencia' | 'supervisor', situacao: SituacaoMed): { nome: string; total: number }[] {
  const grupos: Record<string, number> = {}
  colabs.forEach(c => {
    const st = getStatusMed(c.asoVencimento)
    if (situacao === 'programado') {
      if (!((st === 'critico' || st === 'atencao' || st === 'vencido') && c.asoProgramacoes.some(d => d >= hoje))) return
    } else {
      if (st === 'sem_aso' || st === 'no_prazo' || st !== situacao) return
    }
    const chave = agrup === 'base' ? c.base : agrup === 'gerencia' ? c.gerencia : c.supervisor
    if (!chave) return
    grupos[chave] = (grupos[chave] || 0) + 1
  })
  return Object.entries(grupos).map(([nome, total]) => ({ nome, total })).sort((a, b) => b.total - a.total)
}
function contarCNHPorGrupo(colabs: ColabCNH[], agrup: 'base' | 'gerencia' | 'supervisor', situacao: 'proximo' | 'vencido' | 'sem_cnh'): { nome: string; total: number }[] {
  const grupos: Record<string, number> = {}
  colabs.forEach(c => {
    const s = getStatusCNHDashboard(c.numero_cnh, c.data_vencimento, c.exigencia)
    if (s !== situacao) return
    const chave = agrup === 'base' ? c.base : agrup === 'gerencia' ? c.gerencia : c.supervisor
    if (!chave) return
    grupos[chave] = (grupos[chave] || 0) + 1
  })
  return Object.entries(grupos).map(([nome, total]) => ({ nome, total })).sort((a, b) => b.total - a.total)
}

function corSituacaoNR(s: SituacaoNR) {
  if (s === 'critico' || s === 'proximo') return CORES_STATUS.laranja
  if (s === 'atencao') return CORES_STATUS.amarelo
  if (s === 'vencido') return CORES_STATUS.vermelho
  return CORES_STATUS.roxo
}
function corSituacaoMed(s: SituacaoMed) { return s === 'critico' ? CORES_STATUS.laranja : s === 'atencao' ? CORES_STATUS.amarelo : CORES_STATUS.vermelho }
function corSituacaoCNH(s: 'proximo' | 'vencido' | 'sem_cnh') { return s === 'proximo' ? CORES_STATUS.laranja : s === 'vencido' ? CORES_STATUS.vermelho : COR_TEXTO_SECUNDARIO }

// ─── FILTRO MULTI-SELECT SITUAÇÃO ─────────────────────────────────────────────
function FiltroSituacao({ opcoes, selecionadas, onChange, labelTodas = 'Todas as situações', labelContagem = 'situações' }: { opcoes: string[]; selecionadas: string[]; onChange: (v: string[]) => void; labelTodas?: string; labelContagem?: string }) {
  const [open, setOpen] = useState(false); const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h) }, [])
  const toggle = (s: string) => onChange(selecionadas.includes(s) ? selecionadas.filter(x => x !== s) : [...selecionadas, s])
  const todas = opcoes.every(o => selecionadas.includes(o))
  let label = labelTodas
  if (selecionadas.length === 0) label = 'Nenhuma'
  else if (!todas) label = selecionadas.length === 1 ? selecionadas[0] : `${selecionadas.length} ${labelContagem}`
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(!open)} style={{ height: 36, border: `1px solid ${COR_BORDA}`, borderRadius: 8, padding: '0 10px', fontSize: 13, backgroundColor: 'white', color: COR_TEXTO_SECUNDARIO, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, minWidth: 160, justifyContent: 'space-between' }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        <span style={{ fontSize: 10, flexShrink: 0 }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && <div style={{ position: 'absolute', top: 40, left: 0, zIndex: 150, backgroundColor: 'white', border: `1px solid ${COR_BORDA}`, borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', width: 220, overflow: 'hidden' }}>
        <div style={{ padding: '8px 14px', borderBottom: `1px solid ${COR_BORDA}` }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 600, color: COR_TEXTO_PRINCIPAL, cursor: 'pointer' }}>
            <input type="checkbox" checked={todas} onChange={() => onChange(todas ? [] : opcoes)} style={{ accentColor: COR_PRIMARIA }} />Todas as situações
          </label>
        </div>
        {opcoes.map(op => (
          <label key={op} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px', fontSize: 12, cursor: 'pointer', backgroundColor: selecionadas.includes(op) ? '#fdf2f5' : 'white', color: selecionadas.includes(op) ? COR_PRIMARIA : COR_TEXTO_SECUNDARIO }}>
            <input type="checkbox" checked={selecionadas.includes(op)} onChange={() => toggle(op)} style={{ accentColor: COR_PRIMARIA }} />{op}</label>
        ))}
      </div>}
    </div>
  )
}

// ─── BOTÃO EXPORTAR ───────────────────────────────────────────────────────────
function BotaoExportar({ onClick }: { onClick: (t: 'csv' | 'xlsx') => void }) {
  const [open, setOpen] = useState(false); const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h) }, [])
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(!open)} style={{ height: 36, padding: '0 10px', fontSize: 12, border: `1px solid ${COR_BORDA}`, borderRadius: 8, backgroundColor: 'white', color: COR_TEXTO_SECUNDARIO, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
        <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M8 13h2m4 0h2M8 17h2m4 0h2M10 13v4" /></svg>
        <span style={{ fontSize: 11 }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && <div style={{ position: 'absolute', top: 40, right: 0, zIndex: 150, backgroundColor: 'white', border: `1px solid ${COR_BORDA}`, borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', width: 180, overflow: 'hidden' }}>
        {(['csv', 'xlsx'] as const).map((t, i) => (
          <button key={t} onClick={() => { onClick(t); setOpen(false) }} style={{ width: '100%', padding: '10px 16px', fontSize: 13, textAlign: 'left', border: 'none', background: 'none', cursor: 'pointer', color: '#333', display: 'flex', alignItems: 'center', gap: 10, borderTop: i > 0 ? `1px solid ${COR_BORDA}` : 'none' }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f9f9f9'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
            {t === 'csv' ? '📄 Exportar CSV' : '📊 Exportar Excel'}
          </button>
        ))}
      </div>}
    </div>
  )
}

function exportCSV(dados: Record<string, string | number>[]) {
  if (!dados.length) return
  const cols = Object.keys(dados[0])
  const csv = [cols.map(h => `"${h}"`).join(';'), ...dados.map(r => cols.map(h => `"${String(r[h] ?? '').replace(/"/g, '""')}"`).join(';'))].join('\n')
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })); a.download = `dashboard-${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.csv`; a.click()
}
function exportXLSX(dados: Record<string, string | number>[]) {
  if (!dados.length) return
  import('xlsx').then(X => { const ws = X.utils.json_to_sheet(dados); const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, ws, 'Dashboard'); X.writeFile(wb, `dashboard-${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.xlsx`) })
}

// ─── FILTROS GLOBAIS ──────────────────────────────────────────────────────────
function FiltrosGlobais({ bases, gerencias, supervisores, situacoes, filtroBase, filtroGer, filtroSup, filtroSits, onBase, onGer, onSup, onSits, abaModulo, filtroNRTipos, filtroPOTipos, onNRTipos, onPOTipos, filtroCNHExigencia, onCNHExigencia }: {
  bases: string[]; gerencias: string[]; supervisores: string[]; situacoes: string[]
  filtroBase: string; filtroGer: string; filtroSup: string; filtroSits: string[]
  onBase: (v: string) => void; onGer: (v: string) => void; onSup: (v: string) => void; onSits: (v: string[]) => void
  abaModulo: AbaModulo
  filtroNRTipos: string[]; filtroPOTipos: string[]
  onNRTipos: (v: string[]) => void; onPOTipos: (v: string[]) => void
  filtroCNHExigencia: string; onCNHExigencia: (v: string) => void
}) {
  const sel: React.CSSProperties = { height: 36, border: `1px solid ${COR_BORDA}`, borderRadius: 8, padding: '0 10px', fontSize: 13, backgroundColor: 'white', color: COR_TEXTO_SECUNDARIO, outline: 'none' }
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', padding: '12px 16px', backgroundColor: '#f9f9fb', borderRadius: 12, border: `1px solid ${COR_BORDA}` }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: COR_TEXTO_SECUNDARIO, marginRight: 4 }}>Filtros:</span>
      <select value={filtroBase} onChange={e => onBase(e.target.value)} style={sel}><option value="">Todas as bases</option>{bases.map(b => <option key={b} value={b}>{b}</option>)}</select>
      <select value={filtroGer} onChange={e => onGer(e.target.value)} style={sel}><option value="">Todas as gerências</option>{gerencias.map(g => <option key={g} value={g}>{g}</option>)}</select>
      <select value={filtroSup} onChange={e => onSup(e.target.value)} style={sel}><option value="">Todos os coordenadores</option>{supervisores.map(s => <option key={s} value={s}>{s.split(' ')[0]}</option>)}</select>
      <FiltroSituacao opcoes={situacoes} selecionadas={filtroSits} onChange={onSits} />
      {abaModulo === 'nr' && (
        <FiltroSituacao
          opcoes={NRS_ALVO}
          selecionadas={filtroNRTipos}
          onChange={v => onNRTipos(v.length === 0 ? NRS_ALVO : v)}
          labelTodas="Todos os Treinamentos"
          labelContagem="treinamentos"
        />
      )}
      {abaModulo === 'po' && (
        <FiltroSituacao
          opcoes={POS_ALVO}
          selecionadas={filtroPOTipos}
          onChange={v => onPOTipos(v.length === 0 ? POS_ALVO : v)}
          labelTodas="Todos os cursos"
          labelContagem="cursos"
        />
      )}
      {abaModulo === 'cnh' && (
        <select value={filtroCNHExigencia} onChange={e => onCNHExigencia(e.target.value)} style={sel}>
          <option value="">Toda exigência</option>
          <option value="SIM">Exigida</option>
          <option value="N/A">N/A</option>
        </select>
      )}
      {(filtroBase || filtroGer || filtroSup) && <button onClick={() => { onBase(''); onGer(''); onSup('') }} style={{ height: 36, padding: '0 12px', fontSize: 12, border: '1px solid #fca5a5', borderRadius: 8, backgroundColor: '#fef2f2', color: '#dc2626', cursor: 'pointer' }}>✕ Limpar</button>}
    </div>
  )
}

// ─── COMPONENTES UI ───────────────────────────────────────────────────────────
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ backgroundColor: 'white', border: `1px solid ${COR_BORDA}`, borderRadius: 10, padding: '10px 14px', boxShadow: '0 8px 20px rgba(0,0,0,0.1)' }}>
      <p style={{ fontWeight: 600, color: COR_TEXTO_PRINCIPAL, margin: '0 0 4px', fontSize: 12 }}>{label}</p>
      <p style={{ fontSize: 12, color: COR_TEXTO_SECUNDARIO, margin: 0 }}>Total: <strong style={{ color: payload[0]?.fill }}>{payload[0]?.value}</strong></p>
    </div>
  )
}
function CardStat({ label, valor, cor, sub, icone }: { label: string; valor: number; cor: string; sub?: string; icone?: string }) {
  return (
    <div style={{ backgroundColor: COR_CARD, borderRadius: 16, padding: '20px 24px', border: `1px solid ${COR_BORDA}`, display: 'flex', flexDirection: 'column', justifyContent: 'center', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', transition: 'transform 0.2s, box-shadow 0.2s', cursor: 'default' }}
      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(0,0,0,0.1)' }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.05)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        {icone && <span style={{ color: cor, fontSize: 14 }}>{icone}</span>}
        <p style={{ fontSize: 12, color: COR_TEXTO_SECUNDARIO, margin: 0, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</p>
      </div>
      <p style={{ fontSize: 32, fontWeight: 800, color: cor, margin: 0, lineHeight: 1 }}>{valor.toLocaleString('pt-BR')}</p>
      {sub && <p style={{ fontSize: 11, color: '#a1a1aa', margin: '8px 0 0', fontWeight: 500 }}>{sub}</p>}
    </div>
  )
}
function SecaoHeader({ titulo }: { titulo: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '24px 0 16px' }}>
      <h2 style={{ fontSize: 15, fontWeight: 700, color: COR_TEXTO_PRINCIPAL, textTransform: 'uppercase', letterSpacing: '0.5px', margin: 0 }}>{titulo}</h2>
      <div style={{ flex: 1, height: 1, backgroundColor: COR_BORDA }} />
    </div>
  )
}
function ToggleSituacaoNR({ valor, onChange }: { valor: SituacaoNR; onChange: (v: SituacaoNR) => void }) {
  const ops: { key: SituacaoNR; label: string; cor: string }[] = [{ key: 'proximo', label: 'Próximos do Vencimento', cor: CORES_STATUS.laranja }, { key: 'vencido', label: 'Vencidos', cor: CORES_STATUS.vermelho }, { key: 'programado', label: 'Programados', cor: CORES_STATUS.roxo }]
  return (
    <div style={{ display: 'inline-flex', backgroundColor: '#f4f4f5', borderRadius: 12, padding: 4, border: `1px solid ${COR_BORDA}`, gap: 2 }}>
      {ops.map(op => <button key={op.key} onClick={() => onChange(op.key)} style={{ padding: '8px 16px', fontSize: 13, fontWeight: valor === op.key ? 600 : 500, border: 'none', borderRadius: 8, cursor: 'pointer', backgroundColor: valor === op.key ? '#fff' : 'transparent', color: valor === op.key ? op.cor : COR_TEXTO_SECUNDARIO, boxShadow: valor === op.key ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', transition: 'all 0.2s' }}>{op.label}</button>)}
    </div>
  )
}

function ToggleSituacaoNRFull({ valor, onChange }: { valor: SituacaoNR; onChange: (v: SituacaoNR) => void }) {
  const ops: { key: SituacaoNR; label: string; cor: string }[] = [
    { key: 'critico',    label: 'Prazo Crítico',          cor: CORES_STATUS.laranja },
    { key: 'atencao',   label: 'Bernhoeft c/ Atenção',    cor: CORES_STATUS.amarelo },
    { key: 'vencido',   label: 'Falta / Vencidos',        cor: CORES_STATUS.vermelho },
    { key: 'programado',label: 'Programados',             cor: CORES_STATUS.roxo },
  ]
  return (
    <div style={{ display: 'inline-flex', backgroundColor: '#f4f4f5', borderRadius: 12, padding: 4, border: `1px solid ${COR_BORDA}`, gap: 2 }}>
      {ops.map(op => <button key={op.key} onClick={() => onChange(op.key)} style={{ padding: '8px 16px', fontSize: 13, fontWeight: valor === op.key ? 600 : 500, border: 'none', borderRadius: 8, cursor: 'pointer', backgroundColor: valor === op.key ? '#fff' : 'transparent', color: valor === op.key ? op.cor : COR_TEXTO_SECUNDARIO, boxShadow: valor === op.key ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', transition: 'all 0.2s' }}>{op.label}</button>)}
    </div>
  )
}

function ToggleSituacaoMed({ valor, onChange }: { valor: SituacaoMed; onChange: (v: SituacaoMed) => void }) {
  const ops: { key: SituacaoMed; label: string; cor: string }[] = [
    { key: 'critico',    label: 'Prazo Crítico',        cor: CORES_STATUS.laranja },
    { key: 'atencao',   label: 'Bernhoeft c/ Atenção', cor: CORES_STATUS.amarelo },
    { key: 'vencido',   label: 'Vencidos',              cor: CORES_STATUS.vermelho },
    { key: 'programado',label: 'Programados',           cor: CORES_STATUS.roxo },
  ]
  return (
    <div style={{ display: 'inline-flex', backgroundColor: '#f4f4f5', borderRadius: 12, padding: 4, border: `1px solid ${COR_BORDA}`, gap: 2 }}>
      {ops.map(op => <button key={op.key} onClick={() => onChange(op.key)} style={{ padding: '8px 16px', fontSize: 13, fontWeight: valor === op.key ? 600 : 500, border: 'none', borderRadius: 8, cursor: 'pointer', backgroundColor: valor === op.key ? '#fff' : 'transparent', color: valor === op.key ? op.cor : COR_TEXTO_SECUNDARIO, boxShadow: valor === op.key ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', transition: 'all 0.2s' }}>{op.label}</button>)}
    </div>
  )
}
function ToggleSituacaoCNH({ valor, onChange }: { valor: 'proximo' | 'vencido' | 'sem_cnh'; onChange: (v: 'proximo' | 'vencido' | 'sem_cnh') => void }) {
  const ops: { key: 'proximo' | 'vencido' | 'sem_cnh'; label: string; cor: string }[] = [
    { key: 'proximo', label: 'Próximos do Vencimento', cor: CORES_STATUS.laranja }, 
    { key: 'vencido', label: 'Vencidos', cor: CORES_STATUS.vermelho },
    { key: 'sem_cnh', label: 'Sem CNH', cor: COR_TEXTO_SECUNDARIO }
  ]
  return (
    <div style={{ display: 'inline-flex', backgroundColor: '#f4f4f5', borderRadius: 12, padding: 4, border: `1px solid ${COR_BORDA}`, gap: 2 }}>
      {ops.map(op => <button key={op.key} onClick={() => onChange(op.key)} style={{ padding: '8px 16px', fontSize: 13, fontWeight: valor === op.key ? 600 : 500, border: 'none', borderRadius: 8, cursor: 'pointer', backgroundColor: valor === op.key ? '#fff' : 'transparent', color: valor === op.key ? op.cor : COR_TEXTO_SECUNDARIO, boxShadow: valor === op.key ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', transition: 'all 0.2s' }}>{op.label}</button>)}
    </div>
  )
}
function BadgeFiltro({ filtro, onLimpar }: { filtro: FiltroAtivo; onLimpar: () => void }) {
  if (!filtro) return null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', backgroundColor: '#fdf2f5', border: `1px solid ${COR_PRIMARIA}`, borderRadius: 20, width: 'fit-content' }}>
      <span style={{ fontSize: 12, color: COR_PRIMARIA, fontWeight: 600 }}>Filtro: {filtro.valor}</span>
      <button onClick={onLimpar} style={{ fontSize: 13, color: COR_PRIMARIA, background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1 }}>✕</button>
    </div>
  )
}

function GraficoHorizontal({ dados, cor, titulo, vazio, tipoAgrup, filtroAtivo, onFiltro }: { dados: { nome: string; total: number }[]; cor: string; titulo: string; vazio: string; tipoAgrup: 'base' | 'gerencia' | 'supervisor'; filtroAtivo: FiltroAtivo; onFiltro: (f: FiltroAtivo) => void }) {
  if (!dados.length) return <div style={{ backgroundColor: COR_CARD, borderRadius: 16, padding: '24px', border: `1px solid ${COR_BORDA}` }}><p style={{ fontSize: 14, fontWeight: 700, color: COR_TEXTO_PRINCIPAL, margin: '0 0 12px' }}>{titulo}</p><div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><p style={{ fontSize: 13, color: '#ccc' }}>{vazio}</p></div></div>
  const altura = Math.max(160, dados.length * 36 + 40)
  return (
    <div style={{ backgroundColor: COR_CARD, borderRadius: 16, padding: '24px', border: `1px solid ${COR_BORDA}` }}>
      <p style={{ fontSize: 14, fontWeight: 700, color: COR_TEXTO_PRINCIPAL, margin: '0 0 4px' }}>{titulo}</p>
      <p style={{ fontSize: 11, color: COR_TEXTO_SECUNDARIO, margin: '0 0 16px' }}>Clique para filtrar</p>
      <ResponsiveContainer width="100%" height={altura}>
        <BarChart data={dados} layout="vertical" margin={{ top: 0, right: 40, left: 10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={COR_BORDA} horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 11, fill: COR_TEXTO_SECUNDARIO }} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="nome" tick={{ fontSize: 12, fill: COR_TEXTO_PRINCIPAL, fontWeight: 500 }} axisLine={false} tickLine={false} width={70} />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f4f4f5' }} />
          <Bar dataKey="total" radius={[0, 6, 6, 0]} barSize={22} label={{ position: 'right', fontSize: 12, fill: COR_TEXTO_SECUNDARIO, fontWeight: 600 }}
            onClick={(data: any) => { const ativo = filtroAtivo?.tipo === tipoAgrup && filtroAtivo?.valor === data.nome; onFiltro(ativo ? null : { tipo: tipoAgrup, valor: data.nome }) }} style={{ cursor: 'pointer' }}>
            {dados.map((entry) => { const selecionado = filtroAtivo?.tipo === tipoAgrup && filtroAtivo?.valor === entry.nome; const desbotado = filtroAtivo?.tipo === tipoAgrup && filtroAtivo?.valor !== entry.nome; return <Cell key={entry.nome} fill={desbotado ? '#d1d5db' : cor} opacity={selecionado ? 1 : desbotado ? 0.5 : 1} /> })}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
function GraficoVertical({ dados, cor, titulo, vazio, tipoAgrup, filtroAtivo, onFiltro }: { dados: { nome: string; total: number }[]; cor: string; titulo: string; vazio: string; tipoAgrup: 'base' | 'gerencia' | 'supervisor'; filtroAtivo: FiltroAtivo; onFiltro: (f: FiltroAtivo) => void }) {
  const top10 = [...dados].sort((a, b) => b.total - a.total).slice(0, 10)
  if (!top10.length) return <div style={{ backgroundColor: COR_CARD, borderRadius: 16, padding: '24px', border: `1px solid ${COR_BORDA}` }}><p style={{ fontSize: 14, fontWeight: 700, color: COR_TEXTO_PRINCIPAL, margin: '0 0 16px' }}>{titulo}</p><div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><p style={{ fontSize: 13, color: '#ccc' }}>{vazio}</p></div></div>
  return (
    <div style={{ backgroundColor: COR_CARD, borderRadius: 16, padding: '24px', border: `1px solid ${COR_BORDA}` }}>
      <p style={{ fontSize: 14, fontWeight: 700, color: COR_TEXTO_PRINCIPAL, margin: '0 0 4px' }}>{titulo} <span style={{ fontSize: 11, color: COR_TEXTO_SECUNDARIO, fontWeight: 400 }}>Top 10</span></p>
      <p style={{ fontSize: 11, color: COR_TEXTO_SECUNDARIO, margin: '0 0 16px' }}>Clique para filtrar</p>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={top10} margin={{ top: 10, right: 10, left: -20, bottom: 60 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={COR_BORDA} vertical={false} />
          <XAxis dataKey="nome" tick={{ fontSize: 11, fill: COR_TEXTO_SECUNDARIO }} axisLine={{ stroke: COR_BORDA }} tickLine={false} angle={-35} textAnchor="end" interval={0} dy={10} />
          <YAxis tick={{ fontSize: 11, fill: COR_TEXTO_SECUNDARIO }} axisLine={false} tickLine={false} dx={-10} />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f4f4f5' }} />
          <Bar dataKey="total" radius={[6, 6, 0, 0]} barSize={32} label={{ position: 'top', fontSize: 12, fill: COR_TEXTO_SECUNDARIO, fontWeight: 600 }}
            onClick={(data: any) => { const ativo = filtroAtivo?.tipo === tipoAgrup && filtroAtivo?.valor === data.nome; onFiltro(ativo ? null : { tipo: tipoAgrup, valor: data.nome }) }} style={{ cursor: 'pointer' }}>
            {top10.map((entry) => { const selecionado = filtroAtivo?.tipo === tipoAgrup && filtroAtivo?.valor === entry.nome; const desbotado = filtroAtivo?.tipo === tipoAgrup && filtroAtivo?.valor !== entry.nome; return <Cell key={entry.nome} fill={desbotado ? '#d1d5db' : cor} opacity={selecionado ? 1 : desbotado ? 0.5 : 1} /> })}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ─── TABELAS POR ABA ──────────────────────────────────────────────────────────
function TabelaNR({ colabs, nrs, matriz, situacao, filtroAtivo }: { colabs: ColabNR[]; nrs: { id: number; nome: string; validade_dias: number | null }[]; matriz: MatrizNR[]; situacao: SituacaoNR; filtroAtivo: FiltroAtivo }) {
  const [ordCol, setOrdCol] = useState('vencimento')
  const [ordDir, setOrdDir] = useState<'asc' | 'desc'>('asc')
  function toggleOrd(col: string) { if (ordCol === col) setOrdDir(d => d === 'asc' ? 'desc' : 'asc'); else { setOrdCol(col); setOrdDir('asc') } }
  const linhas = useMemo(() => {
    const rows: { matricula: string; nome: string; base: string | null; gerencia: string | null; supervisor: string | null; funcao: string | null; treinamento: string; vencimento: string | null; dias: number | null }[] = []
    const filtrados = filtroAtivo ? colabs.filter(c => {
      if (filtroAtivo.tipo === 'base') return c.base === filtroAtivo.valor
      if (filtroAtivo.tipo === 'gerencia') return c.gerencia === filtroAtivo.valor
      return c.supervisor === filtroAtivo.valor
    }) : colabs
    filtrados.forEach(c => {
      nrs.forEach(nr => {
        if (getObrigatoriedade(matriz, c.funcao, c.processo, nr.nome) !== 'SIM') return
        if (nr.validade_dias === null) return
        const reg = c.registros[nr.id]
        let incluir = false
        if (situacao === 'programado') {
          if (reg) { const s = getStatusNR(reg.data_vencimento!); incluir = (s === 'critico' || s === 'atencao' || s === 'vencido') && reg.programacoes.some(d => d >= hoje) }
        } else if (situacao === 'proximo') {
          if (reg) { const s = getStatusNR(reg.data_vencimento!); incluir = s === 'critico' || s === 'atencao' }
        } else if (situacao === 'critico') {
          if (reg) incluir = getStatusNR(reg.data_vencimento!) === 'critico'
        } else if (situacao === 'atencao') {
          if (reg) incluir = getStatusNR(reg.data_vencimento!) === 'atencao'
        } else {
          incluir = !reg || getStatusNR(reg.data_vencimento!) === 'vencido'
        }
        if (!incluir) return
        rows.push({ matricula: c.matricula, nome: c.nome, base: c.base, gerencia: c.gerencia, supervisor: c.supervisor ? c.supervisor.split(' ')[0] : null, funcao: c.funcao, treinamento: nr.nome, vencimento: reg?.data_vencimento || null, dias: reg ? getDias(reg.data_vencimento) : null })
      })
    })
    return rows.sort((a, b) => {
      let vA: string | number = '', vB: string | number = ''
      if (ordCol === 'matricula')   { vA = a.matricula; vB = b.matricula }
      else if (ordCol === 'nome')   { vA = a.nome; vB = b.nome }
      else if (ordCol === 'base')   { vA = a.base || ''; vB = b.base || '' }
      else if (ordCol === 'gerencia')   { vA = a.gerencia || ''; vB = b.gerencia || '' }
      else if (ordCol === 'supervisor') { vA = a.supervisor || ''; vB = b.supervisor || '' }
      else if (ordCol === 'funcao')     { vA = a.funcao || ''; vB = b.funcao || '' }
      else if (ordCol === 'treinamento') { vA = a.treinamento; vB = b.treinamento }
      else if (ordCol === 'vencimento') { vA = a.vencimento || '9999'; vB = b.vencimento || '9999' }
      else if (ordCol === 'dias')  { vA = a.dias ?? 9999; vB = b.dias ?? 9999 }
      if (typeof vA === 'string') return ordDir === 'asc' ? vA.localeCompare(vB as string) : (vB as string).localeCompare(vA)
      return ordDir === 'asc' ? (vA as number) - (vB as number) : (vB as number) - (vA as number)
    })
  }, [colabs, nrs, matriz, situacao, filtroAtivo, ordCol, ordDir])

  const cor = corSituacaoNR(situacao)
  const dados = linhas.map(r => ({ 'Matrícula': r.matricula, 'Nome': r.nome, 'Base': r.base || '', 'Gerência': r.gerencia || '', 'Coordenador': r.supervisor || '', 'Função': r.funcao || '', 'Treinamento': r.treinamento, 'Vencimento': formatarData(r.vencimento), 'Dias': r.dias ?? '' }))

  return (
    <div style={{ backgroundColor: COR_CARD, borderRadius: 16, border: `1px solid ${COR_BORDA}`, overflow: 'hidden' }}>
      <div style={{ padding: '16px 20px', borderBottom: `1px solid ${COR_BORDA}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div><p style={{ fontSize: 14, fontWeight: 700, color: COR_TEXTO_PRINCIPAL, margin: 0 }}>Detalhamento</p><p style={{ fontSize: 11, color: COR_TEXTO_SECUNDARIO, margin: '2px 0 0' }}>{linhas.length} registro{linhas.length !== 1 ? 's' : ''}</p></div>
        <BotaoExportar onClick={t => t === 'csv' ? exportCSV(dados) : exportXLSX(dados)} />
      </div>
      <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 400 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ backgroundColor: '#fafafa' }}>
              {[
                { label: 'Matrícula', col: 'matricula' }, { label: 'Nome', col: 'nome' },
                { label: 'Base', col: 'base' }, { label: 'Gerência', col: 'gerencia' },
                { label: 'Coordenador', col: 'supervisor' }, { label: 'Função', col: 'funcao' },
                { label: 'Treinamento', col: 'treinamento' }, { label: 'Vencimento', col: 'vencimento' },
                { label: 'Dias', col: 'dias' },
              ].map(({ label, col }) => {
                const ativo = ordCol === col
                return (
                  <th key={col} onClick={() => toggleOrd(col)} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: ativo ? COR_PRIMARIA : COR_TEXTO_SECUNDARIO, whiteSpace: 'nowrap', position: 'sticky', top: 0, backgroundColor: '#fafafa', borderBottom: ativo ? `2px solid ${COR_PRIMARIA}` : `1px solid ${COR_BORDA}`, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.3px', cursor: 'pointer', userSelect: 'none' }}>
                    {label} {ativo ? (ordDir === 'asc' ? '↑' : '↓') : <span style={{ color: '#ccc' }}>↕</span>}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {linhas.length === 0 ? <tr><td colSpan={9} style={{ padding: '32px', textAlign: 'center', color: '#ccc', fontSize: 13 }}>Nenhum registro nesta condição.</td></tr>
              : linhas.map((r, i) => {
                const bgRow = i % 2 === 0 ? 'white' : '#fafafa'
                const diasCor = r.dias === null ? '#aaa' : r.dias < 0 ? CORES_STATUS.vermelho : r.dias <= 30 ? CORES_STATUS.amarelo : CORES_STATUS.laranja
                return (
                  <tr key={`${r.matricula}-${r.treinamento}`} style={{ backgroundColor: bgRow }}>
                    <td style={{ padding: '8px 12px', color: '#666', whiteSpace: 'nowrap', borderBottom: `1px solid ${COR_BORDA}` }}>{r.matricula}</td>
                    <td style={{ padding: '8px 12px', fontWeight: 500, color: COR_TEXTO_PRINCIPAL, whiteSpace: 'nowrap', borderBottom: `1px solid ${COR_BORDA}` }}>{r.nome}</td>
                    <td style={{ padding: '8px 12px', color: '#666', whiteSpace: 'nowrap', borderBottom: `1px solid ${COR_BORDA}` }}>{r.base || '—'}</td>
                    <td style={{ padding: '8px 12px', color: '#666', whiteSpace: 'nowrap', borderBottom: `1px solid ${COR_BORDA}` }}>{r.gerencia || '—'}</td>
                    <td style={{ padding: '8px 12px', color: '#666', whiteSpace: 'nowrap', borderBottom: `1px solid ${COR_BORDA}` }}>{r.supervisor || '—'}</td>
                    <td style={{ padding: '8px 12px', color: '#666', whiteSpace: 'nowrap', borderBottom: `1px solid ${COR_BORDA}` }}>{r.funcao || '—'}</td>
                    <td style={{ padding: '8px 12px', borderBottom: `1px solid ${COR_BORDA}`, whiteSpace: 'nowrap' }}><span style={{ fontSize: 11, fontWeight: 600, color: cor, backgroundColor: cor + '15', padding: '2px 7px', borderRadius: 5 }}>{r.treinamento}</span></td>
                    <td style={{ padding: '8px 12px', color: '#666', whiteSpace: 'nowrap', borderBottom: `1px solid ${COR_BORDA}` }}>{formatarData(r.vencimento)}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'center', borderBottom: `1px solid ${COR_BORDA}` }}><span style={{ fontWeight: 700, color: diasCor }}>{r.dias !== null ? Math.abs(r.dias) : '—'}</span></td>
                  </tr>
                )
              })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function TabelaPO({ colabs, pos, situacao, filtroAtivo }: { colabs: ColabPO[]; pos: { id: number; nome: string; validade_dias: number }[]; situacao: SituacaoNR; filtroAtivo: FiltroAtivo }) {
  const linhas = useMemo(() => {
    const rows: { matricula: string; nome: string; base: string | null; gerencia: string | null; supervisor: string | null; funcao: string | null; treinamento: string; vencimento: string | null; dias: number | null }[] = []
    const filtrados = filtroAtivo ? colabs.filter(c => { if (filtroAtivo.tipo === 'base') return c.base === filtroAtivo.valor; if (filtroAtivo.tipo === 'gerencia') return c.gerencia === filtroAtivo.valor; return c.supervisor === filtroAtivo.valor }) : colabs
    filtrados.forEach(c => {
      pos.forEach(po => {
        const campo = po.nome === 'Direção Defensiva' ? c.direcao : c.pilotagem
        if (campo !== 'SIM') return
        const reg = c.registros[po.id]
        let incluir = false
        if (situacao === 'programado') { if (reg) { const s = getStatusPO(reg.data_vencimento!); incluir = (s === 'proximo' || s === 'vencido') && reg.programacoes.some(d => d >= hoje) } }
        else if (situacao === 'proximo') { if (reg) incluir = getStatusPO(reg.data_vencimento!) === 'proximo' }
        else { incluir = !reg || getStatusPO(reg.data_vencimento!) === 'vencido' }
        if (!incluir) return
        rows.push({ matricula: c.matricula, nome: c.nome, base: c.base, gerencia: c.gerencia, supervisor: c.supervisor ? c.supervisor.split(' ')[0] : null, funcao: c.funcao, treinamento: po.nome, vencimento: reg?.data_vencimento || null, dias: reg ? getDias(reg.data_vencimento) : null })
      })
    })
    return rows.sort((a, b) => (a.dias ?? -9999) - (b.dias ?? -9999))
  }, [colabs, pos, situacao, filtroAtivo])

  const cor = corSituacaoNR(situacao)
  const dados = linhas.map(r => ({ 'Matrícula': r.matricula, 'Nome': r.nome, 'Base': r.base || '', 'Gerência': r.gerencia || '', 'Coordenador': r.supervisor || '', 'Função': r.funcao || '', 'Treinamento': r.treinamento, 'Vencimento': formatarData(r.vencimento), 'Dias': r.dias ?? '' }))
  return (
    <div style={{ backgroundColor: COR_CARD, borderRadius: 16, border: `1px solid ${COR_BORDA}`, overflow: 'hidden' }}>
      <div style={{ padding: '16px 20px', borderBottom: `1px solid ${COR_BORDA}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div><p style={{ fontSize: 14, fontWeight: 700, color: COR_TEXTO_PRINCIPAL, margin: 0 }}>Detalhamento</p><p style={{ fontSize: 11, color: COR_TEXTO_SECUNDARIO, margin: '2px 0 0' }}>{linhas.length} registro{linhas.length !== 1 ? 's' : ''}</p></div>
        <BotaoExportar onClick={t => t === 'csv' ? exportCSV(dados) : exportXLSX(dados)} />
      </div>
      <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 400 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead><tr style={{ backgroundColor: '#fafafa' }}>{['Matrícula', 'Nome', 'Base', 'Gerência', 'Coordenador', 'Função', 'Treinamento', 'Vencimento', 'Dias'].map(h => <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: COR_TEXTO_SECUNDARIO, whiteSpace: 'nowrap', position: 'sticky', top: 0, backgroundColor: '#fafafa', borderBottom: `1px solid ${COR_BORDA}`, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.3px' }}>{h}</th>)}</tr></thead>
          <tbody>
            {linhas.length === 0 ? <tr><td colSpan={9} style={{ padding: '32px', textAlign: 'center', color: '#ccc', fontSize: 13 }}>Nenhum registro nesta condição.</td></tr>
              : linhas.map((r, i) => {
                const bgRow = i % 2 === 0 ? 'white' : '#fafafa'
                const diasCor = r.dias === null ? '#aaa' : r.dias < 0 ? CORES_STATUS.vermelho : CORES_STATUS.laranja
                return (
                  <tr key={`${r.matricula}-${r.treinamento}`} style={{ backgroundColor: bgRow }}>
                    <td style={{ padding: '8px 12px', color: '#666', whiteSpace: 'nowrap', borderBottom: `1px solid ${COR_BORDA}` }}>{r.matricula}</td>
                    <td style={{ padding: '8px 12px', fontWeight: 500, color: COR_TEXTO_PRINCIPAL, whiteSpace: 'nowrap', borderBottom: `1px solid ${COR_BORDA}` }}>{r.nome}</td>
                    <td style={{ padding: '8px 12px', color: '#666', whiteSpace: 'nowrap', borderBottom: `1px solid ${COR_BORDA}` }}>{r.base || '—'}</td>
                    <td style={{ padding: '8px 12px', color: '#666', whiteSpace: 'nowrap', borderBottom: `1px solid ${COR_BORDA}` }}>{r.gerencia || '—'}</td>
                    <td style={{ padding: '8px 12px', color: '#666', whiteSpace: 'nowrap', borderBottom: `1px solid ${COR_BORDA}` }}>{r.supervisor || '—'}</td>
                    <td style={{ padding: '8px 12px', color: '#666', whiteSpace: 'nowrap', borderBottom: `1px solid ${COR_BORDA}` }}>{r.funcao || '—'}</td>
                    <td style={{ padding: '8px 12px', borderBottom: `1px solid ${COR_BORDA}`, whiteSpace: 'nowrap' }}><span style={{ fontSize: 11, fontWeight: 600, color: cor, backgroundColor: cor + '15', padding: '2px 7px', borderRadius: 5 }}>{r.treinamento}</span></td>
                    <td style={{ padding: '8px 12px', color: '#666', whiteSpace: 'nowrap', borderBottom: `1px solid ${COR_BORDA}` }}>{formatarData(r.vencimento)}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'center', borderBottom: `1px solid ${COR_BORDA}` }}><span style={{ fontWeight: 700, color: diasCor }}>{r.dias !== null ? Math.abs(r.dias) : '—'}</span></td>
                  </tr>
                )
              })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function TabelaMed({ colabs, situacao, filtroAtivo }: { colabs: ColabMed[]; situacao: SituacaoMed; filtroAtivo: FiltroAtivo }) {
  const linhas = useMemo(() => {
    const filtrados = filtroAtivo ? colabs.filter(c => { if (filtroAtivo.tipo === 'base') return c.base === filtroAtivo.valor; if (filtroAtivo.tipo === 'gerencia') return c.gerencia === filtroAtivo.valor; return c.supervisor === filtroAtivo.valor }) : colabs
    return filtrados.filter(c => {
      if (situacao === 'programado') {
        const st = getStatusMed(c.asoVencimento)
        return (st === 'critico' || st === 'atencao' || st === 'vencido') && c.asoProgramacoes.some(d => d >= hoje)
      }
      return getStatusMed(c.asoVencimento) === situacao
    }).map(c => ({ ...c, dias: getDias(c.asoVencimento) })).sort((a, b) => (a.dias ?? -9999) - (b.dias ?? -9999))
  }, [colabs, situacao, filtroAtivo])

  const cor = corSituacaoMed(situacao)
  const dados = linhas.map(r => ({ 'Matrícula': r.matricula, 'Nome': r.nome, 'Base': r.base || '', 'Gerência': r.gerencia || '', 'Coordenador': r.supervisor || '', 'Função': r.funcao || '', 'ASO': r.asoTipo || '', 'Vencimento': formatarData(r.asoVencimento), 'Dias': r.dias ?? '' }))
  return (
    <div style={{ backgroundColor: COR_CARD, borderRadius: 16, border: `1px solid ${COR_BORDA}`, overflow: 'hidden' }}>
      <div style={{ padding: '16px 20px', borderBottom: `1px solid ${COR_BORDA}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div><p style={{ fontSize: 14, fontWeight: 700, color: COR_TEXTO_PRINCIPAL, margin: 0 }}>Detalhamento</p><p style={{ fontSize: 11, color: COR_TEXTO_SECUNDARIO, margin: '2px 0 0' }}>{linhas.length} registro{linhas.length !== 1 ? 's' : ''}</p></div>
        <BotaoExportar onClick={t => t === 'csv' ? exportCSV(dados) : exportXLSX(dados)} />
      </div>
      <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 400 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead><tr style={{ backgroundColor: '#fafafa' }}>{['Matrícula', 'Nome', 'Base', 'Gerência', 'Coordenador', 'Função', 'ASO', 'Vencimento', 'Dias'].map(h => <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: COR_TEXTO_SECUNDARIO, whiteSpace: 'nowrap', position: 'sticky', top: 0, backgroundColor: '#fafafa', borderBottom: `1px solid ${COR_BORDA}`, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.3px' }}>{h}</th>)}</tr></thead>
          <tbody>
            {linhas.length === 0 ? <tr><td colSpan={9} style={{ padding: '32px', textAlign: 'center', color: '#ccc', fontSize: 13 }}>Nenhum registro nesta condição.</td></tr>
              : linhas.map((r, i) => {
                const bgRow = i % 2 === 0 ? 'white' : '#fafafa'
                const diasCor = r.dias === null ? '#aaa' : r.dias < 0 ? CORES_STATUS.vermelho : r.dias <= 30 ? CORES_STATUS.amarelo : CORES_STATUS.laranja
                return (
                  <tr key={r.matricula} style={{ backgroundColor: bgRow }}>
                    <td style={{ padding: '8px 12px', color: '#666', whiteSpace: 'nowrap', borderBottom: `1px solid ${COR_BORDA}` }}>{r.matricula}</td>
                    <td style={{ padding: '8px 12px', fontWeight: 500, color: COR_TEXTO_PRINCIPAL, whiteSpace: 'nowrap', borderBottom: `1px solid ${COR_BORDA}` }}>{r.nome}</td>
                    <td style={{ padding: '8px 12px', color: '#666', whiteSpace: 'nowrap', borderBottom: `1px solid ${COR_BORDA}` }}>{r.base || '—'}</td>
                    <td style={{ padding: '8px 12px', color: '#666', whiteSpace: 'nowrap', borderBottom: `1px solid ${COR_BORDA}` }}>{r.gerencia || '—'}</td>
                    <td style={{ padding: '8px 12px', color: '#666', whiteSpace: 'nowrap', borderBottom: `1px solid ${COR_BORDA}` }}>{r.supervisor || '—'}</td>
                    <td style={{ padding: '8px 12px', color: '#666', whiteSpace: 'nowrap', borderBottom: `1px solid ${COR_BORDA}` }}>{r.funcao || '—'}</td>
                    <td style={{ padding: '8px 12px', borderBottom: `1px solid ${COR_BORDA}` }}><span style={{ fontSize: 11, fontWeight: 700, color: cor, backgroundColor: cor + '15', padding: '2px 7px', borderRadius: 5 }}>{r.asoTipo?.toUpperCase().slice(0, 3) || '—'}</span></td>
                    <td style={{ padding: '8px 12px', color: '#666', whiteSpace: 'nowrap', borderBottom: `1px solid ${COR_BORDA}` }}>{formatarData(r.asoVencimento)}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'center', borderBottom: `1px solid ${COR_BORDA}` }}><span style={{ fontWeight: 700, color: diasCor }}>{r.dias !== null ? Math.abs(r.dias) : '—'}</span></td>
                  </tr>
                )
              })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function TabelaCNH({ colabs, situacao, filtroAtivo }: { colabs: ColabCNH[]; situacao: 'proximo' | 'vencido' | 'sem_cnh'; filtroAtivo: FiltroAtivo }) {
  const linhas = useMemo(() => {
    const filtrados = filtroAtivo ? colabs.filter(c => { if (filtroAtivo.tipo === 'base') return c.base === filtroAtivo.valor; if (filtroAtivo.tipo === 'gerencia') return c.gerencia === filtroAtivo.valor; return c.supervisor === filtroAtivo.valor }) : colabs
    return filtrados.filter(c => getStatusCNHDashboard(c.numero_cnh, c.data_vencimento, c.exigencia) === situacao).map(c => ({ ...c, dias: getDias(c.data_vencimento) })).sort((a, b) => (a.dias ?? -9999) - (b.dias ?? -9999))
  }, [colabs, situacao, filtroAtivo])

  const dados = linhas.map(r => ({ 'Matrícula': r.matricula, 'Nome': r.nome, 'Base': r.base || '', 'Gerência': r.gerencia || '', 'Coordenador': r.supervisor || '', 'Função': r.funcao || '', 'Categoria': r.categoria || '', 'Vencimento': formatarData(r.data_vencimento), 'Dias': r.dias ?? '' }))
  return (
    <div style={{ backgroundColor: COR_CARD, borderRadius: 16, border: `1px solid ${COR_BORDA}`, overflow: 'hidden' }}>
      <div style={{ padding: '16px 20px', borderBottom: `1px solid ${COR_BORDA}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div><p style={{ fontSize: 14, fontWeight: 700, color: COR_TEXTO_PRINCIPAL, margin: 0 }}>Detalhamento</p><p style={{ fontSize: 11, color: COR_TEXTO_SECUNDARIO, margin: '2px 0 0' }}>{linhas.length} registro{linhas.length !== 1 ? 's' : ''}</p></div>
        <BotaoExportar onClick={t => t === 'csv' ? exportCSV(dados) : exportXLSX(dados)} />
      </div>
      <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 400 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead><tr style={{ backgroundColor: '#fafafa' }}>{['Matrícula', 'Nome', 'Base', 'Gerência', 'Coordenador', 'Função', 'Categoria', 'Vencimento', 'Dias'].map(h => <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: COR_TEXTO_SECUNDARIO, whiteSpace: 'nowrap', position: 'sticky', top: 0, backgroundColor: '#fafafa', borderBottom: `1px solid ${COR_BORDA}`, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.3px' }}>{h}</th>)}</tr></thead>
          <tbody>
            {linhas.length === 0 ? <tr><td colSpan={9} style={{ padding: '32px', textAlign: 'center', color: '#ccc', fontSize: 13 }}>Nenhum registro nesta condição.</td></tr>
              : linhas.map((r, i) => {
                const bgRow = i % 2 === 0 ? 'white' : '#fafafa'
                const diasCor = r.dias === null ? '#aaa' : r.dias < 0 ? CORES_STATUS.vermelho : CORES_STATUS.laranja
                return (
                  <tr key={r.matricula} style={{ backgroundColor: bgRow }}>
                    <td style={{ padding: '8px 12px', color: '#666', whiteSpace: 'nowrap', borderBottom: `1px solid ${COR_BORDA}` }}>{r.matricula}</td>
                    <td style={{ padding: '8px 12px', fontWeight: 500, color: COR_TEXTO_PRINCIPAL, whiteSpace: 'nowrap', borderBottom: `1px solid ${COR_BORDA}` }}>{r.nome}</td>
                    <td style={{ padding: '8px 12px', color: '#666', whiteSpace: 'nowrap', borderBottom: `1px solid ${COR_BORDA}` }}>{r.base || '—'}</td>
                    <td style={{ padding: '8px 12px', color: '#666', whiteSpace: 'nowrap', borderBottom: `1px solid ${COR_BORDA}` }}>{r.gerencia || '—'}</td>
                    <td style={{ padding: '8px 12px', color: '#666', whiteSpace: 'nowrap', borderBottom: `1px solid ${COR_BORDA}` }}>{r.supervisor || '—'}</td>
                    <td style={{ padding: '8px 12px', color: '#666', whiteSpace: 'nowrap', borderBottom: `1px solid ${COR_BORDA}` }}>{r.funcao || '—'}</td>
                    <td style={{ padding: '8px 12px', borderBottom: `1px solid ${COR_BORDA}` }}><span style={{ fontSize: 11, fontWeight: 700, color: COR_PRIMARIA, backgroundColor: '#fdf2f5', padding: '2px 7px', borderRadius: 5 }}>{r.categoria || '—'}</span></td>
                    <td style={{ padding: '8px 12px', color: '#666', whiteSpace: 'nowrap', borderBottom: `1px solid ${COR_BORDA}` }}>{formatarData(r.data_vencimento)}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'center', borderBottom: `1px solid ${COR_BORDA}` }}><span style={{ fontWeight: 700, color: diasCor }}>{r.dias !== null ? Math.abs(r.dias) : '—'}</span></td>
                  </tr>
                )
              })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── SEÇÕES DE GRÁFICOS ───────────────────────────────────────────────────────
function SecaoGraficosNR({ colabs, nrs, matriz, situacao, filtroAtivo, onFiltro }: { colabs: ColabNR[]; nrs: { id: number; nome: string; validade_dias: number | null }[]; matriz: MatrizNR[]; situacao: SituacaoNR; filtroAtivo: FiltroAtivo; onFiltro: (f: FiltroAtivo) => void }) {
  const cor = corSituacaoNR(situacao)
  const dadosBase = useMemo(() => contarNRPorGrupo(colabs, nrs, matriz, 'base', situacao), [colabs, nrs, matriz, situacao])
  const dadosGer  = useMemo(() => contarNRPorGrupo(colabs, nrs, matriz, 'gerencia', situacao), [colabs, nrs, matriz, situacao])
  const dadosSup  = useMemo(() => contarNRPorGrupo(colabs, nrs, matriz, 'supervisor', situacao), [colabs, nrs, matriz, situacao])
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <GraficoHorizontal dados={dadosBase} cor={cor} titulo="Por Base"     vazio="Sem dados por base"    tipoAgrup="base"      filtroAtivo={filtroAtivo} onFiltro={onFiltro} />
        <GraficoHorizontal dados={dadosGer}  cor={cor} titulo="Por Gerência" vazio="Sem dados de gerência" tipoAgrup="gerencia" filtroAtivo={filtroAtivo} onFiltro={onFiltro} />
      </div>
      <GraficoVertical dados={dadosSup} cor={cor} titulo="Por Coordenador" vazio="Sem dados de supervisor" tipoAgrup="supervisor" filtroAtivo={filtroAtivo} onFiltro={onFiltro} />
    </div>
  )
}
function SecaoGraficosPO({ colabs, pos, situacao, filtroAtivo, onFiltro }: { colabs: ColabPO[]; pos: { id: number; nome: string; validade_dias: number }[]; situacao: SituacaoNR; filtroAtivo: FiltroAtivo; onFiltro: (f: FiltroAtivo) => void }) {
  const cor = corSituacaoNR(situacao)
  const dadosBase = useMemo(() => contarPOPorGrupo(colabs, pos, 'base', situacao), [colabs, pos, situacao])
  const dadosGer  = useMemo(() => contarPOPorGrupo(colabs, pos, 'gerencia', situacao), [colabs, pos, situacao])
  const dadosSup  = useMemo(() => contarPOPorGrupo(colabs, pos, 'supervisor', situacao), [colabs, pos, situacao])
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <GraficoHorizontal dados={dadosBase} cor={cor} titulo="Por Base"     vazio="Sem dados por base"    tipoAgrup="base"      filtroAtivo={filtroAtivo} onFiltro={onFiltro} />
        <GraficoHorizontal dados={dadosGer}  cor={cor} titulo="Por Gerência" vazio="Sem dados de gerência" tipoAgrup="gerencia" filtroAtivo={filtroAtivo} onFiltro={onFiltro} />
      </div>
      <GraficoVertical dados={dadosSup} cor={cor} titulo="Por Coordenador" vazio="Sem dados de supervisor" tipoAgrup="supervisor" filtroAtivo={filtroAtivo} onFiltro={onFiltro} />
    </div>
  )
}
function SecaoGraficosMed({ colabs, situacao, filtroAtivo, onFiltro }: { colabs: ColabMed[]; situacao: SituacaoMed; filtroAtivo: FiltroAtivo; onFiltro: (f: FiltroAtivo) => void }) {
  const cor = corSituacaoMed(situacao)
  const dadosBase = useMemo(() => contarMedPorGrupo(colabs, 'base', situacao), [colabs, situacao])
  const dadosGer  = useMemo(() => contarMedPorGrupo(colabs, 'gerencia', situacao), [colabs, situacao])
  const dadosSup  = useMemo(() => contarMedPorGrupo(colabs, 'supervisor', situacao), [colabs, situacao])
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <GraficoHorizontal dados={dadosBase} cor={cor} titulo="Por Base"     vazio="Sem dados por base"    tipoAgrup="base"      filtroAtivo={filtroAtivo} onFiltro={onFiltro} />
        <GraficoHorizontal dados={dadosGer}  cor={cor} titulo="Por Gerência" vazio="Sem dados de gerência" tipoAgrup="gerencia" filtroAtivo={filtroAtivo} onFiltro={onFiltro} />
      </div>
      <GraficoVertical dados={dadosSup} cor={cor} titulo="Por Coordenador" vazio="Sem dados de supervisor" tipoAgrup="supervisor" filtroAtivo={filtroAtivo} onFiltro={onFiltro} />
    </div>
  )
}
function SecaoGraficosCNH({ colabs, situacao, filtroAtivo, onFiltro }: { colabs: ColabCNH[]; situacao: 'proximo' | 'vencido' | 'sem_cnh'; filtroAtivo: FiltroAtivo; onFiltro: (f: FiltroAtivo) => void }) {
  const cor = corSituacaoCNH(situacao)
  const dadosBase = useMemo(() => contarCNHPorGrupo(colabs, 'base', situacao), [colabs, situacao])
  const dadosGer  = useMemo(() => contarCNHPorGrupo(colabs, 'gerencia', situacao), [colabs, situacao])
  const dadosSup  = useMemo(() => contarCNHPorGrupo(colabs, 'supervisor', situacao), [colabs, situacao])
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <GraficoHorizontal dados={dadosBase} cor={cor} titulo="Por Base"     vazio="Sem dados por base"    tipoAgrup="base"      filtroAtivo={filtroAtivo} onFiltro={onFiltro} />
        <GraficoHorizontal dados={dadosGer}  cor={cor} titulo="Por Gerência" vazio="Sem dados de gerência" tipoAgrup="gerencia" filtroAtivo={filtroAtivo} onFiltro={onFiltro} />
      </div>
      <GraficoVertical dados={dadosSup} cor={cor} titulo="Por Coordenador" vazio="Sem dados de supervisor" tipoAgrup="supervisor" filtroAtivo={filtroAtivo} onFiltro={onFiltro} />
    </div>
  )
}

// ─── PÁGINA PRINCIPAL ─────────────────────────────────────────────────────────
export default function DashboardPage() {
  const router = useRouter()
  const [abaModulo, setAbaModulo] = useState<AbaModulo>('geral')
  const [situacaoNR,  setSituacaoNR]  = useState<SituacaoNR>('critico')
  const [situacaoPO,  setSituacaoPO]  = useState<SituacaoNR>('proximo')
  const [situacaoMed, setSituacaoMed] = useState<SituacaoMed>('atencao')
  const [situacaoCNH, setSituacaoCNH] = useState<'proximo' | 'vencido' | 'sem_cnh'>('proximo')
  const [filtroNR,  setFiltroNR]  = useState<FiltroAtivo>(null)
  const [filtroPO,  setFiltroPO]  = useState<FiltroAtivo>(null)
  const [filtroMed, setFiltroMed] = useState<FiltroAtivo>(null)
  const [filtroCNH, setFiltroCNH] = useState<FiltroAtivo>(null)
  const [filtroNRTipos, setFiltroNRTipos] = useState<string[]>(NRS_ALVO)
  const [filtroPOTipos, setFiltroPOTipos] = useState<string[]>(POS_ALVO)
  const [filtroCNHExigencia, setFiltroCNHExigencia] = useState('SIM')
  const [loading, setLoading] = useState(true)

  const [filtroBase, setFiltroBase] = useState('')
  const [filtroGer,  setFiltroGer]  = useState('')
  const [filtroSup,  setFiltroSup]  = useState('')
  const [filtroSits, setFiltroSits] = useState<string[]>([])
  const [situacoesDisp, setSituacoesDisp] = useState<string[]>([])

  const [colabsNR,  setColabsNR]  = useState<ColabNR[]>([])
  const [colabsPO,  setColabsPO]  = useState<ColabPO[]>([])
  const [colabsMed, setColabsMed] = useState<ColabMed[]>([])
  const [colabsCNH, setColabsCNH] = useState<ColabCNH[]>([])
  const [nrsData,   setNrsData]   = useState<{ id: number; nome: string; validade_dias: number | null }[]>([])
  const [posData,   setPosData]   = useState<{ id: number; nome: string; validade_dias: number }[]>([])
  const [matrizNR,  setMatrizNR]  = useState<MatrizNR[]>([])

  const basesDisp = useMemo(() => [...new Set([...colabsNR.map(c => c.base), ...colabsPO.map(c => c.base), ...colabsMed.map(c => c.base), ...colabsCNH.map(c => c.base)].filter(Boolean) as string[])].sort(), [colabsNR, colabsPO, colabsMed, colabsCNH])
  const gerenciasDisp = useMemo(() => [...new Set([...colabsNR.map(c => c.gerencia), ...colabsPO.map(c => c.gerencia), ...colabsMed.map(c => c.gerencia), ...colabsCNH.map(c => c.gerencia)].filter(Boolean) as string[])].sort(), [colabsNR, colabsPO, colabsMed, colabsCNH])
  const supervisoresDisp = useMemo(() => [...new Set([...colabsNR.map(c => c.supervisor), ...colabsPO.map(c => c.supervisor), ...colabsMed.map(c => c.supervisor), ...colabsCNH.map(c => c.supervisor)].filter(Boolean) as string[])].sort(), [colabsNR, colabsPO, colabsMed, colabsCNH])

  const aplicarFiltrosGlobais = (colabs: any[]) => colabs.filter((c: any) => {
    if (filtroBase && c.base !== filtroBase) return false
    if (filtroGer  && c.gerencia !== filtroGer) return false
    if (filtroSup  && c.supervisor !== filtroSup) return false
    if (filtroSits.length > 0 && !filtroSits.includes(c.situacao)) return false
    if (abaModulo === 'cnh' && filtroCNHExigencia && c.exigencia !== filtroCNHExigencia) return false
    return true
  })
  const aplicarFiltroGrafico = (colabs: any[], filtro: FiltroAtivo) => {
    if (!filtro) return colabs
    return colabs.filter((c: any) => { if (filtro.tipo === 'base') return c.base === filtro.valor; if (filtro.tipo === 'gerencia') return c.gerencia === filtro.valor; return c.supervisor === filtro.valor })
  }

  const colabsNRBase    = useMemo(() => aplicarFiltrosGlobais(colabsNR) as ColabNR[], [colabsNR, filtroBase, filtroGer, filtroSup, filtroSits])
  const colabsPOBase    = useMemo(() => aplicarFiltrosGlobais(colabsPO) as ColabPO[], [colabsPO, filtroBase, filtroGer, filtroSup, filtroSits])
  const colabsMedBase   = useMemo(() => aplicarFiltrosGlobais(colabsMed) as ColabMed[], [colabsMed, filtroBase, filtroGer, filtroSup, filtroSits])
  const colabsCNHBase   = useMemo(() => aplicarFiltrosGlobais(colabsCNH) as ColabCNH[], [colabsCNH, filtroBase, filtroGer, filtroSup, filtroSits, filtroCNHExigencia, abaModulo])

  const colabsNRFiltrados  = useMemo(() => aplicarFiltroGrafico(colabsNRBase, filtroNR) as ColabNR[], [colabsNRBase, filtroNR])
  const colabsPOFiltrados  = useMemo(() => aplicarFiltroGrafico(colabsPOBase, filtroPO) as ColabPO[], [colabsPOBase, filtroPO])
  const colabsMedFiltrados = useMemo(() => aplicarFiltroGrafico(colabsMedBase, filtroMed) as ColabMed[], [colabsMedBase, filtroMed])
  const colabsCNHFiltrados = useMemo(() => aplicarFiltroGrafico(colabsCNHBase, filtroCNH) as ColabCNH[], [colabsCNHBase, filtroCNH])

  const nrsDataFiltrado = useMemo(() => nrsData.filter(n => filtroNRTipos.includes(n.nome)), [nrsData, filtroNRTipos])
  const posDataFiltrado = useMemo(() => posData.filter(p => filtroPOTipos.includes(p.nome)), [posData, filtroPOTipos])
  const statsNR  = useMemo(() => calcStatsNR(colabsNRFiltrados, nrsDataFiltrado, matrizNR), [colabsNRFiltrados, nrsDataFiltrado, matrizNR])
  const statsPO  = useMemo(() => calcStatsPO(colabsPOFiltrados, posDataFiltrado), [colabsPOFiltrados, posDataFiltrado])
  const statsMed = useMemo(() => calcStatsMed(colabsMedFiltrados), [colabsMedFiltrados])
  const statsCNH = useMemo(() => calcStatsCNH(colabsCNHFiltrados), [colabsCNHFiltrados])

  const statsGeralFiltrado = useMemo(() => ({
    sNR: calcStatsNR(colabsNRBase, nrsData, matrizNR),
    sPO: calcStatsPO(colabsPOBase, posData),
    sM: calcStatsMed(colabsMedBase),
    sCNH: calcStatsCNH(colabsCNHBase),
  }), [colabsNRBase, colabsPOBase, colabsMedBase, colabsCNHBase, nrsData, posData, matrizNR])

  useEffect(() => {
    async function carregar() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: regras } = await supabase.from('regras_vencimento').select('id, nome_item, validade_dias')
      const nrs = (regras || []).filter(r => NRS_ALVO.includes(r.nome_item)).map(r => ({ id: r.id, nome: r.nome_item, validade_dias: r.validade_dias }))
      const pos = (regras || []).filter(r => POS_ALVO.includes(r.nome_item)).map(r => ({ id: r.id, nome: r.nome_item, validade_dias: r.validade_dias || 730 }))
      setNrsData(nrs); setPosData(pos)

      const { data: matrizData } = await supabase.from('matriz_treinamentos').select('funcao, processo, treinamento, obrigatorio').eq('pagina', 'BASE NR')
      const mNR: MatrizNR[] = matrizData || []
      setMatrizNR(mNR)

      let todosColabs: any[] = []; let from = 0
      while (true) {
        const { data: cd } = await supabase.from('colaboradores').select('matricula, nome, situacao, processo, gerencia, bases(nome), funcoes(nome), supervisor').order('nome').range(from, from + 499)
        if (!cd || cd.length === 0) break
        todosColabs = [...todosColabs, ...cd]; if (cd.length < 500) break; from += 500
      }

      const sitsUnicas = [...new Set(todosColabs.map((c: any) => c.situacao).filter(Boolean))].sort() as string[]
      setSituacoesDisp(sitsUnicas)
      setFiltroSits(sitsUnicas.filter(s => !SITUACOES_EXCLUIDAS_PADRAO.includes(s)))

      const colabsAtivos = todosColabs.filter((c: any) => !SITUACOES_EXCLUIDAS_PADRAO.includes(c.situacao))
      const colabInfo: Record<string, any> = {}
      todosColabs.forEach((c: any) => {
        colabInfo[c.matricula] = { nome: c.nome, funcao: c.funcoes?.nome || null, processo: c.processo || null, base: c.bases?.nome || null, gerencia: c.gerencia || null, supervisor: c.supervisor ? c.supervisor.trim().split(' ')[0] : null, situacao: c.situacao }
      })
      const mats = colabsAtivos.map((c: any) => c.matricula)

      // NR
      const matsNR = mats.filter((mat: string) => {
        const c = colabInfo[mat]; if (!c?.funcao) return false
        return mNR.some(m => { const mF = m.funcao.trim().toUpperCase(); const fC = c.funcao.trim().toUpperCase(); if (m.processo && m.processo.trim() !== '') return mF === fC && m.processo.trim().toUpperCase() === (c.processo || '').trim().toUpperCase(); return mF === fC })
      })
      const regsNRMap: Record<string, Record<number, any>> = {}
      if (matsNR.length > 0) await buscarRegistrosEmLotes(matsNR, nrs.map(n => n.id), regsNRMap)
      setColabsNR(matsNR.map((mat: string) => ({ matricula: mat, ...colabInfo[mat], registros: regsNRMap[mat] || {} })))

      // PO
      const matrizPOMap: Record<string, any> = {}
      for (let i = 0; i < mats.length; i += LOTE) {
        const { data: mpd } = await supabase.from('matriz_po').select('matricula, direcao_defensiva, pilotagem_defensiva').in('matricula', mats.slice(i, i + LOTE))
        ;(mpd || []).forEach((m: any) => { matrizPOMap[m.matricula] = { direcao: (m.direcao_defensiva || 'N/A').trim().toUpperCase(), pilotagem: (m.pilotagem_defensiva || 'N/A').trim().toUpperCase() } })
      }
      const regsPOMap: Record<string, Record<number, any>> = {}
      if (mats.length > 0) await buscarRegistrosEmLotes(mats, pos.map(p => p.id), regsPOMap)
      setColabsPO(mats.map((mat: string) => { const mpo = matrizPOMap[mat] || { direcao: 'N/A', pilotagem: 'N/A' }; return { matricula: mat, ...colabInfo[mat], direcao: mpo.direcao, pilotagem: mpo.pilotagem, registros: regsPOMap[mat] || {} } }).filter((c: ColabPO) => c.direcao === 'SIM' || c.pilotagem === 'SIM'))

      // Medicina do Trabalho
      const asosPorColab: Record<string, any[]> = {}
      for (let i = 0; i < mats.length; i += LOTE) {
        const lote = mats.slice(i, i + LOTE); let fa = 0
        while (true) {
          const { data: ad } = await supabase.from('asos')
            .select('matricula_colaborador, tipo, data_vencimento, data_realizacao, programacoes_exames(data_programada)')
            .in('matricula_colaborador', lote).range(fa, fa + 499)
          if (!ad || ad.length === 0) break
          ad.forEach((a: any) => {
            if (!asosPorColab[a.matricula_colaborador]) asosPorColab[a.matricula_colaborador] = []
            asosPorColab[a.matricula_colaborador].push(a)
          })
          if (ad.length < 500) break; fa += 500
        }
      }
      setColabsMed(mats.map((mat: string) => {
        const asos = asosPorColab[mat] || []
        const candidatos: { aso: any; vencimento: string; peso: number }[] = []
        const per = asos.filter(a => a.tipo === 'periodico').sort((a, b) => new Date(b.data_realizacao).getTime() - new Date(a.data_realizacao).getTime())[0]
        const ret = asos.filter(a => a.tipo === 'retorno').sort((a, b) => new Date(b.data_realizacao).getTime() - new Date(a.data_realizacao).getTime())[0]
        const mro = asos.filter(a => a.tipo === 'mudanca_risco').sort((a, b) => new Date(b.data_realizacao).getTime() - new Date(a.data_realizacao).getTime())[0]
        const adm = asos.filter(a => a.tipo === 'admissional').sort((a, b) => new Date(b.data_realizacao).getTime() - new Date(a.data_realizacao).getTime())[0]

        if (per?.data_vencimento) candidatos.push({ aso: per, vencimento: per.data_vencimento, peso: 2 })
        if (ret) { const d = new Date(ret.data_realizacao + 'T12:00:00'); d.setFullYear(d.getFullYear() + 1); candidatos.push({ aso: ret, vencimento: d.toISOString().split('T')[0], peso: 2 }) }
        if (mro) { const d = new Date(mro.data_realizacao + 'T12:00:00'); d.setFullYear(d.getFullYear() + 1); candidatos.push({ aso: mro, vencimento: d.toISOString().split('T')[0], peso: 2 }) }
        if (adm && candidatos.length === 0) { const d = new Date(adm.data_realizacao + 'T12:00:00'); d.setFullYear(d.getFullYear() + 1); candidatos.push({ aso: adm, vencimento: d.toISOString().split('T')[0], peso: 1 }) }

        let asoVencimento = null, asoTipo = null, asoProgramacoes: string[] = []
        if (candidatos.length > 0) {
          const maxPeso = Math.max(...candidatos.map(c => c.peso))
          const tops = candidatos.filter(c => c.peso === maxPeso).sort((a, b) => new Date(b.vencimento).getTime() - new Date(a.vencimento).getTime())
          asoVencimento = tops[0].vencimento
          asoTipo = tops[0].aso.tipo
          asoProgramacoes = (tops[0].aso.programacoes_exames || []).map((p: any) => p.data_programada)
        }
        return { matricula: mat, ...colabInfo[mat], asoVencimento, asoTipo, asoProgramacoes }
      }))

      // CNH
      const cnhsData: Record<string, any> = {}
      let fc = 0
      while (true) {
        const { data: cd } = await supabase.from('cnhs').select('matricula_colaborador, numero_cnh, categoria, data_vencimento, exigencia').eq('is_atual', true).range(fc, fc + 499)
        if (!cd || cd.length === 0) break
        cd.forEach((c: any) => { cnhsData[c.matricula_colaborador] = c }); if (cd.length < 500) break; fc += 500
      }
      setColabsCNH(mats.map((mat: string) => {
        const regCnh = cnhsData[mat] || null
        return { 
          matricula: mat, ...colabInfo[mat], 
          categoria: regCnh?.categoria || null, 
          data_vencimento: regCnh?.data_vencimento || null, 
          numero_cnh: regCnh?.numero_cnh || null,
          exigencia: regCnh?.exigencia || 'N/A'
        }
      }))

      setLoading(false)
    }
    carregar()
  }, [])

  const ABAS: { key: AbaModulo; label: string }[] = [
    { key: 'geral', label: 'VISÃO GERAL' },
    { key: 'nr', label: 'BASE NR' },
    { key: 'po', label: 'BASE PO' },
    { key: 'medicina', label: 'MEDICINA DO TRABALHO' },
    { key: 'cnh', label: 'CNH' },
  ]

  const { sNR: sNRG, sPO: sPOG, sM: sMG, sCNH: sCNHG } = statsGeralFiltrado

  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif', display: 'flex', flexDirection: 'column', gap: 24, minHeight: '100vh', padding: '24px 32px' }}>
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: COR_TEXTO_PRINCIPAL, margin: 0, letterSpacing: '-0.5px' }}>Dashboard</h1>
        <p style={{ fontSize: 14, color: COR_TEXTO_SECUNDARIO, margin: '4px 0 0' }}>Acompanhe os principais indicadores e vencimentos do SegVenc.</p>
      </div>

      <div style={{ display: 'flex', gap: 24, borderBottom: `1px solid ${COR_BORDA}`, marginTop: 8 }}>
        {ABAS.map(a => (
          <button key={a.key} onClick={() => { setAbaModulo(a.key); setFiltroNR(null); setFiltroPO(null); setFiltroMed(null); setFiltroCNH(null) }}
            style={{ padding: '12px 4px', fontSize: 13, fontWeight: abaModulo === a.key ? 700 : 500, border: 'none', background: 'none', cursor: 'pointer', color: abaModulo === a.key ? COR_PRIMARIA : COR_TEXTO_SECUNDARIO, borderBottom: abaModulo === a.key ? `2px solid ${COR_PRIMARIA}` : '2px solid transparent', marginBottom: -1, transition: 'color 0.2s', letterSpacing: '0.3px' }}>{a.label}</button>
        ))}
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
          <p style={{ color: COR_TEXTO_SECUNDARIO, fontSize: 15, fontWeight: 500 }}>Carregando métricas...</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, paddingBottom: 40 }}>
          <FiltrosGlobais bases={basesDisp} gerencias={gerenciasDisp} supervisores={supervisoresDisp} situacoes={situacoesDisp} filtroBase={filtroBase} filtroGer={filtroGer} filtroSup={filtroSup} filtroSits={filtroSits} onBase={setFiltroBase} onGer={setFiltroGer} onSup={setFiltroSup} onSits={setFiltroSits} abaModulo={abaModulo} filtroNRTipos={filtroNRTipos} filtroPOTipos={filtroPOTipos} onNRTipos={setFiltroNRTipos} onPOTipos={setFiltroPOTipos} filtroCNHExigencia={filtroCNHExigencia} onCNHExigencia={setFiltroCNHExigencia} />

          {/* VISÃO GERAL */}
          {abaModulo === 'geral' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
              <div><SecaoHeader titulo="BASE NR" />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
                  <CardStat label="Válidos" valor={sNRG.validos} cor={CORES_STATUS.verde} icone="✓" />
                  <CardStat label="Prazo Crítico" valor={sNRG.criticos} cor={CORES_STATUS.laranja} icone="⚠" sub="≤ 60 dias" />
                  <CardStat label="Bernhoeft c/ Atenção" valor={sNRG.atencao} cor={CORES_STATUS.amarelo} icone="⚠" sub="≤ 30 dias" />
                  <CardStat label="Falta / Vencidos" valor={sNRG.vencidos} cor={CORES_STATUS.vermelho} icone="✕" />
                  <CardStat label="Programados" valor={sNRG.programados} cor={CORES_STATUS.roxo} icone="ℹ" />
                </div>
              </div>
              <div><SecaoHeader titulo="BASE PO" />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
                  <CardStat label="Válidos" valor={sPOG.validos} cor={CORES_STATUS.verde} icone="✓" />
                  <CardStat label="Próximos do Vencimento" valor={sPOG.proximos} cor={CORES_STATUS.laranja} icone="⚠" />
                  <CardStat label="Vencidos" valor={sPOG.vencidos} cor={CORES_STATUS.vermelho} icone="✕" />
                  <CardStat label="Programados" valor={sPOG.programados} cor={CORES_STATUS.roxo} icone="ℹ" />
                </div>
              </div>
              <div><SecaoHeader titulo="MEDICINA DO TRABALHO" />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
                  <CardStat label="No Prazo" valor={sMG.mNP} cor={CORES_STATUS.verde} icone="✓" />
                  <CardStat label="Prazo Crítico" valor={sMG.mC} cor={CORES_STATUS.laranja} icone="⚠" sub="≤ 60 dias" />
                  <CardStat label="Bernhoeft c/ Atenção" valor={sMG.mA} cor={CORES_STATUS.amarelo} icone="⚠" sub="≤ 30 dias" />
                  <CardStat label="Vencidos" valor={sMG.mV} cor={CORES_STATUS.vermelho} icone="✕" />
                  <CardStat label="Programados" valor={sMG.mProg} cor={CORES_STATUS.roxo} icone="ℹ" />
                </div>
              </div>
              <div><SecaoHeader titulo="CNH" />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
                  <CardStat label="No Prazo" valor={sCNHG.noPrazo} cor={CORES_STATUS.verde} icone="✓" />
                  <CardStat label="Próximo do Vencimento" valor={sCNHG.proximo} cor={CORES_STATUS.laranja} icone="⚠" sub="≤ 30 dias" />
                  <CardStat label="Vencidos" valor={sCNHG.vencido} cor={CORES_STATUS.vermelho} icone="✕" />
                  <CardStat label="Sem CNH" valor={sCNHG.semCnh} cor={COR_TEXTO_SECUNDARIO} icone="ℹ" />
                </div>
              </div>
            </div>
          )}

          {/* BASE NR */}
          {abaModulo === 'nr' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
                <CardStat label="Válidos" valor={statsNR.validos} cor={CORES_STATUS.verde} icone="✓" />
                <CardStat label="Prazo Crítico" valor={statsNR.criticos} cor={CORES_STATUS.laranja} icone="⚠" sub="≤ 60 dias" />
                <CardStat label="Bernhoeft c/ Atenção" valor={statsNR.atencao} cor={CORES_STATUS.amarelo} icone="⚠" sub="≤ 30 dias" />
                <CardStat label="Falta / Vencidos" valor={statsNR.vencidos} cor={CORES_STATUS.vermelho} icone="✕" />
                <CardStat label="Programados" valor={statsNR.programados} cor={CORES_STATUS.roxo} icone="ℹ" />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                <BadgeFiltro filtro={filtroNR} onLimpar={() => setFiltroNR(null)} />
                <ToggleSituacaoNRFull valor={situacaoNR} onChange={v => { setSituacaoNR(v); setFiltroNR(null) }} />
              </div>
              <SecaoGraficosNR colabs={colabsNRFiltrados} nrs={nrsDataFiltrado} matriz={matrizNR} situacao={situacaoNR} filtroAtivo={filtroNR} onFiltro={setFiltroNR} />
              <TabelaNR colabs={colabsNRBase} nrs={nrsDataFiltrado} matriz={matrizNR} situacao={situacaoNR} filtroAtivo={filtroNR} />
            </div>
          )}

          {/* BASE PO */}
          {abaModulo === 'po' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
                <CardStat label="Válidos" valor={statsPO.validos} cor={CORES_STATUS.verde} icone="✓" />
                <CardStat label="Próximos do Vencimento" valor={statsPO.proximos} cor={CORES_STATUS.laranja} icone="⚠" sub="≤ 30 dias" />
                <CardStat label="Vencidos" valor={statsPO.vencidos} cor={CORES_STATUS.vermelho} icone="✕" />
                <CardStat label="Programados" valor={statsPO.programados} cor={CORES_STATUS.roxo} icone="ℹ" />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                <BadgeFiltro filtro={filtroPO} onLimpar={() => setFiltroPO(null)} />
                <ToggleSituacaoNR valor={situacaoPO} onChange={v => { setSituacaoPO(v); setFiltroPO(null) }} />
              </div>
              <SecaoGraficosPO colabs={colabsPOFiltrados} pos={posDataFiltrado} situacao={situacaoPO} filtroAtivo={filtroPO} onFiltro={setFiltroPO} />
              <TabelaPO colabs={colabsPOBase} pos={posDataFiltrado} situacao={situacaoPO} filtroAtivo={filtroPO} />
            </div>
          )}

          {/* MEDICINA */}
          {abaModulo === 'medicina' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
                <CardStat label="No Prazo" valor={statsMed.mNP} cor={CORES_STATUS.verde} icone="✓" />
                <CardStat label="Prazo Crítico" valor={statsMed.mC} cor={CORES_STATUS.laranja} icone="⚠" sub="≤ 60 dias" />
                <CardStat label="Bernhoeft c/ Atenção" valor={statsMed.mA} cor={CORES_STATUS.amarelo} icone="⚠" sub="≤ 30 dias" />
                <CardStat label="Vencidos" valor={statsMed.mV} cor={CORES_STATUS.vermelho} icone="✕" />
                <CardStat label="Programados" valor={statsMed.mProg} cor={CORES_STATUS.roxo} icone="ℹ" />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                <BadgeFiltro filtro={filtroMed} onLimpar={() => setFiltroMed(null)} />
                <ToggleSituacaoMed valor={situacaoMed} onChange={v => { setSituacaoMed(v); setFiltroMed(null) }} />
              </div>
              <SecaoGraficosMed colabs={colabsMedFiltrados} situacao={situacaoMed} filtroAtivo={filtroMed} onFiltro={setFiltroMed} />
              <TabelaMed colabs={colabsMedBase} situacao={situacaoMed} filtroAtivo={filtroMed} />
            </div>
          )}

          {/* CNH — COMPLETAMENTE UNIFICADO */}
          {abaModulo === 'cnh' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
                <CardStat label="No Prazo" valor={statsCNH.noPrazo} cor={CORES_STATUS.verde} icone="✓" />
                <CardStat label="Próximo do Vencimento" valor={statsCNH.proximo} cor={CORES_STATUS.laranja} icone="⚠" sub="≤ 30 dias" />
                <CardStat label="Vencidos" valor={statsCNH.vencido} cor={CORES_STATUS.vermelho} icone="✕" />
                <CardStat label="Sem CNH" valor={statsCNH.semCnh} cor={COR_TEXTO_SECUNDARIO} icone="ℹ" />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                <BadgeFiltro filtro={filtroCNH} onLimpar={() => setFiltroCNH(null)} />
                <ToggleSituacaoCNH valor={situacaoCNH} onChange={v => { setSituacaoCNH(v); setFiltroCNH(null) }} />
              </div>
              <SecaoGraficosCNH colabs={colabsCNHFiltrados} situacao={situacaoCNH} filtroAtivo={filtroCNH} onFiltro={setFiltroCNH} />
              <TabelaCNH colabs={colabsCNHBase} situacao={situacaoCNH} filtroAtivo={filtroCNH} />
            </div>
          )}

        </div>
      )}
    </div>
  )
}