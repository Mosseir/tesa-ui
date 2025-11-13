import { Card, CardContent, Typography, Box, Stack } from '@mui/material';
import { Icon } from '@iconify/react';
import { type DetectedObject } from '../types/detection';
import ImageViewer from './ImageViewer';
import { getObjectLatitude, getObjectLongitude } from '../utils/objectGeo';

interface DetectionPopupProps {
  object: DetectedObject;
  imagePath?: string;
}

const formatCoordinate = (value: number | string | null | undefined) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value.toFixed(6);
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed.toFixed(6) : 'N/A';
  }
  return 'N/A';
};

const DetectionPopup = ({ object, imagePath }: DetectionPopupProps) => {
  const baseUrl = import.meta.env.VITE_API_BASE_URL?.replace('/api', '') ?? '';
  const imageUrl = imagePath && baseUrl ? `${baseUrl}${imagePath}` : null;
  const detail = object.details ?? object.detail;
  const speed = typeof detail?.speed === 'number' ? detail.speed : null;
  const altitude = typeof detail?.alt === 'number' ? detail.alt : null;
  const lat = getObjectLatitude(object);
  const lng = getObjectLongitude(object);

  const getObjectIcon = (type: string): string => {
    const iconMap: Record<string, string> = {
      person: 'mdi:account',
      vehicle: 'mdi:car',
      car: 'mdi:car',
      truck: 'mdi:truck',
      bicycle: 'mdi:bike',
      bike: 'mdi:bike',
      motorcycle: 'mdi:motorbike',
      drone: 'mdi:drone',
      default: 'mdi:map-marker',
    };

    return iconMap[type.toLowerCase()] || iconMap.default;
  };

  return (
    <Card sx={{ minWidth: 280 }}>
      {imageUrl && (
        <ImageViewer src={imageUrl} alt="Detection" width="100%" height={150} objectFit="cover" />
      )}

      <CardContent sx={{ p: 2 }}>
        <Stack spacing={1.25}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Icon icon={getObjectIcon(object.type)} width={20} />
            <Typography variant="subtitle2" fontWeight="bold">
              {object.obj_id}
            </Typography>
          </Stack>

          <Stack direction="row" spacing={1} alignItems="center">
            <Icon icon="mdi:tag" width={18} />
            <Typography variant="body2" color="text.secondary">
              Type: {object.type}
            </Typography>
          </Stack>

          <Stack direction="row" spacing={1} alignItems="center">
            <Icon icon="mdi:bullseye-arrow" width={18} />
            <Typography variant="body2" color="text.secondary">
              Objective: {object.objective}
            </Typography>
          </Stack>

          <Stack direction="row" spacing={1} alignItems="center">
            <Icon icon="mdi:speedometer" width={18} />
            <Typography variant="body2" color="text.secondary">
              Speed: {speed !== null ? `${speed.toFixed(1)} m/s` : 'N/A'}
            </Typography>
          </Stack>

          <Stack direction="row" spacing={1} alignItems="center">
            <Icon icon="mdi:airplane-takeoff" width={18} />
            <Typography variant="body2" color="text.secondary">
              Attitude: {altitude !== null ? `${altitude.toFixed(1)} m` : 'N/A'}
            </Typography>
          </Stack>

          <Stack direction="row" spacing={1} alignItems="flex-start">
            <Icon icon="mdi:map-marker" width={18} style={{ marginTop: 2 }} />
            <Box>
              <Typography variant="caption" color="text.secondary" display="block">
                Lat: {formatCoordinate(lat)}
              </Typography>
              <Typography variant="caption" color="text.secondary" display="block">
                Lng: {formatCoordinate(lng)}
              </Typography>
            </Box>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
};

export default DetectionPopup;
