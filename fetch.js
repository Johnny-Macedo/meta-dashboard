const fs = require('fs');
const https = require('https');

const TOKEN = process.env.META_TOKEN;
const AD_ACCOUNT_ID = process.env.AD_ACCOUNT_ID || '1427801045649245';
const BASE_URL = 'https://graph.facebook.com/v21.0';

if (!TOKEN) { console.error('META_TOKEN nao definido'); process.exit(1); }

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) reject(new Error(json.error.message));
          else resolve(json);
        } catch(e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function fetchAll(url) {
  let results = [];
  let next = url;
  while (next) {
    const data = await fetchJSON(next);
    if (data.data) results = results.concat(data.data);
    next = data.paging?.next || null;
  }
  return results;
}

async function main() {
  console.log('Buscando campanhas...');
  const camps = await fetchAll(`${BASE_URL}/act_${AD_ACCOUNT_ID}/campaigns?fields=id,name,status,objective&limit=100&access_token=${TOKEN}`);
  console.log(`${camps.length} campanhas encontradas`);

  const fields = 'spend,impressions,reach,clicks,ctr,cpc,cpm,frequency,actions,cost_per_action_type';
  const result = await Promise.all(camps.map(async c => {
    try {
      const ins = await fetchJSON(`${BASE_URL}/${c.id}/insights?fields=${fields}&date_preset=maximum&access_token=${TOKEN}`);
      const d = ins.data?.[0] || {};
      const actions = d.actions || [];
      const leads = actions.find(a => a.action_type === 'lead')?.value || 0;
      const cpl = d.cost_per_action_type?.find(a => a.action_type === 'lead')?.value || 0;
      return { ...c, spend: +d.spend||0, impressions: +d.impressions||0, reach: +d.reach||0, clicks: +d.clicks||0, ctr: +d.ctr||0, cpc: +d.cpc||0, cpm: +d.cpm||0, frequency: +d.frequency||0, leads: +leads, cpl: +cpl };
    } catch(e) { return { ...c, error: e.message }; }
  }));

  fs.writeFileSync('data.json', JSON.stringify({ generated_at: new Date().toISOString(), account_id: AD_ACCOUNT_ID, campaigns: result }, null, 2));
  console.log('data.json salvo!');
  const totalSpend = result.reduce((s,c) => s + c.spend, 0);
  const totalLeads = result.reduce((s,c) => s + c.leads, 0);
  console.log(`Gasto total: R$ ${totalSpend.toFixed(2)} | Leads: ${totalLeads} | CPL medio: R$ ${totalLeads > 0 ? (totalSpend/totalLeads).toFixed(2) : '0'}`);
}

main().catch(e => { console.error('Erro:', e.message); process.exit(1); });
