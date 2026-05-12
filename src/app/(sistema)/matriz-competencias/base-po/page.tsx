'use client'

import { useEffect, useState, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'

// ─── CONSTANTES ───────────────────────────────────────────────────────────────
const COR = '#9f183c'
const TREINAMENTOS_ALVO = ['Direção Defensiva', 'Pilotagem Defensiva']
const COL_MATRICULA = 110
const COL_NOME = 230
const SITUACOES_EXCLUIDAS_PADRAO = ['DEMITIDO', 'AF.PREVIDÊNCIA', 'LICENÇA MATERNIDADE']

// ─── TIPOS ───────────────────────────────────────────────────────────────────
interface Auditoria { id: string; auditor_email: string; data_auditoria: string; validado: boolean; observacao: string | null }
interface Programacao { id: string; data_programada: string; observacao: string | null; criado_por: string; created_at: string }
interface Registro { id: string; regra_id: number; data_realizacao: string; data_vencimento: string; url_arquivo: string | null; logs_auditoria: Auditoria[]; programacoes?: Programacao[] }
interface Colaborador {
  matricula: string; nome: string; funcoes: { nome: string } | null; situacao: string
  bases: { nome: string } | null; data_admissao: string | null; processo: string | null
  gerencia: string | null; supervisor: string | null
  registros_exames: Registro[]
  direcao_defensiva: string | null
  pilotagem_defensiva: string | null
}
interface Treinamento { id: number; nome: string; validade_dias: number }
interface Base { id: number; nome: string }

// mapa nome do treinamento → campo da matriz_po
const CAMPO_MATRIZ: Record<string, 'direcao_defensiva' | 'pilotagem_defensiva'> = {
  'Direção Defensiva':   'direcao_defensiva',
  'Pilotagem Defensiva': 'pilotagem_defensiva',
}

type StatusObrig = 'SIM' | 'NAO' | 'NA'
type OrdemColuna = 'matricula' | 'nome' | 'funcao' | 'processo' | 'base' | 'situacao' | 'gerencia' | 'supervisor' | `exame_${number}`
type OrdemDirecao = 'asc' | 'desc'
type AbaModal = 'info' | 'documento' | 'programacao' | 'auditoria'

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function primeiroNome(s: string | null) { return s ? s.trim().split(' ')[0] : '—' }
function formatarData(d: string | null) { return d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : '—' }
function getStatus(dv: string) {
  const diff = (new Date(dv).getTime() - new Date().getTime()) / 86400000
  return diff < 0 ? 'vencido' : diff <= 30 ? 'proximo' : 'valido'
}
function getDias(dv: string) { return Math.ceil((new Date(dv).getTime() - new Date().getTime()) / 86400000) }

function getObrig(colab: Colaborador, nomeTreinamento: string): StatusObrig {
  const campo = CAMPO_MATRIZ[nomeTreinamento]
  if (!campo) return 'NA'
  const v = (colab[campo] || 'N/A').trim().toUpperCase()
  if (v === 'SIM') return 'SIM'
  if (v === 'NÃO' || v === 'NAO') return 'NAO'
  return 'NA'
}

// Verifica se colaborador é N/A em TODAS as colunas visíveis
function isNACompleto(colab: Colaborador, treinamentos: Treinamento[], colunasVisiveis: string[]) {
  const treinamentosVisiveis = treinamentos.filter(t => colunasVisiveis.includes(`exame_${t.id}`))
  if (treinamentosVisiveis.length === 0) return false
  return treinamentosVisiveis.every(t => getObrig(colab, t.nome) === 'NA')
}

function calcStats(colabs: Colaborador[], treinamentos: Treinamento[]) {
  let v = 0, p = 0, vc = 0
  colabs.forEach(c => {
    treinamentos.forEach(t => {
      if (getObrig(c, t.nome) !== 'SIM') return
      const r = c.registros_exames.find(r => r.regra_id === t.id)
      if (!r) { vc++; return }
      const s = getStatus(r.data_vencimento)
      if (s === 'valido') v++; else if (s === 'proximo') p++; else vc++
    })
  })
  return { validos: v, proximos: p, vencidos: vc }
}

// ─── EXPORTAÇÃO ──────────────────────────────────────────────────────────────
function gerarExport(colabs: Colaborador[], treinamentos: Treinamento[]) {
  return colabs.map(c => {
    const l: Record<string, string> = {
      'Matrícula': c.matricula, 'Nome': c.nome, 'Função': c.funcoes?.nome || '',
      'Processo': c.processo || '', 'Base': c.bases?.nome || '',
      'Situação': c.situacao, 'Gerência': c.gerencia || '', 'Supervisor': c.supervisor || ''
    }
    treinamentos.forEach(t => {
      const obrig = getObrig(c, t.nome)
      if (obrig === 'NA') { l[t.nome] = 'N/A'; return }
      const r = c.registros_exames.find(r => r.regra_id === t.id)
      if (!r) { l[t.nome] = obrig === 'SIM' ? 'Falta fazer' : 'Sem registro'; return }
      const s = getStatus(r.data_vencimento)
      l[`${t.nome} - Vencimento`] = formatarData(r.data_vencimento)
      l[`${t.nome} - Status`] = s === 'valido' ? 'Válido' : s === 'proximo' ? 'A vencer' : 'Vencido'
      l[`${t.nome} - Documento`] = r.url_arquivo ? 'Com documento' : 'Sem documento'
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
  a.download = `base-po-${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.csv`; a.click()
}
function exportXLSX(dados: Record<string, string>[]) {
  if (!dados.length) return
  import('xlsx').then(X => { const ws = X.utils.json_to_sheet(dados); const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, ws, 'BASE PO'); X.writeFile(wb, `base-po-${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.xlsx`) })
}

// ─── FILTRO MULTI-SELECT SITUAÇÃO ─────────────────────────────────────────────
function FiltroSituacao({ opcoes, selecionadas, onChange }: { opcoes: string[]; selecionadas: string[]; onChange: (v: string[]) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [])
  const toggle = (s: string) => onChange(selecionadas.includes(s) ? selecionadas.filter(x => x !== s) : [...selecionadas, s])
  const todas = opcoes.every(o => selecionadas.includes(o))
  let label = 'Todas as situações'
  if (selecionadas.length === 0) label = 'Nenhuma'
  else if (!todas) label = selecionadas.length === 1 ? selecionadas[0] : `${selecionadas.length} situações`
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
              <input type="checkbox" checked={todas} onChange={() => onChange(todas ? [] : opcoes)} style={{ accentColor: COR }} />Todas as situações
            </label>
          </div>
          {opcoes.map(op => (
            <label key={op} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px', fontSize: 12, cursor: 'pointer', backgroundColor: selecionadas.includes(op) ? '#fdf2f5' : 'white', color: selecionadas.includes(op) ? COR : '#555' }}>
              <input type="checkbox" checked={selecionadas.includes(op)} onChange={() => toggle(op)} style={{ accentColor: COR }} />{op}
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
    edit: 'M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z',
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
    zIndex: isSticky ? 110 : 100,
    backgroundColor: '#fafafa',
    ...style,
  }}>
    {label} {ativo ? (dir === 'asc' ? '↑' : '↓') : <span style={{ color: '#ccc' }}>↕</span>}
  </th>
}

// ─── MODAL CONFIRMAR N/A → SIM ────────────────────────────────────────────────
function ModalConfirmarNA({ colab, treinamento, onClose, onConfirmar }: {
  colab: Colaborador; treinamento: Treinamento
  onClose: () => void; onConfirmar: () => void
}) {
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  async function confirmar() {
    setSalvando(true); setErro('')
    const campo = CAMPO_MATRIZ[treinamento.nome]
    if (!campo) { setErro('Campo não encontrado.'); setSalvando(false); return }
    const { error } = await supabase
      .from('matriz_po')
      .upsert({ matricula: colab.matricula, [campo]: 'SIM' }, { onConflict: 'matricula' })
    if (error) { setErro(error.message); setSalvando(false); return }
    setSalvando(false)
    onConfirmar()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 350 }}>
      <div style={{ backgroundColor: 'white', borderRadius: 16, padding: 28, width: '100%', maxWidth: 440, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: '#1a1a1a', margin: '0 0 6px' }}>Alterar para obrigatório?</h2>
          <p style={{ fontSize: 13, color: '#666', margin: 0, lineHeight: 1.5 }}>
            O treinamento <strong>{treinamento.nome}</strong> está marcado como <strong>N/A</strong> para <strong>{colab.nome}</strong>.
          </p>
        </div>
        <div style={{ backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '12px 16px', marginBottom: 20 }}>
          <p style={{ fontSize: 13, color: '#92400e', margin: 0 }}>
            ⚠️ Ao confirmar, o status mudará de <strong>N/A → SIM</strong> e o campo aparecerá como obrigatório para este colaborador. Você poderá registrar o treinamento em seguida.
          </p>
        </div>
        {erro && <p style={{ fontSize: 12, color: '#dc2626', marginBottom: 12 }}>{erro}</p>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} disabled={salvando} style={{ height: 38, padding: '0 18px', border: '1px solid #e0e0e0', borderRadius: 8, fontSize: 13, cursor: 'pointer', background: 'white', color: '#555' }}>Cancelar</button>
          <button onClick={confirmar} disabled={salvando} style={{ height: 38, padding: '0 22px', backgroundColor: COR, color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: salvando ? 'not-allowed' : 'pointer', opacity: salvando ? 0.7 : 1 }}>
            {salvando ? 'Salvando...' : 'Confirmar e registrar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── CÉLULA TREINAMENTO ───────────────────────────────────────────────────────
function CelulaExame({ reg, onClick, onIcone, onClickNA, compacto, obrig }: {
  reg: Registro | undefined; onClick: () => void
  onIcone: (t: 'documento' | 'programacao') => void
  onClickNA: () => void
  compacto: boolean; obrig: StatusObrig
}) {
  const pad = compacto ? '6px 8px' : '8px 12px'; const minW = compacto ? 120 : 150
  const base: React.CSSProperties = { padding: pad, textAlign: 'center', verticalAlign: 'middle', minWidth: minW, borderBottom: '1px solid #f5f5f5', borderRight: '1px solid #f0f0f0' }

  // ── N/A: clicável para mudar para SIM ──────────────────────────────────────
  if (obrig === 'NA') return (
    <td style={{ ...base, background: 'repeating-linear-gradient(45deg,#fdfdfd,#fdfdfd 8px,#efefef 8px,#efefef 16px)', cursor: 'pointer' }}
      onClick={onClickNA} title="N/A — clique para marcar como obrigatório">
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
        <span style={{ fontSize: 11, color: '#bbb', fontStyle: 'italic' }}>N/A</span>
        <Icone tipo="edit" cor="#d0d0d0" size={11} titulo="Clique para alterar" />
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

  const st = getStatus(reg.data_vencimento); const dias = getDias(reg.data_vencimento)
  const temArq = !!reg.url_arquivo
  const aud = [...(reg.logs_auditoria || [])].sort((a, b) => new Date(b.data_auditoria).getTime() - new Date(a.data_auditoria).getTime())[0]
  const prog = [...(reg.programacoes || [])].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
  const bgMap: Record<string, string> = obrig === 'NAO'
    ? { valido: '#f4f4f4', proximo: '#fafafa', vencido: '#fafafa' }
    : { valido: '#f0fdf4', proximo: '#fffbeb', vencido: '#fef2f2' }

  return <td style={{ ...base, backgroundColor: bgMap[st], cursor: 'pointer' }} onClick={onClick}>
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <span style={{ fontSize: compacto ? 10 : 11, color: obrig === 'NAO' ? '#888' : '#555', fontWeight: 500 }}>{formatarData(reg.data_vencimento)}</span>
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

// ─── MODAL NOVO REGISTRO ──────────────────────────────────────────────────────
function ModalNovoExame({ colab, treinamentos, onClose, onUpdate, email, treinamentoPreSelecionado }: {
  colab: Colaborador; treinamentos: Treinamento[]; onClose: () => void; onUpdate: () => void; email: string
  treinamentoPreSelecionado?: number
}) {
  const [form, setForm] = useState({ regra_id: treinamentoPreSelecionado ? String(treinamentoPreSelecionado) : '', data_realizacao: '', data_vencimento: '' })
  const [arquivo, setArquivo] = useState<File | null>(null); const [salvando, setSalvando] = useState(false); const [erro, setErro] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const tSel = treinamentos.find(t => t.id === parseInt(form.regra_id))
  useEffect(() => {
    if (form.regra_id && form.data_realizacao && tSel) {
      const d = new Date(form.data_realizacao + 'T12:00:00'); d.setDate(d.getDate() + tSel.validade_dias)
      setForm(f => ({ ...f, data_vencimento: d.toISOString().split('T')[0] }))
    }
  }, [form.regra_id, form.data_realizacao, tSel])
  async function salvar() {
    if (!form.regra_id || !form.data_realizacao) { setErro('Preencha o treinamento e a data.'); return }
    setSalvando(true); setErro('')
    try {
      await supabase.from('registros_exames').update({ is_atual: false }).eq('matricula_colaborador', colab.matricula).eq('regra_id', parseInt(form.regra_id))
      const { data: novo, error: e } = await supabase.from('registros_exames').insert({ matricula_colaborador: colab.matricula, regra_id: parseInt(form.regra_id), data_realizacao: form.data_realizacao, data_vencimento: form.data_vencimento, is_atual: true }).select().single()
      if (e) throw new Error(e.message)
      if (arquivo && novo) {
        const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19); const ext = arquivo.name.split('.').pop()
        const path = `${colab.matricula}/${form.regra_id}/${ts}.${ext}`
        const { error: se } = await supabase.storage.from('documentos').upload(path, arquivo, { upsert: false })
        if (!se) { const { data: u } = supabase.storage.from('documentos').getPublicUrl(path); await supabase.from('registros_exames').update({ url_arquivo: u.publicUrl }).eq('id', novo.id) }
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
          <div><h2 style={{ fontSize: 16, fontWeight: 600, color: '#1a1a1a', margin: 0 }}>Novo Registro</h2><p style={{ fontSize: 13, color: '#888', margin: '3px 0 0' }}>{colab.nome} · {colab.matricula}</p></div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#aaa' }}>✕</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div><label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>Treinamento *</label>
            <select value={form.regra_id} onChange={e => setForm(f => ({ ...f, regra_id: e.target.value }))} style={inp}>
              <option value="">Selecione...</option>{treinamentos.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div><label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>Data de realização *</label><input type="date" value={form.data_realizacao} onChange={e => setForm(f => ({ ...f, data_realizacao: e.target.value }))} style={inp} /></div>
            <div><label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>Vencimento</label><input type="date" value={form.data_vencimento} onChange={e => setForm(f => ({ ...f, data_vencimento: e.target.value }))} style={{ ...inp, backgroundColor: form.data_vencimento ? '#f0fdf4' : 'white' }} />{form.data_vencimento && <p style={{ fontSize: 11, color: '#16a34a', margin: '3px 0 0' }}>✓ Calculado automaticamente</p>}</div>
          </div>
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

// ─── MODAL EXAME ──────────────────────────────────────────────────────────────
function ModalExame({ dados, abaInicial, onClose, onUpdate, email, podeAuditar, nivel }: {
  dados: { colab: Colaborador; reg: Registro | undefined; treinamento: Treinamento; abaInicial: AbaModal }
  abaInicial: AbaModal; onClose: () => void; onUpdate: () => void; email: string; podeAuditar: boolean; nivel: string
}) {
  const [aba, setAba] = useState<AbaModal>(abaInicial)
  const [progs, setProgs] = useState<Programacao[]>([]); const [loadProgs, setLoadProgs] = useState(false)
  const [formProg, setFormProg] = useState({ data_programada: '', observacao: '' }); const [salvProg, setSalvProg] = useState(false); const [errProg, setErrProg] = useState('')
  const [arquivo, setArquivo] = useState<File | null>(null); const [uploading, setUploading] = useState(false); const [errUp, setErrUp] = useState('')
  const [formAud, setFormAud] = useState({ validado: true, observacao: '' }); const [salvAud, setSalvAud] = useState(false); const [errAud, setErrAud] = useState('')
  const [modalExc, setModalExc] = useState(false); const [confNome, setConfNome] = useState(''); const [excluindo, setExcluindo] = useState(false); const [errExc, setErrExc] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const { colab, reg, treinamento } = dados
  useEffect(() => { if (aba === 'programacao' && reg) loadProgramacoes() }, [aba, reg])
  async function loadProgramacoes() { if (!reg) return; setLoadProgs(true); const { data } = await supabase.from('programacoes_exames').select('*').eq('registro_id', reg.id).order('created_at', { ascending: false }); setProgs(data || []); setLoadProgs(false) }
  async function salvarProg() { if (!reg || !formProg.data_programada) { setErrProg('Informe a data.'); return } setSalvProg(true); setErrProg(''); const { error } = await supabase.from('programacoes_exames').insert({ registro_id: reg.id, matricula_colaborador: colab.matricula, regra_id: treinamento.id, data_programada: formProg.data_programada, observacao: formProg.observacao || null, criado_por: email }); if (error) { setErrProg(error.message); setSalvProg(false); return } setFormProg({ data_programada: '', observacao: '' }); setSalvProg(false); loadProgramacoes(); onUpdate() }
  async function fazerUpload() { if (!arquivo || !reg) return; setUploading(true); setErrUp(''); const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19); const ext = arquivo.name.split('.').pop(); const path = `${colab.matricula}/${treinamento.id}/${ts}.${ext}`; const { error: se } = await supabase.storage.from('documentos').upload(path, arquivo, { upsert: false }); if (se) { setErrUp(se.message); setUploading(false); return }; const { data: u } = supabase.storage.from('documentos').getPublicUrl(path); const { error: de } = await supabase.from('registros_exames').update({ url_arquivo: u.publicUrl }).eq('id', reg.id); if (de) { setErrUp(de.message); setUploading(false); return }; setArquivo(null); setUploading(false); onUpdate(); onClose() }
  async function salvarAud() { if (!reg) return; if (!formAud.validado && !formAud.observacao) { setErrAud('Informe o motivo.'); return } setSalvAud(true); setErrAud(''); const { error } = await supabase.from('logs_auditoria').insert({ registro_id: reg.id, auditor_email: email, validado: formAud.validado, observacao: formAud.observacao || null, data_auditoria: new Date().toISOString() }); if (error) { setErrAud(error.message); setSalvAud(false); return } setSalvAud(false); onUpdate(); onClose() }
  async function excluir() { if (!reg) return; if (confNome !== treinamento.nome) { setErrExc('Nome não confere.'); return } setExcluindo(true); const { error } = await supabase.from('registros_exames').delete().eq('id', reg.id); if (error) { setErrExc(error.message); setExcluindo(false); return } onUpdate(); onClose() }
  const auds = [...(reg?.logs_auditoria || [])].sort((a, b) => new Date(b.data_auditoria).getTime() - new Date(a.data_auditoria).getTime())
  const abas: { key: AbaModal; label: string }[] = [{ key: 'info', label: 'Informações' }, { key: 'documento', label: 'Documento' }, { key: 'programacao', label: 'Programação' }, ...(podeAuditar ? [{ key: 'auditoria' as AbaModal, label: 'Auditoria' }] : [])]
  const inp: React.CSSProperties = { width: '100%', height: 38, border: '1px solid #e0e0e0', borderRadius: 8, padding: '0 12px', fontSize: 13, boxSizing: 'border-box', outline: 'none' }
  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}>
      <div style={{ backgroundColor: 'white', borderRadius: 16, width: '100%', maxWidth: 580, maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ padding: '24px 28px 0', borderBottom: '1px solid #f0f0f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
            <div><h2 style={{ fontSize: 17, fontWeight: 600, color: '#1a1a1a', margin: 0 }}>{treinamento.nome}</h2><p style={{ fontSize: 13, color: '#888', margin: '3px 0 0' }}>{colab.nome} · {colab.matricula}</p></div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#aaa', padding: '0 4px' }}>✕</button>
          </div>
          <div style={{ display: 'flex' }}>{abas.map(a => <button key={a.key} onClick={() => setAba(a.key)} style={{ padding: '8px 16px', fontSize: 13, fontWeight: aba === a.key ? 600 : 400, border: 'none', background: 'none', cursor: 'pointer', color: aba === a.key ? COR : '#888', borderBottom: aba === a.key ? `2px solid ${COR}` : '2px solid transparent', marginBottom: -1 }}>{a.label}</button>)}</div>
        </div>
        <div style={{ padding: '24px 28px', overflowY: 'auto', flex: 1 }}>
          {aba === 'info' && <div>
            {reg ? <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
                {[{ label: 'Realizado em', valor: formatarData(reg.data_realizacao) }, { label: 'Vencimento', valor: formatarData(reg.data_vencimento) }, { label: 'Base', valor: colab.bases?.nome || '—' }, { label: 'Função', valor: colab.funcoes?.nome || '—' }].map((item, i) => <div key={i} style={{ backgroundColor: '#f9f9f9', borderRadius: 8, padding: 12 }}><p style={{ fontSize: 11, color: '#888', margin: '0 0 4px' }}>{item.label}</p><p style={{ fontSize: 14, color: '#333', margin: 0, fontWeight: 500 }}>{item.valor}</p></div>)}
              </div>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#333', margin: '0 0 12px' }}>Últimas auditorias</p>
              {auds.length === 0 ? <p style={{ fontSize: 13, color: '#aaa' }}>Nenhuma auditoria realizada.</p> : auds.slice(0, 3).map((log, i) => <div key={log.id} style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: '10px 14px', marginBottom: 8, borderLeft: `3px solid ${log.validado ? '#16a34a' : '#dc2626'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: 12, fontWeight: 500, color: log.validado ? '#16a34a' : '#dc2626' }}>{log.validado ? '✓ Validado' : '✗ Reprovado'}{i === 0 && <span style={{ fontSize: 10, color: '#aaa', marginLeft: 8 }}>mais recente</span>}</span><span style={{ fontSize: 11, color: '#aaa' }}>{new Date(log.data_auditoria).toLocaleString('pt-BR')}</span></div>
                <p style={{ fontSize: 12, color: '#666', margin: '4px 0 0' }}>{log.auditor_email}</p>
                {log.observacao && <p style={{ fontSize: 12, color: '#666', margin: '4px 0 0', fontStyle: 'italic' }}>"{log.observacao}"</p>}
              </div>)}
              {nivel === 'admin' && <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid #f0f0f0' }}><button onClick={() => { setConfNome(''); setErrExc(''); setModalExc(true) }} style={{ height: 36, padding: '0 16px', fontSize: 12, border: '1px solid #fca5a5', borderRadius: 8, backgroundColor: '#fef2f2', color: '#dc2626', cursor: 'pointer' }}>🗑 Excluir este registro</button></div>}
            </> : <div style={{ textAlign: 'center', padding: '40px 0', color: '#aaa' }}><p style={{ fontSize: 32, margin: '0 0 8px' }}>📋</p><p style={{ fontSize: 14 }}>Nenhum registro encontrado.</p></div>}
          </div>}
          {modalExc && <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 400 }}>
            <div style={{ backgroundColor: 'white', borderRadius: 16, padding: 28, width: '100%', maxWidth: 440, boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, color: '#dc2626', margin: '0 0 8px' }}>Excluir registro</h3>
              <p style={{ fontSize: 13, color: '#555', margin: '0 0 16px', lineHeight: 1.5 }}>Esta ação é <strong>irreversível</strong>. Para confirmar, digite o nome do treinamento:</p>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#333', margin: '0 0 8px', padding: '8px 12px', backgroundColor: '#f9f9f9', borderRadius: 8, borderLeft: '3px solid #dc2626' }}>{treinamento.nome}</p>
              <input type="text" autoFocus value={confNome} onChange={e => setConfNome(e.target.value)} onKeyDown={e => e.key === 'Enter' && excluir()} placeholder="Digite o nome exato..." style={{ width: '100%', height: 38, border: '1px solid #e0e0e0', borderRadius: 8, padding: '0 12px', fontSize: 13, boxSizing: 'border-box', outline: 'none', marginBottom: 8 }} />
              {errExc && <p style={{ fontSize: 12, color: '#dc2626', margin: '0 0 12px' }}>{errExc}</p>}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 12 }}>
                <button onClick={() => setModalExc(false)} style={{ height: 38, padding: '0 18px', border: '1px solid #e0e0e0', borderRadius: 8, fontSize: 13, cursor: 'pointer', background: 'white', color: '#555' }}>Cancelar</button>
                <button onClick={excluir} disabled={excluindo || confNome !== treinamento.nome} style={{ height: 38, padding: '0 22px', backgroundColor: '#dc2626', color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: excluindo || confNome !== treinamento.nome ? 'not-allowed' : 'pointer', opacity: excluindo || confNome !== treinamento.nome ? 0.5 : 1 }}>{excluindo ? 'Excluindo...' : 'Confirmar exclusão'}</button>
              </div>
            </div>
          </div>}
          {aba === 'documento' && <div>
            {reg?.url_arquivo ? <div style={{ marginBottom: 24 }}><p style={{ fontSize: 13, fontWeight: 600, color: '#333', margin: '0 0 12px' }}>Documento atual</p><a href={reg.url_arquivo} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 16, backgroundColor: '#eff6ff', borderRadius: 10, border: '1px solid #bfdbfe', color: '#2563eb', textDecoration: 'none', fontSize: 13, fontWeight: 500 }}><Icone tipo="olho" cor="#2563eb" size={18} />Visualizar documento</a></div>
              : <div style={{ marginBottom: 24, padding: 16, backgroundColor: '#fffbeb', borderRadius: 10, border: '1px solid #fde68a' }}><p style={{ fontSize: 13, color: '#92400e', margin: 0 }}>⚠️ Nenhum documento anexado ainda.</p></div>}
            {!reg && <p style={{ fontSize: 13, color: '#aaa', marginBottom: 16 }}>Registre o treinamento antes de anexar documento.</p>}
            {reg && <><p style={{ fontSize: 13, fontWeight: 600, color: '#333', margin: '0 0 12px' }}>{reg.url_arquivo ? 'Substituir documento' : 'Anexar documento'}</p>
              <div onClick={() => fileRef.current?.click()} style={{ border: '2px dashed #e0e0e0', borderRadius: 10, padding: '28px 20px', textAlign: 'center', cursor: 'pointer', backgroundColor: '#fafafa' }}>
                <Icone tipo="upload" cor="#aaa" size={28} /><p style={{ fontSize: 13, color: '#888', margin: '8px 0 4px' }}>{arquivo ? arquivo.name : 'Clique para selecionar'}</p><p style={{ fontSize: 11, color: '#bbb', margin: 0 }}>PDF, JPG ou PNG · Máx. 10MB</p>
                <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: 'none' }} onChange={e => setArquivo(e.target.files?.[0] || null)} />
              </div>
              {errUp && <p style={{ fontSize: 12, color: '#dc2626', marginTop: 8 }}>{errUp}</p>}
              {arquivo && <button onClick={fazerUpload} disabled={uploading} style={{ width: '100%', marginTop: 16, height: 40, backgroundColor: COR, color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: uploading ? 'not-allowed' : 'pointer', opacity: uploading ? 0.7 : 1 }}>{uploading ? 'Enviando...' : 'Enviar documento'}</button>}
            </>}
          </div>}
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
          {aba === 'auditoria' && podeAuditar && <div>
            {reg?.url_arquivo ? <a href={reg.url_arquivo} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 14, backgroundColor: '#eff6ff', borderRadius: 10, border: '1px solid #bfdbfe', color: '#2563eb', textDecoration: 'none', fontSize: 13, fontWeight: 500, marginBottom: 20 }}><Icone tipo="olho" cor="#2563eb" size={16} />Visualizar documento antes de auditar</a>
              : <div style={{ padding: 14, backgroundColor: '#fef2f2', borderRadius: 10, border: '1px solid #fecaca', marginBottom: 20 }}><p style={{ fontSize: 13, color: '#b91c1c', margin: 0 }}>⚠️ Sem documento. Recomenda-se solicitar antes de auditar.</p></div>}
            <div style={{ marginBottom: 16 }}><label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 8 }}>Decisão *</label>
              <div style={{ display: 'flex', gap: 12 }}>{[{ val: true, label: 'Aprovar', cor: '#16a34a', bg: '#f0fdf4' }, { val: false, label: 'Reprovar', cor: '#dc2626', bg: '#fef2f2' }].map(op => <button key={String(op.val)} onClick={() => setFormAud(f => ({ ...f, validado: op.val }))} style={{ flex: 1, height: 42, borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', border: formAud.validado === op.val ? `2px solid ${op.cor}` : '1px solid #e0e0e0', backgroundColor: formAud.validado === op.val ? op.bg : 'white', color: formAud.validado === op.val ? op.cor : '#555' }}>{op.label}</button>)}</div>
            </div>
            <div style={{ marginBottom: 16 }}><label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>Observação {!formAud.validado && <span style={{ color: '#dc2626' }}>*</span>}</label><textarea value={formAud.observacao} onChange={e => setFormAud(f => ({ ...f, observacao: e.target.value }))} placeholder={!formAud.validado ? 'Informe o motivo...' : 'Opcional...'} rows={3} style={{ ...inp, height: 'auto', padding: '8px 12px', resize: 'none' }} /></div>
            {errAud && <p style={{ fontSize: 12, color: '#dc2626', marginBottom: 12 }}>{errAud}</p>}
            <button onClick={salvarAud} disabled={salvAud || !reg} style={{ width: '100%', height: 40, fontSize: 13, fontWeight: 500, cursor: salvAud || !reg ? 'not-allowed' : 'pointer', border: 'none', borderRadius: 8, opacity: salvAud || !reg ? 0.7 : 1, backgroundColor: formAud.validado ? '#16a34a' : '#dc2626', color: 'white' }}>{salvAud ? 'Salvando...' : formAud.validado ? 'Confirmar aprovação' : 'Confirmar reprovação'}</button>
            {auds.length > 0 && <div style={{ marginTop: 24 }}><p style={{ fontSize: 13, fontWeight: 600, color: '#333', margin: '0 0 12px' }}>Histórico</p>{auds.map((log, i) => <div key={log.id} style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: '10px 14px', marginBottom: 8, borderLeft: `3px solid ${log.validado ? '#16a34a' : '#dc2626'}` }}><div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: 12, fontWeight: 500, color: log.validado ? '#16a34a' : '#dc2626' }}>{log.validado ? '✓ Validado' : '✗ Reprovado'}{i === 0 && <span style={{ fontSize: 10, color: '#aaa', marginLeft: 8 }}>mais recente</span>}</span><span style={{ fontSize: 11, color: '#aaa' }}>{new Date(log.data_auditoria).toLocaleString('pt-BR')}</span></div><p style={{ fontSize: 12, color: '#666', margin: '4px 0 0' }}>{log.auditor_email}</p>{log.observacao && <p style={{ fontSize: 12, color: '#666', margin: '4px 0 0', fontStyle: 'italic' }}>"{log.observacao}"</p>}</div>)}</div>}
          </div>}
        </div>
      </div>
    </div>
  )
}

// ─── PÁGINA PRINCIPAL ─────────────────────────────────────────────────────────
export default function BasePOPage() {
  const router = useRouter(); const { usuario } = useAuth()
  const [colabs, setColabs] = useState<Colaborador[]>([])
  const [treinamentos, setTreinamentos] = useState<Treinamento[]>([])
  const [bases, setBases] = useState<Base[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [filtroBase, setFiltroBase] = useState('')
  const [filtroSits, setFiltroSits] = useState<string[]>([])
  const [situacoesDisp, setSituacoesDisp] = useState<string[]>([])
  const [filtroSup, setFiltroSup] = useState('')
  const [filtroStatus, setFiltroStatus] = useState<'valido' | 'proximo' | 'vencido' | null>(null)
  // Filtro N/A: por padrão oculta colaboradores N/A em todas as colunas visíveis
  const [ocultarNACompleto, setOcultarNACompleto] = useState(true)
  const [compacto, setCompacto] = useState(false)
  const [colunas, setColunas] = useState<string[]>([])
  const [ordCol, setOrdCol] = useState<OrdemColuna>('nome')
  const [ordDir, setOrdDir] = useState<OrdemDirecao>('asc')
  const [modalExame, setModalExame] = useState<{ colab: Colaborador; reg: Registro | undefined; treinamento: Treinamento; abaInicial: AbaModal } | null>(null)
  const [modalNovo, setModalNovo] = useState<{ colab: Colaborador; treinamentoId?: number } | null>(null)
  // Modal confirmar N/A → SIM
  const [modalNA, setModalNA] = useState<{ colab: Colaborador; treinamento: Treinamento } | null>(null)

  const supervisoresDisp = useMemo(() => [...new Set(colabs.map(c => c.supervisor).filter(Boolean) as string[])].sort(), [colabs])

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser(); if (!user) { router.push('/login'); return }
      const [{ data: basesData }, { data: regrasData }] = await Promise.all([
        supabase.from('bases').select('id,nome').order('nome'),
        supabase.from('regras_vencimento').select('id,nome_item,validade_dias').in('nome_item', TREINAMENTOS_ALVO).order('nome_item'),
      ])
      setBases(basesData || [])
      const ts: Treinamento[] = (regrasData || []).map((r: any) => ({ id: r.id, nome: r.nome_item, validade_dias: r.validade_dias }))
      setTreinamentos(ts)
      setColunas(['matricula', 'nome', 'funcao', 'processo', 'base', 'situacao', 'gerencia', 'supervisor', ...ts.map(t => `exame_${t.id}`)])
      await buscarColabs(ts, null)
    }
    init()
  }, [])

  async function buscarColabs(treinamentosP?: Treinamento[], sitsP?: string[] | null) {
    const ts = treinamentosP ?? treinamentos; if (ts.length === 0) return
    const primeiraVez = sitsP === null
    const sitsB = primeiraVez ? [] : (sitsP ?? filtroSits)
    setLoading(true)

    let todos: any[] = []; let from = 0; const ps = 500
    while (true) {
      let q = supabase.from('colaboradores')
        .select('matricula,nome,situacao,data_admissao,processo,gerencia,supervisor,bases(nome),funcoes(nome)')
        .order('nome').range(from, from + ps - 1)
      if (filtroBase) q = q.eq('base_id', filtroBase)
      if (filtroSup)  q = q.eq('supervisor', filtroSup)
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

    const matriculas = todos.map((c: any) => c.matricula)

    // Busca matriz_po
    const { data: matrizData } = matriculas.length > 0
      ? await supabase.from('matriz_po').select('matricula,direcao_defensiva,pilotagem_defensiva').in('matricula', matriculas)
      : { data: [] }
    const matrizMap = Object.fromEntries((matrizData || []).map((m: any) => [m.matricula, m]))

    // Busca registros
    const rids = ts.map(t => t.id)
    const { data: regs } = matriculas.length > 0 && rids.length > 0
      ? await supabase.from('registros_exames')
        .select('id,matricula_colaborador,regra_id,data_realizacao,data_vencimento,url_arquivo,logs_auditoria(id,auditor_email,data_auditoria,validado,observacao),programacoes_exames(id,data_programada,observacao,criado_por,created_at)')
        .eq('is_atual', true).in('regra_id', rids).in('matricula_colaborador', matriculas)
      : { data: [] }

    setColabs(todos.map((c: any) => {
      const mz = matrizMap[c.matricula] || {}
      return {
        ...c,
        direcao_defensiva: mz.direcao_defensiva || 'N/A',
        pilotagem_defensiva: mz.pilotagem_defensiva || 'N/A',
        registros_exames: (regs || [])
          .filter((r: any) => r.matricula_colaborador === c.matricula)
          .map((r: any) => ({ ...r, programacoes: r.programacoes_exames || [] }))
      }
    }) as Colaborador[])
    setLoading(false)
  }

  useEffect(() => { if (treinamentos.length > 0) buscarColabs() }, [filtroBase, filtroSup, filtroSits])

  function toggleOrd(c: OrdemColuna) { if (ordCol === c) setOrdDir(d => d === 'asc' ? 'desc' : 'asc'); else { setOrdCol(c); setOrdDir('asc') } }
  function limpar() { setBusca(''); setFiltroBase(''); setFiltroSup(''); setFiltroStatus(null); setOcultarNACompleto(true); setFiltroSits(situacoesDisp.filter(s => !SITUACOES_EXCLUIDAS_PADRAO.includes(s))) }

  const semStatus = useMemo(() => {
    let lista = colabs.filter(c => {
      if (busca) { const b = busca.toLowerCase(); if (!c.nome.toLowerCase().includes(b) && !c.matricula.includes(busca)) return false }
      return true
    })
    // Filtro N/A: remove colaboradores que são N/A em todas as colunas visíveis
    if (ocultarNACompleto) {
      lista = lista.filter(c => !isNACompleto(c, treinamentos, colunas))
    }
    return lista
  }, [colabs, busca, ocultarNACompleto, treinamentos, colunas])

  const stats = useMemo(() => calcStats(semStatus, treinamentos), [semStatus, treinamentos])

  const filtrados = useMemo(() => {
    if (!filtroStatus) return semStatus
    return semStatus.filter(c => {
      if (filtroStatus === 'valido') return treinamentos.some(t => {
        if (getObrig(c, t.nome) !== 'SIM') return false
        const r = c.registros_exames.find(r => r.regra_id === t.id); if (!r) return false
        return getStatus(r.data_vencimento) === 'valido'
      })
      return treinamentos.some(t => {
        if (getObrig(c, t.nome) !== 'SIM') return false
        const r = c.registros_exames.find(r => r.regra_id === t.id)
        if (!r) return filtroStatus === 'vencido'
        return getStatus(r.data_vencimento) === filtroStatus
      })
    })
  }, [semStatus, filtroStatus, treinamentos])

  const ordenados = useMemo(() => [...filtrados].sort((a, b) => {
    let vA = '', vB = ''
    switch (ordCol) {
      case 'matricula':  vA = a.matricula; vB = b.matricula; break
      case 'nome':       vA = a.nome; vB = b.nome; break
      case 'funcao':     vA = a.funcoes?.nome || ''; vB = b.funcoes?.nome || ''; break
      case 'processo':   vA = a.processo || ''; vB = b.processo || ''; break
      case 'base':       vA = a.bases?.nome || ''; vB = b.bases?.nome || ''; break
      case 'situacao':   vA = a.situacao; vB = b.situacao; break
      case 'gerencia':   vA = a.gerencia || ''; vB = b.gerencia || ''; break
      case 'supervisor': vA = a.supervisor || ''; vB = b.supervisor || ''; break
      default: if (ordCol.startsWith('exame_')) {
        const id = parseInt(ordCol.replace('exame_', ''))
        vA = a.registros_exames.find(r => r.regra_id === id)?.data_vencimento || '9999-99-99'
        vB = b.registros_exames.find(r => r.regra_id === id)?.data_vencimento || '9999-99-99'
      }
    }
    return ordDir === 'asc' ? vA.localeCompare(vB) : vB.localeCompare(vA)
  }), [filtrados, ordCol, ordDir])

  const sitsIniciais = useMemo(() => situacoesDisp.filter(s => !SITUACOES_EXCLUIDAS_PADRAO.includes(s)), [situacoesDisp])
  const sitsAlteradas = JSON.stringify([...filtroSits].sort()) !== JSON.stringify([...sitsIniciais].sort())
  const temFiltro = !!(busca || filtroBase || filtroSup || filtroStatus || sitsAlteradas || !ocultarNACompleto)

  const vis = (k: string) => colunas.includes(k)
  const leftNome = vis('matricula') ? COL_MATRICULA : 0
  const colsDef = [
    { key: 'matricula',  label: 'Matrícula'  },
    { key: 'nome',       label: 'Nome'       },
    { key: 'funcao',     label: 'Função'     },
    { key: 'processo',   label: 'Processo'   },
    { key: 'base',       label: 'Base'       },
    { key: 'situacao',   label: 'Situação'   },
    { key: 'gerencia',   label: 'Gerência'   },
    { key: 'supervisor', label: 'Supervisor' },
    ...treinamentos.map(t => ({ key: `exame_${t.id}`, label: t.nome }))
  ]
  const padCell = compacto ? '4px 10px' : '8px 16px'; const fs = compacto ? 12 : 13
  const sel: React.CSSProperties = { height: 36, border: '1px solid #e0e0e0', borderRadius: 8, padding: '0 10px', fontSize: 13, backgroundColor: 'white', color: '#555' }
  const tdBase = (ex?: React.CSSProperties): React.CSSProperties => ({ padding: padCell, color: '#666', whiteSpace: 'nowrap', verticalAlign: 'middle', borderBottom: '1px solid #f5f5f5', borderRight: '1px solid #f0f0f0', ...ex })
  const stickyTd = (bg: string, l: number): React.CSSProperties => ({ position: 'sticky', left: l, backgroundColor: bg, zIndex: 10, borderRight: '2px solid #d0d0d0' })

  // Após confirmar alteração N/A→SIM, recarrega dados e abre modal de registro
  async function handleConfirmarNA(treinamento: Treinamento, colab: Colaborador) {
    setModalNA(null)
    await buscarColabs()
    // Pequeno delay para garantir que os dados foram atualizados
    setTimeout(() => setModalNovo({ colab, treinamentoId: treinamento.id }), 200)
  }

  return <div style={{ fontFamily: 'Arial, sans-serif', display: 'flex', flexDirection: 'column', height: '100%' }}>
    <div style={{ marginBottom: 12 }}>
      <h1 style={{ fontSize: 18, fontWeight: 600, color: '#1a1a1a', margin: 0 }}>Matriz de Competências</h1>
      <p style={{ fontSize: 12, color: '#888', margin: '3px 0 0', fontWeight: 500 }}>BASE PO — Treinamentos Operacionais</p>
    </div>

    {/* CARDS */}
    {loading || treinamentos.length === 0
      ? <div style={{ display: 'flex', gap: 12, marginBottom: 12, overflowX: 'auto', paddingBottom: 4 }}>
        {[...Array(4)].map((_, i) => <div key={i} style={{ backgroundColor: 'white', borderRadius: 10, padding: '10px 16px', border: '1px solid #f0f0f0', minWidth: 160, flex: '1 0 160px' }}><div style={{ height: 10, backgroundColor: '#f0f0f0', borderRadius: 4, marginBottom: 8, width: '60%' }} /><div style={{ height: 24, backgroundColor: '#f0f0f0', borderRadius: 4, width: '40%' }} /></div>)}
      </div>
      : <div style={{ display: 'flex', gap: 12, marginBottom: 12, overflowX: 'auto', paddingBottom: 4 }}>
        {[
          { label: 'Colaboradores',       valor: filtrados.length, cor: '#4a4a49', status: null },
          { label: 'Treinamentos Válidos', valor: stats.validos,   cor: '#16a34a', status: 'valido'  as const },
          { label: 'Próx. do Vencimento',  valor: stats.proximos,  cor: '#d97706', status: 'proximo' as const },
          { label: 'Falta / Vencidos',     valor: stats.vencidos,  cor: '#dc2626', status: 'vencido' as const },
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
      <FiltroSituacao opcoes={situacoesDisp} selecionadas={filtroSits} onChange={setFiltroSits} />
      <select value={filtroSup} onChange={e => setFiltroSup(e.target.value)} style={{ ...sel, width: 160 }}>
        <option value="">Todos os supervisores</option>{supervisoresDisp.map(s => <option key={s} value={s}>{primeiroNome(s)}</option>)}
      </select>
      {/* Toggle filtro N/A */}
      <button
        onClick={() => setOcultarNACompleto(v => !v)}
        title={ocultarNACompleto ? 'N/A completos ocultos — clique para mostrar' : 'Mostrando N/A completos — clique para ocultar'}
        style={{ height: 36, padding: '0 12px', fontSize: 12, border: `1px solid ${ocultarNACompleto ? '#e0e0e0' : COR}`, borderRadius: 8, backgroundColor: ocultarNACompleto ? 'white' : '#fdf2f5', color: ocultarNACompleto ? '#555' : COR, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
        {ocultarNACompleto ? '⊘ Ocultar N/A' : '◉ Mostrar N/A'}
      </button>
      <div style={{ flex: 1 }} />
      {temFiltro && <button onClick={limpar} style={{ height: 36, padding: '0 12px', fontSize: 12, border: '1px solid #fca5a5', borderRadius: 8, backgroundColor: '#fef2f2', color: '#dc2626', cursor: 'pointer' }}>✕ Limpar</button>}
      <button onClick={() => setCompacto(c => !c)} style={{ height: 36, padding: '0 12px', fontSize: 12, border: `1px solid ${compacto ? COR : '#e0e0e0'}`, borderRadius: 8, backgroundColor: compacto ? '#fdf2f5' : 'white', color: compacto ? COR : '#555', cursor: 'pointer' }}>⊟ Compacto</button>
      {colunas.length > 0 && <SeletorColunas colunas={colsDef} visiveis={colunas} onChange={setColunas} />}
      <BotaoExportar onClick={t => { const d = gerarExport(ordenados, treinamentos); t === 'csv' ? exportCSV(d) : exportXLSX(d) }} />
    </div>

    {/* TABELA */}
    {loading ? <p style={{ color: '#888', fontSize: 14 }}>Carregando dados da tabela...</p>
      : <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 230px)', borderRadius: 12, border: '1px solid #f0f0f0', flex: 1 }}>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, backgroundColor: 'white', fontSize: fs }}>
          <thead>
            <tr style={{ backgroundColor: '#fafafa' }}>
              {vis('matricula')  && <Th label="Matrícula"  col="matricula"  ord={ordCol} dir={ordDir} onClick={toggleOrd} left={0}       style={{ width: COL_MATRICULA, minWidth: COL_MATRICULA }} />}
              {vis('nome')       && <Th label="Nome"       col="nome"       ord={ordCol} dir={ordDir} onClick={toggleOrd} left={leftNome} style={{ width: COL_NOME, minWidth: COL_NOME }} />}
              {vis('funcao')     && <Th label="Função"     col="funcao"     ord={ordCol} dir={ordDir} onClick={toggleOrd} />}
              {vis('processo')   && <Th label="Processo"   col="processo"   ord={ordCol} dir={ordDir} onClick={toggleOrd} />}
              {vis('base')       && <Th label="Base"       col="base"       ord={ordCol} dir={ordDir} onClick={toggleOrd} />}
              {vis('situacao')   && <Th label="Situação"   col="situacao"   ord={ordCol} dir={ordDir} onClick={toggleOrd} />}
              {vis('gerencia')   && <Th label="Gerência"   col="gerencia"   ord={ordCol} dir={ordDir} onClick={toggleOrd} />}
              {vis('supervisor') && <Th label="Supervisor" col="supervisor" ord={ordCol} dir={ordDir} onClick={toggleOrd} />}
              {treinamentos.filter(t => vis(`exame_${t.id}`)).map(t => <Th key={t.id} label={t.nome} col={`exame_${t.id}` as OrdemColuna} ord={ordCol} dir={ordDir} onClick={toggleOrd} style={{ textAlign: 'center' }} />)}
            </tr>
          </thead>
          <tbody>
            {ordenados.length === 0
              ? <tr><td colSpan={99} style={{ padding: '40px 20px', textAlign: 'center', color: '#aaa', fontSize: 14 }}>Nenhum colaborador encontrado.</td></tr>
              : ordenados.map((c, i) => {
                const bg = i % 2 === 0 ? 'white' : '#fafafa'
                return <tr key={c.matricula} style={{ backgroundColor: bg }}>
                  {vis('matricula') && <td style={{ ...tdBase(), ...stickyTd(bg, 0), width: COL_MATRICULA, minWidth: COL_MATRICULA }}>{c.matricula}</td>}
                  {vis('nome') && <td style={{ ...tdBase(), ...stickyTd(bg, leftNome), width: COL_NOME, minWidth: COL_NOME }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontWeight: 500, color: '#333', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: COL_NOME - 40 }}>{c.nome}</span>
                      <button title="Novo registro" onClick={e => { e.stopPropagation(); setModalNovo({ colab: c }) }}
                        style={{ width: 20, height: 20, borderRadius: '50%', backgroundColor: '#f0f0f0', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: '#888', flexShrink: 0, lineHeight: 1 }}
                        onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#fdf2f5'; e.currentTarget.style.color = COR }}
                        onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#f0f0f0'; e.currentTarget.style.color = '#888' }}>+</button>
                    </div>
                  </td>}
                  {vis('funcao')     && <td style={tdBase()}>{c.funcoes?.nome || '—'}</td>}
                  {vis('processo')   && <td style={tdBase()}>{c.processo || '—'}</td>}
                  {vis('base')       && <td style={tdBase()}>{c.bases?.nome || '—'}</td>}
                  {vis('situacao')   && <td style={tdBase()}><span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, backgroundColor: c.situacao === 'ATIVO' ? '#f0fdf4' : '#fef2f2', color: c.situacao === 'ATIVO' ? '#16a34a' : '#dc2626' }}>{c.situacao}</span></td>}
                  {vis('gerencia')   && <td style={tdBase()}>{c.gerencia ? <span style={{ fontSize: compacto ? 11 : 12, padding: '2px 8px', borderRadius: 99, backgroundColor: '#f0f0f0', color: '#444', fontWeight: 500 }}>{c.gerencia}</span> : '—'}</td>}
                  {vis('supervisor') && <td style={tdBase({ fontSize: compacto ? 11 : 12 })} title={c.supervisor || ''}>{primeiroNome(c.supervisor)}</td>}
                  {treinamentos.filter(t => vis(`exame_${t.id}`)).map(t => {
                    const reg = c.registros_exames.find(r => r.regra_id === t.id)
                    const obrig = getObrig(c, t.nome)
                    return <CelulaExame key={t.id} reg={reg} compacto={compacto} obrig={obrig}
                      onClick={() => setModalExame({ colab: c, reg, treinamento: t, abaInicial: 'info' })}
                      onIcone={tipo => setModalExame({ colab: c, reg, treinamento: t, abaInicial: tipo === 'documento' ? 'documento' : 'programacao' })}
                      onClickNA={() => setModalNA({ colab: c, treinamento: t })}
                    />
                  })}
                </tr>
              })}
          </tbody>
        </table>
      </div>}

    {/* MODAIS */}
    {modalExame && <ModalExame dados={modalExame} abaInicial={modalExame.abaInicial} onClose={() => setModalExame(null)} onUpdate={() => buscarColabs(treinamentos)} email={usuario?.email || ''} podeAuditar={usuario?.pode_auditar || false} nivel={usuario?.nivel || 'visualizador'} />}
    {modalNovo && <ModalNovoExame colab={modalNovo.colab} treinamentos={treinamentos} treinamentoPreSelecionado={modalNovo.treinamentoId} onClose={() => setModalNovo(null)} onUpdate={() => buscarColabs(treinamentos)} email={usuario?.email || ''} />}
    {modalNA && <ModalConfirmarNA colab={modalNA.colab} treinamento={modalNA.treinamento} onClose={() => setModalNA(null)} onConfirmar={() => handleConfirmarNA(modalNA.treinamento, modalNA.colab)} />}
  </div>
}