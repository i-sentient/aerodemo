import { EffectComposer, Bloom, Vignette, Noise, ToneMapping } from '@react-three/postprocessing'
import { BlendFunction, ToneMappingMode } from 'postprocessing'

// ---------------------------------------------------------------------------
//  POST — two grades sharing one composer:
//   • default (bright): light ER-floorplan grade, subtle bloom/vignette/grain.
//   • dark: the Sony-Ericsson hall grade — bloom keyed on luminance>1 so only
//     the HDR greens / orb / reticle glow while the white shell stays crisp;
//     a cinematic vignette.
//  ToneMapping (ACES) runs LAST; the Canvas is set flat (NoToneMapping) so it
//  isn't tone-mapped twice.
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
