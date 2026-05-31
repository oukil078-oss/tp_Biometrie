import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { userId } = body
    if (userId) {
      const ep = process.env.APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1'
      const pid = process.env.APPWRITE_PROJECT_ID || ''
      const ak = process.env.APPWRITE_API_KEY || ''
      const dbid = process.env.APPWRITE_DATABASE_ID || 'biometrie_db'
      await fetch(`${ep}/databases/${dbid}/collections/${process.env.APPWRITE_USERS_COLLECTION_ID || 'users'}/docs/${userId}`, {
        method: 'PATCH',
        headers: { 'X-Appwrite-Project': pid, 'X-Appwrite-Key': ak, 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: { last_login: '' } }),
      })
      try {
        await fetch(`${ep}/databases/${dbid}/collections/${process.env.APPWRITE_AUDIT_COLLECTION_ID || 'audit_logs'}/docs`, {
          method: 'POST',
          headers: { 'X-Appwrite-Project': pid, 'X-Appwrite-Key': ak, 'Content-Type': 'application/json' },
          body: JSON.stringify({ documentId: 'unique()', data: { user_id: userId, event_type: 'logout', details: 'User logged out', timestamp: new Date().toISOString(), ip_address: req.headers.get('x-forwarded-for') || 'unknown', user_agent: req.headers.get('user-agent') || 'unknown' } }),
        })
      } catch {}
    }
    return NextResponse.json({ success: true }, { status: 200 })
  } catch (e) {
    console.error('Logout error:', e)
    return NextResponse.json({ success: false, message: 'Logout failed.' }, { status: 500 })
  }
}
