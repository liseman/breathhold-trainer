export type ScenePart =
  | { k: 'line'; x1: number; y1: number; x2: number; y2: number; c: string; w: number; o?: number }
  | { k: 'circle'; cx: number; cy: number; r: number; f: string; sc?: string; sw?: number; o?: number }
  | { k: 'path'; d: string; f: string; sc?: string; sw?: number; o?: number };

export const VIEW: number;
export const INK: string;
export const ORANGE: string;
export const BLUE: string;
export const PAPER: string;
export const ANIM_NAMES: string[];
export function sampleScene(name: string, tMs: number): ScenePart[];
export function keyTimes(name: string): number[];
export function figureParts(pose: Record<string, number>): { parts: ScenePart[]; headC: [number, number] };
