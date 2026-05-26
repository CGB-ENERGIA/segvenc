'use client'

import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { pdf, Document, Page, View, Text, Image, StyleSheet, Svg, Rect, Line } from '@react-pdf/renderer'

const COR = '#9f183c'

const EXAMES_BIENAIS = ['eeg', 'rx dorso-lombar', 'rx dorso lombar', 'raio-x dorso lombar', 'raio x dorso lombar']

function isDentro2Anos(data: string | null): boolean {
  if (!data) return false
  return new Date().getTime() - new Date(data + 'T12:00:00').getTime() < 2 * 365.25 * 24 * 60 * 60 * 1000
}
function isExameBienal(nome: string): boolean {
  return EXAMES_BIENAIS.some(b => nome.toLowerCase().includes(b))
}
function isAuxServicosGerais(funcao: string): boolean {
  const f = funcao.toLowerCase()
  return f.includes('auxiliar serviços gerais') || f.includes('auxiliar de serviços gerais') || f.includes('aux. serviços gerais')
}

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
  exames_datas: string[]
  apto: boolean; inapto: boolean
  altura_apto: boolean; altura_inapto: boolean; altura_na: boolean
  conducao_apto: boolean; conducao_inapto: boolean; conducao_na: boolean
  confinado_apto: boolean; confinado_inapto: boolean; confinado_na: boolean
  quimico_apto: boolean; quimico_inapto: boolean; quimico_na: boolean
  local: string; data_ass: string
  isManual: boolean
}

type TipoFicha = 'aso' | 'clinico' | 'altura'

const TIPOS_ASO = [
  { value: 'admissional',   label: 'Admissional',                  campo: 'no_adm' },
  { value: 'periodico',     label: 'Periódico',                    campo: 'no_per' },
  { value: 'retorno',       label: 'Retorno ao Trabalho',          campo: 'no_ret' },
  { value: 'mudanca_risco', label: 'Mudança de Risco Ocupacional', campo: 'no_mro' },
  { value: 'demissional',   label: 'Demissional',                  campo: 'no_dem' },
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
function getNatureza(form: FormASO): string {
  if (form.tipo_admissional) return 'Admissional'
  if (form.tipo_periodico) return 'Periódico'
  if (form.tipo_retorno) return 'Retorno ao Trabalho'
  if (form.tipo_mudanca_risco) return 'Mudança de Risco Ocupacional'
  if (form.tipo_demissional) return 'Demissional'
  return ''
}

// ─── ESTILOS PDF ──────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  page:    { fontFamily: 'Helvetica', fontSize: 8, padding: 20, backgroundColor: '#fff' },
  borda:   { border: '1pt solid #333', padding: 6 },
  row:     { flexDirection: 'row', alignItems: 'center' },
  label:   { color: '#555', fontSize: 7 },
  bold:    { fontFamily: 'Helvetica-Bold' },
  small:   { fontSize: 7, color: '#555' },
  italic:  { fontFamily: 'Helvetica-Oblique', fontSize: 7 },
  linhaSec:{ borderBottom: '0.5pt solid #ccc', marginBottom: 2, paddingBottom: 2 },
  thRow:   { flexDirection: 'row', borderBottom: '0.5pt solid #333', backgroundColor: '#f0f0f0' },
  th:      { fontSize: 7, fontFamily: 'Helvetica-Bold', padding: 3 },
  tdRow:   { flexDirection: 'row', borderBottom: '0.3pt solid #ddd' },
  td:      { fontSize: 7.5, padding: '3 4' },
  secTit:  { fontFamily: 'Helvetica-Bold', fontSize: 8, marginBottom: 3 },
  campo:   { borderBottom: '0.5pt solid #666', minWidth: 40, paddingBottom: 1 },
})

// ─── COMPONENTES PDF COMPARTILHADOS ──────────────────────────────────────────
function CB({ checked }: { checked: boolean }) {
  if (checked) return (
    <Svg width={10} height={10} style={{ marginRight: 3 }}>
      <Rect x="0.5" y="0.5" width="9" height="9" stroke="#333" strokeWidth="0.8" fill="white" />
      <Line x1="2" y1="2" x2="8" y2="8" stroke="#000" strokeWidth="1.5" />
      <Line x1="8" y1="2" x2="2" y2="8" stroke="#000" strokeWidth="1.5" />
    </Svg>
  )
  return (
    <Svg width={10} height={10} style={{ marginRight: 3 }}>
      <Rect x="0.5" y="0.5" width="9" height="9" stroke="#333" strokeWidth="0.8" fill="white" />
    </Svg>
  )
}

