import { Base } from '../../common/bases/base.entity';
import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Day } from '../enums';
import { ApiProperty } from '@nestjs/swagger';
import { Branch, Location } from '.';

//Esta entidad antes se denominaba attentionHour
@Entity('appointment_slot ')
export class AppointmentSlot  extends Base {
  @Column({
    type: 'time',
    name: 'opening_hour',
    nullable: true
  })
  openingHour: string;

  @Column({
    type: 'time',
    name: 'close_hour',
    nullable: true
  })
  closeHour: string;

  @Column({
    type: 'enum',
    enum: Day
  })
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

  @ManyToOne(() => Branch, (branch) => branch.appointmentSlot)
  @JoinColumn({ name: 'branch_id' })
  branch: Branch;

  @ManyToOne(
    () => Location,
    (location) => location.appointmentSlot
  )
  @JoinColumn({ name: 'practitioner_id' })
  location: Location;
}
