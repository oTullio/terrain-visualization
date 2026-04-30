/**
 * ElevationProfileTool — sidebar panel + Cesium polyline overlay + Recharts
 * AreaChart for the Elevation Profile tool.
 *
 * Reads `tools.elevationProfile.points` and `samples` from the store.
 *
 * UI states:
 *   - 0 points: prompt "Click two points to draw an elevation profile."
 *   - 1 point:  prompt "Click second point."
 *   - 2 points: AreaChart of elevation (m) vs distance (km), with a hover
 *     dot in the 3D scene linked to the chart's hovered sample.
 *
 * Side effects on the Cesium scene:
 *   - Blue polyline (clamped to ground) along the picked points.
 *   - A small red point entity that tracks the chart hover position.
 * Both are removed on unmount or when the points are cleared.
 *
 * Hover-link uses Recharts' AreaChart `onMouseMove` callback. The hovered
 * sample index is stored in component state and looked up against the
 * sample array to position the red dot.
 */
import { useEffect, useMemo, useState } from 'react';
import { useCesium } from 'resium';
import * as Cesium from 'cesium';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
} from 'recharts';
import { useAppStore } from '../../store/useAppStore.js';
import { sampleAlongLine, DEFAULT_SAMPLES } from '../sampleAlongLine.js';
import type { ElevationSample } from '../../store/useAppStore.js';

const POLYLINE_COLOR = Cesium.Color.fromCssColorString('#3B82F6'); // blue-500
const HOVER_DOT_COLOR = Cesium.Color.fromCssColorString('#EF4444'); // red-500

interface ChartDatum {
  /** Distance from start in km (rounded for cleaner X-axis ticks). */
  distanceKm: number;
  /** Elevation in metres. */
  height: number;
  /** Original sample index — used to position the hover dot. */
  i: number;
}

export default function ElevationProfileTool() {
  const { viewer } = useCesium();
  const points = useAppStore((s) => s.elevationProfile.points);
  const samples = useAppStore((s) => s.elevationProfile.samples);
  const setSamples = useAppStore((s) => s.setElevationSamples);
  const reset = useAppStore((s) => s.resetElevationProfile);

  const [error, setError] = useState<string | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  // Render the polyline on the scene when we have 2 points.
  useEffect(() => {
    if (!viewer || viewer.isDestroyed()) return;
    if (points.length < 2) return;

    const a = points[0]!;
    const b = points[1]!;
    const positions = Cesium.Cartesian3.fromDegreesArray([a.lng, a.lat, b.lng, b.lat]);
    const entity = viewer.entities.add({
      polyline: {
        positions,
        width: 2,
        material: POLYLINE_COLOR,
        clampToGround: true,
      },
    });
    return () => {
      try {
        viewer.entities.remove(entity);
      } catch {
        // viewer tearing down
      }
    };
  }, [viewer, points]);

  // Sample the elevation along the line when 2 points are picked.
  useEffect(() => {
    if (!viewer || viewer.isDestroyed() || points.length < 2) {
      setError(null);
      return;
    }
    let cancelled = false;
    setError(null);

    sampleAlongLine(viewer.terrainProvider, points[0]!, points[1]!, DEFAULT_SAMPLES)
      .then((s) => {
        if (cancelled) return;
        setSamples(s as ElevationSample[]);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Elevation sampling failed');
      });

    return () => {
      cancelled = true;
    };
  }, [viewer, points, setSamples]);

  // Manage the hover-dot entity.
  useEffect(() => {
    if (!viewer || viewer.isDestroyed()) return;
    if (hoverIdx === null || !samples || hoverIdx < 0 || hoverIdx >= samples.length) return;
    const s = samples[hoverIdx]!;
    const entity = viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(s.lng, s.lat, s.height),
      point: {
        pixelSize: 10,
        color: HOVER_DOT_COLOR,
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 1,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });
    return () => {
      try {
        viewer.entities.remove(entity);
      } catch {
        // tearing down
      }
    };
  }, [viewer, hoverIdx, samples]);

  // Build chart data when samples are available.
  const chartData = useMemo<ChartDatum[]>(() => {
    if (!samples) return [];
    return samples.map((s, i) => ({
      distanceKm: s.distance / 1000,
      height: s.height,
      i,
    }));
  }, [samples]);

  // ----- Render -----

  if (points.length === 0) {
    return (
      <p className="text-xs text-gray-400 leading-relaxed">
        Click two points to draw an elevation profile.
      </p>
    );
  }

  if (points.length === 1) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-gray-400 leading-relaxed">Click second point.</p>
        <button
          type="button"
          onClick={reset}
          className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-100 border border-gray-600"
        >
          Reset
        </button>
      </div>
    );
  }

  // 2 points
  return (
    <div className="space-y-2">
      {error && (
        <p role="alert" className="text-xs text-red-400">
          {error}
        </p>
      )}

      {!samples && !error && (
        <p className="text-xs text-gray-500">Sampling terrain…</p>
      )}

      {samples && samples.length > 0 && (
        <div data-testid="elevation-profile-chart" className="h-40 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={chartData}
              margin={{ top: 5, right: 8, left: 0, bottom: 0 }}
              onMouseMove={(state) => {
                const idx = state?.activeTooltipIndex;
                if (state?.isTooltipActive && typeof idx === 'number') {
                  setHoverIdx(idx);
                } else {
                  setHoverIdx(null);
                }
              }}
              onMouseLeave={() => setHoverIdx(null)}
            >
              <defs>
                <linearGradient id="ep-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.6} />
                  <stop offset="100%" stopColor="#3B82F6" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#374151" strokeDasharray="3 3" />
              <XAxis
                dataKey="distanceKm"
                type="number"
                domain={['dataMin', 'dataMax']}
                tickFormatter={(v: number) => v.toFixed(1)}
                stroke="#9CA3AF"
                fontSize={10}
                tickLine={false}
                label={{ value: 'km', position: 'insideBottomRight', offset: -2, fill: '#9CA3AF', fontSize: 10 }}
              />
              <YAxis
                stroke="#9CA3AF"
                fontSize={10}
                tickLine={false}
                width={32}
                tickFormatter={(v: number) => `${Math.round(v)}`}
                label={{ value: 'm', position: 'insideTopLeft', offset: 0, fill: '#9CA3AF', fontSize: 10 }}
              />
              <Tooltip
                contentStyle={{
                  background: '#111827',
                  border: '1px solid #374151',
                  fontSize: 11,
                  padding: '4px 6px',
                }}
                labelFormatter={(v) =>
                  typeof v === 'number' ? `${v.toFixed(2)} km` : String(v)
                }
                formatter={(v) => [
                  typeof v === 'number' ? `${v.toFixed(1)} m` : String(v),
                  'elevation',
                ]}
                cursor={{ stroke: '#9CA3AF', strokeWidth: 1 }}
                isAnimationActive={false}
              />
              <Area
                type="monotone"
                dataKey="height"
                stroke="#3B82F6"
                strokeWidth={2}
                fill="url(#ep-grad)"
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      <button
        type="button"
        onClick={reset}
        className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-100 border border-gray-600"
      >
        Reset
      </button>
    </div>
  );
}
