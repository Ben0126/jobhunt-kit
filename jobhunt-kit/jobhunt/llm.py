"""One function, three providers: send a conversation to Claude, OpenAI or Gemini and get text back.

    llm:
      provider: anthropic          # anthropic | openai | gemini
      model: claude-opus-5-5       # anthropic default; openai / gemini: required — use the model your account has
      effort: high                 # anthropic: low | medium | high | xhigh | max
      api_key_env: ""              # env var holding the key (default: the SDK's own — ANTHROPIC_API_KEY,
                                   #   OPENAI_API_KEY, GEMINI_API_KEY)
      base_url: ""                 # openai only: any OpenAI-compatible server (Ollama, a proxy…) — uses Chat Completions

Each provider uses its official SDK, installed as an extra: `pip install "jobhunt-kit[anthropic]"` (or [openai],
[gemini], [llm] for all three). Keys come from the environment — never from jobhunt.yaml.
"""
from __future__ import annotations

import os

ANTHROPIC_DEFAULT_MODEL = "claude-opus-5-5"
# Models that accept the server-side refusal fallback (`fallbacks: "default"`).
ANTHROPIC_FALLBACK_MODELS = {"claude-opus-5-5", "claude-opus-5", "claude-fable-5-1", "claude-sonnet-5-5"}
EXTRA = {"anthropic": "anthropic", "openai": "openai", "gemini": "gemini"}


class LLMError(Exception):
    pass


def _key(spec: dict) -> str | None:
    env = spec.get("api_key_env")
    if not env:
        return None
    if not os.environ.get(env):
        raise LLMError(f"llm.api_key_env is {env!r} but that environment variable is empty")
    return os.environ[env]


def _import(provider: str):
    try:
        if provider == "anthropic":
            import anthropic   # noqa: PLC0415
            return anthropic
        if provider == "openai":
            import openai   # noqa: PLC0415
            return openai
        from google import genai   # noqa: PLC0415
        return genai
    except ImportError as e:
        raise LLMError(f"the {provider} SDK isn't installed: pip install \"jobhunt-kit[{EXTRA[provider]}]\"") from e


def describe(spec: dict) -> str:
    provider = spec.get("provider") or "?"
    model = spec.get("model") or (ANTHROPIC_DEFAULT_MODEL if provider == "anthropic" else "?")
    return f"{provider}/{model}"


def complete(spec: dict, system: str, messages: list[dict]) -> str:
    """messages: [{"role": "user"|"assistant", "content": str}, …] ending with a user turn → the reply text."""
    provider = (spec.get("provider") or "").lower()
    if provider not in EXTRA:
        raise LLMError("set llm.provider in jobhunt.yaml to anthropic, openai or gemini")
    if provider != "anthropic" and not spec.get("model"):
        raise LLMError(f"set llm.model in jobhunt.yaml — the {provider} model to use")
    sdk = _import(provider)
    return {"anthropic": _anthropic, "openai": _openai, "gemini": _gemini}[provider](sdk, spec, system, messages)


def _anthropic(anthropic, spec, system, messages) -> str:
    model = spec.get("model") or ANTHROPIC_DEFAULT_MODEL
    key = _key(spec)
    client = anthropic.Anthropic(**({"api_key": key} if key else {}))
    kwargs = {"model": model, "max_tokens": int(spec.get("max_tokens") or 16000), "system": system,
              "messages": messages}
    if spec.get("effort"):
        kwargs["output_config"] = {"effort": spec["effort"]}
    try:
        if model in ANTHROPIC_FALLBACK_MODELS and spec.get("fallbacks", True):
            # on a safety decline, re-run on Anthropic's recommended fallback model instead of failing
            resp = client.beta.messages.create(**kwargs, betas=["server-side-fallback-2026-07-01"], fallbacks="default")
        else:
            resp = client.messages.create(**kwargs)
    except anthropic.AuthenticationError as e:
        raise LLMError("Anthropic rejected the API key (set ANTHROPIC_API_KEY)") from e
    except anthropic.NotFoundError as e:
        raise LLMError(f"Anthropic: model {model!r} not found") from e
    except anthropic.RateLimitError as e:
        raise LLMError("Anthropic: rate limited — try again in a minute") from e
    except anthropic.APIStatusError as e:
        raise LLMError(f"Anthropic API error {e.status_code}: {e.message}") from e
    except anthropic.APIConnectionError as e:
        raise LLMError("Anthropic: can't connect") from e
    if resp.stop_reason == "refusal":
        raise LLMError("Anthropic declined the request")
    if resp.stop_reason == "max_tokens":
        raise LLMError("Anthropic: the answer was cut off (raise llm.max_tokens)")
    return "".join(b.text for b in resp.content if b.type == "text")


def _openai(openai, spec, system, messages) -> str:
    key = _key(spec)
    client = openai.OpenAI(**({"api_key": key} if key else {}), **({"base_url": spec["base_url"]} if spec.get("base_url") else {}))
    try:
        if spec.get("base_url"):        # OpenAI-compatible servers implement Chat Completions
            resp = client.chat.completions.create(model=spec["model"],
                                                  messages=[{"role": "system", "content": system}, *messages])
            return resp.choices[0].message.content or ""
        resp = client.responses.create(model=spec["model"], instructions=system, input=messages)
        return resp.output_text
    except openai.AuthenticationError as e:
        raise LLMError("OpenAI rejected the API key (set OPENAI_API_KEY)") from e
    except openai.RateLimitError as e:
        raise LLMError("OpenAI: rate limited or out of quota") from e
    except openai.APIStatusError as e:
        raise LLMError(f"OpenAI API error {e.status_code}: {e.message}") from e
    except openai.APIConnectionError as e:
        raise LLMError("OpenAI: can't connect") from e


def _gemini(genai, spec, system, messages) -> str:
    from google.genai import errors, types   # noqa: PLC0415
    key = _key(spec)
    client = genai.Client(**({"api_key": key} if key else {}))
    contents = [types.Content(role="model" if m["role"] == "assistant" else "user", parts=[types.Part(text=m["content"])])
                for m in messages]
    try:
        resp = client.models.generate_content(model=spec["model"], contents=contents,
                                              config=types.GenerateContentConfig(system_instruction=system))
    except errors.APIError as e:
        raise LLMError(f"Gemini API error {getattr(e, 'code', '')}: {getattr(e, 'message', e)}") from e
    if not resp.text:
        raise LLMError("Gemini returned no text (blocked or empty)")
    return resp.text
