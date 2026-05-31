import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { userId, username, embedding, imageData } = body

    if (!userId || !embedding || !Array.isArray(embedding))
      return NextResponse.json({ success: false, message: 'Invalid enrollment data.' }, { status: 400 })

    const ep = process.env.APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1'
    const pid = process.env.APPWRITE_PROJECT_ID || ''
    const ak = process.env.APPWRITE_API_KEY || ''
    const dbid = process.env.APPWRITE_DATABASE_ID || 'biometrie_db'
    const bcid = process.env.APPWRITE_BIOMETRICS_COLLECTION_ID || 'biometric_profiles'

    // Check existing profile
    const checkUrl = ep + '/databases/' + dbid + '/collections/' + bcid + '/documents?queries=["equal(\'user_id\',\'' + userId + '\")]'
    const existingRes = await fetch(checkUrl, {
      headers: { 'X-Appwrite-Project': pid, 'X-Appwrite-Key': ak }
    })
    const existing = await existingRes.json()

    if (existing.documents && existing.documents.length > 0) {
      const profileId = existing.documents[0].$id
      const updUrl = ep + '/databases/' + dbid + '/collections/' + bcid + '/documents/' + profileId
      const upd = await fetch(updUrl, {
        method: 'PATCH',
        headers: { 'X-Appwrite-Project': pid, 'X-Appwrite-Key': ak, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: { face_embedding: JSON.stringify(embedding), enrollment_date: new Date().toISOString(), last_verification: new Date().toISOString(), status: 'active' }
        }),
      })
      if (upd.ok) return NextResponse.json({ success: true, message: 'Face re-enrollment successful!', profileId }, { status: 200 })
    }

    // Create new profile
    const createUrl = ep + '/databases/' + dbid + '/collections/' + bcid + '/documents'
    const createRes = await fetch(createUrl, {
      method: 'POST',
      headers: { 'X-Appwrite-Project': pid, 'X-Appwrite-Key': ak, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        documentId: 'unique()',
        data: { user_id: userId, username: username || '', face_embedding: JSON.stringify(embedding), enrollment_date: new Date().toISOString(), last_verification: new Date().toISOString(), status: 'active' }
      }),
    })
    const profileData = await createRes.json()

    if (profileData.$id) {
      // Log audit
      try {
        const acid = process.env.APPWRITE_AUDIT_COLLECTION_ID || 'audit_logs'
        const auditUrl = ep + '/databases/' + dbid + '/collections/' + acid + '/documents'
        await fetch(auditUrl, {
          method: 'POST',
          headers: { 'X-Appwrite-Project': pid, 'X-Appwrite-Key': ak, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            documentId: 'unique()',
            data: { user_id: userId, event_type: 'biometric_enrollment', details: 'Face enrolled for ' + username, timestamp: new Date().toISOString(), ip_address: req.headers.get('x-forwarded-for') || 'unknown', user_agent: req.headers.get('user-agent') || 'unknown' }
          }),
        })
      } catch {}
      return NextResponse.json({ success: true, message: 'Face enrollment successful!', profileId: profileData.$id }, { status: 201 })
    }
    return NextResponse.json({ success: false, message: 'Failed to create profile.' }, { status: 500 })
  } catch (e) {
    console.error('Enrollment error:', e)
    return NextResponse.json({ success: false, message: 'Unexpected error.' }, { status: 500 })
  }
}
