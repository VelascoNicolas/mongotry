import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsNumber, IsString, IsDateString } from 'class-validator';
import { CreateMedicationDto } from '../medication/medication.dto';
import { Transform, Type } from 'class-transformer';

export class FilteredMedicationRequestDto {
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  page?: number =1;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  limit?: number=10;

  @IsOptional()
  @IsString()
  @ApiProperty({ example: 'Indicado para el alivio del dolor y la fiebre. / Tomar una cápsula cada 8 horas por 7 días.' })
  indications?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ example: 'Infección respiratoria.' })
  diagnosis?: string;

  @IsOptional()
  @IsBoolean()
  @ApiProperty({ example: false })
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  isValidSignature?: boolean;

  @IsOptional()
  @IsString()
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  practitionerId?: string; 

  @IsOptional()
  @IsString()
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174001' })
  patientId?: string; 

  @IsOptional()
  @ApiProperty({ type: [CreateMedicationDto] })
  medicines?: CreateMedicationDto[]; 

  @IsOptional()
  @IsString()
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174002' })
  medicineId?: string;

  //nuevos atributos
  @IsOptional()
  @IsBoolean()
  @ApiProperty({ example: true })
  prolongedTreatment?: boolean;

  @IsOptional()
  @IsBoolean()
  @ApiProperty({ example: false })
  hiv?: boolean;

  @IsOptional()
  @IsString()
  @ApiProperty({ example: 'Paracetamol' })
  genericName?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ example: 'Tabletas recubiertas' })
  medicinePresentation?: string;
  
  @IsOptional()
  @IsString()
  @ApiProperty({ example: 'Oral' })
  medicinePharmaceuticalForm?: string;

  @IsOptional()
  @IsNumber()
  @ApiProperty({ example: 20 })
  medicineQuantity?: number;

  @IsOptional()
  @IsDateString()
  @ApiProperty({ example: '2025-04-01', description: 'Filtrar recetas desde esta fecha (formato YYYY-MM-DD)' })
  startDate?: string;

  @IsOptional()
  @IsDateString()
  @ApiProperty({ example: '2025-04-10', description: 'Filtrar recetas hasta esta fecha (formato YYYY-MM-DD)' })
  endDate?: string;

}

//export class UpdateMedicationRequestDto extends PartialType(CreateMedicationRequestDto) {}
