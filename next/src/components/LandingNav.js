import Link from "next/link"
import Image from "next/image"
import icon from "@/img/icon.png"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export default function LandingNav({ rightSlot, fade = true }) {
  return (
    <div className="mx-auto max-w-7xl w-full px-6 lg:px-8 pt-6 flex justify-between items-center">
      <div className="flex items-center gap-4">
        <div className={cn("flex items-center bg-white px-2 py-1 rounded-xl", fade && "fade-in-up-fast")}>
          <Link href="/" className="ms-2 flex items-center text-xl gap-x-2">
            <Image src={icon} width={40} alt="Logo" />
          </Link>
          <div className="ms-2 hidden sm:flex">
            <Button asChild size="sm" variant="ghost">
              <Link href="/#why-choose-us">Features</Link>
            </Button>
            <Button asChild size="sm" variant="ghost">
              <Link href="/#message-from-founder">About</Link>
            </Button>
            <Button asChild size="sm" variant="ghost">
              <Link href="/pricing">Pricing</Link>
            </Button>
            <Button asChild size="sm" variant="ghost">
              <Link href="/legal/privacy-policy">Privacy</Link>
            </Button>
          </div>
        </div>
      </div>
      {rightSlot && (
        <div className={cn(fade && "fade-in-up-fast")}>{rightSlot}</div>
      )}
    </div>
  )
}
