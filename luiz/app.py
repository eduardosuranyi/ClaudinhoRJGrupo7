"""
CompStat Rio — Plataforma de Inteligência Criminal
Hackathon Anthropic 2026

Para rodar:
    streamlit run app.py
"""

import polars as pl
import streamlit as st
import streamlit.components.v1 as components  # noqa: F401 — used via st.components.v1

st.set_page_config(
    page_title="CompStat Rio — Inteligência Criminal",
    page_icon="🔵",
    layout="wide",
    initial_sidebar_state="expanded",
)

# ---------------------------------------------------------------------------
# Imports internos (após set_page_config — obrigatório pelo Streamlit)
# ---------------------------------------------------------------------------
from components.map_view import criar_mapa_area, map_to_html  # noqa: E402
from config import AREAS_COM_SHAPEFILE, settings  # noqa: E402
from pipeline.bingo import bingos_to_dataframe, calcular_bingos_area, gerar_resumo_bingo  # noqa: E402
from pipeline.ingest import (  # noqa: E402
    load_cameras,
    load_disk_denuncia,
    load_dominio_territorial,
    load_fatores_urbanos,
    load_fm_polygons,
    load_ocorrencias,
    load_relints,
)
from pipeline.llm import analisar_area_completo  # noqa: E402
from pipeline.report import gerar_relatorio  # noqa: E402
from pipeline.spatial import (  # noqa: E402
    crimes_por_logradouro,
    denuncias_por_logradouro,
    fatores_por_logradouro,
    get_area_data,
    get_orcrim_for_area,
    heatmap_hora_dia,
    ranking_tipos_crime,
)

# ---------------------------------------------------------------------------
# Cache de dados (carregados uma vez)
# ---------------------------------------------------------------------------


@st.cache_data(show_spinner="Carregando ocorrências criminais…")
def _load_ocorrencias():
    return load_ocorrencias()


@st.cache_data(show_spinner="Carregando Disque Denúncia…")
def _load_denuncias():
    return load_disk_denuncia()


@st.cache_data(show_spinner="Carregando fatores urbanos…")
def _load_fatores():
    return load_fatores_urbanos()


@st.cache_data(show_spinner="Carregando câmeras…")
def _load_cameras():
    return load_cameras()


@st.cache_resource(show_spinner="Carregando shapefiles e RELINTs…")
def _load_geo_and_relints():
    gdf_fm = load_fm_polygons()
    gdf_dominio = load_dominio_territorial()
    relints = load_relints()
    return gdf_fm, gdf_dominio, relints


# ---------------------------------------------------------------------------
# Sidebar
# ---------------------------------------------------------------------------
with st.sidebar:
    st.image(
        "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0e/Bras%C3%A3o_Rio_de_Janeiro.svg/200px-Bras%C3%A3o_Rio_de_Janeiro.svg.png",
        width=60,
    )
    st.title("CompStat Rio")
    st.caption("Plataforma de Inteligência Criminal")
    st.divider()

    area_selecionada = st.selectbox(
        "Área FM",
        options=AREAS_COM_SHAPEFILE,
        index=6,  # Presidente Vargas como default
        help="Selecione o polígono de atuação da Força Municipal",
    )

    st.divider()
    st.subheader("Filtros")
    anos_disponiveis = [2021, 2022, 2023, 2024]
    anos_selecionados = st.multiselect(
        "Ano(s)",
        anos_disponiveis,
        default=[2023, 2024],
    )

    gerar_com_ia = st.toggle(
        "Síntese com IA (Claude)",
        value=False,
        help="Ativa a síntese qualitativa via Claude API. Requer ANTHROPIC_API_KEY.",
    )

    if gerar_com_ia and not settings.ANTHROPIC_API_KEY:
        st.warning("Defina ANTHROPIC_API_KEY no ambiente.")
        gerar_com_ia = False

    st.divider()
    gerar_btn = st.button("Gerar Análise", type="primary", use_container_width=True)

    st.divider()
    st.caption("Fonte dos dados: CompStat Municipal / Prefeitura do Rio de Janeiro")
    st.caption("Hackathon Anthropic 2026")


