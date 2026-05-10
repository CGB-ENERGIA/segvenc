'use client'

import { useEffect, useState, useRef } from 'react'
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

interface Programacao {
  id: string
  data_programada: string
  observacao: string | null
  criado_por: string
  created_at: string
}

interface Registro {
  id: string
  regra_id: number
  data_realizacao: string
  data_vencimento: string | null
  url_arquivo: string | null
  logs_auditoria: Auditoria[]
  programacoes?: Programacao[]
}

interface Colaborador {
  matricula: string
  nome: string
  funcao_id: number | null
  funcoes: { nome: string } | null
  situacao: string
  bases: { nome: string } | null
  gerencias: { sigla: string; nome: string } | null
  data_admissao: string | null
  registros_exames: Registro[]
}

interface NR {
  id: number
  nome: string
  validade_dias: number | null
}

interface Gerencia { id: number; sigla: string; nome: string }

type OrdemColuna = 'matricula' | 'nome' | 'funcao' | 'gerencia' | 'situacao' | 'base' | `nr_${number}`
type OrdemDirecao = 'asc' | 'desc'
type AbaModal = 'info' | 'documento' | 'programacao' | 'auditoria'

const COR = '#9f183c'
const NRS_ALVO = ['NR 10-B', 'NR 11', 'NR 12', 'NR 35']

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function getStatusVencimento(dataVencimento: string) {
  const hoje = new Date()
  const venc = new Date(dataVencimento)
  const diff = (venc.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24)
  if (diff < 0) return 'vencido'
  if (diff <= 30) return 'proximo'
  return 'valido'
}

function getDiasParaVencer(dataVencimento: string) {
  const hoje = new Date()
  const venc = new Date(dataVencimento)
  return Math.ceil((venc.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24))
}

function calcularStats(colaboradores: Colaborador[], nrs: NR[]) {
  let validos = 0, proximos = 0, vencidos = 0
  colaboradores.forEach(c => {
    nrs.forEach(nr => {
      const reg = (c.registros_exames || []).find(r => r.regra_id === nr.id)
      if (!reg) return
      if (nr.validade_dias === null) { validos++; return }
      const s = getStatusVencimento(reg.data_vencimento!)
      if (s === 'valido') validos++
      else if (s === 'proximo') proximos++
      else vencidos++
    })
  })
  return { validos, proximos, vencidos }
}

// ─── EXPORTAÇÃO ──────────────────────────────────────────────────────────────

function gerarDadosExportacao(colaboradores: Colaborador[], nrs: NR[]) {
  return colaboradores.map(c => {
    const linha: Record<string, string> = {
      'Matrícula': c.matricula,
      'Nome': c.nome,
      'Função': c.funcoes?.nome || '',
      'Gerência': c.gerencias?.sigla || '',
      'Base': c.bases?.nome || '',
      'Situação': c.situacao,
    }
    nrs.forEach(nr => {
      const reg = c.registros_exames?.find(r => r.regra_id === nr.id)
      if (!reg) { linha[nr.nome] = 'Sem registro'; return }
      if (nr.validade_dias === null) { linha[nr.nome] = 'Possui'; return }
      const status = getStatusVencimento(reg.data_vencimento!)
      const label = status === 'valido' ? 'Válido' : status === 'proximo' ? 'A vencer' : 'Vencido'
      linha[`${nr.nome} - Vencimento`] = new Date(reg.data_vencimento! + 'T12:00:00').toLocaleDateString('pt-BR')
      linha[`${nr.nome} - Status`] = label
      linha[`${nr.nome} - Documento`] = reg.url_arquivo ? 'Com documento' : 'Sem documento'
    })
    return linha
  })
}

function exportarCSV(dados: Record<string, string>[]) {
  if (!dados.length) return
  const cols = Object.keys(dados[0])
  const linhas = dados.map(r => cols.map(h => `"${(r[h] || '').replace(/"/g, '""')}"`).join(';'))
  const csv = [cols.map(h => `"${h}"`).join(';'), ...linhas].join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url
  a.download = `base-nr-${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.csv`
  a.click(); URL.revokeObjectURL(url)
}

function exportarXLSX(dados: Record<string, string>[]) {
  if (!dados.length) return
  import('xlsx').then(XLSX => {
    const ws = XLSX.utils.json_to_sheet(dados)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'BASE NR')
    XLSX.writeFile(wb, `base-nr-${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.xlsx`)
  })
}

// ─── BOTÃO EXPORTAR ──────────────────────────────────────────────────────────

