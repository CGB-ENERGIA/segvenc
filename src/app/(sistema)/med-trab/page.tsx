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
  { value: 'admissional',   label: 'Admissional',             sigla: 'ADM' },
  { value: 'periodico',     label: 'Periódico',               sigla: 'PER' },
  { value: 'retorno',       label: 'Retorno ao Trabalho',    sigla: 'RET' },
  { value: 'mudanca_risco', label: 'Mudança de Risco (MRO)', sigla: 'MRO' },
  { value: 'demissional',   label: 'Demissional',             sigla: 'DEM' },
]

const EXAMES_COMPL = [
  { key: 'exame_clinico', label: 'Exame Clínico',   nome: 'Avaliação clínica ocupacional' },
  { key: 'hemograma',     label: 'Hemograma',       nome: 'Hemograma Completo' },
  { key: 'glicemia',      label: 'Glicemia',        nome: 'Glicemia em Jejum' },
  { key: 'rx_dorso',      label: 'RX Dorso-Lombar', nome: 'Raio X Dorso-Lombar' },
  { key: 'audiometria',   label: 'Audiometria',     nome: 'Audiometria Tonal' },
  { key: 'espirometria',  label: 'Espirometria',    nome: 'Espirometria' },
  { key: 'ecg',           label: 'ECG',             nome: 'Eletrocardiograma – ECG' },
  { key: 'eeg',           label: 'EEG',             nome: 'Eletroencefalograma – EEG' },
  { key: 'rx_lombo',      label: 'RX Lombo-Sacra',  nome: 'Raio X de coluna lombo-sacra em ortostase' },
]

// ─── TIPOS ────────────────────────────────────────────────────────────────────
interface LogAuditoria { id: string; auditor_email: string; data_auditoria: string; validado: boolean; observacao: string | null }
interface ProgramacaoASO { id: string; data_programada: string; observacao: string | null; criado_por: string; created_at: string }
interface ASO { id: string; tipo: string; data_realizacao: string; data_vencimento: string | null; gse: number | null; observacao: string | null; url_arquivo: string | null; logs_auditoria: LogAuditoria[]; programacoes: ProgramacaoASO[] }
interface ExameCompl { id: string; tipo_exame_id: number; nome_exame: string; data_realizacao: string; url_arquivo: string | null }
interface Colaborador {
  matricula: string; nome: string; situacao: string; funcao_id: number | null; gse: number | null
  data_admissao: string | null; processo: string | null
  bases: { nome: string } | null; funcoes: { nome: string } | null; gerencias: { sigla: string } | null
  asos: ASO[]; exames_compl: ExameCompl[]
}
interface Base { id: number; nome: string }

type StatusASO = 'no_prazo' | 'critico' | 'atencao' | 'vencido' | 'sem_aso'
type CardFiltro = StatusASO | 'programado' | null
type OrdemColuna = 'matricula' | 'nome' | 'base' | 'situacao' | 'admissao' | 'funcao' | 'processo' | 'gse' | 'aso' | 'dias'
type OrdemDirecao = 'asc' | 'desc'
type AbaModal = 'info' | 'documento' | 'programacao' | 'auditoria' | 'historico'

// ─── HELPERS GERAIS ───────────────────────────────────────────────────────────
function formatarData(d: string | null | undefined): string { if (!d) return '—'; return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') }
function calcularDias(dv: string | null): number | null { if (!dv) return null; return Math.ceil((new Date(dv + 'T12:00:00').getTime() - new Date().getTime()) / 86400000) }
function getStatusASO(dv: string | null): StatusASO { const dias = calcularDias(dv); if (dias === null) return 'sem_aso'; if (dias < 0) return 'vencido'; if (dias <= 30) return 'atencao'; if (dias <= 60) return 'critico'; return 'no_prazo' }
function getASOPorTipo(asos: ASO[], tipo: string): ASO | null { const lista = (asos || []).filter(a => a.tipo === tipo); if (!lista.length) return null; return lista.sort((a, b) => new Date(b.data_realizacao).getTime() - new Date(a.data_realizacao).getTime())[0] }
function tipoLabel(tipo: string): string { return TIPOS_ASO.find(t => t.value === tipo)?.label ?? tipo }
function tipoSigla(tipo: string): string { return TIPOS_ASO.find(t => t.value === tipo)?.sigla ?? tipo.toUpperCase().slice(0, 3) }

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
    const res = await fetch(`/api/r2/signed-url?key=${encodeURIComponent(key)}`)
    const data = await res.json()
    if (data.url) window.open(data.url, '_blank')
    else alert('Erro ao gerar link de visualização.')
  } catch (err) {
    console.error(err)
    alert('Erro ao abrir o documento.')
  }
}

function getASOPrincipal(col: Colaborador): { aso: ASO; vencimento: string } | null {
  const candidatos: { aso: ASO; vencimento: string; peso: number }[] = []
  const per = getASOPorTipo(col.asos, 'periodico')
  const ret = getASOPorTipo(col.asos, 'retorno')
  const mro = getASOPorTipo(col.asos, 'mudanca_risco')
  const adm = getASOPorTipo(col.asos, 'admissional')
  if (per?.data_vencimento) candidatos.push({ aso: per, vencimento: per.data_vencimento, peso: 2 })
  if (ret) { const d = new Date(ret.data_realizacao + 'T12:00:00'); d.setFullYear(d.getFullYear() + 1); candidatos.push({ aso: ret, vencimento: d.toISOString().split('T')[0], peso: 2 }) }
  if (mro) { const d = new Date(mro.data_realizacao + 'T12:00:00'); d.setFullYear(d.getFullYear() + 1); candidatos.push({ aso: mro, vencimento: d.toISOString().split('T')[0], peso: 2 }) }
  if (adm && candidatos.length === 0) { const d = new Date(adm.data_realizacao + 'T12:00:00'); d.setFullYear(d.getFullYear() + 1); candidatos.push({ aso: adm, vencimento: d.toISOString().split('T')[0], peso: 1 }) }
  if (!candidatos.length) return null
  const maxPeso = Math.max(...candidatos.map(c => c.peso))
  const tops = candidatos.filter(c => c.peso === maxPeso)
  tops.sort((a, b) => new Date(b.vencimento).getTime() - new Date(a.vencimento).getTime())
  return { aso: tops[0].aso, vencimento: tops[0].vencimento }
}

function getStatusColaborador(col: Colaborador): StatusASO { const principal = getASOPrincipal(col); if (!principal) return 'sem_aso'; return getStatusASO(principal.vencimento) }
function temProgramado(col: Colaborador): boolean { return col.asos.some(a => (a.programacoes || []).length > 0) }
function statusCores(s: StatusASO): { bg: string; text: string } { if (s === 'no_prazo') return { bg: '#dcfce7', text: '#15803d' }; if (s === 'critico') return { bg: '#fef9c3', text: '#a16207' }; if (s === 'atencao') return { bg: '#ffedd5', text: '#c2410c' }; if (s === 'vencido') return { bg: '#fee2e2', text: '#dc2626' }; return { bg: '#f1f5f9', text: '#64748b' } }
function statusLabel(s: StatusASO): string { if (s === 'no_prazo') return 'No Prazo'; if (s === 'critico') return 'Prazo Crítico'; if (s === 'atencao') return 'Bernhoeft c/ Atenção'; if (s === 'vencido') return 'Vencido'; return 'Sem ASO' }

// ─── EXPORTAÇÃO ───────────────────────────────────────────────────────────────
function gerarExport(colabs: Colaborador[]) {
  return colabs.map(c => {
    const asoAdm = getASOPorTipo(c.asos, 'admissional'); const asoPer = getASOPorTipo(c.asos, 'periodico')
    const asoRet = getASOPorTipo(c.asos, 'retorno'); const asoMRO = getASOPorTipo(c.asos, 'mudanca_risco'); const asoDem = getASOPorTipo(c.asos, 'demissional')
    const principal = getASOPrincipal(c); const status = getStatusColaborador(c); const dias = principal ? calcularDias(principal.vencimento) : null
    const row: Record<string, string | number> = {
      'Matrícula': c.matricula, 'Nome': c.nome, 'Base': c.bases?.nome || '', 'Situação': c.situacao,
      'Admissão': formatarData(c.data_admissao), 'Função': c.funcoes?.nome || '', 'Processo': c.processo || '', 'GSE': c.gse ?? '',
      'ASO': principal ? tipoSigla(principal.aso.tipo) : '—', 'Dias Restantes': dias ?? '', 'Status': statusLabel(status),
      'Admissional': formatarData(asoAdm?.data_realizacao), 'Periódico - Realização': formatarData(asoPer?.data_realizacao),
      'Periódico - Vencimento': formatarData(asoPer?.data_vencimento), 'Retorno': formatarData(asoRet?.data_realizacao),
      'MRO': formatarData(asoMRO?.data_realizacao), 'Demissional': formatarData(asoDem?.data_realizacao),
    }
    EXAMES_COMPL.forEach(e => { const ex = c.exames_compl.find(x => x.nome_exame === e.nome); row[e.label] = formatarData(ex?.data_realizacao) })
    return row
  })
}
function exportCSV(dados: Record<string, string | number>[]) { if (!dados.length) return; const cols = Object.keys(dados[0]); const csv = [cols.map(h => `"${h}"`).join(';'), ...dados.map(r => cols.map(h => `"${String(r[h] ?? '').replace(/"/g, '""')}"`).join(';'))].join('\n'); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })); a.download = `med-trab-${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.csv`; a.click() }
function exportXLSX(dados: Record<string, string | number>[]) { if (!dados.length) return; import('xlsx').then(X => { const ws = X.utils.json_to_sheet(dados); const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, ws, 'MED TRAB'); X.writeFile(wb, `med-trab-${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.xlsx`) }) }

