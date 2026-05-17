import { IS_SELFHOST } from "@/lib/isSelfHosted";
import { IS_DEV } from "@/lib/server/serverUtils";
import { notFound } from "next/navigation";
import Script from "next/script";

export default function () {
  if(IS_SELFHOST || !process.env.MEGADESK_PUB) {
    notFound()
  }

  return (
    <div className="bg-white px-6 py-32 lg:px-8">
      <div className="mx-auto max-w-3xl text-base leading-7 text-gray-700">
        <p className="text-base font-semibold leading-7 text-primary">Contact Us</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">Support & Contact</h1>
        <p className="mt-6 text-xl leading-8">
          Have a question or need help? Fill out the form below and we'll get back to you as soon as possible.
        </p>

        <div className="mt-10">
          {process.env.MEGADESK_PUB && (
            <>
              <div id="contact-form-container"></div>
              <Script
                src="https://getmegadesk.com/contact-form-embed.js"
                data-pub={process.env.MEGADESK_PUB}
                data-container="contact-form-container"
              ></Script>
            </>
          )}
        </div>
      </div>
    </div>
  )
}