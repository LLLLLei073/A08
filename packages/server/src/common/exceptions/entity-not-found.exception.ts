import { NotFoundException } from '@nestjs/common';

export class EntityNotFoundException extends NotFoundException {
  constructor(entity: string, id?: number | string) {
    super(id ? `${entity} ${id} 不存在` : `${entity}不存在`);
  }
}
