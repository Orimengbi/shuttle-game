import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "测试界面 · 南方月赛",
  description: "试用记分板。这里的比分不会写入正式比赛。",
}

export default function TestLayout({ children }: { children: React.ReactNode }) {
  return children
}
