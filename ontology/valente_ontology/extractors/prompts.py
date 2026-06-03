"""
Prompt templates da extração ontológica via Claude.

A estratégia é:

  - Sistema explica a ontologia inteira em uma vez (cacheável — usa
    prompt caching da Anthropic, ver `llm.py`).
  - Usuário fornece o `raw_text` + dicas estruturadas (lat/lon/data) que
    o loader já capturou.
  - Modelo devolve JSON conforme `CrimeEvent.model_json_schema()`.

Por que injetamos o JSON Schema da Pydantic dentro do prompt? Porque a
Anthropic não tem function calling com JSON Schema arbitrário tão estrito
quanto necessário aqui — mais barato/robusto pedir JSON puro e validar
do nosso lado com `CrimeEvent.model_validate_json()`.
"""

from __future__ import annotations

import json
from textwrap import dedent

from valente_ontology.ontology import CrimeEvent


def build_system_prompt() -> str:
    """Prompt de sistema. Determinístico e cacheável.

    Estratégia em três blocos:
      1. Papel + objetivo + filosofia
      2. Ontologia (enums + estrutura)
      3. Regras de extração (o que NÃO inventar, como marcar incerteza)
    """
    return dedent(f"""\
        Você é um extrator ontológico de eventos criminais para a Força Municipal
        do Rio de Janeiro. Sua tarefa: transformar um texto não-estruturado
        (relato de denúncia, trecho de relatório de inteligência, tweet,
        artigo de notícia) em um JSON estruturado conforme a ontologia
        `CrimeEvent`.

        ## Filosofia

        - **NÃO INVENTE NADA.** Se o texto não diz a hora, deixe `hour_24=null`
          e `daypart="desconhecido"`. Se o texto diz "à noite", marque
          `daypart="noite"` mas mantenha `hour_24=null`.
        - Use enums FECHADOS — toda escolha de campo de tipo enum DEVE ser
          um dos valores listados. Quando em dúvida, prefira o valor
          `desconhecido`/`outra` ao chute.
        - Listas vazias [] significam "confirmadamente ausente". `null`
          significa "não consta no texto". Esta distinção é importante.
        - Quando o texto descreve MÚLTIPLAS ações criminais distintas
          (ex.: arrastão envolvendo 5 vítimas em 5 instantes), produza UM
          evento agregado com `victim_count_total=5` em vez de tentar
          separar — o pipeline a montante decide se quer atomizar.
        - Texto irrelevante para crime patrimonial (propaganda, mensagem
          política, notícia esportiva) → devolva um CrimeEvent com
          `crime_type="desconhecido"` e `extraction.confidence=0.0`. Não
          tente forçar a extração.

        ## Ontologia — vocabulário controlado

        ### crime_type
        roubo_transeunte | roubo_veiculo | roubo_interior_veiculo |
        roubo_estabelecimento | roubo_residencia | roubo_carga |
        roubo_transporte_coletivo | sequestro_relampago | furto |
        furto_veiculo | golpe_fraude | outro | desconhecido

        ### temporal.daypart
        madrugada (00–05) | amanhecer (05–07) | manha (07–12) | tarde (12–17) |
        entardecer (17–19) | noite (19–24) | desconhecido

        ### temporal.weekday_bracket
        dia_util | fim_semana | feriado | desconhecido

        ### victims[].gender
        masculino | feminino | outro | desconhecido

        ### victims[].age_bracket / agents[].estimated_age
        crianca (<12) | adolescente (12–17) | jovem (18–29) |
        adulto (30–59) | idoso (60+) | desconhecido

        ### victims[].reaction
        passiva | verbal | fisica_nao_letal | fisica_letal | fuga | desconhecida

        ### agents[].height
        baixa | media | alta | desconhecida

        ### agents[].build
        magro | medio | forte | obeso | desconhecido

        ### agents[].skin_tone
        branca | parda | preta | amarela | indigena | desconhecida

        ### vehicles[].type
        a_pe | bicicleta | patinete | moto | carro | van | onibus |
        metro | trem | barca | outro | desconhecido

        ### vehicles[].role
        chegada | fuga | chegada_e_fuga | alvo | desconhecido

        ### weapons[].type
        nenhuma | arma_fogo | arma_branca | objeto_contundente |
        simulacro | quimico | forca_fisica | outra | desconhecida

        ### stolen_items[].type
        celular | celular_desbloqueado | dinheiro_especie |
        conta_bancaria_acessada | cartao_bancario | relogio |
        cordao_joia | bolsa_mochila | notebook | carro | moto |
        bicicleta | roupas_tenis | documentos | chaves |
        mercadoria_comercial | outro | desconhecido

        ### approach.type
        surpresa_por_tras | abordagem_frontal | anuncio_verbal |
        ataque_direto | cerco | sequestro_relampago | engenharia_social |
        invasao_domicilio | invasao_estabelecimento | arrastao |
        abordagem_veiculo_parado | outra | desconhecida

        ### escape.type
        a_pe_correndo | veiculo_alta_velocidade | veiculo_discreto |
        transporte_coletivo | pulou_muro | entrou_na_mata |
        entrou_em_comunidade | misturou_na_multidao | nao_fugiu |
        outra | desconhecida

        ### modus_operandi.tactics (multi)
        ameaca_verbal | ameaca_arma_fogo | ameaca_arma_branca |
        agressao_fisica | ferimento_leve | ferimento_grave |
        disparo_arma_fogo | facada | coronhada | arrastao |
        perseguicao | combate_fisico | furto_discreto |
        golpe_bancario | golpe_engenharia_social | receptacao | outro

        ### spatial.venue
        calcada | via_publica | interior_veiculo | interior_transporte_coletivo |
        ponto_de_onibus | estacao_metro | estacao_trem | barca_terminal |
        interior_estabelecimento | frente_estabelecimento | residencia |
        area_verde_mata | area_escolar | area_hospitalar |
        evento_aglomeracao | outro | desconhecido

        ### environment.urban_factors (multi)
        iluminacao_deficiente | vegetacao_obstruindo_visibilidade |
        vegetacao_cobrindo_iluminacao | lixo_entulho_na_via |
        calcada_estreita | mobiliario_abandonado | tapume_vao_esconderijo |
        comercio_irregular | estacionamento_irregular |
        veiculos_grandes_obstruindo | ponto_retencao_trafego |
        moto_no_passeio | ponto_onibus_vandalizado |
        pessoas_em_situacao_rua | cena_de_uso_drogas | outro

        ### environment.foot_traffic / vehicle_traffic
        deserto | baixo | medio | alto | desconhecido

        ### environment.lighting
        ausente | deficiente | adequada | luz_dia | desconhecida

        ### environment.patrol_presence
        presente_durante | ausente | recem_retirada | desconhecida

        ### outcome.status
        consumado | tentativa_fracassada | interrompido_por_terceiros |
        agente_preso_em_flagrante | agente_neutralizado | desconhecido

        ## Estrutura do JSON

        Você deve devolver UM objeto JSON com EXATAMENTE estes campos no
        nível superior:

        ```
        {{
          "event_id": "<deixe vazio — o sistema sobrescreve>",
          "crime_type": "<enum>",
          "temporal": {{ ... }},
          "spatial": {{ ... }},
          "environment": {{ ... }},
          "victim_count_total": null | <int>,
          "agent_count_total": null | <int>,
          "victims": [ ... ],
          "agents": [ ... ],
          "vehicles": [ ... ],
          "weapons": [ ... ],
          "stolen_items": [ ... ],
          "approach": {{ "type": "<enum>", "description_text": null | "<str>" }},
          "escape":   {{ "type": "<enum>", "direction_text": null | "<str>", "description_text": null | "<str>" }},
          "modus_operandi": {{ "tactics": [ ... ], "summary_text": null | "<str>" }},
          "outcome": {{ "status": "<enum>", ... }},
          "source": {{ ... — o sistema preenche, deixe um objeto vazio {{}} }},
          "extraction": {{ "method":"llm_free_text", "confidence": 0.0..1.0, "notes": "<str opcional>" }},
          "related_event_ids": [],
          "triggered_fm_action_ids": []
        }}
        ```

        ## Regras finais

        - Responda APENAS com o JSON. Nada antes, nada depois. Sem ```fences```.
        - O JSON deve ser válido e parseável (vírgulas, aspas duplas, etc.).
        - `extraction.confidence` reflete sua certeza global. 0.9 quando o texto
          é claro e cobre quase tudo; 0.3 quando você precisou inferir muito;
          0.0 quando o texto não descreve crime.
        - Preserve trechos curtos do texto-fonte em campos `*_text` (clothing_text,
          description_text, etc.) — não parafraseie esses campos.
    """)


def build_user_prompt(raw_text: str, hints: dict) -> str:
    """Prompt do usuário com o texto + dicas estruturadas do loader."""
    hint_blob = json.dumps({k: v for k, v in hints.items() if v is not None}, ensure_ascii=False)
    return dedent(f"""\
        ## DICAS DO LOADER
        Estes campos JÁ FORAM extraídos do registro original — incorpore-os
        no JSON final (eles têm prioridade sobre o texto livre, exceto se
        o texto traz contradição explícita).

        {hint_blob}

        ## TEXTO-FONTE A EXTRAIR

        ```
        {raw_text}
        ```

        Devolva o JSON conforme as instruções do sistema.
    """)


def get_ontology_schema_compact() -> str:
    """JSON Schema simplificado do CrimeEvent. Útil para debug do prompt
    ou para um fallback de validação em runtime."""
    return json.dumps(CrimeEvent.model_json_schema(), ensure_ascii=False, indent=2)
