import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Colors, FontSize, Spacing } from '../core/theme';
import { formatMoney } from '../core/format';
import { CategoryBreakdownItem } from '../services/transactionService';

const SIZE = 140;
const STROKE = 22;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

type Props = {
  data: CategoryBreakdownItem[];
  total: number;
  label: string;
};

export default function CategoryDonut({ data, total, label }: Props) {
  const segments = data.filter((d) => d.total > 0);
  const safeTotal = total > 0 ? total : 1;

  // Stack dash segments clockwise.
  let cumulative = 0;
  const arcs = segments.map((seg) => {
    const fraction = seg.total / safeTotal;
    const dash = fraction * CIRCUMFERENCE;
    const offset = CIRCUMFERENCE - (cumulative * CIRCUMFERENCE) / safeTotal;
    cumulative += seg.total;
    return { seg, dash, offset };
  });

  return (
    <View style={styles.container}>
      <View style={styles.chartWrap}>
        <Svg width={SIZE} height={SIZE}>
          <Circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            stroke={Colors.border}
            strokeWidth={STROKE}
            fill="none"
          />
          {arcs.map(({ seg, dash, offset }) => (
            <Circle
              key={seg.id}
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              stroke={seg.color || Colors.textMuted}
              strokeWidth={STROKE}
              fill="none"
              strokeDasharray={`${dash} ${CIRCUMFERENCE - dash}`}
              strokeDashoffset={offset}
              strokeLinecap="butt"
            />
          ))}
        </Svg>
        <View style={styles.center}>
          <Text style={styles.centerLabel}>{label}</Text>
          <Text style={styles.centerTotal}>{formatMoney(total)}</Text>
        </View>
      </View>
      {segments.length === 0 ? (
        <Text style={styles.empty}>No {label.toLowerCase()} this month</Text>
      ) : (
        <View style={styles.legend}>
          {segments.slice(0, 6).map((seg) => (
            <View key={seg.id} style={styles.legendRow}>
              <View style={[styles.dot, { backgroundColor: seg.color || Colors.textMuted }]} />
              <Text style={styles.legendName}>{seg.name}</Text>
              <Text style={styles.legendValue}>{Math.round((seg.total / safeTotal) * 100)}%</Text>
            </View>
          ))}
          {segments.length > 6 && (
            <Text style={styles.more}>+{segments.length - 6} more</Text>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', paddingVertical: Spacing.md },
  chartWrap: { width: SIZE, height: SIZE, justifyContent: 'center', alignItems: 'center' },
  center: { position: 'absolute', alignItems: 'center' },
  centerLabel: { fontSize: FontSize.sm, color: Colors.textSecondary },
  centerTotal: { fontSize: FontSize.lg, fontWeight: 'bold', color: Colors.text },
  legend: { alignSelf: 'stretch', marginTop: Spacing.md, gap: Spacing.sm },
  legendRow: { flexDirection: 'row', alignItems: 'center' },
  dot: { width: 12, height: 12, borderRadius: 6, marginRight: Spacing.sm },
  legendName: { flex: 1, fontSize: FontSize.sm, color: Colors.text },
  legendValue: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textSecondary },
  more: { fontSize: FontSize.sm, color: Colors.textMuted },
  empty: { marginTop: Spacing.md, color: Colors.textMuted, fontSize: FontSize.sm },
});
