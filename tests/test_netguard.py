import pytest
from evidence_agents.netguard import UnsafeURL, check_public_url


@pytest.mark.parametrize("url", ["https://example.com/a.jpg", "http://93.184.216.34/x.png"])
def test_public_urls_pass(url):
    assert check_public_url(url, resolve=False) == url


@pytest.mark.parametrize(
    "url",
    [
        "file:///etc/passwd",
        "ftp://example.com/x",
        "javascript:alert(1)",
        "http://localhost/admin",
        "http://127.0.0.1:8000/api",
        "http://10.0.0.5/",
        "http://192.168.1.1/",
        "http://169.254.169.254/latest/meta-data/",
        "http://[::1]/",
        "http://metadata.google.internal/",
        "http://printer.local/",
        "https://user:pass@example.com/",
    ],
)
@pytest.mark.parametrize("resolve", [False, True])
def test_private_or_unsafe_urls_rejected(url, resolve):
    with pytest.raises(UnsafeURL):
        check_public_url(url, resolve=resolve)
