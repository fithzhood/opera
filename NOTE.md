# Opera — note di progetto

Rompicapo su griglia quadrata. Una figura fatta di quadretti va portata dentro
una sagoma disegnata sulla griglia. Non si trascina: la si muove premendo i
quadretti della griglia, che sono pulsanti e funzionano **solo se la figura ci
sta sopra**. Dove sta la figura decide quali mosse hai: è questo il gioco.

## I file

| file | cosa fa |
|---|---|
| `opera.html` | la pagina |
| `opera.css` | stile |
| `opera-core.js` | **il nucleo**: trasformazioni, legalità, risolutore, contorno del poliomino. Nessun DOM: gira uguale nel browser e in Node |
| `opera-levels.js` | i venti quadri, generati e verificati (vedi sotto) |
| `opera.js` | disegno, animazioni, partita |
| `assets/` | icona e schermate d'avvio dell'APK (rigenerate da uno script PIL) |

I riferimenti a css/js nell'HTML sono versionati (`?v=1`): **alzare il numero a
ogni modifica**, altrimenti telefoni e WebView restano su una versione vecchia.

## Le mosse

Ogni pulsante porta una sola operazione, decisa in fase di progetto del livello.
Il quadretto premuto è anche il **perno**: la rotazione gira attorno al suo
centro, l'asse di simmetria ci passa dentro. Premere due quadretti diversi con
lo stesso simbolo dà risultati diversi — è il cuore del rompicapo.

- **traslazione** `{k:'m',dx,dy}` — l'icona ha tante punte quante le caselle
- **rotazione** `{k:'r',d:90|-90|180}` — solo multipli di 90°
- **simmetria** `{k:'x',a:'v'|'h'|'d1'|'d2'}` — assi verticale, orizzontale e i
  due obliqui a 45°. `d1` è l'asse `\` (manda `(x,y)` in `(y,x)`), `d2` è `/`

### I muri fermano il cammino, non solo l'arrivo

Un muro è un ostacolo, non una casella vietata: la figura non ci può passare
**attraverso**. Quindi oltre alla posizione finale si controllano le pose
intermedie (`pathClear` in `opera-core.js`):

- **traslazione**: i passi di mezzo, uno per casella — gli stessi che si vedono
  nell'animazione;
- **rotazione**: l'arco campionato ogni 15°, arrotondato alla griglia. A 45°
  soltanto non basterebbe: l'arrotondamento accorcia il raggio e un muro
  sull'arco non verrebbe intercettato;
- **simmetria**: niente, il ribaltamento avviene sul posto.

Il bordo del quadro invece non frena il passaggio: conta solo dove la figura si
ferma.

**Il mezzo giro si può fare da due parti.** Se un muro chiude un verso si gira
dall'altro (`spin()` restituisce +1, −1 o 0), e l'animazione segue quel verso —
se no si vedrebbe la figura passare dentro il muro. Senza questo la regola non
sarebbe nemmeno reversibile, e annullare una mossa potrebbe diventare
impossibile.

**Arrotondamento con margine.** A 30° un quadretto a distanza 3 cade esatto su
1,5: lì il rumore di calcolo (1e-16) faceva cadere andata e ritorno da parti
opposte. Con `Math.floor(v + 0.5 + 1e-9)` la regola è reversibile — verificato
su 5172 combinazioni di forma, perno, verso e posizione del muro.

**I muri li sceglie il generatore**, non io: messi negli angoli non frenerebbero
mai niente e la regola resterebbe invisibile. La ricerca li piazza lontano dal
bordo e scarta i quadri in cui un muro taglia la strada in meno del 14% delle
posizioni raggiungibili (28% nel quadro che li introduce).

### Perché le rotazioni non sono a 45°

Una rotazione di 45° non manda una griglia quadrata in sé stessa: la casella
accanto al perno finirebbe a `(0,707; 0,707)`, che non è il centro di nessuna
casella né un vertice. Le **simmetrie** oblique invece sì, sono simmetrie vere
del reticolo quadrato: per questo ci sono gli assi a 45° ma non le rotazioni.

(Esisterebbe un modo per avere rotazioni di 45° vere: farle accompagnare da un
ingrandimento di √2, così il dominio orizzontale `(0,0)-(1,0)` diventa
`(0,0)-(1,1)`, due caselle che si toccano d'angolo. Tutto ricadrebbe esatto
sulla griglia e due scatti da 45° darebbero una rotazione di 90° a taglia
normale. È stato valutato e scartato: si è scelto di restare a multipli di 90°.)

## Gli atti e la curva

