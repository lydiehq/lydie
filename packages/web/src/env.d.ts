/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_ZERO_URL: string;
  readonly VITE_API_URL: string;
  readonly VITE_YJS_SERVER_URL: string;
  readonly VITE_ASSETS_DOMAIN: string;
  readonly VITE_POSTHOG_KEY: string;
  readonly VITE_POSTHOG_ENABLE_REPLAY: string;
  readonly VITE_POSTHOG_HOST: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
