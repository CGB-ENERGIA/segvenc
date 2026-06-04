import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSignedDownloadUrl } from '@/lib/r2'

const supabaseServer = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } }
)

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key')
  if (!key) return NextResponse.json({ error: 'key obrigatória' }, { status: 400 })

  const token = (req.headers.get('authorization') || '').replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'não autenticado' }, { status: 401 })

  const { data: { user }, error } = await supabaseServer.auth.getUser(token)
  if (error || !user?.email) return NextResponse.json({ error: 'sessão inválida' }, { status: 401 })

  const { data: perfil, error: perfilErr } = await supabaseServer
    .from('usuarios').select('nivel').eq('email', user.email).single()

  if (perfilErr || !perfil || perfil.nivel === 'visualizador') {
    return NextResponse.json({ error: 'Sem permissão para visualizar documentos.' }, { status: 403 })
  }

  const url = await getSignedDownloadUrl(key)
  return NextResponse.json({ url })
}