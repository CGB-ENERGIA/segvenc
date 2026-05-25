import { NextRequest, NextResponse } from 'next/server'
import { getSignedDownloadUrl } from '@/lib/r2'

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key')
  if (!key) return NextResponse.json({ error: 'key obrigatória' }, { status: 400 })

  const url = await getSignedDownloadUrl(key)
  return NextResponse.json({ url })
}