"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Check, Copy } from "lucide-react"

import { AccountsDialog, LoginDialog } from "@/components/auth-dialogs"
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
  POINTS,
  SINGLES,
  SINGLES_MATCHES,
  courtIdOf,
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
import type { PublicUser } from "@/lib/auth-types"

function sinkFinished<T>(items: T[], done: (item: T) => boolean): T[] {
  const open: T[] = []
  const closed: T[] = []
  for (const item of items) {
    if (done(item)) closed.push(item)
    else open.push(item)
  }
  return [...open, ...closed]
}

const TABS: { id: EventId; label: string }[] = [
  { id: "ms", label: "男单" },
  { id: "md", label: "男双" },
  { id: "xd", label: "混双" },
]

export function YuesaiApp() {
  const [ready, setReady] = useState(false)
  const [sessionReady, setSessionReady] = useState(false)
  const [event, setEvent] = useState<EventId>("ms")
  const [scores, setScores] = useState<Record<string, Score>>({})
  const [me, setMe] = useState<PublicUser | null>(null)
  const [loginOpen, setLoginOpen] = useState(false)
  const [accountsOpen, setAccountsOpen] = useState(false)
  const [notice, setNotice] = useState("")
  const [copied, setCopied] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const [edition, setEdition] = useState<{ title: string; status: "live" | "archived" } | null>(null)
  const writing = useRef(0)
  const failed = useRef(false)
  const queue = useRef(Promise.resolve())

  async function refreshScores() {
    const response = await fetch("/api/scores", { cache: "no-store" })
    if (!response.ok) return
    const body: { scores?: Record<string, Score>; tournament?: { title: string; status: "live" | "archived" } | null } = await response.json()
    const nextScores = body.scores ?? {}
    const nextEdition = body.tournament ?? null
    setScores((current) => (JSON.stringify(current) === JSON.stringify(nextScores) ? current : nextScores))
    setEdition((current) => (JSON.stringify(current) === JSON.stringify(nextEdition) ? current : nextEdition))
    setReady(true)
  }

  useEffect(() => {
    let stop = false
    void fetch("/api/session", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : { user: null }))
      .then((body: { user?: PublicUser | null }) => {
        if (stop) return
        setMe(body.user ?? null)
        setSessionReady(true)
      })
      .catch(() => {
        if (!stop) setSessionReady(true)
      })
    return () => {
      stop = true
    }
  }, [])

  useEffect(() => {
    let stop = false
    const pull = () => {
      if (stop || writing.current > 0) return
      void refreshScores()
      void fetch("/api/session", { cache: "no-store" })
        .then((response) => (response.ok ? response.json() : null))
        .then((body: { user?: PublicUser | null } | null) => {
          if (stop || !body) return
          const next = body.user ?? null
          setMe((current) => {
            if (!current && !next) return current
            if (
              current &&
              next &&
              current.id === next.id &&
              current.role === next.role &&
              JSON.stringify(current.courts) === JSON.stringify(next.courts)
            ) {
              return current
            }
            return next
          })
          setSessionReady(true)
        })
        .catch(() => undefined)
    }
    pull()
    const timer = window.setInterval(pull, 2000)
    return () => {
      stop = true
      window.clearInterval(timer)
    }
  }, [])

  function read(id: string, a: number, b: number): Score {
    const saved = scores[id]
    if (!saved || saved.a !== a || saved.b !== b) return emptyScore(a, b)
    return saved
  }

  function allowed(id: string): boolean {
    if (edition && edition.status !== "live") return false
    if (!sessionReady || !me) return false
    if (me.role === "admin") return true
    const court = courtIdOf(id)
    return court !== null && (me.courts ?? []).includes(court)
  }

  function lockNote(id: string): string {
    if (edition && edition.status !== "live") return "这一届已归档。"
    if (allowed(id) || !me) return ""
    return "这个场地还没分给你。"
  }

  function save(id: string, next: Score) {
    setScores((current) => ({ ...current, [id]: next }))
    writing.current += 1
    queue.current = queue.current.then(async () => {
      try {
        const response = await fetch(`/api/scores/${encodeURIComponent(id)}`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(next),
        })
        if (!response.ok) {
          const body: { error?: unknown } = await response.json().catch(() => ({}))
          if (response.status === 401) {
            setMe(null)
            setLoginOpen(true)
          }
          setNotice(typeof body.error === "string" ? body.error : "比分没保存上")
          failed.current = true
        }
      } catch {
        setNotice("比分没保存上")
        failed.current = true
      } finally {
        writing.current -= 1
        if (writing.current === 0 && failed.current) {
          failed.current = false
          try {
            await refreshScores()
          } catch {
            setNotice("比分没保存上")
          }
        }
      }
    })
  }

  function write(id: string, next: Score) {
    if (!allowed(id)) return
    setNotice("")
    save(id, next)
  }

  function bump(id: string, base: Score, side: "scoreA" | "scoreB", delta: number, target: number) {
    if (base.done) return
    const other = side === "scoreA" ? base.scoreB : base.scoreA
    const max = other >= target ? target - 1 : target
    const next = Math.max(0, Math.min(max, base[side] + delta))
    if (next === base[side]) return
    write(id, { ...base, [side]: next })
  }

  function finish(id: string, base: Score) {
    write(id, { ...base, done: true })
  }

  function reopen(id: string, base: Score) {
    write(id, { ...base, done: false })
  }

  async function logout() {
    await fetch("/api/logout", { method: "POST" })
    setMe(null)
    setAccountsOpen(false)
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

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-4 py-5 sm:px-6 sm:py-8">
      <header className="banner relative mb-4 overflow-hidden rounded-3xl">
        <div className="court-grid pointer-events-none absolute inset-0 opacity-70" />
        <div className="relative px-5 py-4 sm:px-6">
          <p className="text-xs font-bold tracking-[0.22em] text-[#ffe14a]">1号场男单 · 2号场男双 · 3、4号场混双</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-white sm:text-4xl">{edition?.title ?? "南方月赛"}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/75">
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
            className="event-tab h-11 rounded-full px-4 text-sm font-bold"
          >
            {tab.label}
          </button>
        ))}
        <Button type="button" variant="outline" className="h-11" onClick={() => void copy()}>
          {copied ? <Check /> : <Copy />}
          {copied ? "已复制" : "复制整张赛程"}
        </Button>
        {me?.role === "admin" ? (
          <Button type="button" variant="outline" className="h-11" onClick={() => setAccountsOpen(true)}>
            记分员账号
          </Button>
        ) : null}
        {me?.role === "admin" ? (
          <Button type="button" variant="ghost" className="h-11" onClick={() => setResetOpen(true)}>
            清空比分
          </Button>
        ) : null}
        {me ? (
          <span className="text-sm font-medium text-white/80">
            {me.role === "admin" ? "管理" : (me.courts ?? []).length === 0 ? "记分员，还没分场地" : (me.courts ?? []).map((court) => `${court}号场`).join("、")} · {me.username}
          </span>
        ) : null}
        {me ? (
          <Button type="button" variant="ghost" className="h-11" onClick={() => void logout()}>
            退出
          </Button>
        ) : (
          <Button type="button" className="h-11" onClick={() => setLoginOpen(true)}>
            登录
          </Button>
        )}
        <Link href="/board" className="inline-flex h-11 items-center rounded-full bg-[#ffe14a] px-4 text-sm font-bold text-[#10240f]">
          赛程表
        </Link>
        <Link href="/zhuan" className="text-sm font-medium text-[#ffe14a] underline">
          通用七人转
        </Link>
      </div>

      {notice ? <p className="mb-3 rounded-2xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{notice}</p> : null}
      {!ready ? <p className="mb-3 text-sm text-white/70">比分加载中</p> : null}

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
          allowed={allowed}
          lockNote={lockNote}
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
          allowed={allowed}
          lockNote={lockNote}
        />
      ) : null}
      {event === "xd" ? (
        <MixedBoard
          scores={scores}
          read={read}
          bump={bump}
          finish={finish}
          reopen={reopen}
          allowed={allowed}
          lockNote={lockNote}
          initialGroup={me && me.role !== "admin" && (me.courts ?? []).includes("4") && !(me.courts ?? []).includes("3") ? "B" : "A"}
        />
      ) : null}

      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>清空全部比分？</DialogTitle>
            <DialogDescription>四个场地的比分都会清掉，所有人马上看到。</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setResetOpen(false)}>
              留下
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                void fetch("/api/scores/reset", { method: "POST" }).then(async (response) => {
                  if (!response.ok) {
                    const body: { error?: unknown } = await response.json().catch(() => ({}))
                    setNotice(typeof body.error === "string" ? body.error : "没清空")
                    return
                  }
                  setScores({})
                  setResetOpen(false)
                })
              }}
            >
              清空
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <LoginDialog open={loginOpen} onOpenChange={setLoginOpen} onSuccess={setMe} />
      {me?.role === "admin" ? (
        <AccountsDialog open={accountsOpen} onOpenChange={setAccountsOpen} adminId={me.id} />
      ) : null}
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
  allowed,
  lockNote,
}: {
  title: string
  note: string
  names: string[]
  matches: RosterMatch[]
  target: number
  read: (id: string, a: number, b: number) => Score
  bump: (id: string, base: Score, side: "scoreA" | "scoreB", delta: number, target: number) => void
  finish: (id: string, base: Score) => void
  reopen: (id: string, base: Score) => void
  allowed: (id: string) => boolean
  lockNote: (id: string) => string
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
  const [picked, setPicked] = useState<string | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const open = matches.find((match) => !scores[match.id]?.done) ?? null
  const selected = matches.find((match) => match.id === picked) ?? open
  function choose(id: string) {
    setPicked(id)
    window.setTimeout(() => cardRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 0)
  }
  return (
    <section className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="order-2 space-y-3 lg:order-1">
        <div>
          <h2 className="text-xl font-bold text-white">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-white/70">{note}</p>
          <p className="mt-1 text-sm font-medium text-[#ffe14a]">点任意一场就能记，不用等上一场结束。</p>
        </div>
        {selected ? (
          <div ref={cardRef}>
            <ScoreCard
              kicker={`第 ${selected.round} 场`}
              left={names[selected.a]}
              right={names[selected.b]}
              target={target}
              score={scores[selected.id]}
              editable={allowed(selected.id)}
              lockNote={lockNote(selected.id)}
              onBump={(side, delta) => bump(selected.id, scores[selected.id], side, delta, target)}
              onFinish={() => finish(selected.id, scores[selected.id])}
              onReopen={() => reopen(selected.id, scores[selected.id])}
            />
          </div>
        ) : (
          <p className="rounded-2xl bg-accent px-4 py-3 text-sm font-medium">这一项全部打完。点下面一场可以改分。</p>
        )}
        <ol className="space-y-2">
          {sinkFinished(matches, (match) => Boolean(scores[match.id]?.done)).map((match) => {
            const score = scores[match.id]
            const active = match.id === selected?.id
            return (
              <li key={match.id}>
                <button
                  type="button"
                  onClick={() => choose(match.id)}
                  aria-current={active ? "true" : undefined}
                  className={`match-row flex w-full items-center justify-between gap-3 rounded-2xl px-3 py-3 text-left ${active ? "ring-2 ring-[#ffe14a]" : ""}`}
                >
                  <div>
                    <p className="text-xs text-white/55">第 {match.round} 场</p>
                    <p className="font-bold">
                      {names[match.a]} <span className="font-medium text-white/45">对</span> {names[match.b]}
                    </p>
                  </div>
                  {score.done ? (
                    <span className="text-lg font-bold tabular-nums text-[#ffe14a]">
                      {score.scoreA}:{score.scoreB}
                    </span>
                  ) : (
                    <span className={`text-sm font-bold ${active ? "text-[#ffe14a]" : "text-white/45"}`}>
                      {active ? "正在记" : "未打"}
                    </span>
                  )}
                </button>
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
  allowed,
  lockNote,
  initialGroup = "A",
}: {
  scores: Record<string, Score>
  read: (id: string, a: number, b: number) => Score
  bump: (id: string, base: Score, side: "scoreA" | "scoreB", delta: number, target: number) => void
  finish: (id: string, base: Score) => void
  reopen: (id: string, base: Score) => void
  allowed: (id: string) => boolean
  lockNote: (id: string) => string
  initialGroup?: "A" | "B"
}) {
  const [group, setGroup] = useState<"A" | "B">(initialGroup)
  const [groupTouched, setGroupTouched] = useState(false)
  const [picked, setPicked] = useState<string | null>(null)
  const [knockPicked, setKnockPicked] = useState<string | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!groupTouched) setGroup(initialGroup)
  }, [groupTouched, initialGroup])
  const matches = groupMatches(group)
  const names = group === "A" ? MIXED_A : MIXED_B
  const court = group === "A" ? "3号场" : "4号场"
  const open = matches.find((match) => !read(match.id, match.a, match.b).done) ?? null
  const selected = matches.find((match) => match.id === picked) ?? open
  function choose(id: string) {
    setPicked(id)
    window.setTimeout(() => cardRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 0)
  }
  function showGroup(next: "A" | "B") {
    setGroupTouched(true)
    setGroup(next)
    setPicked(null)
  }
  const rankA = rankPlayers([0, 1, 2, 3, 4], groupMatches("A"), scores)
  const rankB = rankPlayers([0, 1, 2, 3, 4], groupMatches("B"), scores)
  const slots = knockout(scores)
  const slotById = new Map(slots.map((slot) => [slot.id, slot]))
  const groupsDone = groupDone("A", scores) && groupDone("B", scores)
  function knockFinished(id: string) {
    const slot = slotById.get(id)
    if (!slot || slot.a === null || slot.b === null) return false
    return read(id, slot.a, slot.b).done
  }
  const semisDone = knockFinished("sf1") && knockFinished("sf2")
  const stageIds = !groupsDone ? [] : semisDone ? ["final", "third"] : ["sf1", "sf2"]
  const preferredKnock = stageIds.includes(knockPicked ?? "")
    ? knockPicked!
    : semisDone
      ? "final"
      : initialGroup === "B"
        ? "sf2"
        : "sf1"
  const activeKnock = stageIds.includes(preferredKnock) ? preferredKnock : stageIds[0]
  function knockTitle(id: string) {
    if (id === "sf1") return "半决赛 · 3号场"
    if (id === "sf2") return "半决赛 · 4号场"
    if (id === "final") return "总决赛 · 3号场"
    return "季军赛 · 3号场"
  }
  function chooseKnock(id: string) {
    setKnockPicked(id)
    window.setTimeout(() => cardRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 0)
  }
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-white">混双 · 3号场 A 组，4号场 B 组 · 抢21分</h2>
        <p className="mt-1 text-sm leading-6 text-white/70">
          两组同时打，各 10 轮。没有组合连打。小组打完空一轮再半决赛，半决赛打完再空一轮，负方才打三四名。
        </p>
        <p className="mt-1 text-sm font-medium text-[#ffe14a]">
          {groupsDone ? (semisDone ? "半决赛打完，上面是总决赛和季军赛。" : "小组打完，上面是半决赛。") : "点 A 组或 B 组，只看那一组的赛程。"}
        </p>
      </div>
      {groupsDone ? (
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            {stageIds.map((id) => {
              const slot = slotById.get(id)
              if (!slot) return null
              const known = slot.a !== null && slot.b !== null
              const score = known ? read(slot.id, slot.a!, slot.b!) : null
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => chooseKnock(id)}
                  aria-pressed={id === activeKnock}
                  className={`leaderboard rounded-3xl p-4 text-left ${id === activeKnock ? "is-selected" : ""}`}
                >
                  <h2 className="font-bold tracking-wide text-[#ffe14a]">{knockTitle(id)}</h2>
                  <p className="text-xs text-white/60">{id === activeKnock ? "正在看这场" : "点此记分"}</p>
                  <p className="mt-2 font-bold">
                    {slotName(slot, "a", scores)} <span className="font-medium text-white/45">对</span> {slotName(slot, "b", scores)}
                  </p>
                  <p className="mt-1 text-lg font-bold tabular-nums text-[#ffe14a]">
                    {score?.done ? `${score.scoreA}:${score.scoreB}` : known ? "未打" : "等出线"}
                  </p>
                </button>
              )
            })}
          </div>
          {(() => {
            const slot = slotById.get(activeKnock)
            if (!slot || slot.a === null || slot.b === null) {
              return <p className="rounded-2xl bg-accent px-4 py-3 text-sm font-medium">出线名单还没齐，这场先不能记。</p>
            }
            const score = read(slot.id, slot.a, slot.b)
            return (
              <div ref={cardRef}>
                <ScoreCard
                  kicker={knockTitle(slot.id)}
                  left={slotName(slot, "a", scores)}
                  right={slotName(slot, "b", scores)}
                  target={POINTS.xd}
                  score={score}
                  editable={allowed(slot.id)}
                  lockNote={lockNote(slot.id)}
                  onBump={(side, delta) => bump(slot.id, score, side, delta, POINTS.xd)}
                  onFinish={() => finish(slot.id, score)}
                  onReopen={() => reopen(slot.id, score)}
                />
              </div>
            )
          })()}
          <ol className="space-y-2">
            {sinkFinished(stageIds, (id) => knockFinished(id)).map((id) => {
              const slot = slotById.get(id)
              if (!slot) return null
              const known = slot.a !== null && slot.b !== null
              const score = known ? read(slot.id, slot.a!, slot.b!) : null
              const active = id === activeKnock
              return (
                <li key={id}>
                  <button
                    type="button"
                    onClick={() => chooseKnock(id)}
                    aria-current={active ? "true" : undefined}
                    className={`match-row flex w-full items-center justify-between gap-3 rounded-2xl px-3 py-3 text-left ${active ? "ring-2 ring-[#ffe14a]" : ""}`}
                  >
                    <div>
                      <p className="text-xs text-white/55">{knockTitle(id)}</p>
                      <p className="font-bold">
                        {slotName(slot, "a", scores)} <span className="font-medium text-white/45">对</span> {slotName(slot, "b", scores)}
                      </p>
                    </div>
                    {score?.done ? (
                      <span className="text-lg font-bold tabular-nums text-[#ffe14a]">
                        {score.scoreA}:{score.scoreB}
                      </span>
                    ) : (
                      <span className={`text-sm font-bold ${active ? "text-[#ffe14a]" : "text-white/45"}`}>{active ? "正在记" : "未打"}</span>
                    )}
                  </button>
                </li>
              )
            })}
          </ol>
          <p className="rounded-2xl bg-white/10 px-3 py-2 text-sm text-white/80">
            {semisDone ? "半决赛后休息一轮。胜方打总决赛，负方打季军赛。" : "小组赛后休息一轮，再打半决赛。"}
          </p>
        </div>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <Board
          names={MIXED_A}
          order={rankA.order}
          rows={standings([0, 1, 2, 3, 4], groupMatches("A"), scores)}
          cycled={rankA.cycled}
          total={4}
          title="A组 · 3号场"
          selected={!groupsDone && group === "A"}
          onSelect={groupsDone ? undefined : () => showGroup("A")}
        />
        <Board
          names={MIXED_B}
          order={rankB.order}
          rows={standings([0, 1, 2, 3, 4], groupMatches("B"), scores)}
          cycled={rankB.cycled}
          total={4}
          title="B组 · 4号场"
          selected={!groupsDone && group === "B"}
          onSelect={groupsDone ? undefined : () => showGroup("B")}
        />
      </div>
      {groupsDone ? null : <div className="space-y-4">
      <div>
        <h3 className="text-lg font-bold text-white">{group}组赛程 · {court}</h3>
        <p className="mt-1 text-sm text-white/70">点任意一场就能记，不用等上一场结束。</p>
      </div>
      {selected ? (
        <div ref={cardRef}>
          <ScoreCard
            kicker={`第 ${selected.round} 轮 · ${court}`}
            left={names[selected.a]}
            right={names[selected.b]}
            target={POINTS.xd}
            score={read(selected.id, selected.a, selected.b)}
            editable={allowed(selected.id)}
            lockNote={lockNote(selected.id)}
            onBump={(side, delta) => bump(selected.id, read(selected.id, selected.a, selected.b), side, delta, POINTS.xd)}
            onFinish={() => finish(selected.id, read(selected.id, selected.a, selected.b))}
            onReopen={() => reopen(selected.id, read(selected.id, selected.a, selected.b))}
          />
        </div>
      ) : (
        <p className="rounded-2xl bg-accent px-4 py-3 text-sm font-medium">这一组打完了。点下面一场可以改分。</p>
      )}
      <ol className="space-y-2">
        {sinkFinished(matches, (match) => read(match.id, match.a, match.b).done).map((match) => {
          const score = read(match.id, match.a, match.b)
          const active = match.id === selected?.id
          return (
            <li key={match.id}>
              <button
                type="button"
                onClick={() => choose(match.id)}
                aria-current={active ? "true" : undefined}
                className={`match-row flex w-full items-center justify-between gap-3 rounded-2xl px-3 py-3 text-left ${active ? "ring-2 ring-[#ffe14a]" : ""}`}
              >
                <div>
                  <p className="text-xs text-white/55">第 {match.round} 轮</p>
                  <p className="font-bold">
                    {names[match.a]} <span className="font-medium text-white/45">对</span> {names[match.b]}
                  </p>
                </div>
                {score.done ? (
                  <span className="text-lg font-bold tabular-nums text-[#ffe14a]">
                    {score.scoreA}:{score.scoreB}
                  </span>
                ) : (
                  <span className={`text-sm font-bold ${active ? "text-[#ffe14a]" : "text-white/45"}`}>
                    {active ? "正在记" : "未打"}
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ol>
      </div>}
      {groupsDone ? null : <section className="leaderboard rounded-3xl p-4">
        <h3 className="font-bold text-[#ffe14a]">淘汰赛 · {court}</h3>
        <p className="mt-1 text-sm text-white/70">
          {groupDone("A", scores) && groupDone("B", scores) ? "小组名次已定，半决赛可以打。" : "两组都打完才填出线名单。"}
          {group === "B" ? "三四名和决赛在3号场。" : "半决赛打完休息一轮，再打三四名，最后决赛。"}
        </p>
        <div className="mt-3 space-y-3">
          <p className="rounded-2xl bg-white/10 px-3 py-2 text-sm">小组赛后休息一轮</p>
          {(group === "A" ? ["sf1"] : ["sf2"]).map((id) => {
            const slot = slotById.get(id)
            if (!slot) return null
            return <KnockCard key={slot.id} slotId={slot.id} label={`${slot.label} · ${slot.court}`} left={slotName(slot, "a", scores)} right={slotName(slot, "b", scores)} a={slot.a} b={slot.b} read={read} bump={bump} finish={finish} reopen={reopen} allowed={allowed} lockNote={lockNote} />
          })}
          {group === "A" ? <p className="rounded-2xl bg-white/10 px-3 py-2 text-sm">半决赛后休息一轮，负方不用连打</p> : null}
          {group === "A"
            ? ["third", "final"].map((id) => {
                const slot = slotById.get(id)
                if (!slot) return null
                return <KnockCard key={slot.id} slotId={slot.id} label={`${slot.label} · ${slot.court}`} left={slotName(slot, "a", scores)} right={slotName(slot, "b", scores)} a={slot.a} b={slot.b} read={read} bump={bump} finish={finish} reopen={reopen} allowed={allowed} lockNote={lockNote} />
              })
            : null}
        </div>
      </section>}
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
  allowed,
  lockNote,
}: {
  slotId: string
  label: string
  left: string
  right: string
  a: number | null
  b: number | null
  read: (id: string, a: number, b: number) => Score
  bump: (id: string, base: Score, side: "scoreA" | "scoreB", delta: number, target: number) => void
  finish: (id: string, base: Score) => void
  reopen: (id: string, base: Score) => void
  allowed: (id: string) => boolean
  lockNote: (id: string) => string
}) {
  if (a === null || b === null) {
    return (
      <article className="rounded-3xl border border-dashed border-white/30 px-4 py-3 text-white">
        <p className="text-xs text-[#ffe14a]">{label}</p>
        <p className="mt-1 font-medium">
          {left} <span className="text-white/45">对</span> {right}
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
      editable={allowed(slotId)}
      lockNote={lockNote(slotId)}
      onBump={(side, delta) => bump(slotId, score, side, delta, POINTS.xd)}
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
  editable,
  lockNote,
  onBump,
  onFinish,
  onReopen,
}: {
  kicker: string
  left: string
  right: string
  target: number
  score: Score
  editable: boolean
  lockNote: string
  onBump: (side: "scoreA" | "scoreB", delta: number) => void
  onFinish: () => void
  onReopen: () => void
}) {
  const leader = score.scoreA === score.scoreB ? null : score.scoreA > score.scoreB ? "a" : "b"
  const reached = leader !== null && Math.max(score.scoreA, score.scoreB) >= target
  function capped(side: "scoreA" | "scoreB") {
    const mine = score[side]
    const other = side === "scoreA" ? score.scoreB : score.scoreA
    const max = other >= target ? target - 1 : target
    return mine >= max
  }
  return (
    <article className="scoreboard rounded-3xl p-4">
      <p className="mb-3 text-xs font-bold tracking-[0.18em] text-[#ffe14a]">{kicker}</p>
      <div className="grid grid-cols-2 gap-3">
        <Side name={left} value={score.scoreA} ahead={leader === "a"} done={score.done} editable={editable} capped={capped("scoreA")} onMinus={() => onBump("scoreA", -1)} onPlus={() => onBump("scoreA", 1)} />
        <Side name={right} value={score.scoreB} ahead={leader === "b"} done={score.done} editable={editable} capped={capped("scoreB")} onMinus={() => onBump("scoreB", -1)} onPlus={() => onBump("scoreB", 1)} />
      </div>
      {!editable && lockNote ? <p className="mt-3 text-sm text-white/65">{lockNote}</p> : null}
      {editable && score.done ? (
        <Button type="button" variant="outline" className="mt-3 h-11 w-full" onClick={onReopen}>
          改回未结束
        </Button>
      ) : null}
      {editable && !score.done ? (
        <>
          <Button type="button" className="mt-3 h-12 w-full bg-[#ffe14a] text-base font-bold text-[#10240f] hover:bg-[#ffe14a]/90" disabled={!reached} onClick={onFinish}>
            {reached ? "结束本场" : `先到 ${target} 分，且不能平局`}
          </Button>
          {leader !== null && !reached ? (
            <button type="button" className="mt-2 w-full text-sm text-white/60 underline" onClick={onFinish}>
              没打满，按现在的比分结束
            </button>
          ) : null}
        </>
      ) : null}
    </article>
  )
}

function Side({
  name,
  value,
  ahead,
  done,
  editable,
  capped,
  onMinus,
  onPlus,
}: {
  name: string
  value: number
  ahead: boolean
  done: boolean
  editable: boolean
  capped: boolean
  onMinus: () => void
  onPlus: () => void
}) {
  return (
    <div className={`score-side rounded-2xl px-2 py-3 text-center ${ahead ? "ahead" : ""}`}>
      <p className="truncate text-sm font-bold">
        {name}
        {done && ahead ? " · 胜" : ""}
      </p>
      <p className="score-num my-1 text-5xl font-bold sm:text-6xl">{value}</p>
      {editable ? (
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" className="h-12 border-white/30 bg-transparent text-xl text-white hover:bg-white/10" aria-label={`${name} 减一分`} disabled={done || value === 0} onClick={onMinus}>
            −
          </Button>
          <Button type="button" className="h-12 bg-[#ffe14a] text-xl font-bold text-[#10240f] hover:bg-[#ffe14a]/90" aria-label={`${name} 加一分`} disabled={done || capped} onClick={onPlus}>
            +
          </Button>
        </div>
      ) : null}
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
  selected = false,
  onSelect,
}: {
  names: string[]
  order: number[]
  rows: { id: number; wins: number; losses: number; diff: number }[]
  cycled: number[][]
  total: number
  title?: string
  className?: string
  selected?: boolean
  onSelect?: () => void
}) {
  const byId = new Map(rows.map((row) => [row.id, row]))
  return (
    <aside
      className={`leaderboard rounded-3xl p-4 lg:sticky lg:top-4 ${onSelect ? "cursor-pointer" : ""} ${selected ? "is-selected" : ""} ${className}`}
      onClick={onSelect}
      onKeyDown={
        onSelect
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault()
                onSelect()
              }
            }
          : undefined
      }
      role={onSelect ? "button" : undefined}
      tabIndex={onSelect ? 0 : undefined}
      aria-pressed={onSelect ? selected : undefined}
    >
      <h2 className="font-bold tracking-wide text-[#ffe14a]">{title}</h2>
      {onSelect ? <p className="text-xs text-white/60">{selected ? "正在看这一组" : "点此看赛程"}</p> : null}
      {cycled.length > 0 ? <p className="mt-1 text-xs leading-5 text-white/60">有胜负套圈，这几队按总净胜分排。</p> : null}
      <table className="mt-2 w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-white/50">
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
              <tr key={id} className="border-t border-white/10">
                <td className={`py-2 text-base font-bold tabular-nums ${index === 0 && row.wins + row.losses > 0 ? "rank-1" : ""}`}>
                  {rows.every((item) => item.wins + item.losses === 0) ? "—" : index + 1}
                </td>
                <td className="py-2 font-bold">{names[id]}</td>
                <td className="py-2 text-right tabular-nums">
                  {row.wins}胜{row.losses}负
                  <span className="text-white/45">/{total}</span>
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
