"""
Classificador de relevância para tweets — etapa anterior ao extractor
ontológico.

Decisão de escopo (briefing do produto):
    - Manter APENAS tweets sobre roubo / furto OU fatores urbanos que
      influenciem em roubos/furtos, NO Rio de Janeiro.
    - Descartar tiroteios, prisões, apreensões, operações policiais,
      tráfico, mesmo que sejam segurança pública. O foco é crime
      patrimonial e suas condições facilitadoras.
    - Descartar conteúdo de outras cidades.

Por que uma camada separada:
    O extractor ontológico (LLMExtractor) é caro — extrai ~20 facetas
    estruturadas (vítima, agente, MO, ambiente, etc). Não faz sentido
    pagar por isso em tweets que vão ser descartados na primeira etapa
    de análise downstream. O classificador roda primeiro, devolve
    is_relevant + categoria, e só os relevantes passam adiante.

Design:
    - Schema Pydantic local (TweetRelevance). Não polui ontology.py.
    - Prompt caching no system (rubrica + exemplos são fixos).
    - SDK sync — alinhado com llm.py. Async fica para quando a fila
      crescer (centenas/milhares).
    - Stub offline quando ANTHROPIC_API_KEY ausente (CI / testes).
"""

from __future__ import annotations

import json
import logging
import re
from datetime import datetime
from enum import Enum
from textwrap import dedent
from typing import Optional

from pydantic import BaseModel, Field


log = logging.getLogger("valente_ontology.extractors.relevance")


DEFAULT_MODEL = "claude-opus-4-7"


# ─────────────────────────────────────────────────────────────────────────
# Schema
# ─────────────────────────────────────────────────────────────────────────


class RelevanceCategory(str, Enum):
    """Categoria fina do que o tweet trata.

    `irrelevante` é o estado terminal — qualquer coisa que não seja
    roubo, furto ou fator urbano relacionado vai para cá (inclusive
    outras formas de violência, política, propaganda, esporte, etc).
    """

    ROUBO = "roubo"
    FURTO = "furto"
    FATOR_URBANO_RELACIONADO = "fator_urbano_relacionado"
    OUTRO_CRIME = "outro_crime"          # tiroteio, prisão, apreensão, tráfico
    IRRELEVANTE = "irrelevante"          # propaganda, política, esporte, etc


class TweetRelevance(BaseModel):
    """Veredicto de relevância para um tweet."""

    is_rio_de_janeiro: bool = Field(
        description=(
            "True quando o tweet refere-se inequivocamente à cidade do RJ "
            "(bairros, ruas, eventos locais, polícia carioca). False quando "
            "é claramente outra cidade. Quando ambíguo, é False."
        )
    )
    category: RelevanceCategory
    is_relevant: bool = Field(
        description=(
            "True SE e SOMENTE SE is_rio_de_janeiro AND category ∈ "
            "{roubo, furto, fator_urbano_relacionado}."
        )
    )
    confidence: float = Field(
        ge=0.0, le=1.0,
        description="Confiança 0–1. <0.5 indica decisão duvidosa.",
    )
    reasoning: str = Field(
        description="1 frase explicando a decisão.",
        max_length=400,
    )
    classified_at: datetime = Field(default_factory=datetime.utcnow)
    model_id: str = ""

    def to_jsonl_line(self) -> str:
        return self.model_dump_json(exclude_none=False)


# ─────────────────────────────────────────────────────────────────────────
# Prompt
# ─────────────────────────────────────────────────────────────────────────


