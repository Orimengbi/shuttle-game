import {
  PLAYER_COUNT,
  advice,
  allPairs,
  buildSchedule,
  halfPairs,
  maxMatching,
  skippedOpponents,
  type Courts,
  type FormatId,
  type Pair,
} from "../src/lib/schedule.ts"

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

function roundsOf(matches: { round: number; a: number; b: number; court: number }[]): Pair[][] {
  const rounds: Pair[][] = []
  for (const match of matches) {
    rounds[match.round] ??= []
    rounds[match.round][match.court] = [match.a, match.b]
  }
  return rounds
}

function gaps(rounds: Pair[][], player: number): number[] {
  const indexes: number[] = []
  rounds.forEach((round, index) => {
    if (round.some(([a, b]) => a === player || b === player)) indexes.push(index)
  })
  const result: number[] = []
  for (let i = 1; i < indexes.length; i++) result.push(indexes[i] - indexes[i - 1] - 1)
  return result
}

function check(format: FormatId, courts: Courts) {
  const started = Date.now()
  const schedule = buildSchedule(format, courts, null)
  const elapsed = Date.now() - started
  const { fairness, matches } = schedule
  const expectedGames = format === "full" ? 6 : 4
  const expectedMatches = format === "full" ? 21 : 14
  assert(fairness.totalMatches === expectedMatches, `${format}/${courts} match count`)
  assert(
    fairness.games.every((games) => games === expectedGames),
    `${format}/${courts} games ${fairness.games.join(",")}`
  )
  const seen = new Set<string>()
  const rounds = roundsOf(matches)
  for (const round of rounds) {
    const players = round.flat()
    assert(new Set(players).size === players.length, `${format}/${courts} overlap in round`)
    for (const [a, b] of round) {
      const key = a < b ? `${a}-${b}` : `${b}-${a}`
      assert(!seen.has(key), `${format}/${courts} duplicate ${key}`)
      seen.add(key)
    }
  }
  assert(seen.size === expectedMatches, `${format}/${courts} unique pairs ${seen.size}`)
  if (format === "full") {
    assert(seen.size === allPairs().length, "full covers K7")
  } else {
    for (const skipped of fairness.skipped) {
      assert(skipped.length === 2, `half skip ${skipped.length}`)
    }
  }
  const gapReport = Array.from({ length: PLAYER_COUNT }, (_, player) => gaps(rounds, player))
  console.log(
    [
      `${format} / ${courts} court(s)`,
      `rounds=${fairness.rounds}`,
      `worstPlay=${fairness.worstPlayStreak}`,
      `worstRest=${fairness.worstRestStreak}`,
      `backToBack=${fairness.backToBack}`,
      `play=[${fairness.maxPlayStreak.join(",")}]`,
      `rest=[${fairness.maxRestStreak.join(",")}]`,
      `${elapsed}ms`,
    ].join(" | ")
  )
  console.log(
    "  gaps",
    gapReport.map((list) => list.join(".")).join("  ")
  )
  if (courts === 1) {
    for (const list of gapReport) {
      assert(list.every((gap) => gap >= 2 && gap <= 4), `1-court gaps ${list.join(",")}`)
    }
  }
  if (courts === 2 && format === "full") {
    assert(fairness.rounds === 11, `2-court full rounds ${fairness.rounds}`)
    assert(fairness.worstRestStreak <= 2, `2-court rest ${fairness.worstRestStreak}`)
    assert(fairness.worstPlayStreak <= 2, `2-court play ${fairness.worstPlayStreak}`)
  }
  if (courts === 2 && format === "half") {
    assert(fairness.rounds === 7, `2-court half rounds ${fairness.rounds}`)
    assert(rounds.every((round) => round.length === 2), "2-court half is all doubles")
    assert(fairness.worstPlayStreak <= 2, "half play streak")
    assert(fairness.worstRestStreak <= 2, "half rest streak")
  }
  if (courts === 3 && format === "full") {
    assert(fairness.rounds === 7, "3-court rounds")
    assert(rounds.every((round) => round.length === 3), "3-court full")
    assert(fairness.maxRestStreak.every((streak) => streak === 1), "one bye")
  }
  if (courts === 3 && format === "half") {
    assert(fairness.rounds === 5, `3-court half rounds ${fairness.rounds}`)
    assert(fairness.maxRestStreak.every((streak) => streak === 1), "half one bye")
  }
  const tip = advice(format, courts, 11, fairness.rounds)
  console.log(`  advice: ${tip.title}`)
}

assert(maxMatching(allPairs()) === 3, "K7 matching")
assert(halfPairs().length === 14, "half edges")
assert(maxMatching(halfPairs()) === 3, "half matching")

const skips = skippedOpponents("half")
assert(skips[0].join(",") === "5,6", `strongest skips ${skips[0]}`)
assert(skips[6].join(",") === "0,1", `weakest skips ${skips[6]}`)

for (const format of ["full", "half"] as const) {
  for (const courts of [1, 2, 3] as const) check(format, courts)
}

const centered = buildSchedule("full", 3, 0)
const byeRound =
  centered.fairness &&
  Array.from({ length: 7 }, (_, round) => round).find((round) =>
    centered.matches.filter((match) => match.round === round).every((match) => match.a !== 0 && match.b !== 0)
  )
assert(byeRound === 3, `middle bye at ${byeRound}`)

console.log("schedule checks passed")
