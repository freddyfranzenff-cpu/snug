// Shared function registry.
//
// Cross-module function calls go through R.X() instead of direct imports.
// This uses a mutable shared object so we can sidestep ES module circular-import
// issues — modules attach their functions to R at load time, and all call sites
// read R.X at call time (by which point all modules have loaded).
export const R = {};