I quadri sono **44 divisi in 8 atti**, e ogni atto porta **una novita' sola**:
punte, quarto di giro, assi dritti, assi obliqui, mezzo giro, muri, passi
obliqui, e infine tutto insieme. La regola di progetto: la novita' si presenta
su un quadro *facile* (griglia piccola, figura piccola, par basso) e poi ha
quattro o cinque quadri per sedimentare prima che ne arrivi un'altra.

Per questo il par **scende all'inizio di ogni atto** e poi risale:

```
atto 1  4 4 5 5 6
atto 2  5 6 6 6 7
atto 3  5 6 7 7 7 8
atto 4  5 6 7 8 8 8
atto 5  5 7 8 8 9
atto 6  6 7 8 9 10
atto 7  6 8 9 10 10
atto 8  11 11 11 12 12 13 14
```

Gli atti stanno in `OPERA_ACTS`, e ogni livello porta il campo `act`.

### Un passo obliquo non puo' essere indispensabile

Il generatore controlla che la mossa protagonista dell'atto sia davvero
necessaria, togliendo quei pulsanti e verificando che il quadro diventi
irrisolvibile. Con le **traslazioni diagonali non funziona**: un passo in
diagonale si rifa' sempre con due passi dritti, quindi non e' mai
indispensabile finche' i dritti ci sono. Il quadro che le introduce ha percio'
una tavolozza di **sole frecce oblique**.

## I livelli: come sono fatti

Non sono scritti a mano. Uno script cerca disposizioni di pulsanti e **verifica
ogni livello con una ricerca esaustiva in ampiezza**, quindi:

- ogni quadro è dimostrabilmente risolvibile;
- `par` è il numero **minimo** di mosse, non una stima;
- l'arrivo è scelto fra le posizioni raggiungibili alla profondità voluta, così
  la soluzione esiste per costruzione;
- dove una mossa è la protagonista del quadro (la rotazione, gli assi obliqui),
  si controlla che togliendo quei pulsanti il livello diventi **irrisolvibile**:
  così la mossa nuova è davvero indispensabile e non decorativa.

Lo script sta nella cartella temporanea di lavoro (`gen.js` + `run.js`); se
serve rigenerare i livelli va riscritto — non è parte dell'app.

### La trappola trovata alla prima passata

I primi venti livelli generati erano **corridoi, non rompicapi**: in media
c'era *una sola mossa possibile* per posizione, quindi bastava premere l'unica
cosa premibile. Il problema era che i pulsanti erano pochi e sparsi.

