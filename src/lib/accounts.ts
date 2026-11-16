import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"

import type { CourtId, PublicUser, Role } from "@/lib/auth-types"
import {
  buildFixtures,
  assignLineup,
  canCaptainScore,
  emptyRelay,
  hasScores,
  lineupLocked,
  presentRelay,
  relaysDone,
  segmentStaffed,
  teamsFromFixtureSheet,
  validateTeamDraft,
  type RelayEvent,
  type RelaySegment,
  type RelaySegmentScore,
  type RelayTeam,
} from "@/lib/relay"
import { novemberTournament, type Tournament } from "@/lib/tournament"
import { courtIdOf, expectedPlayers, pointsOf, type Score } from "@/lib/yuesai"

export const SESSION_COOKIE = "yuesai_session"

const SESSION_MS = 14 * 24 * 60 * 60 * 1000

type UserRecord = PublicUser & {
  salt: string
  passwordHash: string
}

type SessionRecord = {
  hash: string
  userId: string
  expiresAt: number
}

export type RelayCaptainAccount = {
  teamId: string
  userId: string
  username: string
  password: string
}

type Store = {
  users: UserRecord[]
  sessions: SessionRecord[]
  tournaments: Tournament[]
  scores: Record<string, Record<string, Score>>
  relay: RelayEvent | null
  relayCaptains: RelayCaptainAccount[]
}

const dataDir = path.join(process.cwd(), "data")
const storePath = path.join(dataDir, "store.json")
const adminPasswordPath = path.join(dataDir, "admin-password.txt")

function emptyStore(): Store {
  return { users: [], sessions: [], tournaments: [], scores: {}, relay: null, relayCaptains: [] }
}

function readStore(): Store {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(storePath, "utf8"))
    if (!parsed || typeof parsed !== "object") return emptyStore()
    const raw = parsed as {
      users?: UserRecord[]
      sessions?: SessionRecord[]
      tournaments?: Tournament[]
      scores?: unknown
      relay?: RelayEvent | null
      relayCaptains?: RelayCaptainAccount[]
    }
    return {
      users: Array.isArray(raw.users) ? raw.users : [],
      sessions: Array.isArray(raw.sessions) ? raw.sessions : [],
      tournaments: Array.isArray(raw.tournaments) ? raw.tournaments : [],
      scores: raw.scores && typeof raw.scores === "object" ? (raw.scores as Store["scores"]) : {},
      relay: raw.relay && typeof raw.relay === "object" ? raw.relay : null,
      relayCaptains: Array.isArray(raw.relayCaptains) ? raw.relayCaptains : [],
    }
  } catch {
    return emptyStore()
  }
}

