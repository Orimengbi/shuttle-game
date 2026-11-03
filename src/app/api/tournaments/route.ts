import { createTournament, listTournaments } from "@/lib/accounts"
import { apiError, apiJson, readBody, readSessionUser } from "@/lib/api"

export const dynamic = "force-dynamic"

export async function GET() {
  return apiJson(listTournaments())
}

export async function POST(request: Request) {
  const body = await readBody(request)
  const result = createTournament(await readSessionUser(), body.title)
  if ("error" in result) return apiError(result)
  return apiJson(result, 201)
}
