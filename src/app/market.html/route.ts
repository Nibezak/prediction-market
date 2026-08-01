import type { NextRequest } from 'next/server'
import type { SupportedLocale } from '@/i18n/locales'
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from '@/i18n/locales'
import { EventRepository } from '@/lib/db/queries/event'
import resolveSiteUrl from '@/lib/site-url'
import { DEFAULT_THEME_SITE_LOGO_IMAGE_PATH } from '@/lib/theme-site-identity'
import { loadRuntimeThemeState } from '@/lib/theme-settings'

async function resolveInitialCategoryMarketSlug(categorySlug: string, locale: SupportedLocale) {
  if (!categorySlug) return ''
  try {
    const { data, error } = await EventRepository.listEventMarketSlugs({
      tag: categorySlug,
      locale,
      limit: 1,
    })
    return error ? '' : (data?.[0] ?? '')
  }
  catch (error) {
    console.error('Failed to resolve initial category market slug', error)
    return ''
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const requestedMarketSlug = searchParams.get('market')?.trim() ?? ''
  const eventSlug = searchParams.get('event')?.trim() ?? ''
  const categorySlug = searchParams.get('category')?.trim() ?? searchParams.get('tag')?.trim() ?? ''
  const requestedLocale = searchParams.get('locale')?.trim() ?? ''
  const locale = SUPPORTED_LOCALES.includes(requestedLocale as SupportedLocale)
    ? requestedLocale as SupportedLocale
    : DEFAULT_LOCALE
  const theme = searchParams.get('theme') === 'dark' ? 'dark' : 'light'
  const features = new Set((searchParams.get('features') ?? '').split(',').map(value => value.trim()))
  const showVolume = features.has('volume')
  const showChart = features.has('chart')
  const showFilters = showChart && features.has('filters')
  const initialMarketSlug = requestedMarketSlug || await resolveInitialCategoryMarketSlug(categorySlug, locale)
  const siteUrl = resolveSiteUrl(process.env).replace(/\/$/, '')
  const runtimeTheme = await loadRuntimeThemeState()
  const siteName = runtimeTheme.site.name?.trim() || 'Slimefish'
  const siteLogoUrl = runtimeTheme.site.logoUrl?.trim() || DEFAULT_THEME_SITE_LOGO_IMAGE_PATH
  const fallbackLogoUrl = `${siteUrl}${DEFAULT_THEME_SITE_LOGO_IMAGE_PATH}`

  const html = `<!doctype html>
<html lang="en" data-theme="${theme}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    :root { color-scheme: light; --bg:#fff; --text:#111827; --muted:#6b7280; --line:#e5e7eb; --yes:#10b981; --no:#ef4444; }
    html[data-theme="dark"] { color-scheme:dark; --bg:#111827; --text:#f9fafb; --muted:#9ca3af; --line:#374151; }
    * { box-sizing:border-box; }
    html,body { margin:0; min-height:100%; background:transparent; font-family:Arial,sans-serif; }
    body { padding:8px; display:flex; align-items:center; justify-content:center; }
    .card { width:100%; max-width:400px; min-height:164px; overflow:hidden; border:1px solid var(--line); border-radius:10px; background:var(--bg); color:var(--text); padding:16px; display:grid; gap:14px; }
    .top { display:grid; grid-template-columns:48px minmax(0,1fr) 78px; align-items:center; gap:12px; }
    .market-icon { width:48px; height:48px; border-radius:8px; object-fit:cover; background:var(--line); }
    .title { font-size:16px; font-weight:700; line-height:1.25; overflow-wrap:anywhere; }
    .chance { text-align:center; font-size:22px; font-weight:800; color:var(--yes); }
    .chance small { display:block; color:var(--muted); font-size:11px; font-weight:500; }
    .chart-wrap { display:none; min-height:112px; border-block:1px solid var(--line); padding:10px 0; }
    .chart-wrap.visible { display:block; }
    svg { width:100%; height:100%; overflow:visible; }
    .grid { stroke:var(--line); stroke-width:1; stroke-dasharray:3 4; }
    .series { fill:none; stroke-width:3; stroke-linecap:round; stroke-linejoin:round; }
    .legend { display:flex; flex-wrap:wrap; gap:4px 10px; margin-top:3px; color:var(--muted); font-size:9px; }
    .legend-item { display:flex; align-items:center; gap:4px; min-width:0; }
    .legend-dot { width:7px; height:7px; border-radius:999px; flex:none; }
    .legend-label { max-width:92px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .axis { fill:var(--muted); font-size:9px; }
    .bottom { display:flex; align-items:center; gap:8px; min-width:0; }
    .brand-logo { width:24px; height:24px; border-radius:5px; object-fit:contain; }
    .brand { font-size:14px; font-weight:700; }
    .volume { margin-left:auto; color:var(--muted); font-size:12px; white-space:nowrap; }
    .view { border:0; border-radius:7px; padding:9px 11px; background:#f3f4f6; color:#111827; font-weight:700; text-decoration:none; white-space:nowrap; }
    .filters { display:none; gap:6px; justify-content:flex-end; }
    .filters.visible { display:flex; }
    .filter { border:1px solid var(--line); border-radius:5px; background:transparent; color:var(--muted); padding:3px 7px; font-size:10px; }
    .filter.active { color:var(--text); border-color:var(--yes); }
    .error { padding:24px; text-align:center; color:var(--muted); }
  </style>
</head>
<body>
  <main id="widget" class="card" aria-live="polite"><div class="error">Loading market...</div></main>
  <script>
    (() => {
      const config = ${JSON.stringify({
        initialMarketSlug,
        eventSlug,
        siteName,
        siteLogoUrl,
        fallbackLogoUrl,
        siteUrl,
        showVolume,
        showChart,
        showFilters,
        locale,
      })};
      const root = document.getElementById('widget');
      const parse = value => { try { return JSON.parse(value || '[]'); } catch { return []; } };
      const money = value => new Intl.NumberFormat(undefined, { notation:'compact', maximumFractionDigits:1 }).format(Number(value || 0));
      const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
      const safeImage = (url, fallback) => escapeHtml(url || fallback);
      const seriesColors = ['#16a34a','#f97316','#2563eb','#a855f7','#e11d48','#0891b2','#ca8a04','#4f46e5','#db2777','#65a30d'];

      async function loadMarket() {
        let response;
        if (config.initialMarketSlug) response = await fetch('/api/embed/markets/slug/' + encodeURIComponent(config.initialMarketSlug), { cache:'no-store' });
        else if (config.eventSlug) response = await fetch('/api/embed/events/slug/' + encodeURIComponent(config.eventSlug), { cache:'no-store' });
        else throw new Error('No market selected');
        if (!response.ok) throw new Error('Market unavailable');
        const payload = await response.json();
        return payload.markets
          ? Object.assign(payload.markets[0] || {}, { eventTitle: payload.title, eventMarkets: payload.markets })
          : payload;
      }

      async function loadHistories(tokenIds, currentPrices) {
        const fallback = Object.fromEntries(tokenIds.map((tokenId,index) => [tokenId,[{t:Date.now()-86400000,p:currentPrices[index] ?? .5},{t:Date.now(),p:currentPrices[index] ?? .5}]]));
        if (!tokenIds.length) return fallback;
        try {
          const response = await fetch('/api/slimefish-backend/market-stats', {
            method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({markets:tokenIds, fidelity:60}),
          });
          const payload = response.ok ? await response.json() : {};
          return Object.fromEntries(tokenIds.map((tokenId,index) => {
            const points = Array.isArray(payload.history?.[tokenId]) ? payload.history[tokenId] : [];
            return [tokenId,points.length ? points : fallback[tokenId]];
          }));
        } catch {
          return fallback;
        }
      }

      function drawChart(histories, tokenIds, labels) {
        const chart = document.getElementById('chart');
        if (!chart) return;
        const series = tokenIds.map((tokenId,index) => ({tokenId,label:labels[index] || ('Outcome '+(index+1)),values:(histories[tokenId] || []).map(point => Math.max(0,Math.min(1,Number(point.p))))})).filter(item => item.values.length);
        const maxPoints = Math.max(0,...series.map(item => item.values.length));
        for (let pointIndex=0; pointIndex<maxPoints; pointIndex+=1) {
          const total = series.reduce((sum,item) => sum + (item.values[Math.min(pointIndex,item.values.length-1)] || 0),0);
          if (total > 0) series.forEach(item => {
            const index = Math.min(pointIndex,item.values.length-1);
            if (index >= 0) item.values[index] = item.values[index] / total;
          });
        }
        const values = series.flatMap(item => item.values);
        if (!values.length) return;
        const min = Math.max(0, Math.min(...values, .5) - .08);
        const max = Math.min(1, Math.max(...values, .5) + .08);
        const range = Math.max(.1, max - min);
        const paths = series.map((item,index) => {
          const color = seriesColors[index % seriesColors.length];
          const coords = item.values.map((value,pointIndex) => {
            const x = 8 + (pointIndex / Math.max(1,item.values.length-1)) * 304;
            const y = 82 - ((value-min)/range) * 68;
            return x.toFixed(1)+','+y.toFixed(1);
          }).join(' ');
          const last = item.values.at(-1);
          const lastY = (82-((last-min)/range)*68).toFixed(1);
          return '<polyline class="series" stroke="'+color+'" points="'+coords+'"><title>'+escapeHtml(item.label)+' '+Math.round(last*100)+'%</title></polyline><circle cx="312" cy="'+lastY+'" r="3" fill="'+color+'"/>';
        }).join('');
        chart.innerHTML = '<line class="grid" x1="8" y1="14" x2="312" y2="14"/><line class="grid" x1="8" y1="48" x2="312" y2="48"/><line class="grid" x1="8" y1="82" x2="312" y2="82"/>'+paths+'<text class="axis" x="316" y="18">'+Math.round(max*100)+'%</text><text class="axis" x="316" y="52">'+Math.round((min+max)/2*100)+'%</text><text class="axis" x="316" y="86">'+Math.round(min*100)+'%</text>';
        const legend = document.getElementById('chartLegend');
        if (legend) legend.innerHTML = series.map((item,index) => '<span class="legend-item"><span class="legend-dot" style="background:'+seriesColors[index%seriesColors.length]+'"></span><span class="legend-label">'+escapeHtml(item.label)+'</span></span>').join('');
      }

      async function render() {
        const market = await loadMarket();
        const relatedMarkets = Array.isArray(market.eventMarkets) && market.eventMarkets.length > 1
          ? market.eventMarkets
          : [market];
        const rawCandidatePrices = relatedMarkets.map(item => {
          const values = parse(item.outcomePrices);
          return Number.isFinite(Number(values[0])) ? Number(values[0]) : .5;
        });
        const candidateTotal = rawCandidatePrices.reduce((sum,value) => sum + Math.max(0,value),0) || relatedMarkets.length;
        const prices = relatedMarkets.map((_,index) => Math.max(0,rawCandidatePrices[index]) / candidateTotal);
        const outcomes = relatedMarkets.map(item => item.question || item.slug || 'Outcome');
        const tokens = relatedMarkets.map(item => parse(item.clobTokenIds)[0]).filter(Boolean);
        const selectedIndex = Math.max(0, relatedMarkets.findIndex(item => item.slug === market.slug));
        const price = prices[selectedIndex] ?? prices[0] ?? .5;
        const href = config.siteUrl + '/' + config.locale + '/event/' + encodeURIComponent(market.events?.[0]?.slug || market.slug);
        root.innerHTML = '<div class="top"><img class="market-icon" src="'+safeImage(market.image,config.fallbackLogoUrl)+'" alt=""/><div class="title">'+escapeHtml(market.eventTitle || market.question)+'</div><div class="chance">'+Math.round(price*100)+'%<small>chance</small></div></div>'+
          '<div id="chartWrap" class="chart-wrap '+(config.showChart?'visible':'')+'"><svg id="chart" viewBox="0 0 350 96" role="img" aria-label="Market price history"></svg><div id="chartLegend" class="legend"></div></div>'+
          '<div class="filters '+(config.showFilters?'visible':'')+'"><button class="filter">1D</button><button class="filter">1W</button><button class="filter active">ALL</button></div>'+
          '<div class="bottom"><img class="brand-logo" src="'+safeImage(config.siteLogoUrl,config.fallbackLogoUrl)+'" alt=""/><span class="brand">'+escapeHtml(config.siteName)+'</span>'+
          (config.showVolume?'<span class="volume">'+money(market.volumeNum)+' Vol.</span>':'<span class="volume"></span>')+
          '<a class="view" href="'+escapeHtml(href)+'" target="_blank" rel="noopener noreferrer">View market →</a></div>';
        document.querySelectorAll('img').forEach(image => image.addEventListener('error', () => {
          if (image.src !== config.fallbackLogoUrl) image.src = config.fallbackLogoUrl;
          else image.hidden = true;
        }));
        if (config.showChart) drawChart(await loadHistories(tokens,prices),tokens,outcomes);
      }

      render().catch(error => { root.innerHTML = '<div class="error">'+escapeHtml(error.message || 'Market unavailable')+'</div>'; });
    })();
  </script>
</body>
</html>`

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "frame-ancestors *",
      'Cross-Origin-Resource-Policy': 'cross-origin',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
