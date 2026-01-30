import { useEffect } from 'react';
import Map from 'react-map-gl/maplibre';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

const MAP_STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

export function Map3D() {
  useEffect(() => {
    console.log("Map3D component mounted");
  }, []);

  const onMapLoad = (e: any) => {
    console.log("Map source/style loaded");
    const map = e.target;

    try {
      // 1. 지형 데이터 소스 추가 
      if (!map.getSource('terrainSource')) {
        map.addSource('terrainSource', {
          type: 'raster-dem',
          url: 'https://demotiles.maplibre.org/terrain-tiles/tiles.json',
          tileSize: 256,
          encoding: 'terrarium'
        });
      }

      // 2. 지형 활성화
      map.setTerrain({ source: 'terrainSource', exaggeration: 1.5 });

      // 3. 3D 건물 레이어 (스타일에 openmaptiles 소스가 있는 경우에만 안전하게 추가)
      if (map.getSource('openmaptiles') && !map.getLayer('3d-buildings')) {
        map.addLayer({
          id: '3d-buildings',
          source: 'openmaptiles',
          'source-layer': 'building',
          type: 'fill-extrusion',
          paint: {
            'fill-extrusion-color': '#333',
            'fill-extrusion-height': ['get', 'render_height'],
            'fill-extrusion-base': ['get', 'render_min_height'],
            'fill-extrusion-opacity': 0.6
          }
        });
      }
    } catch (err) {
      console.error("Error setting up map features:", err);
    }
  };

  return (
    <div className="w-full h-full min-h-[350px] relative bg-slate-950">
      <Map
        mapLib={maplibregl}
        initialViewState={{
          longitude: 126.9780,
          latitude: 37.5665,
          zoom: 14,
          pitch: 60,
          bearing: -20
        }}
        style={{ width: '100%', height: '100%' }}
        mapStyle={MAP_STYLE}
        onLoad={onMapLoad}
        onError={(e) => console.error("Map initialization error:", e)}
      />
      <div className="absolute top-4 left-4 z-10 bg-slate-900/80 border border-slate-700 p-2 rounded text-xs text-sky-400 font-mono pointer-events-none">
        3D RADAR VIEW ACTIVE
      </div>
    </div>
  );
}