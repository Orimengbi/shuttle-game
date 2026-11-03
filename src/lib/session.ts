import type { Courts, Fairness, FormatId, Points } from "@/lib/schedule";

export type MatchState = {
  round: number
  court: number
  a: number
  b: number
  scoreA: number
  scoreB: number
  done: boolean
}

export type Phase = "setup" | "review" | "play"

export type Session = {
  players: string[]
  format: FormatId
  courts: Courts
  points: Points
  byStrength: boolean
  middleRest: number | null
  matches: MatchState[]
  phase: "review" | "play"
  fairness: Fairness
}

export type Standing = {
  player: number
  wins: number
  losses: number
  pf: number
  pa: number
  diff: number
  played: number
}

const KEY = "qiren-zhuan-v1"

export function standings(matches: MatchState[]): Standing[] {
  const rows: Standing[] = Array.from({ length: 7 }, (_, player) => ({
    player,
    wins: 0,
    losses: 0,
    pf: 0,
    pa: 0,
    diff: 0,
    played: 0,
  }))
  const headToHead = new Map<string, number>()
  for (const match of matches) {
    if (!match.done || match.scoreA === match.scoreB) continue
    const aWon = match.scoreA > match.scoreB
    const winner = aWon ? match.a : match.b
    const loser = aWon ? match.b : match.a
    rows[winner].wins += 1
    rows[loser].losses += 1
    rows[match.a].pf += match.scoreA
    rows[match.a].pa += match.scoreB
    rows[match.b].pf += match.scoreB
    rows[match.b].pa += match.scoreA
    rows[match.a].played += 1
    rows[match.b].played += 1
    const key = `${winner}-${loser}`
    headToHead.set(key, (headToHead.get(key) ?? 0) + 1)
  }
  for (const row of rows) row.diff = row.pf - row.pa
  return rows.sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins
    if (b.diff !== a.diff) return b.diff - a.diff
    if (b.pf !== a.pf) return b.pf - a.pf
    const ab = headToHead.get(`${a.player}-${b.player}`) ?? 0
    const ba = headToHead.get(`${b.player}-${a.player}`) ?? 0
    if (ab !== ba) return ba - ab
    return a.player - b.player
  })
}

export function rankOf(rows: Standing[], index: number): number {
  const row = rows[index]
  for (let i = index - 1; i >= 0; i--) {
    const previous = rows[i]
    if (previous.wins !== row.wins || previous.diff !== row.diff || previous.pf !== row.pf) {
      return index + 1
    }
  }
  return index === 0 ? 1 : rankOf(rows, index - 1)
}

export function scheduleText(session: Pick<Session, "players" | "format" | "courts" | "points" | "matches">): string {
  const title = session.format === "full" ? "全循环，每人 6 场" : "半循环，每人 4 场"
  const lines = [
    "七人转 · 羽毛球单打",
    `${title} · ${session.courts} 片场 · ${session.points} 分`,
    `选手：${session.players.join("、")}`,
    "",
  ]
  const roundIds = [...new Set(session.matches.map((match) => match.round))]
  for (const round of roundIds) {
    const group = session.matches.filter((match) => match.round === round)
    const playing = new Set(group.flatMap((match) => [match.a, match.b]))
    const resting = session.players.filter((_, index) => !playing.has(index))
    const label = session.courts === 1 ? `第 ${round + 1} 场` : `第 ${round + 1} 轮`
    if (session.courts === 1) {
      const match = group[0]
      const score = match.done ? `  ${match.scoreA}:${match.scoreB}` : ""
      lines.push(`${label}  ${session.players[match.a]} vs ${session.players[match.b]}${score}`)
    } else {
      lines.push(label)
      for (const match of group) {
        const score = match.done ? `  ${match.scoreA}:${match.scoreB}` : ""
        lines.push(
          `  场地 ${match.court + 1}  ${session.players[match.a]} vs ${session.players[match.b]}${score}`
        )
      }
    }
    if (resting.length > 0) lines.push(`  休息  ${resting.join("、")}`)
  }
  const done = session.matches.some((match) => match.done)
  if (done) {
    lines.push("", "积分")
    const rows = standings(session.matches)
    rows.forEach((row, index) => {
      const diff = `${row.diff > 0 ? "+" : ""}${row.diff}`
      lines.push(
        `${rankOf(rows, index)}  ${session.players[row.player]}  ${row.wins}胜${row.losses}负  净胜${diff}`
      )
    })
  }
  return lines.join("\n")
}

function isPoints(value: unknown): value is Points {
  return value === 11 || value === 15 || value === 21
}

function isSession(value: unknown): value is Session {
  if (!value || typeof value !== "object") return false
  const session = value as Session
  if (!Array.isArray(session.players) || session.players.length !== 7) return false
  if (!session.players.every((name) => typeof name === "string")) return false
  if (session.format !== "full" && session.format !== "half") return false
  if (session.courts !== 1 && session.courts !== 2 && session.courts !== 3) return false
  if (!isPoints(session.points)) return false
  if (session.phase !== "review" && session.phase !== "play") return false
  if (!Array.isArray(session.matches) || session.matches.length === 0) return false
  if (!session.fairness || !Array.isArray(session.fairness.games)) return false
  return session.matches.every(
    (match) =>
      match &&
      Number.isInteger(match.a) &&
      Number.isInteger(match.b) &&
      Number.isInteger(match.round) &&
      Number.isInteger(match.scoreA) &&
      Number.isInteger(match.scoreB)
  )
}

export function loadSession(): Session | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    return isSession(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function saveSession(session: Session) {
  window.localStorage.setItem(KEY, JSON.stringify(session))
}

export function clearSession() {
  window.localStorage.removeItem(KEY)
}
