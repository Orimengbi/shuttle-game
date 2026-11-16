import {
  RELAY_CAP,
  buildFixtures,
  roundRobin,
  segmentMax,
  standings,
  type RelayEvent,
  type RelayFixture,
  type RelayTeam,
  blankSegment,
  ROLE_LABELS,
  assignLineup,
  fixtureRows,
  canCaptainScore,
  lineupLocked,
  presentRelay,
  teamsFromFixtureSheet,
} from "../src/lib/relay.ts"

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

const four = roundRobin(["A", "B", "C", "D"])
assert(four.length === 6, `four teams ${four.length}`)
assert(new Set(four.map((item) => item.round)).size === 3, "four teams three rounds")

const five = roundRobin(["A", "B", "C", "D", "E"])
assert(five.length === 10, `five teams ${five.length}`)

assert(segmentMax(20, 18, "home", "relay") === 21, "relay still racing to 21")
assert(segmentMax(21, 18, "home", "relay") === 42, "after 21 the cap is 42")
assert(segmentMax(21, 18, "away", "relay") === 42, "trailer can catch up")
assert(segmentMax(42, 30, "away", "relay") === 41, "cannot tie at 42")
assert(segmentMax(20, 20, "home", "single") === 21, "singles cap")
assert(segmentMax(21, 10, "away", "single") === 20, "singles cannot tie at 21")

function fixture(home: string, away: string, scores: [number, number, number, number, number, number, number, number]): RelayFixture {
  const [a, b, c, d, e, f, g, h] = scores
  const fill = (homeScore: number, awayScore: number, cap: number) => ({
    ...blankSegment(),
    home: homeScore,
    away: awayScore,
    done: Math.max(homeScore, awayScore) >= cap,
  })
  return {
    id: `${home}${away}`,
    round: 1,
    wave: 1,
    courtPair: 1,
    home,
    away,
    relay1: fill(a, b, RELAY_CAP),
    relay2: fill(c, d, RELAY_CAP),
    ms: fill(e, f, 21),
    ws: fill(g, h, 21),
  }
}

const teams = [
  { id: "A", name: "甲", xd: ["a1", "a2"] as [string, string], md: ["a3", "a4"] as [string, string], ms: "a5", ws: "a6" },
  { id: "B", name: "乙", xd: ["b1", "b2"] as [string, string], md: ["b3", "b4"] as [string, string], ms: "b5", ws: "b6" },
  { id: "C", name: "丙", xd: ["c1", "c2"] as [string, string], md: ["c3", "c4"] as [string, string], ms: "c5", ws: "c6" },
]
const event: RelayEvent = {
  id: "2026-11-17",
  title: "test",
  teams,
  fixtures: [
    fixture("A", "B", [42, 10, 42, 10, 21, 10, 21, 10]),
    fixture("A", "C", [42, 0, 42, 0, 21, 0, 21, 0]),
    fixture("B", "C", [42, 5, 42, 5, 21, 5, 21, 5]),
  ],
}
const table = standings(event)
assert(table.map((row) => row.name).join(",") === "甲,乙,丙", `order ${table.map((row) => `${row.name}:${row.points}`)}`)
const tied: RelayEvent = {
  ...event,
  fixtures: [
    fixture("A", "B", [30, 50, 0, 0, 0, 0, 0, 0]),
    fixture("A", "C", [100, 10, 0, 0, 0, 0, 0, 0]),
    fixture("B", "C", [80, 10, 0, 0, 0, 0, 0, 0]),
  ],
}
const tiedTable = standings(tied)
assert(tiedTable.map((row) => row.name).join(",") === "乙,甲,丙", `h2h ${tiedTable.map((row) => `${row.name}:${row.points}`)}`)

const built = buildFixtures(["A", "B", "C", "D"])
assert(built.filter((item) => item.round === 1).every((item, index) => item.courtPair === (index === 0 ? 1 : 2)), "two ties use four courts")

