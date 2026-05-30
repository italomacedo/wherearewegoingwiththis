import { ServiceLocator } from '../../../src/core/ServiceLocator';

describe('ServiceLocator', () => {
  afterEach(() => {
    ServiceLocator.clear();
  });

  it('registers and retrieves a service', () => {
    const service = { value: 42 };
    ServiceLocator.register('myService', service);
    expect(ServiceLocator.get('myService')).toBe(service);
  });

  it('throws when getting an unregistered service', () => {
    expect(() => ServiceLocator.get('nonexistent')).toThrow(
      "Service 'nonexistent' not registered"
    );
  });

  it('tryGet returns null for unregistered service', () => {
    expect(ServiceLocator.tryGet('missing')).toBeNull();
  });

  it('tryGet returns service when registered', () => {
    const svc = { name: 'test' };
    ServiceLocator.register('svc', svc);
    expect(ServiceLocator.tryGet('svc')).toBe(svc);
  });

  it('has returns true for registered service', () => {
    ServiceLocator.register('existing', {});
    expect(ServiceLocator.has('existing')).toBe(true);
  });

  it('has returns false for unregistered service', () => {
    expect(ServiceLocator.has('notHere')).toBe(false);
  });

  it('overwriting a registration replaces the service', () => {
    const v1 = { version: 1 };
    const v2 = { version: 2 };
    ServiceLocator.register('svc', v1);
    ServiceLocator.register('svc', v2);
    expect(ServiceLocator.get('svc')).toBe(v2);
  });

  it('clear removes all services', () => {
    ServiceLocator.register('a', {});
    ServiceLocator.register('b', {});
    ServiceLocator.clear();
    expect(ServiceLocator.has('a')).toBe(false);
    expect(ServiceLocator.has('b')).toBe(false);
  });

  it('unregister removes a single service', () => {
    ServiceLocator.register('a', {});
    ServiceLocator.register('b', {});
    ServiceLocator.unregister('a');
    expect(ServiceLocator.has('a')).toBe(false);
    expect(ServiceLocator.has('b')).toBe(true);
  });
});
