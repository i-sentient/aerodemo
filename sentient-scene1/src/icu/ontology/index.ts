// ============================================================================
//  ONTOLOGY — public barrel.
//  Everything the rest of the app should import from `@/ontology` (or
//  `../ontology`). Components depend on this module, never on the mock episode
//  or a live feed directly — that seam is what makes the data source swappable.
// ============================================================================
export * from './types'
export * from './ecg'
export * from './provenance'
export * from './palette'
export * from './relations'
export * from './locationRegistry'
export * from './selectors'
export {
  useOntologyStore,
  getEntity,
  getEntitiesByKind,
} from './store'
export type { OntologyStore, OntologyData, SceneClock } from './store'