// Checkbox vazio menor — para fichas em branco
function Box({ size = 8 }: { size?: number }) {
  return (
    <Svg width={size} height={size} style={{ marginRight: 2 }}>
      <Rect x="0.5" y="0.5" width={size - 1} height={size - 1} stroke="#333" strokeWidth="0.7" fill="white" />
    </Svg>
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

// ─── DOCUMENTO ASO ────────────────────────────────────────────────────────────
function ASODocument({ form, empresa, medico }: { form: FormASO; empresa: Empresa | null; medico: Medico | null }) {
  const cnae = empresa?.cnae?.replace(/[^0-9\-\/]/g, '') || ''
  return (
    <Document>
      {[1, 2, 3].map(via => (
        <Page key={via} size="A4" style={S.page}>
          <View style={S.borda}>
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
            <View style={[S.row, { marginBottom: 3 }]}>
              <View style={{ flex: 1 }}><Text><Text style={S.label}>Razão Social: </Text><Text style={S.bold}>{empresa?.razao_social}</Text></Text></View>
              <View style={{ alignItems: 'center', marginHorizontal: 8 }}>
                <Text style={S.label}>CNAE:</Text>
                <View style={{ border: '0.8pt solid #333', padding: '1 4' }}><Text style={{ letterSpacing: 3, fontSize: 8 }}>{cnae}</Text></View>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={S.label}>Grau de Risco:</Text>
                <View style={{ border: '0.8pt solid #333', padding: '1 8' }}><Text style={{ fontSize: 8 }}>{empresa?.grau_risco}</Text></View>
              </View>
            </View>
            <View style={S.linhaSec}><Text><Text style={S.label}>Endereço: </Text>{empresa ? `${empresa.endereco}, ${empresa.numero} — ${empresa.bairro} — ${empresa.cidade}/${empresa.uf}` : ''}</Text></View>
            <View style={{ alignItems: 'center', marginBottom: 4, borderBottom: '0.5pt solid #ccc', paddingBottom: 3 }}>
              <Text style={[S.bold, { fontSize: 9 }]}>Programa de Controle Médico de Saúde Ocupacional - PCMSO</Text>
              <Text style={[S.bold, { fontSize: 9 }]}>Atestado de Saúde Ocupacional - ASO</Text>
            </View>
            <View style={[S.row, { gap: 16, marginBottom: 4, flexWrap: 'wrap' }]}>
              {[{ k: 'tipo_admissional', l: 'Admissional' }, { k: 'tipo_periodico', l: 'Periódico' }, { k: 'tipo_demissional', l: 'Demissional' }, { k: 'tipo_retorno', l: 'Retorno ao Trabalho' }, { k: 'tipo_mudanca_risco', l: 'Mudança de Risco Ocupacional' }].map(t => (
                <View key={t.k} style={[S.row, { marginRight: 8 }]}><CB checked={(form as any)[t.k]} /><Text> {t.l}</Text></View>
              ))}
            </View>
            <View style={S.linhaSec}><Text style={S.italic}>Atesto para os devidos fins de cumprimento do que determina a Norma Regulamentadora, NR 7, que o(a) Sr(a) abaixo identificado(a)</Text></View>
            <View style={[S.row, { marginBottom: 3 }]}>
              <View style={{ flex: 1 }}><Text style={S.label}>Nome:</Text><View style={S.campo}><Text style={S.bold}>{form.nome}</Text></View></View>
              {!form.isManual && <View style={{ width: 75, marginLeft: 6 }}><Text style={S.label}>Matr.:</Text><View style={S.campo}><Text>{form.matricula}</Text></View></View>}
              <View style={{ width: 100, marginLeft: 6 }}><Text style={S.label}>Data de Nasc.</Text><View style={S.campo}><Text>{form.data_nascimento}</Text></View></View>
              <View style={{ width: 40, marginLeft: 6 }}><Text style={S.label}>Idade:</Text><View style={S.campo}><Text>{form.idade}</Text></View></View>
            </View>
            <View style={[S.row, { marginBottom: 3 }]}>
              <View style={{ width: 40 }}><Text style={S.label}>Sexo:</Text><View style={S.campo}><Text>{form.sexo}</Text></View></View>
              <View style={{ width: 80, marginLeft: 6 }}><Text style={S.label}>Estado Civil:</Text><View style={S.campo}><Text>{form.estado_civil}</Text></View></View>
              <View style={{ width: 80, marginLeft: 6 }}><Text style={S.label}>Data de Admissão:</Text><View style={S.campo}><Text>{form.data_admissao}</Text></View></View>
              <View style={{ flex: 1, marginLeft: 6 }}><Text style={S.label}>Função:</Text><View style={S.campo}><Text style={S.bold}>{form.funcao}</Text></View></View>
              <View style={{ width: 55, marginLeft: 6 }}><Text style={S.label}>Condução:</Text><View style={S.campo}><Text>{form.conducao}</Text></View></View>
            </View>
            <View style={[S.row, { marginBottom: 6, borderBottom: '0.5pt solid #ccc', paddingBottom: 4 }]}>
              <View style={{ width: 90 }}><Text style={S.label}>RG:</Text><View style={S.campo}><Text>{form.rg}</Text></View></View>
              <View style={{ width: 70, marginLeft: 6 }}><Text style={S.label}>Órgão Expedidor:</Text><View style={S.campo}><Text>{form.rg_orgao}</Text></View></View>
              <View style={{ width: 30, marginLeft: 6 }}><Text style={S.label}>UF:</Text><View style={S.campo}><Text>{form.rg_uf}</Text></View></View>
              <View style={{ flex: 1, marginLeft: 6 }}><Text style={S.label}>CPF:</Text><View style={S.campo}><Text>{form.cpf}</Text></View></View>
              <View style={{ width: 45, marginLeft: 6 }}><Text style={S.label}>P.C.D:</Text><View style={S.campo}><Text>{form.pcd}</Text></View></View>
            </View>
            <View style={{ border: '0.8pt solid #ccc', marginBottom: 6 }}>
              <View style={S.thRow}>
                <View style={{ flex: 1, borderRight: '0.5pt solid #ccc' }}><Text style={S.th}>Tipos de Riscos</Text></View>
                <View style={{ flex: 1 }}><Text style={S.th}>Riscos Ocupacionais</Text></View>
              </View>
              <LinhaRisco label="Riscos Físicos"               checked={form.risco_fisico}     desc={form.risco_fisico_desc} />
              <LinhaRisco label="Riscos Químicos"              checked={form.risco_quimico}    desc={form.risco_quimico_desc} />
              <LinhaRisco label="Riscos Biológicos"            checked={form.risco_biologico}  desc={form.risco_biologico_desc} />
              <LinhaRisco label="Riscos Ergonômicos"           checked={form.risco_ergonomico} desc={form.risco_ergonomico_desc} />
              <LinhaRisco label="Riscos Acidentes / Mecânicos" checked={form.risco_acidente}   desc={form.risco_acidente_desc} />
              <View style={[S.td, { flexDirection: 'row', alignItems: 'center' }]}><CB checked={form.sem_risco} /><Text> Sem riscos Ocupacionais Específicos</Text></View>
            </View>
            <View style={{ marginBottom: 6 }}>
              <Text style={S.secTit}>Avaliação Clínica e Exames Complementares:</Text>
              {[0, 1, 2, 3].map(row => (
                <View key={row} style={[S.row, { marginBottom: 3 }]}>
                  {[row * 2, row * 2 + 1].map(i => (
                    <View key={i} style={[S.row, { flex: 1, marginRight: i % 2 === 0 ? 8 : 0, alignItems: 'flex-end' }]}>
                      <Text style={[S.label, { marginRight: 3 }]}>{form.exames_datas[i] || '____/____/______'}</Text>
                      <View style={[S.campo, { flex: 1 }]}><Text>{form.exames[i] || ' '}</Text></View>
                      <Text style={[S.label, { marginLeft: 3 }]}>____/____/______</Text>
                    </View>
                  ))}
                </View>
              ))}
            </View>
            <View style={{ border: '0.8pt solid #ccc', padding: 5, marginBottom: 6 }}>
              <Text style={{ marginBottom: 4 }}>Atesto que o examinado foi submetido a exame médico (Clínico, Físico e Mental) Sendo Considerado:</Text>
              <View style={S.row}>
                <View style={[S.row, { marginRight: 20 }]}><CB checked={form.apto} /><Text> Apto</Text></View>
                <View style={S.row}><CB checked={form.inapto} /><Text> Inapto</Text></View>
              </View>
            </View>
            <View style={{ marginBottom: 8 }}>
              <Text style={S.secTit}>Aptidão para Atividade Críticas:</Text>
              <View style={{ border: '0.5pt solid #ccc' }}>
                <LinhaAptidao label="Trabalho em Altura (NR35)"     apto={form.altura_apto}    inapto={form.altura_inapto}    na={form.altura_na} />
                <LinhaAptidao label="Condução de Veículos"          apto={form.conducao_apto}  inapto={form.conducao_inapto}  na={form.conducao_na} />
                <LinhaAptidao label="Espaço Confinado (NR33)"       apto={form.confinado_apto} inapto={form.confinado_inapto} na={form.confinado_na} />
                <LinhaAptidao label="Contato com Produtos Químicos" apto={form.quimico_apto}   inapto={form.quimico_inapto}   na={form.quimico_na} />
              </View>
            </View>
            <View style={[S.row, { marginBottom: 8, alignItems: 'flex-end' }]}>
              <View style={[S.campo, { width: 140 }]}><Text>{form.local}</Text></View>
              <Text style={{ marginHorizontal: 4, paddingBottom: 1 }}> - </Text>
              <View style={[S.campo, { width: 40 }]}><Text>{' '}</Text></View>
              <View style={{ width: 24 }} />
              <View style={[S.campo, { width: 30 }]}><Text>{' '}</Text></View>
              <Text style={{ marginHorizontal: 4, paddingBottom: 1 }}> / </Text>
              <View style={[S.campo, { width: 30 }]}><Text>{' '}</Text></View>
              <Text style={{ marginHorizontal: 4, paddingBottom: 1 }}> / </Text>
              <View style={[S.campo, { width: 40 }]}><Text>{' '}</Text></View>
            </View>
            <View style={{ borderBottom: '0.5pt solid #ccc', paddingBottom: 4, marginBottom: 8 }}>
              <Text>Recebi cópia do Atestado de Saúde Ocupacional - ASO</Text>
            </View>
            <View style={{ border: '0.8pt solid #333', marginBottom: 6 }}>
              <View style={[S.row, { borderBottom: '0.8pt solid #333', alignItems: 'stretch' }]}>
                {['Trabalhador(a)', 'Médico Examinador', 'Médico Responsável pelo PCMSO'].map((titulo, i) => (
                  <View key={i} style={{ flex: 1, padding: '3 4', borderRight: i < 2 ? '0.8pt solid #333' : undefined }}>
                    <Text style={[S.bold, { fontSize: 7.5 }]}>{titulo}</Text>
                  </View>
                ))}
              </View>
              <View style={[S.row, { minHeight: 50, alignItems: 'stretch' }]}>
                <View style={{ flex: 1, borderRight: '0.8pt solid #333', padding: 4 }} />
                <View style={{ flex: 1, borderRight: '0.8pt solid #333', padding: 4 }} />
                <View style={{ flex: 1, padding: 4, alignItems: 'center' }}>
                  {[medico?.nome || '', medico?.especialidade || '', `CRM: ${medico?.crm || ''} . RQE N° ${medico?.rqe || ''}`, `FONE: ${medico?.telefone || ''}`].map((linha, j) => (
                    <Text key={j} style={{ fontSize: 7, textAlign: 'center' }}>{linha}</Text>
                  ))}
                </View>
              </View>
            </View>
            <View style={{ borderTop: '0.5pt solid #ccc', paddingTop: 4, marginTop: 8 }}>
              <Text style={[S.italic, { fontSize: 6.5, color: '#555' }]}>NB. Os dados dos exames clínicos e complementares deverão ser registrados em prontuário médico individual sob a responsabilidade do médico responsável pelo PCMSO, ou do médico responsável pelo exame, quando a organização estiver dispensada de PCMSO. NR7.6.1.</Text>
            </View>
          </View>
        </Page>
      ))}
    </Document>
  )
}

// ─── EXAME CLÍNICO PDF ────────────────────────────────────────────────────────
function ExameClinicoDocument({ form, empresa, medico }: { form: FormASO; empresa: Empresa | null; medico: Medico | null }) {
  const natureza = getNatureza(form)
  const sexoM = form.sexo?.toUpperCase() === 'M'
  const sexoF = form.sexo?.toUpperCase() === 'F'
  const ec = form.estado_civil?.toLowerCase() || ''

  // linha divisória
  const hr = { borderBottom: '0.3pt solid #bbb', marginBottom: 2, paddingBottom: 2 }
  // linha em branco preenchível
  function Linha({ h = 10 }: { h?: number }) {
    return <View style={{ borderBottom: '0.35pt solid #aaa', height: h, marginTop: 1, marginBottom: 3 }} />
  }
  // sim/não inline
  function SN({ label, mr = 10 }: { label: string; mr?: number }) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: mr }}>
        <Text style={{ fontSize: 6.5, marginRight: 2 }}>{label}</Text>
        <Box /><Text style={{ fontSize: 6.5, marginRight: 3 }}>Sim</Text>
        <Box /><Text style={{ fontSize: 6.5 }}>Não</Text>
      </View>
    )
  }

  return (
    <Document>
      <Page size="A4" style={{ fontFamily: 'Helvetica', fontSize: 7, padding: 14 }}>
        <View style={{ border: '1pt solid #333', padding: 6 }}>

          {/* CABEÇALHO */}
          <View style={{ flexDirection: 'row', alignItems: 'center', borderBottom: '1pt solid #333', paddingBottom: 4, marginBottom: 4 }}>
            <View style={{ width: 55 }}>
              <Image src="/logo-cgb.png" style={{ height: 22, objectFit: 'contain' }} />
            </View>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 14 }}>EXAME CLINICO</Text>
            </View>
            <View style={{ width: 120, alignItems: 'flex-end' }}>
              <Text style={{ fontSize: 6.5 }}>{empresa?.razao_social || 'CGB ENRGIA LTDA.'}</Text>
              <Text style={{ fontSize: 6 }}>CT 127 EQUATORIAL ENERGIA</Text>
              <Text style={{ fontSize: 6.5 }}>CNPJ: {empresa?.cnpj}</Text>
            </View>
          </View>

          {/* NATUREZA */}
          <View style={{ flexDirection: 'row', ...hr }}>
            <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 7 }}>NATUREZA: </Text>
            <Text style={{ fontSize: 7 }}>{natureza}</Text>
          </View>

          {/* NOME */}
          <View style={{ ...hr }}>
            <Text><Text style={{ fontFamily: 'Helvetica-Bold' }}>NOME: </Text><Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 8 }}>{form.nome}</Text></Text>
          </View>

          {/* SEXO / EST.CIVIL / IDADE */}
          <View style={{ flexDirection: 'row', alignItems: 'center', ...hr }}>
            <Text style={{ marginRight: 4 }}>SEXO: </Text>
            <CB checked={sexoM} /><Text style={{ marginRight: 6 }}>M</Text>
            <CB checked={sexoF} /><Text style={{ marginRight: 12 }}>F</Text>
            <Text style={{ marginRight: 4 }}>EST.CIVIL:</Text>
            <CB checked={ec.includes('solt')} /><Text style={{ marginRight: 4 }}>S</Text>
            <CB checked={ec.includes('cas')} /><Text style={{ marginRight: 4 }}>C</Text>
            <CB checked={ec.includes('vi')} /><Text style={{ marginRight: 16 }}>V</Text>
            <Text style={{ marginRight: 4 }}>IDADE: </Text>
            <Text style={{ fontFamily: 'Helvetica-Bold' }}>{form.idade}</Text>
            <Text> ANOS</Text>
          </View>

          {/* FUNÇÃO / DATA NASC / CPF */}
          <View style={{ flexDirection: 'row', ...hr }}>
            <View style={{ flex: 2 }}><Text>FUNÇÃO: <Text style={{ fontFamily: 'Helvetica-Bold' }}>{form.funcao}</Text></Text></View>
            <View style={{ flex: 1 }}><Text>DATA NASCIMENTO: <Text style={{ fontFamily: 'Helvetica-Bold' }}>{form.data_nascimento}</Text></Text></View>
            <View style={{ flex: 1 }}><Text>CPF: <Text style={{ fontFamily: 'Helvetica-Bold' }}>{form.cpf}</Text></Text></View>
          </View>

          {/* SETOR/GSE */}
          <View style={{ ...hr }}>
            <Text>SETOR/GSE: <Text style={{ fontFamily: 'Helvetica-Bold' }}>{form.gse}</Text></Text>
          </View>

          {/* HISTÓRICO OCUPACIONAL */}
          <View style={{ marginBottom: 3 }}>
            <Text style={{ fontFamily: 'Helvetica-Bold' }}>Histórico Ocupacional:</Text>
            <Linha h={9} /><Linha h={9} />
          </View>

          {/* COVID */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 3, borderBottom: '0.3pt solid #bbb', paddingBottom: 2 }}>
            <Text style={{ marginRight: 4 }}>Já testou positivo para COVID?</Text>
            <Box /><Text style={{ marginRight: 6 }}>Sim</Text>
            <Box /><Text style={{ marginRight: 10 }}>Não</Text>
            <Text style={{ marginRight: 4 }}>Complicações ou sequelas:</Text>
            <View style={{ flex: 1, borderBottom: '0.4pt solid #aaa' }}><Text> </Text></View>
          </View>

          {/* SINAIS VITAIS */}
          <View style={{ border: '0.5pt solid #ccc', padding: '3 4', marginBottom: 3 }}>
            <Text style={{ fontFamily: 'Helvetica-Bold', marginBottom: 3 }}>SINAIS VITAIS:</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              {[['Altura:', 35], ['Peso (KG):', 35], ['P. Arterial (mmHg):', 40], ['FC:', 28], ['Temperatura:', 40]].map(([label, w], i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', marginRight: 6 }}>
                  <Text style={{ marginRight: 2 }}>{label}</Text>
                  <View style={{ width: w as number, borderBottom: '0.5pt solid #555' }}><Text> </Text></View>
                </View>
              ))}
            </View>
          </View>

          {/* CONDIÇÕES DE SAÚDE */}
          <View style={{ border: '0.5pt solid #ccc', marginBottom: 3 }}>
            <View style={{ flexDirection: 'row', borderBottom: '0.3pt solid #ddd', padding: '3 4', flexWrap: 'wrap' }}>
              <SN label="Hipertensão?" /><SN label="Doenças do Coração" /><SN label="Diabético" /><SN label="Dist. Psiquiátrico" /><SN label="Tem asma ou rinite?" mr={0} />
            </View>
            <View style={{ flexDirection: 'row', padding: '3 4', alignItems: 'center' }}>
              <SN label="Fuma?" /><SN label="Epilético?" />
              <SN label="Bebida Alcoólica" />
              <Text style={{ marginRight: 4 }}>Periodicidade?</Text>
              <View style={{ width: 50, borderBottom: '0.4pt solid #aaa' }}><Text> </Text></View>
            </View>
          </View>

          {/* CÂNCER FAMÍLIA */}
          <View style={{ flexDirection: 'row', alignItems: 'center', ...hr }}>
            <Text style={{ marginRight: 4 }}>Tem casos de câncer na família?</Text>
            <Box /><Text style={{ marginRight: 6 }}>Sim</Text>
            <Box /><Text style={{ marginRight: 8 }}>Não</Text>
            <Text style={{ marginRight: 4 }}>Se sim quem?</Text>
            <View style={{ flex: 1, borderBottom: '0.4pt solid #aaa' }}><Text> </Text></View>
          </View>

          {/* HISTÓRICO PATOLÓGICO */}
          <View style={{ marginBottom: 3 }}>
            <Text style={{ fontFamily: 'Helvetica-Bold' }}>Histórico Patológico Pregressa/Familiar:</Text>
            <Linha h={9} /><Linha h={9} />
          </View>

          {/* ECTOSCOPIA */}
          <View style={{ flexDirection: 'row', alignItems: 'center', ...hr }}>
            <Text style={{ marginRight: 6 }}>Ectoscopia:</Text>
            <View style={{ flex: 1, borderBottom: '0.4pt solid #aaa' }}><Text> </Text></View>
          </View>

          {/* AR / ACV / ABD / EXTREMIDADES */}
          {[['AR:', 'ACV:'], ['ABD:', 'Extremidade de Membros:']].map(([a, b], ri) => (
            <View key={ri} style={{ flexDirection: 'row', ...hr }}>
              {[a, b].map((lbl, ci) => (
                <View key={ci} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', marginRight: ci === 0 ? 12 : 0 }}>
                  <Text style={{ fontFamily: 'Helvetica-Bold', marginRight: 4 }}>{lbl}</Text>
                  <Box /><Text style={{ marginRight: 6 }}>normal</Text>
                  <Box /><Text style={{ marginRight: 6 }}>anormal</Text>
                  <View style={{ flex: 1, borderBottom: '0.4pt solid #aaa' }}><Text> </Text></View>
                </View>
              ))}
            </View>
          ))}

          {/* ACIDENTE DE TRABALHO */}
          <View style={{ flexDirection: 'row', alignItems: 'center', ...hr }}>
            <Text style={{ marginRight: 4 }}>Acidente de Trabalho?</Text>
            <Box /><Text style={{ marginRight: 6 }}>não</Text>
            <Box /><Text style={{ marginRight: 8 }}>Sim</Text>
            <Text style={{ marginRight: 4 }}>Quando?</Text>
            <View style={{ flex: 1, borderBottom: '0.4pt solid #aaa' }}><Text> </Text></View>
          </View>

          {/* HERNIA */}
          <View style={{ flexDirection: 'row', alignItems: 'center', ...hr }}>
            <Text style={{ fontFamily: 'Helvetica-Bold', marginRight: 4 }}>TEM HERNIA INGUINAL, UMBILICAL OU OUTRAS:</Text>
            <Box /><Text style={{ marginRight: 6 }}>NÃO</Text>
            <Box /><Text>SIM</Text>
          </View>

          {/* CIRURGIAS / INTERNAÇÕES / TERAPIA / QUEIXAS */}
          {[
            ['Cirurgias Anteriores', 'Quais?'],
            ['Internações', 'Motivo'],
            ['Terapia Atual', 'Qual?'],
            ['Queixas Atuais', 'Quais?'],
          ].map(([label, detalhe]) => (
            <View key={label} style={{ flexDirection: 'row', alignItems: 'center', ...hr }}>
              <Text style={{ fontFamily: 'Helvetica-Bold', marginRight: 4 }}>{label}: </Text>
              <Box /><Text style={{ marginRight: 4 }}>não</Text>
              <Box /><Text style={{ marginRight: 8 }}>Sim</Text>
              <Text style={{ marginRight: 4 }}>{detalhe}</Text>
              <View style={{ flex: 1, borderBottom: '0.4pt solid #aaa' }}><Text> </Text></View>
            </View>
          ))}

          {/* ALERGIAS */}
          <View style={{ marginBottom: 3, borderBottom: '0.3pt solid #bbb', paddingBottom: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ fontFamily: 'Helvetica-Bold', marginRight: 4 }}>TEM ALERGIA A MEDICAMENTO, ANIMAIS / INSETOS OU OUTRAS:</Text>
              <Box /><Text style={{ marginRight: 6 }}>NÃO</Text>
              <Box /><Text>SIM / QUAIS:</Text>
            </View>
            <Linha h={8} />
          </View>

          {/* FRATURAS */}
          <View style={{ marginBottom: 3, borderBottom: '0.3pt solid #bbb', paddingBottom: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ marginRight: 4 }}>Já teve <Text style={{ fontFamily: 'Helvetica-Bold' }}>Fraturas, Entorse, Distenção</Text> ou <Text style={{ fontFamily: 'Helvetica-Bold' }}>Luxação</Text>?: </Text>
              <Box /><Text style={{ marginRight: 6 }}>NÃO</Text>
              <Box /><Text>SIM / QUAIS:</Text>
            </View>
            <Linha h={8} />
          </View>

          {/* JOELHOS */}
          <View style={{ marginBottom: 3 }}>
            <Text>Aspecto dos joelhos, cicatriz ou cirurgias ou impactos? <Text style={{ fontFamily: 'Helvetica-Oblique', fontSize: 6 }}>(Caso tenha alguma dúvida solicitar exames complementares)</Text></Text>
            <Linha h={8} />
          </View>

          {/* COLUNA */}
          <View style={{ flexDirection: 'row', alignItems: 'center', ...hr }}>
            <Text style={{ marginRight: 4 }}>Tem problemas na <Text style={{ fontFamily: 'Helvetica-Bold' }}>coluna vertebral</Text>?</Text>
            <Box /><Text style={{ marginRight: 6 }}>NÃO</Text>
            <Box /><Text style={{ marginRight: 8 }}>SIM / QUAIS:</Text>
            <View style={{ flex: 1, borderBottom: '0.4pt solid #aaa' }}><Text> </Text></View>
          </View>

          {/* ESPORTES */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4, borderBottom: '0.3pt solid #bbb', paddingBottom: 2 }}>
            <Text style={{ marginRight: 4 }}>Pratica esportes?</Text>
            <Box /><Text style={{ marginRight: 6 }}>NÃO</Text>
            <Box /><Text style={{ marginRight: 8 }}>SIM / QUAIS:</Text>
            <View style={{ flex: 1, borderBottom: '0.4pt solid #aaa' }}><Text> </Text></View>
          </View>

       {/* ASSINATURAS */}
          <View style={{ border: '0.8pt solid #333', marginBottom: 4 }}>
            
            {/* 1ª LINHA: Observações (Esq) | Info Médico (Dir) - MAIOR */}
            <View style={{ flexDirection: 'row', borderBottom: '0.8pt solid #333', minHeight: 45 }}>
              <View style={{ width: '50%', padding: '4 6', borderRight: '0.8pt solid #333' }}>
                <Text style={{ fontFamily: 'Helvetica-Bold' }}>Observações:</Text>
              </View>
              <View style={{ width: '50%', padding: '4 6', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontFamily: 'Helvetica-Bold', marginBottom: 3 }}>Médico Responsável pelo PCMSO</Text>
                {[medico?.nome || '', medico?.especialidade || '', `CRM: ${medico?.crm || ''} . RQE N° ${medico?.rqe || ''}`, `FONE: ${medico?.telefone || ''}`].map((l, j) => (
                  <Text key={j} style={{ fontSize: 6.5, textAlign: 'center' }}>{l}</Text>
                ))}
              </View>
            </View>

            {/* 2ª LINHA: Declaração (Esq) | Médico Examinador (Dir) - MENOR */}
            <View style={{ flexDirection: 'row', borderBottom: '0.8pt solid #333', minHeight: 20 }}>
              <View style={{ width: '50%', padding: '4 6', borderRight: '0.8pt solid #333', justifyContent: 'center' }}>
                <Text>Declaro ser verdade as informações prestadas acima.</Text>
              </View>
              <View style={{ width: '50%', padding: '4 6', justifyContent: 'center' }}>
                <Text style={{ fontFamily: 'Helvetica-Bold' }}>Médico Examinador:</Text>
              </View>
            </View>

            {/* 3ª LINHA: Campos em Branco para Assinaturas - MAIOR */}
            <View style={{ flexDirection: 'row', borderBottom: '0.8pt solid #333', minHeight: 45 }}>
              <View style={{ width: '50%', borderRight: '0.8pt solid #333' }} />
              <View style={{ width: '50%' }} />
            </View>

            {/* 4ª LINHA: Assinatura Colab (Esq) | Data (Dir) - MENOR */}
            <View style={{ flexDirection: 'row', minHeight: 22 }}>
              <View style={{ width: '50%', padding: '4 6', borderRight: '0.8pt solid #333', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 10 }}>Assinatura do colaborador</Text>
              </View>
              {/* Mantive o mesmo padding da linha 2 para a palavra "Data:" ficar exatamente alinhada com "Médico Examinador:" */}
              <View style={{ width: '50%', padding: '4 6', justifyContent: 'center' }}>
                <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 10 }}>Data:</Text>
              </View>
            </View>

          </View>
          
          <Text style={{ fontSize: 6, color: '#aaa', marginTop: 3 }}>FORM 09/07</Text>
        </View>
      </Page>
    </Document>
  )
}

