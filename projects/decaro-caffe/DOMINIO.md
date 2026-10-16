# Messa online su decarocaffe.it

Situazione rilevata il 13/10/2026 (DNS pubblici + API Vercel):

| Cosa | Dove si trova oggi | Si tocca? |
|---|---|---|
| DNS del dominio | nameserver **Seeweb** (`ns1/ns2.th.seeweb.it`) | sì, solo 2 record |
| Sito attuale | server Plesk `217.154.98.247` (`www` → `cloud2.landlogic.net`, **Landlogic**) | viene sostituito |
| Email `@decarocaffe.it` | **IONOS** (MX `mx00/mx01.1and1.it`, SPF perfora/kundenserver) | **NO, restano identiche** |
| Nuovo sito | progetto Vercel `decaro-caffe` (team mvm9) | — |

Il dominio resta del cliente: **non va trasferito**, si cambiano solo due record DNS.

## 1. Cosa serve dal cliente

- Accesso al pannello DNS (Seeweb), **oppure** che il loro fornitore attuale (probabilmente Landlogic) applichi le modifiche qui sotto.
- Conferma scritta (anche via email) che il nuovo sito sostituisce quello vecchio.

## 2. Collegare il dominio a Vercel (lo faccio io)

Aggiungo `decarocaffe.it` e `www.decarocaffe.it` al progetto Vercel `decaro-caffe`, con `www` che rimanda a `decarocaffe.it`.

## 3. Record DNS da modificare (pannello Seeweb)

| Tipo | Nome | Valore attuale | Nuovo valore | TTL |
|---|---|---|---|---|
| A | `@` (decarocaffe.it) | `217.154.98.247` | **`76.76.21.21`** | 3600 |
| CNAME | `www` | `cloud2.landlogic.net.` | **`cname.vercel-dns.com.`** | 3600 |

**Non toccare:** record MX, record TXT (SPF `v=spf1 …` e `zone-ownership-verification-…`) e qualsiasi altro record di posta (es. `autodiscover`, `mail`).

Se Vercel chiede di verificare la proprietà del dominio, mostra un record TXT `_vercel` da aggiungere: si inserisce nello stesso pannello.

## 4. Dopo il cambio

- La propagazione richiede da pochi minuti a qualche ora. Vercel emette in automatico il certificato HTTPS.
- Il tag `noindex` vale solo sugli indirizzi `*.vercel.app`: su `decarocaffe.it` il sito viene indicizzato normalmente.
- I vecchi indirizzi `/chi-siamo`, `/caffe` e `/contatti` sono già reindirizzati (301) alle nuove sezioni, così non si perde il posizionamento.
- Su Google Search Console: aggiungere la proprietà `decarocaffe.it` e inviare `https://decarocaffe.it/sitemap.xml`.
- Prova finale: aprire il sito, inviare una richiesta dal modulo e mandare/ricevere un'email `@decarocaffe.it` per conferma.
- Chiedere a Landlogic di **non cancellare subito** il vecchio sito (backup per 30 giorni), poi disdire l'hosting se non serve più.

## 5. Tornare indietro

Basta rimettere i valori "attuali" della tabella al punto 3: il vecchio sito torna online.
