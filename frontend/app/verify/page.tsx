'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Shield, Camera, CheckCircle, AlertCircle, Eye, Loader2, KeyRound } from 'lucide-react'
import * as faceapi from 'face-api.js'

const MODEL_URL = typeof window !== 'undefined' ? `${window.location.origin}/models` : '/models'
const MAX_RETRIES = 3

export default function VerifyPage() {
  const router = useRouter()
  const [status, setStatus] = useState<'idle' | 'camera' | 'detecting' | 'verifying' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('Start verification to compare your face')
  const [error, setError] = useState('')
  const [confidence, setConfidence] = useState(0)
  const [retries, setRetries] = useState(0)
  const [showPasswordFallback, setShowPasswordFallback] = useState(false)
  const [password, setPassword] = useState('')

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const detectionRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const modelsReady = useRef(false)

  useEffect(() => {
    const load = async () => {
      try {
        await Promise.all([
          faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        ])
        modelsReady.current = true
      } catch { setError('Failed to load models.') }
    }
    load()
    return () => { stopCamera() }
  }, [])

  useEffect(() => {
    const userId = sessionStorage.getItem('userId') || ''
    if (!userId) { setError('No session found. Please sign in first.'); return }
    fetch(`/api/verify-face?userId=${userId}`)
      .then(r => r.json())
      .then(d => { if (!d.hasProfile) { setMessage('No face enrolled. Redirecting...'); setTimeout(() => router.push('/enroll'), 2000) } })
      .catch(() => setMessage('Ready to verify your face.'))
  }, [router])

  const stopCamera = useCallback(() => {
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null }
    if (detectionRef.current) { clearInterval(detectionRef.current); detectionRef.current = null }
    setStatus('idle')
    setMessage('Start verification to compare your face.')
  }, [])

  const startCamera = async () => {
    if (!modelsReady.current) { setError('Models not loaded yet.'); return }
    try {
      setError('')
      setStatus('camera')
      setMessage('Requesting camera access...')
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }, audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
        setStatus('detecting')
        setMessage('Position your face in the frame.')
        startDetection()
      }
    } catch { setError('Camera access denied.'); setStatus('idle') }
  }

  const startDetection = () => {
    if (!videoRef.current) return
    detectionRef.current = setInterval(async () => {
      if (!videoRef.current || videoRef.current.readyState !== 4) return
      try {
        const det = await faceapi.detectSingleFace(videoRef.current)
        if (det) {
          setConfidence(det.score)
          if (det.score > 0.5) {
            setMessage('Face detected. Verifying...')
            setStatus('verifying')
            clearInterval(detectionRef.current!)
            await verifyFace()
          }
        } else { setConfidence(0); setMessage('No face detected. Position your face.') }
      } catch { console.error('Detection error') }
    }, 300)
  }

  const verifyFace = async () => {
    try {
      setStatus('verifying')
      setMessage('Comparing face with enrolled profile...')
      const canvas = document.createElement('canvas')
      canvas.width = videoRef.current?.videoWidth || 640
      canvas.height = videoRef.current?.videoHeight || 480
      const ctx = canvas.getContext('2d')
      if (!ctx || !videoRef.current) { setError('Failed to capture.'); setStatus('error'); return }
      ctx.drawImage(videoRef.current, 0, 0)
      const det = await faceapi.detectSingleFace(canvas).withFaceLandmarks().withFaceDescriptor()
      if (!det) { setError('No face features extracted.'); setStatus('idle'); setMessage('Start verification.'); return }

      const embedding = Array.from(det.descriptor)
      const userId = sessionStorage.getItem('userId') || ''
      const res = await fetch('/api/verify-face', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, embedding }),
      })
      const data = await res.json()
      if (data.success) {
        setStatus('success')
        setMessage('Face verified successfully!')
        stopCamera()
        fetch('/api/audit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, eventType: 'biometric_success', details: 'Face verification successful' }) })
        setTimeout(() => router.push('/dashboard'), 2000)
      } else {
        const nr = retries + 1
        setRetries(nr)
        if (nr >= MAX_RETRIES) {
          setError(`Max retries (${MAX_RETRIES}) reached. Use password fallback.`)
          setStatus('error')
          setShowPasswordFallback(true)
          stopCamera()
        } else {
          setError(`Verification failed (${nr}/${MAX_RETRIES}). Try again.`)
          setStatus('idle')
          setMessage('Start verification to compare your face.')
        }
      }
    } catch { setError('Verification failed.'); setStatus('error') }
  }

  const handlePasswordFallback = async () => {
    const userId = sessionStorage.getItem('userId') || ''
    const username = sessionStorage.getItem('user') || ''
    try {
      const res = await fetch('/api/signin', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const data = await res.json()
      if (data.success) { setStatus('success'); setMessage('Password verified. Access granted.'); setTimeout(() => router.push('/dashboard'), 1500) }
      else setError('Incorrect password.')
    } catch { setError('Verification failed.') }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
      <div className="fixed inset-0 bg-grid pointer-events-none" />
      <div className="fixed inset-0 bg-radial pointer-events-none" />
      <div className="relative z-10 w-full max-w-lg">
        <div className="flex items-center justify-center gap-2 mb-8">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center shadow-glow-sm">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <span className="text-xl font-bold text-gradient">Za-Biometrie</span>
          </Link>
        </div>
        <div className="glass rounded-2xl p-8 shadow-glow">
          <div className="text-center mb-6">
            <div className={`inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4 ${
              status === 'success' ? 'bg-emerald-500/10' : status === 'error' ? 'bg-red-500/10' : status === 'verifying' ? 'bg-primary/10' : 'bg-secondary'
            }`}>
              {status === 'success' ? <CheckCircle className="w-8 h-8 text-emerald-400" /> :
               status === 'error' ? <AlertCircle className="w-8 h-8 text-red-400" /> :
               status === 'verifying' ? <Loader2 className="w-8 h-8 text-primary animate-spin" /> :
               <Eye className="w-8 h-8 text-primary" />}
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-2">
              {status === 'success' ? 'Verification Successful' : status === 'error' ? 'Verification Failed' : 'Face Verification'}
            </h1>
            <p className="text-muted-foreground">{message}</p>
          </div>
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 mb-6">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}
          {status === 'success' && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 mb-6">
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
              <p className="text-sm text-emerald-400">Access granted. Redirecting...</p>
            </div>
          )}
          {(status === 'camera' || status === 'detecting' || status === 'verifying') && (
            <div className="relative rounded-2xl overflow-hidden bg-secondary aspect-video mb-6">
              <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
              <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-60 border-2 rounded-full transition-all ${
                status === 'verifying' ? 'border-emerald-500/70' : 'border-primary/30 animate-pulse'
              }`} />
              <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between">
                <div className={`px-3 py-1.5 rounded-full text-xs font-medium ${
                  status === 'verifying' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                  status === 'detecting' && confidence > 0.5 ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                  'bg-red-500/20 text-red-400 border border-red-500/30'
                }`}>
                  {status === 'verifying' ? 'Verifying...' : confidence > 0.5 ? 'Face Detected' : 'No Face Detected'}
                </div>
                {confidence > 0 && <div className="px-3 py-1.5 rounded-full text-xs font-medium bg-primary/20 text-primary border border-primary/30">{Math.round(confidence * 100)}%</div>}
              </div>
            </div>
          )}
          {status === 'error' && retries < MAX_RETRIES && (
            <div className="text-center mb-4"><span className="text-sm text-amber-400">{MAX_RETRIES - retries} retries remaining</span></div>
          )}
          {showPasswordFallback && (
            <div className="space-y-4 mb-6">
              <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                <KeyRound className="w-4 h-4 text-amber-400 shrink-0" />
                <p className="text-sm text-amber-400">Fallback to password verification</p>
              </div>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password" className="input-field" />
              <button onClick={handlePasswordFallback} className="w-full btn-secondary">Verify with Password</button>
            </div>
          )}
          {!showPasswordFallback && (
            <div className="flex gap-3">
              {status === 'idle' && <button onClick={startCamera} className="w-full btn-primary"><Camera className="w-5 h-5 mr-2" /> Start Verification</button>}
              {(status === 'detecting' || status === 'camera') && <button onClick={stopCamera} className="w-full btn-secondary">Cancel</button>}
              {status === 'error' && !showPasswordFallback && retries < MAX_RETRIES && <button onClick={startCamera} className="w-full btn-primary">Try Again</button>}
            </div>
          )}
          <div className="mt-6 flex items-center justify-between">
            <Link href="/dashboard" className="text-sm text-muted-foreground hover:text-primary transition-colors">Back to Dashboard</Link>
            <Link href="/settings" className="text-sm text-muted-foreground hover:text-primary transition-colors">Security Settings</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
