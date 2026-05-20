import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { HALF_CUE_ASSETS } from './halfwayCues';

type SessionKind = 'technique' | 'co2' | 'o2' | 'pb' | 'recovery';
type Effort = 'easy' | 'solid' | 'hard';
type PhaseKind = 'rest' | 'hold' | 'recovery' | 'settle';

type LogEntry = {
  id: string;
  date: string;
  kind: SessionKind;
  title: string;
  completed: boolean;
  inferred?: boolean;
  effort?: Effort;
  notes?: string;
  bestHoldSec?: number;
};

type TableRow = {
  round: number;
  restSec: number;
  holdSec: number;
};

type Phase = {
  id: string;
  kind: PhaseKind;
  label: string;
  durationSec: number;
  roundLabel?: string;
};

type DailyPlan = {
  kind: SessionKind;
  title: string;
  summary: string;
  yesterdayContext?: string;
  why: string;
  whenToStop: string;
  pbGuidance: string;
  readyForPb: boolean;
  tableRows: TableRow[];
  phases: Phase[];
  cues: string[];
};

type StoredState = {
  pbSec: number;
  logs: LogEntry[];
};

const STORAGE_KEY = 'breathhold-trainer-v2';
const breatheCue = require('./assets/audio/breathe.mp3');
const holdCue = require('./assets/audio/hold.mp3');

const KIND_LABEL: Record<SessionKind, string> = {
  technique: 'Technique',
  co2: 'CO₂',
  o2: 'O₂',
  pb: 'PB',
  recovery: 'Recovery',
};

const EFFORT_LABEL: Record<Effort, string> = {
  easy: 'Easy',
  solid: 'Solid',
  hard: 'Hard',
};

