/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GEONAMES_USERNAME: string;
  readonly VITE_NOMINATIM_USER_AGENT: string;
  readonly MODE: "development" | "production";
  readonly DEV: boolean;
  readonly PROD: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
