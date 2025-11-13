// config/droneProfiles.ts
const {
  VITE_OFFENSIVE_CAM_ID,
  VITE_OFFENSIVE_TOKEN,
  VITE_DEFENSIVE_CAM_ID,
  VITE_DEFENSIVE_TOKEN,
} = import.meta.env;

const sanitize = (value: string | undefined) => value?.trim() ?? '';

export const droneProfiles = {
  offensive: {
    label: 'Offensive',
    camId: sanitize(VITE_OFFENSIVE_CAM_ID),
    token: sanitize(VITE_OFFENSIVE_TOKEN),
  },
  defensive: {
    label: 'Defensive',
    camId: sanitize(VITE_DEFENSIVE_CAM_ID),
    token: sanitize(VITE_DEFENSIVE_TOKEN),
  },
} as const;

export type DroneProfileKey = keyof typeof droneProfiles;
