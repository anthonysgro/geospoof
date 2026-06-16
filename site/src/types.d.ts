/// <reference types="vite/client" />

// browser-geo-tz ships its `.ts` source as its `types` entry, which imports
// these two packages without bundled type declarations. Stub them so the
// site's typecheck doesn't fail on transitive node_modules source.
declare module "geobuf"
declare module "pbf"
