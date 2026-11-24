import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildSwaggerDocumentConfig,
  operationIdFactory,
  readApiVersion,
} from './swagger.config';

describe('swagger config', () => {
  describe('operationIdFactory', () => {
    it.each([
      ['HealthController', 'check', 'Health_check'],
      ['ProductsController', 'findAll', 'Products_findAll'],
      // Only a trailing "Controller" is removed.
      ['ControllerHelpers', 'run', 'ControllerHelpers_run'],
    ])('%s.%s -> %s', (controllerKey, methodKey, expected) => {
      expect(operationIdFactory(controllerKey, methodKey)).toBe(expected);
    });

    it('keeps the same method name unique across controllers', () => {
      expect(operationIdFactory('ProductsController', 'findAll')).not.toBe(
        operationIdFactory('OrdersController', 'findAll'),
      );
    });
  });

  it('reads the API version from package.json', () => {
    const { version } = JSON.parse(
      readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8'),
    ) as { version: string };

    expect(readApiVersion()).toBe(version);
  });

  it('builds the document info and the bearer auth scheme', () => {
    const config = buildSwaggerDocumentConfig();

    expect(config.info).toMatchObject({
      title: 'SimpleFood API',
      version: readApiVersion(),
    });
    expect(config.components?.securitySchemes?.bearer).toMatchObject({
      type: 'http',
      scheme: 'bearer',
    });
  });
});
