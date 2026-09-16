'use client';

import { useState } from 'react';
import { AxisBottom, AxisLeft } from '@visx/axis';
import { GridRows } from '@visx/grid';
import { ParentSize } from '@visx/responsive';
import { scaleLinear, scaleTime } from '@visx/scale';
import { AreaClosed, LinePath } from '@visx/shape';

const margin = { top: 18, right: 18, bottom: 42, left: 50 };

function dateValue(value) {
  return new Date(`${value}T12:00:00Z`);
}

function dateLabel(value, granularity, locale, short = false) {
  const options = granularity === 'month'
    ? { month: short ? 'short' : 'long', year: 'numeric', timeZone: 'Europe/Oslo' }
    : { day: 'numeric', month: 'short', year: short ? '2-digit' : 'numeric', timeZone: 'Europe/Oslo' };
  return new Intl.DateTimeFormat(locale, options).format(dateValue(value));
}

function Chart({ width, height, rows, granularity, locale, labels }) {
  const [selectedIndex, setSelectedIndex] = useState(null);
  if (width < 120 || height < 120 || !rows.length) return null;
  const points = rows.map((row) => ({ ...row, value: dateValue(row.date) }));
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const first = points[0].value;
  const last = points.at(-1).value;
  const sameDate = first.getTime() === last.getTime();
  const xScale = scaleTime({
    domain: sameDate ? [new Date(first.getTime() - 43_200_000), new Date(last.getTime() + 43_200_000)] : [first, last],
    range: [0, innerWidth],
  });
  const yScale = scaleLinear({ domain: [0, Math.max(1, ...points.map((point) => point.views))], range: [innerHeight, 0], nice: true });
  const selected = selectedIndex === null ? null : points[selectedIndex];
  const selectFromPointer = (event) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const target = xScale.invert(event.clientX - bounds.left - margin.left).getTime();
    let nearest = 0;
    for (let index = 1; index < points.length; index += 1) {
      if (Math.abs(points[index].value.getTime() - target) < Math.abs(points[nearest].value.getTime() - target)) nearest = index;
    }
    setSelectedIndex(nearest);
  };
  const moveSelection = (event) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const step = event.key === 'ArrowRight' ? 1 : -1;
    setSelectedIndex((current) => Math.max(0, Math.min(points.length - 1, (current ?? points.length - 1) + step)));
  };
  const axisColor = '#71695e';
  const numberFormat = new Intl.NumberFormat(locale);
  const selectedDescription = selected
    ? labels.point.replace('{date}', dateLabel(selected.date, granularity, locale)).replace('{count}', numberFormat.format(selected.views))
    : labels.explore;
  return <svg width={width} height={height} role="img" tabIndex="0"
    aria-label={`${labels.title}. ${selectedDescription}`}
    onFocus={() => setSelectedIndex((current) => current ?? points.length - 1)} onBlur={() => setSelectedIndex(null)} onKeyDown={moveSelection}>
    <title>{labels.title}</title>
    <g transform={`translate(${margin.left},${margin.top})`}>
      <GridRows scale={yScale} width={innerWidth} stroke="#e5ddd1" strokeDasharray="3 4" />
      <AreaClosed data={points} x={(point) => xScale(point.value)} y={(point) => yScale(point.views)} yScale={yScale} fill="rgba(50, 97, 69, .12)" />
      <LinePath data={points} x={(point) => xScale(point.value)} y={(point) => yScale(point.views)} stroke="#326145" strokeWidth={2.5} />
      <AxisLeft scale={yScale} numTicks={5} hideAxisLine hideTicks tickFormat={(value) => numberFormat.format(value)} tickLabelProps={() => ({ fill: axisColor, fontSize: 11, textAnchor: 'end', dx: -7, dy: 3 })} />
      <AxisBottom top={innerHeight} scale={xScale} numTicks={width < 560 ? 4 : 7} hideAxisLine tickStroke="#cfc3b3" tickFormat={(value) => dateLabel(new Date(value).toISOString().slice(0, 10), granularity, locale, true)} tickLabelProps={() => ({ fill: axisColor, fontSize: 11, textAnchor: 'middle', dy: 6 })} />
      <rect width={innerWidth} height={innerHeight} fill="transparent" onPointerMove={selectFromPointer} onPointerLeave={() => setSelectedIndex(null)} />
      {selected && <g transform={`translate(${xScale(selected.value)},0)`} pointerEvents="none">
        <line y1="0" y2={innerHeight} stroke="#8b7f70" strokeDasharray="3 3" />
        <circle cy={yScale(selected.views)} r="5" fill="#326145" stroke="white" strokeWidth="2" />
        <g transform={`translate(${xScale(selected.value) > innerWidth - 150 ? -150 : 8},8)`}>
          <rect width="142" height="48" rx="7" fill="#fffdf8" stroke="#cfc3b3" />
          <text x="9" y="19" fill="#71695e" fontSize="11">{dateLabel(selected.date, granularity, locale)}</text>
          <text x="9" y="38" fill="#27231f" fontSize="13" fontWeight="700">{labels.value.replace('{count}', numberFormat.format(selected.views))}</text>
        </g>
      </g>}
    </g>
  </svg>;
}

export default function UsageTrendChart({ rows, granularity, locale, labels }) {
  if (!rows.some((row) => row.views > 0)) return <p className="usage-empty">{labels.empty}</p>;
  return <div className="usage-chart-frame"><ParentSize debounceTime={100}>{({ width, height }) => <Chart width={width} height={height} rows={rows} granularity={granularity} locale={locale} labels={labels} />}</ParentSize></div>;
}
