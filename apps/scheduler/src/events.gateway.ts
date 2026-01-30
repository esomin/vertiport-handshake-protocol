import { MessageBody, OnGatewayConnection, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { OnModuleInit } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { Redis } from 'ioredis';
import { AppService } from './app.service';

interface LandedRecord {
  uamId: string;
  landedAt: string; // ISO 타임스탬프
}

@WebSocketGateway({ cors: { origin: '*' } })
export class EventsGateway implements OnModuleInit, OnGatewayConnection {
  @WebSocketServer() server: Server;
  private redis = new Redis();

  /** 착륙 완료된 기체 누적 목록 (서버 재시작 전까지 유지) */
  private landedUams: LandedRecord[] = [];

  constructor(private readonly appService: AppService) { }

  /** 새 클라이언트 접속 시 현재 착륙 목록 즉시 전송 */
  handleConnection(client: Socket) {
    client.emit('landed:update', this.landedUams);
  }

  onModuleInit() {
    // 1초마다 Redis에서 상위 10대의 기체 정보를 가져와 브라우저로 전송
    setInterval(async () => {
      // ZREVRANGE: 점수(우선순위)가 높은 순서대로 가져옴 (상위 10대)
      const topUams = await this.redis.zrevrange('uam:landing:queue', 0, 9);

      const details = await Promise.all(
        topUams.map(async (id) => {
          const data = await this.redis.get(`uam:detail:${id}`);
          return data ? JSON.parse(data) : null;
        })
      );

      this.server.emit('uam:update', details.filter(d => d !== null));
    }, 1000); // Throttling: 초당 수천 개 데이터 중 10개만 골라 전송
  }

  /**
   * [L3] 대시보드로부터 착륙 승인 명령 수신
   * @SubscribeMessage('landing:approve')
   */
  @SubscribeMessage('landing:approve')
  async handleLandingApprove(@MessageBody() data: { uamId: string }) {
    console.log(`[Command] Dashboard approved landing for: ${data.uamId}`);

    // AppService를 통해 MQTT로 시뮬레이터에 명령 전송
    await this.appService.sendLandingCommand(data.uamId);

    // 착륙 완료 기록 추가
    const record: LandedRecord = {
      uamId: data.uamId,
      landedAt: new Date().toISOString(),
    };
    this.landedUams.unshift(record); // 최신이 위로

    // 전체 클라이언트에 착륙 목록 브로드캐스트
    this.server.emit('landed:update', this.landedUams);

    // 처리 결과 응답 (Ack)
    return { status: 'sent', uamId: data.uamId };
  }
}
