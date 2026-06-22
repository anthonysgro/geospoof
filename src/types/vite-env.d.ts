/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_NOMINATIM_USER_AGENT: string;
  readonly MODE: "development" | "production";
  readonly DEV: boolean;
  readonly PROD: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "geobuf";
declare module "pbf";

/** Build-time flag: true when building for Safari. Injected by Vite's define. */
declare const __SAFARI__: boolean;
/** Build-time flag: true when building for Firefox. Injected by Vite's define. */
declare const __FIREFOX__: boolean;
/** Build-time flag: true when building for Chromium. Injected by Vite's define. */
declare const __CHROMIUM__: boolean;
