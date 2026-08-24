import { JsonLogger } from './json-logger';

describe('JsonLogger', () => {
  let writeSpy: jest.SpyInstance;
  let output: string[];

  beforeEach(() => {
    output = [];
    writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      output.push(String(chunk));
      return true;
    });
  });

  afterEach(() => {
    writeSpy.mockRestore();
  });

  function lastLine(): Record<string, unknown> {
    expect(output).toHaveLength(1);
    return JSON.parse(output[0].trim());
  }

  describe('Nest core convention: context passed as a plain string', () => {
    it('does not explode a string context into indexed characters on log()', () => {
      const logger = new JsonLogger('loyalty-service');
      logger.log('Starting Nest application...', 'NestFactory');

      const parsed = lastLine();
      expect(parsed).toMatchObject({
        level: 'info',
        message: 'Starting Nest application...',
        service: 'loyalty-service',
        context: 'NestFactory',
      });
      expect(parsed).not.toHaveProperty('0');
      expect(parsed).not.toHaveProperty('1');
    });

    it('handles a string context on warn()', () => {
      const logger = new JsonLogger('loyalty-service');
      logger.warn('Some warning', 'RoutesResolver');

      const parsed = lastLine();
      expect(parsed).toMatchObject({ level: 'warn', context: 'RoutesResolver' });
      expect(parsed).not.toHaveProperty('0');
    });

    it('handles a string context on debug()', () => {
      const logger = new JsonLogger('loyalty-service');
      logger.debug('Some debug', 'InstanceLoader');

      const parsed = lastLine();
      expect(parsed).toMatchObject({ level: 'debug', context: 'InstanceLoader' });
      expect(parsed).not.toHaveProperty('0');
    });

    it('handles string trace and string context on error()', () => {
      const logger = new JsonLogger('loyalty-service');
      logger.error('Boom', 'stack trace here', 'ExceptionsHandler');

      const parsed = lastLine();
      expect(parsed).toMatchObject({
        level: 'error',
        trace: 'stack trace here',
        context: 'ExceptionsHandler',
      });
      expect(parsed).not.toHaveProperty('0');
    });
  });

  describe("this SDK's own convention: context passed as a LogContext object", () => {
    it('preserves object context fields on log()', () => {
      const logger = new JsonLogger('cashback-service');
      logger.log('Processing purchase', { service: 'cashback-service', correlationId: 'corr_1' });

      const parsed = lastLine();
      expect(parsed).toMatchObject({
        level: 'info',
        message: 'Processing purchase',
        service: 'cashback-service',
        correlationId: 'corr_1',
      });
    });

    it('preserves object context fields alongside trace on error()', () => {
      const logger = new JsonLogger('cashback-service');
      logger.error('Failed', 'trace-info', { service: 'cashback-service', correlationId: 'corr_2' });

      const parsed = lastLine();
      expect(parsed).toMatchObject({
        level: 'error',
        trace: 'trace-info',
        correlationId: 'corr_2',
      });
    });
  });

  it('defaults to a bare service context when none is provided', () => {
    const logger = new JsonLogger('api-gateway');
    logger.log('No context supplied');

    const parsed = lastLine();
    expect(parsed).toMatchObject({ service: 'api-gateway' });
    expect(parsed).not.toHaveProperty('context');
  });

  it('always produces valid, parseable structured JSON with a timestamp', () => {
    const logger = new JsonLogger('purchase-service');
    logger.log('hello', 'SomeContext');

    const parsed = lastLine();
    expect(typeof parsed.timestamp).toBe('string');
    expect(() => new Date(parsed.timestamp as string).toISOString()).not.toThrow();
  });
});
