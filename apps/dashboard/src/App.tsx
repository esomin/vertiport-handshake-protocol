import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import type { UamVehicleStatus } from '@uam/types';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertCircle,
  BatteryFull,
  CalendarClock,
  CheckCircle2,
  List,
  Map as MapIcon,
  MapPin,
  Navigation,
  PlaneLanding,
  XCircle
} from "lucide-react";
import { Map3D } from './Map3D';
import { LandingPriorityMap } from './LandingPriorityMap';

const socket = io('http://localhost:3002');

// 긴급 상황 판단 기준 상수 (스케줄러와 동일한 규칙)
const EMERGENCY_BATTERY_THRESHOLD = 15;

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

  // ── 자동 비상 착륙 프로토콜 ──
  const priorityEntryTimesRef = useRef<Map<string, number>>(new Map()); // uamId → 진입 시각(ms)
  const autoTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map()); // uamId → 타이머 ID
  const [autoLandingUams, setAutoLandingUams] = useState<Set<string>>(new Set()); // 자동 착륙 발동됨
  const [countdown, setCountdown] = useState<Map<string, number>>(new Map()); // uamId → 남은 초

  // 긴급 상태 판단 헬퍼 함수
  const isEmergency = useCallback((uam: UamVehicleStatus) => {
    return uam.batteryPercent < EMERGENCY_BATTERY_THRESHOLD;
  }, []);

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

  const triggerAutoLanding = useCallback((uamId: string) => {
    socket.emit('landing:approve', { uamId });
    setAutoLandingUams(prev => new Set([...prev, uamId]));
    autoTimersRef.current.delete(uamId);
    priorityEntryTimesRef.current.delete(uamId);
    setPendingApproval(prev => prev?.uamId === uamId ? null : prev);
  }, []);

  // ── Priority Zone 진입 감지 & 자동 착륙 타이머 ──
  useEffect(() => {
    const topThree = uams.slice(0, 3);
    const topThreeIds = new Set(topThree.map(u => u.uamId));

    // top-3 이탈한 기체 타이머 정리
    for (const [uamId] of autoTimersRef.current) {
      if (!topThreeIds.has(uamId)) {
        clearTimeout(autoTimersRef.current.get(uamId)!);
        autoTimersRef.current.delete(uamId);
        priorityEntryTimesRef.current.delete(uamId);
      }
    }

    for (const uam of topThree) {
      if (autoLandingUams.has(uam.uamId)) continue; // 이미 발동됨

      if (isEmergency(uam)) {
        // 즉시 자동 착륙 — 기존 타이머도 취소
        if (autoTimersRef.current.has(uam.uamId)) {
          clearTimeout(autoTimersRef.current.get(uam.uamId)!);
          autoTimersRef.current.delete(uam.uamId);
          priorityEntryTimesRef.current.delete(uam.uamId);
        }
        triggerAutoLanding(uam.uamId);
      } else if (!autoTimersRef.current.has(uam.uamId)) {
        // 신규 진입: 60초 타이머 시작
        priorityEntryTimesRef.current.set(uam.uamId, Date.now());
        const timer = setTimeout(() => {
          triggerAutoLanding(uam.uamId);
        }, 60_000);
        autoTimersRef.current.set(uam.uamId, timer);
      }
    }
  }, [uams, autoLandingUams, triggerAutoLanding, isEmergency]);

  // ── 카운트다운 ticker (1초마다 갱신) ──
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const updated = new Map<string, number>();
      for (const [uamId, entryTime] of priorityEntryTimesRef.current) {
        updated.set(uamId, Math.max(0, Math.ceil((60_000 - (now - entryTime)) / 1000)));
      }
      setCountdown(updated);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

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
    const { uamId } = pendingApproval;
    socket.emit('landing:approve', { uamId });
    if (autoTimersRef.current.has(uamId)) {
      clearTimeout(autoTimersRef.current.get(uamId)!);
      autoTimersRef.current.delete(uamId);
      priorityEntryTimesRef.current.delete(uamId);
    }
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
    isUamEmergency: boolean; // 렌더링 최적화
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
    return {
      uam,
      rank: i + 1,
      etaMin,
      distKm,
      isWaiting: !!uam.waitingForLanding,
      arrivalTime,
      isUamEmergency: isEmergency(uam)
    };
  });

  // 타임라인 최대 ETA(분) — 스케일 기준
  const maxEtaMin = Math.max(...etaList.map(e => e.etaMin), 1);

  return (
    <div className="bg-slate-900 h-screen overflow-hidden text-white flex flex-col">
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
            <MapIcon size={15} />
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

              {/* 복원된 태그 1: 타이틀 및 실시간/잠금 토글 */}
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
                  <div className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={isQueueLocked}
                      onChange={(e) => setIsQueueLocked(e.target.checked)}
                    />
                    <div className="w-8 h-4 bg-slate-700 rounded-full peer peer-checked:bg-amber-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:after:translate-x-4"></div>
                  </div>
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
                      const isAutoLanding = autoLandingUams.has(uam.uamId);
                      const uamEmergency = isEmergency(uam);
                      return (
                        <div key={uam.uamId} className="p-3">
                          <Card className={`w-[240px] ${isAutoLanding
                            ? 'border-red-400 bg-red-950 text-white'
                            : uamEmergency
                              ? 'border-red-500 bg-red-950 text-white'
                              : uam.waitingForLanding
                                ? 'border-amber-400 bg-slate-800 text-white'
                                : 'border-slate-700 bg-slate-800 text-white'
                            }`}>
                            <CardHeader>
                              <div className="flex justify-between items-center h-3">
                                <CardTitle className="font-mono flex items-center gap-2 text-sm">
                                  <span className="text-[10px] font-bold text-slate-500">#{index + 1}</span>
                                  {uam.uamId}
                                  {(uamEmergency || isAutoLanding) && <AlertCircle className="text-red-500 animate-pulse w-4 h-4" />}
                                </CardTitle>
                                {isAutoLanding
                                  ? <Badge className="bg-red-500/30 text-red-300 border border-red-400/60 text-[10px] animate-pulse">AUTO LANDING</Badge>
                                  : uamEmergency
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
                              {/* (참고) 원본 코드에 주석처리 되어있던 자동착륙 카운트다운 */}
                              {/* {isAutoLanding ? (
                                <p className="text-[10px] text-red-400 text-center mb-2 animate-pulse font-bold">
                                  ⚡ EMERGENCY LANDING IN PROGRESS
                                </p>
                              ) : (
                                <p className="text-[10px] text-slate-500 text-center mb-2">
                                  자동 착륙까지 <span className="text-amber-400 font-bold">{countdown.get(uam.uamId) ?? 60}s</span>
                                </p>
                              )} */}
                              <Button
                                className="w-full h-8 text-xs"
                                variant={uamEmergency ? "destructive" : "default"}
                                disabled={isAutoLanding}
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
                      const uamEmergency = isEmergency(uam);
                      return (
                        <div key={uam.uamId} className="p-3">
                          <Card className={`w-[240px] ${uamEmergency
                            ? 'border-red-500 bg-red-950 text-white'
                            : uam.waitingForLanding
                              ? 'border-amber-400 bg-slate-800 text-white'
                              : 'border-slate-700 bg-slate-800 text-white'
                            }`}>
                            <CardHeader>
                              <div className="flex justify-between items-center h-3">
                                <CardTitle className="font-mono flex items-center gap-2 text-sm">
                                  <span className="text-[10px] font-bold text-slate-500">#{index + 1}</span>
                                  {uam.uamId}
                                  {uamEmergency && <AlertCircle className="text-red-500 animate-pulse w-4 h-4" />}
                                </CardTitle>
                                {uamEmergency
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
                                variant={uamEmergency ? "destructive" : "default"}
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

              {/* 복원된 태그 2-1: 타임라인 헤더 */}
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

                    {/* 복원된 태그 2-2: NOW 인디케이터 및 타임라인 수직 바 */}
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-[10px] font-bold text-slate-500 w-8 text-right flex-shrink-0">NOW</span>
                      <div className="w-3 h-3 rounded-full bg-sky-400 ring-2 ring-sky-400/30 flex-shrink-0" />
                      <div className="flex-1 h-px bg-gradient-to-r from-sky-700/60 to-transparent" />
                      <span className="text-[10px] text-sky-400 font-mono flex-shrink-0">
                        {now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div className="absolute left-[2.15rem] top-8 bottom-0 w-px bg-slate-800" />

                    {/* 기체 목록 */}
                    <div className="flex flex-col gap-2">
                      {etaList.map((entry) => {
                        const isTop3 = entry.rank <= 3;
                        const barWidth = Math.max(8, Math.round((entry.etaMin / maxEtaMin) * 100));

                        return (
                          <div key={entry.uam.uamId} className="flex items-start gap-2">
                            {/* 복원된 태그 2-3: 시간 레이블 */}
                            <span className={`text-[10px] w-8 text-right flex-shrink-0 font-mono pt-2 ${entry.isWaiting ? 'text-amber-400' : 'text-slate-600'}`}>
                              {entry.isWaiting ? '~1m' : `+${entry.etaMin}m`}
                            </span>

                            {/* 노드 점 */}
                            <div className="flex-shrink-0 pt-1.5">
                              <div className={`w-2.5 h-2.5 rounded-full border-2 transition-all duration-300 ${entry.isUamEmergency
                                ? 'bg-red-500 border-red-400'
                                : entry.isWaiting
                                  ? 'bg-amber-500 border-amber-400 ring-2 ring-amber-500/30'
                                  : isTop3
                                    ? 'bg-sky-500 border-sky-400'
                                    : 'bg-slate-600 border-slate-500'
                                }`} />
                            </div>

                            {/* 컨텐츠 카드 */}
                            <div className={`flex-1 rounded-lg border px-3 py-2 transition-all duration-300 ${entry.isUamEmergency
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
                                <span className={`font-mono text-xs font-bold flex-1 truncate ${entry.isUamEmergency ? 'text-red-300'
                                  : entry.isWaiting ? 'text-amber-300'
                                    : isTop3 ? 'text-slate-200'
                                      : 'text-slate-400'
                                  }`}>
                                  {entry.uam.uamId}
                                  {entry.isUamEmergency && <AlertCircle size={10} className="inline ml-1 text-red-500 animate-pulse" />}
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
                                    className={`h-full rounded-full transition-all duration-700 ${entry.isUamEmergency ? 'bg-red-500'
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

                              {/* 복원된 태그 2-4: 거리(km) 텍스트 */}
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

                    {/* 복원된 태그 2-5: 버티포트 도착점 */}
                    <div className="flex items-center gap-2 mt-3">
                      <span className="text-[10px] font-bold text-emerald-600 w-8 text-right flex-shrink-0">VTPT</span>
                      <div className="w-2.5 h-2.5 rounded-sm bg-emerald-600 flex-shrink-0" />
                      <div className="flex-1 h-px bg-emerald-900/60" />
                      <span className="text-[10px] text-emerald-700 font-mono">Jamsil VP</span>
                    </div>
                  </div>
                )}
              </div>

              {/* 복원된 태그 3: 하단 착륙 완료 로그 */}
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
              {isEmergency(pendingApproval) ? (
                <AlertCircle className="text-red-400 w-7 h-7 animate-pulse" />
              ) : (
                <Navigation className="text-sky-400 w-7 h-7" />
              )}
              <h2 className={`text-xl font-bold ${isEmergency(pendingApproval) ? 'text-red-400' : 'text-sky-400'}`}>
                착륙 승인 확인
              </h2>
            </div>

            <p className="text-slate-400 text-sm mb-4">
              아래 기체의 착륙을 승인합니다. 정보를 확인하세요.
            </p>

            <div className={`rounded-xl p-5 mb-2 border ${isEmergency(pendingApproval) ? 'bg-red-950 border-red-700' : 'bg-slate-900 border-slate-700'}`}>
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

                {/* 복원된 태그 4: 모달 내부 좌표 및 고도 */}
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

                {isEmergency(pendingApproval) && (
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

            <div className="flex gap-3 mt-6">
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
                className={`flex-1 font-bold ${isEmergency(pendingApproval) ? 'bg-red-600 hover:bg-red-500' : 'bg-green-600 hover:bg-green-500'} text-white`}
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