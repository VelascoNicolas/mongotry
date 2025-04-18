import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Branch, Location } from '../../domain/entities';
import { LocationController } from './location.controller';
import { LocationService } from './location.service';

@Module({
  imports: [TypeOrmModule.forFeature([Location, Branch])],
  controllers: [LocationController],
  providers: [LocationService]
})
export class LocationModule {}
