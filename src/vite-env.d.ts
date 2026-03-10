/// <reference types="vite/client" />

declare global {
  interface Window {
    A?: {
      aladin: (
        selector: string | HTMLElement,
        options?: Record<string, unknown>,
      ) => {
        addCatalog: (catalog: unknown) => void;
      };
      catalog: (options?: Record<string, unknown>) => {
        addSources: (sources: unknown[]) => void;
      };
      marker: (
        ra: number | string,
        dec: number | string,
        options?: Record<string, unknown>,
      ) => unknown;
      source?: (
        ra: number | string,
        dec: number | string,
        data?: Record<string, unknown>,
      ) => unknown;
    };
  }
}

export {};
