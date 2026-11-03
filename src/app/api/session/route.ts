import { apiJson, readSessionUser } from "@/lib/api"

export const dynamic = "force-dynamic"

export async function GET() {
  const user = await readSessionUser()
  return apiJson({ user })
}
