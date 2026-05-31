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
      const cid = process.env.APPWRITE_USERS_COLLECTION_ID || 'users'

      const updUrl = ep + '/databases/' + dbid + '/collections/' + cid + '/documents/' + userId
      await fetch(updUrl, {
        method: 'PATCH',
        headers: { 'X-Appwrite-Project': pid, 'X-Appwrite-Key': ak, 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: { last_login: '' } }),
      })

      try {
        const acid = process.env.APPWRITE_AUDIT_COLLECTION_ID || 'audit_logs'
        const auditUrl = ep + '/databases/' + dbid + '/collections/' + acid + '/documents'
        await fetch(auditUrl, {
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
