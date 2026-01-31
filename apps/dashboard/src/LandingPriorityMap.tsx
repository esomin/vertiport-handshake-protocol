import Map, { Marker, NavigationControl, Source } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { UamVehicleStatus } from '@uam/types';
import maplibregl from 'maplibre-gl';

const MAPTILER_API_KEY = import.meta.env.VITE_MAPTILER_API_KEY as string;
const MAP_STYLE = `https://api.maptiler.com/maps/outdoor-v2/style.json?key=${MAPTILER_API_KEY}`;

const TERRAIN_SPEC = {
  source: 'terrain-source',
  exaggeration: 2.0,
};

// 잠실 버티포트만 표시
const JAMSIL_VERTIPORT = { name: '잠실 버티포트', lat: 37.513, lng: 127.108 };

interface LandingPriorityMapProps {
  uams: UamVehicleStatus[];
}

export function LandingPriorityMap({ uams }: LandingPriorityMapProps) {
  return (
    <div className="w-full h-full min-h-[300px] relative bg-slate-950">
      <Map
        mapLib={maplibregl}
        initialViewState={{
          longitude: 127.108,
          latitude: 37.513,
          zoom: 15,
          bearing: -15,
          pitch: 50,
        }}
        maxPitch={85}
        mapStyle={MAP_STYLE}
        terrain={TERRAIN_SPEC}
        onError={(e) => console.error('LandingPriorityMap error:', e)}
      >
        <Source
          id="terrain-source"
          type="raster-dem"
          url={`https://api.maptiler.com/tiles/terrain-rgb-v2/tiles.json?key=${MAPTILER_API_KEY}`}
          tileSize={512}
        />

        <NavigationControl position="top-right" />

        {/* ── 잠실 버티포트 마커 ── */}
        <Marker
          longitude={JAMSIL_VERTIPORT.lng}
          latitude={JAMSIL_VERTIPORT.lat}
          anchor="bottom"
        >
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            {/* 착륙 패드 아이콘 */}
            <div
              title={JAMSIL_VERTIPORT.name}
              style={{
                width: 28,
                height: 28,
                borderRadius: 4,
                backgroundColor: '#f97316',
                border: '2px solid #c2410c',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 0 12px rgba(249,115,22,0.6)',
                color: '#fff',
                fontWeight: 900,
                fontSize: 13,
              }}
            >
              H
            </div>
            <div
              style={{
                marginTop: 4,
                fontSize: 11,
                color: '#f97316',
                fontWeight: 700,
                background: 'rgba(0,0,0,0.72)',
                padding: '2px 6px',
                borderRadius: 4,
                whiteSpace: 'nowrap',
                border: '1px solid rgba(249,115,22,0.4)',
              }}
            >
              ★ 잠실 VP
            </div>
          </div>
        </Marker>

        {/* ── 착륙 우선순위 기체 마커 ── */}
        {uams.map((uam, index) => {
          const rank = index + 1;
          const isTop3 = rank <= 3;
          const size = isTop3 ? 16 : 11;

          // 색상: 비상 → 빨강, 착륙대기 → 노랑, 상위3 → 하늘, 나머지 → 회색
          const color = uam.isEmergency
            ? '#ef4444'
            : uam.waitingForLanding
              ? '#facc15'
              : isTop3
                ? '#38bdf8'
                : '#94a3b8';

          const glowColor = uam.isEmergency
            ? 'rgba(239,68,68,0.7)'
            : uam.waitingForLanding
              ? 'rgba(250,204,21,0.7)'
              : isTop3
                ? 'rgba(56,189,248,0.5)'
                : 'transparent';

          return (
            <Marker
              key={uam.uamId}
              longitude={uam.longitude}
              latitude={uam.latitude}
              anchor="center"
            >
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  transition: 'all 0.3s ease-out',
                }}
              >
                {/* 순위 + ID 레이블 */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 3,
                    background: 'rgba(0,0,0,0.75)',
                    border: `1px solid ${color}60`,
                    borderRadius: 4,
                    padding: '1px 5px',
                    marginBottom: 3,
                    whiteSpace: 'nowrap',
                  }}
                >
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 900,
                      color,
                    }}
                  >
                    #{rank}
                  </span>
                  <span style={{ fontSize: 9, color: '#e2e8f0' }}>{uam.uamId}</span>
                </div>

                {/* 비행체 삼각형 마커 */}
                <div
                  title={`#${rank} ${uam.uamId} | ${uam.altitude.toFixed(0)}m`}
                  style={{
                    width: size,
                    height: size,
                    backgroundColor: color,
                    clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)',
                    transform: `rotate(${uam.heading ?? 0}deg)`,
                    boxShadow: `0 0 ${isTop3 ? 10 : 5}px ${glowColor}`,
                  }}
                />
              </div>
            </Marker>
          );
        })}
      </Map>

      {/* HUD 오버레이 */}
      <div className="absolute top-3 left-3 z-10 bg-slate-900/85 border border-slate-700 px-3 py-2 rounded-lg text-[10px] font-mono pointer-events-none flex flex-col gap-0.5">
        <span className="text-sky-400 font-bold">PRIORITY QUEUE MAP</span>
        <span className="text-slate-400">
          추적{' '}
          <span className="text-sky-300 font-bold">{uams.length}</span>대 ·{' '}
          <span className="text-amber-400 font-bold">
            {uams.filter((u) => u.waitingForLanding).length}
          </span>
          대 착륙 대기
        </span>
      </div>

      {/* 범례 */}
      <div className="absolute bottom-3 left-3 z-10 bg-slate-900/85 border border-slate-700 px-3 py-2 rounded-lg text-[10px] font-mono pointer-events-none flex flex-col gap-1">
        <LegendItem color="#ef4444" label="비상" />
        <LegendItem color="#facc15" label="착륙 대기" />
        <LegendItem color="#38bdf8" label="우선순위 TOP 3" />
        <LegendItem color="#94a3b8" label="대기열" />
      </div>
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div
        style={{
          width: 8,
          height: 8,
          clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)',
          backgroundColor: color,
          flexShrink: 0,
        }}
      />
      <span style={{ color: '#cbd5e1' }}>{label}</span>
    </div>
  );
}
