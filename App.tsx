import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as Speech from 'expo-speech';
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
import { ELAPSED_CUE_ASSETS } from './elapsedCues';
import { HALF_CUE_ASSETS } from './halfwayCues';

type SessionKind = 'technique' | 'co2' | 'o2' | 'pb' | 'recovery';
type Effort = 'easy' | 'solid' | 'hard';
type PhaseKind = 'rest' | 'hold' | 'recovery' | 'settle';
type DailyOutcome = 'completed' | 'rest' | 'missed';
type SetupMode = 'timer' | 'manual';

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
  why: string;
  yesterdayContext?: string;
  readyForPb: boolean;
  phases: Phase[];
  tableRows: TableRow[];
};

type StoredState = {
  pbSec: number;
  logs: LogEntry[];
  onboardingComplete?: boolean;
};

const STORAGE_KEY = 'breathhold-trainer-v3';
const REST_DAY_TITLE = 'Rest day';
const REST_COUNTDOWN_CUES = [60, 30, 20, 10, 5, 4, 3, 2, 1] as const;
const HOLD_COUNTDOWN_CUES: Record<number, string> = {
  60: 'One minute left',
  30: '30 left',
};
const breatheCue = require('./assets/audio/breathe.mp3');

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
  return clamp(m * 60 + s, 0, 600);
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

function isValidDateKey(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());
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
    if (!isValidDateKey(log.date) || seenDates.has(log.date)) continue;
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

function analyzeNotes(notes?: string) {
  const text = notes?.toLowerCase() ?? '';
  return {
    needsRecovery: /(bad sleep|slept badly|tired|fatigue|fatigued|sick|ill|dizzy|headache|stress|stressed|tight|rough|off)/.test(text),
    feltStrong: /(easy|great|strong|fresh|smooth|good|amazing|solid|clean)/.test(text),
  };
}

