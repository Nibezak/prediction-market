import resolveSiteUrl from '@/lib/site-url'

export async function GET() {
  const siteUrl = resolveSiteUrl(process.env).replace(/\/$/, '')
  const javascript = `(() => {
    const siteUrl = ${JSON.stringify(siteUrl)};
    function defineWidget(name) {
      if (!name.includes('-') || customElements.get(name)) return;
      customElements.define(name, class extends HTMLElement {
        static get observedAttributes() { return ['market','event','theme','volume','chart','filters','affiliate']; }
        connectedCallback() { this.render(); }
        attributeChangedCallback() { if (this.isConnected) this.render(); }
        render() {
          const params = new URLSearchParams();
          for (const attribute of this.constructor.observedAttributes) {
            const value = this.getAttribute(attribute);
            if (!value) continue;
            if (['volume','chart','filters'].includes(attribute)) continue;
            params.set(attribute === 'affiliate' ? 'r' : attribute, value);
          }
          const features = ['volume','chart','filters'].filter(name => this.getAttribute(name) === 'true');
          if (features.length) params.set('features', features.join(','));
          const iframe = document.createElement('iframe');
          iframe.title = 'Slimefish market';
          iframe.src = siteUrl + '/market.html?' + params.toString();
          iframe.width = '400';
          iframe.height = this.getAttribute('chart') === 'true' ? '340' : '180';
          iframe.style.cssText = 'display:block;width:100%;max-width:400px;border:0;background:transparent';
          this.replaceChildren(iframe);
        }
      });
    }
    document.querySelectorAll('*').forEach(element => {
      const name = element.localName;
      if (name && name.endsWith('-market-embed')) defineWidget(name);
    });
  })();`
  return new Response(javascript, {
    headers: {
      'Content-Type': 'text/javascript; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
      'Access-Control-Allow-Origin': '*',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
