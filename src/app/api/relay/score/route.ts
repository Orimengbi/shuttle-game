import { scoreRelay } from "@/lib/accounts"
import { apiError, apiJson, readBody, readSessionUser } from "@/lib/api"
import { presentRelay, type RelaySegment } from "@/lib/relay"

export const dynamic = "force-dynamic"

export async function PUT(request: Request) {
  const body = await readBody(request)
  const fixtureId = typeof body.fixtureId === "string" ? body.fixtureId : ""
  const segment = body.segment as RelaySegment
  const user = await readSessionUser()
  const result = scoreRelay(user, fixtureId, segment, body.score)
  if ("error" in result) return apiError(result)
  return apiJson({ event: presentRelay(result.event, user) })
}