# ---------------------------------------------------------------------------
# Carregamento de dados
# ---------------------------------------------------------------------------
df_ocorrencias = _load_ocorrencias()
df_denuncias = _load_denuncias()
df_fatores = _load_fatores()
df_cameras = _load_cameras()
gdf_fm, gdf_dominio, relints = _load_geo_and_relints()

# Filtra por anos selecionados
if anos_selecionados and "ano" in df_ocorrencias.columns:
    df_ocorrencias = df_ocorrencias.filter(pl.col("ano").is_in(anos_selecionados))


# ---------------------------------------------------------------------------
# Header principal
# ---------------------------------------------------------------------------
st.markdown(
    f"""
    <div style="background:#1B3A6B;padding:16px 24px;border-radius:8px;margin-bottom:16px">
      <h2 style="color:white;margin:0">Relatório Analítico de Área</h2>
      <p style="color:#AAC4E8;margin:4px 0 0 0;font-size:14px">{area_selecionada}</p>
    </div>
    """,
    unsafe_allow_html=True,
)

if gerar_btn:
    st.session_state["analise_executada"] = True
    st.session_state["analise_area"] = area_selecionada

if not st.session_state.get("analise_executada"):
    st.info("Selecione uma área FM na barra lateral e clique em **Gerar Análise**.")
    st.stop()


# ---------------------------------------------------------------------------
# Processamento da análise
# ---------------------------------------------------------------------------
with st.spinner(f"Processando dados para: {area_selecionada}…"):
    area_data = get_area_data(
        area_name=area_selecionada,
        gdf_fm=gdf_fm,
        df_ocorrencias=df_ocorrencias,
        df_fatores=df_fatores,
        df_denuncias=df_denuncias,
        df_cameras=df_cameras,
    )

crimes = area_data["crimes"]
fatores = area_data["fatores"]
denuncias = area_data["denuncias"]
cameras = area_data["cameras"]
polygon = area_data["polygon"]

crimes_total = len(crimes)
n_cameras = len(cameras)

# Agregações por logradouro
with st.spinner("Calculando manchas criminais…"):
    crimes_rua = crimes_por_logradouro(crimes)
    fatores_rua = fatores_por_logradouro(fatores)
    denuncias_rua = denuncias_por_logradouro(denuncias)
    df_heatmap = heatmap_hora_dia(crimes)
    df_tipos = ranking_tipos_crime(crimes)

# Hora de pico geral da área
hora_pico_area = None
dia_pico_area = None
if not df_heatmap.is_empty():
    top_row = df_heatmap.sort("count", descending=True).row(0, named=True)
    hora_pico_area = top_row.get("hora")
    dia_pico_area = top_row.get("dia_semana")

# Top logradouros
top_ruas = []
if not crimes_rua.is_empty():
    top_ruas = crimes_rua.head(5)["locf"].to_list()

# Bingo Score
with st.spinner("Calculando Bingo Score…"):
    bingos = calcular_bingos_area(
        df_crimes_area=crimes,
        df_fatores_area=fatores,
        df_denuncias_area=denuncias,
        df_cameras_area=cameras,
        crimes_por_rua=crimes_rua,
        fatores_por_rua=fatores_rua,
        denuncias_por_rua=denuncias_rua,
        top_n=20,
    )

# ORCRIM
orcrim_list = get_orcrim_for_area(gdf_dominio, polygon)
orcrim_str = ", ".join(orcrim_list) if orcrim_list else "Não identificada"

