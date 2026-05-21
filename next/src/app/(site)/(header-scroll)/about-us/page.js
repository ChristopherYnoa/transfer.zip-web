import Link from "next/link"
import LandingNav from "@/components/LandingNav"
import AuthConditional from "../AuthConditional"
import NoauthLandingHeaderCTAButton from "../NoauthLandingHeaderCTAButton"

const milestones = [
  {
    year: "July 2023",
    title: "First version launched",
    body: "Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.",
  },
  {
    year: "2024",
    title: "Incididunt ut labore",
    body: "Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.",
  },
  {
    year: "2025",
    title: "Magna aliqua veniam",
    body: "Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium totam rem aperiam.",
  },
  {
    year: "2026",
    title: "Quis nostrud exercitation",
    body: "Eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo nemo enim.",
  },
]

export const metadata = {
  title: "About Us | Transfer.zip",
  description: "Our story so far.",
}

export default function AboutPage() {
  const authCta = (
    <AuthConditional
      noauth={<NoauthLandingHeaderCTAButton />}
      auth={
        <Link
          href="/app/sent"
          className="flex items-center text-sm font-semibold text-gray-800 rounded-xl bg-white px-5 h-12 hover:bg-primary-50"
        >
          My Transfers <span aria-hidden="true">&rarr;</span>
        </Link>
      }
    />
  )

  return (
    <div className="relative">
      <div className="absolute inset-0 overflow-hidden grain bg-linear-to-b from-primary-700 to-primary-300 -z-10 rounded-b-4xl" />

      <div className="relative isolate flex flex-col">
        <LandingNav rightSlot={authCta} />

        <div className="mx-auto w-full max-w-7xl px-6 lg:px-8 pb-28 pt-16">
          <div className="mx-auto max-w-2xl text-center mt-12 sm:mt-16">
            <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl text-shadow-md fade-in-up">
              About Transfer.zip
            </h1>
            <p className="mt-4 text-lg leading-8 text-white text-shadow-sm fade-in-up-slow">
              Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do
              eiusmod tempor incididunt ut labore et dolore magna aliqua.
            </p>
          </div>

          <div className="relative mx-auto mt-20 sm:mt-28 max-w-5xl fade-in-up-slow">
            <div
              aria-hidden
              className="absolute left-4 top-0 bottom-0 w-px bg-primary-200 sm:left-1/2 sm:-translate-x-1/2"
            />

            <ul className="space-y-14 sm:space-y-24">
              {milestones.map((m, i) => {
                const isLeft = i % 2 === 0
                return (
                  <li
                    key={m.year}
                    className="relative grid grid-cols-1 sm:grid-cols-2 sm:gap-x-12"
                  >
                    <span
                      aria-hidden
                      className="absolute left-4 top-6 z-10 h-4 w-4 -translate-x-1/2 rounded-full bg-white shadow-lg sm:left-1/2"
                    />

                    <div
                      className={
                        "pl-12 sm:pl-0 " +
                        (isLeft ? "sm:pr-10" : "sm:col-start-2 sm:pl-10")
                      }
                    >
                      <div className="rounded-2xl bg-white p-6 sm:p-8 shadow-xl ring-1 ring-gray-200">
                        <p className="text-sm font-semibold text-primary-700">
                          {m.year}
                        </p>
                        <h3 className="mt-2 text-xl font-bold tracking-tight text-gray-900">
                          {m.title}
                        </h3>
                        <p className="mt-3 text-gray-600">{m.body}</p>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
