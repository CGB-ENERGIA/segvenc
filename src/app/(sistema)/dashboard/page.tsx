'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from 'recharts'

const COR = '#9f183c'
const hoje = new Date().toISOString().split('T')[0]

// ─── TIPOS ────────────────────────────────────────────────────────────────────
type AbaModulo = 'geral' | 'nr' | 'po' | 'medicina'
type AbaAgrup = 'base' | 'gerencia' | 'supervisor'

interface RegistroNR {
  regra_id: number
  nome_nr: string
  validade_dias: number | null
  data_vencimento: string | null
  base: string | null
  gerencia: string | null
  supervisor: string | null
  tem_programacao: boolean
}

interface RegistroPO {
  regra_id: number
  nome_po: string
  data_vencimento: string | null
  base: string | null
  gerencia: string | null
  supervisor: string | null
  tem_programacao: boolean
}

interface RegistroMed {
  status: 'no_prazo' | 'critico' | 'atencao' | 'vencido' | 'sem_aso'
  base: string | null
  gerencia: string | null
  supervisor: string | null
  tem_programacao: boolean
}

interface StatsGeral {
  totalAtivos: number
  nrValidos: number; nrProximos: number; nrVencidos: number; nrProgramados: number
  poValidos: number; poProximos: number; poVencidos: number; poProgramados: number
  medNoPrazo: number; medCritico: number; medAtencao: number; medVencido: number; medProgramados: number
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function getDias(dv: string | null): number | null {
  if (!dv) return null
  return Math.ceil((new Date(dv + 'T12:00:00').getTime() - new Date().getTime()) / 86400000)
}

function getStatusNR(dv: string | null, validade: number | null): 'valido' | 'proximo' | 'vencido' | 'sem_prazo' {
  if (validade === null) return 'sem_prazo'
  const dias = getDias(dv)
  if (dias === null) return 'vencido'
  if (dias < 0) return 'vencido'
  if (dias <= 30) return 'proximo'
  return 'valido'
}

function getStatusMed(dv: string | null): 'no_prazo' | 'critico' | 'atencao' | 'vencido' | 'sem_aso' {
  if (!dv) return 'sem_aso'
  const dias = getDias(dv)
  if (dias === null) return 'sem_aso'
  if (dias < 0) return 'vencido'
  if (dias <= 30) return 'atencao'
  if (dias <= 60) return 'critico'
  return 'no_prazo'
}

// ─── TOOLTIP CUSTOMIZADO ──────────────────────────────────────────────────────
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ backgroundColor: 'white', border: '1px solid #e0e0e0', borderRadius: 10, padding: '10px 14px', boxShadow: '0 4px 16px rgba(0,0,0,0.1)', fontSize: 12 }}>
      <p style={{ fontWeight: 600, color: '#333', margin: '0 0 8px', fontSize: 13 }}>{label}</p>
      {payload.map((p: any, i: number) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
          <div style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: p.fill }} />
          <span style={{ color: '#666' }}>{p.name}: <strong style={{ color: '#333' }}>{p.value}</strong></span>
        </div>
      ))}
    </div>
  )
}

// ─── CARD STAT ────────────────────────────────────────────────────────────────
function CardStat({ label, valor, cor, sub }: { label: string; valor: number; cor: string; sub?: string }) {
  return (
    <div style={{ backgroundColor: 'white', borderRadius: 12, padding: '16px 20px', border: '1px solid #f0f0f0', flex: '1 0 140px' }}>
      <p style={{ fontSize: 11, color: '#888', margin: '0 0 6px', fontWeight: 500 }}>{label}</p>
      <p style={{ fontSize: 28, fontWeight: 700, color: cor, margin: 0, lineHeight: 1 }}>{valor.toLocaleString('pt-BR')}</p>
      {sub && <p style={{ fontSize: 11, color: '#aaa', margin: '4px 0 0' }}>{sub}</p>}
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
    <div style={{ display: 'flex', gap: 4, backgroundColor: '#f5f5f5', borderRadius: 10, padding: 3, width: 'fit-content' }}>
      {ops.map(op => (
        <button key={op.key} onClick={() => onChange(op.key)} style={{
          padding: '6px 14px', fontSize: 12, fontWeight: valor === op.key ? 600 : 400,
          border: 'none', borderRadius: 8, cursor: 'pointer',
          backgroundColor: valor === op.key ? 'white' : 'transparent',
          color: valor === op.key ? COR : '#888',
          boxShadow: valor === op.key ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
          transition: 'all 0.15s',
        }}>{op.label}</button>
      ))}
    </div>
  )
}

