/**
 * Onboarding
 * Show/close the first-run onboarding overlay.
 */

export function showOnboarding(): void {
  const overlay = document.getElementById("onboardingOverlay");
  if (overlay) overlay.style.display = "flex";
}

export async function closeOnboarding(): Promise<void> {
  const overlay = document.getElementById("onboardingOverlay");
  if (overlay) overlay.style.display = "none";

  try {
    await browser.runtime.sendMessage({ type: "COMPLETE_ONBOARDING" });
  } catch (error: unknown) {
    console.error("Failed to complete onboarding:", error);
  }
}
