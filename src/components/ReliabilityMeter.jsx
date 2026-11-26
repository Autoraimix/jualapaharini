import React from 'react';
import { getActivePlatforms, getReliabilitySegments } from '../utils/format';

export function computeMultiPlatformReliability(ratings, fallback = 4.8) {
  const nums = (ratings || [])
    .filter((v) => v !== null && v !== undefined && v !== '')
    .map(Number)
    .filter((n) => Number.isFinite(n) && n >= 1 && n <= 5);
  if (nums.length === 0) return Number(fallback || 4.8);
  return Number((nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(1));
}

export function ReliabilityMeter({ product, score, verified }) {
  const activePlatforms = product ? getActivePlatforms(product) : [];
  const platformRatings = activePlatforms
    .map((pl) => pl.rating)
    .filter((r) => r !== null && Number.isFinite(r));

  const combinedScore =
    platformRatings.length > 0
      ? computeMultiPlatformReliability(platformRatings, score ?? product?.reliability_score)
      : Number(score ?? product?.reliability_score ?? 4.8);

  const filled = getReliabilitySegments(combinedScore);

  const tooltip =
    activePlatforms.length > 0
      ? `Combined rating from ${activePlatforms
          .filter((pl) => pl.rating !== null)
          .map((pl) => `${pl.shortName} (★ ${pl.rating.toFixed(1)})`)
          .join(' • ')}`
      : `Reliability ${combinedScore.toFixed(1)} out of 5`;

  return (
    <div className="flex items-center gap-1.5" title={tooltip}>
      <span className="text-[11px] font-semibold text-[#78716C]">
        {verified ? 'Reliable' : 'Rated'}
      </span>
      <div className="flex items-center gap-[3px]" aria-label={tooltip}>
        {[1, 2, 3, 4, 5].map((seg) => (
          <span
            key={seg}
            className={`h-3.5 w-1.5 rounded-full transition-colors ${
              seg <= filled ? 'bg-[#F58C56]' : 'bg-[#EAE2D8]'
            }`}
          />
        ))}
      </div>
      <span className="text-[11px] font-bold text-[#1D1C1A]">{combinedScore.toFixed(1)}</span>
    </div>
  );
}

/**
 * Semi-circular segmented arch gauge inspired by the sample dashboard design.
 */
export function SegmentedArchGauge({
  totalSegments = 10,
  filledSegments = 8,
  centerValue = '4.8',
  centerLabel = 'Avg Reliability',
  subLabel = 'Verified Affiliate Picks',
}) {
  const segments = Array.from({ length: totalSegments }, (_, idx) => {
    const startAngle = -180 + idx * (180 / totalSegments) + 3;
    const endAngle = -180 + (idx + 1) * (180 / totalSegments) - 3;
    const rOuter = 94;
    const rInner = 64;
    const cx = 110;
    const cy = 106;

    const rad = (deg) => (deg * Math.PI) / 180;
    const x1 = cx + rOuter * Math.cos(rad(startAngle));
    const y1 = cy + rOuter * Math.sin(rad(startAngle));
    const x2 = cx + rOuter * Math.cos(rad(endAngle));
    const y2 = cy + rOuter * Math.sin(rad(endAngle));
    const x3 = cx + rInner * Math.cos(rad(endAngle));
    const y3 = cy + rInner * Math.sin(rad(endAngle));
    const x4 = cx + rInner * Math.cos(rad(startAngle));
    const y4 = cy + rInner * Math.sin(rad(startAngle));

    const d = [
      `M ${x1.toFixed(2)} ${y1.toFixed(2)}`,
      `A ${rOuter} ${rOuter} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`,
      `L ${x3.toFixed(2)} ${y3.toFixed(2)}`,
      `A ${rInner} ${rInner} 0 0 0 ${x4.toFixed(2)} ${y4.toFixed(2)}`,
      'Z',
    ].join(' ');

    return { idx, d, active: idx < filledSegments };
  });

  return (
    <div className="relative mx-auto flex w-full max-w-[240px] flex-col items-center">
      <svg viewBox="0 0 220 120" className="w-full overflow-visible">
        {segments.map((s) => (
          <path
            key={s.idx}
            d={s.d}
            fill={s.active ? '#F58C56' : '#E7E0D6'}
            className="transition-all duration-300"
          />
        ))}
      </svg>
      <div className="-mt-12 text-center">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-[#F58C56]">
          ⚡ {centerLabel}
        </div>
        <div className="mt-0.5 text-3xl font-extrabold tracking-tight text-[#1D1C1A]">
          {centerValue}
        </div>
        <div className="text-xs font-medium text-[#8C837A]">{subLabel}</div>
      </div>
    </div>
  );
}
