'use client'

import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { pdf, Document, Page, View, Text, Image, StyleSheet, Svg, Rect, Line } from '@react-pdf/renderer'

const COR = '#9f183c'

// ─── TIPOS ───────────────────────────────────────────────────────────────────
interface Colaborador {
  matricula: string; nome: string; funcao: string | null; funcao_id: number | null
  gse: number | null; gse_setor: string | null; situacao: string
  data_admissao: string | null; data_nascimento: string | null
  estado_civil: string | null; cpf: string | null; rg: string | null
  rg_orgao: string | null; rg_uf: string | null; processo: string | null
  base: string | null; numero_cnh: string | null; sexo: string | null
}
interface ExameCompl { nome: string; ultima_data: string | null }
interface RiscoOcupacional { acidente: string | null; ergonomico: string | null; fisico: string | null; quimico: string | null; biologico: string | null }
interface Empresa { razao_social: string; cnpj: string; cnae: string; grau_risco: string; endereco: string; numero: string; bairro: string; cidade: string; uf: string; telefone: string }
interface Medico { nome: string; crm: string; rqe: string; especialidade: string; telefone: string }
interface FormASO {
  tipo_admissional: boolean; tipo_periodico: boolean; tipo_demissional: boolean; tipo_retorno: boolean; tipo_mudanca_risco: boolean
  nome: string; matricula: string; data_nascimento: string; idade: string; sexo: string; estado_civil: string
  data_admissao: string; funcao: string; conducao: string; rg: string; rg_orgao: string; rg_uf: string; cpf: string; pcd: string
  gse: string; setor: string
  risco_fisico: boolean; risco_fisico_desc: string
  risco_quimico: boolean; risco_quimico_desc: string
  risco_biologico: boolean; risco_biologico_desc: string
  risco_ergonomico: boolean; risco_ergonomico_desc: string
  risco_acidente: boolean; risco_acidente_desc: string
  sem_risco: boolean
  exames: string[]
  apto: boolean; inapto: boolean
  altura_apto: boolean; altura_inapto: boolean; altura_na: boolean
  conducao_apto: boolean; conducao_inapto: boolean; conducao_na: boolean
  confinado_apto: boolean; confinado_inapto: boolean; confinado_na: boolean
  quimico_apto: boolean; quimico_inapto: boolean; quimico_na: boolean
  local: string; data_ass: string
}

const TIPOS_ASO = [
  { value: 'admissional', label: 'Admissional', campo: 'no_adm' },
  { value: 'periodico', label: 'Periódico', campo: 'no_per' },
  { value: 'retorno', label: 'Retorno ao Trabalho', campo: 'no_ret' },
  { value: 'mudanca_risco', label: 'Mudança de Risco Ocupacional', campo: 'no_mro' },
  { value: 'demissional', label: 'Demissional', campo: 'no_dem' },
]

function formatarData(d: string | null | undefined): string {
  if (!d) return ''
  return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR')
}
function calcularIdade(nascimento: string | null): number | null {
  if (!nascimento) return null
  const hoje = new Date(); const nasc = new Date(nascimento + 'T12:00:00')
  let idade = hoje.getFullYear() - nasc.getFullYear()
  const m = hoje.getMonth() - nasc.getMonth()
  if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) idade--
  return idade
}
function naoSeAplica(v: string | null): boolean {
  if (!v) return true
  return v.trim().toLowerCase() === 'não se aplica'
}

// ─── ESTILOS PDF ──────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 8, padding: 20, backgroundColor: '#fff' },
  borda: { border: '1pt solid #333', padding: 6 },
  // cabeçalho
  row: { flexDirection: 'row', alignItems: 'center' },
  rowTop: { flexDirection: 'row', alignItems: 'flex-start' },
  // textos
  label: { color: '#555', fontSize: 7 },
  bold: { fontFamily: 'Helvetica-Bold' },
  small: { fontSize: 7, color: '#555' },
  italic: { fontFamily: 'Helvetica-Oblique', fontSize: 7 },
  // linhas
  linha: { borderBottom: '0.5pt solid #999', marginBottom: 1, paddingBottom: 1 },
  linhaSec: { borderBottom: '0.5pt solid #ccc', marginBottom: 2, paddingBottom: 2 },
  // tabela
  thRow: { flexDirection: 'row', borderBottom: '0.5pt solid #333', backgroundColor: '#f0f0f0' },
  th: { fontSize: 7, fontFamily: 'Helvetica-Bold', padding: 3 },
  tdRow: { flexDirection: 'row', borderBottom: '0.3pt solid #ddd' },
  td: { fontSize: 7.5, padding: '3 4' },
  // checkbox
  cb: { width: 9, height: 9, border: '0.8pt solid #333', marginRight: 3, alignItems: 'center', justifyContent: 'center' },
  cbX: { fontSize: 8, fontFamily: 'Helvetica-Bold', lineHeight: 1 },
  // seção
  secTit: { fontFamily: 'Helvetica-Bold', fontSize: 8, marginBottom: 3 },
  // campo com sublinhado
  campo: { borderBottom: '0.5pt solid #666', minWidth: 40, paddingBottom: 1 },
  campoRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
})

