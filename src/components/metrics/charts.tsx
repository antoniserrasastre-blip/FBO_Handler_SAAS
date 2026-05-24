"use client";

// Primitivos de visualización para la pestaña de Métricas.
// SVG ligero, sin dependencias externas. Colores vía tokens semánticos (helix),
// trazos con vector-effect para no distorsionar al escalar, y etiquetas de eje
// en HTML para mantener legibilidad y accesibilidad.

import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

// ----------------------------------------------------------------------------
// DeltaBadge — variación vs período anterior
// ----------------------------------------------------------------------------

export function DeltaBadge({
  value,
  unit = "%",
  goodWhenUp = true,
  title,
}: {
  value: number | null;
  unit?: "%" | "pp";
  goodWhenUp?: boolean;
  title?: string;
}) {
  if (value === null || value === undefined) {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-hx-pill bg-bg-muted px-1.5 py-0.5 font-mono text-[10px] text-ink-muted">
        s/d
      </span>
    );
  }
  const isFlat = Math.abs(value) < 0.05;
  const isUp = value > 0;
  const isGood = isFlat ? null : isUp === goodWhenUp;
  const tone = isFlat
    ? "bg-bg-muted text-ink-muted"
    : isGood
      ? "bg-success-bg text-success-strong"
      : "bg-danger-bg text-danger-strong";
  const Icon = isFlat ? Minus : isUp ? ArrowUpRight : ArrowDownRight;
  const sign = value > 0 ? "+" : "";
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-hx-pill px-1.5 py-0.5 font-mono text-[10px] font-semibold [font-variant-numeric:tabular-nums] ${tone}`}
      title={title ?? "vs período anterior"}
    >
      <Icon size={11} strokeWidth={2.5} aria-hidden />
      {sign}
      {value}
      {unit === "%" ? "%" : " pp"}
    </span>
  );
}

// ----------------------------------------------------------------------------
// Sparkline — mini-línea inline
// ----------------------------------------------------------------------------

export function Sparkline({
  values,
  color = "var(--c-brand)",
  width = 96,
  height = 28,
  label,
}: {
  values: number[];
  color?: string;
  width?: number;
  height?: number;
  label?: string;
}) {
  if (values.length < 2) return <div style={{ height }} />;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const pad = 2;
  const stepX = (width - pad * 2) / (values.length - 1);
  const toY = (v: number) => height - pad - ((v - min) / span) * (height - pad * 2);
  const pts = values.map((v, i) => `${pad + i * stepX},${toY(v)}`);
  const line = `M ${pts.join(" L ")}`;
  const area = `${line} L ${pad + (values.length - 1) * stepX},${height - pad} L ${pad},${height - pad} Z`;
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={label ?? "tendencia"}
      className="overflow-visible"
    >
      <path d={area} fill={color} opacity={0.1} />
      <path d={line} fill="none" stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      <circle cx={pad + (values.length - 1) * stepX} cy={toY(values[values.length - 1])} r={2} fill={color} />
    </svg>
  );
}

// ----------------------------------------------------------------------------
// TrendChart — serie diaria histórica + estimación (forecast) opcional
// ----------------------------------------------------------------------------

export interface TrendPoint {
  date: string; // ISO yyyy-mm-dd
  value: number;
  pax?: number;
}

export function TrendChart({
  history,
  forecast = [],
  unitLabel = "vuelos",
}: {
  history: TrendPoint[];
  forecast?: TrendPoint[];
  unitLabel?: string;
}) {
  const W = 720;
  const H = 200;
  const padL = 28;
  const padR = 8;
  const padT = 12;
  const padB = 22;

  const all = [...history, ...forecast];
  if (all.length === 0) return null;
  const max = Math.max(...all.map((p) => p.value), 1);
  const n = all.length;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const stepX = n > 1 ? innerW / (n - 1) : innerW;
  const x = (i: number) => padL + i * stepX;
  const y = (v: number) => padT + innerH - (v / max) * innerH;

  const histPts = history.map((p, i) => `${x(i)},${y(p.value)}`);
  const histLine = histPts.length ? `M ${histPts.join(" L ")}` : "";
  const histArea = histPts.length
    ? `${histLine} L ${x(history.length - 1)},${padT + innerH} L ${x(0)},${padT + innerH} Z`
    : "";

  // El forecast arranca conectado al último punto histórico.
  const fcStartIdx = history.length - 1;
  const fcPts = forecast.map((p, i) => `${x(fcStartIdx + 1 + i)},${y(p.value)}`);
  const fcLine =
    forecast.length && history.length
      ? `M ${x(fcStartIdx)},${y(history[fcStartIdx].value)} L ${fcPts.join(" L ")}`
      : forecast.length
        ? `M ${fcPts.join(" L ")}`
        : "";

  const gridLines = [0, 0.5, 1];
  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit" });
  };

  const ariaLabel = `Serie de ${unitLabel} por día. Máximo ${max}.${
    forecast.length ? ` Incluye estimación de ${forecast.length} días.` : ""
  }`;

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={ariaLabel} preserveAspectRatio="none">
        {/* rejilla */}
        {gridLines.map((g) => (
          <line
            key={g}
            x1={padL}
            x2={W - padR}
            y1={padT + innerH * g}
            y2={padT + innerH * g}
            stroke="var(--c-border-subtle)"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {/* eje Y etiquetas (en unidades de gráfico, no escaladas en alto) */}
        {gridLines.map((g) => (
          <text
            key={`t${g}`}
            x={padL - 6}
            y={padT + innerH * g + 3}
            textAnchor="end"
            fontSize={9}
            fill="var(--c-text-muted)"
            fontFamily="var(--font-mono)"
          >
            {Math.round(max * (1 - g))}
          </text>
        ))}

        {/* histórico */}
        {histArea && <path d={histArea} fill="var(--c-brand)" opacity={0.12} />}
        {histLine && (
          <path d={histLine} fill="none" stroke="var(--c-brand)" strokeWidth={1.75} vectorEffect="non-scaling-stroke" />
        )}

        {/* divisoria "hoy" */}
        {forecast.length > 0 && history.length > 0 && (
          <line
            x1={x(fcStartIdx)}
            x2={x(fcStartIdx)}
            y1={padT}
            y2={padT + innerH}
            stroke="var(--c-border-strong)"
            strokeWidth={1}
            strokeDasharray="2 3"
            vectorEffect="non-scaling-stroke"
          />
        )}

        {/* estimación */}
        {fcLine && (
          <path
            d={fcLine}
            fill="none"
            stroke="var(--c-info-strong)"
            strokeWidth={1.75}
            strokeDasharray="5 4"
            vectorEffect="non-scaling-stroke"
          />
        )}
        {forecast.map((p, i) => (
          <circle key={p.date} cx={x(fcStartIdx + 1 + i)} cy={y(p.value)} r={2.5} fill="var(--c-info-strong)">
            <title>{`${fmtDate(p.date)} · ~${p.value} ${unitLabel} (est.)`}</title>
          </circle>
        ))}
      </svg>

      {/* etiquetas de eje X en HTML para no distorsionar */}
      <div className="mt-1 flex justify-between font-mono text-[9px] text-ink-muted">
        <span>{history.length ? fmtDate(history[0].date) : ""}</span>
        {forecast.length > 0 && <span className="text-info-strong">hoy</span>}
        <span>{all.length ? fmtDate(all[all.length - 1].date) : ""}</span>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Donut — distribución por categorías
// ----------------------------------------------------------------------------

export interface DonutSegment {
  label: string;
  value: number;
  color: string; // css var, ej. "var(--c-success)"
}

export function Donut({
  segments,
  centerValue,
  centerLabel,
  size = 132,
}: {
  segments: DonutSegment[];
  centerValue: string | number;
  centerLabel?: string;
  size?: number;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const stroke = 16;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const cx = size / 2;
  const cy = size / 2;

  let offset = 0;
  const arcs =
    total > 0
      ? segments
          .filter((s) => s.value > 0)
          .map((s) => {
            const frac = s.value / total;
            const dash = frac * c;
            const arc = (
              <circle
                key={s.label}
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={stroke}
                strokeDasharray={`${dash} ${c - dash}`}
                strokeDashoffset={-offset}
                transform={`rotate(-90 ${cx} ${cy})`}
              >
                <title>{`${s.label}: ${s.value} (${Math.round(frac * 100)}%)`}</title>
              </circle>
            );
            offset += dash;
            return arc;
          })
      : null;

  const ariaLabel = `Distribución: ${segments.map((s) => `${s.label} ${s.value}`).join(", ")}`;

  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={ariaLabel}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--c-bg-muted)" strokeWidth={stroke} />
        {arcs}
        <text
          x={cx}
          y={cy - 2}
          textAnchor="middle"
          fontSize={22}
          fontWeight={600}
          fill="var(--c-text-1)"
          fontFamily="var(--font-mono)"
        >
          {centerValue}
        </text>
        {centerLabel && (
          <text x={cx} y={cy + 14} textAnchor="middle" fontSize={9} fill="var(--c-text-muted)" fontFamily="var(--font-mono)">
            {centerLabel}
          </text>
        )}
      </svg>
      <ul className="space-y-1">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-2 text-xs text-ink-2">
            <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: s.color }} />
            <span className="flex-1">{s.label}</span>
            <span className="font-mono font-semibold text-ink-1 [font-variant-numeric:tabular-nums]">{s.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ----------------------------------------------------------------------------
// DiffBar — barra horizontal segmentada para distribuciones (ej. retrasos)
// ----------------------------------------------------------------------------

export interface DiffSegment {
  label: string;
  value: number;
  color: string;
}

export function DiffBar({ segments }: { segments: DiffSegment[] }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  return (
    <div>
      <div className="flex h-6 w-full overflow-hidden rounded-hx-sm bg-bg-muted" role="img" aria-label="distribución">
        {total > 0 &&
          segments.map((s) =>
            s.value > 0 ? (
              <div
                key={s.label}
                style={{ width: `${(s.value / total) * 100}%`, backgroundColor: s.color }}
                title={`${s.label}: ${s.value} (${Math.round((s.value / total) * 100)}%)`}
              />
            ) : null
          )}
      </div>
      <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-1.5 text-[11px] text-ink-2">
            <span className="inline-block h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: s.color }} />
            <span className="flex-1 truncate">{s.label}</span>
            <span className="font-mono font-semibold text-ink-1 [font-variant-numeric:tabular-nums]">{s.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
