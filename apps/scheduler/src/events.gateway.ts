import { MessageBody, OnGatewayConnection, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { OnModuleInit } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { Redis } from 'ioredis';
import { AppService } from './app.service';
import { type UamVehicleStatus } from '@uam/types';

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
  /** 착륙 완료된 기체 ID Set (중복 승인 방지 & 버퍼 재진입 차단) */
  private landedUamIds = new Set<string>();

  /**
   * [지도용] MQTT에서 수신한 최신 기체 상태 버퍼
   * - key: uamId, value: 최신 UamVehicleStatus
   * - Map의 삽입 순서를 이용해 "가장 최근에 메시지를 보낸 50대"를 유지
   */
  private rawBuffer = new Map<string, UamVehicleStatus>();
  private readonly MAP_BUFFER_LIMIT = 50;

  constructor(private readonly appService: AppService) { }

  /** 새 클라이언트 접속 시 현재 착륙 목록 즉시 전송 */
  handleConnection(client: Socket) {
    client.emit('landed:update', this.landedUams);
  }

  async onModuleInit() {
    // ── 이전 실행의 stale ZSET 제거 ──────────────────────────────────────────
    // ZSET 멤버는 TTL이 없어 영구 지속되지만, detail 키(EX 60s)는 만료됩니다.
    // 재시작 시 이전 ID들이 높은 점수로 남아 새 기체를 가리는 문제 방지.
    await this.redis.del('uam:landing:queue');
    console.log('[Gateway] Redis landing queue cleared on startup.');

    // ── [Stream A] 지도용: 500ms마다 rawBuffer에서 최신 50대 emit ──────────────
    setInterval(() => {
      if (this.rawBuffer.size === 0) return;
      const mapPayload = Array.from(this.rawBuffer.values());
      this.server.emit('map:update', mapPayload);
    }, 500);

    // ── [Stream B] 착륙 큐용: 1초마다 Redis에서 우선순위 top-10 emit ───────────
    setInterval(async () => {
      // ZREVRANGE: 점수(우선순위)가 높은 순서대로 상위 10대 조회
      const topUams = await this.redis.zrevrange('uam:landing:queue', 0, 9);

      const details = await Promise.all(
        topUams.map(async (id) => {
          const data = await this.redis.get(`uam:detail:${id}`);
          return data ? JSON.parse(data) : null;
        })
      );

      this.server.emit('uam:update', details.filter(d => d !== null));
    }, 1000);
  }

  /**
   * [AppController → Gateway] MQTT 수신 즉시 호출
   * rawBuffer를 갱신하고 최신 50대 상한을 유지합니다.
   *
   * 삽입 순서 갱신 방식:
   *   Map.set()은 기존 키의 순서를 바꾸지 않으므로
   *   delete → set 순서로 호출해 "가장 최근" 위치에 배치합니다.
   */
  updateMapBuffer(data: UamVehicleStatus): void {
    // 착륙 완료된 기체는 rawBuffer에 재진입시키지 않음
    if (this.landedUamIds.has(data.uamId)) return;

    // 기존 항목 삭제 후 재삽입 → Map 꼬리(최신)로 이동
    this.rawBuffer.delete(data.uamId);
    this.rawBuffer.set(data.uamId, data);

    // 한도 초과 시 가장 오래된 항목(Map 머리) 제거
    if (this.rawBuffer.size > this.MAP_BUFFER_LIMIT) {
      const oldestKey = this.rawBuffer.keys().next().value!;
      this.rawBuffer.delete(oldestKey);
    }
  }

  /** AppController에서 Redis ZSET 저장 전 착륙 완료 기체인지 확인용 */
  isAlreadyLanded(uamId: string): boolean {
    return this.landedUamIds.has(uamId);
  }

  /**
   * [L3] 대시보드로부터 착륙 승인 명령 수신
   * @SubscribeMessage('landing:approve')
   */
  @SubscribeMessage('landing:approve')
  async handleLandingApprove(@MessageBody() data: { uamId: string }) {
    // ── 중복 승인 방지 ──────────────────────────────────────────────────────
    if (this.landedUamIds.has(data.uamId)) {
      console.log(`[Command] Duplicate approve ignored for: ${data.uamId}`);
      return { status: 'already_landed', uamId: data.uamId };
    }

    console.log(`[Command] Dashboard approved landing for: ${data.uamId}`);

    // 착륙 완료 Set에 즉시 등록 (이후 들어오는 MQTT/Redis 업데이트 차단)
    this.landedUamIds.add(data.uamId);

    // AppService를 통해 MQTT로 시뮬레이터에 명령 전송
    await this.appService.sendLandingCommand(data.uamId);

    // ── Redis에서 해당 기체 제거 (우선순위 큐 & 상세 정보) ──────────────────
    await this.redis.zrem('uam:landing:queue', data.uamId);
    await this.redis.del(`uam:detail:${data.uamId}`);
    // rawBuffer에서도 즉시 제거
    this.rawBuffer.delete(data.uamId);

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
