'use client'

import { useEffect, useState, useMemo } from 'react'
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
const SITUACOES_EXCLUIDAS = ['DEMITIDO', 'AF.PREVIDÊNCIA', 'LICENÇA MATERNIDADE']
const NRS_ALVO = ['NR 10-B', 'NR 11', 'NR 12 - II', 'NR 12 - V', 'NR 12 - XII', 'NR 35']
const POS_ALVO = ['Direção Defensiva', 'Pilotagem Defensiva']
const LOTE = 100

type AbaModulo = 'geral' | 'nr' | 'po' | 'medicina'
type SituacaoNR = 'proximo' | 'vencido' | 'programado'
type SituacaoMed = 'critico' | 'atencao' | 'vencido'
type FiltroAtivo = { tipo: 'base' | 'gerencia' | 'supervisor'; valor: string } | null

interface MatrizNR { funcao: string; processo: string | null; treinamento: string; obrigatorio: string }
interface ColabNR {
  matricula: string; funcao: string | null; processo: string | null
  base: string | null; gerencia: string | null; supervisor: string | null
  registros: Record<number, { data_vencimento: string | null; programacoes: string[] }>
}
interface ColabPO {
  matricula: string; direcao: string; pilotagem: string
  base: string | null; gerencia: string | null; supervisor: string | null
  registros: Record<number, { data_vencimento: string | null; programacoes: string[] }>
}
interface ColabMed {
  matricula: string; base: string | null; gerencia: string | null; supervisor: string | null
  asoVencimento: string | null; asoProgramacoes: string[]
}
interface StatsGeral {
  totalAtivos: number
  nrValidos: number; nrProximos: number; nrVencidos: number; nrProgramados: number
  poValidos: number; poProximos: number; poVencidos: number; poProgramados: number
  medNoPrazo: number; medCritico: number; medAtencao: number; medVencido: number; medProgramados: number
}

