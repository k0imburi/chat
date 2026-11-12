export const adRates = {
  northAmerica: {CPM:8,CPC:.7,CPE:.6},
  westernEurope: {CPM:6,CPC:.6,CPE:.2},
  easternEurope: {CPM:3,CPC:.6,CPE:.2},
  asia: {CPM:3.5,CPC:.15,CPE:.1},
  southAmerica: {CPM:2.5,CPC:.15,CPE:.15},
  southeastAsia: {CPM:2,CPC:.1,CPE:.1},
  africa: {CPM:1.5,CPC:.1,CPE:.1},
  other: {CPM:4.5,CPC:.2,CPE:.15},
};
const regions: Array<[keyof typeof adRates,string]> = [
  ['northAmerica','US CA MX GL BM PM'],
  ['westernEurope','AT BE CY DE DK ES FI FR GR IE IT LU MT NL PT SE'],
  ['easternEurope','BG CZ EE HR HU LT LV PL RO SI SK'],
  ['southeastAsia','BN KH ID LA MY MM PH SG TH TL VN'],
  ['asia','AF AM AZ BH BD BT CN GE HK IN IR IQ IL JP JO KZ KP KR KW KG LB MO MV MN NP OM PK PS QA SA LK SY TW TJ TM AE UZ YE'],
  ['southAmerica','AR BO BR CL CO EC FK GF GY PY PE SR UY VE'],
  ['africa','DZ AO BJ BW BF BI CV CM CF TD KM CG CD CI DJ EG GQ ER SZ ET GA GM GH GN GW KE LS LR LY MG MW ML MR MU MA MZ NA NE NG RW ST SN SC SL SO ZA SS SD TZ TG TN UG ZM ZW EH RE YT SH'],
];
export function countryCode(value:string) {
  const text=value.trim();
  const names=new Intl.DisplayNames(['en'],{type:'region'});
  if (/^[A-Za-z]{2}$/.test(text)) return names.of(text.toUpperCase())!==text.toUpperCase()?text.toUpperCase():'';
  for(let a=65;a<=90;a++) for(let b=65;b<=90;b++) {
    const code=String.fromCharCode(a,b);
    if(names.of(code)?.toLowerCase()===text.toLowerCase()) return code;
  }
  return '';
}
// Tiers and CPM bands are the server-side source of truth from
// BudgetAndRange_Impressions.pdf. Restricted markets are intentionally absent.
export const tierCpm = {1:17,2:5.6,3:.51} as const;
export const countryTiers: Record<string,1|2|3> = Object.fromEntries([
  ...'US CA GB IE DE FR NL BE LU AT CH LI MC SE NO DK FI IS AU NZ JP SG KR'.split(' ').map(code=>[code,1]),
  ...'ES IT PT GR MT CY AD SM PL CZ SK SI HU HR RO BG RS ME EE LV LT AE SA QA KW BH OM IL HK TW MY BN BR MX CL AR UY CR PA BS BB TT AG KN TR ZA MU SC'.split(' ').map(code=>[code,2]),
  ...'IN PK BD LK NP BT MV AF ID PH VN TH KH LA MM TL MN KZ UZ KG TJ TM UA MD GE AM AZ AL MK BA XK IQ JO LB YE PS EG MA DZ TN LY SD NG GH SN CI BJ BF CV GM GN GW LR ML MR NE SL TG KE ET TZ UG RW BI SO SS ER DJ KM MG CD CG CM CF TD GQ GA ST AO ZM ZW MZ MW BW NA LS SZ CO PE EC VE BO PY GT HN SV NI BZ GY SR DO JM HT DM GD LC VC FJ PG SB VU WS TO KI TV NR MH FM PW AL MK BA XK ER DZ CR PA BS TT AG KN MU SC DO DM GD LC VC'.split(' ').map(code=>[code,3]),
]);
export const restrictedMarkets = new Set('CN KP IR SY RU BY CU'.split(' '));

