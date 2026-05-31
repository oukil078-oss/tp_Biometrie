import { NextRequest, NextResponse } from 'next/server'
import * as crypto from 'crypto'

const RATE_LIMIT_MAP = new Map<string, { count: number; resetTime: number }>()

function hashPassword(password: string, salt: string): string {
  return crypto.createHash('sha256').update(password + salt).digest('hex')
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { username, password } = body
    if (!username || !password) return NextResponse.json({ success: false, message: 'Please fill all fields.' }, { status: 400 })

    const ip = req.headers.get('x-forwarded-for') || 'unknown'
    const key = `signin_${ip}`
    const limit = RATE_LIMIT_MAP.get(key)
    const now = Date.now()
    if (limit && now < limit.resetTime) {
      return NextResponse.json({ success: false, message: `Too many attempts. Wait ${Math.ceil((limit.resetTime - now) / 1000)}s.` }, { status: 429 })
    }

    const ep = process.env.APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1'
    const pid = process.env.APPWRITE_PROJECT_ID || ''
    const ak = process.env.APPWRITE_API_KEY || ''
    const dbid = process.env.APPWRITE_DATABASE_ID || 'biometrie_db'
    const cid = process.env.APPWRITE_USERS_COLLECTION_ID || 'users'

    const res = await fetch(`${ep}/databases/${dbid}/collections/${cid}/documents?queries=["equal('username','${username}')"]`, {
      headers: { 'X-Appwrite-Project': pid, 'X-Appwrite-Key': ak }
    })
    const data = await res.json()
    const user = data.documents?.[0]

    if (!user) {
      RATE_LIMIT_MAP.set(key, { count: (limit?.count || 0) + 1, resetTime: now + ((limit?.count || 0) >= 2 ? 15000 : (limit?.count || 0) >= 1 ? 10000 : 5000) })
      return NextResponse.json({ success: false, message: 'Incorrect username or password.' }, { status: 401 })
    }

    if (hashPassword(password, user.salt) !== user.password) {
      RATE_LIMIT_MAP.set(key, { count: (limit?.count || 0) + 1, resetTime: now + ((limit?.count || 0) >= 2 ? 15000 : (limit?.count || 0) >= 1 ? 10000 : 5000) })
      return NextResponse.json({ success: false, message: 'Incorrect username or password.' }, { status: 401 })
    }

    // Update last login
    await fetch(`${ep}/databases/${dbid}/collections/${cid}/documents/${user.$id}`, {
      method: 'PATCH',
      headers: { 'X-Appwrite-Project': pid, 'X-Appwrite-Key': ak, 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: { last_login: new Date().toISOString() } }),
    })

    RATE_LIMIT_MAP.delete(key)

    // Check biometric
    const bres = await fetch(`${ep}/databases/${dbid}/collections/${process.env.APPWRITE_BIOMETRICS_COLLECTION_ID || 'biometric_profiles'}/documents?queries=["equal('user_id','${user.$id}')"]`, {
      headers: { 'X-Appwrite-Project': pid, 'X-Appwrite-Key': ak }
    })
    const bdata = await bres.json()

    return NextResponse.json({ success: true, message: 'Login successful!', userId: user.$id, username: user.username, hasBiometric: bdata.documents?.length > 0 }, { status: 200 })
  } catch (e) {
    console.error('Signin error:', e)
    return NextResponse.json({ success: false, message: 'Unexpected error.' }, { status: 500 })
  }
}