// ─── COMPONENTES PDF ──────────────────────────────────────────────────────────
function CB({ checked }: { checked: boolean }) {
  if (checked) {
    return (
      <Svg width={10} height={10} style={{ marginRight: 3 }}>
        <Rect x="0.5" y="0.5" width="9" height="9" stroke="#333333" strokeWidth="0.8" fill="white" />
        <Line x1="2" y1="2" x2="8" y2="8" stroke="#000000" strokeWidth="1.5" />
        <Line x1="8" y1="2" x2="2" y2="8" stroke="#000000" strokeWidth="1.5" />
      </Svg>
    )
  }
  return (
    <Svg width={10} height={10} style={{ marginRight: 3 }}>
      <Rect x="0.5" y="0.5" width="9" height="9" stroke="#333333" strokeWidth="0.8" fill="white" />
    </Svg>
  )
}
function CampoVal({ label, valor, w, bold }: { label?: string; valor: string; w?: number; bold?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginRight: 6 }}>
      {label && <Text style={S.label}>{label} </Text>}
      <View style={[S.campo, w ? { width: w } : { flex: 1, minWidth: 40 }]}>
        <Text style={bold ? S.bold : {}}>{valor || ' '}</Text>
      </View>
    </View>
  )
}
function LinhaAptidao({ label, apto, inapto, na }: { label: string; apto: boolean; inapto: boolean; na: boolean }) {
  return (
    <View style={[S.tdRow, { alignItems: 'center' }]}>
      <View style={[S.td, { flex: 3 }]}><Text>{label}</Text></View>
      <View style={[S.td, { flex: 2, flexDirection: 'row', alignItems: 'center' }]}><CB checked={apto} /><Text> Apto</Text></View>
      <View style={[S.td, { flex: 2, flexDirection: 'row', alignItems: 'center' }]}><CB checked={inapto} /><Text> Inapto</Text></View>
      <View style={[S.td, { flex: 3, flexDirection: 'row', alignItems: 'center' }]}><CB checked={na} /><Text> Não se Aplica</Text></View>
    </View>
  )
}
function LinhaRisco({ label, checked, desc }: { label: string; checked: boolean; desc: string }) {
  return (
    <View style={[S.tdRow, { alignItems: 'flex-start' }]}>
      <View style={[S.td, { flex: 1, flexDirection: 'row', alignItems: 'center', borderRight: '0.5pt solid #ccc' }]}>
        <CB checked={checked} /><Text> {label}</Text>
      </View>
      <View style={[S.td, { flex: 1 }]}>
        <View style={{ flexDirection: 'row' }}>
          <Text style={S.label}>- </Text>
          <View style={[S.campo, { flex: 1 }]}><Text>{desc || ' '}</Text></View>
        </View>
      </View>
    </View>
  )
}

