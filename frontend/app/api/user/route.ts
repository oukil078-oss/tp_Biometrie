import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const userId = url.searchParams.get('userId')
    if (!userId) return NextResponse.json({ success: false, message: 'User ID required.' }, { status: 400 })

    const ep = process.env.APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1'
    const pid = process.env.APPWRITE_PROJECT_ID || ''
    const ak = process.env.APPWRITE_API_KEY || ''
    const dbid = process.env.APPWRITE_DATABASE_ID || 'biometrie_db'

    // Fetch user
    const userUrl = ep + '/databases/' + dbid + '/collections/' + (process.env.APPWRITE_USERS_COLLECTION_ID || 'users') + '/documents/' + userId
    const userRes = await fetch(userUrl, {
      headers: { 'X-Appwrite-Project': pid, 'X-Appwrite-Key': ak }
    })
    if (!userRes.ok) return NextResponse.json({ success: false, message: 'User not found.' }, { status: 404 })
    const userData = await userRes.json()

    // Fetch biometric profile
    const bioUrl = ep + '/databases/' + dbid + '/collections/' + (process.env.APPWRITE_BIOMETRICS_COLLECTION_ID || 'biometric_profiles') + '/documents?queries=["equal(\'user_id\',\'' + userId + '\")]'
    const bioRes = await fetch(bioUrl, {
      headers: { 'X-Appwrite-Project': pid, 'X-Appwrite-Key': ak }
    })
    const bioData = await bioRes.json()
    const biometricProfile = bioData.documents && bioData.documents[0] ? bioData.documents[0] : null

    // Fetch audit logs
    const auditUrl = ep + '/databases/' + dbid + '/collections/' + (process.env.APPWRITE_AUDIT_COLLECTION_ID || 'audit_logs') + '/documents?queries=["equal(\'user_id\',\'' + userId + '\")","orderDesc(\'timestamp\')","limit(10)"]'
    const auditRes = await fetch(auditUrl, {
      headers: { 'X-Appwrite-Project': pid, 'X-Appwrite-Key': ak }
    })
    const auditData = await auditRes.json()
    const auditLogs = auditData.documents || []

    // Remove sensitive fields
    const { password, salt, face_embedding, ...safeUserData } = userData

    return NextResponse.json({ success: true, user: safeUserData, biometricProfile, auditLogs }, { status: 200 })
  } catch (e) {
    console.error('User fetch error:', e)
    return NextResponse.json({ success: false, message: 'Failed to fetch user data.' }, { status: 500 })
  }
}
