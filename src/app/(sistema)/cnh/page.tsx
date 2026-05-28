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
const CATEGORIAS = ['A', 'B', 'C', 'D', 'E']

// ─── TIPOS ────────────────────────────────────────────────────────────────────
interface CNH {
  id: string
  matricula_colaborador: string
  numero_cnh: string | null
  categoria: string | null
  exigencia: string
  data_emissao: string | null
  data_vencimento: string | null
  is_atual: boolean
  url_arquivo: string | null
  observacao: string | null
  created_at: string
}

interface ColabCNH {
  matricula: string
  nome: string
  situacao: string
  base: string | null
  gerencia: string | null
  supervisor: string | null
  funcao: string | null
  processo: string | null
  cnh: CNH | null
}

interface Base { id: number; nome: string }

type StatusCNH = 'no_prazo' | 'proximo' | 'vencido' | 'sem_cnh' | 'na'
type CardFiltro = StatusCNH | null
type OrdemColuna = 'matricula' | 'nome' | 'base' | 'situacao' | 'gerencia' | 'supervisor' | 'funcao' | 'categoria' | 'exigencia' | 'vencimento' | 'dias'
type OrdemDirecao = 'asc' | 'desc'
type AbaModal = 'info' | 'documento'

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function formatarData(d: string | null | undefined): string {
  if (!d) return '—'
  return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR')
}
function calcularDias(dv: string | null): number | null {
  if (!dv) return null
  return Math.ceil((new Date(dv + 'T12:00:00').getTime() - new Date().getTime()) / 86400000)
}
function getStatusCNH(cnh: CNH | null): StatusCNH {
  if (!cnh) return 'sem_cnh'
  if (!cnh.numero_cnh && cnh.exigencia === 'SIM') return 'sem_cnh'
  if (!cnh.numero_cnh) return 'na'
  const dias = calcularDias(cnh.data_vencimento)
  if (dias === null) return 'no_prazo'
  if (dias < 0) return 'vencido'
  if (dias <= 30) return 'proximo'
  return 'no_prazo'
}
function statusCores(s: StatusCNH): { bg: string; text: string } {
  if (s === 'no_prazo') return { bg: '#dcfce7', text: '#15803d' }
  if (s === 'proximo')  return { bg: '#ffedd5', text: '#c2410c' }
  if (s === 'vencido')  return { bg: '#fee2e2', text: '#dc2626' }
  if (s === 'na')       return { bg: '#f1f5f9', text: '#94a3b8' }
  return { bg: '#f1f5f9', text: '#64748b' }
}
function statusLabel(s: StatusCNH): string {
  if (s === 'no_prazo') return 'No Prazo'
  if (s === 'proximo')  return 'Próximo do Vencimento'
  if (s === 'vencido')  return 'Vencido'
  if (s === 'na')       return 'N/A'
  return 'Sem CNH'
}
function primeiroNome(s: string | null) { return s ? s.trim().split(' ')[0] : '—' }

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

