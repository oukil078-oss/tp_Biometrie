import { NextRequest, NextResponse } from 'next/server'

function euclideanDistance(a: number[], b: number[]): number {
  return Math.sqrt(a.reduce((sum, val, i) => sum + Math.pow(val - b[i], 2), 0))
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { userId, embedding } = body
    if (!userId || !embedding) return NextResponse.json({ success: false, message: 'User ID and embedding required.' }, { status: 400 })

    const ep = process.env.APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1'
    const pid = process.env.APPWRITE_PROJECT_ID || ''
    const ak = process.env.APPWRITE_API_KEY || ''
    const dbid = process.env.APPWRITE_DATABASE_ID || 'biometrie_db'
    const bcid = process.env.APPWRITE_BIOMETRICS_COLLECTION_ID || 'biometric_profiles'
    const acid = process.env.APPWRITE_AUDIT_COLLECTION_ID || 'audit_logs'

    const profileUrl = ep + '/databases/' + dbid + '/collections/' + bcid + '/documents?queries=["equal(\'user_id\',\'' + userId + '\")]'
    const profileRes = await fetch(profileUrl, {
      headers: { 'X-Appwrite-Project': pid, 'X-Appwrite-Key': ak }
    })
    const profileData = await profileRes.json()
    if (!profileData.documents || profileData.documents.length === 0) return NextResponse.json({ success: false, message: 'No face profile found.', hasProfile: false }, { status: 404 })

    const profile = profileData.documents[0]
    const storedEmbedding = JSON.parse(profile.face_embedding)
    const similarity = euclideanDistance(embedding, storedEmbedding)
    const threshold = 0.6
    const isMatch = similarity < threshold

    const logAudit = async (eventType: string, details: string) => {
      try {
        const auditUrl = ep + '/databases/' + dbid + '/collections/' + acid + '/documents'
        await fetch(auditUrl, {
          method: 'POST',
          headers: { 'X-Appwrite-Project': pid, 'X-Appwrite-Key': ak, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            documentId: 'unique()',
            data: { user_id: userId, event_type: eventType, details, timestamp: new Date().toISOString(), ip_address: req.headers.get('x-forwarded-for') || 'unknown', user_agent: req.headers.get('user-agent') || 'unknown' }
          }),
        })
      } catch {}
    }

    if (isMatch) {
      const updUrl = ep + '/databases/' + dbid + '/collections/' + bcid + '/documents/' + profile.$id
      await fetch(updUrl, {
        method: 'PATCH',
        headers: { 'X-Appwrite-Project': pid, 'X-Appwrite-Key': ak, 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: { last_verification: new Date().toISOString() } }),
      })
      await logAudit('biometric_verification_success', 'Face verified (euclidean: ' + similarity.toFixed(4) + ')')
      return NextResponse.json({ success: true, message: 'Face verified successfully!', similarity: 1 - similarity }, { status: 200 })
    }

    await logAudit('biometric_verification_failed', 'Face verification failed (euclidean: ' + similarity.toFixed(4) + ')')
    return NextResponse.json({ success: false, message: 'Face verification failed.', similarity: 1 - similarity }, { status: 401 })
  } catch (e) {
    console.error('Verification error:', e)
    return NextResponse.json({ success: false, message: 'Unexpected error.' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const userId = url.searchParams.get('userId')
    if (!userId) return NextResponse.json({ success: false, message: 'User ID required.' }, { status: 400 })

    const ep = process.env.APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1'
    const pid = process.env.APPWRITE_PROJECT_ID || ''
    const ak = process.env.APPWRITE_API_KEY || ''
    const dbid = process.env.APPWRITE_DATABASE_ID || 'biometrie_db'
    const bcid = process.env.APPWRITE_BIOMETRICS_COLLECTION_ID || 'biometric_profiles'

    const profileUrl = ep + '/databases/' + dbid + '/collections/' + bcid + '/documents?queries=["equal(\'user_id\',\'' + userId + '\")]'
    const res = await fetch(profileUrl, {
      headers: { 'X-Appwrite-Project': pid, 'X-Appwrite-Key': ak }
    })
    const data = await res.json()
    const hasProfile = data.documents && data.documents.length > 0
    return NextResponse.json({ success: true, hasProfile, profile: hasProfile ? data.documents[0] : null }, { status: 200 })
  } catch (e) {
    console.error('Profile check error:', e)
    return NextResponse.json({ success: false, message: 'Failed to check profile.' }, { status: 500 })
  }
}
