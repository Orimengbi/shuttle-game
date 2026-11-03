import { logout } from "@/lib/accounts"
import { apiJson, clearSessionCookie } from "@/lib/api"

export const dynamic = "force-dynamic"

export async function POST() {
  const token = await clearSessionCookie()
  logout(token)
  return apiJson({ ok: true })
}
