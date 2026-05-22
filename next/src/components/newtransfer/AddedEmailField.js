import { XIcon } from "lucide-react"

export default function AddedEmailField({ email, onAction }) {
  return (
    <li className="pt-1 text-sm group flex relative items-center">
      <span className="text-primary-700 font-medium bg-primary-50 px-2 py-0.5 rounded-md">{email}</span>
      <button type="button" onClick={() => onAction("delete", email)} className="text-primary bg-white rounded-full flex items-center justify-center absolute right-0.5 opacity-0 group-hover:opacity-100 w-5 h-5"><XIcon size={16} /></button>
    </li>
  )
}
