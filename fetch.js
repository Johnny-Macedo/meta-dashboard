const fs = require('fs');
const https = require('https');

const TOKEN = process.env.META_TOKEN;
const AD_ACCOUNT_ID = process.env.AD_ACCOUNT_ID || '1427801045649245';
const BASE = 'https://graph.facebook.com/v21.0';

if (!TOKEN) { console.error('META_TOKEN nao definido'); process.exit(1); }

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(data);
          if (j.error) reject(new Error(j.error.message));
          else resolve(j);
        } catch(e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function fetchAll(url) {
  let results = [], next = url;
  while (next) {
    const d = await fetchJSON(next);
    if (d.data) results = results.concat(d.data);
    next = d.paging?.next || null;
  }
  return results;
}

function extractMetrics(d) {
  const ins = d?.data?.[0] || {};
  const actions = ins.actions || [];
  const cpa = ins.cost_per_action_type || [];
  const leads = +actions.find(a => a.action_type === 'lead')?.value || 0;
  const cpl = +cpa.find(a => a.action_type === 'lead')?.value || 0;
  return {
    spend: +ins.spend || 0,
    impressions: +ins.impressions || 0,
    reach: +ins.reach || 0,
    clicks: +ins.clicks || 0,
    ctr: +ins.ctr || 0,
    cpc: +ins.cpc || 0,
    cpm: +ins.cpm || 0,
    frequency: +ins.frequency || 0,
    leads, cpl
  };
}

async function getInsights(id, extra = '') {
  const fields = 'spend,impressions,reach,clicks,ctr,cpc,cpm,frequency,actions,cost_per_action_type';
  try {
    return await fetchJSON(`${BASE}/${id}/insights?fields=${fields}&date_preset=maximum${extra}&access_token=${TOKEN}`);
  } catch(e) { return { data: [] }; }
}

async function main() {
  console.log('Buscando campanhas...');
  const campaigns = await fetchAll(`${BASE}/act_${AD_ACCOUNT_ID}/campaigns?fields=id,name,status,objective&limit=100&access_token=${TOKEN}`);
  console.log(`${campaigns.length} campanhas`);

  const campaignsData = await Promise.all(campaigns.map(async c => {
    const ins = await getInsights(c.id);
    return { ...c, ...extractMetrics(ins) };
  }));

  console.log('Buscando adsets...');
  const adsets = await fetchAll(`${BASE}/act_${AD_ACCOUNT_ID}/adsets?fields=id,name,status,campaign_id,daily_budget,lifetime_budget,optimization_goal,targeting&limit=200&access_token=${TOKEN}`);
  console.log(`${adsets.length} adsets`);

  const adsetsData = await Promise.all(adsets.map(async a => {
    const ins = await getInsights(a.id);
    return { ...a, ...extractMetrics(ins) };
  }));

  console.log('Buscando anuncios...');
  const ads = await fetchAll(`${BASE}/act_${AD_ACCOUNT_ID}/ads?fields=id,name,status,campaign_id,adset_id,creative{name,title,body,image_url}&limit=200&access_token=${TOKEN}`);
  console.log(`${ads.length} anuncios`);

  const adsData = await Promise.all(ads.map(async a => {
    const ins = await getInsights(a.id);
    return { ...a, ...extractMetrics(ins) };
  }));

  console.log('Buscando breakdowns...');
  const ageGender = await Promise.all(campaignsData.filter(c => c.spend > 0).slice(0, 5).map(async c => {
    try {
      const d = await fetchJSON(`${BASE}/${c.id}/insights?fields=spend,impressions,clicks,ctr,cpc,actions,cost_per_action_type&date_preset=maximum&breakdowns=age,gender&access_token=${TOKEN}`);
      return { campaign_id: c.id, campaign_name: c.name, data: d.data || [] };
    } catch(e) { return { campaign_id: c.id, campaign_name: c.name, data: [] }; }
  }));

  const placement = await Promise.all(campaignsData.filter(c => c.spend > 0).slice(0, 5).map(async c => {
    try {
      const d = await fetchJSON(`${BASE}/${c.id}/insights?fields=spend,impressions,clicks,ctr,cpc,actions,cost_per_action_type&date_preset=maximum&breakdowns=publisher_platform,platform_position&access_token=${TOKEN}`);
      return { campaign_id: c.id, campaign_name: c.name, data: d.data || [] };
    } catch(e) { return { campaign_id: c.id, campaign_name: c.name, data: [] }; }
  }));

  const output = {
    generated_at: new Date().toISOString(),
    account_id: AD_ACCOUNT_ID,
    summary: {
      total_campaigns: campaigns.length,
      active_campaigns: campaigns.filter(c => c.status === 'ACTIVE').length,
      total_spend: campaignsData.reduce((s, c) => s + c.spend, 0),
      total_leads: campaignsData.reduce((s, c) => s + c.leads, 0),
      total_impressions: campaignsData.reduce((s, c) => s + c.impressions, 0),
      total_clicks: campaignsData.reduce((s, c) => s + c.clicks, 0),
    },
    campaigns: campaignsData,
    adsets: adsetsData,
    ads: adsData,
    breakdowns: { age_gender: ageGender, placement }
  };

  const ts = output.summary.total_spend;
  const tl = output.summary.total_leads;
  output.summary.avg_cpl = tl > 0 ? ts / tl : 0;
  output.summary.avg_ctr = campaignsData.filter(c=>c.spend>0).reduce((s,c)=>s+c.ctr,0) / (campaignsData.filter(c=>c.spend>0).length || 1);

  fs.writeFileSync('data.json', JSON.stringify(output, null, 2));
  console.log('data.json salvo!');
  console.log(`Gasto: R$ ${ts.toFixed(2)} | Leads: ${tl} | CPL: R$ ${output.summary.avg_cpl.toFixed(2)}`);
}

main().catch(e => { console.error('Erro:', e.message); process.exit(1); });