def _build_system_prompt() -> str:
    """Prompt estável, cacheável. Detalhado o suficiente para opus-4-7
    cachear (mínimo 4096 tokens). Estrutura: papel → escopo → critérios
    → exemplos categorizados → formato de saída."""
    return dedent("""\
        Você é um classificador de relevância para uma plataforma de
        inteligência criminal da Força Municipal do Rio de Janeiro. Sua
        tarefa: olhar para o texto de um único tweet e decidir se ele
        descreve ou está relacionado a ROUBO ou FURTO no município do
        Rio de Janeiro, ou a fatores urbanos que facilitam esses crimes.

        ## ESCOPO — o que ENTRA

        Categoria `roubo`:
            Subtração de bem com violência ou grave ameaça à pessoa.
            Exemplos: assalto à mão armada, arrastão, sequestro-relâmpago,
            "levaram meu celular sob ameaça", roubo de carga, roubo de
            veículo com motorista, latrocínio.

        Categoria `furto`:
            Subtração de bem SEM violência ou ameaça. Exemplos: furto de
            celular em show/metrô/praia, batedor de carteira, "perdi meu
            celular em festa" (suspeita de furto), furto de bicicleta,
            furto em residência sem ameaça aos ocupantes.

        Categoria `fator_urbano_relacionado`:
            Condição do espaço urbano que CRIA OPORTUNIDADE para roubo ou
            furto. Inclui: poste apagado, rua escura/sem iluminação,
            terreno baldio, calçadão deserto, ponto cego de câmera,
            comunidade abandonada pelo poder público COM contexto de
            insegurança patrimonial, calçada quebrada que força pedestres
            para a rua em local de assaltos. **Atenção**: o fator urbano
            sozinho NÃO entra; precisa haver ligação plausível com roubo
            ou furto no contexto do tweet ou na fonte da postagem (perfis
            de alerta de assalto, jornais cobrindo segurança patrimonial).

        ## ESCOPO — o que FICA DE FORA

        Categoria `outro_crime`:
            Outras formas de violência ou segurança pública que NÃO são
            roubo nem furto. Inclui:
              - Tiroteio, troca de tiros
              - Apreensão de armas, drogas, munição
              - Prisão de criminoso, cumprimento de mandado
              - Operação policial (mesmo que vise quadrilhas de roubo)
              - Tráfico, facções, disputa territorial
              - Homicídio, feminicídio, latrocínio descontextualizado de roubo
              - Esfaqueamento sem subtração patrimonial
              - Estupro, violência doméstica
              - Crimes ambientais

        Categoria `irrelevante`:
            Conteúdo sem relação direta com crime patrimonial. Inclui
            propaganda, política, futebol, clima, lançamento de produto,
            comemorações, notícias culturais, conteúdo motivacional,
            humor, evento esportivo, informe institucional sem caso
            concreto de roubo/furto.

        ## REGIONALIDADE — RJ

        `is_rio_de_janeiro = true` quando há indicação razoável de que o
        fato é na cidade do Rio de Janeiro:
            - Bairros cariocas (Copacabana, Tijuca, Jacarepaguá, Méier,
              Santa Cruz, Centro, Botafogo, Bonsucesso, Madureira, Méier,
              Penha, Engenho Novo, etc).
            - Logradouros e referências (Avenida Brasil, Linha Vermelha,
              Linha Amarela, Aterro, Maracanã, Cristo, Pão de Açúcar).
            - Forças cariocas que atuam no município: PMERJ atuando na
              capital, GM-Rio (Guarda Municipal Rio), SEOP-Rio, Polícia
              Civil em delegacias do Rio (DPs com número específico do RJ).
            - Hashtags carioca-explicitas: #RJ, #RiodeJaneiro, #Rio,
              #CidadeMaravilhosa.

        `is_rio_de_janeiro = false` quando:
            - O tweet é claramente sobre outro estado / outra cidade.
            - O tweet fala de "RJ" no sentido de estado mas o fato é em
              cidade da Baixada/Grande Rio que NÃO é o município do Rio
              (Niterói, São Gonçalo, Duque de Caxias, Nova Iguaçu,
              Belford Roxo, Mesquita, etc são fora do escopo).
            - PMERJ posta sobre operação em município que não é a capital.

        Quando AMBÍGUO (não há localização clara), retorne FALSE — preferimos
        falso negativo a falso positivo aqui, porque a base downstream
        é focada na capital.

        ## REGRA TERMINAL

            is_relevant = is_rio_de_janeiro
                          AND category ∈ {roubo, furto, fator_urbano_relacionado}

        Se is_rio_de_janeiro for false, is_relevant é false ainda que a
        categoria seja roubo. Se a categoria for outro_crime ou
        irrelevante, is_relevant é false mesmo no RJ.

        ## EXEMPLOS DE CALIBRAÇÃO

        Tweet: "Mulher tem celular furtado dentro do metrô na estação Carioca"
        → is_rio_de_janeiro=true, category=furto, is_relevant=true
          reasoning="Furto sem ameaça em transporte público da capital (Carioca)."

        Tweet: "Arrastão em Copacabana neste fim de semana, turistas perdem celulares e relógios"
        → is_rio_de_janeiro=true, category=roubo, is_relevant=true
          reasoning="Arrastão (roubo coletivo) em bairro carioca."

        Tweet: "Avenida Brasil sem iluminação há semanas, motoristas relatam assaltos no breu"
        → is_rio_de_janeiro=true, category=fator_urbano_relacionado, is_relevant=true
          reasoning="Falta de iluminação em via carioca explicitamente ligada a assaltos."

        Tweet: "Policiais do 29BPM apreenderam fuzil AK-47 em comunidade durante operação"
        → is_rio_de_janeiro=true, category=outro_crime, is_relevant=false
          reasoning="Apreensão em operação policial — fora do escopo (não é roubo nem furto)."

        Tweet: "Tiroteio intenso em comunidade da Penha durante operação da Polícia Civil"
        → is_rio_de_janeiro=true, category=outro_crime, is_relevant=false
          reasoning="Tiroteio — violência sem componente patrimonial."

        Tweet: "Preso traficante que comandava o tráfico no Complexo do Alemão"
        → is_rio_de_janeiro=true, category=outro_crime, is_relevant=false
          reasoning="Prisão por tráfico — fora do escopo."

        Tweet: "Avenida Brasil com buracos enormes prejudica trânsito de manhã"
        → is_rio_de_janeiro=true, category=irrelevante, is_relevant=false
          reasoning="Problema urbano sem ligação com roubo/furto."

        Tweet: "Flamengo vence o Vasco no Maracanã"
        → is_rio_de_janeiro=true, category=irrelevante, is_relevant=false
          reasoning="Esporte — sem relação com crime."

        Tweet: "Assalto a banco no centro de São Paulo termina com troca de tiros"
        → is_rio_de_janeiro=false, category=roubo, is_relevant=false
          reasoning="Roubo, mas fora do RJ (São Paulo)."

        Tweet: "Vítima tem moto roubada em Niterói perto do Mercado"
        → is_rio_de_janeiro=false, category=roubo, is_relevant=false
          reasoning="Roubo no estado do RJ, mas Niterói não é a capital — fora do escopo."

        Tweet: "Bom dia! Hoje estamos com céu nublado na cidade. Bom feriado!"
        → is_rio_de_janeiro=false, category=irrelevante, is_relevant=false
          reasoning="Saudação/clima sem indicação geográfica útil."

        Tweet: "Roubo de carga na Dutra altura de Caxias, dois caminhões"
        → is_rio_de_janeiro=false, category=roubo, is_relevant=false
          reasoning="Roubo, mas em Caxias (fora da capital)."

        Tweet: "Câmera registra dupla em moto roubando pedestre na rua das Laranjeiras"
        → is_rio_de_janeiro=true, category=roubo, is_relevant=true
          reasoning="Roubo registrado em bairro carioca (Laranjeiras)."

        Tweet: "Polícia recuperou veículo que havia sido roubado em Realengo"
        → is_rio_de_janeiro=true, category=roubo, is_relevant=true
          reasoning="Recuperação de carro roubado em bairro carioca — o evento de roubo é o que interessa."

        Tweet: "Posto da Linha Amarela com luz queimada virou ponto de assalto, dizem motoristas"
        → is_rio_de_janeiro=true, category=fator_urbano_relacionado, is_relevant=true
          reasoning="Iluminação pública defeituosa em via carioca explicitamente ligada a assaltos."

        Tweet: "Confira nossa programação cultural do fim de semana"
        → is_rio_de_janeiro=false, category=irrelevante, is_relevant=false
          reasoning="Conteúdo cultural sem informação de localização ou crime."

        ## FORMATO DE SAÍDA

        Responda SOMENTE com um objeto JSON no formato abaixo. Sem markdown,
        sem prosa, sem ```json. O parser do nosso lado é estrito.

        {
          "is_rio_de_janeiro": <bool>,
          "category": "<roubo|furto|fator_urbano_relacionado|outro_crime|irrelevante>",
          "is_relevant": <bool>,
          "confidence": <float entre 0.0 e 1.0>,
          "reasoning": "<1 frase curta em português>"
        }

        Se você não tem certeza, baixe a confidence e prefira is_relevant=false.
        Em caso de empate categorial, prefira a categoria mais restrita
        (irrelevante > outro_crime > furto > roubo > fator_urbano_relacionado).
        """)


