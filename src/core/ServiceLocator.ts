type ServiceMap = Record<string, unknown>;

export class ServiceLocator {
  private static services: ServiceMap = {};

  static register<T>(key: string, service: T): void {
    ServiceLocator.services[key] = service;
  }

  static get<T>(key: string): T {
    const service = ServiceLocator.services[key];
    if (service === undefined) {
      throw new Error(`Service '${key}' not registered. Did you forget to register it?`);
    }
    return service as T;
  }

  static tryGet<T>(key: string): T | null {
    const service = ServiceLocator.services[key];
    return service !== undefined ? (service as T) : null;
  }

  static has(key: string): boolean {
    return key in ServiceLocator.services;
  }

  static clear(): void {
    ServiceLocator.services = {};
  }

  static unregister(key: string): void {
    delete ServiceLocator.services[key];
  }
}
