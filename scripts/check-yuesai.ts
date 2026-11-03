import {
  DOUBLES,
  DOUBLES_MATCHES,
  MIXED_A,
  MIXED_B,
  MIXED_MATCHES,
  SINGLES,
  SINGLES_MATCHES,
  appearances,
  hasBackToBack,
  rankPlayers,
  type RosterMatch,
  type Score,
} from "../src/lib/yuesai.ts"

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

function checkSequence(label: string, pairs: [number, number][], count: number) {
  const seen = new Set(pairs.map(([a, b]) => (a < b ? `${a}-${b}` : `${b}-${a}`)))
  assert(seen.size === (count * (count - 1)) / 2, `${label} pairs ${seen.size}`)
  const slots = appearances(pairs, count)
  assert(slots.every((list) => list.length === count - 1), `${label} games`)
  assert(!hasBackToBack(slots), `${label} has back-to-back ${JSON.stringify(slots)}`)
  const gaps = slots.map((list) => list.slice(1).map((value, index) => value - list[index] - 1))
  console.log(label, gaps.map((gap) => gap.join(".")).join(" | "))
}

checkSequence(
  "singles",
  SINGLES_MATCHES.map((match) => [match.a, match.b]),
  SINGLES.length
)
checkSequence(
  "doubles",
  DOUBLES_MATCHES.map((match) => [match.a, match.b]),
  DOUBLES.length
)
checkSequence(
  "mixed",
  MIXED_MATCHES.filter((match) => match.court === "3号场").map((match) => [match.a, match.b]),
  MIXED_A.length
)
assert(
  MIXED_MATCHES.filter((match) => match.court === "4号场").every((match, index) => {
    const other = MIXED_MATCHES.filter((item) => item.court === "3号场")[index]
    return match.a === other.a && match.b === other.b && match.round === other.round
  }),
  "B group mirrors A rounds"
)

function done(a: number, b: number, scoreA: number, scoreB: number, id: string): [string, Score] {
  return [id, { a, b, scoreA, scoreB, done: true }]
}

function matchesOf(list: [number, number, number, number][]): RosterMatch[] {
  return list.map(([a, b], index) => ({
    id: `t-${index}`,
    event: "ms",
    round: index + 1,
    court: "1号场",
    a,
    b,
    kind: "rr",
  }))
}

const h2hMatches = matchesOf([[0, 1, 0, 0]])
const h2hScores = Object.fromEntries([done(0, 1, 15, 10, "t-0")])
const h2h = rankPlayers([0, 1], h2hMatches, h2hScores)
assert(h2h.order.join(",") === "0,1", `h2h ${h2h.order}`)
assert(h2h.cycled.length === 0, "two teams are not a cycle")

// 0 loses the only match but has the same wins if we only rank the two. Winner must be first even with... winner has better diff too.
const upsetScores = Object.fromEntries([done(0, 1, 10, 15, "t-0")])
assert(rankPlayers([0, 1], h2hMatches, upsetScores).order.join(",") === "1,0", "direct winner ranks first")

// Cycle 0>1, 1>2, 2>0. Diff: give 0 the best diff.
const cycleList: [number, number, number, number][] = [
  [0, 1, 15, 1],
  [1, 2, 15, 14],
  [2, 0, 15, 13],
]
const cycleMatches = matchesOf(cycleList)
const cycleScores = Object.fromEntries(cycleList.map((item, index) => done(item[0], item[1], item[2], item[3], `t-${index}`)))
const cycled = rankPlayers([0, 1, 2], cycleMatches, cycleScores)
assert(cycled.cycled.length === 1, "detects cycle")
// diffs: 0: +14 -2 = +12; 1: -14 +1 = -13; 2: +2 -1 = +1
assert(cycled.order.join(",") === "0,2,1", `cycle diff order ${cycled.order}`)

// 0 beat 1,2,3. 1>2>3>1 cycle. Same-win bucket is the cycle; 0 stays first on wins.
const mixedList: [number, number, number, number][] = [
  [0, 1, 15, 8],
  [0, 2, 15, 8],
  [0, 3, 15, 8],
  [1, 2, 15, 10],
  [2, 3, 15, 9],
  [3, 1, 15, 7],
]
const mixedMatches = matchesOf(mixedList)
const mixedScores = Object.fromEntries(mixedList.map((item, index) => done(item[0], item[1], item[2], item[3], `t-${index}`)))
const mixedRank = rankPlayers([0, 1, 2, 3], mixedMatches, mixedScores)
assert(mixedRank.order[0] === 0, `leader ${mixedRank.order}`)
assert(mixedRank.cycled.length === 1, "subset cycle")
// diffs among all matches:
// 1: -7 +5 -8 = -10
// 2: -7 -5 +6 = -6
// 3: -7 -6 +8 = -5
assert(mixedRank.order.slice(1).join(",") === "3,2,1", `cycle tail ${mixedRank.order}`)

console.log("names", MIXED_B[2], DOUBLES[4])
console.log("yuesai checks passed")
