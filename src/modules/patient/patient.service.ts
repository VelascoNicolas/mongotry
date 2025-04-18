import { Injectable, forwardRef, Inject, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { InjectRepository } from '@nestjs/typeorm';
import { BaseService } from '../../common/bases/base.service';
import {
  CreatePatientDto,
  SerializerPatientDto,
  UpdatePatientDto
} from '../../domain/dtos';
import { Patient, Practitioner, SocialWorkEnrollment } from '../../domain/entities';
import { ErrorManager } from '../../common/exceptions/error.manager';
import { Repository } from 'typeorm';
import { Role, DocumentType } from '../../domain/enums';
import { AuthService } from '../auth/auth.service';
import { plainToInstance } from 'class-transformer';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

@Injectable()
export class PatientService extends BaseService<
  Patient,
  CreatePatientDto,
  UpdatePatientDto
> {
  constructor(
    @InjectRepository(Patient) protected patientRepository: Repository<Patient>,
    @InjectRepository(Practitioner) private readonly practitionerRepository: Repository<Practitioner>,
    @InjectRepository(SocialWorkEnrollment) private readonly socialWorkEnrollmentRepository: Repository<SocialWorkEnrollment>,
    @Inject(forwardRef(() => AuthService)) private readonly authService: AuthService,
  ) {
    super(patientRepository);
  }

  async createPatient(createPatientDto: CreatePatientDto) {
    try {
      const { dni, email, phone, username, password, socialWorkEnrollmentId, ...userData } = createPatientDto;
      
      const existingPatient = await this.patientRepository.findOne({
        where: [{ dni }, { email }, { phone }, { username }],
      });
  
      const existingSpecialist = await this.practitionerRepository.findOne({
        where: [{ email }, { username }],
      });
  
      if (existingPatient || existingSpecialist) {
        throw new ErrorManager(
          'User with provided DNI, email, username, or phone already exists',
          400,
        );
      }
  
      const hashedPassword = password ? await bcrypt.hash(password, 10) : null;
  
      let socialWorkEnrollment: SocialWorkEnrollment | null = null;
      if (socialWorkEnrollmentId) {
        socialWorkEnrollment = await this.socialWorkEnrollmentRepository.findOne({ where: { id: socialWorkEnrollmentId } });
        if (!socialWorkEnrollment) {
          throw new ErrorManager(`Social Work with ID ${socialWorkEnrollmentId} not found`, 400);
        }
      }

      const patient = this.patientRepository.create({
        ...userData,
        password: hashedPassword,
        dni,
        email,
        phone,
        username,
        socialWorkEnrollment,        
        role: Role.PATIENT,
      });

      const savedPatient = await this.patientRepository.save(patient);

      const payload: JwtPayload = { id: savedPatient.id, email: savedPatient.email, role: savedPatient.role, name: savedPatient.name, lastName: savedPatient.lastName};
      const token = await this.authService.signJWT(payload);

      const patientDto = plainToInstance(SerializerPatientDto, savedPatient);

      return { ...patientDto, accesttoken: token };
    } catch (error) {
      throw ErrorManager.createSignatureError((error as Error).message);
    }
  }

  async getAll(page: number = 1, limit: number = 10): Promise<{ 
    patients: Patient[]; 
    total: number; 
    page: number; 
    limit: number;
    previousPage: number | null;
  }> {
    try {
      const [data, total] = await this.patientRepository.findAndCount({
        where: { deletedAt: null },
        skip: (page - 1) * limit,
        take: limit,
      });
  
      return { 
        patients: data, 
        total, 
        page, 
        limit,
        previousPage: page > 1 ? page - 1 : null,
      };
    } catch (error) {
      throw ErrorManager.createSignatureError((error as Error).message);
    }
  }
  
  async getOne(id: string): Promise<Patient> {
    try {
      const patient = await this.patientRepository.findOne({
        where: { id },
      });

      if (!patient) {
        throw new NotFoundException(`Patient with ID ${id} not found`);
      }

      return patient;
    } catch (error) {
      throw ErrorManager.createSignatureError((error as Error).message);
    }
  }

  async update(id: string, updatePatientDto: UpdatePatientDto): Promise<Patient> {
    try {
      const patient = await this.getOne(id);

      Object.assign(patient, updatePatientDto);

      return await this.patientRepository.save(patient);
    } catch (error) {
      throw ErrorManager.createSignatureError((error as Error).message);
    }
  }

  async softDelete(id: string): Promise<{ message: string }> {
    try {
      const patient = await this.getOne(id);

      await this.patientRepository.softRemove(patient);

      return { message: 'Patient soft deleted successfully' };
    } catch (error) {
      throw ErrorManager.createSignatureError((error as Error).message);
    }
  }

  async recover(id: string): Promise<{ message: string }> {
    try {
      const patient = await this.patientRepository.findOne({
        where: { id },
        withDeleted: true,
      });

      if (!patient || !patient.deletedAt) {
        throw new NotFoundException(`Patient with ID ${id} not found or not deleted`);
      }

      await this.patientRepository.recover(patient);

      return { message: 'Patient recovered successfully' };
    } catch (error) {
      throw ErrorManager.createSignatureError((error as Error).message);
    }
  }

  async getByDocument(
    type: DocumentType,
    number: string
  ): Promise<SerializerPatientDto> {
    try {
      // Validaciones según el tipo de documento
      switch (type) {
        case DocumentType.DNI:
          if (!/^\d{7,8}$/.test(number)) {
            throw new ErrorManager('Invalid DNI format. Must be 7 or 8 digits', 400);
          }
          break;
        case DocumentType.PASSPORT:
          if (!/^[A-Za-z0-9]{6,12}$/.test(number)) {
            throw new ErrorManager('Invalid Passport format', 400);
          }
          break;
        default:
          throw new ErrorManager('Invalid document type', 400);
      }
  
      const patient = await this.patientRepository.findOne({
        where: { 
          documentType: type,
          dni: number 
        },
        relations: ['socialWorkEnrollment']
      });
  
      if (!patient) {
        throw new NotFoundException(`Patient with ${type} ${number} not found`);
      }
  
      return plainToInstance(SerializerPatientDto, patient);
    } catch (error) {
      throw ErrorManager.createSignatureError((error as Error).message);
    }
  }

}

