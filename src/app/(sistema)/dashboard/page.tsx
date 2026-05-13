'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from 'recharts'

// ─── CONSTANTES ───────────────────────────────────────────────────────────────
const COR_PRIMARIA = '#9f183c'
const COR_CARD = '#ffffff'
const COR_TEXTO_PRINCIPAL = '#18181b'
const COR_TEXTO_SECUNDARIO = '#71717a'
const COR_BORDA = '#e4e4e7'
const CORES_STATUS = {
  verde: '#22c55e', laranja: '#f59e0b', vermelho: '#ef4444', roxo: '#8b5cf6',
}
const hoje = new Date().toISOString().split('T')[0]
const SITUACOES_EXCLUIDAS = ['DEMITIDO', 'AF.PREVIDÊNCIA', 'LICENÇA MATERNIDADE']
const NRS_ALVO = ['NR 10-B', 'NR 11', 'NR 12', 'NR 35']
const POS_ALVO = ['Direção Defensiva', 'Pilotagem Defensiva']
const LOTE = 100 // tamanho do lote para .in() no Supabase

// ─── TIPOS ────────────────────────────────────────────────────────────────────
type AbaModulo = 'geral' | 'nr' | 'po' | 'medicina'
type AbaAgrup = 'base' | 'gerencia' | 'supervisor'

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
interface PontoGraficoNR { nome: string; valido: number; proximo: number; vencido: number }
interface PontoGraficoMed { nome: string; no_prazo: number; critico: number; atencao: number; vencido: number }

// ─── HELPERS — idênticos à BASE NR ───────────────────────────────────────────
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

// ─── CALC STATS — idênticos às páginas ───────────────────────────────────────
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

// ─── HELPER: buscar registros em lotes ───────────────────────────────────────
async function buscarRegistrosEmLotes(
  matriculas: string[],
  regraIds: number[],
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

// ─── TOOLTIP ──────────────────────────────────────────────────────────────────
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ backgroundColor: 'rgba(255,255,255,0.97)', border: `1px solid ${COR_BORDA}`, borderRadius: 12, padding: '12px 16px', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)' }}>
      <p style={{ fontWeight: 600, color: COR_TEXTO_PRINCIPAL, margin: '0 0 10px', fontSize: 13 }}>{label}</p>
      {payload.map((p: any, i: number) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: p.fill }} />
          <span style={{ color: COR_TEXTO_SECUNDARIO, fontSize: 12 }}>{p.name}: <strong style={{ color: COR_TEXTO_PRINCIPAL }}>{p.value}</strong></span>
        </div>
      ))}
    </div>
  )
}

// ─── CARD STAT ────────────────────────────────────────────────────────────────
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

// ─── TOGGLE AGRUPAMENTO ───────────────────────────────────────────────────────
function ToggleAgrup({ valor, onChange }: { valor: AbaAgrup; onChange: (v: AbaAgrup) => void }) {
  const ops: { key: AbaAgrup; label: string }[] = [
    { key: 'base', label: 'Por Base' },
    { key: 'gerencia', label: 'Por Gerência' },
    { key: 'supervisor', label: 'Por Supervisor' },
  ]
  return (
    <div style={{ display: 'inline-flex', backgroundColor: '#f4f4f5', borderRadius: 12, padding: 4, border: `1px solid ${COR_BORDA}` }}>
      {ops.map(op => (
        <button key={op.key} onClick={() => onChange(op.key)} style={{ padding: '8px 16px', fontSize: 13, fontWeight: valor === op.key ? 600 : 500, border: 'none', borderRadius: 8, cursor: 'pointer', backgroundColor: valor === op.key ? '#fff' : 'transparent', color: valor === op.key ? COR_PRIMARIA : COR_TEXTO_SECUNDARIO, boxShadow: valor === op.key ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', transition: 'all 0.2s' }}>{op.label}</button>
      ))}
    </div>
  )
}

// ─── SEÇÃO HEADER ─────────────────────────────────────────────────────────────
function SecaoHeader({ titulo }: { titulo: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '24px 0 16px' }}>
      <h2 style={{ fontSize: 15, fontWeight: 700, color: COR_TEXTO_PRINCIPAL, textTransform: 'uppercase', letterSpacing: '0.5px', margin: 0 }}>{titulo}</h2>
      <div style={{ flex: 1, height: 1, backgroundColor: COR_BORDA }} />
    </div>
  )
}