function BotaoExportar({ onClick }: { onClick: (tipo: 'csv' | 'xlsx') => void }) {
  const [aberto, setAberto] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [])
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setAberto(!aberto)} style={{ height: 36, padding: '0 10px', fontSize: 12, border: '1px solid #e0e0e0', borderRadius: 8, backgroundColor: 'white', color: '#555', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
        <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M8 13h2m4 0h2M8 17h2m4 0h2M10 13v4" /></svg>
        <span style={{ fontSize: 10 }}>{aberto ? '▲' : '▼'}</span>
      </button>
      {aberto && (
        <div style={{ position: 'absolute', top: 40, right: 0, zIndex: 50, backgroundColor: 'white', border: '1px solid #e0e0e0', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', width: 180, overflow: 'hidden' }}>
          {(['csv', 'xlsx'] as const).map((tipo, i) => (
            <button key={tipo} onClick={() => { onClick(tipo); setAberto(false) }} style={{ width: '100%', padding: '10px 16px', fontSize: 13, textAlign: 'left', border: 'none', background: 'none', cursor: 'pointer', color: '#333', display: 'flex', alignItems: 'center', gap: 10, borderTop: i > 0 ? '1px solid #f0f0f0' : 'none' }}
              onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f9f9f9'}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
              {tipo === 'csv' ? '📄 Exportar CSV' : '📊 Exportar Excel'}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── ÍCONE ────────────────────────────────────────────────────────────────────

function Icone({ tipo, cor, titulo, size = 16 }: { tipo: string; cor: string; titulo?: string; size?: number }) {
  const paths: Record<string, string> = {
    clipe:     'M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48',
    check:     'M22 11.08V12a10 10 0 11-5.93-9.14M22 4L12 14.01l-3-3',
    x_circulo: 'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM15 9l-6 6M9 9l6 6',
    relogio:   'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM12 6v6l4 2',
    calendario:'M19 4H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2zM16 2v4M8 2v4M3 10h18',
    upload:    'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12',
    olho:      'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 9a3 3 0 100 6 3 3 0 000-6z',
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={cor} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}>
      {titulo && <title>{titulo}</title>}
      <path d={paths[tipo] || ''} />
    </svg>
  )
}

// ─── SELETOR DE COLUNAS ───────────────────────────────────────────────────────

function SeletorColunas({ colunas, visiveis, onChange }: { colunas: { key: string; label: string }[]; visiveis: string[]; onChange: (c: string[]) => void }) {
  const [aberto, setAberto] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [])
  const toggle = (key: string) => onChange(visiveis.includes(key) ? visiveis.filter(v => v !== key) : [...visiveis, key])
  const todas = colunas.every(c => visiveis.includes(c.key))
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setAberto(!aberto)} style={{ height: 36, border: '1px solid #e0e0e0', borderRadius: 8, padding: '0 12px', fontSize: 13, backgroundColor: 'white', color: '#555', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>⊞ Colunas {aberto ? '▲' : '▼'}</button>
      {aberto && (
        <div style={{ position: 'absolute', top: 40, right: 0, zIndex: 50, backgroundColor: 'white', border: '1px solid #e0e0e0', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', width: 220, maxHeight: 360, overflowY: 'auto' }}>
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

// ─── TH ORDENÁVEL ────────────────────────────────────────────────────────────

function ThOrdenavel({ label, coluna, ordemAtual, direcao, onClick, style }: { label: string; coluna: OrdemColuna; ordemAtual: OrdemColuna; direcao: OrdemDirecao; onClick: (c: OrdemColuna) => void; style?: React.CSSProperties }) {
  const ativo = ordemAtual === coluna
  return (
    <th onClick={() => onClick(coluna)} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 700, color: ativo ? COR : '#333', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none', borderBottom: ativo ? `2px solid ${COR}` : '2px solid transparent', ...style }}>
      {label} {ativo ? (direcao === 'asc' ? '↑' : '↓') : <span style={{ color: '#ccc' }}>↕</span>}
    </th>
  )
}

// ─── CÉLULA NR ───────────────────────────────────────────────────────────────

function CelulaExameNR({ registro, semPrazo, onClick, onClickIcone, compacto }: {
  registro: Registro | undefined; semPrazo: boolean
  onClick: () => void; onClickIcone: (tipo: 'documento' | 'programacao') => void; compacto: boolean
}) {
  const pad = compacto ? '6px 8px' : '8px 12px'
  const minW = compacto ? 100 : 130

  if (!registro) {
    return <td style={{ padding: pad, textAlign: 'center', cursor: 'pointer', backgroundColor: '#f9f9f9', color: '#ccc', fontSize: 12, minWidth: minW, verticalAlign: 'middle' }} onClick={onClick}>—</td>
  }

  if (semPrazo) {
    const temArquivo = !!registro.url_arquivo
    const ultimaAuditoria = [...(registro.logs_auditoria || [])].sort((a, b) => new Date(b.data_auditoria).getTime() - new Date(a.data_auditoria).getTime())[0]
    return (
      <td style={{ padding: pad, cursor: 'pointer', backgroundColor: '#f0fdf4', minWidth: minW, verticalAlign: 'middle', textAlign: 'center' }} onClick={onClick}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Icone tipo="check" cor="#16a34a" size={13} />
            <span style={{ fontSize: compacto ? 10 : 11, color: '#16a34a', fontWeight: 600 }}>Possui</span>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span title={temArquivo ? 'Ver documento' : 'Anexar documento'} onClick={e => { e.stopPropagation(); onClickIcone('documento') }} style={{ cursor: 'pointer', display: 'flex' }}>
              <Icone tipo="clipe" cor={temArquivo ? '#2563eb' : '#9ca3af'} size={13} />
            </span>
            {!ultimaAuditoria && <Icone tipo="relogio" cor="#9ca3af" titulo="Pendente" size={13} />}
            {ultimaAuditoria?.validado && <Icone tipo="check" cor="#16a34a" titulo="Validado" size={13} />}
            {ultimaAuditoria && !ultimaAuditoria.validado && <Icone tipo="x_circulo" cor="#dc2626" titulo="Reprovado" size={13} />}
          </div>
        </div>
      </td>
    )
  }

  const status = getStatusVencimento(registro.data_vencimento!)
  const dias = getDiasParaVencer(registro.data_vencimento!)
  const temArquivo = !!registro.url_arquivo
  const ultimaAuditoria = [...(registro.logs_auditoria || [])].sort((a, b) => new Date(b.data_auditoria).getTime() - new Date(a.data_auditoria).getTime())[0]
  const ultimaProgramacao = [...(registro.programacoes || [])].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
  const mostrarCalendario = dias <= 30 || !!ultimaProgramacao
  const cores: Record<string, string> = { valido: '#f0fdf4', proximo: '#fffbeb', vencido: '#fef2f2' }

  return (
    <td style={{ padding: pad, cursor: 'pointer', backgroundColor: cores[status], minWidth: minW, verticalAlign: 'middle', textAlign: 'center' }} onClick={onClick}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
        <span style={{ fontSize: compacto ? 10 : 11, color: '#555', fontWeight: 500 }}>{new Date(registro.data_vencimento! + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span title={temArquivo ? 'Ver documento' : 'Anexar documento'} onClick={e => { e.stopPropagation(); onClickIcone('documento') }} style={{ cursor: 'pointer', display: 'flex' }}>
            <Icone tipo="clipe" cor={temArquivo ? '#2563eb' : '#9ca3af'} size={13} />
          </span>
          {!ultimaAuditoria && <Icone tipo="relogio" cor="#9ca3af" titulo="Pendente" size={13} />}
          {ultimaAuditoria?.validado && <Icone tipo="check" cor="#16a34a" titulo="Validado" size={13} />}
          {ultimaAuditoria && !ultimaAuditoria.validado && <Icone tipo="x_circulo" cor="#dc2626" titulo="Reprovado" size={13} />}
          {mostrarCalendario && (
            <span title={ultimaProgramacao ? `Prog: ${new Date(ultimaProgramacao.data_programada + 'T12:00:00').toLocaleDateString('pt-BR')}` : 'Não programado'}
              onClick={e => { e.stopPropagation(); onClickIcone('programacao') }} style={{ cursor: 'pointer', display: 'flex' }}>
              <Icone tipo="calendario" cor={ultimaProgramacao ? '#7c3aed' : '#9ca3af'} size={13} />
            </span>
          )}
        </div>
        {ultimaProgramacao && <span style={{ fontSize: 10, color: '#7c3aed', fontStyle: 'italic' }}>Prog: {new Date(ultimaProgramacao.data_programada + 'T12:00:00').toLocaleDateString('pt-BR')}</span>}
      </div>
    </td>
  )
}

// ─── MODAL NOVO TREINAMENTO NR ────────────────────────────────────────────────

function ModalNovoTreinamento({ colaborador, nrs, onFechar, onAtualizar, usuarioEmail }: {
  colaborador: Colaborador; nrs: NR[]
  onFechar: () => void; onAtualizar: () => void; usuarioEmail: string
}) {
  const [form, setForm] = useState({ regra_id: '', data_realizacao: '', data_vencimento: '' })
  const [uploadArquivo, setUploadArquivo] = useState<File | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const nrSelecionada = nrs.find(n => n.id === parseInt(form.regra_id))
  const semPrazo = nrSelecionada ? nrSelecionada.validade_dias === null : false

  useEffect(() => {
    if (form.regra_id && form.data_realizacao && nrSelecionada && nrSelecionada.validade_dias !== null) {
      const d = new Date(form.data_realizacao + 'T12:00:00')
      d.setDate(d.getDate() + nrSelecionada.validade_dias)
      setForm(f => ({ ...f, data_vencimento: d.toISOString().split('T')[0] }))
    } else if (semPrazo) {
      setForm(f => ({ ...f, data_vencimento: '' }))
    }
  }, [form.regra_id, form.data_realizacao])

  async function salvar() {
    if (!form.regra_id || !form.data_realizacao) { setErro('Preencha o tipo de NR e a data de realização.'); return }
    setSalvando(true); setErro('')
    try {
      await supabase.from('registros_exames').update({ is_atual: false })
        .eq('matricula_colaborador', colaborador.matricula).eq('regra_id', parseInt(form.regra_id))
      const { data: novo, error: e } = await supabase.from('registros_exames').insert({
        matricula_colaborador: colaborador.matricula,
        regra_id: parseInt(form.regra_id),
        data_realizacao: form.data_realizacao,
        data_vencimento: semPrazo ? null : form.data_vencimento || null,
        is_atual: true,
      }).select().single()
      if (e) throw new Error(e.message)
      if (uploadArquivo && novo) {
        const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
        const ext = uploadArquivo.name.split('.').pop()
        const path = `${colaborador.matricula}/${form.regra_id}/${ts}.${ext}`
        const { error: se } = await supabase.storage.from('documentos').upload(path, uploadArquivo, { upsert: false })
        if (!se) {
          const { data: u } = supabase.storage.from('documentos').getPublicUrl(path)
          await supabase.from('registros_exames').update({ url_arquivo: u.publicUrl }).eq('id', novo.id)
        }
      }
      onAtualizar(); onFechar()
    } catch (e: any) { setErro(e.message || 'Erro ao salvar') }
    setSalvando(false)
  }

  const inputStyle: React.CSSProperties = { width: '100%', height: 38, border: '1px solid #e0e0e0', borderRadius: 8, padding: '0 12px', fontSize: 13, boxSizing: 'border-box', outline: 'none', backgroundColor: 'white' }

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
      <div style={{ backgroundColor: 'white', borderRadius: 16, padding: 28, width: '100%', maxWidth: 480, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: '#1a1a1a', margin: 0 }}>Novo Treinamento NR</h2>
            <p style={{ fontSize: 13, color: '#888', margin: '3px 0 0' }}>{colaborador.nome} · {colaborador.matricula}</p>
          </div>
          <button onClick={onFechar} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#aaa' }}>✕</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>Tipo de NR *</label>
            <select value={form.regra_id} onChange={e => setForm(f => ({ ...f, regra_id: e.target.value }))} style={inputStyle}>
              <option value="">Selecione...</option>
              {nrs.map(n => <option key={n.id} value={n.id}>{n.nome}</option>)}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: semPrazo ? '1fr' : '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>Data de realização *</label>
              <input type="date" value={form.data_realizacao} onChange={e => setForm(f => ({ ...f, data_realizacao: e.target.value }))} style={inputStyle} />
            </div>
            {!semPrazo && (
              <div>
                <label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>Vencimento (calculado)</label>
                <input type="date" value={form.data_vencimento} onChange={e => setForm(f => ({ ...f, data_vencimento: e.target.value }))} style={{ ...inputStyle, backgroundColor: form.data_vencimento ? '#f0fdf4' : 'white' }} />
                {form.data_vencimento && <p style={{ fontSize: 11, color: '#16a34a', margin: '3px 0 0' }}>✓ Calculado automaticamente</p>}
              </div>
            )}
          </div>
          {semPrazo && (
            <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '8px 12px' }}>
              <p style={{ fontSize: 12, color: '#16a34a', margin: 0 }}>✓ Esta NR não possui prazo de vencimento</p>
            </div>
          )}
          <div>
            <label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>Documento <span style={{ color: '#aaa' }}>(opcional)</span></label>
            <div onClick={() => fileInputRef.current?.click()} style={{ border: '2px dashed #e0e0e0', borderRadius: 10, padding: '16px 20px', textAlign: 'center', cursor: 'pointer', backgroundColor: '#fafafa' }}>
              <Icone tipo="upload" cor="#aaa" size={22} />
              <p style={{ fontSize: 12, color: '#888', margin: '6px 0 0' }}>{uploadArquivo ? uploadArquivo.name : 'Clique para anexar'}</p>
              <p style={{ fontSize: 11, color: '#bbb', margin: '2px 0 0' }}>PDF, JPG ou PNG</p>
              <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: 'none' }} onChange={e => setUploadArquivo(e.target.files?.[0] || null)} />
            </div>
          </div>
          {erro && <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '8px 12px' }}><p style={{ fontSize: 12, color: '#dc2626', margin: 0 }}>{erro}</p></div>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
            <button onClick={onFechar} style={{ height: 38, padding: '0 18px', border: '1px solid #e0e0e0', borderRadius: 8, fontSize: 13, cursor: 'pointer', background: 'white', color: '#555' }}>Cancelar</button>
            <button onClick={salvar} disabled={salvando} style={{ height: 38, padding: '0 22px', backgroundColor: COR, color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: salvando ? 'not-allowed' : 'pointer', opacity: salvando ? 0.7 : 1 }}>
              {salvando ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── MODAL EXAME ──────────────────────────────────────────────────────────────

function ModalExame({ dados, abaInicial, onFechar, onAtualizar, usuarioEmail, podeAuditar, nivelUsuario }: {
  dados: { colaborador: Colaborador; registro: Registro | undefined; nr: NR; abaInicial: AbaModal }
  abaInicial: AbaModal; onFechar: () => void; onAtualizar: () => void
  usuarioEmail: string; podeAuditar: boolean; nivelUsuario: string
}) {
  const [aba, setAba] = useState<AbaModal>(abaInicial)
  const [programacoes, setProgramacoes] = useState<Programacao[]>([])
  const [carregandoProg, setCarregandoProg] = useState(false)
  const [formProg, setFormProg] = useState({ data_programada: '', observacao: '' })
  const [salvandoProg, setSalvandoProg] = useState(false)
  const [erroProg, setErroProg] = useState('')
  const [uploadArquivo, setUploadArquivo] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [erroUpload, setErroUpload] = useState('')
  const [formAuditoria, setFormAuditoria] = useState({ validado: true, observacao: '' })
  const [salvandoAud, setSalvandoAud] = useState(false)
  const [erroAud, setErroAud] = useState('')
  const [modalExcluir, setModalExcluir] = useState(false)
  const [confirmacaoNome, setConfirmacaoNome] = useState('')
  const [excluindo, setExcluindo] = useState(false)
  const [erroExcluir, setErroExcluir] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { colaborador, registro, nr } = dados

  useEffect(() => { if (aba === 'programacao' && registro) carregarProgramacoes() }, [aba])

  async function carregarProgramacoes() {
    if (!registro) return
    setCarregandoProg(true)
    const { data } = await supabase.from('programacoes_exames').select('*').eq('registro_id', registro.id).order('created_at', { ascending: false })
    setProgramacoes(data || []); setCarregandoProg(false)
  }

  async function salvarProgramacao() {
    if (!registro || !formProg.data_programada) { setErroProg('Informe a data programada.'); return }
    setSalvandoProg(true); setErroProg('')
    const { error } = await supabase.from('programacoes_exames').insert({ registro_id: registro.id, matricula_colaborador: colaborador.matricula, regra_id: nr.id, data_programada: formProg.data_programada, observacao: formProg.observacao || null, criado_por: usuarioEmail })
    if (error) { setErroProg(error.message); setSalvandoProg(false); return }
    setFormProg({ data_programada: '', observacao: '' }); setSalvandoProg(false); carregarProgramacoes(); onAtualizar()
  }

  async function fazerUpload() {
    if (!uploadArquivo || !registro) return
    setUploading(true); setErroUpload('')
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const ext = uploadArquivo.name.split('.').pop()
    const path = `${colaborador.matricula}/${nr.id}/${ts}.${ext}`
    const { error: se } = await supabase.storage.from('documentos').upload(path, uploadArquivo, { upsert: false })
    if (se) { setErroUpload(se.message); setUploading(false); return }
    const { data: u } = supabase.storage.from('documentos').getPublicUrl(path)
    const { error: de } = await supabase.from('registros_exames').update({ url_arquivo: u.publicUrl }).eq('id', registro.id)
    if (de) { setErroUpload(de.message); setUploading(false); return }
    setUploadArquivo(null); setUploading(false); onAtualizar(); onFechar()
  }

  async function salvarAuditoria() {
    if (!registro) return
    if (!formAuditoria.validado && !formAuditoria.observacao) { setErroAud('Informe o motivo da reprovação.'); return }
    setSalvandoAud(true); setErroAud('')
    const { error } = await supabase.from('logs_auditoria').insert({ registro_id: registro.id, auditor_email: usuarioEmail, validado: formAuditoria.validado, observacao: formAuditoria.observacao || null, data_auditoria: new Date().toISOString() })
    if (error) { setErroAud(error.message); setSalvandoAud(false); return }
    setSalvandoAud(false); onAtualizar(); onFechar()
  }

  async function excluirRegistro() {
    if (!registro) return
    if (confirmacaoNome !== nr.nome) { setErroExcluir('O nome digitado não confere.'); return }
    setExcluindo(true); setErroExcluir('')
    const { error } = await supabase.from('registros_exames').delete().eq('id', registro.id)
    if (error) { setErroExcluir(error.message); setExcluindo(false); return }
    onAtualizar(); onFechar()
  }

  const auditorias = [...(registro?.logs_auditoria || [])].sort((a, b) => new Date(b.data_auditoria).getTime() - new Date(a.data_auditoria).getTime())
  const abas: { key: AbaModal; label: string }[] = [
    { key: 'info', label: 'Informações' }, { key: 'documento', label: 'Documento' },
    { key: 'programacao', label: 'Programação' },
    ...(podeAuditar ? [{ key: 'auditoria' as AbaModal, label: 'Auditoria' }] : []),
  ]
  const inputStyle: React.CSSProperties = { width: '100%', height: 38, border: '1px solid #e0e0e0', borderRadius: 8, padding: '0 12px', fontSize: 13, boxSizing: 'border-box', outline: 'none' }

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div style={{ backgroundColor: 'white', borderRadius: 16, width: '100%', maxWidth: 580, maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ padding: '24px 28px 0', borderBottom: '1px solid #f0f0f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
            <div>
              <h2 style={{ fontSize: 17, fontWeight: 600, color: '#1a1a1a', margin: 0 }}>{nr.nome}</h2>
              <p style={{ fontSize: 13, color: '#888', margin: '3px 0 0' }}>{colaborador.nome} · {colaborador.matricula}</p>
            </div>
            <button onClick={onFechar} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#aaa', padding: '0 4px' }}>✕</button>
          </div>
          <div style={{ display: 'flex' }}>
            {abas.map(a => (
              <button key={a.key} onClick={() => setAba(a.key)} style={{ padding: '8px 16px', fontSize: 13, fontWeight: aba === a.key ? 600 : 400, border: 'none', background: 'none', cursor: 'pointer', color: aba === a.key ? COR : '#888', borderBottom: aba === a.key ? `2px solid ${COR}` : '2px solid transparent', marginBottom: -1 }}>{a.label}</button>
            ))}
          </div>
        </div>

        <div style={{ padding: '24px 28px', overflowY: 'auto', flex: 1 }}>
          {aba === 'info' && (
            <div>
              {registro ? (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
                    {[
                      { label: 'Realizado em', valor: new Date(registro.data_realizacao + 'T12:00:00').toLocaleDateString('pt-BR') },
                      { label: 'Vencimento', valor: nr.validade_dias === null ? 'Sem prazo' : registro.data_vencimento ? new Date(registro.data_vencimento + 'T12:00:00').toLocaleDateString('pt-BR') : '—' },
                      { label: 'Base', valor: colaborador.bases?.nome || '—' },
                      { label: 'Função', valor: colaborador.funcoes?.nome || '—' },
                    ].map((item, i) => (
                      <div key={i} style={{ backgroundColor: '#f9f9f9', borderRadius: 8, padding: 12 }}>
                        <p style={{ fontSize: 11, color: '#888', margin: '0 0 4px' }}>{item.label}</p>
                        <p style={{ fontSize: 14, color: item.label === 'Vencimento' && nr.validade_dias === null ? '#16a34a' : '#333', margin: 0, fontWeight: 500 }}>{item.valor}</p>
                      </div>
                    ))}
                  </div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#333', margin: '0 0 12px' }}>Últimas auditorias</p>
                  {auditorias.length === 0 ? <p style={{ fontSize: 13, color: '#aaa' }}>Nenhuma auditoria realizada.</p> : auditorias.slice(0, 3).map((log, i) => (
                    <div key={log.id} style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: '10px 14px', marginBottom: 8, borderLeft: `3px solid ${log.validado ? '#16a34a' : '#dc2626'}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 12, fontWeight: 500, color: log.validado ? '#16a34a' : '#dc2626' }}>{log.validado ? '✓ Validado' : '✗ Reprovado'}{i === 0 && <span style={{ fontSize: 10, color: '#aaa', marginLeft: 8 }}>mais recente</span>}</span>
                        <span style={{ fontSize: 11, color: '#aaa' }}>{new Date(log.data_auditoria).toLocaleString('pt-BR')}</span>
                      </div>
                      <p style={{ fontSize: 12, color: '#666', margin: '4px 0 0' }}>{log.auditor_email}</p>
                      {log.observacao && <p style={{ fontSize: 12, color: '#666', margin: '4px 0 0', fontStyle: 'italic' }}>"{log.observacao}"</p>}
                    </div>
                  ))}
                  {nivelUsuario === 'admin' && (
                    <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid #f0f0f0' }}>
                      <button onClick={() => { setConfirmacaoNome(''); setErroExcluir(''); setModalExcluir(true) }} style={{ height: 36, padding: '0 16px', fontSize: 12, border: '1px solid #fca5a5', borderRadius: 8, backgroundColor: '#fef2f2', color: '#dc2626', cursor: 'pointer' }}>
                        🗑 Excluir este registro
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div style={{ textAlign: 'center', padding: '40px 0', color: '#aaa' }}>
                  <p style={{ fontSize: 32, margin: '0 0 8px' }}>📋</p>
                  <p style={{ fontSize: 14 }}>Nenhum registro encontrado para esta NR.</p>
                </div>
              )}
            </div>
          )}

          {modalExcluir && (
            <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
              <div style={{ backgroundColor: 'white', borderRadius: 16, padding: 28, width: '100%', maxWidth: 440, boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
                <h3 style={{ fontSize: 16, fontWeight: 600, color: '#dc2626', margin: '0 0 8px' }}>Excluir registro</h3>
                <p style={{ fontSize: 13, color: '#555', margin: '0 0 16px', lineHeight: 1.5 }}>Esta ação é <strong>irreversível</strong>. Para confirmar, digite o nome da NR:</p>
                <p style={{ fontSize: 13, fontWeight: 600, color: '#333', margin: '0 0 8px', padding: '8px 12px', backgroundColor: '#f9f9f9', borderRadius: 8, borderLeft: '3px solid #dc2626' }}>{nr.nome}</p>
                <input type="text" autoFocus value={confirmacaoNome} onChange={e => setConfirmacaoNome(e.target.value)} onKeyDown={e => e.key === 'Enter' && excluirRegistro()} placeholder="Digite o nome exato..." style={{ width: '100%', height: 38, border: '1px solid #e0e0e0', borderRadius: 8, padding: '0 12px', fontSize: 13, boxSizing: 'border-box', outline: 'none', marginBottom: 8 }} />
                {erroExcluir && <p style={{ fontSize: 12, color: '#dc2626', margin: '0 0 12px' }}>{erroExcluir}</p>}
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 12 }}>
                  <button onClick={() => setModalExcluir(false)} disabled={excluindo} style={{ height: 38, padding: '0 18px', border: '1px solid #e0e0e0', borderRadius: 8, fontSize: 13, cursor: 'pointer', background: 'white', color: '#555' }}>Cancelar</button>
                  <button onClick={excluirRegistro} disabled={excluindo || confirmacaoNome !== nr.nome} style={{ height: 38, padding: '0 22px', backgroundColor: '#dc2626', color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: excluindo || confirmacaoNome !== nr.nome ? 'not-allowed' : 'pointer', opacity: excluindo || confirmacaoNome !== nr.nome ? 0.5 : 1 }}>
                    {excluindo ? 'Excluindo...' : 'Confirmar exclusão'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {aba === 'documento' && (
            <div>
              {registro?.url_arquivo ? (
                <div style={{ marginBottom: 24 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#333', margin: '0 0 12px' }}>Documento atual</p>
                  <a href={registro.url_arquivo} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 16, backgroundColor: '#eff6ff', borderRadius: 10, border: '1px solid #bfdbfe', color: '#2563eb', textDecoration: 'none', fontSize: 13, fontWeight: 500 }}>
                    <Icone tipo="olho" cor="#2563eb" size={18} /> Visualizar documento
                  </a>
                </div>
              ) : (
                <div style={{ marginBottom: 24, padding: 16, backgroundColor: '#fffbeb', borderRadius: 10, border: '1px solid #fde68a' }}>
                  <p style={{ fontSize: 13, color: '#92400e', margin: 0 }}>⚠️ Nenhum documento anexado ainda.</p>
                </div>
              )}
              {!registro && <p style={{ fontSize: 13, color: '#aaa', marginBottom: 16 }}>Registre a NR antes de anexar documento.</p>}
              {registro && (
                <>
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#333', margin: '0 0 12px' }}>{registro.url_arquivo ? 'Substituir documento' : 'Anexar documento'}</p>
                  <div onClick={() => fileInputRef.current?.click()} style={{ border: '2px dashed #e0e0e0', borderRadius: 10, padding: '28px 20px', textAlign: 'center', cursor: 'pointer', backgroundColor: '#fafafa' }}>
                    <Icone tipo="upload" cor="#aaa" size={28} />
                    <p style={{ fontSize: 13, color: '#888', margin: '8px 0 4px' }}>{uploadArquivo ? uploadArquivo.name : 'Clique para selecionar'}</p>
                    <p style={{ fontSize: 11, color: '#bbb', margin: 0 }}>PDF, JPG ou PNG · Máx. 10MB</p>
                    <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: 'none' }} onChange={e => setUploadArquivo(e.target.files?.[0] || null)} />
                  </div>
                  {erroUpload && <p style={{ fontSize: 12, color: '#dc2626', marginTop: 8 }}>{erroUpload}</p>}
                  {uploadArquivo && <button onClick={fazerUpload} disabled={uploading} style={{ width: '100%', marginTop: 16, height: 40, backgroundColor: COR, color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: uploading ? 'not-allowed' : 'pointer', opacity: uploading ? 0.7 : 1 }}>{uploading ? 'Enviando...' : 'Enviar documento'}</button>}
                </>
              )}
            </div>
          )}

          {aba === 'programacao' && (
            <div>
              <div style={{ backgroundColor: '#f9f9f9', borderRadius: 10, padding: 16, marginBottom: 24 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: '#333', margin: '0 0 14px' }}>Nova programação</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <div>
                    <label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>Data programada *</label>
                    <input type="date" value={formProg.data_programada} onChange={e => setFormProg(f => ({ ...f, data_programada: e.target.value }))} style={inputStyle} />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>Observação</label>
                    <input type="text" value={formProg.observacao} onChange={e => setFormProg(f => ({ ...f, observacao: e.target.value }))} placeholder="Opcional..." style={inputStyle} />
                  </div>
                </div>
                {erroProg && <p style={{ fontSize: 12, color: '#dc2626', margin: '0 0 8px' }}>{erroProg}</p>}
                <button onClick={salvarProgramacao} disabled={salvandoProg || !registro} style={{ height: 36, padding: '0 20px', backgroundColor: COR, color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: salvandoProg || !registro ? 'not-allowed' : 'pointer', opacity: salvandoProg || !registro ? 0.7 : 1 }}>{salvandoProg ? 'Salvando...' : 'Programar'}</button>
              </div>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#333', margin: '0 0 12px' }}>Histórico</p>
              {carregandoProg ? <p style={{ fontSize: 13, color: '#aaa' }}>Carregando...</p> : programacoes.length === 0 ? <p style={{ fontSize: 13, color: '#aaa' }}>Nenhuma programação registrada.</p> : programacoes.map((p, i) => (
                <div key={p.id} style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: '10px 14px', marginBottom: 8, borderLeft: '3px solid #7c3aed' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 500, color: '#7c3aed' }}>📅 {new Date(p.data_programada + 'T12:00:00').toLocaleDateString('pt-BR')}{i === 0 && <span style={{ fontSize: 10, color: '#aaa', marginLeft: 8 }}>mais recente</span>}</span>
                    <span style={{ fontSize: 11, color: '#aaa' }}>{new Date(p.created_at).toLocaleString('pt-BR')}</span>
                  </div>
                  <p style={{ fontSize: 12, color: '#666', margin: 0 }}>Por: {p.criado_por}</p>
                  {p.observacao && <p style={{ fontSize: 12, color: '#888', margin: '4px 0 0', fontStyle: 'italic' }}>{p.observacao}</p>}
                </div>
              ))}
            </div>
          )}

          {aba === 'auditoria' && podeAuditar && (
            <div>
              {registro?.url_arquivo ? (
                <a href={registro.url_arquivo} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 14, backgroundColor: '#eff6ff', borderRadius: 10, border: '1px solid #bfdbfe', color: '#2563eb', textDecoration: 'none', fontSize: 13, fontWeight: 500, marginBottom: 20 }}>
                  <Icone tipo="olho" cor="#2563eb" size={16} /> Visualizar documento antes de auditar
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
                    <button key={String(op.val)} onClick={() => setFormAuditoria(f => ({ ...f, validado: op.val }))} style={{ flex: 1, height: 42, borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', border: formAuditoria.validado === op.val ? `2px solid ${op.cor}` : '1px solid #e0e0e0', backgroundColor: formAuditoria.validado === op.val ? op.bg : 'white', color: formAuditoria.validado === op.val ? op.cor : '#555' }}>{op.label}</button>
                  ))}
                </div>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>Observação {!formAuditoria.validado && <span style={{ color: '#dc2626' }}>*</span>}</label>
                <textarea value={formAuditoria.observacao} onChange={e => setFormAuditoria(f => ({ ...f, observacao: e.target.value }))} placeholder={!formAuditoria.validado ? 'Informe o motivo...' : 'Opcional...'} rows={3} style={{ ...inputStyle, height: 'auto', padding: '8px 12px', resize: 'none' }} />
              </div>
              {erroAud && <p style={{ fontSize: 12, color: '#dc2626', marginBottom: 12 }}>{erroAud}</p>}
              <button onClick={salvarAuditoria} disabled={salvandoAud || !registro} style={{ width: '100%', height: 40, fontSize: 13, fontWeight: 500, cursor: salvandoAud || !registro ? 'not-allowed' : 'pointer', border: 'none', borderRadius: 8, opacity: salvandoAud || !registro ? 0.7 : 1, backgroundColor: formAuditoria.validado ? '#16a34a' : '#dc2626', color: 'white' }}>
                {salvandoAud ? 'Salvando...' : formAuditoria.validado ? 'Confirmar aprovação' : 'Confirmar reprovação'}
              </button>
              {auditorias.length > 0 && (
                <div style={{ marginTop: 24 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#333', margin: '0 0 12px' }}>Histórico</p>
                  {auditorias.map((log, i) => (
                    <div key={log.id} style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: '10px 14px', marginBottom: 8, borderLeft: `3px solid ${log.validado ? '#16a34a' : '#dc2626'}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 12, fontWeight: 500, color: log.validado ? '#16a34a' : '#dc2626' }}>{log.validado ? '✓ Validado' : '✗ Reprovado'}{i === 0 && <span style={{ fontSize: 10, color: '#aaa', marginLeft: 8 }}>mais recente</span>}</span>
                        <span style={{ fontSize: 11, color: '#aaa' }}>{new Date(log.data_auditoria).toLocaleString('pt-BR')}</span>
                      </div>
                      <p style={{ fontSize: 12, color: '#666', margin: '4px 0 0' }}>{log.auditor_email}</p>
                      {log.observacao && <p style={{ fontSize: 12, color: '#666', margin: '4px 0 0', fontStyle: 'italic' }}>"{log.observacao}"</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── PÁGINA PRINCIPAL ─────────────────────────────────────────────────────────

export default function BaseNRPage() {
  const router = useRouter()
  const { usuario } = useAuth()
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([])
  const [nrs, setNrs] = useState<NR[]>([])
  const [gerencias, setGerencias] = useState<Gerencia[]>([])
  const [bases, setBases] = useState<{ id: number; nome: string }[]>([])
  const [carregando, setCarregando] = useState(true)
  const [filtroBusca, setFiltroBusca] = useState('')
  const [filtroBase, setFiltroBase] = useState('')
  const [filtroSituacao, setFiltroSituacao] = useState('ATIVO')
  const [filtroGerencia, setFiltroGerencia] = useState('')
  const [filtroStatus, setFiltroStatus] = useState<'valido' | 'proximo' | 'vencido' | null>(null)
  const [compacto, setCompacto] = useState(false)
  const [colunasVisiveis, setColunasVisiveis] = useState<string[]>([])
  const [ordemColuna, setOrdemColuna] = useState<OrdemColuna>('nome')
  const [ordemDirecao, setOrdemDirecao] = useState<OrdemDirecao>('asc')
  const [modalDados, setModalDados] = useState<{ colaborador: Colaborador; registro: Registro | undefined; nr: NR; abaInicial: AbaModal } | null>(null)
  const [modalNovoTreinamento, setModalNovoTreinamento] = useState<Colaborador | null>(null)

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const [{ data: basesData }, { data: nrsData }, { data: gerenciasData }] = await Promise.all([
        supabase.from('bases').select('id, nome').order('nome'),
        supabase.from('regras_vencimento').select('id, nome_item, validade_dias').in('nome_item', NRS_ALVO).order('nome_item'),
        supabase.from('gerencias').select('id, sigla, nome').order('sigla'),
      ])
      setBases(basesData || [])
      setGerencias(gerenciasData || [])
      const nrsMapped: NR[] = (nrsData || []).map((r: any) => ({ id: r.id, nome: r.nome_item, validade_dias: r.validade_dias }))
      setNrs(nrsMapped)
      const todasCols = ['matricula', 'nome', 'funcao', 'gerencia', 'base', 'situacao', ...nrsMapped.map(n => `nr_${n.id}`)]
      setColunasVisiveis(todasCols)
      await buscarColaboradores(nrsMapped)
    }
    init()
  }, [])

  async function buscarColaboradores(nrsParam?: NR[]) {
    const nrsParaBuscar = nrsParam ?? nrs
    setCarregando(true)

    let colabQuery = supabase.from('colaboradores').select(`
      matricula, nome, funcao_id, situacao, data_admissao,
      bases (nome),
      funcoes (nome),
      gerencias (sigla, nome)
    `).order('nome')
    if (filtroSituacao) colabQuery = colabQuery.eq('situacao', filtroSituacao)
    if (filtroBase) colabQuery = colabQuery.eq('base_id', filtroBase)
    if (filtroGerencia) colabQuery = colabQuery.eq('gerencia_id', filtroGerencia)
    const { data: colabData } = await colabQuery

    const matriculas = (colabData || []).map((c: any) => c.matricula)
    const regraIds = nrsParaBuscar.map(n => n.id)
    const { data: registrosData } = matriculas.length > 0 && regraIds.length > 0
      ? await supabase.from('registros_exames').select(`
          id, matricula_colaborador, regra_id, data_realizacao, data_vencimento, url_arquivo,
          logs_auditoria (id, auditor_email, data_auditoria, validado, observacao),
          programacoes_exames (id, data_programada, observacao, criado_por, created_at)
        `).eq('is_atual', true).in('regra_id', regraIds).in('matricula_colaborador', matriculas)
      : { data: [] }

    const mapped = (colabData || []).map((c: any) => ({
      ...c,
      registros_exames: (registrosData || [])
        .filter((r: any) => r.matricula_colaborador === c.matricula)
        .map((r: any) => ({ ...r, programacoes: r.programacoes_exames || [] })),
    }))
    setColaboradores(mapped as unknown as Colaborador[])
    setCarregando(false)
  }

  useEffect(() => { buscarColaboradores() }, [filtroBase, filtroSituacao, filtroGerencia])

  function toggleOrdem(coluna: OrdemColuna) {
    if (ordemColuna === coluna) setOrdemDirecao(d => d === 'asc' ? 'desc' : 'asc')
    else { setOrdemColuna(coluna); setOrdemDirecao('asc') }
  }

  function limparFiltros() {
    setFiltroBusca(''); setFiltroBase(''); setFiltroSituacao('ATIVO'); setFiltroGerencia(''); setFiltroStatus(null)
  }

  function handleExportar(tipo: 'csv' | 'xlsx') {
    const dados = gerarDadosExportacao(ordenados, nrs)
    if (tipo === 'csv') exportarCSV(dados)
    else exportarXLSX(dados)
  }

  const filtradosSemStatus = colaboradores.filter(c => {
    if (filtroBusca) { const b = filtroBusca.toLowerCase(); if (!c.nome.toLowerCase().includes(b) && !c.matricula.includes(filtroBusca)) return false }
    return true
  })

  const filtrados = filtradosSemStatus.filter(c => {
    if (!filtroStatus) return true
    if (filtroStatus === 'valido') {
      return nrs.some(nr => {
        const reg = (c.registros_exames || []).find(r => r.regra_id === nr.id)
        if (!reg) return false
        if (nr.validade_dias === null) return true
        return getStatusVencimento(reg.data_vencimento!) === 'valido'
      })
    }
    return nrs.some(nr => {
      if (nr.validade_dias === null) return false
      const reg = (c.registros_exames || []).find(r => r.regra_id === nr.id)
      if (!reg || !reg.data_vencimento) return false
      return getStatusVencimento(reg.data_vencimento) === filtroStatus
    })
  })

  const ordenados = [...filtrados].sort((a, b) => {
    let vA = '', vB = ''
    if (ordemColuna === 'matricula') { vA = a.matricula; vB = b.matricula }
    else if (ordemColuna === 'nome') { vA = a.nome; vB = b.nome }
    else if (ordemColuna === 'funcao') { vA = a.funcoes?.nome || ''; vB = b.funcoes?.nome || '' }
    else if (ordemColuna === 'gerencia') { vA = a.gerencias?.sigla || ''; vB = b.gerencias?.sigla || '' }
    else if (ordemColuna === 'situacao') { vA = a.situacao; vB = b.situacao }
    else if (ordemColuna === 'base') { vA = a.bases?.nome || ''; vB = b.bases?.nome || '' }
    else if (ordemColuna.startsWith('nr_')) {
      const id = parseInt(ordemColuna.replace('nr_', ''))
      const nr = nrs.find(n => n.id === id)
      if (nr?.validade_dias === null) { vA = a.registros_exames?.some(r => r.regra_id === id) ? 'a' : 'z'; vB = b.registros_exames?.some(r => r.regra_id === id) ? 'a' : 'z' }
      else { vA = a.registros_exames?.find(r => r.regra_id === id)?.data_vencimento || '9999-99-99'; vB = b.registros_exames?.find(r => r.regra_id === id)?.data_vencimento || '9999-99-99' }
    }
    return ordemDirecao === 'asc' ? vA.localeCompare(vB) : vB.localeCompare(vA)
  })

  const stats = calcularStats(filtradosSemStatus, nrs)
  const temFiltroAtivo = !!(filtroBusca || filtroBase || filtroGerencia || filtroStatus || filtroSituacao !== 'ATIVO')

  const vis = (key: string) => colunasVisiveis.includes(key)
  const todasColunasDef = [
    { key: 'matricula', label: 'Matrícula' }, { key: 'nome', label: 'Nome' },
    { key: 'funcao', label: 'Função' }, { key: 'gerencia', label: 'Gerência' },
    { key: 'base', label: 'Base' }, { key: 'situacao', label: 'Situação' },
    ...nrs.map(n => ({ key: `nr_${n.id}`, label: n.nome })),
  ]

  const stickyBase: React.CSSProperties = { position: 'sticky', zIndex: 2 }
  const stickyHead: React.CSSProperties = { position: 'sticky', top: 0, zIndex: 3, backgroundColor: '#fafafa' }
  const padCell = compacto ? '4px 10px' : '8px 16px'
  const fontSize = compacto ? 12 : 13

  const selectStyle: React.CSSProperties = {
    height: 36, border: '1px solid #e0e0e0', borderRadius: 8,
    padding: '0 10px', fontSize: 13, backgroundColor: 'white', color: '#555',
  }

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ marginBottom: 12 }}>
        <h1 style={{ fontSize: 18, fontWeight: 600, color: '#1a1a1a', margin: 0 }}>Matriz de Competências</h1>
        <p style={{ fontSize: 12, color: '#888', margin: '3px 0 0', fontWeight: 500 }}>BASE NR — Normas Regulamentadoras</p>
      </div>

      {/* CARDS */}
      {carregando ? (
        <div style={{ display: 'flex', gap: 12, marginBottom: 12, overflowX: 'auto', paddingBottom: 4 }}>
          {[...Array(4)].map((_, i) => (
            <div key={i} style={{ backgroundColor: 'white', borderRadius: 10, padding: '10px 16px', border: '1px solid #f0f0f0', minWidth: 160, flex: '1 0 160px' }}>
              <div style={{ height: 10, backgroundColor: '#f0f0f0', borderRadius: 4, marginBottom: 8, width: '60%' }} />
              <div style={{ height: 24, backgroundColor: '#f0f0f0', borderRadius: 4, width: '40%' }} />
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 12, marginBottom: 12, overflowX: 'auto', paddingBottom: 4 }}>
          {[
            { label: 'Colaboradores',        valor: filtrados.length,   cor: '#4a4a49', status: null },
            { label: 'Treinamentos Válidos', valor: stats.validos,      cor: '#16a34a', status: 'valido' as const },
            { label: 'Próx. do Vencimento',  valor: stats.proximos,     cor: '#d97706', status: 'proximo' as const },
            { label: 'Vencidos',             valor: stats.vencidos,     cor: '#dc2626', status: 'vencido' as const },
          ].map((card, i) => {
            const ativo = filtroStatus === card.status && card.status !== null
            return (
              <div key={i} onClick={() => card.status !== null && setFiltroStatus(ativo ? null : card.status)} style={{ backgroundColor: ativo ? card.cor + '10' : 'white', borderRadius: 10, padding: '10px 16px', border: ativo ? `2px solid ${card.cor}` : '1px solid #f0f0f0', minWidth: 160, flex: '1 0 160px', cursor: card.status !== null ? 'pointer' : 'default', transition: 'all 0.15s ease', boxShadow: ativo ? `0 2px 8px ${card.cor}30` : 'none' }}>
                <p style={{ fontSize: 11, color: '#888', margin: '0 0 4px' }}>{card.label}{ativo && <span style={{ marginLeft: 6, fontSize: 10, color: card.cor }}>● filtrado</span>}</p>
                <p style={{ fontSize: 24, fontWeight: 600, color: card.cor, margin: 0 }}>{card.valor.toLocaleString('pt-BR')}</p>
              </div>
            )
          })}
        </div>
      )}

      {/* FILTROS */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="text" placeholder="Nome ou matrícula..." value={filtroBusca} onChange={e => setFiltroBusca(e.target.value)} style={{ ...selectStyle, width: 200, padding: '0 12px' }} />
        <select value={filtroBase} onChange={e => setFiltroBase(e.target.value)} style={{ ...selectStyle, width: 150 }}>
          <option value="">Todas as bases</option>
          {bases.map(b => <option key={b.id} value={b.id}>{b.nome}</option>)}
        </select>
        <select value={filtroSituacao} onChange={e => setFiltroSituacao(e.target.value)} style={{ ...selectStyle, width: 130 }}>
          <option value="">Todas</option>
          <option value="ATIVO">Ativo</option>
          <option value="AF.PREVIDÊNCIA">AF. Prev.</option>
          <option value="APOS.INVALIDEZ">Apos.</option>
        </select>
        <select value={filtroGerencia} onChange={e => setFiltroGerencia(e.target.value)} style={{ ...selectStyle, width: 150 }}>
          <option value="">Todas as gerências</option>
          {gerencias.map(g => <option key={g.id} value={g.id}>{g.sigla} – {g.nome}</option>)}
        </select>
        <div style={{ flex: 1 }} />
        {temFiltroAtivo && <button onClick={limparFiltros} style={{ height: 36, padding: '0 12px', fontSize: 12, border: '1px solid #fca5a5', borderRadius: 8, backgroundColor: '#fef2f2', color: '#dc2626', cursor: 'pointer' }}>✕ Limpar</button>}
        <button onClick={() => setCompacto(c => !c)} style={{ height: 36, padding: '0 12px', fontSize: 12, border: `1px solid ${compacto ? COR : '#e0e0e0'}`, borderRadius: 8, backgroundColor: compacto ? '#fdf2f5' : 'white', color: compacto ? COR : '#555', cursor: 'pointer' }}>⊟ Compacto</button>
        {colunasVisiveis.length > 0 && <SeletorColunas colunas={todasColunasDef} visiveis={colunasVisiveis} onChange={setColunasVisiveis} />}
        <BotaoExportar onClick={handleExportar} />
      </div>

      {/* TABELA */}
      {carregando ? <p style={{ color: '#888', fontSize: 14 }}>Carregando...</p> : (
        <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 230px)', borderRadius: 12, border: '1px solid #f0f0f0', flex: 1 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: 'white', fontSize }}>
            <thead>
              <tr style={{ backgroundColor: '#fafafa', borderBottom: '1px solid #f0f0f0' }}>
                {vis('matricula') && <ThOrdenavel label="Matrícula" coluna="matricula" ordemAtual={ordemColuna} direcao={ordemDirecao} onClick={toggleOrdem} style={{ ...stickyHead, left: 0, minWidth: 100 }} />}
                {vis('nome') && <ThOrdenavel label="Nome" coluna="nome" ordemAtual={ordemColuna} direcao={ordemDirecao} onClick={toggleOrdem} style={{ ...stickyHead, left: vis('matricula') ? 100 : 0, minWidth: 220 }} />}
                {vis('funcao') && <ThOrdenavel label="Função" coluna="funcao" ordemAtual={ordemColuna} direcao={ordemDirecao} onClick={toggleOrdem} style={{ ...stickyHead }} />}
                {vis('gerencia') && <ThOrdenavel label="Gerência" coluna="gerencia" ordemAtual={ordemColuna} direcao={ordemDirecao} onClick={toggleOrdem} style={{ ...stickyHead }} />}
                {vis('base') && <ThOrdenavel label="Base" coluna="base" ordemAtual={ordemColuna} direcao={ordemDirecao} onClick={toggleOrdem} style={{ ...stickyHead }} />}
                {vis('situacao') && <ThOrdenavel label="Situação" coluna="situacao" ordemAtual={ordemColuna} direcao={ordemDirecao} onClick={toggleOrdem} style={{ ...stickyHead }} />}
                {nrs.filter(n => vis(`nr_${n.id}`)).map(n => (
                  <ThOrdenavel key={n.id} label={n.nome} coluna={`nr_${n.id}` as OrdemColuna} ordemAtual={ordemColuna} direcao={ordemDirecao} onClick={toggleOrdem} style={{ ...stickyHead, textAlign: 'center' }} />
                ))}
              </tr>
            </thead>
            <tbody>
              {ordenados.length === 0 ? (
                <tr><td colSpan={99} style={{ padding: '40px 20px', textAlign: 'center', color: '#aaa', fontSize: 14 }}>Nenhum colaborador encontrado.</td></tr>
              ) : ordenados.map((colab, i) => {
                const bgRow = i % 2 === 0 ? 'white' : '#fafafa'
                return (
                  <tr key={colab.matricula} style={{ borderBottom: '1px solid #f5f5f5', backgroundColor: bgRow }}>
                    {vis('matricula') && <td style={{ ...stickyBase, left: 0, padding: padCell, color: '#666', verticalAlign: 'middle', minWidth: 100, borderRight: '1px solid #f0f0f0', backgroundColor: bgRow }}>{colab.matricula}</td>}
                    {vis('nome') && (
                      <td style={{ ...stickyBase, left: vis('matricula') ? 100 : 0, padding: padCell, verticalAlign: 'middle', minWidth: 220, borderRight: '1px solid #f0f0f0', backgroundColor: bgRow }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontWeight: 500, color: '#333', whiteSpace: 'nowrap' }}>{colab.nome}</span>
                          <button title="Adicionar novo treinamento NR" onClick={e => { e.stopPropagation(); setModalNovoTreinamento(colab) }}
                            style={{ width: 20, height: 20, borderRadius: '50%', backgroundColor: '#f0f0f0', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: '#888', flexShrink: 0, lineHeight: 1 }}
                            onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#fdf2f5'; e.currentTarget.style.color = COR }}
                            onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#f0f0f0'; e.currentTarget.style.color = '#888' }}>+</button>
                        </div>
                      </td>
                    )}
                    {vis('funcao') && <td style={{ padding: padCell, color: '#666', whiteSpace: 'nowrap', verticalAlign: 'middle' }}>{colab.funcoes?.nome || '—'}</td>}
                    {vis('gerencia') && <td style={{ padding: padCell, color: '#666', whiteSpace: 'nowrap', verticalAlign: 'middle' }}>
                      {colab.gerencias ? (
                        <span title={colab.gerencias.nome} style={{ fontSize: compacto ? 11 : 12, padding: '2px 8px', borderRadius: 99, backgroundColor: '#f0f0f0', color: '#444', fontWeight: 500 }}>{colab.gerencias.sigla}</span>
                      ) : '—'}
                    </td>}
                    {vis('base') && <td style={{ padding: padCell, color: '#666', whiteSpace: 'nowrap', verticalAlign: 'middle' }}>{colab.bases?.nome || '—'}</td>}
                    {vis('situacao') && <td style={{ padding: padCell, verticalAlign: 'middle' }}><span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, backgroundColor: colab.situacao === 'ATIVO' ? '#f0fdf4' : '#fef2f2', color: colab.situacao === 'ATIVO' ? '#16a34a' : '#dc2626' }}>{colab.situacao}</span></td>}
                    {nrs.filter(n => vis(`nr_${n.id}`)).map(nr => {
                      const reg = colab.registros_exames?.find(r => r.regra_id === nr.id)
                      return (
                        <CelulaExameNR key={nr.id} registro={reg} semPrazo={nr.validade_dias === null} compacto={compacto}
                          onClick={() => setModalDados({ colaborador: colab, registro: reg, nr, abaInicial: 'info' })}
                          onClickIcone={tipo => setModalDados({ colaborador: colab, registro: reg, nr, abaInicial: tipo === 'documento' ? 'documento' : 'programacao' })}
                        />
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {modalDados && (
        <ModalExame
          dados={modalDados}
          abaInicial={modalDados.abaInicial}
          onFechar={() => setModalDados(null)}
          onAtualizar={buscarColaboradores}
          usuarioEmail={usuario?.email || ''}
          podeAuditar={usuario?.pode_auditar || false}
          nivelUsuario={usuario?.nivel || 'visualizador'}
        />
      )}
      {modalNovoTreinamento && (
        <ModalNovoTreinamento
          colaborador={modalNovoTreinamento}
          nrs={nrs}
          onFechar={() => setModalNovoTreinamento(null)}
          onAtualizar={buscarColaboradores}
          usuarioEmail={usuario?.email || ''}
        />
      )}
    </div>
  )
}
