export const RELAY_ID = "2026-11-17"
export const RELAY_TITLE = "南方羽毛球馆2026年11月17日接力赛"
export const RELAY_CAP = 42
export const RELAY_SWITCH = 21
export const SINGLE_CAP = 21

export type RelayTeam = {
  id: string
  name: string
  members: string[]
  /** 单号场第一棒混双，先女后男。 */
  r1xd: [string, string]
  /** 单号场第二棒男双。 */
  r1md: [string, string]
  /** 双号场第一棒男双。 */
  r2md: [string, string]
  /** 双号场第二棒混双，先女后男。 */
  r2xd: [string, string]
  ms: string
  ws: string
  /** 只在发给页面时使用。锁定前，别的队看不到出阵。 */
  lineupHidden?: boolean
}

export type RelaySegmentScore = {
  home: number
  away: number
  done: boolean
  server: "home" | "away"
  first: "home" | "away"
  rally: string
}

export type RelaySegment = "relay1" | "relay2" | "ms" | "ws"

export type CourtLineup = {
  r1xd: [string, string]
  r1md: [string, string]
  r2md: [string, string]
  r2xd: [string, string]
  ms: string
  ws: string
}

export type RelayFixture = {
  id: string
  round: number
  wave: number
  courtPair: 1 | 2
  home: string
  away: string
  relay1: RelaySegmentScore
  relay2: RelaySegmentScore
  ms: RelaySegmentScore
  ws: RelaySegmentScore
  /** 这一轮主队的出场。没有则用队伍上的固定出场。 */
  homeLineup?: CourtLineup
  /** 这一轮客队的出场。 */
  awayLineup?: CourtLineup
}

export type RelayEvent = {
  id: string
  title: string
  teams: RelayTeam[]
  fixtures: RelayFixture[]
  /** 开赛时间。空着表示还没定，出阵不锁定。 */
  startsAt: string | null
}

const LINEUP_LOCK_MS = 60 * 60 * 1000

export function matchStarted(startsAt: string | null | undefined, now = Date.now()): boolean {
  if (!startsAt) return false
  const start = Date.parse(startsAt)
  return Number.isFinite(start) && now >= start
}

export function canCaptainScore(
  startsAt: string | null | undefined,
  teamId: string,
  fixture: { home: string; away: string },
  now = Date.now()
): boolean {
  return matchStarted(startsAt, now) && (fixture.home === teamId || fixture.away === teamId)
}

export function lineupLocked(startsAt: string | null | undefined, now = Date.now()): boolean {
  if (!startsAt) return false
  const start = Date.parse(startsAt)
  if (!Number.isFinite(start)) return false
  return now >= start - LINEUP_LOCK_MS
}

const HIDDEN_LINEUP = {
  r1xd: ["", ""] as [string, string],
  r1md: ["", ""] as [string, string],
  r2md: ["", ""] as [string, string],
  r2xd: ["", ""] as [string, string],
  ms: "",
  ws: "",
  lineupHidden: true,
}

export function presentRelay(event: RelayEvent, viewer: { role: string; teamId?: string } | null): RelayEvent {
  const startsAt = event.startsAt ?? null
  const showAll = viewer?.role === "admin" || lineupLocked(startsAt)
  return {
    ...event,
    startsAt,
    teams: event.teams.map((team) => {
      if (showAll || (viewer?.role === "captain" && viewer.teamId === team.id)) return { ...team, lineupHidden: false }
      return { ...team, ...HIDDEN_LINEUP }
    }),
    fixtures: event.fixtures.map((fixture) => ({
      ...fixture,
      homeLineup: showAll || viewer?.teamId === fixture.home ? fixture.homeLineup : hiddenCourt(),
      awayLineup: showAll || viewer?.teamId === fixture.away ? fixture.awayLineup : hiddenCourt(),
    })),
  }
}

function hiddenCourt(): CourtLineup {
  return { r1xd: ["", ""], r1md: ["", ""], r2md: ["", ""], r2xd: ["", ""], ms: "", ws: "" }
}

export function blankSegment(): RelaySegmentScore {
  return { home: 0, away: 0, done: false, server: "home", first: "home", rally: "" }
}

export function emptyRelay(): RelayEvent {
  return { id: RELAY_ID, title: RELAY_TITLE, teams: [], fixtures: [], startsAt: null }
}

