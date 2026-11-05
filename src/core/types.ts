import type { PenKind } from './toolState';

export interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export type Pt = [number, number, number];
export type ObjBase = { id: string; createdAt: number; bbox: BBox };
export type StrokeObj = ObjBase & {
  kind: 'stroke';
  pen: PenKind;
  color: string;
  size: number;
  points: Pt[];
};
export type ShapeObj = ObjBase & {
  kind: 'shape';
  shape: 'ellipse' | 'rect' | 'triangle' | 'line';
  pen: PenKind;
  color: string;
  size: number;
  ellipse?: { cx: number; cy: number; rx: number; ry: number };
  vertices?: [number, number][];
};
export type ArrowObj = ObjBase & {
  kind: 'arrow';
  from: [number, number];
  to: [number, number];
  pen: PenKind;
  color: string;
  size: number;
};
export type TextObj = ObjBase & {
  kind: 'text';
  x: number;
  y: number;
  text: string;
  color: string;
  fontSize: number;
};
export type BoardObject = StrokeObj | ShapeObj | ArrowObj | TextObj;
