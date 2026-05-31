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
/*  Reusable CameraPreview component                                   */
/* ------------------------------------------------------------------ */

interface CameraPreviewProps {
  streamRef: React.MutableRefObject<MediaStream | null>
  isActive: boolean
  onStatusChange: (status: 'idle' | 'camera' | 'detecting' | 'verifying' | 'success' | 'error') => void
  onFaceDetected: (detected: boolean, score: number) => void
  modelsReadyRef: React.MutableRefObject<boolean>
  onVerifyFace: (embedding: number[], confidence: number) => Promise<void>
}

function CameraPreview({ streamRef, isActive, onStatusChange, onFaceDetected, modelsReadyRef, onVerifyFace }: CameraPreviewProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const detectionRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [streamActive, setStreamActive] = useState(false)
  const verifyingRef = useRef(false)

  /* ---- start camera ---- */
  const startCamera = useCallback(async () => {
    if (!modelsReadyRef.current) { setError('Models not loaded yet.'); return }
    setError('')
    setLoading(true)
    verifyingRef.current = false

    // stop any existing stream first
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false,
      })
      streamRef.current = stream

      const video = videoRef.current
      if (!video) { setError('Video element not available.'); setLoading(false); return }

      video.srcObject = stream
      video.autoplay = true
      video.playsInline = true
      video.muted = true

      // Wait for metadata then play
      if (video.readyState < 1) {
        await new Promise<void>((resolve, reject) => {
          const onLoaded = () => { video.removeEventListener('loadedmetadata', onLoaded); resolve() }
          const onError = () => { video.removeEventListener('error', onError); reject(new Error('video error')) }
          video.addEventListener('loadedmetadata', onLoaded)
          video.addEventListener('error', onError)
          setTimeout(() => reject(new Error('loadedmetadata timeout')), 8000)
        })
      }

      await video.play()
      setStreamActive(true)
      setLoading(false)
      onStatusChange('camera')
    } catch (err: unknown) {
      setLoading(false)
      setStreamActive(false)
      const e = err as Error
      if (e.name === 'NotAllowedError') setError('Camera permission denied. Please allow camera access in your browser settings.')
      else if (e.name === 'NotFoundError') setError('No camera found on this device.')
      else if (e.name === 'NotReadableError') setError('Camera is in use by another application.')
      else setError(`Failed to open camera: ${e.message || 'Unknown error'}`)
      onStatusChange('error')
    }
  }, [modelsReadyRef, onStatusChange, streamRef])

  /* ---- stop camera ---- */
  const stopCamera = useCallback(() => {
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null }
    if (detectionRef.current) { clearInterval(detectionRef.current); detectionRef.current = null }
    const video = videoRef.current
    if (video) { video.srcObject = null }
    setStreamActive(false)
    onFaceDetected(false, 0)
    verifyingRef.current = false
  }, [onFaceDetected, streamRef])

  /* ---- face detection loop ---- */
  useEffect(() => {
    if (!isActive || !streamActive) return
    const video = videoRef.current
    if (!video || video.readyState < 4) return
    if (verifyingRef.current) return

    onStatusChange('detecting')
    onFaceDetected(false, 0)

    detectionRef.current = setInterval(async () => {
      if (!video || video.readyState !== 4 || verifyingRef.current) return
      try {
        const det = await faceapi.detectSingleFace(video)
        if (det) {
          onFaceDetected(true, det.score)
          if (det.score > 0.5 && !verifyingRef.current) {
            verifyingRef.current = true
            onStatusChange('verifying')
            clearInterval(detectionRef.current!)
            detectionRef.current = null
            // capture frame for verification
            const canvas = document.createElement('canvas')
            canvas.width = video.videoWidth
            canvas.height = video.videoHeight
            const ctx = canvas.getContext('2d')
            if (ctx) {
              ctx.drawImage(video, 0, 0)
              try {
                const imgDet = await faceapi.detectSingleFace(canvas).withFaceLandmarks().withFaceDescriptor()
                if (imgDet) {
                  await onVerifyFace(Array.from(imgDet.descriptor), det.score)
                } else {
                  setError('No face features extracted.')
                  onStatusChange('error')
                  verifyingRef.current = false
                  stopCamera()
                }
              } catch (verifyErr) {
                console.error('Verification error:', verifyErr)
                setError('Verification failed.')
                onStatusChange('error')
                verifyingRef.current = false
                stopCamera()
              }
            }
          }
        } else {
          onFaceDetected(false, 0)
        }
      } catch { /* ignore individual detection errors */ }
    }, 300)

    return () => {
      if (detectionRef.current) { clearInterval(detectionRef.current); detectionRef.current = null }
    }
  }, [isActive, streamActive, onStatusChange, onFaceDetected, onVerifyFace, stopCamera])

  /* Start camera when isActive becomes true */
  useEffect(() => {
    if (isActive && !loading && !streamActive && !error) {
      startCamera()
    }
  }, [isActive, loading, streamActive, error, startCamera])

  /* cleanup on unmount */
  useEffect(() => { return () => { if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null } } }, [streamRef])

  return (
    <div className="relative rounded-2xl overflow-hidden bg-secondary aspect-video mb-6">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="w-full h-full object-cover"
        style={{ display: isActive && streamActive ? 'block' : 'none' }}
      />

      {/* Loading skeleton */}
      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-secondary">
          <Loader2 className="w-10 h-10 text-primary animate-spin" />
          <span className="text-sm text-muted-foreground">Initializing camera...</span>
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-secondary">
          <AlertCircle className="w-10 h-10 text-red-400" />
          <span className="text-sm text-red-400 text-center px-6">{error}</span>
        </div>
      )}

      {/* Idle state */}
      {!isActive && !loading && !error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-secondary">
          <Camera className="w-12 h-12 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Camera is off</span>
        </div>
      )}

      {/* Active badge */}
      {isActive && streamActive && !loading && (
        <div className="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-xs font-medium">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          Camera active
        </div>
      )}

      {/* Face detection overlay */}
      {isActive && streamActive && !loading && (
        <>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-60 border-2 rounded-full transition-all border-primary/30 animate-pulse" />
          <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between">
            <div className={`px-3 py-1.5 rounded-full text-xs font-medium ${
              streamActive ? 'bg-primary/20 text-primary border border-primary/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'
            }`}>
              {verifyingRef.current ? 'Verifying...' : 'Looking for face...'}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function VerifyPage() {
  const router = useRouter()
  const [status, setStatus] = useState<'idle' | 'camera' | 'detecting' | 'verifying' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('Start verification to compare your face')
  const [error, setError] = useState('')
  const [confidence, setConfidence] = useState(0)
  const [retries, setRetries] = useState(0)
  const [showPasswordFallback, setShowPasswordFallback] = useState(false)
  const [password, setPassword] = useState('')
  const [faceDetected, setFaceDetected] = useState(false)

  const streamRef = useRef<MediaStream | null>(null)
  const modelsReady = useRef(false)

  /* Load face-api models on mount */
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
    return () => { if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null } }
  }, [])

  /* Check enrollment on mount */
  useEffect(() => {
    const userId = sessionStorage.getItem('userId') || ''
    if (!userId) { setError('No session found. Please sign in first.'); return }
    fetch(`/api/verify-face?userId=${userId}`)
      .then(r => r.json())
      .then(d => { if (!d.hasProfile) { setMessage('No face enrolled. Redirecting...'); setTimeout(() => router.push('/enroll'), 2000) } })
      .catch(() => setMessage('Ready to verify your face.'))
  }, [router])

  /* Stop camera helper */
  const stopCamera = useCallback(() => {
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null }
    setStatus('idle')
    setMessage('Start verification to compare your face.')
    setFaceDetected(false)
    setConfidence(0)
  }, [])

  /* Verification callback - passed to CameraPreview */
  const handleVerifyFace = useCallback(async (embedding: number[], detectedConfidence: number) => {
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
          stopCamera()
        }
      }
    } catch {
      setError('Verification failed.')
      setStatus('error')
      stopCamera()
    }
  }, [retries, router, stopCamera])

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

          {/* Messages */}
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

          {/* Confidence badge when detecting */}
          {(status === 'detecting' || status === 'camera') && faceDetected && confidence > 0 && (
            <div className="text-center mb-2">
              <span className="px-3 py-1.5 rounded-full text-xs font-medium bg-primary/20 text-primary border border-primary/30">
                Face match confidence: {Math.round(confidence * 100)}%
              </span>
            </div>
          )}

          {/* Camera Preview - ALWAYS mounted, but stream starts on demand */}
          {(status === 'camera' || status === 'detecting' || status === 'verifying' || status === 'idle' || status === 'error') && (
            <CameraPreview
              streamRef={streamRef}
              isActive={status === 'camera' || status === 'detecting' || status === 'verifying'}
              onStatusChange={(newStatus) => {
                if (newStatus === 'verifying') {
                  setStatus('verifying')
                  setMessage('Verifying your face...')
                } else {
                  setStatus(newStatus)
                }
              }}
              onFaceDetected={(detected, score) => { setFaceDetected(detected); setConfidence(score) }}
              modelsReadyRef={modelsReady}
              onVerifyFace={handleVerifyFace}
            />
          )}

          {/* Retries info */}
          {status === 'error' && retries < MAX_RETRIES && (
            <div className="text-center mb-4">
              <span className="text-sm text-amber-400">{MAX_RETRIES - retries} retries remaining</span>
            </div>
          )}

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
                  if (data.success) { setStatus('success'); setMessage('Password verified. Access granted.'); setTimeout(() => router.push('/dashboard'), 1500) }
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
                  onClick={() => setStatus('camera')}
                  className="w-full btn-primary"
                >
                  <Camera className="w-5 h-5 mr-2" /> Start Verification
                </button>
              )}
              {(status === 'detecting' || status === 'camera') && (
                <button onClick={stopCamera} className="w-full btn-secondary">Cancel</button>
              )}
              {status === 'error' && !showPasswordFallback && retries < MAX_RETRIES && (
                <button
                  onClick={() => { setError(''); setStatus('idle'); setRetries(prev => prev) }}
                  className="w-full btn-primary"
                >
                  <Camera className="w-5 h-5 mr-2" /> Try Again
                </button>
              )}
            </div>
          )}

          {/* Navigation links */}
          <div className="mt-6 flex items-center justify-between">
            <Link href="/dashboard" className="text-sm text-muted-foreground hover:text-primary transition-colors">Back to Dashboard</Link>
            <Link href="/settings" className="text-sm text-muted-foreground hover:text-primary transition-colors">Security Settings</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
