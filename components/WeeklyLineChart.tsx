import React, { useMemo } from 'react';
import Svg, { Path, Circle, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';

type GradientOpacity = {
  start: number;
  end: number;
};

export type WeeklyLineSeries = {
  key: string;
  color: string;
  values: number[];
  enabled?: boolean;
  dashed?: boolean;
  pointRadius?: number;
  gradientOpacity?: GradientOpacity;
};

type WeeklyLineChartData = {
  day: string;
};

type WeeklyLineChartProps = {
  data: WeeklyLineChartData[];
  series: WeeklyLineSeries[];
  chartWidth: number;
  chartHeight: number;
  minValue?: number;
  maxValue?: number;
};

const DEFAULT_GRADIENT: GradientOpacity = { start: 0.3, end: 0.05 };

const WeeklyLineChart: React.FC<WeeklyLineChartProps> = ({
  data,
  series,
  chartWidth,
  chartHeight,
  minValue,
  maxValue,
}) => {
  const enabledSeries = useMemo(
    () => series.filter(item => item.enabled !== false),
    [series]
  );

  const values = useMemo(
    () => enabledSeries.flatMap(item => item.values),
    [enabledSeries]
  );

  const computedMin = minValue ?? Math.min(...values, 0);
  const computedMax = maxValue ?? Math.max(...values, 100);
  const range = computedMax - computedMin || 1;
  const stepX = data.length > 1 ? chartWidth / (data.length - 1) : chartWidth;

  const getPath = (points: number[]) => points.map((value, index) => {
    const x = index * stepX;
    const y = chartHeight - ((value - computedMin) / range) * chartHeight;
    return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
  }).join(' ');

  const getAreaPath = (path: string) =>
    `${path} L ${(data.length - 1) * stepX} ${chartHeight} L 0 ${chartHeight} Z`;

  return (
    <Svg width={chartWidth + 48} height={chartHeight + 30}>
      <Defs>
        {enabledSeries.map(item => {
          const gradient = item.gradientOpacity ?? DEFAULT_GRADIENT;
          return (
            <SvgLinearGradient key={item.key} id={`weekly-line-${item.key}`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={item.color} stopOpacity={`${gradient.start}`} />
              <Stop offset="1" stopColor={item.color} stopOpacity={`${gradient.end}`} />
            </SvgLinearGradient>
          );
        })}
      </Defs>

      {enabledSeries.map(item => {
        const path = getPath(item.values);
        const areaPath = getAreaPath(path);
        return (
          <React.Fragment key={item.key}>
            <Path d={areaPath} fill={`url(#weekly-line-${item.key})`} />
            <Path
              d={path}
              stroke={item.color}
              strokeWidth={2}
              fill="none"
              strokeDasharray={item.dashed ? '4,4' : undefined}
            />
          </React.Fragment>
        );
      })}

      {enabledSeries.map(item => {
        const radius = item.pointRadius ?? 4;
        return item.values.map((value, index) => (
          <Circle
            key={`${item.key}-point-${index}`}
            cx={index * stepX}
            cy={chartHeight - ((value - computedMin) / range) * chartHeight}
            r={radius}
            fill={item.color}
          />
        ));
      })}
    </Svg>
  );
};

export default WeeklyLineChart;
