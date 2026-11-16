"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { ArrowLeftRight } from "lucide-react"

import { LoginDialog, PasswordDialog } from "@/components/auth-dialogs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { PublicUser } from "@/lib/auth-types"
import {
  RELAY_CAP,
  RELAY_SWITCH,
  SINGLE_CAP,
  canCaptainScore,
  courtsOf,
  hasScores,
  lineupLocked,
  lineupOf,
  membersOf,
  onCourt,
  pairLabel,
  sideLineup,
  relaysDone,
  rosterReady,
  segmentMax,
  standings,
  switched,
  type RelayEvent,
  type RelayFixture,
  type RelaySegment,
  type RelaySegmentScore,
  type RelayTeam,
} from "@/lib/relay"

function emptyTeam(): RelayTeam {
  return {
    id: crypto.randomUUID(),
    name: "",
    members: ["", "", "", "", "", "", "", "", "", ""],
    r1xd: ["", ""],
    r1md: ["", ""],
    r2md: ["", ""],
    r2xd: ["", ""],
    ms: "",
    ws: "",
  }
}

function teamPayload(team: RelayTeam) {
  return {
    id: team.id,
    name: team.name,
    members: team.members,
    r1xd: team.r1xd,
    r1md: team.r1md,
    r2md: team.r2md,
    r2xd: team.r2xd,
    ms: team.ms,
    ws: team.ws,
  }
}

function serverOf(score: RelaySegmentScore): "home" | "away" {
  return score.server === "away" ? "away" : "home"
}

function applySegment(
  score: RelaySegmentScore,
  side: "home" | "away",
  delta: number,
  kind: "relay" | "single"
): RelaySegmentScore | null {
  const max = segmentMax(score.home, score.away, side, kind)
  const current = side === "home" ? score.home : score.away
  const nextValue = Math.max(0, Math.min(max, current + delta))
  if (nextValue === current) return null
  const mark = side === "home" ? "h" : "a"
  const first = score.first === "away" ? "away" : "home"
  const rally = typeof score.rally === "string" ? score.rally : ""
  if (delta > 0) {
    const nextRally = rally.length === score.home + score.away || score.home + score.away === 0 ? rally + mark : ""
    return { ...score, [side]: nextValue, server: side, first, rally: nextRally, done: false }
  }
  let server = serverOf(score)
  let nextRally = rally
  if (rally.endsWith(mark)) {
    nextRally = rally.slice(0, -1)
    const last = nextRally[nextRally.length - 1]
    server = last === "h" ? "home" : last === "a" ? "away" : first
  } else if (server === side) {
    server = side === "home" ? "away" : "home"
  }
  return { ...score, [side]: nextValue, server, first, rally: nextRally, done: false }
}

