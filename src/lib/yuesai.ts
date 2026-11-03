export type EventId = "ms" | "md" | "xd"

export type MatchKind = "rr" | "semi" | "third" | "final"

export type RosterMatch = {
  id: string
  event: EventId
  round: number
  court: string
  a: number
  b: number
  kind: MatchKind
}

export type Score = {
  a: number
  b: number
  scoreA: number
  scoreB: number
  done: boolean
}

export type Standing = {
  id: number
  wins: number
  losses: number
  pf: number
  pa: number
  diff: number
  played: number
}

export const SINGLES = ["小沈", "景翔", "米立", "麦秋", "陈浩", "w.", "起床气"]

export const DOUBLES = [
  "木偶&龙武",
  "江江&小秦",
  "小路&小周",
  "中&小李",
  "阿海&ºLucas_ᶻ",
  "鹏&小戴",
]

export const MIXED_A = ["花花&小胖", "小郁&元气满满", "六月&蔡蔡", "一笑&东伟欧巴", "一飞&大海"]

export const MIXED_B = ["安安&滕波", "沈总&刘涛", "西西&谈渡", "幸运&郎英", "邓节妹&就酱"]

/** 1 号场，按出场顺序。已验证无人连打。 */
const SINGLES_ORDER: [number, number][] = [
  [2, 5],
  [1, 6],
  [0, 3],
  [4, 5],
  [1, 2],
  [3, 6],
  [0, 4],
  [1, 5],
  [2, 3],
  [4, 6],
  [0, 5],
  [1, 3],
  [2, 4],
  [0, 6],
  [3, 5],
  [1, 4],
  [0, 2],
  [5, 6],
  [3, 4],
  [0, 1],
  [2, 6],
]

/** 2 号场。 */
const DOUBLES_ORDER: [number, number][] = [
  [0, 1],
  [2, 3],
  [4, 5],
  [0, 2],
  [1, 3],
  [0, 4],
  [2, 5],
  [1, 4],
  [0, 3],
  [1, 5],
  [2, 4],
  [3, 5],
  [1, 2],
  [0, 5],
  [3, 4],
]

/** 3、4 号场同一轮各一场。两组用同一轮次结构。 */
const MIXED_ORDER: [number, number][] = [
  [0, 1],
  [2, 3],
  [0, 4],
  [1, 2],
  [3, 4],
  [0, 2],
  [1, 3],
  [2, 4],
  [0, 3],
  [1, 4],
]

export const POINTS: Record<EventId, number> = { ms: 15, md: 21, xd: 21 }

function listMatches(event: EventId, order: [number, number][], court: string): RosterMatch[] {
  return order.map(([a, b], index) => ({
    id: `${event}-${index + 1}`,
    event,
    round: index + 1,
    court,
    a,
    b,
    kind: "rr" as const,
  }))
}

export const SINGLES_MATCHES = listMatches("ms", SINGLES_ORDER, "1号场")
export const DOUBLES_MATCHES = listMatches("md", DOUBLES_ORDER, "2号场")

export const MIXED_MATCHES: RosterMatch[] = MIXED_ORDER.flatMap(([a, b], index) => {
  const round = index + 1
  return [
    { id: `xd-A-${round}`, event: "xd" as const, round, court: "3号场", a, b, kind: "rr" as const },
    { id: `xd-B-${round}`, event: "xd" as const, round, court: "4号场", a, b, kind: "rr" as const },
  ]
})

export function namesOf(event: EventId, group?: "A" | "B"): string[] {
  if (event === "ms") return SINGLES
  if (event === "md") return DOUBLES
  return group === "B" ? MIXED_B : MIXED_A
}

export function appearances(order: readonly (readonly [number, number])[], count: number): number[][] {
  const slots = Array.from({ length: count }, () => [] as number[])
  order.forEach(([a, b], index) => {
    slots[a].push(index)
    slots[b].push(index)
  })
  return slots
}

export function hasBackToBack(slots: number[][]): boolean {
  return slots.some((list) => list.some((value, index) => index > 0 && value - list[index - 1] === 1))
}

export function emptyScore(a: number, b: number): Score {
  return { a, b, scoreA: 0, scoreB: 0, done: false }
}

export function standings(ids: number[], matches: RosterMatch[], scores: Record<string, Score>): Standing[] {
  const rows = new Map<number, Standing>()
  for (const id of ids) {
    rows.set(id, { id, wins: 0, losses: 0, pf: 0, pa: 0, diff: 0, played: 0 })
  }
  for (const match of matches) {
    const score = scores[match.id]
    if (!score?.done || score.scoreA === score.scoreB) continue
    if (!rows.has(match.a) || !rows.has(match.b)) continue
    const aWon = score.scoreA > score.scoreB
    const winner = rows.get(aWon ? match.a : match.b)!
    const loser = rows.get(aWon ? match.b : match.a)!
    winner.wins += 1
    loser.losses += 1
    const sideA = rows.get(match.a)!
    const sideB = rows.get(match.b)!
    sideA.pf += score.scoreA
    sideA.pa += score.scoreB
    sideB.pf += score.scoreB
    sideB.pa += score.scoreA
    sideA.played += 1
    sideB.played += 1
  }
  for (const row of rows.values()) row.diff = row.pf - row.pa
  return [...rows.values()]
}

