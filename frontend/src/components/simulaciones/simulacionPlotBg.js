import { useCallback, useState } from 'react';

export const DEFAULT_PLOT_BG_COLOR = '#f7f7ef';
export const PLOT_BG_STORAGE_KEY = 'hatd-simulacion-plot-bg';

export function readPlotBgColor() {
  try {
    return (
      localStorage.getItem(PLOT_BG_STORAGE_KEY)
      || localStorage.getItem('hatd-sensibilidad-plot-bg')
      || DEFAULT_PLOT_BG_COLOR
    );
  } catch {
    return DEFAULT_PLOT_BG_COLOR;
  }
}

export function useSimulacionPlotBg() {
  const [plotBgColor, setPlotBgColor] = useState(readPlotBgColor);

  const handlePlotBgColorChange = useCallback((color) => {
    setPlotBgColor(color);
    try {
      localStorage.setItem(PLOT_BG_STORAGE_KEY, color);
    } catch {
      /* ignore */
    }
  }, []);

  return { plotBgColor, handlePlotBgColorChange };
}
