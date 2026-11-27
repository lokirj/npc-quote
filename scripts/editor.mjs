import { MODULE_ID, KINDS, LIBRARIES, TIERS, getLibrary, parseLines } from "./constants.mjs";
import { formatQuote, getTier, isPC, pickFrom, poolFor, resolveSpeaker, scopeOf } from "./quotes.mjs";
import { showQuote } from "./display.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** Nome do campo do ator para cada tipo de frase. */
const ACTOR_FIELDS = { hit: "quotes", crit: "critQuotes", miss: "missQuotes" };
const ROWS = { hit: 6, crit: 3, miss: 5 };

/** Rótulo de uma faixa de inteligência, ex.: "Bruto (INT 4–7)". Heróis: "Bruto (INT 1–7)". */
export function tierLabel(id, scope = "npc") {
  const t = TIERS.find(t => t.id === id);
  const min = ((scope === "pc") && (id === "brute")) ? 1 : t.min;
  const range = Number.isFinite(t.max) ? `${min}–${t.max}` : `${min}+`;
  return game.i18n.format("NPCQUOTE.Tier.Label", { name: game.i18n.localize(`NPCQUOTE.Tier.${id}`), range });
}

/**
 * Editor de frases.
 * - Com um ator: frases daquele NPC ou personagem.
 * - Sem ator: frases padrão do mundo por faixa de inteligência (scope "npc" ou "pc").
 */
