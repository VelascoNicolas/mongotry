import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { LocationService } from './location.service';
import { ControllerFactory } from '../../common/factories/controller.factory';
import { Location } from '../../domain/entities';
import { CreateLocationDto, SerializerLocationDto, UpdatelocationDto } from '../../domain/dtos';
import { ApiTags } from '@nestjs/swagger';
import { toDto } from '../../common/util/transform-dto.util';

@ApiTags('Location')
@Controller('location')
export class LocationController extends ControllerFactory<
  Location,
  CreateLocationDto,
  UpdatelocationDto,
  SerializerLocationDto
>(Location, CreateLocationDto, UpdatelocationDto, SerializerLocationDto) {
  constructor(protected readonly locationsService: LocationService) {
    super();
  }

  @Post()
  async createlocation(@Body() createlocationDto: CreateLocationDto) {
    return await this.locationsService.createlocation(createlocationDto);
  }

  @Get()
  async getAll(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10
  ): Promise<{ total: number; page: number; limit: number; locations: SerializerLocationDto[] }> {
    const { locations, total } = await this.locationsService.getAll(page, limit);
    return { locations: locations.map((location) => toDto(SerializerLocationDto, location)), total, page, limit };
  }

  @Get(':id')
  async getOnelocation(@Param('id') id: string) {
    return await this.locationsService.getOne(id);
  }

  @Patch(':id')
  async updatelocation(@Param('id') id: string, @Body() updatelocationDto: UpdatelocationDto) {
    return await this.locationsService.update(id, updatelocationDto);
  }

  @Delete(':id')
  async softDelete(@Param('id') id: string) {
    return await this.locationsService.softDelete(id);
  }

  @Post('/recover/:id')
  async recover(@Param('id') id: string) {
    return await this.locationsService.recover(id);
  }
}
