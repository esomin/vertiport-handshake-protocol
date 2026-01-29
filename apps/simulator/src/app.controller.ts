import { Controller, Get } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) { }

  @Get()
  getHello(): void {
    // return this.appService.getHello();
  }

  @MessagePattern('uam/command/land')
  handleLandingCommand(@Payload() data: { uamId: string; command: string; timestamp: string }) {
    console.log(`[Simulator/Controller] Received landing command for:`, data.uamId);
    this.appService.stopSimulation(data.uamId);
  }
}
