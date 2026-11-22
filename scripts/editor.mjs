import { MODULE_ID, KINDS, TIERS, getLibrary, parseLines } from "./constants.mjs";
import { formatQuote, getTier, pickFrom, poolFor, resolveSpeaker } from "./quotes.mjs";
import { showQuote } from "./display.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** Nome do campo do NPC para cada tipo de frase. */
const ACTOR_FIELDS = { hit: "quotes", crit: "critQuotes", miss: "missQuotes" };
const ROWS = { hit: 6, crit: 3, miss: 5 };

/** Rótulo de uma faixa de inteligência, ex.: "Bruto (INT 4–7)". */
export function tierLabel(id) {
  const t = TIERS.find(t => t.id === id);
  const range = Number.isFinite(t.max) ? `${t.min}–${t.max}` : `${t.min}+`;
  return game.i18n.format("NPCQUOTE.Tier.Label", { name: game.i18n.localize(`NPCQUOTE.Tier.${id}`), range });
}

/**
 * Editor de frases. Com um ator: frases daquele NPC.
 * Sem ator: frases padrão do mundo, separadas por faixa de inteligência.
 */
export class QuoteEditor extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor({ actor = null, ...options } = {}) {
    super({ ...options, id: QuoteEditor.idFor(actor) });
    this.actor = actor;
    this.activeTier = "average";
  }

  static idFor(actor) {
    return `${MODULE_ID}-editor-${actor?.id ?? "global"}`;
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
    return this.actor
      ? game.i18n.format("NPCQUOTE.Editor.TitleActor", { name: this.actor.name })
      : game.i18n.localize("NPCQUOTE.Editor.TitleGlobal");
  }

  /** Monta a lista de campos (uma textarea por tipo de frase). */
  #fields(values, nameFor, placeholders = {}) {
    return KINDS.map(kind => ({
      kind,
      name: nameFor(kind),
      value: (values[kind] ?? []).join("\n"),
      rows: ROWS[kind],
      label: game.i18n.localize(`NPCQUOTE.Editor.Kind.${kind}.Label`),
      hint: game.i18n.localize(`NPCQUOTE.Editor.Kind.${kind}.Hint`),
      placeholder: placeholders[kind] ?? ""
    }));
  }

  async _prepareContext(options) {
    const library = getLibrary();

    if ( !this.actor ) {
      return {
        isGlobal: true,
        tiers: TIERS.map(({ id }) => ({
          id,
          label: tierLabel(id),
          description: game.i18n.localize(`NPCQUOTE.Tier.${id}Hint`),
          active: id === this.activeTier,
          fields: this.#fields(library[id], kind => `library.${id}.${kind}`)
        }))
      };
    }

    const f = this.actor.flags?.[MODULE_ID] ?? {};
    const tier = getTier(this.actor);
    const int = this.actor.system?.abilities?.int?.value ?? "?";
    const values = Object.fromEntries(KINDS.map(k => [k, f[ACTOR_FIELDS[k]] ?? []]));
    // O exemplo mostrado na caixa vazia vem da faixa de inteligência do NPC.
    const placeholders = Object.fromEntries(KINDS.map(k => [k, (library[tier][k] ?? []).slice(0, 2).join("\n")]));
    return {
      isGlobal: false,
      enabled: f.enabled ?? true,
      tierOptions: [
        { value: "auto", label: game.i18n.format("NPCQUOTE.Editor.TierAuto", { int }), selected: !f.tier || (f.tier === "auto") },
        ...TIERS.map(({ id }) => ({ value: id, label: tierLabel(id), selected: f.tier === id }))
      ],
      tierInfo: game.i18n.format("NPCQUOTE.Editor.TierInfo", { tier: tierLabel(tier) }),
      fields: this.#fields(values, kind => ACTOR_FIELDS[kind], placeholders)
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
      const library = {};
      for ( const { id } of TIERS ) {
        library[id] = Object.fromEntries(KINDS.map(k => [k, parseLines(data.library?.[id]?.[k])]));
      }
      await game.settings.set(MODULE_ID, "library", library);
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
    const scope = this.actor
      ? this.element
      : this.element.querySelector(`section.npc-quote-tier[data-tier="${this.activeTier}"]`);
    const read = k => parseLines(scope?.querySelector(`textarea[data-kind="${k}"]`)?.value);
    const own = { quotes: read("hit"), critQuotes: read("crit"), missQuotes: read("miss") };

    let pool;
    if ( this.actor ) {
      const tierSelect = this.element.querySelector('select[name="tier"]')?.value;
      const tier = (tierSelect && (tierSelect !== "auto")) ? tierSelect : getTier({ system: this.actor.system });
      pool = poolFor(own, tier, kind);
    } else {
      pool = kind === "crit" ? (own.critQuotes.length ? own.critQuotes : own.quotes)
        : kind === "miss" ? own.missQuotes : own.quotes;
    }
    const text = pickFrom(pool);
    if ( !text ) return ui.notifications.warn("NPCQUOTE.Editor.Empty", { localize: true });

    const speaker = this.actor
      ? resolveSpeaker(this.actor)
      : { name: game.i18n.localize("NPCQUOTE.Editor.SampleName"), img: "icons/svg/mystery-man.svg", imgKind: "token" };
    const targetName = game.user.targets.first()?.name ?? game.i18n.localize("NPCQUOTE.Editor.SampleTarget");
    showQuote({ ...speaker, text: formatQuote(text, targetName), kind });
  }
}
