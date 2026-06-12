"use strict";(()=>{var a={};a.id=215,a.ids=[215],a.modules={829:(a,b,c)=>{c.d(b,{$p:()=>g,$s:()=>h,cT:()=>f,tb:()=>i});let d=(process.env.KV_REST_API_URL||"").replace(/\/+$/,""),e={Authorization:`Bearer ${process.env.KV_REST_API_TOKEN}`},f={SIGNUPS:"stat:total_signups",APPLICATIONS_GENERATED:"stat:total_letters_generated",WORKSPACE_SAVES:"stat:total_workspace_saves",SHARES_CREATED:"stat:total_shares_created",SHARES_VIEWED:"stat:total_shares_viewed",LANDLORD_ACTIONS:"stat:total_landlord_actions",EMAILS_SENT:"stat:total_emails_sent"};async function g(a){if(d&&process.env.KV_REST_API_TOKEN)try{await fetch(`${d}/incr/${a}`,{method:"POST",headers:e})}catch(a){}}async function h(a,b){if(d&&process.env.KV_REST_API_TOKEN)try{let c=JSON.stringify({ts:new Date().toISOString(),...b});await fetch(`${d}/lpush/events:${a}/${encodeURIComponent(c)}`,{method:"POST",headers:e}),await fetch(`${d}/ltrim/events:${a}/0/199`,{method:"POST",headers:e})}catch(a){}}async function i(a){if(d&&process.env.KV_REST_API_TOKEN&&a)try{let b=String(a).toLowerCase().trim(),c=await fetch(`${d}/sadd/set:known_users/${encodeURIComponent(b)}`,{method:"POST",headers:e}),i=await c.json();i?.result===1&&(await g(f.SIGNUPS),await h("signups",{email:b}))}catch(a){}}},3946:(a,b,c)=>{c.a(a,async(a,d)=>{try{c.r(b),c.d(b,{config:()=>o,default:()=>n,handler:()=>m});var e=c(9046),f=c(8667),g=c(3480),h=c(6435),i=c(4782),j=c(8112),k=c(8766),l=a([i]);i=(l.then?(await l)():l)[0];let n=(0,h.M)(i,"default"),o=(0,h.M)(i,"config"),p=new g.PagesAPIRouteModule({definition:{kind:f.A.PAGES_API,page:"/api/landlord/send-to-landlord",pathname:"/api/landlord/send-to-landlord",bundlePath:"",filename:""},userland:i,distDir:".next",relativeProjectDir:""});async function m(a,b,c){let d=await p.prepare(a,b,{srcPage:"/api/landlord/send-to-landlord"});if(!d){b.statusCode=400,b.end("Bad Request"),null==c.waitUntil||c.waitUntil.call(c,Promise.resolve());return}let{query:f,params:g,prerenderManifest:h,routerServerContext:i}=d;try{let c=a.method||"GET",d=(0,j.getTracer)(),e=d.getActiveScopeSpan(),l=p.instrumentationOnRequestError.bind(p),m=async e=>p.render(a,b,{query:{...f,...g},params:g,allowedRevalidateHeaderKeys:[],multiZoneDraftMode:!1,trustHostHeader:!1,previewProps:h.preview,propagateError:!1,dev:p.isDev,page:"/api/landlord/send-to-landlord",internalRevalidate:null==i?void 0:i.revalidate,onError:(...b)=>l(a,...b)}).finally(()=>{if(!e)return;e.setAttributes({"http.status_code":b.statusCode,"next.rsc":!1});let f=d.getRootSpanAttributes();if(!f)return;if(f.get("next.span_type")!==k.BaseServerSpan.handleRequest)return void console.warn(`Unexpected root span type '${f.get("next.span_type")}'. Please report this Next.js issue https://github.com/vercel/next.js`);let g=f.get("next.route");if(g){let a=`${c} ${g}`;e.setAttributes({"next.route":g,"http.route":g,"next.span_name":a}),e.updateName(a)}else e.updateName(`${c} ${a.url}`)});e?await m(e):await d.withPropagatedContext(a.headers,()=>d.trace(k.BaseServerSpan.handleRequest,{spanName:`${c} ${a.url}`,kind:j.SpanKind.SERVER,attributes:{"http.method":c,"http.target":a.url}},m))}catch(a){if(p.isDev)throw a;(0,e.sendError)(b,500,"Internal Server Error")}finally{null==c.waitUntil||c.waitUntil.call(c,Promise.resolve())}}d()}catch(a){d(a)}})},4782:(a,b,c)=>{c.a(a,async(a,d)=>{try{c.r(b),c.d(b,{default:()=>j});var e=c(8754),f=c(829),g=a([e]);let k=new(e=(g.then?(await g)():g)[0]).Resend(process.env.RESEND_API_KEY);async function h(a){if(!a)return null;let b=String(a).trim();if(!/^[a-f0-9]{48}$/.test(b)||!process.env.KV_REST_API_URL||!process.env.KV_REST_API_TOKEN)return null;try{let a=await fetch(`${process.env.KV_REST_API_URL}/get/lsession:${b}`,{headers:{Authorization:`Bearer ${process.env.KV_REST_API_TOKEN}`}}),c=await a.json();if(!c?.result)return null;return"string"==typeof c.result?JSON.parse(c.result):c.result}catch(a){return null}}function i(a){return String(a||"").replace(/[&<>"']/g,a=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[a])}async function j(a,b){if("POST"!==a.method)return b.status(405).json({error:"Method not allowed"});let c=a.headers["x-rl-session"],d=await h(c);if(!d?.email)return b.status(401).json({error:"Not signed in."});let{applications:e,decisions:g,unit:j,realtorProfile:l,landlordEmail:m,note:n,shareUrl:o,isUpdate:p}=a.body||{};if(!Array.isArray(e)||0===e.length)return b.status(400).json({error:"No applications to send."});let q=String(m||"").trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(q))return b.status(400).json({error:"Invalid landlord email."});if(!l?.isRealtor||!l?.fullName)return b.status(400).json({error:"Set up your realtor profile first."});if(!process.env.RESEND_API_KEY)return b.status(503).json({error:"Email service not configured."});let r=String(l.fullName||"").slice(0,120),s=String(l.brokerage||"").slice(0,200),t=String(l.phone||"").slice(0,40),u=d.email,v=String(n||"").slice(0,1e3),w=e.filter(a=>g?.[a.applicationNumber]?.status==="shortlist");if(0===w.length)return b.status(400).json({error:"Shortlist some applicants first before sending."});let x=j&&(j.address||j.monthlyRent)?`${i(j.address||"Your unit")}${j.monthlyRent?` \xb7 $${i(j.monthlyRent)}/mo`:""}${j.bedrooms?` \xb7 ${i(j.bedrooms)} bed`:""}`:null,y=p?`Updated shortlist from ${r} — ${w.length} candidate${1===w.length?"":"s"}${j?.address?` for ${String(j.address).slice(0,60)}`:""}`:`Shortlist from ${r} — ${w.length} candidate${1===w.length?"":"s"}${j?.address?` for ${String(j.address).slice(0,60)}`:""}`,z=w.map(a=>{let b=a.scorecard?.overall||0,c=g[a.applicationNumber]||{},d=c.notes?`<div style="font-size:12px;color:#3a3a3c;margin-top:6px;line-height:1.5;"><em>Note from ${i(r)}: ${i(c.notes.slice(0,250))}${c.notes.length>250?"…":""}</em></div>`:"";return`
      <tr><td style="padding:14px 0;border-bottom:1px solid #e3ddd0;">
        <div style="font-size:16px;font-weight:700;color:#0f0f10;margin-bottom:4px;">${i(a.tenant?.fullName||"Applicant")}</div>
        <div style="font-size:13px;color:#3a3a3c;line-height:1.55;">
          ${i(a.employment?.jobTitle||"")}${a.employment?.employer?` at ${i(a.employment.employer)}`:""}<br>
          ${a.employment?.annualIncome?`$${Number(a.employment.annualIncome).toLocaleString()}/yr \xb7 `:""}Score ${b}/5 \xb7 ${i(a.applicationNumber||"")}
        </div>
        ${d}
      </td></tr>`}).join(""),A=`<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#faf8f3;font-family:-apple-system,'Inter',sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#faf8f3;padding:48px 16px;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="580" style="max-width:580px;">

        <!-- Realtor branding header -->
        <tr><td style="padding-bottom:24px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#0f0f10;">
            <tr><td style="padding:22px 26px;">
              <p style="font-family:'Inter',sans-serif;font-size:10px;color:#c8c2b3;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;margin:0 0 6px;">From your realtor</p>
              <p style="font-family:'Inter',sans-serif;font-size:20px;font-weight:800;color:#faf8f3;margin:0 0 4px;letter-spacing:-0.02em;">${i(r)}</p>
              ${s?`<p style="font-family:'Inter',sans-serif;font-size:13px;color:#c8c2b3;margin:0 0 2px;">${i(s)}</p>`:""}
              ${t?`<p style="font-family:'Inter',sans-serif;font-size:13px;color:#c8c2b3;margin:0;">${i(t)} \xb7 <a href="mailto:${i(u)}" style="color:#c8c2b3;text-decoration:none;">${i(u)}</a></p>`:`<p style="font-family:'Inter',sans-serif;font-size:13px;color:#c8c2b3;margin:0;"><a href="mailto:${i(u)}" style="color:#c8c2b3;text-decoration:none;">${i(u)}</a></p>`}
            </td></tr>
          </table>
        </td></tr>

        <!-- Headline -->
        <tr><td style="padding-bottom:8px;">
          <p style="font-family:'Inter',sans-serif;font-size:11px;color:#d72027;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;margin:0 0 10px;">Your shortlist</p>
          <h1 style="font-family:'Inter',sans-serif;font-size:30px;font-weight:800;color:#0f0f10;letter-spacing:-0.03em;line-height:1.15;margin:0 0 12px;">
            ${w.length} candidate${1===w.length?"":"s"} I'd recommend.
          </h1>
          ${x?`<p style="font-family:'Inter',sans-serif;font-size:13px;color:#3a3a3c;margin:0 0 16px;line-height:1.55;">For: <strong>${x}</strong></p>`:""}
          <p style="font-family:'Inter',sans-serif;font-size:13px;color:#3a3a3c;margin:0;line-height:1.6;">
            Reviewed by ${i(r)} \xb7 sent ${new Date().toLocaleDateString("en-CA",{dateStyle:"medium"})}
          </p>
        </td></tr>

        <!-- Optional personal note from realtor -->
        ${v?`
        <tr><td style="padding-top:24px;">
          <div style="background:#f2eee3;padding:20px;border-left:3px solid #d72027;">
            <p style="font-family:'Inter',sans-serif;font-size:10px;color:#86868b;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin:0 0 8px;">Note from ${i(r)}</p>
            <p style="font-family:'Inter',sans-serif;font-size:14px;color:#0f0f10;line-height:1.6;margin:0;white-space:pre-wrap;">${i(v)}</p>
          </div>
        </td></tr>
        `:""}

        <!-- Share URL CTA — interactive landlord view -->
        ${o?`
        <tr><td style="padding-top:24px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#0f0f10;">
            <tr><td style="padding:22px 24px;">
              <p style="font-family:'Inter',sans-serif;font-size:10px;color:#f0b8bb;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;margin:0 0 8px;">
                ${p?"Updated shortlist":"View, compare, and discuss"}
              </p>
              <h2 style="font-family:'Inter',sans-serif;font-size:20px;font-weight:800;color:#faf8f3;letter-spacing:-0.02em;margin:0 0 8px;line-height:1.2;">
                ${p?"Your realtor updated this shortlist.":"See your shortlist online."}
              </h2>
              <p style="font-family:'Inter',sans-serif;font-size:13px;color:#c8c2b3;line-height:1.6;margin:0 0 18px;">
                Open the live page below to see full candidate details, compare them side-by-side, add notes for your realtor, or remove anyone you've ruled out. No sign-up required — just your private link.
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr><td style="background:#d72027;">
                  <a href="${o}" style="display:inline-block;padding:14px 26px;color:#faf8f3;font-family:'Inter',sans-serif;font-size:14px;font-weight:700;text-decoration:none;letter-spacing:0.01em;">
                    Open my shortlist →
                  </a>
                </td></tr>
              </table>
              <p style="font-family:'Inter',sans-serif;font-size:11px;color:#86868b;line-height:1.55;margin:14px 0 0;">
                Link valid for 14 days. Anything you do there is visible to your realtor.
              </p>
            </td></tr>
          </table>
        </td></tr>
        `:""}

        <!-- Candidate list -->
        <tr><td style="padding-top:24px;">
          <p style="font-family:'Inter',sans-serif;font-size:10px;color:#86868b;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin:0 0 12px;">Candidates included</p>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
            ${z}
          </table>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding-top:32px;padding-bottom:8px;">
          <p style="font-family:'Inter',sans-serif;font-size:13px;color:#3a3a3c;line-height:1.6;margin:0 0 14px;">
            Reply to this email to discuss the candidates or schedule next steps. Each candidate has a verified Rentletter application number — let me know which you'd like to move forward with.
          </p>
        </td></tr>

        <tr><td style="padding-top:24px;border-top:1px solid #e3ddd0;">
          <p style="font-family:'Inter',sans-serif;font-size:11px;color:#86868b;line-height:1.6;margin:0;">
            This shortlist was prepared by ${i(r)} using Rentletter, an independent screening platform for Canadian rentals. Tenant data is self-reported by applicants. Verify references independently before signing a lease.
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body></html>`;try{let a=await k.emails.send({from:"Rentletter <hello@rentletter.ca>",to:q,reply_to:u,subject:y,html:A});if(a?.error)return console.error("[send-to-landlord] Resend error:",a.error),b.status(500).json({error:"Email send failed. Try again."});try{await k.emails.send({from:"Rentletter <hello@rentletter.ca>",to:u,subject:`[Copy] ${y}`,html:`<p style="font-family:Inter,sans-serif;color:#86868b;font-size:13px;padding:16px;background:#f2eee3;">Copy of the email you just sent to ${i(q)}.</p>${A}`})}catch(a){}return(0,f.$p)(f.cT.EMAILS_SENT),(0,f.$s)("emails",{realtorEmail:u,landlordEmail:q,candidates:w.length}),b.status(200).json({ok:!0})}catch(a){return console.error("[send-to-landlord] exception:",a?.message||a),b.status(500).json({error:"Email send failed. Try again."})}}d()}catch(a){d(a)}})},5600:a=>{a.exports=require("next/dist/compiled/next-server/pages-api.runtime.prod.js")},8754:a=>{a.exports=import("resend")}};var b=require("../../../webpack-api-runtime.js");b.C(a);var c=b.X(0,[169],()=>b(b.s=3946));module.exports=c})();