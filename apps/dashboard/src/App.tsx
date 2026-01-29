import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import type { UamVehicleStatus } from '@uam/types';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BatteryFull, AlertCircle } from "lucide-react";

const socket = io('http://localhost:3002');

function App() {
  const [uams, setUams] = useState<UamVehicleStatus[]>([]);

  useEffect(() => {
    socket.on('uam:update', (data: UamVehicleStatus[]) => {
      setUams(data);
    });
    return () => { socket.off('uam:update'); };
  }, []);

  return (
    <div className="p-8 bg-slate-950 min-h-screen text-white">
      <h1 className="text-3xl font-bold mb-6">UAM Real-Time Control Dashboard</h1>
      <div className="flex flex-wrap">
        {uams.map((uam) => {
          const isLowBattery = uam.batteryPercent < 20;

          return (
            <div key={uam.uamId} className="p-4">
              <Card className={`w-[350px] ${uam.isEmergency ? 'border-red-500 bg-red-950 text-white' : 'border-slate-700 bg-slate-900 text-white'}`}>
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <CardTitle className="font-mono flex items-center gap-2">
                      {uam.uamId}
                      {uam.isEmergency && <AlertCircle className="text-red-500 animate-pulse w-5 h-5" />}
                    </CardTitle>
                    {uam.isEmergency && <Badge variant="destructive">Emergency</Badge>}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col gap-2 mb-4">
                    <p className="flex items-center gap-2 text-sm text-slate-300">
                      <BatteryFull className={isLowBattery ? 'text-red-500' : 'text-green-500'} size={18} />
                      <span className={isLowBattery ? 'text-red-500 font-bold' : ''}>
                        배터리: {uam.batteryPercent.toFixed(1)}%
                      </span>
                    </p>
                    <p className="text-sm text-slate-400">
                      좌표: {uam.latitude.toFixed(4)}, {uam.longitude.toFixed(4)}
                    </p>
                    <p className="text-sm text-slate-400">
                      고도: {uam.altitude.toFixed(0)}m
                    </p>
                  </div>
                  <Button
                    className="w-full"
                    variant={uam.isEmergency ? "destructive" : "default"}
                    onClick={() => alert(`${uam.uamId} 착륙 승인`)}
                  >
                    착륙 승인
                  </Button>
                </CardContent>
              </Card>
            </div>
          );
        })}
      </div>
    </div>
  );
}
export default App;