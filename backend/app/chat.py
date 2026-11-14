"""Terra chat: OpenAI-compatible providers with a useful offline tutor."""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Literal, Optional

import httpx
from pydantic import BaseModel, Field, model_validator


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)


class ChatFacts(BaseModel):
    first_year: Optional[int] = None
    last_year: Optional[int] = None
    mean: Optional[float] = None
    change_per_decade: Optional[float] = None
    total_change: Optional[float] = None
    significant: Optional[bool] = None
    p_value: Optional[float] = None
    alpha: Optional[float] = None
    peak_month: Optional[int] = Field(default=None, ge=1, le=12)
    peak_value: Optional[float] = None
    trough_month: Optional[int] = Field(default=None, ge=1, le=12)
    trough_value: Optional[float] = None
    prediction_year: Optional[int] = None
    prediction_value: Optional[float] = None
    prediction_lower: Optional[float] = None
    prediction_upper: Optional[float] = None
    n_unusual_months: Optional[int] = None


class ChatContext(BaseModel):
    place: Optional[str] = None
    lat: Optional[float] = None
    lon: Optional[float] = None
    param: Optional[str] = None
    label: Optional[str] = None
    unit: Optional[str] = None
    period: Optional[str] = None
    role: Literal["geologist", "physicist", "curious"] = "curious"
    summary: Optional[str] = Field(default=None, max_length=3000)
    facts: Optional[ChatFacts] = None


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1, max_length=20)
    context: Optional[ChatContext] = None

    @model_validator(mode="after")
    def last_message_is_user(self) -> "ChatRequest":
        if not self.messages or self.messages[-1].role != "user":
            raise ValueError("The last chat message must be from the user.")
        return self


class ChatResponse(BaseModel):
    reply: str
    mode: Literal["ai", "offline"]
    notice: Optional[str] = None


ENV_PATH = Path(__file__).resolve().parent.parent / ".env"


def _load_dotenv() -> None:
    """Load simple KEY=VALUE settings without replacing process variables."""
    try:
        lines = ENV_PATH.read_text(encoding="utf-8").splitlines()
    except OSError:
        return
    for line in lines:
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key, value = key.strip(), value.strip()
        if not key:
            continue
        if value.startswith("#"):
            continue
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        os.environ.setdefault(key, value)


def _resolve_provider() -> Optional[dict]:
    """Resolve provider credentials at call time in the documented order."""
    _load_dotenv()
    chat_key = os.environ.get("CHAT_API_KEY")
    chat_base = os.environ.get("CHAT_BASE_URL")
    if chat_key and chat_base:
        provider = {"key": chat_key, "url": chat_base.rstrip("/") + "/chat/completions"}
        if os.environ.get("CHAT_MODEL"):
            provider["model"] = os.environ["CHAT_MODEL"]
        return provider

    manus_key = os.environ.get("MANUS_API_KEY")
    manus_base = os.environ.get("MANUS_API_URL")
    if manus_key and manus_base:
        return {
            "key": manus_key,
            "url": manus_base.rstrip("/") + "/v1/chat/completions",
        }

    openai_key = os.environ.get("OPENAI_API_KEY")
    if openai_key:
        base = os.environ.get("OPENAI_BASE_URL") or os.environ.get("OPENAI_API_BASE") or "https://api.openai.com/v1"
        return {
            "key": openai_key,
            "url": base.rstrip("/") + "/chat/completions",
            "model": os.environ.get("OPENAI_MODEL") or "gpt-4.1-mini",
        }
    return None


def _context_text(context: Optional[ChatContext]) -> str:
    if context is None:
        return "No chart context was supplied."
    return json.dumps(context.model_dump(exclude_none=True), ensure_ascii=False, sort_keys=True)


def system_prompt(context: Optional[ChatContext]) -> str:
    role = context.role if context else "curious"
    return (
        "You are Terra, a friendly Earth character inside Earth's Data Analysis Application. "
        "Help students understand NASA POWER climate data: MERRA-2 reanalysis and CERES solar products, "
        "monthly values for a grid cell; centered 12-month means; day-weighted annual summaries; the Max–Min "
        "ribbon as the within-year range of monthly values, not uncertainty; Sen's slope; tie-corrected "
        "Mann–Kendall tests and p-value versus alpha; conditional OLS extrapolation with a prediction interval; "
        "expanding-window hindcast RMSE versus persistence; and monthly z-scores. Explain the physics of the variable. "
        "Be brief, normally no more than 150 words, clear, encouraging, and accurate. For a curious student use "
        "simple words and everyday examples with minimal math; for a physicist or geologist equations are welcome. "
        "Use the supplied context and facts. Never invent numbers that are not there; say when a value is unknown. "
        "Separate statistical trends from causes and note that reanalysis is not station data. "
        f"The selected learner role is {role}. Context JSON: {_context_text(context)}"
    )


