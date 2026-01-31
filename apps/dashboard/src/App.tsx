import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import type { UamVehicleStatus } from '@uam/types';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  BatteryFull, AlertCircle, MapPin, Navigation,
  CheckCircle2, XCircle, PlaneLanding, Clock, Map, List, CalendarClock
} from "lucide-react";
import { Map3D } from './Map3D';
import { LandingPriorityMap } from './LandingPriorityMap';

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

  // ── ETA 계산 ──
  // 버티포트 좌표 (잠실 헤리패드 기준)
  const VERTIPORT_LAT = 37.5133;
  const VERTIPORT_LNG = 127.1028;
  const CRUISE_SPEED_MS = 150_000 / 3600; // 150 km/h → m/s (~41.7 m/s)

  function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6_371_000;
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  interface EtaEntry {
    uam: (typeof displayedUams)[0];
    rank: number;
    etaMin: number;       // 버티포트까지 소요 시간 (분)
    distKm: number;       // 남은 거리 (km)
    isWaiting: boolean;   // waitingForLanding
    arrivalTime: string;  // 도착 예상 시각
  }

  const now = new Date();
  // 우선순위 기체 최대 10대 표시 (Priority Zone 상위 3 + Standby Queue 7)
  const etaList: EtaEntry[] = displayedUams.slice(0, 10).map((uam, i) => {
    const distM = haversineMeters(uam.latitude, uam.longitude, VERTIPORT_LAT, VERTIPORT_LNG);
    const distKm = distM / 1000;
    // waitingForLanding 기체는 호버링 중 → 자체 하강 시간(~1.5분) 만 소요
    const etaMin = uam.waitingForLanding
      ? 1.5
      : Math.round((distM / CRUISE_SPEED_MS) / 60);
    const arrival = new Date(now.getTime() + etaMin * 60_000);
    const arrivalTime = arrival.toLocaleTimeString('ko-KR', {
      hour: '2-digit', minute: '2-digit'
    });
    return { uam, rank: i + 1, etaMin, distKm, isWaiting: !!uam.waitingForLanding, arrivalTime };
  });

  // 타임라인 최대 ETA(분) — 스케일 기준
  const maxEtaMin = Math.max(...etaList.map(e => e.etaMin), 1);

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
          <div className="flex flex-1 overflow-hidden divide-x divide-slate-800" style={{ minWidth: 0 }}>

            {/* 좌측: 착륙 우선순위 기체 목록 (스크롤) */}
            <div className="flex flex-col flex-[2] min-w-0 overflow-y-auto p-8">
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

              {/* ── Zone B: 4~10위 — 카드 ── */}
              {displayedUams.slice(3).length > 0 && (
                <>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-[10px] font-bold tracking-widest text-slate-500 uppercase">Standby Queue</span>
                    <div className="flex-1 h-px bg-slate-800" />
                  </div>
                  <div className="flex flex-wrap gap-0 mb-6">
                    {displayedUams.slice(3).map((uam, i) => {
                      const index = i + 3;
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
            </div>

            {/* ── 가운데: 착륙 우선순위 기체 맵 ── */}
            <div className="flex-[3] min-w-0 overflow-hidden relative">
              <LandingPriorityMap uams={displayedUams} />
            </div>

            {/* ── 우측: ETA Landing Sequence Timeline ── */}
            <div className="flex-[1] min-w-0 flex flex-col overflow-hidden bg-slate-900/40">

              {/* ── 타임라인 헤더 ── */}
              <div className="px-5 pt-5 pb-3 border-b border-slate-800">
                <h2 className="text-sm font-bold text-slate-300 flex items-center gap-2">
                  <CalendarClock size={15} className="text-sky-400" />
                  LANDING SEQUENCE
                  <span className="ml-auto text-[10px] font-normal text-slate-600">
                    {etaList.length}대 추적 중
                  </span>
                </h2>
                <p className="text-[10px] text-slate-600 mt-1">
                  버티포트 기준 · 크루즈 150km/h 적용
                </p>
              </div>

              {/* ── 타임라인 본문 ── */}
              <div className="flex-1 overflow-y-auto px-5 py-4">
                {etaList.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-slate-700 gap-2">
                    <CalendarClock size={28} className="opacity-30" />
                    <span className="text-xs">추적 중인 기체 없음</span>
                  </div>
                ) : (
                  <div className="relative">
                    {/* NOW 표시 */}
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-[10px] font-bold text-slate-500 w-8 text-right flex-shrink-0">NOW</span>
                      <div className="w-3 h-3 rounded-full bg-sky-400 ring-2 ring-sky-400/30 flex-shrink-0" />
                      <div className="flex-1 h-px bg-gradient-to-r from-sky-700/60 to-transparent" />
                      <span className="text-[10px] text-sky-400 font-mono flex-shrink-0">
                        {now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    {/* 수직 타임라인 바 */}
                    <div className="absolute left-[2.15rem] top-8 bottom-0 w-px bg-slate-800" />

                    {/* 기체 목록 */}
                    <div className="flex flex-col gap-2">
                      {etaList.map((entry, i) => {
                        const isTop3 = entry.rank <= 3;
                        const barWidth = Math.max(8, Math.round((entry.etaMin / maxEtaMin) * 100));

                        return (
                          <div key={entry.uam.uamId} className="flex items-start gap-2">
                            {/* 시간 레이블 */}
                            <span className={`text-[10px] w-8 text-right flex-shrink-0 font-mono pt-2 ${entry.isWaiting ? 'text-amber-400' : 'text-slate-600'
                              }`}>
                              {entry.isWaiting ? '~1m' : `+${entry.etaMin}m`}
                            </span>

                            {/* 노드 점 */}
                            <div className="flex-shrink-0 pt-1.5">
                              <div className={`w-2.5 h-2.5 rounded-full border-2 transition-all duration-300 ${entry.uam.isEmergency
                                ? 'bg-red-500 border-red-400'
                                : entry.isWaiting
                                  ? 'bg-amber-500 border-amber-400 ring-2 ring-amber-500/30'
                                  : isTop3
                                    ? 'bg-sky-500 border-sky-400'
                                    : 'bg-slate-600 border-slate-500'
                                }`} />
                            </div>

                            {/* 컨텐츠 카드 */}
                            <div className={`flex-1 rounded-lg border px-3 py-2 transition-all duration-300 ${entry.uam.isEmergency
                              ? 'border-red-800/60 bg-red-950/20'
                              : entry.isWaiting
                                ? 'border-amber-700/50 bg-amber-950/20'
                                : isTop3
                                  ? 'border-slate-700/80 bg-slate-800/40'
                                  : 'border-slate-800/60 bg-slate-900/20'
                              }`}>
                              {/* 최상단: 순위 + ID + 상태 */}
                              <div className="flex items-center gap-1.5 mb-1.5">
                                <span className="text-[10px] font-bold text-slate-600">#{entry.rank}</span>
                                <span className={`font-mono text-xs font-bold flex-1 truncate ${entry.uam.isEmergency ? 'text-red-300'
                                  : entry.isWaiting ? 'text-amber-300'
                                    : isTop3 ? 'text-slate-200'
                                      : 'text-slate-400'
                                  }`}>
                                  {entry.uam.uamId}
                                  {entry.uam.isEmergency && <AlertCircle size={10} className="inline ml-1 text-red-500 animate-pulse" />}
                                </span>
                                {entry.isWaiting ? (
                                  <span className="text-[10px] px-1 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-700/40 flex-shrink-0">착륙 대기</span>
                                ) : (
                                  <span className="text-[10px] px-1 py-0.5 rounded bg-slate-700/40 text-slate-500 flex-shrink-0">비행 중</span>
                                )}
                              </div>

                              {/* ETA 바 + 도착 시각 */}
                              <div className="flex items-center gap-2">
                                <div className="flex-1 h-1 rounded-full bg-slate-800 overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all duration-700 ${entry.uam.isEmergency ? 'bg-red-500'
                                      : entry.isWaiting ? 'bg-amber-500'
                                        : isTop3 ? 'bg-sky-600'
                                          : 'bg-slate-600'
                                      }`}
                                    style={{ width: `${barWidth}%` }}
                                  />
                                </div>
                                <span className="text-[10px] text-slate-600 font-mono flex-shrink-0">
                                  {entry.arrivalTime}
                                </span>
                              </div>

                              {/* 거리 */}
                              {!entry.isWaiting && (
                                <span className="text-[10px] text-slate-700 mt-1 block">
                                  {entry.distKm.toFixed(1)} km
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* 버티포트 도착점 */}
                    <div className="flex items-center gap-2 mt-3">
                      <span className="text-[10px] font-bold text-emerald-600 w-8 text-right flex-shrink-0">VTPT</span>
                      <div className="w-2.5 h-2.5 rounded-sm bg-emerald-600 flex-shrink-0" />
                      <div className="flex-1 h-px bg-emerald-900/60" />
                      <span className="text-[10px] text-emerald-700 font-mono">Jamsil VP</span>
                    </div>
                  </div>
                )}
              </div>

              {/* ── 하단: 착륙 완료 로그 ── */}
              {hasLanded && (
                <div className="border-t border-slate-800 px-5 py-3 max-h-[160px] overflow-y-auto">
                  <h3 className="text-[10px] font-bold text-slate-600 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                    <PlaneLanding size={11} />
                    착륙 완료 로그
                    <span className="ml-auto text-emerald-600">{landedUams.length}대</span>
                  </h3>
                  <div className="flex flex-col gap-1">
                    {landedUams.map((record, idx) => (
                      <div
                        key={`${record.uamId}-${record.landedAt}`}
                        className={`flex items-center gap-2 px-2 py-1 rounded border text-[10px] transition-all duration-500 ${idx === 0
                          ? 'border-emerald-800/50 bg-emerald-950/30 text-emerald-400'
                          : 'border-slate-800 text-slate-600'
                          }`}
                      >
                        <CheckCircle2 size={11} className="flex-shrink-0" />
                        <span className="font-mono font-bold flex-1 truncate">{record.uamId}</span>
                        <span className="font-mono">{formatLandedAt(record.landedAt)}</span>
                        {idx === 0 && <span className="text-emerald-500">●</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
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