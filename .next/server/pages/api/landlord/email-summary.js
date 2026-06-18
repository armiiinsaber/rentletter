"use strict";(()=>{var a={};a.id=1911,a.ids=[1911],a.modules={1476:(a,b,c)=>{c.a(a,async(a,d)=>{try{c.r(b),c.d(b,{default:()=>i});var e=c(8754),f=a([e]);let j=new(e=(f.then?(await f)():f)[0]).Resend(process.env.RESEND_API_KEY);async function g(a){if(!a)return null;let b=String(a).trim();if(!/^[a-f0-9]{48}$/.test(b)||!process.env.KV_REST_API_URL||!process.env.KV_REST_API_TOKEN)return null;try{let a=await fetch(`${process.env.KV_REST_API_URL}/get/lsession:${b}`,{headers:{Authorization:`Bearer ${process.env.KV_REST_API_TOKEN}`}}),c=await a.json();if(!c?.result)return null;return"string"==typeof c.result?JSON.parse(c.result):c.result}catch(a){return null}}function h(a){return String(a||"").replace(/[&<>"']/g,a=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[a])}async function i(a,b){if("POST"!==a.method)return b.status(405).json({error:"Method not allowed"});let c=a.headers["x-rl-session"]||a.body?.sessionToken,d=await g(c);if(!d?.email)return b.status(401).json({error:"Not signed in."});let{applications:e,decisions:f,unit:i,realtorProfile:k}=a.body||{};if(!Array.isArray(e)||0===e.length)return b.status(400).json({error:"No applications to summarize."});if(!process.env.RESEND_API_KEY)return b.status(503).json({error:"Email service not configured."});let l=!!(k&&k.isRealtor&&k.fullName),m=l?String(k.fullName||"").slice(0,120):"",n=l?String(k.brokerage||"").slice(0,200):"",o=l?String(k.phone||"").slice(0,40):"",p=e.filter(a=>f?.[a.applicationNumber]?.status==="shortlist"),q=e.filter(a=>f?.[a.applicationNumber]?.status==="reject"),r=e.filter(a=>!f?.[a.applicationNumber]?.status||"none"===f[a.applicationNumber].status),s=l?`[${m}] `:"",t=`${s}Rentletter shortlist — ${p.length} favourite${1===p.length?"":"s"} of ${e.length}`,u=i&&(i.address||i.monthlyRent)?`${h(i.address||"Unit")}${i.monthlyRent?` \xb7 $${h(i.monthlyRent)}/mo`:""}${i.bedrooms?` \xb7 ${h(i.bedrooms)} bed`:""}`:null,v=p.map(a=>{let b=a.scorecard?.overall||0,c=f[a.applicationNumber]||{},d=c.notes?`<div style="font-size:12px;color:#3a3a3c;margin-top:6px;line-height:1.5;"><em>${h(c.notes.slice(0,200))}${c.notes.length>200?"…":""}</em></div>`:"";return`
      <tr><td style="padding:14px 0;border-bottom:1px solid #e3ddd0;">
        <div style="font-size:16px;font-weight:700;color:#0f0f10;margin-bottom:4px;">${h(a.tenant?.fullName)}</div>
        <div style="font-size:13px;color:#3a3a3c;line-height:1.55;">
          ${h(a.employment?.jobTitle||"")} at ${h(a.employment?.employer||"")}<br>
          $${(a.employment?.annualIncome||0).toLocaleString()}/yr \xb7 Score ${b}/5 \xb7 ${h(a.applicationNumber)}
        </div>
        ${d}
      </td></tr>`}).join(""),w=`<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#faf8f3;font-family:-apple-system,'Inter',sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#faf8f3;padding:48px 16px;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="max-width:560px;">
        <tr><td style="padding-bottom:24px;border-bottom:1px solid #e3ddd0;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
            <tr>
              <td style="width:3px;height:20px;background:#d72027;"></td>
              <td style="padding-left:7px;font-family:'Inter',sans-serif;font-size:17px;font-weight:800;color:#0f0f10;letter-spacing:-0.02em;">Rentletter</td>
            </tr>
          </table>
          ${l?`
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:18px;">
            <tr><td style="background:#0f0f10;padding:14px 16px;">
              <p style="font-family:'Inter',sans-serif;font-size:10px;color:#c8c2b3;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;margin:0 0 4px;">Prepared by</p>
              <p style="font-family:'Inter',sans-serif;font-size:15px;font-weight:700;color:#faf8f3;margin:0 0 2px;">${h(m)}</p>
              ${n?`<p style="font-family:'Inter',sans-serif;font-size:12px;color:#c8c2b3;margin:0;">${h(n)}</p>`:""}
              ${o?`<p style="font-family:'Inter',sans-serif;font-size:12px;color:#c8c2b3;margin:2px 0 0;">${h(o)}</p>`:""}
            </td></tr>
          </table>
          `:""}
        </td></tr>
        <tr><td style="padding-top:32px;padding-bottom:8px;">
          <p style="font-family:'Inter',sans-serif;font-size:11px;color:#d72027;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;margin:0 0 10px;">${l?"Shortlist summary":"Your shortlist"}</p>
          <h1 style="font-family:'Inter',sans-serif;font-size:30px;font-weight:800;color:#0f0f10;letter-spacing:-0.03em;line-height:1.15;margin:0 0 12px;">
            ${p.length} favourite${1===p.length?"":"s"} of ${e.length}.
          </h1>
          ${u?`<p style="font-family:'Inter',sans-serif;font-size:13px;color:#3a3a3c;margin:0 0 16px;line-height:1.55;">For: <strong>${u}</strong></p>`:""}
          <p style="font-family:'Inter',sans-serif;font-size:13px;color:#3a3a3c;margin:0;line-height:1.6;">
            ${q.length} rejected \xb7 ${r.length} still to review \xb7 sent ${new Date().toLocaleString("en-CA",{dateStyle:"medium",timeStyle:"short"})}
          </p>
        </td></tr>
        ${p.length>0?`
        <tr><td style="padding-top:24px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
            ${v}
          </table>
        </td></tr>
        `:`
        <tr><td style="padding-top:24px;padding-bottom:16px;">
          <p style="font-family:'Inter',sans-serif;font-size:14px;color:#86868b;font-style:italic;margin:0;">You haven't shortlisted anyone yet.</p>
        </td></tr>
        `}
        <tr><td style="padding-top:32px;padding-bottom:32px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
            <tr><td style="background:#d72027;">
              <a href="https://rentletter.ca/landlord" style="display:inline-block;padding:14px 24px;color:#faf8f3;font-family:'Inter',sans-serif;font-size:14px;font-weight:700;text-decoration:none;letter-spacing:0.02em;">Open my dashboard →</a>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding-top:24px;border-top:1px solid #e3ddd0;">
          <p style="font-family:'Inter',sans-serif;font-size:11px;color:#86868b;line-height:1.6;margin:0;">
            Forward this email to a co-owner, business partner, or leasing agent. Sign in at rentletter.ca/landlord with this same email to see the full details and notes.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;try{let a=await j.emails.send({from:"Rentletter <hello@rentletter.ca>",to:d.email,subject:t,html:w});if(a?.error)return console.error("[email-summary] Resend returned error:",a.error),b.status(500).json({error:"Could not send the email. Please try again."});return b.status(200).json({ok:!0})}catch(a){return console.error("[email-summary] Resend exception:",a?.message||a),b.status(500).json({error:"Could not send the email. Please try again."})}}d()}catch(a){d(a)}})},5600:a=>{a.exports=require("next/dist/compiled/next-server/pages-api.runtime.prod.js")},7938:(a,b,c)=>{c.a(a,async(a,d)=>{try{c.r(b),c.d(b,{config:()=>o,default:()=>n,handler:()=>m});var e=c(9046),f=c(8667),g=c(3480),h=c(6435),i=c(1476),j=c(8112),k=c(8766),l=a([i]);i=(l.then?(await l)():l)[0];let n=(0,h.M)(i,"default"),o=(0,h.M)(i,"config"),p=new g.PagesAPIRouteModule({definition:{kind:f.A.PAGES_API,page:"/api/landlord/email-summary",pathname:"/api/landlord/email-summary",bundlePath:"",filename:""},userland:i,distDir:".next",relativeProjectDir:""});async function m(a,b,c){let d=await p.prepare(a,b,{srcPage:"/api/landlord/email-summary"});if(!d){b.statusCode=400,b.end("Bad Request"),null==c.waitUntil||c.waitUntil.call(c,Promise.resolve());return}let{query:f,params:g,prerenderManifest:h,routerServerContext:i}=d;try{let c=a.method||"GET",d=(0,j.getTracer)(),e=d.getActiveScopeSpan(),l=p.instrumentationOnRequestError.bind(p),m=async e=>p.render(a,b,{query:{...f,...g},params:g,allowedRevalidateHeaderKeys:[],multiZoneDraftMode:!1,trustHostHeader:!1,previewProps:h.preview,propagateError:!1,dev:p.isDev,page:"/api/landlord/email-summary",internalRevalidate:null==i?void 0:i.revalidate,onError:(...b)=>l(a,...b)}).finally(()=>{if(!e)return;e.setAttributes({"http.status_code":b.statusCode,"next.rsc":!1});let f=d.getRootSpanAttributes();if(!f)return;if(f.get("next.span_type")!==k.BaseServerSpan.handleRequest)return void console.warn(`Unexpected root span type '${f.get("next.span_type")}'. Please report this Next.js issue https://github.com/vercel/next.js`);let g=f.get("next.route");if(g){let a=`${c} ${g}`;e.setAttributes({"next.route":g,"http.route":g,"next.span_name":a}),e.updateName(a)}else e.updateName(`${c} ${a.url}`)});e?await m(e):await d.withPropagatedContext(a.headers,()=>d.trace(k.BaseServerSpan.handleRequest,{spanName:`${c} ${a.url}`,kind:j.SpanKind.SERVER,attributes:{"http.method":c,"http.target":a.url}},m))}catch(a){if(p.isDev)throw a;(0,e.sendError)(b,500,"Internal Server Error")}finally{null==c.waitUntil||c.waitUntil.call(c,Promise.resolve())}}d()}catch(a){d(a)}})},8754:a=>{a.exports=import("resend")}};var b=require("../../../webpack-api-runtime.js");b.C(a);var c=b.X(0,[7169],()=>b(b.s=7938));module.exports=c})();