"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Check, Copy } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DOUBLES,
  DOUBLES_MATCHES,
  MIXED_A,
  MIXED_B,
  MIXED_MATCHES,
  POINTS,
  SINGLES,
  SINGLES_MATCHES,
  emptyScore,
  groupDone,
  groupMatches,
  knockout,
  rankPlayers,
  scheduleText,
  slotName,
  standings,
  type EventId,
  type RosterMatch,
  type Score,
} from "@/lib/yuesai"

const STORAGE_KEY = "yuesai-scores-v1"

const TABS: { id: EventId; label: string }[] = [
  { id: "ms", label: "男单" },
  { id: "md", label: "男双" },
  { id: "xd", label: "混双" },
]

function loadScores(): Record<string, Score> {
  if (typeof window === "undefined") return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== "object") return {}
    return parsed as Record<string, Score>
  } catch {
    return {}
  }
}

export function YuesaiApp() {
  const [ready, setReady] = useState(false)
  const [event, setEvent] = useState<EventId>("ms")
  const [scores, setScores] = useState<Record<string, Score>>({})
  const [copied, setCopied] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)

  useEffect(() => {
    setScores(loadScores())
    setReady(true)
  }, [])

  useEffect(() => {
    if (!ready) return
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(scores))
  }, [ready, scores])

  function read(id: string, a: number, b: number): Score {
    const saved = scores[id]
    if (!saved || saved.a !== a || saved.b !== b) return emptyScore(a, b)
    return saved
  }

  function write(id: string, next: Score) {
    setScores((current) => ({ ...current, [id]: next }))
  }

  function bump(id: string, base: Score, side: "scoreA" | "scoreB", delta: number) {
    if (base.done) return
    write(id, { ...base, [side]: Math.max(0, Math.min(99, base[side] + delta)) })
  }

  function finish(id: string, base: Score) {
    write(id, { ...base, done: true })
  }

  function reopen(id: string, base: Score) {
    write(id, { ...base, done: false })
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(scheduleText(scores))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }

  if (!ready) return <main className="min-h-screen" />

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-4 py-5 sm:px-6 sm:py-8">
      <header className="relative mb-4 overflow-hidden rounded-3xl border border-border bg-card">
        <div className="court-grid absolute inset-0 opacity-70" />
        <div className="relative px-4 py-4 sm:px-6">
          <p className="text-xs font-medium tracking-widest text-muted-foreground">1号场男单 · 2号场男双 · 3、4号场混双</p>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">南方月赛赛程</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            男单、男双全循环。混双分 A、B 两组，各组循环后前二出线：A1 对 B2，B1 对 A2，负方三四名，胜方决赛。胜场相同先看相互胜负，胜负套圈看总净胜分。
          </p>
        </div>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            aria-pressed={event === tab.id}
            onClick={() => setEvent(tab.id)}
            className={`h-11 rounded-xl px-4 text-sm font-medium ${
              event === tab.id ? "bg-primary text-primary-foreground" : "border border-border bg-card"
            }`}
          >
            {tab.label}
          </button>
        ))}
        <Button type="button" variant="outline" className="h-11" onClick={() => void copy()}>
          {copied ? <Check /> : <Copy />}
          {copied ? "已复制" : "复制整张赛程"}
        </Button>
        <Button type="button" variant="ghost" className="h-11" onClick={() => setResetOpen(true)}>
          清空比分
        </Button>
        <Link href="/zhuan" className="text-sm text-muted-foreground underline">
          通用七人转
        </Link>
      </div>

      {event === "ms" ? (
        <EventBoard
          title="男单 · 1号场 · 抢15分"
          note="7 人全循环，21 场。没有人连打，两场之间至少歇 2 场。"
          names={SINGLES}
          matches={SINGLES_MATCHES}
          target={POINTS.ms}
          read={read}
          bump={bump}
          finish={finish}
          reopen={reopen}
        />
      ) : null}
      {event === "md" ? (
        <EventBoard
          title="男双 · 2号场 · 抢21分"
          note="6 组全循环，15 场。没有队伍连打，两场之间至少歇 1 场。"
          names={DOUBLES}
          matches={DOUBLES_MATCHES}
          target={POINTS.md}
          read={read}
          bump={bump}
          finish={finish}
          reopen={reopen}
        />
      ) : null}
      {event === "xd" ? (
        <MixedBoard scores={scores} read={read} bump={bump} finish={finish} reopen={reopen} />
      ) : null}

      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>清空全部比分？</DialogTitle>
            <DialogDescription>赛程还在，只删这台手机上记的分。</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setResetOpen(false)}>
              留下
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                setScores({})
                setResetOpen(false)
              }}
            >
              清空
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  )
}

