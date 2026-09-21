import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle, Line, Polyline, Text as SvgText } from 'react-native-svg';
import { Colors, FontSize } from '../core/theme';
import { useI18n } from '../core/i18n';

const HEIGHT = 220;
const PAD_X = 12;
const TOP = 24;
const BOTTOM = 26;

type Props = {
  data: { x: string; value: number }[];
  color: string;
};

function compactMoney(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${(n / 1e9).toFixed(1).replace(/\.0$/, '')} M`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(1).replace(/\.0$/, '')} jt`;
  if (abs >= 1e3) return `${Math.round(n / 1e3)} rb`;
  return String(Math.round(n));
}

export default function ExpenseLineChart({ data, color }: Props) {
  const { t, locale } = useI18n();
  const [width, setWidth] = useState(0);

  const total = data.reduce((s, p) => s + p.value, 0);
  const plotW = Math.max(0, width - PAD_X * 2);
  const plotH = HEIGHT - TOP - BOTTOM;
  const maxV = Math.max(1, ...data.map((p) => p.value));

  const xy = (value: number, index: number) => ({
    x: data.length > 1 ? PAD_X + (index / (data.length - 1)) * plotW : plotW / 2,
    y: TOP + plotH * (1 - value / maxV),
  });

  const linePoints = data
    .map((p, i) => {
      const { x, y } = xy(p.value, i);
      return `${x},${y}`;
    })
    .join(' ');

  const xLabel = (key: string) => {
    const [y, m, d] = key.split('-').map(Number);
    const dt = new Date(y, Math.max(1, m || 1) - 1, d || 1);
    return key.length >= 10
      ? dt.toLocaleDateString(locale, { day: 'numeric', month: 'short' })
      : dt.toLocaleDateString(locale, { month: 'short' });
  };

  return (
    <View style={styles.box} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {total === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>{t('graph.no_data')}</Text>
        </View>
      ) : width > 0 ? (
        <Svg width={width} height={HEIGHT}>
          {[0, 0.5, 1].map((f) => {
            const gy = TOP + plotH * (1 - f);
            return (
              <Line
                key={f}
                x1={PAD_X}
                x2={width - PAD_X}
                y1={gy}
                y2={gy}
                stroke={f === 0 ? Colors.border : '#EFF3F8'}
                strokeWidth={1}
              />
            );
          })}
          <Polyline
            points={linePoints}
            fill="none"
            stroke={color}
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {data.map((p, i) => {
            const { x, y } = xy(p.value, i);
            return (
              <React.Fragment key={p.x}>
                <Circle cx={x} cy={y} r={4} fill="#FFFFFF" stroke={color} strokeWidth={2.5} />
                {p.value > 0 && (
                  <SvgText x={x} y={y - 9} fontSize={9.5} fontWeight="600" fill={Colors.text} textAnchor="middle">
                    {compactMoney(p.value)}
                  </SvgText>
                )}
                <SvgText x={x} y={HEIGHT - 8} fontSize={9.5} fill={Colors.textMuted} textAnchor="middle">
                  {xLabel(p.x)}
                </SvgText>
              </React.Fragment>
            );
          })}
        </Svg>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { width: '100%' },
  empty: {
    height: HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: { color: Colors.textMuted, fontSize: FontSize.sm, textAlign: 'center' },
});