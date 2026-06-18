"use strict";(()=>{var a={};a.id=5541,a.ids=[5541],a.modules={980:a=>{a.exports=require("pdf-lib")},4516:a=>{a.exports=import("docx")},5178:(a,b,c)=>{c.a(a,async(a,d)=>{try{c.r(b),c.d(b,{config:()=>m,default:()=>k});var e=c(8754),f=c(4516),g=c(980),h=a([e,f]);[e,f]=h.then?(await h)():h;let l=new e.Resend(process.env.RESEND_API_KEY);async function i(a,b,c){let d=a.split("\n").map(a=>new f.Paragraph({children:[new f.TextRun({text:a||" ",font:"Calibri",size:24})],spacing:{after:120}})),e=b.split("\n").map(a=>{let b=/^[A-Z][A-Z\s]+$/.test(a.trim())&&a.trim().length>2;return new f.Paragraph({children:[new f.TextRun({text:a||" ",font:"Calibri",size:b?28:22,bold:b})],spacing:{after:b?160:100}})}),g=new f.Document({sections:[{properties:{},children:[new f.Paragraph({children:[new f.TextRun({text:"RENTAL COVER LETTER",font:"Calibri",size:32,bold:!0})],alignment:f.AlignmentType.CENTER,spacing:{after:400}}),...d,new f.Paragraph({children:[new f.TextRun({text:"",break:2})]}),new f.Paragraph({children:[new f.TextRun({text:"TENANT RESUME",font:"Calibri",size:32,bold:!0})],alignment:f.AlignmentType.CENTER,spacing:{before:400,after:400}}),...e]}]});return await f.Packer.toBuffer(g)}async function j(a,b,c){let d=await g.PDFDocument.create(),e=await d.embedFont(g.StandardFonts.Helvetica),f=await d.embedFont(g.StandardFonts.HelveticaBold),h=(a,b,c,d,e,f,h)=>{let i=b.split(" "),j="",k=d,l=1.4*f;for(let b of i){let d=j?`${j} ${b}`:b;h.widthOfTextAtSize(d,f)>e&&j?(a.drawText(j,{x:c,y:k,size:f,font:h,color:(0,g.rgb)(.1,.09,.07)}),j=b,k-=l):j=d}return j&&(a.drawText(j,{x:c,y:k,size:f,font:h,color:(0,g.rgb)(.1,.09,.07)}),k-=l),k},i=d.addPage([612,792]),j=732;for(let b of(i.drawText("RENTAL COVER LETTER",{x:60,y:j,size:18,font:f,color:(0,g.rgb)(.1,.09,.07)}),j-=40,a.split("\n"))){if(!b.trim()){j-=14;continue}j<90&&(i=d.addPage([612,792]),j=732),j=h(i,b,60,j,492,11,e)-4}for(let a of(i=d.addPage([612,792]),j=732,i.drawText("TENANT RESUME",{x:60,y:j,size:18,font:f,color:(0,g.rgb)(.1,.09,.07)}),j-=40,b.split("\n"))){if(!a.trim()){j-=10;continue}j<90&&(i=d.addPage([612,792]),j=732);let b=/^[A-Z][A-Z\s]+$/.test(a.trim())&&a.trim().length>2;j=h(i,a,60,j,492,b?13:11,b?f:e)-(b?8:3)}let k=await d.save();return Buffer.from(k)}async function k(a,b){if("POST"!==a.method)return b.status(405).json({error:"Method not allowed"});let{email:c,fullName:d,letter:e,resume:f,applicationNumber:g,ownerToken:h}=a.body;if(!c||!e&&!f)return b.status(400).json({error:"Missing email and content"});if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c))return b.status(400).json({error:"Invalid email address"});if(!process.env.RESEND_API_KEY)return b.status(500).json({error:"Email service not configured"});try{let a=e||"",k=f||"",m=await i(a,k,d||"Applicant"),n=await j(a,k,d||"Applicant"),o=(d||"rental").replace(/[^a-zA-Z0-9]/g,"_"),p=(d||"").split(" ")[0]||"there",q=await l.emails.send({from:"Rentletter <hello@rentletter.ca>",to:c,subject:a?"Your letter is ready":"Your Rentletter application",html:`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
</head>
<body style="margin: 0; padding: 0; background: #faf8f3; font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background: #faf8f3;">
    <tr>
      <td align="center" style="padding: 56px 24px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="max-width: 560px; background: #faf8f3;">

          <!-- Header — wordmark with red bar -->
          <tr>
            <td style="padding-bottom: 28px; border-bottom: 1px solid #e3ddd0;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="vertical-align: middle; padding-right: 8px;">
                    <div style="width: 4px; height: 24px; background: #d72027;"></div>
                  </td>
                  <td style="vertical-align: middle; font-family: 'Inter', sans-serif; font-size: 20px; font-weight: 800; color: #0f0f10; letter-spacing: -0.02em;">
                    Rentletter
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Big headline -->
          <tr>
            <td style="padding: 56px 0 24px;">
              <h1 style="font-family: 'Inter', sans-serif; font-weight: 800; font-size: 52px; line-height: 0.95; letter-spacing: -0.03em; color: #0f0f10; margin: 0;">
                Your letter<br>is <span style="color: #d72027;">ready,</span><br>${p}.
              </h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding-bottom: 32px;">
              <p style="font-family: 'Inter', sans-serif; font-size: 16px; line-height: 1.6; color: #3a3a3c; margin: 0 0 16px;">
                Your cover letter and tenant resume are attached — both as PDF and Word.
              </p>
              <p style="font-family: 'Inter', sans-serif; font-size: 16px; line-height: 1.6; color: #3a3a3c; margin: 0;">
                Send them with your standard rental application. In Ontario, that's <span style="color: #0f0f10; font-weight: 600;">Form 410</span>.
              </p>
            </td>
          </tr>

          <!-- Document manifest -->
          <tr>
            <td style="padding-bottom: 40px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background: #0f0f10;">
                <tr>
                  <td style="padding: 28px 28px 20px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                      <tr>
                        <td style="font-family: 'Inter', sans-serif; font-size: 11px; color: #d72027; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase;">
                          Attached
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 0 28px 18px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                      <tr>
                        <td style="font-family: 'Inter', sans-serif; font-size: 18px; font-weight: 700; color: #faf8f3; letter-spacing: -0.01em;">
                          Cover letter
                        </td>
                        <td align="right" style="font-family: 'Inter', sans-serif; font-size: 13px; color: #86868b;">
                          PDF \xb7 DOCX
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 0 28px;">
                    <div style="height: 1px; background: #3a3a3c;"></div>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 18px 28px 28px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                      <tr>
                        <td style="font-family: 'Inter', sans-serif; font-size: 18px; font-weight: 700; color: #faf8f3; letter-spacing: -0.01em;">
                          Tenant resume
                        </td>
                        <td align="right" style="font-family: 'Inter', sans-serif; font-size: 13px; color: #86868b;">
                          PDF \xb7 DOCX
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          ${g?`
          <!-- Application number — the trust signal for landlords -->
          <tr>
            <td style="padding-bottom: 24px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background: #0f0f10;">
                <tr>
                  <td style="width: 4px; background: #d72027;"></td>
                  <td style="padding: 24px 28px;">
                    <p style="font-family: 'Inter', sans-serif; font-size: 11px; color: #d72027; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; margin: 0 0 10px;">
                      Your Application Number
                    </p>
                    <p style="font-family: 'Courier New', monospace; font-size: 22px; font-weight: 800; color: #faf8f3; letter-spacing: 0.04em; margin: 0 0 14px;">
                      ${g}
                    </p>
                    <p style="font-family: 'Inter', sans-serif; font-size: 13px; line-height: 1.55; color: #a4adbb; margin: 0;">
                      Share this number with your landlord. They can verify your application and compare you against other tenants &mdash; for free &mdash; at <span style="color: #faf8f3; font-weight: 600;">rentletter.ca/landlord</span>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          `:""}

          ${h&&g?`
          <!-- Owner token / manage application -->
          <tr>
            <td style="padding-bottom: 40px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background: #faf8f3; border: 1px solid #e3ddd0;">
                <tr>
                  <td style="padding: 20px 24px;">
                    <p style="font-family: 'Inter', sans-serif; font-size: 11px; color: #d72027; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; margin: 0 0 10px;">
                      Manage your application
                    </p>
                    <p style="font-family: 'Inter', sans-serif; font-size: 14px; line-height: 1.6; color: #3a3a3c; margin: 0 0 14px;">
                      See who's looked you up. Revoke access any time. Your owner token below is the key &mdash; save this email or keep it somewhere private.
                    </p>
                    <p style="font-family: 'Inter', sans-serif; font-size: 11px; color: #86868b; margin: 0 0 4px; letter-spacing: 0.04em; text-transform: uppercase; font-weight: 600;">
                      Owner token
                    </p>
                    <p style="font-family: 'Courier New', monospace; font-size: 14px; color: #0f0f10; letter-spacing: 0.04em; word-break: break-all; background: #ffffff; border: 1px solid #e3ddd0; padding: 10px 12px; margin: 0 0 16px;">
                      ${h}
                    </p>
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="background: #0f0f10;">
                          <a href="https://rentletter.ca/my-application?app=${g}&token=${h}" style="display: inline-block; padding: 12px 22px; color: #faf8f3; font-family: 'Inter', sans-serif; font-size: 13px; font-weight: 700; text-decoration: none; letter-spacing: 0.02em;">
                            Open my dashboard &rarr;
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          `:""}

          <!-- Tip block with red accent -->
          <tr>
            <td style="padding-bottom: 40px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="width: 3px; background: #d72027;"></td>
                  <td style="padding-left: 20px;">
                    <p style="font-family: 'Inter', sans-serif; font-size: 11px; color: #d72027; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; margin: 0 0 10px;">
                      Quick tip
                    </p>
                    <p style="font-family: 'Inter', sans-serif; font-size: 15px; line-height: 1.6; color: #3a3a3c; margin: 0;">
                      Attach the PDF when applying online. Print both for in-person viewings. The Word file is there if you want to edit before sending.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Sign-off -->
          <tr>
            <td style="padding-top: 32px; border-top: 1px solid #e3ddd0;">
              <p style="font-family: 'Inter', sans-serif; font-size: 16px; font-weight: 600; color: #0f0f10; margin: 0 0 4px;">
                Good luck out there<span style="color: #d72027;">.</span>
              </p>
              <p style="font-family: 'Inter', sans-serif; font-size: 14px; color: #86868b; margin: 6px 0 24px;">
                — The Rentletter desk
              </p>

              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td>
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="vertical-align: middle; padding-right: 6px;">
                          <div style="width: 3px; height: 14px; background: #d72027;"></div>
                        </td>
                        <td style="vertical-align: middle; font-family: 'Inter', sans-serif; font-size: 13px; font-weight: 800; color: #0f0f10; letter-spacing: -0.01em;">
                          Rentletter
                        </td>
                      </tr>
                    </table>
                  </td>
                  <td align="right" style="font-family: 'Inter', sans-serif; font-size: 12px; color: #86868b;">
                    Toronto \xb7 Not legal advice
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,attachments:[{filename:`${o}_rental_letter.pdf`,content:n,contentType:"application/pdf"},{filename:`${o}_rental_letter.docx`,content:m,contentType:"application/vnd.openxmlformats-officedocument.wordprocessingml.document"}]});if(q.error)return console.error("Resend error:",q.error),b.status(500).json({error:"Failed to send email"});return b.status(200).json({success:!0})}catch(a){return console.error("Email error:",a),b.status(500).json({error:"Failed to send email"})}}let m={api:{bodyParser:{sizeLimit:"1mb"}}};d()}catch(a){d(a)}})},5600:a=>{a.exports=require("next/dist/compiled/next-server/pages-api.runtime.prod.js")},7962:(a,b,c)=>{c.a(a,async(a,d)=>{try{c.r(b),c.d(b,{config:()=>o,default:()=>n,handler:()=>m});var e=c(9046),f=c(8667),g=c(3480),h=c(6435),i=c(5178),j=c(8112),k=c(8766),l=a([i]);i=(l.then?(await l)():l)[0];let n=(0,h.M)(i,"default"),o=(0,h.M)(i,"config"),p=new g.PagesAPIRouteModule({definition:{kind:f.A.PAGES_API,page:"/api/send",pathname:"/api/send",bundlePath:"",filename:""},userland:i,distDir:".next",relativeProjectDir:""});async function m(a,b,c){let d=await p.prepare(a,b,{srcPage:"/api/send"});if(!d){b.statusCode=400,b.end("Bad Request"),null==c.waitUntil||c.waitUntil.call(c,Promise.resolve());return}let{query:f,params:g,prerenderManifest:h,routerServerContext:i}=d;try{let c=a.method||"GET",d=(0,j.getTracer)(),e=d.getActiveScopeSpan(),l=p.instrumentationOnRequestError.bind(p),m=async e=>p.render(a,b,{query:{...f,...g},params:g,allowedRevalidateHeaderKeys:[],multiZoneDraftMode:!1,trustHostHeader:!1,previewProps:h.preview,propagateError:!1,dev:p.isDev,page:"/api/send",internalRevalidate:null==i?void 0:i.revalidate,onError:(...b)=>l(a,...b)}).finally(()=>{if(!e)return;e.setAttributes({"http.status_code":b.statusCode,"next.rsc":!1});let f=d.getRootSpanAttributes();if(!f)return;if(f.get("next.span_type")!==k.BaseServerSpan.handleRequest)return void console.warn(`Unexpected root span type '${f.get("next.span_type")}'. Please report this Next.js issue https://github.com/vercel/next.js`);let g=f.get("next.route");if(g){let a=`${c} ${g}`;e.setAttributes({"next.route":g,"http.route":g,"next.span_name":a}),e.updateName(a)}else e.updateName(`${c} ${a.url}`)});e?await m(e):await d.withPropagatedContext(a.headers,()=>d.trace(k.BaseServerSpan.handleRequest,{spanName:`${c} ${a.url}`,kind:j.SpanKind.SERVER,attributes:{"http.method":c,"http.target":a.url}},m))}catch(a){if(p.isDev)throw a;(0,e.sendError)(b,500,"Internal Server Error")}finally{null==c.waitUntil||c.waitUntil.call(c,Promise.resolve())}}d()}catch(a){d(a)}})},8754:a=>{a.exports=import("resend")}};var b=require("../../webpack-api-runtime.js");b.C(a);var c=b.X(0,[7169],()=>b(b.s=7962));module.exports=c})();