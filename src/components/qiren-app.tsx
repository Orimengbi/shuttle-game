"use client"

import { useEffect, useMemo, useState } from "react"
import { Check, ChevronDown, ChevronUp, Copy } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  advice,
  buildSchedule,
  estimateMinutes,
  formatDuration,
  gamesPerPlayer,
  roundCount,
  type Courts,
  type Fairness,
  type FormatId,
  type Points,
} from "@/lib/schedule"
import {
  clearSession,
  loadSession,
  rankOf,
  saveSession,
  scheduleText,
  standings,
  type MatchState,
  type Phase,
} from "@/lib/session"

const DEFAULT_NAMES = ["1号", "2号", "3号", "4号", "5号", "6号", "7号"]

type Tab = "now" | "schedule" | "board"

function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <path
        d="M32 4c7.5 9 11 17 11 27.5a11 11 0 0 1-22 0C21 21 24.5 13 32 4z"
        fill="#ffe14a"
        stroke="#f7ffe9"
        strokeWidth="2.4"
      />
      <path d="M24 28h16M22.5 34h19M25.5 40h13" stroke="#10240f" strokeWidth="1.6" />
      <path d="M32 46.5v12" stroke="#f7ffe9" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  )
}

function Choice<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: { value: T; title: string; detail: string }[]
  onChange: (value: T) => void
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium">{label}</legend>
      <div className={`grid gap-2 ${options.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
        {options.map((option) => {
          const selected = option.value === value
          return (
            <button
              key={String(option.value)}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(option.value)}
              className={`rounded-xl border px-2 py-2.5 text-left transition-colors ${
                selected
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card hover:bg-secondary"
              }`}
            >
              <span className="block text-sm font-medium">{option.title}</span>
              <span className={`mt-0.5 block text-xs ${selected ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                {option.detail}
              </span>
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}

function streakLabel(value: number, unit: string, none: string) {
  return value <= 1 ? none : `${value} ${unit}`
}

export function QirenApp() {
  const [ready, setReady] = useState(false)
  const [phase, setPhase] = useState<Phase>("setup")
  const [players, setPlayers] = useState(DEFAULT_NAMES)
  const [format, setFormat] = useState<FormatId>("half")
  const [courts, setCourts] = useState<Courts>(1)
  const [points, setPoints] = useState<Points>(11)
  const [byStrength, setByStrength] = useState(true)
  const [middleRest, setMiddleRest] = useState<number | null>(null)
  const [matches, setMatches] = useState<MatchState[]>([])
  const [fairness, setFairness] = useState<Fairness | null>(null)
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)
  const [tab, setTab] = useState<Tab>("now")
  const [focusRound, setFocusRound] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const [editIndex, setEditIndex] = useState<number | null>(null)
  const [draftA, setDraftA] = useState(0)
  const [draftB, setDraftB] = useState(0)

  useEffect(() => {
    const saved = loadSession()
    if (saved) {
      setPlayers(saved.players)
      setFormat(saved.format)
      setCourts(saved.courts)
      setPoints(saved.points)
      setByStrength(saved.byStrength)
      setMiddleRest(saved.middleRest)
      setMatches(saved.matches)
      setFairness(saved.fairness)
      setPhase(saved.phase)
    }
    setReady(true)
  }, [])

  useEffect(() => {
    if (!ready || phase === "setup" || !fairness) return
    saveSession({
      players,
      format,
      courts,
      points,
      byStrength,
      middleRest,
      matches,
      phase,
      fairness,
    })
  }, [ready, phase, players, format, courts, points, byStrength, middleRest, matches, fairness])

  const tip = useMemo(
    () => advice(format, courts, points, roundCount(format, courts)),
    [format, courts, points]
  )
  const rows = useMemo(() => standings(matches), [matches])
  const playedCount = matches.filter((match) => match.done).length
  const finished = matches.length > 0 && playedCount === matches.length
  const firstOpen = matches.find((match) => !match.done)?.round
  const showing = focusRound ?? firstOpen ?? 0
  const roundItems = matches
    .map((match, index) => ({ match, index }))
    .filter((item) => item.match.round === showing)
  const restingNow = [0, 1, 2, 3, 4, 5, 6].filter(
    (player) => !roundItems.some((item) => item.match.a === player || item.match.b === player)
  )

  function updateName(index: number, value: string) {
    setPlayers((current) => current.map((name, i) => (i === index ? value : name)))
  }

  function movePlayer(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= players.length) return
    setPlayers((current) => {
      const next = current.slice()
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
    setMiddleRest((current) => {
      if (current === index) return target
      if (current === target) return index
      return current
    })
  }

  function generate() {
    const cleaned = players.map((name) => name.trim())
    if (cleaned.some((name) => name.length === 0)) {
      setError("七个名字都要填。")
      return
    }
    if (new Set(cleaned).size !== cleaned.length) {
      setError("名字有重复，场边会对不上。")
      return
    }
    setError("")
    setPlayers(cleaned)
    setPending(true)
    window.setTimeout(() => {
      const schedule = buildSchedule(format, courts, courts === 3 ? middleRest : null)
      setMatches(
        schedule.matches.map((match) => ({
          ...match,
          scoreA: 0,
          scoreB: 0,
          done: false,
        }))
      )
      setFairness(schedule.fairness)
      setFocusRound(null)
      setTab("now")
      setPhase("review")
      setPending(false)
    }, 20)
  }

  function bump(index: number, side: "scoreA" | "scoreB", delta: number) {
    setMatches((current) =>
      current.map((match, i) => {
        if (i !== index || match.done) return match
        return { ...match, [side]: Math.max(0, Math.min(99, match[side] + delta)) }
      })
    )
  }

  function finishMatch(index: number) {
    const round = matches[index]?.round
    setMatches((current) => current.map((match, i) => (i === index ? { ...match, done: true } : match)))
    const stillOpen = matches.some((match, i) => i !== index && match.round === round && !match.done)
    if (!stillOpen) setFocusRound(round)
  }

  async function copySchedule() {
    const text = scheduleText({ players, format, courts, points, matches })
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setError("没复制成功，可以在赛程页手动记下。")
    }
  }

  function openEdit(index: number) {
    const match = matches[index]
    setDraftA(match.scoreA)
    setDraftB(match.scoreB)
    setEditIndex(index)
  }

  function saveEdit(reopen: boolean) {
    if (editIndex === null) return
    if (!reopen && draftA === draftB) return
    setMatches((current) =>
      current.map((match, index) =>
        index === editIndex
          ? { ...match, scoreA: draftA, scoreB: draftB, done: reopen ? false : true }
          : match
      )
    )
    setEditIndex(null)
  }

  function resetAll() {
    clearSession()
    setMatches([])
    setFairness(null)
    setPhase("setup")
    setTab("now")
    setFocusRound(null)
    setResetOpen(false)
    setError("")
  }

  if (!ready) {
    return <main className="min-h-screen" />
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-4 py-5 sm:px-6 sm:py-8">
      <header className="banner relative mb-5 overflow-hidden rounded-3xl">
        <div className="court-grid pointer-events-none absolute inset-0 opacity-70" />
        <div className="relative flex items-center gap-3 px-5 py-4 sm:px-6">
          <Mark className="size-12 shrink-0" />
          <div>
            <p className="text-xs font-bold tracking-[0.22em] text-[#ffe14a]">羽毛球单打</p>
            <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">七人转</h1>
          </div>
        </div>
      </header>

      {phase === "setup" ? (
        <Setup
          players={players}
          format={format}
          courts={courts}
          points={points}
          byStrength={byStrength}
          middleRest={middleRest}
          error={error}
          pending={pending}
          tip={tip}
          onName={updateName}
          onMove={movePlayer}
          onFormat={setFormat}
          onCourts={(value) => setCourts(value)}
          onPoints={setPoints}
          onStrength={setByStrength}
          onMiddle={setMiddleRest}
          onSubmit={generate}
        />
      ) : null}

      {phase === "review" && fairness ? (
        <Review
          players={players}
          format={format}
          courts={courts}
          points={points}
          matches={matches}
          fairness={fairness}
          byStrength={byStrength}
          copied={copied}
          onBack={() => setPhase("setup")}
          onStart={() => {
            setTab("now")
            setFocusRound(null)
            setPhase("play")
          }}
          onCopy={() => void copySchedule()}
        />
      ) : null}

      {phase === "play" && fairness ? (
        <Live
          players={players}
          format={format}
          courts={courts}
          points={points}
          matches={matches}
          rows={rows}
          tab={tab}
          showing={showing}
          roundItems={roundItems}
          restingNow={restingNow}
          playedCount={playedCount}
          finished={finished}
          focusRound={focusRound}
          copied={copied}
          onTab={setTab}
          onBump={bump}
          onFinish={finishMatch}
          onNext={() => setFocusRound(null)}
          onEdit={openEdit}
          onCopy={() => void copySchedule()}
          onReset={() => setResetOpen(true)}
          onBoard={() => {
            setFocusRound(null)
            setTab("now")
          }}
        />
      ) : null}

      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>清掉这场记分？</DialogTitle>
            <DialogDescription>赛程和比分会从这台手机上删掉，名字还留着。</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setResetOpen(false)}>
              留下
            </Button>
            <Button type="button" variant="destructive" onClick={resetAll}>
              清空重排
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editIndex !== null} onOpenChange={(open) => !open && setEditIndex(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>改这一场的比分</DialogTitle>
            <DialogDescription>
              {editIndex !== null
                ? `${players[matches[editIndex].a]} 对 ${players[matches[editIndex].b]}`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <Label className="flex-col items-stretch gap-2">
              {editIndex !== null ? players[matches[editIndex].a] : ""}
              <Input
                inputMode="numeric"
                className="h-11 text-base"
                value={draftA}
                onChange={(event) => setDraftA(clampScore(event.target.value))}
              />
            </Label>
            <Label className="flex-col items-stretch gap-2">
              {editIndex !== null ? players[matches[editIndex].b] : ""}
              <Input
                inputMode="numeric"
                className="h-11 text-base"
                value={draftB}
                onChange={(event) => setDraftB(clampScore(event.target.value))}
              />
            </Label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => saveEdit(true)}>
              改回未结束
            </Button>
            <Button type="button" onClick={() => saveEdit(false)} disabled={draftA === draftB}>
              保存比分
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  )
}

