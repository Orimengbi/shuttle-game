export type Role = "admin" | "scorer" | "captain"

export type CourtId = "1" | "2" | "3" | "4"

export type PublicUser = {
  id: string
  username: string
  role: Role
  courts: CourtId[]
  teamId?: string
}

export const COURTS: { id: CourtId; label: string; detail: string }[] = [
  { id: "1", label: "1号场", detail: "男单" },
  { id: "2", label: "2号场", detail: "男双" },
  { id: "3", label: "3号场", detail: "混双 A 组、半决赛 1、三四名、决赛" },
  { id: "4", label: "4号场", detail: "混双 B 组、半决赛 2" },
]