// ─── GRÁFICO NR/PO ────────────────────────────────────────────────────────────
function GraficoBarrasNR({ dados, agrup, titulo, desc }: { dados: PontoGraficoNR[]; agrup: AbaAgrup; titulo: string; desc: string }) {
  return (
    <div style={{ backgroundColor: COR_CARD, borderRadius: 16, padding: '24px', border: `1px solid ${COR_BORDA}` }}>
      <div style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: COR_TEXTO_PRINCIPAL, margin: '0 0 4px' }}>{titulo}</h3>
        <p style={{ fontSize: 13, color: COR_TEXTO_SECUNDARIO, margin: 0 }}>{desc}</p>
      </div>
      {!dados.length
        ? <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><p style={{ fontSize: 14, color: COR_TEXTO_SECUNDARIO }}>Sem dados disponíveis.</p></div>
        : <ResponsiveContainer width="100%" height={300}>
            <BarChart data={dados} margin={{ top: 10, right: 10, left: -20, bottom: agrup === 'supervisor' ? 60 : 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={COR_BORDA} vertical={false} />
              <XAxis dataKey="nome" tick={{ fontSize: 12, fill: COR_TEXTO_SECUNDARIO }} axisLine={{ stroke: COR_BORDA }} tickLine={false} angle={agrup === 'supervisor' ? -35 : 0} textAnchor={agrup === 'supervisor' ? 'end' : 'middle'} interval={0} dy={10} />
              <YAxis tick={{ fontSize: 12, fill: COR_TEXTO_SECUNDARIO }} axisLine={false} tickLine={false} dx={-10} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f4f4f5' }} />
              <Legend wrapperStyle={{ fontSize: 13, paddingTop: 20 }} iconType="circle" />
              <Bar dataKey="valido"  name="Válido"  fill={CORES_STATUS.verde}    stackId="a" radius={[0, 0, 0, 0]} barSize={40} />
              <Bar dataKey="proximo" name="Próximo" fill={CORES_STATUS.laranja}  stackId="a" radius={[0, 0, 0, 0]} />
              <Bar dataKey="vencido" name="Vencido" fill={CORES_STATUS.vermelho} stackId="a" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
      }
    </div>
  )
}

// ─── GRÁFICO MEDICINA ─────────────────────────────────────────────────────────
function GraficoBarrasMed({ dados, agrup, titulo, desc }: { dados: PontoGraficoMed[]; agrup: AbaAgrup; titulo: string; desc: string }) {
  return (
    <div style={{ backgroundColor: COR_CARD, borderRadius: 16, padding: '24px', border: `1px solid ${COR_BORDA}` }}>
      <div style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: COR_TEXTO_PRINCIPAL, margin: '0 0 4px' }}>{titulo}</h3>
        <p style={{ fontSize: 13, color: COR_TEXTO_SECUNDARIO, margin: 0 }}>{desc}</p>
      </div>
      {!dados.length
        ? <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><p style={{ fontSize: 14, color: COR_TEXTO_SECUNDARIO }}>Sem dados disponíveis.</p></div>
        : <ResponsiveContainer width="100%" height={300}>
            <BarChart data={dados} margin={{ top: 10, right: 10, left: -20, bottom: agrup === 'supervisor' ? 60 : 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={COR_BORDA} vertical={false} />
              <XAxis dataKey="nome" tick={{ fontSize: 12, fill: COR_TEXTO_SECUNDARIO }} axisLine={{ stroke: COR_BORDA }} tickLine={false} angle={agrup === 'supervisor' ? -35 : 0} textAnchor={agrup === 'supervisor' ? 'end' : 'middle'} interval={0} dy={10} />
              <YAxis tick={{ fontSize: 12, fill: COR_TEXTO_SECUNDARIO }} axisLine={false} tickLine={false} dx={-10} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f4f4f5' }} />
              <Legend wrapperStyle={{ fontSize: 13, paddingTop: 20 }} iconType="circle" />
              <Bar dataKey="no_prazo" name="No Prazo"             fill={CORES_STATUS.verde}    stackId="a" barSize={40} />
              <Bar dataKey="critico"  name="Prazo Crítico"        fill={CORES_STATUS.laranja}  stackId="a" />
              <Bar dataKey="atencao"  name="Bernhoeft c/ Atenção" fill="#d97706"               stackId="a" />
              <Bar dataKey="vencido"  name="Vencido"              fill={CORES_STATUS.vermelho} stackId="a" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
      }
    </div>
  )
}