def _build_user_prompt(tweet: dict) -> str:
    """Monta o prompt do tweet incluindo metadados que ajudam o modelo
    a decidir (autor — perfil oficial vs cidadão — costuma sinalizar a
    natureza do tweet)."""
    text = (tweet.get("text") or "").strip()
    account = tweet.get("account", "")
    author = tweet.get("author_username", "")
    hashtags = tweet.get("hashtags") or []
    created_at = tweet.get("created_at", "")

    parts = [
        "Classifique o tweet abaixo conforme as regras do prompt de sistema.",
        "",
        f"Perfil consultado: @{account}",
        f"Autor da postagem: @{author}",
        f"Data: {created_at}",
    ]
    if hashtags:
        parts.append(f"Hashtags: {' '.join('#' + h for h in hashtags[:10])}")
    parts += ["", "Texto:", '"""', text, '"""']
    return "\n".join(parts)


# ─────────────────────────────────────────────────────────────────────────
# Classifier
# ─────────────────────────────────────────────────────────────────────────


class RelevanceClassifier:
    """Classifica tweets via Claude. Reaproveita o Anthropic client para
    aproveitar prompt caching entre chamadas."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        model: str = DEFAULT_MODEL,
        max_tokens: int = 512,
        temperature: float = 0.0,        # aceito mas ignorado (Opus 4.7 removeu sampling params)
    ):
        try:
            from anthropic import Anthropic
        except ImportError as e:
            raise RuntimeError(
                "Pacote `anthropic` não instalado. Rode `uv add anthropic`."
            ) from e
        self._client = Anthropic(api_key=api_key) if api_key else Anthropic()
        self.model = model
        self.max_tokens = max_tokens
        self._system_prompt = _build_system_prompt()

    def classify(self, tweet: dict) -> Optional[TweetRelevance]:
        """Devolve `TweetRelevance` ou None em caso de erro de API/parse."""
        text = (tweet.get("text") or "").strip()
        if not text:
            return None

        user_prompt = _build_user_prompt(tweet)
        try:
            resp = self._client.messages.create(
                model=self.model,
                max_tokens=self.max_tokens,
                # Sem `temperature` — Opus 4.7 removeu sampling parameters.
                system=[
                    {
                        "type": "text",
                        "text": self._system_prompt,
                        "cache_control": {"type": "ephemeral"},
                    }
                ],
                messages=[{"role": "user", "content": user_prompt}],
            )
        except Exception as e:
            log.warning("Falha LLM classify (tweet_id=%s): %s",
                        tweet.get("tweet_id"), e)
            return None

        raw = _join_text(resp)
        payload = _parse_json_loose(raw)
        if payload is None:
            log.warning("JSON inválido na classificação (tweet_id=%s): %r",
                        tweet.get("tweet_id"), raw[:200])
            return None

        # O LLM pode esquecer de aplicar a regra terminal — refazemos do nosso lado.
        try:
            payload["model_id"] = self.model
            obj = TweetRelevance.model_validate(payload)
        except Exception as e:
            log.warning("Validação Pydantic falhou para tweet_id=%s: %s",
                        tweet.get("tweet_id"), e)
            return None

        # Refortalece a invariante: is_relevant é deterministicamente
        # derivado de is_rio_de_janeiro + category.
        derived = obj.is_rio_de_janeiro and obj.category in {
            RelevanceCategory.ROUBO,
            RelevanceCategory.FURTO,
            RelevanceCategory.FATOR_URBANO_RELACIONADO,
        }
        if derived != obj.is_relevant:
            obj = obj.model_copy(update={"is_relevant": derived})

        return obj


# ─────────────────────────────────────────────────────────────────────────
# Offline stub — útil em CI / quando ANTHROPIC_API_KEY ausente
# ─────────────────────────────────────────────────────────────────────────


def build_offline_stub_classifier():
    """Versão sem API que retorna sempre `irrelevante` + confidence=0.

    Útil para validar o pipeline sem queimar tokens. NÃO usar em produção:
    descarta tudo. O `classify-tweets --offline` do CLI sinaliza isso ao
    usuário."""

    class _Stub:
        model = "offline-stub"

        def classify(self, tweet: dict) -> Optional[TweetRelevance]:
            if not (tweet.get("text") or "").strip():
                return None
            return TweetRelevance(
                is_rio_de_janeiro=False,
                category=RelevanceCategory.IRRELEVANTE,
                is_relevant=False,
                confidence=0.0,
                reasoning="Sem ANTHROPIC_API_KEY — classifier stub.",
                model_id="offline-stub",
            )

    return _Stub()


# ─────────────────────────────────────────────────────────────────────────
# Helpers (cópia das idéias usadas em llm.py — JSON tolerante)
# ─────────────────────────────────────────────────────────────────────────


def _join_text(resp) -> str:
    parts = []
    for block in getattr(resp, "content", []) or []:
        t = getattr(block, "text", None)
        if t:
            parts.append(t)
    return "".join(parts).strip()


_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.IGNORECASE | re.MULTILINE)


def _parse_json_loose(text: str) -> Optional[dict]:
    if not text:
        return None
    cleaned = _FENCE_RE.sub("", text).strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        start = cleaned.find("{")
        if start < 0:
            return None
        depth = 0
        for i in range(start, len(cleaned)):
            if cleaned[i] == "{":
                depth += 1
            elif cleaned[i] == "}":
                depth -= 1
                if depth == 0:
                    try:
                        return json.loads(cleaned[start : i + 1])
                    except json.JSONDecodeError:
                        return None
        return None
