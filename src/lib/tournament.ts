export type TournamentStatus = "live" | "archived"

export type Tournament = {
  id: string
  title: string
  status: TournamentStatus
  createdAt: string
  archivedAt: string | null
}

export const NOVEMBER_ID = "2026-11"

export function novemberTournament(): Tournament {
  return {
    id: NOVEMBER_ID,
    title: "南方羽毛球馆2026年11月月赛",
    status: "live",
    createdAt: "2026-11-01T00:00:00.000Z",
    archivedAt: null,
  }
}
