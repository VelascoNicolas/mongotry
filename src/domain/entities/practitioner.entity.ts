import {
  Column,
  Entity,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
  OneToMany,
  OneToOne,
} from 'typeorm';
import {
  ProfessionalDegree,
  Location,
  PractitionerRole,
  PractitionerAppointment
} from '.';
import { User } from './user.entity';
import { PatientPractitionerFavorite } from './patient-practitioner-favorite.entity';
import { IsOptional } from 'class-validator';

@Entity('practitioner')
export class Practitioner extends User {
  @Column({
    type: 'varchar',
    nullable: true,
  })
  license: string;

  @Column({
    type: 'float',
    default: 0.0,
  })
  rating: number = 0;

  @Column({
    type: 'boolean',
    nullable: true,
    name: 'home_service',
    default: false,
  })
  homeService: boolean;

  @Column({
    type: 'boolean',
    nullable: true,
    name: 'accepted_social_works',
    default: false,
  })
  acceptedSocialWorks: boolean;

  @ManyToOne(() => ProfessionalDegree, {
    eager: true,
  })
  @JoinColumn({ name: 'professionalDegree_id' })
  professionalDegree: ProfessionalDegree;

  @ManyToMany(() => PractitionerRole, (practitioner) => practitioner.practitioners, {
    eager: true,
    nullable: true,
  })
  @JoinTable({
    name: 'practitioners_practitionerRole',
    joinColumn: {
      name: 'practitioner_id',
      referencedColumnName: 'id',
    },
    inverseJoinColumn: {
      name: 'practitionerRole_id',
      referencedColumnName: 'id',
    },
  })
  practitionerRole: PractitionerRole[];

  @OneToMany(
    () => PractitionerAppointment,
    (practitionerAppointment) => practitionerAppointment.practitioner,
    {
      eager: true,
      cascade: true,
      nullable: true,
      orphanedRowAction: 'soft-delete',
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    },
  )
  practitionerAppointment: PractitionerAppointment[];

  @Column({
    type: 'time',
    nullable: true,
  })
  consultationTime: string;

  @OneToOne(() => PatientPractitionerFavorite, (favorite) => favorite.practitioner)
  favorite: PatientPractitionerFavorite;

}
