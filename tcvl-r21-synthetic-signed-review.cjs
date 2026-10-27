"use strict";
// R21 deliberately deny-only stub: no real owner trust / dispatcher.
function createIsolatedSignedReviewPort(){
 return {reserveSignedReview(){
  return {status:"BLOCKED_UNIMPLEMENTED",execution_allowed:false,verified_owner_approval:false};
 }};
}
module.exports={createIsolatedSignedReviewPort};
