export function SkipLink() {
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:rounded-lg focus:bg-(--color-brand) focus:px-4 focus:py-2 focus:text-white focus:outline-none"
    >
      Skip to main content
    </a>
  )
}
