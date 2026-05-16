import { Audio } from 'expo-av';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import { HALF_CUE_ASSETS } from './halfwayCues';
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

type Difficulty = 'beginner' | 'intermediate' | 'expert';
type Focus = 'co2' | 'o2' | 'mixed' | 'technique' | 'pr';
type Risk = 'low' | 'moderate' | 'high';
type PhaseKind = 'rest' | 'hold' | 'recovery' | 'settle';

type TableRow = {
  round: number;
  label: string;
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

type WeeklyItem = {
  day: string;
  title: string;
  detail: string;
};

type Plan = {
  title: string;
  subtitle: string;
  rationale: string;
  risk: Risk;
  focus: Focus;
  tableRows: TableRow[];
  phases: Phase[];
  cues: string[];
  sessionNotes: string[];
  recovery: string[];
  weeklyPlan: WeeklyItem[];
  progression: string[];
  safetyLine: string;
};

type DifficultyProfile = {
  label: string;
  description: string;
  co2HoldPct: number;
  co2RestStartPct: number;
  co2RestFloor: number;
  o2RestPct: number;
  o2StartPct: number;
  o2EndPct: number;
  techniquePct: number;
  prTargetPct: number;
};

const breatheCue = require('./assets/audio/breathe.mp3');
const holdCue = require('./assets/audio/hold.mp3');

const DIFFICULTY_PROFILES: Record<Difficulty, DifficultyProfile> = {
  beginner: {
    label: 'Beginner',
    description: 'Comfort first. Keep everything technically clean.',
    co2HoldPct: 0.58,
    co2RestStartPct: 1.2,
    co2RestFloor: 30,
    o2RestPct: 1.0,
    o2StartPct: 0.5,
    o2EndPct: 0.82,
    techniquePct: 0.5,
    prTargetPct: 0.95,
  },
  intermediate: {
    label: 'Intermediate',
    description: 'Balanced stress with stronger contraction tolerance.',
    co2HoldPct: 0.68,
    co2RestStartPct: 1.05,
    co2RestFloor: 25,
    o2RestPct: 0.95,
    o2StartPct: 0.58,
    o2EndPct: 0.92,
    techniquePct: 0.56,
    prTargetPct: 1,
  },
  expert: {
    label: 'Expert',
    description: 'For divers who already know their signals and pacing well.',
    co2HoldPct: 0.76,
    co2RestStartPct: 0.95,
    co2RestFloor: 20,
    o2RestPct: 0.9,
    o2StartPct: 0.64,
    o2EndPct: 0.98,
    techniquePct: 0.62,
    prTargetPct: 1.04,
  },
};

const FOCUS_LABELS: Record<Focus, string> = {
  co2: 'CO₂ table',
  o2: 'O₂ table',
  mixed: 'Mixed week',
  technique: 'Technique',
  pr: 'PR prep',
};

const AGGRESSION_PRESETS = [20, 40, 60, 80, 100];

const RISK_STYLES: Record<Risk, { label: string; color: string; bg: string }> = {
  low: { label: 'Low', color: '#86efac', bg: '#0f2c1b' },
  moderate: { label: 'Medium', color: '#fde68a', bg: '#33250c' },
  high: { label: 'High', color: '#fca5a5', bg: '#34161a' },
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

function lerp(start: number, end: number, t: number) {
  return start + (end - start) * t;
}

function buildDescending(start: number, end: number, count: number) {
  return Array.from({ length: count }, (_, index) =>
    Math.round(lerp(start, end, count === 1 ? 1 : index / (count - 1)))
  );
}

function buildAscending(start: number, end: number, count: number) {
  return buildDescending(start, end, count);
}

function buildWeeklyPlan(pbSec: number, difficulty: Difficulty): WeeklyItem[] {
  const profile = DIFFICULTY_PROFILES[difficulty];
  return [
    {
      day: 'Mon',
      title: 'Hard CO₂',
      detail: `${formatTime(Math.round(pbSec * profile.co2HoldPct))} holds with shrinking rest.`,
    },
    {
      day: 'Tue',
      title: 'Easy technique',
      detail: `${formatTime(Math.round(pbSec * profile.techniquePct))} easy holds with soft posture.`,
    },
    {
      day: 'Wed',
      title: 'O₂ table',
      detail: `Fixed rest, holds rising toward ${formatTime(Math.round(pbSec * profile.o2EndPct))}.`,
    },
    { day: 'Thu', title: 'Off', detail: 'No hard apnea. Let the system absorb the work.' },
    { day: 'Fri', title: 'Controlled CO₂', detail: 'Moderate quality work, not survival mode.' },
    { day: 'Sat', title: 'PR prep / walk apnea', detail: 'Choose one focused stressor, not both.' },
    { day: 'Sun', title: 'Off', detail: 'Fresh beats fried.' },
  ];
}

function buildProgression(pbSec: number): string[] {
  return [
    `Weeks 1–2: live around ${formatTime(Math.round(pbSec * 0.75))} and make it feel calm.`,
    'Weeks 3–4: raise discomfort tolerance without letting form get sloppy.',
    'Weeks 5–6: let O₂ days creep up slowly while keeping recovery honest.',
    'Weeks 7–8: reduce volume a bit and sharpen one good PR-style day each week.',
  ];
}

function createPlan(pbSec: number, difficulty: Difficulty, focus: Focus, aggression: number): Plan {
  const profile = DIFFICULTY_PROFILES[difficulty];
  const intensity = aggression / 100;
  const weeklyPlan = buildWeeklyPlan(pbSec, difficulty);
  const progression = buildProgression(pbSec);
  const safetyLine = 'Dry only. No water alone, no hyperventilation, stop if your signals feel wrong.';

  if (focus === 'co2') {
    const holdSec = clamp(
      Math.round(pbSec * (profile.co2HoldPct + intensity * 0.08)),
      45,
      Math.max(50, pbSec - 10)
    );
    const restStart = clamp(Math.round(holdSec * (profile.co2RestStartPct + (1 - intensity) * 0.2)), 60, 210);
    const restEnd = clamp(Math.round(profile.co2RestFloor + (1 - intensity) * 15), 20, restStart - 5);
    const rests = buildDescending(restStart, restEnd, 8);
    const tableRows = rests.map((restSec, index) => ({
      round: index + 1,
      label: `Round ${index + 1}`,
      restSec,
      holdSec,
    }));

    return {
      title: `${profile.label} CO₂ table`,
      subtitle: 'Same hold, falling rest.',
      rationale: 'Best for contraction tolerance and calm under mounting urge-to-breathe pressure.',
      risk: difficulty === 'expert' || aggression >= 80 ? 'moderate' : 'low',
      focus,
      tableRows,
      phases: tableRows.flatMap((row) => [
        { id: `${row.round}-rest`, kind: 'rest', label: 'Breathe', durationSec: row.restSec, roundLabel: row.label },
        { id: `${row.round}-hold`, kind: 'hold', label: 'Hold', durationSec: row.holdSec, roundLabel: row.label },
      ]),
      cues: ['Relax around contractions.', 'Keep face, jaw, tongue, and shoulders soft.', 'Raise time slowly, not ego quickly.'],
      sessionNotes: ['If the last rounds are easy, nudge time next session.', 'If form breaks twice, trim 10 seconds next time.'],
      recovery: ['Take at least 48h before the next hard CO₂ set.', 'Swap the next hard day for technique if contractions arrive unusually early.'],
      weeklyPlan,
      progression,
      safetyLine,
    };
  }

  if (focus === 'o2') {
    const restSec = clamp(Math.round(pbSec * (profile.o2RestPct + (1 - intensity) * 0.08)), 90, 210);
    const startHold = clamp(Math.round(pbSec * (profile.o2StartPct - (1 - intensity) * 0.04)), 50, pbSec - 30);
    const endHold = clamp(
      Math.round(pbSec * (profile.o2EndPct + (intensity - 0.5) * 0.06)),
      startHold + 20,
      difficulty === 'expert' ? Math.round(pbSec * 1.05) : pbSec
    );
    const holds = buildAscending(startHold, endHold, 8);
    const tableRows = holds.map((holdSec, index) => ({
      round: index + 1,
      label: `Round ${index + 1}`,
      restSec,
      holdSec,
    }));

    return {
      title: `${profile.label} O₂ table`,
      subtitle: 'Fixed rest, rising holds.',
      rationale: 'Best for extending max hold range, but keep it disciplined.',
      risk: 'high',
      focus,
      tableRows,
      phases: tableRows.flatMap((row) => [
        { id: `${row.round}-rest`, kind: 'rest', label: 'Breathe', durationSec: row.restSec, roundLabel: row.label },
        { id: `${row.round}-hold`, kind: 'hold', label: 'Hold', durationSec: row.holdSec, roundLabel: row.label },
      ]),
      cues: ['Keep the breathe-up boring and repeatable.', 'Do not extend a hold just because it feels easy early.', 'Final rounds are optional, not mandatory.'],
      sessionNotes: ['This is the most expensive stressor in the app.', 'If the day feels off, switch to technique instead.'],
      recovery: ['Give yourself 48–72h before another real hypoxic set.', 'If PBs dip for two weeks, back off volume for several days.'],
      weeklyPlan,
      progression,
      safetyLine,
    };
  }

  if (focus === 'technique') {
    const holdSec = clamp(Math.round(pbSec * (profile.techniquePct - (1 - intensity) * 0.04)), 45, pbSec - 30);
    const restSec = clamp(Math.round(pbSec * 1.25), 120, 240);
    const tableRows = Array.from({ length: 5 }, (_, index) => ({
      round: index + 1,
      label: `Easy hold ${index + 1}`,
      restSec,
      holdSec,
    }));
    const phases: Phase[] = [
      { id: 'settle', kind: 'settle', label: 'Settle', durationSec: 120 },
      ...tableRows.flatMap((row): Phase[] => [
        { id: `${row.round}-rest`, kind: 'rest', label: 'Breathe', durationSec: row.restSec, roundLabel: row.label },
        { id: `${row.round}-hold`, kind: 'hold', label: 'Easy hold', durationSec: row.holdSec, roundLabel: row.label },
      ]),
    ];

    return {
      title: 'Technique session',
      subtitle: 'Easy holds for efficiency and softness.',
      rationale: 'The cleanest way to steal back time is reducing tension leaks.',
      risk: 'low',
      focus,
      tableRows,
      phases,
      cues: ['Make your face look sleepy.', 'Let contractions happen without adding tension.', 'Use the same smooth feeling every round.'],
      sessionNotes: ['This is the best option on a low-recovery day.', 'Do not turn a technique day into a test day.'],
      recovery: ['Technique work can fit 2–3x per week if you keep it truly easy.'],
      weeklyPlan,
      progression,
      safetyLine,
    };
  }

  if (focus === 'pr') {
    const targetSec = clamp(Math.round(pbSec * (profile.prTargetPct + intensity * 0.02)), Math.max(90, pbSec - 10), Math.round(pbSec * 1.08));
    const warmupOne = clamp(Math.round(pbSec * 0.55), 60, 120);
    const warmupTwo = clamp(Math.round(pbSec * 0.85), warmupOne + 20, Math.max(warmupOne + 20, pbSec - 5));
    const tableRows = [
      { round: 1, label: 'Warmup 1', restSec: 180, holdSec: warmupOne },
      { round: 2, label: 'Warmup 2', restSec: 240, holdSec: warmupTwo },
      { round: 3, label: 'Target', restSec: 300, holdSec: targetSec },
    ];

    return {
      title: 'PR prep',
      subtitle: 'Conservative dry max-attempt rhythm.',
      rationale: 'Arrive warm, calm, and technically clean for one controlled target hold.',
      risk: 'high',
      focus,
      tableRows,
      phases: [
        { id: 'settle', kind: 'settle', label: 'Settle', durationSec: 300 },
        { id: 'w1-hold', kind: 'hold', label: 'Warmup hold 1', durationSec: warmupOne, roundLabel: 'Warmup 1' },
        { id: 'w1-rec', kind: 'recovery', label: 'Recover', durationSec: 180, roundLabel: 'Warmup 1' },
        { id: 'w2-hold', kind: 'hold', label: 'Warmup hold 2', durationSec: warmupTwo, roundLabel: 'Warmup 2' },
        { id: 'w2-rec', kind: 'recovery', label: 'Recover', durationSec: 240, roundLabel: 'Warmup 2' },
        { id: 'target-rec', kind: 'recovery', label: 'Recover', durationSec: 300, roundLabel: 'Target' },
        { id: 'target-hold', kind: 'hold', label: 'Target hold', durationSec: targetSec, roundLabel: 'Target' },
      ],
      cues: ['No hard table the day before.', 'Abort early if the body feels wrong.', `Treat ${formatTime(targetSec)} as a ceiling, not a debt.`],
      sessionNotes: ['Breathe normally before the hold.', 'One clean attempt beats a messy heroic one.'],
      recovery: ['Take at least two easy days after a genuine max attempt.'],
      weeklyPlan,
      progression,
      safetyLine,
    };
  }

  const holdSec = clamp(Math.round(pbSec * (profile.co2HoldPct - 0.06)), 50, Math.max(55, pbSec - 20));
  const restSec = clamp(Math.round(pbSec * 0.7), 60, 120);
  const tableRows = Array.from({ length: 7 }, (_, index) => ({
    round: index + 1,
    label: `Controlled round ${index + 1}`,
    restSec,
    holdSec,
  }));

  return {
    title: 'Mixed week anchor',
    subtitle: 'Moderate controlled work with a weekly structure below.',
    rationale: 'Best when you want progress without making every day the same kind of suffering.',
    risk: 'moderate',
    focus,
    tableRows,
    phases: tableRows.flatMap((row) => [
      { id: `${row.round}-rest`, kind: 'rest', label: 'Breathe', durationSec: row.restSec, roundLabel: row.label },
      { id: `${row.round}-hold`, kind: 'hold', label: 'Hold', durationSec: row.holdSec, roundLabel: row.label },
    ]),
    cues: ['Keep only two truly hard days per week.', 'Walking apnea belongs in small, clean doses.', 'If performance drops, recovery is the missing variable.'],
    sessionNotes: ['Choose hard, moderate, or easy before you start and respect it.'],
    recovery: ['Sleep and freshness matter more than squeezing in one more ugly hold.'],
    weeklyPlan,
    progression,
    safetyLine,
  };
}

function ChoiceChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.choiceChip, active && styles.choiceChipActive]}>
      <Text style={[styles.choiceChipText, active && styles.choiceChipTextActive]}>{label}</Text>
    </Pressable>
  );
}

