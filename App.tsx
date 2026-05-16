import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
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
type Guidance = 'brief' | 'standard' | 'coach';
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
  guidance: string[];
  beforeYouStart: string[];
  recovery: string[];
  weeklyPlan: WeeklyItem[];
  progression: string[];
  warnings: string[];
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

const DIFFICULTY_PROFILES: Record<Difficulty, DifficultyProfile> = {
  beginner: {
    label: 'Beginner',
    description: 'Comfort-first. Build consistency before intensity.',
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
    description: 'Balanced progress with stronger contractions and cleaner pacing.',
    co2HoldPct: 0.68,
    co2RestStartPct: 1.05,
    co2RestFloor: 25,
    o2RestPct: 0.95,
    o2StartPct: 0.58,
    o2EndPct: 0.92,
    techniquePct: 0.56,
    prTargetPct: 1.0,
  },
  expert: {
    label: 'Expert',
    description: 'For experienced freedivers who already know their signals and recovery rhythm.',
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

const GUIDANCE_LABELS: Record<Guidance, string> = {
  brief: 'Brief',
  standard: 'Standard',
  coach: 'Coach',
};

const AGGRESSION_PRESETS = [20, 40, 60, 80, 100];

const RISK_STYLES: Record<Risk, { label: string; color: string; bg: string }> = {
  low: { label: 'Low risk', color: '#86efac', bg: '#0f2c1b' },
  moderate: { label: 'Moderate risk', color: '#fde68a', bg: '#33250c' },
  high: { label: 'High risk', color: '#fca5a5', bg: '#34161a' },
};

const UNIVERSAL_WARNINGS = [
  'Dry training only unless supervised by a competent buddy.',
  'Never train in water alone. Never do tables while driving, walking stairs, or standing.',
  'No hyperventilation, aggressive purging, or hard air-packing.',
  'Stop immediately for tunnel vision, hearing fade, tingling, confusion, panic, or loss of motor control.',
];

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
  const techniqueHold = formatTime(Math.round(pbSec * profile.techniquePct));
  const hardCo2Hold = formatTime(Math.round(pbSec * profile.co2HoldPct));
  const o2Peak = formatTime(Math.round(pbSec * profile.o2EndPct));

  return [
    { day: 'Mon', title: 'Hard CO₂', detail: `${hardCo2Hold} holds with shrinking rest. Finish with control, not chaos.` },
    { day: 'Tue', title: 'Easy technique', detail: `${techniqueHold} easy holds. Relax jaw, shoulders, tongue, and belly.` },
    { day: 'Wed', title: 'O₂ table', detail: `Fixed rest, holds rising toward ${o2Peak}. Treat this as the higher-risk day.` },
    { day: 'Thu', title: 'Off', detail: 'No hard apnea. Walk, stretch, sleep, and hydrate.' },
    { day: 'Fri', title: 'Controlled CO₂', detail: 'Submax work to keep rhythm without stacking fatigue.' },
    { day: 'Sat', title: 'PR prep or walking apnea', detail: 'Choose one: careful dry PR routine or short walking apnea sets.' },
    { day: 'Sun', title: 'Off', detail: 'Let adaptation happen. Better to arrive fresh than fried.' },
  ];
}

function buildProgression(pbSec: number): string[] {
  return [
    `Weeks 1–2: stay submax and learn what a calm ${formatTime(Math.round(pbSec * 0.75))} feels like.`,
    'Weeks 3–4: keep CO₂ days hard enough to challenge comfort, not technique.',
    'Weeks 5–6: let O₂ work creep upward slowly; if you are guessing whether it is too much, it probably is.',
    'Weeks 7–8: reduce volume slightly and put quality into one clean PR-style day per week.',
  ];
}

function selectGuidance(items: string[], guidance: Guidance) {
  if (guidance === 'brief') return items.slice(0, 2);
  if (guidance === 'standard') return items.slice(0, 4);
  return items;
}

function createPlan(pbSec: number, difficulty: Difficulty, focus: Focus, aggression: number, guidance: Guidance): Plan {
  const profile = DIFFICULTY_PROFILES[difficulty];
  const intensity = aggression / 100;
  const weeklyPlan = buildWeeklyPlan(pbSec, difficulty);
  const progression = buildProgression(pbSec);

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
      subtitle: 'Same hold, decreasing rest. This is your urge-to-breathe training.',
      rationale: 'CO₂ work improves comfort under contractions and teaches you not to burn energy fighting the urge to breathe.',
      risk: difficulty === 'expert' || aggression >= 80 ? 'moderate' : 'low',
      focus,
      tableRows,
      phases: tableRows.flatMap((row) => [
        { id: `${row.round}-rest`, kind: 'rest', label: 'Breathe / recover', durationSec: row.restSec, roundLabel: row.label },
        { id: `${row.round}-hold`, kind: 'hold', label: 'Hold', durationSec: row.holdSec, roundLabel: row.label },
      ]),
      guidance: selectGuidance(
        [
          'Contractions are information, not danger. Let them happen instead of bracing against them.',
          'Keep jaw, tongue, shoulders, hands, and belly soft.',
          'If the last two rounds feel easy, raise hold time a little next session — not the pace of your breathing.',
          'If you fail the same round twice, reduce the hold by 10 seconds next time.',
          'CO₂ tables usually move comfort faster than O₂ tables, which is why they are the safer default.',
        ],
        guidance
      ),
      beforeYouStart: selectGuidance(
        [
          'Lie down or sit somewhere safe.',
          'Breathe normally. No purging or stacked inhalations.',
          'Decide now that you will stop if the warning signs show up.',
        ],
        guidance
      ),
      recovery: selectGuidance(
        [
          'Take at least 48 hours before another hard CO₂ session.',
          'If sleep worsens or contractions come early, swap your next hard day for easy technique.',
          'A good session leaves you challenged but technically clean — not cracked open.',
        ],
        guidance
      ),
      weeklyPlan,
      progression,
      warnings: UNIVERSAL_WARNINGS,
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
      subtitle: 'Fixed rest, longer holds. Higher reward, higher risk.',
      rationale: 'O₂ work can extend your real max hold, but it sneaks up on you. Calm is not the same thing as safe.',
      risk: 'high',
      focus,
      tableRows,
      phases: tableRows.flatMap((row) => [
        { id: `${row.round}-rest`, kind: 'rest', label: 'Breathe / recover', durationSec: row.restSec, roundLabel: row.label },
        { id: `${row.round}-hold`, kind: 'hold', label: 'Hold', durationSec: row.holdSec, roundLabel: row.label },
      ]),
      guidance: selectGuidance(
        [
          'Stay boring with your breathe-up. O₂ work gets dangerous when people get clever.',
          'If a hold feels “weirdly easy,” do not chase that feeling with extra time.',
          'Use this 1–2 times per week max unless you are already very adapted and supervised.',
          'Treat the final rounds as optional if your signals are off that day.',
          'This is the table most likely to inch you toward blackout territory if you ignore form.',
        ],
        guidance
      ),
      beforeYouStart: selectGuidance(
        [
          'Only do this dry, lying or seated, and not when overtired.',
          'Skip O₂ work if you have a headache, poor sleep, or a weird stress buzz in your body.',
          'If you are unsure whether today is an O₂ day, make it a technique day instead.',
        ],
        guidance
      ),
      recovery: selectGuidance(
        [
          'Give yourself at least 48–72 hours before another hypoxic session.',
          'If your PB drops for two weeks, take 3–4 days off hard work.',
          'O₂ progress tends to come from patience, not forcing one magic session.',
        ],
        guidance
      ),
      weeklyPlan,
      progression,
      warnings: UNIVERSAL_WARNINGS,
    };
  }

  if (focus === 'technique') {
    const holdSec = clamp(Math.round(pbSec * (profile.techniquePct - (1 - intensity) * 0.04)), 45, pbSec - 30);
    const restSec = clamp(Math.round(pbSec * 1.25), 120, 240);
    const rows = Array.from({ length: 5 }, (_, index) => ({
      round: index + 1,
      label: `Easy hold ${index + 1}`,
      restSec,
      holdSec,
    }));

    const phases: Phase[] = [
      { id: 'settle', kind: 'settle', label: 'Settle and relax', durationSec: 120 },
      ...rows.flatMap((row): Phase[] => [
        { id: `${row.round}-rest`, kind: 'rest', label: 'Slow nasal breathing', durationSec: row.restSec, roundLabel: row.label },
        { id: `${row.round}-hold`, kind: 'hold', label: 'Easy hold', durationSec: row.holdSec, roundLabel: row.label },
      ]),
    ];

    return {
      title: 'Technique + relaxation',
      subtitle: 'Easy holds that teach efficiency, not suffering.',
      rationale: 'Most freedivers leak time through tension. Technique days are where you win that time back.',
      risk: 'low',
      focus,
      tableRows: rows,
      phases,
      guidance: selectGuidance(
        [
          'Let your face look almost sleepy. That usually means the rest of you is soft too.',
          'Aim for the same smooth feeling on every hold rather than a longer number.',
          'If contractions show up, greet them and relax around them.',
          'Face immersion can help on dry statics if you already use it safely and calmly.',
        ],
        guidance
      ),
      beforeYouStart: selectGuidance(
        [
          'Give yourself two minutes to downshift before the first hold.',
          'Do not turn an easy day into a test day because you feel good.',
        ],
        guidance
      ),
      recovery: selectGuidance(
        [
          'Technique sessions are the best choice when you are not fully recovered.',
          'These can fit 2–3 times per week because the stress is low if you keep them honest.',
        ],
        guidance
      ),
      weeklyPlan,
      progression,
      warnings: UNIVERSAL_WARNINGS,
    };
  }

  if (focus === 'pr') {
    const targetSec = clamp(Math.round(pbSec * (profile.prTargetPct + intensity * 0.02)), Math.max(90, pbSec - 10), Math.round(pbSec * 1.08));
    const warmupOne = clamp(Math.round(pbSec * 0.55), 60, 120);
    const warmupTwo = clamp(Math.round(pbSec * 0.85), warmupOne + 20, Math.max(warmupOne + 20, pbSec - 5));

    return {
      title: 'Static PR prep',
      subtitle: 'A conservative dry max-attempt protocol.',
      rationale: 'The goal is not to manufacture heroics. It is to arrive calm, warm, and technically clean for one controlled max attempt.',
      risk: 'high',
      focus,
      tableRows: [
        { round: 1, label: 'Warmup 1', restSec: 180, holdSec: warmupOne },
        { round: 2, label: 'Warmup 2', restSec: 240, holdSec: warmupTwo },
        { round: 3, label: 'Target attempt', restSec: 300, holdSec: targetSec },
      ],
      phases: [
        { id: 'settle', kind: 'settle', label: 'Lie down and relax', durationSec: 300 },
        { id: 'w1-hold', kind: 'hold', label: 'Warmup hold 1', durationSec: warmupOne, roundLabel: 'Warmup 1' },
        { id: 'w1-recovery', kind: 'recovery', label: 'Recovery', durationSec: 180, roundLabel: 'Warmup 1' },
        { id: 'w2-hold', kind: 'hold', label: 'Warmup hold 2', durationSec: warmupTwo, roundLabel: 'Warmup 2' },
        { id: 'w2-recovery', kind: 'recovery', label: 'Recovery', durationSec: 240, roundLabel: 'Warmup 2' },
        { id: 'target-recovery', kind: 'recovery', label: 'Long reset', durationSec: 300, roundLabel: 'Target attempt' },
        { id: 'target-hold', kind: 'hold', label: 'Target hold', durationSec: targetSec, roundLabel: 'Target attempt' },
      ],
      guidance: selectGuidance(
        [
          'No hard table the day before this.',
          'The first contraction is not the cue to panic. It is the cue to relax more deeply.',
          'Do not chase a number if your body feels “off.” Abort early and keep the protocol clean.',
          'Breathe normally before the hold. No hyperventilation. No aggressive packing.',
          'If your auditory field fades or vision narrows, the session is over. Not negotiable.',
        ],
        guidance
      ),
      beforeYouStart: selectGuidance(
        [
          'Only use PR prep on a day when sleep, stress, and hydration are all decent.',
          'If you are training alone, this should stay dry and conservative.',
          `Treat ${formatTime(targetSec)} as a ceiling, not an obligation.`,
        ],
        guidance
      ),
      recovery: selectGuidance(
        [
          'Take at least two easy days after a real max-attempt day.',
          'If you feel drained or shaky afterward, cut the next week back slightly instead of chasing momentum.',
        ],
        guidance
      ),
      weeklyPlan,
      progression,
      warnings: UNIVERSAL_WARNINGS,
    };
  }

  const controlledHold = clamp(Math.round(pbSec * (profile.co2HoldPct - 0.06)), 50, Math.max(55, pbSec - 20));
  const controlledRest = clamp(Math.round(pbSec * 0.7), 60, 120);
  const rows = Array.from({ length: 7 }, (_, index) => ({
    round: index + 1,
    label: `Controlled round ${index + 1}`,
    restSec: controlledRest,
    holdSec: controlledHold,
  }));

  return {
    title: 'Mixed week anchor session',
    subtitle: 'A moderate controlled CO₂ session with a full weekly structure below.',
    rationale: 'A mixed block works best when you stop trying to PR every day and give each stressor its own lane.',
    risk: 'moderate',
    focus,
    tableRows: rows,
    phases: rows.flatMap((row) => [
      { id: `${row.round}-rest`, kind: 'rest', label: 'Breathe / recover', durationSec: row.restSec, roundLabel: row.label },
      { id: `${row.round}-hold`, kind: 'hold', label: 'Controlled hold', durationSec: row.holdSec, roundLabel: row.label },
    ]),
    guidance: selectGuidance(
      [
        'Two hard days and one moderate day usually beats daily maxing.',
        'Use the weekly structure below instead of turning every session into the same kind of suffering.',
        'Walking apnea belongs in short, controlled doses — not as punishment cardio.',
        'If holds get shorter despite effort, you are not underperforming. You are under-recovered.',
      ],
      guidance
    ),
    beforeYouStart: selectGuidance(
      [
        'Decide whether today is hard, moderate, or easy before you begin.',
        'If recovery is questionable, downgrade the day. That is smart training, not weakness.',
      ],
      guidance
    ),
    recovery: selectGuidance(
      [
        'Keep only 2 true hard sessions per week unless you are already very adapted.',
        'Sleep and nervous-system freshness matter more than squeezing in one more ugly hold.',
      ],
      guidance
    ),
    weeklyPlan,
    progression,
    warnings: UNIVERSAL_WARNINGS,
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

export default function App() {
  const [minutes, setMinutes] = useState('2');
  const [seconds, setSeconds] = useState('30');
  const [difficulty, setDifficulty] = useState<Difficulty>('intermediate');
  const [focus, setFocus] = useState<Focus>('co2');
  const [guidance, setGuidance] = useState<Guidance>('standard');
  const [aggression, setAggression] = useState(60);
  const [safetyConfirmed, setSafetyConfirmed] = useState(false);
  const [running, setRunning] = useState(false);
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [phaseRemaining, setPhaseRemaining] = useState(0);
  const [sessionComplete, setSessionComplete] = useState(false);

  const pbSec = useMemo(() => {
    const mins = Number.parseInt(minutes || '0', 10) || 0;
    const secs = Number.parseInt(seconds || '0', 10) || 0;
    return clamp(mins * 60 + secs, 45, 600);
  }, [minutes, seconds]);

  const plan = useMemo(() => createPlan(pbSec, difficulty, focus, aggression, guidance), [pbSec, difficulty, focus, aggression, guidance]);

  useEffect(() => {
    setRunning(false);
    setPhaseIndex(0);
    setPhaseRemaining(plan.phases[0]?.durationSec ?? 0);
    setSessionComplete(false);
  }, [plan]);

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

  const currentPhase = plan.phases[phaseIndex];
  const totalSeconds = plan.phases.reduce((sum, phase) => sum + phase.durationSec, 0);
  const elapsedSeconds = plan.phases.slice(0, phaseIndex).reduce((sum, phase) => sum + phase.durationSec, 0) + ((currentPhase?.durationSec ?? 0) - phaseRemaining);
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
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <View style={styles.heroCard}>
          <Text style={styles.eyebrow}>BreathHold Trainer</Text>
          <Text style={styles.heroTitle}>Safe dry-table support for freedivers</Text>
          <Text style={styles.heroBody}>
            Adaptive CO₂ and O₂ tables, guided timing, technique cues, and recovery advice — built for dry static practice, not macho guesswork.
          </Text>
          <View style={styles.warningBanner}>
            <Text style={styles.warningBannerText}>No hyperventilation. No water alone. Stop for tunnel vision, hearing fade, confusion, tingling, or panic.</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Your baseline</Text>
          <Text style={styles.cardSubtitle}>Set your current comfortable personal best for dry static training.</Text>
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

          <Text style={styles.sectionLabel}>Guidance</Text>
          <View style={styles.choiceWrap}>
            {(Object.keys(GUIDANCE_LABELS) as Guidance[]).map((item) => (
              <ChoiceChip key={item} label={GUIDANCE_LABELS[item]} active={guidance === item} onPress={() => setGuidance(item)} />
            ))}
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.titleRow}>
            <View>
              <Text style={styles.cardTitle}>{plan.title}</Text>
              <Text style={styles.cardSubtitle}>{plan.subtitle}</Text>
            </View>
            <View style={[styles.riskBadge, { backgroundColor: riskStyle.bg }]}> 
              <Text style={[styles.riskBadgeText, { color: riskStyle.color }]}>{riskStyle.label}</Text>
            </View>
          </View>
          <Text style={styles.bodyText}>{plan.rationale}</Text>

          <View style={styles.safetyChecklist}>
            {plan.warnings.map((warning) => (
              <View key={warning} style={styles.bulletRow}>
                <Text style={styles.bullet}>•</Text>
                <Text style={styles.bulletText}>{warning}</Text>
              </View>
            ))}
          </View>

          <Pressable style={styles.confirmRow} onPress={() => setSafetyConfirmed((current) => !current)}>
            <View style={[styles.checkbox, safetyConfirmed && styles.checkboxActive]}>
              {safetyConfirmed ? <Text style={styles.checkboxMark}>✓</Text> : null}
            </View>
            <Text style={styles.confirmText}>I’m doing dry training safely and I’ll stop if warning signs show up.</Text>
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
          <Text style={styles.cardTitle}>Guided timer</Text>
          <View style={styles.timerShell}>
            <Text style={styles.timerPhase}>{sessionComplete ? 'COMPLETE' : formatPhaseKind(currentPhase?.kind ?? 'rest')}</Text>
            <Text style={styles.timerValue}>{sessionComplete ? 'Done' : formatTime(phaseRemaining)}</Text>
            <Text style={styles.timerMeta}>{sessionComplete ? 'Nice work — recover fully.' : `${currentPhase?.roundLabel ?? 'Prep'} · ${currentPhase?.label ?? 'Ready'}`}</Text>
            <View style={styles.progressBarTrack}>
              <View style={[styles.progressBarFill, { width: `${progress * 100}%` }]} />
            </View>
            <Text style={styles.progressCaption}>{formatTime(elapsedSeconds)} elapsed · {formatTime(totalSeconds)} total</Text>
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
          <Text style={styles.cardTitle}>Before you start</Text>
          {plan.beforeYouStart.map((item) => (
            <View key={item} style={styles.bulletRow}>
              <Text style={styles.bullet}>•</Text>
              <Text style={styles.bulletText}>{item}</Text>
            </View>
          ))}
          <Text style={[styles.cardTitle, styles.subsectionTitle]}>Coaching cues</Text>
          {plan.guidance.map((item) => (
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

          <Text style={[styles.cardTitle, styles.subsectionTitle]}>8-week progression</Text>
          {plan.progression.map((item) => (
            <View key={item} style={styles.bulletRow}>
              <Text style={styles.bullet}>•</Text>
              <Text style={styles.bulletText}>{item}</Text>
            </View>
          ))}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Recovery + overtraining checks</Text>
          {plan.recovery.map((item) => (
            <View key={item} style={styles.bulletRow}>
              <Text style={styles.bullet}>•</Text>
              <Text style={styles.bulletText}>{item}</Text>
            </View>
          ))}
          <Text style={[styles.cardTitle, styles.subsectionTitle]}>Back off immediately if you notice:</Text>
          {[
            'Holds getting shorter despite strong effort.',
            'Violent contractions unusually early in the hold.',
            'Poor sleep, wired/tired feeling, or headache after sessions.',
            'Loss of calm, panic, or sloppy recovery breathing.',
          ].map((item) => (
            <View key={item} style={styles.bulletRow}>
              <Text style={styles.bullet}>•</Text>
              <Text style={styles.bulletText}>{item}</Text>
            </View>
          ))}
        </View>

        <View style={styles.footerCard}>
          <Text style={styles.footerTitle}>Important</Text>
          <Text style={styles.footerText}>
            This app is training support for experienced breath-hold athletes and curious dry-practice users. It is not medical advice, not a substitute for a coach, and not permission to ignore blackout risk.
          </Text>
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
  warningBanner: {
    backgroundColor: '#31131a',
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#60313b',
  },
  warningBannerText: {
    color: '#fecdd3',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  card: {
    backgroundColor: '#0d1728',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: '#1f2c43',
    gap: 10,
  },
  footerCard: {
    backgroundColor: '#101826',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: '#2c394f',
  },
  footerTitle: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 8,
  },
  footerText: {
    color: '#cbd5e1',
    fontSize: 13,
    lineHeight: 20,
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
  safetyChecklist: {
    gap: 6,
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
