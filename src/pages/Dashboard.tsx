import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
  Grid,
  Typography,
  TextField,
  Tabs,
  Tab,
} from '@mui/material';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import dayjs, { type Dayjs } from 'dayjs';
import { Icon } from '@iconify/react';
import { alpha } from '@mui/material/styles';
import MapComponent from '../components/MapComponent';
import DetectionCard from '../components/DetectionCard';
import ImageViewer from '../components/ImageViewer';
import { useDetections } from '../hooks/useDetections';
import { useSocket } from '../hooks/useSocket';
import { droneProfiles } from '../config/droneProfiles';
import { type DetectionEvent, type DetectedObject } from '../types/detection';

type UseDroneFeedResult = {
  events: DetectionEvent[];
  isLoading: boolean;
  error: unknown;
  isConnected: boolean;
};

type LatestObjectEntry = {
  object: DetectedObject;
  lastSeen: string;
};

const useDroneFeed = (camId: string, token: string): UseDroneFeedResult => {
  const [events, setEvents] = useState<DetectionEvent[]>([]);
  const isReady = Boolean(camId && token);

  const { data, isLoading, error } = useDetections(camId, token, isReady);
  const { realtimeData, isConnected } = useSocket(camId, isReady);

  useEffect(() => {
    if (data?.data) setEvents(data.data);
  }, [data]);

  useEffect(() => {
    if (realtimeData) setEvents((prev) => [realtimeData, ...prev]);
  }, [realtimeData]);

  return { events, isLoading, error, isConnected };
};

