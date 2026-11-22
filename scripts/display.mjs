import { MODULE_ID, getSetting } from "./constants.mjs";

const queue = [];
let busy = false;

/**
 * Coloca uma frase na fila de exibição (só neste cliente).
 * @param {{name: string, img: string, kind?: string, text: string, crit?: boolean}} payload
 */
export function showQuote(payload) {
  if ( !payload?.text ) return;
  queue.push(payload);
  if ( !busy ) processQueue();
}

async function processQueue() {
  busy = true;
  while ( queue.length ) {
    try {
      await play(queue.shift());
    } catch(err) {
      console.error(`${MODULE_ID} | Falha ao exibir a frase`, err);
    }
  }
  busy = false;
}

function play({ name, img, imgKind = "token", text, kind = "hit", crit = false }) {
  return new Promise(resolve => {
    if ( crit ) kind = "crit";
    const position = getSetting("position");
    const wordDelay = Number(getSetting("wordDelay")) || 260;
    const hold = (Number(getSetting("holdTime")) || 3.5) * 1000;
    const enterTime = 380;

    // *Texto entre asteriscos* é uma ação/descrição, mostrada em itálico.
    text = String(text).trim();
    const action = /^\*(.+)\*$/s.exec(text);
    if ( action ) text = action[1].trim();

    const root = document.createElement("div");
    root.className = `npc-quote-overlay npc-quote-${position} npc-quote-${kind === "miss" ? "miss" : kind === "crit" ? "crit" : "hit"}`;
    if ( action ) root.classList.add("npc-quote-action");
    const scale = Number(getSetting("scale"));
    if ( scale > 0 ) root.style.setProperty("--s", String(scale / 100));
    root.innerHTML = `
      <div class="npc-quote-card" role="status" aria-live="polite">
        <div class="npc-quote-portrait npc-quote-kind-${imgKind === "portrait" ? "portrait" : "token"}"><img alt=""></div>
        <div class="npc-quote-body">
          <div class="npc-quote-name"></div>
          <div class="npc-quote-text"></div>
        </div>
      </div>`;

    root.querySelector("img").src = img;
    const nameEl = root.querySelector(".npc-quote-name");
    if ( name ) nameEl.textContent = name;
    else nameEl.remove();

    // A frase inteira já fica no DOM (invisível) para o cartão não mudar de tamanho
    // enquanto as palavras aparecem.
    const textEl = root.querySelector(".npc-quote-text");
    const words = String(text).split(/\s+/).filter(Boolean).map(word => {
      const span = document.createElement("span");
      span.className = "npc-quote-word";
      span.textContent = word;
      textEl.append(span, " ");
      return span;
    });

    document.body.append(root);

    const timers = [];
    let finished = false;
    const finish = () => {
      if ( finished ) return;
      finished = true;
      timers.forEach(clearTimeout);
      root.classList.add("npc-quote-out");
      setTimeout(() => {
        root.remove();
        resolve();
      }, 450);
    };
    root.querySelector(".npc-quote-card").addEventListener("click", finish);

    void root.offsetWidth; // força o layout para a transição de entrada funcionar
    root.classList.add("npc-quote-in");

    words.forEach((span, i) => {
      timers.push(setTimeout(() => span.classList.add("npc-quote-show"), enterTime + (i * wordDelay)));
    });
    timers.push(setTimeout(finish, enterTime + (words.length * wordDelay) + hold));
  });
}