// ─── FILTRO MULTI-SELECT SITUAÇÃO ─────────────────────────────────────────────
function FiltroSituacao({ opcoes, selecionadas, onChange }: { opcoes: string[]; selecionadas: string[]; onChange: (v: string[]) => void }) {
  const [open, setOpen] = useState(false); const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h) }, [])
  const toggle = (s: string) => onChange(selecionadas.includes(s) ? selecionadas.filter(x => x !== s) : [...selecionadas, s])
  const todas = opcoes.every(o => selecionadas.includes(o))
  let label = 'Todas as situações'; if (selecionadas.length === 0) label = 'Nenhuma'; else if (!todas) label = selecionadas.length === 1 ? selecionadas[0] : `${selecionadas.length} situações`
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(!open)} style={{ height: 36, border: '1px solid #e0e0e0', borderRadius: 8, padding: '0 10px', fontSize: 13, backgroundColor: 'white', color: '#555', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, minWidth: 160, justifyContent: 'space-between' }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        <span style={{ fontSize: 10, flexShrink: 0 }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && <div style={{ position: 'absolute', top: 40, left: 0, zIndex: 150, backgroundColor: 'white', border: '1px solid #e0e0e0', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', width: 220, overflow: 'hidden' }}>
        <div style={{ padding: '8px 14px', borderBottom: '1px solid #f0f0f0' }}><label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 600, color: '#333', cursor: 'pointer' }}><input type="checkbox" checked={todas} onChange={() => onChange(todas ? [] : opcoes)} style={{ accentColor: COR }} />Todas as situações</label></div>
        {opcoes.map(op => <label key={op} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px', fontSize: 12, cursor: 'pointer', backgroundColor: selecionadas.includes(op) ? '#fdf2f5' : 'white', color: selecionadas.includes(op) ? COR : '#555' }}><input type="checkbox" checked={selecionadas.includes(op)} onChange={() => toggle(op)} style={{ accentColor: COR }} />{op}</label>)}
      </div>}
    </div>
  )
}

// ─── BOTÃO EXPORTAR ───────────────────────────────────────────────────────────
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

// ─── TH ORDENÁVEL ─────────────────────────────────────────────────────────────
function Th({ label, col, ord, dir, onClick, left, style }: { label: string; col: OrdemColuna; ord: OrdemColuna; dir: OrdemDirecao; onClick: (c: OrdemColuna) => void; left?: number; style?: React.CSSProperties }) {
  const ativo = ord === col; const isSticky = left !== undefined
  return <th onClick={() => onClick(col)} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none', color: ativo ? COR : '#333', borderBottom: ativo ? `2px solid ${COR}` : '2px solid #e0e0e0', borderRight: isSticky ? '2px solid #d0d0d0' : '1px solid #e8e8e8', position: 'sticky', top: 0, left: isSticky ? left : undefined, zIndex: isSticky ? 110 : 100, backgroundColor: '#fafafa', ...style }}>
    {label} {ativo ? (dir === 'asc' ? '↑' : '↓') : <span style={{ color: '#ccc' }}>↕</span>}
  </th>
}

// ─── ÍCONE ────────────────────────────────────────────────────────────────────
function Icone({ tipo, cor, titulo, size = 16 }: { tipo: string; cor: string; titulo?: string; size?: number }) {
  const paths: Record<string, string> = {
    clipe: 'M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48',
    check: 'M22 11.08V12a10 10 0 11-5.93-9.14M22 4L12 14.01l-3-3',
    x_circulo: 'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM15 9l-6 6M9 9l6 6',
    olho: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 9a3 3 0 100 6 3 3 0 000-6z',
    relogio: 'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM12 6v6l4 2',
    calendario: 'M19 4H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2zM16 2v4M8 2v4M3 10h18',
    upload: 'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12',
    plus: 'M12 5v14M5 12h14',
    chevron: 'M9 18l6-6-6-6',
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={cor} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}>{titulo && <title>{titulo}</title>}<path d={paths[tipo] || ''} /></svg>
}

// ─── CÉLULAS ─────────────────────────────────────────────────────────────────
function CelulaASOPrincipal({ colab, onClick, onCalendario, compacto }: { colab: Colaborador; onClick: () => void; onCalendario: () => void; compacto: boolean }) {
  const principal = getASOPrincipal(colab); const status = getStatusColaborador(colab); const cores = statusCores(status)
  const pad = compacto ? '6px 8px' : '8px 12px'
  const base: React.CSSProperties = { padding: pad, textAlign: 'center', verticalAlign: 'middle', minWidth: compacto ? 120 : 150, borderBottom: '1px solid #f5f5f5', borderRight: '1px solid #f0f0f0', cursor: 'pointer' }
  if (!principal) return <td style={{ ...base, backgroundColor: '#f1f5f9' }}><span style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic' }}>Sem ASO</span></td>
  const { aso, vencimento } = principal; const dias = calcularDias(vencimento)
  const bgMap: Record<StatusASO, string> = { no_prazo: '#f0fdf4', critico: '#fefce8', atencao: '#fff7ed', vencido: '#fef2f2', sem_aso: '#f1f5f9' }
  const temArq = !!aso.url_arquivo
  const aud = [...(aso.logs_auditoria || [])].sort((a, b) => new Date(b.data_auditoria).getTime() - new Date(a.data_auditoria).getTime())[0]
  const prog = [...(aso.programacoes || [])].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
  return <td style={{ ...base, backgroundColor: bgMap[status] }} onClick={onClick}>
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: cores.text, backgroundColor: cores.bg, padding: '1px 6px', borderRadius: 4 }}>{tipoSigla(aso.tipo)}</span>
      <span style={{ fontSize: compacto ? 10 : 11, color: '#555', fontWeight: 500 }}>{formatarData(vencimento)}</span>
      <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
        <Icone tipo="clipe" cor={temArq ? '#2563eb' : '#9ca3af'} size={12} />
        {!aud && <Icone tipo="relogio" cor="#9ca3af" titulo="Pendente" size={12} />}
        {aud?.validado && <Icone tipo="check" cor="#16a34a" titulo="Validado" size={12} />}
        {aud && !aud.validado && <Icone tipo="x_circulo" cor="#dc2626" titulo="Reprovado" size={12} />}
        {dias !== null && dias <= 60 && <span title={prog ? `Prog: ${formatarData(prog.data_programada)}` : 'Não programado'} onClick={e => { e.stopPropagation(); onCalendario() }} style={{ cursor: 'pointer', display: 'flex' }}><Icone tipo="calendario" cor={prog ? '#7c3aed' : '#9ca3af'} size={12} /></span>}
      </div>
      {prog && <span style={{ fontSize: 10, color: '#7c3aed', fontStyle: 'italic' }}>Prog: {formatarData(prog.data_programada)}</span>}
    </div>
  </td>
}

function CelulaDias({ colab, compacto }: { colab: Colaborador; compacto: boolean }) {
  const principal = getASOPrincipal(colab); const status = getStatusColaborador(colab); const cores = statusCores(status)
  const pad = compacto ? '6px 8px' : '8px 12px'
  const base: React.CSSProperties = { padding: pad, textAlign: 'center', verticalAlign: 'middle', minWidth: 80, borderBottom: '1px solid #f5f5f5', borderRight: '1px solid #f0f0f0' }
  if (!principal) return <td style={{ ...base, color: '#ccc' }}>—</td>
  const dias = calcularDias(principal.vencimento); if (dias === null) return <td style={{ ...base, color: '#ccc' }}>—</td>
  const bgMap: Record<StatusASO, string> = { no_prazo: '#f0fdf4', critico: '#fefce8', atencao: '#fff7ed', vencido: '#fef2f2', sem_aso: '#f1f5f9' }
  return <td style={{ ...base, backgroundColor: bgMap[status] }}>
    <span style={{ fontSize: compacto ? 12 : 13, fontWeight: 700, color: cores.text }}>{dias > 0 ? dias : Math.abs(dias)}</span>
    <span style={{ fontSize: 10, color: cores.text, marginLeft: 2 }}>{dias > 0 ? 'd' : 'd v.'}</span>
  </td>
}

function CelulaASODetalhe({ aso, tipo, onClick, onCalendario, compacto, isMaisRecente }: { aso: ASO | null; tipo: string; onClick: () => void; onCalendario: () => void; compacto: boolean; isMaisRecente: boolean }) {
  const pad = compacto ? '6px 8px' : '8px 12px'
  const base: React.CSSProperties = { padding: pad, textAlign: 'center', verticalAlign: 'middle', minWidth: compacto ? 90 : 120, borderBottom: '1px solid #f5f5f5', borderRight: '1px solid #f0f0f0', cursor: 'pointer', backgroundColor: '#fafafa' }
  if (!aso) return <td style={{ ...base }} onClick={onClick}><div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}><Icone tipo="plus" cor="#ddd" size={11} /><span style={{ fontSize: 10, color: '#ccc' }}>—</span></div></td>
  const semVenc = TIPOS_SEM_VENCIMENTO.includes(tipo); const temArq = !!aso.url_arquivo
  const aud = [...(aso.logs_auditoria || [])].sort((a, b) => new Date(b.data_auditoria).getTime() - new Date(a.data_auditoria).getTime())[0]
  const prog = [...(aso.programacoes || [])].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
  const data = semVenc ? aso.data_realizacao : aso.data_vencimento; const dias = semVenc ? null : calcularDias(aso.data_vencimento)
  return <td style={{ ...base, backgroundColor: isMaisRecente ? '#f8f8f8' : '#fafafa' }} onClick={onClick}>
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
      <span style={{ fontSize: compacto ? 10 : 11, color: '#666', fontWeight: isMaisRecente ? 700 : 400 }}>{formatarData(data)}</span>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <Icone tipo="clipe" cor={temArq ? '#2563eb' : '#d0d0d0'} size={11} />
        {!aud && <Icone tipo="relogio" cor="#d0d0d0" titulo="Pendente" size={11} />}
        {aud?.validado && <Icone tipo="check" cor="#16a34a" titulo="Validado" size={11} />}
        {aud && !aud.validado && <Icone tipo="x_circulo" cor="#dc2626" titulo="Reprovado" size={11} />}
        {dias !== null && dias <= 60 && <span title={prog ? `Prog: ${formatarData(prog.data_programada)}` : 'Não programado'} onClick={e => { e.stopPropagation(); onCalendario() }} style={{ cursor: 'pointer', display: 'flex' }}><Icone tipo="calendario" cor={prog ? '#7c3aed' : '#d0d0d0'} size={11} /></span>}
      </div>
    </div>
  </td>
}