# Análise com IA (opcional)
llm_results = {}
if gerar_com_ia:
    with st.spinner(
        "Sintetizando análise qualitativa com IA (Claude)… pode levar ~30s"
    ):
        relint_text = relints.get(area_selecionada)
        relatos_list = []
        if not denuncias.is_empty() and "relato_redacted" in denuncias.columns:
            relatos_list = denuncias["relato_redacted"].drop_nulls().to_list()

        llm_results = analisar_area_completo(
            area_name=area_selecionada,
            relint_text=relint_text,
            relatos_denuncias=relatos_list,
            crimes_total=crimes_total,
            hora_pico_area=hora_pico_area,
            top_logradouros=top_ruas,
            bingos=bingos,
        )


# ---------------------------------------------------------------------------
# KPIs principais
# ---------------------------------------------------------------------------
k1, k2, k3, k4, k5 = st.columns(5)
with k1:
    st.metric("Crimes no período", f"{crimes_total:,}")
with k2:
    bingo_criticos = sum(1 for b in bingos if b.prioridade == "CRITICA")
    st.metric("Trechos CRÍTICOS", bingo_criticos, delta=None)
with k3:
    hora_str = f"{hora_pico_area:02d}h" if hora_pico_area is not None else "–"
    st.metric("Hora de pico", hora_str)
with k4:
    st.metric("Câmeras na área", n_cameras)
with k5:
    n_fatores = len(fatores)
    st.metric("Fatores urbanos", n_fatores)

st.divider()

# ---------------------------------------------------------------------------
# Tabs principais
# ---------------------------------------------------------------------------
tab_mapa, tab_bingo, tab_temporal, tab_dinamica, tab_relatorio = st.tabs(
    [
        "🗺 Mapa",
        "🎯 Bingo Score",
        "⏱ Análise Temporal",
        "🔍 Dinâmica Criminal",
        "📄 Relatório",
    ]
)


# ============================== MAPA ==============================
with tab_mapa:
    st.subheader(f"Mapa de Segmentos Críticos — {area_selecionada}")

    col_mapa, col_legenda = st.columns([4, 1])
    with col_mapa:
        with st.spinner("Gerando mapa…"):
            try:
                mapa = criar_mapa_area(
                    area_name=area_selecionada,
                    polygon=polygon,
                    df_crimes=crimes,
                    df_fatores=fatores,
                    df_cameras=cameras,
                    gdf_dominio=gdf_dominio,
                    bingos=bingos,
                )
                st.components.v1.html(map_to_html(mapa), height=550)
            except Exception as e:
                st.error(f"Erro ao gerar mapa: {e}")

    with col_legenda:
        st.markdown("**Legenda**")
        for pri, color in [
            ("CRÍTICA", "#d62728"),
            ("ALTA", "#ff7f0e"),
            ("MÉDIA", "#bcbd22"),
            ("BAIXA", "#2ca02c"),
        ]:
            st.markdown(
                f'<span style="background:{color};padding:2px 8px;border-radius:4px;color:white;font-size:12px">{pri}</span>',
                unsafe_allow_html=True,
            )
        st.markdown("---")
        st.markdown("**Órgãos**")
        for orgao, color in [
            ("COMLURB", "#2ca02c"),
            ("Rio Luz", "#ff7f0e"),
            ("SECONSERVA", "#9467bd"),
            ("SEOP", "#8c564b"),
            ("SMAS", "#e377c2"),
        ]:
            st.markdown(
                f'<span style="color:{color};font-size:12px">● {orgao}</span>',
                unsafe_allow_html=True,
            )


