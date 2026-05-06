import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!, // <- server only
)

export async function POST(request: Request) {
  console.log('API chamada!')
  console.log('URL:', process.env.NEXT_PUBLIC_SUPABASE_URL)
  console.log('Service Key existe:', !!process.env.SUPABASE_SERVICE_ROLE_KEY)
  
  const { email, nome } = await request.json()

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { nome },
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // Enviar email para o usuário definir a senha
  await supabaseAdmin.auth.resetPasswordForEmail(email)

  return NextResponse.json({ user: data.user })
}