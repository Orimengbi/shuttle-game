import * as XLSX from "xlsx"

import { fixtureRows, type RelayEvent } from "@/lib/relay"

const NOTE = [
  ["每组 4 对双打，每对填 2 个人，一共 8 人，再填男单和女单。不要改轮次、批次、主队、客队。"],
  ["单号场两对、双号场两对，四对都是不同的人。同一组每一行要完全一致。"],
  ["带🌸的是女生。每人只能打一个位置。"],
  ["填好后回到页面，点「导入对阵表」。"],
]

export function relayWorkbook(event: RelayEvent): Buffer {
  const book = XLSX.utils.book_new()
  const sheet = XLSX.utils.aoa_to_sheet(fixtureRows(event))
  sheet["!cols"] = fixtureRows(event)[0].map((title) => ({ wch: Math.max(title.length * 2, 12) }))
  XLSX.utils.book_append_sheet(book, sheet, "对阵")
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(NOTE), "说明")
  return XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer
}

export function rowsFromUpload(data: Buffer, filename: string): string[][] | { error: string } {
  let book: XLSX.WorkBook
  try {
    const csv = /\.csv$/i.test(filename)
    book = XLSX.read(data, { type: "buffer", raw: false, codepage: csv ? 65001 : undefined })
  } catch {
    return { error: "这个表格打不开，请用下载的对阵表填写" }
  }
  const named = book.SheetNames.find((name) => name.trim() === "对阵")
  const order = named ? [named, ...book.SheetNames.filter((name) => name !== named)] : book.SheetNames
  for (const name of order) {
    const sheet = book.Sheets[name]
    if (!sheet) continue
    const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" }) as unknown[][]
    const rows = grid.map((row) => (Array.isArray(row) ? row : []).map((cell) => String(cell ?? "").trim()))
    if (rows.some((row) => row.includes("主队") && row.includes("主队男单"))) return rows
  }
  return { error: "没有找到对阵表。请先下载对阵表，填好人员后再导入。" }
}
