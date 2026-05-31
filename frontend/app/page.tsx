import Link from 'next/link'
import { Shield, Fingerprint, Lock, ArrowRight, CheckCircle, Sparkles, Eye, KeyRound, Clock } from 'lucide-react'

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      <div className="fixed inset-0 bg-grid pointer-events-none" />
      <div className="fixed inset-0 bg-radial pointer-events-none" />

      <nav className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-white/5">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center shadow-glow-sm">
            <Shield className="w-6 h-6 text-white" />
          </div>
          <span className="text-xl font-bold text-gradient">Za-Biometrie</span>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/signin" className="btn-ghost">Sign In</Link>
          <Link href="/signup" className="btn-primary">Get Started <ArrowRight className="w-4 h-4 ml-2" /></Link>
        </div>
      </nav>

      <section className="relative z-10 flex flex-col items-center justify-center px-6 py-24 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full glass mb-6">
          <Sparkles className="w-4 h-4 text-amber-400" />
          <span className="text-sm text-muted-foreground">Next-Gen Biometric Security</span>
        </div>
        <h1 className="text-5xl md:text-7xl font-bold mb-6 leading-tight">
          Secure Access with<br /><span className="text-gradient">Facial Recognition</span>
        </h1>
        <p className="text-xl text-muted-foreground max-w-2xl mb-10 leading-relaxed">
          Za-Biometrie provides enterprise-grade facial authentication with real-time verification,
          secure enrollment, and seamless access control.
        </p>
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <Link href="/signup" className="btn-primary px-8 py-4 text-lg">
            Start Free <ArrowRight className="w-5 h-5 ml-2" />
          </Link>
          <Link href="/signin" className="btn-secondary px-8 py-4 text-lg">Sign In</Link>
        </div>

        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl w-full">
          {[
            { icon: <Shield className="w-8 h-8 text-primary" />, title: 'Enterprise Security', desc: 'Bank-grade encryption and secure biometric storage' },
            { icon: <Fingerprint className="w-8 h-8 text-emerald-400" />, title: 'Facial Recognition', desc: 'AI-powered face detection with high accuracy' },
            { icon: <Lock className="w-8 h-8 text-amber-400" />, title: 'Privacy First', desc: 'Your biometric data stays encrypted and secure' },
          ].map((f, i) => (
            <div key={i} className="glass rounded-2xl p-6 card-hover">
              <div className="flex justify-center mb-4">{f.icon}</div>
              <h3 className="text-lg font-semibold mb-2 text-foreground">{f.title}</h3>
              <p className="text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="relative z-10 px-6 py-24">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-4">How It Works</h2>
          <p className="text-muted-foreground text-center mb-12 max-w-2xl mx-auto">Three simple steps to secure your account with facial recognition</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { step: '01', icon: <KeyRound className="w-8 h-8 text-primary" />, title: 'Create Account', desc: 'Sign up with your username and password using our secure registration process.' },
              { step: '02', icon: <Eye className="w-8 h-8 text-emerald-400" />, title: 'Enroll Face', desc: 'Complete facial enrollment by capturing multiple face samples for accurate recognition.' },
              { step: '03', icon: <CheckCircle className="w-8 h-8 text-amber-400" />, title: 'Verify & Access', desc: 'Sign in and verify your identity with facial recognition for secure access.' },
            ].map((item, i) => (
              <div key={i} className="glass rounded-2xl p-6 card-hover">
                <div className="text-6xl font-bold text-white/5 mb-4">{item.step}</div>
                <div className="mb-4">{item.icon}</div>
                <h3 className="text-xl font-semibold mb-3 text-foreground">{item.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative z-10 px-6 py-24">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-4">Security Features</h2>
          <p className="text-muted-foreground text-center mb-12 max-w-2xl mx-auto">Built with security-first architecture and industry best practices</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[
              { icon: <Shield className="w-6 h-6 text-primary" />, title: 'SHA-256 Password Hashing', desc: 'All passwords are securely hashed with unique salts before storage.' },
              { icon: <Lock className="w-6 h-6 text-emerald-400" />, title: 'Rate Limiting', desc: 'Progressive delays after failed attempts to prevent brute-force attacks.' },
              { icon: <Fingerprint className="w-6 h-6 text-amber-400" />, title: 'Biometric Encryption', desc: 'Face embeddings are stored securely with encryption at rest.' },
              { icon: <Clock className="w-6 h-6 text-cyan-400" />, title: 'Audit Logging', desc: 'Every authentication event is logged for security monitoring.' },
            ].map((f, i) => (
              <div key={i} className="glass rounded-xl p-6 flex items-start gap-4">
                <div className="p-3 rounded-lg bg-secondary">{f.icon}</div>
                <div>
                  <h3 className="font-semibold text-foreground mb-1">{f.title}</h3>
                  <p className="text-sm text-muted-foreground">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative z-10 px-6 py-24 text-center">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold mb-6">Ready to Secure Your Account?</h2>
          <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
            Join thousands of users who trust Za-Biometrie for their biometric authentication needs.
          </p>
          <Link href="/signup" className="btn-primary px-8 py-4 text-lg">
            Create Account <ArrowRight className="w-5 h-5 ml-2" />
          </Link>
        </div>
      </section>

      <footer className="relative z-10 px-6 py-8 border-t border-white/5">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-gradient">Za-Biometrie</span>
          </div>
          <p className="text-sm text-muted-foreground">© {new Date().getFullYear()} Za-Biometrie. All rights reserved.</p>
        </div>
      </footer>
    </div>
  )
}