function getDias(dv: string | null): number | null {
  if (!dv) return null
  return Math.ceil((new Date(dv + 'T12:00:00').getTime() - new Date().getTime()) / 86400000)
}
function getStatus(dv: string): 'valido' | 'proximo' | 'vencido' {
  const diff = (new Date(dv).getTime() - new Date().getTime()) / 86400000
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
function getObrigatoriedade(matriz: MatrizNR[], funcao: string | null, processo: string | null, nomeNr: string): 'SIM' | 'NAO' | 'NA' {
  if (!funcao) return 'NA'
  const fC = funcao.trim().toUpperCase()
  const pC = (processo || '').trim().toUpperCase()
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

function calcStatsNR(colabs: ColabNR[], nrs: { id: number; nome: string; validade_dias: number | null }[], matriz: MatrizNR[]) {
  let v = 0, p = 0, vc = 0, prog = 0
  colabs.forEach(c => {
    nrs.forEach(nr => {
      if (getObrigatoriedade(matriz, c.funcao, c.processo, nr.nome) !== 'SIM') return
      const reg = c.registros[nr.id]
      if (!reg) { vc++; return }
      if (nr.validade_dias === null) { v++; return }
      const s = getStatus(reg.data_vencimento!)
      if (s === 'valido') v++
      else if (s === 'proximo') p++
      else vc++
      if ((s === 'proximo' || s === 'vencido') && reg.programacoes.some(d => d >= hoje)) prog++
    })
  })
  return { validos: v, proximos: p, vencidos: vc, programados: prog }
}
function calcStatsPO(colabs: ColabPO[], pos: { id: number; nome: string; validade_dias: number }[]) {
  let v = 0, p = 0, vc = 0, prog = 0
  colabs.forEach(c => {
    pos.forEach(po => {
      const campo = po.nome === 'Direção Defensiva' ? c.direcao : c.pilotagem
      if (campo !== 'SIM') return
      const reg = c.registros[po.id]
      if (!reg) { vc++; return }
      const s = getStatus(reg.data_vencimento!)
      if (s === 'valido') v++
      else if (s === 'proximo') p++
      else vc++
      if ((s === 'proximo' || s === 'vencido') && reg.programacoes.some(d => d >= hoje)) prog++
    })
  })
  return { validos: v, proximos: p, vencidos: vc, programados: prog }
}
function calcStatsMed(colabs: ColabMed[]) {
  let mNP = 0, mC = 0, mA = 0, mV = 0, mProg = 0
  colabs.forEach(c => {
    const st = getStatusMed(c.asoVencimento)
    if (st === 'no_prazo') mNP++
    else if (st === 'critico') mC++
    else if (st === 'atencao') mA++
    else if (st === 'vencido') mV++
    if ((st === 'critico' || st === 'atencao' || st === 'vencido') && c.asoProgramacoes.some(d => d >= hoje)) mProg++
  })
  return { mNP, mC, mA, mV, mProg }
}

async function buscarRegistrosEmLotes(
  matriculas: string[], regraIds: number[],
  map: Record<string, Record<number, { data_vencimento: string | null; programacoes: string[] }>>
) {
  for (let i = 0; i < matriculas.length; i += LOTE) {
    const lote = matriculas.slice(i, i + LOTE)
    let from = 0
    while (true) {
      const { data: rd } = await supabase.from('registros_exames')
        .select('matricula_colaborador, regra_id, data_vencimento, programacoes_exames(data_programada)')
        .eq('is_atual', true).in('regra_id', regraIds).in('matricula_colaborador', lote)
        .range(from, from + 499)
      if (!rd || rd.length === 0) break
      rd.forEach((r: any) => {
        if (!map[r.matricula_colaborador]) map[r.matricula_colaborador] = {}
        map[r.matricula_colaborador][r.regra_id] = {
          data_vencimento: r.data_vencimento,
          programacoes: (r.programacoes_exames || []).map((p: any) => p.data_programada),
        }
      })
      if (rd.length < 500) break
      from += 500
    }
  }
}

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
        const s = getStatus(reg.data_vencimento!)
        if (!((s === 'proximo' || s === 'vencido') && reg.programacoes.some(d => d >= hoje))) return
      } else if (situacao === 'proximo') {
        if (!reg || getStatus(reg.data_vencimento!) !== 'proximo') return
      } else {
        if (reg && getStatus(reg.data_vencimento!) !== 'vencido') return
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
        if (!reg) return
        const s = getStatus(reg.data_vencimento!)
        if (!((s === 'proximo' || s === 'vencido') && reg.programacoes.some(d => d >= hoje))) return
      } else if (situacao === 'proximo') {
        if (!reg || getStatus(reg.data_vencimento!) !== 'proximo') return
      } else {
        if (reg && getStatus(reg.data_vencimento!) !== 'vencido') return
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
    if (st === 'sem_aso' || st === 'no_prazo' || st !== situacao) return
    const chave = agrup === 'base' ? c.base : agrup === 'gerencia' ? c.gerencia : c.supervisor
    if (!chave) return
    grupos[chave] = (grupos[chave] || 0) + 1
  })
  return Object.entries(grupos).map(([nome, total]) => ({ nome, total })).sort((a, b) => b.total - a.total)
}

