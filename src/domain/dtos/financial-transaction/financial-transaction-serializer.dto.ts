import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { ShortBaseDto } from '../../../common/dtos';
import { SerializerShortorganizationDto } from '../organization/organization-serializer.dto';

export class SerializerFinancialTransactionDto extends ShortBaseDto {
  @Expose()
  @ApiProperty({ example: 15.5, description: 'Percentage of the commission' })
  percentage: number;

  @Expose()
  @ApiProperty({
    example: 10,
    description: 'Minimum number of patients required'
  })
  minimunPatients: number;

  @Expose()
  @Type(() => SerializerShortorganizationDto)
  organizations: SerializerShortorganizationDto[];
}

export class ShortCommissionDto extends ShortBaseDto {
  @Expose()
  @ApiProperty({ example: 15.5 })
  percentage: number;

  @Expose()
  @ApiProperty({ example: 10 })
  minimunPatients: number;
}
