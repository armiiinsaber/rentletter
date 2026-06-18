"use strict";(()=>{var a={};a.id=255,a.ids=[255],a.modules={5600:a=>{a.exports=require("next/dist/compiled/next-server/pages-api.runtime.prod.js")},6450:(a,b,c)=>{c.a(a,async(a,d)=>{try{c.r(b),c.d(b,{default:()=>i});var e=c(8754),f=a([e]);let j=new(e=(f.then?(await f)():f)[0]).Resend(process.env.RESEND_API_KEY);async function g(a){if(!a)return{ok:!1,reason:"No session ID"};if(!process.env.STRIPE_SECRET_KEY)return{ok:!1,reason:"Stripe not configured"};try{let b=await fetch(`https://api.stripe.com/v1/checkout/sessions/${a}`,{headers:{Authorization:`Bearer ${process.env.STRIPE_SECRET_KEY}`}}),c=await b.json();if(c.error)return{ok:!1,reason:c.error.message};if("paid"!==c.payment_status)return{ok:!1,reason:"Payment not completed"};return{ok:!0,session:c}}catch(a){return{ok:!1,reason:"Stripe verification failed"}}}async function h(a,b){if(!process.env.KV_REST_API_URL||!process.env.KV_REST_API_TOKEN)return console.warn("KV not configured — pass not persisted"),!1;try{let c=await fetch(`${process.env.KV_REST_API_URL}/set/pass:${a}`,{method:"POST",headers:{Authorization:`Bearer ${process.env.KV_REST_API_TOKEN}`,"Content-Type":"application/json"},body:JSON.stringify(b)});if(!c.ok)return console.error("KV pass store failed:",await c.text()),!1;return await fetch(`${process.env.KV_REST_API_URL}/expire/pass:${a}/2592000`,{method:"POST",headers:{Authorization:`Bearer ${process.env.KV_REST_API_TOKEN}`}}),!0}catch(a){return console.error("KV pass store error:",a),!1}}async function i(a,b){if("POST"!==a.method)return b.status(405).json({error:"Method not allowed"});let{stripeSessionId:c}=a.body,d=await g(c);if(!d.ok)return b.status(402).json({error:`Payment required. ${d.reason}`});let e=d.session,f=e.customer_details?.email||e.customer_email;if(!f)return b.status(400).json({error:"No customer email found in payment session"});let i=function(){let a="ABCDEFGHJKMNPQRSTUVWXYZ23456789",b="";for(let c=0;c<16;c++)b+=a[Math.floor(Math.random()*a.length)];return b}(),k=Date.now(),l=k+2592e6,m={token:i,email:f,createdAt:new Date(k).toISOString(),expiresAt:new Date(l).toISOString(),stripeSessionId:c,lettersGenerated:0,plan:"30-day unlimited pass"};await h(i,m)||console.error("Failed to store pass — but payment was successful");let n=`https://rentletter.ca/?pass=${i}`;try{process.env.RESEND_API_KEY&&await j.emails.send({from:"Rentletter <hello@rentletter.ca>",to:f,subject:"Your 30-day search pass — Rentletter",html:function(a,b,c){let d=c.toLocaleDateString("en-CA",{year:"numeric",month:"long",day:"numeric"});return`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Your 30-day pass</title>
</head>
<body style="margin:0;padding:0;background:#faf8f3;font-family:-apple-system,'Inter',sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#faf8f3;padding:48px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;background:#faf8f3;">

          <!-- Logo -->
          <tr>
            <td style="padding-bottom:32px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="width:3px;height:20px;background:#d72027;"></td>
                  <td style="padding-left:7px;font-family:'Inter',sans-serif;font-size:17px;font-weight:800;color:#0f0f10;letter-spacing:-0.02em;">
                    Rentletter
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Headline -->
          <tr>
            <td style="padding-bottom:24px;">
              <p style="font-family:'Inter',sans-serif;font-size:11px;color:#d72027;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;margin:0 0 12px;">
                Payment confirmed &middot; 30-day search pass activated
              </p>
              <h1 style="font-family:'Inter',sans-serif;font-size:42px;font-weight:800;color:#0f0f10;letter-spacing:-0.03em;line-height:1.05;margin:0;">
                Your search pass<span style="color:#d72027;"> is ready.</span>
              </h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding-bottom:32px;">
              <p style="font-family:'Inter',sans-serif;font-size:16px;line-height:1.6;color:#3a3a3c;margin:0 0 16px;">
                Tailor a new Rentletter application for every apartment you're considering over the next 30 days. Update your profile when your situation changes &mdash; new job, new income, found a roommate. Bookmark this email; your access link is below.
              </p>
            </td>
          </tr>

          <!-- Access pass card -->
          <tr>
            <td style="padding-bottom:32px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#0f0f10;">
                <tr>
                  <td style="width:4px;background:#d72027;"></td>
                  <td style="padding:28px 30px;">
                    <p style="font-family:'Inter',sans-serif;font-size:11px;color:#d72027;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;margin:0 0 12px;">
                      Your access link
                    </p>
                    <p style="font-family:'Courier New',monospace;font-size:13px;color:#a4adbb;margin:0 0 20px;word-break:break-all;">
                      ${b}
                    </p>
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="background:#d72027;">
                          <a href="${b}" style="display:inline-block;padding:16px 28px;color:#faf8f3;font-family:'Inter',sans-serif;font-size:14px;font-weight:700;text-decoration:none;letter-spacing:0.02em;">
                            Open my pass &rarr;
                          </a>
                        </td>
                      </tr>
                    </table>
                    <p style="font-family:'Inter',sans-serif;font-size:12px;color:#a4adbb;margin:20px 0 0;line-height:1.55;">
                      Pass token: <strong style="color:#faf8f3;font-family:'Courier New',monospace;letter-spacing:0.04em;">${a}</strong><br>
                      Expires: <strong style="color:#faf8f3;">${d}</strong>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- How it works -->
          <tr>
            <td style="padding-bottom:32px;">
              <p style="font-family:'Inter',sans-serif;font-size:11px;color:#86868b;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;margin:0 0 14px;">
                How to use your pass
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="padding:6px 0;font-family:'Inter',sans-serif;font-size:14px;color:#3a3a3c;line-height:1.6;">
                    <strong style="color:#0f0f10;">1.</strong>&nbsp;&nbsp;Click the link above whenever you want to apply to a new apartment.
                  </td>
                </tr>
                <tr>
                  <td style="padding:6px 0;font-family:'Inter',sans-serif;font-size:14px;color:#3a3a3c;line-height:1.6;">
                    <strong style="color:#0f0f10;">2.</strong>&nbsp;&nbsp;Update the apartment address and any details that changed &mdash; we&rsquo;ll generate a fresh, tailored application.
                  </td>
                </tr>
                <tr>
                  <td style="padding:6px 0;font-family:'Inter',sans-serif;font-size:14px;color:#3a3a3c;line-height:1.6;">
                    <strong style="color:#0f0f10;">3.</strong>&nbsp;&nbsp;Each application gets a fresh number landlords can verify in the dashboard.
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Tip block -->
          <tr>
            <td style="padding-bottom:32px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="width:3px;background:#d72027;"></td>
                  <td style="padding-left:18px;">
                    <p style="font-family:'Inter',sans-serif;font-size:11px;color:#d72027;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;margin:0 0 8px;">
                      Quick tip
                    </p>
                    <p style="font-family:'Inter',sans-serif;font-size:14px;line-height:1.6;color:#3a3a3c;margin:0;">
                      Save this email or bookmark the link. The pass works from any device — phone, laptop, anywhere — as long as you have the URL.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding-top:24px;border-top:1px solid #e3ddd0;">
              <p style="font-family:'Inter',sans-serif;font-size:12px;color:#86868b;line-height:1.55;margin:0;">
                Questions? Reply to this email.<br>
                Rentletter \xb7 Toronto \xb7 rentletter.ca
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`}(i,n,new Date(l))})}catch(a){console.error("Pass email send failed:",a)}return b.status(200).json({passToken:i,passUrl:n,email:f,expiresAt:m.expiresAt})}d()}catch(a){d(a)}})},6554:(a,b,c)=>{c.a(a,async(a,d)=>{try{c.r(b),c.d(b,{config:()=>o,default:()=>n,handler:()=>m});var e=c(9046),f=c(8667),g=c(3480),h=c(6435),i=c(6450),j=c(8112),k=c(8766),l=a([i]);i=(l.then?(await l)():l)[0];let n=(0,h.M)(i,"default"),o=(0,h.M)(i,"config"),p=new g.PagesAPIRouteModule({definition:{kind:f.A.PAGES_API,page:"/api/pass/create",pathname:"/api/pass/create",bundlePath:"",filename:""},userland:i,distDir:".next",relativeProjectDir:""});async function m(a,b,c){let d=await p.prepare(a,b,{srcPage:"/api/pass/create"});if(!d){b.statusCode=400,b.end("Bad Request"),null==c.waitUntil||c.waitUntil.call(c,Promise.resolve());return}let{query:f,params:g,prerenderManifest:h,routerServerContext:i}=d;try{let c=a.method||"GET",d=(0,j.getTracer)(),e=d.getActiveScopeSpan(),l=p.instrumentationOnRequestError.bind(p),m=async e=>p.render(a,b,{query:{...f,...g},params:g,allowedRevalidateHeaderKeys:[],multiZoneDraftMode:!1,trustHostHeader:!1,previewProps:h.preview,propagateError:!1,dev:p.isDev,page:"/api/pass/create",internalRevalidate:null==i?void 0:i.revalidate,onError:(...b)=>l(a,...b)}).finally(()=>{if(!e)return;e.setAttributes({"http.status_code":b.statusCode,"next.rsc":!1});let f=d.getRootSpanAttributes();if(!f)return;if(f.get("next.span_type")!==k.BaseServerSpan.handleRequest)return void console.warn(`Unexpected root span type '${f.get("next.span_type")}'. Please report this Next.js issue https://github.com/vercel/next.js`);let g=f.get("next.route");if(g){let a=`${c} ${g}`;e.setAttributes({"next.route":g,"http.route":g,"next.span_name":a}),e.updateName(a)}else e.updateName(`${c} ${a.url}`)});e?await m(e):await d.withPropagatedContext(a.headers,()=>d.trace(k.BaseServerSpan.handleRequest,{spanName:`${c} ${a.url}`,kind:j.SpanKind.SERVER,attributes:{"http.method":c,"http.target":a.url}},m))}catch(a){if(p.isDev)throw a;(0,e.sendError)(b,500,"Internal Server Error")}finally{null==c.waitUntil||c.waitUntil.call(c,Promise.resolve())}}d()}catch(a){d(a)}})},8754:a=>{a.exports=import("resend")}};var b=require("../../../webpack-api-runtime.js");b.C(a);var c=b.X(0,[7169],()=>b(b.s=6554));module.exports=c})();