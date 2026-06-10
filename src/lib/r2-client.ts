// src/lib/r2-client.ts
// Envia um arquivo DIRETO pro R2 via URL assinada (PUT).
// O arquivo não passa pelo nosso servidor — por isso não há mais o erro 413 da Vercel.
import { supabase } from '@/lib/supabase'

export async function uploadParaR2(arquivo: File, key: string): Promise<void> {
  // 1) Token da sessão (a rota /api/r2/upload-url exige autenticação)
  const { data: { session } } = await supabase.auth.getSession()

  // 2) Pede a URL assinada pra rota (manda só a key, SEM o arquivo)
  const resUrl = await fetch('/api/r2/upload-url', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.access_token ?? ''}`,
    },
    body: JSON.stringify({ key }),
  })
  if (!resUrl.ok) {
    const err = await resUrl.json().catch(() => ({}))
    throw new Error(err.error || 'Não foi possível gerar a URL de upload.')
  }
  const { url } = await resUrl.json()

  // 3) Envia o arquivo DIRETO pro R2
  const resPut = await fetch(url, { method: 'PUT', body: arquivo })
  if (!resPut.ok) {
    throw new Error('Falha no upload para o R2')
  }
}