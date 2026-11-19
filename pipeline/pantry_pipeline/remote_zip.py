"""Read single files out of a large remote ZIP without downloading all of it.

The cijene.dev daily archive is about 200 MB and holds ~30 chains. We only
need 5 of them, so we use HTTP range requests (the server supports them) to
read the ZIP index and then only the members we need. If range requests ever
stop working, we fall back to downloading the whole file.
"""

from __future__ import annotations

import io
import logging
import shutil
import tempfile
import time
import urllib.error
import urllib.request
import zipfile
from pathlib import Path

log = logging.getLogger(__name__)

USER_AGENT = "pantry-planner-pipeline/1.0 (+https://github.com/senko/cijene-api data consumer)"


def http_get(url: str, headers: dict[str, str] | None = None, timeout: float = 60, retries: int = 3) -> bytes:
    """GET a URL with a few retries. Raises the last error if all attempts fail."""
    last: Exception | None = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, **(headers or {})})
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.read()
        except urllib.error.HTTPError as err:
            if err.code == 404:
                raise
            last = err
        except (urllib.error.URLError, TimeoutError, ConnectionError) as err:
            last = err
        time.sleep(2 * (attempt + 1))
    assert last is not None
    raise last


class HttpRangeFile(io.RawIOBase):
    """A read-only, seekable file object backed by HTTP range requests."""

    def __init__(self, url: str):
        super().__init__()
        self.url = url
        req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=60) as resp:
            if resp.headers.get("Accept-Ranges", "").lower() != "bytes":
                raise OSError("server does not support range requests")
            self.size = int(resp.headers["Content-Length"])
        self.pos = 0

    def readable(self) -> bool:
        return True

    def seekable(self) -> bool:
        return True

    def tell(self) -> int:
        return self.pos

    def seek(self, offset: int, whence: int = 0) -> int:
        if whence == 0:
            self.pos = offset
        elif whence == 1:
            self.pos += offset
        else:
            self.pos = self.size + offset
        return self.pos

    def readinto(self, buffer) -> int:  # type: ignore[override]
        n = len(buffer)
        if n == 0 or self.pos >= self.size:
            return 0
        end = min(self.pos + n, self.size) - 1
        data = http_get(self.url, headers={"Range": f"bytes={self.pos}-{end}"}, timeout=120)
        buffer[: len(data)] = data
        self.pos += len(data)
        return len(data)


def open_remote_zip(url: str, cache_dir: Path | None = None) -> zipfile.ZipFile:
    """Open a remote ZIP. Uses range requests, or downloads it as a fallback."""
    try:
        # 8 MB buffer: few, large requests are much faster than many small ones.
        raw = HttpRangeFile(url)
        return zipfile.ZipFile(io.BufferedReader(raw, buffer_size=8 << 20))
    except Exception as err:  # noqa: BLE001 - any failure means "try the slow way"
        log.warning("Range requests failed for %s (%s); downloading the whole file", url, err)
    target_dir = cache_dir or Path(tempfile.mkdtemp(prefix="pantry-zip-"))
    target_dir.mkdir(parents=True, exist_ok=True)
    target = target_dir / url.rsplit("/", 1)[-1]
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=600) as resp, open(target, "wb") as out:
        shutil.copyfileobj(resp, out, length=1 << 20)
    return zipfile.ZipFile(target)
