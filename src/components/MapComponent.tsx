/**
 * Component สำหรับแสดงแผนที่ Mapbox พร้อม markers ของวัตถุที่ตรวจจับได้
 * คลิก marker เพื่อแสดงรายละเอียดใน popup
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import { Box, Button, CircularProgress, IconButton, Stack, TextField, Typography } from '@mui/material';
import { Icon } from '@iconify/react';
import { type DetectedObject } from '../types/detection';
import DetectionPopup from './DetectionPopup';
import 'mapbox-gl/dist/mapbox-gl.css';
// import { getObjectLatitude, getObjectLongitude } from '../utils/objectGeo';

// โหลด Iconify สำหรับใช้ dynamic icons
if (typeof window !== 'undefined') {
  const script = document.createElement('script');
  script.src = 'https://code.iconify.design/3/3.1.0/iconify.min.js';
  if (!document.querySelector('script[src*="iconify"]')) {
    document.head.appendChild(script);
  }
}

// ตำแหน่งพื้นฐานของกล้อง 2 จุด
const LOCATIONS = {
  defence: { lng: 101.166279, lat: 14.297567 },
  offence: { lng: 101.171298, lat: 14.286451 },
};

interface MapComponentProps {
  objects: DetectedObject[];
  imagePath?: string;
  cameraLocation?: string;
  focusPoint?: { lat: number; lng: number } | null;
  defaultLocation?: { lat: number; lng: number };
  onDefaultLocationChange?: (coords: { lat: number; lng: number }) => void;
  detectionRadius?: number;
}

type MarkerDescriptor =
  | {
      type: 'single';
      lat: number;
      lng: number;
      object: DetectedObject;
    }
  | {
      type: 'cluster';
      lat: number;
      lng: number;
      objects: DetectedObject[];
    };

type TargetMarkerDescriptor = {
  lat: number;
  lng: number;
  object: DetectedObject;
};

type SearchSuggestion = {
  id: string;
  label: string;
  center: [number, number];
};

type LatLng = {
  lat: number;
  lng: number;
};

const toOptionalNumber = (value?: number | string | null): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const distanceBetween = (lat1: number, lng1: number, lat2: number, lng2: number) => {
  const dLat = lat1 - lat2;
  const dLng = lng1 - lng2;
  return Math.sqrt(dLat * dLat + dLng * dLng);
};

const getPrimaryCoordinates = (object: DetectedObject): LatLng | null => {
  const raw = object as unknown as Record<string, unknown>;
  const lat = toOptionalNumber((raw.lat as number | string | null) ?? (raw.latitude as number | string | null) ?? null);
  const lng = toOptionalNumber(
    (raw.lng as number | string | null) ??
      (raw.long as number | string | null) ??
      (raw.lon as number | string | null) ??
      null,
  );
  if (lat === null || lng === null) return null;
  return { lat, lng };
};

const EARTH_RADIUS_METERS = 6371000;

const getMarkerDescriptors = (items: DetectedObject[], zoom: number): MarkerDescriptor[] => {
  if (items.length === 0) return [];
  if (zoom >= 15) {
    return items
      .map((object) => {
        const coords = getPrimaryCoordinates(object);
        if (!coords) return null;
        return {
          type: 'single' as const,
          lat: coords.lat,
          lng: coords.lng,
          object,
        };
      })
      .filter(Boolean) as MarkerDescriptor[];
  }

  const tolerance = zoom >= 13 ? 0.002 : zoom >= 11 ? 0.004 : 0.01;
  const clusters: Array<{ lat: number; lng: number; objects: DetectedObject[] }> = [];

  items.forEach((object) => {
    const coords = getPrimaryCoordinates(object);
    if (!coords) return;
    const { lat, lng } = coords;

    const cluster = clusters.find((item) => distanceBetween(item.lat, item.lng, lat, lng) < tolerance);
    if (cluster) {
      cluster.objects.push(object);
      const total = cluster.objects.length;
      cluster.lat = cluster.lat + (lat - cluster.lat) / total;
      cluster.lng = cluster.lng + (lng - cluster.lng) / total;
    } else {
      clusters.push({ lat, lng, objects: [object] });
    }
  });

  return clusters.map((cluster) =>
    cluster.objects.length === 1
      ? {
          type: 'single',
          lat: cluster.lat,
          lng: cluster.lng,
          object: cluster.objects[0],
        }
      : {
          type: 'cluster',
          lat: cluster.lat,
          lng: cluster.lng,
          objects: cluster.objects,
        },
  );
};

const createCirclePolygon = (center: { lat: number; lng: number }, radiusMeters: number, steps = 64) => {
  const coords: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * 2 * Math.PI;
    const dx = (radiusMeters / EARTH_RADIUS_METERS) * Math.cos(angle);
    const dy = (radiusMeters / EARTH_RADIUS_METERS) * Math.sin(angle);
    const lat = center.lat + (dy * 180) / Math.PI;
    const lng = center.lng + ((dx * 180) / Math.PI) / Math.cos((center.lat * Math.PI) / 180);
    coords.push([lng, lat]);
  }
  return coords;
};

const MapComponent = ({
  objects,
  imagePath,
  cameraLocation,
  focusPoint,
  defaultLocation,
  onDefaultLocationChange,
  detectionRadius,
}: MapComponentProps) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markers = useRef<mapboxgl.Marker[]>([]);
  const targetMarkers = useRef<mapboxgl.Marker[]>([]);
  const selectedMarkerRef = useRef<HTMLDivElement | null>(null);
  const defaultMarkerRef = useRef<mapboxgl.Marker | null>(null);

  const [selectedObject, setSelectedObject] = useState<DetectedObject | null>(null);
  const [cardPosition, setCardPosition] = useState<{ x: number; y: number } | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const [currentZoom, setCurrentZoom] = useState(17);
  const fallbackLocation = useMemo(
    () => (cameraLocation === 'offence' ? LOCATIONS.offence : LOCATIONS.defence),
    [cameraLocation],
  );
  const [defaultCoordinates, setDefaultCoordinates] = useState<LatLng>(defaultLocation ?? fallbackLocation);
  const [showDefaultInfo, setShowDefaultInfo] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [searchFeedback, setSearchFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [searchOptions, setSearchOptions] = useState<SearchSuggestion[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchOpen, setSearchOpen] = useState(true);
  const [shouldAutoFit, setShouldAutoFit] = useState(true);
  const [isMapReady, setIsMapReady] = useState(false);

  const markerDescriptors = useMemo(
    () => getMarkerDescriptors(objects, currentZoom),
    [objects, currentZoom],
  );

  const targetDescriptors = useMemo<TargetMarkerDescriptor[]>(() => {
    return objects
      .map((object) => {
        const telemetry = object.details ?? null;
        const lat = toOptionalNumber(telemetry?.tar_lat ?? null);
        const lng = toOptionalNumber(telemetry?.tar_lng ?? telemetry?.tar_long ?? null);
        if (lat === null || lng === null) return null;
        return { lat, lng, object };
      })
      .filter(Boolean) as TargetMarkerDescriptor[];
  }, [objects]);

  useEffect(() => {
    if (defaultLocation) {
      setDefaultCoordinates(defaultLocation);
    }
  }, [defaultLocation?.lat, defaultLocation?.lng]);

  useEffect(() => {
    if (!defaultLocation) {
      setDefaultCoordinates(fallbackLocation);
    }
  }, [defaultLocation, fallbackLocation]);

  mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

  // หาจุดกึ่งกลางแผนที่ตาม camera location
  const getMapCenter = () => {
    const center = defaultCoordinates ?? fallbackLocation;
    return [center.lng, center.lat] as [number, number];
  };

  // หา icon name ตามประเภทวัตถุ
  const getIconName = (type: string): string => {
    const iconMap: Record<string, string> = {
      person: 'mdi:account',
      car: 'mdi:car',
      truck: 'mdi:truck',
      bike: 'mdi:bike',
      drone: 'healthicons:drone',
      default: 'mdi:map-marker',
    };
    return iconMap[type.toLowerCase()] || iconMap.default;
  };

  // สร้างสีจาก object ID (แต่ละ ID จะได้สีไม่ซ้ำกัน)
  const getColorForObjectId = (objectId: string): string => {
    const colors = [
      '#FF5722', '#2196F3', '#4CAF50', '#FFC107', '#9C27B0',
      '#00BCD4', '#E91E63', '#FF9800', '#009688', '#F44336',
      '#3F51B5', '#8BC34A', '#FFEB3B', '#673AB7', '#00E676',
    ];

    let hash = 0;
    for (let i = 0; i < objectId.length; i++) {
      hash = objectId.charCodeAt(i) + ((hash << 5) - hash);
    }

    const index = Math.abs(hash) % colors.length;
    return colors[index];
  };

  const createOrUpdateDefaultMarker = () => {
    if (!map.current) return;

    const center = defaultCoordinates ?? fallbackLocation;
    const [lng, lat] = [center.lng, center.lat];
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    defaultMarkerRef.current?.remove();

    const markerEl = document.createElement('div');
    markerEl.className = 'default-location-marker';
    markerEl.style.cssText = `
      position: relative;
      width: 28px;
      height: 28px;
      cursor: pointer;
    `;

    const core = document.createElement('div');
    core.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      transform: translate(-50%, -50%);
      background-color: #1e88e5;
      border: 2px solid #ffffff;
      box-shadow: 0 2px 6px rgba(0,0,0,0.3);
    `;

    const pulse = document.createElement('div');
    pulse.style.cssText = `
      position: absolute;
      width: 48px;
      height: 48px;
      border-radius: 50%;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background-color: rgba(30, 136, 229, 0.35);
      animation: pulse 2.4s ease-out infinite;
      pointer-events: none;
    `;

    markerEl.appendChild(pulse);
    markerEl.appendChild(core);

    markerEl.addEventListener('click', (e) => {
      e.stopPropagation();
      setShowDefaultInfo(true);
      map.current?.flyTo({
        center: [lng, lat],
        zoom: Math.max(map.current?.getZoom() ?? 0, 17),
        duration: 800,
      });
    });

    const marker = new mapboxgl.Marker({ element: markerEl, draggable: true })
      .setLngLat([lng, lat])
      .addTo(map.current);

    marker.on('dragend', () => {
      const lngLat = marker.getLngLat();
      const coords = { lat: lngLat.lat, lng: lngLat.lng };
      setDefaultCoordinates(coords);
      setShowDefaultInfo(true);
      onDefaultLocationChange?.(coords);
    });

    defaultMarkerRef.current = marker;
  };

  useEffect(() => {
    if (!isMapReady) return;
    createOrUpdateDefaultMarker();
  }, [isMapReady, defaultCoordinates]);

  const handleRecenter = () => {
    if (!map.current || !defaultCoordinates) return;
    map.current.flyTo({
      center: [defaultCoordinates.lng, defaultCoordinates.lat],
      zoom: 17,
      duration: 700,
    });
  };

  const handleResetView = () => {
    setShouldAutoFit(true);
    fitToAllPoints();
  };

  const handleSearchLocation = async () => {
    const query = searchValue.trim();
    if (!query) {
      setSearchFeedback({ type: 'error', message: 'Please enter a location.' });
      return;
    }

    try {
      const token = mapboxgl.accessToken;
      if (!token) throw new Error('Missing Mapbox access token');

      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${token}&limit=1`,
      );
      if (!response.ok) throw new Error('Unable to search location');
      const data = await response.json();
      const feature = data.features?.[0];
      if (!feature) {
        setSearchFeedback({ type: 'error', message: 'Location not found.' });
        return;
      }

      const [lng, lat] = feature.center;
      map.current?.flyTo({
        center: [lng, lat],
        zoom: 16,
        duration: 900,
      });
      setSearchValue(feature.place_name ?? query);
      setSearchOptions([]);
      setSearchFeedback({ type: 'success', message: feature.place_name ?? 'Location found.' });
    } catch (error) {
      setSearchFeedback({
        type: 'error',
        message: error instanceof Error ? error.message : 'Search failed.',
      });
    }
  };

  const handleSelectSuggestion = (option: SearchSuggestion) => {
    setSearchValue(option.label);
    setSearchOptions([]);
    map.current?.flyTo({
      center: option.center,
      zoom: 16,
      duration: 900,
    });
    setSearchFeedback({ type: 'success', message: option.label });
  };

  useEffect(() => {
    if (!showDefaultInfo) return;
    const timer = setTimeout(() => setShowDefaultInfo(false), 4000);
    return () => clearTimeout(timer);
  }, [showDefaultInfo]);

  useEffect(() => {
    if (!searchFeedback) return;
    const timer = setTimeout(() => setSearchFeedback(null), 3500);
    return () => clearTimeout(timer);
  }, [searchFeedback]);

  useEffect(() => {
    const query = searchValue.trim();
    if (query.length < 3) {
      setSearchOptions([]);
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      try {
        setSearchLoading(true);
        const token = mapboxgl.accessToken;
        if (!token) throw new Error('Missing Mapbox access token');
        const response = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${token}&limit=5`,
          { signal: controller.signal },
        );
        if (!response.ok) throw new Error('Unable to fetch suggestions');
        const data = await response.json();
        const options =
          data.features?.map((feature: any) => ({
            id: feature.id,
            label: feature.place_name,
            center: feature.center as [number, number],
          })) ?? [];
        setSearchOptions(options);
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error(error);
        }
      } finally {
        if (!controller.signal.aborted) {
          setSearchLoading(false);
        }
      }
    }, 350);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [searchValue]);

  useEffect(() => {
    if (!isMapReady || !map.current) return;
    const sourceId = 'detection-radius-source';
    const fillId = 'detection-radius-fill';
    const outlineId = 'detection-radius-outline';

    const updateEmpty = () => {
      const existing = map.current?.getSource(sourceId) as mapboxgl.GeoJSONSource | undefined;
      if (existing) {
        existing.setData({ type: 'FeatureCollection', features: [] });
      }
    };

    if (!defaultCoordinates || !detectionRadius || detectionRadius <= 0) {
      updateEmpty();
      return;
    }

    const polygon = createCirclePolygon(defaultCoordinates, detectionRadius);
    const outlineColor = '#ff6f00';
    const fillColor = 'rgba(255, 152, 0, 0.15)';
    const data = {
      type: 'FeatureCollection' as const,
      features: [
        {
          type: 'Feature' as const,
          geometry: {
            type: 'Polygon' as const,
            coordinates: [polygon],
          },
          properties: {},
        },
      ],
    };

    const existingSource = map.current.getSource(sourceId) as mapboxgl.GeoJSONSource | undefined;

    if (!existingSource) {
      map.current.addSource(sourceId, { type: 'geojson', data });
      map.current.addLayer({
        id: fillId,
        type: 'fill',
        source: sourceId,
        paint: {
          'fill-color': fillColor,
        },
      });
      map.current.addLayer({
        id: outlineId,
        type: 'line',
        source: sourceId,
        paint: {
          'line-color': outlineColor,
          'line-opacity': 0.9,
          'line-width': detectionRadius < 500 ? 1.5 : 2.5,
        },
      });
    } else {
      existingSource.setData(data);
    }
  }, [defaultCoordinates, detectionRadius, isMapReady]);

  const handleClose = () => {
    setSelectedObject(null);
    setCardPosition(null);
    selectedMarkerRef.current = null;
  };

  useEffect(() => {
    if (!selectedObject) return;

    const stillVisible = markerDescriptors.some(
      (descriptor) => descriptor.type === 'single' && descriptor.object.obj_id === selectedObject.obj_id,
    );

    if (!stillVisible) {
      handleClose();
    }
  }, [markerDescriptors, selectedObject]);

  // สร้างแผนที่ (run ครั้งเดียวตอน mount)
  useEffect(() => {
    if (!mapContainer.current) return;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/satellite-streets-v12',
      center: getMapCenter() as [number, number],
      zoom: 17,
    });

    const handleZoomChange = () => {
      if (map.current) setCurrentZoom(map.current.getZoom());
    };

    const disableAutoFit = () => setShouldAutoFit(false);

    map.current.on('load', () => {
      setIsMapReady(true);
      createOrUpdateDefaultMarker();
      handleZoomChange();
    });
    map.current.on('zoomend', handleZoomChange);
    map.current.on('dragstart', disableAutoFit);
    map.current.on('zoomstart', disableAutoFit);
    map.current.on('rotatestart', disableAutoFit);

    return () => {
      map.current?.off('zoomend', handleZoomChange);
      map.current?.off('dragstart', disableAutoFit);
      map.current?.off('zoomstart', disableAutoFit);
      map.current?.off('rotatestart', disableAutoFit);
      if (map.current?.getLayer('detection-radius-fill')) {
        map.current.removeLayer('detection-radius-fill');
      }
      if (map.current?.getLayer('detection-radius-outline')) {
        map.current.removeLayer('detection-radius-outline');
      }
      if (map.current?.getSource('detection-radius-source')) {
        map.current.removeSource('detection-radius-source');
      }
      if (map.current?.getLayer('drone-target-lines-layer')) {
        map.current.removeLayer('drone-target-lines-layer');
      }
      if (map.current?.getLayer('drone-target-points-layer')) {
        map.current.removeLayer('drone-target-points-layer');
      }
      if (map.current?.getSource('drone-target-lines')) {
        map.current.removeSource('drone-target-lines');
      }
      if (map.current?.getSource('drone-target-points')) {
        map.current.removeSource('drone-target-points');
      }
      defaultMarkerRef.current?.remove();
      defaultMarkerRef.current = null;
      map.current?.remove();
    };
  }, []);

  // อัพเดทจุดกึ่งกลางแผนที่เมื่อ camera location เปลี่ยน
  useEffect(() => {
    if (map.current && cameraLocation) {
      map.current.flyTo({
        center: getMapCenter() as [number, number],
        zoom: 17,
        duration: 1000,
      });
    }
  }, [cameraLocation]);

  // สร้าง markers สำหรับวัตถุทั้งหมด
  useEffect(() => {

    if (!map.current) return;



    const syncPopupPosition = (el: HTMLDivElement) => {

      requestAnimationFrame(() => {

        const rect = el.getBoundingClientRect();

        setCardPosition({

          x: rect.left + rect.width / 2,

          y: rect.top,

        });

      });

    };



    markers.current.forEach((marker) => marker.remove());

    markers.current = [];



    if (markerDescriptors.length === 0) {

      selectedMarkerRef.current = null;

      setCardPosition(null);

      return;

    }



    markerDescriptors.forEach((descriptor) => {

      if (descriptor.type === 'cluster') {

        const clusterEl = document.createElement('div');

        clusterEl.className = 'cluster-marker';

        clusterEl.style.cssText = `
          width: 50px;
          height: 50px;
          border-radius: 50%;
          background-color: rgba(25, 118, 210, 0.9);
          color: white;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          border: 3px solid #ffffff;
          box-shadow: 0 4px 10px rgba(0,0,0,0.35);
          cursor: pointer;
          font-weight: 600;
          gap: 2px;
        `;

        const count = document.createElement('div');

        count.textContent = String(descriptor.objects.length);

        count.style.fontSize = '15px';



        const label = document.createElement('div');

        label.textContent = 'objects';

        label.style.fontSize = '9px';

        label.style.fontWeight = '400';



        clusterEl.appendChild(count);

        clusterEl.appendChild(label);



        clusterEl.addEventListener('click', (e) => {

          e.stopPropagation();

          if (!map.current) return;

          const nextZoom = Math.min((map.current.getZoom() ?? 0) + 2, 19);

          map.current.easeTo({

            center: [descriptor.lng, descriptor.lat],

            zoom: nextZoom,

            duration: 600,

          });

        });



        const clusterMarker = new mapboxgl.Marker(clusterEl)

          .setLngLat([descriptor.lng, descriptor.lat])

          .addTo(map.current!);



        markers.current.push(clusterMarker);

        return;

      }



      const obj = descriptor.object;

      const color = getColorForObjectId(obj.obj_id);

      const iconName = getIconName(obj.type);



      const el = document.createElement('div');

      el.className = 'marker';

      el.style.cssText = `
        position: relative;
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
      `;

      const pulseCircle = document.createElement('div');

      pulseCircle.className = 'pulse-circle';

      pulseCircle.style.cssText = `
        position: absolute;
        width: 60px;
        height: 60px;
        border-radius: 50%;
        background-color: ${color};
        opacity: 0.4;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        animation: pulse 2s ease-out infinite;
        pointer-events: none;
      `;

      const iconContainer = document.createElement('div');

      iconContainer.className = 'iconify-marker';

      iconContainer.style.cssText = `
        cursor: pointer;
        position: relative;
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        background-color: white;
        border-radius: 50%;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        border: 3px solid ${color};
      `;

      const iconElement = document.createElement('span');

      iconElement.className = 'iconify';

      iconElement.setAttribute('data-icon', iconName);

      iconElement.style.cssText = `
        color: ${color};
        font-size: 24px;
      `;



      iconContainer.appendChild(iconElement);

      el.appendChild(pulseCircle);

      el.appendChild(iconContainer);



      el.addEventListener('click', (e) => {
        e.stopPropagation();
        if (selectedObject?.obj_id === obj.obj_id) {
          handleClose();
          return;
        }
        setSelectedObject(obj);
        selectedMarkerRef.current = el;
        const rect = el.getBoundingClientRect();
        setCardPosition({
          x: rect.left + rect.width / 2,
          y: rect.top,
        });
      });  


      const marker = new mapboxgl.Marker(el)

        .setLngLat([descriptor.lng, descriptor.lat])

        .addTo(map.current!);



      markers.current.push(marker);



      if (selectedObject?.obj_id === obj.obj_id) {

        selectedMarkerRef.current = el;

        syncPopupPosition(el);

      }

    });

  }, [markerDescriptors, imagePath, selectedObject]);

  useEffect(() => {
    if (!map.current || !focusPoint) return;

    map.current.flyTo({
      center: [focusPoint.lng, focusPoint.lat],
      zoom: Math.max(map.current.getZoom(), 17.5),
      duration: 1200,
    });
  }, [focusPoint]);

  useEffect(() => {
    if (!map.current) return;

    targetMarkers.current.forEach((marker) => marker.remove());
    targetMarkers.current = [];

    if (!isMapReady || targetDescriptors.length === 0) return;

    targetDescriptors.forEach(({ lat, lng, object }) => {
      const el = document.createElement('div');
      el.className = 'target-waypoint-marker';
      el.style.cssText = `
        width: 32px;
        height: 32px;
        border-radius: 8px;
        background-color: rgba(255, 193, 7, 0.95);
        border: 2px solid #ff6f00;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 2px 8px rgba(0,0,0,0.35);
      `;
      el.title = `Waypoint for ${object.obj_id}`;

      const icon = document.createElement('span');
      icon.className = 'iconify';
      icon.setAttribute('data-icon', 'mdi:crosshairs-gps');
      icon.style.cssText = `
        color: #5d4037;
        font-size: 18px;
      `;

      el.appendChild(icon);

      const marker = new mapboxgl.Marker(el).setLngLat([lng, lat]).addTo(map.current!);
      targetMarkers.current.push(marker);
    });

    return () => {
      targetMarkers.current.forEach((marker) => marker.remove());
      targetMarkers.current = [];
    };
  }, [isMapReady, targetDescriptors]);

  const fitToAllPoints = useCallback(
    (withAnimation = true) => {
      if (!isMapReady || !map.current) return;
      const points: LatLng[] = [];
      if (defaultCoordinates) points.push(defaultCoordinates);
      markerDescriptors.forEach((descriptor) => {
        points.push({ lat: descriptor.lat, lng: descriptor.lng });
      });

      if (points.length === 0) return;

      if (points.length === 1) {
        map.current.flyTo({
          center: [points[0].lng, points[0].lat],
          zoom: Math.max(map.current.getZoom() ?? 0, 16),
          duration: withAnimation ? 600 : 0,
        });
        return;
      }

      const bounds = new mapboxgl.LngLatBounds(
        [points[0].lng, points[0].lat],
        [points[0].lng, points[0].lat],
      );
      points.slice(1).forEach((pt) => bounds.extend([pt.lng, pt.lat]));
      map.current.fitBounds(bounds, { padding: 80, duration: withAnimation ? 800 : 0, maxZoom: 17.5 });
    },
    [isMapReady, markerDescriptors, defaultCoordinates],
  );

  useEffect(() => {
    if (shouldAutoFit) {
      fitToAllPoints();
    }
  }, [shouldAutoFit, fitToAllPoints]);

  // อัพเดทตำแหน่ง popup เมื่อแผนที่เลื่อนหรือ zoom
  useEffect(() => {
    if (!map.current || !selectedMarkerRef.current) return;

    const updateCardPosition = () => {
      if (selectedMarkerRef.current) {
        const rect = selectedMarkerRef.current.getBoundingClientRect();
        let x = rect.left + rect.width / 2;
        let y = rect.top;
        const popupEl = popupRef.current;
        if (popupEl) {
          const popupRect = popupEl.getBoundingClientRect();
          const margin = 12;
          if (x - popupRect.width / 2 < margin) {
            x = popupRect.width / 2 + margin;
          }
          if (x + popupRect.width / 2 > window.innerWidth - margin) {
            x = window.innerWidth - popupRect.width / 2 - margin;
          }
          if (y - popupRect.height < margin) {
            y = popupRect.height + margin;
          }
        }
        setCardPosition({ x, y });
      }
    };

    map.current.on('move', updateCardPosition);
    map.current.on('zoom', updateCardPosition);

    return () => {
      map.current?.off('move', updateCardPosition);
      map.current?.off('zoom', updateCardPosition);
    };
  }, [selectedObject]);

  return (
    <Box sx={{ position: 'relative', height: '100%', width: '100%' }}>
      {/* CSS Animation สำหรับ pulse effect */}
      <style>
        {`
          @keyframes pulse {
            0% {
              transform: translate(-50%, -50%) scale(0.5);
              opacity: 0.8;
            }
            50% {
              transform: translate(-50%, -50%) scale(1.2);
              opacity: 0.4;
            }
            100% {
              transform: translate(-50%, -50%) scale(1.8);
              opacity: 0;
            }
          }
        `}
      </style>

      {/* Container ของแผนที่ */}
      <Box
        ref={mapContainer}
        sx={{
          height: '100%',
          width: '100%',
          borderRadius: 1,
          overflow: 'hidden',
        }}
      />

      <Box
        sx={{
          position: 'absolute',
          top: 12,
          left: 12,
          zIndex: 3,
        }}
      >
        {!searchOpen ? (
          <Button
            size="small"
            variant="contained"
            startIcon={<Icon icon="mdi:magnify" />}
            onClick={() => setSearchOpen(true)}
            sx={{ textTransform: 'none' }}
          >
            Search
          </Button>
        ) : (
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              gap: 1,
              bgcolor: (theme) => theme.palette.background.paper,
              borderRadius: 1,
              boxShadow: 2,
              p: 1.5,
              minWidth: { xs: 240, sm: 320 },
            }}
          >
            <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
              <Typography variant="subtitle2" fontWeight={600}>
                Search & controls
              </Typography>
              <IconButton size="small" onClick={() => setSearchOpen(false)}>
                <Icon icon="mdi:close" width={18} />
              </IconButton>
            </Stack>
            <Stack spacing={1}>
              <TextField
                size="small"
                label="Search location"
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSearchLocation();
                }}
                InputProps={{
                  endAdornment: searchLoading ? <CircularProgress size={16} sx={{ mr: 1 }} /> : undefined,
                }}
                sx={{ width: '100%' }}
              />
              <Stack direction="row" spacing={1} flexWrap="wrap">
                <Button
                  variant="contained"
                  size="small"
                  onClick={handleSearchLocation}
                  sx={{ textTransform: 'none', flex: 1 }}
                >
                  Search
                </Button>
                <Button variant="outlined" size="small" onClick={handleRecenter} sx={{ textTransform: 'none' }}>
                  Re-center
                </Button>
                <Button variant="outlined" size="small" onClick={handleResetView} sx={{ textTransform: 'none' }}>
                  Reset view
                </Button>
              </Stack>

              {defaultCoordinates && (
                <Typography variant="caption" color="text.secondary">
                  Default marker: lat {defaultCoordinates.lat.toFixed(5)} • lng {defaultCoordinates.lng.toFixed(5)}
                </Typography>
              )}

              {searchFeedback && (
                <Typography
                  variant="caption"
                  color={searchFeedback.type === 'error' ? 'error.main' : 'success.main'}
                >
                  {searchFeedback.message}
                </Typography>
              )}

              {searchOptions.length > 0 && (
                <Box
                  sx={{
                    maxHeight: 200,
                    overflowY: 'auto',
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 1,
                    bgcolor: (theme) => theme.palette.background.paper,
                  }}
                >
                  {searchOptions.map((option) => (
                    <Box
                      key={option.id}
                      onClick={() => handleSelectSuggestion(option)}
                      sx={{
                        px: 1.5,
                        py: 1,
                        cursor: 'pointer',
                        '&:hover': { bgcolor: 'action.hover' },
                      }}
                    >
                      <Typography variant="body2">{option.label}</Typography>
                    </Box>
                  ))}
                </Box>
              )}
            </Stack>
          </Box>
        )}
      </Box>

      {showDefaultInfo && defaultCoordinates && (
        <Box
          sx={{
            position: 'absolute',
            bottom: 16,
            right: 16,
            zIndex: 2,
            bgcolor: (theme) => theme.palette.background.paper,
            borderRadius: 1,
            boxShadow: 3,
            px: 2,
            py: 1.5,
            minWidth: 200,
          }}
        >
          <Typography variant="caption" color="text.secondary">
            Default coordinates
          </Typography>
          <Typography variant="body2" fontWeight={600}>
            Lat: {defaultCoordinates.lat.toFixed(6)}
          </Typography>
          <Typography variant="body2" fontWeight={600}>
            Lng: {defaultCoordinates.lng.toFixed(6)}
          </Typography>
        </Box>
      )}

      {/* Detection Popup */}
      {selectedObject && cardPosition && (
        <Box
          ref={popupRef}
          sx={{
            position: 'fixed',
            left: cardPosition.x,
            top: cardPosition.y,
            transform: 'translate(-50%, -100%)',
            zIndex: 9999,
            mb: 1,
            maxWidth: '90vw',
          }}
        >
          {/* ปุ่มปิด popup */}
          <IconButton
            onClick={handleClose}
            sx={{
              position: 'absolute',
              top: 8,
              right: 8,
              backgroundColor: 'rgba(0, 0, 0, 0.6)',
              color: 'white',
              zIndex: 1,
              '&:hover': {
                backgroundColor: 'rgba(0, 0, 0, 0.8)',
              },
            }}
          >
            <Icon icon="mdi:close" width={16} />
          </IconButton>

          <DetectionPopup object={selectedObject} imagePath={imagePath} />
        </Box>
      )}
    </Box>
  );
};

export default MapComponent;
