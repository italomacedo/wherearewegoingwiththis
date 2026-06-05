# Fase 20 — Roteiro de Playtest (Mecânicas de Skill)

Branch `feat/skill-mechanics`. Rodar `npm run electron:dev`. Marque cada item.

## Como as ações funcionam (leia antes)
- Toda ação de skill é disparada por **emote no chat**: abra o chat (**T** em qualquer lugar, ou **E** perto de um NPC) e escreva a ação entre asteriscos, ex: `*hackeio o cyberdeck dele pra ver os dados*`.
- A **classificação do efeito é feita pela IA (Claude Haiku)** — a frase importa. Se um efeito não disparar como esperado, reescreva mais explícito (ex: "roubo", "transfiro os créditos", "saboto a arma"). Variação ocasional do classificador é esperada — anote se acontecer.
- **Resistido vs Surpresa** depende da **consciência do NPC**:
  - **Surpresa** (NPC não resiste na hora) = alvo **desavisado**: aja por **T**, à distância, com o NPC **parado/idle** (sem conversa ativa).
  - **Resistido** = confronto aberto: em conversa ativa (**E**), NPC hostil, ou ações sociais cara-a-cara (persuasão/intimidação/pechincha) sempre resistem.
- **Raio**: ações não-combate só alcançam NPCs a **≤ 30 m**.
- NPCs usam stats defensivos uniformes (Percepção ~20), então um personagem treinado costuma ter sucesso.
- Hackers (têm cyberdeck): **Zara** e o arquétipo procedural **edgerunner ("Kit")** — só eles resistem/detectam hacks.

---

## 0. Setup / criação de personagem
- [ ] Criar PC escolhendo **Information Technology** como skill **maior (40%)** ou **menor (20%)**.
- [ ] Subir **Resistência** também (maior/menor) para testar HP.
- **Esperado:** o jogo inicia; abrir inventário (**I**) mostra **1 Cyberdeck**. Sem IT≥20 → **nenhum** cyberdeck.
- [ ] Abrir a ficha (**K**): a **Resistência** mais alta deve refletir num **HP máximo > 100** (ex.: Resistência 40 ≈ 115). Com Resistência base (10), HP máx = 100.

## 1. HP pervasivo (20A)
- [ ] Entrar em combate com um NPC e **fugir/encerrar** com o NPC ferido (não morto).
- [ ] Reabrir combate com o **mesmo** NPC.
- **Esperado:** o NPC **reentra já ferido** (HP continua de onde parou — não reseta para cheio). Ao encerrar, o HP do sobrevivente é gravado.
- [ ] (Opcional) Salvar, sair e recarregar → o NPC ferido continua ferido.

## 2. Information Technology — obter info → PDA (20D/20F)
- [ ] Perto de um NPC (≤30 m), por **T**, com ele parado: `*uso o cyberdeck pra vasculhar os dados dele*`.
- **Esperado:** narração (voz) tipo "Seu deck abre o arquivo: <Nome>, <função>"; o **nome real do NPC é revelado**.
- [ ] Abrir o **PDA**: botão **"PDA"** no ribbon **ou** tecla **P**.
- **Esperado:** a tela PDA abre (frame neon, padrão da ficha) com um **dossiê** do NPC: função, atitude, créditos, itens que ele carrega. ESC/P fecha; o ribbon some enquanto a tela está aberta.

## 3. IT — wire transfer de créditos (steal via IT, surpresa) (20D)
- [ ] Garanta que o NPC tem créditos (a maioria carrega). Por **T**, à distância, NPC desavisado: `*invado a conta dele e transfiro os créditos pro meu chip*`.
- **Esperado:** mensagem de sistema "Você desvia N créditos…"; seus créditos sobem (confira no inventário). O NPC **não reage na hora** (surpresa).

## 4. Furtividade — pickpocket (steal item, surpresa) (20D)
- [ ] Por **T**, NPC desavisado a ≤30 m: `*furto sorrateiramente algo do bolso dele sem ele ver*`.
- **Esperado:** "Você surrupia <item>"; o item mais valioso do NPC vai para o seu inventário. Sem reação imediata.
- [ ] Se tentar com o NPC **em conversa ativa** (E) → vira **resistido** (pode falhar).

## 5. Relação NPC↔NPC (20D)
- [ ] Com **dois NPCs** por perto (ex.: na tile inicial há Zara e Mback). Por **T**: `*planto uma fofoca na rede ligando o Mback a um golpe contra a Zara*` (ou via fala/persuasão).
- **Esperado:** a relação **NPC→NPC** piora um passo (dois se crítico). Difícil de "ver" direto; confirme indiretamente: depois disso, em uma briga, os lados podem mudar. (Anote se a narração indicar sucesso.)

## 6. Persuasão / Intimidação — disposição com você (20D)
- [ ] **Persuasão** (E, cara-a-cara): `*tento convencê-lo, com lábia, de que sou confiável*`.
- **Esperado:** a disposição do NPC **melhora** um passo (ex.: neutral→friendly). Sucesso crítico = dois passos.
- [ ] **Intimidação**: `*encaro ele e ameaço quebrar a cara dele se não cooperar*`.
- **Esperado:** disposição **piora** (medo). Pode escalar.
- [ ] **Coerção/extorsão** (Intimidação): `*exijo que ele me entregue o que tem, ou se dá mal*`.
- **Esperado:** disposição piora **e** ele "entrega" — créditos (ou um item) vão pro seu inventário.

