import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { G, Path, Rect, Text as SvgText } from 'react-native-svg';
import { Colors, FontSize, Spacing } from '../core/theme';
import { CategoryBreakdownItem } from '../services/transactionService';

const HEIGHT = 300;
const PAD = 14;
const NODE_W = 16;
const MAX_EXPENSE_NODES = 8;

function compactMoney(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${(n / 1e9).toFixed(1).replace(/\.0$/, '')} M`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(1).replace(/\.0$/, '')} jt`;
  if (abs >= 1e3) return `${Math.round(n / 1e3)} rb`;
  return String(Math.round(n));
}

type Sink = {
  key: string;
  label: string;
  color: string;
  amount: number;
  exp: boolean;
};

type Props = {
  income: number;
  expenses: number;
  saved: number;
  invested: number;
  expenseBreakdown: CategoryBreakdownItem[];
  period: 'daily' | 'weekly' | 'monthly';
};

export default function IncomeAllocationChart({
  income,
  expenses,
  saved,
  invested,
  expenseBreakdown,
  period,
}: Props) {
  const [width, setWidth] = useState(0);

  const topCats = expenseBreakdown.filter((b) => b.total > 0).slice(0, MAX_EXPENSE_NODES);
  const extraTotal =
    expenseBreakdown.reduce((s, b) => s + (b.total > 0 ? b.total : 0), 0) -
    topCats.reduce((s, b) => s + b.total, 0);

  const sinks: Sink[] = [
    ...topCats.map((b) => ({ key: b.id, label: b.name, color: b.color || Colors.expense, amount: b.total, exp: true })),
    ...(extraTotal > 0
      ? [{ key: '__other__', label: 'Other', color: Colors.expense, amount: extraTotal, exp: true } as Sink]
      : []),
    { key: '__savings__', label: 'Savings', color: Colors.saving, amount: saved, exp: false },
    { key: '__investments__', label: 'Investments', color: Colors.investment, amount: invested, exp: false },
  ];

  const hasData = income !== 0 || expenses !== 0 || saved !== 0 || invested !== 0;

  const usableH = HEIGHT - PAD * 2;
  const maxA = Math.max(1, income, ...sinks.map((s) => s.amount));
  const clampNode = (v: number) => Math.max(6, Math.min(usableH, (v / maxA) * usableH));

  const incomeH = clampNode(income);
  const incomeY = PAD + (usableH - incomeH) / 2;

  const gap = 11;
  // Fixed gutters for labels so we can center the whole diagram in the card.
  const leftLbl = 52;
  const rightLbl = 100;
  const channel = Math.max(80, Math.min(150, width * 0.26));
  const diagramW = leftLbl + NODE_W + channel + NODE_W + 6 + rightLbl;
  const tx = Math.max(0, (width - diagramW) / 2);
  const srcX = leftLbl + 2;
  const destLeft = srcX + NODE_W + channel;
  const destRight = destLeft + NODE_W;

  const rawH = sinks.map((s) => clampNode(s.amount));
  const totalRaw = rawH.reduce((a, b) => a + b, 0);
  const totalGaps = gap * (sinks.length - 1);
  const destScale = totalRaw > usableH - totalGaps ? (usableH - totalGaps) / totalRaw : 1;
  const destH = rawH.map((h) => h * destScale);

  const destY: number[] = [];
  {
    let y = PAD;
    for (const h of destH) {
      destY.push(y);
      y += h + gap;
    }
  }

  const totalAlloc = sinks.reduce((s, x) => s + x.amount, 0);
  const bandScale = totalAlloc > 0 ? incomeH / totalAlloc : 1;

  const srcEdge = srcX + NODE_W;
  const mx = (srcEdge + destLeft) / 2;
  let cum = incomeY;

  const ribbon = (index: number) => {
    const sink = sinks[index];
    const t = Math.min(destH[index], sink.amount * bandScale);
    if (t <= 0) return null;
    const y0 = cum;
    cum += t;
    const y1 = destY[index];
    const y3 = destY[index] + destH[index];
    return (
      <Path
        key={sink.key}
        d={`M ${srcEdge} ${y0} C ${mx} ${y0}, ${mx} ${y1}, ${destLeft} ${y1} L ${destLeft} ${y3} C ${mx} ${y3}, ${mx} ${y0 + t}, ${srcEdge} ${y0 + t} Z`}
        fill={sink.color}
        opacity={0.32}
      />
    );
  };

  const periodLabel = period === 'daily' ? 'day' : period === 'weekly' ? 'week' : 'month';

  return (
    <View style={styles.container}>
      <View style={styles.hint}>
        <Text style={styles.hintText}>
          How income is allocated · Expenses expanded by category · Savings · Investments
        </Text>
      </View>

      <View style={styles.chartBox} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {!hasData ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>
              No income allocation in this {periodLabel} period
            </Text>
          </View>
        ) : width > 0 ? (
          <Svg width={width} height={HEIGHT}>
            <G transform={`translate(${tx},0)`}>
              {sinks.map((_, i) => ribbon(i))}

              <Rect x={srcX} y={incomeY} width={NODE_W} height={incomeH} rx={3} fill={Colors.income} />
              <SvgText
                x={srcX - 6}
                y={incomeY + incomeH / 2 - 5}
                fontSize={11}
                fontWeight="600"
                fill={Colors.text}
                textAnchor="end"
              >
                Income
              </SvgText>
              <SvgText
                x={srcX - 6}
                y={incomeY + incomeH / 2 + 7}
                fontSize={10}
                fill={Colors.textMuted}
                textAnchor="end"
              >
                {compactMoney(income)}
              </SvgText>

              {/* Expenses group header */}
              {sinks.some((s) => s.exp) && (
                <SvgText
                  x={destLeft}
                  y={PAD - 5}
                  fontSize={10}
                  fontWeight="600"
                  fill={Colors.expense}
                >
                  Expenses
                </SvgText>
              )}

              {sinks.map((sink, i) => (
                <React.Fragment key={sink.key}>
                  <Rect
                    x={destLeft}
                    y={destY[i]}
                    width={NODE_W}
                    height={destH[i]}
                    rx={2}
                    fill={sink.color}
                  />
                  <SvgText
                    x={destRight + 6}
                    y={destY[i] + destH[i] / 2 + 3.5}
                    fontSize={9.5}
                    fontWeight={sink.exp ? '500' : '600'}
                    fill={Colors.text}
                    textAnchor="start"
                  >
                    {sink.label} · {compactMoney(sink.amount)}
                  </SvgText>
                </React.Fragment>
              ))}
            </G>
          </Svg>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingVertical: Spacing.sm },
  hint: { marginBottom: Spacing.sm },
  hintText: { fontSize: FontSize.xs, color: Colors.textMuted },
  chartBox: { width: '100%' },
  emptyBox: {
    height: HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: { color: Colors.textMuted, fontSize: FontSize.sm, textAlign: 'center' },
});