function named(id: string, name: string): RelayTeam {
  return {
    id,
    name,
    members: ROLE_LABELS.map((label) => `${name}-${label}`),
    r1xd: ["", ""],
    r1md: ["", ""],
    r2md: ["", ""],
    r2xd: ["", ""],
    ms: "",
    ws: "",
  }
}
const blankEvent: RelayEvent = {
  id: "sheet",
  title: "sheet",
  teams: [named("A", "甲"), named("B", "乙"), named("C", "丙")],
  fixtures: buildFixtures(["A", "B", "C"]),
}
const sheet = fixtureRows(blankEvent)
const homeAt = sheet[0].indexOf("主队男单")
const awayAt = sheet[0].indexOf("客队女单")
const filled = sheet.map((row, index) => {
  if (index === 0) return row
  return row.map((cell, column) => {
    if (column < 5) return cell
    const header = sheet[0][column]
    const side = header.startsWith("客队") ? row[4] : row[3]
    return `${side}-${header.replace(/^主队|^客队/, "")}`
  })
})
const imported = teamsFromFixtureSheet(blankEvent, filled)
assert("teams" in imported, "error" in imported ? imported.error : "import failed")
if ("teams" in imported) {
  assert(imported.teams[0].ms === "甲-男单", `ms ${imported.teams[0].ms}`)
  assert(imported.teams[0].id === "A", "keep team id")
  assert(imported.teams[1].ws === "乙-女单", `ws ${imported.teams[1].ws}`)
}
assert(homeAt > 0 && awayAt > 0, "player columns exist")
const conflict = filled.map((row) => [...row])
conflict[1][homeAt] = "另一个人"
const rejected = teamsFromFixtureSheet(blankEvent, conflict)
assert("error" in rejected && rejected.error.includes("不一致"), `conflict ${"error" in rejected ? rejected.error : ""}`)
const renamed = filled.map((row, index) => (index === 0 ? row : row.map((cell, column) => (column === 3 ? "改名" : cell))))
const renamedResult = teamsFromFixtureSheet(blankEvent, renamed)
assert("error" in renamedResult, "renamed pairing must be rejected")

const future = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
const soon = new Date(Date.now() + 30 * 60 * 1000).toISOString()
assert(lineupLocked(null) === false, "no start means lineup stays open")
assert(lineupLocked(future) === false, "two hours away stays open")
assert(lineupLocked(soon) === true, "inside one hour locks")
assert(canCaptainScore(null, "A", { home: "A", away: "B" }) === false, "no start, captain cannot score")
assert(canCaptainScore(soon, "A", { home: "A", away: "B" }) === false, "before start, captain cannot score")
assert(canCaptainScore(new Date(Date.now() - 60 * 1000).toISOString(), "A", { home: "A", away: "B" }) === true, "after start, own match")
assert(canCaptainScore(new Date(Date.now() - 60 * 1000).toISOString(), "A", { home: "C", away: "D" }) === false, "after start, other match")
const sample = named("A", "甲")
const placed = assignLineup(sample, {
  r1xd: [sample.members[0], sample.members[1]],
  r1md: [sample.members[2], sample.members[3]],
  r2md: [sample.members[4], sample.members[5]],
  r2xd: [sample.members[6], sample.members[7]],
  ms: sample.members[8],
  ws: sample.members[9],
})
assert("team" in placed, "error" in placed ? placed.error : "lineup failed")
const duplicated = assignLineup(sample, {
  r1xd: [sample.members[0], sample.members[0]],
  r1md: [sample.members[2], sample.members[3]],
  r2md: [sample.members[4], sample.members[5]],
  r2xd: [sample.members[6], sample.members[7]],
  ms: sample.members[8],
  ws: sample.members[9],
})
assert("error" in duplicated, "duplicate lineup must fail")
const hidden = presentRelay(
  { ...blankEvent, startsAt: null, teams: blankEvent.teams.map((team) => ({ ...team, ms: `${team.name}单` })) },
  { role: "captain", teamId: "A" }
)
assert(hidden.teams.find((team) => team.id === "A")?.ms === "甲单", "own lineup stays visible")
assert(hidden.teams.find((team) => team.id === "B")?.lineupHidden === true, "other lineup hidden")
assert(hidden.teams.find((team) => team.id === "B")?.ms === "", "other lineup names removed")
const opened = presentRelay(hidden, { role: "captain", teamId: "A" })
assert(lineupLocked(new Date(Date.now() + 30 * 60 * 1000).toISOString()) === true, "lock still holds")
const revealed = presentRelay(
  { ...blankEvent, startsAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(), teams: blankEvent.teams.map((team) => ({ ...team, ms: `${team.name}单` })) },
  { role: "captain", teamId: "A" }
)
assert(revealed.teams.every((team) => team.lineupHidden === false && team.ms.endsWith("单")), "locked lineups are public")
void opened

console.log("relay checks passed")
