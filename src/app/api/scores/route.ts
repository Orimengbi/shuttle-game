import { readScorebook } from "@/lib/accounts"
import { apiJson } from "@/lib/api"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const tournament = new URL(request.url).searchParams.get("tournament") ?? undefined
  return apiJson(readScorebook(tournament))
}