_TOPICS = [
    ("sen", "Sen's slope is a robust trend estimate: it takes the median of all pairwise slopes, so a few unusual years do not dominate it."),
    ("mann kendall", "Mann–Kendall tests whether values show a consistently increasing or decreasing ordering over time. It does not identify a cause."),
    ("p-value", "A p-value measures how surprising a result would be if there were no trend. Compare it with alpha; a smaller p-value is evidence against that no-trend idea."),
    ("significance", "Statistical significance means the test crossed the chosen alpha threshold. It does not automatically mean the change is large or important."),
    ("alpha", "Alpha is the cutoff chosen before a test, often 0.05. It controls how strong the evidence must be before calling a result statistically significant."),
    ("mean", "A mean is the average. This app's centered 12-month mean smooths nearby monthly values, while annual summaries weight months by their actual number of days."),
    ("12-month", "A centered 12-month mean averages a full year around each point. It smooths seasonality, but it is unavailable near the ends or across missing months."),
    ("max", "The Max–Min ribbon is the range between the highest and lowest monthly values within each year. It is a spread of observations, not an uncertainty interval."),
    ("anomaly", "An anomaly is a value compared with a reference climatology. A positive anomaly is above that reference; a negative one is below it."),
    ("z-score", "A monthly z-score says how many typical calendar-month standard deviations a value is from that month's climatological mean."),
    ("season", "Seasonality is a repeating calendar pattern, such as warmer summers and cooler winters. It can exist even when the long-term trend is flat."),
    ("prediction interval", "A prediction interval shows a range for a future observation under the fitted model. It is wider than a line because real observations vary."),
    ("extrapolat", "Extrapolation extends a fitted relationship beyond the observed period. It is conditional, not a guaranteed climate forecast, and can fail when conditions change."),
    ("ols", "OLS chooses the line that minimizes squared residuals. R² describes the fraction of variation explained by that line within the sample, not proof of causation."),
    ("r²", "R² describes how closely the observations fit the OLS line in the sample. A high R² is not proof that one variable causes another."),
    ("rmse", "RMSE is the typical size of prediction errors in the data's units. Lower is better, but compare it with a simple baseline such as last-year persistence."),
    ("hindcast", "A hindcast tests a method on past years as if they were future years. This app compares expanding-window OLS with last-year persistence."),
    ("reanalysis", "NASA POWER uses modeled and observed information to make a consistent gridded reanalysis. It is useful for climate patterns, but it is not a direct station record."),
    ("merra", "MERRA-2 is NASA's atmospheric reanalysis. NASA POWER provides selected variables from gridded products derived from these large-scale analyses."),
    ("grid cell", "A grid cell is an area represented by one value at a coordinate. It describes regional conditions, not every street or weather station at that point."),
    ("temperature", "T2M is air temperature at about 2 metres. It describes near-surface air, not soil or the temperature of every object on the ground."),
    ("humidity", "Relative humidity compares water vapor with the maximum possible at that temperature. Specific humidity is the mass of water vapor per mass of moist air."),
    ("dew point", "Dew point is the temperature at which air would become saturated if cooled without changing its moisture. A higher dew point usually feels more humid."),
    ("precip", "Precipitation is water reaching the surface as rain or other forms. Check its units and accumulation period before comparing values."),
    ("soil", "GWETTOP, GWETROOT, and GWETPROF describe soil wetness at different depths. They help show moisture availability, not simply rainfall on that day."),
    ("solar", "Shortwave radiation is incoming sunlight. Clouds, sun angle, aerosols, and surface reflectivity affect it."),
    ("longwave", "Longwave radiation is thermal infrared energy emitted by Earth and the atmosphere. Greenhouse gases absorb and re-emit some of it, affecting surface energy balance."),
    ("pressure", "Surface pressure is the weight of the air column above a location. It varies with weather and elevation."),
    ("wind", "Wind speed is air motion, usually reported at a specified height. Comparing WS2M with WS10M requires remembering that height matters."),
    ("degree day", "A degree day accumulates how far daily temperature is above or below a chosen threshold. It is often used to estimate heating, cooling, or biological development."),
    ("climate", "Weather describes short-term conditions; climate describes statistics and patterns over much longer periods. One unusual month is not by itself a climate trend."),
    ("correlation", "Correlation is an association between variables. It does not establish causation because both may respond to another factor or to shared seasonality."),
    ("unit", "Always interpret the number with its unit and time basis. For example, a monthly total and a monthly mean answer different questions."),
]


