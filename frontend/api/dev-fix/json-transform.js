function decodeBody(body) {
  if (body == null) return null;
  if (Buffer.isBuffer(body) || body instanceof Uint8Array) return Buffer.from(body).toString("utf8");
  return String(body);
}

export async function runJsonTransform(handler, req, res, transform) {
  return await new Promise((resolve, reject) => {
    let ended = false;
    const proxy = Object.create(res);

    proxy.setHeader = (...args) => res.setHeader(...args);
    proxy.getHeader = (...args) => res.getHeader?.(...args);
    proxy.removeHeader = (...args) => res.removeHeader?.(...args);
    proxy.end = (body) => {
      if (ended) return;
      ended = true;
      const statusCode = Number(proxy.statusCode || res.statusCode || 200);
      const raw = decodeBody(body);
      let parsed = null;

      try {
        parsed = raw ? JSON.parse(raw) : null;
      } catch {
        res.statusCode = statusCode;
        res.end(body);
        resolve();
        return;
      }

      Promise.resolve(transform(parsed, { statusCode, raw }))
        .then((next) => {
          res.statusCode = statusCode;
          if (next === undefined) {
            res.end(body);
          } else {
            res.setHeader("content-type", "application/json; charset=utf-8");
            res.end(JSON.stringify(next));
          }
          resolve();
        })
        .catch((error) => {
          console.error("[json-transform] response transform failed", error);
          res.statusCode = statusCode;
          res.end(body);
          resolve();
        });
    };

    Promise.resolve(handler(req, proxy)).catch(reject);
  });
}
