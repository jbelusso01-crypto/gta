# Cidade Aberta

Jogo de mundo aberto estilo GTA San Andreas que roda **100% localmente** no
navegador. Sem servidor, sem CDN, sem instalacao: e so abrir o `index.html`.

## Como jogar

Abra o arquivo `index.html` com um duplo clique (Chrome, Edge ou Firefox).
Clique na tela para travar o mouse e comecar.

Se preferir servir por HTTP (opcional, nao e necessario):

```bash
python3 -m http.server 8000
# depois abra http://localhost:8000
```

## Controles

| Tecla | Acao |
|---|---|
| `W A S D` | andar / dirigir (relativo a camera) |
| Mouse | girar a camera |
| Botao esquerdo | atacar / atirar |
| Botao direito | mirar (camera por cima do ombro) |
| `Shift` | correr |
| `Espaco` | pular (a pe) / freio de mao (dirigindo) |
| `E` | entrar e sair de veiculos |
| `F` | interagir: lojas, servicos e trabalhos |
| `R` | recarregar |
| `1`-`7`, `Q`, roda do mouse | trocar de arma |
| `Tab` ou `M` | mapa da cidade |
| `H` | buzina |
| `N` | liga/desliga o som |
| `Esc` / `P` | pausa |
| `F5` / `F9` | salvar / carregar |

## O que tem no jogo

**Mundo**
- Cidade de ~2,2 km x 2,2 km com 324 quadras e 19 avenidas em cada eixo.
- Sete distritos: Centro (arranha-ceus), Comercial, Residencial (casas com
  telhado e quintal), Morro (favela), Industrial (galpoes, silos, containers,
  guindaste), Parques com lago e a Orla com praia, palmeiras, quiosques e pier.
- Ciclo de dia e noite completo: sol, por do sol, estrelas, janelas que acendem
  a noite, postes, farois e neblina que muda de cor.
- Estadio, praca com obelisco, estacionamentos e mobiliario urbano.

**Personagem**
- Boneco articulado com tronco, cabeca, **dois bracos com antebraco e mao** e
  duas pernas com canela e pe, tudo animado (parado, andando, correndo,
  mirando, socando, dirigindo e caido).

**Combate**
- 8 armas: punhos, taco, pistola, uzi, escopeta (com bagos), fuzil, sniper com
  zoom e granada com explosao em area.
- Pente, municao, recarga, dispersao, dano por cabeca, mira livre e mira
  assistida, rastro de tiro, faisca, sangue, fumaca e clarao.

**Veiculos**
- 9 tipos (sedan, cupe, SUV, picape, van, taxi, viatura, ambulancia e onibus)
  com fisica de aceleracao, aderencia lateral, derrapagem no freio de mao,
  inclinacao de carroceria, dano, incendio e explosao.
- Transito que respeita a mao da via, freia, desvia e buzina.

**Policia**
- Seis estrelas de procurado, viaturas que perseguem e fecham o carro,
  policiais que descem do carro e atiram, prisao quando te encurralam,
  fianca na delegacia e repintura na oficina para despistar.

**Economia e trabalhos**
- Entregas (sempre ativas), corridas de taxi, modo justiceiro na viatura,
  rampagem e racha com checkpoints.
- Casa de armas, lanchonete, hospital, oficina e casa segura para salvar.
- Dinheiro, colete, itens espalhados pelo mapa e save em localStorage.

## Estrutura

```
index.html          interface e carregamento dos modulos
vendor/three.min.js three.js r128 embarcado (funciona offline)
src/core.js         matematica, colisao espacial, fusao de geometria
src/textures.js     texturas desenhadas em canvas
src/models.js       personagens, veiculos e armas
src/city.js         geracao da cidade
src/world.js        dia/noite, servicos e coletaveis
src/audio.js        som sintetizado (WebAudio)
src/weapons.js      armas, raycast, explosoes e particulas
src/peds.js         pedestres, gangues e policiais a pe
src/vehicles.js     transito e fisica dos veiculos
src/player.js       controle do jogador e camera
src/police.js       nivel de procurado
src/missions.js     trabalhos
src/hud.js          HUD, radar, mapa e lojas
src/game.js         loop principal, entrada e save
```
