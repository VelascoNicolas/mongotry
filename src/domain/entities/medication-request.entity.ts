import { Base } from '../../common/bases/base.entity';
import {
    Column,
    Entity,
    JoinColumn,
    JoinTable,
    ManyToMany,
    ManyToOne,
} from 'typeorm';
import {
    Appointment,
    Medication,
    Patient,
    Practitioner,
} from '.';

@Entity('medication_request')
export class MedicationRequest extends Base {

    @Column({
        type: 'varchar',
        nullable: false
    })
    indications: string;
    @Column({
        type: 'varchar',
        nullable: false
    })
    diagnosis: string; //No esta en Figma

    @Column({
        type: 'boolean',
        nullable: false,
        name: 'is_valid_signature',
        default: false
    })
    isValidSignature: boolean; //Que es?

    @ManyToOne(() => Practitioner)
    @JoinColumn({ name: 'practitioner_id' })
    practitioner: Practitioner;

    @ManyToOne(() => Patient)
    @JoinColumn({ name: 'patient_id' })
    patient: Patient; //datos del paciente

    @ManyToMany(() => Medication, (medicine) => medicine.id)
    @JoinTable()
    medicines: Medication[];

    //Nuevos atributos de figma
    @Column({
        type: 'boolean',
        nullable:true
    })
    prolongedTreatment: boolean;

    @Column({
        type: 'boolean',
        nullable:true
    })
    hiv: boolean;

    @Column({
        type: 'varchar',
        nullable:true
    })
    genericName: string;

    @Column({
        type: 'varchar',
        nullable:true
    })
    medicinePresentation: string;

    @Column({
        type: 'varchar',
        nullable:true
    })
    medicinePharmaceuticalForm: string;

    @Column({
        type: 'int',
        nullable:true
    })
    medicineQuantity: number;

    @ManyToOne(() => Appointment, (appointment) => appointment.medicationRequests)
    @JoinColumn({ name: 'appointment_id' })
    appointment: Appointment;
}
