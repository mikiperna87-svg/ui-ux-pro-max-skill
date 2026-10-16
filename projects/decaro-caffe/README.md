# De Caro Caffè — sito one-page premium

Nuova versione del sito di **De Caro Caffè** (DEC ARTIGIANA SRL, torrefazione artigianale di Bitonto). È un sito statico (HTML + CSS + JS, nessun build step) con un'animazione cinematografica guidata dallo scroll su `<canvas>`.

Testi, loghi, foto prodotto e contatti vengono dal sito attuale [decarocaffe.it](https://decarocaffe.it/) (pagine Home, Chi siamo, Caffè). I testi sono stati riorganizzati e riscritti in forma più breve.

```
index.html                   pagina unica + SEO + JSON-LD (LocalBusiness + catalogo)
css/style.css                stile (palette in :root, oro preso dal logo)
js/main.js                   canvas a scroll, loader, Lenis, GSAP/ScrollTrigger, cursore, form
js/scenes.js                 inquadrature e movimenti di camera delle 3 scene
img/scenes/                  foto delle scene (2560px)
frames/manifest.js           sequenze video opzionali (vuoto = si usano le foto)
img/logo-decaro.*            logo ufficiale (bianco + oro, trasparente)
img/products/                confezioni in grani (scontornate), capsule, cialde
img/gallery/                 foto della galleria
img/source/                  foto ad alta risoluzione da cui nascono le scene
videos/                      video delle scene (ignorati da git, rigenerabili)
tools/build-photo-scenes.py  foto → video con movimenti di camera
tools/extract-frames.sh      video → WebP (desktop + mobile)
```

## Sezioni

1. **Hero:** chicco tostato sul macinato, con push-in lento della camera e il claim del marchio "Un gusto unico."
2. **La torrefazione:** carrellata dentro la tostatrice. I 5 passaggi (selezione Picking, metodo lavato, miscela, curva di tostatura, raffreddamento) si accendono uno dopo l'altro, con il badge ISO 9001:2015.
3. **La storia:** dalla raccolta delle bacche alla crema in tazzina, con la storia dei fratelli Francesco e Valentino Decaro, il viaggio tra Jamaica, Guatemala e Brasile e la DEC ARTIGIANA di oggi.
4. **Citazione** di Barbara A. Daniels (presente nel sito attuale).
5. **Miscele in grani:** Crema, Strong e Arabic, con confezioni, percentuali arabica/robusta e note di degustazione.
6. **Capsule e cialde:** capsula De Caro, compatibili Nespresso e Bialetti, sistemi A Modo Mio e Dolce Gusto, cialde Crema e Decaffeinato, più un invito per Horeca e rivenditori.
7. **Galleria.**
8. **Contatti:** form per richieste (bar, rivenditori, uffici, privati), telefono, email e WhatsApp.
9. **Footer:** dati aziendali, mappa, Facebook e Instagram, link a privacy e cookie (iubenda).

## Le scene a scroll

Le 3 scene sono **foto reali ad alta risoluzione** (`img/scenes/*.webp`, 2560px) animate **in tempo reale** sul canvas. Una camera virtuale fa zoom, carrellata e dissolvenza tra due foto, calcolate a ogni frame del browser in base allo scroll. Per questo:

- **Nitidezza piena su ogni schermo:** su un telefono verticale si ritaglia una porzione verticale della foto originale, invece di ingrandire un fotogramma orizzontale.
- **Scorrimento fluido a 60fps**, senza fotogrammi intermedi né effetto "mosso".
- **Peso ridotto:** circa 0,7 MB per tutte le scene, contro 20 MB della versione a fotogrammi.

Inquadrature e movimenti si regolano in `js/scenes.js`: zoom, centro e luminosità a inizio e fine, più il centro orizzontale su schermi verticali (`portraitX`).

**Video veri:** quando ci saranno riprese reali (tostatrice in funzione, estrazione dell'espresso) o video generati con l'AI:

```bash
# metti i video in videos/ (scene1*, scene2*, scene3*), poi:
tools/extract-frames.sh               # desktop 1600px + mobile 900px (1 su 2)
tools/extract-frames.sh --interpolate # opzionale: interpolazione a 60 fps
```

Lo script compila `frames/manifest.js`. Una scena che ha i fotogrammi del video usa quelli, le altre restano sulle foto. `tools/build-photo-scenes.py` genera ancora video dalle foto, se servono per i social.

## Da verificare prima della pubblicazione

- **Abbinamento confezione ↔ miscela:** nel sito attuale le foto sono nell'ordine nera → Crema, bordeaux → Strong, verde → Arabic. Se l'abbinamento reale è diverso, scambia le immagini in `#miscele`.
- **Formato 1 kg:** si legge sulle confezioni. Se esistono altri formati, aggiungili.
- **Form:** di default apre WhatsApp (+39 346 133 6572) con la richiesta già scritta. Per ricevere le richieste via email aggiungi un endpoint (es. Formspree), aggiungendo il suo dominio a `connect-src` in `vercel.json` e il fornitore in `privacy.html`:
  ```html
  <form class="booking__form glass-card" id="contactForm" data-endpoint="https://formspree.io/f/xxxx" …>
  ```
- **Versione inglese:** il sito attuale ha IT | EN; questa versione è solo in italiano.
- **Dominio:** canonical, Open Graph e JSON-LD puntano a `https://decarocaffe.it/`.

## Privacy e cookie (GDPR)

Il sito è progettato per **non trasmettere dati a terzi senza consenso**, quindi non serve il banner cookie all'apertura:

- **Nessuna richiesta esterna al caricamento.** Font (`fonts/`) e librerie (`js/vendor/`) sono ospitati in locale, niente Google Fonts né CDN. Verificato con Chromium: zero host esterni e zero cookie prima del consenso.
- **Google Maps** è bloccato finché l'utente non preme "Mostra la mappa" (blocco preventivo, Linee guida del Garante del 10/06/2021). L'opzione "Ricorda la mia scelta" usa una chiave in localStorage, che si azzera con "Preferenze cookie" nel footer.
- **Pagine legali:** `privacy.html` (informativa art. 13 GDPR) e `cookie-policy.html`, scritte su ciò che il sito fa davvero. Se in futuro si aggiungono statistiche (es. Google Analytics), pixel o un endpoint per il form, vanno aggiornate e serve un banner di consenso.
- **Form:** casella "Ho letto l'informativa", non un consenso. Per rispondere a una richiesta la base giuridica è l'art. 6.1.b.
- **Server** (`vercel.json`): Content-Security-Policy restrittiva, HSTS, `nosniff`, `Referrer-Policy`, `Permissions-Policy` e `noindex` automatico sugli indirizzi di prova `*.vercel.app`.

Le pagine legali sono un testo completo e coerente con il sito, ma non sono una consulenza legale. Il titolare (DEC ARTIGIANA) dovrebbe farle rivedere dal proprio consulente o allinearle al proprio account iubenda.

## Dominio

Vedi [`DOMINIO.md`](DOMINIO.md): situazione attuale (DNS Seeweb, sito su Landlogic, email IONOS) e i due record da cambiare per andare online su `decarocaffe.it` senza toccare la posta.

## Anteprima e pubblicazione

```bash
npx serve .        # oppure: python3 -m http.server
```

Funziona anche aprendo `index.html` direttamente. Per pubblicarlo carica la cartella (senza `videos/`, `tools/`, `img/source/` e i file `.md`) su qualsiasi hosting statico: Netlify, Vercel, Cloudflare Pages o lo spazio attuale. Consigliata una cache lunga su `/frames/*` e `/img/*`.

## Come funziona

- **Canvas a scroll:** ogni scena è una sezione alta (`260–380vh`) con contenuto `sticky`. ScrollTrigger traduce il progresso della sezione in una posizione della camera, che il canvas insegue in modo morbido. Tra le scene c'è una dissolvenza al nero. Dopo l'ultima scena la foto resta come sfondo scurito, sotto le card in vetro.
- **Caricamento:** il loader (logo + barra oro) aspetta le 4 foto delle scene, circa 0,7 MB.
- **Mobile:** ritaglio verticale dedicato per ogni scena (`portraitX`), canvas fino a 2x di densità, cursore personalizzato disattivato.
- **Accessibilità:** con `prefers-reduced-motion` niente Lenis né cursore personalizzato e la grana resta ferma. Il sito ha skip link, focus visibile, etichette sui campi e messaggi di stato `aria-live`.
- **Fallback:** se GSAP o Lenis non si caricano, il canvas a scroll funziona comunque e i testi restano visibili.
