import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import type { UamVehicleStatus } from '@uam/types';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  BatteryFull, AlertCircle, MapPin, Navigation,
  CheckCircle2, XCircle, PlaneLanding, Clock
} from "lucide-react";
import { Map3D } from './Map3D';

const socket = io('http://localhost:3002');

interface LandedRecord {
  uamId: string;
  landedAt: string;
}

function App() {
  const [uams, setUams] = useState<UamVehicleStatus[]>([]);
  const [displayedUams, setDisplayedUams] = useState<UamVehicleStatus[]>([]);
  const [landedUams, setLandedUams] = useState<LandedRecord[]>([]);
  const [pendingApproval, setPendingApproval] = useState<UamVehicleStatus | null>(null);
  const [isQueueLocked, setIsQueueLocked] = useState(false);


  useEffect(() => {
    socket.on('uam:update', (data: UamVehicleStatus[]) => {
      setUams(data);
    });
    socket.on('landed:update', (data: LandedRecord[]) => {
      setLandedUams(data);
    });
    return () => {
      socket.off('uam:update');
      socket.off('landed:update');
    };
  }, []);

  useEffect(() => {
    if (!isQueueLocked) {
      setDisplayedUams(uams);
    }
  }, [uams, isQueueLocked])

  // 잠금 중 백그라운드에서 변경된 기체 수 계산 (배터리가 달라짃거나 새로 추가된 기체)
  const pendingChangeCount = isQueueLocked
    ? uams.filter(u => {
      const matched = displayedUams.find(d => d.uamId === u.uamId);
      return !matched || matched.batteryPercent !== u.batteryPercent;
    }).length
    : 0;

  // 버튼 클릭 시 기체 상태를 스냅샷으로 캡처하여 모달에 고정
  const handleApproveClick = (uam: UamVehicleStatus) => {
    setPendingApproval({ ...uam });
  };

  const handleConfirm = () => {
    if (!pendingApproval) return;
    socket.emit('landing:approve', { uamId: pendingApproval.uamId });
    setPendingApproval(null);
  };

  const handleCancel = () => {
    setPendingApproval(null);
  };

  const formatLandedAt = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const hasLanded = landedUams.length > 0;

  return (
    <div className="bg-slate-950 h-screen overflow-hidden text-white flex flex-col">
      {/* ── 헤더 ── */}
      <div className="px-8 pt-8 pb-4 border-b border-slate-800 flex items-center gap-4">
        <h1 className="text-3xl font-bold">UAM Real-Time Control Dashboard</h1>
        {hasLanded && (
          <Badge className="bg-emerald-700 text-emerald-100 text-sm px-3 py-1">
            <PlaneLanding size={14} className="mr-1 inline" />
            착륙 완료 {landedUams.length}대
          </Badge>
        )}
      </div>

      {/* ── 본문: 좌우 분할 ── */}
      <div className={`flex flex-1 overflow-hidden ${hasLanded ? 'divide-x divide-slate-800' : ''}`}>

        {/* ── 좌측: 비행 중 기체 큐 및 3D 맵 ── */}
        <div className={`flex flex-col min-w-0 ${hasLanded ? 'max-w-[calc(100%-340px)]' : 'flex-1'}`}>

          {/* 상단: 기체 목록 (스크롤 가능) */}
          <div className="flex-1 p-8 overflow-y-auto">
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-lg font-semibold text-slate-300 flex items-center gap-2">
                <Navigation size={18} className="text-sky-400" />
                비행 중 기체 ({displayedUams.length}대)
              </h2>

              {/* 잠금 중 누적 변경 뱃지 */}
              {isQueueLocked && pendingChangeCount > 0 && (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/15 text-amber-300 border border-amber-500/40 animate-pulse">
                  백그라운드 {pendingChangeCount}대 변경 중
                </span>
              )}

              {/* 잠금 토글 스위치 */}
              <label className="ml-auto flex items-center gap-2 cursor-pointer select-none">
                <span className={`text-xs font-medium transition-colors duration-200 ${isQueueLocked ? 'text-amber-300' : 'text-slate-400'
                  }`}>
                  {isQueueLocked ? '잠금 중' : '실시간'}
                </span>
                <Switch
                  checked={isQueueLocked}
                  onCheckedChange={setIsQueueLocked}
                  className="data-[state=checked]:!bg-amber-500"
                  size='sm'
                />
              </label>
            </div>
            <div className="flex flex-wrap gap-0">
              {displayedUams.map((uam, index) => {
                const isLowBattery = uam.batteryPercent < 20;
                const isRankedLower = index >= 3;

                return (
                  <div
                    key={uam.uamId}
                    className={`p-4 transition-opacity duration-500 ${isRankedLower ? 'opacity-40 hover:opacity-100' : 'opacity-100'}`}
                  >
                    <Card className={`w-[240px] ${uam.isEmergency ? 'border-red-500 bg-red-950 text-white' : 'border-slate-700 bg-slate-900 text-white'}`}>
                      <CardHeader>
                        <div className="flex justify-between items-center h-3">
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
                          onClick={() => handleApproveClick(uam)}
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

          {/* 하단: 3D 맵 (고정 영역) */}
          <div className="h-[600px] p-8 overflow-hidden relative">
            <Map3D uams={displayedUams} />
          </div>
        </div>


        {/* ── 우측: 착륙 완료 패널 (착륙 기체가 있을 때만 표시) ── */}
        {hasLanded && (
          <div className="w-[340px] flex-shrink-0 p-6 overflow-y-auto bg-slate-900/50">
            <h2 className="text-lg font-semibold text-emerald-400 mb-4 flex items-center gap-2">
              <PlaneLanding size={18} />
              착륙 완료
              <span className="ml-auto text-sm font-normal text-slate-400">{landedUams.length}대</span>
            </h2>

            <div className="flex flex-col gap-3">
              {landedUams.map((record, idx) => (
                <div
                  key={`${record.uamId}-${record.landedAt}`}
                  className={`
                    rounded-xl border px-4 py-3 flex items-center gap-3
                    transition-all duration-500
                    ${idx === 0
                      ? 'border-emerald-500 bg-emerald-950/60 shadow-lg shadow-emerald-900/40'
                      : 'border-slate-700 bg-slate-800/60'
                    }
                  `}
                >
                  {/* 아이콘 */}
                  <div className={`rounded-full p-2 flex-shrink-0 ${idx === 0 ? 'bg-emerald-700/50' : 'bg-slate-700/50'}`}>
                    <CheckCircle2
                      size={18}
                      className={idx === 0 ? 'text-emerald-300' : 'text-slate-400'}
                    />
                  </div>

                  {/* 기체 ID + 시각 */}
                  <div className="flex flex-col min-w-0">
                    <span className={`font-mono font-bold text-sm truncate ${idx === 0 ? 'text-emerald-200' : 'text-slate-300'}`}>
                      {record.uamId}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-slate-500 mt-0.5">
                      <Clock size={11} />
                      {formatLandedAt(record.landedAt)}
                    </span>
                  </div>

                  {/* 최신 뱃지 */}
                  {idx === 0 && (
                    <Badge className="ml-auto flex-shrink-0 bg-emerald-600 text-emerald-100 text-xs px-2 py-0.5">
                      최신
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── 착륙 승인 확인 모달 ── */}
      {pendingApproval && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={handleCancel}
        >
          <div
            className="bg-slate-800 border border-slate-600 rounded-2xl p-8 w-[420px] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 헤더 */}
            <div className="flex items-center gap-3 mb-6">
              {pendingApproval.isEmergency ? (
                <AlertCircle className="text-red-400 w-7 h-7 animate-pulse" />
              ) : (
                <Navigation className="text-sky-400 w-7 h-7" />
              )}
              <h2 className={`text-xl font-bold ${pendingApproval.isEmergency ? 'text-red-400' : 'text-sky-400'}`}>
                착륙 승인 확인
              </h2>
            </div>

            <p className="text-slate-400 text-sm mb-4">
              아래 기체의 착륙을 승인합니다. 정보를 확인하세요.
            </p>

            {/* 스냅샷 정보 박스 */}
            <div className={`rounded-xl p-5 mb-2 border ${pendingApproval.isEmergency ? 'bg-red-950 border-red-700' : 'bg-slate-900 border-slate-700'}`}>
              <p className="font-mono text-2xl font-bold text-white mb-3">
                {pendingApproval.uamId}
              </p>
              <div className="flex flex-col gap-2 text-sm">
                <div className="flex items-center gap-2">
                  <BatteryFull
                    size={16}
                    className={pendingApproval.batteryPercent < 20 ? 'text-red-400' : 'text-green-400'}
                  />
                  <span className={pendingApproval.batteryPercent < 20 ? 'text-red-400 font-bold' : 'text-slate-300'}>
                    배터리: {pendingApproval.batteryPercent.toFixed(1)}%
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <MapPin size={16} className="text-slate-400" />
                  <span className="text-slate-300">
                    좌표: {pendingApproval.latitude.toFixed(4)}, {pendingApproval.longitude.toFixed(4)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Navigation size={16} className="text-slate-400" />
                  <span className="text-slate-300">
                    고도: {pendingApproval.altitude.toFixed(0)}m
                  </span>
                </div>
                {pendingApproval.isEmergency && (
                  <div className="flex items-center gap-2 mt-1">
                    <AlertCircle size={16} className="text-red-400 animate-pulse" />
                    <span className="text-red-400 font-bold">비상 상황 기체</span>
                  </div>
                )}
              </div>
            </div>

            {/* 스냅샷 안내 문구 */}
            <p className="text-xs text-slate-500 mb-6 text-center">
              * 이 정보는 승인 버튼을 클릭한 시점의 스냅샷입니다.
            </p>

            {/* 액션 버튼 */}
            <div className="flex gap-3">
              <Button
                id="modal-cancel-btn"
                className="flex-1 bg-slate-700 hover:!bg-slate-600 text-white"
                variant="ghost"
                onClick={handleCancel}
              >
                <XCircle size={16} className="mr-2" />
                취소
              </Button>
              <Button
                id="modal-confirm-btn"
                className={`flex-1 font-bold ${pendingApproval.isEmergency ? 'bg-red-600 hover:bg-red-500' : 'bg-green-600 hover:bg-green-500'} text-white`}
                onClick={handleConfirm}
              >
                <CheckCircle2 size={16} className="mr-2" />
                최종 승인
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;