const buildLatestObjects = (events: DetectionEvent[]): LatestObjectEntry[] => {
  const map = new Map<string, LatestObjectEntry>();

  events.forEach((event) => {
    event.objects?.forEach((obj) => {
      map.set(obj.obj_id, { object: obj, lastSeen: event.timestamp });
    });
  });

  return Array.from(map.values()).sort(
    (a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime(),
  );
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL?.replace('/api', '') ?? '';

const getDetectionImageUrl = (imagePath?: string | null) => {
  if (!imagePath || !API_BASE_URL) return null;
  return `${API_BASE_URL}${imagePath}`;
};

const DetectionDetailDialog = ({
  detection,
  onClose,
  title = 'Detection detail',
}: {
  detection: DetectionEvent | null;
  onClose: () => void;
  title?: string;
}) => {
  const imageUrl = detection ? getDetectionImageUrl(detection.image_path) : null;

  return (
    <Dialog open={Boolean(detection)} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent dividers>
        {detection && (
          <Stack spacing={2}>
            {imageUrl && (
              <ImageViewer
                src={imageUrl}
                alt="Detection preview"
                height={240}
                objectFit="cover"
                style={{ borderRadius: 8 }}
              />
            )}

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <Box sx={{ flex: 1 }}>
                <Typography variant="caption" color="text.secondary">
                  Timestamp
                </Typography>
                <Typography variant="body2" fontWeight={600}>
                  {new Date(detection.timestamp).toLocaleString()}
                </Typography>
              </Box>
              <Box sx={{ flex: 1 }}>
                <Typography variant="caption" color="text.secondary">
                  Camera
                </Typography>
                <Typography variant="body2" fontWeight={600}>
                  {detection.camera?.name ?? detection.cam_id}
                </Typography>
              </Box>
            </Stack>

            <Divider />

            <Box>
              <Typography variant="subtitle2" gutterBottom>
                Detected drones ({detection.objects.length})
              </Typography>
              <Stack spacing={1}>
                {detection.objects.map((obj) => (
                  <Box
                    key={obj.obj_id}
                    sx={{
                      p: 1,
                      borderRadius: 1,
                      border: '1px solid',
                      borderColor: 'divider',
                    }}
                  >
                    <Typography variant="body2" fontWeight={600}>
                      {obj.type} - {obj.obj_id}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" display="block">
                      Objective: {obj.objective} - Size: {obj.size}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" display="block">
                      Lat: {typeof obj.lat === 'number' ? obj.lat.toFixed(6) : obj.lat} - Lng:{' '}
                      {typeof obj.lng === 'number' ? obj.lng.toFixed(6) : obj.lng}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            </Box>
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

const Panel = ({ title, children }: { title?: string; children: ReactNode }) => (
  <Paper
    sx={{
      p: 2,
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      minHeight: 0,
      overflow: 'hidden',
    }}
  >
    {title && (
      <Typography variant="h6" gutterBottom>
        {title}
      </Typography>
    )}
    <Box sx={{ flexGrow: 1, minHeight: 0 }}>{children}</Box>
  </Paper>
);

const EARTH_RADIUS_METERS = 6371000;

type LatLng = { lat: number; lng: number };

const toRadians = (value: number) => (value * Math.PI) / 180;

const calculateDistanceMeters = (from: LatLng, to: LatLng) => {
  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const a = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METERS * c;
};

const formatEta = (seconds: number | null) => {
  if (seconds === null || !Number.isFinite(seconds)) return 'N/A';
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return secs > 0 ? `${minutes}m ${secs}s` : `${minutes}m`;
};

const formatDistance = (meters: number) => {
  if (!Number.isFinite(meters)) return 'N/A';
  if (meters >= 1000) return `${(meters / 1000).toFixed(2)} km`;
  return `${meters.toFixed(0)} m`;
};

const DEFAULT_DEFENCE_LOCATION: LatLng = { lat: 14.297567, lng: 101.166279 };
const DEFAULT_OFFENCE_LOCATION: LatLng = { lat: 14.286451, lng: 101.171298 };

const DefensiveAlertPanel = ({
  feed,
  detectionRadius,
  onRadiusChange,
  defaultLocation,
}: {
  feed: UseDroneFeedResult;
  detectionRadius: number;
  onRadiusChange: (radius: number) => void;
  defaultLocation: LatLng | null;
}) => {
  const errorMessage = feed.error ? (feed.error instanceof Error ? feed.error.message : String(feed.error)) : null;
  const latest = feed.events[0];
  const [radiusInput, setRadiusInput] = useState(String(detectionRadius));
  const [tab, setTab] = useState<'status' | 'settings'>('status');

  useEffect(() => {
    setRadiusInput(String(detectionRadius));
  }, [detectionRadius]);

  const handleRadiusSubmit = () => {
    const parsed = Number(radiusInput);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setRadiusInput(String(detectionRadius));
      return;
    }
    onRadiusChange(parsed);
  };

  const intruders = useMemo(() => {
    if (!defaultLocation || detectionRadius <= 0) return [];

    const seen = new Map<string, { object: DetectedObject; distance: number; etaSeconds: number | null }>();

    feed.events.forEach((event) => {
      event.objects?.forEach((obj) => {
        const lat = typeof obj.lat === 'number' ? obj.lat : parseFloat(String(obj.lat));
        const lng = typeof obj.lng === 'number' ? obj.lng : parseFloat(String(obj.lng));
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

        const distance = calculateDistanceMeters(defaultLocation, { lat, lng });
        if (distance > detectionRadius) return;

        if (!seen.has(obj.obj_id)) {
          const speed = typeof obj.speed === 'number' ? obj.speed : null;
          const etaSeconds = speed && speed > 0 ? distance / speed : null;
          seen.set(obj.obj_id, { object: obj, distance, etaSeconds });
        }
      });
    });

    return Array.from(seen.values()).sort((a, b) => a.distance - b.distance);
  }, [feed.events, detectionRadius, defaultLocation]);

  return (
    <Panel>
      <Stack spacing={2} sx={{ height: '100%' }}>
        <Tabs
          value={tab}
          onChange={(_, value) => setTab(value)}
          variant="fullWidth"
          sx={{ minHeight: 0 }}
        >
          <Tab label="Status" value="status" />
          <Tab label="Settings" value="settings" />
        </Tabs>

        {tab === 'status' && (
          <>
            <Stack direction="row" spacing={1} flexWrap="wrap">
              <Chip
                icon={<Icon icon={feed.isConnected ? 'mdi:check-circle' : 'mdi:close-circle'} />}
                label={feed.isConnected ? 'Socket Connected' : 'Socket Down'}
                color={feed.isConnected ? 'success' : 'error'}
                size="small"
              />
              <Chip
                icon={<Icon icon={feed.error ? 'mdi:close-circle' : 'mdi:check-circle'} />}
                label={feed.error ? 'API Error' : 'API Ready'}
                color={feed.error ? 'error' : 'success'}
                size="small"
              />
              <Chip icon={<Icon icon="mdi:database" />} label={`Events: ${feed.events.length}`} size="small" />
            </Stack>

            {errorMessage ? (
              <Alert severity="error">{errorMessage}</Alert>
            ) : latest ? (
              <Alert severity="success">Last detection: {new Date(latest.timestamp).toLocaleString()}</Alert>
            ) : (
              <Alert severity="info">Awaiting defensive detections...</Alert>
            )}

            <Box sx={{ border: '1px dashed', borderRadius: 1, borderColor: 'divider', flexGrow: 1, p: 2, overflowY: 'auto' }}>
              {!defaultLocation ? (
                <Typography variant="body2" color="text.secondary">
                  Default marker not set. Set the marker on the map to enable proximity alerts.
                </Typography>
              ) : intruders.length === 0 ? (
                <Typography variant="body2" color="text.secondary" align="center">
                  No deploy drones detected within {formatDistance(detectionRadius)}.
                </Typography>
              ) : (
                <Stack spacing={1}>
                  {intruders.map(({ object, distance, etaSeconds }) => (
                    <Paper key={object.obj_id} variant="outlined" sx={{ p: 1.5 }}>
                      <Typography variant="subtitle2" fontWeight={600}>
                        {object.type} · {object.obj_id}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Distance: {formatDistance(distance)} · Speed: {object.speed ? `${object.speed} m/s` : 'N/A'} · ETA:{' '}
                        {formatEta(etaSeconds)}
                      </Typography>
                    </Paper>
                  ))}
                </Stack>
              )}
            </Box>
          </>
        )}

        {tab === 'settings' && (
          <Stack spacing={2}>
            <Typography variant="subtitle2">Detection radius (meters)</Typography>
            <Stack direction="row" spacing={1}>
              <TextField
                size="small"
                type="number"
                value={radiusInput}
                onChange={(e) => setRadiusInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRadiusSubmit();
                }}
                sx={{ minWidth: 120 }}
              />
              <Button variant="contained" onClick={handleRadiusSubmit} size="small" sx={{ textTransform: 'none' }}>
                Update radius
              </Button>
            </Stack>
            {defaultLocation ? (
              <Typography variant="body2" color="text.secondary">
                Default marker: lat {defaultLocation.lat.toFixed(5)} • lng {defaultLocation.lng.toFixed(5)}
              </Typography>
            ) : (
              <Typography variant="body2" color="text.secondary">
                Default marker not set.
              </Typography>
            )}
          </Stack>
        )}
      </Stack>
    </Panel>
  );
};

const MapPanel = ({
  title,
  event,
  defaultCameraLocation,
  focusPoint,
  objects,
  detectionRadius,
  defaultLocation,
  onDefaultLocationChange,
}: {
  title?: string;
  event?: DetectionEvent;
  defaultCameraLocation?: string;
  focusPoint?: { lat: number; lng: number } | null;
  objects?: DetectedObject[];
  detectionRadius?: number;
  defaultLocation?: LatLng;
  onDefaultLocationChange?: (coords: LatLng) => void;
}) => {
  const displayedObjects = objects ?? event?.objects ?? [];
  const hasObjects = displayedObjects.length > 0;
  const cameraLocation = event?.camera?.location ?? defaultCameraLocation;

  return (
    <Panel>
      <Box sx={{ position: 'relative', height: '100%' }}>
        {title && (
          <Box
            sx={{
              position: 'absolute',
              top: 90,
              left: 12,
              zIndex: 2,
              px: 1.5,
              py: 0.5,
              borderRadius: 1,
              bgcolor: (theme) => alpha(theme.palette.background.paper, 0.85),
              boxShadow: 1,
            }}
          >
            <Typography variant="subtitle2" fontWeight={600}>
              {title}
            </Typography>
          </Box>
        )}

        <MapComponent
          objects={displayedObjects}
          imagePath={event?.image_path}
          cameraLocation={cameraLocation}
          focusPoint={focusPoint}
          detectionRadius={detectionRadius}
          defaultLocation={defaultLocation}
          onDefaultLocationChange={onDefaultLocationChange}
        />

        {!hasObjects && (
          <Box
            sx={{
              position: 'absolute',
              bottom: 16,
              left: 16,
              px: 2,
              py: 1,
              borderRadius: 1,
              bgcolor: (theme) => alpha(theme.palette.common.black, 0.65),
            }}
          >
            <Typography variant="body2" color="common.white">
              Awaiting live detections...
            </Typography>
          </Box>
        )}
      </Box>
    </Panel>
  );
};

const DetectionSummaryModule = ({
  detection,
  onSelect,
}: {
  detection: DetectionEvent;
  onSelect: (event: DetectionEvent) => void;
}) => {
  const previewTypes = detection.objects.slice(0, 2).map((obj) => obj.type).join(', ');
  const timestamp = new Date(detection.timestamp).toLocaleString();

  return (
    <Paper
      variant="outlined"
      onClick={() => onSelect(detection)}
      sx={{
        p: 1.5,
        borderRadius: 1,
        cursor: 'pointer',
        transition: 'border-color 0.2s, box-shadow 0.2s',
        '&:hover': {
          borderColor: 'primary.main',
          boxShadow: 2,
        },
      }}
    >
      <Stack spacing={0.75}>
        <Stack direction="row" spacing={1} alignItems="center">
          <Icon icon="mdi:clock-outline" width={18} />
          <Typography variant="caption" color="text.secondary">
            {timestamp}
          </Typography>
        </Stack>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
          <Chip icon={<Icon icon="mdi:drone" />} label={`${detection.objects.length} drones`} size="small" />
          <Chip
            icon={<Icon icon="mdi:camera" />}
            label={detection.camera?.name ?? detection.cam_id.slice(0, 8)}
            size="small"
            variant="outlined"
          />
        </Stack>
        {previewTypes && (
          <Typography variant="caption" color="text.secondary">
            Types: {previewTypes}
          </Typography>
        )}
        <Typography variant="caption" color="primary.main">
          Tap to view details
        </Typography>
      </Stack>
    </Paper>
  );
};

const DetectionFeedPanel = ({
  feed,
  title,
  compact = false,
  onShowDetail,
}: {
  feed: UseDroneFeedResult;
  title: string;
  compact?: boolean;
  onShowDetail?: (detection: DetectionEvent) => void;
}) => {
  const errorMessage = feed.error ? (feed.error instanceof Error ? feed.error.message : String(feed.error)) : null;
  const [localDetail, setLocalDetail] = useState<DetectionEvent | null>(null);
  const [tab, setTab] = useState<'feed' | 'latest'>('feed');

  const shouldUseLocalDialog = !onShowDetail;
  const detailDetection = shouldUseLocalDialog ? localDetail : null;

  const handleOpenDetail = (detection: DetectionEvent) => {
    if (onShowDetail) onShowDetail(detection);
    else setLocalDetail(detection);
  };

  const handleCloseDetail = () => setLocalDetail(null);

  const latestEvent = feed.events[0];

  return (
    <Panel title={title}>
      {feed.isLoading && (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
          <CircularProgress size={28} />
        </Box>
      )}

      {!feed.isLoading && errorMessage && <Alert severity="error">{errorMessage}</Alert>}

      {!feed.isLoading && !errorMessage && (
        <>
          <Box sx={{ mb: 1 }}>
            <Tabs
              value={tab}
              onChange={(_, value) => setTab(value)}
              variant="fullWidth"
              sx={{ minHeight: 0 }}
            >
              <Tab label="Latest Image" value="latest" />
              <Tab label="Detection" value="feed" />
            </Tabs>
          </Box>

          {tab === 'feed' && feed.events.length > 0 && (
            <Box sx={{ height: '100%', overflowY: 'auto', pr: 1 }}>
              <Stack spacing={compact ? 1.5 : 2}>
                {feed.events.map((event) =>
                  compact ? (
                    <DetectionSummaryModule key={`${title}-${event.id}`} detection={event} onSelect={handleOpenDetail} />
                  ) : (
                    <DetectionCard key={`${title}-${event.id}`} detection={event} />
                  ),
                )}
              </Stack>
            </Box>
          )}

          {tab === 'latest' && latestEvent && (
            <Box sx={{ height: '100%', borderRadius: 1, overflow: 'hidden' }}>
              <ImageViewer
                src={getDetectionImageUrl(latestEvent.image_path) ?? ''}
                alt="Latest detection"
                width="100%"
                height="100%"
                objectFit="cover"
              />
            </Box>
          )}

          {tab === 'latest' && !latestEvent && (
            <Alert severity="info">No snapshots recorded yet.</Alert>
          )}

          {shouldUseLocalDialog && (
            <DetectionDetailDialog detection={detailDetection} onClose={handleCloseDetail} />
          )}
        </>
      )}
    </Panel>
  );
};

const HistoryPanel = ({
  title,
  events,
  enableDetails = false,
  onShowDetail,
  camId,
  token,
  onCleared,
}: {
  title?: string;
  events: DetectionEvent[];
  enableDetails?: boolean;
  onShowDetail?: (event: DetectionEvent) => void;
  camId?: string;
  token?: string;
  onCleared?: () => void;
}) => {
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [startDate, setStartDate] = useState<Dayjs | null>(null);
  const [endDate, setEndDate] = useState<Dayjs | null>(null);
  const [isClearing, setIsClearing] = useState(false);
  const [clearStatus, setClearStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const filteredEvents = useMemo(() => {
    const startTime = startDate ? startDate.startOf('day').valueOf() : null;
    const endTime = endDate ? endDate.endOf('day').valueOf() : null;

    return [...events]
      .filter((event) => {
        const eventTime = dayjs(event.timestamp).valueOf();
        if (startTime !== null && eventTime < startTime) return false;
        if (endTime !== null && eventTime > endTime) return false;
        return true;
      })
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [events, startDate, endDate]);

  const handleToggle = (id: number) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const handleDetailRequest = (event: DetectionEvent) => {
    if (!enableDetails || !onShowDetail) return;
    onShowDetail(event);
  };

  const detailReady = enableDetails && Boolean(onShowDetail);
  const canClear = Boolean(camId && token);

  const handleClearLogs = async () => {
    if (!camId || !token) return;
    setIsClearing(true);
    setClearStatus(null);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/object-detection/clear/${camId}`,
        {
          method: 'DELETE',
          headers: {
            'x-camera-token': token,
          },
        }
      );

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || 'Failed to clear history');
      }

      setClearStatus({ type: 'success', message: 'History cleared successfully.' });
      onCleared?.();
    } catch (error) {
      setClearStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to clear history',
      });
    } finally {
      setIsClearing(false);
    }
  };


  return (
    <Panel>
      <Stack spacing={2} sx={{ height: '100%' }}>
        {title && (
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Typography variant="subtitle2" fontWeight={600}>
              {title}
            </Typography>
            {canClear && (
              <Button
                size="small"
                variant="outlined"
                onClick={handleClearLogs}
                disabled={isClearing}
                startIcon={<Icon icon="mdi:delete-outline" width={16} />}
                sx={{ textTransform: 'none' }}
              >
                {isClearing ? 'Clearing...' : 'Clear'}
              </Button>
            )}
          </Stack>
        )}

        <Stack spacing={1}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <DatePicker
              label="Start date"
              value={startDate}
              onChange={(value) => setStartDate(value)}
              slotProps={{ textField: { size: 'small', fullWidth: true } }}
              sx={{ flex: 1 }}
            />
            <DatePicker
              label="End date"
              value={endDate}
              onChange={(value) => setEndDate(value)}
              slotProps={{ textField: { size: 'small', fullWidth: true } }}
              sx={{ flex: 1 }}
            />
          </Stack>
        </Stack>

        {clearStatus && <Alert severity={clearStatus.type}>{clearStatus.message}</Alert>}

        <Box sx={{ flexGrow: 1, overflowY: 'auto' }}>
          {filteredEvents.length === 0 ? (
            <Alert severity="info">No history logs captured in this range.</Alert>
          ) : (
            <List dense>
              {filteredEvents.map((event) => {
                const isExpanded = expandedId === event.id;
                return (
                  <Box
                    key={`${title ?? 'history'}-${event.id}`}
                    sx={{ borderBottom: '1px solid', borderColor: 'divider' }}
                  >
                    <ListItem disableGutters disablePadding>
                      <ListItemButton
                        onClick={() => handleToggle(event.id)}
                        sx={{ py: 1, display: 'flex', alignItems: 'flex-start', gap: 1 }}
                      >
                        <ListItemText
                          primary={new Date(event.timestamp).toLocaleString()}
                          secondary={`${event.objects.length} objects detected`}
                        />
                        <Icon icon={isExpanded ? 'mdi:chevron-up' : 'mdi:chevron-down'} width={18} />
                      </ListItemButton>
                    </ListItem>
                    <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                      <Box sx={{ pl: 2, pr: 1, pb: 1 }}>
                        {event.objects.map((obj) => (
                          <Box
                            key={obj.obj_id}
                            sx={{
                              mb: 1,
                              p: 0.5,
                              borderRadius: 1,
                              transition: 'background-color 0.2s',
                              cursor: detailReady ? 'pointer' : 'default',
                              '&:hover': detailReady ? { backgroundColor: 'action.hover' } : undefined,
                            }}
                            onClick={() => detailReady && handleDetailRequest(event)}
                          >
                            <Typography variant="body2" fontWeight={600}>
                              {obj.type} - {obj.obj_id}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" display="block">
                              Objective: {obj.objective} - Size: {obj.size}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" display="block">
                              Lat: {typeof obj.lat === 'number' ? obj.lat.toFixed(6) : obj.lat} - Lng:{' '}
                              {typeof obj.lng === 'number' ? obj.lng.toFixed(6) : obj.lng}
                            </Typography>
                          </Box>
                        ))}
                      </Box>
                    </Collapse>
                  </Box>
                );
              })}
            </List>
          )}
        </Box>
      </Stack>
    </Panel>
  );
};
const DroneListPanel = ({
  feed,
  latestObjects,
  onSelect,
  selectedId,
}: {
  feed: UseDroneFeedResult;
  latestObjects: LatestObjectEntry[];
  onSelect?: (object: DetectedObject) => void;
  selectedId?: string | null;
}) => {
  const errorMessage = feed.error ? (feed.error instanceof Error ? feed.error.message : String(feed.error)) : null;

  return (
    <Panel title="Deployed Drones List">
      <Stack spacing={1.5} sx={{ mb: 1 }}>
        <Stack direction="row" spacing={1} flexWrap="wrap">
          <Chip
            icon={<Icon icon={feed.isConnected ? 'mdi:check-circle' : 'mdi:close-circle'} />}
            label={feed.isConnected ? 'Socket Connected' : 'Socket Down'}
            color={feed.isConnected ? 'success' : 'error'}
            size="small"
          />
          <Chip
            icon={<Icon icon={errorMessage ? 'mdi:close-circle' : 'mdi:check-circle'} />}
            label={errorMessage ? 'API Error' : 'API Ready'}
            color={errorMessage ? 'error' : 'success'}
            size="small"
          />
          <Chip icon={<Icon icon="mdi:database" />} label={`Objects: ${latestObjects.length}`} size="small" />
        </Stack>
        <Typography variant="caption" color="text.secondary">
          Tap a drone to center the offensive map.
        </Typography>
      </Stack>

      {latestObjects.length === 0 ? (
        <Alert severity="info">No deployed drones in the feed yet.</Alert>
      ) : (
        <List dense sx={{ height: '100%', overflowY: 'auto' }}>
          {latestObjects.map(({ object, lastSeen }) => {
            const isSelected = selectedId === object.obj_id;
            return (
              <ListItem key={object.obj_id} disablePadding>
                <ListItemButton
                  onClick={() => onSelect?.(object)}
                  selected={isSelected}
                  sx={{
                    alignItems: 'flex-start',
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                    '&.Mui-selected': {
                      bgcolor: (theme) => alpha(theme.palette.primary.main, 0.08),
                    },
                  }}
                >
                  <ListItemText
                    primary={`${object.type} - ${object.obj_id}`}
                    secondary={`Objective: ${object.objective} - Last seen: ${new Date(lastSeen).toLocaleString()}`}
                  />
                </ListItemButton>
              </ListItem>
            );
          })}
        </List>
      )}
    </Panel>
  );
};
const DashboardPage = () => {
  const defensiveFeed = useDroneFeed(droneProfiles.defensive.camId, droneProfiles.defensive.token);
  const offensiveFeed = useDroneFeed(droneProfiles.offensive.camId, droneProfiles.offensive.token);

  const defensiveLatest = defensiveFeed.events[0];
  const offensiveLatest = offensiveFeed.events[0];

  const defensiveObjects = useMemo(() => buildLatestObjects(defensiveFeed.events), [defensiveFeed.events]);
  const offensiveObjects = useMemo(() => buildLatestObjects(offensiveFeed.events), [offensiveFeed.events]);

  const [offensiveFocus, setOffensiveFocus] = useState<{ lat: number; lng: number } | null>(null);
  const [selectedDroneId, setSelectedDroneId] = useState<string | null>(null);
  const [detailDetection, setDetailDetection] = useState<DetectionEvent | null>(null);
  const [defensiveRadius, setDefensiveRadius] = useState(1500);
  const [defensiveDefaultLocation, setDefensiveDefaultLocation] = useState<LatLng>(DEFAULT_DEFENCE_LOCATION);

  const handleDroneSelect = (object: DetectedObject) => {
    const lat = typeof object.lat === 'number' ? object.lat : parseFloat(String(object.lat));
    const lng = typeof object.lng === 'number' ? object.lng : parseFloat(String(object.lng));
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    setOffensiveFocus({ lat, lng });
    setSelectedDroneId(object.obj_id);
  };

  const handleCloseDetail = () => setDetailDetection(null);

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <Container
        maxWidth={false}
        disableGutters
        sx={{
          height: '100vh',
          width: '100vw',
          maxWidth: '100vw',
          boxSizing: 'border-box',
          py: 2,
          px: 2,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <Box
          sx={{
            flexGrow: 1,
            display: 'grid',
            gridTemplateRows: 'repeat(2, minmax(0, 1fr))',
            gap: '8px',
            minHeight: 0,
          }}
        >
          {/* ---------- Defensive (3:5:2:2) ---------- */}
          <Grid
            container
            spacing={1}
            columns={12}
            sx={{ minHeight: 0, height: '100%', overflow: 'hidden' }}
          >
            <Grid size={{ xs: 12, md: 6, lg: 6 }} sx={{ height: '100%', minHeight: 0 }}>
              <MapPanel
                event={defensiveLatest}
                defaultCameraLocation="defence"
                objects={defensiveObjects.map(({ object }) => object)}
                detectionRadius={defensiveRadius}
                defaultLocation={defensiveDefaultLocation}
                onDefaultLocationChange={setDefensiveDefaultLocation}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6, lg: 2 }} sx={{ height: '100%', minHeight: 0 }}>
              <DefensiveAlertPanel
                feed={defensiveFeed}
                detectionRadius={defensiveRadius}
                onRadiusChange={setDefensiveRadius}
                defaultLocation={defensiveDefaultLocation}
              />
            </Grid>

            <Grid size={{ xs: 12, md: 6, lg: 2 }} sx={{ height: '100%', minHeight: 0 }}>
              <DetectionFeedPanel
                feed={defensiveFeed}
                title="Object Detection"
                compact
                onShowDetail={setDetailDetection}
              />
            </Grid>

            <Grid size={{ xs: 12, md: 6, lg: 2 }} sx={{ height: '100%', minHeight: 0 }}>
              <HistoryPanel
                title="Filter by Date"
                events={defensiveFeed.events}
                enableDetails
                onShowDetail={setDetailDetection}
                camId={droneProfiles.defensive.camId}
                token={droneProfiles.defensive.token}
              />
            </Grid>
          </Grid>

          {/* ---------- Offensive (3:6:3) ---------- */}
          <Grid
            container
            spacing={1}
            columns={12}
            sx={{ minHeight: 0, height: '100%', overflow: 'hidden' }}
          >
            <Grid size={{ xs: 12, md: 6, lg: 6 }} sx={{ height: '100%', minHeight: 0 }}>
              <MapPanel
                event={offensiveLatest}
                defaultCameraLocation="offence"
                focusPoint={offensiveFocus}
                objects={offensiveObjects.map(({ object }) => object)}
                defaultLocation={DEFAULT_OFFENCE_LOCATION}
              />
            </Grid>

            <Grid size={{ xs: 12, md: 6, lg: 4 }} sx={{ height: '100%', minHeight: 0 }}>
              <DroneListPanel
                feed={offensiveFeed}
                latestObjects={offensiveObjects}
                onSelect={handleDroneSelect}
                selectedId={selectedDroneId}
              />
            </Grid>


            <Grid size={{ xs: 12, md: 6, lg: 2 }} sx={{ height: '100%', minHeight: 0 }}>
              <HistoryPanel
                title="Filter by Date"
                events={offensiveFeed.events}
                camId={droneProfiles.offensive.camId}
                token={droneProfiles.offensive.token}
              />
            </Grid>
          </Grid>
        </Box>

        <DetectionDetailDialog detection={detailDetection} onClose={handleCloseDetail} />
      </Container>
    </LocalizationProvider>
  );
};
export default DashboardPage;




