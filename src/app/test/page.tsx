"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowLeftRight } from "lucide-react"

type Side = "a" | "b"

type Trial = {
  id: string
  event: string
  court: string
  cap: number
  left: string
  right: string
}

const TRIALS: Trial[] = [
  { id: "ms", event: "男单", court: "1号场", cap: 15, left: "试用甲", right: "试用乙" },
  { id: "md", event: "男双", court: "2号场", cap: 21, left: "试用丙 / 试用丁", right: "试用戊 / 试用己" },
  { id: "xd", event: "混双", court: "3号场", cap: 21, left: "试用庚 / 试用辛", right: "试用壬 / 试用癸" },
]

type Score = { a: number; b: number; server: Side; done: boolean }

function emptyScore(): Score {
  return { a: 0, b: 0, server: "a", done: false }
}

function capFor(score: Score, side: Side, cap: number) {
  const other = side === "a" ? score.b : score.a
  return other >= cap ? cap - 1 : cap
}

export default function TestPage() {
  const [scores, setScores] = useState<Record<string, Score>>({})
  const [flipped, setFlipped] = useState<Record<string, boolean>>({})

  function read(id: string): Score {
    return scores[id] ?? emptyScore()
  }

  function bump(id: string, side: Side, delta: number, cap: number) {
    setScores((current) => {
      const score = current[id] ?? emptyScore()
      if (score.done) return current
      const max = capFor(score, side, cap)
      const value = side === "a" ? score.a : score.b
      const nextValue = Math.max(0, Math.min(max, value + delta))
      if (nextValue === value) return current
      const next = { ...score, [side]: nextValue, server: delta > 0 ? side : score.server }
      return { ...current, [id]: next }
    })
  }

  function finish(id: string, cap: number) {
    setScores((current) => {
      const score = current[id] ?? emptyScore()
      if (Math.max(score.a, score.b) < cap || score.a === score.b) return current
      return { ...current, [id]: { ...score, done: true } }
    })
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-4 py-5 sm:px-6 sm:py-8">
      <header className="banner relative mb-4 overflow-hidden rounded-3xl">
        <div className="court-grid pointer-events-none absolute inset-0 opacity-70" />
        <div className="relative px-5 py-4 sm:px-6">
          <p className="text-xs font-bold tracking-[0.22em] text-[#ffe14a]">TEST COURT</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-white sm:text-4xl">测试界面</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/75">
            这三场只留在这台浏览器里，刷新就没了，也不会写进正式比赛。
          </p>
        </div>
      </header>
      <div className="mb-4">
        <Link href="/" className="text-sm font-bold text-[#ffe14a]">
          返回正式站
        </Link>
      </div>
      <div className="grid gap-4">
        {TRIALS.map((trial) => {
          const score = read(trial.id)
          const swap = flipped[trial.id] ?? false
          const sides = [
            { key: "a" as const, name: trial.left, value: score.a },
            { key: "b" as const, name: trial.right, value: score.b },
          ]
          const view = swap ? [sides[1], sides[0]] : sides
          const reached = Math.max(score.a, score.b) >= trial.cap && score.a !== score.b
          return (
            <article key={trial.id} className="scoreboard rounded-3xl p-4">
              <div>
                <p className="text-xs font-bold tracking-[0.16em] text-[#ffe14a]">
                  {trial.event} · {trial.court} · 抢{trial.cap}
                </p>
                <h2 className="mt-1 text-lg font-bold text-white">
                  {trial.left} 对 {trial.right}
                </h2>
              </div>
              <div className="my-3 flex justify-center">
                <button
                  type="button"
                  className="swap-sides"
                  aria-label="换边"
                  aria-pressed={swap}
                  onClick={() => setFlipped((current) => ({ ...current, [trial.id]: !swap }))}
                >
                  <ArrowLeftRight aria-hidden="true" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {view.map((side) => {
                  const max = capFor(score, side.key, trial.cap)
                  const serving = !score.done && score.a + score.b > 0 && score.server === side.key
                  return (
                    <div key={side.key} className={`score-side rounded-2xl px-2 py-3 text-center ${serving ? "ahead" : ""}`}>
                      <p className="truncate text-sm font-bold">
                        {side.name}
                        {score.done && side.value > (side.key === "a" ? score.b : score.a) ? " · 胜" : ""}
                      </p>
                      <p className="score-num my-1 text-5xl font-bold">{side.value}</p>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          className="h-12 rounded-xl border border-white/30 text-xl text-white"
                          disabled={score.done || side.value === 0}
                          onClick={() => bump(trial.id, side.key, -1, trial.cap)}
                        >
                          −
                        </button>
                        <button
                          type="button"
                          className="h-12 rounded-xl bg-[#ffe14a] text-xl font-bold text-[#10240f]"
                          disabled={score.done || side.value >= max}
                          onClick={() => bump(trial.id, side.key, 1, trial.cap)}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
              <button
                type="button"
                className="mt-3 h-12 w-full rounded-2xl bg-[#ffe14a] font-bold text-[#10240f] disabled:opacity-40"
                disabled={!reached || score.done}
                onClick={() => finish(trial.id, trial.cap)}
              >
                {score.done ? "本场已结束" : reached ? "结束本场" : `先到 ${trial.cap} 分，且不能平局`}
              </button>
            </article>
          )
        })}
      </div>
    </main>
  )
}
