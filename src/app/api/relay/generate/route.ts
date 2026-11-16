import { generateRelay } from "@/lib/accounts"
import { apiError, apiJson, readSessionUser } from "@/lib/api"

export const dynamic = "force-dynamic"

export async function POST() {
  const result = generateRelay(await readSessionUser())
  if ("error" in result) return apiError(result)
  return apiJson(result)
}
