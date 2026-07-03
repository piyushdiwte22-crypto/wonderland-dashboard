/* Shared data + render logic. Each page defines PAGE = 'ov' | 'wl' | 'ob'. */
const WLC='#C97625', OBC='#8B9B4D', INK='#1D1D1B';
const CHCOL={facebook:'#4d79c9',instagram:'#c94d8f',youtube:'#c9564d',linkedin:'#4da3c9',tiktok:'#7d6ee0',pinterest:'#b3a13c'};
const VANIMG={Solara:'assets/img/van-solara.webp',XTR:'assets/img/van-xtr.webp',Hornet:'assets/img/van-hornet.webp',Amaroo:'assets/img/van-amaroo.webp'};
const fmt=n=>(n==null||isNaN(n))?'–':Math.round(n).toLocaleString('en-AU');
const charts=[]; let DATA=null, DEMO=null, sel=0;
const $=id=>document.getElementById(id);
const REDUCED=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;

Promise.all([
  fetch('data/report.json?v='+Date.now()).then(r=>r.json()),
  fetch('data/demographics.json?v='+Date.now()).then(r=>r.ok?r.json():null).catch(()=>null)
]).then(([d,demo])=>{
  DATA=d; DEMO=demo;
  const g=$('gen'); if(g) g.textContent='Updated '+d.generated+' · Vista Social + ActiveCampaign';
  sel=d.months.length-1;
  for(let i=d.months.length-1;i>=0;i--){ if(!d.months[i].partial){ sel=i; break; } }
  const mrow=$('months');
  d.months.forEach((m,i)=>{
    const b=document.createElement('button');
    b.className='pill'+(i===sel?' active':'');
    b.innerHTML=m.label.replace(/\((.*)\)/,'<span class="part">($1)</span>');
    b.onclick=()=>{sel=i;document.querySelectorAll('.pill').forEach((p,j)=>p.classList.toggle('active',j===sel));render();};
    mrow.appendChild(b);
  });
  render();
}).catch(e=>{
  const g=$('gen'); if(g) g.textContent='Data failed to load: '+e.message;
});

/* count-up animation for KPI numbers */
function countUp(el){
  if(REDUCED) return;
  const txt=el.textContent;
  const num=parseFloat(txt.replace(/[^0-9.]/g,''));
  if(isNaN(num)||num===0) return;
  const prefix=txt.match(/^[+\-]/)?txt[0]:'';
  const suffix=/%$/.test(txt)?'%':'';
  const dec=/\./.test(txt)?1:0;
  const t0=performance.now(), dur=650;
  function step(t){
    const p=Math.min(1,(t-t0)/dur), e=1-Math.pow(1-p,3);
    const v=num*e;
    el.textContent=prefix+(dec?v.toFixed(1):Math.round(v).toLocaleString('en-AU'))+suffix;
    if(p<1) requestAnimationFrame(step); else el.textContent=txt;
  }
  requestAnimationFrame(step);
}
function animateKpis(scope){ (scope||document).querySelectorAll('.k .n, .bs .n').forEach(countUp); }

function delta(cur,prev,label){
  if(prev==null||cur==null||prev===0) return '<div class="d na">'+(label||'baseline month')+'</div>';
  const ch=cur-prev,pct=Math.round(ch/Math.abs(prev)*100);
  return `<div class="d ${ch>=0?'up':'down'}">${ch>=0?'▲':'▼'} ${fmt(Math.abs(ch))} (${pct>=0?'+':''}${pct}%)</div>`;
}
function k(n,l,d,cls){return `<div class="k ${cls||''}"><div class="n">${n}</div><div class="l">${l}</div>${d||''}</div>`;}
function sum(o){return Object.values(o||{}).reduce((a,b)=>a+(b||0),0);}
const GOALS=[['impressions','Impressions'],['engagement','Engagements'],['likes','Likes'],['comments','Comments'],['shares','Shares'],['saves','Saves'],['messages','Messages'],['profile_views','Profile visits'],['followers','Total followers']];

function goalBand(id,t,pt){
  $(id).innerHTML=GOALS.map(([key,lab],i)=>{
    const cur=t[key], prev=pt&&pt[key];
    const d=(key==='saves'||key==='messages')&&(!prev)?delta(cur,null,'tracked from Jun 2026'):
      key==='followers'?`<div class="d ${t.follower_change>=0?'up':'down'}">${t.follower_change>=0?'▲':'▼'} ${fmt(Math.abs(t.follower_change))} this month</div>`:
      delta(cur,prev);
    return k(fmt(cur),lab,d,i===0?'acc':'');
  }).join('')+k(t.engagement_rate+'%','Engagement rate',pt?delta(t.engagement_rate,pt.engagement_rate):'','dark');
}

