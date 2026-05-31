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
/*  Camera Preview Component                                           */
/* ------------------------------------------------------------------ */

interface CameraPreviewProps {
  isActive: boolean
  modelsReadyRef: React.MutableRefObject<boolean>
  onStatusChange: (status: 'camera' | 'detecting' | 'verifying' | 'error') => void
  onFaceDetected: (detected: boolean, score: number) => void
  onVerifyFace: (embedding: number[], score: number) => Promise<void>
}

function CameraPreview({ isActive, modelsReadyRef, onStatusChange, onFaceDetected, onVerifyFace }: CameraPreviewProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const detectionRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const verifyingRef = useRef(false)
  const startedRef = useRef(false)
  const onFaceDetectedRef = useRef(onFaceDetected)
  const onVerifyFaceRef = useRef(onVerifyFace)
  const onStatusChangeRef = useRef(onStatusChange)

  // Keep refs updated
  useEffect(() => { onFaceDetectedRef.current = onFaceDetected }, [onFaceDetected])
  useEffect(() => { onVerifyFaceRef.current = onVerifyFace }, [onVerifyFace])
  useEffect(() => { onStatusChangeRef.current = onStatusChange }, [onStatusChange])

  /* ---- start camera ---- */
  const startCamera = useCallback(async () => {
    if (startedRef.current) return
    if (!modelsReadyRef.current) {
      console.log('[Verify CameraPreview] Models not ready, skipping')
      return
    }

    startedRef.current = true
    console.log('[Verify CameraPreview] Starting camera...')
    setErrorMsg('')
    setState('loading')
    verifyingRef.current = false

    // Stop existing stream
    if (streamRef.current) {
      console.log('[Verify CameraPreview] Stopping existing stream')
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false,
      })
      streamRef.current = stream
      console.log('[Verify CameraPreview] Stream obtained:', stream.id)

      const video = videoRef.current
      if (!video) {
        throw new Error('Video element not found')
      }

      console.log('[Verify CameraPreview] Assigning stream to video...')
      video.srcObject = stream
      video.setAttribute('autoplay', '')
      video.setAttribute('playsinline', '')
      video.setAttribute('muted', '')
      video.autoplay = true
      video.playsInline = true
      video.muted = true

      // Wait for video data
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Video loading timeout')), 10000)
        if (video.readyState >= 2) { clearTimeout(timeout); resolve(); return }
        video.addEventListener('loadedmetadata', () => { clearTimeout(timeout); resolve() }, { once: true })
        video.addEventListener('error', () => { clearTimeout(timeout); reject(new Error('Video error')) }, { once: true })
      })

      console.log('[Verify CameraPreview] Video readyState:', video.readyState)

      // Try to play
      try {
        await video.play()
        console.log('[Verify CameraPreview] Video.play() succeeded')
      } catch (playErr) {
        console.warn('[Verify CameraPreview] play() rejected:', playErr)
        if (video.readyState < 2) throw new Error('Video playback failed')
      }

      setState('ready')
      startedRef.current = false
      onStatusChangeRef.current('camera')

      // Start face detection
      startFaceDetection()
    } catch (err: unknown) {
      console.error('[Verify CameraPreview] Camera error:', err)
      startedRef.current = false
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop())
        streamRef.current = null
      }

      const e = err as Error
      if (e.name === 'NotAllowedError') setErrorMsg('Camera permission denied.')
      else if (e.name === 'NotFoundError') setErrorMsg('No camera found.')
      else if (e.name === 'NotReadableError') setErrorMsg('Camera in use by another app.')
      else setErrorMsg(`Camera error: ${e.message}`)

      setState('error')
      onStatusChangeRef.current('error')
    }
  }, [modelsReadyRef])

  /* ---- face detection ---- */
  const startFaceDetection = useCallback(() => {
    console.log('[Verify CameraPreview] Starting face detection')
    onFaceDetectedRef.current(false, 0)

    detectionRef.current = setInterval(async () => {
      const video = videoRef.current
      if (!video || video.readyState < 2 || verifyingRef.current) return

      try {
        const det = await faceapi.detectSingleFace(video)
        if (det) {
          onFaceDetectedRef.current(true, det.score)
          if (det.score > 0.5 && !verifyingRef.current) {
            verifyingRef.current = true
            console.log('[Verify CameraPreview] Face detected! Starting verification...')
            onStatusChangeRef.current('verifying')

            clearInterval(detectionRef.current!)
            detectionRef.current = null

            // Capture frame
            const canvas = document.createElement('canvas')
            canvas.width = video.videoWidth
            canvas.height = video.videoHeight
            const ctx = canvas.getContext('2d')
            if (ctx) {
              ctx.translate(canvas.width, 0)
              ctx.scale(-1, 1)
              ctx.drawImage(video, 0, 0)

              try {
                const imgDet = await faceapi.detectSingleFace(canvas).withFaceLandmarks().withFaceDescriptor()
                if (imgDet) {
                  await onVerifyFaceRef.current(Array.from(imgDet.descriptor), det.score)
                } else {
                  setErrorMsg('Could not extract face features.')
                  verifyingRef.current = false
                  onStatusChangeRef.current('error')
                }
              } catch (verifyErr) {
                console.error('[Verify CameraPreview] Verification error:', verifyErr)
                setErrorMsg('Verification failed.')
                verifyingRef.current = false
                onStatusChangeRef.current('error')
              }
            }
          }
        } else {
          onFaceDetectedRef.current(false, 0)
        }
      } catch (e) {
        console.warn('[Verify CameraPreview] Detection error:', e)
      }
    }, 500)
  }, [])

  /* ---- stop camera ---- */
  const stopCamera = useCallback(() => {
    console.log('[Verify CameraPreview] Stopping camera')
    startedRef.current = false
    if (detectionRef.current) { clearInterval(detectionRef.current); detectionRef.current = null }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null }
    const video = videoRef.current
    if (video) video.srcObject = null
    setState('idle')
    setErrorMsg('')
    onFaceDetectedRef.current(false, 0)
    verifyingRef.current = false
  }, [])

  /* ---- auto-start ---- */
  useEffect(() => {
    if (isActive && state === 'idle' && modelsReadyRef.current && !startedRef.current) {
      console.log('[Verify CameraPreview] Auto-starting camera')
      startCamera()
    }
    if (!isActive && (state === 'ready' || state === 'loading')) {
      console.log('[Verify CameraPreview] Deactivating')
      stopCamera()
    }
  }, [isActive, state, modelsReadyRef, startCamera, stopCamera])

  /* ---- cleanup ---- */
  useEffect(() => {
    return () => {
      console.log('[Verify CameraPreview] Cleanup')
      if (detectionRef.current) clearInterval(detectionRef.current)
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
    }
  }, [])

  return (
    <div className="relative rounded-2xl overflow-hidden bg-secondary aspect-video mb-6">
      {/* Video - ALWAYS in DOM and visible */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="w-full h-full object-cover"
        style={{ transform: 'scaleX(-1)' }}
      />

      {/* Loading overlay */}
      {state === 'loading' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-secondary/90 backdrop-blur-sm z-10">
          <Loader2 className="w-10 h-10 text-primary animate-spin" />
          <span className="text-sm text-muted-foreground">Initializing camera...</span>
        </div>
      )}

      {/* Error overlay */}
      {state === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-secondary/90 backdrop-blur-sm z-10">
          <AlertCircle className="w-10 h-10 text-red-400" />
          <span className="text-sm text-red-400 text-center px-6">{errorMsg}</span>
        </div>
      )}

      {/* Idle overlay */}
      {state === 'idle' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-secondary/90 backdrop-blur-sm z-10">
          <Camera className="w-12 h-12 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Camera is off</span>
        </div>
      )}

      {/* Active badge */}
      {state === 'ready' && (
        <div className="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-xs font-medium z-20">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          Camera active
        </div>
      )}

      {/* Face detection overlay */}
      {state === 'ready' && (
        <>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-60 border-2 rounded-full transition-all border-primary/30 animate-pulse" />
          <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between">
            <div className="px-3 py-1.5 rounded-full text-xs font-medium bg-primary/20 text-primary border border-primary/30">
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

  /* Load face-api models */
  useEffect(() => {
    const load = async () => {
      try {
        console.log('[Verify] Loading models from', MODEL_URL)
        await Promise.all([
          faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        ])
        modelsReady.current = true
        console.log('[Verify] Models loaded')
      } catch {
        setError('Failed to load face detection models.')
      }
    }
    load()
    return () => { if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null } }
  }, [])

  /* Check enrollment */
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
    setRetries(0)
    setError('')
  }, [])

  /* Verification callback */
  const handleVerifyFace = useCallback(async (embedding: number[], _score: number) => {
    try {
      console.log('[Verify] Sending face data to server...')
      setStatus('verifying')
      setMessage('Comparing face with enrolled profile...')

      const userId = sessionStorage.getItem('userId') || ''
      const res = await fetch('/api/verify-face', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, embedding }),
      })
      const data = await res.json()

      if (data.success) {
        console.log('[Verify] Verification successful!')
        setStatus('success')
        setMessage('Face verified successfully!')
        if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null }
        fetch('/api/audit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, eventType: 'biometric_success', details: 'Face verification successful' }) })
        setTimeout(() => router.push('/dashboard'), 2000)
      } else {
        console.warn('[Verify] Verification failed:', data.message)
        const nr = retries + 1
        setRetries(nr)
        if (nr >= MAX_RETRIES) {
          setError(`Max retries (${MAX_RETRIES}) reached. Use password fallback.`)
          setStatus('error')
          setShowPasswordFallback(true)
          if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null }
        } else {
          setError(`Verification failed (${nr}/${MAX_RETRIES}). Try again.`)
          setStatus('idle')
          setMessage('Start verification to compare your face.')
          if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null }
        }
      }
    } catch {
      console.error('[Verify] Verification request error')
      setError('Verification request failed.')
      setStatus('error')
      if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null }
    }
  }, [retries, router])

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

          {/* Confidence badge */}
          {(status === 'detecting' || status === 'camera') && faceDetected && confidence > 0 && (
            <div className="text-center mb-2">
              <span className="px-3 py-1.5 rounded-full text-xs font-medium bg-primary/20 text-primary border border-primary/30">
                Face match confidence: {Math.round(confidence * 100)}%
              </span>
            </div>
          )}

          {/* Camera Preview - ALWAYS mounted */}
          <CameraPreview
            isActive={status === 'camera' || status === 'detecting' || status === 'verifying'}
            onStatusChange={(newStatus) => {
              if (newStatus === 'camera') { setStatus('camera'); setMessage('Position your face in the frame.') }
              else if (newStatus === 'detecting') { setStatus('detecting'); setMessage('Looking for your face...') }
              else if (newStatus === 'verifying') { setStatus('verifying'); setMessage('Verifying your face...') }
            }}
            onFaceDetected={(detected, score) => { setFaceDetected(detected); setConfidence(score) }}
            modelsReadyRef={modelsReady}
            onVerifyFace={handleVerifyFace}
          />

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
                <button onClick={() => { setError(''); setStatus('camera'); setMessage('Opening camera...') }} className="w-full btn-primary">
                  <Camera className="w-5 h-5 mr-2" /> Start Verification
                </button>
              )}
              {(status === 'detecting' || status === 'camera') && (
                <button onClick={stopCamera} className="w-full btn-secondary">Cancel</button>
              )}
              {status === 'error' && !showPasswordFallback && retries < MAX_RETRIES && (
                <button onClick={() => { setError(''); setRetries(0); setStatus('idle'); setMessage('Start verification to compare your face.') }} className="w-full btn-primary">
                  <Camera className="w-5 h-5 mr-2" /> Try Again
                </button>
              )}
            </div>
          )}

          {/* Navigation */}
          <div className="mt-6 flex items-center justify-between">
            <Link href="/dashboard" className="text-sm text-muted-foreground hover:text-primary transition-colors">Back to Dashboard</Link>
            <Link href="/settings" className="text-sm text-muted-foreground hover:text-primary transition-colors">Security Settings</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