function EventBoard({
  title,
  note,
  names,
  matches,
  target,
  read,
  bump,
  finish,
  reopen,
}: {
  title: string
  note: string
  names: string[]
  matches: RosterMatch[]
  target: number
  read: (id: string, a: number, b: number) => Score
  bump: (id: string, base: Score, side: "scoreA" | "scoreB", delta: number) => void
  finish: (id: string, base: Score) => void
  reopen: (id: string, base: Score) => void
}) {
  const scores: Record<string, Score> = {}
  for (const match of matches) scores[match.id] = read(match.id, match.a, match.b)
  const ranked = rankPlayers(
    names.map((_, index) => index),
    matches,
    scores
  )
  const rows = standings(
    names.map((_, index) => index),
    matches,
    scores
  )
  const current = matches.find((match) => !scores[match.id]?.done) ?? null
  return (
    <section className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="order-2 space-y-3 lg:order-1">
        <div>
          <h2 className="text-xl font-bold">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{note}</p>
        </div>
        {current ? (
          <ScoreCard
            kicker={`第 ${current.round} 场`}
            left={names[current.a]}
            right={names[current.b]}
            target={target}
            score={scores[current.id]}
            onBump={(side, delta) => bump(current.id, scores[current.id], side, delta)}
            onFinish={() => finish(current.id, scores[current.id])}
            onReopen={() => reopen(current.id, scores[current.id])}
          />
        ) : (
          <p className="rounded-2xl bg-accent px-4 py-3 text-sm font-medium">这一项全部打完。</p>
        )}
        <ol className="space-y-2">
          {matches.map((match) => {
            const score = scores[match.id]
            return (
              <li key={match.id} className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card px-3 py-3">
                <div>
                  <p className="text-xs text-muted-foreground">第 {match.round} 场</p>
                  <p className="font-medium">
                    {names[match.a]} <span className="text-muted-foreground">对</span> {names[match.b]}
                  </p>
                </div>
                {score.done ? (
                  <button type="button" className="text-right" onClick={() => reopen(match.id, score)}>
                    <span className="block font-bold tabular-nums">
                      {score.scoreA}:{score.scoreB}
                    </span>
                    <span className="text-xs text-primary">改回未结束</span>
                  </button>
                ) : (
                  <span className="text-sm text-muted-foreground">{match.id === current?.id ? "进行中" : "未打"}</span>
                )}
              </li>
            )
          })}
        </ol>
      </div>
      <Board className="order-1 lg:order-2" names={names} order={ranked.order} rows={rows} cycled={ranked.cycled} total={names.length - 1} />
    </section>
  )
}