const REST_DAY_TITLE = 'Rest day';

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function formatTime(totalSeconds: number) {
  const safe = Math.max(0, Math.round(totalSeconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function parseTime(mins: string, secs: string) {
  const m = Number.parseInt(mins || '0', 10) || 0;
  const s = Number.parseInt(secs || '0', 10) || 0;
  return clamp(m * 60 + s, 45, 600);
}

function todayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function addDays(dateKey: string, delta: number) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return todayKey(date);
}

function daysBetween(a: string, b: string) {
  const start = new Date(`${a}T00:00:00Z`).getTime();
  const end = new Date(`${b}T00:00:00Z`).getTime();
  return Math.round((end - start) / 86400000);
}

function sortLogs(logs: LogEntry[]) {
  return [...logs].sort((a, b) => b.date.localeCompare(a.date));
}

function getLogForDate(logs: LogEntry[], date: string) {
  return logs.find((log) => log.date === date) ?? null;
}

function makeRestDayLog(date: string, inferred = true): LogEntry {
  return {
    id: inferred ? `rest-${date}` : `${Date.now()}`,
    date,
    kind: 'recovery',
    title: REST_DAY_TITLE,
    completed: true,
    inferred,
    effort: 'easy',
    notes: inferred ? 'Auto-logged rest day.' : undefined,
  };
}

function normalizeLogs(logs: LogEntry[]) {
  const sorted = sortLogs(logs);
  const deduped: LogEntry[] = [];
  const seenDates = new Set<string>();

  for (const log of sorted) {
    if (seenDates.has(log.date)) continue;
    seenDates.add(log.date);
    deduped.push(log);
  }

  if (deduped.length === 0) return deduped;

  const oldest = deduped[deduped.length - 1]?.date;
  if (!oldest) return deduped;

  const byDate = new Map(deduped.map((log) => [log.date, log]));
  const filled: LogEntry[] = [];
  const end = addDays(todayKey(), -1);

  for (let date = oldest; date <= end; date = addDays(date, 1)) {
    filled.push(byDate.get(date) ?? makeRestDayLog(date));
  }

  const todayLog = byDate.get(todayKey());
  if (todayLog) filled.push(todayLog);

  return sortLogs(filled);
}

function analyzeNotes(notes?: string) {
  const text = notes?.toLowerCase() ?? '';
  return {
    needsRecovery: /(bad sleep|slept badly|tired|fatigue|fatigued|sick|ill|dizzy|headache|stress|stressed|tight|rough|off)/.test(text),
    feltStrong: /(easy|great|strong|fresh|smooth|good|amazing|solid|clean)/.test(text),
  };
}

function describeYesterday(logs: LogEntry[], today = todayKey()) {
  const yesterday = getLogForDate(logs, addDays(today, -1));
  if (!yesterday) return 'Yesterday: none logged.';

  const note = yesterday.notes?.trim();
  const bits = [`Yesterday: ${KIND_LABEL[yesterday.kind]}`];
  if (yesterday.inferred) bits.push('(assumed rest)');
  if (yesterday.effort && !yesterday.inferred) bits.push(`· ${EFFORT_LABEL[yesterday.effort]}`);
  if (note && note !== 'Auto-logged rest day.') bits.push(`· ${note}`);
  return bits.join(' ');
}

function recentCompleted(logs: LogEntry[], days: number) {
  const today = todayKey();
  return logs.filter((log) => log.completed && daysBetween(log.date, today) <= days - 1);
}

function countKinds(logs: LogEntry[], kinds: SessionKind[], days: number) {
  return recentCompleted(logs, days).filter((log) => kinds.includes(log.kind)).length;
}

function getLastCompleted(logs: LogEntry[]) {
  return sortLogs(logs).find((log) => log.completed) ?? null;
}

function getLastPb(logs: LogEntry[]) {
  return sortLogs(logs).find((log) => log.completed && log.kind === 'pb') ?? null;
}

function pickRandomHalfCue(lastIndex: number | null) {
  let nextIndex = Math.floor(Math.random() * HALF_CUE_ASSETS.length);
  while (HALF_CUE_ASSETS.length > 1 && lastIndex !== null && nextIndex === lastIndex) {
    nextIndex = Math.floor(Math.random() * HALF_CUE_ASSETS.length);
  }
  return { asset: HALF_CUE_ASSETS[nextIndex], index: nextIndex };
}

async function playCue(source: number) {
  const { sound } = await Audio.Sound.createAsync(source, { shouldPlay: true, volume: 1 });
  sound.setOnPlaybackStatusUpdate((status) => {
    if ('didJustFinish' in status && status.didJustFinish) {
      sound.unloadAsync().catch(() => {});
    }
  });
}

function buildPhases(rows: TableRow[], holdLabel = 'Hold'): Phase[] {
  return rows.flatMap((row) => [
    { id: `${row.round}-rest`, kind: 'rest' as const, label: 'Breathe', durationSec: row.restSec, roundLabel: `Round ${row.round}` },
    { id: `${row.round}-hold`, kind: 'hold' as const, label: holdLabel, durationSec: row.holdSec, roundLabel: `Round ${row.round}` },
  ]);
}

function buildPlan(kind: SessionKind, pbSec: number, logs: LogEntry[]): DailyPlan {
  const sorted = sortLogs(logs);
  const today = todayKey();
  const yesterday = getLogForDate(sorted, addDays(today, -1));
  const lastCompleted = getLastCompleted(sorted);
  const daysSinceLast = lastCompleted ? daysBetween(lastCompleted.date, today) : 999;
  const totalLast7 = recentCompleted(sorted, 7).length;
  const co2Last7 = countKinds(sorted, ['co2'], 7);
  const o2Last7 = countKinds(sorted, ['o2'], 7);
  const lastPb = getLastPb(sorted);
  const daysSincePb = lastPb ? daysBetween(lastPb.date, today) : 999;
  const recentRecovery = countKinds(sorted, ['recovery', 'technique'], 3);
  const yesterdayContext = describeYesterday(sorted, today);
  const readyForPb = totalLast7 >= 4 && co2Last7 >= 1 && o2Last7 >= 1 && recentRecovery >= 1 && daysSinceLast <= 1 && daysSincePb >= 7;

  if (kind === 'recovery') {
    const rows = [
      { round: 1, restSec: 120, holdSec: Math.round(pbSec * 0.42) },
      { round: 2, restSec: 120, holdSec: Math.round(pbSec * 0.42) },
      { round: 3, restSec: 120, holdSec: Math.round(pbSec * 0.42) },
    ];
    return {
      kind,
      title: 'Recovery day',
      summary: 'Keep it light or skip hard apnea entirely.',
      yesterdayContext,
      why: daysSinceLast >= 3
        ? 'You had a gap, so the move is to re-enter smoothly instead of pretending nothing happened.'
        : yesterday?.notes && analyzeNotes(yesterday.notes).needsRecovery
          ? 'Yesterday’s notes point to backing off and letting recovery do the work.'
          : 'Your recent work is dense enough that adaptation beats adding more stress today.',
      whenToStop: 'If anything feels edgy or stale, stop after one or two easy holds.',
      pbGuidance: readyForPb
        ? 'You are close to PB-ready, but take the easy day first so tomorrow has a real chance to pop.'
        : 'Do not chase a PB off a recovery day. Let freshness accumulate first.',
      readyForPb,
      tableRows: rows,
      phases: [{ id: 'settle', kind: 'settle', label: 'Settle', durationSec: 120 }, ...buildPhases(rows, 'Easy hold')],
      cues: ['Long exhales. Soft body.', 'Treat this as nervous-system cleanup, not a test.', 'Finish fresher than you started.'],
    };
  }

  if (kind === 'technique') {
    const hold = Math.round(pbSec * 0.52);
    const rows = Array.from({ length: 5 }, (_, i) => ({ round: i + 1, restSec: 135, holdSec: hold }));
    return {
      kind,
      title: 'Technique session',
      summary: 'Easy statics to sharpen relaxation and efficiency.',
      yesterdayContext,
      why: yesterday?.inferred
        ? 'Yesterday was treated as rest, so today is a clean re-entry instead of a jump back into heavy work.'
        : 'You either need a reset, a re-entry day, or a low-cost session that still moves the needle.',
      whenToStop: 'Stop once the smooth feeling disappears; do not turn a technique day into a grit day.',
      pbGuidance: readyForPb
        ? 'If this feels almost boring and tomorrow you still feel fresh, a PB attempt becomes reasonable.'
        : 'Stay submax until you have a few recent clean sessions stacked together.',
      readyForPb,
      tableRows: rows,
      phases: [{ id: 'settle', kind: 'settle', label: 'Settle', durationSec: 120 }, ...buildPhases(rows, 'Easy hold')],
      cues: ['Sleepy face, soft jaw, loose shoulders.', 'No heroics.', 'Make every hold look the same.'],
    };
  }

  if (kind === 'o2') {
    const restSec = clamp(Math.round(pbSec * 0.92), 90, 180);
    const start = Math.round(pbSec * 0.58);
    const end = Math.round(pbSec * 0.9);
    const rows = Array.from({ length: 7 }, (_, i) => ({
      round: i + 1,
      restSec,
      holdSec: Math.round(start + ((end - start) * i) / 6),
    }));
    return {
      kind,
      title: 'O₂ day',
      summary: 'Fixed rest, rising holds. Controlled hypoxic work.',
      yesterdayContext,
      why: yesterday?.kind === 'recovery' || yesterday?.kind === 'technique'
        ? 'Yesterday stayed light enough that today can push range a bit.'
        : 'You have enough recent base work that today can push range instead of just comfort.',
      whenToStop: 'Stop if the quality gets weird, not just when it gets hard.',
      pbGuidance: readyForPb
        ? 'If this session lands cleanly and tomorrow feels good, a PB attempt is on the table.'
        : 'You are building the ceiling today, not cashing it out yet.',
      readyForPb,
      tableRows: rows,
      phases: buildPhases(rows),
      cues: ['Keep the breathe-up boring.', 'Final rounds are optional.', 'Calm is not the same as safe, so stay disciplined.'],
    };
  }

  if (kind === 'pb') {
    const warmupOne = Math.round(pbSec * 0.55);
    const warmupTwo = Math.round(pbSec * 0.82);
    const target = Math.round(pbSec * 1.02);
    const rows = [
      { round: 1, restSec: 180, holdSec: warmupOne },
      { round: 2, restSec: 240, holdSec: warmupTwo },
      { round: 3, restSec: 300, holdSec: target },
    ];
    return {
      kind,
      title: 'PB attempt day',
      summary: `One controlled max-attempt day. Suggested target: ${formatTime(target)}.`,
      yesterdayContext,
      why: 'Your recent pattern is consistent enough that trying for a new best is reasonable instead of random.',
      whenToStop: 'If your warmups feel off, abort the attempt and relabel today as technique.',
      pbGuidance: 'This is the day. Only take one real shot, and only if the warmup rhythm stays clean.',
      readyForPb: true,
      tableRows: rows,
      phases: [
        { id: 'settle', kind: 'settle', label: 'Settle', durationSec: 240 },
        { id: '1-hold', kind: 'hold', label: 'Warmup hold', durationSec: warmupOne, roundLabel: 'Warmup 1' },
        { id: '1-rest', kind: 'recovery', label: 'Recover', durationSec: 180, roundLabel: 'Warmup 1' },
        { id: '2-hold', kind: 'hold', label: 'Warmup hold', durationSec: warmupTwo, roundLabel: 'Warmup 2' },
        { id: '2-rest', kind: 'recovery', label: 'Recover', durationSec: 240, roundLabel: 'Warmup 2' },
        { id: '3-rest', kind: 'recovery', label: 'Long reset', durationSec: 300, roundLabel: 'Target' },
        { id: '3-hold', kind: 'hold', label: 'Target hold', durationSec: target, roundLabel: 'Target' },
      ],
      cues: ['No forcing the warmup.', 'One clean shot only.', 'If signals are ugly, back off immediately.'],
    };
  }

  const hold = Math.round(pbSec * 0.7);
  const restStart = clamp(Math.round(pbSec * 0.95), 90, 180);
  const restEnd = clamp(Math.round(pbSec * 0.28), 25, 60);
  const rows = Array.from({ length: 8 }, (_, i) => ({
    round: i + 1,
    restSec: Math.round(restStart + ((restEnd - restStart) * i) / 7),
    holdSec: hold,
  }));
  return {
    kind,
    title: 'CO₂ day',
    summary: 'Same hold, shrinking rest. Urge-to-breathe tolerance day.',
    yesterdayContext,
    why: yesterday?.kind === 'o2'
      ? 'Yesterday pushed hypoxia, so today shifts the stress toward tolerance instead of repeating the same hit.'
      : 'This is the safest hard default when you need quality pressure without immediately chasing max depth in the hypoxic hole.',
    whenToStop: 'Stop when posture and calm break down, not only when it hurts.',
    pbGuidance: readyForPb
      ? 'If this is solid and tomorrow is light, you are on a good runway for a PB attempt soon.'
      : 'You are still building comfort under load before a serious PB attempt.',
    readyForPb,
    tableRows: rows,
    phases: buildPhases(rows),
    cues: ['Relax around contractions.', 'Keep the face blank and loose.', 'Do not speed up the breathe-up just because the rest shrinks.'],
  };
}

function recommendKind(pbSec: number, logs: LogEntry[]) {
  const sorted = sortLogs(logs);
  const today = todayKey();
  const yesterday = getLogForDate(sorted, addDays(today, -1));
  const last = getLastCompleted(sorted);
  const daysSinceLast = last ? daysBetween(last.date, today) : 999;
  const totalLast7 = recentCompleted(sorted, 7).length;
  const hardLast3 = countKinds(sorted, ['co2', 'o2', 'pb'], 3);
  const co2Last7 = countKinds(sorted, ['co2'], 7);
  const o2Last7 = countKinds(sorted, ['o2'], 7);
  const recoveryLast2 = countKinds(sorted, ['recovery', 'technique'], 2);
  const lastPb = getLastPb(sorted);
  const daysSincePb = lastPb ? daysBetween(lastPb.date, today) : 999;
  const yesterdayNotes = analyzeNotes(yesterday?.notes);

  if (!last) return 'technique';
  if (yesterdayNotes.needsRecovery) return 'recovery';
  if (yesterday?.kind === 'pb') return 'recovery';
  if (yesterday?.kind === 'co2' && yesterday.effort === 'hard') return 'recovery';
  if (yesterday?.kind === 'o2' && yesterday.effort === 'hard') return 'recovery';
  if (yesterday?.inferred) return yesterdayNotes.feltStrong ? 'o2' : 'technique';
  if ((yesterday?.kind === 'recovery' || yesterday?.kind === 'technique') && yesterdayNotes.feltStrong) {
    if (totalLast7 >= 4 && co2Last7 >= 1 && o2Last7 >= 1 && recoveryLast2 >= 1 && daysSincePb >= 7) return 'pb';
    return o2Last7 === 0 ? 'o2' : 'co2';
  }
  if (daysSinceLast >= 3) return 'recovery';
  if (daysSinceLast === 2) return 'technique';
  if (hardLast3 >= 2) return 'recovery';
  if (totalLast7 >= 4 && co2Last7 >= 1 && o2Last7 >= 1 && recoveryLast2 >= 1 && daysSincePb >= 7) return 'pb';
  if (co2Last7 === 0) return 'co2';
  if (o2Last7 === 0) return 'o2';
  if (last.kind === 'co2') return 'recovery';
  if (last.kind === 'recovery' || last.kind === 'technique') return 'o2';
  if (last.kind === 'o2') return 'co2';
  if (last.kind === 'pb') return 'recovery';
  return pbSec >= 180 ? 'co2' : 'technique';
}

function effortColor(effort?: Effort) {
  if (effort === 'easy') return '#86efac';
  if (effort === 'hard') return '#fca5a5';
  return '#93c5fd';
}

function formatLogTitle(log: LogEntry) {
  const bits = [log.title];
  if (log.bestHoldSec) bits.push(formatTime(log.bestHoldSec));
  if (log.effort) bits.push(EFFORT_LABEL[log.effort]);
  return bits.join(' · ');
}

export default function App() {
  const [pbMin, setPbMin] = useState('2');
  const [pbSecInput, setPbSecInput] = useState('30');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [running, setRunning] = useState(false);
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [phaseRemaining, setPhaseRemaining] = useState(0);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [dailyOutcome, setDailyOutcome] = useState<'completed' | 'rest' | 'missed'>('completed');
  const [resultEffort, setResultEffort] = useState<Effort>('solid');
  const [resultHoldMin, setResultHoldMin] = useState('');
  const [resultHoldSec, setResultHoldSec] = useState('');
  const [resultNotes, setResultNotes] = useState('');
  const announcedPhaseIdRef = useRef<string | null>(null);
  const halfwayAnnouncedPhaseIdRef = useRef<string | null>(null);
  const lastHalfCueIndexRef = useRef<number | null>(null);

  const pbSec = useMemo(() => parseTime(pbMin, pbSecInput), [pbMin, pbSecInput]);
  const recommendedKind = useMemo(() => recommendKind(pbSec, logs), [pbSec, logs]);
  const plan = useMemo(() => buildPlan(recommendedKind, pbSec, logs), [recommendedKind, pbSec, logs]);
  const currentPhase = plan.phases[phaseIndex];

  useEffect(() => {
    Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
    }).catch(() => {});
  }, []);

  useEffect(() => {
    (async () => {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as StoredState;
        const secs = parsed.pbSec ?? 150;
        setPbMin(String(Math.floor(secs / 60)));
        setPbSecInput(String(secs % 60).padStart(2, '0'));
        setLogs(normalizeLogs(parsed.logs ?? []));
      }
      setLoaded(true);
    })().catch(() => setLoaded(true));
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const payload: StoredState = { pbSec, logs };
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload)).catch(() => {});
  }, [loaded, pbSec, logs]);

  useEffect(() => {
    setRunning(false);
    setPhaseIndex(0);
    setPhaseRemaining(plan.phases[0]?.durationSec ?? 0);
    setSessionComplete(false);
    announcedPhaseIdRef.current = null;
    halfwayAnnouncedPhaseIdRef.current = null;
  }, [plan]);

  useEffect(() => {
    if (!running || !audioEnabled || !currentPhase) return;
    if (announcedPhaseIdRef.current === currentPhase.id) return;
    announcedPhaseIdRef.current = currentPhase.id;
    halfwayAnnouncedPhaseIdRef.current = null;
    if (currentPhase.kind === 'hold') playCue(holdCue).catch(() => {});
    if (currentPhase.kind === 'rest' || currentPhase.kind === 'recovery') playCue(breatheCue).catch(() => {});
  }, [running, audioEnabled, currentPhase]);

  useEffect(() => {
    if (!running || !audioEnabled || !currentPhase) return;
    if (currentPhase.kind !== 'hold' || currentPhase.durationSec < 20) return;
    if (halfwayAnnouncedPhaseIdRef.current === currentPhase.id) return;
    const halfwayMark = Math.ceil(currentPhase.durationSec / 2);
    if (phaseRemaining === halfwayMark) {
      halfwayAnnouncedPhaseIdRef.current = currentPhase.id;
      const { asset, index } = pickRandomHalfCue(lastHalfCueIndexRef.current);
      lastHalfCueIndexRef.current = index;
      playCue(asset).catch(() => {});
    }
  }, [running, audioEnabled, currentPhase, phaseRemaining]);

  useEffect(() => {
    if (!running || phaseRemaining <= 0) return;
    const timer = setTimeout(() => setPhaseRemaining((current) => current - 1), 1000);
    return () => clearTimeout(timer);
  }, [running, phaseRemaining]);

  useEffect(() => {
    if (!running || phaseRemaining > 0) return;
    const nextIndex = phaseIndex + 1;
    if (nextIndex >= plan.phases.length) {
      setRunning(false);
      setSessionComplete(true);
      return;
    }
    setPhaseIndex(nextIndex);
    setPhaseRemaining(plan.phases[nextIndex].durationSec);
  }, [running, phaseRemaining, phaseIndex, plan.phases]);

  const totalSeconds = plan.phases.reduce((sum, phase) => sum + phase.durationSec, 0);
  const elapsedSeconds = plan.phases.slice(0, phaseIndex).reduce((sum, phase) => sum + phase.durationSec, 0) + ((currentPhase?.durationSec ?? 0) - phaseRemaining);
  const progress = totalSeconds > 0 ? clamp(elapsedSeconds / totalSeconds, 0, 1) : 0;

  function startSession() {
    setSessionComplete(false);
    if (phaseRemaining <= 0) {
      setPhaseIndex(0);
      setPhaseRemaining(plan.phases[0]?.durationSec ?? 0);
    }
    setRunning(true);
  }

  function pauseSession() {
    setRunning(false);
  }

  function resetSession() {
    setRunning(false);
    setPhaseIndex(0);
    setPhaseRemaining(plan.phases[0]?.durationSec ?? 0);
    setSessionComplete(false);
    announcedPhaseIdRef.current = null;
    halfwayAnnouncedPhaseIdRef.current = null;
  }

  function submitDailyLog() {
    const bestHoldSec = dailyOutcome === 'completed' && (resultHoldMin || resultHoldSec)
      ? parseTime(resultHoldMin || '0', resultHoldSec || '0')
      : undefined;
    const isRestDay = dailyOutcome === 'rest';
    const completed = dailyOutcome !== 'missed';
    const entry: LogEntry = {
      id: `${Date.now()}`,
      date: todayKey(),
      kind: isRestDay ? 'recovery' : plan.kind,
      title: isRestDay ? REST_DAY_TITLE : plan.title,
      completed,
      inferred: false,
      effort: dailyOutcome === 'completed' ? resultEffort : undefined,
      bestHoldSec,
      notes: resultNotes.trim() || undefined,
    };
    const nextLogs = normalizeLogs([entry, ...logs.filter((log) => log.date !== entry.date)]);
    setLogs(nextLogs);
    if (dailyOutcome === 'completed' && bestHoldSec && bestHoldSec > pbSec) {
      setPbMin(String(Math.floor(bestHoldSec / 60)));
      setPbSecInput(String(bestHoldSec % 60).padStart(2, '0'));
    }
    setResultHoldMin('');
    setResultHoldSec('');
    setResultNotes('');
    setResultEffort('solid');
    setDailyOutcome('completed');
    setSessionComplete(false);
    resetSession();
  }

  const todayLogged = logs.some((log) => log.date === todayKey());
  const recentLogs = sortLogs(logs).slice(0, 8);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Current PB</Text>
          <View style={styles.row}>
            <View style={styles.timeInputWrap}>
              <Text style={styles.inputLabel}>Minutes</Text>
              <TextInput value={pbMin} onChangeText={setPbMin} keyboardType="number-pad" style={styles.timeInput} maxLength={2} />
            </View>
            <View style={styles.timeInputWrap}>
              <Text style={styles.inputLabel}>Seconds</Text>
              <TextInput value={pbSecInput} onChangeText={setPbSecInput} keyboardType="number-pad" style={styles.timeInput} maxLength={2} />
            </View>
            <View style={styles.pbPill}>
              <Text style={styles.pbPillLabel}>PB</Text>
              <Text style={styles.pbPillValue}>{formatTime(pbSec)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.titleRow}>
            <View style={styles.titleTextWrap}>
              <Text style={styles.cardTitle}>{plan.title}</Text>
              <Text style={styles.cardSubtitle}>{plan.summary}</Text>
            </View>
            <View style={styles.kindBadge}><Text style={styles.kindBadgeText}>{KIND_LABEL[plan.kind]}</Text></View>
          </View>
          {plan.readyForPb ? <Text style={styles.readyText}>PB-ready runway is building.</Text> : null}
          {plan.yesterdayContext ? <Text style={styles.helperText}>{plan.yesterdayContext}</Text> : null}
          <View style={styles.infoBox}><Text style={styles.infoBoxLabel}>Why today</Text><Text style={styles.infoBoxText}>{plan.why}</Text></View>
          <View style={styles.infoBox}><Text style={styles.infoBoxLabel}>Stop rule</Text><Text style={styles.infoBoxText}>{plan.whenToStop}</Text></View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Today’s session</Text>
          {plan.tableRows.map((row) => (
            <View key={`${row.round}`} style={styles.tableRow}>
              <Text style={styles.tableRound}>Round {row.round}</Text>
              <View style={styles.tableTimes}>
                <Text style={styles.tableTimeLabel}>Rest {formatTime(row.restSec)}</Text>
                <Text style={styles.tableTimeValue}>Hold {formatTime(row.holdSec)}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.card}>
          <View style={styles.titleRow}>
            <Text style={styles.cardTitle}>Timer</Text>
            <Pressable onPress={() => setAudioEnabled((v) => !v)} style={styles.audioToggle}>
              <Text style={styles.audioToggleText}>{audioEnabled ? 'Audio on' : 'Audio off'}</Text>
            </Pressable>
          </View>
          <View style={styles.timerShell}>
            <Text style={styles.timerPhase}>{sessionComplete ? 'COMPLETE' : currentPhase ? currentPhase.label.toUpperCase() : 'READY'}</Text>
            <Text style={styles.timerValue}>{sessionComplete ? 'Done' : formatTime(phaseRemaining)}</Text>
            <Text style={styles.timerMeta}>{sessionComplete ? 'Log the session below.' : `${currentPhase?.roundLabel ?? 'Prep'} · ${currentPhase?.label ?? 'Ready'}`}</Text>
            <View style={styles.progressBarTrack}><View style={[styles.progressBarFill, { width: `${progress * 100}%` }]} /></View>
            <Text style={styles.progressCaption}>{formatTime(elapsedSeconds)} elapsed · {formatTime(totalSeconds)} total</Text>
          </View>
          <View style={styles.buttonRow}>
            <Pressable onPress={startSession} style={styles.primaryButton}><Text style={styles.primaryButtonText}>{running ? 'Running…' : sessionComplete ? 'Restart' : 'Start'}</Text></Pressable>
            <Pressable onPress={pauseSession} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>Pause</Text></Pressable>
            <Pressable onPress={resetSession} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>Reset</Text></Pressable>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Log today</Text>
          <Text style={styles.helperText}>{todayLogged ? 'Today already has a log. Submitting again replaces it.' : 'One entry per day.'}</Text>
          <Text style={styles.sectionLabel}>What happened today?</Text>
          <View style={styles.choiceWrap}>
            {[
              ['completed', 'Completed'],
              ['rest', 'Rest day'],
              ['missed', 'Missed'],
            ].map(([value, label]) => (
              <Pressable key={value} onPress={() => setDailyOutcome(value as 'completed' | 'rest' | 'missed')} style={[styles.choiceChip, dailyOutcome === value && styles.choiceChipActive]}>
                <Text style={[styles.choiceChipText, dailyOutcome === value && styles.choiceChipTextActive]}>{label}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.sectionLabel}>How did it feel?</Text>
          <View style={styles.choiceWrap}>
            {(['easy', 'solid', 'hard'] as Effort[]).map((item) => (
              <Pressable key={item} onPress={() => setResultEffort(item)} style={[styles.choiceChip, resultEffort === item && styles.choiceChipActive]}>
                <Text style={[styles.choiceChipText, resultEffort === item && styles.choiceChipTextActive]}>{EFFORT_LABEL[item]}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.sectionLabel}>Best hold</Text>
          <View style={styles.row}>
            <View style={styles.timeInputWrap}>
              <TextInput value={resultHoldMin} onChangeText={setResultHoldMin} keyboardType="number-pad" style={styles.smallInput} placeholder="mm" placeholderTextColor="#64748b" maxLength={2} />
            </View>
            <View style={styles.timeInputWrap}>
              <TextInput value={resultHoldSec} onChangeText={setResultHoldSec} keyboardType="number-pad" style={styles.smallInput} placeholder="ss" placeholderTextColor="#64748b" maxLength={2} />
            </View>
          </View>
          <Text style={styles.sectionLabel}>Notes</Text>
          <TextInput value={resultNotes} onChangeText={setResultNotes} style={styles.notesInput} multiline placeholder="Optional" placeholderTextColor="#64748b" />
          <Pressable onPress={submitDailyLog} style={styles.primaryButton}><Text style={styles.primaryButtonText}>Submit daily log</Text></Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Recent log</Text>
          {recentLogs.length === 0 ? <Text style={styles.helperText}>No entries yet.</Text> : null}
          {recentLogs.map((log) => (
            <View key={log.id} style={styles.logRow}>
              <View style={styles.logHeaderRow}>
                <Text style={styles.logDate}>{log.date}</Text>
                <Text style={[styles.logKind, { color: effortColor(log.effort) }]}>{KIND_LABEL[log.kind]}</Text>
              </View>
              <Text style={styles.logTitle}>{formatLogTitle(log)}</Text>
              {log.inferred ? <Text style={styles.logMeta}>Assumed rest day</Text> : null}
              {log.notes ? <Text style={styles.logNotes}>{log.notes}</Text> : null}
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#08111f' },
  screen: { flex: 1 },
  content: { padding: 16, paddingBottom: 40, gap: 14 },
  card: { backgroundColor: '#0d1728', borderRadius: 20, padding: 18, borderWidth: 1, borderColor: '#1f2c43', gap: 10 },
  cardTitle: { color: '#f8fafc', fontSize: 19, fontWeight: '800' },
  cardSubtitle: { color: '#94a3b8', fontSize: 13, lineHeight: 19 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  titleTextWrap: { flex: 1 },
  readyText: { color: '#86efac', fontSize: 12, fontWeight: '800', textTransform: 'uppercase' },
  infoBox: { backgroundColor: '#0a1220', borderRadius: 16, padding: 12, gap: 4 },
  infoBoxLabel: { color: '#7dd3fc', fontSize: 12, fontWeight: '800', textTransform: 'uppercase' },
  infoBoxText: { color: '#dbe4f0', fontSize: 13, lineHeight: 19 },
  row: { flexDirection: 'row', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' },
  timeInputWrap: { flex: 1, minWidth: 100, gap: 6 },
  inputLabel: { color: '#94a3b8', fontSize: 12, fontWeight: '600' },
  timeInput: { backgroundColor: '#08111f', borderColor: '#26364f', borderWidth: 1, borderRadius: 16, color: '#f8fafc', fontSize: 24, fontWeight: '700', paddingHorizontal: 14, paddingVertical: 14 },
  smallInput: { backgroundColor: '#08111f', borderColor: '#26364f', borderWidth: 1, borderRadius: 14, color: '#f8fafc', fontSize: 20, fontWeight: '700', paddingHorizontal: 14, paddingVertical: 12 },
  notesInput: { backgroundColor: '#08111f', borderColor: '#26364f', borderWidth: 1, borderRadius: 14, color: '#f8fafc', fontSize: 14, minHeight: 88, paddingHorizontal: 14, paddingVertical: 12, textAlignVertical: 'top' },
  pbPill: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 18, backgroundColor: '#10233f', minWidth: 92 },
  pbPillLabel: { color: '#7dd3fc', fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  pbPillValue: { color: '#f8fafc', fontSize: 24, fontWeight: '800' },
  kindBadge: { backgroundColor: '#13253e', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 8 },
  kindBadgeText: { color: '#93c5fd', fontSize: 12, fontWeight: '800' },
  tableRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'center', backgroundColor: '#0a1220', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12 },
  tableRound: { color: '#f8fafc', fontWeight: '700', fontSize: 14 },
  tableTimes: { alignItems: 'flex-end', gap: 2 },
  tableTimeLabel: { color: '#93c5fd', fontSize: 13, fontWeight: '600' },
  tableTimeValue: { color: '#f8fafc', fontSize: 14, fontWeight: '800' },
  audioToggle: { backgroundColor: '#122034', borderWidth: 1, borderColor: '#2a4060', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  audioToggleText: { color: '#dbeafe', fontSize: 12, fontWeight: '800' },
  helperText: { color: '#94a3b8', fontSize: 13, lineHeight: 18 },
  timerShell: { backgroundColor: '#08111f', borderRadius: 20, padding: 18, alignItems: 'center', gap: 10 },
  timerPhase: { color: '#7dd3fc', fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  timerValue: { color: '#f8fafc', fontSize: 54, fontWeight: '900' },
  timerMeta: { color: '#cbd5e1', fontSize: 14, textAlign: 'center' },
  progressBarTrack: { width: '100%', height: 10, backgroundColor: '#112032', borderRadius: 999, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: '#38bdf8', borderRadius: 999 },
  progressCaption: { color: '#94a3b8', fontSize: 12 },
  buttonRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  primaryButton: { flex: 1, minWidth: 120, backgroundColor: '#2563eb', borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14, alignItems: 'center' },
  primaryButtonText: { color: '#eff6ff', fontWeight: '800', fontSize: 15 },
  secondaryButton: { flex: 1, minWidth: 100, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14, alignItems: 'center', backgroundColor: '#122034', borderWidth: 1, borderColor: '#2a4060' },
  secondaryButtonText: { color: '#dbeafe', fontWeight: '700', fontSize: 15 },
  sectionLabel: { color: '#e2e8f0', fontSize: 14, fontWeight: '700', marginTop: 4 },
  choiceWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choiceChip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, backgroundColor: '#0a1220', borderWidth: 1, borderColor: '#24354c' },
  choiceChipActive: { backgroundColor: '#1d4ed8', borderColor: '#60a5fa' },
  choiceChipText: { color: '#cbd5e1', fontSize: 13, fontWeight: '700' },
  choiceChipTextActive: { color: '#eff6ff' },
  logRow: { backgroundColor: '#0a1220', borderRadius: 16, padding: 12, gap: 4 },
  logHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  logDate: { color: '#94a3b8', fontSize: 12, fontWeight: '700' },
  logKind: { fontSize: 12, fontWeight: '800' },
  logTitle: { color: '#f8fafc', fontSize: 14, fontWeight: '700' },
  logMeta: { color: '#93c5fd', fontSize: 12, fontWeight: '700' },
  logNotes: { color: '#cbd5e1', fontSize: 13, lineHeight: 18 },
});
