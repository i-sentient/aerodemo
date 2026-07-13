import { Color } from 'three'

// ---------------------------------------------------------------------------
//  HDR glow helpers. Selective bloom keys off luminance > 1: elements that
//  should bloom use these (color pushed above 1.0) + `toneMapped={false}`,
//  while the tone-mapped frosted geometry and the gradient skydome stay ≤1 and
//  do NOT bloom.
// ---------------------------------------------------------------------------
export const hdr = (hex: number, k = 1.8): Color => new Color(hex).multiplyScalar(k)
export const hdrCss = (css: string, k = 1.8): Color => new Color(css).multiplyScalar(k)