// ─── EXPORTAÇÃO ───────────────────────────────────────────────────────────────
function gerarExport(colabs: ColabCNH[]) {
  return colabs.map(c => ({
    'Matrícula': c.matricula,
    'Nome': c.nome,
    'Base': c.base || '',
    'Situação': c.situacao,
    'Gerência': c.gerencia || '',
    'Coordenador': c.supervisor || '',
    'Função': c.funcao || '',
    'Nº CNH': c.cnh?.numero_cnh || '',
    'Categoria': c.cnh?.categoria || '',
    'Exigência': c.cnh?.exigencia || '',
    'Emissão': formatarData(c.cnh?.data_emissao),
    'Vencimento': formatarData(c.cnh?.data_vencimento),
    'Status': statusLabel(getStatusCNH(c.cnh)),
    'Dias Restantes': calcularDias(c.cnh?.data_vencimento ?? null) ?? '',
  }))
}
function exportCSV(dados: Record<string, string | number>[]) {
  if (!dados.length) return
  const cols = Object.keys(dados[0])
  const csv = [cols.map(h => `"${h}"`).join(';'), ...dados.map(r => cols.map(h => `"${String(r[h] ?? '').replace(/"/g, '""')}"`).join(';'))].join('\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' }))
  a.download = `cnh-${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.csv`
  a.click()
}
function exportXLSX(dados: Record<string, string | number>[]) {
  if (!dados.length) return
  import('xlsx').then(X => {
    const ws = X.utils.json_to_sheet(dados)
    const wb = X.utils.book_new()
    X.utils.book_append_sheet(wb, ws, 'CNH')
    X.writeFile(wb, `cnh-${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.xlsx`)
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
  label: string; col: OrdemColuna; ord: OrdemColuna; dir: OrdemDirecao
  onClick: (c: OrdemColuna) => void; left?: number; style?: React.CSSProperties
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

// ─── ÍCONE ────────────────────────────────────────────────────────────────────
function Icone({ tipo, cor, size = 16 }: { tipo: string; cor: string; size?: number }) {
  const paths: Record<string, string> = {
    upload: 'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12',
    olho: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 9a3 3 0 100 6 3 3 0 000-6z',
    plus: 'M12 5v14M5 12h14',
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={cor} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}>
      <path d={paths[tipo] || ''} />
    </svg>
  )
}

// ─── MODAL CNH ────────────────────────────────────────────────────────────────
function ModalCNH({ colab, cnh, onClose, onUpdate, nivel }: {
  colab: ColabCNH; cnh: CNH | null
  onClose: () => void; onUpdate: () => void; nivel: string
}) {
  const [aba, setAba] = useState<AbaModal>('info')
  const [form, setForm] = useState({
    numero_cnh: cnh?.numero_cnh || '',
    categoria: cnh?.categoria?.split(',').map(c => c.trim()) || [] as string[],
    exigencia: cnh?.exigencia || 'N/A',
    data_emissao: cnh?.data_emissao || '',
    data_vencimento: cnh?.data_vencimento || '',
    observacao: cnh?.observacao || '',
  })
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [salvando, setSalvando] = useState(false); const [erro, setErro] = useState('')
  const [excluindo, setExcluindo] = useState(false); const [confirmaExc, setConfirmaExc] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  function toggleCategoria(cat: string) {
    setForm(f => ({
      ...f,
      categoria: f.categoria.includes(cat) ? f.categoria.filter(c => c !== cat) : [...f.categoria, cat]
    }))
  }

  async function salvar() {
    setSalvando(true); setErro('')
    try {
      let urlArquivo: string | null = cnh?.url_arquivo || null
      
      // Upload R2
      if (arquivo) {
        const ext = arquivo.name.split('.').pop()
        const path = `cnhs/${colab.matricula}/${Date.now()}.${ext}`
        
        const formData = new FormData()
        formData.append('file', arquivo)
        formData.append('key', path)
        
        const res = await fetch('/api/r2/upload', { method: 'POST', body: formData })
        if (!res.ok) throw new Error('Falha no upload do documento')
        
        urlArquivo = path
      }

      const payload = {
        matricula_colaborador: colab.matricula,
        numero_cnh: form.numero_cnh || null,
        categoria: form.categoria.sort((a, b) => 'ABCDE'.indexOf(a) - 'ABCDE'.indexOf(b)).join('') || null,
        exigencia: form.exigencia,
        data_emissao: form.data_emissao || null,
        data_vencimento: form.data_vencimento || null,
        observacao: form.observacao || null,
        url_arquivo: urlArquivo,
        is_atual: true,
      }
      if (cnh) {
        const { error } = await supabase.from('cnhs').update(payload).eq('id', cnh.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('cnhs').insert(payload)
        if (error) throw error
      }
      onUpdate(); onClose()
    } catch (e: any) { setErro(e.message || 'Erro ao salvar') }
    setSalvando(false)
  }

  async function excluir() {
    if (!cnh) return
    setExcluindo(true)
    const { error } = await supabase.from('cnhs').delete().eq('id', cnh.id)
    if (error) { setErro(error.message); setExcluindo(false); return }
    onUpdate(); onClose()
  }

  const inp: React.CSSProperties = { width: '100%', height: 38, border: '1px solid #e0e0e0', borderRadius: 8, padding: '0 12px', fontSize: 13, boxSizing: 'border-box', outline: 'none', backgroundColor: 'white' }
  const status = getStatusCNH(cnh)
  const cores = statusCores(status)
  const dias = calcularDias(cnh?.data_vencimento ?? null)

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}>
      <div style={{ backgroundColor: 'white', borderRadius: 16, width: '100%', maxWidth: 520, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>

        {/* Header */}
        <div style={{ padding: '24px 28px 0', borderBottom: '1px solid #f0f0f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
            <div>
              <h2 style={{ fontSize: 17, fontWeight: 600, color: '#1a1a1a', margin: 0 }}>CNH — {cnh ? 'Editar' : 'Novo registro'}</h2>
              <p style={{ fontSize: 13, color: '#888', margin: '3px 0 0' }}>{colab.nome} · {colab.matricula}</p>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#aaa', padding: '0 4px' }}>✕</button>
          </div>
          <div style={{ display: 'flex' }}>
            {([{ key: 'info', label: 'Informações' }, { key: 'documento', label: 'Documento' }] as { key: AbaModal; label: string }[]).map(a => (
              <button key={a.key} onClick={() => setAba(a.key)} style={{ padding: '8px 16px', fontSize: 13, fontWeight: aba === a.key ? 600 : 400, border: 'none', background: 'none', cursor: 'pointer', color: aba === a.key ? COR : '#888', borderBottom: aba === a.key ? `2px solid ${COR}` : '2px solid transparent', marginBottom: -1 }}>{a.label}</button>
            ))}
          </div>
        </div>

        {/* Conteúdo */}
        <div style={{ padding: '24px 28px', overflowY: 'auto', flex: 1 }}>

          {aba === 'info' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              {/* Status badge se tiver CNH */}
              {cnh && dias !== null && (
                <div style={{ padding: '10px 14px', borderRadius: 10, backgroundColor: cores.bg, border: `1px solid ${cores.text}30` }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: cores.text }}>{statusLabel(status)}</span>
                  <span style={{ fontSize: 12, color: cores.text, marginLeft: 8 }}>({dias > 0 ? `${dias} dias restantes` : `${Math.abs(dias)} dias vencida`})</span>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div><label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>Nº CNH</label>
                  <input value={form.numero_cnh} onChange={e => setForm(f => ({ ...f, numero_cnh: e.target.value }))} style={inp} placeholder="Ex: 12345678901" />
                </div>
                <div><label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>Exigência</label>
                  <select value={form.exigencia} onChange={e => setForm(f => ({ ...f, exigencia: e.target.value }))} style={inp}>
                    <option value="SIM">SIM</option>
                    <option value="N/A">N/A</option>
                  </select>
                </div>
              </div>

              {/* Categoria com checkboxes */}
              <div>
                <label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 8 }}>Categoria</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {CATEGORIAS.map(cat => (
                    <label key={cat} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', border: `1px solid ${form.categoria.includes(cat) ? COR : '#e0e0e0'}`, borderRadius: 8, cursor: 'pointer', backgroundColor: form.categoria.includes(cat) ? '#fdf2f5' : 'white', fontSize: 13, fontWeight: form.categoria.includes(cat) ? 600 : 400, color: form.categoria.includes(cat) ? COR : '#555', userSelect: 'none' }}>
                      <input type="checkbox" checked={form.categoria.includes(cat)} onChange={() => toggleCategoria(cat)} style={{ display: 'none' }} />
                      {cat}
                    </label>
                  ))}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div><label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>Data de Emissão</label>
                  <input type="date" value={form.data_emissao} onChange={e => setForm(f => ({ ...f, data_emissao: e.target.value }))} style={inp} />
                </div>
                <div><label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>Vencimento *</label>
                  <input type="date" value={form.data_vencimento} onChange={e => setForm(f => ({ ...f, data_vencimento: e.target.value }))} style={inp} />
                </div>
              </div>

              <div><label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>Observação <span style={{ color: '#aaa' }}>(opcional)</span></label>
                <textarea value={form.observacao} onChange={e => setForm(f => ({ ...f, observacao: e.target.value }))} rows={2} placeholder="Opcional" style={{ ...inp, height: 'auto', padding: '8px 12px', resize: 'none' }} />
              </div>

              {erro && <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '8px 12px' }}><p style={{ fontSize: 12, color: '#dc2626', margin: 0 }}>{erro}</p></div>}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                {cnh && nivel === 'admin' && (
                  confirmaExc
                    ? <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => setConfirmaExc(false)} style={{ height: 36, padding: '0 14px', fontSize: 12, border: '1px solid #e0e0e0', borderRadius: 8, background: 'white', color: '#555', cursor: 'pointer' }}>Cancelar</button>
                        <button onClick={excluir} disabled={excluindo} style={{ height: 36, padding: '0 14px', fontSize: 12, border: 'none', borderRadius: 8, backgroundColor: '#dc2626', color: 'white', cursor: 'pointer' }}>{excluindo ? 'Excluindo...' : 'Confirmar exclusão'}</button>
                      </div>
                    : <button onClick={() => setConfirmaExc(true)} style={{ height: 36, padding: '0 14px', fontSize: 12, border: '1px solid #fca5a5', borderRadius: 8, backgroundColor: '#fef2f2', color: '#dc2626', cursor: 'pointer' }}>🗑 Excluir</button>
                )}
                <div style={{ display: 'flex', gap: 10, marginLeft: 'auto' }}>
                  <button onClick={onClose} style={{ height: 38, padding: '0 18px', border: '1px solid #e0e0e0', borderRadius: 8, fontSize: 13, cursor: 'pointer', background: 'white', color: '#555' }}>Cancelar</button>
                  <button onClick={salvar} disabled={salvando} style={{ height: 38, padding: '0 22px', backgroundColor: COR, color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: salvando ? 'not-allowed' : 'pointer', opacity: salvando ? 0.7 : 1 }}>{salvando ? 'Salvando...' : 'Salvar'}</button>
                </div>
              </div>
            </div>
          )}

          {aba === 'documento' && (
  <div>
    {cnh?.url_arquivo
      ? <div style={{ marginBottom: 24 }}><p style={{ fontSize: 13, fontWeight: 600, color: '#333', margin: '0 0 12px' }}>Documento atual</p>
          <a href="#" onClick={(e) => visualizarDocumento(e, cnh.url_arquivo!)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 16, backgroundColor: '#eff6ff', borderRadius: 10, border: '1px solid #bfdbfe', color: '#2563eb', textDecoration: 'none', fontSize: 13, fontWeight: 500 }}>
            <Icone tipo="olho" cor="#2563eb" size={18} />Visualizar documento
          </a>
        </div>
      : <div style={{ marginBottom: 24, padding: 16, backgroundColor: '#fffbeb', borderRadius: 10, border: '1px solid #fde68a' }}><p style={{ fontSize: 13, color: '#92400e', margin: 0 }}>⚠️ Nenhum documento anexado ainda.</p></div>}

    {nivel !== 'visualizador' && (
      <>
        <p style={{ fontSize: 13, fontWeight: 600, color: '#333', margin: '0 0 12px' }}>{cnh?.url_arquivo ? 'Substituir documento' : 'Anexar documento'}</p>
        <div onClick={() => fileRef.current?.click()} style={{ border: '2px dashed #e0e0e0', borderRadius: 10, padding: '28px 20px', textAlign: 'center', cursor: 'pointer', backgroundColor: '#fafafa' }}>
          <Icone tipo="upload" cor="#aaa" size={28} />
          <p style={{ fontSize: 13, color: '#888', margin: '8px 0 4px' }}>{arquivo ? arquivo.name : 'Clique para selecionar'}</p>
          <p style={{ fontSize: 11, color: '#bbb', margin: 0 }}>PDF, JPG ou PNG · Máx. 10MB</p>
          <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: 'none' }} onChange={e => setArquivo(e.target.files?.[0] || null)} />
        </div>
        {arquivo && (
          <button onClick={salvar} disabled={salvando} style={{ width: '100%', marginTop: 16, height: 40, backgroundColor: COR, color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: salvando ? 'not-allowed' : 'pointer', opacity: salvando ? 0.7 : 1 }}>{salvando ? 'Enviando...' : 'Enviar documento'}</button>
              )}
            </>
           )}
         </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── MODAL NOVA CNH (buscar colaborador) ─────────────────────────────────────
function ModalNovaCNH({ onClose, onSalvo }: { onClose: () => void; onSalvo: () => void }) {
  const [busca, setBusca] = useState('')
  const [resultados, setResultados] = useState<{ matricula: string; nome: string }[]>([])
  const [colabSel, setColabSel] = useState<{ matricula: string; nome: string } | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [form, setForm] = useState({ numero_cnh: '', categoria: [] as string[], exigencia: 'SIM', data_emissao: '', data_vencimento: '', observacao: '' })
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [salvando, setSalvando] = useState(false); const [erro, setErro] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  async function pesquisar() {
    if (!busca.trim()) return
    setCarregando(true)
    const { data } = await supabase.from('colaboradores').select('matricula, nome')
      .or(`nome.ilike.%${busca}%,matricula.ilike.%${busca}%`).order('nome').limit(10)
    setResultados(data || []); setCarregando(false)
  }

  function toggleCategoria(cat: string) {
    setForm(f => ({ ...f, categoria: f.categoria.includes(cat) ? f.categoria.filter(c => c !== cat) : [...f.categoria, cat] }))
  }

  async function salvar() {
    if (!colabSel) { setErro('Selecione um colaborador.'); return }
    setSalvando(true); setErro('')
    try {
      let urlArquivo: string | null = null
      
      // Upload R2
      if (arquivo) {
        const ext = arquivo.name.split('.').pop()
        const path = `cnhs/${colabSel.matricula}/${Date.now()}.${ext}`
        
        const formData = new FormData()
        formData.append('file', arquivo)
        formData.append('key', path)
        
        const res = await fetch('/api/r2/upload', { method: 'POST', body: formData })
        if (!res.ok) throw new Error('Falha no upload do documento')
        
        urlArquivo = path
      }

      const { error } = await supabase.from('cnhs').insert({
        matricula_colaborador: colabSel.matricula,
        numero_cnh: form.numero_cnh || null,
        categoria: form.categoria.join(', ') || null,
        exigencia: form.exigencia,
        data_emissao: form.data_emissao || null,
        data_vencimento: form.data_vencimento || null,
        observacao: form.observacao || null,
        url_arquivo: urlArquivo,
        is_atual: true,
      })
      if (error) throw error
      onSalvo()
    } catch (e: any) { setErro(e.message || 'Erro ao salvar') }
    setSalvando(false)
  }

  const inp: React.CSSProperties = { width: '100%', height: 38, border: '1px solid #e0e0e0', borderRadius: 8, padding: '0 12px', fontSize: 13, boxSizing: 'border-box', outline: 'none', backgroundColor: 'white' }

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}>
      <div style={{ backgroundColor: 'white', borderRadius: 16, padding: 28, width: '100%', maxWidth: 520, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: '#1a1a1a', margin: 0 }}>Nova CNH</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#aaa' }}>✕</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Busca colaborador */}
          {!colabSel ? (
            <>
              <div>
                <label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>Buscar colaborador *</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input value={busca} onChange={e => setBusca(e.target.value)} onKeyDown={e => e.key === 'Enter' && pesquisar()} placeholder="Nome ou matrícula..." style={{ ...inp, flex: 1 }} />
                  <button onClick={pesquisar} disabled={carregando} style={{ height: 38, padding: '0 16px', backgroundColor: COR, color: 'white', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>{carregando ? '...' : 'Buscar'}</button>
                </div>
              </div>
              {resultados.map(r => (
                <div key={r.matricula} onClick={() => setColabSel(r)} style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid #e0e0e0', cursor: 'pointer', backgroundColor: '#fafafa' }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = '#fdf2f5'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = '#fafafa'}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#333', margin: 0 }}>{r.nome}</p>
                  <p style={{ fontSize: 12, color: '#888', margin: '2px 0 0' }}>{r.matricula}</p>
                </div>
              ))}
            </>
          ) : (
            <>
              <div style={{ padding: '10px 14px', borderRadius: 10, backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#15803d', margin: 0 }}>{colabSel.nome}</p>
                  <p style={{ fontSize: 12, color: '#16a34a', margin: '2px 0 0' }}>{colabSel.matricula}</p>
                </div>
                <button onClick={() => setColabSel(null)} style={{ background: 'none', border: 'none', color: '#16a34a', cursor: 'pointer', fontSize: 16 }}>✕</button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div><label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>Nº CNH</label>
                  <input value={form.numero_cnh} onChange={e => setForm(f => ({ ...f, numero_cnh: e.target.value }))} style={inp} placeholder="Ex: 12345678901" />
                </div>
                <div><label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>Exigência</label>
                  <select value={form.exigencia} onChange={e => setForm(f => ({ ...f, exigencia: e.target.value }))} style={inp}>
                    <option value="SIM">SIM</option>
                    <option value="N/A">N/A</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 8 }}>Categoria</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {CATEGORIAS.map(cat => (
                    <label key={cat} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', border: `1px solid ${form.categoria.includes(cat) ? COR : '#e0e0e0'}`, borderRadius: 8, cursor: 'pointer', backgroundColor: form.categoria.includes(cat) ? '#fdf2f5' : 'white', fontSize: 13, fontWeight: form.categoria.includes(cat) ? 600 : 400, color: form.categoria.includes(cat) ? COR : '#555', userSelect: 'none' }}>
                      <input type="checkbox" checked={form.categoria.includes(cat)} onChange={() => toggleCategoria(cat)} style={{ display: 'none' }} />{cat}
                    </label>
                  ))}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div><label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>Data de Emissão</label>
                  <input type="date" value={form.data_emissao} onChange={e => setForm(f => ({ ...f, data_emissao: e.target.value }))} style={inp} />
                </div>
                <div><label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>Vencimento *</label>
                  <input type="date" value={form.data_vencimento} onChange={e => setForm(f => ({ ...f, data_vencimento: e.target.value }))} style={inp} />
                </div>
              </div>

              <div><label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>Observação <span style={{ color: '#aaa' }}>(opcional)</span></label>
                <textarea value={form.observacao} onChange={e => setForm(f => ({ ...f, observacao: e.target.value }))} rows={2} placeholder="Opcional" style={{ ...inp, height: 'auto', padding: '8px 12px', resize: 'none' }} />
              </div>

              <div><label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>Documento <span style={{ color: '#aaa' }}>(opcional)</span></label>
                <div onClick={() => fileRef.current?.click()} style={{ border: '2px dashed #e0e0e0', borderRadius: 10, padding: '16px 20px', textAlign: 'center', cursor: 'pointer', backgroundColor: '#fafafa' }}>
                  <Icone tipo="upload" cor="#aaa" size={22} />
                  <p style={{ fontSize: 12, color: '#888', margin: '6px 0 0' }}>{arquivo ? arquivo.name : 'Clique para anexar'}</p>
                  <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: 'none' }} onChange={e => setArquivo(e.target.files?.[0] || null)} />
                </div>
              </div>
            </>
          )}

          {erro && <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '8px 12px' }}><p style={{ fontSize: 12, color: '#dc2626', margin: 0 }}>{erro}</p></div>}

          {colabSel && (
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={onClose} style={{ height: 38, padding: '0 18px', border: '1px solid #e0e0e0', borderRadius: 8, fontSize: 13, cursor: 'pointer', background: 'white', color: '#555' }}>Cancelar</button>
              <button onClick={salvar} disabled={salvando} style={{ height: 38, padding: '0 22px', backgroundColor: COR, color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: salvando ? 'not-allowed' : 'pointer', opacity: salvando ? 0.7 : 1 }}>{salvando ? 'Salvando...' : 'Salvar CNH'}</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── PÁGINA PRINCIPAL ─────────────────────────────────────────────────────────
export default function CNHPage() {
  const router = useRouter(); const { usuario } = useAuth()
  const podeEditar = usuario?.nivel !== 'visualizador'  // ← adicionar
  const [colabs, setColabs] = useState<ColabCNH[]>([])
  const [bases, setBases] = useState<Base[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [filtroBase, setFiltroBase] = useState('')
  const [filtroSits, setFiltroSits] = useState<string[]>([])
  const [situacoesDisp, setSituacoesDisp] = useState<string[]>([])
  const [filtroCategoria, setFiltroCategoria] = useState('')
  const [filtroExigencia, setFiltroExigencia] = useState('SIM')
  const [cardAtivo, setCardAtivo] = useState<CardFiltro>(null)
  const [ordCol, setOrdCol] = useState<OrdemColuna>('nome')
  const [ordDir, setOrdDir] = useState<OrdemDirecao>('asc')
  const [modalCNH, setModalCNH] = useState<ColabCNH | null>(null)
  const [modalNova, setModalNova] = useState(false)

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: basesData } = await supabase.from('bases').select('id,nome').order('nome')
      setBases(basesData || [])
      await buscarDados(null)
    }
    init()
  }, [])

