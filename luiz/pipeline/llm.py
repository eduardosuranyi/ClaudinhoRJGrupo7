"""
Módulo de síntese com IA (Claude API).

Responsabilidades:
1. Extração estruturada de dinâmica criminal a partir de RELINTs
2. Síntese de padrões do Disque Denúncia
3. Geração de narrativa "Dinâmica Criminal" para o relatório
4. Resposta automática às 4 Perguntas Norteadoras do CompStat
5. Geração do Plano de Ação hiper-específico com responsáveis e justificativas

Todos os prompts são em português e produzem saídas diretamente inseríveis no
Relatório Analítico de Área do CompStat Municipal.
"""

from __future__ import annotations

import anthropic
from anthropic.types import TextBlock, ToolUseBlock

from config import CLAUDE_MAX_TOKENS, CLAUDE_MODEL, settings
from pipeline.bingo import BingoSegmento

_client: anthropic.Anthropic | None = None


def get_client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        _client = anthropic.Anthropic(
            api_key=settings.ANTHROPIC_API_KEY.get_secret_value()
        )
    return _client


def _call(system: str, user: str, max_tokens: int = CLAUDE_MAX_TOKENS) -> str:
    print(f"Calling Anthropic API: {CLAUDE_MODEL}, {system[:100]}...")
    client = get_client()
    response = client.messages.create(
        model=CLAUDE_MODEL,
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": user}],
    )
    block = response.content[0]
    if not isinstance(block, TextBlock):
        raise RuntimeError(f"Resposta inesperada do modelo: {type(block)}")
    return block.text.strip()


def _call_structured(
    system: str,
    user: str,
    tool_name: str,
    tool_description: str,
    schema: dict,
    max_tokens: int = CLAUDE_MAX_TOKENS,
) -> dict:
    """Chama o modelo forçando saída estruturada via tool use (sem parsing de JSON)."""
    print(f"Calling Anthropic API: {CLAUDE_MODEL}, {system[:100]}...")
    client = get_client()
    response = client.messages.create(
        model=CLAUDE_MODEL,
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": user}],
        tools=[
            {
                "name": tool_name,
                "description": tool_description,
                "input_schema": schema,
            }
        ],
        tool_choice={"type": "tool", "name": tool_name},
    )
    tool_block = next(
        (b for b in response.content if isinstance(b, ToolUseBlock)), None
    )
    if tool_block is None:
        raise RuntimeError("Modelo não retornou tool_use block na resposta estruturada")
    return tool_block.input


# ---------------------------------------------------------------------------
# 1. Extração estruturada do RELINT
# ---------------------------------------------------------------------------

SYSTEM_RELINT = """Você é um analista sênior de inteligência criminal do CompStat Municipal
do Rio de Janeiro. Sua tarefa é extrair informações estruturadas de Relatórios de
Inteligência de Área (RELINT) produzidos pela Força Municipal."""

_SCHEMA_RELINT: dict = {
    "type": "object",
    "properties": {
        "modalidade_predominante": {
            "type": "string",
            "description": "Principal modalidade criminal (ex: 'furto a transeunte por distração')",
        },
        "modus_operandi": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Descrições específicas de como os crimes acontecem",
        },
        "perfil_vitimas": {
            "type": "string",
            "description": "Perfil predominante das vítimas",
        },
        "rotas_fuga": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Rotas e pontos de dispersão após o crime",
        },
        "pontos_receptacao": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Locais de escoamento de bens subtraídos",
        },
        "orcrim_influencia": {
            "type": "string",
            "description": "Influência de organização criminosa, ou 'Não identificada'",
        },
        "horario_predominante": {
            "type": "string",
            "description": "Faixa horária de maior incidência",
        },
        "fatores_urbanos_criticos": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Fatores ambientais que favorecem o crime",
        },
        "recomendacoes_campo": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Recomendações operacionais diretas do RELINT",
        },
    },
    "required": [
        "modalidade_predominante",
        "modus_operandi",
        "perfil_vitimas",
        "rotas_fuga",
        "pontos_receptacao",
        "orcrim_influencia",
        "horario_predominante",
        "fatores_urbanos_criticos",
        "recomendacoes_campo",
    ],
}


