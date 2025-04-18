import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { ShortBaseDto } from '../../../common/dtos';

export class SerializerProfessionalDegreeDto extends ShortBaseDto {
  @Expose()
  @ApiProperty({ example: 'Doctor' })
  professionalDegree: string;
}