// ─── TRABALHO EM ALTURA PDF ───────────────────────────────────────────────────
const PERGUNTAS_ALTURA = [
  { num: 1,  texto: 'Tem tontura ou labirintite?' },
  { num: 2,  texto: 'Já desmaiou alguma vez?' },
  { num: 3,  texto: 'Já teve convulsões ou epilepsia?' },
  { num: 4,  texto: 'Tem dores de cabeça frequentes?' },
  { num: 5,  texto: 'Já teve perda de consciência no trabalho?' },
  { num: 6,  texto: 'Tem ou já teve doença cardíaca?' },
  { num: 7,  texto: 'Tem pressão alta?' },
  { num: 8,  texto: 'Sente falta de ar aos esforços?' },
  { num: 9,  texto: 'Já teve dor no peito?' },
  { num: 10, texto: 'Faz tratamento cardiológico?' },
  { num: 11, texto: 'Tem dificuldade de visão?' },
  { num: 12, texto: 'Usa óculos ou lentes corretivas?' },
  { num: 13, texto: 'Tem perda auditiva?' },
  { num: 14, texto: 'Usa aparelho auditivo?' },
  { num: 15, texto: 'Tem medo de altura?' },
  { num: 16, texto: 'Já teve crise de ansiedade ou pânico?' },
  { num: 17, texto: 'Já fez tratamento psicológico ou psiquiátrico?' },
  { num: 18, texto: 'Faz uso de medicação controlada?' },
  { num: 19, texto: 'Usa medicamentos que causam sono ou tontura? Qual?' },
  { num: 20, texto: 'Tem dificuldade de concentração?' },
  { num: 21, texto: 'Consome bebida alcoólica com frequência?' },
  { num: 22, texto: 'Já trabalhou sob efeito de álcool ou medicação sedativa?' },
  { num: 23, texto: 'Tem dores nas pernas, joelhos ou coluna?' },
  { num: 24, texto: 'Tem dificuldade para subir escadas?' },
  { num: 25, texto: 'Já sofreu queda em altura?' },
]
const DOENCAS_ALTURA = [
  { num: 26, texto: 'Diabetes' }, { num: 27, texto: 'Hipertensão' }, { num: 28, texto: 'Asma' },
  { num: 29, texto: 'Doença cardiaca' }, { num: 30, texto: 'Doença neurologica' },
  { num: 31, texto: 'Doença psiquiatrica' }, { num: 32, texto: 'Surdez' },
  { num: 33, texto: 'Tuberculose' }, { num: 34, texto: 'Alergias' },
]

