import { memo, useEffect, useState } from 'react';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { sampleScene, VIEW, type ScenePart } from './figure';

const FRAME_MS = 1000 / 30;

type Props = {
  anim: string;
  size: number;
  playing?: boolean;
};

function partElement(part: ScenePart, index: number) {
  if (part.k === 'line') {
    return (
      <Line
        key={index}
        x1={part.x1}
        y1={part.y1}
        x2={part.x2}
        y2={part.y2}
        stroke={part.c}
        strokeWidth={part.w}
        strokeLinecap="round"
        opacity={part.o ?? 1}
      />
    );
  }
  if (part.k === 'circle') {
    return (
      <Circle
        key={index}
        cx={part.cx}
        cy={part.cy}
        r={part.r}
        fill={part.f}
        stroke={part.sc}
        strokeWidth={part.sw ?? 0}
        opacity={part.o ?? 1}
      />
    );
  }
  return (
    <Path
      key={index}
      d={part.d}
      fill={part.f}
      stroke={part.sc}
      strokeWidth={part.sw ?? 0}
      strokeLinejoin="round"
      opacity={part.o ?? 1}
    />
  );
}

function LukeAnimeInner({ anim, size, playing = true }: Props) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = 0;
    const start = Date.now();
    const loop = () => {
      const now = Date.now();
      if (now - last >= FRAME_MS) {
        last = now;
        setTick(now - start);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, anim]);

  const parts = sampleScene(anim, playing ? tick : 0);

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${VIEW} ${VIEW}`}>
      {parts.map(partElement)}
    </Svg>
  );
}

export const LukeAnime = memo(LukeAnimeInner);