export class QuoteEditor extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor({ actor = null, scope, ...options } = {}) {
    scope ??= actor ? scopeOf(actor) : "npc";
    super({ ...options, id: QuoteEditor.idFor(actor, scope) });
    this.actor = actor;
    this.scope = scope;
    this.activeTier = "average";
  }

  static idFor(actor, scope = "npc") {
    return `${MODULE_ID}-editor-${actor?.id ?? `global-${scope}`}`;
  }

  /** Abre (ou traz para frente) o editor de um ator. */
  static open(actor = null) {
    if ( actor?.isToken ) actor = actor.baseActor ?? actor;
    const existing = foundry.applications.instances.get(QuoteEditor.idFor(actor));
    if ( existing ) return existing.render({ force: true });
    return new QuoteEditor({ actor }).render({ force: true });
  }

  static DEFAULT_OPTIONS = {
    tag: "form",
    classes: ["npc-quote-editor"],
    window: { icon: "fa-solid fa-comment-dots", resizable: true },
    position: { width: 560, height: "auto" },
    form: { handler: QuoteEditor.#onSubmit, closeOnSubmit: true },
    actions: { preview: QuoteEditor.#onPreview, tab: QuoteEditor.#onTab }
  };

  static PARTS = {
    form: { template: `modules/${MODULE_ID}/templates/quote-editor.hbs` }
  };

  get title() {
    if ( this.actor ) return game.i18n.format("NPCQUOTE.Editor.TitleActor", { name: this.actor.name });
    return game.i18n.localize(this.scope === "pc" ? "NPCQUOTE.Editor.TitleGlobalPC" : "NPCQUOTE.Editor.TitleGlobal");
  }

  /** Monta a lista de campos (uma textarea por tipo de frase). */
  #fields(values, nameFor, placeholders = {}, labels = "Kind") {
    return KINDS.map(kind => ({
      kind,
      name: nameFor(kind),
      value: (values[kind] ?? []).join("\n"),
      rows: ROWS[kind],
      label: game.i18n.localize(`NPCQUOTE.Editor.${labels}.${kind}.Label`),
      hint: game.i18n.localize(`NPCQUOTE.Editor.${labels}.${kind}.Hint`),
      placeholder: placeholders[kind] ?? ""
    }));
  }

  async _prepareContext(options) {
    const scope = this.scope;
    const pc = scope === "pc";
    const library = getLibrary(scope);
    const tiers = LIBRARIES[scope].tiers;
    const labels = pc ? "KindPC" : "Kind";

    // Frases padrão do mundo (uma aba por faixa de inteligência).
    if ( !this.actor ) {
      return {
        isGlobal: true,
        globalHint: game.i18n.localize(pc ? "NPCQUOTE.Editor.GlobalHintPC" : "NPCQUOTE.Editor.GlobalHint"),
        tiers: tiers.map(({ id }) => ({
          id,
          label: tierLabel(id, scope),
          description: game.i18n.localize(`NPCQUOTE.${pc ? "TierPC" : "Tier"}.${id}Hint`),
          active: id === this.activeTier,
          fields: this.#fields(library[id], kind => `library.${id}.${kind}`, {}, labels)
        }))
      };
    }

    // Frases de um ator.
    const f = this.actor.flags?.[MODULE_ID] ?? {};
    const values = Object.fromEntries(KINDS.map(k => [k, f[ACTOR_FIELDS[k]] ?? []]));
    const tier = getTier(this.actor, scope);
    const int = this.actor.system?.abilities?.int?.value ?? "?";
    // O exemplo mostrado na caixa vazia vem da faixa de inteligência do ator.
    const placeholders = Object.fromEntries(KINDS.map(k => [k, (library[tier][k] ?? []).slice(0, 2).join("\n")]));
    return {
      isGlobal: false,
      isPC: pc,
      enabled: f.enabled ?? true,
      enabledLabel: game.i18n.localize(pc ? "NPCQUOTE.Editor.EnabledPC" : "NPCQUOTE.Editor.Enabled"),
      pcHint: pc ? game.i18n.localize("NPCQUOTE.Editor.PCHint") : "",
      tierOptions: [
        { value: "auto", label: game.i18n.format("NPCQUOTE.Editor.TierAuto", { int }), selected: !f.tier || (f.tier === "auto") },
        ...tiers.map(({ id }) => ({ value: id, label: tierLabel(id, scope), selected: f.tier === id }))
      ],
      tierInfo: game.i18n.format(pc ? "NPCQUOTE.Editor.TierInfoPC" : "NPCQUOTE.Editor.TierInfo", { tier: tierLabel(tier, scope) }),
      fields: this.#fields(values, kind => ACTOR_FIELDS[kind], placeholders, labels)
    };
  }

  /** Salva as frases. */
  static async #onSubmit(event, form, formData) {
    const data = foundry.utils.expandObject(formData.object);
    if ( this.actor ) {
      const update = { enabled: Boolean(data.enabled), tier: data.tier || "auto" };
      for ( const kind of KINDS ) update[ACTOR_FIELDS[kind]] = parseLines(data[ACTOR_FIELDS[kind]]);
      await this.actor.update({ [`flags.${MODULE_ID}`]: update });
    } else {
      const { setting, tiers } = LIBRARIES[this.scope];
      const library = {};
      for ( const { id } of tiers ) {
        library[id] = Object.fromEntries(KINDS.map(k => [k, parseLines(data.library?.[id]?.[k])]));
      }
      await game.settings.set(MODULE_ID, setting, library);
    }
    ui.notifications.info("NPCQUOTE.Editor.Saved", { localize: true });
  }

  /** Troca a aba de faixa de inteligência (editor global). */
  static #onTab(event, target) {
    this.activeTier = target.dataset.tier;
    for ( const el of this.element.querySelectorAll("[data-tier]") ) {
      el.classList.toggle("active", el.dataset.tier === this.activeTier);
    }
  }

  /** Mostra uma prévia (só para você) usando o texto que está no formulário agora. */
  static #onPreview(event, target) {
    const kind = target.dataset.kind ?? "hit";
    const root = this.actor
      ? this.element
      : this.element.querySelector(`section.npc-quote-tier[data-tier="${this.activeTier}"]`);
    const read = k => parseLines(root?.querySelector(`textarea[data-kind="${k}"]`)?.value);
    const own = { quotes: read("hit"), critQuotes: read("crit"), missQuotes: read("miss") };

    let pool;
    if ( this.actor ) {
      const tierSelect = this.element.querySelector('select[name="tier"]')?.value;
      const tier = (tierSelect && (tierSelect !== "auto")) ? tierSelect : getTier({ system: this.actor.system }, this.scope);
      pool = poolFor(own, tier, kind, this.scope);
    } else {
      pool = kind === "crit" ? (own.critQuotes.length ? own.critQuotes : own.quotes)
        : kind === "miss" ? own.missQuotes : own.quotes;
    }
    const text = pickFrom(pool);
    if ( !text ) return ui.notifications.warn("NPCQUOTE.Editor.Empty", { localize: true });

    const sample = this.scope === "pc" ? "NPCQUOTE.Editor.SampleHero" : "NPCQUOTE.Editor.SampleName";
    const speaker = this.actor
      ? resolveSpeaker(this.actor)
      : { name: game.i18n.localize(sample), img: "icons/svg/mystery-man.svg", imgKind: "token" };
    const targetName = game.user.targets.first()?.name ?? game.i18n.localize("NPCQUOTE.Editor.SampleTarget");
    showQuote({ ...speaker, text: formatQuote(text, targetName), kind, side: this.scope });
  }
}

/** Editor das frases padrão dos personagens (aberto pelo menu de configurações). */
export class PCDefaultsEditor extends QuoteEditor {
  constructor(options = {}) {
    super({ ...options, actor: null, scope: "pc" });
  }
}
