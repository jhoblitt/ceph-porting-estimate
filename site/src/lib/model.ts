// The cost model: report data and params in, tokens and dollars out, per
// feature, per component and in total. Pure functions; the formulas and
// their symbols are docs/cost-model.md's.

export { cephSloc, estimate, existingTestRatio, matrix } from './model/estimate';
export { sumTokens } from './model/cost';
export { clamp as clampParam, describeParams, isShare, resolveParams } from './model/params';
export { CATEGORIES, type Category } from './model/types';
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
