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
import { deleteTeamInvite, deleteUser, updateUserRole } from "@/lib/client/Api";
import { ROLES } from "@/lib/roles";
import { capitalizeFirstLetter } from "@/lib/utils";
import { EllipsisVerticalIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import ProfilePic from "@/components/ProfilePic";

function Entry({ user, currentUser, onDeleteUser, onUpdateRole }) {
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const isOwner = user.roles.includes(ROLES.OWNER)
  const currIsOwner = currentUser.roles.includes(ROLES.OWNER)
  const canManageRoles = (currentUser.roles.includes(ROLES.ADMIN) ? (isOwner ? false : true) : false) || currIsOwner
  const canDeleteUsers = currentUser.roles.includes(ROLES.OWNER)
  const isSelf = currentUser.id === user.id

  return (
    <li className="flex items-center gap-4 p-3 bg-white rounded-lg border hover:bg-gray-50 transition">
      <ProfilePic name={user.email} />
      <div>
        <div className="font-semibold text-gray-900">{user.fullName}</div>
        <div className="text-sm text-gray-500">{user.email}</div>
      </div>
      <div className="ml-auto flex flex-row gap-1 ">
        {user.roles.map(elem => {
          return (
            <div key={elem} className={"text-sm text-slate px-2 rounded-full " + (elem === ROLES.OWNER ? "bg-amber-50 text-amber-600" : "bg-gray-50 text-tone-800")}>
              {capitalizeFirstLetter(elem)}
            </div>
          )
        })
        }
      </div>
      <div className=" relative">
        <DropdownMenu>
          {(canManageRoles && !isSelf) && <DropdownMenuTrigger asChild>
            <Button variant="ghost" ><EllipsisVerticalIcon className="w-8 h-8 text-gray-700 text-xlr" /></Button>
          </DropdownMenuTrigger>}
          <DropdownMenuContent>
            {canManageRoles && !isOwner && !isSelf && (
              <DropdownMenuItem onClick={() => onUpdateRole(user)}>
                {user.roles.includes(ROLES.ADMIN) ? "Demote to Member" : "Promote to Admin"}
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
  const router = useRouter()

  const handleDeleteInvite = async (_id) => {
    try {
      await deleteTeamInvite(_id)
      router.refresh()
    } catch {
      toast.error("Deletetion failed");
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

  const getErrorMessage = (err, fallback) => {
    if (!err) return fallback
    if (typeof err === "string") return err
    if (typeof err.message === "string") return err.message
    if (err.error && typeof err.error.message === "string") return err.error.message
    try {
      return JSON.stringify(err)
    } catch {
      return fallback
    }
  }

  const handleDeleteUser = async (targetUser) => {
    try {
      const res = await deleteUser(targetUser.id)
      if (!res || !res.success) {
        throw new Error(res?.message || "Could not delete user")
      }
      toast.success("User removed")
      router.refresh()
    } catch (err) {
      toast.error(getErrorMessage(err, "Could not delete user"))
    }
  }

  const handleUpdateRole = async (targetUser) => {
    const nextRole = targetUser.roles.includes(ROLES.ADMIN) ? ROLES.MEMBER : ROLES.ADMIN
    try {
      const res = await updateUserRole(targetUser.id, nextRole)
      if (!res || !res.success) {
        throw new Error(res?.message || "Could not update role")
      }
      toast.success("Role updated")
      router.refresh()
    } catch (err) {
      toast.error(getErrorMessage(err, "Could not update role"))
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
