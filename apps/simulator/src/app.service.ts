import { Injectable, Inject, OnModuleInit } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { UamVehicleStatus } from '@uam/types';

@Injectable()
export class AppService implements OnModuleInit {
  private activeSimulations: Map<string, NodeJS.Timeout> = new Map();

  constructor(@Inject('UAM_SERVICE') private client: ClientProxy) { }

  onModuleInit() {
    this.startSimulation();
  }

  startSimulation() {
    const uamId = `UAM-${Math.floor(Math.random() * 1000)}`;

    // 1초마다 반복 실행
    const intervalId = setInterval(() => {
      const status: UamVehicleStatus = {
        uamId,
        latitude: 37.5665 + Math.random() * 0.01,
        longitude: 126.9780 + Math.random() * 0.01,
        altitude: 500 + Math.random() * 100,
        batteryPercent: Math.max(0, 100 - (Date.now() % 100)), // 시간에 따라 줄어듦
        isEmergency: Math.random() > 0.95, // 5% 확률로 비상 상황
        timestamp: Date.now(),
      };

      console.log(`[Sending] ${uamId} - Battery: ${status.batteryPercent.toFixed(1)}%`);

      // 'uam/status'라는 토픽으로 데이터 전송
      this.client.emit('uam/status', status);
    }, 1000);

    this.activeSimulations.set(uamId, intervalId);
  }

  stopSimulation(uamId: string) {
    const intervalId = this.activeSimulations.get(uamId);
    if (intervalId) {
      clearInterval(intervalId);
      this.activeSimulations.delete(uamId);
      console.log(`[Simulator] Vehicle ${uamId} has successfully landed and stopped broadcasting.`);
    } else {
      console.log(`[Simulator] Warning: Vehicle ${uamId} not found or already stopped.`);
    }
  }
}