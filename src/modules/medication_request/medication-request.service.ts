import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { BaseService } from '../../common/bases/base.service';
import { MoreThan, Repository } from 'typeorm';
import { MedicationRequest } from '../../domain/entities/medication-request.entity';
import { ErrorManager } from '../../common/exceptions/error.manager';
import { Appointment, Medication } from '../../domain/entities';
import { PatientService } from '../patient/patient.service';
import { PractitionerService } from '../practitioner/practitioner.service';
import { CreateMedicationRequestDto, UpdateMedicationRequestDto } from '../../domain/dtos/medication-request/medication-request.dto';
import { FilteredMedicationRequestDto } from '../../domain/dtos/medication-request/FilteredMedicationRequest.dto';

@Injectable()
export class MedicationRequestsService extends BaseService<
    MedicationRequest,
    CreateMedicationRequestDto,
    UpdateMedicationRequestDto
> {
    constructor(
        @InjectRepository(MedicationRequest) protected repository: Repository<MedicationRequest>,
        protected readonly patientService: PatientService,
        @InjectRepository(Appointment) private readonly appointmentRepository: Repository<Appointment>,
        protected readonly SpecialistService: PractitionerService,
    ) {
        super(repository);
    }

    override async create(createDto: CreateMedicationRequestDto): Promise<MedicationRequest> {
        try {
            const doctor = await this.SpecialistService.findOne(createDto.practitionerId)
            if (!doctor) {
                throw ErrorManager.createSignatureError('Doctor not found');
            }

            const patient = await this.patientService.findOne(createDto.patientId)
            if (!patient) {
                throw ErrorManager.createSignatureError('Patient not found');
            }

            const appointment = await this.appointmentRepository.findOne({
                where: { id: createDto.appointmentId },
            });

            if (!appointment) {
                throw ErrorManager.createSignatureError('Appointment not found');
            }

            //falta control de lista de medicine, conviene hacerlo en el servicio de medicine
            return await this.repository.manager.transaction(
                async (transactionalEntityManager) => {
                    const newMedicationRequest = new MedicationRequest();
                    //TODO añadir nuevos atributos
                    newMedicationRequest.prolongedTreatment = createDto.prolongedTreatment;
                    newMedicationRequest.hiv = createDto.hiv;
                    newMedicationRequest.genericName = createDto.genericName;
                    newMedicationRequest.medicinePresentation = createDto.medicinePresentation;
                    newMedicationRequest.medicinePharmaceuticalForm = createDto.medicinePharmaceuticalForm;
                    newMedicationRequest.medicineQuantity = createDto.medicineQuantity
                    newMedicationRequest.indications = createDto.indications;
                    newMedicationRequest.diagnosis = createDto.diagnosis;
                    newMedicationRequest.isValidSignature = createDto.isValidSignature ?? false;
                    newMedicationRequest.practitioner = doctor;
                    newMedicationRequest.patient = patient;
                    newMedicationRequest.appointment = appointment;
                    const medicines: Medication[] = [];
                    for (const medicineDto of createDto.medicines) {
                        const medicine = await transactionalEntityManager.findOne(Medication, {
                            where: { id: medicineDto.id },
                        });
                        if (medicine) {
                            medicines.push(medicine);
                        } else {
                            throw new Error(`Medicine with ID ${medicineDto.id} not found`);
                        }
                    }

                    newMedicationRequest.medicines = medicines;
                    await transactionalEntityManager.save(MedicationRequest, newMedicationRequest);
                    return newMedicationRequest;
                }
            );
        } catch (error) {
            throw ErrorManager.createSignatureError((error as Error).message);
        }
    }

    override async update(id: string, updateDto: UpdateMedicationRequestDto): Promise<MedicationRequest> {
        try {
            console.log('to update: ', updateDto)
            const existingMedicationRequest = await this.repository.findOne({
                where: { id },
                relations: ['practitioner', 'patient', 'medicines'],
            });

            if (!existingMedicationRequest) {
                throw ErrorManager.createSignatureError('MedicationRequest not found');
            }

            const doctor = updateDto.practitionerId
                ? await this.SpecialistService.findOne(updateDto.practitionerId)
                : existingMedicationRequest.practitioner;

            if (!doctor) {
                throw ErrorManager.createSignatureError('Doctor not found');
            }

            const patient = updateDto.patientId
                ? await this.patientService.findOne(updateDto.patientId)
                : existingMedicationRequest.patient;

            if (!patient) {
                throw ErrorManager.createSignatureError('Patient not found');
            }

            return await this.repository.manager.transaction(
                async (transactionalEntityManager) => {
                    existingMedicationRequest.indications = updateDto.indications ?? existingMedicationRequest.indications;
                    existingMedicationRequest.diagnosis = updateDto.diagnosis ?? existingMedicationRequest.diagnosis;
                    existingMedicationRequest.isValidSignature = updateDto.isValidSignature ?? existingMedicationRequest.isValidSignature;
                    existingMedicationRequest.practitioner = doctor;
                    existingMedicationRequest.patient = patient;
                    //nuevos atributos
                    existingMedicationRequest.prolongedTreatment = updateDto.prolongedTreatment ?? existingMedicationRequest.prolongedTreatment;
                    existingMedicationRequest.hiv = updateDto.hiv ?? existingMedicationRequest.hiv;
                    existingMedicationRequest.genericName = updateDto.genericName ?? existingMedicationRequest.genericName;
                    existingMedicationRequest.medicinePresentation = updateDto.medicinePresentation ?? existingMedicationRequest.medicinePresentation;
                    existingMedicationRequest.medicinePharmaceuticalForm = updateDto.medicinePharmaceuticalForm ?? existingMedicationRequest.medicinePharmaceuticalForm;
                    existingMedicationRequest.medicineQuantity = updateDto.medicineQuantity ?? existingMedicationRequest.medicineQuantity

                    if (updateDto.medicines) {
                        const updatedMedicines: Medication[] = [];
                        for (const medicineDto of updateDto.medicines) {
                            const medicine = await transactionalEntityManager.findOne(Medication, {
                                where: { id: medicineDto.id },
                            });
                            if (!medicine) {
                                throw new Error(`Medicine with ID ${medicineDto.id} not found`);
                            }
                            updatedMedicines.push(medicine);
                        }
                        existingMedicationRequest.medicines = updatedMedicines;
                    }

                    return await transactionalEntityManager.save(MedicationRequest, existingMedicationRequest);
                }
            );
        } catch (error) {
            throw ErrorManager.createSignatureError((error as Error).message);
        }
    }

    async findAllMedicationRequestByDoctorId( doctorId: string, page: number, limit: number, period?: string): Promise<{ data:MedicationRequest[]; total: number; lastPage: number}> {
        try {
            const doctor = await this.SpecialistService.findOne(doctorId);
            if (!doctor) {
                throw ErrorManager.createSignatureError('Doctor not found');
            }

            const now = new Date();
            let dateThreshold: Date | undefined;

            if (period === 'day') {
                dateThreshold = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
            } else if (period === 'week') {
                const sameDayLastWeek = new Date(now);
                sameDayLastWeek.setDate(now.getDate() - 7);
                dateThreshold = sameDayLastWeek;
             } else if (period === 'month') {
                const sameDayLastMonth = new Date(now);
                sameDayLastMonth.setMonth(now.getMonth() - 1);
                dateThreshold = sameDayLastMonth;}

            const queryRunner = this.repository.manager.connection.createQueryRunner();
            await queryRunner.connect();
            await queryRunner.startTransaction();

            const skip = (page - 1) * limit;

            const where: any = {
                practitioner: { id: doctorId},
                deletedAt: null,
            }

            if (dateThreshold) {
                where.createdAt = MoreThan(dateThreshold);
            }

            const total = await queryRunner.manager.count(MedicationRequest, {where});
            const lastPage = Math.ceil(total / limit);

            const MedicationRequests = await this.repository.find({
                where,
                relations: ['practitioner', 'patient', 'medicines'],
                skip,
                take: limit,
            });

            await queryRunner.commitTransaction();

            return { total, lastPage, data: MedicationRequests};
        } catch (error) {
            throw ErrorManager.createSignatureError((error as Error).message);

        }
    }

    async findAllMedicationRequestByPatientId(patientId: string, page: number, limit: number): Promise<{data: MedicationRequest[]; total: number; lastPage: number}> {
        try {

            const patient = await this.patientService.findOne(patientId);
            if (!patient) {
                throw ErrorManager.createSignatureError('Patient not found');
            }

            const queryRunner = this.repository.manager.connection.createQueryRunner();
            await queryRunner.connect();
            await queryRunner.startTransaction();

            const skip = (page - 1) * limit;


            const total = await queryRunner.manager.count(MedicationRequest, {
                where: {
                patient:{
                    id: patientId
                },
                deletedAt: null,
                },
            });

            const lastPage = Math.ceil(total / limit);

            const MedicationRequests = await this.repository.find({
                where: {
                    patient: { id: patientId },
                },
                relations: ['practitioner', 'patient', 'medicines'],
                skip, 
                take: limit,
            });
            return {
                total, lastPage, data: MedicationRequests}
        } catch (error) {
            throw ErrorManager.createSignatureError((error as Error).message);
        }
    }

    async removeMedicineRequest (id: string) {
        try {
          const medicineRequestToRemove = await this.repository.findOne({
            where:{id, deletedAt: null}
          });
      
          if(!medicineRequestToRemove){
            throw new NotFoundException(`Medicine Request with id ${id} was not faound, try again `)
          }
      
          const deletedMedicationRequest= await this.repository.softRemove(medicineRequestToRemove)
      
          return {
            message: 'mMdicine Request remove successfully',
            deletedMedicationRequest,
          }
        } catch (error) {
          throw ErrorManager.createSignatureError((error as Error).message);
        }
      }

    async recoverMedicineRequest (id: string) {
        try {
          const medicineRequestToRecover = await this.repository.findOne({
            where:{id},
            withDeleted: true,
          });
      
          if(!medicineRequestToRecover || !medicineRequestToRecover.deletedAt){
            throw new NotFoundException(`Medicine Request with id ${id} was not faound, try again `)
          }
      
          const medicationRequestRecovered = await this.repository.recover(medicineRequestToRecover)
      
          return {
            message: 'Medicine Request recovered successfully',
            medicationRequestRecovered
          }
        } catch (error) {
          throw ErrorManager.createSignatureError((error as Error).message);
        }
      }

      //TODO find filtered paginated
    //   async findAllPaginated(
    //     filteredDto: FilteredMedicationRequestDto
    //     // page: number = 1, limit: number = 10
    //     ): Promise<{medicationRequests: MedicationRequest[], page: number, lastPage: number,  total: number}> {
    //     try {
    //         const {page, limit} = filteredDto 

    //         // Construir array de relaciones
    //         let relations: string[] = [];

    //         // Verificar si hay filtros para agregar relaciones
    //         if (filteredDto.practitionerId) {
    //         relations.push('practitioner');
    //         }
    //         if (filteredDto.patientId) {
    //         relations.push('patient');  // 'practitionerRole' es la relación en la entidad Practitioner
    //         }
    //         if (filteredDto.medicines) {
    //         relations.push('medicines');
    //         }

    //         // Construir el objeto 'where' para los filtros
    //         const where: FindOptions<MedicationRequest> = {}; // Objeto para las condiciones WHERE

    //         for (const key in filteredDto) {
    //         if (Object.prototype.hasOwnProperty.call(filteredDto, key)) {
    //             const value = filteredDto[key];

    //             // Excluir relaciones y campos undefined/null
    //             if (key !== 'ProfessionalDegree' && key !== 'practitionerRole' && key !== 'socialWorkId' && value !== undefined && value !== null) {
    //             where[key] = value; // Filtro exacto por atributo
    //             }
    //         }
    //         }

    //         // Opciones de búsqueda y relaciones a incluir
    //         const findOptions: unknown = {
    //         where: where,
    //         relations: relations.length > 0 ? relations : undefined,
    //         skip: (page - 1) * limit,
    //         take: limit,
    //         };

    //         const [data, total] = await this.repository
    //         .createQueryBuilder('medicationRequest')
    //         .leftJoinAndSelect('medicationRequest.practitioner', 'practitioner')
    //         .leftJoinAndSelect('medicationRequest.patient', 'patient')
    //         .leftJoinAndSelect('medicationRequest.acceptedSocialWorks', 'acceptedSocialWorks')
    //         //.leftJoinAndSelect('medicationRequest.practitionerAppointment', 'practitionerAppointment')
    //         .leftJoinAndSelect('practitionerAppointment.location', 'location')  // Si "location" también es una relación
    //         .addSelect([
    //           'medicationRequest.indications',
    //           'medicationRequest.diagnosis',
    //           'medicationRequest.isValidSignature',
    //           'medicationRequest.prolongedTreatment',
    //           'medicationRequest.hiv',
    //           'medicationRequest.genericName',
    //           'medicationRequest.medicinePresentation',
    //           'medicationRequest.medicinePharmaceuticalForm',
    //           'medicationRequest.medicineQuantity',
    //         ])
    //         .where('medicationRequest.deletedAt IS NULL')
    //         .skip((page - 1) * limit)
    //         .take(limit)
    //         .getManyAndCount();
    //         console.log('medicationRequests: ', data)
    //         const lastPage = Math.ceil(total / limit);
    //       return { medicationRequests: data, page, lastPage, total };
    //     } catch (error) {
    //       throw ErrorManager.createSignatureError((error as Error).message);
    //     }
    //   }

    async findAllPaginated(
        filteredDto: FilteredMedicationRequestDto
    ): Promise<{ data: MedicationRequest[], lastPage: number, total: number, msg?:string }> {
        try {
            const { page, limit, startDate, endDate ,...filters } = filteredDto;
    
            const queryBuilder = this.repository
                .createQueryBuilder('medicationRequest')
                .leftJoinAndSelect('medicationRequest.practitioner', 'practitioner')
                .leftJoinAndSelect('medicationRequest.patient', 'patient')
                .leftJoinAndSelect('medicationRequest.medicines', 'medicines')
                .addSelect([
                    'medicationRequest.indications',
                    'medicationRequest.diagnosis',
                    'medicationRequest.isValidSignature',
                    'medicationRequest.prolongedTreatment',
                    'medicationRequest.hiv',
                    'medicationRequest.genericName',
                    'medicationRequest.medicinePresentation',
                    'medicationRequest.medicinePharmaceuticalForm',
                    'medicationRequest.medicineQuantity',
                ])
                .where('medicationRequest.deletedAt IS NULL');
    
            // Manejar filtros de practitionerId
            if (filters.practitionerId) {
                queryBuilder.andWhere('practitioner.id = :practitionerId', { practitionerId: filters.practitionerId });
            }

            if (startDate && endDate) {
                queryBuilder.andWhere( 'DATE(medicationRequest.createdAt) BETWEEN :startDate AND :endDate',{
                    startDate,
                    endDate,
                });
            } else if (startDate) {
                queryBuilder.andWhere('DATE(medicationRequest.createdAt) = :startDate', { startDate });
            }
    
            // Manejar filtros generales
            for (const key in filters) {
                if (Object.prototype.hasOwnProperty.call(filters, key) && filters[key] !== undefined && filters[key] !== null) {
                    if (key === 'patientId') {
                        queryBuilder.andWhere('patient.id = :patientId', { patientId: filters[key] });
                    } else if (key === 'medicines') {
                        queryBuilder.leftJoinAndSelect('medicationRequest.medicines', 'medicines').andWhere('medicines.id = :medicineId', { medicineId: filters[key]});
                    }
                    else {
                        queryBuilder.andWhere(`medicationRequest.${key} = :${key}`, { [key]: filters[key] });
                    }
                }
            }
    
            const [medicationRequests, total] = await queryBuilder
                .skip((page - 1) * limit)
                .take(limit)
                .getManyAndCount();
    
            const lastPage = Math.ceil(total / limit);
            let msg ="" 
            if(total == 0) msg="No se encontraron datos"
            return { data: medicationRequests, lastPage, total, msg };
        } catch (error) {
            throw ErrorManager.createSignatureError((error as Error).message);
        }
    }

   
}
