import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    appwriteEndpoint: process.env.APPWRITE_ENDPOINT ? 'SET' : 'MISSING',
    appwriteProjectId: process.env.APPWRITE_PROJECT_ID ? 'SET' : 'MISSING',
    appwriteApiKey: process.env.APPWRITE_API_KEY ? 'SET (len:' + process.env.APPWRITE_API_KEY!.length + ')' : 'MISSING',
    appwriteDatabaseId: process.env.APPWRITE_DATABASE_ID ? 'SET' : 'MISSING',
    usersCollectionId: process.env.APPWRITE_USERS_COLLECTION_ID ? 'SET' : 'MISSING',
    biometricsCollectionId: process.env.APPWRITE_BIOMETRICS_COLLECTION_ID ? 'SET' : 'MISSING',
    auditCollectionId: process.env.APPWRITE_AUDIT_COLLECTION_ID ? 'SET' : 'MISSING',
    storageBucketId: process.env.APPWRITE_STORAGE_BUCKET_ID ? 'SET' : 'MISSING',
  })
}

export async function POST() {
  return GET()
}
