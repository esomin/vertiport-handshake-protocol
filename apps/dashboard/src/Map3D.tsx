import { useEffect } from 'react';
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

// 서울 주요 버티포트 거점
const VERTIPORTS = [
  { name: '잠실', key: 'jamsil', lat: 37.513, lng: 127.108, isTarget: true },
  { name: '여의도', key: 'yeouido', lat: 37.525, lng: 126.924, isTarget: false },
  { name: '수서', key: 'suseo', lat: 37.488, lng: 127.123, isTarget: false },
];

interface Map3DProps {
  uams: UamVehicleStatus[];
}

export function Map3D({ uams }: Map3DProps) {
  return (
    <div className="w-full h-full min-h-[350px] relative bg-slate-950">
      <Map
        mapLib={maplibregl}
        initialViewState={{
          longitude: 127.100,
          latitude: 37.513,
          zoom: 12,
          bearing: -15,
          pitch: 55,
        }}
        maxPitch={85}
        mapStyle={MAP_STYLE}
        terrain={TERRAIN_SPEC}
        onError={(e) => console.error('Map initialization error:', e)}
      >
        <Source
          id="terrain-source"
          type="raster-dem"
          url={`https://api.maptiler.com/tiles/terrain-rgb-v2/tiles.json?key=${MAPTILER_API_KEY}`}
          tileSize={512}
        />

        <NavigationControl position="top-right" />

        {/* 버티포트 마커 */}
        {VERTIPORTS.map((vp) => (
          <Marker key={vp.key} longitude={vp.lng} latitude={vp.lat} anchor="bottom">
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              {/* 핀 모양 아이콘 */}
              <div
                title={`${vp.name} 버티포트`}
                style={{
                  width: vp.isTarget ? 20 : 14,
                  height: vp.isTarget ? 20 : 14,
                  borderRadius: '50% 50% 50% 0',
                  transform: 'rotate(-45deg)',
                  backgroundColor: vp.isTarget ? '#f97316' : '#a78bfa',
                  border: `2px solid ${vp.isTarget ? '#c2410c' : '#7c3aed'}`,
                }}
              />
              <div
                style={{
                  marginTop: 4,
                  fontSize: vp.isTarget ? 11 : 9,
                  color: vp.isTarget ? '#f97316' : '#c4b5fd',
                  fontWeight: vp.isTarget ? 700 : 400,
                  background: 'rgba(0,0,0,0.6)',
                  padding: '1px 4px',
                  borderRadius: 3,
                  whiteSpace: 'nowrap',
                }}
              >
                {vp.isTarget ? `★ ${vp.name}` : vp.name}
              </div>
            </div>
          </Marker>
        ))}

        {/* UAM 마커 */}
        {uams.map((uam) => {
          const size = 10 + Math.min(uam.altitude / 200, 14); // 고도에 따라 크기 조절
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
                  transition: 'all 0.2s ease-out',
                }}
              >
                <span className="text-[10px] bg-black/60 text-white px-1 rounded mb-1">
                  {uam.uamId}
                </span>

                <div
                  title={`${uam.uamId} | ${uam.altitude.toFixed(0)}m`}
                  style={{
                    width: size,
                    height: size,
                    backgroundColor: uam.waitingForLanding ? '#facc15' : '#38bdf8',
                    clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)', // 삼각형 모양
                    transform: `rotate(${uam.heading}deg)`, // 방향 반영
                    border: '1px solid white',
                    boxShadow: uam.waitingForLanding ? '0 0 15px #facc15' : 'none',
                  }}
                />
              </div>
            </Marker>
          );
        })}
      </Map>

      <div className="absolute top-4 left-4 z-10 bg-slate-900/80 border border-slate-700 p-2 rounded text-xs text-sky-400 font-mono pointer-events-none flex flex-col gap-0.5">
        <span>3D RADAR VIEW ACTIVE</span>
        <span className="text-slate-400">
          TRACKING <span className="text-sky-300 font-bold">{uams.length}</span> / 50 UAM
        </span>
      </div>
    </div>
  );
}
