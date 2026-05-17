import Link from "next/link";
import { cn } from "./lib/utils";
import { Button } from "./components/ui/button";
import { Info as InfoIcon, AlertTriangle, AlertCircle, Lightbulb, ArrowRightIcon, Check, X } from "lucide-react";

function HowToCard({ href, title, description, image, imageAlt, children }) {
  return (
    <Link
      href={href}
      className="group relative flex items-center gap-4 p-6 rounded-2xl border border-gray-200 bg-linear-to-br from-white to-gray-50/80 shadow-sm hover:shadow-md hover:border-primary/30 hover:from-primary/5 hover:to-white transition-all duration-200 min-h-[120px] overflow-hidden no-underline"
    >
      <img
        src={image}
        alt={imageAlt || title}
        className="absolute right-4 top-1/2 -translate-y-1/2 w-32 h-32 object-contain opacity-10 group-hover:opacity-20 group-hover:scale-110 pointer-events-none select-none transition-all duration-300"
        aria-hidden="true"
      />
      <div className="relative flex-1 z-10">
        <span className="text-lg font-semibold text-gray-900 group-hover:text-primary transition-colors">
          {title}
        </span>
        <p className="text-sm text-gray-600 mt-1.5 leading-relaxed">{children || description}</p>
      </div>
      <svg
        className="w-5 h-5 text-gray-400 group-hover:text-primary group-hover:translate-x-1 transition-all duration-200 flex-shrink-0"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </Link>
  );
}

function HowToList({ children }) {
  return <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{children}</div>;
}

function Info({ children }) {
  return (
    <div className="my-6 flex gap-3 rounded-lg border border-blue-200 bg-blue-50/50 p-4">
      <InfoIcon className="h-5 w-5 shrink-0 text-blue-600 mt-0.5" />
      <div className="flex-1 text-sm leading-relaxed text-blue-900 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
        {children}
      </div>
    </div>
  );
}

function Warning({ children }) {
  return (
    <div className="my-6 flex gap-3 rounded-lg border border-amber-200 bg-amber-50/50 p-4">
      <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 mt-0.5" />
      <div className="flex-1 text-sm leading-relaxed text-amber-900 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
        {children}
      </div>
    </div>
  );
}

function Alert({ children }) {
  return (
    <div className="my-6 flex gap-3 rounded-lg border border-red-200 bg-red-50/50 p-4">
      <AlertCircle className="h-5 w-5 shrink-0 text-red-600 mt-0.5" />
      <div className="flex-1 text-sm leading-relaxed text-red-900 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
        {children}
      </div>
    </div>
  );
}

function Tip({ children }) {
  return (
    <div className="my-6 flex gap-3 rounded-lg border border-green-200 bg-green-50/50 p-4">
      <Lightbulb className="h-5 w-5 shrink-0 text-green-600 mt-0.5" />
      <div className="flex-1 text-sm leading-relaxed text-green-900 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
        {children}
      </div>
    </div>
  );
}

function GoodFor({ label = "Good for:", children }) {
  return (
    <div className="my-4">
      <div className="font-semibold text-blue-600 mb-2">{label}</div>
      <ul className="space-y-1.5 list-none pl-0 m-0">
        {children}
      </ul>
    </div>
  );
}

function BadFor({ label = "Not great for:", children }) {
  return (
    <div className="my-4">
      <div className="font-semibold text-red-600 mb-2">{label}</div>
      <ul className="space-y-1.5 list-none pl-0 m-0">
        {children}
      </ul>
    </div>
  );
}

function Pro({ children }) {
  return (
    <li className="flex gap-2 items-start m-0 p-0">
      <Check className="h-5 w-5 shrink-0 mt-0.5 text-blue-600" />
      <span>{children}</span>
    </li>
  );
}

function Con({ children }) {
  return (
    <li className="flex gap-2 items-start m-0 p-0">
      <X className="h-5 w-5 shrink-0 mt-0.5 text-red-600" />
      <span>{children}</span>
    </li>
  );
}

function TLDR({ children }) {
  return (
    <aside className="my-8 lg:-mx-8 rounded-2xl bg-primary-50 px-6 lg:px-8 py-6">
      <p className="text-sm font-bold uppercase text-primary mb-4 mt-0">
        If you're in a hurry:
      </p>
      <div className="text-[15px] leading-[1.65] text-gray-700 [&>p]:mt-2.5 [&>p:first-child]:mt-0 [&>p:last-child]:mb-0 [&>ul]:mt-2.5 [&>ol]:mt-2.5 [&_strong]:text-gray-900 [&_strong]:font-semibold mb-5">
        {children}
      </div>
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:text-primary-light transition-colors no-underline"
      >
        Try Transfer.zip →
      </Link>
    </aside>
  );
}

function generateId(children) {
  const text = typeof children === 'string'
    ? children
    : Array.isArray(children)
      ? children.map(c => typeof c === 'string' ? c : '').join('')
      : ''
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
}

