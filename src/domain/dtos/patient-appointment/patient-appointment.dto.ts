import { ApiProperty, PartialType } from '@nestjs/swagger';
import { Day } from '../../enums';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  ValidateNested
} from 'class-validator';
import { Type } from 'class-transformer';
import { IsTime } from '../../../common/util/custom-dto-properties-decorators/validate-hour-decorator.util';
import { ShortBaseDto } from '../../../common/dtos';

export class CreatePatientAppointmentDto {
  @IsNotEmpty()
  @ApiProperty({ example: '09:00' })
  openingHour: string;

  @IsNotEmpty()
  @ApiProperty({ example: '13:30' })
  closeHour: string;

  @IsNotEmpty()
  @IsEnum(Day)
  @ApiProperty({
    examples: [
      Day.SUNDAY,
      Day.MONDAY,
      Day.TUESDAY,
      Day.WEDNESDAY,
      Day.THURSDAY,
      Day.FRIDAY,
      Day.SATURDAY
    ]
  })
  day: Day;

  @ValidateNested()
  @IsOptional()
  @Type(() => ShortBaseDto)
  turns?: ShortBaseDto;

  @IsOptional()
  //@IsUUID('all', { each: true })
  @ApiProperty({ example: ['3fa85f64-5717-4562-b3fc-2c963f66afa6'] })
  locationIds?: string[];
}

export class UpdatePatientAppointmentDto extends PartialType(
  CreatePatientAppointmentDto
) {
  @IsOptional()
  @IsNotEmpty()
  @IsUUID()
  id?: string;
}
