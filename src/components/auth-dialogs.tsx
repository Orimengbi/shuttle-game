"use client"

import { useEffect, useId, useState, type FormEvent } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { COURTS, type PublicUser } from "@/lib/auth-types"

async function readError(response: Response): Promise<string> {
  const body: { error?: unknown } = await response.json().catch(() => ({}))
  return typeof body.error === "string" ? body.error : "没完成"
}

export function PasswordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>修改管理密码</DialogTitle>
          <DialogDescription>先填现在的密码，再设一个新的。至少 4 位。改完后，所有窗口都会退出。</DialogDescription>
        </DialogHeader>
        <PasswordForm />
      </DialogContent>
    </Dialog>
  )
}

function PasswordForm() {
  const fieldId = useId()
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError("")
    try {
      const response = await fetch("/api/password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ current, next, confirm }),
      })
      if (!response.ok) {
        setError(await readError(response))
        return
      }
      window.location.reload()
    } catch {
      setError("没改成")
    } finally {
      setPending(false)
    }
  }

  return (
    <form className="grid gap-3" onSubmit={(event) => void submit(event)}>
      <div className="grid gap-2">
        <Label htmlFor={`${fieldId}-current`}>当前密码</Label>
        <Input id={`${fieldId}-current`} className="h-11" type="password" autoComplete="current-password" value={current} onChange={(event) => setCurrent(event.target.value)} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${fieldId}-next`}>新密码</Label>
        <Input id={`${fieldId}-next`} className="h-11" type="password" autoComplete="new-password" value={next} onChange={(event) => setNext(event.target.value)} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${fieldId}-confirm`}>再输一次新密码</Label>
        <Input id={`${fieldId}-confirm`} className="h-11" type="password" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} />
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <DialogFooter>
        <Button type="submit" className="h-11" disabled={pending}>
          {pending ? "正在保存" : "保存新密码"}
        </Button>
      </DialogFooter>
    </form>
  )
}