// ─── HOOKS DE GRÁFICO ─────────────────────────────────────────────────────────
function useDadosGraficoNR(colabs: ColabNR[], nrs: { id: number; nome: string; validade_dias: number | null }[], matriz: MatrizNR[], agrup: AbaAgrup): PontoGraficoNR[] {
  return useMemo(() => {
    const grupos: Record<string, { valido: number; proximo: number; vencido: number }> = {}
    colabs.forEach(c => {
      const chave = agrup === 'base' ? c.base : agrup === 'gerencia' ? c.gerencia : c.supervisor
      if (!chave) return
      if (!grupos[chave]) grupos[chave] = { valido: 0, proximo: 0, vencido: 0 }
      nrs.forEach(nr => {
        if (getObrigatoriedade(matriz, c.funcao, c.processo, nr.nome) !== 'SIM') return
        const reg = c.registros[nr.id]
        if (!reg) { grupos[chave].vencido++; return }
        if (nr.validade_dias === null) { grupos[chave].valido++; return }
        const s = getStatus(reg.data_vencimento!)
        if (s === 'valido') grupos[chave].valido++
        else if (s === 'proximo') grupos[chave].proximo++
        else grupos[chave].vencido++
      })
    })
    let arr = Object.entries(grupos).map(([nome, v]) => ({ nome, ...v }))
    if (agrup === 'supervisor') arr = arr.sort((a, b) => (b.proximo + b.vencido) - (a.proximo + a.vencido)).slice(0, 10)
    return arr
  }, [colabs, nrs, matriz, agrup])
}

function useDadosGraficoPO(colabs: ColabPO[], pos: { id: number; nome: string; validade_dias: number }[], agrup: AbaAgrup): PontoGraficoNR[] {
  return useMemo(() => {
    const grupos: Record<string, { valido: number; proximo: number; vencido: number }> = {}
    colabs.forEach(c => {
      const chave = agrup === 'base' ? c.base : agrup === 'gerencia' ? c.gerencia : c.supervisor
      if (!chave) return
      if (!grupos[chave]) grupos[chave] = { valido: 0, proximo: 0, vencido: 0 }
      pos.forEach(po => {
        const campo = po.nome === 'Direção Defensiva' ? c.direcao : c.pilotagem
        if (campo !== 'SIM') return
        const reg = c.registros[po.id]
        if (!reg) { grupos[chave].vencido++; return }
        const s = getStatus(reg.data_vencimento!)
        if (s === 'valido') grupos[chave].valido++
        else if (s === 'proximo') grupos[chave].proximo++
        else grupos[chave].vencido++
      })
    })
    let arr = Object.entries(grupos).map(([nome, v]) => ({ nome, ...v }))
    if (agrup === 'supervisor') arr = arr.sort((a, b) => (b.proximo + b.vencido) - (a.proximo + a.vencido)).slice(0, 10)
    return arr
  }, [colabs, pos, agrup])
}

function useDadosGraficoMed(colabs: ColabMed[], agrup: AbaAgrup): PontoGraficoMed[] {
  return useMemo(() => {
    const grupos: Record<string, { no_prazo: number; critico: number; atencao: number; vencido: number }> = {}
    colabs.forEach(c => {
      const st = getStatusMed(c.asoVencimento)
      if (st === 'sem_aso') return
      const chave = agrup === 'base' ? c.base : agrup === 'gerencia' ? c.gerencia : c.supervisor
      if (!chave) return
      if (!grupos[chave]) grupos[chave] = { no_prazo: 0, critico: 0, atencao: 0, vencido: 0 }
      grupos[chave][st]++
    })
    let arr = Object.entries(grupos).map(([nome, v]) => ({ nome, ...v }))
    if (agrup === 'supervisor') arr = arr.sort((a, b) => (b.critico + b.atencao + b.vencido) - (a.critico + a.atencao + a.vencido)).slice(0, 10)
    return arr
  }, [colabs, agrup])
}

