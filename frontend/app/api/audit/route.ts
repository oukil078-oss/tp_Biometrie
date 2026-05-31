import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { userId, eventType, details } = body
    if (!userId || !eventType) return NextResponse.json({ success: false, message: 'User ID and event type required.' }, { status: 400 })

    const ep = process.env.APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1'
    const pid = process.env.APPWRITE_PROJECT_ID || ''
    const ak = process.env.APPWRITE_API_KEY || ''
    const dbid = process.env.APPWRITE_DATABASE_ID || 'biometrie_db'
    const acid = process.env.APPWRITE_AUDIT_COLLECTION_ID || 'audit_logs'

    await fetch(`${ep}/databases/${dbid}/collections/${acid}/docs`, {
      method: 'POST',
      headers: { 'X-Appwrite-Project': pid, 'X-Appwrite-Key': ak, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        documentId: 'unique()',
        data: { user_id: userId, event_type: eventType, details: details || '', timestamp: new Date().toISOString(), ip_address: req.headers.get('x-forwarded-for') || 'unknown', user_agent: req.headers.get('user-agent') || 'unknown' }
      }),
    })
    return NextResponse.json({ success: true }, { status: 200 })
  } catch (e) {
    console.error('Audit error:', e)
    return NextResponse.json({ success: false, message: 'Failed to log audit event.' }, { status: 500 })
  }
}
