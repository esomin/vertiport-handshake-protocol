export interface VehicleState {
  lat: number;
  lng: number;
  alt: number;
  targetLat: number;
  targetLng: number;
  speed: number; // 초당 이동 위경도 (대략적인 수치)
  intervalId: NodeJS.Timeout;
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
}

export interface PriorityQueueItem extends UamVehicleStatus {
  priorityScore: number;
}
