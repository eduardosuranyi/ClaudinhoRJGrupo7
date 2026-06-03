"""
Vocabulário controlado da ontologia criminal.

Decisão de design: valores em **português** (domínio é Rio de Janeiro,
agentes da Força Municipal e Disque Denúncia produzem texto em PT). Cada
enum traz um membro `DESCONHECIDO` ou `OUTRO` para que o LLM nunca seja
forçado a chutar — quando o texto-fonte não diz, registre o desconhecimento
explicitamente em vez de inferir.

Quando estender este arquivo, mantenha cada enum **fechado** (sem strings
livres) — é isso que permite agregação, comparação entre áreas e o cálculo
de score a jusante.
"""

from __future__ import annotations

from enum import Enum


# ─────────────────────────────────────────────────────────────────────────
# Tempo
# ─────────────────────────────────────────────────────────────────────────


class DayPart(str, Enum):
    """Faixa horária qualitativa. Permite agrupar quando a hora exata
    é desconhecida (ex.: relato diz "à noite")."""

    MADRUGADA = "madrugada"          # 00–05
    AMANHECER = "amanhecer"          # 05–07
    MANHA = "manha"                  # 07–12
    TARDE = "tarde"                  # 12–17
    ENTARDECER = "entardecer"        # 17–19
    NOITE = "noite"                  # 19–24
    DESCONHECIDO = "desconhecido"


class WeekdayBracket(str, Enum):
    DIA_UTIL = "dia_util"
    FIM_SEMANA = "fim_semana"
    FERIADO = "feriado"
    DESCONHECIDO = "desconhecido"


# ─────────────────────────────────────────────────────────────────────────
# Vítimas
# ─────────────────────────────────────────────────────────────────────────


class Gender(str, Enum):
    MASCULINO = "masculino"
    FEMININO = "feminino"
    OUTRO = "outro"
    DESCONHECIDO = "desconhecido"


class AgeBracket(str, Enum):
    CRIANCA = "crianca"              # < 12
    ADOLESCENTE = "adolescente"      # 12–17
    JOVEM = "jovem"                  # 18–29
    ADULTO = "adulto"                # 30–59
    IDOSO = "idoso"                  # 60+
    DESCONHECIDO = "desconhecido"


class VictimReaction(str, Enum):
    PASSIVA = "passiva"              # entregou bens sem resistir
    VERBAL = "verbal"                # gritou, pediu socorro, negociou
    FISICA_NAO_LETAL = "fisica_nao_letal"
    FISICA_LETAL = "fisica_letal"    # neutralizou/matou agente
    FUGA = "fuga"                    # conseguiu evadir-se
    DESCONHECIDA = "desconhecida"


# ─────────────────────────────────────────────────────────────────────────
# Agentes (autores)
# ─────────────────────────────────────────────────────────────────────────


class SkinTone(str, Enum):
    BRANCA = "branca"
    PARDA = "parda"
    PRETA = "preta"
    AMARELA = "amarela"
    INDIGENA = "indigena"
    DESCONHECIDA = "desconhecida"


class Build(str, Enum):
    MAGRO = "magro"
    MEDIO = "medio"
    FORTE = "forte"
    OBESO = "obeso"
    DESCONHECIDO = "desconhecido"


class HeightBracket(str, Enum):
    BAIXA = "baixa"                  # até ~1,65 m
    MEDIA = "media"                  # ~1,65–1,80 m
    ALTA = "alta"                    # > ~1,80 m
    DESCONHECIDA = "desconhecida"


# ─────────────────────────────────────────────────────────────────────────
# Veículos e mobilidade
# ─────────────────────────────────────────────────────────────────────────


class VehicleType(str, Enum):
    A_PE = "a_pe"
    BICICLETA = "bicicleta"
    PATINETE = "patinete"
    MOTO = "moto"
    CARRO = "carro"
    VAN = "van"
    ONIBUS = "onibus"
    METRO = "metro"
    TREM = "trem"
    BARCA = "barca"
    OUTRO = "outro"
    DESCONHECIDO = "desconhecido"


