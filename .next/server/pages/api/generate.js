"use strict";(()=>{var a={};a.id=78,a.ids=[78],a.modules={829:(a,b,c)=>{c.d(b,{$p:()=>g,$s:()=>h,cT:()=>f,tb:()=>i});let d=(process.env.KV_REST_API_URL||"").replace(/\/+$/,""),e={Authorization:`Bearer ${process.env.KV_REST_API_TOKEN}`},f={SIGNUPS:"stat:total_signups",APPLICATIONS_GENERATED:"stat:total_letters_generated",WORKSPACE_SAVES:"stat:total_workspace_saves",SHARES_CREATED:"stat:total_shares_created",SHARES_VIEWED:"stat:total_shares_viewed",LANDLORD_ACTIONS:"stat:total_landlord_actions",EMAILS_SENT:"stat:total_emails_sent"};async function g(a){if(d&&process.env.KV_REST_API_TOKEN)try{await fetch(`${d}/incr/${a}`,{method:"POST",headers:e})}catch(a){}}async function h(a,b){if(d&&process.env.KV_REST_API_TOKEN)try{let c=JSON.stringify({ts:new Date().toISOString(),...b});await fetch(`${d}/lpush/events:${a}/${encodeURIComponent(c)}`,{method:"POST",headers:e}),await fetch(`${d}/ltrim/events:${a}/0/199`,{method:"POST",headers:e})}catch(a){}}async function i(a){if(d&&process.env.KV_REST_API_TOKEN&&a)try{let b=String(a).toLowerCase().trim(),c=await fetch(`${d}/sadd/set:known_users/${encodeURIComponent(b)}`,{method:"POST",headers:e}),i=await c.json();i?.result===1&&(await g(f.SIGNUPS),await h("signups",{email:b}))}catch(a){}}},832:a=>{a.exports=import("@anthropic-ai/sdk")},3362:(a,b,c)=>{c.a(a,async(a,d)=>{try{c.r(b),c.d(b,{config:()=>o,default:()=>n,handler:()=>m});var e=c(9046),f=c(8667),g=c(3480),h=c(6435),i=c(7105),j=c(8112),k=c(8766),l=a([i]);i=(l.then?(await l)():l)[0];let n=(0,h.M)(i,"default"),o=(0,h.M)(i,"config"),p=new g.PagesAPIRouteModule({definition:{kind:f.A.PAGES_API,page:"/api/generate",pathname:"/api/generate",bundlePath:"",filename:""},userland:i,distDir:".next",relativeProjectDir:""});async function m(a,b,c){let d=await p.prepare(a,b,{srcPage:"/api/generate"});if(!d){b.statusCode=400,b.end("Bad Request"),null==c.waitUntil||c.waitUntil.call(c,Promise.resolve());return}let{query:f,params:g,prerenderManifest:h,routerServerContext:i}=d;try{let c=a.method||"GET",d=(0,j.getTracer)(),e=d.getActiveScopeSpan(),l=p.instrumentationOnRequestError.bind(p),m=async e=>p.render(a,b,{query:{...f,...g},params:g,allowedRevalidateHeaderKeys:[],multiZoneDraftMode:!1,trustHostHeader:!1,previewProps:h.preview,propagateError:!1,dev:p.isDev,page:"/api/generate",internalRevalidate:null==i?void 0:i.revalidate,onError:(...b)=>l(a,...b)}).finally(()=>{if(!e)return;e.setAttributes({"http.status_code":b.statusCode,"next.rsc":!1});let f=d.getRootSpanAttributes();if(!f)return;if(f.get("next.span_type")!==k.BaseServerSpan.handleRequest)return void console.warn(`Unexpected root span type '${f.get("next.span_type")}'. Please report this Next.js issue https://github.com/vercel/next.js`);let g=f.get("next.route");if(g){let a=`${c} ${g}`;e.setAttributes({"next.route":g,"http.route":g,"next.span_name":a}),e.updateName(a)}else e.updateName(`${c} ${a.url}`)});e?await m(e):await d.withPropagatedContext(a.headers,()=>d.trace(k.BaseServerSpan.handleRequest,{spanName:`${c} ${a.url}`,kind:j.SpanKind.SERVER,attributes:{"http.method":c,"http.target":a.url}},m))}catch(a){if(p.isDev)throw a;(0,e.sendError)(b,500,"Internal Server Error")}finally{null==c.waitUntil||c.waitUntil.call(c,Promise.resolve())}}d()}catch(a){d(a)}})},5600:a=>{a.exports=require("next/dist/compiled/next-server/pages-api.runtime.prod.js")},7105:(a,b,c)=>{c.a(a,async(a,d)=>{try{c.r(b),c.d(b,{default:()=>n});var e=c(832),f=c(829),g=a([e]);let o=new(e=(g.then?(await g)():g)[0]).default({apiKey:process.env.ANTHROPIC_API_KEY});async function h(a,b){if(!process.env.KV_REST_API_URL||!process.env.KV_REST_API_TOKEN)return console.warn("Vercel KV not configured — application not stored"),!1;try{let c=`${process.env.KV_REST_API_URL}/set/app:${a}`,d=await fetch(c,{method:"POST",headers:{Authorization:`Bearer ${process.env.KV_REST_API_TOKEN}`,"Content-Type":"application/json"},body:JSON.stringify(b)});if(!d.ok)return console.error("KV store failed:",await d.text()),!1;return await fetch(`${process.env.KV_REST_API_URL}/expire/app:${a}/31536000`,{method:"POST",headers:{Authorization:`Bearer ${process.env.KV_REST_API_TOKEN}`}}),!0}catch(a){return console.error("KV store error:",a),!1}}async function i(a,b){if(!process.env.KV_REST_API_URL||!process.env.KV_REST_API_TOKEN)return!1;try{let c=await fetch(`${process.env.KV_REST_API_URL}/get/app:${a}`,{headers:{Authorization:`Bearer ${process.env.KV_REST_API_TOKEN}`}}),d=await c.json();if(!d?.result)return console.error("updateApplicationLetter: application not found:",a),!1;let e="string"==typeof d.result?JSON.parse(d.result):d.result;return e.coverLetter=b,e.letterPurchasedAt=new Date().toISOString(),await fetch(`${process.env.KV_REST_API_URL}/set/app:${a}`,{method:"POST",headers:{Authorization:`Bearer ${process.env.KV_REST_API_TOKEN}`,"Content-Type":"application/json"},body:JSON.stringify(e)}),!0}catch(a){return console.error("updateApplicationLetter error:",a),!1}}async function j(a){if(!a)return{ok:!1,reason:"No session ID provided"};if(!process.env.STRIPE_SECRET_KEY)return console.warn("STRIPE_SECRET_KEY not set"),{ok:!1,reason:"Stripe not configured"};try{let b=await fetch(`https://api.stripe.com/v1/checkout/sessions/${a}`,{headers:{Authorization:`Bearer ${process.env.STRIPE_SECRET_KEY}`}}),c=await b.json();if(c.error)return{ok:!1,reason:c.error.message};if("paid"!==c.payment_status)return{ok:!1,reason:"Payment not completed"};return{ok:!0,session:c}}catch(a){return{ok:!1,reason:"Stripe verification failed"}}}async function k(a){if(!a)return{ok:!1,reason:"No pass token provided"};if(!process.env.KV_REST_API_URL||!process.env.KV_REST_API_TOKEN)return{ok:!1,reason:"Pass system not configured"};let b=String(a).trim().toUpperCase();if(!/^[A-Z0-9]{16}$/.test(b))return{ok:!1,reason:"Invalid pass token format"};try{let a,c=await fetch(`${process.env.KV_REST_API_URL}/get/pass:${b}`,{headers:{Authorization:`Bearer ${process.env.KV_REST_API_TOKEN}`}});if(!c.ok)return{ok:!1,reason:"Pass lookup failed"};let d=await c.json();if(!d||!d.result)return{ok:!1,reason:"Pass not found or expired"};try{a="string"==typeof d.result?JSON.parse(d.result):d.result}catch(a){return{ok:!1,reason:"Pass data corrupted"}}if(new Date(a.expiresAt).getTime()<Date.now())return{ok:!1,reason:"Pass has expired"};return{ok:!0,pass:a}}catch(a){return console.error("Pass verification error:",a),{ok:!1,reason:"Pass verification error"}}}async function l(a){if(!process.env.KV_REST_API_URL||!process.env.KV_REST_API_TOKEN)return;let b=String(a).trim().toUpperCase();try{let a=await fetch(`${process.env.KV_REST_API_URL}/get/pass:${b}`,{headers:{Authorization:`Bearer ${process.env.KV_REST_API_TOKEN}`}});if(!a.ok)return;let c=await a.json();if(!c?.result)return;let d="string"==typeof c.result?JSON.parse(c.result):c.result;d.lettersGenerated=(d.lettersGenerated||0)+1,d.lastUsedAt=new Date().toISOString(),await fetch(`${process.env.KV_REST_API_URL}/set/pass:${b}`,{method:"POST",headers:{Authorization:`Bearer ${process.env.KV_REST_API_TOKEN}`,"Content-Type":"application/json"},body:JSON.stringify(d)});let e=Math.floor((new Date(d.expiresAt).getTime()-Date.now())/1e3);e>0&&await fetch(`${process.env.KV_REST_API_URL}/expire/pass:${b}/${e}`,{method:"POST",headers:{Authorization:`Bearer ${process.env.KV_REST_API_TOKEN}`}})}catch(a){console.error("Increment pass usage failed:",a)}}function m(a){let{fullName:b,age:c,dateOfBirth:d,phone:e,email:f,jobTitle:g,employer:h,yearsAtJob:i,annualIncome:j,monthlyIncome:k,previousAddress:l,yearsAtPrevious:m,previousLandlordName:n,previousLandlordContact:o,currentRent:p,moveDate:q,reasonForMoving:r,apartmentAddress:s,apartmentDescription:t,numberOfOccupants:u,occupantsDetails:v,smoker:w,hasCoApplicant:x,coApplicantName:y,coApplicantRelationship:z,coApplicantJobTitle:A,coApplicantEmployer:B,coApplicantIncome:C,personality:D,pets:E,hasVehicle:F,vehicleMakeModel:G,vehicleYear:H,references:I,estimatedRent:J,rentToIncomeRatio:K,redFlags:L}=a,M=a=>a?`$${Number(a).toLocaleString()}`:"—",N=a=>{if(!a)return null;let b=parseFloat(a);return isNaN(b)?a:b<1?`${Math.round(12*b)} months`:1===b?"1 year":`${b} years`},O=[];return O.push("TENANT APPLICATION SUMMARY"),O.push(""),O.push(`Applicant: ${b}`),c&&O.push(`Age: ${c}`),e&&O.push(`Phone: ${e}`),f&&O.push(`Email: ${f}`),O.push(""),O.push(`— EMPLOYMENT —`),O.push(`${g} at ${h||"employer"}`),i&&O.push(`Tenure: ${N(i)}`),O.push(`Annual income: ${M(j)}`),k&&O.push(`Monthly income: ${M(k)}`),J&&K&&O.push(`Rent-to-income ratio: ${K}% (rent $${J.toLocaleString()} / monthly income $${k.toLocaleString()})`),O.push(""),(l||n)&&(O.push(`— RENTAL HISTORY —`),l&&O.push(`Previous address: ${l}`),m&&O.push(`Duration: ${N(m)}`),n&&O.push(`Previous landlord: ${n}${o?` (${o})`:""}`),p&&O.push(`Current rent: $${Number(p).toLocaleString()}/mo`),O.push("")),O.push(`— UNIT OF INTEREST —`),s&&O.push(`Address: ${s}`),t&&O.push(`Details: ${t}`),q&&O.push(`Desired move-in: ${q}`),r&&O.push(`Reason for moving: ${r}`),O.push(""),O.push(`— HOUSEHOLD —`),O.push(`Occupants: ${u||"1"}`),v&&O.push(`Details: ${v}`),O.push(`Smoker: ${"yes"===w?"Yes":"No"}`),E&&"none"!==E.toLowerCase()&&"no"!==E.toLowerCase()&&O.push(`Pets: ${E}`),F&&G&&O.push(`Vehicle: ${G}${H?` (${H})`:""}`),O.push(""),x&&y&&(O.push(`— CO-APPLICANT —`),O.push(`Name: ${y}`),z&&O.push(`Relationship: ${z}`),A&&O.push(`Role: ${A}${B?` at ${B}`:""}`),C&&O.push(`Annual income: ${M(C)}`),O.push("")),Array.isArray(I)&&I.length>0&&(O.push(`— REFERENCES —`),I.forEach((a,b)=>{O.push(`${b+1}. ${a.name}${a.relationship?` (${a.relationship})`:""}${a.contact?` — ${a.contact}`:""}`)}),O.push("")),D&&(O.push(`— ABOUT THE APPLICANT —`),O.push(D),O.push("")),L&&(O.push(`— DISCLOSURES —`),O.push(L),O.push("")),O.join("\n").trim()}async function n(a,b){if("POST"!==a.method)return b.status(405).json({error:"Method not allowed"});let{stripeSessionId:c,passToken:d,mode:e,applicationNumber:g,...n}=a.body,p="letter"===e?"letter":"application",{email:q,apartmentAddress:r,apartmentDescription:s,fullName:t,age:u,dateOfBirth:v,phone:w,jobTitle:x,employer:y,yearsAtJob:z,annualIncome:A,previousAddress:B,yearsAtPrevious:C,previousLandlordName:D,previousLandlordContact:E,currentRent:F,moveInDate:G,reasonForMoving:H,numberOfOccupants:I,occupantsDetails:J,smoker:K,hasCoApplicant:L,coApplicantName:M,coApplicantAge:N,coApplicantEmployer:O,coApplicantJobTitle:P,coApplicantIncome:Q,coApplicantRelationship:R,personality:S,pets:T,redFlags:U,hasVehicle:V,vehicleMakeModel:W,vehicleYear:X,reference1Name:Y,reference1Relationship:Z,reference1Contact:$,reference2Name:_,reference2Relationship:aa,reference2Contact:ab}=n;if(!t||!x||!A)return b.status(400).json({error:"Missing required fields"});if("letter"===p)if("DEMO_MODE_BYPASS"===c);else if(d){let a=await k(d);if(!a.ok)return b.status(402).json({error:`Pass invalid. ${a.reason}`});l(d).catch(a=>console.error("Pass increment failed:",a))}else{if(!c)return b.status(402).json({error:"Payment required to generate cover letter. Submit your application first (free), then add a cover letter."});let a=await j(c);if(!a.ok)return b.status(402).json({error:`Payment required for cover letter. ${a.reason}`})}let ac=G?new Date(G).toLocaleDateString("en-CA",{month:"long",day:"numeric",year:"numeric"}):"as soon as possible",ad=parseInt(A)||0,ae=Math.round(ad/12),af=`$${ae.toLocaleString()}/month`,ag=null,ah=null;if(s){let a=s.match(/\$\s*([\d,]+)/);a&&(ag=parseInt(a[1].replace(/,/g,"")))&&ae&&(ah=Math.round(ag/ae*100))}let ai=`
TENANT PROFILE:
- Name: ${t}${u?`, age ${u}`:""}${v?` (DOB: ${v})`:""}
${w?`- Phone: ${w}`:""}
- Job: ${x} at ${y}${z?` (${z} years)`:""}
- Annual income: $${ad.toLocaleString()} CAD
- Monthly income (pre-tax): ${af}
${ag?`- Estimated rent: $${ag.toLocaleString()}/month`:""}
${ah?`- Rent-to-income ratio: ${ah}% (${ah<=30?"within 30% guideline":ah<=35?"slightly above 30% guideline but manageable":"above standard guideline"})`:""}

CURRENT RENTAL:
${B?`- Current address: ${B}${C?` (${C} years there)`:""}`:"- No previous rental in Canada / first-time renter"}
${F?`- Current rent: $${parseInt(F).toLocaleString()}/month`:""}
${D?`- Current/previous landlord: ${D}${E?` (${E})`:""}`:""}

HOUSEHOLD:
- Total occupants: ${I||"1"}
${J?`- Occupant details: ${J}`:""}
- Smoker status: ${"no"===K?"Non-smoker":"outdoor"===K?"Smokes outdoors only":"Smoker"}
${L?`
CO-APPLICANT:
- Name: ${M}${N?`, age ${N}`:""}
- Relationship to primary applicant: ${R}
- Job: ${P||"Not specified"} at ${O||"Not specified"}
${Q?`- Annual income: $${parseInt(Q).toLocaleString()} CAD`:""}
- COMBINED HOUSEHOLD ANNUAL INCOME: $${(ad+(parseInt(Q)||0)).toLocaleString()} CAD
`:""}

THE APARTMENT:
${r?`- Address: ${r}`:"- Address: not specified"}
${s?`- Description: ${s}`:""}

THEIR MOVE:
- Desired move-in: ${ac}
- Reason for moving: ${H}

PERSONAL:
${S?`- Personality/lifestyle: ${S}`:""}
${T?`- Pets: ${T}`:""}
${U?`- Things to address: ${U}`:""}

${V?`VEHICLE:
- ${W||"Not specified"}${X?` (${X})`:""}
`:""}

${Y||_?`REFERENCES PROVIDED BY NAME:
${Y?`- ${Y}${Z?` (${Z})`:""}${$?`, contact: ${$}`:""}`:""}
${_?`- ${_}${aa?` (${aa})`:""}${ab?`, contact: ${ab}`:""}`:""}
NOTE: Reference these by name in the Tenant Resume's References section. This is more persuasive than 'references available on request.'
`:""}
`,aj=`You are the senior rental application strategist at Rentletter, a Toronto-based service that has helped thousands of renters win competitive apartments. You combine professional copywriting with deep understanding of how landlords, property managers, and realtors actually evaluate applications.

═══════════════════════════════════════════════════
THE RENTLETTER METHOD — OUR PROPRIETARY FORMAT
═══════════════════════════════════════════════════

Every Rentletter output contains FIVE signature elements that no other service produces. These are our trademark format. Together, they make the landlord's decision easier and the realtor's job lighter — which is why both end up recommending Rentletter to tenants.

OUR CORE PRINCIPLE: We don't sell the tenant. We REMOVE FRICTION from the landlord's decision. Every element exists to answer a question the landlord would otherwise have to ask, calculate, or chase down.

The output is TWO documents: a Cover Letter and a Tenant Resume.

═══════════════════════════════════════════════════
DOCUMENT 1: THE COVER LETTER
═══════════════════════════════════════════════════

The Cover Letter has FOUR parts in this exact order:

──────────────────────────────────────────
PART A — THE QUICK READ (signature element #1)
──────────────────────────────────────────

Right at the top of the letter, before any body text, present a scannable summary. Format it EXACTLY like this:

  THE QUICK READ
  ──────────────
  Tenant      [Full name], [age if available]
  Income      $[monthly amount]/month ([X] years at [Employer])
  History     [Years] at previous address, reference available [or: First-time renter — strong alternative documentation]
  Move-in     [Formatted date] (flexibility noted if applicable)
  Fit         [Rent-to-income ratio]% of monthly income[, if calculable: " (within standard 30% guideline)"]

If rent isn't known, omit the "Fit" line. Use thin ruled lines (──────) to separate visually.

──────────────────────────────────────────
PART B — THE BODY
──────────────────────────────────────────

After The Quick Read, leave a blank line, then write the cover letter proper.

CRITICAL TONE RULES:
- 200-260 words, three short paragraphs
- Warm, professional, confident — NEVER desperate, NEVER salesy, NEVER over-formal, NEVER like a sales pitch
- The voice should feel like a competent professional writing to a peer — not a tenant begging for a favour
- Lead with what the tenant brings (stability, fit), framed as RELEVANT facts, not as self-promotion
- Be SPECIFIC — weave their actual details in as evidence, not as claims
- Address weak points (bad credit, gap, frequent moves) honestly and briefly, with context
- Use Canadian English spelling (favour, neighbour, organize)

CRITICAL PROHIBITIONS:
- NEVER use clich\xe9s: "I am writing to express interest," "I would be a perfect fit," "Please consider my application," "I am the ideal tenant," "I hope you will consider"
- NEVER use AI-sounding constructions: excessive em dashes, "I am thrilled to," "I am excited about the opportunity," tricolon sentences
- NEVER mention AI, automation, or how this letter was generated
- NEVER use sales-marketing language: "leveraging," "passionate about," "thriving environment"
- NEVER make claims you can't verify ("I'm extremely responsible") — replace with facts the landlord can verify ("3-year tenure at Shopify, current landlord reference available")

OPENING LINE: Open with a SPECIFIC observation about THIS apartment or neighbourhood — not "Dear Landlord." For example: "I came across your listing at 123 King Street — a one-bedroom in a low-rise building on a quiet residential block — and it's a strong match for what I've been looking for."

──────────────────────────────────────────
PART C — "WHY THIS UNIT" CLOSER (signature element #2)
──────────────────────────────────────────

The final paragraph of the body (2-3 sentences max) must EXPLICITLY connect the tenant's specific situation to THIS specific apartment. Reference something concrete:
- The neighbourhood + their job/lifestyle ("the 15-minute walk to my office at Shopify")
- The unit type + how they live ("the corner-unit setup with two exposures works well for my work-from-home routine")
- A specific feature + a tenant trait ("the quieter side-street location matches my preference for a calm space to recover after long shifts")

This must feel like the tenant did genuine homework on this specific place, not a template.

──────────────────────────────────────────
PART D — THE VERIFICATION PACK + SIGN-OFF (signature element #3)
──────────────────────────────────────────

Immediately after the "Why This Unit" paragraph, include this exact structure:

"Sincerely,
[Full name]

Ready on request: [list documents based on what the tenant has — pay stubs, employment letter, credit report, government ID, previous landlord reference, character references]. Can deliver within 2 hours of your request."

THE VERIFICATION PACK MATTERS BECAUSE: it pre-empts the landlord's next question ("what documents do you have?") and signals high responsiveness without sounding eager. The "within 2 hours" line is the trust signal — it tells the landlord this is a tenant who will not waste their time with delayed email chains.

Always include this section. Adjust the document list based on what the tenant actually has (e.g., for first-time renters, omit "previous landlord reference" and add "employer reference" + "character references").

═══════════════════════════════════════════════════
DOCUMENT 2: THE TENANT RESUME
═══════════════════════════════════════════════════

A scannable one-page summary. Use ALL-CAPS section headers, no markdown, clean structured plain text.

Sections in this exact order:

[FULL NAME]
[Single line: "Contact details provided on request" or include email if appropriate]

──────────────────────────────────────────
EMPLOYMENT
──────────────────────────────────────────
- Position: [Job title at Employer]
- Tenure: [X years]
- Annual income: $[X] CAD
- Monthly income (pre-tax): $[X] CAD

──────────────────────────────────────────
RENTAL HISTORY
──────────────────────────────────────────
- Previous address: [address] ([years there])
- Previous landlord: [name] — [contact info]
- (For first-time renters: "First-time renter — alternative references and 3\xd7 monthly income documentation available")

──────────────────────────────────────────
REFERENCES AVAILABLE
──────────────────────────────────────────
If the tenant has provided REFERENCES BY NAME in the input data, list each one with their name and relationship (do not include contact info in the document — landlord can request it). Format:
- Sarah Johnson — Current manager at [employer]
- David Chen — Personal reference, friend of 5 years
If no named references are provided, list role-based references that are available on request:
- Previous landlord [if applicable]
- Employer (HR or direct manager)
- Personal/character references (2 available on request)

Named references are always more persuasive than "on request." Always list them by name when provided.

──────────────────────────────────────────
HOUSEHOLD (include if multi-occupant or co-applicant)
──────────────────────────────────────────
If the household has more than 1 occupant or a co-applicant, include this section:
- Total occupants: [number]
- [Brief description if provided]
If there is a CO-APPLICANT in the input data, include their information clearly. Frame the application as joint:
- Co-applicant: [Name], [Relationship to primary]
- Their employment: [Job title at Employer]
- Their income: $[X]/year
- COMBINED household income: $[X]/year
This matters because most rentals consider total household income for affordability calculations. Highlight the combined figure.

──────────────────────────────────────────
LIFESTYLE
──────────────────────────────────────────
Brief, factual bullets — 3-5 max. Always include smoker status. Examples:
- Non-smoker (or "Outdoor smoking only" or "Smoker" — match the input)
- Quiet weekday routine; works from home [X] days/week
- No parties, no overnight commercial activity
- Pets: [if any — frame with reassurance: "one well-trained 4-year-old cat, indoor only, full vet records available"]

──────────────────────────────────────────
VEHICLE (only if provided)
──────────────────────────────────────────
If vehicle information is provided, include a single line:
- Vehicle: [Make/model] ([Year]) — relevant if parking is included with the unit

──────────────────────────────────────────
DISCLOSURES [only include if there are real items to address]
──────────────────────────────────────────
Address each weakness in one short honest line, framed constructively:
- "Credit score reflects recent immigration to Canada; full employment verification and 3\xd7 income available."
- "One previous gap in rental history (3 months, between provinces); reference from prior landlord available to discuss."

──────────────────────────────────────────
TIEBREAKERS (signature element #4)
──────────────────────────────────────────

Immediately after the Disclosures section (or after Lifestyle if there are no disclosures), include this exact section:

  ────────────────────────────────────
  TIEBREAKERS
  ────────────────────────────────────
  ↗ [Tiebreaker 1]
  ↗ [Tiebreaker 2]
  ↗ [Tiebreaker 3 if relevant]
  ────────────────────────────────────

The Tiebreakers section identifies 2-3 specific FACTS about this tenant that make them the easy choice when a landlord is comparing applicants. These are NOT sales claims. They are concrete, verifiable, low-friction realities.

GOOD tiebreakers (frame as facts that REDUCE landlord risk or workload):
- "Flexible move-in date — can accommodate landlord's preferred timeline within 2 weeks"
- "Works from home 4 days/week — minimal building wear, quiet daytime presence"
- "Prefers 2+ year leases — low turnover risk for the landlord"
- "Has been pre-approved by a guarantor with verified income — added security if needed"
- "Has tenant insurance already arranged — proof of coverage available at lease signing"
- "Available for a 5-minute phone conversation any evening this week"
- "Has visited the building twice — knows the area, no buyer's remorse risk"
- "Single applicant, no roommates — single point of communication, one decision-maker"
- "Already approved by guarantor" / "Employer letter is already drafted and ready"
- "Has $X in savings (3\xd7 annual rent) — additional reassurance available"

BAD tiebreakers (avoid — these sound salesy or like claims):
- "I'm very responsible"
- "I would be an ideal tenant"
- "I take great care of properties"
- "Easy to work with"

The phrasing must be functional, factual, and benefits-oriented from the landlord's perspective. Use the ↗ character before each tiebreaker.

Choose tiebreakers based on what the tenant's profile actually offers. Maximum 3. Each must be specific and true based on the input data.

──────────────────────────────────────────
DECISION TIME (signature element #5)
──────────────────────────────────────────

The final section of the tenant resume. Include this exact structure:

  ────────────────────────────────────
  DECISION TIME
  ────────────────────────────────────
  Ready to sign by: [calculate a reasonable lease-sign date — typically 3-5 days before move-in]
  
  If you have any concerns, a 5-minute phone call can resolve them. 
  Available: [based on what makes sense for the tenant profile — e.g., "weekday evenings 6-8pm, weekends anytime" or "weekdays 12-1pm and after 5pm"]
  ────────────────────────────────────

This section signals decisiveness and lowers the cost of any objection — instead of an email chain, it offers a 5-minute call. Most landlords appreciate the clarity. This is what makes Rentletter applications close 3x faster than generic ones.

═══════════════════════════════════════════════════
OUTPUT FORMAT — STRICT
═══════════════════════════════════════════════════

Output your response in this EXACT format with NO other text before, after, or between sections:

===COVER LETTER===
[The Quick Read header → blank line → body → "Why This Unit" closer → "Sincerely, [Name]" → Verification Pack line]

===TENANT RESUME===
[Full name → contact → Employment → Rental History → References → Lifestyle → Disclosures (if applicable) → Tiebreakers → Decision Time]

═══════════════════════════════════════════════════
WHY THIS FORMAT WORKS
═══════════════════════════════════════════════════

A landlord screening 50 applications wants three things:
1. To say yes quickly and confidently to ONE good applicant
2. To not waste time chasing documentation or playing email tennis
3. To have a defensible answer when their property manager asks "why this tenant?"

A realtor wants three things:
1. An application they can forward without rewriting
2. A tenant who makes them look good to the landlord
3. A fast close so they earn their commission without 10 follow-ups

The Rentletter Method serves both. The Quick Read makes the first 10 seconds productive. The Tiebreakers give the landlord language to justify the choice. The Verification Pack eliminates document chase. Decision Time closes the loop. Every element exists to REMOVE FRICTION — not to sell.

NEVER reference Rentletter, AI, or the format itself in the output. The output should read like a uniquely thorough, professional tenant who happens to think the way a great applicant thinks.`,ak=`Generate a cover letter and tenant resume for this rental application in Toronto:

${ai}

Remember: ONE page each. Specific to this person. Warm but professional. No AI-sounding clich\xe9s.`;try{let a="",c="",d=g||null;if("letter"===p){let b=(await o.messages.create({model:"claude-sonnet-4-5",max_tokens:2500,system:aj,messages:[{role:"user",content:ak}]})).content[0].text,d=b.match(/===COVER LETTER===\s*([\s\S]*?)(?====TENANT RESUME===|$)/);a=d?d[1].trim():b,c=m({fullName:t,age:u,dateOfBirth:v,phone:w,email:q,jobTitle:x,employer:y,yearsAtJob:z,annualIncome:A,monthlyIncome:ae,previousAddress:B,yearsAtPrevious:C,previousLandlordName:D,previousLandlordContact:E,currentRent:F,moveDate:ac,reasonForMoving:H,apartmentAddress:r,apartmentDescription:s,numberOfOccupants:I,occupantsDetails:J,smoker:K,hasCoApplicant:L,coApplicantName:M,coApplicantRelationship:R,coApplicantJobTitle:P,coApplicantEmployer:O,coApplicantIncome:Q,personality:S,pets:T,hasVehicle:V,vehicleMakeModel:W,vehicleYear:X,references:[...Y?[{name:Y,relationship:Z,contact:$}]:[],..._?[{name:_,relationship:aa,contact:ab}]:[]],estimatedRent:ag,rentToIncomeRatio:ah,redFlags:U})}else c=m({fullName:t,age:u,dateOfBirth:v,phone:w,email:q,jobTitle:x,employer:y,yearsAtJob:z,annualIncome:A,monthlyIncome:ae,previousAddress:B,yearsAtPrevious:C,previousLandlordName:D,previousLandlordContact:E,currentRent:F,moveDate:ac,reasonForMoving:H,apartmentAddress:r,apartmentDescription:s,numberOfOccupants:I,occupantsDetails:J,smoker:K,hasCoApplicant:L,coApplicantName:M,coApplicantRelationship:R,coApplicantJobTitle:P,coApplicantEmployer:O,coApplicantIncome:Q,personality:S,pets:T,hasVehicle:V,vehicleMakeModel:W,vehicleYear:X,references:[...Y?[{name:Y,relationship:Z,contact:$}]:[],..._?[{name:_,relationship:aa,contact:ab}]:[]],estimatedRent:ag,rentToIncomeRatio:ah,redFlags:U});d||(d=function(){let a=new Date().getFullYear(),b=()=>Math.floor(16*Math.random()).toString(16).toUpperCase(),c=()=>Array.from({length:4},b).join("");return`RL-${a}-${c()}-${c()}`}());let e=function(a){let{yearsAtJob:b,annualIncome:c,monthlyIncome:d,estimatedRent:e,rentToIncomeRatio:f,previousAddress:g,yearsAtPrevious:h,previousLandlordName:i,reasonForMoving:j,redFlags:k}=a,l=3,m=parseFloat(b)||0;l=m>=3?5:m>=1?4:m>=.5?3:2;let n=m>=3?`${Math.floor(m)}+ years at same employer`:m>0?`${m} year(s) at current employer`:"New position",o=3,p="Rent not specified";null!=f&&(o=f<=30?5:f<=35?4:f<=40?3:2,p=`${f}% of monthly income`);let q=3,r=parseFloat(h)||0;q=r>=2&&i?5:r>=1&&i?4:3;let s=r>0&&i?`${r} years with reference available`:g?`${r||"Some"} years prior, limited references`:"First-time renter — alternative documentation",t=4,u=(j||"").toLowerCase(),v=["new job","job","school","university","partner","family","closer to work","commute","permanent","long-term","settle"];t=v.some(a=>u.includes(a))?5:["temporary","short-term","few months","travel"].some(a=>u.includes(a))?3:4;let w=v.find(a=>u.includes(a))?`Clear long-term reason: ${v.find(a=>u.includes(a))}`:"General life-stage move",x=5,y="No items to address";if(k&&k.trim().length>0){let a=k.toLowerCase();a.includes("bankruptcy")||a.includes("eviction")?(x=3,y="Significant items addressed honestly"):a.includes("credit")||a.includes("gap")?(x=4,y="Minor items addressed with context"):(x=4,y="Items proactively disclosed")}return{incomeStability:{score:l,note:n},rentAffordability:{score:o,note:p},rentalHistory:{score:q,note:s},longTermIntent:{score:t,note:w},disclosures:{score:x,note:y},overall:Math.round((l+o+q+t+x)/5*10)/10}}({yearsAtJob:z,annualIncome:A,monthlyIncome:ae,estimatedRent:ag,rentToIncomeRatio:ah,previousAddress:B,yearsAtPrevious:C,previousLandlordName:D,reasonForMoving:H,redFlags:U}),j={applicationNumber:d,createdAt:new Date().toISOString(),email:q||null,tenant:{fullName:t,age:u||null,dateOfBirth:v||null,phone:w||null},employment:{jobTitle:x,employer:y,yearsAtJob:z||null,annualIncome:ad,monthlyIncome:ae},rental:{previousAddress:B||null,yearsAtPrevious:C||null,previousLandlordName:D||null,previousLandlordContact:E||null,currentRent:F?parseInt(F):null},apartment:{address:r||null,description:s||null,estimatedRent:ag,rentToIncomeRatio:ah},move:{moveInDate:ac,reasonForMoving:H},household:{numberOfOccupants:I||"1",occupantsDetails:J||null,smoker:K||"no"},coApplicant:L?{name:M||null,age:N||null,relationship:R||null,jobTitle:P||null,employer:O||null,annualIncome:Q?parseInt(Q):null}:null,lifestyle:{personality:S||null,pets:T||null},vehicle:V?{makeModel:W||null,year:X||null}:null,references:[...Y?[{name:Y,relationship:Z||null,contact:$||null}]:[],..._?[{name:_,relationship:aa||null,contact:ab||null}]:[]],disclosures:U||null,scorecard:e,ownerToken:function(){let a="ABCDEFGHJKMNPQRSTUVWXYZ23456789",b="";for(let c=0;c<32;c++)b+=a[Math.floor(Math.random()*a.length)];return b}(),revoked:!1,coverLetter:a||null};return"letter"===p&&g?i(g,a).catch(a=>console.error("Background letter update failed:",a)):h(d,j).catch(a=>console.error("Background store failed:",a)),(0,f.$p)(f.cT.APPLICATIONS_GENERATED),(0,f.$s)("letters",{applicationNumber:d,mode:p}),b.status(200).json({letter:a,resume:c,applicationNumber:d,ownerToken:j.ownerToken,mode:p})}catch(a){return console.error("Generation error:",a),b.status(500).json({error:"Failed to generate letter. Please try again."})}}d()}catch(a){d(a)}})}};var b=require("../../webpack-api-runtime.js");b.C(a);var c=b.X(0,[169],()=>b(b.s=3362));module.exports=c})();