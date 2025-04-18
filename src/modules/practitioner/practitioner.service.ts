import { forwardRef, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { BaseService } from '../../common/bases/base.service';
import {
  getPagingData,
  PaginationMetadata
} from '../../common/util/pagination-data.util';
import { ErrorManager } from '../../common/exceptions/error.manager';
import {
  Conditions,
  DynamicQueryBuilder
} from '../../common/util/dynamic-query-builder.util';
import {
  ProfessionalDegree,
  Patient,
  Prescription,
  ChargeItem,
  Practitioner,
  PractitionerAppointment,
  PractitionerRole,
  Appointment,
  Location
} from '../../domain/entities';
import { EntityManager, Repository, SelectQueryBuilder } from 'typeorm';
import { Gender, Role } from '../../domain/enums';
import * as bcrypt from 'bcrypt';
import axios from 'axios';
import { CreatePractitionerDto, PractitionerByNameAndLicenseDto, UpdatePractitionerDto } from '../../domain/dtos/practitioner/practitioner.dto';
import { PractitionerFilteredPaginationDto } from '../../domain/dtos/practitioner/practitioner-filtered-pagination.dto';
import { AuthService } from '../auth/auth.service';
import { plainToInstance } from 'class-transformer';
import { SerializerPractitionerDto } from '../../domain/dtos';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class PractitionerService extends BaseService<
  Practitioner,
  CreatePractitionerDto,
  UpdatePractitionerDto
> {
  constructor(
    @InjectRepository(Practitioner) protected repository: Repository<Practitioner>,
    @InjectRepository(PractitionerRole) private readonly practitionerRoleRepository: Repository<PractitionerRole>,
    @InjectRepository(Patient) private readonly patientRepository: Repository<Patient>,
    @InjectRepository(ProfessionalDegree) private readonly professionalDegreeRepository: Repository<ProfessionalDegree>,
    @Inject(forwardRef(() => AuthService)) private readonly authService: AuthService,
    private readonly httpService: HttpService,
  ) {
    super(repository);
  }

  // Crear un nuevo especialista
  async createSpecialist(createSpecialistDto: CreatePractitionerDto) {
    try {
      const { password, dni, license, email, username, ...userData } = createSpecialistDto;
  
      // Validar existencia previa
      const existingUser = await this.repository.findOne({
        where: [{ dni }, { email }, { username }, { phone: userData.phone }],
      });

      const existingPatient = await this.patientRepository.findOne({
        where: [{ email }, { username }],
      });

      if (existingUser || existingPatient) {
        throw new ErrorManager(
          'User with provided DNI, email, username, or phone already exists',
          400,
        );
      }

      // Validar en SISA
      await this.validatePractitionerInSisa(dni, license);
  
      const hashedPassword = password ? await bcrypt.hash(password, 10) : null;
  
      const practitioner = this.repository.create({
        ...userData,
        dni,
        password: hashedPassword,
        role: Role.SPECIALIST,
        license,
        email,
        username,
      });
  
      const savedPractitioner = await this.repository.save(practitioner);

      const payload: JwtPayload = { id: savedPractitioner.id, email: savedPractitioner.email, role: savedPractitioner.role, name: savedPractitioner.name, lastName: savedPractitioner.lastName };
      const token = await this.authService.signJWT(payload);

      const practitionerDto = plainToInstance(SerializerPractitionerDto, savedPractitioner);

      return { ...practitionerDto, accessToken: token };
    } catch (error) {
      throw ErrorManager.createSignatureError((error as Error).message);
    }
  }

  //Verify practitioner in SISA
  async validatePractitionerInSisa(dni: string, license: string): Promise<boolean> {
    try {
      // Configuración de la llamada al SISA
      const sisaUrl = `https://sisa.msal.gov.ar/sisa/services/rest/profesional/obtener?nrodoc=${dni}&usuario=jlllado&clave=$FullSalud123`;
      
      const response = await firstValueFrom(
        this.httpService.get(sisaUrl)
      );

      const sisaData = response.data;

      // Validar respuesta del SISA
      if (sisaData.resultado !== 'OK') {
        throw new ErrorManager('No valid professional found in SISA', 400);
      }

      // Validar coincidencia de DNI
      if (sisaData.numeroDocumento !== dni) {
        throw new ErrorManager('DNI does not match with SISA records', 400);
      }

      // Validar matrícula
      const matriculas = Array.isArray(sisaData.matriculas)
        ? sisaData.matriculas
        : sisaData.matriculas
        ? [sisaData.matriculas]
        : [];

      const validMatricula = matriculas.find(
        (matricula) =>
          matricula.estado === 'Habilitado' && matricula.matricula === license,
      );

      if (!validMatricula) {
        throw new ErrorManager(
          `No valid license (${license}) found for this professional in SISA`,
          400,
        );
      }

      return true;
    } catch (error) {
      throw ErrorManager.createSignatureError((error as Error).message);
    }
  }

  // Obtener todos los especialistas
  async getAll(): Promise<Practitioner[]> {
    try {
      return await this.repository.find({ where: { deletedAt: null } });
    } catch (error) {
      throw ErrorManager.createSignatureError((error as Error).message);
    }
  }

  // Obtener un especialista por ID
  async getOne(id: string): Promise<Practitioner> {
    try {
      const practitioner = await this.repository.findOne({
        where: { id },
        relations: ['practitionerRole', 'professionalDegree'],
      });

      if (!practitioner) {
        throw new NotFoundException(`Specialist with ID ${id} not found`);
      }

      return practitioner;
    } catch (error) {
      throw ErrorManager.createSignatureError((error as Error).message);
    }
  }

  async findByNameAndLicense(filterDto: PractitionerByNameAndLicenseDto): Promise<Practitioner> {
    try {
      const { name, license } = filterDto;
      
      if (!name && !license) {
        throw new ErrorManager('At least one filter parameter (name or license) is required', 400);
      }
  
      const queryBuilder = this.repository.createQueryBuilder('practitioner')
        .leftJoinAndSelect('practitioner.practitionerRole', 'practitionerRole')
        .leftJoinAndSelect('practitioner.professionalDegree', 'professionalDegree')
        .where('practitioner.deletedAt IS NULL');
  
      if (name && license) {
        queryBuilder.andWhere('(practitioner.name LIKE :name OR practitioner.lastName LIKE :name) AND practitioner.license = :license', { 
          name: `%${name}%`, 
          license 
        });
      } else if (name) {
        queryBuilder.andWhere('practitioner.name LIKE :name OR practitioner.lastName LIKE :name', { 
          name: `%${name}%` 
        });
      } else if (license) {
        queryBuilder.andWhere('practitioner.license = :license', { 
          license 
        });
      }
  
      const practitioner = await queryBuilder.getOne();
  
      if (!practitioner) {
        throw new NotFoundException('No practitioner found with the provided filters');
      }
  
      return practitioner;
    } catch (error) {
      throw ErrorManager.createSignatureError((error as Error).message);
    }
  }

   // Actualizar un especialista
   async update(id: string, updateSpecialistDto: UpdatePractitionerDto): Promise<Practitioner> {
    try {
      const practitioner = await this.getOne(id);

      const { practitionerRole, professionalDegreeId, ...updatedData } = updateSpecialistDto;

      if (practitionerRole) {
        const practitionerRoleEntities = await this.practitionerRoleRepository.findByIds(
          practitionerRole.map((s) => s.id),
        );
        if (practitionerRoleEntities.length !== practitionerRole.length) {
          throw new ErrorManager('Some practitionerRole not found', 400);
        }
        practitioner.practitionerRole = practitionerRoleEntities;
      }

      if (professionalDegreeId) {
        const professionalDegreeEntity = await this.professionalDegreeRepository.findOne({ where: { id: professionalDegreeId } });
        if (!professionalDegreeEntity) {
          throw new ErrorManager(`professionalDegree with id "${professionalDegreeId}" not found`, 400);
        }
        practitioner.professionalDegree = professionalDegreeEntity;
      }

      Object.assign(practitioner, updatedData);
      return await this.repository.save(practitioner);
    } catch (error) {
      throw ErrorManager.createSignatureError((error as Error).message);
    }
  }

  // Eliminar especialista (soft delete)
  async softDelete(id: string): Promise<{ message: string }> {
    try {
      const practitioner = await this.getOne(id);

      await this.repository.softRemove(practitioner);

      return { message: 'Specialist soft deleted successfully' };
    } catch (error) {
      throw ErrorManager.createSignatureError((error as Error).message);
    }
  }

  // Recuperar un especialista eliminado
  async recover(id: string): Promise<{ message: string }> {
    try {
      const practitioner = await this.repository.findOne({
        where: { id },
        withDeleted: true,
      });

      if (!practitioner || !practitioner.deletedAt) {
        throw new NotFoundException(`Specialist with ID ${id} not found or not deleted`);
      }

      await this.repository.recover(practitioner);

      return { message: 'Specialist recovered successfully' };
    } catch (error) {
      throw ErrorManager.createSignatureError((error as Error).message);
    }
  }

  //condiciones que se agregarán al query builder para filtrar los patient turn
  private practitionerConditions: Conditions<Practitioner> = {
    name: (queryBuilder: SelectQueryBuilder<Practitioner>, value: string) =>
      queryBuilder.andWhere('user.name LIKE :name', { name: `%${value}%` }),
    lastName: (queryBuilder: SelectQueryBuilder<Practitioner>, value: string) =>
      queryBuilder.andWhere('user.last_name LIKE :lastName', {
        lastName: `%${value}%`
      }),
    dni: (queryBuilder: SelectQueryBuilder<Practitioner>, value: string) =>
      queryBuilder.andWhere('user.dni LIKE :dni', { dni: `%${value}%` }),
    gender: (queryBuilder: SelectQueryBuilder<Practitioner>, value: Gender) =>
      queryBuilder.andWhere('user.gender = :gender', { gender: value }),
    birth: (queryBuilder: SelectQueryBuilder<Practitioner>, value: Date) =>
      queryBuilder.andWhere(
        '( YEAR(user.birth) = YEAR(:birth) ' +
          'AND MONTH(user.birth) = MONTH(:birth) ' +
          'AND DAY(user.birth) = DAY(:birth) ) ',
        { birth: value }
      ),
    homeService: (
      queryBuilder: SelectQueryBuilder<Practitioner>,
      value: boolean
    ) =>
      queryBuilder.andWhere('practitioner.home_service = :homeservice', {
        homeservice: value
      }),
    license: (queryBuilder: SelectQueryBuilder<Practitioner>, value: string) =>
      queryBuilder.andWhere('practitioner.license = :license', {
        license: value
      }),
    practitionerRole: (queryBuilder: SelectQueryBuilder<Practitioner>, value: string) =>
      queryBuilder.andWhere('practitioner_role.id = :id', { id: value }),
    socialWorkEnrollmentId: (
      queryBuilder: SelectQueryBuilder<Practitioner>,
      value: string
    ) => queryBuilder.andWhere('social_work_enrrollment.id = :id', { id: value }),
    professionalDegree: (queryBuilder: SelectQueryBuilder<Practitioner>, value: string) =>
      queryBuilder.andWhere('professionalDegree.id = :id', { id: value })
  };

  //Override del método base findAll para filtrar por propiedades
  async findAllDeprecated(
    paginationDto: PractitionerFilteredPaginationDto
  ): Promise<{ data: Practitioner[]; meta: PaginationMetadata }> {
    try {
      const { page, limit } = paginationDto;
      //crea un query builder base para traer la entidad con las relaciones que necesita el Serializer
      const queryBuilderBase = this.repository
        .createQueryBuilder('practitioner')
        .leftJoinAndSelect(
          'practitioner.practitionerAppointment',
          'practitionerAppointment'
        )
        .leftJoinAndSelect('practitioner.professionalDegree', 'professionalDegree')
        .leftJoinAndSelect('practitioner.practitionerRole', 'practitionerRole')
        //.leftJoinAndSelect('practitioner.acceptedSocialWorks', 'social_work');

      //añade las condiciones where al query builder
      const query = DynamicQueryBuilder.buildSelectQuery<Practitioner>(
        queryBuilderBase,
        this.practitionerConditions,
        paginationDto
      );

      //añade la paginación al query creada
      query.skip((page - 1) * limit).take(limit);

      //ejecuta la query
      const entities = await query.getMany();

      //retorna los resultados
      console.log(entities);
      return {
        data: entities,
        meta: getPagingData(entities, page, limit)
      };
    } catch (error) {
      throw ErrorManager.createSignatureError((error as Error).message);
    }
  }

  override async remove(id: string): Promise<string> {
    try {
      const entity = await this.findOne(id);
      return this.repository.manager.transaction(
        async (manager: EntityManager) => {
          await manager //eliminar el especialista de turno
            .createQueryBuilder()
            .update(Appointment)
            .set({ practitioner: null })
            .where('specialist_id = :id', { id: entity.id })
            .execute();
          await manager //eliminar el especialista de prescripcion
            .createQueryBuilder()
            .update(Prescription)
            .set({ practitioner: null })
            .where('specialist_id = :id', { id: entity.id })
            .execute();
          await manager.delete(PractitionerAppointment, { practitioner: entity });
          await manager.delete(ChargeItem, { practitioner: entity });
          await manager.remove(Practitioner, entity);
          return `Entity with id ${id} deleted`;
        }
      );
    } catch (error) {
      throw ErrorManager.createSignatureError((error as Error).message);
    }
  }

  override async softRemove(id: string): Promise<string> {
    try {
      const entity = await this.findOne(id);
      return this.repository.manager.transaction(
        async (manager: EntityManager) => {
          await manager.softDelete(ChargeItem, { practitioner: entity });
          await manager.softRemove(entity);
          return `Entity with id ${id} soft deleted`;
        }
      );
    } catch (error) {
      throw ErrorManager.createSignatureError((error as Error).message);
    }
  }

  override async restore(id: string): Promise<Practitioner> {
    try {
      const entity = await this.repository.findOne({
        where: { id },
        withDeleted: true
      });
      return this.repository.manager.transaction(
        async (manager: EntityManager) => {
          const recovered = await manager.recover(entity);
          await manager.restore(ChargeItem, { practitioner: entity });
          return recovered;
        }
      );
    } catch (error) {
      throw ErrorManager.createSignatureError((error as Error).message);
    }
  }

  async findAllWithTurns(): Promise<Practitioner[]> {
    try {
      return await this.repository
        .createQueryBuilder('practitioner')      
        .leftJoinAndSelect('practitioner.practitionerAppointment', 'practitionerAppointment')
        .leftJoinAndSelect('practitioner.professionalDegree', 'professionalDegree')
        .leftJoinAndSelect('practitioner.practitionerRole', 'practitionerRole')
        //.leftJoinAndSelect('practitioner.acceptedSocialWorks', 'social_work')
        .leftJoinAndSelect('practitioner.turns', 'turn')
        //.leftJoinAndSelect('turn.Patient', 'Patient') // Opcional: otras relaciones de Turn
        .getMany();
    } catch (error) {
      console.error('Error fetching specialists with turns:', error);
      throw ErrorManager.createSignatureError((error as Error).message);
    }
  }

  async findAllPaginated(
    filteredDto: PractitionerFilteredPaginationDto,
  ): Promise<{ data: Practitioner[]; lastPage: number; total: number; msg?: string }> {
    try {
      const { page, limit, ...filters } = filteredDto;

      const queryBuilder = this.repository
        .createQueryBuilder('practitioner')
        .leftJoinAndSelect('practitioner.professionalDegree', 'professionalDegree')
        .leftJoinAndSelect('practitioner.practitionerRole', 'practitionerRole')
        .leftJoinAndSelect('practitioner.socialWorkEnrollment', 'socialWorkEnrollment')
        .leftJoinAndSelect('practitioner.practitionerAppointment', 'appointments')
        .leftJoinAndSelect('practitioner.favorite', 'favorite')
        .where('practitioner.deletedAt IS NULL');

      // Filtros por relaciones
      if (filters.professionalDegree) {
        queryBuilder.andWhere('professionalDegree.id = :professionalDegreeId', { professionalDegreeId: filters.professionalDegree });
      }

      if (filters.practitionerRole) {
        queryBuilder.andWhere('practitionerRole.id = :practitionerRoleId', { practitionerRoleId: filters.practitionerRole });
      }

      if (filters.socialWorkEnrollmentId) {
        queryBuilder.andWhere('socialWorkEnrollment.id = :socialWorkEnrollmentId', { socialWorkEnrollmentId: filters.socialWorkEnrollmentId });
      }

      // Filtros de appointment
      if (filters.appointmentDay) {
        queryBuilder.andWhere('appointments.day = :appointmentDay', { appointmentDay: filters.appointmentDay });
      }

      // Filtros generales
      for (const key in filters) {
        if (Object.prototype.hasOwnProperty.call(filters, key) && filters[key] !== undefined && filters[key] !== null) {
          if (key !== 'professionalDegree' && key !== 'practitionerRole' && key !== 'socialWorkId' && key !== 'locationName' && key !== 'appointmentDay') {
            queryBuilder.andWhere(`practitioner.${key} = :${key}`, { [key]: filters[key] });
          }
        }
      }

      const [practitioners, total] = await queryBuilder
        .skip((page - 1) * limit)
        .take(limit)
        .getManyAndCount();

      const lastPage = Math.ceil(total / limit);
      let msg = '';
      if (total === 0) msg = 'No se encontraron datos';
      return { data: practitioners, lastPage, total, msg };
    } catch (error) {
      throw ErrorManager.createSignatureError((error as Error).message);
    }
  }
  
}
