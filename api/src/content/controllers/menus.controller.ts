import { Controller, Get, Param, ParseEnumPipe } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '@/auth/decorators/public.decorator';
import { ErrorResponseDto } from '@/common/filters/error-response.dto';
import { ApiDataResponse } from '@/common/http/api-responses.decorator';
import type { DataResponse } from '@/common/http/responses';
import { MenuDto } from '../dto/menu.dto';
import { MenuKey } from '../entities/menu.entity';
import { MenusService } from '../services/menus.service';

@ApiTags('content')
@Public()
@Controller('menus')
export class MenusController {
  constructor(private readonly menus: MenusService) {}

  /** A navigation menu with its items, in display order. */
  @Get(':key')
  @ApiParam({ name: 'key', enum: MenuKey, enumName: 'MenuKey' })
  @ApiDataResponse(MenuDto)
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'Not one of the menu keys.',
  })
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description: 'This menu has not been created yet.',
  })
  async findByKey(
    @Param('key', new ParseEnumPipe(MenuKey)) key: MenuKey,
  ): Promise<DataResponse<MenuDto>> {
    return { data: await this.menus.findByKey(key) };
  }
}
