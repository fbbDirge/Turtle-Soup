import React, { useState, useEffect, useRef, useMemo } from 'react';
// Import the functions you need from the SDKs you need

import { initializeApp } from "firebase/app";



import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged
} from 'firebase/auth';
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  onSnapshot,
  addDoc,
  serverTimestamp,
  query,
  orderBy,
  limit,
  getDocs,
  getDoc,
  deleteDoc,
  updateDoc,
  increment,
  runTransaction
} from 'firebase/firestore';
import {
  Terminal,
  Hash,
  Users,
  FileText,
  Send,
  Cpu,
  Activity,
  Lock,
  Unlock,
  AlertTriangle,
  ToggleLeft,
  ToggleRight,
  Sun,
  Moon,
  RefreshCw,
  Sparkles,
  Settings,
  Loader2,
  X,
  UserX, // For kick player
  MessageCircle, // For Mesugaki icon
  TerminalSquare // For Terminal icon
} from 'lucide-react';
import {
  callGeminiGameMaster,
  isGeminiConfigured,
  generatePuzzle,
  getAIConfig,
  getAIConfigState,
  saveAIConfigState,
  resetAIConfig
} from './lib/geminiService';

// --- Firebase Configuration & Init ---
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

const ADMIN_UID = import.meta.env.VITE_ADMIN_UID;
const requiredFirebaseKeys = ['apiKey', 'authDomain', 'projectId', 'appId'];
const isFirebaseConfigured = requiredFirebaseKeys.every((key) => {
  const value = firebaseConfig[key];
  return value && !String(value).startsWith('your_');
});

const app = isFirebaseConfigured ? initializeApp(firebaseConfig) : null;
const auth = app ? getAuth(app) : null;
const db = app ? getFirestore(app) : null;
const appId = typeof globalThis.__app_id !== 'undefined' ? globalThis.__app_id : 'default-app-id';

// --- Assets / Constants ---
const THEME = {
  bg: 'bg-[var(--color-bg)]',
  bgSoft: 'bg-[var(--color-bg-soft)]',
  bgPanel: 'bg-[var(--color-bg-panel)]',
  primary: 'text-[var(--color-primary)]',
  secondary: 'text-[var(--color-secondary)]',
  border: 'border-[var(--color-border)]',
  borderActive: 'border-[var(--color-border-active)]',
  text: 'text-[var(--color-text)]',
  textDim: 'text-[var(--color-text-dim)]',
  error: 'text-[var(--color-error)]',
  warn: 'text-[var(--color-warn)]',
  font: 'font-mono'
};

// Puzzle Data for Demo
const DEMO_PUZZLE = {
  title: "Case #001: 海鸥肉",
  content: "一个男人走进一家餐厅，点了一碗海鸥肉汤。他吃了一口，然后拿出勺子自杀了。为什么？",
  truth: "这个男人以前和朋友一起遭遇了海难，漂流到一个荒岛上。在岛上饥寒交迫之际，朋友出去找食物。朋友回来后给他煮了一碗'海鸥肉汤'让他活了下来，但朋友自己却饿死了。后来他获救后，在餐厅点了真正的海鸥肉汤，发现味道和当年完全不同。他意识到当年朋友给他吃的是朋友自己身上的肉，是朋友用自己的生命救了他。他无法承受这个真相，于是选择了自杀。",
  clues_total: 5,
  difficulty: "HARD"
};

