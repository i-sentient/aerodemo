import { EffectComposer, Bloom, Vignette, Noise, ToneMapping } from '@react-three/postprocessing'
import { BlendFunction, ToneMappingMode } from 'postprocessing'

// ---------------------------------------------------------------------------
//  POST — self-contained copy for the sentient-icu folder (so it carries no
//  ../scene dependency). Two grades share one composer:
//   • default (bright): light grade, subtle bloom/vignette/grain — used here.
//   • dark: bloom keyed on luminance>1 so only HDR emissives glow.
//  ToneMapping (ACES) runs LAST; the Canvas is flat (NoToneMapping) so it
//  isn't tone-mapped twice. Only npm deps (@react-three/postprocessing,
//  postprocessing) — both already ship with any R3F project.
// ---------------------------------------------------------------------------
export function Postprocessing({ dark = false }: { dark?: boolean }) {
  return (
    <EffectComposer enableNormalPass={false} multisampling={4}>
      <Bloom
        mipmapBlur
        intensity={dark ? 1.0 : 0.5}
        luminanceThreshold={dark ? 1.0 : 1.05}
        luminanceSmoothing={dark ? 0.15 : 0.1}
        radius={dark ? 0.75 : 0.6}
      />
      <Vignette eskil={false} offset={dark ? 0.4 : 0.45} darkness={dark ? 0.25 : 0.18} />
      <Noise premultiply blendFunction={BlendFunction.SOFT_LIGHT} opacity={dark ? 0.04 : 0.05} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  )
}
