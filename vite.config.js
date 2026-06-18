import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import process from 'node:process'

const normalizeChatCompletionsUrl = (apiUrl) => {
  const cleanUrl = String(apiUrl || '').trim().replace(/\/+$/, '')
  if (!cleanUrl) return ''
  if (cleanUrl.endsWith('/chat/completions')) return cleanUrl
  return `${cleanUrl}/chat/completions`
}

const readRequestBody = (req) => new Promise((resolve, reject) => {
  let body = ''
  req.on('data', chunk => {
    body += chunk
  })
  req.on('end', () => resolve(body))
  req.on('error', reject)
})

const sendJson = (res, statusCode, payload) => {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(payload))
}

const createLocalRoomStore = () => {
  const rooms = new Map()
  let nextId = 1

  const trimList = (items, size) => items.slice(Math.max(0, items.length - size))
  const timestamp = () => Date.now()
  const formatLog = (message) => `[${new Date().toLocaleTimeString()}] ${message}`

  const getRoom = (roomId) => {
    if (!rooms.has(roomId)) {
      rooms.set(roomId, {
        id: roomId,
        owner: null,
        players: {},
        messages: [],
        clues: [],
        systemLogs: [formatLog('系统就绪')],
        currentPuzzle: null,
        gameStatus: {
          worldCompleteness: 0,
          status: 'LOBBY',
          winner: null,
          lastUpdate: timestamp()
        },
        lock: {
          isGenerating: false,
          by: null,
          uid: null,
          timestamp: 0
        },
        clients: new Set()
      })
    }
    return rooms.get(roomId)
  }

  const snapshot = (room) => ({
    id: room.id,
    owner: room.owner,
    players: room.players,
    messages: room.messages,
    clues: room.clues,
    systemLogs: room.systemLogs,
    currentPuzzle: room.currentPuzzle,
    gameStatus: room.gameStatus,
    lock: room.lock
  })

  const broadcast = (room) => {
    const payload = `data: ${JSON.stringify(snapshot(room))}\n\n`
    for (const client of room.clients) {
      client.write(payload)
    }
  }

  const addLog = (room, message) => {
    room.systemLogs = [formatLog(message), ...room.systemLogs].slice(0, 20)
  }

  const isOwnerOffline = (room) => {
    if (!room.owner?.uid) return true
    const ownerPlayer = room.players[room.owner.uid]
    if (!ownerPlayer?.lastSeen) return true
    return ownerPlayer.status === 'OFFLINE' || timestamp() - ownerPlayer.lastSeen > 120000
  }

  const isActivePlayer = (player) => (
    player.status !== 'OFFLINE' && (!player.lastSeen || timestamp() - player.lastSeen < 70000)
  )

  const makeMessageId = (prefix) => `${prefix}-${timestamp()}-${nextId++}`

  return {
    getRoom,
    snapshot,
    broadcast,
    addLog,
    isOwnerOffline,
    isActivePlayer,
    makeMessageId,
    trimList,
    timestamp
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const localRooms = createLocalRoomStore()

  return {
    server: {
      host: '0.0.0.0',
      port: 5173,
      allowedHosts: [
        '38.6.76.22',
        'turtle.011208.shop'
      ]
    },
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'local-room-server',
        configureServer(server) {
          server.middlewares.use('/api/local/rooms', async (req, res) => {
            const url = new URL(req.url || '/', 'http://local-room-server')
            const [, rawRoomId, action = 'state'] = url.pathname.split('/')
            const roomId = decodeURIComponent(rawRoomId || '').trim()

            if (!roomId) {
              sendJson(res, 400, { error: { message: 'Missing room id' } })
              return
            }

            const room = localRooms.getRoom(roomId)

            if (req.method === 'GET' && action === 'events') {
              res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache, no-transform',
                Connection: 'keep-alive',
                'X-Accel-Buffering': 'no'
              })
              res.write('retry: 1000\n\n')
              room.clients.add(res)
              res.write(`data: ${JSON.stringify(localRooms.snapshot(room))}\n\n`)
              req.on('close', () => {
                room.clients.delete(res)
              })
              return
            }

            if (req.method === 'GET' && action === 'state') {
              sendJson(res, 200, { state: localRooms.snapshot(room) })
              return
            }

            if (req.method !== 'POST') {
              sendJson(res, 405, { error: { message: 'Method not allowed' } })
              return
            }

            try {
              const body = JSON.parse(await readRequestBody(req) || '{}')
              const now = localRooms.timestamp()

              if (action === 'join') {
                const uid = String(body.uid || '').trim()
                const name = String(body.name || '').trim() || '玩家'
                const createRoom = Boolean(body.createRoom)
                if (!uid) {
                  sendJson(res, 400, { error: { message: 'Missing uid' } })
                  return
                }

                if (!room.owner && !createRoom) {
                  sendJson(res, 404, { error: { message: '房间不存在，请确认房间号，或先创建房间。' } })
                  return
                }

                if (!room.owner || (createRoom && localRooms.isOwnerOffline(room))) {
                  room.owner = { uid, name, claimedAt: now }
                  room.gameStatus = {
                    worldCompleteness: 0,
                    status: 'LOBBY',
                    winner: null,
                    lastUpdate: now
                  }
                } else if (createRoom && room.owner.uid !== uid) {
                  sendJson(res, 409, { error: { message: '这个房间号已经存在，请换一个房间号。' } })
                  return
                }

                const nameTaken = Object.values(room.players).some(player => (
                  player.uid !== uid &&
                  localRooms.isActivePlayer(player) &&
                  String(player.name || '').trim().toLowerCase() === name.toLowerCase()
                ))
                if (nameTaken) {
                  sendJson(res, 409, { error: { message: `昵称「${name}」已经在这个房间里，请换一个昵称。` } })
                  return
                }

                const previous = room.players[uid] || {}
                const isOwner = room.owner.uid === uid
                room.players[uid] = {
                  name,
                  score: previous.score || 0,
                  uid,
                  role: isOwner ? 'owner' : 'player',
                  status: 'ONLINE',
                  ready: isOwner ? true : (previous.ready ?? false),
                  queryCount: previous.queryCount ?? 30,
                  lastQueryTime: previous.lastQueryTime || null,
                  lastSeen: now,
                  joinedAt: previous.joinedAt || now
                }
                for (const player of Object.values(room.players)) {
                  player.role = room.owner.uid === player.uid ? 'owner' : 'player'
                }
                localRooms.addLog(room, room.owner.uid === uid && createRoom ? `${name} 创建房间，等待玩家准备。` : `${name} 加入准备大厅。`)
                localRooms.broadcast(room)
                sendJson(res, 200, { owner: room.owner, state: localRooms.snapshot(room) })
                return
              }

              if (action === 'heartbeat') {
                const uid = String(body.uid || '').trim()
                if (uid && room.players[uid]) {
                  room.players[uid] = {
                    ...room.players[uid],
                    name: String(body.name || room.players[uid].name),
                    lastSeen: now,
                    status: 'ONLINE',
                    ready: room.owner?.uid === uid ? true : room.players[uid].ready
                  }
                  localRooms.broadcast(room)
                }
                sendJson(res, 200, { state: localRooms.snapshot(room) })
                return
              }

              if (action === 'leave') {
                const uid = String(body.uid || '').trim()
                const name = String(body.name || '玩家')
                const transient = Boolean(body.transient)
                if (uid && room.players[uid]) {
                  room.players[uid] = {
                    ...room.players[uid],
                    status: 'OFFLINE',
                    ready: room.owner?.uid === uid ? true : false,
                    lastSeen: now - 120000
                  }
                  if (!transient) {
                    localRooms.addLog(room, `${name} 离开房间。`)
                  }
                  localRooms.broadcast(room)
                }
                sendJson(res, 200, { state: localRooms.snapshot(room) })
                return
              }

              if (action === 'ready') {
                const uid = String(body.uid || '').trim()
                const ready = Boolean(body.ready)
                if (!uid || !room.players[uid]) {
                  sendJson(res, 404, { error: { message: '玩家不在房间中。' } })
                  return
                }
                if (room.gameStatus.status !== 'LOBBY') {
                  sendJson(res, 409, { error: { message: '游戏已经开始，无法修改准备状态。' } })
                  return
                }

                room.players[uid] = {
                  ...room.players[uid],
                  ready: room.owner?.uid === uid ? true : ready,
                  lastSeen: now
                }
                localRooms.addLog(room, `${room.players[uid].name} ${room.players[uid].ready ? '已准备' : '取消准备'}。`)
                localRooms.broadcast(room)
                sendJson(res, 200, { state: localRooms.snapshot(room) })
                return
              }

              if (action === 'start') {
                const uid = String(body.uid || '').trim()
                const name = String(body.name || '房主')
                if (room.owner?.uid !== uid) {
                  sendJson(res, 403, { error: { message: '只有房主可以开始游戏。' } })
                  return
                }
                if (room.gameStatus.status !== 'LOBBY') {
                  sendJson(res, 409, { error: { message: '游戏已经开始。' } })
                  return
                }

                const activePlayers = Object.values(room.players).filter(localRooms.isActivePlayer)
                const allReady = activePlayers.length > 0 && activePlayers.every(player => room.owner?.uid === player.uid || player.ready)
                if (!allReady) {
                  sendJson(res, 409, { error: { message: '还有玩家未准备。' } })
                  return
                }

                room.gameStatus = {
                  ...room.gameStatus,
                  status: 'STARTING',
                  winner: null,
                  lastUpdate: now
                }
                localRooms.addLog(room, `${name} 开始游戏，AI 正在准备谜题。`)
                localRooms.broadcast(room)
                sendJson(res, 200, { state: localRooms.snapshot(room) })
                return
              }

              if (action === 'log') {
                localRooms.addLog(room, String(body.message || ''))
                localRooms.broadcast(room)
                sendJson(res, 200, { state: localRooms.snapshot(room) })
                return
              }

              if (action === 'lock-start') {
                const isLocked = room.lock?.isGenerating && now - (room.lock.timestamp || 0) < 60000
                if (isLocked) {
                  sendJson(res, 200, { acquired: false, state: localRooms.snapshot(room) })
                  return
                }
                room.lock = {
                  isGenerating: true,
                  by: String(body.name || '玩家'),
                  uid: String(body.uid || ''),
                  timestamp: now
                }
                localRooms.addLog(room, 'GENERATING LOCAL PUZZLE...')
                localRooms.broadcast(room)
                sendJson(res, 200, { acquired: true, state: localRooms.snapshot(room) })
                return
              }

              if (action === 'lock-finish') {
                const uid = String(body.uid || '')
                if (!room.lock?.uid || room.lock.uid === uid || now - (room.lock.timestamp || 0) > 60000) {
                  room.lock = { isGenerating: false, by: null, uid: null, timestamp: 0 }
                  localRooms.broadcast(room)
                }
                sendJson(res, 200, { state: localRooms.snapshot(room) })
                return
              }

              if (action === 'puzzle') {
                const puzzle = body.puzzle
                if (!puzzle?.title || !puzzle?.content || !puzzle?.truth) {
                  sendJson(res, 400, { error: { message: 'Invalid puzzle' } })
                  return
                }

                room.messages = []
                room.clues = []
                room.players = Object.fromEntries(Object.entries(room.players).map(([uid, player]) => [
                  uid,
                  {
                    ...player,
                    score: 0,
                    ready: room.owner?.uid === uid,
                    queryCount: 30,
                    lastQueryTime: null
                  }
                ]))
                room.currentPuzzle = {
                  ...puzzle,
                  generatedBy: String(body.username || '房主'),
                  generatedAt: now
                }
                room.gameStatus = {
                  worldCompleteness: 0,
                  status: 'PLAYING',
                  winner: null,
                  lastUpdate: now
                }
                room.lock = { isGenerating: false, by: null, uid: null, timestamp: 0 }
                if (body.error) localRooms.addLog(room, `ERROR: ${body.error}`)
                localRooms.addLog(room, `NEW LOCAL PUZZLE LOADED: ${puzzle.title}`)
                if (body.tags) {
                  localRooms.addLog(room, `TAGS: ${body.tags.genre} | ${body.tags.has_death ? '💀' : '✓'} | ${body.tags.difficulty}`)
                }
                localRooms.broadcast(room)
                sendJson(res, 200, { state: localRooms.snapshot(room) })
                return
              }

              if (action === 'reset-lobby') {
                const uid = String(body.uid || '').trim()
                const name = String(body.name || '房主')
                if (room.owner?.uid !== uid) {
                  sendJson(res, 403, { error: { message: '只有房主可以回到准备大厅。' } })
                  return
                }
                room.messages = []
                room.clues = []
                room.currentPuzzle = null
                room.players = Object.fromEntries(Object.entries(room.players).map(([playerUid, player]) => [
                  playerUid,
                  {
                    ...player,
                    score: 0,
                    ready: room.owner?.uid === playerUid,
                    queryCount: 30,
                    lastQueryTime: null
                  }
                ]))
                room.gameStatus = {
                  worldCompleteness: 0,
                  status: 'LOBBY',
                  winner: null,
                  lastUpdate: now
                }
                localRooms.addLog(room, `${name} 开启新一轮准备。`)
                localRooms.broadcast(room)
                sendJson(res, 200, { state: localRooms.snapshot(room) })
                return
              }

              if (action === 'user-message') {
                const message = body.message
                if (!message?.text) {
                  sendJson(res, 400, { error: { message: 'Invalid message' } })
                  return
                }
                room.messages = localRooms.trimList([
                  ...room.messages,
                  {
                    id: message.id || localRooms.makeMessageId('local-user'),
                    text: message.text,
                    sender: message.sender || '玩家',
                    senderId: message.senderId || 'local-user',
                    type: message.type || 'question',
                    status: message.status || 'processed',
                    timestamp: now
                  }
                ], 50)
                localRooms.broadcast(room)
                sendJson(res, 200, { state: localRooms.snapshot(room) })
                return
              }

              if (action === 'skip') {
                const uid = String(body.uid || '')
                const name = String(body.name || '玩家')
                if (room.owner?.uid !== uid) {
                  sendJson(res, 403, { error: { message: 'Only the room owner can skip the puzzle' } })
                  return
                }

                room.gameStatus = {
                  ...room.gameStatus,
                  status: 'FINISHED',
                  winner: `${name} (SKIPPED)`,
                  lastUpdate: now
                }
                room.messages = localRooms.trimList([
                  ...room.messages,
                  {
                    id: localRooms.makeMessageId('local-system'),
                    text: '>> [OVERRIDE] FORCE SKIP DETECTED. REVEALING TRUTH...',
                    sender: 'SYSTEM',
                    senderId: 'SYSTEM',
                    type: 'error',
                    status: 'processed',
                    timestamp: now
                  }
                ], 50)
                localRooms.addLog(room, `${name} EXECUTED /skip. TRUTH REVEALED.`)
                localRooms.broadcast(room)
                sendJson(res, 200, { state: localRooms.snapshot(room) })
                return
              }

              if (action === 'ai-response') {
                const response = body.response || {}
                const uid = String(body.userUid || '')
                const name = String(body.username || '玩家')
                const mode = String(body.mode || 'QUERY')
                const player = room.players[uid]
                const scoreDelta = Number(body.scoreDelta ?? response.score_delta ?? 0)
                const completeness = Number(response.completeness_percent ?? room.gameStatus.worldCompleteness ?? 0)

                if (response.new_clue) {
                  room.clues = [...room.clues, { text: response.new_clue, unlockedBy: name }]
                  localRooms.addLog(room, `EVIDENCE UNLOCKED BY ${name}`)
                }

                if (player) {
                  room.players[uid] = {
                    ...player,
                    score: (player.score || 0) + Math.max(0, scoreDelta),
                    queryCount: mode === 'QUERY' ? Math.max(0, (player.queryCount ?? 30) - 1) : (player.queryCount ?? 30),
                    lastQueryTime: mode === 'QUERY' ? now : player.lastQueryTime,
                    lastSeen: now
                  }
                }

                room.gameStatus = {
                  ...room.gameStatus,
                  worldCompleteness: completeness,
                  lastUpdate: now
                }

                if (scoreDelta > 0) {
                  localRooms.addLog(room, `${name} +${scoreDelta} PTS [${response.answer || (response.is_correct ? 'SOLVED' : 'QUERY')}]`)
                }

                room.messages = localRooms.trimList([
                  ...room.messages,
                  {
                    id: localRooms.makeMessageId('local-ai'),
                    text: response.text || '>> [ERR_CONNECTION] AI 没有返回内容。',
                    sender: 'CORE_AI',
                    senderId: 'AI',
                    type: response.type || 'question',
                    status: 'processed',
                    timestamp: now
                  }
                ], 50)

                if (response.is_correct || completeness >= 100) {
                  room.gameStatus = {
                    ...room.gameStatus,
                    status: 'FINISHED',
                    winner: name,
                    lastUpdate: now
                  }
                  localRooms.addLog(room, `CASE CLOSED BY ${name} (LOCAL MODE)`)
                }

                localRooms.broadcast(room)
                sendJson(res, 200, { state: localRooms.snapshot(room) })
                return
              }

              if (action === 'message-error') {
                const messageId = String(body.messageId || '')
                room.messages = room.messages.map(message => (
                  message.id === messageId ? { ...message, status: 'error' } : message
                ))
                localRooms.addLog(room, `TRANSMISSION ERROR: ${body.error || 'Unknown error'}`)
                localRooms.broadcast(room)
                sendJson(res, 200, { state: localRooms.snapshot(room) })
                return
              }

              sendJson(res, 404, { error: { message: 'Unknown room action' } })
            } catch (error) {
              sendJson(res, 500, { error: { message: error.message || 'Local room request failed' } })
            }
          })
        }
      },
      {
        name: 'local-ai-proxy',
        configureServer(server) {
          server.middlewares.use('/api/chat/completions', async (req, res) => {
            if (req.method !== 'POST') {
              res.statusCode = 405
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: { message: 'Method not allowed' } }))
              return
            }

            const apiKey = env.OPENAI_API_KEY || env.VITE_GEMINI_API_KEY
            const baseUrl = env.OPENAI_BASE_URL || env.VITE_GEMINI_API_URL
            const model = env.OPENAI_MODEL || env.VITE_GEMINI_MODEL
            const targetUrl = normalizeChatCompletionsUrl(baseUrl)

            if (!apiKey || !targetUrl) {
              res.statusCode = 500
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({
                error: {
                  message: 'AI proxy is not configured. Set OPENAI_API_KEY and OPENAI_BASE_URL in .env.'
                }
              }))
              return
            }

            try {
              const rawBody = await readRequestBody(req)
              const payload = JSON.parse(rawBody || '{}')
              if (!payload.model && model) payload.model = model

              const upstream = await fetch(targetUrl, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${apiKey}`
                },
                body: JSON.stringify(payload)
              })

              const text = await upstream.text()
              res.statusCode = upstream.status
              res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json')
              res.end(text)
            } catch (error) {
              res.statusCode = 502
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({
                error: {
                  message: error.message || 'AI proxy request failed'
                }
              }))
            }
          })
        }
      },
    ],
  }
})