export function LoginDialog({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: (user: PublicUser) => void
}) {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError("")
    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password }),
      })
      if (!response.ok) {
        setError(await readError(response))
        return
      }
      const body: { user: PublicUser } = await response.json()
      setPassword("")
      onSuccess(body.user)
      onOpenChange(false)
    } catch {
      setError("登录失败，稍后再试")
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>登录</DialogTitle>
          <DialogDescription>看赛程不用登录。改分要等管理开账号，并把场地权限分给你。</DialogDescription>
        </DialogHeader>
        <form className="grid gap-3" onSubmit={(event) => void submit(event)}>
          <div className="grid gap-1.5">
            <Label htmlFor="login-username">账号</Label>
            <Input id="login-username" className="h-11" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="login-password">密码</Label>
            <Input id="login-password" className="h-11" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="submit" className="h-11" disabled={pending}>
              {pending ? "正在登录" : "登录"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function AccountsDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [users, setUsers] = useState<PublicUser[]>([])
  const [error, setError] = useState("")
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [nextPassword, setNextPassword] = useState<Record<string, string>>({})
  const [passwordOpen, setPasswordOpen] = useState(false)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [saved, setSaved] = useState("")

  async function refresh() {
    const response = await fetch("/api/accounts", { cache: "no-store" })
    if (!response.ok) {
      setError(await readError(response))
      return
    }
    const body: { users: PublicUser[] } = await response.json()
    setUsers(body.users)
    setError("")
  }

  useEffect(() => {
    if (!open) return
    void refresh()
  }, [open])

  async function create() {
    setError("")
    setSaved("")
    const response = await fetch("/api/accounts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, password }),
    })
    if (!response.ok) {
      setError(await readError(response))
      return
    }
    setUsername("")
    setPassword("")
    setSaved("账号已开，再分场地")
    await refresh()
  }

  async function toggleCourt(user: PublicUser, court: (typeof COURTS)[number]["id"]) {
    const owned = user.courts ?? []
    const courts = owned.includes(court) ? owned.filter((item) => item !== court) : [...owned, court]
    setError("")
    setSaved("")
    const response = await fetch(`/api/accounts/${user.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ courts }),
    })
    if (!response.ok) {
      setError(await readError(response))
      return
    }
    await refresh()
  }

  async function changePassword(id: string, password: string) {
    setError("")
    const response = await fetch(`/api/accounts/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    })
    if (!response.ok) {
      setError(await readError(response))
      return
    }
    setNextPassword((current) => ({ ...current, [id]: "" }))
    setError("")
    setSaved("密码已更新")
  }

  async function remove(id: string) {
    if (confirmId !== id) {
      setConfirmId(id)
      return
    }
    setError("")
    const response = await fetch(`/api/accounts/${id}`, { method: "DELETE" })
    if (!response.ok) {
      setError(await readError(response))
      return
    }
    setConfirmId(null)
    await refresh()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>记分员账号</DialogTitle>
          <DialogDescription>先开账号。再勾他能改哪些场地的分。同一个场地可以分给多个记分员。</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <section className="rounded-2xl border border-border p-3">
            <p className="font-medium">开账号</p>
            <div className="mt-2 grid gap-2">
              <Input className="h-11" autoComplete="off" placeholder="账号" aria-label="新账号" value={username} onChange={(event) => setUsername(event.target.value)} />
              <Input className="h-11" type="password" autoComplete="new-password" placeholder="密码，至少 4 位" aria-label="新账号密码" value={password} onChange={(event) => setPassword(event.target.value)} />
              <Button type="button" className="h-11" onClick={() => void create()}>
                开账号
              </Button>
            </div>
          </section>
          {users.length === 0 ? <p className="text-sm text-muted-foreground">还没有记分员。</p> : null}
          {users.map((user) => (
            <section key={user.id} className="rounded-2xl border border-border p-3">
              <p className="font-medium">{user.username}</p>
              <p className="text-xs text-muted-foreground">{(user.courts ?? []).length === 0 ? "还没分改分权限" : `能改 ${(user.courts ?? []).map((court) => `${court}号场`).join("、")}`}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {COURTS.map((court) => {
                  const others = users
                    .filter((item) => item.id !== user.id && (item.courts ?? []).includes(court.id))
                    .map((item) => item.username)
                  const on = (user.courts ?? []).includes(court.id)
                  return (
                    <button
                      key={court.id}
                      type="button"
                      aria-pressed={on}
                      title={others.length > 0 ? `同场还有 ${others.join("、")}。${court.detail}` : court.detail}
                      onClick={() => void toggleCourt(user, court.id)}
                      className={`h-11 rounded-xl px-3 text-sm ${on ? "bg-primary text-primary-foreground" : "border border-border bg-card"}`}
                    >
                      {court.label}
                    </button>
                  )
                })}
              </div>
              <div className="mt-2 flex gap-2">
                <Input
                  className="h-11"
                  type="password"
                  autoComplete="new-password"
                  placeholder="新密码"
                  aria-label={`${user.username}的新密码`}
                  value={nextPassword[user.id] ?? ""}
                  onChange={(event) => setNextPassword((current) => ({ ...current, [user.id]: event.target.value }))}
                />
                <Button type="button" className="h-11" onClick={() => void changePassword(user.id, nextPassword[user.id] ?? "")}>
                  改密码
                </Button>
              </div>
              <Button type="button" variant="ghost" className="mt-1 h-11 justify-start px-0" onClick={() => void remove(user.id)}>
                {confirmId === user.id ? "再点一次，删除这个账号" : "删除账号"}
              </Button>
            </section>
          ))}
          <section className="rounded-2xl border border-border p-3">
            <p className="font-medium">管理密码</p>
            <Button type="button" variant="outline" className="mt-2 h-11" onClick={() => setPasswordOpen(true)}>
              修改密码
            </Button>
          </section>
          <PasswordDialog open={passwordOpen} onOpenChange={setPasswordOpen} />
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {saved ? <p className="text-sm text-primary">{saved}</p> : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
