import {
  BadRequestException,
  Logger,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { BaseService } from '../../common/bases/base.service';
import { ErrorManager } from '../../common/exceptions/error.manager';
import {
  CreateAppointmentDto,
  SerializerAppointmentDto,
  TimeDTO,
  UpdateAppointmentDto
} from '../../domain/dtos';
import {
  PatientAppointment,
  Patient,
  Practitioner,
  Appointment
} from '../../domain/entities';
import { AppointmentStatus, Role } from '../../domain/enums';
import 'multer';
import { In, Not, Repository } from 'typeorm';
import { plainToClass } from 'class-transformer';
import { NotificationService } from '../notification/notification.service';
import { AuthService } from '../auth/auth.service';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';

@Injectable()
export class AppointmentService extends BaseService<
  Appointment,
  CreateAppointmentDto,
  UpdateAppointmentDto
> {
  private readonly logger = new Logger(AppointmentService.name)
  constructor(
    @InjectRepository(Appointment) protected repository: Repository<Appointment>,
    private readonly notificationService: NotificationService,
    private readonly authService: AuthService,
    @InjectQueue('email') private readonly emailQueue: Queue,
    @InjectQueue('whatsapp') private readonly whatsappQueue: Queue,
  ) {
    super(repository);
  }

  async createTurn(
    createTurnDto: CreateAppointmentDto
  ): Promise<Appointment | { status: number; message: string }> {
    const queryRunner = this.repository.manager.connection.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      let patient: Patient;
      // Verificar si llega `patientId` o el objeto `patient`
      if (createTurnDto.patientId) {
        patient = await queryRunner.manager.findOne(Patient, {
          where: { id: createTurnDto.patientId }
        });

        if (!patient) {
          throw new NotFoundException(
            `Patient with ID ${createTurnDto.patientId} not found`
          );
        }
      } else if (createTurnDto.patient) {
        const existingPatient = await queryRunner.manager.findOne(Patient, {
          where: { dni: createTurnDto.patient.dni }
        });

        if (existingPatient) {
          patient = existingPatient;
        } else {
          patient = queryRunner.manager.create(Patient, {
            dni: createTurnDto.patient.dni,
            name: createTurnDto.patient.name,
            lastName: createTurnDto.patient.lastName,
            email: createTurnDto.patient.email,
            phone: createTurnDto.patient.phone,
            documentType: createTurnDto.patient.documentType,
            role: Role.PATIENT
          });
          patient = await queryRunner.manager.save(patient);
        }
      } else {
        throw new BadRequestException(
          'Either patientId or patient object must be provided'
        );
      }

      const specialistIds = createTurnDto.practitionerIds.map((s) => s.id);

      // Asegurarnos de que los IDs no estén vacíos
      if (!specialistIds || specialistIds.length === 0) {
        throw new BadRequestException(
          'At least one specialist ID must be provided'
        );
      }

      const specialists = await queryRunner.manager.find(Practitioner, {
        where: { id: In(specialistIds) }
      });

      // Comprobamos si el número de especialistas encontrados coincide con los solicitados
      if (specialists.length !== specialistIds.length) {
        const notFoundIds = specialistIds.filter(
          (id) => !specialists.some((s) => s.id === id)
        );
        throw new NotFoundException(
          `Practitioner with IDs ${notFoundIds.join(', ')} not found`
        );
      }

      const newTurn = queryRunner.manager.create(Appointment, {
        date: createTurnDto.date,
        hour: createTurnDto.hour,
        observation: createTurnDto.observation,
        status: createTurnDto.status ?? AppointmentStatus.PENDING,
        patient,
        practitioners: specialists
      });
      //----------  Validacion de superposicion de Turnos ------------------------
      const existingTurns = createTurnDto.date
        ? await this.repository
            .createQueryBuilder('appointment')
            .leftJoin('appointment.practitioners', 'practitioner') // Unir con la tabla practitioners
            .select([
              'appointment.hour',
              'MAX(practitioner.consultationTime) AS consultationTime'
            ]) // Seleccionar hour y el máximo consultationTime
            .where(
              'appointment.date = :date AND appointment.deletedAt IS NULL',
              { date: createTurnDto.date }
            ) // Filtrar por fecha y no eliminados
            .groupBy('appointment.hour') // Agrupar por hour para obtener el máximo por cada hora
            .getRawMany() // Obtener los resultados en formato raw
        : null;
      const savedTurn = await queryRunner.manager.save(newTurn);
      const consultationTime = await this.maxConsultationTime(savedTurn.id);
      if (createTurnDto.date && createTurnDto.hour) {
        const validateTurn = await this.validateTurn(
          createTurnDto.hour,
          existingTurns,
          consultationTime
        );
        if (!validateTurn) {
          await queryRunner.release();
          await this.repository.delete(savedTurn.id);
          return {
            status: 400,
            message: 'El turno se superpone con otro turno existente.'
          };
        }
      }
      //-----------------------------------------------------------------------------------

      // After saving, populate the practitionerIds
      savedTurn.practitionerId = specialists.map((specialist) => specialist.id);

      if (
        createTurnDto.patientAppointment &&
        createTurnDto.patientAppointment.length > 0
      ) {
        const appointmentSlot = createTurnDto.patientAppointment.map(
          (hourData) => {
            return queryRunner.manager.create(PatientAppointment, {
              openingHour: hourData.openingHour,
              closeHour: hourData.closeHour,
              day: hourData.day,
              turn: savedTurn
            });
          }
        );

        await queryRunner.manager.save(PatientAppointment, appointmentSlot);
        savedTurn.patientAppointment = appointmentSlot;
        
       
        // create notification to doctor 
        for(const practitioner of savedTurn.practitioners){
          await this.notificationService.createNotification({
            userId: practitioner.id,
            read: false,
            title: "Nuevo Turno",
            text: `Se ha creado un nuevo turno para el ${savedTurn.date} a las ${savedTurn.hour}`
          },  queryRunner.manager)
        }
        
        }
      //}

      savedTurn.email3 = "";
      savedTurn.email24 = "";
      savedTurn.whats3 = "";
      savedTurn.whats24 = "";
      savedTurn.reprogrammed = false;

      await queryRunner.commitTransaction();

      // Schedule emails only after the transaction is committed
      if (patient.email) {
        const appointmentDate = new Date(`${createTurnDto.date}T${createTurnDto.hour}:00`);
        const now = new Date();
        const timeDifference = appointmentDate.getTime() - now.getTime(); // Difference in milliseconds

        if (timeDifference < 24 * 60 * 60 * 1000) {
          // If the appointment is less than 24 hours away, send a custom 3-hour reminder
          const threeHoursBefore = new Date(appointmentDate.getTime() - 3 * 60 * 60 * 1000);

          const new3 = await this.emailQueue.add(
            'sendEmail',
            {
              to: patient.email,
              subject: 'Reminder: Your appointment is soon',
              text: `Dear ${patient.name}, your appointment is scheduled for ${createTurnDto.date} at ${createTurnDto.hour}. Please be prepared.`,
            },
            { delay: threeHoursBefore.getTime() - Date.now() } // Delay in milliseconds
          );

          savedTurn.email3 = String(new3.id);
        } else {
          // Schedule 3-hour reminder
          const threeHoursBefore = new Date(appointmentDate.getTime() - 3 * 60 * 60 * 1000);
          const three = await this.emailQueue.add(
            'sendEmail',
            {
              to: patient.email,
              subject: 'Reminder: Your appointment is in 3 hours',
              text: `Dear ${patient.name}, this is a reminder that your appointment is scheduled for ${createTurnDto.date} at ${createTurnDto.hour}.`,
            },
            { delay: threeHoursBefore.getTime() - Date.now() } // Delay in milliseconds
          );

          savedTurn.email3 = String(three.id);

          // Schedule 24-hour reminder
          const twentyFourHoursBefore = new Date(appointmentDate.getTime() - 24 * 60 * 60 * 1000);
          const twentyFour = await this.emailQueue.add(
            'sendEmail',
            {
              to: patient.email,
              subject: 'Reminder: Your appointment is in 24 hours',
              text: `Dear ${patient.name}, this is a reminder that your appointment is scheduled for ${createTurnDto.date} at ${createTurnDto.hour}.`,
            },
            { delay: twentyFourHoursBefore.getTime() - Date.now() } // Delay in milliseconds
          );

          savedTurn.email24 = String(twentyFour.id);
        }
      }

      // Schedule WhatsApp messages only after the transaction is committed
      if (patient.phone) {
        const appointmentDate = new Date(`${createTurnDto.date}T${createTurnDto.hour}:00`);
        const now = new Date();
        const timeDifference = appointmentDate.getTime() - now.getTime(); // Difference in milliseconds

        if (timeDifference < 24 * 60 * 60 * 1000) {
          // If the appointment is less than 24 hours away, send only a 3-hour reminder
          const threeHoursBefore = new Date(appointmentDate.getTime() - 3 * 60 * 60 * 1000);

          const new3whats = await this.whatsappQueue.add(
            'sendMessage',
            {
              to: patient.phone,
              message: `Hola ${patient.name} te recordamos que tu turno es en 3 horas con el doctor Juan`,
            },
            { delay: threeHoursBefore.getTime() - Date.now() } // Delay in milliseconds
          );

          savedTurn.whats3 = String(new3whats.id);
        } else {
          // Schedule 3-hour reminder
          const threeHoursBefore = new Date(appointmentDate.getTime() - 3 * 60 * 60 * 1000);
          const threeWhats = await this.whatsappQueue.add(
            'sendMessage',
            {
              to: patient.phone,
              message: patient.name,
            },
            { delay: threeHoursBefore.getTime() - Date.now() } // Delay in milliseconds
          );

          savedTurn.whats3 = String(threeWhats.id);

          // Schedule 24-hour reminder
          const twentyFourHoursBefore = new Date(appointmentDate.getTime() - 24 * 60 * 60 * 1000);
          const twentyFourWhats = await this.whatsappQueue.add(
            'sendMessage',
            {
              to: patient.phone,
              message: patient.name,
            },
            { delay: twentyFourHoursBefore.getTime() - Date.now() } // Delay in milliseconds
          );

          savedTurn.whats24 = String(twentyFourWhats.id);
        }
      }

      

      // Save the updated `savedTurn` with job IDs
      await this.repository.save(savedTurn);

      return savedTurn;
    } catch (error) {
      await queryRunner.rollbackTransaction();

      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }

      throw ErrorManager.createSignatureError((error as Error).message);
    } finally {
      await queryRunner.release();
    }
  }

  async getOne(id: string): Promise<Appointment> {
    try {
      const turn = await this.repository.findOne({
        where: { id, deletedAt: null },
        relations: ['patient', 'practitioners']
      });

      if (!turn) {
        throw new NotFoundException(`Turn with ID ${id} not found`);
      }

      return turn;
    } catch (error) {
      throw ErrorManager.createSignatureError((error as Error).message);
    }
  }

  async getAll(
    page: number = 1,
    limit: number = 10
  ): Promise<{
    turns: Appointment[];
    total: number;
    page: number;
    limit: number;
    previousPage: number | null;
  }> {
    try {
      const [data, total] = await this.repository.findAndCount({
        where: { deletedAt: null },
        relations: ['patient', 'practitioners'],
        skip: (page - 1) * limit,
        take: limit
      });

      return {
        turns: data,
        total,
        page,
        limit,
        previousPage: page > 1 ? page - 1 : null
      };
    } catch (error) {
      throw ErrorManager.createSignatureError((error as Error).message);
    }
  }

  // Turnos de un especialista por ID
  async getTurnsBySpecialist(
    specialistId: string,
    page: number = 1,
    limit: number = 10
  ): Promise<{
    turns: Appointment[];
    total: number;
    page: number;
    limit: number;
    previousPage: number | null;
  }> {
    try {
      const [data, total] = await this.repository.findAndCount({
        where: {
          practitioners: { id: specialistId },
          status: In([
            AppointmentStatus.PENDING,
            AppointmentStatus.APPROVED,
            AppointmentStatus.NO_SHOW
          ]),
          deletedAt: null
        },
        relations: ['patient', 'practitioners'],
        skip: (page - 1) * limit,
        take: limit
      });

      if (!data.length) {
        throw new NotFoundException(
          `No turns found for specialist with ID ${specialistId}`
        );
      }

      return {
        turns: data,
        total,
        page,
        limit,
        previousPage: page > 1 ? page - 1 : null
      };
    } catch (error) {
      throw ErrorManager.createSignatureError((error as Error).message);
    }
  }

  
  async getTurnStatsForSpecialist(
    specialistId: string,
    period?: 'week' | 'month' | 'year'
  ): Promise <{
    completedStats: { count: number; percentage: number };
    canceledStats: { count: number; percentage: number };
    totalTurns: number;
    period?: { start: string; end: string };
  }> {
    try {
      const queryBuilder = this.repository
        .createQueryBuilder('appointment')
        .leftJoin('appointment.practitioners', 'practitioner')
        .select('appointment.status', 'status')
        .addSelect('COUNT(appointment.id)', 'count')
        .where('practitioner.id = :specialistId', { specialistId })
        .andWhere('appointment.status IN (:...statuses)', {
          statuses: [AppointmentStatus.COMPLETED, AppointmentStatus.CANCELLED]
        })
        .andWhere('appointment.deletedAt IS NULL');


        let startDate: string;
        let endDate: string;

        if(period) {
          const today = new Date();
          endDate = today.toISOString().split('T')[0]; // Fecha actual
      
          if(period === 'week') {
            const weekAgo = new Date();
            weekAgo.setDate(weekAgo.getDate() - 7);
            startDate = weekAgo.toISOString().split('T')[0];
          }else if (period === 'month') {
            const monthAgo = new Date();
            monthAgo.setMonth(monthAgo.getMonth() - 1);
            startDate = monthAgo.toISOString().split('T')[0];
          } else if (period === 'year') {
            const yearAgo = new Date();
            yearAgo.setFullYear(yearAgo.getFullYear() - 1);
            startDate = yearAgo.toISOString().split('T')[0];
          }


          const stats = await queryBuilder
            .groupBy('appointment.status')
            .getRawMany();

          if (stats.length === 0) {
            throw ErrorManager.createSignatureError(
              `No completed or cancelled turns found for specialist with ID ${specialistId}${period ? ` in the last ${period}` : ''}`
            );
          }

          let completedCount = 0;
          let cancelledCount = 0;

          stats.forEach(stat => {
            if (stat.status === AppointmentStatus.COMPLETED) {
              completedCount = parseInt(stat.count);
            } else if (stat.status === AppointmentStatus.CANCELLED) {
              cancelledCount = parseInt(stat.count);
            }
          });

          const totalTurns = completedCount + cancelledCount;

          const completedPercentage = totalTurns > 0 ? (completedCount / totalTurns) * 100 : 0;
          const canceledPercentage = totalTurns > 0 ? (cancelledCount / totalTurns) * 100 : 0;

          const result = {
            completedStats: {
              count: completedCount,
              percentage: completedPercentage
            },
            canceledStats: {
              count: cancelledCount,
              percentage: canceledPercentage
            },
            totalTurns
          };


        if (period) {
          return {
            ...result,
            period: {
              start: startDate,
              end: endDate
            }
          };
        }

    return result;
    } 
  }catch (error) {
    throw ErrorManager.createSignatureError((error as Error).message);
  }
}

  async getTurnsBySpecialistAll(
    specialistId: string,
    page: number = 1,
    limit: number = 10
  ): Promise<{
    turns: Appointment[];
    total: number;
    page: number;
    limit: number;
    previousPage: number | null;
  }> {
    try {
      const [data, total] = await this.repository.findAndCount({
        where: {
          practitioners: { id: specialistId },
          status: Not(AppointmentStatus.NO_SHOW),
          deletedAt: null
        },
        relations: ['patient', 'practitioners'],
        skip: (page - 1) * limit,
        take: limit
      });

      if (!data.length) {
        throw new NotFoundException(
          `No turns found for specialist with ID ${specialistId}`
        );
      }

      return {
        turns: data,
        total,
        page,
        limit,
        previousPage: page > 1 ? page - 1 : null
      };
    } catch (error) {
      throw ErrorManager.createSignatureError((error as Error).message);
    }
  }

  // Turnos de un paciente por ID
  async getTurnsByPatient(
    patientId: string,
    page: number = 1,
    limit: number = 10
  ): Promise<{
    turns: Appointment[];
    total: number;
    page: number;
    limit: number;
    previousPage: number | null;
  }> {
    try {
      const [data, total] = await this.repository.findAndCount({
        where: {
          patient: { id: patientId },
          status: In([
            AppointmentStatus.PENDING,
            AppointmentStatus.APPROVED,
            AppointmentStatus.NO_SHOW
          ]),
          deletedAt: null
        },
        relations: ['patient', 'practitioners'],
        skip: (page - 1) * limit,
        take: limit
      });

      if (!data.length) {
        throw new NotFoundException(
          `No turns found for patient with ID ${patientId}`
        );
      }

      return {
        turns: data,
        total,
        page,
        limit,
        previousPage: page > 1 ? page - 1 : null,
        
      };
    } catch (error) {
      throw ErrorManager.createSignatureError((error as Error).message);
    }
  }

  async getTurnsByPatientAll(
    patientId: string,
    page: number = 1,
    limit: number = 10
  ): Promise<{
    turns: Appointment[];
    total: number;
    page: number;
    limit: number;
    previousPage: number | null;
  }> {
    try {
      const [data, total] = await this.repository.findAndCount({
        where: {
          patient: { id: patientId },
          status: Not(AppointmentStatus.NO_SHOW),
          deletedAt: null
        },
        relations: ['patient', 'practitioners'],
        skip: (page - 1) * limit,
        take: limit
      });

      if (!data.length) {
        throw new NotFoundException(
          `No turns found for patient with ID ${patientId}`
        );
      }

      return {
        turns: data,
        total,
        page,
        limit,
        previousPage: page > 1 ? page - 1 : null
      };
    } catch (error) {
      throw ErrorManager.createSignatureError((error as Error).message);
    }
  }

  //Obtener turnos completados por el ID del paciente (historial).
  async getCompletedTurnsByPatient(
    patientId: string,
    page: number = 1,
    limit: number = 10
  ): Promise<{
    turns: Appointment[];
    total: number;
    page: number;
    limit: number;
    previousPage: number | null;
  }> {
    try {
      const [data, total] = await this.repository.findAndCount({
        where: {
          patient: { id: patientId },
          status: AppointmentStatus.COMPLETED,
          deletedAt: null
        },
        relations: ['patient', 'practitioners'],
        skip: (page - 1) * limit,
        take: limit
      });

      if (!data.length) {
        throw new NotFoundException(
          `No completed turns found for patient ID ${patientId}`
        );
      }

      return {
        total,
        page,
        limit,
        previousPage: page > 1 ? page - 1 : null,
        turns: data
      };
    } catch (error) {
      throw ErrorManager.createSignatureError((error as Error).message);
    }
  }

  //Soft delete para eliminar un turno.
  async removeTurn(
    id: string,
    reprog: boolean
  ): Promise<{ message: string }> {
    try {
      const turn = await this.repository.findOne({
        where: { id, deletedAt: null }
      });

      if (!turn) {
        throw new NotFoundException(`Turn with ID ${id} not found`);
      }

      // this.cancelQueue(turn.id);

      const deletedTurn = await this.repository.softRemove(turn);

      if(reprog === true) {
        deletedTurn.reprogrammed = true;
        await this.repository.save(deletedTurn);
      }

      const {id:NewId, date, hour, ...rest} = deletedTurn;

      return {
        message: `Turn with ID: ${NewId} for ${date} at ${hour} deleted successfully`,
      };
    } catch (error) {
      throw ErrorManager.createSignatureError((error as Error).message);
    }
  }

  //Recover para restaurar un turno eliminado.
  async recoverTurn(id: string): Promise<Appointment> {
    try {
      const turn = await this.repository.findOne({
        withDeleted: true,
        where: { id }
      });

      if (!turn) {
        throw new NotFoundException(`Turn with ID ${id} not found`);
      }

      await this.repository.recover(turn);
      return turn;
    } catch (error) {
      throw ErrorManager.createSignatureError((error as Error).message);
    }
  }

  //Actualizar un turno.
  // async updateTurn(id: string, updateTurnDto: UpdateAppointmentDto): Promise<Appointment> {
  //   try {
  //     const turn = await this.repository.findOne({ where: { id, deletedAt: null } });

  //     if (!turn) {
  //       throw new NotFoundException(`Turn with ID ${id} not found`);
  //     }

  //     //actualizar el turn con los datos de updateTurnDto
  //     Object.assign(turn, updateTurnDto);

  //     // guardar los datos actualizados.
  //     const updatedTurn = await this.repository.save(turn);

  //      //Actualiza solo el estado usando createQueryBuilder
  //   //   await this.repository
  //   //   .createQueryBuilder()
  //   //   .update(Appointment)
  //   //   .set({ status: updateTurnDto.status })
  //   //   .where('id = :id', { id })
  //   //   .execute();

  //   //  const updatedTurn = await this.repository.findOne({ where: { id, deletedAt: null } })
      
  //     const loggedUser =  await this.authService.getUserById(updateTurnDto.userId)

  //     if(updateTurnDto.status == AppointmentStatus.CANCELLED){
  //       //check user rol to send notification
  //       if(loggedUser.role === Role.SPECIALIST){
  //         //create notification to user segun corresponda
  //         await this.notificationService.createNotificaction({
  //           userId: turn.patient.id,
  //           read: false,
  //           title: "Cancelacion de Turno",
  //           text: `Se ha cancelado un nuevo turno para el ${updateTurnDto.date} a las ${updateTurnDto.hour}`
  //         })
  //       }else{  
  //         //notification to practitioner
  //         if(Array.isArray(updateTurnDto.practitionerIds)){
  //           for(const practitioner of updateTurnDto.practitionerIds){
  //             await this.notificationService.createNotificaction({
  //               userId: practitioner.id,
  //               read: false,
  //               title: "Cancelacion de Turno",
  //               text: `Se ha cancelado un nuevo turno   para el ${updateTurnDto.date} a las ${updateTurnDto.hour}`
  //             })
  //           }
  //         }else{
  //           await this.notificationService.createNotificaction({
  //             userId: updateTurnDto.practitionerIds,
  //             read: false,
  //             title: "Cancelacion de Turno",
  //             text: `Se ha cancelado un nuevo turno para el ${updateTurnDto.date} a las ${updateTurnDto.hour}`
  //           })
  //         }
  //       }
  //     }
  //     return updatedTurn
  //   } catch (error) {
  //     throw ErrorManager.createSignatureError((error as Error).message);
  //   }
  // }
  async updateTurn(
    id: string,
    updateTurnDto: UpdateAppointmentDto,
  ): Promise<Appointment> {
    // Verifica primero si el turno existe
    const turn = await this.repository.findOne({
      where: { id, deletedAt: null },
      relations: ['patient', 'practitioners'], // Asegúrate de cargar relaciones necesarias
    });
  
    if (!turn) {
      throw new NotFoundException(`Turn with ID ${id} not found`);
    }
  
    // Actualiza solo los campos permitidos (evita sobreescribir relaciones directamente)
    const allowedFields = {
      // date: updateTurnDto.date,
      // hour: updateTurnDto.hour,
      // observation: updateTurnDto.observation,
      status: updateTurnDto.status,
    };
  
    Object.assign(turn, allowedFields);
  
   
  
    try {
      // Guarda los cambios
      const updatedTurn = await this.repository.save(turn);
  
      // Notificaciones (si es necesario)
      this.logger.log('getting user that cancel by id: ', updateTurnDto.userId)
      const loggedUser = await this.authService.getUserById(updateTurnDto.userId);
      this.logger.log(loggedUser.role)
      if (updateTurnDto.status === AppointmentStatus.CANCELLED) {
        if (loggedUser.role === Role.SPECIALIST) {
          await this.notificationService.createNotification({
            patientId: turn.patient.id,
            read: false,
            title: "Cancelación de Turno",
            text: `Se ha cancelado el turno para el ${turn.date} a las ${turn.hour}`,
          });
        } else {
          for (const practitioner of turn.practitioners) {
            this.logger.log('practitioner id: ', practitioner.id), 
            await this.notificationService.createNotification({
              practitionerId: practitioner.id,
              read: false,
              title: "Cancelación de Turno",
              text: `Se ha cancelado el turno para el ${turn.date} a las ${turn.hour}`,
            });
          }
        }
      }
  
      return updatedTurn;
    } catch (error) {
      throw ErrorManager.createSignatureError((error as Error).message);
    }
  }

  // Verificar superposición de turnos
  async checkOverlapAndUpdateTurn(
    id: string,
    updateTurnDto: UpdateAppointmentDto
  ): Promise<SerializerAppointmentDto> {
    try {
      const { date, hour } = updateTurnDto;

      // Validar que la fecha y hora estén presentes
      if (!date || !hour) {
        throw new BadRequestException('Date and hour are required');
      }

      // Validar el formato de la fecha (YYYY-MM-DD)
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(date)) {
        throw new BadRequestException('Invalid date format. Use YYYY-MM-DD');
      }

      // Validar el formato de la hora (HH:MM)
      const hourRegex = /^\d{2}:\d{2}$/;
      if (!hourRegex.test(hour)) {
        throw new BadRequestException('Invalid hour format. Use HH:MM');
      }

      // Obtener el turno existente
      const existingTurn = await this.repository.findOne({
        where: { id, deletedAt: null },
        relations: ['practitioners']
      });

      if (!existingTurn) {
        throw new NotFoundException(`Turn with ID ${id} not found`);
      }

      // Verificar si hay superposición con otros turnos
      const overlappingTurn = await this.repository
        .createQueryBuilder('appointment')
        .where('appointment.date = :date', { date })
        .andWhere('appointment.hour = :hour', { hour })
        .andWhere('appointment.id != :id', { id }) // Excluir el turno actual
        .andWhere('appointment.deletedAt IS NULL')
        .getOne();

      if (overlappingTurn) {
        throw new BadRequestException(
          'The provided date and hour overlap with an existing turn'
        );
      }

      // Actualizar el turno si no hay superposición
      Object.assign(existingTurn, updateTurnDto);
      const updatedTurn = await this.repository.save(existingTurn);

      //create notification to user segun corresponda
      //check user rol to send notification
      await this.notificationService.createNotification({
        userId: updatedTurn.patient.id,
        read: false,
        title: "Cancelacion de Turno",
        text: `Se ha cancelado un nuevo turno para el ${updateTurnDto.date} a las ${updateTurnDto.hour}`
      })

      //notification to practitioner
      for(const practitioner of updateTurnDto.practitionerIds){
        await this.notificationService.createNotification({
          userId: practitioner.id,
          read: false,
          title: "Nuevo Turno",
          text: `Se ha creado un nuevo turno para el ${updateTurnDto.date} a las ${updateTurnDto.hour}`
        })
      }

      return plainToClass(SerializerAppointmentDto, updatedTurn, {
        excludeExtraneousValues: true
      });
    } catch (error) {
      throw ErrorManager.createSignatureError((error as Error).message);
    }
  }

  async validateTurn(
    hour: string,
    existingTurns: TimeDTO[],
    consultationTime: string
  ): Promise<boolean> {
    try {
      // Si no hay turnos existentes, se puede crear el nuevo turno
      if (existingTurns.length === 0 || null) {
        return true;
      }
      // Convertir la hora del nuevo turno a minutos desde la medianoche
      const newTurnTime = this.convertTimeToSeconds(hour);
      const newTurnTimeConsultation =
        this.convertTimeToSeconds(consultationTime);
      const newTurnEnd = newTurnTime + newTurnTimeConsultation;
      // Validar cada turno existente
      for (const turn of existingTurns) {
        const existingTurnTime = this.convertTimeToSeconds(
          turn.appointment_hour
        );
        const longestConsultationTime = this.convertTimeToSeconds(
          turn.consultationtime ? turn.consultationtime : '00:30:00'
        );
        const existingTurnEnd = existingTurnTime + longestConsultationTime;
        // Verificar si hay superposición
        if (
          (newTurnTime >= existingTurnTime && newTurnTime < existingTurnEnd) || // El nuevo turno comienza dentro del turno existente
          (newTurnEnd > existingTurnTime && newTurnEnd <= existingTurnEnd) || // El nuevo turno termina dentro del turno existente
          (newTurnTime <= existingTurnTime && newTurnEnd >= existingTurnEnd) // El nuevo turno cubre completamente el turno existente
        ) {
          return false;
        }
      }
      return true;
    } catch (error) {
      throw ErrorManager.createSignatureError((error as Error).message);
    }
  }

  private convertTimeToSeconds(time: string): number {
    if (time.split(':').length === 2) {
      time += ':00';
    }
    const [hours, minutes, seconds] = time.split(':').map(Number);
    return hours * 3600 + minutes * 60 + seconds;
  }
  async maxConsultationTime(id: string) {
    const data = await this.repository
      .createQueryBuilder('appointment')
      .leftJoin('appointment.practitioners', 'practitioner')
      .select('MAX(practitioner.consultationTime)', 'maxConsultationTime')
      .where('appointment.id = :id', { id: id })
      .getRawOne();

    return data.maxConsultationTime
      ? String(data.maxConsultationTime)
      : '00:30:00';
  }

  // async cancelQueue(id: string) {

  //   const appointment = await this.repository.findOne({
  //     where: { id, deletedAt: null },
  //   });

  //   if (!appointment) {
  //     throw new NotFoundException(`Turn with ID ${id} not found`);
  //   }

  //   // Cancelar el trabajo de correo electrónico
  //   if(appointment.email3) {
  //     const job = await this.emailQueue.getJob(appointment.email3);
  //     if (job) {
  //       await job.remove();
  //     }
  //   }

  //   if(appointment.email24) {
  //     const job = await this.emailQueue.getJob(appointment.email24);
  //     if (job) {
  //       await job.remove();
  //     }
  //   }
  //   // Cancelar el trabajo de WhatsApp
  //   if(appointment.whats3) {
  //     const job = await this.whatsappQueue.getJob(appointment.whats3);
  //     if (job) {
  //       await job.remove();
  //     }
  //   }

  //   if(appointment.whats24) {
  //     const job = await this.whatsappQueue.getJob(appointment.whats24);
  //     if (job) {
  //       await job.remove();
  //     }
  //   }

  //   // Actualizar el turno para eliminar los IDs de los trabajos
  //   appointment.email3 = null;
  //   appointment.email24 = null;
  //   appointment.whats3 = null;
  //   appointment.whats24 = null;
  //   await this.repository.save(appointment);
  // }

  async reprogramTurn( id: string ) : Promise<Appointment> {
    const repro = true;
    const turn = await this.repository.findOne({
      where: { id, deletedAt: null },
    });

    if (!turn) {
      throw new NotFoundException(`Turn with ID ${id} not found`);
    }

    const x = this.removeTurn(turn.id, repro);

    return turn;
  }
}

//mergeado con dev. para actualizar PR