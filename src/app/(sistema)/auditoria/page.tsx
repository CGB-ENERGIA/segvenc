'use client'

import { useEffect, useState, useRef, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'

// ─── CONSTANTES ───────────────────────────────────────────────────────────────
const COR = '#9f183c'
const COL_MATRICULA = 110
const COL_NOME = 230
const SITUACOES_EXCLUIDAS_PADRAO = ['DEMITIDO', 'AF.PREVIDÊNCIA', 'LICENÇA MATERNIDADE']

const REGRAS_NR_PO = [
  { id: 5,  nome: 'NR 10-B',             grupo: 'NR' },
  { id: 6,  nome: 'NR 11',               grupo: 'NR' },
  { id: 13, nome: 'NR 12 - II',          grupo: 'NR' },
  { id: 14, nome: 'NR 12 - V',           grupo: 'NR' },
  { id: 15, nome: 'NR 12 - XII',         grupo: 'NR' },
  { id: 8,  nome: 'NR 35',               grupo: 'NR' },
  { id: 1,  nome: 'Direção Defensiva',   grupo: 'PO' },
  { id: 2,  nome: 'Pilotagem Defensiva', grupo: 'PO' },
]

const TIPOS_ASO = [
  { value: 'admissional',   label: 'Admissional', sigla: 'ADM' },
  { value: 'periodico',     label: 'Periódico',   sigla: 'PER' },
  { value: 'retorno',       label: 'Retorno',     sigla: 'RET' },
  { value: 'mudanca_risco', label: 'MRO',         sigla: 'MRO' },
]

// ─── TIPOS ────────────────────────────────────────────────────────────────────
// NOVO: tipo distingue upload de auditoria no histórico
// Requer migration: ALTER TABLE logs_auditoria ADD COLUMN tipo TEXT DEFAULT 'auditoria';
interface LogAuditoria {
  id: string; auditor_email: string; data_auditoria: string
  validado: boolean; observacao: string | null
  tipo?: 'upload' | 'auditoria'
}

interface RegistroNRPO {
  id: string; matricula_colaborador: string; regra_id: number
  data_realizacao: string; data_vencimento: string
  url_arquivo: string | null; logs_auditoria: LogAuditoria[]
  nome_colaborador: string; funcao: string | null
  base: string | null; base_id: number | null; situacao: string
  nome_item: string
}

interface RegistroASO {
  id: string; matricula_colaborador: string; tipo: string
  data_realizacao: string; data_vencimento: string | null
  url_arquivo: string | null; logs_auditoria: LogAuditoria[]
  nome_colaborador: string; funcao: string | null
  base: string | null; base_id: number | null; situacao: string
}

interface Base { id: number; nome: string }
type AbaAtiva = 'nrpo' | 'aso'
type StatusAud = 'aprovado' | 'reprovado' | 'pendente'
type CardFiltro = StatusAud | null
type OrdemDirecao = 'asc' | 'desc'

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function formatarData(d: string | null | undefined): string {
  if (!d) return '—'
  return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR')
}
function calcularDias(dv: string | null): number | null {
  if (!dv) return null
  return Math.ceil((new Date(dv + 'T12:00:00').getTime() - new Date().getTime()) / 86400000)
}

// ATUALIZADO: se o log mais recente for 'upload', status volta a pendente
function getStatusAuditoria(logs: LogAuditoria[]): StatusAud {
  if (!logs || logs.length === 0) return 'pendente'
  const ultima = [...logs].sort((a, b) =>
    new Date(b.data_auditoria).getTime() - new Date(a.data_auditoria).getTime()
  )[0]
  if (ultima.tipo === 'upload') return 'pendente'
  return ultima.validado ? 'aprovado' : 'reprovado'
}

function statusAudCores(s: StatusAud): { bg: string; text: string } {
  if (s === 'aprovado')  return { bg: '#f0fdf4', text: '#16a34a' }
  if (s === 'reprovado') return { bg: '#fef2f2', text: '#dc2626' }
  return { bg: '#f5f5f5', text: '#888' }
}
function statusVencCores(dias: number | null): { bg: string; text: string } {
  if (dias === null) return { bg: 'transparent', text: '#666' }
  if (dias < 0)    return { bg: '#fef2f2', text: '#dc2626' }
  if (dias <= 30)  return { bg: '#fff7ed', text: '#c2410c' }
  if (dias <= 60)  return { bg: '#fefce8', text: '#a16207' }
  return { bg: '#f0fdf4', text: '#15803d' }
}

// HELPER R2: Gera URL Assinada e abre o documento
async function visualizarDocumento(e: React.MouseEvent, urlOuKey: string) {
  e.preventDefault()
  try {
    let key = urlOuKey
    // Tratamento de compatibilidade para os dados antigos
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

// ─── EXPORTAÇÃO ───────────────────────────────────────────────────────────────
function exportCSV(dados: Record<string, string | number>[]) {
  if (!dados.length) return
  const cols = Object.keys(dados[0])
  const csv = [cols.map(h => `"${h}"`).join(';'), ...dados.map(r => cols.map(h => `"${String(r[h] ?? '').replace(/"/g, '""')}"`).join(';'))].join('\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' }))
  a.download = `auditoria-${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.csv`
  a.click()
}
function exportXLSX(dados: Record<string, string | number>[]) {
  if (!dados.length) return
  import('xlsx').then(X => {
    const ws = X.utils.json_to_sheet(dados)
    const wb = X.utils.book_new()
    X.utils.book_append_sheet(wb, ws, 'Auditoria')
    X.writeFile(wb, `auditoria-${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.xlsx`)
  })
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

// ─── BOTÃO EXPORTAR ───────────────────────────────────────────────────────────
function BotaoExportar({ onClick }: { onClick: (t: 'csv' | 'xlsx') => void }) {
  const [open, setOpen] = useState(false); const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h) }, [])
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(!open)} style={{ height: 36, padding: '0 10px', fontSize: 12, border: '1px solid #e0e0e0', borderRadius: 8, backgroundColor: 'white', color: '#555', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
        <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M8 13h2m4 0h2M8 17h2m4 0h2M10 13v4" /></svg>
        <span style={{ fontSize: 10 }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && <div style={{ position: 'absolute', top: 40, right: 0, zIndex: 150, backgroundColor: 'white', border: '1px solid #e0e0e0', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', width: 180, overflow: 'hidden' }}>
        {(['csv', 'xlsx'] as const).map((t, i) => (
          <button key={t} onClick={() => { onClick(t); setOpen(false) }} style={{ width: '100%', padding: '10px 16px', fontSize: 13, textAlign: 'left', border: 'none', background: 'none', cursor: 'pointer', color: '#333', display: 'flex', alignItems: 'center', gap: 10, borderTop: i > 0 ? '1px solid #f0f0f0' : 'none' }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f9f9f9'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
            {t === 'csv' ? '📄 Exportar CSV' : '📊 Exportar Excel'}
          </button>
        ))}
      </div>}
    </div>
  )
}

// ─── TH ORDENÁVEL ─────────────────────────────────────────────────────────────
function Th({ label, col, ord, dir, onClick, left, style }: {
  label: string; col: string; ord: string; dir: OrdemDirecao
  onClick: (c: string) => void; left?: number; style?: React.CSSProperties
}) {
  const ativo = ord === col; const isSticky = left !== undefined
  return (
    <th onClick={() => onClick(col)} style={{
      padding: '10px 12px', textAlign: 'left', fontWeight: 700, whiteSpace: 'nowrap',
      cursor: 'pointer', userSelect: 'none', color: ativo ? COR : '#333',
      borderBottom: ativo ? `2px solid ${COR}` : '2px solid #e0e0e0',
      borderRight: isSticky ? '2px solid #d0d0d0' : '1px solid #e8e8e8',
      position: 'sticky', top: 0, left: isSticky ? left : undefined,
      zIndex: isSticky ? 110 : 100, backgroundColor: '#fafafa', ...style,
    }}>
      {label} {ativo ? (dir === 'asc' ? '↑' : '↓') : <span style={{ color: '#ccc' }}>↕</span>}
    </th>
  )
}

// ─── MODAL AUDITORIA ─────────────────────────────────────────────────────────
function ModalAuditoria({
  titulo, subtitulo, logs, urlArquivo, statusAtual, onClose, onSalvar, onNovoDocumento, podeAuditar
}: {
  titulo: string
  subtitulo: string
  logs: LogAuditoria[]
  urlArquivo: string | null
  statusAtual: StatusAud
  onClose: () => void
  onSalvar: (validado: boolean, obs: string) => Promise<void>
  onNovoDocumento: (file: File) => Promise<void>
  podeAuditar: boolean
}) {
  const [form, setForm] = useState({ validado: true, observacao: '' })
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [arquivoSel, setArquivoSel] = useState<File | null>(null)
  const [uploadando, setUploadando] = useState(false)
  const [erroUpload, setErroUpload] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const auditorias = [...logs].sort((a, b) =>
    new Date(b.data_auditoria).getTime() - new Date(a.data_auditoria).getTime()
  )
  const inp: React.CSSProperties = {
    width: '100%', height: 38, border: '1px solid #e0e0e0', borderRadius: 8,
    padding: '0 12px', fontSize: 13, boxSizing: 'border-box', outline: 'none'
  }

  const coresStatus = statusAudCores(statusAtual)
  const statusLabel: Record<StatusAud, string> = { aprovado: 'Aprovado', reprovado: 'Reprovado', pendente: 'Pendente' }

  async function salvar() {
    if (!form.validado && !form.observacao) { setErro('Informe o motivo da reprovação.'); return }
    setSalvando(true); setErro('')
    await onSalvar(form.validado, form.observacao)
    setSalvando(false)
  }

  async function handleUpload() {
    if (!arquivoSel) return
    setUploadando(true); setErroUpload('')
    try {
      await onNovoDocumento(arquivoSel)
      setArquivoSel(null)
      if (fileRef.current) fileRef.current.value = ''
    } catch {
      setErroUpload('Erro ao enviar o documento. Tente novamente.')
    } finally {
      setUploadando(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}>
      <div style={{ backgroundColor: 'white', borderRadius: 16, width: '100%', maxWidth: 580, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>

        {/* CABEÇALHO */}
        <div style={{ padding: '22px 28px 16px', borderBottom: '1px solid #f0f0f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0, color: '#1a1a1a' }}>Auditar Documento</h2>
              <p style={{ fontSize: 13, color: '#888', margin: '4px 0 8px' }}>{titulo} — {subtitulo}</p>
              <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 99, backgroundColor: coresStatus.bg, color: coresStatus.text, fontWeight: 600, textTransform: 'capitalize', border: `1px solid ${coresStatus.text}30` }}>
                {statusAtual === 'pendente' ? '⏳' : statusAtual === 'aprovado' ? '✓' : '✗'} {statusLabel[statusAtual]}
              </span>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#aaa', marginLeft: 12 }}>✕</button>
          </div>
        </div>

        {/* CORPO */}
        <div style={{ padding: '20px 28px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 18 }}>

          {/* DOCUMENTO ATUAL */}
          {urlArquivo
            ? <a href="#" onClick={(e) => visualizarDocumento(e, urlArquivo)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 14, backgroundColor: '#eff6ff', borderRadius: 10, border: '1px solid #bfdbfe', color: '#2563eb', textDecoration: 'none', fontSize: 13, fontWeight: 500 }}>
                👁 Visualizar documento atual
              </a>
            : <div style={{ padding: 14, backgroundColor: '#fef2f2', borderRadius: 10, border: '1px solid #fecaca' }}>
                <p style={{ fontSize: 13, color: '#b91c1c', margin: 0 }}>⚠️ Nenhum documento anexado.</p>
              </div>
          }

          {/* ALERTA REPROVADO */}
          {statusAtual === 'reprovado' && (
            <div style={{ padding: '10px 14px', backgroundColor: '#fff7ed', borderRadius: 10, border: '1px solid #fed7aa', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 18 }}>⚠️</span>
              <p style={{ fontSize: 13, color: '#9a3412', margin: 0 }}>Documento reprovado. Insira um novo documento para retomar a auditoria.</p>
            </div>
          )}

          {/* INSERIR NOVO DOCUMENTO */}
          {podeAuditar && (
            <div style={{ border: '1px solid #e0e0e0', borderRadius: 12, padding: '14px 16px', backgroundColor: '#fafafa' }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#333', margin: '0 0 10px' }}>📎 Inserir novo documento</p>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={e => setArquivoSel(e.target.files?.[0] || null)}
                  style={{ flex: 1, fontSize: 13, border: '1px solid #e0e0e0', borderRadius: 8, padding: '6px 10px', backgroundColor: 'white' }}
                />
                <button
                  onClick={handleUpload}
                  disabled={!arquivoSel || uploadando}
                  style={{ height: 38, padding: '0 18px', backgroundColor: arquivoSel ? COR : '#e0e0e0', color: arquivoSel ? 'white' : '#aaa', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: arquivoSel ? 'pointer' : 'not-allowed', whiteSpace: 'nowrap', flexShrink: 0 }}>
                  {uploadando ? '⏳ Enviando...' : 'Enviar'}
                </button>
              </div>
              {arquivoSel && !uploadando && (
                <p style={{ fontSize: 11, color: '#888', margin: '6px 0 0' }}>📄 {arquivoSel.name}</p>
              )}
              {erroUpload && (
                <p style={{ fontSize: 12, color: '#b91c1c', margin: '6px 0 0' }}>{erroUpload}</p>
              )}
            </div>
          )}

          {/* SEÇÃO DE AUDITORIA — só aparece se pendente */}
          {podeAuditar && statusAtual === 'pendente' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ height: 1, backgroundColor: '#f0f0f0' }} />
              <p style={{ fontSize: 13, fontWeight: 600, color: '#333', margin: 0 }}>Auditoria</p>

              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#666', marginBottom: 8, fontWeight: 600 }}>Decisão *</label>
                <div style={{ display: 'flex', gap: 12 }}>
                  {[
                    { val: true,  label: 'Aprovar',  cor: '#16a34a', bg: '#f0fdf4' },
                    { val: false, label: 'Reprovar', cor: '#dc2626', bg: '#fef2f2' },
                  ].map(op => (
                    <button key={String(op.val)} onClick={() => setForm(f => ({ ...f, validado: op.val }))}
                      style={{ flex: 1, height: 42, borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', border: form.validado === op.val ? `2px solid ${op.cor}` : '1px solid #e0e0e0', backgroundColor: form.validado === op.val ? op.bg : 'white', color: form.validado === op.val ? op.cor : '#555' }}>
                      {op.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#666', marginBottom: 5, fontWeight: 600 }}>
                  Observação {!form.validado && <span style={{ color: '#dc2626' }}>*</span>}
                </label>
                <textarea value={form.observacao} onChange={e => setForm(f => ({ ...f, observacao: e.target.value }))} placeholder={!form.validado ? 'Informe o motivo...' : 'Opcional...'} rows={3}
                  style={{ ...inp, height: 'auto', padding: '8px 12px', resize: 'none' }} />
              </div>

              {erro && (
                <div style={{ fontSize: 13, color: '#b91c1c', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px' }}>{erro}</div>
              )}
            </div>
          )}

          {/* AVISO SE NÃO PENDENTE */}
          {podeAuditar && statusAtual !== 'pendente' && (
            <p style={{ fontSize: 12, color: '#aaa', fontStyle: 'italic', margin: 0, textAlign: 'center' }}>
              {statusAtual === 'aprovado'
                ? 'Documento aprovado. Envie um novo documento para reabrir a auditoria.'
                : 'Insira um novo documento acima para liberar a auditoria.'}
            </p>
          )}

          {/* HISTÓRICO */}
          {auditorias.length > 0 && (
            <div>
              <div style={{ height: 1, backgroundColor: '#f0f0f0', marginBottom: 14 }} />
              <p style={{ fontSize: 13, fontWeight: 600, color: '#333', margin: '0 0 10px' }}>Histórico</p>
              {auditorias.map((log, i) => {
                const isUpload = log.tipo === 'upload'
                const cor = isUpload ? '#d97706' : (log.validado ? '#16a34a' : '#dc2626')
                const bordaCor = isUpload ? '#f59e0b' : (log.validado ? '#16a34a' : '#dc2626')
                return (
                  <div key={log.id} style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: '10px 14px', marginBottom: 8, borderLeft: `3px solid ${bordaCor}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: cor }}>
                        {isUpload ? '📎 Novo documento enviado' : (log.validado ? '✓ Aprovado' : '✗ Reprovado')}
                        {i === 0 && <span style={{ fontSize: 10, color: '#bbb', marginLeft: 8, fontWeight: 400 }}>mais recente</span>}
                      </span>
                      <span style={{ fontSize: 11, color: '#aaa', flexShrink: 0, marginLeft: 8 }}>{new Date(log.data_auditoria).toLocaleString('pt-BR')}</span>
                    </div>
                    <p style={{ fontSize: 12, color: '#777', margin: '4px 0 0' }}>{log.auditor_email}</p>
                    {log.observacao && (
                      <p style={{ fontSize: 12, color: '#888', margin: '4px 0 0', fontStyle: isUpload ? 'normal' : 'italic' }}>
                        {isUpload ? `Arquivo: ${log.observacao}` : `"${log.observacao}"`}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* RODAPÉ — botão de salvar só aparece se pendente */}
        {podeAuditar && statusAtual === 'pendente' && (
          <div style={{ padding: '16px 28px', borderTop: '1px solid #f0f0f0', display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <button onClick={onClose} style={{ height: 38, padding: '0 20px', border: '1px solid #e0e0e0', borderRadius: 8, fontSize: 13, cursor: 'pointer', background: 'white', color: '#555' }}>Cancelar</button>
            <button onClick={salvar} disabled={salvando} style={{ height: 38, padding: '0 24px', backgroundColor: form.validado ? '#16a34a' : '#dc2626', color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: salvando ? 'not-allowed' : 'pointer', opacity: salvando ? 0.7 : 1 }}>
              {salvando ? 'Salvando...' : form.validado ? 'Confirmar aprovação' : 'Confirmar reprovação'}
            </button>
          </div>
        )}
        {(!podeAuditar || statusAtual !== 'pendente') && (
          <div style={{ padding: '14px 28px', borderTop: '1px solid #f0f0f0', display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={onClose} style={{ height: 38, padding: '0 20px', border: '1px solid #e0e0e0', borderRadius: 8, fontSize: 13, cursor: 'pointer', background: 'white', color: '#555' }}>Fechar</button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── PÁGINA PRINCIPAL ─────────────────────────────────────────────────────────
export default function AuditoriaPage() {
  const router = useRouter(); const { usuario } = useAuth()
  const [abaAtiva, setAbaAtiva] = useState<AbaAtiva>('nrpo')
  const [bases, setBases] = useState<Base[]>([])

  // ── NR/PO ──
  const [registrosNRPO, setRegistrosNRPO] = useState<RegistroNRPO[]>([])
  const [loadingNRPO, setLoadingNRPO] = useState(true)
  const [buscaNRPO, setBuscaNRPO] = useState('')
  const [filtroBaseNRPO, setFiltroBaseNRPO] = useState('')
  const [filtroSitsNRPO, setFiltroSitsNRPO] = useState<string[]>([])
  const [sitsDispNRPO, setSitsDispNRPO] = useState<string[]>([])
  const [filtroTipoNRPO, setFiltroTipoNRPO] = useState('')
  const [cardNRPO, setCardNRPO] = useState<CardFiltro>(null)
  const [ordNRPO, setOrdNRPO] = useState('vencimento')
  const [ordDirNRPO, setOrdDirNRPO] = useState<OrdemDirecao>('asc')
  const [modalNRPO, setModalNRPO] = useState<RegistroNRPO | null>(null)

  // ── ASO ──
  const [registrosASO, setRegistrosASO] = useState<RegistroASO[]>([])
  const [loadingASO, setLoadingASO] = useState(true)
  const [buscaASO, setBuscaASO] = useState('')
  const [filtroBaseASO, setFiltroBaseASO] = useState('')
  const [filtroSitsASO, setFiltroSitsASO] = useState<string[]>([])
  const [sitsDispASO, setSitsDispASO] = useState<string[]>([])
  const [filtroTipoASO, setFiltroTipoASO] = useState('')
  const [cardASO, setCardASO] = useState<CardFiltro>(null)
  const [ordASO, setOrdASO] = useState('data_realizacao')
  const [ordDirASO, setOrdDirASO] = useState<OrdemDirecao>('desc')
  const [modalASO, setModalASO] = useState<RegistroASO | null>(null)

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: b } = await supabase.from('bases').select('id,nome').order('nome')
      setBases(b || [])
      await Promise.all([buscarNRPO(null), buscarASO(null)])
    }
    init()
  }, [])

  // ─── BUSCAR NR/PO ──────────────────────────────────────────────────────────
  async function buscarNRPO(sitsP: string[] | null): Promise<RegistroNRPO[]> {
    const primeiraVez = sitsP === null
    setLoadingNRPO(true)
    let todos: any[] = []; let from = 0
    while (true) {
      const { data } = await supabase.from('registros_exames')
        .select(`id, matricula_colaborador, regra_id, data_realizacao, data_vencimento, url_arquivo, is_atual,
          logs_auditoria(id, auditor_email, data_auditoria, validado, observacao, tipo),
          colaboradores(nome, situacao, bases(id, nome), funcoes(nome))`)
        .eq('is_atual', true)
        .not('url_arquivo', 'is', null)
        .range(from, from + 499)
      if (!data || data.length === 0) break
      todos = [...todos, ...data]; if (data.length < 500) break; from += 500
    }
    if (primeiraVez) {
      const sitsUnicas = [...new Set(todos.map((r: any) => r.colaboradores?.situacao).filter(Boolean))].sort() as string[]
      setSitsDispNRPO(sitsUnicas)
      const sitsIniciais = sitsUnicas.filter(s => !SITUACOES_EXCLUIDAS_PADRAO.includes(s))
      setFiltroSitsNRPO(sitsIniciais)
      todos = todos.filter((r: any) => sitsIniciais.includes(r.colaboradores?.situacao))
    } else if (sitsP && sitsP.length > 0) {
      todos = todos.filter((r: any) => sitsP.includes(r.colaboradores?.situacao))
    }
    const resultado: RegistroNRPO[] = todos.map((r: any) => ({
      id: r.id, matricula_colaborador: r.matricula_colaborador,
      regra_id: r.regra_id, data_realizacao: r.data_realizacao,
      data_vencimento: r.data_vencimento, url_arquivo: r.url_arquivo,
      logs_auditoria: r.logs_auditoria || [],
      nome_colaborador: r.colaboradores?.nome || '—',
      funcao: r.colaboradores?.funcoes?.nome || null,
      base: r.colaboradores?.bases?.nome || null,
      base_id: r.colaboradores?.bases?.id || null,
      situacao: r.colaboradores?.situacao || '',
      nome_item: REGRAS_NR_PO.find(rg => rg.id === r.regra_id)?.nome || String(r.regra_id),
    }))
    setRegistrosNRPO(resultado)
    setLoadingNRPO(false)
    return resultado
  }

  // ─── BUSCAR ASO ────────────────────────────────────────────────────────────
  async function buscarASO(sitsP: string[] | null): Promise<RegistroASO[]> {
    const primeiraVez = sitsP === null
    setLoadingASO(true)
    let asos: any[] = []; let from = 0
    while (true) {
      const { data } = await supabase.from('asos')
        .select('id, matricula_colaborador, tipo, data_realizacao, data_vencimento, url_arquivo, logs_auditoria(id, auditor_email, data_auditoria, validado, observacao, tipo)')
        .not('url_arquivo', 'is', null)
        .in('tipo', ['admissional', 'periodico', 'retorno', 'mudanca_risco'])
        .range(from, from + 499)
      if (!data || data.length === 0) break
      asos = [...asos, ...data]; if (data.length < 500) break; from += 500
    }
    const mats = [...new Set(asos.map((a: any) => a.matricula_colaborador))]
    let colabs: any[] = []
    const LOTE = 100
    for (let i = 0; i < mats.length; i += LOTE) {
      const lote = mats.slice(i, i + LOTE)
      const { data } = await supabase.from('colaboradores').select('matricula, nome, situacao, bases(id, nome), funcoes(nome)').in('matricula', lote)
      if (data) colabs = [...colabs, ...data]
    }
    const colabMap: Record<string, any> = {}
    colabs.forEach(c => { colabMap[c.matricula] = c })
    let todos: RegistroASO[] = asos.map((a: any) => {
      const c = colabMap[a.matricula_colaborador] || {}
      return {
        id: a.id, matricula_colaborador: a.matricula_colaborador,
        tipo: a.tipo, data_realizacao: a.data_realizacao,
        data_vencimento: a.data_vencimento, url_arquivo: a.url_arquivo,
        logs_auditoria: a.logs_auditoria || [],
        nome_colaborador: c.nome || '—', funcao: c.funcoes?.nome || null,
        base: c.bases?.nome || null, base_id: c.bases?.id || null,
        situacao: c.situacao || '',
      }
    })
    if (primeiraVez) {
      const sitsUnicas = [...new Set(todos.map(r => r.situacao).filter(Boolean))].sort() as string[]
      setSitsDispASO(sitsUnicas)
      const sitsIniciais = sitsUnicas.filter(s => !SITUACOES_EXCLUIDAS_PADRAO.includes(s))
      setFiltroSitsASO(sitsIniciais)
      todos = todos.filter(r => sitsIniciais.includes(r.situacao))
    } else if (sitsP && sitsP.length > 0) {
      todos = todos.filter(r => sitsP.includes(r.situacao))
    }
    setRegistrosASO(todos)
    setLoadingASO(false)
    return todos
  }

  useEffect(() => { if (sitsDispNRPO.length > 0) buscarNRPO(filtroSitsNRPO) }, [filtroBaseNRPO, filtroSitsNRPO])
  useEffect(() => { if (sitsDispASO.length > 0) buscarASO(filtroSitsASO) }, [filtroBaseASO, filtroSitsASO])

  // ─── SALVAR AUDITORIA ─────────────────────────────────────────────────────
  async function salvarAuditoriaASO(aso: RegistroASO, validado: boolean, obs: string) {
    await supabase.from('logs_auditoria').insert({
      aso_id: aso.id, auditor_email: usuario?.email || '',
      validado, observacao: obs || null,
      tipo: 'auditoria',
      data_auditoria: new Date().toISOString(),
    })
    const novos = await buscarASO(filtroSitsASO)
    const atualizado = novos.find(r => r.id === aso.id)
    if (atualizado) setModalASO(atualizado); else setModalASO(null)
  }

  async function salvarAuditoriaNRPO(reg: RegistroNRPO, validado: boolean, obs: string) {
    await supabase.from('logs_auditoria').insert({
      registro_id: reg.id, auditor_email: usuario?.email || '',
      validado, observacao: obs || null,
      tipo: 'auditoria',
      data_auditoria: new Date().toISOString(),
    })
    const novos = await buscarNRPO(filtroSitsNRPO)
    const atualizado = novos.find(r => r.id === reg.id)
    if (atualizado) setModalNRPO(atualizado); else setModalNRPO(null)
  }

  // ─── UPLOAD NOVO DOCUMENTO ────────────────────────────────────────────────
  async function uploadNovoDocumentoASO(aso: RegistroASO, file: File) {
    const ext = file.name.split('.').pop() || 'pdf'
    const path = `asos/${aso.matricula_colaborador}/${aso.id}_${Date.now()}.${ext}`

    const formData = new FormData()
    formData.append('file', file)
    formData.append('key', path)

    const res = await fetch('/api/r2/upload', { method: 'POST', body: formData })
    if (!res.ok) throw new Error('Falha no upload do documento')

    // Atualiza arquivo no registro gravando o PATH (chave) no R2
    await supabase.from('asos').update({ url_arquivo: path }).eq('id', aso.id)

    // Gera log de upload → status volta a pendente
    await supabase.from('logs_auditoria').insert({
      aso_id: aso.id,
      auditor_email: usuario?.email || '',
      validado: false,
      tipo: 'upload',
      observacao: file.name,
      data_auditoria: new Date().toISOString(),
    })

    const novos = await buscarASO(filtroSitsASO)
    const atualizado = novos.find(r => r.id === aso.id)
    if (atualizado) setModalASO(atualizado)
  }

  async function uploadNovoDocumentoNRPO(reg: RegistroNRPO, file: File) {
    const ext = file.name.split('.').pop() || 'pdf'
    const path = `nrpo/${reg.matricula_colaborador}/${reg.id}_${Date.now()}.${ext}`

    const formData = new FormData()
    formData.append('file', file)
    formData.append('key', path)

    const res = await fetch('/api/r2/upload', { method: 'POST', body: formData })
    if (!res.ok) throw new Error('Falha no upload do documento')

    // Atualiza arquivo no registro gravando o PATH (chave) no R2
    await supabase.from('registros_exames').update({ url_arquivo: path }).eq('id', reg.id)

    // Gera log de upload → status volta a pendente
    await supabase.from('logs_auditoria').insert({
      registro_id: reg.id,
      auditor_email: usuario?.email || '',
      validado: false,
      tipo: 'upload',
      observacao: file.name,
      data_auditoria: new Date().toISOString(),
    })

    const novos = await buscarNRPO(filtroSitsNRPO)
    const atualizado = novos.find(r => r.id === reg.id)
    if (atualizado) setModalNRPO(atualizado)
  }

  // ─── FILTROS + STATS NR/PO ────────────────────────────────────────────────
  const filtradosNRPO = useMemo(() => {
    let r = registrosNRPO
    if (filtroBaseNRPO) r = r.filter(x => String(x.base_id) === filtroBaseNRPO)
    if (buscaNRPO) { const b = buscaNRPO.toLowerCase(); r = r.filter(x => x.nome_colaborador.toLowerCase().includes(b) || x.matricula_colaborador.includes(buscaNRPO) || x.nome_item.toLowerCase().includes(b)) }
    if (filtroTipoNRPO) r = r.filter(x => x.nome_item === filtroTipoNRPO)
    return r
  }, [registrosNRPO, filtroBaseNRPO, buscaNRPO, filtroTipoNRPO])

  const statsNRPO = useMemo(() => {
    const r = { total: 0, aprovado: 0, reprovado: 0, pendente: 0 }
    filtradosNRPO.forEach(x => { r.total++; r[getStatusAuditoria(x.logs_auditoria)]++ })
    return r
  }, [filtradosNRPO])

  const filtradosNRPOCard = useMemo(() =>
    cardNRPO ? filtradosNRPO.filter(x => getStatusAuditoria(x.logs_auditoria) === cardNRPO) : filtradosNRPO,
    [filtradosNRPO, cardNRPO]
  )

  const ordenadosNRPO = useMemo(() => [...filtradosNRPOCard].sort((a, b) => {
    let vA = '', vB = ''
    if (ordNRPO === 'matricula') { vA = a.matricula_colaborador; vB = b.matricula_colaborador }
    else if (ordNRPO === 'nome') { vA = a.nome_colaborador; vB = b.nome_colaborador }
    else if (ordNRPO === 'base') { vA = a.base || ''; vB = b.base || '' }
    else if (ordNRPO === 'funcao') { vA = a.funcao || ''; vB = b.funcao || '' }
    else if (ordNRPO === 'tipo') { vA = a.nome_item; vB = b.nome_item }
    else if (ordNRPO === 'realizado') { vA = a.data_realizacao; vB = b.data_realizacao }
    else if (ordNRPO === 'vencimento') { vA = a.data_vencimento; vB = b.data_vencimento }
    else if (ordNRPO === 'status') { vA = getStatusAuditoria(a.logs_auditoria); vB = getStatusAuditoria(b.logs_auditoria) }
    return ordDirNRPO === 'asc' ? vA.localeCompare(vB) : vB.localeCompare(vA)
  }), [filtradosNRPOCard, ordNRPO, ordDirNRPO])

  // ─── FILTROS + STATS ASO ──────────────────────────────────────────────────
  const filtradosASO = useMemo(() => {
    let r = registrosASO
    if (filtroBaseASO) r = r.filter(x => String(x.base_id) === filtroBaseASO)
    if (buscaASO) { const b = buscaASO.toLowerCase(); r = r.filter(x => x.nome_colaborador.toLowerCase().includes(b) || x.matricula_colaborador.includes(buscaASO)) }
    if (filtroTipoASO) r = r.filter(x => x.tipo === filtroTipoASO)
    return r
  }, [registrosASO, filtroBaseASO, buscaASO, filtroTipoASO])

  const statsASO = useMemo(() => {
    const r = { total: 0, aprovado: 0, reprovado: 0, pendente: 0 }
    filtradosASO.forEach(x => { r.total++; r[getStatusAuditoria(x.logs_auditoria)]++ })
    return r
  }, [filtradosASO])

  const filtradosASOCard = useMemo(() =>
    cardASO ? filtradosASO.filter(x => getStatusAuditoria(x.logs_auditoria) === cardASO) : filtradosASO,
    [filtradosASO, cardASO]
  )

  const ordenadosASO = useMemo(() => [...filtradosASOCard].sort((a, b) => {
    let vA = '', vB = ''
    if (ordASO === 'matricula') { vA = a.matricula_colaborador; vB = b.matricula_colaborador }
    else if (ordASO === 'nome') { vA = a.nome_colaborador; vB = b.nome_colaborador }
    else if (ordASO === 'base') { vA = a.base || ''; vB = b.base || '' }
    else if (ordASO === 'funcao') { vA = a.funcao || ''; vB = b.funcao || '' }
    else if (ordASO === 'tipo') { vA = a.tipo; vB = b.tipo }
    else if (ordASO === 'data_realizacao') { vA = a.data_realizacao; vB = b.data_realizacao }
    else if (ordASO === 'status') { vA = getStatusAuditoria(a.logs_auditoria); vB = getStatusAuditoria(b.logs_auditoria) }
    return ordDirASO === 'asc' ? vA.localeCompare(vB) : vB.localeCompare(vA)
  }), [filtradosASOCard, ordASO, ordDirASO])

  function toggleOrdNRPO(c: string) { if (ordNRPO === c) setOrdDirNRPO(d => d === 'asc' ? 'desc' : 'asc'); else { setOrdNRPO(c); setOrdDirNRPO('asc') } }
  function toggleOrdASO(c: string) { if (ordASO === c) setOrdDirASO(d => d === 'asc' ? 'desc' : 'asc'); else { setOrdASO(c); setOrdDirASO('asc') } }

  const sitsIniciaisNRPO = useMemo(() => sitsDispNRPO.filter(s => !SITUACOES_EXCLUIDAS_PADRAO.includes(s)), [sitsDispNRPO])
  const sitsIniciaisASO  = useMemo(() => sitsDispASO.filter(s => !SITUACOES_EXCLUIDAS_PADRAO.includes(s)), [sitsDispASO])

  const sel: React.CSSProperties = { height: 36, border: '1px solid #e0e0e0', borderRadius: 8, padding: '0 10px', fontSize: 13, backgroundColor: 'white', color: '#555' }
  const tdBase = (ex?: React.CSSProperties): React.CSSProperties => ({ padding: '8px 14px', color: '#666', whiteSpace: 'nowrap', verticalAlign: 'middle', borderBottom: '1px solid #f5f5f5', borderRight: '1px solid #f0f0f0', ...ex })
  const stickyTd = (bg: string, l: number): React.CSSProperties => ({ position: 'sticky', left: l, backgroundColor: bg, zIndex: 10, borderRight: '2px solid #d0d0d0' })

  const CARDS_LABELS = [
    { key: null as CardFiltro,         label: 'Total Documentos', cor: '#4a4a49', getVal: (s: typeof statsNRPO) => s.total },
    { key: 'aprovado' as CardFiltro,   label: 'Aprovados',        cor: '#16a34a', getVal: (s: typeof statsNRPO) => s.aprovado },
    { key: 'reprovado' as CardFiltro,  label: 'Reprovados',       cor: '#dc2626', getVal: (s: typeof statsNRPO) => s.reprovado },
    { key: 'pendente' as CardFiltro,   label: 'Pendentes',        cor: '#888',    getVal: (s: typeof statsNRPO) => s.pendente },
  ]

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* TÍTULO */}
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 18, fontWeight: 600, color: '#1a1a1a', margin: 0 }}>Auditoria</h1>
        <p style={{ fontSize: 12, color: '#888', margin: '3px 0 0', fontWeight: 500 }}>Validação de documentos com arquivo anexado</p>
      </div>

      {/* ABAS */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '2px solid #f0f0f0' }}>
        {([{ key: 'nrpo', label: 'NR / PO' }, { key: 'aso', label: 'ASO' }] as { key: AbaAtiva; label: string }[]).map(aba => (
          <button key={aba.key} onClick={() => setAbaAtiva(aba.key)} style={{ padding: '10px 20px', fontSize: 14, fontWeight: abaAtiva === aba.key ? 600 : 400, border: 'none', background: 'none', cursor: 'pointer', color: abaAtiva === aba.key ? COR : '#888', borderBottom: abaAtiva === aba.key ? `2px solid ${COR}` : '2px solid transparent', marginBottom: -2, transition: 'all 0.15s' }}>{aba.label}</button>
        ))}
      </div>

      {/* ─── ABA NR/PO ─────────────────────────────────────────────────────── */}
      {abaAtiva === 'nrpo' && (
        <>
          <div style={{ display: 'flex', gap: 12, marginBottom: 12, overflowX: 'auto', paddingBottom: 4 }}>
            {CARDS_LABELS.map((card, i) => {
              const val = card.getVal(statsNRPO); const ativo = cardNRPO === card.key && card.key !== null
              return (
                <div key={i} onClick={() => card.key !== null && setCardNRPO(ativo ? null : card.key)}
                  style={{ backgroundColor: ativo ? card.cor + '10' : 'white', borderRadius: 10, padding: '10px 16px', border: ativo ? `2px solid ${card.cor}` : '1px solid #f0f0f0', minWidth: 160, flex: '1 0 160px', cursor: card.key !== null ? 'pointer' : 'default', transition: 'all 0.15s', boxShadow: ativo ? `0 2px 8px ${card.cor}30` : 'none' }}>
                  <p style={{ fontSize: 11, color: '#888', margin: '0 0 4px' }}>{card.label}{ativo && <span style={{ marginLeft: 6, fontSize: 10, color: card.cor }}>● filtrado</span>}</p>
                  <p style={{ fontSize: 24, fontWeight: 600, color: card.cor, margin: 0 }}>{val.toLocaleString('pt-BR')}</p>
                </div>
              )
            })}
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <input type="text" placeholder="Nome, matrícula ou treinamento..." value={buscaNRPO} onChange={e => setBuscaNRPO(e.target.value)} style={{ ...sel, width: 240, padding: '0 12px' }} />
            <select value={filtroBaseNRPO} onChange={e => setFiltroBaseNRPO(e.target.value)} style={{ ...sel, width: 150 }}>
              <option value="">Todas as bases</option>
              {bases.map(b => <option key={b.id} value={b.id}>{b.nome}</option>)}
            </select>
            <FiltroSituacao opcoes={sitsDispNRPO} selecionadas={filtroSitsNRPO} onChange={setFiltroSitsNRPO} />
            <select value={filtroTipoNRPO} onChange={e => setFiltroTipoNRPO(e.target.value)} style={{ ...sel, width: 160 }}>
              <option value="">Todos os tipos</option>
              {REGRAS_NR_PO.map(r => <option key={r.id} value={r.nome}>{r.nome}</option>)}
            </select>
            <div style={{ flex: 1 }} />
            {(buscaNRPO || filtroBaseNRPO || filtroTipoNRPO || cardNRPO) && (
              <button onClick={() => { setBuscaNRPO(''); setFiltroBaseNRPO(''); setFiltroTipoNRPO(''); setCardNRPO(null); setFiltroSitsNRPO(sitsIniciaisNRPO) }} style={{ height: 36, padding: '0 12px', fontSize: 12, border: '1px solid #fca5a5', borderRadius: 8, backgroundColor: '#fef2f2', color: '#dc2626', cursor: 'pointer' }}>✕ Limpar</button>
            )}
            <BotaoExportar onClick={t => {
              const dados = ordenadosNRPO.map(r => ({ 'Matrícula': r.matricula_colaborador, 'Nome': r.nome_colaborador, 'Base': r.base || '', 'Função': r.funcao || '', 'Tipo': r.nome_item, 'Realizado': formatarData(r.data_realizacao), 'Vencimento': formatarData(r.data_vencimento), 'Status': getStatusAuditoria(r.logs_auditoria) }))
              t === 'csv' ? exportCSV(dados) : exportXLSX(dados)
            }} />
          </div>

          {loadingNRPO ? <p style={{ color: '#888', fontSize: 14 }}>Carregando...</p>
            : <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 270px)', borderRadius: 12, border: '1px solid #f0f0f0', flex: 1 }}>
              <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, backgroundColor: 'white', fontSize: 13 }}>
                <thead>
                  <tr style={{ backgroundColor: '#fafafa' }}>
                    <Th label="Matrícula" col="matricula" ord={ordNRPO} dir={ordDirNRPO} onClick={toggleOrdNRPO} left={0} style={{ width: COL_MATRICULA, minWidth: COL_MATRICULA }} />
                    <Th label="Nome" col="nome" ord={ordNRPO} dir={ordDirNRPO} onClick={toggleOrdNRPO} left={COL_MATRICULA} style={{ width: COL_NOME, minWidth: COL_NOME }} />
                    <Th label="Base" col="base" ord={ordNRPO} dir={ordDirNRPO} onClick={toggleOrdNRPO} />
                    <Th label="Função" col="funcao" ord={ordNRPO} dir={ordDirNRPO} onClick={toggleOrdNRPO} />
                    <Th label="Tipo" col="tipo" ord={ordNRPO} dir={ordDirNRPO} onClick={toggleOrdNRPO} />
                    <Th label="Realizado" col="realizado" ord={ordNRPO} dir={ordDirNRPO} onClick={toggleOrdNRPO} />
                    <Th label="Vencimento" col="vencimento" ord={ordNRPO} dir={ordDirNRPO} onClick={toggleOrdNRPO} />
                    <Th label="Dias" col="dias" ord={ordNRPO} dir={ordDirNRPO} onClick={toggleOrdNRPO} style={{ textAlign: 'center' }} />
                    <th style={{ padding: '10px 12px', fontWeight: 700, color: '#333', whiteSpace: 'nowrap', position: 'sticky', top: 0, backgroundColor: '#fafafa', zIndex: 100, borderBottom: '2px solid #e0e0e0', borderRight: '1px solid #e8e8e8' }}>Arquivo</th>
                    <Th label="Status" col="status" ord={ordNRPO} dir={ordDirNRPO} onClick={toggleOrdNRPO} />
                    <th style={{ padding: '10px 12px', position: 'sticky', top: 0, backgroundColor: '#fafafa', zIndex: 100, borderBottom: '2px solid #e0e0e0' }} />
                  </tr>
                </thead>
                <tbody>
                  {ordenadosNRPO.length === 0
                    ? <tr><td colSpan={11} style={{ padding: '40px 20px', textAlign: 'center', color: '#aaa', fontSize: 14 }}>Nenhum registro encontrado.</td></tr>
                    : ordenadosNRPO.map((r, i) => {
                      const bg = i % 2 === 0 ? 'white' : '#fafafa'
                      const statusAud = getStatusAuditoria(r.logs_auditoria)
                      const coresAud = statusAudCores(statusAud)
                      const dias = calcularDias(r.data_vencimento)
                      const coresVenc = statusVencCores(dias)
                      return (
                        <tr key={r.id} style={{ backgroundColor: bg }}>
                          <td style={{ ...tdBase(), ...stickyTd(bg, 0), width: COL_MATRICULA, minWidth: COL_MATRICULA }}>{r.matricula_colaborador}</td>
                          <td style={{ ...tdBase(), ...stickyTd(bg, COL_MATRICULA), width: COL_NOME, minWidth: COL_NOME }}><span style={{ fontWeight: 500, color: '#333' }}>{r.nome_colaborador}</span></td>
                          <td style={tdBase()}>{r.base || '—'}</td>
                          <td style={tdBase()}>{r.funcao || '—'}</td>
                          <td style={tdBase()}><span style={{ fontSize: 12, fontWeight: 600, color: '#555', backgroundColor: '#f0f0f0', padding: '2px 8px', borderRadius: 6 }}>{r.nome_item}</span></td>
                          <td style={tdBase()}>{formatarData(r.data_realizacao)}</td>
                          <td style={{ ...tdBase(), backgroundColor: coresVenc.bg }}><span style={{ color: coresVenc.text, fontWeight: 500 }}>{formatarData(r.data_vencimento)}</span></td>
                          <td style={{ ...tdBase({ textAlign: 'center' }), backgroundColor: coresVenc.bg }}>
                            {dias !== null ? <span style={{ fontSize: 13, fontWeight: 700, color: coresVenc.text }}>{Math.abs(dias)}<span style={{ fontSize: 10, marginLeft: 2 }}>{dias >= 0 ? 'd' : 'd v.'}</span></span> : '—'}
                          </td>
                          <td style={tdBase()}><a href="#" onClick={(e) => visualizarDocumento(e, r.url_arquivo!)} style={{ color: '#2563eb', fontSize: 12 }}>Ver arquivo</a></td>
                          <td style={tdBase()}><span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, backgroundColor: coresAud.bg, color: coresAud.text, fontWeight: 500, textTransform: 'capitalize' }}>{statusAud}</span></td>
                          <td style={tdBase()}>
                            {usuario?.pode_auditar && (
                              <button onClick={() => setModalNRPO(r)} style={{ fontSize: 12, color: COR, background: 'none', border: `1px solid ${COR}`, borderRadius: 6, padding: '4px 12px', cursor: 'pointer' }}>Auditar</button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                </tbody>
              </table>
            </div>}
        </>
      )}

      {/* ─── ABA ASO ───────────────────────────────────────────────────────── */}
      {abaAtiva === 'aso' && (
        <>
          <div style={{ display: 'flex', gap: 12, marginBottom: 12, overflowX: 'auto', paddingBottom: 4 }}>
            {CARDS_LABELS.map((card, i) => {
              const val = card.getVal(statsASO); const ativo = cardASO === card.key && card.key !== null
              return (
                <div key={i} onClick={() => card.key !== null && setCardASO(ativo ? null : card.key)}
                  style={{ backgroundColor: ativo ? card.cor + '10' : 'white', borderRadius: 10, padding: '10px 16px', border: ativo ? `2px solid ${card.cor}` : '1px solid #f0f0f0', minWidth: 160, flex: '1 0 160px', cursor: card.key !== null ? 'pointer' : 'default', transition: 'all 0.15s', boxShadow: ativo ? `0 2px 8px ${card.cor}30` : 'none' }}>
                  <p style={{ fontSize: 11, color: '#888', margin: '0 0 4px' }}>{card.label}{ativo && <span style={{ marginLeft: 6, fontSize: 10, color: card.cor }}>● filtrado</span>}</p>
                  <p style={{ fontSize: 24, fontWeight: 600, color: card.cor, margin: 0 }}>{val.toLocaleString('pt-BR')}</p>
                </div>
              )
            })}
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <input type="text" placeholder="Nome ou matrícula..." value={buscaASO} onChange={e => setBuscaASO(e.target.value)} style={{ ...sel, width: 220, padding: '0 12px' }} />
            <select value={filtroBaseASO} onChange={e => setFiltroBaseASO(e.target.value)} style={{ ...sel, width: 150 }}>
              <option value="">Todas as bases</option>
              {bases.map(b => <option key={b.id} value={b.id}>{b.nome}</option>)}
            </select>
            <FiltroSituacao opcoes={sitsDispASO} selecionadas={filtroSitsASO} onChange={setFiltroSitsASO} />
            <select value={filtroTipoASO} onChange={e => setFiltroTipoASO(e.target.value)} style={{ ...sel, width: 150 }}>
              <option value="">Todos os tipos</option>
              {TIPOS_ASO.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <div style={{ flex: 1 }} />
            {(buscaASO || filtroBaseASO || filtroTipoASO || cardASO) && (
              <button onClick={() => { setBuscaASO(''); setFiltroBaseASO(''); setFiltroTipoASO(''); setCardASO(null); setFiltroSitsASO(sitsIniciaisASO) }} style={{ height: 36, padding: '0 12px', fontSize: 12, border: '1px solid #fca5a5', borderRadius: 8, backgroundColor: '#fef2f2', color: '#dc2626', cursor: 'pointer' }}>✕ Limpar</button>
            )}
            <BotaoExportar onClick={t => {
              const dados = ordenadosASO.map(r => ({ 'Matrícula': r.matricula_colaborador, 'Nome': r.nome_colaborador, 'Base': r.base || '', 'Função': r.funcao || '', 'Tipo': TIPOS_ASO.find(x => x.value === r.tipo)?.label || r.tipo, 'Realizado': formatarData(r.data_realizacao), 'Vencimento': formatarData(r.data_vencimento), 'Status': getStatusAuditoria(r.logs_auditoria) }))
              t === 'csv' ? exportCSV(dados) : exportXLSX(dados)
            }} />
          </div>

          {loadingASO ? <p style={{ color: '#888', fontSize: 14 }}>Carregando...</p>
            : <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 270px)', borderRadius: 12, border: '1px solid #f0f0f0', flex: 1 }}>
              <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, backgroundColor: 'white', fontSize: 13 }}>
                <thead>
                  <tr style={{ backgroundColor: '#fafafa' }}>
                    <Th label="Matrícula" col="matricula" ord={ordASO} dir={ordDirASO} onClick={toggleOrdASO} left={0} style={{ width: COL_MATRICULA, minWidth: COL_MATRICULA }} />
                    <Th label="Nome" col="nome" ord={ordASO} dir={ordDirASO} onClick={toggleOrdASO} left={COL_MATRICULA} style={{ width: COL_NOME, minWidth: COL_NOME }} />
                    <Th label="Base" col="base" ord={ordASO} dir={ordDirASO} onClick={toggleOrdASO} />
                    <Th label="Função" col="funcao" ord={ordASO} dir={ordDirASO} onClick={toggleOrdASO} />
                    <Th label="Tipo ASO" col="tipo" ord={ordASO} dir={ordDirASO} onClick={toggleOrdASO} />
                    <Th label="Realizado" col="data_realizacao" ord={ordASO} dir={ordDirASO} onClick={toggleOrdASO} />
                    <Th label="Vencimento" col="data_vencimento" ord={ordASO} dir={ordDirASO} onClick={toggleOrdASO} />
                    <th style={{ padding: '10px 12px', fontWeight: 700, color: '#333', whiteSpace: 'nowrap', position: 'sticky', top: 0, backgroundColor: '#fafafa', zIndex: 100, borderBottom: '2px solid #e0e0e0', borderRight: '1px solid #e8e8e8' }}>Arquivo</th>
                    <Th label="Status" col="status" ord={ordASO} dir={ordDirASO} onClick={toggleOrdASO} />
                    <th style={{ padding: '10px 12px', position: 'sticky', top: 0, backgroundColor: '#fafafa', zIndex: 100, borderBottom: '2px solid #e0e0e0' }} />
                  </tr>
                </thead>
                <tbody>
                  {ordenadosASO.length === 0
                    ? <tr><td colSpan={10} style={{ padding: '40px 20px', textAlign: 'center', color: '#aaa', fontSize: 14 }}>Nenhum registro encontrado.</td></tr>
                    : ordenadosASO.map((r, i) => {
                      const bg = i % 2 === 0 ? 'white' : '#fafafa'
                      const statusAud = getStatusAuditoria(r.logs_auditoria)
                      const coresAud = statusAudCores(statusAud)
                      const dias = calcularDias(r.data_vencimento)
                      const coresVenc = statusVencCores(dias)
                      const tipoLabel = TIPOS_ASO.find(t => t.value === r.tipo)?.sigla || r.tipo.toUpperCase().slice(0, 3)
                      return (
                        <tr key={r.id} style={{ backgroundColor: bg }}>
                          <td style={{ ...tdBase(), ...stickyTd(bg, 0), width: COL_MATRICULA, minWidth: COL_MATRICULA }}>{r.matricula_colaborador}</td>
                          <td style={{ ...tdBase(), ...stickyTd(bg, COL_MATRICULA), width: COL_NOME, minWidth: COL_NOME }}><span style={{ fontWeight: 500, color: '#333' }}>{r.nome_colaborador}</span></td>
                          <td style={tdBase()}>{r.base || '—'}</td>
                          <td style={tdBase()}>{r.funcao || '—'}</td>
                          <td style={tdBase()}><span style={{ fontSize: 12, fontWeight: 700, color: COR, backgroundColor: '#fdf2f5', padding: '2px 8px', borderRadius: 6 }}>{tipoLabel}</span></td>
                          <td style={tdBase()}>{formatarData(r.data_realizacao)}</td>
                          <td style={{ ...tdBase(), backgroundColor: r.data_vencimento ? coresVenc.bg : 'transparent' }}><span style={{ color: r.data_vencimento ? coresVenc.text : '#aaa', fontWeight: 500 }}>{formatarData(r.data_vencimento)}</span></td>
                          <td style={tdBase()}><a href="#" onClick={(e) => visualizarDocumento(e, r.url_arquivo!)} style={{ color: '#2563eb', fontSize: 12 }}>Ver arquivo</a></td>
                          <td style={tdBase()}><span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, backgroundColor: coresAud.bg, color: coresAud.text, fontWeight: 500, textTransform: 'capitalize' }}>{statusAud}</span></td>
                          <td style={tdBase()}>
                            {usuario?.pode_auditar && (
                              <button onClick={() => setModalASO(r)} style={{ fontSize: 12, color: COR, background: 'none', border: `1px solid ${COR}`, borderRadius: 6, padding: '4px 12px', cursor: 'pointer' }}>Auditar</button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                </tbody>
              </table>
            </div>}
        </>
      )}

      {/* MODAIS */}
      {modalNRPO && (
        <ModalAuditoria
          titulo={modalNRPO.nome_colaborador}
          subtitulo={modalNRPO.nome_item}
          logs={modalNRPO.logs_auditoria}
          urlArquivo={modalNRPO.url_arquivo}
          statusAtual={getStatusAuditoria(modalNRPO.logs_auditoria)}
          onClose={() => setModalNRPO(null)}
          podeAuditar={usuario?.pode_auditar || false}
          onSalvar={async (v, o) => salvarAuditoriaNRPO(modalNRPO, v, o)}
          onNovoDocumento={async (file) => uploadNovoDocumentoNRPO(modalNRPO, file)}
        />
      )}
      {modalASO && (
        <ModalAuditoria
          titulo={modalASO.nome_colaborador}
          subtitulo={TIPOS_ASO.find(t => t.value === modalASO.tipo)?.label || modalASO.tipo}
          logs={modalASO.logs_auditoria}
          urlArquivo={modalASO.url_arquivo}
          statusAtual={getStatusAuditoria(modalASO.logs_auditoria)}
          onClose={() => setModalASO(null)}
          podeAuditar={usuario?.pode_auditar || false}
          onSalvar={async (v, o) => salvarAuditoriaASO(modalASO, v, o)}
          onNovoDocumento={async (file) => uploadNovoDocumentoASO(modalASO, file)}
        />
      )}
    </div>
  )
}