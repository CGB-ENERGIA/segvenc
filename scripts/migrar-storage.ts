import { config } from 'dotenv'
config({ path: '.env.local' }) // <-- Força a leitura do .env.local

import { createClient } from '@supabase/supabase-js'
import { uploadR2 } from '../src/lib/r2'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const arquivos = [
  'asos/123456/retorno/2026-05-21T17-48-41.pdf',
  'asos/123456/retorno/2026-05-21T17-47-13.pdf',
  'asos/123456/periodico/2026-05-21T17-46-01.pdf',
  '12345/2/2026-05-06T22-28-48.pdf',
  '12345/1/2026-05-06T16-44-07.pdf',
]

async function migrar() {
  for (const path of arquivos) {
    const { data, error } = await supabase.storage
      .from('documentos')
      .download(path)

    if (error || !data) {
      console.error(`Erro ao baixar: ${path}`, error)
      continue
    }

    const buffer = Buffer.from(await data.arrayBuffer())
    await uploadR2(path, buffer, 'application/pdf')
    console.log(`✅ Migrado: ${path}`)
  }
}

migrar()