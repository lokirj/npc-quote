# NPC Quote — Frases de Efeito

> *"Morra, seu insolente!"* — todo bandido, logo antes de errar por 8.

**Dê voz aos seus vilões.** Um módulo para **Foundry VTT** (v13/v14) com **D&D 5e** que transforma as jogadas de ataque dos NPCs em momentos de cena:
quando um NPC **acerta com folga** ou **erra feio**, o retrato dele entra na tela e uma frase de efeito surge **palavra por palavra**, como num jogo de luta.

E cada criatura fala do seu jeito, de acordo com a **inteligência**:
o lobo *rosna e crava os dentes*, o ogro grita *"Você fraco! Eu forte!"*,
e o dragão sussurra *"Que adorável. O rato acredita que escapou do gato."*

- 🟡 **Acerto com folga**: ameaças (cartão dourado).
- 🔴 **Acerto crítico**: cartão vermelho que treme.
- 🟣 **Erro feio**: o NPC debocha ou insulta o personagem (cartão roxo).
- 🎲 Espera o **Dice So Nice** terminar de rolar.
- 🙈 Rolagens privadas do Mestre continuam privadas.

## Instalação

**Pelo manifesto (recomendado, funciona na Forge e em qualquer servidor):**

1. Na tela inicial do Foundry: **Add-on Modules → Install Module**.
2. Em **Manifest URL**, cole:
   ```
   https://github.com/lokirj/npc-quote/releases/latest/download/module.json
   ```
3. Clique em **Install** e ative **NPC Quote — Frases de Efeito** no mundo (**Gerenciar Módulos**).

As próximas versões aparecem com o botão **Update** na lista de módulos.

**Manual:** baixe o `module.zip` da [última release](https://github.com/lokirj/npc-quote/releases/latest) e descompacte em `Data/modules/npc-quote/`.

## Quando a frase aparece

**Marque o alvo** (tecla `T`) antes de rolar o ataque. O módulo compara o resultado com a CA do alvo:

| Situação (margem mínima 5, CA 15) | Resultado |
|---|---|
| Total 21 ou mais (passou por 6+) | Frase de acerto |
| Total 15 a 20 | Nada |
| Total 10 a 14 | Nada |
| Total 9 ou menos (faltou 6+) | Deboche |
| 20 natural | Frase de crítico (sempre) |
| 1 natural | Deboche (sempre) |

A margem mínima e a regra do 20/1 natural podem ser mudadas nas configurações.

## Inteligência

| Faixa | INT | Estilo |
|---|---|---|
| Bestial | 1–3 | Não fala: *rosna e ataca* (texto em itálico) |
| Bruto | 4–7 | Fala quebrada: "Você fraco! Eu forte!" |
| Comum | 8–12 | Ameaças diretas: "Morra, seu insolente!" |
| Astuto | 13–16 | Tático e sarcástico |
| Gênio | 17+ | Eloquente e condescendente |

A faixa vem da INT da ficha. No editor do NPC dá para forçar outra faixa (por exemplo, um animal falante).

## Escrevendo frases

- **Por NPC** (só o Mestre): clique direito no token → ícone de balão no HUD. Também pelo clique direito no ator na aba **Atores** ou pelo menu ⋮ da ficha.
  Há três caixas: acerto, crítico e erro. As caixas vazias usam as frases padrão da faixa de inteligência do NPC.
- **Padrão por faixa**: *Configurações → Configurar Módulos → NPC Quote → Editar frases padrão*.
- `{alvo}` vira o nome do personagem atacado: `Sorte sua, {alvo}. Não vai durar.`
- Frase inteira entre `*asteriscos*` aparece em itálico, como ação: `*Encara {alvo} sem piscar*`.
- Os botões **Testar acerto / crítico / erro** mostram uma prévia só para você.

## Outras configurações

| Configuração | Padrão |
|---|---|
| Quem vê a frase | Todos (rolagens privadas do Mestre só aparecem para o Mestre) |
| Ataque sem alvo marcado | Não mostrar |
| Chance de aparecer | 100% |
| Imagem exibida | Token |
| Mostrar nome do NPC | Sim (usa o nome do token na cena) |
| Tamanho | 150% |
| Posição na tela | Centro |
| Intervalo entre palavras | 260 ms |
| Tempo na tela | 3,5 s depois da última palavra (clique para fechar antes) |
| Usar frases padrão | Sim |
| Incluir NPCs dos jogadores | Não |

Se o **Dice So Nice** estiver ativo, a frase espera os dados pararem de rolar.

## Macro de teste

```js
// Deboche do token selecionado, para todos os jogadores
game.modules.get("npc-quote").api.test(null, { kind: "miss", broadcast: true });
// Crítico com texto próprio
game.modules.get("npc-quote").api.test(null, { kind: "crit", text: "Hoje não, {alvo}!" });
```
