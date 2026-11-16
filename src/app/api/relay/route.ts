import { readRelay } from "@/lib/accounts"
import { apiJson, readSessionUser } from "@/lib/api"
import { presentRelay } from "@/lib/relay"

export const dynamic = "force-dynamic"

export async function GET() {
  const user = await readSessionUser()
  return apiJson({ event: presentRelay(readRelay(), user) })
}
