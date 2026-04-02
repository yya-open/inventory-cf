import{a as D}from"./qrcode-0S2G5MIQ.js";import{M as Y,N as O,O as X}from"./index-DIJeFpP6.js";import"./vendor-CLJYU4I4.js";import"./vue-vendor-D3BAILaB.js";import"./element-plus-CBiGpK6e.js";import"./element-plus-icons-CwaMKy9S.js";import"./excel-utils-puM1fYsQ.js";function h(n){return String(n||"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;")}async function U(n){return Promise.all(n.map(async t=>({...t,dataUrl:await D.toDataURL(t.url,{width:240,margin:1,errorCorrectionLevel:"Q"})})))}function V(n,t){const o=[];for(let a=0;a<n.length;a+=t)o.push(n.slice(a,a+t));return o}function P(n,t){const o=URL.createObjectURL(t),a=document.createElement("a");a.href=o,a.download=n,document.body.appendChild(a),a.click(),document.body.removeChild(a),URL.revokeObjectURL(o)}function G(n,t){const{widthMm:o,heightMm:a}=X(t),e=14,s=Math.max(40,o-t.margin_left_mm-t.margin_right_mm),l=Math.max(40,a-t.margin_top_mm-t.margin_bottom_mm-e),r=(s-t.gap_x_mm*(t.cols-1))/t.cols,g=(l-t.gap_y_mm*(t.rows-1))/t.rows,c=t.paper_size==="custom"?`${o}mm ${a}mm`:`${t.paper_size} ${t.orientation}`,v=Math.min(r*.44,t.qr_size_mm+5);return{pageWidthMm:o,pageHeightMm:a,pageSize:c,cellWidth:Number(r.toFixed(2)),cellHeight:Number(g.toFixed(2)),qrColumnWidth:Number(v.toFixed(2)),kind:n}}function I(n,t=4){return(n||[]).slice(0,t).map(o=>`
      <div class="meta-row"><span class="k">${h(o.label)}</span><span class="v">${h(o.value)}</span></div>`).join("")}function J(n,t,o,a,e,s){return`
  <section class="print-page cards-page">
    <div class="page-topline">
      <div class="page-title">${h(n)}</div>
      <div class="page-sub">第 ${o+1} 页 / 共 ${a} 页 · ${t.length} 张</div>
    </div>
    <div class="cards-grid">
      ${t.map(l=>{var r;return`
        <article class="qr-card">
          <div class="qr-box"><img src="${l.dataUrl}" alt="QR" /></div>
          <div class="card-content">
            ${e.show_title?`<div class="card-title">${h(l.title)}</div>`:""}
            ${e.show_subtitle&&l.subtitle?`<div class="card-subtitle">${h(l.subtitle)}</div>`:""}
            ${e.show_meta&&((r=l.meta)!=null&&r.length)?`<div class="meta">${I(l.meta,e.meta_count)}</div>`:""}
            ${e.show_link?`<div class="link">${h(l.url)}</div>`:""}
          </div>
        </article>`}).join("")}
    </div>
  </section>`}function K(n,t,o,a,e){return`
  <section class="print-page sheet-page">
    <div class="page-topline">
      <div class="page-title">${h(n)}</div>
      <div class="page-sub">第 ${o+1} 页 / 共 ${a} 页 · ${t.length} 张</div>
    </div>
    <div class="sheet-grid">
      ${t.map(s=>{var l;return`
        <article class="sheet-item">
          <div class="sheet-qr"><img src="${s.dataUrl}" alt="QR" /></div>
          <div class="sheet-text">
            ${e.show_title?`<div class="sheet-title">${h(s.title)}</div>`:""}
            ${e.show_subtitle&&s.subtitle?`<div class="sheet-subtitle">${h(s.subtitle)}</div>`:""}
            ${e.show_meta&&((l=s.meta)!=null&&l.length)?`<div class="sheet-meta">${I(s.meta,e.meta_count)}</div>`:""}
            ${e.show_link?`<div class="sheet-link">${h(s.url)}</div>`:""}
          </div>
        </article>`}).join("")}
    </div>
  </section>`}function L(n,t,o,a){const e=Y(n,a||O(n)),s=G(n,e),l=Math.max(1,e.cols*e.rows),r=V(o,l),g=r.map((f,b)=>n==="cards"?J(t,f,b,r.length,e):K(t,f,b,r.length,e)).join(""),c=n==="cards"?Math.max(3.8,Math.min(6,s.cellHeight*.11)):Math.max(3.6,Math.min(5.2,s.cellHeight*.1)),v=Math.max(2.5,Math.min(3.2,c*.56)),S=Math.max(2.3,Math.min(2.9,c*.48)),p=Math.max(2,Math.min(2.4,c*.42));return`<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${h(t)}</title>
<style>
@page{size:${s.pageSize};margin:${e.margin_top_mm}mm ${e.margin_right_mm}mm ${e.margin_bottom_mm}mm ${e.margin_left_mm}mm}
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:#fff;color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
body{padding:0}
.print-page{width:${s.pageWidthMm-e.margin_left_mm-e.margin_right_mm}mm;height:${s.pageHeightMm-e.margin_top_mm-e.margin_bottom_mm}mm;overflow:hidden;page-break-after:always;break-after:page;background:#fff}
.print-page:last-child{page-break-after:auto;break-after:auto}
.page-topline{height:10mm;display:flex;align-items:flex-end;justify-content:space-between;padding:0 1mm 2mm 1mm;border-bottom:0.2mm solid #e5e7eb;margin-bottom:4mm}
.page-title{font-size:5mm;font-weight:800;line-height:1}
.page-sub{font-size:2.7mm;color:#6b7280;line-height:1}
.cards-grid,.sheet-grid{height:calc(100% - 14mm);display:grid;grid-template-columns:repeat(${e.cols}, minmax(0, 1fr));grid-template-rows:repeat(${e.rows}, minmax(0, 1fr));gap:${e.gap_y_mm}mm ${e.gap_x_mm}mm}
.qr-card,.sheet-item{display:grid;grid-template-columns:${s.qrColumnWidth}mm minmax(0,1fr);gap:3.2mm;border:0.3mm solid #d1d5db;border-radius:2.8mm;padding:3.2mm;background:#fff;overflow:hidden;height:100%;break-inside:avoid;page-break-inside:avoid}
.qr-box,.sheet-qr{display:flex;align-items:center;justify-content:center;border:0.3mm solid #e5e7eb;border-radius:2.2mm;padding:1.2mm;background:#fff}
.qr-box img,.sheet-qr img{width:${e.qr_size_mm}mm;height:${e.qr_size_mm}mm;display:block}
.card-content,.sheet-text{display:flex;flex-direction:column;min-width:0;height:100%}
.card-title,.sheet-title{font-size:${c.toFixed(2)}mm;font-weight:800;line-height:1.18;word-break:break-word;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.card-subtitle,.sheet-subtitle{margin-top:1.4mm;color:#4b5563;font-size:${v.toFixed(2)}mm;line-height:1.25;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.meta,.sheet-meta{margin-top:2mm;padding-top:2mm;border-top:0.2mm dashed #d1d5db;display:grid;gap:0.8mm}
.meta-row{display:flex;justify-content:space-between;gap:2mm;font-size:${S.toFixed(2)}mm;line-height:1.25}
.meta-row .k{color:#6b7280;white-space:nowrap}
.meta-row .v{font-weight:700;text-align:right;word-break:break-all}
.link,.sheet-link{margin-top:auto;padding-top:2mm;font-size:${p.toFixed(2)}mm;color:#6b7280;word-break:break-all;line-height:1.2;max-height:7mm;overflow:hidden}
@media print{html,body{background:#fff}.print-page{border-radius:0;box-shadow:none}}
</style>
</head>
<body>
${g}
</body>
</html>`}async function rt(n,t,o,a){const e=await U(o),s=L("cards",t,e,a);P(n.endsWith(".html")?n:`${n}.html`,new Blob([s],{type:"text/html;charset=utf-8"}))}async function mt(n,t,o,a){const e=await U(o),s=L("sheet",t,e,a);P(n.endsWith(".html")?n:`${n}.html`,new Blob([s],{type:"text/html;charset=utf-8"}))}function Z(n){return new Promise((t,o)=>{const a=new Image;a.onload=()=>t(a),a.onerror=()=>o(new Error("二维码图片加载失败")),a.src=n})}function z(n,t,o){const a=String(t||"").trim();if(!a)return["-"];const e=Array.from(a),s=[];let l="";return e.forEach(r=>{const g=l+r;n.measureText(g).width>o&&l?(s.push(l),l=r):l=g}),l&&s.push(l),s}async function ct(n,t,o){const a=await U(o);if(!a.length)return;const e=2,s=3,l=e*s,r=1600,g=2200,c=72,v=40,S=40,p=Math.floor((r-c*2-v)/e),f=Math.floor((g-c*2-S*(s-1))/s);for(let b=0;b*l<a.length;b+=1){const C=a.slice(b*l,b*l+l),M=document.createElement("canvas");M.width=r,M.height=g;const i=M.getContext("2d");if(!i)throw new Error("生成二维码图版失败");i.fillStyle="#f5f7fb",i.fillRect(0,0,r,g),i.fillStyle="#111827",i.font='bold 40px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',i.fillText(t,c,54),i.font='24px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',i.fillStyle="#6b7280",i.fillText(`第 ${b+1} 页 · 共 ${a.length} 张`,c,92);for(let $=0;$<C.length;$+=1){const x=C[$],E=$%e,Q=Math.floor($/e),d=c+E*(p+v),m=130+Q*(f+S);i.fillStyle="#ffffff",i.strokeStyle="#e5e7eb",i.lineWidth=2;const _=28;i.beginPath(),i.moveTo(d+_,m),i.arcTo(d+p,m,d+p,m+f,_),i.arcTo(d+p,m+f,d,m+f,_),i.arcTo(d,m+f,d,m,_),i.arcTo(d,m,d+p,m,_),i.closePath(),i.fill(),i.stroke();const R=await Z(x.dataUrl),q=240,k=d+28,j=m+34;i.drawImage(R,k,j,q,q);const T=k+q+28,H=p-(T-d)-28;i.fillStyle="#111827",i.font='bold 30px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',z(i,x.title,H).slice(0,2).forEach((u,w)=>{i.fillText(u,T,m+76+w*38)}),x.subtitle&&(i.font='20px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',i.fillStyle="#4b5563",z(i,x.subtitle,H).slice(0,2).forEach((u,w)=>{i.fillText(u,T,m+152+w*28)}));const A=m+292;i.font='18px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',(x.meta||[]).slice(0,5).forEach((u,w)=>{const W=A+w*30;i.fillStyle="#6b7280",i.fillText(`${u.label}：`,k,W),i.fillStyle="#111827";const F=i.measureText(`${u.label}：`).width,N=z(i,u.value,p-56-F).slice(0,1);i.fillText(N[0]||"-",k+F,W)}),i.fillStyle="#9ca3af",i.font='14px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',z(i,x.url,p-56).slice(0,2).forEach((u,w)=>{i.fillText(u,k,m+f-34+w*18)})}const B=M.toDataURL("image/png"),y=document.createElement("a");y.href=B,y.download=`${n}_第${b+1}页.png`,document.body.appendChild(y),y.click(),document.body.removeChild(y)}}export{rt as downloadQrCardsHtml,ct as downloadQrCardsPng,mt as downloadQrSheetHtml};
