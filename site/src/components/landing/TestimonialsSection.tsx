import { StarIcon } from "lucide-react"
import { Section } from "./Section"
import { cn } from "@/lib/utils"

interface Testimonial {
  quote: string
  author: string
  source: "Firefox Add-ons"
  sourceHref: string
}

const AMO_URL =
  "https://addons.mozilla.org/en-US/firefox/addon/geo-spoof/reviews/"

const testimonials: Array<Testimonial> = [
  {
    quote:
      "This is amazing. A month or two ago I was desperately searching for a solution to the specific issue of automatic IP-TZ sync to tick one of the last boxes off against my bscan.info checklist. So glad I googled one more time. The extension is so nicely put together. Thanks so much for your work on this!",
    author: "lorelei 🌸",
    source: "Firefox Add-ons",
    sourceHref: AMO_URL,
  },
  {
    quote:
      "Great extension. Thank you, Anthony! Please keep developing it. You can always ask a review from Thorin-Oakenpants on GitHub — he IS THE great master in all the browser fingerprinting matters. Wish you all the best.",
    author: "Kasander",
    source: "Firefox Add-ons",
    sourceHref: AMO_URL,
  },
  {
    quote: "Works well, easy to use, thanks for making this awesome extension!",
    author: "Yakov",
    source: "Firefox Add-ons",
    sourceHref: AMO_URL,
  },
  {
    quote: "Amazing. Works perfectly.",
    author: "Lau",
    source: "Firefox Add-ons",
    sourceHref: AMO_URL,
  },
]

function Stars() {
  return (
    <div
      className="flex items-center gap-0.5"
      aria-label="5 out of 5 stars"
      role="img"
    >
      {Array.from({ length: 5 }).map((_, i) => (
        <StarIcon
          key={i}
          aria-hidden="true"
          className="h-4 w-4 fill-(--color-brand) text-(--color-brand)"
        />
      ))}
    </div>
  )
}

function TestimonialCard({ testimonial }: { testimonial: Testimonial }) {
  return (
    <figure
      className={cn(
        "flex h-full flex-col gap-4 rounded-2xl",
        "border border-(--color-canvas-border)",
        "bg-(--color-canvas)",
        "p-6"
      )}
    >
      <Stars />
      <blockquote className="text-body-base flex-1 text-(--color-canvas-foreground)">
        <p>“{testimonial.quote}”</p>
      </blockquote>
      <figcaption className="border-t border-(--color-canvas-border) pt-4">
        <p className="text-sm font-semibold text-(--color-canvas-foreground)">
          {testimonial.author}
        </p>
        <p className="text-xs text-(--color-canvas-muted)">
          <a
            href={testimonial.sourceHref}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-(--color-brand) hover:underline"
          >
            {testimonial.source}
          </a>
        </p>
      </figcaption>
    </figure>
  )
}

export function TestimonialsSection({ className }: { className?: string }) {
  return (
    <Section
      id="testimonials"
      className={cn("py-16! md:py-24!", className)}
      aria-labelledby="testimonials-heading"
    >
      <div className="mb-12 text-center">
        <p className="mb-3 text-sm font-semibold tracking-widest text-(--color-brand) uppercase">
          What users are saying
        </p>
        <h2
          id="testimonials-heading"
          className="mb-4 text-3xl font-bold text-(--color-canvas-foreground) md:text-4xl"
        >
          Loved by privacy-minded users
        </h2>
        <p className="mx-auto max-w-xl text-(--color-canvas-muted)">
          Real reviews from the Firefox Add-ons marketplace.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:gap-6">
        {testimonials.map((t) => (
          <TestimonialCard key={t.author} testimonial={t} />
        ))}
      </div>

      <p className="mt-8 text-center text-sm text-(--color-canvas-muted)">
        <a
          href={AMO_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-(--color-brand) hover:underline"
        >
          Read all reviews on Firefox Add-ons →
        </a>
      </p>
    </Section>
  )
}
