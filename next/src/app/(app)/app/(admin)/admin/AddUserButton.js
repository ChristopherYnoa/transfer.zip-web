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
import { Plus } from "lucide-react"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { sendTeamInvite } from "@/lib/client/Api"
import { ROLES } from "@/lib/roles"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

const roles = [
  { id: ROLES.ADMIN, name: "Admin", description: "Full control over team settings." },
  { id: ROLES.MEMBER, name: "Member", description: "Regular team member." },
]

export default function AddUserButton() {
  const router = useRouter()
  const [showModal, setShowModal] = useState(false)
  const [selectedRole, setSelectedRole] = useState(roles[1].id)
  const [error, setError] = useState("")

  const handleSubmit = async (e) => {
    e.preventDefault()
    const formData = new FormData(e.target)

    const email = formData.get("email")

    try {
      await sendTeamInvite(email, formData.get("role"))
      setError("")
      e.target.reset()
      setShowModal(false)
      toast.success("Invite sent", { description: `An invitation was sent to ${email}` })
      router.refresh()
    } catch (err) {
      setError(err.message)
    }
  }

  const selectedRoleMeta = roles.find((role) => role.id === selectedRole)

  return (
    <Dialog open={showModal} onOpenChange={(open) => {
      setShowModal(open)
      if (open) setError("")
    }}>
        <DialogTrigger asChild>
          <Button><Plus /> Add user</Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
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
              <Button type="submit">Confirm</Button>
            </DialogFooter>
          </form>
        </DialogContent>
    </Dialog>
  )
}
