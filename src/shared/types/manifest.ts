/**
 * Type definitions for Firefox WebExtension manifest.json (Manifest V3).
 *
 * Used in tests that parse and validate the manifest file.
 */

export interface ManifestContentScript {
  matches: string[];
  run_at: string;
  all_frames: boolean;
  js: string[];
  world?: string;
}

export interface ManifestBackground {
  scripts: string[];
  type?: string;
}

export interface ManifestAction {
  default_popup: string;
  default_icon?: Record<string, string>;
}

export interface ManifestWebAccessibleResource {
  resources: string[];
  matches: string[];
}

export interface Manifest {
  manifest_version: number;
  name: string;
  version: string;
  permissions: string[];
  host_permissions?: string[];
  content_scripts: ManifestContentScript[];
  background: ManifestBackground;
  action: ManifestAction;
  web_accessible_resources?: ManifestWebAccessibleResource[];
  /** @deprecated MV2 only */
  browser_action?: ManifestAction;
}
