// Standard playing card pip positions for ranks 2-10
// Each position: { x, y, flip } as percentages within the pip zone
// x: 25 = left column, 50 = center, 75 = right column
// y: 0 = top, 100 = bottom of pip zone
// flip: true = rotated 180deg (bottom-half convention)

export const PIP_LAYOUTS = {
  2: [
    { x: 50, y: 0 },
    { x: 50, y: 100, flip: true },
  ],
  3: [
    { x: 50, y: 0 },
    { x: 50, y: 50 },
    { x: 50, y: 100, flip: true },
  ],
  4: [
    { x: 30, y: 0 },
    { x: 70, y: 0 },
    { x: 30, y: 100, flip: true },
    { x: 70, y: 100, flip: true },
  ],
  5: [
    { x: 30, y: 0 },
    { x: 70, y: 0 },
    { x: 50, y: 50 },
    { x: 30, y: 100, flip: true },
    { x: 70, y: 100, flip: true },
  ],
  6: [
    { x: 30, y: 0 },
    { x: 70, y: 0 },
    { x: 30, y: 50 },
    { x: 70, y: 50 },
    { x: 30, y: 100, flip: true },
    { x: 70, y: 100, flip: true },
  ],
  7: [
    { x: 30, y: 0 },
    { x: 70, y: 0 },
    { x: 50, y: 33 },
    { x: 30, y: 50 },
    { x: 70, y: 50 },
    { x: 30, y: 100, flip: true },
    { x: 70, y: 100, flip: true },
  ],
  8: [
    { x: 30, y: 0 },
    { x: 70, y: 0 },
    { x: 50, y: 33 },
    { x: 30, y: 50 },
    { x: 70, y: 50 },
    { x: 50, y: 67, flip: true },
    { x: 30, y: 100, flip: true },
    { x: 70, y: 100, flip: true },
  ],
  9: [
    { x: 30, y: 0 },
    { x: 70, y: 0 },
    { x: 30, y: 33 },
    { x: 70, y: 33 },
    { x: 50, y: 50 },
    { x: 30, y: 67, flip: true },
    { x: 70, y: 67, flip: true },
    { x: 30, y: 100, flip: true },
    { x: 70, y: 100, flip: true },
  ],
  10: [
    { x: 30, y: 0 },
    { x: 70, y: 0 },
    { x: 30, y: 33 },
    { x: 70, y: 33 },
    { x: 50, y: 25 },
    { x: 50, y: 75, flip: true },
    { x: 30, y: 67, flip: true },
    { x: 70, y: 67, flip: true },
    { x: 30, y: 100, flip: true },
    { x: 70, y: 100, flip: true },
  ],
}
