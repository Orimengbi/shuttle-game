import { login } from "@/lib/accounts"
import { apiJson, readBody, setSessionCookie } from "@/lib/api"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const body = await readBody(request)
  const result = login(body.username, body.password)
  if (!result) return apiJson({ error: "账号或密码不对" }, 401)
  await setSessionCookie(result.token)
  return apiJson({ user: result.user })
}
