import { updateRelayLineup } from "@/lib/accounts"
import { apiError, apiJson, readBody, readSessionUser } from "@/lib/api"

export const dynamic = "force-dynamic"

export async function PUT(request: Request) {
  const body = await readBody(request)
  const result = updateRelayLineup(await readSessionUser(), body.teamId, body)
  if ("error" in result) return apiError(result)
  return apiJson(result)
}