export function RelayApp() {
  const [event, setEvent] = useState<RelayEvent | null>(null)
  const [me, setMe] = useState<PublicUser | null>(null)
  const [sessionReady, setSessionReady] = useState(false)
  const [loginOpen, setLoginOpen] = useState(false)
  const [passwordOpen, setPasswordOpen] = useState(false)
  const [teams, setTeams] = useState<RelayTeam[]>([emptyTeam(), emptyTeam()])
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [captains, setCaptains] = useState<{ teamId: string; teamName: string; username: string; password: string }[]>([])
  const [startInput, setStartInput] = useState("")
  const [pending, setPending] = useState(false)
  const [fixtureId, setFixtureId] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const writing = useRef(0)

  useEffect(() => {
    let stop = false
    async function pull() {
      if (writing.current > 0) return
      try {
        const [eventResponse, sessionResponse] = await Promise.all([
          fetch("/api/relay", { cache: "no-store" }),
          fetch("/api/session", { cache: "no-store" }),
        ])
        if (stop) return
        const sessionBody: { user?: PublicUser | null } = sessionResponse.ok ? await sessionResponse.json() : { user: null }
        const nextUser = sessionBody.user ?? null
        setMe(nextUser)
        setSessionReady(true)
        if (eventResponse.ok) {
          const body: { event?: RelayEvent } = await eventResponse.json()
          if (body.event) {
            setEvent((current) => (JSON.stringify(current) === JSON.stringify(body.event) ? current : body.event!))
            setTeams((current) => (body.event!.fixtures.length > 0 ? current : body.event!.teams.length > 0 && current.every((team) => !team.name) ? body.event!.teams : current))
            setStartInput((current) => current || toStartInput(body.event?.startsAt ?? null))
          }
        }
        if (nextUser?.role === "admin") {
          const accountsResponse = await fetch("/api/relay/captains", { cache: "no-store" })
          if (accountsResponse.ok) {
            const accountsBody: { accounts?: { teamId: string; teamName: string; username: string; password: string }[] } = await accountsResponse.json()
            setCaptains(accountsBody.accounts ?? [])
          }
        }
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
  }, [])

  const admin = me?.role === "admin"
  const locked = lineupLocked(event?.startsAt)
  const fixture = event?.fixtures.find((item) => item.id === fixtureId) ?? null

  async function saveTeams() {
    setPending(true)
    setError("")
    const response = await fetch("/api/relay/teams", {
      method: "POST",
      headers: { "content-type": "application/json" },
        body: JSON.stringify({ teams: teams.map(teamPayload) }),
    })
    const body: { event?: RelayEvent; error?: string } = await response.json().catch(() => ({}))
    setPending(false)
    if (!response.ok || !body.event) {
      setError(body.error ?? "没保存")
      return
    }
    setEvent(body.event)
    setTeams(body.event.teams)
  }

  async function generate() {
    setPending(true)
    setError("")
    const saved = await fetch("/api/relay/teams", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ teams: teams.map(teamPayload) }),
    })
    const savedBody: { event?: RelayEvent; error?: string } = await saved.json().catch(() => ({}))
    if (!saved.ok || !savedBody.event) {
      setPending(false)
      setError(savedBody.error ?? "没保存")
      return
    }
    const response = await fetch("/api/relay/generate", { method: "POST" })
    const body: { event?: RelayEvent; error?: string } = await response.json().catch(() => ({}))
    setPending(false)
    if (!response.ok || !body.event) {
      setEvent(savedBody.event)
      setTeams(savedBody.event.teams)
      setError(body.error ?? "没生成")
      return
    }
    setEvent(body.event)
    setTeams(body.event.teams)
    setEditing(false)
  }

  async function send(nextFixture: RelayFixture, segment: RelaySegment, score: RelaySegmentScore) {
    if (!event) return
    writing.current += 1
    const previous = event
    setEvent({
      ...event,
      fixtures: event.fixtures.map((item) => (item.id === nextFixture.id ? { ...nextFixture, [segment]: score } : item)),
    })
    try {
      const response = await fetch("/api/relay/score", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fixtureId: nextFixture.id, segment, score }),
      })
      const body: { event?: RelayEvent; error?: string } = await response.json().catch(() => ({}))
      if (!response.ok || !body.event) {
        setEvent(previous)
        setError(body.error ?? "没记上")
        return
      }
      setEvent(body.event)
      setError("")
    } catch {
      setEvent(previous)
      setError("没记上")
    } finally {
      writing.current -= 1
    }
  }

  async function saveLineup(team: RelayTeam) {
    writing.current += 1
    setError("")
    try {
      const response = await fetch("/api/relay/lineup", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          teamId: team.id,
          r1xd: team.r1xd,
          r1md: team.r1md,
          r2md: team.r2md,
          r2xd: team.r2xd,
          ms: team.ms,
          ws: team.ws,
        }),
      })
      const body: { event?: RelayEvent; error?: string } = await response.json().catch(() => ({}))
      if (!response.ok || !body.event) {
        setNotice("")
        setError(body.error ?? "出阵没保存")
        return
      }
      setEvent(body.event)
      setNotice("出阵已保存")
    } catch {
      setError("出阵没保存")
    } finally {
      writing.current -= 1
    }
  }

  if (!sessionReady) return <main className="min-h-screen" />

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-4 py-5 sm:px-6 sm:py-8">
      <header className="banner relative mb-4 overflow-hidden rounded-3xl">
        <div className="court-grid pointer-events-none absolute inset-0 opacity-70" />
        <div className="relative px-5 py-4 sm:px-6">
          <p className="text-xs font-bold tracking-[0.22em] text-[#ffe14a]">11月17日 · 四片场地</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-white sm:text-4xl">{event?.title ?? "11月17日接力赛"}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/75">
            每组 10 人：4 对双打各 2 人，一共 8 人，再加男单、女单。单号场两对、双号场两对，四对都是不同的人。单号场先混双后男双，双号场先男双后混双，先到 21 换下一对，先到 42 结束。然后男单、女单各抢 21。总分 126。
          </p>
        </div>
      </header>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link href="/board" className="text-sm font-bold text-[#ffe14a]">
          赛程表
        </Link>
        {me ? <span className="text-sm text-white/70">{me.role === "admin" ? "管理" : me.role === "captain" ? "队长" : "记分员"} · {me.username}</span> : null}
        {me?.role === "admin" ? (
          <Button type="button" variant="outline" className="h-11 border-white/20 bg-transparent text-white" onClick={() => setPasswordOpen(true)}>
            修改密码
          </Button>
        ) : null}
        {me ? (
          <Button type="button" variant="ghost" className="h-11 text-white" onClick={() => void fetch("/api/logout", { method: "POST" }).then(() => setMe(null))}>
            退出
          </Button>
        ) : (
          <Button type="button" className="h-11" onClick={() => setLoginOpen(true)}>
            登录
          </Button>
        )}
      </div>
      {error ? <p className="mb-3 rounded-2xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p> : null}
      {notice ? <p className="mb-3 text-sm font-bold text-[#ffe14a]">{notice}</p> : null}
      {event ? <StartBar admin={admin} startsAt={event.startsAt} value={startInput} onChange={setStartInput} onSaved={(next) => { setEvent(next); setNotice("开赛时间已保存"); setError("") }} onError={(message) => { setNotice(""); setError(message) }} /> : null}
      {admin && captains.length > 0 ? <CaptainList accounts={captains} /> : null}
      {admin && event && event.fixtures.length > 0 && !hasScores(event) && !locked ? (
        <button
          type="button"
          className="mb-3 text-sm font-bold text-[#ffe14a]"
          onClick={() => {
            setTeams(event.teams)
            setEditing(true)
            setFixtureId(null)
          }}
        >
          修改队伍
        </button>
      ) : null}
      {admin && event && event.fixtures.length > 0 && !editing && !locked ? (
        <SheetBar
          ready={rosterReady(event)}
          locked={hasScores(event)}
          onDone={(next) => {
            setEvent(next)
            setTeams(next.teams)
            setNotice("人员已导入")
            setError("")
          }}
          onError={(message) => {
            setNotice("")
            setError(message)
          }}
        />
      ) : null}
      {event && event.fixtures.length > 0 && !editing ? (
        <RelayPlay
          event={event}
          fixture={fixture}
          me={me}
          locked={locked}
          onOpen={setFixtureId}
          onScore={(item, segment, score) => void send(item, segment, score)}
          onLineup={(team) => void saveLineup(team)}
        />
      ) : !event ? (
        <p className="text-sm text-white/70">加载中</p>
      ) : admin ? (
        <TeamEditor teams={teams} pending={pending} onChange={setTeams} onSave={() => void saveTeams()} onGenerate={() => void generate()} />
      ) : (
        <p className="text-sm text-white/80">队伍还没录入。管理员登录后才能排这一届。</p>
      )}
      <LoginDialog open={loginOpen} onOpenChange={setLoginOpen} onSuccess={setMe} />
      <PasswordDialog open={passwordOpen} onOpenChange={setPasswordOpen} />
    </main>
  )
}

