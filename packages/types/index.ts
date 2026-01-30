export type VertiportKey = 'jamsil' | 'yeouido' | 'gangnam' | 'suseo';
export interface VehicleState {
  lat: number;
  lng: number;
  alt: number;
  targetLat: number;
  targetLng: number;
  speed: number; // 초당 이동 위경도 (대략적인 수치)
  battery: number; // 배터리 잔량 (0~100)
  destinationKey: VertiportKey; // 목적지 거점 키
  intervalId: ReturnType<typeof setInterval>;
  waitingForLanding: boolean; // 착륙 대기 중 (호버링)
  landingApproved: boolean;   // 착륙 승인 여부
}

export interface UamVehicleStatus {
  uamId: string;
  latitude: number;
  longitude: number;
  altitude: number;
  batteryPercent: number;
  isEmergency: boolean;
  timestamp: number;
  heading: number;
  targetLat: number;   // 목적지 위도
  targetLng: number;   // 목적지 경도
  speed: number;       // 초당 이동 위경도 (대략적인 수치)
  destinationKey: VertiportKey; // 목적지 거점 키 (토픽 라우팅용)
  waitingForLanding: boolean;   // 착륙 대기 중 여부
}

export interface PriorityQueueItem extends UamVehicleStatus {
  priorityScore: number;
}