function beats(matches: RosterMatch[], scores: Record<string, Score>, a: number, b: number): boolean {
  for (const match of matches) {
    const score = scores[match.id]
    if (!score?.done || score.scoreA === score.scoreB) continue
    const players = [match.a, match.b]
    if (!players.includes(a) || !players.includes(b)) continue
    const winner = score.scoreA > score.scoreB ? match.a : match.b
    return winner === a
  }
  return false
}

function stronglyConnected(ids: number[], edge: (from: number, to: number) => boolean): number[][] {
  const index = new Map<number, number>()
  const low = new Map<number, number>()
  const stack: number[] = []
  const onStack = new Set<number>()
  const components: number[][] = []
  let stamp = 0
  const visit = (vertex: number) => {
    index.set(vertex, stamp)
    low.set(vertex, stamp)
    stamp += 1
    stack.push(vertex)
    onStack.add(vertex)
    for (const next of ids) {
      if (next === vertex || !edge(vertex, next)) continue
      if (!index.has(next)) {
        visit(next)
        low.set(vertex, Math.min(low.get(vertex)!, low.get(next)!))
      } else if (onStack.has(next)) {
        low.set(vertex, Math.min(low.get(vertex)!, index.get(next)!))
      }
    }
    if (low.get(vertex) === index.get(vertex)) {
      const component: number[] = []
      while (stack.length > 0) {
        const item = stack.pop()!
        onStack.delete(item)
        component.push(item)
        if (item === vertex) break
      }
      components.push(component)
    }
  }
  for (const id of ids) if (!index.has(id)) visit(id)
  return components
}

function byDiff(ids: number[], rows: Map<number, Standing>): number[] {
  return ids.slice().sort((a, b) => {
    const left = rows.get(a)!
    const right = rows.get(b)!
    if (right.diff !== left.diff) return right.diff - left.diff
    if (right.pf !== left.pf) return right.pf - left.pf
    return a - b
  })
}

export type RankResult = {
  order: number[]
  cycled: number[][]
}

export function rankPlayers(
  ids: number[],
  matches: RosterMatch[],
  scores: Record<string, Score>
): RankResult {
  const rows = new Map(standings(ids, matches, scores).map((row) => [row.id, row]))
  const wins = [...new Set(ids.map((id) => rows.get(id)!.wins))].sort((a, b) => b - a)
  const order: number[] = []
  const cycled: number[][] = []
  for (const win of wins) {
    const bucket = ids.filter((id) => rows.get(id)!.wins === win)
    const components = stronglyConnected(bucket, (from, to) => beats(matches, scores, from, to))
    for (const component of components) {
      if (component.length > 1) cycled.push(component.slice())
    }
    const componentOf = new Map<number, number>()
    components.forEach((component, index) => component.forEach((id) => componentOf.set(id, index)))
    const outgoing = components.map(() => [] as number[])
    const indegree = components.map(() => 0)
    for (const left of bucket) {
      for (const right of bucket) {
        if (left === right || !beats(matches, scores, left, right)) continue
        const from = componentOf.get(left)!
        const to = componentOf.get(right)!
        if (from === to || outgoing[from].includes(to)) continue
        outgoing[from].push(to)
        indegree[to] += 1
      }
    }
    const queue = components.map((_, index) => index).filter((index) => indegree[index] === 0)
    const placed: number[] = []
    while (queue.length > 0) {
      queue.sort((left, right) => {
        const a = byDiff(components[left], rows)[0]
        const b = byDiff(components[right], rows)[0]
        return rows.get(b)!.diff - rows.get(a)!.diff || a - b
      })
      const index = queue.shift()!
      placed.push(...(components[index].length > 1 ? byDiff(components[index], rows) : components[index]))
      for (const next of outgoing[index]) {
        indegree[next] -= 1
        if (indegree[next] === 0) queue.push(next)
      }
    }
    order.push(...(placed.length === bucket.length ? placed : byDiff(bucket, rows)))
  }
  return { order, cycled }
}

export function groupMatches(group: "A" | "B"): RosterMatch[] {
  return MIXED_MATCHES.filter((match) => match.id.includes(`-${group}-`))
}

export function groupDone(group: "A" | "B", scores: Record<string, Score>): boolean {
  return groupMatches(group).every((match) => scores[match.id]?.done)
}

export type KnockoutSlot = {
  id: string
  label: string
  court: string
  a: number | null
  b: number | null
  groupA: "A" | "B" | "W" | "L"
  groupB: "A" | "B" | "W" | "L"
}

function semiWinner(slot: "sf1" | "sf2", scores: Record<string, Score>): number | null {
  const score = scores[slot]
  if (!score?.done || score.scoreA === score.scoreB) return null
  return score.scoreA > score.scoreB ? score.a : score.b
}

