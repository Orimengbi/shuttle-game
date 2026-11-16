import { changeOwnPassword } from "@/lib/accounts"
import { apiError, apiJson, clearSessionCookie, readBody, readSessionUser } from "@/lib/api"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const body = await readBody(request)
  const result = changeOwnPassword(await readSessionUser(), body.current, body.next, body.confirm)
  if ("error" in result) return apiError(result)
  await clearSessionCookie()
  return apiJson(result)
}
