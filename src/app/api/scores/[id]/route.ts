import { putScore } from "@/lib/accounts"
import { apiError, apiJson, readSessionUser } from "@/lib/api"

export const dynamic = "force-dynamic"

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const body = await request.json().catch(() => null)
  const result = putScore(await readSessionUser(), id, body)
  if ("error" in result) return apiError(result)
  return apiJson(result)
}
