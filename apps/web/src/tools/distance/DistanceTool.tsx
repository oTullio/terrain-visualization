/**
 * DistanceTool — sidebar panel + Cesium polyline overlay for the Distance tool.
 *
 * Reads `tools.distance.points` from the store. UI states:
 *   - 0 points: prompt "Click two points on the scene to measure".
 *   - 1 point:  prompt "Click second point".
 *   - 2 points: planimetric (great-circle), surface (terrain-draped),
 *               and Δheight numbers, with a Reset button.
 *
 * Side effect: while two points are picked, render a red polyline along
 * the line (clamped to ground) on the live `viewer`. The polyline entity
 * is removed when the tool unmounts or the points are cleared.
 *
 * Surface distance is computed on the fly using `sampleAlongLine` (50
 * samples — fewer than the elevation profile, since for a single number
 * 50 samples is plenty and it's noticeably faster).
 */
import { useEffect, useState } from 'react';
import { useCesium } from 'resium';
import * as Cesium from 'cesium';
import { useAppStore } from '../../store/useAppStore.js';
import { sampleAlongLine } from '../sampleAlongLine.js';
import {
  planimetricDistanceMeters,
  surfaceDistanceMeters,
} from './distanceMath.js';

const POLYLINE_COLOR = Cesium.Color.fromCssColorString('#EF4444'); // red-500
const SAMPLE_COUNT = 50;

function fmtKm(meters: number): string {
  if (meters < 1000) return `${meters.toFixed(0)} m`;
  return `${(meters / 1000).toFixed(2)} km`;
}

function fmtMeters(m: number): string {
  return `${m >= 0 ? '+' : ''}${m.toFixed(1)} m`;
}

export default function DistanceTool() {
  const { viewer } = useCesium();
  const points = useAppStore((s) => s.distance.points);
  const resetDistance = useAppStore((s) => s.resetDistance);

  const [surfaceMeters, setSurfaceMeters] = useState<number | null>(null);
  const [surfaceErr, setSurfaceErr] = useState<string | null>(null);

  // Render the polyline on the scene whenever we have 2 points.
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
        // viewer is tearing down
      }
    };
  }, [viewer, points]);

  // Compute the surface distance asynchronously when points change.
  useEffect(() => {
    if (!viewer || viewer.isDestroyed() || points.length < 2) {
      setSurfaceMeters(null);
      setSurfaceErr(null);
      return;
    }
    let cancelled = false;
    setSurfaceErr(null);

    const tp = viewer.terrainProvider;
    const a = points[0]!;
    const b = points[1]!;
    sampleAlongLine(tp, a, b, SAMPLE_COUNT)
      .then((samples) => {
        if (cancelled) return;
        setSurfaceMeters(surfaceDistanceMeters(samples));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setSurfaceErr(err instanceof Error ? err.message : 'Surface sampling failed');
        setSurfaceMeters(null);
      });

    return () => {
      cancelled = true;
    };
  }, [viewer, points]);

  // ----- Render -----

  if (points.length === 0) {
    return (
      <p className="text-xs text-gray-400 leading-relaxed">
        Click two points on the scene to measure.
      </p>
    );
  }

  if (points.length === 1) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-gray-400 leading-relaxed">Click second point.</p>
        <button
          type="button"
          onClick={resetDistance}
          className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-100 border border-gray-600"
        >
          Reset
        </button>
      </div>
    );
  }

  // 2 points
  const a = points[0]!;
  const b = points[1]!;
  const planim = planimetricDistanceMeters(a, b);
  const dHeight = b.height - a.height;

  return (
    <div className="space-y-1.5">
      <dl className="text-xs text-gray-200 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
        <dt className="text-gray-400">Planimetric</dt>
        <dd className="font-mono">{fmtKm(planim)}</dd>
        <dt className="text-gray-400">Surface</dt>
        <dd className="font-mono">
          {surfaceErr
            ? <span className="text-red-400" title={surfaceErr}>error</span>
            : surfaceMeters === null
              ? <span className="text-gray-500">…</span>
              : fmtKm(surfaceMeters)}
        </dd>
        <dt className="text-gray-400">Δ height</dt>
        <dd className="font-mono">{fmtMeters(dHeight)}</dd>
      </dl>
      <button
        type="button"
        onClick={resetDistance}
        className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-100 border border-gray-600"
      >
        Reset
      </button>
    </div>
  );
}
