// `@lydie/plugin-api/hosted`: the host services behind `app.services` in depth (the hosted
// service's account API and its operations, collaborative bodies, a folder's settings) and the
// built-in features' hooks over them. Shared code for the built-in plugins that changes with the
// hosted service: not part of the stable plugin surface. The main entry keeps the types `AppApi`
// itself names (`HostServices`, `PluginsApi`, `PluginInfo`, `AboutInfo`, `Observable`).
export type * from "./hosted.ts";
export type * from "./hosted-operations.ts";
export * from "./hosted-react.tsx";
export * from "./teamspaces.ts";
