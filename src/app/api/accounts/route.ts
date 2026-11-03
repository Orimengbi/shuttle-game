import { createScorer, listScorers } from "@/lib/accounts"
import { apiError, apiJson, readBody, readSessionUser } from "@/lib/api"

export const dynamic = "force-dynamic"

export async function GET() {
  const result = listScorers(await readSessionUser())
  if ("error" in result) return apiError(result)
  return apiJson(result)
}

export async function POST(request: Request) {
  const result = createScorer(await readSessionUser(), await readBody(request))
  if ("error" in result) return apiError(result)
  return apiJson(result, 201)
}