class VehicleRole(str, Enum):
    """Função do veículo no evento."""

    CHEGADA = "chegada"              # usado só para chegar
    FUGA = "fuga"                    # usado só para fugir
    CHEGADA_E_FUGA = "chegada_e_fuga"
    ALVO = "alvo"                    # o próprio veículo foi o alvo do crime
    DESCONHECIDO = "desconhecido"


# ─────────────────────────────────────────────────────────────────────────
# Armas e objetos
# ─────────────────────────────────────────────────────────────────────────


class WeaponType(str, Enum):
    NENHUMA = "nenhuma"
    ARMA_FOGO = "arma_fogo"
    ARMA_BRANCA = "arma_branca"
    OBJETO_CONTUNDENTE = "objeto_contundente"   # pedra, pedaço de pau, coronha
    SIMULACRO = "simulacro"                     # arma falsa / objeto que finge ser
    QUIMICO = "quimico"                         # spray de pimenta, ácido
    FORCA_FISICA = "forca_fisica"               # mão, soco-inglês, mata-leão
    OUTRA = "outra"
    DESCONHECIDA = "desconhecida"


# ─────────────────────────────────────────────────────────────────────────
# Itens furtados / roubados
# ─────────────────────────────────────────────────────────────────────────


class StolenItemType(str, Enum):
    CELULAR = "celular"
    CELULAR_DESBLOQUEADO = "celular_desbloqueado"   # importante: implica acesso a apps
    DINHEIRO_ESPECIE = "dinheiro_especie"
    CONTA_BANCARIA_ACESSADA = "conta_bancaria_acessada"
    CARTAO_BANCARIO = "cartao_bancario"
    RELOGIO = "relogio"
    CORDAO_JOIA = "cordao_joia"
    BOLSA_MOCHILA = "bolsa_mochila"
    NOTEBOOK = "notebook"
    CARRO = "carro"
    MOTO = "moto"
    BICICLETA = "bicicleta"
    ROUPAS_TENIS = "roupas_tenis"
    DOCUMENTOS = "documentos"
    CHAVES = "chaves"
    MERCADORIA_COMERCIAL = "mercadoria_comercial"   # roubo a estabelecimento
    OUTRO = "outro"
    DESCONHECIDO = "desconhecido"


# ─────────────────────────────────────────────────────────────────────────
# Abordagem (como o agente surpreendeu/iniciou o ato)
# ─────────────────────────────────────────────────────────────────────────


class ApproachType(str, Enum):
    SURPRESA_POR_TRAS = "surpresa_por_tras"
    ABORDAGEM_FRONTAL = "abordagem_frontal"
    ANUNCIO_VERBAL = "anuncio_verbal"                # "perdeu, passa tudo"
    ATAQUE_DIRETO = "ataque_direto"                  # agride/atira antes de qualquer fala
    CERCO = "cerco"                                  # múltiplos agentes cercam vítima
    SEQUESTRO_RELAMPAGO = "sequestro_relampago"
    ENGENHARIA_SOCIAL = "engenharia_social"          # golpe, falsa identidade
    INVASAO_DOMICILIO = "invasao_domicilio"
    INVASAO_ESTABELECIMENTO = "invasao_estabelecimento"
    ARRASTAO = "arrastao"
    ABORDAGEM_VEICULO_PARADO = "abordagem_veiculo_parado"   # carro no semáforo
    OUTRA = "outra"
    DESCONHECIDA = "desconhecida"


# ─────────────────────────────────────────────────────────────────────────
# Fuga
# ─────────────────────────────────────────────────────────────────────────


class EscapeType(str, Enum):
    A_PE_CORRENDO = "a_pe_correndo"
    VEICULO_ALTA_VELOCIDADE = "veiculo_alta_velocidade"
    VEICULO_DISCRETO = "veiculo_discreto"            # saída calma de carro/moto
    TRANSPORTE_COLETIVO = "transporte_coletivo"      # entrou em ônibus/metrô
    PULOU_MURO = "pulou_muro"                        # ex.: muro da Supervia
    ENTROU_NA_MATA = "entrou_na_mata"
    ENTROU_EM_COMUNIDADE = "entrou_em_comunidade"    # território de difícil acesso
    MISTUROU_NA_MULTIDAO = "misturou_na_multidao"
    NAO_FUGIU = "nao_fugiu"                          # preso em flagrante / neutralizado
    OUTRA = "outra"
    DESCONHECIDA = "desconhecida"


