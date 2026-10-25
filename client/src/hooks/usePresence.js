import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@clerk/clerk-react'

const API_BASE = import.meta.env.VITE_API_URL
const HAS_CLERK = !!import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

// Live presence — connects to /ws/presence, publishes this member's
// now-playing and returns the other members' live entries.
// Gates (all must hold to publish):
//   signed-in + shareActivity on + NOT private session + Clerk configured.
// shareActivity is enforced server-side too — client can't self-promote.
export default function usePresence({ isSignedIn, shareActivity, privateSession, currentSong, isPlaying }) {
  const { getToken } = useAuth()
  const [members, setMembers] = useState([])
  const wsRef = useRef(null)
  const reconnectAt = useRef(1000)
  const reconnectTimer = useRef(null)
  const heartbeatTimer = useRef(null)
  const idleTimer = useRef(null)
  // Live refs so timers/closures read current values without re-running effects
  const live = useRef({})
  live.current = { isSignedIn, shareActivity, privateSession, currentSong, isPlaying }

  const canShare = () =>
    HAS_CLERK && live.current.isSignedIn && live.current.shareActivity &&
    !live.current.privateSession

  const send = (msg) => {
    try { if (wsRef.current?.readyState === 1) wsRef.current.send(JSON.stringify(msg)) } catch {}
  }

  const sendNow = () => {
    const s = live.current.currentSong
    if (!canShare() || !s?.id || !live.current.isPlaying) return
    send({ type: 'now', song: { id: s.id, name: s.name, artist: s.artist, image: s.imageUrl || s.artworkUrl || s.image } })
  }

  const sendIdle = () => send({ type: 'idle' })

  const armHeartbeat = () => {
    clearInterval(heartbeatTimer.current)
    heartbeatTimer.current = setInterval(() => {
      // 45s heartbeat keeps the server entry under the 90s sweep threshold
      if (canShare() && live.current.isPlaying) sendNow()
    }, 45000)
  }

  const connect = async () => {
    if (!HAS_CLERK || !live.current.isSignedIn) return
    let token
    try { token = await getToken() } catch { token = null } // re-fetched every (re)connect — tokens rotate
    if (!token) return
    const base = (API_BASE || window.location.origin).replace(/^http/, 'ws')
    let ws
    try { ws = new WebSocket(`${base}/ws/presence`) } catch { return scheduleReconnect() }
    wsRef.current = ws

    ws.onopen = () => send({ type: 'auth', token })
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        if (msg.type === 'auth:ok') {
          reconnectAt.current = 1000 // healthy connection — reset backoff
          sendNow() // re-announce after (re)connect
          armHeartbeat()
        } else if (msg.type === 'presence') {
          setMembers(Array.isArray(msg.members) ? msg.members : [])
        }
      } catch {}
    }
    ws.onclose = () => {
      wsRef.current = null
      clearInterval(heartbeatTimer.current)
      setMembers([])
      scheduleReconnect()
    }
    ws.onerror = () => ws.close()
  }

  const scheduleReconnect = () => {
    clearTimeout(reconnectTimer.current)
    const wait = reconnectAt.current
    reconnectAt.current = Math.min(30000, reconnectAt.current * 2)
    reconnectTimer.current = setTimeout(connect, wait)
  }

  // Connection lifecycle — sign-in/shareActivity/privateSession changes
  // open or close the socket entirely.
  useEffect(() => {
    if (canShare()) {
      connect()
    } else {
      // Going dark (private session on / share off / signed out): tell the
      // server we're idle first, then close.
      sendIdle()
      wsRef.current?.close()
      wsRef.current = null
      clearInterval(heartbeatTimer.current)
      setMembers([])
    }
    return () => {
      wsRef.current?.close()
      clearInterval(heartbeatTimer.current)
      clearTimeout(reconnectTimer.current)
      clearTimeout(idleTimer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn, shareActivity, privateSession])

  // Now-playing publishing — song changes announce immediately (bypasses
  // the server throttle via the different-song rule), pauses >60s go idle,
  // resumes re-announce.
  useEffect(() => {
    if (!canShare()) return
    if (isPlaying && currentSong?.id) {
      clearTimeout(idleTimer.current)
      sendNow()
    } else if (!isPlaying && currentSong?.id) {
      clearTimeout(idleTimer.current)
      idleTimer.current = setTimeout(sendIdle, 60000)
    } else if (!currentSong) {
      sendIdle()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSong?.id, isPlaying, shareActivity, privateSession])

  // Best-effort idle on page exit
  useEffect(() => {
    const bye = () => sendIdle()
    window.addEventListener('beforeunload', bye)
    return () => window.removeEventListener('beforeunload', bye)
  }, [])

  return { members }
}
