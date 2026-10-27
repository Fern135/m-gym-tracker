/**
 * @file RestTimer.tsx
 * @description Full-screen rest countdown. When it ends the phone vibrates
 * (and a notification fires if the app is in the background) until you tap
 * Stop; one second later you're back on the exercise.
 */
import { useEffect, useState } from 'react';
import { Animated, StyleSheet, Vibration, View } from 'react-native';
import { Button, Portal, Text, useTheme } from 'react-native-paper';
import { cancelRestEnd, scheduleRestEnd } from '../lib/notifications';
import { FONT, plate } from '../lib/theme';
import { formatClock } from '../lib/workout';

type Props = {
  /** Rest length from settings. */
  seconds: number;
  /** Called after Stop (+1 s) or Skip rest, with how long the rest actually lasted. */
  onFinish: (restMs: number) => void;
};

/**
 * The rest timer overlay. Mount it to start resting; it calls onFinish when done.
 * @param props - Rest length and finish handler
 * @returns The overlay
 */
export function RestTimer({ seconds, onFinish }: Props) {
  const { colors } = useTheme();
  // Counting from an end time (not ticks) keeps it right after the app was backgrounded.
  const [endAt, setEndAt] = useState(() => Date.now() + seconds * 1000);
  const [now, setNow] = useState(() => Date.now());
  const [phase, setPhase] = useState<'counting' | 'over' | 'resuming'>('counting');
  // Full length of this rest, for the progress bar; ±15 s changes it too.
  const [total, setTotal] = useState(seconds * 1000);
  const [startedAt] = useState(() => Date.now());
  const [pulse] = useState(() => new Animated.Value(1));

  const remaining = (endAt - now) / 1000;

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => { clearInterval(t); Vibration.cancel(); };
  }, []);

  // Background alert, rescheduled whenever the end time moves (±15 s).
  useEffect(() => {
    let id: string | null = null;
    let live = true;
    scheduleRestEnd(new Date(endAt)).then((n) => { if (live) id = n; else cancelRestEnd(n); });
    return () => { live = false; cancelRestEnd(id); };
  }, [endAt]);

  useEffect(() => {
    if (phase !== 'counting' || remaining > 0) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reacting to the clock running out, not to props
    setPhase('over');
    Vibration.vibrate([0, 600, 400], true);
    // One pulsing element to pull attention to Stop.
    Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1.06, duration: 400, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1, duration: 400, useNativeDriver: true }),
    ])).start();
  }, [remaining, phase, pulse]);

  const adjust = (delta: number) => {
    setEndAt((e) => Math.max(Date.now() + 1000, e + delta * 1000));
    setTotal((t) => Math.max(t + delta * 1000, 1000));
  };
  const stop = () => {
    const rested = Date.now() - startedAt; // the 1 s "Next set" pause isn't rest
    Vibration.cancel();
    pulse.stopAnimation();
    setPhase('resuming');
    setTimeout(() => onFinish(rested), 1000);
  };

  return (
    <Portal>
      <View style={[StyleSheet.absoluteFill, styles.wrap, { backgroundColor: colors.background }]} accessibilityViewIsModal>
        {phase === 'counting' && (
          <>
            <Text variant="titleLarge" style={{ color: colors.onSurfaceVariant }}>Rest</Text>
            <Text style={[styles.clock, { color: colors.onSurface }]} accessibilityLiveRegion="polite">{formatClock(remaining)}</Text>
            <View style={[styles.track, { backgroundColor: colors.surfaceVariant }]}>
              <View style={[styles.bar, { backgroundColor: plate.blue, width: `${Math.max(0, Math.min(1, (remaining * 1000) / total)) * 100}%` }]} />
            </View>
            <View style={styles.row}>
              <Button mode="outlined" onPress={() => adjust(-15)}>−15 s</Button>
              <Button mode="outlined" onPress={() => adjust(15)}>+15 s</Button>
            </View>
            <Button onPress={() => onFinish(Date.now() - startedAt)} style={{ marginTop: 8 }}>Skip rest</Button>
          </>
        )}
        {phase === 'over' && (
          <>
            <Text style={[styles.over, { color: colors.onSurface }]}>Rest&apos;s over</Text>
            <Animated.View style={{ transform: [{ scale: pulse }], alignSelf: 'stretch' }}>
              <Button mode="contained" onPress={stop} contentStyle={styles.stop} labelStyle={styles.stopLabel}>Stop</Button>
            </Animated.View>
          </>
        )}
        {phase === 'resuming' && <Text style={[styles.over, { color: colors.onSurface }]}>Next set</Text>}
      </View>
    </Portal>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 },
  clock: { fontFamily: FONT.display, fontSize: 120, lineHeight: 130 },
  over: { fontFamily: FONT.display, fontSize: 56, lineHeight: 62 },
  track: { alignSelf: 'stretch', height: 8, borderRadius: 4, overflow: 'hidden' },
  bar: { height: 8 },
  row: { flexDirection: 'row', gap: 12, marginTop: 8 },
  stop: { height: 80 },
  stopLabel: { fontSize: 24, lineHeight: 30 },
});
