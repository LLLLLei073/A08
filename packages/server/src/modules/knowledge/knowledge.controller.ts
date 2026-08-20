import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import {
  CreateKnowledgeBindingDto,
  CreateKnowledgeEdgeDto,
  CreateKnowledgeNodeDto,
  KnowledgeResourceType,
  Role,
  UpdateKnowledgeNodeDto,
} from '@ai-party-school/shared';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { KnowledgeService } from './knowledge.service';

@Controller('knowledge')
@UseGuards(JwtAuthGuard)
export class KnowledgeController {
  constructor(private readonly knowledge: KnowledgeService) {}

  @Get('graph')
  @Roles(Role.ADMIN, Role.SECRETARY)
  getGraph() {
    return this.knowledge.getGraph();
  }

  @Post('nodes')
  @Roles(Role.ADMIN)
  createNode(@Body() dto: CreateKnowledgeNodeDto) {
    return this.knowledge.createNode(dto);
  }

  @Patch('nodes/:id')
  @Roles(Role.ADMIN)
  updateNode(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateKnowledgeNodeDto) {
    return this.knowledge.updateNode(id, dto);
  }

  @Delete('nodes/:id')
  @Roles(Role.ADMIN)
  removeNode(@Param('id', ParseIntPipe) id: number) {
    return this.knowledge.removeNode(id);
  }

  @Post('edges')
  @Roles(Role.ADMIN)
  createEdge(@Body() dto: CreateKnowledgeEdgeDto) {
    return this.knowledge.createEdge(dto);
  }

  @Delete('edges/:id')
  @Roles(Role.ADMIN)
  removeEdge(@Param('id', ParseIntPipe) id: number) {
    return this.knowledge.removeEdge(id);
  }

  @Post('bindings')
  @Roles(Role.ADMIN)
  createBinding(@Body() dto: CreateKnowledgeBindingDto) {
    return this.knowledge.createBinding(dto);
  }

  @Delete('bindings/:resourceType/:resourceId/:nodeId')
  @Roles(Role.ADMIN)
  removeBinding(
    @Param('resourceType') resourceType: KnowledgeResourceType,
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Param('nodeId', ParseIntPipe) nodeId: number,
  ) {
    return this.knowledge.removeBinding(resourceType, resourceId, nodeId);
  }
}