function MixedBoard({
  scores,
  read,
  bump,
  finish,
  reopen,
}: {
  scores: Record<string, Score>
  read: (id: string, a: number, b: number) => Score
  bump: (id: string, base: Score, side: "scoreA" | "scoreB", delta: number) => void
  finish: (id: string, base: Score) => void
  reopen: (id: string, base: Score) => void
}) {
  const rounds = [...new Set(MIXED_MATCHES.map((match) => match.round))]
  const currentRound = rounds.find((round) =>
    MIXED_MATCHES.filter((match) => match.round === round).some((match) => !read(match.id, match.a, match.b).done)
  )
  const rankA = rankPlayers([0, 1, 2, 3, 4], groupMatches("A"), scores)
  const rankB = rankPlayers([0, 1, 2, 3, 4], groupMatches("B"), scores)
  const slots = knockout(scores)
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">混双 · 3号场 A 组，4号场 B 组 · 抢21分</h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          两组同时打，各 10 轮。没有组合连打。六月&蔡蔡、西西&谈渡是打一场歇一轮，连着四场都是这个节奏。小组打完空一轮再半决赛，半决赛打完再空一轮，负方才打三四名。
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Board names={MIXED_A} order={rankA.order} rows={standings([0, 1, 2, 3, 4], groupMatches("A"), scores)} cycled={rankA.cycled} total={4} title="A组" />
        <Board names={MIXED_B} order={rankB.order} rows={standings([0, 1, 2, 3, 4], groupMatches("B"), scores)} cycled={rankB.cycled} total={4} title="B组" />
      </div>
      {currentRound ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {MIXED_MATCHES.filter((match) => match.round === currentRound).map((match) => {
            const names = match.court === "3号场" ? MIXED_A : MIXED_B
            const score = read(match.id, match.a, match.b)
            return (
              <ScoreCard
                key={match.id}
                kicker={`第 ${match.round} 轮 · ${match.court}`}
                left={names[match.a]}
                right={names[match.b]}
                target={POINTS.xd}
                score={score}
                onBump={(side, delta) => bump(match.id, score, side, delta)}
                onFinish={() => finish(match.id, score)}
                onReopen={() => reopen(match.id, score)}
              />
            )
          })}
        </div>
      ) : (
        <p className="rounded-2xl bg-accent px-4 py-3 text-sm font-medium">小组赛打完。出线看上面的名次。</p>
      )}
      <ol className="space-y-2">
        {rounds.map((round) => (
          <li key={round} className="rounded-2xl border border-border bg-card px-3 py-3 text-sm">
            <p className="text-xs text-muted-foreground">第 {round} 轮</p>
            {MIXED_MATCHES.filter((match) => match.round === round).map((match) => {
              const names = match.court === "3号场" ? MIXED_A : MIXED_B
              const score = read(match.id, match.a, match.b)
              return (
                <p key={match.id} className="mt-1">
                  <span className="text-muted-foreground">{match.court} </span>
                  {names[match.a]} 对 {names[match.b]}
                  {score.done ? <span className="ml-2 font-bold tabular-nums">{score.scoreA}:{score.scoreB}</span> : null}
                </p>
              )
            })}
          </li>
        ))}
      </ol>
      <section className="rounded-3xl border border-border bg-card p-4">
        <h3 className="font-bold">淘汰赛</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {groupDone("A", scores) && groupDone("B", scores) ? "小组名次已定，半决赛可以打。" : "两组都打完才填出线名单。"}
          半决赛同时进行。打完休息一轮，再打三四名，最后决赛。
        </p>
        <div className="mt-3 space-y-3">
          <p className="rounded-2xl bg-secondary px-3 py-2 text-sm">小组赛后休息一轮</p>
          {slots.slice(0, 2).map((slot) => (
            <KnockCard key={slot.id} slotId={slot.id} label={`${slot.label} · ${slot.court}`} left={slotName(slot, "a", scores)} right={slotName(slot, "b", scores)} a={slot.a} b={slot.b} read={read} bump={bump} finish={finish} reopen={reopen} />
          ))}
          <p className="rounded-2xl bg-secondary px-3 py-2 text-sm">半决赛后休息一轮，负方不用连打</p>
          {slots.slice(2).map((slot) => (
            <KnockCard key={slot.id} slotId={slot.id} label={`${slot.label} · ${slot.court}`} left={slotName(slot, "a", scores)} right={slotName(slot, "b", scores)} a={slot.a} b={slot.b} read={read} bump={bump} finish={finish} reopen={reopen} />
          ))}
        </div>
      </section>
    </div>
  )
}

function KnockCard({
  slotId,
  label,
  left,
  right,
  a,
  b,
  read,
  bump,
  finish,
  reopen,
}: {
  slotId: string
  label: string
  left: string
  right: string
  a: number | null
  b: number | null
  read: (id: string, a: number, b: number) => Score
  bump: (id: string, base: Score, side: "scoreA" | "scoreB", delta: number) => void
  finish: (id: string, base: Score) => void
  reopen: (id: string, base: Score) => void
}) {
  if (a === null || b === null) {
    return (
      <article className="rounded-3xl border border-dashed border-border px-4 py-3">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 font-medium">
          {left} <span className="text-muted-foreground">对</span> {right}
        </p>
      </article>
    )
  }
  const score = read(slotId, a, b)
  return (
    <ScoreCard
      kicker={label}
      left={left}
      right={right}
      target={POINTS.xd}
      score={score}
      onBump={(side, delta) => bump(slotId, score, side, delta)}
      onFinish={() => finish(slotId, score)}
      onReopen={() => reopen(slotId, score)}
    />
  )
}

