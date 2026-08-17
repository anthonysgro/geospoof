/**
 * Website access reporting (Safari only)
 *
 * Enabling the extension and letting it touch websites are two separate consents on
 * Safari. The toggle in Settings is the first; the second is a four-way choice made in a
 * page prompt ("Allow for One Day" / "Always Allow on This Website" / "Always Allow on
 * Every Website" / "Don't Allow"). The containing app can observe the first through
 * `SFSafariExtensionManager` and has no way at all to observe the second — so without
 * this, Home shows "GeoSpoof is running in Safari" for an extension that is switched on
 * and cannot read a single page.
 *
 * That is the failure `SafariActivity.unverified` already calls out as the one worth
 * interrupting for: silently appearing protected while unprotected. This module is what
 * lets the app stop doing it.
 *
 * Deliberately NOT part of `Settings`. Settings is persisted user preference that the
 * extension must remember and obey, and it is bridged both ways. This is an observation
 * the extension makes about its own environment, flowing one way, whose entire value is
 * being current — a stale copy is worse than no copy. So it is computed at report time
 * and never written to storage.
 *
 * Reads only. Never throws, and never guesses: an engine that can't answer reports
 * `undefined`, which the app renders as silence rather than as a problem.
 */

import { createLogger } from "@/shared/utils/debug-logger";

const logger = createLogger("BG");

/**
 * The patterns that stand for "every website".
 *
 * Concrete wildcards rather than `<all_urls>`. Safari accepts `<all_urls>` as an *answer*
 * — `permissions.getAll()` reports it once every-site access is granted — but rejects it
 * as a *question*: `contains({ origins: ["<all_urls>"] })` returns false in both the
 * granted and ungranted state. Feeding `getAll()`'s output back into `contains()` is
 * therefore a false negative waiting to happen, which is exactly the trap this constant
 * exists to keep anyone from walking into. Verified on an iPhone against iOS 26.
 */
const ALL_SITES_ORIGINS = ["https://*/*", "http://*/*"];

/**
 * Narrowed view of the optional `browser.permissions` namespace, following the pattern in
 * `popup/early-protection.ts`. The polyfill's types describe the API-permission shape;
 * the origins shape is what this module needs.
 */
function permissionsApi():
  | {
      contains?: (p: { origins: string[] }) => Promise<boolean>;
      getAll?: () => Promise<{ origins?: string[] }>;
    }
  | undefined {
  return (browser as unknown as { permissions?: ReturnType<typeof permissionsApi> }).permissions;
}

/** Narrow access to `browser.extension.isAllowedIncognitoAccess`, absent on some engines. */
function incognitoApi(): { isAllowedIncognitoAccess?: () => Promise<boolean> } | undefined {
  return (browser as unknown as { extension?: ReturnType<typeof incognitoApi> }).extension;
}

/**
 * What the extension can observe about its own permission to act.
 *
 * Every field is optional, and absent always means "couldn't tell" rather than "no".
 * That distinction is the whole contract with the app: it has to be able to stay silent
 * when it doesn't know, because reporting a problem on the strength of no evidence would
 * accuse working installs of being broken.
 */
export interface AccessReport {
  /**
   * Every-site host access.
   *
   * A per-site grant reports `false`, which is the honest reading — the extension isn't
   * protecting the user's browsing, only one corner of it — but it means this alone can't
   * tell "allowed nowhere" from "allowed somewhere". `origins` is what separates those.
   */
  allSites?: boolean;
  /**
   * The origins Safari has actually granted, as a JSON-encoded `string[]`.
   *
   * Richer than `allSites`, and the reason it's worth sending: a per-site grant is a
   * legitimate choice, not a fault. Someone who allowed GeoSpoof on one site because they
   * don't want it reading every page they visit has a working setup, and telling them to
   * fix it would nag them forever about a decision they made on purpose. The boolean can't
   * tell that user apart from one who fumbled a prompt; the list can.
   *
   * JSON rather than a display string so the app can classify instead of parsing prose,
   * and because that policy call belongs on the app side — the extension reports what
   * Safari said and takes no view on what it means. Mirrors how favorites and the
   * allow/deny lists already cross this bridge, keeping the native handler a passthrough.
   *
   * Safari reports `<all_urls>` here once every-site is granted, and an empty array when
   * nothing is.
   */
  origins?: string;
  /**
   * Whether the extension is allowed to run in Private Browsing.
   *
   * A separate consent from both the toggle and website access — Safari tracks it as its
   * own switch — and a separate protection gap: allowed everywhere but not in Private
   * Browsing means no spoofing at all in a private tab. Whether Safari implements this
   * API at all is the open question this field exists to answer.
   */
  privateBrowsing?: boolean;
}

/**
 * Capped so a user who has granted hundreds of individual sites can't push a huge payload
 * across the bridge on every navigation. The app only needs to know whether the set is
 * empty, ours alone, or wider than that — and any truncated list still answers all three.
 */
const MAX_REPORTED_ORIGINS = 24;

/**
 * Collect everything the extension can see about its permission to act.
 *
 * One pass rather than a call per field, because these all travel together on the same
 * check-in and a partial picture is what produced the wrong status in the first place.
 * Never throws: each probe degrades to an absent field on its own.
 */
export async function collectAccessReport(): Promise<AccessReport> {
  if (!__SAFARI__) return {};

  const report: AccessReport = {};
  const perms = permissionsApi();

  if (perms?.contains) {
    try {
      report.allSites = await perms.contains({ origins: ALL_SITES_ORIGINS });
    } catch (error) {
      logger.debug("website-access: permissions.contains threw:", error);
    }
  }

  if (perms?.getAll) {
    try {
      const all = await perms.getAll();
      // Encoded even when empty. An empty array is a real answer — "Safari has granted
      // nothing" — and omitting the field would make it indistinguishable from an engine
      // that couldn't be asked, which the app treats as unknown and stays silent about.
      report.origins = JSON.stringify((all?.origins ?? []).slice(0, MAX_REPORTED_ORIGINS));
    } catch (error) {
      logger.debug("website-access: permissions.getAll threw:", error);
    }
  }

  const ext = incognitoApi();
  if (ext?.isAllowedIncognitoAccess) {
    try {
      report.privateBrowsing = await ext.isAllowedIncognitoAccess();
    } catch (error) {
      logger.debug("website-access: isAllowedIncognitoAccess threw:", error);
    }
  }

  return report;
}