// ─── GRÁFICO NR/PO ────────────────────────────────────────────────────────────
function GraficoBarrasNR({ registros, agrup, titulo }: {
  registros: (RegistroNR | RegistroPO)[]
  agrup: AbaAgrup
  titulo: string
}) {
  const dados = useMemo(() => {
    const grupos: Record<string, { valido: number; proximo: number; vencido: number }> = {}
    registros.forEach(r => {
      const chave = agrup === 'base' ? r.base : agrup === 'gerencia' ? r.gerencia : r.supervisor
      if (!chave) return
      if (!grupos[chave]) grupos[chave] = { valido: 0, proximo: 0, vencido: 0 }
      const st = 'validade_dias' in r
        ? getStatusNR(r.data_vencimento, r.validade_dias)
        : getStatusNR(r.data_vencimento, 730)
      if (st === 'valido' || st === 'sem_prazo') grupos[chave].valido++
      else if (st === 'proximo') grupos[chave].proximo++
      else grupos[chave].vencido++
    })
    let arr = Object.entries(grupos).map(([nome, v]) => ({ nome, ...v, total: v.valido + v.proximo + v.vencido }))
    if (agrup === 'supervisor') arr = arr.sort((a, b) => (b.proximo + b.vencido) - (a.proximo + a.vencido)).slice(0, 10)
    return arr
  }, [registros, agrup])

  if (!dados.length) return <p style={{ fontSize: 13, color: '#aaa', textAlign: 'center', padding: '40px 0' }}>Sem dados de {agrup} disponíveis.</p>

  return (
    <div style={{ backgroundColor: 'white', borderRadius: 12, padding: '20px 24px', border: '1px solid #f0f0f0' }}>
      <p style={{ fontSize: 14, fontWeight: 600, color: '#333', margin: '0 0 16px' }}>{titulo}</p>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={dados} margin={{ top: 0, right: 10, left: -10, bottom: agrup === 'supervisor' ? 60 : 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
          <XAxis dataKey="nome" tick={{ fontSize: 11, fill: '#888' }} angle={agrup === 'supervisor' ? -35 : 0} textAnchor={agrup === 'supervisor' ? 'end' : 'middle'} interval={0} />
          <YAxis tick={{ fontSize: 11, fill: '#888' }} />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ fontSize: 12, paddingTop: agrup === 'supervisor' ? 16 : 8 }} />
          <Bar dataKey="valido"  name="Válido"  fill="#16a34a" stackId="a" radius={[0, 0, 0, 0]} />
          <Bar dataKey="proximo" name="Próximo" fill="#d97706" stackId="a" radius={[0, 0, 0, 0]} />
          <Bar dataKey="vencido" name="Vencido" fill="#dc2626" stackId="a" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ─── GRÁFICO MEDICINA ─────────────────────────────────────────────────────────
function GraficoBarrasMed({ registros, agrup, titulo }: {
  registros: RegistroMed[]
  agrup: AbaAgrup
  titulo: string
}) {
  const dados = useMemo(() => {
    const grupos: Record<string, { no_prazo: number; critico: number; atencao: number; vencido: number }> = {}
    registros.forEach(r => {
      const chave = agrup === 'base' ? r.base : agrup === 'gerencia' ? r.gerencia : r.supervisor
      if (!chave) return
      if (!grupos[chave]) grupos[chave] = { no_prazo: 0, critico: 0, atencao: 0, vencido: 0 }
      if (r.status === 'no_prazo') grupos[chave].no_prazo++
      else if (r.status === 'critico') grupos[chave].critico++
      else if (r.status === 'atencao') grupos[chave].atencao++
      else if (r.status === 'vencido') grupos[chave].vencido++
    })
    let arr = Object.entries(grupos).map(([nome, v]) => ({ nome, ...v }))
    if (agrup === 'supervisor') arr = arr.sort((a, b) => (b.critico + b.atencao + b.vencido) - (a.critico + a.atencao + a.vencido)).slice(0, 10)
    return arr
  }, [registros, agrup])

  if (!dados.length) return <p style={{ fontSize: 13, color: '#aaa', textAlign: 'center', padding: '40px 0' }}>Sem dados de {agrup} disponíveis.</p>

  return (
    <div style={{ backgroundColor: 'white', borderRadius: 12, padding: '20px 24px', border: '1px solid #f0f0f0' }}>
      <p style={{ fontSize: 14, fontWeight: 600, color: '#333', margin: '0 0 16px' }}>{titulo}</p>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={dados} margin={{ top: 0, right: 10, left: -10, bottom: agrup === 'supervisor' ? 60 : 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
          <XAxis dataKey="nome" tick={{ fontSize: 11, fill: '#888' }} angle={agrup === 'supervisor' ? -35 : 0} textAnchor={agrup === 'supervisor' ? 'end' : 'middle'} interval={0} />
          <YAxis tick={{ fontSize: 11, fill: '#888' }} />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ fontSize: 12, paddingTop: agrup === 'supervisor' ? 16 : 8 }} />
          <Bar dataKey="no_prazo" name="No Prazo"             fill="#16a34a" stackId="a" />
          <Bar dataKey="critico"  name="Prazo Crítico"        fill="#a16207" stackId="a" />
          <Bar dataKey="atencao"  name="Bernhoeft c/ Atenção" fill="#c2410c" stackId="a" />
          <Bar dataKey="vencido"  name="Vencido"              fill="#dc2626" stackId="a" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
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
  const [registrosNR, setRegistrosNR] = useState<RegistroNR[]>([])
  const [registrosPO, setRegistrosPO] = useState<RegistroPO[]>([])
  const [registrosMed, setRegistrosMed] = useState<RegistroMed[]>([])

  useEffect(() => {
    async function carregar() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      // ── Buscar regras NR e PO ──
      const { data: regras } = await supabase.from('regras_vencimento').select('id, nome_item, validade_dias')
      const nrIds = (regras || []).filter(r => r.nome_item.startsWith('NR')).map(r => r.id)
      const poIds = (regras || []).filter(r => ['Direção Defensiva', 'Pilotagem Defensiva'].includes(r.nome_item)).map(r => r.id)
      const regraMap: Record<number, { nome: string; validade: number | null }> = {}
      ;(regras || []).forEach(r => { regraMap[r.id] = { nome: r.nome_item, validade: r.validade_dias } })

      // ── Colaboradores ativos ──
      let colabs: any[] = []; let from = 0
      while (true) {
        const { data: cd } = await supabase.from('colaboradores')
          .select('matricula, situacao, bases(nome), gerencias!colaboradores_gerencia_id_fkey(sigla), supervisor')
          .eq('situacao', 'ATIVO')
          .range(from, from + 499)
        if (!cd || cd.length === 0) break
        colabs = [...colabs, ...cd]
        if (cd.length < 500) break
        from += 500
      }
      const colabMap: Record<string, { base: string | null; gerencia: string | null; supervisor: string | null }> = {}
      colabs.forEach((c: any) => {
        colabMap[c.matricula] = {
          base: c.bases?.nome || null,
          gerencia: c.gerencias?.sigla || null,
          supervisor: c.supervisor ? c.supervisor.trim().split(' ')[0] : null,
        }
      })
      const mats = colabs.map((c: any) => c.matricula)

      // ── Registros NR (com programações) ──
      let regsNR: any[] = []; from = 0
      while (true) {
        const { data: rd } = await supabase.from('registros_exames')
          .select('matricula_colaborador, regra_id, data_vencimento, programacoes_exames(data_programada)')
          .eq('is_atual', true).in('regra_id', nrIds).in('matricula_colaborador', mats)
          .range(from, from + 499)
        if (!rd || rd.length === 0) break
        regsNR = [...regsNR, ...rd]
        if (rd.length < 500) break
        from += 500
      }

      // ── Registros PO (com programações) ──
      let regsPO: any[] = []; from = 0
      while (true) {
        const { data: rd } = await supabase.from('registros_exames')
          .select('matricula_colaborador, regra_id, data_vencimento, programacoes_exames(data_programada)')
          .eq('is_atual', true).in('regra_id', poIds).in('matricula_colaborador', mats)
          .range(from, from + 499)
        if (!rd || rd.length === 0) break
        regsPO = [...regsPO, ...rd]
        if (rd.length < 500) break
        from += 500
      }

      // ── ASOs periódicos (com programações via aso_id) ──
      let asos: any[] = []; from = 0
      while (true) {
        const { data: ad } = await supabase.from('asos')
          .select('id, matricula_colaborador, tipo, data_vencimento, data_realizacao, programacoes_exames(data_programada)')
          .eq('tipo', 'periodico').in('matricula_colaborador', mats)
          .range(from, from + 499)
        if (!ad || ad.length === 0) break
        asos = [...asos, ...ad]
        if (ad.length < 500) break
        from += 500
      }

      // ── Montar registros NR ──
      const rNR: RegistroNR[] = regsNR.map(r => {
        const colab = colabMap[r.matricula_colaborador]
        const regra = regraMap[r.regra_id]
        return {
          regra_id: r.regra_id,
          nome_nr: regra?.nome || '',
          validade_dias: regra?.validade || null,
          data_vencimento: r.data_vencimento,
          base: colab?.base || null,
          gerencia: colab?.gerencia || null,
          supervisor: colab?.supervisor || null,
          tem_programacao: (r.programacoes_exames || []).some((p: any) => p.data_programada >= hoje),
        }
      })
      setRegistrosNR(rNR)

      // ── Montar registros PO ──
      const rPO: RegistroPO[] = regsPO.map(r => {
        const colab = colabMap[r.matricula_colaborador]
        const regra = regraMap[r.regra_id]
        return {
          regra_id: r.regra_id,
          nome_po: regra?.nome || '',
          data_vencimento: r.data_vencimento,
          base: colab?.base || null,
          gerencia: colab?.gerencia || null,
          supervisor: colab?.supervisor || null,
          tem_programacao: (r.programacoes_exames || []).some((p: any) => p.data_programada >= hoje),
        }
      })
      setRegistrosPO(rPO)

      // ── Montar registros Medicina (ASO periódico mais recente por colaborador) ──
      const asosPorColab: Record<string, any> = {}
      asos.forEach(a => {
        const atual = asosPorColab[a.matricula_colaborador]
        if (!atual || new Date(a.data_realizacao) > new Date(atual.data_realizacao)) {
          asosPorColab[a.matricula_colaborador] = a
        }
      })
      const rMed: RegistroMed[] = mats.map(mat => {
        const colab = colabMap[mat]
        const aso = asosPorColab[mat]
        return {
          status: aso ? getStatusMed(aso.data_vencimento) : 'sem_aso',
          base: colab?.base || null,
          gerencia: colab?.gerencia || null,
          supervisor: colab?.supervisor || null,
          tem_programacao: aso ? (aso.programacoes_exames || []).some((p: any) => p.data_programada >= hoje) : false,
        }
      }).filter(r => r.status !== 'sem_aso')
      setRegistrosMed(rMed)

      // ── Stats gerais ──
      let nrV = 0, nrP = 0, nrVc = 0, nrProg = 0
      rNR.forEach(r => {
        const st = getStatusNR(r.data_vencimento, r.validade_dias)
        if (st === 'valido' || st === 'sem_prazo') nrV++
        else if (st === 'proximo') nrP++
        else nrVc++
        if ((st === 'proximo' || st === 'vencido') && r.tem_programacao) nrProg++
      })

      let poV = 0, poP = 0, poVc = 0, poProg = 0
      rPO.forEach(r => {
        const st = getStatusNR(r.data_vencimento, 730)
        if (st === 'valido') poV++
        else if (st === 'proximo') poP++
        else poVc++
        if ((st === 'proximo' || st === 'vencido') && r.tem_programacao) poProg++
      })

      let mNP = 0, mC = 0, mA = 0, mV = 0, mProg = 0
      rMed.forEach(r => {
        if (r.status === 'no_prazo') mNP++
        else if (r.status === 'critico') mC++
        else if (r.status === 'atencao') mA++
        else if (r.status === 'vencido') mV++
        if ((r.status === 'critico' || r.status === 'atencao' || r.status === 'vencido') && r.tem_programacao) mProg++
      })

      setStatsGeral({
        totalAtivos: colabs.length,
        nrValidos: nrV, nrProximos: nrP, nrVencidos: nrVc, nrProgramados: nrProg,
        poValidos: poV, poProximos: poP, poVencidos: poVc, poProgramados: poProg,
        medNoPrazo: mNP, medCritico: mC, medAtencao: mA, medVencido: mV, medProgramados: mProg,
      })
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
    <div style={{ fontFamily: 'Arial, sans-serif', display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* TÍTULO */}
      <div>
        <h1 style={{ fontSize: 18, fontWeight: 600, color: '#1a1a1a', margin: 0 }}>Dashboard</h1>
        <p style={{ fontSize: 12, color: '#888', margin: '3px 0 0' }}>Visão geral dos módulos do SegVenc</p>
      </div>

      {/* ABAS */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '2px solid #f0f0f0' }}>
        {ABAS.map(a => (
          <button key={a.key} onClick={() => setAbaModulo(a.key)} style={{
            padding: '8px 20px', fontSize: 13, fontWeight: abaModulo === a.key ? 600 : 400,
            border: 'none', background: 'none', cursor: 'pointer',
            color: abaModulo === a.key ? COR : '#888',
            borderBottom: abaModulo === a.key ? `2px solid ${COR}` : '2px solid transparent',
            marginBottom: -2,
          }}>{a.label}</button>
        ))}
      </div>

      {loading ? (
        <p style={{ color: '#aaa', fontSize: 14 }}>Carregando dados...</p>
      ) : (
        <>
          {/* ── VISÃO GERAL ── */}
          {abaModulo === 'geral' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <CardStat label="Colaboradores Ativos" valor={statsGeral.totalAtivos} cor="#4a4a49" />
              </div>
              <div>
                <p style={{ fontSize: 11, fontWeight: 600, color: '#555', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: 1 }}>BASE NR</p>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <CardStat label="Válidos"                valor={statsGeral.nrValidos}     cor="#16a34a" />
                  <CardStat label="Próximos do Vencimento" valor={statsGeral.nrProximos}    cor="#d97706" />
                  <CardStat label="Vencidos"               valor={statsGeral.nrVencidos}    cor="#dc2626" />
                  <CardStat label="Programados"            valor={statsGeral.nrProgramados} cor="#7c3aed" />
                </div>
              </div>
              <div>
                <p style={{ fontSize: 11, fontWeight: 600, color: '#555', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: 1 }}>BASE PO</p>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <CardStat label="Válidos"                valor={statsGeral.poValidos}     cor="#16a34a" />
                  <CardStat label="Próximos do Vencimento" valor={statsGeral.poProximos}    cor="#d97706" />
                  <CardStat label="Vencidos"               valor={statsGeral.poVencidos}    cor="#dc2626" />
                  <CardStat label="Programados"            valor={statsGeral.poProgramados} cor="#7c3aed" />
                </div>
              </div>
              <div>
                <p style={{ fontSize: 11, fontWeight: 600, color: '#555', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: 1 }}>MEDICINA DO TRABALHO</p>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <CardStat label="No Prazo"             valor={statsGeral.medNoPrazo}     cor="#16a34a" />
                  <CardStat label="Prazo Crítico"        valor={statsGeral.medCritico}     cor="#a16207" />
                  <CardStat label="Bernhoeft c/ Atenção" valor={statsGeral.medAtencao}     cor="#c2410c" />
                  <CardStat label="Vencidos"             valor={statsGeral.medVencido}     cor="#dc2626" />
                  <CardStat label="Programados"          valor={statsGeral.medProgramados} cor="#7c3aed" />
                </div>
              </div>
            </div>
          )}

          {/* ── BASE NR ── */}
          {abaModulo === 'nr' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <CardStat label="Registros Válidos"      valor={statsGeral.nrValidos}     cor="#16a34a" />
                <CardStat label="Próximos do Vencimento" valor={statsGeral.nrProximos}    cor="#d97706" sub="≤30 dias" />
                <CardStat label="Vencidos"               valor={statsGeral.nrVencidos}    cor="#dc2626" />
                <CardStat label="Programados"            valor={statsGeral.nrProgramados} cor="#7c3aed" />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <ToggleAgrup valor={agrupNR} onChange={setAgrupNR} />
              </div>
              <GraficoBarrasNR registros={registrosNR} agrup={agrupNR} titulo={`Registros NR — ${agrupNR === 'base' ? 'por Base' : agrupNR === 'gerencia' ? 'por Gerência' : 'Top 10 Supervisores'}`} />
            </div>
          )}

          {/* ── BASE PO ── */}
          {abaModulo === 'po' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <CardStat label="Registros Válidos"      valor={statsGeral.poValidos}     cor="#16a34a" />
                <CardStat label="Próximos do Vencimento" valor={statsGeral.poProximos}    cor="#d97706" sub="≤30 dias" />
                <CardStat label="Vencidos"               valor={statsGeral.poVencidos}    cor="#dc2626" />
                <CardStat label="Programados"            valor={statsGeral.poProgramados} cor="#7c3aed" />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <ToggleAgrup valor={agrupPO} onChange={setAgrupPO} />
              </div>
              <GraficoBarrasNR registros={registrosPO} agrup={agrupPO} titulo={`Registros PO — ${agrupPO === 'base' ? 'por Base' : agrupPO === 'gerencia' ? 'por Gerência' : 'Top 10 Supervisores'}`} />
            </div>
          )}

          {/* ── MEDICINA ── */}
          {abaModulo === 'medicina' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <CardStat label="No Prazo"             valor={statsGeral.medNoPrazo}     cor="#16a34a" />
                <CardStat label="Prazo Crítico"        valor={statsGeral.medCritico}     cor="#a16207" sub="≤60 dias" />
                <CardStat label="Bernhoeft c/ Atenção" valor={statsGeral.medAtencao}     cor="#c2410c" sub="≤30 dias" />
                <CardStat label="Vencidos"             valor={statsGeral.medVencido}     cor="#dc2626" />
                <CardStat label="Programados"          valor={statsGeral.medProgramados} cor="#7c3aed" />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <ToggleAgrup valor={agrupMed} onChange={setAgrupMed} />
              </div>
              <GraficoBarrasMed registros={registrosMed} agrup={agrupMed} titulo={`ASOs Periódicos — ${agrupMed === 'base' ? 'por Base' : agrupMed === 'gerencia' ? 'por Gerência' : 'Top 10 Supervisores'}`} />
            </div>
          )}
        </>
      )}
    </div>
  )
}