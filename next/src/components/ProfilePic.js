"use client"

import { Facehash } from "facehash"
import { UserIcon } from "lucide-react"

export default function ProfilePic({ name, size = 40 }) {
  if (!name) {
    return (
      <div
        className="flex items-center justify-center rounded-full bg-gray-100 text-gray-500"
        style={{ width: size, height: size }}
      >
        <UserIcon />
      </div>
    )
  }

  return (
    <div
      className="overflow-hidden rounded-full"
      style={{ width: size, height: size }}
    >
      <Facehash name={name} size={size} className="bg-primary text-white" />
    </div>
  )
}
