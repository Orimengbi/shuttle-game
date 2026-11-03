import { deleteScorer, setCourts, setPassword } from "@/lib/accounts"
import { apiError, apiJson, readBody, readSessionUser } from "@/lib/api"

export const dynamic = "force-dynamic"

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const body = await readBody(request)
  const actor = await readSessionUser()
  if (!("password" in body) && !("courts" in body)) return apiJson({ error: "没有要改的内容" }, 400)
  if ("courts" in body) {
    const result = setCourts(actor, id, body.courts)
    if ("error" in result) return apiError(result)
  }
  if ("password" in body) {
    const result = setPassword(actor, id, body.password)
    if ("error" in result) return apiError(result)
  }
  return apiJson({ ok: true })
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const result = deleteScorer(await readSessionUser(), id)
  if ("error" in result) return apiError(result)
  return apiJson(result)
}
