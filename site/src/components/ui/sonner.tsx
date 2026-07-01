import * as React from "react"
import { Toaster as Sonner  } from "sonner"
import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import type {ToasterProps} from "sonner";
import { useTheme } from "@/hooks/use-theme"

const Toaster = ({ position, ...props }: ToasterProps) => {
  const { resolvedTheme } = useTheme()

  // Bottom-center on mobile, fall back to the requested position (default
  // bottom-right) on wider viewports.
  const [isMobile, setIsMobile] = React.useState(false)
  React.useEffect(() => {
    const mql = window.matchMedia("(max-width: 640px)")
    const update = () => setIsMobile(mql.matches)
    update()
    mql.addEventListener("change", update)
    return () => mql.removeEventListener("change", update)
  }, [])

  const resolvedPosition: ToasterProps["position"] = isMobile
    ? "bottom-center"
    : (position ?? "bottom-right")

  return (
    <Sonner
      theme={(resolvedTheme) ?? "system"}
      position={resolvedPosition}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--width": "min(360px, calc(100vw - 2rem))",
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