function writeStore(store: Store) {
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 })
  const tmp = `${storePath}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(store), { mode: 0o600 })
  fs.renameSync(tmp, storePath)
}

function hashPassword(password: string, salt: Buffer): string {
  return crypto.scryptSync(password, salt, 32).toString("hex")
}

function passwordMatches(password: string, user: UserRecord): boolean {
  const actual = Buffer.from(hashPassword(password, Buffer.from(user.salt, "hex")), "hex")
  const expected = Buffer.from(user.passwordHash, "hex")
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected)
}

function randomPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  const bytes = crypto.randomBytes(8)
  return [...bytes].map((byte) => alphabet[byte % alphabet.length]).join("")
}

function publicOf(user: UserRecord): PublicUser {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    courts: [...(user.courts ?? [])],
    ...(user.teamId ? { teamId: user.teamId } : {}),
  }
}

function ensureAdmin(store: Store) {
  if (store.users.some((user) => user.role === "admin")) return
  const password = randomPassword()
  const salt = crypto.randomBytes(16)
  store.users.push({
    id: crypto.randomUUID(),
    username: "admin",
    role: "admin",
    courts: [],
    salt: salt.toString("hex"),
    passwordHash: hashPassword(password, salt),
  })
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 })
  fs.writeFileSync(adminPasswordPath, `admin ${password}\n`, { mode: 0o600 })
}

function load(): Store {
  const store = readStore()
  const before = store.users.length
  ensureAdmin(store)
  const normalized = normalizeUsers(store)
  const booksReady = ensureTournaments(store)
  const relayReady = ensureRelay(store)
  const captainsReady = ensureRelayCaptains(store)
  const now = Date.now()
  const sessions = store.sessions.filter((session) => session.expiresAt > now)
  const changed = booksReady || relayReady || captainsReady || normalized || sessions.length !== store.sessions.length || store.users.length !== before
  store.sessions = sessions
  if (changed) writeStore(store)
  return store
}

function isCourt(value: unknown): value is CourtId {
  return value === "1" || value === "2" || value === "3" || value === "4"
}

function normalizeUsers(store: Store): boolean {
  let changed = false
  for (const user of store.users) {
    const raw = user as UserRecord & { court?: unknown; courts?: unknown }
    const courts = Array.isArray(raw.courts) ? raw.courts.filter(isCourt) : isCourt(raw.court) ? [raw.court] : []
    const same =
      Array.isArray(raw.courts) && raw.courts.length === courts.length && raw.courts.every((item, index) => item === courts[index])
    if (!same) {
      user.courts = courts
      changed = true
    }
    if ("court" in raw) {
      delete raw.court
      changed = true
    }
  }
  return changed
}

function isFlatScoreMap(value: unknown): value is Record<string, Score> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  return Object.values(value).some((item) => item && typeof item === "object" && "scoreA" in item)
}

function ensureTournaments(store: Store): boolean {
  let changed = false
  if (!Array.isArray(store.tournaments) || store.tournaments.length === 0) {
    const scores = isFlatScoreMap(store.scores) ? store.scores : {}
    store.tournaments = [novemberTournament()]
    store.scores = { [novemberTournament().id]: scores }
    return true
  }
  if (isFlatScoreMap(store.scores)) {
    const live = store.tournaments.find((item) => item.status === "live") ?? store.tournaments[0]
    store.scores = { [live.id]: store.scores }
    changed = true
  }
  if (!store.scores || typeof store.scores !== "object" || Array.isArray(store.scores)) {
    store.scores = {}
    changed = true
  }
  for (const tournament of store.tournaments) {
    if (!store.scores[tournament.id]) {
      store.scores[tournament.id] = {}
      changed = true
    }
  }
  return changed
}

function ensureRelay(store: Store): boolean {
  if (!store.relay || !store.relay.id) {
    store.relay = emptyRelay()
    return true
  }
  if (store.relay.startsAt === undefined) {
    store.relay.startsAt = null
    return true
  }
  return false
}

function ensureRelayCaptains(store: Store): boolean {
  const relay = store.relay
  if (!relay || relay.teams.length === 0) return false
  if (!Array.isArray(store.relayCaptains)) store.relayCaptains = []
  let changed = false
  for (const team of relay.teams) {
    const user = store.users.find((item) => item.role === "captain" && item.teamId === team.id)
    if (user && store.relayCaptains.some((item) => item.userId === user.id)) continue
    if (user) continue
    const username = uniqueUsername(store, team.id.replace(/[^A-Za-z0-9]/g, "").slice(0, 4) || "T")
    const password = randomPassword()
    const salt = crypto.randomBytes(16)
    const created: UserRecord = {
      id: crypto.randomUUID(),
      username,
      role: "captain",
      courts: [],
      teamId: team.id,
      salt: salt.toString("hex"),
      passwordHash: hashPassword(password, salt),
    }
    store.users.push(created)
    store.relayCaptains = store.relayCaptains.filter((item) => item.teamId !== team.id)
    store.relayCaptains.push({ teamId: team.id, userId: created.id, username, password })
    changed = true
  }
  return changed
}

function uniqueUsername(store: Store, prefix: string): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const bytes = crypto.randomBytes(4)
    const suffix = [...bytes].map((byte) => alphabet[byte % alphabet.length]).join("")
    const username = `${prefix}${suffix}`.slice(0, 20)
    if (!store.users.some((user) => sameName(user.username, username))) return username
  }
  return `${prefix}${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`.slice(0, 20)
}

function liveTournament(store: Store): Tournament | null {
  return store.tournaments.find((item) => item.status === "live") ?? null
}

function cleanTitle(value: unknown): string | null {
  if (typeof value !== "string") return null
  const title = value.trim()
  if (title.length < 2 || title.length > 40) return null
  return title
}

function cleanUsername(value: unknown): string | null {
  if (typeof value !== "string") return null
  const username = value.trim()
  if (!/^[\p{L}\p{N}_.-]{1,20}$/u.test(username)) return null
  return username
}

function cleanPassword(value: unknown): string | null {
  if (typeof value !== "string") return null
  if (value.length < 4 || value.length > 64) return null
  return value
}

function sameName(left: string, right: string): boolean {
  return left.localeCompare(right, undefined, { sensitivity: "accent" }) === 0
}

export function userFromToken(token: string | undefined): PublicUser | null {
  const store = load()
  if (!token) return null
  const hash = crypto.createHash("sha256").update(token).digest("hex")
  const session = store.sessions.find((item) => item.hash === hash)
  if (!session) return null
  const user = store.users.find((item) => item.id === session.userId)
  return user ? publicOf(user) : null
}

export function login(username: unknown, password: unknown): { user: PublicUser; token: string } | null {
  const name = cleanUsername(username)
  const secret = typeof password === "string" ? password : ""
  if (!name || !secret) return null
  const store = load()
  const user = store.users.find((item) => sameName(item.username, name))
  if (!user || !passwordMatches(secret, user)) return null
  const token = crypto.randomBytes(32).toString("hex")
  store.sessions.push({
    hash: crypto.createHash("sha256").update(token).digest("hex"),
    userId: user.id,
    expiresAt: Date.now() + SESSION_MS,
  })
  writeStore(store)
  return { user: publicOf(user), token }
}

export function logout(token: string | undefined) {
  if (!token) return
  const store = load()
  const hash = crypto.createHash("sha256").update(token).digest("hex")
  store.sessions = store.sessions.filter((session) => session.hash !== hash)
  writeStore(store)
}

export function listScorers(actor: PublicUser | null): { users: PublicUser[] } | { error: string; status: number } {
  if (!actor) return { error: "先登录", status: 401 }
  if (actor.role !== "admin") return { error: "只有管理能看账号", status: 403 }
  const store = load()
  return { users: store.users.filter((user) => user.role === "scorer").map(publicOf) }
}

export function createScorer(
  actor: PublicUser | null,
  input: { username?: unknown; password?: unknown }
): { user: PublicUser } | { error: string; status: number } {
  if (!actor) return { error: "先登录", status: 401 }
  if (actor.role !== "admin") return { error: "只有管理能开账号", status: 403 }
  const username = cleanUsername(input.username)
  const password = cleanPassword(input.password)
  if (!username || !password) return { error: "账号用 1 到 20 位字母、数字或中文，密码至少 4 位", status: 400 }
  const store = load()
  if (store.users.some((user) => sameName(user.username, username))) return { error: "这个账号已经有了", status: 409 }
  const salt = crypto.randomBytes(16)
  const user: UserRecord = {
    id: crypto.randomUUID(),
    username,
    role: "scorer" satisfies Role,
    courts: [],
    salt: salt.toString("hex"),
    passwordHash: hashPassword(password, salt),
  }
  store.users.push(user)
  writeStore(store)
  return { user: publicOf(user) }
}

export function setCourts(
  actor: PublicUser | null,
  id: string,
  value: unknown
): { user: PublicUser } | { error: string; status: number } {
  if (!actor) return { error: "先登录", status: 401 }
  if (actor.role !== "admin") return { error: "只有管理能分权限", status: 403 }
  if (!Array.isArray(value) || value.some((item) => !isCourt(item))) return { error: "场地不对", status: 400 }
  const courts = [...new Set(value.filter(isCourt))]
  const store = load()
  const user = store.users.find((item) => item.id === id && item.role === "scorer")
  if (!user) return { error: "没有这个记分员", status: 404 }
  user.courts = courts
  writeStore(store)
  return { user: publicOf(user) }
}

export function changeOwnPassword(
  actor: PublicUser | null,
  current: unknown,
  next: unknown,
  confirm: unknown
): { ok: true } | { error: string; status: number } {
  if (!actor) return { error: "先登录", status: 401 }
  if (actor.role !== "admin") return { error: "只有管理能改这个密码", status: 403 }
  const currentText = typeof current === "string" ? current : ""
  const nextText = cleanPassword(next)
  if (!nextText) return { error: "新密码至少 4 位", status: 400 }
  if (typeof confirm !== "string" || confirm !== nextText) return { error: "两次新密码不一致", status: 400 }
  const store = load()
  const user = store.users.find((item) => item.id === actor.id && item.role === "admin")
  if (!user || !passwordMatches(currentText, user)) return { error: "当前密码不对", status: 400 }
  const salt = crypto.randomBytes(16)
  user.salt = salt.toString("hex")
  user.passwordHash = hashPassword(nextText, salt)
  store.sessions = store.sessions.filter((session) => session.userId !== user.id)
  writeStore(store)
  fs.writeFileSync(adminPasswordPath, `${user.username} ${nextText}\n`, { mode: 0o600 })
  return { ok: true }
}

export function setPassword(
  actor: PublicUser | null,
  id: string,
  password: unknown
): { ok: true } | { error: string; status: number } {
  if (!actor) return { error: "先登录", status: 401 }
  if (actor.role !== "admin") return { error: "只有管理能改密码", status: 403 }
  const next = cleanPassword(password)
  if (!next) return { error: "密码至少 4 位", status: 400 }
  const store = load()
  const user = store.users.find((item) => item.id === id)
  if (!user) return { error: "没有这个账号", status: 404 }
  const salt = crypto.randomBytes(16)
  user.salt = salt.toString("hex")
  user.passwordHash = hashPassword(next, salt)
  store.sessions = store.sessions.filter((session) => session.userId !== user.id)
  writeStore(store)
  if (user.role === "admin") {
    fs.writeFileSync(adminPasswordPath, `${user.username} ${next}\n`, { mode: 0o600 })
  }
  return { ok: true }
}

export function deleteScorer(actor: PublicUser | null, id: string): { ok: true } | { error: string; status: number } {
  if (!actor) return { error: "先登录", status: 401 }
  if (actor.role !== "admin") return { error: "只有管理能删账号", status: 403 }
  const store = load()
  const user = store.users.find((item) => item.id === id)
  if (!user || user.role !== "scorer") return { error: "没有这个记分员", status: 404 }
  store.users = store.users.filter((item) => item.id !== id)
  store.sessions = store.sessions.filter((session) => session.userId !== id)
  writeStore(store)
  return { ok: true }
}

export function listTournaments(): { tournaments: Tournament[] } {
  const store = load()
  const tournaments = store.tournaments.slice().sort((left, right) => {
    if (left.status !== right.status) return left.status === "live" ? -1 : 1
    return right.createdAt.localeCompare(left.createdAt)
  })
  return { tournaments }
}

export function createTournament(
  actor: PublicUser | null,
  title: unknown
): { tournament: Tournament } | { error: string; status: number } {
  if (!actor) return { error: "先登录", status: 401 }
  if (actor.role !== "admin") return { error: "只有管理能新建月赛", status: 403 }
  const name = cleanTitle(title)
  if (!name) return { error: "名称用 2 到 40 个字", status: 400 }
  const store = load()
  if (store.tournaments.some((item) => item.title === name)) return { error: "已经有这个名称", status: 409 }
  const now = new Date().toISOString()
  for (const tournament of store.tournaments) {
    if (tournament.status === "live") {
      tournament.status = "archived"
      tournament.archivedAt = now
    }
  }
  const tournament: Tournament = {
    id: crypto.randomUUID(),
    title: name,
    status: "live",
    createdAt: now,
    archivedAt: null,
  }
  store.tournaments.unshift(tournament)
  store.scores[tournament.id] = {}
  writeStore(store)
  return { tournament }
}

export function archiveLive(actor: PublicUser | null): { tournament: Tournament } | { error: string; status: number } {
  if (!actor) return { error: "先登录", status: 401 }
  if (actor.role !== "admin") return { error: "只有管理能归档", status: 403 }
  const store = load()
  const tournament = liveTournament(store)
  if (!tournament) return { error: "没有正在进行的月赛", status: 409 }
  tournament.status = "archived"
  tournament.archivedAt = new Date().toISOString()
  writeStore(store)
  return { tournament }
}

export function readScorebook(tournamentId?: string): { tournament: Tournament | null; scores: Record<string, Score> } {
  const store = load()
  const tournament = tournamentId
    ? store.tournaments.find((item) => item.id === tournamentId) ?? null
    : liveTournament(store) ?? null
  if (!tournament) return { tournament: null, scores: {} }
  return { tournament, scores: store.scores[tournament.id] ?? {} }
}

function isScore(value: unknown, id: string, scores: Record<string, Score>): Score | null {
  if (!value || typeof value !== "object") return null
  const score = value as Score
  const players = expectedPlayers(id, scores)
  if (!players) return null
  if (score.a !== players.a || score.b !== players.b) return null
  if (!Number.isInteger(score.scoreA) || !Number.isInteger(score.scoreB)) return null
  const cap = pointsOf(id)
  if (cap === null || score.scoreA < 0 || score.scoreB < 0 || score.scoreA > cap || score.scoreB > cap) return null
  if (score.scoreA === cap && score.scoreB === cap) return null
  if (typeof score.done !== "boolean") return null
  const server = score.server === "b" ? "b" : "a"
  const first = score.first === "b" ? "b" : "a"
  const rally = cleanRally(score.rally, score.scoreA, score.scoreB)
  return { a: score.a, b: score.b, scoreA: score.scoreA, scoreB: score.scoreB, done: score.done, server, first, rally }
}

function cleanRally(value: unknown, scoreA: number, scoreB: number): string {
  if (typeof value !== "string" || value.length !== scoreA + scoreB) return ""
  let a = 0
  let b = 0
  for (const mark of value) {
    if (mark === "a") a += 1
    else if (mark === "b") b += 1
    else return ""
  }
  return a === scoreA && b === scoreB ? value : ""
}

export function putScore(
  actor: PublicUser | null,
  id: string,
  body: unknown
): { ok: true } | { error: string; status: number } {
  if (!actor) return { error: "先登录", status: 401 }
  const court = courtIdOf(id)
  if (!court) return { error: "没有这场比赛", status: 404 }
  if (actor.role !== "admin" && !actor.courts.includes(court)) {
    return { error: "这个场地还没分给你", status: 403 }
  }
  const store = load()
  const tournament = liveTournament(store)
  if (!tournament) return { error: "这一届已归档，新建下一届后才能记分", status: 409 }
  const book = store.scores[tournament.id] ?? {}
  const score = isScore(body, id, book)
  if (!score) return { error: "这场对阵还不能记这个分", status: 400 }
  book[id] = score
  store.scores[tournament.id] = book
  writeStore(store)
  return { ok: true }
}

export function resetScores(actor: PublicUser | null): { ok: true } | { error: string; status: number } {
  if (!actor) return { error: "先登录", status: 401 }
  if (actor.role !== "admin") return { error: "只有管理能清空全部比分", status: 403 }
  const store = load()
  const tournament = liveTournament(store)
  if (!tournament) return { error: "这一届已归档，没有可清空的比分", status: 409 }
  store.scores[tournament.id] = {}
  writeStore(store)
  return { ok: true }
}

function canScore(actor: PublicUser | null): boolean {
  return actor?.role === "admin" || actor?.role === "scorer"
}

export function readRelay(): RelayEvent {
  const relay = load().relay ?? emptyRelay()
  return { ...relay, startsAt: relay.startsAt ?? null }
}

export function listRelayCaptains(
  actor: PublicUser | null
): { accounts: { teamId: string; teamName: string; username: string; password: string }[] } | { error: string; status: number } {
  if (!actor) return { error: "先登录", status: 401 }
  if (actor.role !== "admin") return { error: "只有管理能看队伍账号", status: 403 }
  const store = load()
  const relay = store.relay ?? emptyRelay()
  const accounts = (store.relayCaptains ?? []).flatMap((item) => {
    const team = relay.teams.find((team) => team.id === item.teamId)
    if (!team) return []
    return [{ teamId: item.teamId, teamName: team.name, username: item.username, password: item.password }]
  })
  return { accounts }
}

export function setRelayStart(
  actor: PublicUser | null,
  value: unknown
): { event: RelayEvent } | { error: string; status: number } {
  if (!actor) return { error: "先登录", status: 401 }
  if (actor.role !== "admin") return { error: "只有管理能定开赛时间", status: 403 }
  const store = load()
  const current = store.relay ?? emptyRelay()
  if (value === null || value === "") {
    current.startsAt = null
  } else if (typeof value === "string" && Number.isFinite(Date.parse(value))) {
    current.startsAt = new Date(value).toISOString()
  } else {
    return { error: "开赛时间不对", status: 400 }
  }
  store.relay = current
  writeStore(store)
  return { event: presentRelay(readRelay(), actor) }
}

export function updateRelayLineup(
  actor: PublicUser | null,
  teamId: unknown,
  input: unknown
): { event: RelayEvent } | { error: string; status: number } {
  if (!actor) return { error: "先登录", status: 401 }
  if (typeof teamId !== "string" || !teamId) return { error: "没有这支队伍", status: 400 }
  if (actor.role === "captain" && actor.teamId !== teamId) return { error: "只能改自己队的出阵", status: 403 }
  if (actor.role !== "admin" && actor.role !== "captain") return { error: "不能改出阵", status: 403 }
  const store = load()
  const current = store.relay
  if (!current) return { error: "还没有这场接力赛", status: 404 }
  if (lineupLocked(current.startsAt)) return { error: "开赛前 1 小时已锁定出阵", status: 409 }
  const team = current.teams.find((item) => item.id === teamId)
  if (!team) return { error: "没有这支队伍", status: 404 }
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {}
  const pair = (key: string): [string, string] | null => {
    const value = raw[key]
    if (!Array.isArray(value) || value.length < 2) return null
    if (typeof value[0] !== "string" || typeof value[1] !== "string") return null
    return [value[0].trim(), value[1].trim()]
  }
  const text = (key: string) => (typeof raw[key] === "string" ? raw[key].trim() : null)
  const r1xd = pair("r1xd")
  const r1md = pair("r1md")
  const r2md = pair("r2md")
  const r2xd = pair("r2xd")
  const ms = text("ms")
  const ws = text("ws")
  if (!r1xd || !r1md || !r2md || !r2xd || ms === null || ws === null) return { error: "出阵格式不对", status: 400 }
  const assigned = assignLineup(team, { r1xd, r1md, r2md, r2xd, ms, ws })
  if ("error" in assigned) return { error: assigned.error, status: 400 }
  const index = current.teams.findIndex((item) => item.id === teamId)
  current.teams[index] = assigned.team
  store.relay = current
  writeStore(store)
  return { event: presentRelay(readRelay(), actor) }
}

export function saveRelayTeams(
  actor: PublicUser | null,
  input: unknown
): { event: RelayEvent } | { error: string; status: number } {
  if (!actor) return { error: "先登录", status: 401 }
  if (actor.role !== "admin") return { error: "只有管理能录入队伍", status: 403 }
  if (!Array.isArray(input)) return { error: "队伍格式不对", status: 400 }
  const store = load()
  const current = store.relay ?? emptyRelay()
  if (lineupLocked(current.startsAt)) return { error: "开赛前 1 小时已锁定出阵", status: 409 }
  if (hasScores(current)) return { error: "已经开始记分，不能再改队伍", status: 409 }
  const teams: RelayTeam[] = input.map((item) => normalizeTeam(item))
  const problem = validateTeamDraft(teams)
  if (problem) return { error: problem, status: 400 }
  store.relay = { ...current, teams, fixtures: [] }
  writeStore(store)
  return { event: store.relay }
}

function normalizeTeam(value: unknown): RelayTeam {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {}
  const text = (key: string) => (typeof raw[key] === "string" ? raw[key].trim() : "")
  const pair = (key: string): [string, string] => {
    const value = raw[key]
    if (!Array.isArray(value)) return ["", ""]
    return [typeof value[0] === "string" ? value[0].trim() : "", typeof value[1] === "string" ? value[1].trim() : ""]
  }
  const members = Array.isArray(raw.members) ? raw.members.filter((item): item is string => typeof item === "string").map((item) => item.trim()) : []
  while (members.length < 10) members.push("")
  const id = typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : crypto.randomUUID()
  return {
    id,
    name: text("name"),
    members: members.slice(0, 10),
    r1xd: pair("r1xd"),
    r1md: pair("r1md"),
    r2md: pair("r2md"),
    r2xd: pair("r2xd"),
    ms: text("ms"),
    ws: text("ws"),
  }
}

export function generateRelay(actor: PublicUser | null): { event: RelayEvent } | { error: string; status: number } {
  if (!actor) return { error: "先登录", status: 401 }
  if (actor.role !== "admin") return { error: "只有管理能生成赛程", status: 403 }
  const store = load()
  const current = store.relay ?? emptyRelay()
  if (lineupLocked(current.startsAt)) return { error: "开赛前 1 小时已锁定出阵", status: 409 }
  if (hasScores(current)) return { error: "已经开始记分，不能重新生成", status: 409 }
  const problem = validateTeamDraft(current.teams)
  if (problem) return { error: problem, status: 400 }
  store.relay = { ...current, fixtures: buildFixtures(current.teams.map((team) => team.id)) }
  writeStore(store)
  return { event: store.relay }
}

export function importRelayTeams(
  actor: PublicUser | null,
  rows: string[][]
): { event: RelayEvent } | { error: string; status: number } {
  if (!actor) return { error: "先登录", status: 401 }
  if (actor.role !== "admin") return { error: "只有管理能导入对阵表", status: 403 }
  const store = load()
  const current = store.relay ?? emptyRelay()
  if (lineupLocked(current.startsAt)) return { error: "开赛前 1 小时已锁定出阵", status: 409 }
  if (current.fixtures.length === 0) return { error: "先生成循环赛，再导入人员", status: 409 }
  if (hasScores(current)) return { error: "已经开始记分，不能再改人员", status: 409 }
  const parsed = teamsFromFixtureSheet(current, rows)
  if ("error" in parsed) return { error: parsed.error, status: 400 }
  current.teams = parsed.teams
  store.relay = current
  writeStore(store)
  return { event: current }
}

export function scoreRelay(
  actor: PublicUser | null,
  fixtureId: string,
  segment: RelaySegment,
  body: unknown
): { event: RelayEvent } | { error: string; status: number } {
  if (segment !== "relay1" && segment !== "relay2" && segment !== "ms" && segment !== "ws") {
    return { error: "没有这个项目", status: 400 }
  }
  const store = load()
  const current = store.relay
  if (!current) return { error: "还没有这场接力赛", status: 404 }
  const fixture = current.fixtures.find((item) => item.id === fixtureId)
  if (!fixture) return { error: "没有这场对抗", status: 404 }
  if (!actor) return { error: "先登录记分员账号", status: 401 }
  if (actor.role === "captain") {
    if (!actor.teamId || (fixture.home !== actor.teamId && fixture.away !== actor.teamId)) {
      return { error: "只能记自己组的比赛", status: 403 }
    }
    if (!canCaptainScore(current.startsAt, actor.teamId, fixture)) return { error: "开赛后才能记分", status: 409 }
  } else if (!canScore(actor)) {
    return { error: "先登录记分员账号", status: 401 }
  }
  if (!segmentStaffed(current, fixture, segment)) return { error: "先导入人员再记分", status: 409 }
  if ((segment === "ms" || segment === "ws") && !relaysDone(fixture)) {
    return { error: "接力赛打完再开始单打", status: 409 }
  }
  const next = cleanSegment(body, segment === "ms" || segment === "ws" ? "single" : "relay", fixture[segment])
  if (!next) return { error: "这个比分不对", status: 400 }
  fixture[segment] = next
  writeStore(store)
  return { event: current }
}

function cleanSegment(value: unknown, kind: "relay" | "single", previous: RelaySegmentScore): RelaySegmentScore | null {
  if (!value || typeof value !== "object") return null
  const raw = value as RelaySegmentScore
  if (!Number.isInteger(raw.home) || !Number.isInteger(raw.away)) return null
  if (raw.home < 0 || raw.away < 0) return null
  const cap = kind === "single" ? 21 : 42
  if (raw.home > cap || raw.away > cap || (raw.home === cap && raw.away === cap)) return null
  const homeStep = Math.abs(raw.home - previous.home)
  const awayStep = Math.abs(raw.away - previous.away)
  if (homeStep + awayStep > 1) return null
  if (raw.home === previous.home + 1 && raw.server !== "home") return null
  if (raw.away === previous.away + 1 && raw.server !== "away") return null
  if (raw.done) {
    const target = kind === "single" ? 21 : 42
    if (Math.max(raw.home, raw.away) < target || raw.home === raw.away) return null
  }
  if (typeof raw.done !== "boolean") return null
  if (raw.server !== "home" && raw.server !== "away") return null
  if (raw.first !== "home" && raw.first !== "away") return null
  const rally = typeof raw.rally === "string" ? raw.rally : ""
  return { home: raw.home, away: raw.away, done: raw.done, server: raw.server, first: raw.first, rally }
}
