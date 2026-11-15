import { toPlatformError } from "./errors.ts";
import type { Unsubscribe } from "./types.ts";

// A backend service (the local database, the file bridge, the local MCP server, …) as seen from the
// UI: named requests that resolve once, and named streams the UI subscribes to. The contract is a
// type only; the host that runs the service validates every input at runtime.
export type ServiceContract = {
  requests: Record<string, { input: unknown; output: unknown }>;
  streams: Record<string, { params: unknown; event: unknown }>;
};

export type ServiceDefinition<C extends ServiceContract> = {
  readonly name: string;
  // Phantom field carrying the contract type; never set at runtime.
  readonly contract?: C;
};

// Declares a service name together with its contract type. Share the result between the UI and the
// host that implements it.
export function defineService<C extends ServiceContract>(name: string): ServiceDefinition<C> {
  if (!/^[a-z][a-z0-9-]*$/.test(name)) {
    throw new Error(`Service names are lower-case kebab-case: ${name}`);
  }
  return { name };
}

// The untyped transport a shell provides. Electron implements it over IPC; a web shell can implement
// it over a worker's postMessage.
export type ServiceChannel = {
  request(service: string, method: string, input: unknown): Promise<unknown>;
  subscribe(
    service: string,
    stream: string,
    params: unknown,
    listener: (event: unknown) => void,
    onError?: (error: Error) => void,
  ): Unsubscribe;
};

export type ServiceClient<C extends ServiceContract> = {
  request<M extends keyof C["requests"] & string>(
    method: M,
    input: C["requests"][M]["input"],
  ): Promise<C["requests"][M]["output"]>;
  subscribe<S extends keyof C["streams"] & string>(
    stream: S,
    params: C["streams"][S]["params"],
    listener: (event: C["streams"][S]["event"]) => void,
    onError?: (error: Error) => void,
  ): Unsubscribe;
};

// Typed client for one service over a shell's channel. Rejections become `PlatformError`s.
export function serviceClient<C extends ServiceContract>(
  channel: ServiceChannel,
  service: ServiceDefinition<C>,
): ServiceClient<C> {
  return {
    async request(method, input) {
      try {
        return (await channel.request(service.name, method, input)) as never;
      } catch (error) {
        throw toPlatformError(error);
      }
    },
    subscribe(stream, params, listener, onError) {
      return channel.subscribe(
        service.name,
        stream,
        params,
        (event) => listener(event as never),
        onError && ((error) => onError(toPlatformError(error))),
      );
    },
  };
}

// Handlers for a service, keyed like its contract. Hosts register these (with input validation) to
// serve a `ServiceDefinition`; `createLocalServiceChannel` runs them in-process.
export type ServiceHandlers<C extends ServiceContract> = {
  requests: {
    [M in keyof C["requests"]]: (
      input: C["requests"][M]["input"],
    ) => Promise<C["requests"][M]["output"]> | C["requests"][M]["output"];
  };
  streams: {
    [S in keyof C["streams"]]: (
      params: C["streams"][S]["params"],
      emit: (event: C["streams"][S]["event"]) => void,
    ) => Unsubscribe;
  };
};

type AnyHandlers = {
  requests: Record<string, (input: unknown) => unknown>;
  streams: Record<string, (params: unknown, emit: (event: unknown) => void) => Unsubscribe>;
};

// An in-process channel, for tests and for shells that run services on the UI thread.
export type LocalServiceChannel = ServiceChannel & {
  register<C extends ServiceContract>(
    service: ServiceDefinition<C>,
    handlers: ServiceHandlers<C>,
  ): void;
};

export function createLocalServiceChannel(): LocalServiceChannel {
  const services = new Map<string, AnyHandlers>();
  const find = (name: string) => {
    const handlers = services.get(name);
    if (!handlers) throw new Error(`Unknown service: ${name}`);
    return handlers;
  };
  return {
    register(service, handlers) {
      services.set(service.name, handlers as unknown as AnyHandlers);
    },
    async request(service, method, input) {
      const handler = find(service).requests[method];
      if (!handler) throw new Error(`Unknown method: ${service}.${method}`);
      return handler(input);
    },
    subscribe(service, stream, params, listener, onError) {
      try {
        const handler = find(service).streams[stream];
        if (!handler) throw new Error(`Unknown stream: ${service}.${stream}`);
        return handler(params, listener);
      } catch (error) {
        onError?.(error instanceof Error ? error : new Error(String(error)));
        return () => {};
      }
    },
  };
}
