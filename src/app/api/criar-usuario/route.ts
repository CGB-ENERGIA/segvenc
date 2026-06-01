import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!, // <- server only
)

export async function POST(request: Request) {
  const { email, nome } = await request.json()

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: '12345678',
    email_confirm: true,
    user_metadata: { nome },
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ user: data.user })
}