export function assignLineup(
  team: RelayTeam,
  input: { r1xd: [string, string]; r1md: [string, string]; r2md: [string, string]; r2xd: [string, string]; ms: string; ws: string }
): { team: RelayTeam } | { error: string } {
  const next: RelayTeam = { ...team, ...input, members: team.members }
  const members = membersOf(next).filter(Boolean)
  const lineup = lineupOf(next)
  if (members.length !== 10) return { error: `${cleanName(team.name)} 要有 10 个人` }
  if (lineup.some((name) => !name)) return { error: "10 个出场位置都要选" }
  const used = new Set<string>()
  for (const name of lineup) {
    if (used.has(name)) return { error: `${cleanName(team.name)} 里有人兼项` }
    used.add(name)
    if (!members.includes(name)) return { error: `${name} 不在 ${cleanName(team.name)} 的名单里` }
  }
  for (const name of members) {
    if (!used.has(name)) return { error: `${name} 还没有出场位置` }
  }
  return { team: next }
}

export function pairLabel(pair: [string, string]): string {
  const names = pair.map((name) => name.trim()).filter(Boolean)
  return names.length > 0 ? names.join(" / ") : "出场未定"
}

export function switched(score: Pick<RelaySegmentScore, "home" | "away">): boolean {
  return Math.max(score.home, score.away) >= RELAY_SWITCH
}

export function segmentMax(
  home: number,
  away: number,
  side: "home" | "away",
  kind: "relay" | "single"
): number {
  const cap = kind === "single" ? SINGLE_CAP : Math.max(home, away) >= RELAY_SWITCH ? RELAY_CAP : RELAY_SWITCH
  const other = side === "home" ? away : home
  return other >= cap ? cap - 1 : cap
}

export function relaysDone(fixture: RelayFixture): boolean {
  return fixture.relay1.done && fixture.relay2.done
}

export function hasScores(event: RelayEvent): boolean {
  return event.fixtures.some((fixture) =>
    [fixture.relay1, fixture.relay2, fixture.ms, fixture.ws].some(
      (score) => score.done || score.home > 0 || score.away > 0
    )
  )
}

function cleanName(value: string): string {
  return value.trim()
}

export function membersOf(team: RelayTeam): string[] {
  return (team.members ?? []).map(cleanName)
}

export function lineupOf(team: RelayTeam): string[] {
  return [
    team.r1xd?.[0] ?? "",
    team.r1xd?.[1] ?? "",
    team.r1md?.[0] ?? "",
    team.r1md?.[1] ?? "",
    team.r2md?.[0] ?? "",
    team.r2md?.[1] ?? "",
    team.r2xd?.[0] ?? "",
    team.r2xd?.[1] ?? "",
    team.ms ?? "",
    team.ws ?? "",
  ].map(cleanName)
}

export function playersOf(team: RelayTeam): string[] {
  const members = membersOf(team).filter(Boolean)
  return members.length > 0 ? members : lineupOf(team).filter(Boolean)
}

export function teamLineup(team: RelayTeam): CourtLineup {
  return {
    r1xd: team.r1xd ?? ["", ""],
    r1md: team.r1md ?? ["", ""],
    r2md: team.r2md ?? ["", ""],
    r2xd: team.r2xd ?? ["", ""],
    ms: team.ms ?? "",
    ws: team.ws ?? "",
  }
}

export function sideLineup(event: RelayEvent, fixture: RelayFixture, side: "home" | "away"): CourtLineup {
  const custom = side === "home" ? fixture.homeLineup : fixture.awayLineup
  if (custom) return custom
  const team = event.teams.find((item) => item.id === (side === "home" ? fixture.home : fixture.away))
  return team ? teamLineup(team) : hiddenCourt()
}

export function onCourt(lineup: CourtLineup, segment: "relay1" | "relay2", score: Pick<RelaySegmentScore, "home" | "away">): [string, string] {
  const pair = segment === "relay1" ? (switched(score) ? lineup.r1md : lineup.r1xd) : switched(score) ? lineup.r2xd : lineup.r2md
  return pair ?? ["", ""]
}

export function validateTeamDraft(teams: RelayTeam[]): string | null {
  if (teams.length < 2) return "至少两支队伍"
  const seen = new Set<string>()
  const names = new Set<string>()
  for (const team of teams) {
    const name = cleanName(team.name)
    if (!name) return "每支队伍都要有名字"
    if (names.has(name)) return "队伍名称不能重复"
    names.add(name)
    const members = membersOf(team).filter(Boolean)
    if (members.length > 10) return `${name} 最多 10 人`
    const local = new Set<string>()
    for (const player of members) {
      if (local.has(player)) return `${name} 里有人重复`
      local.add(player)
      if (seen.has(player)) return `${player} 出现在两支队伍里`
      seen.add(player)
    }
    const used = new Set<string>()
    for (const player of lineupOf(team)) {
      if (!player) continue
      if (members.length > 0 && !local.has(player)) return `${player} 不在 ${name} 的名单里`
      if (used.has(player)) return `${name} 里有人兼项`
      used.add(player)
      if (members.length === 0) {
        if (seen.has(player)) return `${player} 出现在两支队伍里`
        seen.add(player)
      }
    }
  }
  return null
}

