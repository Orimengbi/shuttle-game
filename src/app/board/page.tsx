import type { Metadata } from "next"

import { ScheduleBoard } from "@/components/schedule-board"

export const metadata: Metadata = {
  title: "赛程表 · 南方月赛",
  description: "四个场地的出场顺序和比分。只显示，不改分。",
}

export default function BoardPage() {
  return <ScheduleBoard />
}