function formatPhaseKind(kind: PhaseKind) {
  if (kind === 'hold') return 'HOLD';
  if (kind === 'rest') return 'BREATHE';
  if (kind === 'recovery') return 'RECOVER';
  return 'SETTLE';
}

async function playCue(source: number) {
  const { sound } = await Audio.Sound.createAsync(source, { shouldPlay: true, volume: 1 });
  sound.setOnPlaybackStatusUpdate((status) => {
    if ('didJustFinish' in status && status.didJustFinish) {
      sound.unloadAsync().catch(() => {});
    }
  });
}

function pickRandomHalfCue(lastIndex: number | null) {
  if (HALF_CUE_ASSETS.length === 1) return { asset: HALF_CUE_ASSETS[0], index: 0 };
  let nextIndex = Math.floor(Math.random() * HALF_CUE_ASSETS.length);
  while (lastIndex !== null && nextIndex === lastIndex) {
    nextIndex = Math.floor(Math.random() * HALF_CUE_ASSETS.length);
  }
  return { asset: HALF_CUE_ASSETS[nextIndex], index: nextIndex };
}

export default function App() {
  const [minutes, setMinutes] = useState('2');
  const [seconds, setSeconds] = useState('30');
  const [difficulty, setDifficulty] = useState<Difficulty>('intermediate');
  const [focus, setFocus] = useState<Focus>('co2');
  const [aggression, setAggression] = useState(60);
  const [safetyConfirmed, setSafetyConfirmed] = useState(false);
  const [running, setRunning] = useState(false);
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [phaseRemaining, setPhaseRemaining] = useState(0);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const announcedPhaseIdRef = useRef<string | null>(null);
  const halfwayAnnouncedPhaseIdRef = useRef<string | null>(null);
  const lastHalfCueIndexRef = useRef<number | null>(null);

  const pbSec = useMemo(() => {
    const mins = Number.parseInt(minutes || '0', 10) || 0;
    const secs = Number.parseInt(seconds || '0', 10) || 0;
    return clamp(mins * 60 + secs, 45, 600);
  }, [minutes, seconds]);

  const plan = useMemo(() => createPlan(pbSec, difficulty, focus, aggression), [pbSec, difficulty, focus, aggression]);

  useEffect(() => {
    Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
    }).catch(() => {});
  }, []);

  useEffect(() => {
    setRunning(false);
    setPhaseIndex(0);
    setPhaseRemaining(plan.phases[0]?.durationSec ?? 0);
    setSessionComplete(false);
    announcedPhaseIdRef.current = null;
    halfwayAnnouncedPhaseIdRef.current = null;
  }, [plan]);

  const currentPhase = plan.phases[phaseIndex];

  useEffect(() => {
    if (!running || !audioEnabled || !currentPhase) return;
    if (announcedPhaseIdRef.current === currentPhase.id) return;

    announcedPhaseIdRef.current = currentPhase.id;
    halfwayAnnouncedPhaseIdRef.current = null;

    if (currentPhase.kind === 'hold') {
      playCue(holdCue).catch(() => {});
    } else if (currentPhase.kind === 'rest' || currentPhase.kind === 'recovery') {
      playCue(breatheCue).catch(() => {});
    }
  }, [running, audioEnabled, currentPhase]);

  useEffect(() => {
    if (!running || !audioEnabled || !currentPhase) return;
    if (currentPhase.kind !== 'hold') return;
    if (currentPhase.durationSec < 20) return;
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
    if (!running) return;
    if (phaseRemaining <= 0) return;

    const timer = setTimeout(() => {
      setPhaseRemaining((current) => current - 1);
    }, 1000);

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
  const elapsedSeconds =
    plan.phases.slice(0, phaseIndex).reduce((sum, phase) => sum + phase.durationSec, 0) +
    ((currentPhase?.durationSec ?? 0) - phaseRemaining);
  const progress = totalSeconds > 0 ? clamp(elapsedSeconds / totalSeconds, 0, 1) : 0;
  const riskStyle = RISK_STYLES[plan.risk];

  function startSession() {
    if (!safetyConfirmed) return;
    if (sessionComplete) {
      setPhaseIndex(0);
      setPhaseRemaining(plan.phases[0]?.durationSec ?? 0);
      setSessionComplete(false);
    }
    if (phaseRemaining <= 0 && plan.phases[0]) {
      setPhaseIndex(0);
      setPhaseRemaining(plan.phases[0].durationSec);
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

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <View style={styles.heroCard}>
          <Text style={styles.eyebrow}>BreathHold Trainer</Text>
          <Text style={styles.heroTitle}>Tables, timer, and spoken cues</Text>
          <Text style={styles.heroBody}>
            Adaptive dry-table sessions for freedivers, with the same voice from your phone stack calling the key beats.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Baseline</Text>
          <View style={styles.row}>
            <View style={styles.timeInputWrap}>
              <Text style={styles.inputLabel}>Minutes</Text>
              <TextInput
                value={minutes}
                onChangeText={setMinutes}
                keyboardType="number-pad"
                style={styles.timeInput}
                maxLength={2}
              />
            </View>
            <View style={styles.timeInputWrap}>
              <Text style={styles.inputLabel}>Seconds</Text>
              <TextInput
                value={seconds}
                onChangeText={setSeconds}
                keyboardType="number-pad"
                style={styles.timeInput}
                maxLength={2}
              />
            </View>
            <View style={styles.pbPill}>
              <Text style={styles.pbPillLabel}>PB</Text>
              <Text style={styles.pbPillValue}>{formatTime(pbSec)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Session tuning</Text>
          <Text style={styles.sectionLabel}>Difficulty</Text>
          <View style={styles.choiceWrap}>
            {(Object.keys(DIFFICULTY_PROFILES) as Difficulty[]).map((item) => (
              <ChoiceChip
                key={item}
                label={DIFFICULTY_PROFILES[item].label}
                active={difficulty === item}
                onPress={() => setDifficulty(item)}
              />
            ))}
          </View>
          <Text style={styles.helperText}>{DIFFICULTY_PROFILES[difficulty].description}</Text>

          <Text style={styles.sectionLabel}>Focus</Text>
          <View style={styles.choiceWrap}>
            {(Object.keys(FOCUS_LABELS) as Focus[]).map((item) => (
              <ChoiceChip key={item} label={FOCUS_LABELS[item]} active={focus === item} onPress={() => setFocus(item)} />
            ))}
          </View>

          <Text style={styles.sectionLabel}>Aggressiveness</Text>
          <View style={styles.choiceWrap}>
            {AGGRESSION_PRESETS.map((value) => (
              <ChoiceChip
                key={value}
                label={`${value}%`}
                active={aggression === value}
                onPress={() => setAggression(value)}
              />
            ))}
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.titleRow}>
            <View style={styles.titleTextWrap}>
              <Text style={styles.cardTitle}>{plan.title}</Text>
              <Text style={styles.cardSubtitle}>{plan.subtitle}</Text>
            </View>
            <View style={[styles.riskBadge, { backgroundColor: riskStyle.bg }]}> 
              <Text style={[styles.riskBadgeText, { color: riskStyle.color }]}>{riskStyle.label}</Text>
            </View>
          </View>
          <Text style={styles.bodyText}>{plan.rationale}</Text>
          <Text style={styles.microSafety}>{plan.safetyLine}</Text>
          <Pressable style={styles.confirmRow} onPress={() => setSafetyConfirmed((current) => !current)}>
            <View style={[styles.checkbox, safetyConfirmed && styles.checkboxActive]}>
              {safetyConfirmed ? <Text style={styles.checkboxMark}>✓</Text> : null}
            </View>
            <Text style={styles.confirmText}>Ready. I’m training dry and paying attention to my own signals.</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Round plan</Text>
          {plan.tableRows.map((row) => (
            <View key={row.label} style={styles.tableRow}>
              <Text style={styles.tableRound}>{row.label}</Text>
              <View style={styles.tableTimes}>
                <Text style={styles.tableTimeLabel}>Rest {formatTime(row.restSec)}</Text>
                <Text style={styles.tableTimeValue}>Hold {formatTime(row.holdSec)}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.card}>
          <View style={styles.titleRow}>
            <Text style={styles.cardTitle}>Guided timer</Text>
            <Pressable onPress={() => setAudioEnabled((current) => !current)} style={styles.audioToggle}>
              <Text style={styles.audioToggleText}>{audioEnabled ? 'Audio on' : 'Audio off'}</Text>
            </Pressable>
          </View>
          <Text style={styles.helperText}>Voice cues: breathe, hold, and one of 100 randomized halfway encouragements.</Text>
          <View style={styles.timerShell}>
            <Text style={styles.timerPhase}>{sessionComplete ? 'COMPLETE' : formatPhaseKind(currentPhase?.kind ?? 'rest')}</Text>
            <Text style={styles.timerValue}>{sessionComplete ? 'Done' : formatTime(phaseRemaining)}</Text>
            <Text style={styles.timerMeta}>{sessionComplete ? 'Recover fully.' : `${currentPhase?.roundLabel ?? 'Prep'} · ${currentPhase?.label ?? 'Ready'}`}</Text>
            <View style={styles.progressBarTrack}>
              <View style={[styles.progressBarFill, { width: `${progress * 100}%` }]} />
            </View>
            <Text style={styles.progressCaption}>
              {formatTime(elapsedSeconds)} elapsed · {formatTime(totalSeconds)} total
            </Text>
          </View>

          <View style={styles.buttonRow}>
            <Pressable onPress={startSession} style={[styles.primaryButton, !safetyConfirmed && styles.buttonDisabled]}>
              <Text style={styles.primaryButtonText}>{running ? 'Running…' : sessionComplete ? 'Restart' : 'Start'}</Text>
            </Pressable>
            <Pressable onPress={pauseSession} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Pause</Text>
            </Pressable>
            <Pressable onPress={resetSession} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Reset</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Session cues</Text>
          {plan.cues.map((item) => (
            <View key={item} style={styles.bulletRow}>
              <Text style={styles.bullet}>•</Text>
              <Text style={styles.bulletText}>{item}</Text>
            </View>
          ))}
          <Text style={[styles.cardTitle, styles.subsectionTitle]}>Quick notes</Text>
          {plan.sessionNotes.map((item) => (
            <View key={item} style={styles.bulletRow}>
              <Text style={styles.bullet}>•</Text>
              <Text style={styles.bulletText}>{item}</Text>
            </View>
          ))}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Weekly rhythm</Text>
          {plan.weeklyPlan.map((item) => (
            <View key={item.day} style={styles.weekRow}>
              <Text style={styles.weekDay}>{item.day}</Text>
              <View style={styles.weekTextWrap}>
                <Text style={styles.weekTitle}>{item.title}</Text>
                <Text style={styles.weekDetail}>{item.detail}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Recovery</Text>
          {plan.recovery.map((item) => (
            <View key={item} style={styles.bulletRow}>
              <Text style={styles.bullet}>•</Text>
              <Text style={styles.bulletText}>{item}</Text>
            </View>
          ))}
          <Text style={[styles.cardTitle, styles.subsectionTitle]}>8-week progression</Text>
          {plan.progression.map((item) => (
            <View key={item} style={styles.bulletRow}>
              <Text style={styles.bullet}>•</Text>
              <Text style={styles.bulletText}>{item}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#08111f',
  },
  screen: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
    gap: 14,
  },
  heroCard: {
    backgroundColor: '#0d1728',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#1f2c43',
    gap: 10,
  },
  eyebrow: {
    color: '#7dd3fc',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  heroTitle: {
    color: '#f8fafc',
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '800',
  },
  heroBody: {
    color: '#cbd5e1',
    fontSize: 15,
    lineHeight: 22,
  },
  card: {
    backgroundColor: '#0d1728',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: '#1f2c43',
    gap: 10,
  },
  cardTitle: {
    color: '#f8fafc',
    fontSize: 19,
    fontWeight: '800',
  },
  subsectionTitle: {
    marginTop: 6,
    fontSize: 16,
  },
  cardSubtitle: {
    color: '#94a3b8',
    fontSize: 13,
    lineHeight: 19,
  },
  titleTextWrap: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-end',
    flexWrap: 'wrap',
  },
  timeInputWrap: {
    flex: 1,
    minWidth: 110,
    gap: 6,
  },
  inputLabel: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
  },
  timeInput: {
    backgroundColor: '#08111f',
    borderColor: '#26364f',
    borderWidth: 1,
    borderRadius: 16,
    color: '#f8fafc',
    fontSize: 24,
    fontWeight: '700',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  pbPill: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 18,
    backgroundColor: '#10233f',
    minWidth: 92,
  },
  pbPillLabel: {
    color: '#7dd3fc',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  pbPillValue: {
    color: '#f8fafc',
    fontSize: 24,
    fontWeight: '800',
  },
  sectionLabel: {
    color: '#e2e8f0',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 4,
  },
  choiceWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  choiceChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#0a1220',
    borderWidth: 1,
    borderColor: '#24354c',
  },
  choiceChipActive: {
    backgroundColor: '#1d4ed8',
    borderColor: '#60a5fa',
  },
  choiceChipText: {
    color: '#cbd5e1',
    fontSize: 13,
    fontWeight: '700',
  },
  choiceChipTextActive: {
    color: '#eff6ff',
  },
  helperText: {
    color: '#94a3b8',
    fontSize: 13,
    lineHeight: 18,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  riskBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  riskBadgeText: {
    fontSize: 12,
    fontWeight: '800',
  },
  bodyText: {
    color: '#dbe4f0',
    fontSize: 14,
    lineHeight: 20,
  },
  microSafety: {
    color: '#93c5fd',
    fontSize: 12,
    lineHeight: 17,
  },
  confirmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#0a1220',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#23334b',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: '#5b6f8f',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxActive: {
    backgroundColor: '#1d4ed8',
    borderColor: '#60a5fa',
  },
  checkboxMark: {
    color: '#eff6ff',
    fontWeight: '900',
  },
  confirmText: {
    flex: 1,
    color: '#e2e8f0',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  tableRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    alignItems: 'center',
    backgroundColor: '#0a1220',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  tableRound: {
    color: '#f8fafc',
    fontWeight: '700',
    fontSize: 14,
  },
  tableTimes: {
    alignItems: 'flex-end',
    gap: 2,
  },
  tableTimeLabel: {
    color: '#93c5fd',
    fontSize: 13,
    fontWeight: '600',
  },
  tableTimeValue: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '800',
  },
  audioToggle: {
    backgroundColor: '#122034',
    borderWidth: 1,
    borderColor: '#2a4060',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  audioToggleText: {
    color: '#dbeafe',
    fontSize: 12,
    fontWeight: '800',
  },
  timerShell: {
    backgroundColor: '#08111f',
    borderRadius: 20,
    padding: 18,
    alignItems: 'center',
    gap: 10,
  },
  timerPhase: {
    color: '#7dd3fc',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
  },
  timerValue: {
    color: '#f8fafc',
    fontSize: 54,
    fontWeight: '900',
  },
  timerMeta: {
    color: '#cbd5e1',
    fontSize: 14,
    textAlign: 'center',
  },
  progressBarTrack: {
    width: '100%',
    height: 10,
    backgroundColor: '#112032',
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#38bdf8',
    borderRadius: 999,
  },
  progressCaption: {
    color: '#94a3b8',
    fontSize: 12,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  primaryButton: {
    flex: 1,
    minWidth: 120,
    backgroundColor: '#2563eb',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  primaryButtonText: {
    color: '#eff6ff',
    fontWeight: '800',
    fontSize: 15,
  },
  secondaryButton: {
    flex: 1,
    minWidth: 90,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: '#122034',
    borderWidth: 1,
    borderColor: '#2a4060',
  },
  secondaryButtonText: {
    color: '#dbeafe',
    fontWeight: '700',
    fontSize: 15,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  bullet: {
    color: '#7dd3fc',
    fontSize: 16,
    lineHeight: 20,
  },
  bulletText: {
    flex: 1,
    color: '#dbe4f0',
    fontSize: 14,
    lineHeight: 20,
  },
  weekRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    paddingVertical: 6,
  },
  weekDay: {
    width: 42,
    color: '#7dd3fc',
    fontSize: 13,
    fontWeight: '800',
  },
  weekTextWrap: {
    flex: 1,
    gap: 2,
  },
  weekTitle: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '700',
  },
  weekDetail: {
    color: '#cbd5e1',
    fontSize: 13,
    lineHeight: 18,
  },
});