function render(){
  charts.forEach(c=>c.destroy()); charts.length=0;
  const m=DATA.months[sel], p=sel>0?DATA.months[sel-1]:null;
  const w=m.wl,o=m.ob,a=m.ac, pw=p&&p.wl,po=p&&p.ob,pa=p&&p.ac;
  const per=m.label+(m.partial?' — partial month, numbers still accumulating':'');
  const sn=$('subnote'); if(sn) sn.textContent='Reporting period: '+per;
  const leads=sum(a.leads_by_state), pleads=pa?sum(pa.leads_by_state):null;
  const deposits=sum(a.deposits_flow), handovers=sum(a.handovers_flow);

  if(PAGE==='ov'){
    $('ov-period').textContent=per;
    $('ov-kpis').innerHTML=
      k(fmt(w.totals.impressions+o.totals.impressions),'Impressions · both brands',delta(w.totals.impressions+o.totals.impressions,p&&(pw.totals.impressions+po.totals.impressions)),'acc')+
      k('+'+fmt(w.totals.follower_change+o.totals.follower_change),'New followers',delta(w.totals.follower_change+o.totals.follower_change,p&&(pw.totals.follower_change+po.totals.follower_change)))+
      k(fmt(leads),'Sales leads created',delta(leads,pleads))+
      k(fmt(deposits),'Deposits received',delta(deposits,pa&&sum(pa.deposits_flow)))+
      k(fmt(handovers),'Handovers completed',delta(handovers,pa&&sum(pa.handovers_flow)))+
      k(fmt(a.new_contacts),'New CRM contacts',delta(a.new_contacts,pa&&pa.new_contacts));
    $('ov-wl').innerHTML=
      k(fmt(w.totals.impressions),'Impressions',delta(w.totals.impressions,pw&&pw.totals.impressions))+
      k('+'+fmt(w.totals.follower_change),'Followers',delta(w.totals.follower_change,pw&&pw.totals.follower_change))+
      k(w.totals.engagement_rate+'%','Engagement rate','')+
      k(fmt(a.ad_enquiries),'Ad enquiries',delta(a.ad_enquiries,pa&&pa.ad_enquiries));
    $('ov-ob').innerHTML=
      k(fmt(o.totals.impressions),'Impressions',delta(o.totals.impressions,po&&po.totals.impressions))+
      k('+'+fmt(o.totals.follower_change),'Followers',delta(o.totals.follower_change,po&&po.totals.follower_change))+
      k(o.totals.engagement_rate+'%','Engagement rate','')+
      k(fmt(o.totals.messages||null),'Messages received','');
    const topState=Object.entries(a.leads_by_state||{}).sort((x,y)=>y[1]-x[1])[0];
    const wlCh=Object.entries(w.channels).sort((x,y)=>y[1].impressions-x[1].impressions)[0];
    const peakI=w.daily.impressions.length?Math.max(...w.daily.impressions):0;
    const peakD=w.daily.dates[w.daily.impressions.indexOf(peakI)];
    const topPost=(w.top_posts||[])[0];
    $('ov-headlines').innerHTML=
      `<li><strong>Wonderland RV</strong> reached ${fmt(w.totals.impressions)} impressions; top channel was ${wlCh?wlCh[0]:'–'} and the peak day was ${peakD||'–'} (${fmt(peakI)} impressions).</li>`+
      (topPost?`<li><strong>Top post:</strong> "${topPost.msg}" (${topPost.network} ${topPost.type}) — ${fmt(topPost.impressions)} impressions, ${fmt(topPost.shares)} shares, ${fmt(topPost.saves)} saves.</li>`:'')+
      `<li class="ob"><strong>Outbound RVs</strong> reached ${fmt(o.totals.impressions)} impressions and added ${fmt(o.totals.follower_change)} followers at a ${o.totals.engagement_rate}% engagement rate.</li>`+
      `<li class="crm"><strong>Sales:</strong> ${fmt(leads)} leads created${topState?' ('+topState[0]+' leading with '+fmt(topState[1])+')':''}, ${fmt(deposits)} deposits received and ${fmt(handovers)} handovers completed.</li>`;
  }

  if(PAGE==='wl'){
    goalBand('wl-social-kpis',w.totals,pw&&pw.totals);
    lineChart('wl-line',w.daily,WLC);
    barChart('wl-bars',Object.keys(w.channels),Object.keys(w.channels).map(c=>w.channels[c].follower_change),Object.keys(w.channels).map(c=>CHCOL[c]));
    chanTable('wl-table',w.channels);
    postsTable('wl-posts',w.top_posts);
    audience(w);
    $('wl-crm-kpis').innerHTML=
      k(fmt(leads),'Sales leads created',delta(leads,pleads),'acc')+
      k(fmt(a.new_contacts),'New CRM contacts',delta(a.new_contacts,pa&&pa.new_contacts))+
      k(fmt(a.ad_enquiries),'Meta / Google ad enquiries',delta(a.ad_enquiries,pa&&pa.ad_enquiries))+
      k(fmt(sum(a.brochures_by_model)),'Brochure downloads',delta(sum(a.brochures_by_model),pa&&sum(pa.brochures_by_model)))+
      k(fmt(DATA.total_contacts_now),'Total CRM contacts','<div class="d na">live database size</div>','dark');
    const st=a.leads_by_state||{};
    barChart('wl-states',Object.keys(st),Object.values(st),Object.keys(st).map(()=>WLC),true);
    donut('wl-sources',a.deals_by_type,['#C97625','#1D1D1B','#8B9B4D','#4d79c9','#c94d8f','#999']);
    vanGrid('wl-brochures',a.brochures_by_model);
    campTable('wl-camps',a.campaigns);
    $('wl-flow-kpis').innerHTML=
      k(fmt(deposits),'Deposits received this month',flowStates(a.deposits_flow),'acc')+
      k(fmt(handovers),'Handovers completed this month',flowStates(a.handovers_flow),'dark')+
      k(fmt((snap('Deposit Received')||{}).total),'Deposits currently held','<div class="d na">pipeline snapshot</div>')+
      k(fmt(((snap('In Production')||{}).total||0)+((snap('Order Finalised')||{}).total||0)),'Orders in build','<div class="d na">finalised + in production</div>')+
      k(fmt((snap('Handover Booked / Ready')||{}).total),'Ready / booked for handover','<div class="d na">pipeline snapshot</div>');
    funnelTable();
  }

  if(PAGE==='ob'){
    goalBand('ob-social-kpis',o.totals,po&&po.totals);
    lineChart('ob-line',o.daily,OBC);
    chanTable('ob-table',o.channels);
    postsTable('ob-posts',o.top_posts,true);
  }
  animateKpis();
}
function snap(stage){return DATA.funnel_snapshot.find(f=>f.stage===stage);}
function flowStates(f){
  const e=Object.entries(f||{}).filter(x=>x[1]>0).sort((a,b)=>b[1]-a[1]);
  return e.length?`<div class="d na">${e.map(x=>x[0]+' '+x[1]).join(' · ')}</div>`:'<div class="d na">none this month</div>';
}
function vanGrid(id,models){
  const order=['Solara','Amaroo','Hornet','XTR','Other'];
  const names=order.filter(n=>models&&models[n]!=null);
  if(!names.length){$(id).innerHTML='<div class="footnote">No brochure downloads recorded this month</div>';return;}
  $(id).innerHTML='<div class="vangrid">'+names.map(n=>
    `<div class="van">${VANIMG[n]?'<img src="'+VANIMG[n]+'" alt="'+n+'" loading="lazy">':''}<div class="vn">${models[n]}</div><div class="vm">${n}</div></div>`).join('')+'</div>';
}
function postsTable(id,posts,ob){
  const el=$(id); if(!el) return;
  if(!posts||!posts.length){el.innerHTML='<div class="footnote">Top-post data begins June 2026. Select June or a later month.</div>';return;}
  const rows=posts.map((t,i)=>
    `<tr><td style="color:${ob?OBC:WLC};font-weight:700">${i+1}</td>
    <td><a class="postlink" href="${t.link}" target="_blank" rel="noopener">${t.msg}</a></td>
    <td><span class="netchip" style="background:${CHCOL[t.network]||'#888'}">${t.network}</span></td>
    <td>${t.type}</td><td>${t.date}</td>
    <td class="num">${fmt(t.impressions)}</td><td class="num">${fmt(t.engagement)}</td>
    <td class="num">${fmt(t.shares)}</td><td class="num">${fmt(t.saves)}</td></tr>`).join('');
  el.innerHTML=`<thead><tr><th>#</th><th>Post</th><th>Channel</th><th>Type</th><th>Date</th><th class="num">Impressions</th><th class="num">Engagement</th><th class="num">Shares</th><th class="num" title="Saves are reported by Instagram and TikTok only">Saves</th></tr></thead><tbody>${rows}</tbody>`;
}
function audience(w){
  const box=$('wl-audience'); if(!box) return;
  const tt=w.tiktok_audience;
  let html='';
  if(tt){
    html+='<div class="card"><h3>TikTok audience · geography (impression-weighted)</h3><div class="audbars">'+
      tt.countries.map(c=>`<div class="row"><div class="lab">${c.c}</div><div class="track"><div class="fill" style="width:${c.pct}%"></div></div><div class="pct">${c.pct}%</div></div>`).join('')+
      '</div><div class="footnote">Sampled across '+fmt(tt.impressions_sampled)+' TikTok impressions this month.</div></div>';
    html+='<div class="card"><h3>TikTok audience · who is watching</h3><div class="bigstat">'+
      `<div class="bs"><div class="n">${tt.gender.male}%</div><div class="l">Male</div></div>`+
      `<div class="bs"><div class="n">${tt.gender.female}%</div><div class="l">Female</div></div>`+
      `<div class="bs"><div class="n">${tt.non_follower_pct}%</div><div class="l">Non-followers</div></div>`+
      `<div class="bs"><div class="n">${tt.new_viewers_pct}%</div><div class="l">New viewers</div></div>`+
      '</div><div class="footnote">A high non-follower share means TikTok is working as a discovery channel, putting Wonderland RV in front of people who have never seen the brand.</div></div>';
  }
  let meta='';
  if(DEMO&&(DEMO.instagram||DEMO.facebook)){
    meta='<div class="card"><h3>Meta audience · Facebook + Instagram</h3>';
    for(const net of ['instagram','facebook']){
      const dd=DEMO[net]; if(!dd) continue;
      meta+='<div style="margin-bottom:10px"><strong style="text-transform:capitalize">'+net+':</strong> '+
        (dd.top_locations?('Top locations: '+dd.top_locations.join(', ')+'. '):'')+
        (dd.gender?('Gender: '+dd.gender.male+'% male / '+dd.gender.female+'% female. '):'')+
        (dd.top_age?('Largest age group: '+dd.top_age+'.'):'')+'</div>';
    }
    meta+='<div class="footnote">Source: Meta Business Suite audience export'+(DEMO.updated?' · updated '+DEMO.updated:'')+'</div></div>';
  } else {
    meta='<div class="pendingcard"><b>Facebook + Instagram demographics:</b> Meta does not expose audience age, gender or location through the reporting API we use. To show them here, export Audience insights from Meta Business Suite once a month and drop the numbers into <b>data/demographics.json</b> in the dashboard repo (the file explains the format), or ask Claude to do it from a screenshot of the Insights page.</div>';
  }
  box.innerHTML=html+meta;
}
function funnelTable(){
  const states=DATA.funnel_states;
  const max=Math.max(...DATA.funnel_snapshot.map(f=>f.total));
  const rows=DATA.funnel_snapshot.map(f=>{
    const cells=states.map(s=>{const v=f.by_state[s]||0;const al=Math.min(.85,v/(max*.6));
      return `<td class="heat" style="background:rgba(201,118,37,${v?Math.max(.06,al):0})">${v||''}</td>`;}).join('');
    return `<tr><td>${f.stage}</td>${cells}<td class="num" style="font-weight:700">${f.total}</td></tr>`;
  }).join('');
  $('wl-funnel').innerHTML=
    `<thead><tr><th>Stage</th>${states.map(s=>'<th class="num">'+s+'</th>').join('')}<th class="num">Total</th></tr></thead><tbody>${rows}</tbody>`;
  $('wl-funnel-note').textContent='Snapshot of open deals in ActiveCampaign sales pipelines right now. "This month" flow figures are based on deals whose latest activity falls in the reporting month. Handover Complete totals accumulate over time.';
}
function chanTable(id,ch){
  const keys=Object.keys(ch).sort((a,b)=>ch[b].impressions-ch[a].impressions);
  const rows=keys.map(nm=>{const c=ch[nm],g=c.follower_change;
    return `<tr><td style="white-space:nowrap"><span class="chip" style="background:${CHCOL[nm]||'#888'}"></span>${nm[0].toUpperCase()+nm.slice(1)}</td>
    <td class="num">${fmt(c.followers)}</td><td class="num ${g>0?'pos':g<0?'neg':''}">${g>0?'+':''}${fmt(g)}</td>
    <td class="num">${fmt(c.impressions)}</td><td class="num">${fmt(c.engagement)}</td>
    <td class="num">${fmt(c.likes)}</td><td class="num">${fmt(c.saves||null)}</td><td class="num">${fmt(c.messages||null)}</td><td class="num">${fmt(c.profile_views||null)}</td></tr>`;}).join('');
  const t=keys.reduce((acc,nm)=>{const c=ch[nm];['followers','follower_change','impressions','engagement','likes','saves','messages','profile_views'].forEach(f=>acc[f]=(acc[f]||0)+(c[f]||0));return acc;},{});
  $(id).innerHTML=
    `<thead><tr><th>Channel</th><th class="num">Followers</th><th class="num">Growth</th><th class="num">Impr.</th><th class="num">Engage.</th><th class="num">Likes</th><th class="num" title="Saves are reported by Instagram and TikTok only">Saves</th><th class="num" title="Direct messages received (Facebook + Instagram)">Msgs</th><th class="num">Profile visits</th></tr></thead>
    <tbody>${rows}<tr class="totrow"><td>Total</td><td class="num">${fmt(t.followers)}</td><td class="num">${t.follower_change>0?'+':''}${fmt(t.follower_change)}</td><td class="num">${fmt(t.impressions)}</td><td class="num">${fmt(t.engagement)}</td><td class="num">${fmt(t.likes)}</td><td class="num">${fmt(t.saves)}</td><td class="num">${fmt(t.messages)}</td><td class="num">${fmt(t.profile_views)}</td></tr></tbody>`;
}
function campTable(id,camps){
  if(!camps||!camps.length){$(id).innerHTML='<tbody><tr><td style="color:#8a8f96">No campaign sends recorded this month</td></tr></tbody>';return;}
  const rows=camps.sort((a,b)=>b.sends-a.sends).slice(0,10).map(c=>{
    const or_=c.sends?Math.round(c.opens/c.sends*100):0, cr=c.sends?Math.round(c.clicks/c.sends*100):0;
    return `<tr><td>${c.name}</td><td class="num">${fmt(c.sends)}</td><td class="num">${or_}%</td><td class="num">${cr}%</td></tr>`;}).join('');
  $(id).innerHTML=`<thead><tr><th>Campaign</th><th class="num">Sends</th><th class="num">Open rate</th><th class="num">Click rate</th></tr></thead><tbody>${rows}</tbody>`;
}
function lineChart(id,daily,color){
  charts.push(new Chart($(id),{type:'line',
    data:{labels:daily.dates,datasets:[{data:daily.impressions,borderColor:color,backgroundColor:color+'26',fill:true,tension:.35,pointRadius:0,borderWidth:2}]},
    options:{maintainAspectRatio:false,plugins:{legend:{display:false}},
      scales:{x:{ticks:{color:'#8a8f96',maxTicksLimit:8},grid:{display:false}},y:{ticks:{color:'#8a8f96'},grid:{color:'#ececee'}}}}}));
}
function barChart(id,labels,vals,cols,horizontal){
  charts.push(new Chart($(id),{type:'bar',
    data:{labels:labels.map(s=>s[0].toUpperCase()+s.slice(1)),datasets:[{data:vals,backgroundColor:cols}]},
    options:{indexAxis:horizontal?'y':'x',maintainAspectRatio:false,plugins:{legend:{display:false}},
      scales:{x:{ticks:{color:'#8a8f96'},grid:{color:horizontal?'#ececee':'transparent'}},y:{ticks:{color:'#8a8f96'},grid:{color:horizontal?'transparent':'#ececee'}}}}}));
}
function donut(id,types,cols){
  const names=Object.keys(types||{});
  if(!names.length) return;
  charts.push(new Chart($(id),{type:'doughnut',
    data:{labels:names,datasets:[{data:names.map(n=>types[n]),backgroundColor:cols,borderColor:'#fff',borderWidth:3}]},
    options:{maintainAspectRatio:false,cutout:'60%',plugins:{legend:{position:'right',labels:{color:'#2c2f34',boxWidth:11,padding:12}}}}}));
}
