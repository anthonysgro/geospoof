import { createFileRoute } from "@tanstack/react-router"
import {
  EngineLevelSpoofingPage,
  buildEngineLevelHead,
} from "./engine-level-spoofing"

// French Engine-level Spoofing page at /fr/engine-level-spoofing. Shares the
// page component; locale ("fr") is derived from the URL.
export const Route = createFileRoute("/fr/engine-level-spoofing")({
  component: EngineLevelSpoofingPage,
  head: () => buildEngineLevelHead("fr"),
})