function describeYesterday(logs: LogEntry[], today = todayKey()) {
  const yesterday = getLogForDate(logs, addDays(today, -1));
  if (!yesterday) return 'Yesterday: none logged';
  const bits = [`Yesterday: ${KIND_LABEL[yesterday.kind]}`];
  if (yesterday.inferred) bits.push('(assumed rest)');
  if (yesterday.effort && !yesterday.inferred) bits.push(`· ${EFFORT_LABEL[yesterday.effort]}`);
  if (yesterday.notes && yesterday.notes !== 'Auto-logged rest day.') bits.push(`· ${yesterday.notes}`);
  return bits.join(' ');
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

function speakCue(text: string, interrupt = true) {
  if (interrupt) Speech.stop();
  Speech.speak(text, {
    language: 'en-US',
    pitch: 1,
    rate: 0.92,
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
      summary: 'Keep it light.',
      yesterdayContext,
      why: daysSinceLast >= 3
        ? 'You had a gap, so today should be a smooth re-entry.'
        : yesterday?.notes && analyzeNotes(yesterday.notes).needsRecovery
          ? 'Yesterday’s notes point to backing off.'
          : 'Your recent work is dense enough that recovery wins today.',
      readyForPb,
      phases: [{ id: 'settle', kind: 'settle', label: 'Settle', durationSec: 120 }, ...buildPhases(rows, 'Easy hold')],
      tableRows: rows,
    };
  }

  if (kind === 'technique') {
    const hold = Math.round(pbSec * 0.52);
    const rows = Array.from({ length: 5 }, (_, i) => ({ round: i + 1, restSec: 135, holdSec: hold }));
    return {
      kind,
      title: 'Technique',
      summary: 'Easy statics. Clean form.',
      yesterdayContext,
      why: yesterday?.inferred
        ? 'Yesterday was treated as rest, so today is a clean re-entry.'
        : 'Low-cost work that still sharpens relaxation and efficiency.',
      readyForPb,
      phases: [{ id: 'settle', kind: 'settle', label: 'Settle', durationSec: 120 }, ...buildPhases(rows, 'Easy hold')],
      tableRows: rows,
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
      summary: 'Fixed rest. Rising holds.',
      yesterdayContext,
      why: yesterday?.kind === 'recovery' || yesterday?.kind === 'technique'
        ? 'Yesterday stayed light enough that today can push range.'
        : 'You have enough recent base work to lean into hypoxic range today.',
      readyForPb,
      phases: buildPhases(rows),
      tableRows: rows,
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
      title: 'PB attempt',
      summary: `Target ${formatTime(target)}. One clean shot.`,
      yesterdayContext,
      why: 'Your recent pattern is consistent enough to take a real shot.',
      readyForPb: true,
      phases: [
        { id: 'settle', kind: 'settle', label: 'Settle', durationSec: 240 },
        { id: '1-hold', kind: 'hold', label: 'Warmup hold', durationSec: warmupOne, roundLabel: 'Warmup 1' },
        { id: '1-rest', kind: 'recovery', label: 'Recover', durationSec: 180, roundLabel: 'Warmup 1' },
        { id: '2-hold', kind: 'hold', label: 'Warmup hold', durationSec: warmupTwo, roundLabel: 'Warmup 2' },
        { id: '2-rest', kind: 'recovery', label: 'Recover', durationSec: 240, roundLabel: 'Warmup 2' },
        { id: '3-rest', kind: 'recovery', label: 'Long reset', durationSec: 300, roundLabel: 'Target' },
        { id: '3-hold', kind: 'hold', label: 'Target hold', durationSec: target, roundLabel: 'Target' },
      ],
      tableRows: rows,
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
    summary: 'Same hold. Shrinking rest.',
    yesterdayContext,
    why: yesterday?.kind === 'o2'
      ? 'Yesterday pushed hypoxia, so today shifts the stress toward tolerance.'
      : 'This is the safest hard default when you want pressure without going straight to max-range work.',
    readyForPb,
    phases: buildPhases(rows),
    tableRows: rows,
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

function outcomeFromLog(log: LogEntry | null): DailyOutcome {
  if (!log) return 'completed';
  if (log.title === REST_DAY_TITLE || log.kind === 'recovery' && log.effort === 'easy' && log.notes === 'Auto-logged rest day.') return 'rest';
  if (!log.completed) return 'missed';
  return log.title === REST_DAY_TITLE ? 'rest' : 'completed';
}

function makeLogTitle(kind: SessionKind, outcome: DailyOutcome, planTitle: string) {
  if (outcome === 'rest') return REST_DAY_TITLE;
  if (outcome === 'missed') return 'Missed day';
  if (kind === 'pb') return 'PB attempt';
  return planTitle;
}

function effortColor(effort?: Effort) {
  if (effort === 'easy') return '#86efac';
  if (effort === 'hard') return '#fca5a5';
  return '#93c5fd';
}

function formatLogTitle(log: LogEntry) {
  const bits = [log.title];
  if (log.effort && !log.inferred) bits.push(EFFORT_LABEL[log.effort]);
  return bits.join(' · ');
}

export default function App() {
  const [loaded, setLoaded] = useState(false);
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [setupMode, setSetupMode] = useState<SetupMode>('timer');
  const [pbSec, setPbSec] = useState(150);
  const [pbDraftMin, setPbDraftMin] = useState('2');
  const [pbDraftSec, setPbDraftSec] = useState('30');
  const [editingPb, setEditingPb] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [running, setRunning] = useState(false);
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [phaseRemaining, setPhaseRemaining] = useState(0);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [maxHoldRunning, setMaxHoldRunning] = useState(false);
  const [maxHoldElapsed, setMaxHoldElapsed] = useState(0);
  const [setupManualMin, setSetupManualMin] = useState('2');
  const [setupManualSec, setSetupManualSec] = useState('30');
  const [editorDate, setEditorDate] = useState(todayKey());
  const [dailyOutcome, setDailyOutcome] = useState<DailyOutcome>('completed');
  const [resultEffort, setResultEffort] = useState<Effort>('solid');
  const [resultNotes, setResultNotes] = useState('');
  const [editorMessage, setEditorMessage] = useState('');
  const announcedPhaseIdRef = useRef<string | null>(null);
  const halfwayAnnouncedPhaseIdRef = useRef<string | null>(null);
  const announcedCountdownKeysRef = useRef<Set<string>>(new Set());
  const pendingFollowupCueTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastHalfCueIndexRef = useRef<number | null>(null);
  const lastElapsedCueRef = useRef(0);

  const recommendedKind = useMemo(() => recommendKind(pbSec, logs), [pbSec, logs]);
  const plan = useMemo(() => buildPlan(recommendedKind, pbSec, logs), [recommendedKind, pbSec, logs]);
  const currentPhase = plan.phases[phaseIndex];
  const selectedLog = useMemo(() => getLogForDate(logs, editorDate), [logs, editorDate]);
  const recentLogs = useMemo(() => sortLogs(logs).slice(0, 14), [logs]);

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
        const nextPb = parsed.pbSec ?? 150;
        setPbSec(nextPb);
        setPbDraftMin(String(Math.floor(nextPb / 60)));
        setPbDraftSec(String(nextPb % 60).padStart(2, '0'));
        setSetupManualMin(String(Math.floor(nextPb / 60)));
        setSetupManualSec(String(nextPb % 60).padStart(2, '0'));
        setLogs(normalizeLogs(parsed.logs ?? []));
        setOnboardingComplete(parsed.onboardingComplete ?? nextPb > 0);
      }
      setLoaded(true);
    })().catch(() => setLoaded(true));
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const payload: StoredState = { pbSec, logs, onboardingComplete };
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload)).catch(() => {});
  }, [loaded, pbSec, logs, onboardingComplete]);

  useEffect(() => {
    const active = running || maxHoldRunning;
    if (active) activateKeepAwakeAsync().catch(() => {});
    else deactivateKeepAwake().catch(() => {});
  }, [running, maxHoldRunning]);

  useEffect(() => {
    setRunning(false);
    setPhaseIndex(0);
    setPhaseRemaining(plan.phases[0]?.durationSec ?? 0);
    setSessionComplete(false);
    announcedPhaseIdRef.current = null;
    halfwayAnnouncedPhaseIdRef.current = null;
    announcedCountdownKeysRef.current = new Set();
    if (pendingFollowupCueTimeoutRef.current) {
      clearTimeout(pendingFollowupCueTimeoutRef.current);
      pendingFollowupCueTimeoutRef.current = null;
    }
  }, [plan]);

  useEffect(() => {
    if (!running || !currentPhase) return;
    const timer = setInterval(() => {
      setPhaseRemaining((prev) => {
        if (prev > 1) return prev - 1;
        const nextIndex = phaseIndex + 1;
        const nextPhase = plan.phases[nextIndex];
        if (!nextPhase) {
          clearInterval(timer);
          setRunning(false);
          setSessionComplete(true);
          if (audioEnabled && currentPhase.kind === 'hold') {
            speakCue('Done');
          }
          return 0;
        }
        setPhaseIndex(nextIndex);
        announcedPhaseIdRef.current = null;
        halfwayAnnouncedPhaseIdRef.current = null;
        announcedCountdownKeysRef.current = new Set();
        if (pendingFollowupCueTimeoutRef.current) {
          clearTimeout(pendingFollowupCueTimeoutRef.current);
          pendingFollowupCueTimeoutRef.current = null;
        }
        return nextPhase.durationSec;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [running, phaseIndex, currentPhase, plan.phases]);

  useEffect(() => {
    if (!running || !audioEnabled || !currentPhase) return;
    if (announcedPhaseIdRef.current === currentPhase.id) return;
    announcedPhaseIdRef.current = currentPhase.id;
    halfwayAnnouncedPhaseIdRef.current = null;
    announcedCountdownKeysRef.current = new Set();
    if (pendingFollowupCueTimeoutRef.current) {
      clearTimeout(pendingFollowupCueTimeoutRef.current);
      pendingFollowupCueTimeoutRef.current = null;
    }
    if (currentPhase.kind === 'rest' || currentPhase.kind === 'recovery') playCue(breatheCue).catch(() => {});
  }, [running, audioEnabled, currentPhase]);

  useEffect(() => {
    if (!running || !audioEnabled || !currentPhase) return;
    if (currentPhase.kind !== 'hold' || currentPhase.durationSec < 20) return;
    if (halfwayAnnouncedPhaseIdRef.current === currentPhase.id) return;
    const halfwayMark = Math.ceil(currentPhase.durationSec / 2);
    if (HOLD_COUNTDOWN_CUES[halfwayMark]) return;
    if (phaseRemaining === halfwayMark) {
      halfwayAnnouncedPhaseIdRef.current = currentPhase.id;
      const { asset, index } = pickRandomHalfCue(lastHalfCueIndexRef.current);
      lastHalfCueIndexRef.current = index;
      playCue(asset).catch(() => {});
    }
  }, [running, audioEnabled, currentPhase, phaseRemaining]);

  useEffect(() => {
    if (!running || !audioEnabled || !currentPhase) return;

    const nextPhase = plan.phases[phaseIndex + 1];
    const countdownKeys = announcedCountdownKeysRef.current;

    if (currentPhase.kind === 'hold') {
      const holdMessage = HOLD_COUNTDOWN_CUES[phaseRemaining];
      const holdKey = `${currentPhase.id}:hold:${phaseRemaining}`;
      if (holdMessage && !countdownKeys.has(holdKey)) {
        countdownKeys.add(holdKey);
        speakCue(holdMessage);
      }
      return;
    }

    if (nextPhase?.kind !== 'hold') return;

    const restKey = `${currentPhase.id}:rest:${phaseRemaining}`;
    if (REST_COUNTDOWN_CUES.includes(phaseRemaining as (typeof REST_COUNTDOWN_CUES)[number]) && !countdownKeys.has(restKey)) {
      countdownKeys.add(restKey);
      if (phaseRemaining === 1) {
        speakCue('1');
        const holdTransitionKey = `${currentPhase.id}:transition:hold`;
        if (!countdownKeys.has(holdTransitionKey)) {
          countdownKeys.add(holdTransitionKey);
          pendingFollowupCueTimeoutRef.current = setTimeout(() => {
            speakCue('Hold', false);
            pendingFollowupCueTimeoutRef.current = null;
          }, 650);
        }
      } else {
        speakCue(phaseRemaining === 60 ? 'One minute' : String(phaseRemaining));
      }
    }
  }, [running, audioEnabled, currentPhase, phaseIndex, phaseRemaining, plan.phases]);

  useEffect(() => {
    if (!maxHoldRunning) return;
    const timer = setInterval(() => {
      setMaxHoldElapsed((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [maxHoldRunning]);

  useEffect(() => {
    if (!maxHoldRunning || !audioEnabled) return;
    const cueMark = Math.floor(maxHoldElapsed / 30) * 30;
    if (!cueMark || cueMark === lastElapsedCueRef.current) return;
    const asset = ELAPSED_CUE_ASSETS[cueMark as keyof typeof ELAPSED_CUE_ASSETS];
    if (!asset) return;
    lastElapsedCueRef.current = cueMark;
    playCue(asset).catch(() => {});
  }, [maxHoldRunning, maxHoldElapsed, audioEnabled]);

  function resetSession() {
    setRunning(false);
    setPhaseIndex(0);
    setPhaseRemaining(plan.phases[0]?.durationSec ?? 0);
    setSessionComplete(false);
    announcedPhaseIdRef.current = null;
    halfwayAnnouncedPhaseIdRef.current = null;
    announcedCountdownKeysRef.current = new Set();
    if (pendingFollowupCueTimeoutRef.current) {
      clearTimeout(pendingFollowupCueTimeoutRef.current);
      pendingFollowupCueTimeoutRef.current = null;
    }
  }

  function savePb(seconds: number) {
    const safe = clamp(seconds, 45, 600);
    setPbSec(safe);
    setPbDraftMin(String(Math.floor(safe / 60)));
    setPbDraftSec(String(safe % 60).padStart(2, '0'));
    setSetupManualMin(String(Math.floor(safe / 60)));
    setSetupManualSec(String(safe % 60).padStart(2, '0'));
    setEditingPb(false);
    setOnboardingComplete(true);
  }

  function submitManualPb() {
    savePb(parseTime(setupManualMin, setupManualSec));
  }

  function stopAndSaveMaxHold() {
    setMaxHoldRunning(false);
    if (maxHoldElapsed >= 45) savePb(maxHoldElapsed);
  }

  function toggleSession() {
    if (!currentPhase) return;
    if (running) {
      setRunning(false);
      return;
    }
    if (sessionComplete || phaseRemaining <= 0) {
      setPhaseIndex(0);
      setPhaseRemaining(plan.phases[0]?.durationSec ?? 0);
      setSessionComplete(false);
    }
    setRunning(true);
  }

  function loadEditor(date: string) {
    const log = getLogForDate(logs, date);
    setEditorDate(date);
    setDailyOutcome(outcomeFromLog(log));
    setResultEffort(log?.effort ?? 'solid');
    setResultNotes(log?.notes === 'Auto-logged rest day.' ? '' : log?.notes ?? '');
    setEditorMessage('');
  }

  function startHistoryEdit(date: string) {
    loadEditor(date);
  }

  useEffect(() => {
    if (loaded) loadEditor(todayKey());
  }, [loaded]);

  function saveLog() {
    if (!isValidDateKey(editorDate)) {
      setEditorMessage('Use YYYY-MM-DD.');
      return;
    }
    if (editorDate > todayKey()) {
      setEditorMessage('Can’t save future days.');
      return;
    }
    const existingLog = getLogForDate(logs, editorDate);
    const nextKind = dailyOutcome === 'rest'
      ? 'recovery'
      : editorDate === todayKey()
        ? recommendedKind
        : existingLog?.kind ?? recommendedKind;
    const entry: LogEntry = {
      id: `${editorDate}-${Date.now()}`,
      date: editorDate,
      kind: nextKind,
      title: makeLogTitle(nextKind, dailyOutcome, nextKind === recommendedKind ? plan.title : `${KIND_LABEL[nextKind]} day`),
      completed: dailyOutcome !== 'missed',
      inferred: false,
      effort: dailyOutcome === 'completed' ? resultEffort : dailyOutcome === 'rest' ? 'easy' : undefined,
      notes: resultNotes.trim() || undefined,
    };
    const nextLogs = normalizeLogs([entry, ...logs.filter((log) => log.date !== editorDate)]);
    setLogs(nextLogs);
    setEditorMessage(editorDate === todayKey() ? 'Saved session.' : `Saved ${editorDate}.`);
  }

  function savePbEdit() {
    savePb(parseTime(pbDraftMin, pbDraftSec));
  }

  if (!loaded) {
    return <SafeAreaView style={styles.safe}><StatusBar style="light" /></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        {!onboardingComplete ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Set your max hold</Text>
            <Text style={styles.helperText}>First time here — time one now or enter it manually.</Text>
            <View style={styles.choiceWrap}>
              {(['timer', 'manual'] as SetupMode[]).map((mode) => (
                <Pressable key={mode} onPress={() => setSetupMode(mode)} style={[styles.choiceChip, setupMode === mode && styles.choiceChipActive]}>
                  <Text style={[styles.choiceChipText, setupMode === mode && styles.choiceChipTextActive]}>{mode === 'timer' ? 'Time it now' : 'Enter manually'}</Text>
                </Pressable>
              ))}
            </View>
            {setupMode === 'timer' ? (
              <>
                <Text style={styles.timerValue}>{formatTime(maxHoldElapsed)}</Text>
                <Text style={styles.helperText}>Voice calls out elapsed time every 30 seconds.</Text>
                <Pressable onPress={() => {
                  if (maxHoldRunning) stopAndSaveMaxHold();
                  else {
                    lastElapsedCueRef.current = 0;
                    setMaxHoldElapsed(0);
                    setMaxHoldRunning(true);
                  }
                }} style={styles.primaryButton}>
                  <Text style={styles.primaryButtonText}>{maxHoldRunning ? 'Stop and save' : 'Start max hold'}</Text>
                </Pressable>
              </>
            ) : (
              <>
                <View style={styles.row}>
                  <View style={styles.timeInputWrap}>
                    <TextInput value={setupManualMin} onChangeText={setSetupManualMin} keyboardType="number-pad" style={styles.smallInput} placeholder="mm" placeholderTextColor="#64748b" maxLength={2} />
                    <Text style={styles.unitText}>min</Text>
                  </View>
                  <View style={styles.timeInputWrap}>
                    <TextInput value={setupManualSec} onChangeText={setSetupManualSec} keyboardType="number-pad" style={styles.smallInput} placeholder="ss" placeholderTextColor="#64748b" maxLength={2} />
                    <Text style={styles.unitText}>sec</Text>
                  </View>
                </View>
                <Pressable onPress={submitManualPb} style={styles.primaryButton}><Text style={styles.primaryButtonText}>Save max hold</Text></Pressable>
              </>
            )}
          </View>
        ) : null}

        <View style={styles.pbRow}>
          <Text style={styles.pbText}>Max hold: {formatTime(pbSec)}</Text>
          <Pressable onPress={() => setEditingPb((value) => !value)} style={styles.iconButton}><Text style={styles.iconButtonText}>✎</Text></Pressable>
        </View>
        {editingPb ? (
          <View style={styles.inlineEditor}>
            <View style={styles.row}>
              <View style={styles.timeInputWrap}>
                <TextInput value={pbDraftMin} onChangeText={setPbDraftMin} keyboardType="number-pad" style={styles.smallInput} placeholder="mm" placeholderTextColor="#64748b" maxLength={2} />
                <Text style={styles.unitText}>min</Text>
              </View>
              <View style={styles.timeInputWrap}>
                <TextInput value={pbDraftSec} onChangeText={setPbDraftSec} keyboardType="number-pad" style={styles.smallInput} placeholder="ss" placeholderTextColor="#64748b" maxLength={2} />
                <Text style={styles.unitText}>sec</Text>
              </View>
            </View>
            <Pressable onPress={savePbEdit} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>Save</Text></Pressable>
          </View>
        ) : null}

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
          <View style={styles.workoutTable}>
            <View style={styles.workoutHeaderRow}>
              <Text style={styles.workoutHeaderText}>Round</Text>
              <Text style={styles.workoutHeaderText}>Breathe</Text>
              <Text style={styles.workoutHeaderText}>Hold</Text>
            </View>
            {plan.tableRows.map((row) => (
              <View key={row.round} style={styles.workoutRow}>
                <Text style={styles.workoutCell}>{row.round}</Text>
                <Text style={styles.workoutCell}>{formatTime(row.restSec)}</Text>
                <Text style={styles.workoutCell}>{formatTime(row.holdSec)}</Text>
              </View>
            ))}
          </View>
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
            <Text style={styles.timerRound}>{currentPhase?.roundLabel ?? plan.title}</Text>
          </View>
          <Pressable onPress={toggleSession} style={styles.primaryButton}><Text style={styles.primaryButtonText}>{running ? 'Stop' : 'Start'}</Text></Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{editorDate === todayKey() ? 'Log session' : `Edit ${editorDate}`}</Text>
          {editorDate !== todayKey() ? (
            <View style={styles.editingRow}>
              <Text style={styles.helperText}>Editing a history entry.</Text>
              <Pressable onPress={() => loadEditor(todayKey())} style={styles.miniButton}><Text style={styles.miniButtonText}>Back to today</Text></Pressable>
            </View>
          ) : null}
          <Text style={styles.sectionLabel}>What happened?</Text>
          <View style={styles.choiceWrap}>
            {([
              ['completed', 'Completed'],
              ['rest', 'Rest day'],
              ['missed', 'Missed'],
            ] as const).map(([value, label]) => (
              <Pressable key={value} onPress={() => setDailyOutcome(value)} style={[styles.choiceChip, dailyOutcome === value && styles.choiceChipActive]}>
                <Text style={[styles.choiceChipText, dailyOutcome === value && styles.choiceChipTextActive]}>{label}</Text>
              </Pressable>
            ))}
          </View>
          {dailyOutcome === 'completed' ? (
            <>
              <Text style={styles.sectionLabel}>How did it feel?</Text>
              <View style={styles.choiceWrap}>
                {(['easy', 'solid', 'hard'] as Effort[]).map((item) => (
                  <Pressable key={item} onPress={() => setResultEffort(item)} style={[styles.choiceChip, resultEffort === item && styles.choiceChipActive]}>
                    <Text style={[styles.choiceChipText, resultEffort === item && styles.choiceChipTextActive]}>{EFFORT_LABEL[item]}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}
          <Text style={styles.sectionLabel}>Notes</Text>
          <TextInput value={resultNotes} onChangeText={setResultNotes} style={styles.notesInput} multiline placeholder="Optional" placeholderTextColor="#64748b" />
          <Pressable onPress={saveLog} style={styles.primaryButton}><Text style={styles.primaryButtonText}>{editorDate === todayKey() ? 'Submit session log' : 'Save changes'}</Text></Pressable>
          {editorMessage ? <Text style={styles.helperText}>{editorMessage}</Text> : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>History</Text>
          {recentLogs.length === 0 ? <Text style={styles.helperText}>No entries yet.</Text> : null}
          {recentLogs.map((log) => (
            <View key={log.id} style={styles.logRow}>
              <View style={styles.logHeaderRow}>
                <Text style={styles.logDate}>{log.date}</Text>
                <View style={styles.logHeaderActions}>
                  <Text style={[styles.logKind, { color: effortColor(log.effort) }]}>{KIND_LABEL[log.kind]}</Text>
                  <Pressable onPress={() => startHistoryEdit(log.date)} style={styles.historyEditButton}><Text style={styles.historyEditButtonText}>✎</Text></Pressable>
                </View>
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
  safe: { flex: 1, backgroundColor: '#08111f' },
  screen: { flex: 1 },
  content: { padding: 18, gap: 16, paddingBottom: 44 },
  card: { backgroundColor: '#0d1728', borderRadius: 20, padding: 18, borderWidth: 1, borderColor: '#1f2c43', gap: 10 },
  cardTitle: { color: '#f8fafc', fontSize: 19, fontWeight: '800' },
  cardSubtitle: { color: '#94a3b8', fontSize: 13, lineHeight: 19 },
  helperText: { color: '#94a3b8', fontSize: 13, lineHeight: 18 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  titleTextWrap: { flex: 1 },
  pbRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  pbText: { color: '#f8fafc', fontSize: 18, fontWeight: '800' },
  iconButton: { width: 34, height: 34, borderRadius: 999, borderWidth: 1, borderColor: '#2a4060', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0d1728' },
  iconButtonText: { color: '#dbeafe', fontSize: 16, fontWeight: '700' },
  inlineEditor: { backgroundColor: '#0d1728', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#1f2c43', gap: 10 },
  kindBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: '#122034', borderWidth: 1, borderColor: '#254263' },
  kindBadgeText: { color: '#dbeafe', fontSize: 12, fontWeight: '800' },
  readyText: { color: '#86efac', fontSize: 12, fontWeight: '800', textTransform: 'uppercase' },
  infoBox: { backgroundColor: '#0a1220', borderRadius: 16, padding: 12, gap: 4 },
  infoBoxLabel: { color: '#7dd3fc', fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  infoBoxText: { color: '#dbe4f0', fontSize: 14, lineHeight: 20 },
  workoutTable: { backgroundColor: '#0a1220', borderRadius: 16, padding: 12, gap: 8 },
  workoutHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: '#22344f' },
  workoutHeaderText: { color: '#7dd3fc', fontSize: 12, fontWeight: '800', width: '30%', textTransform: 'uppercase' },
  workoutRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  workoutCell: { color: '#f8fafc', fontSize: 14, fontWeight: '700', width: '30%' },
  row: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  timeInputWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#0a1220', borderRadius: 14, borderWidth: 1, borderColor: '#22344f', paddingHorizontal: 12, paddingVertical: 10 },
  smallInput: { color: '#f8fafc', minWidth: 32, fontSize: 18, fontWeight: '700' },
  unitText: { color: '#94a3b8', fontSize: 13 },
  timerShell: { backgroundColor: '#0a1220', borderRadius: 20, borderWidth: 1, borderColor: '#22344f', padding: 18, alignItems: 'center', gap: 8 },
  timerPhase: { color: '#7dd3fc', fontSize: 13, fontWeight: '800', letterSpacing: 1 },
  timerValue: { color: '#f8fafc', fontSize: 48, fontWeight: '800' },
  timerRound: { color: '#94a3b8', fontSize: 14, fontWeight: '600' },
  primaryButton: { backgroundColor: '#38bdf8', borderRadius: 16, paddingVertical: 14, alignItems: 'center' },
  primaryButtonText: { color: '#08111f', fontSize: 16, fontWeight: '900' },
  secondaryButton: { backgroundColor: '#122034', borderRadius: 16, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: '#2a4060' },
  secondaryButtonText: { color: '#dbeafe', fontSize: 14, fontWeight: '800' },
  audioToggle: { backgroundColor: '#122034', borderWidth: 1, borderColor: '#2a4060', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  audioToggleText: { color: '#dbeafe', fontSize: 12, fontWeight: '800' },
  sectionLabel: { color: '#dbeafe', fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  choiceWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  choiceChip: { borderRadius: 999, borderWidth: 1, borderColor: '#2a4060', paddingHorizontal: 12, paddingVertical: 9, backgroundColor: '#0a1220' },
  choiceChipActive: { backgroundColor: '#38bdf8', borderColor: '#38bdf8' },
  choiceChipText: { color: '#cbd5e1', fontSize: 13, fontWeight: '700' },
  choiceChipTextActive: { color: '#08111f' },
  notesInput: { minHeight: 92, borderRadius: 14, borderWidth: 1, borderColor: '#22344f', backgroundColor: '#0a1220', padding: 12, color: '#f8fafc', textAlignVertical: 'top' },
  editingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  miniButton: { borderRadius: 12, borderWidth: 1, borderColor: '#2a4060', backgroundColor: '#122034', paddingHorizontal: 12, paddingVertical: 10 },
  miniButtonText: { color: '#dbeafe', fontWeight: '800' },
  logRow: { backgroundColor: '#0a1220', borderRadius: 16, padding: 12, gap: 4 },
  logHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  logHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logDate: { color: '#94a3b8', fontSize: 12, fontWeight: '700' },
  logKind: { fontSize: 12, fontWeight: '800' },
  historyEditButton: { width: 28, height: 28, borderRadius: 999, borderWidth: 1, borderColor: '#2a4060', alignItems: 'center', justifyContent: 'center', backgroundColor: '#122034' },
  historyEditButtonText: { color: '#dbeafe', fontSize: 14, fontWeight: '700' },
  logTitle: { color: '#f8fafc', fontSize: 14, fontWeight: '700' },
  logMeta: { color: '#93c5fd', fontSize: 12, fontWeight: '700' },
  logNotes: { color: '#cbd5e1', fontSize: 13, lineHeight: 18 },
});
