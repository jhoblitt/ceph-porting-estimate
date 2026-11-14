// The cost model: report data and params in, tokens and dollars out, per
// feature, per component and in total. Pure functions; the formulas and
// their symbols are docs/cost-model.md's.

export { cephSloc, estimate, existingTestRatio, matrix } from './model/estimate';
export { describeParams, resolveParams } from './model/params';
export type {
  CephSloc,
  Cost,
  FeatureEstimate,
  GroupEstimate,
  ParamInfo,
  Params,
  Sloc,
  Target,
  Tokens,
} from './model/types';