# ============================== BINGO SCORE ==============================
with tab_bingo:
    st.subheader("Painel de Coincidências — Bingo Score")
    st.caption(
        "Score 0–10 composto por: Mancha Criminal (0–4) + Fatores Urbanos (0–3) + "
        "Disque Denúncia Patrimônio (0–2) + Ponto Cego de Câmera (0–1)"
    )

    if not bingos:
        st.warning("Nenhum dado de bingo calculado para esta área.")
    else:
        # Tabela resumo
        df_bingo_view = bingos_to_dataframe(bingos)
        if not df_bingo_view.is_empty():
            # Destaca por score
            st.dataframe(
                df_bingo_view.to_pandas(),
                use_container_width=True,
                hide_index=True,
                column_config={
                    "Score": st.column_config.ProgressColumn(
                        "Score", min_value=0, max_value=10
                    ),
                    "Prioridade": st.column_config.TextColumn("Prioridade"),
                },
            )

        st.divider()
        st.subheader("Explicação detalhada por trecho")

        # Filtro de prioridade
        filtro_pri = st.multiselect(
            "Filtrar por prioridade",
            ["CRITICA", "ALTA", "MEDIA", "BAIXA"],
            default=["CRITICA", "ALTA"],
        )
        bingos_filtrados = (
            [b for b in bingos if b.prioridade in filtro_pri] if filtro_pri else bingos
        )

        for b in bingos_filtrados[:10]:
            pri_color = {
                "CRITICA": "🔴",
                "ALTA": "🟠",
                "MEDIA": "🟡",
                "BAIXA": "🟢",
            }.get(b.prioridade, "⚪")
            with st.expander(
                f"{pri_color} **{b.logradouro}** — Score {b.score_total}/10 ({b.prioridade})",
                expanded=(b.score_total >= 7),
            ):
                c1, c2, c3, c4 = st.columns(4)
                c1.metric("Crimes", b.crimes_count)
                c2.metric("Fatores", len(b.tipos_fatores))
                c3.metric("Denúncias", b.denuncias_count)
                c4.metric("Câmera", "Sim" if b.tem_camera else "Não")

                st.markdown("**Justificativas (camada por camada):**")
                for ex in b.explicacao:
                    st.markdown(f"- {ex}")

                if b.combos_risco:
                    st.warning("⚠ " + " | ".join(b.combos_risco))

                if b.tipos_fatores:
                    st.markdown("**Fatores identificados:**")
                    st.write(", ".join(b.tipos_fatores))

                if b.orgaos_responsaveis:
                    st.markdown("**Órgãos responsáveis:**")
                    st.write(", ".join(b.orgaos_responsaveis))


# ============================== ANÁLISE TEMPORAL ==============================
with tab_temporal:
    st.subheader("Distribuição Temporal de Ocorrências")

    if crimes.is_empty():
        st.warning("Sem ocorrências para a área/período selecionado.")
    else:
        col_hora, col_dia = st.columns(2)
        with col_hora:
            st.markdown("**Por hora do dia**")
            if not df_heatmap.is_empty():
                hora_dist = (
                    df_heatmap.group_by("hora").agg(pl.col("count").sum()).sort("hora")
                )
                st.bar_chart(hora_dist.to_pandas().set_index("hora")["count"])

        with col_dia:
            st.markdown("**Por dia da semana**")
            dia_labels = {
                0: "Dom",
                1: "Seg",
                2: "Ter",
                3: "Qua",
                4: "Qui",
                5: "Sex",
                6: "Sáb",
            }
            if not df_heatmap.is_empty():
                dia_dist = (
                    df_heatmap.group_by("dia_semana")
                    .agg(pl.col("count").sum())
                    .sort("dia_semana")
                    .with_columns(
                        pl.col("dia_semana").replace(
                            old=list(dia_labels.keys()),
                            new=list(dia_labels.values()),
                        )
                    )
                )
                st.bar_chart(dia_dist.to_pandas().set_index("dia_semana")["count"])

        st.divider()
        st.markdown("**Heatmap hora × dia (contagem de crimes)**")
        if not df_heatmap.is_empty():
            try:
                pivot = df_heatmap.to_pandas().pivot_table(
                    index="dia_semana", columns="hora", values="count", fill_value=0
                )
                pivot.index = [dia_labels.get(i, str(i)) for i in pivot.index]
                st.dataframe(
                    pivot.style.background_gradient(cmap="Reds"),
                    use_container_width=True,
                )
            except Exception as e:
                st.error(f"Erro no heatmap: {e}")

        st.divider()
        st.markdown("**Top modalidades criminais**")
        if not df_tipos.is_empty():
            st.dataframe(
                df_tipos.to_pandas(), use_container_width=True, hide_index=True
            )


