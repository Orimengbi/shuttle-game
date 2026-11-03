import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"

import type { CourtId, PublicUser, Role } from "@/lib/auth-types"
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

type Store = {
  users: UserRecord[]
  sessions: SessionRecord[]
  tournaments: Tournament[]
  scores: Record<string, Record<string, Score>>
}

const dataDir = path.join(process.cwd(), "data")
const storePath = path.join(dataDir, "store.json")
const adminPasswordPath = path.join(dataDir, "admin-password.txt")

function emptyStore(): Store {
  return { users: [], sessions: [], tournaments: [], scores: {} }
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
    }
    return {
      users: Array.isArray(raw.users) ? raw.users : [],
      sessions: Array.isArray(raw.sessions) ? raw.sessions : [],
      tournaments: Array.isArray(raw.tournaments) ? raw.tournaments : [],
      scores: raw.scores && typeof raw.scores === "object" ? (raw.scores as Store["scores"]) : {},
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
  return { id: user.id, username: user.username, role: user.role, courts: [...user.courts] }
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
  const now = Date.now()
  const sessions = store.sessions.filter((session) => session.expiresAt > now)
  const changed = booksReady || normalized || sessions.length !== store.sessions.length || store.users.length !== before
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
    : liveTournament(store) ?? store.tournaments[0] ?? null
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
  return { a: score.a, b: score.b, scoreA: score.scoreA, scoreB: score.scoreB, done: score.done }
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
