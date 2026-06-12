"use strict";(()=>{var a={};a.id=227,a.ids=[227],a.modules={5511:a=>{a.exports=require("crypto")},5600:a=>{a.exports=require("next/dist/compiled/next-server/pages-api.runtime.prod.js")},6778:(a,b,c)=>{c.a(a,async(a,d)=>{try{c.r(b),c.d(b,{config:()=>o,default:()=>n,handler:()=>m});var e=c(9046),f=c(8667),g=c(3480),h=c(6435),i=c(7864),j=c(8112),k=c(8766),l=a([i]);i=(l.then?(await l)():l)[0];let n=(0,h.M)(i,"default"),o=(0,h.M)(i,"config"),p=new g.PagesAPIRouteModule({definition:{kind:f.A.PAGES_API,page:"/api/landlord/send-link",pathname:"/api/landlord/send-link",bundlePath:"",filename:""},userland:i,distDir:".next",relativeProjectDir:""});async function m(a,b,c){let d=await p.prepare(a,b,{srcPage:"/api/landlord/send-link"});if(!d){b.statusCode=400,b.end("Bad Request"),null==c.waitUntil||c.waitUntil.call(c,Promise.resolve());return}let{query:f,params:g,prerenderManifest:h,routerServerContext:i}=d;try{let c=a.method||"GET",d=(0,j.getTracer)(),e=d.getActiveScopeSpan(),l=p.instrumentationOnRequestError.bind(p),m=async e=>p.render(a,b,{query:{...f,...g},params:g,allowedRevalidateHeaderKeys:[],multiZoneDraftMode:!1,trustHostHeader:!1,previewProps:h.preview,propagateError:!1,dev:p.isDev,page:"/api/landlord/send-link",internalRevalidate:null==i?void 0:i.revalidate,onError:(...b)=>l(a,...b)}).finally(()=>{if(!e)return;e.setAttributes({"http.status_code":b.statusCode,"next.rsc":!1});let f=d.getRootSpanAttributes();if(!f)return;if(f.get("next.span_type")!==k.BaseServerSpan.handleRequest)return void console.warn(`Unexpected root span type '${f.get("next.span_type")}'. Please report this Next.js issue https://github.com/vercel/next.js`);let g=f.get("next.route");if(g){let a=`${c} ${g}`;e.setAttributes({"next.route":g,"http.route":g,"next.span_name":a}),e.updateName(a)}else e.updateName(`${c} ${a.url}`)});e?await m(e):await d.withPropagatedContext(a.headers,()=>d.trace(k.BaseServerSpan.handleRequest,{spanName:`${c} ${a.url}`,kind:j.SpanKind.SERVER,attributes:{"http.method":c,"http.target":a.url}},m))}catch(a){if(p.isDev)throw a;(0,e.sendError)(b,500,"Internal Server Error")}finally{null==c.waitUntil||c.waitUntil.call(c,Promise.resolve())}}d()}catch(a){d(a)}})},7864:(a,b,c)=>{c.a(a,async(a,d)=>{try{c.r(b),c.d(b,{default:()=>i});var e=c(8754),f=c(5511),g=c.n(f),h=a([e]);let j=new(e=(h.then?(await h)():h)[0]).Resend(process.env.RESEND_API_KEY),k=new Map;async function i(a,b){if("POST"!==a.method)return b.status(405).json({error:"Method not allowed"});let{email:c}=a.body;if(!c||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c))return b.status(400).json({error:"Valid email required"});let d=c.trim().toLowerCase(),e=Date.now(),f=(k.get(d)||[]).filter(a=>e-a<6e5);if(f.length>=3)return b.status(429).json({error:"Too many sign-in attempts. Please wait a few minutes."});if(f.push(e),k.set(d,f),!process.env.KV_REST_API_URL||!process.env.KV_REST_API_TOKEN)return b.status(503).json({error:"Sign-in temporarily unavailable."});let h=g().randomBytes(24).toString("hex");try{await fetch(`${process.env.KV_REST_API_URL}/set/llink:${h}`,{method:"POST",headers:{Authorization:`Bearer ${process.env.KV_REST_API_TOKEN}`,"Content-Type":"application/json"},body:JSON.stringify({email:d,createdAt:new Date().toISOString()})}),await fetch(`${process.env.KV_REST_API_URL}/expire/llink:${h}/900`,{method:"POST",headers:{Authorization:`Bearer ${process.env.KV_REST_API_TOKEN}`}})}catch(a){return console.error("Magic link store error:",a),b.status(500).json({error:"Could not create sign-in link."})}let i=`https://rentletter.ca/landlord?signin=${h}`;try{var l;process.env.RESEND_API_KEY&&await j.emails.send({from:"Rentletter <hello@rentletter.ca>",to:d,subject:"Sign in to your Rentletter landlord dashboard",html:(l=i,`<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#faf8f3;font-family:-apple-system,'Inter',sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#faf8f3;padding:48px 16px;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="520" style="max-width:520px;">
        <tr><td style="padding-bottom:32px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="width:3px;height:20px;background:#d72027;"></td>
              <td style="padding-left:7px;font-family:'Inter',sans-serif;font-size:17px;font-weight:800;color:#0f0f10;letter-spacing:-0.02em;">Rentletter</td>
            </tr>
          </table>
        </td></tr>
        <tr><td style="padding-bottom:18px;">
          <p style="font-family:'Inter',sans-serif;font-size:11px;color:#d72027;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;margin:0 0 10px;">Sign in</p>
          <h1 style="font-family:'Inter',sans-serif;font-size:32px;font-weight:800;color:#0f0f10;letter-spacing:-0.03em;line-height:1.1;margin:0;">Sign in to your<br>landlord dashboard.</h1>
        </td></tr>
        <tr><td style="padding-bottom:28px;">
          <p style="font-family:'Inter',sans-serif;font-size:14px;line-height:1.6;color:#3a3a3c;margin:0;">Click the button below to sign in. Your applications, decisions, and notes will sync across devices.</p>
        </td></tr>
        <tr><td style="padding-bottom:32px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
            <tr><td style="background:#d72027;">
              <a href="${l}" style="display:inline-block;padding:16px 28px;color:#faf8f3;font-family:'Inter',sans-serif;font-size:14px;font-weight:700;text-decoration:none;letter-spacing:0.02em;">Sign in →</a>
            </td></tr>
          </table>
        </td></tr>
        <tr><td>
          <p style="font-family:'Inter',sans-serif;font-size:12px;line-height:1.55;color:#86868b;margin:0;">This link expires in 15 minutes. If you didn't request it, you can safely ignore this email.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`)})}catch(a){return console.error("Magic link email failed:",a),b.status(500).json({error:"Could not send sign-in email."})}return b.status(200).json({ok:!0})}d()}catch(a){d(a)}})},8754:a=>{a.exports=import("resend")}};var b=require("../../../webpack-api-runtime.js");b.C(a);var c=b.X(0,[169],()=>b(b.s=6778));module.exports=c})();