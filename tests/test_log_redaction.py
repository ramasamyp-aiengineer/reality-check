import logging

from reality_api.main import _SecretFilter


def _render(msg: str, *args: object) -> str:
    record = logging.LogRecord("httpx", logging.INFO, __file__, 1, msg, args, None)
    _SecretFilter().filter(record)
    return record.getMessage()


def test_serpapi_key_in_url_is_redacted():
    out = _render('HTTP Request: %s %s "%s"', "GET", "https://serpapi.com/account.json?api_key=abc123def&q=x", "200")
    assert "abc123def" not in out and "api_key=***" in out and "q=x" in out


def test_telegram_bot_token_is_redacted():
    out = _render("POST https://api.telegram.org/bot123456:AAH-secret_token/sendMessage")
    assert "AAH-secret_token" not in out and "/bot***/sendMessage" in out


def test_plain_messages_are_untouched():
    assert _render("Scheduler started for %d watches", 3) == "Scheduler started for 3 watches"