function TeamEditor({
  teams,
  pending,
  onChange,
  onSave,
  onGenerate,
}: {
  teams: RelayTeam[]
  pending: boolean
  onChange: (teams: RelayTeam[]) => void
  onSave: () => void
  onGenerate: () => void
}) {
  function update(id: string, patch: Partial<RelayTeam>) {
    onChange(teams.map((team) => (team.id === id ? { ...team, ...patch } : team)))
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-white/75">每组 10 人。4 对双打要填 8 个人：单号场混双、单号场男双、双号场男双、双号场混双，每对两个人。再加上男单和女单。带🌸的是女生。</p>
      {teams.map((team, index) => (
        <section key={team.id} className="scoreboard rounded-3xl p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="font-bold text-[#ffe14a]">第 {index + 1} 队</h2>
            {teams.length > 2 ? (
              <button type="button" className="text-sm text-white/60" onClick={() => onChange(teams.filter((item) => item.id !== team.id))}>
                删除
              </button>
            ) : null}
          </div>
          <label className="grid gap-1 text-sm text-white/80">
            队伍名称
            <Input className="h-11 bg-[#10281d] text-white" value={team.name} onChange={(event) => update(team.id, { name: event.target.value })} />
          </label>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {team.members.map((member, memberIndex) => (
              <label key={memberIndex} className="grid gap-1 text-sm text-white/80">
                队员 {memberIndex + 1}
                <Input
                  className="h-11 bg-[#10281d] text-white"
                  value={member}
                  onChange={(event) => {
                    const members = [...team.members]
                    members[memberIndex] = event.target.value
                    update(team.id, { members })
                  }}
                />
              </label>
            ))}
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <PairSelect label="单号场混双" team={team} value={team.r1xd} onChange={(r1xd) => update(team.id, { r1xd })} />
            <PairSelect label="单号场男双" team={team} value={team.r1md} onChange={(r1md) => update(team.id, { r1md })} />
            <PairSelect label="双号场男双" team={team} value={team.r2md} onChange={(r2md) => update(team.id, { r2md })} />
            <PairSelect label="双号场混双" team={team} value={team.r2xd} onChange={(r2xd) => update(team.id, { r2xd })} />
            <SlotSelect label="男单" team={team} value={team.ms} onChange={(ms) => update(team.id, { ms })} />
            <SlotSelect label="女单" team={team} value={team.ws} onChange={(ws) => update(team.id, { ws })} />
          </div>
        </section>
      ))}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" className="h-11 border-white/20 bg-transparent text-white" onClick={() => onChange([...teams, emptyTeam()])}>
          加一支队伍
        </Button>
        <Button type="button" className="h-11" disabled={pending} onClick={onGenerate}>
          {pending ? "正在生成" : "生成循环赛"}
        </Button>
        <button type="button" className="text-sm text-white/60" onClick={onSave}>
          只保存名单
        </button>
      </div>
    </div>
  )
}

function SheetBar({
  ready,
  locked,
  onDone,
  onError,
}: {
  ready: boolean
  locked: boolean
  onDone: (event: RelayEvent) => void
  onError: (message: string) => void
}) {
  const [pending, setPending] = useState(false)
  async function upload(file: File) {
    setPending(true)
    try {
      const body = new FormData()
      body.append("file", file)
      const response = await fetch("/api/relay/sheet", { method: "POST", body })
      const payload: { event?: RelayEvent; error?: string } = await response.json().catch(() => ({}))
      if (!response.ok || !payload.event) {
        onError(payload.error ?? "没导入")
        return
      }
      onDone(payload.event)
    } catch {
      onError("没导入")
    } finally {
      setPending(false)
    }
  }
  return (
    <div className="mb-4 rounded-3xl border border-[#ffe14a]/40 bg-[#10281d] px-4 py-3">
      <p className="text-sm leading-6 text-white/80">
        {ready
          ? "人员已经在对阵里。还可以再下载表格核对。"
          : "名单已经分好组。下载对阵表时，4 对双打各填 2 个人，一共 8 人，再填男单和女单。同一组每一行要一致。"}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <a href="/api/relay/sheet" className="inline-flex h-11 items-center rounded-full bg-[#ffe14a] px-4 text-sm font-bold text-[#10240f]">
          下载对阵表
        </a>
        {locked ? null : (
          <label className="inline-flex h-11 cursor-pointer items-center rounded-full border border-[#ffe14a] px-4 text-sm font-bold text-[#ffe14a]">
            {pending ? "正在导入" : "导入对阵表"}
            <input
              type="file"
              accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="sr-only"
              disabled={pending}
              onChange={(input) => {
                const file = input.target.files?.[0]
                input.target.value = ""
                if (file) void upload(file)
              }}
            />
          </label>
        )}
      </div>
    </div>
  )
}

function mayScore(me: PublicUser | null, event: RelayEvent, fixture: RelayFixture): boolean {
  if (!rosterReady(event)) return false
  if (me?.role === "admin" || me?.role === "scorer") return true
  if (me?.role === "captain" && me.teamId) return canCaptainScore(event.startsAt, me.teamId, fixture)
  return false
}

function fixtureLineups(event: RelayEvent, teamId: string) {
  return event.fixtures.filter((fixture) => {
    const lineup = fixture.home === teamId ? fixture.homeLineup : fixture.away === teamId ? fixture.awayLineup : null
    return Boolean(lineup)
  })
}

function RoundLineups({ event, teamId }: { event: RelayEvent; teamId: string }) {
  const rows = event.fixtures
    .filter((fixture) => fixture.home === teamId || fixture.away === teamId)
    .sort((left, right) => left.round - right.round || left.courtPair - right.courtPair)
  return (
    <div className="mt-3 space-y-3 text-sm text-white/80">
      {rows.map((fixture) => {
        const lineup = fixture.home === teamId ? fixture.homeLineup : fixture.awayLineup
        const opponentId = fixture.home === teamId ? fixture.away : fixture.home
        const opponent = event.teams.find((team) => team.id === opponentId)?.name ?? ""
        if (!lineup) return null
        return (
          <div key={fixture.id}>
            <p className="font-bold text-[#ffe14a]">第 {fixture.round} 轮 · 对 {opponent}</p>
            <PairLine label="单号场混双" pair={lineup.r1xd} />
            <PairLine label="单号场男双" pair={lineup.r1md} />
            <p>男单：{lineup.ms || "出场未定"}</p>
            <PairLine label="双号场男双" pair={lineup.r2md} />
            <PairLine label="双号场混双" pair={lineup.r2xd} />
            <p>女单：{lineup.ws || "出场未定"}</p>
          </div>
        )
      })}
    </div>
  )
}

function PairLine({ label, pair }: { label: string; pair: [string, string] }) {
  return (
    <div>
      <p className="text-white/60">{label}</p>
      <div className="mt-1 grid grid-cols-2 gap-2">
        <p>1号 {pair[0] || "未定"}</p>
        <p>2号 {pair[1] || "未定"}</p>
      </div>
    </div>
  )
}

function canEditLineup(me: PublicUser | null, teamId: string, locked: boolean): boolean {
  if (locked || !me) return false
  if (me.role === "admin") return true
  return me.role === "captain" && me.teamId === teamId
}

function LineupForm({ team, onSave }: { team: RelayTeam; onSave: (team: RelayTeam) => void }) {
  const [draft, setDraft] = useState(team)
  function patch(next: Partial<RelayTeam>) {
    setDraft((current) => ({ ...current, ...next }))
  }
  return (
    <div className="mt-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <PairSelect label="单号场混双" team={draft} value={draft.r1xd} onChange={(r1xd) => patch({ r1xd })} />
        <PairSelect label="单号场男双" team={draft} value={draft.r1md} onChange={(r1md) => patch({ r1md })} />
        <PairSelect label="双号场男双" team={draft} value={draft.r2md} onChange={(r2md) => patch({ r2md })} />
        <PairSelect label="双号场混双" team={draft} value={draft.r2xd} onChange={(r2xd) => patch({ r2xd })} />
        <SlotSelect label="男单" team={draft} value={draft.ms} onChange={(ms) => patch({ ms })} />
        <SlotSelect label="女单" team={draft} value={draft.ws} onChange={(ws) => patch({ ws })} />
      </div>
      <Button type="button" className="mt-3 h-11" onClick={() => onSave(draft)}>
        保存出阵
      </Button>
    </div>
  )
}

function usedNames(team: RelayTeam, current: string): Set<string> {
  return new Set(lineupOf(team).filter((name) => name && name !== current))
}

function SlotSelect({ label, team, value, onChange }: { label: string; team: RelayTeam; value: string; onChange: (value: string) => void }) {
  const used = usedNames(team, value)
  const options = membersOf(team).filter((name) => name && (!used.has(name) || name === value))
  return (
    <label className="grid gap-1 text-sm text-white/80">
      {label}
      <select className="h-11 rounded-md border border-white/15 bg-[#10281d] px-2 text-white" value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">未选</option>
        {options.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
    </label>
  )
}

function PairSelect({
  label,
  team,
  value,
  onChange,
}: {
  label: string
  team: RelayTeam
  value: [string, string]
  onChange: (value: [string, string]) => void
}) {
  return (
    <div className="sm:col-span-2">
      <p className="mb-1 text-sm text-white/80">{label}</p>
      <div className="grid grid-cols-2 gap-2">
        <SlotSelect label="1号" team={team} value={value[0]} onChange={(next) => onChange([next, value[1]])} />
        <SlotSelect label="2号" team={team} value={value[1]} onChange={(next) => onChange([value[0], next])} />
      </div>
    </div>
  )
}

function toStartInput(value: string | null): string {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  const pad = (part: number) => String(part).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function formatWhen(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value))
}

function parseStart(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function sameDay(left: Date, right: Date): boolean {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate()
}

function monthCells(cursor: Date): (Date | null)[] {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
  const lead = (first.getDay() + 6) % 7
  const count = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate()
  const cells: (Date | null)[] = Array.from({ length: lead }, () => null)
  for (let day = 1; day <= count; day += 1) cells.push(new Date(cursor.getFullYear(), cursor.getMonth(), day))
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

function StartPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const selected = parseStart(value)
  const [open, setOpen] = useState(false)
  const [cursor, setCursor] = useState(() => selected ?? new Date())
  const [hour, setHour] = useState(selected?.getHours() ?? 19)
  const [minute, setMinute] = useState(selected?.getMinutes() ?? 0)

  function choose(day: Date, nextHour = hour, nextMinute = minute) {
    const pad = (part: number) => String(part).padStart(2, "0")
    onChange(`${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}T${pad(nextHour)}:${pad(nextMinute)}`)
    setHour(nextHour)
    setMinute(nextMinute)
  }

  const today = new Date()
  return (
    <div className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => {
          const next = parseStart(value)
          if (next) {
            setCursor(next)
            setHour(next.getHours())
            setMinute(next.getMinutes())
          }
          setOpen((current) => !current)
        }}
        className="h-11 rounded-full border border-[#ffe14a] bg-[#071910] px-4 text-sm font-bold text-[#ffe14a]"
      >
        {selected ? `${selected.getMonth() + 1}月${selected.getDate()}日 ${String(selected.getHours()).padStart(2, "0")}:${String(selected.getMinutes()).padStart(2, "0")}` : "选择开赛时间"}
      </button>
      {open ? (
        <div className="scoreboard absolute left-0 z-20 mt-2 w-[20rem] max-w-[calc(100vw-2rem)] rounded-3xl p-3">
          <div className="mb-2 flex items-center justify-between">
            <button type="button" className="h-11 rounded-full px-3 text-sm font-bold text-[#ffe14a]" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>
              上个月
            </button>
            <p className="font-bold text-white">{cursor.getFullYear()}年{cursor.getMonth() + 1}月</p>
            <button type="button" className="h-11 rounded-full px-3 text-sm font-bold text-[#ffe14a]" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>
              下个月
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs text-white/50">
            {["一", "二", "三", "四", "五", "六", "日"].map((label) => (
              <span key={label} className="py-1">{label}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {monthCells(cursor).map((day, index) =>
              day ? (
                <button
                  key={day.toISOString()}
                  type="button"
                  onClick={() => choose(day)}
                  className={`h-11 rounded-full text-sm font-bold ${selected && sameDay(day, selected) ? "bg-[#ffe14a] text-[#10240f]" : sameDay(day, today) ? "text-[#ffe14a]" : "text-white"}`}
                >
                  {day.getDate()}
                </button>
              ) : (
                <span key={`empty-${index}`} />
              )
            )}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <p className="mb-1 text-xs text-white/70">时</p>
              <div className="grid max-h-36 grid-cols-4 gap-1 overflow-y-auto">
                {Array.from({ length: 24 }, (_, item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => (selected ? choose(selected, item, minute) : setHour(item))}
                    className={`h-8 rounded-full text-xs font-bold ${hour === item ? "bg-[#ffe14a] text-[#10240f]" : "bg-[#071910] text-white"}`}
                  >
                    {String(item).padStart(2, "0")}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-1 text-xs text-white/70">分</p>
              <div className="grid max-h-36 grid-cols-4 gap-1 overflow-y-auto">
                {Array.from({ length: 60 }, (_, item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => (selected ? choose(selected, hour, item) : setMinute(item))}
                    className={`h-8 rounded-full text-xs font-bold ${minute === item ? "bg-[#ffe14a] text-[#10240f]" : "bg-[#071910] text-white"}`}
                  >
                    {String(item).padStart(2, "0")}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function StartBar({
  admin,
  startsAt,
  value,
  onChange,
  onSaved,
  onError,
}: {
  admin: boolean
  startsAt: string | null
  value: string
  onChange: (value: string) => void
  onSaved: (event: RelayEvent) => void
  onError: (message: string) => void
}) {
  const [pending, setPending] = useState(false)
  const locked = lineupLocked(startsAt)
  const lockAt = startsAt ? new Date(new Date(startsAt).getTime() - 60 * 60 * 1000).toISOString() : null
  async function save() {
    setPending(true)
    try {
      const response = await fetch("/api/relay/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ startsAt: value }),
      })
      const body: { event?: RelayEvent; error?: string } = await response.json().catch(() => ({}))
      if (!response.ok || !body.event) {
        onError(body.error ?? "开赛时间没保存")
        return
      }
      onSaved(body.event)
    } catch {
      onError("开赛时间没保存")
    } finally {
      setPending(false)
    }
  }
  return (
    <section className="mb-4 rounded-3xl border border-[#ffe14a]/40 bg-[#10281d] px-4 py-3">
      <p className="text-sm leading-6 text-white/80">
        {startsAt && lockAt
          ? locked
            ? `开赛 ${formatWhen(startsAt)}。${formatWhen(lockAt)} 起出阵已锁定。开赛后，队伍账号可以给自己组记分。`
            : `开赛 ${formatWhen(startsAt)}。${formatWhen(lockAt)} 起不能再改出阵。开赛后，队伍账号可以给自己组记分。`
          : "还没定开赛时间。定了以后，开赛前 1 小时锁定出阵。开赛后，队伍账号可以给自己组记分。"}
      </p>
      {admin ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StartPicker value={value} onChange={onChange} />
          <Button type="button" className="h-11" disabled={pending} onClick={() => void save()}>
            {pending ? "正在保存" : "保存开赛时间"}
          </Button>
        </div>
      ) : null}
    </section>
  )
}

function CaptainList({ accounts }: { accounts: { teamId: string; teamName: string; username: string; password: string }[] }) {
  return (
    <section className="mb-4 scoreboard rounded-3xl p-4">
      <h2 className="font-bold text-[#ffe14a]">队伍账号</h2>
      <p className="mt-1 text-sm text-white/70">每队一个账号，只能改自己的出阵。把账号和密码发给该队。</p>
      <ul className="mt-3 space-y-2 text-sm text-white">
        {accounts.map((account) => (
          <li key={account.teamId} className="flex flex-wrap gap-x-4 gap-y-1">
            <span className="font-bold text-[#ffe14a]">{account.teamName}</span>
            <span>账号 {account.username}</span>
            <span>密码 {account.password}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function RelayPlay({
  event,
  fixture,
  me,
  locked,
  onOpen,
  onScore,
  onLineup,
}: {
  event: RelayEvent
  fixture: RelayFixture | null
  me: PublicUser | null
  locked: boolean
  onOpen: (id: string | null) => void
  onScore: (fixture: RelayFixture, segment: RelaySegment, score: RelaySegmentScore) => void
  onLineup: (team: RelayTeam) => void
}) {
  const table = standings(event)
  const teamName = new Map(event.teams.map((team) => [team.id, team]))
  if (fixture) {
    return (
      <FixtureBoard
        event={event}
        fixture={fixture}
        canScore={mayScore(me, event, fixture)}
        onBack={() => onOpen(null)}
        onScore={onScore}
      />
    )
  }
  const rounds = [...new Set(event.fixtures.map((item) => item.round))]
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {event.teams.map((team) => (
          <section key={team.id} className="scoreboard rounded-3xl p-4">
            <h2 className="font-bold text-[#ffe14a]">{team.name} · 10 人</h2>
            <p className="mt-2 text-sm leading-6 text-white">{membersOf(team).filter(Boolean).join("、")}</p>
            {team.lineupHidden ? (
              <p className="mt-3 text-sm text-white/60">出阵锁定后公开</p>
            ) : fixtureLineups(event, team.id).length > 0 ? (
              <RoundLineups event={event} teamId={team.id} />
            ) : canEditLineup(me, team.id, locked) ? (
              <LineupForm team={team} onSave={onLineup} />
            ) : (
              <div className="mt-3 space-y-2 text-sm text-white/80">
                <PairLine label="单号场混双" pair={team.r1xd} />
                <PairLine label="单号场男双" pair={team.r1md} />
                <PairLine label="双号场男双" pair={team.r2md} />
                <PairLine label="双号场混双" pair={team.r2xd} />
                <p>男单：{team.ms || "出场未定"}</p>
                <p>女单：{team.ws || "出场未定"}</p>
              </div>
            )}
          </section>
        ))}
      </div>
      <section className="leaderboard rounded-3xl p-4">
        <h2 className="font-bold text-[#ffe14a]">总分</h2>
        <p className="mt-1 text-xs text-white/60">两队同分看交手，三队及以上同分看总净胜分。满分一场 126。</p>
        <table className="mt-2 w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-white/50">
              <th className="pb-2">名次</th>
              <th className="pb-2">队伍</th>
              <th className="pb-2 text-right">总分</th>
              <th className="pb-2 text-right">净胜</th>
            </tr>
          </thead>
          <tbody>
            {table.map((row) => (
              <tr key={row.id} className="border-t border-white/10">
                <td className={`py-2 font-bold ${row.rank === 1 ? "text-[#ffe14a]" : ""}`}>{row.rank}</td>
                <td className="py-2 font-bold">{row.name}</td>
                <td className="py-2 text-right tabular-nums">{row.points}</td>
                <td className="py-2 text-right tabular-nums">{row.diff > 0 ? "+" : ""}{row.diff}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {rounds.map((round) => (
        <section key={round} className="space-y-2">
          <h2 className="font-bold text-white">第 {round} 轮</h2>
          {event.fixtures
            .filter((item) => item.round === round)
            .sort((left, right) => left.courtPair - right.courtPair)
            .map((item) => {
              const home = teamName.get(item.home)
              const away = teamName.get(item.away)
              const courts = courtsOf(item)
              const done = item.relay1.done && item.relay2.done && item.ms.done && item.ws.done
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onOpen(item.id)}
                  className="match-row flex w-full items-center justify-between gap-3 rounded-2xl px-3 py-3 text-left"
                >
                  <div>
                    <p className="text-xs text-[#ffe14a]">{courts.relay1.replace("号场", "")}、{courts.relay2} · 第 {item.wave} 批</p>
                    <p className="font-bold">{home?.name} 对 {away?.name}</p>
                  </div>
                  <span className="text-sm font-bold text-white/70">{done ? "已结束" : mayScore(me, event, item) ? "记分" : "查看"}</span>
                </button>
              )
            })}
        </section>
      ))}
    </div>
  )
}

function FixtureBoard({
  event,
  fixture,
  canScore,
  onBack,
  onScore,
}: {
  event: RelayEvent
  fixture: RelayFixture
  canScore: boolean
  onBack: () => void
  onScore: (fixture: RelayFixture, segment: RelaySegment, score: RelaySegmentScore) => void
}) {
  const home = event.teams.find((team) => team.id === fixture.home)
  const away = event.teams.find((team) => team.id === fixture.away)
  const homeLine = sideLineup(event, fixture, "home")
  const awayLine = sideLineup(event, fixture, "away")
  const courts = courtsOf(fixture)
  if (!home || !away) return null
  const ready = relaysDone(fixture)
  const players = (team: RelayTeam, lineup: ReturnType<typeof sideLineup>, segment: "relay1" | "relay2" | "ms" | "ws") => {
    if (team.lineupHidden) return "锁定后公开"
    if (segment === "ms") return lineup.ms || "出场未定"
    if (segment === "ws") return lineup.ws || "出场未定"
    return pairLabel(onCourt(lineup, segment, fixture[segment]))
  }
  return (
    <div className="space-y-4">
      <button type="button" className="text-sm font-bold text-[#ffe14a]" onClick={onBack}>
        返回对阵
      </button>
      <h2 className="text-xl font-bold text-white">
        第 {fixture.round} 轮 · {home.name} 对 {away.name}
      </h2>
      <SegmentBoard
        kicker={`项目一 · ${courts.relay1} · ${switched(fixture.relay1) ? "第2棒男双" : "第1棒混双"}`}
        homeTeam={home.name}
        awayTeam={away.name}
        homePlayers={players(home, homeLine, "relay1")}
        awayPlayers={players(away, awayLine, "relay1")}
        score={fixture.relay1}
        kind="relay"
        canScore={canScore}
        onChange={(score) => onScore(fixture, "relay1", score)}
      />
      <SegmentBoard
        kicker={`项目二 · ${courts.relay2} · ${switched(fixture.relay2) ? "第2棒混双" : "第1棒男双"}`}
        homeTeam={home.name}
        awayTeam={away.name}
        homePlayers={players(home, homeLine, "relay2")}
        awayPlayers={players(away, awayLine, "relay2")}
        score={fixture.relay2}
        kind="relay"
        canScore={canScore}
        onChange={(score) => onScore(fixture, "relay2", score)}
      />
      <SegmentBoard
        kicker={`男单 · ${courts.ms}`}
        homeTeam={home.name}
        awayTeam={away.name}
        homePlayers={players(home, homeLine, "ms")}
        awayPlayers={players(away, awayLine, "ms")}
        score={fixture.ms}
        kind="single"
        canScore={canScore && ready}
        locked={!ready}
        onChange={(score) => onScore(fixture, "ms", score)}
      />
      <SegmentBoard
        kicker={`女单 · ${courts.ws}`}
        homeTeam={home.name}
        awayTeam={away.name}
        homePlayers={players(home, homeLine, "ws")}
        awayPlayers={players(away, awayLine, "ws")}
        score={fixture.ws}
        kind="single"
        canScore={canScore && ready}
        locked={!ready}
        onChange={(score) => onScore(fixture, "ws", score)}
      />
    </div>
  )
}

function SegmentBoard({
  kicker,
  homeTeam,
  awayTeam,
  homePlayers,
  awayPlayers,
  score,
  kind,
  canScore,
  locked = false,
  onChange,
}: {
  kicker: string
  homeTeam: string
  awayTeam: string
  homePlayers: string
  awayPlayers: string
  score: RelaySegmentScore
  kind: "relay" | "single"
  canScore: boolean
  locked?: boolean
  onChange: (score: RelaySegmentScore) => void
}) {
  const [flipped, setFlipped] = useState(false)
  const cap = kind === "single" ? SINGLE_CAP : RELAY_CAP
  const reached = Math.max(score.home, score.away) >= cap && score.home !== score.away
  const showSwitch = kind === "relay" && switched(score) && !score.done && Math.max(score.home, score.away) === RELAY_SWITCH
  const sides = [
    { key: "home" as const, team: homeTeam, players: homePlayers, value: score.home },
    { key: "away" as const, team: awayTeam, players: awayPlayers, value: score.away },
  ]
  const view = flipped ? [sides[1], sides[0]] : sides
  return (
    <article className="scoreboard rounded-3xl p-4">
      <p className="text-xs font-bold tracking-[0.16em] text-[#ffe14a]">{kicker}</p>
      <div className="my-3 flex justify-center">
        <button type="button" className="swap-sides" aria-label="换边" aria-pressed={flipped} onClick={() => setFlipped((current) => !current)}>
          <ArrowLeftRight aria-hidden="true" />
        </button>
      </div>
      {locked ? <p className="mb-3 text-sm text-white/70">接力赛打完再开始单打。</p> : null}
      {showSwitch ? <p className="mb-3 rounded-2xl bg-[#ffe14a] px-3 py-2 text-sm font-bold text-[#10240f]">到 21 分了，2 分钟内换下一组。领先方先发球。</p> : null}
      <div className="grid grid-cols-2 gap-3">
        {view.map((item) => {
          const max = segmentMax(score.home, score.away, item.key, kind)
          const serving = !score.done && score.home + score.away > 0 && serverOf(score) === item.key
          return (
            <div key={item.key} className={`score-side rounded-2xl px-2 py-3 text-center ${serving ? "ahead" : ""}`}>
              {canScore && !score.done ? (
                <button type="button" className="w-full truncate text-sm font-bold" onClick={() => onChange({ ...score, server: item.key, first: score.home + score.away === 0 ? item.key : score.first })}>
                  {item.team}
                </button>
              ) : (
                <p className="truncate text-sm font-bold">
                  {item.team}
                  {score.done && item.value > (item.key === "home" ? score.away : score.home) ? " · 胜" : ""}
                </p>
              )}
              <p className="truncate text-xs text-white/70">{item.players}</p>
              <p className="score-num my-1 text-5xl font-bold">{item.value}</p>
              {canScore ? (
                <div className="grid grid-cols-2 gap-2">
                  <Button type="button" variant="outline" className="h-12 border-white/30 bg-transparent text-xl text-white" disabled={score.done || item.value === 0} onClick={() => { const next = applySegment(score, item.key, -1, kind); if (next) onChange(next) }}>
                    −
                  </Button>
                  <Button type="button" className="h-12 bg-[#ffe14a] text-xl font-bold text-[#10240f]" disabled={score.done || item.value >= max} onClick={() => { const next = applySegment(score, item.key, 1, kind); if (next) onChange(next) }}>
                    +
                  </Button>
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
      {canScore && !score.done ? (
        <Button type="button" className="mt-3 h-12 w-full bg-[#ffe14a] font-bold text-[#10240f]" disabled={!reached} onClick={() => onChange({ ...score, done: true })}>
          {reached ? "结束本场" : kind === "relay" ? "先到 42 分" : "先到 21 分，且不能平局"}
        </Button>
      ) : null}
      {canScore && score.done ? (
        <Button type="button" variant="outline" className="mt-3 h-11 w-full" onClick={() => onChange({ ...score, done: false })}>
          改回未结束
        </Button>
      ) : null}
    </article>
  )
}
