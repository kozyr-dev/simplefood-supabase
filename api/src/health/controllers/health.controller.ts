import { Controller, Get, UseFilters } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckService,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';
import { Public } from '@/auth/decorators/public.decorator';
import { HealthCheckFilter } from '../filters/health-check.filter';

// Explicit tag (not the auto-generated "Health"): renaming the class must not
// rename the public docs section or the group in generated frontend clients.
@ApiTags('health')
@Public()
@Controller('health')
@UseFilters(HealthCheckFilter)
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
  ) {}

  /**
   * 200 `{ status: 'ok' }` when every check passes, 503 otherwise.
   * Used by the Docker healthcheck and uptime monitoring.
   */
  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.db.pingCheck('database').withTimeout(1500),
    ]);
  }
}
