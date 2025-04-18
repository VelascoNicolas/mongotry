import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ControllerFactory } from '../../common/factories/controller.factory';
import {
  CreateBranchDto,
  SerializerBranchDto,
  UpdateBranchDto
} from '../../domain/dtos';
import { Branch } from '../../domain/entities';
import { BranchService } from './branch.service';
import { toDto } from '../../common/util/transform-dto.util';

@ApiTags('Branch')
@Controller('branch')
export class BranchController extends ControllerFactory<
  Branch,
  CreateBranchDto,
  UpdateBranchDto,
  SerializerBranchDto
>(
  Branch,
  CreateBranchDto,
  UpdateBranchDto,
  SerializerBranchDto
) {
  constructor(protected service: BranchService) {
    super();
  }

  @Get(':id')
  async findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    const data = await this.service.findOne(id);
    return toDto(SerializerBranchDto, data) as unknown as SerializerBranchDto;
  }
}