// ─── PÁGINA PRINCIPAL ─────────────────────────────────────────────────────────
export default function DashboardPage() {
  const router = useRouter()
  const [abaModulo, setAbaModulo] = useState<AbaModulo>('geral')
  const [agrupNR, setAgrupNR] = useState<AbaAgrup>('base')
  const [agrupPO, setAgrupPO] = useState<AbaAgrup>('base')
  const [agrupMed, setAgrupMed] = useState<AbaAgrup>('base')
  const [loading, setLoading] = useState(true)

  const [statsGeral, setStatsGeral] = useState<StatsGeral>({
    totalAtivos: 0,
    nrValidos: 0, nrProximos: 0, nrVencidos: 0, nrProgramados: 0,
    poValidos: 0, poProximos: 0, poVencidos: 0, poProgramados: 0,
    medNoPrazo: 0, medCritico: 0, medAtencao: 0, medVencido: 0, medProgramados: 0,
  })
  const [colabsNR, setColabsNR] = useState<ColabNR[]>([])
  const [colabsPO, setColabsPO] = useState<ColabPO[]>([])
  const [colabsMed, setColabsMed] = useState<ColabMed[]>([])
  const [nrsData, setNrsData] = useState<{ id: number; nome: string; validade_dias: number | null }[]>([])
  const [posData, setPosData] = useState<{ id: number; nome: string; validade_dias: number }[]>([])
  const [matrizNR, setMatrizNR] = useState<MatrizNR[]>([])

  useEffect(() => {
    async function carregar() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      // ── 1. Regras de vencimento ──
      const { data: regras } = await supabase.from('regras_vencimento').select('id, nome_item, validade_dias')
      const nrs = (regras || []).filter(r => NRS_ALVO.includes(r.nome_item)).map(r => ({ id: r.id, nome: r.nome_item, validade_dias: r.validade_dias }))
      const pos = (regras || []).filter(r => POS_ALVO.includes(r.nome_item)).map(r => ({ id: r.id, nome: r.nome_item, validade_dias: r.validade_dias || 730 }))
      const nrIds = nrs.map(n => n.id)
      const poIds = pos.map(p => p.id)
      setNrsData(nrs)
      setPosData(pos)

      // ── 2. Matriz NR ──
      const { data: matrizData } = await supabase.from('matriz_treinamentos').select('funcao, processo, treinamento, obrigatorio').eq('pagina', 'BASE NR')
      const mNR: MatrizNR[] = matrizData || []
      setMatrizNR(mNR)

      // ── 3. Colaboradores — busca todos e filtra no JS, igual à BASE NR ──
      let todosColabs: any[] = []; let from = 0
      while (true) {
        const { data: cd } = await supabase.from('colaboradores')
          .select('matricula, situacao, processo, bases(nome), funcoes(nome), gerencias!colaboradores_gerencia_id_fkey(sigla), supervisor')
          .order('nome').range(from, from + 499)
        if (!cd || cd.length === 0) break
        todosColabs = [...todosColabs, ...cd]
        if (cd.length < 500) break
        from += 500
      }
      todosColabs = todosColabs.filter((c: any) => !SITUACOES_EXCLUIDAS.includes(c.situacao))

      const colabInfo: Record<string, { funcao: string | null; processo: string | null; base: string | null; gerencia: string | null; supervisor: string | null }> = {}
      todosColabs.forEach((c: any) => {
        colabInfo[c.matricula] = {
          funcao: c.funcoes?.nome || null,
          processo: c.processo || null,
          base: c.bases?.nome || null,
          gerencia: c.gerencias?.sigla || null,
          supervisor: c.supervisor ? c.supervisor.trim().split(' ')[0] : null,
        }
      })
      const mats = todosColabs.map((c: any) => c.matricula)

      // ── 4. Colaboradores válidos para NR (idêntico ao buscarColabs da BASE NR) ──
      const matsNR = mats.filter((mat: string) => {
        const c = colabInfo[mat]
        if (!c?.funcao) return false
        return mNR.some(m => {
          const mF = m.funcao.trim().toUpperCase()
          const fC = c.funcao!.trim().toUpperCase()
          if (m.processo && m.processo.trim() !== '') return mF === fC && m.processo.trim().toUpperCase() === (c.processo || '').trim().toUpperCase()
          return mF === fC
        })
      })

      // ── 5. Registros NR em lotes de 100 (evita truncamento do .in()) ──
      const regsNRMap: Record<string, Record<number, { data_vencimento: string | null; programacoes: string[] }>> = {}
      if (matsNR.length > 0 && nrIds.length > 0) {
        await buscarRegistrosEmLotes(matsNR, nrIds, regsNRMap)
      }

      // ── 6. Montar ColabNR ──
      const cNR: ColabNR[] = matsNR.map((mat: string) => ({
        matricula: mat, ...colabInfo[mat], registros: regsNRMap[mat] || {},
      }))
      setColabsNR(cNR)

      // ── 7. Matriz PO ──
      const matrizPOMap: Record<string, { direcao: string; pilotagem: string }> = {}
      if (mats.length > 0) {
        for (let i = 0; i < mats.length; i += LOTE) {
          const lote = mats.slice(i, i + LOTE)
          const { data: mpd } = await supabase.from('matriz_po').select('matricula, direcao_defensiva, pilotagem_defensiva').in('matricula', lote)
          ;(mpd || []).forEach((m: any) => {
            matrizPOMap[m.matricula] = {
              direcao: (m.direcao_defensiva || 'N/A').trim().toUpperCase(),
              pilotagem: (m.pilotagem_defensiva || 'N/A').trim().toUpperCase(),
            }
          })
        }
      }

      // ── 8. Registros PO em lotes de 100 ──
      const regsPOMap: Record<string, Record<number, { data_vencimento: string | null; programacoes: string[] }>> = {}
      if (mats.length > 0 && poIds.length > 0) {
        await buscarRegistrosEmLotes(mats, poIds, regsPOMap)
      }

      // ── 9. Montar ColabPO ──
      const cPO: ColabPO[] = mats
        .map((mat: string) => {
          const mpo = matrizPOMap[mat] || { direcao: 'N/A', pilotagem: 'N/A' }
          return { matricula: mat, ...colabInfo[mat], direcao: mpo.direcao, pilotagem: mpo.pilotagem, registros: regsPOMap[mat] || {} }
        })
        .filter((c: ColabPO) => c.direcao === 'SIM' || c.pilotagem === 'SIM')
      setColabsPO(cPO)

      // ── 10. ASOs periódicos em lotes de 100 ──
      const asosPorColab: Record<string, { data_vencimento: string | null; data_realizacao: string; programacoes: string[] }> = {}
      if (mats.length > 0) {
        for (let i = 0; i < mats.length; i += LOTE) {
          const lote = mats.slice(i, i + LOTE)
          from = 0
          while (true) {
            const { data: ad } = await supabase.from('asos')
              .select('matricula_colaborador, data_vencimento, data_realizacao, programacoes_exames(data_programada)')
              .eq('tipo', 'periodico').in('matricula_colaborador', lote)
              .range(from, from + 499)
            if (!ad || ad.length === 0) break
            ad.forEach((a: any) => {
              const atual = asosPorColab[a.matricula_colaborador]
              if (!atual || new Date(a.data_realizacao) > new Date(atual.data_realizacao)) {
                asosPorColab[a.matricula_colaborador] = {
                  data_vencimento: a.data_vencimento,
                  data_realizacao: a.data_realizacao,
                  programacoes: (a.programacoes_exames || []).map((p: any) => p.data_programada),
                }
              }
            })
            if (ad.length < 500) break
            from += 500
          }
        }
      }

      // ── 11. Montar ColabMed ──
      const cMed: ColabMed[] = mats.map((mat: string) => ({
        matricula: mat, ...colabInfo[mat],
        asoVencimento: asosPorColab[mat]?.data_vencimento || null,
        asoProgramacoes: asosPorColab[mat]?.programacoes || [],
      }))
      setColabsMed(cMed)

      // ── 12. Calcular stats ──
      const sNR = calcStatsNR(cNR, nrs, mNR)
      const sPO = calcStatsPO(
        mats.map((mat: string) => {
          const mpo = matrizPOMap[mat] || { direcao: 'N/A', pilotagem: 'N/A' }
          return { matricula: mat, ...colabInfo[mat], direcao: mpo.direcao, pilotagem: mpo.pilotagem, registros: regsPOMap[mat] || {} }
        }),
        pos
      )
      let mNP = 0, mC = 0, mA = 0, mV = 0, mProg = 0
      cMed.forEach(c => {
        const st = getStatusMed(c.asoVencimento)
        if (st === 'no_prazo') mNP++
        else if (st === 'critico') mC++
        else if (st === 'atencao') mA++
        else if (st === 'vencido') mV++
        if ((st === 'critico' || st === 'atencao' || st === 'vencido') && c.asoProgramacoes.some(d => d >= hoje)) mProg++
      })

      setStatsGeral({
        totalAtivos: todosColabs.length,
        nrValidos: sNR.validos, nrProximos: sNR.proximos, nrVencidos: sNR.vencidos, nrProgramados: sNR.programados,
        poValidos: sPO.validos, poProximos: sPO.proximos, poVencidos: sPO.vencidos, poProgramados: sPO.programados,
        medNoPrazo: mNP, medCritico: mC, medAtencao: mA, medVencido: mV, medProgramados: mProg,
      })
      setLoading(false)
    }
    carregar()
  }, [])

  const dadosGraficoNR = useDadosGraficoNR(colabsNR, nrsData, matrizNR, agrupNR)
  const dadosGraficoPO = useDadosGraficoPO(colabsPO, posData, agrupPO)
  const dadosGraficoMed = useDadosGraficoMed(colabsMed, agrupMed)

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
          <button key={a.key} onClick={() => setAbaModulo(a.key)} style={{ padding: '12px 4px', fontSize: 14, fontWeight: abaModulo === a.key ? 600 : 500, border: 'none', background: 'none', cursor: 'pointer', color: abaModulo === a.key ? COR_PRIMARIA : COR_TEXTO_SECUNDARIO, borderBottom: abaModulo === a.key ? `2px solid ${COR_PRIMARIA}` : '2px solid transparent', marginBottom: -1, transition: 'color 0.2s' }}>{a.label}</button>
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
              <div>
                <SecaoHeader titulo="BASE NR" />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
                  <CardStat label="Válidos"                valor={statsGeral.nrValidos}     cor={CORES_STATUS.verde}    icone="✓" />
                  <CardStat label="Próximos do Vencimento" valor={statsGeral.nrProximos}    cor={CORES_STATUS.laranja}  icone="⚠" />
                  <CardStat label="Vencidos"               valor={statsGeral.nrVencidos}    cor={CORES_STATUS.vermelho} icone="✕" />
                  <CardStat label="Programados"            valor={statsGeral.nrProgramados} cor={CORES_STATUS.roxo}     icone="ℹ" />
                </div>
              </div>
              <div>
                <SecaoHeader titulo="BASE PO" />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
                  <CardStat label="Válidos"                valor={statsGeral.poValidos}     cor={CORES_STATUS.verde}    icone="✓" />
                  <CardStat label="Próximos do Vencimento" valor={statsGeral.poProximos}    cor={CORES_STATUS.laranja}  icone="⚠" />
                  <CardStat label="Vencidos"               valor={statsGeral.poVencidos}    cor={CORES_STATUS.vermelho} icone="✕" />
                  <CardStat label="Programados"            valor={statsGeral.poProgramados} cor={CORES_STATUS.roxo}     icone="ℹ" />
                </div>
              </div>
              <div>
                <SecaoHeader titulo="Medicina do Trabalho" />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
                  <CardStat label="No Prazo"             valor={statsGeral.medNoPrazo}     cor={CORES_STATUS.verde}    icone="✓" />
                  <CardStat label="Prazo Crítico"        valor={statsGeral.medCritico}     cor={CORES_STATUS.laranja}  icone="⚠" />
                  <CardStat label="Bernhoeft c/ Atenção" valor={statsGeral.medAtencao}     cor="#d97706"               icone="⚠" />
                  <CardStat label="Vencidos"             valor={statsGeral.medVencido}     cor={CORES_STATUS.vermelho} icone="✕" />
                  <CardStat label="Programados"          valor={statsGeral.medProgramados} cor={CORES_STATUS.roxo}     icone="ℹ" />
                </div>
              </div>
            </>
          )}

          {abaModulo === 'nr' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
                <CardStat label="Registros Válidos"      valor={statsGeral.nrValidos}     cor={CORES_STATUS.verde}    icone="✓" />
                <CardStat label="Próximos do Vencimento" valor={statsGeral.nrProximos}    cor={CORES_STATUS.laranja}  icone="⚠" sub="≤ 30 dias" />
                <CardStat label="Vencidos"               valor={statsGeral.nrVencidos}    cor={CORES_STATUS.vermelho} icone="✕" />
                <CardStat label="Programados"            valor={statsGeral.nrProgramados} cor={CORES_STATUS.roxo}     icone="ℹ" />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                <ToggleAgrup valor={agrupNR} onChange={setAgrupNR} />
              </div>
              <GraficoBarrasNR dados={dadosGraficoNR} agrup={agrupNR} titulo="Análise de Registros NR" desc={`Distribuição dos status normativos ${agrupNR === 'base' ? 'por base' : agrupNR === 'gerencia' ? 'por gerência' : 'pelos 10 principais supervisores'}.`} />
            </>
          )}

          {abaModulo === 'po' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
                <CardStat label="Registros Válidos"      valor={statsGeral.poValidos}     cor={CORES_STATUS.verde}    icone="✓" />
                <CardStat label="Próximos do Vencimento" valor={statsGeral.poProximos}    cor={CORES_STATUS.laranja}  icone="⚠" sub="≤ 30 dias" />
                <CardStat label="Vencidos"               valor={statsGeral.poVencidos}    cor={CORES_STATUS.vermelho} icone="✕" />
                <CardStat label="Programados"            valor={statsGeral.poProgramados} cor={CORES_STATUS.roxo}     icone="ℹ" />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                <ToggleAgrup valor={agrupPO} onChange={setAgrupPO} />
              </div>
              <GraficoBarrasNR dados={dadosGraficoPO} agrup={agrupPO} titulo="Análise de Registros PO" desc={`Distribuição dos procedimentos operacionais ${agrupPO === 'base' ? 'por base' : agrupPO === 'gerencia' ? 'por gerência' : 'pelos 10 principais supervisores'}.`} />
            </>
          )}

          {abaModulo === 'medicina' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
                <CardStat label="No Prazo"             valor={statsGeral.medNoPrazo}     cor={CORES_STATUS.verde}    icone="✓" />
                <CardStat label="Prazo Crítico"        valor={statsGeral.medCritico}     cor={CORES_STATUS.laranja}  icone="⚠" sub="≤ 60 dias" />
                <CardStat label="Bernhoeft c/ Atenção" valor={statsGeral.medAtencao}     cor="#d97706"               icone="⚠" sub="≤ 30 dias" />
                <CardStat label="Vencidos"             valor={statsGeral.medVencido}     cor={CORES_STATUS.vermelho} icone="✕" />
                <CardStat label="Programados"          valor={statsGeral.medProgramados} cor={CORES_STATUS.roxo}     icone="ℹ" />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                <ToggleAgrup valor={agrupMed} onChange={setAgrupMed} />
              </div>
              <GraficoBarrasMed dados={dadosGraficoMed} agrup={agrupMed} titulo="Análise de ASOs Periódicos" desc={`Distribuição dos status médicos ${agrupMed === 'base' ? 'por base' : agrupMed === 'gerencia' ? 'por gerência' : 'pelos 10 principais supervisores'}.`} />
            </>
          )}
        </div>
      )}
    </div>
  )
}