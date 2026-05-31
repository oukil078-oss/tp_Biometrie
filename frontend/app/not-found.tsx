'use client'
import Link from 'next/link'
import { Shield, ArrowLeft, Home } from 'lucide-react'

export default function NotFoundPage() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="fixed inset-0 bg-grid pointer-events-none" />
      <div className="fixed inset-0 bg-radial pointer-events-none" />
      <div className="relative z-10 text-center">
        <div className="flex justify-center mb-8">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center shadow-glow">
            <Shield className="w-10 h-10 text-white" />
          </div>
        </div>
        <h1 className="text-7xl font-bold text-gradient mb-4">404</h1>
        <p className="text-xl text-muted-foreground mb-8">Page not found</p>
        <div className="flex items-center justify-center gap-4">
          <Link href="/" className="btn-primary"><Home className="w-4 h-4 mr-2" />Go Home</Link>
          <Link href="/signin" className="btn-secondary"><ArrowLeft className="w-4 h-4 mr-2" />Sign In</Link>
        </div>
      </div>
    </div>
  )
}
