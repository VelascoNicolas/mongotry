import { Module } from '@nestjs/common';
import { databaseProviders } from './config/database.providers';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ModulesModule } from './modules/modules.module';
import { APP_FILTER } from '@nestjs/core';
import { HttpExceptionFilter } from './common/exceptions/http-exception.filter';
import { PatientPractitionerFavoriteModule } from './modules/patient_practitioner_favorite/patient-practitioner-favorite.module';
import { PdfModule } from './modules/pdf/pdf.module';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bull';
import { envConfig } from './config/envs';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { MailModule, WhatsAppModule } from './modules';

@Module({
  imports: [
    TypeOrmModule.forRoot(databaseProviders),
    EventEmitterModule.forRoot(),
    BullModule.forRoot({
      redis: {
        username: envConfig.REDIS_USERNAME,
        password: envConfig.REDIS_PASSWORD,
        host: envConfig.REDIS_HOST, 
        port: envConfig.REDIS_PORT 
      }
    }),
    BullModule.registerQueue(
      { name: 'email' },
      { name: 'whatsapp' } 
    ),
    ConfigModule.forRoot(),
    ModulesModule,
    PatientPractitionerFavoriteModule,
    MailModule,
    WhatsAppModule,
    PdfModule
  ],
  controllers: [],
  providers: [
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter
    }
  ]
})
export class AppModule {}