function corSituacaoNR(s: SituacaoNR) { return s === 'proximo' ? CORES_STATUS.laranja : s === 'vencido' ? CORES_STATUS.vermelho : CORES_STATUS.roxo }
function corSituacaoMed(s: SituacaoMed) { return s === 'critico' ? CORES_STATUS.laranja : s === 'atencao' ? CORES_STATUS.amarelo : CORES_STATUS.vermelho }

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
  const ops: { key: SituacaoNR; label: string; cor: string }[] = [
    { key: 'proximo', label: 'Próximos do Vencimento', cor: CORES_STATUS.laranja },
    { key: 'vencido', label: 'Vencidos', cor: CORES_STATUS.vermelho },
    { key: 'programado', label: 'Programados', cor: CORES_STATUS.roxo },
  ]
  return (
    <div style={{ display: 'inline-flex', backgroundColor: '#f4f4f5', borderRadius: 12, padding: 4, border: `1px solid ${COR_BORDA}`, gap: 2 }}>
      {ops.map(op => (
        <button key={op.key} onClick={() => onChange(op.key)} style={{ padding: '8px 16px', fontSize: 13, fontWeight: valor === op.key ? 600 : 500, border: 'none', borderRadius: 8, cursor: 'pointer', backgroundColor: valor === op.key ? '#fff' : 'transparent', color: valor === op.key ? op.cor : COR_TEXTO_SECUNDARIO, boxShadow: valor === op.key ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', transition: 'all 0.2s' }}>{op.label}</button>
      ))}
    </div>
  )
}

function ToggleSituacaoMed({ valor, onChange }: { valor: SituacaoMed; onChange: (v: SituacaoMed) => void }) {
  const ops: { key: SituacaoMed; label: string; cor: string }[] = [
    { key: 'critico', label: 'Prazo Crítico', cor: CORES_STATUS.laranja },
    { key: 'atencao', label: 'Bernhoeft c/ Atenção', cor: CORES_STATUS.amarelo },
    { key: 'vencido', label: 'Vencidos', cor: CORES_STATUS.vermelho },
  ]
  return (
    <div style={{ display: 'inline-flex', backgroundColor: '#f4f4f5', borderRadius: 12, padding: 4, border: `1px solid ${COR_BORDA}`, gap: 2 }}>
      {ops.map(op => (
        <button key={op.key} onClick={() => onChange(op.key)} style={{ padding: '8px 16px', fontSize: 13, fontWeight: valor === op.key ? 600 : 500, border: 'none', borderRadius: 8, cursor: 'pointer', backgroundColor: valor === op.key ? '#fff' : 'transparent', color: valor === op.key ? op.cor : COR_TEXTO_SECUNDARIO, boxShadow: valor === op.key ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', transition: 'all 0.2s' }}>{op.label}</button>
      ))}
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

function GraficoHorizontal({ dados, cor, titulo, vazio, tipoAgrup, filtroAtivo, onFiltro }: {
  dados: { nome: string; total: number }[]; cor: string; titulo: string; vazio: string
  tipoAgrup: 'base' | 'gerencia' | 'supervisor'; filtroAtivo: FiltroAtivo; onFiltro: (f: FiltroAtivo) => void
}) {
  if (!dados.length) return (
    <div style={{ backgroundColor: COR_CARD, borderRadius: 16, padding: '24px', border: `1px solid ${COR_BORDA}` }}>
      <p style={{ fontSize: 14, fontWeight: 700, color: COR_TEXTO_PRINCIPAL, margin: '0 0 12px' }}>{titulo}</p>
      <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ fontSize: 13, color: '#ccc' }}>{vazio}</p>
      </div>
    </div>
  )
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
          <Bar dataKey="total" radius={[0, 6, 6, 0]} barSize={22}
            label={{ position: 'right', fontSize: 12, fill: COR_TEXTO_SECUNDARIO, fontWeight: 600 }}
            onClick={(data: any) => {
              const ativo = filtroAtivo?.tipo === tipoAgrup && filtroAtivo?.valor === data.nome
              onFiltro(ativo ? null : { tipo: tipoAgrup, valor: data.nome })
            }}
            style={{ cursor: 'pointer' }}>
            {dados.map((entry) => {
              const selecionado = filtroAtivo?.tipo === tipoAgrup && filtroAtivo?.valor === entry.nome
              const desbotado = filtroAtivo?.tipo === tipoAgrup && filtroAtivo?.valor !== entry.nome
              return <Cell key={entry.nome} fill={desbotado ? '#d1d5db' : cor} opacity={selecionado ? 1 : desbotado ? 0.5 : 1} />
            })}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function GraficoVertical({ dados, cor, titulo, vazio, tipoAgrup, filtroAtivo, onFiltro }: {
  dados: { nome: string; total: number }[]; cor: string; titulo: string; vazio: string
  tipoAgrup: 'base' | 'gerencia' | 'supervisor'; filtroAtivo: FiltroAtivo; onFiltro: (f: FiltroAtivo) => void
}) {
  const top10 = [...dados].sort((a, b) => b.total - a.total).slice(0, 10)
  if (!top10.length) return (
    <div style={{ backgroundColor: COR_CARD, borderRadius: 16, padding: '24px', border: `1px solid ${COR_BORDA}` }}>
      <p style={{ fontSize: 14, fontWeight: 700, color: COR_TEXTO_PRINCIPAL, margin: '0 0 16px' }}>{titulo}</p>
      <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ fontSize: 13, color: '#ccc' }}>{vazio}</p>
      </div>
    </div>
  )
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
          <Bar dataKey="total" radius={[6, 6, 0, 0]} barSize={32}
            label={{ position: 'top', fontSize: 12, fill: COR_TEXTO_SECUNDARIO, fontWeight: 600 }}
            onClick={(data: any) => {
              const ativo = filtroAtivo?.tipo === tipoAgrup && filtroAtivo?.valor === data.nome
              onFiltro(ativo ? null : { tipo: tipoAgrup, valor: data.nome })
            }}
            style={{ cursor: 'pointer' }}>
            {top10.map((entry) => {
              const selecionado = filtroAtivo?.tipo === tipoAgrup && filtroAtivo?.valor === entry.nome
              const desbotado = filtroAtivo?.tipo === tipoAgrup && filtroAtivo?.valor !== entry.nome
              return <Cell key={entry.nome} fill={desbotado ? '#d1d5db' : cor} opacity={selecionado ? 1 : desbotado ? 0.5 : 1} />
            })}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function SecaoGraficosNR({ colabs, nrs, matriz, situacao, filtroAtivo, onFiltro }: {
  colabs: ColabNR[]; nrs: { id: number; nome: string; validade_dias: number | null }[]
  matriz: MatrizNR[]; situacao: SituacaoNR; filtroAtivo: FiltroAtivo; onFiltro: (f: FiltroAtivo) => void
}) {
  const cor = corSituacaoNR(situacao)
  const dadosBase = useMemo(() => contarNRPorGrupo(colabs, nrs, matriz, 'base', situacao), [colabs, nrs, matriz, situacao])
  const dadosGer  = useMemo(() => contarNRPorGrupo(colabs, nrs, matriz, 'gerencia', situacao), [colabs, nrs, matriz, situacao])
  const dadosSup  = useMemo(() => contarNRPorGrupo(colabs, nrs, matriz, 'supervisor', situacao), [colabs, nrs, matriz, situacao])
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <GraficoHorizontal dados={dadosBase} cor={cor} titulo="Por Base"     vazio="Sem dados por base"     tipoAgrup="base"     filtroAtivo={filtroAtivo} onFiltro={onFiltro} />
        <GraficoHorizontal dados={dadosGer}  cor={cor} titulo="Por Gerência" vazio="Sem dados de gerência"  tipoAgrup="gerencia" filtroAtivo={filtroAtivo} onFiltro={onFiltro} />
      </div>
      <GraficoVertical dados={dadosSup} cor={cor} titulo="Por Supervisor" vazio="Sem dados de supervisor" tipoAgrup="supervisor" filtroAtivo={filtroAtivo} onFiltro={onFiltro} />
    </div>
  )
}

function SecaoGraficosPO({ colabs, pos, situacao, filtroAtivo, onFiltro }: {
  colabs: ColabPO[]; pos: { id: number; nome: string; validade_dias: number }[]
  situacao: SituacaoNR; filtroAtivo: FiltroAtivo; onFiltro: (f: FiltroAtivo) => void
}) {
  const cor = corSituacaoNR(situacao)
  const dadosBase = useMemo(() => contarPOPorGrupo(colabs, pos, 'base', situacao), [colabs, pos, situacao])
  const dadosGer  = useMemo(() => contarPOPorGrupo(colabs, pos, 'gerencia', situacao), [colabs, pos, situacao])
  const dadosSup  = useMemo(() => contarPOPorGrupo(colabs, pos, 'supervisor', situacao), [colabs, pos, situacao])
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <GraficoHorizontal dados={dadosBase} cor={cor} titulo="Por Base"     vazio="Sem dados por base"     tipoAgrup="base"     filtroAtivo={filtroAtivo} onFiltro={onFiltro} />
        <GraficoHorizontal dados={dadosGer}  cor={cor} titulo="Por Gerência" vazio="Sem dados de gerência"  tipoAgrup="gerencia" filtroAtivo={filtroAtivo} onFiltro={onFiltro} />
      </div>
      <GraficoVertical dados={dadosSup} cor={cor} titulo="Por Supervisor" vazio="Sem dados de supervisor" tipoAgrup="supervisor" filtroAtivo={filtroAtivo} onFiltro={onFiltro} />
    </div>
  )
}

function SecaoGraficosMed({ colabs, situacao, filtroAtivo, onFiltro }: {
  colabs: ColabMed[]; situacao: SituacaoMed; filtroAtivo: FiltroAtivo; onFiltro: (f: FiltroAtivo) => void
}) {
  const cor = corSituacaoMed(situacao)
  const dadosBase = useMemo(() => contarMedPorGrupo(colabs, 'base', situacao), [colabs, situacao])
  const dadosGer  = useMemo(() => contarMedPorGrupo(colabs, 'gerencia', situacao), [colabs, situacao])
  const dadosSup  = useMemo(() => contarMedPorGrupo(colabs, 'supervisor', situacao), [colabs, situacao])
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <GraficoHorizontal dados={dadosBase} cor={cor} titulo="Por Base"     vazio="Sem dados por base"     tipoAgrup="base"     filtroAtivo={filtroAtivo} onFiltro={onFiltro} />
        <GraficoHorizontal dados={dadosGer}  cor={cor} titulo="Por Gerência" vazio="Sem dados de gerência"  tipoAgrup="gerencia" filtroAtivo={filtroAtivo} onFiltro={onFiltro} />
      </div>
      <GraficoVertical dados={dadosSup} cor={cor} titulo="Por Supervisor" vazio="Sem dados de supervisor" tipoAgrup="supervisor" filtroAtivo={filtroAtivo} onFiltro={onFiltro} />
    </div>
  )
}