export function validateTeams(teams: RelayTeam[]): string | null {
  const draft = validateTeamDraft(teams)
  if (draft) return draft
  for (const team of teams) {
    const name = cleanName(team.name)
    const members = membersOf(team).filter(Boolean)
    if (members.length !== 10) return `${name} 要有 10 个人`
    const lineup = lineupOf(team)
    if (lineup.some((player) => !player)) return `${name} 的出场位置还没填完`
    for (const player of members) {
      if (!lineup.includes(player)) return `${player} 还没有出场位置`
    }
  }
  return null
}

export function rosterReady(event: RelayEvent): boolean {
  if (event.fixtures.some((fixture) => fixture.homeLineup || fixture.awayLineup)) {
    return event.fixtures.every((fixture) =>
      (["relay1", "relay2", "ms", "ws"] as const).every((segment) => segmentStaffed(event, fixture, segment))
    )
  }
  return validateTeams(event.teams) === null
}

export function segmentStaffed(event: RelayEvent, fixture: RelayFixture, segment: RelaySegment): boolean {
  const home = sideLineup(event, fixture, "home")
  const away = sideLineup(event, fixture, "away")
  const names =
    segment === "ms"
      ? [home.ms, away.ms]
      : segment === "ws"
        ? [home.ws, away.ws]
        : segment === "relay1"
          ? [...home.r1xd, ...home.r1md, ...away.r1xd, ...away.r1md]
          : [...home.r2md, ...home.r2xd, ...away.r2md, ...away.r2xd]
  return names.every((name) => cleanName(name))
}

export function roundRobin(teamIds: string[]): { round: number; home: string; away: string }[] {
  const ids = [...teamIds]
  const bye = "__bye__"
  if (ids.length % 2 === 1) ids.push(bye)
  const count = ids.length
  const rounds = count - 1
  const half = count / 2
  let ring = [...ids]
  const fixtures: { round: number; home: string; away: string }[] = []
  for (let round = 0; round < rounds; round += 1) {
    for (let index = 0; index < half; index += 1) {
      const home = ring[index]
      const away = ring[count - 1 - index]
      if (home !== bye && away !== bye) fixtures.push({ round: round + 1, home, away })
    }
    const fixed = ring[0]
    const rest = ring.slice(1)
    const last = rest.pop()
    if (last !== undefined) rest.unshift(last)
    ring = [fixed, ...rest]
  }
  return fixtures
}

export function buildFixtures(teamIds: string[]): RelayFixture[] {
  const paired = roundRobin(teamIds)
  const byRound = new Map<number, { home: string; away: string }[]>()
  for (const item of paired) {
    const list = byRound.get(item.round) ?? []
    list.push(item)
    byRound.set(item.round, list)
  }
  const fixtures: RelayFixture[] = []
  for (const [round, list] of byRound) {
    list.forEach((item, index) => {
      fixtures.push({
        id: `r${round}-${index + 1}`,
        round,
        wave: Math.floor(index / 2) + 1,
        courtPair: index % 2 === 0 ? 1 : 2,
        home: item.home,
        away: item.away,
        relay1: blankSegment(),
        relay2: blankSegment(),
        ms: blankSegment(),
        ws: blankSegment(),
      })
    })
  }
  return fixtures.sort((a, b) => a.round - b.round || a.wave - b.wave || a.courtPair - b.courtPair)
}

export const ROLE_LABELS = ["单号混双女", "单号混双男", "单号男双1", "单号男双2", "双号男双1", "双号男双2", "双号混双女", "双号混双男", "男单", "女单"] as const

export const FIXTURE_HEADERS = [
  "轮次",
  "批次",
  "场地",
  "主队",
  "客队",
  ...ROLE_LABELS.map((label) => `主队${label}`),
  ...ROLE_LABELS.map((label) => `客队${label}`),
] as const

type People = {
  r1xd: [string, string]
  r1md: [string, string]
  r2md: [string, string]
  r2xd: [string, string]
  ms: string
  ws: string
}

export function lineupValues(lineup: CourtLineup): string[] {
  return [
    lineup.r1xd[0],
    lineup.r1xd[1],
    lineup.r1md[0],
    lineup.r1md[1],
    lineup.r2md[0],
    lineup.r2md[1],
    lineup.r2xd[0],
    lineup.r2xd[1],
    lineup.ms,
    lineup.ws,
  ].map((name) => name.trim())
}