def extrair_dinamica_relint(texto_relint: str, area_name: str) -> dict:
    """Extrai do RELINT um dicionário estruturado com a dinâmica criminal."""
    # TODO: chunking se RELINT > 6000 chars (atualmente trunca silenciosamente)
    prompt = f"""Analise o Relatório de Inteligência de Área abaixo para a área: **{area_name}**

RELINT:
\"\"\"
{texto_relint[:6000]}
\"\"\"

Extraia as informações de dinâmica criminal da área conforme os campos solicitados."""

    try:
        return _call_structured(
            system=SYSTEM_RELINT,
            user=prompt,
            tool_name="extrair_relint",
            tool_description="Extrai a dinâmica criminal estruturada de um RELINT.",
            schema=_SCHEMA_RELINT,
        )
    except Exception as e:
        return {
            "modalidade_predominante": "Não extraído",
            "modus_operandi": [],
            "perfil_vitimas": "Não identificado",
            "rotas_fuga": [],
            "pontos_receptacao": [],
            "orcrim_influencia": "Não identificada",
            "horario_predominante": "Não identificado",
            "fatores_urbanos_criticos": [],
            "recomendacoes_campo": [],
            "_erro": str(e),
        }


# ---------------------------------------------------------------------------
# 2. Síntese do Disque Denúncia
# ---------------------------------------------------------------------------

SYSTEM_DENUNCIA = """Você é um analista criminal do CompStat Municipal. Sua tarefa é
identificar padrões criminais a partir de relatos do Disque Denúncia."""

_SCHEMA_DENUNCIA: dict = {
    "type": "object",
    "properties": {
        "padroes_identificados": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Padrões criminais recorrentes identificados nos relatos",
        },
        "modalidades_relatadas": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Tipos de crime relatados",
        },
        "locais_criticos_citados": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Logradouros e pontos mencionados nos relatos",
        },
        "horarios_citados": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Faixas horárias mencionadas nos relatos",
        },
        "suspeitos_descricao": {
            "type": "string",
            "description": "Descrição de perfil de suspeitos mencionada nos relatos",
        },
        "nivel_percepcao_inseguranca": {
            "type": "string",
            "enum": ["alto", "médio", "baixo"],
            "description": "Nível de percepção de insegurança baseado no volume e gravidade",
        },
    },
    "required": [
        "padroes_identificados",
        "modalidades_relatadas",
        "locais_criticos_citados",
        "horarios_citados",
        "suspeitos_descricao",
        "nivel_percepcao_inseguranca",
    ],
}


def sintetizar_denuncias(relatos: list[str], area_name: str) -> dict:
    """Sintetiza padrões a partir de relatos do Disque Denúncia para a área."""
    if not relatos:
        return {
            "padroes_identificados": [],
            "modalidades_relatadas": [],
            "locais_criticos_citados": [],
            "horarios_citados": [],
            "suspeitos_descricao": "Sem informação",
            "nivel_percepcao_inseguranca": "baixo",
        }

    # TODO: sample aleatório estratificado em vez de pegar os primeiros N
    amostra = relatos[:30]
    relatos_str = "\n---\n".join(
        str(r)[:300] for r in amostra if r and str(r).strip() != "NA"
    )

    prompt = f"""Os relatos abaixo são do Disque Denúncia para a área: **{area_name}**
Total de denúncias de patrimônio na área: {len(relatos)}
Amostra analisada ({len(amostra)} relatos):

\"\"\"
{relatos_str}
\"\"\"

Identifique os padrões criminais e o nível de percepção de insegurança."""

    try:
        return _call_structured(
            system=SYSTEM_DENUNCIA,
            user=prompt,
            tool_name="sintetizar_denuncias",
            tool_description="Sintetiza padrões criminais a partir de relatos do Disque Denúncia.",
            schema=_SCHEMA_DENUNCIA,
        )
    except Exception as e:
        return {
            "padroes_identificados": [f"Erro na síntese: {e}"],
            "modalidades_relatadas": [],
            "locais_criticos_citados": [],
            "horarios_citados": [],
            "suspeitos_descricao": "Não processado",
            "nivel_percepcao_inseguranca": "baixo",
        }


# ---------------------------------------------------------------------------
# 3. Geração da seção "Dinâmica Criminal"
# ---------------------------------------------------------------------------

