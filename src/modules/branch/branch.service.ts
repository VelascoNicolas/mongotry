import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { BaseService } from '../../common/bases/base.service';
import { ErrorManager } from '../../common/exceptions/error.manager';
import { CreateBranchDto, UpdateBranchDto } from '../../domain/dtos';
import { Branch } from '../../domain/entities';
import { EntityManager, Repository } from 'typeorm';

@Injectable()
export class BranchService extends BaseService<
  Branch,
  CreateBranchDto,
  UpdateBranchDto
> {
  constructor(
    @InjectRepository(Branch)
    protected repository: Repository<Branch>,
  ) {
    super(repository);
  }

  async getOne(id: string): Promise<Branch> {
    try {
      const branch = await this.repository.findOne({
        where: { id },
        relations: [
          'organization', 
          'address', 
          'appointmentSlot', 
          'locations', 
          'locations.address', 
          'locations.practitioners', 
          'locations.appointmentSlot'
        ],
      });
  
      if (!branch) {
        throw new NotFoundException(`Branch with ID ${id} not found`);
      }
  
      return branch;
    } catch (error) {
      throw ErrorManager.createSignatureError((error as Error).message);
    }
  }

  override async remove(id: string): Promise<string> {
    try {
      const entity = await this.findOne(id);
      return this.repository.manager.transaction(
        async (manager: EntityManager) => {
          await manager.remove(Branch, entity);
          // await this.authService.removeWithManager(entity.id, manager);
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
          // await this.authService.softRemoveWithManager(entity.id, manager);
          await manager.softRemove(entity);
          return `Entity with id ${id} soft deleted`;
        }
      );
    } catch (error) {
      throw ErrorManager.createSignatureError((error as Error).message);
    }
  }

  override async restore(id: string): Promise<Branch> {
    try {
      // Busca la entidad por su id donde  el campo deletedAt sea diferente a null
      const entity = await this.repository.findOne({
        where: { id },
        withDeleted: true
      });

      // Si 'entity' es null, devuelve una excepción como que la entidad no existe o no ha sido eliminada anteriormente
      if (!entity) {
        throw new ErrorManager(`Entity with id ${id} not found`, 404);
      }

      return this.repository.manager.transaction(
        async (manager: EntityManager) => {
          // await this.authService.restoreWithManager(entity.id, manager);
          return await manager.recover(entity);
        }
      );
    } catch (error) {
      throw ErrorManager.createSignatureError((error as Error).message);
    }
  }
}
