"""Alert channels: Telegram Bot API (plain HTTPS) and SMTP email."""

from __future__ import annotations

import asyncio
import logging
import smtplib
from email.message import EmailMessage

import httpx

from reality_api.config import get_settings

log = logging.getLogger(__name__)


async def send_telegram(chat_id: str, text: str) -> bool:
    token = get_settings().telegram_bot_token
    if not token or not chat_id:
        return False
    try:
        async with httpx.AsyncClient(timeout=15) as http:
            resp = await http.post(f"https://api.telegram.org/bot{token}/sendMessage",
                                   json={"chat_id": chat_id, "text": text[:4000], "disable_web_page_preview": True})
        return resp.status_code == 200
    except httpx.HTTPError:
        log.warning("Telegram alert failed")
        return False


def _send_email_sync(to: str, subject: str, body: str) -> bool:
    s = get_settings()
    if not s.smtp_host or not to:
        return False
    msg = EmailMessage()
    msg["From"] = s.smtp_from or s.smtp_user or "reality-check@localhost"
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)
    try:
        with smtplib.SMTP(s.smtp_host, s.smtp_port, timeout=20) as smtp:
            smtp.starttls()
            if s.smtp_user and s.smtp_password:
                smtp.login(s.smtp_user, s.smtp_password)
            smtp.send_message(msg)
        return True
    except (smtplib.SMTPException, OSError):
        log.warning("Email alert failed")
        return False


async def send_email(to: str, subject: str, body: str) -> bool:
    return await asyncio.to_thread(_send_email_sync, to, subject, body)
