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

## Cose ancora da fare

- niente suoni
- il verdetto finale sui 384 px reali del Galaxy A25 lo da' il telefono: il banco
  di prova qui e' un Pixel 6 emulato
