// components/listings/NewListingPanel.js
// New listing, over whatever view the realtor is on: the one form (components/listings/
// ListingSetupModal.js) in its panel, with the view behind it left exactly as it was. The dashboard
// (components/dashboard/HomeView.js) mounts it with the list to add the new listing to; every other
// screen in the shell (components/dashboard/DashShell.js: Circle, Profile, a listing) mounts it
// through the sidebar's New listing button, so it opens in place instead of going to the dashboard.
// The requests are the ones the dashboard always made, in the same order and with the same bodies:
// the province to /api/profile/update when the form asked for it, the listing to
// /api/listings/create, then its apply link from /api/listings/invite. After the save the panel is
// that link; Open goes to the new listing.
import { useEffect, useState } from 'react';
import ListingSetupModal, { DRAFT_KEY, clearListingDraft } from './ListingSetupModal';
import { useAdapter } from '../../lib/dashboardAdapter';
import { needsProvince } from '../../lib/justInTime';
import { displayLabel } from '../../lib/listingAddress';
import { go } from '../nav/routes';

// open, initial (a listing to start from, a Duplicate), profile, userId; onClose when it closes;
// onProfile(saved, province) after the province saved (saved: the profile the route answered with,
// or null); onCreated(listing) after the listing saved;
// onError(text) with a line that says what did not save ('' when a save starts).
export default function NewListingPanel({ open, initial = null, profile, userId, onClose, onProfile = null, onCreated = null, onError = null }) {
  const adapter = useAdapter();
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState(null); // { id, url, label }: the listing just made
  const draftKey = `${DRAFT_KEY}:${userId || 'me'}`;
  const say = (text) => { if (onError) onError(text); };
  // Each opening starts on the form, never on the last apply link.
  useEffect(() => { if (open) setCreated(null); }, [open]);

  const createListing = async (input) => {
    setSaving(true);
    say('');
    // The province rides with the first listing (lib/justInTime.js): it goes to the profile
    // first, through its own route, and never into the listing row.
    const { province, ...values } = input || {};
    try {
      if (province) {
        const pr = await adapter.fetch('/api/profile/update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ province }) });
        const pj = await pr.json().catch(() => ({}));
        if (!pr.ok || pj?.error) { say(pj?.error || 'Could not save your province. Please try again.'); setSaving(false); return; }
        if (onProfile) onProfile(pj.profile || null, province);
      }
      // The route inserts with profile_id from the session and records listing_created; the
      // invite is then minted through the existing invite path.
      const r = await adapter.fetch('/api/listings/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.error || !j?.listing?.id) { say(j?.error || 'Could not create the listing. Please try again.'); setSaving(false); return; }
      const data = j.listing;
      // Its apply link, made at once: the screen after the save is that link (the listing page
      // offers it too, should this fail).
      let url = '';
      try { const ir = await adapter.fetch('/api/listings/invite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ listingId: data.id }) }); const ij = await ir.json().catch(() => ({})); url = (ir.ok && (ij.shortUrl || ij.url)) || ''; } catch (e) { /* the listing page offers the link */ }
      clearListingDraft(draftKey);
      if (onCreated) onCreated(data);
      setSaving(false);
      setCreated({ id: data.id, url, label: displayLabel(data, 'Your listing') });
    } catch (e) {
      say('Could not create the listing. Please try again.');
      setSaving(false);
    }
  };

  const close = () => { setCreated(null); onClose(); };
  return (
    <ListingSetupModal open={open} mode="create" initial={initial} askProvince={needsProvince(profile)} realtorProvince={profile?.province || null} prefill={{ listing_brokerage_name: profile?.brokerage || null, listing_brokerage_address: profile?.brokerage_address || null, listing_brokerage_phone: profile?.phone || null }} onCancel={close} onSave={createListing} saving={saving}
      draftKey={draftKey} realtor={{ name: profile?.full_name || '', brokerage: profile?.brokerage || '' }}
      done={created ? { url: created.url, label: created.label, onOpen: () => { const id = created.id; close(); go(adapter.paths.listing(id)); } } : null} />
  );
}
