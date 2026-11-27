import { MODULE_ID, SOCKET, DEFAULT_LIBRARY, DEFAULT_PC_LIBRARY, getSetting } from "./constants.mjs";
import {
  canEditQuotes, evaluateAttack, formatQuote, isPC, pickQuote, resolveSpeaker, waitForDice
} from "./quotes.mjs";
import { showQuote } from "./display.mjs";
import { PCDefaultsEditor, QuoteEditor } from "./editor.mjs";

/* -------------------------------------------- */
/*  Configurações                               */
/* -------------------------------------------- */

Hooks.once("init", () => {
  const L = key => `NPCQUOTE.Settings.${key}`;
  const reg = (key, data) => game.settings.register(MODULE_ID, key, {
    name: L(`${key}.Name`), hint: L(`${key}.Hint`), scope: "world", config: true, ...data
  });

  game.settings.registerMenu(MODULE_ID, "globalEditor", {
    name: L("globalEditor.Name"),
    label: L("globalEditor.Label"),
    hint: L("globalEditor.Hint"),
    icon: "fa-solid fa-comment-dots",
    type: QuoteEditor,
    restricted: true
  });
  game.settings.registerMenu(MODULE_ID, "pcGlobalEditor", {
    name: L("pcGlobalEditor.Name"),
    label: L("pcGlobalEditor.Label"),
    hint: L("pcGlobalEditor.Hint"),
    icon: "fa-solid fa-shield-halved",
    type: PCDefaultsEditor,
    restricted: true
  });

  reg("enabled", { type: Boolean, default: true });
  reg("minMargin", { type: Number, default: 5, range: { min: 0, max: 15, step: 1 } });
  reg("showMiss", { type: Boolean, default: true });
  reg("pcQuotes", { type: Boolean, default: true });
  reg("usePCDefaults", { type: Boolean, default: true });
  reg("extremesAlways", { type: Boolean, default: true });
  reg("audience", {
    type: String, default: "all",
    choices: { all: L("audience.All"), gm: L("audience.GM") }
  });
  reg("noTarget", {
    type: String, default: "ignore",
    choices: { ignore: L("noTarget.Ignore"), crit: L("noTarget.Crit"), always: L("noTarget.Always") }
  });
  reg("chance", { type: Number, default: 100, range: { min: 0, max: 100, step: 5 } });
  reg("imageSource", {
    type: String, default: "token",
    choices: { token: L("imageSource.Token"), portrait: L("imageSource.Portrait") }
  });
  reg("showName", { type: Boolean, default: true });
  reg("scale", { type: Number, default: 150, range: { min: 50, max: 250, step: 10 } });
  reg("position", {
    type: String, default: "center",
    choices: { bottom: L("position.Bottom"), center: L("position.Center"), top: L("position.Top") }
  });
  reg("wordDelay", { type: Number, default: 260, range: { min: 80, max: 800, step: 20 } });
  reg("holdTime", { type: Number, default: 3.5, range: { min: 1, max: 10, step: 0.5 } });
  reg("useGlobal", { type: Boolean, default: true });
  reg("includePlayerOwned", { type: Boolean, default: false });

  // Frases padrão por faixa de inteligência (editadas pelo menu acima).
  game.settings.register(MODULE_ID, "library", {
    scope: "world", config: false, type: Object, default: foundry.utils.deepClone(DEFAULT_LIBRARY)
  });
  // Frases padrão dos personagens dos jogadores (editadas pelo segundo menu).
  game.settings.register(MODULE_ID, "pcLibrary", {
    scope: "world", config: false, type: Object, default: foundry.utils.deepClone(DEFAULT_PC_LIBRARY)
  });
});

/* -------------------------------------------- */
/*  Socket + API                                */
/* -------------------------------------------- */

