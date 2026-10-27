"use strict";
/*
 * R12: isolated trust-source and atomic-consumption contract experiment.
 * Deliberately NON-AUTHORIZING until real protected trust root, storage, and
 * independently verified G2 are configured. No keys, network, workers, DB.
 */
function createIsolatedReviewPort(){
  return {kind:"ISOLATED_SIMULATOR",snapshot(){return null;},reserve(){return {ok:false}}};
}
function reserveForIndependentReview(){
 return {status:"BLOCKED_UNCONFIGURED",verified_owner_approval:false,
         execution_allowed:false,requires_independent_g2:true};
}
module.exports={createIsolatedReviewPort,reserveForIndependentReview};
