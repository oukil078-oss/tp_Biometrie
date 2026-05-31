'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Shield, LogIn, AlertCircle, Eye, EyeOff } from 'lucide-react'

export default function SigninPage() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const [attemptCount, setAttemptCount] = useState(0)

  useEffect(() => {
    if (cooldown > 0) {
      const timer = setTimeout(() => setCooldown(cooldown - 1), 1000)
      return () => clearTimeout(timer)
    }
  }, [cooldown])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (cooldown > 0) { setError(`Please wait ${cooldown}s.`); return }
    if (!username || !password) { setError('Please fill all fields.'); return }

    setLoading(true)
    setAttemptCount(prev => prev + 1)

    try {
      const res = await fetch('/api/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const data = await res.json()

      if (data.success) {
        setSuccess(true)
        sessionStorage.setItem('user', username)
        sessionStorage.setItem('userId', data.userId || '')
        sessionStorage.setItem('sessionId', data.sessionId || '')
        if (data.hasBiometric) setTimeout(() => router.push('/verify'), 1000)
        else setTimeout(() => router.push('/enroll'), 1000)
      } else {
        setError(data.message || 'Signin failed.')
        if (attemptCount >= 3) setCooldown(15)
        else if (attemptCount >= 2) setCooldown(10)
        else if (attemptCount >= 1) setCooldown(5)
      }
    } catch { setError('Network error.') }
    finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
      <div className="fixed inset-0 bg-grid pointer-events-none" />
      <div className="fixed inset-0 bg-radial pointer-events-none" />
      <div className="relative z-10 w-full max-w-md">
        <div className="flex justify-center mb-8">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center shadow-glow-sm">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <span className="text-xl font-bold text-gradient">Za-Biometrie</span>
          </Link>
        </div>
        <div className="glass rounded-2xl p-8 shadow-glow">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-4">
              <LogIn className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-2">Welcome Back</h1>
            <p className="text-muted-foreground">Sign in to your account to continue.</p>
          </div>
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}
            {success && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                <Shield className="w-4 h-4 text-emerald-400 shrink-0" />
                <p className="text-sm text-emerald-400">Login successful! Redirecting...</p>
              </div>
            )}
            <div className="space-y-2">
              <label htmlFor="username" className="text-sm font-medium text-foreground">Username <span className="text-red-400">*</span></label>
              <input id="username" type="text" value={username} onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your username" className="input-field" required />
            </div>
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium text-foreground">Password <span className="text-red-400">*</span></label>
              <div className="relative">
                <input id="password" type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password" className="input-field pr-10" required />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>
            <button type="submit" disabled={loading || cooldown > 0} className="w-full btn-primary">
              {loading ? (<span className="flex items-center justify-center gap-2"><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Signing in...</span>)
                : cooldown > 0 ? `Wait ${cooldown}s before retry` : 'Sign In'}
            </button>
          </form>
          <p className="text-center mt-6 text-sm text-muted-foreground">
            Don't have an account? <Link href="/signup" className="text-primary hover:underline">Sign Up</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