const MAX_QUERY_COUNT = 30;
const PUZZLE_TYPE_OPTIONS = [
  {
    id: 'random',
    label: '随机',
    description: '不限定风格',
    prompt: ''
  },
  {
    id: 'honkaku',
    label: '本格推理',
    description: '现实逻辑',
    preferredGenre: '本格',
    prompt: '现实世界逻辑、本格推理、身份反转、时间反转、因果反转，禁止超自然元素。'
  },
  {
    id: 'henkaku',
    label: '变格怪谈',
    description: '灵异规则',
    preferredGenre: '变格',
    prompt: '灵异、怪谈或不可思议设定，但规则必须自洽，谜底要能解释所有异常。'
  },
  {
    id: 'suspense',
    label: '现实悬疑',
    description: '犯罪事故',
    preferredGenre: '本格',
    prompt: '现实悬疑、犯罪、事故、人性动机或误导性证词，避免依赖超自然解释。'
  },
  {
    id: 'horror',
    label: '轻恐怖',
    description: '压迫反转',
    preferredGenre: '变格',
    prompt: '轻恐怖、心理压迫、怪谈氛围或诡异日常，避免过度血腥猎奇。'
  },
  {
    id: 'scifi',
    label: '科幻设定',
    description: '机制谜题',
    preferredGenre: '变格',
    prompt: '科幻机制、AI、克隆、记忆、时间循环、太空或实验设定，核心反转依靠设定规则成立。'
  },
  {
    id: 'nodeath',
    label: '无死亡',
    description: '生活反常',
    preferredGenre: '本格',
    desiredHasDeath: false,
    prompt: '不要涉及死亡、自杀或谋杀，用误会、善意谎言、职业规则、生活细节或视角误导制造反转。'
  }
];
const USERNAME_STORAGE_KEY = "turtle-soup.username";
const LOCAL_UID_STORAGE_KEY = "turtle-soup.localUid";
const ACCESS_STORAGE_KEY = "turtle-soup.authorized";
const LAST_ROOM_STORAGE_KEY = "turtle-soup.lastRoom";
const LAST_ROOM_MODE_STORAGE_KEY = "turtle-soup.lastRoomMode";
const createRoomId = () => {
  if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
    const buffer = new Uint32Array(1);
    window.crypto.getRandomValues(buffer);
    return String((buffer[0] % 9000) + 1000);
  }
  return String(Math.floor(1000 + Math.random() * 9000));
};
const sanitizeRoomId = (value) => (
  value
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\u4e00-\u9fa5-]/g, '')
    .slice(0, 24)
);
const getInitialRoomId = () => {
  if (typeof window === 'undefined') return '';
  const roomFromUrl = sanitizeRoomId(new URLSearchParams(window.location.search).get('room') || '');
  if (roomFromUrl) return roomFromUrl;
  return sanitizeRoomId(window.localStorage.getItem(LAST_ROOM_STORAGE_KEY) || '');
};
const getSavedUsername = () => {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(USERNAME_STORAGE_KEY) || '';
};
const getSavedRoomEntryMode = (roomId) => {
  if (typeof window === 'undefined' || !roomId) return 'create';
  const savedRoom = window.localStorage.getItem(LAST_ROOM_STORAGE_KEY);
  const savedMode = window.localStorage.getItem(LAST_ROOM_MODE_STORAGE_KEY);
  return savedRoom === roomId && (savedMode === 'create' || savedMode === 'join') ? savedMode : 'join';
};
const getSavedAuthorization = () => {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(ACCESS_STORAGE_KEY) === 'true';
};
const getLocalUserId = () => {
  if (typeof window === 'undefined') return `local-${Math.random().toString(36).slice(2)}`;
  const saved = window.localStorage.getItem(LOCAL_UID_STORAGE_KEY);
  if (saved) return saved;
  const next = `local-${window.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)}`;
  window.localStorage.setItem(LOCAL_UID_STORAGE_KEY, next);
  return next;
};
const localRoomUrl = (roomId, action = 'state') => `/api/local/rooms/${encodeURIComponent(roomId)}/${action}`;
const requestLocalRoom = async (roomId, action, body = null, method = 'POST') => {
  const response = await fetch(localRoomUrl(roomId, action), {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error?.message || data.message || `Local room request failed (${response.status})`);
  }
  return data;
};
const toTimestampMs = (value) => {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  if (value.seconds) return value.seconds * 1000;
  return 0;
};
const isPlayerActive = (player, currentTime = Date.now()) => {
  if (!player || player.status === 'OFFLINE') return false;
  const lastSeenTime = toTimestampMs(player.lastSeen);
  return !lastSeenTime || (currentTime - lastSeenTime) < 70000;
};
const formatTimestampTime = (value) => {
  const time = toTimestampMs(value);
  return time ? new Date(time).toLocaleTimeString() : '';
};
const formatDateTime = (value) => {
  const time = toTimestampMs(value);
  return time ? new Date(time).toLocaleString() : '暂无';
};
const sendLocalRoomBeacon = (roomId, action, body) => {
  if (typeof window === 'undefined' || !window.navigator?.sendBeacon || !roomId) return false;
  return window.navigator.sendBeacon(
    localRoomUrl(roomId, action),
    new Blob([JSON.stringify(body)], { type: 'application/json' })
  );
};
const getRoomAccessPassword = () => import.meta.env.VITE_ACCESS_PASSWORD || "8888";
const getAIConfigPassword = () => import.meta.env.VITE_AI_CONFIG_PASSWORD || import.meta.env.VITE_ACCESS_PASSWORD || "8888";
const ADMIN_PASSWORD_STORAGE_KEY = "turtle-soup.adminPassword";
const createAIChannelId = () => (
  `channel-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
);
const maskAIConfigState = (state) => ({
  activeChannelId: state.activeChannelId,
  channels: state.channels.map((channel) => ({
    ...channel,
    apiKey: '',
    hasStoredKey: Boolean(channel.apiKey)
  }))
});
const getActiveAIChannelDraft = (state) => (
  state.channels.find((channel) => channel.id === state.activeChannelId) || state.channels[0]
);
const getPuzzleTypeOption = (typeId) => (
  PUZZLE_TYPE_OPTIONS.find((option) => option.id === typeId) || PUZZLE_TYPE_OPTIONS[0]
);
const buildPuzzleGenerationOptions = (typeId, theme) => {
  const typeOption = getPuzzleTypeOption(typeId);
  const cleanTheme = String(theme || '').trim();
  const themeParts = [typeOption.prompt, cleanTheme].filter(Boolean);

  return {
    puzzleType: typeOption.id === 'random' ? '' : typeOption.label,
    preferredGenre: typeOption.preferredGenre || '',
    desiredHasDeath: typeOption.desiredHasDeath,
    theme: themeParts.join('；')
  };
};

// --- GAME ENGINE INTERFACE ---

/**
 * 游戏引擎接口 - 调用 Gemini AI 作为 Game Master
 * @param {string} userInput - 玩家的问题或猜测
 * @param {'QUERY' | 'SOLVE'} mode - 游戏模式
 * @param {Array} currentClues -已解锁的线索
 */
const callGameEngine = async (userInput, mode, history, puzzleContext, currentClues = [], currentCompleteness = 0, persona = 'TERMINAL') => {
  // 使用 Gemini API
  if (isGeminiConfigured()) {
    return await callGeminiGameMaster(
      puzzleContext?.content || DEMO_PUZZLE.content,
      puzzleContext?.truth || DEMO_PUZZLE.truth,
      userInput,
      mode,
      history,
      currentClues,
      currentCompleteness,
      persona
    );
  }

  // Fallback: Mock 逻辑（当 API Key 未配置时）
  console.warn("[GameEngine] Gemini not configured, using mock logic");
  return new Promise((resolve) => {
    setTimeout(() => {
      const lowerText = userInput.toLowerCase();
      let response = {
        text: ">> [MOCK] API Key 未配置，使用模拟响应",
        type: "question",
        new_clue: null,
        score_delta: 0
      };

      if (mode === 'SOLVE') {
        if (lowerText.includes('朋友') && (lowerText.includes('肉') || lowerText.includes('救'))) {
          response.text = ">> [SUCCESS] 核心逻辑匹配。案件告破。";
          response.type = "success";
          response.new_clue = puzzleContext?.truth || DEMO_PUZZLE.truth;
        } else {
          response.text = ">> [DENIED] 关键逻辑缺失。";
          response.type = "error";
        }
      } else {
        if (lowerText.includes('以前') || lowerText.includes('过去')) {
          response.text = ">> [TRUE] 是的。";
        } else if (lowerText.includes('朋友')) {
          response.text = ">> [TRUE] 这很重要。";
          response.new_clue = "FACT: 存在另一个关键人物。";
        } else {
          response.text = ">> [NULL] 无法确定。";
        }
      }
      resolve(response);
    }, 500);
  });
};


// --- Helper Components ---

// Glitch Text Effect
const GlitchText = ({ text, active = false, color = "text-[var(--color-primary)]" }) => {
  return (
    <div className={`relative inline-block ${active ? 'animate-pulse' : ''}`}>
      <span className={`relative z-10 ${color}`}>{text}</span>
      {active && (
        <>
          <span className="absolute top-0 left-[1px] -z-10 opacity-70 text-red-500 animate-pulse">{text}</span>
          <span className="absolute top-0 -left-[1px] -z-10 opacity-70 text-blue-500 animate-pulse delay-75">{text}</span>
        </>
      )}
    </div>
  );
};

// Typewriter Effect for AI messages
const Typewriter = ({ text, onComplete }) => {
  const [displayedText, setDisplayedText] = useState('');

  useEffect(() => {
    let index = 0;
    const timer = setInterval(() => {
      if (index < text.length) {
        setDisplayedText((prev) => prev + text.charAt(index));
        index++;
      } else {
        clearInterval(timer);
        if (onComplete) onComplete();
      }
    }, 20); // Speed
    return () => clearInterval(timer);
  }, [text, onComplete]);

  return <span>{displayedText}</span>;
};

// System Log Item Component
const LogItem = ({ message }) => {
  const parts = message.split(/(\[.*?\]|ERROR:|WARNING:|SUCCESS:|ACCESS DENIED:)/g).filter(Boolean);

  return (
    <div>
      <span className="text-[var(--color-primary)] mr-2">&gt;</span>
      {parts.map((part, i) => {
        if (part.includes('ERROR') || part.includes('DENIED') || part.includes('LOCKED')) {
          return <span key={i} className="text-[var(--color-error)] font-bold">{part}</span>;
        }
        if (part.includes('SUCCESS') || part.includes('SOLVED') || part.includes('PTS')) {
          return <span key={i} className="text-[var(--color-primary)] font-bold">{part}</span>;
        }
        if (part.startsWith('[') && part.endsWith(']')) {
          // Timestamp or Special Tag
          return <span key={i} className="text-[var(--color-text-dim)]">{part}</span>;
        }
        // Bold Usernames (heuristic: roughly looks like a name if it's the first word, but hard to guarantee. 
        // Instead, let's just highlight specific known keywords or let it be standard)
        return <span key={i}>{part}</span>;
      })}
    </div>
  );
};

const AdminPanel = () => {
  const [password, setPassword] = useState(() => (
    typeof window === 'undefined' ? '' : window.sessionStorage.getItem(ADMIN_PASSWORD_STORAGE_KEY) || ''
  ));
  const [unlocked, setUnlocked] = useState(false);
  const [rooms, setRooms] = useState([]);
  const [totals, setTotals] = useState({ roomCount: 0, activeRoomCount: 0, activePlayerCount: 0 });
  const [selectedRoomId, setSelectedRoomId] = useState('');
  const [roomDetail, setRoomDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const [lastRefresh, setLastRefresh] = useState(0);

  const adminRequest = async (path, options = {}) => {
    const response = await fetch(`/api/admin${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'x-admin-password': password,
        ...(options.headers || {})
      }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error?.message || data.message || `请求失败 (${response.status})`);
    return data;
  };

  const loadRoomDetail = async (roomId) => {
    if (!roomId) {
      setRoomDetail(null);
      return;
    }

    const data = await adminRequest(`/rooms/${encodeURIComponent(roomId)}`);
    setRoomDetail(data.room || null);
  };

  const loadRooms = async (preferredRoomId = selectedRoomId) => {
    setLoading(true);
    try {
      const data = await adminRequest('/rooms');
      const nextRooms = data.rooms || [];
      const nextSelected = preferredRoomId || nextRooms[0]?.id || '';
      setRooms(nextRooms);
      setTotals(data.totals || { roomCount: 0, activeRoomCount: 0, activePlayerCount: 0 });
      setSelectedRoomId(nextSelected);
      await loadRoomDetail(nextSelected);
      setNotice('');
      setLastRefresh(Date.now());
    } catch (error) {
      setNotice(error.message);
      if (error.message.includes('密码') || error.message.includes('需要管理')) {
        setUnlocked(false);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!password || unlocked) return;
    adminRequest('/rooms')
      .then((data) => {
        const nextRooms = data.rooms || [];
        setUnlocked(true);
        setRooms(nextRooms);
        setTotals(data.totals || { roomCount: 0, activeRoomCount: 0, activePlayerCount: 0 });
        setSelectedRoomId(nextRooms[0]?.id || '');
        setLastRefresh(Date.now());
        if (nextRooms[0]?.id) loadRoomDetail(nextRooms[0].id);
      })
      .catch(() => {
        if (typeof window !== 'undefined') window.sessionStorage.removeItem(ADMIN_PASSWORD_STORAGE_KEY);
      });
  }, []);

  useEffect(() => {
    if (!unlocked) return;
    const timer = setInterval(() => loadRooms(selectedRoomId), 10000);
    return () => clearInterval(timer);
  }, [unlocked, selectedRoomId, password]);

  const handleLogin = async (event) => {
    event.preventDefault();
    setLoading(true);
    try {
      await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      }).then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error?.message || '管理密码错误。');
      });
      if (typeof window !== 'undefined') window.sessionStorage.setItem(ADMIN_PASSWORD_STORAGE_KEY, password);
      setUnlocked(true);
      await loadRooms();
    } catch (error) {
      setNotice(error.message);
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    if (typeof window !== 'undefined') window.sessionStorage.removeItem(ADMIN_PASSWORD_STORAGE_KEY);
    setUnlocked(false);
    setPassword('');
    setRooms([]);
    setRoomDetail(null);
    setSelectedRoomId('');
  };

  const selectRoom = async (roomId) => {
    setSelectedRoomId(roomId);
    setLoading(true);
    try {
      await loadRoomDetail(roomId);
      setNotice('');
    } catch (error) {
      setNotice(error.message);
    } finally {
      setLoading(false);
    }
  };

  if (!unlocked) {
    return (
      <div className={`min-h-[100dvh] ${THEME.bg} ${THEME.text} ${THEME.font} flex items-center justify-center p-4`}>
        <form onSubmit={handleLogin} className={`w-full max-w-sm border ${THEME.border} ${THEME.bgPanel} p-6 space-y-5`}>
          <div>
            <div className={`text-[10px] ${THEME.textDim} tracking-[0.24em] font-bold mb-2`}>ADMIN</div>
            <h1 className="text-2xl font-bold">管理面板</h1>
          </div>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="输入管理密码"
            className={`w-full ${THEME.bgSoft} border ${THEME.border} p-3 outline-none focus:border-[var(--color-primary)] text-sm`}
            autoFocus
          />
          {notice && <div className={`text-xs ${THEME.error}`}>{notice}</div>}
          <button
            type="submit"
            disabled={loading || !password}
            className={`w-full py-3 bg-[var(--color-primary)] text-[var(--color-inverse)] font-bold disabled:opacity-50`}
          >
            {loading ? '验证中...' : '进入面板'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className={`min-h-[100dvh] ${THEME.bg} ${THEME.text} ${THEME.font}`}>
      <header className={`border-b ${THEME.border} px-4 py-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between`}>
        <div>
          <div className={`text-[10px] ${THEME.textDim} tracking-[0.24em] font-bold mb-1`}>LOCAL ROOM ADMIN</div>
          <h1 className="text-xl font-bold">海龟汤管理面板</h1>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs ${THEME.textDim}`}>刷新：{lastRefresh ? formatDateTime(lastRefresh) : '未刷新'}</span>
          <button
            type="button"
            onClick={() => loadRooms(selectedRoomId)}
            className={`border ${THEME.border} px-3 py-2 text-xs font-bold hover:border-[var(--color-primary)] flex items-center gap-2`}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> 刷新
          </button>
          <button
            type="button"
            onClick={logout}
            className={`border ${THEME.border} px-3 py-2 text-xs font-bold hover:border-[var(--color-error)] hover:text-[var(--color-error)]`}
          >
            退出
          </button>
        </div>
      </header>

      <main className="p-4 md:p-6 space-y-4">
        {notice && <div className={`border ${THEME.border} ${THEME.bgPanel} p-3 text-sm ${THEME.error}`}>{notice}</div>}

        <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            ['房间总数', totals.roomCount],
            ['活跃房间', totals.activeRoomCount],
            ['在线玩家', totals.activePlayerCount]
          ].map(([label, value]) => (
            <div key={label} className={`border ${THEME.border} ${THEME.bgPanel} p-4`}>
              <div className={`text-xs ${THEME.textDim} mb-2`}>{label}</div>
              <div className="text-2xl font-bold">{value}</div>
            </div>
          ))}
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-4">
          <aside className={`border ${THEME.border} ${THEME.bgPanel} min-h-[360px]`}>
            <div className={`border-b ${THEME.border} p-3 text-xs ${THEME.textDim} flex items-center gap-2`}>
              <Hash size={14} /> 房间记录
            </div>
            <div className="divide-y divide-[var(--color-border)]">
              {rooms.length === 0 ? (
                <div className={`p-4 text-sm ${THEME.textDim}`}>暂无房间记录</div>
              ) : rooms.map((room) => (
                <button
                  key={room.id}
                  type="button"
                  onClick={() => selectRoom(room.id)}
                  className={`w-full text-left p-3 hover:bg-[var(--color-bg-soft)] ${selectedRoomId === room.id ? 'bg-[var(--color-bg-soft)] text-[var(--color-primary)]' : ''}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold">房间_{room.id}</span>
                    <span className={`text-[10px] ${THEME.textDim}`}>{room.status}</span>
                  </div>
                  <div className={`text-xs ${THEME.textDim} mt-1`}>
                    在线 {room.activePlayerCount}/{room.playerCount} · 房主 {room.owner?.name || '无'}
                  </div>
                  <div className={`text-[10px] ${THEME.textDim} mt-1`}>
                    {formatDateTime(room.updatedAt)}
                  </div>
                </button>
              ))}
            </div>
          </aside>

          <section className="space-y-4 min-w-0">
            {!roomDetail ? (
              <div className={`border ${THEME.border} ${THEME.bgPanel} p-6 ${THEME.textDim}`}>请选择一个房间</div>
            ) : (
              <>
                <div className={`border ${THEME.border} ${THEME.bgPanel} p-4`}>
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                    <div>
                      <div className={`text-xs ${THEME.textDim} mb-1`}>房间详情</div>
                      <h2 className="text-2xl font-bold">房间_{roomDetail.id}</h2>
                      <div className={`text-xs ${THEME.textDim} mt-2`}>
                        创建 {formatDateTime(roomDetail.createdAt)} · 更新 {formatDateTime(roomDetail.updatedAt)}
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className={`border ${THEME.border} p-2`}>
                        <div className="font-bold">{roomDetail.status}</div>
                        <div className={`text-[10px] ${THEME.textDim}`}>状态</div>
                      </div>
                      <div className={`border ${THEME.border} p-2`}>
                        <div className="font-bold">{roomDetail.activePlayerCount}/{roomDetail.playerCount}</div>
                        <div className={`text-[10px] ${THEME.textDim}`}>玩家</div>
                      </div>
                      <div className={`border ${THEME.border} p-2`}>
                        <div className="font-bold">{roomDetail.worldCompleteness}%</div>
                        <div className={`text-[10px] ${THEME.textDim}`}>真相</div>
                      </div>
                    </div>
                  </div>

                  {roomDetail.currentPuzzle && (
                    <div className={`mt-4 border-t ${THEME.border} pt-4 text-sm`}>
                      <div className={`text-xs ${THEME.textDim} mb-2`}>当前谜题</div>
                      <div className="font-bold mb-1">{roomDetail.currentPuzzle.title}</div>
                      <div className={`${THEME.textDim} leading-relaxed`}>{roomDetail.currentPuzzle.content}</div>
                      {roomDetail.currentPuzzle.truth && (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-xs text-[var(--color-primary)]">查看汤底</summary>
                          <p className="mt-2 leading-relaxed">{roomDetail.currentPuzzle.truth}</p>
                        </details>
                      )}
                    </div>
                  )}
                </div>

                <div className={`border ${THEME.border} ${THEME.bgPanel} overflow-x-auto`}>
                  <div className={`border-b ${THEME.border} p-3 text-xs ${THEME.textDim} flex items-center gap-2`}>
                    <Users size={14} /> 房间玩家
                  </div>
                  <table className="w-full text-xs min-w-[900px]">
                    <thead className={THEME.textDim}>
                      <tr className={`border-b ${THEME.border}`}>
                        <th className="text-left p-3">名字</th>
                        <th className="text-left p-3">角色/状态</th>
                        <th className="text-left p-3">IP</th>
                        <th className="text-left p-3">设备</th>
                        <th className="text-left p-3">分数/次数</th>
                        <th className="text-left p-3">最后在线</th>
                      </tr>
                    </thead>
                    <tbody>
                      {roomDetail.players.map((player) => (
                        <tr key={player.uid} className={`border-b ${THEME.border}`}>
                          <td className="p-3">
                            <div className="font-bold">{player.name}</div>
                            <div className={THEME.textDim}>{player.uid}</div>
                          </td>
                          <td className="p-3">{player.role || 'player'} · {player.status || 'UNKNOWN'} · {player.ready ? '已准备' : '未准备'}</td>
                          <td className="p-3">
                            <div>{player.meta?.lastIp || '未知'}</div>
                            <div className={THEME.textDim}>{(player.meta?.ips || []).join(', ')}</div>
                          </td>
                          <td className="p-3 max-w-[260px] truncate" title={player.meta?.userAgent || ''}>{player.meta?.userAgent || '未知'}</td>
                          <td className="p-3">{player.score || 0} 分 · {player.queryCount ?? MAX_QUERY_COUNT}/{MAX_QUERY_COUNT}</td>
                          <td className="p-3">{formatDateTime(player.lastSeen || player.meta?.lastSeen)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className={`border ${THEME.border} ${THEME.bgPanel} overflow-x-auto`}>
                  <div className={`border-b ${THEME.border} p-3 text-xs ${THEME.textDim} flex items-center gap-2`}>
                    <Activity size={14} /> 使用记录
                  </div>
                  <table className="w-full text-xs min-w-[900px]">
                    <thead className={THEME.textDim}>
                      <tr className={`border-b ${THEME.border}`}>
                        <th className="text-left p-3">时间</th>
                        <th className="text-left p-3">动作</th>
                        <th className="text-left p-3">玩家</th>
                        <th className="text-left p-3">目标</th>
                        <th className="text-left p-3">IP</th>
                        <th className="text-left p-3">详情</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(roomDetail.records || []).slice(0, 120).map((record) => (
                        <tr key={record.id} className={`border-b ${THEME.border}`}>
                          <td className="p-3">{formatDateTime(record.at)}</td>
                          <td className="p-3 font-bold">{record.action}</td>
                          <td className="p-3">{record.name || record.uid || '-'}</td>
                          <td className="p-3">{record.targetName || record.targetUid || '-'}</td>
                          <td className="p-3">{record.ip || '-'}</td>
                          <td className="p-3 max-w-[360px] truncate" title={JSON.stringify(record.detail || {})}>
                            {JSON.stringify(record.detail || {})}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className={`border ${THEME.border} ${THEME.bgPanel}`}>
                  <div className={`border-b ${THEME.border} p-3 text-xs ${THEME.textDim} flex items-center gap-2`}>
                    <FileText size={14} /> 聊天记录
                  </div>
                  <div className="p-3 space-y-2 text-xs max-h-80 overflow-y-auto">
                    {(roomDetail.messages || []).slice(-80).reverse().map((message) => (
                      <div key={message.id || `${message.sender}-${message.timestamp}`} className={`border ${THEME.border} p-2`}>
                        <div className={`${THEME.textDim} mb-1`}>
                          {formatDateTime(message.timestamp)} · {message.sender} · {message.type || 'message'}
                        </div>
                        <div className="leading-relaxed">{message.text}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </section>
        </section>
      </main>
    </div>
  );
};

// --- Main Application Component ---

function GameApp() {
  const [user, setUser] = useState(null);
  const [username, setUsername] = useState(() => getSavedUsername());
  const [joined, setJoined] = useState(false);
  const [roomInput, setRoomInput] = useState(() => getInitialRoomId() || createRoomId());
  const [roomId, setRoomId] = useState(() => getInitialRoomId());
  const [roomEntryMode, setRoomEntryMode] = useState(() => getSavedRoomEntryMode(getInitialRoomId())); // create | join

  // Game State
  const [messages, setMessages] = useState([]);
  const [inputMode, setInputMode] = useState('QUERY'); // QUERY | SOLVE
  const [inputText, setInputText] = useState('');
  const [activeTab, setActiveTab] = useState('TERMINAL'); // CASE | TERMINAL | SQUAD (Mobile)
  const [clues, setClues] = useState([]);
  const [players, setPlayers] = useState([]);
  const [systemLogs, setSystemLogs] = useState([]);
  const [theme, setTheme] = useState('day'); // 'night' | 'day'
  const [gamePhase, setGamePhase] = useState('LOBBY'); // 'LOBBY' | 'STARTING' | 'PLAYING' | 'FINISHED'
  const [solvedBy, setSolvedBy] = useState(null); // 谁解开了谜题
  const [currentPuzzle, setCurrentPuzzle] = useState(null); // 当前谜题
  const [isGenerating, setIsGenerating] = useState(false); // 本地生成状态
  const [isInitialPuzzleLoading, setIsInitialPuzzleLoading] = useState(false);
  const [generationLock, setGenerationLock] = useState(null); // 全局生成锁 { isGenerating, by, timestamp }
  const [now, setNow] = useState(Date.now());
  const [worldCompleteness, setWorldCompleteness] = useState(0); // 世界观完整度 (0-100)
  const [persona, setPersona] = useState('TERMINAL'); // 'TERMINAL' | 'MESUGAKI'
  const [roomOwner, setRoomOwner] = useState(null); // { uid, name }

  // Custom Theme Modal State
  const [showNewGameModal, setShowNewGameModal] = useState(false);
  const [selectedPuzzleType, setSelectedPuzzleType] = useState('random');
  const [themeKeywords, setThemeKeywords] = useState('');
  const [showAIConfigModal, setShowAIConfigModal] = useState(false);
  const [aiConfigUnlocked, setAIConfigUnlocked] = useState(false);
  const [aiConfigPasscode, setAIConfigPasscode] = useState('');
  const [aiConfigDraft, setAIConfigDraft] = useState(() => maskAIConfigState(getAIConfigState()));
  const [rememberAIKey, setRememberAIKey] = useState(false);
  const [aiConfigNotice, setAIConfigNotice] = useState('');

  // Access Control
  const [passcode, setPasscode] = useState('');
  const [isAuthorized, setIsAuthorized] = useState(() => getSavedAuthorization());

  // 强制刷新 UI (用于检测离线)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);


  const isGlobalLoading = useMemo(() => messages.some(m => m.status === 'analyzing'), [messages]);
  const lockStartedAt = toTimestampMs(generationLock?.timestamp);
  const isGenerationLocked = Boolean(generationLock?.isGenerating && lockStartedAt && (now - lockStartedAt < 60000));
  const isAdminUser = Boolean(ADMIN_UID && user?.uid === ADMIN_UID);
  const activePlayers = useMemo(() => players.filter((p) => isPlayerActive(p, now)), [players, now]);
  const currentPlayer = useMemo(() => players.find((p) => p.uid === user?.uid), [players, user?.uid]);
  const isRoomOwner = Boolean(user?.uid && roomOwner?.uid === user.uid);
  const canManageRoom = isRoomOwner || isAdminUser;
  const allActivePlayersReady = activePlayers.length > 0 && activePlayers.every((p) => roomOwner?.uid === p.uid || p.ready);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Refs
  const scrollRef = useRef(null);
  // 标记自己是否被房主踢出：被踢后心跳不再自动重新注册，且触发自动退出
  const kickedRef = useRef(false);

  // --- Auth & Setup ---
  const [authError, setAuthError] = useState(null);
  const roomCollection = (name) => collection(db, 'artifacts', appId, 'rooms', roomId, name);
  const roomDoc = (collectionName, documentName) => doc(db, 'artifacts', appId, 'rooms', roomId, collectionName, documentName);

  const applyLocalRoomState = (state) => {
    if (!state) return;

    const nextPlayers = Object.values(state.players || {});
    if (!db && joined && user?.uid && !kickedRef.current) {
      const stillInRoom = nextPlayers.some((player) => player.uid === user.uid);
      if (!stillInRoom) {
        kickedRef.current = true;
        if (typeof window !== 'undefined') {
          window.alert('你已被房主移出房间。');
        }
        handleLeaveRoom();
        return;
      }
    }

    setRoomOwner(state.owner || null);
    setPlayers(nextPlayers);
    setMessages(state.messages || []);
    setClues(state.clues || []);
    setSystemLogs(state.systemLogs || []);
    setCurrentPuzzle(state.currentPuzzle || null);
    setWorldCompleteness(state.gameStatus?.worldCompleteness || 0);
    setGenerationLock(state.lock || null);

    if (state.gameStatus?.status === 'FINISHED') {
      setSolvedBy(state.gameStatus.winner || 'Unknown');
      setGamePhase('FINISHED');
    } else if (state.gameStatus?.status === 'PLAYING') {
      setSolvedBy(null);
      setGamePhase('PLAYING');
    } else if (state.gameStatus?.status === 'STARTING') {
      setSolvedBy(null);
      setGamePhase('STARTING');
    } else {
      setSolvedBy(null);
      setGamePhase('LOBBY');
    }

    setTimeout(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, 100);
  };

  const resetRoomState = () => {
    setJoined(false);
    setMessages([]);
    setInputMode('QUERY');
    setInputText('');
    setActiveTab('TERMINAL');
    setClues([]);
    setPlayers([]);
    setSystemLogs([]);
    setGamePhase('LOBBY');
    setSolvedBy(null);
    setCurrentPuzzle(null);
    setIsGenerating(false);
    setIsInitialPuzzleLoading(false);
    setGenerationLock(null);
    setRoomOwner(null);
    setWorldCompleteness(0);
    setShowNewGameModal(false);
    setThemeKeywords('');
  };

  const enterRoom = (mode, roomValue = roomInput) => {
    const nextRoomId = sanitizeRoomId(roomValue) || createRoomId();
    resetRoomState();
    setJoined(false);
    setRoomEntryMode(mode);
    setRoomInput(nextRoomId);
    setRoomId(nextRoomId);
    if (typeof window !== 'undefined') {
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.set('room', nextRoomId);
      window.history.replaceState(null, '', nextUrl);
    }
  };

  const handleCreateRoom = () => {
    const nextRoomId = sanitizeRoomId(roomInput) || createRoomId();
    setRoomInput(nextRoomId);
    enterRoom('create', nextRoomId);
  };

  const handleEnterRoom = () => {
    enterRoom('join');
  };

  const handleLeaveRoom = async () => {
    if (joined && roomId && user?.uid) {
      if (!db) {
        try {
          await requestLocalRoom(roomId, 'leave', {
            uid: user.uid,
            name: username || '玩家'
          });
        } catch (error) {
          console.error("Local leave failed:", error);
        }
      } else {
        try {
          await updateDoc(roomDoc('players', user.uid), {
            status: 'OFFLINE',
            ready: roomOwner?.uid === user.uid,
            lastSeen: serverTimestamp()
          });
        } catch (error) {
          console.error("Leave failed:", error);
        }
      }
    }

    resetRoomState();
    setJoined(false);
    setRoomId('');
    setRoomEntryMode('create');
    setRoomInput(createRoomId());
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(LAST_ROOM_STORAGE_KEY);
      window.localStorage.removeItem(LAST_ROOM_MODE_STORAGE_KEY);
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.delete('room');
      window.history.replaceState(null, '', nextUrl);
    }
  };

  const openAIConfig = () => {
    setAIConfigDraft(maskAIConfigState(getAIConfigState()));
    setRememberAIKey(false);
    setAIConfigPasscode('');
    setAIConfigNotice('');
    setAIConfigUnlocked(false);
    setShowAIConfigModal(true);
  };

  const unlockAIConfig = (e) => {
    e.preventDefault();
    const validPass = getAIConfigPassword();
    if (aiConfigPasscode === validPass) {
      setAIConfigUnlocked(true);
      setAIConfigPasscode('');
      setAIConfigNotice('');
    } else {
      setAIConfigNotice('密码错误，无法进入 AI 配置。');
      setAIConfigPasscode('');
    }
  };

  const handleSaveAIConfig = (e) => {
    e.preventDefault();
    saveAIConfigState(aiConfigDraft, { persistKey: rememberAIKey });
    setAIConfigDraft(maskAIConfigState(getAIConfigState()));
    setAIConfigNotice(rememberAIKey ? '已保存所有渠道，Key 已写入本机浏览器。' : '已保存所有渠道，Key 仅保存在本次会话。');
  };

  const handleResetAIConfig = () => {
    resetAIConfig();
    setAIConfigDraft(maskAIConfigState(getAIConfigState()));
    setRememberAIKey(false);
    setAIConfigNotice('已恢复为配置文件默认渠道。');
  };

  const handleAddAIChannel = () => {
    setAIConfigDraft((prev) => {
      const baseConfig = getAIConfig();
      const nextChannel = {
        id: createAIChannelId(),
        name: `渠道 ${prev.channels.length + 1}`,
        apiUrl: baseConfig.apiUrl || '/api/chat/completions',
        model: baseConfig.model || '',
        apiKey: '',
        hasStoredKey: false
      };
      return {
        activeChannelId: nextChannel.id,
        channels: [...prev.channels, nextChannel]
      };
    });
    setAIConfigNotice('');
  };

  const handleRemoveAIChannel = () => {
    setAIConfigDraft((prev) => {
      if (prev.channels.length <= 1) return prev;
      const nextChannels = prev.channels.filter((channel) => channel.id !== prev.activeChannelId);
      return {
        activeChannelId: nextChannels[0]?.id || prev.activeChannelId,
        channels: nextChannels
      };
    });
    setAIConfigNotice('');
  };

  const updateActiveAIChannel = (updates) => {
    setAIConfigDraft((prev) => ({
      ...prev,
      channels: prev.channels.map((channel) => (
        channel.id === prev.activeChannelId ? { ...channel, ...updates } : channel
      ))
    }));
    setAIConfigNotice('');
  };

  // --- Auth & Setup ---
  useEffect(() => {
    if (!auth) {
      setUser({ uid: getLocalUserId(), isAnonymous: true, local: true });
      setAuthError(null);
      return;
    }

    const initAuth = async () => {
      try {
        await signInAnonymously(auth);
      } catch (err) {
        console.error("Auth Error:", err);
        setAuthError(err.message);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) setAuthError(null);
    }, (err) => {
      console.error("AuthState Error:", err);
      setAuthError(err.message);
    });
    return () => unsubscribe();
  }, []);

  // --- Data Sync ---
  useEffect(() => {
    if (!user || !joined || !roomId || !db) return;

    // 1. Sync Messages
    const msgQuery = query(
      roomCollection('chat_messages'),
      orderBy('timestamp', 'asc'),
      limit(50)
    );

    const unsubMsg = onSnapshot(msgQuery, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setMessages(msgs);
      // Auto scroll
      setTimeout(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }, 100);
    }, (err) => console.error("Chat sync error", err));

    // 2. Sync Clues (Mocking shared state)
    const cluesQuery = query(roomCollection('game_clues'));
    const unsubClues = onSnapshot(cluesQuery, (snapshot) => {
      setClues(snapshot.docs.map(doc => doc.data()));
    }, (err) => console.error("Clues sync error", err));

    // 3. Sync Players
    const playersQuery = query(roomCollection('players'));
    const unsubPlayers = onSnapshot(playersQuery, (snapshot) => {
      const nextPlayers = snapshot.docs.map(doc => doc.data());
      setPlayers(nextPlayers);

      // 被踢检测：自己已加入，但玩家列表里已经没有自己 → 被房主移除
      if (joined && user?.uid && !kickedRef.current) {
        const stillInRoom = nextPlayers.some((p) => p.uid === user.uid);
        if (!stillInRoom) {
          kickedRef.current = true; // 阻止心跳重新注册
          if (typeof window !== 'undefined') {
            window.alert('你已被房主移出房间。');
          }
          handleLeaveRoom();
        }
      }
    }, (err) => console.error("Players sync error", err));

    // 4. Sync Puzzle
    const puzzleRef = roomDoc('room_state', 'current_puzzle');
    const unsubPuzzle = onSnapshot(puzzleRef, (docSnap) => {
      if (docSnap.exists()) {
        setCurrentPuzzle(docSnap.data());
      } else {
        setCurrentPuzzle(null);
      }
    }, (err) => console.error("Puzzle sync error", err));

    // 5. Sync Game Status (Completeness)
    const statusRef = roomDoc('room_state', 'game_status');
    const unsubStatus = onSnapshot(statusRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setWorldCompleteness(data.worldCompleteness || 0);

        if (data.status === 'FINISHED') {
          setSolvedBy(data.winner || 'Unknown');

          // Delay showing the finish screen to allow reading the logs
          if (gamePhase !== 'FINISHED') {
            setTimeout(() => {
              setGamePhase('FINISHED');
            }, 3000);
          }
        } else if (data.status === 'PLAYING') {
          setSolvedBy(null);
          setGamePhase('PLAYING');
        } else if (data.status === 'STARTING') {
          setSolvedBy(null);
          setGamePhase('STARTING');
        } else {
          setSolvedBy(null);
          setGamePhase('LOBBY');
        }
      } else {
        setGamePhase('LOBBY');
      }
    });

    // 6. Sync Generation Lock
    const lockRef = roomDoc('room_state', 'lock');
    const unsubLock = onSnapshot(lockRef, (docSnap) => {
      if (docSnap.exists()) {
        setGenerationLock(docSnap.data());
      }
    });

    // 7. Sync Room Owner
    const ownerRef = roomDoc('room_meta', 'owner');
    const unsubOwner = onSnapshot(ownerRef, (docSnap) => {
      setRoomOwner(docSnap.exists() ? docSnap.data() : null);
    }, (err) => console.error("Owner sync error", err));

    // 8. Sync System Logs
    const logsQuery = query(
      roomCollection('system_logs'),
      orderBy('timestamp', 'desc'),
      limit(20)
    );
    const unsubLogs = onSnapshot(logsQuery, (snapshot) => {
      const logs = snapshot.docs.map(doc => {
        const data = doc.data();
        // Format timestamp locally
        const time = formatTimestampTime(data.timestamp) || '...';
        return `[${time}] ${data.message}`;
      });
      setSystemLogs(logs);
    }, (err) => console.error("Logs sync error", err));

    return () => {
      unsubMsg();
      unsubClues();
      unsubPlayers();
      unsubPuzzle();
      unsubStatus();
      unsubLock();
      unsubOwner();
      unsubLogs();
    };
  }, [user, joined, roomId]);

  // --- Local Room Sync (when Firebase is not configured) ---
  useEffect(() => {
    if (!user || !joined || !roomId || db) return;

    const events = new EventSource(localRoomUrl(roomId, 'events'));
    events.onmessage = (event) => {
      try {
        applyLocalRoomState(JSON.parse(event.data));
      } catch (error) {
        console.error("Local room sync parse error", error);
      }
    };
    events.onerror = (error) => {
      console.error("Local room sync error", error);
    };

    return () => events.close();
  }, [user, joined, roomId]);

  // --- Heartbeat Logic ---
  useEffect(() => {
    if (!user || !joined || !roomId || db) return;

    const sendHeartbeat = () => {
      if (kickedRef.current) return;
      requestLocalRoom(roomId, 'heartbeat', {
        uid: user.uid,
        name: username || 'Unknown'
      }).catch((err) => console.error("Local heartbeat error:", err));
    };

    sendHeartbeat();
    const heartbeatInterval = setInterval(sendHeartbeat, 30000);
    return () => clearInterval(heartbeatInterval);
  }, [user, joined, roomId, username]);

  useEffect(() => {
    if (!user || !joined || !roomId) return;

    const markLocalOffline = (event) => {
      if (event?.persisted) return;
      if (kickedRef.current) return;
      if (!db) {
        sendLocalRoomBeacon(roomId, 'leave', {
          uid: user.uid,
          name: username || '玩家',
          transient: true
        });
      }
    };

    const markLocalOnline = () => {
      if (kickedRef.current) return;
      if (!db) {
        requestLocalRoom(roomId, 'heartbeat', {
          uid: user.uid,
          name: username || '玩家'
        }).catch((err) => console.error("Local resume heartbeat error:", err));
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        markLocalOnline();
      }
    };

    window.addEventListener('pagehide', markLocalOffline);
    window.addEventListener('pageshow', markLocalOnline);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('pagehide', markLocalOffline);
      window.removeEventListener('pageshow', markLocalOnline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user, joined, roomId, username]);

  useEffect(() => {
    if (!user || !joined || !roomId || !db) return;
    const userRef = roomDoc('players', user.uid);

    const heartbeatInterval = setInterval(async () => {
      if (kickedRef.current) return; // 已被踢出，停止心跳，避免被重新注册
      try {
        // 只更新 lastSeen，不更新其它字段
        await updateDoc(userRef, { lastSeen: serverTimestamp() });
      } catch (err) {
        console.error("Heartbeat error:", err);
        // 被踢出后不要重新注册
        if (kickedRef.current) return;
        // 如果文档不存在（被清除），尝试重新注册
        if (err.code === 'not-found' || err.message.includes('No document to update')) {
          try {
            await setDoc(userRef, {
              name: username || 'Unknown',
              score: 0,
              uid: user.uid,
              status: 'ONLINE',
              ready: roomOwner?.uid === user.uid,
              queryCount: MAX_QUERY_COUNT,
              lastQueryTime: null,
              lastSeen: serverTimestamp(),
              joinedAt: serverTimestamp()
            });
            addSystemLog("CONNECTION RESTORED.");
          } catch (e) {
            console.error("Re-join failed:", e);
          }
        }
      }
    }, 30000); // 30s interval

    return () => clearInterval(heartbeatInterval);
  }, [user, joined, roomId, username, roomOwner?.uid]);

  // --- Actions ---

  const handleJoin = async () => {
    if (!username.trim()) return;
    kickedRef.current = false; // 重新加入房间，清除被踢标记
    const cleanUsername = username.trim();
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(USERNAME_STORAGE_KEY, cleanUsername);
    }
    const activeRoomId = roomId || sanitizeRoomId(roomInput) || createRoomId();
    setRoomId(activeRoomId);
    if (typeof window !== 'undefined') {
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.set('room', activeRoomId);
      window.history.replaceState(null, '', nextUrl);
    }
    if (!db) {
      try {
        const { owner, state } = await requestLocalRoom(activeRoomId, 'join', {
          uid: user.uid,
          name: cleanUsername,
          createRoom: roomEntryMode === 'create'
        });
        setAuthError(null);
        applyLocalRoomState(state);
        setJoined(true);
        setRoomOwner(owner || state?.owner || null);
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(LAST_ROOM_STORAGE_KEY, activeRoomId);
          window.localStorage.setItem(LAST_ROOM_MODE_STORAGE_KEY, roomEntryMode);
        }
      } catch (error) {
        console.error("Local join failed:", error);
        setAuthError(error.message || '加入房间失败。');
      }
      return;
    }

    let ownerInfo;
    try {
      const ownerRef = roomDoc('room_meta', 'owner');
      ownerInfo = await runTransaction(db, async (transaction) => {
        const ownerSnap = await transaction.get(ownerRef);

        if (roomEntryMode !== 'create' && !ownerSnap.exists()) {
          throw new Error('房间不存在，请确认房间号，或先创建房间。');
        }

        if (roomEntryMode === 'create') {
          if (ownerSnap.exists()) {
            const existingOwner = ownerSnap.data();
            if (existingOwner.uid !== user.uid) {
              throw new Error('这个房间号已经存在，请换一个房间号。');
            }
            return { uid: existingOwner.uid, name: existingOwner.name };
          }

          const newOwner = {
            uid: user.uid,
            name: cleanUsername,
            claimedAt: serverTimestamp()
          };
          transaction.set(ownerRef, newOwner);
          transaction.set(roomDoc('room_state', 'game_status'), {
            status: 'LOBBY',
            worldCompleteness: 0,
            winner: null,
            lastUpdate: serverTimestamp()
          });
          return { uid: newOwner.uid, name: newOwner.name };
        }

        return ownerSnap.data();
      });
    } catch (error) {
      setAuthError(error.message || '加入房间失败。');
      return;
    }

    // Check Username Uniqueness
    const playersRef = roomCollection('players');
    const q = query(playersRef); // Get all players to check uniqueness (client-side filter for simplicity or use where clause if indexed)
    // Since we need to check active players, checking all is safer if we don't have good offline detection index

    // Better: Query specifically for name
    // Note: This requires complex index if we want to filter by name AND updated status. 
    // For now, let's fetch all and filter. List shouldn't be huge.
    const snapshot = await getDocs(q);
    const isTaken = snapshot.docs.some(d => {
      const p = d.data();
      // Check if name matches AND player is considered online (e.g. within last 2 mins)
      const lastSeenMs = toTimestampMs(p.lastSeen);
      const isOnline = (Date.now() - lastSeenMs) < 120000;
      return p.name.toLowerCase() === cleanUsername.toLowerCase() && isOnline && p.uid !== user.uid;
    });

    if (isTaken) {
      setAuthError(`昵称「${cleanUsername}」已经在这个房间里，请换一个昵称。`);
      return;
    }

    setRoomOwner(ownerInfo);

    // Register player
    const playerRef = roomDoc('players', user.uid);
    await setDoc(playerRef, {
      name: cleanUsername,
      score: 0,
      uid: user.uid,
      role: ownerInfo.uid === user.uid ? 'owner' : 'player',
      status: 'ONLINE',
      ready: ownerInfo.uid === user.uid,
      queryCount: MAX_QUERY_COUNT,
      lastQueryTime: null,
      lastSeen: serverTimestamp(),
      joinedAt: serverTimestamp()
    });

    setJoined(true);
    setGamePhase('LOBBY');
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(LAST_ROOM_STORAGE_KEY, activeRoomId);
      window.localStorage.setItem(LAST_ROOM_MODE_STORAGE_KEY, roomEntryMode);
    }
    addSystemLog(ownerInfo.uid === user.uid ? `${cleanUsername} 创建房间，等待玩家准备。` : `${cleanUsername} 加入准备大厅。`);
  };

  const handleToggleReady = async () => {
    if (!user || gamePhase !== 'LOBBY') return;
    if (isRoomOwner) return;
    const nextReady = !currentPlayer?.ready;

    if (!db) {
      try {
        const result = await requestLocalRoom(roomId, 'ready', {
          uid: user.uid,
          ready: nextReady
        });
        applyLocalRoomState(result.state);
      } catch (error) {
        addSystemLog(`READY ERROR: ${error.message}`);
      }
      return;
    }

    try {
      await updateDoc(roomDoc('players', user.uid), {
        ready: nextReady,
        lastSeen: serverTimestamp()
      });
      addSystemLog(`${username} ${nextReady ? '已准备' : '取消准备'}。`);
    } catch (error) {
      addSystemLog(`READY ERROR: ${error.message}`);
    }
  };

  // 房主/管理员将玩家移出房间
  const handleKickPlayer = async (targetPlayer) => {
    if (!targetPlayer || !canManageRoom) return;
    if (targetPlayer.uid === user?.uid) return; // 不能踢自己
    if (roomOwner?.uid === targetPlayer.uid) return; // 不能踢房主

    if (typeof window !== 'undefined') {
      const confirmed = window.confirm(`确定将「${targetPlayer.name}」移出房间吗？`);
      if (!confirmed) return;
    }

    if (!db) {
      try {
        const result = await requestLocalRoom(roomId, 'kick', {
          uid: user.uid,
          name: username || '房主',
          targetUid: targetPlayer.uid,
          targetName: targetPlayer.name
        });
        applyLocalRoomState(result.state);
      } catch (error) {
        console.error('Local kick failed:', error);
        addSystemLog(`KICK ERROR: ${error.message}`);
      }
      return;
    }

    try {
      // 删除玩家文档：被踢者客户端会在 players 同步时检测到自己已不在列表并自动退出
      await deleteDoc(roomDoc('players', targetPlayer.uid));
      addSystemLog(`${targetPlayer.name} 已被 ${username} 移出房间。`);
    } catch (error) {
      console.error('Kick failed:', error);
      addSystemLog(`KICK ERROR: ${error.message}`);
    }
  };

  const handleStartGame = async (options = {}) => {
    if (!canManageRoom || gamePhase !== 'LOBBY') return;

    if (!allActivePlayersReady) {
      addSystemLog('还有玩家未准备。');
      return;
    }

    if (!db) {
      try {
        const startResult = await requestLocalRoom(roomId, 'start', {
          uid: user.uid,
          name: username
        });
        applyLocalRoomState(startResult.state);
        await handleGeneratePuzzle(options, {
          initialGeneration: true,
          skipPermissionCheck: true,
          targetRoomId: roomId
        });
      } catch (error) {
        addSystemLog(`START ERROR: ${error.message}`);
      }
      return;
    }

    try {
      await setDoc(roomDoc('room_state', 'game_status'), {
        status: 'STARTING',
        worldCompleteness: 0,
        winner: null,
        lastUpdate: serverTimestamp()
      }, { merge: true });
      addSystemLog(`${username} 开始游戏，AI 正在准备谜题。`);
      await handleGeneratePuzzle(options, {
        initialGeneration: true,
        skipPermissionCheck: true
      });
    } catch (error) {
      addSystemLog(`START ERROR: ${error.message}`);
    }
  };

  const handleResetToLobby = async () => {
    if (!canManageRoom) return;

    if (!db) {
      try {
        const result = await requestLocalRoom(roomId, 'reset-lobby', {
          uid: user.uid,
          name: username
        });
        applyLocalRoomState(result.state);
      } catch (error) {
        addSystemLog(`LOBBY ERROR: ${error.message}`);
      }
      return;
    }

    try {
      const messagesSnapshot = await getDocs(roomCollection('chat_messages'));
      await Promise.all(messagesSnapshot.docs.map((messageDoc) => deleteDoc(messageDoc.ref)));

      const cluesSnapshot = await getDocs(roomCollection('game_clues'));
      await Promise.all(cluesSnapshot.docs.map((clueDoc) => deleteDoc(clueDoc.ref)));

      const playersSnapshot = await getDocs(roomCollection('players'));
      await Promise.all(playersSnapshot.docs.map((playerDoc) => {
        const playerData = playerDoc.data();
        return updateDoc(playerDoc.ref, {
          score: 0,
          ready: roomOwner?.uid === playerData.uid,
          queryCount: MAX_QUERY_COUNT,
          lastQueryTime: null
        });
      }));

      const puzzleSnap = await getDoc(roomDoc('room_state', 'current_puzzle'));
      if (puzzleSnap.exists()) await deleteDoc(roomDoc('room_state', 'current_puzzle'));

      await setDoc(roomDoc('room_state', 'game_status'), {
        status: 'LOBBY',
        worldCompleteness: 0,
        winner: null,
        lastUpdate: serverTimestamp()
      }, { merge: true });

      addSystemLog(`${username} 开启新一轮准备。`);
    } catch (error) {
      addSystemLog(`LOBBY ERROR: ${error.message}`);
    }
  };

  const copyRoomLink = async () => {
    if (typeof window === 'undefined') return;
    const inviteUrl = new URL(window.location.href);
    inviteUrl.searchParams.set('room', roomId);
    try {
      await window.navigator.clipboard.writeText(inviteUrl.toString());
      addSystemLog('房间链接已复制。');
    } catch {
      addSystemLog(`房间号：${roomId}`);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    // --- Command: /skip ---
    if (inputText.trim().toLowerCase() === '/skip') {
      setInputText('');

      if (!db) {
        if (!canManageRoom) {
          addSystemLog(`ACCESS DENIED: /skip 只有房主可以使用。`);
          return;
        }

        try {
          const result = await requestLocalRoom(roomId, 'skip', {
            uid: user.uid,
            name: username
          });
          applyLocalRoomState(result.state);
        } catch (error) {
          addSystemLog(`ACCESS DENIED: ${error.message}`);
        }
        return;
      }

      if (!canManageRoom) {
        addSystemLog(`ACCESS DENIED: /skip 只有房主可以使用。`);
        await addDoc(roomCollection('chat_messages'), {
          text: `> 指令被拒绝：只有房主可以跳过当前谜题。`,
          sender: "SYSTEM",
          senderId: "SYSTEM",
          type: "error",
          status: 'processed',
          timestamp: serverTimestamp()
        });
        return;
      }

      // Sync Finish State
      const statusRef = roomDoc('room_state', 'game_status');
      await setDoc(statusRef, {
        status: 'FINISHED',
        winner: `${username} (SKIPPED)`,
        lastUpdate: serverTimestamp()
      }, { merge: true });

      // Local update for immediate feedback (though sync will catch it)
      setSolvedBy(`${username} (SKIPPED)`);
      setGamePhase('FINISHED');
      addSystemLog(`${username} EXECUTED /skip. TRUTH REVEALED.`);

      // Override Message
      await addDoc(roomCollection('chat_messages'), {
        text: ">> [OVERRIDE] FORCE SKIP DETECTED. REVEALING TRUTH...",
        sender: "SYSTEM",
        senderId: "SYSTEM",
        type: "error",
        status: 'processed',
        timestamp: serverTimestamp()
      });
      return;
    }

    // --- Sanity & Cooldown Check ---
    const now = Date.now();
    const rawLastQuery = currentPlayer?.lastQueryTime;
    const lastQueryTime = toTimestampMs(rawLastQuery);

    // Check Cooldown (30s) - Only strictly enforced for QUERY success, but checked here for UI
    if (now - lastQueryTime < 10000) {
      addSystemLog(`COOLDOWN ACTIVE. PLEASE WAIT ${Math.ceil((10000 - (now - lastQueryTime)) / 1000)}s`);
      return;
    }

    // Check Sanity
    if (inputMode === 'QUERY' && (currentPlayer?.queryCount ?? MAX_QUERY_COUNT) <= 0) {
      addSystemLog('SANITY DEPLETED. CANNOT QUERY.');
      return;
    }

    const text = inputText;
    const mode = inputMode;
    setInputText('');

    if (!db) {
      const localUserMsg = {
        id: `local-user-${Date.now()}`,
        text,
        sender: username,
        senderId: user.uid,
        type: mode === 'SOLVE' ? 'attempt' : 'question',
        status: 'processed'
      };

      try {
        const messageResult = await requestLocalRoom(roomId, 'user-message', {
          message: localUserMsg
        });
        applyLocalRoomState(messageResult.state);

        const recentHistory = messages
          .filter(m => m.status !== 'analyzing' && m.status !== 'error')
          .slice(-20)
          .map(m => ({ role: m.senderId === 'AI' ? 'assistant' : 'user', content: m.text }));

        const currentClueTexts = clues.map(c => c.text);
        const aiResponse = await callGameEngine(text, mode, recentHistory, currentPuzzle, currentClueTexts, worldCompleteness, persona);
        let scoreDelta = aiResponse.score_delta || 0;

        if (mode === 'SOLVE' && aiResponse.is_correct) {
          const bonusMultiplier = 2 - ((worldCompleteness || 0) / 100);
          scoreDelta = Math.ceil(scoreDelta * bonusMultiplier);
        }

        const result = await requestLocalRoom(roomId, 'ai-response', {
          userUid: user.uid,
          username,
          mode,
          response: aiResponse,
          scoreDelta
        });
        applyLocalRoomState(result.state);
      } catch (error) {
        console.error("Game engine error:", error);
        try {
          const result = await requestLocalRoom(roomId, 'message-error', {
            messageId: localUserMsg.id,
            error: error.message
          });
          applyLocalRoomState(result.state);
        } catch (fallbackError) {
          console.error("Local message error sync failed:", fallbackError);
          addSystemLog(`TRANSMISSION ERROR: ${error.message}`);
        }
      }
      return;
    }

    // 1. 立即显示用户的输入 (Optimistic UI) - Set status: 'analyzing'
    const userMsgRef = await addDoc(roomCollection('chat_messages'), {
      text,
      sender: username,
      senderId: user.uid,
      type: mode === 'SOLVE' ? 'attempt' : 'question',
      status: 'analyzing',
      timestamp: serverTimestamp()
    });

    try {
      // 2. 调用游戏引擎 (Gemini AI)
      const recentHistory = messages
        .filter(m => m.status !== 'analyzing' && m.status !== 'error') // 只发已处理的消息
        .slice(-20)
        .map(m => ({ role: m.senderId === 'AI' ? 'assistant' : 'user', content: m.text }));

      const currentClueTexts = clues.map(c => c.text);
      const aiResponse = await callGameEngine(text, mode, recentHistory, currentPuzzle, currentClueTexts, worldCompleteness, persona);

      // 3. 更新用户消息状态为 processed
      await updateDoc(userMsgRef, { status: 'processed' });

      // 4. 更新世界观完整度
      const newCompleteness = aiResponse.completeness_percent || worldCompleteness;
      if (newCompleteness !== worldCompleteness) {
        await setDoc(roomDoc('room_state', 'game_status'), {
          worldCompleteness: newCompleteness,
          lastUpdate: serverTimestamp()
        }, { merge: true });
      }

      // 5. 处理加分逻辑 & Sanity扣除
      let scoreDelta = aiResponse.score_delta || 0;

      // SOLVE bonus logic
      if (mode === 'SOLVE' && aiResponse.is_correct) {
        const bonusMultiplier = 2 - ((worldCompleteness || 0) / 100);
        scoreDelta = Math.ceil(scoreDelta * bonusMultiplier);
      }

      // 更新玩家状态
      const playerRef = roomDoc('players', user.uid);
      const updates = {};

      if (scoreDelta > 0) updates.score = increment(scoreDelta);

      // 只有 QUERY 模式且成功时扣除 Sanity 并重置 CD
      if (mode === 'QUERY') {
        updates.queryCount = increment(-1);
        updates.lastQueryTime = serverTimestamp();
      }

      if (Object.keys(updates).length > 0) {
        await updateDoc(playerRef, updates);
      }

      if (scoreDelta > 0) {
        addSystemLog(`${username} +${scoreDelta} PTS [${aiResponse.answer || (aiResponse.is_correct ? 'SOLVED' : 'QUERY')}]`);
      }

      // 5. 如果解锁了新线索，添加到 Evidence
      if (aiResponse.new_clue) {
        await addDoc(roomCollection('game_clues'), {
          text: aiResponse.new_clue,
          unlockedBy: username
        });
        addSystemLog(`EVIDENCE UNLOCKED BY ${username}`);
      }

      // 6. 显示 AI 回复
      await addDoc(roomCollection('chat_messages'), {
        text: aiResponse.text,
        sender: "CORE_AI",
        senderId: "AI",
        type: aiResponse.type,
        timestamp: serverTimestamp()
      });

      // 8. 检测是否解开谜题 (or 100% completeness)
      if (aiResponse.is_correct || (typeof newCompleteness !== 'undefined' && newCompleteness >= 100)) {
        setSolvedBy(username);
        setGamePhase('FINISHED');
        addSystemLog(`CASE CLOSED BY ${username} (COMPLETENESS: ${newCompleteness || 100}%)`);
      }

    } catch (error) {
      console.error("Game engine error:", error);
      // 标记消息为错误，不扣次数
      await updateDoc(userMsgRef, { status: 'error' });
      addSystemLog(`TRANSMISSION ERROR: ${error.message}`);
    }
  };

  const addSystemLog = async (msg) => {
    if (!db) {
      if (!roomId) {
        const time = new Date().toLocaleTimeString();
        setSystemLogs((prev) => [`[${time}] ${msg}`, ...prev].slice(0, 20));
        return;
      }

      try {
        const result = await requestLocalRoom(roomId, 'log', { message: msg });
        applyLocalRoomState(result.state);
      } catch (error) {
        console.error("Failed to add local system log", error);
        const time = new Date().toLocaleTimeString();
        setSystemLogs((prev) => [`[${time}] ${msg}`, ...prev].slice(0, 20));
      }
      return;
    }

    // Fire and forget
    try {
      // Keep it simple, just add to collection
      await addDoc(roomCollection('system_logs'), {
        message: msg,
        timestamp: serverTimestamp()
      });
    } catch (err) {
      console.error("Failed to add system log", err);
    }
  };

  // 生成新谜题
  const handleGeneratePuzzle = async (options = {}, context = {}) => {
    const { skipPermissionCheck = false, initialGeneration = false, targetRoomId = roomId } = context;

    if (!skipPermissionCheck && !canManageRoom) {
      addSystemLog('只有房主可以生成新谜题。');
      return;
    }

    if (!db) {
      if (initialGeneration) setIsInitialPuzzleLoading(true);
      setIsGenerating(true);
      try {
        const lockResult = await requestLocalRoom(targetRoomId, 'lock-start', {
          uid: user.uid,
          name: username || '房主'
        });
        applyLocalRoomState(lockResult.state);

        if (!lockResult.acquired) {
          addSystemLog(`GENERATION LOCKED BY ${lockResult.state?.lock?.by || 'ANOTHER PLAYER'}`);
          return;
        }

        const puzzle = await generatePuzzle(options);
        const newPuzzle = {
          title: puzzle.title,
          content: puzzle.soup_surface,
          truth: puzzle.soup_base,
          tags: puzzle.tags,
          difficulty: puzzle.tags.difficulty
        };
        const result = await requestLocalRoom(targetRoomId, 'puzzle', {
          puzzle: newPuzzle,
          username,
          tags: puzzle.tags
        });
        applyLocalRoomState(result.state);
      } catch (error) {
        console.error('Error generating puzzle:', error);
        try {
          const result = await requestLocalRoom(targetRoomId, 'puzzle', {
            puzzle: DEMO_PUZZLE,
            username,
            error: error.message
          });
          applyLocalRoomState(result.state);
        } catch (fallbackError) {
          console.error('Error applying fallback puzzle:', fallbackError);
          setCurrentPuzzle(DEMO_PUZZLE);
          addSystemLog(`ERROR: ${error.message}`);
        }
      } finally {
        setIsGenerating(false);
        if (initialGeneration) setIsInitialPuzzleLoading(false);
        requestLocalRoom(targetRoomId, 'lock-finish', { uid: user.uid })
          .catch((err) => console.error("Error releasing local generation lock", err));
      }
      return;
    }

    // Check Global Lock
    const now = Date.now();
    const isLocked = generationLock?.isGenerating &&
      toTimestampMs(generationLock.timestamp) &&
      (now - toTimestampMs(generationLock.timestamp) < 60000);

    if (isGenerating || isLocked) {
      if (isLocked) addSystemLog(`GENERATION LOCKED BY ${generationLock.by || 'ANOTHER AGENT'}`);
      return;
    }

    if (initialGeneration) setIsInitialPuzzleLoading(true);
    setIsGenerating(true);
    addSystemLog('GENERATING NEW PUZZLE...');

    // Acquire Lock
    const lockRef = roomDoc('room_state', 'lock');
    await setDoc(lockRef, {
      isGenerating: true,
      by: username,
      timestamp: serverTimestamp()
    });

    try {
      // 1. Clear Data Immediately
      const messagesRef = roomCollection('chat_messages');
      const messagesSnapshot = await getDocs(messagesRef);
      await Promise.all(messagesSnapshot.docs.map(doc => deleteDoc(doc.ref)));

      const cluesRef = roomCollection('game_clues');
      const cluesSnapshot = await getDocs(cluesRef);
      await Promise.all(cluesSnapshot.docs.map(doc => deleteDoc(doc.ref)));

      // 重置所有玩家分数 (Safe Reset)
      const playersRef = roomCollection('players');
      const playersSnapshot = await getDocs(playersRef);
      await Promise.all(playersSnapshot.docs.map(playerDoc => {
        const playerData = playerDoc.data();
        return updateDoc(playerDoc.ref, {
          score: 0,
          ready: roomOwner?.uid === playerData.uid,
          queryCount: MAX_QUERY_COUNT,
          lastQueryTime: null
        });
      }));

      // Reset Game Status
      await setDoc(roomDoc('room_state', 'game_status'), {
        worldCompleteness: 0,
        status: 'PLAYING',
        lastUpdate: serverTimestamp()
      });

      // 2. Generate New Puzzle
      const puzzle = await generatePuzzle(options);

      // 转换为内部格式
      const newPuzzle = {
        title: puzzle.title,
        content: puzzle.soup_surface,
        truth: puzzle.soup_base,
        tags: puzzle.tags,
        difficulty: puzzle.tags.difficulty
      };

      setCurrentPuzzle(newPuzzle);

      // 同步到 Firebase（让其他玩家看到）
      const puzzleRef = roomDoc('room_state', 'current_puzzle');
      await setDoc(puzzleRef, {
        ...newPuzzle,
        generatedBy: username,
        generatedAt: serverTimestamp()
      });

      // (Data already cleared)

      // Reset Game Status
      await setDoc(roomDoc('room_state', 'game_status'), {
        worldCompleteness: 0,
        status: 'PLAYING',
        lastUpdate: serverTimestamp()
      });

      addSystemLog(`NEW PUZZLE LOADED: ${puzzle.title}`);
      addSystemLog(`TAGS: ${puzzle.tags.genre} | ${puzzle.tags.has_death ? '💀' : '✓'} | ${puzzle.tags.difficulty}`);

      // Reset local UI state
      setGamePhase('PLAYING');
      setSolvedBy(null);

    } catch (error) {
      console.error('Error generating puzzle:', error);
      setCurrentPuzzle(DEMO_PUZZLE);
      addSystemLog(`ERROR: ${error.message}`);
    } finally {
      setIsGenerating(false);
      if (initialGeneration) setIsInitialPuzzleLoading(false);
      // Release Lock
      try {
        const lockRef = roomDoc('room_state', 'lock');
        await setDoc(lockRef, { isGenerating: false });
      } catch (e) { console.error("Error releasing lock", e); }
    }
  };

  const openGenerateModal = () => {
    if (!canManageRoom) {
      addSystemLog('只有房主可以设置出题主题。');
      return;
    }

    setSelectedPuzzleType('random');
    setThemeKeywords('');
    setShowNewGameModal(true);
  };

  const confirmGenerate = () => {
    setShowNewGameModal(false);
    handleStartGame(buildPuzzleGenerationOptions(selectedPuzzleType, themeKeywords));
  };

  // --- Rendering Helpers ---
  const renderNewGameModal = () => (
    showNewGameModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
        <div className={`w-full max-w-2xl max-h-[90dvh] overflow-y-auto border ${THEME.border} ${THEME.bg} p-6 relative shadow-2xl animate-fadeIn`}>
          <button
            onClick={() => setShowNewGameModal(false)}
            className="absolute top-4 right-4 text-[#666] hover:text-[#fff]"
          >
            <X size={20} />
          </button>

          <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-[var(--color-primary)]">
            <Activity size={20} /> 选择本轮类型
          </h2>

          <div className="mb-6">
            <label className={`block text-xs uppercase tracking-widest ${THEME.textDim} mb-2`}>
              海龟汤类型
            </label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {PUZZLE_TYPE_OPTIONS.map((option) => {
                const isSelected = selectedPuzzleType === option.id;

                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setSelectedPuzzleType(option.id)}
                    className={`min-h-[72px] border p-3 text-left transition-colors ${isSelected
                      ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-inverse)]'
                      : `${THEME.border} ${THEME.bgSoft} hover:border-[var(--color-primary)]`
                      }`}
                  >
                    <span className="block text-sm font-bold">{option.label}</span>
                    <span className={`block text-[10px] mt-1 ${isSelected ? 'opacity-80' : THEME.textDim}`}>
                      {option.description}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mb-6">
            <label className={`block text-xs uppercase tracking-widest ${THEME.textDim} mb-2`}>
              场景关键词 / 主题（可选）
            </label>
            <input
              type="text"
              value={themeKeywords}
              onChange={(e) => setThemeKeywords(e.target.value)}
              placeholder="例如：赛博朋克、旧校舍、时间循环..."
              className={`w-full ${THEME.bgSoft} border ${THEME.border} p-3 outline-none focus:border-[var(--color-primary)] transition-colors text-sm font-mono`}
            />
            <p className="text-[10px] text-[#666] mt-2 font-mono">
              类型为随机且关键词留空时，会完全随机生成本轮谜题。
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setShowNewGameModal(false)}
              className={`flex-1 py-3 border ${THEME.border} hover:bg-[var(--color-surface)] transition-colors text-xs font-bold`}
            >
              取消
            </button>
            <button
              onClick={confirmGenerate}
              className={`flex-1 py-3 bg-[var(--color-primary)] text-[var(--color-inverse)] font-bold text-xs hover:opacity-90 transition-opacity flex items-center justify-center gap-2`}
            >
              {isGenerating ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              开始生成
            </button>
          </div>
        </div>
      </div>
    )
  );

  const renderAIConfigModal = () => {
    const activeAIChannel = getActiveAIChannelDraft(aiConfigDraft);

    return (
      showAIConfigModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className={`w-full max-w-3xl max-h-[92dvh] overflow-y-auto border ${THEME.border} ${THEME.bg} p-6 relative shadow-2xl animate-fadeIn`}>
            <button
              onClick={() => setShowAIConfigModal(false)}
              className="absolute top-4 right-4 text-[#666] hover:text-[#fff]"
            >
              <X size={20} />
            </button>

            <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-[var(--color-primary)]">
              <Settings size={20} /> AI 配置
            </h2>

            {!aiConfigUnlocked ? (
              <form onSubmit={unlockAIConfig} className="space-y-5">
                <p className={`text-xs ${THEME.textDim} leading-relaxed`}>
                  这里可以修改多个 AI 渠道、模型、接口地址和 API Key。进入配置页需要输入 AI 配置密码。
                </p>
                <div>
                  <label className={`block text-xs uppercase tracking-widest ${THEME.textDim} mb-2`}>
                    AI 配置密码
                  </label>
                  <input
                    type="password"
                    value={aiConfigPasscode}
                    onChange={(e) => setAIConfigPasscode(e.target.value)}
                    className={`w-full bg-black/50 border ${THEME.border} p-3 outline-none focus:border-[var(--color-primary)] transition-colors text-sm font-mono`}
                    placeholder="输入 AI 配置密码"
                    autoFocus
                  />
                </div>
                {aiConfigNotice && <p className="text-xs text-[var(--color-error)]">{aiConfigNotice}</p>}
                <button
                  type="submit"
                  className={`w-full py-3 bg-[var(--color-primary)] text-[var(--color-inverse)] font-bold text-xs hover:opacity-90 transition-opacity`}
                >
                  解锁配置
                </button>
              </form>
            ) : (
              <form onSubmit={handleSaveAIConfig} className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-4">
                  <section className={`border ${THEME.border} ${THEME.bgPanel} p-3`}>
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <span className={`text-xs ${THEME.textDim} uppercase tracking-widest`}>渠道</span>
                      <span className={`text-[10px] ${THEME.textDim}`}>{aiConfigDraft.channels.length} 个</span>
                    </div>
                    <div className="space-y-2">
                      {aiConfigDraft.channels.map((channel) => (
                        <button
                          type="button"
                          key={channel.id}
                          onClick={() => setAIConfigDraft((prev) => ({ ...prev, activeChannelId: channel.id }))}
                          className={`w-full border px-3 py-2 text-left text-xs font-bold transition-colors ${channel.id === aiConfigDraft.activeChannelId
                            ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-inverse)]'
                            : `${THEME.border} ${THEME.textDim} hover:border-[var(--color-primary)]`
                            }`}
                        >
                          <span className="block truncate">{channel.name || '未命名渠道'}</span>
                          <span className="block truncate text-[10px] opacity-70">{channel.model || '未设置模型'}</span>
                        </button>
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-3">
                      <button
                        type="button"
                        onClick={handleAddAIChannel}
                        className={`border ${THEME.border} py-2 text-xs font-bold hover:border-[var(--color-primary)]`}
                      >
                        新增
                      </button>
                      <button
                        type="button"
                        onClick={handleRemoveAIChannel}
                        disabled={aiConfigDraft.channels.length <= 1}
                        className={`border ${THEME.border} py-2 text-xs font-bold ${aiConfigDraft.channels.length > 1 ? 'hover:border-[var(--color-error)] hover:text-[var(--color-error)]' : 'opacity-50 cursor-not-allowed'}`}
                      >
                        删除
                      </button>
                    </div>
                  </section>

                  <section className="space-y-4">
                    <div>
                      <label className={`block text-xs uppercase tracking-widest ${THEME.textDim} mb-2`}>
                        渠道名称
                      </label>
                      <input
                        type="text"
                        value={activeAIChannel?.name || ''}
                        onChange={(e) => updateActiveAIChannel({ name: e.target.value })}
                        className={`w-full bg-black/50 border ${THEME.border} p-3 outline-none focus:border-[var(--color-primary)] transition-colors text-sm font-mono`}
                        placeholder="例如：DeepSeek / MiniMax / 本地代理"
                      />
                    </div>

                    <div>
                      <label className={`block text-xs uppercase tracking-widest ${THEME.textDim} mb-2`}>
                        API 地址（Base URL 或完整端点）
                      </label>
                      <input
                        type="url"
                        value={activeAIChannel?.apiUrl || ''}
                        onChange={(e) => updateActiveAIChannel({ apiUrl: e.target.value })}
                        className={`w-full bg-black/50 border ${THEME.border} p-3 outline-none focus:border-[var(--color-primary)] transition-colors text-sm font-mono`}
                        placeholder="https://api.minimaxi.com/v1"
                      />
                      <p className={`text-[10px] ${THEME.textDim} mt-2`}>
                        可以填 SDK 的 Base URL，例如 https://api.minimaxi.com/v1；系统会自动补 /chat/completions。
                      </p>
                    </div>

                    <div>
                      <label className={`block text-xs uppercase tracking-widest ${THEME.textDim} mb-2`}>
                        模型
                      </label>
                      <input
                        type="text"
                        value={activeAIChannel?.model || ''}
                        onChange={(e) => updateActiveAIChannel({ model: e.target.value })}
                        className={`w-full bg-black/50 border ${THEME.border} p-3 outline-none focus:border-[var(--color-primary)] transition-colors text-sm font-mono`}
                        placeholder="deepseek-v4-flash"
                      />
                    </div>

                    <div>
                      <label className={`block text-xs uppercase tracking-widest ${THEME.textDim} mb-2`}>
                        API Key
                      </label>
                      <input
                        type="password"
                        value={activeAIChannel?.apiKey || ''}
                        onChange={(e) => updateActiveAIChannel({ apiKey: e.target.value })}
                        className={`w-full bg-black/50 border ${THEME.border} p-3 outline-none focus:border-[var(--color-primary)] transition-colors text-sm font-mono`}
                        placeholder="留空则沿用当前渠道 Key"
                      />
                      <p className={`text-[10px] ${THEME.textDim} mt-2`}>
                        {activeAIChannel?.hasStoredKey ? '当前渠道已有 Key；留空会沿用，输入新 Key 会替换。' : '未填写 Key 时会使用服务端 .env 代理配置。'}
                      </p>
                    </div>
                  </section>
                </div>

                <label className={`flex items-start gap-3 text-xs ${THEME.textDim} leading-relaxed`}>
                  <input
                    type="checkbox"
                    checked={rememberAIKey}
                    onChange={(e) => setRememberAIKey(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>
                    记住 Key 到本机浏览器。开启后所有渠道的 API Key 会写入 localStorage；关闭时 Key 只保存在本次会话。
                  </span>
                </label>

                {aiConfigNotice && <p className={`text-xs ${aiConfigNotice.includes('恢复') ? THEME.textDim : 'text-[var(--color-primary)]'}`}>{aiConfigNotice}</p>}

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={handleResetAIConfig}
                    className={`flex-1 py-3 border ${THEME.border} hover:bg-[var(--color-surface)] transition-colors text-xs font-bold`}
                  >
                    恢复默认
                  </button>
                  <button
                    type="submit"
                    className={`flex-1 py-3 bg-[var(--color-primary)] text-[var(--color-inverse)] font-bold text-xs hover:opacity-90 transition-opacity`}
                  >
                    保存并启用
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )
    );
  };

  // --- Access Control ---
  if (!isAuthorized) {
    return (
      <div className={`h-[100dvh] w-full ${THEME.bg} ${THEME.primary} font-mono flex flex-col items-center justify-center p-4`}>
        <div className={`max-w-xs w-full border ${THEME.border} p-8 text-center relative overflow-hidden`}>
          {/* Scanline */}
          <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-transparent via-[var(--color-primary)]/5 to-transparent h-1 w-full animate-scan"></div>

          <Lock size={32} className="mx-auto mb-4 animate-pulse" />
          <h1 className="text-xl mb-2 font-bold tracking-widest">访问受限</h1>
          <p className="text-[10px] mb-6 opacity-70">安全终端 // 需要密码</p>
          <form onSubmit={(e) => {
            e.preventDefault();
            const validPass = getRoomAccessPassword();
            if (passcode === validPass) {
              setIsAuthorized(true);
              if (typeof window !== 'undefined') {
                window.localStorage.setItem(ACCESS_STORAGE_KEY, 'true');
              }
            } else {
              alert("密码错误"); // Simple alert for now, or use state for error
              setPasscode("");
            }
          }}>
            <input
              type="password"
              value={passcode}
              onChange={e => setPasscode(e.target.value)}
              className={`w-full bg-black/50 border ${THEME.border} p-2 text-center tracking-[0.5em] mb-4 outline-none focus:border-[var(--color-primary)] ${THEME.primary} text-xl`}
              placeholder="••••"
              autoFocus
              maxLength={6}
            />
            <button type="submit" className={`w-full border ${THEME.border} py-2 hover:bg-[var(--color-primary)] hover:text-black font-bold transition-colors text-xs tracking-widest`}>
              解锁
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className={`h-[100dvh] w-full ${THEME.bg} ${THEME.primary} flex flex-col items-center justify-center font-mono p-4 text-center`}>
        <div className="mb-4">正在连接...</div>
        {authError && (
          <div className="text-red-500 max-w-md border border-red-500 p-4 bg-red-950/30">
            <h3 className="font-bold mb-2">连接失败</h3>
            <p className="text-xs">{authError}</p>
            <p className={`text-xs mt-2 ${THEME.textDim}`}>请检查网络或 Firebase 配置。</p>
          </div>
        )}
      </div>
    );
  }

  if (!roomId) {
    return (
      <div className={`h-[100dvh] w-full ${THEME.bg} ${THEME.primary} font-mono flex flex-col items-center justify-center p-4`}>
        <button
          onClick={openAIConfig}
          className={`absolute top-4 right-4 border ${THEME.border} px-3 py-2 text-xs flex items-center gap-2 hover:border-[var(--color-primary)]`}
        >
          <Settings size={14} /> AI 配置
        </button>
        <div className={`max-w-md w-full border ${THEME.border} p-8 relative`}>
          <div className={`absolute top-0 left-0 ${THEME.primary} bg-[var(--color-bg)] border ${THEME.border} text-xs px-2 py-1`}>房间入口</div>
          <h1 className="text-4xl mb-3 mt-4 tracking-tighter">海龟汤<span className="animate-pulse">_</span></h1>
          <p className={`text-xs ${THEME.textDim} mb-8 leading-relaxed`}>
            创建房间后邀请玩家加入；所有人准备后由房主开始游戏。
          </p>
          <form onSubmit={(e) => { e.preventDefault(); handleEnterRoom(); }} className="space-y-6">
            <div>
              <label className={`block text-xs ${THEME.textDim} mb-2 uppercase tracking-widest`}>房间号</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={roomInput}
                  onChange={e => setRoomInput(e.target.value)}
                  className={`min-w-0 flex-1 ${THEME.bg} border ${THEME.border} p-3 ${THEME.primary} focus:border-[var(--color-border-active)] outline-none placeholder-[var(--color-text-dim)] text-base md:text-sm`}
                  placeholder="例如：8821"
                  maxLength={24}
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setRoomInput(createRoomId())}
                  className={`w-12 border ${THEME.border} flex items-center justify-center hover:border-[var(--color-primary)]`}
                  title="刷新房间号"
                  aria-label="刷新房间号"
                >
                  <RefreshCw size={16} />
                </button>
              </div>
              <p className={`text-[10px] ${THEME.textDim} mt-2`}>
                可以使用数字、英文、中文和短横线。
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={handleCreateRoom}
                className={`w-full bg-[var(--color-primary)] text-[var(--color-inverse)] font-bold py-3 transition-opacity hover:opacity-90 flex items-center justify-center gap-2`}
              >
                <Activity size={18} /> 创建房间
              </button>
              <button
                type="submit"
                className={`w-full ${THEME.bg} border ${THEME.border} ${THEME.primary} hover:border-[var(--color-primary)] font-bold py-3 transition-colors flex items-center justify-center gap-2`}
              >
                <Hash size={18} /> 加入房间
              </button>
            </div>
          </form>
        </div>
        {renderAIConfigModal()}
      </div>
    );
  }

  if (!joined) {
    return (
      <div className={`h-[100dvh] w-full ${THEME.bg} ${THEME.primary} font-mono flex flex-col items-center justify-center p-4`}>
        <button
          onClick={openAIConfig}
          className={`absolute top-4 right-4 border ${THEME.border} px-3 py-2 text-xs flex items-center gap-2 hover:border-[var(--color-primary)]`}
        >
          <Settings size={14} /> AI 配置
        </button>
        <div className={`max-w-md w-full border ${THEME.border} p-8 relative`}>
          <div className={`absolute top-0 left-0 ${THEME.primary} bg-[var(--color-bg)] border ${THEME.border} text-xs px-2 py-1`}>
            {roomEntryMode === 'create' ? '创建房间' : '加入房间'}
          </div>
          <h1 className="text-4xl mb-8 mt-4 tracking-tighter">海龟汤<span className="animate-pulse">_</span></h1>
          <div className={`mb-6 text-xs border ${THEME.border} ${THEME.bgPanel} p-3 flex items-center justify-between gap-3`}>
            <span className="flex items-center gap-2 min-w-0">
              <Hash size={14} />
              <span className="truncate">当前房间：{roomId}</span>
            </span>
            <button
              type="button"
              onClick={handleLeaveRoom}
              className={`${THEME.textDim} hover:text-[var(--color-primary)] shrink-0`}
            >
              换房间
            </button>
          </div>
          {authError && (
            <div className={`mb-4 text-xs border border-[var(--color-error)] text-[var(--color-error)] p-3`}>
              {authError}
            </div>
          )}
          <form onSubmit={(e) => { e.preventDefault(); handleJoin(); }} className="space-y-6">
            <div>
              <label className={`block text-xs ${THEME.textDim} mb-2 uppercase tracking-widest`}>输入你的昵称</label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                className={`w-full ${THEME.bg} border ${THEME.border} p-3 ${THEME.primary} focus:border-[var(--color-border-active)] outline-none placeholder-[var(--color-text-dim)] text-base md:text-sm`}
                placeholder="昵称"
                maxLength={10}
                autoFocus
              />
            </div>
            <button
              type="submit"
              className={`w-full ${THEME.bg} border ${THEME.border} ${THEME.primary} hover:opacity-80 font-bold py-3 transition-colors flex items-center justify-center gap-2`}
            >
              <Activity size={18} /> {roomEntryMode === 'create' ? '创建并进入' : '进入房间'}
            </button>
          </form>
        </div>
        {renderAIConfigModal()}
      </div>
    );
  }

  if (gamePhase === 'LOBBY') {
    return (
      <div className={`h-[100dvh] w-full ${THEME.bg} ${THEME.text} ${THEME.font} flex flex-col overflow-hidden`}>
        <header className={`border-b ${THEME.border} px-4 py-3 shrink-0 flex items-center justify-between gap-3`}>
          <div className="min-w-0">
            <div className={`text-[10px] ${THEME.textDim} tracking-[0.24em] font-bold mb-1`}>准备大厅</div>
            <div className="font-bold tracking-[0.16em] flex items-center gap-2 min-w-0">
              <Hash size={16} className="shrink-0" />
              <span className="truncate">房间_{roomId}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={handleLeaveRoom}
            className={`text-xs ${THEME.textDim} hover:text-[var(--color-primary)] shrink-0`}
          >
            换房间
          </button>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="w-full max-w-3xl mx-auto space-y-4">
            <section className={`border ${THEME.border} ${THEME.bgPanel} p-4 md:p-5`}>
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <div className={`text-xs ${THEME.textDim} mb-2`}>房主：{roomOwner?.name || '等待中'}{isRoomOwner ? '（你）' : ''}</div>
                  <div className="text-2xl font-bold tracking-[0.18em]">{roomId}</div>
                </div>
                <button
                  type="button"
                  onClick={copyRoomLink}
                  className={`border ${THEME.border} px-3 py-2 text-xs font-bold hover:border-[var(--color-primary)]`}
                >
                  复制链接
                </button>
              </div>
            </section>

            <section className={`border ${THEME.border} ${THEME.bgPanel} p-4 md:p-5`}>
              <div className="flex items-center justify-between mb-4">
                <h2 className={`text-xs ${THEME.textDim} uppercase tracking-[0.2em] flex items-center gap-2`}>
                  <Users size={14} /> 玩家
                </h2>
                <span className={`text-xs ${THEME.textDim}`}>{activePlayers.length} 人在线</span>
              </div>

              <div className="space-y-2">
                {activePlayers.length === 0 ? (
                  <div className={`text-sm ${THEME.textDim} border ${THEME.border} p-4 text-center`}>等待玩家加入...</div>
                ) : activePlayers.map((player) => {
                  const playerIsOwner = roomOwner?.uid === player.uid;
                  const playerReady = playerIsOwner || player.ready;

                  return (
                    <div
                      key={player.uid}
                      className={`border ${player.uid === user.uid ? 'border-[var(--color-primary)]' : THEME.border} ${THEME.bg} p-3 flex items-center justify-between gap-3`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-9 h-9 ${playerReady ? 'bg-[var(--color-primary)] text-[var(--color-inverse)]' : `${THEME.bgSoft} border ${THEME.border} ${THEME.textDim}`} flex items-center justify-center font-bold text-xs shrink-0`}>
                          {playerReady ? 'OK' : '--'}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-bold truncate">
                            {player.name}{player.uid === user.uid ? '（你）' : ''}
                            {playerIsOwner && (
                              <span className={`ml-2 text-[10px] border ${THEME.border} px-1 ${THEME.textDim}`}>房主</span>
                            )}
                          </div>
                          <div className={`text-[10px] ${playerReady ? 'text-[var(--color-primary)]' : THEME.textDim}`}>
                            {playerIsOwner ? '房主就绪' : (player.ready ? '已准备' : '未准备')}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-xs ${playerReady ? 'text-[var(--color-primary)]' : THEME.textDim}`}>
                          {playerReady ? 'READY' : 'WAIT'}
                        </span>
                        {canManageRoom && !playerIsOwner && player.uid !== user.uid && (
                          <button
                            type="button"
                            onClick={() => handleKickPlayer(player)}
                            title={`将 ${player.name} 移出房间`}
                            className={`p-1 border ${THEME.border} ${THEME.textDim} hover:border-[var(--color-error)] hover:text-[var(--color-error)] transition-colors`}
                          >
                            <UserX size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="flex flex-col md:flex-row gap-3">
              {isRoomOwner ? (
                <div className={`flex-1 border-2 border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-inverse)] py-4 text-center font-bold`}>
                  房主就绪
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleToggleReady}
                  className={`flex-1 border-2 py-4 font-bold transition-colors ${currentPlayer?.ready
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-inverse)]'
                    : `${THEME.border} ${THEME.bg} hover:border-[var(--color-primary)]`
                    }`}
                >
                  {currentPlayer?.ready ? '取消准备' : '准备'}
                </button>
              )}

              {canManageRoom ? (
                <div className="flex-1">
                  <button
                    type="button"
                    onClick={openGenerateModal}
                    disabled={!allActivePlayersReady || isGenerating || isGenerationLocked}
                    className={`w-full border-2 py-4 font-bold transition-colors flex items-center justify-center gap-2 ${allActivePlayersReady && !isGenerating && !isGenerationLocked
                      ? 'border-[var(--color-primary)] text-[var(--color-primary)] hover:bg-[var(--color-primary)] hover:text-[var(--color-inverse)]'
                      : `${THEME.border} ${THEME.textDim} cursor-not-allowed opacity-60`
                      }`}
                  >
                    {isGenerating || isGenerationLocked ? (
                      <>
                        <Loader2 size={18} className="animate-spin" /> 正在开始
                      </>
                    ) : (
                      <>
                        <Activity size={18} /> 选择类型并开始
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <div className={`flex-1 border ${THEME.border} ${THEME.bgSoft} ${THEME.textDim} py-4 text-center text-sm`}>
                  等待房主开始
                </div>
              )}
            </section>

            <section className={`border ${THEME.border} ${THEME.bgSoft} p-4 font-mono text-[10px] max-h-40 overflow-y-auto`}>
              {systemLogs.slice(0, 8).map((log, index) => (
                <LogItem key={`${log}-${index}`} message={log} />
              ))}
            </section>
          </div>
        </main>
        {renderNewGameModal()}
        {renderAIConfigModal()}
      </div>
    );
  }

  if (isInitialPuzzleLoading || gamePhase === 'STARTING' || !currentPuzzle) {
    return (
      <div className={`h-[100dvh] w-full ${THEME.bg} ${THEME.primary} font-mono flex flex-col items-center justify-center p-4 text-center`}>
        <div className={`w-full max-w-md border ${THEME.border} ${THEME.bgPanel} p-8 relative overflow-hidden`}>
          <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-transparent via-[var(--color-primary)]/10 to-transparent h-2 w-full animate-scan"></div>
          <Loader2 size={34} className="mx-auto mb-5 animate-spin" />
          <h1 className="text-xl font-bold mb-3 tracking-widest">AI 正在生成海龟汤</h1>
          <p className={`text-xs ${THEME.textDim} leading-relaxed`}>
            房间 {roomId} 的房主正在准备新谜题，请稍等片刻。
          </p>
        </div>
      </div>
    );
  }

  // --- FINISHED 界面：游戏结束，显示汤底 ---
  if (gamePhase === 'FINISHED') {
    return (
      <div className={`h-[100dvh] w-full ${THEME.bg} ${THEME.text} ${THEME.font} flex flex-col overflow-hidden`}>
        {/* Header */}
        <header className={`h-12 border-b ${THEME.border} flex items-center justify-center px-4 shrink-0`}>
          <span className="font-bold tracking-widest text-[var(--color-primary)] animate-pulse">
            {'>>'} 案件结束 // 房间 {roomId} {'<<'}
          </span>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-6 flex flex-col items-center">
          <div className="max-w-2xl w-full space-y-8">
            {/* 成功消息 */}
            <div className={`text-center border-2 border-[var(--color-primary)] p-6 ${THEME.bgPanel}`}>
              <div className="text-4xl mb-4">🎉</div>
              <h1 className="text-2xl font-bold text-[var(--color-primary)] mb-2">谜题已被破解！</h1>
              <p className={`${THEME.textDim}`}>
                由 <span className="text-[var(--color-primary)] font-bold">{solvedBy}</span> 成功解开
              </p>
            </div>

            {/* 汤面回顾 */}
            <div className={`border ${THEME.border} p-4 ${THEME.bgPanel}`}>
              <h2 className={`text-xs ${THEME.textDim} uppercase tracking-widest mb-3`}>汤面</h2>
              <p className="text-sm leading-relaxed">{currentPuzzle.content}</p>
            </div>

            {/* 汤底揭晓 */}
            <div className={`border-2 border-[var(--color-primary)] p-6 ${THEME.bgPanel} relative`}>
              <div className={`absolute -top-3 left-4 bg-[var(--color-bg)] px-2 text-xs text-[var(--color-primary)] uppercase tracking-widest`}>
                汤底
              </div>
              <p className="text-sm leading-relaxed mt-2">{currentPuzzle.truth}</p>
            </div>

            {/* 排行榜 */}
            <div className={`border ${THEME.border} p-4 ${THEME.bgPanel}`}>
              <h2 className={`text-xs ${THEME.textDim} uppercase tracking-widest mb-3`}>排行榜</h2>
              <div className="space-y-2">
                {players
                  .slice()
                  .sort((a, b) => (b.score || 0) - (a.score || 0))
                  .map((p, idx) => {
                    const isOffline = !isPlayerActive(p, now);

                    return (
                      <div key={p.uid} className={`flex items-center justify-between text-sm ${isOffline ? 'opacity-40 grayscale' : ''}`}>
                        <div className="flex items-center gap-3">
                          <span className={`w-6 h-6 flex items-center justify-center ${idx === 0 && !isOffline ? 'bg-[var(--color-primary)] text-[var(--color-inverse)]' : THEME.bgSoft} text-xs font-bold`}>
                            {idx + 1}
                          </span>
                          <span className={p.uid === user.uid ? 'text-[var(--color-primary)] font-bold' : ''}>
                            {p.name} {p.uid === user.uid && '（你）'} {isOffline && '（离线）'}
                          </span>
                          {roomOwner?.uid === p.uid && (
                            <span className={`text-[10px] border ${THEME.border} px-1.5 py-0.5 ${THEME.textDim}`}>
                              房主
                            </span>
                          )}
                        </div>
                        <span className="font-bold">{p.score || 0} 分</span>
                      </div>
                    )
                  })}
              </div>
            </div>

            {/* 新游戏按钮 */}
            <button
              onClick={handleResetToLobby}
              disabled={!canManageRoom || isGenerating || isGenerationLocked}
              className={`w-full border-2 border-[var(--color-primary)] ${THEME.bg} text-[var(--color-primary)] hover:bg-[var(--color-primary)] hover:text-[var(--color-inverse)] font-bold py-4 transition-colors flex items-center justify-center gap-2 text-lg disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {!canManageRoom ? (
                <>
                  <Lock size={24} /> 仅房主可开始新一轮
                </>
              ) : isGenerating || isGenerationLocked ? (
                <>
                  <RefreshCw size={24} className="animate-spin" />
                  {isGenerating ? '正在生成...' : `锁定中 (${generationLock?.by})`}
                </>
              ) : (
                <>
                  <Activity size={24} /> 回到准备大厅
                </>
              )}
            </button>
          </div>
        </main>
        {renderNewGameModal()}
      </div>
    );
  }

  return (
    <div className={`fixed inset-0 w-full ${THEME.bg} ${THEME.text} ${THEME.font} flex flex-col overflow-hidden selection:bg-[var(--color-primary)] selection:text-[var(--color-inverse)]`}>
      {/* HEADER */}
      <header className={`border-b ${THEME.border} flex flex-col gap-2 px-3 py-2 md:h-12 md:flex-row md:items-center md:justify-between md:px-4 md:py-0 shrink-0`}>
        <div className="flex w-full min-w-0 items-center justify-between gap-3 md:w-auto md:justify-start">
          <div className="flex min-w-0 items-center gap-4">
            <div className="min-w-0">
              <div className={`md:hidden text-[10px] leading-none ${THEME.textDim} font-bold tracking-[0.22em]`}>房间</div>
              <span className="font-bold flex items-center gap-1.5 md:gap-2 leading-tight tracking-[0.16em] md:tracking-widest min-w-0">
                <Hash size={16} className="shrink-0" />
                <span className="hidden md:inline">房间_{roomId}</span>
                <span className="md:hidden truncate text-xl">_{roomId}</span>
              </span>
            </div>
            {roomOwner?.name && (
              <span className={`text-xs ${THEME.textDim} hidden md:inline`}>
                房主：{roomOwner.name}{isRoomOwner ? '（你）' : ''}
              </span>
            )}
            <button
              onClick={handleLeaveRoom}
              className={`text-xs ${THEME.textDim} hover:text-[var(--color-primary)] hidden md:inline`}
              title="退出当前房间"
            >
              换房间
            </button>
            {isGlobalLoading ? (
              <div className="hidden md:flex items-center gap-2 text-[var(--color-primary)] animate-pulse">
                <Loader2 size={12} className="animate-spin" />
                <span className="text-[10px] font-bold">AI 思考中...</span>
              </div>
            ) : (
              <span className="text-xs text-[#666] hidden md:inline">延迟：12ms</span>
            )}
          </div>

          <div className="flex items-center gap-2 md:hidden">
            <button
              onClick={() => setTheme(theme === 'night' ? 'day' : 'night')}
              className={`h-10 w-10 rounded-md ${THEME.border} border hover:opacity-80 transition-opacity flex items-center justify-center`}
              title="切换主题"
              aria-label="切换主题"
            >
              {theme === 'night' ? <Sun size={18} className={THEME.primary} /> : <Moon size={18} className={THEME.primary} />}
            </button>
            <button
              onClick={openAIConfig}
              className={`h-10 w-10 rounded-md ${THEME.border} border hover:opacity-80 transition-opacity flex items-center justify-center`}
              title="AI 配置"
              aria-label="AI 配置"
            >
              <Settings size={18} className={THEME.primary} />
            </button>
            <button
              onClick={() => setPersona(persona === 'TERMINAL' ? 'MESUGAKI' : 'TERMINAL')}
              className={`h-10 w-10 rounded-md ${THEME.border} border hover:opacity-80 transition-opacity flex items-center justify-center ${persona === 'MESUGAKI' ? 'bg-pink-500/10 border-pink-500 text-pink-500' : ''}`}
              title={persona === 'TERMINAL' ? "切换到性格模式" : "切换到终端模式"}
              aria-label={persona === 'TERMINAL' ? "切换到性格模式" : "切换到终端模式"}
            >
              {persona === 'TERMINAL' ? <TerminalSquare size={18} /> : <MessageCircle size={18} />}
            </button>
          </div>
        </div>

        <div className="flex w-full items-center gap-2 md:hidden" title={`真相完整度：${worldCompleteness}%`}>
          <span className={`text-[10px] uppercase font-bold ${THEME.textDim} tracking-[0.2em] shrink-0`}>真相</span>
          <div className={`h-2 flex-1 ${THEME.bgSoft} border ${THEME.border} relative overflow-hidden`}>
            <div
              className={`h-full bg-[var(--color-primary)] transition-all duration-1000 ease-out`}
              style={{ width: `${worldCompleteness}%` }}
            ></div>
          </div>
          <span className={`text-xs w-10 text-right font-mono shrink-0 ${worldCompleteness >= 80 ? 'text-[var(--color-primary)] shadow-glow' : ''}`}>
            {worldCompleteness}%
          </span>
        </div>

        <div className="hidden md:flex items-center gap-4">
          <button
            onClick={() => setTheme(theme === 'night' ? 'day' : 'night')}
            className={`h-7 w-7 rounded ${THEME.border} border hover:opacity-80 transition-opacity flex items-center justify-center`}
            title="切换主题"
            aria-label="切换主题"
          >
            {theme === 'night' ? <Sun size={14} className={THEME.primary} /> : <Moon size={14} className={THEME.primary} />}
          </button>
          <button
            onClick={openAIConfig}
            className={`h-7 w-7 rounded ${THEME.border} border hover:opacity-80 transition-opacity flex items-center justify-center`}
            title="AI 配置"
            aria-label="AI 配置"
          >
            <Settings size={14} className={THEME.primary} />
          </button>
          <button
            onClick={() => setPersona(persona === 'TERMINAL' ? 'MESUGAKI' : 'TERMINAL')}
            className={`h-7 rounded ${THEME.border} border hover:opacity-80 transition-opacity flex items-center gap-1 px-2 ${persona === 'MESUGAKI' ? 'bg-pink-500/10 border-pink-500 text-pink-500' : ''}`}
            title={persona === 'TERMINAL' ? "切换到性格模式" : "切换到终端模式"}
            aria-label={persona === 'TERMINAL' ? "切换到性格模式" : "切换到终端模式"}
          >
            {persona === 'TERMINAL' ? <TerminalSquare size={14} /> : <MessageCircle size={14} />}
            <span className="text-[10px] font-bold">{persona === 'TERMINAL' ? 'SYS' : 'U-14'}</span>
          </button>
          <div className="flex gap-2 items-center" title={`真相完整度：${worldCompleteness}%`}>
            <span className={`text-[10px] uppercase font-bold ${THEME.textDim}`}>真相</span>
            <div className="flex gap-1 items-center">
              <div className={`w-24 h-2 ${THEME.bgSoft} border ${THEME.border} relative overflow-hidden`}>
                <div
                  className={`h-full bg-[var(--color-primary)] transition-all duration-1000 ease-out`}
                  style={{ width: `${worldCompleteness}%` }}
                ></div>
              </div>
              <span className={`text-xs w-8 text-right font-mono ${worldCompleteness >= 80 ? 'text-[var(--color-primary)] shadow-glow' : ''}`}>
                {worldCompleteness}%
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* MOBILE TABS */}
      <div className={`md:hidden flex border-b ${THEME.border} text-xs sticky top-0 z-20 ${THEME.bg}`}>
        <button onClick={() => setActiveTab('CASE')} className={`flex-1 py-4 text-center font-bold transition-colors ${activeTab === 'CASE' ? `border-b-2 border-[var(--color-primary)] text-[var(--color-primary)]` : THEME.textDim}`}>案情</button>
        <button onClick={() => setActiveTab('TERMINAL')} className={`flex-1 py-4 text-center font-bold transition-colors ${activeTab === 'TERMINAL' ? `border-b-2 border-[var(--color-primary)] text-[var(--color-primary)]` : THEME.textDim}`}>提问</button>
        <button onClick={() => setActiveTab('SQUAD')} className={`flex-1 py-4 text-center font-bold transition-colors ${activeTab === 'SQUAD' ? `border-b-2 border-[var(--color-primary)] text-[var(--color-primary)]` : THEME.textDim}`}>玩家</button>
      </div>

      {/* MAIN LAYOUT */}
      <main className="flex-1 grid grid-cols-12 grid-rows-1 min-h-0 relative overflow-hidden">

        {/* LEFT PANEL: Case File */}
        <div className={`
          ${activeTab === 'CASE' ? 'block' : 'hidden'} 
          md:col-span-3 md:block 
          border-r ${THEME.border} flex flex-col
          ${THEME.bg} absolute md:relative z-10 w-full h-full
        `}>
          <div className={`p-4 border-b ${THEME.border}`}>
            <div className="flex items-center justify-between mb-4">
              <h2 className={`text-xs ${THEME.textDim} uppercase tracking-[0.2em]`}>汤面</h2>
              <button
                onClick={handleResetToLobby}
                disabled={!canManageRoom || isGenerating || isGenerationLocked}
                className={`text-xs px-3 py-1.5 border ${THEME.border} flex items-center gap-2 transition-all
                  ${!canManageRoom || isGenerating || isGenerationLocked
                    ? 'opacity-50 cursor-not-allowed'
                    : 'hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]'
                  }`}
              >
                {!canManageRoom ? (
                  <>
                    <Lock size={12} />
                    房主专用
                  </>
                ) : isGenerating || isGenerationLocked ? (
                  <>
                    <RefreshCw size={12} className="animate-spin" />
                    {isGenerating ? '本地生成中...' : `锁定中 (${generationLock?.by})`}
                  </>
                ) : (
                  <>
                    <Sparkles size={12} />
                    回准备大厅
                  </>
                )}
              </button>
            </div>
            <div className={`border border-[var(--color-primary)] p-4 ${THEME.bgPanel} relative overflow-hidden group`}>
              {/* Scanline effect */}
              <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[var(--color-primary)]/10 to-transparent h-2 w-full animate-scan pointer-events-none"></div>

              <h3 className="text-lg font-bold mb-2">{currentPuzzle.title}</h3>
              <p className="text-sm opacity-90 leading-relaxed mb-3">{currentPuzzle.content}</p>

              {/* Tags */}
              {currentPuzzle.tags && (
                <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-[var(--color-border)]">
                  {/* Genre Tag */}
                  <span className={`text-[10px] px-2 py-1 border ${currentPuzzle.tags.genre === '变格'
                    ? 'border-purple-500 text-purple-400 bg-purple-500/10'
                    : 'border-blue-500 text-blue-400 bg-blue-500/10'
                    }`}>
                    {currentPuzzle.tags.genre === '变格' ? '👻 变格' : '🔍 本格'}
                  </span>

                  {/* Death Tag */}
                  <span className={`text-[10px] px-2 py-1 border ${currentPuzzle.tags.has_death
                    ? 'border-red-500 text-red-400 bg-red-500/10'
                    : 'border-green-500 text-green-400 bg-green-500/10'
                    }`}>
                    {currentPuzzle.tags.has_death ? '💀 有人死亡' : '✓ 无人死亡'}
                  </span>

                  {/* Difficulty Tag */}
                  <span className={`text-[10px] px-2 py-1 border ${currentPuzzle.tags.difficulty === '难'
                    ? 'border-orange-500 text-orange-400 bg-orange-500/10'
                    : currentPuzzle.tags.difficulty === '中'
                      ? 'border-yellow-500 text-yellow-400 bg-yellow-500/10'
                      : 'border-green-500 text-green-400 bg-green-500/10'
                    }`}>
                    {currentPuzzle.tags.difficulty === '难'
                      ? '⭐⭐⭐ 难'
                      : currentPuzzle.tags.difficulty === '中'
                        ? '⭐⭐ 中'
                        : '⭐ 易'}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="flex-1 p-4 overflow-y-auto min-h-0">
            <h2 className={`text-xs ${THEME.textDim} uppercase tracking-[0.2em] mb-4 flex items-center gap-2`}>
              <FileText size={12} /> 线索
            </h2>
            <ul className="space-y-3">
              {clues.length === 0 && <li className={`text-xs ${THEME.textDim} italic`}>还没有收集到线索...</li>}
              {clues.map((c, i) => (
                <li key={i} className={`text-xs border-l-2 border-[var(--color-primary)] pl-2 py-2 animate-fadeIn`}>
                  <span className={`block ${THEME.textDim} text-xs mb-1 font-bold`}>线索片段_{i + 1} // {c.unlockedBy}</span>
                  <span className="leading-relaxed">{c.text}</span>
                </li>
              ))}
              {/* Locked Placeholders */}
              {[...Array(3)].map((_, i) => (
                <li key={`locked-${i}`} className={`text-xs ${THEME.textDim} opacity-50 font-bold select-none`}>
                  [加密线索_{i + 9}]
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* CENTER PANEL: Terminal */}
        <div className={`
          ${activeTab === 'TERMINAL' ? 'flex' : 'hidden'} 
          md:col-span-6 md:flex 
          flex-col min-h-0 ${THEME.bg} h-full overflow-hidden col-span-12
        `}>
          {/* Messages Area */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto min-h-0 p-4 space-y-4 font-mono text-sm"
          >
            {/* Intro Message */}
            <div className={`opacity-50 text-xs text-center border-b ${THEME.border} pb-4 mb-4`}>
              -- 安全频道已建立 --<br />
              -- AI 主持人在线 --
            </div>

            {messages.map((msg) => {
              const isAI = msg.senderId === 'AI';
              const isMe = msg.senderId === user.uid;
              const isAttempt = msg.type === 'attempt';

              return (
                <div key={msg.id} className={`flex flex-col ${isAI ? 'items-start' : 'items-start'} mb-2`}>
                  {/* Header */}
                  <div className={`flex items-center gap-2 text-xs ${THEME.textDim} mb-1`}>
                    <span className={isMe ? `text-[var(--color-primary)]` : ''}>
                      {isAI ? '>> 系统' : `[${msg.sender}]`}
                    </span>
                    <span>{formatTimestampTime(msg.timestamp)}</span>
                  </div>

                  {/* Content */}
                  <div className={`
                    break-words max-w-full
                    ${isAI ? 'font-bold' : 'font-normal'}
                    ${isAttempt ? `text-[var(--color-warn)]` : ''}
                    ${msg.type === 'success' ? `text-[var(--color-primary)] border border-[var(--color-primary)] p-2 ${THEME.bgPanel}` : ''}
                    ${msg.type === 'error' ? `text-[var(--color-error)]` : ''}
                    ${msg.type === 'question' ? `text-[var(--color-text)]` : ''}
                  `}>
                    {isAI ? (
                      <Typewriter text={msg.text} />
                    ) : (
                      <span>{isAttempt ? `> 猜汤底：${msg.text}` : `$ ${msg.text}`}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Input Area */}
          <div className={`shrink-0 border-t ${inputMode === 'SOLVE' ? `border-[var(--color-warn)]` : THEME.border} p-4 pb-[max(1rem,env(safe-area-inset-bottom))] ${THEME.bgSoft} transition-all duration-200`}>
            {/* Mode Toggle */}
            <div className="flex items-center gap-4 mb-3">
              <button
                onClick={() => setInputMode(inputMode === 'QUERY' ? 'SOLVE' : 'QUERY')}
                className={`text-xs px-2 py-1 border flex items-center gap-2 transition-colors
                  ${inputMode === 'QUERY'
                    ? `${THEME.border} ${THEME.textDim} hover:text-[var(--color-primary)]`
                    : `border-[var(--color-warn)] text-[var(--color-warn)] bg-[var(--color-warn)]/20`}
                `}
              >
                {inputMode === 'QUERY' ? <ToggleLeft size={14} /> : <ToggleRight size={14} />}
                模式：{inputMode === 'SOLVE' ? '猜汤底' : '提问'}
              </button>
              {inputMode === 'SOLVE' && (
                <span className={`text-[10px] text-[var(--color-warn)] animate-pulse`}>注意：猜汤底前请尽量确认完整真相</span>
              )}
            </div>

            <form onSubmit={handleSendMessage} className="flex gap-2 relative">
              <span className={`self-center font-bold ${inputMode === 'SOLVE' ? `text-[var(--color-warn)]` : `text-[var(--color-primary)]`}`}>
                {inputMode === 'SOLVE' ? '汤底 >' : '提问 >'}
              </span>
              <input
                type="text"
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                className={`flex-1 bg-transparent border-b ${inputMode === 'SOLVE' ? `border-[var(--color-warn)]` : THEME.border} focus:border-[var(--color-primary)] outline-none text-[var(--color-text)] font-mono h-10 text-base md:text-sm`}
                placeholder={inputMode === 'SOLVE' ? "描述你认为完整的真相..." : "输入一个是/否问题..."}
                autoFocus
              />
              <button type="submit" className={`${THEME.textDim} hover:text-[var(--color-primary)]`}>
                <Send size={18} />
              </button>
            </form>
          </div>
        </div>

        {/* RIGHT PANEL: Squad */}
        <div className={`
          ${activeTab === 'SQUAD' ? 'block' : 'hidden'} 
          md:col-span-3 md:block 
          border-l ${THEME.border} ${THEME.bg}
          absolute md:relative z-10 w-full h-full flex flex-col
        `}>
          {/* Leaderboard */}
          <div className="flex-1 p-4 overflow-y-auto min-h-0">
            <h2 className={`text-xs ${THEME.textDim} uppercase tracking-[0.2em] mb-4 flex items-center gap-2`}>
              <Users size={12} /> 玩家状态
            </h2>
            <div className="space-y-4">
              {activePlayers.length === 0 ? (
                <div className={`text-[10px] ${THEME.textDim} py-4 text-center`}>正在扫描玩家...</div>
              ) : (
                activePlayers
                  .slice()
                  .sort((a, b) => (b.score || 0) - (a.score || 0)).map(p => (
                    <div key={p.uid} className={`flex items-center justify-between border ${p.uid === user.uid ? `border-[var(--color-primary)] ${THEME.bgPanel}` : `border-transparent opacity-80`} p-2`}>
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 ${p.uid === user.uid ? 'bg-[var(--color-primary)] text-[var(--color-inverse)]' : `${THEME.bgSoft} border ${THEME.border} ${THEME.textDim}`} flex items-center justify-center font-bold text-xs`}>
                          {p.name.substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div className={`text-xs font-bold ${p.uid === user.uid ? 'text-[var(--color-primary)]' : ''}`}>
                            {p.name}
                            {roomOwner?.uid === p.uid && (
                              <span className={`ml-2 text-[10px] border ${THEME.border} px-1 ${THEME.textDim}`}>
                                房主
                              </span>
                            )}
                          </div>
                          <div className={`text-[10px] ${THEME.textDim} flex items-center gap-2`}>
                            <span>提问次数：{p.queryCount ?? MAX_QUERY_COUNT}/{MAX_QUERY_COUNT}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-lg font-bold">{p.score || 0}</div>
                        {canManageRoom && roomOwner?.uid !== p.uid && p.uid !== user.uid && (
                          <button
                            type="button"
                            onClick={() => handleKickPlayer(p)}
                            title={`将 ${p.name} 移出房间`}
                            className={`p-1 border ${THEME.border} ${THEME.textDim} hover:border-[var(--color-error)] hover:text-[var(--color-error)] transition-colors`}
                          >
                            <UserX size={12} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))
              )}
            </div>
          </div>

          {/* System Log */}
          <div className={`h-1/3 border-t ${THEME.border} p-4 ${THEME.bgSoft} font-mono text-[10px] overflow-y-auto`}>
            <h2 className={`${THEME.textDim} uppercase mb-2 flex items-center gap-2`}>
              <Cpu size={10} /> 系统日志
            </h2>
            <div className={`space-y-1 ${THEME.textDim}`}>
              {systemLogs.map((log, i) => (
                <LogItem key={i} message={log} />
              ))}
              <div>&gt; 系统就绪</div>
            </div>
          </div>
        </div>

      </main>

      {/* New Game Modal */}
      {/* New Game Modal */}
      {renderNewGameModal()}
      {renderAIConfigModal()}

      {/* Global CSS for animations */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&display=swap');
        
        .animate-scan {
          animation: scan 2s linear infinite;
        }
        
        @keyframes scan {
          0% { transform: translateY(-100%); }
          100% { transform: translateY(400%); }
        }

        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out;
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateX(-10px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}

export default function App() {
  const isAdminPath = typeof window !== 'undefined' && window.location.pathname === '/admin';
  return isAdminPath ? <AdminPanel /> : <GameApp />;
}
