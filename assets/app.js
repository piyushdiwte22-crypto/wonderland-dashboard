/* Shared data + render logic. Each page defines PAGE = 'ov' | 'wl' | 'ob'. */
const WLC='#DB7627', OBC='#8B9B4D', INK='#1D1D1B';
const CHCOL={facebook:'#4d79c9',instagram:'#c94d8f',youtube:'#c9564d',linkedin:'#4da3c9',tiktok:'#7d6ee0',pinterest:'#b3a13c'};
const VANIMG={Solara:'assets/img/van-solara.webp',XTR:'assets/img/van-xtr.webp',Hornet:'assets/img/van-hornet.webp',Amaroo:'assets/img/van-amaroo.webp'};
const fmt=n=>(n==null||isNaN(n))?'–':Math.round(n).toLocaleString('en-AU');
const charts=[]; let DATA=null, DEMO=null, sel=0, PARTIAL=false;
const $=id=>document.getElementById(id);
if(window.Chart){ Chart.defaults.animation=false; Chart.defaults.font.family="Gordita, Calibri, sans-serif"; Chart.defaults.font.size=12; Chart.defaults.color="#707070"; }
const REDUCED=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;

Promise.all([
  fetch('data/report.json?v='+Date.now()).then(r=>r.json()),
  fetch('data/demographics.json?v='+Date.now()).then(r=>r.ok?r.json():null).catch(()=>null)
]).then(([d,demo])=>{
  DATA=d; DEMO=demo;
  const g=$('gen'); if(g) g.textContent='Updated '+d.generated+' · Vista Social + ActiveCampaign';
  // social-only pages (Wonderland Social, Outbound) only offer months that actually have social data
  const socialOnly=(PAGE==='wl-social'||PAGE==='ob');
  const hasSocial=m=>socialOnly?(PAGE==='ob'?!!m.ob:!!m.wl):true;
  sel=d.months.length-1;
  for(let i=d.months.length-1;i>=0;i--){ if(!d.months[i].partial && hasSocial(d.months[i])){ sel=i; break; } }
  if(!hasSocial(d.months[sel])){ for(let i=d.months.length-1;i>=0;i--){ if(hasSocial(d.months[i])){ sel=i; break; } } }
  // month pills go into every holder on the page (#months and/or .months-holder), kept in sync
  const holders=[...document.querySelectorAll('#months, .months-holder')];
  holders.forEach(h=>{
    d.months.forEach((m,i)=>{
      if(!hasSocial(m)) return; // hide pre-April months on social-only pages
      const b=document.createElement('button');
      b.className='pill'+(i===sel?' active':'');
      b.dataset.mi=i;
      b.innerHTML=m.label.replace(/\((.*)\)/,'<span class="part">($1)</span>');
      b.onclick=()=>{sel=i;document.querySelectorAll('.pill').forEach(p=>p.classList.toggle('active',+p.dataset.mi===sel));render();};
      h.appendChild(b);
    });
  });
  // WL sub-tabs (Social media / CRM & sales)
  document.querySelectorAll('.subtab').forEach(t=>t.onclick=()=>{
    document.querySelectorAll('.subtab').forEach(x=>x.classList.toggle('active',x===t));
    document.querySelectorAll('.subpane').forEach(p=>p.classList.remove('show'));
    const pane=document.getElementById('pane-'+t.dataset.pane);
    if(pane) pane.classList.add('show');
    render(); // synchronous rebuild so charts size correctly in the revealed pane
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
  if(PARTIAL) return '<div class="d na">partial month so far</div>';
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
  const NOSOCIAL=!m.wl;
  const EMPTY={totals:{},channels:{},daily:{dates:[],impressions:[],engagement:[]}};
  const w=m.wl||EMPTY,o=m.ob||EMPTY,a=m.ac, pw=(p&&p.wl)||null,po=(p&&p.ob)||null,pa=p&&p.ac;
  PARTIAL=!!m.partial;
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
      k(fmt(a.new_leads),'New leads',delta(a.new_leads,pa&&pa.new_leads));
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
    const chShare=wlCh&&w.totals.impressions?Math.round(wlCh[1].impressions/w.totals.impressions*100):0;
    const topPost=(w.top_posts||[])[0];
    // interpretive deltas vs prior month
    const impCur=w.totals.impressions, impPrev=pw&&pw.totals.impressions;
    const impMove=(impPrev&&!PARTIAL)?` (${impCur>=impPrev?'up':'down'} ${Math.abs(Math.round((impCur-impPrev)/impPrev*100))}% on ${p.label.split(' (')[0]})`:'';
    const dep2lead=leads?Math.round(deposits/leads*100):0;
    const heads=[];
    heads.push(`<li><strong>Wonderland RV</strong> reached ${fmt(impCur)} impressions${impMove}. ${wlCh?wlCh[0][0].toUpperCase()+wlCh[0].slice(1)+' drove '+chShare+'% of reach':''}${w.totals.engagement_rate?`, at a ${w.totals.engagement_rate}% engagement rate`:''}.</li>`);
    if(topPost) heads.push(`<li><strong>Top post:</strong> "${topPost.msg}" (${topPost.network} ${topPost.type}) — ${fmt(topPost.impressions)} impressions, ${fmt(topPost.shares)} shares, ${fmt(topPost.saves)} saves. Reels with saves are the clearest buying-intent signal.</li>`);
    heads.push(`<li class="ob"><strong>Outbound RVs</strong> reached ${fmt(o.totals.impressions)} impressions, added ${fmt(o.totals.follower_change)} followers, at ${o.totals.engagement_rate}% engagement${o.totals.engagement_rate>w.totals.engagement_rate?' — punching above Wonderland on a smaller audience':''}.</li>`);
    heads.push(`<li class="crm"><strong>Sales:</strong> ${fmt(leads)} leads${topState&&topState[0]!=='No state recorded'?' ('+topState[0]+' leading with '+fmt(topState[1])+')':''}, ${fmt(deposits)} deposits, ${fmt(handovers)} handovers${dep2lead?' — '+dep2lead+'% of this month\\u2019s leads reached a deposit stage':''}.</li>`);
    // conditional flags — surface things worth a director's attention
    const flags=[];
    if(!PARTIAL && !NOSOCIAL){
      if(w.totals.engagement_rate<0.5) flags.push(`Wonderland engagement rate is ${w.totals.engagement_rate}% — below a healthy ~1%; reach is strong but content isn\\u2019t pulling interaction. Worth testing more Reels/questions.`);
      if(pw&&!PARTIAL&&(pw.totals.engagement_rate-w.totals.engagement_rate)>0.3) flags.push(`Engagement rate fell ${(pw.totals.engagement_rate-w.totals.engagement_rate).toFixed(2)}pt vs ${p.label.split(' (')[0]} — check what changed in the content mix.`);
    }
    const em=a.emails||{};
    if(em.sent && em.avg_open_pct<40) flags.push(`Email open rate ${em.avg_open_pct}% is below the ~40% the list usually does — subject lines or send timing may need a look.`);
    if(handovers>0 && deposits===0) flags.push(`${fmt(handovers)} handovers but 0 deposits recorded this month — deposits advance fast through the pipeline, so this reflects the counting method, not a stall (see CRM \\u2192 Sales).`);
    $('ov-headlines').innerHTML=heads.join('')+flags.map(f=>`<li style="border-left-color:#b1442f"><strong>Worth a look:</strong> ${f}</li>`).join('');
  }

  if($('wl-social-kpis')){
   if(NOSOCIAL){
    ['wl-social-kpis','wl-table','wl-posts','wl-audience'].forEach(id=>{if($(id))$(id).innerHTML='';});
    if($('wl-ov')) $('wl-ov').innerHTML='<div class="pendingcard" style="grid-column:1/-1">'+(m.social_note||'Social analytics is not available for this month.')+' The CRM &amp; Sales page has full data from January.</div>';
   } else {
    if($('wl-ov')) $('wl-ov').innerHTML=
      k(fmt(w.totals.impressions),'Impressions',delta(w.totals.impressions,pw&&pw.totals.impressions),'acc')+
      k('+'+fmt(w.totals.follower_change),'New followers',delta(w.totals.follower_change,pw&&pw.totals.follower_change))+
      k(w.totals.engagement_rate+'%','Engagement rate','')+
      k(fmt(w.totals.saves||null),'Saves','')+
      k(fmt(w.totals.messages||null),'Messages','');
    goalBand('wl-social-kpis',w.totals,pw&&pw.totals);
    lineChart('wl-line',w.daily,WLC);
    barChart('wl-bars',Object.keys(w.channels),Object.keys(w.channels).map(c=>w.channels[c].follower_change),Object.keys(w.channels).map(c=>CHCOL[c]));
    chanTable('wl-table',w.channels);
    postsTable('wl-posts',w.top_posts);
    audience(w);
    socialTrend('wl-trend');
   }
  }
  if($('wl-email-kpis')){
    if($('crm-ov')) $('crm-ov').innerHTML=
      k(fmt(a.new_leads),'New leads',delta(a.new_leads,pa&&pa.new_leads),'acc')+
      k(fmt(leads),'New sales deals',delta(leads,pleads))+
      k(fmt(a.configurator_leads),'Configurator leads',delta(a.configurator_leads,pa&&pa.configurator_leads))+
      k(fmt(deposits),'Deposits',delta(deposits,pa&&sum(pa.deposits_flow)))+
      k(fmt(handovers),'Handovers',delta(handovers,pa&&sum(pa.handovers_flow)));
    /* Email marketing */
    const em=a.emails||{}, pem=pa&&pa.emails||{};
    $('wl-email-kpis').innerHTML=
      k(fmt(em.sent),'Emails sent · broadcasts',delta(em.sent,pem.sent),'acc')+
      k((em.avg_open_pct||0)+'%','Average open rate',pem.sent?`<div class="d ${em.avg_open_pct>=pem.avg_open_pct?'up':'down'}">${em.avg_open_pct>=pem.avg_open_pct?'▲':'▼'} ${Math.abs(em.avg_open_pct-pem.avg_open_pct).toFixed(1)} pts vs prior</div>`:'<div class="d na">baseline month</div>')+
      k((em.avg_click_pct||0)+'%','Average click rate',pem.sent?`<div class="d ${em.avg_click_pct>=pem.avg_click_pct?'up':'down'}">${em.avg_click_pct>=pem.avg_click_pct?'▲':'▼'} ${Math.abs(em.avg_click_pct-pem.avg_click_pct).toFixed(1)} pts vs prior</div>`:'<div class="d na">baseline month</div>')+
      k(fmt(em.broadcast_count),'Broadcasts sent','')+
      k(fmt(em.automated_sends),'Automated sends','<div class="d na">confirmations + follow-ups</div>','dark');
    campTable('wl-camps',em.broadcasts||a.campaigns);
    /* Leads acquisition */
    $('wl-crm-kpis').innerHTML=
      k(fmt(a.new_leads),'New leads · state-verified',delta(a.new_leads,pa&&pa.new_leads)+((a.excluded_no_state||a.excluded_internal)?'<div class="d na">'+fmt(a.new_contacts)+' created, '+((a.excluded_no_state||0)+(a.excluded_internal||0))+' excluded (no-state + staff)</div>':''),'acc')+
      k(fmt(leads),'New sales deals',delta(leads,pleads))+
      k(fmt(a.ad_enquiries),'Meta / Google ad enquiries',delta(a.ad_enquiries,pa&&pa.ad_enquiries))+
      k(fmt(sum(a.brochures_by_model)),'Brochure downloads',delta(sum(a.brochures_by_model),pa&&sum(pa.brochures_by_model)))+
      k(fmt(DATA.total_contacts_now),'Total CRM contacts','<div class="d na">live database size</div>','dark');
    const cst=a.contacts_by_state||a.leads_by_state||{};
    const stCol=s=>/no state/i.test(s)?'#b9bcc2':WLC;
    barChart('wl-states',Object.keys(cst),Object.values(cst),Object.keys(cst).map(stCol),true);
    const dst=a.deals_by_state||a.leads_by_state||{};
    barChart('wl-dealstates',Object.keys(dst),Object.values(dst),Object.keys(dst).map(()=>INK),true);
    donut('wl-sources',a.deals_by_type,['#C97625','#1D1D1B','#8B9B4D','#4d79c9','#c94d8f','#999']);
    vanGrid('wl-brochures',a.brochures_by_model);
    /* Configurator — strongest leads */
    const cf=DATA.configurator||{};
    const cfgLeads=a.configurator_leads, pcfg=pa&&pa.configurator_leads;
    const committed=(cf.conversion&&(cf.conversion['Deposit+ (committed)']||0)+(cf.conversion['Won / Sold']||0))||0;
    const quoted=(cf.conversion&&cf.conversion['Quote sent']||0);
    $('wl-cfg-kpis').innerHTML=
      k(fmt(cfgLeads),'Configurator leads this month',delta(cfgLeads,pcfg),'acc')+
      k(fmt(cf.sessions_alltime),'Configurations started · all time','<div class="d na">Build Your Caravan tool</div>','dark')+
      k(fmt(cf.submitters_alltime),'Submitted with contact details','<div class="d na">high-intent leads captured</div>')+
      k(fmt(quoted+committed),'Reached quote or deposit','<div class="d na">'+fmt(committed)+' committed to a build</div>')+
      k(fmt(cf.sessions_alltime?Math.round(cf.submitters_alltime/cf.sessions_alltime*100):0)+'%','Start → submit rate','<div class="d na">tool completion</div>','dark');
    if(cf.conversion){
      const order=['Won / Sold','Deposit+ (committed)','Quote sent','In conversation','Back to market','New / other'];
      const names=order.filter(n=>cf.conversion[n]!=null);
      barChart('wl-cfg-conv',names,names.map(n=>cf.conversion[n]),names.map(n=>n.includes('Won')||n.includes('Deposit')?'#2e7d52':n.includes('Quote')?WLC:n.includes('Back')?'#b1442f':INK),true);
    }
    if(cf.by_state) barChart('wl-cfg-state',Object.keys(cf.by_state),Object.values(cf.by_state),Object.keys(cf.by_state).map(s=>/no state/i.test(s)?'#b9bcc2':WLC),true);
    $('wl-cfg-model').innerHTML='<div class="dqcard" style="margin-top:12px"><b>Model breakdown — coming, note for now:</b> the configurator <em>does</em> capture the chosen model (there is a "Model" field on the Build Your Caravan form). It just isn’t mapped into the ActiveCampaign feed yet, so the model never reaches the CRM and a Solara / Amaroo / Hornet / XTR split can’t be shown here yet. It’s a small, confirmed fix — map the form’s "Model" field to AC custom field 81 in the configurator feed — <b>flagged, not changed</b>. Once it’s wired, this section fills in automatically.</div>';

    /* Sales & conversion (reconciled) */
    $('wl-flow-kpis').innerHTML=
      k(fmt(deposits),'Deposits received this month',flowStates(a.deposits_flow),'acc')+
      k(fmt(handovers),'Handovers completed this month',flowStates(a.handovers_flow),'dark')+
      k(fmt((snap('Deposit Received')||{}).total),'Deposits currently held','<div class="d na">pipeline snapshot</div>')+
      k(fmt(((snap('In Production')||{}).total||0)+((snap('Order Finalised')||{}).total||0)),'Orders in build','<div class="d na">finalised + in production</div>')+
      k(fmt((snap('Handover Booked / Ready')||{}).total),'Ready / booked for handover','<div class="d na">pipeline snapshot</div>');
    $('wl-flow-detail').innerHTML=
      `<div class="flownames"><h4>Deposits · chassis-verified</h4>${(a.deposits_names||[]).map(n=>'<span class="tag">'+n+'</span>').join('')||'<span class="footnote">none this month</span>'}</div>`+
      `<div class="flownames"><h4>Handovers · chassis-verified</h4>${(a.handovers_names||[]).map(n=>'<span class="tag">'+n+'</span>').join('')||'<span class="footnote">none this month</span>'}</div>`;
    funnelTable();
    if($('wl-flow-note')) $('wl-flow-note').innerHTML='Deposits and handovers count only chassis-numbered (WL####) deals, so mis-staged lead records cannot inflate them. "Deposits received this month" counts deals sitting at the Deposit Received stage — deals advance to build quickly, so this is a conservative floor and undercounts true deposits; "Handovers completed" counts distinct vans reaching Handover Complete this month.';
    /* THE READ — strategic insight */
    const conv=(snap('In Conversation')||{}).total||0, quo=(snap('Quote Sent')||{}).total||0;
    const ratio=quo?Math.round(conv/quo):conv;
    const topC=Object.entries(cst).filter(x=>x[0]!=='No state recorded').sort((x,y)=>y[1]-x[1])[0];
    $('wl-read').innerHTML=`<b>The read</b>${fmt(conv)} deals are stuck in In Conversation against just ${fmt(quo)} at Quote Sent — a ${ratio}:1 backlog. That middle of the funnel is the single biggest lever this month: the question for sales is whether quotes are slow to go out, or leads are stalling before they ask for one. ${topC?topC[0]+' generated the most leads ('+fmt(topC[1])+'), so that\\u2019s where quote follow-up will move the most metal.':''}`;
    /* Data quality watch — always render */
    const dq=DATA.data_quality;
    if(dq && (dq.configurator||dq.mis_staged_money_stage)){
      const c=dq.configurator||{};
      $('wl-dq').innerHTML=`<div class="dqcard"><b>Known CRM data issues — flagged for the team (the numbers on this page are already corrected for them):</b><ul>`+
        (c.automation39_entries?`<li><b>Configurator automation over-firing</b> [owner: AC admin / agency · fix: tighten automation 39 trigger]: "Configurator &gt; Create Deal" ran ${fmt(c.automation39_entries)} times against ~${fmt(c.real_submissions_alltime_approx)} real submissions, creating ${fmt(c.deals_total)} deals incl. ${fmt(c.no_name_deals)} no-name and ${fmt(c.duplicate_deals)} duplicates. A clean-up list of exact deal IDs has been prepared.</li>`:'')+
        (dq.mis_staged_money_stage?`<li><b>${fmt(dq.mis_staged_money_stage.count)} lead records mis-staged</b> in money stages without a chassis, e.g. ${(dq.mis_staged_money_stage.sample||[]).slice(0,3).map(s=>'"'+s+'"').join(', ')} [action: move back to an early stage].</li>`:'')+
        `<li><b>Configurator model not synced to AC</b> [fix: map the form "Model" field to AC field 81] — blocks the Solara/Amaroo/Hornet/XTR configurator split.</li>`+
        `</ul></div>`;
    } else {
      $('wl-dq').innerHTML='<div class="dqcard" style="border-color:#bcd6bf;background:#f2f8f3"><b style="color:#2e6b3e">No new CRM data issues flagged this month.</b> Chassis-verified counting and state-fallback logic are in place; the configurator model-sync fix is still outstanding.</div>';
    }
  }

  if($('ho-board')){
    const board=DATA.delivery_board||[];
    const pipeTotal=board.reduce((s,b)=>s+b.count,0);
    const ready=(board.find(b=>/Ready/.test(b.stage))||{}).count||0;
    $('ho-kpis').innerHTML=
      k(fmt(handovers),'Handovers completed this month',flowStates(a.handovers_flow),'acc')+
      k(fmt(deposits),'Deposits received this month',flowStates(a.deposits_flow),'dark')+
      k(fmt(pipeTotal),'Vans in the delivery pipeline','<div class="d na">chassis-verified, live</div>')+
      k(fmt(ready),'Ready or booked for handover','<div class="d na">next out the door</div>')+
      k(fmt((board.find(b=>b.stage==='In Production')||{}).count)+' + '+fmt((board.find(b=>b.stage==='Order Finalised')||{}).count),'In production + order finalised','<div class="d na">the build queue</div>');
    $('ho-detail').innerHTML=
      `<div class="flownames"><h4>Handed over this month</h4>${(a.handovers_names||[]).map(n=>'<span class="tag">'+n+'</span>').join('')||'<span class="footnote">none this month</span>'}</div>`+
      `<div class="flownames"><h4>Deposits taken this month</h4>${(a.deposits_names||[]).map(n=>'<span class="tag">'+n+'</span>').join('')||'<span class="footnote">none this month</span>'}</div>`;
    $('ho-board').innerHTML=board.map(b=>
      `<div class="bcol"><div class="bh"><div class="bt">${b.stage}</div><div class="bc">${b.count}</div></div>
       <div class="bi">${b.items.map(i=>`<div class="vanchip"><span class="ch">${i.chassis}</span><span style="flex:1;margin:0 8px;color:#5c6167;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${i.name||''}</span><span class="st ${i.state}">${i.state}</span></div>`).join('')||'<div class="footnote">empty</div>'}</div></div>`).join('');
    // trend across all months
    const labels=DATA.months.map(x=>x.label.split(' ')[0]);
    charts.push(new Chart($('ho-trend'),{type:'bar',
      data:{labels,datasets:[
        {label:'Handovers',data:DATA.months.map(x=>sum(x.ac.handovers_flow)),backgroundColor:INK},
        {label:'Deposits',data:DATA.months.map(x=>sum(x.ac.deposits_flow)),backgroundColor:WLC}]},
      options:{maintainAspectRatio:false,plugins:{legend:{position:'top',labels:{color:'#2c2f34',boxWidth:12}}},
        scales:{x:{ticks:{color:'#707070'},grid:{display:false}},y:{ticks:{color:'#707070',precision:0},grid:{color:'#ececee'}}}}}));
    const hs=a.handovers_flow||{};
    barChart('ho-states',Object.keys(hs).length?Object.keys(hs):['—'],Object.keys(hs).length?Object.values(hs):[0],Object.keys(hs).map(()=>WLC),true);
    $('ho-read').innerHTML=`<b>The read</b>${fmt(pipeTotal)} chassis-numbered vans are on the delivery journey right now: ${board.map(b=>b.count+' at '+b.stage.toLowerCase()).join(', ')}. ${fmt(handovers)} handed over in ${m.label.split(' (')[0]}${ready?', and '+fmt(ready)+' are ready or booked, so next month\\u2019s handover number is already visible':''}.`;
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
  if(!camps||!camps.length){$(id).innerHTML='<tbody><tr><td style="color:#707070">No campaign sends recorded this month</td></tr></tbody>';return;}
  const rows=camps.sort((a,b)=>b.sends-a.sends).slice(0,10).map(c=>{
    const or_=c.sends?Math.round(c.opens/c.sends*100):0, cr=c.sends?Math.round(c.clicks/c.sends*100):0;
    return `<tr><td>${c.name}</td><td class="num">${fmt(c.sends)}</td><td class="num">${or_}%</td><td class="num">${cr}%</td></tr>`;}).join('');
  $(id).innerHTML=`<thead><tr><th>Campaign</th><th class="num">Sends</th><th class="num">Open rate</th><th class="num">Click rate</th></tr></thead><tbody>${rows}</tbody>`;
}
function socialTrend(id){
  const el=$(id); if(!el) return;
  const ms=DATA.months.filter(m=>m.wl);
  const labels=ms.map(m=>m.label.split(' ')[0].slice(0,3));
  charts.push(new Chart(el,{type:'bar',
    data:{labels,datasets:[
      {type:'bar',label:'Impressions',data:ms.map(m=>m.wl.totals.impressions),backgroundColor:WLC+'cc',yAxisID:'y',order:2},
      {type:'line',label:'Total followers',data:ms.map(m=>m.wl.totals.followers),borderColor:INK,backgroundColor:INK,borderWidth:2,pointRadius:3,yAxisID:'y1',order:1,tension:.3}
    ]},
    options:{maintainAspectRatio:false,plugins:{legend:{position:'top',labels:{color:'#2c2f34',boxWidth:12}}},
      scales:{x:{grid:{display:false}},
        y:{position:'left',ticks:{callback:v=>v>=1000?(v/1000)+'k':v},grid:{color:'#ececee'},title:{display:true,text:'Impressions'}},
        y1:{position:'right',grid:{display:false},title:{display:true,text:'Followers'}}}}}));
}
function lineChart(id,daily,color){
  charts.push(new Chart($(id),{type:'line',
    data:{labels:daily.dates,datasets:[{data:daily.impressions,borderColor:color,backgroundColor:color+'26',fill:true,tension:.35,pointRadius:0,borderWidth:2}]},
    options:{maintainAspectRatio:false,plugins:{legend:{display:false}},
      scales:{x:{ticks:{color:'#707070',maxTicksLimit:8},grid:{display:false}},y:{ticks:{color:'#707070'},grid:{color:'#ececee'}}}}}));
}
function barChart(id,labels,vals,cols,horizontal){
  charts.push(new Chart($(id),{type:'bar',
    data:{labels:labels.map(s=>s[0].toUpperCase()+s.slice(1)),datasets:[{data:vals,backgroundColor:cols}]},
    options:{indexAxis:horizontal?'y':'x',maintainAspectRatio:false,plugins:{legend:{display:false}},
      scales:{x:{ticks:{color:'#707070'},grid:{color:horizontal?'#ececee':'transparent'}},y:{ticks:{color:'#707070'},grid:{color:horizontal?'transparent':'#ececee'}}}}}));
}
function donut(id,types,cols){
  const names=Object.keys(types||{});
  if(!names.length) return;
  charts.push(new Chart($(id),{type:'doughnut',
    data:{labels:names,datasets:[{data:names.map(n=>types[n]),backgroundColor:cols,borderColor:'#fff',borderWidth:3}]},
    options:{maintainAspectRatio:false,cutout:'60%',plugins:{legend:{position:'right',labels:{color:'#2c2f34',boxWidth:11,padding:12}}}}}));
}
