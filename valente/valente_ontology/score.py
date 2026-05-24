"""
PLACEHOLDER — score baseado na ontologia.

Quando este módulo for ativado, a ideia é que ele consuma o JSONL canônico
de `CrimeEvent` (gerado pela pipeline) e produza, para cada **unidade de
agregação** (logradouro × período × área FM), um score que sintetize:

  - intensidade (count + densidade temporal)
  - gravidade ontológica (presença de arma de fogo, ferimento, sequestro)
  - vulnerabilidade da vítima (idoso, criança, vítima exposta)
  - sofisticação do agente (multiplicidade, veículo de fuga estruturado)
  - migração temporal pós-ação da FM (efeito de políticas)
  - viés de fonte (oficial vs. denúncia anônima vs. tweet)

A diferença do "Bingo Score" do `luiz/` é que aqui o score sai da
ESTRUTURA do evento, não da contagem por logradouro. Dois roubos a
transeunte com 1 vítima cada têm o mesmo Bingo, mas se um deles for
contra idoso à noite com arma de fogo, o ontológico distingue.

Decisão pendente (`TODO`):

  1. Unidade de agregação — logradouro? bbox de N metros? cluster DBSCAN?
  2. Pesos por camada — fixos a priori vs. aprendidos com FMAction
     (qual ação reduziu mais o score? aprende o peso pra próxima).
  3. Janela temporal — fixa (últimos 30 dias) ou adaptativa?
  4. Estratégia de comparação com Bingo Score (substituir ou compor?).
"""

from __future__ import annotations

from valente_ontology.config import OntologySettings


def run_score(cfg: OntologySettings) -> None:
    raise NotImplementedError(
        "Score ontológico ainda não implementado.\n"
        "Ver docstring de score.py para o roadmap de decisões pendentes.\n"
        f"O JSONL canônico de eventos está em: {cfg.crime_events_path}\n"
        "Sugestão de próximo passo: notebook exploratório que agrega por "
        "logradouro e calcula features ontológicas (count, %_arma_fogo, "
        "%_idoso, %_noturno) — daí parte-se para a fórmula."
    )