export function fixtureRows(event: RelayEvent): string[][] {
  const teams = new Map(event.teams.map((team) => [team.id, team]))
  const body = event.fixtures.map((fixture) => {
    const home = teams.get(fixture.home)
    const away = teams.get(fixture.away)
    const courts = courtsOf(fixture)
    return [
      String(fixture.round),
      String(fixture.wave),
      `${courts.relay1}、${courts.relay2}`,
      home?.name ?? "",
      away?.name ?? "",
      ...lineupValues(sideLineup(event, fixture, "home")),
      ...lineupValues(sideLineup(event, fixture, "away")),
    ]
  })
  return [[...FIXTURE_HEADERS], ...body]
}

export function teamsFromFixtureSheet(event: RelayEvent, rows: string[][]): { teams: RelayTeam[] } | { error: string } {
  const headerAt = rows.findIndex((row) => row.includes("主队") && row.includes("主队男单") && row.includes("客队女单"))
  if (headerAt < 0) return { error: "这不是对阵表。请先下载对阵表，填好人员后再导入。" }
  const header = rows[headerAt]
  const column = new Map<string, number>()
  header.forEach((cell, index) => {
    const key = cell.trim()
    if (key && !column.has(key)) column.set(key, index)
  })
  for (const key of FIXTURE_HEADERS) {
    if (!column.has(key)) return { error: `对阵表缺少「${key}」列` }
  }
  const cell = (row: string[], key: string) => (row[column.get(key) ?? -1] ?? "").trim()
  const data = rows.slice(headerAt + 1).filter((row) => cell(row, "轮次") || cell(row, "主队") || cell(row, "客队"))
  const expected = new Map<string, true>()
  const teamName = new Map(event.teams.map((team) => [team.id, team.name]))
  for (const fixture of event.fixtures) {
    expected.set(`${fixture.round}|${fixture.wave}|${teamName.get(fixture.home) ?? ""}|${teamName.get(fixture.away) ?? ""}`, true)
  }
  const seen = new Set<string>()
  const people = new Map<string, People>()
  for (const row of data) {
    const round = plainNumber(cell(row, "轮次"))
    const wave = plainNumber(cell(row, "批次"))
    const home = cell(row, "主队")
    const away = cell(row, "客队")
    const key = `${round}|${wave}|${home}|${away}`
    if (!expected.has(key)) return { error: `第 ${round} 轮 ${home} 对 ${away} 不在已生成的赛程里，请不要改轮次和队伍名称` }
    if (seen.has(key)) return { error: `第 ${round} 轮 ${home} 对 ${away} 重复了` }
    seen.add(key)
    const homeProblem = mergePeople(home, people, peopleFrom(row, "主队", cell))
    if (homeProblem) return { error: homeProblem }
    const awayProblem = mergePeople(away, people, peopleFrom(row, "客队", cell))
    if (awayProblem) return { error: awayProblem }
  }
  if (seen.size !== expected.size) return { error: "对阵表少了几场，请用刚下载的表再填" }
  for (const team of event.teams) {
    if (!people.has(team.name)) return { error: `${team.name} 不在对阵表里` }
  }
  const teams = event.teams.map((team) => {
    const draft = people.get(team.name)!
    return { ...team, ...draft }
  })
  const problem = validateTeams(teams)
  if (problem) return { error: problem }
  return { teams }
}

function plainNumber(value: string): string {
  if (/^\d+\.0+$/.test(value)) return String(Number(value))
  return value
}

function peopleFrom(row: string[], side: "主队" | "客队", cell: (row: string[], key: string) => string): People {
  const value = (label: string) => cell(row, `${side}${label}`)
  return {
    r1xd: [value("单号混双女"), value("单号混双男")],
    r1md: [value("单号男双1"), value("单号男双2")],
    r2md: [value("双号男双1"), value("双号男双2")],
    r2xd: [value("双号混双女"), value("双号混双男")],
    ms: value("男单"),
    ws: value("女单"),
  }
}

