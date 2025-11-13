/**
 * Component หลักของแอพพลิเคชั่น
 * จัดการ routing, theme, และ React Query
 */

import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
// import HomePage from './pages/HomePage';
// import RoutePage from './pages/01_RoutePage';
// import MuiGridPage from './pages/02_MuiGridPage';
// import DetectionCardPage from './pages/03_DetectionCardPage';
// import DetectionPopupPage from './pages/04_DetectionPopupPage';
// import ImageViewerPage from './pages/05_ImageViewerPage';
// import MapPage from './pages/06_MapPage';
// import ApiSocketPage from './pages/07_ApiSocketPage';
// import DashboardPage from './pages/08_DashboardPage';
import Dashboard from './pages/Dashboard';

// สร้าง Material-UI theme
const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#1976d2',
    },
    secondary: {
      main: '#dc004e',
    },
  },
});

// สร้าง Query Client สำหรับ React Query
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <BrowserRouter>
          <Routes>
            {/* <Route path="/" element={<HomePage />} /> */}
            <Route path="/" element={<Dashboard />} />
            {/* <Route path="/01-route" element={<RoutePage />} /> */}
            {/* <Route path="/02-mui-grid" element={<MuiGridPage />} /> */}
            {/* <Route path="/03-detection-card" element={<DetectionCardPage />} /> */}
            {/* <Route path="/04-detection-popup" element={<DetectionPopupPage />} /> */}
            {/* <Route path="/05-image-viewer" element={<ImageViewerPage />} /> */}
            {/* <Route path="/06-map" element={<MapPage />} /> */}
            {/* <Route path="/07-api-socket" element={<ApiSocketPage />} /> */}
            {/* <Route path="/08-dashboard" element={<DashboardPage />} /> */}
          </Routes>
        </BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