// ─── DOCUMENTO PDF ────────────────────────────────────────────────────────────
function ASODocument({ form, empresa, medico }: { form: FormASO; empresa: Empresa | null; medico: Medico | null }) {
  const cnae = empresa?.cnae?.replace(/[^0-9\-\/]/g, '') || ''

  return (
    <Document>
      {/* O loop que repete a página 3 vezes */}
      {[1, 2, 3].map((via) => (
        <Page key={via} size="A4" style={S.page}>
          <View style={S.borda}>

          {/* CABEÇALHO */}
          <View style={[S.row, { marginBottom: 4, borderBottom: '1pt solid #333', paddingBottom: 4 }]}>
            <View style={{ width: 80 }}>
              <Image src="/logo-cgb.png" style={{ height: 24, objectFit: 'contain' }} />
              <Text style={S.small}>{empresa?.cnpj}</Text>
              <Text style={S.small}>{empresa?.telefone}</Text>
            </View>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={[S.bold, { fontSize: 10 }]}>ATESTADO DE SAUDE OCUPACIONAL - ASO</Text>
            </View>
            <View style={{ width: 100, alignItems: 'flex-end' }}>
              <Text style={S.small}><Text style={S.bold}>GSE: </Text>{form.gse}</Text>
              <Text style={S.small}>Setor: {form.setor}</Text>
            </View>
          </View>

          {/* EMPRESA */}
          <View style={[S.row, { marginBottom: 3 }]}>
            <View style={{ flex: 1 }}>
              <Text><Text style={S.label}>Razão Social: </Text><Text style={S.bold}>{empresa?.razao_social}</Text></Text>
            </View>
            <View style={{ alignItems: 'center', marginHorizontal: 8 }}>
              <Text style={S.label}>CNAE:</Text>
              <View style={{ border: '0.8pt solid #333', padding: '1 4' }}>
                <Text style={{ letterSpacing: 3, fontSize: 8 }}>{cnae}</Text>
              </View>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={S.label}>Grau de Risco:</Text>
              <View style={{ border: '0.8pt solid #333', padding: '1 8' }}>
                <Text style={{ fontSize: 8 }}>{empresa?.grau_risco}</Text>
              </View>
            </View>
          </View>
          <View style={[S.linhaSec]}>
            <Text><Text style={S.label}>Endereço: </Text>{empresa ? `${empresa.endereco}, ${empresa.numero} — ${empresa.bairro} — ${empresa.cidade}/${empresa.uf}` : ''}</Text>
          </View>

          {/* TÍTULO */}
          <View style={{ alignItems: 'center', marginBottom: 4, borderBottom: '0.5pt solid #ccc', paddingBottom: 3 }}>
            <Text style={[S.bold, { fontSize: 9 }]}>Programa de Controle Médico de Saúde Ocupacional - PCMSO</Text>
            <Text style={[S.bold, { fontSize: 9 }]}>Atestado de Saúde Ocupacional - ASO</Text>
          </View>

          {/* TIPOS */}
          <View style={[S.row, { gap: 16, marginBottom: 4, flexWrap: 'wrap' }]}>
            {[
              { k: 'tipo_admissional', l: 'Admissional' },
              { k: 'tipo_periodico', l: 'Periódico' },
              { k: 'tipo_demissional', l: 'Demissional' },
              { k: 'tipo_retorno', l: 'Retorno ao Trabalho' },
              { k: 'tipo_mudanca_risco', l: 'Mudança de Risco Ocupacional' },
            ].map(t => (
              <View key={t.k} style={[S.row, { marginRight: 8 }]}>
                <CB checked={(form as any)[t.k]} />
                <Text> {t.l}</Text>
              </View>
            ))}
          </View>
          <View style={[S.linhaSec]}>
            <Text style={S.italic}>Atesto para os devidos fins de cumprimento do que determina a Norma Regulamentadora, NR 7, que o(a) Sr(a) abaixo identificado(a)</Text>
          </View>

          {/* LINHA 1 — Nome, Matrícula, Data Nasc, Idade */}
          <View style={[S.row, { marginBottom: 3 }]}>
            <View style={{ flex: 1 }}>
              <Text style={S.label}>Nome:</Text>
              <View style={S.campo}><Text style={S.bold}>{form.nome}</Text></View>
            </View>
            <View style={{ width: 75, marginLeft: 6 }}>
              <Text style={S.label}>Matr.:</Text>
              <View style={S.campo}><Text>{form.matricula}</Text></View>
            </View>
            <View style={{ width: 100, marginLeft: 6 }}>
              <Text style={S.label}>Data de Nasc.</Text>
              <View style={S.campo}><Text>{form.data_nascimento}</Text></View>
            </View>
            <View style={{ width: 40, marginLeft: 6 }}>
              <Text style={S.label}>Idade:</Text>
              <View style={S.campo}><Text>{form.idade}</Text></View>
            </View>
          </View>

          {/* LINHA 2 — Sexo, Estado Civil, Admissão, Função, Condução */}
          <View style={[S.row, { marginBottom: 3 }]}>
            <View style={{ width: 40 }}>
              <Text style={S.label}>Sexo:</Text>
              <View style={S.campo}><Text>{form.sexo}</Text></View>
            </View>
            <View style={{ width: 80, marginLeft: 6 }}>
              <Text style={S.label}>Estado Civil:</Text>
              <View style={S.campo}><Text>{form.estado_civil}</Text></View>
            </View>
            <View style={{ width: 80, marginLeft: 6 }}>
              <Text style={S.label}>Data de Admissão:</Text>
              <View style={S.campo}><Text>{form.data_admissao}</Text></View>
            </View>
            <View style={{ flex: 1, marginLeft: 6 }}>
              <Text style={S.label}>Função:</Text>
              <View style={S.campo}><Text style={S.bold}>{form.funcao}</Text></View>
            </View>
            <View style={{ width: 55, marginLeft: 6 }}>
              <Text style={S.label}>Condução:</Text>
              <View style={S.campo}><Text>{form.conducao}</Text></View>
            </View>
          </View>

          {/* LINHA 3 — RG, Órgão, UF, CPF, PCD */}
          <View style={[S.row, { marginBottom: 6, borderBottom: '0.5pt solid #ccc', paddingBottom: 4 }]}>
            <View style={{ width: 90 }}>
              <Text style={S.label}>RG:</Text>
              <View style={S.campo}><Text>{form.rg}</Text></View>
            </View>
            <View style={{ width: 70, marginLeft: 6 }}>
              <Text style={S.label}>Órgão Expedidor:</Text>
              <View style={S.campo}><Text>{form.rg_orgao}</Text></View>
            </View>
            <View style={{ width: 30, marginLeft: 6 }}>
              <Text style={S.label}>UF:</Text>
              <View style={S.campo}><Text>{form.rg_uf}</Text></View>
            </View>
            <View style={{ flex: 1, marginLeft: 6 }}>
              <Text style={S.label}>CPF:</Text>
              <View style={S.campo}><Text>{form.cpf}</Text></View>
            </View>
            <View style={{ width: 45, marginLeft: 6 }}>
              <Text style={S.label}>P.C.D:</Text>
              <View style={S.campo}><Text>{form.pcd}</Text></View>
            </View>
          </View>

          {/* RISCOS */}
          <View style={{ border: '0.8pt solid #ccc', marginBottom: 6 }}>
            <View style={[S.thRow]}>
              <View style={[{ flex: 1, borderRight: '0.5pt solid #ccc' }]}><Text style={S.th}>Tipos de Riscos</Text></View>
              <View style={[{ flex: 1 }]}><Text style={S.th}>Riscos Ocupacionais</Text></View>
            </View>
            <LinhaRisco label="Riscos Físicos" checked={form.risco_fisico} desc={form.risco_fisico_desc} />
            <LinhaRisco label="Riscos Químicos" checked={form.risco_quimico} desc={form.risco_quimico_desc} />
            <LinhaRisco label="Riscos Biológicos" checked={form.risco_biologico} desc={form.risco_biologico_desc} />
            <LinhaRisco label="Riscos Ergonômicos" checked={form.risco_ergonomico} desc={form.risco_ergonomico_desc} />
            <LinhaRisco label="Riscos Acidentes / Mecânicos" checked={form.risco_acidente} desc={form.risco_acidente_desc} />
            <View style={[S.td, { flexDirection: 'row', alignItems: 'center' }]}>
              <CB checked={form.sem_risco} /><Text> Sem riscos Ocupacionais Específicos</Text>
            </View>
          </View>

          {/* EXAMES */}
          <View style={{ marginBottom: 6 }}>
            <Text style={S.secTit}>Avaliação Clínica e Exames Complementares:</Text>
            {[0, 1, 2, 3].map(row => (
              <View key={row} style={[S.row, { marginBottom: 3 }]}>
                {[row * 2, row * 2 + 1].map(i => (
                  <View key={i} style={[S.row, { flex: 1, marginRight: i % 2 === 0 ? 8 : 0, alignItems: 'flex-end' }]}>
                    <Text style={[S.label, { marginRight: 3 }]}>____/____/______</Text>
                    <View style={[S.campo, { flex: 1 }]}><Text>{form.exames[i] || ' '}</Text></View>
                    <Text style={[S.label, { marginLeft: 3 }]}>____/____/______</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>

          {/* RESULTADO */}
          <View style={{ border: '0.8pt solid #ccc', padding: 5, marginBottom: 6 }}>
            <Text style={{ marginBottom: 4 }}>Atesto que o examinado foi submetido a exame médico (Clínico, Físico e Mental) Sendo Considerado:</Text>
            <View style={S.row}>
              <View style={[S.row, { marginRight: 20 }]}><CB checked={form.apto} /><Text> Apto</Text></View>
              <View style={S.row}><CB checked={form.inapto} /><Text> Inapto</Text></View>
            </View>
          </View>

          {/* APTIDÃO CRÍTICA */}
          <View style={{ marginBottom: 8 }}>
            <Text style={S.secTit}>Aptidão para Atividade Críticas:</Text>
            <View style={{ border: '0.5pt solid #ccc' }}>
              <LinhaAptidao label="Trabalho em Altura (NR35)" apto={form.altura_apto} inapto={form.altura_inapto} na={form.altura_na} />
              <LinhaAptidao label="Condução de Veículos" apto={form.conducao_apto} inapto={form.conducao_inapto} na={form.conducao_na} />
              <LinhaAptidao label="Espaço Confinado (NR33)" apto={form.confinado_apto} inapto={form.confinado_inapto} na={form.confinado_na} />
              <LinhaAptidao label="Contato com Produtos Químicos" apto={form.quimico_apto} inapto={form.quimico_inapto} na={form.quimico_na} />
            </View>
          </View>

   {/* LOCAL E DATA */}
<View style={[S.row, { marginBottom: 8, alignItems: 'flex-end' }]}>
  
  {/* Campo para o Local (ex: Cidade) */}
  <View style={[S.campo, { width: 140 }]}><Text>{form.local}</Text></View>

  <Text style={{ marginHorizontal: 4, paddingBottom: 1 }}> - </Text>

  {/* Linha em branco para UF ou complemento (opcional, remova se não precisar) */}
  <View style={[S.campo, { width: 40 }]}><Text>{' '}</Text></View>

  {/* Espaçamento antes da data */}
  <View style={{ width: 24 }} />

  {/* Linha em branco para o DIA */}
  <View style={[S.campo, { width: 30 }]}><Text>{' '}</Text></View>

  <Text style={{ marginHorizontal: 4, paddingBottom: 1 }}> / </Text>

  {/* Linha em branco para o MÊS */}
  <View style={[S.campo, { width: 30 }]}><Text>{' '}</Text></View>

  <Text style={{ marginHorizontal: 4, paddingBottom: 1 }}> / </Text>

  {/* Linha em branco para o ANO */}
  <View style={[S.campo, { width: 40 }]}><Text>{' '}</Text></View>

</View>

          {/* RECIBO */}
          <View style={{ borderBottom: '0.5pt solid #ccc', paddingBottom: 4, marginBottom: 8 }}>
            <Text>Recebi cópia do Atestado de Saúde Ocupacional - ASO</Text>
          </View>

{/* ASSINATURAS */}
<View style={{ border: '0.8pt solid #333', marginBottom: 6 }}>
  
  {/* Cabeçalho */}
  {/* Adicionado alignItems: 'stretch' aqui também para garantir linhas perfeitas */}
  <View style={[S.row, { borderBottom: '0.8pt solid #333', alignItems: 'stretch' }]}>
    {['Trabalhador(a)', 'Médico Examinador', 'Médico Responsável pelo PCMSO'].map((titulo, i) => (
      <View key={i} style={{ flex: 1, padding: '3 4', borderRight: i < 2 ? '0.8pt solid #333' : undefined }}>
        <Text style={[S.bold, { fontSize: 7.5 }]}>{titulo}</Text>
      </View>
    ))}
  </View>
  
  {/* Corpo */}
  <View style={[S.row, { minHeight: 50, alignItems: 'stretch' }]}>
    <View style={{ flex: 1, borderRight: '0.8pt solid #333', padding: 4 }} />
    <View style={{ flex: 1, borderRight: '0.8pt solid #333', padding: 4 }} />
    
    {/* Terceira coluna com os dados do médico */}
    <View style={{ flex: 1, padding: 4, alignItems: 'center' }}>
      {[medico?.nome || '', medico?.especialidade || '', `CRM: ${medico?.crm || ''} . RQE N° ${medico?.rqe || ''}`, `FONE: ${medico?.telefone || ''}`].map((linha, j) => (
        <Text key={j} style={{ fontSize: 7, textAlign: 'center' }}>{linha}</Text>
      ))}
    </View>
  </View>
  
</View>

{/* RODAPÉ */}
          <View style={{ borderTop: '0.5pt solid #ccc', paddingTop: 4, marginTop: 8 }}>
            <Text style={[S.italic, { fontSize: 6.5, color: '#555' }]}>
              NB. Os dados dos exames clínicos e complementares deverão ser registrados em prontuário médico individual sob a responsabilidade do médico responsável pelo PCMSO, ou do médico responsável pelo exame, quando a organização estiver dispensada de PCMSO. NR7.6.1.
            </Text>
          </View>

        </View>
      </Page>
      ))}
    </Document>
  )
}

// ─── PÁGINA PRINCIPAL ─────────────────────────────────────────────────────────
export default function GerarASOPage() {
  const [busca, setBusca] = useState('')
  const [resultados, setResultados] = useState<{ matricula: string; nome: string }[]>([])
  const [colabSel, setColabSel] = useState<Colaborador | null>(null)
  const [tipoASO, setTipoASO] = useState('periodico')
  const [dataRealizacao, setDataRealizacao] = useState(new Date().toISOString().split('T')[0])
  const [examesCompl, setExamesCompl] = useState<ExameCompl[]>([])
  const [carregandoExames, setCarregandoExames] = useState(false)
  const [gerandoPDF, setGerandoPDF] = useState(false)
  const [empresa, setEmpresa] = useState<Empresa | null>(null)
  const [medico, setMedico] = useState<Medico | null>(null)
  const buscaRef = useRef<NodeJS.Timeout | null>(null)
  const selecionandoRef = useRef(false)

  const formInicial: FormASO = {
    tipo_admissional: false, tipo_periodico: true, tipo_demissional: false, tipo_retorno: false, tipo_mudanca_risco: false,
    nome: '', matricula: '', data_nascimento: '', idade: '', sexo: '', estado_civil: '', data_admissao: '', funcao: '',
    conducao: '', rg: '', rg_orgao: '', rg_uf: '', cpf: '', pcd: 'NÃO', gse: '', setor: '',
    risco_fisico: false, risco_fisico_desc: '', risco_quimico: false, risco_quimico_desc: '',
    risco_biologico: false, risco_biologico_desc: '', risco_ergonomico: false, risco_ergonomico_desc: '',
    risco_acidente: false, risco_acidente_desc: '', sem_risco: false,
    exames: ['', '', '', '', '', '', '', ''],
    apto: false, inapto: false,
    altura_apto: false, altura_inapto: false, altura_na: false,
    conducao_apto: false, conducao_inapto: false, conducao_na: false,
    confinado_apto: false, confinado_inapto: false, confinado_na: false,
    quimico_apto: false, quimico_inapto: false, quimico_na: false,
    local: '', data_ass: '',
  }
  const [form, setForm] = useState<FormASO>(formInicial)

  useEffect(() => {
    supabase.from('configuracoes_empresa').select('*').limit(1).single().then(({ data }) => { if (data) setEmpresa(data) })
    supabase.from('medicos_aso').select('*').eq('ativo', true).single().then(({ data }) => { if (data) setMedico(data) })
  }, [])

  useEffect(() => {
    if (selecionandoRef.current) { selecionandoRef.current = false; return }
    if (busca.length < 2) { setResultados([]); return }
    if (buscaRef.current) clearTimeout(buscaRef.current)
    buscaRef.current = setTimeout(async () => {
      const { data } = await supabase.from('colaboradores').select('matricula, nome').or(`nome.ilike.%${busca}%,matricula.ilike.%${busca}%`).order('nome').limit(10)
      setResultados(data || [])
    }, 300)
  }, [busca])

  async function selecionarColab(mat: string, nome: string) {
    selecionandoRef.current = true
    setResultados([])
    setBusca(nome)
    const { data: c } = await supabase.from('colaboradores')
      .select('matricula, nome, funcao_id, gse, situacao, data_admissao, data_nascimento, estado_civil, cpf, rg, rg_orgao, rg_uf, processo, sexo, funcoes(nome), bases(nome)')
      .eq('matricula', mat).single()
    if (!c) return
    const gseSetor = c?.gse ? (await supabase.from('gses').select('setor').eq('id', c.gse).single()).data?.setor : null
    const cnh = await supabase.from('cnhs').select('numero_cnh').eq('matricula_colaborador', mat).eq('is_atual', true).maybeSingle()
    const colab: Colaborador = {
       matricula: c.matricula, nome: c.nome, funcao: (c as any).funcoes?.nome || null,
       funcao_id: c.funcao_id, gse: c.gse, gse_setor: gseSetor || null,
       situacao: c.situacao, data_admissao: c.data_admissao, data_nascimento: c.data_nascimento,
       estado_civil: c.estado_civil, cpf: c.cpf, rg: c.rg, rg_orgao: c.rg_orgao, rg_uf: c.rg_uf,
       processo: c.processo, base: (c as any).bases?.nome || null, numero_cnh: cnh.data?.numero_cnh || null,
       sexo: (c as any).sexo || null,
}
    await preencherForm(colab, tipoASO)
    await buscarExames(colab, tipoASO)
    setColabSel(colab)
  }

  async function preencherForm(colab: Colaborador, tipo: string) {
    let riscos: RiscoOcupacional = { acidente: null, ergonomico: null, fisico: null, quimico: null, biologico: null }
    if (colab.gse && colab.funcao) {
      const { data: r } = await supabase.from('riscos_ocupacionais').select('*').eq('gse_id', colab.gse).ilike('funcao', colab.funcao).maybeSingle()
      if (r) riscos = r
    }
    const idade = calcularIdade(colab.data_nascimento)
    setForm(f => ({
      ...f,
      tipo_admissional: tipo === 'admissional', tipo_periodico: tipo === 'periodico',
      tipo_demissional: tipo === 'demissional', tipo_retorno: tipo === 'retorno', tipo_mudanca_risco: tipo === 'mudanca_risco',
      nome: colab.nome, matricula: colab.matricula,
      data_nascimento: formatarData(colab.data_nascimento),
      idade: idade !== null ? String(idade) : '',
      sexo: colab.sexo || '', estado_civil: colab.estado_civil || '',
      data_admissao: formatarData(colab.data_admissao),
      funcao: colab.funcao || '', conducao: colab.numero_cnh ? 'SIM' : 'NÃO',
      rg: colab.rg || '', rg_orgao: colab.rg_orgao || '', rg_uf: colab.rg_uf || '',
      cpf: colab.cpf || '', pcd: 'NÃO',
      gse: colab.gse ? String(colab.gse) : '', setor: colab.gse_setor || '',
      risco_fisico: !naoSeAplica(riscos.fisico), risco_fisico_desc: riscos.fisico || '',
      risco_quimico: !naoSeAplica(riscos.quimico), risco_quimico_desc: riscos.quimico || '',
      risco_biologico: !naoSeAplica(riscos.biologico), risco_biologico_desc: riscos.biologico || '',
      risco_ergonomico: !naoSeAplica(riscos.ergonomico), risco_ergonomico_desc: riscos.ergonomico || '',
      risco_acidente: !naoSeAplica(riscos.acidente), risco_acidente_desc: riscos.acidente || '',
      local: '',
    }))
  }

  async function buscarExames(colab: Colaborador, tipo: string) {
    if (!colab.gse) { setExamesCompl([]); return }
    setCarregandoExames(true)
    const campoMap: Record<string, string> = { admissional: 'no_adm', periodico: 'no_per', retorno: 'no_ret', mudanca_risco: 'no_mro', demissional: 'no_dem' }
    const campo = campoMap[tipo]
    if (!campo) { setExamesCompl([]); setCarregandoExames(false); return }
    const { data: gseEx } = await supabase.from('gse_exames').select(`tipo_exame_id, ${campo}, tipos_exame_medico(id, nome)`).eq('gse_id', colab.gse).eq(campo, true)
    if (!gseEx?.length) { setExamesCompl([]); setCarregandoExames(false); return }
    const tipoIds = gseEx.map((g: any) => g.tipo_exame_id)
    const { data: ultimos } = await supabase.from('exames_aso').select('tipo_exame_id, data_realizacao').eq('matricula_colaborador', colab.matricula).in('tipo_exame_id', tipoIds).order('data_realizacao', { ascending: false })
    const ultimoMap: Record<number, string> = {}
    ;(ultimos || []).forEach((u: any) => { if (!ultimoMap[u.tipo_exame_id]) ultimoMap[u.tipo_exame_id] = u.data_realizacao })
    const lista: ExameCompl[] = gseEx.map((g: any) => ({ nome: g.tipos_exame_medico?.nome || '', ultima_data: ultimoMap[g.tipo_exame_id] || null }))
    setExamesCompl(lista)
    const linhas = lista.map(e => e.nome)
    while (linhas.length < 8) linhas.push('')
    setForm(f => ({ ...f, exames: linhas.slice(0, 8) }))
    setCarregandoExames(false)
  }

  async function handleTipoChange(novoTipo: string) {
    setTipoASO(novoTipo)
    setForm(f => ({ ...f, tipo_admissional: novoTipo === 'admissional', tipo_periodico: novoTipo === 'periodico', tipo_demissional: novoTipo === 'demissional', tipo_retorno: novoTipo === 'retorno', tipo_mudanca_risco: novoTipo === 'mudanca_risco' }))
    if (colabSel) { await preencherForm(colabSel, novoTipo); await buscarExames(colabSel, novoTipo) }
  }

  async function gerarPDF() {
    setGerandoPDF(true)
    try {
      const blob = await pdf(<ASODocument form={form} empresa={empresa} medico={medico} />).toBlob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `ASO_${form.matricula}_${form.nome.split(' ')[0]}_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setGerandoPDF(false)
    }
  }

  const inp: React.CSSProperties = { width: '100%', height: 36, border: '1px solid #e0e0e0', borderRadius: 8, padding: '0 10px', fontSize: 13, outline: 'none', backgroundColor: 'white', boxSizing: 'border-box' }
  const lbl: React.CSSProperties = { fontSize: 11, color: '#666', marginBottom: 3, display: 'block', fontWeight: 500 }

  // Campo editável visual (lado direito)
  function Campo({ label, valor, onChange, bold, flex, w }: { label?: string; valor: string; onChange: (v: string) => void; bold?: boolean; flex?: number; w?: number }) {
    return (
      <div style={{ flex: flex || undefined, width: w, marginRight: 8 }}>
        {label && <span style={{ fontSize: 9, color: '#666', display: 'block', marginBottom: 1 }}>{label}</span>}
        <input value={valor} onChange={e => onChange(e.target.value)}
          style={{ width: '100%', border: 'none', borderBottom: '1px solid #666', background: 'transparent', outline: 'none', fontSize: 9, fontWeight: bold ? 700 : 400, fontFamily: 'Arial, sans-serif', padding: '1px 2px', boxSizing: 'border-box' }} />
      </div>
    )
  }

  function CBVis({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer', marginRight: 12 }} onClick={() => onChange(!checked)}>
        <div style={{ width: 11, height: 11, border: '1px solid #333', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, backgroundColor: 'white', fontSize: 9, fontWeight: 700 }}>{checked ? 'X' : ''}</div>
        {label && <span style={{ fontSize: 9 }}>{label}</span>}
      </div>
    )
  }

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', display: 'flex', gap: 0, height: '100%', overflow: 'hidden' }}>

      {/* ─── PAINEL ESQUERDO 30% ─── */}
      <div style={{ width: '30%', minWidth: 260, flexShrink: 0, overflowY: 'auto', padding: '0 16px 24px 0', borderRight: '1px solid #f0f0f0' }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: '#1a1a1a', margin: '0 0 16px' }}>Gerar ASO</h2>

        <div style={{ marginBottom: 14, position: 'relative' }}>
          <label style={lbl}>Colaborador *</label>
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Digite o nome ou matrícula..." style={inp} />
          {resultados.length > 0 && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, border: '1px solid #e0e0e0', borderRadius: 8, backgroundColor: 'white', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', maxHeight: 200, overflowY: 'auto' }}>
              {resultados.map(r => (
                <div key={r.matricula} onClick={() => selecionarColab(r.matricula, r.nome)}
                  style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f5f5f5', fontSize: 13 }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = '#fdf2f5'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = 'white'}>
                  <p style={{ margin: 0, fontWeight: 500, color: '#333' }}>{r.nome}</p>
                  <p style={{ margin: 0, fontSize: 11, color: '#888' }}>{r.matricula}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={lbl}>Tipo de ASO *</label>
          <select value={tipoASO} onChange={e => handleTipoChange(e.target.value)} style={inp}>
            {TIPOS_ASO.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={lbl}>Data de Realização *</label>
          <input type="date" value={dataRealizacao} onChange={e => setDataRealizacao(e.target.value)} style={inp} />
        </div>

        {colabSel && (
          <div style={{ backgroundColor: '#f9f9f9', borderRadius: 10, padding: 12, marginBottom: 14, border: '1px solid #f0f0f0' }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: '#333', margin: '0 0 6px' }}>{colabSel.nome}</p>
            <p style={{ fontSize: 11, color: '#666', margin: '2px 0' }}>Matrícula: {colabSel.matricula}</p>
            <p style={{ fontSize: 11, color: '#666', margin: '2px 0' }}>Função: {colabSel.funcao || '—'}</p>
            <p style={{ fontSize: 11, color: '#666', margin: '2px 0' }}>GSE: {colabSel.gse || '—'}{colabSel.gse_setor ? ` — ${colabSel.gse_setor}` : ''}</p>
            <p style={{ fontSize: 11, color: '#666', margin: '2px 0' }}>Base: {colabSel.base || '—'}</p>
          </div>
        )}

        {examesCompl.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: '#333', margin: '0 0 8px' }}>Exames — GSE {colabSel?.gse}</p>
            {examesCompl.map((e, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 8px', backgroundColor: 'white', borderRadius: 6, border: '1px solid #f0f0f0', fontSize: 11, marginBottom: 3 }}>
                <span style={{ color: '#333' }}>{e.nome}</span>
                <span style={{ color: e.ultima_data ? '#16a34a' : '#aaa', fontWeight: 500, fontSize: 10, marginLeft: 6, whiteSpace: 'nowrap' }}>{e.ultima_data ? formatarData(e.ultima_data) : 'Sem registro'}</span>
              </div>
            ))}
            {carregandoExames && <p style={{ fontSize: 11, color: '#aaa', margin: 0 }}>Carregando...</p>}
          </div>
        )}

        <button onClick={gerarPDF} disabled={!colabSel || gerandoPDF}
          style={{ width: '100%', height: 42, backgroundColor: colabSel ? COR : '#e0e0e0', color: colabSel ? 'white' : '#aaa', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: colabSel ? 'pointer' : 'not-allowed' }}>
          {gerandoPDF ? '⏳ Gerando PDF...' : '⬇ Download PDF'}
        </button>
        {!colabSel && <p style={{ fontSize: 11, color: '#aaa', textAlign: 'center', margin: '6px 0 0' }}>Selecione um colaborador primeiro</p>}
      </div>

      {/* ─── PAINEL DIREITO 70% — PREVIEW ─── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 0 24px 20px' }}>
        <div style={{ backgroundColor: 'white', padding: '10px 14px', maxWidth: 760, margin: '0 auto', border: '1px solid #aaa', fontFamily: 'Arial, sans-serif', fontSize: 9 }}>

          {/* CABEÇALHO */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #333', paddingBottom: 4, marginBottom: 4 }}>
            <div style={{ width: 90 }}>
              <img src="/logo-cgb.png" alt="CGB" style={{ height: 28, objectFit: 'contain' }} />
              <div style={{ fontSize: 8, color: '#555' }}>{empresa?.cnpj}</div>
              <div style={{ fontSize: 8, color: '#555' }}>{empresa?.telefone}</div>
            </div>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontWeight: 700, fontSize: 11 }}>ATESTADO DE SAUDE OCUPACIONAL - ASO</div>
            </div>
            <div style={{ width: 110, fontSize: 9 }}>
              <div><strong>GSE: </strong>{form.gse}</div>
              <div>Setor: {form.setor}</div>
            </div>
          </div>

          {/* EMPRESA */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 3 }}>
            <div style={{ flex: 1 }}><span style={{ color: '#666' }}>Razão Social: </span><strong>{empresa?.razao_social}</strong></div>
            <div><span style={{ color: '#666' }}>CNAE: </span><span style={{ border: '1px solid #333', padding: '1px 4px', letterSpacing: 2 }}>{empresa?.cnae?.replace(/[^0-9]/g, '')}</span></div>
            <div><span style={{ color: '#666' }}>Grau de Risco: </span><span style={{ border: '1px solid #333', padding: '1px 6px' }}>{empresa?.grau_risco}</span></div>
          </div>
          <div style={{ borderBottom: '1px solid #ccc', paddingBottom: 3, marginBottom: 4 }}>
            <span style={{ color: '#666' }}>Endereço: </span>{empresa ? `${empresa.endereco}, ${empresa.numero} — ${empresa.bairro} — ${empresa.cidade}/${empresa.uf}` : ''}
          </div>

          {/* TÍTULO */}
          <div style={{ textAlign: 'center', borderBottom: '1px solid #ccc', paddingBottom: 3, marginBottom: 4 }}>
            <div style={{ fontWeight: 700, fontSize: 10 }}>Programa de Controle Médico de Saúde Ocupacional - PCMSO</div>
            <div style={{ fontWeight: 700, fontSize: 10 }}>Atestado de Saúde Ocupacional - ASO</div>
          </div>

          {/* TIPOS */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 4, flexWrap: 'wrap' }}>
            {[{ k: 'tipo_admissional', l: 'Admissional' }, { k: 'tipo_periodico', l: 'Periódico' }, { k: 'tipo_demissional', l: 'Demissional' }, { k: 'tipo_retorno', l: 'Retorno ao Trabalho' }, { k: 'tipo_mudanca_risco', l: 'Mudança de Risco Ocupacional' }].map(t => (
              <CBVis key={t.k} checked={(form as any)[t.k]} onChange={v => setForm(f => ({ ...f, [t.k]: v }))} label={t.l} />
            ))}
          </div>
          <div style={{ fontStyle: 'italic', fontSize: 8, borderBottom: '1px solid #ccc', paddingBottom: 3, marginBottom: 4 }}>Atesto para os devidos fins de cumprimento do que determina a Norma Regulamentadora, NR 7, que o(a) Sr(a) abaixo identificado(a)</div>

          {/* LINHA 1 */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 3 }}>
            <Campo label="Nome:" valor={form.nome} onChange={v => setForm(f => ({ ...f, nome: v }))} bold flex={1} />
            <Campo label="Matr.:" valor={form.matricula} onChange={v => setForm(f => ({ ...f, matricula: v }))} w={70} />
            <Campo label="Data de Nasc." valor={form.data_nascimento} onChange={v => setForm(f => ({ ...f, data_nascimento: v }))} w={100} />
            <Campo label="Idade:" valor={form.idade} onChange={v => setForm(f => ({ ...f, idade: v }))} w={35} />
          </div>

          {/* LINHA 2 */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 3 }}>
            <Campo label="Sexo:" valor={form.sexo} onChange={v => setForm(f => ({ ...f, sexo: v }))} w={40} />
            <Campo label="Estado Civil:" valor={form.estado_civil} onChange={v => setForm(f => ({ ...f, estado_civil: v }))} w={80} />
            <Campo label="Data de Admissão:" valor={form.data_admissao} onChange={v => setForm(f => ({ ...f, data_admissao: v }))} w={80} />
            <Campo label="Função:" valor={form.funcao} onChange={v => setForm(f => ({ ...f, funcao: v }))} bold flex={1} />
            <Campo label="Condução:" valor={form.conducao} onChange={v => setForm(f => ({ ...f, conducao: v }))} w={50} />
          </div>

          {/* LINHA 3 */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 6, borderBottom: '1px solid #ccc', paddingBottom: 4 }}>
            <Campo label="RG:" valor={form.rg} onChange={v => setForm(f => ({ ...f, rg: v }))} w={90} />
            <Campo label="Órgão Exp.:" valor={form.rg_orgao} onChange={v => setForm(f => ({ ...f, rg_orgao: v }))} w={65} />
            <Campo label="UF:" valor={form.rg_uf} onChange={v => setForm(f => ({ ...f, rg_uf: v }))} w={28} />
            <Campo label="CPF:" valor={form.cpf} onChange={v => setForm(f => ({ ...f, cpf: v }))} flex={1} />
            <Campo label="P.C.D:" valor={form.pcd} onChange={v => setForm(f => ({ ...f, pcd: v }))} w={38} />
          </div>

          {/* RISCOS */}
          <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #ccc', marginBottom: 6, fontSize: 9 }}>
            <thead><tr style={{ backgroundColor: '#f0f0f0' }}>
              <th style={{ padding: '3px 6px', textAlign: 'left', fontWeight: 700, borderRight: '1px solid #ccc', width: '50%' }}>Tipos de Riscos</th>
              <th style={{ padding: '3px 6px', textAlign: 'left', fontWeight: 700 }}>Riscos Ocupacionais</th>
            </tr></thead>
            <tbody>
              {[
                { k: 'risco_fisico', dk: 'risco_fisico_desc', l: 'Riscos Físicos' },
                { k: 'risco_quimico', dk: 'risco_quimico_desc', l: 'Riscos Químicos' },
                { k: 'risco_biologico', dk: 'risco_biologico_desc', l: 'Riscos Biológicos' },
                { k: 'risco_ergonomico', dk: 'risco_ergonomico_desc', l: 'Riscos Ergonômicos' },
                { k: 'risco_acidente', dk: 'risco_acidente_desc', l: 'Riscos Acidentes / Mecânicos' },
              ].map(r => (
                <tr key={r.k} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '3px 6px', borderRight: '1px solid #ccc' }}>
                    <CBVis checked={(form as any)[r.k]} onChange={v => setForm(f => ({ ...f, [r.k]: v }))} label={r.l} />
                  </td>
                  <td style={{ padding: '3px 6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ color: '#888' }}>- </span>
                      <input value={(form as any)[r.dk]} onChange={e => setForm(f => ({ ...f, [r.dk]: e.target.value }))} placeholder="Descrição..." style={{ flex: 1, border: 'none', borderBottom: '1px solid #ccc', outline: 'none', fontSize: 9, fontFamily: 'Arial', background: 'transparent' }} />
                    </div>
                  </td>
                </tr>
              ))}
              <tr><td colSpan={2} style={{ padding: '3px 6px' }}><CBVis checked={form.sem_risco} onChange={v => setForm(f => ({ ...f, sem_risco: v }))} label="Sem riscos Ocupacionais Específicos" /></td></tr>
            </tbody>
          </table>

          {/* EXAMES */}
          <div style={{ marginBottom: 6 }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Avaliação Clínica e Exames Complementares:</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 9 }}>
              <tbody>{[0, 1, 2, 3].map(row => (
                <tr key={row}>
                  {[row * 2, row * 2 + 1].map(i => (
                    <td key={i} style={{ width: '50%', padding: '2px 4px', borderBottom: '1px solid #eee' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ color: '#aaa', whiteSpace: 'nowrap' }}>____/____/______</span>
                        <input value={form.exames[i] || ''} onChange={e => { const arr = [...form.exames]; arr[i] = e.target.value; setForm(f => ({ ...f, exames: arr })) }} style={{ flex: 1, border: 'none', borderBottom: '1px solid #ccc', outline: 'none', fontSize: 9, background: 'transparent' }} placeholder="Nome do exame..." />
                        <span style={{ color: '#aaa', whiteSpace: 'nowrap' }}>____/____/______</span>
                      </div>
                    </td>
                  ))}
                </tr>
              ))}</tbody>
            </table>
          </div>

          {/* RESULTADO */}
          <div style={{ border: '1px solid #ccc', padding: '5px 8px', marginBottom: 6 }}>
            <div style={{ marginBottom: 4 }}>Atesto que o examinado foi submetido a exame médico (Clínico, Físico e Mental) Sendo Considerado:</div>
            <div style={{ display: 'flex' }}>
              <CBVis checked={form.apto} onChange={v => setForm(f => ({ ...f, apto: v, inapto: v ? false : f.inapto }))} label="Apto" />
              <CBVis checked={form.inapto} onChange={v => setForm(f => ({ ...f, inapto: v, apto: v ? false : f.apto }))} label="Inapto" />
            </div>
          </div>

          {/* APTIDÃO CRÍTICA */}
          <div style={{ marginBottom: 6 }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Aptidão para Atividade Críticas:</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 9, border: '1px solid #ccc' }}>
              <tbody>
                {[
                  { l: 'Trabalho em Altura (NR35)', k1: 'altura_apto', k2: 'altura_inapto', k3: 'altura_na' },
                  { l: 'Condução de Veículos', k1: 'conducao_apto', k2: 'conducao_inapto', k3: 'conducao_na' },
                  { l: 'Espaço Confinado (NR33)', k1: 'confinado_apto', k2: 'confinado_inapto', k3: 'confinado_na' },
                  { l: 'Contato com Produtos Químicos', k1: 'quimico_apto', k2: 'quimico_inapto', k3: 'quimico_na' },
                ].map(row => (
                  <tr key={row.l} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '3px 6px', width: '35%' }}>{row.l}</td>
                    <td style={{ padding: '3px 8px' }}><CBVis checked={(form as any)[row.k1]} onChange={v => setForm(f => ({ ...f, [row.k1]: v }))} label="Apto" /></td>
                    <td style={{ padding: '3px 8px' }}><CBVis checked={(form as any)[row.k2]} onChange={v => setForm(f => ({ ...f, [row.k2]: v }))} label="Inapto" /></td>
                    <td style={{ padding: '3px 8px' }}><CBVis checked={(form as any)[row.k3]} onChange={v => setForm(f => ({ ...f, [row.k3]: v }))} label="Não se Aplica" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

    {/* LOCAL E DATA (Para impressão) */}
<div style={{ display: 'flex', alignItems: 'flex-end', marginBottom: 8, fontSize: 9 }}>
  
  {/* Campo editável para o Local */}
  <input 
    value={form.local} 
    onChange={e => setForm(f => ({ ...f, local: e.target.value }))}
    style={{ width: 140, border: 'none', borderBottom: '1px solid #333', outline: 'none', fontSize: 9, background: 'transparent', padding: '1px 2px' }} 
  />
  
  {/* Separador */}
  <span style={{ marginBottom: 2, marginLeft: 8, marginRight: 8 }}> - </span>
  {/* Espaço em branco para o DIA (para preencher à mão) */}
  <div style={{ width: 30, borderBottom: '1px solid #333', height: 14 }}></div>
  {/* Barra */}
  <span style={{ marginBottom: 2, marginLeft: 4, marginRight: 4 }}> / </span>
  {/* Espaço em branco para o MÊS (para preencher à mão) */}
  <div style={{ width: 30, borderBottom: '1px solid #333', height: 14 }}></div>
  {/* Barra */}
  <span style={{ marginBottom: 2, marginLeft: 4, marginRight: 4 }}> / </span>
  {/* Espaço em branco para o ANO (para preencher à mão) */}
  <div style={{ width: 40, borderBottom: '1px solid #333', height: 14 }}></div>

</div>

          {/* RECIBO */}
          <div style={{ borderBottom: '1px solid #ccc', paddingBottom: 4, marginBottom: 8, fontSize: 9 }}>Recebi cópia do Atestado de Saúde Ocupacional - ASO</div>

{/* ASSINATURAS */}
<table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 9, marginBottom: 8, border: '1px solid #333' }}>
  <thead>
    <tr>
      {[
        { titulo: 'Trabalhador(a)', linhas: [] },
        { titulo: 'Médico Examinador', linhas: [] },
        { titulo: 'Médico Responsável pelo PCMSO', linhas: [medico?.nome || '', medico?.especialidade || '', `CRM: ${medico?.crm || ''} . RQE N° ${medico?.rqe || ''}`, `FONE: ${medico?.telefone || ''}`] },
      ].map((col, i) => (
        <th key={i} style={{ border: '1px solid #333', padding: '3px 6px', fontWeight: 700, textAlign: 'left', width: '33.33%' }}>
          {col.titulo}
        </th>
      ))}
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style={{ border: '1px solid #333', height: 50, padding: '3px 6px', verticalAlign: 'top' }}></td>
      <td style={{ border: '1px solid #333', height: 50, padding: '3px 6px', verticalAlign: 'top' }}></td>
      <td style={{ border: '1px solid #333', padding: '3px 6px', verticalAlign: 'top', textAlign: 'center' }}>
        {[medico?.nome || '', medico?.especialidade || '', `CRM: ${medico?.crm || ''} . RQE N° ${medico?.rqe || ''}`, `FONE: ${medico?.telefone || ''}`].map((l, j) => (
          <div key={j}>{l}</div>
        ))}
      </td>
    </tr>
  </tbody>
</table>

          {/* RODAPÉ */}
          <div style={{ borderTop: '1px solid #ccc', paddingTop: 4, fontSize: 8, color: '#555', fontStyle: 'italic' }}>
            NB. Os dados dos exames clínicos e complementares deverão ser registrados em prontuário médico individual sob a responsabilidade do médico responsável pelo PCMSO, ou do médico responsável pelo exame, quando a organização estiver dispensada de PCMSO. NR7.6.1.
          </div>
        </div>
      </div>
    </div>
  )
}