## 7. Medicina — cura (HP pervasivo) (20D)
- [ ] Tome dano antes (caia de algum lugar / combate). Então: `*aplico um curativo em mim mesmo*`.
- **Esperado:** seu **HP sobe** (confirme com `*examino meus ferimentos*` que dá a condição, ou pela barra). Funciona **fora de combate** (HP pervasivo).
- [ ] (Opcional) Curar um NPC ferido: `*trato os ferimentos dele*` → HP do NPC sobe.

## 8. Engenharia — sabotagem / crafting / reparo (20H)
- [ ] **Sabotagem:** perto de um NPC **armado**, por T desavisado: `*saboto a arma dele pra explodir no próximo uso*`. Depois, **provoque um combate** com ele.
- **Esperado:** ao iniciar a luta, a **arma dele explode**, ele **entra já danificado** (HP reduzido no retrato) + narração por voz "o equipamento de <Nome> explode nas mãos dele".
- [ ] **Crafting:** tenha **sucata** no inventário (loote de um corpo / pegue do mundo). Então: `*forjo uma faca com a sucata*` (ou cano/taco/machado/pá).
- **Esperado:** consome a sucata (faca=2, cano=2, taco/pá=3, machado=4) e adiciona a arma ao inventário. Sem sucata suficiente → "Sucata insuficiente".
- [ ] **Reparo:** `*conserto meu equipamento*` → narra sucesso (placeholder, sem efeito mecânico ainda).

## 9. Comércio — pechinchar / avaliar (20I)
- [ ] **Pechinchar** com um NPC comerciante: `*pechincho por um preço melhor*`.
- **Esperado:** "Você convence ele a um preço melhor" — a disposição aquece um passo (= melhor desconto na economia que já existe).
- [ ] **Avaliar:** `*avalio o valor do que estou carregando*`.
- **Esperado:** narra "Você avalia o valor…"; abre uma entry **"Avaliação de mercado"** no **PDA** listando seus itens e valores.

## 10. Atletismo — traverse (passivo + ação) (20I/19)
- [ ] Ação: `*escalo o muro com força*` / `*forço a porta*`.
- **Esperado:** teste de Atletismo, narração de sucesso/fracasso (sem efeito mecânico além da narrativa — esperado).
- [ ] Passivo: com **Atletismo alto**, segurar **Shift** (correr) → velocidade de corrida perceptivelmente maior que com Atletismo baixo.

## 11. Pilotagem — passivo (19C, sanidade)
- [ ] Com **Pilotagem alta** vs baixa, pilotar a nave (**F**).
- **Esperado:** velocidade máxima maior com Pilotagem alta (×1.25 em 100 vs ×0.8 em 10).

## 12. Detecção pós-surpresa (o NPC percebe depois) (20G)
- [ ] Após **roubar** (item ou créditos) um NPC por surpresa (itens 3/4), **fique por perto** e espere a deliberação dele (alguns segundos, o NPC precisa estar "acordado" = na sua tile).
- **Esperado:** eventualmente o NPC pode **perceber** (rola Percepção vs sua Furtividade) → fica **mais hostil**; se já estava a ponto, pode partir pra cima. Quanto **mais alta sua Furtividade**, **menos chance** dele perceber.
- [ ] **Hack** num NPC **não-hacker** (sem deck) → ele **nunca detecta** o hack (só hacker com deck detecta). Tente hackear a **Zara** (tem deck) → ela **pode** te pegar.

## 13. Ataque por skill → combate (emboscada) (20D + HP pervasivo)
- [ ] Por T, NPC desavisado: `*saco e atiro nele de surpresa*` (com arma) ou `*parto pra cima dele de surpresa*`.
- **Esperado:** **inicia combate em emboscada** (você ganha o 1º turno). O NPC entra com seu **HP atual do mundo** (não reseta). Ao fim, o HP é gravado de volta.

## 14. Bloqueios / gates (20C)
- [ ] Tentar uma ação de IT **sem cyberdeck** (PC sem IT≥20, ou largue o deck): `*hackeio ele*`.
- **Esperado:** "Você não tem o equipamento para isso." (bloqueado, sem efeito).
- [ ] Tentar agir num NPC **muito longe** (>30 m): **"Está longe demais para alcançar."**
- [ ] Tentar uma ação direcionada **sem ninguém por perto**: **"Não há ninguém aqui para fazer isso."**

## 15. Persistência (save/reload)
- [ ] Após montar dossiês no PDA, roubar, ferir NPCs e sabotar: **salvar** (ESC → Save), **sair pro menu**, **recarregar**.
- **Esperado:** PDA mantém os dossiês; NPC roubado continua sem o item; NPC ferido continua ferido; flags de tamper/sabotagem sobrevivem.

## 16. Regressão (não pode ter quebrado)
- [ ] Conversa normal com NPC (sem emote) funciona; moderação bloqueia o que deve.
- [ ] Combate normal (provocar → duelo), inventário (**I**), ficha (**K**), economia/trade por chat, nave (**F**), tela de criação — tudo como antes.
- [ ] Os botões do ribbon: Atirar/Golpear/Falar/Inventário/**Ficha**/**PDA**.

---

### Itens de redline (decisões que você pode querer ajustar depois de jogar)
- Direção default de **relação NPC↔NPC** quando o texto é ambíguo (hoje: hack-social↓, persuasão↑).
- Custos de sucata por arma, dano da sabotagem (×1.5), fórmula de HP por Resistência, valor do cyberdeck (150) — tudo constante no código, fácil de afinar.
- Qualquer linha da tabela de mecânicas por skill (ADR-0030).
