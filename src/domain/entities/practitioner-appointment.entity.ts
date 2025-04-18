import { Base } from '../../common/bases/base.entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { Day } from '../enums';
import { ApiProperty } from '@nestjs/swagger';
import { Practitioner, Location } from '.';


//Esta entidad antes de denominaba practitionerAppointment
@Entity('practitioner_appointment')
export class PractitionerAppointment extends Base {
  @Column({
    type: 'time',
    name: 'start_hour',
    nullable: true
  })
  startHour: string;

  @Column({
    type: 'time',
    name: 'end_hour',
    nullable: true
  })
  endHour: string;

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

  @ManyToOne(
    () => Practitioner,
    (practitioner) => practitioner.practitionerAppointment
  )
  @JoinColumn({ name: 'practitioner_id' })
  practitioner: Practitioner;

  @ManyToOne(
    () => Location,
    (location) => location.practitionerAppointments
  )
  @JoinColumn({ name: 'location_id' })
  location: Location;

}
