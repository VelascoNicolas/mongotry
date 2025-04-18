import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { FullBaseDto, ShortBaseDto } from '../../../common/dtos';
import { Day } from '../../enums';
import { SerializerLocationDto } from '../location/location-serializer.dto';

export class SerializerPatientAppointmentDto extends FullBaseDto {
  @Expose()
  @ApiProperty({ example: '09:00' })
  openingHour: string;

  @Expose()
  @ApiProperty({ example: '13:30' })
  closeHour: string;

  @Expose()
  @ApiProperty({
    example: Object.values(Day).join(', ')
  })
  day: Day;
  
  @Expose()
  @Type(() => SerializerLocationDto)
  locations: SerializerLocationDto[];
}

export class SerializerShortPatientAppointmentDto extends ShortBaseDto {
  @Expose()
  @ApiProperty({ example: '09:00' })
  openingHour: string;

  @Expose()
  @ApiProperty({ example: '13:30' })
  closeHour: string;

  @Expose()
  @ApiProperty({
    example: Object.values(Day).join(', ')
  })
  day: Day;
}