export const tierBudgetRanges = {
  1: {min:8.1,max:499.9,lowCpm:9,highCpm:17},
  2: {min:4.5,max:249.9,lowCpm:3,highCpm:5.6},
  3: {min:2.5,max:99.9,lowCpm:.27,highCpm:.51},
} as const;

export function estimateImpressions(dailyBudgetUsd:number,tiers:Array<1|2|3>,bidMultiplier=1) {
  const range={
    lowCpm:Math.min(...tiers.map(tier=>tierBudgetRanges[tier].lowCpm)),
    highCpm:Math.max(...tiers.map(tier=>tierBudgetRanges[tier].highCpm)),
  };
  const budget=Math.max(0,dailyBudgetUsd);
  return {
    minimum:Math.floor(budget/range.highCpm*1000),
    maximum:Math.ceil(budget/range.lowCpm*1000),
    bidMultiplier,
  };
}

export function ratesForCountry(country:string) {
  const code=countryCode(country);
  if(!code||restrictedMarkets.has(code)) throw new Error('This market is not available for advertising.');
  const legacy=adRates[regions.find(([,codes])=>codes.split(' ').includes(code))?.[0]??'other'];
  const tier=countryTiers[code];
  if(!tier) throw new Error('This market is not available for advertising.');
  return {...legacy,CPM:tierCpm[tier]};
}
export function adQuote(countries:string[],metric:'CPM'|'CPC'|'CPE',goal:number,bidMultiplier=1,dailyBudgetUsd?:number,durationDays=1) {
  const normalized=[...new Set(countries.map(countryCode))];
  if(!normalized.length||normalized.some(country=>!country||restrictedMarkets.has(country)||!countryTiers[country]))
    throw new Error('One or more selected markets are not available for advertising.');
  const rates=normalized.map(country=>({country,tier:countryTiers[country],...ratesForCountry(country)}));
  const baseRate=Math.max(...rates.map(row=>row[metric]));
  const rate=baseRate*(metric==='CPM'?1:bidMultiplier);
  const rawBudgetCents=goal*rate*(metric==='CPM'?1/1000:1)*100;
  const dailyBudgetCents=dailyBudgetUsd===undefined?undefined:Math.max(100,Math.round(dailyBudgetUsd*100));
  const budgetCents=dailyBudgetCents===undefined
    ? Math.max(100,Math.ceil(rawBudgetCents-1e-9))
    : dailyBudgetCents*durationDays;
  const tiers=[...new Set(rates.map(row=>row.tier))];
  const budgetRange={
    min:Math.max(...rates.map(row=>tierBudgetRanges[row.tier].min)),
    max:Math.min(...rates.map(row=>tierBudgetRanges[row.tier].max)),
  };
  const impressions=dailyBudgetUsd===undefined||metric!=='CPM'?null:estimateImpressions(dailyBudgetUsd,tiers,bidMultiplier);
  return {currency:'USD',metric,goal,baseRate,rate,bidMultiplier,rates,dailyBudgetCents,budgetCents,budgetRange,impressions,tiers};
}
export function validAdWebsite(value:string) {
  if(!value) return true;
  try {
    const u=new URL(value);
    if(u.protocol!=='https:' || u.username || u.password) return false;
    const host=u.hostname.toLowerCase().replace(/\.$/,'');
    return !['facebook.com','fb.com','fb.me','instagram.com','tiktok.com','twitter.com','x.com','youtube.com','youtu.be','snapchat.com','linkedin.com','threads.net','threads.com','pinterest.com','reddit.com','t.me','telegram.me','wa.me','whatsapp.com','discord.com','discord.gg','linktr.ee'].some(d=>host===d||host.endsWith(`.${d}`));
  } catch {return false;}
}

export function needsAdPolicyReview(...values:string[]) {
  const text=values.join(' ').toLowerCase();
  return /\b(casino|betting|gambling|tobacco|vape|firearm|weapon|porn|adult content|controlled substance)\b/.test(text);
}
