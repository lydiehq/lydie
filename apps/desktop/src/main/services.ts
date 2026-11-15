// Backend services hosted in the main process and reached from the renderer through
// `platform.services` (the `services:*` IPC channels). Electron-free so it is unit-tested directly.
import { PlatformError } from "@lydie/platform";
import type { ServiceContract, ServiceDefinition, Unsubscribe } from "@lydie/platform";
import type { z } from "zod";

// Which window is calling, for services that care (e.g. scoping a database to the window's folder).
export type ServiceCaller = { windowId: string };

// A service implementation: every request and stream of the contract with a zod schema for its
// input, which the registry checks before calling the handler.
export type ServiceImplementation<C extends ServiceContract> = {
  requests: {
    [M in keyof C["requests"]]: {
      input: z.ZodType<C["requests"][M]["input"]>;
      handle(
        input: C["requests"][M]["input"],
        caller: ServiceCaller,
      ): Promise<C["requests"][M]["output"]> | C["requests"][M]["output"];
    };
  };
  streams: {
    [S in keyof C["streams"]]: {
      params: z.ZodType<C["streams"][S]["params"]>;
      subscribe(
        params: C["streams"][S]["params"],
        emit: (event: C["streams"][S]["event"]) => void,
        caller: ServiceCaller,
      ): Unsubscribe;
    };
  };
};

type AnyImplementation = {
  requests: Record<
    string,
    { input: z.ZodType; handle(input: unknown, caller: ServiceCaller): unknown }
  >;
  streams: Record<
    string,
    {
      params: z.ZodType;
      subscribe(
        params: unknown,
        emit: (event: unknown) => void,
        caller: ServiceCaller,
      ): Unsubscribe;
    }
  >;
};

function parse(schema: z.ZodType, value: unknown, where: string) {
  const result = schema.safeParse(value);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new PlatformError("invalid-argument", `${where}: ${issue?.message ?? "invalid input"}`);
  }
  return result.data;
}

export class ServiceRegistry {
  private readonly services = new Map<string, AnyImplementation>();

  register<C extends ServiceContract>(
    service: ServiceDefinition<C>,
    implementation: ServiceImplementation<C>,
  ) {
    if (this.services.has(service.name))
      throw new Error(`Service registered twice: ${service.name}`);
    this.services.set(service.name, implementation as unknown as AnyImplementation);
  }

  private find(service: string) {
    const implementation = this.services.get(service);
    if (!implementation) throw new PlatformError("not-found", `Unknown service: ${service}`);
    return implementation;
  }

  async request(service: string, method: string, input: unknown, caller: ServiceCaller) {
    const requests = this.find(service).requests;
    const entry = Object.hasOwn(requests, method) ? requests[method] : undefined;
    if (!entry) throw new PlatformError("not-found", `Unknown method: ${service}.${method}`);
    return entry.handle(parse(entry.input, input, `${service}.${method}`), caller);
  }

  subscribe(
    service: string,
    stream: string,
    params: unknown,
    emit: (event: unknown) => void,
    caller: ServiceCaller,
  ): Unsubscribe {
    const streams = this.find(service).streams;
    const entry = Object.hasOwn(streams, stream) ? streams[stream] : undefined;
    if (!entry) throw new PlatformError("not-found", `Unknown stream: ${service}.${stream}`);
    return entry.subscribe(parse(entry.params, params, `${service}.${stream}`), emit, caller);
  }
}
