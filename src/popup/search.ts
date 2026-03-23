/**
 * Search & Location
 * Geocoding search results display and location setting.
 */

import type { GeocodeResult } from "@/shared/types/messages";
import { clearChildren } from "./ui";

/**
 * Display geocoding search results in the popup.
 * Each result is clickable and calls `onSelect` with the coordinates.
 */
export function displaySearchResults(
  results: GeocodeResult[],
  onSelect: (lat: number, lon: number) => void
): void {
  const container = document.getElementById("searchResults");
  if (!container) return;

  clearChildren(container);

  if (results.length === 0) {
    const noResults = document.createElement("div");
    noResults.className = "no-results";
    noResults.textContent = "No locations found";
    container.appendChild(noResults);
    return;
  }

  results.forEach((result: GeocodeResult) => {
    const resultDiv = document.createElement("div");
    resultDiv.className = "search-result";
    resultDiv.dataset.lat = String(result.latitude);
    resultDiv.dataset.lon = String(result.longitude);

    const nameDiv = document.createElement("div");
    nameDiv.className = "result-name";
    nameDiv.textContent = result.name;

    const coordsDiv = document.createElement("div");
    coordsDiv.className = "result-coords";
    coordsDiv.textContent = `${result.latitude.toFixed(4)}, ${result.longitude.toFixed(4)}`;

    resultDiv.appendChild(nameDiv);
    resultDiv.appendChild(coordsDiv);
    container.appendChild(resultDiv);

    resultDiv.addEventListener("click", () => {
      const lat = parseFloat(resultDiv.dataset.lat ?? "0");
      const lon = parseFloat(resultDiv.dataset.lon ?? "0");
      onSelect(lat, lon);
    });
  });
}
