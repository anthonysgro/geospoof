/**
 * Type definitions for Firefox WebExtension manifest.json (Manifest V2).
 *
 * Used in tests that parse and validate the manifest file.
 */

export interface ManifestContentScript {
  matches: string[];
  run_at: string;
  all_frames: boolean;
  js: string[];
}

export interface ManifestBackground {
  scripts: string[];
}

export interface ManifestBrowserAction {
  default_popup: string;
}

export interface Manifest {
  manifest_version: number;
  name: string;
  version: string;
  permissions: string[];
  content_scripts: ManifestContentScript[];
  background: ManifestBackground;
  browser_action: ManifestBrowserAction;
}
