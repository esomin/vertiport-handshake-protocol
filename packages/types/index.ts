export type VertiportKey = 'jamsil' | 'yeouido' | 'suseo';
export interface VehicleState {
  lat: number;
  lng: number;
  alt: number;
  targetLat: number;
  targetLng: number;
  speed: number; // 위경도 단위 속도
  battery: number;
  destinationKey: string;
  intervalId: any;
  waitingForLanding: boolean;
  landingApproved: boolean;
}

export interface UamVehicleStatus {
  uamId: string;
  latitude: number;
  longitude: number;
  altitude: number;
  batteryPercent: number;
  timestamp: number;
  heading: number;
  targetLat: number;
  targetLng: number;
  destinationKey: string;
  // 스케줄러를 위한 추가 데이터 (FD 가중치용)
  distanceToTargetKm: number;
  speedKmh: number;
  etaSeconds: number;
  waitingForLanding: boolean;
}

export interface PriorityQueueItem extends UamVehicleStatus {
  priorityScore: number;
}
