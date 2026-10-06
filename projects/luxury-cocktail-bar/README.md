# Live Coffee — sito one-page dark luxury

Sito statico (HTML + CSS + JS, nessun build step) per un cocktail bar di lusso, con animazione 3D guidata dallo scroll su `<canvas>`.

```
index.html            pagina unica + SEO + JSON-LD (BarOrPub)
css/style.css         stile (token colore in :root)
js/main.js            canvas a scroll, loader, Lenis, GSAP/ScrollTrigger, cursore, form
frames/               fotogrammi WebP generati + manifest.js
img/                  galleria + og-image (segnaposto)
videos/               i tuoi 3 video sorgente (ignorati da git)
tools/extract-frames.sh     FFmpeg: video → WebP (desktop + mobile)
tools/demo-video/           genera i 3 video DEMO segnaposto
```

## 1. Personalizza i testi

Cerca e sostituisci in `index.html` (e una volta in `js/main.js`, nel messaggio WhatsApp):

| Segnaposto | Esempio |
|---|---|
| `Live Coffee` | Nome del locale |
| `Bitonto` | Città |
| `[SLOGAN]` | Titolo dell'hero |
| `Via [Indirizzo], 1`, `00000` | Indirizzo e CAP (anche nel link e nell'iframe della mappa) |
| `+39 000 000 0000`, `390000000000` | Telefono e numero WhatsApp (formato internazionale, senza `+`) |
| `https://www.example.com/` | Dominio (canonical, Open Graph, JSON-LD) |
| `nomebar` | Profili Instagram e TikTok |
| `latitude` / `longitude` | Coordinate nel JSON-LD |

Orari, menu, eventi e storia sono testo normale in `index.html`; gli orari compaiono anche in `openingHoursSpecification` del JSON-LD.

## 2. Inserisci i tuoi 3 video

Metti i file in `videos/` con questi prefissi (estensioni `.mp4`, `.mov`, `.webm`, `.m4v`):

- `scene1…` → spin (hero)
- `scene2…` → esplosione degli ingredienti (signature)
- `scene3…` → fly-through del locale

Poi:

```bash
tools/extract-frames.sh                 # 30 fps, WebP desktop max 1920px + mobile 1 frame su 2, max 960px
tools/extract-frames.sh --interpolate   # se lo scroll risulta a scatti: interpolazione a 60 fps con FFmpeg
FPS=24 DESKTOP_W=1600 Q_DESKTOP=70 tools/extract-frames.sh   # parametri opzionali
```

Lo script rigenera `frames/sceneN/{desktop,mobile}/` e `frames/manifest.js` (il sito legge da lì il numero di frame e le dimensioni).

**Consigli:** 3–6 secondi per video, a 30 fps sono 90–180 frame per scena. Più frame = scroll più fluido ma caricamento più pesante. Anche senza `--interpolate` il sito sfuma tra due frame adiacenti mentre scorri, quindi il movimento resta fluido a 60 fps.

### Etichette degli ingredienti (scena 2)

Ogni `<li class="ingredient">` ha `data-x` / `data-y` = posizione dell'ingrediente **in pixel del video sorgente**, la cui risoluzione va indicata in `data-ref-w` / `data-ref-h` su `#ingredients`. Apri un fotogramma finale (es. `frames/scene2/desktop/0120.webp`), leggi le coordinate di ogni ingrediente e aggiornale: le etichette restano agganciate anche ridimensionando la finestra. `data-side="left|right"` sceglie il lato del testo (si inverte da solo se manca spazio). Su mobile le etichette diventano didascalie che compaiono una alla volta.

## 3. Video demo (opzionale)

I fotogrammi inclusi provengono da 3 video **segnaposto** generati in modo procedurale. Per rigenerarli:

```bash
npm i -D playwright      # oppure Playwright installato globalmente
node tools/demo-video/render.mjs && tools/extract-frames.sh
```

Anche la galleria (`img/gallery-*.webp`) e `img/og-image.jpg` sono segnaposto: sostituiscili con foto vere (WebP, 800–1200px di lato).

## 4. Prenotazioni

Di default il form apre WhatsApp con un messaggio precompilato (nome, data, ora, persone, note). Per ricevere le richieste su un backend o un servizio come Formspree/Make, aggiungi l'endpoint al form:

```html
<form class="booking__form glass-card" id="bookingForm" data-endpoint="https://formspree.io/f/xxxx" …>
```

## 5. Anteprima e pubblicazione

```bash
npx serve .        # oppure: python3 -m http.server
```

Funziona anche aprendo `index.html` direttamente (il manifest è uno script, non un fetch JSON). Per pubblicarlo carica l'intera cartella, tranne `videos/` e `tools/`, su qualsiasi hosting statico (Netlify, Vercel, Cloudflare Pages, GitHub Pages). Consigliato: cache lunga su `/frames/*` e `/img/*`.

## Come funziona

- **Canvas a scroll:** ogni scena è una sezione alta (`260–420vh`) con contenuto `sticky`. ScrollTrigger traduce il progresso della sezione in un indice di frame; il frame visualizzato lo insegue in modo morbido e il canvas sfuma tra due frame adiacenti (interpolazione). Tra una scena e l'altra c'è una dissolvenza al nero; dopo il fly-through il canvas resta come sfondo scurito, sotto le card in vetro.
- **Caricamento:** il loader aspetta tutta la scena 1 più un frame ogni 6 delle scene 2–3. Il resto si carica in background e, finché manca, viene mostrato il frame più vicino già disponibile.
- **Mobile:** frame dimezzati, risoluzione ridotta, devicePixelRatio limitato a 1,5, inquadratura adattata al formato verticale, cursore personalizzato disattivato.
- **Accessibilità:** con `prefers-reduced-motion` niente Lenis né cursore personalizzato, la grana resta ferma e le animazioni seguono lo scroll senza smorzamento. Il sito ha uno skip link, focus visibile, etichette sui campi del form e `aria-live` per gli stati.
- **Fallback:** se i CDN di GSAP/Lenis non si caricano, il canvas a scroll funziona comunque con un calcolo nativo e tutti i testi restano visibili.
