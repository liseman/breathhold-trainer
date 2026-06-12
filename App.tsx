import { Audio } from 'expo-av';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { CUE_COUNT, CUE_DONE, CUE_GO, CUE_HALFWAY, CUE_NEXT, CUE_READY } from './cues';
import { BUFFER_SEC, EXERCISES, TOTAL_SEC, WORK_SEC, buildPhases, type Phase } from './exercises';
import { LukeAnime } from './LukeAnime';

const PAPER = '#F4EFE6';
const INK = '#101010';
const ORANGE = '#FF5A00';
const BLUE = '#1B3BFF';

const TICK_MS = 200;
const CUE_STALE_SEC = 1.6;

type Mode = 'idle' | 'running' | 'done';

type Cue = { at: number; asset: number };

function buildCues(phases: Phase[]): Cue[] {
  const cues: Cue[] = [];
  for (const phase of phases) {
    const slug = EXERCISES[phase.exIndex].slug;
    if (phase.kind === 'buffer') {
      cues.push({ at: phase.startSec, asset: phase.exIndex === 0 ? CUE_READY : CUE_NEXT[slug] });
    } else {
      cues.push({ at: phase.startSec, asset: CUE_GO });
      cues.push({ at: phase.startSec + WORK_SEC / 2, asset: CUE_HALFWAY });
    }
    for (const n of [3, 2, 1]) {
      cues.push({ at: phase.endSec - n, asset: CUE_COUNT[n] });
    }
  }
  cues.push({ at: TOTAL_SEC, asset: CUE_DONE });
  return cues.sort((a, b) => a.at - b.at);
}

async function playCue(source: number) {
  try {
    const { sound } = await Audio.Sound.createAsync(source, { shouldPlay: true, volume: 1 });
    sound.setOnPlaybackStatusUpdate((status) => {
      if ('didJustFinish' in status && status.didJustFinish) {
        sound.unloadAsync().catch(() => {});
      }
    });
  } catch {
    // Audio is a nice-to-have; never break the timer over it.
  }
}

