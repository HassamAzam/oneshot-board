'use client';

import { useMemo, useState } from 'react';
import type { DayActivity } from '@/lib/queries';
import { fmtHours, fmtInt, fmtTok } from '@/lib/format';

type MetricKey = 'tokens' | 'sessions' | 'compute';
const METRICS: { key: MetricKey; label: string; pick: (d: DayActivity) => number; fmt: (v: number) => string }[] = [
  { key: 'tokens',   label: 'Output tokens', pick: (d) => Number(d.tokens_out), fmt: fmtTok },
  { key: 'sessions', label: 'Sessions',      pick: (d) => Number(d.sessions),   fmt: fmtInt },
  { key: 'compute',  label: 'Compute',       pick: (d) => Number(d.compute_ms), fmt: fmtHours },
];

const W = 760, H = 210, padL = 46, padR = 14, padT = 14, padB = 26;
const plotW = W - padL - padR, plotH = H - padT - padB;

/**
 * Daily activity for the fleet, one metric at a time. Pure inline SVG (no chart lib) so it
 * stays theme-aware and adds no dependency; a crosshair tooltip rides the series on hover.
 */
export default function ActivityChart({ data }: { data: DayActivity[] }) {
  const [metric, setMetric] = useState<MetricKey>('tokens');
  const [hover, setHover] = useState<number | null>(null);
  const m = METRICS.find((x) => x.key === metric)!;

  const { pts, line, area, ticks } = useMemo(() => {
    const n = Math.max(1, data.length);
    const vals = data.map(m.pick);
    const max = Math.max(1, ...vals);
    const top = max * 1.12;
    const x = (i: number) => padL + (n > 1 ? (plotW * i) / (n - 1) : plotW / 2);
    const y = (v: number) => padT + plotH * (1 - v / top);
    const pts = vals.map((v, i) => ({ x: x(i), y: y(v), v, day: data[i].day }));
    let line = '';
    pts.forEach((p, i) => { line += `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)} `; });
    const area = pts.length
      ? `${line}L${pts[pts.length - 1].x.toFixed(1)} ${padT + plotH} L${pts[0].x.toFixed(1)} ${padT + plotH} Z`
      : '';
    const ticks = Array.from({ length: 5 }, (_, t) => {
      const gv = (top * t) / 4;
      return { gv, gy: y(gv) };
    });
    return { pts, top, line, area, ticks };
  }, [data, metric]); // eslint-disable-line react-hooks/exhaustive-deps

  const gid = `obgrad-${metric}`;
  const dayLabel = (iso: string) => {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  };
  const hp = hover != null ? pts[hover] : null;

  return (
    <>
      <div className="chart-head">
        <h2>Activity · last {data.length} days</h2>
        <div className="seg" role="tablist" aria-label="Chart metric">
          {METRICS.map((x) => (
            <button key={x.key} type="button" className={x.key === metric ? 'on' : ''}
              aria-pressed={x.key === metric} onClick={() => setMetric(x.key)}>{x.label}</button>
          ))}
        </div>
      </div>
      <div className="chart-wrap">
        <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img"
          aria-label={`${m.label} per day, last ${data.length} days`} style={{ color: 'var(--accent)' }}>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity={0.26} />
              <stop offset="100%" stopColor="currentColor" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          {ticks.map((t, i) => (
            <g key={i}>
              <line x1={padL} x2={W - padR} y1={t.gy} y2={t.gy} style={{ stroke: 'var(--grid)' }} strokeWidth={1} />
              <text x={padL - 6} y={t.gy + 3} textAnchor="end" fontSize={9}
                style={{ fill: 'var(--ink-3)', fontFamily: 'IBM Plex Mono, monospace' }}>{m.fmt(t.gv)}</text>
            </g>
          ))}
          {data.map((d, i) => i % 2 === 0 ? (
            <text key={i} x={pts[i].x} y={H - 8} textAnchor="middle" fontSize={9}
              style={{ fill: 'var(--ink-3)', fontFamily: 'IBM Plex Mono, monospace' }}>{dayLabel(d.day)}</text>
          ) : null)}
          {area ? <path d={area} fill={`url(#${gid})`} /> : null}
          {line ? <path d={line} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" /> : null}
          {pts.length ? <circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r={3.5} fill="currentColor" style={{ stroke: 'var(--surface)' }} strokeWidth={2} /> : null}
          {hp ? (
            <g>
              <line x1={hp.x} x2={hp.x} y1={padT} y2={padT + plotH} style={{ stroke: 'var(--accent)' }} strokeWidth={1} strokeDasharray="3 3" opacity={0.5} />
              <circle cx={hp.x} cy={hp.y} r={4} fill="currentColor" style={{ stroke: 'var(--surface)' }} strokeWidth={2} />
            </g>
          ) : null}
          {pts.map((p, i) => (
            <rect key={i} x={p.x - plotW / Math.max(1, data.length) / 2} y={padT}
              width={plotW / Math.max(1, data.length)} height={plotH} fill="transparent"
              style={{ cursor: 'crosshair' }} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
          ))}
        </svg>
        {hp ? (
          <div className="chart-tip" style={{ left: `${(hp.x / W) * 100}%`, top: `${(hp.y / H) * 100}%`, opacity: 1 }}>
            <b>{m.fmt(hp.v)}</b> {m.label.toLowerCase()}<br />{dayLabel(hp.day)}
          </div>
        ) : null}
      </div>
    </>
  );
}
