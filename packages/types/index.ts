export interface UamVehicleStatus {
  uamId: string;
  latitude: number;
  longitude: number;
  altitude: number;
  batteryPercent: number;
  isEmergency: boolean;
  timestamp: number;
}

export interface PriorityQueueItem extends UamVehicleStatus {
  priorityScore: number;
}