function formatClock(totalSeconds: number) {
  const safe = Math.max(0, Math.ceil(totalSeconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}

export default function App() {
  const { width } = useWindowDimensions();
  const [mode, setMode] = useState<Mode>('idle');
  const [paused, setPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const phases = useMemo(buildPhases, []);
  const cues = useMemo(() => buildCues(phases), [phases]);

  const baseElapsedRef = useRef(0);
  const resumedAtRef = useRef(0);
  const cueIndexRef = useRef(0);
  const pausedRef = useRef(false);

  useEffect(() => {
    Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (mode !== 'running') return;
    activateKeepAwakeAsync().catch(() => {});
    const interval = setInterval(() => {
      const now = pausedRef.current
        ? baseElapsedRef.current
        : baseElapsedRef.current + (Date.now() - resumedAtRef.current) / 1000;
      while (cueIndexRef.current < cues.length && cues[cueIndexRef.current].at <= now) {
        const cue = cues[cueIndexRef.current];
        cueIndexRef.current += 1;
        if (now - cue.at < CUE_STALE_SEC) playCue(cue.asset);
      }
      setElapsed(now);
      if (now >= TOTAL_SEC) setMode('done');
    }, TICK_MS);
    return () => {
      clearInterval(interval);
      deactivateKeepAwake().catch(() => {});
    };
  }, [mode, cues]);

  const start = () => {
    baseElapsedRef.current = 0;
    resumedAtRef.current = Date.now();
    cueIndexRef.current = 0;
    pausedRef.current = false;
    setPaused(false);
    setElapsed(0);
    setMode('running');
  };

  const togglePause = () => {
    if (pausedRef.current) {
      resumedAtRef.current = Date.now();
      pausedRef.current = false;
      setPaused(false);
    } else {
      baseElapsedRef.current += (Date.now() - resumedAtRef.current) / 1000;
      pausedRef.current = true;
      setPaused(true);
    }
  };

  const quit = () => {
    pausedRef.current = false;
    setPaused(false);
    setMode('idle');
  };

  const figureSize = Math.min(width * 0.62, 250);

  if (mode === 'idle') {
    return (
      <SafeAreaView style={styles.screen}>
        <StatusBar style="dark" />
        <ScrollView contentContainerStyle={styles.idleScroll}>
          <Text style={styles.logo}>7MW</Text>
          <Text style={styles.tagline}>THE SEVEN-MINUTE WORKOUT</Text>
          <View style={styles.figureBox}>
            <LukeAnime anim="wave" size={figureSize} />
          </View>
          <Block color={ORANGE} onPress={start} big>
            START
          </Block>
          <Text style={styles.meta}>12 EXERCISES · 30S ON · 10S OFF</Text>
          <Text style={styles.metaSmall}>NO ADS. NO ACCOUNT. NO DATA. JUST SWEAT.</Text>
          <View style={styles.list}>
            {EXERCISES.map((exercise, index) => (
              <Text key={exercise.slug} style={styles.listRow}>
                {String(index + 1).padStart(2, '0')} {exercise.name}
              </Text>
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (mode === 'done') {
    return (
      <SafeAreaView style={styles.screen}>
        <StatusBar style="dark" />
        <View style={styles.doneWrap}>
          <Text style={styles.doneTitle}>DONE.</Text>
          <View style={styles.figureBox}>
            <LukeAnime anim="victory" size={figureSize} />
          </View>
          <Text style={styles.meta}>8 MINUTES. 12 EXERCISES. 0 EXCUSES.</Text>
          <Block color={BLUE} onPress={start} big light>
            AGAIN
          </Block>
          <Pressable onPress={quit} hitSlop={12}>
            <Text style={styles.quietLink}>BACK</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const phase = phases.find((p) => elapsed < p.endSec) ?? phases[phases.length - 1];
  const exercise = EXERCISES[phase.exIndex];
  const phaseLeft = phase.endSec - elapsed;
  const isBuffer = phase.kind === 'buffer';

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="dark" />
      <View style={styles.runWrap}>
        <View style={styles.topRow}>
          <Text style={styles.topChip}>
            {phase.exIndex + 1}/{EXERCISES.length}
          </Text>
          <Text style={styles.topClock}>-{formatClock(TOTAL_SEC - elapsed)}</Text>
          <Pressable onPress={quit} hitSlop={12}>
            <Text style={styles.topQuit}>✕</Text>
          </Pressable>
        </View>

        <Text style={[styles.phaseKind, { color: isBuffer ? BLUE : ORANGE }]}>
          {isBuffer ? (phase.exIndex === 0 ? 'GET READY' : 'REST — NEXT UP') : 'GO'}
        </Text>
        <Text style={styles.exerciseName}>{exercise.name}</Text>
        <Text style={styles.tip}>{isBuffer ? `${BUFFER_SEC} SECOND BUFFER` : exercise.tip}</Text>

        <Text style={[styles.countdown, { color: isBuffer ? BLUE : ORANGE }]}>
          {Math.max(1, Math.ceil(phaseLeft))}
        </Text>

        <View style={styles.figureBox}>
          <LukeAnime anim={exercise.slug} size={figureSize} playing={!paused} />
        </View>

        <View style={styles.progressRow}>
          {EXERCISES.map((e, index) => (
            <View
              key={e.slug}
              style={[
                styles.progressCell,
                index < phase.exIndex && styles.progressDone,
                index === phase.exIndex && { backgroundColor: isBuffer ? BLUE : ORANGE },
              ]}
            />
          ))}
        </View>

        <Block color={paused ? ORANGE : PAPER} onPress={togglePause}>
          {paused ? 'RESUME' : 'PAUSE'}
        </Block>
      </View>
    </SafeAreaView>
  );
}

type BlockProps = {
  children: string;
  color: string;
  onPress: () => void;
  big?: boolean;
  light?: boolean;
};

function Block({ children, color, onPress, big, light }: BlockProps) {
  return (
    <View style={styles.blockWrap}>
      <View style={styles.blockShadow} />
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.blockFace,
          { backgroundColor: color },
          big && styles.blockBig,
          pressed && styles.blockPressed,
        ]}
      >
        <Text style={[styles.blockText, big && styles.blockTextBig, light && { color: PAPER }]}>
          {children}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: PAPER },
  idleScroll: { alignItems: 'center', paddingVertical: 28, paddingHorizontal: 20 },
  logo: {
    fontSize: 88,
    fontWeight: '900',
    color: INK,
    letterSpacing: -4,
    marginTop: 8,
  },
  tagline: { fontSize: 14, fontWeight: '900', color: INK, letterSpacing: 2, marginBottom: 8 },
  figureBox: { marginVertical: 8 },
  meta: { fontSize: 13, fontWeight: '900', color: INK, letterSpacing: 1, marginTop: 18 },
  metaSmall: { fontSize: 11, fontWeight: '700', color: INK, letterSpacing: 1, marginTop: 6 },
  list: {
    marginTop: 20,
    alignSelf: 'stretch',
    borderWidth: 3,
    borderColor: INK,
    padding: 14,
    backgroundColor: '#FFFFFF',
  },
  listRow: {
    fontSize: 13,
    fontWeight: '700',
    color: INK,
    letterSpacing: 1,
    lineHeight: 22,
    fontVariant: ['tabular-nums'],
  },
  runWrap: { flex: 1, alignItems: 'center', paddingHorizontal: 20, paddingTop: 10 },
  topRow: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  topChip: {
    fontSize: 16,
    fontWeight: '900',
    color: PAPER,
    backgroundColor: INK,
    paddingHorizontal: 10,
    paddingVertical: 4,
    overflow: 'hidden',
  },
  topClock: { fontSize: 16, fontWeight: '900', color: INK, fontVariant: ['tabular-nums'] },
  topQuit: { fontSize: 22, fontWeight: '900', color: INK, paddingHorizontal: 6 },
  phaseKind: { fontSize: 14, fontWeight: '900', letterSpacing: 2, marginTop: 10 },
  exerciseName: {
    fontSize: 30,
    fontWeight: '900',
    color: INK,
    letterSpacing: -0.5,
    textAlign: 'center',
    marginTop: 2,
  },
  tip: { fontSize: 12, fontWeight: '700', color: INK, letterSpacing: 1, marginTop: 4 },
  countdown: {
    fontSize: 96,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
    letterSpacing: -3,
    marginVertical: -6,
  },
  progressRow: { flexDirection: 'row', gap: 5, marginVertical: 14 },
  progressCell: {
    width: 18,
    height: 18,
    borderWidth: 3,
    borderColor: INK,
    backgroundColor: PAPER,
  },
  progressDone: { backgroundColor: INK },
  doneWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  doneTitle: { fontSize: 72, fontWeight: '900', color: INK, letterSpacing: -3 },
  quietLink: { fontSize: 13, fontWeight: '900', color: INK, letterSpacing: 2, marginTop: 18 },
  blockWrap: { marginTop: 10 },
  blockShadow: {
    position: 'absolute',
    top: 7,
    left: 7,
    right: -7,
    bottom: -7,
    backgroundColor: INK,
  },
  blockFace: {
    borderWidth: 4,
    borderColor: INK,
    paddingHorizontal: 38,
    paddingVertical: 12,
    alignItems: 'center',
  },
  blockBig: { paddingHorizontal: 64, paddingVertical: 18 },
  blockPressed: { transform: [{ translateX: 4 }, { translateY: 4 }] },
  blockText: { fontSize: 18, fontWeight: '900', color: INK, letterSpacing: 2 },
  blockTextBig: { fontSize: 28, letterSpacing: 3 },
});
