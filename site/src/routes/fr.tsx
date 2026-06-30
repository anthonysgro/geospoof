import { Outlet, createFileRoute } from "@tanstack/react-router"

// Pathless layout for the French subtree (`/fr/*`). It only renders an
// <Outlet/>, so the matched child route (the `/fr` homepage via fr.index.tsx,
// or a `/fr/spoof-location/*` page) shows through. Without this file the
// generated route tree references an undefined `FrRoute` parent and every
// `/fr` route 404s.
export const Route = createFileRoute("/fr")({
  component: () => <Outlet />,
})
