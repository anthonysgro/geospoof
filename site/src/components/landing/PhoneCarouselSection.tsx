import * as React from "react"
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from "@/components/ui/carousel"
import { useTheme } from "@/hooks/use-theme"
import { cn } from "@/lib/utils"

const SHOTS = ["ss1", "ss2", "ss3", "ss4", "ss5", "ss6"] as const

// Universal app (one App Store listing, id 6765719745). mt=8 → iOS, mt=12 → Mac.
const IOS_APP_STORE_URL =
  "https://apps.apple.com/app/apple-store/id6765719745?pt=128299974&ct=carousel-ios&mt=8"
const MAC_APP_STORE_URL =
  "https://apps.apple.com/app/apple-store/id6765719745?pt=128299974&ct=carousel-mac&mt=12"

export function PhoneCarouselSection({
  className,
  embedded = false,
}: {
  className?: string
  embedded?: boolean
}) {
  const { resolvedTheme } = useTheme()
  const variant = resolvedTheme === "dark" ? "dark" : "light"

  const [api, setApi] = React.useState<CarouselApi>()
  const [selected, setSelected] = React.useState(0)

  React.useEffect(() => {
    if (!api) return
    const update = () => setSelected(api.selectedScrollSnap())
    update()
    api.on("select", update)
    api.on("reInit", update)
    return () => {
      api.off("select", update)
      api.off("reInit", update)
    }
  }, [api])

  const Wrapper = embedded ? "div" : "section"

  return (
    <Wrapper
      className={cn(embedded ? "mt-16 md:mt-20" : "py-16 md:py-24", className)}
    >
      <div className="mx-auto mb-10 max-w-[1200px] px-6 text-center md:px-12 lg:px-16">
        {embedded ? (
          <h3 className="text-2xl font-bold text-(--color-canvas-foreground) md:text-3xl">
            And native on iPhone &amp; iPad
          </h3>
        ) : (
          <h2 className="text-3xl font-bold text-(--color-canvas-foreground) md:text-4xl">
            GeoSpoof on iOS &amp; iPadOS
          </h2>
        )}
      </div>

      <div className="mx-auto w-full max-w-[1380px] px-12 sm:px-16">
        <Carousel setApi={setApi} opts={{ loop: true, align: "center" }}>
          <CarouselContent className="-ml-8 pt-8 pb-20">
            {SHOTS.map((id, i) => {
              const base = `/screenshots/${id}-${variant}`
              return (
                <CarouselItem
                  key={id}
                  className="pl-8 sm:basis-1/2 lg:basis-1/4"
                >
                  <picture>
                    <source
                      type="image/webp"
                      srcSet={`${base}-480.webp 480w, ${base}-760.webp 760w`}
                      sizes="(max-width: 640px) 70vw, (max-width: 1024px) 44vw, 30vw"
                    />
                    <img
                      src={`/screenshots/${id}-${variant}.png`}
                      alt={`GeoSpoof on iOS — screenshot ${i + 1}`}
                      width={1070}
                      height={2185}
                      loading="lazy"
                      className="w-full"
                      style={{
                        filter:
                          variant === "dark"
                            ? "drop-shadow(0 14px 24px rgba(255,255,255,0.04))"
                            : "drop-shadow(0 18px 28px rgba(15,23,42,0.25))",
                      }}
                    />
                  </picture>
                </CarouselItem>
              )
            })}
          </CarouselContent>
          <CarouselPrevious />
          <CarouselNext />
        </Carousel>

        {/* Dot indicators */}
        <div className="mt-2 flex items-center justify-center gap-2">
          {SHOTS.map((id, i) => (
            <button
              key={id}
              type="button"
              aria-label={`Go to slide ${i + 1}`}
              aria-current={i === selected}
              onClick={() => api?.scrollTo(i)}
              className={cn(
                "h-2 rounded-full transition-all",
                i === selected
                  ? "w-6 bg-(--color-brand)"
                  : "w-2 bg-(--color-canvas-border) hover:bg-(--color-canvas-muted)"
              )}
            />
          ))}
        </div>

        {/* Store badges */}
        <div className="mt-12 flex flex-col items-center gap-5">
          <p className="text-sm font-semibold tracking-widest text-(--color-brand) uppercase">
            Get the app
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <a
              href={IOS_APP_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Download on the App Store"
              className="transition-opacity hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-brand) focus-visible:ring-offset-2"
            >
              <img
                src="/images/stores/ios-store-icon.svg"
                alt="Download on the App Store"
                className="h-12 w-auto"
              />
            </a>
            <a
              href={MAC_APP_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Download on the Mac App Store"
              className="transition-opacity hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-brand) focus-visible:ring-offset-2"
            >
              <img
                src="/images/stores/mac-store-icon.svg"
                alt="Download on the Mac App Store"
                className="h-12 w-auto"
              />
            </a>
          </div>
        </div>
      </div>
    </Wrapper>
  )
}
