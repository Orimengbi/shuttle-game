import { setRelayStart } from "@/lib/accounts"
import { apiError, apiJson, readBody, readSessionUser } from "@/lib/api"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const body = await readBody(request)
  const result = setRelayStart(await readSessionUser(), body.startsAt ?? null)
  if ("error" in result) return apiError(result)
  return apiJson(result)
}
