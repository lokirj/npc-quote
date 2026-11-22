import { MODULE_ID, TIERS, getLibrary, getSetting } from "./constants.mjs";

const VIDEO_EXT = /\.(webm|mp4|m4v|ogv|ogg)(\?.*)?$/i;
const lastQuote = new Map();

/**
 * Analisa uma mensagem do chat e decide se merece frase.
 * - Acerto: margem (total − CA) maior que a margem mínima → "hit" (ou "crit" se for crítico).
 * - Erro: faltou mais que a margem mínima para atingir a CA → "miss".
 * - 20 natural / 1 natural mostram sempre, se a configuração permitir.
 * Usa a mesma regra de acerto do dnd5e (crítico sempre acerta, 1 natural sempre erra).
 * @param {ChatMessage} message
 * @returns {{kind: "hit"|"crit"|"miss", target: string|null}|null}
 */
export function evaluateAttack(message) {
  const flags = message.flags?.dnd5e;
  if ( flags?.roll?.type !== "attack" ) return null;
  const roll = message.rolls?.[0];
  if ( !roll ) return null;

  const crit = Boolean(roll.isCritical);
  const fumble = Boolean(roll.isFumble);
  const total = roll.total;
  const minMargin = Number(getSetting("minMargin")) || 0;
  const extremes = getSetting("extremesAlways");
  const showMiss = getSetting("showMiss");
  const targets = flags.targets ?? [];

  // Sem alvo não há CA para calcular a margem.
  if ( !targets.length ) {
    const mode = getSetting("noTarget");
    if ( mode === "ignore" ) return null;
    if ( crit ) return { kind: "crit", target: null };
    if ( fumble ) return showMiss ? { kind: "miss", target: null } : null;
    return (mode === "always") ? { kind: "hit", target: null } : null;
  }

  const results = targets.map(({ name, ac }) => {
    const isMiss = !crit && ((total < ac) || fumble);
    // CA nula conta como acerto automático (mesma regra do dnd5e).
    const margin = (ac === null || ac === undefined) ? Infinity : (total - ac);
    return { name, isMiss, margin };
  });

  const hits = results.filter(r => !r.isMiss);
  if ( hits.length ) {
    const best = hits.reduce((a, b) => (b.margin > a.margin ? b : a));
    if ( (crit && extremes) || (best.margin > minMargin) ) {
      return { kind: crit ? "crit" : "hit", target: best.name ?? null };
    }
    return null;
  }

  if ( !showMiss ) return null;
  // Errou todos: vale o alvo em que chegou mais perto.
  const closest = results.reduce((a, b) => (b.margin > a.margin ? b : a));
  if ( (fumble && extremes) || (-closest.margin > minMargin) ) {
    return { kind: "miss", target: closest.name ?? null };
  }
  return null;
}

/** Faixa de inteligência do NPC (ou a faixa forçada no editor). */
export function getTier(actor) {
  const override = actor?.flags?.[MODULE_ID]?.tier;
  if ( override && TIERS.some(t => t.id === override) ) return override;
  const int = Number(actor?.system?.abilities?.int?.value ?? 10);
  return (TIERS.find(t => int <= t.max) ?? TIERS[2]).id;
}

/**
 * Lista de frases possíveis para o NPC. Prioridade:
 * frases próprias do NPC → frases padrão da faixa de inteligência dele.
 * No crítico, sem frases de crítico, usa as de acerto.
 * @param {object} own   Frases do NPC: { quotes, critQuotes, missQuotes }.
 * @param {string} tier
 * @param {"hit"|"crit"|"miss"} kind
 */
export function poolFor(own, tier, kind) {
  let mine;
  if ( kind === "miss" ) mine = own?.missQuotes;
  else if ( kind === "crit" ) mine = own?.critQuotes?.length ? own.critQuotes : own?.quotes;
  else mine = own?.quotes;
  if ( mine?.length ) return mine;

  if ( !getSetting("useGlobal") ) return [];
  const lib = getLibrary()[tier] ?? {};
  if ( kind === "crit" ) return lib.crit?.length ? lib.crit : (lib.hit ?? []);
  return lib[kind] ?? [];
}

/** Sorteia uma frase adequada ao NPC. */
export function pickQuote(actor, kind, { useLast = true } = {}) {
  const pool = poolFor(actor?.flags?.[MODULE_ID], getTier(actor), kind);
  return pickFrom(pool, (useLast && actor) ? `${actor.uuid}.${kind}` : null);
}

/** Sorteia uma frase da lista, evitando repetir a última da mesma chave. */
export function pickFrom(pool, key = null) {
  if ( !pool?.length ) return null;
  let options = pool;
  const last = key ? lastQuote.get(key) : null;
  if ( (pool.length > 1) && last ) options = pool.filter(q => q !== last);
  const quote = options[Math.floor(Math.random() * options.length)];
  if ( key ) lastQuote.set(key, quote);
  return quote;
}

/** Troca {alvo} / {target} pelo nome do personagem atacado. */
export function formatQuote(text, targetName) {
  const name = targetName || game.i18n.localize("NPCQUOTE.TargetFallback");
  return String(text).replace(/\{(alvo|target)\}/gi, name);
}

/**
 * Descobre nome e imagem a exibir (token da cena ou retrato do ator).
 * @param {Actor} actor
 * @param {object} [speaker]  O speaker da mensagem, para achar o token exato.
 */
export function resolveSpeaker(actor, speaker = {}) {
  const tokenDoc = speaker?.token
    ? (game.scenes.get(speaker.scene)?.tokens.get(speaker.token) ?? null)
    : (actor.token ?? actor.getActiveTokens?.(false, true)?.[0] ?? null);

  const usable = src => Boolean(src) && !src.includes("*") && !VIDEO_EXT.test(src);
  const tokenImg = tokenDoc?.texture?.src ?? actor.prototypeToken?.texture?.src;
  const portrait = actor.img;

  let img, kind;
  if ( getSetting("imageSource") === "token" ) {
    [img, kind] = usable(tokenImg) ? [tokenImg, "token"] : [portrait, "portrait"];
  } else {
    [img, kind] = usable(portrait) ? [portrait, "portrait"] : [tokenImg, "token"];
  }
  if ( !usable(img) ) [img, kind] = ["icons/svg/mystery-man.svg", "token"];

  const name = getSetting("showName") ? (tokenDoc?.name ?? actor.name) : "";
  return { name, img, imgKind: kind };
}

/** Espera a animação do Dice So Nice terminar (se o módulo estiver ativo). */
export function waitForDice(message, timeout = 8000) {
  if ( !game.modules.get("dice-so-nice")?.active ) return Promise.resolve();
  return new Promise(resolve => {
    let hookId;
    const done = () => {
      clearTimeout(timer);
      Hooks.off("diceSoNiceRollComplete", hookId);
      resolve();
    };
    const timer = setTimeout(done, timeout);
    hookId = Hooks.on("diceSoNiceRollComplete", id => {
      if ( id === message.id ) done();
    });
  });
}