Hooks.once("ready", () => {
  game.socket.on(SOCKET, data => {
    if ( data?.action === "show" ) showQuote(data.payload);
  });

  game.modules.get(MODULE_ID).api = {
    /** Abre o editor de frases de um ator (ou o global, sem ator). */
    edit: actor => QuoteEditor.open(actor ?? null),

    /**
     * Mostra uma frase do NPC do token selecionado.
     * Ex.: game.modules.get("npc-quote").api.test(null, { kind: "miss", broadcast: true })
     * @param {Actor|null} actor
     * @param {object} [options]
     * @param {"hit"|"crit"|"miss"} [options.kind="hit"]
     * @param {boolean} [options.broadcast=false]  Mostrar também para os jogadores.
     * @param {string} [options.text]              Texto fixo em vez de sortear.
     * @param {string} [options.target]            Nome usado em {alvo}.
     */
    test(actor, { kind = "hit", crit = false, broadcast = false, text, target } = {}) {
      if ( crit ) kind = "crit";
      actor ??= canvas.tokens?.controlled[0]?.actor ?? null;
      const quote = text ?? pickQuote(actor, kind, { useLast: false });
      if ( !quote ) return ui.notifications.warn("NPCQUOTE.Editor.Empty", { localize: true });
      const speaker = actor
        ? resolveSpeaker(actor)
        : { name: game.i18n.localize("NPCQUOTE.Editor.SampleName"), img: "icons/svg/mystery-man.svg", imgKind: "token" };
      target ??= game.user.targets.first()?.name;
      const payload = { ...speaker, text: formatQuote(quote, target), kind, side: isPC(actor) ? "pc" : "npc" };
      if ( broadcast && game.user.isGM ) game.socket.emit(SOCKET, { action: "show", payload });
      showQuote(payload);
    }
  };
});

/* -------------------------------------------- */
/*  Detecção do acerto                          */
/* -------------------------------------------- */

Hooks.on("createChatMessage", message => {
  // Só o Mestre ativo processa, para a frase não aparecer duplicada.
  if ( game.users.activeGM?.id !== game.user.id ) return;
  if ( !getSetting("enabled") ) return;
  handleMessage(message).catch(err => console.error(`${MODULE_ID} |`, err));
});

async function handleMessage(message) {
  const result = evaluateAttack(message);
  if ( !result ) return;

  const actor = ChatMessage.implementation.getSpeakerActor(message.speaker);
  if ( !actor ) return;
  const pc = isPC(actor);
  if ( pc ) {
    if ( !getSetting("pcQuotes") ) return;
  } else {
    if ( actor.type !== "npc" ) return;
    if ( actor.hasPlayerOwner && !getSetting("includePlayerOwned") ) return;
  }
  if ( actor.flags?.[MODULE_ID]?.enabled === false ) return;
  if ( (Math.random() * 100) >= getSetting("chance") ) return;

  const quote = pickQuote(actor, result.kind);
  if ( !quote ) return;

  const payload = {
    ...resolveSpeaker(actor, message.speaker),
    text: formatQuote(quote, result.target),
    kind: result.kind,
    side: pc ? "pc" : "npc"
  };
  await waitForDice(message);

  // Rolagens privadas/cegas do Mestre não são reveladas aos jogadores.
  const isPublic = !message.whisper?.length && !message.blind;
  if ( isPublic && (getSetting("audience") === "all") ) {
    game.socket.emit(SOCKET, { action: "show", payload });
  }
  showQuote(payload);
}

/* -------------------------------------------- */
/*  Atalhos para abrir o editor (só Mestre)     */
/* -------------------------------------------- */

// Botão no HUD do token (clique direito no token).
Hooks.on("renderTokenHUD", (hud, html) => {
  const actor = hud.document?.actor ?? hud.object?.actor;
  if ( !canEditQuotes(actor) ) return;
  const root = html instanceof HTMLElement ? html : html?.[0];
  const column = root?.querySelector(".col.right") ?? root?.querySelector(".col.left");
  if ( !column ) return;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "control-icon npc-quote-hud";
  button.dataset.tooltip = game.i18n.localize("NPCQUOTE.Editor.Open");
  button.innerHTML = '<i class="fa-solid fa-comment-dots" inert></i>';
  button.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    QuoteEditor.open(actor);
  });
  column.append(button);
});

// Clique direito no ator na aba de Atores.
Hooks.on("getActorContextOptions", (app, options) => {
  if ( app instanceof foundry.applications.sidebar.apps.Compendium ) return;
  const getActor = li => game.actors.get(li.dataset.documentId ?? li.dataset.entryId);
  options.push({
    name: "NPCQUOTE.Editor.Open",
    icon: '<i class="fa-solid fa-comment-dots"></i>',
    condition: li => canEditQuotes(getActor(li)),
    callback: li => QuoteEditor.open(getActor(li))
  });
});

// Botão no menu (⋮) do cabeçalho da ficha do NPC.
Hooks.on("getHeaderControlsActorSheetV2", (app, controls) => {
  const actor = app.document;
  if ( !canEditQuotes(actor) ) return;
  controls.push({
    icon: "fa-solid fa-comment-dots",
    label: "NPCQUOTE.Editor.Open",
    action: "npcQuoteEdit",
    onClick: () => QuoteEditor.open(actor)
  });
});
