import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import type { UamVehicleStatus } from '@uam/types';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  BatteryFull, AlertCircle, MapPin, Navigation,
  CheckCircle2, XCircle, PlaneLanding, Clock, Map, List, Layers
} from "lucide-react";
import { Map3D } from './Map3D';

const socket = io('http://localhost:3002');

interface LandedRecord {
  uamId: string;
  landedAt: string;
}

type Tab = 'map' | 'list';

function App() {
  /** [Stream B] Redis top-10 → 착륙 승인 큐 렌더링용 */
  const [uams, setUams] = useState<UamVehicleStatus[]>([]);
  const [displayedUams, setDisplayedUams] = useState<UamVehicleStatus[]>([]);

  /** [Stream A] MQTT raw 최신 50개 → 지도(Map3D) 렌더링용 */
  const [mapUams, setMapUams] = useState<UamVehicleStatus[]>([]);

  const [landedUams, setLandedUams] = useState<LandedRecord[]>([]);
  const [pendingApproval, setPendingApproval] = useState<UamVehicleStatus | null>(null);
  const [isQueueLocked, setIsQueueLocked] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('list');

  useEffect(() => {
    // [Stream B] 착륙 큐: Redis 우선순위 top-10
    socket.on('uam:update', (data: UamVehicleStatus[]) => {
      setUams(data);
    });

    // [Stream A] 지도용: MQTT raw 최신 50대
    socket.on('map:update', (data: UamVehicleStatus[]) => {
      setMapUams(data);
    });

    socket.on('landed:update', (data: LandedRecord[]) => {
      setLandedUams(data);
    });

    return () => {
      socket.off('uam:update');
      socket.off('map:update');
      socket.off('landed:update');
    };
  }, []);

  useEffect(() => {
    if (!isQueueLocked) {
      setDisplayedUams(uams);
    }
  }, [uams, isQueueLocked]);

  // 잠금 중 백그라운드에서 변경된 기체 수 계산
  const pendingChangeCount = isQueueLocked
    ? uams.filter(u => {
      const matched = displayedUams.find(d => d.uamId === u.uamId);
      return !matched || matched.batteryPercent !== u.batteryPercent;
    }).length
    : 0;

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

  // ── 버티포트 패드 상태 계산 ──
  // 4개 패드: waitingForLanding 기체가 패드를 예약, 최근 landedUams는 점유 중으로 표시
  const PAD_NAMES = ['A', 'B', 'C', 'D'] as const;
  const PAD_COUNT = PAD_NAMES.length;

  // waitingForLanding 기체 목록 (최대 PAD_COUNT개)
  const waitingUams = displayedUams.filter(u => u.waitingForLanding).slice(0, PAD_COUNT);
  // 최근 착륙 완료 기체 (패드 아직 미청소 가정, waitingUams로 채워지지 않은 패드)
  const remainingSlots = PAD_COUNT - waitingUams.length;
  const recentlyLanded = landedUams.slice(0, remainingSlots);

  interface PadState {
    name: string;
    status: 'OCCUPIED_WAITING' | 'OCCUPIED_LANDED' | 'AVAILABLE';
    uamId?: string;
    landedAt?: string;
  }

  const padStates: PadState[] = PAD_NAMES.map((name, i) => {
    if (i < waitingUams.length) {
      return { name, status: 'OCCUPIED_WAITING', uamId: waitingUams[i].uamId };
    }
    const landedIdx = i - waitingUams.length;
    if (landedIdx < recentlyLanded.length) {
      return { name, status: 'OCCUPIED_LANDED', uamId: recentlyLanded[landedIdx].uamId, landedAt: recentlyLanded[landedIdx].landedAt };
    }
    return { name, status: 'AVAILABLE' };
  });

  const availablePads = padStates.filter(p => p.status === 'AVAILABLE').length;
  // 대기 중인 기체 수 (waitingForLanding이지만 패드 배정 못받은 기체)
  const queuedCount = Math.max(0, displayedUams.filter(u => u.waitingForLanding).length - waitingUams.length);
  // 예상 대기 시간 (패드당 평균 3분 점유 가정)
  const estimatedWaitMin = availablePads === 0 ? Math.ceil(queuedCount * 3) : 0;

  return (
    <div className="bg-slate-950 h-screen overflow-hidden text-white flex flex-col">
      {/* ── 헤더 ── */}
      <div className="px-8 pt-6 pb-0 border-b border-slate-800">
        <div className="flex items-center gap-4 mb-4">
          <h1 className="text-3xl font-bold">UAM Real-Time Control Dashboard</h1>
          {hasLanded && (
            <Badge className="bg-emerald-700 text-emerald-100 text-sm px-3 py-1">
              <PlaneLanding size={14} className="mr-1 inline" />
              착륙 완료 {landedUams.length}대
            </Badge>
          )}
        </div>

        {/* ── 탭 버튼 ── */}
        <div className="flex">
          <button
            onClick={() => setActiveTab('list')}
            className={`flex items-center gap-2 !rounded-none px-5 py-2.5 text-sm font-medium transition-all duration-150 border-b-2 ${activeTab === 'list'
              ? 'border-sky-400 text-white'
              : 'border-transparent text-slate-500 hover:text-slate-300 hover:border-slate-600'
              }`}
          >
            <List size={15} />
            착륙 우선순위 기체
            {displayedUams.length > 0 && (
              <span className={`ml-1 px-1.5 py-0.5 rounded-full text-xs font-bold ${activeTab === 'list' ? 'bg-sky-500/20 text-sky-300' : 'bg-slate-700/60 text-slate-400'
                }`}>
                {displayedUams.length}
              </span>
            )}
            {hasLanded && (
              <span className={`ml-1 px-1.5 py-0.5 rounded-full text-xs font-bold ${activeTab === 'list' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-700/60 text-slate-400'
                }`}>
                착륙 {landedUams.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('map')}
            className={`flex items-center gap-2 !rounded-none px-5 py-2.5 text-sm font-medium transition-all duration-150 border-b-2 ${activeTab === 'map'
              ? 'border-sky-400 text-white'
              : 'border-transparent text-slate-500 hover:text-slate-300 hover:border-slate-600'
              }`}
          >
            <Map size={15} />
            비행 중 기체
            {mapUams.length > 0 && (
              <span className={`ml-1 px-1.5 py-0.5 rounded-full text-xs font-bold ${activeTab === 'map' ? 'bg-sky-500/20 text-sky-300' : 'bg-slate-700/60 text-slate-400'
                }`}>
                {mapUams.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ── 탭 콘텐츠 ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── 탭: 착륙 우선순위 기체 목록 + 버티포트 현황 ── */}
        {activeTab === 'list' && (
          <div className="flex flex-1 overflow-hidden divide-x divide-slate-800">

            {/* 좌측: 착륙 우선순위 기체 목록 (스크롤) */}
            <div className="flex flex-col flex-1 min-w-0 overflow-y-auto p-8">
              <div className="flex items-center gap-3 mb-5">
                <h2 className="text-lg font-semibold text-slate-300 flex items-center gap-2">
                  <Navigation size={18} className="text-sky-400" />
                  착륙 우선순위 ({displayedUams.length}대)
                </h2>

                {isQueueLocked && pendingChangeCount > 0 && (
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/15 text-amber-300 border border-amber-500/40 animate-pulse">
                    백그라운드 {pendingChangeCount}대 변경 중
                  </span>
                )}

                <label className="ml-auto flex items-center gap-2 cursor-pointer select-none">
                  <span className={`text-xs font-medium transition-colors duration-200 ${isQueueLocked ? 'text-amber-300' : 'text-slate-400'}`}>
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

              {/* ── Zone A: 상위 3대 — 풀 카드 ── */}
              {displayedUams.slice(0, 3).length > 0 && (
                <>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-[10px] font-bold tracking-widest text-sky-400 uppercase">Priority Zone</span>
                    <div className="flex-1 h-px bg-sky-900/60" />
                  </div>
                  <div className="flex flex-wrap gap-0 mb-6">
                    {displayedUams.slice(0, 3).map((uam, index) => {
                      const isLowBattery = uam.batteryPercent < 20;
                      return (
                        <div key={uam.uamId} className="p-3">
                          <Card className={`w-[240px] ${uam.isEmergency
                            ? 'border-red-500 bg-red-950 text-white'
                            : uam.waitingForLanding
                              ? 'border-amber-400 bg-slate-900 text-white'
                              : 'border-slate-700 bg-slate-900 text-white'
                            }`}>
                            <CardHeader>
                              <div className="flex justify-between items-center h-3">
                                <CardTitle className="font-mono flex items-center gap-2 text-sm">
                                  <span className="text-[10px] font-bold text-slate-500">#{index + 1}</span>
                                  {uam.uamId}
                                  {uam.isEmergency && <AlertCircle className="text-red-500 animate-pulse w-4 h-4" />}
                                </CardTitle>
                                {uam.isEmergency
                                  ? <Badge variant="destructive" className="text-[10px]">Emergency</Badge>
                                  : uam.waitingForLanding
                                    ? <Badge className="bg-amber-500/20 text-amber-300 border border-amber-500/50 text-[10px]">착륙 대기</Badge>
                                    : <Badge className="bg-sky-500/20 text-sky-300 border border-sky-500/30 text-[10px]">비행 중</Badge>
                                }
                              </div>
                            </CardHeader>
                            <CardContent>
                              <div className="flex flex-col gap-1.5 mb-3">
                                <p className="flex items-center gap-2 text-sm text-slate-300">
                                  <BatteryFull className={isLowBattery ? 'text-red-500' : 'text-green-500'} size={15} />
                                  <span className={isLowBattery ? 'text-red-500 font-bold' : ''}>
                                    배터리 {uam.batteryPercent.toFixed(1)}%
                                  </span>
                                </p>
                                <p className="text-xs text-slate-500">
                                  {uam.latitude.toFixed(4)}, {uam.longitude.toFixed(4)} · {uam.altitude.toFixed(0)}m
                                </p>
                              </div>
                              <Button
                                className="w-full h-8 text-xs"
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
                </>
              )}

              {/* ── Zone B: 4~10위 — Compact List ── */}
              {displayedUams.slice(3).length > 0 && (
                <>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-[10px] font-bold tracking-widest text-slate-500 uppercase">Standby Queue</span>
                    <div className="flex-1 h-px bg-slate-800" />
                  </div>
                  <div className="flex flex-col gap-1">
                    {displayedUams.slice(3).map((uam, i) => {
                      const index = i + 3;
                      const isLowBattery = uam.batteryPercent < 20;
                      return (
                        <div
                          key={uam.uamId}
                          className={`flex items-center gap-3 px-4 py-2.5 rounded-lg border transition-all duration-200 group hover:border-slate-600 hover:bg-slate-800/50 ${uam.isEmergency
                            ? 'border-red-900/60 bg-red-950/30'
                            : uam.waitingForLanding
                              ? 'border-amber-900/50 bg-amber-950/20'
                              : 'border-slate-800 bg-slate-900/30'
                            }`}
                        >
                          {/* 순위 */}
                          <span className="text-xs font-bold text-slate-600 w-5 text-right flex-shrink-0">#{index + 1}</span>

                          {/* ID */}
                          <span className="font-mono text-sm text-slate-400 group-hover:text-slate-300 flex-1 min-w-0 truncate">
                            {uam.uamId}
                            {uam.isEmergency && <AlertCircle size={12} className="inline ml-1.5 text-red-500 animate-pulse" />}
                          </span>

                          {/* 상태 뱃지 */}
                          {uam.waitingForLanding
                            ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-700/40 flex-shrink-0">착륙 대기</span>
                            : <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700/40 text-slate-500 flex-shrink-0">비행 중</span>
                          }

                          {/* 배터리 */}
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <BatteryFull size={12} className={isLowBattery ? 'text-red-500' : 'text-slate-500'} />
                            <span className={`text-xs ${isLowBattery ? 'text-red-400 font-bold' : 'text-slate-500'}`}>
                              {uam.batteryPercent.toFixed(0)}%
                            </span>
                          </div>

                          {/* 승인 버튼 (hover 시만 표시) */}
                          <Button
                            className="h-6 text-[10px] px-2 opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex-shrink-0"
                            variant={uam.isEmergency ? "destructive" : "outline"}
                            size="sm"
                            onClick={() => handleApproveClick(uam)}
                          >
                            승인
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {/* ── 우측: 버티포트 현황판 (항상 표시) ── */}
            <div className="w-[340px] flex-shrink-0 flex flex-col overflow-hidden bg-slate-900/40">

              {/* ── 상단: 패드 현황 ── */}
              <div className="p-5 border-b border-slate-800">
                <h2 className="text-sm font-bold text-slate-300 flex items-center gap-2 mb-4">
                  <Layers size={15} className="text-sky-400" />
                  VERTIPORT STATUS
                  <span className="ml-auto font-normal text-xs">
                    <span className={availablePads > 0 ? 'text-emerald-400' : 'text-red-400'}>
                      {availablePads}
                    </span>
                    <span className="text-slate-600"> / {PAD_COUNT} available</span>
                  </span>
                </h2>

                {/* 패드 목록 */}
                <div className="flex flex-col gap-2 mb-4">
                  {padStates.map((pad) => (
                    <div key={pad.name} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all duration-500 ${
                      pad.status === 'OCCUPIED_WAITING'
                        ? 'border-amber-700/60 bg-amber-950/30'
                        : pad.status === 'OCCUPIED_LANDED'
                          ? 'border-slate-700 bg-slate-800/60'
                          : 'border-emerald-800/40 bg-emerald-950/10'
                    }`}>
                      {/* 패드 이름 */}
                      <span className="font-mono font-bold text-base w-6 text-center flex-shrink-0 text-slate-400">
                        {pad.name}
                      </span>

                      {/* 상태 바 */}
                      <div className="flex-1 h-1.5 rounded-full overflow-hidden bg-slate-800">
                        <div className={`h-full rounded-full transition-all duration-700 ${
                          pad.status === 'OCCUPIED_WAITING'
                            ? 'w-full bg-amber-500'
                            : pad.status === 'OCCUPIED_LANDED'
                              ? 'w-full bg-slate-500'
                              : 'w-0'
                        }`} />
                      </div>

                      {/* 상태 / 기체 ID */}
                      {pad.status === 'OCCUPIED_WAITING' ? (
                        <div className="flex flex-col items-end flex-shrink-0">
                          <span className="font-mono text-xs font-bold text-amber-300">{pad.uamId}</span>
                          <span className="text-[10px] text-amber-600">착륙 대기</span>
                        </div>
                      ) : pad.status === 'OCCUPIED_LANDED' ? (
                        <div className="flex flex-col items-end flex-shrink-0">
                          <span className="font-mono text-xs text-slate-400">{pad.uamId}</span>
                          <span className="text-[10px] text-slate-600">정리 중</span>
                        </div>
                      ) : (
                        <span className="text-xs font-semibold text-emerald-500 flex-shrink-0">OPEN</span>
                      )}
                    </div>
                  ))}
                </div>

                {/* 요약 통계 */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg bg-slate-800/60 border border-slate-700/50 px-3 py-2">
                    <div className="text-[10px] text-slate-500 mb-0.5">수용 가능</div>
                    <div className={`text-lg font-bold font-mono ${
                      availablePads > 1 ? 'text-emerald-400' : availablePads === 1 ? 'text-amber-400' : 'text-red-400'
                    }`}>
                      {availablePads} <span className="text-xs font-normal text-slate-500">/ {PAD_COUNT}</span>
                    </div>
                  </div>
                  <div className="rounded-lg bg-slate-800/60 border border-slate-700/50 px-3 py-2">
                    <div className="text-[10px] text-slate-500 mb-0.5">예상 대기</div>
                    <div className={`text-lg font-bold font-mono ${
                      estimatedWaitMin === 0 ? 'text-emerald-400' : estimatedWaitMin <= 5 ? 'text-amber-400' : 'text-red-400'
                    }`}>
                      {estimatedWaitMin === 0
                        ? <span className="text-sm">즉시</span>
                        : <>{estimatedWaitMin}<span className="text-xs font-normal text-slate-500">분</span></>
                      }
                    </div>
                  </div>
                </div>

                {/* 대기 큐 알림 */}
                {queuedCount > 0 && (
                  <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-red-950/40 border border-red-800/50">
                    <AlertCircle size={13} className="text-red-400 flex-shrink-0 animate-pulse" />
                    <span className="text-xs text-red-300">
                      패드 초과 — {queuedCount}대 추가 대기 중
                    </span>
                  </div>
                )}
              </div>

              {/* ── 하단: 착륙 완료 로그 ── */}
              <div className="flex-1 overflow-y-auto p-5">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                  <PlaneLanding size={12} />
                  착륙 완료 로그
                  {hasLanded && (
                    <span className="ml-auto text-emerald-500">{landedUams.length}대</span>
                  )}
                </h3>

                {!hasLanded ? (
                  <div className="flex flex-col items-center justify-center py-10 text-slate-700">
                    <PlaneLanding size={28} className="mb-2 opacity-30" />
                    <span className="text-xs">착륙 완료 기록 없음</span>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {landedUams.map((record, idx) => (
                      <div
                        key={`${record.uamId}-${record.landedAt}`}
                        className={`rounded-lg border px-3 py-2 flex items-center gap-2.5 transition-all duration-500 ${
                          idx === 0
                            ? 'border-emerald-700/60 bg-emerald-950/40'
                            : 'border-slate-800 bg-slate-800/30'
                        }`}
                      >
                        <CheckCircle2
                          size={14}
                          className={idx === 0 ? 'text-emerald-400 flex-shrink-0' : 'text-slate-600 flex-shrink-0'}
                        />
                        <span className={`font-mono text-xs font-bold flex-1 truncate ${
                          idx === 0 ? 'text-emerald-300' : 'text-slate-500'
                        }`}>
                          {record.uamId}
                        </span>
                        <span className="flex items-center gap-1 text-[10px] text-slate-600 flex-shrink-0">
                          <Clock size={10} />
                          {formatLandedAt(record.landedAt)}
                        </span>
                        {idx === 0 && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-600/30 text-emerald-400 border border-emerald-700/50 flex-shrink-0">
                            최신
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── 탭: 지도 ── */}
        {activeTab === 'map' && (
          <div className="flex-1 overflow-hidden relative">
            <Map3D uams={mapUams} />
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

            <p className="text-xs text-slate-500 mb-6 text-center">
              * 이 정보는 승인 버튼을 클릭한 시점의 스냅샷입니다.
            </p>

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