async function buscarDados(sitsP: string[] | null) {
    const primeiraVez = sitsP === null
    setLoading(true)

    try {
// 1. Buscar TODAS as CNHs atuais do banco para montar o mapa (AGORA COM PAGINAÇÃO)
      const cnhMap: Record<string, any> = {}
      let fc = 0
      
      while (true) {
        const { data: cnhsData, error } = await supabase.from('cnhs')
          .select('*')
          .eq('is_atual', true)
          .range(fc, fc + 499)

        if (error) throw error
        if (!cnhsData || cnhsData.length === 0) break

        cnhsData.forEach((c: any) => { cnhMap[c.matricula_colaborador] = c })
        
        if (cnhsData.length < 500) break
        fc += 500
      }

      // 2. Buscar TODOS os colaboradores (com ou sem CNH) usando paginação performática
      let todosColabs: any[] = []
      let from = 0
      const TAMANHO_PAGINA = 500

      while (true) {
        let q = supabase.from('colaboradores')
          .select('matricula, nome, situacao, gerencia, supervisor, processo, bases(nome), funcoes(nome)')
          .order('nome')
          .range(from, from + TAMANHO_PAGINA - 1)

        if (filtroBase) q = q.eq('base_id', filtroBase)

        const { data: cd, error } = await q
        if (error) throw error
        if (!cd || cd.length === 0) break

        todosColabs = [...todosColabs, ...cd]
        if (cd.length < TAMANHO_PAGINA) break
        from += TAMANHO_PAGINA
      }

      // 3. Tratar as situações (Filtro de Demitidos, Afastados, etc.)
      if (primeiraVez) {
        const sitsUnicas = [...new Set(todosColabs.map((c: any) => c.situacao).filter(Boolean))].sort() as string[]
        setSituacoesDisp(sitsUnicas)
        const sitsIniciais = sitsUnicas.filter(s => !SITUACOES_EXCLUIDAS_PADRAO.includes(s))
        setFiltroSits(sitsIniciais)
        todosColabs = todosColabs.filter((c: any) => sitsIniciais.includes(c.situacao))
      } else {
        if (sitsP && sitsP.length > 0) {
          todosColabs = todosColabs.filter((c: any) => sitsP.includes(c.situacao))
        } else {
          todosColabs = [] // Nenhuma situação selecionada
        }
      }

      // 4. Mapear o estado final fazendo o Left Join em memória
      setColabs(todosColabs.map((c: any) => ({
        matricula: c.matricula,
        nome: c.nome,
        situacao: c.situacao,
        base: c.bases?.nome || null,
        gerencia: c.gerencia || null,
        supervisor: c.supervisor || null,
        funcao: c.funcoes?.nome || null,
        processo: c.processo || null,
        cnh: cnhMap[c.matricula] || null, // Atribui null se o colaborador não tiver registro de CNH
      })))

    } catch (err) {
      console.error('Erro ao buscar dados de CNH:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { if (situacoesDisp.length > 0) buscarDados(filtroSits) }, [filtroBase, filtroSits])

const statsFiltrados = useMemo(() => colabs.filter(c => {
  if (busca) { const b = busca.toLowerCase(); if (!c.nome.toLowerCase().includes(b) && !c.matricula.includes(busca)) return false }
  if (filtroCategoria && !c.cnh?.categoria?.split('').includes(filtroCategoria)) return false
  if (filtroExigencia && c.cnh?.exigencia !== filtroExigencia) return false
  return true
}), [colabs, busca, filtroCategoria, filtroExigencia])

const stats = useMemo(() => {
  const r = { no_prazo: 0, proximo: 0, vencido: 0, sem_cnh: 0 }
  statsFiltrados.forEach(c => {
    const s = getStatusCNH(c.cnh)
    if (s === 'no_prazo') r.no_prazo++
    else if (s === 'proximo') r.proximo++
    else if (s === 'vencido') r.vencido++
    else r.sem_cnh++
  })
  return r
}, [statsFiltrados])

const filtrados = useMemo(() => statsFiltrados.filter(c => {
  if (cardAtivo) return getStatusCNH(c.cnh) === cardAtivo
  return true
}), [statsFiltrados, cardAtivo])

  const ordenados = useMemo(() => [...filtrados].sort((a, b) => {
    let vA: string | number = '', vB: string | number = ''
    switch (ordCol) {
      case 'matricula': vA = a.matricula; vB = b.matricula; break
      case 'nome': vA = a.nome; vB = b.nome; break
      case 'base': vA = a.base || ''; vB = b.base || ''; break
      case 'situacao': vA = a.situacao; vB = b.situacao; break
      case 'gerencia': vA = a.gerencia || ''; vB = b.gerencia || ''; break
      case 'supervisor': vA = a.supervisor || ''; vB = b.supervisor || ''; break
      case 'funcao': vA = a.funcao || ''; vB = b.funcao || ''; break
      case 'categoria': vA = a.cnh?.categoria || ''; vB = b.cnh?.categoria || ''; break
      case 'exigencia': vA = a.cnh?.exigencia || ''; vB = b.cnh?.exigencia || ''; break
      case 'vencimento': vA = a.cnh?.data_vencimento || '9999'; vB = b.cnh?.data_vencimento || '9999'; break
      case 'dias': vA = calcularDias(a.cnh?.data_vencimento ?? null) ?? 9999; vB = calcularDias(b.cnh?.data_vencimento ?? null) ?? 9999; break
    }
    if (vA < vB) return ordDir === 'asc' ? -1 : 1
    if (vA > vB) return ordDir === 'asc' ? 1 : -1
    return 0
  }), [filtrados, ordCol, ordDir])

  function toggleOrd(c: OrdemColuna) { if (ordCol === c) setOrdDir(d => d === 'asc' ? 'desc' : 'asc'); else { setOrdCol(c); setOrdDir('asc') } }

  const sitsIniciais = useMemo(() => situacoesDisp.filter(s => !SITUACOES_EXCLUIDAS_PADRAO.includes(s)), [situacoesDisp])
  const sitsAlteradas = JSON.stringify([...filtroSits].sort()) !== JSON.stringify([...sitsIniciais].sort())
  const temFiltro = !!(busca || filtroBase || filtroCategoria || filtroExigencia || cardAtivo || sitsAlteradas)
  function limpar() { setBusca(''); setFiltroBase(''); setFiltroCategoria(''); setFiltroExigencia('SIM'); setCardAtivo(null); setFiltroSits(sitsIniciais) }

  const sel: React.CSSProperties = { height: 36, border: '1px solid #e0e0e0', borderRadius: 8, padding: '0 10px', fontSize: 13, backgroundColor: 'white', color: '#555' }
  const tdBase = (ex?: React.CSSProperties): React.CSSProperties => ({ padding: '8px 14px', color: '#666', whiteSpace: 'nowrap', verticalAlign: 'middle', borderBottom: '1px solid #f5f5f5', borderRight: '1px solid #f0f0f0', ...ex })
  const stickyTd = (bg: string, l: number): React.CSSProperties => ({ position: 'sticky', left: l, backgroundColor: bg, zIndex: 10, borderRight: '2px solid #d0d0d0' })

  const CARDS = [
    { key: 'no_prazo' as CardFiltro, label: 'No Prazo', valor: stats.no_prazo, cor: '#16a34a' },
    { key: 'proximo' as CardFiltro, label: 'Próximo do Vencimento', valor: stats.proximo, cor: '#c2410c' },
    { key: 'vencido' as CardFiltro, label: 'Vencidos', valor: stats.vencido, cor: '#dc2626' },
    { key: 'sem_cnh' as CardFiltro, label: 'Sem CNH', valor: stats.sem_cnh, cor: '#64748b' },
  ]

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 600, color: '#1a1a1a', margin: 0 }}>CNH</h1>
          <p style={{ fontSize: 12, color: '#888', margin: '3px 0 0', fontWeight: 500 }}>Controle de Carteiras Nacionais de Habilitação</p>
        </div>
        <button onClick={() => setModalNova(true)} style={{ height: 36, backgroundColor: COR, color: 'white', border: 'none', borderRadius: 8, padding: '0 18px', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>+ Nova CNH</button>
      </div>

      {/* CARDS */}
      {loading
        ? <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>{[...Array(4)].map((_, i) => <div key={i} style={{ backgroundColor: 'white', borderRadius: 10, padding: '10px 16px', border: '1px solid #f0f0f0', minWidth: 160, flex: '1 0 160px' }}><div style={{ height: 10, backgroundColor: '#f0f0f0', borderRadius: 4, marginBottom: 8, width: '60%' }} /><div style={{ height: 24, backgroundColor: '#f0f0f0', borderRadius: 4, width: '40%' }} /></div>)}</div>
        : <div style={{ display: 'flex', gap: 12, marginBottom: 12, overflowX: 'auto', paddingBottom: 4 }}>
          <div style={{ backgroundColor: 'white', borderRadius: 10, padding: '10px 16px', border: '1px solid #f0f0f0', minWidth: 160, flex: '1 0 160px' }}>
            <p style={{ fontSize: 11, color: '#888', margin: '0 0 4px' }}>Colaboradores</p>
            <p style={{ fontSize: 24, fontWeight: 600, color: '#4a4a49', margin: 0 }}>{filtrados.length.toLocaleString('pt-BR')}</p>
          </div>
          {CARDS.map((card, i) => {
            const ativo = cardAtivo === card.key
            return <div key={i} onClick={() => setCardAtivo(ativo ? null : card.key)}
              style={{ backgroundColor: ativo ? card.cor + '10' : 'white', borderRadius: 10, padding: '10px 16px', border: ativo ? `2px solid ${card.cor}` : '1px solid #f0f0f0', minWidth: 160, flex: '1 0 160px', cursor: 'pointer', transition: 'all 0.15s ease', boxShadow: ativo ? `0 2px 8px ${card.cor}30` : 'none' }}>
              <p style={{ fontSize: 11, color: '#888', margin: '0 0 4px' }}>{card.label}{ativo && <span style={{ marginLeft: 6, fontSize: 10, color: card.cor }}>● filtrado</span>}</p>
              <p style={{ fontSize: 24, fontWeight: 600, color: card.cor, margin: 0 }}>{card.valor.toLocaleString('pt-BR')}</p>
            </div>
          })}
        </div>}

      {/* FILTROS */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="text" placeholder="Nome ou matrícula..." value={busca} onChange={e => setBusca(e.target.value)} style={{ ...sel, width: 200, padding: '0 12px' }} />
        <select value={filtroBase} onChange={e => setFiltroBase(e.target.value)} style={{ ...sel, width: 150 }}>
          <option value="">Todas as bases</option>
          {bases.map(b => <option key={b.id} value={b.id}>{b.nome}</option>)}
        </select>
        <FiltroSituacao opcoes={situacoesDisp} selecionadas={filtroSits} onChange={setFiltroSits} />
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
       {CATEGORIAS.map(cat => (
    <button key={cat} onClick={() => setFiltroCategoria(f => f === cat ? '' : cat)}
      style={{ height: 36, width: 36, borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: `1px solid ${filtroCategoria === cat ? COR : '#e0e0e0'}`, backgroundColor: filtroCategoria === cat ? '#fdf2f5' : 'white', color: filtroCategoria === cat ? COR : '#555', transition: 'all 0.15s' }}>
      {cat}
    </button>
  ))}
  {filtroCategoria && <button onClick={() => setFiltroCategoria('')} style={{ height: 36, padding: '0 10px', fontSize: 12, border: '1px solid #fca5a5', borderRadius: 8, backgroundColor: '#fef2f2', color: '#dc2626', cursor: 'pointer' }}>✕</button>}
</div>
        <select value={filtroExigencia} onChange={e => setFiltroExigencia(e.target.value)} style={{ ...sel, width: 130 }}>
          <option value="">Toda exigência</option>
          <option value="SIM">Exigida</option>
          <option value="N/A">N/A</option>
        </select>
        <div style={{ flex: 1 }} />
        {temFiltro && <button onClick={limpar} style={{ height: 36, padding: '0 12px', fontSize: 12, border: '1px solid #fca5a5', borderRadius: 8, backgroundColor: '#fef2f2', color: '#dc2626', cursor: 'pointer' }}>✕ Limpar</button>}
        <BotaoExportar onClick={t => { const d = gerarExport(ordenados); t === 'csv' ? exportCSV(d) : exportXLSX(d) }} />
      </div>

      {/* TABELA */}
      {loading ? <p style={{ color: '#888', fontSize: 14 }}>Carregando...</p>
        : <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 230px)', borderRadius: 12, border: '1px solid #f0f0f0', flex: 1 }}>
          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, backgroundColor: 'white', fontSize: 13 }}>
            <thead>
              <tr style={{ backgroundColor: '#fafafa' }}>
                <Th label="Matrícula" col="matricula" ord={ordCol} dir={ordDir} onClick={toggleOrd} left={0} style={{ width: COL_MATRICULA, minWidth: COL_MATRICULA }} />
                <Th label="Nome" col="nome" ord={ordCol} dir={ordDir} onClick={toggleOrd} left={COL_MATRICULA} style={{ width: COL_NOME, minWidth: COL_NOME }} />
                <Th label="Base" col="base" ord={ordCol} dir={ordDir} onClick={toggleOrd} />
                <Th label="Situação" col="situacao" ord={ordCol} dir={ordDir} onClick={toggleOrd} />
                <Th label="Gerência" col="gerencia" ord={ordCol} dir={ordDir} onClick={toggleOrd} />
                <Th label="Coordenador" col="supervisor" ord={ordCol} dir={ordDir} onClick={toggleOrd} />
                <Th label="Função" col="funcao" ord={ordCol} dir={ordDir} onClick={toggleOrd} />
                <Th label="Nº CNH" col="categoria" ord={ordCol} dir={ordDir} onClick={toggleOrd} />
                <Th label="Categoria" col="categoria" ord={ordCol} dir={ordDir} onClick={toggleOrd} style={{ textAlign: 'center' }} />
                <Th label="Exigência" col="exigencia" ord={ordCol} dir={ordDir} onClick={toggleOrd} style={{ textAlign: 'center' }} />
                <Th label="Vencimento" col="vencimento" ord={ordCol} dir={ordDir} onClick={toggleOrd} style={{ textAlign: 'center' }} />
                <Th label="Dias" col="dias" ord={ordCol} dir={ordDir} onClick={toggleOrd} style={{ textAlign: 'center' }} />
              </tr>
            </thead>
            <tbody>
              {ordenados.length === 0
                ? <tr><td colSpan={12} style={{ padding: '40px 20px', textAlign: 'center', color: '#aaa', fontSize: 14 }}>Nenhum registro encontrado.</td></tr>
                : ordenados.map((c, i) => {
                  const bg = i % 2 === 0 ? 'white' : '#fafafa'
                  const status = getStatusCNH(c.cnh)
                  const cores = statusCores(status)
                  const dias = calcularDias(c.cnh?.data_vencimento ?? null)
                  const bgVenc: Record<StatusCNH, string> = { no_prazo: '#f0fdf4', proximo: '#fff7ed', vencido: '#fef2f2', sem_cnh: '#f1f5f9', na: '#f8fafc' }
                  return (
                    <tr key={c.matricula} style={{ backgroundColor: bg }} onClick={() => setModalCNH(c)} onMouseEnter={e => e.currentTarget.style.backgroundColor = '#fdf8f8'} onMouseLeave={e => e.currentTarget.style.backgroundColor = bg} >
                      <td style={{ ...tdBase(), ...stickyTd(bg, 0), width: COL_MATRICULA, minWidth: COL_MATRICULA, cursor: 'pointer' }}>{c.matricula}</td>
                      <td style={{ ...tdBase(), ...stickyTd(bg, COL_MATRICULA), width: COL_NOME, minWidth: COL_NOME, cursor: 'pointer' }}>
                        <span style={{ fontWeight: 500, color: '#333', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', maxWidth: COL_NOME - 16 }}>{c.nome}</span>
                      </td>
                      <td style={tdBase()}>{c.base || '—'}</td>
                      <td style={tdBase()}><span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, backgroundColor: c.situacao === 'ATIVO' ? '#f0fdf4' : '#f1f5f9', color: c.situacao === 'ATIVO' ? '#16a34a' : '#64748b' }}>{c.situacao}</span></td>
                      <td style={tdBase()}>{c.gerencia ? <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, backgroundColor: '#f0f0f0', color: '#444', fontWeight: 500 }}>{c.gerencia}</span> : '—'}</td>
                      <td style={tdBase()}>{primeiroNome(c.supervisor)}</td>
                      <td style={tdBase()}>{c.funcao || '—'}</td>
                      <td style={tdBase()}>{c.cnh?.numero_cnh || '—'}</td>
                      <td style={tdBase({ textAlign: 'center' })}>
                        {c.cnh?.categoria ? <span style={{ fontSize: 12, fontWeight: 600, color: '#333' }}>{c.cnh.categoria}</span> : '—'}
                      </td>
                      <td style={tdBase({ textAlign: 'center' })}>
                        {c.cnh?.exigencia
                          ? <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, backgroundColor: c.cnh.exigencia === 'SIM' ? '#fdf2f5' : '#f4f4f4', color: c.cnh.exigencia === 'SIM' ? COR : '#888', fontWeight: 600 }}>{c.cnh.exigencia}</span>
                          : '—'}
                      </td>
                      <td style={{ ...tdBase({ textAlign: 'center' }), backgroundColor: bgVenc[status] }}>
                        <span style={{ fontSize: 13, fontWeight: 500, color: cores.text }}>{formatarData(c.cnh?.data_vencimento)}</span>
                      </td>
                      <td style={{ ...tdBase({ textAlign: 'center' }), backgroundColor: bgVenc[status] }}>
                        {dias !== null
                          ? <span style={{ fontSize: 13, fontWeight: 700, color: cores.text }}>{Math.abs(dias)}<span style={{ fontSize: 10, marginLeft: 2 }}>{dias >= 0 ? 'd' : 'd v.'}</span></span>
                          : <span style={{ color: '#ccc' }}>—</span>}
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>}

      {/* MODAIS */}
      {modalCNH && <ModalCNH colab={modalCNH} cnh={modalCNH.cnh} onClose={() => setModalCNH(null)} onUpdate={() => { setModalCNH(null); buscarDados(filtroSits) }} nivel={usuario?.nivel || 'visualizador'} />}
      {modalNova && <ModalNovaCNH onClose={() => setModalNova(false)} onSalvo={() => { setModalNova(false); buscarDados(filtroSits) }} />}
    </div>
  )
}