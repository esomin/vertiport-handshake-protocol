import { useEffect } from 'react';
import Map, { Layer, Marker, NavigationControl, Source } from 'react-map-gl/maplibre';
import type { LayerProps } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { UamVehicleStatus } from '@uam/types';
import maplibregl from 'maplibre-gl';

const MAPTILER_API_KEY = import.meta.env.VITE_MAPTILER_API_KEY as string;
// const MAP_STYLE = `https://api.maptiler.com/maps/streets-v2/style.json?key=${MAPTILER_API_KEY}`;
const MAP_STYLE = `https://api.maptiler.com/maps/outdoor-v2/style.json?key=${MAPTILER_API_KEY}`;

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

  const _geojson: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: uams.map(a => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [a.longitude, a.latitude] },
      properties: { id: a.uamId, heading: a.heading, altitude: a.altitude }
    }))
  };

  // 기체 아이콘 및 텍스트 레이어 설정
  const _layerStyle: LayerProps = {
    id: 'uam-layer',
    type: 'symbol',
    layout: {
      'icon-image': 'airport',
      'icon-size': 1.5,
      'icon-rotate': ['get', 'heading'], // heading 값에 따라 회전
      'icon-rotation-alignment': 'map',
      'text-field': ['get', 'id'],      // 기체 ID 표시
      'text-offset': [0, 1.5],
      'text-size': 12
    },
    paint: {
      'text-color': '#000000',
      'text-halo-color': '#ffffff',
      'text-halo-width': 1
    }
  };

  return (
    <div className="w-full h-full min-h-[350px] relative bg-slate-950">
      <Map
        mapLib={maplibregl}
        initialViewState={{
          longitude: 126.9780,
          latitude: 37.5665,
          // longitude: 128.4548,
          // latitude: 38.1189, // 지형 테스트 용
          zoom: 11,
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

        {/* <Source id="aircrafts" type="geojson" data={geojson}>
          <Layer {...layerStyle} />
        </Source> */}

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
                    backgroundColor: uam.isEmergency ? '#ef4444' : '#38bdf8',
                    clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)', // 삼각형 모양
                    transform: `rotate(${uam.heading}deg)`, // 방향 반영
                    border: '1px solid white',
                    boxShadow: uam.isEmergency ? '0 0 15px #ef4444' : 'none',
                  }}
                />
              </div>
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
