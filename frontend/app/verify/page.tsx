'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Shield, Camera, CheckCircle, AlertCircle, Eye, Loader2, KeyRound } from 'lucide-react'
import * as faceapi from 'face-api.js'

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const MODEL_URL = typeof window !== 'undefined' ? `${window.location.origin}/models` : '/models'
const MAX_RETRIES = 3

/* ------------------------------------------------------------------ */
/*  Page Component                                                     */
/* ------------------------------------------------------------------ */

export default function VerifyPage() {
  const router = useRouter()

  const [status, setStatus] = useState<'idle' | 'camera' | 'verifying' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('Start verification to compare your face')
  const [error, setError] = useState('')
  const [confidence, setConfidence] = useState(0)
  const [retries, setRetries] = useState(0)
  const [showPasswordFallback, setShowPasswordFallback] = useState(false)
  const [password, setPassword] = useState('')
  const [faceDetected, setFaceDetected] = useState(false)

  // Camera
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const detectionRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const verifyingRef = useRef(false)

  // Models
  const [modelsReady, setModelsReady] = useState(false)

  /* ---- Load face-api models ---- */
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        console.log('[Verify] Loading models from', MODEL_URL)
        await Promise.all([
          faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        ])
        if (!cancelled) { setModelsReady(true); console.log('[Verify] Models loaded') }
      } catch {
        if (!cancelled) setError('Failed to load face detection models.')
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  /* ---- Check enrollment ---- */
  useEffect(() => {
    const userId = sessionStorage.getItem('userId') || ''
    if (!userId) { setError('No session found. Please sign in first.'); return }
    fetch(`/api/verify-face?userId=${userId}`)
      .then(r => r.json())
      .then(d => { if (!d.hasProfile) { setMessage('No face enrolled. Redirecting...'); setTimeout(() => router.push('/enroll'), 2000) } })
      .catch(() => setMessage('Ready to verify your face.'))
  }, [router])

  /* ---- Cleanup ---- */
  useEffect(() => {
    return () => {
      if (detectionRef.current) clearInterval(detectionRef.current)
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
    }
  }, [])

  /* ================================================================ */
  /*  CAMERA LIFECYCLE — driven by clicks, NOT useEffect             */
  /* ================================================================ */

  const stopCamera = useCallback(() => {
    if (detectionRef.current) { clearInterval(detectionRef.current); detectionRef.current = null }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null }
    if (videoRef.current) videoRef.current.srcObject = null
    setStatus('idle')
    setMessage('Start verification to compare your face.')
    setFaceDetected(false)
    setConfidence(0)
    verifyingRef.current = false
  }, [])

  const startCamera = useCallback(async () => {
    if (streamRef.current) return // already active

    console.log('[Verify] startCamera — requesting getUserMedia')
    setMessage('Opening camera...')
    setError('')

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false,
      })

      if (stream.getVideoTracks().length === 0) {
        stream.getTracks().forEach(t => t.stop())
        throw new Error('No video tracks found.')
      }

      streamRef.current = stream
      console.log('[Verify] Stream obtained:', stream.id)

      // Give React a tick to render the video element if needed
      await new Promise(r => setTimeout(r, 50))

      const video = videoRef.current
      if (!video) {
        stream.getTracks().forEach(t => t.stop())
        streamRef.current = null
        throw new Error('Video element not found.')
      }

      console.log('[Verify] Attaching stream to video')
      video.srcObject = stream
      video.muted = true

      try {
        await video.play()
        console.log('[Verify] video.play() succeeded')
      } catch {
        await new Promise(r => setTimeout(r, 200))
        try { await video.play() } catch { /* autoplay may handle it */ }
      }

      console.log('[Verify] Camera active! videoWidth:', video.videoWidth, 'videoHeight:', video.videoHeight)
      setStatus('camera')
      setMessage('Position your face in the frame.')

      // Start face detection
      startFaceDetection()
    } catch (err: unknown) {
      const e = err as Error
      if (e.name === 'NotAllowedError') setError('Camera permission denied. Please allow camera access.')
      else if (e.name === 'NotFoundError') setError('No camera found on this device.')
      else if (e.name === 'NotReadableError') setError('Camera is in use by another app.')
      else setError(e.message || 'Failed to start camera.')
      setStatus('error')
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /* ---- Face detection + auto-verify ---- */
  const handleVerifyFace = useCallback(async (embedding: number[], _score: number) => {
    try {
      setStatus('verifying')
      setMessage('Comparing face with enrolled profile...')
      const userId = sessionStorage.getItem('userId') || ''
      const res = await fetch('/api/verify-face', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, embedding }),
      })
      const data = await res.json()

      if (data.success) {
        setStatus('success')
        setMessage('Face verified successfully!')
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
          // Don't stop camera — let user retry
          verifyingRef.current = false
          startFaceDetection()
        }
      }
    } catch {
      setError('Verification request failed.')
      setStatus('error')
      stopCamera()
    }
  }, [retries, router, stopCamera]) // eslint-disable-line react-hooks/exhaustive-deps

  const startFaceDetection = useCallback(() => {
    if (detectionRef.current) { clearInterval(detectionRef.current); detectionRef.current = null }
    verifyingRef.current = false
    setFaceDetected(false)

    detectionRef.current = setInterval(async () => {
      const video = videoRef.current
      if (!video || video.readyState < 2 || verifyingRef.current) return
      try {
        const det = await faceapi.detectSingleFace(video)
        setFaceDetected(!!det)
        setConfidence(det?.score ?? 0)
        if (det && det.score > 0.5 && !verifyingRef.current) {
          verifyingRef.current = true
          clearInterval(detectionRef.current!)
          detectionRef.current = null

          // Capture frame for verification
          const canvas = document.createElement('canvas')
          canvas.width = video.videoWidth
          canvas.height = video.videoHeight
          const ctx = canvas.getContext('2d')!
          ctx.translate(canvas.width, 0); ctx.scale(-1, 1)
          ctx.drawImage(video, 0, 0)

          try {
            const imgDet = await faceapi.detectSingleFace(canvas).withFaceLandmarks().withFaceDescriptor()
            if (imgDet) {
              await handleVerifyFace(Array.from(imgDet.descriptor), det.score)
            } else {
              setError('Could not extract face features.')
              verifyingRef.current = false
              startFaceDetection()
            }
          } catch {
            setError('Verification failed.')
            verifyingRef.current = false
            startFaceDetection()
          }
        }
      } catch { /* ignore */ }
    }, 500)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /* ================================================================ */
  /*  RENDER                                                          */
  /* ================================================================ */

  const cameraActive = status === 'camera' || status === 'verifying'

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
          {/* Header */}
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

          {/* ---- Camera preview ---- */}
          <div className="relative rounded-2xl overflow-hidden bg-secondary aspect-video mb-6">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
              style={{ transform: 'scaleX(-1)' }}
            />

            {/* Idle overlay */}
            {!cameraActive && status !== 'success' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-secondary/90 backdrop-blur-sm z-10">
                <Camera className="w-12 h-12 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Camera is off</span>
              </div>
            )}

            {/* Active badge */}
            {cameraActive && (
              <div className="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-xs font-medium z-20">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                {status === 'verifying' ? 'Verifying...' : 'Camera active'}
              </div>
            )}

            {/* Face overlay */}
            {cameraActive && (
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-60 border-2 rounded-full transition-all border-primary/30 animate-pulse" />
                <div className="absolute bottom-4 left-4">
                  <div className={`px-3 py-1.5 rounded-full text-xs font-medium ${
                    faceDetected ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-primary/20 text-primary border border-primary/30'
                  }`}>
                    {faceDetected ? 'Face Detected' : 'Looking for face...'}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Password fallback */}
          {showPasswordFallback && (
            <div className="space-y-4 mb-6">
              <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                <KeyRound className="w-4 h-4 text-amber-400 shrink-0" />
                <p className="text-sm text-amber-400">Fallback to password verification</p>
              </div>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password" className="input-field" />
              <button onClick={async () => {
                const userId = sessionStorage.getItem('userId') || ''
                const username = sessionStorage.getItem('user') || ''
                try {
                  const res = await fetch('/api/signin', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password }),
                  })
                  const data = await res.json()
                  if (data.success) { setStatus('success'); setMessage('Password verified.'); setTimeout(() => router.push('/dashboard'), 1500) }
                  else setError('Incorrect password.')
                } catch { setError('Verification failed.') }
              }} className="w-full btn-secondary">Verify with Password</button>
            </div>
          )}

          {/* Action buttons */}
          {!showPasswordFallback && (
            <div className="flex gap-3">
              {status === 'idle' && (
                <button
                  onClick={startCamera}
                  disabled={!modelsReady}
                  className="w-full btn-primary disabled:opacity-50"
                >
                  <Camera className="w-5 h-5 mr-2" />
                  {modelsReady ? 'Start Verification' : 'Loading Models...'}
                </button>
              )}
              {cameraActive && (
                <button onClick={stopCamera} className="w-full btn-secondary">Cancel</button>
              )}
              {status === 'error' && !showPasswordFallback && (
                <button
                  onClick={() => { setError(''); setRetries(0); setStatus('idle'); setMessage('Start verification to compare your face.') }}
                  className="w-full btn-primary"
                >
                  <Camera className="w-5 h-5 mr-2" /> Try Again
                </button>
              )}
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