export function mdxComponents(basePath) {
  return {
    h1: ({ className, children, ...props }) => (
      <h1
        id={generateId(children)}
        className={cn(
          "text-3xl font-semibold tracking-tight text-gray-900",
          className
        )}
        {...props}
      >
        {children}
      </h1>
    ),
    h2: ({ className, children, ...props }) => (
      <h2
        id={generateId(children)}
        className={cn(
          "mt-12 text-2xl font-semibold tracking-tight text-gray-900",
          className
        )}
        {...props}
      >
        {children}
      </h2>
    ),
    h3: ({ className, children, ...props }) => (
      <h3
        id={generateId(children)}
        className={cn("mt-8 text-xl font-semibold text-gray-900", className)}
        {...props}
      >
        {children}
      </h3>
    ),
    p: ({ className, ...props }) => (
      <p
        className={cn("mt-6 leading-7 text-[17px] text-gray-600 text-justify", className)}
        {...props}
      />
    ),
    ul: ({ className, ...props }) => (
      <ul
        className={cn("mt-6 list-disc space-y-2 pl-6 text-[17px] text-gray-600 marker:text-gray-400", className)}
        {...props}
      />
    ),
    ol: ({ className, ...props }) => (
      <ol
        className={cn(
          "mt-6 list-decimal space-y-2 pl-6 text-[17px] text-gray-600 marker:text-gray-400",
          className
        )}
        {...props}
      />
    ),
    li: ({ className, ...props }) => (
      <li
        className={cn("leading-7", className)}
        {...props}
      />
    ),
    hr: ({ className, ...props }) => (
      <hr
        className={cn("my-10 border-gray-200", className)}
        {...props}
      />
    ),
    blockquote: ({ className, ...props }) => (
      <blockquote
        className={cn(
          "mt-6 border-l-4 border-primary-400 pl-4 text-base text-gray-600",
          className
        )}
        {...props}
      />
    ),
    pre: ({ className, ...props }) => (
      <pre
        className={cn(
          "mt-4 overflow-x-auto p-4 text-sm border text-black border-gray-200 bg-gray-50 rounded-lg lg:-mx-6",
          className
        )}
        {...props}
      />
    ),
    table: ({ className, ...props }) => (
      <div className="mt-8 overflow-x-auto lg:-mx-8">
        <table
          className={cn(
            "min-w-full border-collapse text-left text-[15px] text-gray-700",
            className
          )}
          {...props}
        />
      </div>
    ),
    th: ({ className, ...props }) => (
      <th
        className={cn(
          "border-b border px-3 py-2 font-bold bg-primary-600 text-white",
          className
        )}
        {...props}
      />
    ),
    tr: ({ className, ...props }) => (
      <tr
        className={cn("even:bg-primary-50", className)}
        {...props}
      />
    ),
    td: ({ className, ...props }) => (
      <td
        className={cn("border px-3 py-2", className)}
        {...props}
      />
    ),
    a: ({ className, ...props }) => (
      <Link
        target="_blank"
        className={cn(
          "font-medium text-primary underline underline-offset-4 hover:text-primary-500",
          className
        )}
        {...props}
      />
    ),
    img: ({ src, alt, title, ...props }) => (
      <span className="block my-8 lg:-mx-8">
        <img
          className="rounded-xl mb-2 w-full"
          src={basePath ? `${basePath}/${src}` : src}
          alt={alt}
          {...props}
        />
        {(title || alt) && <span className="block text-sm text-gray-400">{title || alt}</span>}
      </span>
    ),
    "Link": ({ className, ...props }) => (
      <Link
        className={cn(
          "font-medium text-primary underline underline-offset-4 hover:text-primary-500",
          className
        )}
        {...props}
      />
    ),
    "Button": ({ className, ...props }) => (
      <Button
        className={cn(
          "p-6 text-lg",
          className,
        )}
        {...props}
      />
    ),
    "PrimaryLink": ({ href, children, className, ...props }) => (
      <Link
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          "mt-4 inline-flex items-center gap-2 px-4 py-2 font-medium bg-primary text-white hover:bg-primary-light text-lg rounded-lg transition-colors no-underline",
          className
        )}
        {...props}
      >
        {children}
        <ArrowRightIcon/>
      </Link>
    ),
    "ExternalLink": ({ href, children, className, ...props }) => (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          "mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-primary bg-primary/5 hover:bg-primary/10 border border-primary/20 hover:border-primary/40 rounded-lg transition-colors",
          className
        )}
        {...props}
      >
        {children}
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
        </svg>
      </a>
    ),
    "HowToCard": HowToCard,
    "HowToList": HowToList,
    "Info": Info,
    "Warning": Warning,
    "Alert": Alert,
    "Tip": Tip,
    "TLDR": TLDR,
    "GoodFor": GoodFor,
    "BadFor": BadFor,
    "Pro": Pro,
    "Con": Con,
  };
}

// For nextjs mdx loader (for page.mdx for example)
export function useMDXComponents(components) {
  return {
    ...mdxComponents(),
    ...components,
  }
}
