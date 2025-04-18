import {
  IsBoolean,
  IsNotEmpty,
  IsNumberString,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  ValidateNested,
} from 'class-validator';
import {
  CreatePractitionerAppointmentDto,
  UpdatePractitionerAppointmentDto,
} from '..';
import { Type } from 'class-transformer';
import { ShortBaseDto } from '../../../common/dtos';
import { ApiProperty, OmitType, PartialType } from '@nestjs/swagger';
import { UserDto } from '../user/user.dto';

export class CreatePractitionerDto extends OmitType(UserDto, ['role'] as const) {
  @IsOptional()
  @IsString()
  @ApiProperty({ example: '123456' })
  license?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ example: 'f0d50580-e7ca-4860-ba4e-7c4809153ae7' })
  professionalDegreeId?: string;

  @ValidateNested({ each: true })
  @Type(() => ShortBaseDto)
  @IsOptional()
  @ApiProperty({ type: [ShortBaseDto] })
  practitionerRole?: ShortBaseDto[];

  @IsOptional()
  @IsBoolean()
  @ApiProperty({ example: false })
  homeService?: boolean;

  @IsOptional()
  @IsBoolean()
  @ApiProperty({ example: false })
  acceptedSocialWorks?: boolean;

  @ValidateNested({ each: true })
  @Type(() => CreatePractitionerAppointmentDto)
  @IsOptional()
  @ApiProperty({ type: [CreatePractitionerAppointmentDto] })
  practitionerAppointment?: CreatePractitionerAppointmentDto[];

  @IsOptional()
  @IsString()
  @ApiProperty({ example: '00:30' })
  consultationTime: string;

}

export class UpdatePractitionerDto extends PartialType(OmitType(CreatePractitionerDto, ['practitionerAppointment'])) {
  @ValidateNested({ each: true })
  @Type(() => UpdatePractitionerAppointmentDto)
  @IsOptional()
  @ApiProperty({ type: [UpdatePractitionerAppointmentDto] })
  practitionerAppointment?: UpdatePractitionerAppointmentDto[];
}

export class ValidatePractitionerSisaDto {
  @IsNotEmpty()
  @IsNumberString()
  @Length(8, 8)
  @ApiProperty({ example: '12345678', description: 'DNI del profesional' })
  dni: string;

  @IsNotEmpty()
  @IsNumberString()
  @ApiProperty({ example: '123456', description: 'Matrícula del profesional' })
  license: string;
}

export class PractitionerByNameAndLicenseDto {
  @IsOptional()
  @IsString()
  @ApiProperty({ required: false, description: 'Nombre del médico' })
  name?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ required: false, description: 'Matrícula del médico' })
  license?: string;
}
