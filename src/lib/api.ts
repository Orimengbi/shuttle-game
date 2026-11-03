import { cookies } from "next/headers"

import { SESSION_COOKIE, userFromToken } from "@/lib/accounts"
import type { PublicUser } from "@/lib/auth-types"

export function apiJson(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } })
}

export async function readSessionUser(): Promise<PublicUser | null> {
  const jar = await cookies()
  return userFromToken(jar.get(SESSION_COOKIE)?.value)
}

export async function setSessionCookie(token: string) {
  const jar = await cookies()
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  })
}

export async function clearSessionCookie() {
  const jar = await cookies()
  const token = jar.get(SESSION_COOKIE)?.value
  jar.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 })
  return token
}

export function apiError(result: { error: string; status: number }) {
  return apiJson({ error: result.error }, result.status)
}

export async function readBody(request: Request): Promise<Record<string, unknown>> {
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== "object" || Array.isArray(body)) return {}
  return body as Record<string, unknown>
}
