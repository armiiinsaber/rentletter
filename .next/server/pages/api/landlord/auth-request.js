"use strict";(()=>{var a={};a.id=2334,a.ids=[2334],a.modules={5600:a=>{a.exports=require("next/dist/compiled/next-server/pages-api.runtime.prod.js")},5900:(a,b,c)=>{c.a(a,async(a,d)=>{try{c.r(b),c.d(b,{config:()=>o,default:()=>n,handler:()=>m});var e=c(9046),f=c(8667),g=c(3480),h=c(6435),i=c(8551),j=c(8112),k=c(8766),l=a([i]);i=(l.then?(await l)():l)[0];let n=(0,h.M)(i,"default"),o=(0,h.M)(i,"config"),p=new g.PagesAPIRouteModule({definition:{kind:f.A.PAGES_API,page:"/api/landlord/auth-request",pathname:"/api/landlord/auth-request",bundlePath:"",filename:""},userland:i,distDir:".next",relativeProjectDir:""});async function m(a,b,c){let d=await p.prepare(a,b,{srcPage:"/api/landlord/auth-request"});if(!d){b.statusCode=400,b.end("Bad Request"),null==c.waitUntil||c.waitUntil.call(c,Promise.resolve());return}let{query:f,params:g,prerenderManifest:h,routerServerContext:i}=d;try{let c=a.method||"GET",d=(0,j.getTracer)(),e=d.getActiveScopeSpan(),l=p.instrumentationOnRequestError.bind(p),m=async e=>p.render(a,b,{query:{...f,...g},params:g,allowedRevalidateHeaderKeys:[],multiZoneDraftMode:!1,trustHostHeader:!1,previewProps:h.preview,propagateError:!1,dev:p.isDev,page:"/api/landlord/auth-request",internalRevalidate:null==i?void 0:i.revalidate,onError:(...b)=>l(a,...b)}).finally(()=>{if(!e)return;e.setAttributes({"http.status_code":b.statusCode,"next.rsc":!1});let f=d.getRootSpanAttributes();if(!f)return;if(f.get("next.span_type")!==k.BaseServerSpan.handleRequest)return void console.warn(`Unexpected root span type '${f.get("next.span_type")}'. Please report this Next.js issue https://github.com/vercel/next.js`);let g=f.get("next.route");if(g){let a=`${c} ${g}`;e.setAttributes({"next.route":g,"http.route":g,"next.span_name":a}),e.updateName(a)}else e.updateName(`${c} ${a.url}`)});e?await m(e):await d.withPropagatedContext(a.headers,()=>d.trace(k.BaseServerSpan.handleRequest,{spanName:`${c} ${a.url}`,kind:j.SpanKind.SERVER,attributes:{"http.method":c,"http.target":a.url}},m))}catch(a){if(p.isDev)throw a;(0,e.sendError)(b,500,"Internal Server Error")}finally{null==c.waitUntil||c.waitUntil.call(c,Promise.resolve())}}d()}catch(a){d(a)}})},6373:a=>{a.exports=import("resend")},8551:(a,b,c)=>{c.a(a,async(a,d)=>{try{c.r(b),c.d(b,{default:()=>g});var e=c(6373),f=a([e]);let h=new(e=(f.then?(await f)():f)[0]).Resend(process.env.RESEND_API_KEY);async function g(a,b){if("POST"!==a.method)return b.status(405).json({error:"Method not allowed"});let{email:c}=a.body;if(!c||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c))return b.status(400).json({error:"Valid email required"});if(!process.env.KV_REST_API_URL||!process.env.KV_REST_API_TOKEN)return b.status(503).json({error:"Authentication temporarily unavailable."});let d=c.trim().toLowerCase(),e=function(){let a="ABCDEFGHJKMNPQRSTUVWXYZ23456789abcdefghjkmnpqrstuvwxyz",b="";for(let c=0;c<32;c++)b+=a[Math.floor(Math.random()*a.length)];return b}();try{await fetch(`${process.env.KV_REST_API_URL}/set/magic:${e}`,{method:"POST",headers:{Authorization:`Bearer ${process.env.KV_REST_API_TOKEN}`,"Content-Type":"application/json"},body:JSON.stringify({email:d,createdAt:new Date().toISOString()})}),await fetch(`${process.env.KV_REST_API_URL}/expire/magic:${e}/900`,{method:"POST",headers:{Authorization:`Bearer ${process.env.KV_REST_API_TOKEN}`}})}catch(a){return console.error("KV magic token store failed:",a),b.status(500).json({error:"Could not generate sign-in link. Please try again."})}let f=`https://rentletter.ca/landlord?magic=${e}`;try{var g;process.env.RESEND_API_KEY?await h.emails.send({from:"Rentletter <hello@rentletter.ca>",to:d,subject:"Sign in to your Rentletter landlord dashboard",html:(g=f,`<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#faf8f3;font-family:-apple-system,'Inter',sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#faf8f3;padding:48px 16px;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="540" style="max-width:540px;">
        <tr><td style="padding-bottom:32px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="width:3px;height:20px;background:#d72027;"></td>
              <td style="padding-left:7px;font-family:'Inter',sans-serif;font-size:17px;font-weight:800;color:#0f0f10;letter-spacing:-0.02em;">Rentletter</td>
            </tr>
          </table>
        </td></tr>
        <tr><td style="padding-bottom:24px;">
          <p style="font-family:'Inter',sans-serif;font-size:11px;color:#d72027;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;margin:0 0 12px;">Sign in to your dashboard</p>
          <h1 style="font-family:'Inter',sans-serif;font-size:38px;font-weight:800;color:#0f0f10;letter-spacing:-0.03em;line-height:1.05;margin:0;">Click to sign in.</h1>
        </td></tr>
        <tr><td style="padding-bottom:32px;">
          <p style="font-family:'Inter',sans-serif;font-size:16px;line-height:1.6;color:#3a3a3c;margin:0 0 24px;">
            Use the link below to sign in to your Rentletter landlord dashboard. Your applications, shortlists, and notes will be available across devices.
          </p>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
            <tr><td style="background:#d72027;">
              <a href="${g}" style="display:inline-block;padding:18px 32px;color:#faf8f3;font-family:'Inter',sans-serif;font-size:14px;font-weight:700;text-decoration:none;letter-spacing:0.02em;">Sign in to dashboard &rarr;</a>
            </td></tr>
          </table>
          <p style="font-family:'Inter',sans-serif;font-size:12px;color:#86868b;margin:18px 0 0;">
            This link expires in 15 minutes. If you didn't request this, you can safely ignore this email.
          </p>
        </td></tr>
        <tr><td style="padding-top:24px;border-top:1px solid #e3ddd0;">
          <p style="font-family:'Inter',sans-serif;font-size:12px;color:#86868b;line-height:1.55;margin:0;">
            Rentletter &middot; Toronto &middot; rentletter.ca
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`)}):console.warn("RESEND_API_KEY not configured — magic link URL:",f)}catch(a){return console.error("Magic link email send failed:",a),b.status(500).json({error:"Could not send sign-in email. Please try again."})}return b.status(200).json({success:!0,message:"Check your email for a sign-in link (valid for 15 minutes)."})}d()}catch(a){d(a)}})}};var b=require("../../../webpack-api-runtime.js");b.C(a);var c=b.X(0,[7169],()=>b(b.s=5900));module.exports=c})();