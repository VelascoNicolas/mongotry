import { Body, Controller, Get, Param, Post, Query, Patch } from '@nestjs/common';
import { OrganizationService } from './organization.service';
import { Organization } from '../../domain/entities';
import { ControllerFactory } from '../../common/factories/controller.factory';
import {
  CreateOrganizationDto,
  SerializerOrganizationDto,
  UpdateOrganizationDto
} from '../../domain/dtos';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiPaginationResponse } from '../../common/swagger/api-pagination-response';
import { OrganizationPaginationDto } from '../../domain/dtos/organization/organization-filtered-pagination.dto';
import { toDto, toDtoList } from '../../common/util/transform-dto.util';
import { PaginationMetadata } from '../../common/util/pagination-data.util';

@ApiTags('Organization')
@Controller('organization')
export class OrganizationController extends ControllerFactory<
  Organization,
  CreateOrganizationDto,
  UpdateOrganizationDto,
  SerializerOrganizationDto
>(
  Organization,
  CreateOrganizationDto,
  UpdateOrganizationDto,
  SerializerOrganizationDto
) {
  constructor(protected service: OrganizationService) {
    super();
  }

  @Post()
  @ApiOperation({ description: 'Crear una nueva organización' })
  @ApiCreatedResponse({ type: SerializerOrganizationDto })
  async create(@Body() createDto: CreateOrganizationDto): Promise<SerializerOrganizationDto> {
    const organization = await this.service.create(createDto);
    return toDto(SerializerOrganizationDto, organization);
  }

  // @Get()
  // @ApiOperation({
  //   description: 'Obtener organizations con filtros opcionales con paginación'
  // })
  // @ApiPaginationResponse(SerializerOrganizationDto)
  // override async findAll(
  //   @Query() paginationDto: OrganizationPaginationDto
  // ): Promise<{ data: SerializerOrganizationDto[]; meta: PaginationMetadata }> {
  //   const { data, meta } = await this.service.findAll(paginationDto);
  //   const serializedData = toDtoList(SerializerOrganizationDto, data);

  //   return { data: serializedData, meta };
  // }

  @Get(':id')
  @ApiOperation({ description: 'Obtener una organización por su ID con todas sus relaciones' })
  @ApiOkResponse({ type: SerializerOrganizationDto })
  async findOne(@Param('id') id: string): Promise<SerializerOrganizationDto> {
    const organization = await this.service.getOne(id);
    return toDto(SerializerOrganizationDto, organization);
  }

  @Patch(':id')
  @ApiOperation({ description: 'Actualizar una organización por su ID' })
  @ApiOkResponse({ type: SerializerOrganizationDto })
  async update(@Param('id') id: string, @Body() updateDto: UpdateOrganizationDto): Promise<SerializerOrganizationDto> {
    const organization = await this.service.update(id, updateDto);
    return toDto(SerializerOrganizationDto, organization);
  }
}