function semiLoser(slot: "sf1" | "sf2", scores: Record<string, Score>): number | null {
  const score = scores[slot]
  if (!score?.done || score.scoreA === score.scoreB) return null
  return score.scoreA > score.scoreB ? score.b : score.a
}

export function knockout(scores: Record<string, Score>): KnockoutSlot[] {
  const rankA = groupDone("A", scores) ? rankPlayers([0, 1, 2, 3, 4], groupMatches("A"), scores).order : []
  const rankB = groupDone("B", scores) ? rankPlayers([0, 1, 2, 3, 4], groupMatches("B"), scores).order : []
  const a1 = rankA[0] ?? null
  const a2 = rankA[1] ?? null
  const b1 = rankB[0] ?? null
  const b2 = rankB[1] ?? null
  return [
    { id: "sf1", label: "半决赛 1", court: "3号场", a: a1, b: b2, groupA: "A", groupB: "B" },
    { id: "sf2", label: "半决赛 2", court: "4号场", a: b1, b: a2, groupA: "B", groupB: "A" },
    { id: "third", label: "三四名", court: "3号场", a: semiLoser("sf1", scores), b: semiLoser("sf2", scores), groupA: "L", groupB: "L" },
    { id: "final", label: "决赛", court: "3号场", a: semiWinner("sf1", scores), b: semiWinner("sf2", scores), groupA: "W", groupB: "W" },
  ]
}

function pairName(score: Score, id: number, leftGroup: "A" | "B"): string {
  const left = leftGroup === "A" ? MIXED_A : MIXED_B
  const right = leftGroup === "A" ? MIXED_B : MIXED_A
  return id === score.a ? left[score.a] : right[score.b]
}

export function slotName(slot: KnockoutSlot, side: "a" | "b", scores: Record<string, Score>): string {
  const id = side === "a" ? slot.a : slot.b
  if (slot.id === "sf1") return id === null ? (side === "a" ? "A1" : "B2") : side === "a" ? MIXED_A[id] : MIXED_B[id]
  if (slot.id === "sf2") return id === null ? (side === "a" ? "B1" : "A2") : side === "a" ? MIXED_B[id] : MIXED_A[id]
  const source = scores[side === "a" ? "sf1" : "sf2"]
  const wantWinner = slot.id === "final"
  if (!source?.done || source.scoreA === source.scoreB) return wantWinner ? "半决赛胜方" : "半决赛负方"
  const winner = source.scoreA > source.scoreB ? source.a : source.b
  const picked = wantWinner ? winner : winner === source.a ? source.b : source.a
  return pairName(source, picked, side === "a" ? "A" : "B")
}

function line(round: number, left: string, right: string, score?: Score): string {
  const result = score?.done ? `  ${score.scoreA}:${score.scoreB}` : ""
  return `${round}  ${left} VS ${right}${result}`
}

export function scheduleText(scores: Record<string, Score> = {}): string {
  const blocks = [
    "1号场 | 男单 | 抢15分 | 7人循环（无连打）",
    "选手：小沈、景翔、米立、麦秋、陈浩、w.、起床气",
    ...SINGLES_MATCHES.map((match) => line(match.round, SINGLES[match.a], SINGLES[match.b], scores[match.id])),
    "",
    "2号场 | 男双 | 抢21分 | 6组循环（无连打）",
    "队伍：木偶&龙武、江江&小秦、小路&小周、中&小李、阿海&ºLucas_ᶻ、鹏&小戴",
    ...DOUBLES_MATCHES.map((match) => line(match.round, DOUBLES[match.a], DOUBLES[match.b], scores[match.id])),
    "",
    "3、4号场 | 混双 | 抢21分 | 分组循环+淘汰（无连打）",
    "A组：花花&小胖、小郁&元气满满、六月&蔡蔡、一笑&东伟欧巴、一飞&大海",
    "B组：安安&滕波、沈总&刘涛、西西&谈渡、幸运&郎英、邓节妹&就酱",
    "各组前二。A1对B2，B1对A2。负方三四名，胜方决赛。",
    "胜场相同先看相互胜负；胜负套圈看总净胜分。",
  ]
  MIXED_ORDER.forEach(([a, b], index) => {
    const round = index + 1
    const left = scores[`xd-A-${round}`]
    const right = scores[`xd-B-${round}`]
    blocks.push(
      `${round}  3号 ${MIXED_A[a]} VS ${MIXED_A[b]}${left?.done ? ` ${left.scoreA}:${left.scoreB}` : ""}  |  4号 ${MIXED_B[a]} VS ${MIXED_B[b]}${right?.done ? ` ${right.scoreA}:${right.scoreB}` : ""}`
    )
  })
  blocks.push("11  休息一轮（小组最后一轮的组合不直接进半决赛）")
  for (const slot of knockout(scores)) {
    blocks.push(`${slot.label}  ${slot.court}  ${slotName(slot, "a", scores)} VS ${slotName(slot, "b", scores)}`)
    if (slot.id === "sf2") blocks.push("休息一轮（半决赛负方不直接打三四名）")
  }
  return blocks.join("\n")
}
