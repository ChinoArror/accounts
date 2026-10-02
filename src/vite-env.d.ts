/// <reference types="vite/client" />

declare module '*.md?raw' {
  const content: string;
  export default content;
}

declare const __DOCS_BUILD_DATE__: string;
