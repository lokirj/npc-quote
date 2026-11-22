export const MODULE_ID = "npc-quote";
export const SOCKET = `module.${MODULE_ID}`;

/** Tipos de frase: acerto, acerto crítico e erro feio. */
export const KINDS = ["hit", "crit", "miss"];

/**
 * Faixas de inteligência. O NPC cai na primeira faixa cujo `max` for >= INT dele.
 * O Mestre pode forçar outra faixa no editor do NPC.
 */
export const TIERS = [
  { id: "beast",   min: 1,  max: 3 },
  { id: "brute",   min: 4,  max: 7 },
  { id: "average", min: 8,  max: 12 },
  { id: "cunning", min: 13, max: 16 },
  { id: "genius",  min: 17, max: Infinity }
];

/*
 * Frases padrão por faixa de inteligência.
 * {alvo} é trocado pelo nome do personagem atacado.
 * Texto entre *asteriscos* aparece em itálico, como ação (bom para feras).
 */
export const DEFAULT_LIBRARY = {
  beast: {
    hit: [
      "*Rosna e crava os dentes ainda mais fundo*",
      "*Solta um uivo de triunfo*",
      "*Sacode a presa com violência*",
      "Grrraaah!",
      "*Fareja o sangue e avança, faminto*"
    ],
    crit: [
      "*Rasga a carne com fúria selvagem*",
      "*Um rugido ensurdecedor ecoa pelo campo*",
      "*Os olhos brilham com fome assassina*"
    ],
    miss: [
      "*Bufa, irritado, e volta a rodear a presa*",
      "*Arreganha os dentes para {alvo}*",
      "*Arranha o chão, impaciente*",
      "Grrr...",
      "*Encara {alvo} sem piscar*"
    ]
  },
  brute: {
    hit: [
      "Eu esmaga você!",
      "Você fraco! Eu forte!",
      "Hah! Sangue bom!",
      "Mais! Eu quer mais!",
      "{alvo} quebra fácil!"
    ],
    crit: [
      "ESMAGA! ESMAGA TUDO!",
      "Osso faz CRAC! Hahaha!",
      "Agora você vira comida!"
    ],
    miss: [
      "Fica parado, coisinha!",
      "Para de pular igual sapo!",
      "Você foge igual covarde!",
      "{alvo} sorte hoje. Amanhã não!",
      "Hmpf! Próxima vez, cabeça amassada!"
    ]
  },
  average: {
    hit: [
      "Morra, seu insolente!",
      "Você morrerá hoje!",
      "Sinta o peso da minha lâmina!",
      "É só isso que você tem?",
      "Ajoelhe-se diante de mim!",
      "Seu sangue será meu troféu, {alvo}!"
    ],
    crit: [
      "Seu fim chegou!",
      "Implore por misericórdia!",
      "Isso vai deixar cicatriz!"
    ],
    miss: [
      "Fique parado, covarde!",
      "Sorte sua, {alvo}. Não vai durar.",
      "Pode correr, mas não pode se esconder!",
      "Hah! Você se esquiva como um rato assustado!",
      "Aproveite enquanto pode, verme!"
    ]
  },
  cunning: {
    hit: [
      "Previsível. Você deixou a guarda aberta.",
      "Eu vi esse movimento a uma légua de distância.",
      "Exatamente onde eu queria você, {alvo}.",
      "Lento demais. Lento e previsível.",
      "Cada erro seu tem um preço. Este foi o primeiro."
    ],
    crit: [
      "Bem no ponto fraco. Você nem percebeu, não é?",
      "Estudei você o combate inteiro, {alvo}. Valeu a pena.",
      "Xeque. E logo mais, mate."
    ],
    miss: [
      "Aproveite a sorte, {alvo}. Ela é tudo o que você tem.",
      "Hmm. Ágil, para alguém tão tolo.",
      "Isso foi só um teste. Agora conheço seus reflexos.",
      "Fuja enquanto pode. Eu já sei para onde você vai.",
      "Um lampejo de competência? Que surpresa."
    ]
  },
  genius: {
    hit: [
      "Tudo isso já estava escrito antes mesmo de você empunhar a arma.",
      "Sua mente é tão frágil quanto sua carne, {alvo}.",
      "Fascinante. Você sangra exatamente como previ.",
      "Mortais... sempre confundindo coragem com estupidez.",
      "Eu já venci esta batalha mil vezes em pensamento."
    ],
    crit: [
      "Cada passo seu foi uma peça no meu tabuleiro. Este é o fim.",
      "Observe, {alvo}: a distância entre nós é intransponível.",
      "Contemple o inevitável, inseto."
    ],
    miss: [
      "Dance enquanto pode, {alvo}. Seu destino já está selado.",
      "Um mero contratempo estatístico. Nada mais.",
      "Sua sorte me entedia quase tanto quanto sua existência.",
      "Desvie quantas vezes quiser. A conclusão não muda.",
      "Que adorável. O rato acredita que escapou do gato."
    ]
  }
};

/** Lê uma configuração do módulo. */
export function getSetting(key) {
  return game.settings.get(MODULE_ID, key);
}

/** Biblioteca de frases do mundo, completada com os padrões para faixas que faltarem. */
export function getLibrary() {
  const stored = getSetting("library") ?? {};
  const lib = {};
  for ( const { id } of TIERS ) {
    lib[id] = {};
    for ( const kind of KINDS ) {
      lib[id][kind] = Array.isArray(stored[id]?.[kind]) ? stored[id][kind] : DEFAULT_LIBRARY[id][kind];
    }
  }
  return lib;
}

/** Converte o texto de uma <textarea> (uma frase por linha) em lista. */
export function parseLines(text) {
  return String(text ?? "")
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);
}
