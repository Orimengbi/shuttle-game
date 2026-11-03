"use client"

import { useEffect, useState } from "react"
import Link from "next/link"

import { LoginDialog } from "@/components/auth-dialogs"
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
import type { PublicUser } from "@/lib/auth-types"
import type { Tournament } from "@/lib/tournament"

import {
  DOUBLES,
  DOUBLES_MATCHES,
  MIXED_A,
  MIXED_B,
  SINGLES,
  SINGLES_MATCHES,
  groupMatches,
  knockout,
  slotName,
  type RosterMatch,
  type Score,
} from "@/lib/yuesai"

type Line = {
  id: string
  no: string
  code: string
  left: string
  right: string
  scoreA: number | null
  scoreB: number | null
  done: boolean
  section?: string
}

type CourtSheet = {
  id: string
  title: string
  event: string
  lines: Line[]
}

function shown(score: Score | undefined): { scoreA: number | null; scoreB: number | null; done: boolean } {
  if (!score || (!score.done && score.scoreA === 0 && score.scoreB === 0)) {
    return { scoreA: null, scoreB: null, done: false }
  }
  return { scoreA: score.scoreA, scoreB: score.scoreB, done: score.done }
}

function fromRoster(match: RosterMatch, names: string[], scores: Record<string, Score>, code: string): Line {
  const score = shown(scores[match.id])
  return {
    id: match.id,
    no: String(match.round),
    code,
    left: names[match.a],
    right: names[match.b],
    ...score,
  }
}

function sheets(scores: Record<string, Score>): CourtSheet[] {
  const slots = knockout(scores)
  const knock = (court: string, section: string): Line[] =>
    slots
      .filter((slot) => slot.court === court)
      .map((slot, index) => {
        const score = shown(scores[slot.id])
        return {
          id: slot.id,
          no: slot.label,
          code: "XD",
          left: slotName(slot, "a", scores),
          right: slotName(slot, "b", scores),
          ...score,
          section: index === 0 ? section : undefined,
        }
      })
  return [
    {
      id: "1",
      title: "1号场",
      event: "男单 MS · 15分",
      lines: SINGLES_MATCHES.map((match) => fromRoster(match, SINGLES, scores, "MS")),
    },
    {
      id: "2",
      title: "2号场",
      event: "男双 MD · 21分",
      lines: DOUBLES_MATCHES.map((match) => fromRoster(match, DOUBLES, scores, "MD")),
    },
    {
      id: "3",
      title: "3号场",
      event: "混双 XD · A组 · 21分",
      lines: [
        ...groupMatches("A").map((match) => fromRoster(match, MIXED_A, scores, "XD")),
        ...knock("3号场", "淘汰赛"),
      ],
    },
    {
      id: "4",
      title: "4号场",
      event: "混双 XD · B组 · 21分",
      lines: [
        ...groupMatches("B").map((match) => fromRoster(match, MIXED_B, scores, "XD")),
        ...knock("4号场", "淘汰赛"),
      ],
    },
  ]
}

function ScoreCell({ value, win }: { value: number | null; win: boolean }) {
  return (
    <span className={`w-8 text-right text-base tabular-nums ${win ? "font-bold text-[#ffe14a]" : "text-white/45"}`}>
      {value === null ? "" : value}
    </span>
  )
}

function MatchRow({ line }: { line: Line }) {
  const aWin = line.done && line.scoreA !== null && line.scoreB !== null && line.scoreA > line.scoreB
  const bWin = line.done && line.scoreA !== null && line.scoreB !== null && line.scoreB > line.scoreA
  const live = !line.done && line.scoreA !== null
  return (
    <div>
      {line.section ? <p className="bg-[#124e38] px-2 py-1 text-[11px] font-bold tracking-wider text-[#ffe14a]">{line.section}</p> : null}
      <div className={`grid grid-cols-[2.75rem_1fr] gap-x-2 border-b border-white/10 px-2 py-1.5 ${live ? "bg-[#183224]" : "bg-[#10281d]"}`}>
        <div className="pt-0.5 text-center">
          <p className="text-[10px] font-bold tracking-wide text-white/45">{line.code}</p>
          <p className="text-xs font-bold text-[#ffe14a]">{line.no}</p>
          {live ? <p className="text-[10px] font-bold text-[#ffe14a]">LIVE</p> : null}
        </div>
        <div className="min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className={`truncate text-sm ${aWin ? "font-bold text-white" : "text-white/80"}`}>{line.left}</span>
            <ScoreCell value={line.scoreA} win={aWin} />
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className={`truncate text-sm ${bWin ? "font-bold text-white" : "text-white/80"}`}>{line.right}</span>
            <ScoreCell value={line.scoreB} win={bWin} />
          </div>
        </div>
      </div>
    </div>
  )
}

