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

    // Fetch user by ID
    const userUrl = ep + '/databases/' + dbid + '/collections/' + (process.env.APPWRITE_USERS_COLLECTION_ID || 'users') + '/documents/' + userId
    const userRes = await fetch(userUrl, {
      headers: { 'X-Appwrite-Project': pid, 'X-Appwrite-Key': ak }
    })
    if (!userRes.ok) return NextResponse.json({ success: false, message: 'User not found.' }, { status: 404 })
    const userData = await userRes.json()

    // Fetch biometric profiles
    const bioListUrl = ep + '/databases/' + dbid + '/collections/' + (process.env.APPWRITE_BIOMETRICS_COLLECTION_ID || 'biometric_profiles') + '/documents?limit=10000'
    const bioListRes = await fetch(bioListUrl, {
      headers: { 'X-Appwrite-Project': pid, 'X-Appwrite-Key': ak }
    })
    const bioListData = await bioListRes.json()
    const bioProfiles = bioListData.documents || []
    const biometricProfile = bioProfiles.find((p: any) => p.user_id === userId) || null

    // Fetch audit logs
    const auditListUrl = ep + '/databases/' + dbid + '/collections/' + (process.env.APPWRITE_AUDIT_COLLECTION_ID || 'audit_logs') + '/documents?limit=10000'
    const auditListRes = await fetch(auditListUrl, {
      headers: { 'X-Appwrite-Project': pid, 'X-Appwrite-Key': ak }
    })
    const auditListData = await auditListRes.json()
    const allAuditLogs = auditListData.documents || []
    const auditLogs = allAuditLogs.filter((log: any) => log.user_id === userId).sort((a: any, b: any) => {
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    }).slice(0, 10)

    // Remove sensitive fields
    const { password, salt, ...safeUserData } = userData
    const safeBio = biometricProfile ? { ...biometricProfile, face_embedding: undefined } : null

    return NextResponse.json({ success: true, user: safeUserData, biometricProfile: safeBio, auditLogs }, { status: 200 })
  } catch (e) {
    console.error('User fetch error:', e)
    return NextResponse.json({ success: false, message: 'Failed to fetch user data.' }, { status: 500 })
  }
}