function ScoreCard({
  kicker,
  left,
  right,
  target,
  score,
  onBump,
  onFinish,
  onReopen,
}: {
  kicker: string
  left: string
  right: string
  target: number
  score: Score
  onBump: (side: "scoreA" | "scoreB", delta: number) => void
  onFinish: () => void
  onReopen: () => void
}) {
  const leader = score.scoreA === score.scoreB ? null : score.scoreA > score.scoreB ? "a" : "b"
  const reached = leader !== null && Math.max(score.scoreA, score.scoreB) >= target
  return (
    <article className="rounded-3xl border border-border bg-card p-4">
      <p className="mb-2 text-xs text-muted-foreground">{kicker}</p>
      <div className="grid grid-cols-2 gap-3">
        <Side name={left} value={score.scoreA} ahead={leader === "a"} done={score.done} onMinus={() => onBump("scoreA", -1)} onPlus={() => onBump("scoreA", 1)} />
        <Side name={right} value={score.scoreB} ahead={leader === "b"} done={score.done} onMinus={() => onBump("scoreB", -1)} onPlus={() => onBump("scoreB", 1)} />
      </div>
      {score.done ? (
        <Button type="button" variant="outline" className="mt-3 h-11 w-full" onClick={onReopen}>
          改回未结束
        </Button>
      ) : (
        <>
          <Button type="button" className="mt-3 h-12 w-full text-base" disabled={!reached} onClick={onFinish}>
            {reached ? "结束本场" : `先到 ${target} 分，且不能平局`}
          </Button>
          {leader !== null && !reached ? (
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
  value,
  ahead,
  done,
  onMinus,
  onPlus,
}: {
  name: string
  value: number
  ahead: boolean
  done: boolean
  onMinus: () => void
  onPlus: () => void
}) {
  return (
    <div className={`rounded-2xl px-2 py-3 text-center ${ahead ? "bg-accent" : "bg-secondary"}`}>
      <p className="truncate text-sm font-medium">
        {name}
        {done && ahead ? " · 胜" : ""}
      </p>
      <p className="my-1 text-4xl font-bold tabular-nums">{value}</p>
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" className="h-11 bg-white text-lg" aria-label={`${name} 减一分`} disabled={done || value === 0} onClick={onMinus}>
          −
        </Button>
        <Button type="button" variant="outline" className="h-11 bg-white text-lg" aria-label={`${name} 加一分`} disabled={done} onClick={onPlus}>
          +
        </Button>
      </div>
    </div>
  )
}

function Board({
  names,
  order,
  rows,
  cycled,
  total,
  title = "积分",
  className = "",
}: {
  names: string[]
  order: number[]
  rows: { id: number; wins: number; losses: number; diff: number }[]
  cycled: number[][]
  total: number
  title?: string
  className?: string
}) {
  const byId = new Map(rows.map((row) => [row.id, row]))
  return (
    <aside className={`rounded-3xl border border-border bg-card p-4 lg:sticky lg:top-4 ${className}`}>
      <h2 className="font-bold">{title}</h2>
      {cycled.length > 0 ? <p className="mt-1 text-xs leading-5 text-muted-foreground">有胜负套圈，这几队按总净胜分排。</p> : null}
      <table className="mt-2 w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-muted-foreground">
            <th className="pb-2 font-medium">名次</th>
            <th className="pb-2 font-medium">选手</th>
            <th className="pb-2 text-right font-medium">胜负</th>
            <th className="pb-2 text-right font-medium">净胜</th>
          </tr>
        </thead>
        <tbody>
          {order.map((id, index) => {
            const row = byId.get(id)!
            return (
              <tr key={id} className="border-t border-border">
                <td className="py-2 tabular-nums">{rows.every((item) => item.wins + item.losses === 0) ? "—" : index + 1}</td>
                <td className="py-2 font-medium">{names[id]}</td>
                <td className="py-2 text-right tabular-nums">
                  {row.wins}胜{row.losses}负
                  <span className="text-muted-foreground">/{total}</span>
                </td>
                <td className="py-2 text-right tabular-nums">
                  {row.diff > 0 ? "+" : ""}
                  {row.diff}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </aside>
  )
}
