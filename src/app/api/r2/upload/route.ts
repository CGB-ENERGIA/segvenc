import { NextRequest, NextResponse } from 'next/server'
import { uploadR2 } from '@/lib/r2'

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const file = formData.get('file') as File
  const key = formData.get('key') as string

  if (!file || !key) {
    return NextResponse.json({ error: 'file e key obrigatórios' }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  await uploadR2(key, buffer, file.type)

  return NextResponse.json({ key })
}