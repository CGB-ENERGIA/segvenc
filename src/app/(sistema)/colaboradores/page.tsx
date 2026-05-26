'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'

// ─── CONSTANTES ───────────────────────────────────────────────────────────────
const COR = '#9f183c'
const POR_PAGINA = 50
const SITUACOES = ['ATIVO', 'AF.PREVIDÊNCIA', 'AVISO PRÉVIO', 'FÉRIAS', 'LICENÇA MATERNIDADE', 'DEMITIDO']
const PROCESSOS = ['Administrativo','Almoxarifado','Construção','Corte e Religação','Frota','Inspeção','Ligação Nova','Linha Viva','Manutenção','Plantão','Poda','Qualidade e Equipamentos','Seed Money','Segurança','Tat','Transporte']
const ESTADOS_CIVIS = ['Solteiro(a)', 'Casado(a)', 'Divorciado(a)', 'Viúvo(a)', 'União Estável']

const COLUNAS_DEF = [
  { key: 'nome',           label: 'Nome' },
  { key: 'matricula',      label: 'Matrícula' },
  { key: 'funcao',         label: 'Função' },
  { key: 'processo',       label: 'Processo' },
  { key: 'gse',            label: 'GSE' },
  { key: 'base',           label: 'Base' },
  { key: 'gerencia',       label: 'Gerência' },
  { key: 'supervisor',     label: 'Supervisor' },
  { key: 'admissao',       label: 'Admissão' },
  { key: 'situacao',       label: 'Situação' },
  { key: 'sexo',           label: 'Sexo' },
  { key: 'estado_civil',   label: 'Estado Civil' },
  { key: 'data_nascimento',label: 'Dt. Nascimento' },
  { key: 'cpf',            label: 'CPF' },
  { key: 'rg',             label: 'RG' },
  { key: 'rg_orgao',       label: 'Órgão RG' },
  { key: 'rg_uf',          label: 'UF RG' },
  { key: 'demissao',       label: 'Demissão' },
  { key: 'email',          label: 'E-mail' },
  { key: 'contato',        label: 'Contato' },
]
const COLUNAS_PADRAO = ['nome','matricula','funcao','processo','gse','base','gerencia','supervisor','admissao','situacao']

// ─── TIPOS ────────────────────────────────────────────────────────────────────
interface Colaborador {
  matricula: string; nome: string; funcoes: { nome: string } | null; funcao_id: number | null
  gse: number | null; base_id: number | null; gerencia_id: number | null
  contato: string | null; processo: string | null
  data_admissao: string | null; data_demissao: string | null
  email_corporativo: string | null; situacao: string
  gerencia: string | null; supervisor: string | null; bases: { nome: string } | null
  sexo: string | null; data_nascimento: string | null; estado_civil: string | null
  cpf: string | null; rg: string | null; rg_orgao: string | null; rg_uf: string | null
}
interface Base     { id: number; nome: string }
interface Funcao   { id: number; nome: string }
interface Gerencia { id: number; sigla: string; nome: string; gerente_matricula: string | null }
interface Supervisor { id: number; nome: string }
interface DiffCampo { campo: string; label: string; antigo: string | null; novo: string | null }
interface DiffImport {
  matricula: string; nome: string; tipo: 'novo' | 'atualizacao'
  campos: DiffCampo[]; dados: any; selecionado: boolean
  cnh?: { numero: string | null; categoria: string | null; vencimento: string | null }
}

type OrdemColuna = 'nome' | 'matricula' | 'funcao' | 'processo' | 'base' | 'gerencia' | 'supervisor' | 'admissao' | 'demissao' | 'situacao'
type OrdemDirecao = 'asc' | 'desc'
type FiltroCard = 'ATIVO' | 'AF.PREVIDÊNCIA' | 'FÉRIAS' | 'AVISO PRÉVIO' | 'LICENÇA MATERNIDADE' | 'DEMITIDO' | null

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function parseDateBR(val: any): string | null {
  if (!val) return null
  if (typeof val === 'number') {
    const d = new Date(Math.round((val - 25569) * 86400 * 1000))
    return d.toISOString().split('T')[0]
  }
  if (typeof val === 'string') {
    const m = val.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
    if (m) return `${m[3]}-${m[2]}-${m[1]}`
    if (/^\d{4}-\d{2}-\d{2}$/.test(val.trim())) return val.trim()
  }
  return null
}
function mapSituacao(val: string): string {
  const v = (val || '').trim().toUpperCase()
  if (v === 'ATIVO' || v === 'ATIVA') return 'ATIVO'
  if (v === 'DEMITIDO' || v === 'DEMITIDA') return 'DEMITIDO'
  if (v.includes('FÉRIAS') || v.includes('FERIAS')) return 'FÉRIAS'
  if (v.includes('PREVIDÊNCIA') || v.includes('PREVIDENCIA')) return 'AF.PREVIDÊNCIA'
  if (v.includes('AVISO')) return 'AVISO PRÉVIO'
  if (v.includes('MATERNIDADE')) return 'LICENÇA MATERNIDADE'
  return v
}
function fmtData(d: string | null | undefined) {
  if (!d) return '—'
  return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR')
}

// ─── COMPONENTES ──────────────────────────────────────────────────────────────
function ThOrdenavel({ label, coluna, ordemAtual, direcao, onClick, style }: {
  label: string; coluna: OrdemColuna; ordemAtual: OrdemColuna; direcao: OrdemDirecao
  onClick: (col: OrdemColuna) => void; style?: React.CSSProperties
}) {
  const ativo = ordemAtual === coluna
  return (
    <th onClick={() => onClick(coluna)} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: ativo ? COR : '#333', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none', borderBottom: ativo ? `2px solid ${COR}` : '2px solid #e0e0e0', position: 'sticky', top: 0, backgroundColor: '#fafafa', zIndex: 3, fontSize: 12, ...style }}>
      {label} {ativo ? (direcao === 'asc' ? '↑' : '↓') : <span style={{ color: '#ccc' }}>↕</span>}
    </th>
  )
}

function ThSimples({ label, style }: { label: string; style?: React.CSSProperties }) {
  return (
    <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: '#333', whiteSpace: 'nowrap', borderBottom: '2px solid #e0e0e0', position: 'sticky', top: 0, backgroundColor: '#fafafa', zIndex: 3, fontSize: 12, ...style }}>{label}</th>
  )
}