# ─────────────────────────────────────────────────────────────────────────
# Modus operandi (tags múltiplas — um evento pode ter várias)
# ─────────────────────────────────────────────────────────────────────────


class MOTactic(str, Enum):
    AMEACA_VERBAL = "ameaca_verbal"
    AMEACA_ARMA_FOGO = "ameaca_arma_fogo"
    AMEACA_ARMA_BRANCA = "ameaca_arma_branca"
    AGRESSAO_FISICA = "agressao_fisica"
    FERIMENTO_LEVE = "ferimento_leve"
    FERIMENTO_GRAVE = "ferimento_grave"
    DISPARO_ARMA_FOGO = "disparo_arma_fogo"
    FACADA = "facada"
    CORONHADA = "coronhada"
    ARRASTAO = "arrastao"
    PERSEGUICAO = "perseguicao"
    COMBATE_FISICO = "combate_fisico"
    FURTO_DISCRETO = "furto_discreto"               # sem confronto / batedor de carteira
    GOLPE_BANCARIO = "golpe_bancario"               # vítima foi induzida a transferir
    GOLPE_ENGENHARIA_SOCIAL = "golpe_engenharia_social"
    RECEPTACAO = "receptacao"                       # papel acessório no fluxo
    OUTRO = "outro"


# ─────────────────────────────────────────────────────────────────────────
# Local
# ─────────────────────────────────────────────────────────────────────────


class VenueType(str, Enum):
    CALCADA = "calcada"
    VIA_PUBLICA = "via_publica"                     # no meio da rua
    INTERIOR_VEICULO = "interior_veiculo"           # dentro do próprio carro
    INTERIOR_TRANSPORTE_COLETIVO = "interior_transporte_coletivo"
    PONTO_DE_ONIBUS = "ponto_de_onibus"
    ESTACAO_METRO = "estacao_metro"
    ESTACAO_TREM = "estacao_trem"
    BARCA_TERMINAL = "barca_terminal"
    INTERIOR_ESTABELECIMENTO = "interior_estabelecimento"  # loja, banco, lanchonete
    FRENTE_ESTABELECIMENTO = "frente_estabelecimento"
    RESIDENCIA = "residencia"
    AREA_VERDE_MATA = "area_verde_mata"
    AREA_ESCOLAR = "area_escolar"
    AREA_HOSPITALAR = "area_hospitalar"
    EVENTO_AGLOMERACAO = "evento_aglomeracao"
    OUTRO = "outro"
    DESCONHECIDO = "desconhecido"


# ─────────────────────────────────────────────────────────────────────────
# Ambiente
# ─────────────────────────────────────────────────────────────────────────


class TrafficLevel(str, Enum):
    DESERTO = "deserto"
    BAIXO = "baixo"
    MEDIO = "medio"
    ALTO = "alto"
    DESCONHECIDO = "desconhecido"


class LightingLevel(str, Enum):
    AUSENTE = "ausente"                             # apagada
    DEFICIENTE = "deficiente"                       # bruxuleia / postes parciais
    ADEQUADA = "adequada"
    LUZ_DIA = "luz_dia"
    DESCONHECIDA = "desconhecida"


class PatrolPresence(str, Enum):
    PRESENTE_DURANTE = "presente_durante"
    AUSENTE = "ausente"
    RECEM_RETIRADA = "recem_retirada"               # crime ocorreu logo após patrulha sair
    DESCONHECIDA = "desconhecida"