La regola emersa: **il numero medio di scelte non può superare il numero di
quadretti della figura**. Con un domino il massimo è 2, con un pentomino 5. Le
soglie vanno quindi calibrate sulla taglia della figura, e i pulsanti devono
essere fitti (dal 55% all'80% delle caselle). I valori attuali danno da 1,5
scelte per posizione nei quadri col domino fino a 3,3 nei pentomini.

## Il menu e lo sblocco

Si parte sempre dal **menu**, non da un quadro. Il menu e' diviso per atti: il
numero romano, il titolo dell'atto e la riga che dice cosa introduce. Un atto
che non e' ancora stato raggiunto mostra "Da scoprire" invece del titolo, cosi'
la novita' resta una sorpresa. Ogni riquadro porta la **sagoma del quadro in
miniatura** (verde se e' stato chiuso nel minimo), e quello da fare ha l'anello
d'oro; all'apertura il menu ci scorre sopra da solo. Il primo quadro e' aperto, ogni
altro si apre chiudendo quello prima (`store.best[id] !== undefined`); quelli
gia' chiusi restano aperti e si possono rigiocare quante volte si vuole, e il
punteggio salvato e' il minimo fra i tentativi.

I riquadri bloccati sono `<div>`, non `<button>`: cosi' non sono cliccabili ne'
raggiungibili col tabulatore, e il gestore del clic filtra su `button.lv`.

Mentre si sta nel menu il quadro e' nascosto, quindi `layout()` esce subito: se
provasse a misurare troverebbe zero e calcolerebbe una cella minuscola.

Nel telefono coricato il menu torna a colonna singola (la barra di comandi di
lato serve solo mentre si gioca).

## Collaudo

`opera-core.js` gira anche in Node, quindi la verifica dei livelli si fa da riga
di comando senza browser:

```bash
node -e "const C=require('C:/Users/lfili/OneDrive/Documenti/app/opera/opera-core.js'),L=require('C:/Users/lfili/OneDrive/Documenti/app/opera/opera-levels.js');let b=0;for(const lv of L){const p=C.solve(lv);if(p===null||p.length!==lv.par){b++;console.log(lv.id,'problema')}}console.log(b?'PROBLEMI '+b:'tutti validi')"
```

Nel browser `window.__opera` espone `transformFor`, `state` e `press` per il
collaudo. `transformFor(op, cell)` è la trasformazione CSS che l'animazione deve
raggiungere: confrontarla con `OperaCore.apply` è il modo per accorgersi che un
asse o un verso di rotazione sono sbagliati, cosa che a occhio non si vede.

Attenzione: nel pannello di anteprima nascosto i timer vengono strozzati a ~1s,
quindi le prove che campionano a metà animazione non funzionano. Si aspetta uno
stato (il contatore delle mosse che cambia), non un tempo.

## Due scelte di disegno che sembrano dettagli

- **Il corpo della figura è UN solo tracciato con un rettangolo per cella.** Non
  il contorno unito: i quadretti possono toccarsi solo d'angolo e il
  tracciamento degli anelli si romperebbe. E deve essere un tracciato solo, se
  no fra caselle vicine resta un filo chiaro durante le rotazioni.
- **Il tratteggio della sagoma d'arrivo ha un alone chiaro sotto** (`.target-halo`,
  stesso `dasharray`, più spesso). Senza, dove la figura è già appoggiata sulla
  sagoma le trattine scure sparivano dentro il rosso.
- **Il verde vale "a posto", non "a metà strada"**: arriva solo quando la figura
  è tutta dentro la sagoma, e torna rossa se si annulla.

## Pubblicazione

- **Live**: <https://fithzhood.github.io/opera/opera.html>
- **Repo**: `C:\Users\lfili\WebApps\opera` -> github.com/fithzhood/opera
- **APK**: progetto Capacitor in `C:\Users\lfili\CapacitorApps\opera`, carica
  l'URL remoto. Quindi **le modifiche al web non richiedono una nuova build**:
  basta un `git push` e riaprire l'app. Si ricostruisce solo se cambia qualcosa
  di nativo (icona, nome, permessi, orientamento).
- L'APK non blocca la rotazione: si gioca sia in verticale sia coricato.

### Le barre di sistema su Android 15

`setSystemUiVisibility` **non nasconde piu' niente** sulle app moderne: serve
`WindowInsetsControllerCompat.hide(systemBars())`, rimesso in
`onWindowFocusChanged`, piu' `LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES` e un
`android:windowBackground` scuro, altrimenti resta una fascia chiara.

### L'icona e la maschera tonda

Il segno sta in diagonale (figura in alto a sinistra, sagoma in basso a destra) e
la maschera del launcher taglia proprio gli angoli. Nel primo piano dell'icona
adattiva il disegno va quindi tenuto entro il ~70% del lato, cioe' dentro il
cerchio inscritto. Dal `<background>` va invece tolto l'inset che
`capacitor-assets` scrive, se no resta un alone al bordo della maschera — e va
ripatchato **dopo** ogni `capacitor-assets generate`.

### Il foro della fotocamera

`env(safe-area-inset-*)` **non basta**: dipende da chi fa spazio. Sul Pixel 6
emulato il sistema rientra da solo la WebView sotto il foro (la pagina risulta
piu' corta dello schermo di ~52 punti) e l'inset dichiarato resta a zero, il che
e' corretto; su altri telefoni la pagina copre tutto e l'inset resta a zero lo
stesso, e li' il titolo finisce sotto il foro.

Provare a distinguere i due casi confrontando `innerHeight` con `screen.height`
non regge: la differenza c'e' anche senza foro (barre di sistema nascoste ma
ancora conteggiate). Percio' dentro l'APK si tiene **sempre** il massimo fra il
valore dichiarato e un minimo di 34 px sul bordo corto — in cima da fermi, di
lato quando il telefono e' coricato. Dove il valore c'e' comanda quello.

### Guardare dentro la WebView dell'APK

Si puo' avere una console vera nell'app installata, senza Chrome:

```bash
adb forward tcp:9222 localabstract:webview_devtools_remote_$(adb shell pidof com.lfili.opera)
```

poi `curl http://localhost:9222/json/list` per l'indirizzo della pagina e un
piccolo script Node che apra la WebSocket e mandi `Runtime.evaluate` (Node 22+
ha `WebSocket` gia' dentro). E' cosi' che si e' scoperto che l'inset del foro
era davvero zero invece di dedurlo dagli screenshot.

## Cose ancora da fare

- niente suoni
- il verdetto finale sui 384 px reali del Galaxy A25 lo da' il telefono: il banco
  di prova qui e' un Pixel 6 emulato
