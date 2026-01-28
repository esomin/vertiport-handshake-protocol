import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import type { UamVehicleStatus } from '@uam/types';
import { AlertCircle, BatteryFull } from 'lucide-react';

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
      <div className="grid gap-4">
        {uams.map((uam) => (
          <div key={uam.uamId} className={`p-4 rounded-lg border ${uam.isEmergency ? 'border-red-500 bg-red-900/20' : 'border-slate-700 bg-slate-900'}`}>
            <div className="flex justify-between items-center">
              <span className="font-mono text-xl">{uam.uamId}</span>
              <div className="flex gap-4 items-center">
                <span className="flex items-center gap-1">
                  <BatteryFull className={uam.batteryPercent < 20 ? 'text-red-500' : 'text-green-500'} />
                  {uam.batteryPercent.toFixed(1)}%
                </span>
                {uam.isEmergency && <AlertCircle className="text-red-500 animate-pulse" />}
              </div>
            </div>
            <div className="text-sm text-slate-400 mt-2">
              좌표: {uam.latitude.toFixed(4)}, {uam.longitude.toFixed(4)} | 고도: {uam.altitude.toFixed(0)}m
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
export default App;