import { useState, useEffect, useCallback, useRef } from 'react'

interface Todo {
  id: number
  title: string
  pomodoroCount: number
  totalMinutes: number
  completed: boolean
  createdAt: string
}

declare global {
  interface Window {
    electronAPI?: {
      shrinkToggle: () => Promise<boolean>
      togglePin: () => Promise<boolean>
      onUpdateStatus: (cb: (payload: { type: string; percent?: number }) => void) => void
      todo: {
        getAll: () => Promise<Todo[]>
        create: (title: string) => Promise<Todo>
        addPomodoro: (id: number, minutes: number) => Promise<Todo>
        toggleComplete: (id: number) => Promise<Todo>
        delete: (id: number) => Promise<void>
      }
    }
  }
}

type Mode = 'clock' | 'pomodoro' | 'timer'
type PomodoroPhase = 'work' | 'break'

const TrashIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14H6L5 6" />
    <path d="M10 11v6M14 11v6" />
    <path d="M9 6V4h6v2" />
  </svg>
)

const formatTime = (seconds: number) => {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0')
  const s = (seconds % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

const formatMinutes = (min: number) => min >= 60 ? `${Math.floor(min / 60)}h${min % 60 > 0 ? `${min % 60}m` : ''}` : `${min}分`

const playBeep = () => {
  const ctx = new AudioContext()
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.type = 'sine'
  osc.frequency.value = 880
  gain.gain.setValueAtTime(0.4, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.5)
  osc.start(ctx.currentTime)
  osc.stop(ctx.currentTime + 1.5)
}

const loadStorage = <T,>(key: string, fallback: T): T => {
  try {
    const v = localStorage.getItem(key)
    return v !== null ? (JSON.parse(v) as T) : fallback
  } catch {
    return fallback
  }
}

const saveStorage = <T,>(key: string, value: T) => {
  localStorage.setItem(key, JSON.stringify(value))
}

const App = () => {
  const [mode, setMode] = useState<Mode>(() => loadStorage('mode', 'clock'))
  const [isDark, setIsDark] = useState(() => loadStorage('isDark', true))
  const [currentTime, setCurrentTime] = useState('')

  // 番茄鐘設定
  const [pomodoroMinutes, setPomodoroMinutes] = useState(() => loadStorage('pomodoroMinutes', 25))
  const [breakMinutes, setBreakMinutes] = useState(() => loadStorage('breakMinutes', 5))
  const [longBreakMinutes, setLongBreakMinutes] = useState(() => loadStorage('longBreakMinutes', 15))
  const [cycleCount, setCycleCount] = useState(() => loadStorage('cycleCount', 0))
  const [isLongBreak, setIsLongBreak] = useState(false)
  const [pomodoroPhase, setPomodoroPhase] = useState<PomodoroPhase>('work')
  const [pomodoroSeconds, setPomodoroSeconds] = useState(() =>
    loadStorage('pomodoroSeconds', loadStorage('pomodoroMinutes', 25) * 60)
  )
  const [pomodoroRunning, setPomodoroRunning] = useState(false)

  // 自訂計時器
  const [timerInput, setTimerInput] = useState(() =>
    loadStorage('timerInput', { minutes: '5', seconds: '0' })
  )
  const [timerSeconds, setTimerSeconds] = useState(() =>
    loadStorage('timerSeconds', 5 * 60)
  )
  const [timerRunning, setTimerRunning] = useState(false)

  // 視窗控制
  const [isPinned, setIsPinned] = useState(false)
  const [isShrunk, setIsShrunk] = useState(false)

  // 更新進度
  const [updateStatus, setUpdateStatus] = useState<{ type: string; percent?: number } | null>(null)

  // Todo
  const [todos, setTodos] = useState<Todo[]>([])
  const [activeTodoId, setActiveTodoId] = useState<number | null>(null)
  const [newTodoTitle, setNewTodoTitle] = useState('')

  // Modal（完成歸屬）
  const [showModal, setShowModal] = useState(false)
  const [pendingModal, setPendingModal] = useState(false)
  const [modalSelectedId, setModalSelectedId] = useState<number | null>(null)
  const [modalNewTitle, setModalNewTitle] = useState('')

  // 記錄完成的工作分鐘（供 modal confirm 使用）
  const completedWorkMinutes = useRef(pomodoroMinutes)

  // 載入 todos
  useEffect(() => {
    window.electronAPI?.todo.getAll().then(setTodos)
  }, [])

  // 更新進度監聽
  useEffect(() => {
    window.electronAPI?.onUpdateStatus((payload) => {
      setUpdateStatus(payload)
    })
  }, [])

  // 深色模式
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark)
    saveStorage('isDark', isDark)
  }, [isDark])

  // 持久化
  useEffect(() => { saveStorage('mode', mode) }, [mode])
  useEffect(() => { saveStorage('pomodoroMinutes', pomodoroMinutes) }, [pomodoroMinutes])
  useEffect(() => { saveStorage('breakMinutes', breakMinutes) }, [breakMinutes])
  useEffect(() => { saveStorage('longBreakMinutes', longBreakMinutes) }, [longBreakMinutes])
  useEffect(() => { saveStorage('cycleCount', cycleCount) }, [cycleCount])
  useEffect(() => { saveStorage('pomodoroSeconds', pomodoroSeconds) }, [pomodoroSeconds])
  useEffect(() => { saveStorage('timerSeconds', timerSeconds) }, [timerSeconds])
  useEffect(() => { saveStorage('timerInput', timerInput) }, [timerInput])

  // 設定變更時重置（未在計時中才更新）
  useEffect(() => {
    if (!pomodoroRunning && pomodoroPhase === 'work') {
      setPomodoroSeconds(pomodoroMinutes * 60)
    }
  }, [pomodoroMinutes])

  useEffect(() => {
    if (!pomodoroRunning && pomodoroPhase === 'break') {
      setPomodoroSeconds(breakMinutes * 60)
    }
  }, [breakMinutes])

  // 縮小視窗還原後，若有待顯示的 modal 則顯示
  useEffect(() => {
    if (!isShrunk && pendingModal) {
      setShowModal(true)
      setPendingModal(false)
    }
  }, [isShrunk, pendingModal])

  // 時鐘
  useEffect(() => {
    if (mode !== 'clock') return
    const update = () => setCurrentTime(new Date().toLocaleTimeString('zh-TW', { hour12: false }))
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [mode])

  // 番茄鐘計時（工作 & 休息共用）
  useEffect(() => {
    if (!pomodoroRunning) return
    const id = setInterval(() => {
      setPomodoroSeconds(prev => {
        if (prev <= 1) {
          setPomodoroRunning(false)
          playBeep()
          if (pomodoroPhase === 'work') {
            completedWorkMinutes.current = pomodoroMinutes
            if (isShrunk) {
              setPendingModal(true)
            } else {
              setModalSelectedId(activeTodoId)
              setModalNewTitle('')
              setShowModal(true)
            }
          } else {
            // 休息結束，切回工作等待使用者按開始
            setPomodoroPhase('work')
            setIsLongBreak(false)
            return pomodoroMinutes * 60
          }
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [pomodoroRunning, pomodoroPhase, pomodoroMinutes, activeTodoId, isShrunk])

  // 自訂計時器
  useEffect(() => {
    if (!timerRunning) return
    const id = setInterval(() => {
      setTimerSeconds(prev => {
        if (prev <= 1) {
          setTimerRunning(false)
          playBeep()
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [timerRunning])

  const resetPomodoro = useCallback(() => {
    setPomodoroRunning(false)
    setPomodoroPhase('work')
    setPomodoroSeconds(pomodoroMinutes * 60)
    setCycleCount(0)
    setIsLongBreak(false)
  }, [pomodoroMinutes])

  const startBreakAfterWork = useCallback(() => {
    setCycleCount(prev => {
      const newCount = prev + 1
      if (newCount >= 4) {
        setIsLongBreak(true)
        setPomodoroPhase('break')
        setPomodoroSeconds(longBreakMinutes * 60)
        setPomodoroRunning(true)
        return 0
      } else {
        setIsLongBreak(false)
        setPomodoroPhase('break')
        setPomodoroSeconds(breakMinutes * 60)
        setPomodoroRunning(true)
        return newCount
      }
    })
  }, [breakMinutes, longBreakMinutes])

  const applyTimerInput = useCallback(() => {
    const total = (parseInt(timerInput.minutes) || 0) * 60 + (parseInt(timerInput.seconds) || 0)
    setTimerSeconds(total)
    setTimerRunning(false)
  }, [timerInput])

  const addTodo = async () => {
    const title = newTodoTitle.trim()
    if (!title) return
    const todo = await window.electronAPI!.todo.create(title)
    setTodos(prev => [...prev, todo])
    setNewTodoTitle('')
  }

  const handleToggleComplete = async (id: number) => {
    const updated = await window.electronAPI!.todo.toggleComplete(id)
    if (updated) setTodos(prev => prev.map(t => t.id === id ? updated : t))
  }

  const handleDelete = async (id: number) => {
    await window.electronAPI!.todo.delete(id)
    setTodos(prev => prev.filter(t => t.id !== id))
    if (activeTodoId === id) setActiveTodoId(null)
  }

  const handleModalConfirm = async () => {
    const mins = completedWorkMinutes.current
    if (modalNewTitle.trim()) {
      const todo = await window.electronAPI!.todo.create(modalNewTitle.trim())
      const updated = await window.electronAPI!.todo.addPomodoro(todo.id, mins)
      setTodos(prev => [...prev, updated ?? todo])
      setActiveTodoId(todo.id)
    } else if (modalSelectedId !== null) {
      const updated = await window.electronAPI!.todo.addPomodoro(modalSelectedId, mins)
      if (updated) setTodos(prev => prev.map(t => t.id === modalSelectedId ? updated : t))
    }
    setShowModal(false)
    startBreakAfterWork()
  }

  const inputClass = 'w-16 text-center rounded-lg px-2 py-1 bg-white dark:bg-gray-700 text-gray-800 dark:text-white border border-gray-200 dark:border-transparent'
  const btnSecondary = 'px-8 py-2 rounded-full font-semibold transition-colors bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 text-gray-700 dark:text-white cursor-pointer'

  const currentDisplay =
    mode === 'clock' ? currentTime
    : mode === 'pomodoro' ? formatTime(pomodoroSeconds)
    : formatTime(timerSeconds)
  const displayColor =
    mode === 'pomodoro'
      ? pomodoroPhase === 'break' ? 'text-green-500 dark:text-green-400' : 'text-red-500 dark:text-red-400'
      : mode === 'timer' ? 'text-blue-500 dark:text-blue-400' : ''

  return (
    <div className="min-h-screen bg-linear-to-br from-orange-50 to-red-50 dark:from-gray-900 dark:to-gray-800 text-gray-800 dark:text-white flex flex-col items-center relative overflow-hidden">
      {/* 拖曳區域 */}
      <div className="drag-region absolute top-0 left-0 right-0 h-8" />

      {/* 更新進度條 */}
      {updateStatus && (
        <div className="absolute top-8 left-0 right-0 z-50 px-3 py-1.5 bg-blue-600/90 text-white text-xs flex items-center gap-2">
          {updateStatus.type === 'available' && <span>發現新版本，正在下載...</span>}
          {updateStatus.type === 'progress' && (
            <>
              <span className="shrink-0">下載更新 {updateStatus.percent}%</span>
              <div className="flex-1 bg-white/30 rounded-full h-1.5">
                <div
                  className="bg-white rounded-full h-1.5 transition-all"
                  style={{ width: `${updateStatus.percent}%` }}
                />
              </div>
            </>
          )}
          {updateStatus.type === 'downloaded' && <span>更新已下載完成，重啟後套用</span>}
        </div>
      )}

      {/* 右上角按鈕群 */}
      <div className="no-drag absolute top-1 right-1 flex gap-0.5 z-10">
        <button
          onClick={async () => { const next = await window.electronAPI?.togglePin(); if (next !== undefined) setIsPinned(next) }}
          className={`w-4 h-4 rounded-full text-[9px] leading-none transition-colors flex items-center justify-center cursor-pointer ${isPinned ? 'bg-red-500 text-white' : 'bg-black/10 dark:bg-white/10 hover:bg-black/20 dark:hover:bg-white/20 text-gray-600 dark:text-gray-300'}`}
          title={isPinned ? '取消置頂' : '置頂'}
        >✦</button>
        <button
          onClick={async () => { const next = await window.electronAPI?.shrinkToggle(); if (next !== undefined) setIsShrunk(next) }}
          className={`w-4 h-4 rounded-full text-[9px] leading-none transition-colors flex items-center justify-center cursor-pointer ${isShrunk ? 'bg-blue-500 text-white' : 'bg-black/10 dark:bg-white/10 hover:bg-black/20 dark:hover:bg-white/20 text-gray-600 dark:text-gray-300'}`}
          title={isShrunk ? '還原' : '縮小'}
        >{isShrunk ? '▢' : '–'}</button>
        <button
          onClick={() => setIsDark(d => !d)}
          className="w-4 h-4 rounded-full text-[9px] leading-none bg-black/10 dark:bg-white/10 hover:bg-black/20 dark:hover:bg-white/20 transition-colors flex items-center justify-center text-gray-600 dark:text-gray-300 cursor-pointer"
        >{isDark ? '●' : '○'}</button>
      </div>

      {/* 縮小模式 */}
      {isShrunk && (
        <div className={`flex-1 flex items-center justify-center text-2xl font-mono tracking-widest ${displayColor}`}>
          {currentDisplay}
        </div>
      )}

      {/* 完整模式 */}
      {!isShrunk && (
        <div className="flex flex-col items-center w-full pt-10 pb-4 px-4 flex-1 min-h-0">
          {/* 模式切換 */}
          <div className="flex gap-2 mb-4">
            {(['clock', 'pomodoro', 'timer'] as Mode[]).map(m => (
              <button key={m} onClick={() => setMode(m)}
                className={`px-5 py-2 rounded-full text-sm font-medium transition-colors cursor-pointer ${mode === m ? 'bg-red-500 text-white' : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 shadow-sm'}`}>
                {m === 'clock' ? '時鐘' : m === 'pomodoro' ? '番茄鐘' : '計時器'}
              </button>
            ))}
          </div>

          {/* 時鐘模式 */}
          {mode === 'clock' && (
            <div className="flex-1 flex items-center justify-center text-7xl font-mono tracking-widest">{currentTime}</div>
          )}

          {/* 番茄鐘模式 */}
          {mode === 'pomodoro' && (
            <div className="flex flex-col items-center w-full flex-1 min-h-0 gap-2">

              {/* 時間設定列 */}
              <div className="flex items-center gap-2 text-md text-gray-500 dark:text-gray-400">
                <div className="flex items-center gap-1">
                  <span>工作</span>
                  <input type="number" min="1" max="90" value={pomodoroMinutes}
                    disabled={pomodoroRunning}
                    onChange={e => setPomodoroMinutes(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-12 text-center rounded px-1 py-0.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-transparent text-gray-800 dark:text-white disabled:opacity-50"
                  />
                  <span>分</span>
                </div>
                <span className="text-gray-300 dark:text-gray-600">|</span>
                <div className="flex items-center gap-1">
                  <span>短休</span>
                  <input type="number" min="1" max="30" value={breakMinutes}
                    disabled={pomodoroRunning}
                    onChange={e => setBreakMinutes(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-12 text-center rounded px-1 py-0.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-transparent text-gray-800 dark:text-white disabled:opacity-50"
                  />
                  <span>分</span>
                </div>
                <span className="text-gray-300 dark:text-gray-600">|</span>
                <div className="flex items-center gap-1">
                  <span>長休</span>
                  <input type="number" min="1" max="60" value={longBreakMinutes}
                    disabled={pomodoroRunning}
                    onChange={e => setLongBreakMinutes(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-12 text-center rounded px-1 py-0.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-transparent text-gray-800 dark:text-white disabled:opacity-50"
                  />
                  <span>分</span>
                </div>
              </div>

              {/* 循環進度 + 階段標籤 */}
              <div className="flex items-center gap-2">
                <div className="flex gap-1">
                  {[0, 1, 2, 3].map(i => (
                    <div key={i} className={`w-2 h-2 rounded-full transition-colors ${i < cycleCount ? 'bg-red-500' : 'bg-gray-300 dark:bg-gray-600'}`} />
                  ))}
                </div>
                <div className={`text-xs font-medium px-2 py-0.5 rounded-full ${pomodoroPhase === 'break' ? 'bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400' : 'bg-red-100 dark:bg-red-900/40 text-red-500 dark:text-red-400'}`}>
                  {pomodoroPhase === 'break' ? (isLongBreak ? '長休息' : '短休息') : '專注中'}
                </div>
              </div>

              {/* 計時器 */}
              <div className={`text-7xl font-mono tracking-widest ${displayColor}`}>
                {formatTime(pomodoroSeconds)}
              </div>

              {/* 目前任務 */}
              <div className="text-md text-gray-500 dark:text-gray-400 h-4 mb-3">
                {activeTodoId ? `目前任務：${todos.find(t => t.id === activeTodoId)?.title ?? ''}` : '未選擇任務'}
              </div>

              {/* 控制按鈕 */}
              <div className="flex gap-2">
                <button onClick={() => setPomodoroRunning(r => !r)} disabled={pomodoroSeconds === 0}
                  className={`px-8 py-2 disabled:opacity-40 text-white rounded-full font-semibold transition-colors cursor-pointer ${pomodoroPhase === 'break' ? 'bg-green-500 hover:bg-green-600' : 'bg-red-500 hover:bg-red-600'}`}>
                  {pomodoroRunning ? '暫停' : '開始'}
                </button>
                <button onClick={resetPomodoro} className={btnSecondary}>重置</button>
              </div>

              {/* 分隔線 */}
              <div className="w-full border-t border-gray-200 dark:border-gray-700" />

              {/* 待辦清單 */}
              <div className="w-full flex-1 min-h-0 flex flex-col gap-2 overflow-hidden">
                <div className="flex-1 overflow-y-auto flex flex-col gap-1 p-1">
                  {todos.length === 0 && (
                    <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-2">尚無待辦，新增一個吧</p>
                  )}
                  {todos.map(todo => (
                    <div key={todo.id} onClick={() => setActiveTodoId(todo.id === activeTodoId ? null : todo.id)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${todo.id === activeTodoId ? 'bg-red-100 dark:bg-red-900/40 ring-1 ring-red-400' : 'bg-white/60 dark:bg-gray-700/60 hover:bg-white dark:hover:bg-gray-700'}`}>
                      <button onClick={e => { e.stopPropagation(); handleToggleComplete(todo.id) }}
                        className={`w-4 h-4 rounded-full border-2 shrink-0 transition-colors cursor-pointer ${todo.completed ? 'bg-green-500 border-green-500' : 'border-gray-400 dark:border-gray-500'}`} />
                      <span className={`flex-1 text-sm truncate ${todo.completed ? 'line-through text-gray-400 dark:text-gray-500' : ''}`}>
                        {todo.title}
                      </span>
                      {todo.pomodoroCount > 0 && (
                        <span className="text-xs text-red-400 shrink-0">
                          🍅×{todo.pomodoroCount} ({formatMinutes(todo.totalMinutes)})
                        </span>
                      )}
                      <button onClick={e => { e.stopPropagation(); handleDelete(todo.id) }}
                        className="text-gray-300 dark:text-gray-600 hover:text-red-400 dark:hover:text-red-400 shrink-0 transition-colors p-0.5">
                        <TrashIcon />
                      </button>
                    </div>
                  ))}
                </div>

                {/* 新增輸入 */}
                <div className="flex gap-2 px-1 my-1">
                  <input type="text" placeholder="新增待辦項目..." value={newTodoTitle}
                    onChange={e => setNewTodoTitle(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addTodo()}
                    className="flex-1 text-sm px-3 py-2 rounded-lg bg-white dark:bg-gray-700 border border-gray-200 dark:border-transparent text-gray-800 dark:text-white placeholder-gray-400 outline-none focus:ring-1 focus:ring-red-400" />
                  <button onClick={addTodo}
                    className="px-3 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm transition-colors cursor-pointer">+</button>
                </div>
              </div>
            </div>
          )}

          {/* 自訂計時器模式 */}
          {mode === 'timer' && (
            <div className="flex-1 flex flex-col items-center justify-center gap-6">
              <div className="text-8xl font-mono tracking-widest text-blue-500 dark:text-blue-400">
                {formatTime(timerSeconds)}
              </div>
              {timerSeconds === 0 && (
                <p className="text-blue-500 dark:text-blue-400 font-medium animate-pulse">計時結束！</p>
              )}
              <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                <input type="number" min="0" value={timerInput.minutes}
                  onChange={e => setTimerInput(t => ({ ...t, minutes: e.target.value }))}
                  className={inputClass} />
                <span>分</span>
                <input type="number" min="0" max="59" value={timerInput.seconds}
                  onChange={e => setTimerInput(t => ({ ...t, seconds: e.target.value }))}
                  className={inputClass} />
                <span>秒</span>
                <button onClick={applyTimerInput}
                  className="px-4 py-1 rounded-lg transition-colors bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 text-gray-700 dark:text-white">
                  設定
                </button>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setTimerRunning(r => !r)} disabled={timerSeconds === 0}
                  className="px-8 py-3 bg-blue-500 hover:bg-blue-600 disabled:opacity-40 text-white rounded-full font-semibold transition-colors">
                  {timerRunning ? '暫停' : '開始'}
                </button>
                <button onClick={() => { setTimerRunning(false); applyTimerInput() }} className={btnSecondary}>
                  重置
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 番茄鐘完成 Modal */}
      {showModal && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-20 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 w-full max-w-sm shadow-xl flex flex-col gap-4">
            <h2 className="text-lg font-semibold text-center">🍅 番茄鐘完成！</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
              要將這 {completedWorkMinutes.current} 分鐘歸屬到哪個任務？
            </p>

            {todos.filter(t => !t.completed).length > 0 && (
              <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
                {todos.filter(t => !t.completed).map(todo => (
                  <button key={todo.id}
                    onClick={() => { setModalSelectedId(todo.id); setModalNewTitle('') }}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-left transition-colors ${modalSelectedId === todo.id ? 'bg-red-100 dark:bg-red-900/40 ring-1 ring-red-400' : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600'}`}>
                    <span className="flex-1 truncate">{todo.title}</span>
                    {todo.pomodoroCount > 0 && (
                      <span className="text-red-400 text-xs shrink-0">
                        🍅×{todo.pomodoroCount} ({formatMinutes(todo.totalMinutes)})
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}

            <div className="flex flex-col gap-1">
              <span className="text-xs text-gray-400 dark:text-gray-500">或新增任務</span>
              <input type="text" placeholder="輸入新任務名稱..." value={modalNewTitle}
                onChange={e => { setModalNewTitle(e.target.value); setModalSelectedId(null) }}
                className="text-sm px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-white placeholder-gray-400 outline-none focus:ring-1 focus:ring-red-400" />
            </div>

            <div className="flex gap-2">
              <button onClick={() => { setShowModal(false); startBreakAfterWork() }}
                className="flex-1 py-2 rounded-lg text-sm bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors">
                略過
              </button>
              <button onClick={handleModalConfirm}
                disabled={modalSelectedId === null && !modalNewTitle.trim()}
                className="flex-1 py-2 rounded-lg text-sm bg-red-500 hover:bg-red-600 disabled:opacity-40 text-white font-semibold transition-colors">
                確認
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
