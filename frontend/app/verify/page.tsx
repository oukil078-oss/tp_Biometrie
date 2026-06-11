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
  modelsReady: boolean
  onStatusChange: (status: 'camera' | 'detecting' | 'verifying' | 'error') => void
  onFaceDetected: (detected: boolean, score: number) => void
  onVerifyFace: (embedding: number[], score: number) => Promise<void>
}

function CameraPreview({
  isActive,
  modelsReady,
  onStatusChange,
  onFaceDetected,
  onVerifyFace,
}: CameraPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const detectionRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const mountedRef = useRef(true)
  const startingRef = useRef(false)
  const verifyingRef = useRef(false)
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  // Keep callback refs updated
  const onFaceDetectedRef = useRef(onFaceDetected)
  const onVerifyFaceRef = useRef(onVerifyFace)
  const onStatusChangeRef = useRef(onStatusChange)
  useEffect(() => { onFaceDetectedRef.current = onFaceDetected }, [onFaceDetected])
  useEffect(() => { onVerifyFaceRef.current = onVerifyFace }, [onVerifyFace])
  useEffect(() => { onStatusChangeRef.current = onStatusChange }, [onStatusChange])

  // Mounted tracking – DO NOT reset startingRef here (see enroll page for explanation)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  /* ---------------------------------------------------------------- */
  /*  startFaceDetection                                               */
  /* ---------------------------------------------------------------- */
  const startFaceDetection = useCallback(() => {
    if (detectionRef.current) {
      clearInterval(detectionRef.current)
      detectionRef.current = null
    }

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
            if (mountedRef.current) onStatusChangeRef.current('verifying')

            clearInterval(detectionRef.current!)
            detectionRef.current = null

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
                  if (mountedRef.current) {
                    setErrorMsg('Could not extract face features.')
                    verifyingRef.current = false
                    onStatusChangeRef.current('error')
                  }
                }
              } catch (verifyErr) {
                console.error('[Verify CameraPreview] Verification error:', verifyErr)
                if (mountedRef.current) {
                  setErrorMsg('Verification failed.')
                  verifyingRef.current = false
                  onStatusChangeRef.current('error')
                }
              }
            }
          }
        } else {
          onFaceDetectedRef.current(false, 0)
        }
      } catch {
        // detection error, ignore
      }
    }, 500)
  }, [])

  /* ---------------------------------------------------------------- */
  /*  startCamera                                                      */
  /* ---------------------------------------------------------------- */
  const startCamera = useCallback(async () => {
    if (startingRef.current) return
    if (!modelsReady) {
      console.log('[Verify CameraPreview] Models not ready, skipping')
      return
    }

    startingRef.current = true
    console.log('[Verify CameraPreview] Starting camera...')
    setErrorMsg('')
    verifyingRef.current = false

    // Only stop existing stream if one actually exists
    if (streamRef.current) {
      console.log('[Verify CameraPreview] Stopping existing stream')
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
      const v = videoRef.current
      if (v) v.srcObject = null
    }

    if (mountedRef.current) setState('loading')

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false,
      })

      if (!mountedRef.current) {
        stream.getTracks().forEach(t => t.stop())
        startingRef.current = false
        return
      }

      if (stream.getVideoTracks().length === 0) {
        stream.getTracks().forEach(t => t.stop())
        throw new Error('No video tracks found in camera stream.')
      }

      streamRef.current = stream
      console.log('[Verify CameraPreview] Stream obtained:', stream.id)

      const video = videoRef.current
      if (!video) {
        stream.getTracks().forEach(t => t.stop())
        streamRef.current = null
        throw new Error('Video element not found.')
      }

      video.muted = true
      video.autoplay = true
      video.playsInline = true
      video.srcObject = stream
      console.log('[Verify CameraPreview] srcObject assigned, waiting for video data...')

      // Wait for video data using polling + events
      await new Promise<void>((resolve, reject) => {
        const deadline = setTimeout(() => {
          clearInterval(poll)
          reject(new Error('Camera initialization timed out.'))
        }, 15_000)

        let resolved = false
        const done = () => {
          if (resolved) return
          resolved = true
          clearTimeout(deadline)
          clearInterval(poll)
          resolve()
        }

        const poll = setInterval(() => {
          if (video.readyState >= 2 && video.videoWidth > 0) done()
        }, 50)

        video.addEventListener('loadeddata', () => done(), { once: true })
        video.addEventListener('error', () => {
          if (!resolved) { clearTimeout(deadline); clearInterval(poll); reject(new Error('Video element error.')) }
        }, { once: true })

        if (video.readyState >= 2 && video.videoWidth > 0) done()
      })

      if (!mountedRef.current) { startingRef.current = false; return }

      try {
        await video.play()
        console.log('[Verify CameraPreview] play() succeeded')
      } catch {
        await new Promise(r => setTimeout(r, 150))
        try {
          await video.play()
        } catch {
          if (video.readyState < 2) throw new Error('Video playback failed.')
        }
      }

      if (!mountedRef.current) { startingRef.current = false; return }

      console.log('[Verify CameraPreview] Camera ready!', video.videoWidth, 'x', video.videoHeight)
      setState('ready')
      startingRef.current = false
      onStatusChangeRef.current('camera')
      startFaceDetection()
    } catch (err: unknown) {
      if (!mountedRef.current) { startingRef.current = false; return }

      console.error('[Verify CameraPreview] Camera error:', err)
      startingRef.current = false

      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop())
        streamRef.current = null
      }
      const v = videoRef.current
      if (v) v.srcObject = null

      const e = err as Error
      if (e.name === 'NotAllowedError') setErrorMsg('Camera permission denied. Please allow camera access.')
      else if (e.name === 'NotFoundError') setErrorMsg('No camera found on this device.')
      else if (e.name === 'NotReadableError') setErrorMsg('Camera is in use by another application.')
      else setErrorMsg(e.message || 'Camera error.')

      setState('error')
      onStatusChangeRef.current('error')
    }
  }, [modelsReady, startFaceDetection])

  /* ---------------------------------------------------------------- */
  /*  stopCamera                                                       */
  /* ---------------------------------------------------------------- */
  const stopCamera = useCallback(() => {
    console.log('[Verify CameraPreview] Stopping camera')
    startingRef.current = false
    verifyingRef.current = false
    if (detectionRef.current) { clearInterval(detectionRef.current); detectionRef.current = null }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null }
    const v = videoRef.current
    if (v) v.srcObject = null
    setState('idle')
    setErrorMsg('')
    onFaceDetectedRef.current(false, 0)
  }, [])

  /* ---------------------------------------------------------------- */
  /*  Auto-start / auto-stop                                           */
  /* ---------------------------------------------------------------- */
  useEffect(() => {
    if (isActive && state === 'idle' && modelsReady && !startingRef.current) {
      console.log('[Verify CameraPreview] Auto-starting camera')
      startCamera()
    }
    if (!isActive && (state === 'ready' || state === 'loading')) {
      console.log('[Verify CameraPreview] Deactivating')
      stopCamera()
    }
  }, [isActive, state, modelsReady, startCamera, stopCamera])

  /* ---------------------------------------------------------------- */
  /*  Cleanup on unmount (do NOT reset startingRef)                    */
  /* ---------------------------------------------------------------- */
  useEffect(() => {
    return () => {
      if (detectionRef.current) clearInterval(detectionRef.current)
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop())
        streamRef.current = null
      }
    }
  }, [])

  const handleRetry = useCallback(() => {
    setErrorMsg('')
    setState('idle')
    startingRef.current = false
    setTimeout(() => startCamera(), 50)
  }, [startCamera])

  return (
    <div className="relative rounded-2xl overflow-hidden bg-secondary aspect-video mb-6">
      {/* Video – ALWAYS in DOM and visible */}
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
          <button onClick={handleRetry} className="btn-primary text-sm px-4 py-2">
            Retry <Camera className="w-4 h-4 ml-1" />
          </button>
        </div>
      )}

      {/* Idle overlay */}
      {state === 'idle' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-secondary/90 backdrop-blur-sm z-10">
          <Camera className="w-12 h-12 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Camera is off</span>
          {isActive && modelsReady && (
            <button onClick={startCamera} className="btn-primary text-sm px-4 py-2 mt-2">
              <Camera className="w-4 h-4 mr-1" /> Open Camera
            </button>
          )}
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
              Looking for face...
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
  const [modelsReady, setModelsReady] = useState(false) // ← STATE not ref!

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
        setModelsReady(true)
        console.log('[Verify] Models loaded')
      } catch {
        setError('Failed to load face detection models.')
      }
    }
    load()
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
        fetch('/api/audit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, eventType: 'biometric_success', details: 'Face verification successful' }) })
        setTimeout(() => router.push('/dashboard'), 2000)
      } else {
        const nr = retries + 1
        setRetries(nr)
        if (nr >= MAX_RETRIES) {
          setError(`Max retries (${MAX_RETRIES}) reached. Use password fallback.`)
          setStatus('error')
          setShowPasswordFallback(true)
        } else {
          setError(`Verification failed (${nr}/${MAX_RETRIES}). Try again.`)
          setStatus('idle')
          setMessage('Start verification to compare your face.')
        }
      }
    } catch {
      setError('Verification request failed.')
      setStatus('error')
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

          {(status === 'detecting' || status === 'camera') && faceDetected && confidence > 0 && (
            <div className="text-center mb-2">
              <span className="px-3 py-1.5 rounded-full text-xs font-medium bg-primary/20 text-primary border border-primary/30">
                Face match confidence: {Math.round(confidence * 100)}%
              </span>
            </div>
          )}

          {/* Camera Preview – ALWAYS mounted, controlled by isActive */}
          <CameraPreview
            isActive={status === 'camera' || status === 'detecting' || status === 'verifying'}
            modelsReady={modelsReady}
            onStatusChange={(newStatus) => {
              if (newStatus === 'camera') { setStatus('camera'); setMessage('Position your face in the frame.') }
              else if (newStatus === 'detecting') { setStatus('detecting'); setMessage('Looking for your face...') }
              else if (newStatus === 'verifying') { setStatus('verifying'); setMessage('Verifying your face...') }
            }}
            onFaceDetected={(detected, score) => { setFaceDetected(detected); setConfidence(score) }}
            onVerifyFace={handleVerifyFace}
          />

          {status === 'error' && retries < MAX_RETRIES && (
            <div className="text-center mb-4">
              <span className="text-sm text-amber-400">{MAX_RETRIES - retries} retries remaining</span>
            </div>
          )}

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

          {!showPasswordFallback && (
            <div className="flex gap-3">
              {status === 'idle' && (
                <button
                  onClick={() => { setError(''); setStatus('camera'); setMessage('Opening camera...') }}
                  disabled={!modelsReady}
                  className="w-full btn-primary disabled:opacity-50"
                >
                  <Camera className="w-5 h-5 mr-2" />
                  {modelsReady ? 'Start Verification' : 'Loading Models...'}
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

          <div className="mt-6 flex items-center justify-between">
            <Link href="/dashboard" className="text-sm text-muted-foreground hover:text-primary transition-colors">Back to Dashboard</Link>
            <Link href="/settings" className="text-sm text-muted-foreground hover:text-primary transition-colors">Security Settings</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
