import { saveRelayTeams } from "@/lib/accounts"
import { apiError, apiJson, readSessionUser } from "@/lib/api"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const teams = body && typeof body === "object" && "teams" in body ? body.teams : null
  const result = saveRelayTeams(await readSessionUser(), teams)
  if ("error" in result) return apiError(result)
  return apiJson(result)
}