# ============================== DINÂMICA CRIMINAL ==============================
with tab_dinamica:
    st.subheader("Análise da Dinâmica Criminal")

    if not gerar_com_ia:
        st.info(
            "Ative a **Síntese com IA** na barra lateral para gerar a análise qualitativa."
        )
        # Mostra dados brutos do RELINT e Disque Denúncia
        relint_text = relints.get(area_selecionada)
        if relint_text:
            with st.expander("RELINT da área (texto bruto)", expanded=False):
                st.text(relint_text[:3000] + ("…" if len(relint_text) > 3000 else ""))
        if not denuncias.is_empty():
            st.markdown(
                f"**{len(denuncias)} denúncias** na área, "
                f"**{denuncias.filter(pl.col('patrimonio')).__len__()} contra patrimônio**"
            )
    else:
        if not llm_results:
            st.warning(
                "Análise com IA não foi executada. Recarregue com o toggle ativo."
            )
        else:
            # Narrativa dinâmica
            st.markdown("### Análise da Dinâmica Criminal")
            st.markdown(llm_results.get("narrativa_dinamica", "–"))

            st.divider()

            # Perguntas norteadoras
            st.markdown("### Perguntas Norteadoras")
            perguntas = llm_results.get("perguntas_norteadoras", {})
            perg_labels = {
                "rota_fm": "Locais de maior incidência coincidem com a rota da FM?",
                "horario_cobertura": "Horário de pico coincide com o QMD da FM?",
                "modelo_emprego": "Dinâmica criminal coincide com o modelo de emprego?",
                "fatores_urbanos": "Fatores urbanos estão sendo resolvidos pelos órgãos?",
            }
            for key, label in perg_labels.items():
                data = perguntas.get(key, {})
                with st.expander(f"**{label}**", expanded=True):
                    col_d, col_op = st.columns(2)
                    with col_d:
                        st.markdown("**Diagnóstico:**")
                        st.write(data.get("diagnostico", "–"))
                    with col_op:
                        st.markdown("**Recomendação FM / Órgãos:**")
                        st.write(data.get("operacao_fm", "–"))
                    if data.get("obs"):
                        st.caption(f"Obs: {data['obs']}")

            # RELINT extraído
            relint_data = llm_results.get("relint_data", {})
            if relint_data and not relint_data.get("_erro"):
                st.divider()
                st.markdown("### Dados Extraídos do RELINT")
                col_r1, col_r2 = st.columns(2)
                with col_r1:
                    st.markdown(
                        f"**Modalidade predominante:** {relint_data.get('modalidade_predominante', '–')}"
                    )
                    st.markdown(
                        f"**Horário predominante:** {relint_data.get('horario_predominante', '–')}"
                    )
                    st.markdown(
                        f"**Perfil de vítimas:** {relint_data.get('perfil_vitimas', '–')}"
                    )
                    st.markdown(
                        f"**ORCRIM:** {relint_data.get('orcrim_influencia', '–')}"
                    )
                with col_r2:
                    if relint_data.get("modus_operandi"):
                        st.markdown("**Modus Operandi:**")
                        for item in relint_data["modus_operandi"]:
                            st.markdown(f"- {item}")
                    if relint_data.get("rotas_fuga"):
                        st.markdown("**Rotas de Fuga:**")
                        for item in relint_data["rotas_fuga"]:
                            st.markdown(f"- {item}")
                    if relint_data.get("pontos_receptacao"):
                        st.markdown("**Pontos de Receptação:**")
                        for item in relint_data["pontos_receptacao"]:
                            st.markdown(f"- {item}")

            # Plano de ação
            plano = llm_results.get("plano_acao", [])
            if plano:
                st.divider()
                st.markdown("### Plano de Ação Pré-populado (validar na reunião)")
                for item in plano:
                    pri = item.get("prioridade", "")
                    pri_emoji = {
                        "URGENTE": "🔴",
                        "PRIORITÁRIA": "🟠",
                        "RECOMENDADA": "🟡",
                    }.get(pri, "⚪")
                    with st.expander(
                        f"{pri_emoji} **{item.get('orgao', '–')}** — {item.get('acao', '–')[:60]}",
                        expanded=(pri == "URGENTE"),
                    ):
                        st.markdown(f"**Local:** {item.get('local', '–')}")
                        st.markdown(
                            f"**Justificativa:** {item.get('justificativa', '–')}"
                        )
                        col_p, col_pr = st.columns(2)
                        col_p.markdown(f"**Prazo:** {item.get('prazo_sugerido', '–')}")
                        col_pr.markdown(f"**Prioridade:** {pri}")