function clampScore(value: string) {
  const parsed = Number.parseInt(value, 10)
  if (Number.isNaN(parsed)) return 0
  return Math.max(0, Math.min(99, parsed))
}

function Setup({
  players,
  format,
  courts,
  points,
  byStrength,
  middleRest,
  error,
  pending,
  tip,
  onName,
  onMove,
  onFormat,
  onCourts,
  onPoints,
  onStrength,
  onMiddle,
  onSubmit,
}: {
  players: string[]
  format: FormatId
  courts: Courts
  points: Points
  byStrength: boolean
  middleRest: number | null
  error: string
  pending: boolean
  tip: { tone: "good" | "ok" | "warn"; title: string; body: string }
  onName: (index: number, value: string) => void
  onMove: (index: number, direction: -1 | 1) => void
  onFormat: (value: FormatId) => void
  onCourts: (value: Courts) => void
  onPoints: (value: Points) => void
  onStrength: (value: boolean) => void
  onMiddle: (value: number | null) => void
  onSubmit: () => void
}) {
  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <form
        className="rounded-3xl border border-border bg-card p-4 sm:p-6"
        onSubmit={(event) => {
          event.preventDefault()
          onSubmit()
        }}
      >
        <h2 className="text-xl font-bold">先对齐场次，再匀开休息</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          7 是奇数，每人 3 场对不齐：7×3 不能被 2 整除，总会有人多打或少打。公平的只有每人 4 场或每人 6 场。
        </p>

        <div className="mt-5 space-y-2">
          <div className="flex items-center justify-between">
            <Label>上场的 7 个人</Label>
            <button
              type="button"
              className="text-sm font-medium text-primary"
              onClick={() => onStrength(!byStrength)}
              aria-pressed={byStrength}
            >
              {byStrength ? "已按水平排序" : "不按水平"}
            </button>
          </div>
          <p className="text-xs leading-5 text-muted-foreground">
            {byStrength
              ? "从上到下由强到弱。半循环会让每人避开水平差最多的两位。"
              : "全循环谁都会碰上。半循环少打的两位，由这个顺序决定。"}
          </p>
          <ul className="space-y-2">
            {players.map((name, index) => (
              <li key={index} className="flex items-center gap-2">
                <span className="w-8 shrink-0 text-center text-sm font-medium tabular-nums">{index + 1}</span>
                <Input
                  aria-label={`第 ${index + 1} 位`}
                  value={name}
                  onChange={(event) => onName(index, event.target.value)}
                  className="h-11 bg-white text-base"
                  maxLength={12}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-11"
                  aria-label="上移"
                  disabled={index === 0}
                  onClick={() => onMove(index, -1)}
                >
                  <ChevronUp />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-11"
                  aria-label="下移"
                  disabled={index === players.length - 1}
                  onClick={() => onMove(index, 1)}
                >
                  <ChevronDown />
                </Button>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-5 space-y-4">
          <Choice
            label="赛制"
            value={format}
            onChange={onFormat}
            options={[
              { value: "half", title: "半循环", detail: "每人 4 场 · 14 场" },
              { value: "full", title: "全循环", detail: "每人 6 场 · 21 场" },
            ]}
          />
          <Choice
            label="几片场地"
            value={courts}
            onChange={onCourts}
            options={[
              { value: 1 as Courts, title: "1 片", detail: "5 人在等" },
              { value: 2 as Courts, title: "2 片", detail: "节奏最匀" },
              { value: 3 as Courts, title: "3 片", detail: "最快" },
            ]}
          />
          <Choice
            label="每局打到几分"
            value={points}
            onChange={onPoints}
            options={[
              { value: 11 as Points, title: "11 分", detail: "约 10 分钟" },
              { value: 15 as Points, title: "15 分", detail: "约 15 分钟" },
              { value: 21 as Points, title: "21 分", detail: "约 22 分钟" },
            ]}
          />
        </div>

        {courts === 3 ? (
          <div className="mt-4">
            <Label htmlFor="middle-rest">谁在中间轮空</Label>
            <p className="mt-1 mb-2 text-xs leading-5 text-muted-foreground">
              3 片场每人只歇一轮。不指定的话，排在第 4 位的人歇在最中间，第 1 位和第 7 位会连打最久。
            </p>
            <select
              id="middle-rest"
              className="h-11 w-full rounded-lg border border-input bg-white px-3 text-base"
              value={middleRest ?? ""}
              onChange={(event) => onMiddle(event.target.value === "" ? null : Number(event.target.value))}
            >
              <option value="">不特别安排</option>
              {players.map((name, index) => (
                <option key={index} value={index}>
                  {name || `${index + 1}号`}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {error ? (
          <p className="mt-4 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        <Button type="submit" className="mt-5 h-12 w-full text-base" disabled={pending}>
          {pending ? "正在编排…" : "排好赛程"}
        </Button>
        <p className="mt-3 text-center text-xs text-muted-foreground">
          {formatDuration(estimateMinutes(roundCount(format, courts), points))}
          ，每人 {gamesPerPlayer(format)} 场
        </p>
      </form>

      <aside className="space-y-4">
        <AdviceCard tip={tip} />
        <section className="rounded-3xl border border-border bg-card p-5">
          <h2 className="font-bold">场地怎么选</h2>
          <dl className="mt-3 space-y-3 text-sm leading-6">
            <div>
              <dt className="font-medium">3 片场</dt>
              <dd className="text-muted-foreground">
                全循环 7 轮，每轮 3 场同时打，1 人轮空。最快，但几乎连轴转。体力一般就打 11 分或 15 分。
              </dd>
            </div>
            <div>
              <dt className="font-medium">2 片场</dt>
              <dd className="text-muted-foreground">
                最推荐。每轮 4 人打、3 人歇，最多连打 2 轮，也最多连歇 2 轮。
              </dd>
            </div>
            <div>
              <dt className="font-medium">只有 1 片场</dt>
              <dd className="text-muted-foreground">
                每次 5 个人在等。赛程把同一个人隔开，不连打，中间歇 2 到 3 场。一个晚上用半循环、11 分。
              </dd>
            </div>
          </dl>
        </section>
      </aside>
    </div>
  )
}

function AdviceCard({ tip }: { tip: { tone: "good" | "ok" | "warn"; title: string; body: string } }) {
  const tone =
    tip.tone === "good"
      ? "border-primary/30 bg-[#edf8df]"
      : tip.tone === "warn"
        ? "border-[#e2c27a] bg-[#fff6dc]"
        : "border-border bg-card"
  return (
    <section className={`rounded-3xl border p-5 ${tone}`}>
      <h2 className="font-bold">{tip.title}</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{tip.body}</p>
    </section>
  )
}

function Review({
  players,
  format,
  courts,
  points,
  matches,
  fairness,
  byStrength,
  copied,
  onBack,
  onStart,
  onCopy,
}: {
  players: string[]
  format: FormatId
  courts: Courts
  points: Points
  matches: MatchState[]
  fairness: Fairness
  byStrength: boolean
  copied: boolean
  onBack: () => void
  onStart: () => void
  onCopy: () => void
}) {
  const unit = courts === 1 ? "场" : "轮"
  const tip = advice(format, courts, points, fairness.rounds)
  const roundIds = [...new Set(matches.map((match) => match.round))]
  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section className="order-2 rounded-3xl border border-border bg-card p-4 sm:p-6 lg:order-1">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">赛程已经匀开</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {format === "full" ? "全循环，谁跟谁都打一次。" : "半循环，每人少打两位。"}
              {format === "half" && byStrength ? " 少打的是水平差最多的两位。" : ""}
            </p>
          </div>
          <Button type="button" variant="outline" className="h-10" onClick={onCopy}>
            {copied ? <Check /> : <Copy />}
            {copied ? "已复制" : "复制到微信"}
          </Button>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="每人" value={`${gamesPerPlayer(format)} 场`} />
          <Stat label="总场次" value={`${fairness.totalMatches} 场`} />
          <Stat label="最长连打" value={streakLabel(fairness.worstPlayStreak, unit, "不连打")} />
          <Stat label="最长连休" value={`${fairness.worstRestStreak} ${unit}`} />
        </div>
        <ul className="mt-4 divide-y divide-border rounded-2xl border border-border">
          {players.map((name, index) => (
            <li key={index} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm">
              <span className="font-medium">{name}</span>
              <span className="text-muted-foreground">
                连打 {streakLabel(fairness.maxPlayStreak[index], unit, "无")}
                <span className="px-1.5">·</span>
                连休 {fairness.maxRestStreak[index]} {unit}
                {fairness.skipped[index].length > 0
                  ? ` · 不打 ${fairness.skipped[index].map((player) => players[player]).join("、")}`
                  : ""}
              </span>
            </li>
          ))}
        </ul>
        <ol className="mt-4 space-y-3">
          {roundIds.map((round) => {
            const group = matches.filter((match) => match.round === round)
            const playing = new Set(group.flatMap((match) => [match.a, match.b]))
            const resting = players.filter((_, index) => !playing.has(index))
            return (
              <li key={round} className="rounded-2xl bg-secondary/70 px-3 py-3">
                <p className="text-sm font-medium">{courts === 1 ? `第 ${round + 1} 场` : `第 ${round + 1} 轮`}</p>
                <ul className="mt-1 space-y-1 text-sm">
                  {group.map((match) => (
                    <li key={`${match.a}-${match.b}`}>
                      {courts > 1 ? <span className="text-muted-foreground">场地 {match.court + 1} · </span> : null}
                      {players[match.a]} <span className="text-muted-foreground">对</span> {players[match.b]}
                    </li>
                  ))}
                </ul>
                {resting.length > 0 ? (
                  <p className="mt-1 text-xs text-muted-foreground">休息 {resting.join("、")}</p>
                ) : null}
              </li>
            )
          })}
        </ol>
      </section>
      <aside className="order-1 space-y-4 lg:sticky lg:top-4 lg:order-2">
        <AdviceCard tip={tip} />
        <div className="grid gap-2">
          <Button type="button" className="h-12 text-base" onClick={onStart}>
            开始记分
          </Button>
          <Button type="button" variant="outline" className="h-11" onClick={onBack}>
            返回改名字
          </Button>
        </div>
      </aside>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-secondary px-3 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-bold tabular-nums">{value}</p>
    </div>
  )
}

function Live({
  players,
  format,
  courts,
  points,
  matches,
  rows,
  tab,
  showing,
  roundItems,
  restingNow,
  playedCount,
  finished,
  focusRound,
  copied,
  onTab,
  onBump,
  onFinish,
  onNext,
  onEdit,
  onCopy,
  onReset,
  onBoard,
}: {
  players: string[]
  format: FormatId
  courts: Courts
  points: Points
  matches: MatchState[]
  rows: ReturnType<typeof standings>
  tab: Tab
  showing: number
  roundItems: { match: MatchState; index: number }[]
  restingNow: number[]
  playedCount: number
  finished: boolean
  focusRound: number | null
  copied: boolean
  onTab: (tab: Tab) => void
  onBump: (index: number, side: "scoreA" | "scoreB", delta: number) => void
  onFinish: (index: number) => void
  onNext: () => void
  onEdit: (index: number) => void
  onCopy: () => void
  onReset: () => void
  onBoard: () => void
}) {
  const roundDone = roundItems.length > 0 && roundItems.every((item) => item.match.done)
  const hasNext = matches.some((match) => !match.done)
  const unit = courts === 1 ? "场" : "轮"
  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            {format === "full" ? "全循环" : "半循环"} · {courts} 片场 · {points} 分 · 已赛 {playedCount}/
            {matches.length}
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="h-9" onClick={onCopy}>
              {copied ? <Check /> : <Copy />}
              {copied ? "已复制" : "复制"}
            </Button>
            <Button type="button" variant="ghost" className="h-9" onClick={onReset}>
              重排
            </Button>
          </div>
        </div>
        <div className="mb-4 grid grid-cols-3 gap-2 lg:hidden">
          {(
            [
              ["now", "本场"],
              ["schedule", "赛程"],
              ["board", "积分"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={tab === id}
              onClick={() => onTab(id)}
              className={`h-11 rounded-xl text-sm font-medium ${
                tab === id ? "bg-primary text-primary-foreground" : "bg-card border border-border"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="mb-4 hidden gap-2 lg:grid lg:grid-cols-2">
          {(
            [
              ["now", "本场"],
              ["schedule", "全部赛程"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={tab === id || (id === "now" && tab === "board")}
              onClick={() => onTab(id)}
              className={`h-11 rounded-xl text-sm font-medium ${
                (id === "now" ? tab !== "schedule" : tab === "schedule")
                  ? "bg-primary text-primary-foreground"
                  : "bg-card border border-border"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "now" ? (
          <div className="space-y-3">
            <div className="flex items-end justify-between">
              <h2 className="text-xl font-bold">
                {finished && focusRound === null
                  ? "全部打完"
                  : courts === 1
                    ? `第 ${showing + 1} 场`
                    : `第 ${showing + 1} 轮`}
              </h2>
              <p className="text-sm text-muted-foreground">
                共 {courts === 1 ? matches.length : new Set(matches.map((match) => match.round)).size} {unit}
              </p>
            </div>
            {finished && focusRound === null ? (
              <div className="rounded-3xl border border-border bg-card p-4">
                <Board players={players} rows={rows} highlight />
              </div>
            ) : (
              <>
                {roundItems.map(({ match, index }) => (
                  <ScoreCard
                    key={`${match.round}-${match.court}`}
                    match={match}
                    players={players}
                    points={points}
                    showCourt={courts > 1}
                    onBump={(side, delta) => onBump(index, side, delta)}
                    onFinish={() => onFinish(index)}
                    onEdit={() => onEdit(index)}
                  />
                ))}
                {restingNow.length > 0 ? (
                  <p className="rounded-2xl bg-secondary px-3 py-2 text-sm text-muted-foreground">
                    这{unit}休息：{restingNow.map((player) => players[player]).join("、")}
                  </p>
                ) : null}
                {roundDone && hasNext ? (
                  <Button type="button" className="h-12 w-full text-base" onClick={onNext}>
                    {courts === 1 ? "下一场" : "下一轮"}
                  </Button>
                ) : null}
                {roundDone && !hasNext ? (
                  <Button type="button" className="h-12 w-full text-base" onClick={onBoard}>
                    看最终排名
                  </Button>
                ) : null}
              </>
            )}
          </div>
        ) : null}

        {tab === "board" ? (
          <div className="rounded-3xl border border-border bg-card p-4">
            <Board players={players} rows={rows} highlight />
          </div>
        ) : null}

        {tab === "schedule" ? (
          <ol className="space-y-2">
            {matches.map((match, index) => (
              <li
                key={`${match.round}-${match.court}-${match.a}`}
                className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card px-3 py-3"
              >
                <div>
                  <p className="text-xs text-muted-foreground">
                    {courts === 1 ? `第 ${match.round + 1} 场` : `第 ${match.round + 1} 轮 · 场地 ${match.court + 1}`}
                  </p>
                  <p className="font-medium">
                    {players[match.a]} <span className="text-muted-foreground">对</span> {players[match.b]}
                  </p>
                </div>
                {match.done ? (
                  <button type="button" className="text-right" onClick={() => onEdit(index)}>
                    <span className="block font-bold tabular-nums">
                      {match.scoreA}:{match.scoreB}
                    </span>
                    <span className="text-xs text-primary">改分</span>
                  </button>
                ) : (
                  <span className="text-sm text-muted-foreground">{match.round === showing ? "进行中" : "未打"}</span>
                )}
              </li>
            ))}
          </ol>
        ) : null}
      </section>
      <aside className="hidden lg:block lg:sticky lg:top-4">
        <div className="rounded-3xl border border-border bg-card p-4">
          <h2 className="mb-3 font-bold">积分</h2>
          <Board players={players} rows={rows} />
        </div>
      </aside>
    </div>
  )
}

function ScoreCard({
  match,
  players,
  points,
  showCourt,
  onBump,
  onFinish,
  onEdit,
}: {
  match: MatchState
  players: string[]
  points: Points
  showCourt: boolean
  onBump: (side: "scoreA" | "scoreB", delta: number) => void
  onFinish: () => void
  onEdit: () => void
}) {
  const leader = match.scoreA === match.scoreB ? null : match.scoreA > match.scoreB ? "a" : "b"
  const reached = Math.max(match.scoreA, match.scoreB) >= points && leader !== null
  return (
    <article className="rounded-3xl border border-border bg-card p-4">
      {showCourt ? <p className="mb-2 text-xs text-muted-foreground">场地 {match.court + 1}</p> : null}
      <div className="grid grid-cols-2 gap-3">
        <Side
          name={players[match.a]}
          score={match.scoreA}
          ahead={leader === "a"}
          done={match.done}
          disabled={match.done}
          onMinus={() => onBump("scoreA", -1)}
          onPlus={() => onBump("scoreA", 1)}
        />
        <Side
          name={players[match.b]}
          score={match.scoreB}
          ahead={leader === "b"}
          done={match.done}
          disabled={match.done}
          onMinus={() => onBump("scoreB", -1)}
          onPlus={() => onBump("scoreB", 1)}
        />
      </div>
      {match.done ? (
        <Button type="button" variant="outline" className="mt-3 h-11 w-full" onClick={onEdit}>
          改分
        </Button>
      ) : (
        <>
          <Button type="button" className="mt-3 h-12 w-full text-base" disabled={!reached} onClick={onFinish}>
            {reached ? "结束本场" : `先到 ${points} 分，且不能平局`}
          </Button>
          {!reached && leader !== null ? (
            <button type="button" className="mt-2 w-full text-sm text-muted-foreground underline" onClick={onFinish}>
              没打满，按现在的比分结束
            </button>
          ) : null}
        </>
      )}
    </article>
  )
}

function Side({
  name,
  score,
  ahead,
  done,
  disabled,
  onMinus,
  onPlus,
}: {
  name: string
  score: number
  ahead: boolean
  done: boolean
  disabled: boolean
  onMinus: () => void
  onPlus: () => void
}) {
  return (
    <div className={`rounded-2xl px-2 py-3 text-center ${ahead ? "bg-accent" : "bg-secondary"}`}>
      <p className="truncate text-sm font-medium">
        {name}
        {done && ahead ? " · 胜" : ""}
      </p>
      <p className="my-1 text-5xl font-bold tabular-nums">{score}</p>
      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="outline"
          className="h-12 bg-white text-lg"
          aria-label={`${name} 减一分`}
          disabled={disabled || score === 0}
          onClick={onMinus}
        >
          −
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-12 bg-white text-lg"
          aria-label={`${name} 加一分`}
          disabled={disabled}
          onClick={onPlus}
        >
          +
        </Button>
      </div>
    </div>
  )
}

function Board({
  players,
  rows,
  highlight = false,
}: {
  players: string[]
  rows: ReturnType<typeof standings>
  highlight?: boolean
}) {
  return (
    <div>
      {highlight ? <p className="mb-3 text-sm text-muted-foreground">按胜场、净胜分、相互胜负排序。</p> : null}
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-muted-foreground">
            <th className="pb-2 font-medium">名次</th>
            <th className="pb-2 font-medium">选手</th>
            <th className="pb-2 text-right font-medium">胜负</th>
            <th className="pb-2 text-right font-medium">净胜</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.player} className="border-t border-border">
              <td className="py-2.5 tabular-nums">{rankOf(rows, index)}</td>
              <td className="py-2.5 font-medium">{players[row.player]}</td>
              <td className="py-2.5 text-right tabular-nums">
                {row.wins}胜{row.losses}负
              </td>
              <td className="py-2.5 text-right tabular-nums">
                {row.diff > 0 ? "+" : ""}
                {row.diff}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