function BotaoExportar({ onClick }: { onClick: (t: 'csv' | 'xlsx') => void }) {
  const [open, setOpen] = useState(false); const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h) }, [])
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(!open)} style={{ height: 36, padding: '0 14px', fontSize: 13, border: '1px solid #e0e0e0', borderRadius: 8, backgroundColor: 'white', color: '#555', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
        📥 Exportar <span style={{ fontSize: 10 }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 40, right: 0, zIndex: 150, backgroundColor: 'white', border: '1px solid #e0e0e0', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', width: 180, overflow: 'hidden' }}>
          {(['csv', 'xlsx'] as const).map((t, i) => (
            <button key={t} onClick={() => { onClick(t); setOpen(false) }} style={{ width: '100%', padding: '10px 16px', fontSize: 13, textAlign: 'left', border: 'none', background: 'none', cursor: 'pointer', color: '#333', borderTop: i > 0 ? '1px solid #f0f0f0' : 'none' }}
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

function SeletorColunas({ colunas, visiveis, onChange }: { colunas: { key: string; label: string }[]; visiveis: string[]; onChange: (c: string[]) => void }) {
  const [open, setOpen] = useState(false); const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h) }, [])
  const toggle = (k: string) => onChange(visiveis.includes(k) ? visiveis.filter(v => v !== k) : [...visiveis, k])
  const todas = colunas.every(c => visiveis.includes(c.key))
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(!open)} style={{ height: 36, border: '1px solid #e0e0e0', borderRadius: 8, padding: '0 12px', fontSize: 13, backgroundColor: 'white', color: '#555', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
        ⊞ Colunas {open ? '▲' : '▼'}
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 40, right: 0, zIndex: 150, backgroundColor: 'white', border: '1px solid #e0e0e0', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', width: 220, maxHeight: 380, overflowY: 'auto' }}>
          <div style={{ padding: '8px 14px', borderBottom: '1px solid #f0f0f0' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 600, color: '#333', cursor: 'pointer' }}>
              <input type="checkbox" checked={todas} onChange={() => onChange(todas ? [] : colunas.map(c => c.key))} style={{ accentColor: COR }} /> Todas as colunas
            </label>
          </div>
          {colunas.map(col => (
            <label key={col.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px', fontSize: 12, cursor: 'pointer', backgroundColor: visiveis.includes(col.key) ? '#fdf2f5' : 'white', color: visiveis.includes(col.key) ? COR : '#555' }}>
              <input type="checkbox" checked={visiveis.includes(col.key)} onChange={() => toggle(col.key)} style={{ accentColor: COR }} /> {col.label}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── PÁGINA PRINCIPAL ─────────────────────────────────────────────────────────
export default function ColaboradoresPage() {
  const router = useRouter()
  const { usuario } = useAuth()

  const [colaboradores, setColaboradores] = useState<Colaborador[]>([])
  const [bases, setBases] = useState<Base[]>([])
  const [funcoes, setFuncoes] = useState<Funcao[]>([])
  const [gerencias, setGerencias] = useState<Gerencia[]>([])
  const [supervisores, setSupervisores] = useState<Supervisor[]>([])
  const [gsesDaFuncao, setGsesDaFuncao] = useState<{ id: number; setor: string }[]>([])
  const [carregando, setCarregando] = useState(true)

  // Filtros
  const [filtroBase, setFiltroBase] = useState('')
  const [filtroFuncao, setFiltroFuncao] = useState('')
  const [filtroSituacao, setFiltroSituacao] = useState('ATIVO')
  const [filtroBusca, setFiltroBusca] = useState('')
  const [filtroCard, setFiltroCard] = useState<FiltroCard>(null)
  const [pagina, setPagina] = useState(1)
  const [total, setTotal] = useState(0)
  const [colunas, setColunas] = useState<string[]>(COLUNAS_PADRAO)

  // Stats
  const [statsTotal, setStatsTotal] = useState(0); const [statsAtivo, setStatsAtivo] = useState(0)
  const [statsAfastado, setStatsAfastado] = useState(0); const [statsFerias, setStatsFerias] = useState(0)
  const [statsAviso, setStatsAviso] = useState(0); const [statsLicenca, setStatsLicenca] = useState(0)
  const [statsDemitido, setStatsDemitido] = useState(0); const [carregandoStats, setCarregandoStats] = useState(true)

  // Modal
  const [modalAberto, setModalAberto] = useState(false); const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null); const [ordemColuna, setOrdemColuna] = useState<OrdemColuna>('nome')
  const [ordemDirecao, setOrdemDirecao] = useState<OrdemDirecao>('asc'); const [editando, setEditando] = useState<string | null>(null)
  const [modalExcluirAberto, setModalExcluirAberto] = useState(false); const [confirmacaoMatricula, setConfirmacaoMatricula] = useState('')
  const [excluindo, setExcluindo] = useState(false); const [erroExcluir, setErroExcluir] = useState<string | null>(null)
  const [form, setForm] = useState({
    matricula: '', nome: '', funcao_id: '', base_id: '', gerencia: '', contato: '',
    processo: '', supervisor: '', data_admissao: '', data_demissao: '',
    email_corporativo: '', situacao: 'ATIVO', gse: '', sexo: '',
    data_nascimento: '', estado_civil: '', cpf: '', rg: '', rg_orgao: '', rg_uf: '',
  })

  // Import
  const [importModal, setImportModal] = useState(false)
  const [importStep, setImportStep] = useState<1 | 2>(1)
  const [importDiffs, setImportDiffs] = useState<DiffImport[]>([])
  const [importProcessando, setImportProcessando] = useState(false)
  const [importSalvando, setImportSalvando] = useState(false)
  const [importErro, setImportErro] = useState<string | null>(null)
  const [importLog, setImportLog] = useState<string[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ─── DADOS ─────────────────────────────────────────────────────────────────
  async function buscarStats() {
    setCarregandoStats(true)
    let todos: any[] = []; let from = 0
    while (true) {
      const { data } = await supabase.from('colaboradores').select('situacao').range(from, from + 999)
      if (!data || data.length === 0) break
      todos = [...todos, ...data]; if (data.length < 1000) break; from += 1000
    }
    setStatsTotal(todos.length); setStatsAtivo(todos.filter(c => c.situacao === 'ATIVO').length)
    setStatsAfastado(todos.filter(c => c.situacao === 'AF.PREVIDÊNCIA').length)
    setStatsFerias(todos.filter(c => c.situacao === 'FÉRIAS').length)
    setStatsAviso(todos.filter(c => c.situacao === 'AVISO PRÉVIO').length)
    setStatsLicenca(todos.filter(c => c.situacao === 'LICENÇA MATERNIDADE').length)
    setStatsDemitido(todos.filter(c => c.situacao === 'DEMITIDO').length)
    setCarregandoStats(false)
  }

  async function buscarGsesDaFuncao(funcaoId: string) {
    if (!funcaoId) { setGsesDaFuncao([]); return }
    const funcao = funcoes.find(f => f.id === parseInt(funcaoId))
    if (!funcao) { setGsesDaFuncao([]); return }
    const { data } = await supabase.from('gse_funcoes').select('gse_id, gses(id, setor)').eq('funcao', funcao.nome)
    const lista = (data || []).map((g: any) => ({ id: g.gse_id, setor: g.gses?.setor || '' }))
    setGsesDaFuncao(lista)
    if (lista.length === 1) setForm(f => ({ ...f, gse: String(lista[0].id) }))
    else setForm(f => ({ ...f, gse: '' }))
  }

  async function buscar(base: string, funcao: string, situacao: string, pag: number = 1, busca: string = '') {
    setCarregando(true)
    const from = (pag - 1) * POR_PAGINA; const to = from + POR_PAGINA - 1
    let q = supabase.from('colaboradores').select(
      'matricula, nome, funcao_id, gse, base_id, gerencia_id, contato, processo, data_admissao, data_demissao, email_corporativo, situacao, gerencia, supervisor, sexo, data_nascimento, estado_civil, cpf, rg, rg_orgao, rg_uf, bases(nome), funcoes(nome)',
      { count: 'exact' }
    ).order('nome').range(from, to)
    if (situacao) q = q.eq('situacao', situacao)
    if (base) q = q.eq('base_id', parseInt(base))
    if (funcao) q = q.eq('funcao_id', parseInt(funcao))
    if (busca) q = q.or(`nome.ilike.%${busca}%,matricula.ilike.%${busca}%`)
    const { data, count } = await q
    setColaboradores((data as unknown as Colaborador[]) || []); setTotal(count || 0); setCarregando(false)
  }

  useEffect(() => {
    async function init() {
      const [{ data: b }, { data: f }, { data: g }, { data: s }] = await Promise.all([
        supabase.from('bases').select('id, nome').order('nome'),
        supabase.from('funcoes').select('id, nome').order('nome'),
        supabase.from('gerencias').select('id, sigla, nome, gerente_matricula').order('sigla'),
        supabase.from('supervisores').select('id, nome').order('nome'),
      ])
      setBases(b || []); setFuncoes(f || [])
      setGerencias((g as unknown as Gerencia[]) || []); setSupervisores((s as unknown as Supervisor[]) || [])
      await Promise.all([buscar('', '', 'ATIVO', 1, ''), buscarStats()])
    }
    init()
  }, [])

  useEffect(() => { setPagina(1); buscar(filtroBase, filtroFuncao, filtroSituacao, 1, filtroBusca) }, [filtroBase, filtroFuncao, filtroSituacao, filtroBusca])

  // ─── CRUD ──────────────────────────────────────────────────────────────────
  function handleCard(status: FiltroCard) {
    if (filtroCard === status) { setFiltroCard(null); setFiltroSituacao('') }
    else { setFiltroCard(status); setFiltroSituacao(status || '') }
    setPagina(1)
  }
  function toggleOrdem(coluna: OrdemColuna) {
    if (ordemColuna === coluna) setOrdemDirecao(d => d === 'asc' ? 'desc' : 'asc')
    else { setOrdemColuna(coluna); setOrdemDirecao('asc') }
  }
  function limparFiltros() { setFiltroBusca(''); setFiltroBase(''); setFiltroFuncao(''); setFiltroSituacao('ATIVO'); setFiltroCard(null); setPagina(1) }

  const ordenados = [...colaboradores].sort((a, b) => {
    const mapa: Record<string, string> = {
      nome: a.nome, matricula: a.matricula, funcao: a.funcoes?.nome || '',
      processo: a.processo || '', base: a.bases?.nome || '', gerencia: a.gerencia || '',
      supervisor: a.supervisor || '', admissao: a.data_admissao || '',
      demissao: a.data_demissao || '', situacao: a.situacao,
    }
    const mapaB: Record<string, string> = {
      nome: b.nome, matricula: b.matricula, funcao: b.funcoes?.nome || '',
      processo: b.processo || '', base: b.bases?.nome || '', gerencia: b.gerencia || '',
      supervisor: b.supervisor || '', admissao: b.data_admissao || '',
      demissao: b.data_demissao || '', situacao: b.situacao,
    }
    const vA = mapa[ordemColuna] || ''; const vB = mapaB[ordemColuna] || ''
    return ordemDirecao === 'asc' ? vA.localeCompare(vB) : vB.localeCompare(vA)
  })

  function abrirNovo() {
    setEditando(null)
    setForm({ matricula: '', nome: '', funcao_id: '', base_id: '', gerencia: '', supervisor: '', contato: '', processo: '', data_admissao: '', data_demissao: '', email_corporativo: '', situacao: 'ATIVO', gse: '', sexo: '', data_nascimento: '', estado_civil: '', cpf: '', rg: '', rg_orgao: '', rg_uf: '' })
    setGsesDaFuncao([]); setErro(null); setModalAberto(true)
  }
  function abrirEdicao(c: Colaborador) {
    setEditando(c.matricula)
    setForm({ matricula: c.matricula, nome: c.nome, funcao_id: c.funcao_id?.toString() || '', base_id: c.base_id?.toString() || '', gerencia: c.gerencia || '', supervisor: c.supervisor || '', contato: c.contato || '', processo: c.processo || '', data_admissao: c.data_admissao || '', data_demissao: c.data_demissao || '', email_corporativo: c.email_corporativo || '', situacao: c.situacao, gse: c.gse?.toString() || '', sexo: c.sexo || '', data_nascimento: c.data_nascimento || '', estado_civil: c.estado_civil || '', cpf: c.cpf || '', rg: c.rg || '', rg_orgao: c.rg_orgao || '', rg_uf: c.rg_uf || '' })
    if (c.funcao_id) buscarGsesDaFuncao(c.funcao_id.toString())
    setErro(null); setModalAberto(true)
  }
  async function salvar() {
    if (!form.nome || !form.matricula) { setErro('Nome e matrícula são obrigatórios.'); return }
    setSalvando(true); setErro(null)
    const payload = {
      matricula: form.matricula, nome: form.nome.toUpperCase(), funcao_id: form.funcao_id ? parseInt(form.funcao_id) : null,
      base_id: form.base_id ? parseInt(form.base_id) : null, gerencia: form.gerencia || null, supervisor: form.supervisor || null,
      contato: form.contato || null, processo: form.processo || null, data_admissao: form.data_admissao || null,
      data_demissao: form.data_demissao || null, email_corporativo: form.email_corporativo || null,
      situacao: form.situacao, gse: form.gse ? parseInt(form.gse) : null, sexo: form.sexo || null,
      data_nascimento: form.data_nascimento || null, estado_civil: form.estado_civil || null,
      cpf: form.cpf || null, rg: form.rg || null, rg_orgao: form.rg_orgao || null, rg_uf: form.rg_uf || null,
    }
    if (editando) {
      const { error } = await supabase.from('colaboradores').update(payload).eq('matricula', editando)
      if (error) { setErro('Erro ao salvar: ' + error.message); setSalvando(false); return }
    } else {
      const { error } = await supabase.from('colaboradores').insert(payload)
      if (error) { setErro('Erro ao cadastrar: ' + error.message); setSalvando(false); return }
    }
    setSalvando(false); setModalAberto(false)
    await Promise.all([buscar(filtroBase, filtroFuncao, filtroSituacao, pagina, filtroBusca), buscarStats()])
  }
  async function excluir() {
    if (confirmacaoMatricula !== editando) { setErroExcluir('Matrícula incorreta.'); return }
    setExcluindo(true); setErroExcluir(null)
    const { error } = await supabase.from('colaboradores').delete().eq('matricula', editando!)
    if (error) { setErroExcluir('Erro: ' + error.message); setExcluindo(false); return }
    setExcluindo(false); setModalExcluirAberto(false); setModalAberto(false)
    await Promise.all([buscar(filtroBase, filtroFuncao, filtroSituacao, pagina, filtroBusca), buscarStats()])
  }

  // ─── EXPORTAR ──────────────────────────────────────────────────────────────
  async function exportar(tipo: 'csv' | 'xlsx') {
    let todos: any[] = []; let from = 0
    while (true) {
      let q = supabase.from('colaboradores').select('matricula, nome, funcao_id, gse, base_id, situacao, gerencia, supervisor, processo, data_admissao, data_demissao, sexo, estado_civil, data_nascimento, cpf, rg, rg_orgao, rg_uf, contato, email_corporativo, bases(nome), funcoes(nome)').order('nome').range(from, from + 499)
      if (filtroSituacao) q = q.eq('situacao', filtroSituacao)
      if (filtroBase) q = q.eq('base_id', parseInt(filtroBase))
      if (filtroFuncao) q = q.eq('funcao_id', parseInt(filtroFuncao))
      if (filtroBusca) q = q.or(`nome.ilike.%${filtroBusca}%,matricula.ilike.%${filtroBusca}%`)
      const { data } = await q
      if (!data || data.length === 0) break
      todos = [...todos, ...data]; if (data.length < 500) break; from += 500
    }
    const linhas = todos.map((c: any) => ({
      'Matrícula': c.matricula, 'Nome': c.nome, 'Função': c.funcoes?.nome || '',
      'Base': c.bases?.nome || '', 'GSE': c.gse || '', 'Gerência': c.gerencia || '',
      'Supervisor': c.supervisor || '', 'Processo': c.processo || '', 'Sexo': c.sexo || '',
      'Estado Civil': c.estado_civil || '', 'Dt. Nascimento': fmtData(c.data_nascimento),
      'CPF': c.cpf || '', 'RG': c.rg || '', 'Órgão RG': c.rg_orgao || '', 'UF RG': c.rg_uf || '',
      'Admissão': fmtData(c.data_admissao), 'Demissão': fmtData(c.data_demissao),
      'E-mail': c.email_corporativo || '', 'Contato': c.contato || '', 'Situação': c.situacao,
    }))
    const nome = `colaboradores-${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}`
    if (tipo === 'csv') {
      const cols = Object.keys(linhas[0])
      const csv = [cols.map(h => `"${h}"`).join(';'), ...linhas.map(r => cols.map(h => `"${String((r as any)[h] ?? '').replace(/"/g, '""')}"`).join(';'))].join('\n')
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })); a.download = nome + '.csv'; a.click()
    } else {
      const X = await import('xlsx'); const ws = X.utils.json_to_sheet(linhas); const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, ws, 'Colaboradores'); X.writeFile(wb, nome + '.xlsx')
    }
  }

  // ─── IMPORTAR ──────────────────────────────────────────────────────────────
  async function processarArquivo(file: File) {
    setImportProcessando(true); setImportErro(null); setImportLog([])
    try {
      const X = await import('xlsx')
      const buffer = await file.arrayBuffer()
      const wb = X.read(buffer, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows: any[] = X.utils.sheet_to_json(ws, { defval: '' })
      const logs: string[] = []

      // Carregar mapeamento de Base (Seção)
      const { data: mapaSecao } = await supabase.from('secao_base_map').select('secao_texto, base_nome')
      const secaoMap: Record<string, string> = {}
      ;(mapaSecao || []).forEach((m: any) => { secaoMap[m.secao_texto.trim().toUpperCase()] = m.base_nome })

      // Agrupar por CHAPA
      const groupedByChapa: Record<string, any[]> = {}
      rows.forEach((r: any) => {
        const mat = String(r['CHAPA'] || '').trim()
        if (!mat) return
        if (!groupedByChapa[mat]) groupedByChapa[mat] = []
        groupedByChapa[mat].push(r)
      })
      const matAll = Object.keys(groupedByChapa)
      logs.push(`${rows.length} linhas lidas → ${matAll.length} colaboradores únicos`)

      // Buscar existentes e suas CNHs atuais em lotes de 100
      const existentesMap: Record<string, any> = {}
      const cnhExistenteMap: Record<string, any> = {}
      
      for (let i = 0; i < matAll.length; i += 100) {
        const loteMatriculas = matAll.slice(i, i + 100)
        
        const [{ data: ed }, { data: cd }] = await Promise.all([
          supabase.from('colaboradores')
            .select('matricula, nome, situacao, sexo, estado_civil, data_nascimento, cpf, rg, rg_orgao, rg_uf, data_admissao, data_demissao, base_id, funcao_id, bases(nome), funcoes(nome)')
            .in('matricula', loteMatriculas),
          supabase.from('cnhs')
            .select('matricula_colaborador, numero_cnh, categoria, data_vencimento')
            .in('matricula_colaborador', loteMatriculas)
            .eq('is_atual', true)
        ])
        
        ;(ed || []).forEach((c: any) => { existentesMap[c.matricula] = c })
        ;(cd || []).forEach((c: any) => { cnhExistenteMap[c.matricula_colaborador] = c })
      }

      const diffs: DiffImport[] = []

      for (const [mat, rowsColab] of Object.entries(groupedByChapa)) {
        const r = rowsColab[0]
        const existente = existentesMap[mat]

        // 1. Dados de vínculo básico
        const nomeNovo        = String(r['NOME'] || '').trim().toUpperCase()
        const situacaoNova    = mapSituacao(String(r['SITUAÇÃO'] || r['SITUACAO'] || ''))
        const funcaoNome      = String(r['FUNÇÃO'] || r['FUNCAO'] || '').trim().toUpperCase()
        const funcaoEnc       = funcoes.find(f => f.nome.toUpperCase() === funcaoNome)
        const secaoKey        = String(r['SEÇÃO'] || r['SECAO'] || '').trim().toUpperCase()
        const baseNome        = secaoMap[secaoKey] || null
        const baseEnc         = baseNome ? bases.find(b => b.nome.toUpperCase() === baseNome.toUpperCase()) : null

        const tipo: 'novo' | 'atualizacao' = existente ? 'atualizacao' : 'novo'

        if (tipo === 'novo' && situacaoNova === 'DEMITIDO') continue

        // 2. Proteção contra colunas ausentes na planilha
        const sexoNovo        = 'SEXO' in r ? (String(r['SEXO']).trim().toUpperCase() || null) : (existente?.sexo || null)
        const estadoCivilNovo = 'ESTADO_CIVIL' in r ? (String(r['ESTADO_CIVIL']).trim().toUpperCase() || null) : (existente?.estado_civil || null)
        const cpfNovo         = 'CPF' in r ? (String(r['CPF']).trim().replace(/\D/g, '') || null) : (existente?.cpf || null)
        
        const dtNascNova      = 'DTNASC' in r ? parseDateBR(r['DTNASC']) : (existente?.data_nascimento || null)
        const dtAdmNova       = ('ADMISSÃO' in r || 'ADMISSAO' in r) ? parseDateBR(r['ADMISSÃO'] || r['ADMISSAO']) : (existente?.data_admissao || null)
        const dtDemNova       = ('DEMISSÃO' in r || 'DEMISSAO' in r) ? parseDateBR(r['DEMISSÃO'] || r['DEMISSAO']) : (existente?.data_demissao || null)

        const rgNovo          = 'CARTIDENTIDADE' in r ? (String(r['CARTIDENTIDADE']).trim() || null) : (existente?.rg || null)
        const rgUfNovo        = 'UFCARTIDENT' in r ? (String(r['UFCARTIDENT']).trim().toUpperCase() || null) : (existente?.rg_uf || null)
        const rgOrgaoNovo     = 'ORGEMISSORIDENT' in r ? (String(r['ORGEMISSORIDENT']).trim().toUpperCase() || null) : (existente?.rg_orgao || null)

        // 3. Validação inteligente da CNH
        const numeroCNH       = String(r['CARTMOTORISTA'] || '').trim() || null
        const categoriaCNH    = String(r['TIPOCARTHABILIT'] || '').trim().toUpperCase() || null
        const vencimentoCNH   = parseDateBR(r['DTVENCHABILIT'])

        const cnhAtual = cnhExistenteMap[mat]
        const cnhMudou = !!numeroCNH && (
          !cnhAtual || 
          cnhAtual.numero_cnh !== numeroCNH || 
          cnhAtual.categoria !== categoriaCNH || 
          cnhAtual.data_vencimento !== vencimentoCNH
        )

        // ── CONSTRUÇÃO DO DIFF ──
        const campos: DiffCampo[] = []
        const check = (campo: string, label: string, antigo: string | null | undefined, novo: string | null | undefined) => {
          const a = antigo || null; const n = novo || null
          if (a !== n) campos.push({ campo, label, antigo: a, novo: n })
        }

        if (tipo === 'novo') {
          if (nomeNovo)        campos.push({ campo: 'nome',          label: 'Nome',      antigo: null, novo: nomeNovo })
          if (situacaoNova)    campos.push({ campo: 'situacao',      label: 'Situação',  antigo: null, novo: situacaoNova })
          if (funcaoEnc)       campos.push({ campo: 'funcao',        label: 'Função',    antigo: null, novo: funcaoEnc.nome })
          if (baseEnc)         campos.push({ campo: 'base',          label: 'Base',      antigo: null, novo: baseEnc.nome })
          if (dtAdmNova)       campos.push({ campo: 'data_admissao', label: 'Admissão',  antigo: null, novo: fmtData(dtAdmNova) })
          if (sexoNovo)        campos.push({ campo: 'sexo',          label: 'Sexo',      antigo: null, novo: sexoNovo })
          if (estadoCivilNovo) campos.push({ campo: 'estado_civil',  label: 'Est. Civil',antigo: null, novo: estadoCivilNovo })
          if (dtNascNova)      campos.push({ campo: 'data_nascimento',label: 'Dt. Nasc.',antigo: null, novo: fmtData(dtNascNova) })
          if (cpfNovo)         campos.push({ campo: 'cpf',           label: 'CPF',       antigo: null, novo: cpfNovo })
          if (rgNovo)          campos.push({ campo: 'rg',            label: 'RG',        antigo: null, novo: rgNovo })
          if (rgOrgaoNovo)     campos.push({ campo: 'rg_orgao',      label: 'Órgão RG',  antigo: null, novo: rgOrgaoNovo })
        } else {
          check('nome',            'Nome',        existente.nome,                  nomeNovo)
          check('situacao',        'Situação',    existente.situacao,              situacaoNova)
          check('sexo',            'Sexo',        existente.sexo,                  sexoNovo)
          check('estado_civil',    'Est. Civil',  existente.estado_civil,          estadoCivilNovo)
          check('data_nascimento', 'Dt. Nasc.',   fmtData(existente.data_nascimento), fmtData(dtNascNova))
          check('cpf',             'CPF',         existente.cpf,                   cpfNovo)
          check('rg',              'RG',          existente.rg,                    rgNovo)
          check('rg_orgao',        'Órgão RG',    existente.rg_orgao,              rgOrgaoNovo)
          check('rg_uf',           'UF RG',       existente.rg_uf,                 rgUfNovo)
          check('data_admissao',   'Admissão',    fmtData(existente.data_admissao),fmtData(dtAdmNova))
          check('data_demissao',   'Demissão',    fmtData(existente.data_demissao),fmtData(dtDemNova))
          check('funcao',          'Função',      existente.funcoes?.nome,         funcaoEnc?.nome)
          check('base',            'Base',        existente.bases?.nome,           baseEnc?.nome)
        }

        // Se nada mudou nos campos de RH E a CNH também não mudou, ignora este colaborador
        if (campos.length === 0 && !cnhMudou && tipo === 'atualizacao') continue

        diffs.push({
          matricula: mat, nome: nomeNovo, tipo, campos, selecionado: true,
          dados: {
            matricula: mat, nome: nomeNovo, situacao: situacaoNova,
            sexo: sexoNovo, estado_civil: estadoCivilNovo, data_nascimento: dtNascNova,
            cpf: cpfNovo, rg: rgNovo, rg_orgao: rgOrgaoNovo, rg_uf: rgUfNovo, data_admissao: dtAdmNova, data_demissao: dtDemNova,
            funcao_id: funcaoEnc?.id || existente?.funcao_id || null,
            base_id: baseEnc?.id || existente?.base_id || null,
          },
          // A CNH só vai para a fila de salvamento se de fato houver alteração
          cnh: cnhMudou ? { numero: numeroCNH, categoria: categoriaCNH, vencimento: vencimentoCNH } : undefined,
        })
      }

      logs.push(`${diffs.filter(d => d.tipo === 'novo').length} novos colaboradores`)
      logs.push(`${diffs.filter(d => d.tipo === 'atualizacao').length} atualizações reais encontradas`)
      logs.push(`🛡️ GSE, Processo, Gerência e Supervisor mantidos intactos conforme o banco.`)

      setImportDiffs(diffs); setImportLog(logs); setImportStep(2)
    } catch (e: any) {
      setImportErro('Erro ao processar arquivo: ' + e.message)
    }
    setImportProcessando(false)
  }

  async function confirmarImportacao() {
    const selecionados = importDiffs.filter(d => d.selecionado)
    if (!selecionados.length) return
    setImportSalvando(true)
    let ok = 0; let erros = 0
    for (const d of selecionados) {
      try {
        const { error } = await supabase.from('colaboradores').upsert(d.dados, { onConflict: 'matricula' })
        if (error) { erros++; continue }
        if (d.cnh?.numero) {
          await supabase.from('cnhs').update({ is_atual: false }).eq('matricula_colaborador', d.matricula).eq('is_atual', true)
          await supabase.from('cnhs').insert({ matricula_colaborador: d.matricula, numero_cnh: d.cnh.numero, categoria: d.cnh.categoria, data_vencimento: d.cnh.vencimento, is_atual: true, exigencia: 'SIM' })
        }
        ok++
      } catch { erros++ }
    }
    setImportSalvando(false); setImportModal(false); setImportStep(1); setImportDiffs([])
    alert(`Importação concluída!\n✅ ${ok} registros salvos${erros > 0 ? `\n❌ ${erros} erros` : ''}`)
    await Promise.all([buscar(filtroBase, filtroFuncao, filtroSituacao, pagina, filtroBusca), buscarStats()])
  }

  // ─── ESTILOS ───────────────────────────────────────────────────────────────
  const totalPaginas = Math.ceil(total / POR_PAGINA)
  const temFiltroAtivo = !!(filtroBusca || filtroBase || filtroFuncao || filtroCard || filtroSituacao !== 'ATIVO')
  const corSituacao = (s: string) => {
    if (s === 'ATIVO') return { bg: '#f0fdf4', cor: '#16a34a' }
    if (s === 'AF.PREVIDÊNCIA') return { bg: '#fffbeb', cor: '#b45309' }
    return { bg: '#fef2f2', cor: '#dc2626' }
  }
  const inputStyle: React.CSSProperties = { width: '100%', height: 38, border: '1px solid #e0e0e0', borderRadius: 8, padding: '0 12px', fontSize: 13, color: '#333', backgroundColor: '#fafafa', outline: 'none', boxSizing: 'border-box' }
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, color: '#666', marginBottom: 5 }
  const selectStyle: React.CSSProperties = { height: 36, border: '1px solid #e0e0e0', borderRadius: 8, padding: '0 12px', fontSize: 13, backgroundColor: 'white', color: '#555', outline: 'none', boxSizing: 'border-box' }
  const vis = (k: string) => colunas.includes(k)

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* CABEÇALHO */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 18, fontWeight: 600, color: '#1a1a1a', margin: 0 }}>Colaboradores</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <BotaoExportar onClick={exportar} />
          <button onClick={() => { setImportModal(true); setImportStep(1); setImportDiffs([]); setImportErro(null); setImportLog([]) }}
            style={{ height: 36, padding: '0 14px', fontSize: 13, border: '1px solid #e0e0e0', borderRadius: 8, backgroundColor: 'white', color: '#555', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            📤 Importar
          </button>
          <button onClick={abrirNovo} style={{ height: 36, backgroundColor: COR, color: 'white', border: 'none', borderRadius: 8, padding: '0 18px', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
            + Novo Colaborador
          </button>
        </div>
      </div>

      {/* CARDS */}
      {carregandoStats
        ? <div style={{ display: 'flex', gap: 12, marginBottom: 12, overflowX: 'auto', paddingBottom: 4 }}>{[...Array(5)].map((_, i) => <div key={i} style={{ backgroundColor: 'white', borderRadius: 10, padding: '10px 16px', border: '1px solid #f0f0f0', minWidth: 140, flex: '1 0 140px' }}><div style={{ height: 10, backgroundColor: '#f0f0f0', borderRadius: 4, marginBottom: 8, width: '60%' }} /><div style={{ height: 24, backgroundColor: '#f0f0f0', borderRadius: 4, width: '40%' }} /></div>)}</div>
        : <div style={{ display: 'flex', gap: 12, marginBottom: 12, overflowX: 'auto', paddingBottom: 4 }}>
          {[
            { label: 'Total',               valor: statsTotal,    cor: '#4a4a49', status: null },
            { label: 'Ativos',              valor: statsAtivo,    cor: '#16a34a', status: 'ATIVO' as FiltroCard },
            { label: 'AF. Previdência',     valor: statsAfastado, cor: '#b45309', status: 'AF.PREVIDÊNCIA' as FiltroCard },
            { label: 'Férias',              valor: statsFerias,   cor: '#0284c7', status: 'FÉRIAS' as FiltroCard },
            { label: 'Aviso Prévio',        valor: statsAviso,    cor: '#7c3aed', status: 'AVISO PRÉVIO' as FiltroCard },
            { label: 'Licença Maternidade', valor: statsLicenca,  cor: '#db2777', status: 'LICENÇA MATERNIDADE' as FiltroCard },
            { label: 'Demitidos',           valor: statsDemitido, cor: '#dc2626', status: 'DEMITIDO' as FiltroCard },
          ].map((card, i) => {
            const ativo = filtroCard === card.status && card.status !== null
            return <div key={i} onClick={() => card.status !== null && handleCard(card.status)} style={{ backgroundColor: ativo ? card.cor + '12' : 'white', borderRadius: 10, padding: '10px 16px', border: ativo ? `2px solid ${card.cor}` : '1px solid #f0f0f0', minWidth: 140, flex: '1 0 140px', cursor: card.status !== null ? 'pointer' : 'default', transition: 'all 0.15s ease', boxShadow: ativo ? `0 2px 8px ${card.cor}30` : 'none' }}>
              <p style={{ fontSize: 11, color: '#888', margin: '0 0 4px' }}>{card.label}{ativo && <span style={{ marginLeft: 6, fontSize: 10, color: card.cor }}>● filtrado</span>}</p>
              <p style={{ fontSize: 24, fontWeight: 600, color: card.cor, margin: 0 }}>{card.valor.toLocaleString('pt-BR')}</p>
            </div>
          })}
        </div>}

      {/* FILTROS */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="text" placeholder="🔍 Buscar nome ou matrícula" value={filtroBusca} onChange={e => setFiltroBusca(e.target.value)} style={{ ...selectStyle, width: 260 }} />
        <select value={filtroBase} onChange={e => setFiltroBase(e.target.value)} style={{ ...selectStyle, width: 180 }}><option value="">TODAS AS BASES</option>{bases.map(b => <option key={b.id} value={b.id}>{b.nome}</option>)}</select>
        <select value={filtroFuncao} onChange={e => setFiltroFuncao(e.target.value)} style={{ ...selectStyle, width: 220 }}><option value="">TODAS AS FUNÇÕES</option>{funcoes.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}</select>
        <select value={filtroSituacao} onChange={e => { setFiltroSituacao(e.target.value); setFiltroCard(null) }} style={{ ...selectStyle, width: 160 }}><option value="">TODAS AS SITUAÇÕES</option>{SITUACOES.map(s => <option key={s} value={s}>{s}</option>)}</select>
        <div style={{ flex: 1 }} />
        {temFiltroAtivo && <button onClick={limparFiltros} style={{ height: 36, padding: '0 12px', fontSize: 12, border: '1px solid #fca5a5', borderRadius: 8, backgroundColor: '#fef2f2', color: '#dc2626', cursor: 'pointer' }}>✕ Limpar</button>}
        <SeletorColunas colunas={COLUNAS_DEF} visiveis={colunas} onChange={setColunas} />
      </div>

      {/* TABELA */}
      {carregando ? <p style={{ color: '#888', fontSize: 14 }}>Carregando...</p> : (
        <>
          <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 280px)', borderRadius: 12, border: '1px solid #f0f0f0', flex: 1 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: 'white', fontSize: 12 }}>
              <thead>
                <tr style={{ backgroundColor: '#fafafa' }}>
                  {vis('nome')            && <ThOrdenavel label="Nome"           coluna="nome"      ordemAtual={ordemColuna} direcao={ordemDirecao} onClick={toggleOrdem} style={{ minWidth: 180 }} />}
                  {vis('matricula')       && <ThOrdenavel label="Matrícula"      coluna="matricula" ordemAtual={ordemColuna} direcao={ordemDirecao} onClick={toggleOrdem} />}
                  {vis('funcao')          && <ThOrdenavel label="Função"         coluna="funcao"    ordemAtual={ordemColuna} direcao={ordemDirecao} onClick={toggleOrdem} />}
                  {vis('processo')        && <ThOrdenavel label="Processo"       coluna="processo"  ordemAtual={ordemColuna} direcao={ordemDirecao} onClick={toggleOrdem} />}
                  {vis('gse')             && <ThSimples   label="GSE" style={{ textAlign: 'center' }} />}
                  {vis('base')            && <ThOrdenavel label="Base"           coluna="base"      ordemAtual={ordemColuna} direcao={ordemDirecao} onClick={toggleOrdem} />}
                  {vis('gerencia')        && <ThOrdenavel label="Gerência"       coluna="gerencia"  ordemAtual={ordemColuna} direcao={ordemDirecao} onClick={toggleOrdem} />}
                  {vis('supervisor')      && <ThOrdenavel label="Supervisor"     coluna="supervisor"ordemAtual={ordemColuna} direcao={ordemDirecao} onClick={toggleOrdem} />}
                  {vis('admissao')        && <ThOrdenavel label="Admissão"       coluna="admissao"  ordemAtual={ordemColuna} direcao={ordemDirecao} onClick={toggleOrdem} />}
                  {vis('situacao')        && <ThOrdenavel label="Situação"       coluna="situacao"  ordemAtual={ordemColuna} direcao={ordemDirecao} onClick={toggleOrdem} />}
                  {vis('sexo')            && <ThSimples   label="Sexo" />}
                  {vis('estado_civil')    && <ThSimples   label="Est. Civil" />}
                  {vis('data_nascimento') && <ThSimples   label="Dt. Nasc." />}
                  {vis('cpf')             && <ThSimples   label="CPF" />}
                  {vis('rg')              && <ThSimples   label="RG" />}
                  {vis('rg_orgao')        && <ThSimples   label="Órgão RG" />}
                  {vis('rg_uf')           && <ThSimples   label="UF RG" />}
                  {vis('demissao')        && <ThOrdenavel label="Demissão"       coluna="demissao"  ordemAtual={ordemColuna} direcao={ordemDirecao} onClick={toggleOrdem} />}
                  {vis('email')           && <ThSimples   label="E-mail" />}
                  {vis('contato')         && <ThSimples   label="Contato" />}
                  <ThSimples label="" />
                </tr>
              </thead>
              <tbody>
                {ordenados.length === 0
                  ? <tr><td colSpan={99} style={{ padding: '48px 16px', textAlign: 'center', color: '#aaa', fontSize: 14 }}><p style={{ fontSize: 28, margin: '0 0 8px' }}>👤</p>Nenhum colaborador encontrado.</td></tr>
                  : ordenados.map((c, i) => {
                    const cor = corSituacao(c.situacao)
                    const tdS: React.CSSProperties = { padding: '9px 12px', color: '#555', whiteSpace: 'nowrap', borderBottom: '1px solid #f5f5f5', fontSize: 12 }
                    return (
                      <tr key={c.matricula} style={{ borderBottom: '1px solid #f5f5f5', backgroundColor: i % 2 === 0 ? 'white' : '#fafafa' }}>
                        {vis('nome')            && <td style={{ ...tdS, fontWeight: 500, color: '#333' }}>{c.nome}</td>}
                        {vis('matricula')       && <td style={tdS}>{c.matricula}</td>}
                        {vis('funcao')          && <td style={tdS}>{c.funcoes?.nome || '—'}</td>}
                        {vis('processo')        && <td style={tdS}>{c.processo || '—'}</td>}
                        {vis('gse')             && <td style={{ ...tdS, textAlign: 'center' }}>{c.gse ?? '—'}</td>}
                        {vis('base')            && <td style={tdS}>{c.bases?.nome || '—'}</td>}
                        {vis('gerencia')        && <td style={tdS}>{c.gerencia ? <span style={{ fontSize: 11, backgroundColor: '#fdf2f5', color: COR, padding: '2px 8px', borderRadius: 99, fontWeight: 600 }}>{c.gerencia}</span> : '—'}</td>}
                        {vis('supervisor')      && <td style={tdS}>{c.supervisor ? c.supervisor.trim().split(' ')[0] : '—'}</td>}
                        {vis('admissao')        && <td style={tdS}>{fmtData(c.data_admissao)}</td>}
                        {vis('situacao')        && <td style={tdS}><span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, backgroundColor: cor.bg, color: cor.cor }}>{c.situacao}</span></td>}
                        {vis('sexo')            && <td style={tdS}>{c.sexo || '—'}</td>}
                        {vis('estado_civil')    && <td style={tdS}>{c.estado_civil || '—'}</td>}
                        {vis('data_nascimento') && <td style={tdS}>{fmtData(c.data_nascimento)}</td>}
                        {vis('cpf')             && <td style={tdS}>{c.cpf || '—'}</td>}
                        {vis('rg')              && <td style={tdS}>{c.rg || '—'}</td>}
                        {vis('rg_orgao')        && <td style={tdS}>{c.rg_orgao || '—'}</td>}
                        {vis('rg_uf')           && <td style={tdS}>{c.rg_uf || '—'}</td>}
                        {vis('demissao')        && <td style={tdS}>{fmtData(c.data_demissao)}</td>}
                        {vis('email')           && <td style={tdS}>{c.email_corporativo || '—'}</td>}
                        {vis('contato')         && <td style={tdS}>{c.contato || '—'}</td>}
                        <td style={{ ...tdS, width: 60 }}>
                          <button onClick={() => abrirEdicao(c)} style={{ fontSize: 12, color: COR, background: 'none', border: `1px solid ${COR}`, borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>Editar</button>
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>

          {/* PAGINAÇÃO */}
          {total > POR_PAGINA && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, paddingTop: 16 }}>
              <button onClick={() => { const p = pagina - 1; setPagina(p); buscar(filtroBase, filtroFuncao, filtroSituacao, p, filtroBusca) }} disabled={pagina === 1} style={{ height: 32, padding: '0 14px', borderRadius: 8, border: '1px solid #e0e0e0', backgroundColor: 'white', fontSize: 13, cursor: pagina === 1 ? 'not-allowed' : 'pointer', color: pagina === 1 ? '#ccc' : '#555' }}>← Anterior</button>
              {Array.from({ length: totalPaginas }, (_, i) => i + 1).filter(p => p === 1 || p === totalPaginas || Math.abs(p - pagina) <= 1).reduce<(number | '...')[]>((acc, p, idx, arr) => { if (idx > 0 && typeof arr[idx - 1] === 'number' && (p as number) - (arr[idx - 1] as number) > 1) acc.push('...'); acc.push(p); return acc }, []).map((p, idx) => p === '...' ? <span key={`e-${idx}`} style={{ fontSize: 13, color: '#aaa', padding: '0 4px' }}>…</span> : <button key={p} onClick={() => { setPagina(p as number); buscar(filtroBase, filtroFuncao, filtroSituacao, p as number, filtroBusca) }} style={{ height: 32, width: 32, borderRadius: 8, fontSize: 13, cursor: 'pointer', border: pagina === p ? `2px solid ${COR}` : '1px solid #e0e0e0', backgroundColor: pagina === p ? '#fdf2f5' : 'white', color: pagina === p ? COR : '#555', fontWeight: pagina === p ? 600 : 400 }}>{p}</button>)}
              <button onClick={() => { const p = pagina + 1; setPagina(p); buscar(filtroBase, filtroFuncao, filtroSituacao, p, filtroBusca) }} disabled={pagina >= totalPaginas} style={{ height: 32, padding: '0 14px', borderRadius: 8, border: '1px solid #e0e0e0', backgroundColor: 'white', fontSize: 13, cursor: pagina >= totalPaginas ? 'not-allowed' : 'pointer', color: pagina >= totalPaginas ? '#ccc' : '#555' }}>Próxima →</button>
              <span style={{ fontSize: 12, color: '#888', marginLeft: 8 }}>Mostrando {((pagina - 1) * POR_PAGINA) + 1}–{Math.min(pagina * POR_PAGINA, total)} de {total}</span>
            </div>
          )}
        </>
      )}

      {/* ─── MODAL IMPORTAR ─── */}
      {importModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ backgroundColor: 'white', borderRadius: 16, padding: 28, width: '100%', maxWidth: importStep === 2 ? 860 : 480, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div>
                <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>Importar Colaboradores</h2>
                <p style={{ fontSize: 12, color: '#888', margin: '3px 0 0' }}>{importStep === 1 ? 'Selecione o arquivo do TOTVS' : `${importDiffs.length} alterações encontradas`}</p>
              </div>
              <button onClick={() => setImportModal(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#aaa' }}>✕</button>
            </div>

            {importStep === 1 && (
              <div>
                <div onClick={() => fileInputRef.current?.click()} style={{ border: '2px dashed #e0e0e0', borderRadius: 12, padding: '40px 20px', textAlign: 'center', cursor: 'pointer', backgroundColor: '#fafafa' }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = COR}
                  onMouseLeave={e => e.currentTarget.style.borderColor = '#e0e0e0'}>
                  <p style={{ fontSize: 32, margin: '0 0 8px' }}>📂</p>
                  <p style={{ fontSize: 14, fontWeight: 500, color: '#333', margin: '0 0 4px' }}>Clique para selecionar o arquivo</p>
                  <p style={{ fontSize: 12, color: '#888', margin: 0 }}>Suporta .xlsx, .xls e .csv do TOTVS</p>
                </div>
                <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) processarArquivo(f) }} />
                {importProcessando && <div style={{ marginTop: 16, padding: 12, backgroundColor: '#f0f9ff', borderRadius: 8, border: '1px solid #bae6fd' }}><p style={{ fontSize: 13, color: '#0369a1', margin: 0 }}>⏳ Processando arquivo...</p></div>}
                {importErro && <div style={{ marginTop: 16, padding: 12, backgroundColor: '#fef2f2', borderRadius: 8, border: '1px solid #fca5a5' }}><p style={{ fontSize: 13, color: '#dc2626', margin: 0 }}>❌ {importErro}</p></div>}
                <div style={{ marginTop: 16, padding: 12, backgroundColor: '#fffbeb', borderRadius: 8, border: '1px solid #fde68a', fontSize: 12, color: '#78350f' }}>
                  <p style={{ fontWeight: 600, margin: '0 0 6px' }}>📋 Colunas reconhecidas do TOTVS:</p>
                  <p style={{ margin: '0 0 4px', lineHeight: 1.8 }}>CHAPA · NOME · FUNÇÃO · SEXO · ESTADO_CIVIL · SITUAÇÃO · SEÇÃO · DTNASC · CPF · CARTIDENTIDADE · UFCARTIDENT · ADMISSÃO · DEMISSÃO · CARTMOTORISTA · TIPOCARTHABILIT · DTVENCHABILIT · RATEIO_FUNCIONARIO</p>
                  <p style={{ margin: 0, color: '#92400e' }}>⚡ <strong>RATEIO_FUNCIONARIO</strong> atualiza automaticamente Processo, Gerência e Supervisor via tabela de Centro de Custo.</p>
                </div>
              </div>
            )}

            {importStep === 2 && (
              <div>
                {importLog.length > 0 && (
                  <div style={{ marginBottom: 12, padding: '8px 12px', backgroundColor: '#f0fdf4', borderRadius: 8, border: '1px solid #bbf7d0', fontSize: 12, color: '#166534' }}>
                    {importLog.map((l, i) => <p key={i} style={{ margin: '1px 0' }}>{l.startsWith('⚠') ? l : `✓ ${l}`}</p>)}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
                  <button onClick={() => setImportDiffs(d => d.map(x => ({ ...x, selecionado: true })))} style={{ fontSize: 12, padding: '5px 10px', border: '1px solid #e0e0e0', borderRadius: 6, background: 'white', cursor: 'pointer', color: '#555' }}>☑ Selecionar todos</button>
                  <button onClick={() => setImportDiffs(d => d.map(x => ({ ...x, selecionado: false })))} style={{ fontSize: 12, padding: '5px 10px', border: '1px solid #e0e0e0', borderRadius: 6, background: 'white', cursor: 'pointer', color: '#555' }}>☐ Desmarcar todos</button>
                  <span style={{ fontSize: 12, color: '#888', marginLeft: 'auto' }}>{importDiffs.filter(d => d.selecionado).length} de {importDiffs.length} selecionados</span>
                </div>
                <div style={{ border: '1px solid #f0f0f0', borderRadius: 10, overflow: 'hidden', maxHeight: 500, overflowY: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ backgroundColor: '#fafafa', position: 'sticky', top: 0 }}>
                        <th style={{ padding: '8px 10px', textAlign: 'center', width: 36, borderBottom: '1px solid #f0f0f0' }}></th>
                        <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: '#555', borderBottom: '1px solid #f0f0f0', width: 70 }}>Status</th>
                        <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: '#555', borderBottom: '1px solid #f0f0f0', width: 80 }}>Matrícula</th>
                        <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: '#555', borderBottom: '1px solid #f0f0f0', width: 160 }}>Nome</th>
                        <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: '#555', borderBottom: '1px solid #f0f0f0' }}>Alterações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importDiffs.length === 0
                        ? <tr><td colSpan={5} style={{ padding: '32px', textAlign: 'center', color: '#aaa' }}>Nenhuma alteração detectada — dados já estão atualizados!</td></tr>
                        : importDiffs.map((d, i) => (
                          <tr key={d.matricula} style={{ borderBottom: '1px solid #f5f5f5', backgroundColor: d.selecionado ? (d.tipo === 'novo' ? '#f0fdf4' : '#fffbeb') : '#fafafa', opacity: d.selecionado ? 1 : 0.5, verticalAlign: 'top' }}>
                            <td style={{ padding: '10px 10px', textAlign: 'center' }}>
                              <input type="checkbox" checked={d.selecionado} onChange={v => setImportDiffs(prev => prev.map((x, j) => j === i ? { ...x, selecionado: v.target.checked } : x))} style={{ width: 14, height: 14, cursor: 'pointer', accentColor: COR }} />
                            </td>
                            <td style={{ padding: '10px 10px' }}>
                              <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 99, backgroundColor: d.tipo === 'novo' ? '#dcfce7' : '#fef9c3', color: d.tipo === 'novo' ? '#15803d' : '#854d0e' }}>
                                {d.tipo === 'novo' ? 'NOVO' : 'UPDATE'}
                              </span>
                            </td>
                            <td style={{ padding: '10px 10px', color: '#666', fontFamily: 'monospace', fontSize: 11 }}>{d.matricula}</td>
                            <td style={{ padding: '10px 10px', fontWeight: 500, color: '#333', fontSize: 12 }}>{d.nome}</td>
                            <td style={{ padding: '10px 10px' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                {d.campos.map(c => (
                                  <span key={c.campo} style={{ fontSize: 11, color: '#444', lineHeight: 1.5 }}>
                                    {d.tipo === 'novo'
                                      ? <>→ <strong>{c.label}</strong>: <span style={{ color: '#16a34a' }}>{c.novo || '(vazio)'}</span></>
                                      : <>→ mudou <strong>{c.label}</strong> de <span style={{ color: '#dc2626', fontStyle: 'italic' }}>{c.antigo || '(vazio)'}</span> para <span style={{ color: '#16a34a', fontStyle: 'italic' }}>{c.novo || '(vazio)'}</span></>
                                    }
                                  </span>
                                ))}
                                {d.cnh?.numero && (
                                  <span style={{ fontSize: 11, color: '#6d28d9' }}>
                                    → CNH: <strong>{d.cnh.numero}</strong>{d.cnh.categoria ? ` (${d.cnh.categoria})` : ''}{d.cnh.vencimento ? ` — vence ${fmtData(d.cnh.vencimento)}` : ''}
                                  </span>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'flex-end' }}>
                  <button onClick={() => { setImportStep(1); setImportDiffs([]) }} style={{ height: 38, padding: '0 16px', border: '1px solid #e0e0e0', borderRadius: 8, fontSize: 13, cursor: 'pointer', background: 'white', color: '#555' }}>← Voltar</button>
                  <button onClick={confirmarImportacao} disabled={importSalvando || importDiffs.filter(d => d.selecionado).length === 0}
                    style={{ height: 38, padding: '0 24px', backgroundColor: importDiffs.filter(d => d.selecionado).length > 0 ? COR : '#e0e0e0', color: importDiffs.filter(d => d.selecionado).length > 0 ? 'white' : '#aaa', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: importDiffs.filter(d => d.selecionado).length > 0 ? 'pointer' : 'not-allowed', opacity: importSalvando ? 0.7 : 1 }}>
                    {importSalvando ? '⏳ Salvando...' : `✅ Confirmar ${importDiffs.filter(d => d.selecionado).length} importações`}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── MODAL EDITAR / NOVO ─── */}
      {modalAberto && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ backgroundColor: 'white', borderRadius: 16, padding: 32, width: '100%', maxWidth: 640, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
              <div>
                <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0, color: '#1a1a1a' }}>{editando ? 'Editar Colaborador' : 'Novo Colaborador'}</h2>
                {editando && <p style={{ fontSize: 13, color: '#888', margin: '3px 0 0' }}>Matrícula: {editando}</p>}
              </div>
              <button onClick={() => setModalAberto(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#aaa' }}>✕</button>
            </div>

            {/* IDENTIFICAÇÃO */}
            <p style={{ fontSize: 11, fontWeight: 700, color: '#9f183c', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 12px', borderBottom: '1px solid #f0f0f0', paddingBottom: 6 }}>Identificação</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
              <div style={{ gridColumn: '1 / -1' }}><label style={labelStyle}>Nome completo *</label><input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} style={inputStyle} placeholder="Nome do colaborador" /></div>
              <div><label style={labelStyle}>Matrícula *</label><input value={form.matricula} onChange={e => setForm({ ...form, matricula: e.target.value })} style={{ ...inputStyle, backgroundColor: editando ? '#f5f5f5' : '#fafafa', color: editando ? '#aaa' : '#333' }} disabled={!!editando} /></div>
              <div><label style={labelStyle}>Situação</label><select value={form.situacao} onChange={e => setForm({ ...form, situacao: e.target.value })} style={inputStyle}>{SITUACOES.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
              <div><label style={labelStyle}>Sexo</label><select value={form.sexo} onChange={e => setForm({ ...form, sexo: e.target.value })} style={inputStyle}><option value="">Selecione...</option><option value="M">Masculino</option><option value="F">Feminino</option></select></div>
              <div><label style={labelStyle}>Estado Civil</label><select value={form.estado_civil} onChange={e => setForm({ ...form, estado_civil: e.target.value })} style={inputStyle}><option value="">Selecione...</option>{ESTADOS_CIVIS.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
              <div><label style={labelStyle}>Data de Nascimento</label><input type="date" value={form.data_nascimento} onChange={e => setForm({ ...form, data_nascimento: e.target.value })} style={inputStyle} /></div>
              <div><label style={labelStyle}>E-mail corporativo</label><input type="email" value={form.email_corporativo} onChange={e => setForm({ ...form, email_corporativo: e.target.value })} style={inputStyle} placeholder="email@cgbengenharia.com.br" /></div>
              <div><label style={labelStyle}>Contato</label><input value={form.contato} onChange={e => setForm({ ...form, contato: e.target.value })} style={inputStyle} placeholder="(69) 99999-9999" /></div>
            </div>

            {/* DOCUMENTOS */}
            <p style={{ fontSize: 11, fontWeight: 700, color: '#9f183c', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 12px', borderBottom: '1px solid #f0f0f0', paddingBottom: 6 }}>Documentos</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 20 }}>
              <div><label style={labelStyle}>CPF</label><input value={form.cpf} onChange={e => setForm({ ...form, cpf: e.target.value })} style={inputStyle} placeholder="000.000.000-00" /></div>
              <div><label style={labelStyle}>RG</label><input value={form.rg} onChange={e => setForm({ ...form, rg: e.target.value })} style={inputStyle} /></div>
              <div><label style={labelStyle}>Órgão Exp.</label><input value={form.rg_orgao} onChange={e => setForm({ ...form, rg_orgao: e.target.value })} style={inputStyle} placeholder="SSP" /></div>
              <div style={{ gridColumn: '3 / 4' }}><label style={labelStyle}>UF RG</label><input value={form.rg_uf} onChange={e => setForm({ ...form, rg_uf: e.target.value.toUpperCase() })} maxLength={2} style={inputStyle} placeholder="MA" /></div>
            </div>

            {/* VÍNCULO */}
            <p style={{ fontSize: 11, fontWeight: 700, color: '#9f183c', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 12px', borderBottom: '1px solid #f0f0f0', paddingBottom: 6 }}>Vínculo</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
              <div><label style={labelStyle}>Função</label><select value={form.funcao_id} onChange={e => { setForm({ ...form, funcao_id: e.target.value }); buscarGsesDaFuncao(e.target.value) }} style={inputStyle}><option value="">Selecione...</option>{funcoes.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}</select></div>
              <div><label style={labelStyle}>Base</label><select value={form.base_id} onChange={e => setForm({ ...form, base_id: e.target.value })} style={inputStyle}><option value="">Selecione...</option>{bases.map(b => <option key={b.id} value={b.id}>{b.nome}</option>)}</select></div>
              <div><label style={labelStyle}>Processo</label><select value={form.processo} onChange={e => setForm({ ...form, processo: e.target.value })} style={inputStyle}><option value="">Selecione...</option>{PROCESSOS.map(p => <option key={p} value={p}>{p}</option>)}</select></div>
              <div style={{ position: 'relative' }}>
                <label style={labelStyle}>GSE</label>
                <input 
                  type="text"
                  value={form.gse} 
                  onChange={e => setForm({ ...form, gse: e.target.value.replace(/\D/g, '') })} 
                  style={inputStyle} 
                  placeholder={gsesDaFuncao.length > 0 ? "Ex: " + gsesDaFuncao[0].id : "Digite o GSE"} 
                />
                {gsesDaFuncao.length > 0 && (
                  <span style={{ fontSize: 10, color: '#666', display: 'block', marginTop: 4 }}>
                    Sugestão p/ função: <strong style={{ color: COR }}>{gsesDaFuncao.map(g => g.id).join(', ')}</strong>
                  </span>
                )}
              </div>
              <div style={{ gridColumn: '1 / -1' }}><label style={labelStyle}>Gerência</label><select value={form.gerencia} onChange={e => setForm({ ...form, gerencia: e.target.value })} style={inputStyle}><option value="">Selecione...</option>{gerencias.map(g => <option key={g.sigla} value={g.sigla}>{g.sigla} — {g.nome}</option>)}</select></div>
              <div style={{ gridColumn: '1 / -1' }}><label style={labelStyle}>Supervisor</label><select value={form.supervisor} onChange={e => setForm({ ...form, supervisor: e.target.value })} style={inputStyle}><option value="">Selecione...</option>{supervisores.map(s => <option key={s.id} value={s.nome}>{s.nome}</option>)}</select></div>
              <div><label style={labelStyle}>Data de Admissão</label><input type="date" value={form.data_admissao} onChange={e => setForm({ ...form, data_admissao: e.target.value })} style={inputStyle} /></div>
              <div><label style={labelStyle}>Data de Demissão</label><input type="date" value={form.data_demissao} onChange={e => setForm({ ...form, data_demissao: e.target.value })} style={inputStyle} /></div>
            </div>

            {erro && <div style={{ marginBottom: 16, fontSize: 13, color: '#b91c1c', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px' }}>{erro}</div>}
            <div style={{ display: 'flex', gap: 12, justifyContent: 'space-between', alignItems: 'center' }}>
              {editando && usuario?.nivel === 'admin' && <button onClick={() => { setConfirmacaoMatricula(''); setErroExcluir(null); setModalExcluirAberto(true) }} style={{ height: 38, padding: '0 16px', border: '1px solid #fca5a5', borderRadius: 8, fontSize: 13, cursor: 'pointer', backgroundColor: '#fef2f2', color: '#dc2626' }}>🗑 Excluir</button>}
              <div style={{ display: 'flex', gap: 12, marginLeft: 'auto' }}>
                <button onClick={() => setModalAberto(false)} style={{ height: 38, padding: '0 20px', border: '1px solid #e0e0e0', borderRadius: 8, fontSize: 13, cursor: 'pointer', background: 'white', color: '#555' }}>Cancelar</button>
                <button onClick={salvar} disabled={salvando} style={{ height: 38, padding: '0 24px', backgroundColor: COR, color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: salvando ? 'not-allowed' : 'pointer', opacity: salvando ? 0.7 : 1 }}>{salvando ? 'Salvando...' : 'Salvar'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL EXCLUIR ─── */}
      {modalExcluirAberto && editando && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
          <div style={{ backgroundColor: 'white', borderRadius: 16, padding: 32, width: '100%', maxWidth: 440, boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <p style={{ fontSize: 36, margin: '0 0 12px' }}>⚠️</p>
              <h2 style={{ fontSize: 17, fontWeight: 600, color: '#1a1a1a', margin: '0 0 8px' }}>Excluir Colaborador</h2>
              <p style={{ fontSize: 13, color: '#666', margin: 0 }}>Esta ação é <strong>irreversível</strong> e irá excluir todos os dados vinculados.</p>
            </div>
            <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '12px 16px', marginBottom: 20 }}>
              <p style={{ fontSize: 13, color: '#b91c1c', margin: 0, fontWeight: 500 }}>Para confirmar, digite a matrícula: <strong>{editando}</strong></p>
            </div>
            <input autoFocus value={confirmacaoMatricula} onChange={e => setConfirmacaoMatricula(e.target.value)} placeholder={`Digite ${editando} para confirmar`} style={{ width: '100%', height: 40, border: '2px solid #fca5a5', borderRadius: 8, padding: '0 12px', fontSize: 14, outline: 'none', boxSizing: 'border-box', marginBottom: 12, textAlign: 'center', letterSpacing: 2 }} />
            {erroExcluir && <p style={{ fontSize: 12, color: '#dc2626', marginBottom: 12, textAlign: 'center' }}>{erroExcluir}</p>}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setModalExcluirAberto(false)} style={{ flex: 1, height: 40, border: '1px solid #e0e0e0', borderRadius: 8, fontSize: 13, cursor: 'pointer', background: 'white', color: '#555' }}>Cancelar</button>
              <button onClick={excluir} disabled={excluindo || confirmacaoMatricula !== editando} style={{ flex: 1, height: 40, backgroundColor: confirmacaoMatricula === editando ? '#dc2626' : '#f5f5f5', color: confirmacaoMatricula === editando ? 'white' : '#aaa', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: confirmacaoMatricula === editando ? 'pointer' : 'not-allowed', transition: 'all 0.15s' }}>
                {excluindo ? 'Excluindo...' : 'Confirmar exclusão'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}