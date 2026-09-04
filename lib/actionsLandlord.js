// lib/actionsLandlord.js  PURE. The one action a landlord's answer raises: "Landlord answered",
// once per listing, while any answer on the latest snapshot is newer than the realtor's last
// open of the report panel. The signature is the newest answer time, so a dismissal or an open
// holds until another answer arrives (lib/actions.js visibleActions).
export function landlordAnsweredItem(listing, applicants) {
  const answers = (applicants || []).map((a) => a && a.landlordAnswer).filter((x) => x && x.answer);
  if (!answers.length) return null;
  const meets = answers.filter((x) => x.answer === 'meet').length;
  const latest = answers.map((x) => x.at || '').sort().pop() || '';
  const reason = meets ? `${meets} want${meets === 1 ? 's' : ''} to meet` : `${answers.length} answered, none to meet`;
  return { key: `landlord_answered:${listing.id}`, kind: 'landlord_answered', listingId: listing.id, linkId: null, title: 'Landlord answered', detail: `${reason} · ${listing.name || listing.address || 'this listing'}`, verb: 'Open', panel: 'report', since: latest || null, signature: `landlord:${latest}`, name: null, listingName: listing.name || listing.address || 'this listing', reason };
}