def _fact_reply(question: str, context: Optional[ChatContext]) -> Optional[str]:
    facts = context.facts.model_dump(exclude_none=True) if context and context.facts else {}
    unit = (context.unit if context else None) or ""
    lower = question.lower()
    if any(word in lower for word in ("trend", "slope", "change per decade", "increas", "decreas")) and facts:
        change = facts.get("change_per_decade")
        total = facts.get("total_change")
        if change is not None:
            direction = "increased" if change > 0 else "decreased" if change < 0 else "stayed roughly flat"
            significance = " The test marks it as statistically significant." if facts.get("significant") is True else " The test does not mark it as statistically significant."
            return f"The estimated trend is {direction} by {abs(change):g} {unit} per decade.{significance}" + (f" Across the period, the estimated total change is {total:g} {unit}." if total is not None else "")
    if any(word in lower for word in ("significant", "p-value", "p value")) and facts:
        p_value, alpha = facts.get("p_value"), facts.get("alpha")
        if p_value is not None and alpha is not None:
            return f"The p-value is {p_value:g} and alpha is {alpha:g}. The result is {'statistically significant' if p_value < alpha else 'not statistically significant'} at that cutoff."
    if any(word in lower for word in ("hottest", "coldest", "peak", "trough", "month")) and facts:
        peak, trough = facts.get("peak_month"), facts.get("trough_month")
        if peak is not None or trough is not None:
            answer = []
            if peak is not None:
                answer.append(f"the peak is month {peak} ({facts.get('peak_value')} {unit})")
            if trough is not None:
                answer.append(f"the trough is month {trough} ({facts.get('trough_value')} {unit})")
            return "From the supplied climatology, " + " and ".join(answer) + "."
    if any(word in lower for word in ("predict", "future", "forecast")) and facts:
        year, value = facts.get("prediction_year"), facts.get("prediction_value")
        if year is not None and value is not None:
            interval = ""
            if facts.get("prediction_lower") is not None and facts.get("prediction_upper") is not None:
                interval = f" The interval is {facts['prediction_lower']:g} to {facts['prediction_upper']:g} {unit}."
            return f"The conditional model gives {value:g} {unit} for {year}.{interval} Treat this as an extrapolation, not a guaranteed forecast."
    return None


def offline_reply(request: ChatRequest) -> str:
    question = request.messages[-1].content
    fact = _fact_reply(question, request.context)
    if fact:
        return fact
    lower = question.lower().strip()
    if any(word in lower for word in ("hello", "hi", "hey", "greetings")):
        return "Hi! I’m Terra. Ask me about the chart’s trend, significance, seasons, predictions, or the physics of a NASA POWER variable."
    for keyword, explanation in _TOPICS:
        if keyword in lower:
            return explanation
    return "I can explain trends, Sen’s slope, Mann–Kendall and p-values, seasonality, anomalies, prediction intervals, reanalysis, grid cells, and variables such as temperature, humidity, precipitation, soil wetness, radiation, pressure, wind, and degree days."


def _provider_reply(provider: dict, request: ChatRequest) -> str:
    messages = [{"role": "system", "content": system_prompt(request.context)}]
    messages.extend(message.model_dump() for message in request.messages)
    body = {"messages": messages, "max_tokens": 700}
    if provider.get("model"):
        body["model"] = provider["model"]
    response = httpx.post(
        provider["url"],
        headers={"Authorization": f"Bearer {provider['key']}", "Content-Type": "application/json"},
        json=body,
        timeout=45,
    )
    try:
        payload = response.json()
    except (ValueError, TypeError):
        payload = {}
    if not isinstance(payload, dict):
        payload = {}
    if payload.get("error"):
        error = payload["error"]
        detail = error.get("message") if isinstance(error, dict) else str(error)
        raise RuntimeError(str(detail or "provider returned an error"))
    if getattr(response, "status_code", 200) >= 400:
        raise RuntimeError(f"provider returned HTTP {response.status_code}")
    choices = payload.get("choices") or []
    content = choices[0].get("message", {}).get("content") if choices and isinstance(choices[0], dict) else None
    if isinstance(content, list):
        content = "".join(item.get("text", "") for item in content if isinstance(item, dict))
    if not isinstance(content, str) or not content.strip():
        raise RuntimeError("provider returned an empty answer")
    return content.strip()


def answer(request: ChatRequest) -> ChatResponse:
    provider = _resolve_provider()
    if provider is None:
        return ChatResponse(
            reply=offline_reply(request),
            mode="offline",
            notice="Offline tutor mode. Add CHAT_API_KEY or OPENAI_API_KEY to backend/.env for full AI answers.",
        )
    try:
        return ChatResponse(reply=_provider_reply(provider, request), mode="ai", notice=None)
    except (httpx.HTTPError, RuntimeError, KeyError, TypeError) as problem:
        return ChatResponse(
            reply=offline_reply(request),
            mode="offline",
            notice=f"Offline tutor mode: AI provider failed ({str(problem)[:180]}).",
        )