function CelulaExameCompl({ exame, onClick, compacto }: { exame: ExameCompl | undefined; onClick: () => void; compacto: boolean }) {
  const pad = compacto ? '6px 8px' : '8px 12px'
  const base: React.CSSProperties = { padding: pad, textAlign: 'center', verticalAlign: 'middle', minWidth: compacto ? 90 : 110, borderBottom: '1px solid #f5f5f5', borderRight: '1px solid #f0f0f0', cursor: 'pointer', backgroundColor: '#fafafa' }
  if (!exame) return <td style={{ ...base }} onClick={onClick}><div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}><Icone tipo="plus" cor="#ddd" size={11} /><span style={{ fontSize: 10, color: '#ccc' }}>—</span></div></td>
  return <td style={{ ...base, backgroundColor: '#f8f8f8' }} onClick={onClick}>
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
      <span style={{ fontSize: compacto ? 10 : 11, color: '#555', fontWeight: 500 }}>{formatarData(exame.data_realizacao)}</span>
      <Icone tipo="clipe" cor={exame.url_arquivo ? '#2563eb' : '#d0d0d0'} size={11} />
    </div>
  </td>
}

// ─── MODAL ASO ────────────────────────────────────────────────────────────────
function ModalASO({ dados, abaInicial, onClose, onUpdate, email, podeAuditar, nivel }: {
  dados: { colab: Colaborador; aso: ASO | null; tipo: string }
  abaInicial: AbaModal; onClose: () => void; onUpdate: () => void; email: string; podeAuditar: boolean; nivel: string
}) {
  const [aba, setAba] = useState<AbaModal>(abaInicial)
  const [arquivo, setArquivo] = useState<File | null>(null); const [uploading, setUploading] = useState(false); const [errUp, setErrUp] = useState('')
  const [formAud, setFormAud] = useState({ validado: true, observacao: '' }); const [salvAud, setSalvAud] = useState(false); const [errAud, setErrAud] = useState('')
  const [modalExc, setModalExc] = useState(false); const [confNome, setConfNome] = useState(''); const [excluindo, setExcluindo] = useState(false); const [errExc, setErrExc] = useState('')
  const [progs, setProgs] = useState<ProgramacaoASO[]>(dados.aso?.programacoes || [])
  const [formProg, setFormProg] = useState({ data_programada: '', observacao: '' }); const [salvProg, setSalvProg] = useState(false); const [errProg, setErrProg] = useState('')
  const [historico, setHistorico] = useState<ASO[]>([])
  const [loadHistorico, setLoadHistorico] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const { colab, aso, tipo } = dados
  const tLabel = tipoLabel(tipo)

  useEffect(() => { if (aba === 'historico') carregarHistorico() }, [aba])

  async function carregarHistorico() {
    setLoadHistorico(true)
    let q = supabase.from('asos')
      .select('id, tipo, data_realizacao, data_vencimento, url_arquivo, observacao, gse, logs_auditoria(id, auditor_email, data_auditoria, validado, observacao), programacoes_exames(id, data_programada, observacao, criado_por, created_at)')
      .eq('matricula_colaborador', colab.matricula)
      .eq('tipo', tipo)
      .order('data_realizacao', { ascending: false })
    if (aso) q = q.neq('id', aso.id)
    const { data } = await q
    setHistorico((data || []).map((a: any) => ({ ...a, logs_auditoria: a.logs_auditoria || [], programacoes: a.programacoes_exames || [] })))
    setLoadHistorico(false)
  }

  // Upload modificado para usar as Rotas de API do Cloudflare R2
  async function fazerUpload() {
    if (!arquivo || !aso) return;
    setUploading(true); setErrUp('');
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const ext = arquivo.name.split('.').pop();
    const path = `asos/${colab.matricula}/${tipo}/${ts}.${ext}`;
    
    try {
      const formData = new FormData();
      formData.append('file', arquivo);
      formData.append('key', path);
      
      const res = await fetch('/api/r2/upload', { method: 'POST', body: formData });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Falha no upload para o R2');
      }

      // Agora gravamos a "key" limpa (caminho) em vez da URL completa no banco
      const { error: de } = await supabase.from('asos').update({ url_arquivo: path }).eq('id', aso.id);
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

  async function salvarProg() { if (!aso || !formProg.data_programada) { setErrProg('Informe a data.'); return }; setSalvProg(true); setErrProg(''); const { data, error } = await supabase.from('programacoes_exames').insert({ aso_id: aso.id, matricula_colaborador: colab.matricula, data_programada: formProg.data_programada, observacao: formProg.observacao || null, criado_por: email }).select().single(); if (error) { setErrProg(error.message); setSalvProg(false); return }; setProgs(p => [{ ...data }, ...p]); setFormProg({ data_programada: '', observacao: '' }); setSalvProg(false); onUpdate() }

  async function salvarAud() { if (!aso) return; if (!formAud.validado && !formAud.observacao) { setErrAud('Informe o motivo.'); return }; setSalvAud(true); setErrAud(''); const { error } = await supabase.from('logs_auditoria').insert({ aso_id: aso.id, auditor_email: email, validado: formAud.validado, observacao: formAud.observacao || null, data_auditoria: new Date().toISOString() }); if (error) { setErrAud(error.message); setSalvAud(false); return }; setSalvAud(false); onUpdate(); onClose() }

  async function excluir() { if (!aso) return; if (confNome !== tLabel) { setErrExc('Nome não confere.'); return }; setExcluindo(true); const { error } = await supabase.from('asos').delete().eq('id', aso.id); if (error) { setErrExc(error.message); setExcluindo(false); return }; onUpdate(); onClose() }

  const abas: { key: AbaModal; label: string }[] = [
    { key: 'info', label: 'Informações' },
    ...(nivel !== 'visualizador' ? [
      { key: 'documento' as AbaModal, label: 'Documento' },
      { key: 'programacao' as AbaModal, label: 'Programação' },
    ] : []),
    ...(podeAuditar ? [{ key: 'auditoria' as AbaModal, label: 'Auditoria' }] : []),
    { key: 'historico' as AbaModal, label: 'Histórico' },
  ]

  const inp: React.CSSProperties = { width: '100%', height: 38, border: '1px solid #e0e0e0', borderRadius: 8, padding: '0 12px', fontSize: 13, boxSizing: 'border-box', outline: 'none' }
  const semVenc = TIPOS_SEM_VENCIMENTO.includes(tipo)
  const status = aso ? getStatusASO(aso.data_vencimento) : 'sem_aso'
  const cores = statusCores(status)

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}>
      <div style={{ backgroundColor: 'white', borderRadius: 16, width: '100%', maxWidth: 560, maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ padding: '24px 28px 0', borderBottom: '1px solid #f0f0f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
            <div><h2 style={{ fontSize: 17, fontWeight: 600, color: '#1a1a1a', margin: 0 }}>{tLabel}</h2><p style={{ fontSize: 13, color: '#888', margin: '3px 0 0' }}>{colab.nome} · {colab.matricula}</p></div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#aaa', padding: '0 4px' }}>✕</button>
          </div>
          <div style={{ display: 'flex' }}>{abas.map(a => <button key={a.key} onClick={() => setAba(a.key)} style={{ padding: '8px 16px', fontSize: 13, fontWeight: aba === a.key ? 600 : 400, border: 'none', background: 'none', cursor: 'pointer', color: aba === a.key ? COR : '#888', borderBottom: aba === a.key ? `2px solid ${COR}` : '2px solid transparent', marginBottom: -1 }}>{a.label}</button>)}</div>
        </div>
        <div style={{ padding: '24px 28px', overflowY: 'auto', flex: 1 }}>

          {/* ── INFO ── */}
          {aba === 'info' && (aso ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
                {[{ label: 'Tipo', valor: tLabel }, { label: 'Realizado em', valor: formatarData(aso.data_realizacao) }, { label: 'Vencimento', valor: semVenc ? 'Sem prazo' : formatarData(aso.data_vencimento) }, { label: 'GSE', valor: colab.gse != null ? String(colab.gse) : '—' }, { label: 'Base', valor: colab.bases?.nome || '—' }, { label: 'Função', valor: colab.funcoes?.nome || '—' }].map((item, i) => (
                  <div key={i} style={{ backgroundColor: '#f9f9f9', borderRadius: 8, padding: 12 }}><p style={{ fontSize: 11, color: '#888', margin: '0 0 4px' }}>{item.label}</p><p style={{ fontSize: 14, color: '#333', margin: 0, fontWeight: 500 }}>{item.valor}</p></div>
                ))}
              </div>
              {!semVenc && aso.data_vencimento && (
                <div style={{ padding: '10px 14px', borderRadius: 10, marginBottom: 16, backgroundColor: cores.bg, border: `1px solid ${cores.text}30` }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: cores.text }}>{statusLabel(status)}</span>
                  {calcularDias(aso.data_vencimento) !== null && <span style={{ fontSize: 12, color: cores.text, marginLeft: 8 }}>({calcularDias(aso.data_vencimento)! > 0 ? `${calcularDias(aso.data_vencimento)} dias restantes` : `${Math.abs(calcularDias(aso.data_vencimento)!)} dias vencido`})</span>}
                </div>
              )}
              {aso.observacao && <div style={{ backgroundColor: '#f9f9f9', borderRadius: 8, padding: 12, marginBottom: 16 }}><p style={{ fontSize: 11, color: '#888', margin: '0 0 4px' }}>Observação</p><p style={{ fontSize: 13, color: '#555', margin: 0 }}>{aso.observacao}</p></div>}
              {nivel === 'admin' && <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #f0f0f0' }}><button onClick={() => { setConfNome(''); setErrExc(''); setModalExc(true) }} style={{ height: 36, padding: '0 16px', fontSize: 12, border: '1px solid #fca5a5', borderRadius: 8, backgroundColor: '#fef2f2', color: '#dc2626', cursor: 'pointer' }}>🗑 Excluir este ASO</button></div>}
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#aaa' }}><p style={{ fontSize: 32, margin: '0 0 8px' }}>📋</p><p style={{ fontSize: 14 }}>Nenhum registro de {tLabel} encontrado.</p></div>
          ))}

          {/* ── MODAL EXCLUIR ── */}
          {modalExc && <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 400 }}>
            <div style={{ backgroundColor: 'white', borderRadius: 16, padding: 28, width: '100%', maxWidth: 440, boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, color: '#dc2626', margin: '0 0 8px' }}>Excluir ASO</h3>
              <p style={{ fontSize: 13, color: '#555', margin: '0 0 16px', lineHeight: 1.5 }}>Esta ação é <strong>irreversível</strong>. Digite o tipo do ASO para confirmar:</p>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#333', margin: '0 0 8px', padding: '8px 12px', backgroundColor: '#f9f9f9', borderRadius: 8, borderLeft: '3px solid #dc2626' }}>{tLabel}</p>
              <input type="text" autoFocus value={confNome} onChange={e => setConfNome(e.target.value)} onKeyDown={e => e.key === 'Enter' && excluir()} placeholder="Digite o nome exato..." style={{ width: '100%', height: 38, border: '1px solid #e0e0e0', borderRadius: 8, padding: '0 12px', fontSize: 13, boxSizing: 'border-box', outline: 'none', marginBottom: 8 }} />
              {errExc && <p style={{ fontSize: 12, color: '#dc2626', margin: '0 0 12px' }}>{errExc}</p>}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 12 }}>
                <button onClick={() => setModalExc(false)} style={{ height: 38, padding: '0 18px', border: '1px solid #e0e0e0', borderRadius: 8, fontSize: 13, cursor: 'pointer', background: 'white', color: '#555' }}>Cancelar</button>
                <button onClick={excluir} disabled={excluindo || confNome !== tLabel} style={{ height: 38, padding: '0 22px', backgroundColor: '#dc2626', color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: excluindo || confNome !== tLabel ? 'not-allowed' : 'pointer', opacity: excluindo || confNome !== tLabel ? 0.5 : 1 }}>{excluindo ? 'Excluindo...' : 'Confirmar exclusão'}</button>
              </div>
            </div>
          </div>}

          {/* ── DOCUMENTO ── */}
          {aba === 'documento' && <div>
            {aso?.url_arquivo ? <div style={{ marginBottom: 24 }}><p style={{ fontSize: 13, fontWeight: 600, color: '#333', margin: '0 0 12px' }}>Documento atual</p><a href="#" onClick={(e) => visualizarDocumento(e, aso.url_arquivo!)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 16, backgroundColor: '#eff6ff', borderRadius: 10, border: '1px solid #bfdbfe', color: '#2563eb', textDecoration: 'none', fontSize: 13, fontWeight: 500 }}><Icone tipo="olho" cor="#2563eb" size={18} />Visualizar documento</a></div>
              : <div style={{ marginBottom: 24, padding: 16, backgroundColor: '#fffbeb', borderRadius: 10, border: '1px solid #fde68a' }}><p style={{ fontSize: 13, color: '#92400e', margin: 0 }}>⚠️ Nenhum documento anexado ainda.</p></div>}
            {!aso && <p style={{ fontSize: 13, color: '#aaa', marginBottom: 16 }}>Registre o ASO antes de anexar documento.</p>}
            {aso && <><p style={{ fontSize: 13, fontWeight: 600, color: '#333', margin: '0 0 12px' }}>{aso.url_arquivo ? 'Substituir documento' : 'Anexar documento'}</p>
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
              <button onClick={salvarProg} disabled={salvProg || !aso} style={{ height: 36, padding: '0 20px', backgroundColor: COR, color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: salvProg || !aso ? 'not-allowed' : 'pointer', opacity: salvProg || !aso ? 0.7 : 1 }}>{salvProg ? 'Salvando...' : 'Programar'}</button>
            </div>
            <p style={{ fontSize: 13, fontWeight: 600, color: '#333', margin: '0 0 12px' }}>Histórico</p>
            {progs.length === 0 ? <p style={{ fontSize: 13, color: '#aaa' }}>Nenhuma programação registrada.</p>
              : progs.map((p, i) => <div key={p.id} style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: '10px 14px', marginBottom: 8, borderLeft: '3px solid #7c3aed' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}><span style={{ fontSize: 13, fontWeight: 500, color: '#7c3aed' }}>📅 {formatarData(p.data_programada)}{i === 0 && <span style={{ fontSize: 10, color: '#aaa', marginLeft: 8 }}>mais recente</span>}</span><span style={{ fontSize: 11, color: '#aaa' }}>{new Date(p.created_at).toLocaleString('pt-BR')}</span></div>
                <p style={{ fontSize: 12, color: '#666', margin: 0 }}>Por: {p.criado_por}</p>
                {p.observacao && <p style={{ fontSize: 12, color: '#888', margin: '4px 0 0', fontStyle: 'italic' }}>{p.observacao}</p>}
              </div>)}
          </div>}

          {/* ── AUDITORIA ── */}
          {aba === 'auditoria' && podeAuditar && <div>
            {aso?.url_arquivo ? <a href="#" onClick={(e) => visualizarDocumento(e, aso.url_arquivo!)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 14, backgroundColor: '#eff6ff', borderRadius: 10, border: '1px solid #bfdbfe', color: '#2563eb', textDecoration: 'none', fontSize: 13, fontWeight: 500, marginBottom: 20 }}><Icone tipo="olho" cor="#2563eb" size={16} />Visualizar documento antes de auditar</a>
              : <div style={{ padding: 14, backgroundColor: '#fef2f2', borderRadius: 10, border: '1px solid #fecaca', marginBottom: 20 }}><p style={{ fontSize: 13, color: '#b91c1c', margin: 0 }}>⚠️ Sem documento. Recomenda-se solicitar antes de auditar.</p></div>}
            <div style={{ marginBottom: 16 }}><label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 8 }}>Decisão *</label>
              <div style={{ display: 'flex', gap: 12 }}>{[{ val: true, label: 'Aprovar', cor: '#16a34a', bg: '#f0fdf4' }, { val: false, label: 'Reprovar', cor: '#dc2626', bg: '#fef2f2' }].map(op => <button key={String(op.val)} onClick={() => setFormAud(f => ({ ...f, validado: op.val }))} style={{ flex: 1, height: 42, borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', border: formAud.validado === op.val ? `2px solid ${op.cor}` : '1px solid #e0e0e0', backgroundColor: formAud.validado === op.val ? op.bg : 'white', color: formAud.validado === op.val ? op.cor : '#555' }}>{op.label}</button>)}</div>
            </div>
            <div style={{ marginBottom: 16 }}><label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>Observação {!formAud.validado && <span style={{ color: '#dc2626' }}>*</span>}</label><textarea value={formAud.observacao} onChange={e => setFormAud(f => ({ ...f, observacao: e.target.value }))} placeholder={!formAud.validado ? 'Informe o motivo...' : 'Opcional...'} rows={3} style={{ ...inp, height: 'auto', padding: '8px 12px', resize: 'none' }} /></div>
            {errAud && <p style={{ fontSize: 12, color: '#dc2626', marginBottom: 12 }}>{errAud}</p>}
            <button onClick={salvarAud} disabled={salvAud || !aso} style={{ width: '100%', height: 40, fontSize: 13, fontWeight: 500, cursor: salvAud || !aso ? 'not-allowed' : 'pointer', border: 'none', borderRadius: 8, opacity: salvAud || !aso ? 0.7 : 1, backgroundColor: formAud.validado ? '#16a34a' : '#dc2626', color: 'white' }}>{salvAud ? 'Salvando...' : formAud.validado ? 'Confirmar aprovação' : 'Confirmar reprovação'}</button>
          </div>}

          {/* ── HISTÓRICO ── */}
          {aba === 'historico' && (
            <div>
              {loadHistorico
                ? <p style={{ fontSize: 13, color: '#aaa' }}>Carregando...</p>
                : historico.length === 0
                  ? <div style={{ textAlign: 'center', padding: '40px 0', color: '#aaa' }}>
                      <p style={{ fontSize: 28, margin: '0 0 8px' }}>📂</p>
                      <p style={{ fontSize: 14 }}>Nenhum ASO anterior encontrado para este tipo.</p>
                    </div>
                  : historico.map((h, i) => {
                      const aud = [...(h.logs_auditoria || [])].sort((a, b) => new Date(b.data_auditoria).getTime() - new Date(a.data_auditoria).getTime())[0]
                      const semVencH = TIPOS_SEM_VENCIMENTO.includes(h.tipo)
                      return (
                        <div key={h.id} style={{ border: '1px solid #f0f0f0', borderRadius: 10, padding: '14px 16px', marginBottom: 10, borderLeft: '3px solid #e0e0e0' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                            <div>
                              <p style={{ fontSize: 13, fontWeight: 600, color: '#333', margin: 0 }}>📅 Realizado em: {formatarData(h.data_realizacao)}</p>
                              {!semVencH && h.data_vencimento && <p style={{ fontSize: 12, color: '#888', margin: '3px 0 0' }}>Vencimento: {formatarData(h.data_vencimento)}</p>}
                              {semVencH && <p style={{ fontSize: 12, color: '#16a34a', margin: '3px 0 0' }}>Sem prazo de vencimento</p>}
                            </div>
                            {i === 0 && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, backgroundColor: '#f1f5f9', color: '#64748b' }}>mais recente</span>}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            {h.url_arquivo
                              ? <a href="#" onClick={(e) => visualizarDocumento(e, h.url_arquivo!)} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#2563eb', textDecoration: 'none', padding: '4px 10px', backgroundColor: '#eff6ff', borderRadius: 6, border: '1px solid #bfdbfe' }}>
                                  <Icone tipo="olho" cor="#2563eb" size={13} /> Ver documento
                                </a>
                              : <span style={{ fontSize: 12, color: '#aaa', display: 'flex', alignItems: 'center', gap: 4 }}><Icone tipo="clipe" cor="#ccc" size={13} /> Sem documento</span>}
                            {!aud && <span style={{ fontSize: 12, color: '#aaa', display: 'flex', alignItems: 'center', gap: 4 }}><Icone tipo="relogio" cor="#ccc" size={13} /> Sem auditoria</span>}
                            {aud?.validado && <span style={{ fontSize: 12, color: '#16a34a', display: 'flex', alignItems: 'center', gap: 4 }}><Icone tipo="check" cor="#16a34a" size={13} /> Validado</span>}
                            {aud && !aud.validado && <span style={{ fontSize: 12, color: '#dc2626', display: 'flex', alignItems: 'center', gap: 4 }}><Icone tipo="x_circulo" cor="#dc2626" size={13} /> Reprovado</span>}
                          </div>
                          {aud?.observacao && <p style={{ fontSize: 12, color: '#888', margin: '8px 0 0', fontStyle: 'italic' }}>"{aud.observacao}"</p>}
                          {h.observacao && <p style={{ fontSize: 12, color: '#888', margin: '6px 0 0' }}>Obs: {h.observacao}</p>}
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

// ─── MODAL EXAME COMPLEMENTAR ─────────────────────────────────────────────────
function ModalExameCompl({ colab, nomeExame, exame, onClose, onUpdate }: { colab: Colaborador; nomeExame: string; exame: ExameCompl | undefined; onClose: () => void; onUpdate: () => void }) {
  const [dataRealizacao, setDataRealizacao] = useState(exame?.data_realizacao || '')
  const [arquivo, setArquivo] = useState<File | null>(null); const [salvando, setSalvando] = useState(false); const [erro, setErro] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const inp: React.CSSProperties = { width: '100%', height: 38, border: '1px solid #e0e0e0', borderRadius: 8, padding: '0 12px', fontSize: 13, boxSizing: 'border-box', outline: 'none', backgroundColor: 'white' }
  
  // Upload modificado para usar o Cloudflare R2
  async function salvar() {
    if (!dataRealizacao) { setErro('Data de realização é obrigatória.'); return }
    setSalvando(true); setErro('')
    try {
      let urlArquivo: string | null = exame?.url_arquivo || null
      
      if (arquivo) { 
        const ext = arquivo.name.split('.').pop(); 
        const path = `exames_compl/${colab.matricula}/${nomeExame.replace(/\s/g, '_')}/${Date.now()}.${ext}`; 
        
        const formData = new FormData();
        formData.append('file', arquivo);
        formData.append('key', path);
        
        const res = await fetch('/api/r2/upload', { method: 'POST', body: formData });
        if (!res.ok) throw new Error('Falha no upload para o R2');
        
        urlArquivo = path;
      }
      
      const { data: tipo } = await supabase.from('tipos_exame_medico').select('id').eq('nome', nomeExame).single()
      if (!tipo) throw new Error('Tipo de exame não encontrado')
      if (exame) { await supabase.from('exames_aso').update({ data_realizacao: dataRealizacao, url_arquivo: urlArquivo }).eq('id', exame.id) }
      else { await supabase.from('exames_aso').insert({ matricula_colaborador: colab.matricula, tipo_exame_id: tipo.id, data_realizacao: dataRealizacao, url_arquivo: urlArquivo }) }
      onUpdate(); onClose()
    } catch (e: any) { setErro(e.message || 'Erro ao salvar') }
    setSalvando(false)
  }
  
  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}>
      <div style={{ backgroundColor: 'white', borderRadius: 16, padding: 28, width: '100%', maxWidth: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div><h2 style={{ fontSize: 16, fontWeight: 600, color: '#1a1a1a', margin: 0 }}>{nomeExame}</h2><p style={{ fontSize: 13, color: '#888', margin: '3px 0 0' }}>{colab.nome} · {colab.matricula}</p></div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#aaa' }}>✕</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div><label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>Data de realização *</label><input type="date" value={dataRealizacao} onChange={e => setDataRealizacao(e.target.value)} style={inp} /></div>
          <div>
            <label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>Documento <span style={{ color: '#aaa' }}>(opcional)</span></label>
            {exame?.url_arquivo && <a href="#" onClick={(e) => visualizarDocumento(e, exame.url_arquivo!)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', backgroundColor: '#eff6ff', borderRadius: 8, color: '#2563eb', textDecoration: 'none', fontSize: 12, marginBottom: 8 }}><Icone tipo="olho" cor="#2563eb" size={14} />Ver documento atual</a>}
            <div onClick={() => fileRef.current?.click()} style={{ border: '2px dashed #e0e0e0', borderRadius: 10, padding: '16px 20px', textAlign: 'center', cursor: 'pointer', backgroundColor: '#fafafa' }}>
              <Icone tipo="upload" cor="#aaa" size={20} /><p style={{ fontSize: 12, color: '#888', margin: '6px 0 0' }}>{arquivo ? arquivo.name : exame?.url_arquivo ? 'Substituir documento' : 'Clique para anexar'}</p>
              <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: 'none' }} onChange={e => setArquivo(e.target.files?.[0] || null)} />
            </div>
          </div>
          {erro && <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '8px 12px' }}><p style={{ fontSize: 12, color: '#dc2626', margin: 0 }}>{erro}</p></div>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button onClick={onClose} style={{ height: 38, padding: '0 18px', border: '1px solid #e0e0e0', borderRadius: 8, fontSize: 13, cursor: 'pointer', background: 'white', color: '#555' }}>Cancelar</button>
            <button onClick={salvar} disabled={salvando} style={{ height: 38, padding: '0 22px', backgroundColor: COR, color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: salvando ? 'not-allowed' : 'pointer', opacity: salvando ? 0.7 : 1 }}>{salvando ? 'Salvando...' : 'Salvar'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── MODAL NOVO ASO ───────────────────────────────────────────────────────────
interface ExameSugerido { tipo_exame_id: number; nome: string; data: string; marcado: boolean; ultimaData: string | null }

function ModalNovoASO({ colab, onClose, onSalvo }: { colab: Colaborador; onClose: () => void; onSalvo: () => void }) {
  const [tipo, setTipo] = useState('periodico')
  const [dataRealizacao, setDataRealizacao] = useState('')
  const [dataVencimento, setDataVencimento] = useState('')
  const [vencimentoEditado, setVencimentoEditado] = useState(false)
  const [observacao, setObservacao] = useState('')
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [salvando, setSalvando] = useState(false); const [erro, setErro] = useState('')
  const [examesSugeridos, setExamesSugeridos] = useState<ExameSugerido[]>([])
  const [loadingExames, setLoadingExames] = useState(false)
  const [todosExames, setTodosExames] = useState<{ id: number; nome: string }[]>([])
  const [exameExtra, setExameExtra] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const CAMPO_TIPO: Record<string, string> = { admissional: 'no_adm', periodico: 'no_per', retorno: 'no_ret', mudanca_risco: 'no_mro', demissional: 'no_dem' }

  useEffect(() => { if (tipo !== 'periodico' || vencimentoEditado) return; if (!dataRealizacao) { setDataVencimento(''); return }; const d = new Date(dataRealizacao + 'T12:00:00'); d.setFullYear(d.getFullYear() + 1); setDataVencimento(d.toISOString().split('T')[0]) }, [tipo, dataRealizacao, vencimentoEditado])
  useEffect(() => { setDataVencimento(''); setVencimentoEditado(false) }, [tipo])
  useEffect(() => { supabase.from('tipos_exame_medico').select('id, nome').order('nome').then(({ data }) => setTodosExames(data || [])) }, [])
  useEffect(() => {
    async function buscarExames() {
      if (!colab.gse) return; const campo = CAMPO_TIPO[tipo]; if (!campo) { setExamesSugeridos([]); return }; setLoadingExames(true)
      const { data: gseEx } = await supabase.from('gse_exames').select(`tipo_exame_id, ${campo}, tipos_exame_medico(id, nome)`).eq('gse_id', colab.gse).eq(campo, true)
      if (!gseEx?.length) { setExamesSugeridos([]); setLoadingExames(false); return }
      const tipoIds = gseEx.map((g: any) => g.tipo_exame_id)
      const { data: ultimos } = await supabase.from('exames_aso').select('tipo_exame_id, data_realizacao').eq('matricula_colaborador', colab.matricula).in('tipo_exame_id', tipoIds).order('data_realizacao', { ascending: false })
      const ultimoMap: Record<number, string> = {}; ;(ultimos || []).forEach((u: any) => { if (!ultimoMap[u.tipo_exame_id]) ultimoMap[u.tipo_exame_id] = u.data_realizacao })
      setExamesSugeridos(gseEx.map((g: any) => ({ tipo_exame_id: g.tipo_exame_id, nome: g.tipos_exame_medico?.nome || '', data: dataRealizacao || '', marcado: true, ultimaData: ultimoMap[g.tipo_exame_id] || null })))
      setLoadingExames(false)
    }
    buscarExames()
  }, [tipo, colab.gse])
  useEffect(() => { if (!dataRealizacao) return; setExamesSugeridos(prev => prev.map(e => ({ ...e, data: e.data || dataRealizacao }))) }, [dataRealizacao])

  function toggleExame(idx: number) { setExamesSugeridos(prev => prev.map((e, i) => i === idx ? { ...e, marcado: !e.marcado } : e)) }
  function setDataExame(idx: number, data: string) { setExamesSugeridos(prev => prev.map((e, i) => i === idx ? { ...e, data } : e)) }
  function adicionarExtra() { if (!exameExtra) return; const te = todosExames.find(t => t.id === parseInt(exameExtra)); if (!te || examesSugeridos.find(e => e.tipo_exame_id === te.id)) return; setExamesSugeridos(prev => [...prev, { tipo_exame_id: te.id, nome: te.nome, data: dataRealizacao || '', marcado: true, ultimaData: null }]); setExameExtra('') }
  function removerExtra(idx: number) { setExamesSugeridos(prev => prev.filter((_, i) => i !== idx)) }

  // Upload modificado para usar o Cloudflare R2
  async function salvar() {
    if (!dataRealizacao) { setErro('Data de realização é obrigatória.'); return }
    setSalvando(true); setErro('')
    try {
      let urlArquivo: string | null = null
      
      if (arquivo) { 
        const ext = arquivo.name.split('.').pop(); 
        const path = `asos/${colab.matricula}/${tipo}/${Date.now()}.${ext}`; 
        
        const formData = new FormData();
        formData.append('file', arquivo);
        formData.append('key', path);
        
        const res = await fetch('/api/r2/upload', { method: 'POST', body: formData });
        if (!res.ok) throw new Error('Falha no upload para o R2');
        
        urlArquivo = path;
      }
      
      const { data: novoASO, error: insertErr } = await supabase.from('asos').insert({ matricula_colaborador: colab.matricula, tipo, data_realizacao: dataRealizacao, data_vencimento: TIPOS_SEM_VENCIMENTO.includes(tipo) ? null : (dataVencimento || null), gse: colab.gse || null, observacao: observacao || null, url_arquivo: urlArquivo }).select().single()
      if (insertErr) throw insertErr
      const examesMarcados = examesSugeridos.filter(e => e.marcado && e.data)
      if (examesMarcados.length > 0 && novoASO) { const { error: exErr } = await supabase.from('exames_aso').insert(examesMarcados.map(e => ({ aso_id: novoASO.id, matricula_colaborador: colab.matricula, tipo_exame_id: e.tipo_exame_id, data_realizacao: e.data }))); if (exErr) throw exErr }
      onSalvo()
    } catch (e: any) { setErro(e.message || 'Erro ao salvar ASO.') }
    setSalvando(false)
  }

  const semVencimento = TIPOS_SEM_VENCIMENTO.includes(tipo)
  const inp: React.CSSProperties = { width: '100%', height: 38, border: '1px solid #e0e0e0', borderRadius: 8, padding: '0 12px', fontSize: 13, boxSizing: 'border-box', outline: 'none', backgroundColor: 'white' }
  const examesDisponiveis = todosExames.filter(t => !examesSugeridos.some(e => e.tipo_exame_id === t.id))

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}>
      <div style={{ backgroundColor: 'white', borderRadius: 16, padding: 28, width: '100%', maxWidth: 540, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div><h2 style={{ fontSize: 16, fontWeight: 600, color: '#1a1a1a', margin: 0 }}>Novo ASO</h2><p style={{ fontSize: 13, color: '#888', margin: '3px 0 0' }}>{colab.nome} · {colab.matricula}</p></div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#aaa' }}>✕</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div><label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>Tipo *</label><select value={tipo} onChange={e => setTipo(e.target.value)} style={inp}>{TIPOS_ASO.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
          <div style={{ display: 'grid', gridTemplateColumns: semVencimento ? '1fr' : '1fr 1fr', gap: 12 }}>
            <div><label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>Data de realização *</label><input type="date" value={dataRealizacao} onChange={e => setDataRealizacao(e.target.value)} style={inp} /></div>
            {!semVencimento && <div><label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>{tipo === 'periodico' ? 'Vencimento (auto +1 ano)' : 'Vencimento'}</label><input type="date" value={dataVencimento} onChange={e => { setDataVencimento(e.target.value); setVencimentoEditado(true) }} style={{ ...inp, backgroundColor: dataVencimento ? '#f0fdf4' : 'white' }} />{dataVencimento && <p style={{ fontSize: 11, color: '#16a34a', margin: '3px 0 0' }}>✓ Calculado automaticamente</p>}</div>}
          </div>
          {semVencimento && <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '8px 12px' }}><p style={{ fontSize: 12, color: '#16a34a', margin: 0 }}>✓ Este tipo de ASO não possui prazo de vencimento</p></div>}
          {colab.gse && <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '8px 12px' }}><p style={{ fontSize: 12, color: '#16a34a', margin: 0 }}>GSE {colab.gse} será vinculado automaticamente</p></div>}
          {colab.gse && (
            <div style={{ border: '1px solid #e0e0e0', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ padding: '10px 14px', backgroundColor: '#f9f9f9', borderBottom: '1px solid #e0e0e0' }}><p style={{ fontSize: 13, fontWeight: 600, color: '#333', margin: 0 }}>Exames Complementares</p><p style={{ fontSize: 11, color: '#888', margin: '2px 0 0' }}>Baseado no GSE {colab.gse} — desmarque os que não serão realizados</p></div>
              {loadingExames ? <div style={{ padding: '16px 14px', color: '#aaa', fontSize: 13 }}>Carregando exames...</div>
                : examesSugeridos.length === 0 ? <div style={{ padding: '16px 14px', color: '#aaa', fontSize: 13 }}>Nenhum exame obrigatório para este tipo de ASO</div>
                : <div style={{ padding: '8px 0' }}>
                  {examesSugeridos.map((e, idx) => (
                    <div key={e.tipo_exame_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderBottom: idx < examesSugeridos.length - 1 ? '1px solid #f5f5f5' : 'none', opacity: e.marcado ? 1 : 0.4 }}>
                      <input type="checkbox" checked={e.marcado} onChange={() => toggleExame(idx)} style={{ accentColor: COR, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}><p style={{ fontSize: 12, fontWeight: 500, color: '#333', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.nome}</p>{e.ultimaData && <p style={{ fontSize: 11, color: '#aaa', margin: '1px 0 0' }}>Último: {new Date(e.ultimaData + 'T12:00:00').toLocaleDateString('pt-BR')}</p>}</div>
                      <input type="date" value={e.data} onChange={ev => setDataExame(idx, ev.target.value)} disabled={!e.marcado} style={{ height: 32, border: '1px solid #e0e0e0', borderRadius: 6, padding: '0 8px', fontSize: 12, outline: 'none', backgroundColor: e.marcado ? 'white' : '#f5f5f5', width: 130, flexShrink: 0 }} />
                      {!EXAMES_COMPL.find(ec => todosExames.find(t => t.id === e.tipo_exame_id && ec.nome === t.nome)) && <button onClick={() => removerExtra(idx)} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 16, padding: '0 4px', flexShrink: 0 }}>✕</button>}
                    </div>
                  ))}
                </div>}
              <div style={{ padding: '10px 14px', borderTop: '1px solid #f0f0f0', display: 'flex', gap: 8 }}>
                <select value={exameExtra} onChange={e => setExameExtra(e.target.value)} style={{ flex: 1, height: 34, border: '1px solid #e0e0e0', borderRadius: 8, padding: '0 10px', fontSize: 12, outline: 'none', backgroundColor: 'white', color: '#555' }}><option value="">+ Adicionar exame extra...</option>{examesDisponiveis.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}</select>
                <button onClick={adicionarExtra} disabled={!exameExtra} style={{ height: 34, padding: '0 14px', fontSize: 12, border: `1px solid ${COR}`, borderRadius: 8, backgroundColor: exameExtra ? COR : '#f5f5f5', color: exameExtra ? 'white' : '#aaa', cursor: exameExtra ? 'pointer' : 'not-allowed' }}>Adicionar</button>
              </div>
            </div>
          )}
          <div><label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>Observação <span style={{ color: '#aaa' }}>(opcional)</span></label><textarea value={observacao} onChange={e => setObservacao(e.target.value)} rows={2} placeholder="Opcional" style={{ ...inp, height: 'auto', padding: '8px 12px', resize: 'none' }} /></div>
          <div><label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>Documento <span style={{ color: '#aaa' }}>(opcional)</span></label>
            <div onClick={() => fileRef.current?.click()} style={{ border: '2px dashed #e0e0e0', borderRadius: 10, padding: '16px 20px', textAlign: 'center', cursor: 'pointer', backgroundColor: '#fafafa' }}>
              <Icone tipo="upload" cor="#aaa" size={22} /><p style={{ fontSize: 12, color: '#888', margin: '6px 0 0' }}>{arquivo ? arquivo.name : 'Clique para anexar'}</p><p style={{ fontSize: 11, color: '#bbb', margin: '2px 0 0' }}>PDF, JPG ou PNG</p>
              <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: 'none' }} onChange={e => setArquivo(e.target.files?.[0] || null)} />
            </div>
          </div>
          {erro && <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '8px 12px' }}><p style={{ fontSize: 12, color: '#dc2626', margin: 0 }}>{erro}</p></div>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
            <button onClick={onClose} style={{ height: 38, padding: '0 18px', border: '1px solid #e0e0e0', borderRadius: 8, fontSize: 13, cursor: 'pointer', background: 'white', color: '#555' }}>Cancelar</button>
            <button onClick={salvar} disabled={salvando} style={{ height: 38, padding: '0 22px', backgroundColor: COR, color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: salvando ? 'not-allowed' : 'pointer', opacity: salvando ? 0.7 : 1 }}>{salvando ? 'Salvando...' : 'Salvar ASO'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── PÁGINA PRINCIPAL ─────────────────────────────────────────────────────────
export default function MedTrabPage() {
  const router = useRouter(); const { usuario } = useAuth()
  const podeEditar = usuario?.nivel !== 'visualizador'
  const [colabs, setColabs] = useState<Colaborador[]>([])
  const [bases, setBases] = useState<Base[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [filtroBase, setFiltroBase] = useState('')
  const [filtroSits, setFiltroSits] = useState<string[]>([])
  const [situacoesDisp, setSituacoesDisp] = useState<string[]>([])
  const [cardAtivo, setCardAtivo] = useState<CardFiltro>(null)
  const [compacto, setCompacto] = useState(false)
  const [expandido, setExpandido] = useState(false)
  const [ordCol, setOrdCol] = useState<OrdemColuna>('nome')
  const [ordDir, setOrdDir] = useState<OrdemDirecao>('asc')
  const [modalASO, setModalASO] = useState<{ colab: Colaborador; aso: ASO | null; tipo: string; abaInicial: AbaModal } | null>(null)
  const [modalNovo, setModalNovo] = useState<Colaborador | null>(null)
  const [modalExameCompl, setModalExameCompl] = useState<{ colab: Colaborador; nomeExame: string; exame: ExameCompl | undefined } | null>(null)

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser(); if (!user) { router.push('/login'); return }
      const { data: basesData } = await supabase.from('bases').select('id,nome').order('nome')
      setBases(basesData || []); await buscarColabs(null)
    }
    init()
  }, [])

  async function buscarColabs(sitsP: string[] | null) {
    const primeiraVez = sitsP === null; const sitsB = primeiraVez ? [] : sitsP!
    setLoading(true)
    let todos: any[] = []; let from = 0; const ps = 500
    while (true) {
      let q = supabase.from('colaboradores').select(`matricula, nome, situacao, funcao_id, gse, data_admissao, processo, bases(nome), funcoes(nome), gerencias!colaboradores_gerencia_id_fkey(sigla)`).order('nome').range(from, from + ps - 1)
      if (filtroBase) q = q.eq('base_id', filtroBase)
      if (!primeiraVez) { if (sitsB.length > 0) q = q.in('situacao', sitsB); else q = q.eq('situacao', '___nenhuma___') }
      const { data: cd } = await q; if (!cd || cd.length === 0) break
      todos = [...todos, ...cd]; if (cd.length < ps) break; from += ps
    }
    if (primeiraVez) {
      const sitsUnicas = [...new Set(todos.map((c: any) => c.situacao).filter(Boolean))].sort() as string[]
      setSituacoesDisp(sitsUnicas); const sitsIniciais = sitsUnicas.filter(s => !SITUACOES_EXCLUIDAS_PADRAO.includes(s))
      setFiltroSits(sitsIniciais); todos = todos.filter((c: any) => sitsIniciais.includes(c.situacao))
    }
    const mats = todos.map((c: any) => c.matricula)
    let asosData: any[] = []
    if (mats.length > 0) {
      const LOTE = 100
      for (let i = 0; i < mats.length; i += LOTE) {
        const lote = mats.slice(i, i + LOTE); let fromA = 0
        while (true) {
          const { data: aData } = await supabase.from('asos').select(`id, matricula_colaborador, tipo, data_realizacao, data_vencimento, gse, observacao, url_arquivo, logs_auditoria(id, auditor_email, data_auditoria, validado, observacao), programacoes_exames(id, data_programada, observacao, criado_por, created_at)`).in('matricula_colaborador', lote).range(fromA, fromA + 499)
          if (!aData || aData.length === 0) break; asosData = [...asosData, ...aData]; if (aData.length < 500) break; fromA += 500
        }
      }
    }
    let examesData: any[] = []
    if (mats.length > 0) {
      const LOTE = 100
      for (let i = 0; i < mats.length; i += LOTE) {
        const lote = mats.slice(i, i + LOTE); let fromE = 0
        while (true) {
          const { data: eData } = await supabase.from('exames_aso').select(`id, matricula_colaborador, tipo_exame_id, data_realizacao, url_arquivo, tipos_exame_medico(nome)`).in('matricula_colaborador', lote).range(fromE, fromE + 499)
          if (!eData || eData.length === 0) break; examesData = [...examesData, ...eData]; if (eData.length < 500) break; fromE += 500
        }
      }
    }
    setColabs(todos.map((c: any) => ({
      ...c,
      asos: asosData.filter((a: any) => a.matricula_colaborador === c.matricula).map((a: any) => ({ ...a, logs_auditoria: a.logs_auditoria || [], programacoes: a.programacoes_exames || [] })),
      exames_compl: examesData.filter((e: any) => e.matricula_colaborador === c.matricula).map((e: any) => ({ id: e.id, tipo_exame_id: e.tipo_exame_id, nome_exame: e.tipos_exame_medico?.nome || '', data_realizacao: e.data_realizacao, url_arquivo: e.url_arquivo })),
    })) as Colaborador[])
    setLoading(false)
  }

  useEffect(() => { if (situacoesDisp.length > 0) buscarColabs(filtroSits) }, [filtroBase, filtroSits])

  const stats = useMemo(() => {
    const r = { no_prazo: 0, critico: 0, atencao: 0, vencido: 0, programado: 0 }
    colabs.forEach(c => { const s = getStatusColaborador(c); if (s === 'no_prazo') r.no_prazo++; else if (s === 'critico') r.critico++; else if (s === 'atencao') r.atencao++; else if (s === 'vencido') r.vencido++; if (temProgramado(c)) r.programado++ })
    return r
  }, [colabs])

  const filtrados = useMemo(() => colabs.filter(c => {
    if (busca) { const b = busca.toLowerCase(); if (!c.nome.toLowerCase().includes(b) && !c.matricula.includes(busca)) return false }
    if (cardAtivo === 'programado') return temProgramado(c)
    if (cardAtivo) return getStatusColaborador(c) === cardAtivo
    return true
  }), [colabs, busca, cardAtivo])

  const ordenados = useMemo(() => [...filtrados].sort((a, b) => {
    let vA: string | number = '', vB: string | number = ''
    switch (ordCol) {
      case 'matricula': vA = a.matricula; vB = b.matricula; break; case 'nome': vA = a.nome; vB = b.nome; break
      case 'base': vA = a.bases?.nome || ''; vB = b.bases?.nome || ''; break; case 'situacao': vA = a.situacao || ''; vB = b.situacao || ''; break
      case 'admissao': vA = a.data_admissao || ''; vB = b.data_admissao || ''; break; case 'funcao': vA = a.funcoes?.nome || ''; vB = b.funcoes?.nome || ''; break
      case 'processo': vA = a.processo || ''; vB = b.processo || ''; break; case 'gse': vA = a.gse ?? 9999; vB = b.gse ?? 9999; break
      case 'aso': { const pA = getASOPrincipal(a); const pB = getASOPrincipal(b); vA = pA ? pA.vencimento : '9999'; vB = pB ? pB.vencimento : '9999'; break }
      case 'dias': { const pA = getASOPrincipal(a); const pB = getASOPrincipal(b); vA = pA ? (calcularDias(pA.vencimento) ?? 9999) : 9999; vB = pB ? (calcularDias(pB.vencimento) ?? 9999) : 9999; break }
    }
    if (vA < vB) return ordDir === 'asc' ? -1 : 1; if (vA > vB) return ordDir === 'asc' ? 1 : -1; return 0
  }), [filtrados, ordCol, ordDir])

  function toggleOrd(c: OrdemColuna) { if (ordCol === c) setOrdDir(d => d === 'asc' ? 'desc' : 'asc'); else { setOrdCol(c); setOrdDir('asc') } }
  const sitsIniciais = useMemo(() => situacoesDisp.filter(s => !SITUACOES_EXCLUIDAS_PADRAO.includes(s)), [situacoesDisp])
  const sitsAlteradas = JSON.stringify([...filtroSits].sort()) !== JSON.stringify([...sitsIniciais].sort())
  const temFiltro = !!(busca || filtroBase || cardAtivo || sitsAlteradas)
  function limpar() { setBusca(''); setFiltroBase(''); setCardAtivo(null); setFiltroSits(sitsIniciais) }

  const sel: React.CSSProperties = { height: 36, border: '1px solid #e0e0e0', borderRadius: 8, padding: '0 10px', fontSize: 13, backgroundColor: 'white', color: '#555' }
  const padCell = compacto ? '4px 10px' : '8px 14px'; const fs = compacto ? 12 : 13
  const tdBase = (ex?: React.CSSProperties): React.CSSProperties => ({ padding: padCell, color: '#666', whiteSpace: 'nowrap', verticalAlign: 'middle', borderBottom: '1px solid #f5f5f5', borderRight: '1px solid #f0f0f0', ...ex })
  const stickyTd = (bg: string, l: number): React.CSSProperties => ({ position: 'sticky', left: l, backgroundColor: bg, zIndex: 10, borderRight: '2px solid #d0d0d0' })
  const CARDS = [
    { key: 'no_prazo' as CardFiltro, label: 'No Prazo', valor: stats.no_prazo, cor: '#16a34a' },
    { key: 'critico' as CardFiltro, label: 'Prazo Crítico', valor: stats.critico, cor: '#a16207' },
    { key: 'atencao' as CardFiltro, label: 'Bernhoeft c/ Atenção', valor: stats.atencao, cor: '#c2410c' },
    { key: 'vencido' as CardFiltro, label: 'Vencidos', valor: stats.vencido, cor: '#dc2626' },
    { key: 'programado' as CardFiltro, label: 'Programado', valor: stats.programado, cor: '#7c3aed' },
  ]
  const thSeparador = (label: string): React.CSSProperties => ({ padding: '10px 12px', fontWeight: 700, whiteSpace: 'nowrap', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#aaa', backgroundColor: '#f5f5f5', borderBottom: '2px solid #e0e0e0', borderRight: '1px solid #e8e8e8', position: 'sticky', top: 0, zIndex: 100, textAlign: 'center' })

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ marginBottom: 12 }}>
        <h1 style={{ fontSize: 18, fontWeight: 600, color: '#1a1a1a', margin: 0 }}>Medicina do Trabalho</h1>
        <p style={{ fontSize: 12, color: '#888', margin: '3px 0 0', fontWeight: 500 }}>Gestão de ASOs e vencimentos periódicos</p>
      </div>

      {/* CARDS */}
      {loading
        ? <div style={{ display: 'flex', gap: 12, marginBottom: 12, overflowX: 'auto', paddingBottom: 4 }}>{[...Array(5)].map((_, i) => <div key={i} style={{ backgroundColor: 'white', borderRadius: 10, padding: '10px 16px', border: '1px solid #f0f0f0', minWidth: 160, flex: '1 0 160px' }}><div style={{ height: 10, backgroundColor: '#f0f0f0', borderRadius: 4, marginBottom: 8, width: '60%' }} /><div style={{ height: 24, backgroundColor: '#f0f0f0', borderRadius: 4, width: '40%' }} /></div>)}</div>
        : <div style={{ display: 'flex', gap: 12, marginBottom: 12, overflowX: 'auto', paddingBottom: 4 }}>
          <div style={{ backgroundColor: 'white', borderRadius: 10, padding: '10px 16px', border: '1px solid #f0f0f0', minWidth: 160, flex: '1 0 160px' }}><p style={{ fontSize: 11, color: '#888', margin: '0 0 4px' }}>Colaboradores</p><p style={{ fontSize: 24, fontWeight: 600, color: '#4a4a49', margin: 0 }}>{filtrados.length.toLocaleString('pt-BR')}</p></div>
          {CARDS.map((card, i) => { const ativo = cardAtivo === card.key; return <div key={i} onClick={() => setCardAtivo(ativo ? null : card.key)} style={{ backgroundColor: ativo ? card.cor + '10' : 'white', borderRadius: 10, padding: '10px 16px', border: ativo ? `2px solid ${card.cor}` : '1px solid #f0f0f0', minWidth: 160, flex: '1 0 160px', cursor: 'pointer', transition: 'all 0.15s ease', boxShadow: ativo ? `0 2px 8px ${card.cor}30` : 'none' }}><p style={{ fontSize: 11, color: '#888', margin: '0 0 4px' }}>{card.label}{ativo && <span style={{ marginLeft: 6, fontSize: 10, color: card.cor }}>● filtrado</span>}</p><p style={{ fontSize: 24, fontWeight: 600, color: card.cor, margin: 0 }}>{card.valor.toLocaleString('pt-BR')}</p></div> })}
        </div>}

      {/* FILTROS */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="text" placeholder="Nome ou matrícula..." value={busca} onChange={e => setBusca(e.target.value)} style={{ ...sel, width: 200, padding: '0 12px' }} />
        <select value={filtroBase} onChange={e => setFiltroBase(e.target.value)} style={{ ...sel, width: 150 }}><option value="">Todas as bases</option>{bases.map(b => <option key={b.id} value={b.id}>{b.nome}</option>)}</select>
        <FiltroSituacao opcoes={situacoesDisp} selecionadas={filtroSits} onChange={setFiltroSits} />
        <div style={{ flex: 1 }} />
        {temFiltro && <button onClick={limpar} style={{ height: 36, padding: '0 12px', fontSize: 12, border: '1px solid #fca5a5', borderRadius: 8, backgroundColor: '#fef2f2', color: '#dc2626', cursor: 'pointer' }}>✕ Limpar</button>}
        <button onClick={() => setExpandido(e => !e)} style={{ height: 36, padding: '0 12px', fontSize: 12, border: `1px solid ${expandido ? COR : '#e0e0e0'}`, borderRadius: 8, backgroundColor: expandido ? '#fdf2f5' : 'white', color: expandido ? COR : '#555', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>{expandido ? '⊟ Recolher' : '⊞ Expandir colunas'}</button>
        <button onClick={() => setCompacto(c => !c)} style={{ height: 36, padding: '0 12px', fontSize: 12, border: `1px solid ${compacto ? COR : '#e0e0e0'}`, borderRadius: 8, backgroundColor: compacto ? '#fdf2f5' : 'white', color: compacto ? COR : '#555', cursor: 'pointer' }}>⊟ Compacto</button>
        <BotaoExportar onClick={t => { const d = gerarExport(ordenados); t === 'csv' ? exportCSV(d) : exportXLSX(d) }} />
      </div>

      {/* TABELA */}
      {loading ? <p style={{ color: '#888', fontSize: 14 }}>Carregando dados da tabela...</p>
        : <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 230px)', borderRadius: 12, border: '1px solid #f0f0f0', flex: 1 }}>
          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, backgroundColor: 'white', fontSize: fs }}>
            <thead>
              <tr style={{ backgroundColor: '#fafafa' }}>
                <Th label="Matrícula" col="matricula" ord={ordCol} dir={ordDir} onClick={toggleOrd} left={0} style={{ width: 110, minWidth: 110 }} />
                <Th label="Nome" col="nome" ord={ordCol} dir={ordDir} onClick={toggleOrd} left={110} style={{ width: COL_NOME, minWidth: COL_NOME }} />
                <Th label="Base" col="base" ord={ordCol} dir={ordDir} onClick={toggleOrd} />
                <Th label="Situação" col="situacao" ord={ordCol} dir={ordDir} onClick={toggleOrd} />
                <Th label="Função" col="funcao" ord={ordCol} dir={ordDir} onClick={toggleOrd} />
                <Th label="Processo" col="processo" ord={ordCol} dir={ordDir} onClick={toggleOrd} />
                <Th label="GSE" col="gse" ord={ordCol} dir={ordDir} onClick={toggleOrd} style={{ textAlign: 'center' }} />
                <Th label="Admissão" col="admissao" ord={ordCol} dir={ordDir} onClick={toggleOrd} />
                <Th label="ASO" col="aso" ord={ordCol} dir={ordDir} onClick={toggleOrd} style={{ textAlign: 'center' }} />
                <Th label="Dias" col="dias" ord={ordCol} dir={ordDir} onClick={toggleOrd} style={{ textAlign: 'center' }} />
                {expandido && <>
                  <th style={thSeparador('ADM')}>ADM</th><th style={thSeparador('PER')}>PER</th><th style={thSeparador('RET')}>RET</th>
                  <th style={thSeparador('MRO')}>MRO</th><th style={thSeparador('DEM')}>DEM</th>
                  {EXAMES_COMPL.map(e => <th key={e.key} style={thSeparador(e.label)}>{e.label}</th>)}
                </>}
              </tr>
            </thead>
            <tbody>
              {ordenados.length === 0
                ? <tr><td colSpan={99} style={{ padding: '40px 20px', textAlign: 'center', color: '#aaa', fontSize: 14 }}>Nenhum colaborador encontrado.</td></tr>
                : ordenados.map((c, i) => {
                  const bg = i % 2 === 0 ? 'white' : '#fafafa'
                  const principal = getASOPrincipal(c)
                  const asoAdm = getASOPorTipo(c.asos, 'admissional'); const asoPer = getASOPorTipo(c.asos, 'periodico')
                  const asoRet = getASOPorTipo(c.asos, 'retorno'); const asoMRO = getASOPorTipo(c.asos, 'mudanca_risco'); const asoDem = getASOPorTipo(c.asos, 'demissional')
                  return (
                    <tr key={c.matricula} style={{ backgroundColor: bg }}>
                      <td style={{ ...tdBase(), ...stickyTd(bg, 0), width: 110, minWidth: 110 }}>{c.matricula}</td>
                      <td style={{ ...tdBase(), ...stickyTd(bg, 110), width: COL_NOME, minWidth: COL_NOME }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontWeight: 500, color: '#333', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: COL_NOME - 40 }}>{c.nome}</span>
                          {podeEditar && <button title="Novo ASO" onClick={e => { e.stopPropagation(); setModalNovo(c) }} style={{ width: 20, height: 20, borderRadius: '50%', backgroundColor: '#f0f0f0', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: '#888', flexShrink: 0, lineHeight: 1 }} onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#fdf2f5'; e.currentTarget.style.color = COR }} onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#f0f0f0'; e.currentTarget.style.color = '#888' }}>+</button>}
                        </div>
                      </td>
                      <td style={tdBase()}>{c.bases?.nome || '—'}</td>
                      <td style={tdBase()}><span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, backgroundColor: c.situacao === 'ATIVO' ? '#f0fdf4' : '#f1f5f9', color: c.situacao === 'ATIVO' ? '#16a34a' : '#64748b' }}>{c.situacao}</span></td>
                      <td style={tdBase()}>{c.funcoes?.nome || '—'}</td>
                      <td style={tdBase()}>{c.processo || '—'}</td>
                      <td style={tdBase({ textAlign: 'center' })}>{c.gse ?? '—'}</td>
                      <td style={tdBase()}>{c.data_admissao ? new Date(c.data_admissao + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}</td>
                      <CelulaASOPrincipal colab={c} compacto={compacto}
                        onClick={() => { if (principal) setModalASO({ colab: c, aso: principal.aso, tipo: principal.aso.tipo, abaInicial: 'info' }) }}
                        onCalendario={() => { if (principal && podeEditar) setModalASO({ colab: c, aso: principal.aso, tipo: principal.aso.tipo, abaInicial: 'programacao' }) }} />
                      <CelulaDias colab={c} compacto={compacto} />
                      {expandido && <>
                        <CelulaASODetalhe aso={asoAdm} tipo="admissional" compacto={compacto} isMaisRecente={principal?.aso === asoAdm} onClick={() => setModalASO({ colab: c, aso: asoAdm, tipo: 'admissional', abaInicial: 'info' })} onCalendario={() => { if (podeEditar) setModalASO({ colab: c, aso: asoAdm, tipo: 'admissional', abaInicial: 'programacao' }) }} />
                        <CelulaASODetalhe aso={asoPer} tipo="periodico" compacto={compacto} isMaisRecente={principal?.aso === asoPer} onClick={() => setModalASO({ colab: c, aso: asoPer, tipo: 'periodico', abaInicial: 'info' })} onCalendario={() => { if (podeEditar) setModalASO({ colab: c, aso: asoPer, tipo: 'periodico', abaInicial: 'programacao' }) }} />
                        <CelulaASODetalhe aso={asoRet} tipo="retorno" compacto={compacto} isMaisRecente={principal?.aso === asoRet} onClick={() => setModalASO({ colab: c, aso: asoRet, tipo: 'retorno', abaInicial: 'info' })} onCalendario={() => { if (podeEditar) setModalASO({ colab: c, aso: asoRet, tipo: 'retorno', abaInicial: 'programacao' }) }} />
                        <CelulaASODetalhe aso={asoMRO} tipo="mudanca_risco" compacto={compacto} isMaisRecente={principal?.aso === asoMRO} onClick={() => setModalASO({ colab: c, aso: asoMRO, tipo: 'mudanca_risco', abaInicial: 'info' })} onCalendario={() => { if (podeEditar) setModalASO({ colab: c, aso: asoMRO, tipo: 'mudanca_risco', abaInicial: 'programacao' }) }} />
                        <CelulaASODetalhe aso={asoDem} tipo="demissional" compacto={compacto} isMaisRecente={principal?.aso === asoDem} onClick={() => setModalASO({ colab: c, aso: asoDem, tipo: 'demissional', abaInicial: 'info' })} onCalendario={() => { if (podeEditar) setModalASO({ colab: c, aso: asoDem, tipo: 'demissional', abaInicial: 'programacao' }) }} />
                        {EXAMES_COMPL.map(e => { const exame = c.exames_compl.find(x => x.nome_exame === e.nome); return <CelulaExameCompl key={e.key} exame={exame} compacto={compacto} onClick={() => { if (podeEditar) setModalExameCompl({ colab: c, nomeExame: e.nome, exame }) }} /> })}
                      </>}
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>}

      {/* MODAIS */}
      {modalASO && <ModalASO dados={{ colab: modalASO.colab, aso: modalASO.aso, tipo: modalASO.tipo }} abaInicial={modalASO.abaInicial} onClose={() => setModalASO(null)} onUpdate={() => buscarColabs(filtroSits)} email={usuario?.email || ''} podeAuditar={usuario?.pode_auditar || false} nivel={usuario?.nivel || 'visualizador'} />}
      {modalNovo && podeEditar && <ModalNovoASO colab={modalNovo} onClose={() => setModalNovo(null)} onSalvo={() => { setModalNovo(null); buscarColabs(filtroSits) }} />}
      {modalExameCompl && podeEditar && <ModalExameCompl colab={modalExameCompl.colab} nomeExame={modalExameCompl.nomeExame} exame={modalExameCompl.exame} onClose={() => setModalExameCompl(null)} onUpdate={() => { setModalExameCompl(null); buscarColabs(filtroSits) }} />}
    </div>
  )
}