SYSTEM_DINAMICA = """Você é redator de relatórios analíticos de segurança pública
do CompStat Municipal do Rio de Janeiro. Sua escrita é técnica, objetiva, direta
e orientada à decisão operacional. Você escreve em português formal."""


def gerar_narrativa_dinamica(
    area_name: str,
    relint_data: dict,
    denuncia_data: dict,
    crimes_total: int,
    hora_pico_area: int | None,
    top_logradouros: list[str],
) -> str:
    """Gera 2–3 parágrafos para a seção "Dinâmica Criminal" do relatório."""
    hora_str = f"{hora_pico_area:02d}h" if hora_pico_area else "não identificado"
    logradouros_str = (
        ", ".join(top_logradouros[:5]) if top_logradouros else "não identificados"
    )

    prompt = f"""Com base nos dados abaixo, escreva a seção "ANÁLISE DA DINÂMICA CRIMINAL"
para o Relatório Analítico de Área do CompStat Municipal, referente à área: **{area_name}**.

DADOS QUANTITATIVOS:
- Total de ocorrências no período: {crimes_total}
- Horário de pico de ocorrências: {hora_str}
- Logradouros com maior incidência: {logradouros_str}

DADOS DO RELINT (inteligência de campo):
- Modalidade predominante: {relint_data.get("modalidade_predominante", "N/A")}
- Modus operandi: {"; ".join(relint_data.get("modus_operandi", [])[:4])}
- Rotas de fuga: {"; ".join(relint_data.get("rotas_fuga", [])[:3])}
- Pontos de receptação: {"; ".join(relint_data.get("pontos_receptacao", [])[:3])}
- Influência de ORCRIM: {relint_data.get("orcrim_influencia", "Não identificada")}
- Horário predominante (RELINT): {relint_data.get("horario_predominante", "N/A")}

PADRÕES DO DISQUE DENÚNCIA:
- Padrões: {"; ".join(denuncia_data.get("padroes_identificados", [])[:4])}
- Locais críticos citados: {"; ".join(denuncia_data.get("locais_criticos_citados", [])[:4])}
- Percepção de insegurança: {denuncia_data.get("nivel_percepcao_inseguranca", "N/A")}

Escreva 2–3 parágrafos objetivos, no estilo do modelo de relatório CompStat:
1. Caracterização do fenômeno criminal na área (quem, como, onde, quando)
2. Relação entre dinâmica criminal e fatores urbanos identificados
3. (se houver ORCRIM) Influência territorial e implicações operacionais

Máximo 300 palavras. Não inclua títulos. Comece diretamente com o texto."""

    try:
        return _call(SYSTEM_DINAMICA, prompt, max_tokens=800)
    except Exception as e:
        return f"[Erro na geração da narrativa: {e}]"


# ---------------------------------------------------------------------------
# 4. Resposta às 4 Perguntas Norteadoras
# ---------------------------------------------------------------------------

SYSTEM_PERGUNTAS = """Você é analista operacional do CompStat Municipal. Responde às
perguntas norteadoras da reunião de CompStat com base em dados concretos, fornecendo
diagnóstico preciso e recomendação operacional direta. Português formal, conciso."""

_SCHEMA_RESPOSTA_PERGUNTA: dict = {
    "type": "object",
    "properties": {
        "diagnostico": {"type": "string"},
        "operacao_fm": {"type": "string"},
        "obs": {"type": "string"},
    },
    "required": ["diagnostico", "operacao_fm", "obs"],
}

_SCHEMA_PERGUNTAS: dict = {
    "type": "object",
    "properties": {
        "rota_fm": _SCHEMA_RESPOSTA_PERGUNTA,
        "horario_cobertura": _SCHEMA_RESPOSTA_PERGUNTA,
        "modelo_emprego": _SCHEMA_RESPOSTA_PERGUNTA,
        "fatores_urbanos": _SCHEMA_RESPOSTA_PERGUNTA,
    },
    "required": ["rota_fm", "horario_cobertura", "modelo_emprego", "fatores_urbanos"],
}