export default function DashboardPage() {
  const router = useRouter()
  const [abaModulo, setAbaModulo] = useState<AbaModulo>('geral')
  const [situacaoNR,  setSituacaoNR]  = useState<SituacaoNR>('proximo')
  const [situacaoPO,  setSituacaoPO]  = useState<SituacaoNR>('proximo')
  const [situacaoMed, setSituacaoMed] = useState<SituacaoMed>('atencao')
  const [filtroNR,  setFiltroNR]  = useState<FiltroAtivo>(null)
  const [filtroPO,  setFiltroPO]  = useState<FiltroAtivo>(null)
  const [filtroMed, setFiltroMed] = useState<FiltroAtivo>(null)
  const [loading, setLoading] = useState(true)
  const [statsGeral, setStatsGeral] = useState<StatsGeral>({ totalAtivos: 0, nrValidos: 0, nrProximos: 0, nrVencidos: 0, nrProgramados: 0, poValidos: 0, poProximos: 0, poVencidos: 0, poProgramados: 0, medNoPrazo: 0, medCritico: 0, medAtencao: 0, medVencido: 0, medProgramados: 0 })
  const [colabsNR,  setColabsNR]  = useState<ColabNR[]>([])
  const [colabsPO,  setColabsPO]  = useState<ColabPO[]>([])
  const [colabsMed, setColabsMed] = useState<ColabMed[]>([])
  const [nrsData,   setNrsData]   = useState<{ id: number; nome: string; validade_dias: number | null }[]>([])
  const [posData,   setPosData]   = useState<{ id: number; nome: string; validade_dias: number }[]>([])
  const [matrizNR,  setMatrizNR]  = useState<MatrizNR[]>([])

  const aplicarFiltro = (colabs: any[], filtro: FiltroAtivo) => {
    if (!filtro) return colabs
    return colabs.filter((c: any) => {
      if (filtro.tipo === 'base') return c.base === filtro.valor
      if (filtro.tipo === 'gerencia') return c.gerencia === filtro.valor
      return c.supervisor === filtro.valor
    })
  }

  const colabsNRFiltrados = useMemo(() => aplicarFiltro(colabsNR, filtroNR) as ColabNR[], [colabsNR, filtroNR])
  const colabsPOFiltrados  = useMemo(() => aplicarFiltro(colabsPO, filtroPO) as ColabPO[],  [colabsPO, filtroPO])
  const colabsMedFiltrados = useMemo(() => aplicarFiltro(colabsMed, filtroMed) as ColabMed[], [colabsMed, filtroMed])

  const statsNR  = useMemo(() => calcStatsNR(colabsNRFiltrados, nrsData, matrizNR), [colabsNRFiltrados, nrsData, matrizNR])
  const statsPO  = useMemo(() => calcStatsPO(colabsPOFiltrados, posData), [colabsPOFiltrados, posData])
  const statsMed = useMemo(() => calcStatsMed(colabsMedFiltrados), [colabsMedFiltrados])

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
        const { data: cd } = await supabase.from('colaboradores')
          .select('matricula, situacao, processo, gerencia, bases(nome), funcoes(nome), supervisor')
          .order('nome').range(from, from + 499)
        if (!cd || cd.length === 0) break
        todosColabs = [...todosColabs, ...cd]
        if (cd.length < 500) break
        from += 500
      }
      todosColabs = todosColabs.filter((c: any) => !SITUACOES_EXCLUIDAS.includes(c.situacao))

      const colabInfo: Record<string, any> = {}
      todosColabs.forEach((c: any) => {
        colabInfo[c.matricula] = {
          funcao: c.funcoes?.nome || null,
          processo: c.processo || null,
          base: c.bases?.nome || null,
          gerencia: c.gerencia || null,
          supervisor: c.supervisor ? c.supervisor.trim().split(' ')[0] : null,
        }
      })
      const mats = todosColabs.map((c: any) => c.matricula)

      const matsNR = mats.filter((mat: string) => {
        const c = colabInfo[mat]
        if (!c?.funcao) return false
        return mNR.some(m => {
          const mF = m.funcao.trim().toUpperCase(); const fC = c.funcao.trim().toUpperCase()
          if (m.processo && m.processo.trim() !== '') return mF === fC && m.processo.trim().toUpperCase() === (c.processo || '').trim().toUpperCase()
          return mF === fC
        })
      })

      const regsNRMap: Record<string, Record<number, any>> = {}
      if (matsNR.length > 0) await buscarRegistrosEmLotes(matsNR, nrs.map(n => n.id), regsNRMap)
      const cNR: ColabNR[] = matsNR.map((mat: string) => ({ matricula: mat, ...colabInfo[mat], registros: regsNRMap[mat] || {} }))
      setColabsNR(cNR)

      const matrizPOMap: Record<string, any> = {}
      for (let i = 0; i < mats.length; i += LOTE) {
        const { data: mpd } = await supabase.from('matriz_po').select('matricula, direcao_defensiva, pilotagem_defensiva').in('matricula', mats.slice(i, i + LOTE))
        ;(mpd || []).forEach((m: any) => { matrizPOMap[m.matricula] = { direcao: (m.direcao_defensiva || 'N/A').trim().toUpperCase(), pilotagem: (m.pilotagem_defensiva || 'N/A').trim().toUpperCase() } })
      }
      const regsPOMap: Record<string, Record<number, any>> = {}
      if (mats.length > 0) await buscarRegistrosEmLotes(mats, pos.map(p => p.id), regsPOMap)
      const cPO: ColabPO[] = mats.map((mat: string) => {
        const mpo = matrizPOMap[mat] || { direcao: 'N/A', pilotagem: 'N/A' }
        return { matricula: mat, ...colabInfo[mat], direcao: mpo.direcao, pilotagem: mpo.pilotagem, registros: regsPOMap[mat] || {} }
      }).filter((c: ColabPO) => c.direcao === 'SIM' || c.pilotagem === 'SIM')
      setColabsPO(cPO)

      const asosPorColab: Record<string, any> = {}
      for (let i = 0; i < mats.length; i += LOTE) {
        const lote = mats.slice(i, i + LOTE); from = 0
        while (true) {
          const { data: ad } = await supabase.from('asos').select('matricula_colaborador, data_vencimento, data_realizacao, programacoes_exames(data_programada)').eq('tipo', 'periodico').in('matricula_colaborador', lote).range(from, from + 499)
          if (!ad || ad.length === 0) break
          ad.forEach((a: any) => {
            const atual = asosPorColab[a.matricula_colaborador]
            if (!atual || new Date(a.data_realizacao) > new Date(atual.data_realizacao)) {
              asosPorColab[a.matricula_colaborador] = { data_vencimento: a.data_vencimento, data_realizacao: a.data_realizacao, programacoes: (a.programacoes_exames || []).map((p: any) => p.data_programada) }
            }
          })
          if (ad.length < 500) break; from += 500
        }
      }
      const cMed: ColabMed[] = mats.map((mat: string) => ({ matricula: mat, ...colabInfo[mat], asoVencimento: asosPorColab[mat]?.data_vencimento || null, asoProgramacoes: asosPorColab[mat]?.programacoes || [] }))
      setColabsMed(cMed)

      const sNR = calcStatsNR(cNR, nrs, mNR)
      const sPO = calcStatsPO(mats.map((mat: string) => { const mpo = matrizPOMap[mat] || { direcao: 'N/A', pilotagem: 'N/A' }; return { matricula: mat, ...colabInfo[mat], direcao: mpo.direcao, pilotagem: mpo.pilotagem, registros: regsPOMap[mat] || {} } }), pos)
      const sM = calcStatsMed(cMed)
      setStatsGeral({ totalAtivos: todosColabs.length, nrValidos: sNR.validos, nrProximos: sNR.proximos, nrVencidos: sNR.vencidos, nrProgramados: sNR.programados, poValidos: sPO.validos, poProximos: sPO.proximos, poVencidos: sPO.vencidos, poProgramados: sPO.programados, medNoPrazo: sM.mNP, medCritico: sM.mC, medAtencao: sM.mA, medVencido: sM.mV, medProgramados: sM.mProg })
      setLoading(false)
    }
    carregar()
  }, [])

  const ABAS: { key: AbaModulo; label: string }[] = [
    { key: 'geral', label: 'Visão Geral' },
    { key: 'nr', label: 'BASE NR' },
    { key: 'po', label: 'BASE PO' },
    { key: 'medicina', label: 'Medicina do Trabalho' },
  ]

  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif', display: 'flex', flexDirection: 'column', gap: 24, minHeight: '100vh', padding: '24px 32px' }}>
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: COR_TEXTO_PRINCIPAL, margin: 0, letterSpacing: '-0.5px' }}>Dashboard</h1>
        <p style={{ fontSize: 14, color: COR_TEXTO_SECUNDARIO, margin: '4px 0 0' }}>Acompanhe os principais indicadores e vencimentos do SegVenc.</p>
      </div>

      <div style={{ display: 'flex', gap: 24, borderBottom: `1px solid ${COR_BORDA}`, marginTop: 8 }}>
        {ABAS.map(a => (
          <button key={a.key} onClick={() => { setAbaModulo(a.key as AbaModulo); setFiltroNR(null); setFiltroPO(null); setFiltroMed(null) }}
            style={{ padding: '12px 4px', fontSize: 14, fontWeight: abaModulo === a.key ? 600 : 500, border: 'none', background: 'none', cursor: 'pointer', color: abaModulo === a.key ? COR_PRIMARIA : COR_TEXTO_SECUNDARIO, borderBottom: abaModulo === a.key ? `2px solid ${COR_PRIMARIA}` : '2px solid transparent', marginBottom: -1, transition: 'color 0.2s' }}>{a.label}</button>
        ))}
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
          <p style={{ color: COR_TEXTO_SECUNDARIO, fontSize: 15, fontWeight: 500 }}>Carregando métricas...</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 32, paddingBottom: 40 }}>

          {abaModulo === 'geral' && (
            <>
              <div><SecaoHeader titulo="BASE NR" />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
                  <CardStat label="Válidos"                valor={statsGeral.nrValidos}     cor={CORES_STATUS.verde}    icone="✓" />
                  <CardStat label="Próximos do Vencimento" valor={statsGeral.nrProximos}    cor={CORES_STATUS.laranja}  icone="⚠" />
                  <CardStat label="Vencidos"               valor={statsGeral.nrVencidos}    cor={CORES_STATUS.vermelho} icone="✕" />
                  <CardStat label="Programados"            valor={statsGeral.nrProgramados} cor={CORES_STATUS.roxo}     icone="ℹ" />
                </div>
              </div>
              <div><SecaoHeader titulo="BASE PO" />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
                  <CardStat label="Válidos"                valor={statsGeral.poValidos}     cor={CORES_STATUS.verde}    icone="✓" />
                  <CardStat label="Próximos do Vencimento" valor={statsGeral.poProximos}    cor={CORES_STATUS.laranja}  icone="⚠" />
                  <CardStat label="Vencidos"               valor={statsGeral.poVencidos}    cor={CORES_STATUS.vermelho} icone="✕" />
                  <CardStat label="Programados"            valor={statsGeral.poProgramados} cor={CORES_STATUS.roxo}     icone="ℹ" />
                </div>
              </div>
              <div><SecaoHeader titulo="Medicina do Trabalho" />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
                  <CardStat label="No Prazo"             valor={statsGeral.medNoPrazo}     cor={CORES_STATUS.verde}    icone="✓" />
                  <CardStat label="Prazo Crítico"        valor={statsGeral.medCritico}     cor={CORES_STATUS.laranja}  icone="⚠" />
                  <CardStat label="Bernhoeft c/ Atenção" valor={statsGeral.medAtencao}     cor={CORES_STATUS.amarelo}  icone="⚠" />
                  <CardStat label="Vencidos"             valor={statsGeral.medVencido}     cor={CORES_STATUS.vermelho} icone="✕" />
                  <CardStat label="Programados"          valor={statsGeral.medProgramados} cor={CORES_STATUS.roxo}     icone="ℹ" />
                </div>
              </div>
            </>
          )}

          {abaModulo === 'nr' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
                <CardStat label="Válidos"                valor={statsNR.validos}     cor={CORES_STATUS.verde}    icone="✓" />
                <CardStat label="Próximos do Vencimento" valor={statsNR.proximos}    cor={CORES_STATUS.laranja}  icone="⚠" sub="≤ 30 dias" />
                <CardStat label="Vencidos"               valor={statsNR.vencidos}    cor={CORES_STATUS.vermelho} icone="✕" />
                <CardStat label="Programados"            valor={statsNR.programados} cor={CORES_STATUS.roxo}     icone="ℹ" />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                <BadgeFiltro filtro={filtroNR} onLimpar={() => setFiltroNR(null)} />
                <ToggleSituacaoNR valor={situacaoNR} onChange={v => { setSituacaoNR(v); setFiltroNR(null) }} />
              </div>
              <SecaoGraficosNR colabs={colabsNRFiltrados} nrs={nrsData} matriz={matrizNR} situacao={situacaoNR} filtroAtivo={filtroNR} onFiltro={setFiltroNR} />
            </>
          )}

          {abaModulo === 'po' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
                <CardStat label="Válidos"                valor={statsPO.validos}     cor={CORES_STATUS.verde}    icone="✓" />
                <CardStat label="Próximos do Vencimento" valor={statsPO.proximos}    cor={CORES_STATUS.laranja}  icone="⚠" sub="≤ 30 dias" />
                <CardStat label="Vencidos"               valor={statsPO.vencidos}    cor={CORES_STATUS.vermelho} icone="✕" />
                <CardStat label="Programados"            valor={statsPO.programados} cor={CORES_STATUS.roxo}     icone="ℹ" />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                <BadgeFiltro filtro={filtroPO} onLimpar={() => setFiltroPO(null)} />
                <ToggleSituacaoNR valor={situacaoPO} onChange={v => { setSituacaoPO(v); setFiltroPO(null) }} />
              </div>
              <SecaoGraficosPO colabs={colabsPOFiltrados} pos={posData} situacao={situacaoPO} filtroAtivo={filtroPO} onFiltro={setFiltroPO} />
            </>
          )}

          {abaModulo === 'medicina' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
                <CardStat label="No Prazo"             valor={statsMed.mNP}   cor={CORES_STATUS.verde}    icone="✓" />
                <CardStat label="Prazo Crítico"        valor={statsMed.mC}    cor={CORES_STATUS.laranja}  icone="⚠" sub="≤ 60 dias" />
                <CardStat label="Bernhoeft c/ Atenção" valor={statsMed.mA}    cor={CORES_STATUS.amarelo}  icone="⚠" sub="≤ 30 dias" />
                <CardStat label="Vencidos"             valor={statsMed.mV}    cor={CORES_STATUS.vermelho} icone="✕" />
                <CardStat label="Programados"          valor={statsMed.mProg} cor={CORES_STATUS.roxo}     icone="ℹ" />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                <BadgeFiltro filtro={filtroMed} onLimpar={() => setFiltroMed(null)} />
                <ToggleSituacaoMed valor={situacaoMed} onChange={v => { setSituacaoMed(v); setFiltroMed(null) }} />
              </div>
              <SecaoGraficosMed colabs={colabsMedFiltrados} situacao={situacaoMed} filtroAtivo={filtroMed} onFiltro={setFiltroMed} />
            </>
          )}
        </div>
      )}
    </div>
  )
}