function nextMonthTitle() {
  const now = new Date()
  const month = now.getMonth() + 2
  const year = now.getFullYear() + (month > 12 ? 1 : 0)
  return `${year}年${((month - 1) % 12) + 1}月月赛`
}

export function ScheduleBoard() {
  const [scores, setScores] = useState<Record<string, Score>>({})
  const [court, setCourt] = useState<string>("all")
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [me, setMe] = useState<PublicUser | null>(null)
  const [loginOpen, setLoginOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [title, setTitle] = useState(nextMonthTitle)
  const [formError, setFormError] = useState("")
  const [pending, setPending] = useState(false)

  useEffect(() => {
    let stop = false
    async function pull() {
      try {
        const [listResponse, sessionResponse] = await Promise.all([
          fetch("/api/tournaments", { cache: "no-store" }),
          fetch("/api/session", { cache: "no-store" }),
        ])
        if (stop) return
        const list: { tournaments?: Tournament[] } = listResponse.ok ? await listResponse.json() : { tournaments: [] }
        const session: { user?: PublicUser | null } = sessionResponse.ok ? await sessionResponse.json() : { user: null }
        const items = list.tournaments ?? []
        setTournaments((current) => (JSON.stringify(current) === JSON.stringify(items) ? current : items))
        const nextUser = session.user ?? null
        setMe((current) => {
          if (!current && !nextUser) return current
          if (
            current &&
            nextUser &&
            current.id === nextUser.id &&
            current.role === nextUser.role &&
            JSON.stringify(current.courts) === JSON.stringify(nextUser.courts)
          ) {
            return current
          }
          return nextUser
        })
        const current = selectedId && items.some((item) => item.id === selectedId) ? selectedId : items[0]?.id ?? null
        if (current !== selectedId) setSelectedId(current)
        if (!current) return
        const scoreResponse = await fetch(`/api/scores?tournament=${encodeURIComponent(current)}`, { cache: "no-store" })
        if (!scoreResponse.ok || stop) return
        const body: { scores?: Record<string, Score> } = await scoreResponse.json()
        if (stop) return
        const nextScores = body.scores ?? {}
        setScores((existing) => (JSON.stringify(existing) === JSON.stringify(nextScores) ? existing : nextScores))
      } catch {
        return
      }
    }
    void pull()
    const timer = window.setInterval(() => void pull(), 2000)
    return () => {
      stop = true
      window.clearInterval(timer)
    }
  }, [selectedId])

  const selected = tournaments.find((item) => item.id === selectedId) ?? null
  const columns = sheets(scores).filter((item) => court === "all" || item.id === court)

  async function createEdition() {
    setPending(true)
    setFormError("")
    try {
      const response = await fetch("/api/tournaments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title }),
      })
      const body: { tournament?: Tournament; error?: string } = await response.json().catch(() => ({}))
      if (!response.ok || !body.tournament) {
        setFormError(body.error ?? "没建成")
        return
      }
      setSelectedId(body.tournament.id)
      setCreateOpen(false)
      setTitle(nextMonthTitle())
    } catch {
      setFormError("没建成")
    } finally {
      setPending(false)
    }
  }

  async function archiveEdition() {
    setPending(true)
    setFormError("")
    try {
      const response = await fetch("/api/tournaments/archive", { method: "POST" })
      const body: { error?: string } = await response.json().catch(() => ({}))
      if (!response.ok) {
        setFormError(body.error ?? "没归档")
        return
      }
      setArchiveOpen(false)
    } catch {
      setFormError("没归档")
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="mx-auto grid min-h-screen w-full max-w-7xl gap-4 px-3 py-4 sm:px-5 sm:py-6 xl:grid-cols-[minmax(0,1fr)_260px]">
      <aside className="scoreboard h-fit rounded-3xl p-4 xl:sticky xl:top-4 xl:order-2">
        <h2 className="font-bold text-[#ffe14a]">月赛历史</h2>
        {me?.role === "admin" ? (
          <div className="mt-3 grid gap-2">
            <Button type="button" className="h-11 bg-[#ffe14a] font-bold text-[#10240f] hover:bg-[#ffe14a]/90" onClick={() => setCreateOpen(true)}>
              新建月赛
            </Button>
            {selected?.status === "live" ? (
              <Button type="button" variant="outline" className="h-11 border-white/20 bg-transparent text-white hover:bg-white/10" onClick={() => setArchiveOpen(true)}>
                归档本届
              </Button>
            ) : null}
          </div>
        ) : (
          <button type="button" className="mt-3 text-sm font-bold text-[#ffe14a]" onClick={() => setLoginOpen(true)}>
            管理员登录后可新建
          </button>
        )}
        {formError && !createOpen && !archiveOpen ? <p className="mt-2 text-sm text-[#ffe14a]">{formError}</p> : null}
        <ul className="mt-3 space-y-2">
          {tournaments.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                aria-current={item.id === selectedId ? "true" : undefined}
                onClick={() => setSelectedId(item.id)}
                className={`w-full rounded-2xl px-3 py-2 text-left ${item.id === selectedId ? "bg-[#183224] ring-2 ring-[#ffe14a]" : "bg-[#10281d]"}`}
              >
                <span className="block font-bold text-white">{item.title}</span>
                <span className="text-xs text-white/60">{item.status === "live" ? "进行中" : "已归档"}</span>
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <section className="scoreboard overflow-hidden rounded-3xl xl:order-1">
        <header className="banner flex flex-wrap items-end justify-between gap-3 px-4 py-4 sm:px-6">
          <div>
            <p className="text-xs font-bold tracking-[0.28em] text-[#ffe14a]">ORDER OF PLAY</p>
            <h1 className="mt-1 text-2xl font-bold text-white sm:text-3xl">{selected?.title ?? "南方月赛赛程表"}</h1>
            {selected?.status === "archived" ? <p className="mt-1 text-sm text-[#ffe14a]">已归档，只显示比分</p> : null}
          </div>
          <Link href="/" className="text-sm font-bold text-[#ffe14a]">
            返回
          </Link>
        </header>
        <div className="flex gap-2 overflow-x-auto border-b border-white/10 bg-[#071910] px-3 py-2 lg:hidden">
          {[
            ["all", "全部场地"],
            ["1", "1号场"],
            ["2", "2号场"],
            ["3", "3号场"],
            ["4", "4号场"],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={court === id}
              onClick={() => setCourt(id)}
              className="event-tab h-10 shrink-0 rounded-full px-3 text-sm font-bold"
            >
              {label}
            </button>
          ))}
        </div>
        <div className={`grid grid-cols-1 ${court === "all" ? "md:grid-cols-2 xl:grid-cols-4" : ""}`}>
          {columns.map((column) => {
            const done = column.lines.filter((line) => line.done).length
            return (
              <section key={column.id} className="min-w-0 border-white/10 md:border-r md:last:border-r-0">
                <header className="sticky top-0 z-10 border-b border-[#ffe14a]/40 bg-[#124e38] px-3 py-2 text-white">
                  <div className="flex items-baseline justify-between gap-2">
                    <h2 className="text-lg font-bold text-[#ffe14a]">{column.title}</h2>
                    <p className="text-xs tabular-nums text-white/70">
                      {done}/{column.lines.length}
                    </p>
                  </div>
                  <p className="text-xs text-white/70">{column.event}</p>
                </header>
                {column.lines.map((line) => (
                  <MatchRow key={line.id} line={line} />
                ))}
              </section>
            )
          })}
        </div>
      </section>
      <LoginDialog open={loginOpen} onOpenChange={setLoginOpen} onSuccess={setMe} />
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建月赛</DialogTitle>
            <DialogDescription>正在进行的这一届会归档。新一届比分从零开始，名单先沿用上一届。</DialogDescription>
          </DialogHeader>
          <Input className="h-11" aria-label="月赛名称" value={title} onChange={(event) => setTitle(event.target.value)} />
          {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
              取消
            </Button>
            <Button type="button" disabled={pending} onClick={() => void createEdition()}>
              {pending ? "正在新建" : "新建"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>归档这一届？</DialogTitle>
            <DialogDescription>归档后不能再改分，赛程表里还能看。</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setArchiveOpen(false)}>
              先留着
            </Button>
            <Button type="button" disabled={pending} onClick={() => void archiveEdition()}>
              {pending ? "正在归档" : "归档"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  )
}
