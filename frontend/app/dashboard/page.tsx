'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Shield, User, Clock, KeyRound, Fingerprint, Camera, LogOut, Settings, LayoutDashboard, AlertTriangle, CheckCircle, Eye } from 'lucide-react'

export default function DashboardPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [biometricProfile, setBiometricProfile] = useState<any>(null)
  const [auditLogs, setAuditLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const userId = sessionStorage.getItem('userId') || ''
    if (!userId) { router.push('/signin'); return }
    fetch(`/api/user?userId=${userId}`)
      .then(r => r.json())
      .then(d => { setUser(d.user); setBiometricProfile(d.biometricProfile); setAuditLogs(d.auditLogs || []); setLoading(false) })
      .catch(() => { setLoading(false); setUser({ username: sessionStorage.getItem('user') || '', userId }) })
  }, [router])

  const handleLogout = async () => {
    await fetch('/api/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: user?.userId }) })
    sessionStorage.clear()
    router.push('/')
  }

  if (loading) return <div className="min-h-screen bg-background flex items-center justify-center"><div className="flex items-center gap-2"><div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" /><span className="text-muted-foreground">Loading dashboard...</span></div></div>

  return (
    <div className="min-h-screen bg-background">
      <div className="fixed inset-0 bg-grid pointer-events-none" />
      <nav className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-white/5">
        <div className="flex items-center gap-2">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center shadow-glow-sm"><Shield className="w-6 h-6 text-white" /></div>
            <span className="text-xl font-bold text-gradient">Za-Biometrie</span>
          </Link>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="btn-ghost"><LayoutDashboard className="w-4 h-4 mr-2" />Dashboard</Link>
          <Link href="/settings" className="btn-ghost"><Settings className="w-4 h-4 mr-2" />Settings</Link>
          <button onClick={handleLogout} className="btn-ghost"><LogOut className="w-4 h-4 mr-2" />Logout</button>
        </div>
      </nav>
      <div className="relative z-10 px-6 py-8 max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Welcome back, <span className="text-gradient">@{user?.username || 'User'}</span></h1>
          <p className="text-muted-foreground">Here is your security overview and account details.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="glass rounded-2xl p-6 card-hover">
            <div className="flex items-center justify-between mb-4"><div className="p-3 rounded-xl bg-primary/10"><Shield className="w-6 h-6 text-primary" /></div><span className="badge badge-success">Active</span></div>
            <h3 className="text-sm text-muted-foreground mb-1">Account Status</h3><p className="text-2xl font-bold text-foreground">Verified</p>
          </div>
          <div className="glass rounded-2xl p-6 card-hover">
            <div className="flex items-center justify-between mb-4"><div className="p-3 rounded-xl bg-emerald-500/10"><Fingerprint className="w-6 h-6 text-emerald-400" /></div><span className={`badge ${biometricProfile ? 'badge-success' : 'badge-warning'}`}>{biometricProfile ? 'Enrolled' : 'Not Enrolled'}</span></div>
            <h3 className="text-sm text-muted-foreground mb-1">Face Enrollment</h3><p className="text-2xl font-bold text-foreground">{biometricProfile ? 'Complete' : 'Required'}</p>
          </div>
          <div className="glass rounded-2xl p-6 card-hover">
            <div className="flex items-center justify-between mb-4"><div className="p-3 rounded-xl bg-amber-500/10"><Clock className="w-6 h-6 text-amber-400" /></div></div>
            <h3 className="text-sm text-muted-foreground mb-1">Last Login</h3><p className="text-lg font-bold text-foreground">{user?.last_login ? new Date(user.last_login).toLocaleString() : 'Unknown'}</p>
          </div>
          <div className="glass rounded-2xl p-6 card-hover">
            <div className="flex items-center justify-between mb-4"><div className="p-3 rounded-xl bg-cyan-500/10"><KeyRound className="w-6 h-6 text-cyan-400" /></div></div>
            <h3 className="text-sm text-muted-foreground mb-1">Security Score</h3><p className="text-2xl font-bold text-foreground">{biometricProfile ? '100%' : '60%'}</p>
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <div className="glass rounded-2xl p-6">
            <div className="flex items-center justify-between mb-6"><h2 className="text-lg font-semibold text-foreground">Account Information</h2><User className="w-5 h-5 text-muted-foreground" /></div>
            <div className="space-y-4">
              {[['Username', `@${user?.username || 'Unknown'}`], ['Account Created', user?.created_at ? new Date(user.created_at).toLocaleDateString() : 'Unknown'], ['User ID', user?.userId || 'N/A'], ['Password Status', 'Set']].map(([l, v], i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50"><span className="text-sm text-muted-foreground">{l}</span><span className={`text-sm font-medium ${i === 3 ? 'text-emerald-400' : 'text-foreground'}`}>{v}</span></div>
              ))}
            </div>
          </div>
          <div className="glass rounded-2xl p-6">
            <div className="flex items-center justify-between mb-6"><h2 className="text-lg font-semibold text-foreground">Biometric Security</h2><Fingerprint className="w-5 h-5 text-muted-foreground" /></div>
            {biometricProfile ? (
              <div className="space-y-6">
                <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20"><CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" /><span className="text-sm text-emerald-400">Face enrolled and active</span></div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Enrollment Date</span><span className="text-sm text-foreground">{biometricProfile?.enrollment_date ? new Date(biometricProfile.enrollment_date).toLocaleDateString() : 'Unknown'}</span></div>
                  <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Last Verification</span><span className="text-sm text-foreground">{biometricProfile?.last_verification ? new Date(biometricProfile.last_verification).toLocaleString() : 'Never'}</span></div>
                </div>
                <Link href="/enroll" className="btn-primary w-full"><Camera className="w-4 h-4 mr-2" />Re-enroll Face</Link>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20"><AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" /><span className="text-sm text-amber-400">Face not enrolled</span></div>
                <p className="text-sm text-muted-foreground">Enroll your face for secure biometric authentication.</p>
                <Link href="/enroll" className="btn-primary w-full"><Fingerprint className="w-4 h-4 mr-2" />Start Face Enrollment</Link>
              </div>
            )}
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="glass rounded-2xl p-6">
            <div className="flex items-center justify-between mb-6"><h2 className="text-lg font-semibold text-foreground">Recent Activity</h2><Clock className="w-5 h-5 text-muted-foreground" /></div>
            {auditLogs.length > 0 ? (
              <div className="space-y-3">{auditLogs.slice(0, 5).map((log: any) => (
                <div key={log.$id} className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50">
                  {log.event_type?.includes('success') ? <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" /> : <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />}
                  <div className="flex-1 min-w-0"><p className="text-sm text-foreground truncate">{log.details || log.event_type}</p><p className="text-xs text-muted-foreground">{new Date(log.timestamp).toLocaleString()}</p></div>
                </div>
              ))}</div>
            ) : <div className="text-center py-8 text-muted-foreground"><p className="text-sm">No recent activity</p></div>}
          </div>
          <div className="glass rounded-2xl p-6">
            <div className="flex items-center justify-between mb-6"><h2 className="text-lg font-semibold text-foreground">Active Sessions</h2><KeyRound className="w-5 h-5 text-muted-foreground" /></div>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
                <div className="flex items-center gap-3"><div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center"><Eye className="w-4 h-4 text-primary" /></div><div><p className="text-sm text-foreground">Current Session</p><p className="text-xs text-muted-foreground">{navigator.userAgent.includes('Chrome') ? 'Chrome' : navigator.userAgent.includes('Firefox') ? 'Firefox' : 'Browser'} on {navigator.userAgent.includes('Windows') ? 'Windows' : navigator.userAgent.includes('Mac') ? 'macOS' : navigator.userAgent.includes('Linux') ? 'Linux' : 'Unknown'}</p></div></div>
                <span className="badge badge-success">Active</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