function mergePeople(teamName: string, into: Map<string, People>, draft: People): string | null {
  const current = into.get(teamName)
  if (!current) {
    into.set(teamName, {
      r1xd: [...draft.r1xd],
      r1md: [...draft.r1md],
      r2md: [...draft.r2md],
      r2xd: [...draft.r2xd],
      ms: draft.ms,
      ws: draft.ws,
    })
    return null
  }
  const fields: [string, string, string, (value: string) => void][] = [
    ["单号混双女", current.r1xd[0], draft.r1xd[0], (value) => (current.r1xd[0] = value)],
    ["单号混双男", current.r1xd[1], draft.r1xd[1], (value) => (current.r1xd[1] = value)],
    ["单号男双1", current.r1md[0], draft.r1md[0], (value) => (current.r1md[0] = value)],
    ["单号男双2", current.r1md[1], draft.r1md[1], (value) => (current.r1md[1] = value)],
    ["双号男双1", current.r2md[0], draft.r2md[0], (value) => (current.r2md[0] = value)],
    ["双号男双2", current.r2md[1], draft.r2md[1], (value) => (current.r2md[1] = value)],
    ["双号混双女", current.r2xd[0], draft.r2xd[0], (value) => (current.r2xd[0] = value)],
    ["双号混双男", current.r2xd[1], draft.r2xd[1], (value) => (current.r2xd[1] = value)],
    ["男单", current.ms, draft.ms, (value) => (current.ms = value)],
    ["女单", current.ws, draft.ws, (value) => (current.ws = value)],
  ]
  for (const [label, left, right, write] of fields) {
    if (!left && right) write(right)
    else if (left && right && left !== right) return `${teamName} 的${label}前后不一致`
  }
  return null
}

export function courtsOf(fixture: Pick<RelayFixture, "courtPair">): {
  relay1: string
  relay2: string
  ms: string
  ws: string
} {
  if (fixture.courtPair === 1) return { relay1: "1号场", relay2: "2号场", ms: "1号场", ws: "2号场" }
  return { relay1: "3号场", relay2: "4号场", ms: "3号场", ws: "4号场" }
}

export function fixturePoints(fixture: RelayFixture, teamId: string): { scored: number; against: number } {
  const home = fixture.home === teamId
  let scored = 0
  let against = 0
  for (const segment of [fixture.relay1, fixture.relay2, fixture.ms, fixture.ws]) {
    scored += home ? segment.home : segment.away
    against += home ? segment.away : segment.home
  }
  return { scored, against }
}

function segmentWins(fixture: RelayFixture, teamId: string): number {
  const home = fixture.home === teamId
  const specs: { score: RelaySegmentScore; cap: number }[] = [
    { score: fixture.relay1, cap: RELAY_CAP },
    { score: fixture.relay2, cap: RELAY_CAP },
    { score: fixture.ms, cap: SINGLE_CAP },
    { score: fixture.ws, cap: SINGLE_CAP },
  ]
  let wins = 0
  for (const item of specs) {
    if (!item.score.done) continue
    const mine = home ? item.score.home : item.score.away
    const theirs = home ? item.score.away : item.score.home
    if (mine >= item.cap && mine > theirs) wins += 1
  }
  return wins
}

export type RelayStanding = {
  id: string
  name: string
  points: number
  diff: number
  rank: number
}

export function standings(event: RelayEvent): RelayStanding[] {
  const rows = event.teams.map((team) => {
    let points = 0
    let against = 0
    for (const fixture of event.fixtures) {
      if (fixture.home !== team.id && fixture.away !== team.id) continue
      const result = fixturePoints(fixture, team.id)
      points += result.scored
      against += result.against
    }
    return { id: team.id, name: team.name, points, diff: points - against }
  })
  const groups = new Map<number, typeof rows>()
  for (const row of rows) {
    const list = groups.get(row.points) ?? []
    list.push(row)
    groups.set(row.points, list)
  }
  const order: typeof rows = []
  for (const points of [...groups.keys()].sort((a, b) => b - a)) {
    const group = groups.get(points)!
    if (group.length === 2) {
      const [left, right] = group
      const compared = headToHead(left.id, right.id, event.fixtures)
      if (compared > 0) order.push(left, right)
      else if (compared < 0) order.push(right, left)
      else order.push(...group.slice().sort((a, b) => b.diff - a.diff || a.name.localeCompare(b.name, "zh")))
    } else {
      order.push(...group.slice().sort((a, b) => b.diff - a.diff || a.name.localeCompare(b.name, "zh")))
    }
  }
  return order.map((row, index) => ({ id: row.id, name: row.name, points: row.points, diff: row.diff, rank: index + 1 }))
}

function headToHead(left: string, right: string, fixtures: RelayFixture[]): number {
  const fixture = fixtures.find(
    (item) => (item.home === left && item.away === right) || (item.home === right && item.away === left)
  )
  if (!fixture) return 0
  const result = fixturePoints(fixture, left)
  if (result.scored !== result.against) return result.scored - result.against
  return segmentWins(fixture, left) - segmentWins(fixture, right)
}
