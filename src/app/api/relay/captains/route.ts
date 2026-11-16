import { listRelayCaptains } from "@/lib/accounts"
import { apiError, apiJson, readSessionUser } from "@/lib/api"

export const dynamic = "force-dynamic"

export async function GET() {
  const result = listRelayCaptains(await readSessionUser())
  if ("error" in result) return apiError(result)
  return apiJson(result)
}
