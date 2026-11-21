// lib/listingArchiveRule.js  PURE, shared by the routes (lib/listingArchive.js) and the dashboard.
//   deleteCheck(applications)  the one check that decides whether a listing can be deleted: only
//                              when none of its applications is real. An application from a +test
//                              address (name+test@, name+test2@) is a test, never a real one; an
//                              application with no email is real. -> { deletable, real, tests, reason }
//   archiveAvailable(listings) whether archiving is set up (db/025-listing-archive.sql): the rows
//                              are read with *, so each carries archived_at once the file has run.
export const TEST_ADDRESS = /\+test[^@]*@/i;
export const isTestApplication = (application) => !!application && TEST_ADDRESS.test(String(application.email || '').trim());
export const NOT_DELETABLE_LINE = 'This listing has applications, so it can be archived but not deleted.';

export function deleteCheck(applications) {
  const list = (applications || []).filter(Boolean);
  const real = list.filter((a) => !isTestApplication(a)).length;
  return { deletable: real === 0, real, tests: list.length - real, reason: real === 0 ? null : NOT_DELETABLE_LINE };
}

export const archiveAvailable = (listings) => (listings || []).some((l) => l && Object.prototype.hasOwnProperty.call(l, 'archived_at'));
export const isArchived = (listing) => !!(listing && listing.archived_at);

// What a bulk delete says when it skipped listings with real applications; skipLine, what the
// question before it says.
export const skipLine = (n) => (n ? `${n} ${n === 1 ? 'listing has' : 'listings have'} applications and will stay. Archive ${n === 1 ? 'it' : 'them'} instead.` : null);
export const skippedLine = (n) => (n ? `${n} ${n === 1 ? 'listing has' : 'listings have'} applications, so ${n === 1 ? 'it was' : 'they were'} not deleted. Archive ${n === 1 ? 'it' : 'them'} instead.` : null);
