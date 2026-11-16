import { importRelayTeams, readRelay } from "@/lib/accounts"
import { apiError, apiJson, readSessionUser } from "@/lib/api"
import { relayWorkbook, rowsFromUpload } from "@/lib/relay-workbook"

export const dynamic = "force-dynamic"

export async function GET() {
  const user = await readSessionUser()
  if (!user) return apiJson({ error: "先登录" }, 401)
  if (user.role !== "admin") return apiJson({ error: "只有管理能下载对阵表" }, 403)
  const event = readRelay()
  if (event.fixtures.length === 0) return apiJson({ error: "先生成循环赛，再下载对阵表" }, 409)
  const body = relayWorkbook(event)
  const filename = encodeURIComponent(`${event.title}对阵表.xlsx`)
  return new Response(new Uint8Array(body), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename*=UTF-8''${filename}`,
      "cache-control": "no-store",
    },
  })
}

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null)
  const file = form?.get("file")
  if (!(file instanceof File)) return apiJson({ error: "请选择填好的对阵表" }, 400)
  const parsed = rowsFromUpload(Buffer.from(await file.arrayBuffer()), file.name)
  if ("error" in parsed) return apiJson({ error: parsed.error }, 400)
  const result = importRelayTeams(await readSessionUser(), parsed)
  if ("error" in result) return apiError(result)
  return apiJson(result)
}