def responder_perguntas_norteadoras(
    area_name: str,
    crimes_total: int,
    hora_pico_area: int | None,
    top_logradouros: list[str],
    relint_data: dict,
    denuncia_data: dict,
    bingos_criticos: list[BingoSegmento],
) -> dict:
    """Responde às 4 perguntas norteadoras do CompStat para a área."""
    hora_str = (
        f"{hora_pico_area:02d}h–{(hora_pico_area + 2) % 24:02d}h"
        if hora_pico_area
        else "N/A"
    )
    top_ruas = ", ".join(top_logradouros[:5]) or "N/A"
    criticos_str = ", ".join(b.logradouro for b in bingos_criticos[:3]) or "N/A"
    modus = "; ".join(relint_data.get("modus_operandi", [])[:3]) or "N/A"

    prompt = f"""Área FM: **{area_name}**
Total de crimes no período: {crimes_total}
Logradouros críticos (bingo ≥8): {criticos_str}
Logradouros com maior volume: {top_ruas}
Horário de pico: {hora_str}
Modus operandi: {modus}
Modalidade FM predominante: {relint_data.get("modalidade_predominante", "N/A")}
Influência ORCRIM: {relint_data.get("orcrim_influencia", "Não identificada")}
Padrões do Disque Denúncia: {"; ".join(denuncia_data.get("padroes_identificados", [])[:3]) or "N/A"}
Percepção de insegurança: {denuncia_data.get("nivel_percepcao_inseguranca", "N/A")}

Responda as 4 perguntas norteadoras do CompStat:
- rota_fm: Locais de maior incidência criminal estão coincidindo com a rota da FM?
- horario_cobertura: Horário de maior incidência criminal está coincidindo com o QMD da FM?
- modelo_emprego: A dinâmica criminal coincide com o modelo de emprego da FM (moto/pé/viatura)?
- fatores_urbanos: Os fatores urbanos relevantes estão sendo resolvidos pelos órgãos competentes?

Para cada pergunta: diagnóstico com base nos dados (1–2 frases), recomendação operacional para a FM (1–2 frases) e observação opcional."""

    try:
        return _call_structured(
            system=SYSTEM_PERGUNTAS,
            user=prompt,
            tool_name="responder_perguntas",
            tool_description="Responde às 4 perguntas norteadoras do CompStat Municipal.",
            schema=_SCHEMA_PERGUNTAS,
        )
    except Exception as e:
        empty = {"diagnostico": f"Erro: {e}", "operacao_fm": "", "obs": ""}
        return {
            "rota_fm": empty,
            "horario_cobertura": empty,
            "modelo_emprego": empty,
            "fatores_urbanos": empty,
        }


# ---------------------------------------------------------------------------
# 5. Plano de Ação hiper-específico
# ---------------------------------------------------------------------------

SYSTEM_PLANO = """Você é o assistente de planejamento operacional do CompStat Municipal.
Gera planos de ação concretos, localizados e justificados, prontos para serem
formalizados na reunião de CompStat com os órgãos responsáveis."""

_SCHEMA_ACAO: dict = {
    "type": "object",
    "properties": {
        "orgao": {"type": "string"},
        "acao": {"type": "string"},
        "local": {"type": "string", "description": "Logradouro + trecho específico"},
        "justificativa": {
            "type": "string",
            "description": "Referência cruzada: crime + fator + dinâmica",
        },
        "prioridade": {
            "type": "string",
            "enum": ["URGENTE", "PRIORITÁRIA", "RECOMENDADA"],
        },
        "prazo_sugerido": {
            "type": "string",
            "enum": ["imediato", "7 dias", "30 dias"],
        },
    },
    "required": [
        "orgao",
        "acao",
        "local",
        "justificativa",
        "prioridade",
        "prazo_sugerido",
    ],
}

_SCHEMA_PLANO: dict = {
    "type": "object",
    "properties": {
        "acoes": {
            "type": "array",
            "items": _SCHEMA_ACAO,
            "minItems": 6,
            "maxItems": 12,
        }
    },
    "required": ["acoes"],
}


