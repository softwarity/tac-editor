/// <reference types="vite/client" />

// CSS module with ?inline suffix
declare module '*.css?inline' {
  const content: string;
  export default content;
}

// Version injected by Vite
declare const __VERSION__: string;
