import { Get } from '@nestjs/common';
import { AdminController } from '@/auth/decorators/admin-controller.decorator';
import { ApiDataResponse } from '@/common/http/api-responses.decorator';
import type { DataResponse } from '@/common/http/responses';
import { DashboardDto } from '../dto/dashboard.dto';
import { DashboardService } from '../services/dashboard.service';

@AdminController('dashboard')
export class AdminDashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  /** Orders by status, today's and this week's orders, unhandled messages. */
  @Get()
  @ApiDataResponse(DashboardDto)
  async get(): Promise<DataResponse<DashboardDto>> {
    return { data: await this.dashboard.get() };
  }
}