class UrbanFactorTag(str, Enum):
    """Subconjunto-alvo dos fatores urbanos do dataset `fatores_urbanos.csv`.
    Mantém compatibilidade conceitual com o catálogo do `luiz/config.py`."""

    ILUMINACAO_DEFICIENTE = "iluminacao_deficiente"
    VEGETACAO_OBSTRUINDO_VISIBILIDADE = "vegetacao_obstruindo_visibilidade"
    VEGETACAO_COBRINDO_ILUMINACAO = "vegetacao_cobrindo_iluminacao"
    LIXO_ENTULHO_NA_VIA = "lixo_entulho_na_via"
    CALCADA_ESTREITA = "calcada_estreita"
    MOBILIARIO_ABANDONADO = "mobiliario_abandonado"
    TAPUME_VAO_ESCONDERIJO = "tapume_vao_esconderijo"
    COMERCIO_IRREGULAR = "comercio_irregular"
    ESTACIONAMENTO_IRREGULAR = "estacionamento_irregular"
    VEICULOS_GRANDES_OBSTRUINDO = "veiculos_grandes_obstruindo"
    PONTO_RETENCAO_TRAFEGO = "ponto_retencao_trafego"
    MOTO_NO_PASSEIO = "moto_no_passeio"
    PONTO_ONIBUS_VANDALIZADO = "ponto_onibus_vandalizado"
    PESSOAS_EM_SITUACAO_RUA = "pessoas_em_situacao_rua"
    CENA_DE_USO_DROGAS = "cena_de_uso_drogas"
    OUTRO = "outro"


# ─────────────────────────────────────────────────────────────────────────
# Desfecho
# ─────────────────────────────────────────────────────────────────────────


class CrimeOutcomeStatus(str, Enum):
    """Resultado da ação criminosa do ponto de vista do agente."""

    CONSUMADO = "consumado"                         # agente levou o que queria
    TENTATIVA_FRACASSADA = "tentativa_fracassada"   # vítima fugiu / reagiu / nada levado
    INTERROMPIDO_POR_TERCEIROS = "interrompido_por_terceiros"
    AGENTE_PRESO_EM_FLAGRANTE = "agente_preso_em_flagrante"
    AGENTE_NEUTRALIZADO = "agente_neutralizado"     # ferido/morto pela vítima ou terceiro
    DESCONHECIDO = "desconhecido"


# ─────────────────────────────────────────────────────────────────────────
# Tipo de crime (camada acima da ontologia — para roteamento/agregação)
# ─────────────────────────────────────────────────────────────────────────


class CrimeType(str, Enum):
    ROUBO_TRANSEUNTE = "roubo_transeunte"
    ROUBO_VEICULO = "roubo_veiculo"
    ROUBO_INTERIOR_VEICULO = "roubo_interior_veiculo"
    ROUBO_ESTABELECIMENTO = "roubo_estabelecimento"
    ROUBO_RESIDENCIA = "roubo_residencia"
    ROUBO_CARGA = "roubo_carga"
    ROUBO_TRANSPORTE_COLETIVO = "roubo_transporte_coletivo"
    SEQUESTRO_RELAMPAGO = "sequestro_relampago"
    FURTO = "furto"
    FURTO_VEICULO = "furto_veiculo"
    GOLPE_FRAUDE = "golpe_fraude"
    OUTRO = "outro"
    DESCONHECIDO = "desconhecido"


# ─────────────────────────────────────────────────────────────────────────
# Origem do dado
# ─────────────────────────────────────────────────────────────────────────


class SourceKind(str, Enum):
    """De qual loader o evento veio. Determina qualidade e granularidade."""

    OCORRENCIA_OFICIAL = "ocorrencia_oficial"       # df_ocorrencias_tratado.csv
    DISQUE_DENUNCIA = "disque_denuncia"
    RELINT = "relint"                               # relatórios de inteligência (.docx)
    TWEET = "tweet"                                 # JSONL do valente_scraper
    NEWS_ARTICLE = "news_article"                   # esqueleto — não usado ainda
    FM_ACTION_LOG = "fm_action_log"                 # histórico de ações da FM
    MANUAL_INPUT = "manual_input"                   # operador inseriu à mão


class ExtractionMethod(str, Enum):
    """Como o `CrimeEvent` foi montado a partir do RawSource."""

    STRUCTURED_MAPPER = "structured_mapper"         # campos CSV → campos da ontologia
    LLM_FREE_TEXT = "llm_free_text"                 # texto livre → JSON via Claude
    HYBRID = "hybrid"                               # campos estruturados + enriquecimento LLM
    MANUAL = "manual"
