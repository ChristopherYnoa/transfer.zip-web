"use client"

import { useState } from "react"
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Plus, Loader2 } from "lucide-react"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { sendTeamInvite, previewTeamSeatPurchase } from "@/lib/client/Api"
import { ROLES } from "@/lib/roles"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

const roles = [
  { id: ROLES.ADMIN, name: "Admin", description: "Full control over team settings." },
  { id: ROLES.MEMBER, name: "Member", description: "Regular team member." },
]

function formatMoney(amount, currency) {
  const formatter = new Intl.NumberFormat(typeof navigator !== "undefined" ? navigator.language || "en-US" : "en-US", {
    style: "currency",
    currency: (currency || "usd").toUpperCase(),
  })
  return formatter.format((amount || 0) / 100)
}

export default function AddUserButton({ atCapacity = false }) {
  const router = useRouter()
  const [showModal, setShowModal] = useState(false)
  const [selectedRole, setSelectedRole] = useState(roles[1].id)
  const [error, setError] = useState("")
  const [pendingInvite, setPendingInvite] = useState(null)
  const [preview, setPreview] = useState(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const resetState = () => {
    setError("")
    setPendingInvite(null)
    setPreview(null)
    setLoadingPreview(false)
    setConfirming(false)
  }

  const submitInvite = async (email, role, autoPurchaseSeat) => {
    await sendTeamInvite(email, role, autoPurchaseSeat)
    setError("")
    resetState()
    setShowModal(false)
    toast.success(
      autoPurchaseSeat ? "Invite sent · 1 seat added" : "Invite sent",
      { description: `An invitation was sent to ${email}` }
    )
    router.refresh()
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const formData = new FormData(e.target)
    const email = formData.get("email")
    const role = formData.get("role")

    if (atCapacity) {
      setPendingInvite({ email, role })
      setLoadingPreview(true)
      setError("")
      try {
        const { preview } = await previewTeamSeatPurchase(1)
        setPreview(preview)
      } catch (err) {
        setError(err.message)
        setPendingInvite(null)
      } finally {
        setLoadingPreview(false)
      }
      return
    }

    try {
      await submitInvite(email, role, false)
    } catch (err) {
      setError(err.message)
    }
  }

  const handleConfirmPurchase = async () => {
    if (!pendingInvite) return
    setConfirming(true)
    setError("")
    try {
      await submitInvite(pendingInvite.email, pendingInvite.role, true)
    } catch (err) {
      setError(err.message)
    } finally {
      setConfirming(false)
    }
  }

  const handleCancelPurchase = () => {
    setPendingInvite(null)
    setPreview(null)
    setError("")
  }

  const selectedRoleMeta = roles.find((role) => role.id === selectedRole)
  const showConfirmStep = !!pendingInvite

  return (
    <Dialog open={showModal} onOpenChange={(open) => {
      setShowModal(open)
      resetState()
    }}>
      <DialogTrigger asChild>
        <Button variant="white"><Plus /> Add user</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        {showConfirmStep ? (
          <>
            <DialogHeader>
              <DialogTitle>Add a seat to invite {pendingInvite.email}</DialogTitle>
              <DialogDescription>
                Your team is at seat capacity. Adding 1 seat lets you send this invite.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 py-2">
              {loadingPreview || !preview ? (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Loader2 className="animate-spin" size={16} /> Calculating prorated cost...
                </div>
              ) : (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm">
                  <div className="flex justify-between text-gray-600">
                    <span>1 additional seat ({preview.interval === "year" ? "yearly" : "monthly"})</span>
                    <span>{formatMoney(preview.unitAmount, preview.currency)}</span>
                  </div>
                  <div className="mt-2 flex justify-between font-semibold text-gray-900">
                    <span>Due now (prorated)</span>
                    <span>{formatMoney(preview.amountDue, preview.currency)}</span>
                  </div>
                  <p className="mt-2 text-xs text-gray-500">
                    Charged to your card on file. Your subscription renews with {preview.targetQuantity} seats.
                  </p>
                </div>
              )}
              {error && <span className="text-xs text-red-400">{error}</span>}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleCancelPurchase} disabled={confirming}>
                Back
              </Button>
              <Button type="button" onClick={handleConfirmPurchase} disabled={confirming || loadingPreview || !preview}>
                {confirming ? <><Loader2 className="animate-spin" size={16} /> Adding seat...</> : "Add seat & invite"}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Add a team member</DialogTitle>
              <DialogDescription>
                Invite a teammate by email and assign their role.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="new-user-email">Email</Label>
                  <Input
                    id="new-user-email"
                    name="email"
                    type="email"
                    placeholder="name@company.com"
                    required
                  />
                  {atCapacity && (
                    <p className="text-xs text-amber-700">
                      Your team is at seat capacity. Inviting will add 1 seat to your subscription.
                    </p>
                  )}
                  <span className="text-xs text-red-400">{error}</span>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="new-user-role">Role</Label>
                  <Select value={selectedRole} onValueChange={setSelectedRole}>
                    <SelectTrigger id="new-user-role">
                      <SelectValue placeholder="Select a role" />
                    </SelectTrigger>
                    <SelectContent>
                      {roles.map((role) => (
                        <SelectItem key={role.id} value={role.id}>
                          {role.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <input type="hidden" name="role" value={selectedRole} />
                  {selectedRoleMeta ? (
                    <p className="text-xs text-gray-500">{selectedRoleMeta.description}</p>
                  ) : null}
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setShowModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={loadingPreview}>
                  {atCapacity ? "Continue" : "Confirm"}
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
