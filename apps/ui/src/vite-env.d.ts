/// <reference types="vite/client" />

// Asset imports with ?url suffix
declare module "*?url" {
  const src: string;
  export default src;
}

// WASM imports
declare module "*.wasm?url" {
  const src: string;
  export default src;
}
