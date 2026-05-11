"use client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { deleteTeamInvite, deleteUser, sendTeamInvite, updateUserRole } from "@/lib/client/Api";
import { ROLES } from "@/lib/roles";
import { capitalizeFirstLetter } from "@/lib/utils";
import { EllipsisVerticalIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import ProfilePic from "@/components/ProfilePic";

function Entry({ user, currentUser, onDeleteUser, onUpdateRole }) {
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const isOwner = user.role === ROLES.OWNER
  const currIsOwner = currentUser.role === ROLES.OWNER
  const canManageRoles = (currentUser.role === ROLES.ADMIN ? (isOwner ? false : true) : false) || currIsOwner
  const canDeleteUsers = currentUser.role === ROLES.OWNER
  const isSelf = currentUser.id === user.id

  return (
    <li className="flex items-center gap-4 p-3 bg-white rounded-lg border hover:bg-gray-50 transition">
      <ProfilePic name={user.fullName || user.email} />
      <div>
        <div className="font-semibold text-gray-900">{user.fullName}</div>
        <div className="text-sm text-gray-500">{user.email}</div>
      </div>
      <div className="ml-auto flex flex-row gap-1 ">
        <div className={"text-sm text-slate px-2 rounded-full " + (user.role === ROLES.OWNER ? "bg-amber-50 text-amber-600" : "bg-gray-50 text-tone-800")}>
          {capitalizeFirstLetter(user.role)}
        </div>
      </div>
      <div className=" relative">
        <DropdownMenu>
          {(canManageRoles && !isSelf) && <DropdownMenuTrigger asChild>
            <Button variant="ghost" ><EllipsisVerticalIcon className="w-8 h-8 text-gray-700 text-xlr" /></Button>
          </DropdownMenuTrigger>}
          <DropdownMenuContent>
            {canManageRoles && !isOwner && !isSelf && (
              <DropdownMenuItem onClick={() => onUpdateRole(user)}>
                {user.role === ROLES.ADMIN ? "Demote to Member" : "Promote to Admin"}
              </DropdownMenuItem>
            )}
            {canDeleteUsers && !isOwner && (
              <DropdownMenuItem onClick={() => setShowDeleteModal(true)} className="text-destructive">
                Remove
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
          {showDeleteModal && (
            <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Remove User {user.email} </DialogTitle>
                  <DialogDescription>
                    Are you sure you want to delete this user? This action cannot be undone.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter className="mt-6 space-x-2">
                  <Button variant="outline" onClick={() => setShowDeleteModal(false)}>
                    Cancel
                  </Button>
                  <Button type="button" className="bg-red-600 text-white hover:bg-red-700" onClick={() => {
                    onDeleteUser(user)
                    setShowDeleteModal(false)
                  }}>
                    Remove
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </DropdownMenu>
      </div>
    </li>
  )
}

function InviteEntry({ invite }) {
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [resending, setResending] = useState(false)
  const router = useRouter()

  const handleDeleteInvite = async (_id) => {
    try {
      await deleteTeamInvite(_id)
      router.refresh()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const handleResendInvite = async () => {
    setResending(true)
    try {
      await sendTeamInvite(invite.email, invite.role)
      toast.success("Invite resent", { description: `A new invitation was sent to ${invite.email}` })
      router.refresh()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setResending(false)
    }
  }

  return (
    <li className="flex items-center gap-4 p-3  rounded-xl border border-dashed transition">
      <ProfilePic name={invite.email} />
      <div>
        <div className="text-sm text-gray-500">{invite.email}</div>
      </div>
      <div className="flex items-center justify-center text-sm bg-amber-50 text-amber-600 px-2 rounded-full">
        Invite pending
      </div>
      <div className="ml-auto relative">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" ><EllipsisVerticalIcon className="w-8 h-8 text-gray-700 text-xlr" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem disabled={resending} onClick={handleResendInvite}>
              {resending ? "Resending..." : "Resend invite"}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setShowDeleteModal(true)} className="text-destructive">
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
          {showDeleteModal && (
            <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Delete Invite to {invite.email} </DialogTitle>
                  <DialogDescription>
                    Are you sure you want to delete this invite? This action cannot be undone.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter className="mt-6 space-x-2">
                  <Button variant="outline" onClick={() => setShowDeleteModal(false)}>
                    Cancel
                  </Button>
                  <Button type="button" className="bg-red-600 text-white hover:bg-red-700" onClick={() => {
                    handleDeleteInvite(invite.id)
                    setShowDeleteModal(false)
                  }}>
                    Delete
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </DropdownMenu>
      </div>
    </li>
  )
}

export default function UserList({ user, users, invites }) {
  const router = useRouter()

  const handleDeleteUser = async (targetUser) => {
    try {
      await deleteUser(targetUser.id)
      toast.success("User removed")
      router.refresh()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const handleUpdateRole = async (targetUser) => {
    const nextRole = targetUser.role === ROLES.ADMIN ? ROLES.MEMBER : ROLES.ADMIN
    try {
      await updateUserRole(targetUser.id, nextRole)
      toast.success("Role updated")
      router.refresh()
    } catch (err) {
      toast.error(err.message)
    }
  }

  return (
    <div className="space-y-2">
      <ul className="space-y-2">
        {users.flat().map(listUser => (
          <Entry
            key={listUser.email}
            user={listUser}
            currentUser={user}
            onDeleteUser={handleDeleteUser}
            onUpdateRole={handleUpdateRole}
          />
        ))}
        {
          invites.map(invite => (
            <InviteEntry key={invite.email} invite={invite}></InviteEntry>
          ))
        }
      </ul>
    </div>
  )
}
