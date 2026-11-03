export const PLAYER_COUNT = 7

export type Courts = 1 | 2 | 3
export type FormatId = "full" | "half"
export type Points = 11 | 15 | 21
export type Pair = [number, number]

export type ScheduledMatch = {
  round: number
  court: number
  a: number
  b: number
}

export type Fairness = {
  games: number[]
  maxPlayStreak: number[]
  maxRestStreak: number[]
  opponents: number[][]
  skipped: number[][]
  totalMatches: number
  rounds: number
  worstPlayStreak: number
  worstRestStreak: number
  backToBack: number
}

export type Schedule = {
  matches: ScheduledMatch[]
  fairness: Fairness
}

export type Advice = {
  tone: "good" | "ok" | "warn"
  title: string
  body: string
}

const FULL_GAMES = 6
const HALF_GAMES = 4

function canon(a: number, b: number): Pair {
  return a < b ? [a, b] : [b, a]
}

function pairKey(a: number, b: number): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`
}

export function allPairs(): Pair[] {
  const pairs: Pair[] = []
  for (let i = 0; i < PLAYER_COUNT; i++) {
    for (let j = i + 1; j < PLAYER_COUNT; j++) pairs.push([i, j])
  }
  return pairs
}

/** Strength order 0..6 folded onto a circle so neighbors differ by at most 2. */
export function strengthCircle(): number[] {
  return [0, 2, 4, 6, 5, 3, 1]
}

export function halfPairs(): Pair[] {
  const circle = strengthCircle()
  const seen = new Set<string>()
  const pairs: Pair[] = []
  for (let i = 0; i < PLAYER_COUNT; i++) {
    for (const distance of [1, 2]) {
      const a = circle[i]
      const b = circle[(i + distance) % PLAYER_COUNT]
      const key = pairKey(a, b)
      if (seen.has(key)) continue
      seen.add(key)
      pairs.push(canon(a, b))
    }
  }
  return pairs
}

function circleRounds(): Pair[][] {
  const rounds: Pair[][] = []
  for (let r = 0; r < PLAYER_COUNT; r++) {
    const rot = Array.from({ length: PLAYER_COUNT }, (_, i) => (i + r) % PLAYER_COUNT)
    rounds.push([
      canon(rot[1], rot[6]),
      canon(rot[2], rot[5]),
      canon(rot[3], rot[4]),
    ])
  }
  return rounds
}

function bitIndex(bit: number): number {
  return Math.log2(bit)
}

function adjacency(pairs: Pair[]): number[] {
  const adj = Array(PLAYER_COUNT).fill(0)
  for (const [a, b] of pairs) {
    adj[a] |= 1 << b
    adj[b] |= 1 << a
  }
  return adj
}

export function maxMatching(pairs: Pair[]): number {
  const adj = adjacency(pairs)
  const size = 1 << PLAYER_COUNT
  const dp = new Uint8Array(size)
  for (let mask = 1; mask < size; mask++) {
    const low = mask & -mask
    const v = bitIndex(low)
    const without = mask ^ (1 << v)
    let best = dp[without]
    let neigh = adj[v] & without
    while (neigh) {
      const bit = neigh & -neigh
      const u = bitIndex(bit)
      best = Math.max(best, dp[without ^ (1 << u)] + 1)
      neigh ^= bit
    }
    dp[mask] = best
  }
  return dp[size - 1]
}

function removePairs(pairs: Pair[], chosen: Pair[]): Pair[] {
  const drop = new Set(chosen.map(([a, b]) => pairKey(a, b)))
  return pairs.filter(([a, b]) => !drop.has(pairKey(a, b)))
}

function enumerateMatchings(pairs: Pair[], size: number): Pair[][] {
  const result: Pair[][] = []
  const used = Array(PLAYER_COUNT).fill(false)
  const acc: Pair[] = []
  const walk = (start: number) => {
    if (acc.length === size) {
      result.push(acc.slice())
      return
    }
    for (let i = start; i < pairs.length; i++) {
      const [a, b] = pairs[i]
      if (used[a] || used[b]) continue
      used[a] = true
      used[b] = true
      acc.push(pairs[i])
      walk(i + 1)
      acc.pop()
      used[a] = false
      used[b] = false
    }
  }
  walk(0)
  return result
}

function matchingsWithFirst(pairs: Pair[], size: number): Pair[][] {
  const first = pairs[0]
  const result: Pair[][] = []
  const used = Array(PLAYER_COUNT).fill(false)
  used[first[0]] = true
  used[first[1]] = true
  const acc: Pair[] = [first]
  const walk = (start: number) => {
    if (acc.length === size) {
      result.push(acc.slice())
      return
    }
    for (let i = start; i < pairs.length; i++) {
      const [a, b] = pairs[i]
      if (used[a] || used[b]) continue
      used[a] = true
      used[b] = true
      acc.push(pairs[i])
      walk(i + 1)
      acc.pop()
      used[a] = false
      used[b] = false
    }
  }
  walk(1)
  return result
}

function exactPack(pairs: Pair[], courts: Courts): Pair[][] | null {
  const search = (remaining: Pair[], roundsLeft: number): Pair[][] | null => {
    if (remaining.length === 0) return []
    if (roundsLeft <= 0 || remaining.length > roundsLeft * courts) return null
    const matching = maxMatching(remaining)
    if (matching === 0) return null
    const maxSize = Math.min(courts, remaining.length, matching)
    const minSize = remaining.length - (roundsLeft - 1) * courts
    for (let size = maxSize; size >= Math.max(1, minSize); size--) {
      const options = size === 1 ? [[remaining[0]]] : matchingsWithFirst(remaining, size)
      for (const option of options) {
        const found = search(removePairs(remaining, option), roundsLeft - 1)
        if (found) return [option, ...found]
      }
    }
    return null
  }
  for (let roundsLeft = Math.ceil(pairs.length / courts); roundsLeft <= pairs.length; roundsLeft++) {
    const found = search(pairs, roundsLeft)
    if (found) return found
  }
  return null
}

function packRounds(pairs: Pair[], courts: Courts): Pair[][] {
  let remaining = pairs.slice()
  const rounds: Pair[][] = []
  while (remaining.length > 0) {
    let size = Math.min(courts, remaining.length)
    let options: Pair[][] = []
    while (size >= 1 && options.length === 0) {
      options = size === 1 ? remaining.map((pair) => [pair]) : enumerateMatchings(remaining, size)
      if (options.length === 0) size--
    }
    let best = options[0]
    let bestScore = -Infinity
    let bestKey = "\uffff"
    for (const option of options) {
      const rest = removePairs(remaining, option)
      const matching = rest.length === 0 ? courts : maxMatching(rest)
      const want = Math.min(courts, rest.length === 0 ? courts : rest.length)
      const deficit = rest.length === 0 ? 0 : Math.max(0, want - matching)
      const key = option.map(([a, b]) => pairKey(a, b)).join("|")
      const score = matching * 20 - deficit * 80 + (rest.length === 0 ? 5 : 0)
      if (score > bestScore || (score === bestScore && key < bestKey)) {
        bestScore = score
        best = option
        bestKey = key
      }
    }
    rounds.push(best)
    remaining = removePairs(remaining, best)
  }
  return rounds
}

function twoCourtFullRounds(): Pair[][] {
  const factors = circleRounds()
  const doubles = factors.map((round) => [round[0], round[1]])
  const cycle: Pair[] = [
    [0, 1],
    [2, 3],
    [4, 5],
    [6, 0],
    [1, 2],
    [3, 4],
    [5, 6],
  ]
  return [
    ...doubles,
    [cycle[0], cycle[1]],
    [cycle[2], cycle[3]],
    [cycle[4], cycle[5]],
    [cycle[6]],
  ]
}

function lcg(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0
    return state / 4294967296
  }
}

function playingSet(round: Pair[]): Set<number> {
  const playing = new Set<number>()
  for (const [a, b] of round) {
    playing.add(a)
    playing.add(b)
  }
  return playing
}

export function roundOrderCost(rounds: Pair[][]): number {
  const playStreak = Array(PLAYER_COUNT).fill(0)
  const restStreak = Array(PLAYER_COUNT).fill(0)
  const games = Array(PLAYER_COUNT).fill(0)
  let penalty = 0
  let worstPlay = 0
  let worstRest = 0
  for (const round of rounds) {
    const playing = playingSet(round)
    for (let player = 0; player < PLAYER_COUNT; player++) {
      if (playing.has(player)) {
        playStreak[player] += 1
        restStreak[player] = 0
        games[player] += 1
        worstPlay = Math.max(worstPlay, playStreak[player])
        if (playStreak[player] === 2) penalty += 8
        else if (playStreak[player] > 2) penalty += 28 * (playStreak[player] - 1)
      } else {
        restStreak[player] += 1
        playStreak[player] = 0
        worstRest = Math.max(worstRest, restStreak[player])
        if (restStreak[player] === 2) penalty += 14
        else if (restStreak[player] > 2) penalty += 30 * (restStreak[player] - 1)
      }
    }
    const ahead = Math.max(...games) - Math.min(...games)
    if (ahead > 1) penalty += (ahead - 1) * 6
  }
  penalty += worstPlay * 18
  penalty += worstRest * 18
  return penalty
}

function sequenceCost(pairs: Pair[]): number {
  const last = Array(PLAYER_COUNT).fill(-1)
  const first = Array(PLAYER_COUNT).fill(-1)
  const gapValues: number[] = []
  let penalty = 0
  pairs.forEach(([a, b], index) => {
    for (const player of [a, b]) {
      if (last[player] >= 0) {
        const gap = index - last[player] - 1
        gapValues.push(gap)
        if (gap <= 0) penalty += 2000
        else if (gap === 1) penalty += 160
        else if (gap === 2) penalty += 0
        else if (gap === 3) penalty += 2
        else if (gap === 4) penalty += 18
        else penalty += 45 * (gap - 3)
      }
      if (first[player] < 0) first[player] = index
      last[player] = index
    }
  })
  const total = pairs.length
  for (let player = 0; player < PLAYER_COUNT; player++) {
    if (first[player] >= 5) penalty += (first[player] - 4) * 16
    const tail = total - 1 - last[player]
    if (tail >= 5) penalty += (tail - 4) * 16
  }
  if (gapValues.length > 0) {
    const mean = gapValues.reduce((sum, gap) => sum + gap, 0) / gapValues.length
    const variance =
      gapValues.reduce((sum, gap) => sum + (gap - mean) ** 2, 0) / gapValues.length
    penalty += variance * 10
  }
  return penalty
}

function greedySequence(pairs: Pair[]): Pair[] {
  const remaining = pairs.slice()
  const order: Pair[] = []
  const last = Array(PLAYER_COUNT).fill(-99)
  const games = Array(PLAYER_COUNT).fill(0)
  for (let step = 0; step < pairs.length; step++) {
    let bestIndex = 0
    let bestPenalty = Infinity
    let bestKey = "\uffff"
    for (let index = 0; index < remaining.length; index++) {
      const [a, b] = remaining[index]
      let penalty = 0
      for (const player of [a, b]) {
        if (last[player] > -50) {
          const gap = step - last[player] - 1
          if (gap <= 0) penalty += 1000
          else if (gap === 1) penalty += 90
          else if (gap >= 4) penalty += (gap - 3) * 16
        } else if (step > 3) {
          penalty += (step - 3) * 6
        }
        penalty += games[player] * 7
      }
      for (let player = 0; player < PLAYER_COUNT; player++) {
        if (player === a || player === b) continue
        const wait = last[player] < -50 ? step : step - last[player] - 1
        if (wait >= 4) penalty += (wait - 3) * 7
      }
      const key = pairKey(a, b)
      if (penalty < bestPenalty || (penalty === bestPenalty && key < bestKey)) {
        bestPenalty = penalty
        bestIndex = index
        bestKey = key
      }
    }
    const chosen = remaining.splice(bestIndex, 1)[0]
    order.push(chosen)
    for (const player of chosen) {
      last[player] = step
      games[player] += 1
    }
  }
  return order
}

function annealSequence(start: Pair[], seed: number): Pair[] {
  const random = lcg(seed)
  let current = start.slice()
  let currentCost = sequenceCost(current)
  let best = current.slice()
  let bestCost = currentCost
  const iterations = 25000
  for (let step = 0; step < iterations; step++) {
    const temperature = 50 * (1 - step / iterations) + 0.08
    const next = current.slice()
    const i = Math.floor(random() * next.length)
    let j = Math.floor(random() * next.length)
    if (i === j) continue
    if (random() < 0.65) {
      const [item] = next.splice(i, 1)
      if (j > i) j -= 1
      next.splice(j, 0, item)
    } else {
      ;[next[i], next[j]] = [next[j], next[i]]
    }
    const cost = sequenceCost(next)
    const delta = cost - currentCost
    if (delta <= 0 || random() < Math.exp(-delta / temperature)) {
      current = next
      currentCost = cost
      if (cost < bestCost) {
        best = next.slice()
        bestCost = cost
      }
    }
  }
  return best
}

function orderSingles(pairs: Pair[]): Pair[][] {
  const greedy = greedySequence(pairs)
  let best = greedy
  let bestCost = sequenceCost(best)
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const candidate = annealSequence(seed % 2 === 0 ? greedy : pairs, seed)
    const cost = sequenceCost(candidate)
    if (cost < bestCost) {
      best = candidate
      bestCost = cost
    }
  }
  return best.map((pair) => [pair])
}

function annealRounds(start: Pair[][], seed: number): Pair[][] {
  const random = lcg(seed)
  let current = start.map((round) => round.slice())
  let currentCost = roundOrderCost(current)
  let best = current.map((round) => round.slice())
  let bestCost = currentCost
  const iterations = 20000
  for (let step = 0; step < iterations; step++) {
    const temperature = 24 * (1 - step / iterations) + 0.05
    const next = current.map((round) => round.slice())
    const i = Math.floor(random() * next.length)
    const j = Math.floor(random() * next.length)
    if (i === j) continue
    ;[next[i], next[j]] = [next[j], next[i]]
    const cost = roundOrderCost(next)
    const delta = cost - currentCost
    if (delta <= 0 || random() < Math.exp(-delta / temperature)) {
      current = next
      currentCost = cost
      if (cost < bestCost) {
        best = next.map((round) => round.slice())
        bestCost = cost
      }
    }
  }
  return best
}

function orderRounds(rounds: Pair[][]): Pair[][] {
  let best = rounds
  let bestCost = roundOrderCost(best)
  for (const seed of [11, 17, 23, 41]) {
    const candidate = annealRounds(rounds, seed)
    const cost = roundOrderCost(candidate)
    if (cost < bestCost) {
      best = candidate
      bestCost = cost
    }
  }
  return best
}

function restRound(rounds: Pair[][], player: number): number {
  return rounds.findIndex((round) => !playingSet(round).has(player))
}

function rotateToCenter(rounds: Pair[][], player: number): Pair[][] {
  const index = restRound(rounds, player)
  if (index < 0) return rounds
  const center = Math.floor((rounds.length - 1) / 2)
  const shift = (index - center + rounds.length) % rounds.length
  return rounds.map((_, i) => rounds[(i + shift) % rounds.length])
}

function eachRestsOnce(rounds: Pair[][]): boolean {
  const rests = Array(PLAYER_COUNT).fill(0)
  for (const round of rounds) {
    const playing = playingSet(round)
    for (let player = 0; player < PLAYER_COUNT; player++) {
      if (!playing.has(player)) rests[player] += 1
    }
  }
  return rests.every((count) => count === 1)
}

function toMatches(rounds: Pair[][]): ScheduledMatch[] {
  const matches: ScheduledMatch[] = []
  rounds.forEach((round, roundIndex) => {
    round.forEach(([a, b], court) => {
      matches.push({ round: roundIndex, court, a, b })
    })
  })
  return matches
}

export function measureFairness(rounds: Pair[][]): Fairness {
  const games = Array(PLAYER_COUNT).fill(0)
  const maxPlayStreak = Array(PLAYER_COUNT).fill(0)
  const maxRestStreak = Array(PLAYER_COUNT).fill(0)
  const playStreak = Array(PLAYER_COUNT).fill(0)
  const restStreak = Array(PLAYER_COUNT).fill(0)
  const opponents: number[][] = Array.from({ length: PLAYER_COUNT }, () => [])
  let backToBack = 0
  for (const round of rounds) {
    const playing = playingSet(round)
    for (const [a, b] of round) {
      opponents[a].push(b)
      opponents[b].push(a)
      games[a] += 1
      games[b] += 1
    }
    for (let player = 0; player < PLAYER_COUNT; player++) {
      if (playing.has(player)) {
        if (playStreak[player] >= 1) backToBack += 1
        playStreak[player] += 1
        restStreak[player] = 0
        maxPlayStreak[player] = Math.max(maxPlayStreak[player], playStreak[player])
      } else {
        restStreak[player] += 1
        playStreak[player] = 0
        maxRestStreak[player] = Math.max(maxRestStreak[player], restStreak[player])
      }
    }
  }
  const skipped = opponents.map((list, player) => {
    const met = new Set(list)
    const missing: number[] = []
    for (let other = 0; other < PLAYER_COUNT; other++) {
      if (other !== player && !met.has(other)) missing.push(other)
    }
    return missing
  })
  return {
    games,
    maxPlayStreak,
    maxRestStreak,
    opponents,
    skipped,
    totalMatches: rounds.reduce((sum, round) => sum + round.length, 0),
    rounds: rounds.length,
    worstPlayStreak: Math.max(...maxPlayStreak),
    worstRestStreak: Math.max(...maxRestStreak),
    backToBack,
  }
}

function baseRounds(format: FormatId, courts: Courts): Pair[][] {
  if (format === "full" && courts === 3) return circleRounds()
  if (format === "full" && courts === 2) return twoCourtFullRounds()
  const pairs = format === "full" ? allPairs() : halfPairs()
  if (courts === 1) return orderSingles(pairs)
  if (format === "half") return exactPack(pairs, courts) ?? packRounds(pairs, courts)
  return packRounds(pairs, courts)
}

export function buildSchedule(
  format: FormatId,
  courts: Courts,
  middleRestPlayer: number | null
): Schedule {
  let rounds = baseRounds(format, courts)
  if (courts > 1 && !(format === "full" && courts === 3)) rounds = orderRounds(rounds)
  if (
    middleRestPlayer !== null &&
    middleRestPlayer >= 0 &&
    middleRestPlayer < PLAYER_COUNT &&
    eachRestsOnce(rounds)
  ) {
    rounds = rotateToCenter(rounds, middleRestPlayer)
  }
  return {
    matches: toMatches(rounds),
    fairness: measureFairness(rounds),
  }
}

export function gamesPerPlayer(format: FormatId): number {
  return format === "full" ? FULL_GAMES : HALF_GAMES
}

export function roundCount(format: FormatId, courts: Courts): number {
  if (format === "full") return courts === 1 ? 21 : courts === 2 ? 11 : 7
  return courts === 1 ? 14 : courts === 2 ? 7 : 5
}

export function skippedOpponents(format: FormatId): number[][] {
  const met = Array.from({ length: PLAYER_COUNT }, () => new Set<number>())
  const pairs = format === "full" ? allPairs() : halfPairs()
  for (const [a, b] of pairs) {
    met[a].add(b)
    met[b].add(a)
  }
  return met.map((set, player) => {
    const missing: number[] = []
    for (let other = 0; other < PLAYER_COUNT; other++) {
      if (other !== player && !set.has(other)) missing.push(other)
    }
    return missing
  })
}

export function estimateMinutes(rounds: number, points: Points): number {
  const play = points === 11 ? 10 : points === 15 ? 15 : 22
  return rounds * (play + 2)
}

export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours === 0) return `大约 ${rest} 分钟`
  if (rest === 0) return `大约 ${hours} 小时`
  return `大约 ${hours} 小时 ${rest} 分钟`
}

export function advice(format: FormatId, courts: Courts, points: Points, rounds: number): Advice {
  const duration = formatDuration(estimateMinutes(rounds, points))
  if (courts === 1 && format === "full" && points >= 15) {
    return {
      tone: "warn",
      title: "一场会拖很久",
      body: `只有 1 片场还打全循环 ${points} 分，${duration}。改成半循环，或把每局改成 11 分。`,
    }
  }
  if (courts === 1 && format === "half" && points === 11) {
    return {
      tone: "good",
      title: "适合一个晚上",
      body: `1 片场、每人 4 场、11 分，${duration}。每个人不连打，中间大约歇 2 到 3 场。`,
    }
  }
  if (courts === 2 && format === "full") {
    return {
      tone: "good",
      title: "两片场最匀",
      body: `每轮 4 人打、3 人歇，全循环 ${rounds} 轮，${duration}。每人最多连打 2 轮，也最多连歇 2 轮。`,
    }
  }
  if (courts === 2 && format === "half") {
    return {
      tone: "good",
      title: "两片场，刚好一个晚上",
      body: `每人 4 场，${rounds} 轮，${duration}。最多连打 2 轮，最多连歇 2 轮。`,
    }
  }
  if (courts === 3 && format === "half") {
    return {
      tone: "ok",
      title: "很快，几乎不歇",
      body: `${rounds} 轮打完，每人只轮空一轮，${duration}。排在头尾轮空的人会连打 4 场。`,
    }
  }
  if (courts === 3 && format === "full" && points === 21) {
    return {
      tone: "warn",
      title: "最快，但连着打",
      body: `3 片场全循环只要 ${rounds} 轮，${duration}。每人只轮空一轮，会有人连打 6 场。21 分偏累，体力一般就改 11 或 15 分。`,
    }
  }
  if (courts === 3 && format === "full") {
    return {
      tone: "good",
      title: "最快的公平赛",
      body: `7 轮打完，每轮 3 场同时进行，1 人轮空，${duration}。谁跟谁都交手一次。`,
    }
  }
  if (courts === 1 && format === "full") {
    return {
      tone: "ok",
      title: "能打完，留一下午",
      body: `全循环 21 场串成一场接一场，${duration}。没有连打，但每次仍有 5 个人在等。`,
    }
  }
  return {
    tone: "ok",
    title: courts === 1 ? "等的人比较多" : "场次已经对齐",
    body: `${courts} 片场、每人 ${gamesPerPlayer(format)} 场，${duration}。`,
  }
}
