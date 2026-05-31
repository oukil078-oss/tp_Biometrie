import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const userId = searchParams.get('userId')
    if (!userId) return NextResponse.json({ success: false, message: 'User ID required.' }, { status: 400 })

    const ep = process.env.APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1'
    const pid = process.env.APPWRITE_PROJECT_ID || ''
    const ak = process.env.APPWRITE_API_KEY || ''
    const dbid = process.env.APPWRITE_DATABASE_ID || 'biometrie_db'

    // Fetch user
    const userRes = await fetch(`${ep}/databases/${dbid}/collections/${process.env.APPWRITE_USERS_COLLECTION_ID || 'users'}/docs/${userId}`, {
      headers: { 'X-Appwrite-Project': pid, 'X-Appwrite-Key': ak }
    })
    if (!userRes.ok) return NextResponse.json({ success: false, message: 'User not found.' }, { status: 404 })
    const userData = await userRes.json()

    // Fetch biometric profile
    const bioRes = await fetch(`${ep}/databases/${dbid}/collections/${process.env.APPWRITE_BIOMETRICS_COLLECTION_ID || 'biometric_profiles'}/docs?queries=["equal('user_id','${userId}')"]`, {
      headers: { 'X-Appwrite-Project': pid, 'X-Appwrite-Key': ak }
    })
    const bioData = await bioRes.json()
    const biometricProfile = bioData.documents?.[0] || null

    // Fetch audit logs
    const auditRes = await fetch(`${ep}/databases/${dbid}/collections/${process.env.APPWRITE_AUDIT_COLLECTION_ID || 'audit_logs'}/docs?queries=["equal('user_id','${userId}')","orderDesc('timestamp')","limit(10)"]`, {
      headers: { 'X-Appwrite-Project': pid, 'X-Appwrite-Key': ak }
    })
    const auditData = await auditRes.json()
    const auditLogs = auditData.documents || []

    // Remove sensitive fields
    const { password, salt, face_embedding, ...safeUser } = userData
    const safeBio = biometricProfile ? { ...biometricProfile, face_embedding: undefined } : null

    return NextResponse.json({ success: true, user: safeUser, biometricProfile: safeBio, auditLogs }, { status: 200 })
  } catch (e) {
    console.error('User fetch error:', e)
    return NextResponse.json({ success: false, message: 'Failed to fetch user data.' }, { status: 500 })
  }
}