# ============================== RELATÓRIO ==============================
with tab_relatorio:
    st.subheader("Gerar Relatório Analítico de Área (.docx)")
    st.caption(
        "Reproduz o formato oficial do CompStat Municipal. Pronto para uso na reunião."
    )

    col_info, col_btn = st.columns([3, 1])
    with col_info:
        st.markdown(f"""
        **Conteúdo do relatório:**
        - Identificação da área ({area_selecionada})
        - Indicadores criminais do período
        - Distribuição por tipo de ocorrência
        - Análise temporal (heatmap hora × dia)
        {"- Perguntas norteadoras respondidas" if llm_results else "- *Perguntas norteadoras (requer IA)*"}
        {"- Dinâmica criminal (síntese IA)" if llm_results else "- *Dinâmica criminal (requer IA)*"}
        - Painel de Coincidências — Bingo Score
        - Fatores de incidência criminal por órgão
        {"- Plano de ação hiper-específico (IA)" if llm_results.get("plano_acao") else "- *Plano de ação (requer IA)*"}
        """)

    with col_btn:
        gerar_docx = st.button("Gerar .docx", type="primary", use_container_width=True)

    if gerar_docx:
        with st.spinner("Gerando relatório…"):
            try:
                docx_bytes = gerar_relatorio(
                    area_name=area_selecionada,
                    orcrim=orcrim_str,
                    n_cameras=n_cameras,
                    crimes_total=crimes_total,
                    roubos_total=len(
                        crimes.filter(pl.col("desc_delito").str.contains("Roubo"))
                    ),
                    furtos_total=len(
                        crimes.filter(pl.col("desc_delito").str.contains("Furto"))
                    ),
                    df_tipos=df_tipos if not df_tipos.is_empty() else None,
                    df_heatmap=df_heatmap if not df_heatmap.is_empty() else None,
                    hora_pico=hora_pico_area,
                    dia_pico=dia_pico_area,
                    narrativa_dinamica=llm_results.get(
                        "narrativa_dinamica", "Síntese com IA não executada."
                    ),
                    perguntas_norteadoras=llm_results.get("perguntas_norteadoras"),
                    plano_acao=llm_results.get("plano_acao"),
                    bingos=bingos,
                    df_fatores=fatores if not fatores.is_empty() else None,
                )
                st.success("Relatório gerado com sucesso!")
                filename = area_selecionada.replace(" ", "_").replace("/", "-")[:50]
                st.download_button(
                    label="⬇ Baixar Relatório (.docx)",
                    data=docx_bytes,
                    file_name=f"CompStat_{filename}.docx",
                    mime="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                    use_container_width=True,
                )
            except Exception as e:
                st.error(f"Erro ao gerar relatório: {e}")
                import traceback

                st.code(traceback.format_exc())

    # Preview estático dos bingos
    if bingos:
        st.divider()
        st.markdown("**Preview — Bingo Score da área:**")
        resumo_bingo = gerar_resumo_bingo(bingos, area_selecionada)
        st.text(resumo_bingo)