function TrabalhoAlturaDocument({ form, empresa, medico }: { form: FormASO; empresa: Empresa | null; medico: Medico | null }) {
  const natureza = getNatureza(form)
  const sexoM = form.sexo?.toUpperCase() === 'M'
  const sexoF = form.sexo?.toUpperCase() === 'F'
  const ec = form.estado_civil?.toLowerCase() || ''
  const W = 32 // largura colunas SIM/NÃO/NÃO SEI

  return (
    <Document>
      <Page size="A4" style={{ fontFamily: 'Helvetica', fontSize: 7, padding: 14 }}>
        <View style={{ border: '1pt solid #333', padding: 5 }}>

          {/* CABEÇALHO */}
          <View style={{ flexDirection: 'row', alignItems: 'center', borderBottom: '1pt solid #333', paddingBottom: 3, marginBottom: 3 }}>
            <View style={{ width: 55 }}>
              <Image src="/logo-cgb.png" style={{ height: 22, objectFit: 'contain' }} />
            </View>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 14 }}>TRABALHO EM ALTURA</Text>
            </View>
            <View style={{ width: 120, alignItems: 'flex-end' }}>
              <Text style={{ fontSize: 6.5 }}>{empresa?.razao_social || 'CGB ENRGIA LTDA.'}</Text>
              <Text style={{ fontSize: 6 }}>CT 127 EQUATORIAL ENERGIA</Text>
              <Text style={{ fontSize: 6.5 }}>CNPJ: {empresa?.cnpj}</Text>
            </View>
          </View>

          {/* NATUREZA */}
          <View style={{ borderBottom: '0.3pt solid #ccc', paddingBottom: 2, marginBottom: 2 }}>
            <Text><Text style={{ fontFamily: 'Helvetica-Bold' }}>Natureza: </Text>{natureza}</Text>
          </View>

          {/* NOME */}
          <View style={{ borderBottom: '0.3pt solid #ccc', paddingBottom: 2, marginBottom: 2 }}>
            <Text><Text style={{ fontFamily: 'Helvetica-Bold' }}>NOME: </Text><Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 8 }}>{form.nome}</Text></Text>
          </View>

          {/* SEXO / EST.CIVIL / IDADE */}
          <View style={{ flexDirection: 'row', alignItems: 'center', borderBottom: '0.3pt solid #ccc', paddingBottom: 2, marginBottom: 2 }}>
            <Text style={{ marginRight: 4 }}>SEXO: </Text>
            <CB checked={sexoM} /><Text style={{ marginRight: 6 }}>M</Text>
            <CB checked={sexoF} /><Text style={{ marginRight: 12 }}>F</Text>
            <Text style={{ marginRight: 4 }}>EST.CIVIL: </Text>
            <CB checked={ec.includes('solt')} /><Text style={{ marginRight: 4 }}>S</Text>
            <CB checked={ec.includes('cas')} /><Text style={{ marginRight: 4 }}>C</Text>
            <CB checked={ec.includes('vi')} /><Text style={{ marginRight: 16 }}>V</Text>
            <Text style={{ marginRight: 4 }}>IDADE: </Text>
            <Text style={{ fontFamily: 'Helvetica-Bold' }}>{form.idade}</Text>
            <Text> ANOS</Text>
          </View>

          {/* RG / DATA NASC / CIDADE */}
          <View style={{ flexDirection: 'row', borderBottom: '0.3pt solid #ccc', paddingBottom: 2, marginBottom: 2 }}>
            <View style={{ flex: 1 }}><Text>RG: <Text style={{ fontFamily: 'Helvetica-Bold' }}>{form.rg}</Text></Text></View>
            <View style={{ flex: 1 }}><Text>DATA NASCIMENTO: <Text style={{ fontFamily: 'Helvetica-Bold' }}>{form.data_nascimento}</Text></Text></View>
            <View style={{ flex: 1 }}><Text>CIDADE</Text></View>
          </View>

          {/* FUNÇÃO / ESTADO */}
          <View style={{ flexDirection: 'row', borderBottom: '0.3pt solid #ccc', paddingBottom: 2, marginBottom: 2 }}>
            <View style={{ flex: 2 }}><Text>FUNÇÃO: <Text style={{ fontFamily: 'Helvetica-Bold' }}>{form.funcao}</Text></Text></View>
            <View style={{ flex: 1 }}><Text>ESTADO</Text></View>
          </View>

          {/* SETOR/GSE / DATA */}
          <View style={{ flexDirection: 'row', borderBottom: '0.3pt solid #ccc', paddingBottom: 2, marginBottom: 4 }}>
            <View style={{ flex: 2 }}><Text>SETOR / GSE: <Text style={{ fontFamily: 'Helvetica-Bold' }}>{form.gse}</Text></Text></View>
            <View style={{ flex: 1 }}><Text>DATA</Text></View>
          </View>

          {/* SINAIS VITAIS */}
          <View style={{ flexDirection: 'row', alignItems: 'center', border: '0.5pt solid #ccc', padding: '3 4', marginBottom: 3 }}>
            <Text style={{ fontFamily: 'Helvetica-Bold', marginRight: 6 }}>SINAIS VITAIS:</Text>
            {[['P.Arterial (mmHg):', 38], ['ALTURA:', 30], ['PESO:', 30], ['FC-CARDIACA:', 40]].map(([label, w], i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', marginRight: 8 }}>
                <Text style={{ marginRight: 2 }}>{label}</Text>
                <View style={{ width: w as number, borderBottom: '0.5pt solid #555' }}><Text> </Text></View>
              </View>
            ))}
          </View>

          {/* HERNIA */}
          <View style={{ marginBottom: 3, borderBottom: '0.3pt solid #ccc', paddingBottom: 2 }}>
            <Text>TEM HERNIA INGUINAL, UMBILICAL OU OUTRAS: (QUAL)</Text>
            <View style={{ borderBottom: '0.4pt solid #aaa', height: 10, marginTop: 2 }} />
          </View>

          {/* QUESTIONÁRIO CLÍNICO */}
          <View style={{ border: '0.5pt solid #ccc', marginBottom: 3 }}>
            <View style={{ flexDirection: 'row', backgroundColor: '#f0f0f0', borderBottom: '0.5pt solid #333', padding: '2 4', alignItems: 'center' }}>
              <Text style={{ fontFamily: 'Helvetica-Bold', flex: 1 }}>Questionário Clínico</Text>
              <Text style={{ fontFamily: 'Helvetica-Bold', width: W, textAlign: 'center' }}>SIM</Text>
              <Text style={{ fontFamily: 'Helvetica-Bold', width: W, textAlign: 'center' }}>NÃO</Text>
              <Text style={{ fontFamily: 'Helvetica-Bold', width: W + 6, textAlign: 'center' }}>NÃO SEI</Text>
            </View>
            {PERGUNTAS_ALTURA.map(q => (
              <View key={q.num} style={{ flexDirection: 'row', borderBottom: '0.2pt solid #eee', padding: '2 4', alignItems: 'center' }}>
                <Text style={{ fontSize: 6, width: 14, color: '#888' }}>{q.num}</Text>
                <Text style={{ flex: 1, fontSize: 6.5 }}>{q.texto}</Text>
                <View style={{ width: W, alignItems: 'center' }}><Box /></View>
                <View style={{ width: W, alignItems: 'center' }}><Box /></View>
                <View style={{ width: W + 6, alignItems: 'center' }}><Box /></View>
              </View>
            ))}
          </View>

          {/* DOENÇAS */}
          <View style={{ border: '0.5pt solid #ccc', marginBottom: 3 }}>
            <View style={{ flexDirection: 'row', backgroundColor: '#f0f0f0', borderBottom: '0.5pt solid #333', padding: '2 4', alignItems: 'center' }}>
              <Text style={{ fontFamily: 'Helvetica-Bold', flex: 1 }}>JÁ FOI OU É PORTADOR DE ALGUMAS DAS DOENÇAS ABAIXO</Text>
              <Text style={{ fontFamily: 'Helvetica-Bold', width: W, textAlign: 'center' }}>SIM</Text>
              <Text style={{ fontFamily: 'Helvetica-Bold', width: W, textAlign: 'center' }}>NÃO</Text>
              <Text style={{ fontFamily: 'Helvetica-Bold', width: W + 6, textAlign: 'center' }}>NÃO SEI</Text>
            </View>
            {DOENCAS_ALTURA.map(d => (
              <View key={d.num} style={{ flexDirection: 'row', borderBottom: '0.2pt solid #eee', padding: '2 4', alignItems: 'center' }}>
                <Text style={{ fontSize: 6, width: 14, color: '#888' }}>{d.num}</Text>
                <Text style={{ flex: 1, fontSize: 6.5 }}>{d.texto}</Text>
                <View style={{ width: W, alignItems: 'center' }}><Box /></View>
                <View style={{ width: W, alignItems: 'center' }}><Box /></View>
                <View style={{ width: W + 6, alignItems: 'center' }}><Box /></View>
              </View>
            ))}
          </View>

          {/* OBSERVAÇÕES */}
          <View style={{ marginBottom: 4 }}>
            <Text style={{ fontFamily: 'Helvetica-Bold' }}>Observações:</Text>
            {[...Array(4)].map((_, i) => <View key={i} style={{ borderBottom: '0.3pt solid #ccc', height: 11, marginTop: 2 }} />)}
          </View>

          {/* ASSINATURAS */}
          <View style={{ border: '0.8pt solid #333', marginBottom: 3 }}>
            <View style={{ flexDirection: 'row', borderBottom: '0.8pt solid #333' }}>
              <View style={{ flex: 2, padding: '3 4', borderRight: '0.8pt solid #333' }}>
                <Text>Assinatura do colaborador:</Text>
              </View>
              <View style={{ flex: 1, padding: '3 4', borderRight: '0.8pt solid #333' }}>
                <Text style={{ fontFamily: 'Helvetica-Bold' }}>Data:</Text>
              </View>
              <View style={{ flex: 2, padding: '3 4' }}>
                <Text>Médico Examinador:</Text>
              </View>
            </View>
            <View style={{ minHeight: 36 }} />
          </View>

          {/* RODAPÉ MÉDICO */}
          <View style={{ alignItems: 'center', borderTop: '0.5pt solid #ccc', paddingTop: 3 }}>
            <Text style={{ fontSize: 6.5, textAlign: 'center' }}>
              {medico?.nome || ''} MÉDICO DO TRABALHO CRM: {medico?.crm || ''} . RQE N° {medico?.rqe || ''}  FONE: {medico?.telefone || ''}
            </Text>
            {empresa && <Text style={{ fontSize: 6.5, textAlign: 'center' }}>{empresa.endereco}, {empresa.numero}. {empresa.bairro}. {empresa.cidade}-{empresa.uf}</Text>}
          </View>
          <Text style={{ fontSize: 6, color: '#aaa', marginTop: 3 }}>FORM 09/07</Text>

        </View>
      </Page>
    </Document>
  )
}

