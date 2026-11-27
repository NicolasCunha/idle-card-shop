# IdleCardShop — Game Design Document

Nov 26, 2026 · @Nicolas

> Fonte: [Claude Doc do GDD](https://claude.ai/artifact/Qk7rreXjreA9rsB8n22A4i) (revisão 29). Status: **rascunho, aguardando aprovação do Nicolas**. As perguntas em aberto estão na seção 12.

## 1. Visão geral

IdleCardShop é um jogo idle de navegador, calmo e baseado em menus, em que o jogador administra uma loja de cartas colecionáveis: compra boosters, abre, precifica, vende e aos poucos automatiza tudo com funcionários.

| Item | Decisão |
| --- | --- |
| Gênero | Idle / incremental, estilo Cookie Clicker (só menus, sem cenário gráfico) |
| Plataforma | Navegador; site estático no GitHub Pages, depois em domínio próprio |
| Modelo | Gratuito, sem fins lucrativos, fan game |
| Jogos de cartas | Pokémon e Magic: The Gathering (coleções clássicas) |
| Escopo da v1 | Somente a coleção Base Set de Pokémon (1999) |
| Idioma | Inglês em toda a interface e nas cartas (por enquanto) |
| Conteúdo de cartas | Dados e imagens fornecidos pelo Nicolas; o código só lê e renderiza |
| Save | localStorage + exportar/importar JSON versionado |

**Pilares**

1. **Tranquilo.** Não há relógio, loja que abre e fecha nem penalidade por estar ausente. O jogador nunca precisa ter pressa.
2. **Do manual ao automático.** O começo é feito à mão; o meio é contratar e treinar; o fim é a loja rodando sozinha enquanto o jogador cuida do estoque e do mercado.
3. **O prazer de abrir boosters.** A abertura é o momento especial do jogo, com animação e revelação da carta mais rara por último.
4. **Mercado previsível, mas sem garantias.** Os preços mudam devagar, uma vez por dia; o jogador pode ler tendências e investir.
5. **Idle de verdade.** Fechar o jogo não perde nada: ao voltar, todo o tempo ausente é simulado integralmente.

**Fora do escopo da v1:** gráficos de cenário, multiplayer, contas online, monetização, Magic e outras coleções além do Base Set.

## 2. Fundamentos de design

O jogo combina quatro ideias consagradas: o loop central com motor de progressão, a gangorra de custos exponenciais do gênero idle, o design aconchegante (cozy) e a coreografia de revelação de cartas.

| Conceito | O que diz | Como aplicamos |
| --- | --- | --- |
| Loop central + motor de progressão ([Roblox](https://create.roblox.com/docs/production/game-design/core-loops)) | Um loop tem a ação de momento a momento, o conjunto mais repetido de ações e um motor de progressão; sem progressão o jogo fica repetitivo | Ação: abrir e precificar. Loop: comprar → abrir → precificar → expor → vender. Progressão: funcionários, níveis e melhorias |
| Antecipação → ação → recompensa ([GameAnalytics](https://www.gameanalytics.com/blog/the-compulsion-loop-explained)) | Cada etapa do loop tem expectativa, ação e recompensa; recompensas de razão variável prendem mais | A raridade do booster é a recompensa variável; usamos sem dinheiro real e sem pressão, só como prazer de revelar |
| Gangorra exponencial ([Pecorella, Math of Idle Games I](https://www.gamedeveloper.com/design/the-math-of-idle-games-part-i)) | Custo cresce exponencialmente (custo_base × taxa^possuídos) e produção cresce linear; marcos de multiplicador empurram o jogador de volta | Contratação, treino e melhorias com custo exponencial; habilidades com ganho de velocidade por nível |
| Relógios de reengajamento ([Eric Guan](https://ericguan.substack.com/p/idle-game-design-principles)) | Sistemas com ciclos de tempo bem diferentes atendem quem volta toda hora e quem volta uma vez por dia; aumentos de ~10–15% por nível são perceptíveis | Ciclo curto: vendas e aberturas. Médio: treinos. Longo: o dia de mercado e eventos de semanas |
| Prestígio ([Pecorella, Math of Idle Games III](https://www.gamedeveloper.com/design/the-math-of-idle-games-part-iii)) | Um reset voluntário com bônus permanente mantém os números manejáveis e cria "subir a escada" | Fora da v1; candidato natural para o longo prazo (ver perguntas em aberto) |
| Cozy: segurança, abundância, suavidade ([Kitfox](https://medium.com/kitfox-games/designing-for-coziness-d33d2519a59e)) | Mecânicas aconchegantes são opcionais, seguras e relaxantes; risco e estímulos duros quebram o clima | Sem fila, sem cliente irritado, sem perda offline, sem salário que zere o caixa; paleta e música suaves; colecionar como atividade em si |
| Coreografia da revelação ([N3TWORK](https://medium.com/n3twork/choreographed-emotion-6-steps-to-a-great-card-reveal-ux-a6e6bb8487dd)) | Seis passos: início por gesto, invocação curta, prévia de raridade, revelação, resumo, repetir; comuns rápidas, raras celebradas | Rasgar o pacote com gesto, comuns primeiro e rápidas, rara por último com brilho e som, resumo e "Open another" |

**Limite que nos impomos:** a recompensa variável existe só dentro do jogo, com moeda do jogo. Nada de dinheiro real, anúncios, notificações insistentes ou punição por ausentar-se.

## 3. Loop principal

O jogador transforma dinheiro em boosters, boosters em cartas e cartas em dinheiro, com lucro, e reinveste. Cada etapa pode ser feita à mão ou por um funcionário.

```
Buy → Open → Price → List → Customers buy → (money back to Buy)
 each step: by hand or by an employee
```

Os três limites (depósito, vitrine e demanda) são exatamente o que as melhorias aumentam.

1. **Comprar** boosters lacrados na distribuidora (preço do dia). Ficam no depósito, que tem capacidade limitada.
2. **Abrir** boosters. As cartas vão para a pilha "sem preço" (ou para o fichário, se a regra "guardar a primeira cópia" estiver ligada).
3. **Precificar** cartas pelo preço de mercado do dia. Cartas abaixo de um valor mínimo viram *bulk* e são vendidas ao atacadista por 30% do valor.
4. **Expor** as cartas precificadas na vitrine, que tem número limitado de lugares.
5. **Clientes** chegam sozinhos e compram da vitrine. O dinheiro volta para o passo 1.

**Progressão**

| Fase | O que o jogador faz | Gargalo típico |
| --- | --- | --- |
| Início | Clica em todas as etapas | Tempo e cliques do jogador |
| Meio | Contrata o 1º, 2º, 3º funcionário e escolhe a tarefa de cada um | Velocidade da etapa mais lenta |
| Avançado | Treina habilidades, compra melhorias, ajusta as regras da loja | Demanda de clientes e tamanho da vitrine |
| Idle | Loja 100% automatizada; o jogador cuida do mercado, do fichário e de investimentos | Escolhas de mercado |

**Ritmos de reengajamento** (relógios de escalas diferentes, para quem joga a toda hora e para quem passa uma vez por dia)

| Escala | O que acontece | Por que voltar |
| --- | --- | --- |
| Segundos | Clientes compram, funcionários agem | Ver o dinheiro entrar |
| Minutos | Treinos terminam, dá para contratar ou comprar melhoria | Gastar o que juntou |
| Horas | Pilhas e estoque se esgotam, níveis sobem com a prática | Reabastecer e ajustar regras |
| Dias | Novo dia de mercado | Ver preços e notícias |
| Semanas | Eventos de interesse sobem, fazem platô e caem | Vender no pico, comprar na baixa |

**Metas de ritmo** (alvos para balanceamento; conferidos por simulação antes de cada versão)

| Marco | Alvo |
| --- | --- |
| Primeira venda | Menos de 1 minuto |
| Primeiro funcionário ($50) | 3 a 5 minutos |
| Loja toda automatizada (4 funcionários) | 45 a 90 minutos |
| Primeira habilidade no nível 10 | Alguns dias de jogo idle |
| Coleção Base Set completa (descoberta) | 1 a 2 semanas, ou antes comprando avulsas |

**Ações do jogador** (única tabela de preços e efeitos das ações manuais)

| Ação | Onde | Efeito | Custo ou ganho |
| --- | --- | --- | --- |
| Buy booster (1 ou 5) | Shop | +1 booster lacrado | Preço base × tendência do dia da coleção |
| Open 1 / 10 / 100 / all | Shop | Cartas para a pilha sem preço | — |
| Price 3 | Shop | 3 cartas recebem 100% do preço de mercado | — |
| List 5 | Shop | 5 cartas vão para a vitrine | — |
| Sell as bulk | Shop | Vende toda a pilha sem preço | Ganha 30% do mercado |
| Recall showcase | Showcase | Vitrine volta para a pilha sem preço, para reprecificar | — |
| Buy single | Market | +1 cópia no fichário | Paga 110% do mercado |
| Sell from binder | Binder | 1 cópia vai para a pilha sem preço | — |
| Hire, train, upgrade | Staff, Upgrades | Ver seções 6 e 7 | Custo exponencial |

O fichário registra todas as cartas já descobertas (progresso da coleção) e as cópias que o jogador decidiu guardar.

## 4. Coleções e cartas

Cada coleção é um arquivo JSON na raiz do projeto, e `collections.json` lista quais o jogo carrega. Adicionar uma coleção = criar o JSON, colocar as imagens e acrescentar uma linha em `collections.json`, sem mexer no código.

**Campos da coleção**

| Campo | Obrigatório | Uso |
| --- | --- | --- |
| `id` | sim | Identificador único e permanente (vai para o save) |
| `name` | sim | Nome exibido |
| `game` | não | `pokemon`, `magic`... |
| `theme` | não | Estilo visual das cartas daquele jogo |
| `releaseYear` | não | Ano de lançamento |
| `boosterImage` | não | Imagem do pacote |
| `booster.wholesalePrice` | sim | Preço base do booster na distribuidora |
| `booster.slots` | sim | Montagem do booster por raridade (ex.: 6 comuns, 2 incomuns, 1 rara com chance de holo) |
| `rarities` | sim | Raridades em ordem da mais comum para a mais rara, com nome, valor base e cor |
| `reprintFactor` | não | Quanto vale uma reimpressão desta coleção em relação à original (padrão 0,5) |
| `cards` | sim | Lista de cartas |

**Campos da carta**

| Campo | Obrigatório | Uso |
| --- | --- | --- |
| `index` | sim | Ordem no fichário |
| `id` | sim | Identificador único e permanente na coleção |
| `number` | não | Número impresso (ex.: 4/102) |
| `name` | sim | Nome em inglês |
| `rarity` | sim | Uma das chaves de `rarities` |
| `foil` | não | Aplica efeito holográfico |
| `image` | não | Caminho da imagem; se faltar, o jogo desenha uma carta genérica |
| `value` | não | Valor base próprio (cartas famosas); senão usa o da raridade |
| `reprintOf` | não | `idColeção:idCarta` da impressão original |
| `extra` | não | Dados livres para o futuro (tipo, HP, artista) |

**Regras**

- `id` de coleção e de carta nunca muda depois de publicado, porque o save guarda esses ids.
- A ordem das chaves em `rarities` define a ordem de revelação na abertura (comuns primeiro).
- Imagens em proporção 5:7 (ex.: 500×700), PNG, JPG ou WEBP. Pasta sugerida: `images/<id da coleção>/`.
- A v1 vem com um modelo do Base Set (102 cartas com nomes provisórios) para o Nicolas preencher.
- **Desbloqueio em sequência (decidido 2026-11-27):** as coleções seguem a ordem de `collections.json`. Boosters e cartas avulsas de uma coleção só podem ser comprados quando o jogador já descobriu pelo menos 90% da coleção anterior. A primeira coleção começa liberada. Vender cópias não tira o desbloqueio, porque a descoberta fica.

## 5. Abertura de boosters

Abrir um booster por vez é uma cena animada que imita a abertura real; abrir em quantidade pula a animação e mostra o resultado numa lista com rolagem.

| Botão | Comportamento |
| --- | --- |
| Open 1 | Animação completa |
| Open 10 | Sem animação; grade de resultados |
| Open 100 | Sem animação; grade de resultados |
| Open all | Sem animação; abre todos os lacrados da coleção |

**Animação (Open 1)**

1. O pacote aparece em destaque no centro da tela.
2. O jogador clica (ou arrasta) e o pacote rasga: a tira de cima se solta, com som de papel.
3. As cartas saem como uma pilha virada para cima. A carta do topo é a mais comum.
4. O jogador arrasta ou clica na carta do topo e ela desliza para o lado, revelando a de trás, com som de carta.
5. A ordem é sempre das mais comuns para as mais raras; a última é a rara ou holo. Cartas raras e foil ganham brilho e um som especial.
6. Ao fim, um resumo mostra as cartas do pacote com marcas "NEW" (inédita) e o valor estimado, com botões "Open another" e "Done".
7. Um botão "Skip" mostra o resumo direto.

**Níveis de celebração** (o jogador não precisa decorar mais de 3 níveis; comuns passam rápido, raras ganham palco)

| Nível | Raridades no Base Set | Revelação |
| --- | --- | --- |
| Quieto | Comum, incomum | Desliza rápido, som curto de carta |
| Destaque | Rara | Pausa breve, brilho na borda, nota musical |
| Grande | Rara holo / foil | Prévia antes de virar (a carta de trás brilha), brilho holográfico, acorde especial |

Carta inédita ganha o selo NEW em qualquer nível. Cada passo da animação pode ser acelerado com um toque; se o jogador sempre pula, a animação está longa demais.

**Resultado em quantidade (10 / 100 / todos):** as cartas iguais são agrupadas com contador, ordenadas da mais rara para a mais comum, com marca "NEW" e valor total. Se houver muitas, a lista rola.

**Tamanhos de renderização da carta**

| Contexto | Tamanho |
| --- | --- |
| Abertura (carta em foco) | Grande, ocupando boa parte da altura da tela |
| Resumo da abertura e vitrine | Médio |
| Fichário | Pequeno, em grade |
| Tabela do mercado | Miniatura |

O mesmo arquivo de imagem serve para todos os tamanhos. Carta ainda não descoberta aparece escurecida no fichário.

**Montagem do booster:** definida em `booster.slots` de cada coleção. Para o Base Set (decidido pelo Nicolas em 27/11/2026, seguindo as raridades reais): 11 cartas, sendo 7 comuns, 3 incomuns e 1 rara (67% rara, 33% rara holo). As 6 energias básicas contam como comuns, então a coleção tem 38 comuns, 32 incomuns, 16 raras e 16 raras holo.

## 6. Funcionários

Cada funcionário tem 4 habilidades independentes, do nível 1 ao 10, e faz uma tarefa por vez escolhida pelo jogador. Ele melhora sozinho na tarefa que pratica ou mais rápido com treino pago.

| Habilidade | O que faz | Tempo no nível 1 | Efeito extra do nível |
| --- | --- | --- | --- |
| Buy | Compra 1 booster na distribuidora | 8 s por booster | — |
| Open | Abre 1 booster | 10 s por booster | — |
| Price | Precifica 1 carta | 3 s por carta | Cobra de 75% (nv 1) a 100% (nv 10) do preço de mercado |
| List | Põe 1 carta na vitrine | 2 s por carta | — |

- **Velocidade:** cada nível deixa a ação 22% mais rápida; no nível 10 ela é cerca de 9x mais rápida.
- **Experiência:** cada ação feita dá 1 XP naquela habilidade. XP para o próximo nível = 25 × nível^2,3 (nv 1→2: 25 ações; nv 9→10: cerca de 4.400).
- **Treino:** custa 40 × 2^nível e leva 20 s × nível; durante o treino o funcionário não trabalha. Sobe 1 nível.
- **Contratação:** custo 50 × 2,2^(funcionários atuais). Vagas: 1 + melhoria "Staff room". Cada novo funcionário começa com nível 1 ou 2 em cada habilidade, aleatório.
- **Status visível:** working, idle, training ou o motivo da espera (no packs, showcase full, cash reserve...).

**Regras da loja** (valem para os funcionários; algumas também para o jogador)

| Regra | Padrão |
| --- | --- |
| Coleção que o comprador compra | Primeira coleção |
| Coleção que o abridor abre | Primeira coleção |
| Meta de estoque (comprador para ao atingir) | 10 boosters |
| Saldo mínimo (comprador não gasta abaixo) | $20 |
| Valor mínimo para ir à vitrine (abaixo vira bulk) | $0,25 |
| Guardar a primeira cópia de cada carta no fichário | Desligado |

**Contrapressão:** o abridor espera se houver mais de 2× a capacidade da vitrine em cartas esperando, e o precificador espera se a fila de cartas precificadas já encher a vitrine. Isso evita dinheiro parado em pilhas de cartas.

**Sem salário na v1** (decisão provisória, ver perguntas em aberto).

## 7. Clientes e economia

O dinheiro entra quando clientes compram cartas da vitrine; a demanda é o limite natural da loja e as melhorias aumentam esse limite.

**Clientes**

- Chegam em média a cada 6 s (÷ 1 + 25% por nível de Marketing), cada um querendo de 1 a 3 cartas.
- Cartas mais caras chamam mais atenção: a chance de uma carta ser escolhida é proporcional à raiz do seu preço de mercado.
- O cliente ignora cartas com preço acima de 115% do mercado do dia (precisa reprecificar quando o mercado cai).
- O cliente paga o preço da etiqueta × bônus de Reputação.
- Não há fila nem paciência: ninguém vai embora irritado (pilar "tranquilo").

**Melhorias**

| Melhoria | Efeito por nível | Custo inicial | Crescimento | Máx. |
| --- | --- | --- | --- | --- |
| Bigger storage | +10 boosters lacrados (base 20) | $40 | ×1,6 | 20 |
| Bigger showcase | +20 lugares na vitrine (base 40) | $60 | ×1,6 | 20 |
| Marketing | +25% clientes | $80 | ×1,75 | 20 |
| Reputation | +6% no preço pago | $120 | ×1,85 | 15 |
| Staff room | +1 vaga de funcionário | $150 | ×2,2 | 8 |

**Números iniciais (provisórios, testados em simulação)**

- Dinheiro inicial: $20. Booster do Base Set: $4.
- Valor base por raridade: comum $0,15 · incomum $0,40 · rara $3 · rara holo $12.
- Simulação do protótipo: 30 min jogando à mão ≈ $390; 8 h com 4 funcionários de nível 1 ≈ $8.000 de lucro.
- O valor das cartas famosas (ex.: a holo mais cobiçada) é definido no JSON pelo campo `value`.

**Fórmulas de custo** (padrão do gênero: custo = base × taxa^nível)

| Item | Base | Taxa | Observação |
| --- | --- | --- | --- |
| Contratar | $50 | 2,2 | n = funcionários atuais |
| Treinar | $40 | 2 | n = nível atual da habilidade |
| Melhorias | Ver tabela acima | 1,6 a 2,2 | Cada uma com teto de nível |

Comprar vários de uma vez usa a soma da série geométrica: custo de n itens a partir do nível k = base × taxa^k × (taxa^n − 1) / (taxa − 1).

**Marcos de coleção** (meta de longo prazo com recompensa calma, sem perda)

| Descoberta da coleção | Recompensa |
| --- | --- |
| 25% | +2% no preço pago por cartas dessa coleção |
| 50% | +4% |
| 75% | +6% |
| 100% | +10% e um selo no fichário |

Os números dos marcos são proposta e entram no balanceamento. O prestígio (reset voluntário com bônus permanente) fica para depois da v1.

## 8. Mercado diário

Os preços mudam uma vez por dia real, à meia-noite no fuso do jogador, por um cálculo determinístico: o mesmo dia dá o mesmo preço para todo mundo, nada é salvo no save e nenhuma variação é permanente.

**Dia de mercado**

- O fuso vem do navegador na criação do save, e o jogador pode trocar (ex.: UTC) na tela inicial e nas configurações.
- Dia = número de dias desde 01/01/1970 na data local daquele fuso.
- A tela mostra a data e quanto falta para o próximo dia de mercado.

**Preço do dia = valor base da carta × multiplicador do dia.** O multiplicador vem de um hash de (semente fixa, carta, dia) e soma três componentes em escala percentual:

| Componente | O que simula | Amplitude | Ritmo |
| --- | --- | --- | --- |
| Ruído da carta | Oscilação normal do dia a dia | ±~7% | Ondas de 9 e 23 dias |
| Tendência da coleção | A coleção toda esquenta ou esfria | ±~8% | Ondas de 35 dias |
| Eventos de interesse | Uma notícia faz a procura subir ou cair | +15% a +100% ou −10% a −40% | Semanas a meses |

**Eventos de interesse**

- Cada carta tem 22% de chance de um evento a cada janela de 40 dias, com uma notícia ("appeared on a TV show", "a famous streamer opened one"...).
- Forma: subida gradual → platô opcional (0 a 25 dias) → queda gradual → resíduo de 0 a 50% que também some devagar (2 a 6 meses).
- A subida e a queda duram mais quanto maior a variação (no mínimo 7 e 10 dias), sempre em curva suave.
- Eventos sobrepostos têm teto suave de ~3× e piso de ~1/3 do valor base.

**Garantia anti-pico:** testado em 4.000 dias × 102 cartas, a maior variação de um dia para o outro foi +6,1% / −5,5%.

**Reimpressões:** a carta com `reprintOf` sente os mesmos eventos da original, mas só 60% do efeito, e vale por padrão metade da original (`reprintFactor`).

**O que o jogador faz com isso**

- A aba Market lista cada carta com preço de hoje, variação de 1 e 7 dias e gráfico de 30 dias, mais as notícias dos últimos 3 dias.
- O jogador especula com as ações da seção 3: comprar avulsas ou boosters em alta, segurar no fichário, recolher a vitrine para reprecificar.
- O preço etiquetado não muda sozinho: cartas antigas na vitrine ficam baratas quando o mercado sobe e encalham quando ele cai.

## 9. Progresso offline e save

Ao carregar o save, o jogo simula 100% do tempo que passou desde o último salvamento, sem limite e sem penalidade, mostrando uma barra de progresso; o save fica no localStorage e pode ser exportado e importado como JSON versionado.

**Simulação offline**

- Usa exatamente as mesmas regras do jogo aberto (mesma função de tick), em passos de 1 s (2 s quando passou mais de 1 dia).
- O relógio simulado avança junto, então os dias de mercado mudam no meio da simulação como mudariam ao vivo.
- Roda em blocos para não travar a página; a barra mostra a porcentagem e o tempo simulado. Uma semana de ausência deve levar algumas dezenas de segundos.
- Ao fim, um resumo: tempo fora, saldo ganho, boosters comprados e abertos, cartas vendidas, níveis ganhos.
- Com a aba aberta em segundo plano, o jogo continua; se o navegador pausar a aba, o mesmo cálculo cobre o intervalo ao voltar.

**Save**

- Salvamento automático a cada 10 s, ao esconder a aba e ao fechar.
- Menu System: Save now, Export (baixa um arquivo .json), Import (carrega um .json), Reset.
- Formato do arquivo: `{ game, saveVersion, gameVersion, exportedAt, state }`.
- `saveVersion` é um número inteiro. A cada mudança de esquema existe uma migração `vN → vN+1`, aplicada em sequência ao carregar ou importar.
- Depois das migrações, o estado é mesclado com os valores padrão: campo que falta recebe o padrão, campo desconhecido é ignorado. Um save antigo nunca quebra o jogo.
- Ids de cartas ou coleções que não existem mais são ignorados sem apagar o resto.
- **Regra do projeto:** toda mudança que afete o esquema do save é levada ao Nicolas antes, com a pergunta "o que acontece com esse campo em saves antigos?".

**Preferências do aparelho** (tema e volumes) ficam fora do save, numa chave separada do localStorage, para não viajarem junto com um save importado.

## 10. Interface, áudio e configurações

A interface é só menus e painéis, em inglês, com paleta pastéis puxada para marrom e amarelo escuro, modo claro e escuro, e música calma gerada no próprio navegador.

**Telas (abas)**

| Aba | Conteúdo |
| --- | --- |
| Shop | As 4 etapas do loop lado a lado, resumo da equipe, últimos acontecimentos |
| Binder | Fichário por coleção, progresso de descoberta |
| Showcase | Cartas à venda com preço, recolher para reprecificar |
| Market | Preços do dia, tendências, notícias |
| Staff | Funcionários, habilidades, treino, regras da loja |
| Upgrades | Melhorias da loja |
| Settings | Tema, volumes, fuso, save (System), tutorial |

No topo, sempre visíveis: dinheiro, data de mercado e tempo até o próximo dia.

**Visual**

- Paleta neutra pastéis: fundos creme/areia no claro, marrom café no escuro; destaque em amarelo mostarda/âmbar; cores de raridade suaves.
- Tema claro, escuro ou seguir o sistema.
- Cartas com borda na cor da raridade; foil com brilho animado sutil.

**Áudio (Web Audio API, sem arquivos de som)**

- Música: ambiente calmo e generativo, acordes longos e suaves com notas soltas de escala pentatônica, sem batida marcada.
- Efeitos: clique, compra (moeda), rasgar o pacote, deslizar carta, revelação rara (brilho), venda (moeda suave, no máximo uma a cada poucos segundos para não cansar).
- Volumes: Master, Music e Effects, cada um com slider de 0 a 100 e botão de mudo. Master multiplica os outros dois.
- O áudio só começa após o primeiro clique do jogador (regra dos navegadores).

**Textos**

- Curtos e diretos: "Buy booster", "Open 10", "Price 3". Nada de explicar o óbvio.
- Explicações de mecânica ficam no tutorial e em tooltips, não nos botões.
- Status em poucas palavras: "no packs", "showcase full", "training".

**Retorno visual e acessibilidade**

- Cada ação tem resposta imediata e suave: número subindo no saldo, "+$" discreto nas vendas, contadores que animam.
- Raridade nunca depende só de cor: a borda tem cor e um símbolo ou letra (C, U, R, H), para daltônicos.
- Opção "Reduce motion" em Settings: tira o balanço das cartas e o brilho animado e encurta a abertura.
- Tamanho mínimo de texto legível e contraste adequado nos dois temas.

## 11. Tutorial

O tutorial ensina o loop na primeira partida, passo a passo, e é atualizado junto com toda mudança de mecânica, em qualquer versão.

**Formato**

- Passos curtos que destacam o botão certo e esperam o jogador fazer a ação (ex.: "Buy a booster" só avança depois da compra).
- Pode ser pulado e reaberto em Settings.
- O conteúdo fica num único arquivo de dados (lista de passos), separado do código da interface.
- Cada mecânica nova ganha seu passo ou dica quando for desbloqueada pela primeira vez (ex.: ao poder contratar o primeiro funcionário).

**Revelação progressiva da interface** (como no Cookie Clicker, a tela cresce junto com o jogador)

| Aparece quando | O quê |
| --- | --- |
| Início | Shop (só Buy e Open), Settings |
| Primeira carta aberta | Etapas Price e List, aba Binder |
| Primeira venda | Aba Showcase |
| Saldo chega a $40 | Aba Upgrades |
| Saldo chega a $50 | Aba Staff (passo do tutorial "Hire") |
| Primeiro dia de mercado novo, ou primeira carta acima de $5 | Aba Market (passo do tutorial "Market") |
| 90% da coleção anterior descoberta | Boosters da próxima coleção na distribuidora (passo do tutorial "nextset") |

Uma aba que já apareceu nunca some. Saves antigos começam com tudo visível.

**Roteiro inicial**

1. Choose your time zone.
2. Buy a booster.
3. Open it (animação).
4. Price your cards.
5. List them in the showcase.
6. Customers buy on their own. Make your first sale.
7. Hire your first employee (quando tiver dinheiro).
8. Pick a task for them.
9. Check the Market tab: prices change once a day.
10. Settings: theme, volume, save.
11. A new collection is open. Pick it at the distributor (quando a próxima coleção libera).

**Regra de atualização:** o tutorial tem um número de revisão. Toda mudança de mecânica atualiza o tutorial e sobe esse número; jogadores com revisão antiga veem só os passos novos. Nenhuma entrega é considerada pronta sem o tutorial atualizado.

## 12. Próximos passos e perguntas em aberto

Depois que o Nicolas aprovar este GDD, ele vira a base dos SDDs, das diretivas em `.claude/` e das skills.

**Entregáveis seguintes**

- [ ] SDDs (um por sistema: coleções, loop, funcionários, economia, mercado, save/offline, abertura, interface/áudio, tutorial)
- [ ] `CLAUDE.md` + regras em `.claude/` (idioma, estilo de texto, save versionado, tutorial sempre atualizado, determinismo do mercado)
- [ ] Skills: adicionar uma coleção de cartas; desenvolver uma feature a partir de um SDD; mudar o esquema do save

**Perguntas para o Nicolas**

- [x] Montagem do booster do Base Set: 7 comuns, 3 incomuns, 1 rara (33% holo); energias são comuns (seção 5).
- [ ] Funcionários têm salário? Proposta: não, para não punir ausência (pilar cozy).
- [ ] Semente do mercado global (todos veem o mesmo mercado e podem comparar) ou por save? Proposta: global.
- [ ] Clientes compram também boosters lacrados, além de avulsas? Proposta: não na v1.
- [ ] Marcos de coleção (25/50/75/100%) e seus bônus: aprovar a ideia e os números.
- [ ] Prestígio (reset voluntário com bônus) no longo prazo: entra no roadmap?
- [ ] O GDD, os SDDs e as diretivas ficam em português ou inglês? Proposta: GDD em português para você; SDDs, diretivas e skills em inglês, como o código e o jogo.

## Fontes

- [The Math of Idle Games, Part I](https://www.gamedeveloper.com/design/the-math-of-idle-games-part-i), Anthony Pecorella, 2016
- [The Math of Idle Games, Part III](https://www.gamedeveloper.com/design/the-math-of-idle-games-part-iii), Anthony Pecorella, 2017
- [Idle Game Design Principles](https://ericguan.substack.com/p/idle-game-design-principles), Eric Guan, 2025
- [Designing for Coziness](https://medium.com/kitfox-games/designing-for-coziness-d33d2519a59e), Kitfox Games
- [Choreographed Emotion: 6 Steps to a Great Card Reveal UX](https://medium.com/n3twork/choreographed-emotion-6-steps-to-a-great-card-reveal-ux-a6e6bb8487dd), N3TWORK
- [What Is The Compulsion Loop?](https://www.gameanalytics.com/blog/the-compulsion-loop-explained), Joseph Kim, GameAnalytics
- [Core loops](https://create.roblox.com/docs/production/game-design/core-loops), Roblox Creator Hub
