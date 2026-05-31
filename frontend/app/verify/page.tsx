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
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [streamActive, setStreamActive] = useState(false)
  const verifyingRef = useRef(false)
  const startingRef = useRef(false)

  /* ---- start camera ---- */
  const startCamera = useCallback(async () => {
    if (startingRef.current) return
    startingRef.current = true

    if (!modelsReadyRef.current) {
      setError('Face detection models not loaded yet.')
      startingRef.current = false
      onStatusChange('error')
      return
    }

    console.log('[Verify CameraPreview] Starting camera...')
    setError('')
    setLoading(true)
    setStreamActive(false)
    verifyingRef.current = false

    // stop any existing stream first
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
      console.log('[Verify CameraPreview] Got stream:', stream.id)

      const video = videoRef.current
      if (!video) {
        setError('Video element not available in DOM.')
        setLoading(false)
        startingRef.current = false
        onStatusChange('error')
        return
      }

      // Explicitly set attributes for mobile/Safari compatibility
      video.setAttribute('autoplay', 'true')
      video.setAttribute('playsinline', 'true')
      video.setAttribute('muted', 'true')
      video.autoplay = true
      video.playsInline = true
      video.muted = true

      // Assign stream to video
      video.srcObject = stream
      console.log('[Verify CameraPreview] srcObject assigned')

      // Wait for metadata then play
      if (video.readyState < 1) {
        await new Promise<void>((resolve, reject) => {
          const onLoaded = () => {
            video.removeEventListener('loadedmetadata', onLoaded)
            resolve()
          }
          const onErr = () => {
            video.removeEventListener('error', onErr)
            reject(new Error('video element error'))
          }
          video.addEventListener('loadedmetadata', onLoaded)
          video.addEventListener('error', onErr)
          setTimeout(() => reject(new Error('loadedmetadata timeout')), 8000)
        })
      }

      console.log('[Verify CameraPreview] readyState:', video.readyState)
      await video.play()
      console.log('[Verify CameraPreview] video.play() succeeded')
      setStreamActive(true)
      setLoading(false)
      startingRef.current = false
      onStatusChange('camera')
    } catch (err: unknown) {
      console.error('[Verify CameraPreview] Camera error:', err)
      setLoading(false)
      setStreamActive(false)
      startingRef.current = false
      const e = err as Error

      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop())
        streamRef.current = null
      }

      if (e.name === 'NotAllowedError')
        setError('Camera permission denied. Please allow camera access in your browser settings.')
      else if (e.name === 'NotFoundError')
        setError('No camera found on this device.')
      else if (e.name === 'NotReadableError')
        setError('Camera is in use by another application.')
      else if (e.name === 'SecurityError')
        setError('Camera access blocked. Make sure you are on a secure (HTTPS) connection or localhost.')
      else
        setError(`Failed to open camera: ${e.message || 'Unknown error'}`)

      onStatusChange('error')
    }
  }, [modelsReadyRef, onStatusChange])

  /* ---- stop camera ---- */
  const stopCamera = useCallback(() => {
    console.log('[Verify CameraPreview] Stopping camera')
    if (detectionRef.current) {
      clearInterval(detectionRef.current)
      detectionRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    const video = videoRef.current
    if (video) {
      video.srcObject = null
    }
    setStreamActive(false)
    setLoading(false)
    onFaceDetected(false, 0)
    verifyingRef.current = false
    startingRef.current = false
  }, [onFaceDetected])

  /* ---- face detection loop ---- */
  useEffect(() => {
    if (!isActive || !streamActive) {
      if (detectionRef.current) {
        clearInterval(detectionRef.current)
        detectionRef.current = null
      }
      return
    }

    const video = videoRef.current
    if (!video || video.readyState < 4) {
      console.warn('[Verify CameraPreview] Video not ready for detection')
      return
    }

    if (verifyingRef.current) return

    console.log('[Verify CameraPreview] Starting face detection loop')
    onFaceDetected(false, 0)
    onStatusChange('detecting')

    detectionRef.current = setInterval(async () => {
      if (!video || video.readyState !== 4 || verifyingRef.current) return
      try {
        const det = await faceapi.detectSingleFace(video)
        if (det) {
          onFaceDetected(true, det.score)
          if (det.score > 0.5 && !verifyingRef.current) {
            verifyingRef.current = true
            console.log('[Verify CameraPreview] Face detected! Starting verification...')
            clearInterval(detectionRef.current!)
            detectionRef.current = null
            onStatusChange('verifying')

            // Capture frame for verification
            const canvas = document.createElement('canvas')
            canvas.width = video.videoWidth
            canvas.height = video.videoHeight
            const ctx = canvas.getContext('2d')
            if (ctx) {
              // Flip horizontally to match mirrored preview
              ctx.translate(canvas.width, 0)
              ctx.scale(-1, 1)
              ctx.drawImage(video, 0, 0)
              try {
                const imgDet = await faceapi.detectSingleFace(canvas).withFaceLandmarks().withFaceDescriptor()
                if (imgDet) {
                  await onVerifyFace(Array.from(imgDet.descriptor), det.score)
                } else {
                  setError('Could not extract face features. Please try again.')
                  verifyingRef.current = false
                  onStatusChange('error')
                  stopCamera()
                }
              } catch (verifyErr) {
                console.error('[Verify CameraPreview] Verification error:', verifyErr)
                setError('Verification processing failed.')
                verifyingRef.current = false
                onStatusChange('error')
                stopCamera()
              }
            }
          }
        } else {
          onFaceDetected(false, 0)
        }
      } catch (e) {
        console.warn('[Verify CameraPreview] Detection error:', e)
      }
    }, 300)

    return () => {
      if (detectionRef.current) {
        clearInterval(detectionRef.current)
        detectionRef.current = null
      }
    }
  }, [isActive, streamActive, onStatusChange, onFaceDetected, onVerifyFace, stopCamera])

  /* ---- auto-start camera when isActive becomes true ---- */
  useEffect(() => {
    if (isActive && !streamActive && !loading && !error && !startingRef.current) {
      console.log('[Verify CameraPreview] isActive=true, auto-starting camera')
      startCamera()
    }
  }, [isActive])

  /* ---- cleanup ONLY on unmount ---- */
  useEffect(() => {
    return () => {
      console.log('[Verify CameraPreview] Unmounting - cleaning up')
      if (detectionRef.current) {
        clearInterval(detectionRef.current)
        detectionRef.current = null
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop())
        streamRef.current = null
      }
      const video = videoRef.current
      if (video) {
        video.srcObject = null
      }
    }
  }, [])

  return (
    <div className="relative rounded-2xl overflow-hidden bg-secondary aspect-video mb-6">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="w-full h-full object-cover"
        style={{
          display: streamActive ? 'block' : 'none',
          transform: 'scaleX(-1)', // mirror effect for selfie camera
        }}
      />

      {/* Loading skeleton */}
      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-secondary/90 backdrop-blur-sm">
          <Loader2 className="w-10 h-10 text-primary animate-spin" />
          <span className="text-sm text-muted-foreground">Initializing camera...</span>
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-secondary/90 backdrop-blur-sm">
          <AlertCircle className="w-10 h-10 text-red-400" />
          <span className="text-sm text-red-400 text-center px-6">{error}</span>
        </div>
      )}

      {/* Idle state */}
      {!isActive && !loading && !error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-secondary/90 backdrop-blur-sm">
          <Camera className="w-12 h-12 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Camera is off</span>
        </div>
      )}

      {/* Active badge */}
      {streamActive && !loading && !error && (
        <div className="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-xs font-medium z-10">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          Camera active
        </div>
      )}

      {/* Face detection overlay */}
      {isActive && streamActive && !loading && !error && (
        <>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-60 border-2 rounded-full transition-all border-primary/30 animate-pulse" />
          <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between">
            <div className={`px-3 py-1.5 rounded-full text-xs font-medium ${
              verifyingRef.current ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-primary/20 text-primary border border-primary/30'
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
        console.log('[Verify] Loading face-api models from', MODEL_URL)
        await Promise.all([
          faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        ])
        modelsReady.current = true
        console.log('[Verify] Models loaded successfully')
      } catch {
        setError('Failed to load face detection models.')
      }
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
    setRetries(0)
    setError('')
  }, [])

  /* Verification callback - passed to CameraPreview */
  const handleVerifyFace = useCallback(async (embedding: number[], _detectedConfidence: number) => {
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

          {/* Error message */}
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 mb-6">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {/* Success message */}
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

          {/* Camera Preview - ALWAYS mounted */}
          <CameraPreview
            isActive={status === 'camera' || status === 'detecting' || status === 'verifying'}
            onStatusChange={(newStatus) => {
              if (newStatus === 'camera') {
                setStatus('camera')
                setMessage('Position your face in the frame.')
              } else if (newStatus === 'detecting') {
                setStatus('detecting')
                setMessage('Looking for your face...')
              } else if (newStatus === 'verifying') {
                setStatus('verifying')
                setMessage('Verifying your face...')
              } else if (newStatus === 'error') {
                // Don't override error status - it's already set by CameraPreview
              }
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
                <button
                  onClick={() => { setError(''); setStatus('camera'); setMessage('Opening camera...') }}
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
                  onClick={() => { setError(''); setRetries(0); setStatus('idle'); setMessage('Start verification to compare your face.') }}
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