// ─── PÁGINA PRINCIPAL ─────────────────────────────────────────────────────────
export default function GerarASOPage() {
  const [busca, setBusca] = useState('')
  const [resultados, setResultados] = useState<{ matricula: string; nome: string }[]>([])
  const [colabSel, setColabSel] = useState<Colaborador | null>(null)
  const buscaRef = useRef<NodeJS.Timeout | null>(null)
  const selecionandoRef = useRef(false)

  const [modoASO, setModoASO] = useState<'ativos' | 'admissional'>('ativos')
  const [buscaFuncaoAdm, setBuscaFuncaoAdm] = useState('')
  const [resultadosFuncaoAdm, setResultadosFuncaoAdm] = useState<{ id: number; nome: string }[]>([])
  const [dataNascAdm, setDataNascAdm] = useState('')
  const selecionandoFuncaoRef = useRef(false)
  const funcaoRef = useRef<NodeJS.Timeout | null>(null)

  const [tipoASO, setTipoASO] = useState('periodico')
  const [dataRealizacao, setDataRealizacao] = useState(new Date().toISOString().split('T')[0])
  const [examesCompl, setExamesCompl] = useState<ExameCompl[]>([])
  const [carregandoExames, setCarregandoExames] = useState(false)
  const [gerandoPDF, setGerandoPDF] = useState(false)
  const [fichaAtiva, setFichaAtiva] = useState<TipoFicha | null>(null)
  const [empresa, setEmpresa] = useState<Empresa | null>(null)
  const [medico, setMedico] = useState<Medico | null>(null)

  const formInicial: FormASO = {
    tipo_admissional: false, tipo_periodico: true, tipo_demissional: false, tipo_retorno: false, tipo_mudanca_risco: false,
    nome: '', matricula: '', data_nascimento: '', idade: '', sexo: '', estado_civil: '', data_admissao: '', funcao: '',
    conducao: 'NÃO', rg: '', rg_orgao: '', rg_uf: '', cpf: '', pcd: 'NÃO', gse: '', setor: '',
    risco_fisico: false, risco_fisico_desc: '', risco_quimico: false, risco_quimico_desc: '',
    risco_biologico: false, risco_biologico_desc: '', risco_ergonomico: false, risco_ergonomico_desc: '',
    risco_acidente: false, risco_acidente_desc: '', sem_risco: false,
    exames: ['', '', '', '', '', '', '', ''],
    exames_datas: ['', '', '', '', '', '', '', ''],
    apto: false, inapto: false,
    altura_apto: false, altura_inapto: false, altura_na: true,
    conducao_apto: false, conducao_inapto: false, conducao_na: true,
    confinado_apto: false, confinado_inapto: false, confinado_na: true,
    quimico_apto: false, quimico_inapto: false, quimico_na: true,
    local: '', data_ass: '', isManual: false,
  }
  const [form, setForm] = useState<FormASO>(formInicial)

  // NR35: colaborador trabalha em altura se altura_na === false OU exame de altura detectado
  const precisaAltura = !form.altura_na ||
    examesCompl.some(e => e.nome.toUpperCase().includes('ALTURA') || e.nome.toUpperCase().includes('NR 35'))

  useEffect(() => {
    supabase.from('configuracoes_empresa').select('*').limit(1).single().then(({ data }) => { if (data) setEmpresa(data) })
    supabase.from('medicos_aso').select('*').eq('ativo', true).single().then(({ data }) => { if (data) setMedico(data) })
  }, [])

  useEffect(() => {
    if (modoASO !== 'ativos') return
    if (selecionandoRef.current) { selecionandoRef.current = false; return }
    if (busca.length < 2) { setResultados([]); return }
    if (buscaRef.current) clearTimeout(buscaRef.current)
    buscaRef.current = setTimeout(async () => {
      const { data } = await supabase.from('colaboradores').select('matricula, nome').or(`nome.ilike.%${busca}%,matricula.ilike.%${busca}%`).order('nome').limit(10)
      setResultados(data || [])
    }, 300)
  }, [busca, modoASO])

  useEffect(() => {
    if (modoASO !== 'admissional') return
    if (selecionandoFuncaoRef.current) { selecionandoFuncaoRef.current = false; return }
    if (buscaFuncaoAdm.length < 2) { setResultadosFuncaoAdm([]); return }
    if (funcaoRef.current) clearTimeout(funcaoRef.current)
    funcaoRef.current = setTimeout(async () => {
      const { data } = await supabase.from('funcoes').select('id, nome').ilike('nome', `%${buscaFuncaoAdm}%`).order('nome').limit(10)
      setResultadosFuncaoAdm(data || [])
    }, 300)
  }, [buscaFuncaoAdm, modoASO])

  async function selecionarColab(mat: string, nome: string) {
    selecionandoRef.current = true
    setResultados([]); setBusca(nome)
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

  async function selecionarFuncaoAdm(funcaoId: number, funcaoNome: string) {
    selecionandoFuncaoRef.current = true
    setResultadosFuncaoAdm([]); setBuscaFuncaoAdm(funcaoNome)
    const { data: riscos } = await supabase.from('riscos_ocupacionais').select('*').ilike('funcao', funcaoNome).limit(1).maybeSingle()
    const auxGerais = isAuxServicosGerais(funcaoNome)
    const conducaoSim = form.conducao === 'SIM'
    const updates: Partial<FormASO> = {
      funcao: funcaoNome,
      confinado_na: true, confinado_apto: false, confinado_inapto: false,
      quimico_na: !auxGerais, quimico_apto: false, quimico_inapto: false,
      altura_na: true, altura_apto: false, altura_inapto: false,
      conducao_na: !conducaoSim, conducao_apto: false, conducao_inapto: false,
    }
    if (riscos) {
      const gseSetor = (await supabase.from('gses').select('setor').eq('id', riscos.gse_id).single()).data?.setor || ''
      Object.assign(updates, {
        gse: String(riscos.gse_id), setor: gseSetor,
        risco_fisico: !naoSeAplica(riscos.fisico), risco_fisico_desc: riscos.fisico || '',
        risco_quimico: !naoSeAplica(riscos.quimico), risco_quimico_desc: riscos.quimico || '',
        risco_biologico: !naoSeAplica(riscos.biologico), risco_biologico_desc: riscos.biologico || '',
        risco_ergonomico: !naoSeAplica(riscos.ergonomico), risco_ergonomico_desc: riscos.ergonomico || '',
        risco_acidente: !naoSeAplica(riscos.acidente), risco_acidente_desc: riscos.acidente || '',
      })
      setForm(f => ({ ...f, ...updates }))
      await buscarExamesManual(riscos.gse_id, tipoASO)
    } else {
      setForm(f => ({ ...f, ...updates }))
    }
  }

  async function calcularAptidao(colab: Colaborador, conducaoSim: boolean): Promise<Partial<FormASO>> {
    const { data: nr35 } = await supabase.from('registros_exames')
      .select('id').eq('matricula_colaborador', colab.matricula).eq('regra_id', 8).eq('is_atual', true).maybeSingle()
    const auxGerais = isAuxServicosGerais(colab.funcao || '')
    return {
      altura_na: !nr35, altura_apto: false, altura_inapto: false,
      conducao_na: !conducaoSim, conducao_apto: false, conducao_inapto: false,
      confinado_na: true, confinado_apto: false, confinado_inapto: false,
      quimico_na: !auxGerais, quimico_apto: false, quimico_inapto: false,
    }
  }

  async function preencherForm(colab: Colaborador, tipo: string) {
    let riscos: RiscoOcupacional = { acidente: null, ergonomico: null, fisico: null, quimico: null, biologico: null }
    if (colab.gse && colab.funcao) {
      const { data: r } = await supabase.from('riscos_ocupacionais').select('*').eq('gse_id', colab.gse).ilike('funcao', colab.funcao).maybeSingle()
      if (r) riscos = r
    }
    const idade = calcularIdade(colab.data_nascimento)
    const conducaoSim = !!colab.numero_cnh
    const aptidao = await calcularAptidao(colab, conducaoSim)
    setForm(f => ({
      ...f,
      tipo_admissional: tipo === 'admissional', tipo_periodico: tipo === 'periodico',
      tipo_demissional: tipo === 'demissional', tipo_retorno: tipo === 'retorno', tipo_mudanca_risco: tipo === 'mudanca_risco',
      nome: colab.nome, matricula: colab.matricula,
      data_nascimento: formatarData(colab.data_nascimento),
      idade: idade !== null ? String(idade) : '',
      sexo: colab.sexo || '', estado_civil: colab.estado_civil || '',
      data_admissao: formatarData(colab.data_admissao),
      funcao: colab.funcao || '', conducao: conducaoSim ? 'SIM' : 'NÃO',
      rg: colab.rg || '', rg_orgao: colab.rg_orgao || '', rg_uf: colab.rg_uf || '',
      cpf: colab.cpf || '', pcd: 'NÃO',
      gse: colab.gse ? String(colab.gse) : '', setor: colab.gse_setor || '',
      risco_fisico: !naoSeAplica(riscos.fisico), risco_fisico_desc: riscos.fisico || '',
      risco_quimico: !naoSeAplica(riscos.quimico), risco_quimico_desc: riscos.quimico || '',
      risco_biologico: !naoSeAplica(riscos.biologico), risco_biologico_desc: riscos.biologico || '',
      risco_ergonomico: !naoSeAplica(riscos.ergonomico), risco_ergonomico_desc: riscos.ergonomico || '',
      risco_acidente: !naoSeAplica(riscos.acidente), risco_acidente_desc: riscos.acidente || '',
      local: '', isManual: false, ...aptidao,
    }))
  }

  function processarExames(lista: ExameCompl[]) {
    const linhas = lista.map(e => e.nome)
    const datas = lista.map(e => isExameBienal(e.nome) && isDentro2Anos(e.ultima_data) ? formatarData(e.ultima_data) : '')
    while (linhas.length < 8) { linhas.push(''); datas.push('') }
    return { linhas: linhas.slice(0, 8), datas: datas.slice(0, 8) }
  }

  async function buscarExames(colab: Colaborador, tipo: string) {
    if (!colab.gse) { setExamesCompl([]); return }
    setCarregandoExames(true)
    const campoMap: Record<string, string> = { admissional: 'no_adm', periodico: 'no_per', retorno: 'no_ret', mudanca_risco: 'no_mro', demissional: 'no_dem' }
    const campo = campoMap[tipo]; if (!campo) { setExamesCompl([]); setCarregandoExames(false); return }
    const { data: gseEx } = await supabase.from('gse_exames').select(`tipo_exame_id, ${campo}, tipos_exame_medico(id, nome)`).eq('gse_id', colab.gse).eq(campo, true)
    if (!gseEx?.length) { setExamesCompl([]); setCarregandoExames(false); return }
    const tipoIds = gseEx.map((g: any) => g.tipo_exame_id)
    const { data: ultimos } = await supabase.from('exames_aso').select('tipo_exame_id, data_realizacao').eq('matricula_colaborador', colab.matricula).in('tipo_exame_id', tipoIds).order('data_realizacao', { ascending: false })
    const ultimoMap: Record<number, string> = {}
    ;(ultimos || []).forEach((u: any) => { if (!ultimoMap[u.tipo_exame_id]) ultimoMap[u.tipo_exame_id] = u.data_realizacao })
    const lista: ExameCompl[] = gseEx.map((g: any) => ({ nome: g.tipos_exame_medico?.nome || '', ultima_data: ultimoMap[g.tipo_exame_id] || null }))
    setExamesCompl(lista)
    const { linhas, datas } = processarExames(lista)
    setForm(f => ({ ...f, exames: linhas, exames_datas: datas }))
    setCarregandoExames(false)
  }

  async function buscarExamesManual(gseId: number, tipo: string) {
    setCarregandoExames(true)
    const campoMap: Record<string, string> = { admissional: 'no_adm', periodico: 'no_per', retorno: 'no_ret', mudanca_risco: 'no_mro', demissional: 'no_dem' }
    const campo = campoMap[tipo]; if (!campo) { setExamesCompl([]); setCarregandoExames(false); return }
    const { data: gseEx } = await supabase.from('gse_exames').select(`tipo_exame_id, ${campo}, tipos_exame_medico(id, nome)`).eq('gse_id', gseId).eq(campo, true)
    if (!gseEx?.length) { setExamesCompl([]); setCarregandoExames(false); return }
    const lista: ExameCompl[] = gseEx.map((g: any) => ({ nome: g.tipos_exame_medico?.nome || '', ultima_data: null }))
    setExamesCompl(lista)
    const { linhas, datas } = processarExames(lista)
    setForm(f => ({ ...f, exames: linhas, exames_datas: datas }))
    setCarregandoExames(false)
  }

  async function handleTipoChange(novoTipo: string) {
    setTipoASO(novoTipo)
    setForm(f => ({ ...f, tipo_admissional: novoTipo === 'admissional', tipo_periodico: novoTipo === 'periodico', tipo_demissional: novoTipo === 'demissional', tipo_retorno: novoTipo === 'retorno', tipo_mudanca_risco: novoTipo === 'mudanca_risco' }))
    if (modoASO === 'ativos' && colabSel) { await preencherForm(colabSel, novoTipo); await buscarExames(colabSel, novoTipo) }
    else if (modoASO === 'admissional' && form.gse) { await buscarExamesManual(parseInt(form.gse), novoTipo) }
  }

  function switchModo(modo: 'ativos' | 'admissional') {
    setModoASO(modo); setExamesCompl([]); setCarregandoExames(false)
    if (modo === 'admissional') {
      setColabSel(null); setBusca(''); setResultados([])
      setBuscaFuncaoAdm(''); setResultadosFuncaoAdm([])
      setDataNascAdm(''); setTipoASO('admissional')
      setForm({ ...formInicial, tipo_admissional: true, tipo_periodico: false, isManual: true })
    } else {
      setBuscaFuncaoAdm(''); setResultadosFuncaoAdm([])
      setDataNascAdm(''); setTipoASO('periodico')
      setForm({ ...formInicial, isManual: false })
    }
  }

  async function gerarDownload(tipo: TipoFicha) {
    setGerandoPDF(true); setFichaAtiva(tipo)
    try {
      const baseNome = form.isManual
        ? `ADM_${form.nome.split(' ')[0]}`
        : `${form.matricula}_${form.nome.split(' ')[0]}`
      const dataStr = new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')

      let docEl: any
      let filename: string

      if (tipo === 'aso') {
        docEl = <ASODocument form={form} empresa={empresa} medico={medico} />
        filename = `ASO_${baseNome}_${dataStr}.pdf`
      } else if (tipo === 'clinico') {
        docEl = <ExameClinicoDocument form={form} empresa={empresa} medico={medico} />
        filename = `ExameClinico_${baseNome}_${dataStr}.pdf`
      } else {
        docEl = <TrabalhoAlturaDocument form={form} empresa={empresa} medico={medico} />
        filename = `TrabalhoAltura_${baseNome}_${dataStr}.pdf`
      }

      const blob = await pdf(docEl).toBlob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = filename; a.click()
      URL.revokeObjectURL(url)
    } finally { setGerandoPDF(false); setFichaAtiva(null) }
  }

  const canGenerate = modoASO === 'ativos' ? !!colabSel : (!!form.nome && !!form.cpf && !!form.funcao)
  const inp: React.CSSProperties = { width: '100%', height: 36, border: '1px solid #e0e0e0', borderRadius: 8, padding: '0 10px', fontSize: 13, outline: 'none', backgroundColor: 'white', boxSizing: 'border-box' }
  const lbl: React.CSSProperties = { fontSize: 11, color: '#666', marginBottom: 3, display: 'block', fontWeight: 500 }

  function Campo({ label, valor, onChange, bold, flex, w }: { label?: string; valor: string; onChange: (v: string) => void; bold?: boolean; flex?: number; w?: number }) {
    return (
      <div style={{ flex: flex || undefined, width: w, marginRight: 8 }}>
        {label && <span style={{ fontSize: 9, color: '#666', display: 'block', marginBottom: 1 }}>{label}</span>}
        <input value={valor} onChange={e => onChange(e.target.value)} style={{ width: '100%', border: 'none', borderBottom: '1px solid #666', background: 'transparent', outline: 'none', fontSize: 9, fontWeight: bold ? 700 : 400, fontFamily: 'Arial, sans-serif', padding: '1px 2px', boxSizing: 'border-box' }} />
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

  const btnPrimario = (disabled: boolean): React.CSSProperties => ({
    width: '100%', height: 42, backgroundColor: disabled ? '#e0e0e0' : COR, color: disabled ? '#aaa' : 'white',
    border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
  })
  const btnSecundario = (cor: string, bg: string, borda: string): React.CSSProperties => ({
    flex: 1, height: 38, backgroundColor: bg, color: cor, border: `1.5px solid ${borda}`,
    borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
  })

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', display: 'flex', gap: 0, height: '100%', overflow: 'hidden' }}>

      {/* ─── PAINEL ESQUERDO ─── */}
      <div style={{ width: '30%', minWidth: 260, flexShrink: 0, overflowY: 'auto', padding: '0 16px 24px 0', borderRight: '1px solid #f0f0f0' }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: '#1a1a1a', margin: '0 0 14px' }}>Gerar ASO</h2>

        {/* ABAS */}
        <div style={{ display: 'flex', marginBottom: 18, border: '1px solid #e0e0e0', borderRadius: 10, overflow: 'hidden' }}>
          {(['ativos', 'admissional'] as const).map(modo => (
            <button key={modo} onClick={() => switchModo(modo)} style={{ flex: 1, height: 36, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, backgroundColor: modoASO === modo ? COR : 'white', color: modoASO === modo ? 'white' : '#666', transition: 'all 0.15s' }}>
              {modo === 'ativos' ? 'ATIVOS' : 'ADMISSIONAL'}
            </button>
          ))}
        </div>

        {/* ── ABA ATIVOS ── */}
        {modoASO === 'ativos' && (
          <>
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
                    <span style={{ color: '#333' }}>{e.nome}{isExameBienal(e.nome) && <span style={{ fontSize: 9, color: COR, marginLeft: 4 }}>bienal</span>}</span>
                    <span style={{ color: e.ultima_data ? (isDentro2Anos(e.ultima_data) ? '#16a34a' : '#c2410c') : '#aaa', fontWeight: 500, fontSize: 10, marginLeft: 6, whiteSpace: 'nowrap' }}>
                      {e.ultima_data ? formatarData(e.ultima_data) : 'Sem registro'}
                    </span>
                  </div>
                ))}
                {carregandoExames && <p style={{ fontSize: 11, color: '#aaa', margin: 0 }}>Carregando...</p>}
              </div>
            )}
          </>
        )}

        {/* ── ABA ADMISSIONAL ── */}
        {modoASO === 'admissional' && (
          <>
            <div style={{ marginBottom: 12 }}><label style={lbl}>Nome completo *</label><input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="Nome do colaborador" style={inp} /></div>
            <div style={{ marginBottom: 12 }}><label style={lbl}>CPF *</label><input value={form.cpf} onChange={e => setForm(f => ({ ...f, cpf: e.target.value }))} placeholder="000.000.000-00" style={inp} /></div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={lbl}>Data de Nascimento</label>
                <input type="date" value={dataNascAdm} onChange={e => { const val = e.target.value; setDataNascAdm(val); const idadeCalc = calcularIdade(val); setForm(f => ({ ...f, data_nascimento: formatarData(val), idade: idadeCalc !== null ? String(idadeCalc) : '' })) }} style={inp} />
              </div>
              <div style={{ width: 62 }}><label style={lbl}>Idade</label><input value={form.idade} readOnly style={{ ...inp, backgroundColor: '#f5f5f5', color: '#888', cursor: 'default' }} /></div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <div style={{ flex: 1 }}><label style={lbl}>Sexo</label><select value={form.sexo} onChange={e => setForm(f => ({ ...f, sexo: e.target.value }))} style={inp}><option value="">Selecione...</option><option value="M">Masculino</option><option value="F">Feminino</option></select></div>
              <div style={{ flex: 1 }}><label style={lbl}>Estado Civil</label><select value={form.estado_civil} onChange={e => setForm(f => ({ ...f, estado_civil: e.target.value }))} style={inp}><option value="">Selecione...</option><option value="Solteiro(a)">Solteiro(a)</option><option value="Casado(a)">Casado(a)</option><option value="Divorciado(a)">Divorciado(a)</option><option value="Viúvo(a)">Viúvo(a)</option><option value="União Estável">União Estável</option></select></div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <div style={{ flex: 1 }}><label style={lbl}>P.C.D</label><select value={form.pcd} onChange={e => setForm(f => ({ ...f, pcd: e.target.value }))} style={inp}><option value="NÃO">Não</option><option value="SIM">Sim</option></select></div>
              <div style={{ flex: 1 }}><label style={lbl}>Condução</label><select value={form.conducao} onChange={e => { const simVal = e.target.value === 'SIM'; setForm(f => ({ ...f, conducao: e.target.value, conducao_na: !simVal, conducao_apto: false, conducao_inapto: false })) }} style={inp}><option value="NÃO">Não</option><option value="SIM">Sim</option></select></div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <div style={{ flex: 1 }}><label style={lbl}>RG</label><input value={form.rg} onChange={e => setForm(f => ({ ...f, rg: e.target.value }))} style={{ ...inp, fontSize: 12 }} /></div>
              <div style={{ width: 80 }}><label style={lbl}>Órgão Exp.</label><input value={form.rg_orgao} onChange={e => setForm(f => ({ ...f, rg_orgao: e.target.value }))} style={{ ...inp, fontSize: 12 }} /></div>
              <div style={{ width: 52 }}><label style={lbl}>UF</label><input value={form.rg_uf} onChange={e => setForm(f => ({ ...f, rg_uf: e.target.value.toUpperCase() }))} maxLength={2} style={{ ...inp, fontSize: 12 }} /></div>
            </div>
            <div style={{ marginBottom: 12, position: 'relative' }}>
              <label style={lbl}>Função * <span style={{ color: '#aaa', fontWeight: 400 }}>(preenche riscos e exames)</span></label>
              <input value={buscaFuncaoAdm} onChange={e => setBuscaFuncaoAdm(e.target.value)} placeholder="Digite para buscar função..." style={inp} />
              {resultadosFuncaoAdm.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, border: '1px solid #e0e0e0', borderRadius: 8, backgroundColor: 'white', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', maxHeight: 180, overflowY: 'auto' }}>
                  {resultadosFuncaoAdm.map(fn => (
                    <div key={fn.id} onClick={() => selecionarFuncaoAdm(fn.id, fn.nome)} style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f5f5f5', fontSize: 13, color: '#333' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = '#fdf2f5'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'white'}>{fn.nome}</div>
                  ))}
                </div>
              )}
            </div>
            {form.gse && <div style={{ backgroundColor: '#fdf2f5', borderRadius: 8, padding: '8px 12px', marginBottom: 12, border: '1px solid #f5d0da', fontSize: 11 }}><span style={{ color: COR, fontWeight: 600 }}>GSE {form.gse}</span>{form.setor && <span style={{ color: '#666' }}> — {form.setor}</span>}</div>}
            <div style={{ marginBottom: 12 }}><label style={lbl}>Tipo de ASO *</label><select value={tipoASO} onChange={e => handleTipoChange(e.target.value)} style={inp}>{TIPOS_ASO.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
            <div style={{ marginBottom: 14 }}><label style={lbl}>Data de Realização *</label><input type="date" value={dataRealizacao} onChange={e => setDataRealizacao(e.target.value)} style={inp} /></div>
            {examesCompl.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: '#333', margin: '0 0 8px' }}>Exames — {form.funcao}</p>
                {examesCompl.map((e, i) => <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 8px', backgroundColor: 'white', borderRadius: 6, border: '1px solid #f0f0f0', fontSize: 11, marginBottom: 3 }}><span style={{ color: '#333' }}>{e.nome}</span><span style={{ color: '#aaa', fontSize: 10 }}>Sem registro</span></div>)}
              </div>
            )}
          </>
        )}

        {/* ─── BOTÕES PDF ─── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>

          {/* ASO principal */}
          <button onClick={() => gerarDownload('aso')} disabled={!canGenerate || gerandoPDF} style={btnPrimario(!canGenerate || gerandoPDF)}>
            {gerandoPDF && fichaAtiva === 'aso' ? '⏳ Gerando...' : '⬇ Download ASO'}
          </button>

          {/* Fichas extras — só quando colaborador selecionado */}
          {canGenerate && (
            <div style={{ display: 'flex', gap: 8 }}>
              {/* Exame Clínico — sempre */}
              <button onClick={() => gerarDownload('clinico')} disabled={gerandoPDF} style={btnSecundario(COR, 'white', COR)}>
                {gerandoPDF && fichaAtiva === 'clinico' ? '⏳' : '📋'} Exame Clínico
              </button>

              {/* Trabalho em Altura — só se precisaAltura */}
              {precisaAltura && (
                <button onClick={() => gerarDownload('altura')} disabled={gerandoPDF} style={btnSecundario('#b45309', '#fffbeb', '#d97706')}>
                  {gerandoPDF && fichaAtiva === 'altura' ? '⏳' : '⚡'} Altura
                </button>
              )}
            </div>
          )}

          {/* Badge NR35 */}
          {precisaAltura && canGenerate && (
            <p style={{ fontSize: 10, color: '#b45309', textAlign: 'center', margin: 0, backgroundColor: '#fffbeb', borderRadius: 6, padding: '4px 8px', border: '1px solid #fde68a' }}>
              ⚡ Colaborador trabalha em altura — imprimir Trabalho em Altura
            </p>
          )}

          {!canGenerate && (
            <p style={{ fontSize: 11, color: '#aaa', textAlign: 'center', margin: 0 }}>
              {modoASO === 'ativos' ? 'Selecione um colaborador primeiro' : 'Preencha Nome, CPF e Função'}
            </p>
          )}
        </div>
      </div>

      {/* ─── PAINEL DIREITO — PREVIEW ─── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 0 24px 20px' }}>
        <div style={{ backgroundColor: 'white', padding: '10px 14px', maxWidth: 760, margin: '0 auto', border: '1px solid #aaa', fontFamily: 'Arial, sans-serif', fontSize: 9 }}>

          {/* CABEÇALHO */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #333', paddingBottom: 4, marginBottom: 4 }}>
            <div style={{ width: 90 }}>
              <img src="/logo-cgb.png" alt="CGB" style={{ height: 28, objectFit: 'contain' }} />
              <div style={{ fontSize: 8, color: '#555' }}>{empresa?.cnpj}</div>
              <div style={{ fontSize: 8, color: '#555' }}>{empresa?.telefone}</div>
            </div>
            <div style={{ flex: 1, textAlign: 'center' }}><div style={{ fontWeight: 700, fontSize: 11 }}>ATESTADO DE SAUDE OCUPACIONAL - ASO</div></div>
            <div style={{ width: 110, fontSize: 9 }}><div><strong>GSE: </strong>{form.gse}</div><div>Setor: {form.setor}</div></div>
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
            {!form.isManual && <Campo label="Matr.:" valor={form.matricula} onChange={v => setForm(f => ({ ...f, matricula: v }))} w={70} />}
            <Campo label="Data de Nasc." valor={form.data_nascimento} onChange={v => setForm(f => ({ ...f, data_nascimento: v }))} w={100} />
            <Campo label="Idade:" valor={form.idade} onChange={v => setForm(f => ({ ...f, idade: v }))} w={35} />
          </div>

          {/* LINHA 2 */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 3 }}>
            <Campo label="Sexo:" valor={form.sexo} onChange={v => setForm(f => ({ ...f, sexo: v }))} w={40} />
            <Campo label="Estado Civil:" valor={form.estado_civil} onChange={v => setForm(f => ({ ...f, estado_civil: v }))} w={80} />
            <Campo label="Data de Admissão:" valor={form.data_admissao} onChange={v => setForm(f => ({ ...f, data_admissao: v }))} w={80} />
            <Campo label="Função:" valor={form.funcao} onChange={v => { const auxGerais = isAuxServicosGerais(v); setForm(f => ({ ...f, funcao: v, quimico_na: !auxGerais, quimico_apto: auxGerais ? f.quimico_apto : false, quimico_inapto: auxGerais ? f.quimico_inapto : false })) }} bold flex={1} />
            <Campo label="Condução:" valor={form.conducao} onChange={v => { const simVal = v.toUpperCase() === 'SIM'; setForm(f => ({ ...f, conducao: v, conducao_na: !simVal, conducao_apto: simVal ? f.conducao_apto : false, conducao_inapto: simVal ? f.conducao_inapto : false })) }} w={50} />
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
              {[{ k: 'risco_fisico', dk: 'risco_fisico_desc', l: 'Riscos Físicos' }, { k: 'risco_quimico', dk: 'risco_quimico_desc', l: 'Riscos Químicos' }, { k: 'risco_biologico', dk: 'risco_biologico_desc', l: 'Riscos Biológicos' }, { k: 'risco_ergonomico', dk: 'risco_ergonomico_desc', l: 'Riscos Ergonômicos' }, { k: 'risco_acidente', dk: 'risco_acidente_desc', l: 'Riscos Acidentes / Mecânicos' }].map(r => (
                <tr key={r.k} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '3px 6px', borderRight: '1px solid #ccc' }}><CBVis checked={(form as any)[r.k]} onChange={v => setForm(f => ({ ...f, [r.k]: v }))} label={r.l} /></td>
                  <td style={{ padding: '3px 6px' }}><div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ color: '#888' }}>- </span><input value={(form as any)[r.dk]} onChange={e => setForm(f => ({ ...f, [r.dk]: e.target.value }))} placeholder="Descrição..." style={{ flex: 1, border: 'none', borderBottom: '1px solid #ccc', outline: 'none', fontSize: 9, fontFamily: 'Arial', background: 'transparent' }} /></div></td>
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
                <tr key={row}>{[row * 2, row * 2 + 1].map(i => (
                  <td key={i} style={{ width: '50%', padding: '2px 4px', borderBottom: '1px solid #eee' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ color: form.exames_datas[i] ? '#16a34a' : '#aaa', whiteSpace: 'nowrap', fontWeight: form.exames_datas[i] ? 600 : 400, fontSize: 8 }}>{form.exames_datas[i] || '____/____/______'}</span>
                      <input value={form.exames[i] || ''} onChange={e => { const arr = [...form.exames]; arr[i] = e.target.value; setForm(f => ({ ...f, exames: arr })) }} style={{ flex: 1, border: 'none', borderBottom: '1px solid #ccc', outline: 'none', fontSize: 9, background: 'transparent' }} placeholder="Nome do exame..." />
                      <span style={{ color: '#aaa', whiteSpace: 'nowrap', fontSize: 8 }}>____/____/______</span>
                    </div>
                  </td>
                ))}</tr>
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
                {[{ l: 'Trabalho em Altura (NR35)', k1: 'altura_apto', k2: 'altura_inapto', k3: 'altura_na' }, { l: 'Condução de Veículos', k1: 'conducao_apto', k2: 'conducao_inapto', k3: 'conducao_na' }, { l: 'Espaço Confinado (NR33)', k1: 'confinado_apto', k2: 'confinado_inapto', k3: 'confinado_na' }, { l: 'Contato com Produtos Químicos', k1: 'quimico_apto', k2: 'quimico_inapto', k3: 'quimico_na' }].map(row => (
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

          {/* LOCAL E DATA */}
          <div style={{ display: 'flex', alignItems: 'flex-end', marginBottom: 8, fontSize: 9 }}>
            <input value={form.local} onChange={e => setForm(f => ({ ...f, local: e.target.value }))} style={{ width: 140, border: 'none', borderBottom: '1px solid #333', outline: 'none', fontSize: 9, background: 'transparent', padding: '1px 2px' }} />
            <span style={{ marginBottom: 2, marginLeft: 8, marginRight: 8 }}> - </span>
            <div style={{ width: 30, borderBottom: '1px solid #333', height: 14 }} />
            <span style={{ marginBottom: 2, marginLeft: 4, marginRight: 4 }}> / </span>
            <div style={{ width: 30, borderBottom: '1px solid #333', height: 14 }} />
            <span style={{ marginBottom: 2, marginLeft: 4, marginRight: 4 }}> / </span>
            <div style={{ width: 40, borderBottom: '1px solid #333', height: 14 }} />
          </div>

          {/* RECIBO */}
          <div style={{ borderBottom: '1px solid #ccc', paddingBottom: 4, marginBottom: 8, fontSize: 9 }}>Recebi cópia do Atestado de Saúde Ocupacional - ASO</div>

          {/* ASSINATURAS */}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 9, marginBottom: 8, border: '1px solid #333' }}>
            <thead>
              <tr>{['Trabalhador(a)', 'Médico Examinador', 'Médico Responsável pelo PCMSO'].map((titulo, i) => <th key={i} style={{ border: '1px solid #333', padding: '3px 6px', fontWeight: 700, textAlign: 'left', width: '33.33%' }}>{titulo}</th>)}</tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ border: '1px solid #333', height: 50, padding: '3px 6px', verticalAlign: 'top' }} />
                <td style={{ border: '1px solid #333', height: 50, padding: '3px 6px', verticalAlign: 'top' }} />
                <td style={{ border: '1px solid #333', padding: '3px 6px', verticalAlign: 'top', textAlign: 'center' }}>
                  {[medico?.nome || '', medico?.especialidade || '', `CRM: ${medico?.crm || ''} . RQE N° ${medico?.rqe || ''}`, `FONE: ${medico?.telefone || ''}`].map((l, j) => <div key={j}>{l}</div>)}
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