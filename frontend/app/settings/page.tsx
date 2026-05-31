'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Shield, ArrowLeft, Fingerprint, KeyRound, Clock, Trash2, Camera, Eye, AlertTriangle, CheckCircle, Settings } from 'lucide-react'

export default function SettingsPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [biometricProfile, setBiometricProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'security' | 'biometric' | 'sessions' | 'audit'>('security')

  useEffect(() => {
    const userId = sessionStorage.getItem('userId') || ''
    if (!userId) { router.push('/signin'); return }
    fetch(`/api/user?userId=${userId}`).then(r => r.json()).then(d => {
      setUser(d.user); setBiometricProfile(d.biometricProfile); setLoading(false)
    }).catch(() => setLoading(false))
  }, [router])

  const handleLogout = async () => {
    await fetch('/api/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: user?.userId }) })
    sessionStorage.clear(); router.push('/')
  }

  if (loading) return <div className="min-h-screen bg-background flex items-center justify-center"><div className="flex items-center gap-2"><div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" /><span className="text-muted-foreground">Loading settings...</span></div></div>

  const tabs = [
    { id: 'security', label: 'Security', icon: <Shield className="w-4 h-4" /> },
    { id: 'biometric', label: 'Biometric', icon: <Fingerprint className="w-4 h-4" /> },
    { id: 'sessions', label: 'Sessions', icon: <KeyRound className="w-4 h-4" /> },
  ]

  return (
    <div className="min-h-screen bg-background">
      <div className="fixed inset-0 bg-grid pointer-events-none" />
      <header className="relative z-10 px-6 py-4 border-b border-white/5">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="btn-ghost"><ArrowLeft className="w-4 h-4 mr-2" />Back to Dashboard</Link>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center"><Shield className="w-5 h-5 text-white" /></div>
              <h1 className="text-xl font-bold text-gradient">Za-Biometrie</h1>
            </div>
          </div>
          <button onClick={handleLogout} className="btn-ghost"><Shield className="w-4 h-4 mr-2" />Logout</button>
        </div>
      </header>
      <div className="relative z-10 px-6 py-8 max-w-5xl mx-auto">
        <div className="flex items-center gap-2 mb-8"><Settings className="w-6 h-6 text-primary" /><h2 className="text-2xl font-bold text-foreground">Account Settings</h2></div>
        <div className="flex gap-2 mb-8 border-b border-white/5 pb-2">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id as any)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === t.id ? 'bg-primary/10 text-primary border border-primary/30' : 'text-muted-foreground hover:text-foreground hover:bg-secondary'}`}>
              {t.icon}{t.label}
            </button>
          ))}
        </div>
        {activeTab === 'security' && (
          <div className="space-y-6">
            <div className="glass rounded-2xl p-6">
              <h3 className="text-lg font-semibold text-foreground mb-4">Password Security</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 rounded-lg bg-secondary/50">
                  <div className="flex items-center gap-3"><KeyRound className="w-5 h-5 text-emerald-400" /><div><p className="text-sm font-medium text-foreground">Password Status</p><p className="text-xs text-muted-foreground">SHA-256 hashed with unique salt</p></div></div>
                  <span className="badge badge-success">Active</span>
                </div>
                <div className="flex items-center justify-between p-4 rounded-lg bg-secondary/50">
                  <div className="flex items-center gap-3"><Shield className="w-5 h-5 text-amber-400" /><div><p className="text-sm font-medium text-foreground">Account Protection</p><p className="text-xs text-muted-foreground">Rate limiting enabled • Max 3 retries before cooldown</p></div></div>
                  <span className="badge badge-success">Protected</span>
                </div>
              </div>
            </div>
          </div>
        )}
        {activeTab === 'biometric' && (
          <div className="space-y-6">
            <div className="glass rounded-2xl p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-foreground">Face Recognition</h3>
                {biometricProfile ? <span className="badge badge-success">Enrolled</span> : <span className="badge badge-warning">Not Enrolled</span>}
              </div>
              {biometricProfile ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 rounded-lg bg-secondary/50">
                    <div className="flex items-center gap-3"><Fingerprint className="w-5 h-5 text-primary" /><div><p className="text-sm font-medium text-foreground">Biometric Status</p><p className="text-xs text-muted-foreground">Your face profile is active and secure</p></div></div>
                    <span className="badge badge-success">Active</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 rounded-lg bg-secondary/50"><p className="text-xs text-muted-foreground mb-1">Enrollment Date</p><p className="text-sm font-medium text-foreground">{new Date(biometricProfile.enrollment_date).toLocaleDateString()}</p></div>
                    <div className="p-4 rounded-lg bg-secondary/50"><p className="text-xs text-muted-foreground mb-1">Last Verification</p><p className="text-sm font-medium text-foreground">{biometricProfile.last_verification ? new Date(biometricProfile.last_verification).toLocaleString() : 'Never'}</p></div>
                  </div>
                  <Link href="/enroll" className="btn-primary w-full"><Camera className="w-4 h-4 mr-2" />Re-enroll Face</Link>
                </div>
              ) : (
                <div className="text-center py-8">
                  <Fingerprint className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                  <h4 className="text-lg font-medium text-foreground mb-2">No Face Enrolled</h4>
                  <p className="text-sm text-muted-foreground mb-6">Enroll your face to enable secure biometric authentication</p>
                  <Link href="/enroll" className="btn-primary"><Camera className="w-4 h-4 mr-2" />Start Enrollment</Link>
                </div>
              )}
            </div>
          </div>
        )}
        {activeTab === 'sessions' && (
          <div className="glass rounded-2xl p-6">
            <h3 className="text-lg font-semibold text-foreground mb-6">Active Sessions</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-lg bg-secondary/50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center"><Eye className="w-5 h-5 text-primary" /></div>
                  <div><p className="text-sm font-medium text-foreground">Current Session</p><p className="text-xs text-muted-foreground">{navigator.userAgent.slice(0, 80)}</p></div>
                </div>
                <span className="badge badge-success">Active</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
