import { NextRequest, NextResponse } from 'next/server'
import * as crypto from 'crypto'

const RATE_LIMIT_MAP = new Map<string, { count: number; resetTime: number }>()

function hashPassword(password: string, salt: string): string {
  return crypto.createHash('sha256').update(password + salt).digest('hex')
}

function generateSalt(): string {
  return String(Math.floor(Math.random() * 10000)).padStart(4, '0')
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { username, password } = body

    if (!/^(?=.*[a-z])(?=.*[A-Z])[A-Za-z]{5}$/.test(username))
      return NextResponse.json({ success: false, message: 'Username must be exactly 5 letters with at least one uppercase and one lowercase.' }, { status: 400 })

    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8}$/.test(password))
      return NextResponse.json({ success: false, message: 'Password must be exactly 8 characters with uppercase, lowercase, and a number.' }, { status: 400 })

    const ip = req.headers.get('x-forwarded-for') || 'unknown'
    const key = `signup_${ip}`
    const limit = RATE_LIMIT_MAP.get(key)
    const now = Date.now()

    if (limit && now < limit.resetTime) {
      const waitTime = Math.ceil((limit.resetTime - now) / 1000)
      return NextResponse.json({ success: false, message: `Please wait ${waitTime}s.` }, { status: 429 })
    }

    const ep = process.env.APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1'
    const pid = process.env.APPWRITE_PROJECT_ID || ''
    const ak = process.env.APPWRITE_API_KEY || ''
    const dbid = process.env.APPWRITE_DATABASE_ID || 'biometrie_db'
    const cid = process.env.APPWRITE_USERS_COLLECTION_ID || 'users'

    // List all users and filter in-memory (queries param not supported by standard API key)
    const listUrl = ep + '/databases/' + dbid + '/collections/' + cid + '/documents?limit=10000'
    const listRes = await fetch(listUrl, {
      headers: { 'X-Appwrite-Project': pid, 'X-Appwrite-Key': ak }
    })
    const listData = await listRes.json()
    const users = listData.documents || []
    
    // Check for existing user
    const existing = users.find((u: any) => u.username === username)
    if (existing)
      return NextResponse.json({ success: false, message: 'Username already exists.' }, { status: 409 })

    const salt = generateSalt()
    const hash = hashPassword(password, salt)

    // Create new user
    const createUrl = ep + '/databases/' + dbid + '/collections/' + cid + '/documents'
    const createRes = await fetch(createUrl, {
      method: 'POST',
      headers: { 'X-Appwrite-Project': pid, 'X-Appwrite-Key': ak, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        documentId: 'unique()',
        data: { username, password: hash, salt, created_at: new Date().toISOString(), last_login: '', status: 'active' },
      }),
    })

    const userData = await createRes.json()
    if (userData.$id) {
      RATE_LIMIT_MAP.delete(key)
      return NextResponse.json({ success: true, message: 'Signup successful!', userId: userData.$id }, { status: 201 })
    }

    RATE_LIMIT_MAP.set(key, { count: (limit?.count || 0) + 1, resetTime: now + ((limit?.count || 0) >= 2 ? 15000 : (limit?.count || 0) >= 1 ? 10000 : 5000) })
    return NextResponse.json({ success: false, message: 'Signup failed. Please try again.' }, { status: 500 })
  } catch (e) {
    console.error('Signup error:', e)
    return NextResponse.json({ success: false, message: 'Unexpected error.' }, { status: 500 })
  }
}
