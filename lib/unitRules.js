// lib/unitRules.js  PURE. Smoker and pets are unit rules, not a ranking (Compare shows them once
// under a "Unit rules" line with no rank beside them, or not at all when the listing allows both).
export const petsAllowed = (v) => v === 'yes' || v === 'any';
export const smokingAllowed = (v) => v === 'yes';
// rules: { pets: listing.allows_pets, smoking: listing.allows_smoking }
export const unitRulesApply = (rules) => !!rules && !(petsAllowed(rules.pets) && smokingAllowed(rules.smoking));
export const ruleLine = (rules) => [petsAllowed(rules && rules.pets) ? null : 'no pets', smokingAllowed(rules && rules.smoking) ? null : (rules && rules.smoking === 'outdoor' ? 'smoking outdoors only' : 'no smoking')].filter(Boolean).join(' · ');