def gerar_plano_acao(
    area_name: str,
    bingos: list[BingoSegmento],
    relint_data: dict,
    denuncia_data: dict,
) -> list[dict]:
    """Gera lista de ações específicas por órgão responsável."""
    import json

    bingo_context = []
    for b in bingos[:10]:
        if b.score_total >= 3:
            bingo_context.append(
                {
                    "logradouro": b.logradouro,
                    "score": b.score_total,
                    "crimes": b.crimes_count,
                    "hora_pico": b.hora_pico,
                    "pct_noturno": round(b.pct_noturno, 0),
                    "fatores": b.tipos_fatores,
                    "orgaos": b.orgaos_responsaveis,
                    "denuncias": b.denuncias_count,
                }
            )

    prompt = f"""Área FM: **{area_name}**

TRECHOS CRÍTICOS (Bingo Score):
{json.dumps(bingo_context, ensure_ascii=False, indent=2)}

DADOS DO RELINT:
- Modus operandi: {"; ".join(relint_data.get("modus_operandi", [])[:4])}
- Rotas de fuga: {"; ".join(relint_data.get("rotas_fuga", [])[:3])}
- Pontos de receptação: {"; ".join(relint_data.get("pontos_receptacao", [])[:3])}
- Recomendações de campo: {"; ".join(relint_data.get("recomendacoes_campo", [])[:4])}

LOCAIS CRÍTICOS CITADOS NO DISQUE DENÚNCIA:
{"; ".join(denuncia_data.get("locais_criticos_citados", [])[:5])}

Gere de 6 a 12 ações no Plano de Ação, cobrindo os órgãos:
FM (Força Municipal), COMLURB, Rio Luz, SECONSERVA, SEOP, SMAS, CET-Rio, GM-Rio, SMTR.

REGRAS:
- Cada ação deve ser ESPECÍFICA: mencione o logradouro exato e o trecho (ex: "entre nº 500–1000")
- A justificativa deve CRUZAR as camadas: "trecho com X crimes + fator Y + Z denúncias"
- Para a FM: especifique modalidade (moto/a pé/viatura), horário e segmento de patrulha
- Priorize URGENTE para scores ≥8, PRIORITÁRIA para 6–7, RECOMENDADA para 3–5"""

    try:
        result = _call_structured(
            system=SYSTEM_PLANO,
            user=prompt,
            tool_name="gerar_plano",
            tool_description="Gera o plano de ação por órgão responsável para a área.",
            schema=_SCHEMA_PLANO,
            max_tokens=2000,
        )
        return result.get("acoes", [])
    except Exception as e:
        return [
            {
                "orgao": "ERRO",
                "acao": f"Erro na geração: {e}",
                "local": "",
                "justificativa": "",
                "prioridade": "",
                "prazo_sugerido": "",
            }
        ]


# ---------------------------------------------------------------------------
# Orquestrador principal
# ---------------------------------------------------------------------------
# TODO: paralelizar extrair_dinamica_relint e sintetizar_denuncias com asyncio.gather
# (as duas chamadas são independentes e podem rodar em paralelo)


def analisar_area_completo(
    area_name: str,
    relint_text: str | None,
    relatos_denuncias: list[str],
    crimes_total: int,
    hora_pico_area: int | None,
    top_logradouros: list[str],
    bingos: list[BingoSegmento],
) -> dict:
    """
    Executa todos os módulos LLM para uma área e retorna um dicionário
    com todos os resultados prontos para o relatório.
    """
    relint_data: dict = {}
    if relint_text:
        relint_data = extrair_dinamica_relint(relint_text, area_name)

    denuncia_data = sintetizar_denuncias(relatos_denuncias, area_name)

    narrativa = gerar_narrativa_dinamica(
        area_name=area_name,
        relint_data=relint_data,
        denuncia_data=denuncia_data,
        crimes_total=crimes_total,
        hora_pico_area=hora_pico_area,
        top_logradouros=top_logradouros,
    )

    bingos_criticos = [b for b in bingos if b.score_total >= 7]
    perguntas = responder_perguntas_norteadoras(
        area_name=area_name,
        crimes_total=crimes_total,
        hora_pico_area=hora_pico_area,
        top_logradouros=top_logradouros,
        relint_data=relint_data,
        denuncia_data=denuncia_data,
        bingos_criticos=bingos_criticos,
    )

    plano = gerar_plano_acao(
        area_name=area_name,
        bingos=bingos,
        relint_data=relint_data,
        denuncia_data=denuncia_data,
    )

    return {
        "relint_data": relint_data,
        "denuncia_data": denuncia_data,
        "narrativa_dinamica": narrativa,
        "perguntas_norteadoras": perguntas,
        "plano_acao": plano,
    }
