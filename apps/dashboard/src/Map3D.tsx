import { useEffect } from 'react';
import Map, { Marker, NavigationControl, Source } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { UamVehicleStatus } from '@uam/types';
import maplibregl from 'maplibre-gl';

const MAPTILER_API_KEY = import.meta.env.VITE_MAPTILER_API_KEY as string;
const MAP_STYLE = `https://api.maptiler.com/maps/outdoor-v2/style.json?key=${MAPTILER_API_KEY}`;
// const MAP_STYLE = `https://api.maptiler.com/maps/hybrid/style.json?key=${MAPTILER_API_KEY}`;

const TERRAIN_SPEC = {
  source: 'terrain-source',
  exaggeration: 2.0,
};

interface Map3DProps {
  uams: UamVehicleStatus[];
}

export function Map3D({ uams }: Map3DProps) {
  useEffect(() => {
    console.log('Map3D component mounted');
  }, []);

  return (
    <div className="w-full h-full min-h-[350px] relative bg-slate-950">
      <Map
        mapLib={maplibregl}
        initialViewState={{
          longitude: 126.9780,
          latitude: 37.5665,
          // longitude: 128.4548,
          // latitude: 38.1189, // 지형 테스트 용
          zoom: 12,
          bearing: -20,
          pitch: 60,
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

        {/* UAM 마커 */}
        {uams.map((uam) => {
          const size = 10 + Math.min(uam.altitude / 50, 14);
          return (
            <Marker
              key={uam.uamId}
              longitude={uam.longitude}
              latitude={uam.latitude}
              anchor="center"
            >
              <div
                title={`${uam.uamId} | ${uam.altitude.toFixed(0)}m | 🔋${uam.batteryPercent.toFixed(0)}%`}
                style={{
                  width: size,
                  height: size,
                  borderRadius: '50%',
                  backgroundColor: uam.isEmergency ? '#ef4444' : '#38bdf8',
                  border: '2px solid white',
                  boxShadow: uam.isEmergency
                    ? '0 0 10px 4px rgba(239,68,68,0.8)'
                    : '0 0 6px 2px rgba(56,189,248,0.5)',
                }}
              />
            </Marker>
          );
        })}
      </Map>

      <div className="absolute top-4 left-4 z-10 bg-slate-900/80 border border-slate-700 p-2 rounded text-xs text-sky-400 font-mono pointer-events-none">
        3D RADAR VIEW ACTIVE
      </div>
    </div>
  );
}
